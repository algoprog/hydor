// Grok Build's accounts: which account the `grok` program is signed in as, signing in and out of it, and what its agent says
// of the account (its models and their efforts). Grok keeps everything in its home folder (GROK_HOME, ~/.grok): the default
// account is that folder, an added account is a folder of its own (server/accounts.ts). Sessions run over ACP
// (server/agents/acp.ts); this is only the account side, a program run for each question (`grok models` says whether it is
// signed in; `grok login --device-auth` signs in with a code, nothing to paste; its agent, started briefly, answers the rest).
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { AccountStatus, AgentUsage, LoginFlow, ModelOption, UsageWindow } from '../../shared/types.ts';
import { accountEnv } from '../accounts.ts';
import { ensureCommand } from '../clients.ts';
import { config, paths } from '../config.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { execProgram, launch } from '../platform.ts';
import { acpModelOptions, findCommand } from './acp.ts';

type Json = Record<string, any>;

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const clean = (text: string) => text.replace(ANSI, '').replace(/\r/g, '');

/** The link and the code `grok login --device-auth` prints (colours and all) while it waits for you. */
export function grokLoginPrompt(text: string): { url?: string; code?: string } {
  const t = clean(text);
  const url = /https:\/\/[^\s"'<>]+/.exec(t)?.[0].replace(/[.,;:)]+$/, '');
  // The line after "Confirm this code…", else the code the link carries.
  const after = /Confirm this code[^\n]*\n\s*(?:\n\s*)?([A-Za-z0-9]{3,}(?:-[A-Za-z0-9]{3,})+)\s*$/m.exec(t)?.[1];
  const inUrl = url ? /[?&]user_code=([A-Za-z0-9-]+)/.exec(url)?.[1] : undefined;
  return { url, code: after ?? inUrl };
}

/** What `grok models` says of the sign-in (its first line), or null when it says neither. */
export function grokSignedIn(text: string): { loggedIn: boolean; detail?: string; email?: string } | null {
  const first = clean(text)
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return null;
  if (/not (authenticated|logged in|signed in)/i.test(first)) return { loggedIn: false };
  const on = /^You are logged in with\s+(.*)$/i.exec(first);
  if (!on) return null;
  const detail = on[1].trim().replace(/[.:]$/, '') || undefined;
  return { loggedIn: true, detail, email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(detail ?? '')?.[0] };
}

/** The last lines of a program's output, for a sign-in that failed. */
const lastLines = (text: string, n = 3) =>
  clean(text)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-n)
    .join(' · ')
    .slice(0, 300);

/** Every run of grok the app makes: its own auto-updater stays off (the app updates it: Settings → Agents), unless you set it. */
function grokEnv(extra: Record<string, string>): Record<string, string> {
  const env = { ...agentBaseEnv(), ...extra };
  if (!env.GROK_DISABLE_AUTOUPDATER) env.GROK_DISABLE_AUTOUPDATER = '1';
  return env;
}

type Flow = LoginFlow & { proc?: ChildProcess; buf?: string };

// ---- plan usage: Grok's `_x.ai/billing` answer -----------------------------------------------------------------------
// The answer's exact shape is not known yet (it was written before anyone could read a signed-in one; the first read logs its
// keys: "[grok] billing shape"). So `grokUsage` looks for things by what their keys are called, anywhere in the answer, and
// when the real shape is seen, this is the one place to make exact.

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A number from a number, a numeric string, or a wrapper such as `{ val: "1250" }`. */
function numOf(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return /^\s*-?\d+(\.\d+)?\s*$/.test(v) ? Number(v) : null;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of ['val', 'value', 'amount', 'cents', 'units', 'usd']) if (k in v) return numOf((v as Json)[k]);
  }
  return null;
}

/** Money in dollars: a key that says cents is divided by 100, any other is taken as dollars. */
const dollarsOf = (v: unknown, key: string): number | null => {
  const n = numOf(v);
  return n == null ? null : Math.round((/cents?$/.test(key) ? n / 100 : n) * 100) / 100;
};

