// How a filled form field looks, drawn here so every viewer shows the same (Acrobat, Preview, browsers and poppler
// draw a field's appearance stream, and only some make their own): the field's font size and colour from its default
// appearance (DA), its background and border (MK, BS), its alignment, its rotation, and the text in the fonts that
// hold its characters. Single lines shrink to fit; several lines wrap at words (and between Chinese characters); comb
// fields put a character in each box; lists show their options with the chosen ones highlighted as Acrobat does.
import type { PdfFile } from './file.ts';
import { flateStream } from './filters.ts';
import type { FontBox, Run } from './fontset.ts';
import { Dict, dict, num, type Obj, parseContent, Ref } from './objects.ts';

export interface Look {
  /** 0: as large as fits. */
  size: number;
  /** The text's colour as content operators ("0 g"). */
  fill: string;
  stroke: string;
  /** Background and border colours (fill operators), when the field has them. */
  bg: string | null;
  border: string | null;
  bw: number;
  style: string;
  /** 0 left, 1 centred, 2 right. */
  align: number;
  /** The widget's rotation (MK /R), anticlockwise. */
  rot: number;
}

const color = (c: Obj[], fill: boolean): string | null => {
  const v = c.filter((x): x is number => typeof x === 'number');
  if (v.length === 1) return `${num(v[0])} ${fill ? 'g' : 'G'}`;
  if (v.length === 3) return `${v.map(num).join(' ')} ${fill ? 'rg' : 'RG'}`;
  if (v.length === 4) return `${v.map(num).join(' ')} ${fill ? 'k' : 'K'}`;
  return null;
};

/** The look of a widget: its own DA, MK and BS, else its field's (inherited) DA and Q, else the form's. */
export function lookOf(pdf: PdfFile, widget: Dict, da: string, q: number): Look {
  let size = 0;
  let fill = '0 g';
  for (const op of parseContent(Buffer.from(da, 'latin1'))) {
    if (op.op === 'Tf') size = Number(op.args[op.args.length - 1]) || 0;
    else if (op.op === 'g' || op.op === 'rg' || op.op === 'k') fill = color(op.args, true) ?? fill;
  }
  const stroke = fill.replace(/ g$/, ' G').replace(/ rg$/, ' RG').replace(/ k$/, ' K');
  const mk = pdf.dictOf(widget.get('MK') ?? null);
  const bs = pdf.dictOf(widget.get('BS') ?? null);
  const bg = mk ? color(pdf.arrayOf(mk.get('BG')), true) : null;
  const border = mk ? color(pdf.arrayOf(mk.get('BC')), false) : null;
  let bw = bs ? pdf.numOf(bs.get('W'), 1) : 1;
  const bArr = pdf.arrayOf(widget.get('Border'));
  if (!bs && bArr.length >= 3) bw = pdf.numOf(bArr[2], 1);
  if (!border) bw = 0;
  const rot = ((((Math.round(pdf.numOf(mk?.get('R'), 0) / 90) * 90) % 360) + 360) % 360) as number;
  const style = typeof bs?.get('S') === 'string' ? (bs.get('S') as string) : 'S';
  return { size: Math.max(0, size), fill, stroke, bg, border, bw: Math.max(0, Math.min(bw, 6)), style, align: q === 1 || q === 2 ? q : 0, rot };
}

/** Background and border, as the field's MK and BS ask. */
function frame(w: number, h: number, l: Look): string {
  const out: string[] = [];
  if (l.bg) out.push(`${l.bg} 0 0 ${num(w)} ${num(h)} re f`);
  if (l.border && l.bw > 0) {
    const b = l.bw;
    if (l.style === 'U') out.push(`${l.border} ${num(b)} w 0 ${num(b / 2)} m ${num(w)} ${num(b / 2)} l S`);
    else out.push(`${l.border} ${num(b)} w${l.style === 'D' ? ' [3] 0 d' : ''} ${num(b / 2)} ${num(b / 2)} ${num(w - b)} ${num(h - b)} re S${l.style === 'D' ? ' [] 0 d' : ''}`);
  }
  return out.join('\n');
}

const showRuns = (runs: Run[], size: number) => runs.map((r) => `/${r.res} ${num(size)} Tf <${r.bytes.toString('hex')}> Tj`).join(' ');

