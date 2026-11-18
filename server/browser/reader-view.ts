// Reader view in your own browsing: on a page with an article, a button in the address bar shows the article in a clean,
// readable layout over the page, in the tab itself, with the text size, colours and font you chose (Settings → Browser), and
// takes it away again. Nothing leaves the tab: Mozilla's Readability (readability/, Apache-2.0) finds the article in the
// page as it is now (a page that is already translated shows translated), and a code run in the tab's isolated world
// (Tab.evaluate: the page's own scripts cannot see it) cleans the article's HTML again and puts it in a closed shadow root
// that covers the page, so the page's own styles and scripts reach nothing of it.
//
// Whether a page has an article is looked at cheaply after each load (Readability's isProbablyReaderable on the live page,
// no copy), so the button is there only when it helps.
import { BROWSING_KEY, type BrowserView, type ReaderPrefs } from '../../shared/browser.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { userLang } from '../language/index.ts';
import type { Deps } from '../features/types.ts';
import type { ReaderRaw } from '../pages/reader.ts';
import { browsingPrefs } from './browsing.ts';
import { READERABLE_SRC } from './readability/readerable-source.ts';
import { browserOf, viewOf } from './session.ts';

/** When, after a page has loaded, it is looked at for an article (ms): at once, then for a page that builds its content later. */
export const CHECK_AT = [0, 1500, 5000];

/** An article with less text than this (characters) is not shown: it is a page that only looks like one. */
export const MIN_LENGTH = 200;

/** Words read in a minute, and the characters in a word with its space (Chinese, Japanese and Korean count characters). */
export const WORDS_PER_MINUTE = 230;
export const CHARS_PER_WORD = 6;
export const CJK_CHARS_PER_MINUTE = 400;

export const NO_ARTICLE = 'This page has no article to show in reader view';

/** What this needs of a tab (server/browser/tab.ts Tab). */
export interface LiveTab {
  targetId: string;
  url: string;
  closed?: boolean;
  /** Reader view can show its article, and shows it (Tab: both start again with each new document). */
  readerable: boolean;
  readerOn: boolean;
  owner: { changed(): void };
  evaluate<T>(expression: string): Promise<T>;
  reader(): Promise<ReaderRaw | null>;
}

type Look = 'dark' | 'light' | 'sepia';

// ---- the pure parts ---------------------------------------------------------------------------------

/** Minutes to read an article of this many characters (at least one), as a person reads: about 230 words a minute. */
/**
 * How long the article takes to read, in the app's own language ("5 min read"; elsewhere the minutes as that language
 * writes them, such as "5 Minuten"): the page cannot reach the app's dictionaries.
 */
export function minutesLabel(n: number, appLang: string): string {
  if (appLang === 'en') return `${n} min read`;
  try {
    return new Intl.NumberFormat(appLang, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(n);
  } catch {
    return `${n} min read`;
  }
}

export function readingMinutes(length: number, lang = ''): number {
  const perMinute = /^(zh|ja|ko)\b/i.test(lang) ? CJK_CHARS_PER_MINUTE : WORDS_PER_MINUTE * CHARS_PER_WORD;
  return Math.max(1, Math.round(Math.max(0, length) / perMinute));
}

/** The colours reader view is shown in: what you chose, and for `auto` the look the app has now. */
export function resolveTheme(theme: ReaderPrefs['theme'], app: 'dark' | 'light'): Look {
  return theme === 'auto' ? (app === 'light' ? 'light' : 'dark') : theme;
}

/** Whether a page is one reader view can show: a web page or a file. */
export const isWebUrl = (url: string): boolean => /^(https?|file):\/\//i.test(url);

/** A page's address without its #fragment: moving within the page is not another page. */
export const pageKey = (url: string): string | null => (isWebUrl(url) ? url.split('#')[0] : null);

/** The languages written from right to left (their first part). */
const RTL = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'yi', 'dv', 'ug', 'ckb']);

/** `rtl` for a language written from right to left, else an empty text. */
export const dirOf = (lang: string | undefined): 'rtl' | '' => (RTL.has(String(lang ?? '').toLowerCase().split(/[-_]/)[0]) ? 'rtl' : '');

