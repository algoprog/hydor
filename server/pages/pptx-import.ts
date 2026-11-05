// PowerPoint files (.pptx) opened as slide decks, as close to how PowerPoint shows them as the slides can be: each
// slide's parts where they are (turned and flipped), text boxes and shapes with their words (runs' fonts, sizes, bold,
// italic, underline, strike, colours, highlights and links; paragraphs' alignment, spacing, bullets, numbers and
// levels; insets, anchoring and fitting), placeholders placed and styled as their layout and master say, pictures
// (cropped, fitted, their colours as PowerPoint's effects change them), tables (merged and coloured cells), charts (from
// the numbers cached in them), groups, connectors (stuck to their shapes), videos inside the file (kept with the deck),
// online ones, PowerPoint's equations (as LaTeX), backgrounds, speaker notes, comments (old and new, with replies), the
// footer, transitions and simple animations, and the file's theme as the deck's. What the slides cannot hold is said in
// notes the person who opened it sees (.ppt files cannot be opened at all). A file this app wrote comes back as the
// deck it was: its icons, equations, videos, cover and contain pictures, Morph's pairs and theme are recognised.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { all, att, kid, kids, parseXml, path as xpath, patt, textOf, type El as X } from '../documents/xml.ts';
import { rels } from '../documents/ooxml.ts';
import { Zip } from '../documents/zip.ts';
import type { DB } from '../db.ts';
import { cleanFont, iconNodes, LAYOUTS, SLIDE_LIMITS, THEMES, videoSrc, type LayoutId, type ShapeKind } from '../../shared/slides.ts';
import { texOfOmml } from './omml.ts';
import { shapeOutline } from './pptx.ts';
import { keepVideoFile } from './videos.ts';

type Obj = Record<string, unknown>;

/** What the import gives back: the deck as the app keeps it (checked once more as it is kept), and what came in otherwise. */
export interface DeckFromFile {
  model: Obj;
  notes: string[];
}

// ---- colours ---------------------------------------------------------------------------------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

const PRESET: Record<string, string> = {
  black: '000000',
  white: 'FFFFFF',
  red: 'FF0000',
  green: '008000',
  blue: '0000FF',
  yellow: 'FFFF00',
  gray: '808080',
  grey: '808080',
  darkGray: 'A9A9A9',
  lightGray: 'D3D3D3',
  orange: 'FFA500',
  purple: '800080',
  navy: '000080',
  teal: '008080',
  silver: 'C0C0C0',
  maroon: '800000',
  olive: '808000',
  lime: '00FF00',
  cyan: '00FFFF',
  magenta: 'FF00FF',
};

const hexRgb = (h: string, a = 1): Rgb => ({ r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0, a });
const rgbHex = (c: Rgb) =>
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');

function toHsl(c: Rgb): [number, number, number] {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h: number, s: number, l: number, a: number): Rgb {
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255, a };
}

/** A colour changed channel by channel in linear light (0–1), and back. */
function linear(c: Rgb, f: (v: number) => number): Rgb {
  const to = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  const from = (x: number) => {
    const v = Math.max(0, Math.min(1, x));
    return (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  };
  return { r: from(f(to(c.r))), g: from(f(to(c.g))), b: from(f(to(c.b))), a: c.a };
}

/** The theme's colours by their scheme names, and the slide master's map of what text and backgrounds use. */
interface Palette {
  scheme: Record<string, string>;
  map: Record<string, string>;
}

/** A DrawingML colour (srgbClr, schemeClr, sysClr, prstClr, scrgbClr, hslClr) with its changes (alpha, luminance, tint, shade…), or null. `ph`: what a style's placeholder colour stands for. */
function colorOf(el: X | undefined, pal: Palette, ph?: Rgb): Rgb | null {
  if (!el) return null;
  const v = att(el, 'val') ?? '';
  let c: Rgb | null = null;
  if (el.n === 'srgbClr' && /^[0-9a-f]{6}$/i.test(v)) c = hexRgb(v);
  else if (el.n === 'sysClr') c = hexRgb(att(el, 'lastClr') ?? (v === 'window' ? 'FFFFFF' : '000000'));
  else if (el.n === 'prstClr') c = hexRgb(PRESET[v] ?? '000000');
  else if (el.n === 'scrgbClr') {
    const lin = (p: string | undefined) => {
      const x = Math.max(0, Math.min(1, Number(p ?? 0) / 100000));
      return (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055) * 255;
    };
    c = { r: lin(att(el, 'r')), g: lin(att(el, 'g')), b: lin(att(el, 'b')), a: 1 };
  } else if (el.n === 'hslClr') c = fromHsl(Number(att(el, 'hue') ?? 0) / 21600000, Number(att(el, 'sat') ?? 0) / 100000, Number(att(el, 'lum') ?? 0) / 100000, 1);
  else if (el.n === 'schemeClr') {
    if (v === 'phClr') c = ph ? { ...ph } : null;
    else {
      const name = pal.map[v] ?? v;
      const hex = pal.scheme[name];
      c = hex ? hexRgb(hex) : null;
    }
  }
  if (!c) return null;
  for (const t of kids(el)) {
    const n = Number(att(t, 'val') ?? 0) / 100000;
    if (t.n === 'alpha') c.a = Math.max(0, Math.min(1, n));
    else if (t.n === 'alphaMod') c.a = Math.max(0, Math.min(1, c.a * n));
    else if (t.n === 'alphaOff') c.a = Math.max(0, Math.min(1, c.a + n));
    // Tints and shades mix with white and black in linear light, as Office mixes them.
    else if (t.n === 'tint') c = linear(c, (v) => v * n + (1 - n));
    else if (t.n === 'shade') c = linear(c, (v) => v * n);
    else if (t.n === 'inv') c = { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b, a: c.a };
    else if (t.n === 'gray') {
      const y: number = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      c = { r: y, g: y, b: y, a: c.a };
    } else if (['lumMod', 'lumOff', 'satMod', 'satOff', 'hueMod', 'hueOff', 'comp'].includes(t.n)) {
      let [h, s, l] = toHsl(c);
      if (t.n === 'lumMod') l *= n;
      else if (t.n === 'lumOff') l += n;
      else if (t.n === 'satMod') s *= n;
      else if (t.n === 'satOff') s += n;
      else if (t.n === 'hueMod') h *= n;
      else if (t.n === 'hueOff') h += Number(att(t, 'val') ?? 0) / 21600000;
      else h += 0.5;
      c = fromHsl(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l)), c.a);
    }
  }
  return c;
}

/** The colour element inside a fill or colour holder (solidFill, a style's reference…). */
const colorKid = (el: X | undefined) => kids(el).find((k) => /Clr$/.test(k.n));

// ---- the file's frame ------------------------------------------------------------------------------------------------

interface Frame {
  zip: Zip;
  pal: Palette;
  major: string;
  minor: string;
  /** The theme's fill and line styles (a shape's style refers to them by number). */
  lines: X[];
  /** The presentation's default text style (for text boxes), and the master's styles for titles, text and the rest. */
  defaults?: X;
  titleStyle?: X;
  bodyStyle?: X;
  otherStyle?: X;
  /** Slide pixels per EMU, and where the slide's corner goes on the app's slide. */
  k: number;
  ox: number;
  oy: number;
  /** The deck's theme, to name its colours by (accent, fg…) where they are those. */
  theme: Obj;
  notes: Set<string>;
  db?: DB;
}

/** A layout or master: its placeholders by kind and number, its background, its own map of colours. */
interface Sheet {
  part: string;
  root: X;
  phs: { type: string; idx: number; sp: X }[];
  bg?: X;
}

function readSheet(f: Frame, part: string | undefined): Sheet | null {
  const xml = part ? f.zip.text(part) : null;
  if (!part || !xml) return null;
  const root = parseXml(xml).root;
  const phs: Sheet['phs'] = [];
  for (const sp of kids(xpath(root, 'cSld', 'spTree'))) {
    const ph = xpath(sp, sp.n === 'pic' ? 'nvPicPr' : sp.n === 'graphicFrame' ? 'nvGraphicFramePr' : 'nvSpPr', 'nvPr', 'ph');
    if (ph) phs.push({ type: att(ph, 'type') ?? 'obj', idx: Number(att(ph, 'idx') ?? 0), sp });
  }
  return { part, root, phs, bg: xpath(root, 'cSld', 'bg') };
}

/** The placeholder of a layout or master a slide's placeholder takes its place and look from: by its number, else by its kind. */
function matchPh(sheet: Sheet | null, type: string, idx: number, master = false): X | undefined {
  if (!sheet) return undefined;
  const group = (t: string) => (t === 'ctrTitle' || t === 'title' ? 'title' : ['dt', 'ftr', 'sldNum', 'hdr', 'sldImg'].includes(t) ? t : 'body');
  if (!master && idx) {
    const byIdx = sheet.phs.find((p) => p.idx === idx);
    if (byIdx) return byIdx.sp;
  }
  return (sheet.phs.find((p) => p.type === type) ?? sheet.phs.find((p) => group(p.type) === group(type)))?.sp;
}

// ---- text --------------------------------------------------------------------------------------------------------------

/** Where a shape's text takes what it does not say itself, most particular first: its own list style, its style's font, its layout's and master's placeholder, the master's or presentation's styles. */
interface Chain {
  lsts: (X | undefined)[];
  /** A shape's style: its font (major or minor) and colour, for text that says neither. */
  fontRef?: { font?: string; color?: Rgb };
  bodyPrs: (X | undefined)[];
}

const lvlOf = (lst: X | undefined, lvl: number) => kid(lst, `lvl${lvl + 1}pPr`) ?? (lvl === 0 ? kid(lst, 'defPPr') : undefined);

/** A paragraph's property: its own pPr's, else each list style's at its level. */
function pAttr(p: X | undefined, chain: Chain, lvl: number, name: string): string | undefined {
  const own = att(p, name);
  if (own !== undefined) return own;
  for (const l of chain.lsts) {
    const v = att(lvlOf(l, lvl), name);
    if (v !== undefined) return v;
  }
  return undefined;
}
function pKid(p: X | undefined, chain: Chain, lvl: number, names: string[]): X | undefined {
  const own = kids(p).find((k) => names.includes(k.n));
  if (own) return own;
  for (const l of chain.lsts) {
    const got = kids(lvlOf(l, lvl)).find((k) => names.includes(k.n));
    if (got) return got;
  }
  return undefined;
}
/** A run's property: its own rPr's, else its paragraph's defaults (its pPr's, then each list style's at its level). */
function rAttr(r: X | undefined, p: X | undefined, chain: Chain, lvl: number, name: string): string | undefined {
  const own = att(r, name);
  if (own !== undefined) return own;
  const pd = att(kid(p, 'defRPr'), name);
  if (pd !== undefined) return pd;
  for (const l of chain.lsts) {
    const v = att(kid(lvlOf(l, lvl), 'defRPr'), name);
    if (v !== undefined) return v;
  }
  return undefined;
}
function rKid(r: X | undefined, p: X | undefined, chain: Chain, lvl: number, names: string[]): X | undefined {
  const own = kids(r).find((k) => names.includes(k.n));
  if (own) return own;
  const pd = kids(kid(p, 'defRPr')).find((k) => names.includes(k.n));
  if (pd) return pd;
  for (const l of chain.lsts) {
    const got = kids(kid(lvlOf(l, lvl), 'defRPr')).find((k) => names.includes(k.n));
    if (got) return got;
  }
  return undefined;
}
const bodyAttr = (chain: Chain, name: string) => {
  for (const b of chain.bodyPrs) {
    const v = att(b, name);
    if (v !== undefined) return v;
  }
  return undefined;
};

/** A typeface as the deck names it: the theme's (+mj-lt, +mn-lt) as its fonts, others as they are (a name the app keeps). */
const faceOf = (f: Frame, tf: string | undefined): string | undefined => {
  if (!tf) return undefined;
  const name = tf === '+mj-lt' || tf === '+mj-ea' || tf === '+mj-cs' ? f.major : tf.startsWith('+') ? f.minor : tf;
  return cleanFont(name) ?? undefined;
};