/** A time in ms: epoch seconds or ms, an ISO date, or a `{ seconds, nanos }` timestamp. */
function msOf(v: unknown): number | null {
  if (typeof v === 'number') return v > 1e12 ? v : v > 1e8 ? v * 1000 : null;
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) return msOf(Number(v));
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (v && typeof v === 'object' && 'seconds' in v) return msOf(numOf((v as Json).seconds));
  return null;
}

const PAYG = /(payg|payasyougo|ondemand|overage|spendingcap|spendcap|spendinglimit|usagebased)/;
const PERCENT = /(percent|pct|utili[sz]ation|ratio|fraction)/;
const USED = /^(used|spent|consumed|usage|currentusage|usedamount|usedcredits|totalused|amountused|usedcents|usedusd)$/;
const LIMIT = /(limit|cap|allowance|quota|included|budget|max)/;
const END = /(^end$|(periodend|cycleend|endsat|endat|endtime|enddate|resetsat|resetat|resettime|nextreset\w*|renewsat|renewal\w*|expiresat)$)/;
const START = /(^start$|(periodstart|cyclestart|startsat|startat|starttime|startdate)$)/;
/** Objects that hold a period's start and end beside the usage (a billing cycle). */
const CYCLE = /(cycle|period|reset|renew|week|month)/;

/** The plan's name as people say it: Grok's tier codes (SUPER_GROK_HEAVY…) or names, tidied. */
function planName(v: string): string {
  const t = v.replace(/^(subscription[_ ]?tier|tier|plan)[_ ]?/i, '').trim();
  if (/heavy/i.test(t)) return 'SuperGrok Heavy';
  if (/super[_ ]?grok[_ ]?plus|grok[_ ]?plus/i.test(t)) return 'SuperGrok Plus';
  if (/super[_ ]?grok/i.test(t)) return 'SuperGrok';
  return /^[A-Z0-9_]+$/.test(t) ? t.toLowerCase().replace(/(^|_)(\w)/g, (_m, a, c) => (a ? ' ' : '') + c.toUpperCase()) : t;
}

/**
 * Grok Build's plan usage from its `_x.ai/billing` answer, whatever its shape (see above). Looks for:
 * - a window: an object with a percentage (a key with percent, pct, utilization, ratio or fraction), or a used amount with a
 *   limit (or what is left), outside anything about pay as you go; its reset is the nearest period end (end, resetsAt,
 *   nextReset…) in it or around it, its length the period start to that end, and it is "Weekly" (10080 minutes) or "Monthly"
 *   or "Daily" by a word in its keys or by that length, else just "Usage";
 * - credits as a balance key; pay as you go as keys under a payg, pay-as-you-go, on-demand, overage or spending-cap name
 *   (enabled, a cap or limit, used), in dollars (a key ending in cents is divided by 100);
 * - the plan as a plan, tier or subscription key (SuperGrok, SuperGrok Plus, SuperGrok Heavy);
 * - a limit reached: a window at 100%, a true "limit reached" or "exhausted" key, or a status saying so;
 * - a plan run by a team: a true "managed by team" key, as `note`.
 */
