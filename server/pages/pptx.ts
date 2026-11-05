// A slide deck as a PowerPoint file (.pptx), written from the deck itself: each part a shape of its own that
// stays editable in PowerPoint, Keynote, Google Slides and LibreOffice. Text boxes and shapes with their words
// (paragraphs, bullets and numbers, runs' bold, colours, fonts and links), pictures (cropped as they show, their
// colours adjusted), lines and arrows, connectors (stuck to the shapes they join, straight or elbowed, as PowerPoint's
// own), tables (merged cells, cells' fills), charts as real charts with their numbers,
// groups as groups, icons as pictures that stay sharp (SVG, with a PNG beside it for older programs), equations as
// pictures (their LaTeX as words where no picture could be made), videos from a device inside the file as PowerPoint's
// own (with their still, played on a click), YouTube's and Vimeo's as their still linked to the video; the
// slide's background, its title as the slide's title, the footer and slide number as fields, speaker notes, comments
// (PowerPoint's own, replies threaded, the open ones), the transition (Morph as PowerPoint's own, a fade where it has
// none) and the animations in their order (on a click, with or after the one before, a paragraph at a time). The
// theme's colours and fonts become the file's theme.
//
// A slide is 1280 px wide: 1 px is 9525 EMU (12192000 across, PowerPoint's widescreen) and a font's px is 0.75 pt.
import type { Anim, ChartEl, Deck, El, GroupEl, IconEl, ImageEl, LineEl, MathEl, Para, Run, Side, Slide, Stick, TableEl, TextProps, Theme, VideoEl } from '../../shared/slides.ts';
import { everyEl, fontName, FONTS, hexColor, mixColor, plainText, slideH, VIDEO, videoStill } from '../../shared/slides.ts';
import { coreXml, esc, relsXml, XML_HEAD, zipParts, type ZipPart } from './ooxml.ts';
import { eotOf, fontAttrs } from './pptx-fonts.ts';

/** A picture ready for the file: PNG, JPEG or GIF bytes and its size in pixels. */
export interface Picture {
  data: Buffer;
  ext: 'png' | 'jpeg' | 'gif' | 'webp';
  w: number;
  h: number;
}

export interface PptxOpts {
  title: string;
  /** A source's picture (a kept one, or one fetched from the web), or null when it cannot be had. */
  picture: (src: string) => Picture | null;
  /** How much text boxes were made smaller to fit (by part id), as the app showed them. */
  scales?: Map<string, number>;
  /** Pictures made of parts in a browser: "icon:<id>" (its PNG beside its SVG), "math:<id>" (an equation). */
  renders?: Map<string, Picture>;
  /** A video the app keeps ("naget-video:<sha>"): its bytes and kind, to go inside the file; null when it is not there. */
  video?: (src: string) => { data: Buffer; ext: string; mime: string } | null;
  /** The faces of the app's fonts the deck shows (pptx-fonts.ts deckFontFiles: TrueType files by "family|bold|italic"), carried inside the file. */
  fonts?: Map<string, Buffer>;
}

