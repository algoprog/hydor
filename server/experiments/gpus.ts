// The GPUs a run can have: read with nvidia-smi (as Monitor does, server/system.ts: a missing nvidia-smi is
// checked again in a while, a failed reading only loses that reading), and chosen for a job: GPUs with enough
// free memory that no other run of yours holds, or (a job that says how much it needs, with sharing on) that has room
// left beside the runs of yours on it; an empty one first, then the one that leaves the most room. When none fits,
// why, in words. The reader can be swapped for a stand-in (the tests have no GPU).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import type { GpuNow } from '../../shared/experiments.ts';

/** A program holding memory on a GPU, as nvidia-smi lists it. `run`: the run of this app that started it (its HYDOR_RUN). */
export interface GpuApp {
  gpu: number;
  name: string;
  /** MiB. */
  mem: number;
  run?: string;
}

export interface GpuReading {
  gpus: GpuNow[];
  /** missing: no nvidia-smi (or no driver); failed: one reading went wrong. */
  error?: 'missing' | 'failed';
  /** The programs on the GPUs, when they were asked for and could be read. */
  apps?: GpuApp[];
}

export type Exec = (cmd: string, args: string[], timeoutMs?: number) => Promise<{ out: string; code: string | number | null }>;

/** Runs a program; its output and the error code (ENOENT: not installed). */
export const execProgram: Exec = (cmd, args, timeoutMs = 8000) =>
  new Promise((resolve) => {
    try {
      execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 << 20 }, (e, out) => resolve({ out: String(out ?? ''), code: e ? ((e as NodeJS.ErrnoException).code ?? 'failed') : null }));
    } catch (e) {
      resolve({ out: '', code: (e as NodeJS.ErrnoException).code ?? 'failed' });
    }
  });

/** nvidia-smi's CSV (index, name, memory used and total in MiB, utilization), as GPUs. */
export function parseGpus(out: string): GpuNow[] {
  const num = (s: string | undefined) => {
    const n = Number(String(s ?? '').trim());
    return Number.isFinite(n) ? n : 0;
  };
  return out
    .trim()
    .split('\n')
    .map((l) => l.split(',').map((x) => x.trim()))
    .filter((f) => f.length >= 4 && /^\d+$/.test(f[0]))
    .map((f) => ({ index: num(f[0]), name: f[1] ?? '', memUsed: num(f[2]), memTotal: num(f[3]), util: num(f[4]) }));
}

const QUERY = ['--query-gpu=index,name,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'];
const RECHECK_MS = 5 * 60_000;
let offUntil = 0;

/** This computer's GPUs now. */
async function nvidiaSmi(run: Exec = execProgram): Promise<GpuReading> {
  if (Date.now() < offUntil) return { gpus: [], error: 'missing' };
  const { out, code } = await run('nvidia-smi', QUERY, 8000);
  const gpus = parseGpus(out);
  if (gpus.length) return { gpus };
  if (code === 'ENOENT' || code === 9) {
    offUntil = Date.now() + RECHECK_MS;
    return { gpus: [], error: 'missing' };
  }
  return { gpus: [], error: 'failed' };
}

/** The run of this app a process belongs to, from its environment (null: it cannot be told, so it is not counted). */
function runOfProcess(pid: number): { run?: string } | null {
  try {
    const m = /(?:^|\0)HYDOR_RUN=([a-z0-9]{4,32})(?:\0|$)/.exec(fs.readFileSync(`/proc/${pid}/environ`, 'utf8'));
    return m ? { run: m[1] } : {};
  } catch (e) {
    // Another user's process: not one of this app's runs. A pid that is not here (a container's own numbering, no /proc): unknown.
    const code = (e as NodeJS.ErrnoException).code;
    return code === 'EACCES' || code === 'EPERM' ? {} : null;
  }
}

/** nvidia-smi's list of the GPUs' ids and of the programs on them, as programs by GPU. */
export function parseApps(ids: string, apps: string, runOf: (pid: number) => { run?: string } | null): GpuApp[] {
  const index = new Map(
    ids
      .trim()
      .split('\n')
      .map((l) => l.split(',').map((x) => x.trim()))
      .filter((f) => /^\d+$/.test(f[0]) && f[1])
      .map((f) => [f[1], Number(f[0])] as const),
  );
  const out: GpuApp[] = [];
  for (const line of apps.trim().split('\n')) {
    const [uuid, pid, mem, ...name] = line.split(',').map((x) => x.trim());
    const gpu = index.get(uuid);
    if (gpu === undefined || !/^\d+$/.test(pid ?? '') || !(Number(mem) > 0)) continue;
    const whose = runOf(Number(pid));
    if (whose) out.push({ gpu, name: name.join(','), mem: Number(mem), ...whose });
  }
  return out;
}