export function grokUsage(raw: Json): AgentUsage {
  type Node = { path: string[]; obj: Json; chain: Json[] };
  const nodes: Node[] = [];
  const leaves: { path: string; key: string; value: unknown; parent: string }[] = [];
  const walk = (v: unknown, path: string[], chain: Json[]) => {
    if (path.length > 7) return;
    if (Array.isArray(v)) return v.slice(0, 20).forEach((x, i) => walk(x, [...path, String(i)], chain));
    if (!v || typeof v !== 'object') return;
    const obj = v as Json;
    const here = [...chain, obj];
    nodes.push({ path, obj, chain: here });
    for (const [k, x] of Object.entries(obj)) {
      if (!x || typeof x !== 'object' || numOf(x) != null) leaves.push({ path: [...path, k].map(norm).join('.'), key: norm(k), value: x, parent: norm(path[path.length - 1] ?? '') });
      walk(x, [...path, k], here);
    }
  };
  walk(raw, [], []);

  // The nearest time under a key pattern: in the object itself, then in each one around it, and in the cycle or period
  // objects beside the usage in each.
  const near = (chain: Json[], re: RegExp): number | null => {
    const within = (o: Json) => {
      for (const [k, x] of Object.entries(o)) {
        const t = re.test(norm(k)) ? msOf(x) : null;
        if (t != null) return t;
      }
      return null;
    };
    for (let i = chain.length - 1; i >= 0; i--) {
      const t = within(chain[i]);
      if (t != null) return t;
      for (const [k, x] of Object.entries(chain[i])) {
        if (x && typeof x === 'object' && !Array.isArray(x) && CYCLE.test(norm(k))) {
          const c = within(x as Json);
          if (c != null) return c;
        }
      }
    }
    return null;
  };

  const windows: UsageWindow[] = [];
  for (const { path, obj, chain } of nodes) {
    const keys = Object.keys(obj).map(norm);
    if (PAYG.test(path.map(norm).join('.'))) continue;
    const entries = Object.entries(obj)
      .map(([k, x]) => ({ k: norm(k), x }))
      .filter((e) => !PAYG.test(e.k));
    const find = (re: RegExp, skip?: RegExp) => entries.find((e) => re.test(e.k) && !(skip && skip.test(e.k)) && numOf(e.x) != null);
    const pc = find(PERCENT);
    const used = find(USED);
    const limit = find(LIMIT, USED);
    const left = find(/^(remaining|left|available)\w*$/);
    let usedPercent: number | null = null;
    if (pc) {
      const n = numOf(pc.x)!;
      usedPercent = /(ratio|fraction)/.test(pc.k) || (/utili[sz]ation/.test(pc.k) && n <= 1 && !Number.isInteger(n)) ? n * 100 : n;
    } else if (limit && numOf(limit.x)! > 0) {
      const l = numOf(limit.x)!;
      const u = used ? numOf(used.x) : left ? l - numOf(left.x)! : null;
      if (u != null) usedPercent = (u / l) * 100;
    }
    if (usedPercent == null) continue;
    const resetsAt = near(chain, END);
    const startsAt = near(chain, START);
    const days = resetsAt && startsAt ? (resetsAt - startsAt) / 86_400_000 : null;
    const text = path.map(norm).join('.') + keys.join('.');
    const kind = /week/.test(text) ? 'weekly' : /month/.test(text) ? 'monthly' : /dail|day/.test(text) ? 'daily' : days == null ? '' : days >= 6 && days <= 8 ? 'weekly' : days >= 27 && days <= 32 ? 'monthly' : days >= 0.9 && days <= 1.1 ? 'daily' : '';
    const [id, label, windowMinutes] = kind === 'weekly' ? ['weekly', 'Weekly', 10080] : kind === 'monthly' ? ['monthly', 'Monthly', days ? Math.round(days * 1440) : null] : kind === 'daily' ? ['daily', 'Daily', 1440] : ['usage', 'Usage', days ? Math.round(days * 1440) : null];
    if (windows.some((w) => w.id === id)) continue;
    windows.push({ id: id as string, label: label as string, usedPercent: Math.max(0, Math.round(usedPercent * 10) / 10), resetsAt, windowMinutes: windowMinutes as number | null });
  }

  const under = (l: { path: string }) => PAYG.test(l.path);
  // Credits: a balance, not one of pay as you go's.
  const bal = leaves.find((l) => /^(credits?|creditbalance|creditsbalance|balance|availablecredits?|remainingcredits?|prepaidbalance)(cents|usd)?$/.test(l.key) && !under(l) && dollarsOf(l.value, l.key) != null);
  const balance = bal ? dollarsOf(bal.value, bal.key)! : null;
  const credits = balance != null ? { balance: String(balance), hasCredits: balance > 0 } : leaves.some((l) => /^unlimited/.test(l.key) && l.value === true) ? { unlimited: true } : null;

  // Pay as you go: its on/off, its cap and what it has used.
  const pay = leaves.filter(under);
  const on = pay.find((l) => typeof l.value === 'boolean' && /(enabled|active|on|payg|payasyougo|ondemand|overage)$/.test(l.key));
  const cap = pay.find((l) => LIMIT.test(l.key) && !USED.test(l.key) && dollarsOf(l.value, l.key) != null);
  const spent = pay.find((l) => /(used|spent|usage|current)/.test(l.key) && !LIMIT.test(l.key) && dollarsOf(l.value, l.key) != null);
  const monthlyLimit = cap ? dollarsOf(cap.value, cap.key) : null;
  const paid = spent ? dollarsOf(spent.value, spent.key) : null;
  const extra = on || cap ? { enabled: on ? on.value === true : true, monthlyLimit, used: paid, utilization: monthlyLimit && paid != null ? (paid / monthlyLimit) * 100 : null, currency: 'USD' } : null;

  const planLeaf = leaves.find((l) => typeof l.value === 'string' && l.value && (/^(plan|planname|plantype|plantier|tier|tiername|subscription\w*)$/.test(l.key) || (/^(plan|tier|subscription\w*)$/.test(l.parent) && /^(name|displayname|title|type|id)$/.test(l.key))));
  const plan = planLeaf ? planName(planLeaf.value as string) : undefined;

  // A limit reached: a full window, or the answer says so.
  const flagged = leaves.find((l) => l.value === true && /(limitreached|reachedlimit|limithit|hitlimit|limitexceeded|exceeded|exhausted|overlimit|capreached|outofcredits)/.test(l.path));
  const said = leaves.find((l) => typeof l.value === 'string' && /^(status|state|reason|limitstate|usagestate)$/.test(l.key) && /(limit.?reached|exceeded|exhausted|capped|limit.?hit)/i.test(l.value as string));
  const full = windows.filter((w) => (w.usedPercent ?? 0) >= 100).sort((a, b) => (b.resetsAt ?? 0) - (a.resetsAt ?? 0))[0];
  let limited: AgentUsage['limited'] = null;
  if (full) limited = { label: `${full.label} limit`, resetsAt: full.resetsAt ?? null };
  else if (flagged || said) {
    const t = flagged?.path ?? String(said?.value).toLowerCase();
    const w = windows.find((x) => x.id === 'weekly') ?? windows[0];
    limited = { label: /week/.test(t) ? 'Weekly limit' : /credit/.test(t) ? 'Credit limit' : /(spend|cap|payg)/.test(t) ? 'Spending cap' : w ? `${w.label} limit` : 'Plan limit', resetsAt: w?.resetsAt ?? null };
  }
  const team = leaves.some((l) => l.value === true && /(managedbyteam|teammanaged|managedbyorg|limitsmanaged|managedbyadmin|isteamplan|teamplan)/.test(l.path));

  const u: AgentUsage = { agent: 'grok', ok: true, fetchedAt: Date.now(), windows };
  if (plan) u.account = { plan };
  if (credits) u.credits = credits;
  if (extra) u.extra = extra;
  if (limited) u.limited = limited;
  if (team) u.note = 'Usage limits are managed by your team.';
  return u;
}