/** A dark 1×1 PNG: the still of a video that has none (PowerPoint shows its first frame once it plays). */
const DARK_PNG: Picture = { data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMQFBQEAABqADS54vDNAAAAAElFTkSuQmCC', 'base64'), ext: 'png', w: 1, h: 1 };

/** A 1×1 clear PNG: what an icon falls back on where no PNG of it could be made (programs that read SVG show that). */
const CLEAR_PNG: Picture = { data: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64'), ext: 'png', w: 1, h: 1 };

/** An icon as an SVG file, in its colour and line width, as large as its box. */
export function iconSvgText(e: IconEl, t: Theme): string {
  const { hex, alpha } = hexColor(e.color ?? 'accent', t);
  const attrs = (a: Record<string, string | number>) =>
    Object.entries(a)
      .map(([k, v]) => `${k}="${esc(String(v))}"`)
      .join(' ');
  const nodes = e.paths.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(1, Math.round(Math.abs(e.w)))}" height="${Math.max(1, Math.round(Math.abs(e.h)))}" viewBox="0 0 24 24" fill="none" stroke="#${hex}"${alpha < 1 ? ` stroke-opacity="${Math.round(alpha * 1000) / 1000}"` : ''} stroke-width="${e.lineW ?? 2}" stroke-linecap="round" stroke-linejoin="round">${nodes}</svg>`;
}

/** A video's own page on its site, for its still's link. */
const videoPage = (src: string) => {
  const id = src.split('/').pop() ?? '';
  return src.includes('vimeo') ? `https://vimeo.com/${id}` : `https://www.youtube.com/watch?v=${id}`;
};

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const E = 9525;
const emu = (px: number) => Math.round(px * E);
const sz = (px: number) => Math.max(100, Math.min(400000, Math.round(px * 75)));

/** An Office font name for one of the deck's (PowerPoint keeps it; a device without it shows a close one). */
const officeFont = (name: string) => FONTS.find((f) => f.name === name)?.office ?? name;

/**
 * A run's fonts as PowerPoint wants them: the deck's font for Latin, Greek and Cyrillic, with what a computer without it
 * picks the closest by; East Asian and complex scripts in the theme's fonts for them (its heading's or its body's).
 */
const fontsXml = (name: string, head = false) => {
  const f = officeFont(name);
  return `<a:latin typeface="${esc(f)}"${fontAttrs(f)}/><a:ea typeface="${head ? '+mj-ea' : '+mn-ea'}"/><a:cs typeface="${head ? '+mj-cs' : '+mn-cs'}"/>`;
};

function fillXml(color: string | undefined, t: Theme, opacity = 1, fallback?: string): string {
  if (!color && !fallback) return '<a:noFill/>';
  const { hex, alpha } = hexColor(color ?? fallback, t);
  const a = Math.max(0, Math.min(1, alpha * opacity));
  if (a <= 0) return '<a:noFill/>';
  return `<a:solidFill><a:srgbClr val="${hex}">${a < 1 ? `<a:alpha val="${Math.round(a * 100000)}"/>` : ''}</a:srgbClr></a:solidFill>`;
}

const clr = (color: string | undefined, t: Theme, fallback: string, opacity = 1) => {
  const { hex, alpha } = hexColor(color ?? fallback, t);
  const a = alpha * opacity;
  return `<a:srgbClr val="${hex}">${a < 1 ? `<a:alpha val="${Math.round(Math.max(0, a) * 100000)}"/>` : ''}</a:srgbClr>`;
};

/** A CSS angle (0: to the top, 90: to the right) as DrawingML's (0: to the right, clockwise). */
const linAng = (css: number) => Math.round((((css - 90) % 360) + 360) % 360) * 60000;

const PRST: Record<string, string> = {
  rect: 'rect',
  round: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  rtriangle: 'rtTriangle',
  diamond: 'diamond',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  star: 'star5',
  arrow: 'rightArrow',
  larrow: 'leftArrow',
  uarrow: 'upArrow',
  darrow: 'downArrow',
  chevron: 'chevron',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  plus: 'plus',
  heart: 'heart',
  callout: 'wedgeRoundRectCallout',
};

class Rels {
  list: [string, string, string, boolean?][] = [];
  add(type: string, target: string, ext = false): string {
    const hit = this.list.find((r) => r[1] === type && r[2] === target);
    if (hit) return hit[0];
    const id = `rId${this.list.length + 1}`;
    this.list.push([id, type, target, ext]);
    return id;
  }
}

interface Ctx {
  deck: Deck;
  t: Theme;
  o: PptxOpts;
  rels: Rels;
  media: { add(p: { data: Buffer; ext: string }): string };
  /** A chart part (made with its workbook's relationship id) and its workbook: the chart's relationship id. */
  charts: { add(xml: (book: string) => string, book: Buffer): string };
  /** The deck's videos in the file: each one's name in ppt/media. */
  movies: { add(v: { data: Buffer; ext: string }): string };
  /** The videos of the slide being written that PowerPoint plays (their shapes' ids), for its timing. */
  played: { id: number; muted: boolean; loop: boolean }[];
  /** Slide files by the deck's slide number, for links between slides. */
  slideFile: (n: number) => string | null;
  ids: Map<string, number>;
  next: number;
  titled: boolean;
  /** The slide's number (from 1). */
  n: number;
  /** How deep in groups the part being written is (a title placeholder cannot be in one). */
  depth: number;
  /** Names that tie parts to their match on the next or last slide for PowerPoint's Morph ("!!…"). */
  morph: Map<string, string>;
}

function link(c: Ctx, href: string | undefined, tag: 'hlinkClick' = 'hlinkClick'): string {
  if (!href) return '';
  const m = /^#(\d{1,3})$/.exec(href);
  if (m) {
    const f = c.slideFile(Number(m[1]));
    return f ? `<a:${tag} r:id="${c.rels.add('slide', f)}" action="ppaction://hlinksldjump"/>` : '';
  }
  if (!/^(https?:|mailto:|tel:)/i.test(href)) return '';
  return `<a:${tag} r:id="${c.rels.add('hyperlink', href, true)}"/>`;
}

// ---- text -----------------------------------------------------------------------------------------------

/** The language of some words by their letters (Chinese, Japanese, Korean, Greek, Arabic, Hebrew, Thai; else English): PowerPoint checks their spelling and picks their fonts by it. */
export function langOf(s: string): string {
  if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(s)) return 'ja-JP';
  if (/[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(s)) return 'ko-KR';
  if (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(s)) return 'zh-CN';
  if (/[\u0370-\u03ff\u1f00-\u1fff]/.test(s)) return 'el-GR';
  if (/[\u0600-\u06ff]/.test(s)) return 'ar-SA';
  if (/[\u0590-\u05ff]/.test(s)) return 'he-IL';
  if (/[\u0e00-\u0e7f]/.test(s)) return 'th-TH';
  return 'en-US';
}
const langAttrs = (s: string) => {
  const lang = langOf(s);
  return `lang="${lang}"${/^(zh|ja|ko)-/.test(lang) ? ' altLang="en-US"' : ''}`;
};

/** Hundredths of a point, for `px` slide pixels (PowerPoint's spcPts, at most 1584 pt). */
const pts = (px: number) => Math.max(0, Math.min(158400, Math.round(px * 75)));

/** A text part's colour, as its role gives it when it has none of its own. */
const textColor = (e: TextProps) => e.color ?? (e.role === 'title' || e.role === 'quote' ? 'head' : e.role === 'subtitle' || e.role === 'caption' ? 'muted' : 'fg');
const headRole = (e: TextProps) => e.role === 'title' || e.role === 'quote' || e.role === 'big';

/**
 * A run. Its size is the deck's (a box made smaller to fit says so once, in its fontScale); what PowerPoint does not
 * scale with it, the letter spacing, is given at the size shown (`k`). Kerned at every size, as the browser kerns; a
 * link in the run's own colour, underlined, as the app shows links.
 */
function runXml(c: Ctx, r: Run, e: TextProps, k: number, extraOpacity: number): string {
  const size = r.size ?? e.size;
  const b = r.b ?? !!e.bold;
  const i = r.i ?? !!e.italic;
  const href = link(c, r.link);
  // The box's letter spacing is in its own em, as CSS takes it (so a larger run is spaced alike).
  const spc = e.ls ? Math.max(-400000, Math.min(400000, Math.round(e.ls * e.size * k * 75))) : 0;
  const attrs = [langAttrs(r.t), `sz="${sz(size)}"`, b ? 'b="1"' : 'b="0"', i ? 'i="1"' : 'i="0"', r.u || href ? 'u="sng"' : '', r.s ? 'strike="sngStrike"' : '', 'kern="100"', spc ? `spc="${spc}"` : '', r.sup ? 'baseline="30000"' : r.sub ? 'baseline="-25000"' : '', 'dirty="0"']
    .filter(Boolean)
    .join(' ');
  const fill = `<a:solidFill>${clr(r.color ?? textColor(e), c.t, '#000000', extraOpacity)}</a:solidFill>`;
  const hl = r.hl ? `<a:highlight>${clr(r.hl, c.t, '#ffff00')}</a:highlight>` : '';
  const fonts = fontsXml(fontName(r.font ?? e.font, c.t, e.role), headRole(e));
  // A link keeps its words' colour (PowerPoint's own hyperlink colour otherwise).
  const linked = href ? href.replace(/\/>$/, `><a:extLst><a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}"><ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/></a:ext></a:extLst></a:hlinkClick>`) : '';
  const lines = r.t.split('\n');
  const rPr = (inner: string) => `<a:rPr ${attrs}>${fill}${hl}${fonts}${inner}</a:rPr>`;
  return lines
    .map((line, n) => `${n ? `<a:br>${rPr('')}</a:br>` : ''}${line ? `<a:r>${rPr(linked)}<a:t>${esc(line)}</a:t></a:r>` : ''}`)
    .join('');
}

const BULLET = ['•', '◦', '▪', '•', '◦'];
const NUMBER = ['arabicPeriod', 'alphaLcPeriod', 'romanLcPeriod', 'arabicPeriod', 'alphaLcPeriod'];

/**
 * A paragraph as the app lays it out: its lines `lh` times their size apart (PowerPoint's single spacing is 1.2 times a
 * line's largest size, whatever the font, so a percentage of it gives the app's pitch exactly and follows a box's
 * fontScale; points it would round to whole ones), its space after (not after the last), its bullet or number in the
 * box's font and colour, hanging 1.25 em, each level 1.5 em in. What fontScale does not scale is written at the size
 * the words are shown at (`k`: a box made smaller to fit).
 */
function paraXml(c: Ctx, p: Para, e: TextProps, k: number, last: boolean, opacity: number): string {
  const worded = p.runs.filter((r) => r.t);
  // The paragraph is as large as its first words (CSS sizes it so).
  const first = worded[0]?.size ?? p.runs[0]?.size ?? e.size;
  const em = first * k;
  const lvl = Math.max(0, Math.min(4, p.lvl ?? 0));
  const align = p.align ?? e.align ?? 'left';
  const algn = align === 'center' ? 'ctr' : align === 'right' ? 'r' : align === 'justify' ? 'just' : 'l';
  const lh = e.lh ?? (e.role === 'title' ? 1.1 : 1.2);
  const lnSpc = `<a:lnSpc><a:spcPct val="${Math.round((lh / 1.2) * 100000)}"/></a:lnSpc>`;
  const gap = `<a:spcAft><a:spcPts val="${e.gap && !last ? pts(e.gap * k) : 0}"/></a:spcAft>`;
  const boxFont = fontName(e.font, c.t, e.role);
  let bu = '<a:buNone/>';
  let marL = emu(lvl * 1.5 * em);
  let indent = 0;
  if (p.list) {
    marL = emu((lvl * 1.5 + 1.25) * em);
    indent = -emu(1.25 * em);
    const f = officeFont(boxFont);
    bu = `<a:buClr>${clr(textColor(e), c.t, '#000000', opacity)}</a:buClr><a:buFont typeface="${esc(f)}"${fontAttrs(f)}/>${p.list === 'bullet' ? `<a:buChar char="${BULLET[lvl]}"/>` : `<a:buAutoNum type="${NUMBER[lvl]}"/>`}`;
  }
  const runs = p.runs.map((r) => runXml(c, r, e, k, opacity)).join('');
  // What words typed at its end look like in PowerPoint: the box's own.
  const end = `<a:endParaRPr ${langAttrs(plainText([p]))} sz="${sz(first)}" b="${e.bold ? 1 : 0}" i="${e.italic ? 1 : 0}" dirty="0"><a:solidFill>${clr(textColor(e), c.t, '#000000', opacity)}</a:solidFill>${fontsXml(boxFont, headRole(e))}</a:endParaRPr>`;
  return `<a:p><a:pPr marL="${marL}" indent="${indent}" algn="${algn}"${lvl ? ` lvl="${lvl}"` : ''}>${lnSpc}<a:spcBef><a:spcPts val="0"/></a:spcBef>${gap}${bu}</a:pPr>${runs}${end}</a:p>`;
}

function txBody(c: Ctx, e: TextProps & { id: string }, opacity: number, tag = 'p:txBody', inset = 0): string {
  const pad = emu(Math.max(0, (e.pad ?? 10) - inset));
  const anchor = e.valign === 'middle' ? 'ctr' : e.valign === 'bottom' ? 'b' : 't';
  const k = c.o.scales?.get(e.id) ?? 1;
  // The fitting is in fontScale (the sizes themselves stay the deck's); what it does not scale is written at the size shown.
  const fit = e.fit === 'shrink' ? (k < 0.999 ? `<a:normAutofit fontScale="${Math.round(Math.max(0.01, k) * 100000)}"/>` : '<a:normAutofit/>') : '<a:noAutofit/>';
  const empty = !e.paras.some((p) => p.runs.some((r) => r.t));
  const paras = empty ? [{ runs: [{ t: '' }] }] : e.paras;
  return `<${tag}><a:bodyPr wrap="square" lIns="${pad}" tIns="${pad}" rIns="${pad}" bIns="${pad}" anchor="${anchor}" rtlCol="0">${fit}</a:bodyPr><a:lstStyle/>${paras.map((p, i) => paraXml(c, p, e, k, i === paras.length - 1, opacity)).join('')}</${tag}>`;
}

// ---- parts ----------------------------------------------------------------------------------------------

const xfrm = (x: number, y: number, w: number, h: number, rot?: number, flip = '') =>
  `<a:xfrm${rot ? ` rot="${Math.round((((rot % 360) + 360) % 360) * 60000)}"` : ''}${flip}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(Math.max(0, w))}" cy="${emu(Math.max(0, h))}"/></a:xfrm>`;

/** A shadow below a part as the app casts it (CSS: its offset down, its blur, how dark): the same blur radius in PowerPoint. */
const shadowXml = (down: number, blur: number, alpha: number) =>
  `<a:effectLst><a:outerShdw blurRad="${emu(blur)}" dist="${emu(down)}" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="${Math.round(alpha * 100000)}"/></a:srgbClr></a:outerShdw></a:effectLst>`;
/** Boxes, rounded boxes and ovals cast the app's box-shadow; other shapes its drop-shadow; pictures theirs. */
const BOX_SHADOW = shadowXml(10, 28, 0.22);
const SHAPE_SHADOW = shadowXml(8, 16, 0.22);
const PICTURE_SHADOW = shadowXml(10, 18, 0.25);

/** Dashes as the app draws them: three widths on, two off; dots a width on, a width off. */
const DASHES = { dash: '<a:custDash><a:ds d="300000" sp="200000"/></a:custDash>', dot: '<a:custDash><a:ds d="100000" sp="100000"/></a:custDash>' };

function lnXml(color: string | undefined, w: number | undefined, dash: string | undefined, t: Theme, opacity: number): string {
  if (!color) return '<a:ln><a:noFill/></a:ln>';
  const d = dash === 'dash' ? DASHES.dash : dash === 'dot' ? DASHES.dot : '';
  return `<a:ln w="${emu(w ?? 2)}">${fillXml(color, t, opacity)}${d}</a:ln>`;
}

// ---- shapes' outlines -------------------------------------------------------------------------------------

type Cmd = ['M' | 'L', number, number] | ['C', number, number, number, number, number, number] | ['Q', number, number, number, number] | ['Z'];

/** A shape's outline as the app draws it (shared/slides-runtime.ts shapePath: the same points), in its own pixels. */
export function shapeOutline(kind: string, w: number, h: number): Cmd[] {
  const ss = Math.min(w, h);
  const poly = (pts: number[][]): Cmd[] => [['M', pts[0][0], pts[0][1]], ...pts.slice(1).map((p): Cmd => ['L', p[0], p[1]]), ['Z']];
  switch (kind) {
    case 'triangle':
      return poly([[w / 2, 0], [w, h], [0, h]]);
    case 'rtriangle':
      return poly([[0, 0], [w, h], [0, h]]);
    case 'diamond':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]);
    case 'pentagon':
      return poly([[w / 2, 0], [w, h * 0.38], [w * 0.81, h], [w * 0.19, h], [0, h * 0.38]]);
    case 'hexagon': {
      const a = ss * 0.25;
      return poly([[0, h / 2], [a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h]]);
    }
    case 'octagon': {
      const c = ss * 0.29;
      return poly([[c, 0], [w - c, 0], [w, c], [w, h - c], [w - c, h], [c, h], [0, h - c], [0, c]]);
    }
    case 'star':
      return poly(Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 0.382 : 1;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [w / 2 + (w / 2) * r * Math.cos(a), h * 0.525 + h * 0.525 * r * Math.sin(a)];
      }));
    case 'arrow': {
      const hl = Math.min(w, ss * 0.5);
      return poly([[0, h * 0.25], [w - hl, h * 0.25], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, h * 0.75], [0, h * 0.75]]);
    }
    case 'larrow': {
      const hl = Math.min(w, ss * 0.5);
      return poly([[w, h * 0.25], [hl, h * 0.25], [hl, 0], [0, h / 2], [hl, h], [hl, h * 0.75], [w, h * 0.75]]);
    }
    case 'uarrow': {
      const hl = Math.min(h, ss * 0.5);
      return poly([[w * 0.25, h], [w * 0.25, hl], [0, hl], [w / 2, 0], [w, hl], [w * 0.75, hl], [w * 0.75, h]]);
    }
    case 'darrow': {
      const hl = Math.min(h, ss * 0.5);
      return poly([[w * 0.25, 0], [w * 0.75, 0], [w * 0.75, h - hl], [w, h - hl], [w / 2, h], [0, h - hl], [w * 0.25, h - hl]]);
    }
    case 'chevron': {
      const d = Math.min(w / 2, ss * 0.5);
      return poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]);
    }
    case 'parallelogram': {
      const o = ss * 0.25;
      return poly([[o, 0], [w, 0], [w - o, h], [0, h]]);
    }
    case 'trapezoid': {
      const o = ss * 0.25;
      return poly([[0, h], [o, 0], [w - o, 0], [w, h]]);
    }
    case 'plus': {
      const c = ss * 0.25;
      return poly([[c, 0], [w - c, 0], [w - c, c], [w, c], [w, h - c], [w - c, h - c], [w - c, h], [c, h], [c, h - c], [0, h - c], [0, c], [c, c]]);
    }
    case 'heart':
      return [
        ['M', w / 2, h * 0.25],
        ['C', w * 0.45, h * 0.05, w * 0.05, h * 0.02, w * 0.02, h * 0.32],
        ['C', 0, h * 0.55, w * 0.3, h * 0.72, w / 2, h],
        ['C', w * 0.7, h * 0.72, w, h * 0.55, w * 0.98, h * 0.32],
        ['C', w * 0.95, h * 0.02, w * 0.55, h * 0.05, w / 2, h * 0.25],
        ['Z'],
      ];
    case 'callout': {
      const r = ss * 0.1;
      const b = h * 0.82;
      return [['M', r, 0], ['L', w - r, 0], ['Q', w, 0, w, r], ['L', w, b - r], ['Q', w, b, w - r, b], ['L', w * 0.33, b], ['L', w * 0.2, h], ['L', w * 0.17, b], ['L', r, b], ['Q', 0, b, 0, b - r], ['L', 0, r], ['Q', 0, 0, r, 0], ['Z']];
    }
    case 'ellipse': {
      // Four quarter curves (a circle's bezier, 0.5523 of the radius out).
      const k = 0.5523;
      const [rx, ry] = [w / 2, h / 2];
      return [['M', 0, ry], ['C', 0, ry - ry * k, rx - rx * k, 0, rx, 0], ['C', rx + rx * k, 0, w, ry - ry * k, w, ry], ['C', w, ry + ry * k, rx + rx * k, h, rx, h], ['C', rx - rx * k, h, 0, ry + ry * k, 0, ry], ['Z']];
    }
  }
  return poly([[0, 0], [w, 0], [w, h], [0, h]]);
}

/**
 * Whether a shape goes as its own outline rather than PowerPoint's shape of that name: the heart and the callout, which
 * PowerPoint draws otherwise, and any shape but a box with words in it (the app's words take the whole box; PowerPoint's
 * shapes keep their words to a smaller box inside).
 */
