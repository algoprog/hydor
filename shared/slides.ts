// Slides: a deck of slides kept in Pages (a page of the kind "slides"), as the server, the editor and the player
// share it. A slide is 1280 pixels wide (720 high at 16:9, 960 at 4:3) and holds parts placed on it, as in
// PowerPoint or Google Slides: text boxes, shapes (which may hold text too), pictures (cropped, their colours
// adjusted), lines and arrows, tables, charts, icons, equations (LaTeX), videos, and groups of parts that move as
// one. Each slide has its background, its order of animations (a part comes in, is stressed or goes out: on a
// click, with the one before or after it), its transition from the slide before (Morph glides the parts two slides
// share into place), speaker notes, and the comments people and agents leave on it or its parts (with replies,
// resolved or not). The deck's theme names the colours and fonts parts refer to ("accent",
// "head"), so a new theme recolours it all; the deck may number its slides and give them a footer, and keeps the
// guides its slides are lined up on.
//
// normalizeDeck takes what an agent or the editor sends, lenient about shorthand (a slide made from a layout
// with its title and bullets, text as a string with "- " bullets and **bold**), and returns the full model,
// every value checked: the editor shows decks inside the app itself, so nothing in a deck may be markup, a
// script or a style rule; colours, fonts and addresses are each of a known form.

import { cleanComment, COMMENT_LIMITS, newCommentId, type Comment } from './comments.ts';
import { qrCode, type QrCode } from './qr.ts';

export type { Comment };

export const SLIDE_W = 1280;
export type Ratio = '16:9' | '4:3';
export const slideH = (r: Ratio | undefined) => (r === '4:3' ? 960 : 720);

export const SLIDE_LIMITS = { slides: 300, els: 150, anims: 120, paras: 200, run: 6000, notes: 20000, rows: 40, cols: 12, series: 12, labels: 80, nodes: 60, tex: 4000, depth: 4, guides: 40, html: 200_000, code: 20_000, choices: 8, question: 1000 };

/** A picture kept by the app (server/pages/assets.ts), by its content's hash: "naget-asset:<sha>". */
export const ASSET = 'naget-asset:';
/** A video kept by the app (server/pages/videos.ts), one from someone's device or an agent's session: "naget-video:<sha>". */
export const VIDEO = 'naget-video:';

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
  /**
   * What its copies share with it (a slide duplicated, a part pasted): the id of the part it was first copied from.
   * Morph glides a part into the one of the next slide with the same key (or id).
   */
  key?: string;
  /** The web format: how it answers the pointer in the slideshow (it rises, grows, glows or tilts towards it). */
  hover?: Hover;
}

export type Hover = 'lift' | 'grow' | 'glow' | 'tilt';
export const HOVERS: Hover[] = ['lift', 'grow', 'glow', 'tilt'];

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
  /** The web format: how the words shine (a gradient of the accent colours, a glow, an outline, neon, a long shadow). */
  textFx?: TextFx;
  /** The web format: frosted glass behind the box (what is under it shows through, blurred). */
  glass?: boolean;
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
  /** How much of the picture is cut off at each side, as a share of its width or height: what is left fills the box (fit no longer applies). */
  crop?: Crop;
  /** Its colours changed. */
  adjust?: Adjust;
  /** Its shape (PowerPoint's Crop to Shape, Canva's frames): the picture cut to a circle, a hexagon, a heart, a blob… (left out: its box, its corners `radius`). */
  mask?: PictureMask;
  /** A frame round it: the part is the whole frame (an instant photo's white card, a phone, a laptop, a browser window), the picture in its screen. */
  frame?: PictureFrame;
}

/** The shapes a picture may be cut to, beside its box (rectangle, or rounded by `radius`). */
export type PictureMask = 'circle' | 'ellipse' | 'arch' | 'blob' | 'flower' | 'hexagon' | 'star' | 'heart' | 'triangle' | 'diamond' | 'pentagon' | 'octagon';
export const PICTURE_MASKS: PictureMask[] = ['circle', 'ellipse', 'arch', 'blob', 'flower', 'hexagon', 'star', 'heart', 'triangle', 'diamond', 'pentagon', 'octagon'];

/** The frames a picture may show in: an instant photo's card, a phone, a laptop, a browser window (a screenshot in its device). */
export type PictureFrame = 'polaroid' | 'phone' | 'laptop' | 'browser';
export const PICTURE_FRAMES: PictureFrame[] = ['polaroid', 'phone', 'laptop', 'browser'];

/** The shares cut off a picture's left, top, right and bottom (0–0.95; left and right together at most 0.95). */
export interface Crop {
  l: number;
  t: number;
  r: number;
  b: number;
}

export interface Adjust {
  /** −100 to 100. */
  bright?: number;
  /** −100 to 100. */
  contrast?: number;
  /** 0 (grey) to 200; 100 is the picture's own. */
  sat?: number;
  gray?: boolean;
  /** Pixels. */
  blur?: number;
}

export type Cap = 'none' | 'arrow' | 'dot';

/** A side of a part, the middle of which a connector's end sticks to: top, right, bottom, left. */
export type Side = 't' | 'r' | 'b' | 'l';
export const SIDES: Side[] = ['t', 'r', 'b', 'l'];

/** Where a connector's end is stuck: a part of its slide (by its id, in a group too), at the middle of one of its sides. */
export interface Stick {
  el: string;
  at: Side;
}

export interface LineEl extends Base {
  type: 'line';
  color?: string;
  width: number;
  dash?: 'solid' | 'dash' | 'dot';
  start?: Cap;
  end?: Cap;
  /** A connector's ends stuck to parts of the slide: they follow them as they move, size and turn (x, y, w, h say where they are now). */
  from?: Stick;
  to?: Stick;
  /** Its path: elbowed (across and down at right angles, as PowerPoint's elbow connectors), else straight. */
  route?: 'elbow';
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
  /** Cells merged into one: from row r and column c, rs rows down and cs columns across. */
  merges?: Merge[];
  /** Cells' own fills, by "row,column" ("2,0"). */
  fills?: Record<string, string>;
}

export interface Merge {
  r: number;
  c: number;
  rs: number;
  cs: number;
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
  /** Where its numbers came from: a spreadsheet of the Library (its Format panel's Update reads them again). */
  source?: ChartSource;
}

/** A spreadsheet's cells a chart was made from: the spreadsheet (its page), a sheet of it by name, and the range. */
export interface ChartSource {
  page: string;
  sheet: string;
  /** "A1:D7"; the first column the labels, the first row the series' names (when they are words). */
  range: string;
  /** The series along the rows rather than down the columns. */
  by?: 'rows';
  /** The spreadsheet's name when it was read, to show. */
  title?: string;
  /** When its numbers were read (ms since 1970). */
  at?: number;
}

/** One of an icon's lines, as an SVG element on a 24×24 grid: its tag and attributes. */
export type IconNode = [tag: IconTag, attrs: Record<string, string | number>];
export type IconTag = 'path' | 'circle' | 'ellipse' | 'rect' | 'line' | 'polyline' | 'polygon';

/** An icon of Lucide's library (its name, and its lines, so it draws anywhere), in a colour and a line width. */
export interface IconEl extends Base {
  type: 'icon';
  icon: string;
  paths: IconNode[];
  color?: string;
  /** The width of its lines on its 24-unit grid (Lucide's own is 2). */
  lineW?: number;
}

/** An equation in LaTeX, drawn with KaTeX as large as its box allows. */
export interface MathEl extends Base {
  type: 'math';
  tex: string;
  color?: string;
  align?: 'left' | 'center' | 'right';
}

/** A video: from YouTube or Vimeo (its player's address), or one the app keeps (naget-video:<sha>); its still shows until it plays. */
export interface VideoEl extends Base {
  type: 'video';
  src: string;
  /** A picture's source (a kept video's first frame, an online one's still from its site); YouTube's own still when not given. */
  poster?: string;
  /** Seconds into the video it starts at. */
  start?: number;
  /** Seconds into the video it stops at (PowerPoint's Trim Video); left out: its end. */
  end?: number;
  /** Plays by itself when its slide shows in the slideshow. */
  autoplay?: boolean;
  muted?: boolean;
  loop?: boolean;
  radius?: number;
}

/**
 * A QR code (Canva's QR code app): a link or any words, its dark squares in a colour on another (black on white unless
 * said; "transparent" for none), read by a phone's camera. Drawn square in the middle of its box, a quiet margin round
 * it; its squares are made from its words (shared/qr.ts) whenever a deck is checked, and kept with it so it draws anywhere.
 */
export interface QrEl extends Base {
  type: 'qr';
  text: string;
  color?: string;
  bg?: string;
  /** Its squares on a side, and the dark ones row by row as bits (the first in a byte's highest), in base64. */
  n: number;
  cells: string;
}

/** Parts that are picked, moved, sized, turned, copied and animated as one: placed from the group's top-left corner. */
export interface GroupEl extends Base {
  type: 'group';
  els: El[];
}

export type TextFx = 'gradient' | 'glow' | 'outline' | 'neon' | 'shadow';
export const TEXT_FX: TextFx[] = ['gradient', 'glow', 'outline', 'neon', 'shadow'];

/** Code shown with its colours, as in an editor (PowerPoint keeps it as coloured words in a monospaced font). */
export interface CodeEl extends Base {
  type: 'code';
  code: string;
  /** Its language, for its colours: python, javascript, typescript, bash, json, html, css, sql, rust, go, java, c, cpp, … */
  lang?: string;
  size: number;
  /** Dark, light, or the deck's own colours. */
  look?: 'dark' | 'light' | 'deck';
  lineNumbers?: boolean;
  /** Lines lit up, the rest dimmed: "2-4,7". */
  highlight?: string;
  radius?: number;
}

// ---- parts of the web format (Deck.format "web"): none of them goes to PowerPoint as it is ----------------------

/**
 * A small web page of its own on the slide: HTML with its CSS and JavaScript, run in a sandboxed frame the size of
 * the part, with no reach into the app, the deck's page or the viewer's data. It may load libraries from jsDelivr,
 * unpkg or cdnjs, and gets the deck's colours and fonts as CSS variables (--n-bg, --n-fg, --n-head, --n-muted,
 * --n-accent, --n-accent-fg, --n-soft, --n-c1 to --n-c6, --n-font, --n-head-font) and `window.deck`: the slide it is
 * on, when the slideshow comes to it or leaves it, and next(), prev(), go(n).
 */
export interface HtmlEl extends Base {
  type: 'html';
  html: string;
  /** A picture shown where it cannot run (PowerPoint, print, the deck's picture in the Library) and until it has started. */
  poster?: string;
  /** It takes the pointer and the keys in the slideshow (else a click on it goes on, as on the rest of the slide). */
  interactive?: boolean;
}

/** A web page at an address, in a frame: a site, a map, a form, a CodePen (only sites that let others frame them show). */
export interface EmbedEl extends Base {
  type: 'embed';
  url: string;
  poster?: string;
  interactive?: boolean;
  radius?: number;
}

export interface QuizChoice {
  text: string;
  correct?: boolean;
  /** Said when this one is picked. */
  why?: string;
}

/**
 * A question with choices, answered in the slideshow: right or wrong shows at once (after Check when several are
 * right), with the explanation, and the deck keeps the score (a score part shows it). A quiz with no right choice is a
 * poll: the choice picked shows, nothing is scored.
 */