async function nvidiaApps(run: Exec = execProgram): Promise<GpuApp[] | undefined> {
  const [ids, apps] = await Promise.all([
    run('nvidia-smi', ['--query-gpu=index,uuid', '--format=csv,noheader'], 8000),
    run('nvidia-smi', ['--query-compute-apps=gpu_uuid,pid,used_memory,process_name', '--format=csv,noheader,nounits'], 8000),
  ]);
  return ids.code === null && apps.code === null ? parseApps(ids.out, apps.out, runOfProcess) : undefined;
}

/** The programs on the GPUs are looked at again at most this often: a waiting run asks on every pass of the queue. */
const APPS_MS = 10_000;
let lastApps: { at: number; apps?: GpuApp[] } | null = null;

let reader: (o?: { apps?: boolean }) => Promise<GpuReading> = async (o) => {
  const reading = await nvidiaSmi();
  if (!o?.apps || !reading.gpus.length) return reading;
  if (!lastApps || Date.now() - lastApps.at >= APPS_MS) lastApps = { at: Date.now(), apps: await nvidiaApps() };
  return lastApps.apps ? { ...reading, apps: lastApps.apps } : reading;
};

/** This computer's GPUs; with `apps`, the programs on them too. */
export const readGpus = (o?: { apps?: boolean }) => reader(o);

/** For the tests: GPUs as given, no nvidia-smi. */
export function setGpuReader(fn: (o?: { apps?: boolean }) => Promise<GpuReading>) {
  reader = fn;
}

/** The GPUs of a machine reached another way (a cluster over SSH): the same reading, through `run`. */
export const gpusVia = (run: Exec) => nvidiaSmi(run);

const gb = (mib: number) => mib / 1024;
const showGb = (mib: number) => `${Math.floor(gb(mib) * 10) / 10} GB`.replace('.0 GB', ' GB');