/** What Grok's agent said to `_x.ai/billing`: the usage, or why there is none (`keep`: the last numbers still stand). */
export function grokBilling(a: GrokAnswer | undefined): { usage: AgentUsage } | { error: string; keep: boolean } {
  const e = a?.error;
  if (!e) return { usage: grokUsage(a?.result ?? {}) };
  if (e.code === -32000 || /authentication|sign.?in|log.?in/i.test(`${e.message} ${e.data ?? ''}`)) return { error: "Sign in to see Grok's plan usage.", keep: false };
  if (e.code === -32601) return { error: 'This version of Grok Build does not report plan usage. Update it in Settings → Agents.', keep: false };
  return { error: `Grok Build could not read the plan usage: ${e.message}`, keep: true };
}

/** The keys and kinds of values in an answer, never the values: what the log shows of the billing answer. */
function shapeOf(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return depth > 6 ? 'array' : v.length ? [`${v.length}×`, shapeOf(v[0], depth + 1)] : [];
  if (v && typeof v === 'object') return depth > 6 ? 'object' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  return v === null ? 'null' : typeof v;
}
let shapeLogged = false;

/** A call's answer from Grok Build's agent: its result, or its error (an error is an answer too). */
export type GrokAnswer = { result?: Json; error?: { code?: number; message: string; data?: unknown } };

