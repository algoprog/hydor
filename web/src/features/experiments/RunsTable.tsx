// Runs as a table, as Weights & Biases' runs table is: a row per run with its name and status, a column per metric
// (its last value, the best in the column in bold) and per hyperparameter, how long it ran and when it started. A
// header click sorts; the box at the left picks runs; the name stays in view when the table is scrolled sideways.
// The Columns menu chooses which metrics and hyperparameters show.
import { useMemo, useRef, useState } from 'react';
import { Columns3, Search } from 'lucide-react';
import type { RunRecord } from '@shared/experiments';
import { betterOf } from '@shared/experiments';
import { LOCALE } from '../../i18n/locale';
import { timeAgo } from '../../lib/format';
import { Button, cx, inputCls, MenuItem, MenuLabel, MenuSep, Popover } from '../../components/ui';
import { metricsLine, metricsOf, num, progressOf, rankMetrics, statusTone, statusWords, took } from './api';
import { allParams, differingParams, paramsOf, paramText, runKey, runtimeOf, tableMetricsOf, tableParamsOf } from './analysis';

/** The columns a runs table shows besides its fixed ones: metrics (each run's last value) and hyperparameters. */
export interface RunsColumns {
  metrics: string[];
  params: string[];
}

/** How the table is sorted: by 'name' | 'status' | 'runtime' | 'started' | 'experiment' | `m:${metric}` | `p:${param}`, 1 up or -1 down; null: the queue's order. */
export type RunsSort = { by: string; dir: 1 | -1 } | null;

/** The columns an experiment shows at first: the metrics that say most about its runs (tableMetricsOf, 4) and the hyperparameters that differ between them (tableParamsOf, 6). */
export function defaultColumns(runs: RunRecord[]): RunsColumns {
  let metrics = tableMetricsOf(runs, 4);
  // An experiment whose metrics all look like bookkeeping still shows its first two, so the table is not bare.
  if (!metrics.length) metrics = rankMetrics(metricsOf(runs), repeatedIn(runs)).slice(0, 2);
  return { metrics, params: tableParamsOf(runs, 6) };
}

/** Whether any run read the metric more than once (a curve). */
function repeatedIn(runs: RunRecord[]): (k: string) => boolean {
  const rep = new Set<string>();
  for (const r of runs) for (const k of r.metrics?.repeated ?? []) rep.add(k);
  return (k) => rep.has(k);
}

const FULL_DATE: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };

/** A run's status in a few words for a narrow cell: "Running 54%" is built by the cell, so this is "Running". */
function statusLabel(r: RunRecord): string {
  if (r.status === 'running' || r.status === 'starting') return r.stopping ? 'Stopping' : r.status === 'starting' ? 'Starting' : 'Running';
  if (r.status === 'lost') return 'Went missing';
  return statusWords(r);
}

