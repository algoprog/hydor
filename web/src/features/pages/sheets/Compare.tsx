// A spreadsheet compared with one of its versions (Tools → Compare with the version before, Compare with a version, or
// See what changed under an agent's turn): the sheet with what changed marked in place (cells whose value or formula
// changed tinted amber, a number format or look alone blue, formulas whose results changed with them faintly; rows and
// columns added green, the ones removed red and struck where they were; tabs added, removed or renamed named on their
// tabs), the changes listed beside it (tab, cell, before → after, the formula and what it shows), each a click from its
// cell and a click from being put back, the counts on top, Put back the version (the page's restore: it comes back
// as a new version) and the way back. How the versions are lined up is shared/sheet-diff.ts's, said under the list.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowUpDown, ChevronRight, History, RotateCcw, Undo2 } from 'lucide-react';
import { colName, computeBook, COL_W, formatValue, keyOf, refName, unpackC, unpackR, type Calc, type Cell, type Sheet, type Workbook } from '@shared/sheets';
import { diffBooks, putBack, type BookDiff, type CellChange, type OtherPart, type PutBack, type TabDiff } from '@shared/sheet-diff';
import { ago } from '../../../lib/format';
import { toastError } from '../../../lib/store';
import { Button, cx, IconButton } from '../../../components/ui';

/** The tints of what changed: they read on the light page and the dark one alike. */
const TINT = {
  changed: 'rgba(245, 158, 11, 0.32)',
  look: 'rgba(59, 130, 246, 0.24)',
  result: 'rgba(245, 158, 11, 0.11)',
  added: 'rgba(34, 197, 94, 0.2)',
  removed: 'rgba(239, 68, 68, 0.17)',
};
const ADDED_INK = '#16a34a';
const REMOVED_INK = '#dc2626';

const ROW_H = 24;
const HEAD_W = 52;
const HEAD_H = 24;

const OTHER: Record<OtherPart, string> = {
  charts: 'Charts',
  merges: 'Merged cells',
  filter: 'The filter',
  conditional: 'Conditional formatting',
  validation: 'Data validation',
  freeze: 'Frozen rows and columns',
  protect: 'Protected ranges',
  groups: 'Grouped rows and columns',
  tabColor: 'The tab’s colour',
  hidden: 'Whether the tab is hidden',
  board: 'The Kanban board',
  pivot: 'The pivot table',
  print: 'Print setup',
};

/** What a cell change is, in a word or two. */
function kindLabel(c: CellChange): string {
  if (c.kind === 'value' || c.kind === 'formula') {
    if (!c.before.input) return c.look ? 'Filled in, with a new look' : 'Filled in';
    if (!c.after.input) return 'Emptied';
    if (c.kind === 'formula') return c.look ? 'Formula and look' : 'Formula';
    return c.look ? 'Value and look' : 'Value';
  }
  return c.kind === 'format' ? 'Number format' : c.kind === 'style' ? 'Look' : 'Note or link';
}

const cellOf = (wb: Workbook, si: number, r: number, c: number): Cell | undefined => wb.sheets[si]?.cells[refName(r, c)];
/** What a cell shows (its formula worked out, in its number format). */
const shownOf = (calc: Calc, si: number, r: number, c: number, cell: Cell | undefined) => {
  try {
    return formatValue(calc.value(si, r, c), cell?.s);
  } catch {
    return '';
  }
};

/** Where a change is in the grid of its tab: its line and column as they show. */
interface Spot {
  tab: number;
  row: number;
  col: number;
}

/** One entry of the list of changes. */
interface Entry {
  key: string;
  spot: Spot;
  put?: PutBack;
  head: ReactNode;
  body?: ReactNode;
}

/** At most this many cells are listed for a tab (the grid shows them all). */
const LISTED = 400;

