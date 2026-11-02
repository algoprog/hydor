// Slides: a deck of slides kept in Pages (a page of the kind "slides"), as the server, the editor and the player
// share it. A slide is 1280 pixels wide (720 high at 16:9, 960 at 4:3) and holds parts placed on it, as in
// PowerPoint or Google Slides: text boxes, shapes (which may hold text too), pictures, lines and arrows, tables
// and charts. Each slide has its background, its order of animations (a part comes in, is stressed or goes out:
// on a click, with the one before or after it), its transition from the slide before, and speaker notes. The
// deck's theme names the colours and fonts parts refer to ("accent", "head"), so a new theme recolours it all.
//
// normalizeDeck takes what an agent or the editor sends, lenient about shorthand (a slide made from a layout
// with its title and bullets, text as a string with "- " bullets and **bold**), and returns the full model,
// every value checked: the editor shows decks inside the app itself, so nothing in a deck may be markup, a
// script or a style rule; colours, fonts and addresses are each of a known form.

export const SLIDE_W = 1280;
export type Ratio = '16:9' | '4:3';
export const slideH = (r: Ratio | undefined) => (r === '4:3' ? 960 : 720);

export const SLIDE_LIMITS = { slides: 300, els: 150, anims: 120, paras: 200, run: 6000, notes: 20000, rows: 40, cols: 12, series: 12, labels: 80 };

/** A picture kept by the app (server/pages/assets.ts), by its content's hash: "naget-asset:<sha>". */
export const ASSET = 'naget-asset:';

export type Align = 'left' | 'center' | 'right' | 'justify';
export type VAlign = 'top' | 'middle' | 'bottom';
export type Dir = 'left' | 'right' | 'up' | 'down';

export interface Theme {
  /** The preset it started from. */
  id?: string;
  bg: string;
  fg: string;
  head: string;
  muted: string;
  accent: string;
  /** Text on the accent colour. */
  accentFg: string;
  /** A quiet fill: cards, table rows. */
  soft: string;
  /** Six colours for charts and shapes: c1…c6. */
  colors: string[];
  /** Body text and headings. */
  font: string;
  headFont: string;
}

export interface Run {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  s?: boolean;
  color?: string;
  size?: number;
  font?: string;
  link?: string;
  /** Highlight (a colour behind the words). */
  hl?: string;
  sup?: boolean;
  sub?: boolean;
}

export interface Para {
  runs: Run[];
  align?: Align;
  list?: 'bullet' | 'number';
  /** Indent level, 0–4. */
  lvl?: number;
}

export interface Base {
  id: string;
  x: number;
  y: number;
  /** A line's w and h go from its start to its end, and may be negative. */
  w: number;
  h: number;
  /** Degrees, clockwise. */
  rot?: number;
  opacity?: number;
  /** An address, or a slide of the deck: "#3". */
  link?: string;
  /** Its name in the editor and in the animations' list. */
  name?: string;
  lock?: boolean;
}

export type ShapeKind =
  | 'rect'
  | 'round'
  | 'ellipse'
  | 'triangle'
  | 'rtriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'arrow'
  | 'larrow'
  | 'uarrow'
  | 'darrow'
  | 'chevron'
  | 'parallelogram'
  | 'trapezoid'
  | 'plus'
  | 'heart'
  | 'callout';

