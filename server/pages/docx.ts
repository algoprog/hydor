// A saved page as a Word document. The page opens in the capture browser as it opens in Pages (its scripts
// run, its data shows); a function run inside it reads what it shows, in reading order, as simple blocks
// (headings, paragraphs, list items, tables, code, rules) and finds the parts that are pictures (images,
// drawings, canvases, videos, charts made of boxes); each picture is taken as a screenshot, and the blocks
// and pictures become a .docx that Word, LibreOffice and Google Docs open as it is. Node built-ins only.
//
// The functions that read the page run in the browser, not here: their source is sent as text
// (Function#toString), so each uses only the browser's own globals.
//
// docxFile also writes the documents of Pages (docs.ts gives it their blocks): those add page breaks, checklists,
// highlights, sizes and fonts of words, a title and subtitle of their own, pictures aligned and captioned, tables'
// columns' widths, filled and merged cells, line and paragraph spacing, callouts (shaded paragraphs), equations
// (Word's own, OMML, where they convert), a table of contents Word fills in, a header and footer with the page's
// number, comments with their replies (Word's own), suggested changes as tracked changes (words inserted and deleted,
// formatting changed, paragraphs broken and joined, pictures and tables' rows added or taken out, each with who made it
// and when), and the document's own paper, margins, font and sizes.
import { withTab, type Tab } from '../capture/index.ts';
import { scriptSafe } from './kit.ts';
import { ommlOf } from './omml.ts';
import { XML_HEAD, coreXml, esc, imageSize, relsXml, zipParts, type ZipPart } from './ooxml.ts';

export interface DocRun {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  code?: boolean;
  /** #rrggbb, only when it differs clearly from the body text colour. */
  color?: string;
  /** http(s) and mailto only. */
  link?: string;
  sup?: boolean;
  sub?: boolean;
  /** A line break before t. */
  br?: boolean;
  /** #rrggbb behind the words. */
  hl?: string;
  /** Points. */
  size?: number;
  font?: string;
  /** Maths among the words: `t` is its LaTeX (written as Word's equation where it converts). */
  math?: boolean;
  /** The comments on these words, by their ids (the file's `comments`). */
  cm?: string[];
  /** A tracked change: these words inserted, or deleted. */
  rev?: DocRev;
  /** A tracked change of their formatting: who, when, and how they looked before. */
  fmtRev?: { author: string; at: number; was: DocLookOf };
}

/** A tracked change: inserted or deleted, by whom (a name) and when (ms since 1970). */
export interface DocRev {
  kind: 'ins' | 'del';
  author: string;
  at: number;
}

/** How words looked, for a tracked change of their formatting. */
export type DocLookOf = Pick<DocRun, 'b' | 'i' | 'u' | 's' | 'code' | 'sup' | 'sub' | 'color' | 'hl' | 'size' | 'font'>;

type Jc = 'center' | 'right' | 'justify';

/** A paragraph's own spacing: lines, and points before and after. */
export interface DocSpace {
  line?: number;
  before?: number;
  after?: number;
}

export interface DocCell {
  runs: DocRun[];
  head?: boolean;
  span?: number;
  align?: Jc;
  /** #rrggbb behind it. */
  fill?: string;
  va?: 'center' | 'bottom';
  /** Merged down: the first of the cells (restart), or one under it (cont). */
  vm?: 'restart' | 'cont';
}

// `keep`: an empty one keeps its place (a document's empty lines; a page's are left out). `mark`: a tracked change of
// the paragraph's own mark, its end (inserted: the paragraph was broken there; deleted: it joins the next).
export type DocBlock =
  /** `anchor`: a name a table of contents' line leads to. */
  | { k: 'h'; lvl: 1 | 2 | 3 | 4 | 5 | 6; runs: DocRun[]; align?: Jc; keep?: boolean; space?: DocSpace; anchor?: string; mark?: DocRev }
  /** `style`: the document's title or subtitle; `indent`: steps of half an inch; `shade`: a callout's tint (`icon` its emoji). */
  | { k: 'p'; runs: DocRun[]; align?: Jc; quote?: boolean; style?: 'title' | 'subtitle'; indent?: number; keep?: boolean; space?: DocSpace; shade?: string; icon?: string; mark?: DocRev }
  /** `list`: which list it belongs to (numbering restarts per list); `check`: a checklist's item (ticked: `checked`). */
  | { k: 'li'; ordered: boolean; lvl: number; list: number; runs: DocRun[]; check?: boolean; checked?: boolean; align?: Jc; keep?: boolean; space?: DocSpace; mark?: DocRev }
  | { k: 'pre'; text: string }
  | { k: 'hr' }
  /** A page break. */
  | { k: 'pb' }
  /** `shot`: an index into shots; w and h in CSS pixels, as shown; `rev`: added or taken out as a tracked change. */
  | { k: 'img'; shot: number; w: number; h: number; alt?: string; align?: 'left' | 'center' | 'right'; caption?: string; rev?: DocRev }
  /** `cols`: the columns' widths, as shares of the table's; `rev`: every row added or taken out as a tracked change. */
  | { k: 'table'; rows: { cells: DocCell[] }[]; cols?: number[]; rev?: DocRev }
  /** A table of contents: its lines as Word shows them until it fills it in (its headings' `anchor`s). */
  | { k: 'toc'; entries: { lvl: number; text: string; anchor: string }[] }
  /** An equation on a line of its own, in LaTeX. */
  | { k: 'math'; tex: string };

/** A header or footer of a document's pages: {page} and {pages} in its words are the page's number and how many. */
export interface DocBand {
  text: string;
  align?: 'center' | 'right';
}

/** A comment for the file: who wrote it (by name, when it is someone other than you or an agent), when, what it says, its replies, whether it was resolved. */
export interface DocComment {
  id: string;
  by: 'user' | 'agent';
  author?: string;
  text: string;
  at: number;
  resolved?: boolean;
  replies?: { by: 'user' | 'agent'; author?: string; text: string; at: number }[];
}

/** How a document of Pages looks (its own font and sizes, in points; line spacing as a multiple). */
export interface DocLook {
  font?: string;
  size?: number;
  title?: number;
  subtitle?: number;
  /** Headings 1 to 6. */
  heads?: number[];
  line?: number;
  /** Space after a paragraph. */
  after?: number;
}

export interface Extracted {
  title: string;
  lang: string;
  blocks: DocBlock[];
  /** Where the pictures are, in document coordinates (CSS pixels). */
  shots: { x: number; y: number; w: number; h: number }[];
}

/** The window the page is read in, in CSS pixels (a laptop's), and how many device pixels each takes in the pictures. */
const WIDTH = 900;
const HEIGHT = 1000;
const SCALE = 2;

// ---- In the page --------------------------------------------------------------------------------

/**
 * Before the page is read: closed details opened, lazy pictures loaded, panes that scroll inside the page let
 * out into it (so all of it can be read and pictured), the page scrolled through once (what appears as it is
 * scrolled to appears), the fonts in, and animations at their end.
 */
async function prepare(): Promise<number> {
  const waits: Promise<unknown>[] = [];
  const later = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
  try {
    for (const d of Array.from(document.querySelectorAll('details'))) d.open = true;
    for (const f of Array.from(document.querySelectorAll('iframe[loading=lazy]'))) f.setAttribute('loading', 'eager');
    for (const img of Array.from(document.images)) {
      const lazy = img.loading === 'lazy';
      if (lazy) img.loading = 'eager';
      if (!img.complete || (lazy && !img.naturalWidth))
        waits.push(
          new Promise((ok) => {
            img.addEventListener('load', ok, { once: true });
            img.addEventListener('error', ok, { once: true });
          }),
        );
    }
    const all = document.querySelectorAll('body *');
    if (all.length < 30000) {
      // A page held in a box fixed to the window scrolls inside it: in the page's flow instead, it has a length.
      const words = (document.body?.innerText || '').length;
      for (const el of Array.from(all) as HTMLElement[])
        if (getComputedStyle(el).position === 'fixed' && words && (el.innerText || '').length >= words / 2) el.style.setProperty('position', 'absolute', 'important');
      for (const el of Array.from(all) as HTMLElement[]) {
        if (/^(textarea|select|input|pre|code)$/.test(el.localName) || el.scrollHeight <= el.clientHeight + 4) continue;
        const s = getComputedStyle(el);
        if (!/auto|scroll/.test(s.overflowY)) continue;
        el.style.setProperty('overflow', 'visible', 'important');
        el.style.setProperty('height', 'auto', 'important');
        el.style.setProperty('max-height', 'none', 'important');
      }
    }
    // A page laid out as an app (its body a window's height, its overflow cut): its whole length, as a document has.
    for (const el of [document.documentElement, document.body]) {
      if (!el || getComputedStyle(el).overflowY === 'visible') continue;
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('height', 'auto', 'important');
    }
    const sc = document.scrollingElement || document.documentElement;
    const step = Math.max(200, Math.round(innerHeight * 0.8));
    for (let y = step, i = 0; y < sc.scrollHeight && i < 60; y += step, i++) {
      sc.scrollTo({ top: y, behavior: 'instant' });
      await later(50);
    }
    sc.scrollTo({ top: 0, behavior: 'instant' });
  } catch {}
  await Promise.race([Promise.all(waits), later(3000)]);
  if (document.fonts) await Promise.race([document.fonts.ready, later(1500)]);
  await later(300);
  try {
    for (const a of document.getAnimations())
      try {
        a.finish();
      } catch {
        try {
          a.pause();
        } catch {}
      }
  } catch {}
  return waits.length;
}

/**
 * Reads the page as it shows. Words become blocks in reading order (grids and rows of cards flattened into a
 * sequence), with their bold, italics, links and colours from the computed styles; pictures become `img` blocks and
 * the rectangles to take them from. Never throws; stops at 5000 blocks, 200 pictures or about twelve seconds. It
 * leaves the page ready for its pictures: what floats or sticks over it hidden, a pale page ground made white.
 */