/** A colour as the deck keeps it: the theme's name for it where it is one of the theme's (so a new theme recolours it), else #rrggbb(aa). */
function deckColor(f: Frame, c: Rgb | null): string | undefined {
  if (!c) return undefined;
  const hex = rgbHex(c).toLowerCase();
  if (c.a <= 0.002) return 'transparent';
  if (c.a >= 0.998) {
    const t = f.theme as Record<string, unknown>;
    for (const k of ['accent', 'fg', 'head', 'muted', 'bg', 'soft', 'accentFg']) if (typeof t[k] === 'string' && (t[k] as string).toLowerCase() === `#${hex}`) return k;
    const cs = Array.isArray(t.colors) ? (t.colors as string[]) : [];
    for (let i = 1; i < 6; i++) if (cs[i]?.toLowerCase() === `#${hex}`) return `c${i + 1}`;
    return `#${hex}`;
  }
  return `#${hex}${Math.round(c.a * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** EMU (or hundredths of a point) as the app's pixels. */
const px = (f: Frame, emu: number) => Math.round(emu * f.k * 100) / 100;
const ptPx = (f: Frame, hundredths: number) => Math.round((hundredths / 100 / 0.75) * f.k * 9525 * 100) / 100;

interface TextOut {
  paras: Obj[];
  size: number;
  font?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  lh?: number;
  gap?: number;
  ls?: number;
  align?: string;
  valign?: string;
  pad: number;
  fit: 'shrink' | 'none';
  empty: boolean;
}

/**
 * A shape's words as the deck's paragraphs and runs: each run's look where it differs from the box's (its first
 * words'), each paragraph's alignment, list and level; the box's line height, space after, letter spacing, insets,
 * anchoring and fitting. A box made smaller to fit (fontScale) has the sizes it would have unshrunk: the app fits it again.
 */
function wordsOf(f: Frame, body: X | undefined, chain: Chain, href: (el: X | undefined) => string | undefined, roundInset = 0, role = 'body'): TextOut | null {
  if (!body) return null;
  const bodyPr = kid(body, 'bodyPr');
  const auto = kid(bodyPr, 'normAutofit') ? 'normAutofit' : kid(bodyPr, 'noAutofit') || kid(bodyPr, 'spAutoFit') ? 'none' : chain.bodyPrs.slice(1).some((b) => kid(b, 'normAutofit')) ? 'normAutofit' : 'none';
  const scale = auto === 'normAutofit' ? Number(att(kid(bodyPr, 'normAutofit'), 'fontScale') ?? 100000) / 100000 || 1 : 1;
  const ins = (name: string, def: number) => Number(bodyAttr(chain, name) ?? def);
  const pad = Math.max(0, Math.round((px(f, ins('lIns', 91440)) + roundInset) * 100) / 100);
  const anchor = bodyAttr(chain, 'anchor');
  const vert = bodyAttr(chain, 'vert');
  if (vert && vert !== 'horz') f.notes.add('Text set vertically in PowerPoint came in across.');
  const paras: Obj[] = [];
  const first: { size?: number; font?: string; color?: string; b?: boolean; i?: boolean } = {};
  let lh: number | undefined;
  let gap: number | undefined;
  let ls: number | undefined;
  let align: string | undefined;
  let anyText = false;
  for (const p of kids(body, 'p')) {
    const pPr = kid(p, 'pPr');
    const lvl = Math.max(0, Math.min(8, Number(att(pPr, 'lvl') ?? 0)));
    const runs: Obj[] = [];
    const pushRun = (r: X | undefined, text: string) => {
      const rPr = kid(r, 'rPr');
      const szAt = rAttr(rPr, pPr, chain, lvl, 'sz');
      const size = ptPx(f, Number(szAt ?? 1800));
      const b = rAttr(rPr, pPr, chain, lvl, 'b') === '1' || rAttr(rPr, pPr, chain, lvl, 'b') === 'true';
      const i = rAttr(rPr, pPr, chain, lvl, 'i') === '1' || rAttr(rPr, pPr, chain, lvl, 'i') === 'true';
      const u = rAttr(rPr, pPr, chain, lvl, 'u');
      const strike = rAttr(rPr, pPr, chain, lvl, 'strike');
      const baseline = Number(rAttr(rPr, pPr, chain, lvl, 'baseline') ?? 0);
      const fill = rKid(rPr, pPr, chain, lvl, ['solidFill', 'gradFill', 'noFill']);
      const c = fill?.n === 'solidFill' ? colorOf(colorKid(fill), f.pal) : fill?.n === 'gradFill' ? colorOf(colorKid(kid(kid(fill, 'gsLst'), 'gs')), f.pal) : fill?.n === 'noFill' ? { r: 0, g: 0, b: 0, a: 0 } : (chain.fontRef?.color ?? null);
      const latin = rKid(rPr, pPr, chain, lvl, ['latin']);
      const font = faceOf(f, att(latin, 'typeface')) ?? (chain.fontRef?.font ? faceOf(f, chain.fontRef.font) : undefined) ?? faceOf(f, '+mn-lt');
      const hl = colorOf(colorKid(kid(rPr, 'highlight')), f.pal);
      const spc = Number(rAttr(rPr, pPr, chain, lvl, 'spc') ?? 0);
      // Words PowerPoint shows in capitals are capitals (the slides have no such style).
      const run: Obj = { t: rAttr(rPr, pPr, chain, lvl, 'cap') === 'all' ? text.toLocaleUpperCase() : text };
      if (first.size === undefined) {
        Object.assign(first, { size, font, color: deckColor(f, c), b, i });
        // Letter spacing in the box's em (points apart, as the size shown).
        if (spc) ls = Math.round((ptPx(f, spc) / size) * 1000) / 1000;
      }
      if (Math.abs(size - (first.size ?? size)) > 0.2) run.size = size;
      if (font !== first.font && font) run.font = font;
      const col = deckColor(f, c);
      if (col !== first.color && col) run.color = col;
      // Bold and italic as each run says (the box's are set below, when every word is).
      if (b) run.b = true;
      if (i) run.i = true;
      if (u && u !== 'none') run.u = true;
      if (strike && strike !== 'noStrike') run.s = true;
      if (baseline > 0) run.sup = true;
      else if (baseline < 0) run.sub = true;
      if (hl) run.hl = deckColor(f, hl);
      const to = href(kid(rPr, 'hlinkClick'));
      if (to) run.link = to;
      runs.push(run);
    };
    for (const x of kids(p)) {
      if (x.n === 'r') pushRun(x, textOf(kid(x, 't')));
      else if (x.n === 'br') pushRun(x, '\n');
      else if (x.n === 'fld') pushRun(x, textOf(kid(x, 't')));
    }
    // Line breaks joined into the runs around them, as the app keeps them.
    const joined: Obj[] = [];
    for (const r of runs) {
      const prev = joined[joined.length - 1];
      if (prev && (r.t === '\n' || prev.t === '\n' || String(prev.t).endsWith('\n')) && JSON.stringify({ ...prev, t: '' }) === JSON.stringify({ ...r, t: '' })) prev.t = `${prev.t}${r.t}`;
      else joined.push({ ...r });
    }
    if (joined.some((r) => String(r.t).trim())) anyText = true;
    const para: Obj = { runs: joined.length ? joined : [{ t: '' }] };
    const algn = pAttr(pPr, chain, lvl, 'algn');
    const a = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' ? 'justify' : 'left';
    if (align === undefined) align = a;
    else if (a !== align) para.align = a;
    // A bullet, a number, or none (PowerPoint's own placeholders have their master's bullets).
    const bu = pKid(pPr, chain, lvl, ['buNone', 'buChar', 'buAutoNum', 'buBlip']);
    if (bu?.n === 'buChar' || bu?.n === 'buBlip') para.list = 'bullet';
    else if (bu?.n === 'buAutoNum') para.list = 'number';
    if (lvl) para.lvl = Math.min(4, lvl);
    // Line height and the space between paragraphs: the first paragraph's, for the box (PowerPoint's single spacing is
    // 1.2 times the size; space in percent is of that line).
    if (lh === undefined) {
      const ln = pKid(pPr, chain, lvl, ['lnSpc']);
      const pct = att(kid(ln, 'spcPct'), 'val');
      const pts = att(kid(ln, 'spcPts'), 'val');
      const size = first.size ?? ptPx(f, 1800);
      lh = pct ? Math.round((Number(pct) / 100000) * 1.2 * 1000) / 1000 : pts ? Math.round((ptPx(f, Number(pts)) / size) * 1000) / 1000 : 1.2;
      const space = (name: string) => {
        const el = pKid(pPr, chain, lvl, [name]);
        const sp = att(kid(el, 'spcPts'), 'val');
        const sc = att(kid(el, 'spcPct'), 'val');
        return sp ? ptPx(f, Number(sp)) : sc ? (Number(sc) / 100000) * 1.2 * size : 0;
      };
      const g = space('spcAft') + space('spcBef');
      // Written at the size shown: as it would be unshrunk.
      if (g) gap = Math.round((g / (scale || 1)) * 100) / 100;
    }
    paras.push(para);
  }
  if (!paras.length) paras.push({ runs: [{ t: '' }] });
  // Without words, its size is what words typed in it would take (its paragraph's end, or its styles').
  const p0 = kid(body, 'p');
  const endSz = att(kid(p0, 'endParaRPr'), 'sz') ?? rAttr(undefined, kid(p0, 'pPr'), chain, Number(att(kid(p0, 'pPr'), 'lvl') ?? 0), 'sz');
  const out: TextOut = {
    paras,
    size: first.size ?? ptPx(f, Number(endSz ?? 1800)),
    pad,
    fit: auto === 'normAutofit' ? 'shrink' : 'none',
    empty: !anyText,
  };
  if (first.font) out.font = first.font;
  if (first.color) out.color = first.color;
  // The box is bold (or italic) when all its words are: then its runs need not say so (a run cannot say it is not).
  const worded = paras.flatMap((p) => p.runs as Obj[]).filter((r) => String(r.t).trim());
  for (const [key, prop] of [
    ['b', 'bold'],
    ['i', 'italic'],
  ] as const)
    if (worded.length && worded.every((r) => r[key])) {
      out[prop] = true;
      for (const p of paras) for (const r of p.runs as Obj[]) delete r[key];
    }
  // A title's own line height is the app's 1.1: say PowerPoint's where it differs.
  if (lh && (role !== 'title' ? Math.abs(lh - 1.2) > 0.005 : Math.abs(lh - 1.1) > 0.005)) out.lh = Math.max(0.6, Math.min(4, lh));
  if (gap) out.gap = gap;
  if (ls) out.ls = Math.max(-0.2, Math.min(1, ls / (scale || 1)));
  if (align && align !== 'left') out.align = align;
  out.valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
  return out;
}

// ---- shapes ------------------------------------------------------------------------------------------------------------

/** PowerPoint's preset shapes the app has, by its names. */
const PRESETS: Record<string, ShapeKind> = {
  rect: 'rect',
  roundRect: 'round',
  snipRoundRect: 'round',
  round2SameRect: 'round',
  ellipse: 'ellipse',
  triangle: 'triangle',
  rtTriangle: 'rtriangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  star5: 'star',
  rightArrow: 'arrow',
  leftArrow: 'larrow',
  upArrow: 'uarrow',
  downArrow: 'darrow',
  chevron: 'chevron',
  homePlate: 'chevron',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  plus: 'plus',
  mathPlus: 'plus',
  heart: 'heart',
  wedgeRoundRectCallout: 'callout',
  wedgeRectCallout: 'callout',
  wedgeEllipseCallout: 'callout',
  flowChartProcess: 'rect',
  flowChartAlternateProcess: 'round',
  flowChartDecision: 'diamond',
  flowChartConnector: 'ellipse',
  frame: 'rect',
};

/** A custom outline this app wrote (shapeOutline): which of its shapes it is, by its points; null for another. */
function ownKind(geom: X, w: number, h: number): ShapeKind | null {
  const p = xpath(geom, 'pathLst', 'path');
  if (!p || w <= 0 || h <= 0) return null;
  const pw = Number(att(p, 'w') ?? 0) || 1;
  const ph = Number(att(p, 'h') ?? 0) || 1;
  const pts: number[] = [];
  for (const c of kids(p)) for (const pt of kids(c, 'pt')) pts.push((Number(att(pt, 'x')) / pw) * w, (Number(att(pt, 'y')) / ph) * h);
  for (const kind of ['triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'arrow', 'larrow', 'uarrow', 'darrow', 'chevron', 'parallelogram', 'trapezoid', 'plus', 'heart', 'callout', 'ellipse'] as ShapeKind[]) {
    const want = shapeOutline(kind, w, h).flatMap((c) => c.slice(1) as number[]);
    if (want.length === pts.length && want.every((v, i) => Math.abs(v - pts[i]) <= Math.max(1, Math.max(w, h) * 0.01))) return kind;
  }
  return null;
}

/** A custom outline as an SVG picture of the shape (its fill and line), for a freeform the slides have no shape for. */
function freeformSvg(geom: X, w: number, h: number, fill: string, line: string, lineW: number): string | null {
  const paths: string[] = [];
  for (const p of kids(kid(geom, 'pathLst'), 'path')) {
    const pw = Number(att(p, 'w') ?? 0) || w;
    const ph = Number(att(p, 'h') ?? 0) || h;
    const X1 = (v: string | undefined) => (Number(v ?? 0) / pw) * w;
    const Y1 = (v: string | undefined) => (Number(v ?? 0) / ph) * h;
    let d = '';
    let cx = 0;
    let cy = 0;
    for (const c of kids(p)) {
      const pt = kids(c, 'pt').map((q) => [X1(att(q, 'x')), Y1(att(q, 'y'))]);
      if (c.n === 'moveTo' && pt[0]) [cx, cy] = pt[0];
      if (c.n === 'moveTo' && pt[0]) d += `M${pt[0][0]} ${pt[0][1]}`;
      else if (c.n === 'lnTo' && pt[0]) ((d += `L${pt[0][0]} ${pt[0][1]}`), ([cx, cy] = pt[0]));
      else if (c.n === 'cubicBezTo' && pt.length === 3) ((d += `C${pt.map((q) => q.join(' ')).join(' ')}`), ([cx, cy] = pt[2]));
      else if (c.n === 'quadBezTo' && pt.length === 2) ((d += `Q${pt.map((q) => q.join(' ')).join(' ')}`), ([cx, cy] = pt[1]));
      else if (c.n === 'arcTo') {
        const wr = X1(att(c, 'wR'));
        const hr = Y1(att(c, 'hR'));
        const st = (Number(att(c, 'stAng') ?? 0) / 60000) * (Math.PI / 180);
        const sw = (Number(att(c, 'swAng') ?? 0) / 60000) * (Math.PI / 180);
        // The arc's centre from where it starts on the ellipse.
        const ox = cx - wr * Math.cos(st);
        const oy = cy - hr * Math.sin(st);
        const ex = ox + wr * Math.cos(st + sw);
        const ey = oy + hr * Math.sin(st + sw);
        d += `A${wr} ${hr} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${ex} ${ey}`;
        [cx, cy] = [ex, ey];
      } else if (c.n === 'close') d += 'Z';
    }
    if (d) paths.push(d);
  }
  if (!paths.length) return null;
  const n = (v: number) => Math.round(v * 100) / 100;
  const body = paths.map((d) => `<path d="${d.replace(/-?\d+(\.\d+)?(e-?\d+)?/g, (m) => String(n(Number(m))))}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="${-lineW / 2} ${-lineW / 2} ${n(w + lineW)} ${n(h + lineW)}" fill="${fill}" stroke="${line}" stroke-width="${lineW}">${body}</svg>`;
}

