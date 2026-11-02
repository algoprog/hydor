// A slide deck as a PowerPoint file (.pptx), written from the deck itself: each part a shape of its own that
// stays editable in PowerPoint, Keynote, Google Slides and LibreOffice. Text boxes and shapes with their words
// (paragraphs, bullets and numbers, runs' bold, colours, fonts and links), pictures (cropped as they show),
// lines and arrows, tables, and charts as real charts with their numbers; the slide's background, its title as
// the slide's title, speaker notes, the transition and the animations in their order (on a click, with or after
// the one before, a paragraph at a time). The theme's colours and fonts become the file's theme.
//
// A slide is 1280 px wide: 1 px is 9525 EMU (12192000 across, PowerPoint's widescreen) and a font's px is 0.75 pt.
import type { Anim, ChartEl, Deck, El, ImageEl, LineEl, Para, Run, Slide, TableEl, TextProps, Theme } from '../../shared/slides.ts';
import { fontName, FONTS, hexColor, mixColor, plainText, slideH } from '../../shared/slides.ts';
import { coreXml, esc, relsXml, XML_HEAD, zipParts, type ZipPart } from './ooxml.ts';

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
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const E = 9525;
const emu = (px: number) => Math.round(px * E);
const sz = (px: number) => Math.max(100, Math.min(400000, Math.round(px * 75)));

/** An Office font name for one of the deck's (PowerPoint keeps it; a device without it shows a close one). */
const officeFont = (name: string) => FONTS.find((f) => f.name === name)?.office ?? name;

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
  media: { add(p: Picture): string };
  charts: { add(xml: string): string };
  /** Slide files by the deck's slide number, for links between slides. */
  slideFile: (n: number) => string | null;
  ids: Map<string, number>;
  next: number;
  titled: boolean;
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

function runXml(c: Ctx, r: Run, e: TextProps, scale: number, extraOpacity: number): string {
  const size = (r.size ?? e.size) * scale;
  const b = r.b ?? !!e.bold;
  const i = r.i ?? !!e.italic;
  const attrs = [`lang="en-US"`, `sz="${sz(size)}"`, b ? 'b="1"' : 'b="0"', i ? 'i="1"' : 'i="0"', r.u ? 'u="sng"' : '', r.s ? 'strike="sngStrike"' : '', r.sup ? 'baseline="30000"' : r.sub ? 'baseline="-25000"' : '', 'dirty="0"']
    .filter(Boolean)
    .join(' ');
  const base = e.color ?? (e.role === 'title' || e.role === 'quote' ? 'head' : e.role === 'subtitle' || e.role === 'caption' ? 'muted' : 'fg');
  const fill = `<a:solidFill>${clr(r.color ?? base, c.t, '#000000', extraOpacity)}</a:solidFill>`;
  const hl = r.hl ? `<a:highlight>${clr(r.hl, c.t, '#ffff00')}</a:highlight>` : '';
  const face = officeFont(fontName(r.font ?? e.font, c.t, e.role));
  const latin = `<a:latin typeface="${esc(face)}"/><a:cs typeface="${esc(face)}"/>`;
  const lines = r.t.split('\n');
  const rPr = (inner: string) => `<a:rPr ${attrs}>${fill}${hl}${latin}${inner}</a:rPr>`;
  return lines
    .map((line, k) => `${k ? `<a:br>${rPr('')}</a:br>` : ''}${line ? `<a:r>${rPr(link(c, r.link))}<a:t>${esc(line)}</a:t></a:r>` : ''}`)
    .join('');
}

const BULLET = ['•', '◦', '▪', '•', '◦'];
const NUMBER = ['arabicPeriod', 'alphaLcPeriod', 'romanLcPeriod', 'arabicPeriod', 'alphaLcPeriod'];

