// vLLM (docs.vllm.ai) serving models downloaded from Hugging Face: one server per model, on its own
// port and the GPU with room for it, or split across 2, 4 or 8 GPUs (tensor parallelism) when no one GPU has
// room. Servers run detached and outlive restarts of the app; vllm.json says what runs where.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { MachineInfo, VllmServer } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { agentBaseEnv } from '../env.ts';
import { LOG_DIR, MODELS_DIR } from './config.ts';
import { LOCAL_CONTEXT } from './hf.ts';
import { cachePerToken, gb, gpuPlan } from './machine.ts';

const GiB = 1024 ** 3;
const STATE = path.join(MODELS_DIR, 'vllm.json');

export interface VllmInfo {
  path: string;
  version: string;
  /** Architectures it can run (from its model registry). */
  archs: Set<string>;
  /** Tool-call parsers it has ("hermes", "qwen3_coder"…). */
  parsers: Set<string>;
}

function envDirs(): string[] {
  const home = os.homedir();
  const roots = ['miniconda3', 'anaconda3', 'miniforge3', 'mambaforge', '.conda'].map((r) => path.join(home, r)).concat('/opt/conda');
  const out: string[] = [];
  for (const r of roots) {
    out.push(r);
    try {
      for (const e of fs.readdirSync(path.join(r, 'envs'))) out.push(path.join(r, 'envs', e));
    } catch {}
  }
  for (const v of ['.venv', 'venv', '.local/share/vllm']) out.push(path.join(home, v));
  return out;
}

function sitePackages(bin: string): string | null {
  const env = path.dirname(path.dirname(fs.realpathSync(bin)));
  try {
    for (const py of fs.readdirSync(path.join(env, 'lib')).filter((d) => d.startsWith('python3'))) {
      const sp = path.join(env, 'lib', py, 'site-packages');
      if (fs.existsSync(path.join(sp, 'vllm'))) return sp;
    }
  } catch {}
  return null;
}

let found: { key: string; info: VllmInfo | null } | null = null;

