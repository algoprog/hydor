// Free photos, searched for on the web: Openverse's catalogue of openly licensed pictures (api.openverse.org, without
// an account: about 20 searches a minute and 200 a day for each computer), only those free for any use and to change
// (commercial use and changes allowed: no NonCommercial, no NoDerivatives), and Wikimedia Commons' when Openverse
// cannot answer (it is down, or this computer has used its searches for the day) or finds none. What a search finds is
// remembered for a while by its id, so the editor's small pictures and its Use ask for no address of the client's: only
// those of photos this server found. Pictures come through the web fetch (public addresses only, bounded in time and
// size); a photo too large to keep comes at a size a slide needs (Commons' 1280-pixel copy, Openverse's own copy).
import type { Photo, PhotoOrientation, PhotoSearch } from '../../shared/photos.ts';
import { htmlText, fetchPage } from '../web/fetch.ts';
import { pictureType } from '../pages/assets.ts';

/** A photo as this server knows it: what the editor sees, and where its pictures are (never sent to the editor). */
export interface Found extends Photo {
  /** The picture itself, and copies of it at a size for a slide and for a small picture. */
  url: string;
  big?: string;
  small: string;
}

export interface PhotoDeps {
  /** A search's answer (JSON) from Openverse or Commons; throws when it gives none (its status, or the network). */
  json(url: string, signal?: AbortSignal): Promise<unknown>;
  /** A picture's bytes from the web (null when there is none to have, or it is over `max` bytes). */
  picture(url: string, max: number, signal?: AbortSignal): Promise<Buffer | null>;
}

const UA = 'Hydor (+https://github.com/algoprog/hydor)';
const OPENVERSE = 'https://api.openverse.org/v1/images/';
const COMMONS = 'https://commons.wikimedia.org/w/api.php';
/** A search's page of photos: as many as Openverse gives at once without an account. */
export const PAGE_SIZE = 20;

const realDeps: PhotoDeps = {
  async json(url, signal) {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(10_000)]) });
    if (!r.ok) throw new Error(r.status === 429 ? 'it has had too many searches from this computer for now' : `it answered ${r.status}`);
    return r.json();
  },
  async picture(url, max, signal) {
    const r = await fetchPage(url, { maxBytes: max + 1, timeoutMs: 25_000, signal }).catch(() => null);
    if (!r || r.status >= 400 || r.truncated || !r.body) return null;
    return pictureType(r.body) ? r.body : null;
  },
};
let deps: PhotoDeps = realDeps;
/** For tests: a stand-in for Openverse, Commons and the pictures. */
export function setPhotoDepsForTests(d: PhotoDeps | null) {
  deps = d ?? realDeps;
}
export const photoDeps = () => deps;

// ---- what was found, by id -------------------------------------------------------------------------------------

const found = new Map<string, Found>();
const remember = (p: Found) => {
  found.delete(p.id);
  found.set(p.id, p);
  if (found.size > 1500) found.delete(found.keys().next().value!);
  return p;
};

/** For the editor: a photo without the addresses of its pictures (its small picture comes through this server). */
export const shown = (p: Found): Photo => {
  const { url: _u, big: _b, small: _s, ...rest } = p;
  return { ...rest, thumb: `/api/photos/thumb/${encodeURIComponent(p.id)}` };
};

// ---- licences -------------------------------------------------------------------------------------------------------

const LICENSES: Record<string, string> = {
  by: 'CC BY',
  'by-sa': 'CC BY-SA',
  'by-nd': 'CC BY-ND',
  'by-nc': 'CC BY-NC',
  'by-nc-sa': 'CC BY-NC-SA',
  'by-nc-nd': 'CC BY-NC-ND',
  cc0: 'CC0',
  pdm: 'Public domain',
  'sampling+': 'CC Sampling+',
  'nc-sampling+': 'CC NC Sampling+',
};
const PROVIDERS: Record<string, string> = {
  flickr: 'Flickr',
  wikimedia: 'Wikimedia Commons',
  stocksnap: 'StockSnap',
  rawpixel: 'rawpixel',
  nappy: 'nappy',
  smithsonian: 'the Smithsonian',
  met: 'the Met',
  clevelandmuseum: 'the Cleveland Museum of Art',
  nasa: 'NASA',
  geographorguk: 'Geograph',
};

const text = (v: unknown, n = 300) =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, n)
    : '';
const https = (v: unknown): string | undefined => {
  const s = text(v, 2000);
  return /^https:\/\/[^\s<>"']+$/i.test(s) ? s : /^\/\/[^\s<>"']+$/.test(s) ? `https:${s}` : undefined;
};
const size = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);

// ---- Openverse -----------------------------------------------------------------------------------------------------

/** A Flickr picture's address at another of Flickr's sizes ("w": 400 px across), or its own where it is not one of Flickr's. */
const flickrSize = (url: string, size: string) => (/^https:\/\/live\.staticflickr\.com\/\d+\/\d+_[0-9a-f]+(_[a-z0-9])?\.jpg$/i.test(url) ? url.replace(/(_[a-z0-9])?\.jpg$/i, `_${size}.jpg`) : null);

