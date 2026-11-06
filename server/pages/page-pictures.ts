// Pictures an agent puts in a page it saves (save_page): a file of its session's folder (one generate_image,
// make_svg or make_plot made, or one it was given) or a picture the app keeps ("naget-asset:<sha>"), named where the
// page shows a picture (an <img>'s or <source>'s src, a <video>'s poster, CSS url() in a style attribute or a <style>
// block), goes inside the page as a data: address: a page runs in a sandboxed frame that reaches no file and none of
// the app's addresses. Pictures larger than a page needs are made smaller first where this computer can (ImageMagick
// or ffmpeg, as for the pictures Custom's models see); what could not go in is said to the agent.
import fs from 'node:fs';
import path from 'node:path';
import { ASSET } from '../../shared/slides.ts';
import { fitImage } from '../agent/media.ts';
import type { DB } from '../db.ts';
import { inSession } from '../documents/index.ts';
import { getAsset, pictureType } from './assets.ts';
import { MAX_PAGE } from './store.ts';

/** The longest side a picture keeps inside a page, and about the most bytes it takes there. */
const SIDE = 1600;
const BYTES = 450_000;
/** The largest file read at all. */
const MAX_FILE = 25 * 1024 * 1024;

/** An address that is not a file's: the web's, data:, blob:, a part of the page, or the app's own. */
const NOT_A_FILE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/api\/|\/pg\/)/i;

/** Where pictures are named in a page: src="…" and poster="…" (img, source, video, input type=image), and CSS url(…). */
const ATTR = /(\s(?:src|poster)\s*=\s*)("[^"]*"|'[^']*')/gi;
const CSS_URL = /(url\(\s*)("[^"]*"|'[^']*'|[^)'"\s]+)(\s*\))/gi;

const unquote = (v: string) => (/^["']/.test(v) ? v.slice(1, -1) : v);
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** A picture's bytes as a page keeps them: made smaller when it is larger than a page needs and this computer can. */
function forPage(b: Buffer): { data: Buffer; mime: string } | null {
  const mime = pictureType(b);
  if (!mime) return null;
  if (mime === 'image/svg+xml' || mime === 'image/gif') return { data: b, mime };
  const fit = fitImage(b, SIDE, BYTES);
  return fit ? { data: fit.data, mime: fit.mimeType } : { data: b, mime };
}

export interface PagePictures {
  html: string;
  /** For the agent: what went in, and what did not. */
  notes: string[];
}

/**
 * The page with its pictures from the session's folder (relative to it, absolute, or ~/…) and the app's kept ones put
 * inside it. Each picture is read once however often it is named. A page that would be over the size a page may be
 * says so in words the agent can act on.
 */
export function pagePictures(db: DB, html: string, cwd: string): PagePictures {
  const notes: string[] = [];
  const done = new Map<string, string | null>();
  let inlined = 0;
  const resolve = (raw: string): string | null => {
    const addr = decode(raw.trim());
    if (!addr || addr.length > 4096) return null;
    if (done.has(addr)) return done.get(addr)!;
    let out: string | null = null;
    if (addr.startsWith(ASSET)) {
      const a = getAsset(db, addr.slice(ASSET.length));
      const p = a ? forPage(a.data) : null;
      if (p) out = `data:${p.mime};base64,${p.data.toString('base64')}`;
      else notes.push(`${addr} is not a picture this app keeps: it was left as it was.`);
    } else if (!NOT_A_FILE.test(addr)) {
      const file = inSession(cwd, addr.replace(/[?#].*$/, ''));
      const st = fs.statSync(file, { throwIfNoEntry: false });
      if (!st?.isFile()) {
        // An address of the page's own that is no file here (a relative link it means for the web) stays as it is, said only when it looks like a picture.
        if (/\.(png|jpe?g|gif|webp|svg)$/i.test(addr)) notes.push(`${addr}: no such picture in your folder (${path.join(cwd, addr)}); it was left as it was.`);
      } else if (st.size > MAX_FILE) notes.push(`${addr} is over ${MAX_FILE / 1024 / 1024} MB: it was left out of the page.`);
      else {
        const p = forPage(fs.readFileSync(file));
        if (p) out = `data:${p.mime};base64,${p.data.toString('base64')}`;
        else notes.push(`${addr} is not a PNG, JPEG, GIF, WebP or SVG picture: it was left as it was.`);
      }
    }
    done.set(addr, out);
    if (out) inlined++;
    return out;
  };
  const put = (before: string, value: string, after: string, whole: string) => {
    const q = /^["']/.test(value) ? value[0] : '"';
    const got = resolve(unquote(value));
    return got ? `${before}${q}${got}${q}${after}` : whole;
  };
  const next = html.replace(ATTR, (whole: string, before: string, value: string) => put(before, value, '', whole)).replace(CSS_URL, (whole: string, before: string, value: string, after: string) => put(before, value, after, whole));
  if (inlined) {
    notes.unshift(`${inlined} picture${inlined === 1 ? '' : 's'} from your folder went inside the page.`);
    if (Buffer.byteLength(next) > MAX_PAGE)
      throw new Error(
        `With its pictures inside, the page is ${(Buffer.byteLength(next) / 1048576).toFixed(1)} MB, over the ${MAX_PAGE / 1048576} MB a page may be: use fewer or smaller pictures (generate_image with a smaller resolution, or detail "simple"), or a slide deck (save_slides keeps its pictures apart).`,
      );
  }
  return { html: next, notes };
}
