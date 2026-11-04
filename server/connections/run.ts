// run_with_secrets: a command on this computer with keys from the vault in its environment ($NAME), for
// programs that need a password or token (git, psql, a script). Only keys the user allowed in commands;
// the user is asked first unless the session has full access (Plan mode refuses), and what the command
// prints comes back with the values masked, so the agent never sees them.
import { spawn } from 'node:child_process';
import { bashCommand, killTree } from '../platform.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import { SECRET_NAME, secretName } from '../../shared/connections.ts';
import type { ApprovalRequest } from '../../shared/types.ts';
import { agentBaseEnv } from '../env.ts';
import type { RunCtx, ToolOutput } from '../features/types.ts';
import { modeOf } from '../guide/api.ts';
import { maskUsed, readSecret, redact, secretView, touchSecret } from './vault.ts';

/** How long the card waits for the user (under Codex's ten minutes for a tool call). */
const WAIT_MS = 570_000;
/** Most output read; the rest is left. */
const MAX_READ = 2_000_000;

/** Keys the user let this session's commands have without asking again (until the app restarts). */
const allowed = new Map<string, Set<string>>();

const fail = (text: string): ToolOutput => ({ text, isError: true });

/** Names the shell and the programs it starts read for themselves: a key by one of these would change how the command runs. */
const SHELL_OWN = /^(PATH|HOME|USER|LOGNAME|SHELL|PWD|OLDPWD|IFS|ENV|BASH_ENV|SHELLOPTS|BASHOPTS|CDPATH|PS4|TERM|TMPDIR|LANG|LD_[A-Z_]+|DYLD_[A-Z_]+|NODE_OPTIONS|PYTHONPATH|PYTHONSTARTUP|PERL5OPT|RUBYOPT)$/;

/** "A", "A and B", "A, B and C". */
export const listNames = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

export interface RunArgs {
  command?: unknown;
  secrets?: unknown;
  description?: unknown;
  timeout?: unknown;
  max_chars?: unknown;
}

export async function runWithSecrets(a: RunArgs, ctx: RunCtx): Promise<ToolOutput> {
  const db = ctx.deps.db;
  const command = String(a.command ?? '').trim();
  if (!command) return fail('command: the shell command to run, using keys as $NAME.');
  if (command.length > 20_000) return fail('command: at most 20,000 characters (put a long script in a file in the session’s folder).');
  // The keys: as named, or the ones in the vault the command uses as $NAME.
  const given = Array.isArray(a.secrets) ? a.secrets : typeof a.secrets === 'string' ? a.secrets.split(/[\s,]+/) : [];
  let names = given.map((n) => secretName(String(n))).filter(Boolean);
  if (!names.length) names = [...command.matchAll(/\$\{?([A-Z][A-Z0-9_]{1,63})\}?/g)].map((m) => m[1]).filter((n) => !SHELL_OWN.test(n) && secretView(db, n));
  names = [...new Set(names)];
  if (!names.length) return fail('secrets: name the keys from the vault it needs (the command uses each as $NAME). For a command that needs none, use your own shell.');
  if (names.length > 10) return fail('secrets: at most 10 keys.');
  const keys: { name: string; value: string }[] = [];
  for (const n of names) {
    if (!SECRET_NAME.test(n)) return fail(`secrets: ${n} is not a key’s name (capitals, digits and underscores).`);
    if (SHELL_OWN.test(n)) return fail(`${n} is a name the shell itself uses, so it is not given to commands. Keep the key under another name.`);
    let s;
    try {
      s = readSecret(db, n);
    } catch (e) {
      return fail(`${n}: ${(e as Error).message}`);
    }
    if (!s) return fail(`There is no key named ${n} in the vault. Ask the user for it with request_secret (commands: true).`);
    if (!s.view.commands)
      return fail(`${n} is not allowed in commands on this computer${s.view.domains.length ? ` (only for ${s.view.domains.join(', ')})` : ''}. Ask with request_secret (name: "${n}", commands: true): the card asks the user to allow it.`);
    keys.push({ name: n, value: s.value });
  }
  const mode = modeOf(ctx);
  if (mode === 'read-only') return fail('This session only reads (Plan mode, or read-only): tell the user what you would run instead, or ask them to switch the mode.');
  if (mode !== 'full' && !names.every((n) => allowed.get(ctx.key)?.has(n))) {
    const no = await ask(ctx, command, names, a.description);
    if (no) return fail(no);
  }

  const cwd = ctx.cwd && fs.existsSync(ctx.cwd) ? ctx.cwd : os.homedir();
  const timeout = Math.min(Math.max(Number(a.timeout) || 120, 1), 600);
  const r = await run(command, cwd, { ...agentBaseEnv(), ...Object.fromEntries(keys.map((k) => [k.name, k.value])) }, timeout * 1000, ctx.signal);
  for (const k of keys) touchSecret(db, k.name);
  // Masked before it is cut, so no value is left in half at a cut.
  let text = maskUsed(redact(r.out), keys);
  if (r.truncated) text = text.replace(/[^\n]*$/, '');
  const max = Math.min(Math.max(Number(a.max_chars) || 30_000, 1000), 100_000);
  if (text.length > max) {
    const head = Math.floor(max / 4);
    text = `${text.slice(0, head)}\n… (${(text.length - max).toLocaleString('en')} characters left out) …\n${text.slice(text.length - (max - head))}`;
  }
  const secs = (r.ms / 1000).toFixed(1);
  const end = r.error ? `Did not start: ${maskUsed(redact(r.error), keys)}` : r.timedOut ? `Stopped after ${timeout} s (its time limit)` : r.code === null ? `Ended by ${r.signal ?? 'a signal'}` : `Exit code ${r.code}`;
  const lines = [`${end}  ·  ${secs} s  ·  with ${names.join(', ')}`, '', text.trimEnd() || '(no output)'];
  if (r.truncated) lines.push('(The output was longer than 2 MB; the rest was not read.)');
  return { text: lines.join('\n'), isError: !!r.error || r.timedOut || r.code !== 0 };
}