export function SheetCompare({
  before,
  after,
  rev,
  version,
  at,
  upTo,
  dirty,
  phone,
  startSheet,
  onPutBack,
  onRestore,
  onOther,
  onBack,
}: {
  /** The older version. */
  before: Workbook;
  /** What it is compared with: the spreadsheet as the editor has it now, or an older version on view. */
  after: Workbook;
  /** Counts the editor's changes (its workbook changes in place). */
  rev: number;
  version: number;
  /** When the older version was saved. */
  at?: number;
  /** The version on view, when it is not the latest. */
  upTo?: number;
  /** The editor has changes not saved yet (they are part of what is compared). */
  dirty?: boolean;
  phone: boolean;
  /** The sheet the editor shows, to start on (by its id) when nothing on another changed. */
  startSheet?: string;
  /** One change put back in the editor (left out where nothing may change). */
  onPutBack?: (next: Workbook) => void;
  /** The whole version put back (a new version). */
  onRestore?: () => void;
  onOther?: () => void;
  onBack: () => void;
}) {
  const calcB = useMemo(() => computeBook(before), [before]);
  // The editor's workbook changes in place: worked out again with each change of it.
  const calcA = useMemo(() => computeBook(after), [after, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = useMemo(() => diffBooks(before, after, { calcBefore: calcB, calcAfter: calcA }), [before, after, calcB, calcA]);
  const [tab, setTab] = useState(() => {
    const own = diff.tabs.findIndex((t) => t.id === startSheet && t.changed);
    if (own >= 0) return own;
    const first = diff.tabs.findIndex((t) => t.changed);
    return first >= 0 ? first : Math.max(0, diff.tabs.findIndex((t) => t.id === startSheet));
  });
  const shownTab = Math.min(tab, diff.tabs.length - 1);
  const t = diff.tabs[shownTab];
  const [focus, setFocus] = useState<(Spot & { n: number; key?: string }) | null>(null);
  const [openResults, setOpenResults] = useState<Set<number>>(new Set());
  const list = useRef<HTMLDivElement>(null);

  const go = (e: Entry) => {
    setTab(e.spot.tab);
    setFocus((f) => ({ ...e.spot, key: e.key, n: (f?.n ?? 0) + 1 }));
  };
  const put = (p: PutBack) => {
    if (!onPutBack) return;
    try {
      onPutBack(putBack(before, after, diff, p));
      setFocus(null);
    } catch (err) {
      toastError(err);
    }
  };

  const entries = useMemo(() => entriesOf(diff, before, after, calcB, calcA, openResults), [diff, before, after, calcB, calcA, openResults]);
  const tabEntries = (i: number) => entries.filter((e) => e.spot.tab === i);

  // A cell clicked in the grid: its change in the list, in view.
  const pickCell = (row: number, col: number) => {
    const e = entries.find((x) => x.spot.tab === shownTab && x.spot.row === row && (x.spot.col === col || x.key.startsWith(`${shownTab}:row`)));
    if (!e) return setFocus({ tab: shownTab, row, col, n: (focus?.n ?? 0) + 1 });
    setFocus({ ...e.spot, key: e.key, n: (focus?.n ?? 0) + 1 });
    list.current?.querySelector(`[data-entry="${CSS.escape(e.key)}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const counts = countsOf(diff, after.sheets.length);
  const side = (
    <div ref={list} className="space-y-3">
      {diff.tabs.map((d, i) => {
        const own = tabEntries(i);
        if (!own.length) return null;
        return (
          <section key={`${d.id}:${i}`} data-tab={i}>
            <button type="button" onClick={() => setTab(i)} className="mb-1.5 flex w-full items-center gap-1.5 px-0.5 text-left text-[12px] font-medium text-fg-2 hover:text-fg">
              <span translate="no" className={cx('min-w-0 truncate', d.status === 'removed' && 'line-through')}>
                {d.name}
              </span>
              {d.status === 'added' && <span className="shrink-0 text-[11px]" style={{ color: ADDED_INK }}>New tab</span>}
              {d.status === 'removed' && <span className="shrink-0 text-[11px]" style={{ color: REMOVED_INK }}>Removed</span>}
            </button>
            <div className="space-y-1.5">
              {own.map((e) => (
                <div
                  key={e.key}
                  data-entry={e.key}
                  className={cx('group flex items-start gap-1 rounded-xl border bg-elevated', focus?.key === e.key ? 'border-accent/60 shadow-md' : 'border-line hover:border-line-2')}
                >
                  <button type="button" onClick={() => go(e)} className="min-w-0 flex-1 p-2.5 text-left">
                    <div className="text-[12.5px] text-fg">{e.head}</div>
                    {e.body && <div className="mt-1 text-[12px] text-fg-2">{e.body}</div>}
                  </button>
                  {e.put && onPutBack && (
                    <IconButton label="Put this back" size="sm" onClick={() => put(e.put!)} className="mt-1.5 mr-1.5">
                      <Undo2 size={14} />
                    </IconButton>
                  )}
                </div>
              ))}
              {d.results.length > 0 && (
                <button
                  type="button"
                  onClick={() => setOpenResults((s) => new Set(s.has(i) ? [...s].filter((x) => x !== i) : [...s, i]))}
                  className="flex w-full items-center gap-1 px-1 py-0.5 text-left text-[12px] text-fg-3 hover:text-fg-2"
                >
                  <ChevronRight size={13} className={cx('shrink-0 transition', openResults.has(i) && 'rotate-90')} />
                  {d.results.length === 1 ? 'A formula’s result changed with them' : `${d.results.length} formulas’ results changed with them`}
                </button>
              )}
              {d.cells.length > LISTED && <p className="px-1 text-[11.5px] text-fg-3">{`${d.cells.length - LISTED} more cells changed on this tab: the sheet shows them all.`}</p>}
              {Math.max(d.rows.added.length, d.rows.removed.length, d.cols.added.length, d.cols.removed.length) > LISTED && <p className="px-1 text-[11.5px] text-fg-3">More rows and columns changed than are listed here: the sheet shows them all.</p>}
              {d.status === 'kept' && d.cells.length + d.rows.added.length + d.rows.removed.length + d.rows.moved.length > 0 && (
                <p className="px-1 text-[11.5px] text-fg-3">
                  {d.rule.by === 'key'
                    ? d.rule.header
                      ? `Rows lined up by the key column ${colName(d.rule.col)}, “${d.rule.header}”.`
                      : `Rows lined up by the key column ${colName(d.rule.col)}.`
                    : 'Rows lined up by what they hold.'}
                </p>
              )}
            </div>
          </section>
        );
      })}
      {diff.same && <p className="px-1 py-4 text-center text-[12.5px] text-fg-3">Nothing changed since this version.</p>}
      {diff.names && <p className="px-1 text-[12px] text-fg-2">The named ranges changed too.</p>}
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-[12.5px]">
        <History size={15} className="shrink-0 text-fg-3" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-fg">
            <span>{upTo ? `What version ${upTo} changed since version ${version}` : `What changed since version ${version}`}</span>
            {at ? <span className="text-fg-3">{` · ${ago(at)}`}</span> : null}
            {dirty && !upTo ? <span className="text-fg-3"> · with your changes not saved yet</span> : null}
          </span>
          <span className="flex flex-wrap gap-x-1.5 text-fg-3">
            {counts.map((c, i) => (
              <span key={i} className="whitespace-nowrap">
                {c}
                {i < counts.length - 1 && ' ·'}
              </span>
            ))}
          </span>
        </span>
        {onOther && (
          <Button size="sm" variant="ghost" icon={<History size={14} />} onClick={onOther} className="h-7">
            Another version
          </Button>
        )}
        {onRestore && (
          <Button size="sm" variant="primary" icon={<RotateCcw size={14} />} onClick={onRestore} className="h-7">
            {`Put back version ${version}`}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onBack} className="h-7">
          Back to the spreadsheet
        </Button>
      </div>
      <div className={cx('flex min-h-0 flex-1', phone && 'flex-col')}>
        <div className={cx('flex min-h-0 min-w-0 flex-col', phone ? 'h-[55%] shrink-0' : 'flex-1')}>
          {t && <DiffGrid key={`${shownTab}:${t.id}`} t={t} before={before} after={after} calcB={calcB} calcA={calcA} focus={focus?.tab === shownTab ? focus : null} onCell={pickCell} />}
          <DiffTabs
            diff={diff}
            active={shownTab}
            onPick={(i) => {
              setTab(i);
              setFocus(null);
              // Its changes in view in the list too.
              list.current?.querySelector(`[data-tab="${i}"]`)?.scrollIntoView({ block: 'start' });
            }}
          />
        </div>
        <aside className={cx('min-h-0 overflow-y-auto bg-panel p-3', phone ? 'flex-1 border-t border-line' : 'w-[320px] shrink-0 border-l border-line')}>{side}</aside>
      </div>
    </div>
  );
}

/** The counts on top: "23 cells changed on 2 tabs · 1 row added · …", each its own words. */
function countsOf(d: BookDiff, tabs: number): string[] {
  const x = d.totals;
  const out: string[] = [];
  if (x.cells === 1) out.push('1 cell changed');
  else if (x.cells) out.push(x.cellTabs > 1 ? `${x.cells} cells changed on ${x.cellTabs} tabs` : tabs > 1 ? `${x.cells} cells changed on 1 tab` : `${x.cells} cells changed`);
  // Each its own words, so each is translated whole.
  if (x.rowsAdded) out.push(x.rowsAdded === 1 ? '1 row added' : `${x.rowsAdded} rows added`);
  if (x.rowsRemoved) out.push(x.rowsRemoved === 1 ? '1 row removed' : `${x.rowsRemoved} rows removed`);
  if (x.rowsMoved) out.push(x.rowsMoved === 1 ? '1 row moved' : `${x.rowsMoved} rows moved`);
  if (x.colsAdded) out.push(x.colsAdded === 1 ? '1 column added' : `${x.colsAdded} columns added`);
  if (x.colsRemoved) out.push(x.colsRemoved === 1 ? '1 column removed' : `${x.colsRemoved} columns removed`);
  if (x.tabsAdded) out.push(x.tabsAdded === 1 ? '1 tab added' : `${x.tabsAdded} tabs added`);
  if (x.tabsRemoved) out.push(x.tabsRemoved === 1 ? '1 tab removed' : `${x.tabsRemoved} tabs removed`);
  if (x.tabsRenamed) out.push(x.tabsRenamed === 1 ? '1 tab renamed' : `${x.tabsRenamed} tabs renamed`);
  if (d.names) out.push('named ranges changed');
  if (!out.length) out.push(x.tabs ? 'Other parts changed' : 'Nothing changed');
  return out;
}

/** A line's first cells, as it shows: "Travel · 200 · 0". */
function Preview({ cells }: { cells: { ref: string; shown: string }[] }) {
  if (!cells.length) return <span className="text-fg-3">Empty</span>;
  return (
    <span translate="no" className="line-clamp-2 break-words">
      {cells.map((c) => c.shown).join(' · ')}
    </span>
  );
}

/** Before → after, the before struck. */
function Was({ before, after, mono }: { before: string; after: string; mono?: boolean }) {
  return (
    <span translate="no" className={cx('flex min-w-0 flex-wrap items-baseline gap-x-1.5 break-all', mono && 'font-mono text-[11.5px]')}>
      {before ? (
        <span className="line-through decoration-1" style={{ color: REMOVED_INK }}>
          {before}
        </span>
      ) : (
        <span className="text-fg-3">∅</span>
      )}
      <span className="text-fg-3">→</span>
      {after ? <span style={{ color: ADDED_INK }}>{after}</span> : <span className="text-fg-3">∅</span>}
    </span>
  );
}

/** A sheet's filled cells by row and by column (made once for a list of changes): a line's first cells, as they show. */
function linesOf(sheet: Sheet, calc: Calc, si: number) {
  const rows = new Map<number, [number, string][]>();
  const cols = new Map<number, [number, string][]>();
  for (const name in sheet.cells) {
    const k = keyOf(name);
    const cell = sheet.cells[name];
    if (k < 0 || (cell.f === undefined && (cell.v === undefined || cell.v === ''))) continue;
    const r = unpackR(k);
    const c = unpackC(k);
    (rows.get(r) ?? rows.set(r, []).get(r)!).push([c, name]);
    (cols.get(c) ?? cols.set(c, []).get(c)!).push([r, name]);
  }
  return (axis: 'row' | 'col', i: number, max = 6) =>
    ((axis === 'row' ? rows : cols).get(i) ?? [])
      .sort((x, y) => x[0] - y[0])
      .slice(0, max)
      .map(([at, name]) => ({ ref: name, shown: axis === 'row' ? shownOf(calc, si, i, at, sheet.cells[name]) : shownOf(calc, si, at, i, sheet.cells[name]) }));
}

/** Where a line of the newer version (or, `old`, of the older one) shows among its tab's lines. */
const placeIn = (order: { a: number; b: number }[], i: number, old = false) => Math.max(0, order.findIndex((x) => (old ? x.a < 0 && x.b === i : x.a === i)));

function entriesOf(d: BookDiff, before: Workbook, after: Workbook, calcB: Calc, calcA: Calc, openResults: Set<number>): Entry[] {
  const out: Entry[] = [];
  d.tabs.forEach((t, i) => {
    const at = (row: number, col: number): Spot => ({ tab: i, row, col });
    if (t.status === 'added') out.push({ key: `${i}:tab`, spot: at(0, 0), put: { k: 'tab-added', tab: i }, head: 'A new tab' });
    if (t.status === 'removed') out.push({ key: `${i}:tab`, spot: at(0, 0), put: { k: 'tab-removed', tab: i }, head: 'This tab was removed' });
    if (t.status !== 'kept') return;
    const afterLines = linesOf(after.sheets[t.ai], calcA, t.ai);
    const beforeLines = linesOf(before.sheets[t.bi], calcB, t.bi);
    if (t.was) out.push({ key: `${i}:name`, spot: at(0, 0), put: { k: 'tab-renamed', tab: i }, head: <span>{`Renamed from “${t.was}”`}</span> });
    if (t.other.length)
      out.push({
        key: `${i}:other`,
        spot: at(0, 0),
        head: 'Also changed on this tab',
        body: (
          <span className="flex flex-wrap gap-1">
            {t.other.map((o) => (
              <span key={o} className="rounded-md bg-bg-2 px-1.5 py-0.5 text-[11.5px]">
                {OTHER[o]}
              </span>
            ))}
          </span>
        ),
      });
    for (const a of t.cols.added.slice(0, LISTED))
      out.push({
        key: `${i}:col+${a}`,
        spot: at(0, placeIn(t.cols.order, a)),
        put: { k: 'col-added', tab: i, a },
        head: <span style={{ color: ADDED_INK }}>{`Column ${colName(a)} added`}</span>,
        body: <Preview cells={afterLines('col', a, 4)} />,
      });
    for (const b of t.cols.removed.slice(0, LISTED))
      out.push({
        key: `${i}:col-${b}`,
        spot: at(0, placeIn(t.cols.order, b, true)),
        put: { k: 'col-removed', tab: i, b },
        head: <span style={{ color: REMOVED_INK }}>{`Column ${colName(b)} removed`}</span>,
        body: <Preview cells={beforeLines('col', b, 4)} />,
      });
    for (const a of t.rows.added.slice(0, LISTED))
      out.push({
        key: `${i}:row+${a}`,
        spot: at(placeIn(t.rows.order, a), 0),
        put: { k: 'row-added', tab: i, a },
        head: <span style={{ color: ADDED_INK }}>{`Row ${a + 1} added`}</span>,
        body: <Preview cells={afterLines('row', a)} />,
      });
    for (const b of t.rows.removed.slice(0, LISTED))
      out.push({
        key: `${i}:row-${b}`,
        spot: at(placeIn(t.rows.order, b, true), 0),
        put: { k: 'row-removed', tab: i, b },
        head: <span style={{ color: REMOVED_INK }}>{`Row ${b + 1} removed`}</span>,
        body: <Preview cells={beforeLines('row', b)} />,
      });
    if (t.rows.moved.length)
      out.push({
        key: `${i}:moved`,
        spot: at(placeIn(t.rows.order, t.rows.moved[0]), 0),
        head: (
          <span className="flex items-center gap-1.5">
            <ArrowUpDown size={13} className="shrink-0 text-fg-3" />
            {t.rows.moved.length === 1 ? `Row ${t.rows.moved[0] + 1} moved` : `${t.rows.moved.length} rows moved`}
          </span>
        ),
        body: t.rows.moved.length > 1 ? 'Put in another order (a sort): what they hold is the same.' : undefined,
      });
    for (const c of t.cells.slice(0, LISTED)) {
      out.push({
        key: `${i}:${c.r},${c.c}`,
        spot: at(placeIn(t.rows.order, c.r), placeIn(t.cols.order, c.c)),
        put: { k: 'cell', tab: i, r: c.r, c: c.c },
        head: (
          <span className="flex items-baseline gap-2">
            <span translate="no" className="font-mono text-[12px] font-medium">
              {refName(c.r, c.c)}
            </span>
            <span className="text-[11.5px] text-fg-3">{kindLabel(c)}</span>
          </span>
        ),
        body:
          c.kind === 'formula' ? (
            <span className="block space-y-0.5">
              <Was before={c.before.input} after={c.after.input} mono />
              {c.before.shown !== c.after.shown ? (
                <span className="flex items-baseline gap-1.5">
                  <span className="shrink-0 text-[11px] text-fg-3">Shows</span>
                  <Was before={c.before.shown} after={c.after.shown} />
                </span>
              ) : (
                <span className="flex items-baseline gap-1.5 text-[11px] text-fg-3">
                  <span>Shows the same:</span>
                  <span translate="no">{c.after.shown}</span>
                </span>
              )}
            </span>
          ) : c.kind === 'style' || c.kind === 'note' ? (
            <span translate="no" className="text-fg-2">
              {c.after.shown || c.before.shown}
            </span>
          ) : (
            <Was before={c.before.shown} after={c.after.shown} />
          ),
      });
    }
    if (openResults.has(i))
      for (const x of t.results.slice(0, LISTED))
        out.push({
          key: `${i}:result:${x.r},${x.c}`,
          spot: at(placeIn(t.rows.order, x.r), placeIn(t.cols.order, x.c)),
          head: (
            <span className="flex items-baseline gap-2">
              <span translate="no" className="font-mono text-[12px] font-medium">
                {refName(x.r, x.c)}
              </span>
              <span translate="no" className="truncate font-mono text-[11px] text-fg-3">
                {x.formula}
              </span>
            </span>
          ),
          body: <Was before={x.before} after={x.after} />,
        });
  });
  return out;
}

/** The tabs under the sheet, each marked with what happened to it. */
function DiffTabs({ diff, active, onPick }: { diff: BookDiff; active: number; onPick: (i: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-line bg-panel px-2 py-1">
      {diff.tabs.map((t, i) => {
        const n = t.cells.length + t.rows.added.length + t.rows.removed.length + t.cols.added.length + t.cols.removed.length;
        return (
          <button
            key={`${t.id}:${i}`}
            type="button"
            onClick={() => onPick(i)}
            className={cx('flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] transition-colors', i === active ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-2')}
            style={t.status === 'added' ? { boxShadow: `inset 0 -2px 0 ${ADDED_INK}` } : t.status === 'removed' ? { boxShadow: `inset 0 -2px 0 ${REMOVED_INK}` } : undefined}
          >
            <span translate="no" className={cx(t.status === 'removed' && 'line-through')}>
              {t.name}
            </span>
            {t.was && (
              <span className="text-[11px] text-fg-3">
                <span>was</span> <span translate="no">{t.was}</span>
              </span>
            )}
            {t.status === 'added' && <span className="text-[11px]" style={{ color: ADDED_INK }}>new</span>}
            {t.status === 'removed' && <span className="text-[11px]" style={{ color: REMOVED_INK }}>removed</span>}
            {t.status === 'kept' && n > 0 && <span className="rounded-full bg-amber-500/20 px-1.5 text-[10.5px] font-medium text-fg-2">{n}</span>}
            {t.status === 'kept' && !n && t.changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One tab's cells, both versions in one grid: the newer version's lines with the ones removed where they were. Only the
 * cells in view are drawn.
 */
function DiffGrid({
  t,
  before,
  after,
  calcB,
  calcA,
  focus,
  onCell,
}: {
  t: TabDiff;
  before: Workbook;
  after: Workbook;
  calcB: Calc;
  calcA: Calc;
  focus: (Spot & { n: number }) | null;
  onCell: (row: number, col: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, left: 0, w: 800, h: 500 });
  const rows = t.rows.order;
  const cols = t.cols.order;
  const sa = t.ai >= 0 ? after.sheets[t.ai] : undefined;
  const sb = t.bi >= 0 ? before.sheets[t.bi] : undefined;
  // A few empty lines past the last, as a sheet has.
  const nRows = Math.max(rows.length + 3, 20);
  const nCols = Math.max(cols.length + 1, 8);
  const widths = useMemo(() => {
    const w = new Float64Array(nCols);
    for (let i = 0; i < nCols; i++) {
      const x = cols[i];
      const px = x ? (x.a >= 0 ? sa?.cols?.[x.a]?.w : sb?.cols?.[x.b]?.w) : undefined;
      w[i] = Math.min(360, Math.max(48, px ?? COL_W));
    }
    return w;
  }, [cols, nCols, sa, sb]);
  const lefts = useMemo(() => {
    const l = new Float64Array(nCols + 1);
    for (let i = 0; i < nCols; i++) l[i + 1] = l[i] + widths[i];
    return l;
  }, [widths, nCols]);
  const marks = useMemo(() => {
    const m = new Map<number, 'changed' | 'look' | 'result'>();
    for (const x of t.results) m.set(x.r * 100_000 + x.c, 'result');
    for (const c of t.cells) m.set(c.r * 100_000 + c.c, c.kind === 'value' || c.kind === 'formula' ? 'changed' : 'look');
    return m;
  }, [t]);
  const moved = useMemo(() => new Set(t.rows.moved), [t]);
  // The empty lines past the last are numbered on from the newer version's last.
  const lastRow = useMemo(() => rows.reduce((m, z) => Math.max(m, z.a >= 0 ? z.a : z.b), -1), [rows]);
  const lastCol = useMemo(() => cols.reduce((m, z) => Math.max(m, z.a >= 0 ? z.a : z.b), -1), [cols]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const size = () => setView((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight }));
    const ro = new ResizeObserver(size);
    ro.observe(el);
    size();
    return () => ro.disconnect();
  }, []);
  // A change picked in the list: its cell in the middle of the view.
  useEffect(() => {
    const el = box.current;
    if (!focus || !el) return;
    const top = Math.max(0, focus.row * ROW_H - el.clientHeight / 2 + ROW_H);
    const inX = lefts[focus.col] >= el.scrollLeft && lefts[focus.col + 1] <= el.scrollLeft + el.clientWidth;
    el.scrollTo({ top, left: inX ? el.scrollLeft : Math.max(0, lefts[focus.col] - el.clientWidth / 3) });
  }, [focus?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  const r0 = Math.max(0, Math.floor(view.top / ROW_H) - 2);
  const r1 = Math.min(nRows, Math.ceil((view.top + view.h) / ROW_H) + 2);
  let c0 = 0;
  while (c0 < nCols - 1 && lefts[c0 + 1] < view.left) c0++;
  let c1 = c0;
  while (c1 < nCols && lefts[c1] < view.left + view.w) c1++;

  const cells: ReactNode[] = [];
  const rowHeads: ReactNode[] = [];
  const colHeads: ReactNode[] = [];
  for (let j = c0; j < c1; j++) {
    const x = cols[j];
    const gone = x && x.a < 0;
    const fresh = x && x.b < 0 && t.status === 'kept';
    colHeads.push(
      <div
        key={j}
        className="absolute top-0 flex h-full items-center justify-center border-r border-line text-[11.5px]"
        style={{ left: lefts[j], width: widths[j], background: gone ? TINT.removed : fresh ? TINT.added : undefined, color: gone ? REMOVED_INK : fresh ? ADDED_INK : undefined }}
      >
        <span translate="no" className={cx(gone && 'line-through')}>
          {colName(x ? (x.a >= 0 ? x.a : x.b) : lastCol + 1 + (j - cols.length))}
        </span>
      </div>,
    );
  }
  for (let i = r0; i < r1; i++) {
    const y = rows[i];
    const gone = !!y && y.a < 0;
    const fresh = !!y && y.b < 0 && t.status === 'kept';
    const shifted = !!y && y.a >= 0 && moved.has(y.a);
    rowHeads.push(
      <div
        key={i}
        className="absolute left-0 flex w-full items-center justify-center gap-0.5 border-b border-line text-[11.5px]"
        style={{ top: i * ROW_H, height: ROW_H, background: gone ? TINT.removed : fresh ? TINT.added : undefined, color: gone ? REMOVED_INK : fresh ? ADDED_INK : undefined }}
        title={shifted ? `↕ ${y.b + 1} → ${y.a + 1}` : undefined}
      >
        {shifted && <ArrowUpDown size={10} className="shrink-0 text-fg-3" />}
        <span translate="no" className={cx(gone && 'line-through')}>
          {y ? (y.a >= 0 ? y.a + 1 : y.b + 1) : lastRow + 2 + (i - rows.length)}
        </span>
      </div>,
    );
    for (let j = c0; j < c1; j++) {
      const x = cols[j];
      if (!y || !x) continue;
      let wb: Workbook | null = null;
      let calc: Calc | null = null;
      let si = -1;
      let r = -1;
      let c = -1;
      if (y.a >= 0 && x.a >= 0 && sa) {
        wb = after;
        calc = calcA;
        si = t.ai;
        r = y.a;
        c = x.a;
      } else if (y.b >= 0 && x.b >= 0 && sb) {
        wb = before;
        calc = calcB;
        si = t.bi;
        r = y.b;
        c = x.b;
      }
      const removed = y.a < 0 || x.a < 0 || t.status === 'removed';
      const added = !removed && (y.b < 0 || x.b < 0 || t.status === 'added');
      const mark = !removed && !added && wb === after ? marks.get(r * 100_000 + c) : undefined;
      const cell = wb && si >= 0 ? cellOf(wb, si, r, c) : undefined;
      // Spilled cells show their values too: the calculator is asked for every cell in view.
      const text = calc && si >= 0 ? shownOf(calc, si, r, c, cell ?? {}) : '';
      const bg = removed ? (text ? TINT.removed : TINT.removed.replace('0.17', '0.08')) : added ? (text ? TINT.added : TINT.added.replace('0.2)', '0.08)')) : mark ? TINT[mark] : undefined;
      const picked = focus && focus.row === i && focus.col === j;
      if (!text && !bg && !picked) continue;
      const v = wb && si >= 0 && calc ? calc.value(si, r, c) : null;
      cells.push(
        <div
          key={`${i}:${j}`}
          onClick={() => onCell(i, j)}
          className={cx('absolute cursor-default truncate border-r border-b border-line px-1.5 leading-[23px]', removed && 'line-through decoration-1', picked && 'z-10 outline-2 -outline-offset-1 outline-accent')}
          style={{
            top: i * ROW_H,
            left: lefts[j],
            width: widths[j],
            height: ROW_H,
            background: bg,
            color: removed ? 'var(--fg-3)' : undefined,
            textAlign: cell?.s?.align ?? (typeof v === 'number' ? 'right' : 'left'),
            fontWeight: cell?.s?.b ? 600 : undefined,
            fontStyle: cell?.s?.i ? 'italic' : undefined,
          }}
        >
          {text}
        </div>,
      );
    }
  }

  const totalW = lefts[nCols];
  const totalH = nRows * ROW_H;
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-bg text-[12.5px] text-fg" translate="no">
      <div className="absolute top-0 left-0 z-20 border-r border-b border-line bg-panel" style={{ width: HEAD_W, height: HEAD_H }} />
      <div className="absolute top-0 right-0 z-10 overflow-hidden border-b border-line bg-panel text-fg-3" style={{ left: HEAD_W, height: HEAD_H }}>
        <div className="relative h-full" style={{ width: totalW, transform: `translateX(${-view.left}px)` }}>
          {colHeads}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 z-10 overflow-hidden border-r border-line bg-panel text-fg-3" style={{ top: HEAD_H, width: HEAD_W }}>
        <div className="relative w-full" style={{ height: totalH, transform: `translateY(${-view.top}px)` }}>
          {rowHeads}
        </div>
      </div>
      <div
        ref={box}
        className="absolute right-0 bottom-0 overflow-auto"
        style={{ top: HEAD_H, left: HEAD_W }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setView((v) => ({ ...v, top: el.scrollTop, left: el.scrollLeft }));
        }}
      >
        <div className="relative" style={{ width: totalW, height: totalH }}>
          {cells}
        </div>
      </div>
    </div>
  );
}