/** A picture of Wikimedia's at a width of its own (its copies are made at standard widths: 330, 960, 1280…). */
export function commonsAt(url: string, width: number): string | null {
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/i.exec(url.split('?')[0]);
  return m ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}${/\.(tiff?|webp)$/i.test(m[3]) ? '.jpg' : ''}` : null;
}

/** One of Openverse's results as a photo; null for one without what a photo needs. */
export function fromOpenverse(r: Record<string, unknown>): Found | null {
  const id = text(r.id, 64);
  const url = https(r.url);
  const page = https(r.foreign_landing_url) ?? https(r.detail_url);
  const code = text(r.license, 20).toLowerCase();
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id) || !url || !page || !LICENSES[code]) return null;
  const version = text(r.license_version, 8);
  const w = size(r.width);
  const h = size(r.height);
  const thumb = https(r.thumbnail) ?? `${OPENVERSE}${id}/thumb/`;
  const commons = commonsAt(url, 330);
  const source = text(r.source ?? r.provider, 40).toLowerCase();
  return {
    id: `ov:${id}`,
    title: text(r.title, 300) || 'Untitled',
    ...(text(r.creator, 120) ? { creator: text(r.creator, 120) } : {}),
    ...(https(r.creator_url) ? { creatorUrl: https(r.creator_url) } : {}),
    license: `${LICENSES[code]}${version && code !== 'pdm' ? ` ${version}` : ''}`,
    ...(https(r.license_url) ? { licenseUrl: https(r.license_url) } : {}),
    attribution: code !== 'cc0' && code !== 'pdm',
    page,
    from: PROVIDERS[source] ?? (text(r.source ?? r.provider, 40) || 'Openverse'),
    ...(w ? { w } : {}),
    ...(h ? { h } : {}),
    thumb: '',
    url,
    // A slide's size: Wikimedia's own copy at 1280 across (its originals may be tens of megabytes), else Openverse's copy at full size.
    ...(commons && w && w > 1280 ? { big: commonsAt(url, 1280)! } : { big: `${thumb.replace(/\?.*$/, '')}?full_size=true` }),
    small: flickrSize(url, 'w') ?? commons ?? thumb,
  };
}

async function openverse(q: string, o: { orientation: PhotoOrientation; page: number; signal?: AbortSignal }): Promise<{ photos: Found[]; more: boolean }> {
  const p = new URLSearchParams({ q, page_size: String(PAGE_SIZE), page: String(o.page), license_type: 'commercial,modification', mature: 'false' });
  if (o.orientation !== 'any') p.set('aspect_ratio', o.orientation);
  const got = (await deps.json(`${OPENVERSE}?${p}`, o.signal)) as { results?: unknown[]; page_count?: number };
  const photos = (Array.isArray(got?.results) ? got.results : []).flatMap((r) => (r && typeof r === 'object' ? [fromOpenverse(r as Record<string, unknown>)] : [])).filter((x): x is Found => !!x);
  return { photos, more: typeof got?.page_count === 'number' ? o.page < got.page_count : photos.length >= PAGE_SIZE };
}

// ---- Wikimedia Commons -------------------------------------------------------------------------------------------

const META = 'LicenseShortName|LicenseUrl|Artist|ObjectName|AttributionRequired|UsageTerms|Credit';
const WM_PICTURES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff']);

/** One of Commons' files as a photo; null for one that is no picture, or whose licence it does not say. */
export function fromCommons(pg: Record<string, unknown>): Found | null {
  const info = (Array.isArray(pg.imageinfo) ? pg.imageinfo[0] : null) as Record<string, unknown> | null;
  const id = typeof pg.pageid === 'number' ? pg.pageid : null;
  if (!info || !id) return null;
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
  const val = (k: string) => text(meta[k]?.value, 2000);
  const url = https(info.url);
  const page = https(info.descriptionurl);
  const license = text(htmlText(val('LicenseShortName')), 60);
  if (!url || !page || !license || !WM_PICTURES.has(text(info.mime, 40))) return null;
  const free = /^(cc0|public domain|pd)/i.test(license);
  const w = size(info.width);
  const h = size(info.height);
  const fileTitle = text(pg.title, 300)
    .replace(/^File:/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ');
  const creator = text(htmlText(val('Artist')), 120);
  const clean = (u: string) => u.split('?')[0];
  return {
    id: `wm:${id}`,
    title: text(htmlText(val('ObjectName')), 300) || fileTitle || 'Untitled',
    ...(creator ? { creator } : {}),
    license,
    ...(https(val('LicenseUrl')) ? { licenseUrl: https(val('LicenseUrl')) } : {}),
    attribution: val('AttributionRequired') === 'false' ? false : !free,
    page,
    from: 'Wikimedia Commons',
    ...(w ? { w } : {}),
    ...(h ? { h } : {}),
    thumb: '',
    url: clean(url),
    ...(w && w > 1280 ? { big: commonsAt(clean(url), 1280) ?? undefined } : /\.(tiff?)$/i.test(clean(url)) ? { big: commonsAt(clean(url), Math.min(1280, w ?? 1280)) ?? undefined } : {}),
    small: commonsAt(clean(url), 330) ?? https(info.thumburl) ?? clean(url),
  };
}

const commonsQuery = (more: Record<string, string>) =>
  `${COMMONS}?${new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiextmetadatafilter: META, iiurlwidth: '330', origin: '*', ...more })}`;

async function commons(q: string, o: { orientation: PhotoOrientation; page: number; signal?: AbortSignal }): Promise<{ photos: Found[]; more: boolean }> {
  // Asked for more than a page, as its shapes are sorted out here.
  const want = o.orientation === 'any' ? PAGE_SIZE : PAGE_SIZE * 2;
  const got = (await deps.json(commonsQuery({ generator: 'search', gsrsearch: `${q} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(want), gsroffset: String((o.page - 1) * want) }), o.signal)) as {
    query?: { pages?: unknown[] };
    continue?: unknown;
  };
  const pages = (Array.isArray(got?.query?.pages) ? got.query.pages : []) as Record<string, unknown>[];
  pages.sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0));
  const photos = pages
    .map((pg) => fromCommons(pg))
    .filter((x): x is Found => !!x)
    .filter((p) => fits(p, o.orientation))
    .slice(0, PAGE_SIZE);
  return { photos, more: !!got?.continue };
}