/**
 * Asks Grok Build's agent about the account rather than a session (its models, its plan's billing): starts
 * `grok agent --no-leader stdio` for a moment, initializes it, makes each call in turn and stops it. `extraEnv` points it at an
 * added account (GROK_HOME). Throws when grok is not installed, does not start, or takes longer than `timeoutMs`.
 */
export async function grokAsk(extraEnv: Record<string, string>, calls: { method: string; params?: Json }[], timeoutMs = 30_000): Promise<{ init: Json; results: GrokAnswer[] }> {
  const env = grokEnv(extraEnv);
  const bin = findCommand('grok', env);
  if (!bin) throw new Error('Grok Build is not installed');
  fs.mkdirSync(paths.probe, { recursive: true });
  const run = launch(bin, ['agent', '--no-leader', 'stdio'], env);
  const proc = spawn(run.cmd, run.args, { cwd: paths.probe, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const waiting = new Map<number, (m: Json) => void>();
  let buf = '';
  proc.stdout!.on('data', (d: Buffer) => {
    buf += d.toString('utf8');
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        // Answers only: the agent's own notes and requests (session setup, MCP servers) are not ours to answer here.
        if (m.id != null && !m.method) waiting.get(Number(m.id))?.(m);
      } catch {}
    }
  });
  proc.stdin!.on('error', () => {});
  const gone = new Promise<never>((_, reject) => {
    proc.on('error', reject);
    proc.on('exit', () => reject(new Error('Grok Build stopped before it answered')));
  });
  gone.catch(() => {});
  let next = 1;
  const call = (method: string, params: Json = {}) =>
    Promise.race([
      new Promise<Json>((resolve) => {
        const id = next++;
        waiting.set(id, resolve);
        proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      }),
      gone,
    ]);
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Grok Build did not answer in time')), timeoutMs);
  });
  late.catch(() => {});
  const work = async () => {
    const init = await call('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'hydor', title: 'Hydor', version: config.version } });
    if (init.error) throw new Error(String(init.error.message ?? 'Grok Build did not start'));
    const results: GrokAnswer[] = [];
    for (const c of calls) {
      const r = await call(c.method, c.params);
      results.push(r.error ? { error: { code: r.error.code, message: String(r.error.message ?? 'error'), data: r.error.data } } : { result: r.result ?? {} });
    }
    return { init: init.result ?? {}, results };
  };
  try {
    return await Promise.race([work(), late]);
  } finally {
    clearTimeout(timer);
    proc.kill();
  }
}

/** Account calls for one Grok Build account: its sign-in status, signing in with a device code, and signing out. */
export class GrokControl extends EventEmitter {
  /** `extraEnv` points it at an added account (GROK_HOME); none for the default one. */
  constructor(private extraEnv: Record<string, string> = {}) {
    super();
  }
  flows = new Map<string, Flow>();
  private modelsKept?: { at: number; models: ModelOption[] };
  /** The last reading of the plan's usage (also one that failed), and the last that worked. */
  lastUsage: AgentUsage | null = null;
  private lastGood: AgentUsage | null = null;
  private reading?: Promise<AgentUsage>;

