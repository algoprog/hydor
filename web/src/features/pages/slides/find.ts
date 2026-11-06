// Find and replace across a deck: the words of every text box and shape (in groups too), the cells of its tables, its
// charts' titles, labels and series' names, its equations' LaTeX, the web format's words (a quiz's question, choices,
// what each says and its explanation, a quiz score's words) and code, and the speaker notes, slide by slide in the
// order they are in. Replacing one match, or every one, makes a new deck (one step to undo); words replaced keep the
// look of the words where the match began.
import type { Deck, El, Run } from '@shared/slides';
import { findIn, replacementOf, type FindOptions } from '../common/find';

export interface Hit {
  /** The slide's index. */
  slide: number;
  /** A text box's or shape's words, a table's cell, a chart's words, an equation's LaTeX, a quiz's, a score's or code's words, the speaker notes. */
  where: 'part' | 'cell' | 'chart' | 'tex' | 'words' | 'notes';
  /** The part (a text box, a shape, a table, a chart, an equation, a quiz, a score, code). */
  id?: string;
  para?: number;
  cell?: [number, number];
  /**
   * In a chart: its title, a label (by its index) or a series' name (by its index); in a quiz: its question, a
   * choice or what it says (by its index), its explanation; a score's words; code.
   */
  field?: 'title' | 'label' | 'series' | WordsField;
  n?: number;
  /** In a chart: the words the match is in (to mark it where the chart draws them). */
  t?: string;
  s: number;
  e: number;
}

/** A chart's words, each where it is: its title, its labels, its series' names. */
const chartWords = (c: Extract<El, { type: 'chart' }>): { field: 'title' | 'label' | 'series'; n: number; t: string }[] => [
  ...(c.title ? [{ field: 'title' as const, n: 0, t: c.title }] : []),
  ...c.labels.map((t, n) => ({ field: 'label' as const, n, t })),
  ...c.series.map((x, n) => ({ field: 'series' as const, n, t: x.name })),
];

const paraText = (runs: Run[]) => runs.map((r) => r.t).join('');

type WordsField = 'question' | 'choice' | 'why' | 'explain' | 'score' | 'code';

/** The web format's words of a part, and code, each where it is (none for other parts). */
function wordsOf(e: El): { field: WordsField; n: number; t: string }[] {
  if (e.type === 'quiz')
    return [
      { field: 'question', n: 0, t: e.question },
      ...e.choices.flatMap((c, n) => [{ field: 'choice' as const, n, t: c.text }, ...(c.why ? [{ field: 'why' as const, n, t: c.why }] : [])]),
      ...(e.explain ? [{ field: 'explain' as const, n: 0, t: e.explain }] : []),
    ];
  if (e.type === 'score') return e.text ? [{ field: 'score', n: 0, t: e.text }] : [];
  if (e.type === 'code') return [{ field: 'code', n: 0, t: e.code }];
  return [];
}

/** A part with one of its words changed by `f` (a quiz's, a score's, code's). */
function withWords(e: El, field: WordsField, n: number, f: (t: string) => string): El {
  if (e.type === 'quiz') {
    if (field === 'question') return { ...e, question: f(e.question) };
    if (field === 'explain') return { ...e, explain: f(e.explain ?? '') || undefined };
    if (field === 'choice' || field === 'why') return { ...e, choices: e.choices.map((c, i) => (i !== n ? c : field === 'choice' ? { ...c, text: f(c.text) } : { ...c, why: f(c.why ?? '') || undefined })) };
  }
  if (e.type === 'score' && field === 'score') return { ...e, text: f(e.text ?? '') || undefined };
  if (e.type === 'code' && field === 'code') return { ...e, code: f(e.code) };
  return e;
}

/** Every match in the deck, in order. */
export function findInDeck(d: Deck, query: string, o: FindOptions): Hit[] {
  const out: Hit[] = [];
  if (!query) return out;
  d.slides.forEach((s, slide) => {
    const walk = (els: El[]) => {
      for (const e of els) {
        if (e.type === 'group') walk(e.els);
        else if (e.type === 'text' || e.type === 'shape') e.paras.forEach((p, para) => findIn(paraText(p.runs), query, o).forEach((m) => out.push({ slide, where: 'part', id: e.id, para, ...m })));
        else if (e.type === 'table') e.rows.forEach((row, r) => row.forEach((v, c) => findIn(v, query, o).forEach((m) => out.push({ slide, where: 'cell', id: e.id, cell: [r, c], ...m }))));
        else if (e.type === 'chart') for (const w of chartWords(e)) findIn(w.t, query, o).forEach((m) => out.push({ slide, where: 'chart', id: e.id, field: w.field, n: w.n, t: w.t, ...m }));
        else if (e.type === 'math') findIn(e.tex, query, o).forEach((m) => out.push({ slide, where: 'tex', id: e.id, ...m }));
        else for (const w of wordsOf(e)) findIn(w.t, query, o).forEach((m) => out.push({ slide, where: 'words', id: e.id, field: w.field, n: w.n, t: w.t, ...m }));
      }
    };
    walk(s.els);
    if (s.notes) findIn(s.notes, query, o).forEach((m) => out.push({ slide, where: 'notes', ...m }));
  });
  return out;
}