/** A fill (solid, a gradient's ends at its angle, a pattern's colour), or a style's reference to one. */
function fillOf(f: Frame, spPr: X | undefined, style: X | undefined): { fill?: string; fill2?: string; angle?: number; none?: boolean } {
  const el = kids(spPr).find((k) => ['solidFill', 'gradFill', 'noFill', 'pattFill', 'blipFill', 'grpFill'].includes(k.n));
  if (el?.n === 'noFill') return { none: true };
  if (el?.n === 'solidFill') {
    // A fill nobody can see is none.
    const c = colorOf(colorKid(el), f.pal);
    return c && c.a <= 0.002 ? { none: true } : { fill: deckColor(f, c) };
  }
  if (el?.n === 'gradFill') {
    const stops = kids(kid(el, 'gsLst'), 'gs').sort((a, b) => Number(att(a, 'pos') ?? 0) - Number(att(b, 'pos') ?? 0));
    const a = stops[0] ? colorOf(colorKid(stops[0]), f.pal) : null;
    const b = stops.at(-1) ? colorOf(colorKid(stops.at(-1)), f.pal) : null;
    const ang = att(kid(el, 'lin'), 'ang');
    return { fill: deckColor(f, a), fill2: deckColor(f, b), angle: ang !== undefined ? Math.round((((Number(ang) / 60000 + 90) % 360) + 360) % 360) : 180 };
  }
  if (el?.n === 'pattFill') return { fill: deckColor(f, colorOf(colorKid(kid(el, 'fgClr')), f.pal)) };
  if (el) return {};
  // A style's fill: its colour (the theme's fill styles are solid, or gradients of it).
  const ref = kid(style, 'fillRef');
  if (ref && Number(att(ref, 'idx') ?? 0) > 0) return { fill: deckColor(f, colorOf(colorKid(ref), f.pal)) };
  return {};
}

/** A line: its colour, width and dashes, or a style's reference to one; none when it has none. */
function lineOf(f: Frame, spPr: X | undefined, style: X | undefined): { line?: string; lineW?: number; dash?: string; head?: string; tail?: string } {
  const ln = kid(spPr, 'ln');
  const ref = kid(style, 'lnRef');
  const refIdx = Number(att(ref, 'idx') ?? 0);
  if (kid(ln, 'noFill')) return {};
  const fillEl = kid(ln, 'solidFill') ?? kid(ln, 'gradFill');
  let c = fillEl ? colorOf(colorKid(fillEl.n === 'gradFill' ? kid(kid(fillEl, 'gsLst'), 'gs') : fillEl), f.pal) : null;
  let w = att(ln, 'w');
  if (!c && refIdx > 0) {
    c = colorOf(colorKid(ref), f.pal);
    w ??= att(f.lines[refIdx - 1], 'w');
  }
  // A line nobody can see is none.
  if (!c || c.a <= 0.002 || (w !== undefined && Number(w) <= 0)) return {};
  const dash = att(kid(ln, 'prstDash'), 'val');
  const cust = kids(kid(ln, 'custDash'), 'ds');
  const ends = (n: string) => {
    const t = att(kid(ln, n), 'type');
    return t === 'triangle' || t === 'arrow' || t === 'stealth' ? 'arrow' : t === 'oval' || t === 'diamond' ? 'dot' : undefined;
  };
  const out: { line?: string; lineW?: number; dash?: string; head?: string; tail?: string } = { line: deckColor(f, c), lineW: Math.max(0.5, px(f, Number(w ?? 12700))) };
  if (dash && dash !== 'solid') out.dash = /dot/i.test(dash) && !/dash/i.test(dash) ? 'dot' : 'dash';
  else if (cust.length) out.dash = Number(att(cust[0], 'd') ?? 0) <= 100000 ? 'dot' : 'dash';
  const head = ends('headEnd');
  const tail = ends('tailEnd');
  if (head) out.head = head;
  if (tail) out.tail = tail;
  return out;
}

const hasShadow = (spPr: X | undefined, style: X | undefined) => !!xpath(spPr, 'effectLst', 'outerShdw') || (!kid(spPr, 'effectLst') && Number(att(kid(style, 'effectRef'), 'idx') ?? 0) > 1);

/** A part's box on the app's slide (or in its group), its turn and flips: from its own xfrm, else its placeholder's. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  flipH?: boolean;
  flipV?: boolean;
}

/** How a container's coordinates map to the app's: pixels per EMU across and down, and the corner to measure from. */
interface Space {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  /** Where the container's corner lands (the slide's offset on the app's slide; 0 in a group). */
  dx: number;
  dy: number;
}

function boxOf(space: Space, xfrm: X | undefined): Box | null {
  const off = kid(xfrm, 'off');
  const ext = kid(xfrm, 'ext');
  if (!off || !ext) return null;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const b: Box = {
    x: r2(space.dx + (Number(att(off, 'x') ?? 0) - space.ox) * space.sx),
    y: r2(space.dy + (Number(att(off, 'y') ?? 0) - space.oy) * space.sy),
    w: r2(Number(att(ext, 'cx') ?? 0) * space.sx),
    h: r2(Number(att(ext, 'cy') ?? 0) * space.sy),
  };
  const rot = Number(att(xfrm, 'rot') ?? 0) / 60000;
  if (rot) b.rot = Math.round((((rot % 360) + 360) % 360) * 100) / 100;
  if (att(xfrm, 'flipH') === '1') b.flipH = true;
  if (att(xfrm, 'flipV') === '1') b.flipV = true;
  return b;
}

// ---- a slide -------------------------------------------------------------------------------------------------------------

interface SlideCtx {
  f: Frame;
  part: string;
  rels: ReturnType<typeof rels>;
  layout: Sheet | null;
  master: Sheet | null;
  /** The file's shape ids, to the deck's part ids (connectors' ends, animations, comments). */
  ids: Map<string, string>;
  /** Connectors' ends to stick once every part has its id: the connector, and the file's ids of the shapes and their sites. */
  sticks: { el: Obj; st?: [string, number]; end?: [string, number] }[];
  /** The slides' files, by their numbers in the deck (links between slides). */
  slideNos: Map<string, number>;
  footer: { dt?: string; ftr?: string; sldNum?: boolean };
  next: () => string;
  /** Where each kind of shape is a site of PowerPoint's (its own shapes'), for a connector's side. */
  kinds: Map<string, { kind: string; box: Box }>;
}

const mediaType = (b: Buffer): string | null => {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.toString('latin1', 0, 3) === 'GIF') return 'image/gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  const head = b.toString('utf8', 0, Math.min(512, b.length));
  if (/<svg[\s>]/.test(head) || (/^\s*<\?xml/.test(head) && b.toString('utf8', 0, Math.min(4096, b.length)).includes('<svg'))) return 'image/svg+xml';
  return null;
};

/** A picture part as a data address the deck takes in, or null for a kind no browser shows (EMF, WMF, TIFF…). */
function pictureData(c: SlideCtx, rid: string | undefined): string | null {
  const t = rid ? c.rels.get(rid) : undefined;
  if (!t || t.external) return null;
  const b = c.f.zip.read(t.target);
  const mime = b ? mediaType(b) : null;
  if (!b || !mime) {
    if (b) c.f.notes.add('Pictures in formats a browser cannot show (EMF, WMF, TIFF) were left out.');
    return null;
  }
  return `data:${mime};base64,${b.toString('base64')}`;
}

function linkOf(c: SlideCtx, el: X | undefined): string | undefined {
  if (!el) return undefined;
  const rid = patt(el, 'id') ?? '';
  if (att(el, 'action')?.includes('hlinksldjump')) {
    const t = c.rels.get(rid)?.target;
    const n = t ? c.slideNos.get(t) : undefined;
    return n ? `#${n}` : undefined;
  }
  const t = c.rels.get(rid);
  return t?.external && /^(https?:|mailto:|tel:)/i.test(t.target) ? t.target : undefined;
}

