// Each session's share of this computer (System → Monitor's Sessions, a session's Info) and the limits sessions run
// under (Settings → General → Limit each session). A session's programs are its runner and everything under it: the
// agent's program, the commands it runs, the servers it starts. They are measured only while someone looks: from /proc
// on Linux, from ps on a Mac (Windows: not yet). With a limit set, each session started after it runs in a systemd scope
// of its own (Linux, through the user's systemd): over its memory the kernel stops what in it asked for more, never the
// app or another session; its processors are a CPU quota. The scope's own count says when it stopped something.
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { kvGet, kvSet, type DB } from './db.ts';

export interface SessionLimits {
  /** Most memory, in MB. */
  memoryMb?: number;
  /** Most processors (cores' worth of time). */
  cpus?: number;
}

export const MEMORY_CHOICES = [2048, 4096, 8192, 16384];
export const CPU_CHOICES = [1, 2, 4, 8];

export function limitsOf(db: DB): SessionLimits {
  try {
    const v = JSON.parse(kvGet(db, 'sessions.limits') ?? '{}') as SessionLimits;
    return { ...(v.memoryMb ? { memoryMb: v.memoryMb } : {}), ...(v.cpus ? { cpus: v.cpus } : {}) };
  } catch {
    return {};
  }
}

/** Sets the limits for sessions started from now on: a number from the choices, or null for none. */
export function setLimits(db: DB, l: { memoryMb?: number | null; cpus?: number | null }): SessionLimits {
  const cur = limitsOf(db);
  if (l.memoryMb !== undefined) {
    if (l.memoryMb !== null && !MEMORY_CHOICES.includes(l.memoryMb)) throw new Error(`memoryMb is one of ${MEMORY_CHOICES.join(', ')}, or null`);
    if (l.memoryMb) cur.memoryMb = l.memoryMb;
    else delete cur.memoryMb;
  }
  if (l.cpus !== undefined) {
    if (l.cpus !== null && !CPU_CHOICES.includes(l.cpus)) throw new Error(`cpus is one of ${CPU_CHOICES.join(', ')}, or null`);
    if (l.cpus) cur.cpus = l.cpus;
    else delete cur.cpus;
  }
  kvSet(db, 'sessions.limits', JSON.stringify(cur));
  return cur;
}

