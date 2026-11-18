// A reader copy of a web page, as the Browser's Save keeps it: the article Mozilla's Readability finds in the tab (reader-script.ts),
// its HTML cleaned down to what an article is made of (headings, text, lists, tables, quotes, code, its pictures and videos),
// its pictures downloaded and kept with the page (kept-pictures.ts: they last when the site's go), and all of it a page of the
// Library in the page kit's look, with readable type, set in a column. Light and dark follow the app, as every page does.
//
// The article comes from a web page: nothing in it is trusted. It is cleaned by an allowlist (parse5 reads it, what is written
// out is built here): no script, style, form, event handler, comment or anything not named below survives.
import { parseFragment, type DefaultTreeAdapterTypes as T } from 'parse5';
import { videoSrc } from '../../shared/slides.ts';
import type { DB } from '../db.ts';
import type { PageInfo } from '../../shared/pages.ts';
import type { Deps } from '../features/types.ts';
import { shownUrl } from '../browser/outline.ts';
import { spaceChoice } from '../spaces/choice.ts';
import { fetchPage } from '../web/fetch.ts';
import { getAsset, putAsset } from './assets.ts';
import { describeLater } from './describe.ts';
import { placeFor } from './folders.ts';
import { pictureAddress } from './kept-pictures.ts';
import { createPage } from './store.ts';
import { refreshThumbs } from './thumbs.ts';
import { videoStillOf } from './video-still.ts';
import { siteOf, sourceUrl } from './webpage.ts';

/** What Readability gave, as the tab returns it. */
export interface ReaderRaw {
  title?: string;
  byline?: string;
  siteName?: string;
  excerpt?: string;
  lang?: string;
  publishedTime?: string;
  content?: string;
  length?: number;
}

/** What is kept of pictures: how many, how large each, how much in all, and for how long they are fetched. */
export const PICTURE_LIMITS = { count: 40, each: 8 * 1024 * 1024, total: 60 * 1024 * 1024, seconds: 45 };

// ---- cleaning ---------------------------------------------------------------------------------------

/** Elements kept as they are (no attributes but the few named in ATTRS). */
const KEEP = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption',
  'figure', 'figcaption', 'em', 'strong', 'b', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup', 'small', 'cite', 'q', 'kbd', 'samp', 'var', 'abbr',
]);
/** Block wrappers: kept as a plain <div>, so text in one stays apart from its neighbours. */
const WRAP = new Set(['div', 'section', 'article', 'main']);
const VOID = new Set(['br', 'hr']);
/** Dropped with everything inside them. */
const DROP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'math', 'canvas', 'object', 'embed', 'applet', 'form', 'button', 'input', 'select', 'option', 'textarea', 'nav', 'aside', 'head', 'title', 'link', 'meta', 'dialog', 'frame', 'frameset', 'base', 'map', 'area']);

/** The few attributes each kept element may have, and what they may hold. */
const ATTRS: Record<string, Record<string, (v: string) => string | null>> = {
  td: { colspan: (v) => span(v), rowspan: (v) => span(v) },
  th: { colspan: (v) => span(v), rowspan: (v) => span(v) },
  ol: { start: (v) => (/^-?\d{1,6}$/.test(v.trim()) ? v.trim() : null) },
  abbr: { title: (v) => v.slice(0, 200) },
};
const span = (v: string) => (/^\d{1,3}$/.test(v.trim()) && Number(v) > 1 ? v.trim() : null);