/** "12 s", "4 min", "2 h 13 min"; "–" while a run waits. */
function runtimeWords(r: RunRecord): string {
  const ms = runtimeOf(r);
  if (ms === null) return '–';
  return ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : took(ms);
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The way a column sorts on its first click: metrics best first, runtime and start longest and latest first, the rest A to Z. */
function firstDir(by: string, runs: RunRecord[]): 1 | -1 {
  if (by.startsWith('m:')) {
    const m = by.slice(2);
    return betterOf(m, runs.find((r) => r.better?.[m])?.better) === 'min' ? 1 : -1;
  }
  return by === 'runtime' || by === 'started' ? -1 : 1;
}

const TH = 'border-b border-line px-3 py-1.5 text-left font-medium text-fg-3';

export function RunsTable(props: {
  runs: RunRecord[];
  columns: RunsColumns;
  /** The Experiment column, with this text for each run (the Overview's table, across experiments). */
  experiment?: (r: RunRecord) => string | null;
  /** A Key metrics column (metricsLine) in place of a column per metric (across experiments). */
  summary?: boolean;
  /** A Where column, when runs are in more than one place. */
  where?: (r: RunRecord) => string | null;
  /** The run's colour on the charts, when it is shown there. */
  colorOf?: (r: RunRecord) => string | undefined;
  picked: Set<string>;
  onPick: (r: RunRecord) => void;
  onPickAll?: (rs: RunRecord[], on: boolean) => void;
  onOpen: (r: RunRecord) => void;
  sort: RunsSort;
  onSort: (s: RunsSort) => void;
  /** Rows before "Show N more" (50 unless given). */
  limit?: number;
}) {
  const { runs, columns, experiment, summary, where, colorOf, picked, onPick, onPickAll, onOpen, sort, onSort } = props;
  const [all, setAll] = useState(false);
  const limit = props.limit ?? 50;

  const metrics = summary ? [] : columns.metrics;
  const params = summary ? [] : columns.params;

  const rows = useMemo(() => {
    if (!sort) return runs;
    const by = sort.by;
    const get = (r: RunRecord): number | string | null => {
      if (by === 'name') return r.name ?? r.id;
      if (by === 'status') return statusWords(r);
      if (by === 'runtime') return runtimeOf(r);
      if (by === 'started') return r.startedAt ?? null;
      if (by === 'experiment') return experiment?.(r) ?? null;
      if (by.startsWith('m:')) {
        const v = r.metrics?.last?.[by.slice(2)];
        return finite(v) ? v : null;
      }
      if (by.startsWith('p:')) {
        const v = paramsOf(r)[by.slice(2)];
        return v === undefined ? null : typeof v === 'number' ? v : paramText(v);
      }
      return null;
    };
    const items = runs.map((r, i) => ({ r, i, v: get(r) }));
    items.sort((a, b) => {
      // A run with no value goes last whichever way it is sorted.
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1;
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v), undefined, { numeric: true });
      return c * sort.dir || a.i - b.i;
    });
    return items.map((x) => x.r);
  }, [runs, sort, experiment]);

  // The best value in each metric column, when two runs or more have it.
  const bests = useMemo(() => {
    const out: Record<string, number | undefined> = {};
    for (const m of metrics) {
      const vals = runs.map((r) => r.metrics?.last?.[m]).filter(finite);
      if (vals.length < 2) continue;
      out[m] = betterOf(m, runs.find((r) => r.better?.[m])?.better) === 'min' ? Math.min(...vals) : Math.max(...vals);
    }
    return out;
  }, [runs, metrics]);

  const shown = all ? rows : rows.slice(0, limit);
  const more = rows.length - shown.length;
  const nPicked = rows.filter((r) => picked.has(runKey(r))).length;
  const headRef = useRef<HTMLInputElement>(null);
  if (headRef.current) headRef.current.indeterminate = nPicked > 0 && nPicked < rows.length;

  const click = (by: string) => {
    const first = firstDir(by, runs);
    if (!sort || sort.by !== by) onSort({ by, dir: first });
    else if (sort.dir === first) onSort({ by, dir: first === 1 ? -1 : 1 });
    else onSort(null);
  };
  // A function (not a component) so a click does not remount the buttons.
  const sortBtn = (by: string, children: React.ReactNode, right?: boolean, own?: boolean) => (
    <button type="button" onClick={() => click(by)} className={cx('inline-flex max-w-[200px] items-center gap-1 rounded px-0.5 hover:text-fg', sort?.by === by && 'text-fg', right && 'flex-row-reverse')} title={own ? by.slice(2) : undefined}>
      <span className="truncate" translate={own ? 'no' : undefined}>
        {children}
      </span>
      {sort?.by === by && <span className="shrink-0">{sort.dir === 1 ? '↑' : '↓'}</span>}
    </button>
  );

  const nRun = 2 + (experiment ? 1 : 0) + (where ? 1 : 0);
  const cellBg = (p: boolean) => (p ? 'bg-accent-soft' : 'bg-panel group-hover:bg-bg-1');
  const colSpan = nRun + (summary ? 1 : metrics.length) + params.length + 2 + 1;

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel">
      <table className="w-max min-w-full border-separate border-spacing-0 text-[12.5px] whitespace-nowrap">
        <thead>
          <tr className="text-[11px] text-fg-3">
            <th className="sticky left-0 z-[3] w-9 min-w-9 bg-panel" />
            <th colSpan={nRun} className="bg-panel px-3 pt-2 text-left font-normal">
              Run
            </th>
            {(summary || metrics.length > 0) && (
              <th colSpan={summary ? 1 : metrics.length} className="border-l border-line bg-panel px-3 pt-2 text-left font-normal">
                Metrics · last value
              </th>
            )}
            {params.length > 0 && (
              <th colSpan={params.length} className="border-l border-line bg-panel px-3 pt-2 text-left font-normal">
                Hyperparameters
              </th>
            )}
            <th colSpan={2} className="border-l border-line bg-panel" />
          </tr>
          <tr>
            <th className={cx(TH, 'sticky left-0 z-[3] w-9 min-w-9 bg-panel !px-0 text-center')}>
              {onPickAll && (
                <label className="flex h-8 w-9 cursor-pointer items-center justify-center">
                  <input ref={headRef} type="checkbox" checked={rows.length > 0 && nPicked === rows.length} onChange={() => onPickAll(rows, nPicked !== rows.length)} aria-label="Pick every run shown" className="accent-[var(--accent)]" />
                </label>
              )}
            </th>
            <th className={cx(TH, 'sticky left-0 z-[3] bg-panel sm:left-9')}>
              {sortBtn('name', 'Name')}
            </th>
            <th className={TH}>
              {sortBtn('status', 'Status')}
            </th>
            {experiment && (
              <th className={TH}>
                {sortBtn('experiment', 'Experiment')}
              </th>
            )}
            {where && <th className={TH}>Where</th>}
            {summary && <th className={cx(TH, 'border-l border-line')}>Key metrics</th>}
            {metrics.map((m, i) => (
              <th key={m} className={cx(TH, 'text-right', i === 0 && 'border-l border-line')}>
                {sortBtn(`m:${m}`, m, true, true)}
              </th>
            ))}
            {params.map((p, i) => (
              <th key={p} className={cx(TH, i === 0 && 'border-l border-line')}>
                {sortBtn(`p:${p}`, p, false, true)}
              </th>
            ))}
            <th className={cx(TH, 'border-l border-line text-right')}>
              {sortBtn('runtime', 'Runtime', true)}
            </th>
            <th className={cx(TH, 'text-right')}>
              {sortBtn('started', 'Started', true)}
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const k = runKey(r);
            const p = picked.has(k);
            const prog = progressOf(r);
            const color = colorOf?.(r);
            const exp = experiment?.(r);
            const cell = cx('border-b border-line px-3 py-2', cellBg(p));
            const started = r.startedAt;
            return (
              <tr key={k} onClick={() => onOpen(r)} className="group cursor-pointer">
                <td className={cx('border-b border-line sm:sticky sm:left-0 sm:z-[1]', cellBg(p))} onClick={(e) => e.stopPropagation()}>
                  <label className="flex h-9 w-9 cursor-pointer items-center justify-center">
                    <input type="checkbox" checked={p} onChange={() => onPick(r)} aria-label="Pick this run" className="accent-[var(--accent)]" />
                  </label>
                </td>
                <td className={cx(cell, 'sticky left-0 z-[1] sm:left-9')}>
                  <span className="flex items-center gap-2">
                    {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
                    <button type="button" translate="no" title={r.name ?? r.id} className="max-w-[180px] truncate text-left font-medium text-fg sm:max-w-[300px]">
                      {r.name ?? r.id}
                    </button>
                  </span>
                </td>
                <td className={cell} title={r.why}>
                  <span className="inline-flex items-center gap-1.5 text-fg-2">
                    <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', statusTone(r.status))} />
                    <span>{statusLabel(r)}</span>
                    {prog && <span className="tnum">{prog.pct}%</span>}
                  </span>
                </td>
                {experiment && (
                  <td className={cell}>
                    {exp ? (
                      <span translate="no" title={exp} className="block max-w-[220px] truncate text-fg-2">
                        {exp}
                      </span>
                    ) : (
                      <span className="text-fg-3">–</span>
                    )}
                  </td>
                )}
                {where && (
                  <td className={cell}>
                    <span className="text-fg-2">{where(r) ?? '–'}</span>
                  </td>
                )}
                {summary && (
                  <td className={cell}>
                    <span translate="no" className="tnum block max-w-[300px] truncate text-fg-2">
                      {metricsLine(r) || '–'}
                    </span>
                  </td>
                )}
                {metrics.map((m) => {
                  const v = r.metrics?.last?.[m];
                  const isBest = finite(v) && bests[m] === v;
                  return (
                    <td key={m} className={cx(cell, 'tnum text-right', isBest ? 'font-semibold text-fg' : 'text-fg-2')} title={isBest ? 'The best of these runs' : undefined}>
                      {finite(v) ? num(v) : '–'}
                    </td>
                  );
                })}
                {params.map((pk) => {
                  const t = paramText(paramsOf(r)[pk]);
                  return (
                    <td key={pk} className={cell}>
                      <span translate="no" title={t} className="block max-w-[180px] truncate font-mono text-[12px] text-fg-2">
                        {t}
                      </span>
                    </td>
                  );
                })}
                <td className={cx(cell, 'tnum text-right text-fg-2')}>{runtimeWords(r)}</td>
                <td className={cx(cell, 'tnum text-right text-fg-2')} title={started ? new Date(started).toLocaleString(LOCALE, FULL_DATE) : undefined}>
                  {started ? timeAgo(started) : '–'}
                </td>
              </tr>
            );
          })}
          {!shown.length && (
            <tr>
              <td colSpan={colSpan} className="px-3 py-6 text-center text-[13px] text-fg-3">
                No run is like that.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {more > 0 && (
        <div className="sticky left-0 border-t border-line">
          <button type="button" onClick={() => setAll(true)} className="h-9 w-full text-[12.5px] text-fg-3 hover:bg-bg-1 hover:text-fg-2">
            {`Show ${more} more`}
          </button>
        </div>
      )}
    </div>
  );
}

