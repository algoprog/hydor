// The words of a PDF's pages as Files' reader lays them over each page's picture, so they can be selected as in any
// reader: runs of characters in the order the page draws them (a paper's columns one after the other, as pdf.js
// does, rather than across the page), each character's place, and the words found again from their text when the
// file changed (a paper typeset again moves its passages). Places are in points from the page's top-left as it shows.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { PdfFile } from '../documents/pdf/file.ts';
import { Str } from '../documents/pdf/objects.ts';
import { pages, type Page } from '../documents/pdf/pages.ts';
import { fold, type Glyph, pageGlyphs } from '../documents/pdf/text.ts';
import { joinLines, type PdfRect, type TextRun } from '../../shared/pdfnotes.ts';

/** A run of characters on one baseline, with where each one starts and the last one ends. */
export interface Run {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  size: number;
  /** text.length + 1 edges: character i spans [edges[i], edges[i + 1]]. */
  edges: number[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * A page's runs of words, in the order the page draws them. A run goes on while the next character sits on its
 * baseline (or, a little smaller, above or below it: a superscript, a subscript) close after the last one; a jump
 * back, to another line or far across starts the next. A gap wider than a letter's is a space between words.
 * Characters drawn twice in the same place (bold faked so) count once; only text that reads left to right is laid out.
 */
export function runsOf(glyphs: Glyph[]): Run[] {
  const out: { gs: Glyph[]; base: number; size: number }[] = [];
  let cur: { gs: Glyph[]; base: number; size: number } | null = null;
  for (const g of glyphs) {
    if (g.dir !== 0) continue;
    if (cur) {
      const prev = cur.gs[cur.gs.length - 1];
      if (prev.text === g.text && Math.abs(prev.x0 - g.x0) < Math.min(0.15 * g.size, 1) && Math.abs(prev.oy - g.oy) < 1) continue;
      const size = Math.max(prev.size, g.size);
      const gap = g.x0 - prev.x1;
      const onBase = Math.abs(g.oy - cur.base) <= 0.35 * Math.min(cur.size, g.size);
      // A superscript or subscript: smaller, right after, its box over the run's.
      const lo = Math.max(g.y0, Math.min(...cur.gs.map((x) => x.y0)));
      const hi = Math.min(g.y1, Math.max(...cur.gs.map((x) => x.y1)));
      const script = g.size <= cur.size * 1.05 && hi - lo > 0.4 * (g.y1 - g.y0) && gap > -0.3 * size && gap < 0.6 * size;
      if ((onBase && gap > -0.6 * size && gap < 1.6 * size) || script) {
        cur.gs.push(g);
        continue;
      }
    }
    cur = { gs: [g], base: g.oy, size: g.size };
    out.push(cur);
  }
  const runs: Run[] = [];
  for (const { gs } of out) {
    let text = '';
    const edges: number[] = [];
    gs.forEach((g, i) => {
      if (i) {
        const prev = gs[i - 1];
        if (g.x0 - prev.x1 > 0.18 * Math.min(g.size, prev.size)) {
          text += ' ';
          edges.push(prev.x1);
        }
      }
      // A ligature ("fi") is one glyph for two letters: each gets its share.
      const chars = [...g.text];
      chars.forEach((ch, k) => {
        text += ch;
        edges.push(g.x0 + ((g.x1 - g.x0) * k) / chars.length);
      });
    });
    const last = gs[gs.length - 1];
    edges.push(last.x1);
    // Kerning can bring a letter back over the one before: the edges never go backwards.
    for (let i = 1; i < edges.length; i++) if (edges[i] < edges[i - 1]) edges[i] = edges[i - 1];
    const x0 = Math.min(...gs.map((g) => g.x0));
    const y0 = Math.min(...gs.map((g) => g.y0));
    const x1 = Math.max(...gs.map((g) => g.x1));
    const y1 = Math.max(...gs.map((g) => g.y1));
    if (!text.trim()) continue;
    // Whole lines drawn twice (bold faked so): once.
    if (runs.some((r) => r.text === text && Math.abs(r.x - x0) < 1.5 && Math.abs(r.y - y0) < 1.5)) continue;
    runs.push({ text, x: x0, y: y0, w: x1 - x0, h: y1 - y0, size: Math.max(...gs.map((g) => g.size)), edges });
  }
  return runs;
}

/** The runs as the reader gets them: numbers to a tenth of a point. */
export const shownRuns = (runs: Run[]): TextRun[] => runs.map((r) => ({ t: r.text, x: r1(r.x), y: r1(r.y), w: r1(r.w), h: r1(r.h), e: r.edges.map(r1) }));

/** The boxes of characters [from, to) of a run (spaces at either end left out). */
function boxOf(r: Run, from: number, to: number): PdfRect | null {
  while (from < to && r.text[from] === ' ') from++;
  while (to > from && r.text[to - 1] === ' ') to--;
  if (to <= from) return null;
  return { x: r.edges[from], y: r.y, w: Math.max(0.5, r.edges[to] - r.edges[from]), h: r.h };
}

/** Characters from (run a, char i) to (run b, char j), j excluded: a box a run, and the words as they read. */
export function spanOf(runs: Run[], a: number, i: number, b: number, j: number): { rects: PdfRect[]; text: string } {
  const rects: PdfRect[] = [];
  const parts: string[] = [];
  for (let k = a; k <= b && k < runs.length; k++) {
    const r = runs[k];
    const from = k === a ? i : 0;
    const to = k === b ? j : r.text.length;
    const box = boxOf(r, from, to);
    if (box) rects.push(box);
    parts.push(r.text.slice(from, to));
  }
  return { rects, text: joinLines(parts) };
}

/** Text as finding compares it: folded (case, accents, quotes, dashes), without spaces or hyphens, so line breaks and hyphenation do not matter. */
const keyOf = (s: string) => fold(s).replace(/[\s-]+/g, '');

/** A page as one folded text, each of its characters pointing back at a run's character (made once a page). */
const keys = new WeakMap<Run[], { key: string; at: [number, number][] }>();
function pageKey(runs: Run[]): { key: string; at: [number, number][] } {
  let k = keys.get(runs);
  if (!k) {
    let key = '';
    const at: [number, number][] = [];
    runs.forEach((r, ri) =>
      [...r.text].forEach((ch, ci) => {
        for (const f of keyOf(ch)) {
          key += f;
          at.push([ri, ci]);
        }
      }),
    );
    keys.set(runs, (k = { key, at }));
  }
  return k;
}

/**
 * Where `words` are on the page: each time they appear (as runs and characters), nearest to `near` first when given
 * (the top-left of where they were). Words broken over lines, hyphenated or not, are found too.
 */
export function findRuns(runs: Run[], words: string, near?: { x: number; y: number }): { rects: PdfRect[]; text: string; o: number }[] {
  const q = keyOf(words);
  if (!q) return [];
  const { key, at } = pageKey(runs);
  const found: { rects: PdfRect[]; text: string; o: number }[] = [];
  for (let i = key.indexOf(q); i >= 0 && found.length < 200; i = key.indexOf(q, i + 1)) {
    const [a, ci] = at[i];
    const [b, cj] = at[i + q.length - 1];
    found.push({ ...spanOf(runs, a, ci, b, cj + 1), o: orderOf(a, ci) });
  }
  if (near) {
    const d = (f: { rects: PdfRect[] }) => (f.rects[0] ? Math.hypot(f.rects[0].x - near.x, (f.rects[0].y - near.y) * 2) : Infinity);
    found.sort((x, y) => d(x) - d(y));
  }
  return found;
}

/** A place in the page's reading order: a run, and a character in it (the reader counts the same way). */
export const orderOf = (run: number, char: number) => run * 10_000 + Math.min(char, 9_999);

/** Where an area comes in the page's reading order: before the first run inside it or below its top in its column. */
export function areaOrder(runs: Run[], box: PdfRect): number {
  const i = runs.findIndex((r) => r.y + r.h / 2 >= box.y && r.x < box.x + box.w && r.x + r.w > box.x);
  return orderOf(i < 0 ? runs.length : i, 0);
}

/**
 * The words inside a box (an area dragged around a figure or an equation): characters whose middle is in it; and the
 * longest unbroken run of them with its box, which finds the area again when the file changes.
 */
export function wordsIn(runs: Run[], box: PdfRect): { text: string; anchor?: PdfRect & { t: string } } {
  const parts: string[] = [];
  const pick: { best?: PdfRect & { t: string } } = {};
  for (const r of runs) {
    if (r.y + r.h < box.y || r.y > box.y + box.h || r.x + r.w < box.x || r.x > box.x + box.w) continue;
    const my = r.y + r.h / 2;
    if (my < box.y || my > box.y + box.h) continue;
    let s = '';
    let from = -1;
    const piece = (to: number) => {
      const t = r.text.slice(from, to).trim();
      if (t && (!pick.best || t.replace(/\s/g, '').length > pick.best.t.replace(/\s/g, '').length)) {
        const b = boxOf(r, from, to);
        if (b) pick.best = { ...b, t };
      }
      from = -1;
    };
    for (let i = 0; i < r.text.length; i++) {
      const mx = (r.edges[i] + r.edges[i + 1]) / 2;
      if (mx >= box.x && mx <= box.x + box.w) {
        s += r.text[i];
        if (from < 0) from = i;
      } else {
        if (s && !s.endsWith(' ')) s += ' ';
        if (from >= 0) piece(i);
      }
    }
    if (from >= 0) piece(r.text.length);
    if (s.trim()) parts.push(s.trim());
  }
  const text = joinLines(parts);
  return pick.best ? { text, anchor: pick.best } : { text };
}

// ---- files, read once while they stay the same --------------------------------------------------------

export interface Loaded {
  file: string;
  data: Buffer;
  pdf: PdfFile;
  pages: Page[];
  mtime: number;
  size: number;
  runs(page: number): Run[];
  /** Its contents' fingerprint (made once). */
  hash(): string;
  /** What its own Title says, if anything. */
  infoTitle(): string | undefined;
}

const MAX_BYTES = 200 * 1024 * 1024;
const recent: Loaded[] = [];

/** A PDF read (a few kept while they do not change): its pages, and each page's runs once asked for. */
export function loadPdf(file: string): Loaded {
  const st = fs.statSync(file, { throwIfNoEntry: false });
  if (!st?.isFile()) throw Object.assign(new Error('Not found'), { status: 404 });
  if (st.size > MAX_BYTES) throw Object.assign(new Error(`The PDF is over ${MAX_BYTES / 1024 / 1024} MB.`), { status: 413 });
  const mtime = Math.floor(st.mtimeMs);
  const have = recent.find((l) => l.file === file && l.mtime === mtime && l.size === st.size);
  if (have) return have;
  const data = fs.readFileSync(file);
  if (!data.subarray(0, 1024).includes('%PDF-')) throw Object.assign(new Error('This is not a PDF file.'), { status: 415 });
  const pdf = new PdfFile(data);
  const list = pages(pdf);
  const cache = new Map<number, Run[]>();
  let hash = '';
  const l: Loaded = {
    file,
    data,
    pdf,
    pages: list,
    mtime,
    size: st.size,
    runs(n) {
      let r = cache.get(n);
      if (!r) {
        const p = list[n - 1];
        try {
          r = p ? runsOf(pageGlyphs(pdf, p)) : [];
        } catch {
          r = [];
        }
        cache.set(n, r);
      }
      return r;
    },
    hash: () => (hash ||= crypto.createHash('sha256').update(data).digest('hex').slice(0, 40)),
    infoTitle() {
      try {
        const t = pdf.resolve(pdf.dictOf(pdf.trailer.get('Info') ?? null)?.get('Title') ?? null);
        return t instanceof Str ? t.text() : undefined;
      } catch {
        return undefined;
      }
    },
  };
  for (let i = recent.length - 1; i >= 0; i--) if (recent[i].file === file) recent.splice(i, 1);
  recent.unshift(l);
  recent.length = Math.min(recent.length, 3);
  return l;
}

// ---- the paper's title ----------------------------------------------------------------------------------

/** What a PDF's own Title says, when it says something: not a file's name, nor a word processor's ("Microsoft Word - …"). */
function goodTitle(t: string | undefined): string {
  const s = (t ?? '')
    .replace(/^Microsoft (Word|PowerPoint) - /i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length < 6 || s.length > 300 || /\.(dvi|pdf|docx?|tex|pptx?|odt|ps)$/i.test(s) || /^(untitled|title|document|paper|slides?)$/i.test(s) || !/\p{L}{3}/u.test(s)) return '';
  return s;
}

/**
 * A paper's title: its file's own Title when it is one, else the largest words near the top of its first page (a
 * title on two lines joined), else the file's name.
 */
export function titleOf(l: Loaded, infoTitle: string | undefined, name: string): string {
  const own = goodTitle(infoTitle);
  if (own) return own;
  const first = l.pages[0];
  if (first) {
    const runs = l.runs(1).filter((r) => r.y < first.height * 0.45 && r.text.trim().length > 1);
    if (runs.length) {
      const sizes = runs.map((r) => r.size).sort((a, b) => a - b);
      const median = sizes[Math.floor(sizes.length / 2)];
      const big = Math.max(...sizes);
      if (big >= median * 1.2) {
        const lines = runs.filter((r) => r.size >= big * 0.92).sort((a, b) => a.y - b.y || a.x - b.x);
        const t = joinLines(lines.slice(0, 4).map((r) => r.text)).trim();
        if (t.length >= 4 && t.length <= 300) return t;
      }
    }
  }
  return name.replace(/\.pdf$/i, '');
}