const ownOutline = (e: El) => e.type === 'shape' && e.shape !== 'rect' && e.shape !== 'round' && (e.shape === 'heart' || e.shape === 'callout' || e.paras.some((p) => p.runs.some((r) => r.t)));

/** A shape's own outline as DrawingML's custom geometry: its path in EMU, its words' box the whole box, joined at its sides' middles as a box is. */
function custGeomXml(kind: string, w: number, h: number): string {
  const n = (v: number) => Math.round(v * E);
  const pt = (x: number, y: number) => `<a:pt x="${n(x)}" y="${n(y)}"/>`;
  const path = shapeOutline(kind, Math.max(1, Math.abs(w)), Math.max(1, Math.abs(h)))
    .map((c) => (c[0] === 'M' ? `<a:moveTo>${pt(c[1], c[2])}</a:moveTo>` : c[0] === 'L' ? `<a:lnTo>${pt(c[1], c[2])}</a:lnTo>` : c[0] === 'C' ? `<a:cubicBezTo>${pt(c[1], c[2])}${pt(c[3], c[4])}${pt(c[5], c[6])}</a:cubicBezTo>` : c[0] === 'Q' ? `<a:quadBezTo>${pt(c[1], c[2])}${pt(c[3], c[4])}</a:quadBezTo>` : '<a:close/>'))
    .join('');
  const sites = '<a:cxnLst><a:cxn ang="16200000"><a:pos x="hc" y="t"/></a:cxn><a:cxn ang="10800000"><a:pos x="l" y="vc"/></a:cxn><a:cxn ang="5400000"><a:pos x="hc" y="b"/></a:cxn><a:cxn ang="0"><a:pos x="r" y="vc"/></a:cxn></a:cxnLst>';
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/>${sites}<a:rect l="l" t="t" r="r" b="b"/><a:pathLst><a:path w="${n(Math.max(1, Math.abs(w)))}" h="${n(Math.max(1, Math.abs(h)))}">${path}</a:path></a:pathLst></a:custGeom>`;
}

function nvPr(c: Ctx, e: El, kind: string, href?: string): { id: number; cNvPr: string } {
  const id = c.next++;
  c.ids.set(e.id, id);
  const name = c.morph.get(e.id) ?? e.name ?? `${kind} ${id - 1}`;
  const alt = e.type === 'image' ? e.alt : e.type === 'math' ? e.tex : e.type === 'icon' ? e.icon.replace(/-/g, ' ') : undefined;
  const descr = alt ? ` descr="${esc(alt)}"` : '';
  const hl = link(c, href ?? e.link);
  return { id, cNvPr: hl ? `<p:cNvPr id="${id}" name="${esc(name)}"${descr}>${hl}</p:cNvPr>` : `<p:cNvPr id="${id}" name="${esc(name)}"${descr}/>` };
}

function boxXml(c: Ctx, e: Extract<El, { type: 'text' | 'shape' }>): string {
  const t = c.t;
  const kind = e.type === 'shape' ? e.shape : 'rect';
  const op = e.opacity ?? 1;
  const isTitle = e.type === 'text' && e.role === 'title' && !c.titled && !c.depth;
  if (isTitle) c.titled = true;
  const { cNvPr } = nvPr(c, e, isTitle ? 'Title' : e.type === 'shape' ? 'Shape' : 'Text');
  let prst = PRST[kind] ?? 'rect';
  let av = '<a:avLst/>';
  // A rounded box's words keep the app's room: PowerPoint keeps them 0.29 of the corner's radius further in.
  let inset = 0;
  if (kind === 'round' || (kind === 'rect' && e.radius)) {
    prst = 'roundRect';
    const r = Math.min(e.radius ?? Math.min(e.w, e.h) * 0.16, Math.min(e.w, e.h) / 2);
    av = `<a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (r / Math.max(1, Math.min(e.w, e.h))) * 100000))}"/></a:avLst>`;
    inset = r * 0.29289;
  } else if (kind === 'star') av = '<a:avLst><a:gd name="adj" fmla="val 19098"/><a:gd name="hf" fmla="val 100000"/><a:gd name="vf" fmla="val 105000"/></a:avLst>';
  const own = ownOutline(e);
  const geom = own ? custGeomXml(kind, e.w, e.h) : `<a:prstGeom prst="${prst}">${av}</a:prstGeom>`;
  // A box's gradient runs at its angle; a drawn shape's is stretched with it (SVG's bounding box), as the app draws them.
  const boxy = kind === 'rect' || kind === 'round' || kind === 'ellipse';
  const fill =
    e.fill && e.fill2 && e.fill !== 'transparent'
      ? `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${clr(e.fill, t, '#ffffff', op)}</a:gs><a:gs pos="100000">${clr(e.fill2, t, '#ffffff', op)}</a:gs></a:gsLst><a:lin ang="${linAng(e.angle ?? 180)}" scaled="${boxy ? 0 : 1}"/></a:gradFill>`
      : fillXml(e.fill, t, op);
  const nv = isTitle
    ? `<p:nvSpPr>${cNvPr}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>`
    : `<p:nvSpPr>${cNvPr}<p:cNvSpPr${e.type === 'text' ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr>`;
  return `<p:sp>${nv}<p:spPr>${xfrm(e.x, e.y, e.w, e.h, e.rot)}${geom}${fill}${lnXml(e.line, e.lineW, e.dash, t, op)}${e.shadow ? (boxy ? BOX_SHADOW : SHAPE_SHADOW) : ''}</p:spPr>${txBody(c, e, op, 'p:txBody', inset)}</p:sp>`;
}

function imageXml(c: Ctx, e: ImageEl, href?: string): string {
  // A picture whose colours were changed goes changed, as the editor shows it (slides-render.ts), where a browser made it.
  const baked = c.o.renders?.get(`adjust:${e.id}`);
  const pic = baked ?? (e.src ? c.o.picture(e.src) : null);
  if (!pic) return '';
  const rid = c.media.add(pic);
  const { cNvPr } = nvPr(c, e, 'Picture', href);
  const { x, y, w, h } = e;
  let crop = '';
  const fit = e.fit ?? 'cover';
  const v = (f: number) => Math.round(Math.max(0, f) * 100000);
  if (e.crop) crop = `<a:srcRect l="${v(e.crop.l)}" t="${v(e.crop.t)}" r="${v(e.crop.r)}" b="${v(e.crop.b)}"/>`;
  else if (pic.w > 0 && pic.h > 0) {
    // Cover: cut what is outside the box. Contain: the box keeps its size (and its outline), the picture inside it with
    // empty margins, as PowerPoint's own Crop → Fit writes it (a crop by less than nothing).
    const k = fit === 'cover' ? Math.max(w / pic.w, h / pic.h) : Math.min(w / pic.w, h / pic.h);
    const cw = (pic.w - w / k) / 2 / pic.w;
    const ch = (pic.h - h / k) / 2 / pic.h;
    const n = (f: number) => Math.round(f * 100000);
    if (fit === 'cover' && (cw > 0.0005 || ch > 0.0005)) crop = `<a:srcRect l="${v(cw)}" t="${v(ch)}" r="${v(cw)}" b="${v(ch)}"/>`;
    else if (fit === 'contain' && (cw < -0.0005 || ch < -0.0005)) crop = `<a:srcRect l="${n(cw)}" t="${n(ch)}" r="${n(cw)}" b="${n(ch)}"/>`;
  }
  const op = e.opacity ?? 1;
  const a = baked ? undefined : e.adjust;
  // The picture's colours as DrawingML's own picture effects (where they are not in its pixels already).
  const alpha = [
    op < 1 ? `<a:alphaModFix amt="${Math.round(op * 100000)}"/>` : '',
    a?.gray ? '<a:grayscl/>' : '',
    a?.sat !== undefined && a.sat !== 100 && !a.gray ? `<a:hsl hue="0" sat="${Math.round((a.sat - 100) * 1000)}" lum="0"/>` : '',
    a?.bright || a?.contrast ? `<a:lum bright="${Math.round((a.bright ?? 0) * 1000)}" contrast="${Math.round((a.contrast ?? 0) * 1000)}"/>` : '',
    a?.blur ? `<a:blur rad="${emu(a.blur)}" grow="0"/>` : '',
  ].join('');
  const flip = `${e.flipH ? ' flipH="1"' : ''}${e.flipV ? ' flipV="1"' : ''}`;
  const geom = e.radius ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (e.radius / Math.max(1, Math.min(w, h))) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return `<p:pic><p:nvPicPr>${cNvPr}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${alpha}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(x, y, w, h, e.rot, flip)}${geom}${e.line ? lnXml(e.line, e.lineW, undefined, c.t, op) : ''}${e.shadow ? PICTURE_SHADOW : ''}</p:spPr></p:pic>`;
}

/** The connection site PowerPoint knows a side's middle by, for the shapes whose sites are certain; null for others (the end then stays where it is, not stuck, in the file). */
function siteOf(e: El | undefined, at: Side): number | null {
  if (!e) return null;
  // A flipped picture's sides are swapped in its own frame.
  const side: Side = e.type === 'image' && e.flipH && (at === 'l' || at === 'r') ? (at === 'l' ? 'r' : 'l') : e.type === 'image' && e.flipV && (at === 't' || at === 'b') ? (at === 't' ? 'b' : 't') : at;
  if (e.type === 'text' || e.type === 'image' || e.type === 'icon' || (e.type === 'shape' && (e.shape === 'rect' || e.shape === 'round' || e.shape === 'diamond' || ownOutline(e)))) return { t: 0, l: 1, b: 2, r: 3 }[side];
  if (e.type === 'shape' && e.shape === 'ellipse') return { t: 0, l: 2, b: 4, r: 6 }[side];
  return null;
}

/**
 * A line, or a connector: straight, or elbowed as PowerPoint's own (one bend, or two halfway: turned a quarter when it
 * leaves up or down), its ends stuck to the parts they are on (their ids in the file are put in once the slide is
 * written, slideXml), so PowerPoint keeps them joined as the parts move.
 */
