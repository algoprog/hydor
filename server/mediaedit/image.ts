// A picture edited on the server from a recipe (shared/mediaedit.ts), for edit_image and the editors' saves: read into
// its pixels (a PNG here; any other kind with ffmpeg, else with Pillow in the picture tools' Python), turned, flipped and
// cropped, its look and hidden areas worked out (the same code the editor in the app runs), its marks drawn (raster.ts),
// its words written by ffmpeg's drawtext (or Pillow), and saved at its size as a PNG, JPEG or WebP. A photo turned by its
// file's own note (EXIF) is read turned, as a browser shows it. Nothing here runs what a picture holds.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyLook, hideArea, invert, apply, LIMITS, normalizeRecipe, textMetrics, uprightMap, type FontId, type ImageFormat, type ImageRecipe } from '../../shared/mediaedit.ts';
import { agentBaseEnv } from '../env.ts';
import { localTools } from '../images/hooks.ts';
import { dimensions } from '../images/openrouter.ts';
import { ffmpegBin } from '../media/frames.ts';
import { pictureType } from '../pages/assets.ts';
import { isPng, readPng, resize, writePng } from '../signatures/png.ts';
import { drawShapes, rgbaOf } from './raster.ts';

/** A picture's pixels: RGBA, row after row. */
export interface Pixels {
  w: number;
  h: number;
  px: Uint8ClampedArray;
}

/** Where words go in a picture, when placed by it rather than at a point. */
export const PLACES = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const;
export type Place = (typeof PLACES)[number];

/** Words to write over a picture: at its pixels (their box's top left), or by `place`; before it is made its final size. */
export interface Words {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  bg?: string;
  font?: FontId;
  place?: Place;
}

/** The margin words placed by an edge keep from it. */
const marginOf = (w: number, h: number) => Math.round(Math.min(w, h) * 0.04);

/** A problem in words a person (or an agent) can act on. */
export class EditError extends Error {}

export const MIMES: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' };
const EXTS: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };
export const extOf = (f: ImageFormat) => EXTS[f];
export const formatOfData = (b: Buffer): ImageFormat | null => {
  const m = pictureType(b);
  return m === 'image/png' ? 'png' : m === 'image/jpeg' ? 'jpeg' : m === 'image/webp' ? 'webp' : null;
};

const NEED = 'set up the picture tools in Settings → Images, video and audio, or install ffmpeg';

/** A program run with bytes in and out: what it wrote, and why it failed in its last line. */
function runWith(bin: string, args: string[], o: { input?: Buffer; timeoutMs?: number; maxOut?: number } = {}): Promise<{ out: Buffer; err: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...agentBaseEnv(), CUDA_VISIBLE_DEVICES: '' }, windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let err = '';
    let over = false;
    const max = o.maxOut ?? 512 * 1024 * 1024;
    p.stdout.on('data', (b: Buffer) => {
      size += b.length;
      if (size > max) {
        over = true;
        p.kill('SIGKILL');
      } else chunks.push(b);
    });
    p.stderr.setEncoding('utf8');
    p.stderr.on('data', (t: string) => (err = (err + t).slice(-64 * 1024)));
    const timer = setTimeout(() => p.kill('SIGKILL'), o.timeoutMs ?? 120_000);
    p.on('error', (e) => (clearTimeout(timer), reject(e)));
    p.on('close', (code) => {
      clearTimeout(timer);
      if (over) return reject(new EditError('The picture is too large to work on here.'));
      if (code !== 0) return reject(new Error(err.trim().split('\n').pop() || `${path.basename(bin)} failed`));
      resolve({ out: Buffer.concat(chunks), err });
    });
    p.stdin.on('error', () => {});
    p.stdin.end(o.input ?? null);
  });
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-edit-'));

// ---- reading -----------------------------------------------------------------------------------------------------

/** A picture's pixels: a PNG read here, any other kind (JPEG, WebP, GIF, AVIF) with ffmpeg or Pillow. */
export async function decode(data: Buffer): Promise<Pixels> {
  const d = dimensions(data);
  if (d && d.w * d.h > LIMITS.pixels) throw new EditError(`The picture is ${d.w} × ${d.h} pixels: at most ${LIMITS.pixels / 1e6} million can be edited.`);
  if (isPng(data)) {
    try {
      const r = readPng(data, { maxPixels: LIMITS.pixels });
      return { w: r.width, h: r.height, px: new Uint8ClampedArray(r.data.buffer, r.data.byteOffset, r.data.length) };
    } catch (e) {
      if (/pixels/i.test((e as Error).message)) throw new EditError((e as Error).message);
      // One this cannot read: ffmpeg may.
    }
  }
  const ff = await ffmpegBin();
  if (ff) return decodeFfmpeg(ff, data);
  if (localTools()) return decodePillow(data);
  throw new EditError(`Editing a JPEG, WebP or GIF picture needs ffmpeg or the picture tools here: ${NEED}.`);
}

