// Slide decks in Pages: a page of the kind "slides" keeps its deck (shared/slides.ts) as text, a line per part,
// its pictures apart (assets.ts). Wherever a page's HTML is needed (the frame in the conversation, its own address,
// a published copy, a file, its picture in Pages, a PDF), the deck's own page is made from it: the deck with its
// pictures inside, and the runtime that draws and plays it (shared/slides-runtime.ts), as a slideshow to click
// through, or every slide on a page of its own to print.
//
// save_slides is how agents make and change decks; get_page gives a deck back as it is kept. An agent names an icon
// and gets its lines from the app's copy of Lucide (where this install has one); a video it adds gets its site's still
// (video-still.ts). A deck's equations are drawn here by the server's own KaTeX (math.ts) and go into its page with
// only the fonts they use, so they draw with no network.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ASSET, deckFonts, deckOutline, deckSources, deckText, everyEl, FONT_TABLE, googleFamilies, iconNodes, isDeckText, mapSources, mapVideoSources, normalizeDeck, plainText, VIDEO, videoSrc, type Deck, type El, type IconNode, type SlideComment, type VideoEl } from '../../shared/slides.ts';
import { slidesRuntime } from '../../shared/slides-runtime.ts';
import { newCommentId } from '../../shared/comments.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { assetDataUrl, putAsset, takeIn } from './assets.ts';
import { scriptSafe } from './kit.ts';
import { katexStyle, texToHtml } from './math.ts';
import { videoStillOf } from './video-still.ts';
import { keepVideoFile, MAX_VIDEO, VIDEO_INSIDE, videoAddress, videoDataUrl } from './videos.ts';

export { isDeckText };

/** The longest a deck's text may be (its pictures are kept apart). */
export const MAX_DECK = 3 * 1024 * 1024;

export const RUNTIME_SRC = scriptSafe(slidesRuntime.toString());
export const FONTS_JSON = JSON.stringify(FONT_TABLE);

/** A deck's text, read back; a broken one is an error a person can act on. */
export function readDeck(text: string): Deck {
  try {
    return normalizeDeck(JSON.parse(text));
  } catch (e) {
    throw new HttpError(500, `This deck could not be read: ${(e as Error).message}`);
  }
}