function lineXml(c: Ctx, e: LineEl): string {
  const connector = !!(e.from || e.to || e.route);
  const { cNvPr } = nvPr(c, e, connector ? 'Connector' : 'Line');
  const x = Math.min(e.x, e.x + e.w);
  const y = Math.min(e.y, e.y + e.h);
  const flips = (h: boolean, v: boolean) => `${h ? ' flipH="1"' : ''}${v ? ' flipV="1"' : ''}`;
  // Its ends as large as the app draws them, in PowerPoint's sizes (2, 3 or 5 times the line's width): an arrow's head
  // is 3.2 widths and 4 px long, a dot 3.2 widths and 2 px across.
  const size = (px: number) => {
    const k = px / Math.max(0.5, e.width);
    return k >= 4 ? 'lg' : k >= 2.5 ? 'med' : 'sm';
  };
  const cap = (k: string | undefined, tag: string) => {
    if (k === 'arrow') return `<a:${tag} type="triangle" w="${size(e.width * 3.2 + 4)}" len="${size(e.width * 3.2 + 4)}"/>`;
    if (k === 'dot') return `<a:${tag} type="oval" w="${size(e.width * 3.2 + 2)}" len="${size(e.width * 3.2 + 2)}"/>`;
    return '';
  };
  // The app's dashes (three widths on, two off) and dots (round, two widths apart).
  const d = e.dash === 'dash' ? DASHES.dash : e.dash === 'dot' ? '<a:custDash><a:ds d="1000" sp="200000"/></a:custDash>' : '';
  const ln = `<a:ln w="${emu(e.width)}"${e.dash === 'dot' ? ' cap="rnd"' : ''}>${fillXml(e.color ?? 'fg', c.t, e.opacity ?? 1)}${d}${cap(e.start, 'headEnd')}${cap(e.end, 'tailEnd')}</a:ln>`;
  let box = xfrm(x, y, Math.abs(e.w), Math.abs(e.h), undefined, flips(e.w < 0, e.h < 0));
  let prst = connector ? 'straightConnector1' : 'line';
  if (e.route === 'elbow') {
    const across = (at?: Side) => at === 'l' || at === 'r';
    const h1 = e.from ? across(e.from.at) : e.to ? across(e.to.at) : true;
    const h2 = e.to ? across(e.to.at) : h1;
    prst = h1 === h2 ? 'bentConnector3' : 'bentConnector2';
    if (!h1) {
      // Leaving up or down: PowerPoint's path (across first) turned a quarter about the middle, its box's sides swapped.
      const cx = e.x + e.w / 2;
      const cy = e.y + e.h / 2;
      box = xfrm(cx - Math.abs(e.h) / 2, cy - Math.abs(e.w) / 2, Math.abs(e.h), Math.abs(e.w), 90, flips(e.h < 0, e.w > 0));
    }
  }
  const glue = (tag: 'stCxn' | 'endCxn', st?: Stick) => (st ? `@@${tag}|${st.el}|${st.at}@@` : '');
  const nv = connector ? `<p:cNvCxnSpPr>${glue('stCxn', e.from)}${glue('endCxn', e.to)}</p:cNvCxnSpPr>` : '<p:cNvCxnSpPr/>';
  return `<p:cxnSp><p:nvCxnSpPr>${cNvPr}${nv}<p:nvPr/></p:nvCxnSpPr><p:spPr>${box}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
}

function tableXml(c: Ctx, e: TableEl): string {
  const t = c.t;
  const { cNvPr } = nvPr(c, e, 'Table');
  const cols = Math.max(1, ...e.rows.map((r) => r.length));
  const weights = e.cols?.length === cols ? e.cols : Array(cols).fill(1);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const widths = weights.map((w) => emu((e.w * w) / sum));
  const rowH = emu(e.h / Math.max(1, e.rows.length));
  // Borders a quiet mix of the words and the slide, as the app draws them (not every program reads a line's transparency).
  const border = hexColor(e.line ?? mixColor('fg', 'bg', 0.18, t), t).hex;
  const ln = (tag: string) => `<a:${tag} w="9525"><a:solidFill><a:srgbClr val="${border}"/></a:solidFill></a:${tag}>`;
  const pad = emu(e.size * 0.35);
  const padX = emu(e.size * 0.6);
  // Merged cells: the first spans its block, the rest say which way they are merged into it.
  const spans = new Map<string, { rs: number; cs: number }>();
  const merged = new Map<string, string>();
  for (const m of e.merges ?? []) {
    spans.set(`${m.r},${m.c}`, { rs: m.rs, cs: m.cs });
    for (let i = m.r; i < m.r + m.rs; i++) for (let j = m.c; j < m.c + m.cs; j++) if (i !== m.r || j !== m.c) merged.set(`${i},${j}`, `${j > m.c ? ' hMerge="1"' : ''}${i > m.r ? ' vMerge="1"' : ''}`);
  }
  const rows = e.rows
    .map((r, ri) => {
      const head = ri === 0 && !!e.head;
      const band = !head && e.band && (ri - (e.head ? 1 : 0)) % 2 === 1;
      const cells = Array.from({ length: cols }, (_, ci) => {
        const text = merged.has(`${ri},${ci}`) ? '' : (r[ci] ?? '');
        const align = e.aligns?.[ci] ?? 'left';
        const algn = align === 'center' ? 'ctr' : align === 'right' ? 'r' : align === 'justify' ? 'just' : 'l';
        const color = head ? (e.headColor ?? 'accentFg') : (e.color ?? 'fg');
        // Its lines 1.2 times its size apart, as the slide's own line height sets them (PowerPoint's single spacing).
        const fonts = fontsXml(fontName(e.font, t));
        const rPr = (tag: string, line: string) => `<a:${tag} ${langAttrs(line || text)} sz="${sz(e.size)}" b="${head ? 1 : 0}" kern="100" dirty="0"><a:solidFill>${clr(color, t, '#000000')}</a:solidFill>${fonts}</a:${tag}>`;
        const paras = text
          .split('\n')
          .map((line) => `<a:p><a:pPr algn="${algn}"><a:lnSpc><a:spcPct val="100000"/></a:lnSpc></a:pPr>${line ? `<a:r>${rPr('rPr', line)}<a:t>${esc(line)}</a:t></a:r>` : ''}${rPr('endParaRPr', line)}</a:p>`)
          .join('');
        const own = e.fills?.[`${ri},${ci}`];
        const fill = own ? fillXml(own, t) : head ? fillXml(e.fill ?? 'accent', t) : band ? fillXml('soft', t) : '<a:noFill/>';
        const sp = spans.get(`${ri},${ci}`);
        const attrs = sp ? `${sp.cs > 1 ? ` gridSpan="${sp.cs}"` : ''}${sp.rs > 1 ? ` rowSpan="${sp.rs}"` : ''}` : (merged.get(`${ri},${ci}`) ?? '');
        return `<a:tc${attrs}><a:txBody><a:bodyPr/><a:lstStyle/>${paras}</a:txBody><a:tcPr marL="${padX}" marR="${padX}" marT="${pad}" marB="${pad}" anchor="ctr">${ln('lnL')}${ln('lnR')}${ln('lnT')}${ln('lnB')}${fill}</a:tcPr></a:tc>`;
      }).join('');
      return `<a:tr h="${rowH}">${cells}</a:tr>`;
    })
    .join('');
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.w)}" cy="${emu(e.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${e.head ? ' firstRow="1"' : ''}${e.band ? ' bandRow="1"' : ''}/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

// ---- icons, equations, videos, groups ---------------------------------------------------------------------

/** A picture of the slide (an icon's, an equation's): `svg` beside it for programs that read SVG. */
function picXml(c: Ctx, e: El, png: Picture, box: { x: number; y: number; w: number; h: number }, kind: string, svg?: string, href?: string): string {
  const rid = c.media.add(png);
  const { cNvPr } = nvPr(c, e, kind, href);
  const op = e.opacity ?? 1;
  const alpha = op < 1 ? `<a:alphaModFix amt="${Math.round(op * 100000)}"/>` : '';
  const ext = svg
    ? `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${c.media.add({ data: Buffer.from(svg, 'utf8'), ext: 'svg' })}"/></a:ext></a:extLst>`
    : '';
  return `<p:pic><p:nvPicPr>${cNvPr}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${alpha}${ext}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box.x, box.y, box.w, box.h, e.rot)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

function iconXml(c: Ctx, e: IconEl): string {
  return picXml(c, e, c.o.renders?.get(`icon:${e.id}`) ?? CLEAR_PNG, e, 'Icon', iconSvgText(e, c.t));
}

/** An equation: its picture where one was made, as large as its box allows; else its LaTeX as words. */
function mathXml(c: Ctx, e: MathEl): string {
  const pic = c.o.renders?.get(`math:${e.id}`);
  if (pic && pic.w > 0 && pic.h > 0) {
    const k = Math.min(e.w / pic.w, e.h / pic.h);
    const w = pic.w * k;
    const h = pic.h * k;
    const x = e.align === 'left' ? e.x : e.align === 'right' ? e.x + e.w - w : e.x + (e.w - w) / 2;
    return picXml(c, e, pic, { x, y: e.y + (e.h - h) / 2, w, h }, 'Equation');
  }
  const words: TextProps & { id: string } = { id: e.id, paras: [{ runs: [{ t: e.tex }] }], size: 28, color: e.color ?? 'fg', font: 'Cambria Math', align: e.align ?? 'center', valign: 'middle', fit: 'shrink' };
  const { cNvPr } = nvPr(c, e, 'Equation');
  return `<p:sp><p:nvSpPr>${cNvPr}<p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(e.x, e.y, e.w, e.h, e.rot)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>${txBody(c, words, e.opacity ?? 1)}</p:sp>`;
}

/**
 * A video from a device, inside the file as PowerPoint's own video: its still on the slide (PowerPoint draws its
 * controls), the file both linked and embedded as PowerPoint links them, played on a click (its timing), from where it
 * starts, without sound or again and again as the deck says.
 */
function movieXml(c: Ctx, e: VideoEl, file: { data: Buffer; ext: string }): string {
  const name = c.movies.add(file);
  const link = c.rels.add('video', `../media/${name}`);
  const media = c.rels.add('http://schemas.microsoft.com/office/2007/relationships/media', `../media/${name}`);
  const still = (e.poster ? c.o.picture(e.poster) : null) ?? DARK_PNG;
  const pic = c.media.add(still);
  const id = c.next++;
  c.ids.set(e.id, id);
  c.played.push({ id, muted: !!e.muted, loop: !!e.loop });
  const op = e.opacity ?? 1;
  const alpha = op < 1 ? `<a:alphaModFix amt="${Math.round(op * 100000)}"/>` : '';
  const trim = e.start ? `<p14:trim st="${Math.round(e.start * 1000)}"/>` : '';
  const geom = e.radius ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (e.radius / Math.max(1, Math.min(e.w, e.h))) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(c.morph.get(e.id) ?? e.name ?? 'Video')}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr><a:videoFile r:link="${link}"/><p:extLst><p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"><p14:media xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" r:embed="${media}">${trim}</p14:media></p:ext></p:extLst></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${pic}">${alpha}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(e.x, e.y, e.w, e.h, e.rot)}${geom}</p:spPr></p:pic>`;
}

/** A video: from a device, inside the file; else its still (or a dark box), a play button on it, both linked to the video's page. */
function videoXml(c: Ctx, e: VideoEl): string {
  const file = e.src.startsWith(VIDEO) ? c.o.video?.(e.src) : null;
  if (file) return movieXml(c, e, file);
  // A kept video the file cannot have: its still alone.
  if (e.src.startsWith(VIDEO)) return e.poster ? imageXml(c, { id: e.id, type: 'image', src: e.poster, x: e.x, y: e.y, w: e.w, h: e.h, rot: e.rot, opacity: e.opacity, fit: 'cover', radius: e.radius, alt: 'Video', name: e.name } as ImageEl) : '';
  const href = videoPage(e.src);
  const still = e.poster ?? videoStill(e.src);
  const pic = still ? c.o.picture(still) : null;
  const gid = c.next++;
  c.ids.set(e.id, gid);
  const inner = { ...e, x: 0, y: 0, rot: undefined, id: `${e.id}-still`, link: undefined } as VideoEl;
  let back: string;
  if (pic) {
    const img: ImageEl = { id: `${e.id}-still`, type: 'image', src: still!, x: 0, y: 0, w: e.w, h: e.h, fit: 'cover', radius: e.radius, alt: 'Video' };
    back = imageXml(c, img, href);
  } else {
    const { cNvPr } = nvPr(c, inner, 'Video', href);
    back = `<p:sp><p:nvSpPr>${cNvPr}<p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, e.w, e.h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="111111"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
  }
  const d = Math.min(e.w, e.h) * 0.22;
  const play = `<p:sp><p:nvSpPr><p:cNvPr id="${c.next++}" name="Play">${link(c, href)}</p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(e.w / 2 - d / 2, e.h / 2 - d / 2, d, d)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="000000"><a:alpha val="60000"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="${c.next++}" name="Play arrow">${link(c, href)}</p:cNvPr><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(e.w / 2 - d * 0.16, e.h / 2 - d * 0.22, d * 0.4, d * 0.44, 90)}<a:prstGeom prst="triangle"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
  const name = c.morph.get(e.id) ?? e.name ?? 'Video';
  return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${gid}" name="${esc(name)}" descr="${esc(href)}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${grpXfrm(e)}</p:grpSpPr>${back}${play}</p:grpSp>`;
}

/** A group's frame: its place on the slide, its parts placed from its top-left corner as they are in the deck. */
const grpXfrm = (e: El) =>
  `<a:xfrm${e.rot ? ` rot="${Math.round((((e.rot % 360) + 360) % 360) * 60000)}"` : ''}><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(Math.max(0, e.w))}" cy="${emu(Math.max(0, e.h))}"/><a:chOff x="0" y="0"/><a:chExt cx="${emu(Math.max(0, e.w))}" cy="${emu(Math.max(0, e.h))}"/></a:xfrm>`;

