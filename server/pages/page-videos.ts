// Videos in pages (and designs): a page shows a video the app keeps at its signed address ("/pg/video/<sha>/<sig>",
// videos.ts), which plays without the app's sign-in wherever the page opens: in the app's frame, at its own address,
// published. The versions that show one keep it (as decks' do), and a page saved as a file carries the small ones inside it.
import { VIDEO } from '../../shared/slides.ts';
import type { DB } from '../db.ts';
import { videoAddress, videoAddressOk, videoDataUrl, VIDEO_INSIDE } from './videos.ts';

const ADDRESS = /\/pg\/video\/([a-f0-9]{16,64})\/([a-f0-9]{16,64})/g;

/** The kept videos a page shows, as sources ("naget-video:<sha>"), so the version that shows them keeps them. */
export function pageVideoSources(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(ADDRESS)) if (videoAddressOk(m[1], m[2])) out.add(`${VIDEO}${m[1]}`);
  return [...out];
}

/** A page to open anywhere (saved as a file): its videos inside it, those small enough; the others at this server. */
export function videosInside(db: DB, html: string, base = ''): string {
  return html.replace(ADDRESS, (m, sha: string) => videoDataUrl(db, `${VIDEO}${sha}`, VIDEO_INSIDE) ?? (base ? `${base}${m}` : m));
}

/** The address a kept video plays at in a page. */
export const pageVideoAddress = (src: string) => (src.startsWith(VIDEO) && /^[a-f0-9]{16,64}$/.test(src.slice(VIDEO.length)) ? videoAddress(src.slice(VIDEO.length)) : null);