/** The environment systemd-run --user needs to find the user's manager (a service's environment may lack it). */
const userEnv = (): NodeJS.ProcessEnv => ({ ...process.env, XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.() ?? 0}` });

let support: { ok: boolean; why?: string } | null = null;
/** Whether limits can be set here: Linux, with the user's systemd taking scopes. Asked once. */
export function limitSupport(): { ok: boolean; why?: string } {
  if (support) return support;
  if (process.platform !== 'linux') return (support = { ok: false, why: 'Limits need Linux.' });
  try {
    execFileSync('systemd-run', ['--user', '--scope', '-q', '--collect', 'true'], { env: userEnv(), timeout: 8000, stdio: 'ignore' });
    support = { ok: true };
  } catch {
    support = { ok: false, why: 'Limits need the user’s systemd (systemd-run --user), which is not running here.' };
  }
  return support;
}
/** For tests: what limitSupport answers. */
export const setLimitSupportForTests = (s: { ok: boolean; why?: string } | null) => (support = s);

/**
 * The command that starts a session's runner: as it is, or with limits set (and supported), inside a scope of its own
 * that holds them (systemd-run execs the command, so its process is the runner's).
 */
export function wrapRunner(limits: SessionLimits, runId: string, cmd: string, args: string[]): { cmd: string; args: string[]; env?: NodeJS.ProcessEnv; scope?: string } {
  if ((!limits.memoryMb && !limits.cpus) || !limitSupport().ok) return { cmd, args };
  const scope = `hydor-run-${runId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)}`;
  // OOMPolicy=continue: the program the kernel stops goes alone; by default systemd would stop the whole session with it.
  const props = [
    ...(limits.memoryMb ? ['-p', `MemoryMax=${limits.memoryMb}M`, '-p', 'MemorySwapMax=0', '-p', 'OOMPolicy=continue'] : []),
    ...(limits.cpus ? ['-p', `CPUQuota=${limits.cpus * 100}%`] : []),
  ];
  return { cmd: 'systemd-run', args: ['--user', '--scope', '-q', '--collect', `--unit=${scope}`, ...props, '--', cmd, ...args], env: userEnv(), scope };
}

// ---- measuring --------------------------------------------------------------------------------------

export interface Proc {
  ppid: number;
  /** CPU time so far, in seconds. */
  cpu: number;
  /** Resident memory, in bytes. */
  rss: number;
}

export interface Usage {
  /** Share of one processor over the last interval (100 = one core busy); null on the first look. */
  cpu: number | null;
  /** Resident memory of its programs, in bytes. */
  memory: number;
  /** How many programs. */
  procs: number;
}

/** The programs under each root (itself included) and what they use; `prev` holds each one's CPU time at the last look. */
export function treeUsage(table: Map<number, Proc>, roots: number[], prev: Map<number, number> | null, seconds: number): Map<number, Usage> {
  const kids = new Map<number, number[]>();
  for (const [pid, p] of table) {
    const list = kids.get(p.ppid) ?? [];
    list.push(pid);
    kids.set(p.ppid, list);
  }
  const out = new Map<number, Usage>();
  for (const root of roots) {
    if (!table.has(root)) continue;
    let memory = 0;
    let procs = 0;
    let spent = 0;
    const seen = new Set<number>();
    const stack = [root];
    while (stack.length) {
      const pid = stack.pop()!;
      if (seen.has(pid)) continue;
      seen.add(pid);
      const p = table.get(pid);
      if (!p) continue;
      memory += p.rss;
      procs++;
      const before = prev?.get(pid);
      // A program that started since the last look counts from its start.
      spent += before == null ? p.cpu : Math.max(0, p.cpu - before);
      for (const k of kids.get(pid) ?? []) stack.push(k);
    }
    out.set(root, { cpu: prev && seconds > 0 ? Math.round((spent / seconds) * 1000) / 10 : null, memory, procs });
  }
  return out;
}

const PAGE = 4096;
const CLK = 100;

/** Every program on this computer: Linux's /proc, or a Mac's ps; null elsewhere. */
async function processTable(): Promise<Map<number, Proc> | null> {
  if (process.platform === 'linux') {
    const t = new Map<number, Proc>();
    let pids: string[] = [];
    try {
      pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d));
    } catch {
      return null;
    }
    for (const p of pids) {
      let stat = '';
      try {
        stat = fs.readFileSync(`/proc/${p}/stat`, 'utf8');
      } catch {
        continue;
      }
      const f = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      t.set(Number(p), { ppid: Number(f[1]), cpu: (Number(f[11]) + Number(f[12])) / CLK, rss: Number(f[21]) * PAGE });
    }
    return t;
  }
  if (process.platform === 'darwin') {
    const out = await new Promise<string>((resolve) => execFile('ps', ['-A', '-o', 'pid=,ppid=,rss=,time='], { timeout: 5000, maxBuffer: 8 << 20 }, (_e, so) => resolve(String(so ?? ''))));
    const t = new Map<number, Proc>();
    for (const l of out.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s*$/.exec(l);
      if (!m) continue;
      const secs = Number(m[4] ?? 0) * 86400 + Number(m[5] ?? 0) * 3600 + Number(m[6]) * 60 + Number(m[7]);
      t.set(Number(m[1]), { ppid: Number(m[2]), cpu: secs, rss: Number(m[3]) * 1024 });
    }
    return t;
  }
  return null;
}

/** How many times the kernel stopped a program in this process's scope for going over its memory (Linux's cgroups). */
export function oomKills(pid: number): number | null {
  try {
    const cg = fs.readFileSync(`/proc/${pid}/cgroup`, 'utf8').match(/^0::(\S+)/m)?.[1];
    if (!cg) return null;
    const ev = fs.readFileSync(`/sys/fs/cgroup${cg}/memory.events`, 'utf8');
    return Number(/^oom_kill (\d+)/m.exec(ev)?.[1] ?? 0);
  } catch {
    return null;
  }
}

/** Measures the sessions' programs when asked, at most every few seconds, keeping each program's CPU time for the next. */
export class SessionMeter {
  private prev: Map<number, number> | null = null;
  private prevAt = 0;
  private last: { at: number; usage: Map<number, Usage> } | null = null;
  private busy: Promise<Map<number, Usage>> | null = null;

  /** What the roots use now (or as of under 2.5 s ago). */
  async measure(roots: number[]): Promise<Map<number, Usage>> {
    const now = Date.now();
    if (this.last && now - this.last.at < 2500 && roots.every((r) => this.last!.usage.has(r))) return this.last.usage;
    if (this.busy) return this.busy;
    this.busy = (async () => {
      let table = await processTable();
      if (!table) return new Map<number, Usage>();
      // A look long after the last one gives the CPU since then, which says little about now: two looks, a moment apart.
      if (!this.prev || Date.now() - this.prevAt > 60_000) {
        this.prev = new Map([...table].map(([pid, p]) => [pid, p.cpu]));
        this.prevAt = Date.now();
        await new Promise((r) => setTimeout(r, 600));
        table = (await processTable()) ?? table;
      }
      const at = Date.now();
      const usage = treeUsage(table, roots, this.prev, (at - this.prevAt) / 1000);
      this.prev = new Map([...table].map(([pid, p]) => [pid, p.cpu]));
      this.prevAt = at;
      this.last = { at, usage };
      return usage;
    })().finally(() => (this.busy = null));
    return this.busy;
  }
}