/** The card: the command, the keys it gets, and what it is for. Null when the user allowed it, else why not. */
async function ask(ctx: RunCtx, command: string, names: string[], description: unknown): Promise<string | null> {
  const adapter = ctx.deps.sessions.adapterByRun(ctx.runId);
  if (!adapter) return 'Nobody can allow it now (the session is not running in the app). Ask the user in your reply.';
  const what = typeof description === 'string' ? description.trim().replace(/\s+/g, ' ').slice(0, 200) : '';
  const card: ApprovalRequest = {
    id: `keys-${crypto.randomBytes(6).toString('hex')}`,
    kind: 'command',
    title: `Run a command with ${listNames(names)}`,
    detail: [what ? `# ${what}` : '', `# ${names.map((n) => `$${n}`).join(', ')} from the vault; what it prints comes back masked`, command].filter(Boolean).join('\n'),
    options: [
      { id: 'accept', label: 'Allow', style: 'primary' },
      { id: 'always', label: 'Allow for this session' },
      { id: 'deny', label: 'Don’t', style: 'default' },
    ],
    createdAt: Date.now(),
  };
  const limit = AbortSignal.timeout(WAIT_MS);
  const answer = await adapter.ask(card, { signal: ctx.signal ? AbortSignal.any([ctx.signal, limit]) : limit });
  if (!answer) return limit.aborted ? 'The user did not answer the card in time; it was withdrawn. Ask them in your reply whether to run it.' : 'The card was withdrawn before the user answered.';
  if (answer.decision !== 'accept' && answer.decision !== 'always') return `The user said no${answer.message?.trim() ? `: “${answer.message.trim()}”` : '.'} Nothing ran.`;
  if (answer.decision === 'always') allowed.set(ctx.key, new Set([...(allowed.get(ctx.key) ?? []), ...names]));
  return null;
}

interface Ran {
  code: number | null;
  signal: string | null;
  out: string;
  truncated: boolean;
  timedOut: boolean;
  ms: number;
  error?: string;
}

/** Runs it with bash in its own process group (stopped whole at the time limit, or when the agent gives up). */
function run(command: string, cwd: string, env: Record<string, string>, timeoutMs: number, signal?: AbortSignal): Promise<Ran> {
  return new Promise((resolve) => {
    const started = Date.now();
    let sh: { cmd: string; args: string[] };
    try {
      sh = bashCommand(command);
    } catch (e) {
      return resolve({ code: 127, signal: null, out: '', truncated: false, timedOut: false, ms: 0, error: (e as Error).message });
    }
    const p = spawn(sh.cmd, sh.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true, windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    const take = (c: Buffer) => {
      const room = MAX_READ - size;
      if (room <= 0) return void (truncated = true);
      if (c.length > room) truncated = true;
      chunks.push(c.length > room ? c.subarray(0, room) : c);
      size += Math.min(room, c.length);
    };
    p.stdout.on('data', take);
    p.stderr.on('data', take);
    const stop = () => {
      killTree(p.pid!, 'SIGTERM');
      setTimeout(() => killTree(p.pid!, 'SIGKILL'), 3000).unref();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    signal?.addEventListener('abort', stop, { once: true });
    const done = (r: Partial<Ran>) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve({ code: null, signal: null, out: Buffer.concat(chunks).toString('utf8'), truncated, timedOut, ms: Date.now() - started, ...r });
    };
    p.on('error', (e) => done({ error: e.message }));
    p.on('close', (code, sig) => done({ code, signal: sig }));
  });
}