/** A part's name, kept where someone gave it (not PowerPoint's or this app's own "Rectangle 3", "Text 5"); Morph's "!!…" names its pair. */
function named(el: Obj, name: string | undefined) {
  if (!name) return;
  const m = /^!!(.+)$/.exec(name);
  if (m) {
    const key = `m-${m[1].replace(/[^A-Za-z0-9_-]/g, '')}`.slice(0, 24);
    if (key) el.key = key;
    return;
  }
  if (
    /^(Title|Subtitle|Text|TextBox|Text Box|Shape|Rectangle|Rounded Rectangle|Oval|Picture|Line|Connector|Straight Connector|Straight Arrow Connector|Elbow Connector|Table|Chart|Icon|Equation|Group|Video|Placeholder|Content Placeholder|Text Placeholder|Picture Placeholder|Freeform|Google Shape)( \d+)*$/i.test(
      name.trim(),
    )
  )
    return;
  el.name = name.trim().slice(0, 60);
}

/** Text and shape placeholders' roles as the app's: titles, subtitles, text. */
const roleOf = (type: string | undefined) => (type === 'title' || type === 'ctrTitle' ? 'title' : type === 'subTitle' ? 'subtitle' : 'body');

/** A part's own geometry, its placeholder's, and the text chain it takes its words' look from. */
function shapeParts(c: SlideCtx, sp: X, nvName: string) {
  const nvPr = xpath(sp, nvName, 'nvPr');
  const ph = kid(nvPr, 'ph');
  const type = ph ? (att(ph, 'type') ?? 'obj') : undefined;
  const idx = Number(att(ph, 'idx') ?? 0);
  const lay = ph ? matchPh(c.layout, type!, idx) : undefined;
  const mas = ph ? matchPh(c.master, type!, idx, true) : undefined;
  const style = kid(sp, 'style');
  const fontRef = kid(style, 'fontRef');
  const titleish = type === 'title' || type === 'ctrTitle';
  const foot = type === 'dt' || type === 'ftr' || type === 'sldNum';
  const chain: Chain = {
    lsts: [xpath(sp, 'txBody', 'lstStyle'), xpath(lay, 'txBody', 'lstStyle'), xpath(mas, 'txBody', 'lstStyle'), ph ? (titleish ? c.f.titleStyle : foot ? c.f.otherStyle : c.f.bodyStyle) : undefined, c.f.defaults].filter(Boolean),
    bodyPrs: [xpath(sp, 'txBody', 'bodyPr'), xpath(lay, 'txBody', 'bodyPr'), xpath(mas, 'txBody', 'bodyPr')],
    ...(fontRef ? { fontRef: { font: att(fontRef, 'idx') === 'major' ? '+mj-lt' : att(fontRef, 'idx') === 'minor' ? '+mn-lt' : undefined, color: colorOf(colorKid(fontRef), c.f.pal) ?? undefined } } : {}),
  };
  const xfrm = xpath(sp, 'spPr', 'xfrm') ?? xpath(sp, 'xfrm') ?? xpath(lay, 'spPr', 'xfrm') ?? xpath(mas, 'spPr', 'xfrm');
  return { ph, type, chain, xfrm, style, lay, mas };
}

/** The words of a placeholder's text as plain text (the footer's). */
const plain = (body: X | undefined) =>
  kids(body, 'p')
    .map((p) =>
      kids(p)
        .map((x) => (x.n === 'r' || x.n === 'fld' ? textOf(kid(x, 't')) : x.n === 'br' ? '\n' : ''))
        .join(''),
    )
    .join('\n')
    .trim();

function textShape(c: SlideCtx, sp: X, space: Space, depth: number): Obj | null {
  const { ph, type, chain, xfrm, style } = shapeParts(c, sp, 'nvSpPr');
  const f = c.f;
  const body = kid(sp, 'txBody');
  // The footer, the date and the slide's number are the deck's footer.
  if (type === 'dt' || type === 'ftr' || type === 'sldNum') {
    if (type === 'sldNum') c.footer.sldNum = true;
    else {
      const words = plain(body);
      if (words) c.footer[type] = all(body, 'fld').some((x) => /^datetime/.test(att(x, 'type') ?? '')) ? 'today' : words;
    }
    return null;
  }
  if (type === 'sldImg' || type === 'hdr') return null;
  // A line drawn as a shape is a line.
  if (/^(line|straightConnector1|bentConnector[2-5]|curvedConnector[2-5])$/.test(att(xpath(sp, 'spPr', 'prstGeom'), 'prst') ?? '') && !plain(kid(sp, 'txBody'))) return connector(c, sp, space, 'nvSpPr');
  const box = boxOf(space, xfrm);
  if (!box) return null;
  const cNvPr = xpath(sp, 'nvSpPr', 'cNvPr');
  const name = att(cNvPr, 'name');
  const spPr = kid(sp, 'spPr');
  const prstGeom = kid(spPr, 'prstGeom');
  const custGeom = kid(spPr, 'custGeom');
  const prst = att(prstGeom, 'prst') ?? (custGeom ? 'cust' : 'rect');
  const fill = fillOf(f, spPr, style);
  const line = lineOf(f, spPr, style);
  // A rounded box: its corner, and its words as far in as PowerPoint keeps them (0.29 of the corner further in).
  let radius: number | undefined;
  if (prst === 'roundRect') {
    const adj = Number(/val (\d+)/.exec(att(kid(kid(prstGeom, 'avLst'), 'gd'), 'fmla') ?? '')?.[1] ?? 16667);
    radius = Math.round((Math.min(50000, adj) / 100000) * Math.min(box.w, box.h) * 100) / 100;
  }
  const role = ph ? roleOf(type) : 'body';
  const t = wordsOf(f, body, chain, (el) => linkOf(c, el), radius ? radius * 0.29289 : 0, role);
  // The equation this app wrote as its LaTeX (no picture of it could be made).
  if (name && /^Equation\b/.test(name) && t && !t.empty && t.font === 'Cambria Math') return { type: 'math', ...box, tex: plain(body), ...(t.color ? { color: t.color } : {}) };
  // A shape filled with a picture (as LibreOffice and others write pictures with corners) is a picture.
  const blipFill = kid(spPr, 'blipFill');
  if (blipFill) {
    const src = pictureData(c, patt(kid(blipFill, 'blip'), 'embed'));
    if (src) {
      const el: Obj = { type: 'image', ...box, src };
      const sr = kid(blipFill, 'srcRect');
      const cut = (k: string) => Math.max(0, Number(att(sr, k) ?? 0) / 100000);
      if (sr && (cut('l') || cut('t') || cut('r') || cut('b'))) el.crop = { l: cut('l'), t: cut('t'), r: cut('r'), b: cut('b') };
      else el.fit = 'fill';
      if (radius !== undefined) el.radius = radius;
      else if (prst === 'ellipse') el.radius = Math.min(box.w, box.h) / 2;
      if (line.line) Object.assign(el, { line: line.line, lineW: line.lineW });
      if (hasShadow(spPr, style)) el.shadow = true;
      const op = alphaOf(kid(blipFill, 'blip'));
      if (op < 1) el.opacity = op;
      named(el, name);
      return el;
    }
  }
  let kind: ShapeKind | null = PRESETS[prst] ?? null;
  if (custGeom) {
    kind = ownKind(custGeom, box.w, box.h);
    if (!kind) {
      // A freeform the slides have no shape for: a picture of it, its words over it.
      const svg = freeformSvg(
        custGeom,
        box.w,
        box.h,
        fill.none ? 'none' : `#${rgbHex(hexRgb((colorHex(f, fill.fill) ?? 'cccccc').slice(0, 6)))}`,
        line.line ? `#${colorHex(f, line.line)?.slice(0, 6) ?? '000000'}` : 'none',
        line.line ? (line.lineW ?? 1) : 0,
      );
      const out: Obj[] = [];
      if (svg) out.push({ type: 'image', ...box, src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, fit: 'fill', alt: name ?? 'Shape' });
      if (t && !t.empty) out.push({ type: 'text', ...box, ...textProps(t, role) });
      f.notes.add('Freeform shapes came in as pictures of them (their words as text boxes over them).');
      return out.length > 1 ? { type: 'group', ...box, els: out.map((e) => ({ ...e, x: 0, y: 0 })) } : (out[0] ?? null);
    }
  } else if (!kind) {
    kind = /round|snip/i.test(prst) ? 'round' : 'rect';
    f.notes.add('Shapes the slides have none like came in as boxes.');
  }
  // A flipped arrow points the other way; a flipped triangle is turned.
  if (box.flipH && kind === 'arrow') kind = 'larrow';
  else if (box.flipH && kind === 'larrow') kind = 'arrow';
  else if (box.flipV && kind === 'uarrow') kind = 'darrow';
  else if (box.flipV && kind === 'darrow') kind = 'uarrow';
  else if (box.flipV && (kind === 'triangle' || kind === 'pentagon' || kind === 'star')) box.rot = Math.round((((box.rot ?? 0) + 180) % 360) * 100) / 100;
  const { flipH: _h, flipV: _v, ...at } = box;
  // A text box, a placeholder, or a box with neither fill nor line is a text part (a rounded one keeps its corners); others are shapes.
  const txBox = att(xpath(sp, 'nvSpPr', 'cNvSpPr'), 'txBox') === '1';
  const isText = (kind === 'rect' || (kind === 'round' && (txBox || !!ph))) && (txBox || !!ph || (!fill.fill && !line.line));
  const el: Obj = isText ? { type: 'text', ...at } : { type: 'shape', shape: kind, ...at };
  if (t) Object.assign(el, textProps(t, role));
  else Object.assign(el, { paras: [{ runs: [{ t: '' }] }], size: 24, fit: 'none' });
  if (ph && t?.empty) el.ph = type === 'title' || type === 'ctrTitle' ? 'Click to add a title' : type === 'subTitle' ? 'Click to add a subtitle' : 'Click to add text';
  if (!isText) {
    el.fill = fill.none ? 'none' : (fill.fill ?? 'none');
    if (fill.fill2) Object.assign(el, { fill2: fill.fill2, angle: fill.angle });
  } else if (fill.fill) el.fill = fill.fill;
  if (radius !== undefined) el.radius = radius;
  if (line.line) Object.assign(el, { line: line.line, lineW: line.lineW, ...(line.dash ? { dash: line.dash } : {}) });
  if (hasShadow(spPr, style)) el.shadow = true;
  const href = linkOf(c, kid(xpath(sp, 'nvSpPr', 'cNvPr'), 'hlinkClick'));
  if (href) el.link = href;
  named(el, name);
  if (depth === 0 && kind) c.kinds.set(att(cNvPr, 'id') ?? '', { kind: prst, box });
  return el;
}

/** A colour the deck keeps (a theme's name, or #hex) as RRGGBB(AA) for a picture drawn here. */
function colorHex(f: Frame, col: string | undefined): string | undefined {
  if (!col) return undefined;
  if (col.startsWith('#')) return col.slice(1);
  const t = f.theme as Record<string, unknown>;
  const m = /^c([1-6])$/.exec(col);
  const v = m ? (t.colors as string[])?.[Number(m[1]) - 1] : (t[col] as string | undefined);
  return typeof v === 'string' ? v.replace('#', '') : undefined;
}

/** A text's look as a part's: its words and, where they differ from the role's own, its size, font, colour, weight and spacing. */
function textProps(t: TextOut, role: string): Obj {
  const out: Obj = { role, paras: t.paras, size: t.size, fit: t.fit, pad: t.pad };
  for (const k of ['font', 'color', 'bold', 'italic', 'lh', 'gap', 'ls', 'align', 'valign'] as const) if (t[k] !== undefined) out[k] = t[k];
  return out;
}

