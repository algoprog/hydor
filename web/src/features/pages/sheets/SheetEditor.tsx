// A spreadsheet to edit, as in Excel or Google Sheets: the grid of cells (Grid), the formula bar with the name box
// above it (FormulaBar), a toolbar for how cells look and show their numbers (Toolbar), and the sheets' tabs under it
// with what the selection adds up to (Tabs). Formulas are worked out as they change (shared/sheets.ts); typing a
// formula, clicking or arrowing to cells puts their references in, outlined in colour. Copy and paste go through the
// system clipboard as tab-separated text, so cells move to and from Excel and Google Sheets; formulas pasted here
// move along. Changes stay unsaved until Save (Ctrl+S), as a page's do; Undo and Redo step through them.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowDownZA, BetweenHorizontalStart, BetweenVerticalStart, ClipboardPaste, Copy, Eraser, Scissors, Sparkles, Trash2 } from 'lucide-react';
import {
  COL_W,
  computeBook,
  DEFAULT_DP,
  formatValue,
  formulaProblem,
  formulaRefs,
  generalNumber,
  inputText,
  MAX_H,
  MAX_W,
  MIN_W,
  newId,
  parseRange,
  parseRef,
  refGoesAt,
  refName,
  removeSheet,
  renameSheet,
  ROW_H,
  SHEET_LIMITS,
  shiftFormula,
  uniqueSheetName,
  type Calc,
  type Cell,
  type CellStyle,
  type NumFmt,
  type Rect,
  type Sheet,
  type Workbook,
} from '@shared/sheets';
import { toast, toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { Button, MenuItem, MenuSep, Popover, useConfirm } from '../../../components/ui';
import type { AskScope, ModelEditorProps } from '../kinds';
import { FormulaBar, formulaHelp } from './FormulaBar';
import { fontPx, Grid, textWidth, type Edit, type GridHandle, type RefBox } from './Grid';
import {
  applyPatch,
  cellSel,
  cellsIn,
  cellsPatch,
  clearChanges,
  colW,
  copyOf,
  dataEdge,
  deletePatch,
  fillChanges,
  gridSize,
  hasHeader,
  HISTORY_MAX,
  holds,
  insertPatch,
  metaOf,
  pasteChanges,
  rectLabel,
  rectOf,
  rectSel,
  regionAround,
  sheetFromCsv,
  single,
  sortChanges,
  statsOf,
  styleChanges,
  swapsBook,
  together,
  touched,
  typedInto,
  withStyle,
  type Clip,
  type Patch,
  type Sel,
} from './ops';
import { SheetTabs } from './Tabs';
import { Toolbar } from './Toolbar';

/** Cells copied or cut, to paste in this or another spreadsheet while the app is open (their formulas and looks). */
let clip: Clip | null = null;

/** The colours references are outlined in while a formula is typed. */
const REF_COLORS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#00838f'];

/** A formula with the brackets it left open closed, as spreadsheets close them. */
function closeBrackets(text: string): string {
  let open = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '(') open++;
    else if (!quoted && ch === ')') open--;
  }
  return open > 0 && !quoted ? text + ')'.repeat(open) : text;
}

const clone = (b: Workbook): Workbook => structuredClone(b);

