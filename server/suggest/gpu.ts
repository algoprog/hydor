// Where a run of learning is done: on the processor, or on the graphics card when there is one the person has left alone
// (an NVIDIA card with room and not busy, or a Mac's own). The choice is made at the start of every run, from what the
// computer says then, and everything it needs from outside (the platform, the environment, nvidia-smi's answers) can be
// handed in, so the rules are checked without a card.
import { execFile } from 'node:child_process';
import { which } from '../documents/tools.ts';
import type { TrainDevice } from '../../shared/suggest.ts';

/** A card needs this much memory free (MiB) and must be less busy than this (percent) to be learned on. */
export const GPU_NEED_MB = 4096;
export const GPU_BUSY_MAX = 50;
/**
 * With this much free (MiB) a run does the whole batch in one piece (measured on an RTX 4090: about 5 GB at its peak); a
 * card with less does it in pieces of 1,024 tokens (the same gradient, under 4 GB at its peak, a little slower).
 */
export const GPU_ROOMY_MB = 6144;
/**
 * A card where another program already holds this much memory (MiB) is left alone: a model server on it (vLLM, Ollama,
 * llama.cpp) would be slowed while learning ran beside it. A desktop's own use of a card is far below this.
 */
export const GPU_OTHERS_MAX_MB = 1024;

export interface GpuInfo {
  index: number;
  name: string;
  freeMb: number;
  /** How busy it is (percent). */
  util: number;
}

/** The answer: where to learn, and when it is the processor although the graphics card was wanted, why not. */
export interface DevicePick {
  device: TrainDevice & { /** cuda: the card's number (CUDA_VISIBLE_DEVICES for the run), and the memory free on it (MiB) when it was chosen. */ index?: number; freeMb?: number };
  why?: string;
  /** cuda: the PyTorch build to use, such as cu126 (the newest the driver supports). */
  tag?: string;
}

/** The lines of `nvidia-smi --query-gpu=index,name,memory.free,utilization.gpu --format=csv,noheader,nounits`. */
export function parseGpus(csv: string): GpuInfo[] {
  const out: GpuInfo[] = [];
  for (const line of csv.split('\n')) {
    const f = line.split(',').map((x) => x.trim());
    if (f.length < 4) continue;
    const index = Number(f[0]);
    const freeMb = Number(f[f.length - 2]);
    const util = Number(f[f.length - 1]);
    // A card that reports "[N/A]" for its memory or use is one nothing can be said of: left out.
    if (!Number.isInteger(index) || index < 0 || !Number.isFinite(freeMb) || !Number.isFinite(util)) continue;
    out.push({ index, name: f.slice(1, -2).join(', '), freeMb, util });
  }
  return out;
}

/** The CUDA version the driver supports, from the header of plain `nvidia-smi` ("CUDA Version: 12.4"). */
export function parseCuda(text: string): [number, number] | null {
  const m = /CUDA Version:\s*(\d+)\.(\d+)/i.exec(text);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/** The PyTorch builds on download.pytorch.org that CUDA is installed for, newest first. */
const TAGS = ['cu130', 'cu129', 'cu128', 'cu126', 'cu124', 'cu121', 'cu118'] as const;
const tagVersion = (t: string): [number, number] => {
  const n = Number(t.slice(2));
  return n >= 1000 ? [Math.floor(n / 100), n % 100] : [Math.floor(n / 10), n % 10];
};
const atMost = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]);

/** The newest PyTorch build the driver supports (its CUDA version is at least the build's), or null when it is older than all. */
export function wheelTag(cuda: [number, number]): string | null {
  return TAGS.find((t) => atMost(tagVersion(t), cuda)) ?? null;
}

/** Whether a PyTorch build installed earlier (its tag) still suits a wanted one: it is not newer than the driver allows. */
export const tagSuits = (have: string, want: string) => /^cu\d+$/.test(have) && atMost(tagVersion(have), tagVersion(want));

/**
 * The cards this server's own CUDA_VISIBLE_DEVICES leaves to use: null when it is not set (all of them), else their
 * numbers (an empty list: none). Entries that are not numbers (a card's UUID) cannot be matched with nvidia-smi's
 * numbers: they leave none.
 */
export function visibleCards(env: string | undefined): number[] | null {
  if (env == null) return null;
  const out: number[] = [];
  for (const part of env.split(',')) {
    const t = part.trim();
    if (/^\d+$/.test(t)) out.push(Number(t));
    // CUDA stops reading the list at the first entry that is not a valid number.
    else break;
  }
  return out;
}

/**
 * The memory the largest program on each card holds (MiB), by the card's number: from
 * `--query-gpu=index,uuid` and `--query-compute-apps=gpu_uuid,used_memory` (both csv, noheader, nounits). Lines that
 * are not of that shape are passed over.
 */
export function othersByCard(uuids: string, apps: string): Map<number, number> {
  const byUuid = new Map<string, number>();
  for (const line of uuids.split('\n')) {
    const [i, u] = line.split(',').map((x) => x.trim());
    if (/^\d+$/.test(i ?? '') && /^GPU-/i.test(u ?? '')) byUuid.set(u, Number(i));
  }
  const out = new Map<number, number>();
  for (const line of apps.split('\n')) {
    const [u, mb] = line.split(',').map((x) => x.trim());
    const i = byUuid.get(u ?? '');
    const m = Number(mb);
    if (i == null || !Number.isFinite(m)) continue;
    out.set(i, Math.max(out.get(i) ?? 0, m));
  }
  return out;
}