export const SHAPES: ShapeKind[] = ['rect', 'round', 'ellipse', 'triangle', 'rtriangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'arrow', 'larrow', 'uarrow', 'darrow', 'chevron', 'parallelogram', 'trapezoid', 'plus', 'heart', 'callout'];

/** What text boxes and shapes share: their words, and how the box around them looks. */
export interface TextProps {
  paras: Para[];
  /** The kind of text: titles take the theme's heading font and colour. */
  role?: 'title' | 'subtitle' | 'body' | 'caption' | 'quote' | 'big';
  /** Font size in slide pixels (a 1280-wide slide: 1 px is 0.75 pt). */
  size: number;
  color?: string;
  /** A font's name, or the theme's: "head", "body". */
  font?: string;
  bold?: boolean;
  italic?: boolean;
  align?: Align;
  valign?: VAlign;
  /** Line height, as a multiple of the size. */
  lh?: number;
  /** Space after each paragraph, in pixels. */
  gap?: number;
  /** Letter spacing, in em. */
  ls?: number;
  pad?: number;
  fill?: string;
  /** A gradient: from `fill` to `fill2`, at `angle` degrees (180: top to bottom). */
  fill2?: string;
  angle?: number;
  line?: string;
  lineW?: number;
  dash?: 'solid' | 'dash' | 'dot';
  /** Corner radius of a rectangle, in pixels. */
  radius?: number;
  shadow?: boolean;
  /** Text that does not fit gets smaller. */
  fit?: 'shrink' | 'none';
  /** What an empty box shows while it is edited: "Click to add a title". */
  ph?: string;
}

export interface TextEl extends Base, TextProps {
  type: 'text';
}

export interface ShapeEl extends Base, TextProps {
  type: 'shape';
  shape: ShapeKind;
}

export interface ImageEl extends Base {
  type: 'image';
  src: string;
  fit?: 'cover' | 'contain' | 'fill';
  radius?: number;
  line?: string;
  lineW?: number;
  shadow?: boolean;
  alt?: string;
  flipH?: boolean;
  flipV?: boolean;
}

export type Cap = 'none' | 'arrow' | 'dot';

export interface LineEl extends Base {
  type: 'line';
  color?: string;
  width: number;
  dash?: 'solid' | 'dash' | 'dot';
  start?: Cap;
  end?: Cap;
}

export interface TableEl extends Base {
  type: 'table';
  rows: string[][];
  /** The first row is a header. */
  head?: boolean;
  /** Every other row shaded. */
  band?: boolean;
  size: number;
  color?: string;
  font?: string;
  /** The header's fill and words. */
  fill?: string;
  headColor?: string;
  line?: string;
  /** Columns' widths, relative. */
  cols?: number[];
  /** Each column's alignment. */
  aligns?: Align[];
}

export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut';
export const CHART_KINDS: ChartKind[] = ['column', 'bar', 'line', 'area', 'pie', 'doughnut'];

export interface Series {
  name: string;
  values: number[];
  color?: string;
}

export interface ChartEl extends Base {
  type: 'chart';
  kind: ChartKind;
  labels: string[];
  series: Series[];
  title?: string;
  legend?: boolean;
  /** Each value written on the chart. */
  values?: boolean;
  stacked?: boolean;
  grid?: boolean;
  size: number;
  color?: string;
  font?: string;
}

export type El = TextEl | ShapeEl | ImageEl | LineEl | TableEl | ChartEl;
export type ElType = El['type'];

export type AnimFx = 'appear' | 'fade' | 'fly' | 'float' | 'zoom' | 'wipe' | 'bounce' | 'pulse' | 'spin' | 'grow' | 'shake';
/** Which effects each kind of animation offers. */
export const ANIM_FX: Record<Anim['type'], AnimFx[]> = {
  in: ['appear', 'fade', 'fly', 'float', 'zoom', 'wipe', 'bounce'],
  em: ['pulse', 'spin', 'grow', 'shake'],
  out: ['appear', 'fade', 'fly', 'float', 'zoom', 'wipe'],
};
/** The effects that go one way or another. */
export const ANIM_DIR: AnimFx[] = ['fly', 'float', 'wipe'];

export interface Anim {
  id: string;
  /** The part it moves. */
  el: string;
  /** Comes in, is stressed (emphasis), goes out. */
  type: 'in' | 'em' | 'out';
  fx: AnimFx;
  /** Where it comes from (or goes to). */
  dir?: Dir;
  /** On a click, with the one before, or after it. */
  on: 'click' | 'with' | 'after';
  /** Milliseconds. */
  dur: number;
  delay: number;
  /** Text: one paragraph at a time, each on a click. */
  byPara?: boolean;
}

export type TransitionFx = 'none' | 'fade' | 'push' | 'wipe' | 'cover' | 'zoom' | 'split';
export const TRANSITIONS: TransitionFx[] = ['none', 'fade', 'push', 'wipe', 'cover', 'zoom', 'split'];

export interface Transition {
  fx: TransitionFx;
  /** The side it comes from. */
  dir?: Dir;
  dur?: number;
  /** Goes on to the next slide by itself after this many seconds (once its animations are done). */
  auto?: number;
}

export interface Bg {
  color?: string;
  /** A gradient from `color` to `to`, at `angle` degrees. */
  to?: string;
  angle?: number;
  image?: string;
  /** Darkens a picture behind words: 0 to 0.8. */
  dim?: number;
}

export interface Slide {
  id: string;
  bg?: Bg;
  els: El[];
  anims?: Anim[];
  transition?: Transition;
  notes?: string;
  /** Left out of the slideshow. */
  hidden?: boolean;
  /** The layout it was made from. */
  layout?: LayoutId;
}

export interface Deck {
  v: 1;
  ratio: Ratio;
  theme: Theme;
  slides: Slide[];
}

// ---- themes and fonts ------------------------------------------------------------------------------------

export interface FontInfo {
  name: string;
  /** The CSS font-family. */
  css: string;
  /** Loaded from Google Fonts. */
  google?: boolean;
  /** What PowerPoint is told when the font is the device's own. */
  office?: string;
}

const gf = (name: string, fallback: string): FontInfo => ({ name, css: `"${name}", ${fallback}`, google: true });
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

export const FONTS: FontInfo[] = [
  gf('Inter', SANS),
  gf('Roboto', SANS),
  gf('Open Sans', SANS),
  gf('Lato', SANS),
  gf('Montserrat', SANS),
  gf('Poppins', SANS),
  gf('Nunito', SANS),
  gf('DM Sans', SANS),
  gf('Work Sans', SANS),
  gf('Space Grotesk', SANS),
  gf('IBM Plex Sans', SANS),
  gf('Outfit', SANS),
  gf('Playfair Display', SERIF),
  gf('Merriweather', SERIF),
  gf('Lora', SERIF),
  gf('Fraunces', SERIF),
  gf('DM Serif Display', SERIF),
  gf('Source Serif 4', SERIF),
  gf('JetBrains Mono', 'ui-monospace, Menlo, Consolas, monospace'),
  { name: 'Arial', css: 'Arial, Helvetica, sans-serif', office: 'Arial' },
  { name: 'Georgia', css: 'Georgia, serif', office: 'Georgia' },
  { name: 'Times New Roman', css: '"Times New Roman", Times, serif', office: 'Times New Roman' },
  { name: 'Courier New', css: '"Courier New", Courier, monospace', office: 'Courier New' },
];

/** A font's CSS family: one of the list, else its name with a sans fallback. */
export function fontCss(name: string): string {
  const f = FONTS.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return f ? f.css : `"${name.replace(/["\\]/g, '')}", ${SANS}`;
}

export const THEMES: (Theme & { id: string; label: string })[] = [
  {
    id: 'paper',
    label: 'Daylight',
    bg: '#ffffff',
    fg: '#2b2f36',
    head: '#14171c',
    muted: '#646b76',
    accent: '#2f6fec',
    accentFg: '#ffffff',
    soft: '#f1f4f9',
    colors: ['#2f6fec', '#16a394', '#f2a93b', '#e5534b', '#8e5cd9', '#1aa0d8'],
    font: 'Inter',
    headFont: 'Inter',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    bg: '#0f1625',
    fg: '#dfe5ef',
    head: '#ffffff',
    muted: '#93a0b5',
    accent: '#7aa2ff',
    accentFg: '#0f1625',
    soft: '#1a2336',
    colors: ['#7aa2ff', '#4fd1b5', '#ffc46b', '#ff7a7a', '#c39bff', '#5ccfff'],
    font: 'Inter',
    headFont: 'Space Grotesk',
  },
  {
    id: 'ember',
    label: 'Ember',
    bg: '#fff8f2',
    fg: '#3a2a20',
    head: '#24160e',
    muted: '#86705f',
    accent: '#e8590c',
    accentFg: '#ffffff',
    soft: '#fdeadb',
    colors: ['#e8590c', '#c2255c', '#f59f00', '#2b8a3e', '#5f3dc4', '#1971c2'],
    font: 'DM Sans',
    headFont: 'Fraunces',
  },
  {
    id: 'forest',
    label: 'Forest',
    bg: '#f3f6f1',
    fg: '#24302a',
    head: '#173323',
    muted: '#66756b',
    accent: '#2f855a',
    accentFg: '#ffffff',
    soft: '#e2ebe0',
    colors: ['#2f855a', '#b7791f', '#2c7a7b', '#c05621', '#6b46c1', '#2b6cb0'],
    font: 'Lato',
    headFont: 'Merriweather',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    bg: '#f0f6fa',
    fg: '#163044',
    head: '#0b2233',
    muted: '#5b7385',
    accent: '#0077b6',
    accentFg: '#ffffff',
    soft: '#dcebf4',
    colors: ['#0077b6', '#00b4d8', '#f4a261', '#e76f51', '#2a9d8f', '#8338ec'],
    font: 'Open Sans',
    headFont: 'Montserrat',
  },
  {
    id: 'noir',
    label: 'Noir',
    bg: '#121212',
    fg: '#e6e6e6',
    head: '#ffffff',
    muted: '#9a9a9a',
    accent: '#f5c518',
    accentFg: '#121212',
    soft: '#1f1f1f',
    colors: ['#f5c518', '#e0e0e0', '#ff6b6b', '#4ecdc4', '#a78bfa', '#60a5fa'],
    font: 'Inter',
    headFont: 'Playfair Display',
  },
  {
    id: 'blossom',
    label: 'Blossom',
    bg: '#fff6f8',
    fg: '#3d2a33',
    head: '#2a1820',
    muted: '#8a6c78',
    accent: '#d6336c',
    accentFg: '#ffffff',
    soft: '#fbe4eb',
    colors: ['#d6336c', '#7048e8', '#f08c00', '#0ca678', '#1c7ed6', '#e64980'],
    font: 'Nunito',
    headFont: 'Poppins',
  },
  {
    id: 'slate',
    label: 'Slate',
    bg: '#f5f6f8',
    fg: '#1f2937',
    head: '#111827',
    muted: '#6b7280',
    accent: '#4f46e5',
    accentFg: '#ffffff',
    soft: '#e7e9f0',
    colors: ['#4f46e5', '#0891b2', '#d97706', '#dc2626', '#059669', '#9333ea'],
    font: 'IBM Plex Sans',
    headFont: 'IBM Plex Sans',
  },
];

export const themeOf = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];

