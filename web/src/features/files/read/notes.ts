// What Files' PDF reader works with: a PDF's highlights and notes as the server keeps them (server/pdfnotes), each
// page's words with where they are, and the arithmetic between them and the page: words laid over the picture as
// spans the browser selects, a selection read back as runs and characters, boxes for the words picked.
import { api, enc, post } from '../../../lib/api';
import { mu } from '../../../lib/machine';
import { toast } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { HIGHLIGHT_RGB, joinLines, type HighlightColor, type PdfHighlight, type PdfNotesView, type PdfRect, type TextRun } from '@shared/pdfnotes';

export const loadNotes = (path: string) => api<PdfNotesView>(`/api/pdf-notes?path=${enc(path)}`);

/** This page's own name for its changes: the news of them that comes back is not news to it. */
export const TAB = `t${Math.random().toString(36).slice(2, 10)}`;

export const changeNotes = (path: string, o: { put?: Partial<PdfHighlight>[]; remove?: string[] }) => post<PdfNotesView>('/api/pdf-notes', { path, ...o, from: TAB });

/** A page's words, read once a page and file. */
const textCache = new Map<string, Promise<TextRun[]>>();
export function pageRuns(path: string, page: number, mtime: number): Promise<TextRun[]> {
  const key = `${path}\0${page}\0${mtime}`;
  let p = textCache.get(key);
  if (!p) {
    p = api<{ runs: TextRun[] }>(`/api/pdf-notes/text?path=${enc(path)}&page=${page}`).then(
      (r) => r.runs,
      (e) => {
        textCache.delete(key);
        throw e;
      },
    );
    textCache.set(key, p);
    if (textCache.size > 400) textCache.delete(textCache.keys().next().value!);
  }
  return p;
}

export const pageUrl = (path: string, page: number, width: number, mtime: number) => mu(`/api/pdf-notes/page?path=${enc(path)}&page=${page}&width=${width}&v=${mtime}`);

export const areaUrl = (path: string, page: number, r: PdfRect, width: number, mtime: number) =>
  mu(`/api/pdf-notes/area?path=${enc(path)}&page=${page}&x=${r.x.toFixed(2)}&y=${r.y.toFixed(2)}&w=${r.w.toFixed(2)}&h=${r.h.toFixed(2)}&width=${Math.round(width)}&v=${mtime}`);

/** A part of a page as a PNG (base64 and a blob), for an agent to see or to copy. */
export async function areaPicture(path: string, page: number, r: PdfRect, mtime: number): Promise<{ blob: Blob; base64: string }> {
  // Sharp enough to read an equation's small print: about 3 pixels a point, within reason.
  const width = Math.max(300, Math.min(1600, r.w * 3));
  const res = await fetch(areaUrl(path, page, r, width, mtime), { credentials: 'same-origin' });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const base64 = await new Promise<string>((ok, no) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => no(fr.error);
    fr.readAsDataURL(blob);
  });
  return { blob, base64 };
}

/** Copies words, on a page served over plain http too (where the clipboard API is missing); says so. */
export async function copyWords(text: string, done = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(tr(done), 'ok');
    return;
  } catch {}
  const t = document.createElement('textarea');
  t.value = text;
  t.style.position = 'fixed';
  t.style.opacity = '0';
  document.body.appendChild(t);
  t.select();
  const ok = document.execCommand('copy');
  t.remove();
  toast(ok ? tr(done) : tr('The browser did not allow copying'), ok ? 'ok' : 'error');
}

export const COLOR_NAMES: Record<HighlightColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };

export const rgbOf = (c: HighlightColor, a = 1) => `rgba(${HIGHLIGHT_RGB[c].join(',')},${a})`;
/** The colour a shade darker, for an area's outline and a note's mark. */
export const deepOf = (c: HighlightColor) => `rgb(${HIGHLIGHT_RGB[c].map((v) => Math.round(v * 0.72)).join(',')})`;

const COLOR_KEY = 'wa.pdf.color';
export const lastColor = (): HighlightColor => {
  const c = localStorage.getItem(COLOR_KEY);
  return c === 'green' || c === 'blue' || c === 'pink' ? c : 'yellow';
};
export const keepColor = (c: HighlightColor) => localStorage.setItem(COLOR_KEY, c);

