// find_media: a picture, and a video when asked, for each of a list of things (games, films, books, places, dishes,
// products, teams, people), for an app's answer, a page or a document to show. A picture is the lead picture of the
// thing's own Wikipedia article when it has one (a game's cover, a place's photo, a team's crest), else the one the
// pages about it show when shared (og:image: its own page's first, when one is given, then those a web search finds);
// a video is the first YouTube video a search finds whose title names the thing. Only what clearly names the thing
// counts: a picture of something else is worse than none, so a thing may come back without one.
import { siteOf } from '../../shared/search.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import type { FetchedPage } from '../web/fetch.ts';
import type { SearchResult } from './types.ts';

export interface MediaDeps {
  /** A web search, by the providers of Settings → Search in their order; [] when none could answer. */
  search(text: string, o: { k: number; sites?: string[]; signal?: AbortSignal }): Promise<SearchResult[]>;
  fetchPage(url: string, o: { timeoutMs?: number; maxBytes?: number; signal?: AbortSignal }): Promise<FetchedPage>;
  /** For Wikipedia's API (recorded answers in the tests). */
  fetch: typeof fetch;
}

export interface MediaAsk {
  /** What each thing is called. */
  name: string;
  /** Its own page, when known: its picture is tried first. */
  page?: string;
}

export interface MediaOptions {
  /** What they are, in a few words ("video game", "dish", "hotel in Lisbon"). */
  kind?: string;
  pictures?: boolean;
  /** A video too: true, or the kind of video ("trailer", "recipe", "highlights"). */
  videos?: boolean | string;
  signal?: AbortSignal;
}

export interface MediaFound {
  item: string;
  picture: string | null;
  /** The page the picture is from. */
  picture_page?: string;
  video?: string | null;
  video_title?: string;
}

const UA = 'Hydor (+https://github.com/algoprog/hydor)';
/** Most things one call looks for, and how many at once. */
export const MEDIA_MAX = 30;
const AT_ONCE = 3;

// ---- names -------------------------------------------------------------------------------------------------

/** Words that never tell one thing from another. */
const SMALL = new Set('the a an of and or in on at to for with by from vs de la le el los las les der die das du des et y il lo'.split(' '));

/** A name's words that tell it apart, without accents, case, punctuation or a part in brackets: "Hades (video game)" → hades. */
export function nameWords(s: string): string[] {
  return (
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, ' ')
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((w) => !SMALL.has(w)) ?? []
  );
}

/** How much of a name a title has (0 to 1). */
export function coverage(name: string[], title: string): number {
  if (!name.length) return 0;
  const t = new Set(nameWords(title));
  return name.filter((w) => t.has(w)).length / name.length;
}

/** A number, a year or a numeral in Roman: the mark of another part of a series ("Hades II" is not "Hades"). */
const SEQUEL = /^(\d+|[ivx]+)$/;

/**
 * How surely a Wikipedia article is the thing's own: 3 its title is the name; 2 its title is the name and a word or
 * two more (not another part of a series) and its description says it is that kind of thing ("Arsenal F.C." for
 * Arsenal, a football club); 0 another thing. A title that tells namesakes apart in brackets ("Hades (video game)") is
 * the thing's own only when the brackets, or the description, say it is that kind of thing: "Iceland (supermarket)"
 * is not the country; without a kind it counts below the plain title.
 */
