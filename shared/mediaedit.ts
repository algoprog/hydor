// The picture editor's edits as a recipe: what to do to a picture, in plain data, so the editor in the app
// (web/src/features/mediaedit) and the agents' edit_image (server/mediaedit) make the same picture from the same
// recipe. A recipe turns the picture (a quarter turn at a time, flipped, straightened), crops it, changes its look
// (adjustments, then a filter at its strength, on top of the filter), hides areas (blurred or pixelated), draws marks
// over it (pen, highlighter, arrows, lines, boxes, ovals, words, emoji) and makes it a size and a kind of file.
// The look is worked out here pixel by pixel (applyLook, hideArea), the same code in the browser and on the server.
//
// Coordinates: marks, hidden areas and the crop are in the picture's "upright frame": its own pixels once it is
// turned and flipped (straightening keeps the frame, zooming in so no corner is left empty), before it is cropped.
// So a crop changed later leaves the marks on what they were drawn over. edit_image takes the agent's coordinates in
// the picture as it was given and puts them in that frame (toUpright).
//
// The editors in tabs (openEditor) hand back what they made as `Saved`; POST /api/mediaedit/image keeps a picture the
// editor made where it belongs (`SaveImageAsk`). The further adjustments (curves, levels, hue and saturation by range,
// colour balance, clarity, dehaze, noise reduction, grain, invert, posterize, threshold) are in mediaedit-look.ts.
import { DESIGN_FONTS, type FontCat } from './design-fonts.ts';
import { compileMore, clarity as clarityOf, dehaze as dehazeOf, grain as grainOf, normalizeMore, reduceNoise, shadeMore, hasMore, type LookFrame, type LookMore } from './mediaedit-look.ts';
export * from './mediaedit-look.ts';

// ---- the editors and where they save -------------------------------------------------------------------------

export type EditKind = 'image' | 'video' | 'audio';

/**
 * Where an editor's Save writes what it made: a picture kept for a deck, document or page, over a Library item, over a
 * file, or (a video's sound) a sound kept for the video ("naget-sound:…").
 */
export type SaveTo = { asset: true } | { media: string } | { file: string } | { sound: true };

/** What an editor hands back to where it was opened from. */
export interface Saved {
  kind: EditKind;
  /** A picture kept by the app ("naget-asset:<sha>"), or a video ("naget-video:<sha>"). */
  src?: string;
  /** The Library item it is now (an id). */
  media?: string;
  /** The file it was written to. */
  path?: string;
  w?: number;
  h?: number;
  mime?: string;
  /** It was written over what it came from (a Library item, a file), not kept beside it. */
  replaced?: boolean;
  /** A picture: its data: address, for a page that keeps its pictures inside it. */
  data?: string;
  /** A slide's video: its still, a picture kept by the app ("naget-asset:<sha>"). */
  poster?: string;
  /** A sound: how long it is, in seconds. */
  seconds?: number;
}

/** POST /api/mediaedit/image: a picture the editor made, kept where it belongs. */
export interface SaveImageAsk {
  /** The picture, as a data: address (PNG, JPEG or WebP). */
  data: string;
  /**
   * Kept by the app for a deck, document or page; a Library item written over (`replace`) or a new one beside it
   * (`copy`: with no `media`, simply a new item, `title` its name); a file written over, or a copy beside it.
   */
  to: { asset: true } | { media?: string; as: 'replace' | 'copy'; title?: string } | { file: string; as: 'replace' | 'copy' };
  /** The kind of file asked for, when the browser could not make it (some make no WebP): the server makes it. */
  format?: ImageFormat;
  quality?: number;
}
export interface SaveImageAnswer {
  src?: string;
  media?: string;
  path?: string;
  w: number;
  h: number;
  mime: string;
  bytes: number;
  replaced?: boolean;
  /** Why the file is not quite as asked (the kind of file could not be made here). */
  note?: string;
}

// ---- a picture's recipe --------------------------------------------------------------------------------------