export interface QuizEl extends Base {
  type: 'quiz';
  question: string;
  choices: QuizChoice[];
  /** Several choices are right: they are picked, then checked. */
  multi?: boolean;
  /** Said once it is answered, whatever was picked. */
  explain?: string;
  /** The question's font size; the choices a little smaller. */
  size: number;
  color?: string;
  font?: string;
  /** The choices' fill (the theme's soft colour when left out). */
  fill?: string;
  /** The choices in a column, or in a grid of two. */
  layout?: 'list' | 'grid';
}

/** The deck's quiz score so far, in words of its own. */
export interface ScoreEl extends Base {
  type: 'score';
  /** Its words, {right}, {total} and {percent} filled in: "You got {right} of {total}". */
  text?: string;
  size: number;
  color?: string;
  font?: string;
  align?: Align;
  bold?: boolean;
}

export type Shape3d = 'cube' | 'sphere' | 'torus' | 'knot' | 'cone' | 'cylinder' | 'icosahedron' | 'text';
export const SHAPES_3D: Shape3d[] = ['cube', 'sphere', 'torus', 'knot', 'cone', 'cylinder', 'icosahedron', 'text'];
export type Material3d = 'matte' | 'glossy' | 'metal' | 'glass' | 'wire' | 'toon';
export const MATERIALS_3D: Material3d[] = ['matte', 'glossy', 'metal', 'glass', 'wire', 'toon'];
export type Light3d = 'studio' | 'soft' | 'dramatic' | 'neon';
export const LIGHTS_3D: Light3d[] = ['studio', 'soft', 'dramatic', 'neon'];

/**
 * 3D: a model (a glTF/GLB file the app keeps, "naget-asset:<sha>", or one at an https address) or a shape of its own,
 * lit, turning by itself if wanted; viewers can turn and zoom it with the pointer in the slideshow.
 */
export interface Scene3dEl extends Base {
  type: 'scene3d';
  model?: string;
  /** The shape drawn when there is no model. */
  shape?: Shape3d;
  /** The words of a 3D text shape. */
  text?: string;
  color?: string;
  material?: Material3d;
  light?: Light3d;
  /** Turns by itself, degrees a second (0 or none: still). */
  spin?: number;
  /** Viewers can turn and zoom it with the pointer in the slideshow. */
  orbit?: boolean;
  /** Where it is seen from: degrees around it (turn) and from above (tilt). */
  turn?: number;
  tilt?: number;
  /** How near: 1 fits it to the box. */
  zoom?: number;
  /** A colour behind it; see-through when left out. */
  bg?: string;
  poster?: string;
}

export type El = TextEl | ShapeEl | ImageEl | LineEl | TableEl | ChartEl | IconEl | MathEl | VideoEl | CodeEl | HtmlEl | EmbedEl | QuizEl | ScoreEl | Scene3dEl | QrEl | GroupEl;
export type ElType = El['type'];

export type AnimFx =
  | 'appear'
  | 'fade'
  | 'fly'
  | 'float'
  | 'zoom'
  | 'wipe'
  | 'bounce'
  | 'pulse'
  | 'spin'
  | 'grow'
  | 'shake'
  // The web format's own (RICH_ANIM_FX).
  | 'blur'
  | 'rise'
  | 'drop'
  | 'flip'
  | 'swing'
  | 'roll'
  | 'pop'
  | 'typewriter'
  | 'draw'
  | 'count'
  | 'glow'
  | 'wiggle'
  | 'heartbeat'
  | 'jello'
  | 'flash'
  | 'bob'
  | 'confetti';
/** Which effects each kind of animation offers. */
export const ANIM_FX: Record<Anim['type'], AnimFx[]> = {
  in: ['appear', 'fade', 'fly', 'float', 'zoom', 'wipe', 'bounce'],
  em: ['pulse', 'spin', 'grow', 'shake'],
  out: ['appear', 'fade', 'fly', 'float', 'zoom', 'wipe'],
};
/** The effects that go one way or another. */
export const ANIM_DIR: AnimFx[] = ['fly', 'float', 'wipe'];
/**
 * The web format's effects, beside PowerPoint's (ANIM_FX): text typed out, lines and shapes drawn, numbers counting
 * up to theirs, confetti from a part… (PowerPoint gets the nearest of its own: toPowerPoint).
 */
export const RICH_ANIM_FX: Record<Anim['type'], AnimFx[]> = {
  in: ['blur', 'rise', 'drop', 'flip', 'swing', 'roll', 'pop', 'typewriter', 'draw', 'count'],
  em: ['glow', 'wiggle', 'heartbeat', 'jello', 'flash', 'bob', 'confetti'],
  out: ['blur', 'drop', 'flip', 'roll', 'pop'],
};
export type Ease = 'smooth' | 'spring' | 'bounce' | 'linear' | 'snap';
export const EASES: Ease[] = ['smooth', 'spring', 'bounce', 'linear', 'snap'];

export interface Anim {
  id: string;
  /** The part it moves. */
  el: string;
  /** Comes in, is stressed (emphasis), goes out. */
  type: 'in' | 'em' | 'out';
  fx: AnimFx;
  /** Where it comes from (or goes to). */
  dir?: Dir;
  /**
   * On a click, with the one before, or after it; the web format's "tap": whenever the part `trigger` is clicked in
   * the slideshow (a button that shows an answer), outside the slide's build.
   */
  on: 'click' | 'with' | 'after' | 'tap';
  /** The part a click on which runs it (on: "tap"). */
  trigger?: string;
  /** The web format: it goes on again and again (an emphasis that keeps going). */
  loop?: boolean;
  /** The web format: words come one by one, or letters. */
  by?: 'word' | 'letter';
  /** The web format: how it speeds up and slows down. */
  ease?: Ease;
  /** Milliseconds. */
  dur: number;
  delay: number;
  /** Text: one paragraph at a time, each on a click. */
  byPara?: boolean;
}

/** Morph: the parts this slide shares with the one before glide from where they were; the rest fade. */
export type TransitionFx = 'none' | 'fade' | 'push' | 'wipe' | 'cover' | 'zoom' | 'split' | 'morph' | 'cube' | 'flip' | 'dissolve' | 'circle' | 'blinds' | 'glitch';
/** PowerPoint's transitions (and the editor's in either format). */
export const TRANSITIONS: TransitionFx[] = ['none', 'fade', 'push', 'wipe', 'cover', 'zoom', 'split', 'morph'];
/** The web format's own transitions: the slides turn as a cube's sides, flip over, dissolve, open in a circle, through blinds, or glitch. */
export const RICH_TRANSITIONS: TransitionFx[] = ['cube', 'flip', 'dissolve', 'circle', 'blinds', 'glitch'];

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
  /** The web format: a background that moves, in the theme's colours (northern lights, drifting particles, stars, waves, a slow gradient mesh, a grid, soft lights). */
  fx?: BgFx;
  /** The web format: a video the app keeps ("naget-video:<sha>"), playing muted, over and over, behind the slide. */
  video?: string;
}

export type BgFx = 'aurora' | 'particles' | 'stars' | 'waves' | 'mesh' | 'grid' | 'bokeh';
export const BG_FX: BgFx[] = ['aurora', 'particles', 'stars', 'waves', 'mesh', 'grid', 'bokeh'];

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
  /** The deck's footer and slide number left off this slide. */
  nofooter?: boolean;
  /** Comments on the slide or on parts of it (shown only in the editor, never in the slideshow). */
  comments?: SlideComment[];
  /** A theme of its own, in place of the deck's (a slide taken from another deck keeping its look, as PowerPoint keeps its master). */
  theme?: Theme;
}

/** A comment on a slide: on one of its parts (`el`), or on the slide itself, its mark at `x`, `y` (the slide's pixels). */
export interface SlideComment extends Comment {
  el?: string;
  x?: number;
  y?: number;
}

/** What the foot of every slide shows. */
export interface Footer {
  /** The slide's number. */
  num?: boolean;
  /** Words, in the middle. */
  text?: string;
  /** "today": the day it is shown, as the viewer's language writes it; else a date as written. */
  date?: string;
  /** Not on the title slide: the first, and any made from the Title layout. */
  skipTitle?: boolean;
}

/** Lines across (y) and down (x) the slides that parts snap to, as the rulers place them. */
export interface Guides {
  x?: number[];
  y?: number[];
}

/**
 * What a deck is made for. "web", the default (a deck without one is one): everything here, shown in the app, in
 * the slideshow and as the deck's own web page in any browser, with the web format's parts (custom code, embedded
 * pages, quizzes and scores, 3D), effects, transitions, moving backgrounds, text that shines and parts that answer
 * the pointer; its PowerPoint file has them as pictures or their nearest PowerPoint effects. "pptx": only what
 * PowerPoint has, so its file keeps everything (decks opened from a .pptx are so).
 */
export type DeckFormat = 'web' | 'pptx';

/** The part types only the web format has. */
export const RICH_TYPES: ElType[] = ['html', 'embed', 'quiz', 'score', 'scene3d'];

export interface Deck {
  v: 1;
  /** Left out: "web". */
  format?: DeckFormat;
  /** The web format: a thin bar across the top of the slideshow shows how far it has come. */
  progress?: boolean;
  ratio: Ratio;
  theme: Theme;
  slides: Slide[];
  footer?: Footer;
  guides?: Guides;
  /** A picture on every slide (a brand's logo), in a corner. */
  logo?: Logo;
}

/** A logo on every slide: its picture, its corner, its size in slide pixels (w×h, its own shape), not on the title slide if asked. */
export interface Logo {
  src: string;
  /** Top left, top right, bottom left, bottom right. */
  at: 'tl' | 'tr' | 'bl' | 'br';
  w: number;
  h: number;
  /** How far from the slide's edges, in pixels (32 when left out). */
  margin?: number;
  /** Not on the title slide (the first, and any made from the Title layout). */
  skipTitle?: boolean;
}
export const LOGO_CORNERS: Logo['at'][] = ['tl', 'tr', 'bl', 'br'];

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

/** Every part of a slide, those in groups too (a group before its parts). */
export function everyEl(els: El[], out: El[] = []): El[] {
  for (const e of els) {
    out.push(e);
    if (e.type === 'group') everyEl(e.els, out);
  }
  return out;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
const rad = (deg: number | undefined) => ((deg ?? 0) * Math.PI) / 180;

/** The box around a part as it shows: around its turned corners (a line's from its two ends). */
export function turnedBox(e: El): { x: number; y: number; w: number; h: number } {
  if (e.type === 'line') return { x: Math.min(e.x, e.x + e.w), y: Math.min(e.y, e.y + e.h), w: Math.abs(e.w), h: Math.abs(e.h) };
  const a = rad(e.rot);
  if (!a) return { x: e.x, y: e.y, w: e.w, h: e.h };
  const c = Math.abs(Math.cos(a));
  const sn = Math.abs(Math.sin(a));
  const w = e.w * c + e.h * sn;
  const h = e.w * sn + e.h * c;
  return { x: e.x + e.w / 2 - w / 2, y: e.y + e.h / 2 - h / 2, w, h };
}

/** A part moved by dx, dy (a group's parts stay where they are in it). */
export const shiftEl = <T extends El>(e: T, dx: number, dy: number): T => ({ ...e, x: r2(e.x + dx), y: r2(e.y + dy) });

/**
 * A group fitted around its parts: they start at its top-left corner and it is as large as they need, placed so
 * that nothing moves on the slide (a turned group's centre moves by its turn of what its parts' box moved).
 */
export function fitGroup(g: GroupEl): GroupEl {
  if (!g.els.length) return g;
  const boxes = g.els.map(turnedBox);
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const w = Math.max(1, Math.max(...boxes.map((b) => b.x + b.w)) - minX);
  const h = Math.max(1, Math.max(...boxes.map((b) => b.y + b.h)) - minY);
  if (Math.abs(minX) < 0.005 && Math.abs(minY) < 0.005 && Math.abs(w - g.w) < 0.005 && Math.abs(h - g.h) < 0.005) return g;
  const a = rad(g.rot);
  const dx = minX + w / 2 - g.w / 2;
  const dy = minY + h / 2 - g.h / 2;
  const cx = g.x + g.w / 2 + dx * Math.cos(a) - dy * Math.sin(a);
  const cy = g.y + g.h / 2 + dx * Math.sin(a) + dy * Math.cos(a);
  return { ...g, x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h), els: g.els.map((e) => shiftEl(e, -minX, -minY)) };
}

