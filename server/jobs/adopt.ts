// What `job adopt` needs to show a process that was already running as a job: when it started, where it writes, whether
// it can be stopped from here, and which files may be read as its log.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { WORKTREES_ROOT } from '../worktrees.ts';

let ticks: number | undefined;
/** The clock ticks in a second, which /proc counts a process's start in (100 almost everywhere). */
function ticksPerSecond(): number {
  if (ticks === undefined) {
    try {
      ticks = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8', timeout: 5000 })) || 100;
    } catch {
      ticks = 100;
    }
  }
  return ticks;
}

/** When a process started, from its start in ticks since the computer did (Linux). */
export function startFromProc(startTicks: string | undefined): number | undefined {
  if (!startTicks) return undefined;
  try {
    const boot = Number(/^btime (\d+)$/m.exec(fs.readFileSync('/proc/stat', 'utf8'))?.[1]);
    return boot ? Math.round((boot + Number(startTicks) / ticksPerSecond()) * 1000) : undefined;
  } catch {
    return undefined;
  }
}

/** The same as `ps` tells it, where there is no /proc (macOS). */
export function startFromPs(pid: number): number | undefined {
  try {
    const out = execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, LC_ALL: 'C' } });
    const at = Date.parse(out.trim());
    return Number.isFinite(at) ? at : undefined;
  } catch {
    return undefined;
  }
}

/** Another user's process: it is there, and cannot be signalled. */
export function isForeign(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** A session task's output file, by its path (Claude Code's: …/claude-<uid>/…/tasks/<task>.output). */
const TASK_OUTPUT = /[\\/]claude-\d+[\\/].*[\\/]tasks[\\/][\w-]+\.output$/;

/**
 * The background task a process is the work of, as its standard output tells (Linux): Claude Code points a task's
 * processes at the task's output file.
 */
export function taskOutputOf(pid: number): string | undefined {
  try {
    const file = fs.readlinkSync(`/proc/${pid}/fd/1`);
    return TASK_OUTPUT.test(file) && fs.statSync(file).isFile() ? file : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether the task output found from the process's standard output is still that very file, with no link put in its
 * place since. It may be in the app's data folder, where agents' temporary files go when /tmp cannot take them.
 */
export function stillTaskOutput(file: string): boolean {
  try {
    return fs.realpathSync(file) === file && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const inside = (file: string, dir: string) => file.startsWith(real(dir) + path.sep);

/**
 * Whether a file named as an adopted job's log may be read now: an ordinary file (reading a pipe would hold the whole
 * app), and none of the app's own data (its database and keys), worktrees aside, where work is done.
 */
export function mayReadLog(file: string): boolean {
  try {
    const at = fs.realpathSync(file);
    return fs.statSync(at).isFile() && (!inside(at, config.dataDir) || inside(at, WORKTREES_ROOT));
  } catch {
    return false;
  }
}