/** "GPU 2", "GPUs 0 and 3", "GPUs 0, 1 and 3". */
export function gpuList(ids: number[]): string {
  if (ids.length === 1) return `GPU ${ids[0]}`;
  return `GPUs ${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

/** Free memory a GPU needs when the job does not say: almost all of it (a GPU nobody uses). */
export const IDLE_SHARE = 0.9;

/** A run of yours on a GPU: the memory it asked for there (MiB); null: it takes the GPU to itself. */
export interface Occupant {
  id: string;
  ask: number | null;
}

/** What a run takes of a GPU: the memory it says it needs, unless it wants the GPU to itself or does not say. */
export const askOf = (r: { gpuMemGb?: number; alone?: boolean }): number | null => (r.gpuMemGb && !r.alone ? r.gpuMemGb * 1024 : null);

/** Kept free on a GPU that is shared: 1 GB or 5% of the card, the larger. */
export const marginOf = (memTotal: number) => Math.max(1024, 0.05 * memTotal);

/**
 * Whether a run fits on a GPU with these runs of yours on it, and the memory (MiB) that counts when GPUs are compared;
 * null: it does not. With none on it: enough free memory (none given: almost all of it). Beside others: only a run that
 * says how much it needs, beside runs that said so too, when the total minus the larger of what is used now and what
 * those runs asked for (one just started has not taken it yet), minus the margin, is at least what it asks.
 */
export function roomOn(g: GpuNow, memGb: number | undefined, alone: boolean | undefined, on: Occupant[] = []): number | null {
  if (!on.length) {
    const free = g.memTotal - g.memUsed;
    return (memGb ? gb(free) >= memGb : free >= IDLE_SHARE * g.memTotal) ? free - (memGb ?? 0) * 1024 : null;
  }
  const ask = askOf({ gpuMemGb: memGb, alone });
  if (ask === null || on.some((o) => o.ask === null)) return null;
  const taken = Math.max(g.memUsed, on.reduce((a, o) => a + o.ask!, 0));
  const left = g.memTotal - taken - marginOf(g.memTotal) - ask;
  return left >= 0 ? left : null;
}

/** Memory on a GPU held by what is not this app's runs; `said`: the programs nvidia-smi lists there, which a reason names. */
export interface Others {
  mem: number;
  said?: { mem: number; name?: string; many: boolean };
}

/** A program's name alone: no folders, no arguments (nvidia-smi may give a path or a whole command line). */
const programName = (s: string) => {
  const first = s.trim().split(/\s+/)[0] ?? '';
  const name = first.split(/[\\/]/).pop() ?? '';
  return /^[\w.+-]{1,40}$/.test(name) ? name : undefined;
};

/**
 * What other programs hold on each GPU. On a GPU with none of your runs, all that is used there; beside runs of yours,
 * what the programs on it that none of them started hold (when the programs could not be read, it cannot be told).
 */
export function othersOn(reading: GpuReading, yours: Map<number, Occupant[]>, going: Set<string>): Map<number, Others> {
  const out = new Map<number, Others>();
  for (const g of reading.gpus) {
    const apps = (reading.apps ?? []).filter((a) => a.gpu === g.index && !(a.run && going.has(a.run))).sort((a, b) => b.mem - a.mem);
    const listed = Math.min(g.memUsed, apps.reduce((a, x) => a + x.mem, 0));
    const mem = yours.get(g.index)?.length ? listed : g.memUsed;
    const many = new Set(apps.map((a) => programName(a.name))).size > 1;
    if (mem > 0) out.set(g.index, { mem, ...(listed > 0 ? { said: { mem: listed, name: programName(apps[0].name), many } } : {}) });
  }
  return out;
}

/** "another program (ollama) holds 9 GB on GPU 2". */
const otherWords = (gpu: number, o: NonNullable<Others['said']>) =>
  o.many ? `other programs${o.name ? ` (${o.name} and more)` : ''} hold ${showGb(o.mem)} on GPU ${gpu}` : `another program${o.name ? ` (${o.name})` : ''} holds ${showGb(o.mem)} on GPU ${gpu}`;

export interface ChooseOptions {
  /** Your runs on each GPU, when runs share GPUs (left out: `held` says which GPUs are taken). */
  on?: Map<number, Occupant[]>;
  /** The job wants its GPUs to itself. */
  alone?: boolean;
  /** What other programs hold, for the reason. */
  others?: Map<number, Others>;
}

/** Whether other programs' memory is why a job does not fit on a GPU, with the runs of yours on it as they are, or once they are gone. */
function othersInTheWay(g: GpuNow, mem: number, memGb: number | undefined, o: ChooseOptions, held: boolean): boolean {
  const without = { ...g, memUsed: Math.max(0, g.memUsed - mem) };
  const on = o.on?.get(g.index) ?? [];
  if (on.length && roomOn(without, memGb, o.alone, on) !== null) return true;
  if (!on.length && !held) return roomOn(without, memGb, o.alone) !== null;
  // Once your runs there are gone: would theirs alone still keep it out?
  return roomOn({ ...g, memUsed: mem }, memGb, o.alone) === null && roomOn({ ...g, memUsed: 0 }, memGb, o.alone) !== null;
}

/**
 * GPUs for a job that needs `need` of them with `memGb` free each (none given: a GPU almost all free), leaving out
 * those `held`. Without `on`, the freest first, the less busy on a tie. With `on` (runs share GPUs), an empty one
 * first, then the one that leaves the most room. When too few fit, why, in words.
 */
export function chooseGpus(gpus: GpuNow[], need: number, memGb: number | undefined, held: Set<number>, o: ChooseOptions = {}): { ids: number[] } | { why: string } {
  const on = (g: GpuNow) => o.on?.get(g.index) ?? [];
  const open = gpus.filter((g) => !held.has(g.index));
  const fit = open
    .map((g) => ({ g, left: roomOn(g, memGb, o.alone, on(g)) }))
    .filter((x) => x.left !== null)
    .sort((a, b) => (on(a.g).length ? 1 : 0) - (on(b.g).length ? 1 : 0) || b.left! - a.left! || a.g.util - b.g.util)
    .map((x) => x.g);
  if (fit.length >= need) return { ids: fit.slice(0, need).map((g) => g.index) };
  const what = memGb ? `with ${showGb(memGb * 1024)} free${need > 1 ? ' each' : ''}` : 'that is free';
  const head = `Waiting for ${need === 1 ? `1 GPU ${what}` : `${need} GPUs ${memGb ? what : 'that are free'}`}`;
  const yours = gpus.filter((g) => !fit.includes(g) && (held.has(g.index) || on(g).length)).map((g) => g.index);
  const parts: string[] = [];
  if (fit.length) parts.push(`${fit.length === 1 ? `only ${gpuList(fit.map((g) => g.index))} has that` : `${fit.length} have that (${gpuList(fit.map((g) => g.index))})`} now`);
  else {
    const empty = open.filter((g) => !on(g).length);
    if (empty.length) {
      const most = [...empty].sort((a, b) => b.memTotal - b.memUsed - (a.memTotal - a.memUsed))[0];
      parts.push(`the most free now is ${showGb(most.memTotal - most.memUsed)}, on GPU ${most.index}`);
    }
  }
  for (const g of gpus) {
    const other = o.others?.get(g.index);
    if (other?.said && !fit.includes(g) && othersInTheWay(g, other.said.mem, memGb, o, held.has(g.index))) parts.push(otherWords(g.index, other.said));
  }
  if (yours.length) parts.push(`your other runs hold ${gpuList(yours)}`);
  return { why: `${head}: ${parts.join('; ') || 'none is free now'}` };
}