/** Parts made into a group (in their order), its box around them. */
export function groupOf(els: El[], id: string): GroupEl {
  return fitGroup({ id, type: 'group', x: 0, y: 0, w: 0, h: 0, els });
}

/** A group's parts back on the slide (or in the group around it) where they show, turned with it, as see-through as it made them. */
export function ungroupEls(g: GroupEl): El[] {
  const a = rad(g.rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const gx = g.x + g.w / 2;
  const gy = g.y + g.h / 2;
  const op = (o: number | undefined) => {
    const v = (o ?? 1) * (g.opacity ?? 1);
    return v < 1 ? r2(v) : undefined;
  };
  return g.els.map((e) => {
    const lx = e.x + e.w / 2 - g.w / 2;
    const ly = e.y + e.h / 2 - g.h / 2;
    const cx = gx + lx * cos - ly * sin;
    const cy = gy + lx * sin + ly * cos;
    if (e.type === 'line') {
      const w = e.w * cos - e.h * sin;
      const h = e.w * sin + e.h * cos;
      return { ...e, x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h), opacity: op(e.opacity) };
    }
    const rot = ((((e.rot ?? 0) + (g.rot ?? 0)) % 360) + 360) % 360;
    return { ...e, x: r2(cx - e.w / 2), y: r2(cy - e.h / 2), rot: rot ? r2(rot) : undefined, opacity: op(e.opacity) } as El;
  });
}

/** A group's parts sized with it: by kx across and ky down (their words keep their size). */
export function scaleEls(els: El[], kx: number, ky: number): El[] {
  return els.map((e) => {
    const s = { ...e, x: r2(e.x * kx), y: r2(e.y * ky), w: r2(e.w * kx), h: r2(e.h * ky) } as El;
    return s.type === 'group' ? { ...s, els: scaleEls(s.els, kx, ky) } : s;
  });
}

// ---- connectors -------------------------------------------------------------------------------------------------

/** A part as it shows on the slide: one in a group placed where it shows, turned with its groups; null when it is not there. */
export function partOnSlide(els: El[], id: string): El | null {
  for (const e of els) {
    if (e.id === id) return e;
    if (e.type === 'group') {
      const inner = partOnSlide(e.els, id);
      if (inner) return ungroupEls({ ...e, els: [inner] })[0];
    }
  }
  return null;
}

/** The middle of a side of a part (its box, turned as it is): where a connector's end sticks to it. */
export function sidePoint(e: El, at: Side): { x: number; y: number } {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const dx = at === 'r' ? e.w / 2 : at === 'l' ? -e.w / 2 : 0;
  const dy = at === 'b' ? e.h / 2 : at === 't' ? -e.h / 2 : 0;
  const a = rad(e.rot);
  return { x: r2(cx + dx * Math.cos(a) - dy * Math.sin(a)), y: r2(cy + dx * Math.sin(a) + dy * Math.cos(a)) };
}

/** The sides of two parts (or of a part and a point) that face each other: across when they are more apart across, else up and down. */
export function facingSides(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): [Side, Side] {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['r', 'l'] : ['l', 'r'];
  return dy >= 0 ? ['b', 't'] : ['t', 'b'];
}

const across = (at: Side | undefined) => at === 'l' || at === 'r';

/**
 * An elbow connector's path from (x1, y1) to (x2, y2): it leaves across or up and down as the side it starts from does
 * (across when free), and comes in as the side it ends on does; across both ways it turns halfway across, up and down
 * both ways halfway down, else once. PowerPoint's own elbow connectors take the same paths.
 */
export function elbowPoints(x1: number, y1: number, x2: number, y2: number, from?: Side, to?: Side): number[][] {
  const h1 = from ? across(from) : to ? across(to) : true;
  const h2 = to ? across(to) : h1;
  if (h1 && h2) return [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]];
  if (!h1 && !h2) return [[x1, y1], [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2], [x2, y2]];
  return h1 ? [[x1, y1], [x2, y1], [x2, y2]] : [[x1, y1], [x1, y2], [x2, y2]];
}

/**
 * A slide's connectors with their ends where the parts they are stuck to are now (a part turned, sized or moved takes them
 * along); those in groups move with their group. The same slide when nothing moved.
 */
export function reconnect(s: Slide): Slide {
  let changed = false;
  const els = s.els.map((e) => {
    if (e.type !== 'line' || (!e.from && !e.to)) return e;
    const a = e.from ? partOnSlide(s.els, e.from.el) : null;
    const b = e.to ? partOnSlide(s.els, e.to.el) : null;
    const p1 = a && e.from ? sidePoint(a, e.from.at) : { x: e.x, y: e.y };
    const p2 = b && e.to ? sidePoint(b, e.to.at) : { x: e.x + e.w, y: e.y + e.h };
    const next = { x: r2(p1.x), y: r2(p1.y), w: r2(p2.x - p1.x), h: r2(p2.y - p1.y) };
    if (next.x === e.x && next.y === e.y && next.w === e.w && next.h === e.h) return e;
    changed = true;
    return { ...e, ...next };
  });
  return changed ? { ...s, els } : s;
}

/** A slide's connectors checked: each end on a part of the slide (not a line, nor itself), on a side (the one facing the other end when not said). */
function checkConnectors(els: El[]): El[] {
  const fix = (list: El[]): El[] =>
    list.map((e) => {
      if (e.type === 'group') return { ...e, els: fix(e.els) };
      if (e.type !== 'line' || (!e.from && !e.to)) return e;
      const part = (st?: Stick) => (st && st.el !== e.id ? partOnSlide(els, st.el) : null);
      const a = part(e.from);
      const b = part(e.to);
      const ok = (p: El | null) => !!p && p.type !== 'line';
      const out: LineEl = { ...e };
      delete out.from;
      delete out.to;
      // The free end, as a point, for the side that faces it.
      const free = (x: number, y: number) => ({ x, y, w: 0, h: 0 });
      if (ok(a) && e.from) out.from = { el: a!.id, at: e.from.at ?? facingSides(a!, ok(b) ? b! : free(e.x + e.w, e.y + e.h))[0] };
      if (ok(b) && e.to) out.to = { el: b!.id, at: e.to.at ?? facingSides(ok(a) ? a! : free(e.x, e.y), b!)[1] };
      return out;
    });
  return fix(els);
}

