// The website's languages: what is translated, how, and the parts every page needs for it (the language switcher,
// the alternates for search engines, the script that picks a visitor's language). README.md ("Languages") says how
// the pieces fit; this file is the machinery, with no page of its own.
//
// The English pages are the source. A translation is a file of its own, website/i18n/<lang>.json: { English text:
// the text in that language }. The English text is the key, and a text that has inline elements in it (a link, a
// span, <strong>, <code>, <br>, an icon) has them as numbered placeholders, so a translation can put the words in
// its own order and the build puts the original elements, with their attributes, back around them:
//
//   <a class="x" href="/docs/">Read the <code>guide</code></a>   becomes   "Read the <0>guide</0>"   (the <a> is the unit)
//   <p>Press <kbd>Ctrl K</kbd> to search, <a href="/">here</a></p>   "Press <0>Ctrl K</0> to search, <1>here</1>"
//
// An element with no words (an icon, <br>) is <n/>. Code, kbd, samp, anything with translate="no" or a lang of its
// own (the Greek word) shows its text for the translator to read, but the page keeps the original whatever comes
// back. Text outside the tags has & < > as &amp; &lt; &gt;. A translation missing a placeholder, or with one more, is
// refused (the English shows, and the build says so).
import fs from 'node:fs';
import path from 'node:path';
import { defaultTreeAdapter as ta, parse, serialize } from 'parse5';

export const SITE = 'https://hydor.app';
/** The language tags the pages carry (lang, hreflang) and Open Graph's locales, by the app's language ids. */
export const TAGS = { en: 'en', de: 'de', es: 'es', fr: 'fr', pt: 'pt-BR', el: 'el', ja: 'ja', zh: 'zh-Hans' };
export const OG_LOCALES = { en: 'en_US', de: 'de_DE', es: 'es_ES', fr: 'fr_FR', pt: 'pt_BR', el: 'el_GR', ja: 'ja_JP', zh: 'zh_CN' };

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** Text as it is written in a key: & < > escaped, nothing else. */
export const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The reverse, forgiving: a translation may write a plain & or a quote entity. */
export const unescText = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&');

const fmt = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const MARK = /<\/?\d+\/?>|\{\w+\}|%[A-Z_]+%/g;
/** What a translation must keep from its key: every placeholder, {variable} and %TOKEN%, in any order. */
const marks = (s) => (s.match(MARK) ?? []).sort().join('\u0000');

/** A text with no word of its own to translate: only numbers, symbols, a name. */
const KEEP = new Set(['Hydor', 'Git', 'GitHub', 'Docker', 'Docker Hub', 'AppImage', '.deb', 'Render', 'DigitalOcean', 'Koyeb']);
const worthless = (s) => !/\p{L}/u.test(s.replace(MARK, '')) || KEEP.has(s);

