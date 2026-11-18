// Lists glide to their new places: a row that moved (a session that went into Active or Pinned, a list put in another
// order, rows closing up where one went) slides there from where it was, in 200 ms, instead of jumping. This is FLIP:
// the places are measured before and after, and each row that moved is animated from the difference.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motionOn } from './motion';

const EASE = 'cubic-bezier(.2,.8,.2,1)';

/** The rows of a list (those with data-flip="<key>") and their tops, measured from the list's own top (scrolling does not change them). */
function measure(root: HTMLElement): Map<string, { el: HTMLElement; top: number }> {
  const out = new Map<string, { el: HTMLElement; top: number }>();
  const base = root.getBoundingClientRect().top;
  for (const el of root.querySelectorAll<HTMLElement>('[data-flip]')) out.set(el.dataset.flip!, { el, top: el.getBoundingClientRect().top - base });
  return out;
}

/** Slides `rows` from where they were (`before`, tops by key) to where they are, if they moved. Rows that are new stay still. */
export function glideRows(rows: Map<string, { el: HTMLElement; top: number }>, before: Map<string, number>, ms = 200) {
  const wh = window.innerHeight;
  let moved = 0;
  for (const [key, { el, top }] of rows) {
    const was = before.get(key);
    if (was === undefined) continue;
    const dy = was - top;
    if (Math.abs(dy) < 1 || Math.abs(dy) > 900) continue;
    // Only what shows (before or after): a long list moving far away is nobody's to watch.
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 && r.bottom + dy < 0) continue;
    if (r.top > wh && r.top + dy > wh) continue;
    if (++moved > 80) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { id: 'flip', duration: ms, easing: EASE });
  }
}

/**
 * Makes the rows (data-flip) of the list that `ref` goes on glide whenever the component renders them in other places.
 * `paused` (a row being dragged: it moves by itself) and `ready` (the list has loaded) hold it back, and nothing glides
 * under Motion: Off or in a tab nobody sees.
 */
export function useFlip(paused = false, ready = true) {
  const root = useRef<HTMLElement | null>(null);
  const tops = useRef(new Map<string, number>());
  const ref = useCallback((el: HTMLElement | null) => {
    root.current = el;
  }, []);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // What is still gliding from the last change is stopped first: the places measured are the real ones.
    for (const a of el.getAnimations({ subtree: true })) if (a.id === 'flip') a.cancel();
    const now = measure(el);
    if (!paused && ready && motionOn() && !document.hidden) glideRows(now, tops.current);
    tops.current = new Map([...now].map(([k, v]) => [k, v.top]));
  });
  useEffect(() => () => void tops.current.clear(), []);
  return ref;
}

/** What a row of a list is doing as the list changes: opening (it is new), closing (it is gone, kept a moment to close up), or nothing. */
export type RowPhase = 'open' | 'close' | '';

/**
 * A list whose rows open when they are new and close up when they go: the rows as they are now, each with its phase,
 * and the rows that went kept (closing) where they were for 140 ms. Draw each in a `.row-fold` with `.row-open` or
 * `.row-close` for its phase (styles.css); the rows below follow by themselves as the height changes. Nothing on first
 * sight of the list, and nothing under Motion: Off.
 */
export function useRowPhases<T extends { id: string }>(rows: T[]): { row: T; phase: RowPhase }[] {
  const prev = useRef<T[] | null>(null);
  const [opening, setOpening] = useState<Set<string>>(() => new Set());
  const [ghosts, setGhosts] = useState<{ row: T; at: number }[]>([]);
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = rows;
    if (!was || !motionOn() || document.hidden) return;
    const had = new Set(was.map((r) => r.id));
    const has = new Set(rows.map((r) => r.id));
    const added = rows.filter((r) => !had.has(r.id)).map((r) => r.id);
    const gone = was.map((row, at) => ({ row, at })).filter((g) => !has.has(g.row.id));
    if (added.length) {
      setOpening((o) => new Set([...o, ...added]));
      window.setTimeout(() => setOpening((o) => new Set([...o].filter((id) => !added.includes(id)))), 200);
    }
    if (gone.length) {
      setGhosts((g) => [...g, ...gone]);
      window.setTimeout(() => setGhosts((g) => g.filter((x) => !gone.includes(x))), 150);
    }
  }, [rows]);
  const out: { row: T; phase: RowPhase }[] = rows.map((row) => ({ row, phase: opening.has(row.id) ? 'open' : '' }));
  for (const g of [...ghosts].sort((a, b) => a.at - b.at)) if (!rows.some((r) => r.id === g.row.id)) out.splice(Math.min(g.at, out.length), 0, { row: g.row, phase: 'close' });
  return out;
}
