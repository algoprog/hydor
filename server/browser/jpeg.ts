// Screenshots as JPEGs every decoder reads. The full Chromium (Chrome for Testing 159, as Playwright's chromium-1255,
// in its headless mode) writes Page.captureScreenshot's JPEGs as baseline JPEGs with one scan for each colour
// component (numbered from 0) instead of one interleaved scan. That is valid: browsers and Pillow show them right. But
// the image pipeline that hands pictures to models reads such a file as if it were interleaved, and the model sees two
// half-width copies side by side with the text shredded (any size: the scale of the capture plays no part). Chromium's
// headless shell, and the page's own canvas, write the usual interleaved JPEG (libjpeg-turbo). So a JPEG is taken as
// a PNG and made a JPEG by the page's canvas, in a world of its own that the page's scripts cannot see or change.
// server/capture/capture-test.ts checks the pictures that come out, byte by byte and pixel by pixel.
import type { CdpSession } from './cdp.ts';

/** Turns a PNG (base64) into a JPEG (base64) with the browser's canvas; `quality` 0–100. Runs in the page's isolated world. */
const ENCODE = `async function (png, quality) {
  const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const g = canvas.getContext('2d', { alpha: false });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, bitmap.width, bitmap.height);
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 })).arrayBuffer());
  let s = '';
  for (let i = 0; i < jpeg.length; i += 0x8000) s += String.fromCharCode.apply(null, jpeg.subarray(i, i + 0x8000));
  return btoa(s);
}`;

let warned = false;
/** The isolated world each tab encodes in, made once (a navigation takes it away: a new one is made then). */
const worlds = new WeakMap<CdpSession, number>();

async function encode(s: CdpSession, png: string, quality: number, timeoutMs: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let id = worlds.get(s);
    if (id === undefined) {
      const tree = await s.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree');
      id = (await s.send<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'hydor-jpeg', grantUniveralAccess: false })).executionContextId;
      worlds.set(s, id);
    }
    try {
      const r = await s.send<{ result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text?: string } }>(
        'Runtime.callFunctionOn',
        { functionDeclaration: ENCODE, executionContextId: id, arguments: [{ value: png }, { value: Math.max(1, Math.min(100, Math.round(quality))) }], awaitPromise: true, returnByValue: true },
        timeoutMs,
      );
      if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'the canvas failed').split('\n')[0]);
      if (typeof r.result?.value !== 'string' || !r.result.value) throw new Error('the canvas gave nothing back');
      return r.result.value;
    } catch (e) {
      worlds.delete(s);
      // The page moved on since the world was made: once more, in a new one.
      if (attempt > 0 || !/context/i.test((e as Error).message)) throw e;
    }
  }
}

/**
 * Page.captureScreenshot as a JPEG (base64) with one interleaved scan, as every decoder expects: `params` as for
 * Page.captureScreenshot (its clip, captureBeyondViewport…; format and quality are this function's). Should the
 * canvas fail (a page that went away meanwhile), Chromium's own JPEG comes back instead.
 */
export async function captureJpeg(s: CdpSession, params: Record<string, unknown>, quality: number, timeoutMs = 30_000): Promise<string> {
  const { format: _f, quality: _q, ...rest } = params;
  const png = await s.send<{ data: string }>('Page.captureScreenshot', { ...rest, format: 'png' }, timeoutMs);
  try {
    return await encode(s, png.data, quality, timeoutMs);
  } catch (e) {
    if (!warned) console.warn(`[capture] a JPEG is Chromium's own this time (${(e as Error).message})`);
    warned = true;
    const own = await s.send<{ data: string }>('Page.captureScreenshot', { ...rest, format: 'jpeg', quality: Math.round(quality) }, timeoutMs);
    return own.data;
  }
}

/** A JPEG's width in pixels, from its frame header (base64: only its start is read), or 0 when that is not there. */
export function jpegWidth(b64: string): number {
  const b = Buffer.from(b64.slice(0, 8192), 'base64');
  for (let i = 2; i + 9 < b.length && b[i] === 0xff; i += 2 + b.readUInt16BE(i + 2)) if (b[i + 1] >= 0xc0 && b[i + 1] <= 0xc3) return b.readUInt16BE(i + 7);
  return 0;
}

/**
 * A JPEG's frame and scans, for the tests: the ids of the frame's components, and those of each scan. Every decoder
 * reads one scan of all three components; Chromium's own have three scans, numbered from 0 ([[0], [1], [2]]).
 */
export function jpegLayout(b: Buffer): { frame: number[]; scans: number[][] } {
  const out = { frame: [] as number[], scans: [] as number[][] };
  if (b.length < 4 || b.readUInt16BE(0) !== 0xffd8) throw new Error('not a JPEG');
  let i = 2;
  while (i < b.length - 1) {
    if (b[i] !== 0xff) throw new Error(`no marker at byte ${i}`);
    const m = b[i + 1];
    i += 2;
    if (m === 0xd9) break;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue;
    const len = b.readUInt16BE(i);
    const seg = b.subarray(i + 2, i + len);
    if (m >= 0xc0 && m <= 0xc3) out.frame = Array.from({ length: seg[5] }, (_, k) => seg[6 + 3 * k]);
    i += len;
    if (m === 0xda) {
      out.scans.push(Array.from({ length: seg[0] }, (_, k) => seg[1 + 2 * k]));
      // The scan's data runs to the next marker that is neither a stuffed byte nor a restart.
      while (i < b.length - 1 && !(b[i] === 0xff && b[i + 1] !== 0 && !(b[i + 1] >= 0xd0 && b[i + 1] <= 0xd7))) i++;
    }
  }
  return out;
}