/** What a slide is called: its title's words, else its first words. */
export function slideTitle(s: Slide): string {
  const texts = everyEl(s.els).filter((e): e is TextEl | ShapeEl => (e.type === 'text' || e.type === 'shape') && plainText(e.paras).trim().length > 1);
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

/** The slides a link may go to besides one by its number: the next, the one before, the first and the last. */
export const SLIDE_JUMPS = ['#next', '#prev', '#first', '#last'] as const;

/** An address a part may open: the web, mail, a phone number, or a slide of the deck (#3, #next, #prev, #first, #last). */
export function cleanLink(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  if (/^#\d{1,3}$/.test(s)) return s;
  const jump = s.toLowerCase() === '#previous' ? '#prev' : s.toLowerCase();
  if ((SLIDE_JUMPS as readonly string[]).includes(jump)) return jump;
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

/** A YouTube or Vimeo address (a watch page, a short link, a player's) as its player's address, or null. */
export function videoSrc(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(v.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let id = '';
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = u.searchParams.get('v') ?? /^\/(?:embed|shorts|live|v)\/([\w-]{6,20})/.exec(u.pathname)?.[1] ?? '';
  if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
  const vm = host === 'vimeo.com' ? /^\/(?:video\/)?(\d{4,12})/.exec(u.pathname)?.[1] : host === 'player.vimeo.com' ? /^\/video\/(\d{4,12})/.exec(u.pathname)?.[1] : undefined;
  return vm ? `https://player.vimeo.com/video/${vm}` : null;
}

/** A video the app keeps, as a deck names it (naget-video:<sha>), or null. */
export const keptVideo = (v: unknown): string | null => (typeof v === 'string' && /^naget-video:[a-f0-9]{16,64}$/.test(v.trim()) ? v.trim() : null);

/** A 3D model's source: one the app keeps (naget-asset:<sha>, glTF), one inside the deck (data:), or a .glb or .gltf on the web. */
export function cleanModel(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^naget-asset:[a-f0-9]{16,64}$/.test(s)) return s;
  if (/^data:model\/gltf(-binary|\+json);base64,[A-Za-z0-9+/=]+$/.test(s)) return s;
  if (/^https:\/\/[^\s<>"'()\\]+\.(glb|gltf)(\?[^\s<>"'()\\]*)?$/i.test(s) && s.length <= 2000) return s;
  return null;
}

/** Whether a host is this computer or one of its network's (by its name, or an address of a private range). */
function privateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!h.includes('.') || h.includes(':')) return true;
  if (h === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(h)) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/**
 * The address of a web page to show in a frame on a slide: https, on the public web (not this computer or its
 * network), without a name and password in it; a YouTube or Vimeo address as its player's. Null for any other.
 */
export function cleanEmbedUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length > 2000 || !/^https:\/\/[^\s<>"'\\]+$/i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || privateHost(u.hostname)) return null;
  return videoSrc(s) ?? u.href;
}

/** Where a video address says to start, in seconds ("t=90", "t=1m30s", "start=90"), or 0. */
export function videoStart(v: unknown): number {
  if (typeof v !== 'string') return 0;
  const m = /[?&#](?:t|start)=([\dhms]+)/.exec(v);
  if (!m) return 0;
  const p = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(m[1]);
  return p ? Math.min(86400, Number(p[1] ?? 0) * 3600 + Number(p[2] ?? 0) * 60 + Number(p[3] ?? 0)) : 0;
}

/** A YouTube video's still picture, or null for another. */
export function videoStill(src: string): string | null {
  const id = /^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]{6,20})$/.exec(src)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
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
  /** An icon given by its name alone (an agent's): its lines from the library, or null when it has none of that name. */
  icon?: (name: string) => IconNode[] | null;
  /** A video's source that is neither online nor kept yet (a file of an agent's session): what it becomes, or null to leave the video out. */
  video?: SrcHook;
  /** A 3D model's source that is not of a kept form yet (a .glb file of an agent's session): what it becomes. */
  model?: SrcHook;
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
  const fx = opt(e.textFx, TEXT_FX);
  if (fx) into.textFx = fx;
  if (e.glass === true) into.glass = true;
}

function base(e: Obj, used: Set<string>, H: number, line = false, def: { w: number; h: number } = { w: 400, h: Math.min(200, H) }): Base {
  const b: Base = {
    id: cleanId(e.id, used),
    x: num(e.x, -4000, 6000, 80),
    y: num(e.y, -4000, 6000, 80),
    w: line ? num(e.w, -6000, 6000, 200) : num(e.w, 1, 8000, def.w),
    h: line ? num(e.h, -6000, 6000, 0) : num(e.h, 1, 8000, def.h),
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
  if (typeof e.key === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(e.key) && e.key !== b.id) b.key = e.key;
  const hover = opt(e.hover, HOVERS);
  if (hover) b.hover = hover;
  return b;
}

const ICON_ATTRS: Record<IconTag, string[]> = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};
/** The attributes each of an icon's elements must have to draw. */
const ICON_NEEDS: Record<IconTag, string[]> = { path: ['d'], circle: ['r'], ellipse: ['rx', 'ry'], rect: ['width', 'height'], line: [], polyline: ['points'], polygon: ['points'] };

/** An icon's lines, checked: known SVG elements, each with its own attributes only, numbers and path data alone. */
export function iconNodes(v: unknown): IconNode[] {
  if (!Array.isArray(v)) return [];
  const out: IconNode[] = [];
  for (const n of v.slice(0, SLIDE_LIMITS.nodes)) {
    const tag = (Array.isArray(n) ? n[0] : isObj(n) ? n.tag : undefined) as IconTag;
    const attrs = Array.isArray(n) ? n[1] : n;
    if (typeof tag !== 'string' || !(tag in ICON_ATTRS) || !isObj(attrs)) continue;
    const a: Record<string, string | number> = {};
    for (const k of ICON_ATTRS[tag]) {
      const x = attrs[k];
      if (k === 'd') {
        if (typeof x === 'string' && x.length <= 4000 && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/.test(x)) a.d = x.replace(/\s+/g, ' ').trim();
      } else if (k === 'points') {
        if (typeof x === 'string' && x.length <= 2000 && /^[0-9eE.,\s+-]+$/.test(x)) a.points = x.replace(/\s+/g, ' ').trim();
      } else {
        const v2 = typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN;
        if (Number.isFinite(v2) && Math.abs(v2) <= 1000) a[k] = Math.round(v2 * 1000) / 1000;
      }
    }
    if (ICON_NEEDS[tag].every((k) => a[k] !== undefined && a[k] !== '')) out.push([tag, a]);
  }
  return out;
}

/** A picture's crop: each side's share, in bounds; none when nothing is cut. */
export function cleanCrop(v: unknown): Crop | undefined {
  if (!isObj(v)) return undefined;
  const c = { l: num(v.l ?? v.left, 0, 0.95, 0), t: num(v.t ?? v.top, 0, 0.95, 0), r: num(v.r ?? v.right, 0, 0.95, 0), b: num(v.b ?? v.bottom, 0, 0.95, 0) };
  const fit = (a: number, b: number) => (a + b > 0.95 ? 0.95 / (a + b) : 1);
  const kx = fit(c.l, c.r);
  const ky = fit(c.t, c.b);
  const out = { l: r3(c.l * kx), t: r3(c.t * ky), r: r3(c.r * kx), b: r3(c.b * ky) };
  return out.l || out.t || out.r || out.b ? out : undefined;
}
const r3 = (v: number) => Math.round(v * 10000) / 10000;

/** A picture's colour changes, in bounds; none when it is as it was. */
export function cleanAdjust(v: unknown): Adjust | undefined {
  if (!isObj(v)) return undefined;
  const a: Adjust = {};
  const bright = num(v.bright ?? v.brightness, -100, 100, 0);
  if (bright) a.bright = Math.round(bright);
  const contrast = num(v.contrast, -100, 100, 0);
  if (contrast) a.contrast = Math.round(contrast);
  const sat = num(v.sat ?? v.saturation, 0, 200, 100);
  if (sat !== 100) a.sat = Math.round(sat);
  if (v.gray === true || v.grey === true || v.grayscale === true) a.gray = true;
  const blur = num(v.blur, 0, 40, 0);
  if (blur) a.blur = blur;
  return Object.keys(a).length ? a : undefined;
}

/** The other names agents give a picture's frames. */
const FRAME_ALIASES: Record<string, PictureFrame> = { instant: 'polaroid', photo: 'polaroid', mobile: 'phone', iphone: 'phone', smartphone: 'phone', macbook: 'laptop', computer: 'laptop', notebook: 'laptop', window: 'browser', screenshot: 'browser', web: 'browser' };

/** A range of cells as a chart's source takes it: "A1:D7", "B2", parts split by commas ("A1:A7,C1:C7"), `$` signs dropped. */
const RANGE = /^[A-Z]{1,3}[0-9]{1,7}(:[A-Z]{1,3}[0-9]{1,7})?(,[A-Z]{1,3}[0-9]{1,7}(:[A-Z]{1,3}[0-9]{1,7})?){0,7}$/;

/** A chart's source, checked: a page's id, a sheet's name and a range of its cells; undefined for anything else. */
export function chartSource(v: unknown): ChartSource | undefined {
  if (!isObj(v)) return undefined;
  const page = typeof v.page === 'string' ? v.page.trim() : '';
  const range = typeof v.range === 'string' ? v.range.replace(/[\s$]/g, '').toUpperCase() : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(page) || !RANGE.test(range)) return undefined;
  const s: ChartSource = { page, sheet: str(v.sheet, 100).trim(), range };
  if (v.by === 'rows') s.by = 'rows';
  const title = str(v.title, 200).trim();
  if (title) s.title = title;
  if (typeof v.at === 'number' && Number.isFinite(v.at) && v.at > 0) s.at = Math.round(v.at);
  return s;
}

/** A deck's logo, checked: a picture's source (as `src` makes of one not kept yet), a corner, a size; undefined without a picture. */
function logo(v: unknown, o: NormalizeOpts): Logo | undefined {
  if (typeof v === 'string') v = { src: v };
  if (!isObj(v)) return undefined;
  const raw = typeof v.src === 'string' ? v.src.trim() : '';
  const src = cleanSrc(raw) ?? (raw && o.src ? o.src(raw) : null);
  if (!src) return undefined;
  const at = opt(LOGO_ALIASES[String(v.at ?? v.corner ?? '').trim().toLowerCase()] ?? v.at ?? v.corner, LOGO_CORNERS) ?? 'tr';
  // Its width, and its height from its shape when only one is given.
  const w = num(v.w ?? v.width, 16, 640, 0);
  const h = num(v.h ?? v.height, 16, 640, 0);
  const g: Logo = { src, at, w: w || (h ? h * 2 : 120), h: h || (w ? w / 2 : 60) };
  if (v.margin !== undefined) g.margin = num(v.margin, 0, 200, 32);
  if (v.skipTitle === true) g.skipTitle = true;
  return g;
}
const LOGO_ALIASES: Record<string, Logo['at']> = { 'top-left': 'tl', 'top left': 'tl', 'top-right': 'tr', 'top right': 'tr', 'bottom-left': 'bl', 'bottom left': 'bl', 'bottom-right': 'br', 'bottom right': 'br' };

/** A QR code's words and squares, as a qr part keeps them; null for no words, or too many for a code. */
export function qrPart(text: string): { text: string; n: number; cells: string } | null {
  if (!text) return null;
  let code: QrCode;
  try {
    code = qrCode(text, { level: 'M' });
  } catch {
    return null;
  }
  const n = code.size;
  const bytes = new Uint8Array(Math.ceil((n * n) / 8));
  code.modules.forEach((row, y) => row.forEach((dark, x) => dark && (bytes[(y * n + x) >> 3] |= 0x80 >> ((y * n + x) & 7))));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return { text, n, cells: btoa(bin) };
}

/** A qr part's squares, row by row (true: dark). */
export function qrCells(e: Pick<QrEl, 'n' | 'cells'>): boolean[][] {
  const n = Math.max(0, Math.min(177, Math.round(e.n)));
  let bin = '';
  try {
    bin = atob(e.cells);
  } catch {}
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => ((bin.charCodeAt((y * n + x) >> 3) || 0) & (0x80 >> ((y * n + x) & 7))) !== 0));
}

/** What a part may hold at most: parts in all, groups within groups. */
interface Budget {
  n: number;
}

/** The other names agents give the parts (a "textbox", a "picture", "custom" code, a "poll", "3d"). */
const TYPE_ALIASES: Record<string, ElType> = {
  textbox: 'text',
  picture: 'image',
  arrow: 'line',
  connector: 'line',
  elbow: 'line',
  equation: 'math',
  custom: 'html',
  'custom-code': 'html',
  webpage: 'embed',
  iframe: 'embed',
  poll: 'quiz',
  question: 'quiz',
  '3d': 'scene3d',
  model: 'scene3d',
  qrcode: 'qr',
  'qr-code': 'qr',
  qr_code: 'qr',
};

/** A language's name for its colours, from what agents write ("py", "JS", "c++"). */
const LANG_ALIASES: Record<string, string> = { js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript', ts: 'typescript', tsx: 'typescript', py: 'python', python3: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', 'c++': 'cpp', cc: 'cpp', hpp: 'cpp', 'c#': 'csharp', cs: 'csharp', rs: 'rust', golang: 'go', kt: 'kotlin', rb: 'ruby', yml: 'yaml', md: 'markdown', htm: 'html', xml: 'html', svg: 'html', postgres: 'sql', postgresql: 'sql', mysql: 'sql', sqlite: 'sql', ps1: 'powershell', jl: 'julia', r: 'r' };

