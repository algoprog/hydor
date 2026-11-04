// What this machine has for running models (NVIDIA GPUs, or a Mac's Apple silicon, memory, disk), and whether a
// model fits: the memory it needs, where it would run (one GPU, split across several, the CPU), and roughly how fast.
// Decoding a token reads every weight once, so speed follows memory bandwidth over the bytes of the weights.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import type { MachineInfo, ModelFit } from '../../shared/types.ts';

const GiB = 1024 ** 3;

let gpuCache: { at: number; gpus: MachineInfo['gpus'] } | null = null;

function nvidiaSmi(): Promise<MachineInfo['gpus']> {
  return new Promise((resolve) =>
    execFile('nvidia-smi', ['--query-gpu=index,name,memory.total,memory.used', '--format=csv,noheader,nounits'], { timeout: 8000 }, (err, out) => {
      if (err) return resolve([]);
      resolve(
        String(out)
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => {
            const [index, name, total, used] = l.split(',').map((s) => s.trim());
            return { index: Number(index), name, totalBytes: Number(total) * 1024 ** 2, freeBytes: (Number(total) - Number(used)) * 1024 ** 2 };
          }),
      );
    }),
  );
}

function memAvailable(): number {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(fs.readFileSync('/proc/meminfo', 'utf8'));
    if (m) return Number(m[1]) * 1024;
  } catch {}
  return os.freemem();
}

function diskFree(dir: string): number {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const s = fs.statfsSync(dir);
    return s.bavail * s.bsize;
  } catch {
    return 0;
  }
}

let chip: Promise<string> | null = null;

/** A Mac's Apple silicon chip, by name ("Apple M3 Max"). */
function appleChip(): Promise<string> {
  chip ??= new Promise((resolve) =>
    execFile('sysctl', ['-n', 'machdep.cpu.brand_string'], { timeout: 4000 }, (err, out) => resolve(!err && String(out).trim() ? String(out).trim() : (os.cpus()[0]?.model ?? 'Apple silicon'))),
  );
  return chip;
}

export const isAppleSilicon = () => process.platform === 'darwin' && process.arch === 'arm64';

export async function machine(modelsDir: string): Promise<MachineInfo> {
  if (!gpuCache || Date.now() - gpuCache.at > 10_000) gpuCache = { at: Date.now(), gpus: isAppleSilicon() ? [] : await nvidiaSmi() };
  return {
    gpus: gpuCache.gpus,
    ramBytes: os.totalmem(),
    ramFreeBytes: memAvailable(),
    diskFreeBytes: diskFree(modelsDir),
    cpus: os.cpus().length,
    ...(isAppleSilicon() ? { apple: { chip: await appleChip() } } : {}),
  };
}

/** Memory bandwidth in GB/s of common GPUs (the speed estimate's main input); others count as 400. */
const BANDWIDTH: [RegExp, number][] = [
  [/H200/, 4800],
  [/H100/, 3350],
  [/A100/, 1900],
  [/5090/, 1790],
  [/4090/, 1008],
  [/3090/, 936],
  [/L40/, 864],
  [/A6000/, 768],
  [/5080/, 960],
  [/4080/, 717],
  [/3080/, 760],
  [/4070/, 504],
  [/3060/, 360],
  [/T4\b/, 320],
];
const gpuBandwidth = (name: string) => BANDWIDTH.find(([re]) => re.test(name))?.[1] ?? 400;
/** A desktop or server CPU's memory bandwidth in practice, GB/s. */
const CPU_BANDWIDTH = 60;
/** Apple silicon's memory bandwidth by the kind of chip, GB/s (an M4 Max has more, an M1 less: near enough). */
const appleBandwidth = (chip: string) => (/Ultra/.test(chip) ? 800 : /Max/.test(chip) ? 400 : /Pro/.test(chip) ? 200 : 100);
/** The share of a Mac's memory its graphics may use (macOS keeps the rest for itself and the apps). */
const APPLE_GPU_SHARE = 0.7;

type Gpu = MachineInfo['gpus'][number];

/** Room each card keeps for itself: the runtime's own memory and what the desktop uses. */
const GPU_SPARE = 0.5 * GiB;

/** Cards that take a 16-bit model at 8-bit as vLLM loads it (FP8: Ampere and newer); older ones do not. */
export const fp8Card = (name: string) => !/\b(T4|V100|P100|P40|P4|K80|M60|GTX|RTX 20\d\d|Quadro RTX|TITAN (V|RTX))\b/i.test(name);

/**
 * The NVIDIA cards that hold `need` bytes: the one with the most free memory; or, with `need8` (what it needs at
 * 8-bit, a 16-bit model vLLM can store as FP8 as it loads), that one at 8-bit; or, with `split` (vLLM's tensor
 * parallelism), the fewest of 2, 4 or 8 with the most free memory, each holding its share and a runtime of its own,
 * at full size and then at 8-bit. `only` keeps to one card.
 */