const PALETTE: Record<Look, { bg: string; fg: string; muted: string; link: string; line: string; soft: string; scheme: string }> = {
  dark: { bg: '#16161a', fg: '#e4e4e7', muted: '#a1a1aa', link: '#8ab4f8', line: '#33333b', soft: '#202026', scheme: 'dark' },
  light: { bg: '#ffffff', fg: '#1f1f23', muted: '#6b6b76', link: '#1a5fd0', line: '#e2e2e7', soft: '#f4f4f6', scheme: 'light' },
  sepia: { bg: '#f4ecd8', fg: '#433422', muted: '#7a6a55', link: '#8a4b12', line: '#dacdb0', soft: '#ebe1c7', scheme: 'light' },
};

const FONTS: Record<ReaderPrefs['font'], string> = {
  serif: "Charter, 'Iowan Old Style', Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};
const SANS = FONTS.sans;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";

/** The style sheet of reader view's shadow root, for these colours, size and font. */
export function readerCss(prefs: Pick<ReaderPrefs, 'size' | 'font'>, look: Look): string {
  const c = PALETTE[look] ?? PALETTE.dark;
  const size = Math.min(28, Math.max(14, Math.round(Number(prefs.size) || 19)));
  const font = FONTS[prefs.font] ?? FONTS.serif;
  return `
:host { color-scheme: ${c.scheme}; }
*, *::before, *::after { box-sizing: border-box; }
.scroll { position: absolute; inset: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; background: ${c.bg}; color: ${c.fg}; font-family: ${font}; font-size: ${size}px; line-height: 1.65; padding: 0 1.25em; outline: none; -webkit-text-size-adjust: 100%; text-rendering: optimizeLegibility; }
.page { max-width: 34em; margin: 0 auto; padding: 3.2em 0 7em; overflow-wrap: break-word; }
::selection { background: ${c.link}; color: ${c.bg}; }
header { margin-bottom: 2.2em; }
.site { font: 600 0.72em/1.3 ${SANS}; letter-spacing: 0.09em; text-transform: uppercase; color: ${c.muted}; }
h1.title { font-size: 2.1em; line-height: 1.2; margin: 0.35em 0 0.45em; font-weight: 700; }
.byline, .meta { font: 0.85em/1.5 ${SANS}; color: ${c.muted}; }
.byline { color: ${c.fg}; opacity: 0.85; }
.body > :first-child { margin-top: 0; }
.body p { margin: 0 0 1.1em; }
.body h1, .body h2, .body h3, .body h4, .body h5, .body h6 { line-height: 1.25; margin: 1.7em 0 0.55em; font-weight: 700; }
.body h1 { font-size: 1.7em; } .body h2 { font-size: 1.45em; } .body h3 { font-size: 1.25em; } .body h4 { font-size: 1.1em; } .body h5, .body h6 { font-size: 1em; }
.body a { color: ${c.link}; text-decoration: underline; text-underline-offset: 0.15em; text-decoration-thickness: 0.06em; }
.body img, .body picture { max-width: 100%; height: auto; }
.body img { display: block; margin: 1.3em auto; }
.body figure { margin: 1.6em 0; }
.body figcaption { font: 0.8em/1.45 ${SANS}; color: ${c.muted}; margin-top: 0.6em; text-align: center; }
.body blockquote { margin: 1.3em 0; padding: 0.1em 0 0.1em 1.1em; padding-inline: 1.1em 0; border-inline-start: 3px solid ${c.line}; color: ${c.muted}; }
.body blockquote p:last-child { margin-bottom: 0; }
.body ul, .body ol { margin: 0 0 1.1em; padding-inline-start: 1.7em; }
.body li { margin: 0.35em 0; }
.body dt { font-weight: 700; margin-top: 0.8em; } .body dd { margin: 0.2em 0 0.6em; margin-inline-start: 1.5em; }
.body pre { overflow-x: auto; background: ${c.soft}; border: 1px solid ${c.line}; border-radius: 6px; padding: 0.9em 1em; margin: 1.3em 0; font: 0.85em/1.5 ${MONO}; direction: ltr; text-align: left; tab-size: 4; }
.body code { font-family: ${MONO}; font-size: 0.88em; background: ${c.soft}; border-radius: 4px; padding: 0.1em 0.3em; }
.body pre code { font-size: 1em; background: none; padding: 0; border-radius: 0; }
.body table { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; margin: 1.3em 0; font-size: 0.92em; }
.body th, .body td { border: 1px solid ${c.line}; padding: 0.4em 0.7em; text-align: start; vertical-align: top; }
.body th { background: ${c.soft}; }
.body caption { font: 0.85em ${SANS}; color: ${c.muted}; padding: 0.4em; }
.body hr { border: 0; border-top: 1px solid ${c.line}; margin: 2.2em 0; }
.body mark { background: rgba(255, 214, 10, 0.4); color: inherit; }
.body small { font-size: 0.85em; } .body sub, .body sup { font-size: 0.75em; line-height: 0; }
`;
}

// ---- the code that runs in the page ----------------------------------------------------------------

/** Whether the page looks like it has an article: Readability's own quick test, on the page as it is (no copy). */
export const readerableScript = (): string => `(() => {
${READERABLE_SRC}
;
try {
  if (document.contentType && !/html/i.test(document.contentType)) return false;
  return isProbablyReaderable(document) === true;
} catch (e) {
  return false;
}
})()`;

// String.raw: this is page code, not ours. It has no backticks and no dollar signs; the payload is put in as JSON.
const SHOW = String.raw`(function (P) {
  var NS = 'http://www.w3.org/1999/xhtml';
  if (location.href.split('#')[0] !== P.href.split('#')[0]) return 'moved';
  var gone = globalThis.__hydorReader;
  if (gone && gone.hide) { try { gone.hide(); } catch (e) {} }

  function set(list) { var o = {}; list.split(' ').forEach(function (t) { o[t] = 1; }); return o; }
  var ALLOW = set('p h1 h2 h3 h4 h5 h6 a img picture source figure figcaption blockquote ul ol li pre code em strong b i u s sub sup small mark br hr table thead tbody tfoot tr th td caption span div section article dl dt dd time abbr cite q del ins');
  var DROP = set('script style iframe frame frameset object embed applet form noscript template svg math link meta base head title textarea select option input button canvas audio video dialog');

  // An address as it goes in: made whole, and only of the kinds named (a link's address may be a #place in the article).
  function url(v, ok) {
    v = String(v).trim();
    if (!v) return '';
    if (v.charAt(0) === '#') return ok.hash && v.length < 300 ? v : '';
    var u;
    try { u = new URL(v, document.baseURI); } catch (e) { return ''; }
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
    if (ok.mailto && u.protocol === 'mailto:') return u.href;
    if (ok.data && u.protocol === 'data:' && /^data:image\//i.test(u.href)) return u.href;
    return '';
  }

  // A srcset as it goes in: its pictures' addresses checked one by one, each with its width or density.
  function srcset(v) {
    var out = [], s = String(v), n = s.length, i = 0;
    while (i < n) {
      while (i < n && /[\s,]/.test(s.charAt(i))) i++;
      var a = i;
      while (i < n && !/\s/.test(s.charAt(i))) i++;
      var u = s.slice(a, i), d = '';
      if (!u) break;
      if (/,$/.test(u)) u = u.replace(/,+$/, '');
      else {
        var b = i;
        while (i < n && s.charAt(i) !== ',') i++;
        d = s.slice(b, i).trim();
      }
      var ok = url(u, { data: true });
      if (ok) out.push(/^[\d.]+[wx]$/.test(d) ? ok + ' ' + d : ok);
    }
    return out.join(', ');
  }

  // What an attribute becomes (an empty text: it is not kept).
  function attr(name, v) {
    v = String(v);
    switch (name) {
      case 'href': return url(v, { hash: true, mailto: true });
      case 'src': return url(v, { data: true });
      case 'cite': return url(v, {});
      case 'srcset': return srcset(v);
      case 'sizes': return v.length < 400 && /^[\w\s,().%*+/-]*$/.test(v) ? v : '';
      case 'alt': case 'title': case 'datetime': return v.slice(0, 1000);
      case 'colspan': case 'rowspan': return /^\d{1,4}$/.test(v.trim()) ? v.trim() : '';
      case 'lang': return /^[a-zA-Z0-9-]{1,35}$/.test(v.trim()) ? v.trim() : '';
      case 'dir': return /^(ltr|rtl|auto)$/i.test(v.trim()) ? v.trim().toLowerCase() : '';
      case 'id': return /^[\w:.-]{1,100}$/.test(v) ? v : '';
      default: return '';
    }
  }
  var KEEP = { a: 'href title lang dir id', img: 'src srcset sizes alt title lang dir id', source: 'srcset sizes', q: 'cite lang dir id', blockquote: 'cite lang dir id', del: 'cite datetime lang dir id', ins: 'cite datetime lang dir id', time: 'datetime lang dir id', td: 'colspan rowspan lang dir id', th: 'colspan rowspan lang dir id', abbr: 'title lang dir id' };
  var COMMON = 'lang dir id';

  // Builds the clean copy of an article's parts into dst: allowed elements are made new with their allowed attributes only,
  // others give up their tags and keep their contents, and the dropped ones go with theirs.
  function clean(src, dst, depth) {
    for (var n = src.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.data)); continue; }
      if (n.nodeType !== 1) continue;
      var tag = n.localName;
      if (n.namespaceURI !== NS || DROP[tag]) continue;
      if (depth > 200) { dst.appendChild(document.createTextNode(n.textContent)); continue; }
      if (!ALLOW[tag]) { clean(n, dst, depth + 1); continue; }
      var el = document.createElement(tag);
      var names = (KEEP[tag] || COMMON).split(' ');
      for (var i = 0; i < names.length; i++) {
        var v = n.getAttribute(names[i]);
        if (v === null) continue;
        v = attr(names[i], v);
        if (v) el.setAttribute(names[i], v);
      }
      if (tag === 'img' && !el.hasAttribute('src') && !el.hasAttribute('srcset')) continue;
      if (tag === 'source' && !el.hasAttribute('srcset')) continue;
      clean(n, el, depth + 1);
      dst.appendChild(el);
    }
  }

  var tpl = document.createElement('template');
  tpl.innerHTML = P.html;
  var body = document.createElement('div');
  body.className = 'body';
  clean(tpl.content, body, 0);
  if (!body.textContent.trim() && !body.querySelector('img')) return 'empty';

  function make(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }
  var de = document.documentElement;
  var pageDir = (de.getAttribute('dir') || (document.body && document.body.getAttribute('dir')) || '').toLowerCase();
  var dir = P.dir || (pageDir === 'rtl' || pageDir === 'ltr' ? pageDir : 'auto');

  var scroll = make('div', 'scroll');
  scroll.tabIndex = -1;
  var page = make('article', 'page');
  page.setAttribute('dir', dir);
  if (/^[a-zA-Z0-9-]{1,35}$/.test(P.lang || '')) page.setAttribute('lang', P.lang);
  var head = make('header');
  if (P.site) head.appendChild(make('div', 'site', P.site));
  head.appendChild(make('h1', 'title', P.title));
  if (P.byline) head.appendChild(make('div', 'byline', P.byline));
  var when = '';
  if (P.date) {
    var dt = new Date(P.date);
    if (!isNaN(dt.getTime())) {
      try { when = dt.toLocaleDateString(P.lang || undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch (e) { when = dt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }); }
    }
  }
  var meta = [P.minutes, when].filter(Boolean).join(' · ');
  if (meta) head.appendChild(make('div', 'meta', meta));
  page.appendChild(head);
  page.appendChild(body);
  scroll.appendChild(page);

  var host = document.createElement('hydor-reader');
  [['all', 'initial'], ['position', 'fixed'], ['inset', '0'], ['z-index', '2147483647'], ['display', 'block']].forEach(function (p) {
    host.style.setProperty(p[0], p[1], 'important');
  });
  var root = host.attachShadow({ mode: 'closed' });
  var sheet = null, style = null;
  try {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(P.css);
    root.adoptedStyleSheets = [sheet];
  } catch (e) {
    sheet = null;
    style = document.createElement('style');
    style.textContent = P.css;
    root.appendChild(style);
  }
  root.appendChild(scroll);

  // A link to a place in the article scrolls there; the page underneath has nothing to scroll to.
  root.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    var h = a && a.getAttribute('href');
    if (!h || h.charAt(0) !== '#') return;
    e.preventDefault();
    var to = null;
    try { to = root.getElementById(decodeURIComponent(h.slice(1))); } catch (x) {}
    if (to) to.scrollIntoView({ block: 'start' });
  });
  // The page's own key shortcuts must not act while the article is read.
  ['keydown', 'keypress', 'keyup'].forEach(function (t) { host.addEventListener(t, function (e) { e.stopPropagation(); }); });

  // The page underneath stays where it is: its scrolling is switched off, and its style is put back as it was found.
  var saved = [de, document.body].filter(Boolean).map(function (el) {
    return { el: el, attr: el.getAttribute('style'), value: el.style.getPropertyValue('overflow'), priority: el.style.getPropertyPriority('overflow'), mine: null };
  });
  var before = document.activeElement;
  saved.forEach(function (s) { s.el.style.setProperty('overflow', 'hidden', 'important'); s.mine = s.el.getAttribute('style'); });
  de.appendChild(host);
  try { scroll.focus({ preventScroll: true }); } catch (e) {}

  globalThis.__hydorReader = {
    root: root,
    host: host,
    css: function (text) { if (sheet) sheet.replaceSync(text); else style.textContent = text; },
    hide: function () {
      host.remove();
      saved.forEach(function (s) {
        if (s.el.getAttribute('style') === s.mine) {
          // Nothing else changed its style meanwhile: it is given back exactly as it was written.
          if (s.attr === null) s.el.removeAttribute('style'); else s.el.setAttribute('style', s.attr);
        } else if (s.value) s.el.style.setProperty('overflow', s.value, s.priority);
        else s.el.style.removeProperty('overflow');
      });
      try { if (before && before !== document.body && before.isConnected && before.focus) before.focus({ preventScroll: true }); } catch (e) {}
      delete globalThis.__hydorReader;
    },
  };
  return 'shown';
})`;

/** Puts the article over the page; the answer is `shown`, `moved` (the page is another one now) or `empty`. */
export const showScript = (p: { href: string; css: string; html: string; title: string; site: string; byline: string; minutes: string; date: string; lang: string; dir: 'rtl' | '' }): string => `${SHOW}(${JSON.stringify(p)})`;

/** Takes the article away and gives the page back its scrolling. */
export const hideScript = (): string => `(() => { var r = globalThis.__hydorReader; if (!r || !r.hide) return false; r.hide(); return true; })()`;

/** Gives the article another look. False when it is not shown any more (the page took its cover away). */
export const restyleScript = (css: string): string => `(() => { var r = globalThis.__hydorReader; if (!r || !r.host || !r.host.isConnected) return false; r.css(${JSON.stringify(css)}); return true; })()`;

// ---- the class ---------------------------------------------------------------------------------------

interface Seen {
  page: string | null;
  loading: boolean;
  loadedAt?: number;
  /** Its page has been looked at (or is being). */
  checked: boolean;
}

export class ReaderViews {
  private seenTabs = new Map<string, Seen>();
  private timers = new Map<string, ReturnType<typeof setTimeout>[]>();
  /** The app's look each open reader view was shown with, for `auto`. */
  private shownWith = new Map<string, 'dark' | 'light'>();

  constructor(
    private db: DB,
    private tabs: () => LiveTab[],
    private at: number[] = CHECK_AT,
  ) {}

  private tab(id: string) {
    return this.tabs().find((t) => t.targetId === id && !t.closed);
  }

  /** The view of your browsing changed: a page that has just loaded is looked at for an article, and one that moved without loading ends reader view. */
  seen(view: { open: boolean; tabs: { id: string; url: string; loading?: boolean; loadedAt?: number }[] }) {
    if (!view.open) {
      for (const id of [...this.seenTabs.keys()]) this.forget(id);
      return;
    }
    const live = new Set<string>();
    for (const t of view.tabs) {
      live.add(t.id);
      const page = pageKey(t.url);
      const loading = t.loading === true;
      const prev = this.seenTabs.get(t.id);
      const fresh = !prev || (loading && !prev.loading) || (!loading && t.loadedAt !== undefined && t.loadedAt !== prev.loadedAt);
      const moved = !!prev && prev.page !== page;
      const tab = this.tab(t.id);
      // Another address without loading a page (a site that changes it itself): the article shown is the old page's.
      if (moved && !fresh && tab?.readerOn) void this.hide(tab);
      let checked = prev?.checked ?? false;
      if (fresh || moved) {
        if (prev) this.clearTimers(t.id);
        checked = false;
      }
      // A page still loading is looked at once it has loaded.
      if (page && !loading && !checked) {
        checked = true;
        this.schedule(t.id);
      }
      if (!page && tab?.readerable) {
        tab.readerable = false;
        tab.owner.changed();
      }
      this.seenTabs.set(t.id, { page, loading, loadedAt: t.loadedAt, checked });
    }
    for (const id of [...this.seenTabs.keys()]) if (!live.has(id)) this.forget(id);
  }

  /** Looks at the page for an article now and a moment later. */
  private schedule(id: string) {
    this.clearTimers(id);
    const timers = this.at.map((ms, i) =>
      setTimeout(() => {
        const t = this.tab(id);
        if (t) void this.check(t, t.url, i > 0);
      }, ms),
    );
    this.timers.set(id, timers);
  }

  /** Whether the page has an article, as the tab says; later looks only add (a page that grows its article), the first decides. */
  private async check(tab: LiveTab, url: string, upgradeOnly: boolean) {
    if (tab.closed || tab.readerOn || !isWebUrl(url)) return;
    if (upgradeOnly && tab.readerable) return;
    let ok: boolean;
    try {
      ok = (await tab.evaluate<boolean>(readerableScript())) === true;
    } catch {
      // The page moved on under the script (a new document): its own pass is on its way.
      return;
    }
    if (tab.closed || tab.readerOn || pageKey(tab.url) !== pageKey(url)) return;
    if (upgradeOnly && !ok) return;
    if (tab.readerable !== ok) {
      tab.readerable = ok;
      tab.owner.changed();
    }
  }

  /** Shows the tab's article over its page, as `theme` (the app's look now) and the reader settings say. */
  async show(tab: LiveTab, theme: 'dark' | 'light') {
    if (tab.closed) throw new HttpError(404, 'No such tab');
    if (!isWebUrl(tab.url)) throw new HttpError(409, 'Reader view is for web pages');
    const url = tab.url;
    const art = await tab.reader();
    const text = art?.length ?? (art?.content ?? '').replace(/<[^>]*>/g, '').length;
    if (!art?.content || text < MIN_LENGTH) throw new HttpError(409, 'This page has no article to show in reader view');
    const prefs = browsingPrefs(this.db).reader;
    const css = readerCss(prefs, resolveTheme(prefs.theme, theme));
    const lang = (art.lang ?? '').trim();
    const date = art.publishedTime ?? '';
    const r = await tab.evaluate<string>(
      showScript({
        href: url,
        css,
        html: art.content,
        title: art.title ?? '',
        site: art.siteName ?? '',
        byline: art.byline ?? '',
        minutes: minutesLabel(readingMinutes(text, lang), userLang(this.db)),
        date,
        lang,
        dir: dirOf(lang),
      }),
    );
    if (r === 'moved') throw new HttpError(409, 'The page changed while reader view was opening');
    if (r !== 'shown') throw new HttpError(409, 'This page has no article to show in reader view');
    this.shownWith.set(tab.targetId, theme);
    tab.readerOn = true;
    tab.readerable = true;
    tab.owner.changed();
  }

  /** Takes the article away. */
  async hide(tab: LiveTab) {
    if (!tab.closed) {
      try {
        await tab.evaluate(hideScript());
      } catch {
        // A new document has no cover to take away.
      }
    }
    this.shownWith.delete(tab.targetId);
    if (tab.readerOn) {
      tab.readerOn = false;
      tab.owner.changed();
    }
  }

  /** The reader settings changed: every open reader view gets the new look. */
  async restyle() {
    const prefs = browsingPrefs(this.db).reader;
    for (const t of this.tabs()) {
      if (t.closed || !t.readerOn) continue;
      const css = readerCss(prefs, resolveTheme(prefs.theme, this.shownWith.get(t.targetId) ?? 'dark'));
      let shown = false;
      try {
        shown = (await t.evaluate<boolean>(restyleScript(css))) === true;
      } catch {
        // The page moved on: it has no cover now.
      }
      if (!shown && t.readerOn) {
        t.readerOn = false;
        this.shownWith.delete(t.targetId);
        t.owner.changed();
      }
    }
  }

  private clearTimers(id: string) {
    for (const t of this.timers.get(id) ?? []) clearTimeout(t);
    this.timers.delete(id);
  }

  private forget(id: string) {
    this.clearTimers(id);
    this.seenTabs.delete(id);
    this.shownWith.delete(id);
  }

  /** Stops everything it has waiting (for a test, or when the browser stops). */
  stop() {
    for (const id of [...this.seenTabs.keys()]) this.forget(id);
  }
}

// ---- the route ---------------------------------------------------------------------------------------

/** The tab's reader view on or off (under /api/browser/browsing/, which agents are refused: it is your own browsing). */
export function readerRoutes(d: Deps, views: ReaderViews) {
  d.app.post('/api/browser/browsing/tabs/:id/reader', async (req): Promise<{ view: BrowserView }> => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.on !== 'boolean') throw new HttpError(400, 'Send on: true to show reader view, false to take it away');
    if (body.theme !== undefined && body.theme !== 'dark' && body.theme !== 'light') throw new HttpError(400, 'theme should be "dark" or "light"');
    const id = (req.params as { id: string }).id;
    const tab = browserOf(BROWSING_KEY)?.tabs.find((t) => t.targetId === id && !t.closed);
    if (!tab) throw new HttpError(404, 'No such tab');
    if (body.on) await views.show(tab, body.theme === 'light' ? 'light' : 'dark');
    else await views.hide(tab);
    return { view: viewOf(BROWSING_KEY) };
  });
}