const cleanLang = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (!/^[a-z0-9+#.-]{1,20}$/.test(s)) return undefined;
  return LANG_ALIASES[s] ?? s;
};

/** Lines to light up, as a code part keeps them ("2-4,7"), or undefined. */
const cleanLines = (v: unknown): string | undefined => {
  const s = (Array.isArray(v) ? v.join(',') : typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '').replace(/\s+/g, '');
  return s && s.length <= 200 && /^\d{1,4}(-\d{1,4})?(,\d{1,4}(-\d{1,4})?)*$/.test(s) ? s : undefined;
};

/** A part's picture where it cannot run (a poster): a picture's source, or what the hook makes of an agent's file. */
const posterOf = (v: unknown, o: NormalizeOpts): string | undefined => {
  const raw = typeof v === 'string' ? v.trim() : '';
  return (cleanSrc(raw) ?? (raw && o.src ? o.src(raw) : null)) || undefined;
};

/**
 * A quiz's choices as agents write them: strings (a `*` before or after marks a right one), or {text, correct, why};
 * the quiz's own `answer` (a choice's number from 0, or its words) or `answers` marks them too.
 */
function quizChoices(e: Obj): QuizChoice[] {
  const list = Array.isArray(e.choices) ? e.choices : Array.isArray(e.options) ? e.options : Array.isArray(e.answers) && e.answers.some((x) => isObj(x)) ? e.answers : [];
  const out: QuizChoice[] = [];
  for (const raw of list.slice(0, SLIDE_LIMITS.choices)) {
    if (typeof raw === 'string' || typeof raw === 'number') {
      const t = String(raw).trim();
      const star = /^\*\s*|\s*\*$/.test(t) && t !== '*';
      out.push({ text: str(star ? t.replace(/^\*\s*|\s*\*$/g, '') : t, 300), ...(star ? { correct: true } : {}) });
      continue;
    }
    if (!isObj(raw)) continue;
    const c: QuizChoice = { text: str(raw.text ?? raw.t ?? raw.label ?? '', 300) };
    if (raw.correct === true || raw.right === true || raw.ok === true) c.correct = true;
    const why = str(raw.why ?? raw.reason ?? raw.feedback ?? '', 600).trim();
    if (why) c.why = why;
    out.push(c);
  }
  // The right ones named on the quiz itself.
  const named = [e.answer, ...(Array.isArray(e.correct) ? e.correct : []), ...(Array.isArray(e.answers) && !e.answers.some((x) => isObj(x)) ? e.answers : [])];
  for (const a of named) {
    const i = typeof a === 'number' ? Math.round(a) : typeof a === 'string' ? out.findIndex((c) => c.text.trim().toLowerCase() === a.trim().toLowerCase()) : -1;
    if (i >= 0 && i < out.length) out[i].correct = true;
  }
  return out;
}

function element(e: unknown, used: Set<string>, H: number, o: NormalizeOpts, depth = 0, budget: Budget = { n: 0 }): El | null {
  if (!isObj(e)) return null;
  if (++budget.n > SLIDE_LIMITS.els * 3) return null;
  const lower = typeof e.type === 'string' ? e.type.trim().toLowerCase() : '';
  const type = TYPE_ALIASES[lower] ?? lower;
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
    const crop = cleanCrop(e.crop);
    if (crop) img.crop = crop;
    const adjust = cleanAdjust(e.adjust);
    if (adjust) img.adjust = adjust;
    // Its frame, else its shape (agents write either as "shape" too: "rounded" is its corners, "oval" an ellipse).
    const frame = opt(FRAME_ALIASES[String(e.frame ?? '').trim().toLowerCase()] ?? e.frame, PICTURE_FRAMES);
    const shapeOf = String(e.mask ?? e.shape ?? '')
      .trim()
      .toLowerCase();
    const mask = opt(shapeOf === 'oval' ? 'ellipse' : shapeOf, PICTURE_MASKS);
    if (frame) img.frame = frame;
    else if (mask) img.mask = mask;
    else if ((shapeOf === 'round' || shapeOf === 'rounded') && img.radius === undefined) img.radius = Math.round(Math.min(img.w, img.h) * 0.16);
    return img;
  }
  if (type === 'line') {
    const l: LineEl = { ...base(e, used, H, true), type: 'line', width: num(e.width, 0.5, 60, 3) };
    // A connector's ends, by a part's id (its side, else the side that faces the other end, once the slide's parts are known).
    const stick = (v: unknown): Stick | undefined => {
      const el = typeof v === 'string' ? v : isObj(v) && typeof v.el === 'string' ? v.el : '';
      if (!/^[A-Za-z0-9_-]{1,24}$/.test(el)) return undefined;
      return { el, at: (isObj(v) ? opt(v.at ?? v.side, SIDES) : undefined) as Side };
    };
    const from = stick(e.from);
    const to = stick(e.to);
    if (from) l.from = from;
    if (to) l.to = to;
    if (e.route === 'elbow' || e.elbow === true || e.type === 'elbow') l.route = 'elbow';
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
    const merges = cleanMerges(e.merges, t.rows.length, cols);
    if (merges.length) t.merges = merges;
    if (isObj(e.fills)) {
      const fills: Record<string, string> = {};
      for (const [k, v] of Object.entries(e.fills).slice(0, SLIDE_LIMITS.rows * SLIDE_LIMITS.cols)) {
        const m = /^(\d{1,2}),(\d{1,2})$/.exec(k);
        const c = cleanColor(v);
        if (m && c && Number(m[1]) < t.rows.length && Number(m[2]) < cols) fills[`${Number(m[1])},${Number(m[2])}`] = c;
      }
      if (Object.keys(fills).length) t.fills = fills;
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
    const source = chartSource(e.source);
    if (source) c.source = source;
    return c;
  }
  if (type === 'icon') {
    const name =
      typeof e.icon === 'string'
        ? e.icon
            .trim()
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .toLowerCase()
            .replace(/[\s_]+/g, '-')
        : '';
    const icon = /^[a-z0-9][a-z0-9-]{0,59}$/.test(name) ? name : '';
    let paths = iconNodes(e.paths);
    if (!paths.length && icon && o.icon) paths = iconNodes(o.icon(icon) ?? []);
    if (!paths.length) return null;
    const ic: IconEl = { ...base(e, used, H, false, { w: 120, h: 120 }), type: 'icon', icon: icon || 'icon', paths };
    const color = cleanColor(e.color);
    if (color) ic.color = color;
    const lw = num(e.lineW ?? e.width, 0.25, 6, 2);
    if (lw !== 2) ic.lineW = lw;
    return ic;
  }
  if (type === 'math') {
    const tex = str(e.tex ?? e.latex ?? e.text, SLIDE_LIMITS.tex).trim();
    if (!tex) return null;
    const m: MathEl = { ...base(e, used, H, false, { w: 640, h: 140 }), type: 'math', tex };
    const color = cleanColor(e.color);
    if (color) m.color = color;
    const align = opt(e.align, ['left', 'right'] as const);
    if (align) m.align = align;
    return m;
  }
  if (type === 'video') {
    const raw = e.src ?? e.url;
    // An online video's player, a video the app keeps, or one not kept yet (an agent's file) as the hook makes it.
    const src = videoSrc(raw) ?? keptVideo(raw) ?? (typeof raw === 'string' && raw.trim() && o.video ? o.video(raw.trim()) : null);
    if (!src) return null;
    const v: VideoEl = { ...base(e, used, H, false, { w: 800, h: 450 }), type: 'video', src };
    const rawPoster = typeof e.poster === 'string' ? e.poster.trim() : '';
    const poster = cleanSrc(rawPoster) ?? (rawPoster && o.src ? o.src(rawPoster) : null);
    if (poster) v.poster = poster;
    const start = e.start !== undefined ? Math.round(num(e.start, 0, 86400, 0)) : videoStart(raw);
    if (start) v.start = start;
    // Where it stops: a tenth of a second after it starts at the soonest.
    const end = e.end !== undefined ? Math.round(num(e.end, 0, 86400, 0) * 10) / 10 : 0;
    if (end > (start || 0)) v.end = end;
    if (e.autoplay === true) v.autoplay = true;
    if (e.muted === true) v.muted = true;
    if (e.loop === true) v.loop = true;
    if (e.radius !== undefined) v.radius = num(e.radius, 0, 2000, 0);
    return v;
  }
  if (type === 'code') {
    const code = str(e.code ?? e.text ?? e.source ?? '', SLIDE_LIMITS.code).replace(/\r\n?/g, '\n');
    const c: CodeEl = { ...base(e, used, H, false, { w: 720, h: 360 }), type: 'code', code, size: num(e.size, 6, 120, 20) };
    const lang = cleanLang(e.lang ?? e.language);
    if (lang) c.lang = lang;
    const look = opt(e.look ?? e.theme, ['dark', 'light', 'deck'] as const);
    if (look && look !== 'dark') c.look = look;
    if (e.lineNumbers === true || e.numbers === true) c.lineNumbers = true;
    const lit = cleanLines(e.highlight ?? e.lines);
    if (lit) c.highlight = lit;
    if (e.radius !== undefined) c.radius = num(e.radius, 0, 2000, 0);
    return c;
  }
  if (type === 'html') {
    // Kept as the words it is, never read as markup here: it runs only inside a sandboxed frame of its own.
    const h: HtmlEl = { ...base(e, used, H, false, { w: 640, h: 360 }), type: 'html', html: str(e.html ?? e.code ?? e.source ?? '', SLIDE_LIMITS.html) };
    const poster = posterOf(e.poster, o);
    if (poster) h.poster = poster;
    if (e.interactive === true) h.interactive = true;
    return h;
  }
  if (type === 'embed') {
    const url = cleanEmbedUrl(e.url ?? e.src);
    if (!url) return null;
    const m: EmbedEl = { ...base(e, used, H, false, { w: 800, h: 450 }), type: 'embed', url };
    const poster = posterOf(e.poster, o);
    if (poster) m.poster = poster;
    if (e.interactive === true) m.interactive = true;
    if (e.radius !== undefined) m.radius = num(e.radius, 0, 2000, 0);
    return m;
  }
  if (type === 'quiz') {
    const choices = quizChoices(e);
    const q: QuizEl = { ...base(e, used, H, false, { w: 960, h: 440 }), type: 'quiz', question: str(e.question ?? e.text ?? e.title ?? '', SLIDE_LIMITS.question).trim(), choices, size: num(e.size, 6, 200, 32) };
    const right = choices.filter((c) => c.correct).length;
    if (e.multi === true || (e.multi !== false && right > 1)) q.multi = true;
    const explain = str(e.explain ?? e.explanation ?? '', 1000).trim();
    if (explain) q.explain = explain;
    const color = cleanColor(e.color);
    if (color) q.color = color;
    const font = cleanFont(e.font);
    if (font) q.font = font;
    const fill = cleanColor(e.fill);
    if (fill) q.fill = fill;
    if (e.layout === 'grid') q.layout = 'grid';
    return q;
  }
  if (type === 'score') {
    const sc: ScoreEl = { ...base(e, used, H, false, { w: 640, h: 120 }), type: 'score', size: num(e.size, 6, 400, 40) };
    const text = str(e.text ?? '', 300).trim();
    if (text) sc.text = text;
    const color = cleanColor(e.color);
    if (color) sc.color = color;
    const font = cleanFont(e.font);
    if (font) sc.font = font;
    const align = opt(e.align, ALIGNS);
    if (align && align !== 'center') sc.align = align;
    if (e.bold === true) sc.bold = true;
    return sc;
  }
  if (type === 'scene3d') {
    const raw = typeof (e.model ?? e.src) === 'string' ? String(e.model ?? e.src).trim() : '';
    const model = cleanModel(raw) ?? (raw && o.model ? o.model(raw) : null);
    const s3: Scene3dEl = { ...base(e, used, H, false, { w: 480, h: 480 }), type: 'scene3d' };
    if (model) s3.model = model;
    else s3.shape = pick(e.shape, SHAPES_3D, 'cube');
    if (s3.shape === 'text') s3.text = str(e.text ?? '3D', 60).trim() || '3D';
    const color = cleanColor(e.color);
    if (color) s3.color = color;
    const material = opt(e.material, MATERIALS_3D);
    if (material) s3.material = material;
    const light = opt(e.light, LIGHTS_3D);
    if (light) s3.light = light;
    const spin = num(e.spin, -720, 720, 0);
    if (spin) s3.spin = spin;
    if (e.orbit === true) s3.orbit = true;
    if (e.turn !== undefined) s3.turn = num(e.turn, -360, 360, 0);
    if (e.tilt !== undefined) s3.tilt = num(e.tilt, -89, 89, 0);
    if (e.zoom !== undefined) s3.zoom = num(e.zoom, 0.2, 5, 1);
    const bgc = cleanColor(e.bg ?? e.background);
    if (bgc) s3.bg = bgc;
    const poster = posterOf(e.poster, o);
    if (poster) s3.poster = poster;
    return s3;
  }
  if (type === 'qr') {
    const q = qrPart(str(e.text ?? e.url ?? e.link ?? e.value ?? '', 1000).trim());
    if (!q) return null;
    const out: QrEl = { ...base(e, used, H, false, { w: 240, h: 240 }), type: 'qr', ...q };
    const color = cleanColor(e.color);
    if (color) out.color = color;
    const bg = e.bg === 'none' ? 'transparent' : cleanColor(e.bg ?? e.background);
    if (bg) out.bg = bg;
    return out;
  }
  if (type === 'group') {
    const list = Array.isArray(e.els) ? e.els : Array.isArray(e.parts) ? e.parts : [];
    let els = list
      .slice(0, SLIDE_LIMITS.els)
      .map((x) => element(x, used, H, o, depth + 1, budget))
      .filter((x): x is El => !!x);
    // Groups go so deep: a group deeper gives its parts to the one around it.
    if (depth + 1 >= SLIDE_LIMITS.depth) {
      const flat = (x: El): El[] => (x.type === 'group' ? ungroupEls(x).flatMap(flat) : [x]);
      els = els.flatMap(flat);
    }
    if (!els.length) return null;
    // Placed (x and y given): its parts are from its top-left corner; else they are on the slide, and it goes round them.
    const placed = e.x !== undefined && e.y !== undefined;
    const b = base(e, used, H);
    if (placed) return fitGroup({ ...b, type: 'group', els });
    const g = groupOf(els, b.id);
    return { ...b, x: g.x, y: g.y, w: g.w, h: g.h, type: 'group', els: g.els };
  }
  return null;
}

/** A table's merged cells, in bounds, each covering two cells or more and none another's. */
function cleanMerges(v: unknown, rows: number, cols: number): Merge[] {
  if (!Array.isArray(v)) return [];
  const taken = new Set<string>();
  const out: Merge[] = [];
  for (const m of v.slice(0, 200)) {
    if (!isObj(m)) continue;
    const r = Math.round(num(m.r ?? m.row, 0, rows - 1, -1));
    const c = Math.round(num(m.c ?? m.col, 0, cols - 1, -1));
    if (r < 0 || c < 0) continue;
    const rs = Math.round(num(m.rs ?? m.rows, 1, rows - r, 1));
    const cs = Math.round(num(m.cs ?? m.cols, 1, cols - c, 1));
    if (rs * cs < 2) continue;
    const cells: string[] = [];
    for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) cells.push(`${i},${j}`);
    if (cells.some((k) => taken.has(k))) continue;
    for (const k of cells) taken.add(k);
    out.push({ r, c, rs, cs });
  }
  return out;
}

