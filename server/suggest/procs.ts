// The programs word suggestions starts (the Python worker, llama-server, train.py): their process ids are kept in
// <data folder>/suggest/pids.json, they are ended when this server exits (whatever the way), and any that an earlier
// server left behind (killed, or stopped by a service manager that leaves a service's children running) are ended at the
// next start, if the process with that id still is what was started (its command line has what it was started with).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { suggestDir } from './setup.ts';

interface Entry {
  pid: number;
  kind: 'worker' | 'llama' | 'train';
  /** A word of its command line that tells it from another program that got the same id (its script, or its model's path). */
  marker: string;
}

const file = () => path.join(suggestDir(), 'pids.json');
const live = new Map<number, Entry>();
let hooked = false;

function save() {
  try {
    fs.mkdirSync(suggestDir(), { recursive: true, mode: 0o700 });
    if (!live.size) return void fs.rmSync(file(), { force: true });
    fs.writeFileSync(file(), JSON.stringify([...live.values()]), { mode: 0o600 });
  } catch {}
}

/**
 * Ends everything that is running, at once (no waiting: this runs as the server exits). llama-server and the worker
 * keep nothing, so they are killed outright (a signal they block or ignore must not leave them running); train.py
 * gets SIGTERM, which it answers by saving where it is. pids.json stays: the next start ends any that outlived this.
 */
export function killAll() {
  for (const [pid, e] of live) {
    try {
      process.kill(pid, e.kind === 'train' ? 'SIGTERM' : 'SIGKILL');
    } catch {}
  }
  live.clear();
}

/** Keeps a started program's id (and forgets it when it ends). */
export function track(kind: Entry['kind'], proc: { pid?: number; once(e: 'exit', f: () => void): unknown }, marker: string) {
  if (!proc.pid) return;
  if (!hooked) {
    hooked = true;
    process.on('exit', killAll);
  }
  const pid = proc.pid;
  live.set(pid, { pid, kind, marker });
  save();
  proc.once('exit', () => {
    if (live.delete(pid)) save();
  });
}

/** The command line of a process, or null when there is none with that id (or it cannot be read). */
function commandLine(pid: number): string | null {
  try {
    if (process.platform === 'linux') return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    if (process.platform === 'darwin') return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', timeout: 5000 }).trim() || null;
  } catch {}
  return null;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** Ends the programs an earlier server left running; how many it ended. (Not on Windows, where a process cannot be told from the command line.) */
/**
 * A learning run an earlier server left gets this long to save where it is before it is killed: it saves at the end of the
 * step it is in, which takes tens of seconds on a busy computer (the server that left it asked it to as it exited).
 */
export const TRAIN_REAP_GRACE_MS = 3 * 60_000;
/** Learning runs an earlier server left that are still saving: a new run waits for them (they write the same folder). */
const reaping = new Set<number>();

/** Whether a learning run an earlier server left is still ending (saving where it was). */
export function leftoverTraining(): boolean {
  for (const pid of reaping) if (!alive(pid)) reaping.delete(pid);
  return reaping.size > 0;
}

export function reapLeftovers(): number {
  let list: Entry[] = [];
  try {
    list = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {}
  let ended = 0;
  for (const e of Array.isArray(list) ? list : []) {
    if (!e || !Number.isInteger(e.pid) || e.pid <= 1 || e.pid === process.pid || typeof e.marker !== 'string' || !e.marker || live.has(e.pid)) continue;
    const cmd = commandLine(e.pid);
    if (!cmd || !cmd.includes(e.marker)) continue;
    try {
      process.kill(e.pid, 'SIGTERM');
      ended++;
    } catch {
      continue;
    }
    // One that ignores the signal is killed a few seconds later; a learning run is given time to save its place first.
    if (e.kind === 'train') reaping.add(e.pid);
    const t = setTimeout(() => {
      reaping.delete(e.pid);
      if (alive(e.pid) && commandLine(e.pid)?.includes(e.marker)) {
        try {
          process.kill(e.pid, 'SIGKILL');
        } catch {}
      }
    }, e.kind === 'train' ? TRAIN_REAP_GRACE_MS : 3000);
    t.unref?.();
  }
  if (!live.size) fs.rmSync(file(), { force: true });
  else save();
  return ended;
}