export function SheetEditor({ doc, layout, readOnly, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef }: ModelEditorProps<Workbook>) {
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<GridHandle>(null);
  const barRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The workbook being edited, changed in place patch by patch; and what was saved last (for Discard).
  const bookRef = useRef<Workbook | null>(doc ? clone(doc.model) : null);
  const savedRef = useRef<Workbook | null>(doc ? clone(doc.model) : null);
  const calcRef = useRef<Calc | null>(bookRef.current ? computeBook(bookRef.current) : null);
  const hist = useRef<{ past: Patch[]; future: Patch[]; saved: number }>({ past: [], future: [], saved: 0 });
  const [rev, setRev] = useState(0);
  const [si, setSi] = useState(0);
  const [sel, setSelState] = useState<Sel>(cellSel(0, 0));
  const selRef = useRef(sel);
  selRef.current = sel;
  const sels = useRef(new Map<string, Sel>());
  const [edit, setEditState] = useState<Edit | null>(null);
  const editRef = useRef<Edit | null>(null);
  const caretRef = useRef(0);
  const [caret, setCaret] = useState(0);
  const [cutMark, setCutMark] = useState<{ sheet: string; x: Rect } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; on: 'cell' | 'col' | 'row' } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const [width, setWidth] = useState(1200);

  const setEdit = (e: Edit | null) => {
    editRef.current = e;
    setEditState(e);
  };

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const narrow = width < 640 || layout === 'sheet';

  const h = hist.current;
  const dirty = !!bookRef.current && h.saved !== h.past.length;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Another spreadsheet, or a new version of it (the agent's) while nothing was changed here: start from it.
  useEffect(() => {
    if (!doc || dirtyRef.current) return;
    bookRef.current = clone(doc.model);
    savedRef.current = clone(doc.model);
    calcRef.current = computeBook(bookRef.current);
    hist.current = { past: [], future: [], saved: 0 };
    setSi((i) => Math.min(i, doc.model.sheets.length - 1));
    setEdit(null);
    setRev((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key]);

  const book = bookRef.current;
  const calc = calcRef.current;
  const sheetIx = book ? Math.min(si, book.sheets.length - 1) : 0;
  const sheet: Sheet | undefined = book?.sheets[sheetIx];
  const size = useMemo(() => (calc ? gridSize(calc, sheetIx) : { rows: 1000, cols: 26 }), [calc, sheetIx, rev]);
  const x = rectOf(sel);

  // ---- changes, Undo and Redo ----------------------------------------------------------------------------------------
  /** The calculator brought up to date after a patch (done either way). */
  const sync = (p: Patch) => {
    const b = bookRef.current!;
    const c = calcRef.current!;
    if (swapsBook(p)) return c.reset(b);
    for (const [id, keys] of touched(p)) c.update(b.sheets.findIndex((s) => s.id === id), keys);
  };

  /** A change: done now, and kept for Undo. */
  const change = (p: Patch | null, at?: Sel) => {
    const b = bookRef.current;
    if (!p || readOnly || !b) return;
    p.at = { sheet: b.sheets[sheetIx]?.id ?? '', sel: at ?? selRef.current };
    bookRef.current = applyPatch(b, p, false);
    sync(p);
    const hh = hist.current;
    if (hh.saved > hh.past.length) hh.saved = -1;
    hh.past.push(p);
    if (hh.past.length > HISTORY_MAX) {
      hh.past.shift();
      hh.saved = hh.saved > 0 ? hh.saved - 1 : -1;
    }
    hh.future = [];
    setRev((r) => r + 1);
  };

  const goTo = (at: Patch['at']) => {
    const b = bookRef.current;
    if (!at || !b) return;
    const i = b.sheets.findIndex((s) => s.id === at.sheet);
    if (i >= 0 && i !== sheetIx) setSi(i);
    setSel(at.sel, true);
  };
  const undo = () => {
    if (editRef.current) return cancelEdit();
    const hh = hist.current;
    const p = hh.past.pop();
    if (!p || !bookRef.current) return;
    bookRef.current = applyPatch(bookRef.current, p, true);
    sync(p);
    hh.future.unshift(p);
    goTo(p.at);
    setRev((r) => r + 1);
  };
  const redo = () => {
    const hh = hist.current;
    const p = hh.future.shift();
    if (!p || !bookRef.current) return;
    bookRef.current = applyPatch(bookRef.current, p, false);
    sync(p);
    hh.past.push(p);
    goTo(p.at);
    setRev((r) => r + 1);
  };

  // ---- saving -------------------------------------------------------------------------------------------------------------
  const save = async (): Promise<boolean> => {
    if (!bookRef.current || !onSave || saving || readOnly) return false;
    if (editRef.current) commitEdit(null);
    setSaving(true);
    try {
      const copy = clone(bookRef.current);
      if (await onSave(copy)) {
        savedRef.current = clone(copy);
        hist.current.saved = hist.current.past.length;
        setRev((r) => r + 1);
        return true;
      }
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
    return false;
  };
  const saveNow = useRef(save);
  saveNow.current = save;
  if (saveNowRef) saveNowRef.current = () => (dirtyRef.current ? saveNow.current() : Promise.resolve(true));

  const discard = async () => {
    if (!(await confirm({ title: 'Discard your changes?', body: 'The spreadsheet goes back to how it was saved.', confirm: 'Discard', danger: true }))) return;
    if (!savedRef.current) return;
    setEdit(null);
    bookRef.current = clone(savedRef.current);
    calcRef.current = computeBook(bookRef.current);
    hist.current = { past: [], future: [], saved: 0 };
    setSi((i) => Math.min(i, bookRef.current!.sheets.length - 1));
    setRev((r) => r + 1);
  };

  // ---- the selection --------------------------------------------------------------------------------------------------------
  const clampSel = (s: Sel): Sel => {
    const r = (n: number) => Math.max(0, Math.min(size.rows - 1, n));
    const c = (n: number) => Math.max(0, Math.min(size.cols - 1, n));
    return { r: r(s.r), c: c(s.c), ar: r(s.ar), ac: c(s.ac), fr: r(s.fr), fc: c(s.fc) };
  };
  /** A new selection (what is being typed goes in first); `reveal` scrolls to it. */
  const setSel = (s: Sel, reveal = false, keepEdit = false) => {
    if (editRef.current && !keepEdit) commitEdit(null);
    const next = clampSel(s);
    selRef.current = next;
    setSelState(next);
    if (sheet) sels.current.set(sheet.id, next);
    if (reveal) requestAnimationFrame(() => grid.current?.reveal(next.fr, next.fc));
  };
  const pickSheet = (i: number) => {
    if (!book || i === sheetIx) return;
    if (editRef.current) commitEdit(null);
    if (sheet) sels.current.set(sheet.id, selRef.current);
    const next = book.sheets[i];
    const s = sels.current.get(next.id) ?? cellSel(0, 0);
    setSi(i);
    selRef.current = s;
    setSelState(s);
  };

  /** Moves the active cell one step: within the selection when it is more than a cell (Enter, Tab), else from it. */
  const advance = (dr: number, dc: number) => {
    const s = selRef.current;
    if (single(s)) return setSel(cellSel(s.r + dr, s.c + dc), true);
    const b = rectOf(s);
    let r = s.r + dr;
    let c = s.c + dc;
    if (dc) {
      if (c > b.c2) [c, r] = [b.c1, r + 1 > b.r2 ? b.r1 : r + 1];
      else if (c < b.c1) [c, r] = [b.c2, r - 1 < b.r1 ? b.r2 : r - 1];
    } else {
      if (r > b.r2) [r, c] = [b.r1, c + 1 > b.c2 ? b.c1 : c + 1];
      else if (r < b.r1) [r, c] = [b.r2, c - 1 < b.c1 ? b.c2 : c - 1];
    }
    setSel({ ...s, r, c }, false);
    requestAnimationFrame(() => grid.current?.reveal(r, c));
  };

  // ---- typing into cells --------------------------------------------------------------------------------------------------
  const startEdit = (mode: 'type' | 'edit', text?: string, where: 'cell' | 'bar' = 'cell') => {
    if (readOnly || !sheet) return;
    const t = text ?? inputText(sheet.cells[refName(selRef.current.r, selRef.current.c)]);
    setEdit({ text: t, mode, where });
    caretRef.current = t.length;
    setCaret(t.length);
  };
  const cancelEdit = () => {
    setEdit(null);
    grid.current?.focus();
  };
  const setText = (text: string, pos: number, place = false) => {
    const e = editRef.current;
    if (!e) return;
    caretRef.current = pos;
    setCaret(pos);
    if (text !== e.text) setEdit({ ...e, text, point: undefined });
    if (place)
      requestAnimationFrame(() => {
        const el = e.where === 'bar' ? barRef.current : grid.current?.input();
        el?.focus({ preventScroll: true });
        el?.setSelectionRange(pos, pos);
      });
  };

  /**
   * The caret moved. The box reports it after a key's own handling too, with what it held before that key (a
   * reference just put in, say): such a late report is passed over.
   */
  const onCaret = (text: string, pos: number) => {
    if (!editRef.current || text !== editRef.current.text) return;
    caretRef.current = pos;
    setCaret(pos);
  };

  /** What was typed goes into the cell (or every cell of the selection, with Ctrl+Enter); then the active cell moves. */
  const commitEdit = (move: [number, number] | null, all = false) => {
    const e = editRef.current;
    if (!e) return;
    setEdit(null);
    const b = bookRef.current;
    if (readOnly || !b || !sheet) return;
    const s = selRef.current;
    const text = e.text.startsWith('=') ? closeBrackets(e.text) : e.text;
    const changes: Record<string, Cell | null> = {};
    const key = refName(s.r, s.c);
    if (all && !single(s)) {
      const b2 = rectOf(s);
      for (let r = b2.r1; r <= Math.min(b2.r2, b2.r1 + 5000); r++)
        for (let c = b2.c1; c <= b2.c2; c++) {
          const k = refName(r, c);
          const cell = typedInto(sheet.cells[k], text);
          changes[k] = cell?.f !== undefined ? { ...cell, f: shiftFormula(cell.f, r - s.r, c - s.c) } : cell;
        }
    } else changes[key] = typedInto(sheet.cells[key], text);
    const f = changes[key]?.f;
    if (f !== undefined) {
      const why = formulaProblem(f);
      if (why) toast(`${tr('This formula cannot be worked out')}: ${tr(why)}`, 'error');
    }
    change(cellsPatch(b, sheetIx, changes), s);
    if (move) advance(move[0], move[1]);
    grid.current?.focus();
  };

  /** A reference put in a formula being typed, by clicking or arrowing to a cell (Shift: a range from where it began). */
  const pointAt = (r: number, c: number, extend: boolean): boolean => {
    const e = editRef.current;
    if (!e || !e.text.startsWith('=')) return false;
    let s: number;
    let en: number;
    let ar = r;
    let ac = c;
    if (e.point) {
      [s, en] = [e.point.s, e.point.e];
      if (extend) [ar, ac] = [e.point.ar, e.point.ac];
    } else {
      if (!refGoesAt(e.text, caretRef.current)) return false;
      s = en = caretRef.current;
    }
    const name = ar === r && ac === c ? refName(r, c) : `${refName(Math.min(ar, r), Math.min(ac, c))}:${refName(Math.max(ar, r), Math.max(ac, c))}`;
    const text = e.text.slice(0, s) + name + e.text.slice(en);
    const pos = s + name.length;
    setEdit({ ...e, text, point: { s, e: pos, ar, ac, fr: r, fc: c } });
    caretRef.current = pos;
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = e.where === 'bar' ? barRef.current : grid.current?.input();
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(pos, pos);
      grid.current?.reveal(r, c);
    });
    return true;
  };

  /** A function offered while a formula is typed: put in for the word before the caret, with its "(". */
  const suggest = (n: string) => {
    const e = editRef.current;
    if (!e) return;
    const pos = caretRef.current;
    const m = /([A-Za-z][A-Za-z0-9.]*)$/.exec(e.text.slice(0, pos));
    const start = m ? pos - m[1].length : pos;
    setText(`${e.text.slice(0, start)}${n}(${e.text.slice(pos)}`, start + n.length + 1, true);
  };

  // ---- how cells look -------------------------------------------------------------------------------------------------------
  const active: Cell | undefined = sheet?.cells[refName(sel.r, sel.c)];
  const restyle = (f: (s: CellStyle | undefined) => CellStyle | undefined, extra?: (changes: Record<string, Cell | null>) => Patch | null) => {
    if (!book || !sheet || !calc) return;
    const changes = styleChanges(sheet, calc, sheetIx, rectOf(selRef.current), f);
    change(together([cellsPatch(book, sheetIx, changes), extra?.(changes) ?? null]));
    grid.current?.focus();
  };
  const setStyle = (set: Partial<CellStyle>) =>
    restyle(
      (s) => withStyle(s, set),
      // Words wrapped need their rows taller: rows not sized by hand fit them.
      set.wrap ? (changes) => fitRows(Object.keys(changes), changes) : undefined,
    );
  const setFormat = (fmt: NumFmt, cur?: string) => restyle((s) => withStyle(s, { fmt: fmt === 'general' ? undefined : fmt, dp: undefined, cur: fmt === 'currency' && cur !== '$' ? cur : undefined }));
  const stepDecimals = (d: 1 | -1) => {
    if (!calc) return;
    const s = active?.s;
    const fmt = s?.fmt ?? 'general';
    if (fmt === 'date' || fmt === 'text') return;
    let now = s?.dp ?? DEFAULT_DP[fmt];
    if (now === undefined) {
      const v = calc.value(sheetIx, sel.r, sel.c);
      const t = typeof v === 'number' ? generalNumber(v) : '0';
      now = t.includes('.') && !t.includes('E') ? t.split('.')[1].length : 0;
    }
    const next = Math.max(0, Math.min(10, now + d));
    restyle((st) => withStyle(st, { dp: next }));
  };

  /** Rows' heights for their wrapped words (rows sized by hand stay as they are). */
  const fitRows = (names: string[], changes: Record<string, Cell | null> = {}): Patch | null => {
    if (!sheet || !calc) return null;
    const rows = new Set(names.map((n) => (parseRef(n)?.r ?? -1)).filter((r) => r >= 0 && !sheet.rows?.[r]?.h));
    if (!rows.size) return null;
    const next = { ...(sheet.rows ?? {}) };
    let any = false;
    for (const r of rows) {
      const hgt = neededHeight(r, changes);
      if (hgt > ROW_H) {
        next[r] = { h: Math.min(MAX_H, hgt) };
        any = true;
      }
    }
    return any ? { k: 'meta', sheet: sheet.id, before: metaOf(sheet), after: { ...metaOf(sheet), rows: next } } : null;
  };
  /** How tall a row's cells need it, their words wrapped in their columns' widths. */
  const neededHeight = (r: number, changes: Record<string, Cell | null> = {}) => {
    if (!sheet || !calc) return ROW_H;
    let most = ROW_H;
    for (const [k, rr, c] of cellsIn(sheet, calc, sheetIx, { r1: r, c1: 0, r2: r, c2: size.cols - 1 })) {
      void rr;
      const cell = k in changes ? changes[k] : sheet.cells[k];
      if (!cell || !holds(cell)) continue;
      const text = formatValue(calc.value(sheetIx, r, c), cell.s);
      const lh = fontPx(cell.s) * 1.35;
      const lines = cell.s?.wrap
        ? text.split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(textWidth(line, cell.s) / Math.max(20, colW(sheet, c) - 10))), 0)
        : text.split('\n').length;
      most = Math.max(most, Math.ceil(lines * lh + 8));
    }
    return most;
  };

  // ---- sizes, freezing ------------------------------------------------------------------------------------------------------
  const setSize = (axis: 'col' | 'row', i: number, sz: number | null) => {
    if (!sheet) return;
    const key = axis === 'col' ? 'cols' : 'rows';
    const next: Record<number, { w?: number; h?: number }> = { ...(sheet[key] ?? {}) };
    if (sz === null || sz === (axis === 'col' ? COL_W : ROW_H)) delete next[i];
    else next[i] = axis === 'col' ? { w: sz } : { h: sz };
    change({ k: 'meta', sheet: sheet.id, before: metaOf(sheet), after: { ...metaOf(sheet), [key]: Object.keys(next).length ? next : undefined } });
  };
  const fit = (axis: 'col' | 'row', i: number) => {
    if (!sheet || !calc) return;
    if (axis === 'row') {
      const hgt = neededHeight(i);
      return setSize('row', i, hgt <= ROW_H ? null : Math.min(MAX_H, hgt));
    }
    let most = 0;
    for (const [k, r] of cellsIn(sheet, calc, sheetIx, { r1: 0, c1: i, r2: size.rows - 1, c2: i })) {
      const cell = sheet.cells[k];
      if (!holds(cell)) continue;
      most = Math.max(most, textWidth(formatValue(calc.value(sheetIx, r, i), cell.s), cell.s) + 14);
    }
    setSize('col', i, most ? Math.max(MIN_W + 16, Math.min(MAX_W, Math.ceil(most))) : null);
  };
  const setFreeze = (rows: number, cols: number) => {
    if (!sheet) return;
    const freeze = rows || cols ? { ...(rows ? { rows } : {}), ...(cols ? { cols } : {}) } : undefined;
    change({ k: 'meta', sheet: sheet.id, before: metaOf(sheet), after: { ...metaOf(sheet), freeze } });
  };

  // ---- rows and columns, sorting, clearing, filling ---------------------------------------------------------------------------
  const wholeCols = x.r1 === 0 && x.r2 >= size.rows - 1;
  const wholeRows = x.c1 === 0 && x.c2 >= size.cols - 1;
  const nRows = wholeCols ? 1 : x.r2 - x.r1 + 1;
  const nCols = wholeRows ? 1 : x.c2 - x.c1 + 1;
  const insert = (axis: 'row' | 'col', after: boolean) => {
    if (!book) return;
    const n = axis === 'row' ? nRows : nCols;
    const first = axis === 'row' ? (wholeCols ? sel.r : x.r1) : wholeRows ? sel.c : x.c1;
    const at = after ? first + n : first;
    change(insertPatch(book, sheetIx, axis, at, n));
    // The cells picked move along when the new ones go before them.
    if (!after) setSel(axis === 'row' ? { ...sel, r: sel.r + n, ar: sel.ar + n, fr: sel.fr + n } : { ...sel, c: sel.c + n, ac: sel.ac + n, fc: sel.fc + n });
    grid.current?.focus();
  };
  const remove = (axis: 'row' | 'col') => {
    if (!book) return;
    const n = axis === 'row' ? nRows : nCols;
    const at = axis === 'row' ? (wholeCols ? sel.r : x.r1) : wholeRows ? sel.c : x.c1;
    change(deletePatch(book, sheetIx, axis, at, n));
    setSel(cellSel(axis === 'row' ? at : sel.r, axis === 'col' ? at : sel.c));
    grid.current?.focus();
  };
  const sort = (asc: boolean) => {
    if (!book || !sheet || !calc) return;
    const e = calc.extent(sheetIx);
    let block: Rect;
    if (single(sel) || wholeCols || wholeRows) block = regionAround(sheet, sel.r, sel.c, Math.max(e.rows, sel.r + 1), Math.max(e.cols, sel.c + 1));
    else block = x;
    const body = (single(sel) || wholeCols || wholeRows) && hasHeader(sheet, calc, sheetIx, block) ? { ...block, r1: block.r1 + 1 } : block;
    if (body.r2 <= body.r1) return void toast(tr('There is nothing to sort here: pick a column of a table, or the rows to sort.'));
    const col = Math.max(body.c1, Math.min(body.c2, sel.c));
    change(cellsPatch(book, sheetIx, sortChanges(sheet, calc, sheetIx, body, col, asc)));
    grid.current?.focus();
  };
  const clear = () => {
    if (!book || !sheet || !calc) return;
    change(cellsPatch(book, sheetIx, clearChanges(sheet, calc, sheetIx, rectOf(selRef.current))));
  };
  const fill = (down: boolean) => {
    if (!book || !sheet) return;
    change(cellsPatch(book, sheetIx, fillChanges(sheet, rectOf(selRef.current), down)));
  };

  // ---- copy and paste --------------------------------------------------------------------------------------------------------
  const copyNow = (cut: boolean) => {
    if (!sheet || !calc) return null;
    const got = copyOf(sheet, calc, sheetIx, rectOf(selRef.current));
    clip = cut && !readOnly ? { ...got.clip, cut: true } : got.clip;
    setCutMark(cut && !readOnly ? { sheet: sheet.id, x: got.clip.x } : null);
    return got;
  };
  const onCopy = (e: React.ClipboardEvent) => {
    const got = copyNow(false);
    if (!got) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', got.text);
    e.clipboardData.setData('text/html', got.html);
  };
  const onCut = (e: React.ClipboardEvent) => {
    const got = copyNow(true);
    if (!got) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', got.text);
    e.clipboardData.setData('text/html', got.html);
  };
  const pasteText = (text: string) => {
    const b = bookRef.current;
    if (!b || !sheet || readOnly) return;
    const norm = (t: string) => t.replace(/\r\n?/g, '\n').replace(/\n$/, '');
    const own = clip && norm(clip.text) === norm(text) ? clip : null;
    const target = rectOf(selRef.current);
    const got = pasteChanges(sheet, target, own ? { clip: own } : { text });
    const patches: (Patch | null)[] = [];
    if (own?.cut) {
      // Cells cut leave where they were (all but those pasted over).
      const from = b.sheets.find((s) => s.id === own.sheet);
      if (from) {
        const empty: Record<string, Cell | null> = {};
        for (let r = own.x.r1; r <= own.x.r2; r++)
          for (let c = own.x.c1; c <= own.x.c2; c++) {
            const k = refName(r, c);
            if (from.id !== sheet.id || !(k in got.changes)) empty[k] = null;
          }
        patches.push(cellsPatch(b, b.sheets.indexOf(from), empty));
      }
      clip = null;
      setCutMark(null);
    }
    patches.push(cellsPatch(b, sheetIx, got.changes));
    change(together(patches));
    setSel(rectSel(got.x), true);
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    pasteText(text);
  };
  /** The menu's Copy, Cut and Paste (the keys go through the clipboard events above). */
  const menuCopy = async (cut: boolean) => {
    const got = copyNow(cut);
    if (!got) return;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write)
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([got.text], { type: 'text/plain' }), 'text/html': new Blob([got.html], { type: 'text/html' }) })]);
      else await navigator.clipboard.writeText(got.text);
    } catch {
      try {
        await navigator.clipboard.writeText(got.text);
      } catch {
        toast(tr('Copied here: paste it in this spreadsheet. To paste it elsewhere, use Ctrl+C.'));
      }
    }
  };
  const menuPaste = async () => {
    try {
      pasteText(await navigator.clipboard.readText());
    } catch {
      if (clip) pasteText(clip.text);
      else toast(tr('This browser keeps its clipboard to itself: press Ctrl+V (or ⌘V) to paste.'));
    }
  };

  // ---- sheets -------------------------------------------------------------------------------------------------------------------
  const swap = (after: Workbook) => book && change({ k: 'book', before: book, after });
  const addSheet = (made?: Sheet) => {
    if (!book) return;
    if (book.sheets.length >= SHEET_LIMITS.sheets) return void toast(tr('A spreadsheet holds at most 50 sheets.'));
    const names = book.sheets.map((s) => s.name);
    const sh: Sheet = made ? { ...made, name: uniqueSheetName(made.name, names) } : { id: newId(), name: uniqueSheetName(`Sheet ${book.sheets.length + 1}`, names), cells: {} };
    if (sheet) sels.current.set(sheet.id, selRef.current);
    swap({ ...book, sheets: [...book.sheets.slice(0, sheetIx + 1), sh, ...book.sheets.slice(sheetIx + 1)] });
    setSi(sheetIx + 1);
    selRef.current = cellSel(0, 0);
    setSelState(cellSel(0, 0));
  };
  const duplicateSheet = (i: number) => {
    if (!book) return;
    const src = book.sheets[i];
    const copy: Sheet = { ...structuredClone(src), id: newId() };
    if (book.sheets.length >= SHEET_LIMITS.sheets) return void toast(tr('A spreadsheet holds at most 50 sheets.'));
    copy.name = uniqueSheetName(src.name, book.sheets.map((s) => s.name));
    swap({ ...book, sheets: [...book.sheets.slice(0, i + 1), copy, ...book.sheets.slice(i + 1)] });
    setSi(i + 1);
  };
  const deleteSheet = async (i: number) => {
    if (!book || book.sheets.length < 2) return;
    const name = book.sheets[i].name;
    const ok = await confirm({
      title: `${tr('Delete the sheet')} “${name}”?`,
      body: 'Its cells go with it, and formulas that use them show #REF!. Undo brings it back.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    swap(removeSheet(bookRef.current!, book.sheets[i].id));
    setSi(Math.max(0, i - 1));
  };
  const moveSheet = (from: number, to: number) => {
    if (!book || to < 0 || to >= book.sheets.length || from === to) return;
    const list = [...book.sheets];
    const [s] = list.splice(from, 1);
    list.splice(to, 0, s);
    swap({ ...book, sheets: list });
    setSi(to);
  };
  const importCsv = async (f: File) => {
    if (f.size > 20 * 1024 * 1024) return void toast(tr('That file is over 20 MB.'), 'error');
    try {
      const text = await f.text();
      const got = sheetFromCsv(text, f.name.replace(/\.[^.]+$/, '') || 'Data', newId());
      addSheet(got.sheet);
      for (const n of got.notes) toast(n);
    } catch (e) {
      toastError(e);
    }
  };

  // ---- the name box -----------------------------------------------------------------------------------------------------------
  const goName = (text: string): boolean => {
    if (!book) return false;
    let t = text.trim();
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!(.+)$/.exec(t);
    let target = sheetIx;
    if (m) {
      const name = (m[1] ?? m[2]).replace(/''/g, "'").toLowerCase();
      target = book.sheets.findIndex((s) => s.name.toLowerCase() === name);
      if (target < 0) return void toast(tr('There is no sheet of that name.')), false;
      t = m[3];
    }
    const rg = parseRange(t.toUpperCase());
    if (!rg) return void toast(tr('Type a cell such as C12, or a range such as B2:D9.')), false;
    // Within that sheet's grid (another sheet's may be longer).
    const sz = target === sheetIx ? size : gridSize(calc!, target);
    const s = rectSel({ r1: Math.min(rg.r1, sz.rows - 1), c1: Math.min(rg.c1, sz.cols - 1), r2: Math.min(rg.r2, sz.rows - 1), c2: Math.min(rg.c2, sz.cols - 1) });
    if (target !== sheetIx) {
      sels.current.set(book.sheets[target].id, s);
      pickSheet(target);
      requestAnimationFrame(() => requestAnimationFrame(() => grid.current?.reveal(s.fr, s.fc)));
    } else setSel(s, true);
    requestAnimationFrame(() => grid.current?.focus());
    return true;
  };

  // ---- keys ---------------------------------------------------------------------------------------------------------------------
  const editKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const ed = editRef.current!;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return cancelEdit();
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const el = e.target as HTMLTextAreaElement;
      const pos = el.selectionStart ?? ed.text.length;
      setText(`${ed.text.slice(0, pos)}\n${ed.text.slice(el.selectionEnd ?? pos)}`, pos + 1, true);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      return commitEdit(mod ? null : [e.shiftKey ? -1 : 1, 0], mod);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const help = formulaHelp(ed.text, caretRef.current);
      if (help.names.length && !e.shiftKey) return suggest(help.names[0]);
      return commitEdit([0, e.shiftKey ? -1 : 1]);
    }
    if (e.key === 'F2') {
      e.preventDefault();
      setEdit({ ...ed, mode: ed.mode === 'type' ? 'edit' : 'type' });
      return;
    }
    if (e.key.startsWith('Arrow') && ed.mode === 'type') {
      const [dr, dc] = e.key === 'ArrowUp' ? [-1, 0] : e.key === 'ArrowDown' ? [1, 0] : e.key === 'ArrowLeft' ? [0, -1] : [0, 1];
      // In a formula, where a reference can go, arrows point at cells; elsewhere they end the typing and move.
      if (ed.text.startsWith('=') && (ed.point || refGoesAt(ed.text, caretRef.current))) {
        e.preventDefault();
        const from = ed.point ? [ed.point.fr, ed.point.fc] : [selRef.current.r, selRef.current.c];
        const r = Math.max(0, Math.min(size.rows - 1, from[0] + dr));
        const c = Math.max(0, Math.min(size.cols - 1, from[1] + dc));
        pointAt(r, c, e.shiftKey);
        return;
      }
      if (ed.where === 'cell') {
        e.preventDefault();
        return commitEdit([dr, dc]);
      }
    }
  };

  const navKey = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!sheet) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    const lower = k.toLowerCase();
    const s = selRef.current;
    if (mod && lower === 's') return void (e.preventDefault(), save());
    if (mod && lower === 'z') return void (e.preventDefault(), e.shiftKey ? redo() : undo());
    if (mod && lower === 'y') return void (e.preventDefault(), redo());
    if (mod && lower === 'a') return void (e.preventDefault(), setSel({ r: s.r, c: s.c, ar: 0, ac: 0, fr: size.rows - 1, fc: size.cols - 1 }));
    if (mod && !readOnly && (lower === 'b' || lower === 'i' || lower === 'u')) {
      e.preventDefault();
      const key = lower as 'b' | 'i' | 'u';
      return setStyle({ [key]: !active?.s?.[key] || undefined });
    }
    if (mod && !readOnly && (lower === 'd' || lower === 'r')) return void (e.preventDefault(), fill(lower === 'd'));
    if (mod && (lower === 'c' || lower === 'x' || lower === 'v')) {
      // The browser sends the clipboard's events to the box (the grid itself has none on a touch screen).
      if (e.target !== grid.current?.input()) {
        e.preventDefault();
        if (lower === 'v') void menuPaste();
        else void menuCopy(lower === 'x');
      }
      return;
    }
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc] = arrows[k];
      const [r0, c0] = e.shiftKey ? [s.fr, s.fc] : [s.r, s.c];
      const [r, c] = mod ? dataEdge(sheet, r0, c0, dr, dc, size.rows, size.cols) : [r0 + dr, c0 + dc];
      if (e.shiftKey) setSel({ ...s, fr: r, fc: c }, true);
      else setSel(cellSel(r, c), true);
      return;
    }
    if (k === 'Tab') return void (e.preventDefault(), advance(0, e.shiftKey ? -1 : 1));
    if (k === 'Enter') return void (e.preventDefault(), advance(e.shiftKey ? -1 : 1, 0));
    if (k === 'Home' || k === 'End') {
      e.preventDefault();
      const e2 = calc!.extent(sheetIx);
      let r = s.r;
      let c = 0;
      if (k === 'End') {
        if (mod) [r, c] = [Math.max(0, e2.rows - 1), Math.max(0, e2.cols - 1)];
        else for (c = Math.max(0, e2.cols - 1); c > 0 && !holds(sheet.cells[refName(r, c)]); c--);
      } else if (mod) r = 0;
      return e.shiftKey ? setSel({ ...s, fr: r, fc: c }, true) : setSel(cellSel(r, c), true);
    }
    if (k === 'PageDown' || k === 'PageUp') {
      e.preventDefault();
      const n = (grid.current?.pageRows() ?? 20) * (k === 'PageDown' ? 1 : -1);
      return e.shiftKey ? setSel({ ...s, fr: s.fr + n }, true) : setSel(cellSel(s.r + n, s.c), true);
    }
    if (k === 'Escape') {
      if (cutMark) {
        setCutMark(null);
        if (clip) clip = { ...clip, cut: false };
      }
      return;
    }
    if (readOnly) return;
    if (k === 'F2') return void (e.preventDefault(), startEdit('edit'));
    if (k === 'Delete' || k === 'Backspace') return void (e.preventDefault(), clear());
    if ((k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) && root.current) {
      e.preventDefault();
      const b = root.current.getBoundingClientRect();
      setCtx({ x: b.left + 120, y: b.top + 140, on: 'cell' });
      return;
    }
    // A key typed on the grid itself (a keyboard with a tablet): typing begins with it.
    if (k.length === 1 && !mod && !e.altKey && e.target !== grid.current?.input()) {
      e.preventDefault();
      grid.current?.input()?.focus({ preventScroll: true });
      startEdit('type', k);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLElement>) => (editRef.current ? editKey(e) : navKey(e));

  // Ctrl+S anywhere in the editor (a toolbar button or a menu may hold the focus).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = document.activeElement;
      if (a && a !== document.body && !root.current?.contains(a)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && (!a || a === document.body || !(a as HTMLElement).closest('textarea'))) {
        e.preventDefault();
        void saveNow.current();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // Typing in the formula bar, or back in the cell: where the keys go.
  const onFocusCapture = (e: React.FocusEvent) => {
    const ed = editRef.current;
    if (!ed) return;
    if (e.target === barRef.current && ed.where !== 'bar') setEdit({ ...ed, where: 'bar', mode: 'edit' });
    else if (e.target === grid.current?.input() && ed.where !== 'cell') setEdit({ ...ed, where: 'cell', mode: 'edit' });
  };

  // The grid takes the keys when it first shows (not on a phone: the keyboard would open).
  useEffect(() => {
    if (!narrow && layout === 'page') requestAnimationFrame(() => grid.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetIx]);

  // ---- what an agent could be asked about -----------------------------------------------------------------------------------
  const scopesTo = useRef(onScopes);
  scopesTo.current = onScopes;
  const lastScopes = useRef('');
  const leadFor = useCallback(
    (s: Sel) => {
      if (!sheet) return { label: '', lead: '' };
      const r = rectOf(s);
      const label = rectLabel(r, size.rows, size.cols);
      if (label === 'the whole sheet') return { label: '', lead: `In the sheet “${sheet.name}”: ` };
      const what = /^[A-Z]+:[A-Z]+$/.test(label) ? (r.c1 === r.c2 ? 'column' : 'columns') : /^\d+:\d+$/.test(label) ? (r.r1 === r.r2 ? 'row' : 'rows') : single(s) ? 'cell' : 'cells';
      const shown = what === 'column' ? label.split(':')[0] : what === 'row' ? label.split(':')[0] : label;
      return { label: `${what} ${shown}`, lead: `In the sheet “${sheet.name}”, ${what} ${shown}: ` };
    },
    [sheet, size],
  );
  useEffect(() => {
    if (!sheet) return;
    const t = setTimeout(() => {
      const f = leadFor(selRef.current);
      const scopes: AskScope[] = [
        { id: 'book', label: tr('The whole workbook'), lead: '' },
        { id: 'sheet', label: `${tr('This sheet')}: ${sheet.name}`, lead: `In the sheet “${sheet.name}”: ` },
      ];
      if (f.label) {
        const [what, name] = f.label.split(' ');
        // Each a sentence of its own, so it translates whole ("Cells B2:D9").
        const label: Record<string, (n: string) => string> = {
          cell: (n) => tr(`Cell ${n}`),
          cells: (n) => tr(`Cells ${n}`),
          column: (n) => tr(`Column ${n}`),
          columns: (n) => tr(`Columns ${n}`),
          row: (n) => tr(`Row ${n}`),
          rows: (n) => tr(`Rows ${n}`),
        };
        scopes.push({ id: 'cells', label: label[what]?.(name) ?? `${what} ${name}`, lead: f.lead });
      }
      const json = JSON.stringify(scopes);
      if (json === lastScopes.current) return;
      lastScopes.current = json;
      scopesTo.current?.(scopes);
    }, 150);
    return () => clearTimeout(t);
  }, [sel, sheetIx, rev, leadFor, sheet]);

  // ---- what the selection adds up to ---------------------------------------------------------------------------------------
  const stats = useMemo(() => (sheet && calc && !single(sel) ? statsOf(sheet, calc, sheetIx, x) : null), [rev, sel, sheetIx]); // eslint-disable-line react-hooks/exhaustive-deps
  const statFmt = (v: number) => {
    const f = active?.s?.fmt;
    return formatValue(v, f === 'currency' || f === 'percent' || f === 'number' ? active!.s : { fmt: 'number', dp: Number.isInteger(v) ? 0 : 2 });
  };

  if (!book || !sheet || !calc) return <div className="flex h-full items-center justify-center text-fg-3">…</div>;

  // References outlined while a formula is typed (those on this sheet).
  const refs: RefBox[] = edit?.text.startsWith('=')
    ? formulaRefs(edit.text.slice(1)).flatMap((f, i) => {
        if (f.ref.sheet !== undefined && f.ref.sheet.toLowerCase() !== sheet.name.toLowerCase()) return [];
        const a = f.ref.a;
        const b = f.ref.b ?? a;
        const [ra, rb] = [a.r ?? 0, b.r ?? size.rows - 1];
        const [ca, cb] = [a.c ?? 0, b.c ?? size.cols - 1];
        return [{ r1: Math.min(ra, rb), c1: Math.min(ca, cb), r2: Math.max(ra, rb), c2: Math.max(ca, cb), color: REF_COLORS[i % REF_COLORS.length] }];
      })
    : [];

  const status = stats && stats.count > 1 && (
    <>
      {stats.nums > 0 && (
        <span>
          Sum{' '}
          <span translate="no" className="font-medium text-fg-2 tabular-nums">
            {statFmt(stats.sum)}
          </span>
        </span>
      )}
      {stats.nums > 0 && !narrow && (
        <span>
          Average{' '}
          <span translate="no" className="font-medium text-fg-2 tabular-nums">
            {statFmt(stats.sum / stats.nums)}
          </span>
        </span>
      )}
      <span>
        Count{' '}
        <span translate="no" className="font-medium text-fg-2 tabular-nums">
          {stats.count}
        </span>
      </span>
    </>
  );

  const ask = onAsk && (
    <MenuItem icon={<Sparkles size={14} />} onClick={() => (setCtx(null), onAsk(leadFor(selRef.current).lead))}>
      Ask the agent about it
    </MenuItem>
  );

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg" onFocusCapture={onFocusCapture}>
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">{lead}</div>
        {tail}
      </div>
      {band}
      {!readOnly && (
        <Toolbar
          style={active?.s}
          r={sel.r}
          c={sel.c}
          nRows={nRows}
          nCols={nCols}
          canUndo={hist.current.past.length > 0 || !!edit}
          canRedo={hist.current.future.length > 0}
          narrow={narrow}
          onUndo={undo}
          onRedo={redo}
          onStyle={setStyle}
          onFormat={setFormat}
          onDecimals={stepDecimals}
          onFreeze={setFreeze}
          freeze={sheet.freeze}
          onSort={sort}
          onInsert={insert}
          onDelete={remove}
        />
      )}
      <FormulaBar
        name={rectLabel(x, size.rows, size.cols) === 'the whole sheet' ? `${refName(0, 0)}:${refName(size.rows - 1, size.cols - 1)}` : rectLabel(x, size.rows, size.cols)}
        onName={goName}
        text={edit ? edit.text : inputText(active)}
        editing={!!edit}
        readOnly={readOnly}
        narrow={narrow}
        caret={caret}
        onStart={() => startEdit('edit', undefined, 'bar')}
        onText={(t, pos) => setText(t, pos)}
        onCaret={onCaret}
        onKey={onKey}
        onSuggest={suggest}
        barRef={barRef}
      />
      <Grid
        ref={grid}
        sheet={sheet}
        si={sheetIx}
        calc={calc}
        rev={rev}
        rows={size.rows}
        cols={size.cols}
        sel={sel}
        edit={edit}
        refs={refs}
        cut={cutMark?.sheet === sheet.id ? cutMark.x : null}
        readOnly={readOnly}
        onSel={(s) => setSel(s, true)}
        onEdit={(mode, text) => startEdit(mode, text)}
        onText={(t, pos) => setText(t, pos)}
        onCaret={onCaret}
        onKey={onKey}
        onPoint={pointAt}
        onSize={setSize}
        onFit={fit}
        onMenu={(at, on) => setCtx({ ...at, on })}
        onCopy={onCopy}
        onCut={readOnly ? onCopy : onCut}
        onPaste={readOnly ? () => {} : onPaste}
      />
      <SheetTabs
        names={book.sheets.map((s) => s.name)}
        active={sheetIx}
        readOnly={readOnly}
        onPick={pickSheet}
        onAdd={() => addSheet()}
        onImport={() => fileRef.current?.click()}
        onRename={(i, name) => swap(renameSheet(book, book.sheets[i].id, name))}
        onDuplicate={duplicateSheet}
        onDelete={(i) => void deleteSheet(i)}
        onMove={moveSheet}
        status={status || undefined}
        last={!(dirty && !readOnly)}
      />
      {dirty && !readOnly && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-panel px-3 py-2 pb-[max(8px,var(--safe-bottom))]">
          <span className="min-w-0 flex-1 text-[12.5px] text-fg-2">
            <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-warn align-middle" />
            Not saved yet{savedNote ? <span className="text-fg-3"> · {savedNote}</span> : null}
          </span>
          <Button size="sm" variant="ghost" onClick={() => void discard()} disabled={saving}>
            Discard
          </Button>
          <Button size="sm" variant="primary" onClick={() => void save()} disabled={saving || !onSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importCsv(f);
        }}
      />
      <div ref={ctxRef} className="pointer-events-none fixed h-px w-px" style={{ left: ctx?.x ?? -10, top: ctx?.y ?? -10 }} />
      <Popover anchor={ctxRef} open={!!ctx} onClose={() => setCtx(null)} width={240}>
        {ctx && (
          <div onMouseDown={(e) => e.preventDefault()}>
            {!readOnly && (
              <MenuItem icon={<Scissors size={14} />} hint="Ctrl+X" onClick={() => (setCtx(null), void menuCopy(true))}>
                Cut
              </MenuItem>
            )}
            <MenuItem icon={<Copy size={14} />} hint="Ctrl+C" onClick={() => (setCtx(null), void menuCopy(false))}>
              Copy
            </MenuItem>
            {!readOnly && (
              <MenuItem icon={<ClipboardPaste size={14} />} hint="Ctrl+V" onClick={() => (setCtx(null), void menuPaste())}>
                Paste
              </MenuItem>
            )}
            {!readOnly && <MenuSep />}
            {!readOnly && ctx.on !== 'col' && (
              <MenuItem icon={<BetweenHorizontalStart size={14} />} onClick={() => (setCtx(null), insert('row', false))}>
                {nRows === 1 ? 'Insert a row above' : `Insert ${nRows} rows above`}
              </MenuItem>
            )}
            {!readOnly && ctx.on === 'row' && (
              <MenuItem icon={<BetweenHorizontalStart size={14} />} onClick={() => (setCtx(null), insert('row', true))}>
                {nRows === 1 ? 'Insert a row below' : `Insert ${nRows} rows below`}
              </MenuItem>
            )}
            {!readOnly && ctx.on !== 'row' && (
              <MenuItem icon={<BetweenVerticalStart size={14} />} onClick={() => (setCtx(null), insert('col', false))}>
                {nCols === 1 ? 'Insert a column left' : `Insert ${nCols} columns left`}
              </MenuItem>
            )}
            {!readOnly && ctx.on === 'col' && (
              <MenuItem icon={<BetweenVerticalStart size={14} />} onClick={() => (setCtx(null), insert('col', true))}>
                {nCols === 1 ? 'Insert a column right' : `Insert ${nCols} columns right`}
              </MenuItem>
            )}
            {!readOnly && ctx.on !== 'col' && (
              <MenuItem icon={<Trash2 size={14} />} onClick={() => (setCtx(null), remove('row'))}>
                {nRows === 1 ? 'Delete this row' : `Delete ${nRows} rows`}
              </MenuItem>
            )}
            {!readOnly && ctx.on !== 'row' && (
              <MenuItem icon={<Trash2 size={14} />} onClick={() => (setCtx(null), remove('col'))}>
                {nCols === 1 ? 'Delete this column' : `Delete ${nCols} columns`}
              </MenuItem>
            )}
            {!readOnly && ctx.on === 'col' && (
              <>
                <MenuItem icon={<ArrowDownAZ size={14} />} onClick={() => (setCtx(null), sort(true))}>
                  Sort A to Z
                </MenuItem>
                <MenuItem icon={<ArrowDownZA size={14} />} onClick={() => (setCtx(null), sort(false))}>
                  Sort Z to A
                </MenuItem>
              </>
            )}
            {!readOnly && (
              <MenuItem icon={<Eraser size={14} />} hint="Delete" onClick={() => (setCtx(null), clear())}>
                Clear
              </MenuItem>
            )}
            {ask && <MenuSep />}
            {ask}
          </div>
        )}
      </Popover>
      {confirmNode}
    </div>
  );
}
