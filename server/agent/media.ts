// Images for Custom: what an image file is (its type and size, from its first bytes), made small enough
// for a model when this machine has ffmpeg or ImageMagick, kept in the session's folder (the conversation
// refers to the file instead of carrying its bytes), and described by the app's helper model for a model
// that does not see images.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Part } from './llm.ts';

export interface Img {
  data: string;
  mimeType: string;
}

export const IMAGE_TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp' };
const EXT: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' };

/** The kind of image in a buffer, from its first bytes; null when it is not one. */
export function imageType(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 2) === 'BM') return 'image/bmp';
  return null;
}

/** Width and height, from the header (PNG, JPEG, GIF, WebP, BMP). */
export function imageSize(b: Buffer): { width: number; height: number } | null {
  try {
    switch (imageType(b)) {
      case 'image/png':
        return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
      case 'image/gif':
        return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
      case 'image/bmp':
        return { width: b.readInt32LE(18), height: Math.abs(b.readInt32LE(22)) };
      case 'image/webp': {
        const kind = b.toString('ascii', 12, 16);
        if (kind === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
        if (kind === 'VP8L') {
          const n = b.readUInt32LE(21);
          return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1 };
        }
        if (kind === 'VP8X') return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
        return null;
      }
      case 'image/jpeg':
        for (let i = 2; i + 9 < b.length; ) {
          if (b[i] !== 0xff) {
            i++;
            continue;
          }
          const m = b[i + 1];
          if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
          i += 2 + b.readUInt16BE(i + 2);
        }
    }
  } catch {}
  return null;
}

let found: { magick?: string; ffmpeg?: string } | null = null;
function converters() {
  if (found) return found;
  const isFile = (p: string) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };
  const look = (n: string) => (process.env.PATH ?? '').split(':').filter(Boolean).map((dir) => path.join(dir, n)).find(isFile);
  return (found = { magick: look('magick') ?? look('convert'), ffmpeg: look('ffmpeg') });
}

/** Scales an image down to `side` pixels on its longer side with what this machine has; null without a tool for it. */
function shrink(b: Buffer, type: string, side: number): { data: Buffer; mimeType: string } | null {
  const c = converters();
  if (!c.magick && !c.ffmpeg) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naget-img-'));
  try {
    const keepPng = type === 'image/png' || type === 'image/gif';
    const inp = path.join(dir, `in${EXT[type] ?? ''}`);
    const out = path.join(dir, keepPng ? 'out.png' : 'out.jpg');
    fs.writeFileSync(inp, b);
    const r = c.magick
      ? spawnSync(c.magick, [`${inp}[0]`, '-resize', `${side}x${side}>`, ...(keepPng ? [] : ['-quality', '85']), out], { timeout: 30_000 })
      : spawnSync(c.ffmpeg!, ['-v', 'error', '-y', '-i', inp, '-vf', `scale='min(${side},iw)':'min(${side},ih)':force_original_aspect_ratio=decrease`, '-frames:v', '1', ...(keepPng ? [] : ['-q:v', '3']), out], { timeout: 30_000 });
    if (r.status !== 0 || !fs.existsSync(out)) return null;
    return { data: fs.readFileSync(out), mimeType: keepPng ? 'image/png' : 'image/jpeg' };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * An image ready for a model: at most `side` pixels on its longer side and a few MB (scaled down here
 * when it can be); null when it is too big and cannot be scaled.
 */
export function fitImage(b: Buffer, side = 1568, maxBytes = 3_500_000): { data: Buffer; mimeType: string; width?: number; height?: number } | null {
  const type = imageType(b);
  if (!type) return null;
  const size = imageSize(b);
  const big = (size && Math.max(size.width, size.height) > side) || b.length > maxBytes || type === 'image/bmp';
  if (!big) return { data: b, mimeType: type, ...size };
  const small = shrink(b, type, side);
  if (small && small.data.length <= maxBytes * 1.5) return { ...small, ...(imageSize(small.data) ?? {}) };
  if (b.length <= maxBytes && type !== 'image/bmp') return { data: b, mimeType: type, ...size };
  return null;
}

/** Keeps an image in the session's folder (one file per distinct image) and returns its path. */
export function keepImage(dir: string, data: Buffer, mimeType: string): string {
  const folder = path.join(dir, 'images');
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, `${crypto.createHash('sha256').update(data).digest('hex').slice(0, 20)}${EXT[mimeType] ?? '.img'}`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, data, { mode: 0o600 });
  return file;
}

/** A message part showing a kept image: the file is read when the conversation is sent. */
export const imagePart = (file: string): Part => ({ type: 'image_url', image_url: { url: `file://${file}` } });

/** The image a part refers to as data for the request, or null when its file is gone. */
export function dataUrl(url: string): string | null {
  if (!url.startsWith('file://')) return url;
  const file = url.slice(7);
  try {
    const b = fs.readFileSync(file);
    return `data:${imageType(b) ?? 'image/png'};base64,${b.toString('base64')}`;
  } catch {
    return null;
  }
}

const described = new Map<string, string>();

/** Text for images from the app's helper model, for a model that does not see them; throws with the reason when it cannot. */
export async function describeImages(runtime: string, images: Img[], hint: string, signal?: AbortSignal): Promise<string> {
  const key = crypto.createHash('sha256').update(images.map((i) => i.data).join('|') + hint).digest('hex');
  const hit = described.get(key);
  if (hit) return hit;
  if (!runtime) throw new Error('the app is not reachable from here');
  const r = await fetch(`${runtime}/describe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ images, hint }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(String(d.error ?? `the app answered ${r.status}`));
  const text = String(d.text ?? '').trim();
  if (text) described.set(key, text);
  return text;
}