/** The vllm command (the one set, on the PATH, or in a conda or venv environment), and what it can run. */
export function findVllm(command?: string): VllmInfo | null {
  const key = command ?? '';
  if (found?.key === key) return found.info;
  const cands = [command, ...(agentBaseEnv().PATH ?? '').split(':').map((d) => path.join(d, 'vllm')), ...envDirs().map((d) => path.join(d, 'bin', 'vllm'))].filter(Boolean) as string[];
  let info: VllmInfo | null = null;
  for (const c of cands) {
    try {
      fs.accessSync(c, fs.constants.X_OK);
    } catch {
      continue;
    }
    const sp = sitePackages(c);
    if (!sp) continue;
    const dist = fs.readdirSync(sp).find((d) => /^vllm-[\d.]+.*\.dist-info$/.test(d));
    const read = (p: string) => {
      try {
        return fs.readFileSync(path.join(sp, 'vllm', p), 'utf8');
      } catch {
        return '';
      }
    };
    const archs = new Set([...read('model_executor/models/registry.py').matchAll(/^\s*"(\w+)": \(/gm)].map((m) => m[1]));
    // Newer versions list parsers in a table; older ones register each with a decorator.
    let parserSrc = read('tool_parsers/__init__.py');
    const dir = path.join(sp, 'vllm', 'entrypoints/openai/tool_parsers');
    if (!parserSrc && fs.existsSync(dir)) parserSrc = fs.readdirSync(dir).map((f) => read(`entrypoints/openai/tool_parsers/${f}`)).join('\n');
    const parsers = new Set([...parserSrc.matchAll(/^\s*"([\w-]+)": \(|register_module\(\s*\[?\s*["']([\w-]+)/gm)].map((m) => m[1] ?? m[2]));
    info = { path: c, version: dist?.replace(/^vllm-|\.dist-info$/g, '') ?? '?', archs, parsers };
    break;
  }
  found = { key, info };
  return info;
}

/** The parser that turns a model family's tool calls into OpenAI tool_calls, if this vLLM has one. */
export function toolParser(modelType: string | undefined, parsers: Set<string>): string | undefined {
  const t = modelType ?? '';
  const pref: [RegExp, string[]][] = [
    [/^qwen3_(coder|next)/, ['qwen3_coder', 'hermes']],
    [/^qwen/, ['hermes']],
    [/^llama4/, ['llama4_pythonic', 'llama4_json']],
    [/^llama/, ['llama3_json']],
    [/^(mistral|ministral|mixtral)/, ['mistral']],
    [/^deepseek_v3/, ['deepseek_v3']],
    [/^glm4_moe/, ['glm45']],
    [/^granite/, ['granite']],
    [/^gpt_oss/, ['openai']],
    [/^phi/, ['phi4_mini_json']],
    [/^kimi/, ['kimi_k2']],
    [/^minimax/, ['minimax_m2', 'minimax']],
  ];
  return pref.find(([re]) => re.test(t))?.[1].find((p) => parsers.has(p));
}

export function loadServers(): VllmServer[] {
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return [];
  }
}

export function saveServers(list: VllmServer[]) {
  fs.mkdirSync(MODELS_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(STATE, JSON.stringify(list, null, 2));
}

export const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

function freePort(from: number): Promise<number> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(freePort(from + 1)));
    s.listen(from, '127.0.0.1', () => s.close(() => resolve(from)));
  });
}

/** Starts a server for a downloaded model, sized to it, on the GPU with the most free memory, or split across the
 * fewest GPUs that hold it (all of them told the same share). */
export async function startServer(
  v: VllmInfo,
  o: { repo: string; dir: string; machine: MachineInfo; weightsBytes: number; customCode?: boolean; gpu?: number; maxLen?: number },
): Promise<VllmServer> {
  const cfg = JSON.parse(fs.readFileSync(path.join(o.dir, 'config.json'), 'utf8'));
  const max = Number(cfg.text_config?.max_position_embeddings ?? cfg.max_position_embeddings ?? 0) || LOCAL_CONTEXT;
  const maxLen = Math.min(o.maxLen ?? LOCAL_CONTEXT, max);
  // Weights, the context cache for a full-length conversation with some to spare, and vLLM's own share.
  const need = o.weightsBytes * 1.1 + cachePerToken(cfg) * maxLen * 1.25 + 1.5 * GiB;
  if (o.machine.apple) return startOnMac(v, { ...o, cfg, need, maxLen });
  if (!o.machine.gpus.length) throw new HttpError(400, 'vLLM needs an NVIDIA GPU or a Mac with Apple silicon, and neither is here');
  const plan = gpuPlan(o.machine, need, { split: true, only: o.gpu });
  if (!plan) {
    const most = [...o.machine.gpus].sort((a, b) => b.freeBytes - a.freeBytes)[0];
    throw new HttpError(
      400,
      `It needs about ${gb(need)} of GPU memory; the most free is ${gb(most.freeBytes)} on GPU ${most.index}${o.machine.gpus.length > 1 && o.gpu == null ? `, and it does not fit split across the GPUs either` : ''}`,
    );
  }
  const gpu = plan.gpus[0];
  const tp = plan.gpus.length;
  // Each card's share of its own memory: the smallest card sets it, as vLLM asks every card for the same share.
  const util = Math.min(0.95, plan.perGpu / Math.min(...plan.gpus.map((g) => g.totalBytes)) + 0.01);
  const port = await freePort(8200);
  const parser = toolParser(cfg.text_config?.model_type ?? cfg.model_type, v.parsers);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const log = path.join(LOG_DIR, `vllm-${o.repo.replace(/\//g, '--')}.log`);
  const fd = fs.openSync(log, 'w');
  const args = [
    'serve',
    o.dir,
    '--served-model-name',
    o.repo,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--gpu-memory-utilization',
    util.toFixed(3),
    '--max-model-len',
    String(maxLen),
    // One person's agent: start quickly and keep memory down, rather than peak throughput.
    '--enforce-eager',
    '--max-num-seqs',
    '8',
    ...(tp > 1 ? ['--tensor-parallel-size', String(tp)] : []),
    ...(parser ? ['--enable-auto-tool-choice', '--tool-call-parser', parser] : []),
    ...(o.customCode ? ['--trust-remote-code'] : []),
  ];
  const child = spawn(v.path, args, {
    cwd: o.dir,
    env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: plan.gpus.map((g) => g.index).join(','), HF_HUB_OFFLINE: '1', VLLM_NO_USAGE_STATS: '1', DO_NOT_TRACK: '1' },
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  fs.closeSync(fd);
  return { repo: o.repo, port, pid: child.pid!, gpu: gpu.index, ...(tp > 1 ? { gpus: plan.gpus.map((g) => g.index) } : {}), util, maxLen, parser, startedAt: Date.now(), log, state: 'starting' };
}

/** On a Mac, vLLM runs on Apple silicon through its Metal plugin (vllm-metal, on MLX), in the memory the Mac's
 * graphics share: no cards to choose and no share of one to set. */
async function startOnMac(v: VllmInfo, o: { repo: string; dir: string; machine: MachineInfo; customCode?: boolean; cfg: any; need: number; maxLen: number }): Promise<VllmServer> {
  const room = o.machine.ramBytes * 0.7;
  if (o.need > room) throw new HttpError(400, `It needs about ${gb(o.need)} of memory; this Mac's graphics may use about ${gb(room)}`);
  const port = await freePort(8200);
  const parser = toolParser(o.cfg.text_config?.model_type ?? o.cfg.model_type, v.parsers);
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const log = path.join(LOG_DIR, `vllm-${o.repo.replace(/\//g, '--')}.log`);
  const fd = fs.openSync(log, 'w');
  const args = [
    'serve',
    o.dir,
    '--served-model-name',
    o.repo,
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--max-model-len',
    String(o.maxLen),
    '--max-num-seqs',
    '8',
    ...(parser ? ['--enable-auto-tool-choice', '--tool-call-parser', parser] : []),
    ...(o.customCode ? ['--trust-remote-code'] : []),
  ];
  const child = spawn(v.path, args, { cwd: o.dir, env: { ...agentBaseEnv(), HF_HUB_OFFLINE: '1', VLLM_NO_USAGE_STATS: '1', DO_NOT_TRACK: '1' }, detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  fs.closeSync(fd);
  return { repo: o.repo, port, pid: child.pid!, gpu: -1, util: Math.min(0.95, o.need / o.machine.ramBytes), maxLen: o.maxLen, parser, startedAt: Date.now(), log, state: 'starting' };
}

export async function ready(s: VllmServer): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${s.port}/v1/models`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** The last lines of a server's log, for why it stopped. */
export function logTail(s: VllmServer, n = 6): string {
  try {
    const lines = fs.readFileSync(s.log, 'utf8').trim().split('\n');
    const err = lines.filter((l) => /error|exception|out of memory/i.test(l)).slice(-2);
    return (err.length ? err : lines.slice(-n)).join('\n').slice(-800);
  } catch {
    return '';
  }
}

/** Stops a server and everything it started (its process group), firmly if it lingers. */
export function stopServer(s: VllmServer) {
  try {
    process.kill(-s.pid, 'SIGTERM');
  } catch {}
  setTimeout(() => {
    if (alive(s.pid))
      try {
        process.kill(-s.pid, 'SIGKILL');
      } catch {}
  }, 15_000).unref();
}
