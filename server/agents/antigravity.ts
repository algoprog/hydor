// Antigravity CLI's sign-in: which Google account the `agy` program is signed in as, signing in and out of it, and what its
// sessions say of the plan. It has ONE sign-in only: Google's terms for its consumer plans (Google AI Plus, Pro and Ultra, and
// the free plan) rule out switching between accounts, running it in the background or on a schedule, and turns that nobody
// asked for, so there are no added accounts, nothing here starts the program by itself, and the plan's usage is never read from it
// (it shows that with /usage in its own terminal). Sessions run over ACP (server/agents/acp.ts); this is only the account
// side, and the one run a question needs: `agy models` says whether it is signed in, `agy acp --login` signs in (a link to
// open, then the code Google's page shows pasted back here), and its ACP `logout` method signs out. The app does not install
// it: people do, with Google's own installer (Settings → Agents → More agents shows the command).
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { AccountStatus, AgentUsage, LoginFlow, ModelOption } from '../../shared/types.ts';
import { accountEnv } from '../accounts.ts';
import { config, paths } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { execProgram, launch } from '../platform.ts';
import { HttpError } from '../auth.ts';
import { findCommand } from './acp.ts';

type Json = Record<string, any>;

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
const clean = (text: string) => text.replace(ANSI, '').replace(/\r/g, '');

const NOT_INSTALLED = 'Antigravity CLI is not installed: install it with Google’s installer (Settings → Agents → More agents shows the command).';
const SIGN_IN_FIRST = 'Sign in to Antigravity CLI in Settings → Agents → Accounts.';
const USAGE_NOTE = 'Antigravity CLI shows how much of your plan is left with /usage in its own terminal.';

/** Where the sign-in is kept: who it is and the plan, as far as they are known (agy keeps the credentials itself). */
const SAVED_KEY = 'antigravity_signin';
/** How long the answer to "is it signed in" stands (a sign-in or sign-out forgets it). */
const KEEP_MS = 60_000;
/** A sign-in that nobody finishes is stopped after this. */
const LOGIN_MS = 15 * 60_000;
/** A limit noted without a time it lifts is forgotten after this. */
const LIMIT_MS = 6 * 3600_000;

