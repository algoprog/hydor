// The text on a PDF's pages with where it is: the page's content streams run through a small interpreter of the
// graphics and text state (text matrices, fonts, spacing, form XObjects inside), each character placed in points from
// the page's top-left as it shows. Characters are then put together into lines and pieces of lines (a gap wider than
// a few characters splits them, as a form's columns are), and words are found in them whatever their case and accents,
// so "Signature" finds "SIGNATURE:" and "Υπογραφή" finds "ΥΠΟΓΡΑΦΗ".
import type { PdfFile } from './file.ts';
import { fontInfo, type FontInfo } from './fontread.ts';
import { type Dict, isStream, type Obj, parseContent, Ref, Str } from './objects.ts';
import { apply, IDENTITY, invert, type Matrix, mul, type Page, pages } from './pages.ts';

export interface Glyph {
  text: string;
  /** Its box, from the page's top-left as it shows. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Where its baseline starts, and its size, as it shows. */
  ox: number;
  oy: number;
  size: number;
  /** Which way it reads as the page shows: 0 left to right, 1 downwards, 2 upside down, 3 upwards; -1 slanted. */
  dir: number;
}

interface State {
  ctm: Matrix;
  font: FontInfo | null;
  size: number;
  cs: number;
  ws: number;
  th: number;
  tl: number;
  rise: number;
}

const MAX_GLYPHS = 200_000;

/** The characters of a page, in the order they are drawn. */
export function pageGlyphs(pdf: PdfFile, page: Page): Glyph[] {
  const out: Glyph[] = [];
  // From user space to the page as it shows: user → display (unrotated, from the bottom-left) → from the top-left.
  const toShown = mul(invert(page.toUser), [1, 0, 0, -1, 0, page.height]);
  const contents = pdf.resolve(page.dict.get('Contents'));
  const streams = Array.isArray(contents) ? contents : [contents];
  const data = Buffer.concat(streams.flatMap((s) => [pdf.streamData(s), Buffer.from('\n')]));
  run(pdf, data, page.resources, { ctm: IDENTITY, font: null, size: 0, cs: 0, ws: 0, th: 1, tl: 0, rise: 0 }, toShown, out, 0, new Set());
  return out;
}

