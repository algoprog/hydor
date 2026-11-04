// Images through OpenRouter: its image models (the catalog filtered to models whose output includes images,
// with the settings each takes from its image API's own list), and one generation: a request to its images
// API (/images), with pictures to change or follow given as data URLs, and the images it sends back saved into
// the session's folder. A model that endpoint does not take is asked through a chat completion instead.
import fs from 'node:fs';
import path from 'node:path';
import type { ImageModel } from '../../shared/images.ts';
import type { MediaParam } from '../../shared/media.ts';

/** The app's choice, first one OpenRouter still lists: ByteDance's Seedream 5.0, then Google's, OpenAI's and FLUX's. */
export const PREFERRED = [
  'bytedance-seed/seedream-5-0-pro',
  'bytedance-seed/seedream-5-0-flash',
  'google/gemini-3.1-flash-image',
  'google/gemini-2.5-flash-image',
  'google/gemini-3.1-flash-image-preview',
  'openai/gpt-image-1-mini',
  'black-forest-labs/flux.2-pro',
];

export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
export const SIZES = ['1K', '2K', '4K'];

export const HEADERS = { 'HTTP-Referer': 'https://github.com/algoprog/hydor', 'X-Title': 'Hydor' };

let cache: { at: number; list: ImageModel[] } | null = null;

/** The settings a model takes, from OpenRouter's supported_parameters ({ resolution: { type: "enum", values } }). */
export function paramsOf(sp: unknown): MediaParam[] {
  const out: MediaParam[] = [];
  if (!sp || typeof sp !== 'object') return out;
  for (const [id, v] of Object.entries(sp as Record<string, any>)) {
    if (!v || typeof v !== 'object' || !/^[a-z_]{1,40}$/.test(id)) continue;
    if (v.type === 'enum' && Array.isArray(v.values)) {
      const values = v.values.map(String).filter((x: string) => x.trim());
      if (values.length) out.push({ id, kind: 'enum', values });
    } else if (v.type === 'range' && (typeof v.min === 'number' || typeof v.max === 'number')) out.push({ id, kind: 'range', ...(typeof v.min === 'number' ? { min: v.min } : {}), ...(typeof v.max === 'number' ? { max: v.max } : {}) });
    else if (v.type === 'boolean') out.push({ id, kind: 'boolean' });
  }
  return out;
}

