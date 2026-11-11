// Claude limit resets, the ones the CLI offers in /rate-limit-options: the plan's usage read lists
// reset grants, and a grant is claimed by id. The CLI's stream-json control protocol has neither, so
// these are the CLI's own two calls, made with its stored claude.ai sign-in (on a Mac in the login
// Keychain, elsewhere in .credentials.json). The token is never refreshed here (a refresh rotates it
// under the running CLIs): a stale one is renewed by asking the CLI for usage first, which refreshes
// it the CLI's way.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentUsage, LimitReset } from '../../shared/types.ts';
import { config } from '../config.ts';

type Json = Record<string, any>;

/**
 * How often the resets are read: they change seldom, and Anthropic refuses reads that come too often (HTTP 429), so a
 * read with every usage refresh (every two minutes on an open page, more while a session waits out a limit) lost
 * them. After a refusal the next read waits longer each time, up to `longest`. Tests shorten these.
 */
export const resetReads = { every: 10 * 60_000, longest: 60 * 60_000 };

type Kept = NonNullable<AgentUsage['resetCredits']>;
const keptFile = (dir?: string) => path.join(config.dataDir, 'usage', `claude-resets-${dir ? crypto.createHash('sha256').update(dir).digest('hex').slice(0, 12) : 'default'}.json`);

/** The resets as last read for this config folder, kept on disk so that a restart shows them before its first read: expired ones left out, none after three days. */
export function keptResets(dir?: string): Kept | undefined {
  try {
    const k = JSON.parse(fs.readFileSync(keptFile(dir), 'utf8'));
    if (!(Date.now() - k.at < 3 * 86400_000) || !Array.isArray(k.resetCredits?.items)) return undefined;
    const items = (k.resetCredits.items as LimitReset[]).filter((i) => !i.expiresAt || i.expiresAt > Date.now());
    return { ...k.resetCredits, items, available: items.reduce((n, i) => n + (i.left ?? 1), 0) };
  } catch {
    return undefined;
  }
}

export function keepResets(dir: string | undefined, rc: Kept): void {
  try {
    const f = keptFile(dir);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ at: Date.now(), resetCredits: rc }));
  } catch {}
}

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

/** The name Claude Code files its Keychain items under: your user name, as it reads it. */
function keychainAccount(): string {
  let user = '';
  try {
    user = process.env.USER || os.userInfo().username;
  } catch {}
  return /^[a-zA-Z0-9._-]+$/.test(user) ? user : 'claude-code-user';
}

/**
 * The Keychain item that holds a config folder's sign-in, named as Claude Code names it: "Claude Code-credentials",
 * then for a folder other than the default (CLAUDE_CONFIG_DIR, as an added account has) the first 8 hex digits of
 * its path's SHA-256.
 */
export function keychainService(dir?: string): string {
  const store = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR;
  const own = store !== undefined ? store : (dir ?? process.env.CLAUDE_CONFIG_DIR);
  return `Claude Code-credentials${own ? `-${crypto.createHash('sha256').update(own.normalize('NFC')).digest('hex').slice(0, 8)}` : ''}`;
}

/** A Keychain item's JSON, read with the same command Claude Code uses; null when there is none. */
function keychainJson(service: string): Promise<Json | null> {
  return new Promise((resolve) =>
    execFile('/usr/bin/security', ['find-generic-password', '-a', keychainAccount(), '-w', '-s', service], { timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve(null);
      try {
        resolve(JSON.parse(String(stdout).trim()));
      } catch {
        resolve(null);
      }
    }),
  );
}

/**
 * The CLI's claude.ai access token, while it is good for another minute. On a Mac, Claude Code keeps it in the login
 * Keychain and reads it from there first; a .credentials.json beside it is one it no longer renews.
 */
async function token(dir?: string): Promise<string | null> {
  const mac = process.platform === 'darwin' ? (await keychainJson(keychainService(dir)))?.claudeAiOauth : null;
  const o = mac?.accessToken ? mac : readJson(path.join(configDir(dir), '.credentials.json'))?.claudeAiOauth;
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
  const t = await token(dir);
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
