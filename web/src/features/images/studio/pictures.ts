// Pictures as the editors' AI tools take them and give them back: shown in the app from where the app keeps them
// ("naget-asset:<sha>", videos "naget-video:<sha>"), any picture kept first (a data: address, one on the web, one of a
// page's own files), and a kept one as a data: address for a page (pages keep their pictures inside them), no larger
// than a page needs: at most 1600 pixels on its longest side and about 450 KB, see-through parts kept.
import type { MadePicture } from '@shared/images';
import { post } from '../../../lib/api';
import { mu } from '../../../lib/machine';

const ASSET = 'naget-asset:';
const VIDEO = 'naget-video:';

/** Where the app shows a picture (or a video) from: the app's own copy, a picture on the web through the app, or the address itself. */
export function shownSrc(src: string): string {
  if (src.startsWith(ASSET)) return mu(`/api/pages/assets/${src.slice(ASSET.length)}`);
  if (src.startsWith(VIDEO)) return mu(`/api/pages/videos/${src.slice(VIDEO.length)}`);
  if (/^https?:/i.test(src)) return mu(`/api/pages/picture?url=${encodeURIComponent(src)}`);
  return src;
}

/** A picture loaded, to read its size or draw it. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error('The picture could not be shown'));
    i.src = url;
  });
}

export const blobData = (b: Blob): Promise<string> =>
  new Promise((ok, fail) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => fail(new Error('The picture could not be read'));
    r.readAsDataURL(b);
  });

const sameOrigin = (u: string) => {
  try {
    return new URL(u, location.href).origin === location.origin;
  } catch {
    return false;
  }
};

/** What kind of picture a data: address is. */
const mimeOf = (data: string) => /^data:([^;,]+)/.exec(data)?.[1] ?? 'image/png';

/**
 * Any picture kept by the app, as the AI tools need it: one kept already stays as it is; a data: address or one on the
 * web is kept; another address (a page's own file, a blob:) is read here first. Its source, size and kind.
 */
export async function keepPicture(src: string): Promise<MadePicture> {
  let kept = src;
  let mime = '';
  if (!src.startsWith(ASSET)) {
    let data = src.startsWith('data:') ? src : '';
    // The app's own addresses (a page's files) are read here, with its sign-in; the web's, by the server.
    if (!data && (!/^https?:\/\//i.test(src) || sameOrigin(src))) {
      const res = await fetch(src, { credentials: 'same-origin' }).catch(() => null);
      if (!res?.ok) throw new Error('That picture could not be read');
      data = await blobData(await res.blob());
    }
    if (data) mime = mimeOf(data);
    kept = (await post<{ src: string }>('/api/pages/assets', data ? { data } : { url: src })).src;
  }
  const img = await loadImage(shownSrc(kept));
  return { src: kept, w: img.naturalWidth || 800, h: img.naturalHeight || 600, mime: mime || (await kindOf(kept)) };
}

/** A kept picture's kind, as the app serves it. */
async function kindOf(src: string): Promise<string> {
  const res = await fetch(shownSrc(src), { method: 'HEAD', credentials: 'same-origin' }).catch(() => null);
  return res?.headers.get('content-type')?.split(';')[0] ?? 'image/png';
}

/** The longest side a picture keeps inside a page, and about the most bytes it takes there (as the server's page-pictures.ts). */
export const PAGE_SIDE = 1600;
export const PAGE_BYTES = 450_000;

/** Whether a picture has see-through parts (looked at small, which is enough to tell). */
export function hasAlpha(img: CanvasImageSource, w: number, h: number): boolean {
  const k = Math.min(1, 256 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  return false;
}

/** The size a picture takes inside a page: no side over PAGE_SIDE, its shape kept. */
export function pageSize(w: number, h: number, side = PAGE_SIDE): { w: number; h: number } {
  const k = Math.min(1, side / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** A data: address's size in bytes, about. */
const bytesOf = (data: string) => Math.round(((data.length - data.indexOf(',') - 1) * 3) / 4);

/**
 * A kept picture (or any the app can show) as a data: address for a page: a drawing (SVG) as it is; a picture made
 * no larger than a page needs, a PNG while it has see-through parts (smaller until it fits), else a JPEG.
 */
export async function pageData(src: string): Promise<string> {
  if (src.startsWith('data:') && bytesOf(src) <= PAGE_BYTES) return src;
  const res = await fetch(shownSrc(src), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('That picture could not be read');
  const blob = await res.blob();
  if (blob.type === 'image/svg+xml' || blob.type === 'image/gif') {
    if (blob.size > 1_000_000) throw new Error('That picture is over 1 MB');
    return blobData(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const nw = img.naturalWidth || 800;
    const nh = img.naturalHeight || 600;
    const alpha = hasAlpha(img, nw, nh);
    // Smaller until it fits (a photo as a JPEG fits at once; a PNG with see-through parts may take a step or two).
    for (let side = PAGE_SIDE; ; side = Math.max(480, Math.round(side * 0.75))) {
      const s = pageSize(nw, nh, side);
      const c = document.createElement('canvas');
      c.width = s.w;
      c.height = s.h;
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, s.w, s.h);
      const data = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
      if (bytesOf(data) <= PAGE_BYTES || side <= 480) return data;
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}