/** The Columns button and its menu: tick the metrics and hyperparameters to show, with a box to find one, and Reset. */
export function ColumnsMenu(props: { runs: RunRecord[]; columns: RunsColumns; onChange: (c: RunsColumns) => void; onReset: () => void }) {
  const { runs, columns, onChange, onReset } = props;
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState('');
  const metrics = useMemo(() => rankMetrics(metricsOf(runs), repeatedIn(runs)), [runs]);
  const params = useMemo(() => allParams(runs), [runs]);
  const differs = useMemo(() => new Set(differingParams(runs)), [runs]);
  const words = find.trim().toLowerCase();
  const match = (k: string) => !words || k.toLowerCase().includes(words);
  const metricsShown = metrics.filter(match);
  const paramsShown = params.filter(match);

  // The columns keep the order the lists have; ones no run has any more stay at the end.
  const toggle = (kind: 'metrics' | 'params', k: string) => {
    const list = kind === 'metrics' ? metrics : params;
    const on = new Set(columns[kind]);
    if (on.has(k)) on.delete(k);
    else on.add(k);
    const next = [...list.filter((x) => on.has(x)), ...columns[kind].filter((x) => on.has(x) && !list.includes(x))];
    onChange({ ...columns, [kind]: next });
  };

  return (
    <>
      <Button ref={ref} size="sm" variant="ghost" icon={<Columns3 size={14} />} onClick={() => setOpen((o) => !o)}>
        Columns
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={300} title="Columns" sheet>
        <div className="p-1.5">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
            <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a column" className={cx(inputCls, 'h-8 pl-8 text-[13px]')} />
          </div>
        </div>
        <div className="max-h-[min(420px,55dvh)] overflow-y-auto">
          {metricsShown.length > 0 && <MenuLabel>Metrics</MenuLabel>}
          {metricsShown.map((m) => (
            <MenuItem key={m} checked={columns.metrics.includes(m)} onClick={() => toggle('metrics', m)}>
              <span translate="no" className="truncate">
                {m}
              </span>
            </MenuItem>
          ))}
          {paramsShown.length > 0 && <MenuLabel>Hyperparameters</MenuLabel>}
          {paramsShown.map((p) => (
            <MenuItem key={p} checked={columns.params.includes(p)} hint={differs.has(p) ? 'Differs' : undefined} onClick={() => toggle('params', p)}>
              <span translate="no" className="truncate">
                {p}
              </span>
            </MenuItem>
          ))}
          {!metricsShown.length && !paramsShown.length && <p className="px-3 py-3 text-[12.5px] text-fg-3">Nothing like that.</p>}
        </div>
        <MenuSep />
        <MenuItem
          onClick={() => {
            setFind('');
            onReset();
          }}
        >
          Reset
        </MenuItem>
      </Popover>
    </>
  );
}
