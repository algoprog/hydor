// Runs on this computer. Each runs in a tmux session of its own on a private tmux server (as the app's terminals
// do, on a socket of Experiments' own), so it outlives the app's server: a small wrapper script goes into the
// job's folder, sets the GPUs it was given, runs the command with its output going to the run's log, and writes the
// exit code to a file when it ends. Where tmux is missing (Windows) the wrapper runs as a detached process instead.
// The wrapper keeps its process id, so the server finds its runs again after a restart and stops them whole
// (their process group: Ctrl-C first, then TERM, then KILL).
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentBaseEnv } from '../env.ts';
import { bashPath, killTree, WIN } from '../platform.ts';
import { q } from './capture.ts';
import { RUNS_ROOT } from './records.ts';

/** tmux's socket: under the app's data, or in the temporary folder when that path is too long for a socket. */
function socketPath(): string {
  const p = path.join(RUNS_ROOT, 'tmux.sock');
  return p.length <= 100 ? p : path.join(os.tmpdir(), `hydor-exp-${process.getuid?.() ?? 0}.sock`);
}

const session = (id: string) => `x${id}`;

let hasTmux: boolean | null = null;

function tmux(args: string[], timeout = 8000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    execFile('tmux', ['-S', socketPath(), ...args], { env: agentBaseEnv(), timeout }, (e, out, err) =>
      resolve({ code: e ? (typeof (e as NodeJS.ErrnoException).code === 'number' ? Number((e as NodeJS.ErrnoException).code) : (e as NodeJS.ErrnoException).code === 'ENOENT' ? 127 : 1) : 0, out: String(out ?? ''), err: String(err ?? '') }),
    );
  });
}

async function tmuxThere(): Promise<boolean> {
  if (WIN) return false;
  if (hasTmux === null) hasTmux = (await tmux(['-V'])).code !== 127;
  return hasTmux;
}

/** The files of a run's folder. */
export const files = (folder: string) => ({
  log: path.join(folder, 'log.txt'),
  exit: path.join(folder, 'exit'),
  pid: path.join(folder, 'pid'),
  command: path.join(folder, 'command.sh'),
  wrapper: path.join(folder, 'run.sh'),
  patch: path.join(folder, 'changes.patch'),
});

/**
 * The wrapper: keeps its process id, goes into the job's folder, sets the run's variables, runs the command with its
 * output to the log (and nothing to read from), and writes its exit code when it ends. Ctrl-C and TERM reach the
 * command (they go to the whole process group) and the wrapper waits for its end before writing the code; hang-ups
 * are ignored, so the run goes on if its tmux goes. The command runs in the foreground: in the background a
 * non-interactive shell would have it ignore Ctrl-C.
 */
export function wrapperScript(o: { id: string; folder: string; cwd: string; env: Record<string, string> }): string {
  const f = files(o.folder);
  const exports = Object.entries(o.env)
    .filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    .map(([k, v]) => `export ${k}=${q(v)}`);
  return [
    '#!/bin/bash',
    `# Hydor runs this for the run ${o.id}: the command in its folder, its output into log.txt, its exit code into exit.`,
    `echo $$ > ${q(f.pid)}`,
    "trap '' HUP",
    "trap ':' INT TERM",
    `cd -- ${q(o.cwd)} || { echo "Hydor: the folder ${o.cwd.replace(/["$`\\']/g, '')} is not there" >> ${q(f.log)}; echo 1 > ${q(f.exit)}; exit 1; }`,
    ...exports,
    `bash ${q(f.command)} >> ${q(f.log)} 2>&1 < /dev/null`,
    'code=$?',
    `echo $code > ${q(f.exit + '.tmp')} && mv ${q(f.exit + '.tmp')} ${q(f.exit)}`,
    '',
  ].join('\n');
}

/** Starts a run: its command and wrapper written into its folder, then the wrapper in tmux (or detached). */
export async function startLocal(o: { id: string; folder: string; cwd: string; command: string; env: Record<string, string> }): Promise<void> {
  const f = files(o.folder);
  fs.mkdirSync(o.folder, { recursive: true, mode: 0o700 });
  for (const x of [f.exit, f.pid]) fs.rmSync(x, { force: true });
  fs.writeFileSync(f.command, `${o.command}\n`, { mode: 0o600 });
  fs.writeFileSync(f.wrapper, wrapperScript(o), { mode: 0o700 });
  if (await tmuxThere()) {
    fs.mkdirSync(path.dirname(socketPath()), { recursive: true, mode: 0o700 });
    const r = await tmux(['new-session', '-d', '-s', session(o.id), '-x', '200', '-y', '50', '-c', o.cwd, `bash ${q(f.wrapper)}`]);
    if (r.code !== 0) throw new Error(`tmux could not start it: ${r.err.trim() || `exit code ${r.code}`}`);
    return;
  }
  const bash = WIN ? bashPath() : '/bin/bash';
  if (!bash) throw new Error('Running jobs needs bash (Git for Windows on Windows)');
  const p = spawn(bash, [f.wrapper], { cwd: o.cwd, env: agentBaseEnv(), detached: true, stdio: 'ignore', windowsHide: true });
  p.on('error', () => {});
  p.unref();
}

/** The exit code a run wrote, or null while it has not ended. */
export function exitOf(folder: string): number | null {
  try {
    const t = fs.readFileSync(files(folder).exit, 'utf8').trim();
    return /^-?\d+$/.test(t) ? Number(t) : null;
  } catch {
    return null;
  }
}

export function pidOf(folder: string): number | null {
  try {
    const n = Number(fs.readFileSync(files(folder).pid, 'utf8').trim());
    return Number.isInteger(n) && n > 1 ? n : null;
  } catch {
    return null;
  }
}

/** The command line of a process (null when there is none). */
function cmdline(pid: number): string | null {
  try {
    return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  } catch {}
  try {
    process.kill(pid, 0);
  } catch {
    return null;
  }
  // No /proc (macOS): alive is what can be known.
  return '';
}

/** Whether the run's wrapper still runs (its process, by its id, running its own wrapper: an id taken again after a restart is not it). */
export function aliveLocal(id: string, folder: string): boolean {
  const pid = pidOf(folder);
  if (!pid) return false;
  const c = cmdline(pid);
  return c !== null && (c === '' || c.includes(folder) || c.includes(id));
}

/** Stops a run whole: Ctrl-C to its process group, TERM after 10 s, KILL after 20 s, then its tmux session goes. */
export async function stopLocal(id: string, folder: string, graceMs = 10_000): Promise<void> {
  const pid = pidOf(folder);
  const sig = (s: NodeJS.Signals) => {
    if (pid && aliveLocal(id, folder)) killTree(pid, s);
  };
  sig('SIGINT');
  const later = (ms: number, fn: () => void) => setTimeout(fn, ms).unref();
  later(graceMs, () => sig('SIGTERM'));
  later(2 * graceMs, () => {
    sig('SIGKILL');
    void tmuxThere().then((t) => t && tmux(['kill-session', '-t', `=${session(id)}`]));
  });
}

/** For the tests: the tmux server of their own data folder goes. */
export async function stopTmuxServer() {
  if (await tmuxThere()) await tmux(['kill-server']);
}
