// Models on Hugging Face: what a repository holds (weights, their format and size, the architecture),
// whether it fits this machine, and downloading what vLLM needs of it. GGUF repositories install
// through Ollama instead (it pulls hf.co/<repo>:<quant> itself).
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { HfInspect, HfQuant, MachineInfo } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { HF_DIR } from './config.ts';
import { cachePerToken, fit } from './machine.ts';

const HF = 'https://huggingface.co';
/** The context a local model is given by default (and what the fit assumes). */
export const LOCAL_CONTEXT = 32768;
const MARKER = '.agent-console.json';

/** "LiquidAI/LFM3-VL-2B" from that, a huggingface.co URL, or hf.co/… */
export function parseRepo(input: string): string | null {
  const s = input
    .trim()
    .replace(/^https?:\/\/(www\.)?(huggingface\.co|hf\.co)\//, '')
    .replace(/^hf\.co\//, '')
    .replace(/\/(tree|blob|resolve)\/.*$/, '')
    .replace(/[:?#].*$/, '')
    .replace(/\/+$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : null;
}

const auth = (token?: string): Record<string, string> => (token ? { authorization: `Bearer ${token}` } : {});

async function getJson(url: string, token?: string): Promise<any> {
  const r = await fetch(url, { headers: auth(token), signal: AbortSignal.timeout(20_000) });
  if (r.status === 404) return null;
  if (r.status === 401 || r.status === 403) throw new HttpError(403, 'Hugging Face refused: the model is gated or private. Accept its terms on huggingface.co and add a token in Settings → Models.');
  if (!r.ok) throw new HttpError(502, `Hugging Face answered ${r.status}`);
  return r.json();
}

interface RepoFile {
  path: string;
  size: number;
}

async function listFiles(repo: string, token?: string): Promise<RepoFile[]> {
  const out: RepoFile[] = [];
  let url = `${HF}/api/models/${repo}/tree/main?recursive=true`;
  for (let i = 0; url && i < 20; i++) {
    const r = await fetch(url, { headers: auth(token), signal: AbortSignal.timeout(20_000) });
    if (!r.ok) break;
    for (const e of (await r.json()) as any[]) if (e.type === 'file') out.push({ path: e.path, size: Number(e.lfs?.size ?? e.size ?? 0) });
    url = /<([^>]+)>;\s*rel="next"/.exec(r.headers.get('link') ?? '')?.[1] ?? '';
  }
  return out;
}

/** What vLLM loads of a repository: config, tokenizer, processor, custom code and safetensors weights. */
function vllmFiles(files: RepoFile[]): RepoFile[] {
  const st = files.filter((f) => f.path.endsWith('.safetensors'));
  // Some repositories carry the original checkpoint beside the converted one.
  const hfFormat = st.some((f) => !/^(original\/|consolidated)/.test(f.path));
  return files.filter((f) => {
    if (/(^|\/)\.gitattributes$|\.(gguf|onnx|pt|pth|bin|msgpack|h5|ot|tflite|mlmodel|npz|ckpt|png|jpe?g|gif|mp4)$/i.test(f.path)) return false;
    if (/^(onnx|openvino|coreml|gguf|original)\//i.test(f.path)) return false;
    if (hfFormat && /^consolidated/.test(f.path)) return false;
    return true;
  });
}

/** GGUF weights by quantization ("Q4_K_M"), split files counted together; vision projectors apart. */
function quants(files: RepoFile[]): { quants: { tag: string; size: number; file: string }[]; projector?: RepoFile } {
  const gg = files.filter((f) => f.path.endsWith('.gguf'));
  const projector = gg.filter((f) => /mmproj/i.test(f.path)).sort((a, b) => a.size - b.size)[0];
  const groups = new Map<string, { size: number; file: string }>();
  for (const f of gg.filter((x) => !/mmproj/i.test(x.path))) {
    const name = path.basename(f.path).replace(/\.gguf$/, '').replace(/-\d{5}-of-\d{5}$/, '');
    const g = groups.get(name) ?? { size: 0, file: f.path };
    g.size += f.size;
    groups.set(name, g);
  }
  const names = [...groups.keys()];
  // The tag is what follows the name all the files share: LFM3-VL-2B-Q4_K_M → Q4_K_M.
  let base = names.length > 1 ? names.reduce((a, b) => (b.startsWith(a) ? a : a.slice(0, [...a].findIndex((c, i) => c !== b[i])))) : (names[0]?.replace(/[-_.]?((I?Q\d\w*)|[BF]F?16|F32)$/i, '') ?? '');
  base = base.replace(/[^-_.]*$/, '');
  return { quants: names.map((n) => ({ tag: n.slice(base.length) || n, ...groups.get(n)! })).sort((a, b) => a.size - b.size), projector };
}

export async function inspect(input: string, o: { token?: string; machine: MachineInfo; vllmArchs: Set<string> | null }): Promise<HfInspect> {
  const repo = parseRepo(input);
  if (!repo) throw new HttpError(400, 'That is not a Hugging Face model: give it as org/name or its huggingface.co address');
  const info = await getJson(`${HF}/api/models/${repo}`, o.token);
  if (!info) throw new HttpError(404, `No model ${repo} on Hugging Face`);
  const files = await listFiles(repo, o.token);
  const card = info.cardData ?? {};
  const baseRepo: string | undefined = Array.isArray(card.base_model) ? card.base_model[0] : typeof card.base_model === 'string' ? card.base_model : undefined;
  // The config says the architecture and the cache size; a GGUF repository borrows its base model's.
  let cfg = await getJson(`${HF}/${repo}/resolve/main/config.json`, o.token).catch(() => null);
  if (!cfg && baseRepo && parseRepo(baseRepo)) cfg = await getJson(`${HF}/${parseRepo(baseRepo)}/resolve/main/config.json`, o.token).catch(() => null);
  cfg ??= {};
  const arch: string | undefined = cfg.architectures?.[0] ?? info.config?.architectures?.[0];
  const ctxMax = Number(info.gguf?.context_length ?? cfg.text_config?.max_position_embeddings ?? cfg.max_position_embeddings ?? 0) || undefined;
  const ctx = Math.min(ctxMax ?? LOCAL_CONTEXT, LOCAL_CONTEXT);
  const perToken = cachePerToken(cfg);
  const { quants: qs, projector } = quants(files);
  const vision = !!projector || /image-text|vision/i.test(info.pipeline_tag ?? '') || !!cfg.vision_config;
  const params = Number(info.safetensors?.total ?? info.gguf?.total ?? 0) || undefined;
  const out: HfInspect = {
    repo,
    gated: info.gated && info.gated !== false ? String(info.gated) : undefined,
    pipeline: info.pipeline_tag,
    arch,
    modelType: cfg.model_type,
    contextLength: ctxMax,
    params,
    vision,
    customCode: (info.tags ?? []).includes('custom_code'),
    kind: qs.length ? 'gguf' : files.some((f) => f.path.endsWith('.safetensors')) ? 'safetensors' : 'other',
    quants: [],
    downloadBytes: 0,
  };
  if (out.kind === 'gguf') {
    out.quants = qs.map(
      (q): HfQuant => ({
        tag: q.tag,
        sizeBytes: q.size + (projector?.size ?? 0),
        ollamaName: `hf.co/${repo}:${q.tag}`,
        // A cache estimate needs the config; without it, a tenth of the weights is a fair guess.
        fit: fit(o.machine, { weightBytes: q.size + (projector?.size ?? 0), cacheBytes: perToken ? perToken * ctx : q.size * 0.1, downloadBytes: q.size + (projector?.size ?? 0), params, cpuOk: true }),
      }),
    );
    out.downloadBytes = out.quants[0]?.sizeBytes ?? 0;
  } else if (out.kind === 'safetensors') {
    const want = vllmFiles(files);
    out.downloadBytes = want.reduce((a, f) => a + f.size, 0);
    const weights = want.filter((f) => f.path.endsWith('.safetensors')).reduce((a, f) => a + f.size, 0);
    out.vllm = {
      supported: o.vllmArchs ? (arch ? o.vllmArchs.has(arch) : false) : null,
      fit: fit(o.machine, { weightBytes: weights, cacheBytes: perToken * ctx, downloadBytes: out.downloadBytes, params, cpuOk: false }),
    };
    if (o.vllmArchs && arch && !o.vllmArchs.has(arch)) out.vllm.reason = `This vLLM does not run ${arch} yet.`;
    // The same model as GGUF runs with Ollama, often sooner than vLLM supports a new architecture.
    const gg = await getJson(`${HF}/api/models/${repo}-GGUF`, o.token).catch(() => null);
    if (gg?.id) out.ggufRepo = gg.id;
  }
  return out;
}

// ---- downloads for vLLM -------------------------------------------------------------------------

export const repoDir = (repo: string) => path.join(HF_DIR, ...repo.split('/'));

export interface LocalRepo {
  repo: string;
  dir: string;
  sizeBytes: number;
  arch?: string;
  modelType?: string;
  contextLength?: number;
  vision?: boolean;
  customCode?: boolean;
  downloadedAt: number;
}

function dirSize(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) n += dirSize(p);
    else if (e.isFile()) n += fs.statSync(p).size;
  }
  return n;
}

/** Models downloaded completely (a marker file is written last). */
export function localRepos(): LocalRepo[] {
  const out: LocalRepo[] = [];
  try {
    for (const org of fs.readdirSync(HF_DIR))
      for (const name of fs.readdirSync(path.join(HF_DIR, org))) {
        const dir = path.join(HF_DIR, org, name);
        try {
          const m = JSON.parse(fs.readFileSync(path.join(dir, MARKER), 'utf8'));
          out.push({ ...m, dir, sizeBytes: dirSize(dir) });
        } catch {}
      }
  } catch {}
  return out;
}

export function removeRepo(repo: string) {
  const dir = repoDir(repo);
  if (!dir.startsWith(HF_DIR + path.sep)) throw new HttpError(400, 'Not a downloaded model');
  fs.rmSync(dir, { recursive: true, force: true });
  try {
    fs.rmdirSync(path.dirname(dir));
  } catch {}
}

/** Downloads what vLLM needs of a repository, resuming partial files; `progress` gets bytes as they come. */
export async function download(repo: string, o: { token?: string; info: HfInspect; progress: (done: number, total: number) => void; signal: AbortSignal }): Promise<void> {
  const want = vllmFiles(await listFiles(repo, o.token));
  if (!want.some((f) => f.path.endsWith('.safetensors'))) throw new HttpError(400, 'This repository has no safetensors weights for vLLM');
  const dir = repoDir(repo);
  const total = want.reduce((a, f) => a + f.size, 0);
  let done = 0;
  const queue = [...want];
  const one = async (f: RepoFile) => {
    const dest = path.join(dir, f.path);
    if (!dest.startsWith(dir + path.sep)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && fs.statSync(dest).size === f.size) return void (done += f.size);
    const part = `${dest}.part`;
    let start = fs.existsSync(part) ? fs.statSync(part).size : 0;
    const r = await fetch(`${HF}/${repo}/resolve/main/${f.path.split('/').map(encodeURIComponent).join('/')}`, {
      headers: { ...auth(o.token), ...(start ? { range: `bytes=${start}-` } : {}) },
      signal: o.signal,
    });
    if (r.status === 416 && start === f.size) {
      fs.renameSync(part, dest);
      return void (done += f.size);
    }
    if (!r.ok || !r.body) throw new Error(`${f.path}: Hugging Face answered ${r.status}`);
    if (start && r.status !== 206) start = 0;
    done += start;
    const count = new Transform({
      transform(chunk, _enc, cb) {
        done += chunk.length;
        o.progress(done, total);
        cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(r.body as any), count, fs.createWriteStream(part, { flags: start ? 'a' : 'w' }), { signal: o.signal });
    fs.renameSync(part, dest);
  };
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let f = queue.shift(); f; f = queue.shift()) await one(f);
    }),
  );
  const marker: Omit<LocalRepo, 'dir' | 'sizeBytes'> = {
    repo,
    arch: o.info.arch,
    modelType: o.info.modelType,
    contextLength: o.info.contextLength,
    vision: o.info.vision,
    customCode: o.info.customCode,
    downloadedAt: Date.now(),
  };
  fs.writeFileSync(path.join(dir, MARKER), JSON.stringify(marker, null, 2));
  o.progress(total, total);
}