let seq = 0;
export const newId = () => `h${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// ---- the words laid over the page -------------------------------------------------------------------------------

let measurer: CanvasRenderingContext2D | null = null;
const widths = new Map<string, number>();
/** A word's width in the font the spans use, at 100px (kept: a page has the same words again and again). */
export function wordWidth(w: string): number {
  let v = widths.get(w);
  if (v === undefined) {
    measurer ??= document.createElement('canvas').getContext('2d');
    if (measurer) measurer.font = '100px sans-serif';
    v = measurer ? measurer.measureText(w).width : w.length * 55;
    widths.set(w, v);
    if (widths.size > 20_000) widths.clear();
  }
  return v;
}

/** The words of a run: where each starts and ends in its text (spaces between them left out). */
export function wordsOf(t: string): [number, number][] {
  const out: [number, number][] = [];
  const re = /\S+/g;
  for (let m = re.exec(t); m; m = re.exec(t)) out.push([m.index, m.index + m[0].length]);
  return out;
}

/** The box of characters [from, to) of a run, spaces at either end left out. */
export function boxOf(r: TextRun, from: number, to: number): PdfRect | null {
  while (from < to && r.t[from] === ' ') from++;
  while (to > from && r.t[to - 1] === ' ') to--;
  if (to <= from) return null;
  return { x: r.e[from], y: r.y, w: Math.max(0.5, r.e[to] - r.e[from]), h: r.h };
}

/** A place in a page's reading order, as the server counts it (a run, then a character). */
export const orderOf = (run: number, char: number) => run * 10_000 + Math.min(char, 9_999);

/** A place in the words: a page, a run on it, a character in the run. */
export interface TextPoint {
  page: number;
  run: number;
  char: number;
}

/** Where a selection's end is in the words: from the span it is in (or beside), as its page laid them. */
export function pointOf(node: Node, offset: number, end: boolean): TextPoint | null {
  const span = (n: Node | null) => (n instanceof HTMLElement && n.dataset.r !== undefined ? n : null);
  const at = (s: HTMLElement, i: number): TextPoint | null => {
    const page = Number(s.closest<HTMLElement>('[data-page]')?.dataset.page);
    return page ? { page, run: Number(s.dataset.r), char: Number(s.dataset.c) + i } : null;
  };
  if (node.nodeType === Node.TEXT_NODE) {
    const s = span(node.parentElement);
    return s ? at(s, offset) : null;
  }
  const own = span(node);
  if (own) return at(own, offset > 0 ? (own.textContent ?? '').length : 0);
  // Between spans (the layer itself): the next one's start, or the last one's end.
  const kids = node.childNodes;
  if (end) {
    for (let i = Math.min(offset, kids.length) - 1; i >= 0; i--) {
      const s = span(kids[i]) ?? (kids[i] instanceof HTMLElement ? span((kids[i] as HTMLElement).querySelector('[data-r]:last-of-type')) : null);
      if (s) return at(s, (s.textContent ?? '').length);
    }
  } else {
    for (let i = offset; i < kids.length; i++) {
      const s = span(kids[i]) ?? (kids[i] instanceof HTMLElement ? span((kids[i] as HTMLElement).querySelector('[data-r]')) : null);
      if (s) return at(s, 0);
    }
  }
  return null;
}

/** What was picked of a page's words: its boxes, its words as they read, and where it starts in the page's reading order. */
export interface PagePiece {
  page: number;
  rects: PdfRect[];
  text: string;
  o: number;
}

/** A selection from one place to another, page by page (pages whose words are not here yet are left out). */
export function piecesOf(from: TextPoint, to: TextPoint, runsOf: (page: number) => TextRun[] | undefined): PagePiece[] {
  const out: PagePiece[] = [];
  for (let p = from.page; p <= to.page; p++) {
    const runs = runsOf(p);
    if (!runs?.length) continue;
    const a = p === from.page ? from.run : 0;
    const i = p === from.page ? from.char : 0;
    const b = p === to.page ? to.run : runs.length - 1;
    const j = p === to.page ? to.char : (runs[runs.length - 1]?.t.length ?? 0);
    const rects: PdfRect[] = [];
    const parts: string[] = [];
    for (let k = a; k <= b && k < runs.length; k++) {
      const r = runs[k];
      const s = k === a ? i : 0;
      const e = k === b ? j : r.t.length;
      const box = boxOf(r, s, e);
      if (box) rects.push(box);
      parts.push(r.t.slice(s, e));
    }
    const text = joinLines(parts);
    if (rects.length && text) out.push({ page: p, rects, text, o: orderOf(a, i) });
  }
  return out;
}

/** Whether a point (points from the page's top-left) is on a highlight: the last one drawn first. */
export function hitHighlight(hs: PdfHighlight[], page: number, x: number, y: number): PdfHighlight | null {
  for (let i = hs.length - 1; i >= 0; i--) {
    const h = hs[i];
    if (h.page !== page) continue;
    const pad = h.kind === 'area' ? 0 : 1.5;
    if (h.rects.some((r) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad)) return h;
  }
  return null;
}

/** The notes as text to paste elsewhere: the paper, then each highlight by page with its note. */
export function notesText(title: string, hs: PdfHighlight[]): string {
  const out = [title];
  let page = 0;
  for (const h of hs) {
    if (h.page !== page) {
      page = h.page;
      out.push('', `Page ${page}`);
    }
    out.push(h.kind === 'area' ? `- [A figure or an equation]${h.text ? ` ${h.text}` : ''}` : `- “${h.text ?? ''}”`);
    if (h.note?.trim()) out.push(...h.note.trim().split('\n').map((l) => `  ${l}`));
  }
  return out.join('\n');
}
