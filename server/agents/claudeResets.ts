// Claude limit resets, the ones the CLI offers in /rate-limit-options: the plan's usage read lists
// reset grants, and a grant is claimed by id. The CLI's stream-json control protocol has neither, so
// these are the CLI's own two calls, made with its stored claude.ai sign-in. The token is never
// refreshed here (a refresh rotates it under the running CLIs): a stale one is renewed by asking the
// CLI for usage first, which refreshes it the CLI's way.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LimitReset } from '../../shared/types.ts';
import { config } from '../config.ts';

type Json = Record<string, any>;

const API = 'https://api.anthropic.com';
const GRANT_ID = /^[a-z0-9_-]{1,40}$/;
const ORG_ID = /^[0-9a-f-]{36}$/;
/** The older program: one reset a week, offered at the limit. */
const WEEKLY = 'juniper_tide';

// An added account's folder (CLAUDE_CONFIG_DIR of its CLI), or the default account's.
const configDir = (dir?: string) => dir ?? process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');

function readJson(file: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** The CLI's claude.ai access token, while it is good for another minute. */
function token(dir?: string): string | null {
  const o = readJson(path.join(configDir(dir), '.credentials.json'))?.claudeAiOauth;
  if (!o?.accessToken || (o.expiresAt && o.expiresAt - Date.now() < 60_000)) return null;
  return String(o.accessToken);
}

/** The claude.ai account the CLI signed in with (~/.claude.json). */
export function claudeOauthAccount(dir?: string): Json | null {
  const d = dir ?? process.env.CLAUDE_CONFIG_DIR;
  const file = d ? path.join(d, '.claude.json') : path.join(os.homedir(), '.claude.json');
  return readJson(file)?.oauthAccount ?? null;
}

function orgId(dir?: string): string | null {
  const id = claudeOauthAccount(dir)?.organizationUuid;
  return typeof id === 'string' && ORG_ID.test(id) ? id : null;
}

/** Resets are offered to the CLI, which the API tells by its user agent. */
function userAgent(): string {
  let v = '';
  try {
    v = path.basename(fs.realpathSync(config.claudeBin)).match(/^\d+\.\d+\.\d+/)?.[0] ?? '';
  } catch {}
  return `claude-cli/${v || '2.1.0'} (external, cli)`;
}

async function signedIn(renew: () => Promise<unknown>, dir?: string): Promise<string | null> {
  const t = token(dir);
  if (t) return t;
  await renew().catch(() => {});
  return token(dir);
}

async function call(method: 'GET' | 'POST', url: string, tok: string, body?: Json): Promise<{ status: number; json: Json | null }> {
  const r = await fetch(API + url, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'anthropic-beta': 'oauth-2025-04-20', 'Content-Type': 'application/json', 'User-Agent': userAgent() },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  let json: Json | null = null;
  try {
    json = (await r.json()) as Json;
  } catch {}
  return { status: r.status, json };
}

const when = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : undefined);

/** The plan's limits by the usage read's keys, for saying which one holds a reset back. */
const LIMITS: Record<string, string> = { five_hour: 'session', seven_day: 'weekly', seven_day_opus: 'weekly Opus', seven_day_sonnet: 'weekly Sonnet' };

/** Why a grant cannot be used now, and when the limit holding it back lifts. */
function holdUp(g: Json, json: Json): { note: string; usableAt?: number } {
  if (g.use_requires_limit) return { note: 'Works once you hit a limit' };
  const blocking: string[] = Array.isArray(g.blocking) ? g.blocking.map(String) : [];
  const key = blocking[0] ?? String(g.unavailable_reason ?? '').match(/^blocked_(.+)$/)?.[1];
  if (key) return { note: `Blocked while your ${LIMITS[key] ?? key.replace(/_/g, ' ')} limit is used up`, usableAt: when(json[key]?.resets_at) };
  const starts = when(g.starts_at);
  return { note: 'Not usable yet', usableAt: starts && starts > Date.now() ? starts : undefined };
}

export interface ClaudeResets {
  items: LimitReset[];
  available: number;
  nextAvailableAt?: number;
  cooldownUntil?: number;
  atLimit: boolean;
}

/** The resets this account holds, or null when Claude Code is not signed in with claude.ai. */
export async function claudeResets(renew: () => Promise<unknown>, dir?: string): Promise<ClaudeResets | null> {
  const tok = await signedIn(renew, dir);
  if (!tok) return null;
  const { status, json } = await call('GET', '/api/oauth/usage?at_wall=1&cedar_ember=1&skip_spend=1', tok);
  if (status !== 200 || !json) throw new Error(`Claude usage read failed (HTTP ${status})`);
  const items: LimitReset[] = [];
  const ce: Json = json.cedar_ember ?? {};
  for (const g of Array.isArray(ce.grants) ? (ce.grants as Json[]) : []) {
    if (!(g.resets_left > 0) || g.paused || !GRANT_ID.test(String(g.id))) continue;
    items.push({
      id: String(g.id),
      title: g.label || (g.type === 'weekly' ? 'Weekly limit reset' : g.type === 'session' ? 'Session limit reset' : 'Limit reset'),
      left: g.resets_left,
      expiresAt: when(g.ends_at),
      usableNow: !!g.usable_now,
      ...(g.usable_now ? {} : holdUp(g, json)),
    });
  }
  const jt: Json = json.juniper_tide ?? {};
  if (jt.available) items.push({ id: WEEKLY, title: 'Weekly limit reset', left: 1, usableNow: true });
  return {
    items,
    available: items.reduce((n, i) => n + (i.left ?? 1), 0),
    nextAvailableAt: when(jt.next_available_at),
    cooldownUntil: when(ce.cooldown_until),
    atLimit: !!ce.at_limit,
  };
}

const OUTCOMES: Record<string, string> = {
  reset: 'Claude usage limits are reset.',
  already_used: 'That reset was already used.',
  not_limited: 'Claude is not at a usage limit right now, so nothing was reset.',
  cooldown: 'Resets are cooling down. Try again later.',
  ineligible: 'This reset is not available to this account.',
  unavailable: 'This reset is not available right now.',
};

export async function claimClaudeReset(id: string, renew: () => Promise<unknown>, dir?: string): Promise<{ outcome: string; message: string }> {
  const body = id === WEEKLY ? { program: WEEKLY } : GRANT_ID.test(id) ? { program: 'cedar_ember', grant_id: id, request_id: crypto.randomUUID() } : null;
  if (!body) return { outcome: 'error', message: 'Unknown reset.' };
  const org = orgId(dir);
  const tok = await signedIn(renew, dir);
  if (!org || !tok) return { outcome: 'error', message: 'Claude Code is not signed in with a claude.ai account.' };
  const { status, json } = await call('POST', `/api/organizations/${org}/reset_rate_limits`, tok, body);
  if (status === 429) return { outcome: 'error', message: 'Too many attempts. Try again in a minute.' };
  if (status === 401 || status === 403) return { outcome: 'error', message: 'Claude did not accept the sign-in. Sign in again in Settings.' };
  if (status < 200 || status >= 300) return { outcome: 'error', message: `Claude could not use the reset (HTTP ${status}).` };
  const outcome = String(json?.result ?? 'unavailable');
  return { outcome: outcome === 'not_limited' ? 'nothing_to_reset' : outcome, message: OUTCOMES[outcome] ?? OUTCOMES.unavailable };
}
