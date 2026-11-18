// Pictures kept with a saved web page (the Browser's Save): a page shows a picture the app keeps at its signed address
// ("/pg/pic/<sha>/<sig>"), as it shows a kept video ("/pg/video/<sha>/<sig>", page-videos.ts), so the page's HTML stays small
// (and an agent reading it sees addresses, not pictures) however many pictures it has. The address is its own permission, so the
// picture shows wherever the page opens: in the app's frame, at its own address, published. The versions that show one keep it
// (the same store as decks' pictures, assets.ts); a page saved as a file, or taken as a picture of, gets them inside it.
import crypto from 'node:crypto';
import { ASSET } from '../../shared/slides.ts';
import type { DB } from '../db.ts';
import { signWithKey } from '../links.ts';
import { getAsset } from './assets.ts';

const ADDRESS = /\/pg\/pic\/([a-f0-9]{16,64})\/([\w-]{16,64})/g;

const sigOf = (sha: string) => signWithKey(`page-picture:${sha}`).slice(0, 32);

/** The address a kept picture shows at in a page: its own permission (no sign-in). */
export const pictureAddress = (sha: string) => `/pg/pic/${sha}/${sigOf(sha)}`;

/** Whether a picture's address carries this server's signature of it. */
export function pictureAddressOk(sha: string, sig: string): boolean {
  const want = sigOf(sha);
  return /^[a-f0-9]{16,64}$/.test(sha) && want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

/** The kept pictures a page shows, as sources ("naget-asset:<sha>"), so the version that shows them keeps them. */
export function pagePictureSources(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(ADDRESS)) if (pictureAddressOk(m[1], m[2])) out.add(`${ASSET}${m[1]}`);
  return [...out];
}

/**
 * A page to open anywhere, or to take a picture of: the kept pictures it shows inside it as data: addresses, those up to
 * `bytes` each (the others, and all after the first `max`, at this server's address when `base` is given, else left out).
 */
export function picturesInside(db: DB, html: string, o: { base?: string; bytes?: number; max?: number } = {}): string {
  const bytes = o.bytes ?? 1_500_000;
  let n = 0;
  return html.replace(ADDRESS, (m, sha: string, sig: string) => {
    if (!pictureAddressOk(sha, sig)) return m;
    const a = n < (o.max ?? Infinity) ? getAsset(db, sha) : null;
    if (a && a.data.length <= bytes) {
      n++;
      return `data:${a.mime};base64,${a.data.toString('base64')}`;
    }
    return o.base ? `${o.base}${m}` : 'data:,';
  });
}
