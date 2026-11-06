// A spreadsheet to edit, as in Excel, Google Sheets and Airtable: the grid of cells (Grid), the formula bar with the
// name box above it (FormulaBar), the menus and a toolbar of the most used looks (Toolbar, menus.tsx), and the sheets'
// tabs under it with what the selection adds up to (Tabs). Formulas are worked out as they change (shared/sheets.ts);
// typing a formula, clicking or arrowing to cells puts their references in, outlined in colour, with each function's
// arguments shown as it is typed. Copy and paste go through the system clipboard as tab-separated text, so cells move to
// and from Excel and Google Sheets; formulas pasted here move along, and Paste special pastes values, looks or formulas
// alone, or turned on its side. Besides: find and replace; filters on a header row; conditional formatting; rules for
// what cells take, with checkboxes, lists' coloured chips, stars and a calendar for dates; borders; merged cells; the
// fill handle; hidden rows and columns; number formats with Excel's codes; charts on the grid's cells (of the cells
// picked, or of several ranges picked with Ctrl+click); the data tools; notes; a row expanded into a card; zoom.
// Changes stay unsaved until Save (Ctrl+S), as a page's do; Undo and Redo step through them. While an agent writes a
// new version (live.ts), it shows as it comes, read-only, the cell its words arrive in boxed and kept in view.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BetweenHorizontalStart, BetweenVerticalStart, ClipboardPaste, Copy, Eraser, EyeOff, Maximize2, MessageSquarePlus, Scissors, Sparkles, StickyNote, Trash2, ArrowDownAZ, ArrowDownZA, Eye, MessageCircleQuestionMark, RefreshCw } from 'lucide-react';
import { newCommentId } from '@shared/comments';
import {
  cleanBorder,
  colIndex,
  colName,
  COL_W,
  computeBook,
  cornerAt,
  cornerXY,
  dateSerial,
  DEFAULT_DP,
  formatValue,
  formulaProblem,
  formulaRefs,
  generalNumber,
  inputText,
  isDateFmt,
  keyOf,
  MAX_H,
  MAX_W,
  MIN_W,
  newId,
  nowSerial,
  parseDelimited,
  parseRange,
  parseRef,
  rangeName,
  refGoesAt,
  refName,
  removeSheet,
  renameSheet,
  ROW_H,
  SHEET_LIMITS,
  sheetSizes,
  shiftFormula,
  uniqueSheetName,
  type BorderKind,
  type Calc,
  type Cell,
  type CellStyle,
  type FilterCol,
  type ListOption,
  type NumFmt,
  type Rect,
  type Sheet,
  type SheetBoard,
  type SheetChart,
  type SheetComment,
  type Validation,
  type Workbook,
  type CellValue,
  adjustForDelete,
  normalizeBook,
  quoteSheet,
  renameName,
  sourceOf,
  type NamedRange,
  type SheetProtect,
} from '@shared/sheets';
import { addGroup, foldGroup, guardOf, removeGroup, spansOf } from '@shared/sheet-groups';
import type { AnalyzeIdea, FillAnswer, TableAnswer } from '@shared/sheet-ai';
import { findIssues, type CleanIssue } from '@shared/sheet-clean';
import { flashFill } from '@shared/sheet-flash';
import { allowed, columnValues, CondFormats, filterHidden, listOptions, Merges, Rules } from '@shared/sheet-rules';
import { toast, toastError } from '../../../lib/store';
import { tr } from '../../../i18n/runtime';
import { Button, cx, MenuBack, MenuItem, MenuSep, Popover, SheetsOnPhone, useConfirm } from '../../../components/ui';
import { CharPicker } from '../common/CharPicker';
import { FindBar, useFind } from '../common/FindBar';
import { isMod } from '../common/keys';
import { MenuBar } from '../common/menus';
import { useOwnScroll } from '../live';
import { ShortcutsDialog, type ShortcutGroup } from '../common/Shortcuts';
import type { AskScope, ModelEditorProps } from '../kinds';
import { Board } from './Board';
import { ChartLayer, ChartPanel } from './Charts';
import { CommentsPanel } from './CommentsPanel';
import { CondPanel } from './CondPanel';
import { DupDialog, FormatDialog, SortDialog, SplitDialog, SummaryDialog, type ColChoice } from './Dialogs';
import { fillDownTo, fillSeries } from './fill';
import { FilterMenu } from './FilterMenu';
import { FormulaBar, formulaHelp } from './FormulaBar';
import { fontPx, Grid, textWidth, type Edit, type GridGeo, type GridHandle, type GridView, type RefBox, type Smart } from './Grid';
import { sheetMenus, type MenuCtx } from './menus';
import {
  applyPatch,
  cellSel,
  cellsIn,
  cellsPatch,
  clearChanges,
  colW,
  commentsMoved,
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
  metaPatch,
  pasteChanges,
  rectLabel,
  rectOf,
  rectSel,
  regionAround,
  rowH,
  sheetFromCsv,
  single,
  sortChanges,
  statsOf,
  styleChanges,
  swapsBook,
  tidyCell,
  together,
  touched,
  typedInto,
  withStyle,
  type Clip,
  type Patch,
  type Sel,
} from './ops';
import { DatePicker, ListPicker } from './Panel';
import { RowCard } from './RowCard';
import { SheetTabs } from './Tabs';
import { Toolbar } from './Toolbar';
import {
  borderChanges,
  findCells,
  guessSeparator,
  hiddenRun,
  hiddenSet,
  mergeResult,
  pasteSpecial,
  pasteTextValues,
  removeDuplicates,
  replacedCell,
  sortByKeys,
  splitColumn,
  summarySheet,
  trimChanges,
  type BorderWhere,
  type FindHow,
  type PasteHow,
  type SummaryFn,
} from './tools';
import { CHIP_COLORS, ValidPanel } from './ValidPanel';
import { asksAi, contextFor, costOnce, useAiCells } from './ai';
import { AnalyzePanel, CleanPanel } from './AiPanels';
import { askAi, ExplainAi, FormulaAi, TableAi } from './AiTools';
import { NamesPanel, ProtectPanel } from './RangesPanel';
import { LinkDialog } from './LinkDialog';

/** Cells copied or cut, to paste in this or another spreadsheet while the app is open (their formulas and looks). */
let clip: Clip | null = null;

/** The colours references are outlined in while a formula is typed. */
const REF_COLORS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#00838f'];

/** The zoom each device keeps for spreadsheets. */
const ZOOM_KEY = 'wa.sheet.zoom';
const savedZoom = () => {
  const z = Number(localStorage.getItem(ZOOM_KEY));
  return z >= 0.5 && z <= 2 ? z : 1;
};

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

/** The reference under the caret with its $ signs turned to the next of A1 → $A$1 → A$1 → $A1 (F4). */
function cycleRef(text: string, caret: number): { text: string; caret: number } | null {
  if (!text.startsWith('=')) return null;
  for (const f of formulaRefs(text.slice(1))) {
    const s = f.s + 1;
    const e = f.e + 1;
    if (caret < s || caret > e) continue;
    const part = text.slice(s, e);
    const bang = part.lastIndexOf('!');
    const head = bang >= 0 ? part.slice(0, bang + 1) : '';
    const next = part
      .slice(head.length)
      .split(':')
      .map((p) => {
        const m = /^(\$?)([A-Za-z]{1,3})?(\$?)(\d+)?$/.exec(p);
        if (!m) return p;
        const [, ac, col, ar, row] = m;
        const state = ac && ar ? 1 : !ac && ar ? 2 : ac && !ar ? 3 : 0;
        const to = (state + 1) % 4;
        return `${to === 1 || to === 3 ? '$' : ''}${col ?? ''}${to === 1 || to === 2 ? '$' : ''}${row ?? ''}`;
      })
      .join(':');
    const t = text.slice(0, s) + head + next + text.slice(e);
    return { text: t, caret: s + head.length + next.length };
  }
  return null;
}