function paraXml(c: Ctx, p: Para, e: TextProps, scale: number, last: boolean, opacity: number): string {
  const first = p.runs.find((r) => r.t)?.size ?? p.runs[0]?.size ?? e.size;
  const em = first * scale;
  const lvl = Math.max(0, Math.min(4, p.lvl ?? 0));
  const align = p.align ?? e.align ?? 'left';
  const algn = align === 'center' ? 'ctr' : align === 'right' ? 'r' : align === 'justify' ? 'just' : 'l';
  const lh = e.lh ?? (e.role === 'title' ? 1.1 : 1.2);
  const lnSpc = `<a:lnSpc><a:spcPct val="${Math.round((lh / 1.2) * 100000)}"/></a:lnSpc>`;
  const gap = e.gap && !last ? `<a:spcAft><a:spcPts val="${Math.round(e.gap * scale * 75)}"/></a:spcAft>` : '<a:spcAft><a:spcPts val="0"/></a:spcAft>';
  let bu = '<a:buNone/>';
  let marL = emu(lvl * 1.5 * em);
  let indent = 0;
  if (p.list) {
    marL = emu((lvl * 1.5 + 1.25) * em);
    indent = -emu(1.25 * em);
    bu = p.list === 'bullet' ? `<a:buFont typeface="Arial"/><a:buChar char="${BULLET[lvl]}"/>` : `<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${NUMBER[lvl]}"/>`;
  }
  const runs = p.runs.map((r) => runXml(c, r, e, scale, opacity)).join('');
  const end = `<a:endParaRPr lang="en-US" sz="${sz(em)}" dirty="0"/>`;
  return `<a:p><a:pPr marL="${marL}" indent="${indent}" algn="${algn}"${lvl ? ` lvl="${lvl}"` : ''}>${lnSpc}<a:spcBef><a:spcPts val="0"/></a:spcBef>${gap}${bu}</a:pPr>${runs}${end}</a:p>`;
}

function txBody(c: Ctx, e: TextProps & { id: string }, opacity: number, tag = 'p:txBody'): string {
  const pad = emu(e.pad ?? 10);
  const anchor = e.valign === 'middle' ? 'ctr' : e.valign === 'bottom' ? 'b' : 't';
  const scale = c.o.scales?.get(e.id) ?? 1;
  const fit = e.fit === 'shrink' ? (scale < 0.999 ? `<a:normAutofit fontScale="${Math.round(scale * 100000)}"/>` : '<a:normAutofit/>') : '<a:noAutofit/>';
  const empty = !e.paras.some((p) => p.runs.some((r) => r.t));
  // The fitting is in fontScale; the sizes themselves stay the deck's.
  const paras = empty ? [{ runs: [{ t: '' }] }] : e.paras;
  return `<${tag}><a:bodyPr wrap="square" lIns="${pad}" tIns="${pad}" rIns="${pad}" bIns="${pad}" anchor="${anchor}" rtlCol="0">${fit}</a:bodyPr><a:lstStyle/>${paras.map((p, i) => paraXml(c, p, e, 1, i === paras.length - 1, opacity)).join('')}</${tag}>`;
}

// ---- parts ----------------------------------------------------------------------------------------------

const xfrm = (x: number, y: number, w: number, h: number, rot?: number, flip = '') =>
  `<a:xfrm${rot ? ` rot="${Math.round((((rot % 360) + 360) % 360) * 60000)}"` : ''}${flip}><a:off x="${emu(x)}" y="${emu(y)}"/><a:ext cx="${emu(Math.max(0, w))}" cy="${emu(Math.max(0, h))}"/></a:xfrm>`;

const SHADOW = '<a:effectLst><a:outerShdw blurRad="266700" dist="76200" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="24000"/></a:srgbClr></a:outerShdw></a:effectLst>';

function lnXml(color: string | undefined, w: number | undefined, dash: string | undefined, t: Theme, opacity: number): string {
  if (!color) return '<a:ln><a:noFill/></a:ln>';
  const d = dash === 'dash' ? '<a:prstDash val="dash"/>' : dash === 'dot' ? '<a:prstDash val="sysDot"/>' : '';
  return `<a:ln w="${emu(w ?? 2)}">${fillXml(color, t, opacity)}${d}</a:ln>`;
}

function nvPr(c: Ctx, e: El, kind: string): { id: number; cNvPr: string } {
  const id = c.next++;
  c.ids.set(e.id, id);
  const name = e.name ?? `${kind} ${id - 1}`;
  const descr = e.type === 'image' && e.alt ? ` descr="${esc(e.alt)}"` : '';
  const hl = link(c, e.link);
  return { id, cNvPr: hl ? `<p:cNvPr id="${id}" name="${esc(name)}"${descr}>${hl}</p:cNvPr>` : `<p:cNvPr id="${id}" name="${esc(name)}"${descr}/>` };
}

