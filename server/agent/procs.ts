// Commands that keep running (dev servers, watchers, long builds) go in the background: their output is
// kept in a file in the session's folder and read when wanted (bash_output), and they stop on request
// (bash_kill) or when Custom exits. A turn can end while they run; the next one is told they still are.
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { spill } from './spill.ts';
import type { Tool, ToolCtx } from './tools.ts';
import { shellEnv, stripAnsi, textContent } from './util.ts';
import { bashCommand, killTree, killTreeSync } from '../platform.ts';

export interface Proc {
  id: string;
  session: string;
  command: string;
  pid: number;
  started: number;
  log: string;
  /** The latest output in memory (the whole of it is in the log). */
  recent: string;
  /** Characters written in all, and how many of them the model has seen. */
  total: number;
  seen: number;
  code?: number | null;
  signal?: string | null;
  ended?: number;
  child: ChildProcess;
  changed: Set<() => void>;
}

const procs = new Map<string, Proc>();
let seq = 0;
const KEEP = 200_000;

export const procsOf = (session: string) => [...procs.values()].filter((p) => p.session === session);
export const runningOf = (session: string) => procsOf(session).filter((p) => p.ended === undefined);

/** Starts a command in the background, its output going to a log in the session's folder. */
export function startProc(command: string, o: { cwd: string; dir: string; session: string; shell?: (command: string) => { cmd: string; args: string[]; env?: Record<string, string> } }): Proc {
  const id = `p${++seq}`;
  const folder = path.join(o.dir, 'procs');
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const log = path.join(folder, `${id}-${Date.now().toString(36)}.log`);
  const out = fs.createWriteStream(log, { mode: 0o600 });
  // Through the session's shell: the sandbox in Auto and Full modes, where it is on.
  const sh: { cmd: string; args: string[]; env?: Record<string, string> } = o.shell?.(command) ?? bashCommand(command);
  const child = spawn(sh.cmd, sh.args, { cwd: o.cwd, env: { ...shellEnv(), ...sh.env }, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  const p: Proc = { id, session: o.session, command, pid: child.pid ?? 0, started: Date.now(), log, recent: '', total: 0, seen: 0, child, changed: new Set() };
  const add = (d: string) => {
    out.write(d);
    p.recent = (p.recent + d).slice(-KEEP);
    p.total += d.length;
    for (const f of p.changed) f();
  };
  child.stdout!.setEncoding('utf8').on('data', add);
  child.stderr!.setEncoding('utf8').on('data', add);
  child.on('error', (e) => add(`\n(could not start: ${e.message})\n`));
  child.on('close', (code, signal) => {
    p.code = code;
    p.signal = signal;
    p.ended = Date.now();
    out.end();
    for (const f of p.changed) f();
  });
  procs.set(id, p);
  return p;
}

const ago = (ms: number) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

export function statusOf(p: Proc): string {
  if (p.ended === undefined) return `running for ${ago(Date.now() - p.started)} (pid ${p.pid})`;
  return p.signal ? `stopped (${p.signal}) after ${ago(p.ended - p.started)}` : `exited with code ${p.code} after ${ago(p.ended - p.started)}`;
}

/** Waits up to `ms` for new output to settle or for the process to end. */
export function settle(p: Proc, ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((done) => {
    let quiet: NodeJS.Timeout | undefined;
    const finish = () => {
      clearTimeout(limit);
      clearTimeout(quiet);
      p.changed.delete(onChange);
      signal?.removeEventListener('abort', finish);
      done();
    };
    const onChange = () => {
      if (p.ended !== undefined) return finish();
      // Output came: wait until it pauses briefly, so a burst is read whole.
      clearTimeout(quiet);
      quiet = setTimeout(finish, 600);
    };
    const limit = setTimeout(finish, ms);
    if (p.ended !== undefined) return finish();
    p.changed.add(onChange);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

/** What the process printed since the model last looked, and how it is doing. */
export function unread(p: Proc, ctx: Pick<ToolCtx, 'dir' | 'maxOutput'>): string {
  const fresh = p.total - p.seen;
  let text = fresh > 0 ? p.recent.slice(-Math.min(fresh, p.recent.length)) : '';
  const lost = fresh - text.length;
  p.seen = p.total;
  text = stripAnsi(text).trimEnd();
  const body = text ? spill(text, { dir: ctx.dir, max: Math.min(ctx.maxOutput, 20_000), label: `${p.id}-output`, tail: 0.7 }) : '(no new output)';
  return `${lost > 0 ? `(${lost} earlier characters are only in ${p.log})\n` : ''}${body}\n\n[${p.id}: ${p.command.slice(0, 120)} — ${statusOf(p)}; full log: ${p.log}]`;
}

/** Stops a process and everything it started. */
export async function stopProc(p: Proc): Promise<void> {
  if (p.ended !== undefined) return;
  const kill = (sig: NodeJS.Signals) => killTree(p.pid, sig);
  kill('SIGTERM');
  await settle(p, 3000);
  if (p.ended === undefined) {
    kill('SIGKILL');
    await settle(p, 2000);
  }
}

/** On exit, nothing is left running. */
process.on('exit', () => {
  for (const p of procs.values())
    if (p.ended === undefined) killTreeSync(p.pid, 'SIGKILL');
});

const pick = (a: any, ctx: ToolCtx) => {
  const want = String(a.id ?? '').trim().replace(/^#/, '');
  const mine = procsOf(ctx.session);
  return mine.find((p) => p.id === want || String(p.pid) === want) ?? (mine.length === 1 && !want ? mine[0] : undefined);
};

const list = (ctx: ToolCtx) => {
  const mine = procsOf(ctx.session);
  return mine.length ? mine.map((p) => `${p.id}: ${p.command.slice(0, 100)} — ${statusOf(p)}`).join('\n') : 'No background processes.';
};

export const PROC_TOOLS: Tool[] = [
  {
    name: 'bash_output',
    kind: 'read',
    readOnly: true,
    description: 'Read what a background command (bash with background: true) printed since you last looked, and whether it still runs. wait: seconds to wait for new output first (at most 120), e.g. for a server to start. Without an id, lists the background commands.',
    parameters: { type: 'object', properties: { id: { type: 'string', description: 'Its id, like "p1"' }, wait: { type: 'integer' } } },
    title: (a) => `Output of ${a.id ?? 'background commands'}`,
    async run(a, ctx) {
      if (!a.id && procsOf(ctx.session).length !== 1) return { ok: true, output: list(ctx) };
      const p = pick(a, ctx);
      if (!p) return { ok: false, output: `No background command ${a.id}. ${list(ctx)}` };
      const wait = Math.max(0, Math.min(Number(a.wait) || 0, 120));
      if (wait && p.ended === undefined && p.total === p.seen) await settle(p, wait * 1000, ctx.signal);
      const output = unread(p, ctx);
      return { ok: true, output, content: textContent(output.slice(-8000)) };
    },
  },
  {
    name: 'bash_kill',
    kind: 'execute',
    writes: true,
    description: 'Stop a background command (and what it started) by its id.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    title: (a) => `Stop ${a.id ?? ''}`,
    async run(a, ctx) {
      const p = pick(a, ctx);
      if (!p) return { ok: false, output: `No background command ${a.id}. ${list(ctx)}` };
      await stopProc(p);
      return { ok: true, output: `${unread(p, ctx)}` };
    },
  },
];