function groupXml(c: Ctx, e: GroupEl): string {
  const { cNvPr } = nvPr(c, e, 'Group');
  // A group's see-through goes on its parts (a group has none of its own in PowerPoint).
  const op = e.opacity ?? 1;
  const els = op < 1 ? e.els.map((x) => ({ ...x, opacity: Math.round((x.opacity ?? 1) * op * 100) / 100 }) as El) : e.els;
  c.depth++;
  const inner = els.map((x) => partXml(c, x)).join('');
  c.depth--;
  return `<p:grpSp><p:nvGrpSpPr>${cNvPr}<p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${grpXfrm(e)}</p:grpSpPr>${inner}</p:grpSp>`;
}

function partXml(c: Ctx, e: El): string {
  if (e.type === 'text' || e.type === 'shape') return boxXml(c, e);
  if (e.type === 'image') return imageXml(c, e);
  if (e.type === 'line') return lineXml(c, e);
  if (e.type === 'table') return tableXml(c, e);
  if (e.type === 'chart') return chartFrame(c, e);
  if (e.type === 'icon') return iconXml(c, e);
  if (e.type === 'math') return mathXml(c, e);
  if (e.type === 'video') return videoXml(c, e);
  if (e.type === 'group') return groupXml(c, e);
  return '';
}

/** The footer as text boxes at the foot of the slide: the date and the number as fields PowerPoint keeps up to date. */
function footerXml(c: Ctx, i: number): string {
  const d = c.deck;
  const f = d.footer;
  const s = d.slides[i];
  if (!f || !s || s.nofooter || (f.skipTitle && (i === 0 || s.layout === 'title'))) return '';
  const H = slideH(d.ratio);
  const rPr = `<a:rPr lang="en-US" sz="${sz(17)}" kern="100" dirty="0"><a:solidFill>${clr('muted', c.t, '#777777')}</a:solidFill>${fontsXml(fontName('body', c.t))}</a:rPr>`;
  const box = (name: string, x: number, w: number, algn: string, run: string) => {
    const id = c.next++;
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(x, H - 56, w, 56)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${algn}"/>${run}</a:p></p:txBody></p:sp>`;
  };
  let out = '';
  if (f.date) {
    const today = f.date === 'today';
    const text = today ? new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : f.date;
    out += box('Date', 64, 320, 'l', today ? `<a:fld id="{4A9C2F6B-6D0E-4B8E-9C3A-1F2D3E4A5B60}" type="datetime4">${rPr}<a:t>${esc(text)}</a:t></a:fld>` : `<a:r>${rPr}<a:t>${esc(text)}</a:t></a:r>`);
  }
  if (f.text) out += box('Footer', 400, 1280 - 800, 'ctr', `<a:r>${rPr}<a:t>${esc(f.text)}</a:t></a:r>`);
  if (f.num) out += box('Slide number', 1280 - 264, 200, 'r', `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${rPr}<a:t>${i + 1}</a:t></a:fld>`);
  return out;
}

// ---- charts ---------------------------------------------------------------------------------------------

const col = (i: number) => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/**
 * Where the app draws a chart's parts (shared/slides-runtime.ts chart(), the same sums): the title above, the legend's
 * rows below, and the plot between, with its value axis's ticks (a round step, from lo to hi) and the room their labels
 * take; a pie's circle. In the chart's own pixels.
 */
export function chartPlan(e: ChartEl) {
  const w = Math.max(10, Math.abs(e.w));
  const h = Math.max(10, Math.abs(e.h));
  const fs = e.size;
  const pie = e.kind === 'pie' || e.kind === 'doughnut';
  const series = pie ? e.series.slice(0, 1) : e.series;
  let top = 4;
  let bottom = h - 4;
  if (e.title) top += fs * 1.8;
  const names = pie ? e.labels : series.map((s) => s.name);
  const legend = !!e.legend && names.length > 0 && (pie || series.length > 1 || !!series[0]?.name);
  let legendRows = 0;
  if (legend) {
    let rowW = 0;
    legendRows = 1;
    let inRow = 0;
    for (const name of names) {
      const iw = fs * 1.4 + name.length * fs * 0.56 + fs;
      if (rowW + iw > w && inRow) {
        legendRows++;
        rowW = 0;
        inRow = 0;
      }
      rowW += iw;
      inRow++;
    }
    bottom -= legendRows * fs * 1.5 + fs * 0.4;
  }
  if (pie) {
    const r = Math.max(4, Math.min(w, bottom - top) / 2 - 4);
    return { w, h, pie, legend, legendRows, r, cx: w / 2, cy: top + (bottom - top) / 2, plot: { x: w / 2 - r, y: top + (bottom - top) / 2 - r, w: 2 * r, h: 2 * r }, lo: 0, hi: 0, step: 0 };
  }
  let max = 0;
  let min = 0;
  for (let i = 0; i < e.labels.length; i++) {
    if (e.stacked) {
      let pos = 0;
      let neg = 0;
      for (const s of series) {
        const v = Number.isFinite(s.values[i]) ? s.values[i] : 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      max = Math.max(max, pos);
      min = Math.min(min, neg);
    } else
      for (const s of series) {
        const v = Number.isFinite(s.values[i]) ? s.values[i] : 0;
        max = Math.max(max, v);
        min = Math.min(min, v);
      }
  }
  const nice = (m: number) => {
    if (m <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(m)));
    const f = m / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  };
  const span = nice(Math.max(max, -min) || 1);
  const step = span / (span / (max - min || span) > 2 ? 2 : 4) || 1;
  const hi = Math.ceil(max / step) * step || step;
  const lo = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2 && ticks.length < 12; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  const short = (v: number) => {
    const a = Math.abs(v);
    const r = (x: number) => String(Math.round(x * 10) / 10);
    return a >= 1e9 ? `${r(v / 1e9)}B` : a >= 1e6 ? `${r(v / 1e6)}M` : a >= 1e4 ? `${r(v / 1e3)}k` : String(Math.round(v * 100) / 100);
  };
  const horiz = e.kind === 'bar';
  const valW = Math.max(...ticks.map((v) => short(v).length)) * fs * 0.6 + fs * 0.6;
  const catW = horiz ? Math.min(w * 0.35, Math.max(...e.labels.map((l) => l.length), 1) * fs * 0.56 + fs * 0.6) : 0;
  const left = horiz ? catW : valW;
  const plotTop = top + fs * 0.6;
  const plotBottom = bottom - (horiz ? fs * 1.6 : fs * 1.8);
  const right = w - fs * 0.6;
  return { w, h, pie, legend, legendRows, r: 0, cx: 0, cy: 0, plot: { x: left, y: plotTop, w: Math.max(1, right - left), h: Math.max(1, plotBottom - plotTop) }, lo, hi: Math.round(hi * 1e6) / 1e6, step: Math.round(step * 1e6) / 1e6 };
}

/**
 * A chart as PowerPoint draws its own, laid out where the app draws it: its plot pinned to the app's (a manual layout),
 * its value axis on the app's ticks, its bars as wide, its markers as large, its labels where the app writes them, its
 * numbers cached in it and in the workbook beside it (`book`: its relationship, so PowerPoint's Edit Data opens them).
 */