function boxXml(c: Ctx, e: Extract<El, { type: 'text' | 'shape' }>): string {
  const t = c.t;
  const kind = e.type === 'shape' ? e.shape : 'rect';
  const op = e.opacity ?? 1;
  const isTitle = e.type === 'text' && e.role === 'title' && !c.titled;
  if (isTitle) c.titled = true;
  const { cNvPr } = nvPr(c, e, isTitle ? 'Title' : e.type === 'shape' ? 'Shape' : 'Text');
  let prst = PRST[kind] ?? 'rect';
  let av = '<a:avLst/>';
  if (kind === 'round' || (kind === 'rect' && e.radius)) {
    prst = 'roundRect';
    const r = e.radius ?? Math.min(e.w, e.h) * 0.16;
    av = `<a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (r / Math.max(1, Math.min(e.w, e.h))) * 100000))}"/></a:avLst>`;
  }
  const fill =
    e.fill && e.fill2 && e.fill !== 'transparent'
      ? `<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0">${clr(e.fill, t, '#ffffff', op)}</a:gs><a:gs pos="100000">${clr(e.fill2, t, '#ffffff', op)}</a:gs></a:gsLst><a:lin ang="${linAng(e.angle ?? 180)}" scaled="0"/></a:gradFill>`
      : fillXml(e.fill, t, op);
  const nv = isTitle
    ? `<p:nvSpPr>${cNvPr}<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>`
    : `<p:nvSpPr>${cNvPr}<p:cNvSpPr${e.type === 'text' ? ' txBox="1"' : ''}/><p:nvPr/></p:nvSpPr>`;
  return `<p:sp>${nv}<p:spPr>${xfrm(e.x, e.y, e.w, e.h, e.rot)}<a:prstGeom prst="${prst}">${av}</a:prstGeom>${fill}${lnXml(e.line, e.lineW, e.dash, t, op)}${e.shadow ? SHADOW : ''}</p:spPr>${txBody(c, e, op)}</p:sp>`;
}

function imageXml(c: Ctx, e: ImageEl): string {
  const pic = e.src ? c.o.picture(e.src) : null;
  if (!pic) return '';
  const rid = c.media.add(pic);
  const { cNvPr } = nvPr(c, e, 'Picture');
  let { x, y, w, h } = e;
  let crop = '';
  const fit = e.fit ?? 'cover';
  if (pic.w > 0 && pic.h > 0) {
    if (fit === 'cover') {
      const k = Math.max(w / pic.w, h / pic.h);
      const cw = (pic.w - w / k) / 2 / pic.w;
      const ch = (pic.h - h / k) / 2 / pic.h;
      const v = (f: number) => Math.round(Math.max(0, f) * 100000);
      if (cw > 0.0005 || ch > 0.0005) crop = `<a:srcRect l="${v(cw)}" t="${v(ch)}" r="${v(cw)}" b="${v(ch)}"/>`;
    } else if (fit === 'contain') {
      const k = Math.min(w / pic.w, h / pic.h);
      const nw = pic.w * k;
      const nh = pic.h * k;
      x += (w - nw) / 2;
      y += (h - nh) / 2;
      w = nw;
      h = nh;
    }
  }
  const op = e.opacity ?? 1;
  const alpha = op < 1 ? `<a:alphaModFix amt="${Math.round(op * 100000)}"/>` : '';
  const flip = `${e.flipH ? ' flipH="1"' : ''}${e.flipV ? ' flipV="1"' : ''}`;
  const geom = e.radius ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(Math.min(50000, (e.radius / Math.max(1, Math.min(w, h))) * 100000))}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return `<p:pic><p:nvPicPr>${cNvPr}<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}">${alpha}</a:blip>${crop}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(x, y, w, h, e.rot, flip)}${geom}${e.line ? lnXml(e.line, e.lineW, undefined, c.t, op) : ''}${e.shadow ? SHADOW : ''}</p:spPr></p:pic>`;
}

