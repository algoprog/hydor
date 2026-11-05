// Find and replace in a document: every match in its words (paragraphs, list items and tables' cells; never inside an
// equation's LaTeX) worked out from the model with the shared matcher, each marked in the page (the CSS Custom
// Highlight API; where a browser has none, boxes drawn over the words), the current one in a stronger colour and
// scrolled into view. Replace puts words in the current one's place, Replace all in every one's, as one change to undo.
import { useEffect, useMemo, useState } from 'react';
import type { Doc } from '@shared/docs';
import { findIn, replacementOf, type FindOptions } from '../common/find';
import type { FindState } from '../common/FindBar';
import type { DocEngine } from './engine';
import * as ops from './ops';

/** Every match of a query in a document, in order. */
export function findAll(doc: Doc, query: string, o: FindOptions): ops.Found[] {
  if (!query) return [];
  const out: ops.Found[] = [];
  for (const bx of ops.allBoxes(doc)) {
    for (const m of findIn(ops.searchText(bx.runs), query, o, 10_000 - out.length)) out.push({ b: bx.b, ...(bx.c ? { c: bx.c } : {}), s: m.s, e: m.e });
    if (out.length >= 10_000) break;
  }
  return out;
}

type HighlightsApi = { set: (k: string, h: unknown) => void; delete: (k: string) => void };
const highlights = (): HighlightsApi | null => ((globalThis as unknown as { CSS?: { highlights?: HighlightsApi } }).CSS?.highlights ?? null);
const HighlightCtor = (globalThis as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

/** A match as a range of the page, if it is drawn. */
function rangeOf(engine: DocEngine, f: ops.Found): Range | null {
  const a = engine.domOf({ b: f.b, ...(f.c ? { c: f.c } : {}), o: f.s });
  const z = engine.domOf({ b: f.b, ...(f.c ? { c: f.c } : {}), o: f.e });
  if (!a || !z) return null;
  const r = document.createRange();
  try {
    r.setStart(a.node, a.offset);
    r.setEnd(z.node, z.offset);
  } catch {
    return null;
  }
  return r;
}

/** The boxes to draw over matches where the browser cannot mark them itself: in the host's own coordinates. */
export interface MarkBox {
  x: number;
  y: number;
  w: number;
  h: number;
  now: boolean;
}

export function useDocFind(engine: DocEngine | null, model: Doc | null, find: FindState, host: HTMLElement | null, tick: unknown) {
  const [index, setIndex] = useState(0);
  const [boxes, setBoxes] = useState<MarkBox[]>([]);
  const matches = useMemo(() => (find.open && model ? findAll(model, find.query, find.options) : []), [find.open, find.query, find.options, model?.blocks]);
  // A new search starts at the first match after the caret.
  useEffect(() => {
    if (!engine || !model || !matches.length) return setIndex(0);
    const [s] = engine.range();
    const k = matches.findIndex((m) => ops.cmp(model, { b: m.b, ...(m.c ? { c: m.c } : {}), o: m.s }, s) >= 0);
    setIndex(k < 0 ? 0 : k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [find.query, find.options, find.open]);
  const current = matches.length ? Math.min(index, matches.length - 1) : -1;

  // Marked in the page, after the page is drawn.
  useEffect(() => {
    const api = highlights();
    if (!engine || !find.open || !matches.length) {
      api?.delete('nd-find');
      api?.delete('nd-find-now');
      setBoxes([]);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const ranges = matches.slice(0, 2000).map((m) => rangeOf(engine, m));
      const now = current >= 0 ? ranges[current] : null;
      if (api && HighlightCtor) {
        api.set('nd-find', new HighlightCtor(...(ranges.filter((r, k) => r && k !== current) as Range[])));
        if (now) api.set('nd-find-now', new HighlightCtor(now));
        else api.delete('nd-find-now');
      } else if (host) {
        const hr = host.getBoundingClientRect();
        const out: MarkBox[] = [];
        ranges.forEach((r, k) => {
          if (!r) return;
          for (const c of r.getClientRects()) out.push({ x: c.left - hr.left, y: c.top - hr.top, w: c.width, h: c.height, now: k === current });
        });
        setBoxes(out);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [engine, find.open, matches, current, host, tick]);
  useEffect(
    () => () => {
      highlights()?.delete('nd-find');
      highlights()?.delete('nd-find-now');
    },
    [],
  );

  // The current one scrolled into view.
  useEffect(() => {
    if (!engine || current < 0 || !find.open) return;
    const r = rangeOf(engine, matches[current]);
    const rect = r?.getBoundingClientRect();
    if (!rect) return;
    let sc: HTMLElement | null = engine.root.parentElement;
    while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement;
    if (!sc) return;
    const box = sc.getBoundingClientRect();
    if (rect.top < box.top + 60 || rect.bottom > box.bottom - 40) sc.scrollTop += rect.top - box.top - box.height / 3;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, matches]);

  const step = (by: number) => matches.length && setIndex((current + by + matches.length) % matches.length);
  const textOf = (f: ops.Found) => (model ? ops.searchText(ops.boxRuns(model, f.b, f.c) ?? []) : '');
  return {
    matches,
    count: matches.length,
    index: current,
    next: () => step(1),
    prev: () => step(-1),
    replace: () => {
      if (!engine || current < 0) return;
      const f = matches[current];
      engine.replace([f], (x) => replacementOf(textOf(x), { s: x.s, e: x.e }, find.query, find.replacement, find.options));
    },
    replaceAll: () => {
      if (!engine || !matches.length) return;
      engine.replace(matches, (x) => replacementOf(textOf(x), { s: x.s, e: x.e }, find.query, find.replacement, find.options));
    },
    /** The current match picked in the page (when the bar closes). */
    select: () => {
      if (!engine || current < 0) return;
      const f = matches[current];
      const at = { b: f.b, ...(f.c ? { c: f.c } : {}) };
      engine.place({ a: { ...at, o: f.s }, f: { ...at, o: f.e } });
    },
    boxes,
  };
}
