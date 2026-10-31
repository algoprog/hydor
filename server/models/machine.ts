// What this machine has for running models (GPUs, memory, disk), and whether a model fits: the memory
// it needs, where it would run, and roughly how fast. Decoding a token reads every weight once, so
// speed follows memory bandwidth over the bytes of the weights.
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

export async function machine(modelsDir: string): Promise<MachineInfo> {
  if (!gpuCache || Date.now() - gpuCache.at > 10_000) gpuCache = { at: Date.now(), gpus: await nvidiaSmi() };
  return { gpus: gpuCache.gpus, ramBytes: os.totalmem(), ramFreeBytes: memAvailable(), diskFreeBytes: diskFree(modelsDir), cpus: os.cpus().length };
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

/**
 * Whether a model with weights of `weightBytes` fits, with room for `cacheBytes` of context cache:
 * on a GPU (the one with the most free memory), in RAM on the CPU (`cpuOk`: the runtime can), or not.
 */
export function fit(m: MachineInfo, o: { weightBytes: number; cacheBytes: number; downloadBytes: number; params?: number; cpuOk: boolean }): ModelFit {
  // Runtimes keep some memory for themselves and for activations.
  const need = o.weightBytes * 1.1 + o.cacheBytes + 0.6 * GiB;
  const notes: string[] = [];
  const gpu = [...m.gpus].sort((a, b) => b.freeBytes - a.freeBytes)[0];
  const disk = o.downloadBytes < m.diskFreeBytes - 2 * GiB;
  let f: ModelFit;
  if (gpu && need <= gpu.freeBytes - 0.5 * GiB) {
    // Small models stop gaining from bandwidth: kernel launches and sampling set a ceiling.
    const tps = Math.min(250, Math.round((0.55 * gpuBandwidth(gpu.name) * 1e9) / Math.max(o.weightBytes, 1e8)));
    f = { verdict: 'good', where: 'gpu', gpu: gpu.index, needBytes: need, tokensPerSec: tps, downloadBytes: o.downloadBytes, params: o.params, notes };
    notes.push(`Needs about ${gb(need)} of GPU memory; GPU ${gpu.index} (${gpu.name.replace('NVIDIA ', '')}) has ${gb(gpu.freeBytes)} free.`);
  } else if (o.cpuOk && need <= m.ramFreeBytes - 2 * GiB) {
    const tps = Math.max(1, Math.min(60, Math.round((0.5 * CPU_BANDWIDTH * 1e9) / Math.max(o.weightBytes, 1e8))));
    f = { verdict: tps >= 8 ? 'slow' : 'tight', where: 'cpu', needBytes: need, tokensPerSec: tps, downloadBytes: o.downloadBytes, params: o.params, notes };
    notes.push(gpu ? `Too big for the free GPU memory (${gb(gpu.freeBytes)} on GPU ${gpu.index}), so it runs on the CPU, slower.` : 'No GPU here, so it runs on the CPU.');
    notes.push(`Needs about ${gb(need)} of RAM; ${gb(m.ramFreeBytes)} is available.`);
  } else {
    f = { verdict: 'no', where: 'none', needBytes: need, downloadBytes: o.downloadBytes, params: o.params, notes };
    notes.push(
      gpu
        ? `Needs about ${gb(need)}: more than GPU ${gpu.index} has free (${gb(gpu.freeBytes)})${o.cpuOk ? ` and than the available RAM (${gb(m.ramFreeBytes)})` : ''}.`
        : `Needs about ${gb(need)}${o.cpuOk ? `, more than the available RAM (${gb(m.ramFreeBytes)})` : ', and this runtime needs a GPU'}.`,
    );
  }
  if (!disk) {
    f.verdict = 'no';
    notes.push(`The download (${gb(o.downloadBytes)}) does not fit the free disk space (${gb(m.diskFreeBytes)}).`);
  } else notes.push(`Download ${gb(o.downloadBytes)}; ${gb(m.diskFreeBytes)} of disk is free.`);
  return f;
}

export const gb = (b: number) => (b >= 10 * GiB ? `${Math.round(b / GiB)} GB` : `${(b / GiB).toFixed(1)} GB`);

/** Bytes the context cache takes per token, from a model's config (full attention layers only). */
export function cachePerToken(cfg: Record<string, any>): number {
  const t = cfg.text_config ?? cfg;
  const layers = Number(t.num_hidden_layers ?? t.n_layer ?? 0);
  const heads = Number(t.num_attention_heads ?? t.n_head ?? 0);
  const kv = Number(t.num_key_value_heads ?? heads);
  const dim = Number(t.head_dim ?? (t.hidden_size && heads ? t.hidden_size / heads : 0));
  // Hybrid models (convolution or state-space layers) keep a cache only for their attention layers.
  const types: unknown[] = Array.isArray(t.layer_types) ? t.layer_types : Array.isArray(t.layers_block_type) ? t.layers_block_type : [];
  const attn = types.length ? types.filter((x) => /attn|attention/i.test(String(x))).length : Array.isArray(t.full_attn_idxs) ? t.full_attn_idxs.length : layers;
  return attn && kv && dim ? 2 * attn * kv * dim * 2 : 0;
}