export function articleMatch(name: string[], title: string, description: string, kind: string[]): number {
  if (!name.length || /^list of\b/i.test(title)) return 0;
  const t = nameWords(title);
  const n = new Set(name);
  if (!name.every((w) => t.includes(w))) return 0;
  const d = new Set(nameWords(`${description} ${/\(([^)]*)\)/.exec(title)?.[1] ?? ''}`));
  const ofKind = kind.some((w) => d.has(w));
  const extra = t.filter((w) => !n.has(w));
  if (!extra.length) return !/\(/.test(title) ? 3 : !kind.length ? 2 : ofKind ? 3 : 0;
  if (extra.length > 2 || extra.some((w) => SEQUEL.test(w))) return 0;
  return ofKind ? 2 : 0;
}

/** A drawing that stands for a place instead of showing it: a flag, a map of where it is, a coat of arms or a seal. */
const DRAWN = /(^|[_\-\s(.,])(flags?|maps?|locator|location|orthographic|relief|coat[_\s-]of[_\s-]arms|emblem|seal|dimos|blank)([_\-\s.,)]|$)/i;
/** Things whose picture is a drawing: a team's crest, a company's or a party's logo… */
const DRAWN_KINDS = /\b(teams?|clubs?|compan(y|ies)|brands?|organi[sz]ations?|part(y|ies)|logos?|flags?|crests?|apps?|software|websites?|bands?|universit(y|ies)|schools?|leagues?|currenc(y|ies))\b/i;

/** Whether a Wikipedia article's lead picture shows the thing (not its flag or a map of where it is, for a place). */
export function showsIt(src: string, kind: string): boolean {
  let file = '';
  try {
    file = decodeURIComponent(new URL(src).pathname);
  } catch {
    return false;
  }
  if (DRAWN_KINDS.test(kind)) return true;
  // A drawing comes as a picture made from its SVG ("…/Flag_of_Iceland.svg/640px-Flag_of_Iceland.svg.png").
  return !/\.svg\b/i.test(file) && !DRAWN.test(file.split('/').pop() ?? '');
}

// ---- pictures ------------------------------------------------------------------------------------------------

/** Sites whose shared picture is their own badge, or that turn readers away. */
const NO_PICTURE = /(^|\.)(facebook|instagram|x|twitter|tiktok|reddit|linkedin|pinterest|quora|amazon|ebay|threads)\.(com|net|co\.\w+)$/;
/** A shared picture that is a site's own badge or a stand-in, not a picture of the thing. */
const BADGE = /(^|[/_.-])(logo|logos|favicon|default|placeholder|blank|spacer|sprite|avatar|og-default|share-default|fallback)([/_.-]|$)/i;

interface Picture {
  url: string;
  page: string;
}

/** The lead picture of the thing's own Wikipedia article, or null (no article that is surely it, or one without a picture). */
async function wikipediaPicture(name: string, kind: string, d: MediaDeps, signal?: AbortSignal): Promise<Picture | null> {
  const words = nameWords(name);
  if (!words.length) return null;
  const q = `${name} ${kind}`.trim();
  const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrlimit=5&gsrsearch=${encodeURIComponent(q)}&prop=pageimages|description|info&inprop=url&piprop=thumbnail&pithumbsize=640&pilicense=any`;
  let pages: { title?: string; index?: number; description?: string; fullurl?: string; thumbnail?: { source?: string } }[] = [];
  try {
    const r = await d.fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]) });
    if (!r.ok) return null;
    pages = ((await r.json()) as { query?: { pages?: typeof pages } }).query?.pages ?? [];
  } catch {
    return null;
  }
  const kindWords = nameWords(kind).filter((w) => w.length > 2);
  let best: { score: number; index: number; p: (typeof pages)[number] } | null = null;
  for (const p of pages) {
    const score = articleMatch(words, p.title ?? '', p.description ?? '', kindWords);
    const index = p.index ?? 99;
    if (score && (!best || score > best.score || (score === best.score && index < best.index))) best = { score, index, p };
  }
  // The thing's own article without a picture, or with a drawing for one: none from another article stands in for it.
  const src = best?.p.thumbnail?.source;
  if (!best || !src || !showsIt(src, kind)) return null;
  return { url: src.replace(/\?utm_[^#]*$/, ''), page: best.p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent((best.p.title ?? '').replace(/ /g, '_'))}` };
}

/** A picture named for the site it is on ("worldometers-fb.jpg" on worldometers.info): the same for all its pages. */
export function ownBadge(path: string, page: string): boolean {
  const site = siteOf(page).split('.').slice(0, -1);
  const name = [...site].sort((a, b) => b.length - a.length)[0] ?? '';
  const file = (path.split('/').pop() ?? '').toLowerCase();
  // A name that says only what it is for ("ogp.png", "share-image.jpg"): the site's one picture for every page.
  if (/^(og|ogp|og[-_]?image|opengraph|share|share[-_]?image|social|social[-_]?share|fb|facebook|twitter|twitter[-_]?card|default|thumbnail|thumb)\.[a-z0-9]+$/.test(file)) return true;
  return name.length >= 5 && file.split(/[^a-z0-9]+/).includes(name.toLowerCase());
}

/** The picture a page shows when shared, when it is one of the thing and not the site's badge. */
async function pagePicture(url: string, d: MediaDeps, signal?: AbortSignal): Promise<Picture | null> {
  try {
    if (NO_PICTURE.test(siteOf(url))) return null;
    const p = await d.fetchPage(url, { timeoutMs: 8000, maxBytes: 1_500_000, signal });
    if (p.status >= 400 || !p.image) return null;
    let path = '';
    try {
      path = decodeURIComponent(new URL(p.image).pathname);
    } catch {
      return null;
    }
    return BADGE.test(path) || /\.(svg|ico)$/i.test(path) || ownBadge(path, p.url) ? null : { url: p.image, page: p.url };
  } catch {
    return null;
  }
}