// ---- colours -----------------------------------------------------------------------------------------------

/** The theme's colours a part may name. */
export const COLOR_REFS = ['bg', 'fg', 'head', 'muted', 'accent', 'accentFg', 'soft', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6'] as const;

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  gray: '#808080',
  grey: '#808080',
  navy: '#000080',
  teal: '#008080',
  gold: '#ffd700',
  silver: '#c0c0c0',
  brown: '#a52a2a',
  crimson: '#dc143c',
  coral: '#ff7f50',
  indigo: '#4b0082',
  violet: '#ee82ee',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  transparent: '#00000000',
};

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(rgb|hsl)a?\(\s*(-?[\d.]+)(deg|%)?\s*[, ]\s*(-?[\d.]+)%?\s*[, ]\s*(-?[\d.]+)%?\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i;

/** A colour as a deck keeps it (a theme's name for one, #hex, rgb(), hsl(), a common name), or null. */
export function cleanColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 60) return null;
  if ((COLOR_REFS as readonly string[]).includes(s)) return s;
  if (HEX.test(s)) return s.toLowerCase();
  if (FUNC.test(s)) return s.replace(/\s+/g, ' ');
  const n = s.toLowerCase();
  return NAMED[n] ? n : null;
}

/** A colour for CSS: the theme's for its names. */
export function cssColor(c: string | undefined, theme: Theme, fallback = 'transparent'): string {
  if (!c) return fallback;
  if (c === 'bg' || c === 'fg' || c === 'head' || c === 'muted' || c === 'accent' || c === 'accentFg' || c === 'soft') return theme[c];
  const m = /^c([1-6])$/.exec(c);
  if (m) return theme.colors[Number(m[1]) - 1] ?? theme.accent;
  return NAMED[c] ?? c;
}

/** Two colours mixed: `k` of `a` and the rest of `b`, as #rrggbb. */
export function mixColor(a: string, b: string, k: number, theme: Theme): string {
  const x = hexColor(a, theme).hex;
  const y = hexColor(b, theme).hex;
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  const m = (i: number) => Math.round(ch(x, i) * k + ch(y, i) * (1 - k)).toString(16).padStart(2, '0');
  return `#${m(0)}${m(2)}${m(4)}`;
}

/** A colour as RRGGBB and its opacity (0–1), for Office files. */
export function hexColor(c: string | undefined, theme: Theme, fallback = '000000'): { hex: string; alpha: number } {
  const v = cssColor(c, theme, `#${fallback}`);
  if (v.startsWith('#')) {
    let h = v.slice(1);
    if (h.length <= 4) h = [...h].map((x) => x + x).join('');
    return { hex: h.slice(0, 6).toUpperCase(), alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  const m = FUNC.exec(v);
  if (!m) return { hex: fallback.toUpperCase(), alpha: 1 };
  const a = m[6] !== undefined ? Math.max(0, Math.min(1, Number(m[6]) / (m[7] ? 100 : 1))) : 1;
  let r: number, g: number, b: number;
  if (m[1].toLowerCase() === 'rgb') [r, g, b] = [Number(m[2]), Number(m[4]), Number(m[5])];
  else {
    const hh = (((Number(m[2]) % 360) + 360) % 360) / 360;
    const ss = Number(m[4]) / 100;
    const ll = Number(m[5]) / 100;
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
    };
    [r, g, b] = [f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255];
  }
  const two = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return { hex: (two(r) + two(g) + two(b)).toUpperCase(), alpha: a };
}

// ---- small helpers --------------------------------------------------------------------------------------------

export const newId = () => Math.random().toString(36).slice(2, 10).padEnd(8, '0');

/** A part's words, as plain text (paragraphs on lines of their own). */
export const plainText = (paras: Para[] | undefined) => (paras ?? []).map((p) => p.runs.map((r) => r.t).join('')).join('\n');

/** What a slide is called: its title's words, else its first words. */
export function slideTitle(s: Slide): string {
  const texts = s.els.filter((e): e is TextEl | ShapeEl => (e.type === 'text' || e.type === 'shape') && plainText(e.paras).trim().length > 1);
  // Its title, else its words in the largest type.
  const t = texts.find((e) => e.role === 'title') ?? texts.slice().sort((a, b) => b.size - a.size)[0];
  return t ? plainText(t.paras).replace(/\s+/g, ' ').trim().slice(0, 100) : '';
}

/** The theme's font for a part's `font` ("head", "body", or a name). */
export const fontName = (f: string | undefined, theme: Theme, role?: TextProps['role']) =>
  !f ? (role === 'title' || role === 'quote' || role === 'big' ? theme.headFont : theme.font) : f === 'body' ? theme.font : f === 'head' ? theme.headFont : f;

/**
 * Words as paragraphs: a line each; "- " or "* " makes a bullet and "1. " a numbered one, two spaces a level
 * deeper; **bold**, *italic*, __underlined__ and ~~struck~~ within a line, and [words](https://…) a link.
 */
export function parasFromText(text: string): Para[] {
  const out: Para[] = [];
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^(\s*)(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(raw);
    const para: Para = { runs: inline(m ? m[4] : raw) };
    if (m) {
      para.list = m[2] ? 'bullet' : 'number';
      const lvl = Math.min(4, Math.floor(m[1].replace(/\t/g, '  ').length / 2));
      if (lvl) para.lvl = lvl;
    }
    out.push(para);
  }
  return out.length ? out : [{ runs: [{ t: '' }] }];
}

/** A line's **bold**, *italic*, __underline__, ~~strike~~ and [links](…) as runs. */
function inline(line: string): Run[] {
  const runs: Run[] = [];
  const re = /\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|\*(?!\s)(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) runs.push({ t: line.slice(at, m.index) });
    if (m[1] !== undefined) runs.push({ t: m[1], b: true });
    else if (m[2] !== undefined) runs.push({ t: m[2], u: true });
    else if (m[3] !== undefined) runs.push({ t: m[3], s: true });
    else if (m[4] !== undefined) runs.push({ t: m[4], i: true });
    else {
      const link = cleanLink(m[6]);
      runs.push(link ? { t: m[5], link } : { t: m[5] });
    }
    at = m.index + m[0].length;
  }
  if (at < line.length || !runs.length) runs.push({ t: line.slice(at) });
  return runs;
}

/** Bullets as an agent writes them: strings, and arrays under one for the next level down. */
function parasFromBullets(items: unknown[], lvl = 0, out: Para[] = []): Para[] {
  for (const it of items) {
    if (Array.isArray(it)) parasFromBullets(it, Math.min(4, lvl + 1), out);
    else if (typeof it === 'string' || typeof it === 'number') {
      const runs = inline(String(it));
      out.push(lvl ? { runs, list: 'bullet', lvl } : { runs, list: 'bullet' });
    }
  }
  return out;
}

/** An address a part may open: the web, mail, a phone number, or a slide of the deck (#3). */
export function cleanLink(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (/^#\d{1,3}$/.test(s)) return s;
  if (s.length > 2000) return undefined;
  if (/^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[+\d][\d\s().-]*)$/i.test(s)) return s;
  return undefined;
}