function chartXml(e: ChartEl, t: Theme, book?: string): string {
  const C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const ink = hexColor(e.color ?? 'muted', t).hex;
  const fonts = fontsXml(fontName(e.font, t));
  const txPr = (size: number, bold = false, color = ink, flat = false) =>
    `<c:txPr><a:bodyPr${flat ? ' rot="0" vert="horz"' : ''}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz(size)}" b="${bold ? 1 : 0}" kern="100"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${fonts}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const plan = chartPlan(e);
  const labels = e.labels;
  const n = labels.length;
  const pie = plan.pie;
  const series = pie ? e.series.slice(0, 1) : e.series;
  const colorOf = (i: number, s?: { color?: string }) => hexColor(s?.color ?? `c${(i % 6) + 1}`, t).hex;
  const cat = `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${labels.map((l, i) => `<c:pt idx="${i}"><c:v>${esc(l)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const val = (s: ChartEl['series'][number], si: number) =>
    `<c:val><c:numRef><c:f>Sheet1!$${col(si + 1)}$2:$${col(si + 1)}$${n + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${labels.map((_, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(s.values[i]) ? s.values[i] : 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`;
  const tx = (s: ChartEl['series'][number], si: number) => `<c:tx><c:strRef><c:f>Sheet1!$${col(si + 1)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
  // Values written where the app writes them (PowerPoint takes no position at all for areas and doughnuts).
  const pos = e.kind === 'pie' ? 'ctr' : e.kind === 'line' ? 't' : e.kind === 'column' || e.kind === 'bar' ? (e.stacked ? 'inEnd' : 'outEnd') : '';
  const dLbls = (pct: boolean) =>
    `<c:dLbls>${pct ? '<c:numFmt formatCode="0%" sourceLinked="0"/>' : ''}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(e.size, pct, pct ? 'FFFFFF' : hexColor('fg', t).hex)}${pos ? `<c:dLblPos val="${pos}"/>` : ''}<c:showLegendKey val="0"/><c:showVal val="${pct ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const solid = (hex: string) => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
  const f = (v: number) => Math.round(v * 10000) / 10000;
  // The plot's inner box, where the app draws it.
  const layout = `<c:layout><c:manualLayout><c:layoutTarget val="inner"/><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="${f(plan.plot.x / plan.w)}"/><c:y val="${f(plan.plot.y / plan.h)}"/><c:w val="${f(plan.plot.w / plan.w)}"/><c:h val="${f(plan.plot.h / plan.h)}"/></c:manualLayout></c:layout>`;
  let plot = '';
  if (pie) {
    const s = series[0] ?? { name: 'Series 1', values: [] };
    const pts = labels.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${colorOf(i)}"/></a:solidFill><a:ln w="19050"><a:solidFill><a:srgbClr val="${hexColor('bg', t).hex}"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join('');
    const ser = `<c:ser><c:idx val="0"/><c:order val="0"/>${tx(s, 0)}${pts}${e.values ? dLbls(true) : ''}${cat}${val(s, 0)}</c:ser>`;
    plot = e.kind === 'pie' ? `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>` : `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  } else {
    const axes = '<c:axId val="51600001"/><c:axId val="51600002"/>';
    const horiz = e.kind === 'bar';
    if (e.kind === 'column' || e.kind === 'bar') {
      // The app's bars fill 72% of their band, side by side 2 px apart (or stacked).
      const each = (0.72 * (horiz ? plan.plot.h : plan.plot.w)) / Math.max(1, n) / (e.stacked ? 1 : Math.max(1, series.length));
      const gap = Math.round(Math.min(500, (0.28 / 0.72) * 100 * (e.stacked ? 1 : Math.max(1, series.length))));
      const overlap = e.stacked ? 100 : Math.max(-100, Math.round((-2 / Math.max(2, each)) * 100));
      const sers = series.map((s, si) => `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${tx(s, si)}${solid(colorOf(si, s))}<c:invertIfNegative val="0"/>${e.values ? dLbls(false) : ''}${cat}${val(s, si)}</c:ser>`).join('');
      plot = `<c:barChart><c:barDir val="${horiz ? 'bar' : 'col'}"/><c:grouping val="${e.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="${gap}"/><c:overlap val="${overlap}"/>${axes}</c:barChart>`;
    } else if (e.kind === 'line') {
      // Its markers as large as the app's dots (their size in points).
      const mark = Math.max(2, Math.min(72, Math.round(2 * Math.max(3, e.size / 4.5) * 0.75)));
      const sers = series
        .map((s, si) => {
          const hex = colorOf(si, s);
          return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${tx(s, si)}<c:spPr><a:ln w="${emu(Math.max(2, e.size / 6))}" cap="rnd"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="${mark}"/><c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>${e.values ? dLbls(false) : ''}${cat}${val(s, si)}<c:smooth val="0"/></c:ser>`;
        })
        .join('');
      plot = `<c:lineChart><c:grouping val="${e.stacked ? 'stacked' : 'standard'}"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axes}</c:lineChart>`;
    } else {
      const sers = series
        .map((s, si) => {
          const hex = colorOf(si, s);
          return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${tx(s, si)}<c:spPr><a:solidFill><a:srgbClr val="${hex}"><a:alpha val="${e.stacked ? 85000 : 28000}"/></a:srgbClr></a:solidFill><a:ln w="${emu(Math.max(2, e.size / 6))}"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:ln></c:spPr>${e.values ? dLbls(false) : ''}${cat}${val(s, si)}</c:ser>`;
        })
        .join('');
      plot = `<c:areaChart><c:grouping val="${e.stacked ? 'stacked' : 'standard'}"/><c:varyColors val="0"/>${sers}${axes}</c:areaChart>`;
    }
    const fg = hexColor('fg', t).hex;
    const grid = e.grid ? `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${fg}"><a:alpha val="12000"/></a:srgbClr></a:solidFill></a:ln></c:spPr></c:majorGridlines>` : '';
    const axisLine = `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${fg}"><a:alpha val="35000"/></a:srgbClr></a:solidFill></a:ln></c:spPr>`;
    plot += `<c:catAx><c:axId val="51600001"/><c:scaling><c:orientation val="${horiz ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axisLine}${txPr(e.size, false, ink, true)}<c:crossAx val="51600002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:tickLblSkip val="1"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
    plot += `<c:valAx><c:axId val="51600002"/><c:scaling><c:orientation val="minMax"/><c:max val="${plan.hi}"/><c:min val="${plan.lo}"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'b' : 'l'}"/>${grid}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(e.size)}<c:crossAx val="51600001"/><c:crosses val="${horiz ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/><c:majorUnit val="${plan.step}"/></c:valAx>`;
  }
  // The title centred at the top, where the app writes it (its width as the font's letters are wide on average).
  const tw = Math.min(plan.w, e.title ? e.title.length * e.size * 1.2 * 0.6 : 0);
  const titleAt = `<c:layout><c:manualLayout><c:xMode val="edge"/><c:yMode val="edge"/><c:x val="${f(Math.max(0, (plan.w - tw) / 2 - e.size * 0.3) / plan.w)}"/><c:y val="0"/></c:manualLayout></c:layout>`;
  const title = e.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz(e.size * 1.2)}" b="1"/></a:pPr><a:r><a:rPr ${langAttrs(e.title)} sz="${sz(e.size * 1.2)}" b="1" kern="100"><a:solidFill><a:srgbClr val="${hexColor('head', t).hex}"/></a:solidFill>${fonts}</a:rPr><a:t>${esc(e.title)}</a:t></a:r></a:p></c:rich></c:tx>${titleAt}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';
  const legend = plan.legend ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(e.size)}</c:legend>` : '';
  const data = book ? `<c:externalData r:id="${book}"><c:autoUpdate val="0"/></c:externalData>` : '';
  return `${XML_HEAD}<c:chartSpace ${C}><c:date1904 val="0"/><c:lang val="en-US"/><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea>${layout}${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(e.size)}${data}</c:chartSpace>`;
}

/** A chart's numbers as the workbook PowerPoint keeps beside it (Sheet1: its labels down column A, a column per series), for Edit Data. */
export function chartBook(e: ChartEl): Buffer {
  const pie = e.kind === 'pie' || e.kind === 'doughnut';
  const series = pie ? e.series.slice(0, 1) : e.series;
  const str = (ref: string, v: string) => `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  const rows = [`<row r="1">${series.map((s, si) => str(`${col(si + 1)}1`, s.name)).join('')}</row>`];
  e.labels.forEach((l, i) => {
    rows.push(`<row r="${i + 2}">${str(`A${i + 2}`, l)}${series.map((s, si) => `<c r="${col(si + 1)}${i + 2}"><v>${Number.isFinite(s.values[i]) ? s.values[i] : 0}</v></c>`).join('')}</row>`);
  });
  const SML = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return zipParts([
    {
      name: '[Content_Types].xml',
      data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    },
    { name: '_rels/.rels', data: relsXml([['rId1', 'officeDocument', 'xl/workbook.xml']]) },
    { name: 'xl/workbook.xml', data: `${XML_HEAD}<workbook xmlns="${SML}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: relsXml([['rId1', 'worksheet', 'worksheets/sheet1.xml']]) },
    { name: 'xl/worksheets/sheet1.xml', data: `${XML_HEAD}<worksheet xmlns="${SML}"><sheetData>${rows.join('')}</sheetData></worksheet>` },
  ]);
}

function chartFrame(c: Ctx, e: ChartEl): string {
  const rid = c.charts.add((book) => chartXml(e, c.t, book), chartBook(e));
  const { cNvPr } = nvPr(c, e, 'Chart');
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr}<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.w)}" cy="${emu(e.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}

// ---- animations -----------------------------------------------------------------------------------------

/** PowerPoint's number and options for each effect, as its animation pane names them. */
const PRESET: Record<string, { id: number; sub?: (dir?: string) => number }> = {
  appear: { id: 1 },
  fade: { id: 10 },
  fly: { id: 2, sub: (d) => (d === 'left' ? 8 : d === 'right' ? 2 : d === 'up' ? 1 : 4) },
  float: { id: 42 },
  zoom: { id: 53, sub: () => 16 },
  wipe: { id: 22, sub: (d) => (d === 'left' ? 8 : d === 'right' ? 2 : d === 'up' ? 1 : 4) },
  bounce: { id: 26 },
  pulse: { id: 26 },
  spin: { id: 8 },
  grow: { id: 6 },
  shake: { id: 32 },
};

function timingXml(c: Ctx, s: Slide): string {
  const anims = (s.anims ?? []).filter((a) => c.ids.has(a.el));
  if (!anims.length && !c.played.length) return '';
  let cid = 2;
  const nextId = () => ++cid;
  // Each animation (or each paragraph of one), with its click group and trigger time, as the player plays them.
  interface Item {
    a: Anim;
    para?: number;
    on: Anim['on'];
    group: number;
    begin: number;
    end: number;
  }
  const items: Item[] = [];
  const auto = anims.length > 0 && anims[0].on !== 'click';
  let group = 0;
  let prev: Item | null = null;
  for (const a of anims) {
    const el = s.els.find((e) => e.id === a.el);
    const paras =
      a.byPara && el && (el.type === 'text' || el.type === 'shape')
        ? el.paras.map((p, i) => (p.runs.some((r) => r.t) ? i : -1)).filter((i) => i >= 0)
        : [undefined];
    paras.forEach((para, k) => {
      const on: Anim['on'] = k === 0 ? a.on : a.on === 'click' ? 'click' : a.on;
      if (on === 'click') {
        group++;
        prev = null;
      }
      const p = prev as Item | null;
      const begin = !p ? 0 : on === 'after' ? p.end : p.begin;
      const it: Item = { a, para, on, group, begin, end: begin + a.delay + a.dur };
      items.push(it);
      prev = it;
    });
  }
  const groups = [...new Set(items.map((i) => i.group))].sort((x, y) => x - y);
  const grpIds = new Map<string, number>();
  const builds: string[] = [];
  const grpOf = (a: Anim) => {
    const key = `${a.el}:${a.type}:${a.id}`;
    if (!grpIds.has(key)) {
      const used = [...grpIds.keys()].filter((k) => k.startsWith(`${a.el}:`)).length;
      grpIds.set(key, used);
      const el = s.els.find((e) => e.id === a.el);
      if (el && (el.type === 'text' || el.type === 'shape')) builds.push(`<p:bldP spid="${c.ids.get(a.el)}" grpId="${used}"${a.byPara ? ' build="p"' : ''} animBg="1"/>`);
    }
    return grpIds.get(key)!;
  };
  const tgt = (it: Item) => `<p:tgtEl><p:spTgt spid="${c.ids.get(it.a.el)}">${it.para !== undefined ? `<p:txEl><p:pRg st="${it.para}" end="${it.para}"/></p:txEl>` : ''}</p:spTgt></p:tgtEl>`;
  const set = (it: Item, to: 'visible' | 'hidden', at = 0) =>
    `<p:set><p:cBhvr><p:cTn id="${nextId()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="${at}"/></p:stCondLst></p:cTn>${tgt(it)}<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="${to}"/></p:to></p:set>`;
  const anim = (it: Item, attr: string, from: string, to: string, dur: number) =>
    `<p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt(it)}<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val>${from}</p:val></p:tav><p:tav tm="100000"><p:val>${to}</p:val></p:tav></p:tavLst></p:anim>`;
  const str = (v: string) => `<p:strVal val="${v}"/>`;
  const fade = (it: Item, dir: 'in' | 'out', dur: number) => `<p:animEffect transition="${dir}" filter="fade"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${tgt(it)}</p:cBhvr></p:animEffect>`;
  const behaviours = (it: Item): string => {
    const a = it.a;
    const dur = Math.max(1, Math.round(a.dur));
    const d = a.dir ?? 'left';
    if (a.type === 'em') {
      if (a.fx === 'spin') return `<p:animRot by="21600000"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt(it)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
      if (a.fx === 'grow') return `<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}" fill="hold"/>${tgt(it)}</p:cBhvr><p:by x="120000" y="120000"/></p:animScale>`;
      if (a.fx === 'shake') return `<p:animRot by="300000"><p:cBhvr><p:cTn id="${nextId()}" dur="${Math.max(1, Math.round(dur / 6))}" autoRev="1" repeatCount="3000" fill="hold"/>${tgt(it)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot>`;
      return `<p:animScale><p:cBhvr><p:cTn id="${nextId()}" dur="${Math.max(1, Math.round(dur / 4))}" autoRev="1" repeatCount="2000" fill="hold"/>${tgt(it)}</p:cBhvr><p:by x="110000" y="110000"/></p:animScale>`;
    }
    const inn = a.type === 'in';
    const offX = d === 'left' ? '0-#ppt_w/2' : d === 'right' ? '1+#ppt_w/2' : '#ppt_x';
    const offY = d === 'up' ? '0-#ppt_h/2' : d === 'down' ? '1+#ppt_h/2' : '#ppt_y';
    const move = (fromX: string, fromY: string) => (inn ? anim(it, 'ppt_x', str(fromX), str('#ppt_x'), dur) + anim(it, 'ppt_y', str(fromY), str('#ppt_y'), dur) : anim(it, 'ppt_x', str('#ppt_x'), str(fromX), dur) + anim(it, 'ppt_y', str('#ppt_y'), str(fromY), dur));
    let body = '';
    switch (a.fx) {
      case 'appear':
        return inn ? set(it, 'visible') : set(it, 'hidden');
      case 'fade':
        body = fade(it, inn ? 'in' : 'out', dur);
        break;
      case 'fly':
        body = move(offX, offY);
        break;
      case 'bounce':
        body = move('#ppt_x', '0-#ppt_h/2');
        break;
      case 'float': {
        const fx = d === 'left' ? '#ppt_x-.1' : d === 'right' ? '#ppt_x+.1' : '#ppt_x';
        const fy = d === 'down' ? '#ppt_y-.1' : d === 'up' ? '#ppt_y+.1' : '#ppt_y';
        body = fade(it, inn ? 'in' : 'out', dur) + move(fx, fy);
        break;
      }
      case 'zoom':
        body = inn
          ? anim(it, 'ppt_w', '<p:fltVal val="0"/>', str('#ppt_w'), dur) + anim(it, 'ppt_h', '<p:fltVal val="0"/>', str('#ppt_h'), dur) + fade(it, 'in', dur)
          : anim(it, 'ppt_w', str('#ppt_w'), '<p:fltVal val="0"/>', dur) + anim(it, 'ppt_h', str('#ppt_h'), '<p:fltVal val="0"/>', dur) + fade(it, 'out', dur);
        break;
      case 'wipe': {
        const f = d === 'left' ? 'left' : d === 'right' ? 'right' : d === 'up' ? 'up' : 'down';
        body = `<p:animEffect transition="${inn ? 'in' : 'out'}" filter="wipe(${f})"><p:cBhvr><p:cTn id="${nextId()}" dur="${dur}"/>${tgt(it)}</p:cBhvr></p:animEffect>`;
        break;
      }
      default:
        body = fade(it, inn ? 'in' : 'out', dur);
    }
    return inn ? set(it, 'visible') + body : body + set(it, 'hidden', Math.max(0, dur - 1));
  };
  const effect = (it: Item, first: boolean) => {
    const a = it.a;
    const p = PRESET[a.fx] ?? PRESET.fade;
    const cls = a.type === 'in' ? 'entr' : a.type === 'out' ? 'exit' : 'emph';
    const node = it.on === 'click' && first ? 'clickEffect' : it.on === 'after' ? 'afterEffect' : 'withEffect';
    const id = nextId();
    return `<p:par><p:cTn id="${id}" presetID="${p.id}" presetClass="${cls}" presetSubtype="${p.sub ? p.sub(a.dir) : 0}" fill="hold" grpId="${grpOf(a)}" nodeType="${node}"><p:stCondLst><p:cond delay="${Math.round(a.delay)}"/></p:stCondLst><p:childTnLst>${behaviours(it)}</p:childTnLst></p:cTn></p:par>`;
  };
  const pars = groups
    .map((g) => {
      const list = items.filter((i) => i.group === g);
      const begins = [...new Set(list.map((i) => i.begin))].sort((x, y) => x - y);
      const outerId = nextId();
      const start = g === 0 && auto ? '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>' : '<p:cond delay="indefinite"/>';
      const inner = begins
        .map((b) => {
          const id = nextId();
          const effects = list.filter((i) => i.begin === b).map((i) => effect(i, i === list[0])).join('');
          return `<p:par><p:cTn id="${id}" fill="hold"><p:stCondLst><p:cond delay="${Math.round(b)}"/></p:stCondLst><p:childTnLst>${effects}</p:childTnLst></p:cTn></p:par>`;
        })
        .join('');
      return `<p:par><p:cTn id="${outerId}" fill="hold"><p:stCondLst>${start}</p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`;
    })
    .join('');
  const seq = anims.length
    ? `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${pars}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>`
    : '';
  // Each video in the file, played on a click on it (its sound off, or again and again, as the deck says).
  const media = c.played
    .map(
      (m) =>
        `<p:video><p:cMediaNode vol="80000"${m.muted ? ' mute="1"' : ''}><p:cTn id="${nextId()}"${m.loop ? ' repeatCount="indefinite"' : ''} fill="hold" display="0"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${m.id}"/></p:tgtEl></p:cMediaNode></p:video>`,
    )
    .join('');
  const tree = `<p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>${seq}${media}</p:childTnLst></p:cTn></p:par></p:tnLst>`;
  return `<p:timing>${tree}${builds.length ? `<p:bldLst>${builds.join('')}</p:bldLst>` : ''}</p:timing>`;
}

function transitionXml(s: Slide): string {
  const t = s.transition;
  if (!t || (t.fx === 'none' && !t.auto)) return '';
  const dur = t.dur ?? 600;
  const spd = dur <= 450 ? 'fast' : dur <= 900 ? 'med' : 'slow';
  const adv = t.auto ? ` advTm="${Math.round(t.auto * 1000)}"` : '';
  // Morph is PowerPoint's since 2016: older programs and other apps take the fade beside it.
  if (t.fx === 'morph')
    return `<mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" Requires="p159"><p:transition spd="slow" p14:dur="${Math.round(dur)}"${adv}><p159:morph option="byObject"/></p:transition></mc:Choice><mc:Fallback><p:transition spd="${spd}"${adv}><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>`;
  // The side it comes from, as the way it moves.
  const dir = t.dir === 'left' ? 'r' : t.dir === 'up' ? 'd' : t.dir === 'down' ? 'u' : 'l';
  const fx: Record<string, string> = {
    fade: '<p:fade/>',
    push: `<p:push dir="${dir}"/>`,
    wipe: `<p:wipe dir="${dir}"/>`,
    cover: `<p:cover dir="${dir}"/>`,
    zoom: '<p:zoom/>',
    split: '<p:split orient="vert" dir="out"/>',
  };
  return `<p:transition spd="${spd}"${adv}>${fx[t.fx] ?? ''}</p:transition>`;
}

// ---- the slide ------------------------------------------------------------------------------------------

function bgXml(c: Ctx, s: Slide): { bg: string; under: string } {
  const t = c.t;
  const b = s.bg ?? {};
  let fill = fillXml(b.color ?? 'bg', t);
  if (b.color && b.to) fill = `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${clr(b.color, t, '#ffffff')}</a:gs><a:gs pos="100000">${clr(b.to, t, '#ffffff')}</a:gs></a:gsLst><a:lin ang="${linAng(b.angle ?? 180)}" scaled="0"/></a:gradFill>`;
  let under = '';
  const pic = b.image ? c.o.picture(b.image) : null;
  if (pic) {
    const rid = c.media.add(pic);
    const W = 1280;
    const H = slideH(c.deck.ratio);
    const k = Math.max(W / pic.w, H / pic.h);
    const cw = (pic.w - W / k) / 2 / pic.w;
    const ch = (pic.h - H / k) / 2 / pic.h;
    const v = (f: number) => Math.round(Math.max(0, f) * 100000);
    fill = `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/><a:srcRect l="${v(cw)}" t="${v(ch)}" r="${v(cw)}" b="${v(ch)}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`;
    if (b.dim) {
      const id = c.next++;
      under = `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shade"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, W, H)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="000000"><a:alpha val="${Math.round(b.dim * 100000)}"/></a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
    }
  }
  return { bg: `<p:bg><p:bgPr>${fill}<a:effectLst/></p:bgPr></p:bg>`, under };
}

function slideXml(c: Ctx, s: Slide): string {
  const { bg, under } = bgXml(c, s);
  // Connectors' ends: the parts they are stuck to by their ids in the file, written by now, at the sites PowerPoint knows.
  const all = everyEl(s.els);
  const parts = (s.els.map((e) => partXml(c, e)).join('') + footerXml(c, c.n - 1)).replace(/@@(stCxn|endCxn)\|([A-Za-z0-9_-]+)\|([trbl])@@/g, (_m, tag: string, el: string, at: Side) => {
    const id = c.ids.get(el);
    const site = siteOf(all.find((x) => x.id === el), at);
    return id !== undefined && site !== null ? `<a:${tag} id="${id}" idx="${site}"/>` : '';
  });
  const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  return `${XML_HEAD}<p:sld ${NS}${s.hidden ? ' show="0"' : ''}><p:cSld>${bg}<p:spTree>${grp}${under}${parts}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(s)}${timingXml(c, s)}</p:sld>`;
}

/**
 * The names that tie each part to its match across a Morph (PowerPoint pairs shapes named "!!" alike): a part and its
 * copy on the slide before share a key (or one's key is the other's id).
 */
function morphNames(d: Deck): Map<string, string> {
  const out = new Map<string, string>();
  const mk = (e: El) => e.key ?? e.id;
  d.slides.forEach((s, i) => {
    if (s.transition?.fx !== 'morph' || i === 0) return;
    const before = d.slides[i - 1].els;
    const usedA = new Set<string>();
    const usedB = new Set<string>();
    for (const e of s.els) {
      const k = mk(e);
      const m = before.find((x) => mk(x) === k && !usedA.has(x.id));
      if (!m || usedB.has(k)) continue;
      usedA.add(m.id);
      usedB.add(k);
      out.set(m.id, `!!${k}`);
      out.set(e.id, `!!${k}`);
    }
  });
  return out;
}

// ---- comments ---------------------------------------------------------------------------------------------

/** Where a part's top-right corner shows on the slide, through the groups around it (unturned): for its comment's mark. */
function cornerOf(els: El[], id: string, dx = 0, dy = 0): { x: number; y: number } | null {
  for (const e of els) {
    if (e.id === id) return { x: dx + Math.max(e.x, e.x + e.w), y: dy + Math.min(e.y, e.y + (e.type === 'line' ? e.h : 0)) };
    if (e.type === 'group') {
      const got = cornerOf(e.els, id, dx + e.x, dy + e.y);
      if (got) return got;
    }
  }
  return null;
}

/**
 * A slide's open comments as PowerPoint's own: each a comment by You (author 0) or Agent (1), its replies comments
 * threaded to it, at its part's corner or its place on the slide (in master units, 576 an inch: 6 a pixel); null when it
 * has none open. `last` counts each author's comments across the deck (PowerPoint numbers them so).
 */
function commentsXml(s: Slide, last: [number, number]): string | null {
  const open = (s.comments ?? []).filter((c) => !c.resolved);
  if (!open.length) return null;
  const when = (at: number) => new Date(at).toISOString().slice(0, 23);
  const out: string[] = [];
  for (const c of open) {
    const a = c.by === 'agent' ? 1 : 0;
    const idx = ++last[a];
    const at = (c.el ? cornerOf(s.els, c.el) : null) ?? { x: c.x ?? 1240, y: c.y ?? 40 };
    const pos = `<p:pos x="${Math.round(Math.max(0, at.x) * 6)}" y="${Math.round(Math.max(0, at.y) * 6)}"/>`;
    out.push(`<p:cm authorId="${a}" dt="${when(c.at)}" idx="${idx}">${pos}<p:text>${esc(c.text)}</p:text></p:cm>`);
    for (const r of c.replies ?? []) {
      const ra = r.by === 'agent' ? 1 : 0;
      out.push(
        `<p:cm authorId="${ra}" dt="${when(r.at)}" idx="${++last[ra]}">${pos}<p:text>${esc(r.text)}</p:text><p:extLst><p:ext uri="{C676402C-5697-4E1C-873F-D02D1690AC5C}"><p15:threadingInfo xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main" timeZoneBias="0"><p15:parentCm authorId="${a}" idx="${idx}"/></p15:threadingInfo></p:ext></p:extLst></p:cm>`,
      );
    }
  }
  return `${XML_HEAD}<p:cmLst ${NS}>${out.join('')}</p:cmLst>`;
}

