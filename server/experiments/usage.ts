// What the runs on this computer use while they run, sampled every 10 seconds (every 30 once they have run ten
// minutes, every 3 for a trial): the GPU memory their own processes hold on each of their GPUs and those GPUs' use
// (nvidia-smi: one reading of its processes and one of its GPUs, for all runs together), and the processor and
// resident memory of the processes under each run (/proc, on Linux). Kept as series beside the run's metrics and as
// peaks in its record, with what other programs held on its GPUs, so that running out of memory can be explained.
// Nothing is read while no run runs, a reading that fails only loses that reading, and the reader can be swapped for
// a stand-in (the tests have no GPU).
import fs from 'node:fs';
import os from 'node:os';
import type { MetricSeries, RunRecord } from '../../shared/experiments.ts';
import { isTrialRun } from '../../shared/experiments.ts';
import type { DB } from '../db.ts';
import { execProgram } from './gpus.ts';
import { pidOf } from './local.ts';
import { getRun, runFolder, saveSystem, systemSeriesOf, updateRun, type RunInfo } from './records.ts';

/** A GPU as sampled: memory in MiB, use in percent. */
export interface GpuUse {
  index: number;
  uuid: string;
  memUsed: number;
  memTotal: number;
  util: number;
}

/** A program on a GPU, as nvidia-smi's compute apps list it. */
export interface GpuApp {
  pid: number;
  uuid: string;
  usedMib: number;
}

export interface ProcessUse {
  pid: number;
  ppid: number;
  session: number;
  /** Processor time, its ended children's included, in seconds. */
  cpuSeconds: number;
  rssBytes: number;
}

export interface UsageReader {
  gpus(): Promise<GpuUse[]>;
  apps(): Promise<GpuApp[]>;
  /** Every process; null where that cannot be read (not Linux). `tree`: those whose memory is wanted. */
  processes(tree: (all: ProcessUse[]) => ProcessUse[]): ProcessUse[] | null;
  /** The computer's memory, and the least a control group lets `pid` have, in bytes. */
  memory(pid: number | null): { totalBytes: number; availableBytes?: number; groupBytes?: number } | null;
}

// ---- reading this computer -------------------------------------------------------------------------------------

const csv = (out: string) =>
  out
    .trim()
    .split('\n')
    .map((l) => l.split(',').map((x) => x.trim()));

export function parseGpuUse(out: string): GpuUse[] {
  return csv(out)
    .filter((f) => f.length >= 5 && /^\d+$/.test(f[0]))
    .map((f) => ({ index: Number(f[0]), uuid: f[1], memUsed: Number(f[2]) || 0, memTotal: Number(f[3]) || 0, util: Number(f[4]) || 0 }));
}

export function parseGpuApps(out: string): GpuApp[] {
  return csv(out)
    .filter((f) => f.length >= 3 && /^\d+$/.test(f[0]))
    .map((f) => ({ pid: Number(f[0]), usedMib: Number(f[1]) || 0, uuid: f[2] }));
}

/** One line of /proc/<pid>/stat (null when it is not one). Linux counts 100 ticks a second. */
export function parseStat(text: string): Omit<ProcessUse, 'rssBytes'> | null {
  // The name, in brackets, may hold spaces and brackets of its own.
  const open = text.indexOf('(');
  const close = text.lastIndexOf(')');
  if (open < 0 || close < 0) return null;
  const f = text.slice(close + 2).split(' ');
  const pid = Number(text.slice(0, open).trim());
  if (!pid || f.length < 15) return null;
  return { pid, ppid: Number(f[1]), session: Number(f[3]), cpuSeconds: (Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14])) / 100 };
}

const read = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
};

const thisComputer: UsageReader = {
  async gpus() {
    const r = await execProgram('nvidia-smi', ['--query-gpu=index,uuid,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits']);
    return parseGpuUse(r.out);
  },
  async apps() {
    const r = await execProgram('nvidia-smi', ['--query-compute-apps=pid,used_memory,gpu_uuid', '--format=csv,noheader,nounits']);
    return parseGpuApps(r.out);
  },
  processes(tree) {
    if (process.platform !== 'linux') return null;
    const all: ProcessUse[] = [];
    for (const name of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(name)) continue;
      const p = parseStat(read(`/proc/${name}/stat`));
      if (p) all.push({ ...p, rssBytes: 0 });
    }
    // Resident memory only of those that are asked about.
    return tree(all).map((p) => ({ ...p, rssBytes: Number(/^VmRSS:\s+(\d+) kB/m.exec(read(`/proc/${p.pid}/status`))?.[1] ?? 0) * 1024 }));
  },
  memory(pid) {
    const info = read('/proc/meminfo');
    const kb = (name: string) => Number(new RegExp(`^${name}:\\s+(\\d+) kB`, 'm').exec(info)?.[1] ?? 0) * 1024;
    const totalBytes = kb('MemTotal') || os.totalmem();
    let groupBytes: number | undefined;
    // cgroup v2: the smallest memory.max from the process's group up.
    let group = /^0::(.*)$/m.exec(pid ? read(`/proc/${pid}/cgroup`) : '')?.[1];
    while (group && group !== '/') {
      const max = Number(read(`/sys/fs/cgroup${group}/memory.max`).trim());
      if (max > 0) groupBytes = Math.min(groupBytes ?? max, max);
      group = group.slice(0, group.lastIndexOf('/'));
    }
    return { totalBytes, ...(kb('MemAvailable') ? { availableBytes: kb('MemAvailable') } : {}), ...(groupBytes ? { groupBytes } : {}) };
  },
};