export function gpuPlan(m: MachineInfo, need: number, o: { split?: boolean; only?: number; need8?: number } = {}): { gpus: Gpu[]; perGpu: number; fp8?: boolean } | null {
  const free = (o.only != null ? m.gpus.filter((g) => g.index === o.only) : [...m.gpus]).sort((a, b) => b.freeBytes - a.freeBytes);
  if (!free.length) return null;
  if (need <= free[0].freeBytes - GPU_SPARE) return { gpus: [free[0]], perGpu: need };
  const eight = o.need8 && free.filter((g) => fp8Card(g.name));
  if (eight && eight.length && o.need8! <= eight[0].freeBytes - GPU_SPARE) return { gpus: [eight[0]], perGpu: o.need8!, fp8: true };
  if (!o.split || o.only != null) return null;
  for (const [bytes, fp8] of [[need, false], ...(o.need8 ? [[o.need8, true]] : [])] as [number, boolean][]) {
    const pool = fp8 ? free.filter((g) => fp8Card(g.name)) : free;
    for (const n of [2, 4, 8]) {
      if (n > pool.length) break;
      const cards = pool.slice(0, n).sort((a, b) => a.index - b.index);
      const perGpu = bytes / n + 0.6 * GiB;
      if (cards.every((g) => perGpu <= g.freeBytes - GPU_SPARE)) return { gpus: cards, perGpu, ...(fp8 ? { fp8 } : {}) };
    }
  }
  return null;
}

/**
 * Whether a model with weights of `weightBytes` fits, with room for `cacheBytes` of context cache: on an NVIDIA
 * GPU (the one with the most free memory, or with `split` several, as vLLM's tensor parallelism shares a model out),
 * on a Mac's Apple silicon graphics (`cpuOk` or `metal`: runtimes that run there, which use its shared memory), in RAM on the
 * CPU (`cpuOk`: the runtime can), or not. `eight`: the weights are 16-bit and vLLM may store them at 8-bit as it loads
 * them (FP8), when they do not fit as they are. `active` is the bytes read for each token when that is fewer than the
 * weights (a mixture of experts), for its speed.
 */