/** The effects only an emphasis has (an agent's {fx: "confetti"} without a type is one). */
const EM_ONLY = new Set<unknown>(ANIM_FX.em.concat(RICH_ANIM_FX.em).filter((f) => !ANIM_FX.in.includes(f) && !RICH_ANIM_FX.in.includes(f)));
/** How long the web format's effects take when an animation does not say (those that tell words or numbers take longer). */
const FX_DUR: Partial<Record<AnimFx, number>> = { typewriter: 1600, count: 1500, draw: 1200, confetti: 1500, heartbeat: 1000, jello: 900, wiggle: 700, flash: 800, bob: 1200, glow: 1200, swing: 800, roll: 700 };

/**
 * An animation: on a part of the slide (`ids`, its own parts), its effect one its kind has (PowerPoint's or the web
 * format's), and a tap's trigger a part of the slide (`every`, in groups too), else the part itself.
 */
function anim(a: unknown, used: Set<string>, ids: Set<string>, every: Set<string> = ids): Anim | null {
  if (!isObj(a) || typeof a.el !== 'string' || !ids.has(a.el)) return null;
  const fx0 = a.fx ?? a.effect;
  const type = opt(a.type, ['in', 'em', 'out'] as const) ?? (EM_ONLY.has(fx0) ? 'em' : 'in');
  const fx = pick(fx0, [...ANIM_FX[type], ...RICH_ANIM_FX[type]], type === 'em' ? 'pulse' : 'fade');
  const trigger = typeof a.trigger === 'string' && every.has(a.trigger) ? a.trigger : undefined;
  const out: Anim = {
    id: cleanId(a.id, used),
    el: a.el,
    type,
    fx,
    on: pick(a.on, ['click', 'with', 'after', 'tap'] as const, trigger ? 'tap' : 'click'),
    dur: num(a.dur, 0, 20000, FX_DUR[fx] ?? 500),
    delay: num(a.delay, 0, 60000, 0),
  };
  if (ANIM_DIR.includes(out.fx)) out.dir = pick(a.dir, DIRS, out.fx === 'float' ? 'up' : 'left');
  if (a.byPara === true && out.on !== 'tap') out.byPara = true;
  if (out.on === 'tap') out.trigger = trigger ?? a.el;
  if (a.loop === true && type === 'em') out.loop = true;
  const by = a.by === 'words' ? 'word' : a.by === 'letters' ? 'letter' : opt(a.by, ['word', 'letter'] as const);
  if (by) out.by = by;
  const ease = opt(a.ease, EASES);
  if (ease) out.ease = ease;
  return out;
}

/** An animation an agent put on an element itself ("anim": "fade", or { fx, on, … }). */
function elAnim(v: unknown, el: string): Obj | null {
  if (typeof v === 'string') return { el, type: EM_ONLY.has(v) ? 'em' : 'in', fx: v, on: 'click' };
  return isObj(v) ? { ...v, el } : null;
}

function bg(v: unknown, o: NormalizeOpts): Bg | undefined {
  const c = cleanColor(v);
  if (c) return { color: c };
  // A moving background by its name alone ("aurora").
  if (typeof v === 'string' && (BG_FX as string[]).includes(v.trim())) return { fx: v.trim() as BgFx };
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
  if (image) out.image = image;
  const fx = opt(v.fx ?? v.effect, BG_FX);
  if (fx) out.fx = fx;
  const rawVideo = typeof v.video === 'string' ? v.video.trim() : '';
  const video = keptVideo(rawVideo) ?? (rawVideo && !videoSrc(rawVideo) && o.video ? o.video(rawVideo) : null);
  if (video) out.video = video;
  if ((image || video) && v.dim !== undefined) out.dim = num(v.dim, 0, 0.8, 0);
  return Object.keys(out).length ? out : undefined;
}

/** How long each transition takes when a slide does not say. */
const TR_DUR: Partial<Record<TransitionFx, number>> = { morph: 1000, cube: 900, flip: 800, dissolve: 800, circle: 700, blinds: 800, glitch: 600 };

function transition(v: unknown): Transition | undefined {
  if (typeof v === 'string') v = { fx: v };
  if (!isObj(v)) return undefined;
  const fx = pick(v.fx ?? v.effect, [...TRANSITIONS, ...RICH_TRANSITIONS], 'none');
  const auto = v.auto !== undefined ? num(v.auto, 0, 3600, 0) : 0;
  if (fx === 'none' && !auto) return undefined;
  const t: Transition = { fx };
  if (fx === 'push' || fx === 'wipe' || fx === 'cover' || fx === 'cube' || fx === 'flip') t.dir = pick(v.dir, DIRS, 'right');
  if (fx !== 'none') t.dur = num(v.dur, 100, 5000, TR_DUR[fx] ?? 600);
  if (auto) t.auto = auto;
  return t;
}

/**
 * A slide's comments, each checked as comments are (comments.ts): on one of its parts (by an id it has), or on the slide,
 * its mark where it said (on the slide, else near its top-right corner). Ids are kept once across the deck (`seen`).
 */
function slideComments(v: unknown, parts: Set<string>, H: number, seen: Set<string>): SlideComment[] {
  if (!Array.isArray(v)) return [];
  const out: SlideComment[] = [];
  for (const raw of v.slice(0, COMMENT_LIMITS.comments)) {
    const c: SlideComment | null = cleanComment(raw);
    if (!c) continue;
    while (seen.has(c.id)) c.id = newCommentId();
    seen.add(c.id);
    const r = raw as Obj;
    if (typeof r.el === 'string' && parts.has(r.el)) c.el = r.el;
    else if (r.x !== undefined || r.y !== undefined) {
      c.x = Math.round(num(r.x, 0, SLIDE_W, SLIDE_W - 40));
      c.y = Math.round(num(r.y, 0, H, 40));
    }
    out.push(c);
  }
  return out;
}

function slide(v: unknown, used: Set<string>, ratio: Ratio, o: NormalizeOpts, cids: Set<string> = new Set()): Slide | null {
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
  const budget: Budget = { n: 0 };
  for (const raw of s.els.slice(0, SLIDE_LIMITS.els)) {
    const el = element(raw, used, H, o, 0, budget);
    if (!el) continue;
    els.push(el);
    const a = isObj(raw) ? elAnim(raw.anim, el.id) : null;
    if (a) pending.push(a);
  }
  s.els = checkConnectors(els);
  const ids = new Set(els.map((e) => e.id));
  const every = new Set(everyEl(els).map((e) => e.id));
  const anims = [...(Array.isArray(v.anims) ? v.anims : []), ...pending]
    .slice(0, SLIDE_LIMITS.anims)
    .map((a) => anim(a, used, ids, every))
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
  if (v.nofooter === true) s.nofooter = true;
  const comments = slideComments(v.comments, new Set(everyEl(els).map((e) => e.id)), H, cids);
  if (comments.length) s.comments = comments;
  if (isObj(v.theme)) s.theme = theme(v.theme, THEMES[0]);
  return reconnect(s);
}

function footer(v: unknown): Footer | undefined {
  if (!isObj(v)) return undefined;
  const f: Footer = {};
  if (v.num === true || v.number === true || v.numbers === true) f.num = true;
  const text = str(v.text, 200).trim();
  if (text) f.text = text;
  const date = v.date === true ? 'today' : str(v.date, 60).trim();
  if (date) f.date = date;
  if (!f.num && !f.text && !f.date) return undefined;
  if (v.skipTitle === true) f.skipTitle = true;
  return f;
}

function guides(v: unknown, H: number): Guides | undefined {
  if (!isObj(v)) return undefined;
  const list = (a: unknown, max: number) =>
    [
      ...new Set(
        (Array.isArray(a) ? a : [])
          .slice(0, SLIDE_LIMITS.guides)
          .filter((x): x is number => typeof x === 'number' && Number.isFinite(x) && x >= -max && x <= max * 2)
          .map((x) => Math.round(x)),
      ),
    ].sort((p, q) => p - q);
  const g: Guides = {};
  const x = list(v.x, SLIDE_W);
  const y = list(v.y, H);
  if (x.length) g.x = x;
  if (y.length) g.y = y;
  return x.length || y.length ? g : undefined;
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
  const cids = new Set<string>();
  const slides = v.slides
    .slice(0, SLIDE_LIMITS.slides)
    .map((s) => slide(s, used, ratio, o, cids))
    .filter((s): s is Slide => !!s);
  if (!slides.length) slides.push({ ...layoutSlide('title', {}, ratio) });
  const d: Deck = { v: 1, ratio, theme: theme(v.theme, THEMES[0]), slides };
  if (v.progress === true) d.progress = true;
  const f = footer(v.footer);
  if (f) d.footer = f;
  const g = guides(v.guides, slideH(ratio));
  if (g) d.guides = g;
  const lg = logo(v.logo, o);
  if (lg) d.logo = lg;
  // PowerPoint compatible: what only the web format has becomes what PowerPoint has.
  const pptx = typeof v.format === 'string' && /^(pptx|powerpoint|ppt)$/i.test(v.format.trim());
  return pptx ? toPowerPoint(d) : d;
}

/** Whether a slide is a title slide, which the footer may leave out: the first, or one made from the Title layout. */
export const isTitleSlide = (d: Deck, i: number) => i === 0 || d.slides[i]?.layout === 'title';

/** Whether the deck's footer (or slide number) shows on a slide. */
export const footerOn = (d: Deck, i: number) => !!d.footer && (d.footer.num || !!d.footer.text || !!d.footer.date) && !d.slides[i]?.nofooter && !(d.footer.skipTitle && isTitleSlide(d, i));