function lineXml(c: Ctx, e: LineEl): string {
  const { cNvPr } = nvPr(c, e, 'Line');
  const x = Math.min(e.x, e.x + e.w);
  const y = Math.min(e.y, e.y + e.h);
  const flip = `${e.w < 0 ? ' flipH="1"' : ''}${e.h < 0 ? ' flipV="1"' : ''}`;
  const cap = (k: string | undefined, tag: string) => (k === 'arrow' ? `<a:${tag} type="triangle" w="med" len="med"/>` : k === 'dot' ? `<a:${tag} type="oval" w="med" len="med"/>` : '');
  const d = e.dash === 'dash' ? '<a:prstDash val="dash"/>' : e.dash === 'dot' ? '<a:prstDash val="sysDot"/>' : '';
  const ln = `<a:ln w="${emu(e.width)}"${e.dash === 'dot' ? ' cap="rnd"' : ''}>${fillXml(e.color ?? 'fg', c.t, e.opacity ?? 1)}${d}${cap(e.start, 'headEnd')}${cap(e.end, 'tailEnd')}</a:ln>`;
  return `<p:cxnSp><p:nvCxnSpPr>${cNvPr}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(x, y, Math.abs(e.w), Math.abs(e.h), undefined, flip)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>${ln}</p:spPr></p:cxnSp>`;
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
  const rows = e.rows
    .map((r, ri) => {
      const head = ri === 0 && !!e.head;
      const band = !head && e.band && (ri - (e.head ? 1 : 0)) % 2 === 1;
      const cells = Array.from({ length: cols }, (_, ci) => {
        const text = r[ci] ?? '';
        const align = e.aligns?.[ci] ?? 'left';
        const algn = align === 'center' ? 'ctr' : align === 'right' ? 'r' : align === 'justify' ? 'just' : 'l';
        const color = head ? (e.headColor ?? 'accentFg') : (e.color ?? 'fg');
        const face = officeFont(fontName(e.font, t));
        const paras = text
          .split('\n')
          .map((line) => `<a:p><a:pPr algn="${algn}"/>${line ? `<a:r><a:rPr lang="en-US" sz="${sz(e.size)}"${head ? ' b="1"' : ''} dirty="0"><a:solidFill>${clr(color, t, '#000000')}</a:solidFill><a:latin typeface="${esc(face)}"/></a:rPr><a:t>${esc(line)}</a:t></a:r>` : ''}<a:endParaRPr lang="en-US" sz="${sz(e.size)}" dirty="0"/></a:p>`)
          .join('');
        const fill = head ? fillXml(e.fill ?? 'accent', t) : band ? fillXml('soft', t) : '<a:noFill/>';
        return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${paras}</a:txBody><a:tcPr marL="${padX}" marR="${padX}" marT="${pad}" marB="${pad}" anchor="ctr">${ln('lnL')}${ln('lnR')}${ln('lnT')}${ln('lnB')}${fill}</a:tcPr></a:tc>`;
      }).join('');
      return `<a:tr h="${rowH}">${cells}</a:tr>`;
    })
    .join('');
  return `<p:graphicFrame><p:nvGraphicFramePr>${cNvPr}<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.w)}" cy="${emu(e.h)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${e.head ? ' firstRow="1"' : ''}${e.band ? ' bandRow="1"' : ''}/><a:tblGrid>${widths.map((w) => `<a:gridCol w="${w}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
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

function chartXml(e: ChartEl, t: Theme): string {
  const C = 'xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const ink = hexColor(e.color ?? 'muted', t).hex;
  const face = esc(officeFont(fontName(e.font, t)));
  const txPr = (size: number, bold = false, color = ink) =>
    `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz(size)}" b="${bold ? 1 : 0}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${face}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const labels = e.labels;
  const n = labels.length;
  const pie = e.kind === 'pie' || e.kind === 'doughnut';
  const series = pie ? e.series.slice(0, 1) : e.series;
  const colorOf = (i: number, s?: { color?: string }) => hexColor(s?.color ?? `c${(i % 6) + 1}`, t).hex;
  const cat = `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${labels.map((l, i) => `<c:pt idx="${i}"><c:v>${esc(l)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const val = (s: ChartEl['series'][number], si: number) =>
    `<c:val><c:numRef><c:f>Sheet1!$${col(si + 1)}$2:$${col(si + 1)}$${n + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${labels.map((_, i) => `<c:pt idx="${i}"><c:v>${Number.isFinite(s.values[i]) ? s.values[i] : 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val>`;
  const tx = (s: ChartEl['series'][number], si: number) => `<c:tx><c:strRef><c:f>Sheet1!$${col(si + 1)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`;
  const dLbls = (pct: boolean) =>
    `<c:dLbls><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(e.size * 0.9, pct, pct ? 'FFFFFF' : hexColor('fg', t).hex)}<c:showLegendKey val="0"/><c:showVal val="${pct ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pct ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls>`;
  const solid = (hex: string) => `<c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></c:spPr>`;
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
      const sers = series.map((s, si) => `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${tx(s, si)}${solid(colorOf(si, s))}<c:invertIfNegative val="0"/>${e.values ? dLbls(false) : ''}${cat}${val(s, si)}</c:ser>`).join('');
      plot = `<c:barChart><c:barDir val="${horiz ? 'bar' : 'col'}"/><c:grouping val="${e.stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="60"/>${e.stacked ? '<c:overlap val="100"/>' : '<c:overlap val="-8"/>'}${axes}</c:barChart>`;
    } else if (e.kind === 'line') {
      const sers = series
        .map((s, si) => {
          const hex = colorOf(si, s);
          return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${tx(s, si)}<c:spPr><a:ln w="${emu(Math.max(2, e.size / 6))}" cap="rnd"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/><c:spPr><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>${e.values ? dLbls(false) : ''}${cat}${val(s, si)}<c:smooth val="0"/></c:ser>`;
        })
        .join('');
      plot = `<c:lineChart><c:grouping val="${e.stacked ? 'stacked' : 'standard'}"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${axes}</c:lineChart>`;
    } else {
      const sers = series
        .map((s, si) => {
          const hex = colorOf(si, s);
          return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/>${tx(s, si)}<c:spPr><a:solidFill><a:srgbClr val="${hex}"><a:alpha val="${e.stacked ? 85000 : 35000}"/></a:srgbClr></a:solidFill><a:ln w="${emu(Math.max(2, e.size / 6))}"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill></a:ln></c:spPr>${e.values ? dLbls(false) : ''}${cat}${val(s, si)}</c:ser>`;
        })
        .join('');
      plot = `<c:areaChart><c:grouping val="${e.stacked ? 'stacked' : 'standard'}"/><c:varyColors val="0"/>${sers}${axes}</c:areaChart>`;
    }
    const grid = e.grid ? `<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${hexColor('fg', t).hex}"><a:alpha val="14000"/></a:srgbClr></a:solidFill></a:ln></c:spPr></c:majorGridlines>` : '';
    const axisLine = `<c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="${hexColor('fg', t).hex}"><a:alpha val="35000"/></a:srgbClr></a:solidFill></a:ln></c:spPr>`;
    plot += `<c:catAx><c:axId val="51600001"/><c:scaling><c:orientation val="${horiz ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/>${axisLine}${txPr(e.size)}<c:crossAx val="51600002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
    plot += `<c:valAx><c:axId val="51600002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${horiz ? 'b' : 'l'}"/>${grid}<c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(e.size)}<c:crossAx val="51600001"/><c:crosses val="${horiz ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  }
  const title = e.title
    ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz(e.size * 1.2)}" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="${sz(e.size * 1.2)}" b="1"><a:solidFill><a:srgbClr val="${hexColor('head', t).hex}"/></a:solidFill><a:latin typeface="${face}"/></a:rPr><a:t>${esc(e.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`
    : '<c:autoTitleDeleted val="1"/>';
  const legend = e.legend && (pie || series.length > 1 || !!series[0]?.name) ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${txPr(e.size)}</c:legend>` : '';
  return `${XML_HEAD}<c:chartSpace ${C}><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txPr(e.size)}</c:chartSpace>`;
}

function chartFrame(c: Ctx, e: ChartEl): string {
  const rid = c.charts.add(chartXml(e, c.t));
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
  if (!anims.length) return '';
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
  const auto = anims[0].on !== 'click';
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
  const tree = `<p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${pars}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>`;
  return `<p:timing>${tree}${builds.length ? `<p:bldLst>${builds.join('')}</p:bldLst>` : ''}</p:timing>`;
}

function transitionXml(s: Slide): string {
  const t = s.transition;
  if (!t || (t.fx === 'none' && !t.auto)) return '';
  const dur = t.dur ?? 600;
  const spd = dur <= 450 ? 'fast' : dur <= 900 ? 'med' : 'slow';
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
  return `<p:transition spd="${spd}"${t.auto ? ` advTm="${Math.round(t.auto * 1000)}"` : ''}>${fx[t.fx] ?? ''}</p:transition>`;
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
  const parts = s.els
    .map((e) => {
      if (e.type === 'text' || e.type === 'shape') return boxXml(c, e);
      if (e.type === 'image') return imageXml(c, e);
      if (e.type === 'line') return lineXml(c, e);
      if (e.type === 'table') return tableXml(c, e);
      if (e.type === 'chart') return chartFrame(c, e);
      return '';
    })
    .join('');
  const grp = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
  return `${XML_HEAD}<p:sld ${NS}${s.hidden ? ' show="0"' : ''}><p:cSld>${bg}<p:spTree>${grp}${under}${parts}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>${transitionXml(s)}${timingXml(c, s)}</p:sld>`;
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
  const head = t ? esc(officeFont(t.headFont)) : 'Calibri Light';
  const body = t ? esc(officeFont(t.font)) : 'Calibri';
  const sch = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  return `${XML_HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}"><a:dk1><a:srgbClr val="${hex('fg', '000000')}"/></a:dk1><a:lt1><a:srgbClr val="${hex('bg', 'FFFFFF')}"/></a:lt1><a:dk2><a:srgbClr val="${hex('head', '44546A')}"/></a:dk2><a:lt2><a:srgbClr val="${hex('soft', 'E7E6E6')}"/></a:lt2>${accents}<a:hlink><a:srgbClr val="${hex('accent', '0563C1')}"/></a:hlink><a:folHlink><a:srgbClr val="${hex('muted', '954F72')}"/></a:folHlink></a:clrScheme><a:fontScheme name="${esc(name)}"><a:majorFont><a:latin typeface="${head}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${body}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst>${sch}${sch}${sch}</a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
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
  let chartN = 0;
  const charts: { name: string; xml: string }[] = [];
  const hasNotes = deck.slides.some((s) => s.notes);
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
        add(xml) {
          const name = `chart${++chartN}.xml`;
          charts.push({ name, xml });
          return rels.add('chart', `../charts/${name}`);
        },
      },
      slideFile: (n) => (n >= 1 && n <= deck.slides.length ? `slide${n}.xml` : null),
      ids: new Map(),
      next: 2,
      titled: false,
    };
    const xml = slideXml(c, s);
    if (s.notes) rels.add('notesSlide', `../notesSlides/notesSlide${i + 1}.xml`);
    return { xml, rels, notes: s.notes, n: i + 1 };
  });

  const types = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
    '<Default Extension="jpeg" ContentType="image/jpeg"/>',
    '<Default Extension="gif" ContentType="image/gif"/>',
    '<Default Extension="webp" ContentType="image/webp"/>',
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
    data: `${XML_HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Naget Agent</Application><PresentationFormat>${deck.ratio === '4:3' ? 'Custom' : 'Widescreen'}</PresentationFormat><Slides>${slides.length}</Slides><Notes>${slides.filter((s) => s.notes).length}</Notes></Properties>`,
  });

  const presRels = new Rels();
  presRels.add('slideMaster', 'slideMasters/slideMaster1.xml');
  const sldIds = slides.map((s, i) => `<p:sldId id="${256 + i}" r:id="${presRels.add('slide', `slides/slide${s.n}.xml`)}"/>`).join('');
  const notesMasterId = hasNotes ? presRels.add('notesMaster', 'notesMasters/notesMaster1.xml') : '';
  presRels.add('presProps', 'presProps.xml');
  presRels.add('viewProps', 'viewProps.xml');
  presRels.add('theme', 'theme/theme1.xml');
  presRels.add('tableStyles', 'tableStyles.xml');
  const cy = emu(H);
  parts.push({
    name: 'ppt/presentation.xml',
    data: `${XML_HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>${hasNotes ? `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterId}"/></p:notesMasterIdLst>` : ''}<p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`,
  });
  parts.push({ name: 'ppt/_rels/presentation.xml.rels', data: relsXml(presRels.list) });
  parts.push({ name: 'ppt/presProps.xml', data: `${XML_HEAD}<p:presentationPr ${NS}/>` });
  parts.push({ name: 'ppt/viewProps.xml', data: `${XML_HEAD}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>` });
  parts.push({ name: 'ppt/tableStyles.xml', data: `${XML_HEAD}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>` });
  parts.push({ name: 'ppt/theme/theme1.xml', data: themeXml(t.id ? `Naget ${t.id}` : 'Naget', t) });
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
  for (const c of charts) parts.push({ name: `ppt/charts/${c.name}`, data: c.xml });
  for (const m of media) parts.push({ name: `ppt/media/${m.name}`, data: m.key });
  return zipParts(parts);
}

/** The words of a deck, a slide at a time (for a test, or an agent's check). */
export const deckWords = (deck: Deck) => deck.slides.map((s) => s.els.flatMap((e) => (e.type === 'text' || e.type === 'shape' ? [plainText(e.paras)] : [])).join(' | '));