/** Whether a photo is of the shape asked for (when its size is known). */
const fits = (p: Found, o: PhotoOrientation) => {
  if (o === 'any' || !p.w || !p.h) return true;
  const k = p.w / p.h;
  return o === 'wide' ? k >= 1.15 : o === 'tall' ? k <= 0.87 : k > 0.87 && k < 1.15;
};

// ---- searching, and the pictures --------------------------------------------------------------------------------

/**
 * Photos for words: Openverse's, else (it could not answer, or found none on the first page) Commons'. `from` keeps a
 * search's later pages with the one that answered its first.
 */
export async function searchPhotos(q: string, o: { orientation?: PhotoOrientation; page?: number; from?: PhotoSearch['from']; signal?: AbortSignal } = {}): Promise<PhotoSearch & { found: Found[] }> {
  const words = text(q, 200);
  const ask = { orientation: o.orientation ?? 'any', page: Math.max(1, Math.min(50, Math.round(o.page ?? 1))), signal: o.signal };
  let why = '';
  if (o.from !== 'wikimedia') {
    try {
      const r = await openverse(words, ask);
      if (r.photos.length || ask.page > 1) return { photos: r.photos.map((p) => shown(remember(p))), found: r.photos, from: 'openverse', more: r.more };
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      why = `Openverse could not search (${(e as Error).message})`;
    }
  }
  try {
    const r = await commons(words, ask);
    const note = r.photos.length ? undefined : 'No free photos of that: try other words, or fewer.';
    return { photos: r.photos.map((p) => shown(remember(p))), found: r.photos, from: 'wikimedia', more: r.more, ...(note ? { note } : {}) };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error(`${why ? `${why}, and ` : ''}Wikimedia Commons could not search (${(e as Error).message}). Try again in a minute.`);
  }
}

/** A photo found before, by its id: remembered, else asked of its source again (after a restart, or an agent's id). */
export async function photoById(id: string, signal?: AbortSignal): Promise<Found | null> {
  const known = found.get(id);
  if (known) return known;
  const ov = /^ov:([A-Za-z0-9-]{8,64})$/.exec(id);
  if (ov) {
    const r = (await deps.json(`${OPENVERSE}${ov[1]}/`, signal).catch(() => null)) as Record<string, unknown> | null;
    const p = r ? fromOpenverse(r) : null;
    return p ? remember(p) : null;
  }
  const wm = /^wm:(\d{1,12})$/.exec(id);
  if (wm) {
    const r = (await deps.json(commonsQuery({ pageids: wm[1] }), signal).catch(() => null)) as { query?: { pages?: Record<string, unknown>[] } } | null;
    const p = r?.query?.pages?.[0] ? fromCommons(r.query.pages[0]) : null;
    return p ? remember(p) : null;
  }
  return null;
}

/** The small picture of a photo found: its bytes, or null. */
export const thumbOf = (p: Found, signal?: AbortSignal) => deps.picture(p.small, 2 * 1024 * 1024, signal);

/** A photo's picture at a size to keep (under `max` bytes): the picture itself, else its copy at a slide's size. */
export async function pictureOf(p: Found, max: number, signal?: AbortSignal): Promise<Buffer | null> {
  const first = p.big && p.w && p.w > 1280 ? [p.big, p.url] : [p.url, p.big];
  for (const u of [...first, p.small]) {
    if (!u) continue;
    const b = await deps.picture(u, max, signal);
    if (b) return b;
  }
  return null;
}