/**
 * The card to learn on, or why none: the one with the most memory free among those with room, less than half busy and
 * with no other program holding GPU_OTHERS_MAX_MB or more on it.
 */
export function bestGpu(gpus: GpuInfo[], visible: number[] | null, others: Map<number, number> = new Map()): { gpu: GpuInfo } | { why: string } {
  if (!gpus.length) return { why: 'No NVIDIA graphics card was found' };
  const mine = visible ? gpus.filter((g) => visible.includes(g.index)) : gpus;
  if (!mine.length) return { why: 'CUDA_VISIBLE_DEVICES or HYDOR_SUGGEST_GPUS leaves no graphics card for this app' };
  const roomy = mine.filter((g) => g.freeMb >= GPU_NEED_MB && g.util < GPU_BUSY_MAX);
  if (!roomy.length) {
    const top = [...mine].sort((a, b) => b.freeMb - a.freeMb)[0];
    return { why: `No graphics card has ${GPU_NEED_MB / 1024} GB free and is less than half busy (${top.name} has ${(top.freeMb / 1024).toFixed(1)} GB free and is ${top.util}% busy)` };
  }
  const ok = roomy.filter((g) => (others.get(g.index) ?? 0) < GPU_OTHERS_MAX_MB);
  if (!ok.length) {
    const g = roomy[0];
    return { why: `Every graphics card with room is in use by another program (one holds ${((others.get(g.index) ?? 0) / 1024).toFixed(1)} GB on ${g.name} ${g.index})` };
  }
  return { gpu: ok.reduce((a, b) => (b.freeMb > a.freeMb ? b : a)) };
}

/** The cards both lists leave (a list that is null leaves all). */
const both = (a: number[] | null, b: number[] | null): number[] | null => (a == null ? b : b == null ? a : a.filter((i) => b.includes(i)));

/** Runs nvidia-smi (or the program HYDOR_SUGGEST_NVIDIA_SMI names, for a test) with arguments; its output, or null when it is not there or fails. */
export function nvidiaSmi(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  const exe = env.HYDOR_SUGGEST_NVIDIA_SMI || which('nvidia-smi', process.platform === 'win32' ? ['C:\\Windows\\System32\\nvidia-smi.exe', 'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'] : []);
  if (!exe) return Promise.resolve(null);
  return new Promise((resolve) => {
    // Its own short environment: nvidia-smi ignores CUDA_VISIBLE_DEVICES, and nothing of the app's goes to it.
    const e = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, HOME: process.env.HOME };
    execFile(exe, args, { timeout: 15_000, maxBuffer: 1 << 20, env: e as NodeJS.ProcessEnv, windowsHide: true }, (err, out) => resolve(err ? null : String(out)));
  });
}

export interface ChooseOptions {
  /** The setting "Learn on the graphics card". */
  enabled: boolean;
  platform?: string;
  arch?: string;
  /** The server's environment (CUDA_VISIBLE_DEVICES, HYDOR_SUGGEST_NVIDIA_SMI). */
  env?: NodeJS.ProcessEnv;
  /** nvidia-smi's output for the arguments, or null (by default it runs). */
  smi?: (args: string[]) => Promise<string | null>;
}

/** Where this run learns. */
export async function chooseDevice(o: ChooseOptions): Promise<DevicePick> {
  const cpu: DevicePick = { device: { kind: 'cpu' } };
  if (!o.enabled) return cpu;
  const platform = o.platform ?? process.platform;
  const arch = o.arch ?? process.arch;
  const env = o.env ?? process.env;
  if (platform === 'darwin') return arch === 'arm64' ? { device: { kind: 'mps', name: 'Apple silicon' } } : { ...cpu, why: 'Only a Mac with Apple silicon learns on its graphics' };
  if (platform !== 'linux' && platform !== 'win32') return { ...cpu, why: 'No graphics card support on this system' };
  if (platform === 'win32' && arch !== 'x64') return { ...cpu, why: 'PyTorch has no graphics card build for this computer' };
  const smi = o.smi ?? ((args: string[]) => nvidiaSmi(args, env));
  const list = await smi(['--query-gpu=index,name,memory.free,utilization.gpu', '--format=csv,noheader,nounits']);
  if (list == null) return { ...cpu, why: 'No NVIDIA graphics card was found' };
  const gpus = parseGpus(list);
  // What other programs hold on each card (a card they use is left alone); an answer that cannot be read leaves all cards in.
  const others = gpus.length ? othersByCard((await smi(['--query-gpu=index,uuid', '--format=csv,noheader,nounits'])) ?? '', (await smi(['--query-compute-apps=gpu_uuid,used_memory', '--format=csv,noheader,nounits'])) ?? '') : new Map<number, number>();
  // The server's own CUDA_VISIBLE_DEVICES, and HYDOR_SUGGEST_GPUS: the cards learning may use (both by number).
  const best = bestGpu(gpus, both(visibleCards(env.CUDA_VISIBLE_DEVICES), visibleCards(env.HYDOR_SUGGEST_GPUS)), others);
  if ('why' in best) return { ...cpu, why: best.why };
  const cuda = parseCuda((await smi([])) ?? '');
  if (!cuda) return { ...cpu, why: 'The graphics card driver did not say which CUDA version it supports' };
  const tag = wheelTag(cuda);
  if (!tag) return { ...cpu, why: `The graphics card driver is too old for PyTorch (it supports CUDA ${cuda[0]}.${cuda[1]}, PyTorch needs 11.8 or newer)` };
  return { device: { kind: 'cuda', name: best.gpu.name, index: best.gpu.index, freeMb: best.gpu.freeMb }, tag };
}