export function loadDict(dir, lang) {
  const file = path.join(dir, `${lang}.json`);
  if (lang === 'en' || !fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The translator of one language: T(key, vars) for a plain text and TH(key, elements, vars) for a text with
 * placeholders (HTML back, the elements as their opening tags: ['<a href="…">', '<code>']). A key with no (valid)
 * translation gives itself, so any subset of translations builds. `record` collects every key asked for: that is
 * how the strings are extracted (the English build records, the others only count).
 */
export function makeTranslator(dict = {}, record = null) {
  const missing = new Set();
  const refused = new Set();
  const asked = new Set();
  const get = (key) => {
    if (!key) return key;
    record?.add(key);
    asked.add(key);
    const v = dict[key];
    if (typeof v !== 'string' || !v.trim()) {
      missing.add(key);
      return key;
    }
    if (marks(key) !== marks(v)) {
      refused.add(key);
      return key;
    }
    return v;
  };
  const T = (key, vars) => fmt(get(key), vars);
  const TH = (key, els = [], vars) => markup(get(key), els, vars);
  const has = (key) => typeof dict[key] === 'string' && dict[key].trim() !== '';
  return { T, TH, get, has, missing, refused, asked };
}

/** A key's text as HTML, its numbered placeholders turned into the elements given (opening tags, or whole void ones). */
export function markup(s, els = [], vars) {
  const close = (open) => `</${/^<([a-zA-Z][\w-]*)/.exec(open)?.[1] ?? 'span'}>`;
  return s
    .split(/(<\/?\d+\/?>)/)
    .map((p) => {
      const m = /^<(\/)?(\d+)(\/)?>$/.exec(p);
      if (!m) return esc(fmt(unescText(p), vars)).replace(/&quot;/g, '"');
      const el = els[Number(m[2])] ?? '';
      return m[1] ? close(el) : el;
    })
    .join('');
}

/* ---------- Pages: which texts are translated, and putting them back ---------- */

const SKIP_TAGS = new Set(['script', 'style', 'svg', 'pre', 'code', 'kbd', 'samp', 'canvas', 'video', 'audio', 'textarea', 'noscript', 'template', 'math']);
const PROTECT_TAGS = new Set(['code', 'kbd', 'samp']);
const ATTRS = ['title', 'alt', 'aria-label', 'placeholder'];
const META_TEXTS = new Set(['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description']);

const attr = (n, name) => n.attrs?.find((a) => a.name === name)?.value;
const setAttr = (n, name, value) => {
  const a = n.attrs.find((x) => x.name === name);
  if (a) a.value = value;
  else n.attrs.push({ name, value });
};
const textOf = (n) => (n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(textOf).join(''));
const hasText = (n) => /\S/.test(textOf(n));
const skipped = (n) => SKIP_TAGS.has(n.tagName) || attr(n, 'translate') === 'no' || (n.tagName !== 'html' && attr(n, 'lang') !== undefined);
const isProtected = (n) => PROTECT_TAGS.has(n.tagName) || attr(n, 'translate') === 'no' || attr(n, 'lang') !== undefined || /%[A-Z_]+%/.test(textOf(n));

function cloneShallow(n) {
  return { nodeName: n.nodeName, tagName: n.tagName, attrs: n.attrs.map((a) => ({ ...a })), namespaceURI: n.namespaceURI, childNodes: [], parentNode: null };
}
function cloneDeep(n) {
  if (n.nodeName === '#text') return { nodeName: '#text', value: n.value, parentNode: null };
  if (n.nodeName === '#comment') return { nodeName: '#comment', data: n.data, parentNode: null };
  const c = cloneShallow(n);
  c.childNodes = (n.childNodes ?? []).map((k) => {
    const kc = cloneDeep(k);
    kc.parentNode = c;
    return kc;
  });
  return c;
}

/** The elements that hold words of their own: found from the top, and not looked into once found (their inline
 * elements go into the text as placeholders). */
function collectUnits(root, out) {
  for (const c of [...(root.childNodes ?? [])]) {
    if (!c.tagName || skipped(c)) continue;
    // A heading is one sentence, even when it is all spans (the ones that keep a phrase on a line).
    if (c.childNodes.some((k) => k.nodeName === '#text' && /\S/.test(k.value)) || (/^h[1-6]$/.test(c.tagName) && hasText(c))) out.push(c);
    else collectUnits(c, out);
  }
}

function encode(nodes, els) {
  let s = '';
  let free = false;
  for (const n of nodes) {
    if (n.nodeName === '#text') {
      const t = n.value.replace(/\s+/g, ' ');
      s += escText(t);
      if (/\p{L}/u.test(t.replace(MARK, ''))) free = true;
    } else if (n.tagName) {
      const id = els.length;
      if (!hasText(n)) {
        els.push({ node: n, kind: 'empty' });
        s += `<${id}/>`;
      } else if (isProtected(n)) {
        els.push({ node: n, kind: 'keep' });
        s += `<${id}>${escText(textOf(n).replace(/\s+/g, ' ').trim())}</${id}>`;
      } else {
        els.push({ node: n, kind: 'inline' });
        const r = encode(n.childNodes, els);
        s += `<${id}>${r.s}</${id}>`;
        free ||= r.free;
      }
    } else {
      els.push({ node: n, kind: 'empty' });
      s += `<${els.length - 1}/>`;
    }
  }
  return { s, free };
}

/** The text of a unit: [key, elements, first, last] (the children from first to last are what the key holds, and
 * an icon or a space before or after them stays where it is), or null for one with nothing to translate. */
function unitOf(c) {
  const kids = c.childNodes;
  const bearing = (k) => (k.nodeName === '#text' ? /\S/.test(k.value) : k.tagName ? hasText(k) : false);
  const a = kids.findIndex(bearing);
  const b = kids.findLastIndex(bearing);
  if (a < 0) return null;
  const els = [];
  const { s, free } = encode(kids.slice(a, b + 1), els);
  const key = s.trim();
  if (!free || worthless(key)) return null;
  return { key, els, a, b };
}

/** A translation as nodes: text, and the original elements (their attributes) with the translated words inside. */
function decode(str, els) {
  const frames = [{ nodes: [], sink: false }];
  const top = () => frames[frames.length - 1];
  for (const tok of str.split(/(<\/?\d+\/?>)/)) {
    const m = /^<(\/)?(\d+)(\/)?>$/.exec(tok);
    if (!m) {
      if (tok && !top().sink) top().nodes.push({ nodeName: '#text', value: unescText(tok), parentNode: null });
      continue;
    }
    const [, closing, id, selfClosing] = m;
    if (closing) {
      if (frames.length > 1) {
        const f = frames.pop();
        if (f.owner) {
          f.owner.childNodes = f.nodes;
          for (const k of f.nodes) k.parentNode = f.owner;
        }
      }
      continue;
    }
    const el = els[Number(id)];
    if (!el) continue;
    if (top().sink) {
      if (!selfClosing) frames.push({ nodes: [], sink: true });
      continue;
    }
    if (selfClosing || el.kind !== 'inline') {
      top().nodes.push(cloneDeep(el.node));
      if (!selfClosing) frames.push({ nodes: [], sink: true });
    } else {
      const owner = cloneShallow(el.node);
      top().nodes.push(owner);
      frames.push({ nodes: [], sink: false, owner });
    }
  }
  while (frames.length > 1) {
    const f = frames.pop();
    if (f.owner) f.owner.childNodes = f.nodes;
  }
  return frames[0].nodes;
}

function applyUnit(c, unit, translated) {
  const { a, b, els } = unit;
  const kids = c.childNodes;
  const lead = kids[a].nodeName === '#text' ? kids[a].value.match(/^\s*/)[0] : '';
  const trail = kids[b].nodeName === '#text' ? kids[b].value.match(/\s*$/)[0] : '';
  const nodes = decode(translated, els);
  if (lead) nodes.unshift({ nodeName: '#text', value: lead });
  if (trail) nodes.push({ nodeName: '#text', value: trail });
  kids.splice(a, b - a + 1, ...nodes);
  const fix = (p) => {
    for (const k of p.childNodes ?? []) {
      k.parentNode = p;
      fix(k);
    }
  };
  fix(c);
}

function everyElement(root, fn, all = false) {
  for (const c of root.childNodes ?? []) {
    if (c.tagName) {
      if (!all && attr(c, 'translate') === 'no') continue;
      fn(c);
    }
    everyElement(c, fn, all);
  }
}

/** Calls `fn(key)` for every text of a page that is translated (and puts what it returns in place when it is a
 * string): the words of every element, the attributes title, alt, aria-label and placeholder, the page's meta
 * descriptions and the JSON-LD's description. */
export function translateTree(doc, tr, { lang, url }) {
  const units = [];
  collectUnits(doc, units);
  const found = units.map((c) => ({ c, unit: unitOf(c) })).filter((u) => u.unit);
  for (const { c, unit } of found) {
    const v = tr.get(unit.key);
    if (v !== unit.key) applyUnit(c, unit, v);
  }
  const text = (v) => {
    if (!v || worthless(v.trim())) return null;
    const key = escText(v.replace(/\s+/g, ' ').trim());
    const t = tr.get(key);
    return t === key ? null : unescText(t);
  };
  everyElement(doc, (n) => {
    if (n.tagName === 'script' || n.tagName === 'style') {
      if (n.tagName === 'script' && attr(n, 'type') === 'application/ld+json') ldJson(n, tr, text, { lang, url });
      return;
    }
    if (n.tagName === 'meta') {
      const name = attr(n, 'name') ?? attr(n, 'property');
      if (META_TEXTS.has(name)) {
        const t = text(attr(n, 'content'));
        if (t) setAttr(n, 'content', t);
      }
      return;
    }
    for (const name of ATTRS) {
      const t = text(attr(n, name));
      if (t) setAttr(n, name, t);
    }
  });
  const html = find(doc, (n) => n.tagName === 'html');
  if (html) setAttr(html, 'lang', TAGS[lang]);
}

function ldJson(n, tr, text, { lang, url }) {
  const raw = n.childNodes[0]?.value;
  if (!raw) return;
  const data = JSON.parse(raw);
  const d = text(data.description);
  if (d) data.description = d;
  data.inLanguage = TAGS[lang];
  data.url = SITE + url;
  n.childNodes[0].value = '\n    ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n    ') + '\n  ';
}

export function find(root, fn) {
  for (const c of root.childNodes ?? []) {
    if (c.tagName && fn(c)) return c;
    const r = find(c, fn);
    if (r) return r;
  }
  return null;
}

/** A page under a language's prefix finds every asset: references beside the page (img/x.webp, style.css) become
 * root-absolute (/img/x.webp); and links to the docs go to that language's docs where it has the page. */
export function relocate(doc, { prefix, localHref }) {
  const where = { a: ['href'], link: ['href'], script: ['src'], img: ['src', 'srcset'], source: ['src', 'srcset'], video: ['poster', 'src'] };
  const absolute = (v) => !v || /^([a-z][a-z0-9+.-]*:|\/|#|\?)/i.test(v);
  everyElement(doc, (n) => {
    for (const name of where[n.tagName] ?? []) {
      const v = attr(n, name);
      if (v === undefined) continue;
      if (name === 'srcset') setAttr(n, name, v.split(',').map((p) => (absolute(p.trim()) ? p : '/' + p.trim())).join(', '));
      else if (!absolute(v)) setAttr(n, name, '/' + v);
      else if (n.tagName === 'a' && prefix) setAttr(n, name, localHref(v));
    }
  }, true);
}

export const parseHtml = (html) => parse(html);
export const serializeHtml = (doc) => serialize(doc);

/** A link on the English site, as it reads on a page of `lang`: the docs' hub and the guide's topics (which every
 * language has) go to its own pages, the rest of the site (the other documents, /compare) stays. */
export function localHref(href, lang, guideSlugs) {
  if (lang === 'en') return href;
  if (href === '/') return `/${lang}/`;
  const m = /^\/docs\/?(?:([a-z0-9-]+)\/?)?(#.*)?$/.exec(href);
  if (!m) return href;
  if (!m[1]) return `/${lang}/docs/${m[2] ?? ''}`;
  return guideSlugs.has(m[1]) ? `/${lang}/docs/${m[1]}${m[2] ?? ''}` : href;
}

/* ---------- What every page says about its languages ---------- */

/** Where the same English page is in another language. */
export const pathIn = (lang, enPath) => (lang === 'en' ? enPath : `/${lang}${enPath}`);

/** canonical, the alternates (every language that has the page, and x-default: English), Open Graph's locale, and
 * the Greek font where the page is Greek. `alternates` is a list of language ids, or null for a page of one language. */
export function headLinks({ lang, langs, enPath, alternates }) {
  const greek = '<link rel="preload" href="/fonts/inter-greek-wght-normal.woff2" as="font" type="font/woff2" crossorigin />';
  // No address (the 404 page): nothing to name, only the font.
  if (enPath == null) return lang === 'el' ? greek : '';
  const url = pathIn(lang, enPath);
  const out = [`<link rel="canonical" href="${SITE}${url}" />`];
  if (alternates) {
    for (const l of langs) out.push(`<link rel="alternate" hreflang="${TAGS[l.id]}" href="${SITE}${pathIn(l.id, enPath)}" />`);
    out.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${enPath}" />`);
  }
  out.push(`<meta property="og:locale" content="${OG_LOCALES[lang]}" />`);
  if (alternates) for (const l of langs) if (l.id !== lang) out.push(`<meta property="og:locale:alternate" content="${OG_LOCALES[l.id]}" />`);
  if (lang === 'el') out.push(greek);
  return out.join('\n  ');
}

/** The script at the top of every English page that has translated pages: the language saved with the switcher
 * (localStorage "hydor.lang") or else the first of the browser's languages that the site has, and if that is not
 * English, the same page in it, with its query and hash. Pages under a prefix have none, so a link to /fr/ shows
 * French. The same text on every page, so the Content-Security-Policy needs one hash. */
export const detectScript = (langs) =>
  `(function(){try{var L=${JSON.stringify(langs.filter((l) => l.id !== 'en').map((l) => l.id))},s=null,l=null;` +
  `try{s=localStorage.getItem('hydor.lang')}catch(e){}` +
  `if(s==='en'||L.indexOf(s)>=0)l=s;else{var a=navigator.languages&&navigator.languages.length?navigator.languages:[navigator.language];` +
  `for(var i=0;i<a.length;i++){var b=String(a[i]||'').toLowerCase().split('-')[0];if(b==='en'||L.indexOf(b)>=0){l=b;break}}}` +
  `if(l&&l!=='en')location.replace('/'+l+location.pathname+location.search+location.hash)}catch(e){}})()`;

/** The language menu: a native <details>, so it opens and closes without script (main.js adds Escape, the arrow keys
 * and saving the choice), with a link to the same page in each language (its home, where the page has no
 * counterpart: enPath null). The icons are inline: the 404 page has no sprite. */
export function switcher({ lang, langs, enPath, T }) {
  const cur = langs.find((l) => l.id === lang);
  const href = (id) => (enPath == null ? (id === 'en' ? '/' : `/${id}/`) : pathIn(id, enPath));
  const items = langs
    .map((l) => `<li><a href="${href(l.id)}" lang="${TAGS[l.id]}" hreflang="${TAGS[l.id]}" data-lang="${l.id}"${l.id === lang ? ' aria-current="true"' : ''}>${esc(l.name)}</a></li>`)
    .join('');
  const label = T('Language: {name}', { name: cur.name });
  return (
    `<details class="lang" data-lang-menu><summary aria-label="${esc(label)}">` +
    '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.8"/><path d="M3.2 12h17.6M12 3.2c2.4 2.5 3.6 5.4 3.6 8.8s-1.2 6.3-3.6 8.8c-2.4-2.5-3.6-5.4-3.6-8.8S9.6 5.7 12 3.2z"/></svg>' +
    `<span class="lang-name">${esc(cur.name)}</span>` +
    '<svg class="ic lang-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>' +
    `</summary><ul>${items}</ul></details>`
  );
}

/** The texts main.js and the docs' search read, as JSON in the page (a data block: the Content-Security-Policy
 * does not run it). */
export const dataBlock = (data) => `<script type="application/json" id="hydor-i18n">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

/** The strings in a source file's T('…') and TH('…', […]) calls, in order. */
export function scanCalls(src, file = 'source') {
  const keys = [];
  const call = /(?<![\w$.])TH?\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  for (const m of src.matchAll(call)) keys.push(Function(`return ${m[1]}`)());
  const loose = /(?<![\w$.])TH?\(\s*(?!['"\s])/g;
  for (const m of src.matchAll(loose)) {
    const line = src.slice(0, m.index).split('\n').length;
    throw new Error(`${file}:${line}: T() or TH() wants a string in quotes first, so the text can be extracted`);
  }
  return keys;
}

/** A date from CHANGELOG.md ("4 November 2026") as the language writes dates. */
export function formatDate(text, lang) {
  const t = Date.parse(`${text} UTC`);
  if (Number.isNaN(t)) return text;
  return new Intl.DateTimeFormat(TAGS[lang], { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(t));
}

/** Words in a list of keys, without placeholders: roughly what a translator reads. */
export const wordCount = (keys) => keys.reduce((n, k) => n + (k.replace(MARK, ' ').match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? []).length, 0);