/** Lines of `text` that fit `width` at `size`: broken at spaces, between Chinese characters, inside too-long words. */
export function wrap(fonts: FontBox, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    // Units that may end a line: a word with its spaces, or one character of a script without spaces.
    const units = para.match(/[⺀-鿿가-힯豈-﫿＀-￯][\s]*|[^\s⺀-鿿가-힯豈-﫿＀-￯]+\s*|\s+/g) ?? [''];
    let line = '';
    for (const u of units) {
      if (fonts.measure((line + u).trimEnd(), size) <= width || !line) {
        if (!line && fonts.measure(u.trimEnd(), size) > width) {
          // A word longer than the line: cut it where it fills the line.
          let part = '';
          for (const ch of u) {
            if (fonts.measure(part + ch, size) > width && part) {
              out.push(part);
              part = '';
            }
            part += ch;
          }
          line = part;
        } else line += u;
      } else {
        out.push(line.trimEnd());
        line = u.trimStart();
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

export interface TextOpts {
  multiline?: boolean;
  comb?: number;
  password?: boolean;
}

/** A text field's (or a dropdown's) content: frame, clip, and the text placed as the field asks. */
export function textContent(fonts: FontBox, w: number, h: number, l: Look, text: string, o: TextOpts = {}): string {
  const { ascent, descent } = fonts.metrics();
  const lh = (ascent - descent) / 1000;
  const bw = l.bw;
  const pad = 2;
  const shown = o.password ? '*'.repeat([...text].length) : text;
  const out: string[] = ['/Tx BMC', 'q'];
  const fr = frame(w, h, l);
  if (fr) out.push(fr);
  out.push(`${num(bw)} ${num(bw)} ${num(Math.max(0, w - 2 * bw))} ${num(Math.max(0, h - 2 * bw))} re W n`);
  const innerW = w - 2 * bw - 2 * pad;
  const innerH = h - 2 * bw;
  if (shown) {
    out.push('BT', l.fill);
    if (o.comb && o.comb > 0 && !o.multiline) {
      const cell = (w - 2 * bw) / o.comb;
      const size = l.size || Math.max(4, Math.min(12, (innerH - 2) / lh, cell * 1.2));
      const y = h / 2 - ((ascent + descent) / 2000) * size;
      [...shown].slice(0, o.comb).forEach((ch, i) => {
        const runs = fonts.runs(ch);
        const cw = (runs.reduce((a, r) => a + r.width, 0) * size) / 1000;
        out.push(`1 0 0 1 ${num(bw + cell * i + (cell - cw) / 2)} ${num(y)} Tm ${showRuns(runs, size)}`);
      });
    } else if (o.multiline) {
      let size = l.size || 12;
      let lines = wrap(fonts, shown, size, innerW);
      // An automatic size shrinks until every line fits.
      while (!l.size && size > 4 && lines.length * size * lh > innerH - 2 * pad) {
        size = Math.max(4, size - 0.5);
        lines = wrap(fonts, shown, size, innerW);
      }
      let y = h - bw - pad - (ascent / 1000) * size;
      for (const line of lines) {
        const runs = fonts.runs(line);
        const lw = (runs.reduce((a, r) => a + r.width, 0) * size) / 1000;
        const x = l.align === 1 ? (w - lw) / 2 : l.align === 2 ? w - bw - pad - lw : bw + pad;
        out.push(`1 0 0 1 ${num(x)} ${num(y)} Tm ${showRuns(runs, size)}`);
        y -= size * lh;
      }
    } else {
      const line = shown.replace(/\s*\n\s*/g, ' ');
      let size = l.size || Math.max(4, Math.min(14, (innerH - 2) / lh));
      let tw = fonts.measure(line, size);
      // Too long for the field: smaller, when the size is automatic.
      if (!l.size && tw > innerW && tw > 0) {
        size = Math.max(4, (size * innerW) / tw);
        tw = fonts.measure(line, size);
      }
      const runs = fonts.runs(line);
      const y = h / 2 - ((ascent + descent) / 2000) * size;
      const x = l.align === 1 ? (w - tw) / 2 : l.align === 2 ? w - bw - pad - tw : bw + pad;
      out.push(`1 0 0 1 ${num(x)} ${num(y)} Tm ${showRuns(runs, size)}`);
    }
    out.push('ET');
  }
  out.push('Q', 'EMC');
  return out.join('\n');
}

/** A list box's content: its options from the top one shown, the chosen ones highlighted. */
export function listContent(fonts: FontBox, w: number, h: number, l: Look, labels: string[], chosen: Set<number>, top: number): string {
  const { ascent, descent } = fonts.metrics();
  const size = l.size || 12;
  const lh = size * ((ascent - descent) / 1000);
  const bw = l.bw;
  const out: string[] = ['/Tx BMC', 'q'];
  const fr = frame(w, h, l);
  if (fr) out.push(fr);
  out.push(`${num(bw)} ${num(bw)} ${num(Math.max(0, w - 2 * bw))} ${num(Math.max(0, h - 2 * bw))} re W n`);
  let y = h - bw;
  for (let i = top; i < labels.length && y > bw; i++) {
    if (chosen.has(i)) out.push(`0.6 0.75 0.85 rg ${num(bw)} ${num(y - lh)} ${num(w - 2 * bw)} ${num(lh)} re f`);
    const runs = fonts.runs(labels[i]);
    out.push(`BT ${l.fill} 1 0 0 1 ${num(bw + 2)} ${num(y - (ascent / 1000) * size)} Tm ${showRuns(runs, size)} ET`);
    y -= lh;
  }
  out.push('Q', 'EMC');
  return out.join('\n');
}

/** A tick, cross, dot or square for a checkbox or radio button that has no picture of its own for being on. */
export function markContent(w: number, h: number, l: Look, kind: 'check' | 'cross' | 'circle' | 'square' | 'diamond', on: boolean): string {
  const out: string[] = ['q'];
  const fr = frame(w, h, l);
  if (fr) out.push(fr);
  if (on) {
    const s = Math.min(w, h) - 2 * l.bw;
    const cx = w / 2;
    const cy = h / 2;
    if (kind === 'check') {
      const p = (x: number, y: number) => `${num(cx + (x - 0.5) * s)} ${num(cy + (y - 0.5) * s)}`;
      out.push(`${l.stroke} ${num(Math.max(0.8, s * 0.11))} w 1 J 1 j ${p(0.2, 0.52)} m ${p(0.42, 0.28)} l ${p(0.82, 0.76)} l S`);
    } else if (kind === 'cross') {
      const p = (x: number, y: number) => `${num(cx + (x - 0.5) * s)} ${num(cy + (y - 0.5) * s)}`;
      out.push(`${l.stroke} ${num(Math.max(0.8, s * 0.1))} w 1 J ${p(0.22, 0.22)} m ${p(0.78, 0.78)} l ${p(0.22, 0.78)} m ${p(0.78, 0.22)} l S`);
    } else if (kind === 'circle') {
      out.push(`${l.fill} ${circle(cx, cy, s * 0.25)} f`);
    } else if (kind === 'square') {
      out.push(`${l.fill} ${num(cx - s * 0.25)} ${num(cy - s * 0.25)} ${num(s * 0.5)} ${num(s * 0.5)} re f`);
    } else {
      const r = s * 0.3;
      out.push(`${l.fill} ${num(cx)} ${num(cy + r)} m ${num(cx + r)} ${num(cy)} l ${num(cx)} ${num(cy - r)} l ${num(cx - r)} ${num(cy)} l f`);
    }
  }
  out.push('Q');
  return out.join('\n');
}

/** A circle as four Bézier curves. */
export function circle(cx: number, cy: number, r: number): string {
  const k = 0.5523 * r;
  return [
    `${num(cx + r)} ${num(cy)} m`,
    `${num(cx + r)} ${num(cy + k)} ${num(cx + k)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c`,
    `${num(cx - k)} ${num(cy + r)} ${num(cx - r)} ${num(cy + k)} ${num(cx - r)} ${num(cy)} c`,
    `${num(cx - r)} ${num(cy - k)} ${num(cx - k)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c`,
    `${num(cx + k)} ${num(cy - r)} ${num(cx + r)} ${num(cy - k)} ${num(cx + r)} ${num(cy)} c`,
  ].join(' ');
}

/**
 * An appearance stream of a widget `w` × `h` points (its Rect), turned as the widget's MK /R says: `draw` gets the
 * width and height to draw in (swapped when the widget is turned a quarter).
 */
export function appearance(add: (o: Obj) => Ref, fonts: FontBox | null, w: number, h: number, rot: number, draw: (w: number, h: number) => string): Ref {
  const side = rot === 90 || rot === 270;
  const bw = side ? h : w;
  const bh = side ? w : h;
  const matrix = rot === 90 ? [0, 1, -1, 0, 0, 0] : rot === 180 ? [-1, 0, 0, -1, 0, 0] : rot === 270 ? [0, -1, 1, 0, 0, 0] : undefined;
  // Drawn first: laying the text out is what brings in the fonts it needs.
  const content = draw(bw, bh);
  const res = new Dict();
  if (fonts) {
    const f = new Dict();
    for (const [k, v] of fonts.resources()) f.set(k, v);
    res.set('Font', f);
  }
  const d = dict({ Type: 'XObject', Subtype: 'Form', BBox: [0, 0, num0(bw), num0(bh)], Matrix: matrix, Resources: res });
  return add(flateStream(Buffer.from(content, 'latin1'), d));
}

const num0 = (n: number) => Math.round(n * 1000) / 1000;