export type ImageFormat = 'png' | 'jpeg' | 'webp';
export const IMAGE_FORMATS: { id: ImageFormat; label: string; mime: string; ext: string }[] = [
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
  { id: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp' },
];
export const formatOfMime = (mime: string | undefined): ImageFormat | null => IMAGE_FORMATS.find((f) => f.mime === mime)?.id ?? (mime === 'image/jpg' ? 'jpeg' : null);
export const formatOfName = (name: string): ImageFormat | null => {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'png' ? 'png' : ext === 'webp' ? 'webp' : null;
};

export type Quarter = 0 | 90 | 180 | 270;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The adjustments, in the order the editor lists them. Each goes from `min` to 100, 0 leaving the picture as it is. */
export const ADJUSTMENTS = [
  { id: 'exposure', label: 'Exposure', min: -100 },
  { id: 'brightness', label: 'Brightness', min: -100 },
  { id: 'contrast', label: 'Contrast', min: -100 },
  { id: 'highlights', label: 'Highlights', min: -100 },
  { id: 'shadows', label: 'Shadows', min: -100 },
  { id: 'saturation', label: 'Saturation', min: -100 },
  { id: 'vibrance', label: 'Vibrance', min: -100 },
  { id: 'warmth', label: 'Warmth', min: -100 },
  { id: 'tint', label: 'Tint', min: -100 },
  { id: 'sharpness', label: 'Sharpness', min: 0 },
  { id: 'blur', label: 'Blur', min: 0 },
  { id: 'vignette', label: 'Vignette', min: -100 },
  { id: 'clarity', label: 'Clarity', min: -100 },
  { id: 'dehaze', label: 'Dehaze', min: -100 },
  { id: 'noise', label: 'Noise reduction', min: 0 },
  { id: 'grain', label: 'Grain', min: 0 },
] as const;
export type AdjustKey = (typeof ADJUSTMENTS)[number]['id'];
export type Adjust = Partial<Record<AdjustKey, number>>;

/** The filters: a look each, at a strength. */
export const FILTERS = [
  { id: 'vivid', label: 'Vivid' },
  { id: 'warm', label: 'Warm tones' },
  { id: 'cool', label: 'Cool tones' },
  { id: 'mono', label: 'Black and white' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'faded', label: 'Faded' },
  { id: 'matte', label: 'Matte' },
  { id: 'noir', label: 'Noir' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'film', label: 'Film' },
  { id: 'dramatic', label: 'Dramatic' },
  { id: 'golden', label: 'Golden hour' },
  { id: 'pastel', label: 'Pastel' },
] as const;
export type FilterId = (typeof FILTERS)[number]['id'];
export interface FilterPick {
  id: FilterId;
  /** 0 to 100 (left out: 100). */
  strength?: number;
}

/** The crop's shapes: the picture's own, any, or a fixed one (width ÷ height; turned for a tall picture by the editor). */
export const CROP_SHAPES = [
  { id: 'original', label: 'Original', ratio: 0 },
  { id: 'free', label: 'Any shape', ratio: 0 },
  { id: '1:1', label: 'Square (1:1)', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
] as const;
export type CropShape = (typeof CROP_SHAPES)[number]['id'];

/**
 * A font words are written in: `css` is its font-family; `cat` says what the server's nearest looks like (it has none
 * of these fonts but the computer's own: it takes the nearest kind); `google` is the family to load from Google Fonts
 * when it is used (the design editor's fonts); `shipped` ones come with the app.
 */
export interface MarkFont {
  id: string;
  label: string;
  css: string;
  cat: 'sans' | 'serif' | 'mono' | 'hand' | 'display';
  google?: string;
  /** The weights the family has (Google's), so a bold the font has is asked for. */
  weights?: number[];
  /** One of the computer's own fonts, picked by name ("local:Helvetica Neue"). */
  local?: boolean;
}

const CAT_OF: Record<FontCat, MarkFont['cat']> = { sans: 'sans', display: 'display', serif: 'serif', script: 'hand', mono: 'mono' };
const CAT_CSS: Record<MarkFont['cat'], string> = { sans: 'system-ui, sans-serif', display: 'Impact, system-ui, sans-serif', serif: 'Georgia, serif', hand: 'cursive', mono: 'ui-monospace, monospace' };

/** The fonts words are written in: the browser's own of each kind first, then the fonts the app comes with and loads. */
export const MARK_FONTS: readonly MarkFont[] = [
  { id: 'sans', label: 'Sans', css: 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', cat: 'sans' },
  { id: 'serif', label: 'Serif', css: 'Georgia, "Times New Roman", ui-serif, serif', cat: 'serif' },
  { id: 'mono', label: 'Monospace', css: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', cat: 'mono' },
  { id: 'hand', label: 'Handwritten', css: '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive', cat: 'hand' },
  { id: 'heavy', label: 'Heavy', css: 'Impact, "Arial Black", "Helvetica Neue", sans-serif', cat: 'display' },
  // The app's own monospace comes with it.
  { id: 'jetbrains', label: 'JetBrains Mono', css: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace', cat: 'mono' },
  ...DESIGN_FONTS.filter((f) => f.name !== 'Inter' && f.name !== 'JetBrains Mono').map(
    (f): MarkFont => ({ id: f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label: f.name, css: `"${f.name}", ${CAT_CSS[CAT_OF[f.cat]]}`, cat: CAT_OF[f.cat], google: f.name, weights: f.w }),
  ),
];
/** A font's id: one of the list, or one of the computer's own, "local:" and its family's name. */
export type FontId = string;

const LOCAL = /^local:[\p{L}\p{N} ._()'-]{1,60}$/u;
/** Whether an id is a font words can be written in. */
export const isFontId = (id: unknown): id is FontId => typeof id === 'string' && (MARK_FONTS.some((f) => f.id === id) || LOCAL.test(id));
/** A font by its id; the computer's own ("local:Family") made up from its name; Sans when it is none. */
export function fontOf(id: string | undefined): MarkFont {
  const known = MARK_FONTS.find((f) => f.id === id);
  if (known) return known;
  if (id && LOCAL.test(id)) {
    const family = id.slice(6).replace(/["\\]/g, '');
    return { id, label: family, css: `"${family}", system-ui, sans-serif`, cat: 'sans', local: true };
  }
  return MARK_FONTS[0];
}

/**
 * How words are set, beyond their font, size and colour. All optional, and what they leave out is as it always was: bold
 * (a heavier weight; `bold: false` the plain one), upright, left-aligned, lines 1.22 times the size apart, no outline or shadow.
 */
export interface TextStyle {
  bold?: boolean;
  italic?: boolean;
  /** Each line against the left, the middle or the right of the widest. */
  align?: 'left' | 'centre' | 'right';
  /** How far apart the lines are, in times the size (0.8 to 3). */
  lineHeight?: number;
  /** A line round the letters, `width` pixels out. */
  outline?: { color: string; width: number };
  /** A shadow: moved (`x`, `y`) pixels and softened by `blur` pixels. */
  shadow?: { color: string; blur: number; x: number; y: number };
}

/** A mark drawn over the picture, in its upright frame's pixels. `id` keeps it apart while the editor moves it. */
export type Mark =
  | { id?: string; type: 'pen' | 'highlighter'; pts: number[]; color: string; width: number }
  | { id?: string; type: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { id?: string; type: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; color: string; width: number; fill?: string }
  /** Words: `x`, `y` their box's top left; `bg` a colour behind them (none: no box). */
  | { id?: string; type: 'text'; x: number; y: number; text: string; size: number; color: string; font?: FontId; bg?: string } & TextStyle
  | { id?: string; type: 'emoji'; x: number; y: number; size: number; emoji: string }
  /** An area hidden: blurred or pixelated, so a face or a number cannot be read (0 to 100: how much). */
  | { id?: string; type: 'blur' | 'pixelate'; x: number; y: number; w: number; h: number; strength?: number };
export type MarkType = Mark['type'];

export interface ImageRecipe {
  /** Quarter turns clockwise, first. */
  rotate?: Quarter;
  /** Then flipped left to right, or upside down. */
  flipH?: boolean;
  flipV?: boolean;
  /** Then straightened: degrees clockwise (−45 to 45), about the middle, zoomed in so no corner is empty. */
  straighten?: number;
  /** The part kept, in the upright frame. */
  crop?: Box;
  adjust?: Adjust;
  filter?: FilterPick;
  /** What the look adds: curves, levels, hue and saturation by range, colour balance, invert, posterize, threshold. */
  curves?: LookMore['curves'];
  levels?: LookMore['levels'];
  hsl?: LookMore['hsl'];
  balance?: LookMore['balance'];
  invert?: boolean;
  posterize?: number;
  threshold?: number;
  marks?: Mark[];
  /** The size of the file, last (the crop's, else the picture's, when left out). */
  resize?: { w: number; h: number };
  format?: ImageFormat;
  /** JPEG and WebP: 1 to 100. */
  quality?: number;
}

export const LIMITS = {
  /** The longest side of a picture made, and its most pixels. */
  side: 8192,
  pixels: 40_000_000,
  marks: 300,
  /** The points of a pen's stroke (x and y each). */
  points: 6000,
  text: 500,
  emoji: 16,
};

// ---- checking a recipe ---------------------------------------------------------------------------------------

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const round1 = (v: number) => Math.round(v * 10) / 10;
const COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** A colour as marks take it: #rgb, #rgba, #rrggbb or #rrggbbaa; a few names too. */
const NAMED: Record<string, string> = { black: '#000000', white: '#ffffff', red: '#ef4444', green: '#22c55e', blue: '#3b82f6', yellow: '#facc15', orange: '#f97316', purple: '#a855f7', pink: '#ec4899', grey: '#6b7280', gray: '#6b7280' };
export function colorOf(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (COLOR.test(s)) return s;
  return NAMED[s] ?? fallback;
}

/** The upright frame's size: the picture's own, its sides swapped by a quarter turn. */
export const uprightSize = (w: number, h: number, rotate: Quarter | undefined) => (rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h });

const quarter = (v: unknown): Quarter => {
  const n = num(v);
  if (n === null) return 0;
  const q = (((Math.round(n / 90) * 90) % 360) + 360) % 360;
  return q as Quarter;
};

/** The text style an agent's or the editor's mark asks for, made safe: what is off or out of reach left out. */
export function textStyleOf(o: Record<string, unknown>, size: number): TextStyle {
  const out: TextStyle = {};
  if (o.bold === false) out.bold = false;
  if (o.italic === true) out.italic = true;
  if (o.align === 'centre' || o.align === 'center') out.align = 'centre';
  else if (o.align === 'right') out.align = 'right';
  const lh = num(o.lineHeight);
  if (lh !== null && Math.abs(lh - 1.22) > 0.005) out.lineHeight = Math.round(clamp(lh, 0.8, 3) * 100) / 100;
  const ol = o.outline && typeof o.outline === 'object' ? (o.outline as Record<string, unknown>) : null;
  const ow = ol ? num(ol.width) : null;
  if (ol && ow !== null && ow > 0) out.outline = { color: colorOf(ol.color, '#000000'), width: round1(clamp(ow, 0.5, Math.max(2, size / 3))) };
  const sh = o.shadow && typeof o.shadow === 'object' ? (o.shadow as Record<string, unknown>) : null;
  if (sh) {
    const [sx, sy, sb] = [num(sh.x) ?? 0, num(sh.y) ?? 0, num(sh.blur) ?? 0];
    const reach = Math.max(4, size);
    if (sx || sy || sb > 0) out.shadow = { color: colorOf(sh.color, '#000000'), blur: round1(clamp(sb, 0, reach)), x: round1(clamp(sx, -reach, reach)), y: round1(clamp(sy, -reach, reach)) };
  }
  return out;
}

function markOf(m: unknown, W: number, H: number): Mark | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  // Within the frame and a frame's width or height beyond it: dragged partly out, a mark stays.
  const X = (v: unknown) => {
    const n = num(v);
    return n === null ? null : round1(clamp(n, -W, 2 * W));
  };
  const Y = (v: unknown) => {
    const n = num(v);
    return n === null ? null : round1(clamp(n, -H, 2 * H));
  };
  const long = Math.max(W, H);
  const width = clamp(num(o.width) ?? Math.max(2, Math.round(long / 200)), 1, 400);
  const id = typeof o.id === 'string' && o.id.length <= 40 ? { id: o.id } : {};
  switch (o.type) {
    case 'pen':
    case 'highlighter': {
      if (!Array.isArray(o.pts)) return null;
      const pts: number[] = [];
      for (let i = 0; i + 1 < o.pts.length && pts.length < LIMITS.points * 2; i += 2) {
        const x = X(o.pts[i]);
        const y = Y(o.pts[i + 1]);
        if (x !== null && y !== null) pts.push(x, y);
      }
      if (!pts.length) return null;
      return { ...id, type: o.type, pts, color: colorOf(o.color, o.type === 'highlighter' ? '#facc15' : '#ef4444'), width: o.type === 'highlighter' ? clamp(num(o.width) ?? Math.max(8, Math.round(long / 40)), 2, 600) : width };
    }
    case 'line':
    case 'arrow': {
      const [x1, y1, x2, y2] = [X(o.x1), Y(o.y1), X(o.x2), Y(o.y2)];
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { ...id, type: o.type, x1, y1, x2, y2, color: colorOf(o.color, '#ef4444'), width };
    }
    case 'rect':
    case 'ellipse':
    case 'blur':
    case 'pixelate': {
      let [x, y, w, h] = [X(o.x), Y(o.y), num(o.w), num(o.h)];
      if (x === null || y === null || w === null || h === null) return null;
      // A box drawn backwards (from its bottom right) is the same box.
      if (w < 0) [x, w] = [x + w, -w];
      if (h < 0) [y, h] = [y + h, -h];
      w = round1(clamp(w, 1, 3 * W));
      h = round1(clamp(h, 1, 3 * H));
      if (o.type === 'blur' || o.type === 'pixelate') return { ...id, type: o.type, x, y, w, h, strength: Math.round(clamp(num(o.strength) ?? 60, 20, 100)) };
      const fill = typeof o.fill === 'string' && o.fill.trim() && o.fill !== 'none' ? { fill: colorOf(o.fill, '#ffffff') } : {};
      return { ...id, type: o.type, x, y, w, h, color: colorOf(o.color, '#ef4444'), width, ...fill };
    }
    case 'text': {
      const text =
        typeof o.text === 'string'
          ? o.text
              .replace(/\r\n?/g, '\n')
              .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
              .slice(0, LIMITS.text)
          : '';
      const [x, y] = [X(o.x), Y(o.y)];
      if (!text.trim() || x === null || y === null) return null;
      const font = isFontId(o.font) ? { font: o.font } : {};
      const bg = typeof o.bg === 'string' && o.bg.trim() && o.bg !== 'none' ? { bg: colorOf(o.bg, '#000000') } : {};
      const size = Math.round(clamp(num(o.size) ?? Math.max(16, Math.round(long / 20)), 6, 1200));
      return { ...id, type: 'text', x, y, text, size, color: colorOf(o.color, '#ffffff'), ...font, ...bg, ...textStyleOf(o, size) };
    }
    case 'emoji': {
      const emoji = typeof o.emoji === 'string' ? o.emoji.trim().slice(0, LIMITS.emoji) : '';
      const [x, y] = [X(o.x), Y(o.y)];
      if (!emoji || x === null || y === null) return null;
      return { ...id, type: 'emoji', x, y, emoji, size: Math.round(clamp(num(o.size) ?? Math.max(24, Math.round(long / 10)), 8, 2000)) };
    }
  }
  return null;
}

/**
 * A recipe as given (by the editor, or put together from an agent's words) made safe and plain for a picture `w` × `h`:
 * numbers within their limits, unknown things left out, what changes nothing dropped. Throws, in words, only when the
 * result would be too large to make.
 */
export function normalizeRecipe(raw: unknown, w: number, h: number): ImageRecipe {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const out: ImageRecipe = {};
  const rotate = quarter(r.rotate);
  if (rotate) out.rotate = rotate;
  if (r.flipH === true) out.flipH = true;
  if (r.flipV === true) out.flipV = true;
  const st = num(r.straighten);
  if (st !== null && Math.abs(st) >= 0.05) out.straighten = round1(clamp(st, -45, 45));
  const U = uprightSize(w, h, out.rotate);
  if (r.crop && typeof r.crop === 'object') {
    const c = r.crop as Record<string, unknown>;
    const [x, y, cw, ch] = [num(c.x), num(c.y), num(c.w), num(c.h)];
    if (x !== null && y !== null && cw !== null && ch !== null) {
      const x0 = Math.round(clamp(x, 0, U.w - 1));
      const y0 = Math.round(clamp(y, 0, U.h - 1));
      const x1 = Math.round(clamp(x + cw, x0 + 1, U.w));
      const y1 = Math.round(clamp(y + ch, y0 + 1, U.h));
      if (x0 > 0 || y0 > 0 || x1 < U.w || y1 < U.h) out.crop = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  }
  if (r.adjust && typeof r.adjust === 'object') {
    const a: Adjust = {};
    for (const d of ADJUSTMENTS) {
      const v = num((r.adjust as Record<string, unknown>)[d.id]);
      const k = v === null ? 0 : Math.round(clamp(v, d.min, 100));
      if (k) a[d.id] = k;
    }
    if (Object.keys(a).length) out.adjust = a;
  }
  if (r.filter && typeof r.filter === 'object' && FILTERS.some((f) => f.id === r.filter.id)) {
    const s = num(r.filter.strength);
    const strength = Math.round(clamp(s ?? 100, 0, 100));
    if (strength > 0) out.filter = strength === 100 ? { id: r.filter.id } : { id: r.filter.id, strength };
  }
  Object.assign(out, normalizeMore(r));
  if (Array.isArray(r.marks)) {
    const marks = r.marks
      .slice(0, LIMITS.marks)
      .map((m: unknown) => markOf(m, U.w, U.h))
      .filter((m: Mark | null): m is Mark => !!m);
    if (marks.length) out.marks = marks;
  }
  const size = cropSize(out, w, h);
  if (r.resize && typeof r.resize === 'object') {
    const rw = num(r.resize.w);
    const rh = num(r.resize.h);
    // One side given: the other keeps the shape.
    const W = rw !== null && rw > 0 ? rw : rh !== null && rh > 0 ? (rh * size.w) / size.h : null;
    const H = rh !== null && rh > 0 ? rh : W !== null ? (W * size.h) / size.w : null;
    if (W !== null && H !== null) {
      const ow = Math.max(1, Math.round(W));
      const oh = Math.max(1, Math.round(H));
      if (ow !== size.w || oh !== size.h) out.resize = { w: ow, h: oh };
    }
  }
  const fmt = IMAGE_FORMATS.some((f) => f.id === r.format) ? (r.format as ImageFormat) : r.format === 'jpg' ? 'jpeg' : null;
  if (fmt) out.format = fmt;
  const q = num(r.quality);
  if (q !== null && out.format !== 'png') out.quality = Math.round(clamp(q, 1, 100));
  const o = outputSize(out, w, h);
  if (o.w > LIMITS.side || o.h > LIMITS.side || o.w * o.h > LIMITS.pixels) throw new Error(`That would be ${o.w} × ${o.h} pixels: at most ${LIMITS.side} on a side and ${LIMITS.pixels / 1e6} million in all.`);
  return out;
}

/** The size once cropped (the upright frame's, with no crop). */
export function cropSize(r: ImageRecipe, w: number, h: number): { w: number; h: number } {
  if (r.crop) return { w: r.crop.w, h: r.crop.h };
  return uprightSize(w, h, r.rotate);
}

/** The size of the picture made. */
export const outputSize = (r: ImageRecipe, w: number, h: number) => r.resize ?? cropSize(r, w, h);

/** Whether a recipe changes nothing (the picture would come out as it went in, but for its kind of file). */
export const isPlain = (r: ImageRecipe) => !r.rotate && !r.flipH && !r.flipV && !r.straighten && !r.crop && !hasLook(r) && !r.marks?.length && !r.resize;

/** Whether its look changes anything. */
export const hasLook = (r: ImageRecipe | LookSettings) => !!r.adjust || !!r.filter || hasMore(r);

/** A look on its own: the adjustments, the filter and what the look adds (an adjustment layer's, in the editor). */
export type LookSettings = Pick<ImageRecipe, 'adjust' | 'filter' | 'curves' | 'levels' | 'hsl' | 'balance' | 'invert' | 'posterize' | 'threshold'>;

/** A look made safe and plain, as a recipe's is. */
export function normalizeLook(raw: unknown): LookSettings {
  const r = normalizeRecipe(raw && typeof raw === 'object' ? { adjust: (raw as LookSettings).adjust, filter: (raw as LookSettings).filter, ...normalizeMore(raw) } : {}, 1, 1);
  const out: LookSettings = {};
  for (const k of ['adjust', 'filter', 'curves', 'levels', 'hsl', 'balance', 'invert', 'posterize', 'threshold'] as const) if (r[k] !== undefined) (out as Record<string, unknown>)[k] = r[k];
  return out;
}

/** A look put on pixels in place (applyLook, with what it adds). */
export const applyLookSettings = (px: Uint8ClampedArray, w: number, h: number, l: LookSettings, frame?: LookFrame) => applyLook(px, w, h, l.adjust, l.filter, l, frame);

// ---- where things are -------------------------------------------------------------------------------------------

/** How much straightening by `deg` zooms in so the frame (`w` × `h`) has no empty corner. */
export function straightenZoom(w: number, h: number, deg: number): number {
  const t = (Math.abs(deg) * Math.PI) / 180;
  if (!t) return 1;
  // A pixel more, so the corners' smoothed edges stay outside the frame too.
  return (Math.cos(t) + Math.max(w / h, h / w) * Math.sin(t)) * (1 + 1.5 / Math.min(w, h));
}

/** An affine map, as a canvas takes it: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Affine = [number, number, number, number, number, number];

const mul = (m: Affine, n: Affine): Affine => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

export function invert(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2];
  const [a, b, c, d] = [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det];
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export const apply = (m: Affine, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * Where the picture's own pixels go in its upright frame (turned, flipped, straightened), and the frame's size. With
 * `crop`, the map is to the cropped picture (its top left at 0, 0).
 */
export function uprightMap(r: ImageRecipe, w: number, h: number, o: { crop?: boolean } = {}): { map: Affine; w: number; h: number } {
  const U = uprightSize(w, h, r.rotate);
  const q = ((r.rotate ?? 0) * Math.PI) / 180;
  const t = ((r.straighten ?? 0) * Math.PI) / 180;
  const s = straightenZoom(U.w, U.h, r.straighten ?? 0);
  const fx = r.flipH ? -1 : 1;
  const fy = r.flipV ? -1 : 1;
  const rot = (a: number): Affine => {
    // Exact quarter turns, so a turned picture lands on whole pixels.
    const c = Math.round(Math.cos(a) * 1e12) / 1e12;
    const sn = Math.round(Math.sin(a) * 1e12) / 1e12;
    return [c, sn, -sn, c, 0, 0];
  };
  let m: Affine = [1, 0, 0, 1, -w / 2, -h / 2];
  m = mul(rot(q), m);
  m = mul([fx, 0, 0, fy, 0, 0], m);
  m = mul([s, 0, 0, s, 0, 0], m);
  m = mul(rot(t), m);
  m = mul([1, 0, 0, 1, U.w / 2, U.h / 2], m);
  if (o.crop && r.crop) m = mul([1, 0, 0, 1, -r.crop.x, -r.crop.y], m);
  return { map: m, ...(o.crop && r.crop ? { w: r.crop.w, h: r.crop.h } : U) };
}

/** A point of the picture as given, in its upright frame once turned and flipped (as edit_image takes coordinates). */
export function toUpright(x: number, y: number, w: number, h: number, rotate: Quarter | undefined, flipH?: boolean, flipV?: boolean): [number, number] {
  let X = x;
  let Y = y;
  const U = uprightSize(w, h, rotate);
  if (rotate === 90) [X, Y] = [h - y, x];
  else if (rotate === 180) [X, Y] = [w - x, h - y];
  else if (rotate === 270) [X, Y] = [y, w - x];
  if (flipH) X = U.w - X;
  if (flipV) Y = U.h - Y;
  return [X, Y];
}

/** A box of the picture as given, in its upright frame once turned and flipped. */
export function boxToUpright(b: Box, w: number, h: number, rotate: Quarter | undefined, flipH?: boolean, flipV?: boolean): Box {
  const [ax, ay] = toUpright(b.x, b.y, w, h, rotate, flipH, flipV);
  const [bx, by] = toUpright(b.x + b.w, b.y + b.h, w, h, rotate, flipH, flipV);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
}

/** The largest crop of a shape (`ratio`, width ÷ height) in a frame, in its middle. */
export function cropOfShape(W: number, H: number, ratio: number): Box {
  if (!ratio) return { x: 0, y: 0, w: W, h: H };
  let w = W;
  let h = W / ratio;
  if (h > H) {
    h = H;
    w = H * ratio;
  }
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w: Math.round(w), h: Math.round(h) };
}

/** Moves every point of a mark (its box by its top left, words by where they start). */
export function moveMark(m: Mark, f: (x: number, y: number) => [number, number]): Mark {
  switch (m.type) {
    case 'pen':
    case 'highlighter': {
      const pts: number[] = [];
      for (let i = 0; i + 1 < m.pts.length; i += 2) pts.push(...f(m.pts[i], m.pts[i + 1]));
      return { ...m, pts };
    }
    case 'line':
    case 'arrow': {
      const [x1, y1] = f(m.x1, m.y1);
      const [x2, y2] = f(m.x2, m.y2);
      return { ...m, x1, y1, x2, y2 };
    }
    case 'rect':
    case 'ellipse':
    case 'blur':
    case 'pixelate': {
      const [ax, ay] = f(m.x, m.y);
      const [bx, by] = f(m.x + m.w, m.y + m.h);
      return { ...m, x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
    }
    case 'text':
    case 'emoji': {
      const [x, y] = f(m.x, m.y);
      return { ...m, x, y };
    }
  }
}

/** A mark made larger or smaller by `k` (a picture made at another size: its sizes and widths too). */
export function scaleMark(m: Mark, k: number): Mark {
  const moved = moveMark(m, (x, y) => [x * k, y * k]);
  if (moved.type === 'text' || moved.type === 'emoji') return { ...moved, size: Math.max(1, moved.size * k) };
  if ('width' in moved) return { ...moved, width: Math.max(1, moved.width * k) };
  return moved;
}

/**
 * The recipe given a quarter turn (`dir` 1: clockwise, −1: the other way): its crop and marks go with the picture, words
 * staying upright (their box by its middle, `size` saying how large a mark's box is, when known).
 */
export function turnRecipe(r: ImageRecipe, w: number, h: number, dir: 1 | -1, size?: (m: Mark) => { w: number; h: number } | null): ImageRecipe {
  const U = uprightSize(w, h, r.rotate);
  // In the old frame, a point goes to (H - y, x) turning clockwise, (y, W - x) the other way.
  const f = (x: number, y: number): [number, number] => (dir === 1 ? [U.h - y, x] : [y, U.w - x]);
  const rotate = ((((r.rotate ?? 0) + dir * 90) % 360) + 360) % 360;
  // Flips stay as they look: turning swaps which way a flip goes.
  const out: ImageRecipe = { ...r, rotate: rotate as Quarter, flipH: r.flipV, flipV: r.flipH };
  if (!out.rotate) delete out.rotate;
  if (!out.flipH) delete out.flipH;
  if (!out.flipV) delete out.flipV;
  if (r.crop) {
    const [ax, ay] = f(r.crop.x, r.crop.y);
    const [bx, by] = f(r.crop.x + r.crop.w, r.crop.y + r.crop.h);
    out.crop = { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }
  if (r.marks) out.marks = r.marks.map((m) => upright(m, f, size));
  return out;
}

/** The recipe flipped left to right (`axis` 'h') or upside down ('v'): its crop and marks mirrored, words still readable. */
export function flipRecipe(r: ImageRecipe, w: number, h: number, axis: 'h' | 'v', size?: (m: Mark) => { w: number; h: number } | null): ImageRecipe {
  const U = uprightSize(w, h, r.rotate);
  const f = (x: number, y: number): [number, number] => (axis === 'h' ? [U.w - x, y] : [x, U.h - y]);
  const out: ImageRecipe = { ...r };
  if (axis === 'h') out.flipH = !r.flipH;
  else out.flipV = !r.flipV;
  if (!out.flipH) delete out.flipH;
  if (!out.flipV) delete out.flipV;
  // Straightening mirrors with the picture.
  if (r.straighten) out.straighten = -r.straighten;
  if (r.crop) {
    const [ax, ay] = f(r.crop.x, r.crop.y);
    const [bx, by] = f(r.crop.x + r.crop.w, r.crop.y + r.crop.h);
    out.crop = { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) };
  }
  if (r.marks) out.marks = r.marks.map((m) => upright(m, f, size));
  return out;
}

/** A mark moved by `f`; words and emoji by their box's middle, so they land where they looked and stay upright. */
function upright(m: Mark, f: (x: number, y: number) => [number, number], size?: (m: Mark) => { w: number; h: number } | null): Mark {
  if (m.type !== 'text' && m.type !== 'emoji') return moveMark(m, f);
  const s = size?.(m) ?? { w: m.size, h: m.size };
  const [cx, cy] = f(m.x + s.w / 2, m.y + s.h / 2);
  return { ...m, x: cx - s.w / 2, y: cy - s.h / 2 };
}

/** An arrow's head: a triangle at its end, sized by its width; its line stops at the head's base (`neck`). */
export function arrowHead(x1: number, y1: number, x2: number, y2: number, width: number): { tip: [number, number]; left: [number, number]; right: [number, number]; neck: [number, number] } {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const hl = Math.min(Math.max(width * 3.4, 10), len * 0.8);
  const hw = hl * 0.62;
  const bx = x2 - ux * hl;
  const by = y2 - uy * hl;
  return { tip: [x2, y2], left: [bx - uy * hw, by + ux * hw], right: [bx + uy * hw, by - ux * hw], neck: [x2 - ux * hl * 0.8, y2 - uy * hl * 0.8] };
}

/** Words' lines and their box: how high a line is, and the padding a box behind them has, for a size. */
export const textMetrics = (size: number, lineHeight?: number) => ({ line: Math.round(size * (lineHeight ?? 1.22)), pad: Math.round(size * 0.28) });

/** The weight words are drawn in: the plain 400 when `bold` is off, else a heavy one (600 for the browser's own fonts, 700 for the others). */
export function textWeight(m: { font?: string; bold?: boolean }): number {
  if (m.bold === false) return 400;
  const f = fontOf(m.font);
  if (f.id === 'heavy') return 400;
  const w = f.weights;
  if (!w) return 600;
  return w.includes(700) ? 700 : w[w.length - 1];
}

/** The font a canvas draws words in: "italic 600 32px Inter, …". */
export const textFont = (m: { font?: string; bold?: boolean; italic?: boolean; size: number }) => `${m.italic ? 'italic ' : ''}${textWeight(m)} ${m.size}px ${fontOf(m.font).css}`;

/** How far an outline or a shadow reaches past the words' box, in pixels (room for the box a picked mark shows). */
export function textReach(m: TextStyle): number {
  const o = m.outline ? m.outline.width : 0;
  const s = m.shadow ? Math.max(Math.abs(m.shadow.x), Math.abs(m.shadow.y)) + m.shadow.blur * 2 : 0;
  return Math.ceil(Math.max(o, s));
}

// ---- the look, pixel by pixel ---------------------------------------------------------------------------------

/** A look: the adjustments' kinds of change, and a filter's own (grey, brown, faded, tinted shadows and highlights). */
interface Look {
  exposure?: number;
  brightness?: number;
  contrast?: number;
  highlights?: number;
  shadows?: number;
  saturation?: number;
  vibrance?: number;
  warmth?: number;
  tint?: number;
  /** Grey, by how much red, green and blue count. */
  mono?: [number, number, number];
  /** Brown, as an old photograph (0 to 1). */
  sepia?: number;
  /** Blacks lifted and whites lowered (0 to 1 each): a faded print. */
  lift?: number;
  fall?: number;
  /** Shadows and highlights tinted (red, green and blue shifts). */
  split?: { lo: [number, number, number]; hi: [number, number, number] };
  vignette?: number;
}

const FILTER_LOOKS: Record<FilterId, Look> = {
  vivid: { contrast: 18, saturation: 30, vibrance: 28 },
  warm: { warmth: 42, saturation: 8, brightness: 4 },
  cool: { warmth: -42, tint: -4, brightness: 2 },
  mono: { mono: [0.3, 0.59, 0.11], contrast: 12 },
  sepia: { sepia: 1, contrast: 6 },
  faded: { lift: 0.13, fall: 0.06, saturation: -28, contrast: -8 },
  matte: { lift: 0.08, contrast: -14, saturation: -12, warmth: 6 },
  noir: { mono: [0.25, 0.65, 0.1], contrast: 55, brightness: -10, vignette: 35 },
  vintage: { sepia: 0.38, lift: 0.07, warmth: 18, saturation: -18, vignette: 28 },
  film: { contrast: 14, saturation: -10, lift: 0.04, split: { lo: [-0.05, 0.01, 0.06], hi: [0.06, 0.02, -0.05] } },
  dramatic: { contrast: 42, saturation: -22, shadows: -12, vignette: 32 },
  golden: { warmth: 58, tint: 10, exposure: 10, saturation: 12 },
  pastel: { brightness: 20, contrast: -26, saturation: -32, lift: 0.06 },
};

interface Compiled {
  lut: Float32Array | null;
  hi: number;
  sh: number;
  sat: number;
  vib: number;
  warm: number;
  tint: number;
  mono: [number, number, number] | null;
  sepia: number;
  lift: number;
  fall: number;
  split: Look['split'] | null;
}

const LUT = 1024;
const smooth = (a: number, b: number, x: number) => {
  const t = x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a);
  return t * t * (3 - 2 * t);
};
const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const toSrgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function compile(l: Look): Compiled | null {
  const ex = (l.exposure ?? 0) / 100;
  const br = (l.brightness ?? 0) / 100;
  const co = (l.contrast ?? 0) / 100;
  let lut: Float32Array | null = null;
  if (ex || br || co) {
    lut = new Float32Array(LUT + 1);
    const gain = Math.pow(2, ex * 1.5);
    const gamma = Math.pow(2, -br * 0.85);
    const k = Math.pow(2, co * 1.25);
    for (let i = 0; i <= LUT; i++) {
      let v = i / LUT;
      // Exposure in light as it is (linear), so it brightens as a longer exposure would.
      if (ex) v = toSrgb(Math.min(1, toLinear(v) * gain));
      if (br) v = Math.pow(v, gamma);
      if (co) v = v < 0.5 ? 0.5 * Math.pow(2 * v, k) : 1 - 0.5 * Math.pow(2 - 2 * v, k);
      lut[i] = v;
    }
  }
  const c: Compiled = {
    lut,
    hi: (l.highlights ?? 0) / 100,
    sh: (l.shadows ?? 0) / 100,
    sat: (l.saturation ?? 0) / 100,
    vib: (l.vibrance ?? 0) / 100,
    warm: (l.warmth ?? 0) / 100,
    tint: (l.tint ?? 0) / 100,
    mono: l.mono ?? null,
    sepia: l.sepia ?? 0,
    lift: l.lift ?? 0,
    fall: l.fall ?? 0,
    split: l.split ?? null,
  };
  return lut || c.hi || c.sh || c.sat || c.vib || c.warm || c.tint || c.mono || c.sepia || c.lift || c.fall || c.split ? c : null;
}

const OUT = new Float32Array(3);

/** One pixel's colour (0 to 1 each) through a look, into OUT. */
function shade(c: Compiled, r: number, g: number, b: number) {
  const lut = c.lut;
  if (lut) {
    r = lut[r <= 0 ? 0 : r >= 1 ? LUT : (r * LUT + 0.5) | 0];
    g = lut[g <= 0 ? 0 : g >= 1 ? LUT : (g * LUT + 0.5) | 0];
    b = lut[b <= 0 ? 0 : b >= 1 ? LUT : (b * LUT + 0.5) | 0];
  }
  if (c.hi || c.sh) {
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let d = 0;
    if (c.hi) d += c.hi * 0.32 * smooth(0.45, 1, L) * (c.hi > 0 ? 1 - L : L);
    if (c.sh) d += c.sh * 0.32 * (1 - smooth(0, 0.55, L)) * (c.sh > 0 ? 1 - L : L);
    r += d;
    g += d;
    b += d;
  }
  if (c.mono) {
    const v = c.mono[0] * r + c.mono[1] * g + c.mono[2] * b;
    r = g = b = v;
  }
  if (c.sepia) {
    const s = c.sepia;
    const sr = 0.393 * r + 0.769 * g + 0.189 * b;
    const sg = 0.349 * r + 0.686 * g + 0.168 * b;
    const sb = 0.272 * r + 0.534 * g + 0.131 * b;
    r += (sr - r) * s;
    g += (sg - g) * s;
    b += (sb - b) * s;
  }
  if (c.sat || c.vib) {
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
    // Vibrance does most to the colours that have least.
    const k = (1 + c.sat) * (1 + c.vib * (1 - Math.min(1, mx - mn)));
    r = L + (r - L) * k;
    g = L + (g - L) * k;
    b = L + (b - L) * k;
  }
  if (c.warm) {
    r *= 1 + 0.16 * c.warm;
    g *= 1 + 0.03 * c.warm;
    b *= 1 - 0.16 * c.warm;
  }
  if (c.tint) {
    r *= 1 + 0.06 * c.tint;
    g *= 1 - 0.14 * c.tint;
    b *= 1 + 0.06 * c.tint;
  }
  if (c.split) {
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lo = 1 - smooth(0, 0.5, L);
    const hi = smooth(0.5, 1, L);
    r += c.split.lo[0] * lo + c.split.hi[0] * hi;
    g += c.split.lo[1] * lo + c.split.hi[1] * hi;
    b += c.split.lo[2] * lo + c.split.hi[2] * hi;
  }
  if (c.lift || c.fall) {
    const span = 1 - c.lift - c.fall;
    r = c.lift + r * span;
    g = c.lift + g * span;
    b = c.lift + b * span;
  }
  OUT[0] = r < 0 ? 0 : r > 1 ? 1 : r;
  OUT[1] = g < 0 ? 0 : g > 1 ? 1 : g;
  OUT[2] = b < 0 ? 0 : b > 1 ? 1 : b;
}

/**
 * A picture's look changed in place (RGBA, 0 to 255): noise taken out first, then the filter at its strength, the
 * adjustments on top of it and what the look adds (levels and curves, hue and saturation by range, colour balance,
 * invert, posterize, threshold), then dehaze, clarity, blur or sharpness, the vignette and grain. Sizes (blur,
 * sharpness, vignette, grain) go by the picture's own size, so a small copy looks as the whole picture will; `frame`
 * says when the pixels are a part of a larger picture (its size and their place in it, in the same pixels).
 */
export function applyLook(px: Uint8ClampedArray, w: number, h: number, adjust: Adjust = {}, filter?: FilterPick | null, more?: LookMore | null, frame?: LookFrame): void {
  const F = frame ?? { W: w, H: h, x: 0, y: 0 };
  const long = Math.max(F.W, F.H);
  const own = compile(adjust);
  const fl = filter && FILTER_LOOKS[filter.id] ? FILTER_LOOKS[filter.id] : null;
  const fc = fl ? compile(fl) : null;
  const fs = fl ? clamp(filter!.strength ?? 100, 0, 100) / 100 : 0;
  const extra = compileMore(more);
  const n = w * h * 4;
  if (adjust.noise) reduceNoise(px, w, h, adjust.noise, long);
  if ((fc && fs) || own || extra) {
    const rgb = new Float32Array(3);
    for (let i = 0; i < n; i += 4) {
      let r = px[i] / 255;
      let g = px[i + 1] / 255;
      let b = px[i + 2] / 255;
      if (fc && fs) {
        shade(fc, r, g, b);
        r += (OUT[0] - r) * fs;
        g += (OUT[1] - g) * fs;
        b += (OUT[2] - b) * fs;
      }
      if (own) {
        shade(own, r, g, b);
        r = OUT[0];
        g = OUT[1];
        b = OUT[2];
      }
      if (extra) {
        rgb[0] = r;
        rgb[1] = g;
        rgb[2] = b;
        shadeMore(extra, rgb);
        r = rgb[0];
        g = rgb[1];
        b = rgb[2];
      }
      px[i] = r * 255 + 0.5;
      px[i + 1] = g * 255 + 0.5;
      px[i + 2] = b * 255 + 0.5;
    }
  }
  if (adjust.dehaze) dehazeOf(px, w, h, adjust.dehaze, long);
  if (adjust.clarity) clarityOf(px, w, h, adjust.clarity, long);
  const blur = clamp(adjust.blur ?? 0, 0, 100);
  if (blur > 0) boxBlur(px, w, h, Math.max(1, Math.round((blur / 100) * long * 0.012)), 3);
  const sharp = clamp(adjust.sharpness ?? 0, 0, 100);
  if (sharp > 0) sharpen(px, w, h, (sharp / 100) * 1.3, Math.max(1, Math.round(long / 1400)));
  const vig = clamp((adjust.vignette ?? 0) + (fl?.vignette ?? 0) * fs, -100, 100);
  if (vig) vignette(px, w, h, vig / 100, F);
  if (adjust.grain) grainOf(px, w, h, adjust.grain, F);
}

/** Blurs RGBA pixels in place: box blurs `passes` times over (three come near a Gaussian), `r` pixels each way. */
export function boxBlur(px: Uint8ClampedArray, w: number, h: number, r: number, passes = 3): void {
  if (r < 1 || w < 2 || h < 2) return;
  const tmp = new Uint8ClampedArray(px.length);
  for (let p = 0; p < passes; p++) {
    // Along the rows, then down the columns.
    blurLines(px, tmp, r, 4, w * 4, w, h);
    blurLines(tmp, px, r, w * 4, 4, h, w);
  }
}

/**
 * One box blur along `lines` lines of `count` pixels (rows or columns): pixels `step` bytes apart, lines `next` bytes
 * apart, from `src` into `dst`, each line's end pixels held as they are past its ends.
 */
function blurLines(src: Uint8ClampedArray, dst: Uint8ClampedArray, r: number, step: number, next: number, count: number, lines: number) {
  const rr = Math.min(r, count - 1);
  const div = 2 * rr + 1;
  const last = count - 1;
  for (let l = 0; l < lines; l++) {
    const base = l * next;
    for (let ch = 0; ch < 4; ch++) {
      const o = base + ch;
      let sum = 0;
      for (let i = -rr; i <= rr; i++) sum += src[o + (i < 0 ? 0 : i > last ? last : i) * step];
      for (let i = 0; i < count; i++) {
        dst[o + i * step] = sum / div + 0.5;
        const add = i + rr + 1;
        const sub = i - rr;
        sum += src[o + (add > last ? last : add) * step] - src[o + (sub < 0 ? 0 : sub) * step];
      }
    }
  }
}

/** Sharpens in place: each pixel pushed away from its neighbourhood's blur (an unsharp mask). */
function sharpen(px: Uint8ClampedArray, w: number, h: number, amount: number, r: number) {
  const soft = new Uint8ClampedArray(px);
  boxBlur(soft, w, h, r, 2);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = px[i] + (px[i] - soft[i]) * amount;
    px[i + 1] = px[i + 1] + (px[i + 1] - soft[i + 1]) * amount;
    px[i + 2] = px[i + 2] + (px[i + 2] - soft[i + 2]) * amount;
  }
}

/** Darkens the edges (`v` > 0) or lightens them (`v` < 0), most in the corners (of the whole picture, `f`). */
function vignette(px: Uint8ClampedArray, w: number, h: number, v: number, f: LookFrame) {
  const cx = f.W / 2;
  const cy = f.H / 2;
  for (let y = 0; y < h; y++) {
    const dy = (y + f.y + 0.5 - cy) / cy;
    for (let x = 0; x < w; x++) {
      const dx = (x + f.x + 0.5 - cx) / cx;
      const t = smooth(0.3, 1.15, Math.sqrt((dx * dx + dy * dy) / 2));
      if (!t) continue;
      const i = (y * w + x) * 4;
      if (v > 0) {
        const k = 1 - v * 0.82 * t;
        px[i] *= k;
        px[i + 1] *= k;
        px[i + 2] *= k;
      } else {
        const k = -v * 0.6 * t;
        px[i] += (255 - px[i]) * k;
        px[i + 1] += (255 - px[i + 1]) * k;
        px[i + 2] += (255 - px[i + 2]) * k;
      }
    }
  }
}

/** Hides an area in place: blurred or pixelated strongly enough that a face or a number in it cannot be read. */
export function hideArea(px: Uint8ClampedArray, w: number, h: number, box: Box, how: 'blur' | 'pixelate', strength = 60): void {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(w, Math.ceil(box.x + box.w));
  const y1 = Math.min(h, Math.ceil(box.y + box.h));
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw < 1 || bh < 1) return;
  const s = clamp(strength, 20, 100) / 100;
  const size = Math.max(bw, bh);
  if (how === 'pixelate') {
    const block = Math.max(3, Math.round(size * (0.03 + 0.11 * s)));
    for (let by = y0; by < y1; by += block) {
      for (let bx = x0; bx < x1; bx += block) {
        const ex = Math.min(x1, bx + block);
        const ey = Math.min(y1, by + block);
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        for (let y = by; y < ey; y++)
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            r += px[i];
            g += px[i + 1];
            b += px[i + 2];
            a += px[i + 3];
          }
        const k = (ex - bx) * (ey - by);
        for (let y = by; y < ey; y++)
          for (let x = bx; x < ex; x++) {
            const i = (y * w + x) * 4;
            px[i] = r / k;
            px[i + 1] = g / k;
            px[i + 2] = b / k;
            px[i + 3] = a / k;
          }
      }
    }
    return;
  }
  // Blurred as a picture of its own, so nothing from outside the area runs into it.
  const part = new Uint8ClampedArray(bw * bh * 4);
  for (let y = 0; y < bh; y++) part.set(px.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x1) * 4), y * bw * 4);
  boxBlur(part, bw, bh, Math.max(3, Math.round(size * (0.04 + 0.12 * s))), 4);
  for (let y = 0; y < bh; y++) px.set(part.subarray(y * bw * 4, (y + 1) * bw * 4), ((y0 + y) * w + x0) * 4);
}

// ---- videos ---------------------------------------------------------------------------------------------------------

// The video editor's recipe (its parts kept, speed, crop, turn, colour, fades, sound, music and words), in a file of its own.
export * from './mediaedit-video.ts';