let reader: UsageReader = thisComputer;

/** For the tests: processes, GPUs and memory as given. */
export function setUsageReader(r: UsageReader | null) {
  reader = r ?? thisComputer;
}

// ---- sampling ----------------------------------------------------------------------------------------------------

export const SYSTEM_NAMES = { gpuMem: 'system/gpu_mem_gb', gpuUtil: 'system/gpu_util', cpu: 'system/cpu', ram: 'system/ram_gb' } as const;

/** How often a run is sampled: a trial often, any run every 10 seconds, every 30 after ten minutes. */
export const intervalOf = (r: Pick<RunRecord, 'tags' | 'env' | 'startedAt'>, now: number) => (isTrialRun(r) ? 3000 : now - (r.startedAt ?? now) < 10 * 60_000 ? 10_000 : 30_000);

/** Points kept per series, as the metrics' series are thinned: past twice this, every other older point goes. */
const KEEP = 300;

interface State {
  series: MetricSeries;
  at: number;
  cpu?: { at: number; seconds: number };
}

const states = new Map<string, State>();
let readAt = 0;
let sampling: Promise<void> | null = null;

/** For the tests: what was sampled so far is forgotten (as after a restart). */
export function forgetUsage() {
  states.clear();
  readAt = 0;
}

const stateOf = (db: DB, id: string): State => {
  let s = states.get(id);
  if (!s) states.set(id, (s = { series: systemSeriesOf(db, id), at: 0 }));
  return s;
};

const GB = 1024 ** 3;
const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** The processes of a run: those under its wrapper, and any left in the wrapper's session. */
export function treeOf(root: number, all: ProcessUse[]): ProcessUse[] {
  const children = new Map<number, ProcessUse[]>();
  for (const p of all) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p]);
  const found = new Map<number, ProcessUse>();
  const walk = [...all.filter((p) => p.pid === root || p.session === root)];
  while (walk.length) {
    const p = walk.pop()!;
    if (found.has(p.pid)) continue;
    found.set(p.pid, p);
    walk.push(...(children.get(p.pid) ?? []));
  }
  return [...found.values()];
}

function point(s: State, name: string, x: number, v: number) {
  const pts = (s.series[name] ??= []);
  if (pts.length && x <= pts[pts.length - 1][0]) pts[pts.length - 1] = [pts[pts.length - 1][0], v];
  else pts.push([x, v]);
  if (pts.length > 2 * KEEP) s.series[name] = pts.filter((_, i) => i % 2 === 1 || i === pts.length - 1);
}

/**
 * Samples the runs on this computer that run, when one of them is due: nothing is read otherwise. `runs` may be any
 * runs; those that are not running here are left out. Never throws.
 */
export function sampleRuns(db: DB, runs: RunRecord[], now = Date.now()): Promise<void> {
  const mine = runs.filter((r) => r.status === 'running' && !r.remote && (r.where ?? 'local') === 'local');
  if (sampling) return sampling;
  if (!mine.length) return Promise.resolve();
  const every = Math.min(...mine.map((r) => intervalOf(r, now)));
  // The queue looks every three seconds: a second early counts as due.
  if (now - readAt < every - 1000) return Promise.resolve();
  // One whose process is not there yet (just started) is looked at the next time.
  const due = mine.filter((r) => now - stateOf(db, r.id).at >= intervalOf(r, now) - 1000 && !!pidOf(r.folder ?? runFolder(r.id)));
  if (!due.length) return Promise.resolve();
  readAt = now;
  sampling = take(db, due, now)
    .catch((e) => console.error('[experiments] sampling:', (e as Error)?.message ?? e))
    .finally(() => {
      sampling = null;
    });
  return sampling;
}

async function take(db: DB, due: RunRecord[], now: number) {
  let gpus: GpuUse[] = [];
  let apps: GpuApp[] = [];
  if (due.some((r) => r.gpuIds?.length)) {
    [gpus, apps] = await Promise.all([reader.gpus().catch((): GpuUse[] => []), reader.apps().catch((): GpuApp[] => [])]);
  }
  const roots = new Map(due.map((r) => [r.id, pidOf(r.folder ?? runFolder(r.id))]));
  const trees = new Map<string, ProcessUse[]>();
  let read: ProcessUse[] | null = null;
  try {
    read = reader.processes((all) => {
      for (const r of due) {
        const root = roots.get(r.id);
        if (root) trees.set(r.id, treeOf(root, all));
      }
      return [...new Map([...trees.values()].flat().map((p) => [p.pid, p])).values()];
    });
  } catch {}
  const withMemory = new Map((read ?? []).map((p) => [p.pid, p]));
  for (const r of due) {
    try {
      const tree = (trees.get(r.id) ?? []).map((p) => withMemory.get(p.pid) ?? p);
      sampleOne(db, r, now, gpus, apps, read ? tree : null, roots.get(r.id) ?? null);
    } catch (e) {
      console.error(`[experiments] ${r.id}: sampling:`, (e as Error)?.message ?? e);
    }
  }
}