function run(pdf: PdfFile, data: Buffer, res: Dict, start: State, toShown: Matrix, out: Glyph[], depth: number, open: Set<number>) {
  let gs: State = { ...start };
  const stack: State[] = [];
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  const fonts = pdf.dictOf(res.get('Font'));
  const xobjects = pdf.dictOf(res.get('XObject'));
  const show = (s: Obj) => {
    if (!(s instanceof Str) || !gs.font || out.length >= MAX_GLYPHS) return;
    const f = gs.font;
    for (const c of f.decode(s.bytes)) {
      const w0 = c.w / 1000;
      const trm = mul(mul([gs.size * gs.th, 0, 0, gs.size, 0, gs.rise], tm), gs.ctm);
      const m = mul(trm, toShown);
      if (c.text && c.text !== ' ' && c.text.trim()) {
        const a = f.ascent / 1000;
        const d = f.descent / 1000;
        const pts = [apply(m, 0, d), apply(m, w0, d), apply(m, 0, a), apply(m, w0, a)];
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const size = Math.hypot(m[2], m[3]);
        // The direction its baseline runs in, as shown (y grows downwards).
        const ax = Math.abs(m[0]);
        const ay = Math.abs(m[1]);
        const dir = ay < ax * 0.05 ? (m[0] > 0 ? 0 : 2) : ax < ay * 0.05 ? (m[1] > 0 ? 1 : 3) : -1;
        const [ox, oy] = apply(m, 0, 0);
        if (size > 0.5 && size < 2000) out.push({ text: c.text, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), ox, oy, size, dir });
      }
      const tx = (w0 * gs.size + gs.cs + (c.len === 1 && c.code === 32 ? gs.ws : 0)) * gs.th;
      tm = mul([1, 0, 0, 1, tx, 0], tm);
    }
  };
  const nextLine = (tx: number, ty: number) => {
    tlm = mul([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
  };
  const n = (o: Obj) => (typeof o === 'number' ? o : 0);
  for (const { op, args } of parseContent(data)) {
    switch (op) {
      case 'q':
        if (stack.length < 256) stack.push({ ...gs });
        break;
      case 'Q':
        if (stack.length) gs = stack.pop()!;
        break;
      case 'cm':
        if (args.length >= 6) gs.ctm = mul(args.slice(-6).map(n) as Matrix, gs.ctm);
        break;
      case 'BT':
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case 'Tf': {
        const name = args[args.length - 2];
        gs.size = n(args[args.length - 1]);
        const ref = typeof name === 'string' && fonts ? (fonts.get(name) ?? null) : null;
        gs.font = ref ? fontInfo(pdf, ref) : null;
        break;
      }
      case 'Tc':
        gs.cs = n(args[0]);
        break;
      case 'Tw':
        gs.ws = n(args[0]);
        break;
      case 'Tz':
        gs.th = n(args[0]) / 100;
        break;
      case 'TL':
        gs.tl = n(args[0]);
        break;
      case 'Ts':
        gs.rise = n(args[0]);
        break;
      case 'Td':
        nextLine(n(args[0]), n(args[1]));
        break;
      case 'TD':
        gs.tl = -n(args[1]);
        nextLine(n(args[0]), n(args[1]));
        break;
      case 'Tm':
        if (args.length >= 6) {
          tlm = args.slice(-6).map(n) as Matrix;
          tm = tlm;
        }
        break;
      case 'T*':
        nextLine(0, -gs.tl);
        break;
      case 'Tj':
        show(args[0]);
        break;
      case "'":
        nextLine(0, -gs.tl);
        show(args[0]);
        break;
      case '"':
        gs.ws = n(args[0]);
        gs.cs = n(args[1]);
        nextLine(0, -gs.tl);
        show(args[2]);
        break;
      case 'TJ':
        for (const x of Array.isArray(args[0]) ? args[0] : []) {
          if (typeof x === 'number') tm = mul([1, 0, 0, 1, (-x / 1000) * gs.size * gs.th, 0], tm);
          else show(x);
        }
        break;
      case 'Do': {
        const name = args[0];
        if (typeof name !== 'string' || !xobjects || depth > 12) break;
        const ref = xobjects.get(name);
        const x = pdf.resolve(ref ?? null);
        if (!isStream(x) || x.dict.get('Subtype') !== 'Form') break;
        const num = ref instanceof Ref ? ref.num : -1;
        if (num >= 0 && open.has(num)) break;
        const mat = pdf.arrayOf(x.dict.get('Matrix')).map((v) => pdf.numOf(v, 0));
        const inner = pdf.dictOf(x.dict.get('Resources')) ?? res;
        if (num >= 0) open.add(num);
        run(pdf, pdf.streamData(x), inner, { ...gs, ctm: mul(mat.length === 6 ? (mat as Matrix) : IDENTITY, gs.ctm) }, toShown, out, depth + 1, open);
        if (num >= 0) open.delete(num);
        break;
      }
    }
  }
}

/** A piece of a line: characters on one baseline with no wide gap between them. */
export interface Line {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  /** The glyph of each character of `text` (-1 for a space put between words). */
  map: number[];
  glyphs: Glyph[];
}

/** A glyph turned so that it reads left to right, upright: its box and baseline in that frame. */
interface Turned {
  g: Glyph;
  x0: number;
  x1: number;
  base: number;
  size: number;
  text: string;
}

function turn(g: Glyph): Turned {
  // Points (x, y) as shown, in the frame where this direction reads left to right.
  const f = g.dir === 1 ? (x: number, y: number) => [y, -x] : g.dir === 2 ? (x: number, y: number) => [-x, -y] : g.dir === 3 ? (x: number, y: number) => [-y, x] : (x: number, y: number) => [x, y];
  const a = f(g.x0, g.y0);
  const b = f(g.x1, g.y1);
  return { g, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), base: f(g.ox, g.oy)[1], size: g.size, text: g.text };
}

/**
 * The page's text as lines, cut where a gap is wider than three characters: top to bottom, left to right, then text
 * running down, upside down or up the page (each read in its own direction); boxes as the page shows.
 */
export function lines(glyphs: Glyph[]): Line[] {
  const out: Line[] = [];
  for (const dir of [0, 1, 2, 3]) out.push(...linesOf(glyphs.filter((g) => g.dir === dir).map(turn)));
  return out;
}

