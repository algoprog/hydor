// The GPUs a run can have: read with nvidia-smi (as Monitor does, server/system.ts: a missing nvidia-smi is
// checked again in a while, a failed reading only loses that reading), and chosen for a job: GPUs with enough
// free memory that no other run of yours holds, the freest first. When none fits, why, in words. The reader can be
// swapped for a stand-in (the tests have no GPU).
import { execFile } from 'node:child_process';
import type { GpuNow } from '../../shared/experiments.ts';

export interface GpuReading {
  gpus: GpuNow[];
  /** missing: no nvidia-smi (or no driver); failed: one reading went wrong. */
  error?: 'missing' | 'failed';
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

let reader: () => Promise<GpuReading> = () => nvidiaSmi();

export const readGpus = () => reader();

/** For the tests: GPUs as given, no nvidia-smi. */
export function setGpuReader(fn: () => Promise<GpuReading>) {
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

/**
 * GPUs for a job that needs `need` of them with `memGb` free each (none given: a GPU almost all free), leaving out
 * those `held` by other runs of yours; the freest first, the less busy on a tie. When too few fit, why, in words.
 */
export function chooseGpus(gpus: GpuNow[], need: number, memGb: number | undefined, held: Set<number>): { ids: number[] } | { why: string } {
  const enough = (g: GpuNow) => (memGb ? gb(g.memTotal - g.memUsed) >= memGb : g.memTotal - g.memUsed >= IDLE_SHARE * g.memTotal);
  const open = gpus.filter((g) => !held.has(g.index));
  const fit = open.filter(enough).sort((a, b) => b.memTotal - b.memUsed - (a.memTotal - a.memUsed) || a.util - b.util);
  if (fit.length >= need) return { ids: fit.slice(0, need).map((g) => g.index) };
  const what = memGb ? `with ${showGb(memGb * 1024)} free${need > 1 ? ' each' : ''}` : 'that is free';
  const head = `Waiting for ${need === 1 ? `1 GPU ${what}` : `${need} GPUs ${memGb ? what : 'that are free'}`}`;
  const yours = gpus.filter((g) => held.has(g.index)).map((g) => g.index);
  const parts: string[] = [];
  if (fit.length) parts.push(`${fit.length === 1 ? `only ${gpuList(fit.map((g) => g.index))} has that` : `${fit.length} have that (${gpuList(fit.map((g) => g.index))})`} now`);
  else if (open.length) {
    const most = [...open].sort((a, b) => b.memTotal - b.memUsed - (a.memTotal - a.memUsed))[0];
    parts.push(`the most free now is ${showGb(most.memTotal - most.memUsed)}, on GPU ${most.index}`);
  }
  if (yours.length) parts.push(`your other runs hold ${gpuList(yours)}`);
  return { why: `${head}: ${parts.join('; ') || 'none is free now'}` };
}