async function decodeFfmpeg(ff: string, data: Buffer): Promise<Pixels> {
  const dir = tmpDir();
  try {
    const file = path.join(dir, 'in');
    fs.writeFileSync(file, data);
    // Its first frame as raw RGBA; ffmpeg says the size it made in its log (a photo's turn already applied).
    const r = await runWith(ff, ['-hide_banner', '-nostdin', '-i', file, '-map', '0:v:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxOut: LIMITS.pixels * 4 + 1 });
    const out = /Output #0[\s\S]*?Video: rawvideo[^\n]*?\b(\d{1,5})x(\d{1,5})\b/.exec(r.err);
    const w = out ? Number(out[1]) : 0;
    const h = out ? Number(out[2]) : 0;
    if (!w || !h || r.out.length !== w * h * 4) throw new EditError('That picture could not be read.');
    return { w, h, px: new Uint8ClampedArray(r.out.buffer, r.out.byteOffset, r.out.length) };
  } catch (e) {
    if (e instanceof EditError) throw e;
    throw new EditError(`That picture could not be read: ${(e as Error).message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const PILLOW_READ = `
from PIL import Image, ImageOps
im = Image.open('in.bin')
im = ImageOps.exif_transpose(im)
im.convert('RGBA').save('out.png', compress_level=1)
`;

async function decodePillow(data: Buffer): Promise<Pixels> {
  const dir = tmpDir();
  try {
    const r = await localTools()!.runPython(PILLOW_READ, { cwd: dir, timeoutMs: 90_000, files: { 'in.bin': data } });
    const png = r.files['out.png'];
    if (!r.ok || !png) throw new EditError(`That picture could not be read: ${r.stderr.trim().split('\n').pop() || 'Pillow failed'}`);
    const img = readPng(png, { maxPixels: LIMITS.pixels });
    return { w: img.width, h: img.height, px: new Uint8ClampedArray(img.data.buffer, img.data.byteOffset, img.data.length) };
  } catch (e) {
    if (e instanceof EditError) throw e;
    throw new EditError(`That picture could not be read: ${(e as Error).message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- working on it --------------------------------------------------------------------------------------------------

/** The picture turned, flipped, straightened and cropped: each new pixel read from where it came from (smoothly, when straightened). */
export function geometry(src: Pixels, r: ImageRecipe): Pixels {
  if (!r.rotate && !r.flipH && !r.flipV && !r.straighten && !r.crop) return { w: src.w, h: src.h, px: new Uint8ClampedArray(src.px) };
  const u = uprightMap(r, src.w, src.h, { crop: true });
  const inv = invert(u.map);
  const W = Math.max(1, Math.round(u.w));
  const H = Math.max(1, Math.round(u.h));
  const out = new Uint8ClampedArray(W * H * 4);
  const sw = src.w;
  const sh = src.h;
  const s = src.px;
  const smooth = !!r.straighten;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [fx, fy] = apply(inv, x + 0.5, y + 0.5);
      const o = (y * W + x) * 4;
      if (!smooth) {
        const ix = Math.min(sw - 1, Math.max(0, Math.floor(fx)));
        const iy = Math.min(sh - 1, Math.max(0, Math.floor(fy)));
        const i = (iy * sw + ix) * 4;
        out[o] = s[i];
        out[o + 1] = s[i + 1];
        out[o + 2] = s[i + 2];
        out[o + 3] = s[i + 3];
        continue;
      }
      // Between the four nearest pixels, held at the edges.
      const gx = Math.min(sw - 1, Math.max(0, fx - 0.5));
      const gy = Math.min(sh - 1, Math.max(0, fy - 0.5));
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const ax = gx - x0;
      const ay = gy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = s[i00 + c] + (s[i10 + c] - s[i00 + c]) * ax;
        const bot = s[i01 + c] + (s[i11 + c] - s[i01 + c]) * ax;
        out[o + c] = top + (bot - top) * ay + 0.5;
      }
    }
  }
  return { w: W, h: H, px: out };
}

/**
 * A recipe made into pixels: turned and cropped, its look, its hidden areas and its marks; its words to write as it is
 * saved (they need a font: encode does it), and notes on what was left out.
 */
export function render(src: Pixels, r: ImageRecipe): { p: Pixels; words: Words[]; notes: string[] } {
  const p = geometry(src, r);
  applyLook(p.px, p.w, p.h, r.adjust, r.filter, r);
  const at = { x: r.crop?.x ?? 0, y: r.crop?.y ?? 0 };
  const marks = r.marks ?? [];
  for (const m of marks) if (m.type === 'blur' || m.type === 'pixelate') hideArea(p.px, p.w, p.h, { x: m.x - at.x, y: m.y - at.y, w: m.w, h: m.h }, m.type, m.strength);
  drawShapes(p.px, p.w, p.h, marks, at);
  const words: Words[] = [];
  const notes: string[] = [];
  for (const m of marks) if (m.type === 'text') words.push({ text: m.text, x: m.x - at.x, y: m.y - at.y, size: m.size, color: m.color, ...(m.bg ? { bg: m.bg } : {}), ...(m.font ? { font: m.font } : {}) });
  if (marks.some((m) => m.type === 'emoji')) notes.push('Emoji are not drawn here (they need a colour font): the editor in the app draws them.');
  return { p, words, notes };
}

// ---- writing ---------------------------------------------------------------------------------------------------------

/** The pixels as the PNG helpers take them (the same bytes). */
const asRgba = (p: Pixels) => ({ width: p.w, height: p.h, data: new Uint8Array(p.px.buffer, p.px.byteOffset, p.px.length) });

const opaque = (p: Pixels) => {
  for (let i = 3; i < p.px.length; i += 4) if (p.px[i] < 255) return false;
  return true;
};

/** On white, for a JPEG, which keeps no see-through parts. */
function onWhite(p: Pixels): Pixels {
  const px = new Uint8ClampedArray(p.px);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    if (a >= 1) continue;
    px[i] = px[i] * a + 255 * (1 - a);
    px[i + 1] = px[i + 1] * a + 255 * (1 - a);
    px[i + 2] = px[i + 2] * a + 255 * (1 - a);
    px[i + 3] = 255;
  }
  return { w: p.w, h: p.h, px };
}

const FONT_ASK: Record<FontId, string> = { sans: 'sans-serif:bold', serif: 'serif:bold', mono: 'monospace:bold', hand: 'Comic Neue,Comic Sans MS,cursive:bold', heavy: 'Impact,Anton,sans-serif:black' };
const FONT_FILES: Record<'regular' | 'bold', string[]> = {
  bold: ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf', 'C:\\Windows\\Fonts\\arialbd.ttf'],
  regular: ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', 'C:\\Windows\\Fonts\\arial.ttf'],
};
const fonts = new Map<FontId, Promise<string | null>>();

/** A font file for words of a kind: fontconfig's pick, else a common one; null when none is found (drawtext then takes its own). */
function fontFile(kind: FontId): Promise<string | null> {
  let f = fonts.get(kind);
  if (!f) {
    f = new Promise((resolve) => {
      execFile('fc-match', ['-f', '%{file}', FONT_ASK[kind]], { timeout: 5000 }, (err, out) => {
        const file = String(out ?? '').trim();
        if (!err && file && fs.existsSync(file) && !/'/.test(file)) return resolve(file);
        resolve([...FONT_FILES.bold, ...FONT_FILES.regular].find((x) => fs.existsSync(x)) ?? null);
      });
    });
    fonts.set(kind, f);
  }
  return f;
}

const ffColor = (c: string) => {
  const [r, g, b, a] = rgbaOf(c);
  return `0x${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}@${(a / 255).toFixed(3)}`;
};

/** The quality asked (1 to 100) as ffmpeg's JPEG scale (2 best, 31 worst). */
const jpegQ = (q: number) => Math.round(2 + ((100 - Math.max(1, Math.min(100, q))) * 29) / 99);

export interface Made {
  data: Buffer;
  mime: string;
  w: number;
  h: number;
}

/**
 * The picture saved: its words written, made `resize`'s size, as `format` at `quality`. A PNG with nothing to write is
 * made here; anything else with ffmpeg, else Pillow; without either, it says what is missing.
 */
export async function encode(p: Pixels, o: { format: ImageFormat; quality?: number; words?: Words[]; resize?: { w: number; h: number } }): Promise<Made> {
  const words = (o.words ?? []).filter((w) => w.text.trim());
  const size = o.resize && (o.resize.w !== p.w || o.resize.h !== p.h) ? o.resize : null;
  const q = o.quality ?? 90;
  const src = o.format === 'jpeg' ? onWhite(p) : p;
  const ff = await ffmpegBin();
  if (!words.length && o.format === 'png' && !(size && ff)) {
    const img = size ? resize(asRgba(p), size.w, size.h) : asRgba(p);
    return { data: writePng(img, { alpha: !opaque(p) }), mime: MIMES.png, w: img.width, h: img.height };
  }
  let failed: Error | null = null;
  if (ff) {
    try {
      return await encodeFfmpeg(ff, src, { format: o.format, quality: q, words, size });
    } catch (e) {
      failed = e as Error;
    }
  }
  if (localTools()) return encodePillow(src, { format: o.format, quality: q, words, size });
  if (failed) throw new EditError(`The picture could not be saved: ${failed.message}`);
  throw new EditError(words.length ? `Words on a picture need ffmpeg or the picture tools here: ${NEED}.` : `Saving a ${o.format === 'jpeg' ? 'JPEG' : 'WebP'} picture needs ffmpeg or the picture tools here: ${NEED}.`);
}

async function encodeFfmpeg(ff: string, p: Pixels, o: { format: ImageFormat; quality: number; words: Words[]; size: { w: number; h: number } | null }): Promise<Made> {
  const dir = tmpDir();
  try {
    const filters: string[] = [];
    for (const [i, w] of o.words.entries()) {
      const file = path.join(dir, `w${i}.txt`);
      fs.writeFileSync(file, w.text.replace(/\r\n?/g, '\n'));
      const font = await fontFile(w.font ?? 'sans');
      const { line, pad } = textMetrics(w.size);
      // By place: drawtext measures the words itself (text_w, text_h), its box's padding kept inside the margin.
      const m = marginOf(p.w, p.h) + pad;
      const px = w.place?.endsWith('left') ? `${m}` : w.place?.endsWith('right') ? `w-text_w-${m}` : w.place ? '(w-text_w)/2' : `${Math.round(w.x + pad)}`;
      const py = w.place?.startsWith('top') ? `${m}` : w.place?.startsWith('bottom') ? `h-text_h-${m}` : w.place ? '(h-text_h)/2' : `${Math.round(w.y + pad)}`;
      const parts = [
        ...(font ? [`fontfile='${font}'`] : []),
        `textfile='${file}'`,
        'expansion=none',
        `x='${px}'`,
        `y='${py}'`,
        `fontsize=${Math.round(w.size)}`,
        `fontcolor=${ffColor(w.color)}`,
        `line_spacing=${Math.max(0, Math.round(line - w.size * 1.17))}`,
        ...(w.bg ? ['box=1', `boxcolor=${ffColor(w.bg)}`, `boxborderw=${pad}`] : []),
      ];
      filters.push(`drawtext=${parts.join(':')}`);
    }
    if (o.size) filters.push(`scale=${o.size.w}:${o.size.h}:flags=lanczos`);
    const alpha = o.format !== 'jpeg' && !opaque(p);
    const out = path.join(dir, `out.${EXTS[o.format]}`);
    const codec =
      o.format === 'png'
        ? ['-c:v', 'png', '-pix_fmt', alpha ? 'rgba' : 'rgb24']
        : o.format === 'jpeg'
          ? ['-c:v', 'mjpeg', '-pix_fmt', 'yuvj420p', '-q:v', String(jpegQ(o.quality))]
          : ['-c:v', 'libwebp', '-quality', String(Math.max(1, Math.min(100, o.quality))), '-pix_fmt', alpha ? 'yuva420p' : 'yuv420p'];
    const raw = Buffer.from(p.px.buffer, p.px.byteOffset, p.px.length);
    await runWith(ff, ['-hide_banner', '-nostdin', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${p.w}x${p.h}`, '-i', 'pipe:0', ...(filters.length ? ['-vf', filters.join(',')] : []), '-frames:v', '1', ...codec, '-y', out], {
      input: raw,
      maxOut: 1 << 20,
    });
    const data = fs.readFileSync(out);
    const d = dimensions(data);
    return { data, mime: MIMES[o.format], w: d?.w ?? o.size?.w ?? p.w, h: d?.h ?? o.size?.h ?? p.h };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const PILLOW_WRITE = `
import json
from PIL import Image, ImageDraw, ImageFont
spec = json.load(open('spec.json'))
im = Image.open('in.png').convert('RGBA')
if spec['words']:
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for w in spec['words']:
        try:
            font = ImageFont.truetype(w['fontfile'], w['size']) if w.get('fontfile') else ImageFont.load_default(w['size'])
        except Exception:
            font = ImageFont.load_default()
        at = (w['x'] + w['pad'], w['y'] + w['pad'])
        place = w.get('place')
        if place:
            b = d.multiline_textbbox((0, 0), w['text'], font=font, spacing=w['spacing'])
            tw, th = b[2] - b[0], b[3] - b[1]
            m = w['margin'] + w['pad']
            x = m if place.endswith('left') else im.width - tw - m if place.endswith('right') else (im.width - tw) / 2
            y = m if place.startswith('top') else im.height - th - m if place.startswith('bottom') else (im.height - th) / 2
            at = (x - b[0], y - b[1])
        if w.get('bg'):
            b = d.multiline_textbbox(at, w['text'], font=font, spacing=w['spacing'])
            p = w['pad']
            d.rounded_rectangle((b[0] - p, b[1] - p, b[2] + p, b[3] + p), radius=int(p * 0.7), fill=tuple(w['bg']))
        d.multiline_text(at, w['text'], font=font, fill=tuple(w['color']), spacing=w['spacing'])
    im = Image.alpha_composite(im, layer)
if spec.get('size'):
    im = im.resize(tuple(spec['size']), Image.LANCZOS)
f = spec['format']
if f == 'jpeg':
    im.convert('RGB').save('out.jpg', quality=spec['quality'], optimize=True)
elif f == 'webp':
    im.save('out.webp', quality=spec['quality'])
else:
    im.save('out.png')
`;

async function encodePillow(p: Pixels, o: { format: ImageFormat; quality: number; words: Words[]; size: { w: number; h: number } | null }): Promise<Made> {
  const dir = tmpDir();
  try {
    const words = await Promise.all(
      o.words.map(async (w) => {
        const { line, pad } = textMetrics(w.size);
        return {
          text: w.text,
          x: w.x,
          y: w.y,
          size: Math.round(w.size),
          pad,
          margin: marginOf(p.w, p.h),
          place: w.place ?? null,
          spacing: Math.max(0, Math.round(line - w.size * 1.17)),
          color: rgbaOf(w.color),
          ...(w.bg ? { bg: rgbaOf(w.bg) } : {}),
          fontfile: await fontFile(w.font ?? 'sans'),
        };
      }),
    );
    const spec = { words, size: o.size ? [o.size.w, o.size.h] : null, format: o.format, quality: Math.max(1, Math.min(100, o.quality)) };
    const png = writePng(asRgba(p), { alpha: !opaque(p) });
    const r = await localTools()!.runPython(PILLOW_WRITE, { cwd: dir, timeoutMs: 120_000, files: { 'in.png': png, 'spec.json': Buffer.from(JSON.stringify(spec)) } });
    const data = r.files[`out.${EXTS[o.format]}`];
    if (!r.ok || !data) throw new EditError(`The picture could not be saved: ${r.stderr.trim().split('\n').pop() || 'Pillow failed'}`);
    const d = dimensions(data);
    return { data, mime: MIMES[o.format], w: d?.w ?? o.size?.w ?? p.w, h: d?.h ?? o.size?.h ?? p.h };
  } catch (e) {
    if (e instanceof EditError) throw e;
    throw new EditError(`The picture could not be saved: ${(e as Error).message}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A picture edited by a recipe (checked here first), saved as the recipe's kind of file (its own kind, or a PNG). */
export async function editPicture(data: Buffer, raw: ImageRecipe): Promise<Made & { notes: string[]; from: { w: number; h: number } }> {
  const src = await decode(data);
  const r = normalizeRecipe(raw, src.w, src.h);
  const { p, words, notes } = render(src, r);
  const format = r.format ?? formatOfData(data) ?? 'png';
  const made = await encode(p, { format, quality: r.quality, words, resize: r.resize });
  return { ...made, notes, from: { w: src.w, h: src.h } };
}

/** A picture made another kind of file (the browser could not make it), at the same size. */
export async function convert(data: Buffer, format: ImageFormat, quality = 90): Promise<Made> {
  return encode(await decode(data), { format, quality });
}