function sampleOne(db: DB, r: RunRecord, now: number, gpus: GpuUse[], apps: GpuApp[], tree: ProcessUse[] | null, root: number | null) {
  // Read again: it may have ended while this was read, and its record must keep what the run's end wrote.
  const cur = getRun(db, r.id);
  if (!cur || cur.status !== 'running') return;
  const s = stateOf(db, r.id);
  s.at = now;
  const x = round((now - (r.startedAt ?? now)) / 60_000, 3);
  const info: Partial<RunInfo> = {};
  const peak = { gpuMemGb: [...(cur.peak?.gpuMemGb ?? [])], ramGb: cur.peak?.ramGb ?? 0 };
  const ids = r.gpuIds ?? [];
  // Without the processes (not Linux) the run's own memory on a GPU cannot be told from others'.
  const mine = new Set((tree ?? []).map((p) => p.pid));
  if (ids.length && gpus.length && mine.size) {
    const totals: number[] = [];
    const others: number[] = [];
    for (const [i, index] of ids.entries()) {
      const g = gpus.find((x) => x.index === index);
      const own = g ? apps.filter((a) => a.uuid === g.uuid && mine.has(a.pid)).reduce((a, p) => a + p.usedMib, 0) / 1024 : 0;
      peak.gpuMemGb[i] = round(Math.max(peak.gpuMemGb[i] ?? 0, own));
      totals[i] = round((g?.memTotal ?? 0) / 1024);
      others[i] = round(Math.max(0, (g?.memUsed ?? 0) / 1024 - own));
      if (!g) continue;
      const suffix = ids.length > 1 ? `/gpu${index}` : '';
      point(s, `${SYSTEM_NAMES.gpuMem}${suffix}`, x, round(own));
      point(s, `${SYSTEM_NAMES.gpuUtil}${suffix}`, x, g.util);
    }
    info.gpuTotalGb = totals;
    info.others = { ...cur.others, end: others };
  }
  if (tree?.length) {
    const ram = tree.reduce((a, p) => a + p.rssBytes, 0) / GB;
    const seconds = tree.reduce((a, p) => a + p.cpuSeconds, 0);
    point(s, SYSTEM_NAMES.ram, x, round(ram, 3));
    // Percent of one processor, as top shows it: 400 is four processors at work.
    if (s.cpu && now > s.cpu.at) point(s, SYSTEM_NAMES.cpu, x, round((Math.max(0, seconds - s.cpu.seconds) / ((now - s.cpu.at) / 1000)) * 100, 1));
    s.cpu = { at: now, seconds };
    peak.ramGb = round(Math.max(peak.ramGb, ram), 3);
    const m = reader.memory(root);
    if (m) {
      info.memoryLimitGb = round(Math.min(m.totalBytes, m.groupBytes ?? m.totalBytes) / GB);
      if (m.availableBytes !== undefined && m.availableBytes < 0.05 * m.totalBytes) info.memoryLow = true;
    }
  }
  if (info.others || tree?.length) info.peak = peak;
  if (Object.keys(info).length) updateRun(db, r.id, { info });
  saveSystem(db, r.id, s.series);
}

/** As a run starts: what was already on its GPUs is other programs', from the reading the queue chose them by. */
export function startUsage(db: DB, id: string, gpuIds: number[], gpus: { index: number; memUsed: number; memTotal: number }[]) {
  states.delete(id);
  if (!gpuIds.length) return;
  const of = (i: number) => gpus.find((g) => g.index === i);
  updateRun(db, id, { info: { others: { start: gpuIds.map((i) => round((of(i)?.memUsed ?? 0) / 1024)) }, gpuTotalGb: gpuIds.map((i) => round((of(i)?.memTotal ?? 0) / 1024)) } });
}

/** As a run ends: a run sampled no further. One with GPUs never sampled gets what others hold on them now. */
export async function endUsage(db: DB, r: RunRecord) {
  if (sampling) await sampling;
  states.delete(r.id);
  const cur = getRun(db, r.id);
  if (!cur?.gpuIds?.length || cur.others?.end || !cur.others?.start || (cur.where ?? 'local') !== 'local' || cur.remote) return;
  const gpus = await reader.gpus().catch((): GpuUse[] => []);
  if (!gpus.length) return;
  updateRun(db, r.id, { info: { others: { ...cur.others, end: cur.gpuIds.map((i) => round((gpus.find((g) => g.index === i)?.memUsed ?? 0) / 1024)) } } });
}