/** A code with one decimal more (or fewer) in each of its number parts. */
function codeDecimals(code: string, d: 1 | -1): string {
  return code
    .split(';')
    .map((sec) =>
      sec.replace(/(?<!["\\])([0#])(\.(0+))?(?![0-9#])/, (m, digit: string, _dot: string, zeros: string | undefined) => {
        const n = Math.max(0, (zeros?.length ?? 0) + d);
        return `${digit}${n ? `.${'0'.repeat(n)}` : ''}`;
      }),
    )
    .join(';');
}

const clone = (b: Workbook): Workbook => structuredClone(b);

type PanelState = { kind: 'cf' } | { kind: 'dv'; start?: Validation } | { kind: 'chart'; id: string } | { kind: 'comments'; draft?: boolean } | { kind: 'analyze'; block: Rect; header: boolean } | { kind: 'clean'; block: Rect; header: boolean } | { kind: 'names' } | { kind: 'protect' } | null;
type DialogState = 'sort' | 'dups' | 'split' | 'format' | 'shortcuts' | 'summary' | 'table-ai' | 'link' | null;
type PickState = { kind: 'list' | 'date' | 'note' | 'chars'; r: number; c: number; at: DOMRect } | null;

/** Where an agent's words are arriving: its cell, boxed in the app's busy colour with a small flag (as a collaborator's in Google Sheets). */
function AgentCell({ geo, r, c }: { geo: GridGeo; r: number; c: number }) {
  if (r + 1 >= geo.rowOff.length || c + 1 >= geo.colOff.length) return null;
  const box = { left: geo.colOff[c] - 1, top: geo.rowOff[r] - 1, width: geo.colOff[c + 1] - geo.colOff[c] + 2, height: geo.rowOff[r + 1] - geo.rowOff[r] + 2 };
  return (
    <div aria-hidden className="pointer-events-none absolute z-[2] outline-2 outline-busy [outline-style:solid]" style={box}>
      <span className="absolute bottom-full left-0 mb-px rounded-[3px] bg-busy px-1 text-[10px] leading-[14px] font-semibold whitespace-nowrap text-bg">Agent</span>
    </div>
  );
}

export function SheetEditor({ doc, layout, readOnly: readOnlyProp, onSave, lead, tail, band, savedNote, onDirty, onAsk, onScopes, saveNowRef, live: agent }: ModelEditorProps<Workbook>) {
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<GridHandle>(null);
  const barRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The workbook being edited, changed in place patch by patch; and what was saved last (for Discard).
  const bookRef = useRef<Workbook | null>(doc ? clone(doc.model) : null);
  const savedRef = useRef<Workbook | null>(doc ? clone(doc.model) : null);
  const calcRef = useRef<Calc | null>(bookRef.current ? computeBook(bookRef.current) : null);
  const hist = useRef<{ past: Patch[]; future: Patch[]; saved: number; last?: { key: string; at: number } }>({ past: [], future: [], saved: 0 });
  // The AI function's answers (=AI(…)): kept apart from Undo's steps, and given to the workbook after each of them.
  const aiAnswers = useRef<Record<string, CellValue>>({ ...(doc?.model.ai ?? {}) });
  const aiDirty = useRef(false);
  const [rev, setRev] = useState(0);
  const [si, setSi] = useState(0);
  const [sel, setSelState] = useState<Sel>(cellSel(0, 0));
  const selRef = useRef(sel);
  selRef.current = sel;
  // More ranges picked with Ctrl+click besides the selection (a chart of several ranges; looks and Delete go on all).
  const [more, setMoreState] = useState<Rect[]>([]);
  const moreRef = useRef(more);
  const setMore = (m: Rect[]) => {
    moreRef.current = m;
    setMoreState(m);
  };
  const sels = useRef(new Map<string, Sel>());
  const [edit, setEditState] = useState<Edit | null>(null);
  const editRef = useRef<Edit | null>(null);
  const caretRef = useRef(0);
  const [caret, setCaret] = useState(0);
  const [cutMark, setCutMark] = useState<{ sheet: string; x: Rect } | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; on: 'cell' | 'col' | 'row'; sub?: 'paste' } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const [width, setWidth] = useState(1200);
  const [zoom, setZoomState] = useState(savedZoom);
  const [formulas, setFormulas] = useState(false);
  const [panel, setPanel] = useState<PanelState>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pick, setPick] = useState<PickState>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const [filterMenu, setFilterMenu] = useState<{ c: number; at: DOMRect } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const [chartSel, setChartSel] = useState<string | null>(null);
  const [rowCard, setRowCard] = useState<number | null>(null);
  // The Kanban board: whether it is shown, and (until settings of its own are kept with the sheet) the table it shows,
  // by its header row's first cell, and the column it groups by.
  const [boardOn, setBoardOn] = useState(false);
  const [boardLocal, setBoardLocal] = useState<{ r: number; c: number; by: number } | null>(null);
  const [line, setLine] = useState<{ kind: BorderKind; color?: string }>({ kind: 'thin' });
  const [header, setHeader] = useState(true);
  const [noteDraft, setNoteDraft] = useState('');
  // A list cell being typed into: the option its words pick (Enter takes it).
  const [suggestAt, setSuggestAt] = useState(0);
  const find = useFind();
  const [findHow, setFindHow] = useState({ formulas: false, wholeCell: false, allSheets: false });
  const [findAt, setFindAt] = useState(-1);

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
  // The menus' names go in the title bar where there is room for them, as Google Docs has them; else one button holds them.

  const h = hist.current;
  const dirty = !!bookRef.current && (h.saved !== h.past.length || aiDirty.current);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirty?.(dirty), [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Another spreadsheet, or a new version of it (the agent's) while nothing was changed here: start from it (before it
  // is drawn, so the one it replaces never shows again for a moment). A cell being typed in keeps it waiting until it is
  // done: then it is a change here, left as it is, or there is none and it comes in.
  const taken = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (!doc || doc.key === taken.current || dirtyRef.current || edit) return;
    taken.current = doc.key;
    bookRef.current = clone(doc.model);
    savedRef.current = clone(doc.model);
    calcRef.current = computeBook(bookRef.current);
    hist.current = { past: [], future: [], saved: 0 };
    aiAnswers.current = { ...(doc.model.ai ?? {}) };
    aiDirty.current = false;
    setSi((i) => Math.min(i, doc.model.sheets.length - 1));
    setEdit(null);
    setRev((r) => r + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.key, !!edit, dirty]);

  // An agent's version being written shows in place of the workbook (read-only, the cell being written in view, its
  // formulas worked out as it comes), unless there are changes here not saved: those are left as they are. A cell being
  // typed in holds it back until it is done.
  const liveBook = agent && !dirty && !edit ? agent.model : null;
  const liveOn = !!liveBook;
  const readOnly = !!readOnlyProp || liveOn;
  const liveCalc = useMemo(() => (liveBook ? computeBook(liveBook) : null), [liveBook]);
  const book = liveBook ?? bookRef.current;
  const calc = liveCalc ?? calcRef.current;
  // What draws the cells again: each change here, or each draw of the agent's version.
  const shownRev = liveOn ? -agent!.n : rev;
  const sheetIx = book ? Math.min(si, book.sheets.length - 1) : 0;
  const sheet: Sheet | undefined = book?.sheets[sheetIx];
  const size = useMemo(() => (calc ? gridSize(calc, sheetIx, sheet) : { rows: 1000, cols: 26 }), [calc, sheetIx, rev, sheet]); // eslint-disable-line react-hooks/exhaustive-deps
  // The sheet and the cell being written stay in view, unless a sheet was picked or the cells scrolled here lately.
  const pickedAt = useRef(0);
  const ownScroll = useOwnScroll(root);
  const mark = liveOn && agent?.mark?.kind === 'sheet' ? agent.mark : null;
  const markAt = mark ? parseRef(mark.cell) : null;
  useEffect(() => {
    if (!mark || !liveBook || performance.now() - pickedAt.current < 4000) return;
    const i = liveBook.sheets.findIndex((x) => x.id === mark.sheet);
    if (i >= 0 && i !== sheetIx) setSi(i);
    else if (markAt && !ownScroll()) grid.current?.reveal(markAt.r, markAt.c);
  }, [mark?.sheet, mark?.cell, agent?.n]);
  const x = rectOf(sel);

  // What the sheet's rules make of it, worked out once per change.
  const view = useMemo<GridView>(() => {
    const empty = {
      hidR: new Set<number>(),
      handR: new Set<number>(),
      hidC: new Set<number>(),
      merges: new Merges(undefined),
      cf: new CondFormats({ id: '', name: '', cells: {} }, 0, calc!),
      rules: new Rules({ id: '', name: '', cells: {} }),
      filter: null,
    };
    if (!sheet || !calc) return empty;
    const handR = new Set<number>();
    for (const [k, v] of Object.entries(sheet.rows ?? {})) if (v.hidden) handR.add(Number(k));
    const hidC = new Set<number>();
    for (const [k, v] of Object.entries(sheet.cols ?? {})) if (v.hidden) hidC.add(Number(k));
    const hidR = filterHidden(sheet, sheetIx, calc);
    for (const r of handR) hidR.add(r);
    const fx = sheet.filter ? parseRange(sheet.filter.range) : null;
    const on = new Set(Object.keys(sheet.filter?.cols ?? {}).map((k) => parseRef(`${k}1`)?.c ?? -1));
    return { hidR, handR, hidC, merges: new Merges(sheet.merges), cf: new CondFormats(sheet, sheetIx, calc), rules: new Rules(sheet), filter: fx ? { x: fx, on } : null };
  }, [sheet, calc, sheetIx, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- changes, Undo and Redo ----------------------------------------------------------------------------------------
  const warnedUntil = useRef(0);
  /** The protection a change would go against: of the cells it changes, on the sheets that have some. */
  const guarded = (b: Workbook, p: Patch): { refuse?: SheetProtect; warn?: SheetProtect } => {
    if (!b.sheets.some((s) => s.protect?.length)) return {};
    if (p.k === 'multi') {
      let warn: SheetProtect | undefined;
      for (const q of p.list) {
        const g = guarded(b, q);
        if (g.refuse) return g;
        warn ??= g.warn;
      }
      return warn ? { warn } : {};
    }
    if (p.k === 'cells') {
      const sh = b.sheets.find((s) => s.id === p.sheet);
      return sh ? guardOf(sh, Object.keys(p.after).flatMap((k) => (parseRef(k) ? [[parseRef(k)!.r, parseRef(k)!.c] as [number, number]] : []))) : {};
    }
    if (p.k === 'book') {
      // Rows or columns put in or taken out, a sort: the protected sheets whose cells it changes.
      for (const sh of p.after.sheets) {
        const was = p.before.sheets.find((s) => s.id === sh.id);
        if (!was?.protect?.length || was.cells === sh.cells) continue;
        const keys = new Set([...Object.keys(was.cells), ...Object.keys(sh.cells)].filter((k) => JSON.stringify(was.cells[k]) !== JSON.stringify(sh.cells[k])));
        const g = guardOf(was, [...keys].flatMap((k) => (parseRef(k) ? [[parseRef(k)!.r, parseRef(k)!.c] as [number, number]] : [])));
        if (g.refuse || g.warn) return g;
      }
    }
    return {};
  };
  /** The calculator brought up to date after a patch (done either way). */
  const sync = (p: Patch) => {
    const b = bookRef.current!;
    const c = calcRef.current!;
    // A workbook a step brought back has the AI answers as they are now.
    if (Object.keys(aiAnswers.current).length) b.ai = aiAnswers.current;
    else delete b.ai;
    if (swapsBook(p)) return c.reset(b);
    for (const [id, keys] of touched(p)) c.update(b.sheets.findIndex((s) => s.id === id), keys);
  };

  /**
   * A change: done now, and kept for Undo. Changes with the same `key` a moment apart (a chart's title typed letter by
   * letter) are one step of Undo.
   */
  const change = (p: Patch | null, at?: Sel, key?: string) => {
    const b = bookRef.current;
    if (!p || readOnly || !b) return;
    // Protected cells (Data → Protect sheets and ranges): refused, or a warning first (then none for five minutes).
    const g = guarded(b, p);
    if (g.refuse) return void toast(tr(g.refuse.note ? `Those cells are protected: ${g.refuse.note}. Data → Protect sheets and ranges takes it off.` : 'Those cells are protected: Data → Protect sheets and ranges takes it off.'));
    if (g.warn && Date.now() > warnedUntil.current) {
      void confirm({ title: tr('Change protected cells?'), body: g.warn.note ? tr(`They are protected so they warn first: ${g.warn.note}.`) : tr('They are protected so they warn before they change.'), confirm: tr('Change them') }).then((yes) => {
        if (!yes) return;
        warnedUntil.current = Date.now() + 5 * 60_000;
        change(p, at, key);
      });
      return;
    }
    p.at = { sheet: b.sheets[sheetIx]?.id ?? '', sel: at ?? selRef.current };
    bookRef.current = applyPatch(b, p, false);
    sync(p);
    const hh = hist.current;
    const prev = hh.past[hh.past.length - 1];
    const now = Date.now();
    if (key && hh.last?.key === key && now - hh.last.at < 1500 && prev?.k === 'meta' && p.k === 'meta' && prev.sheet === p.sheet && hh.saved !== hh.past.length) {
      // One step with the change before it: from what that one started from to what this one makes.
      prev.after = p.after;
      hh.last = { key, at: now };
      hh.future = [];
      setRev((r) => r + 1);
      return;
    }
    hh.last = key ? { key, at: now } : undefined;
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
    hh.last = undefined;
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
    hh.last = undefined;
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
    if (editRef.current) setEdit(null);
    setSaving(true);
    try {
      const copy = clone(bookRef.current);
      if (copy.ai) {
        const used = aiCells.used();
        copy.ai = Object.fromEntries(Object.entries(copy.ai).filter(([k]) => used.has(k)));
        if (!Object.keys(copy.ai).length) delete copy.ai;
      }
      if (await onSave(copy)) {
        savedRef.current = clone(copy);
        aiDirty.current = false;
        hist.current.saved = hist.current.past.length;
        hist.current.last = undefined;
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
    aiAnswers.current = { ...(savedRef.current.ai ?? {}) };
    aiDirty.current = false;
    setSi((i) => Math.min(i, bookRef.current!.sheets.length - 1));
    setRev((r) => r + 1);
  };

  // ---- the selection --------------------------------------------------------------------------------------------------------
  const clampSel = (s: Sel): Sel => {
    const r = (n: number) => Math.max(0, Math.min(size.rows - 1, n));
    const c = (n: number) => Math.max(0, Math.min(size.cols - 1, n));
    return { r: r(s.r), c: c(s.c), ar: r(s.ar), ac: c(s.ac), fr: r(s.fr), fc: c(s.fc) };
  };
  /** A selection grown to take in whole the merges it touches, its active cell a merge's first. */
  const growSel = (s: Sel): Sel => {
    if (!view.merges.list.length) return s;
    const b = rectOf(s);
    // Whole rows or columns stay as they were picked.
    if ((b.r1 === 0 && b.r2 >= size.rows - 1) || (b.c1 === 0 && b.c2 >= size.cols - 1)) return s;
    const g = view.merges.grow(b);
    const m = view.merges.at(s.r, s.c);
    const down = s.fr >= s.ar;
    const right = s.fc >= s.ac;
    return { r: m ? m.r1 : s.r, c: m ? m.c1 : s.c, ar: down ? g.r1 : g.r2, fr: down ? g.r2 : g.r1, ac: right ? g.c1 : g.c2, fc: right ? g.c2 : g.c1 };
  };
  /** A new selection (what is being typed goes in first); `reveal` scrolls to it; `keepMore`: the other ranges picked stay. */
  const setSel = (s: Sel, reveal = false, keepEdit = false, keepMore = false) => {
    if (!keepMore && moreRef.current.length) setMore([]);
    if (editRef.current && !keepEdit) {
      commitEdit(null);
      // Words its rule refused stay out of the cell.
      if (editRef.current) setEdit(null);
    }
    const next = growSel(clampSel(s));
    selRef.current = next;
    setSelState(next);
    setChartSel(null);
    if (sheet) sels.current.set(sheet.id, next);
    // The far corner comes into view (as the selection grows), or the active cell when whole rows or columns are picked.
    const b = rectOf(next);
    const whole = (b.r1 === 0 && b.r2 >= size.rows - 1) || (b.c1 === 0 && b.c2 >= size.cols - 1);
    if (reveal) requestAnimationFrame(() => (whole ? grid.current?.reveal(next.r, next.c) : grid.current?.reveal(next.fr, next.fc)));
  };
  /** Ctrl+click: the selection joins the ranges picked, and a new one begins at the cell. */
  const addRange = (r: number, c: number) => {
    const all = [...moreRef.current, rectOf(selRef.current)].slice(-20);
    setSel(cellSel(r, c), false, false, true);
    setMore(all);
  };
  /** Every range picked: those with Ctrl+click, then the selection. */
  const picked = (): Rect[] => [...moreRef.current, rectOf(selRef.current)];
  const pickSheet = (i: number) => {
    if (!book || i === sheetIx) return;
    pickedAt.current = performance.now();
    if (moreRef.current.length) setMore([]);
    if (editRef.current) commitEdit(null);
    if (editRef.current) setEdit(null);
    if (sheet) sels.current.set(sheet.id, selRef.current);
    const next = book.sheets[i];
    const s = sels.current.get(next.id) ?? cellSel(0, 0);
    setSi(i);
    setChartSel(null);
    setPanel((p) => (p?.kind === 'chart' ? null : p));
    selRef.current = s;
    setSelState(s);
  };

  /** One step from a cell: past its merge, over hidden rows and columns, onto a merge's first cell. */
  const stepFrom = (r: number, c: number, dr: number, dc: number, snap = true): [number, number] => {
    const m = view.merges.at(r, c) ?? { r1: r, c1: c, r2: r, c2: c };
    let nr = dr > 0 ? m.r2 + 1 : dr < 0 ? m.r1 - 1 : r;
    let nc = dc > 0 ? m.c2 + 1 : dc < 0 ? m.c1 - 1 : c;
    while (dr && nr >= 0 && nr < size.rows && view.hidR.has(nr)) nr += dr;
    while (dc && nc >= 0 && nc < size.cols && view.hidC.has(nc)) nc += dc;
    if (nr < 0 || nc < 0 || nr >= size.rows || nc >= size.cols) return [r, c];
    const m2 = snap ? view.merges.at(nr, nc) : null;
    return m2 ? [m2.r1, m2.c1] : [nr, nc];
  };

  /** Moves the active cell one step: within the selection when it is more than a cell (Enter, Tab), else from it. */
  const advance = (dr: number, dc: number) => {
    const s = selRef.current;
    const m = view.merges.at(s.r, s.c);
    const b0 = rectOf(s);
    if (single(s) || (m && m.r1 === b0.r1 && m.r2 === b0.r2 && m.c1 === b0.c1 && m.c2 === b0.c2)) {
      const [r, c] = stepFrom(s.r, s.c, dr, dc);
      return setSel(cellSel(r, c), true);
    }
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
    const next = { ...s, r, c };
    selRef.current = next;
    setSelState(next);
    requestAnimationFrame(() => grid.current?.reveal(r, c));
  };

  // ---- typing into cells --------------------------------------------------------------------------------------------------
  const startEdit = (mode: 'type' | 'edit', text?: string, where: 'cell' | 'bar' = 'cell') => {
    if (readOnly || !sheet) return;
    const t = text ?? inputText(sheet.cells[refName(selRef.current.r, selRef.current.c)]);
    setEdit({ text: t, mode, where });
    setSuggestAt(0);
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
    if (text !== e.text) {
      setEdit({ ...e, text, point: undefined });
      setSuggestAt(0);
    }
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

  /** Whether a cell's rule takes what was typed: a rule that refuses other input says why and keeps the typing open. */
  const refused = (r: number, c: number, cell: Cell | null): boolean => {
    const got = view.rules.any ? view.rules.at(r, c) : null;
    if (!got || !calc || !cell || (cell.v === undefined && cell.f === undefined)) return false;
    const v = cell.f !== undefined ? null : (cell.v ?? null);
    if (v === null) return false;
    const shown = formatValue(v, cell.s);
    if (allowed(calc, sheetIx, got.rule, v, shown, { r, c, r0: got.r0, c0: got.c0 })) return false;
    if (!got.rule.reject) return false;
    toast(ruleWords(got.rule), 'error');
    return true;
  };
  /** What a rule lets a cell take, in words, for when it refuses a value. */
  const ruleWords = (rule: Validation): string => {
    const w = rule.when;
    const opts = rule.type === 'list' && calc ? listOptions(calc, sheetIx, rule).map((o) => o.v) : [];
    if (opts.length) return `${tr('This cell takes one of')}: ${opts.slice(0, 8).join(', ')}${opts.length > 8 ? '…' : ''}`;
    if (rule.type === 'checkbox') return tr('This cell takes TRUE or FALSE.');
    const max = rule.max ?? 5;
    if (rule.type === 'rating') return tr(`This cell takes a whole number of stars from 0 to ${max}.`);
    if (!w || rule.type === 'formula') return tr('This value is not allowed in this cell.');
    // Each a whole sentence, so it translates whole (its words may go in another order).
    const [a, b] = [w.a ?? '', w.b ?? ''];
    const sign = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' }[w.op as 'eq'] ?? '=';
    if (rule.type === 'date')
      return tr(w.op === 'between' ? `This cell takes a date between ${a} and ${b}.` : w.op === 'notBetween' ? `This cell takes a date not between ${a} and ${b}.` : `This cell takes a date ${sign} ${a}.`);
    if (rule.type === 'length')
      return tr(w.op === 'between' ? `This cell takes words whose length is between ${a} and ${b}.` : w.op === 'notBetween' ? `This cell takes words whose length is not between ${a} and ${b}.` : `This cell takes words whose length is ${sign} ${a}.`);
    return tr(w.op === 'between' ? `This cell takes a number between ${a} and ${b}.` : w.op === 'notBetween' ? `This cell takes a number not between ${a} and ${b}.` : `This cell takes a number ${sign} ${a}.`);
  };

  /** The options a list cell offers for what is typed in it. */
  const suggestions = (): string[] => {
    const e = editRef.current;
    if (!e || !calc || e.text.startsWith('=')) return [];
    const got = view.rules.any ? view.rules.at(selRef.current.r, selRef.current.c) : null;
    if (got?.rule.type !== 'list') return [];
    const t = e.text.trim().toLowerCase();
    return listOptions(calc, sheetIx, got.rule)
      .map((o) => o.v)
      .filter((o) => !t || o.toLowerCase().includes(t))
      .slice(0, 8);
  };

  /** What was typed goes into the cell (or every cell of the selection, with Ctrl+Enter); then the active cell moves. */
  const commitEdit = (move: [number, number] | null, all = false, pickedText?: string) => {
    const e = editRef.current;
    if (!e) return;
    const b = bookRef.current;
    if (readOnly || !b || !sheet) return setEdit(null);
    const s = selRef.current;
    // A list cell: what was typed picks the option it starts (or is in), as a dropdown does.
    let text = pickedText ?? (e.text.startsWith('=') ? closeBrackets(e.text) : e.text);
    if (pickedText === undefined && !text.startsWith('=') && text.trim()) {
      const opts = suggestions();
      const exact = opts.find((o) => o.toLowerCase() === text.trim().toLowerCase());
      if (!exact && opts.length) text = opts[Math.min(suggestAt, opts.length - 1)];
      else if (exact) text = exact;
    }
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
    if (refused(s.r, s.c, changes[key])) return;
    setEdit(null);
    const f = changes[key]?.f;
    if (f !== undefined) {
      const why = formulaProblem(f);
      if (why) toast(`${tr('This formula cannot be worked out')}: ${tr(why)}`, 'error');
    }
    // A row typed just below a filter's range joins it, as in Google Sheets.
    const fx = view.filter?.x;
    const grow = fx && sheet.filter && holds(changes[key] ?? undefined) && s.r === fx.r2 + 1 && s.c >= fx.c1 && s.c <= fx.c2 ? metaPatch(sheet, { filter: { ...sheet.filter, range: rangeName({ ...fx, r2: fx.r2 + 1 }) } }) : null;
    change(together([cellsPatch(b, sheetIx, changes), grow]), s);
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
    const m = /([A-Za-z_][A-Za-z0-9._]*)$/.exec(e.text.slice(0, pos));
    const start = m ? pos - m[1].length : pos;
    // A named range goes in as it is; a function (or a named LAMBDA) with its bracket.
    const range = bookRef.current?.names?.find((x) => x.name === n);
    const open = range && !/^\s*LAMBDA\s*\(/i.test(range.ref) ? '' : '(';
    setText(`${e.text.slice(0, start)}${n}${open}${e.text.slice(pos)}`, start + n.length + open.length, true);
  };

  /** Words put in the active cell (a date, a function to fill in, a character): at the caret while typing; else typing begins with them, after what the cell holds when `after`. */
  const typeIn = (text: string, after = false) => {
    if (readOnly || !sheet) return;
    const e = editRef.current;
    if (e) {
      const pos = caretRef.current;
      return setText(e.text.slice(0, pos) + text + e.text.slice(pos), pos + text.length, true);
    }
    const s = selRef.current;
    grid.current?.input()?.focus({ preventScroll: true });
    startEdit('edit', (after ? inputText(sheet.cells[refName(s.r, s.c)]) : '') + text);
  };

  // ---- how cells look -------------------------------------------------------------------------------------------------------
  const active: Cell | undefined = sheet?.cells[refName(sel.r, sel.c)];
  const restyle = (f: (s: CellStyle | undefined) => CellStyle | undefined, extra?: (changes: Record<string, Cell | null>) => Patch | null) => {
    if (!book || !sheet || !calc) return;
    const changes: Record<string, Cell | null> = {};
    for (const x2 of picked()) Object.assign(changes, styleChanges(sheet, calc, sheetIx, x2, f));
    change(together([cellsPatch(book, sheetIx, changes), extra?.(changes) ?? null]));
    grid.current?.focus();
  };
  const setStyle = (set: Partial<CellStyle>) =>
    restyle(
      (s) => withStyle(s, set),
      // Words wrapped need their rows taller: rows not sized by hand fit them.
      set.wrap ? (changes) => fitRows(Object.keys(changes), changes) : undefined,
    );
  const setFormat = (fmt: NumFmt | 'custom', cur?: string) => {
    if (fmt === 'custom') return setDialog('format');
    restyle((s) => withStyle(s, { fmt: fmt === 'general' ? undefined : fmt, dp: undefined, code: undefined, cur: (fmt === 'currency' || fmt === 'accounting') && cur && cur !== '$' ? cur : undefined }));
  };
  const setCode = (code: string | undefined) => restyle((s) => withStyle(s, { code, dp: undefined, cur: undefined, fmt: undefined }));
  const stepDecimals = (d: 1 | -1) => {
    if (!calc) return;
    const s = active?.s;
    if (s?.code) return restyle((st) => withStyle(st, { code: st?.code ? codeDecimals(st.code, d) : undefined }));
    const fmt = s?.fmt ?? 'general';
    if (isDateFmt(fmt) || fmt === 'text') return;
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
    const rows = new Set(names.map((n) => parseRef(n)?.r ?? -1).filter((r) => r >= 0 && !sheet.rows?.[r]?.h));
    if (!rows.size) return null;
    const next = { ...(sheet.rows ?? {}) };
    let any = false;
    for (const r of rows) {
      const hgt = neededHeight(r, changes);
      if (hgt > ROW_H) {
        next[r] = { ...next[r], h: Math.min(MAX_H, hgt) };
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
      const lines = cell.s?.wrap ? text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(textWidth(l, cell.s) / Math.max(20, colW(sheet, c) - 10))), 0) : text.split('\n').length;
      most = Math.max(most, Math.ceil(lines * lh + 8));
    }
    return most;
  };

  // ---- sizes, freezing, zoom --------------------------------------------------------------------------------------------------
  const setSize = (axis: 'col' | 'row', i: number, sz: number | null) => {
    if (!sheet) return;
    const key = axis === 'col' ? 'cols' : 'rows';
    const next: Record<number, { w?: number; h?: number; hidden?: boolean }> = { ...(sheet[key] ?? {}) };
    const cur = { ...(next[i] ?? {}) };
    if (sz === null || sz === (axis === 'col' ? COL_W : ROW_H)) delete cur[axis === 'col' ? 'w' : 'h'];
    else cur[axis === 'col' ? 'w' : 'h'] = sz;
    if (Object.keys(cur).length) next[i] = cur;
    else delete next[i];
    change(metaPatch(sheet, { [key]: Object.keys(next).length ? next : undefined }));
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
    change(metaPatch(sheet, { freeze }));
  };
  const setZoom = (z: number) => {
    setZoomState(z);
    try {
      localStorage.setItem(ZOOM_KEY, String(z));
    } catch {}
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
  const hide = (axis: 'row' | 'col') => {
    if (!sheet) return;
    const [a, b] = axis === 'row' ? [wholeCols ? sel.r : x.r1, wholeCols ? sel.r : x.r2] : [wholeRows ? sel.c : x.c1, wholeRows ? sel.c : x.c2];
    change(axis === 'row' ? metaPatch(sheet, { rows: hiddenSet(sheet.rows, a, b, true) }) : metaPatch(sheet, { cols: hiddenSet(sheet.cols, a, b, true) }));
    // The active cell goes past what was hidden.
    if (axis === 'row') setSel(cellSel(Math.min(size.rows - 1, b + 1), sel.c));
    else setSel(cellSel(sel.r, Math.min(size.cols - 1, b + 1)));
  };
  const unhide = (axis: 'row' | 'col', i: number) => {
    if (!sheet) return;
    const sizes = axis === 'row' ? sheet.rows : sheet.cols;
    const run = hiddenRun(sizes, i);
    if (!run) return;
    change(axis === 'row' ? metaPatch(sheet, { rows: hiddenSet(sheet.rows, run[0], run[1], false) }) : metaPatch(sheet, { cols: hiddenSet(sheet.cols, run[0], run[1], false) }));
  };
  const showAll = (axis: 'row' | 'col') => {
    if (!sheet) return;
    const sizes = axis === 'row' ? sheet.rows : sheet.cols;
    const keys = Object.entries(sizes ?? {})
      .filter(([, v]) => v.hidden)
      .map(([k]) => Number(k));
    if (!keys.length) return;
    let next = sizes;
    for (const k of keys) next = hiddenSet(next, k, k, false);
    change(metaPatch(sheet, axis === 'row' ? { rows: next as Sheet['rows'] } : { cols: next as Sheet['cols'] }));
  };
  /** The block a whole-sheet action works on: the cells picked, or the data around the active cell. */
  const blockOf = (): Rect => {
    if (!sheet || !calc) return x;
    const e = calc.extent(sheetIx);
    if (single(sel) || wholeCols || wholeRows) return regionAround(sheet, sel.r, sel.c, Math.max(e.rows, sel.r + 1), Math.max(e.cols, sel.c + 1));
    return x;
  };
  const sort = (asc: boolean) => {
    if (!book || !sheet || !calc) return;
    const block = blockOf();
    const body = (single(sel) || wholeCols || wholeRows) && hasHeader(sheet, calc, sheetIx, block) ? { ...block, r1: block.r1 + 1 } : block;
    if (body.r2 <= body.r1) return void toast(tr('There is nothing to sort here: pick a column of a table, or the rows to sort.'));
    const col = Math.max(body.c1, Math.min(body.c2, sel.c));
    // The rows' comments go with them.
    const moved = new Map<number, number>();
    const changes = sortChanges(sheet, calc, sheetIx, body, col, asc, moved);
    change(together([cellsPatch(book, sheetIx, changes), commentsMoved(sheet, body, moved)]));
    grid.current?.focus();
  };
  const clear = (all = false) => {
    if (!book || !sheet || !calc) return;
    if (all) {
      // Clear formatting: the looks go, what cells hold stays.
      restyle(() => undefined);
      return;
    }
    const changes: Record<string, Cell | null> = {};
    for (const x2 of picked()) Object.assign(changes, clearChanges(sheet, calc, sheetIx, x2));
    change(cellsPatch(book, sheetIx, changes));
  };
  const fill = (down: boolean) => {
    if (!book || !sheet) return;
    change(cellsPatch(book, sheetIx, fillChanges(sheet, rectOf(selRef.current), down)));
  };
  /** The fill handle let go over `target`: the series goes on there. */
  const fillTo = (target: Rect, ctrl: boolean) => {
    if (!book || !sheet) return;
    const src = rectOf(selRef.current);
    if (target.r1 === src.r1 && target.r2 === src.r2 && target.c1 === src.c1 && target.c2 === src.c2) return;
    const limited = { ...target, r2: Math.min(target.r2, SHEET_LIMITS.rows - 1), c2: Math.min(target.c2, SHEET_LIMITS.cols - 1) };
    change(cellsPatch(book, sheetIx, fillSeries(sheet, src, limited, ctrl)));
    setSel(rectSel(limited, selRef.current.r, selRef.current.c));
    grid.current?.focus();
  };
  const fillDown = () => {
    if (!sheet || !calc) return;
    const src = rectOf(selRef.current);
    const to = fillDownTo(sheet, calc, sheetIx, src);
    if (to > src.r2) fillTo({ ...src, r2: to }, false);
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
  const norm = (t: string) => t.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const pasteText = (text: string) => {
    const b = bookRef.current;
    if (!b || !sheet || readOnly) return;
    const own = clip && norm(clip.text) === norm(text) ? clip : null;
    const target = rectOf(selRef.current);
    const got = pasteChanges(sheet, target, own ? { clip: own } : { text });
    const patches: (Patch | null)[] = [];
    if (own?.cut) {
      // Cells cut leave where they were (all but those pasted over), their comments going with them.
      const from = b.sheets.find((s) => s.id === own.sheet);
      const dr = got.x.r1 - own.x.r1;
      const dc = got.x.c1 - own.x.c1;
      const inCut = (cm: SheetComment) => {
        const p = parseRef(cm.cell)!;
        return p.r >= own.x.r1 && p.r <= own.x.r2 && p.c >= own.x.c1 && p.c <= own.x.c2;
      };
      const going = from?.comments?.filter(inCut) ?? [];
      if (from && going.length) {
        const moved = going.map((cm) => {
          const p = parseRef(cm.cell)!;
          return { ...cm, cell: refName(p.r + dr, p.c + dc) };
        });
        const keep = (list: SheetComment[] | undefined, out: Set<string>) => (list ?? []).filter((cm) => !out.has(cm.cell));
        const target = new Set(moved.map((m) => m.cell));
        if (from.id === sheet.id) patches.push(metaPatch(from, { comments: [...keep(from.comments?.filter((cm) => !inCut(cm)), target), ...moved].sort((x, y) => keyOf(x.cell) - keyOf(y.cell)) }));
        else {
          const rest = from.comments!.filter((cm) => !inCut(cm));
          patches.push(metaPatch(from, { comments: rest.length ? rest : undefined }));
          patches.push(metaPatch(sheet, { comments: [...keep(sheet.comments, target), ...moved].sort((x, y) => keyOf(x.cell) - keyOf(y.cell)) }));
        }
      }
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
  const readClipboard = async (): Promise<string | null> => {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return clip ? clip.text : null;
    }
  };
  const menuPaste = async () => {
    const t = await readClipboard();
    if (t !== null) pasteText(t);
    else toast(tr('This browser keeps its clipboard to itself: press Ctrl+V (or ⌘V) to paste.'));
  };
  /** Paste special: values, looks or formulas alone, or turned on its side. */
  const pasteHow = async (how: PasteHow) => {
    const b = bookRef.current;
    if (!b || !sheet || readOnly) return;
    const text = await readClipboard();
    const own = clip && (text === null || norm(clip.text) === norm(text)) ? clip : null;
    const target = rectOf(selRef.current);
    let got: { changes: Record<string, Cell | null>; x: Rect };
    if (own) got = pasteSpecial(sheet, target, own, how);
    else if (text !== null) {
      if (how === 'formats') return void toast(tr('Only cells copied here bring their looks.'));
      let rows = parseDelimited(text.replace(/\r?\n$/, ''), '\t').rows;
      if (how === 'transposed') rows = rows.length ? Array.from({ length: Math.max(...rows.map((r) => r.length)) }, (_, j) => rows.map((r) => r[j] ?? '')) : rows;
      got = how === 'values' || how === 'transposed' ? pasteTextValues(sheet, target, rows) : pasteChanges(sheet, target, { text });
    } else return void toast(tr('This browser keeps its clipboard to itself: press Ctrl+V (or ⌘V) to paste.'));
    change(cellsPatch(b, sheetIx, got.changes));
    setSel(rectSel(got.x), true);
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
    if (!rg) {
      // A named range: where it is (one that is no range of cells, a value or a formula, is nowhere to go).
      const nm = (book.names ?? []).find((n) => n.name.toLowerCase() === t.toLowerCase() && (!n.sheet || n.sheet === book.sheets[target].id));
      if (nm && /^(?:'(?:[^']|'')+'|[^'!(]+)![$A-Za-z0-9:]+$|^[$A-Za-z]+[$0-9]+(?::[$A-Za-z]+[$0-9]+)?$/.test(nm.ref)) return goName(nm.ref.replace(/\$/g, ''));
      return void toast(tr(nm ? `${nm.name} is a value or a formula, not a range of cells.` : 'Type a cell such as C12, a range such as B2:D9, or a named range.')), false;
    }
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

  /** A cell's link opened: a web address in a new tab, a place in the workbook gone to. */
  const openLink = (url: string) => {
    if (url.startsWith('#')) return void goName(url.slice(1));
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ---- the filter ---------------------------------------------------------------------------------------------------------------
  const toggleFilter = () => {
    if (!sheet || !calc) return;
    if (sheet.filter) return change(metaPatch(sheet, { filter: undefined }));
    const block = blockOf();
    if (block.r2 <= block.r1 && single(sel)) return void toast(tr('Pick the table to filter, or a cell in it.'));
    change(metaPatch(sheet, { filter: { range: rangeName(block) } }));
  };
  const setFilterCol = (c: number, fc: FilterCol | null) => {
    if (!sheet?.filter) return;
    const cols = { ...(sheet.filter.cols ?? {}) };
    if (fc) cols[colName(c)] = fc;
    else delete cols[colName(c)];
    change(metaPatch(sheet, { filter: { range: sheet.filter.range, ...(Object.keys(cols).length ? { cols } : {}) } }));
  };
  const sortFiltered = (c: number, asc: boolean) => {
    if (!book || !sheet || !calc || !view.filter) return;
    const fx = view.filter.x;
    const body = { ...fx, r1: fx.r1 + 1, r2: Math.min(fx.r2, calc.extent(sheetIx).rows - 1) };
    if (body.r2 <= body.r1) return;
    const moved = new Map<number, number>();
    const changes = sortChanges(sheet, calc, sheetIx, body, c, asc, moved);
    change(together([cellsPatch(book, sheetIx, changes), commentsMoved(sheet, body, moved)]));
  };

  // ---- rules for what cells take, and the cells they draw ------------------------------------------------------------------------
  const setRules = (validation: Validation[]) => sheet && change(metaPatch(sheet, { validation: validation.length ? validation : undefined }));
  /** A rule over the cells picked, in place of rules on exactly those cells; `values` fills them too. */
  const addRule = (rule: Validation, values?: (c: Cell | undefined) => Cell | null | undefined) => {
    if (!book || !sheet) return;
    const rest = (sheet.validation ?? []).filter((v) => v.range !== rule.range);
    const patches: (Patch | null)[] = [metaPatch(sheet, { validation: [...rest, rule] })];
    if (values) {
      const changes: Record<string, Cell | null> = {};
      const b = rectOf(selRef.current);
      for (let r = b.r1; r <= Math.min(b.r2, b.r1 + 5000); r++)
        for (let c = b.c1; c <= b.c2; c++) {
          const k = refName(r, c);
          const next = values(sheet.cells[k]);
          if (next !== undefined) changes[k] = next;
        }
      patches.push(cellsPatch(book, sheetIx, changes));
    }
    change(together(patches));
  };
  const selRange = () => rangeName(wholeCols || wholeRows ? { ...x, r2: Math.min(x.r2, calc ? Math.max(calc.extent(sheetIx).rows - 1, x.r1) : x.r2), c2: Math.min(x.c2, calc ? Math.max(calc.extent(sheetIx).cols - 1, x.c1) : x.c2) } : x);
  const insertCheckbox = () => addRule({ range: selRange(), type: 'checkbox' }, (c) => (typeof c?.v === 'boolean' || c?.f !== undefined ? undefined : tidyCell({ ...(c ?? {}), v: false })));
  const insertRating = () => addRule({ range: selRange(), type: 'rating' });
  const insertDropdown = () => {
    if (!sheet || !calc) return;
    // The values the cells hold already become the options, each with a colour.
    const seen = new Map<string, string>();
    for (const [k, r, c] of cellsIn(sheet, calc, sheetIx, x)) {
      if (!holds(sheet.cells[k])) continue;
      const t = formatValue(calc.value(sheetIx, r, c), sheet.cells[k].s).trim();
      if (t && !seen.has(t.toLowerCase()) && seen.size < 20) seen.set(t.toLowerCase(), t);
    }
    const options = seen.size ? [...seen.values()].map((v, i) => ({ v, color: CHIP_COLORS[i % CHIP_COLORS.length] })) : undefined;
    setPanel({
      kind: 'dv',
      start: {
        range: selRange(),
        type: 'list',
        ...(options
          ? { options }
          : {
              options: [
                { v: 'Option 1', color: CHIP_COLORS[0] },
                { v: 'Option 2', color: CHIP_COLORS[1] },
              ],
            }),
      },
    });
  };
  /** A value put in a cell from its widget (a checkbox, a list, stars, the calendar). */
  const setCellValue = (r: number, c: number, text: string) => {
    if (!book || !sheet || readOnly) return;
    const k = refName(r, c);
    if (sheet.cells[k]?.f !== undefined) return void toast(tr('This cell holds a formula: change it in the formula bar.'));
    const next = typedInto(sheet.cells[k], text);
    if (refused(r, c, next)) return;
    change(cellsPatch(book, sheetIx, { [k]: next }));
  };
  const onSmart = (kind: Smart, r: number, c: number, at: DOMRect, n?: number) => {
    if (!sheet || !calc || readOnly) return;
    if (kind === 'check') {
      const v = calc.value(sheetIx, r, c);
      return setCellValue(r, c, v === true ? 'FALSE' : 'TRUE');
    }
    if (kind === 'rate') {
      const v = calc.value(sheetIx, r, c);
      return setCellValue(r, c, String(v === n ? 0 : (n ?? 0)));
    }
    setPick({ kind, r, c, at });
  };
  /** Space on a checkbox ticks every checkbox picked (all to the same, as Sheets does). */
  const toggleChecks = (): boolean => {
    if (!book || !sheet || !calc || !view.rules.any) return false;
    const b = rectOf(selRef.current);
    const first = view.rules.at(selRef.current.r, selRef.current.c);
    if (first?.rule.type !== 'checkbox') return false;
    const to = calc.value(sheetIx, selRef.current.r, selRef.current.c) !== true;
    const changes: Record<string, Cell | null> = {};
    for (let r = b.r1; r <= Math.min(b.r2, b.r1 + 5000); r++)
      for (let c = b.c1; c <= b.c2; c++) {
        if (view.rules.at(r, c)?.rule.type !== 'checkbox') continue;
        const k = refName(r, c);
        if (sheet.cells[k]?.f !== undefined) continue;
        changes[k] = tidyCell({ ...(sheet.cells[k] ?? {}), v: to });
      }
    change(cellsPatch(book, sheetIx, changes));
    return true;
  };

  // ---- borders, merges ------------------------------------------------------------------------------------------------------------
  const lineText = cleanBorder(`${line.kind}${line.color ? ` ${line.color}` : ''}`);
  const borders = (where: BorderWhere) => {
    if (!book || !sheet) return;
    const changes: Record<string, Cell | null> = {};
    for (const x2 of picked()) Object.assign(changes, borderChanges(sheet, x2, where, where === 'none' ? undefined : lineText));
    change(cellsPatch(book, sheetIx, changes));
    grid.current?.focus();
  };
  const merged = !!view.merges.list.length && view.merges.list.some((m) => m.r1 <= x.r2 && m.r2 >= x.r1 && m.c1 <= x.c2 && m.c2 >= x.c1);
  const merge = async (how: 'all' | 'across' | 'down' | 'none') => {
    if (!book || !sheet) return;
    const b = rectOf(selRef.current);
    if (how !== 'none' && b.r1 === b.r2 && b.c1 === b.c2) return void toast(tr('Pick two cells or more to merge.'));
    if (how !== 'none' && (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1) > 100_000) return void toast(tr('That is too many cells to merge.'));
    const got = mergeResult(sheet, b, how);
    if (got.lost.length && !(await confirm({ title: 'Merge these cells?', body: 'Only the top-left value of each merge is kept; the others are cleared.', confirm: 'Merge' }))) return;
    const lost: Record<string, Cell | null> = {};
    for (const k of got.lost) {
      const c = sheet.cells[k];
      lost[k] = c ? tidyCell({ ...(c.s ? { s: c.s } : {}) }) : null;
    }
    change(together([metaPatch(sheet, { merges: got.merges.length ? got.merges : undefined }), cellsPatch(book, sheetIx, lost)]));
    setSel(rectSel(b, b.r1, b.c1));
  };

  // ---- conditional formatting -------------------------------------------------------------------------------------------------------
  const setConditional = (rules: Sheet['conditional']) => sheet && change(metaPatch(sheet, { conditional: rules?.length ? rules : undefined }));

  // ---- charts -------------------------------------------------------------------------------------------------------------------
  const setCharts = (charts: SheetChart[], key?: string) => sheet && change(metaPatch(sheet, { charts: charts.length ? charts : undefined }), undefined, key);
  const insertChart = () => {
    if (!sheet || !calc) return;
    if ((sheet.charts?.length ?? 0) >= SHEET_LIMITS.charts) return void toast(tr('A sheet holds at most 20 charts.'));
    // The ranges picked with Ctrl+click (the labels from one, the values from the others), or the cells picked, or the table around them.
    const parts = moreRef.current.length ? picked() : [blockOf()];
    const block = parts.reduce((a, b) => ({ r1: Math.min(a.r1, b.r1), c1: Math.min(a.c1, b.c1), r2: Math.max(a.r2, b.r2), c2: Math.max(a.c2, b.c2) }));
    const e = calc.shownExtent(sheetIx);
    if (!e.rows) return void toast(tr('Put some numbers in the sheet first, then pick them for the chart.'));
    // Beside the sheet's data, a little way into the column after it, level with the cells it draws: on those cells.
    const at = Math.min(SHEET_LIMITS.cols - 1, Math.max(block.c2 + 1, e.cols));
    const g = sheetSizes(sheet, view.hidR);
    const from = { cell: refName(block.r1, at), dx: 20 };
    const p0 = cornerXY(from, g);
    const chart: SheetChart = { id: newId(), kind: 'column', range: parts.map(rangeName).join(','), from, to: cornerAt(p0.x + 480, p0.y + 300, g.colW, g.rowH) };
    setCharts([...(sheet.charts ?? []), chart]);
    if (moreRef.current.length) setMore([]);
    setChartSel(chart.id);
    setPanel({ kind: 'chart', id: chart.id });
    requestAnimationFrame(() => grid.current?.reveal(block.r1, Math.min(size.cols - 1, at + 3)));
  };
  const chartOf = (id: string) => sheet?.charts?.find((c) => c.id === id);
  const updateChart = (c: SheetChart, key?: string) =>
    sheet &&
    setCharts(
      (sheet.charts ?? []).map((x) => (x.id === c.id ? c : x)),
      key,
    );
  const deleteChart = (id: string) => {
    if (!sheet) return;
    setCharts((sheet.charts ?? []).filter((c) => c.id !== id));
    setChartSel(null);
    setPanel((p) => (p?.kind === 'chart' && p.id === id ? null : p));
    grid.current?.focus();
  };

  // ---- notes ------------------------------------------------------------------------------------------------------------------
  const editNote = () => {
    const s = selRef.current;
    const at = grid.current?.rectOf(s.r, s.c);
    if (!at || readOnly) return;
    setNoteDraft(sheet?.cells[refName(s.r, s.c)]?.note ?? '');
    setPick({ kind: 'note', r: s.r, c: s.c, at });
  };
  const saveNote = (r: number, c: number, text: string) => {
    if (!book || !sheet) return;
    const k = refName(r, c);
    const cur = sheet.cells[k] ?? {};
    const note = text.trim().slice(0, SHEET_LIMITS.note);
    const next: Cell = { ...cur };
    if (note) next.note = note;
    else delete next.note;
    change(cellsPatch(book, sheetIx, { [k]: tidyCell(next) }));
    setPick(null);
    grid.current?.focus();
  };

  // ---- comments -----------------------------------------------------------------------------------------------------------------
  /** The comments panel, its thread of the cell picked raised; `draft`: a new comment on that cell, when it has none. */
  const openComments = (draft = false) => {
    if (editRef.current) commitEdit(null);
    setPanel({ kind: 'comments', draft });
  };
  const setComments = (list: SheetComment[]) => sheet && change(metaPatch(sheet, { comments: list.length ? list : undefined }));
  /** One thread changed (null: deleted). */
  const editThread = (id: string, f: (c: SheetComment) => SheetComment | null) => sheet && setComments((sheet.comments ?? []).flatMap((c) => (c.id === id ? (f(c) ?? []) : [c])));
  /** A new comment on the cell picked (a reply, where it has a thread already). */
  const addComment = (text: string) => {
    if (!sheet) return;
    const cell = refName(selRef.current.r, selRef.current.c);
    const had = sheet.comments?.find((c) => c.cell === cell);
    const now = Date.now();
    if (had) editThread(had.id, (c) => ({ ...c, replies: [...(c.replies ?? []), { id: newCommentId(), by: 'user', text, at: now }] }));
    else setComments([...(sheet.comments ?? []), { id: newCommentId(), cell, by: 'user' as const, text, at: now }].sort((a, b) => keyOf(a.cell) - keyOf(b.cell)));
    setPanel({ kind: 'comments' });
  };
  const goCell = (cell: string) => {
    const p = parseRef(cell);
    if (p) setSel(cellSel(p.r, p.c), true);
  };

  // ---- the data tools ---------------------------------------------------------------------------------------------------------------
  /** The columns of a block, by their header's words (or their letters). */
  const colChoices = (b: Rect, head: boolean): ColChoice[] =>
    Array.from({ length: b.c2 - b.c1 + 1 }, (_, j) => {
      const c = b.c1 + j;
      const t = head && sheet && calc ? formatValue(calc.value(sheetIx, b.r1, c), sheet.cells[refName(b.r1, c)]?.s) : '';
      return { c, name: t ? `${t} (${colName(c)})` : `${tr('Column')} ${colName(c)}` };
    });
  const [toolBlock, setToolBlock] = useState<Rect | null>(null);
  const openTool = (d: DialogState) => {
    if (!sheet || !calc) return;
    const b = blockOf();
    setToolBlock(b);
    setHeader(hasHeader(sheet, calc, sheetIx, b));
    setDialog(d);
  };
  const sortSheet = (asc: boolean) => sort(asc);
  const sortRangeBy = (keys: { c: number; asc: boolean }[]) => {
    if (!book || !sheet || !calc || !toolBlock) return;
    const body = header ? { ...toolBlock, r1: toolBlock.r1 + 1 } : toolBlock;
    if (body.r2 <= body.r1) return;
    const moved = new Map<number, number>();
    const changes = sortByKeys(sheet, calc, sheetIx, body, keys, moved);
    change(together([cellsPatch(book, sheetIx, changes), commentsMoved(sheet, body, moved)]));
  };
  const removeDups = (cols: number[]) => {
    if (!book || !sheet || !calc || !toolBlock) return;
    const got = removeDuplicates(sheet, calc, sheetIx, toolBlock, header, cols);
    change(cellsPatch(book, sheetIx, got.changes));
    toast(got.removed ? `${got.removed} duplicate row${got.removed === 1 ? '' : 's'} removed` : tr('No duplicate rows were found.'));
  };
  const splitText = async (sepr: string) => {
    if (!book || !sheet || !calc) return;
    const b: Rect = { ...x, c2: x.c1, r2: Math.min(x.r2, Math.max(x.r1, calc.extent(sheetIx).rows - 1)) };
    const got = splitColumn(sheet, calc, sheetIx, b, sepr);
    // Cells to the right that hold something are written over: asked first, as Sheets asks.
    const over = Object.keys(got.changes).some((k) => {
      const p = parseRef(k);
      return p && p.c > b.c1 && holds(sheet.cells[k]);
    });
    if (over && !(await confirm({ title: 'Replace what the cells beside hold?', body: 'The parts go into the columns to the right, over what is there now.', confirm: 'Replace' }))) return;
    change(cellsPatch(book, sheetIx, got.changes));
  };
  const splitGuess = () => {
    if (!sheet || !calc) return ',';
    const texts: string[] = [];
    for (let r = x.r1; r <= Math.min(x.r2, x.r1 + 200, calc.extent(sheetIx).rows - 1); r++) texts.push(formatValue(calc.value(sheetIx, r, x.c1)));
    return guessSeparator(texts);
  };
  /** Data → Summarize by: the table's summary on a sheet of its own, after this one. */
  const summarize = (by: number, across: number | null, values: { c: number; fn: SummaryFn }[]) => {
    if (!book || !sheet || !calc || !toolBlock) return;
    if (toolBlock.r2 <= toolBlock.r1) return void toast(tr('Pick a table with a header row and rows under it.'));
    const made = summarySheet(sheet, calc, sheetIx, toolBlock, by, across, values, tr(`Summary of ${sheet.name}`).slice(0, 31));
    addSheet({ ...made, id: newId() });
  };
  const trim = () => {
    if (!book || !sheet || !calc) return;
    const got = trimChanges(sheet, calc, sheetIx, single(sel) ? blockOf() : x);
    change(cellsPatch(book, sheetIx, got.changes));
    toast(got.count ? `${got.count} cell${got.count === 1 ? '' : 's'} trimmed` : tr('No extra spaces were found.'));
  };

  // ---- AI: its cells, a formula written or explained, Fill with AI, a table made, Analyze and Clean up -----------------------------
  const aiCells = useAiCells({
    book: () => bookRef.current,
    calc: () => calcRef.current,
    rev,
    docKey: doc?.key,
    readOnly,
    onAnswers: (answers) => {
      if (!bookRef.current || !Object.keys(answers).length) return;
      aiAnswers.current = { ...aiAnswers.current, ...answers };
      bookRef.current.ai = aiAnswers.current;
      calcRef.current?.aiChanged();
      aiDirty.current = true;
      setRev((r) => r + 1);
    },
    onForget: (keys) => {
      if (!bookRef.current) return;
      const next = { ...aiAnswers.current };
      for (const k of keys) delete next[k];
      aiAnswers.current = next;
      if (Object.keys(next).length) bookRef.current.ai = next;
      else delete bookRef.current.ai;
      calcRef.current?.aiChanged();
      setRev((r) => r + 1);
    },
  });
  const [aiPop, setAiPop] = useState<'formula' | 'explain' | null>(null);
  const aiAnchor = useRef<HTMLButtonElement>(null);
  const aiContext = () => contextFor(bookRef.current!, bookRef.current!.sheets[sheetIx], calcRef.current!, sheetIx, selRef.current.r, selRef.current.c);
  /** A formula the helper model wrote, in the active cell (what it held replaced). */
  const insertFormula = (f: string) => {
    if (!book || !sheet || readOnly) return;
    const k = refName(sel.r, sel.c);
    const next = typedInto(sheet.cells[k], f);
    if (refused(sel.r, sel.c, next)) return;
    change(cellsPatch(book, sheetIx, { [k]: next }));
    grid.current?.focus();
  };
  /** The table a column is in, for Fill with AI: around the active cell, or around the cell beside it when its column is empty. */
  const columnTable = (): Rect | null => {
    if (!sheet || !calc) return null;
    const e = calc.extent(sheetIx);
    const around = (r: number, c: number) => regionAround(sheet, r, c, Math.max(e.rows, r + 1), Math.max(e.cols, c + 1));
    let b = around(sel.r, sel.c);
    if (b.c1 === b.c2 && sel.c > 0) b = around(sel.r, sel.c - 1);
    if (b.c1 === b.c2 && b.r1 === b.r2) return null;
    return { r1: b.r1, c1: Math.min(b.c1, sel.c), r2: b.r2, c2: Math.max(b.c2, sel.c) };
  };
  /** Fill with AI (Flash fill, Ctrl+E): the rest of the active column from the cells filled in it, by a pattern found here, else by the helper model. */
  const fillAi = async () => {
    if (!book || !sheet || !calc || readOnly) return;
    const b = columnTable();
    if (!b) return void toast(tr('Put Fill with AI in a column of a table, beside the values it is to work from.'));
    const c = sel.c;
    const head = hasHeader(sheet, calc, sheetIx, b);
    const r0 = head ? b.r1 + 1 : b.r1;
    const cols = Array.from({ length: b.c2 - b.c1 + 1 }, (_, j) => b.c1 + j).filter((cc) => cc !== c);
    const text = (r: number, cc: number) => {
      const v = calc.value(sheetIx, r, cc);
      return v === null ? '' : formatValue(v, sheet.cells[refName(r, cc)]?.s);
    };
    const inputs = (r: number) => cols.map((cc) => text(r, cc));
    const examples: { inputs: string[]; output: string }[] = [];
    const targets: number[] = [];
    for (let r = r0; r <= b.r2; r++) {
      const own = sheet.cells[refName(r, c)];
      if (own?.v !== undefined && own.f === undefined) examples.push({ inputs: inputs(r), output: text(r, c) });
      else if (!own?.f && own?.v === undefined && inputs(r).some(Boolean)) targets.push(r);
    }
    if (!examples.length) return void toast(tr('Type what you want in the first cells of the column, then Fill with AI fills the rest.'));
    if (!targets.length) return void toast(tr('The column is filled already.'));
    const local = flashFill(examples, targets.map(inputs));
    let outputs = local?.outputs;
    let how = local ? tr('a pattern found in your examples (free)') : '';
    if (!local) {
      const rows = targets.slice(0, 200);
      toast(tr(`Asking the helper model to fill ${rows.length} cells`));
      try {
        const got = await askAi<FillAnswer>('/api/write/sheet-fill', { headers: cols.map((cc) => (head ? text(b.r1, cc) : '') || colName(cc)), target: head ? text(b.r1, c) : undefined, examples: examples.slice(0, 20), rows: rows.map(inputs) });
        outputs = got.outputs;
        how = got.model ? tr(`the examples, by ${got.model}`) : tr('the examples, by the helper model');
      } catch (e) {
        return void toastError(e);
      }
    }
    const cur = bookRef.current!.sheets[sheetIx];
    const changes: Record<string, Cell | null> = {};
    targets.forEach((r, i) => {
      const v = outputs?.[i];
      const k = refName(r, c);
      if (v === null || v === undefined || v === '' || cur.cells[k]?.v !== undefined || cur.cells[k]?.f !== undefined) return;
      changes[k] = typedInto(cur.cells[k], v.startsWith('=') ? `'${v}` : v);
    });
    const n = Object.keys(changes).length;
    if (!n) return void toast(tr('No pattern fits your examples: fill in a few more cells, then try again.'));
    change(cellsPatch(bookRef.current!, sheetIx, changes));
    toast(tr(`Filled ${n} cells from ${how}.`));
  };
  /** A table made with AI, here (at the active cell) or on a sheet of its own: its header row, its formats, checkboxes, dropdowns and stars. */
  const insertAiTable = (t: TableAnswer, where: 'here' | 'sheet') => {
    if (!book || !sheet || !calc || readOnly) return;
    const r0 = where === 'here' ? sel.r : 0;
    const c0 = where === 'here' ? sel.c : 0;
    const h = t.rows.length + 1;
    const w = t.columns.length;
    if (where === 'here') {
      for (let r = r0; r < r0 + h; r++)
        for (let c = c0; c < c0 + w; c++)
          if (calc.value(sheetIx, r, c) !== null) {
            toast(tr('Those cells hold something: the table went on a sheet of its own.'));
            return insertAiTable(t, 'sheet');
          }
    }
    const formats: Record<string, unknown> = {};
    const validation: unknown[] = [];
    t.columns.forEach((col, j) => {
      const letter = colName(c0 + j);
      const range = `${letter}${r0 + 2}:${letter}${r0 + h}`;
      if (col.type === 'currency') formats[letter] = 'currency';
      else if (col.type === 'percent') formats[letter] = 'percent';
      else if (col.type === 'date') formats[letter] = 'date';
      else if (col.type === 'checkbox') validation.push({ range, checkbox: true });
      else if (col.type === 'rating') validation.push({ range, rating: 5 });
      else if (col.type === 'list' && col.options?.length) validation.push({ range, list: col.options });
    });
    const rows = t.rows.map((r) => r.map((v, j) => (t.columns[j]?.type === 'percent' && typeof v === 'number' ? v / 100 : t.columns[j]?.type === 'text' && typeof v === 'string' && v.startsWith('=') ? `'${v}` : v)));
    const made = normalizeBook({ sheets: [{ name: t.title || tr('Table'), start: refName(r0, c0), rows: [t.columns.map((c) => c.name), ...rows], header: true, formats, validation, ...(where === 'sheet' ? { widths: Object.fromEntries(t.columns.map((c, j) => [colName(j), Math.min(260, Math.max(90, c.name.length * 9 + 24))])) } : {}) }] }).sheets[0];
    if (where === 'sheet') return addSheet({ ...made, id: newId(), freeze: { rows: 1 } });
    // Here: the header's look only (not freezing the sheet), the rules after the sheet's own.
    const cells: Record<string, Cell | null> = {};
    for (const [k, cell] of Object.entries(made.cells)) cells[k] = cell;
    change(together([cellsPatch(book, sheetIx, cells), made.validation?.length ? metaPatch(sheet, { validation: [...(sheet.validation ?? []), ...made.validation] }) : null]));
    setSel(rectSel({ r1: r0, c1: c0, r2: r0 + h - 1, c2: c0 + w - 1 }), true);
  };
  /** An idea from Analyze the data put in: a chart beside the table, a pivot table on a sheet of its own, or a formula under the table. */
  const applyIdea = (idea: AnalyzeIdea, b: Rect) => {
    if (!book || !sheet || !calc || readOnly) return;
    if (idea.kind === 'chart') {
      if ((sheet.charts?.length ?? 0) >= SHEET_LIMITS.charts) return void toast(tr('A sheet holds at most 20 charts.'));
      const cols = [idea.x, ...idea.ys].map((l) => colIndex(l)).filter((c) => c >= 0);
      const range = cols.map((c) => rangeName({ r1: b.r1, c1: c, r2: b.r2, c2: c })).join(',');
      const e = calc.shownExtent(sheetIx);
      const at = Math.min(SHEET_LIMITS.cols - 1, Math.max(b.c2 + 1, e.cols));
      const g = sheetSizes(sheet, view.hidR);
      // Charts already beside the table: the new one under them.
      const below = (sheet.charts ?? []).reduce((y, ch) => Math.max(y, cornerXY(ch.to, g).y), 0);
      const from = below ? cornerAt(cornerXY({ cell: refName(b.r1, at) }, g).x + 20, below + 16, g.colW, g.rowH) : { cell: refName(b.r1, at), dx: 20 };
      const p0 = cornerXY(from, g);
      const chart: SheetChart = { id: newId(), kind: idea.chart, range, title: idea.title.slice(0, 200), from, to: cornerAt(p0.x + 480, p0.y + 300, g.colW, g.rowH) };
      setCharts([...(sheet.charts ?? []), chart]);
      setChartSel(chart.id);
      requestAnimationFrame(() => grid.current?.reveal(parseRef(from.cell)!.r, Math.min(size.cols - 1, at + 3)));
    } else if (idea.kind === 'pivot') {
      const by = colIndex(idea.by);
      if (by < b.c1 || by > b.c2) return void toast(tr('That column is not in the table.'));
      const made = summarySheet(sheet, calc, sheetIx, b, by, idea.across ? colIndex(idea.across) : null, idea.values.map((v) => ({ c: colIndex(v.col), fn: v.fn })), idea.title.slice(0, 31));
      addSheet({ ...made, id: newId() });
    } else {
      // Under the table, a row apart: its name, and the formula beside it.
      const r = Math.min(SHEET_LIMITS.rows - 1, b.r2 + 2);
      const changes: Record<string, Cell | null> = { [refName(r, b.c1)]: { v: idea.title.slice(0, 200), s: { b: true } }, [refName(r, b.c1 + 1)]: typedInto(undefined, idea.formula) };
      change(cellsPatch(book, sheetIx, changes));
      setSel(cellSel(r, b.c1 + 1), true);
    }
  };
  /** Clean up the data: the issues found in the panel's table, each fixed on the workbook as the one before left it, all one step. */
  const cleanBlock = panel?.kind === 'clean' && sheet && calc ? (() => {
    const e = calc.extent(sheetIx);
    return regionAround(sheet, panel.block.r1, panel.block.c1, Math.max(e.rows, panel.block.r1 + 1), Math.max(e.cols, panel.block.c1 + 1));
  })() : null;
  const issues = useMemo(() => (cleanBlock && sheet && calc && panel?.kind === 'clean' ? findIssues(sheet, calc, sheetIx, cleanBlock, panel.header) : []), [rev, sheetIx, panel, cleanBlock?.r2, cleanBlock?.c2]); // eslint-disable-line react-hooks/exhaustive-deps
  const fixIssues = (list: CleanIssue[]) => {
    if (!book || !sheet || !cleanBlock || panel?.kind !== 'clean' || readOnly) return;
    const want = new Set(list.map((i) => i.id));
    let b: Workbook = structuredClone(book);
    let block = cleanBlock;
    for (let pass = 0; pass < 10 && want.size; pass++) {
      const sh = b.sheets[sheetIx];
      const found = findIssues(sh, computeBook(b), sheetIx, block, panel.header).find((i) => want.has(i.id));
      if (!found) break;
      want.delete(found.id);
      for (const [k, cell] of Object.entries(found.changes ?? {})) {
        if (cell) sh.cells[k] = cell;
        else delete sh.cells[k];
      }
      for (const r of found.rows ?? []) {
        b = adjustForDelete(b, sh.id, 'row', r, 1);
        block = { ...block, r2: block.r2 - 1 };
      }
    }
    change({ k: 'book', before: book, after: b });
  };
  const showIssue = (it: CleanIssue) => {
    const ps = it.cells.slice(0, 200).flatMap((k) => parseRef(k) ?? []);
    if (!ps.length) return;
    setSel(cellSel(ps[0].r, ps[0].c), true);
    setMore(ps.slice(1).map((p) => ({ r1: p.r, c1: p.c, r2: p.r, c2: p.c })));
  };
  const openAiPanel = (kind: 'analyze' | 'clean') => {
    if (!sheet || !calc) return;
    const b = blockOf();
    if (b.r1 === b.r2 && b.c1 === b.c2) return void toast(tr('Pick a cell in a table first.'));
    setPanel({ kind, block: b, header: hasHeader(sheet, calc, sheetIx, b) });
  };
  const activeFormula = !edit && sheet?.cells[refName(sel.r, sel.c)]?.f;

  // ---- named ranges, protection, groups, links, grid lines ------------------------------------------------------------------
  /** The cells picked as a name's range or a protection's: on this sheet, fixed ("'Sheet 1'!$B$2:$B$9"). */
  const pickedRef = () => (sheet ? `${quoteSheet(sheet.name)}!${selRange().replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}` : '');
  const setNames = (names: NamedRange[]) => book && swap({ ...book, names: names.length ? names : undefined });
  const setProtect = (list: SheetProtect[]) => sheet && change(metaPatch(sheet, { protect: list.length ? list : undefined }));
  const outline = useMemo(() => (sheet?.groups?.length ? spansOf(sheet) : undefined), [sheet, sheet?.groups, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Data → Group rows (or columns: when whole columns are picked), and Ungroup. */
  const group = (undo = false) => {
    if (!sheet || readOnly) return;
    const axis = wholeCols && !wholeRows ? 'col' : 'row';
    const [a, b] = axis === 'row' ? [x.r1, x.r2] : [x.c1, x.c2];
    const next = undo ? removeGroup(sheet, axis, a, b) : addGroup(sheet, axis, a, b);
    if (!next) return void toast(tr(undo ? 'There is no group there to ungroup.' : 'A group must be inside another or around it, not across it.'));
    change(metaPatch(sheet, { groups: next.length ? next : undefined }));
  };
  const fold = (i: number, hide: boolean) => sheet && change(metaPatch(sheet, foldGroup(sheet, i, hide)));
  const applyLink = (link: string | null, text: string) => {
    if (!book || !sheet) return;
    const k = refName(sel.r, sel.c);
    const cur = sheet.cells[k];
    const words = cur?.f === undefined && text.trim() && text !== formatValue(calc!.value(sheetIx, sel.r, sel.c), cur?.s) ? typedInto(cur, text.startsWith('=') ? `'${text}` : text) : (cur ?? null);
    const next: Cell = { ...(words ?? {}) };
    if (link) next.link = link;
    else delete next.link;
    change(cellsPatch(book, sheetIx, { [k]: tidyCell(next) }));
  };
  const toggleGrid = () => sheet && change(metaPatch(sheet, { noGrid: sheet.noGrid ? undefined : true }));
  /** The named ranges formulas may use here, and the name of the cells picked when they are one. */
  const rangeNames = (book?.names ?? []).filter((n) => !n.sheet || n.sheet === sheet?.id).map((n) => n.name);
  const selName = (() => {
    for (const n of book?.names ?? []) {
      if (!sheet || (n.sheet && n.sheet !== sheet.id)) continue;
      const src = sourceOf(n.ref.replace(/\$/g, ''));
      if (src && (src.sheet ?? sheet.name).toLowerCase() === sheet.name.toLowerCase() && src.x.r1 === x.r1 && src.x.c1 === x.c1 && src.x.r2 === x.r2 && src.x.c2 === x.c2) return n.name;
    }
    return null;
  })();

  // ---- find and replace -----------------------------------------------------------------------------------------------------------
  const how: FindHow = { ...find.options, ...findHow };
  const matches = useMemo(
    // Across sheets, in their order (so the place in the list stays as sheets are switched to).
    () => (find.open && book && calc ? findCells(book, calc, how.allSheets ? 0 : sheetIx, find.query, how) : []),
    [find.open, find.query, find.options, findHow, rev, sheetIx], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => setFindAt(-1), [find.query, find.options, findHow]);
  useEffect(() => {
    if (!findHow.allSheets) setFindAt(-1);
  }, [sheetIx]); // eslint-disable-line react-hooks/exhaustive-deps
  const afterReplace = useRef(false);
  useEffect(() => {
    if (!afterReplace.current) return;
    afterReplace.current = false;
    if (matches.length) goMatch(Math.min(Math.max(0, findAt), matches.length - 1));
    else setFindAt(-1);
  }, [matches]); // eslint-disable-line react-hooks/exhaustive-deps
  const goMatch = (i: number) => {
    const m = matches[i];
    if (!m || !book) return;
    setFindAt(i);
    if (m.si !== sheetIx) {
      sels.current.set(book.sheets[m.si].id, cellSel(m.r, m.c));
      pickSheet(m.si);
      requestAnimationFrame(() => requestAnimationFrame(() => grid.current?.reveal(m.r, m.c)));
    } else setSel(cellSel(m.r, m.c), true);
  };
  const nextMatch = (d: 1 | -1) => {
    if (!matches.length) return;
    // From the cell picked: the next match after it (or before it), in reading order.
    let i = findAt;
    if (i < 0) {
      const s = selRef.current;
      const after = matches.findIndex((m) => m.si === sheetIx && (m.r > s.r || (m.r === s.r && m.c > s.c)));
      i = d > 0 ? (after < 0 ? 0 : after) : (after < 0 ? matches.length : after) - 1;
      if (i < 0) i = matches.length - 1;
      return goMatch(i);
    }
    goMatch((i + d + matches.length) % matches.length);
  };
  const replaceOne = () => {
    if (!book || !calc || readOnly) return;
    const m = matches[findAt];
    if (!m) return nextMatch(1);
    const sh = book.sheets[m.si];
    const cell = sh.cells[refName(m.r, m.c)];
    const got = cell ? replacedCell(cell, calc, m.si, m.r, m.c, find.query, find.replacement, how, false) : null;
    if (!got) return nextMatch(1);
    change(cellsPatch(book, m.si, { [refName(m.r, m.c)]: got.cell }), cellSel(m.r, m.c));
    // On to the next match, once the list is worked out again.
    afterReplace.current = true;
  };
  const replaceAll = () => {
    if (!book || !calc || readOnly) return;
    const bySheet = new Map<number, Record<string, Cell | null>>();
    let count = 0;
    for (const m of findCells(book, calc, how.allSheets ? 0 : sheetIx, find.query, how, 100_000)) {
      const sh = book.sheets[m.si];
      const cell = sh.cells[refName(m.r, m.c)];
      const got = cell ? replacedCell(cell, calc, m.si, m.r, m.c, find.query, find.replacement, how, true) : null;
      if (!got) continue;
      count += got.count;
      const list = bySheet.get(m.si) ?? {};
      list[refName(m.r, m.c)] = got.cell;
      bySheet.set(m.si, list);
    }
    change(together([...bySheet].map(([s, changes]) => cellsPatch(book, s, changes))));
    toast(count ? `${count} replacement${count === 1 ? '' : 's'} made` : tr('Nothing was replaced.'));
  };

  // ---- the Kanban board ------------------------------------------------------------------------------------------------------------
  // Its settings kept with the sheet (what it groups by, its cards' fields, its lanes' order), else those it was opened with.
  const keptBoard = (() => {
    const k = sheet?.board;
    const at = k ? parseRef(k.at) : null;
    return k && at ? { r: at.r, c: at.c, by: colIndex(k.by), fields: k.fields?.map(colIndex), lanes: k.lanes, open: !!k.open } : null;
  })();
  const board = boardOn ? (boardLocal ?? keptBoard) : null;
  /** A change to the board's settings, kept with the sheet (and undone with Undo). */
  const setBoardModel = (set: Partial<SheetBoard>) => {
    if (!sheet || !board) return;
    const base: SheetBoard = sheet.board && !boardLocal ? sheet.board : { at: refName(board.r, board.c), by: colName(board.by) };
    const next: SheetBoard = { ...base, ...set };
    for (const k of Object.keys(set) as (keyof SheetBoard)[]) if (set[k] === undefined) delete next[k];
    change(metaPatch(sheet, { board: next }));
    setBoardLocal(null);
  };
  /** A table: the filter's range when the cell is in it, else the data around the cell. */
  const tableAt = (r: number, c: number): Rect => {
    const fx = view.filter?.x;
    if (fx && r >= fx.r1 && r <= fx.r2 && c >= fx.c1 && c <= fx.c2) return fx;
    const e = calc!.extent(sheetIx);
    return regionAround(sheet!, r, c, Math.max(e.rows, r + 1), Math.max(e.cols, c + 1));
  };
  /** The columns of a table a board may group by: those with a dropdown on their cells. */
  const dropdownCols = (b: Rect) => {
    const out: { c: number; options: ListOption[] }[] = [];
    for (let c = b.c1; c <= b.c2; c++) {
      const rule = view.rules.any ? view.rules.at(b.r1 + 1, c)?.rule : undefined;
      if (rule?.type === 'list' && calc) out.push({ c, options: listOptions(calc, sheetIx, rule) });
    }
    return out;
  };
  const toggleBoard = () => {
    if (board) return setBoardOn(false);
    if (!sheet || !calc) return;
    if (editRef.current) commitEdit(null);
    // The board kept with the sheet, while its table still has rows and its column a dropdown.
    if (keptBoard) {
      const b = tableAt(keptBoard.r, keptBoard.c);
      if (b.r2 > b.r1 && dropdownCols(b).some((x) => x.c === keptBoard.by)) {
        setBoardLocal(null);
        return setBoardOn(true);
      }
    }
    const b = tableAt(sel.r, sel.c);
    const choices = dropdownCols(b);
    if (!choices.length || b.r2 <= b.r1) return void toast(tr('Give the table a dropdown column first (Insert → Dropdown): the board groups its rows by it.'));
    setBoardLocal({ r: b.r1, c: b.c1, by: (choices.find((x) => x.c === sel.c) ?? choices[0]).c });
    setBoardOn(true);
  };
  // A sheet opens on its board when it says so: when the workbook opens and a sheet is picked (not again on each
  // version saved, which would close a board shown meanwhile).
  const boardFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sheet || boardFor.current === sheet.id) return;
    boardFor.current = sheet.id;
    setBoardLocal(null);
    setBoardOn(!!sheet.board?.open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet?.id]);
  const boardBlock = board && sheet && calc ? tableAt(board.r, board.c) : null;
  /** A new row under the board's table, in a lane: its group's value set, then opened as a card. */
  const boardAdd = (value: string) => {
    if (!book || !sheet || !board || !boardBlock) return;
    const r = boardBlock.r2 + 1;
    if (r >= SHEET_LIMITS.rows) return;
    const k = refName(r, board.by);
    const fx = view.filter?.x;
    const grow = fx && sheet.filter && boardBlock === fx ? metaPatch(sheet, { filter: { ...sheet.filter, range: rangeName({ ...fx, r2: fx.r2 + 1 }) } }) : null;
    // A row needs something in it to join the table: the group's value, or a space-free placeholder in its first cell.
    const changes: Record<string, Cell | null> = value ? { [k]: typedInto(sheet.cells[k], value) } : { [refName(r, boardBlock.c1)]: typedInto(sheet.cells[refName(r, boardBlock.c1)], tr('New row')) };
    change(together([cellsPatch(book, sheetIx, changes), grow]));
    setRowCard(r);
  };

  // ---- the row card -------------------------------------------------------------------------------------------------------------
  const cardInfo = useMemo(() => {
    if (rowCard === null || !sheet || !calc) return null;
    const e = calc.extent(sheetIx);
    const fx = view.filter?.x;
    const block = fx && rowCard > fx.r1 && rowCard <= fx.r2 ? fx : regionAround(sheet, rowCard, Math.min(sel.c, Math.max(0, e.cols - 1)), Math.max(e.rows, rowCard + 1), Math.max(e.cols, 1));
    const head = fx && rowCard > fx.r1 && rowCard <= fx.r2 ? fx.r1 : sheet.freeze?.rows && rowCard >= sheet.freeze.rows ? sheet.freeze.rows - 1 : block.r1 < rowCard && hasHeader(sheet, calc, sheetIx, block) ? block.r1 : null;
    const cols: number[] = [];
    for (let c = block.c1; c <= Math.min(block.c2, block.c1 + 60); c++) if (!view.hidC.has(c)) cols.push(c);
    return { cols: cols.length ? cols : [sel.c], head, first: head !== null ? head + 1 : 0, last: Math.max(rowCard, Math.min(block.r2, e.rows - 1)) };
  }, [rowCard, sheet, calc, sheetIx, rev, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keys ---------------------------------------------------------------------------------------------------------------------
  const editKey = (e: React.KeyboardEvent<HTMLElement>) => {
    const ed = editRef.current!;
    const mod = isMod(e);
    if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void save();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return cancelEdit();
    }
    const lower = e.key.toLowerCase();
    if (mod && (lower === 'b' || lower === 'i' || lower === 'u')) {
      // The cell being typed in turns bold (italic, underlined) as in Sheets; the typing goes on where it was.
      e.preventDefault();
      e.stopPropagation();
      const el = document.activeElement as HTMLTextAreaElement | null;
      const key = lower as 'b' | 'i' | 'u';
      setStyle({ [key]: !active?.s?.[key] || undefined });
      requestAnimationFrame(() => el?.focus({ preventScroll: true }));
      return;
    }
    if (mod && (e.key === '`' || e.code === 'Backquote')) return void (e.preventDefault(), e.stopPropagation());
    if (e.key === 'F4') {
      // The reference under the caret cycles through its $ signs.
      e.preventDefault();
      const got = cycleRef(ed.text, caretRef.current);
      if (got) setText(got.text, got.caret, true);
      return;
    }
    if (mod && (e.key === ';' || e.key === ':')) {
      e.preventDefault();
      const now = new Date();
      typeIn(e.shiftKey || e.key === ':' ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
      return;
    }
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const el = e.target as HTMLTextAreaElement;
      const pos = el.selectionStart ?? ed.text.length;
      setText(`${ed.text.slice(0, pos)}\n${ed.text.slice(el.selectionEnd ?? pos)}`, pos + 1, true);
      return;
    }
    const opts = suggestions();
    if (opts.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && !ed.text.startsWith('=')) {
      e.preventDefault();
      setSuggestAt((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      return commitEdit(mod ? null : [e.shiftKey ? -1 : 1, 0], mod);
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const help = formulaHelp(ed.text, caretRef.current, rangeNames);
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
    const mod = isMod(e);
    const k = e.key;
    const lower = k.toLowerCase();
    const s = selRef.current;
    if (mod && lower === 's') return void (e.preventDefault(), save());
    if (mod && lower === 'f') return void (e.preventDefault(), find.show());
    if (mod && lower === 'h') return void (e.preventDefault(), find.show(!readOnly));
    // Undo and Redo: Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y, as the menu says (the app's own Ctrl+Z, for a pin, is not for here).
    if (mod && (lower === 'z' || lower === 'y')) return void (e.preventDefault(), e.stopPropagation(), lower === 'y' || e.shiftKey ? redo() : undo());
    if (mod && (k === '/' || e.code === 'Slash')) return void (e.preventDefault(), setDialog('shortcuts'));
    // Ctrl+` shows the formulas here, not the app's terminal panel.
    if (mod && (k === '`' || e.code === 'Backquote')) return void (e.preventDefault(), e.stopPropagation(), setFormulas((f) => !f));
    if (mod && lower === 'a') return void (e.preventDefault(), setSel({ r: s.r, c: s.c, ar: 0, ac: 0, fr: size.rows - 1, fc: size.cols - 1 }));
    // Ctrl+Space: the whole column; Shift+Space: the whole row; Space on rows picked whole: expand the row.
    // Ctrl even on a Mac, as Sheets has it (⌘Space is the Mac's own search).
    if (k === ' ' && e.ctrlKey) return void (e.preventDefault(), setSel({ r: 0, c: s.c, ar: 0, ac: x.c1, fr: size.rows - 1, fc: x.c2 }));
    if (k === ' ' && e.shiftKey) return void (e.preventDefault(), setSel({ r: s.r, c: 0, ar: x.r1, ac: 0, fr: x.r2, fc: size.cols - 1 }));
    if (chartSel) {
      if (k === 'Delete' || k === 'Backspace') return void (e.preventDefault(), !readOnly && deleteChart(chartSel));
      if (k === 'Escape') return void (e.preventDefault(), setChartSel(null));
    }
    if (k === ' ' && !e.altKey && wholeRows && !readOnly) return void (e.preventDefault(), setRowCard(s.r));
    if (k === ' ' && !e.altKey && !readOnly && toggleChecks()) return void e.preventDefault();
    if (mod && (lower === 'b' || lower === 'i' || lower === 'u')) {
      // Bold here, not the app's sidebar (Ctrl+B there).
      e.preventDefault();
      e.stopPropagation();
      if (readOnly) return;
      const key = lower as 'b' | 'i' | 'u';
      return setStyle({ [key]: !active?.s?.[key] || undefined });
    }
    if (e.altKey && e.shiftKey && e.code === 'Digit5' && !readOnly) return void (e.preventDefault(), setStyle({ s: !active?.s?.s || undefined }));
    if (mod && k === '\\' && !readOnly) return void (e.preventDefault(), clear(true));
    if (mod && e.shiftKey && lower === 'l' && !readOnly) return void (e.preventDefault(), toggleFilter());
    if (mod && e.shiftKey && lower === 'v' && !readOnly) return void (e.preventDefault(), pasteHow('values'));
    if (mod && !readOnly && (lower === 'd' || lower === 'r')) return void (e.preventDefault(), fill(lower === 'd'));
    if (mod && !readOnly && lower === 'e' && !e.shiftKey) return void (e.preventDefault(), void fillAi());
    if (mod && !readOnly && lower === 'k') return void (e.preventDefault(), setDialog('link'));
    if (e.altKey && e.shiftKey && !readOnly && (k === 'ArrowRight' || k === 'ArrowLeft')) return void (e.preventDefault(), group(k === 'ArrowLeft'));
    if (mod && !readOnly && (k === ';' || k === ':')) {
      // Ctrl+; today's date, Ctrl+Shift+; the time now.
      e.preventDefault();
      const now = nowSerial();
      const time = e.shiftKey || k === ':';
      const cell = sheet.cells[refName(s.r, s.c)];
      const next = tidyCell({
        ...(cell ?? {}),
        v: time ? now - Math.floor(now) : dateSerial(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()),
        s: withStyle(cell?.s, cell?.s?.fmt && isDateFmt(cell.s.fmt) ? {} : { fmt: time ? 'time' : 'date' }),
      });
      delete next?.f;
      change(cellsPatch(book!, sheetIx, { [refName(s.r, s.c)]: next }));
      return;
    }
    if (mod && (lower === 'c' || lower === 'x' || lower === 'v')) {
      // The browser sends the clipboard's events to the box (the grid itself has none on a touch screen).
      if (e.target !== grid.current?.input()) {
        e.preventDefault();
        if (lower === 'v') void menuPaste();
        else void menuCopy(lower === 'x');
      }
      return;
    }
    if (e.altKey && k === 'ArrowDown' && !readOnly) {
      // A list's options, or the calendar of a date cell.
      e.preventDefault();
      const at = grid.current?.rectOf(s.r, s.c);
      const rule = view.rules.any ? view.rules.at(s.r, s.c)?.rule : undefined;
      const fmt = sheet.cells[refName(s.r, s.c)]?.s?.fmt;
      if (at && rule?.type === 'list') setPick({ kind: 'list', r: s.r, c: s.c, at });
      else if (at && (rule?.type === 'date' || fmt === 'date' || fmt === 'datetime')) setPick({ kind: 'date', r: s.r, c: s.c, at });
      return;
    }
    if (k === 'F2' && e.shiftKey && !readOnly) return void (e.preventDefault(), editNote());
    // Ctrl+Alt+M (⌘⌥M): a comment on the cell, or its thread.
    if (mod && e.altKey && (lower === 'm' || e.code === 'KeyM')) return void (e.preventDefault(), openComments(!readOnly));
    const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dr, dc] = arrows[k];
      if (e.shiftKey) {
        const [r, c] = mod ? dataEdge(sheet, s.fr, s.fc, dr, dc, size.rows, size.cols) : stepFrom(s.fr, s.fc, dr, dc, false);
        setSel({ ...s, fr: r, fc: c }, true);
      } else {
        const [r, c] = mod ? dataEdge(sheet, s.r, s.c, dr, dc, size.rows, size.cols) : stepFrom(s.r, s.c, dr, dc);
        setSel(cellSel(r, c), true);
      }
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
      if (find.open) find.close();
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

  // Ctrl+S anywhere in the editor (a toolbar button, a menu or a panel's field may hold the focus; the grid and the
  // formula bar save by themselves): a field gives up what was typed in it first, as leaving it would.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = document.activeElement;
      // The editor's own panels on a phone sit outside it, over the page (Panel.tsx marks them).
      if (a && a !== document.body && !root.current?.contains(a) && !(a as HTMLElement).closest('[data-sheet-panel]')) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's' || e.defaultPrevented) return;
      e.preventDefault();
      if (a && a !== document.body && (a as HTMLElement).closest('textarea,input,select')) (a as HTMLElement).blur();
      setTimeout(() => void saveNow.current(), 0);
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
  const stats = useMemo(() => (sheet && calc && (!single(sel) || more.length) ? statsOf(sheet, calc, sheetIx, [...more, x]) : null), [rev, sel, sheetIx, more]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // The array the active cell's formula spilled, or that spilled into it, outlined as spreadsheets outline it.
  let spillFormula: string | undefined;
  for (const { r, c, sp } of calc.spillsOf(sheetIx))
    if (sel.r >= r && sel.r < r + sp.h && sel.c >= c && sel.c < c + sp.w) {
      refs.push({ r1: r, c1: c, r2: r + sp.h - 1, c2: c + sp.w - 1, color: '#1a73e8' });
      if (!active) spillFormula = inputText(sheet.cells[refName(r, c)]);
    }
  // What find found on this sheet, marked (the current one most).
  if (find.open && matches.length)
    for (let i = 0; i < Math.min(matches.length, 400); i++) {
      const m = matches[i];
      if (m.si === sheetIx) refs.push({ r1: m.r, c1: m.c, r2: m.r, c2: m.c, color: i === findAt ? '#f29900' : '#fbbc04' });
    }

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

  const askNow = onAsk ? () => (setCtx(null), onAsk(leadFor(selRef.current).lead)) : undefined;
  const hasHiddenRows = Object.values(sheet.rows ?? {}).some((v) => v.hidden);
  const hasHiddenCols = Object.values(sheet.cols ?? {}).some((v) => v.hidden);
  const activeNote = !!active?.note;
  const openChars = () => {
    const s = selRef.current;
    const at = grid.current?.rectOf(s.r, s.c);
    if (at) setPick({ kind: 'chars', r: s.r, c: s.c, at });
  };
  const openDate = () => {
    const s = selRef.current;
    const at = grid.current?.rectOf(s.r, s.c);
    if (at) setPick({ kind: 'date', r: s.r, c: s.c, at });
  };

  const menuCtx: MenuCtx = {
    readOnly,
    style: active?.s,
    nRows,
    nCols,
    col: colName(sel.c),
    canUndo: hist.current.past.length > 0 || !!edit,
    canRedo: hist.current.future.length > 0,
    filtered: !!sheet.filter,
    merged,
    freeze: sheet.freeze,
    r: sel.r,
    c: sel.c,
    hiddenRows: hasHiddenRows,
    hiddenCols: hasHiddenCols,
    zoom,
    formulas,
    note: activeNote,
    line,
    onAsk: askNow,
    undo,
    redo,
    copy: (cut) => void menuCopy(cut),
    paste: () => void menuPaste(),
    pasteSpecial: (p) => void pasteHow(p),
    find: (replace) => find.show(replace),
    fill,
    clear,
    selectAll: () => setSel({ r: sel.r, c: sel.c, ar: 0, ac: 0, fr: size.rows - 1, fc: size.cols - 1 }),
    setFreeze,
    setZoom,
    setFormulas,
    showAll,
    insert,
    remove,
    hide,
    chart: insertChart,
    checkbox: insertCheckbox,
    dropdown: insertDropdown,
    rating: insertRating,
    date: openDate,
    noteEdit: editNote,
    comment: () => openComments(!readOnly),
    comments: () => openComments(false),
    func: (name) => typeIn(`=${name}(`),
    chars: openChars,
    addSheet: () => addSheet(),
    setStyle,
    setFormat,
    setCode,
    borders,
    setLine,
    merge: (h2) => void merge(h2),
    conditional: () => setPanel({ kind: 'cf' }),
    sortRange: () => openTool('sort'),
    sortSheet,
    toggleFilter,
    validation: () => setPanel({ kind: 'dv' }),
    dups: () => openTool('dups'),
    summary: () => openTool('summary'),
    split: () => setDialog('split'),
    trim,
    shortcuts: () => setDialog('shortcuts'),
    expand: () => setRowCard(sel.r),
    board: !!board,
    toggleBoard,
    boardOpens: board ? !!keptBoard?.open && !boardLocal : undefined,
    boardOpen: () => board && setBoardModel({ open: keptBoard?.open && !boardLocal ? undefined : true }),
    names: () => setPanel({ kind: 'names' }),
    protect: () => setPanel({ kind: 'protect' }),
    group: () => group(false),
    ungroup: () => group(true),
    groupWhat: wholeCols && !wholeRows ? 'columns' : 'rows',
    link: () => setDialog('link'),
    gridlines: !sheet.noGrid,
    toggleGridlines: toggleGrid,
    ai: {
      formula: () => setAiPop('formula'),
      explain: activeFormula ? () => setAiPop('explain') : undefined,
      fill: () => void fillAi(),
      table: () => setDialog('table-ai'),
      analyze: () => openAiPanel('analyze'),
      clean: () => openAiPanel('clean'),
      cells: Object.values(book.sheets).some((s) => Object.values(s.cells).some((c) => asksAi(c.f))),
      refresh: () => aiCells.refresh(more.length || !single(sel) ? undefined : [{ sheet: sheet.id, cell: refName(sel.r, sel.c) }]),
      waiting: aiCells.waiting,
      askWaiting: aiCells.askWaiting,
    },
  };
  const menus = sheetMenus(menuCtx);

  const shortcutGroups: ShortcutGroup[] = [
    {
      title: 'Moving and picking',
      items: [
        ['Ctrl+Arrow', 'To the edge of the data'],
        ['Shift+Arrow', 'Pick more cells'],
        ['Ctrl+Space', 'Pick the whole column'],
        ['Shift+Space', 'Pick the whole row'],
        ['Ctrl+A', 'Pick everything'],
        ['Space', 'Expand the row picked whole, or tick a checkbox'],
        ['Alt+Down', 'Open a list or a calendar'],
      ],
    },
    {
      title: 'Typing',
      items: [
        ['Enter', 'Put it in and go down'],
        ['Tab', 'Put it in and go right'],
        ['Alt+Enter', 'A new line in the cell'],
        ['Ctrl+Enter', 'Put it in every cell picked'],
        ['F2', 'Change what the cell holds'],
        ['F4', 'Fix the reference ($A$1, A$1, $A1)'],
        ['Ctrl+;', 'Today’s date'],
        ['Ctrl+Shift+;', 'The time now'],
        ['Shift+F2', 'A note on the cell'],
        ['Ctrl+Alt+M', 'A comment on the cell'],
      ],
    },
    {
      title: 'Editing',
      items: [
        ['Ctrl+C', 'Copy'],
        ['Ctrl+X', 'Cut'],
        ['Ctrl+V', 'Paste'],
        ['Ctrl+Shift+V', 'Paste values only'],
        ['Ctrl+D', 'Fill down'],
        ['Ctrl+R', 'Fill right'],
        ['Ctrl+E', 'Fill with AI'],
        ['Ctrl+K', 'Link'],
        ['Alt+Shift+Right', 'Group rows or columns'],
        ['Alt+Shift+Left', 'Ungroup'],
        ['Delete', 'Clear'],
        ['Ctrl+Z', 'Undo'],
        ['Ctrl+Shift+Z', 'Redo'],
        ['Ctrl+F', 'Find'],
        ['Ctrl+H', 'Find and replace'],
        ['Ctrl+S', 'Save'],
      ],
    },
    {
      title: 'Looks and data',
      items: [
        ['Ctrl+B', 'Bold'],
        ['Ctrl+I', 'Italic'],
        ['Ctrl+U', 'Underline'],
        ['Alt+Shift+5', 'Strikethrough'],
        ['Ctrl+\\', 'Clear formatting'],
        ['Ctrl+Shift+L', 'Create or remove a filter'],
        ['Ctrl+`', 'Show formulas'],
        ['Alt+/', 'Search the menus'],
        ['Ctrl+/', 'Keyboard shortcuts'],
      ],
    },
  ];

  // The list typed into: the options its words pick, under the cell.
  const typedOpts = edit && edit.where === 'cell' ? suggestions() : [];
  const cellBox = edit && typedOpts.length ? grid.current?.rectOf(sel.r, sel.c) : null;

  const pickCell = pick ? sheet.cells[refName(pick.r, pick.c)] : undefined;
  const pickRule = pick && view.rules.any ? view.rules.at(pick.r, pick.c)?.rule : undefined;
  const panelChart = panel?.kind === 'chart' ? chartOf(panel.id) : undefined;

  const body = (
    <div ref={root} className="flex h-full min-h-0 flex-col bg-bg" onFocusCapture={onFocusCapture}>
      <div className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-line px-2 py-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 shrink items-center gap-1.5">{lead}</div>
          {/* The menus beside the title, where the header has room for them; one button where it hasn't. */}
          <MenuBar menus={menus} compact={narrow ? true : 'auto'} />
        </div>
        {tail}
      </div>
      {band}
      {/* While an agent's version shows, the toolbar stays where it is, out of use. */}
      <div inert={liveOn} className={cx('shrink-0', liveOn && 'opacity-45')}>
        <Toolbar
          style={active?.s}
          readOnly={!!readOnlyProp}
          canUndo={hist.current.past.length > 0 || !!edit}
          canRedo={hist.current.future.length > 0}
          narrow={narrow}
          merged={merged}
          filtered={!!sheet.filter}
          line={line}
          onLine={setLine}
          onUndo={undo}
          onRedo={redo}
          onStyle={setStyle}
          onFormat={setFormat}
          onDecimals={stepDecimals}
          onBorders={borders}
          onMerge={(h2) => void merge(h2)}
          onFilter={toggleFilter}
        />
      </div>
      {!board && (
        <FormulaBar
          name={selName ?? (rectLabel(x, size.rows, size.cols) === 'the whole sheet' ? `${refName(0, 0)}:${refName(size.rows - 1, size.cols - 1)}` : rectLabel(x, size.rows, size.cols))}
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
          ghost={spillFormula}
          cellAnchor={edit?.where === 'cell' ? () => grid.current?.input()?.getBoundingClientRect() ?? null : null}
          aiRef={aiAnchor}
          ranges={rangeNames}
          onAi={readOnly ? undefined : () => setAiPop(aiPop === 'formula' ? null : 'formula')}
          onExplain={activeFormula ? () => setAiPop(aiPop === 'explain' ? null : 'explain') : undefined}
        />
      )}
      <div className="relative flex min-h-0 flex-1">
        {board && boardBlock ? (
          <Board
            sheet={sheet}
            si={sheetIx}
            calc={calc}
            rev={shownRev}
            rules={view.rules}
            block={boardBlock}
            hidden={view.hidR}
            by={board.by}
            choices={dropdownCols(boardBlock)}
            fields={boardLocal ? undefined : keptBoard?.fields}
            lanes={boardLocal ? undefined : keptBoard?.lanes}
            readOnly={readOnly}
            onBy={(c) => (readOnly ? setBoardLocal({ r: board.r, c: board.c, by: c }) : setBoardModel({ by: colName(c), lanes: undefined }))}
            onFields={(cols) => setBoardModel({ fields: cols.map(colName) })}
            onLanes={(order) => setBoardModel({ lanes: order })}
            onMove={(r, v) => setCellValue(r, board.by, v)}
            onOpen={(r) => setRowCard(r)}
            onAdd={boardAdd}
            onClose={() => setBoardOn(false)}
          />
        ) : (
          <Grid
            ref={grid}
            sheet={sheet}
            si={sheetIx}
            calc={calc}
            rev={shownRev}
            rows={size.rows}
            cols={size.cols}
            sel={sel}
            edit={edit}
            refs={refs}
            cut={cutMark?.sheet === sheet.id ? cutMark.x : null}
            readOnly={readOnly}
            view={view}
            zoom={zoom}
            formulas={formulas}
            more={more}
            overlay={
              sheet.charts?.length || (markAt && mark?.sheet === sheet.id)
                ? (geo) => (
                    <>
                      {markAt && mark?.sheet === sheet.id && <AgentCell geo={geo} r={markAt.r} c={markAt.c} />}
                      {!!sheet.charts?.length && (
                        <ChartLayer
                          book={book}
                          calc={calc}
                          si={sheetIx}
                          charts={sheet.charts}
                          rev={shownRev}
                          geo={geo}
                          picked={chartSel}
                          readOnly={readOnly}
                          onPick={(id) => {
                            setChartSel(id);
                            grid.current?.focus();
                          }}
                          onChange={(c) => updateChart(c)}
                          onOpen={(id) => !readOnly && setPanel({ kind: 'chart', id })}
                        />
                      )}
                    </>
                  )
                : undefined
            }
            onSel={(s, keepMore) => setSel(s, true, false, keepMore)}
            onAddRange={addRange}
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
            onSmart={onSmart}
            onFilter={(c, at) => setFilterMenu({ c, at })}
            onFill={fillTo}
            onFillDown={fillDown}
            onUnhide={unhide}
            onExpand={(r) => setRowCard(r)}
            onComment={(r, c) => {
              setSel(cellSel(r, c));
              openComments(false);
            }}
            ai={(cell) => aiCells.stateOf(sheet.id, cell)}
            onOpenLink={openLink}
            outline={outline}
            onFold={readOnly ? undefined : fold}
          />
        )}
        {find.open && (
          <div className="absolute top-2 right-3 z-40 max-sm:right-2 max-sm:left-2">
            <FindBar
              find={find}
              count={matches.length}
              index={findAt}
              onNext={() => nextMatch(1)}
              onPrev={() => nextMatch(-1)}
              onReplace={readOnly ? undefined : replaceOne}
              onReplaceAll={readOnly ? undefined : replaceAll}
              extra={
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 px-1 text-[12px] text-fg-2">
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={findHow.wholeCell} onChange={(e) => setFindHow({ ...findHow, wholeCell: e.target.checked })} className="accent-[var(--accent)]" />
                    Whole cell
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={findHow.formulas} onChange={(e) => setFindHow({ ...findHow, formulas: e.target.checked })} className="accent-[var(--accent)]" />
                    In formulas
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={findHow.allSheets} onChange={(e) => setFindHow({ ...findHow, allSheets: e.target.checked })} className="accent-[var(--accent)]" />
                    All sheets
                  </label>
                </div>
              }
            />
          </div>
        )}
        {panel?.kind === 'cf' && <CondPanel rules={sheet.conditional ?? []} picked={selRange()} narrow={narrow} onChange={setConditional} onClose={() => setPanel(null)} />}
        {panel?.kind === 'dv' && <ValidPanel rules={sheet.validation ?? []} picked={selRange()} start={panel.start} narrow={narrow} onChange={setRules} onClose={() => setPanel(null)} />}
        {panel?.kind === 'comments' && (
          <CommentsPanel
            comments={sheet.comments ?? []}
            cell={refName(sel.r, sel.c)}
            draft={!!panel.draft}
            narrow={narrow}
            readOnly={readOnly}
            onGo={goCell}
            onAdd={addComment}
            onReply={(id, t) => editThread(id, (c) => ({ ...c, replies: [...(c.replies ?? []), { id: newCommentId(), by: 'user', text: t, at: Date.now() }] }))}
            onResolve={(id, on) =>
              editThread(id, (c) => {
                const next = { ...c, resolved: on || undefined };
                if (!on) delete next.resolved;
                return next;
              })
            }
            onEdit={(id, t) => editThread(id, (c) => ({ ...c, text: t }))}
            onDelete={(id) => editThread(id, () => null)}
            onDraft={(on) => setPanel({ kind: 'comments', draft: on })}
            onClose={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'analyze' && <AnalyzePanel sheet={sheet} calc={calc} si={sheetIx} block={panel.block} header={panel.header} narrow={narrow} onIdea={(idea) => applyIdea(idea, panel.block)} onClose={() => setPanel(null)} />}
        {panel?.kind === 'names' && (
          <NamesPanel
            names={book.names ?? []}
            sheetId={sheet.id}
            sheetName={sheet.name}
            picked={pickedRef()}
            narrow={narrow}
            onChange={setNames}
            onRename={(from, to) => swap(renameName(book, from, to))}
            onGo={(n) => goName(n)}
            onClose={() => setPanel(null)}
          />
        )}
        {panel?.kind === 'protect' && <ProtectPanel list={sheet.protect ?? []} picked={selRange()} narrow={narrow} onChange={setProtect} onClose={() => setPanel(null)} />}
        {panel?.kind === 'clean' && <CleanPanel issues={issues} narrow={narrow} onFix={fixIssues} onShow={showIssue} onClose={() => setPanel(null)} />}
        {panelChart && <ChartPanel key={panelChart.id} book={book} chart={panelChart} narrow={narrow} onChange={(c) => updateChart(c, `chart:${c.id}`)} onDelete={() => deleteChart(panelChart.id)} onClose={() => setPanel(null)} />}
      </div>
      {!readOnly && (aiCells.waiting > 0 || aiCells.asking > 0) && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-3 py-1.5 text-[12.5px] text-fg-2">
          <Sparkles size={13} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate">
            {aiCells.asking > 0 ? (aiCells.asking === 1 ? 'Asking the helper model for an AI cell' : `Asking the helper model for ${aiCells.asking} AI cells`) : aiCells.waiting === 1 ? 'An AI cell waits for its answer' : `${aiCells.waiting} AI cells wait for their answers`}
          </span>
          {aiCells.waiting > 0 && aiCells.asking === 0 && (
            <Button size="sm" variant="ghost" onClick={aiCells.askWaiting}>
              Ask now
            </Button>
          )}
        </div>
      )}
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
      {/* The right-click menu, its Paste special list opened in its place. */}
      <div ref={ctxRef} className="pointer-events-none fixed h-px w-px" style={{ left: ctx?.x ?? -10, top: ctx?.y ?? -10 }} />
      <Popover anchor={ctxRef} open={!!ctx} onClose={() => setCtx(null)} width={248}>
        {ctx && (
          <div onMouseDown={(e) => e.preventDefault()}>
            {ctx.sub === 'paste' ? (
              <>
                <MenuBack onClick={() => setCtx({ ...ctx, sub: undefined })}>Paste special</MenuBack>
                <MenuItem hint="Ctrl+Shift+V" onClick={() => (setCtx(null), void pasteHow('values'))}>
                  Values only
                </MenuItem>
                <MenuItem onClick={() => (setCtx(null), void pasteHow('formats'))}>Formats only</MenuItem>
                <MenuItem onClick={() => (setCtx(null), void pasteHow('formulas'))}>Formulas only</MenuItem>
                <MenuItem onClick={() => (setCtx(null), void pasteHow('transposed'))}>Transposed</MenuItem>
              </>
            ) : (
              <>
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
                {!readOnly && (
                  <MenuItem icon={<ClipboardPaste size={14} />} submenu onClick={() => setCtx({ ...ctx, sub: 'paste' })}>
                    Paste special
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
                {!readOnly && ctx.on === 'row' && (
                  <MenuItem icon={<EyeOff size={14} />} onClick={() => (setCtx(null), hide('row'))}>
                    {nRows === 1 ? 'Hide this row' : `Hide ${nRows} rows`}
                  </MenuItem>
                )}
                {!readOnly && ctx.on === 'col' && (
                  <MenuItem icon={<EyeOff size={14} />} onClick={() => (setCtx(null), hide('col'))}>
                    {nCols === 1 ? 'Hide this column' : `Hide ${nCols} columns`}
                  </MenuItem>
                )}
                {!readOnly && ctx.on === 'row' && hasHiddenRows && (
                  <MenuItem icon={<Eye size={14} />} onClick={() => (setCtx(null), showAll('row'))}>
                    Show all hidden rows
                  </MenuItem>
                )}
                {!readOnly && ctx.on === 'col' && hasHiddenCols && (
                  <MenuItem icon={<Eye size={14} />} onClick={() => (setCtx(null), showAll('col'))}>
                    Show all hidden columns
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
                {!readOnly && <MenuSep />}
                {!readOnly && ctx.on === 'cell' && (
                  <MenuItem icon={<StickyNote size={14} />} hint="Shift+F2" onClick={() => (setCtx(null), editNote())}>
                    {activeNote ? 'Edit note' : 'Insert note'}
                  </MenuItem>
                )}
                {ctx.on === 'cell' && (
                  <MenuItem icon={<MessageSquarePlus size={14} />} hint="Ctrl+Alt+M" onClick={() => (setCtx(null), openComments(!readOnly))}>
                    Comment
                  </MenuItem>
                )}
                {ctx.on === 'cell' && activeFormula && (
                  <MenuItem icon={<MessageCircleQuestionMark size={14} />} onClick={() => (setCtx(null), setAiPop('explain'))}>
                    Explain this formula
                  </MenuItem>
                )}
                {ctx.on === 'cell' && !readOnly && asksAi(activeFormula || undefined) && (
                  <MenuItem icon={<RefreshCw size={14} />} onClick={() => (setCtx(null), aiCells.refresh([{ sheet: sheet.id, cell: refName(sel.r, sel.c) }]))}>
                    Refresh the AI answer
                  </MenuItem>
                )}
                {ctx.on !== 'col' && (
                  <MenuItem icon={<Maximize2 size={14} />} onClick={() => (setCtx(null), setRowCard(sel.r))}>
                    Expand row
                  </MenuItem>
                )}
                {!readOnly && (
                  <MenuItem icon={<Eraser size={14} />} hint="Delete" onClick={() => (setCtx(null), clear())}>
                    Clear
                  </MenuItem>
                )}
                {askNow && <MenuSep />}
                {askNow && (
                  <MenuItem icon={<Sparkles size={14} />} onClick={askNow}>
                    Ask the agent about it
                  </MenuItem>
                )}
              </>
            )}
          </div>
        )}
      </Popover>
      {/* A cell's own pickers: a list, a calendar, its note, a character to put in. */}
      <div ref={pickRef} className="pointer-events-none fixed" style={pick ? { left: pick.at.left, top: pick.at.top, width: pick.at.width, height: pick.at.height } : { left: -10, top: -10, width: 1, height: 1 }} />
      <Popover
        anchor={pickRef}
        open={!!pick}
        onClose={() => (setPick(null), grid.current?.focus())}
        width={pick?.kind === 'chars' ? 330 : pick?.kind === 'date' ? 260 : 260}
        title={pick?.kind === 'note' ? 'Note' : pick?.kind === 'date' ? 'Date' : pick?.kind === 'chars' ? 'Special character' : 'Options'}
      >
        {pick?.kind === 'list' && pickRule?.type === 'list' && (
          <ListPicker
            options={listOptions(calc, sheetIx, pickRule)}
            value={pickCell ? formatValue(calc.value(sheetIx, pick.r, pick.c), pickCell.s) : ''}
            onPick={(v) => {
              setPick(null);
              setCellValue(pick.r, pick.c, v.startsWith('=') || v.startsWith("'") ? `'${v}` : v);
              grid.current?.focus();
            }}
            onClose={() => setPick(null)}
          />
        )}
        {pick?.kind === 'date' && (
          <DatePicker
            value={(() => {
              const v = calc.value(sheetIx, pick.r, pick.c);
              return typeof v === 'number' ? v : null;
            })()}
            onPick={(serial) => {
              if (!book) return;
              const k = refName(pick.r, pick.c);
              const cell = sheet.cells[k];
              setPick(null);
              if (cell?.f !== undefined) return;
              const next = tidyCell({ ...(cell ?? {}), v: serial, s: withStyle(cell?.s, cell?.s?.fmt && isDateFmt(cell.s.fmt) ? {} : { fmt: 'date' }) });
              if (!refused(pick.r, pick.c, next)) change(cellsPatch(book, sheetIx, { [k]: next }));
              grid.current?.focus();
            }}
          />
        )}
        {pick?.kind === 'note' && (
          <div className="p-1">
            <textarea
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote(pick.r, pick.c, noteDraft);
                if (e.key === 'Escape') setPick(null);
                // Ctrl+S keeps the note and saves the spreadsheet.
                if (e.key.toLowerCase() === 's' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  saveNote(pick.r, pick.c, noteDraft);
                  setTimeout(() => void saveNow.current(), 0);
                }
              }}
              rows={4}
              maxLength={SHEET_LIMITS.note}
              placeholder="A note on the cell"
              aria-label="A note on the cell"
              translate="no"
              className="w-full resize-none rounded-lg border border-line bg-bg px-2.5 py-2 text-[13px] leading-snug outline-none focus:border-accent"
            />
            <div className="mt-1.5 flex items-center gap-2">
              {pickCell?.note && (
                <Button size="sm" variant="ghost" className="text-err" onClick={() => saveNote(pick.r, pick.c, '')}>
                  Delete note
                </Button>
              )}
              <Button size="sm" variant="primary" className="ml-auto" onClick={() => saveNote(pick.r, pick.c, noteDraft)}>
                Save
              </Button>
            </div>
          </div>
        )}
        {pick?.kind === 'chars' && (
          <CharPicker
            onPick={(ch) => {
              setPick(null);
              typeIn(ch, true);
            }}
          />
        )}
      </Popover>
      {/* A filter's menu, from its button. */}
      <div ref={filterRef} className="pointer-events-none fixed" style={filterMenu ? { left: filterMenu.at.left, top: filterMenu.at.top, width: filterMenu.at.width, height: filterMenu.at.height } : { left: -10, top: -10, width: 1, height: 1 }} />
      <Popover anchor={filterRef} open={!!filterMenu && !!view.filter} onClose={() => setFilterMenu(null)} width={300} title="Sort and filter">
        {filterMenu && view.filter && (
          <FilterMenu
            key={filterMenu.c}
            values={columnValues(sheet, sheetIx, calc, view.filter.x, filterMenu.c)}
            current={sheet.filter?.cols?.[colName(filterMenu.c)]}
            onSort={(asc) => sortFiltered(filterMenu.c, asc)}
            onApply={(fc) => setFilterCol(filterMenu.c, fc)}
            onClose={() => setFilterMenu(null)}
          />
        )}
      </Popover>
      {/* The options a list cell's words pick, under it while typing. */}
      {cellBox && (
        <div className="fixed z-50 w-[220px] rounded-xl border border-line bg-elevated p-1 shadow-lg" style={{ left: cellBox.left, top: cellBox.bottom + 4 }} onMouseDown={(e) => e.preventDefault()}>
          {typedOpts.map((o, i) => (
            <button
              key={o}
              type="button"
              translate="no"
              onClick={() => commitEdit([1, 0], false, o)}
              className={cx('flex h-7 w-full items-center rounded-lg px-2 text-left text-[13px] hover:bg-bg-2', i === Math.min(suggestAt, typedOpts.length - 1) && 'bg-bg-2')}
            >
              <span className="truncate">{o}</span>
            </button>
          ))}
        </div>
      )}
      {rowCard !== null && cardInfo && (
        <RowCard
          sheet={sheet}
          si={sheetIx}
          calc={calc}
          rev={rev}
          rules={view.rules}
          row={rowCard}
          cols={cardInfo.cols}
          head={cardInfo.head}
          first={cardInfo.first}
          last={cardInfo.last}
          readOnly={readOnly}
          onRow={(r) => {
            setRowCard(r);
            setSel(cellSel(r, sel.c), true);
          }}
          onSet={setCellValue}
          onClose={() => {
            setRowCard(null);
            grid.current?.focus();
          }}
        />
      )}
      {dialog === 'sort' && toolBlock && <SortDialog cols={colChoices(toolBlock, header)} header={header} onHeader={setHeader} onSort={sortRangeBy} onClose={() => setDialog(null)} />}
      {dialog === 'dups' && toolBlock && <DupDialog cols={colChoices(toolBlock, header)} header={header} onHeader={setHeader} onRemove={removeDups} onClose={() => setDialog(null)} />}
      {dialog === 'summary' && toolBlock && <SummaryDialog cols={colChoices(toolBlock, true)} onMake={summarize} onClose={() => setDialog(null)} />}
      {dialog === 'split' && <SplitDialog guess={splitGuess()} onSplit={(sp) => void splitText(sp)} onClose={() => setDialog(null)} />}
      {dialog === 'format' && <FormatDialog code={active?.s?.code ?? ''} sample={calc.value(sheetIx, sel.r, sel.c)} style={active?.s} onApply={(c) => setCode(c)} onClose={() => setDialog(null)} />}
      <ShortcutsDialog open={dialog === 'shortcuts'} onClose={() => setDialog(null)} groups={shortcutGroups} />
      {dialog === 'table-ai' && <TableAi onInsert={insertAiTable} onClose={() => setDialog(null)} />}
      {dialog === 'link' && (
        <LinkDialog
          link={active?.link}
          text={formatValue(calc.value(sheetIx, sel.r, sel.c), active?.s)}
          places={[...book.sheets.map((s) => `${quoteSheet(s.name)}!A1`), ...(book.names ?? []).map((n) => n.name)]}
          onApply={applyLink}
          onClose={() => setDialog(null)}
        />
      )}
      <FormulaAi anchor={aiAnchor} open={aiPop === 'formula'} context={aiContext} onInsert={insertFormula} onClose={() => setAiPop(null)} />
      <ExplainAi anchor={aiAnchor} open={aiPop === 'explain' && !!activeFormula} formula={activeFormula ? `=${activeFormula}` : ''} context={aiContext} onClose={() => setAiPop(null)} />
      {confirmNode}
    </div>
  );
  // On a phone, what opens from the editor comes up from the bottom of the screen.
  return narrow ? <SheetsOnPhone.Provider value>{body}</SheetsOnPhone.Provider> : body;
}