/** A picture from the web: the thing's own page's, else those of the first pages a search finds whose titles name it. */
async function webPicture(ask: MediaAsk, kind: string, d: MediaDeps, signal?: AbortSignal): Promise<Picture | null> {
  if (ask.page && /^https?:\/\//i.test(ask.page)) {
    const own = await pagePicture(ask.page, d, signal);
    if (own) return own;
  }
  const words = nameWords(ask.name);
  const hits = await d.search(`${ask.name} ${kind}`.trim(), { k: 8, signal }).catch(() => [] as SearchResult[]);
  const naming = hits.filter((h) => !NO_PICTURE.test(siteOf(h.url)) && !/(^|\.)wikipedia\.org$/.test(siteOf(h.url)) && coverage(words, h.title) >= 0.75);
  for (const h of naming.slice(0, 3)) {
    const p = await pagePicture(h.url, d, signal);
    if (p) return p;
  }
  return null;
}

// ---- videos --------------------------------------------------------------------------------------------------

/** A YouTube video's id, from any of its addresses (not a channel's or a playlist's). */
export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const id = host === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : host === 'youtube.com' ? (u.pathname === '/watch' ? u.searchParams.get('v') : /^\/(?:shorts|embed|live)\/([\w-]+)/.exec(u.pathname)?.[1]) : null;
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

/** The first YouTube video a search finds whose title names the thing. */
async function findVideo(name: string, what: string, d: MediaDeps, signal?: AbortSignal): Promise<{ url: string; title: string } | null> {
  const words = nameWords(name);
  if (!words.length) return null;
  const hits = await d.search(`${name} ${what}`.trim(), { k: 8, sites: ['youtube.com'], signal }).catch(() => [] as SearchResult[]);
  for (const h of hits) {
    const id = youtubeId(h.url);
    if (id && coverage(words, h.title) >= 0.75) return { url: `https://www.youtube.com/watch?v=${id}`, title: h.title.replace(/\s+-\s+YouTube$/i, '').trim() };
  }
  return null;
}

// ---- together ------------------------------------------------------------------------------------------------

/** What was found lately, by name, kind and kind of video: an app run again, or the same game in another list. */
const cache = new Map<string, { at: number; found: MediaFound }>();
const KEEP_MS = 6 * 3600_000;

export async function findMedia(asks: MediaAsk[], o: MediaOptions, d: MediaDeps): Promise<MediaFound[]> {
  const kind = (o.kind ?? '').trim().slice(0, 80);
  const pictures = o.pictures !== false;
  const what = typeof o.videos === 'string' && o.videos.trim() ? o.videos.trim().slice(0, 60) : o.videos ? kind : '';
  const videos = !!o.videos;
  const signal = AbortSignal.any([AbortSignal.timeout(90_000), ...(o.signal ? [o.signal] : [])]);
  const out: MediaFound[] = asks.map((a) => ({ item: a.name, picture: null }));
  const one = async (a: MediaAsk, i: number) => {
    const key = JSON.stringify([a.name.toLowerCase(), a.page ?? '', kind.toLowerCase(), pictures, videos && what.toLowerCase()]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < KEEP_MS) return void (out[i] = { ...hit.found, item: a.name });
    const [pic, vid] = await Promise.all([pictures ? ((await wikipediaPicture(a.name, kind, d, signal)) ?? (await webPicture(a, kind, d, signal))) : null, videos ? findVideo(a.name, what, d, signal) : null]);
    const found: MediaFound = { item: a.name, picture: pic?.url ?? null, ...(pic ? { picture_page: pic.page } : {}), ...(videos ? { video: vid?.url ?? null, ...(vid ? { video_title: vid.title } : {}) } : {}) };
    out[i] = found;
    if (!signal.aborted) cache.set(key, { at: Date.now(), found });
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
  };
  for (let i = 0; i < asks.length; i += AT_ONCE) {
    if (signal.aborted) break;
    await Promise.all(asks.slice(i, i + AT_ONCE).map((a, k) => one(a, i + k).catch(() => {})));
  }
  // One picture for two different things is a site's own, not a picture of either.
  const seen = new Map<string, number>();
  for (const f of out) if (f.picture) seen.set(f.picture, (seen.get(f.picture) ?? 0) + 1);
  for (const f of out)
    if (f.picture && (seen.get(f.picture) ?? 0) > 1 && !/(^|\.)wikimedia\.org$/.test(siteOf(f.picture))) {
      f.picture = null;
      delete f.picture_page;
    }
  return out;
}