function notesXml(text: string): string {
  const paras = text
    .split('\n')
    .map((l) => `<a:p>${l ? `<a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(l)}</a:t></a:r>` : '<a:endParaRPr lang="en-US" dirty="0"/>'}</a:p>`)
    .join('');
  return `${XML_HEAD}<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`;
}

// ---- the file's frame: theme, master, layout ------------------------------------------------------------

function themeXml(name: string, t: Theme | null): string {
  const hex = (c: string, def: string) => (t ? hexColor(c, t).hex : def);
  const office = ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
  const accents = Array.from({ length: 6 }, (_, i) => `<a:accent${i + 1}><a:srgbClr val="${t ? hexColor(`c${i + 1}`, t).hex : office[i]}"/></a:accent${i + 1}>`).join('');
  const head = t ? officeFont(t.headFont) : 'Calibri Light';
  const body = t ? officeFont(t.font) : 'Calibri';
  // Its heading and body fonts, with what a computer without them picks the closest by; East Asian and complex
  // scripts in Office's own fonts for them (what PowerPoint shows Chinese, Japanese, Korean, Arabic, Hebrew and Thai in).
  const scripts = (major: boolean) =>
    [
      ['Jpan', '游ゴシック'],
      ['Hang', '맑은 고딕'],
      ['Hans', '等线'],
      ['Hant', '新細明體'],
      ['Arab', major ? 'Times New Roman' : 'Arial'],
      ['Hebr', major ? 'Times New Roman' : 'Arial'],
      ['Thai', major ? 'Angsana New' : 'Cordia New'],
    ]
      .map(([s, f]) => `<a:font script="${s}" typeface="${f}"/>`)
      .join('');
  const fontSet = (name: string, major: boolean) => `<a:latin typeface="${esc(name)}"${fontAttrs(name)}/><a:ea typeface=""/><a:cs typeface=""/>${scripts(major)}`;
  const sch = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return `${XML_HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}"><a:dk1><a:srgbClr val="${hex('fg', '000000')}"/></a:dk1><a:lt1><a:srgbClr val="${hex('bg', 'FFFFFF')}"/></a:lt1><a:dk2><a:srgbClr val="${hex('head', '44546A')}"/></a:dk2><a:lt2><a:srgbClr val="${hex('soft', 'E7E6E6')}"/></a:lt2>${accents}<a:hlink><a:srgbClr val="${hex('accent', '0563C1')}"/></a:hlink><a:folHlink><a:srgbClr val="${hex('muted', '954F72')}"/></a:folHlink></a:clrScheme><a:fontScheme name="${esc(name)}"><a:majorFont>${fontSet(head, true)}</a:majorFont><a:minorFont>${fontSet(body, false)}</a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${sch}${sch}${sch}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const GRP = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

function masterXml(t: Theme): string {
  const lvl = (n: number, size: number, font: string, extra = '') =>
    `<a:lvl${n}pPr marL="0" indent="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:buNone/><a:defRPr sz="${size}" kern="1200"${extra}><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="${font}"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl${n}pPr>`;
  const title = `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(80, 52, 1120, 100)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit the title</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp>`;
  const body = `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr>${xfrm(80, 196, 1120, 470)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit the text</a:t></a:r></a:p></p:txBody></p:sp>`;
  return `${XML_HEAD}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr>${fillXml('bg', t)}<a:effectLst/></p:bgPr></p:bg><p:spTree>${GRP}${title}${body}</p:spTree></p:cSld>${CLR_MAP}<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle>${lvl(1, 3450, '+mj-lt', ' b="1"')}</p:titleStyle><p:bodyStyle>${lvl(1, 1950, '+mn-lt')}${lvl(2, 1800, '+mn-lt')}${lvl(3, 1650, '+mn-lt')}</p:bodyStyle><p:otherStyle>${lvl(1, 1800, '+mn-lt')}</p:otherStyle></p:txStyles></p:sldMaster>`;
}

