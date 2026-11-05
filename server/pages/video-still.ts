// A video's still, the picture that shows on a slide or a page until the video plays: YouTube's own (by the video's
// id), or Vimeo's, which Vimeo names only in its oEmbed. Fetched here on the server when a video is put on a slide or a
// page (public addresses only, each fetch bounded in time and size) and kept as the pictures of slides are
// (assets.ts), so the still shows in the editor, the slideshow, a deck's own page, published copies and every export,
// PowerPoint's file among them, without reaching the web again.
import { ASSET, videoSrc } from '../../shared/slides.ts';
import type { DB } from '../db.ts';
import { fetchPage } from '../web/fetch.ts';
import { MAX_ASSET, pictureType, putAsset } from './assets.ts';

/** How long each fetch may take: a still is worth waiting a little for, not long. */
const TIMEOUT_MS = 8000;

/** A picture at a public address, kept: its source, or null when it is no picture or could not be had. */
async function keepPicture(db: DB, url: string): Promise<string | null> {
  const r = await fetchPage(url, { maxBytes: MAX_ASSET + 1, timeoutMs: TIMEOUT_MS }).catch(() => null);
  if (!r || r.status >= 400 || !r.body || r.truncated || !pictureType(r.body)) return null;
  return ASSET + putAsset(db, r.body);
}

/** Where Vimeo's still of a video is, as its oEmbed says (as wide as a slide), or null for a private or missing video. */
async function vimeoStill(id: string): Promise<string | null> {
  const page = `https://vimeo.com/${id}`;
  const r = await fetchPage(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(page)}&width=1280`, { maxBytes: 200_000, timeoutMs: TIMEOUT_MS }).catch(() => null);
  if (!r || r.status >= 400) return null;
  try {
    const url = (JSON.parse(r.text) as { thumbnail_url?: unknown }).thumbnail_url;
    return typeof url === 'string' && /^https:\/\/[^\s"'<>]+$/.test(url) ? url : null;
  } catch {
    return null;
  }
}

/** A YouTube or Vimeo video's still, kept by the app ("naget-asset:<sha>"), or null when its site gave none. */
export async function videoStillOf(db: DB, url: string): Promise<string | null> {
  const src = videoSrc(url);
  if (!src) return null;
  const id = src.split('/').pop() ?? '';
  if (src.includes('youtube')) {
    // The largest YouTube has (not every video has it), else the one every video has.
    for (const size of ['maxresdefault', 'hqdefault']) {
      const got = await keepPicture(db, `https://i.ytimg.com/vi/${id}/${size}.jpg`);
      if (got) return got;
    }
    return null;
  }
  const still = await vimeoStill(id);
  return still ? keepPicture(db, still) : null;
}