function picture(c: SlideCtx, pic: X, space: Space, depth: number): Obj | null {
  const f = c.f;
  const { xfrm, ph } = shapeParts(c, pic, 'nvPicPr');
  const box = boxOf(space, xfrm);
  if (!box) return null;
  const cNvPr = xpath(pic, 'nvPicPr', 'cNvPr');
  const name = att(cNvPr, 'name') ?? '';
  const descr = att(cNvPr, 'descr') ?? att(cNvPr, 'title') ?? '';
  const nvPr = xpath(pic, 'nvPicPr', 'nvPr');
  const blip = xpath(pic, 'blipFill', 'blip');
  const svgRid = all(blip, 'svgBlip').map((s) => patt(s, 'embed'))[0];
  const spPr = kid(pic, 'spPr');
  // A video inside the file: kept with the deck, its still the picture.
  const media = all(nvPr, 'media')[0];
  const videoFile = kid(nvPr, 'videoFile');
  if (media || videoFile) return video(c, pic, box, media, videoFile, blip, name);
  // This app's icon: its SVG's lines, colour and width.
  if (svgRid) {
    const svg = c.rels.get(svgRid);
    const text = svg && !svg.external ? c.f.zip.text(svg.target) : null;
    const icon = text ? iconOf(text) : null;
    if (icon && /^Icon\b/.test(name)) {
      const { flipH: _h, flipV: _v, ...at } = box;
      const el: Obj = { type: 'icon', ...at, icon: descr.trim().replace(/\s+/g, '-').toLowerCase() || 'icon', paths: icon.paths, color: deckColor(f, icon.color), ...(icon.lineW !== 2 ? { lineW: icon.lineW } : {}) };
      const op = alphaOf(blip);
      if (op < 1) el.opacity = op;
      named(el, name);
      return el;
    }
  }
  // This app's equation, as its picture: its LaTeX again.
  if (/^Equation\b/.test(name) && descr) {
    const { flipH: _h, flipV: _v, ...at } = box;
    return { type: 'math', ...at, tex: descr };
  }
  const src = (svgRid ? pictureData(c, svgRid) : null) ?? pictureData(c, patt(blip, 'embed'));
  if (!src) return ph ? { type: 'image', ...box, src: '' } : null;
  const el: Obj = { type: 'image', ...box, src, ...(descr ? { alt: descr } : {}) };
  // Cut off, or fitted inside with margins (a crop by less than nothing): the app's cover and contain where they are those.
  const sr = xpath(pic, 'blipFill', 'srcRect');
  const v = (k: string) => Number(att(sr, k) ?? 0) / 100000;
  const [l, t, r, b] = [v('l'), v('t'), v('r'), v('b')];
  const size = imageSize(c, patt(blip, 'embed'));
  if (sr && (l || t || r || b)) {
    if (l <= 0 && t <= 0 && r <= 0 && b <= 0) el.fit = 'contain';
    else if (size && Math.abs(l - r) < 0.002 && Math.abs(t - b) < 0.002 && Math.abs((1 - l - r) * size.w * box.h - (1 - t - b) * size.h * box.w) < 0.01 * size.w * box.h) {
      // Cut evenly to the box's shape: the app's cover.
    } else el.crop = { l: Math.max(0, l), t: Math.max(0, t), r: Math.max(0, r), b: Math.max(0, b) };
  } else if (size && Math.abs(size.w / size.h - box.w / Math.max(1, box.h)) > 0.01) el.fit = 'fill';
  const op = alphaOf(blip);
  if (op < 1) el.opacity = op;
  // Its colours as PowerPoint's effects change them.
  const adjust: Obj = {};
  if (kid(blip, 'grayscl')) adjust.gray = true;
  const lum = kid(blip, 'lum');
  if (lum) {
    if (att(lum, 'bright')) adjust.bright = Math.round(Number(att(lum, 'bright')) / 1000);
    if (att(lum, 'contrast')) adjust.contrast = Math.round(Number(att(lum, 'contrast')) / 1000);
  }
  const hsl = kid(blip, 'hsl');
  if (hsl && att(hsl, 'sat')) adjust.sat = Math.round(100 + Number(att(hsl, 'sat')) / 1000);
  const blur = kid(blip, 'blur');
  if (blur) adjust.blur = Math.round(px(f, Number(att(blur, 'rad') ?? 0)) * 100) / 100;
  if (Object.keys(adjust).length) el.adjust = adjust;
  const geom = att(kid(spPr, 'prstGeom'), 'prst');
  if (geom === 'roundRect') {
    const adj = Number(/val (\d+)/.exec(att(xpath(spPr, 'prstGeom', 'avLst', 'gd'), 'fmla') ?? '')?.[1] ?? 16667);
    el.radius = Math.round((Math.min(50000, adj) / 100000) * Math.min(box.w, box.h) * 100) / 100;
  } else if (geom === 'ellipse') el.radius = Math.round((Math.min(box.w, box.h) / 2) * 100) / 100;
  const line = lineOf(f, spPr, kid(pic, 'style'));
  if (line.line) Object.assign(el, { line: line.line, lineW: line.lineW });
  if (hasShadow(spPr, kid(pic, 'style'))) el.shadow = true;
  const href = linkOf(c, kid(cNvPr, 'hlinkClick'));
  if (href) el.link = href;
  named(el, name);
  if (depth === 0) c.kinds.set(att(cNvPr, 'id') ?? '', { kind: 'rect', box });
  return el;
}

const alphaOf = (blip: X | undefined) => {
  const a = att(kid(blip, 'alphaModFix'), 'amt');
  return a !== undefined ? Math.max(0, Math.min(1, Math.round(Number(a) / 1000) / 100)) : 1;
};

/** A picture's size in pixels from its first bytes (PNG, JPEG, GIF, WebP). */
function imageSize(c: SlideCtx, rid: string | undefined): { w: number; h: number } | null {
  const t = rid ? c.rels.get(rid) : undefined;
  const b = t && !t.external ? c.f.zip.read(t.target) : null;
  if (!b || b.length < 24) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString('latin1', 0, 3) === 'GIF') return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length; ) {
      if (b[i] !== 0xff) return null;
      const m = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + len;
    }
  }
  return null;
}

/** An icon this app wrote (iconSvgText): its lines, colour and width, or null for another SVG. */
function iconOf(svg: string): { paths: unknown[]; color: Rgb | null; lineW: number } | null {
  const root = parseXml(svg).root;
  if (root.n !== 'svg' || att(root, 'viewBox') !== '0 0 24 24' || !att(root, 'stroke')) return null;
  const paths = iconNodes(kids(root).map((k) => [k.n, k.a]));
  if (!paths.length) return null;
  const hex = /^#([0-9a-f]{6})$/i.exec(att(root, 'stroke') ?? '')?.[1];
  const op = Number(att(root, 'stroke-opacity') ?? 1);
  return { paths, color: hex ? { ...hexRgb(hex), a: op } : null, lineW: Number(att(root, 'stroke-width') ?? 2) || 2 };
}

/** A video in the file, kept with the deck (its still the picture); one linked online (YouTube, Vimeo) as that one. */
function video(c: SlideCtx, pic: X, box: Box, media: X | undefined, videoFile: X | undefined, blip: X | undefined, name: string): Obj | null {
  const { flipH: _h, flipV: _v, ...at } = box;
  const poster = pictureData(c, patt(blip, 'embed')) ?? undefined;
  const linked = c.rels.get(patt(videoFile, 'link') ?? '');
  const online = linked?.external ? videoSrc(linked.target) : null;
  const el: Obj = { type: 'video', ...at, ...(poster ? { poster } : {}) };
  const trim = Number(att(kid(media, 'trim'), 'st') ?? 0);
  if (trim > 0) el.start = Math.round(trim / 1000);
  named(el, name === 'Video' ? undefined : name);
  if (online) return { ...el, src: online };
  const inner = c.rels.get(patt(media, 'embed') ?? '') ?? (linked && !linked.external ? linked : undefined);
  const data = inner && !inner.external ? c.f.zip.read(inner.target, 220 * 1024 * 1024) : null;
  if (!data) {
    c.f.notes.add('Videos kept outside the file were left out.');
    return poster ? { type: 'image', ...at, src: poster, alt: 'Video' } : null;
  }
  // Kept by the app's video store when the import has it (a temporary file it copies), else left as their still.
  return { ...el, src: '', __video: data, __ext: path.extname(inner!.target).slice(1) || 'mp4' };
}

function tableFrame(c: SlideCtx, gf: X, box: Box, tbl: X): Obj {
  const f = c.f;
  const grid = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => Number(att(g, 'w') ?? 0));
  const trs = kids(tbl, 'tr');
  const tblPr = kid(tbl, 'tblPr');
  const head = att(tblPr, 'firstRow') === '1';
  const band = att(tblPr, 'bandRow') === '1';
  const rows: string[][] = [];
  const merges: Obj[] = [];
  const fills: Record<string, string> = {};
  let size: number | undefined;
  let font: string | undefined;
  let color: string | undefined;
  let headColor: string | undefined;
  let headFill: string | undefined;
  let line: string | undefined;
  const aligns: string[] = [];
  const chain: Chain = { lsts: [f.defaults].filter(Boolean), bodyPrs: [] };
  trs.forEach((tr, ri) => {
    const row: string[] = [];
    kids(tr, 'tc').forEach((tc, ci) => {
      const body = kid(tc, 'txBody');
      const words = plain(body);
      row.push(att(tc, 'hMerge') === '1' || att(tc, 'vMerge') === '1' ? '' : words);
      const rs = Number(att(tc, 'rowSpan') ?? 1);
      const cs = Number(att(tc, 'gridSpan') ?? 1);
      if (rs > 1 || cs > 1) merges.push({ r: ri, c: ci, rs, cs });
      const t = wordsOf(f, body, chain, () => undefined);
      if (t && !t.empty) {
        if (ri === (head ? 1 : 0) || size === undefined) {
          size ??= t.size;
          font ??= t.font;
          if (ri > 0 || !head) color ??= t.color;
        }
        if (ri === 0 && head) headColor ??= t.color;
        if (ri === (head ? 1 : 0) && aligns.length <= ci) aligns[ci] = t.align ?? 'left';
      }
      const tcPr = kid(tc, 'tcPr');
      const fill = fillOf(f, tcPr, undefined);
      if (fill.fill && fill.fill !== 'transparent') {
        if (ri === 0 && head && !headFill) headFill = fill.fill;
        fills[`${ri},${ci}`] = fill.fill;
      }
      const border = kid(tcPr, 'lnB') ?? kid(tcPr, 'lnL');
      if (!line && border && !kid(border, 'noFill')) line = deckColor(f, colorOf(colorKid(kid(border, 'solidFill')), f.pal));
    });
    rows.push(row);
  });
  // The header's and the bands' fills are the table's own (the deck's defaults where they are those); other cells keep theirs.
  for (const k of Object.keys(fills)) {
    const [ri] = k.split(',').map(Number);
    if ((ri === 0 && head && fills[k] === headFill) || (band && !(ri === 0 && head) && fills[k] === 'soft')) delete fills[k];
  }
  const sum = grid.reduce((a, b) => a + b, 0) || 1;
  const el: Obj = { type: 'table', ...box, rows, head, band, size: size ?? 20, cols: grid.map((w) => Math.round((w / sum) * 1000) / 100) };
  if (font) el.font = font;
  if (color) el.color = color;
  if (headFill) el.fill = headFill;
  if (headColor) el.headColor = headColor;
  if (line) el.line = line;
  if (aligns.some((a) => a && a !== 'left')) el.aligns = aligns.map((a) => a ?? 'left');
  if (merges.length) el.merges = merges;
  if (Object.keys(fills).length) el.fills = fills;
  named(el, att(xpath(gf, 'nvGraphicFramePr', 'cNvPr'), 'name'));
  return el;
}