/** Hosts whose video players may be framed (not YouTube and Vimeo: those play over the page, below), and how to write where to watch. */
const EMBED_HOSTS: { host: RegExp; path: RegExp }[] = [
  { host: /^(www\.)?loom\.com$/, path: /^\/embed\// },
  { host: /^(www\.|geo\.)?dailymotion\.com$/, path: /^\/(embed|player)\// },
  { host: /^(fast\.wistia\.net|[\w-]+\.wistia\.(net|com))$/, path: /^\/embed\// },
  { host: /^(www\.)?streamable\.com$/, path: /^\/(e|o)\// },
  { host: /^embed\.ted\.com$/, path: /^\/talks\// },
  { host: /^(www\.)?facebook\.com$/, path: /^\/plugins\/video/ },
  { host: /^(www\.)?bitchute\.com$/, path: /^\/embed\// },
  { host: /^(www\.)?rumble\.com$/, path: /^\/embed\// },
  { host: /^(www\.)?(youtube\.com|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com)$/, path: /^\/(embed|video)\// },
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s: string) => esc(s).replace(/"/g, '&quot;');
/** Control characters have no place in a page, and the placeholders below are made of two of them. */
const plain = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

const isEl = (n: T.ChildNode): n is T.Element => 'tagName' in n;
const isText = (n: T.ChildNode): n is T.TextNode => n.nodeName === '#text';
const attr = (e: T.Element, name: string) => e.attrs.find((a) => a.name === name)?.value ?? '';

/** An absolute http(s) address from what a page wrote, against the page's own address; null for anything else. */
function absolute(raw: string, base: string, mail = false): string | null {
  const s = raw.trim();
  if (!s || s.length > 4000) return null;
  try {
    const u = new URL(s, base);
    if (u.protocol === 'http:' || u.protocol === 'https:' || (mail && u.protocol === 'mailto:')) return u.href;
  } catch {}
  return null;
}

/** A srcset's candidates, each with its width in px (an "x" descriptor counted as 800 px a step; none as 800). */
function candidates(srcset: string): { url: string; w: number }[] {
  const out: { url: string; w: number }[] = [];
  for (const part of srcset.split(/,\s+|,$/)) {
    const [url, d] = part.trim().split(/\s+/);
    if (!url) continue;
    const m = /^(\d+(?:\.\d+)?)([wx])$/i.exec(d ?? '');
    out.push({ url, w: m ? (m[2].toLowerCase() === 'w' ? Number(m[1]) : Number(m[1]) * 800) : 800 });
  }
  return out;
}

/** The candidate to keep: the widest up to 1600 px (a retina phone's 3000 px copy is more than a page needs), else the smallest there is. */
function best(list: { url: string; w: number }[]): string | null {
  if (!list.length) return null;
  const fit = list.filter((c) => c.w <= 1600).sort((a, b) => b.w - a.w)[0];
  return (fit ?? list.sort((a, b) => a.w - b.w)[0]).url;
}

export interface Cleaned {
  html: string;
  /** The pictures it shows, by number (the placeholders in html), at their addresses on the web. */
  pictures: string[];
  /** Its YouTube and Vimeo videos, by number. */
  videos: { play: string; watch: string }[];
}

/** The mark that stands for picture n (or video n) until it is known where it is kept. */
const PIC = (n: number) => `\u0001P${n}\u0002`;
const VID = (n: number) => `\u0001V${n}\u0002`;

/** The article's HTML cleaned to the allowlist, with its pictures and videos found and numbered. `base` is the page's address. */
export function cleanReaderHtml(html: string, base: string): Cleaned {
  const pictures: string[] = [];
  const videos: Cleaned['videos'] = [];
  const picture = (url: string) => {
    let n = pictures.indexOf(url);
    if (n < 0) n = pictures.push(url) - 1;
    return n;
  };
  const tiny = (e: T.Element) => {
    const w = Number(attr(e, 'width'));
    const h = Number(attr(e, 'height'));
    return (w > 0 && w <= 2) || (h > 0 && h <= 2);
  };
  /** An <img>'s (or <picture>'s) picture: its best address, kept as a numbered placeholder. */
  const image = (e: T.Element, fallback = ''): string => {
    if (tiny(e)) return '';
    // Its own srcset's best, else its src, else (in a <picture>) the first <source>'s.
    const url = absolute(best(candidates(attr(e, 'srcset'))) ?? '', base) ?? absolute(attr(e, 'src'), base) ?? absolute(best(candidates(fallback)) ?? '', base);
    if (!url) return '';
    const alt = plain(attr(e, 'alt')).slice(0, 500);
    return `<img src="${PIC(picture(url))}" alt="${escAttr(alt)}" loading="lazy">`;
  };

  const walk = (nodes: T.ChildNode[]): string => {
    let out = '';
    for (const n of nodes) {
      if (isText(n)) out += esc(plain(n.value));
      else if (isEl(n)) out += element(n);
    }
    return out;
  };

  const element = (e: T.Element): string => {
    const tag = e.tagName;
    if (DROP.has(tag)) return '';
    if (tag === 'br' || tag === 'hr') return `<${tag}>`;
    if (tag === 'img') return image(e);
    if (tag === 'picture') {
      const img = e.childNodes.find((c): c is T.Element => isEl(c) && c.tagName === 'img');
      const first = e.childNodes.find((c): c is T.Element => isEl(c) && c.tagName === 'source' && !!attr(c, 'srcset'));
      return img ? image(img, first ? attr(first, 'srcset') : '') : '';
    }
    if (tag === 'a') {
      const href = attr(e, 'href').trim().startsWith('#') ? null : absolute(attr(e, 'href'), base, true);
      const inner = walk(e.childNodes);
      return href && inner.trim() ? `<a href="${escAttr(href)}" rel="noopener noreferrer" target="_blank">${inner}</a>` : inner;
    }
    if (tag === 'video' || tag === 'audio') {
      const own = absolute(attr(e, 'src'), base);
      const list = own ? [] : e.childNodes.filter((c): c is T.Element => isEl(c) && c.tagName === 'source').map((s) => ({ src: absolute(attr(s, 'src'), base) ?? '', type: attr(s, 'type') })).filter((s) => s.src);
      const poster = tag === 'video' ? absolute(attr(e, 'poster'), base) : null;
      // A player with nothing to play (a stream the page builds itself): its still, when it has one.
      if (!own && !list.length) return poster ? `<img src="${PIC(picture(poster))}" alt="">` : '';
      const kids = list.map((s) => `<source src="${escAttr(s.src)}"${/^[\w/+.;= -]{1,80}$/.test(s.type) ? ` type="${escAttr(s.type)}"` : ''}>`).join('');
      const head = `<${tag} controls preload="none"${own ? ` src="${escAttr(own)}"` : ''}${poster ? ` poster="${PIC(picture(poster))}"` : ''}>`;
      return `${head}${kids}</${tag}>`;
    }
    if (tag === 'iframe') return frame(e);
    if (WRAP.has(tag)) {
      const inner = walk(e.childNodes);
      return inner.trim() ? `<div>${inner}</div>` : '';
    }
    if (tag === 'table') return `<div class="n-scroll"><table>${walk(e.childNodes)}</table></div>`;
    if (KEEP.has(tag)) {
      const keep = ATTRS[tag];
      let at = '';
      if (keep) for (const a of e.attrs) {
        const v = keep[a.name]?.(plain(a.value));
        if (v) at += ` ${a.name}="${escAttr(v)}"`;
      }
      const inner = tag === 'pre' ? preText(e) : walk(e.childNodes);
      if (!inner.trim() && !/^(td|th|tr|li|thead|tbody|tfoot)$/.test(tag)) return '';
      return `<${tag}${at}>${inner}</${tag}>`;
    }
    // Anything else (a span, a font, a label, a custom element): its content, without it.
    return walk(e.childNodes);
  };

  /** <pre>: its text with its line breaks as they are, its <code> kept, nothing else. */
  const preText = (e: T.Element): string => {
    const one = (nodes: T.ChildNode[]): string =>
      nodes
        .map((n) => {
          if (isText(n)) return esc(plain(n.value));
          if (isEl(n)) return n.tagName === 'br' ? '\n' : n.tagName === 'code' ? `<code>${one(n.childNodes)}</code>` : DROP.has(n.tagName) ? '' : one(n.childNodes);
          return '';
        })
        .join('');
    return one(e.childNodes);
  };

  /** A video player on a page: YouTube's and Vimeo's as a still the app plays over the page (a page's frame cannot run their players); the other known hosts in a frame, with a link to open it. */
  const frame = (e: T.Element): string => {
    const src = absolute(attr(e, 'src') || attr(e, 'data-src'), base);
    if (!src) return '';
    const title = plain(attr(e, 'title')).slice(0, 200);
    const play = videoSrc(src);
    if (play) {
      const id = play.split('/').pop() ?? '';
      const watch = play.includes('vimeo') ? `https://vimeo.com/${id}` : `https://www.youtube.com/watch?v=${id}`;
      const n = videos.push({ play, watch }) - 1;
      return `<a class="n-video" href="${escAttr(watch)}" target="_blank" rel="noopener noreferrer" data-video="${escAttr(play)}"${title ? ` title="${escAttr(title)}"` : ''}>${VID(n)}</a>`;
    }
    let u: URL;
    try {
      u = new URL(src);
    } catch {
      return '';
    }
    if (!EMBED_HOSTS.some((h) => h.host.test(u.hostname) && h.path.test(u.pathname))) return '';
    return `<figure class="rd-embed"><iframe src="${escAttr(u.href)}" title="${escAttr(title || 'Video')}" loading="lazy" allowfullscreen referrerpolicy="no-referrer"></iframe><figcaption><a href="${escAttr(u.href)}" target="_blank" rel="noopener noreferrer">Open the video on ${esc(u.hostname.replace(/^www\./, ''))}</a></figcaption></figure>`;
  };

  const root = parseFragment(String(html).slice(0, 3_000_000));
  const body = walk(root.childNodes)
    .replace(/<(p|div|li|blockquote|figcaption|h[1-6])>\s*<\/\1>/g, '')
    .replace(/<(p|div)>\s*<\/\1>/g, '');
  return { html: body, pictures, videos };
}

// ---- keeping pictures -------------------------------------------------------------------------------

/**
 * Downloads the pictures (at most PICTURE_LIMITS: how many, how large each, how much in all, how long it takes) into the
 * Library's store; each one's sha, by its address on the web. What could not be had (a site that refuses, a file too large, a
 * time out, not a picture) is not in the map: the page shows it from the web.
 */
export async function keepPictures(db: DB, urls: string[], page: string, o: { fetch?: typeof fetchPage } = {}): Promise<Map<string, string>> {
  const get = o.fetch ?? fetchPage;
  const kept = new Map<string, string>();
  const list = urls.slice(0, PICTURE_LIMITS.count);
  const until = Date.now() + PICTURE_LIMITS.seconds * 1000;
  let total = 0;
  let host = '';
  try {
    host = new URL(page).host;
  } catch {}
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const url = list[next++];
      const left = until - Date.now();
      if (left < 1500 || total >= PICTURE_LIMITS.total) return;
      try {
        // A page on this computer's own network (the user's own site) keeps its own pictures, and no others.
        const r = await get(url, { maxBytes: PICTURE_LIMITS.each + 1, timeoutMs: Math.min(15_000, left), allowPrivate: new URL(url).host === host });
        if (r.status >= 400 || r.truncated) continue;
        const body = r.body ?? (/svg/i.test(r.contentType) ? Buffer.from(r.text, 'utf8') : null);
        if (!body || body.length > PICTURE_LIMITS.each || total + body.length > PICTURE_LIMITS.total) continue;
        kept.set(url, putAsset(db, body));
        total += body.length;
      } catch {}
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return kept;
}

/** Puts the kept pictures' addresses (and the videos' stills) where their placeholders stand; a picture not kept shows from the web. */
export async function placePictures(db: DB, c: Cleaned, page: string, o: { fetch?: typeof fetchPage } = {}): Promise<{ html: string; kept: number; remote: number }> {
  const got = await keepPictures(db, c.pictures, page, o);
  const stills = await Promise.all(
    c.videos.map(async (v) => {
      const src = await videoStillOf(db, v.watch).catch(() => null);
      const sha = src?.startsWith('naget-asset:') ? src.slice('naget-asset:'.length) : '';
      return sha && getAsset(db, sha) ? sha : '';
    }),
  );
  let kept = 0;
  let remote = 0;
  const html = c.html
    .replace(/\u0001P(\d+)\u0002/g, (_m, i: string) => {
      const url = c.pictures[Number(i)];
      const sha = got.get(url);
      if (sha) kept++;
      else remote++;
      return escAttr(sha ? pictureAddress(sha) : url);
    })
    .replace(/\u0001V(\d+)\u0002/g, (_m, i: string) => (stills[Number(i)] ? `<img src="${pictureAddress(stills[Number(i)])}" alt="">` : ''));
  return { html, kept, remote };
}

// ---- the page ---------------------------------------------------------------------------------------

/** The page's own styles: a column of readable width, type to read at length, figures in the middle with quiet captions. The kit gives the colours (light and dark). */
const READER_CSS = `
.n-page .rd{max-width:720px;margin:0 auto;padding:8px 0 56px;font-size:18px;line-height:1.7;overflow-wrap:break-word}
.n-page .rd-head h1{font-size:2em;line-height:1.2;margin:.1em 0 .35em;letter-spacing:-.015em}
.n-page .rd-meta,.n-page .rd-saved{margin:0 0 .35em;color:var(--n-muted);font-size:14px;line-height:1.5}
.n-page .rd-saved{margin-bottom:1.6em;padding-bottom:1.1em;border-bottom:1px solid var(--n-line)}
.n-page .rd-sel{margin:0 0 1.6em;padding:.2em 1em;border-left:3px solid var(--n-accent);background:var(--n-accent-soft);border-radius:0 8px 8px 0}
.n-page .rd-sel .rd-sel-h{margin:.5em 0 0;color:var(--n-muted);font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase}
.n-page .rd-body h1,.n-page .rd-body h2,.n-page .rd-body h3,.n-page .rd-body h4,.n-page .rd-body h5,.n-page .rd-body h6{line-height:1.3;margin:1.8em 0 .5em;letter-spacing:-.01em}
.n-page .rd-body h1{font-size:1.7em}
.n-page .rd-body h2{font-size:1.45em}
.n-page .rd-body h3{font-size:1.2em}
.n-page .rd-body h4,.n-page .rd-body h5,.n-page .rd-body h6{font-size:1em}
.n-page .rd-body p,.n-page .rd-body ul,.n-page .rd-body ol,.n-page .rd-body dl{margin:0 0 1.1em}
.n-page .rd-body li{margin:.3em 0}
.n-page .rd-body img,.n-page .rd-body video{display:inline-block;max-width:100%;height:auto;border-radius:8px}
.n-page .rd-body p>img:only-child,.n-page .rd-body a>img:only-child,.n-page .rd-body div>img:only-child{display:block;margin:1.4em auto}
.n-page .rd-body figure{margin:1.6em 0;text-align:center}
.n-page .rd-body figure img,.n-page .rd-body figure video{display:block;margin:0 auto}
.n-page .rd-body figcaption{margin-top:.55em;color:var(--n-muted);font-size:14px;line-height:1.5}
.n-page .rd-body audio{display:block;width:100%;margin:1em 0}
.n-page .rd-body .rd-embed iframe{display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:10px;background:var(--n-soft)}
.n-page .rd-body .n-video{margin:1.6em 0}
.n-page .rd-body blockquote{margin:1.3em 0;padding:.1em 0 .1em 1.1em;border-left:3px solid var(--n-line);color:var(--n-muted)}
.n-page .rd-body blockquote p{margin:.5em 0}
.n-page .rd-body pre{margin:1.3em 0;padding:14px 16px;overflow:auto;border-radius:10px;background:var(--n-soft);font-size:14px;line-height:1.5}
.n-page .rd-body code{padding:.1em .3em;border-radius:5px;background:var(--n-soft);font-size:.88em}
.n-page .rd-body pre code{padding:0;background:none;font-size:inherit}
.n-page .rd-body table{width:100%;border-collapse:collapse;font-size:15px;line-height:1.5}
.n-page .rd-body th,.n-page .rd-body td{padding:7px 10px;border:1px solid var(--n-line);text-align:left;vertical-align:top}
.n-page .rd-body th{background:var(--n-soft)}
.n-page .rd-body hr{margin:2em 0;border:0;border-top:1px solid var(--n-line)}
.n-page .rd-body a{text-underline-offset:2px}
@media (max-width:520px){.n-page .rd{font-size:17px}.n-page .rd-head h1{font-size:1.7em}}
`;

/** A day as 2026-11-18 from what a page says it was published (a date, or a date and time), else what it says, cut short. */
export function dayOf(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 40) : d.toISOString().slice(0, 10);
}

/** The whole page: title, a line of who, where and when, where it was saved from, what was selected, then the article. */
export function readerPage(p: { title: string; byline?: string; site?: string; published?: string; url: string; at?: number; selected?: string; body: string; lang?: string }): string {
  const day = new Date(p.at ?? Date.now()).toISOString().slice(0, 10);
  const meta = [plain(p.byline ?? '').replace(/\s+/g, ' ').trim(), plain(p.site ?? '').trim(), dayOf(p.published)].filter(Boolean).slice(0, 3).join(' · ');
  const from = sourceUrl(p.url);
  const sel = p.selected?.trim();
  const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(p.lang ?? '') ? p.lang : 'en';
  return [
    '<!doctype html>',
    `<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(plain(p.title))}</title><style>${READER_CSS}</style></head>`,
    '<body class="n-page"><article class="rd">',
    `<header class="rd-head"><h1>${esc(plain(p.title))}</h1>${meta ? `<p class="rd-meta">${esc(meta)}</p>` : ''}</header>`,
    `<p class="rd-saved">Saved from <a href="${escAttr(from)}" target="_blank" rel="noopener noreferrer">${esc(shownUrl(from))}</a> on ${day}</p>`,
    sel ? `<blockquote class="rd-sel"><p class="rd-sel-h">What you selected</p>${sel.split(/\n+/).map((l) => `<p>${esc(plain(l))}</p>`).join('')}</blockquote>` : '',
    `<div class="rd-body">${p.body}</div>`,
    '</article></body></html>',
  ]
    .filter(Boolean)
    .join('\n');
}

/** A title without its site's name at its end ("The Story | Example News" at example news), when what is left is something. */
export function articleTitle(title: string, site: string): string {
  const t = title.replace(/\s+/g, ' ').trim();
  const name = site.replace(/\s+/g, ' ').trim();
  if (!name) return t;
  const cut = t.replace(new RegExp(`\\s+[|\\-–—·:»]\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim();
  return cut || t;
}

/** The least an article has to be, in characters, to be kept as a reader copy: less than that is a page Readability found no article in. */
export const MIN_ARTICLE = 200;

/** Whether Readability found an article worth keeping. */
export const isArticle = (raw: ReaderRaw | null | undefined): raw is ReaderRaw & { content: string } => !!raw?.content && (raw.length ?? 0) >= MIN_ARTICLE;

/**
 * Keeps the page's reader copy as a page of the Library (in a project and folder; none: not in a project), with the address
 * it came from and its site on it, so the Library shows it as a Web page and opens the original. Its pictures are
 * downloaded and kept with it.
 */
export async function saveReaderPage(d: Deps, o: { raw: ReaderRaw & { content: string }; title: string; url: string; selected?: string; space?: unknown; folder?: unknown; fetch?: typeof fetchPage }): Promise<PageInfo> {
  const { raw } = o;
  const title = articleTitle(raw.title || o.title || '', raw.siteName || '') || siteOf(o.url) || 'Web page';
  const cleaned = cleanReaderHtml(raw.content, o.url);
  const placed = await placePictures(d.db, cleaned, o.url, { fetch: o.fetch });
  const html = readerPage({ title, byline: raw.byline, site: raw.siteName || siteOf(o.url), published: raw.publishedTime, url: o.url, selected: o.selected, body: placed.html, lang: raw.lang });
  const page = createPage(d.db, {
    title,
    html,
    by: 'made',
    source: { url: sourceUrl(o.url), site: siteOf(o.url) },
    ...placeFor(d.db, o.folder, spaceChoice(d.db, o.space ?? null)),
  });
  d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
  refreshThumbs(d, [page.id]);
  if (!page.description) describeLater(d, page.id);
  return page;
}