// ---- the tool --------------------------------------------------------------------------------------------------

const NAME_KEYS = ['title', 'name', 'label', 'item', 'place', 'dish', 'product', 'game', 'film', 'book', 'team'];
const PAGE_KEYS = ['link', 'url', 'page', 'website', 'web'];

/** The things asked for: names, or rows of a table with the columns that name them and hold their pages. */
export function asksOf(a: Record<string, unknown>): MediaAsk[] | string {
  let items: unknown = a.items;
  if (typeof items === 'string') {
    const text = items;
    try {
      items = JSON.parse(text);
    } catch {
      items = text.split('\n');
    }
  }
  if (!Array.isArray(items)) return 'items: give a list of things, by name or as rows of a table.';
  const nameKey = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : '';
  const pageKey = typeof a.page === 'string' && a.page.trim() ? a.page.trim() : '';
  const asks: MediaAsk[] = [];
  for (const it of items.slice(0, MEDIA_MAX)) {
    if (typeof it === 'string' || typeof it === 'number') {
      const name = String(it).trim();
      asks.push({ name: name.slice(0, 200) });
      continue;
    }
    if (!it || typeof it !== 'object') {
      asks.push({ name: '' });
      continue;
    }
    const row = it as Record<string, unknown>;
    const key = nameKey || NAME_KEYS.find((k) => typeof row[k] === 'string' && (row[k] as string).trim());
    const pk = pageKey || PAGE_KEYS.find((k) => typeof row[k] === 'string' && /^https?:\/\//i.test(row[k] as string));
    const page = pk && typeof row[pk] === 'string' && /^https?:\/\//i.test(row[pk] as string) ? (row[pk] as string) : undefined;
    asks.push({
      name: String(key ? (row[key] ?? '') : '')
        .trim()
        .slice(0, 200),
      ...(page ? { page } : {}),
    });
  }
  return asks;
}

export function findMediaTool(deps: () => MediaDeps): RunTool {
  return {
    name: 'find_media',
    annotations: { readOnlyHint: true, openWorldHint: true },
    description:
      'Find a picture, and a video when you ask, for each of a list of things (games, films, books, places, dishes, products, teams, people), to show them in an app’s answer, a page or a document. A picture is the lead picture of the thing’s own Wikipedia article (a game’s cover, a place’s photo, a team’s crest), else the one the pages about it show when shared; a video is a YouTube video whose title names it (a trailer, a recipe, highlights), which views and pages show playing in place. Only what clearly names the thing counts, so some may come back without one. Returns JSON: items, in the order given, each { item, picture, picture_page, video, video_title } (picture and video null when none was found).',
    inputSchema: {
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: ['string', 'object'] }, maxItems: MEDIA_MAX, description: `The things, by name ("Hades II", "Belém Tower"), or the rows of a table (name says which column names each). At most ${MEDIA_MAX}.` },
        kind: { type: 'string', description: 'What they are, in a few words: "video game", "film", "dish", "hotel in Lisbon". It finds the right one among things with the same name.' },
        videos: { type: ['boolean', 'string'], description: 'A video for each too: true, or the kind of video ("trailer", "recipe", "highlights", "walking tour"). Off unless asked.' },
        pictures: { type: 'boolean', description: 'A picture for each (true unless set to false: for videos only).' },
        name: { type: 'string', description: 'For rows: the column that names each (title, name, label or item unless set).' },
        page: { type: 'string', description: 'For rows: the column with each one’s own page, whose picture is tried first (link, url or page unless set).' },
      },
      required: ['items'],
    },
    async run(a, ctx: RunCtx) {
      const asks = asksOf(a);
      if (typeof asks === 'string') return { text: asks, isError: true };
      if (!asks.some((x) => x.name)) return { text: 'items: none of them has a name to look for.', isError: true };
      const videos = typeof a.videos === 'string' ? (/^(true|yes)$/i.test(a.videos.trim()) ? true : /^(false|no|)$/i.test(a.videos.trim()) ? false : a.videos) : a.videos === true;
      const found = await findMedia(
        asks.filter((x) => x.name),
        { kind: typeof a.kind === 'string' ? a.kind : undefined, pictures: a.pictures !== false && a.pictures !== 'false', videos, signal: ctx.signal },
        deps(),
      );
      // In the order given, a nameless one included (with nothing found), so rows and answers line up.
      let at = 0;
      const items = asks.map((x) => (x.name ? found[at++] : { item: '', picture: null }));
      return JSON.stringify({ items, pictures: items.filter((f) => f.picture).length, ...(videos ? { videos: items.filter((f) => f.video).length } : {}) });
    },
  };
}