/** A picture's source: one the app keeps, one inside the deck (data:), or on the web. */
export function cleanSrc(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^naget-asset:[a-f0-9]{16,64}$/.test(s)) return s;
  if (/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  if (/^https?:\/\/[^\s<>"'()\\]+$/i.test(s) && s.length <= 2000) return s;
  return null;
}

/** A font as a deck keeps it: the theme's ("head", "body") or a name. */
export function cleanFont(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().replace(/^["']|["']$/g, '');
  if (s === 'head' || s === 'body') return s;
  const known = FONTS.find((f) => f.name.toLowerCase() === s.toLowerCase());
  if (known) return known.name;
  return /^[A-Za-z0-9][A-Za-z0-9 \-]{0,39}$/.test(s) ? s : undefined;
}

// ---- layouts ---------------------------------------------------------------------------------------------------

export type LayoutId = 'title' | 'section' | 'content' | 'two' | 'image-right' | 'image' | 'quote' | 'stats' | 'cards' | 'steps' | 'chart' | 'table' | 'title-only' | 'end' | 'blank';

export const LAYOUTS: { id: LayoutId; label: string }[] = [
  { id: 'title', label: 'Title' },
  { id: 'content', label: 'Title and text' },
  { id: 'two', label: 'Two columns' },
  { id: 'section', label: 'Section' },
  { id: 'image-right', label: 'Text and picture' },
  { id: 'image', label: 'Picture' },
  { id: 'stats', label: 'Big numbers' },
  { id: 'cards', label: 'Cards' },
  { id: 'steps', label: 'Steps' },
  { id: 'quote', label: 'Quote' },
  { id: 'chart', label: 'Chart' },
  { id: 'table', label: 'Table' },
  { id: 'title-only', label: 'Title only' },
  { id: 'end', label: 'Closing' },
  { id: 'blank', label: 'Blank' },
];

/** What a slide made from a layout holds; anything left out is an empty box with a hint (in the editor). */
export interface LayoutContent {
  title?: string;
  subtitle?: string;
  /** Words under the title: a string (lines, "- " bullets) or bullets. */
  text?: string | unknown[];
  left?: string | unknown[];
  right?: string | unknown[];
  leftTitle?: string;
  rightTitle?: string;
  image?: string;
  caption?: string;
  quote?: string;
  by?: string;
  stats?: { value: string; label?: string }[];
  cards?: { title?: string; text?: string }[];
  steps?: { title?: string; text?: string }[];
  chart?: Partial<ChartEl>;
  table?: string[][];
}

const words = (v: string | unknown[] | undefined): Para[] | null => (v === undefined ? null : Array.isArray(v) ? parasFromBullets(v) : parasFromText(String(v)));

/** A slide of a layout, its parts placed for the deck's shape. */
export function layoutSlide(id: LayoutId, c: LayoutContent = {}, ratio: Ratio = '16:9'): Slide {
  const H = slideH(ratio);
  const k = H / 720;
  const els: El[] = [];
  const box = (x: number, y: number, w: number, h: number) => ({ id: newId(), x, y: Math.round(y * k), w, h: Math.round(h * k) });
  const text = (b: ReturnType<typeof box>, paras: Para[] | null, p: Partial<TextProps> & { size: number }, ph: string): TextEl => ({
    ...b,
    type: 'text',
    paras: paras ?? [{ runs: [{ t: '' }] }],
    ph,
    fit: 'shrink',
    ...p,
  });
  const title = (t = c.title, b = box(80, 52, 1120, 100), size = 46) => {
    els.push(text(b, t === undefined ? null : parasFromText(t), { role: 'title', size, bold: true, valign: 'bottom', lh: 1.1 }, 'Click to add a title'));
  };
  const bar = (x: number, y: number) => els.push({ ...box(x, y, 64, 6), type: 'shape', shape: 'round', fill: 'accent', radius: 3, paras: [], size: 20 });
  const body = (b: ReturnType<typeof box>, v: string | unknown[] | undefined, size = 26) =>
    els.push(text(b, words(v), { role: 'body', size, lh: 1.3, gap: 12 }, 'Click to add text'));
  const n = (list: unknown[] | undefined, min: number, max: number) => Math.max(min, Math.min(max, list?.length ?? min));
  let bg: Bg | undefined;
  switch (id) {
    case 'title':
      els.push(text(box(100, 180, 1080, 226), c.title === undefined ? null : parasFromText(c.title), { role: 'title', size: 68, bold: true, valign: 'bottom', lh: 1.05 }, 'Click to add a title'));
      bar(110, 424);
      els.push(text(box(100, 446, 1080, 100), c.subtitle === undefined ? null : parasFromText(c.subtitle), { role: 'subtitle', size: 28, color: 'muted', lh: 1.25 }, 'Click to add a subtitle'));
      break;
    case 'section':
      bg = { color: 'accent' };
      els.push(text(box(100, 250, 1080, 140), c.title === undefined ? null : parasFromText(c.title), { role: 'title', size: 62, bold: true, color: 'accentFg', valign: 'bottom', lh: 1.05 }, 'Click to add a title'));
      els.push(text(box(100, 402, 1080, 80), c.subtitle === undefined ? null : parasFromText(c.subtitle), { role: 'subtitle', size: 26, color: 'accentFg', opacity: 0.85 } as Partial<TextProps> & { size: number }, 'Click to add a subtitle'));
      break;
    case 'content':
      title();
      bar(80, 164);
      body(box(80, 196, 1120, 470), c.text);
      break;
    case 'two': {
      title();
      bar(80, 164);
      const heads = c.leftTitle !== undefined || c.rightTitle !== undefined;
      const top = heads ? 254 : 196;
      if (heads) {
        els.push(text(box(80, 196, 540, 50), parasFromText(c.leftTitle ?? ''), { role: 'body', size: 28, bold: true, color: 'accent' }, 'Click to add a heading'));
        els.push(text(box(660, 196, 540, 50), parasFromText(c.rightTitle ?? ''), { role: 'body', size: 28, bold: true, color: 'accent' }, 'Click to add a heading'));
      }
      body(box(80, top, 540, 666 - top), c.left, 24);
      body(box(660, top, 540, 666 - top), c.right, 24);
      break;
    }
    case 'image-right':
      title(c.title, box(80, 52, 540, 140), 42);
      bar(80, 204);
      body(box(80, 236, 540, 430), c.text, 24);
      els.push({ ...box(680, 0, 600, 720), type: 'image', src: c.image ?? '', fit: 'cover', alt: c.caption ?? '' });
      break;
    case 'image':
      title();
      els.push({ ...box(80, 186, 1120, 430), type: 'image', src: c.image ?? '', fit: 'contain', alt: c.caption ?? '' });
      els.push(text(box(80, 626, 1120, 50), c.caption === undefined ? null : parasFromText(c.caption), { role: 'caption', size: 20, color: 'muted', align: 'center' }, 'Click to add a caption'));
      break;
    case 'quote':
      els.push(text(box(100, 96, 160, 160), parasFromText('“'), { role: 'quote', size: 200, color: 'accent', lh: 1, bold: true }, ''));
      els.push(text(box(150, 200, 980, 280), c.quote === undefined ? null : parasFromText(c.quote), { role: 'quote', size: 42, italic: true, valign: 'middle', lh: 1.25 }, 'Click to add a quote'));
      els.push(text(box(150, 500, 980, 60), c.by === undefined ? null : parasFromText(`— ${c.by}`), { role: 'caption', size: 24, color: 'muted' }, 'Click to say who said it'));
      break;
    case 'stats': {
      title();
      bar(80, 164);
      const cnt = n(c.stats, 3, 4);
      const w = (1120 - (cnt - 1) * 40) / cnt;
      for (let i = 0; i < cnt; i++) {
        const s = c.stats?.[i];
        const x = 80 + i * (w + 40);
        els.push(text(box(x, 250, w, 140), s ? parasFromText(String(s.value)) : null, { role: 'big', size: 92, bold: true, color: 'accent', align: 'center', valign: 'bottom', lh: 1 }, '00%'));
        els.push(text(box(x, 400, w, 120), s?.label !== undefined ? parasFromText(s.label) : null, { role: 'body', size: 24, color: 'muted', align: 'center', lh: 1.3 }, 'Click to add a label'));
      }
      break;
    }
    case 'cards': {
      title();
      bar(80, 164);
      const cnt = n(c.cards, 3, 4);
      const w = (1120 - (cnt - 1) * 32) / cnt;
      for (let i = 0; i < cnt; i++) {
        const card = c.cards?.[i];
        const x = 80 + i * (w + 32);
        els.push({ ...box(x, 204, w, 440), type: 'shape', shape: 'round', radius: 18, fill: 'soft', paras: [], size: 20 });
        els.push(text(box(x + 28, 232, w - 56, 70), card?.title !== undefined ? parasFromText(card.title) : null, { role: 'body', size: 28, bold: true, color: 'head', font: 'head', lh: 1.15 }, 'Heading'));
        els.push(text(box(x + 28, 310, w - 56, 310), card?.text !== undefined ? parasFromText(card.text) : null, { role: 'body', size: 21, lh: 1.4, gap: 8 }, 'Click to add text'));
      }
      break;
    }
    case 'steps': {
      title();
      bar(80, 164);
      const cnt = n(c.steps, 3, 5);
      const w = (1120 - (cnt - 1) * 32) / cnt;
      els.push({ ...box(80 + 32, 268, 1120 - w, 0), type: 'line', color: 'accent', opacity: 0.3, width: 4 } as LineEl);
      for (let i = 0; i < cnt; i++) {
        const s = c.steps?.[i];
        const x = 80 + i * (w + 32);
        els.push({ ...box(x, 236, 64, 64), type: 'shape', shape: 'ellipse', fill: 'accent', paras: [{ runs: [{ t: String(i + 1) }] }], size: 28, bold: true, color: 'accentFg', align: 'center', valign: 'middle', pad: 0 });
        els.push(text(box(x, 324, w, 60), s?.title !== undefined ? parasFromText(s.title) : null, { role: 'body', size: 26, bold: true, color: 'head', font: 'head', lh: 1.15 }, 'Step'));
        els.push(text(box(x, 390, w, 250), s?.text !== undefined ? parasFromText(s.text) : null, { role: 'body', size: 20, color: 'muted', lh: 1.4 }, 'Click to add text'));
      }
      break;
    }
    case 'chart':
      title();
      els.push({
        ...box(80, 180, 1120, 490),
        type: 'chart',
        kind: 'column',
        labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Series 1', values: [4, 6, 5, 8] }],
        legend: true,
        grid: true,
        size: 18,
        ...(c.chart ?? {}),
      } as ChartEl);
      break;
    case 'table': {
      title();
      const rows = c.table?.length ? c.table : [
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ];
      els.push({ ...box(80, 186, 1120, Math.min(480, rows.length * 58)), type: 'table', rows, head: true, band: true, size: 20 });
      break;
    }
    case 'title-only':
      title();
      break;
    case 'end':
      els.push(text(box(100, 250, 1080, 150), parasFromText(c.title ?? 'Thank you'), { role: 'title', size: 80, bold: true, align: 'center', valign: 'bottom', lh: 1.05 }, 'Click to add a title'));
      els.push(text(box(100, 414, 1080, 80), c.subtitle === undefined ? null : parasFromText(c.subtitle), { role: 'subtitle', size: 28, color: 'muted', align: 'center' }, 'Click to add a subtitle'));
      break;
    case 'blank':
      break;
  }
  return { id: newId(), els, layout: id, ...(bg ? { bg } : {}) };
}

// ---- checking what comes in ----------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, min: number, max: number, def: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 100) / 100)) : def;
};
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : typeof v === 'number' ? String(v) : '');
const pick = <T extends string>(v: unknown, list: readonly T[], def: T): T => (list.includes(v as T) ? (v as T) : def);
const opt = <T extends string>(v: unknown, list: readonly T[]): T | undefined => (list.includes(v as T) ? (v as T) : undefined);
const cleanId = (v: unknown, used: Set<string>) => {
  let id = typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v) ? v : newId();
  while (used.has(id)) id = newId();
  used.add(id);
  return id;
};

/** Checks how a value may be turned into a picture's source (an agent's local file, say); null leaves it out. */
export type SrcHook = (src: string) => string | null;

export interface NormalizeOpts {
  /** Sources that are not of a kept form yet (a file of the agent's): what they become. */
  src?: SrcHook;
}

const ALIGNS = ['left', 'center', 'right', 'justify'] as const;
const VALIGNS = ['top', 'middle', 'bottom'] as const;
const DIRS = ['left', 'right', 'up', 'down'] as const;
const ROLES = ['title', 'subtitle', 'body', 'caption', 'quote', 'big'] as const;
const DASHES = ['solid', 'dash', 'dot'] as const;
const CAPS = ['none', 'arrow', 'dot'] as const;

/** Default size, font and colour of each kind of text. */
const ROLE_SIZE: Record<NonNullable<TextProps['role']>, number> = { title: 46, subtitle: 28, body: 26, caption: 20, quote: 40, big: 92 };

function runs(v: unknown): Run[] {
  if (typeof v === 'string') return inline(v);
  if (!Array.isArray(v)) return [{ t: '' }];
  const out: Run[] = [];
  for (const r of v.slice(0, 400)) {
    if (typeof r === 'string') {
      out.push({ t: str(r, SLIDE_LIMITS.run) });
      continue;
    }
    if (!isObj(r)) continue;
    const run: Run = { t: str(r.t ?? r.text, SLIDE_LIMITS.run) };
    if (r.b === true || r.bold === true) run.b = true;
    if (r.i === true || r.italic === true) run.i = true;
    if (r.u === true || r.underline === true) run.u = true;
    if (r.s === true || r.strike === true) run.s = true;
    if (r.sup === true) run.sup = true;
    else if (r.sub === true) run.sub = true;
    const color = cleanColor(r.color);
    if (color) run.color = color;
    const hl = cleanColor(r.hl ?? r.highlight);
    if (hl) run.hl = hl;
    if (r.size !== undefined) run.size = num(r.size, 6, 400, 24);
    const font = cleanFont(r.font);
    if (font) run.font = font;
    const link = cleanLink(r.link);
    if (link) run.link = link;
    out.push(run);
  }
  return out.length ? out : [{ t: '' }];
}

function paras(v: unknown): Para[] {
  if (typeof v === 'string' || typeof v === 'number') return parasFromText(String(v));
  if (!Array.isArray(v)) return [{ runs: [{ t: '' }] }];
  // A list of strings (and arrays of strings): bullets, as agents often write them.
  if (v.every((p) => typeof p === 'string' || Array.isArray(p)) && v.some((p) => Array.isArray(p))) return parasFromBullets(v).slice(0, SLIDE_LIMITS.paras);
  const out: Para[] = [];
  for (const p of v.slice(0, SLIDE_LIMITS.paras)) {
    if (typeof p === 'string') {
      out.push(...parasFromText(p));
      continue;
    }
    if (!isObj(p)) continue;
    const para: Para = { runs: p.runs !== undefined ? runs(p.runs) : runs(p.text ?? p.t ?? '') };
    const align = opt(p.align, ALIGNS);
    if (align) para.align = align;
    const list = p.list === 'bullet' || p.bullet === true ? 'bullet' : p.list === 'number' || p.number === true ? 'number' : undefined;
    if (list) para.list = list;
    const lvl = num(p.lvl ?? p.level, 0, 4, 0);
    if (lvl) para.lvl = lvl;
    out.push(para);
  }
  return out.length ? out.slice(0, SLIDE_LIMITS.paras) : [{ runs: [{ t: '' }] }];
}

function textProps(e: Obj, into: Partial<TextProps>, defRole: TextProps['role']) {
  const role = opt(e.role, ROLES) ?? defRole;
  if (role) into.role = role;
  into.paras = e.paras !== undefined ? paras(e.paras) : e.bullets !== undefined && Array.isArray(e.bullets) ? parasFromBullets(e.bullets) : paras(e.text ?? '');
  into.size = num(e.size, 6, 400, ROLE_SIZE[role ?? 'body']);
  const color = cleanColor(e.color);
  if (color) into.color = color;
  const font = cleanFont(e.font);
  if (font) into.font = font;
  if (e.bold === true) into.bold = true;
  if (e.italic === true) into.italic = true;
  const align = opt(e.align, ALIGNS);
  if (align) into.align = align;
  const valign = opt(e.valign, VALIGNS);
  if (valign) into.valign = valign;
  if (e.lh !== undefined) into.lh = num(e.lh, 0.6, 4, 1.2);
  if (e.gap !== undefined) into.gap = num(e.gap, 0, 200, 0);
  if (e.ls !== undefined) into.ls = num(e.ls, -0.2, 1, 0);
  if (e.pad !== undefined) into.pad = num(e.pad, 0, 200, 10);
  const fill = e.fill === 'none' ? 'transparent' : cleanColor(e.fill);
  if (fill) into.fill = fill;
  const fill2 = cleanColor(e.fill2);
  if (fill2 && fill) {
    into.fill2 = fill2;
    into.angle = num(e.angle, 0, 360, 180);
  }
  const line = cleanColor(e.line);
  if (line) {
    into.line = line;
    into.lineW = num(e.lineW, 0.5, 40, 2);
    const dash = opt(e.dash, DASHES);
    if (dash && dash !== 'solid') into.dash = dash;
  }
  if (e.radius !== undefined) into.radius = num(e.radius, 0, 2000, 0);
  if (e.shadow === true) into.shadow = true;
  if (e.fit === 'none') into.fit = 'none';
  else if (e.fit === 'shrink' || role) into.fit = 'shrink';
  if (typeof e.ph === 'string' && e.ph) into.ph = str(e.ph, 80);
}

function base(e: Obj, used: Set<string>, H: number, line = false): Base {
  const b: Base = {
    id: cleanId(e.id, used),
    x: num(e.x, -4000, 6000, 80),
    y: num(e.y, -4000, 6000, 80),
    w: line ? num(e.w, -6000, 6000, 200) : num(e.w, 1, 8000, 400),
    h: line ? num(e.h, -6000, 6000, 0) : num(e.h, 1, 8000, Math.min(200, H)),
  };
  // A line given by its two ends.
  if (line && (e.x2 !== undefined || e.y2 !== undefined)) {
    b.w = num(Number(e.x2) - b.x, -6000, 6000, 200);
    b.h = num(Number(e.y2) - b.y, -6000, 6000, 0);
  }
  if (e.rot) b.rot = num(e.rot, -360, 360, 0);
  if (e.opacity !== undefined && e.opacity !== 1) b.opacity = num(e.opacity, 0, 1, 1);
  const link = cleanLink(e.link);
  if (link) b.link = link;
  if (typeof e.name === 'string' && e.name.trim()) b.name = str(e.name.trim(), 60);
  if (e.lock === true) b.lock = true;
  return b;
}

function element(e: unknown, used: Set<string>, H: number, o: NormalizeOpts): El | null {
  if (!isObj(e)) return null;
  const type = e.type === 'textbox' ? 'text' : e.type === 'picture' ? 'image' : e.type === 'arrow' ? 'line' : e.type;
  if (type === 'text' || type === 'shape') {
    const b = base(e, used, H);
    const t: Partial<TextProps> = {};
    textProps(e, t, type === 'text' ? 'body' : undefined);
    if (type === 'shape') {
      const shape = pick(e.shape === 'rounded' ? 'round' : e.shape === 'circle' ? 'ellipse' : e.shape, SHAPES, 'rect');
      // A shape is filled unless it says otherwise ("none"), and its words are in the colour that goes on the fill.
      if (!t.fill && e.fill === undefined) t.fill = 'accent';
      if (!t.color && e.color === undefined && t.fill === 'accent' && t.paras?.some((p) => p.runs.some((r) => r.t))) t.color = 'accentFg';
      return { ...b, type: 'shape', shape, ...(t as TextProps) };
    }
    return { ...b, type: 'text', ...(t as TextProps) };
  }
  if (type === 'image') {
    const raw = typeof e.src === 'string' ? e.src.trim() : '';
    const src = cleanSrc(raw) ?? (raw && o.src ? o.src(raw) : null) ?? '';
    const img: ImageEl = { ...base(e, used, H), type: 'image', src };
    const fit = opt(e.fit, ['cover', 'contain', 'fill'] as const);
    if (fit && fit !== 'cover') img.fit = fit;
    if (e.radius !== undefined) img.radius = num(e.radius, 0, 2000, 0);
    const line = cleanColor(e.line);
    if (line) {
      img.line = line;
      img.lineW = num(e.lineW, 0.5, 40, 2);
    }
    if (e.shadow === true) img.shadow = true;
    if (typeof e.alt === 'string' && e.alt) img.alt = str(e.alt, 300);
    if (e.flipH === true) img.flipH = true;
    if (e.flipV === true) img.flipV = true;
    return img;
  }
  if (type === 'line') {
    const l: LineEl = { ...base(e, used, H, true), type: 'line', width: num(e.width, 0.5, 60, 3) };
    const color = cleanColor(e.color);
    if (color) l.color = color;
    const dash = opt(e.dash, DASHES);
    if (dash && dash !== 'solid') l.dash = dash;
    // "arrow": true is an arrow at the end.
    const end = opt(e.end, CAPS) ?? (e.arrow === true || e.type === 'arrow' ? 'arrow' : undefined);
    if (end && end !== 'none') l.end = end;
    const start = opt(e.start, CAPS);
    if (start && start !== 'none') l.start = start;
    return l;
  }
  if (type === 'table') {
    const rows = (Array.isArray(e.rows) ? e.rows : [])
      .slice(0, SLIDE_LIMITS.rows)
      .map((r) => (Array.isArray(r) ? r.slice(0, SLIDE_LIMITS.cols).map((c) => str(isObj(c) ? (c.text ?? '') : c, 2000)) : []))
      .filter((r) => r.length);
    const cols = Math.max(1, ...rows.map((r) => r.length));
    for (const r of rows) while (r.length < cols) r.push('');
    const t: TableEl = { ...base(e, used, H), type: 'table', rows: rows.length ? rows : [['']], size: num(e.size, 6, 200, 20) };
    if (e.head !== false) t.head = true;
    if (e.band !== false) t.band = true;
    const color = cleanColor(e.color);
    if (color) t.color = color;
    const font = cleanFont(e.font);
    if (font) t.font = font;
    const fill = cleanColor(e.fill);
    if (fill) t.fill = fill;
    const hc = cleanColor(e.headColor);
    if (hc) t.headColor = hc;
    const line = cleanColor(e.line);
    if (line) t.line = line;
    if (Array.isArray(e.cols) && e.cols.length === cols) t.cols = e.cols.map((c) => num(c, 0.1, 100, 1));
    if (Array.isArray(e.aligns)) {
      const a = e.aligns.slice(0, cols).map((x) => pick(x, ALIGNS, 'left'));
      if (a.some((x) => x !== 'left')) t.aligns = a;
    }
    return t;
  }
  if (type === 'chart') {
    const labels = (Array.isArray(e.labels) ? e.labels : []).slice(0, SLIDE_LIMITS.labels).map((l) => str(l, 120));
    const series: Series[] = (Array.isArray(e.series) ? e.series : [])
      .slice(0, SLIDE_LIMITS.series)
      .filter(isObj)
      .map((s, i) => {
        const v: Series = { name: str(s.name, 120) || `Series ${i + 1}`, values: (Array.isArray(s.values) ? s.values : []).slice(0, SLIDE_LIMITS.labels).map((x) => num(x, -1e12, 1e12, 0)) };
        const color = cleanColor(s.color);
        if (color) v.color = color;
        return v;
      });
    // Values without labels get numbered ones.
    const most = Math.max(0, ...series.map((s) => s.values.length));
    while (labels.length < most) labels.push(String(labels.length + 1));
    const c: ChartEl = { ...base(e, used, H), type: 'chart', kind: pick(e.kind, CHART_KINDS, 'column'), labels, series, size: num(e.size, 6, 120, 18) };
    if (typeof e.title === 'string' && e.title) c.title = str(e.title, 200);
    if (e.legend !== false) c.legend = true;
    if (e.values === true) c.values = true;
    if (e.stacked === true) c.stacked = true;
    if (e.grid !== false) c.grid = true;
    const color = cleanColor(e.color);
    if (color) c.color = color;
    const font = cleanFont(e.font);
    if (font) c.font = font;
    return c;
  }
  return null;
}

function anim(a: unknown, used: Set<string>, ids: Set<string>): Anim | null {
  if (!isObj(a) || typeof a.el !== 'string' || !ids.has(a.el)) return null;
  const type = pick(a.type, ['in', 'em', 'out'] as const, 'in');
  const out: Anim = {
    id: cleanId(a.id, used),
    el: a.el,
    type,
    fx: pick(a.fx ?? a.effect, ANIM_FX[type], type === 'em' ? 'pulse' : 'fade'),
    on: pick(a.on, ['click', 'with', 'after'] as const, 'click'),
    dur: num(a.dur, 0, 20000, 500),
    delay: num(a.delay, 0, 60000, 0),
  };
  if (ANIM_DIR.includes(out.fx)) out.dir = pick(a.dir, DIRS, out.fx === 'float' ? 'up' : 'left');
  if (a.byPara === true) out.byPara = true;
  return out;
}

/** An animation an agent put on an element itself ("anim": "fade", or { fx, on, … }). */
function elAnim(v: unknown, el: string): Obj | null {
  if (typeof v === 'string') return { el, type: 'in', fx: v, on: 'click' };
  return isObj(v) ? { type: 'in', on: 'click', ...v, el } : null;
}

function bg(v: unknown, o: NormalizeOpts): Bg | undefined {
  const c = cleanColor(v);
  if (c) return { color: c };
  if (!isObj(v)) return undefined;
  const out: Bg = {};
  const color = cleanColor(v.color);
  if (color) out.color = color;
  const to = cleanColor(v.to);
  if (to && color) {
    out.to = to;
    out.angle = num(v.angle, 0, 360, 180);
  }
  const raw = typeof v.image === 'string' ? v.image.trim() : '';
  const image = cleanSrc(raw) ?? (raw && o.src ? o.src(raw) : null);
  if (image) {
    out.image = image;
    if (v.dim !== undefined) out.dim = num(v.dim, 0, 0.8, 0);
  }
  return Object.keys(out).length ? out : undefined;
}

function transition(v: unknown): Transition | undefined {
  if (typeof v === 'string') v = { fx: v };
  if (!isObj(v)) return undefined;
  const fx = pick(v.fx ?? v.effect, TRANSITIONS, 'none');
  const auto = v.auto !== undefined ? num(v.auto, 0, 3600, 0) : 0;
  if (fx === 'none' && !auto) return undefined;
  const t: Transition = { fx };
  if (fx === 'push' || fx === 'wipe' || fx === 'cover') t.dir = pick(v.dir, DIRS, 'right');
  if (fx !== 'none') t.dur = num(v.dur, 100, 5000, 600);
  if (auto) t.auto = auto;
  return t;
}

function slide(v: unknown, used: Set<string>, ratio: Ratio, o: NormalizeOpts): Slide | null {
  if (!isObj(v)) return null;
  const H = slideH(ratio);
  let s: Slide;
  const layout = opt(v.layout, LAYOUTS.map((l) => l.id));
  // Made from a layout: its parts from the content given, then the slide's own parts on top.
  if (layout && v.els === undefined) {
    // Agents write a layout's words as text, bullets or body alike.
    const made = layoutSlide(layout, { ...v, text: (v.text ?? v.bullets ?? v.body) as LayoutContent['text'] } as LayoutContent, ratio);
    s = { id: '', els: made.els, layout };
    if (made.bg) s.bg = made.bg;
    if (Array.isArray(v.extra)) s.els.push(...(v.extra as El[]));
  } else {
    s = { id: '', els: Array.isArray(v.els) ? (v.els as El[]) : [] };
    if (layout) s.layout = layout;
  }
  s.id = cleanId(v.id, used);
  const els: El[] = [];
  const pending: Obj[] = [];
  for (const raw of s.els.slice(0, SLIDE_LIMITS.els)) {
    const el = element(raw, used, H, o);
    if (!el) continue;
    els.push(el);
    const a = isObj(raw) ? elAnim(raw.anim, el.id) : null;
    if (a) pending.push(a);
  }
  s.els = els;
  const ids = new Set(els.map((e) => e.id));
  const anims = [...(Array.isArray(v.anims) ? v.anims : []), ...pending]
    .slice(0, SLIDE_LIMITS.anims)
    .map((a) => anim(a, used, ids))
    .filter((a): a is Anim => !!a);
  // "build": the body's words come one paragraph at a time.
  if (v.build === true || v.build === 'bullets') {
    const body = els.find((e) => (e.type === 'text' || e.type === 'shape') && e.role === 'body' && e.paras.length > 1);
    if (body && !anims.some((a) => a.el === body.id)) anims.push({ id: cleanId(undefined, used), el: body.id, type: 'in', fx: 'float', dir: 'up', on: 'click', dur: 450, delay: 0, byPara: true });
  }
  if (anims.length) s.anims = anims;
  const b = bg(v.bg ?? v.background, o);
  if (b) s.bg = b;
  else if (v.bg === null) delete s.bg;
  const t = transition(v.transition);
  if (t) s.transition = t;
  const notes = str(v.notes, SLIDE_LIMITS.notes).trim();
  if (notes) s.notes = notes;
  if (v.hidden === true) s.hidden = true;
  return s;
}

/** A theme of its own (a preset's, without its label). */
const own = (p: Theme): Theme => ({ id: p.id, bg: p.bg, fg: p.fg, head: p.head, muted: p.muted, accent: p.accent, accentFg: p.accentFg, soft: p.soft, colors: [...p.colors], font: p.font, headFont: p.headFont });

function theme(v: unknown, base: Theme): Theme {
  if (typeof v === 'string') return own(themeOf(v));
  const preset = isObj(v) && typeof v.id === 'string' && THEMES.some((t) => t.id === v.id) ? themeOf(v.id) : base;
  const t: Theme = own(preset);
  if (!isObj(v)) return t;
  if (typeof v.id === 'string' && /^[a-z0-9-]{1,30}$/.test(v.id)) t.id = v.id;
  for (const k of ['bg', 'fg', 'head', 'muted', 'accent', 'accentFg', 'soft'] as const) {
    const c = v[k];
    // A theme's own colours are actual colours, never names of its others.
    const clean = cleanColor(c);
    if (clean && !(COLOR_REFS as readonly string[]).includes(clean)) t[k] = clean;
  }
  if (Array.isArray(v.colors)) {
    const cs = v.colors.map(cleanColor).filter((c): c is string => !!c && !(COLOR_REFS as readonly string[]).includes(c));
    for (let i = 0; i < 6; i++) if (cs[i]) t.colors[i] = cs[i];
  }
  const font = cleanFont(v.font);
  if (font && font !== 'head' && font !== 'body') t.font = font;
  const head = cleanFont(v.headFont);
  if (head && head !== 'head' && head !== 'body') t.headFont = head;
  return t;
}

/**
 * The deck as it is kept, from what an agent or the editor sent: unknown fields dropped, every value checked,
 * ids given where missing. Throws when it is not a deck at all.
 */
export function normalizeDeck(input: unknown, o: NormalizeOpts = {}): Deck {
  const v = typeof input === 'string' ? (JSON.parse(input) as unknown) : input;
  if (!isObj(v) || !Array.isArray(v.slides)) throw new Error('A deck needs slides: an array.');
  const ratio = pick(v.ratio, ['16:9', '4:3'] as const, '16:9');
  const used = new Set<string>();
  const slides = v.slides
    .slice(0, SLIDE_LIMITS.slides)
    .map((s) => slide(s, used, ratio, o))
    .filter((s): s is Slide => !!s);
  if (!slides.length) slides.push({ ...layoutSlide('title', {}, ratio) });
  return { v: 1, ratio, theme: theme(v.theme, THEMES[0]), slides };
}

/** The pictures a deck shows (parts and backgrounds). */
export function deckSources(d: Deck): string[] {
  const out: string[] = [];
  for (const s of d.slides) {
    if (s.bg?.image) out.push(s.bg.image);
    for (const e of s.els) if (e.type === 'image' && e.src) out.push(e.src);
  }
  return out;
}

/** The deck with each picture's source changed by `f` (to put pictures inside it, say). */
export function mapSources(d: Deck, f: (src: string) => string): Deck {
  return {
    ...d,
    slides: d.slides.map((s) => ({
      ...s,
      ...(s.bg?.image ? { bg: { ...s.bg, image: f(s.bg.image) } } : {}),
      els: s.els.map((e) => (e.type === 'image' && e.src ? { ...e, src: f(e.src) } : e)),
    })),
  };
}

/**
 * The deck as text to keep: JSON with a line per slide's start, part and animation, so the changes between two
 * versions read as a diff of lines.
 */
export function deckText(d: Deck): string {
  const out: string[] = [`{"v":1,"ratio":${JSON.stringify(d.ratio)},"theme":${JSON.stringify(d.theme)},"slides":[`];
  d.slides.forEach((s, i) => {
    const { els, anims, ...rest } = s;
    out.push(` ${JSON.stringify(rest).slice(0, -1)},"els":[`);
    els.forEach((e, j) => out.push(`  ${JSON.stringify(e)}${j < els.length - 1 ? ',' : ''}`));
    if (anims?.length) {
      out.push(' ],"anims":[');
      anims.forEach((a, j) => out.push(`  ${JSON.stringify(a)}${j < anims.length - 1 ? ',' : ''}`));
    }
    out.push(` ]}${i < d.slides.length - 1 ? ',' : ''}`);
  });
  out.push(']}');
  return out.join('\n');
}

/** A deck in a few lines: each slide's number, title and what is on it, for an agent's overview. */
export function deckOutline(d: Deck): string {
  return d.slides
    .map((s, i) => {
      const kinds = s.els.map((e) => (e.type === 'shape' ? `shape:${e.shape}` : e.type));
      const what = [...new Set(kinds)].map((k) => `${kinds.filter((x) => x === k).length}× ${k}`).join(', ');
      return `${i + 1}. ${slideTitle(s) || '(no title)'} [${s.id}]${s.hidden ? ' (hidden)' : ''}: ${what || 'empty'}${s.anims?.length ? `, ${s.anims.length} animation${s.anims.length === 1 ? '' : 's'}` : ''}${s.notes ? ', notes' : ''}`;
    })
    .join('\n');
}

/** A new deck: a title slide in a theme. */
export function newDeck(title: string, themeId = 'paper', ratio: Ratio = '16:9'): Deck {
  return { v: 1, ratio, theme: own(themeOf(themeId)), slides: [layoutSlide('title', { title }, ratio)] };
}

/** The fonts a deck uses: its theme's and its parts'. */
export function deckFonts(d: Deck): string[] {
  const names = new Set<string>([d.theme.font, d.theme.headFont]);
  for (const s of d.slides)
    for (const e of s.els) {
      if ('font' in e && typeof e.font === 'string' && e.font !== 'head' && e.font !== 'body') names.add(e.font);
      if (e.type === 'text' || e.type === 'shape') for (const p of e.paras) for (const r of p.runs) if (r.font && r.font !== 'head' && r.font !== 'body') names.add(r.font);
    }
  return [...names];
}

/** Google Fonts' families for those of `names` it has, as its stylesheet's query ("family=Inter:…&family=…"), or ''. */
export function googleFamilies(names: string[]): string {
  return names
    .filter((x) => FONTS.some((f) => f.google && f.name === x))
    .map((x) => `family=${encodeURIComponent(x).replace(/%20/g, '+')}:ital,wght@0,400;0,600;0,700;1,400;1,700`)
    .join('&');
}

/** The fonts as the runtime takes them: each name's CSS family, and whether Google has it. */
export const FONT_TABLE: Record<string, { css: string; google?: boolean }> = Object.fromEntries(FONTS.map((f) => [f.name, f.google ? { css: f.css, google: true } : { css: f.css }]));

/** Whether stored page text is a deck (rather than a page's HTML). */
export const isDeckText = (s: string) => /^\s*\{\s*"v"\s*:\s*1\s*,\s*"ratio"/.test(s);