export function fit(
  m: MachineInfo,
  o: { weightBytes: number; cacheBytes: number; downloadBytes: number; params?: number; cpuOk: boolean; split?: boolean; metal?: boolean; eight?: boolean; active?: number },
): ModelFit {
  // Runtimes keep some memory for themselves and for activations.
  const need = o.weightBytes * 1.1 + o.cacheBytes + 0.6 * GiB;
  const notes: string[] = [];
  const gpu = [...m.gpus].sort((a, b) => b.freeBytes - a.freeBytes)[0];
  const plan = gpuPlan(m, need, { split: o.split, ...(o.eight ? { need8: o.weightBytes * 0.55 + o.cacheBytes + 0.6 * GiB } : {}) });
  // At 8-bit each word reads half as much.
  const read = Math.max(Math.min(o.active ?? o.weightBytes, o.weightBytes) * (plan?.fp8 ? 0.5 : 1), 1e8);
  const eightNote = plan?.fp8 ? ' at 8-bit (FP8), which vLLM does as it loads it' : '';
  const disk = o.downloadBytes < m.diskFreeBytes - 2 * GiB;
  let f: ModelFit;
  if (plan && plan.gpus.length === 1) {
    const g = plan.gpus[0];
    // Small models stop gaining from bandwidth: kernel launches and sampling set a ceiling.
    const tps = Math.min(250, Math.round((0.55 * gpuBandwidth(g.name) * 1e9) / read));
    f = { verdict: 'good', where: 'gpu', gpu: g.index, needBytes: plan.perGpu, tokensPerSec: tps, downloadBytes: o.downloadBytes, params: o.params, notes, ...(plan.fp8 ? { fp8: true } : {}) };
    notes.push(`Needs about ${gb(plan.perGpu)} of GPU memory${eightNote}; GPU ${g.index} (${g.name.replace('NVIDIA ', '')}) has ${gb(g.freeBytes)} free.`);
  } else if (plan) {
    // Split across cards, each reads its share of every token, a little less efficiently.
    const n = plan.gpus.length;
    const tps = Math.min(250, Math.round((0.45 * n * Math.min(...plan.gpus.map((g) => gpuBandwidth(g.name))) * 1e9) / read));
    f = { verdict: 'good', where: 'gpu', gpu: plan.gpus[0].index, gpus: plan.gpus.map((g) => g.index), needBytes: plan.perGpu * n, tokensPerSec: tps, downloadBytes: o.downloadBytes, params: o.params, notes, ...(plan.fp8 ? { fp8: true } : {}) };
    notes.push(`Needs about ${gb(plan.perGpu * n)} of GPU memory${eightNote}, split across ${n} GPUs (${plan.gpus.map((g) => g.index).join(', ')}): about ${gb(plan.perGpu)} on each.`);
  } else if (m.apple && (o.cpuOk || o.metal) && need <= m.ramBytes * APPLE_GPU_SHARE) {
    const tps = Math.min(200, Math.round((0.6 * appleBandwidth(m.apple.chip) * 1e9) / read));
    f = { verdict: tps >= 8 ? 'good' : 'slow', where: 'gpu', needBytes: need, tokensPerSec: tps, downloadBytes: o.downloadBytes, params: o.params, notes };
    notes.push(`Needs about ${gb(need)} of the ${gb(m.ramBytes)} of memory the ${m.apple.chip} shares with its graphics.`);
  } else if (o.cpuOk && need <= m.ramFreeBytes - 2 * GiB) {
    const tps = Math.max(1, Math.min(60, Math.round((0.5 * CPU_BANDWIDTH * 1e9) / read)));
    f = { verdict: tps >= 8 ? 'slow' : 'tight', where: 'cpu', needBytes: need, tokensPerSec: tps, downloadBytes: o.downloadBytes, params: o.params, notes };
    notes.push(
      gpu
        ? `Too big for the free GPU memory (${gb(gpu.freeBytes)} on GPU ${gpu.index}), so it runs on the CPU, slower.`
        : m.apple
          ? `Too big for the share of memory the ${m.apple.chip}'s graphics may use, so it runs on the CPU, slower.`
          : 'No GPU here, so it runs on the CPU.',
    );
    notes.push(`Needs about ${gb(need)} of RAM; ${gb(m.ramFreeBytes)} is available.`);
  } else {
    f = { verdict: 'no', where: 'none', needBytes: need, downloadBytes: o.downloadBytes, params: o.params, notes };
    const all = m.gpus.reduce((a, g) => a + g.freeBytes, 0);
    notes.push(
      gpu
        ? `Needs about ${gb(need)}: more than GPU ${gpu.index} has free (${gb(gpu.freeBytes)})${o.split && m.gpus.length > 1 ? `, and than ${m.gpus.length} GPUs have together (${gb(all)})` : ''}${o.cpuOk ? ` and than the available RAM (${gb(m.ramFreeBytes)})` : ''}.`
        : `Needs about ${gb(need)}${o.cpuOk ? `, more than the available ${m.apple ? 'memory' : 'RAM'} (${gb(m.apple ? m.ramBytes * APPLE_GPU_SHARE : m.ramFreeBytes)})` : ', and this runtime needs an NVIDIA GPU'}.`,
    );
  }
  if (!disk) {
    f.verdict = 'no';
    notes.push(`The download (${gb(o.downloadBytes)}) does not fit the free disk space (${gb(m.diskFreeBytes)}).`);
  } else notes.push(`Download ${gb(o.downloadBytes)}; ${gb(m.diskFreeBytes)} of disk is free.`);
  return f;
}

export const gb = (b: number) => (b >= 10 * GiB ? `${Math.round(b / GiB)} GB` : `${(b / GiB).toFixed(1)} GB`);

/**
 * Bytes the context cache takes for each token of a conversation `ctx` tokens long, from a model's config: keys and
 * values at 16 bits for each attention layer. Hybrid models (convolution or state-space layers) keep a cache only for
 * their attention layers; a sliding-window layer keeps only its window, whatever the length; full-attention layers
 * may have fewer, wider heads of their own (Gemma 4's global ones).
 */
export function cachePerToken(cfg: Record<string, any>, ctx = 32768): number {
  const t = cfg.text_config ?? cfg;
  const layers = Number(t.num_hidden_layers ?? t.n_layer ?? 0);
  const heads = Number(t.num_attention_heads ?? t.n_head ?? 0);
  const kv = Number(t.num_key_value_heads ?? heads);
  const dim = Number(t.head_dim ?? (t.hidden_size && heads ? t.hidden_size / heads : 0));
  if (!kv || !dim) return 0;
  const per = 2 * kv * dim * 2;
  const perFull = Number(t.num_global_key_value_heads) > 0 && Number(t.global_head_dim) > 0 ? 2 * Number(t.num_global_key_value_heads) * Number(t.global_head_dim) * 2 : per;
  const types: string[] = (Array.isArray(t.layer_types) ? t.layer_types : Array.isArray(t.layers_block_type) ? t.layers_block_type : []).map(String);
  if (types.length) {
    const sliding = types.filter((x) => /sliding|local/i.test(x)).length;
    const full = types.filter((x) => /attn|attention|global/i.test(x) && !/sliding|local/i.test(x)).length;
    const window = Number(t.sliding_window) > 0 ? Math.min(1, Number(t.sliding_window) / Math.max(1, ctx)) : 1;
    return Math.round(full * perFull + sliding * per * window);
  }
  return (Array.isArray(t.full_attn_idxs) ? t.full_attn_idxs.length : layers) * per;
}