function chartFrame(c: SlideCtx, gf: X, box: Box, ref: X): Obj | null {
  const f = c.f;
  const t = c.rels.get(patt(ref, 'id') ?? '');
  const xml = t && !t.external ? f.zip.text(t.target) : null;
  if (!xml) return null;
  const root = parseXml(xml).root;
  const plot = xpath(root, 'chart', 'plotArea');
  const types: [string, string][] = [
    ['barChart', 'column'],
    ['bar3DChart', 'column'],
    ['lineChart', 'line'],
    ['line3DChart', 'line'],
    ['areaChart', 'area'],
    ['area3DChart', 'area'],
    ['pieChart', 'pie'],
    ['pie3DChart', 'pie'],
    ['ofPieChart', 'pie'],
    ['doughnutChart', 'doughnut'],
    ['scatterChart', 'line'],
    ['radarChart', 'line'],
  ];
  const found = types.map(([n, k]) => [kid(plot, n), k] as const).find(([x]) => !!x);
  if (!found) {
    f.notes.add('Charts of kinds the slides have none like were left out.');
    return null;
  }
  const [ch, k0] = found;
  let kind = k0;
  if (ch!.n.startsWith('bar') && att(kid(ch, 'barDir'), 'val') === 'bar') kind = 'bar';
  if (ch!.n === 'scatterChart' || ch!.n === 'radarChart' || ch!.n.includes('3D') || ch!.n === 'ofPieChart') f.notes.add('Charts PowerPoint draws in ways the slides do not (3-D, scatter, radar) came in as the nearest kind.');
  const grouping = att(kid(ch, 'grouping'), 'val');
  const cache = (el: X | undefined) => {
    const pts = all(el, 'pt').map((p) => [Number(att(p, 'idx') ?? 0), textOf(kid(p, 'v'))] as const);
    const out: string[] = [];
    for (const [i, v] of pts) out[i] = v;
    return out;
  };
  const sers = kids(ch, 'ser');
  const labels = cache(kid(sers[0], 'cat') ?? kid(sers[0], 'xVal')).map((x) => x ?? '');
  const series = sers.map((s, si) => {
    const name = cache(kid(s, 'tx')).join('') || textOf(xpath(s, 'tx', 'v')) || `Series ${si + 1}`;
    const values = cache(kid(s, 'val') ?? kid(s, 'yVal')).map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
    const out: Obj = { name, values };
    // Its own colour where it is not the theme's in turn.
    const col = deckColor(f, colorOf(colorKid(xpath(s, 'spPr', 'solidFill') ?? xpath(s, 'spPr', 'ln', 'solidFill')), f.pal));
    if (col && col !== `c${(si % 6) + 1}` && !(si === 0 && col === 'accent')) out.color = col;
    return out;
  });
  while (labels.length < Math.max(0, ...series.map((s) => (s.values as number[]).length))) labels.push(String(labels.length + 1));
  const el: Obj = { type: 'chart', ...box, kind, labels, series };
  const title = xpath(root, 'chart', 'title');
  const words = title
    ? all(title, 't')
        .map((x) => textOf(x))
        .join('')
    : '';
  if (words && att(xpath(root, 'chart', 'autoTitleDeleted'), 'val') !== '1') el.title = words;
  el.legend = !!xpath(root, 'chart', 'legend');
  if (all(ch, 'showVal').some((x) => att(x, 'val') === '1') || all(ch, 'showPercent').some((x) => att(x, 'val') === '1')) el.values = true;
  if (grouping === 'stacked' || grouping === 'percentStacked') el.stacked = true;
  el.grid = !!all(plot, 'majorGridlines').length;
  const sz = Number(att(xpath(root, 'txPr', 'p', 'pPr', 'defRPr') ?? all(xpath(plot, 'valAx') ?? plot, 'defRPr')[0], 'sz') ?? 0);
  if (sz) el.size = Math.max(6, Math.min(120, ptPx(f, sz)));
  const latin = att(all(root, 'latin')[0], 'typeface');
  const face = faceOf(f, latin);
  if (face && face !== (f.theme as { font?: string }).font) el.font = face;
  named(el, att(xpath(gf, 'nvGraphicFramePr', 'cNvPr'), 'name'));
  return el;
}

function graphicFrame(c: SlideCtx, gf: X, space: Space): Obj | null {
  const { xfrm } = shapeParts(c, gf, 'nvGraphicFramePr');
  const box = boxOf(space, xfrm);
  if (!box) return null;
  const data = xpath(gf, 'graphic', 'graphicData');
  const tbl = kid(data, 'tbl');
  if (tbl) return tableFrame(c, gf, box, tbl);
  const chart = kid(data, 'chart');
  if (chart) return chartFrame(c, gf, box, chart);
  c.f.notes.add('SmartArt, embedded objects and other graphics the slides have none like were left out.');
  return null;
}