function extract(): Extracted {
  const MAX_BLOCKS = 5000;
  const MAX_SHOTS = 200;
  const MAX_CHARS = 2_000_000;
  // What goes between two pieces of words once the second one comes: a space, a tab (things side by side), a line break.
  const SPACE = 1;
  const TAB = 2;
  const LINE = 3;
  type Fmt = Omit<DocRun, 't'>;
  type Align = 'center' | 'right' | 'justify';
  type Item = { ordered: boolean; lvl: number; list: number };
  // How blocks inside are taken. flow: as paragraphs. li: as lines of the list item (pictures, tables and lists still
  // stand apart). lines: as lines (a heading, a table cell; no pictures). join: as words (things side by side).
  interface Ctx {
    mode: 'flow' | 'li' | 'lines' | 'join';
    depth: number;
    li?: Item;
    quote?: boolean;
    u?: boolean;
    s?: boolean;
    sup?: boolean;
    sub?: boolean;
    link?: string;
    /** A card that is one big link: its link goes on its heading. */
    hlink?: string;
    /** In a link that leads nowhere outside the page: plain words, without a link's colour. */
    plain?: boolean;
  }
  interface Para {
    runs: DocRun[];
    sep: number;
    li?: Item;
    quote?: boolean;
    align?: Align;
  }
  // What an element holds, counted once: its words, elements, and the kinds of things in it.
  interface Scan {
    t: number;
    n: number;
    heads: boolean;
    struct: boolean;
    pics: boolean;
    ctrls: boolean;
    links: boolean;
    long: boolean;
    brs: boolean;
    boxes: number;
  }

  const t0 = Date.now();
  const blocks: DocBlock[] = [];
  const shots: Extracted['shots'] = [];
  const root = document.documentElement;
  const body = document.body;
  const result = (): Extracted => ({
    title: String(document.title || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300),
    lang: String(root.lang || '')
      .trim()
      .slice(0, 35),
    blocks,
    shots,
  });
  if (!body) return result();
  const overlays: HTMLElement[] = [];
  const pictured: Element[] = [];
  const styles = new Map<Element, CSSStyleDeclaration>();

  try {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const docW = Math.max(root.scrollWidth, body.scrollWidth, root.clientWidth);
    const docH = Math.max(root.scrollHeight, body.scrollHeight, root.clientHeight);
    const SKIP = /^(script|style|template|noscript|head|meta|link|title|base|dialog|audio|map|area|datalist|option|optgroup|param|source|track|rp)$/;
    const PICS = /^(img|svg|canvas|video|iframe|embed|object)$/;
    const STRUCT = /^(p|ul|ol|dl|table|pre|blockquote|hr|figure|details)$/;
    const CTRLS = /^(input|select|textarea|progress|meter|button)$/;
    const MONO = /mono|consolas|courier|menlo|monaco|lucida console|source code|inconsolata|fira code|cascadia|jetbrains|\bhack\b/i;
    const ICONS = /material (icons|symbols)|font ?awesome|icomoon|bootstrap-icons|remixicon|ionicons|glyphicons|feather|lucide|tabler|phosphor|codicon/i;

    const cs = (el: Element) => {
      let s = styles.get(el);
      if (!s) styles.set(el, (s = getComputedStyle(el)));
      return s;
    };
    const rects = new Map<Element, DOMRect>();
    const box = (el: Element) => {
      let r = rects.get(el);
      if (!r) rects.set(el, (r = el.getBoundingClientRect()));
      return r;
    };
    const childrenOf = (el: Element) => Array.from((el.shadowRoot ?? el).childNodes);

    // ---- what is not shown
    const bodyText = (body.innerText || '').length;
    const goneMemo = new Map<Element, boolean>();
    const hidden = (el: Element): boolean => {
      if (el === body) return false;
      if (SKIP.test(el.localName) || el.getAttribute('aria-hidden') === 'true') return true;
      const s = cs(el);
      if (s.display === 'none' || parseFloat(s.opacity) < 0.05) return true;
      if (s.display === 'contents') return false;
      if (!el.getClientRects().length) return true;
      // Put out of sight, left of or above the page.
      const r = box(el);
      if (r.right + sx < 0 || r.bottom + sy < 0) return true;
      // Words for screen readers only: a pixel, cut off.
      if ((r.width <= 1 || r.height <= 1) && (s.overflowX !== 'visible' || s.overflowY !== 'visible' || s.position === 'absolute') && el.localName !== 'hr') return true;
      if (s.position === 'absolute' && /^rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)$/.test(s.clip)) return true;
      // What floats over the page (a toolbar, a banner, a dialog), unless it is the page itself.
      if (s.position === 'fixed' && ((el as HTMLElement).innerText || '').length < bodyText / 2) {
        if (el instanceof HTMLElement) overlays.push(el);
        return true;
      }
      return false;
    };
    const gone = (el: Element) => {
      let g = goneMemo.get(el);
      if (g === undefined) goneMemo.set(el, (g = hidden(el)));
      return g;
    };
    const shown = (el: Element): Element[] => {
      const out: Element[] = [];
      for (const n of childrenOf(el)) {
        if (n.nodeType !== 1) continue;
        const e = n as Element;
        if (e.localName === 'br' || gone(e)) continue;
        if (cs(e).display === 'contents') out.push(...shown(e));
        else out.push(e);
      }
      return out;
    };
    const ownText = (el: Element) => childrenOf(el).some((n) => n.nodeType === 3 && /\S/.test((n as Text).data));

    // ---- colours: kept when they mean something (not greys, not the text's own colour), dark enough for paper
    const pen = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgbOf = (c: string): number[] | null => {
      const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(c);
      if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : m[5] ? +m[4] / 100 : +m[4]];
      if (!pen || !c) return null;
      // Other colour spaces (oklch, color-mix…): as the browser paints them.
      try {
        pen.clearRect(0, 0, 1, 1);
        pen.fillStyle = '#000';
        pen.fillStyle = c;
        pen.fillRect(0, 0, 1, 1);
        const d = pen.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2], d[3] / 255];
      } catch {
        return null;
      }
    };
    let ink: number[] | null = null;
    {
      // The text's own colour: the one most of its words have.
      const tally = new Map<string, number>();
      const w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode() as Text | null, i = 0; n && i < 5000; n = w.nextNode() as Text | null, i++) {
        const p = n.parentElement;
        const len = n.data.trim().length;
        if (!p || !len || SKIP.test(p.localName)) continue;
        const c = cs(p).color;
        tally.set(c, (tally.get(c) || 0) + len);
      }
      let best = cs(body).color;
      let most = 0;
      for (const [c, n] of tally)
        if (n > most) {
          best = c;
          most = n;
        }
      ink = rgbOf(best);
    }
    const lum = (k: number) => {
      const f = k / 255;
      return f <= 0.03928 ? f / 12.92 : ((f + 0.055) / 1.055) ** 2.4;
    };
    const colours = new Map<string, string>();
    const colourOf = (c: string): string => {
      let v = colours.get(c);
      if (v !== undefined) return v;
      v = '';
      const x = rgbOf(c);
      if (x && x[3] >= 0.4) {
        let [r, g, b] = x;
        const far = !ink || Math.hypot(r - ink[0], g - ink[1], b - ink[2]) > 60;
        if (Math.max(r, g, b) - Math.min(r, g, b) >= 40 && far) {
          for (let i = 0; i < 30 && 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b) > 0.2; i++) {
            r *= 0.9;
            g *= 0.9;
            b *= 0.9;
          }
          v = '#' + [r, g, b].map((k) => Math.round(k).toString(16).padStart(2, '0')).join('');
        }
      }
      colours.set(c, v);
      return v;
    };
    const painted = (s: CSSStyleDeclaration) => {
      const bg = rgbOf(s.backgroundColor);
      if ((bg && bg[3] >= 0.1) || /gradient|url\(/.test(s.backgroundImage)) return true;
      return ['top', 'right', 'bottom', 'left'].some(
        (side) =>
          parseFloat(s.getPropertyValue(`border-${side}-width`)) >= 1 &&
          !/none|hidden/.test(s.getPropertyValue(`border-${side}-style`)) &&
          (rgbOf(s.getPropertyValue(`border-${side}-color`))?.[3] ?? 0) > 0.1,
      );
    };

    // ---- text formatting
    const firstFont = (ff: string) => (ff.split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
    const bodyMono = MONO.test(firstFont(cs(body).fontFamily));
    const isCode = (el: Element, s: CSSStyleDeclaration) => (bodyMono ? !!el.closest('code,kbd,samp,tt,pre') : MONO.test(firstFont(s.fontFamily)));
    const linkOf = (a: Element): string => {
      const h = (a as HTMLAnchorElement).href;
      if (typeof h !== 'string' || !/^(https?:|mailto:)/i.test(h) || h.length > 2000) return '';
      try {
        // The page's own address is made up: links within it lead nowhere outside.
        if (new URL(h).origin === location.origin) return '';
      } catch {
        return '';
      }
      return h;
    };
    const fmtOf = (el: Element, s: CSSStyleDeclaration, ctx: Ctx): Fmt => {
      const f: Fmt = {};
      if ((parseInt(s.fontWeight, 10) || 400) >= 600) f.b = true;
      if (s.fontStyle && s.fontStyle !== 'normal') f.i = true;
      if (ctx.u && !ctx.link) f.u = true;
      if (ctx.s) f.s = true;
      if (ctx.sup) f.sup = true;
      else if (ctx.sub) f.sub = true;
      if (isCode(el, s)) f.code = true;
      if (ctx.link) f.link = ctx.link;
      else if (!ctx.plain) {
        const c = colourOf(s.color);
        if (c) f.color = c;
      }
      return f;
    };
    const alignOf = (s: CSSStyleDeclaration): Align | undefined => {
      const a = s.textAlign;
      if (a === 'center' || a === '-webkit-center') return 'center';
      if (a === 'justify') return 'justify';
      if (a === 'right' || a === '-webkit-right' || (a === 'end' && s.direction !== 'rtl') || (a === 'start' && s.direction === 'rtl')) return 'right';
      return undefined;
    };
    const cased = (t: string, tt: string) =>
      tt === 'uppercase' ? t.toUpperCase() : tt === 'lowercase' ? t.toLowerCase() : tt === 'capitalize' ? t.replace(/(^|[\s(“"'-])(\p{Ll})/gu, (_m, a: string, b: string) => a + b.toUpperCase()) : t;
    // Decorations, raised and lowered text, and links reach everything inside the element.
    const withFmt = (el: Element, s: CSSStyleDeclaration, ctx: Ctx): Ctx => {
      const name = el.localName;
      const l = name === 'a' && !ctx.link ? linkOf(el) : '';
      // A link to a place in the page, or to its script, leads nowhere in a document: plain words.
      const dead = name === 'a' && !l && el.hasAttribute('href');
      // A whole card that is a link: the link goes on its heading, not on every word in it.
      const card = !!l && !/^inline/.test(s.display) && (scan(el).heads || scan(el).struct);
      // A dotted or wavy line under words is a hint (an abbreviation's meaning), not an underline.
      const deco = dead || card || /dotted|dashed|wavy/.test(s.textDecorationStyle || '') ? '' : s.textDecorationLine || '';
      const up = s.verticalAlign === 'super' || name === 'sup';
      const down = s.verticalAlign === 'sub' || name === 'sub';
      const u = !!ctx.u || deco.includes('underline');
      const st = !!ctx.s || deco.includes('line-through');
      const sup = up ? true : down ? false : !!ctx.sup;
      const sub = down ? true : up ? false : !!ctx.sub;
      const plain = !!ctx.plain || dead || card;
      const link = l && !card ? l : ctx.link;
      const hlink = card ? l : ctx.hlink;
      if (u === !!ctx.u && st === !!ctx.s && sup === !!ctx.sup && sub === !!ctx.sub && link === ctx.link && hlink === ctx.hlink && plain === !!ctx.plain) return ctx;
      return { ...ctx, u, s: st, sup, sub, link, hlink, plain };
    };

    // ---- what an element holds
    const scans = new Map<Element, Scan>();
    const scan = (el: Element): Scan => {
      let sc = scans.get(el);
      if (sc) return sc;
      sc = { t: 0, n: 0, heads: false, struct: false, pics: false, ctrls: false, links: false, long: false, brs: false, boxes: 0 };
      scans.set(el, sc);
      for (const c of childrenOf(el)) {
        if (c.nodeType === 3) {
          const len = (c as Text).data.replace(/\s+/g, ' ').trim().length;
          sc.t += len;
          if (len > 40) sc.long = true;
          continue;
        }
        if (c.nodeType !== 1) continue;
        const e = c as Element;
        if (gone(e)) continue;
        const name = e.localName;
        if (name === 'br') {
          sc.brs = true;
          continue;
        }
        sc.n++;
        if (/^h[1-6]$/.test(name) || e.getAttribute('role') === 'heading') sc.heads = true;
        if (STRUCT.test(name)) sc.struct = true;
        if (CTRLS.test(name) || e.getAttribute('role') === 'button') sc.ctrls = true;
        if (PICS.test(name) || e.getAttribute('role') === 'img') {
          const r = box(e);
          if (r.width >= 24 && r.height >= 24) sc.pics = true;
          continue;
        }
        if (name === 'a' && linkOf(e)) sc.links = true;
        const k = scan(e);
        sc.t += k.t;
        sc.n += k.n;
        sc.boxes += k.boxes + (paintBox(e, k) ? 1 : 0);
        sc.heads ||= k.heads;
        sc.struct ||= k.struct;
        sc.pics ||= k.pics;
        sc.ctrls ||= k.ctrls;
        sc.links ||= k.links;
        sc.long ||= k.long;
        sc.brs ||= k.brs;
        if (sc.n > 5000) break;
      }
      return sc;
    };
    // A box drawn on the page (a bar, a cell of a heat map, a dot of a legend): painted, with no words of its own
    // beyond a small label on it (a tag is its words, and does not count).
    const paintBox = (e: Element, k: Scan) => {
      if (k.t > 6 || k.heads || k.struct || k.pics || k.ctrls) return false;
      const r = box(e);
      if (r.width < 2 || r.height < 2 || r.width * r.height < 12) return false;
      const s = cs(e);
      if (!painted(s)) return false;
      const fs = parseFloat(s.fontSize) || 14;
      return k.t * fs * fs * 0.6 <= 0.25 * r.width * r.height;
    };
    // A picture made of boxes (a bar chart of divs, a calendar, a progress board): three boxes or more, and only
    // short labels for words.
    const boxPicture = (el: Element) => {
      const k = scan(el);
      if (k.boxes < 3 || k.heads || k.struct || k.pics || k.ctrls || k.links || k.long || k.n > 3000) return false;
      if (k.t > Math.max(24, k.boxes * 12) || k.t > 600) return false;
      const r = box(el);
      return r.width >= 60 && r.height >= 30;
    };
    // A picture set as a background, with nothing written over it.
    const bgPicture = (el: Element, s: CSSStyleDeclaration) => {
      if (!/url\(/.test(s.backgroundImage) || (!/cover|contain/.test(s.backgroundSize) && !/no-repeat/.test(s.backgroundRepeat))) return false;
      const k = scan(el);
      const r = box(el);
      return !k.t && !k.pics && !k.ctrls && r.width >= 48 && r.height >= 48;
    };
    const sameRow = (els: Element[]) => {
      const first = els.length ? box(els[0]) : null;
      return (
        !!first &&
        els.every((e) => {
          const r = box(e);
          return r.top < first.bottom - 1 && r.bottom > first.top + 1;
        })
      );
    };
    const isRow = (el: Element) => /flex|grid/.test(cs(el).display) && sameRow(shown(el));
    // Shows as one line of words: no headings, paragraphs or pictures, and anything block-like in it set side by side.
    const lineMemo = new Map<Element, boolean>();
    const oneLine = (el: Element): boolean => {
      let v = lineMemo.get(el);
      if (v !== undefined) return v;
      lineMemo.set(el, false);
      const k = scan(el);
      v = !(k.heads || k.struct || k.pics || k.brs || k.t > 150 || k.n > 40);
      if (v) {
        const kids = shown(el);
        const row = /flex|grid/.test(cs(el).display) && sameRow(kids);
        v = kids.every((c) => (row || /^inline|^ruby/.test(cs(c).display)) && oneLine(c));
      }
      lineMemo.set(el, v);
      return v;
    };
    const isTick = (e: Element | null) => !!e && e.localName === 'input' && /^(checkbox|radio)$/.test((e as HTMLInputElement).type);
    const tick = (e: Element) => {
      const on = (e as HTMLInputElement).checked;
      return (e as HTMLInputElement).type === 'radio' ? (on ? '◉' : '○') : on ? '☑' : '☐';
    };
    // Things side by side that read as one line (a label and its value, a row of figures): their words in one paragraph.
    const rowOf = (el: Element, s: CSSStyleDeclaration): Element[] | null => {
      if (!/flex|grid/.test(s.display) || ownText(el)) return null;
      const kids = shown(el);
      if (kids.length < 2 || kids.length > 12 || !sameRow(kids)) return null;
      const k = scan(el);
      if (!k.t || k.t > 300) return null;
      // A row of fields reads better a field a line.
      if (kids.filter((c) => CTRLS.test(c.localName) || scan(c).ctrls).length > 1) return null;
      return kids.every(oneLine) ? kids : null;
    };
    // A small stack of one-line blocks set close together (a figure's label, value and change): one paragraph, a line
    // each. Words written straight in the element, with what is inline beside them, make a line of their own.
    const stackOf = (el: Element): Node[][] | null => {
      if (/^(p|li|td|th|h[1-6]|blockquote|pre|summary)$/.test(el.localName)) return null;
      const k = scan(el);
      if (k.t > 300 || k.ctrls || k.heads || k.struct || k.pics || k.brs) return null;
      const items: Node[][] = [];
      let line: Node[] | null = null;
      for (const n of childrenOf(el)) {
        if (n.nodeType === 3) {
          if (line) line.push(n);
          else if (/\S/.test((n as Text).data)) items.push((line = [n]));
          continue;
        }
        if (n.nodeType !== 1 || gone(n as Element)) continue;
        const e = n as Element;
        const d = cs(e).display;
        if (d === 'contents' || !oneLine(e)) return null;
        if (/^inline|^ruby/.test(d)) {
          if (line) line.push(e);
          else items.push((line = [e]));
          continue;
        }
        line = null;
        items.push([e]);
      }
      if (items.length < 2 || items.length > 6) return null;
      let prev: DOMRect | null = null;
      for (const item of items) {
        const first = item[0];
        let r: DOMRect;
        if (item.length === 1 && first.nodeType === 1 && !/^inline/.test(cs(first as Element).display)) r = box(first as Element);
        else {
          const range = document.createRange();
          range.setStartBefore(first);
          range.setEndAfter(item[item.length - 1]);
          r = range.getBoundingClientRect();
        }
        const fs = parseFloat(cs(first.nodeType === 1 ? (first as Element) : el).fontSize) || 14;
        if (prev && (r.top < prev.bottom - 1 || r.top - prev.bottom > Math.max(6, 0.5 * fs))) return null;
        prev = r;
      }
      return items;
    };
    // A short mark beside what it marks (an option's letter, a step's number, an emoji): it goes before the first words there.
    const markOf = (el: Element, s: CSSStyleDeclaration): Element | null => {
      if (!/flex|grid/.test(s.display) || ownText(el)) return null;
      const kids = shown(el);
      if (kids.length < 2 || kids[0].parentNode !== (el.shadowRoot ?? el) || !sameRow(kids.slice(0, 2))) return null;
      const k = scan(kids[0]);
      return k.t >= 1 && k.t <= 4 && !k.ctrls && !k.pics && oneLine(kids[0]) && !oneLine(kids[1]) ? kids[0] : null;
    };

    // ---- the paragraph being written
    let cur: Para = { runs: [], sep: 0 };
    // A mark waiting for the words it marks (markOf).
    let lead: DocRun[] | null = null;
    let chars = 0;
    let lists = 0;
    const halt = () => blocks.length >= MAX_BLOCKS || chars > MAX_CHARS || Date.now() - t0 > 12_000;
    const push = (b: DocBlock) => {
      if (blocks.length >= MAX_BLOCKS) return;
      if (b.k === 'hr' && (!blocks.length || blocks[blocks.length - 1].k === 'hr')) return;
      blocks.push(b);
    };
    const same = (a: Fmt, b: Fmt) => a.b === b.b && a.i === b.i && a.u === b.u && a.s === b.s && a.code === b.code && a.color === b.color && a.link === b.link && a.sup === b.sup && a.sub === b.sub;
    const trimEnd = (runs: DocRun[]) => {
      while (runs.length) {
        const r = runs[runs.length - 1];
        r.t = r.t.replace(/[ \t]+$/, '');
        if (r.t) return;
        runs.pop();
      }
    };
    const sep = (k: number) => {
      if (k > cur.sep) cur.sep = k;
    };
    const add = (raw: string, f: Fmt, ctx: Ctx, collapse: boolean, align?: Align) => {
      if (!raw || halt()) return;
      let t = raw;
      const runs = cur.runs;
      if (!runs.length) {
        // A paragraph starts with words.
        if (collapse) t = t.replace(/^\s+/, '');
        if (!/\S/.test(t)) return;
        cur.sep = 0;
        cur.li = ctx.li;
        cur.quote = ctx.quote;
        cur.align = align;
        if (lead) runs.push(...lead);
        lead = null;
        runs.push({ t, ...f });
        chars += t.length;
        return;
      }
      let br = false;
      if (cur.sep) {
        // The separator stands for the spaces between.
        if (!/\S/.test(t)) return;
        if (collapse) t = t.replace(/^\s+/, '');
        if (cur.sep === LINE) {
          trimEnd(runs);
          br = true;
        } else if (cur.sep === TAB) {
          trimEnd(runs);
          t = '\t' + t;
        } else if (!/[\s([{«“‘]$/.test(runs[runs.length - 1].t) && !/^[\s.,;:!?)\]}%»”’]/.test(t)) t = ' ' + t;
        cur.sep = 0;
      } else if (collapse && /[ \t]$/.test(runs[runs.length - 1].t)) {
        t = t.replace(/^ +/, '');
        if (!t) return;
      }
      const last = runs[runs.length - 1];
      if (!br && last && same(last, f)) last.t += t;
      else runs.push(br ? { t, ...f, br: true } : { t, ...f });
      chars += t.length;
    };
    const finish = (runs: DocRun[]) => {
      trimEnd(runs);
      return runs.some((r) => /\S/.test(r.t)) ? runs : [];
    };
    const flush = () => {
      const p = cur;
      cur = { runs: [], sep: 0 };
      const runs = finish(p.runs);
      if (!runs.length) return;
      if (p.li) return push({ k: 'li', ordered: p.li.ordered, lvl: p.li.lvl, list: p.li.list, runs });
      const b: Extract<DocBlock, { k: 'p' }> = { k: 'p', runs };
      if (p.align) b.align = p.align;
      if (p.quote) b.quote = true;
      push(b);
    };
    /** The runs written since the last flush, for a heading or a cell. */
    const take = () => {
      const runs = finish(cur.runs);
      cur = { runs: [], sep: 0 };
      return runs;
    };
    const boundary = (ctx: Ctx) => (ctx.mode === 'flow' ? flush() : sep(ctx.mode === 'join' ? SPACE : LINE));
    const newline = (ctx: Ctx) => {
      if (ctx.mode === 'join') return sep(SPACE);
      // Two breaks in running text end the paragraph, as a blank line does.
      if (ctx.mode === 'flow' && cur.sep === LINE) return flush();
      sep(LINE);
    };

    // ---- pictures
    const visible = (el: Element) => {
      const b = el.getBoundingClientRect();
      let x1 = b.left + sx;
      let y1 = b.top + sy;
      let x2 = b.right + sx;
      let y2 = b.bottom + sy;
      // Only the part its scrolling or cut-off containers show.
      for (let p = el.parentElement; p && p !== root && p !== body; p = p.parentElement) {
        const s = cs(p);
        if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
        const r = box(p);
        if (s.overflowX !== 'visible') {
          x1 = Math.max(x1, r.left + sx);
          x2 = Math.min(x2, r.right + sx);
        }
        if (s.overflowY !== 'visible') {
          y1 = Math.max(y1, r.top + sy);
          y2 = Math.min(y2, r.bottom + sy);
        }
      }
      x1 = Math.max(0, x1);
      y1 = Math.max(0, y1);
      x2 = Math.min(docW, x2);
      y2 = Math.min(docH, y2);
      if (x2 - x1 < 1 || y2 - y1 < 1) return null;
      const x = Math.floor(x1);
      const y = Math.floor(y1);
      return { x, y, w: Math.ceil(x2) - x, h: Math.ceil(y2) - y };
    };
    const altOf = (el: Element) =>
      el.getAttribute('alt') ?? el.getAttribute('aria-label') ?? (el.localName === 'svg' ? (el.querySelector('title')?.textContent ?? '') : (el.getAttribute('title') ?? ''));
    const picture = (el: Element, ctx: Ctx, alt: string): boolean => {
      if ((ctx.mode !== 'flow' && ctx.mode !== 'li') || shots.length >= MAX_SHOTS || halt()) return false;
      const s = cs(el);
      // Decoration laid behind the page.
      if (s.pointerEvents === 'none' && /absolute|fixed/.test(s.position)) return false;
      const r = visible(el);
      if (!r || r.w < 24 || r.h < 24) return false;
      flush();
      shots.push(r);
      pictured.push(el);
      const b: Extract<DocBlock, { k: 'img' }> = { k: 'img', shot: shots.length - 1, w: r.w, h: r.h };
      const a = alt.replace(/\s+/g, ' ').trim().slice(0, 500);
      if (a) b.alt = a;
      push(b);
      return true;
    };

    // ---- the parts of a page
    const kids = (el: Element, ctx: Ctx) => {
      for (const n of childrenOf(el)) {
        if (halt()) return;
        walk(n, ctx);
      }
    };
    // What a heading, a cell or a list item holds; things set side by side in it are words of one line.
    const content = (el: Element, ctx: Ctx) => kids(el, ctx.mode !== 'flow' && isRow(el) ? { ...ctx, mode: 'join' } : ctx);

    const textOf = (n: Text, ctx: Ctx) => {
      const el = n.parentElement;
      if (!el) return;
      const s = cs(el);
      if (s.visibility !== 'visible' || parseFloat(s.fontSize) < 1 || ICONS.test(s.fontFamily)) return;
      // Icon fonts draw their pictures from the private use area.
      let t = n.data.replace(/[\uE000-\uF8FF]/g, '');
      if (!t) return;
      const wc = s.getPropertyValue('white-space-collapse');
      const keepSpaces = wc ? /^(preserve|break-spaces|preserve-spaces)$/.test(wc) : /^(pre|pre-wrap|break-spaces)$/.test(s.whiteSpace);
      const keepLines = keepSpaces ? wc !== 'preserve-spaces' : wc ? wc === 'preserve-breaks' : s.whiteSpace === 'pre-line';
      t = t.replace(/\r\n?/g, '\n');
      if (!keepSpaces) t = t.replace(keepLines ? /[ \t\f]+/g : /[ \t\n\f]+/g, ' ');
      else if (!keepLines) t = t.replace(/\n/g, ' ');
      t = cased(t, s.textTransform);
      const f = fmtOf(el, s, ctx);
      const al = alignOf(s);
      if (!keepLines || !t.includes('\n')) return add(t, f, ctx, !keepSpaces, al);
      t.split('\n').forEach((line, i) => {
        if (i) newline(ctx);
        add(line, f, ctx, !keepSpaces, al);
      });
    };

    const control = (el: Element, ctx: Ctx) => {
      const name = el.localName;
      let val = '';
      let mark = '';
      if (name === 'input') {
        const inp = el as HTMLInputElement;
        if (/^(hidden|submit|button|reset|image|file)$/.test(inp.type)) return;
        if (isTick(el)) mark = tick(el);
        else val = inp.type === 'password' ? (inp.value ? '••••••••' : '') : inp.value;
      } else if (name === 'select')
        val = Array.from((el as HTMLSelectElement).selectedOptions)
          .map((o) => (o.label || o.text || '').trim())
          .filter(Boolean)
          .join(', ');
      else if (name === 'textarea') val = (el as HTMLTextAreaElement).value;
      else if (name === 'progress') {
        const p = (el as HTMLProgressElement).position;
        val = p >= 0 ? `${Math.round(p * 100)}%` : '';
      } else if (name === 'meter') val = String((el as HTMLMeterElement).value);
      if (!mark && !val) return;
      const inLabel = !!el.closest('label');
      // Its label, when the label is not around it (then the label's own words come with it).
      const outer = Array.from((el as HTMLInputElement).labels || [])
        .filter((l) => !l.contains(el) && !gone(l))
        .map((l) => (l.innerText || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 300);
      const label = outer || (inLabel ? '' : (el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 300));
      const own = !inLabel && !/^inline/.test(cs(el).display);
      if (own) boundary(ctx);
      if (mark) add(label ? `${mark} ${label}` : `${mark} `, {}, ctx, true);
      else {
        const before = cur.runs.map((r) => r.t).join('');
        const head = label ? (/[:：]\s*$/.test(label) ? `${label} ` : `${label}: `) : inLabel && /\S/.test(before) && !/[:：?]\s*$/.test(before) ? ': ' : ' ';
        // "Notes: …", not "Notes : …".
        if (head === ': ') trimEnd(cur.runs);
        val
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .forEach((line, i) => {
            if (i) newline(ctx);
            add(i ? line : head + line, {}, ctx, true);
          });
      }
      if (own) boundary(ctx);
    };

    // A button is left out, unless it is a card or choice that holds what the page says.
    const isButton = (el: Element) => {
      const name = el.localName;
      const role = el.getAttribute('role');
      const plainLink = name === 'a' && !linkOf(el) && /\b(btn|button)\b/i.test(el.getAttribute('class') || '');
      if (!(name === 'button' || role === 'button' || role === 'switch' || plainLink || (name === 'input' && /^(submit|button|reset|image)$/.test((el as HTMLInputElement).type)))) return false;
      if (el.hasAttribute('data-choice')) return false;
      const k = scan(el);
      return !(k.heads || k.struct || k.pics) && k.t <= 60;
    };

    const heading = (el: Element, ctx: Ctx) => {
      if (ctx.mode !== 'flow') {
        boundary(ctx);
        content(el, ctx);
        boundary(ctx);
        return;
      }
      flush();
      content(el, { ...ctx, mode: 'lines', li: undefined, quote: false, link: ctx.link || ctx.hlink, hlink: undefined });
      const runs = take();
      if (!runs.length) return;
      const m = /^h([1-6])$/.exec(el.localName);
      const lvl = Math.min(6, Math.max(1, m ? +m[1] : parseInt(el.getAttribute('aria-level') || '2', 10) || 2)) as 1 | 2 | 3 | 4 | 5 | 6;
      push({ k: 'h', lvl, runs });
    };

    const pre = (el: Element, ctx: Ctx) => {
      const text = ((el as HTMLElement).innerText ?? el.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '').slice(0, 200_000);
      if (!/\S/.test(text)) return;
      if (ctx.mode === 'flow' || ctx.mode === 'li') {
        flush();
        push({ k: 'pre', text });
        chars += text.length;
        return;
      }
      boundary(ctx);
      text.split('\n').forEach((line, i) => {
        if (i) sep(LINE);
        add(line, { code: true }, ctx, false);
      });
      boundary(ctx);
    };

    // A table that only lays out a page (one column of headings and paragraphs, or marked as presentation).
    const layoutTable = (el: Element, rows: HTMLTableRowElement[]) => {
      if (/^(presentation|none)$/.test(el.getAttribute('role') || '')) return true;
      if (!rows.length) return true;
      if (rows.some((r) => r.cells.length > 1)) return false;
      return rows.some((r) => {
        const k = r.cells[0] ? scan(r.cells[0]) : null;
        return !!k && (k.heads || k.struct || k.pics);
      });
    };
    const table = (el: HTMLTableElement, ctx: Ctx) => {
      const rows = Array.from(el.rows).filter((r) => !gone(r));
      if (ctx.mode === 'lines' || ctx.mode === 'join') {
        // In a cell or a heading: its rows as lines, its cells apart.
        boundary(ctx);
        for (const tr of rows) {
          boundary(ctx);
          Array.from(tr.cells).forEach((td, i) => {
            if (gone(td)) return;
            if (i) sep(ctx.mode === 'join' ? SPACE : TAB);
            content(td, ctx);
          });
        }
        boundary(ctx);
        return;
      }
      if (layoutTable(el, rows)) {
        boundary(ctx);
        kids(el, ctx);
        boundary(ctx);
        return;
      }
      flush();
      const cap = el.caption;
      if (cap && !gone(cap)) {
        content(cap, { ...ctx, mode: 'lines', li: undefined, quote: false });
        const runs = take();
        if (runs.length) push({ k: 'p', runs: runs.map((r) => ({ ...r, b: true })) });
      }
      const out: Extract<DocBlock, { k: 'table' }>['rows'] = [];
      // Cells reaching down from rows above (rowspan), by column: the rows below get empty cells there.
      const carry: number[] = [];
      for (const tr of rows.slice(0, 2000)) {
        if (halt()) break;
        const cells: Extract<DocBlock, { k: 'table' }>['rows'][number]['cells'] = [];
        let col = 0;
        const fill = () => {
          while ((carry[col] || 0) > 0) {
            carry[col]--;
            cells.push({ runs: [] });
            col++;
          }
        };
        for (const td of Array.from(tr.cells)) {
          if (gone(td) || cells.length >= 63) continue;
          fill();
          content(td, { ...ctx, mode: 'lines', li: undefined, quote: false });
          const cell: (typeof cells)[number] = { runs: take() };
          if (td.localName === 'th' || tr.parentElement?.localName === 'thead') cell.head = true;
          const span = Math.min(63, Math.max(1, td.colSpan || 1));
          const down = Math.min(2000, Math.max(1, td.rowSpan || 1));
          if (span > 1) cell.span = span;
          cells.push(cell);
          if (down > 1) for (let k = 0; k < span; k++) carry[col + k] = down - 1;
          col += span;
        }
        for (let k = col; k < carry.length; k++)
          if ((carry[k] || 0) > 0) {
            while (col < k) {
              cells.push({ runs: [] });
              col++;
            }
            carry[k]--;
            cells.push({ runs: [] });
            col++;
          }
        if (cells.length) out.push({ cells });
      }
      if (out.length) push({ k: 'table', rows: out });
    };

    // Bullets ('b'), numbers ('n'), or no marks at all (a list laid out as cards or a menu).
    const markerOf = (items: Element[]): '' | 'b' | 'n' => {
      const li = items.find((x) => x.localName === 'li');
      if (!li) return '';
      const s = cs(li);
      if (s.display === 'list-item' && (s.listStyleType !== 'none' || s.listStyleImage !== 'none')) {
        const t = s.listStyleType;
        return t === 'none' || /^(disc|circle|square|disclosure-)/.test(t) || /^["']/.test(t) ? 'b' : 'n';
      }
      // Marks of the page's own, drawn before each item.
      const before = getComputedStyle(li, '::before').content || '';
      if (/counter/.test(before)) return 'n';
      if (/^["'][^"']{1,3}["']$/.test(before.trim())) return 'b';
      return '';
    };
    const list = (el: Element, ctx: Ctx) => {
      const items = shown(el);
      const kind = markerOf(items);
      if (ctx.mode === 'lines' || ctx.mode === 'join') {
        let n = 0;
        boundary(ctx);
        for (const li of items) {
          boundary(ctx);
          if (kind) add(kind === 'n' ? `${++n}. ` : '• ', {}, ctx, true);
          content(li, ctx);
        }
        boundary(ctx);
        return;
      }
      if (!kind) {
        boundary(ctx);
        kids(el, ctx);
        boundary(ctx);
        return;
      }
      flush();
      const item: Item = { ordered: kind === 'n', lvl: Math.min(8, ctx.depth), list: ++lists };
      for (const n of childrenOf(el)) {
        if (halt()) break;
        const li = n as Element;
        if (n.nodeType !== 1 || li.localName !== 'li') {
          walk(n, ctx);
          continue;
        }
        if (gone(li)) continue;
        flush();
        content(li, { ...withFmt(li, cs(li), ctx), mode: 'li', depth: item.lvl + 1, li: item, quote: false });
        flush();
      }
    };

    const walk = (n: Node, ctx: Ctx): void => {
      if (halt()) return;
      if (n.nodeType === 3) return textOf(n as Text, ctx);
      if (n.nodeType !== 1) return;
      const el = n as Element;
      const name = el.localName;
      if (name === 'br') return newline(ctx);
      if (name === 'wbr') return;
      if (gone(el)) {
        // A box drawn by its label (the box itself hidden) still says whether it is ticked.
        const label = isTick(el) ? el.closest('label') : null;
        if (label && !gone(label) && /\p{L}{2}/u.test(label.textContent || '')) add(`${tick(el)} `, {}, ctx, true);
        return;
      }
      const s = cs(el);
      const c = withFmt(el, s, ctx);
      if (name === 'label') {
        const ctl = (el as HTMLLabelElement).control;
        if (ctl && !el.contains(ctl)) {
          // Its words go with its field.
          if (!gone(ctl) && !(ctl.localName === 'input' && /^(hidden|submit|button|reset|image|file)$/.test((ctl as HTMLInputElement).type))) return;
          if (isTick(ctl) && /\p{L}{2}/u.test(el.textContent || '')) {
            const block = !/^inline/.test(s.display);
            if (block) boundary(c);
            add(`${tick(ctl)} `, {}, c, true);
            kids(el, c);
            if (block) boundary(c);
            return;
          }
        }
      }
      if (CTRLS.test(name) && name !== 'button') return control(el, c);
      if (isButton(el)) return;
      if (name === 'img') {
        const img = el as HTMLImageElement;
        const alt = (img.getAttribute('alt') || '').trim();
        const ok = img.complete && img.naturalWidth > 0;
        if (ok && picture(el, c, alt)) return;
        // Its words instead: a broken one, one where pictures cannot go (a logo in a heading, an icon in a cell), and a
        // small one among the words that stands for a character (an emoji drawn as an image).
        const big = box(el).width >= 24 && box(el).height >= 24;
        if (alt && (!ok || (big && c.mode === 'lines') || (!big && alt.length <= 8 && !/[a-z]/i.test(alt)))) add(alt, fmtOf(el, s, c), c, true, alignOf(s));
        return;
      }
      if (PICS.test(name)) {
        picture(el, c, altOf(el));
        return;
      }
      if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' && name !== 'math') return;
      if (el.getAttribute('role') === 'img' && picture(el, c, altOf(el))) return;
      if (name === 'math') {
        if (/block/.test(s.display) && picture(el, c, el.getAttribute('alttext') || el.textContent || '')) return;
        return add((el.textContent || '').replace(/\s+/g, ' '), fmtOf(el, s, c), c, true, alignOf(s));
      }
      if (/^h[1-6]$/.test(name) || el.getAttribute('role') === 'heading') return heading(el, c);
      if (name === 'pre') return pre(el, c);
      if (name === 'hr') {
        if (c.mode === 'flow') {
          flush();
          push({ k: 'hr' });
        } else boundary(c);
        return;
      }
      if (name === 'table') return table(el as HTMLTableElement, c);
      if (name === 'ul' || name === 'ol') return list(el, c);
      if (name === 'slot') {
        const assigned = (el as HTMLSlotElement).assignedNodes();
        if (assigned.length) {
          for (const x of assigned) walk(x, c);
          return;
        }
      }
      // Words the browser sets apart with marks of its own (a quotation, a ruby reading): the marks come along.
      if (name === 'q' || name === 'rt') {
        add(name === 'q' ? '“' : '(', fmtOf(el, s, c), c, false);
        kids(el, c);
        add(name === 'q' ? '”' : ')', fmtOf(el, s, c), c, false);
        return;
      }
      const d = s.display;
      if (d === 'contents') return kids(el, c);
      // Inline: part of the paragraph around it (and what is set side by side in it, words of it). A box among the
      // words (a tag, a badge) stands apart from them, as on the page.
      if (/^inline|^ruby/.test(d)) {
        const boxed = /^inline-/.test(d);
        if (boxed) sep(SPACE);
        kids(el, /flex|grid/.test(d) && c.mode !== 'join' ? { ...c, mode: 'join' } : c);
        if (boxed) sep(SPACE);
        return;
      }
      // A block.
      if (c.mode === 'flow' || c.mode === 'li') {
        if ((boxPicture(el) || bgPicture(el, s)) && picture(el, c, altOf(el))) return;
        if (isCode(el, s) && /pre/.test(s.whiteSpace) && (el.textContent || '').includes('\n') && !scan(el).struct) return pre(el, c);
        const row = name === 'blockquote' ? null : rowOf(el, s);
        if (row) {
          boundary(c);
          row.forEach((item, i) => {
            if (i) sep(isTick(row[i - 1]) ? SPACE : TAB);
            walk(item, { ...c, mode: 'join' });
          });
          boundary(c);
          return;
        }
        const stack = c.mode === 'flow' && name !== 'blockquote' ? stackOf(el) : null;
        if (stack) {
          flush();
          for (const item of stack) {
            sep(LINE);
            for (const n of item) walk(n, { ...c, mode: 'lines' });
          }
          flush();
          return;
        }
        const mark = c.mode === 'flow' ? markOf(el, s) : null;
        if (mark) {
          boundary(c);
          walk(mark, { ...c, mode: 'join' });
          const runs = take();
          const words = runs.map((r) => r.t).join('');
          if (runs.length) runs[runs.length - 1] = { ...runs[runs.length - 1], t: runs[runs.length - 1].t + (/^([A-Za-z]|\d{1,2})$/.test(words) ? '. ' : ' ') };
          lead = runs.length ? runs : null;
          for (const n of childrenOf(el)) if (n !== mark) walk(n, c);
          lead = null;
          boundary(c);
          return;
        }
      } else if (isRow(el)) {
        boundary(c);
        kids(el, { ...c, mode: 'join' });
        boundary(c);
        return;
      }
      boundary(c);
      kids(el, name === 'blockquote' && c.mode === 'flow' ? { ...c, quote: true } : c);
      boundary(c);
    };

    walk(body, { mode: 'flow', depth: 0 });
    flush();
    // On paper the pictures sit on white: a page's own pale ground (off-white, cream) turns white behind them. A dark
    // one stays, as what is drawn on it is drawn for it.
    for (const el of [root, body] as HTMLElement[]) {
      const c = rgbOf(cs(el).backgroundColor);
      if (c && c[3] > 0 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 24 && Math.min(c[0], c[1], c[2]) >= 225) el.style.setProperty('background-color', '#fff', 'important');
    }
  } catch {
    // What was read so far is kept.
  }
  // Floating bars and banners would cover the pictures taken next (the page is scrolled to each), and so would bars
  // that stick to the top as it scrolls: those keep their place, unseen, unless a picture is in one.
  for (const el of overlays)
    try {
      el.style.setProperty('display', 'none', 'important');
    } catch {}
  for (const [el, s] of styles)
    try {
      if (s.position === 'sticky' && el instanceof HTMLElement && !pictured.some((p) => el.contains(p))) el.style.setProperty('visibility', 'hidden', 'important');
    } catch {}
  return result();
}

/** The source of the function that reads a page (see `extract`): run as `(${EXTRACT_SRC})()`, it returns Extracted. */
export const EXTRACT_SRC = scriptSafe(extract.toString());
const PREPARE_SRC = scriptSafe(prepare.toString());

// ---- What was read, checked --------------------------------------------------------------------

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown, lo: number, hi: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : def);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** A link's address in the characters an address may have (Word refuses a file whose links have others); '' when it cannot be one. */
function safeUrl(v: unknown): string {
  if (typeof v !== 'string' || !/^(https?:\/\/[^\s/]|mailto:\S)/i.test(v)) return '';
  try {
    const u = v.replace(/[^A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/gu, (c) => encodeURIComponent(c)).replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
    return u.length <= 2048 ? u : '';
  } catch {
    return '';
  }
}

function cleanRuns(v: unknown): DocRun[] {
  const out: DocRun[] = [];
  if (!Array.isArray(v)) return out;
  for (const x of v.slice(0, 4000)) {
    const r = obj(x);
    const run: DocRun = { t: str(r.t, 100_000) };
    for (const k of ['b', 'i', 'u', 's', 'code', 'sup', 'sub', 'br'] as const) if (r[k] === true) run[k] = true;
    if (!run.t && !run.br) continue;
    if (typeof r.color === 'string' && /^#[0-9a-f]{6}$/i.test(r.color)) run.color = r.color;
    if (typeof r.hl === 'string' && /^#[0-9a-f]{6}$/i.test(r.hl)) run.hl = r.hl;
    if (typeof r.size === 'number' && Number.isFinite(r.size) && r.size >= 1 && r.size <= 400) run.size = Math.round(r.size * 2) / 2;
    if (typeof r.font === 'string' && /^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/.test(r.font)) run.font = r.font;
    const link = safeUrl(r.link);
    if (link) run.link = link;
    if (r.math === true) run.math = true;
    if (Array.isArray(r.cm)) {
      const cm = r.cm.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x)).slice(0, 20);
      if (cm.length) run.cm = cm;
    }
    const rev = cleanRev(r.rev);
    if (rev) run.rev = rev;
    const f = obj(r.fmtRev);
    if (typeof f.author === 'string' && typeof f.at === 'number') {
      const was = cleanRuns([{ ...obj(f.was), t: 'x' }])[0] ?? { t: 'x' };
      const { t: _t, br: _b, link: _l, math: _m, cm: _c, rev: _r, fmtRev: _f, ...look } = was;
      run.fmtRev = { author: str(f.author, 80), at: f.at, was: look };
    }
    out.push(run);
  }
  return out;
}

const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);

/** A tracked change, checked: its kind, a name of one line, a time. */
function cleanRev(v: unknown): DocRev | undefined {
  const o = obj(v);
  if ((o.kind !== 'ins' && o.kind !== 'del') || typeof o.author !== 'string' || typeof o.at !== 'number' || !Number.isFinite(o.at)) return undefined;
  return { kind: o.kind, author: str(o.author, 80).replace(/\s+/g, ' ').trim() || 'You', at: o.at };
}

/** A paragraph's own spacing, each value within bounds. */
function cleanSpace(v: unknown): DocSpace | undefined {
  const o = obj(v);
  const n = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : undefined);
  const sp: DocSpace = {};
  const line = n(o.line, 0.5, 5);
  const before = n(o.before, 0, 200);
  const after = n(o.after, 0, 200);
  if (line !== undefined) sp.line = line;
  if (before !== undefined) sp.before = before;
  if (after !== undefined) sp.after = after;
  return Object.keys(sp).length ? sp : undefined;
}

/** What the page's function returned, as the types say (the page's own scripts ran alongside it and could have changed anything). */
function cleanDoc(v: unknown): Extracted {
  const d = obj(v);
  const shots = (Array.isArray(d.shots) ? d.shots : []).slice(0, 200).map((x) => {
    const r = obj(x);
    return { x: int(r.x, 0, 1e6, 0), y: int(r.y, 0, 1e7, 0), w: int(r.w, 1, 4000, 1), h: int(r.h, 1, 8000, 1) };
  });
  const blocks: DocBlock[] = [];
  for (const x of (Array.isArray(d.blocks) ? d.blocks : []).slice(0, 5000)) {
    const b = obj(x);
    if (b.k === 'h' || b.k === 'p' || b.k === 'li') {
      const runs = cleanRuns(b.runs);
      // A document's empty paragraphs and items keep their place (a page's are left out).
      if (!runs.length && b.keep !== true) continue;
      const align = b.align === 'center' || b.align === 'right' || b.align === 'justify' ? b.align : undefined;
      const space = cleanSpace(b.space);
      if (b.k === 'h') {
        const h: Extract<DocBlock, { k: 'h' }> = { k: 'h', lvl: int(b.lvl, 1, 6, 2) as 1 | 2 | 3 | 4 | 5 | 6, runs, ...(align ? { align } : {}) };
        if (space) h.space = space;
        if (typeof b.anchor === 'string' && /^_Toc\d{1,9}$/.test(b.anchor)) h.anchor = b.anchor;
        if (cleanRev(b.mark)) h.mark = cleanRev(b.mark);
        blocks.push(h);
      } else if (b.k === 'li') {
        const li: Extract<DocBlock, { k: 'li' }> = { k: 'li', ordered: b.ordered === true, lvl: int(b.lvl, 0, 8, 0), list: int(b.list, 0, 1e9, 0), runs };
        if (b.check === true) {
          li.check = true;
          if (b.checked === true) li.checked = true;
        }
        if (align) li.align = align;
        if (space) li.space = space;
        if (cleanRev(b.mark)) li.mark = cleanRev(b.mark);
        blocks.push(li);
      } else {
        const p: Extract<DocBlock, { k: 'p' }> = { k: 'p', runs };
        if (align) p.align = align;
        if (b.quote === true) p.quote = true;
        if (b.style === 'title' || b.style === 'subtitle') p.style = b.style;
        const indent = int(b.indent, 0, 8, 0);
        if (indent) p.indent = indent;
        if (space) p.space = space;
        const shade = hex(b.shade);
        if (shade) {
          p.shade = shade;
          if (typeof b.icon === 'string' && b.icon.length <= 16) p.icon = b.icon;
        }
        if (cleanRev(b.mark)) p.mark = cleanRev(b.mark);
        blocks.push(p);
      }
    } else if (b.k === 'pb') blocks.push({ k: 'pb' });
    else if (b.k === 'pre') {
      const text = str(b.text, 200_000);
      if (text.trim()) blocks.push({ k: 'pre', text });
    } else if (b.k === 'hr') blocks.push({ k: 'hr' });
    else if (b.k === 'img') {
      const shot = typeof b.shot === 'number' && Number.isInteger(b.shot) && b.shot >= 0 && b.shot < shots.length ? b.shot : -1;
      if (shot < 0) continue;
      const img: Extract<DocBlock, { k: 'img' }> = { k: 'img', shot, w: int(b.w, 1, 4000, shots[shot].w), h: int(b.h, 1, 8000, shots[shot].h) };
      const alt = str(b.alt, 500).replace(/\s+/g, ' ').trim();
      if (alt) img.alt = alt;
      if (b.align === 'left' || b.align === 'center' || b.align === 'right') img.align = b.align;
      const caption = str(b.caption, 1000).replace(/\s+/g, ' ').trim();
      if (caption) img.caption = caption;
      if (cleanRev(b.rev)) img.rev = cleanRev(b.rev);
      blocks.push(img);
    } else if (b.k === 'table') {
      const rows: Extract<DocBlock, { k: 'table' }>['rows'] = [];
      for (const r of (Array.isArray(b.rows) ? b.rows : []).slice(0, 2000)) {
        const cells = (Array.isArray(obj(r).cells) ? (obj(r).cells as unknown[]) : []).slice(0, 63).map((c) => {
          const o = obj(c);
          const cell: DocCell = { runs: cleanRuns(o.runs) };
          if (o.head === true) cell.head = true;
          const span = int(o.span, 1, 63, 1);
          if (span > 1) cell.span = span;
          if (o.align === 'center' || o.align === 'right' || o.align === 'justify') cell.align = o.align;
          const fill = hex(o.fill);
          if (fill) cell.fill = fill;
          if (o.va === 'center' || o.va === 'bottom') cell.va = o.va;
          if (o.vm === 'restart' || o.vm === 'cont') cell.vm = o.vm;
          return cell;
        });
        if (cells.length) rows.push({ cells });
      }
      const cols = Array.isArray(b.cols) && b.cols.every((w) => typeof w === 'number' && Number.isFinite(w) && w > 0) ? (b.cols as number[]).slice(0, 63) : undefined;
      if (rows.length) blocks.push({ k: 'table', rows, ...(cols ? { cols } : {}), ...(cleanRev(b.rev) ? { rev: cleanRev(b.rev) } : {}) });
    } else if (b.k === 'toc') {
      const entries = (Array.isArray(b.entries) ? b.entries : []).slice(0, 2000).flatMap((x) => {
        const e = obj(x);
        const text = str(e.text, 500).replace(/\s+/g, ' ').trim();
        return text && typeof e.anchor === 'string' && /^_Toc\d{1,9}$/.test(e.anchor) ? [{ lvl: int(e.lvl, 1, 9, 1), text, anchor: e.anchor }] : [];
      });
      blocks.push({ k: 'toc', entries });
    } else if (b.k === 'math') {
      const tex = str(b.tex, 20_000).trim();
      if (tex) blocks.push({ k: 'math', tex });
    }
  }
  return { title: str(d.title, 300), lang: str(d.lang, 35), blocks, shots };
}

// ---- The .docx ----------------------------------------------------------------------------------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
/** Twips (a twentieth of a point): about 2 cm. */
const MARGIN = 1134;
/** EMUs (the unit pictures are sized in) per CSS pixel and per twip. */
const EMU_PX = 9525;
const EMU_TWIP = 635;
const FONT = 'Calibri';
const MONO_FONT = 'Consolas';
const LINE_COLOR = 'D1D5DB';
const HEAD_FILL = 'F3F4F6';

const fonts = (f: string) => `<w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:eastAsia="${f}" w:cs="${f}"/>`;
const size = (halfPt: number) => `<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
const border = (side: string, sz: number, color: string, space = 0) => `<w:${side} w:val="single" w:sz="${sz}" w:space="${space}" w:color="${color}"/>`;
const TABLE_BORDERS = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((s) => border(s, 4, LINE_COLOR)).join('');
const CELL_MARGINS = '<w:top w:w="57" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="57" w:type="dxa"/><w:right w:w="108" w:type="dxa"/>';

const paraStyle = (id: string, name: string, pPr: string, rPr: string, priority = 10) =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="${priority}"/><w:qFormat/>` +
  `${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}</w:style>`;

// Heading sizes (half-points), space before and after (twips), and what else each has.
const HEADINGS: [number, number, number, string][] = [
  [32, 360, 120, '<w:color w:val="1F2937"/>'],
  [26, 300, 100, '<w:color w:val="1F2937"/>'],
  [24, 240, 80, '<w:color w:val="1F2937"/>'],
  [22, 200, 60, '<w:color w:val="1F2937"/>'],
  [22, 200, 60, '<w:i/><w:iCs/><w:color w:val="1F2937"/>'],
  [21, 200, 60, '<w:i/><w:iCs/><w:color w:val="4B5563"/>'],
];

/** The language the page says it is in, as Word names it (and the East Asian one, so Chinese text gets a Chinese font). */
function langXml(lang: string): string {
  if (!/^[a-z]{2,3}([-_][a-z0-9]{2,8})*$/i.test(lang.trim())) return '';
  const parts = lang.trim().split(/[-_]/);
  const tag = [parts[0].toLowerCase(), ...parts.slice(1).map((p) => (p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p))].join('-');
  const l = tag.toLowerCase();
  const ea = l.startsWith('zh') ? (/-(tw|hk|mo|hant)\b/.test(l) ? 'zh-TW' : 'zh-CN') : l.startsWith('ja') ? 'ja-JP' : l.startsWith('ko') ? 'ko-KR' : '';
  return `<w:lang w:val="${esc(tag)}"${ea ? ` w:eastAsia="${ea}"` : ''}/>`;
}

function stylesXml(lang: string, look: DocLook = {}): string {
  const font = look.font ?? FONT;
  // Sizes in half-points: the document's own where it says them, else as Word's are.
  const half = (pt: number | undefined, def: number) => (pt && Number.isFinite(pt) ? Math.round(Math.min(400, Math.max(1, pt)) * 2) : def);
  const headings = HEADINGS.map(([sz, before, after, more], i) =>
    paraStyle(
      `Heading${i + 1}`,
      `heading ${i + 1}`,
      `<w:keepNext/><w:keepLines/><w:spacing w:before="${before}" w:after="${after}"/><w:outlineLvl w:val="${i}"/>`,
      `<w:b/><w:bCs/>${more}${size(half(look.heads?.[i], sz))}`,
      9,
    ),
  ).join('');
  const line = look.line && Number.isFinite(look.line) ? Math.round(Math.min(3, Math.max(0.8, look.line)) * 240) : 276;
  const after = look.after !== undefined && Number.isFinite(look.after) ? Math.round(Math.min(72, Math.max(0, look.after)) * 20) : 120;
  return (
    `${XML_HEAD}<w:styles xmlns:w="${W_NS}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${esc(font)}" w:hAnsi="${esc(font)}" w:cs="${esc(font)}"/>${size(half(look.size, 22))}${langXml(lang)}</w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="${after}" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    `<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/>` +
    `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/>` +
    `<w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `<w:style w:type="numbering" w:default="1" w:styleId="NoList"><w:name w:val="No List"/><w:uiPriority w:val="99"/><w:semiHidden/><w:unhideWhenUsed/></w:style>` +
    paraStyle('Title', 'Title', '<w:spacing w:before="0" w:after="240"/>', `<w:color w:val="111827"/><w:kern w:val="28"/>${size(half(look.title, 52))}`) +
    paraStyle('Subtitle', 'Subtitle', '<w:spacing w:before="0" w:after="240"/>', `<w:color w:val="5F6368"/>${size(half(look.subtitle, 30))}`, 11) +
    headings +
    paraStyle(
      'Quote',
      'Quote',
      `<w:pBdr>${border('left', 18, LINE_COLOR, 8)}</w:pBdr><w:spacing w:before="120" w:after="120"/><w:ind w:left="284" w:right="284"/>`,
      '<w:i/><w:iCs/><w:color w:val="374151"/>',
      29,
    ) +
    paraStyle(
      'Code',
      'Code',
      `<w:pBdr>${['top', 'left', 'bottom', 'right'].map((s) => border(s, 4, 'E5E7EB', 4)).join('')}</w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="F6F8FA"/>` +
        '<w:spacing w:before="120" w:after="200" w:line="240" w:lineRule="auto"/><w:ind w:left="113" w:right="113"/>',
      `${fonts(MONO_FONT)}${size(19)}`,
    ) +
    paraStyle('ListParagraph', 'List Paragraph', '<w:ind w:left="720"/><w:contextualSpacing/>', '', 34) +
    paraStyle('TableText', 'Table Text', '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>', size(20)) +
    paraStyle('Picture', 'Picture', '<w:spacing w:before="120" w:after="160" w:line="240" w:lineRule="auto"/>', '') +
    paraStyle('Caption', 'caption', '<w:spacing w:before="0" w:after="200"/>', `<w:color w:val="5F6368"/>${size(Math.round(half(look.size, 22) * 0.88))}`, 35) +
    [1, 2, 3].map((n) => paraStyle(`TOC${n}`, `toc ${n}`, `<w:spacing w:after="60"/><w:ind w:left="${(n - 1) * 284}"/>`, n === 1 ? '<w:b/><w:bCs/>' : '', 39)).join('') +
    paraStyle('Header', 'header', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', `<w:color w:val="5F6368"/>${size(Math.round(half(look.size, 22) * 0.82))}`, 99) +
    paraStyle('Footer', 'footer', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', `<w:color w:val="5F6368"/>${size(Math.round(half(look.size, 22) * 0.82))}`, 99) +
    paraStyle('CommentText', 'annotation text', '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>', size(20), 99) +
    `<w:style w:type="character" w:styleId="CommentReference"><w:name w:val="annotation reference"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:rPr>${size(16)}</w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="InlineCode"><w:name w:val="Inline Code"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="1"/><w:qFormat/>` +
    `<w:rPr>${fonts(MONO_FONT)}${size(20)}<w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:rPr></w:style>` +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>` +
    `<w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>` +
    `<w:style w:type="table" w:styleId="PageTable"><w:name w:val="Page Table"/><w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/>` +
    `<w:tblPr><w:tblBorders>${TABLE_BORDERS}</w:tblBorders><w:tblCellMar>${CELL_MARGINS}</w:tblCellMar></w:tblPr>` +
    `<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${HEAD_FILL}"/></w:tcPr></w:tblStylePr></w:style>` +
    `</w:styles>`
  );
}

/** One list of bullets for every bulleted list, and a numbering of its own for each numbered list (so each starts at 1). */
function numberingXml(numbered: number): string {
  const levels = (fmt: (i: number) => [string, string]) =>
    Array.from({ length: 9 }, (_, i) => {
      const [kind, text] = fmt(i);
      return (
        `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${kind}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
        `<w:pPr><w:ind w:left="${720 + 360 * i}" w:hanging="360"/></w:pPr></w:lvl>`
      );
    }).join('');
  const nsid = (k: number) => (0x4e410000 + k).toString(16).toUpperCase();
  const abstract = (k: number, body: string) => `<w:abstractNum w:abstractNumId="${k}"><w:nsid w:val="${nsid(k)}"/><w:multiLevelType w:val="hybridMultilevel"/>${body}</w:abstractNum>`;
  let out = abstract(
    0,
    levels((i) => ['bullet', ['•', '◦', '▪'][i % 3]]),
  );
  for (let k = 1; k <= numbered; k++)
    out += abstract(
      k,
      levels((i) => [['decimal', 'lowerLetter', 'lowerRoman'][i % 3], `%${i + 1}.`]),
    );
  out += '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';
  for (let k = 1; k <= numbered; k++) out += `<w:num w:numId="${k + 1}"><w:abstractNumId w:val="${k}"/></w:num>`;
  return `${XML_HEAD}<w:numbering xmlns:w="${W_NS}">${out}</w:numbering>`;
}

const SETTINGS_XML =
  `${XML_HEAD}<w:settings xmlns:w="${W_NS}"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/>` +
  '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>';
const APP_XML =
  `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
  '<Application>Hydor</Application><DocSecurity>0</DocSecurity></Properties>';

function contentTypes(pictures: Set<string>, parts: [string, string][] = []): string {
  const ov = (part: string, type: string) => `<Override PartName="${part}" ContentType="${type}"/>`;
  const ml = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  return (
    `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    [...pictures].map((e) => `<Default Extension="${e}" ContentType="image/${e}"/>`).join('') +
    parts.map(([part, kind]) => ov(part, `${ml}.${kind}+xml`)).join('') +
    ov('/word/document.xml', `${ml}.document.main+xml`) +
    ov('/word/styles.xml', `${ml}.styles+xml`) +
    ov('/word/numbering.xml', `${ml}.numbering+xml`) +
    ov('/word/settings.xml', `${ml}.settings+xml`) +
    ov('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
    ov('/docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml') +
    '</Types>'
  );
}

/** Tracked changes' ids, unique in the file (counted afresh for each file; Word's other notes are numbered below them). */
let revs = 0;
const when = (at: number) => new Date(at || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
/** A tracked change's attributes: its id, who made it, when. */
const revAttrs = (author: string, at: number) => `w:id="${10000 + ++revs}" w:author="${esc(author)}" w:date="${when(at)}"`;
/** A paragraph's own mark inserted or deleted, as the end of its properties says it. */
export const markXml = (m: DocRev | undefined) => (m ? `<w:rPr><w:${m.kind} ${revAttrs(m.author, m.at)}/></w:rPr>` : '');
/** Words inside a tracked change (inserted, deleted), around what Word writes for them. */
export const revWrap = (rev: DocRev | undefined, xml: string) => (rev ? `<w:${rev.kind} ${revAttrs(rev.author, rev.at)}>${xml}</w:${rev.kind}>` : xml);

function runXml(r: DocRun): string {
  const p = rPrParts(r);
  if (r.fmtRev) p.push(`<w:rPrChange ${revAttrs(r.fmtRev.author, r.fmtRev.at)}><w:rPr>${rPrParts({ t: '', ...r.fmtRev.was, ...(r.link ? { link: r.link } : {}) }).join('')}</w:rPr></w:rPrChange>`);
  // Deleted words are deleted text, which Word shows struck until the change is accepted.
  const tag = r.rev?.kind === 'del' ? 'w:delText' : 'w:t';
  const text = r.t
    .split(/(\t|\n)/)
    .map((x) => (x === '\t' ? '<w:tab/>' : x === '\n' ? '<w:br/>' : x ? `<${tag} xml:space="preserve">${esc(x)}</${tag}>` : ''))
    .join('');
  return `<w:r>${p.length ? `<w:rPr>${p.join('')}</w:rPr>` : ''}${r.br ? '<w:br/>' : ''}${text}</w:r>`;
}

/** A run's properties, as Word lists them (in its schema's order). */
function rPrParts(r: DocRun): string[] {
  const p: string[] = [];
  if (r.link) p.push('<w:rStyle w:val="Hyperlink"/>');
  else if (r.code) p.push('<w:rStyle w:val="InlineCode"/>');
  if (r.link && r.code) p.push(fonts(MONO_FONT));
  else if (r.font && !r.code) p.push(fonts(esc(r.font)));
  if (r.b) p.push('<w:b/><w:bCs/>');
  if (r.i) p.push('<w:i/><w:iCs/>');
  if (r.s) p.push('<w:strike/>');
  if (r.color && !r.link) p.push(`<w:color w:val="${r.color.slice(1).toUpperCase()}"/>`);
  if (r.size) p.push(size(Math.round(r.size * 2)));
  if (r.u && !r.link) p.push('<w:u w:val="single"/>');
  if (r.hl) p.push(`<w:shd w:val="clear" w:color="auto" w:fill="${r.hl.slice(1).toUpperCase()}"/>`);
  if (r.sup) p.push('<w:vertAlign w:val="superscript"/>');
  else if (r.sub) p.push('<w:vertAlign w:val="subscript"/>');
  return p;
}

const para = (pPr: string, inner: string) => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${inner}</w:p>`;
const plain = (runs: DocRun[]) => runs.map((r) => (r.br ? '\n' : '') + r.t).join('');
const JC = { center: 'center', right: 'right', justify: 'both' } as const;

/** The .docx file from what the extractor found and the pictures (PNG buffers, by shot index; null when one could not be taken). */
/**
 * The .docx file from what the extractor found and the pictures (PNG buffers, by shot index; null when one could not
 * be taken). A document of Pages gives its `margin` (mm), its `look`, and `titled: false` (its title is its own).
 */
export function docxFile(
  doc: Extracted,
  pictures: (Buffer | null)[],
  o: { title: string; paper: 'a4' | 'letter'; margin?: number; look?: DocLook; titled?: boolean; header?: DocBand; footer?: DocBand; titlePage?: boolean; comments?: DocComment[] },
): Buffer {
  const d = cleanDoc(doc);
  revs = 0;
  const page = o.paper === 'letter' ? { w: 12240, h: 15840 } : { w: 11906, h: 16838 };
  const margin = o.margin !== undefined && Number.isFinite(o.margin) ? Math.round(Math.min(60, Math.max(5, o.margin)) * 56.6929) : MARGIN;
  const look = o.look ?? {};
  if (look.font && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,39}$/.test(look.font)) delete look.font;
  const textW = page.w - 2 * margin;
  const maxW = textW * EMU_TWIP;
  // A picture and the line it sits on fit on one page.
  const maxH = Math.round((page.h - 2 * margin) * EMU_TWIP * 0.9);

  const rels: [string, string, string, boolean?][] = [
    ['rId1', 'styles', 'styles.xml'],
    ['rId2', 'numbering', 'numbering.xml'],
    ['rId3', 'settings', 'settings.xml'],
  ];
  const rel = (type: string, target: string, external?: boolean) => {
    const id = `rId${rels.length + 1}`;
    rels.push([id, type, target, external]);
    return id;
  };
  const linkIds = new Map<string, string>();

  // Comments: Word's number for each (its replies take the numbers after it), and the first and last of the runs each
  // is on, counted in the order runs are written below.
  const comments = (o.comments ?? []).filter((c) => c.text.trim());
  const cmNum = new Map<string, number[]>();
  let nextCm = 0;
  for (const c of comments) cmNum.set(c.id, Array.from({ length: 1 + (c.replies?.length ?? 0) }, () => nextCm++));
  const cmSpan = new Map<string, { first: number; last: number }>();
  {
    let k = 0;
    const visit = (list: DocRun[]) => {
      for (const r of list) {
        for (const id of r.cm ?? []) {
          if (!cmNum.has(id)) continue;
          const sp = cmSpan.get(id);
          if (sp) sp.last = k;
          else cmSpan.set(id, { first: k, last: k });
        }
        k++;
      }
    };
    for (const b of d.blocks) {
      if (b.k === 'h' || b.k === 'p' || b.k === 'li') visit(b.runs);
      else if (b.k === 'table') for (const r of b.rows) for (const c of r.cells) visit(c.runs);
    }
  }
  let written = 0;
  const cmMarks = (r: DocRun, at: number, edge: 'first' | 'last') =>
    (r.cm ?? [])
      .flatMap((id) => (cmSpan.get(id)?.[edge] === at ? (cmNum.get(id) ?? []) : []))
      .map((n) => (edge === 'first' ? `<w:commentRangeStart w:id="${n}"/>` : `<w:commentRangeEnd w:id="${n}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${n}"/></w:r>`))
      .join('');
  /** A run as Word's: maths as an equation (or, where it does not convert, its LaTeX in a maths font), the comments on it marked around it. */
  const oneRun = (r: DocRun) => {
    const at = written++;
    const omml = r.math ? ommlOf(r.t) : null;
    const body = r.math ? (omml ?? runXml({ t: r.t, i: true, font: 'Cambria Math', rev: r.rev })) : runXml(r);
    return cmMarks(r, at, 'first') + revWrap(r.rev, body) + cmMarks(r, at, 'last');
  };
  const runs = (list: DocRun[], bold = false) => {
    let out = '';
    for (let i = 0; i < list.length;) {
      const link = list[i].link;
      if (!link) {
        out += oneRun(bold ? { ...list[i], b: true } : list[i]);
        i++;
        continue;
      }
      let inner = '';
      for (; i < list.length && list[i].link === link; i++) inner += oneRun(bold ? { ...list[i], b: true } : list[i]);
      let id = linkIds.get(link);
      if (!id) linkIds.set(link, (id = rel('hyperlink', link, true)));
      out += `<w:hyperlink r:id="${id}" w:history="1">${inner}</w:hyperlink>`;
    }
    return out;
  };
  /** A paragraph's own spacing, as Word says it (twips; lines in 240ths). */
  const spaceXml = (sp: DocSpace | undefined) => {
    if (!sp) return '';
    const a = [sp.before !== undefined ? `w:before="${Math.round(sp.before * 20)}"` : '', sp.after !== undefined ? `w:after="${Math.round(sp.after * 20)}"` : '', sp.line !== undefined ? `w:line="${Math.round(sp.line * 240)}" w:lineRule="auto"` : ''].filter(Boolean);
    return a.length ? `<w:spacing ${a.join(' ')}/>` : '';
  };
  let bookmarks = 0;

  // Each numbered list its own numbering (numIds from 2; 1 is the bullets), up to a thousand of them.
  const numIds = new Map<number, number>();
  const numOf = (list: number) => {
    let id = numIds.get(list);
    if (id === undefined) {
      id = Math.min(numIds.size, 999) + 2;
      numIds.set(list, id);
    }
    return id;
  };

  const media: ZipPart[] = [];
  const kinds = new Set<string>();
  const picture = (b: Extract<DocBlock, { k: 'img' }>): string => {
    const buf = pictures[b.shot];
    const info = buf ? imageSize(buf) : null;
    if (!buf || !info || !info.w || !info.h || (info.type !== 'png' && info.type !== 'jpeg' && info.type !== 'gif')) return b.alt ? para('', runXml({ t: b.alt, i: true })) : '';
    const n = media.length + 1;
    const name = `image${n}.${info.type}`;
    media.push({ name: `word/media/${name}`, data: buf });
    kinds.add(info.type);
    const id = rel('image', `media/${name}`);
    // Its size on the page as it showed, smaller to fit the text's width and the page's height; its proportions from the picture.
    const ratio = info.h / info.w;
    let cx = Math.min(Math.round(b.w * EMU_PX), maxW);
    let cy = Math.round(cx * ratio);
    if (cy > maxH) {
      cy = maxH;
      cx = Math.round(cy / ratio);
    }
    const alt = b.alt ? ` descr="${esc(b.alt)}"` : '';
    const jc = b.align === 'center' || b.align === 'right' ? `<w:jc w:val="${b.align}"/>` : '';
    const caption = b.caption ? para(`<w:pStyle w:val="Caption"/>${jc}`, runXml({ t: b.caption })) : '';
    return para(
      `<w:pStyle w:val="Picture"/>${caption ? '<w:keepNext/>' : ''}${jc}`,
      revWrap(
        b.rev,
        `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${n}" name="Picture ${n}"${alt}/>` +
          '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
          `<pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="${name}"${alt}/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr>` +
          `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
          `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
          '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>',
      ),
    ) + caption;
  };

  const table = (b: Extract<DocBlock, { k: 'table' }>): string => {
    const span = (c: { span?: number }) => c.span ?? 1;
    const cols = Math.min(63, Math.max(1, ...b.rows.map((r) => r.cells.reduce((n, c) => n + span(c), 0))));
    // Columns as wide as their longest line asks, within limits, over the text's width.
    const want = new Array<number>(cols).fill(0);
    for (const r of b.rows) {
      let c = 0;
      for (const cell of r.cells) {
        if (span(cell) === 1 && c < cols)
          want[c] = Math.max(
            want[c],
            ...plain(cell.runs)
              .split('\n')
              .map((l) => l.length),
          );
        c += span(cell);
      }
    }
    const weights = b.cols && b.cols.length === cols ? b.cols : want.map((w) => Math.min(Math.max(w, 4), 48));
    const total = weights.reduce((a, w) => a + w, 0);
    const widths = weights.map((w) => Math.floor((textW * w) / total));
    widths[cols - 1] += textW - widths.reduce((a, w) => a + w, 0);
    // Rows of headings at the top repeat on each page.
    let heads = 0;
    while (heads < b.rows.length && b.rows[heads].cells.every((c) => c.head)) heads++;
    if (heads === b.rows.length) heads = 0;
    const cellXml = (runsXml: string, w: number, n: number, head: boolean, cell?: DocCell) => {
      const fill = cell?.fill ? cell.fill.slice(1).toUpperCase() : head ? HEAD_FILL : '';
      const vm = cell?.vm === 'restart' ? '<w:vMerge w:val="restart"/>' : cell?.vm === 'cont' ? '<w:vMerge/>' : '';
      return (
        `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${n > 1 ? `<w:gridSpan w:val="${n}"/>` : ''}${vm}${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}${cell?.va ? `<w:vAlign w:val="${cell.va}"/>` : ''}</w:tcPr>` +
        `${para(`<w:pStyle w:val="TableText"/>${cell?.align ? `<w:jc w:val="${JC[cell.align]}"/>` : ''}`, runsXml)}</w:tc>`
      );
    };
    const rowsXml = b.rows.map((r, ri) => {
      const head = ri < heads;
      let c = 0;
      let out = '';
      for (const cell of r.cells) {
        if (c >= cols) break;
        const n = Math.min(span(cell), cols - c);
        out += cellXml(
          runs(cell.runs, head),
          widths.slice(c, c + n).reduce((a, w) => a + w, 0),
          n,
          head,
          cell,
        );
        c += n;
      }
      for (; c < cols; c++) out += cellXml('', widths[c], 1, head);
      const rowRev = b.rev ? `<w:${b.rev.kind} ${revAttrs(b.rev.author, b.rev.at)}/>` : '';
      return `<w:tr><w:trPr><w:cantSplit/>${head ? '<w:tblHeader/>' : ''}${rowRev}</w:trPr>${out}</w:tr>`;
    });
    return (
      `<w:tbl><w:tblPr><w:tblStyle w:val="PageTable"/><w:tblW w:w="${textW}" w:type="dxa"/><w:tblBorders>${TABLE_BORDERS}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar>${CELL_MARGINS}</w:tblCellMar>` +
      `<w:tblLook w:val="04A0" w:firstRow="${heads ? 1 : 0}" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/></w:tblPr>` +
      `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rowsXml.join('')}</w:tbl>`
    );
  };

  const body: string[] = [];
  // The page's name on top, unless its first heading says it already.
  const title = (o.title || d.title || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const key = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  const says = (h: string) => {
    const a = key(h);
    const t = key(title);
    return !!a && !!t && (a === t || (t.length >= 4 && a.includes(t)) || (a.length >= 4 && t.includes(a)));
  };
  // Its first headings (a menu's heading can come before the page's own).
  const named = d.blocks.slice(0, 8).some((b) => b.k === 'h' && says(plain(b.runs)));
  if (title && !named && o.titled !== false) body.push(para('<w:pStyle w:val="Title"/>', runXml({ t: title })));

  // A checklist's box, as Word 2010 and later tick it (others show the box as it is drawn).
  let boxes = 0;
  const box = (on: boolean) =>
    `<w:sdt><w:sdtPr><w:id w:val="${4000 + ++boxes}"/><w14:checkbox><w14:checked w14:val="${on ? 1 : 0}"/><w14:checkedState w14:val="2612" w14:font="MS Gothic"/><w14:uncheckedState w14:val="2610" w14:font="MS Gothic"/></w14:checkbox></w:sdtPr>` +
    `<w:sdtContent><w:r><w:rPr><w:rFonts w:ascii="MS Gothic" w:eastAsia="MS Gothic" w:hAnsi="MS Gothic" w:hint="eastAsia"/></w:rPr><w:t>${on ? '☒' : '☐'}</w:t></w:r></w:sdtContent></w:sdt><w:r><w:tab/></w:r>`;
  const jcOf = (a: Jc | undefined) => (a ? `<w:jc w:val="${JC[a]}"/>` : '');
  d.blocks.forEach((b, i) => {
    if (b.k === 'h') {
      // A table of contents' line leads to its heading's bookmark.
      const mark = b.anchor ? ++bookmarks : 0;
      const inner = mark ? `<w:bookmarkStart w:id="${mark}" w:name="${b.anchor}"/>${runs(b.runs)}<w:bookmarkEnd w:id="${mark}"/>` : runs(b.runs);
      body.push(para(`<w:pStyle w:val="Heading${b.lvl}"/>${spaceXml(b.space)}${jcOf(b.align)}${markXml(b.mark)}`, inner));
    } else if (b.k === 'p' && b.shade) {
      // A callout: a shaded paragraph, its emoji first, its tint as a border all round that gives it room.
      const tint = b.shade.slice(1).toUpperCase();
      const frame = `<w:pBdr>${['top', 'left', 'bottom', 'right'].map((side) => border(side, 4, tint, 6)).join('')}</w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${tint}"/>`;
      const icon = b.icon ? runXml({ t: `${b.icon}  ` }) : '';
      body.push(para(`${frame}${spaceXml(b.space ?? { before: 6, after: 10 })}<w:ind w:left="170" w:right="170"/>${jcOf(b.align)}${markXml(b.mark)}`, icon + runs(b.runs)));
    } else if (b.k === 'p') {
      const style = b.style === 'title' ? 'Title' : b.style === 'subtitle' ? 'Subtitle' : b.quote ? 'Quote' : '';
      body.push(para(`${style ? `<w:pStyle w:val="${style}"/>` : ''}${spaceXml(b.space)}${b.indent ? `<w:ind w:left="${b.indent * 720}"/>` : ''}${jcOf(b.align)}${markXml(b.mark)}`, runs(b.runs)));
    } else if (b.k === 'li' && b.check)
      body.push(para(`<w:pStyle w:val="ListParagraph"/>${spaceXml(b.space)}<w:ind w:left="${720 + 360 * b.lvl}" w:hanging="360"/>${jcOf(b.align)}${markXml(b.mark)}`, box(!!b.checked) + runs(b.runs)));
    else if (b.k === 'li') body.push(para(`<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="${b.lvl}"/><w:numId w:val="${b.ordered ? numOf(b.list) : 1}"/></w:numPr>${spaceXml(b.space)}${jcOf(b.align)}${markXml(b.mark)}`, runs(b.runs)));
    else if (b.k === 'toc') {
      // A table of contents as Word keeps one: a field it fills in (with the pages) when it opens the file, and meanwhile
      // the headings, each a link to its own.
      const begin = '<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> TOC \\o "1-3" \\h \\z \\u </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>';
      const end = '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
      const tabs = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${textW}"/></w:tabs>`;
      if (!b.entries.length) body.push(para('<w:pStyle w:val="TOC1"/>', begin + end));
      b.entries.forEach((e, k) => {
        const link = `<w:hyperlink w:anchor="${e.anchor}" w:history="1">${runXml({ t: e.text })}</w:hyperlink>`;
        body.push(para(`<w:pStyle w:val="TOC${Math.min(3, e.lvl)}"/>${tabs}`, (k === 0 ? begin : '') + link + (k === b.entries.length - 1 ? end : '')));
      });
    } else if (b.k === 'math') {
      const omml = ommlOf(b.tex);
      body.push(omml ? para('<w:jc w:val="center"/>', `<m:oMathPara>${omml}</m:oMathPara>`) : para('<w:jc w:val="center"/>', runXml({ t: b.tex, i: true, font: 'Cambria Math' })));
    }
    else if (b.k === 'pb') body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    else if (b.k === 'pre')
      body.push(
        para(
          '<w:pStyle w:val="Code"/>',
          b.text
            .split('\n')
            .map((line, j) => runXml({ t: line, br: j > 0 }))
            .join(''),
        ),
      );
    else if (b.k === 'hr') body.push(para(`<w:pBdr>${border('bottom', 6, LINE_COLOR, 1)}</w:pBdr><w:spacing w:before="60" w:after="200"/>`, ''));
    else if (b.k === 'img') body.push(picture(b));
    else if (b.k === 'table') {
      body.push(table(b));
      // Two tables in a row would join into one; a document does not end with one.
      if (i === d.blocks.length - 1 || d.blocks[i + 1].k === 'table') body.push('<w:p/>');
    }
  });
  if (!body.length) body.push('<w:p/>');

  // The header and footer, each a part of its own (an empty one for a title page).
  const extra: ZipPart[] = [];
  const types: [string, string][] = [];
  let refs = '';
  const band = (kind: 'header' | 'footer', b: DocBand | undefined, which: 'default' | 'first') => {
    const n = extra.filter((x) => x.name.startsWith(`word/${kind}`)).length + 1;
    const name = `${kind}${n}.xml`;
    const tag = kind === 'header' ? 'hdr' : 'ftr';
    const words = b ? bandXml(b) : '';
    const style = kind === 'header' ? 'Header' : 'Footer';
    extra.push({ name: `word/${name}`, data: `${XML_HEAD}<w:${tag} xmlns:w="${W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${para(`<w:pStyle w:val="${style}"/>${b?.align ? `<w:jc w:val="${b.align}"/>` : ''}`, words)}</w:${tag}>` });
    types.push([`/word/${name}`, kind]);
    refs += `<w:${kind}Reference w:type="${which}" r:id="${rel(kind, name)}"/>`;
  };
  if (o.header) band('header', o.header, 'default');
  if (o.titlePage && o.header) band('header', undefined, 'first');
  if (o.footer) band('footer', o.footer, 'default');
  if (o.titlePage && o.footer) band('footer', undefined, 'first');
  const titlePg = o.titlePage && (o.header || o.footer) ? '<w:titlePg/>' : '';
  const sect =
    `<w:sectPr>${refs}<w:pgSz w:w="${page.w}" w:h="${page.h}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="567" w:footer="567" w:gutter="0"/>` +
    `<w:cols w:space="708"/>${titlePg}<w:docGrid w:linePitch="360"/></w:sectPr>`;
  // Comments, Word's way: each a comment of its own, its replies after it (commentsExtended says whose reply each
  // is, and which threads were resolved).
  if (comments.length) {
    const W14 = 'http://schemas.microsoft.com/office/word/2010/wordml';
    let para14 = 0x10000000;
    const items: string[] = [];
    const ex: string[] = [];
    const when = (at: number) => new Date(at || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z');
    for (const c of comments) {
      const nums = cmNum.get(c.id)!;
      const parent = (++para14).toString(16).toUpperCase();
      const one = (n: number, by: 'user' | 'agent', author: string | undefined, text: string, at: number, pid: string) => {
        const lines = text.split('\n');
        const ps = lines.map((l, k) => `<w:p${k === lines.length - 1 ? ` w14:paraId="${pid}" w14:textId="77777777"` : ''}><w:pPr><w:pStyle w:val="CommentText"/></w:pPr>${k === 0 ? '<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:annotationRef/></w:r>' : ''}${runXml({ t: l })}</w:p>`);
        const who = authorOf(by, author);
        items.push(`<w:comment w:id="${n}" w:author="${esc(who.name)}" w:date="${when(at)}" w:initials="${esc(who.initials)}">${ps.join('')}</w:comment>`);
      };
      one(nums[0], c.by, c.author, c.text, c.at, parent);
      ex.push(`<w15:commentEx w15:paraId="${parent}" w15:done="${c.resolved ? 1 : 0}"/>`);
      (c.replies ?? []).forEach((r, k) => {
        const pid = (++para14).toString(16).toUpperCase();
        one(nums[k + 1], r.by, r.author, r.text, r.at, pid);
        ex.push(`<w15:commentEx w15:paraId="${pid}" w15:paraIdParent="${parent}" w15:done="${c.resolved ? 1 : 0}"/>`);
      });
    }
    extra.push({ name: 'word/comments.xml', data: `${XML_HEAD}<w:comments xmlns:w="${W_NS}" xmlns:w14="${W14}" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">${items.join('')}</w:comments>` });
    extra.push({
      name: 'word/commentsExtended.xml',
      data: `${XML_HEAD}<w15:commentsEx xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w15">${ex.join('')}</w15:commentsEx>`,
    });
    types.push(['/word/comments.xml', 'comments'], ['/word/commentsExtended.xml', 'commentsExtended']);
    rel('comments', 'comments.xml');
    rel('http://schemas.microsoft.com/office/2011/relationships/commentsExtended', 'commentsExtended.xml');
  }
  const document =
    `${XML_HEAD}<w:document xmlns:w="${W_NS}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ' +
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" ' +
    `xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14"><w:body>${body.join('')}${sect}</w:body></w:document>`;

  return zipParts([
    { name: '[Content_Types].xml', data: contentTypes(kinds, types) },
    {
      name: '_rels/.rels',
      data: relsXml([
        ['rId1', 'officeDocument', 'word/document.xml'],
        ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
        ['rId3', 'extended-properties', 'docProps/app.xml'],
      ]),
    },
    { name: 'docProps/core.xml', data: coreXml(title || 'Page') },
    { name: 'docProps/app.xml', data: APP_XML },
    { name: 'word/document.xml', data: document },
    { name: 'word/_rels/document.xml.rels', data: relsXml(rels) },
    { name: 'word/styles.xml', data: stylesXml(d.lang, look) },
    { name: 'word/numbering.xml', data: numberingXml(Math.min(numIds.size, 1000)) },
    { name: 'word/settings.xml', data: SETTINGS_XML },
    ...extra,
    ...media,
  ]);
}

/** Who wrote a comment or a change, as Word names them: their name (You and Agent for you and an agent) and initials. */
export function authorOf(by: 'user' | 'agent', author?: string): { name: string; initials: string } {
  const name = (author ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || (by === 'agent' ? 'Agent' : 'You');
  const words = name.split(' ').filter(Boolean);
  const initials = (words.length > 1 ? [...words[0]][0] + [...words[words.length - 1]][0] : [...name].slice(0, 2).join('')).toUpperCase();
  return { name, initials: author ? initials : by === 'agent' ? 'A' : 'Y' };
}

/** A header's or footer's words, with Word's page number and count where they say {page} and {pages}. */
function bandXml(b: DocBand): string {
  return b.text
    .split(/(\{pages?\})/i)
    .filter(Boolean)
    .map((p) => (/^\{page\}$/i.test(p) ? '<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>' : /^\{pages\}$/i.test(p) ? '<w:fldSimple w:instr=" NUMPAGES "><w:r><w:t>1</w:t></w:r></w:fldSimple>' : runXml({ t: p })))
    .join('');
}

// ---- The whole job ------------------------------------------------------------------------------

/**
 * One picture of the page, in document coordinates; big ones are taken smaller, and a photograph as a JPEG when that
 * is much lighter. One that fits in the window is taken there, the page scrolled to it: taking one beyond the window
 * resizes the window, which lays out the whole page again, twice (seconds on a long page).
 */
async function snap(tab: Tab, r: Extracted['shots'][number]): Promise<Buffer | null> {
  const clip = { x: r.x, y: r.y, width: r.w, height: r.h, scale: Math.min(1, 1200 / r.w, 1800 / r.h) };
  try {
    let beyond = true;
    if (r.h <= HEIGHT - 40 && r.x + r.w <= WIDTH) {
      const want = Math.max(0, Math.round(r.y - (HEIGHT - r.h) / 2));
      const top = await tab
        .evaluate<number>(`(() => { const e = document.scrollingElement || document.documentElement; e.scrollTo({ top: ${want}, behavior: 'instant' }); return e.scrollTop; })()`, 5000)
        .catch(() => -1);
      beyond = !(top >= 0 && top <= r.y && r.y + r.h <= top + HEIGHT);
    }
    const take = (format: 'png' | 'jpeg') => tab.s.send('Page.captureScreenshot', { format, quality: format === 'jpeg' ? 85 : undefined, clip, captureBeyondViewport: beyond }, 30_000);
    const buf = Buffer.from((await take('png')).data, 'base64');
    if (buf.length < 1_500_000) return buf;
    const jpeg = await take('jpeg').catch(() => null);
    const alt = jpeg?.data ? Buffer.from(jpeg.data, 'base64') : null;
    return alt && alt.length < buf.length / 2 ? alt : buf;
  } catch {
    return null;
  }
}

/**
 * The whole job: `html` (a complete document, the page kit in it already) opened in the capture browser at a
 * laptop's width, read, its pictures taken, and made into a .docx.
 */
export async function docxOfPage(html: string, o: { title: string; paper: 'a4' | 'letter' }): Promise<Buffer> {
  const { doc, pictures } = await withTab({ html, width: WIDTH, height: HEIGHT, scale: SCALE, settleMs: 1000, blockPrivate: true }, async (tab) => {
    await tab.evaluate<number>(`(${PREPARE_SRC})()`, 20_000).catch(() => 0);
    const doc = cleanDoc(await tab.evaluate<unknown>(`(${EXTRACT_SRC})()`, 40_000));
    // The page's scripts stop here, so none of them changes it (redraws a chart from nothing, on a resize or a scroll)
    // while the pictures are taken.
    await tab.s.send('Emulation.setScriptExecutionDisabled', { value: true }).catch(() => {});
    const pictures: (Buffer | null)[] = [];
    // Pictures for about a minute and a half at most; any left after that are left out.
    const until = Date.now() + 90_000;
    for (const r of doc.shots) pictures.push(Date.now() < until ? await snap(tab, r) : null);
    return { doc, pictures };
  });
  return docxFile(doc, pictures, o);
}