/** Whether a part has a poster: a picture shown where it cannot run (the web format's live parts, and videos). */
const posterPart = (e: El): e is VideoEl | HtmlEl | EmbedEl | Scene3dEl => e.type === 'video' || e.type === 'html' || e.type === 'embed' || e.type === 'scene3d';

/**
 * The pictures a deck shows (parts, those in groups too, the posters of videos and of the web format's live parts,
 * backgrounds), and its 3D models the app keeps or will (they are kept and swept as its pictures are); `stills`:
 * YouTube's own stills too.
 */
export function deckSources(d: Deck, stills = false): string[] {
  const out: string[] = d.logo?.src ? [d.logo.src] : [];
  for (const s of d.slides) {
    if (s.bg?.image) out.push(s.bg.image);
    for (const e of everyEl(s.els)) {
      if (e.type === 'image' && e.src) out.push(e.src);
      if (posterPart(e) && e.poster) out.push(e.poster);
      else if (e.type === 'video' && stills && videoStill(e.src)) out.push(videoStill(e.src)!);
      if (e.type === 'scene3d' && e.model && !e.model.startsWith('https:')) out.push(e.model);
    }
  }
  return out;
}

/** A deck's 3D models that are not on the web (kept by the app, inside the deck, or an agent's files to take in). */
export function deckModels(d: Deck): string[] {
  const out: string[] = [];
  for (const s of d.slides) for (const e of everyEl(s.els)) if (e.type === 'scene3d' && e.model && !e.model.startsWith('https:')) out.push(e.model);
  return out;
}

/** The videos the app keeps that a deck shows ("naget-video:<sha>"), in groups and behind slides too. */
export function deckVideos(d: Deck): string[] {
  const out: string[] = [];
  for (const s of d.slides) {
    if (s.bg?.video?.startsWith(VIDEO)) out.push(s.bg.video);
    for (const e of everyEl(s.els)) if (e.type === 'video' && e.src.startsWith(VIDEO)) out.push(e.src);
  }
  return out;
}

/** The deck with each kept video's source changed by `f` (to where a page fetches it, say): its parts', and those behind its slides. */
export function mapVideoSources(d: Deck, f: (src: string) => string): Deck {
  const map = (els: El[]): El[] => els.map((e) => (e.type === 'group' ? { ...e, els: map(e.els) } : e.type === 'video' && e.src.startsWith(VIDEO) ? { ...e, src: f(e.src) } : e));
  return { ...d, slides: d.slides.map((s) => ({ ...s, ...(s.bg?.video?.startsWith(VIDEO) ? { bg: { ...s.bg, video: f(s.bg.video) } } : {}), els: map(s.els) })) };
}

function mapEls(els: El[], f: (src: string) => string): El[] {
  return els.map((e) => {
    if (e.type === 'image' && e.src) return { ...e, src: f(e.src) };
    if (e.type === 'group') return { ...e, els: mapEls(e.els, f) };
    if (e.type === 'scene3d' && (e.poster || (e.model && !e.model.startsWith('https:'))))
      return { ...e, ...(e.poster ? { poster: f(e.poster) } : {}), ...(e.model && !e.model.startsWith('https:') ? { model: f(e.model) } : {}) };
    if (posterPart(e) && e.poster) return { ...e, poster: f(e.poster) };
    return e;
  });
}

/** The deck with each picture's source changed by `f` (to put pictures inside it, say), its 3D models' too (those not on the web). */
export function mapSources(d: Deck, f: (src: string) => string): Deck {
  return {
    ...d,
    ...(d.logo ? { logo: { ...d.logo, src: f(d.logo.src) } } : {}),
    slides: d.slides.map((s) => ({
      ...s,
      ...(s.bg?.image ? { bg: { ...s.bg, image: f(s.bg.image) } } : {}),
      els: mapEls(s.els, f),
    })),
  };
}

/**
 * The deck as text to keep: JSON with a line per slide's start, part and animation, so the changes between two
 * versions read as a diff of lines.
 */
export function deckText(d: Deck): string {
  const extra = `${d.footer ? `,"footer":${JSON.stringify(d.footer)}` : ''}${d.guides ? `,"guides":${JSON.stringify(d.guides)}` : ''}${d.logo ? `,"logo":${JSON.stringify(d.logo)}` : ''}`;
  const kind = `${d.format ? `,"format":${JSON.stringify(d.format)}` : ''}${d.progress ? ',"progress":true' : ''}`;
  const out: string[] = [`{"v":1,"ratio":${JSON.stringify(d.ratio)}${kind},"theme":${JSON.stringify(d.theme)}${extra},"slides":[`];
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
      const kinds = s.els.map((e) => (e.type === 'shape' ? `shape:${e.shape}` : e.type === 'group' ? `group of ${e.els.length}` : e.type));
      const what = [...new Set(kinds)].map((k) => `${kinds.filter((x) => x === k).length}× ${k}`).join(', ');
      const open = (s.comments ?? []).filter((c) => !c.resolved).length;
      return `${i + 1}. ${slideTitle(s) || '(no title)'} [${s.id}]${s.hidden ? ' (hidden)' : ''}: ${what || 'empty'}${s.anims?.length ? `, ${s.anims.length} animation${s.anims.length === 1 ? '' : 's'}` : ''}${s.notes ? ', notes' : ''}${open ? `, ${open} open comment${open === 1 ? '' : 's'}` : ''}`;
    })
    .join('\n');
}

/** A new deck: a title slide in a theme. */
export function newDeck(title: string, themeId = 'paper', ratio: Ratio = '16:9'): Deck {
  return { v: 1, ratio, theme: own(themeOf(themeId)), slides: [layoutSlide('title', { title }, ratio)] };
}

/** The monospaced font code shows in. */
export const CODE_FONT = 'JetBrains Mono';