/** OpenRouter's image models, kept for an hour (the lists need no key): its catalog for prices, its image API's list for settings. */
export async function imageModels(base: string): Promise<ImageModel[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.list;
  const [r, api] = await Promise.all([
    fetch(`${base}/models?output_modalities=image`, { signal: AbortSignal.timeout(20_000) }),
    fetch(`${base}/images/models`, { signal: AbortSignal.timeout(20_000) }).catch(() => null),
  ]);
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status}`);
  const d: any = await r.json();
  const settings = new Map<string, any>();
  try {
    if (api?.ok) for (const m of ((await api.json()) as any).data ?? []) if (m?.id) settings.set(String(m.id), m);
  } catch {}
  const listed: ImageModel[] = (d.data ?? [])
    .filter((m: any) => (m.architecture?.output_modalities ?? []).includes('image') && !String(m.id).startsWith('openrouter/'))
    .map((m: any) => imageModel(m, settings.get(String(m.id))));
  // A model only the image API lists still makes images.
  for (const [id, m] of settings) if (!listed.some((x) => x.id === id) && !id.startsWith('openrouter/')) listed.push(imageModel(m, m));
  cache = { at: Date.now(), list: listed };
  return listed;
}

function imageModel(m: any, api?: any): ImageModel {
  const name = String(m.name ?? m.id);
  const textOut = (m.architecture?.output_modalities ?? []).includes('text');
  const perToken = Number(m.pricing?.image_output ?? m.pricing?.image_token);
  const params = paramsOf(api?.supported_parameters);
  const refs = params.find((p) => p.id === 'input_references');
  return {
    id: String(m.id),
    label: name.replace(/^[^:]+:\s*/, ''),
    org: name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : undefined,
    description: typeof m.description === 'string' ? m.description.replace(/\s+/g, ' ').slice(0, 300) : undefined,
    created: Number(m.created) ? Number(m.created) * 1000 : undefined,
    // Image tokens per picture: about 1,290 for models that also write (Gemini, GPT), 4,096 per megapixel for the others.
    perImage: perToken > 0 ? perToken * (textOut ? 1290 : 4096) : undefined,
    textOut,
    edits: refs ? (refs.max ?? 1) > 0 : (m.architecture?.input_modalities ?? api?.architecture?.input_modalities ?? []).includes('image'),
    ...(refs?.max ? { maxRefs: refs.max } : {}),
    ...(params.length ? { params: params.filter((p) => p.id !== 'input_references') } : {}),
  };
}

export interface Reference {
  name: string;
  mime: string;
  data: Buffer;
}

const MIME_BY_MAGIC: [string, (b: Buffer) => boolean][] = [
  ['image/png', (b) => b.readUInt32BE(0) === 0x89504e47],
  ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8],
  ['image/gif', (b) => b.toString('latin1', 0, 4) === 'GIF8'],
  ['image/webp', (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP'],
];

/** Pictures to change or follow, read from the session's folder (PNG, JPEG, WebP, GIF; 4 at most, 20 MB each). */
export async function readReferences(files: string[]): Promise<Reference[]> {
  if (files.length > 4) throw new Error('Give at most 4 images to work from.');
  const out: Reference[] = [];
  for (const f of files) {
    const st = await fs.promises.stat(f).catch(() => null);
    if (!st?.isFile()) throw new Error(`No such image: ${f}`);
    if (st.size > 20 * 1024 * 1024) throw new Error(`${path.basename(f)} is over 20 MB: make it smaller first.`);
    const data = await fs.promises.readFile(f);
    const mime = MIME_BY_MAGIC.find(([, is]) => data.length > 12 && is(data))?.[0];
    if (!mime) throw new Error(`${path.basename(f)} is not a PNG, JPEG, WebP or GIF image.`);
    out.push({ name: path.basename(f), mime, data });
  }
  return out;
}

export interface Ask {
  model: string;
  prompt: string;
  refs?: Reference[];
  aspect?: string;
  /** The resolution: 1K, 2K, 4K (and 512, 768, 1.5K for some models). */
  size?: string;
  quality?: string;
  background?: string;
  /** How many images (the images API; the chat completion makes one). */
  count?: number;
  seed?: number;
  /** The model writes text with its images (Gemini, GPT): it is asked for both. */
  textOut?: boolean;
}

const dataUrl = (r: Reference) => `data:${r.mime};base64,${r.data.toString('base64')}`;

/** The images API's request: only the settings given, as that API names them. */
export function buildImagesRequest(a: Ask): Record<string, unknown> {
  return {
    model: a.model,
    prompt: a.prompt,
    ...(a.aspect ? { aspect_ratio: a.aspect } : {}),
    ...(a.size ? { resolution: a.size } : {}),
    ...(a.quality ? { quality: a.quality } : {}),
    ...(a.background ? { background: a.background } : {}),
    ...(a.count && a.count > 1 ? { n: Math.min(10, Math.round(a.count)) } : {}),
    ...(Number.isInteger(a.seed) ? { seed: a.seed } : {}),
    ...(a.background === 'transparent' ? { output_format: 'png' } : {}),
    ...(a.refs?.length ? { input_references: a.refs.map((r) => ({ type: 'image_url', image_url: { url: dataUrl(r) } })) } : {}),
  };
}

/** The images in the images API's answer ({ data: [{ b64_json, media_type }], usage }). */
export function parseImagesAnswer(j: any): { images: Made[]; text: string; cost?: number } {
  const images: Made[] = [];
  for (const d of Array.isArray(j?.data) ? j.data.slice(0, 10) : []) {
    if (typeof d?.b64_json !== 'string' || !d.b64_json) continue;
    const data = Buffer.from(d.b64_json, 'base64');
    const mime = typeof d.media_type === 'string' && d.media_type.startsWith('image/') ? d.media_type : (MIME_BY_MAGIC.find(([, is]) => data.length > 12 && is(data))?.[0] ?? 'image/png');
    if (data.length) images.push({ mime, data });
  }
  const cost = Number(j?.usage?.cost);
  return { images, text: '', cost: Number.isFinite(cost) && cost > 0 ? cost : undefined };
}

/** The chat completion that asks for the image. */
export function buildRequest(a: Ask): Record<string, unknown> {
  const content: unknown[] = [{ type: 'text', text: a.prompt }];
  for (const r of a.refs ?? []) content.push({ type: 'image_url', image_url: { url: dataUrl(r) } });
  const imageConfig: Record<string, string> = {};
  if (a.aspect && ASPECTS.includes(a.aspect)) imageConfig.aspect_ratio = a.aspect;
  if (a.size && SIZES.includes(a.size)) {
    imageConfig.image_size = a.size;
    imageConfig.size = a.size;
  }
  return {
    model: a.model,
    messages: [{ role: 'user', content: a.refs?.length ? content : a.prompt }],
    modalities: a.textOut === false ? ['image'] : ['image', 'text'],
    ...(Object.keys(imageConfig).length ? { image_config: imageConfig } : {}),
    usage: { include: true },
  };
}

export interface Made {
  mime: string;
  data: Buffer;
}

/** The images in an answer (data URLs, or addresses to fetch), and what the model wrote with them. */
export async function parseAnswer(j: any): Promise<{ images: Made[]; text: string; cost?: number }> {
  const msg = j?.choices?.[0]?.message ?? {};
  const urls: string[] = [];
  for (const im of Array.isArray(msg.images) ? msg.images : []) {
    const u = im?.image_url?.url ?? im?.url;
    if (typeof u === 'string') urls.push(u);
  }
  if (Array.isArray(msg.content)) for (const c of msg.content) if (c?.type === 'image_url' && typeof c.image_url?.url === 'string') urls.push(c.image_url.url);
  const text =
    typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content
            .filter((c: any) => c?.type === 'text')
            .map((c: any) => c.text)
            .join('')
        : '';
  const images: Made[] = [];
  for (const u of urls.slice(0, 8)) {
    const m = /^data:(image\/[\w.+-]+);base64,(.*)$/s.exec(u);
    if (m) images.push({ mime: m[1], data: Buffer.from(m[2], 'base64') });
    else if (/^https:\/\//.test(u)) {
      const r = await fetch(u, { signal: AbortSignal.timeout(60_000) });
      const type = r.headers.get('content-type') ?? '';
      if (r.ok && type.startsWith('image/') && Number(r.headers.get('content-length') ?? 0) < 40 * 1024 * 1024) images.push({ mime: type.split(';')[0], data: Buffer.from(await r.arrayBuffer()) });
    }
  }
  const cost = Number(j?.usage?.cost);
  return { images: images.filter((i) => i.data.length > 0), text: String(text ?? '').trim(), cost: Number.isFinite(cost) && cost > 0 ? cost : undefined };
}

/** Width and height from the file's header (PNG, JPEG, GIF, WebP). */
export function dimensions(b: Buffer): { w: number; h: number } | null {
  try {
    if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('latin1', 0, 4) === 'GIF8') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') {
      const kind = b.toString('latin1', 12, 16);
      if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (kind === 'VP8L') {
        const n = b.readUInt32LE(21);
        return { w: 1 + (n & 0x3fff), h: 1 + ((n >> 14) & 0x3fff) };
      }
      if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 9 < b.length; ) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1];
        const len = b.readUInt16BE(i + 2);
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

/** A file name from words: "Red panda, in space!" → "red-panda-in-space" (`fallback` when no word is left). */
export function slug(words: string, fallback = 'image'): string {
  const s = words
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = s.length > 48 ? s.slice(0, 48).replace(/-[^-]*$/, '') : s;
  return cut || fallback;
}

export interface Saved {
  path: string;
  bytes: number;
  w?: number;
  h?: number;
}

/** Saves the images into `dir` (images/ in the session's folder), never over a file that is there. */
export async function saveImages(images: Made[], dir: string, name: string): Promise<Saved[]> {
  await fs.promises.mkdir(dir, { recursive: true });
  const base = slug(name);
  const out: Saved[] = [];
  for (const [i, im] of images.entries()) {
    const ext = EXT[im.mime] ?? 'png';
    let file = '';
    for (let n = 1; n < 1000; n++) {
      const stem = images.length > 1 ? `${base}-${i + 1}` : base;
      file = path.join(dir, `${stem}${n > 1 ? `-${n}` : ''}.${ext}`);
      try {
        await fs.promises.writeFile(file, im.data, { flag: 'wx' });
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      }
    }
    const d = dimensions(im.data);
    out.push({ path: file, bytes: im.data.length, ...(d ? { w: d.w, h: d.h } : {}) });
  }
  return out;
}

/** OpenRouter's words when it refuses, as the user and the agent should read them. */
function refusal(status: number, j: any): Error {
  const why = j?.error?.message ?? `OpenRouter answered ${status}`;
  return new Error(status === 401 ? `OpenRouter did not take the key (${why}). The user can check it in Settings → Models.` : status === 402 ? `The OpenRouter account is out of credits (${why}).` : String(why));
}

/** The images API does not serve this model (so the chat completion may). */
const notServed = (status: number, j: any) => status === 404 || status === 405 || (status === 400 && /not (?:a |an )?(?:supported|available|image)|does not support image|no endpoints?/i.test(String(j?.error?.message ?? '')));

/** One generation, start to end: the images API, else a chat completion; throws with OpenRouter's own words when it refuses. */
export async function generate(o: Ask & { base: string; key: string; timeoutMs?: number }): Promise<{ images: Made[]; text: string; cost?: number }> {
  const headers = { Authorization: `Bearer ${o.key}`, 'Content-Type': 'application/json', ...HEADERS };
  const signal = AbortSignal.timeout(o.timeoutMs ?? 300_000);
  const r = await fetch(`${o.base}/images`, { method: 'POST', headers, body: JSON.stringify(buildImagesRequest(o)), signal });
  const j: any = await r.json().catch(() => null);
  if (r.ok && !j?.error) return parseImagesAnswer(j);
  if (!notServed(r.status, j)) throw refusal(r.status, j);
  const c = await fetch(`${o.base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(buildRequest(o)), signal });
  const cj: any = await c.json().catch(() => null);
  if (!c.ok || cj?.error) throw refusal(c.status, cj);
  return parseAnswer(cj);
}