/** What `agy acp --login` prints while it waits: Google's link, and whether it asks for the code yet (colours and CRLF too). */
export function agyLoginPrompt(text: string): { url?: string; asks: boolean } {
  const t = clean(text);
  // Only a link that is complete (a line break or a space follows): output arrives in pieces, and half of it is no link.
  const url = /https:\/\/accounts\.google\.com\/[^\s"'<>]+(?=\s)/.exec(t)?.[0];
  return { url, asks: /paste the authorization code[^\n]*press enter/i.test(t) };
}

/** Who `agy acp --login` says it signed in as ("Logged in as <email>"), when it says. */
export function agyLoggedInAs(text: string): string | undefined {
  const line = /Logged in as[ \t]+([^\n]*)/i.exec(clean(text))?.[1].trim();
  if (!line) return undefined;
  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(line)?.[0];
  return email ?? line.replace(/[.,;:]+$/, '');
}

/**
 * Whether `agy models` says it is signed in: true when it lists models (exit code 0), false for the ways it says it is not
 * ("Please sign in to view available models", "Authentication required", "You are not logged into Antigravity", "stored
 * credentials are expired or revoked", "Authentication expired"), null when it cannot tell.
 */
export function agySignedIn(text: string, exitCode: number): boolean | null {
  const t = clean(text);
  if (/please sign in|sign in to view|authentication (?:required|expired)|not (?:logged|signed) (?:in|into)|log back in|credentials (?:are |have )?(?:expired|revoked)|expired or revoked|unauthori[sz]ed/i.test(t)) return false;
  if (exitCode !== 0 && /\b401\b/.test(t)) return false;
  return exitCode === 0 ? true : null;
}

/** The plan's name as people say it, from a session's tier: a string id, or an object with a name, display name, title or id. */
export function antigravityPlanName(tier: unknown): string | undefined {
  const given =
    typeof tier === 'string'
      ? [tier]
      : tier && typeof tier === 'object' && !Array.isArray(tier)
        ? ['name', 'displayName', 'display_name', 'title', 'id'].map((k) => (tier as Json)[k]).filter((v): v is string => typeof v === 'string')
        : [];
  const names = given.map((s) => s.trim()).filter(Boolean);
  if (!names.length) return undefined;
  const all = names.join(' ');
  if (/ultra/i.test(all)) return 'Google AI Ultra';
  if (/plus/i.test(all)) return 'Google AI Plus';
  if (/pro/i.test(all)) return 'Google AI Pro';
  if (/free/i.test(all)) return 'Free';
  const name = names[0].slice(0, 60);
  // An id (SNAKE_CASE, kebab-case or lower case with underscores) reads as words; a name people wrote stays as it is.
  if (/\s/.test(name) || !/^[A-Za-z0-9_-]+$/.test(name) || !(/[_-]/.test(name) || name === name.toUpperCase() || name === name.toLowerCase())) return name;
  return name
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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

/** The keys and kinds of values in a tier, never the values: what the log shows of its shape. */
function shapeOf(v: unknown, depth = 0): unknown {
  if (Array.isArray(v)) return depth > 4 ? 'array' : v.length ? [`${v.length}×`, shapeOf(v[0], depth + 1)] : [];
  if (v && typeof v === 'object') return depth > 4 ? 'object' : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
  return v === null ? 'null' : typeof v;
}
let shapeLogged = false;

/** A call's answer from Antigravity CLI's agent: its result, or its error (an error is an answer too). */
export type AgyAnswer = { result?: Json; error?: { code?: number; message: string; data?: unknown } };

/**
 * Asks Antigravity CLI's agent something that is not about a session (signing out): starts `agy acp` for a moment, initializes
 * it, makes each call in turn and stops it. `env` is the environment it runs in. Throws when agy is not installed, does not start,
 * or takes longer than `timeoutMs`; an error the agent answers a call with is an answer.
 */
export async function agyAsk(env: Record<string, string>, calls: { method: string; params?: Json }[], timeoutMs = 20_000): Promise<{ init: Json; results: AgyAnswer[] }> {
  const bin = findCommand('agy', env);
  if (!bin) throw new Error('Antigravity CLI is not installed');
  fs.mkdirSync(paths.probe, { recursive: true });
  const run = launch(bin, ['acp'], env);
  const proc = spawn(run.cmd, run.args, { cwd: paths.probe, env, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const waiting = new Map<number, (m: Json) => void>();
  let buf = '';
  proc.stdout!.on('data', (d: Buffer) => {
    buf += d.toString('utf8');
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      try {
        const m = JSON.parse(line);
        // Answers only: the agent's own notes and requests are not ours to answer here.
        if (m.id != null && !m.method) waiting.get(Number(m.id))?.(m);
      } catch {}
    }
  });
  proc.stdin!.on('error', () => {});
  const gone = new Promise<never>((_, reject) => {
    proc.on('error', reject);
    proc.on('exit', () => reject(new Error('Antigravity CLI stopped before it answered')));
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
    timer = setTimeout(() => reject(new Error('Antigravity CLI did not answer in time')), timeoutMs);
  });
  late.catch(() => {});
  const work = async () => {
    const init = await call('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: 'hydor', title: 'Hydor', version: config.version } });
    if (init.error) throw new Error(String(init.error.message ?? 'Antigravity CLI did not start'));
    const results: AgyAnswer[] = [];
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

type Flow = LoginFlow & { proc?: ChildProcess; buf?: string; timer?: NodeJS.Timeout; expired?: boolean };

const ended = (f: Flow) => f.state === 'done' || f.state === 'failed' || f.state === 'cancelled';

/**
 * Antigravity CLI's one sign-in: whether `agy` is signed in, signing in with a link and a pasted code, signing out, and what
 * sessions have said of the plan. The program is only ever started for a question the person asked (the sign-in check, a
 * sign-in, a sign-out), never to read usage.
 */
export class AntigravityControl extends EventEmitter {
  constructor(private db: DB) {
    super();
  }
  flows = new Map<string, Flow>();
  /** What the usage says: nothing from the program, only what the last sign-in check and the sessions have said. */
  lastUsage: AgentUsage | null = null;

  /** The answer to "is it signed in", kept for a minute; `gen` changes when it is forgotten, so a check that was running does not bring it back. */
  private kept?: { at: number; status: AccountStatus };
  private asking?: Promise<AccountStatus>;
  private gen = 0;
  /** The last answer whatever its age: usage() says to sign in when it was signed out. */
  private last?: AccountStatus;
  private limit?: { label: string; resetsAt?: number | null; at: number };

  private saved(): { email?: string; plan?: string } {
    try {
      const j = JSON.parse(kvGet(this.db, SAVED_KEY) ?? '{}');
      return { ...(typeof j.email === 'string' && j.email ? { email: j.email } : {}), ...(typeof j.plan === 'string' && j.plan ? { plan: j.plan } : {}) };
    } catch {
      return {};
    }
  }
  private save(s: { email?: string; plan?: string }) {
    kvSet(this.db, SAVED_KEY, JSON.stringify(s));
  }
  private forgetSaved() {
    this.db.prepare('delete from kv where k = ?').run(SAVED_KEY);
  }
  private forgetAnswers() {
    this.gen++;
    this.kept = this.last = undefined;
  }

  /** The email this sign-in was last seen with, to name it in notes. */
  get email(): string | undefined {
    return this.saved().email;
  }

  /** Whether agy is signed in, from `agy models` (a quick call that needs no model turn), kept for a minute. */
  account(): Promise<AccountStatus> {
    if (this.kept && Date.now() - this.kept.at < KEEP_MS) return Promise.resolve(this.kept.status);
    return (this.asking ??= this.ask().finally(() => (this.asking = undefined)));
  }

  private async ask(): Promise<AccountStatus> {
    const gen = this.gen;
    const env = { ...agentBaseEnv() };
    const bin = findCommand('agy', env);
    if (!bin) return { agent: 'antigravity', loggedIn: false, error: NOT_INSTALLED };
    fs.mkdirSync(paths.probe, { recursive: true });
    const r = await new Promise<{ out: string; code: number; err?: Error }>((resolve) => {
      execProgram(bin, ['models'], { env, cwd: paths.probe, timeout: 30_000, maxBuffer: 4 << 20 }, (err, stdout, stderr) =>
        resolve({ out: `${stdout}\n${stderr}`, code: err ? (typeof err.code === 'number' ? err.code : -1) : 0, err: err ?? undefined }),
      );
    });
    const signedIn = agySignedIn(r.out, r.code);
    if (signedIn === null) return { agent: 'antigravity', loggedIn: false, error: `Could not ask Antigravity CLI about its sign-in: ${lastLines(r.out) || r.err?.message || 'no answer'}` };
    let status: AccountStatus;
    if (signedIn) {
      const s = this.saved();
      status = { agent: 'antigravity', loggedIn: true, ...(s.email ? { email: s.email } : {}), ...(s.plan ? { plan: s.plan } : {}), method: 'Google' };
    } else {
      status = { agent: 'antigravity', loggedIn: false };
      this.forgetSaved();
    }
    if (gen === this.gen) {
      // Signed in or out since the usage was last read: the next reading says so (it is kept a few minutes otherwise).
      if (this.last?.loggedIn !== status.loggedIn) this.lastUsage = null;
      this.kept = { at: Date.now(), status };
      this.last = status;
    }
    return status;
  }

  /**
   * What the usage card shows. It never starts agy (Google's guidance for its plans: no calls in the background), so there are
   * no windows: the sign-in as last seen, a limit a session ran into while it lasts, and where the program shows the rest.
   */
  async usage(): Promise<AgentUsage> {
    const fetchedAt = Date.now();
    if (this.last && !this.last.loggedIn && !this.last.error) return (this.lastUsage = { agent: 'antigravity', ok: false, error: SIGN_IN_FIRST, fetchedAt, windows: [] });
    const s = this.saved();
    const l = this.limit;
    let limited: AgentUsage['limited'] = null;
    if (l && (l.resetsAt != null ? l.resetsAt > fetchedAt : fetchedAt - l.at < LIMIT_MS)) limited = { label: l.label, resetsAt: l.resetsAt ?? null };
    else this.limit = undefined;
    const account = { ...(s.email ? { email: s.email } : {}), ...(s.plan ? { plan: s.plan } : {}) };
    return (this.lastUsage = { agent: 'antigravity', ok: true, fetchedAt, windows: [], ...(Object.keys(account).length ? { account } : {}), note: USAGE_NOTE, limited });
  }

  /** The models are listed in each session's own options (before any session there are none to show). */
  async models(): Promise<ModelOption[]> {
    return [];
  }

  /** A session said which plan this is (the tier its `session/new` answer carries). */
  notePlan(tier: unknown) {
    if (!shapeLogged && tier != null) {
      shapeLogged = true;
      console.warn('[antigravity] tier shape', JSON.stringify(shapeOf(tier)));
    }
    const plan = antigravityPlanName(tier);
    if (!plan) return;
    const s = this.saved();
    if (s.plan === plan) return;
    this.save({ ...s, plan });
    if (this.kept?.status.loggedIn) this.kept.status = { ...this.kept.status, plan };
    if (this.last?.loggedIn) this.last = { ...this.last, plan };
    this.emit('account');
  }

  /** A session ran into a usage limit: usage() shows it until it lifts. */
  noteLimit(l: { label: string; resetsAt?: number | null }) {
    this.limit = { label: l.label, resetsAt: l.resetsAt, at: Date.now() };
  }

  /** A session found it signed out: the answer to "is it signed in" is no from now on, and the saved sign-in goes. */
  noteSignedOut() {
    this.signedOut();
  }

  private signedOut() {
    this.forgetSaved();
    const status: AccountStatus = { agent: 'antigravity', loggedIn: false };
    this.gen++;
    this.kept = { at: Date.now(), status };
    this.last = status;
    this.lastUsage = null;
  }

  /** `agy acp --login`: Google's link, then the code its page shows (or the page's whole address), pasted back. */
  async startLogin(): Promise<LoginFlow> {
    const env = { ...agentBaseEnv() };
    const bin = findCommand('agy', env);
    if (!bin) throw new HttpError(400, NOT_INSTALLED);
    this.cancelAll();
    for (const [id, f] of this.flows) if (ended(f)) this.flows.delete(id);
    const id = crypto.randomBytes(8).toString('hex');
    const flow: Flow = { id, agent: 'antigravity', method: 'google', state: 'starting', buf: '' };
    this.flows.set(id, flow);
    fs.mkdirSync(paths.probe, { recursive: true });
    const run = launch(bin, ['acp', '--login'], env);
    const proc = spawn(run.cmd, run.args, { cwd: paths.probe, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    flow.proc = proc;
    proc.stdin.on('error', () => {});
    // A sign-in nobody finishes does not wait for ever.
    flow.timer = setTimeout(() => {
      if (!flow.proc) return;
      flow.expired = true;
      flow.proc.kill();
    }, LOGIN_MS);
    flow.timer.unref?.();
    const onData = (d: Buffer) => {
      flow.buf = ((flow.buf ?? '') + d.toString('utf8')).slice(-100_000);
      if (flow.url) return;
      const p = agyLoginPrompt(flow.buf);
      if (!p.url) return;
      flow.url = p.url;
      flow.state = 'waiting';
      flow.needsInput = 'code';
      flow.message = 'Open the link, sign in with your Google account, then paste the code the page shows (or the whole address of the page you land on).';
      this.emit('flow', flow);
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    const finish = (ok: boolean, why?: string) => {
      if (!flow.proc) return;
      flow.proc = undefined;
      clearTimeout(flow.timer);
      if (flow.state === 'cancelled') return;
      flow.needsInput = undefined;
      if (ok) {
        flow.state = 'done';
        flow.message = 'Signed in to Antigravity CLI';
        const email = agyLoggedInAs(flow.buf ?? '');
        const before = this.saved();
        // The plan stays only for the same person: a different account may have another one (a session tells it again).
        this.save({ ...(email ? { email } : {}), ...(email && before.email === email && before.plan ? { plan: before.plan } : {}) });
        this.forgetAnswers();
        this.lastUsage = null;
      } else {
        flow.state = 'failed';
        flow.message = undefined;
        // What the program said after it asked for the code (its link and instructions are not the reason).
        const said = (flow.buf ?? '').split(/press enter:/i).pop() ?? '';
        flow.error = (flow.expired ? why : lastLines(said)) || why || 'Sign-in failed';
      }
      this.emit('flow', flow);
      if (ok) this.emit('account');
    };
    proc.on('error', (e) => finish(false, e.message));
    proc.on('close', (code) => finish(code === 0, flow.expired ? 'The sign-in took too long: start it again' : `agy stopped with code ${code}`));
    // Wait briefly for the link so the first response already has it.
    for (let i = 0; i < 60 && flow.proc && !flow.url; i++) await new Promise((r) => setTimeout(r, 100));
    return flow;
  }

  /** The code the page showed (or the whole address of the page, which holds it): passed to the program as its line. */
  submitCode(flowId: string, code: string): LoginFlow {
    const flow = this.flows.get(flowId);
    if (!flow?.proc || ended(flow)) throw new Error('This sign-in is no longer running');
    const text = code.trim();
    if (!text || text.length > 4000) throw new Error('Paste the code from the page');
    flow.state = 'verifying';
    flow.needsInput = undefined;
    flow.proc.stdin?.write(`${text}\n`);
    this.emit('flow', flow);
    return flow;
  }

  cancelLogin(flowId: string) {
    const flow = this.flows.get(flowId);
    if (!flow || ended(flow)) return;
    flow.state = 'cancelled';
    flow.needsInput = undefined;
    clearTimeout(flow.timer);
    flow.proc?.kill();
    flow.proc = undefined;
    this.emit('flow', flow);
  }

  /** Cancels the sign-in that is running, if there is one. */
  cancelAll() {
    for (const f of this.flows.values()) if (f.state === 'waiting' || f.state === 'starting' || f.state === 'verifying') this.cancelLogin(f.id);
  }

  /**
   * Signs out: agy has no command for it, but its agent has a `logout` method. Throws when the program could not do it (it
   * is still signed in then, and so is what the app keeps).
   */
  async logout() {
    const env = { ...agentBaseEnv() };
    if (findCommand('agy', env)) {
      this.cancelAll();
      let failed: string | undefined;
      try {
        const a = (await agyAsk(env, [{ method: 'logout', params: {} }])).results[0];
        if (a?.error) failed = a.error.message;
      } catch (e) {
        failed = (e as Error).message;
      }
      if (failed) {
        this.forgetAnswers();
        throw new Error(`Antigravity CLI could not sign out: ${failed}`);
      }
    }
    this.signedOut();
    this.lastUsage = null;
    this.emit('account');
  }
}

/** Antigravity CLI's sign-in progress, for the page (there is only the one, so no account goes with it). */
export const antigravityFlows = new EventEmitter();

let control: AntigravityControl | undefined;

/** The control of Antigravity CLI's sign-in: the program's own only, an added account never exists for it (accountEnv says so). */
export function antigravityControl(db: DB, account?: string | null): AntigravityControl {
  if (account) accountEnv(db, 'antigravity', account);
  if (!control) {
    control = new AntigravityControl(db);
    control.on('flow', (f: LoginFlow) => antigravityFlows.emit('flow', f, undefined));
  }
  return control;
}

/** Nothing is kept for an added account, as there are none: here for the sake of grok.ts's twin. */
export function dropAntigravityControl(_id: string) {}
