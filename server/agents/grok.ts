// Grok Build's sign-in: which account the `grok` program is signed in as, and signing in and out of it. Grok keeps everything in
// its home folder (GROK_HOME, ~/.grok): the default account is that folder, an added account is a folder of its own
// (server/accounts.ts). Sessions run over ACP (server/agents/acp.ts); this is only the account side, a program run for each
// question (`grok models` says whether it is signed in; `grok login --device-auth` signs in with a code, nothing to paste).
import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { AccountStatus, LoginFlow } from '../../shared/types.ts';
import { accountEnv } from '../accounts.ts';
import { ensureCommand } from '../clients.ts';
import { paths } from '../config.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import { execProgram, launch } from '../platform.ts';
import { findCommand } from './acp.ts';

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

/** Account calls for one Grok Build account: its sign-in status, signing in with a device code, and signing out. */
export class GrokControl extends EventEmitter {
  /** `extraEnv` points it at an added account (GROK_HOME); none for the default one. */
  constructor(private extraEnv: Record<string, string> = {}) {
    super();
  }
  flows = new Map<string, Flow>();

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
      if (ok) this.emit('account');
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