function linesOf(gl: Turned[]): Line[] {
  gl.sort((a, b) => a.base - b.base || a.x0 - b.x0);
  // Baselines within a fraction of the size of each other are one line.
  const rows: Turned[][] = [];
  let cur: Turned[] = [];
  let base = -Infinity;
  for (const g of gl) {
    if (cur.length && Math.abs(g.base - base) > Math.max(1, 0.35 * Math.min(g.size, cur[0].size))) {
      rows.push(cur);
      cur = [];
    }
    if (!cur.length) base = g.base;
    cur.push(g);
  }
  if (cur.length) rows.push(cur);
  const out: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x0 - b.x0);
    let piece: Turned[] = [];
    const flush = () => {
      if (!piece.length) return;
      let text = '';
      const map: number[] = [];
      piece.forEach((g, i) => {
        if (i) {
          const prev = piece[i - 1];
          const gap = g.x0 - prev.x1;
          // A word's gap is wider than letters' (kerning can bring letters a little apart, or together).
          if (gap > 0.18 * Math.min(g.size, prev.size) && !text.endsWith(' ')) {
            text += ' ';
            map.push(-1);
          }
        }
        for (const ch of g.text) {
          text += ch;
          map.push(i);
        }
      });
      const gs = piece.map((t) => t.g);
      const x0 = Math.min(...gs.map((g) => g.x0));
      const y0 = Math.min(...gs.map((g) => g.y0));
      const x1 = Math.max(...gs.map((g) => g.x1));
      const y1 = Math.max(...gs.map((g) => g.y1));
      out.push({ text, x: x0, y: y0, w: x1 - x0, h: y1 - y0, size: Math.max(...gs.map((g) => g.size)), map, glyphs: gs });
      piece = [];
    };
    for (const g of row) {
      const prev = piece[piece.length - 1];
      // Overprinted characters (bold faked by drawing twice) count once.
      if (prev && prev.text === g.text && Math.abs(prev.x0 - g.x0) < Math.min(0.15 * g.size, 1) && Math.abs(prev.base - g.base) < 1) continue;
      if (prev && g.x0 - prev.x1 > 3 * Math.max(prev.size, g.size)) flush();
      piece.push(g);
    }
    flush();
  }
  return out;
}

/** Text as matching compares it: letters without accents, lower case, one kind of quote, dash and space. */
export function fold(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s+/g, ' ');
}

export interface Found {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where `words` are on these lines: each match's box (the match may run over a line's end into the next piece). */
export function findIn(ls: Line[], words: string, page: number): Found[] {
  const q = fold(words).trim();
  if (!q) return [];
  // The page's pieces as one text, each folded character pointing at its glyph.
  let text = '';
  const at: { line: number; glyph: number }[] = [];
  ls.forEach((l, li) => {
    if (li) {
      text += ' ';
      at.push({ line: li, glyph: -1 });
    }
    [...l.text].forEach((ch, ci) => {
      const g = l.map[ci] ?? -1;
      for (const f of fold(ch)) {
        text += f;
        at.push({ line: li, glyph: g });
      }
    });
  });
  const search = (t: string, qq: string, idx: number[] | null): Found[] => {
    const out: Found[] = [];
    for (let i = t.indexOf(qq); i >= 0; i = t.indexOf(qq, i + Math.max(1, qq.length))) {
      const hits = (idx ? idx.slice(i, i + qq.length) : Array.from({ length: qq.length }, (_, k) => i + k)).map((k) => at[k]).filter((a) => a && a.glyph >= 0);
      if (!hits.length) continue;
      const gs = hits.map((a) => ls[a.line].glyphs[a.glyph]);
      const x0 = Math.min(...gs.map((g) => g.x0));
      const y0 = Math.min(...gs.map((g) => g.y0));
      const x1 = Math.max(...gs.map((g) => g.x1));
      const y1 = Math.max(...gs.map((g) => g.y1));
      out.push({ page, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    return out;
  };
  let found = search(text, q, null);
  if (!found.length) {
    // Letters spaced apart ("S i g n"), or words run together: compare without spaces.
    const idx: number[] = [];
    let t2 = '';
    for (let i = 0; i < text.length; i++)
      if (text[i] !== ' ') {
        t2 += text[i];
        idx.push(i);
      }
    found = search(t2, q.replace(/ /g, ''), idx);
  }
  if (!found.length && /[:.,;]$/.test(q)) return findIn(ls, q.replace(/[:.,;]+$/, ''), page);
  return found;
}

/** Each page's lines, read once per file. */
const cache = new WeakMap<PdfFile, Map<number, Line[]>>();
export function pageLines(pdf: PdfFile, page: Page): Line[] {
  let m = cache.get(pdf);
  if (!m) cache.set(pdf, (m = new Map()));
  let ls = m.get(page.index);
  if (!ls) {
    try {
      ls = lines(pageGlyphs(pdf, page));
    } catch {
      ls = [];
    }
    m.set(page.index, ls);
  }
  return ls;
}

/** Where `words` are: on one page (from 1), or on every page. */
export function findWordsIn(pdf: PdfFile, words: string, page?: number): Found[] {
  const list = pages(pdf);
  const out: Found[] = [];
  for (const p of list) {
    if (page && p.index !== page) continue;
    out.push(...findIn(pageLines(pdf, p), words, p.index));
  }
  return out;
}