  /**
   * The plan's usage, as Grok's agent answers `_x.ai/billing` (it starts for a second: do not call it often). Signed out or
   * not installed is an answer in plain words, not a throw; a read that fails for another reason keeps the last numbers.
   */
  usage(): Promise<AgentUsage> {
    return (this.reading ??= this.readUsage().finally(() => (this.reading = undefined)));
  }

  private async readUsage(): Promise<AgentUsage> {
    const fetchedAt = Date.now();
    const fail = (error: string, keep = false): AgentUsage => {
      const u: AgentUsage = keep && this.lastGood ? { ...this.lastGood, ok: false, error, fetchedAt } : { agent: 'grok', ok: false, error, fetchedAt, windows: [] };
      if (!keep) this.lastGood = null;
      return (this.lastUsage = u);
    };
    try {
      const a = (await grokAsk(this.extraEnv, [{ method: '_x.ai/billing', params: {} }])).results[0];
      const b = grokBilling(a);
      if ('error' in b) return fail(b.error, b.keep);
      if (!shapeLogged) {
        shapeLogged = true;
        console.warn('[grok] billing shape', JSON.stringify(shapeOf(a?.result ?? {})));
      }
      return (this.lastUsage = this.lastGood = { ...b.usage, fetchedAt });
    } catch (e) {
      const m = (e as Error).message;
      return fail(/not installed/i.test(m) ? 'Grok Build is not installed yet: it installs itself the first time you sign in or start a session.' : `Grok Build could not read the plan usage: ${m}`, !/not installed/i.test(m));
    }
  }

  /**
   * Grok Build's models for this account, each with the efforts it takes, as its agent lists them (before any session:
   * the start page's pickers). Kept ten minutes; a sign-in or sign-out forgets them, since the list depends on it.
   */
  async models(): Promise<ModelOption[]> {
    if (this.modelsKept && Date.now() - this.modelsKept.at < 10 * 60_000) return this.modelsKept.models;
    const { init, results } = await grokAsk(this.extraEnv, [{ method: '_x.ai/models/list' }]);
    const listed = results[0]?.result;
    const models = acpModelOptions(Array.isArray(listed?.availableModels) ? listed : init._meta?.modelState);
    this.modelsKept = { at: Date.now(), models };
    return models;
  }

  /** Whether grok is signed in here, from `grok models` (a quick call that needs no model turn). */
  async account(): Promise<AccountStatus> {
    const env = grokEnv(this.extraEnv);
    const bin = findCommand('grok', env);
    if (!bin) return { agent: 'grok', loggedIn: false, error: 'Grok Build is not installed yet: it installs itself the first time you sign in or start a session.' };
    fs.mkdirSync(paths.probe, { recursive: true });
    const r = await new Promise<{ out: string; err?: Error }>((resolve) => {
      execProgram(bin, ['models'], { env, cwd: paths.probe, timeout: 20_000, maxBuffer: 4 << 20 }, (err, stdout, stderr) => resolve({ out: `${stdout}\n${stderr}`, err: err ?? undefined }));
    });
    const s = grokSignedIn(r.out);
    if (s) return { agent: 'grok', loggedIn: s.loggedIn, email: s.email, method: s.loggedIn ? 'Grok' : undefined, detail: s.detail };
    return {
      agent: 'grok',
      loggedIn: false,
      error: r.err ? `Could not ask Grok Build about its sign-in: ${lastLines(r.out) || r.err.message}` : `Grok Build did not say whether it is signed in: ${lastLines(r.out, 1) || 'no output'}`,
    };
  }

