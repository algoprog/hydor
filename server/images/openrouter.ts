// Images through OpenRouter: its image models (the catalog filtered to models whose output includes
// images), and one generation: a chat completion asking for images (modalities), with pictures to
// change or follow given as data URLs, and the images it sends back saved into the session's folder.
import fs from 'node:fs';
import path from 'node:path';
import type { ImageModel } from '../../shared/images.ts';

/** The app's choice, first one OpenRouter still lists. */
export const PREFERRED = ['google/gemini-3.1-flash-image', 'google/gemini-2.5-flash-image', 'google/gemini-3.1-flash-image-preview', 'openai/gpt-image-1-mini', 'black-forest-labs/flux.2-pro'];

export const ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '5:4', '4:5', '21:9'];
export const SIZES = ['1K', '2K', '4K'];

let cache: { at: number; list: ImageModel[] } | null = null;

/** OpenRouter's image models, kept for an hour (the list needs no key). */
export async function imageModels(base: string): Promise<ImageModel[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.list;
  const r = await fetch(`${base}/models?output_modalities=image`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status}`);
  const d: any = await r.json();
  const list: ImageModel[] = (d.data ?? [])
    .filter((m: any) => (m.architecture?.output_modalities ?? []).includes('image') && !String(m.id).startsWith('openrouter/'))
    .map((m: any): ImageModel => {
      const name = String(m.name ?? m.id);
      const textOut = (m.architecture?.output_modalities ?? []).includes('text');
      const perToken = Number(m.pricing?.image_output ?? m.pricing?.image_token);
      return {
        id: String(m.id),
        label: name.replace(/^[^:]+:\s*/, ''),
        org: name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : undefined,
        description: typeof m.description === 'string' ? m.description.replace(/\s+/g, ' ').slice(0, 300) : undefined,
        created: Number(m.created) ? Number(m.created) * 1000 : undefined,
        // Image tokens per picture: about 1,290 for models that also write (Gemini, GPT), 4,096 per megapixel for the others.
        perImage: perToken > 0 ? perToken * (textOut ? 1290 : 4096) : undefined,
        textOut,
        edits: (m.architecture?.input_modalities ?? []).includes('image'),
      };
    });
  cache = { at: Date.now(), list };
  return list;
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
  size?: string;
  /** The model writes text with its images (Gemini, GPT): it is asked for both. */
  textOut?: boolean;
}

/** The chat completion that asks for the image. */
export function buildRequest(a: Ask): Record<string, unknown> {
  const content: unknown[] = [{ type: 'text', text: a.prompt }];
  for (const r of a.refs ?? []) content.push({ type: 'image_url', image_url: { url: `data:${r.mime};base64,${r.data.toString('base64')}` } });
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

/** A file name from words: "Red panda, in space!" → "red-panda-in-space". */
export function slug(words: string): string {
  const s = words
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const cut = s.length > 48 ? s.slice(0, 48).replace(/-[^-]*$/, '') : s;
  return cut || 'image';
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

/** One generation, start to end; throws with OpenRouter's own words when it refuses. */
export async function generate(o: Ask & { base: string; key: string; timeoutMs?: number }): Promise<{ images: Made[]; text: string; cost?: number }> {
  const r = await fetch(`${o.base}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/Naget-Inc/naget-agent', 'X-Title': 'Naget Agent' },
    body: JSON.stringify(buildRequest(o)),
    signal: AbortSignal.timeout(o.timeoutMs ?? 300_000),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || j?.error) {
    const why = j?.error?.message ?? `OpenRouter answered ${r.status}`;
    throw new Error(r.status === 401 ? `OpenRouter did not take the key (${why}). The user can check it in Settings → Models.` : r.status === 402 ? `The OpenRouter account is out of credits (${why}).` : String(why));
  }
  return parseAnswer(j);
}
