// The models the app suggests to run here (shared/model-picks.ts), as they are for this computer: what each would
// download and how it would run, whether it runs well enough to suggest, the one to start with, and whether it is
// here or on its way. vLLM runs them by default: on NVIDIA graphics (split across several cards when one has too
// little memory) and on a Mac's Apple silicon. A computer with neither gets a model's build for Ollama, where it has
// one. GET /api/models/picks.
import type { LocalPickView } from '../../shared/model-picks.ts';
import { LOCAL_PICKS, type LocalPick } from '../../shared/model-picks.ts';
import type { LocalModel, MachineInfo, ModelDownload, ModelFit } from '../../shared/types.ts';
import { LOCAL_CONTEXT, parseRepo, vllmFiles, type RepoFile } from './hf.ts';
import { cachePerToken, fit, gb } from './machine.ts';

const HF = 'https://huggingface.co';

interface Sized {
  at: number;
  /** The bytes of its weights, and of what downloads (weights, config, tokenizer, code). */
  weights: number;
  download: number;
  /** The context cache for each word, from its config. */
  perToken: number;
  arch?: string;
}

const sized = new Map<string, Sized>();

/** A repository's weights and download, from Hugging Face (kept for an hour). */
async function sizeOf(repo: string, o: { token?: string; gguf?: boolean }): Promise<Sized> {
  const key = `${o.gguf ? 'gguf' : 'st'}:${repo}`;
  const had = sized.get(key);
  if (had && Date.now() - had.at < 3600_000) return had;
  const headers = o.token ? { authorization: `Bearer ${o.token}` } : undefined;
  const r = await fetch(`${HF}/api/models/${repo}?blobs=true`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Hugging Face answered ${r.status} for ${repo}`);
  const info: any = await r.json();
  const files: RepoFile[] = (info.siblings ?? []).map((f: any) => ({ path: String(f.rfilename), size: Number(f.size ?? 0) }));
  let weights: number;
  let download: number;
  if (o.gguf) {
    // The smallest model file with its picture reader: a build of one quantization (or the one asked for).
    const models = files.filter((f) => f.path.endsWith('.gguf') && !/mmproj|mtp-/i.test(f.path)).sort((a, b) => a.size - b.size);
    const tag = /:([\w.-]+)$/.exec(repo)?.[1];
    const model = (tag && models.find((f) => f.path.toLowerCase().includes(tag.toLowerCase()))) || models[0];
    const proj = files.filter((f) => /mmproj/i.test(f.path)).sort((a, b) => a.size - b.size)[0];
    weights = (model?.size ?? 0) + (proj?.size ?? 0);
    download = weights;
  } else {
    const want = vllmFiles(files);
    weights = want.filter((f) => f.path.endsWith('.safetensors')).reduce((a, f) => a + f.size, 0);
    download = want.reduce((a, f) => a + f.size, 0);
  }
  let perToken = 0;
  let arch: string | undefined;
  try {
    const base = o.gguf ? parseRepo(info.cardData?.base_model?.[0] ?? info.cardData?.base_model ?? '') : repo;
    const c = base ? await fetch(`${HF}/${base}/resolve/main/config.json`, { headers, signal: AbortSignal.timeout(20_000) }) : null;
    if (c?.ok) {
      const cfg: any = await c.json();
      perToken = cachePerToken(cfg);
      arch = cfg.architectures?.[0];
    }
  } catch {}
  const s: Sized = { at: Date.now(), weights, download, perToken, arch };
  sized.set(key, s);
  return s;
}

/** What this computer has to run models with. */
export interface Runtimes {
  /** vLLM, found: and the architectures it runs. */
  vllm: { archs: Set<string> } | null;
  /** Ollama answers. */
  ollama: boolean;
}

/** Where a suggested model would run here, the app's way: vLLM where it can, else Ollama's build, else nowhere. */
export function routeOf(p: LocalPick, m: MachineInfo): 'vllm' | 'ollama' | null {
  if (p.mac) return m.apple ? 'vllm' : null;
  if (m.gpus.length || m.apple) return 'vllm';
  return p.gguf ? 'ollama' : null;
}

/** What a suggested model needs that this computer lacks, in a few plain words. */
function lacks(p: LocalPick, m: MachineInfo, f: ModelFit | null): string {
  if (p.mac && !m.apple) return 'A Mac with Apple silicon';
  if (!f) return 'A graphics card';
  const need = gb(f.needBytes);
  return m.gpus.length ? `About ${need} of graphics memory` : m.apple ? `About ${need} of memory for its graphics` : `A graphics card with about ${need}`;
}

/**
 * The suggested models for this machine, smallest first: each with what it would install and how it would run,
 * whether it runs well enough here to suggest, the best one (the strongest that runs well), and whether it is here
 * already or downloading. Those that do not run here come too, with what they need.
 */
export async function localPicks(o: { machine: MachineInfo; token?: string; runtimes: Runtimes; local: LocalModel[]; downloads: ModelDownload[] }): Promise<LocalPickView[]> {
  const m = o.machine;
  const out = await Promise.all(
    LOCAL_PICKS.map(async (p): Promise<LocalPickView> => {
      const route = routeOf(p, m);
      const target = route === 'ollama' ? p.gguf! : p.repo;
      let s: Sized | null = null;
      try {
        s = route ? await sizeOf(route === 'ollama' ? target.replace(/^hf\.co\//, '') : target, { token: o.token, gguf: route === 'ollama' }) : null;
      } catch {}
      // Too little known (Hugging Face did not answer): its size from its parameters, at 16 bits or 4.
      const weights = s?.weights || p.params * 1e9 * (route === 'ollama' ? 0.6 : 2);
      const f = route
        ? fit(m, {
            weightBytes: weights,
            cacheBytes: s?.perToken ? s.perToken * LOCAL_CONTEXT : weights * 0.1,
            downloadBytes: s?.download || weights,
            params: p.params * 1e9,
            cpuOk: route === 'ollama',
            split: route === 'vllm',
            metal: route === 'vllm',
            // 16-bit weights (about two bytes a parameter) may be stored at 8-bit as vLLM loads them.
            eight: route === 'vllm' && m.gpus.length > 0 && weights / (p.params * 1e9) > 1.5,
            ...(p.active ? { active: (weights * p.active) / p.params } : {}),
          })
        : null;
      const runs = !!f && (f.verdict === 'good' || f.verdict === 'slow');
      const key = `${route}:${route === 'ollama' ? target : p.repo}`;
      const have = o.local.find((l) => (route === 'ollama' ? l.runtime === 'ollama' && l.repo.toLowerCase() === target.replace(/^hf\.co\//, '').toLowerCase() : l.runtime === 'vllm' && l.repo === p.repo));
      const coming = o.downloads.find((d) => d.key === key && d.status === 'running');
      // Nothing here runs it yet (vLLM not installed, or too old for it; Ollama not running): Settings → Models sets that up.
      const engine = route === 'vllm' ? !!o.runtimes.vllm && (!s?.arch || o.runtimes.vllm.archs.has(s.arch)) : route === 'ollama' ? o.runtimes.ollama : false;
      return {
        ...p,
        ...(route ? { install: route === 'ollama' ? { ollama: target } : { repo: p.repo } } : {}),
        fit: f ?? { verdict: 'no', where: 'none', needBytes: weights, downloadBytes: weights, notes: [] },
        runs,
        sizeBytes: s?.download || weights,
        ...(have ? { have: have.id } : {}),
        ...(coming ? { coming: coming.key } : {}),
        ...(!runs ? { needs: lacks(p, m, f) } : {}),
        ready: engine,
      };
    }),
  );
  const best = [...out].reverse().find((p) => p.runs && p.fit.verdict === 'good');
  if (best) best.best = true;
  return out;
}