  /** `grok login --device-auth`: the link and the code to confirm, then it waits for the approval. */
  async startLogin(): Promise<LoginFlow> {
    // Signing in needs Grok Build: installed now when it is not here.
    const bin = (await ensureCommand('grok')) ?? 'grok';
    for (const f of this.flows.values()) if (f.proc && (f.state === 'waiting' || f.state === 'starting')) this.cancelLogin(f.id);
    const id = crypto.randomBytes(8).toString('hex');
    const flow: Flow = { id, agent: 'grok', method: 'device', state: 'starting', buf: '' };
    this.flows.set(id, flow);
    fs.mkdirSync(paths.probe, { recursive: true });
    // The program is not asked to open a browser on this computer: the page shows the link.
    const env = { ...grokEnv(this.extraEnv), BROWSER: 'true' };
    const run = launch(bin, ['login', '--device-auth'], env);
    const proc = spawn(run.cmd, run.args, { cwd: paths.probe, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    flow.proc = proc;
    const onData = (d: Buffer) => {
      flow.buf = ((flow.buf ?? '') + d.toString('utf8')).slice(-100_000);
      const p = grokLoginPrompt(flow.buf);
      let changed = false;
      if (p.url && !flow.url) {
        flow.url = p.url;
        flow.state = 'waiting';
        flow.message = 'Open the link, sign in to your Grok account and confirm the code.';
        changed = true;
      }
      if (p.code && !flow.code) {
        flow.code = p.code;
        changed = true;
      }
      if (changed) this.emit('flow', flow);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const finish = (ok: boolean, why?: string) => {
      if (!flow.proc) return;
      flow.proc = undefined;
      if (flow.state === 'cancelled') return;
      flow.state = ok ? 'done' : 'failed';
      if (ok) flow.message = 'Signed in to Grok';
      else {
        flow.message = undefined;
        flow.error = lastLines(flow.buf ?? '') || why || 'Sign-in failed';
      }
      this.emit('flow', flow);
      if (ok) {
        this.modelsKept = undefined;
        this.lastUsage = this.lastGood = null;
        this.emit('account');
      }
    };
    proc.on('error', (e) => finish(false, e.message));
    proc.on('close', (code) => finish(code === 0, `grok stopped with code ${code}`));
    // Wait briefly for the link (and the code that comes with it) so the first response already has them.
    const sleep = () => new Promise((r) => setTimeout(r, 100));
    for (let i = 0; i < 60 && flow.proc && !flow.url; i++) await sleep();
    for (let i = 0; i < 5 && flow.proc && flow.url && !flow.code; i++) await sleep();
    return flow;
  }

  cancelLogin(flowId: string) {
    const flow = this.flows.get(flowId);
    if (!flow) return;
    if (flow.state === 'done' || flow.state === 'failed' || flow.state === 'cancelled') return;
    flow.state = 'cancelled';
    flow.proc?.kill();
    flow.proc = undefined;
    this.emit('flow', flow);
  }

  /** Cancels the sign-in that is running, if there is one. */
  cancelAll() {
    for (const f of this.flows.values()) if (f.state === 'waiting' || f.state === 'starting' || f.state === 'verifying') this.cancelLogin(f.id);
  }

  async logout() {
    const env = grokEnv(this.extraEnv);
    const bin = findCommand('grok', env);
    if (bin) {
      fs.mkdirSync(paths.probe, { recursive: true });
      await new Promise<void>((resolve) => execProgram(bin, ['logout'], { env, cwd: paths.probe, timeout: 20_000 }, () => resolve()));
    }
    this.modelsKept = undefined;
    this.lastUsage = this.lastGood = null;
    this.emit('account');
  }
}

/** Every Grok sign-in's progress (the default account's and the added ones'), for the page. */
export const grokFlows = new EventEmitter();

const controls = new Map<string, GrokControl>();

/** The control of a Grok Build account: the program's own (none), or an added one by its id. */
export function grokControl(db: DB, account?: string | null): GrokControl {
  const key = account || '';
  let c = controls.get(key);
  if (!c) {
    c = new GrokControl(key ? accountEnv(db, 'grok', key) : {});
    c.on('flow', (f: LoginFlow) => grokFlows.emit('flow', f));
    controls.set(key, c);
  }
  return c;
}

/** An added account was removed: a sign-in that runs for it stops, and its control goes. */
export function dropGrokControl(id: string) {
  controls.get(id)?.cancelAll();
  controls.delete(id);
}