/** A line, or a connector (stuck to the shapes it joins): `nv`, its non-visual part's name (a line drawn as a shape has a shape's). */
function connector(c: SlideCtx, cx: X, space: Space, nv = 'nvCxnSpPr'): Obj | null {
  const f = c.f;
  const xfrm = xpath(cx, 'spPr', 'xfrm');
  const box = boxOf(space, xfrm);
  if (!box) return null;
  // Its ends: the box's corners, flipped as it is, turned about its middle.
  let [x1, y1, x2, y2] = [box.x, box.y, box.x + box.w, box.y + box.h];
  if (box.flipH) [x1, x2] = [x2, x1];
  if (box.flipV) [y1, y2] = [y2, y1];
  if (box.rot) {
    const a = (box.rot * Math.PI) / 180;
    const mx = box.x + box.w / 2;
    const my = box.y + box.h / 2;
    const turn = (x: number, y: number) => [mx + (x - mx) * Math.cos(a) - (y - my) * Math.sin(a), my + (x - mx) * Math.sin(a) + (y - my) * Math.cos(a)];
    [x1, y1] = turn(x1, y1);
    [x2, y2] = turn(x2, y2);
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const ln = lineOf(f, kid(cx, 'spPr'), kid(cx, 'style'));
  const el: Obj = { type: 'line', x: r2(x1), y: r2(y1), w: r2(x2 - x1), h: r2(y2 - y1), width: ln.lineW ?? 1, color: ln.line ?? 'fg' };
  if (ln.dash) el.dash = ln.dash;
  if (ln.head) el.start = ln.head;
  if (ln.tail) el.end = ln.tail;
  const prst = att(xpath(cx, 'spPr', 'prstGeom'), 'prst') ?? '';
  if (/^bentConnector/.test(prst)) el.route = 'elbow';
  const ends = xpath(cx, nv, 'cNvCxnSpPr');
  const st = kid(ends, 'stCxn');
  const end = kid(ends, 'endCxn');
  if (st || end) c.sticks.push({ el, ...(st ? { st: [att(st, 'id') ?? '', Number(att(st, 'idx') ?? 0)] as [string, number] } : {}), ...(end ? { end: [att(end, 'id') ?? '', Number(att(end, 'idx') ?? 0)] as [string, number] } : {}) });
  named(el, att(xpath(cx, nv, 'cNvPr'), 'name'));
  return el;
}

function group(c: SlideCtx, g: X, space: Space, depth: number): Obj | null {
  const xfrm = xpath(g, 'grpSpPr', 'xfrm');
  const box = boxOf(space, xfrm);
  if (!box) return null;
  const cNvPr = xpath(g, 'nvGrpSpPr', 'cNvPr');
  // This app's online video: its still and play button, linked to the video's page.
  const descr = att(cNvPr, 'descr') ?? '';
  if (videoSrc(descr) && all(g, 'cNvPr').some((x) => att(x, 'name') === 'Play')) {
    const still = all(g, 'blip')[0];
    const poster = still ? pictureData(c, patt(still, 'embed')) : null;
    const { flipH: _h, flipV: _v, ...at } = box;
    const el: Obj = { type: 'video', ...at, src: videoSrc(descr), ...(poster && !/ytimg|youtube/.test(descr) ? { poster } : {}) };
    named(el, att(cNvPr, 'name'));
    return el;
  }
  const off = xpath(xfrm, 'chOff');
  const ext = xpath(xfrm, 'chExt');
  const cw = Number(att(ext, 'cx') ?? 0);
  const ch = Number(att(ext, 'cy') ?? 0);
  const inner: Space = {
    ox: Number(att(off, 'x') ?? 0),
    oy: Number(att(off, 'y') ?? 0),
    sx: cw ? box.w / cw : space.sx,
    sy: ch ? box.h / ch : space.sy,
    dx: 0,
    dy: 0,
  };
  const els = shapes(c, g, inner, depth + 1);
  if (!els.length) return null;
  if (box.flipH || box.flipV) c.f.notes.add('Flipped groups came in unflipped.');
  const { flipH: _h, flipV: _v, ...at } = box;
  const el: Obj = { type: 'group', ...at, els };
  named(el, att(cNvPr, 'name'));
  return el;
}

/** A tree of shapes (a slide's, or a group's) as parts, in their order. */
function shapes(c: SlideCtx, tree: X | undefined, space: Space, depth: number): Obj[] {
  const out: Obj[] = [];
  for (const x of kids(tree)) {
    let el: Obj | null = null;
    let id: string | undefined;
    if (x.n === 'sp') {
      el = textShape(c, x, space, depth);
      id = att(xpath(x, 'nvSpPr', 'cNvPr'), 'id');
    } else if (x.n === 'pic') {
      el = picture(c, x, space, depth);
      id = att(xpath(x, 'nvPicPr', 'cNvPr'), 'id');
    } else if (x.n === 'grpSp') {
      el = group(c, x, space, depth);
      id = att(xpath(x, 'nvGrpSpPr', 'cNvPr'), 'id');
    } else if (x.n === 'graphicFrame') {
      el = graphicFrame(c, x, space);
      id = att(xpath(x, 'nvGraphicFramePr', 'cNvPr'), 'id');
    } else if (x.n === 'cxnSp') {
      el = connector(c, x, space);
      id = att(xpath(x, 'nvCxnSpPr', 'cNvPr'), 'id');
    } else if (x.n === 'AlternateContent') {
      // PowerPoint's equations (Office Math) as LaTeX; else what an older program shows instead.
      const math = all(x, 'oMathPara')[0] ?? all(x, 'oMath')[0];
      const choice = kid(x, 'Choice');
      const sp = kids(choice).find((k) => k.n === 'sp');
      if (math && sp) {
        const { xfrm } = shapeParts(c, sp, 'nvSpPr');
        const box = boxOf(space, xfrm);
        const tex = texOfOmml(math);
        if (box && tex) {
          const { flipH: _h, flipV: _v, ...at } = box;
          out.push({ type: 'math', ...at, tex });
          continue;
        }
      }
      out.push(...shapes(c, kid(x, 'Fallback') ?? choice, space, depth));
      continue;
    } else if (x.n === 'contentPart') c.f.notes.add('Ink drawn on slides was left out.');
    if (!el) continue;
    const newId = c.next();
    el.id = newId;
    if (id) c.ids.set(id, newId);
    out.push(el);
  }
  return out;
}

/** A side of a part from a site PowerPoint knows it by (its own shapes' first sites: top, left, bottom, right; an oval's eight). */
function sideOf(kind: string | undefined, idx: number): 't' | 'r' | 'b' | 'l' {
  if (kind === 'ellipse') return (['t', 't', 'l', 'b', 'b', 'b', 'r', 't'] as const)[idx % 8];
  return (['t', 'l', 'b', 'r'] as const)[idx % 4];
}

// ---- motion, notes, comments ---------------------------------------------------------------------------------------------

function transitionOf(sld: X): Obj | undefined {
  // PowerPoint's own (Morph, or a length to the millisecond) in a Choice, with a plainer one beside it for others.
  const alt = kids(sld, 'AlternateContent').find((a) => all(a, 'transition').length);
  const morph = alt && all(alt, 'morph').length ? all(alt, 'transition')[0] : undefined;
  const tr = morph ?? kid(sld, 'transition') ?? (alt ? (all(kid(alt, 'Choice'), 'transition')[0] ?? all(alt, 'transition')[0]) : undefined);
  if (!tr) return undefined;
  const spd = att(tr, 'spd');
  const durAttr = Number(att(tr, 'dur') ?? 0);
  const dur = durAttr || (spd === 'fast' ? 400 : spd === 'slow' ? 1000 : 700);
  const adv = att(tr, 'advTm');
  const kinds: Record<string, string> = {
    fade: 'fade',
    dissolve: 'fade',
    push: 'push',
    wipe: 'wipe',
    cover: 'cover',
    pull: 'cover',
    zoom: 'zoom',
    split: 'split',
    morph: 'morph',
    cut: 'none',
    randomBar: 'wipe',
    blinds: 'wipe',
    checker: 'fade',
    circle: 'zoom',
    diamond: 'zoom',
    plus: 'zoom',
    wedge: 'wipe',
    wheel: 'wipe',
    strips: 'wipe',
    newsflash: 'zoom',
    random: 'fade',
  };
  const fxEl = morph ? all(morph, 'morph')[0] : kids(tr).find((k) => k.n !== 'sndAc' && k.n !== 'extLst');
  const fx = fxEl ? (kinds[fxEl.n] ?? 'fade') : 'none';
  const out: Obj = { fx, dur: Math.max(100, Math.min(5000, dur)) };
  const d = att(fxEl, 'dir');
  // PowerPoint says the way it moves; the app, the side it comes from.
  if (d && ['push', 'wipe', 'cover'].includes(fx)) out.dir = d === 'r' ? 'left' : d === 'd' ? 'up' : d === 'u' ? 'down' : 'right';
  if (adv) out.auto = Math.round(Number(adv) / 100) / 10;
  if (fx === 'none' && !adv) return undefined;
  return out;
}

/** PowerPoint's effects as the app's, by their preset numbers and kinds. */
const EFFECTS: Record<string, Record<number, string>> = {
  entr: { 1: 'appear', 10: 'fade', 2: 'fly', 42: 'float', 47: 'float', 53: 'zoom', 23: 'zoom', 22: 'wipe', 26: 'bounce', 16: 'wipe', 17: 'fade', 21: 'wipe' },
  exit: { 1: 'appear', 10: 'fade', 2: 'fly', 42: 'float', 47: 'float', 53: 'zoom', 23: 'zoom', 22: 'wipe' },
  emph: { 26: 'pulse', 32: 'shake', 8: 'spin', 6: 'grow' },
};

/** A slide's animations in their order (each click, with or after the one before), as the app's. */
function animsOf(c: SlideCtx, sld: X): Obj[] {
  const seq = all(sld, 'cTn').find((t) => att(t, 'nodeType') === 'mainSeq');
  if (!seq) return [];
  const out: Obj[] = [];
  for (const ctn of all(seq, 'cTn')) {
    const cls = att(ctn, 'presetClass');
    const node = att(ctn, 'nodeType');
    if (!cls || !node || !/Effect$/.test(node)) continue;
    const type = cls === 'entr' ? 'in' : cls === 'exit' ? 'out' : cls === 'emph' ? 'em' : null;
    if (!type) continue;
    const spTgt = all(ctn, 'spTgt')[0];
    const el = c.ids.get(att(spTgt, 'spid') ?? '');
    if (!el) continue;
    const preset = Number(att(ctn, 'presetID') ?? 0);
    const fx = EFFECTS[cls]?.[preset] ?? (type === 'em' ? 'pulse' : 'fade');
    const sub = Number(att(ctn, 'presetSubtype') ?? 0);
    const durs = all(ctn, 'cTn')
      .map((x) => Number(att(x, 'dur') ?? NaN))
      .filter((v) => Number.isFinite(v) && v > 1);
    const a: Obj = { el, type, fx, on: node === 'clickEffect' ? 'click' : node === 'afterEffect' ? 'after' : 'with', dur: Math.min(20000, Math.max(...durs, 0) || 500), delay: Math.max(0, Number(att(all(ctn, 'cond')[0], 'delay') ?? 0) || 0) };
    if (['fly', 'wipe', 'float'].includes(fx)) a.dir = sub === 8 ? 'left' : sub === 2 ? 'right' : sub === 1 ? 'up' : sub === 4 ? 'down' : fx === 'float' ? 'up' : 'left';
    // One paragraph at a time: the same part's effects, a paragraph each, as one.
    const para = all(spTgt, 'pRg')[0];
    if (para) {
      const prev = out[out.length - 1];
      if (prev && prev.el === el && prev.fx === fx && prev.type === type && prev.byPara) continue;
      a.byPara = true;
    }
    out.push(a);
  }
  return out.slice(0, SLIDE_LIMITS.anims);
}

function notesOf(c: SlideCtx): string | undefined {
  const t = [...c.rels.values()].find((r) => r.type === 'notesSlide');
  const xml = t ? c.f.zip.text(t.target) : null;
  if (!xml) return undefined;
  const root = parseXml(xml).root;
  for (const sp of all(root, 'sp')) {
    const ph = xpath(sp, 'nvSpPr', 'nvPr', 'ph');
    if (ph && (att(ph, 'type') ?? 'body') === 'body') {
      const words = plain(kid(sp, 'txBody'));
      if (words) return words.slice(0, SLIDE_LIMITS.notes);
    }
  }
  return undefined;
}

/** The comments on a slide, PowerPoint's old ones and its new (threaded, resolved), by You or an agent as their authors were named. */
function commentsOf(c: SlideCtx, authors: Map<string, string>, modernAuthors: Map<string, string>, els: Obj[]): Obj[] {
  const out: Obj[] = [];
  const who = (name: string | undefined) => (name === 'Agent' ? 'agent' : 'user');
  const corner = new Map<string, string>();
  for (const e of els) corner.set(`${Math.round(Math.max(Number(e.x), Number(e.x) + Number(e.w)))},${Math.round(Number(e.y))}`, String(e.id));
  for (const r of c.rels.values()) {
    const xml = r.external ? null : c.f.zip.text(r.target);
    if (!xml) continue;
    // The old comments (their words in p:text) and the new (in a text body), under the same name of relationship.
    const cms = r.type === 'comments' ? all(parseXml(xml).root, 'cm') : [];
    if (cms.length && cms.every((x) => kid(x, 'text'))) {
      const byKey = new Map<string, Obj>();
      for (const cm of cms) {
        const pos = kid(cm, 'pos');
        const x = Math.round(Number(att(pos, 'x') ?? 0) / 6);
        const y = Math.round(Number(att(pos, 'y') ?? 0) / 6);
        const at = Date.parse(`${att(cm, 'dt') ?? ''}${/Z$|[+-]\d\d:\d\d$/.test(att(cm, 'dt') ?? '') ? '' : 'Z'}`) || Date.now();
        const entry: Obj = { by: who(authors.get(att(cm, 'authorId') ?? '')), text: textOf(kid(cm, 'text')).slice(0, 4000), at };
        const parent = all(cm, 'parentCm')[0];
        const key = `${att(cm, 'authorId')}:${att(cm, 'idx')}`;
        if (parent) {
          const p = byKey.get(`${att(parent, 'authorId')}:${att(parent, 'idx')}`);
          if (p) {
            ((p.replies ??= []) as Obj[]).push(entry);
            continue;
          }
        }
        // On the part whose corner it marks, else where it is on the slide.
        const el = corner.get(`${x},${y}`);
        Object.assign(entry, el ? { el } : { x, y });
        byKey.set(key, entry);
        out.push(entry);
      }
    } else if (cms.length) {
      for (const cm of cms) {
        const text = (cm2: X) => plain(kid(cm2, 'txBody'));
        const entry: Obj = { by: who(modernAuthors.get(att(cm, 'authorId') ?? '')), text: text(cm).slice(0, 4000), at: Date.parse(att(cm, 'created') ?? '') || Date.now() };
        if (/resolved|closed/i.test(att(cm, 'status') ?? '')) entry.resolved = true;
        const pos = kid(cm, 'pos');
        if (pos) Object.assign(entry, { x: Math.round(Number(att(pos, 'x') ?? 0) / 6), y: Math.round(Number(att(pos, 'y') ?? 0) / 6) });
        const replies = all(kid(cm, 'replyLst'), 'reply').map((r2) => ({ by: who(modernAuthors.get(att(r2, 'authorId') ?? '')), text: text(r2).slice(0, 4000), at: Date.parse(att(r2, 'created') ?? '') || Date.now() }));
        if (replies.length) entry.replies = replies;
        if (entry.text) out.push(entry);
      }
    }
  }
  return out;
}

/** A slide's background: its own, else its layout's, else its master's (a colour, a gradient, a picture). */
function backgroundOf(c: SlideCtx, sld: X): Obj | undefined {
  const bg = xpath(sld, 'cSld', 'bg') ?? c.layout?.bg ?? c.master?.bg;
  if (!bg) return undefined;
  const pr = kid(bg, 'bgPr');
  if (pr) {
    const blip = xpath(pr, 'blipFill', 'blip');
    if (blip) {
      const image = pictureData(c, patt(blip, 'embed'));
      return image ? { image } : undefined;
    }
    const f = fillOf(c.f, pr, undefined);
    if (f.fill2) return { color: f.fill, to: f.fill2, angle: f.angle };
    return f.fill ? { color: f.fill } : undefined;
  }
  const ref = kid(bg, 'bgRef');
  const col = deckColor(c.f, colorOf(colorKid(ref), c.f.pal));
  return col ? { color: col } : undefined;
}

// ---- the whole file -----------------------------------------------------------------------------------------------------

/** The file's theme as the deck's: its colours as the app names them, its fonts; this app's own themes as they were. */
function deckTheme(zip: Zip, themePart: string | undefined, pal: Palette, titleColor: Rgb | null): { theme: Obj; major: string; minor: string; lines: X[] } {
  const root = themePart ? parseXml(zip.text(themePart) ?? '<a:theme/>').root : null;
  const name = att(root ?? undefined, 'name') ?? '';
  const hex = (n: string) => `#${(pal.scheme[pal.map[n] ?? n] ?? '000000').toLowerCase()}`;
  const fonts = xpath(root ?? undefined, 'themeElements', 'fontScheme');
  const major = att(xpath(fonts, 'majorFont', 'latin'), 'typeface') ?? 'Calibri Light';
  const minor = att(xpath(fonts, 'minorFont', 'latin'), 'typeface') ?? 'Calibri';
  const lines = kids(xpath(root ?? undefined, 'themeElements', 'fmtScheme', 'lnStyleLst'), 'ln');
  const ours = /^Hydor( |$)/.test(name);
  const presetId = /^Hydor ([a-z0-9-]+)$/.exec(name)?.[1];
  const preset = THEMES.find((t) => t.id === presetId);
  const bg = hexRgb(hex('bg1').slice(1));
  const fg = hexRgb(hex('tx1').slice(1));
  const mix = (a: Rgb, b: Rgb, k: number) => `#${rgbHex({ r: a.r * k + b.r * (1 - k), g: a.g * k + b.g * (1 - k), b: a.b * k + b.b * (1 - k), a: 1 })}`;
  const accent = ours ? `#${(pal.scheme.hlink ?? pal.scheme.accent1 ?? '2f6fec').toLowerCase()}` : `#${(pal.scheme.accent1 ?? '2f6fec').toLowerCase()}`;
  const ac = hexRgb(accent.slice(1));
  const light = (0.2126 * ac.r + 0.7152 * ac.g + 0.0722 * ac.b) / 255 > 0.6;
  const theme: Obj = {
    ...(preset ? { id: preset.id } : {}),
    bg: hex('bg1'),
    fg: hex('tx1'),
    head: ours ? hex('tx2') : titleColor ? `#${rgbHex(titleColor)}` : hex('tx1'),
    muted: ours ? `#${(pal.scheme.folHlink ?? '646b76').toLowerCase()}` : mix(fg, bg, 0.62),
    accent,
    accentFg: preset && preset.accent.toLowerCase() === accent ? preset.accentFg : light ? hex('tx1') : '#ffffff',
    soft: hex('bg2'),
    colors: ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map((k) => `#${(pal.scheme[k] ?? '888888').toLowerCase()}`),
    font: cleanFont(minor) ?? 'Inter',
    headFont: cleanFont(major) ?? 'Inter',
  };
  return { theme, major, minor, lines };
}

/** Which of the app's layouts a slide's layout is: this app's by its name, PowerPoint's by its kind. */
function layoutIdOf(layout: Sheet | null): LayoutId | undefined {
  if (!layout) return undefined;
  const name = att(kid(layout.root, 'cSld'), 'name') ?? '';
  const ours = LAYOUTS.find((l) => l.label === name);
  // A slide made of parts alone is on no layout.
  if (ours) return ours.id === 'blank' ? undefined : ours.id;
  const type = att(layout.root, 'type');
  const byType: Record<string, LayoutId> = { title: 'title', obj: 'content', tx: 'content', twoObj: 'two', twoColTx: 'two', secHead: 'section', titleOnly: 'title-only', picTx: 'image-right', tbl: 'table', chart: 'chart' };
  return type ? byType[type] : undefined;
}

/**
 * A .pptx file as a deck the app keeps, and notes on what came in otherwise. `db` keeps its videos (without it they
 * are left as their stills).
 */
export async function deckFromPptx(buf: Buffer, db?: DB): Promise<DeckFromFile> {
  const zip = new Zip(buf);
  const notes = new Set<string>();
  const rootRels = rels(zip, '');
  const main = [...rootRels.values()].find((r) => r.type === 'officeDocument')?.target ?? 'ppt/presentation.xml';
  const presXml = zip.text(main);
  if (!presXml) throw new Error('it has no presentation in it (is it a PowerPoint .pptx file?)');
  const pres = parseXml(presXml).root;
  const pr = rels(zip, main);
  const sz = kid(pres, 'sldSz');
  const W = Number(att(sz, 'cx') ?? 12192000) || 12192000;
  const H = Number(att(sz, 'cy') ?? 6858000) || 6858000;
  const ratio = Math.abs(H / W - 0.75) < Math.abs(H / W - 0.5625) ? '4:3' : '16:9';
  const appH = ratio === '4:3' ? 960 : 720;
  const k = Math.min(1280 / W, appH / H);
  if (Math.abs(H / W - (ratio === '4:3' ? 0.75 : 0.5625)) > 0.01) notes.add(`Its slides were not 16:9 or 4:3: they came in ${ratio}, their parts in their place on it.`);
  const slideIds = kids(kid(pres, 'sldIdLst'), 'sldId');
  const targets = slideIds.map((s) => pr.get(patt(s, 'id') ?? '')?.target).filter((t): t is string => !!t);
  const slideNos = new Map(targets.map((t, i) => [t, i + 1]));
  // The first master's theme and colours (decks with several keep each slide's own master for its placeholders).
  const masters = new Map<string, Sheet | null>();
  const sheet = (part: string | undefined) => {
    if (!part) return null;
    if (!masters.has(part)) masters.set(part, readSheet({ zip } as Frame, part));
    return masters.get(part)!;
  };
  const firstMaster = kids(kid(pres, 'sldMasterIdLst'), 'sldMasterId').map((m) => pr.get(patt(m, 'id') ?? '')?.target)[0];
  const ms = sheet(firstMaster);
  const mrels = firstMaster ? rels(zip, firstMaster) : new Map();
  const themePart = [...mrels.values()].find((r) => r.type === 'theme')?.target;
  const themeRoot = themePart ? parseXml(zip.text(themePart) ?? '').root : undefined;
  const scheme: Record<string, string> = {};
  for (const c of kids(xpath(themeRoot, 'themeElements', 'clrScheme'))) {
    const col = kids(c)[0];
    const v = col?.n === 'sysClr' ? att(col, 'lastClr') : att(col, 'val');
    if (v && /^[0-9a-f]{6}$/i.test(v)) scheme[c.n] = v.toUpperCase();
  }
  const cm = kid(ms?.root, 'clrMap');
  const map: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' };
  for (const [key, val] of Object.entries(cm?.a ?? {})) map[key] = val;
  const pal: Palette = { scheme, map };
  const txStyles = kid(ms?.root, 'txStyles');
  const titleStyle = kid(txStyles, 'titleStyle');
  const titleColor = colorOf(colorKid(xpath(titleStyle, 'lvl1pPr', 'defRPr', 'solidFill')), pal);
  const { theme, major, minor, lines } = deckTheme(zip, themePart, pal, titleColor);
  const f: Frame = {
    zip,
    pal,
    major,
    minor,
    lines,
    defaults: kid(pres, 'defaultTextStyle'),
    titleStyle,
    bodyStyle: kid(txStyles, 'bodyStyle'),
    otherStyle: kid(txStyles, 'otherStyle'),
    k: k,
    ox: (1280 - W * k) / 2,
    oy: (appH - H * k) / 2,
    theme,
    notes,
    db,
  };
  // The fonts the file carries: the slides show them where the app has them (its own load from Google) or this computer does.
  const carried = kids(kid(pres, 'embeddedFontLst'), 'embeddedFont')
    .map((e) => att(kid(e, 'font'), 'typeface') ?? '')
    .filter(Boolean);
  if (carried.length) notes.add(`It carries the fonts ${carried.join(', ')}: the slides show the app's own fonts as the editor loads them, and others only where this computer has them.`);
  let n = 0;
  const next = () => `p${(++n).toString(36)}`;
  const slides: Obj[] = [];
  let footer: { dt?: string; ftr?: string; sldNum?: boolean } | null = null;
  const footerOnSlide: boolean[] = [];
  // Comment authors, old and new.
  const authors = new Map<string, string>();
  const ca = [...pr.values()].find((r) => r.type === 'commentAuthors');
  if (ca) for (const a of all(parseXml(zip.text(ca.target) ?? '<x/>').root, 'cmAuthor')) authors.set(att(a, 'id') ?? '', att(a, 'name') ?? '');
  const modernAuthors = new Map<string, string>();
  const ma = [...pr.values()].find((r) => /authors$/i.test(r.type));
  if (ma) for (const a of all(parseXml(zip.text(ma.target) ?? '<x/>').root, 'author')) modernAuthors.set(att(a, 'id') ?? '', att(a, 'name') ?? '');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-pptx-import-'));
  try {
    for (const target of targets.slice(0, SLIDE_LIMITS.slides)) {
      const xml = zip.text(target);
      if (!xml) continue;
      const sld = parseXml(xml).root;
      const sr = rels(zip, target);
      const layoutPart = [...sr.values()].find((r) => r.type === 'slideLayout')?.target;
      const layout = sheet(layoutPart);
      const masterPart = layoutPart ? [...rels(zip, layoutPart).values()].find((r) => r.type === 'slideMaster')?.target : undefined;
      const c: SlideCtx = { f, part: target, rels: sr, layout, master: sheet(masterPart) ?? ms, ids: new Map(), sticks: [], slideNos, footer: {}, next, kinds: new Map() };
      const space: Space = { ox: 0, oy: 0, sx: k, sy: k, dx: f.ox, dy: f.oy };
      let els = shapes(c, xpath(sld, 'cSld', 'spTree'), space, 0);
      const slide: Obj = { id: next() };
      const lid = layoutIdOf(layout);
      if (lid) slide.layout = lid;
      const bg = backgroundOf(c, sld);
      // This app's darkened background picture: the shade over it is the background's.
      if (bg?.image && els[0]?.type === 'shape' && (els[0].name === undefined || els[0].name === 'Shade') && Number(els[0].w) >= 1279 && /^#000000[0-9a-f]{2}$/.test(String(els[0].fill))) {
        bg.dim = Math.round((parseInt(String(els[0].fill).slice(7), 16) / 255) * 100) / 100;
        els = els.slice(1);
      }
      // The theme's own background is the slide's own without saying so.
      if (bg && !(bg.color === 'bg' && !bg.to && !bg.image)) slide.bg = bg;
      // Connectors' ends: stuck to the parts they were stuck to, at the side PowerPoint's site is on.
      for (const s of c.sticks) {
        if (s.st && c.ids.has(s.st[0])) s.el.from = { el: c.ids.get(s.st[0]), at: sideOf(c.kinds.get(s.st[0])?.kind, s.st[1]) };
        if (s.end && c.ids.has(s.end[0])) s.el.to = { el: c.ids.get(s.end[0]), at: sideOf(c.kinds.get(s.end[0])?.kind, s.end[1]) };
      }
      // Videos inside the file, kept by the app.
      for (const e of everyObj(els)) {
        if (!e.__video) continue;
        const data = e.__video as Buffer;
        delete e.__video;
        const ext = String(e.__ext ?? 'mp4');
        delete e.__ext;
        let kept: string | null = null;
        if (db) {
          const file = path.join(tmp, `video-${Math.random().toString(36).slice(2)}.${ext.replace(/[^a-z0-9]/gi, '')}`);
          fs.writeFileSync(file, data);
          kept = await keepVideoFile(db, file, tmp)
            .then((r) => r.src)
            .catch(() => null);
          fs.rmSync(file, { force: true });
        }
        if (kept) e.src = kept;
        else {
          notes.add('Videos in formats the app does not keep (it keeps MP4, MOV and WebM) came in as their stills.');
          Object.assign(e, { type: 'image', src: e.poster ?? '', alt: 'Video' });
          delete e.poster;
        }
      }
      slide.els = els.slice(0, SLIDE_LIMITS.els);
      if (els.length > SLIDE_LIMITS.els) notes.add(`Slides with more than ${SLIDE_LIMITS.els} parts kept their first ${SLIDE_LIMITS.els}.`);
      if (att(sld, 'show') === '0') slide.hidden = true;
      const tr = transitionOf(sld);
      if (tr) slide.transition = tr;
      const anims = animsOf(c, sld);
      if (anims.length) slide.anims = anims;
      const words = notesOf(c);
      if (words) slide.notes = words;
      const comments = commentsOf(c, authors, modernAuthors, els);
      if (comments.length) slide.comments = comments;
      const on = !!(c.footer.ftr || c.footer.sldNum || c.footer.dt);
      footerOnSlide.push(on);
      if (on && !footer) footer = c.footer;
      slides.push(slide);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (targets.length > SLIDE_LIMITS.slides) notes.add(`The first ${SLIDE_LIMITS.slides} of its ${targets.length} slides came in.`);
  const model: Obj = { v: 1, ratio, theme, slides };
  // The footer: the deck's, on the slides that showed it (not on the title slide when only it went without).
  if (footer) {
    model.footer = { ...(footer.sldNum ? { num: true } : {}), ...(footer.ftr ? { text: footer.ftr } : {}), ...(footer.dt ? { date: footer.dt } : {}) };
    const skipTitle = !footerOnSlide[0] && footerOnSlide.slice(1).every(Boolean);
    if (skipTitle) (model.footer as Obj).skipTitle = true;
    slides.forEach((s, i) => {
      if (!footerOnSlide[i] && !(skipTitle && i === 0)) s.nofooter = true;
    });
  }
  // The deck's guides, PowerPoint's own.
  const guides = all(kid(pres, 'extLst'), 'guide');
  if (guides.length)
    model.guides = { x: guides.filter((g) => att(g, 'orient') === 'vert').map((g) => Math.round(Number(att(g, 'pos') ?? 0) / 6)), y: guides.filter((g) => att(g, 'orient') !== 'vert').map((g) => Math.round(Number(att(g, 'pos') ?? 0) / 6)) };
  if (!slides.length) throw new Error('it has no slides');
  return { model, notes: [...notes] };
}

/** Every part, those in groups too. */
function everyObj(els: Obj[], out: Obj[] = []): Obj[] {
  for (const e of els) {
    out.push(e);
    if (Array.isArray(e.els)) everyObj(e.els as Obj[], out);
  }
  return out;
}