function layoutXml(): string {
  return `${XML_HEAD}<p:sldLayout ${NS} type="titleOnly" preserve="1"><p:cSld name="Title Only"><p:spTree>${GRP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Click to edit the title</a:t></a:r><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
}

function notesMasterXml(): string {
  return `${XML_HEAD}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree>${GRP}<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit the notes</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>${CLR_MAP}<p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
}

// ---- the whole file -------------------------------------------------------------------------------------

/** The deck as a .pptx file. */
export function pptxFile(deck: Deck, o: PptxOpts): Buffer {
  const t = deck.theme;
  const H = slideH(deck.ratio);
  const parts: ZipPart[] = [];
  const media: { name: string; key: Buffer }[] = [];
  const movies: { name: string; key: Buffer }[] = [];
  let chartN = 0;
  const charts: { name: string; xml: string; book: Buffer }[] = [];
  const hasNotes = deck.slides.some((s) => s.notes);
  const morph = morphNames(deck);
  // Comments: each author's count across the deck, and each slide's comments file.
  const cmLast: [number, number] = [0, 0];
  const slides = deck.slides.map((s, i) => {
    const rels = new Rels();
    rels.add('slideLayout', '../slideLayouts/slideLayout1.xml');
    const c: Ctx = {
      deck,
      t,
      o,
      rels,
      media: {
        add(p) {
          let m = media.find((x) => x.key.equals(p.data));
          if (!m) {
            m = { name: `image${media.length + 1}.${p.ext}`, key: p.data };
            media.push(m);
          }
          return rels.add('image', `../media/${m.name}`);
        },
      },
      charts: {
        add(xml, book) {
          const name = `chart${++chartN}.xml`;
          // Its workbook is its only relationship.
          charts.push({ name, xml: xml('rId1'), book });
          return rels.add('chart', `../charts/${name}`);
        },
      },
      movies: {
        // Once each, however many slides show it.
        add(v) {
          let m = movies.find((x) => x.key.equals(v.data));
          if (!m) {
            m = { name: `media${movies.length + 1}.${v.ext}`, key: v.data };
            movies.push(m);
          }
          return m.name;
        },
      },
      played: [],
      slideFile: (n) => (n >= 1 && n <= deck.slides.length ? `slide${n}.xml` : null),
      ids: new Map(),
      next: 2,
      titled: false,
      n: i + 1,
      depth: 0,
      morph,
    };
    const xml = slideXml(c, s);
    if (s.notes) rels.add('notesSlide', `../notesSlides/notesSlide${i + 1}.xml`);
    const comments = commentsXml(s, cmLast);
    if (comments) rels.add('comments', `../comments/comment${i + 1}.xml`);
    return { xml, rels, notes: s.notes, n: i + 1, comments };
  });
  const hasComments = slides.some((s) => s.comments);
  // The faces of its fonts it carries, each as Embedded OpenType (as PowerPoint reads a font kept in a file), by family.
  const SLOTS = ['regular', 'bold', 'italic', 'boldItalic'];
  const fonts: { family: string; slot: number; name: string; data: Buffer }[] = [];
  for (const [key, ttf] of o.fonts ?? []) {
    const [family, b, i] = key.split('|');
    const eot = family ? eotOf(ttf) : null;
    if (eot) fonts.push({ family, slot: (b === '1' ? 1 : 0) + (i === '1' ? 2 : 0), name: `font${fonts.length + 1}.fntdata`, data: eot });
  }

  const types = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Default Extension="gif" ContentType="image/gif"/>',
    '<Default Extension="webp" ContentType="image/webp"/>',
    '<Default Extension="svg" ContentType="image/svg+xml"/>',
    '<Default Extension="mp4" ContentType="video/mp4"/>',
    '<Default Extension="mov" ContentType="video/quicktime"/>',
    '<Default Extension="webm" ContentType="video/webm"/>',
    ...(fonts.length ? ['<Default Extension="fntdata" ContentType="application/x-fontdata"/>'] : []),
    ...(charts.length ? ['<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>'] : []),
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ...slides.map((s) => `<Override PartName="/ppt/slides/slide${s.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`),
    ...charts.map((c) => `<Override PartName="/ppt/charts/${c.name}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`),
    ...(hasComments
      ? [
          '<Override PartName="/ppt/commentAuthors.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.commentAuthors+xml"/>',
          ...slides.filter((s) => s.comments).map((s) => `<Override PartName="/ppt/comments/comment${s.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.comments+xml"/>`),
        ]
      : []),
    ...(hasNotes
      ? [
          '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
          '<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
          ...slides.filter((s) => s.notes).map((s) => `<Override PartName="/ppt/notesSlides/notesSlide${s.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`),
        ]
      : []),
  ];
  parts.push({ name: '[Content_Types].xml', data: `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types.join('')}</Types>` });
  parts.push({
    name: '_rels/.rels',
    data: relsXml([
      ['rId1', 'officeDocument', 'ppt/presentation.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', 'extended-properties', 'docProps/app.xml'],
    ]),
  });
  parts.push({ name: 'docProps/core.xml', data: coreXml(o.title) });
  parts.push({
    name: 'docProps/app.xml',
    data: `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Hydor</Application><PresentationFormat>${deck.ratio === '4:3' ? 'Custom' : 'Widescreen'}</PresentationFormat><Slides>${slides.length}</Slides><Notes>${slides.filter((s) => s.notes).length}</Notes></Properties>`,
  });

  const presRels = new Rels();
  presRels.add('slideMaster', 'slideMasters/slideMaster1.xml');
  const sldIds = slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="${presRels.add('slide', `slides/slide${s.n}.xml`)}"/>`).join('');
  const notesMasterId = hasNotes ? presRels.add('notesMaster', 'notesMasters/notesMaster1.xml') : '';
  presRels.add('presProps', 'presProps.xml');
  presRels.add('viewProps', 'viewProps.xml');
  presRels.add('theme', 'theme/theme1.xml');
  presRels.add('tableStyles', 'tableStyles.xml');
  const fontIds = fonts.map((f) => presRels.add('font', `fonts/${f.name}`));
  const families = [...new Set(fonts.map((f) => f.family))];
  const embedded = families
    .map((fam) => {
      const faces = SLOTS.map((slot, n) => {
        const k = fonts.findIndex((f) => f.family === fam && f.slot === n);
        return k >= 0 ? `<p:${slot} r:id="${fontIds[k]}"/>` : '';
      }).join('');
      return `<p:embeddedFont><p:font typeface="${esc(fam)}"${fontAttrs(fam)}/>${faces}</p:embeddedFont>`;
    })
    .join('');
  if (hasComments) presRels.add('commentAuthors', 'commentAuthors.xml');
  const cy = emu(H);
  parts.push({
    name: 'ppt/presentation.xml',
    data: `${XML_HEAD}<p:presentation ${NS}${fonts.length ? ' embedTrueTypeFonts="1"' : ''}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterId}"/></p:notesMasterIdLst>` : ''}<p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/>${embedded ? `<p:embeddedFontLst>${embedded}</p:embeddedFontLst>` : ''}<p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`,
  });
  parts.push({ name: 'ppt/_rels/presentation.xml.rels', data: relsXml(presRels.list) });
  parts.push({ name: 'ppt/presProps.xml', data: `${XML_HEAD}<p:presentationPr ${NS}/>` });
  parts.push({ name: 'ppt/viewProps.xml', data: `${XML_HEAD}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` });
  parts.push({ name: 'ppt/tableStyles.xml', data: `${XML_HEAD}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` });
  parts.push({ name: 'ppt/theme/theme1.xml', data: themeXml(t.id ? `Hydor ${t.id}` : 'Hydor', t) });
  parts.push({ name: 'ppt/slideMasters/slideMaster1.xml', data: masterXml(t) });
  parts.push({
    name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    data: relsXml([
      ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['rId2', 'theme', '../theme/theme1.xml'],
    ]),
  });
  parts.push({ name: 'ppt/slideLayouts/slideLayout1.xml', data: layoutXml() });
  parts.push({ name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: relsXml([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) });
  for (const s of slides) {
    parts.push({ name: `ppt/slides/slide${s.n}.xml`, data: s.xml });
    parts.push({ name: `ppt/slides/_rels/slide${s.n}.xml.rels`, data: relsXml(s.rels.list) });
    if (s.notes) {
      parts.push({ name: `ppt/notesSlides/notesSlide${s.n}.xml`, data: notesXml(s.notes) });
      parts.push({
        name: `ppt/notesSlides/_rels/notesSlide${s.n}.xml.rels`,
        data: relsXml([
          ['rId1', 'notesMaster', '../notesMasters/notesMaster1.xml'],
          ['rId2', 'slide', `../slides/slide${s.n}.xml`],
        ]),
      });
    }
  }
  if (hasNotes) {
    parts.push({ name: 'ppt/notesMasters/notesMaster1.xml', data: notesMasterXml() });
    parts.push({ name: 'ppt/notesMasters/_rels/notesMaster1.xml.rels', data: relsXml([['rId1', 'theme', '../theme/theme2.xml']]) });
    parts.push({ name: 'ppt/theme/theme2.xml', data: themeXml('Office', null) });
  }
  for (const [i, c] of charts.entries()) {
    parts.push({ name: `ppt/charts/${c.name}`, data: c.xml });
    parts.push({ name: `ppt/charts/_rels/${c.name}.rels`, data: relsXml([['rId1', 'package', `../embeddings/Microsoft_Excel_Worksheet${i + 1}.xlsx`]]) });
    parts.push({ name: `ppt/embeddings/Microsoft_Excel_Worksheet${i + 1}.xlsx`, data: c.book });
  }
  if (hasComments) {
    parts.push({
      name: 'ppt/commentAuthors.xml',
      data: `${XML_HEAD}<p:cmAuthorLst ${NS}><p:cmAuthor id="0" name="You" initials="Y" lastIdx="${cmLast[0]}" clrIdx="0"/><p:cmAuthor id="1" name="Agent" initials="A" lastIdx="${cmLast[1]}" clrIdx="1"/></p:cmAuthorLst>`,
    });
    for (const s of slides) if (s.comments) parts.push({ name: `ppt/comments/comment${s.n}.xml`, data: s.comments });
  }
  for (const m of media) parts.push({ name: `ppt/media/${m.name}`, data: m.key });
  for (const m of movies) parts.push({ name: `ppt/media/${m.name}`, data: m.key });
  for (const f of fonts) parts.push({ name: `ppt/fonts/${f.name}`, data: f.data });
  return zipParts(parts);
}

/** The words of a deck, a slide at a time (for a test, or an agent's check). */
export const deckWords = (deck: Deck) => deck.slides.map((s) => s.els.flatMap((e) => (e.type === 'text' || e.type === 'shape' ? [plainText(e.paras)] : [])).join(' | '));
