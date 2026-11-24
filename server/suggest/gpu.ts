// Where a run of learning is done: on the processor, or on the graphics card when there is one to use (an NVIDIA card
// with room and not busy, one no other program uses first, else one a model server waits on idle; or a Mac's own). The
// choice is made at the start of every run, from what the computer says then, and everything it needs from outside (the
// platform, the environment, nvidia-smi's answers) can be handed in, so the rules are checked without a card.
import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
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
 * A program that holds this much memory (MiB) on a card is taken for a model server (vLLM, Ollama, llama.cpp…); a
 * desktop's own use of a card is far below it. A card with no such program is chosen first.
 */
export const GPU_OTHERS_MAX_MB = 1024;
/**
 * When every card with room has a model server on it (a computer that serves models on all its cards), learning shares
 * one whose server is idle: under this busy (percent) in each of GPU_SHARED_LOOKS looks a second apart, as one look can
 * fall between two of its requests. A server at work keeps its card well above it, and is not slowed. Refusing every
 * such card would leave the run hours on the processor instead, slowing everything on the computer, servers included.
 */
export const GPU_SHARED_BUSY_MAX = 20;
export const GPU_SHARED_LOOKS = 3;
/** On a card it shares, a run leaves this much memory (MiB) free beyond what it takes, for the programs already there. */
export const GPU_SPARE_MB = 2048;

export interface GpuInfo {
  index: number;
  name: string;
  freeMb: number;
  /** How busy it is (percent). */
  util: number;
}

/** The answer: where to learn, and when it is the processor although the graphics card was wanted, why not. */
export interface DevicePick {
  device: TrainDevice & { /** cuda: the card's number (CUDA_VISIBLE_DEVICES for the run), and the memory the run may take on it (MiB): what was free when it was chosen, less GPU_SPARE_MB on a card it shares. */ index?: number; freeMb?: number };
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
 * The card to learn on, or why none. Among the cards with room and less than half busy: the one with the most memory free
 * that no other program holds GPU_OTHERS_MAX_MB or more on; when a model server is on each of them, the one with the most
 * free whose server is idle (under GPU_SHARED_BUSY_MAX) and that has GPU_SPARE_MB more than the run needs, which the run
 * leaves to it (`shared`, with freeMb the memory the run may take).
 */
export function bestGpu(gpus: GpuInfo[], visible: number[] | null, others: Map<number, number> = new Map()): { gpu: GpuInfo; shared?: true } | { why: string } {
  if (!gpus.length) return { why: 'No NVIDIA graphics card was found' };
  const mine = visible ? gpus.filter((g) => visible.includes(g.index)) : gpus;
  if (!mine.length) return { why: 'CUDA_VISIBLE_DEVICES or HYDOR_SUGGEST_GPUS leaves no graphics card for this app' };
  const roomy = mine.filter((g) => g.freeMb >= GPU_NEED_MB && g.util < GPU_BUSY_MAX);
  if (!roomy.length) {
    const top = [...mine].sort((a, b) => b.freeMb - a.freeMb)[0];
    return { why: `No graphics card has ${GPU_NEED_MB / 1024} GB free and is less than half busy (${top.name} has ${(top.freeMb / 1024).toFixed(1)} GB free and is ${top.util}% busy)` };
  }
  const most = (l: GpuInfo[]) => l.reduce((a, b) => (b.freeMb > a.freeMb ? b : a));
  const own = roomy.filter((g) => (others.get(g.index) ?? 0) < GPU_OTHERS_MAX_MB);
  if (own.length) return { gpu: most(own) };
  const idle = roomy.filter((g) => g.util < GPU_SHARED_BUSY_MAX && g.freeMb >= GPU_NEED_MB + GPU_SPARE_MB);
  if (idle.length) {
    const g = most(idle);
    return { gpu: { ...g, freeMb: g.freeMb - GPU_SPARE_MB }, shared: true };
  }
  const g = most(roomy);
  return {
    why: `Every graphics card with room has a model server on it that is busy or leaves too little memory beside it (${g.name} ${g.index} is ${g.util}% busy with ${(g.freeMb / 1024).toFixed(1)} GB free; sharing a card takes under ${GPU_SHARED_BUSY_MAX}% busy and ${(GPU_NEED_MB + GPU_SPARE_MB) / 1024} GB free)`,
  };
}

/** Each card as the worst of several looks at it: the least memory free and the most busy seen. */
export function worstOf(looks: GpuInfo[][]): GpuInfo[] {
  return (looks[0] ?? []).map((g) => {
    const seen = looks.flatMap((l) => l.filter((h) => h.index === g.index));
    return { ...g, freeMb: Math.min(...seen.map((h) => h.freeMb)), util: Math.max(...seen.map((h) => h.util)) };
  });
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
  /** The time between two looks at a card it would share with a model server (ms; a second by default). */
  lookGapMs?: number;
}

const QUERY = ['--query-gpu=index,name,memory.free,utilization.gpu', '--format=csv,noheader,nounits'];

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
  const list = await smi(QUERY);
  if (list == null) return { ...cpu, why: 'No NVIDIA graphics card was found' };
  const gpus = parseGpus(list);
  // What other programs hold on each card (a card a model server is on is shared only while it is idle); an answer that
  // cannot be read counts no programs.
  const others = gpus.length ? othersByCard((await smi(['--query-gpu=index,uuid', '--format=csv,noheader,nounits'])) ?? '', (await smi(['--query-compute-apps=gpu_uuid,used_memory', '--format=csv,noheader,nounits'])) ?? '') : new Map<number, number>();
  // The server's own CUDA_VISIBLE_DEVICES, and HYDOR_SUGGEST_GPUS: the cards learning may use (both by number).
  const visible = both(visibleCards(env.CUDA_VISIBLE_DEVICES), visibleCards(env.HYDOR_SUGGEST_GPUS));
  let best = bestGpu(gpus, visible, others);
  // A card to share is looked at again, a second apart, and chosen only if it stays idle with room in every look (it may
  // then be another card that did). A look that cannot be read is passed over.
  if ('gpu' in best && best.shared) {
    const looks = [gpus];
    for (let i = 1; i < GPU_SHARED_LOOKS; i++) {
      await sleep(o.lookGapMs ?? 1000);
      const again = await smi(QUERY);
      if (again != null) looks.push(parseGpus(again));
    }
    best = bestGpu(worstOf(looks), visible, others);
  }
  if ('why' in best) return { ...cpu, why: best.why };
  const cuda = parseCuda((await smi([])) ?? '');
  if (!cuda) return { ...cpu, why: 'The graphics card driver did not say which CUDA version it supports' };
  const tag = wheelTag(cuda);
  if (!tag) return { ...cpu, why: `The graphics card driver is too old for PyTorch (it supports CUDA ${cuda[0]}.${cuda[1]}, PyTorch needs 11.8 or newer)` };
  return { device: { kind: 'cuda', name: best.gpu.name, index: best.gpu.index, freeMb: best.gpu.freeMb }, tag };
}
