// The spreadsheet editor's AI cells (=AI(prompt, cells…)), and what its AI helpers send of the sheet. An AI cell's answer
// is worked out once and kept with the workbook, by the key of what it asked (its prompt and its cells' values): it is
// asked when the cell is typed or its cells change here, many cells in one call (a column filled down is one question
// to the helper model, not one a row), and never just because the sheet was opened: cells that wait for an answer
// when it opens (an agent wrote them, or they came in a file) wait for Ask now. Refresh asks a cell again. The answers
// are not a step of Undo: undoing a formula brings its answer back as it was, without asking again.
import { useEffect, useRef, useState } from 'react';
import { AI_BATCH, type SheetAiAnswer, type SheetAiCost, type SheetContext } from '@shared/sheet-ai';
import { colName, computeBook, formatValue, refName, type AiAsk, type Calc, type CellValue, type Rect, type Sheet, type Workbook } from '@shared/sheets';
import { regionAround } from '@shared/sheet-tools';
import { api, post } from '../../../lib/api';
import { toast, toastError } from '../../../lib/store';

/** Whether a formula asks the AI function. */
export const asksAi = (f: string | undefined) => f !== undefined && /(^|[^A-Za-z0-9_.])AI\s*\(/i.test(f);

let cost: Promise<SheetAiCost | null> | null = null;
/** What the AI helpers cost with the helper model picked now (asked of the server once a page load). */
export const aiCost = () => (cost ??= api<SheetAiCost>('/api/write/sheet-ai-cost').catch(() => null));

const SEEN = 'wa.sheet.aiCost';
/** The first time this browser asks the helper model for a spreadsheet's AI cells: what it costs, said once. */
export function costOnce() {
  if (localStorage.getItem(SEEN)) return;
  localStorage.setItem(SEEN, '1');
  void aiCost().then((c) => c && toast(`AI cells: ${c.note} Each answer is kept with the sheet, and asked again only when its prompt or cells change, or with Refresh.`));
}

/** Rows of a range as words, under the columns' letters, each with its row number: what the AI helpers are shown of a sheet. */
export function tableText(sh: Sheet, calc: Calc, si: number, x: Rect, maxRows = 60, maxCols = 30): string {
  const c2 = Math.min(x.c2, x.c1 + maxCols - 1);
  const r2 = Math.min(x.r2, x.r1 + maxRows - 1);
  const lines = [`    | ${Array.from({ length: c2 - x.c1 + 1 }, (_, j) => colName(x.c1 + j)).join(' | ')}`];
  for (let r = x.r1; r <= r2; r++) {
    const cells: string[] = [];
    for (let c = x.c1; c <= c2; c++) {
      const v = calc.value(si, r, c);
      cells.push(v === null ? '' : formatValue(v, sh.cells[refName(r, c)]?.s).replace(/\s+/g, ' ').slice(0, 80));
    }
    lines.push(`${String(r + 1).padStart(3)} | ${cells.join(' | ')}`);
  }
  if (r2 < x.r2) lines.push(`… ${x.r2 - r2} more rows, to row ${x.r2 + 1}`);
  return lines.join('\n');
}

/** The sheet around a cell, as the AI helpers take it: the table it is in (or beside), the other sheets' and the named ranges' names. */
export function contextFor(book: Workbook, sh: Sheet, calc: Calc, si: number, r: number, c: number): SheetContext {
  const e = calc.extent(si);
  let x = regionAround(sh, r, c, Math.max(e.rows, r + 1), Math.max(e.cols, c + 1));
  // An empty cell away from the cells: all of the sheet's, with the cell's row and column.
  if (x.r1 === x.r2 && x.c1 === x.c2 && e.rows) x = { r1: 0, c1: 0, r2: Math.max(e.rows - 1, r), c2: Math.max(e.cols - 1, c) };
  x = { r1: Math.min(x.r1, r), c1: Math.min(x.c1, c), r2: Math.max(x.r2, r), c2: Math.max(x.c2, c) };
  return {
    sheet: sh.name,
    at: refName(r, c),
    table: tableText(sh, calc, si, x),
    sheets: book.sheets.filter((s) => s.id !== sh.id).map((s) => s.name),
    names: (book.names ?? []).map((n) => `${n.name} = ${n.ref}`),
  };
}

/** Every AI cell of the workbook worked out: what they ask that has no answer yet, every key they look for, and where they are. */
export function aiScan(book: Workbook, calc: Calc): { asks: AiAsk[]; used: Set<string>; cells: { sheet: string; cell: string }[] } {
  const cells: { sheet: string; cell: string }[] = [];
  for (const sh of book.sheets)
    for (const [k, cell] of Object.entries(sh.cells)) {
      if (!asksAi(cell.f)) continue;
      calc.get(sh.id, k);
      cells.push({ sheet: sh.id, cell: k });
    }
  return { asks: calc.aiAsks(), used: new Set(calc.aiKeys()), cells };
}

/** The keys some AI cells look for: worked out in a copy without answers, so each says what it would ask. */
export function keysOf(book: Workbook, cells: { sheet: string; cell: string }[]): Set<string> {
  const calc = computeBook({ ...book, ai: undefined });
  for (const { sheet, cell } of cells) calc.get(sheet, cell);
  return new Set(calc.aiAsks().map((a) => a.key));
}

export type AiState = { state: 'asking' | 'waiting' | 'failed'; why?: string };

export interface AiCells {
  /** What an AI cell without its answer shows instead of #BUSY!: being asked, waiting for Ask now, or why it has none. */
  stateOf(sheet: string, cell: string): AiState | null;
  /** Cells waiting for Ask now (and those that failed), and those being asked. */
  waiting: number;
  asking: number;
  /** Asks the cells that wait (those there when the sheet was opened, and those that failed). */
  askWaiting(): void;
  /** Asks these cells again, their answers forgotten; every AI cell of the workbook when none are given. */
  refresh(cells?: { sheet: string; cell: string }[]): void;
  /** The keys the workbook's AI cells look for now (the answers kept when it is saved). */
  used(): Set<string>;
}

/**
 * The editor's AI cells: asked as they come (a moment after a change, in batches, two calls at a time), those waiting
 * when the workbook was opened (`docKey`) held for Ask now. `onAnswers` puts answers in (not a step of Undo);
 * `onForget` takes some out, to ask them again.
 */
export function useAiCells(o: { book: () => Workbook | null; calc: () => Calc | null; rev: number; docKey: string | undefined; readOnly: boolean; onAnswers: (a: Record<string, CellValue>) => void; onForget: (keys: string[]) => void }): AiCells {
  const opts = useRef(o);
  opts.current = o;
  const held = useRef<Set<string> | null>(null);
  const flying = useRef(new Set<string>());
  const failed = useRef(new Map<string, string>());
  const queue = useRef<AiAsk[]>([]);
  const running = useRef(0);
  const asksNow = useRef<AiAsk[]>([]);
  const [, bump] = useState(0);
  const redraw = () => bump((n) => n + 1);

  const pump = () => {
    while (running.current < 2 && queue.current.length) {
      const batch = queue.current.splice(0, AI_BATCH);
      running.current++;
      void post<SheetAiAnswer>('/api/write/sheet-ai', { asks: batch.map(({ key, prompt, context }) => ({ key, prompt, context })) })
        .then((r) => {
          for (const [k, why] of Object.entries(r.failed ?? {})) failed.current.set(k, why);
          if (Object.keys(r.answers).length) opts.current.onAnswers(r.answers);
        })
        .catch((e) => {
          for (const a of batch) failed.current.set(a.key, (e as Error).message);
          toastError(e);
        })
        .finally(() => {
          for (const a of batch) flying.current.delete(a.key);
          running.current--;
          redraw();
          pump();
        });
    }
  };

  /** The AI cells worked out: what they ask anew (not held, not failed, not on its way) is asked. */
  const look = () => {
    const book = opts.current.book();
    const calc = opts.current.calc();
    if (!book || !calc) return;
    const { asks } = aiScan(book, calc);
    asksNow.current = asks;
    if (held.current === null) held.current = new Set(asks.map((a) => a.key));
    else if (!opts.current.readOnly) {
      const fresh = new Map<string, AiAsk>();
      for (const a of asks) if (!held.current.has(a.key) && !failed.current.has(a.key) && !flying.current.has(a.key)) fresh.set(a.key, a);
      if (fresh.size) {
        costOnce();
        for (const a of fresh.values()) {
          flying.current.add(a.key);
          queue.current.push(a);
        }
        pump();
      }
    }
    redraw();
  };

  // Another workbook (or a new version of it): what waits in it now is held for Ask now.
  useEffect(() => {
    held.current = null;
    failed.current.clear();
    queue.current = [];
  }, [o.docKey]);
  useEffect(() => {
    const t = setTimeout(look, 350);
    return () => clearTimeout(t);
  }, [o.rev, o.docKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const unhold = (keys: Iterable<string>) => {
    for (const k of keys) {
      held.current?.delete(k);
      failed.current.delete(k);
    }
  };

  return {
    stateOf(sheet, cell) {
      const a = asksNow.current.find((x) => x.sheet === sheet && x.cell === cell);
      if (!a) return null;
      if (flying.current.has(a.key)) return { state: 'asking' };
      const why = failed.current.get(a.key);
      if (why) return { state: 'failed', why };
      return held.current?.has(a.key) || o.readOnly ? { state: 'waiting' } : { state: 'asking' };
    },
    waiting: asksNow.current.filter((a) => !flying.current.has(a.key) && (held.current?.has(a.key) || failed.current.has(a.key))).length,
    asking: flying.current.size,
    askWaiting() {
      unhold(asksNow.current.map((a) => a.key));
      look();
    },
    refresh(cells) {
      const book = opts.current.book();
      const calc = opts.current.calc();
      if (!book || !calc) return;
      const want = (cells ?? aiScan(book, calc).cells).filter(({ sheet, cell }) => asksAi(book.sheets.find((s) => s.id === sheet)?.cells[cell]?.f));
      if (!want.length) return void toast('No AI cell is picked');
      const keys = keysOf(book, want);
      unhold(keys);
      // Their answers forgotten: the next look asks them (the change brings it about).
      opts.current.onForget([...keys]);
    },
    used() {
      const book = opts.current.book();
      const calc = opts.current.calc();
      return book && calc ? aiScan(book, calc).used : new Set();
    },
  };
}