/** The fonts a deck uses: its theme's and its parts' (code's own). */
export function deckFonts(d: Deck): string[] {
  const names = new Set<string>([d.theme.font, d.theme.headFont]);
  for (const s of d.slides) if (s.theme) names.add(s.theme.font).add(s.theme.headFont);
  for (const s of d.slides)
    for (const e of everyEl(s.els)) {
      if (e.type === 'code') names.add(CODE_FONT);
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

// ---- the web format and PowerPoint ------------------------------------------------------------------------------

/** Whether a deck is in the web format (the default). */
export const isWebDeck = (d: Pick<Deck, 'format'>) => d.format !== 'pptx';

/** What kind of thing PowerPoint cannot keep as it is. */
export type RichKind = 'part' | 'hover' | 'textFx' | 'glass' | 'effect' | 'tap' | 'loop' | 'by' | 'ease' | 'transition' | 'bgFx' | 'bgVideo' | 'progress';

/**
 * One thing PowerPoint cannot keep as it is: on which slide (from 1; 0 is the deck as a whole), which part (its id),
 * and what, in words: what it is and what it becomes. `kind` says what sort of thing it is; an effect, a transition and
 * a moving background say which they were (`from`) and, where they become another, which (`to`).
 */
export interface RichFeature {
  slide: number;
  el?: string;
  what: string;
  kind: RichKind;
  from?: string;
  to?: string;
}

/** The nearest of PowerPoint's effects to each of the web format's, by the kind of animation (and the side it moves to). */
const NEAR_FX: Record<string, { fx: AnimFx; dir?: Dir }> = {
  'in:blur': { fx: 'fade' },
  'in:rise': { fx: 'float', dir: 'up' },
  'in:drop': { fx: 'fly', dir: 'up' },
  'in:flip': { fx: 'zoom' },
  'in:swing': { fx: 'float', dir: 'up' },
  'in:roll': { fx: 'fly', dir: 'left' },
  'in:pop': { fx: 'zoom' },
  'in:typewriter': { fx: 'appear' },
  'in:draw': { fx: 'wipe', dir: 'left' },
  'in:count': { fx: 'fade' },
  'em:glow': { fx: 'pulse' },
  'em:wiggle': { fx: 'shake' },
  'em:heartbeat': { fx: 'pulse' },
  'em:jello': { fx: 'shake' },
  'em:flash': { fx: 'pulse' },
  'em:bob': { fx: 'pulse' },
  'em:confetti': { fx: 'pulse' },
  'out:blur': { fx: 'fade' },
  'out:drop': { fx: 'fly', dir: 'down' },
  'out:flip': { fx: 'zoom' },
  'out:roll': { fx: 'fly', dir: 'right' },
  'out:pop': { fx: 'zoom' },
};

/** The nearest of PowerPoint's transitions to each of the web format's. */
const NEAR_TR: Partial<Record<TransitionFx, TransitionFx>> = { cube: 'push', flip: 'fade', dissolve: 'fade', circle: 'zoom', blinds: 'wipe', glitch: 'fade' };

/** What each of the web format's parts becomes in PowerPoint, in words. */
const PART_BECOMES: Record<string, string> = {
  html: 'Custom code becomes its picture',
  embed: 'A web page becomes its picture',
  scene3d: '3D becomes its picture',
  quiz: 'A quiz becomes text boxes, its answer in the speaker notes',
  score: 'A quiz score becomes words',
};

/** A quiz's choices are lettered A, B, C… */
export const QUIZ_LETTERS = 'ABCDEFGH';

/** The quizzes that count towards the score: those with a right choice, on the slides the slideshow shows. */
export const scoredQuizzes = (d: Deck) => d.slides.filter((s) => !s.hidden).reduce((n, s) => n + everyEl(s.els).filter((e) => e.type === 'quiz' && e.choices.some((c) => c.correct)).length, 0);

/** A score part's words with its numbers in: "{right} of {total}" ({percent} too). */
export function scoreWords(text: string | undefined, right: number, total: number): string {
  const pct = total ? Math.round((right / total) * 100) : 0;
  return (text || 'You got {right} of {total}').replace(/\{right\}/g, String(right)).replace(/\{total\}/g, String(total)).replace(/\{percent\}/g, String(pct));
}

/** A part's own place, name, link and copies' key, without what only the web format has (for the part PowerPoint gets instead). */
const plainBase = (e: El): Base => {
  const b: Base = { id: e.id, x: e.x, y: e.y, w: e.w, h: e.h };
  if (e.rot) b.rot = e.rot;
  if (e.opacity !== undefined) b.opacity = e.opacity;
  if (e.link) b.link = e.link;
  if (e.name) b.name = e.name;
  if (e.lock) b.lock = true;
  if (e.key) b.key = e.key;
  return b;
};

/**
 * A quiz as PowerPoint's own parts, laid out as the slideshow lays it out: its question in bold at the top, its choices
 * below in boxes of their own (a column, or a grid of two), each with its letter. Their ids are new (`fresh`).
 */
function quizParts(q: QuizEl, fresh: () => string): El[] {
  const size = q.size;
  const cs = Math.round(size * 0.78 * 100) / 100;
  // The question's lines, as many as its words take across the box (at most four).
  const lines = Math.max(1, Math.min(4, Math.ceil((Math.max(1, q.question.length) * size * 0.52) / Math.max(40, q.w))));
  const qh = q.question ? r2(lines * size * 1.25 + 4) : 0;
  const gap = qh ? size * 0.5 : 0;
  const cols = q.layout === 'grid' && q.choices.length > 1 ? 2 : 1;
  const ch = r2(cs * 2.35);
  const cg = r2(cs * 0.35);
  const cw = r2((Math.abs(q.w) - (cols - 1) * cg) / cols);
  const out: El[] = [];
  if (q.question)
    out.push({ id: fresh(), type: 'text', role: 'body', x: 0, y: 0, w: Math.abs(q.w), h: qh, paras: [{ runs: [{ t: q.question }] }], size, bold: true, color: q.color ?? 'head', ...(q.font ? { font: q.font } : {}), pad: 0, valign: 'bottom', fit: 'shrink' });
  q.choices.forEach((c, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    out.push({
      id: fresh(),
      type: 'shape',
      shape: 'round',
      x: r2(col * (cw + cg)),
      y: r2(qh + gap + row * (ch + cg)),
      w: cw,
      h: ch,
      radius: r2(cs * 0.5),
      fill: q.fill ?? 'soft',
      paras: [{ runs: [{ t: `${QUIZ_LETTERS[i]}   `, b: true, color: 'accent' }, { t: c.text }] }],
      size: cs,
      color: q.color ?? 'fg',
      ...(q.font ? { font: q.font } : {}),
      align: 'left',
      valign: 'middle',
      pad: r2(cs * 0.6),
      fit: 'shrink',
    });
  });
  return out;
}

/** What the speaker notes say of a quiz once it is PowerPoint's: its right answer(s) and its explanation ('' for a poll). */
function quizNote(q: QuizEl): string {
  const right = q.choices.map((c, i) => (c.correct ? `${QUIZ_LETTERS[i]} (${c.text})` : '')).filter(Boolean);
  if (!right.length) return '';
  return `Quiz${q.question ? ` "${q.question}"` : ''}: the answer${right.length > 1 ? 's are' : ' is'} ${right.join(', ')}.${q.explain ? ` ${q.explain}` : ''}`;
}

/** The deck as PowerPoint can keep it, and what changed to make it so (richFeatures, toPowerPoint). */
function powerPointOf(d: Deck): { deck: Deck; changes: RichFeature[] } {
  const changes: RichFeature[] = [];
  const H = slideH(d.ratio);
  const total = scoredQuizzes(d);
  const used = new Set<string>(d.slides.flatMap((s) => [s.id, ...everyEl(s.els).map((e) => e.id), ...(s.anims ?? []).map((a) => a.id)]));
  const fresh = () => {
    let id = newId();
    while (used.has(id)) id = newId();
    used.add(id);
    return id;
  };
  const slides = d.slides.map((s, si): Slide => {
    const say = (kind: RichKind, what: string, more: Partial<RichFeature> = {}) => changes.push({ slide: si + 1, kind, what, ...more });
    const notes: string[] = [];
    const part = (e: El): El => {
      let x = e;
      if (x.hover) {
        say('hover', 'What it does when the pointer is on it is left out', { el: x.id, from: x.hover });
        x = { ...x };
        delete x.hover;
      }
      if (x.type === 'text' || x.type === 'shape') {
        if (x.textFx) say('textFx', 'Its text effect is left out', { el: x.id, from: x.textFx });
        if (x.glass) say('glass', 'Its frosted glass is left out', { el: x.id });
        if (x.textFx || x.glass) {
          const { textFx: _fx, glass: _glass, ...rest } = x;
          return rest as El;
        }
        return x;
      }
      if (x.type === 'html' || x.type === 'embed' || x.type === 'scene3d') {
        say('part', PART_BECOMES[x.type], { el: x.id, from: x.type });
        const img: ImageEl = { ...plainBase(x), type: 'image', src: x.poster ?? '', alt: x.type === 'embed' ? x.url : x.type === 'html' ? 'Custom code' : '3D' };
        if (x.type === 'embed' && x.radius) img.radius = x.radius;
        return img;
      }
      if (x.type === 'quiz') {
        say('part', PART_BECOMES.quiz, { el: x.id, from: 'quiz' });
        const note = quizNote(x);
        if (note) notes.push(note);
        const els = quizParts(x, fresh);
        if (!els.length) return { ...plainBase(x), type: 'text', paras: [{ runs: [{ t: '' }] }], size: x.size };
        const g = fitGroup({ ...plainBase(x), type: 'group', x: 0, y: 0, els });
        return { ...g, x: r2(x.x + g.x), y: r2(x.y + g.y) };
      }
      if (x.type === 'score') {
        say('part', PART_BECOMES.score, { el: x.id, from: 'score' });
        // The right answers are the audience's to give: PowerPoint shows how many there are.
        const words = (x.text || 'You got {right} of {total}').replace(/\{right\}|\{percent\}/g, '?').replace(/\{total\}/g, String(total));
        const t: TextEl = { ...plainBase(x), type: 'text', role: 'body', paras: [{ runs: [{ t: words }] }], size: x.size, align: x.align ?? 'center', valign: 'middle', fit: 'shrink' };
        if (x.color) t.color = x.color;
        if (x.font) t.font = x.font;
        if (x.bold) t.bold = true;
        return t;
      }
      if (x.type === 'group') return { ...x, els: x.els.map(part) };
      return x;
    };
    let els = s.els.map(part);
    let bg = s.bg;
    if (bg?.fx) {
      say('bgFx', 'The moving background is left out', { from: bg.fx });
      bg = { ...bg };
      delete bg.fx;
    }
    if (bg?.video) {
      say('bgVideo', 'The video behind the slide becomes a video on it, behind its parts');
      // PowerPoint's way: a video as large as the slide, at the back, playing without sound, over and over.
      const behind: El[] = [{ id: fresh(), type: 'video', name: 'Background video', src: bg.video, x: 0, y: 0, w: SLIDE_W, h: H, autoplay: true, muted: true, loop: true }];
      if (bg.dim) behind.push({ id: fresh(), type: 'shape', shape: 'rect', name: 'Shade', x: 0, y: 0, w: SLIDE_W, h: H, fill: '#000000', opacity: bg.dim, paras: [{ runs: [{ t: '' }] }], size: 20 });
      els = [...behind, ...els];
      bg = { ...bg };
      delete bg.video;
      if (!bg.image) delete bg.dim;
    }
    const anims = (s.anims ?? []).map((a): Anim => {
      let b = a;
      const edit = () => (b === a ? (b = { ...a }) : b);
      const near = NEAR_FX[`${a.type}:${a.fx}`];
      if (near) {
        say('effect', 'An effect becomes the nearest of PowerPoint’s', { el: a.el, from: a.fx, to: near.fx });
        edit().fx = near.fx;
        if (ANIM_DIR.includes(near.fx)) b.dir = near.dir ?? 'left';
        else delete b.dir;
      }
      if (a.on === 'tap') {
        say('tap', 'An effect that runs when a part is clicked runs on the next click instead', { el: a.el });
        edit().on = 'click';
        delete b.trigger;
      }
      if (a.loop) {
        say('loop', 'An effect that keeps going plays once', { el: a.el, from: a.fx });
        delete edit().loop;
      }
      if (a.by) {
        say('by', 'Words or letters that come one by one come in together', { el: a.el, from: a.by });
        delete edit().by;
      }
      if (a.ease) {
        if (a.ease !== 'smooth') say('ease', 'An effect’s easing becomes PowerPoint’s own', { el: a.el, from: a.ease });
        delete edit().ease;
      }
      return b;
    });
    let transition = s.transition;
    const nearTr = transition ? NEAR_TR[transition.fx] : undefined;
    if (transition && nearTr) {
      say('transition', 'The transition becomes the nearest of PowerPoint’s', { from: transition.fx, to: nearTr });
      transition = { ...transition, fx: nearTr };
      if (nearTr !== 'push' && nearTr !== 'wipe' && nearTr !== 'cover') delete transition.dir;
      else transition.dir ??= 'right';
    }
    const out: Slide = { ...s, els };
    if (bg && Object.keys(bg).length) out.bg = bg;
    else delete out.bg;
    if (anims.length) out.anims = anims;
    if (transition) out.transition = transition;
    if (notes.length) out.notes = [s.notes, ...notes].filter(Boolean).join('\n\n').slice(0, SLIDE_LIMITS.notes);
    return out;
  });
  if (d.progress) changes.push({ slide: 0, kind: 'progress', what: 'The progress bar is left out' });
  const deck: Deck = { ...d, format: 'pptx', slides };
  delete deck.progress;
  return { deck, changes };
}

/**
 * What of a deck PowerPoint cannot keep as it is, slide by slide: the web format's parts, effects, transitions,
 * moving backgrounds and videos behind slides, shining text, frosted glass, pointer effects, taps and the progress
 * bar, each with what it becomes. For the editor's warning when a deck is made PowerPoint compatible, and the
 * PowerPoint file's note. None for a deck that has none of them (a PowerPoint compatible one).
 */
export function richFeatures(d: Deck): RichFeature[] {
  return powerPointOf(d).changes;
}

/**
 * The deck with only what PowerPoint has: the web format's live parts become pictures (their posters; the PowerPoint
 * export takes a picture of each where it can, by the same id), a quiz its question and choices as text boxes (its
 * answer in the speaker notes) and a score its words, its effects and transitions the nearest of PowerPoint's, a
 * video behind a slide a video on it at the back, the rest left out; `format` becomes "pptx". Code stays: PowerPoint
 * has it as coloured words.
 */
export function toPowerPoint(d: Deck): Deck {
  return powerPointOf(d).deck;
}

/** What changed to make a deck PowerPoint's (richFeatures), in a sentence: the PowerPoint file's note, or '' when nothing did. */
export function powerPointNote(list: RichFeature[]): string {
  if (!list.length) return '';
  const n = (k: RichKind) => list.filter((f) => f.kind === k).length;
  // "a quiz", "an effect", "3 effects".
  const many = (count: number, one: string, more = `${one}s`) => (count === 1 ? `${/^[aeiou]/i.test(one) ? 'an' : 'a'} ${one}` : `${count} ${more}`);
  const NAMES: Record<string, string> = { html: 'custom code', embed: 'a web page', scene3d: '3D', quiz: 'a quiz', score: 'a quiz score' };
  const kinds = [...new Set(list.filter((f) => f.kind === 'part').map((f) => NAMES[f.from ?? ''] ?? f.from ?? ''))].filter(Boolean);
  const out: string[] = [];
  if (n('part')) out.push(`${many(n('part'), 'part')} became ${n('part') === 1 ? 'a picture or text boxes' : 'pictures or text boxes'} (${kinds.join(', ')})`);
  const near = [n('effect') ? many(n('effect'), 'effect') : '', n('transition') ? many(n('transition'), 'transition') : ''].filter(Boolean);
  if (near.length) out.push(`${near.join(' and ')} became the nearest of PowerPoint's own`);
  if (n('tap')) out.push(`${many(n('tap'), 'effect')} that ran on a click on a part now run${n('tap') === 1 ? 's' : ''} on the next click`);
  if (n('bgVideo')) out.push(n('bgVideo') === 1 ? 'a video behind a slide became a video at its back' : `${n('bgVideo')} videos behind slides became videos at their backs`);
  const left = [
    n('bgFx') ? many(n('bgFx'), 'moving background') : '',
    n('textFx') ? many(n('textFx'), 'text effect') : '',
    n('glass') ? `frosted glass on ${many(n('glass'), 'part')}` : '',
    n('hover') ? many(n('hover'), 'pointer effect') : '',
    n('loop') ? `the repeats of ${many(n('loop'), 'effect')}` : '',
    n('by') ? `words or letters one by one in ${many(n('by'), 'effect')}` : '',
    n('ease') ? `the easing of ${many(n('ease'), 'effect')}` : '',
    n('progress') ? 'the progress bar' : '',
  ].filter(Boolean);
  if (left.length) out.push(`left out: ${left.join(', ')}`);
  return `Made for PowerPoint: ${out.join('; ')}.`;
}