/** The deck as it is kept, checked; data: pictures are kept apart, other sources stay as they are. */
export function keepDeck(db: DB, input: unknown): { deck: Deck; text: string } {
  let deck: Deck;
  try {
    deck = normalizeDeck(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  deck = mapSources(deck, (s) => {
    if (!s.startsWith('data:')) return s;
    const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(s);
    return m ? ASSET + putAsset(db, Buffer.from(m[1], 'base64')) : '';
  });
  const text = deckText(deck);
  if (Buffer.byteLength(text) > MAX_DECK) throw new HttpError(413, `The deck is over ${MAX_DECK / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { deck, text };
}

// ---- icons by name ---------------------------------------------------------------------------------------------

/** Where Lucide's icons are in this install (its web app's library; an install without it has no icons by name). */
let iconDir: string | null | undefined;
/** Each name Lucide also answers to ("home" for "house"), as the file it is in. */
let iconAliases: Map<string, string> | null = null;
const iconCache = new Map<string, IconNode[] | null>();

function lucide(): string | null {
  if (iconDir !== undefined) return iconDir;
  iconDir = null;
  try {
    const pkg = createRequire(import.meta.url).resolve('lucide-react/package.json');
    const dir = path.join(path.dirname(pkg), 'dist', 'esm');
    if (fs.existsSync(path.join(dir, 'icons'))) {
      iconDir = path.join(dir, 'icons');
      iconAliases = new Map();
      const barrel = fs.readFileSync(path.join(dir, 'lucide-react.mjs'), 'utf8');
      for (const m of barrel.matchAll(/export \{([^}]*)\} from '\.\/icons\/([a-z0-9-]+)\.mjs'/g))
        for (const a of m[1].matchAll(/default as (\w+)/g)) {
          const k = a[1]
            .replace(/^Lucide/, '')
            .replace(/Icon$/, '')
            .toLowerCase();
          if (k && !iconAliases.has(k)) iconAliases.set(k, m[2]);
        }
    }
  } catch {}
  return iconDir;
}

/** An icon of Lucide's by its name ("rocket", "arrow-right", "Home"): its lines, or null. */
export function lucideIcon(name: string): IconNode[] | null {
  const kebab = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(kebab)) return null;
  if (iconCache.has(kebab)) return iconCache.get(kebab)!;
  const dir = lucide();
  let nodes: IconNode[] | null = null;
  if (dir) {
    const file = fs.existsSync(path.join(dir, `${kebab}.mjs`)) ? kebab : iconAliases?.get(kebab.replace(/-/g, ''));
    if (file)
      try {
        let src = fs.readFileSync(path.join(dir, `${file}.mjs`), 'utf8');
        // An old name's file only points at the icon's own.
        const to = /export \{ default \} from '\.\/([a-z0-9-]+)\.mjs'/.exec(src)?.[1];
        if (to) src = fs.readFileSync(path.join(dir, `${to}.mjs`), 'utf8');
        const body = src.slice(Math.max(0, src.indexOf('node:')));
        const raw: [string, Record<string, string | number>][] = [];
        for (const m of body.matchAll(/\[\s*"(path|circle|ellipse|rect|line|polyline|polygon)"\s*,\s*\{([^}]*)\}\s*\]/g)) {
          const attrs: Record<string, string | number> = {};
          for (const a of m[2].matchAll(/(\w+)\s*:\s*("(?:[^"\\]|\\.)*"|-?[\d.]+)/g)) if (a[1] !== 'key') attrs[a[1]] = a[2].startsWith('"') ? (JSON.parse(a[2]) as string) : Number(a[2]);
          raw.push([m[1], attrs]);
        }
        const clean = iconNodes(raw);
        if (clean.length) nodes = clean;
      } catch {}
  }
  iconCache.set(kebab, nodes);
  return nodes;
}

/** Whether this install has Lucide's icons for agents to name. */
export const hasIcons = () => !!lucide();

/** The ids of the parts a deck's kept text has, in groups too (to tell the parts an agent adds from those it sends back). */
function partIds(text: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  try {
    for (const s of readDeck(text).slides) for (const e of everyEl(s.els)) out.add(e.id);
  } catch {}
  return out;
}

/**
 * A shape an agent adds with words has them in its middle, as PowerPoint's shapes and the editor's own do, unless it says
 * where (align, valign). Only new ones: a part it sends back as it was (by its id) keeps its look.
 */
function centreNewShapes(input: unknown, known: Set<string>): unknown {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const part = (e: unknown): unknown => {
    if (!obj(e)) return e;
    if (e.type === 'group') return { ...e, ...(Array.isArray(e.els) ? { els: e.els.map(part) } : {}), ...(Array.isArray(e.parts) ? { parts: e.parts.map(part) } : {}) };
    const worded = e.text !== undefined || e.paras !== undefined || e.bullets !== undefined;
    if (e.type !== 'shape' || !worded || (typeof e.id === 'string' && known.has(e.id))) return e;
    return { ...e, align: e.align ?? 'center', valign: e.valign ?? 'middle' };
  };
  if (!obj(input) || !Array.isArray(input.slides)) return input;
  return {
    ...input,
    slides: input.slides.map((s) => (obj(s) ? { ...s, ...(Array.isArray(s.els) ? { els: s.els.map(part) } : {}), ...(Array.isArray(s.extra) ? { extra: s.extra.map(part) } : {}) } : s)),
  };
}

/** The deck with its videos' files kept: each one's kept source (and its first frame, unless it had a still), the rest left out. */
function withVideoFiles(d: Deck, files: Map<string, { src: string; poster?: string } | null>): Deck {
  const map = (els: El[]): El[] =>
    els.flatMap((e): El[] => {
      if (e.type === 'group') return [{ ...e, els: map(e.els) }];
      if (e.type !== 'video' || !files.has(e.src)) return [e];
      const f = files.get(e.src);
      return f ? [{ ...e, src: f.src, ...(!e.poster && f.poster ? { poster: f.poster } : {}) }] : [];
    });
  return { ...d, slides: d.slides.map((s) => ({ ...s, els: map(s.els) })) };
}

/**
 * The comments of a deck an agent sends: those of the version it changes, on the same slides (by their ids) and parts
 * as they were (a part gone, the comment is on its slide), then answered, resolved, reopened, deleted or added to as
 * `ops` (save_slides' comments) says. A slide's own list of comments is not taken from the agent: comments change only
 * so. What could not be done is said in `notes`.
 */
function carryComments(d: Deck, before: Deck | null, ops: unknown, notes: string[]): Deck {
  const had = new Map<string, SlideComment[]>();
  for (const s of before?.slides ?? []) if (s.comments?.length) had.set(s.id, s.comments.map((c) => ({ ...c, ...(c.replies ? { replies: [...c.replies] } : {}) })));
  const partsOf = (i: number) => new Set(everyEl(d.slides[i].els).map((e) => e.id));
  const lists = d.slides.map((s, i) => {
    const parts = partsOf(i);
    const list = (had.get(s.id) ?? []).map((c) => {
      if (!c.el || parts.has(c.el)) return c;
      const { el: _gone, ...rest } = c;
      return rest;
    });
    had.delete(s.id);
    return list;
  });
  const lost = [...had.values()].reduce((a, l) => a + l.length, 0);
  if (lost) notes.push(`${lost} comment${lost === 1 ? '' : 's'} went with slides no longer in the deck (a slide keeps its comments while it keeps its id).`);
  if (ops !== undefined && ops !== null) {
    if (!Array.isArray(ops)) notes.push('comments must be a list of changes, such as [{"id": "c1", "reply": "…"}]: they were left as they were.');
    else {
      const now = Date.now();
      const find = (id: string) => {
        for (const [i, l] of lists.entries()) {
          const k = l.findIndex((c) => c.id === id);
          if (k >= 0) return { i, k };
        }
        return null;
      };
      for (const raw of ops.slice(0, 500)) {
        const op = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
        const id = typeof op.id === 'string' ? op.id.trim() : '';
        const text = (k: string) => (typeof op[k] === 'string' ? (op[k] as string).trim().slice(0, 4000) : '');
        const at = id ? find(id) : null;
        if (at) {
          const c = lists[at.i][at.k];
          if (op.delete === true) {
            lists[at.i].splice(at.k, 1);
            continue;
          }
          if (text('reply')) c.replies = [...(c.replies ?? []), { id: `${c.id}r${(c.replies?.length ?? 0) + 1}${now.toString(36).slice(-3)}`, by: 'agent', text: text('reply'), at: now }];
          if (op.resolve === true || op.resolved === true) c.resolved = true;
          if (op.reopen === true || op.resolved === false) delete c.resolved;
          if (!text('reply') && op.resolve === undefined && op.resolved === undefined && op.reopen === undefined && text('text')) notes.push(`Comment ${id} is there already: answer it with "reply", not "text".`);
          continue;
        }
        if (op.delete === true || text('reply') || op.resolve !== undefined || op.reopen !== undefined) {
          notes.push(`There is no comment ${id || '(no id)'} to change: get_page lists them.`);
          continue;
        }
        const words = text('text');
        if (!words) continue;
        // A new one of the agent's: on a slide (by its number or its id), on one of its parts or the whole slide.
        const i = typeof op.slide === 'number' ? Math.round(op.slide) - 1 : typeof op.slide === 'string' ? d.slides.findIndex((s) => s.id === op.slide) : -1;
        if (i < 0 || i >= d.slides.length) {
          notes.push(`The comment “${words.slice(0, 60)}” needs its slide ("slide": its number or its id): it was left out.`);
          continue;
        }
        const c: SlideComment = { id: /^[A-Za-z0-9_-]{1,40}$/.test(id) ? id : newCommentId(), by: 'agent', text: words, at: now };
        if (typeof op.el === 'string' && partsOf(i).has(op.el)) c.el = op.el;
        else if (typeof op.el === 'string') notes.push(`Slide ${i + 1} has no part ${op.el}: comment “${words.slice(0, 40)}” is on the slide itself.`);
        lists[i].push(c);
      }
    }
  }
  return {
    ...d,
    slides: d.slides.map((s, i) => {
      const { comments: _c, ...rest } = s;
      return lists[i].length ? { ...rest, comments: lists[i] } : rest;
    }),
  };
}

/** The deck with these videos' stills (by the video's id), in groups too. */
function withPosters(d: Deck, posters: Map<string, string>): Deck {
  const map = (els: El[]): El[] => els.map((e) => (e.type === 'group' ? { ...e, els: map(e.els) } : e.type === 'video' && posters.has(e.id) ? { ...e, poster: posters.get(e.id) } : e));
  return { ...d, slides: d.slides.map((s) => ({ ...s, els: map(s.els) })) };
}

/**
 * A deck from an agent: checked as keepDeck does, its pictures taken in first (files of its session, data:
 * addresses, pictures on the web), its icons named looked up. `prev`, the kept text of the version it changes, tells
 * the parts it adds from those it sends back. What could not be taken in is said in `notes`, for the agent.
 */
export async function agentDeck(db: DB, input: unknown, cwd: string, prev?: string): Promise<{ deck: Deck; text: string; notes: string[] }> {
  let deck: Deck;
  const missing = new Set<string>();
  const known = partIds(prev);
  try {
    // Any source may be a file of the session's: kept as written until it is taken in below.
    deck = normalizeDeck(centreNewShapes(input, known), {
      src: (s) => (s.length <= 4096 ? s : null),
      video: (s) => (s.length <= 4096 ? s : null),
      icon: (name) => {
        const got = lucideIcon(name);
        if (!got) missing.add(name);
        return got;
      },
    });
  } catch (e) {
    throw new Error(`${(e as Error).message} See save_slides' description for the deck's shape.`);
  }
  const notes: string[] = [];
  if (missing.size)
    notes.push(
      hasIcons()
        ? `No icon is named ${[...missing].map((x) => `"${x}"`).join(', ')} (Lucide's names: "rocket", "chart-line", "users", "lightbulb"…); ${missing.size === 1 ? 'it was' : 'they were'} left out.`
        : `This install has no icons to name; ${[...missing].map((x) => `"${x}"`).join(', ')} ${missing.size === 1 ? 'was' : 'were'} left out (an emoji in a text part does instead).`,
    );
  const done = new Map<string, string>();
  for (const s of new Set(deckSources(deck))) done.set(s, await takeIn(db, s, { cwd, notes }));
  deck = mapSources(deck, (s) => done.get(s) ?? s);
  // Its videos that are files of its session, kept (with their first frame as their still, where this computer can take one).
  const files = new Map<string, { src: string; poster?: string } | null>();
  for (const s of deck.slides)
    for (const e of everyEl(s.els)) {
      if (e.type !== 'video' || videoSrc(e.src) || e.src.startsWith(VIDEO) || files.has(e.src)) continue;
      const got = await keepVideoFile(db, e.src, cwd).catch((err: Error) => {
        notes.push(`The video "${e.src.length > 120 ? `${e.src.slice(0, 120)}…` : e.src}" was left out: ${err.message} (a video is an MP4, MOV or WebM file of up to ${MAX_VIDEO / 1024 / 1024} MB, or a YouTube or Vimeo address).`);
        return null;
      });
      let poster: string | undefined;
      if (got?.frame)
        try {
          poster = ASSET + putAsset(db, got.frame);
        } catch {}
      files.set(e.src, got ? { src: got.src, poster } : null);
    }
  if (files.size) deck = normalizeDeck(withVideoFiles(deck, files));
  // The videos it adds without a still get their site's, kept, as the editor's do (a few at a time, each bounded in time).
  const stills = new Map<string, string>();
  const want = deck.slides.flatMap((s) => everyEl(s.els)).filter((e) => e.type === 'video' && !e.poster && !e.src.startsWith(VIDEO) && !known.has(e.id)) as VideoEl[];
  for (let i = 0; i < Math.min(want.length, 24); i += 6)
    await Promise.all(want.slice(i, Math.min(i + 6, 24)).map(async (v) => {
      const got = await videoStillOf(db, v.src).catch(() => null);
      if (got) stills.set(v.id, got);
    }));
  if (stills.size) deck = withPosters(deck, stills);
  // Its comments: kept from the version it changes, changed as it says (checked once more, ids once each).
  let before: Deck | null = null;
  try {
    before = prev ? readDeck(prev) : null;
  } catch {}
  deck = normalizeDeck(carryComments(deck, before, input && typeof input === 'object' ? (input as Record<string, unknown>).comments : undefined, notes));
  const text = deckText(deck);
  if (Buffer.byteLength(text) > MAX_DECK) throw new Error(`The deck is over ${MAX_DECK / 1024 / 1024} MB without its pictures; make it smaller.`);
  return { deck, text, notes };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** JSON to put inside a page's <script>: nothing in it can end the script or break a line in it. */
const scriptJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * A deck's equations drawn here by the server's own KaTeX (math.ts, as a document's are), each once by its LaTeX, and
 * what a page needs to show them: the drawings (the runtime puts each in its place, never the deck's own words as
 * markup) and KaTeX's stylesheet with only the fonts they use inside it. No network: offline, published or saved as a
 * file, a deck's equations draw. Null for a deck without equations.
 */
export function deckMaths(d: Deck): { json: string; style: string } | null {
  const tex = new Set<string>();
  for (const s of d.slides) for (const e of everyEl(s.els)) if (e.type === 'math' && e.tex) tex.add(e.tex);
  if (!tex.size) return null;
  const drawn: Record<string, string> = {};
  for (const t of tex) drawn[t] = texToHtml(t, true);
  return { json: scriptJson(drawn), style: katexStyle(Object.values(drawn).join('')) };
}

/** A page's head and body parts for a deck's equations ('' without any): the stylesheet, and the drawings as #n-math. */
export function mathTags(d: Deck): { head: string; body: string } {
  const m = deckMaths(d);
  return m ? { head: `<style>${m.style}</style>`, body: `<script type="application/json" id="n-math">${m.json}</script>` } : { head: '', body: '' };
}

/** What every deck's page looks like around its slides: the app's colours in a frame, dark when it fills a window. */
const PAGE_CSS = [
  'html,body{margin:0;padding:0}',
  'body{background:var(--n-bg,#f6f5f1);color:var(--n-fg,#1b1915);font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}',
  'html[data-n-theme=dark] body{background:#000000;color:#e9edf5}',
  'body.ns-filled{background:#0e0e0f;color:#eceae6;min-height:100vh;display:flex;flex-direction:column;justify-content:center}',
  'body.ns-filled .ns-wrap{padding:12px}',
  'body.ns-filled .ns-viewer{color:#eceae6}',
  '.ns-wrap{min-width:0}',
].join('');

/**
 * The deck's own page: a viewer to click through (`viewer`), every slide on a page of its own (`print`), or its
 * first slide alone (`still`, for its picture in Pages). Its pictures go inside it; its videos from a device play from
 * an address of this server's that is its own permission (the page opens without the app's sign-in), or, in a page
 * that is a file on its own (`videosInside`), go inside it too where they are small enough (else their still shows).
 */
export function deckPage(db: DB, deck: Deck, title: string, mode: 'viewer' | 'print' | 'still' = 'viewer', o: { videosInside?: boolean } = {}): string {
  const pictured = mapSources(deck, (s) => (s.startsWith(ASSET) ? (assetDataUrl(db, s.slice(ASSET.length)) ?? '') : s));
  let room = 2 * VIDEO_INSIDE;
  const inside = mapVideoSources(pictured, (s) => {
    const sha = s.slice(VIDEO.length);
    if (!o.videosInside) return videoAddress(sha);
    const data = videoDataUrl(db, s, Math.min(VIDEO_INSIDE, room));
    if (data) room -= data.length * 0.75;
    return data ?? '';
  });
  const fams = googleFamilies(deckFonts(deck));
  const maths = mathTags(deck);
  return [
    '<!doctype html>',
    `<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>`,
    '<meta name="generator" content="Hydor slides">',
    fams ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${esc(fams)}&amp;display=swap">` : '',
    maths.head,
    `<style>${PAGE_CSS}</style></head><body>`,
    `<script type="application/json" id="n-deck">${scriptJson(inside)}</script>`,
    // Before the slides are drawn, so the equations draw with them.
    maths.body,
    `<script>(${RUNTIME_SRC})(window, ${FONTS_JSON}).boot(${JSON.stringify({ mode })})</script>`,
    '</body></html>',
  ].join('\n');
}

/** A deck page is one by its marker (the frame lets such a page go full screen). */
export const isDeckPage = (html: string) => /<script type="application\/json" id="n-deck">/.test(html.slice(0, 4096));

/** What get_page tells an agent of a deck. */
export function deckForAgent(text: string): string {
  const deck = readDeck(text);
  const body = text.length > 150_000 ? `${text.slice(0, 150_000)}\n… (cut: the deck is ${Math.round(text.length / 1024)} KB; keep the parts you did not read as they are by changing the deck slide by slide)` : text;
  const f = deck.footer;
  const foot = f ? `; on each slide${f.skipTitle ? ' but the title slide' : ''}: ${[f.num && 'its number', f.text && `"${f.text}"`, f.date && (f.date === 'today' ? "the day's date" : `the date "${f.date}"`)].filter(Boolean).join(', ')}` : '';
  return `A slide deck of ${deck.slides.length} slide${deck.slides.length === 1 ? '' : 's'} (${deck.ratio}, theme ${deck.theme.id ?? 'custom'}${foot}).\n\nOutline:\n${deckOutline(deck)}\n\nThe deck (send it back whole with save_slides and this id to change it; keep naget-asset: pictures, naget-video: videos and icons' paths as they are):\n${body}${commentsForAgent(deck)}`;
}

/** The deck's comments, slide by slide, each on its part or slide, with how to answer them; '' when it has none. */
function commentsForAgent(deck: Deck): string {
  const all = deck.slides.flatMap((s, i) => (s.comments ?? []).map((c) => ({ c, s, i })));
  if (!all.length) return '';
  const open = all.filter((x) => !x.c.resolved).length;
  const when = (at: number) => new Date(at).toISOString().slice(0, 16).replace('T', ' ');
  const who = (by: string) => (by === 'agent' ? 'an agent' : 'the user');
  const partOf = (s: Deck['slides'][number], id: string) => {
    const e = everyEl(s.els).find((x) => x.id === id);
    if (!e) return '';
    const words = e.type === 'text' || e.type === 'shape' ? plainText(e.paras).replace(/\s+/g, ' ').trim().slice(0, 60) : e.type === 'chart' ? (e.title ?? '') : e.type === 'math' ? e.tex.slice(0, 60) : '';
    return `, on its part ${id} (${e.name ? `“${e.name}”, ` : ''}${e.type}${words ? `: “${words}”` : ''})`;
  };
  const lines = all.map(({ c, s, i }) => {
    const replies = (c.replies ?? []).map((r) => `\n    reply by ${who(r.by)}, ${when(r.at)}: “${r.text}”`).join('');
    return `- ${c.id} (${c.resolved ? 'resolved' : 'open'}) on slide ${i + 1} [${s.id}]${c.el ? partOf(s, c.el) : ''}, by ${who(c.by)}, ${when(c.at)} UTC: “${c.text}”${replies}`;
  });
  return [
    `\n\nComments (${open} open, ${all.length - open} resolved):`,
    ...lines,
    'To answer them, save_slides with this id and comments: [{"id": "<id>", "reply": "what you did or say"}], adding "resolve": true once one is dealt with ("reopen": true opens it again, "delete": true takes it out); make the change a comment asks for in the slides too. Add one of your own with {"slide": <its number or id>, "el": "<a part’s id, or leave it out for the whole slide>", "text": "…"}. Comments you do not mention stay as they are (the slides’ own "comments" lists are kept from this version, whatever you send in them).',
  ].join('\n');
}

const SLIDES_HELP = [
  'Make or change a slide deck, kept in the user’s Library: they can present it (full screen; a presenter view with notes, the next slide and a timer), edit it as in PowerPoint or Google Slides, and export it to PowerPoint (.pptx) or PDF. Use it whenever the user asks for slides, a deck or a presentation, rather than writing a .pptx file (unless they ask for a file, or work on one they have). It shows in the conversation as a slideshow.',
  'Slides are 1280×720 px ("ratio": "4:3" makes them 1280×960); text sizes are px too (1 px = 0.75 pt: body 24–30, titles 44–60).',
  'Each slide comes from a layout with its words, from parts placed by position ("els"), or both ("extra": parts added to a layout). Layouts: title {title, subtitle}; content {title, text}; two {title, left, right, leftTitle, rightTitle}; section {title, subtitle}; image-right {title, text, image}; image {title, image, caption}; stats {title, stats: [{value, label}]}; cards {title, cards: [{title, text}]}; steps {title, steps: [{title, text}]}; quote {quote, by}; chart {title, chart: {kind, labels, series}}; table {title, table: [[header…], [row…]]}; title-only {title}; end {title, subtitle}; blank.',
  'Words (text, left, right, a part’s text): a line per paragraph, "- " for a bullet and "1. " for a number, two spaces before them a level deeper, **bold**, *italic*, [words](https://…); or an array of bullets (a nested array a level deeper).',
  'Parts: {type, x, y, w, h, …}. text {text, size, color, font, bold, italic, align, valign: top|middle|bottom, fill, line, radius, role: title|subtitle|body|caption|quote|big}. shape {shape: rect|round|ellipse|triangle|rtriangle|diamond|pentagon|hexagon|octagon|star|arrow|larrow|uarrow|darrow|chevron|parallelogram|trapezoid|plus|heart|callout, fill ("none" for none), fill2 and angle for a gradient, line, lineW, shadow, and text like a text part, in its middle unless align or valign say otherwise}. image {src, fit: cover|contain|fill, radius, alt, crop: {l, t, r, b} (the share cut off each side, 0–0.95; the rest fills the box), adjust: {bright and contrast −100…100, sat 0…200 (100 as it is), gray: true, blur in px}}: src is a file of this session (a picture you made), a public https address, or a picture of the deck already (naget-asset:…). line {x, y to x+w, y+h; color, width, dash: solid|dash|dot, start and end: none|arrow|dot}. table {rows: [[…]], head, band, size, merges: [{r, c, rs, cs}] (cells merged from row r, column c, rs rows down, cs across), fills: {"row,col": colour}}. chart {kind: column|bar|line|area|pie|doughnut, labels, series: [{name, values}], legend, values, stacked}. icon {icon: a Lucide icon’s name ("rocket", "chart-line", "users", "shield-check", "lightbulb"), color, lineW (its lines’ width, 2 by default)}: square, 120×120 if no w and h. math {tex: an equation in LaTeX ("E = mc^2", "\\int_0^1 x^2\\,dx"), color, align: left|right}: drawn as large as its box allows, in the text colour. video {src: a YouTube or Vimeo address, or a video file of this session (an .mp4, .mov or .webm of up to 200 MB, kept with the deck; naget-video:… once kept), start (seconds), autoplay, muted, loop, poster}: its still (its site’s, or a file’s first frame, fetched and kept, unless you give a poster) shows until it plays in the slideshow. group {els: [parts]}: parts that move as one; without x and y its parts are placed on the slide, with them its parts are placed from its top-left corner. Any part may have rot (degrees), opacity, link ("https://…", or "#3" for slide 3), name, key, and anim: its entrance ("fade", or {fx, on, dur, delay, dir}).',
  'Colours: the theme’s names, which follow it (accent, accentFg, fg, head, muted, bg, soft, c1 to c6), or #hex.',
  'A slide may also have notes (speaker notes: what to say), bg (a colour; {color, to, angle} for a gradient; {image, dim} for a picture), transition (none|fade|push|wipe|cover|zoom|split|morph, or {fx, dir, dur, auto: seconds to go on by itself}), hidden, nofooter (no footer or number on it), build: true (its bullets come one at a time), and anims: [{el: a part’s id, type: in|em|out, fx: appear|fade|fly|float|zoom|wipe|bounce for in and out, pulse|spin|grow|shake for em, on: click|with|after, dur and delay in ms, dir: left|right|up|down, byPara}]. Morph: the parts this slide shares with the one before glide from where they were (moving, growing, turning, recolouring) and the rest fade; a part matches one of the slide before with the same key (or whose id is its key), else the same name, else the same words or picture, so to morph, repeat the part on the next slide with "key" set to its id and change its x, y, w, h, rot or colour.',
  'The deck may have footer {num: true (each slide’s number), text, date: "today" or a date as written, skipTitle: true (not on the title slide)} and guides {x: [px], y: [px]} (the lines its parts are lined up on).',
  'theme: a preset (paper, midnight, ember, forest, ocean, noir, blossom, slate) or {id, bg, fg, head, muted, accent, accentFg, soft, colors: [6], font, headFont}; fonts: Inter, Roboto, Open Sans, Lato, Montserrat, Poppins, Nunito, DM Sans, Work Sans, Space Grotesk, IBM Plex Sans, Outfit, Playfair Display, Merriweather, Lora, Fraunces, DM Serif Display, Source Serif 4, JetBrains Mono, Arial, Georgia.',
  'Good slides: one idea each, a title that says the point, a few short bullets, numbers as charts or big numbers, pictures where they help, and what to say in the notes.',
  'To change a deck, get_page with its id gives it whole (each slide and part with its id); send the whole deck back with the same id: a new version, the older ones restorable. Keep what the user changed.',
  'Comments: get_page lists the comments people left on slides and their parts (and their ids). Answer with comments: [{"id": "c1", "reply": "…", "resolve": true}] beside the slides (and make the change asked for); {"id", "reopen": true} reopens one, {"id", "delete": true} takes it out; {"slide": 3, "el": "<a part’s id, or none for the whole slide>", "text": "…"} adds one of yours. Comments you do not mention stay as they are; keep each slide’s id so its comments stay with it.',
].join(' ');

export const SAVE_SLIDES_DESCRIPTION = SLIDES_HELP;

export const SAVE_SLIDES_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'A saved deck’s id, to save a new version of it.' },
    title: { type: 'string', description: 'The deck’s name in the Library: "Q3 results".' },
    ratio: { type: 'string', enum: ['16:9', '4:3'] },
    theme: { description: 'A preset’s name, or the theme’s colours and fonts.', anyOf: [{ type: 'string' }, { type: 'object' }] },
    slides: { type: 'array', items: { type: 'object' }, description: 'The slides, in order.' },
    footer: { type: 'object', description: 'What the foot of each slide shows: {num, text, date, skipTitle}.' },
    guides: { type: 'object', description: 'The guides parts line up on: {x: [px], y: [px]}.' },
    comments: {
      type: 'array',
      items: { type: 'object' },
      description: 'Changes to the comments: {"id": "c1", "reply": "…"}, {"id": "c1", "resolve": true}, {"id": "c1", "reopen": true}, {"id": "c1", "delete": true}, or a new one: {"slide": 3, "el": "<a part’s id, optional>", "text": "…"}.',
    },
  },
  required: ['title', 'slides'],
};