/** Runs with [s, e) of their words replaced by `text`, which takes the look of the run the match began in. */
export function spliceRuns(runs: Run[], s: number, e: number, text: string): Run[] {
  const out: Run[] = [];
  let at = 0;
  let put = false;
  for (const r of runs) {
    const a = at;
    const b = at + r.t.length;
    at = b;
    if (b <= s || a >= e || !r.t) {
      if (!put && a >= e && text) {
        // The match ended where this run begins (it was in runs before): its words go before this one.
        out.push({ ...(out[out.length - 1] ?? r), t: text });
        put = true;
      }
      out.push(r);
      continue;
    }
    const before = r.t.slice(0, Math.max(0, s - a));
    const after = r.t.slice(Math.max(0, e - a));
    const mid = !put ? text : '';
    put = true;
    if (before + mid + after) out.push({ ...r, t: before + mid + after });
  }
  if (!put && text) out.push({ ...(runs[runs.length - 1] ?? { t: '' }), t: text });
  return out.length ? out : [{ t: '' }];
}

/** The deck with the match of `h` replaced. */
export function replaceHit(d: Deck, h: Hit, query: string, replacement: string, o: FindOptions): Deck {
  return {
    ...d,
    slides: d.slides.map((s, i) => {
      if (i !== h.slide) return s;
      if (h.where === 'notes') {
        const t = s.notes ?? '';
        const notes = t.slice(0, h.s) + replacementOf(t, h, query, replacement, o) + t.slice(h.e);
        return { ...s, notes: notes || undefined };
      }
      const map = (els: El[]): El[] =>
        els.map((e) => {
          if (e.type === 'group') return { ...e, els: map(e.els) };
          if (e.id !== h.id) return e;
          if (h.where === 'cell' && e.type === 'table' && h.cell) {
            const [r, c] = h.cell;
            const t = e.rows[r]?.[c] ?? '';
            return { ...e, rows: e.rows.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? t.slice(0, h.s) + replacementOf(t, h, query, replacement, o) + t.slice(h.e) : v)) : row)) };
          }
          const swapIn = (t: string) => t.slice(0, h.s) + replacementOf(t, h, query, replacement, o) + t.slice(h.e);
          if (h.where === 'chart' && e.type === 'chart') {
            if (h.field === 'title') return { ...e, title: swapIn(e.title ?? '') || undefined };
            if (h.field === 'label') return { ...e, labels: e.labels.map((l, i) => (i === h.n ? swapIn(l) : l)) };
            return { ...e, series: e.series.map((x, i) => (i === h.n ? { ...x, name: swapIn(x.name) } : x)) };
          }
          // An equation left empty keeps its LaTeX: a deck has no empty equations.
          if (h.where === 'tex' && e.type === 'math') return { ...e, tex: swapIn(e.tex) || e.tex };
          if (h.where === 'words' && h.field && h.field !== 'title' && h.field !== 'label' && h.field !== 'series') return withWords(e, h.field, h.n ?? 0, swapIn);
          if ((e.type === 'text' || e.type === 'shape') && h.para !== undefined) {
            return { ...e, paras: e.paras.map((p, pi) => (pi === h.para ? { ...p, runs: spliceRuns(p.runs, h.s, h.e, replacementOf(paraText(p.runs), h, query, replacement, o)) } : p)) };
          }
          return e;
        });
      return { ...s, els: map(s.els) };
    }),
  };
}

/** The deck with every match replaced, and how many there were. */
export function replaceAllInDeck(d: Deck, query: string, replacement: string, o: FindOptions): { deck: Deck; count: number } {
  let count = 0;
  const swap = (t: string) => {
    const ms = findIn(t, query, o, Number.MAX_SAFE_INTEGER);
    count += ms.length;
    let out = '';
    let at = 0;
    for (const m of ms) {
      out += t.slice(at, m.s) + replacementOf(t, m, query, replacement, o);
      at = m.e;
    }
    return ms.length ? out + t.slice(at) : t;
  };
  const map = (els: El[]): El[] =>
    els.map((e) => {
      if (e.type === 'group') return { ...e, els: map(e.els) };
      if (e.type === 'table') return { ...e, rows: e.rows.map((row) => row.map(swap)) };
      if (e.type === 'chart') return { ...e, ...(e.title ? { title: swap(e.title) || undefined } : {}), labels: e.labels.map(swap), series: e.series.map((x) => ({ ...x, name: swap(x.name) })) };
      if (e.type === 'math') return { ...e, tex: swap(e.tex) || e.tex };
      if (e.type === 'quiz' || e.type === 'score' || e.type === 'code') return wordsOf(e).reduce<El>((x, w) => withWords(x, w.field, w.n, swap), e);
      if (e.type !== 'text' && e.type !== 'shape') return e;
      return {
        ...e,
        paras: e.paras.map((p) => {
          const t = paraText(p.runs);
          const ms = findIn(t, query, o, Number.MAX_SAFE_INTEGER);
          if (!ms.length) return p;
          count += ms.length;
          // From the last match back, so the earlier ones stay where they were.
          let runs = p.runs;
          for (const m of [...ms].reverse()) runs = spliceRuns(runs, m.s, m.e, replacementOf(t, m, query, replacement, o));
          return { ...p, runs };
        }),
      };
    });
  const slides = d.slides.map((s) => ({ ...s, els: map(s.els), ...(s.notes ? { notes: swap(s.notes) || undefined } : {}) }));
  return { deck: count ? { ...d, slides } : d, count };
}
