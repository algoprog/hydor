// The answer UIs for numbers: their views, by name (shared/answer-ui/data.ts has what each takes).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpNarrowWide, Check, ChevronLeft, Download, Search, Table2 } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { ChartTable, niceTicks, PieChart, RadarChart, ScatterChart, Sparkline, useWidth, XYChart, type ScatterPoint, type XYKind } from '../charts';
import {
  arr,
  Card,
  Chip,
  compact,
  Copy,
  Delta,
  download,
  fmtDate,
  fmtMinutes,
  fmtMoney,
  fmtNum,
  Head,
  isObj,
  LinkOut,
  MapBox,
  mapPoints,
  Md,
  Meter,
  More,
  num,
  obj,
  parseDate,
  Pic,
  PlotBox,
  pct,
  Seg,
  seriesColor,
  Stars,
  str,
  textOf,
  TONE_FILL,
  toneOf,
  useKept,
  usePicOk,
  withUnit,
  yes,
  type AnswerUiView,
  type Data,
  type Tone,
} from '../kit';

/** A chart's source line: "Source: NOAA" with its link. */
export function SourceLine({ source }: { source: unknown }) {
  const s = isObj(source) ? source : { name: str(source) };
  if (!str(s.name)) return null;
  return (
    <div className="mt-2 text-[11.5px] text-fg-3">
      {tr('Source')}:{' '}
      {str(s.url) ? (
        <LinkOut url={s.url} className="text-[11.5px]">
          {str(s.name)}
        </LinkOut>
      ) : (
        str(s.name)
      )}
    </div>
  );
}

const XY = new Set(['line', 'area', 'bar', 'stacked-bar', 'hbar']);

function Chart({ data }: { data: Data }) {
  const [asTable, setAsTable] = useState(false);
  const kind = str(data.kind).toLowerCase().replace(/\s+/g, '-') || 'line';
  const x = arr(data.x).map((v) => str(v));
  const series = arr(data.series)
    .filter(isObj)
    .map((s, i) => ({ name: str(s.name) || `${tr('Series')} ${i + 1}`, raw: arr(s.values ?? s.data), values: arr(s.values ?? s.data).map((v) => num(v)) }));
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const tableable = kind !== 'scatter' && series.length > 0;
  let body: React.ReactNode = null;
  if (kind === 'pie' || kind === 'donut') body = <PieChart labels={x} values={series[0]?.values ?? []} donut={kind === 'donut'} unit={unit} prefix={prefix} />;
  else if (kind === 'scatter' || kind === 'bubble')
    body = (
      <ScatterChart
        series={series.map((s) => ({
          name: s.name,
          points: s.raw
            .map((p): ScatterPoint | null => {
              const o = isObj(p) ? p : Array.isArray(p) ? { x: p[0], y: p[1] } : {};
              const px = num(o.x);
              const py = num(o.y);
              return px === null || py === null ? null : { x: px, y: py, label: str(o.label ?? o.name) || undefined, size: num(o.size) ?? undefined };
            })
            .filter((p): p is ScatterPoint => !!p),
        }))}
        unit={unit}
        prefix={prefix}
        xLabel={str(data.x_label) || undefined}
        yLabel={str(data.y_label) || undefined}
      />
    );
  else if (kind === 'radar') body = <RadarChart axes={x} series={series} max={num(data.max)} unit={unit} />;
  else
    body = (
      <XYChart
        kind={(XY.has(kind) ? kind : kind === 'column' ? 'bar' : kind === 'stacked' ? 'stacked-bar' : 'line') as XYKind}
        x={x}
        series={series}
        unit={unit}
        prefix={prefix}
        min={num(data.min)}
        marks={arr(data.marks)
          .filter(isObj)
          .map((m) => ({ x: str(m.x), label: str(m.label) }))}
        yLabel={str(data.y_label) || undefined}
        xLabel={str(data.x_label) || undefined}
        height={kind === 'hbar' ? undefined : 250}
      />
    );
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          tableable ? (
            <button type="button" onClick={() => setAsTable((t) => !t)} title={asTable ? tr('Show the chart') : tr('Show as a table')} aria-label={asTable ? tr('Show the chart') : tr('Show as a table')} className={cx('grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-bg-2', asTable ? 'bg-bg-2 text-fg' : 'text-fg-3')}>
              <Table2 size={14} />
            </button>
          ) : undefined
        }
      />
      {asTable ? <ChartTable x={x} series={series} unit={unit} prefix={prefix} /> : body}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
      <SourceLine source={data.source} />
    </Card>
  );
}

// ---- a data table ----------------------------------------------------------------------------------------------------

interface Col {
  key: string;
  label: string;
  type: string;
  unit: string;
  currency: string;
}

const NUMERIC = new Set(['number', 'money', 'percent', 'bar', 'rating']);
const PAGE = 25;

function cellText(c: Col, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (c.type === 'money') return fmtMoney(num(v), c.currency) || str(v);
  if (c.type === 'percent') return num(v) !== null ? pct(num(v), 1) : str(v);
  if (c.type === 'number' || c.type === 'bar') return num(v) !== null ? withUnit(num(v), c.unit) : str(v);
  if (c.type === 'date') return fmtDate(v);
  if (typeof v === 'boolean') return v ? tr('Yes') : tr('No');
  return str(v);
}

/** A picture in a cell; a dash when it cannot be shown. */
function CellPic({ v }: { v: unknown }) {
  const ok = usePicOk(v);
  return (
    <>
      <Pic src={v} className="h-10 w-10 rounded-md" />
      {!ok && <span className="text-fg-3">—</span>}
    </>
  );
}

function TableCell({ c, v, max }: { c: Col; v: unknown; max: number }) {
  if (v === null || v === undefined || v === '') return <span className="text-fg-3">—</span>;
  switch (c.type) {
    case 'link':
      return <LinkOut url={v}>{/^https?:/i.test(str(v)) ? undefined : str(v)}</LinkOut>;
    case 'image':
      return <CellPic v={v} />;
    case 'tag':
      return <Chip tone={toneOf(v)}>{str(v)}</Chip>;
    case 'rating':
      return <Stars value={v} />;
    case 'bar': {
      const n = num(v);
      return (
        <span className="flex min-w-[120px] items-center gap-2">
          <span className="w-14 shrink-0 text-right tabular-nums">{cellText(c, v)}</span>
          <Meter value={n ?? 0} max={max || 1} className="flex-1" thin />
        </span>
      );
    }
    case 'md':
      return <Md text={v} inline />;
    default:
      return <>{cellText(c, v)}</>;
  }
}

function DataTable({ data, done }: { data: Data; done: boolean }) {
  const cols: Col[] = useMemo(() => {
    const given: Data[] = arr(data.columns).map((c) => (isObj(c) ? c : { key: str(c), label: str(c) }));
    const rows = arr(data.rows).filter(isObj);
    const list: Data[] = given.length ? given : Object.keys(rows[0] ?? {}).map((k) => ({ key: k, label: k }));
    return list.map((c) => ({ key: str(c.key ?? c.label), label: str(c.label ?? c.key), type: str(c.type).toLowerCase() || 'text', unit: str(c.unit), currency: str(c.currency) }));
  }, [data.columns, data.rows]);
  const rows = arr(data.rows).filter(isObj);
  const first = str(data.sort);
  const [sort, setSort] = useState<{ key: string; down: boolean } | null>(first ? { key: first.replace(/^-/, ''), down: first.startsWith('-') } : null);
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const maxOf = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, Math.max(0, ...rows.map((r) => num(r[c.key]) ?? 0))])), [cols, rows]);
  const shown = useMemo(() => {
    let list = rows;
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((r) => cols.some((c) => cellText(c, r[c.key]).toLowerCase().includes(t)));
    if (sort && done) {
      const c = cols.find((x) => x.key === sort.key);
      const numeric = c && NUMERIC.has(c.type);
      list = [...list].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        const nx = num(x);
        const ny = num(y);
        const r = numeric || (nx !== null && ny !== null) ? (nx ?? -Infinity) - (ny ?? -Infinity) : str(x).localeCompare(str(y), undefined, { numeric: true });
        return sort.down ? -r : r;
      });
    }
    return list;
  }, [rows, cols, q, sort, done]);
  const totals = arr(data.totals).map(str);
  const csv = () => [cols.map((c) => c.label), ...shown.map((r) => cols.map((c) => (c.type === 'number' || c.type === 'money' || c.type === 'percent' ? str(r[c.key]) : cellText(c, r[c.key]))))].map((line) => line.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(',')).join('\n');
  const page = all ? shown : shown.slice(0, PAGE);
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3.5 pb-2 @lg:px-5">
        <div className="min-w-0 flex-1">{str(data.title) && <h3 className="aui-h3">{str(data.title)}</h3>}</div>
        {rows.length > 8 && (
          <label className="relative">
            <Search size={13} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Filter')} className="h-7 w-36 rounded-md border border-line bg-bg-1 pr-2 pl-7 text-[12.5px] outline-none focus:border-accent" />
          </label>
        )}
        {done && (
          <span className="flex items-center">
            <Copy text={csv} label={tr('Copy as CSV')} />
            <button type="button" onClick={() => download(`${(str(data.title) || 'table').replace(/[^\w.-]+/g, '-').slice(0, 60)}.csv`, 'text/csv', csv())} title={tr('Download CSV')} aria-label={tr('Download CSV')} className="inline-flex h-6 w-6 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg">
              <Download size={13} />
            </button>
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line bg-bg-1">
              {cols.map((c) => {
                const on = sort?.key === c.key;
                const right = NUMERIC.has(c.type) && c.type !== 'bar' && c.type !== 'rating';
                return (
                  <th key={c.key} className={cx('px-3 py-1.5 font-medium whitespace-nowrap text-fg-3 first:pl-4 last:pr-4 @lg:first:pl-5 @lg:last:pr-5', right ? 'text-right' : 'text-left')} aria-sort={on ? (sort!.down ? 'descending' : 'ascending') : undefined}>
                    <button type="button" onClick={() => setSort(on ? { key: c.key, down: !sort!.down } : { key: c.key, down: NUMERIC.has(c.type) })} className={cx('inline-flex items-center gap-1 hover:text-fg', on && 'text-fg')}>
                      {c.label}
                      {on && (sort!.down ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {page.map((r, i) => (
              <tr key={i} className="border-b border-line/60 last:border-b-0 hover:bg-bg-1/60">
                {cols.map((c) => (
                  <td key={c.key} className={cx('px-3 py-1.5 align-middle first:pl-4 last:pr-4 @lg:first:pl-5 @lg:last:pr-5', NUMERIC.has(c.type) && c.type !== 'bar' && c.type !== 'rating' && 'text-right whitespace-nowrap tabular-nums')}>
                    <TableCell c={c} v={r[c.key]} max={maxOf[c.key] ?? 0} />
                  </td>
                ))}
              </tr>
            ))}
            {totals.length > 0 && done && (
              <tr className="border-t-2 border-line bg-bg-1 font-semibold">
                {cols.map((c, ci) => {
                  const sum = totals.includes(c.key) ? shown.reduce((m, r) => m + (num(r[c.key]) ?? 0), 0) : null;
                  return (
                    <td key={c.key} className={cx('px-3 py-1.5 first:pl-4 last:pr-4 @lg:first:pl-5 @lg:last:pr-5', sum !== null && 'text-right tabular-nums')}>
                      {sum !== null ? cellText({ ...c, type: c.type === 'bar' ? 'number' : c.type }, sum) : ci === 0 ? tr('Total') : ''}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {(shown.length > PAGE && !all) || str(data.note) || q ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px] text-fg-3 @lg:px-5">
          {shown.length > PAGE && !all && (
            <button type="button" onClick={() => setAll(true)} className="font-medium hover:text-fg">
              {tr('Show all {0} rows').replace('{0}', fmtNum(shown.length))}
            </button>
          )}
          {q && <span>{tr('{0} of {1} rows').replace('{0}', fmtNum(shown.length)).replace('{1}', fmtNum(rows.length))}</span>}
          {str(data.note) && <Md text={data.note} inline className="min-w-0 flex-1 text-fg-2" />}
        </div>
      ) : null}
    </Card>
  );
}

// ---- what the UIs of numbers, money and the sky share --------------------------------------------------------------

/** Units that follow a number without a space: signs and symbols ("%", "°", "×", "′"), or one written with its space. */
const GLUED = /^[%°′″‰×]|^\s/;
const SIGN = /^[%°′″‰×]/;

/** A number with what goes before and after it: "$1,250", "60×", "42 km", "−$12". */
export function numText(n: number | null | undefined, unit = '', prefix = '', o?: Intl.NumberFormatOptions): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const v = fmtNum(Math.abs(n), o);
  const u = str(unit);
  return `${n < 0 && v !== fmtNum(0, o) ? '−' : ''}${str(prefix)}${v}${u ? (GLUED.test(u) ? u : `\u202f${u}`) : ''}`;
}

/** A share as a percentage: 0.364 as 36%, under 10% with a decimal. */
export const shareText = (x: number) => `${fmtNum(x * 100, { maximumFractionDigits: Math.abs(x) < 0.1 ? 1 : 0 })}%`;

/** A currency's sign ("$", "€"), or what was given when it is not a code. */
export function currencySign(c: unknown): string {
  const code = str(c).trim();
  if (!/^[A-Za-z]{3}$/.test(code)) return code;
  try {
    return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: code.toUpperCase(), currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

/** A step a slider over `range` moves by: a round number, about a two-hundredth of it. */
export function niceStep(range: number): number {
  if (!(range > 0)) return 1;
  const raw = range / 200;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 2 ? 1 : f < 5 ? 2 : 5) * p;
}

/** The width of an element, as it changes, even when the element comes later than the first draw (charts.tsx's useWidth). */
export const useBoxWidth = useWidth;

/** A tooltip over a drawing: what it is about, then each value (strong) with its swatch and name. */
export function HoverTip({ x, y, width, title, rows }: { x: number; y: number; width: number; title?: string; rows: { color?: string; name?: string; value: string }[] }) {
  const left = Math.min(Math.max(4, x + 12), Math.max(4, width - 200));
  return (
    <div className="pointer-events-none absolute z-10 max-w-[260px] min-w-[110px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-pop" style={{ left, top: Math.max(0, y) }}>
      {title && <div className="mb-0.5 truncate text-[11.5px] text-fg-3">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 whitespace-nowrap">
          {r.color && <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />}
          <span className="font-semibold text-fg tabular-nums">{r.value}</span>
          {r.name && <span className="truncate text-fg-3">{r.name}</span>}
        </div>
      ))}
    </div>
  );
}

const plain = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '');

/** A box to type a number in: keeps what is being typed ("1.", "") until it is one. */
export function NumBox({ value, onChange, disabled, label, className, write = plain, bare }: { value: number; onChange: (v: number) => void; disabled?: boolean; label?: string; className?: string; write?: (v: number) => string; bare?: boolean }) {
  const [text, setText] = useState(write(value));
  useEffect(() => setText((t) => (Math.abs((num(t) ?? NaN) - value) <= 1e-9 * Math.max(1, Math.abs(value)) ? t : write(value))), [value]);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        const n = num(e.target.value);
        if (n !== null) onChange(n);
      }}
      onBlur={() => setText(write(value))}
      className={cx('min-w-0 font-semibold tabular-nums outline-none disabled:opacity-70', bare ? 'bg-transparent p-0' : 'rounded-md border border-line bg-bg-1 px-2 py-0.5 text-right text-[13px] focus:border-accent', className)}
    />
  );
}

/** A slider with its label and its value, written out or in a box to type it (with what goes before and after it). */
export function SliderRow({ label, value, min, max, step, onChange, disabled, text, box, prefix, unit }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean; text?: string; box?: boolean; prefix?: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex min-h-7 items-center justify-between gap-3 text-[13px]">
        <span className="min-w-0 text-fg-2">{label}</span>
        {box ? (
          <span className="flex shrink-0 items-center gap-1 text-fg-3">
            {prefix && <span className="text-[12.5px]">{prefix}</span>}
            <NumBox value={value} onChange={onChange} disabled={disabled} label={label} className="w-[5.5rem]" />
            {unit && <span className="text-[12.5px]">{unit}</span>}
          </span>
        ) : (
          <span className="shrink-0 font-semibold tabular-nums">{text}</span>
        )}
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} className="mt-0.5 block h-4 w-full cursor-pointer accent-[var(--accent)] disabled:cursor-default disabled:opacity-60" />
    </div>
  );
}

// ---- key figures ----------------------------------------------------------------------------------------------------

const STAT_COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-1 @md:grid-cols-3', 4: 'grid-cols-2 @2xl:grid-cols-4' };

function StatTile({ s }: { s: Data }) {
  const raw = s.value;
  const t = str(raw).trim();
  const n = typeof raw === 'number' ? num(raw) : /^[-+−]?[\d.,\s]+$/.test(t) ? num(t) : null;
  const unit = str(s.unit);
  const prefix = str(s.prefix);
  const trend = Array.isArray(s.trend) ? s.trend.map((v: unknown) => num(v)) : [];
  const good = str(s.good).toLowerCase();
  const cu = str(s.change_unit);
  const change = s.change !== undefined && s.change !== null && str(s.change) !== '';
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-bg-1 px-3.5 py-3">
      <div className="truncate text-[12.5px] text-fg-3">{textOf(s, 'label', 'name', 'title')}</div>
      <div className="mt-0.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 text-[22px] leading-tight font-semibold tracking-tight tabular-nums">
          {n !== null ? (
            <>
              {n < 0 ? '−' : ''}
              {prefix}
              {Math.abs(n) >= 1e6 ? compact(Math.abs(n)) : fmtNum(Math.abs(n))}
              {unit && (SIGN.test(unit) ? unit : <span className="ml-1 text-[14px] font-medium tracking-normal text-fg-3">{unit.trim()}</span>)}
            </>
          ) : (
            t || '—'
          )}
        </div>
        {trend.filter((v) => v !== null).length > 1 && <Sparkline values={trend} width={72} height={26} className="mb-1" />}
      </div>
      {(change || str(s.note)) && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-[12px] leading-snug">
          {change && <Delta value={s.change} unit={cu && !GLUED.test(cu) ? `\u202f${cu}` : cu} good={good === 'down' ? 'down' : good === 'none' || good === 'neutral' ? 'none' : 'up'} />}
          {str(s.note) && <span className="text-fg-3">{str(s.note)}</span>}
        </div>
      )}
    </div>
  );
}

function Stats({ data }: { data: Data }) {
  const stats = arr(data.stats ?? data.items).filter(isObj);
  const cols = STAT_COLS[stats.length] ?? (stats.length <= 6 ? 'grid-cols-2 @xl:grid-cols-3' : 'grid-cols-2 @xl:grid-cols-3 @2xl:grid-cols-4');
  return (
    <Card>
      <Head title={data.title} sub={data.period} />
      {stats.length > 0 && (
        <div className={cx('grid gap-2', cols)}>
          {stats.map((s, i) => (
            <StatTile key={i} s={s} />
          ))}
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a heatmap ------------------------------------------------------------------------------------------------------

/** A cell's colour: on one hue from the panel's tone to the full hue (t 0..1), or two hues either side of grey (t -1..1). */
function heatColor(t: number, diverging: boolean): string {
  if (diverging) return `color-mix(in oklab, ${t >= 0 ? 'var(--viz-1)' : 'var(--viz-2)'} ${Math.round(Math.min(1, Math.abs(t)) * 100)}%, var(--bg-3))`;
  return `color-mix(in oklab, var(--viz-1) ${Math.round(6 + Math.max(0, Math.min(1, t)) * 94)}%, var(--bg-1))`;
}

function Heatmap({ data }: { data: Data }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: number; c: number; x: number; y: number } | null>(null);
  const xs: string[] = Array.isArray(data.x) ? data.x.map((v: unknown) => str(v)) : [];
  const ys: string[] = Array.isArray(data.y) ? data.y.map((v: unknown) => str(v)) : [];
  const rows: (number | null)[][] = (Array.isArray(data.values) ? data.values : []).map((r: unknown) => (Array.isArray(r) ? r.map((v) => num(v)) : []));
  const nR = Math.max(ys.length, rows.length);
  const nC = rows.reduce((m, r) => Math.max(m, r.length), xs.length);
  const all = rows.flat().filter((v): v is number => v !== null);
  const diverging = yes(data.diverging);
  const unit = str(data.unit);
  const mid = num(data.mid) ?? 0;
  const lo = num(data.min) ?? (all.length ? all.reduce((m, v) => Math.min(m, v), Infinity) : 0);
  const hi = num(data.max) ?? (all.length ? all.reduce((m, v) => Math.max(m, v), -Infinity) : 1);
  const span = (diverging ? Math.max(Math.abs(hi - mid), Math.abs(mid - lo)) : hi - lo) || 1;
  const tOf = (v: number) => (diverging ? (v - mid) / span : (v - lo) / span);
  const labelW = Math.min(150, Math.max(36, ...ys.map((l) => l.length * 7.2 + 16)));
  const cellW = nC ? (width - labelW - nC * 2) / nC : 0;
  const showValues = nC > 0 && nC <= 12 && cellW >= 36;
  const cellH = showValues ? 34 : nR > 14 ? 20 : 26;
  const avg = xs.length ? xs.reduce((m, l) => m + l.length, 0) / xs.length : 1;
  const every = Math.max(1, Math.ceil((avg * 6.4 + 8) / Math.max(1, cellW)));
  const valueText = (v: number | null) => (v === null ? '—' : Math.abs(v) >= 10_000 ? `${compact(v)}${unit ? ` ${unit}` : ''}` : numText(v, unit));
  const cellNum = (v: number) => (Math.abs(v) >= 10_000 ? compact(v) : fmtNum(v));
  const stops = (diverging ? [-1, -0.5, 0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((t) => heatColor(t, diverging)).join(', ');
  const hv = hover ? (rows[hover.r]?.[hover.c] ?? null) : null;
  return (
    <Card>
      <Head title={data.title} />
      {nR > 0 && nC > 0 && (
        <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
          {width > 0 && (
            <div className="grid gap-[2px]" style={{ gridTemplateColumns: `${labelW}px repeat(${nC}, minmax(0, 1fr))` }}>
              {Array.from({ length: nR }, (_, r) => (
                <Fragment key={r}>
                  <div className={cx('truncate pr-2 text-right text-[12px]', hover?.r === r ? 'font-medium text-fg' : 'text-fg-2')} style={{ height: cellH, lineHeight: `${cellH}px` }}>
                    {ys[r] ?? ''}
                  </div>
                  {Array.from({ length: nC }, (_, c) => {
                    const v = rows[r]?.[c] ?? null;
                    const t = v === null ? 0 : tOf(v);
                    const on = hover?.r === r && hover.c === c;
                    return (
                      <div
                        key={c}
                        onPointerEnter={(e) => {
                          const el = e.currentTarget;
                          setHover({ r, c, x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop });
                        }}
                        className={cx('grid place-items-center overflow-hidden rounded-[3px] text-[11px] font-medium tabular-nums', on && 'outline-2 outline-offset-1 outline-fg')}
                        style={{ height: cellH, background: v === null ? 'var(--bg-2)' : heatColor(t, diverging), color: Math.abs(t) > 0.85 ? 'var(--panel)' : 'var(--fg)' }}
                      >
                        {showValues && v !== null ? cellNum(v) : ''}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
              <div />
              {Array.from({ length: nC }, (_, c) => (
                <div key={c} className={cx('truncate pt-0.5 text-center text-[11px]', hover?.c === c ? 'font-medium text-fg' : 'text-fg-3')}>
                  {c % every === 0 || hover?.c === c ? (xs[c] ?? '') : ''}
                </div>
              ))}
            </div>
          )}
          {hover && <HoverTip x={hover.x} y={hover.y - 50} width={width} title={[ys[hover.r], xs[hover.c]].filter(Boolean).join(' · ')} rows={[{ value: valueText(hv) }]} />}
        </div>
      )}
      {all.length > 0 && (
        <div className="mt-3 flex justify-end">
          <div className="w-44">
            <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${stops})` }} />
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-fg-3 tabular-nums">
              <span>{valueText(diverging ? mid - span : lo)}</span>
              {diverging && <span>{valueText(mid)}</span>}
              <span>{valueText(diverging ? mid + span : hi)}</span>
            </div>
          </div>
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-2 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a gauge --------------------------------------------------------------------------------------------------------

function Gauge({ data }: { data: Data }) {
  const min = num(data.min) ?? 0;
  const maxGiven = num(data.max) ?? 100;
  const max = maxGiven > min ? maxGiven : min + 1;
  const value = num(data.value);
  const unit = str(data.unit);
  const bands = arr(data.bands)
    .filter(isObj)
    .map((b) => ({ to: num(b.to), tone: toneOf(b.tone), label: str(b.label) }))
    .filter((b): b is { to: number; tone: Tone; label: string } => b.to !== null && b.to > min)
    .sort((a, b) => a.to - b.to)
    .map((b, i, all) => ({ ...b, from: i ? all[i - 1].to : min }));
  const f = (v: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  const at = value === null ? -1 : bands.findIndex((b) => value >= b.from && value <= b.to);
  const W = 248;
  const R = 92;
  const stroke = 16;
  const cx0 = W / 2;
  const cy0 = 122;
  const pt = (fr: number, r: number) => [cx0 + r * Math.cos(Math.PI * (1 - fr)), cy0 - r * Math.sin(Math.PI * (1 - fr))] as const;
  const arcPath = (f0: number, f1: number) => {
    const [x0, y0] = pt(f0, R);
    const [x1, y1] = pt(f1, R);
    return `M${x0.toFixed(2)},${y0.toFixed(2)}A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  };
  const gap = 2 / R / Math.PI;
  const band = at >= 0 ? bands[at] : null;
  return (
    <Card>
      <Head title={data.label ?? data.title} sub={data.sub} />
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        <div className="relative shrink-0" style={{ width: W, height: cy0 + 22 }} role="meter" aria-valuenow={value ?? undefined} aria-valuemin={min} aria-valuemax={max} aria-label={str(data.label)}>
          <svg width={W} height={cy0 + 22} aria-hidden>
            {(!bands.length || bands[bands.length - 1].to < max) && <path d={arcPath(bands.length ? f(bands[bands.length - 1].to) + gap : 0, 1)} fill="none" stroke="var(--bg-3)" strokeWidth={stroke} />}
            {bands.map((b, i) => {
              const f0 = f(b.from) + (i ? gap / 2 : 0);
              const f1 = f(b.to) - (i < bands.length - 1 ? gap / 2 : 0);
              return f1 > f0 ? <path key={i} d={arcPath(f0, f1)} fill="none" stroke={TONE_FILL[b.tone]} strokeOpacity={i === at ? 1 : 0.3} strokeWidth={stroke} /> : null;
            })}
            {!bands.length && value !== null && f(value) > 0 && <path d={arcPath(0, f(value))} fill="none" stroke="var(--viz-1)" strokeWidth={stroke} />}
            {bands.slice(0, -1).map((b, i) => {
              if (bands.length > 7 || b.to >= max) return null;
              const [x, y] = pt(f(b.to), R + stroke / 2 + 9);
              return (
                <text key={i} x={x} y={y} dy="0.35em" textAnchor="middle" className="fill-fg-3 text-[10.5px] tabular-nums">
                  {fmtNum(b.to)}
                </text>
              );
            })}
            <text x={cx0 - R} y={cy0 + 16} textAnchor="middle" className="fill-fg-3 text-[11px] tabular-nums">
              {fmtNum(min)}
            </text>
            <text x={cx0 + R} y={cy0 + 16} textAnchor="middle" className="fill-fg-3 text-[11px] tabular-nums">
              {fmtNum(max)}
            </text>
            {value !== null && (() => {
              const [x, y] = pt(f(value), R);
              return <circle cx={x} cy={y} r={9} fill="var(--panel)" stroke="var(--fg)" strokeWidth={2.5} />;
            })()}
          </svg>
          <div className="absolute inset-x-0 text-center leading-none" style={{ top: cy0 - 46 }}>
            <span className="text-[34px] font-semibold tracking-tight tabular-nums">{value !== null ? fmtNum(value) : '—'}</span>
            {unit && <span className={cx('text-[14px] font-medium text-fg-3', !SIGN.test(unit) && 'ml-1')}>{unit.trim()}</span>}
          </div>
          {band?.label && (
            <div className="absolute inset-x-0 flex justify-center" style={{ top: cy0 - 6 }}>
              <Chip tone={band.tone}>{band.label}</Chip>
            </div>
          )}
        </div>
        {bands.some((b) => b.label) && (
          <ul className="m-0 min-w-[200px] flex-1 list-none space-y-0.5 p-0">
            {bands.map((b, i) => (
              <li key={i} className={cx('flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px]', i === at ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2')}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TONE_FILL[b.tone], opacity: i === at ? 1 : 0.5 }} />
                <span className="min-w-0 flex-1">{b.label || '—'}</span>
                <span className="shrink-0 text-[11.5px] font-normal text-fg-3 tabular-nums">
                  {fmtNum(b.from)}–{fmtNum(b.to)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a funnel -------------------------------------------------------------------------------------------------------

function Funnel({ data }: { data: Data }) {
  const stages = arr(data.stages ?? data.steps ?? data.items)
    .filter(isObj)
    .map((s) => ({ name: textOf(s, 'name', 'label', 'stage', 'title'), value: num(s.value ?? s.count), note: str(s.note) }));
  const unit = str(data.unit);
  const firstAt = stages.findIndex((s) => s.value !== null);
  const first = firstAt >= 0 ? stages[firstAt].value : null;
  const top = stages.reduce((m, s) => Math.max(m, s.value ?? 0), 0);
  const kept = stages.map((s, i) => {
    const prev = i > 0 ? stages[i - 1].value : null;
    return prev && prev > 0 && s.value !== null ? s.value / prev : null;
  });
  let worst = -1;
  kept.forEach((k, i) => {
    if (k !== null && k < 1 && (worst < 0 || k < (kept[worst] as number))) worst = i;
  });
  const lastAt = stages.map((s) => s.value !== null).lastIndexOf(true);
  const overall = first && lastAt > firstAt ? (stages[lastAt].value as number) / first : null;
  return (
    <Card>
      <Head title={data.title} aside={overall !== null ? <span className="text-[12.5px] text-fg-3 tabular-nums">{tr('{0} overall').replace('{0}', shareText(overall))}</span> : undefined} />
      <div className="grid grid-cols-[minmax(0,32%)_minmax(0,1fr)_max-content] items-center gap-x-3">
        {stages.map((s, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <div className={cx('col-start-2 py-0.5 text-center text-[11.5px] tabular-nums', i === worst && stages.length > 2 ? 'font-medium text-warn' : 'text-fg-3')}>
                {kept[i] !== null && `↓ ${tr('{0} went on').replace('{0}', shareText(kept[i] as number))}`}
                {i === worst && stages.length > 2 && ` · ${tr('the biggest drop')}`}
              </div>
            )}
            <div className="col-start-1 min-w-0 text-[13px] leading-snug">
              <div className="font-medium">{s.name}</div>
              {s.note && <div className="text-[12px] text-fg-3">{s.note}</div>}
            </div>
            <div className="flex h-8 items-center justify-center">
              {s.value !== null && top > 0 && <div className="h-full rounded-[4px]" style={{ width: `${Math.max(0.5, (s.value / top) * 100)}%`, background: seriesColor(0) }} />}
            </div>
            <div className="text-right leading-tight">
              <div className="text-[13.5px] font-semibold tabular-nums">{numText(s.value, unit)}</div>
              {first !== null && first > 0 && s.value !== null && <div className="text-[11.5px] text-fg-3 tabular-nums">{shareText(s.value / first)}</div>}
            </div>
          </Fragment>
        ))}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- parts of a whole -----------------------------------------------------------------------------------------------

function Breakdown({ data }: { data: Data }) {
  const [hover, setHover] = useState<number | null>(null);
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const given = arr(data.parts ?? data.items ?? data.slices)
    .filter(isObj)
    .map((p) => ({ name: textOf(p, 'name', 'label', 'title'), value: num(p.value ?? p.amount) ?? 0, note: str(p.note), other: false }))
    .filter((p) => p.name && p.value > 0);
  const sum = given.reduce((m, p) => m + p.value, 0);
  const total = num(data.total);
  const parts = total !== null && total > sum * 1.0001 && given.length ? [...given, { name: tr('Other'), value: total - sum, note: '', other: true }] : given;
  const whole = parts.reduce((m, p) => m + p.value, 0);
  const bar = parts.length > 0 && parts.length <= 3;
  const swatch = (i: number) => (parts[i]?.other ? 'var(--line-2)' : parts.length > 8 && i >= 7 ? 'var(--fg-3)' : seriesColor(i));
  return (
    <Card>
      <Head title={data.title} aside={bar && whole > 0 ? <span className="text-[13px] font-semibold tabular-nums">{numText(whole, unit, prefix)}</span> : undefined} />
      {bar ? (
        <>
          <div className="flex h-8 w-full gap-[2px] overflow-hidden rounded-lg" role="img" aria-label={parts.map((p) => p.name).join(', ')}>
            {parts.map((p, i) => (
              <div key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className="h-full min-w-[3px] transition-opacity" style={{ flex: `${p.value} 1 0%`, background: swatch(i), opacity: hover === null || hover === i ? 1 : 0.45 }} />
            ))}
          </div>
          <ul className="m-0 mt-3 list-none space-y-0.5 p-0">
            {parts.map((p, i) => (
              <li key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className={cx('flex items-start gap-2.5 rounded-md px-1.5 py-1 text-[13.5px]', hover === i && 'bg-bg-2')}>
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: swatch(i) }} />
                <div className="min-w-0 flex-1">
                  <div>{p.name}</div>
                  {p.note && <div className="text-[12px] text-fg-3">{p.note}</div>}
                </div>
                <span className="font-medium tabular-nums">{numText(p.value, unit, prefix)}</span>
                <span className="w-12 text-right text-[12.5px] text-fg-3 tabular-nums">{whole ? shareText(p.value / whole) : ''}</span>
              </li>
            ))}
          </ul>
        </>
      ) : parts.length ? (
        <>
          <PieChart labels={parts.map((p) => p.name)} values={parts.map((p) => p.value)} donut unit={unit} prefix={prefix} />
          {parts.some((p) => p.note) && (
            <ul className="m-0 mt-3 list-none space-y-1 border-t border-line p-0 pt-3 text-[12.5px] text-fg-2">
              {parts.map((p, i) =>
                p.note ? (
                  <li key={i} className="flex gap-2">
                    <span className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px]" style={{ background: swatch(i) }} />
                    <span className="min-w-0">
                      <span className="font-medium text-fg">{p.name}</span>: {p.note}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </>
      ) : null}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
      <SourceLine source={data.source} />
    </Card>
  );
}

// ---- a Plotly figure ------------------------------------------------------------------------------------------------

function Plot({ data }: { data: Data }) {
  const fig = useMemo(() => (isObj(data.figure) ? data.figure : Array.isArray(data.data) ? { data: data.data, layout: obj(data.layout) } : {}), [data.figure, data.data, data.layout]);
  const height = Math.max(220, Math.min(800, num(data.height) ?? 380));
  return (
    <Card>
      <Head title={data.title} />
      <PlotBox figure={fig} height={height} />
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a calculator: its formulas read by a small parser of their own (never run as code) ------------------------------

type Ex = { k: 'n'; v: number } | { k: 'v'; name: string } | { k: 'neg'; a: Ex } | { k: 'pct'; a: Ex } | { k: 'op'; op: string; a: Ex; b: Ex } | { k: 'fn'; name: string; args: Ex[] };

const FNS: Record<string, (...a: number[]) => number> = {
  min: (...a) => (a.length ? Math.min(...a) : NaN),
  max: (...a) => (a.length ? Math.max(...a) : NaN),
  round: (x, d = 0) => {
    const p = 10 ** Math.round(d);
    return Math.round(x * p) / p;
  },
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  log: (x, b) => (b === undefined ? Math.log10(x) : Math.log(x) / Math.log(b)),
  log10: Math.log10,
  log2: Math.log2,
  ln: Math.log,
  exp: Math.exp,
  pow: (a, b) => a ** b,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  hypot: (...a) => Math.hypot(...a),
  sign: Math.sign,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** A formula's words: numbers, names, and the signs + - * / ^ ( ) , %; null when it has anything else. */
function formulaTokens(src: string): string[] | null {
  const s = src.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/\*\*/g, '^');
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) {
      i++;
      continue;
    }
    const rest = s.slice(i);
    const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(rest) ?? /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (m) {
      out.push(m[0]);
      i += m[0].length;
    } else if ('+-*/^(),%'.includes(s[i])) out.push(s[i++]);
    else return null;
  }
  return out;
}

/** A formula as a tree: sums of products of powers, with - in front, % after, (brackets) and functions; null if it is not one. */
export function parseFormula(src: string): Ex | null {
  if (src.length > 2000) return null;
  const t = formulaTokens(src);
  if (!t?.length) return null;
  let i = 0;
  const peek = () => t[i];
  const expr = (): Ex => {
    let a = term();
    while (peek() === '+' || peek() === '-') {
      const op = t[i++];
      a = { k: 'op', op, a, b: term() };
    }
    return a;
  };
  const term = (): Ex => {
    let a = unary();
    while (peek() === '*' || peek() === '/') {
      const op = t[i++];
      a = { k: 'op', op, a, b: unary() };
    }
    return a;
  };
  const unary = (): Ex => {
    if (peek() === '-') {
      i++;
      return { k: 'neg', a: unary() };
    }
    if (peek() === '+') {
      i++;
      return unary();
    }
    const a = postfix();
    if (peek() !== '^') return a;
    i++;
    return { k: 'op', op: '^', a, b: unary() };
  };
  const postfix = (): Ex => {
    let a = primary();
    while (peek() === '%') {
      i++;
      a = { k: 'pct', a };
    }
    return a;
  };
  const primary = (): Ex => {
    const x = t[i++];
    if (x === undefined) throw new Error('end');
    if (/^(\d|\.\d)/.test(x)) return { k: 'n', v: Number(x) };
    if (/^[A-Za-z_]/.test(x)) {
      if (peek() !== '(') return { k: 'v', name: x };
      i++;
      const args: Ex[] = [];
      if (peek() !== ')') {
        args.push(expr());
        while (peek() === ',') {
          i++;
          args.push(expr());
        }
      }
      if (t[i++] !== ')') throw new Error(')');
      return { k: 'fn', name: x.toLowerCase(), args };
    }
    if (x === '(') {
      const e = expr();
      if (t[i++] !== ')') throw new Error(')');
      return e;
    }
    throw new Error(x);
  };
  try {
    const e = expr();
    return i === t.length ? e : null;
  } catch {
    return null;
  }
}

function evalEx(e: Ex, env: Record<string, number>): number {
  switch (e.k) {
    case 'n':
      return e.v;
    case 'v':
      if (own(env, e.name)) return env[e.name];
      if (own(CONSTS, e.name.toLowerCase())) return CONSTS[e.name.toLowerCase()];
      throw new Error(e.name);
    case 'neg':
      return -evalEx(e.a, env);
    case 'pct':
      return evalEx(e.a, env) / 100;
    case 'op': {
      const a = evalEx(e.a, env);
      const b = evalEx(e.b, env);
      return e.op === '+' ? a + b : e.op === '-' ? a - b : e.op === '*' ? a * b : e.op === '/' ? a / b : a ** b;
    }
    case 'fn':
      if (!own(FNS, e.name)) throw new Error(e.name);
      return FNS[e.name](...e.args.map((x) => evalEx(x, env)));
  }
}

/** A formula's value with these values for its names; null when a name is unknown or the result is not a number. */
export function calcFormula(e: Ex | null, env: Record<string, number>): number | null {
  if (!e) return null;
  try {
    const v = evalEx(e, env);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

interface CalcIn {
  id: string;
  label: string;
  value: number;
  min: number | null;
  max: number | null;
  step: number | null;
  unit: string;
  prefix: string;
  options: { label: string; value: number }[];
}
interface CalcOut {
  label: string;
  id: string;
  ex: Ex | null;
  unit: string;
  prefix: string;
  decimals: number | null;
  big: boolean;
}

/** How a result is written: with its decimals when set, else as many as its size needs. */
function outText(o: CalcOut, v: number | null): string {
  if (v === null) return '—';
  const d = o.decimals !== null ? Math.max(0, Math.min(10, Math.round(o.decimals))) : null;
  const a = Math.abs(v);
  return numText(v, o.unit, o.prefix, d !== null ? { minimumFractionDigits: d, maximumFractionDigits: d } : { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3 });
}

function Calculator({ data, done }: { data: Data; done: boolean }) {
  const inputs: CalcIn[] = useMemo(
    () =>
      arr(data.inputs)
        .filter(isObj)
        .map((x) => ({
          id: str(x.id ?? x.name).trim(),
          label: textOf(x, 'label', 'name', 'id'),
          value: num(x.value ?? x.default) ?? 0,
          min: num(x.min),
          max: num(x.max),
          step: num(x.step),
          unit: str(x.unit),
          prefix: str(x.prefix),
          options: arr(x.options)
            .filter(isObj)
            .map((o) => ({ label: textOf(o, 'label', 'name'), value: num(o.value) }))
            .filter((o): o is { label: string; value: number } => o.value !== null),
        }))
        .filter((x) => x.id),
    [data.inputs],
  );
  const outputs: CalcOut[] = useMemo(
    () =>
      arr(data.outputs)
        .filter(isObj)
        .map((o) => ({ label: textOf(o, 'label', 'name', 'id'), id: str(o.id).trim(), ex: parseFormula(str(o.formula)), unit: str(o.unit), prefix: str(o.prefix), decimals: num(o.decimals), big: yes(o.big) })),
    [data.outputs],
  );
  const [vals, setVals] = useKept<Record<string, number>>('values', {});
  const valueOf = (x: CalcIn) => (typeof vals[x.id] === 'number' ? vals[x.id] : x.value);
  const set = (id: string, v: number) => done && setVals((p) => ({ ...p, [id]: v }));
  /** Every result, with the inputs as they are (and some put otherwise). */
  const results = (over?: Record<string, number>) => {
    const env: Record<string, number> = Object.create(null);
    for (const x of inputs) env[x.id] = valueOf(x);
    if (over) Object.assign(env, over);
    return outputs.map((o) => {
      const v = calcFormula(o.ex, env);
      if (o.id && v !== null) env[o.id] = v;
      return v;
    });
  };
  const now = results();
  const big = outputs.map((o, i) => ({ o, v: now[i] })).filter((x) => x.o.big);
  const rest = outputs.map((o, i) => ({ o, v: now[i] })).filter((x) => !x.o.big);
  const tex = str(data.formula_tex).trim().replace(/^\$+|\$+$/g, '');

  // A result against an input, over its range.
  const ch = obj(data.chart);
  const xIn = inputs.find((x) => x.id === str(ch.x));
  const yAt = outputs.findIndex((o) => o.label === str(ch.y) || (!!o.id && o.id === str(ch.y)));
  let chart: ReactNode = null;
  if (xIn && yAt >= 0) {
    const opts = xIn.options.map((o) => o.value);
    const from = num(ch.from) ?? xIn.min ?? (opts.length ? Math.min(...opts) : xIn.value / 2);
    const to = num(ch.to) ?? xIn.max ?? (opts.length ? Math.max(...opts) : xIn.value * 1.5 || 1);
    if (to > from) {
      const cur = valueOf(xIn);
      // Samples at the input's own step when there are not too many of them, else at a round step: labels stay round.
      const st = xIn.step && xIn.step > 0 && (to - from) / xIn.step <= 100 ? xIn.step : niceStep((to - from) * 2);
      const at: number[] = [];
      for (let v = Math.ceil(from / st - 1e-9) * st; v <= to + st * 1e-6 && at.length < 400; v += st) at.push(Number(v.toPrecision(12)));
      if (at[0] > from) at.unshift(from);
      if (at[at.length - 1] < to) at.push(to);
      if (cur > from && cur < to && !at.some((v) => Math.abs(v - cur) < st / 4)) at.push(cur);
      at.sort((a, b) => a - b);
      const digits = Math.min(4, Math.max(0, -Math.floor(Math.log10(st) + 1e-9)));
      const label = (v: number) => fmtNum(v, { maximumFractionDigits: Math.max(digits, Number.isInteger(v) ? 0 : 2) });
      const y = outputs[yAt];
      chart = (
        <div className="mt-5 border-t border-line pt-4">
          <div className="mb-1 aui-h4">{tr('{0} against {1}').replace('{0}', y.label).replace('{1}', xIn.label)}</div>
          <XYChart
            kind="line"
            x={at.map(label)}
            series={[{ name: y.label, values: at.map((v) => results({ [xIn.id]: v })[yAt]) }]}
            unit={y.unit}
            prefix={y.prefix}
            marks={cur >= from && cur <= to ? [{ x: label(cur), label: `${xIn.label}: ${numText(cur, xIn.unit, xIn.prefix)}` }] : []}
            xLabel={[xIn.label, xIn.unit].filter(Boolean).join(', ')}
            height={210}
          />
        </div>
      );
    }
  }

  return (
    <Card>
      <Head title={data.title} />
      {tex && (done ? <Md text={`$$\n${tex}\n$$`} className="-mt-1 mb-3 overflow-x-auto text-[12px] text-fg-2 @md:text-[14px]" /> : <div className="-mt-1 mb-3 truncate font-mono text-[12px] text-fg-3">{tex}</div>)}
      <div className="grid gap-x-8 gap-y-5 @xl:grid-cols-2">
        {inputs.length > 0 && (
          <div className="min-w-0 space-y-3">
            {inputs.map((x) => {
              const v = valueOf(x);
              if (x.options.length)
                return (
                  <div key={x.id} className="min-w-0">
                    <div className="mb-1 text-[13px] text-fg-2">{x.label}</div>
                    {x.options.length <= 4 && x.options.every((o) => o.label.length <= 18) ? (
                      <Seg size="sm" options={x.options.map((o) => ({ value: o.value, label: o.label }))} value={v} onChange={(n) => set(x.id, n)} />
                    ) : (
                      <select value={String(v)} disabled={!done} onChange={(e) => set(x.id, Number(e.target.value))} className="max-w-full rounded-md border border-line bg-panel px-2 py-1 text-[13px]">
                        {!x.options.some((o) => o.value === v) && <option value={String(v)}>{numText(v, x.unit, x.prefix)}</option>}
                        {x.options.map((o, i) => (
                          <option key={i} value={String(o.value)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              if (x.min !== null && x.max !== null && x.max > x.min)
                return <SliderRow key={x.id} label={x.label} value={v} min={x.min} max={x.max} step={x.step && x.step > 0 ? x.step : niceStep(x.max - x.min)} onChange={(n) => set(x.id, n)} disabled={!done} box prefix={x.prefix} unit={x.unit} />;
              return (
                <div key={x.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 text-fg-2">{x.label}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[12.5px] text-fg-3">
                    {x.prefix}
                    <NumBox value={v} onChange={(n) => set(x.id, n)} disabled={!done} label={x.label} className="w-24" />
                    {x.unit}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {outputs.length > 0 && (
          <div className="min-w-0">
            {big.length > 0 && (
              <div className={cx('grid gap-2', big.length > 1 && 'grid-cols-2')}>
                {big.map(({ o, v }, i) => (
                  <div key={i} className="min-w-0 rounded-xl bg-bg-1 px-3.5 py-3">
                    <div className="truncate text-[12.5px] text-fg-3">{o.label}</div>
                    <div className={cx('mt-0.5 text-[24px] leading-tight font-semibold tracking-tight tabular-nums', v === null && 'text-fg-3')}>{outText(o, v)}</div>
                  </div>
                ))}
              </div>
            )}
            {rest.length > 0 && (
              <dl className={cx('m-0', big.length > 0 && 'mt-2')}>
                {rest.map(({ o, v }, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4 border-b border-line/70 py-1.5 text-[13.5px] last:border-b-0">
                    <dt className="min-w-0 text-fg-3">{o.label}</dt>
                    <dd className={cx('m-0 shrink-0 font-semibold tabular-nums', v === null && 'text-fg-3')}>{outText(o, v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>
      {chart}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- progress toward goals ------------------------------------------------------------------------------------------

/** Days from today to a date (negative once it has passed); null without one. */
export function daysTo(v: unknown): number | null {
  const d = parseDate(v);
  if (!d) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const day = new Date(d);
  day.setHours(12, 0, 0, 0);
  return Math.round((day.getTime() - today.getTime()) / 86_400_000);
}

function Progress({ data }: { data: Data }) {
  const goals = arr(data.goals ?? data.items).filter(isObj);
  return (
    <Card>
      <Head title={data.title} />
      <ul className="m-0 list-none space-y-4 p-0">
        {goals.map((g, i) => {
          const value = num(g.value ?? g.current);
          const target = num(g.target ?? g.goal);
          const start = num(g.start) ?? 0;
          const down = target !== null && target < start;
          const share = value === null || target === null ? null : target === start ? (value >= target ? 1 : 0) : (value - start) / (target - start);
          const reached = share !== null && share >= 1;
          const unit = str(g.unit);
          const prefix = str(g.prefix);
          const n = (v: number | null) => numText(v, '', prefix);
          const left = value !== null && target !== null ? Math.abs(target - value) : null;
          const days = daysTo(g.due);
          return (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 text-[14px] font-medium">{textOf(g, 'name', 'title', 'label')}</span>
                {share !== null && <span className={cx('shrink-0 text-[14px] font-semibold tabular-nums', reached && 'text-ok')}>{reached ? <Check size={15} strokeWidth={2.5} className="mr-1 inline align-[-2px]" /> : null}{fmtNum(Math.max(0, share) * 100, { maximumFractionDigits: 0 })}%</span>}
              </div>
              <Meter value={Math.max(0, Math.min(1, share ?? 0))} max={1} tone={reached ? 'good' : undefined} className="mt-1.5" />
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px] text-fg-3 tabular-nums">
                <span>
                  {value !== null && target !== null && (down && target === 0 ? tr('{0} left of {1}').replace('{0}', `${n(value)}${unit ? ` ${unit}` : ''}`).replace('{1}', n(start)) : `${n(value)} ${down ? '→' : '/'} ${n(target)}${unit ? ` ${unit}` : ''}`)}
                  {!reached && left !== null && left > 0 && !(down && target === 0) && ` · ${tr('{0} to go').replace('{0}', n(left))}`}
                </span>
                {days !== null && !reached && (
                  <span className={cx(days < 0 && 'font-medium text-warn')}>
                    {fmtDate(g.due, 'short')} · {days < 0 ? tr('{0} days late').replace('{0}', fmtNum(-days)) : days === 0 ? tr('due today') : days === 1 ? tr('1 day left') : tr('{0} days left').replace('{0}', fmtNum(days))}
                  </span>
                )}
              </div>
              {str(g.note) && <div className="mt-0.5 text-[12.5px] text-fg-2">{str(g.note)}</div>}
            </li>
          );
        })}
      </ul>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- experiment results ---------------------------------------------------------------------------------------------

const texEsc = (s: string) => s.replace(/[\\&%$#_{}~^]/g, (c) => (c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : `\\${c}`));

function Results({ data, done }: { data: Data; done: boolean }) {
  const metrics: string[] = Array.isArray(data.metrics) ? data.metrics.map((m: unknown) => textOf(m, 'name', 'label')) : [];
  const hb: boolean[] = metrics.map((_, j) => {
    const h = Array.isArray(data.higher_better) ? data.higher_better[j] : undefined;
    return !(h === false || str(h).toLowerCase() === 'false');
  });
  const rows = arr(data.rows)
    .filter(isObj)
    .map((r, i) => ({
      i,
      name: textOf(r, 'name', 'method', 'model', 'label'),
      values: metrics.map((_, j) => num(Array.isArray(r.values) ? r.values[j] : undefined)),
      std: metrics.map((_, j) => num(Array.isArray(r.std) ? r.std[j] : undefined)),
      group: str(r.group),
      baseline: yes(r.baseline),
      note: str(r.note),
    }));
  // Decimals: as set (for all, or per metric), else as many as the column's numbers were written with.
  const dec = metrics.map((_, j) => {
    const d = Array.isArray(data.decimals) ? num(data.decimals[j]) : num(data.decimals);
    if (d !== null) return Math.max(0, Math.min(6, Math.round(d)));
    return Math.min(4, rows.reduce((m, r) => Math.max(m, r.values[j] === null ? 0 : (String(r.values[j]).split('.')[1] ?? '').length), 0));
  });
  const fmt = (v: number, j: number) => fmtNum(v, { minimumFractionDigits: dec[j], maximumFractionDigits: dec[j] });
  // The best and second best of each metric, at the precision shown.
  const ranks = metrics.map((_, j) => {
    const seen = [...new Set(rows.map((r) => r.values[j]).filter((v): v is number => v !== null).map((v) => Number(v.toFixed(dec[j]))))].sort((a, b) => (hb[j] ? b - a : a - b));
    return { best: seen[0], second: seen.length > 2 ? seen[1] : undefined };
  });
  const rank = (v: number | null, j: number) => (v === null ? 0 : Number(v.toFixed(dec[j])) === ranks[j].best ? 1 : Number(v.toFixed(dec[j])) === ranks[j].second ? 2 : 0);
  const base = rows.find((r) => r.baseline);
  const [mode, setMode] = useKept<'values' | 'diff'>('mode', 'values');
  const [sort, setSort] = useKept<{ j: number; flip: boolean } | null>('sort', null);
  const diff = mode === 'diff' && !!base;
  const sorted = useMemo(() => {
    if (!sort || !done || sort.j >= metrics.length) return null;
    const { j, flip } = sort;
    const dir = (hb[j] ? -1 : 1) * (flip ? -1 : 1);
    return [...rows].sort((a, b) => (a.values[j] === null ? 1 : b.values[j] === null ? -1 : ((a.values[j] as number) - (b.values[j] as number)) * dir));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, done, rows.length, JSON.stringify(data.rows)]);
  const clickSort = (j: number) => {
    if (!done) return;
    setSort((s) => (!s || s.j !== j ? { j, flip: false } : !s.flip ? { j, flip: true } : null));
  };
  const latex = () => {
    const cols = metrics.length;
    const lines = [`\\begin{tabular}{l${'c'.repeat(cols)}}`, '\\toprule', `Method & ${metrics.map((m, j) => `${texEsc(m)} $\\${hb[j] ? 'uparrow' : 'downarrow'}$`).join(' & ')} \\\\`, '\\midrule'];
    let g = '';
    rows.forEach((r, k) => {
      if (r.group && r.group !== g) {
        if (k) lines.push('\\midrule');
        lines.push(`\\multicolumn{${cols + 1}}{l}{\\textit{${texEsc(r.group)}}} \\\\`);
        g = r.group;
      }
      const cells = r.values.map((v, j) => {
        if (v === null) return '--';
        let s = fmt(v, j).replace(/,/g, '{,}');
        if (rank(v, j) === 1) s = `\\textbf{${s}}`;
        else if (rank(v, j) === 2) s = `\\underline{${s}}`;
        return r.std[j] !== null ? `${s}$_{\\pm ${fmt(r.std[j] as number, j)}}$` : s;
      });
      lines.push(`${texEsc(r.name)} & ${cells.join(' & ')} \\\\`);
    });
    lines.push('\\bottomrule', '\\end{tabular}');
    return lines.join('\n');
  };
  const cell = (r: (typeof rows)[number], j: number) => {
    const v = r.values[j];
    if (v === null) return <span className="text-fg-3">—</span>;
    const k = rank(v, j);
    if (diff && base && r !== base) {
      const b = base.values[j];
      if (b === null) return <span className="text-fg-3">—</span>;
      const d = v - b;
      const shown = Number(d.toFixed(dec[j]));
      const better = shown === 0 ? 0 : (shown > 0) === hb[j] ? 1 : -1;
      return (
        <span title={b ? `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtNum(Math.abs(d / b) * 100, { maximumFractionDigits: 1 })}%` : undefined} className={cx(better > 0 ? 'text-ok' : better < 0 ? 'text-err' : 'text-fg-3', k === 1 && 'font-semibold', k === 2 && 'underline decoration-1 underline-offset-[3px]')}>
          {shown > 0 ? '+' : shown < 0 ? '−' : ''}
          {fmt(Math.abs(shown), j)}
        </span>
      );
    }
    return (
      <>
        <span className={cx(k === 1 && 'font-semibold text-fg', k === 2 && 'underline decoration-1 underline-offset-[3px]', diff && r === base && 'text-fg-3')}>{fmt(v, j)}</span>
        {r.std[j] !== null && <span className="ml-0.5 text-[11px] text-fg-3">±{fmt(r.std[j] as number, j)}</span>}
      </>
    );
  };
  const list = sorted ?? rows;
  let lastGroup = '';
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-2.5 @lg:px-5">
        <div className="min-w-0 flex-1">{str(data.title) && <h3 className="aui-h3">{str(data.title)}</h3>}</div>
        {base && done && (
          <Seg
            size="sm"
            options={[
              { value: 'values', label: tr('Values') },
              { value: 'diff', label: tr('Against {0}').replace('{0}', base.name) },
            ]}
            value={mode}
            onChange={setMode}
          />
        )}
        {done && rows.length > 0 && <Copy text={latex} label={tr('Copy as LaTeX')} />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line bg-bg-1">
              <th className="sticky left-0 z-[1] bg-bg-1 px-4 py-1.5 text-left font-medium text-fg-3 @lg:px-5" />
              {metrics.map((m, j) => {
                const on = sort?.j === j;
                return (
                  <th key={j} className="px-3 py-1.5 text-right font-medium whitespace-nowrap text-fg-3 last:pr-4 @lg:last:pr-5" aria-sort={on ? ((hb[j] ? !sort.flip : sort.flip) ? 'descending' : 'ascending') : undefined}>
                    <button type="button" onClick={() => clickSort(j)} title={hb[j] ? tr('Higher is better') : tr('Lower is better')} className={cx('inline-flex items-center gap-1 hover:text-fg', on && 'text-fg')}>
                      {on && ((hb[j] ? !sort.flip : sort.flip) ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />)}
                      {m}
                      <span className="font-normal opacity-70">{hb[j] ? '↑' : '↓'}</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const head = !sorted && r.group && r.group !== lastGroup;
              if (!sorted && r.group) lastGroup = r.group;
              return (
                <Fragment key={r.i}>
                  {head && (
                    <tr>
                      <td colSpan={metrics.length + 1} className="px-4 pt-3 pb-1 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase @lg:px-5">
                        {r.group}
                      </td>
                    </tr>
                  )}
                  <tr className="border-b border-line/60 hover:bg-bg-1/60">
                    <th scope="row" className="sticky left-0 z-[1] min-w-[9.5rem] bg-panel px-4 py-1.5 text-left align-top font-normal @lg:px-5">
                      <span className="font-medium text-fg">{r.name}</span>
                      {r.baseline && <Chip className="ml-1.5 align-[1px] !text-[10.5px]">{tr('Baseline')}</Chip>}
                      {(r.note || (sorted && r.group)) && <span className="block text-[11.5px] text-fg-3">{[sorted ? r.group : '', r.note].filter(Boolean).join(' · ')}</span>}
                    </th>
                    {metrics.map((_, j) => (
                      <td key={j} className="px-3 py-1.5 text-right align-top whitespace-nowrap tabular-nums last:pr-4 @lg:last:pr-5">
                        {cell(r, j)}
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[12px] text-fg-3 @lg:px-5">
        {rows.length > 2 && (
          <span className="shrink-0">
            <b className="font-semibold text-fg-2">{tr('Best in bold')}</b> · <span className="underline decoration-1 underline-offset-[3px]">{tr('second underlined')}</span>
          </span>
        )}
        {str(data.note) && <Md text={data.note} inline className="min-w-0 flex-1 text-fg-2" />}
      </div>
    </Card>
  );
}

// ---- a Sankey diagram -----------------------------------------------------------------------------------------------

interface SkNode {
  name: string;
  layer: number;
  inV: number;
  outV: number;
  value: number;
  y: number;
  h: number;
  ins: SkLink[];
  outs: SkLink[];
  color: string | null;
}
interface SkLink {
  from: SkNode;
  to: SkNode;
  value: number;
  w: number;
  sy: number;
  ty: number;
}

/** Nodes in columns by their longest path from a source, ordered to cross little, stacked and sized by what flows. */
function sankeyLayout(raw: { from: string; to: string; value: number }[], height: number, gap: number) {
  const byName = new Map<string, SkNode>();
  const node = (name: string) => {
    let n = byName.get(name);
    if (!n) byName.set(name, (n = { name, layer: 0, inV: 0, outV: 0, value: 0, y: 0, h: 0, ins: [], outs: [], color: null }));
    return n;
  };
  const links: SkLink[] = [];
  for (const l of raw) {
    if (!l.from || !l.to || l.from === l.to || !(l.value > 0)) continue;
    const k: SkLink = { from: node(l.from), to: node(l.to), value: l.value, w: 0, sy: 0, ty: 0 };
    links.push(k);
    k.from.outs.push(k);
    k.to.ins.push(k);
    k.from.outV += l.value;
    k.to.inV += l.value;
  }
  const nodes = [...byName.values()];
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false;
    for (const k of links)
      if (k.to.layer < k.from.layer + 1 && k.from.layer + 1 < nodes.length) {
        k.to.layer = k.from.layer + 1;
        moved = true;
      }
    if (!moved) break;
  }
  const cols: SkNode[][] = Array.from({ length: nodes.reduce((m, n) => Math.max(m, n.layer), 0) + 1 }, () => []);
  for (const n of nodes) {
    n.value = Math.max(n.inV, n.outV);
    cols[n.layer].push(n);
  }
  const ky = Math.min(...cols.filter((c) => c.length).map((c) => (height - (c.length - 1) * gap) / (c.reduce((m, n) => m + n.value, 0) || 1)));
  for (const n of nodes) n.h = Math.max(2, n.value * ky);
  for (const k of links) k.w = Math.max(1, k.value * ky);
  const place = (c: SkNode[]) => {
    let y = Math.max(0, (height - c.reduce((m, n) => m + n.h, 0) - (c.length - 1) * gap) / 2);
    for (const n of c) {
      n.y = y;
      y += n.h + gap;
    }
  };
  cols.forEach(place);
  const mid = (n: SkNode) => n.y + n.h / 2;
  const bary = (n: SkNode, side: 'ins' | 'outs') => {
    const ls = n[side];
    const w = ls.reduce((m, k) => m + k.value, 0);
    return w ? ls.reduce((m, k) => m + mid(side === 'ins' ? k.from : k.to) * k.value, 0) / w : mid(n);
  };
  for (let it = 0; it < 4; it++) {
    for (let c = 1; c < cols.length; c++) {
      cols[c].sort((a, b) => bary(a, 'ins') - bary(b, 'ins'));
      place(cols[c]);
    }
    for (let c = cols.length - 2; c >= 0; c--) {
      cols[c].sort((a, b) => bary(a, 'outs') - bary(b, 'outs'));
      place(cols[c]);
    }
  }
  for (const n of nodes) {
    let y = 0;
    for (const k of [...n.outs].sort((a, b) => mid(a.to) - mid(b.to))) {
      k.sy = y;
      y += k.w;
    }
    y = 0;
    for (const k of [...n.ins].sort((a, b) => mid(a.from) - mid(b.from))) {
      k.ty = y;
      y += k.w;
    }
  }
  // Colours: each node its own when there are few; else the branches out of the hub that the sources pour into (a
  // budget's spending), or the sources (an energy flow's fuels), passed on downstream along each node's largest inflow.
  if (nodes.length <= 8) {
    let i = 0;
    for (const c of cols) for (const n of c) n.color = seriesColor(i++);
  } else {
    const hub = nodes.reduce((b, n) => (n.outs.length > b.outs.length || (n.outs.length === b.outs.length && n.value > b.value) ? n : b), nodes[0]);
    const pours = hub.outs.length >= 2 && hub.layer <= 1 && cols[0].every((n) => n === hub || n.outs.every((k) => k.to === hub));
    if (pours) [...hub.outs].sort((a, b) => a.to.y - b.to.y).forEach((k, i) => i < 8 && (k.to.color = seriesColor(i)));
    else cols[0].forEach((n, i) => i < 8 && (n.color = seriesColor(i)));
    for (let c = 1; c < cols.length; c++)
      for (const n of cols[c])
        if (!n.color) {
          const big = n.ins.reduce<SkLink | null>((b, k) => (!b || k.value > b.value ? k : b), null);
          if (big?.from.color) n.color = big.from.color;
        }
  }
  return { nodes, links, cols };
}

function Sankey({ data }: { data: Data }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ link?: SkLink; node?: SkNode; x: number; y: number } | null>(null);
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const raw = arr(data.links ?? data.flows)
    .filter(isObj)
    .map((l) => ({ from: textOf(l.from ?? l.source, 'name', 'label'), to: textOf(l.to ?? l.target, 'name', 'label'), value: num(l.value ?? l.amount) ?? 0 }));
  const key = JSON.stringify(raw);
  const tall = useMemo(() => sankeyLayout(raw, 100, 0).cols.reduce((m, c) => Math.max(m, c.length), 0), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const H = Math.max(200, Math.min(560, tall * 40 + 20));
  const { nodes, links, cols } = useMemo(() => sankeyLayout(raw, H, 12), [key, H]); // eslint-disable-line react-hooks/exhaustive-deps
  const nodeW = 10;
  const xOf = (layer: number) => (cols.length > 1 ? (layer * (width - nodeW)) / (cols.length - 1) : (width - nodeW) / 2);
  const v = (n: number) => numText(n, unit, prefix);
  const at = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const lit = (k: SkLink) => !hover || hover.link === k || hover.node === k.from || hover.node === k.to;
  return (
    <Card>
      <Head title={data.title} />
      <div ref={ref} className="relative">
        {width > 0 && links.length > 0 && (
          <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={nodes.map((n) => n.name).join(', ')} onPointerLeave={() => setHover(null)}>
            {links.map((k, i) => {
              const x0 = xOf(k.from.layer) + nodeW;
              const x1 = xOf(k.to.layer);
              const y0 = k.from.y + k.sy + k.w / 2;
              const y1 = k.to.y + k.ty + k.w / 2;
              const xm = (x0 + x1) / 2;
              return (
                <path
                  key={i}
                  d={`M${x0.toFixed(1)},${y0.toFixed(1)}C${xm.toFixed(1)},${y0.toFixed(1)} ${xm.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`}
                  fill="none"
                  stroke={k.from.color ?? k.to.color ?? 'var(--fg-3)'}
                  strokeWidth={k.w}
                  strokeOpacity={lit(k) ? (hover ? 0.55 : 0.32) : 0.1}
                  onPointerMove={(e) => setHover({ link: k, ...at(e) })}
                />
              );
            })}
            {nodes.map((n, i) => (
              <rect key={i} x={xOf(n.layer)} y={n.y} width={nodeW} height={n.h} rx={2} fill={n.color ?? 'var(--fg-3)'} onPointerMove={(e) => setHover({ node: n, ...at(e) })} />
            ))}
            {nodes.map((n, i) => {
              const right = xOf(n.layer) < width / 2;
              return (
                <text key={i} x={right ? xOf(n.layer) + nodeW + 6 : xOf(n.layer) - 6} y={n.y + n.h / 2} dy="0.35em" textAnchor={right ? 'start' : 'end'} className="pointer-events-none fill-fg text-[12px]" style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 3, strokeLinejoin: 'round' }}>
                  {n.name}
                  {width >= 440 && (
                    <tspan className="fill-fg-3 tabular-nums" dx={5}>
                      {v(n.value)}
                    </tspan>
                  )}
                </text>
              );
            })}
          </svg>
        )}
        {hover?.link && (
          <HoverTip
            x={hover.x}
            y={hover.y - 56}
            width={width}
            title={`${hover.link.from.name} → ${hover.link.to.name}`}
            rows={[{ value: v(hover.link.value), name: hover.link.from.outV ? tr('{0} of {1}').replace('{0}', shareText(hover.link.value / hover.link.from.outV)).replace('{1}', hover.link.from.name) : undefined }]}
          />
        )}
        {hover?.node && (
          <HoverTip
            x={hover.x}
            y={hover.y - 56}
            width={width}
            title={hover.node.name}
            rows={[
              ...(hover.node.inV ? [{ value: v(hover.node.inV), name: tr('flows in') }] : []),
              ...(hover.node.outV ? [{ value: v(hover.node.outV), name: tr('flows out') }] : []),
            ]}
          />
        )}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- what the distribution, the bridge, the treemap and the calendar share ---------------------------------------------

/** A column's outline, rounded at its data end (the top, or the bottom when `top` is false) and square at the other. */
function colPath(x: number, y: number, w: number, h: number, top: boolean, r = 4): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return top
    ? `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
    : `M${x},${y}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w - rr}Q${x + w},${y + h} ${x + w},${y + h - rr}V${y}Z`;
}

/** A bar's outline along x, rounded at its data end (the right, or the left when `right` is false). */
function rowPath(x: number, y: number, w: number, h: number, right: boolean, r = 4): string {
  if (h <= 0 || w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return right
    ? `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`
    : `M${x + w},${y}H${x + rr}Q${x},${y} ${x},${y + rr}V${y + h - rr}Q${x},${y + h} ${x + rr},${y + h}H${x + w}Z`;
}

/** About how wide a text is drawn at a size in px: for fitting labels without measuring them. */
const textWidth = (s: string, size = 11.5) => s.length * size * 0.56;

/** A text cut short with an ellipsis to fit a width at a size; empty when not even two letters would show. */
function fitText(s: string, width: number, size = 11.5): string {
  const max = Math.floor(width / (size * 0.56));
  return s.length <= max ? s : max < 3 ? '' : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** A label in lines of at most `max` letters, at most `lines` of them (the last cut short when it must be). */
function wrapText(s: string, max: number, lines = 2): string[] {
  const out: string[] = [];
  for (const w of s.split(/\s+/).filter(Boolean)) {
    const last = out[out.length - 1];
    if (last !== undefined && `${last} ${w}`.length <= max) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  if (out.length > lines) out.splice(lines - 1, out.length, out.slice(lines - 1).join(' '));
  return out.map((l) => (l.length > max ? `${l.slice(0, Math.max(1, max - 1))}…` : l));
}

/** A number with what goes before and after it, short past ten thousand (or always, `short`): "−$31K", "4.2M people". */
function shortText(n: number, unit = '', prefix = '', short = Math.abs(n) >= 10_000): string {
  if (!short) return numText(n, unit, prefix);
  const u = str(unit);
  return `${n < 0 ? '−' : ''}${prefix}${compact(Math.abs(n))}${u ? (GLUED.test(u) ? u : ` ${u}`) : ''}`;
}

/** A change with its sign: "+$64K", "−12%". */
const signedText = (n: number, unit = '', prefix = '', short?: boolean) => `${n > 0 ? '+' : ''}${shortText(n, unit, prefix, short)}`;

/** How many decimals a number has as written (0.25 → 2). */
const decimalsOf = (x: number) => (String(Number(x.toPrecision(6))).split('.')[1] ?? '').length;

/** Decimals for numbers spread over `span`: none past a hundred, one past ten, two past one, three below. */
const decimalsFor = (span: number) => (span >= 100 ? 0 : span >= 10 ? 1 : span >= 1 ? 2 : 3);

/** A colour washed into the panel's, `pct` of it: a tile's soft fill, light on light and dark on dark. */
const wash = (color: string, pct: number) => `color-mix(in oklab, ${color} ${Math.round(pct)}%, var(--panel))`;

/** A figure in a tile: its label, the number large, a line under it. */
function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-bg-1 px-3.5 py-3">
      <div className="truncate text-[12.5px] text-fg-3">{label}</div>
      <div className="mt-0.5 truncate text-[19px] leading-tight font-semibold tracking-tight">{value || '—'}</div>
      {sub && <div className="mt-0.5 truncate text-[12px] text-fg-3 tabular-nums">{sub}</div>}
    </div>
  );
}

/** The button that shows a chart's numbers as a table, and the chart again. */
function TableToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const label = on ? tr('Show the chart') : tr('Show as a table');
  return (
    <button type="button" onClick={() => onChange(!on)} title={label} aria-label={label} className={cx('grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-bg-2', on ? 'bg-bg-2 text-fg' : 'text-fg-3')}>
      <Table2 size={14} />
    </button>
  );
}

/** A tooltip like HoverTip whose title and note wrap: for long names and notes. */
function NoteTip({ x, y, width, title, rows, note }: { x: number; y: number; width: number; title?: string; rows: { color?: string; name?: string; value: string }[]; note?: string }) {
  const left = Math.min(Math.max(4, x + 12), Math.max(4, width - 244));
  return (
    <div className="pointer-events-none absolute z-10 w-max max-w-[240px] min-w-[120px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-pop" style={{ left, top: Math.max(0, y) }}>
      {title && <div className="mb-0.5 text-[11.5px] leading-snug text-fg-3">{title}</div>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 whitespace-nowrap">
          {r.color && <span className="inline-block h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />}
          <span className="font-semibold text-fg tabular-nums">{r.value}</span>
          {r.name && <span className="truncate text-fg-3">{r.name}</span>}
        </div>
      ))}
      {note && <div className="mt-1 text-[11.5px] leading-snug text-fg-2">{note}</div>}
    </div>
  );
}

/** Labels along the top of a chart, each at its x (kept within left..right), in the first of two rows where it runs into none. */
function labelRows(items: { x: number; text: string }[], left: number, right: number, size = 11): { x: number; text: string; row: number }[] {
  const ends = [-Infinity, -Infinity];
  return [...items]
    .sort((a, b) => a.x - b.x)
    .map((it) => {
      const text = fitText(it.text, Math.max(40, (right - left) / 2), size);
      const w = textWidth(text, size);
      const x = Math.min(Math.max(it.x, left + w / 2), right - w / 2);
      const free = ends.findIndex((e) => e + 8 <= x - w / 2);
      const row = free < 0 ? 1 : free;
      ends[row] = x + w / 2;
      return { x, text, row };
    });
}

/** A line across a chart at a value, with the panel's colour under it so it shows over bars too. */
function RefLine({ x, y1, y2, color, dashed }: { x: number; y1: number; y2: number; color: string; dashed?: boolean }) {
  return (
    <g className="pointer-events-none">
      <line x1={x} x2={x} y1={y1} y2={y2} stroke="var(--panel)" strokeWidth={4} />
      <line x1={x} x2={x} y1={y1} y2={y2} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? '4 3' : undefined} />
    </g>
  );
}

/** The key to a line across a chart: a short stretch of it. */
const LineKey = ({ color, dashed }: { color: string; dashed?: boolean }) => (
  <svg width={3} height={12} className="shrink-0" aria-hidden>
    <line x1={1.5} x2={1.5} y1={0} y2={12} stroke={color} strokeWidth={1.5} strokeDasharray={dashed ? '3 2' : undefined} />
  </svg>
);

// ---- a distribution: a histogram, its summary, box plots -----------------------------------------------------------------

interface Bin {
  from: number;
  to: number;
  count: number;
}
interface Summary {
  n: number;
  mean: number;
  sd: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}
interface RefMark {
  value: number;
  label: string;
}

/** A sorted list's value a share `p` of the way through it (between two of its values, in proportion). */
function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/** Values' count, mean, spread (the sample's standard deviation) and the five numbers of a box plot. */
function summarize(values: number[]): Summary | null {
  const n = values.length;
  if (!n) return null;
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((m, v) => m + v, 0) / n;
  const sd = n > 1 ? Math.sqrt(s.reduce((m, v) => m + (v - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd, min: s[0], q1: quantile(s, 0.25), median: quantile(s, 0.5), q3: quantile(s, 0.75), max: s[n - 1] };
}

/** The same estimated from counts in bins (in order), each bin's values taken as spread evenly across it. */
function summarizeBins(bins: Bin[]): Summary | null {
  const used = bins.filter((b) => b.count > 0);
  const n = used.reduce((m, b) => m + b.count, 0);
  if (!used.length || !(n > 0)) return null;
  const mid = (b: Bin) => (b.from + b.to) / 2;
  const mean = used.reduce((m, b) => m + mid(b) * b.count, 0) / n;
  const sd = n > 1 ? Math.sqrt(used.reduce((m, b) => m + b.count * (mid(b) - mean) ** 2, 0) / (n - 1)) : 0;
  const at = (p: number) => {
    const want = p * n;
    let seen = 0;
    for (const b of used) {
      if (seen + b.count >= want) return b.from + ((want - seen) / b.count) * (b.to - b.from);
      seen += b.count;
    }
    return used[used.length - 1].to;
  };
  return { n, mean, sd, min: used[0].from, q1: at(0.25), median: at(0.5), q3: at(0.75), max: used[used.length - 1].to };
}

/** The round widths a bin may have, times a power of ten. */
const ROUND_WIDTHS = [1, 2, 2.5, 5, 10];

/**
 * Values in bins: whole numbers over a short range a bin each (centred on them); else as many as their spread calls for
 * (Freedman–Diaconis, 5 to 40) at the round width nearest it, from a multiple of it. The last bin keeps its top edge.
 */
function binValues(values: number[], width: number | null): Bin[] {
  const n = values.length;
  if (!n) return [];
  const s = [...values].sort((a, b) => a - b);
  const lo = s[0];
  const hi = s[n - 1];
  const whole = s.every(Number.isInteger);
  let w = width !== null && width > 0 && (hi - lo) / width <= 200 ? width : 0;
  if (!w) {
    if (whole && hi - lo <= 30) w = 1;
    else if (lo === hi) w = Math.abs(lo) / 10 || 1;
    else {
      const iqr = quantile(s, 0.75) - quantile(s, 0.25);
      const fd = iqr > 0 ? (2 * iqr) / Math.cbrt(n) : 0;
      const k = Math.max(5, Math.min(40, fd > 0 ? Math.ceil((hi - lo) / fd) : Math.ceil(Math.log2(n) + 1)));
      const p = 10 ** Math.floor(Math.log10((hi - lo) / k));
      const off = (c: number) => Math.abs(Math.log((hi - lo) / c / k));
      for (const f of ROUND_WIDTHS) {
        const c = f * p;
        if (whole && !Number.isInteger(c)) continue;
        if (!w || off(c) < off(w)) w = c;
      }
      w ||= (hi - lo) / k;
    }
  }
  const start = whole && w === 1 ? lo - 0.5 : Math.floor(lo / w + 1e-9) * w;
  const count = Math.max(1, Math.ceil((hi - start) / w - 1e-9));
  const bins: Bin[] = Array.from({ length: count }, (_, i) => ({ from: start + i * w, to: start + (i + 1) * w, count: 0 }));
  for (const v of s) bins[Math.max(0, Math.min(count - 1, Math.floor((v - start) / w + 1e-9)))].count++;
  return bins;
}

/** A bin's range in words: its whole number when it has one ("7"), else "65–70" (with the unit). */
function binText(b: Bin, unit: string): string {
  const w = b.to - b.from;
  if (w === 1 && Number.isInteger(b.from + 0.5)) return numText(b.from + 0.5, unit);
  const d = Math.min(4, Math.max(decimalsOf(w), decimalsOf(b.from)));
  return `${fmtNum(b.from, { maximumFractionDigits: d })}–${numText(b.to, unit, '', { maximumFractionDigits: d })}`;
}

function Histogram({ bins, stats, marks, unit }: { bins: Bin[]; stats: Summary | null; marks: RefMark[]; unit: string }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const lo = bins[0].from;
  const hi = bins[bins.length - 1].to;
  const total = bins.reduce((m, b) => m + b.count, 0);
  const whole = bins.every((b) => Number.isInteger(b.count));
  const yTicks = niceTicks(0, Math.max(1, ...bins.map((b) => b.count)), 4).filter((t) => !whole || Number.isInteger(t));
  const yTop = yTicks[yTicks.length - 1] || 1;
  const axisW = Math.max(22, ...yTicks.map((t) => textWidth(fmtNum(t), 11))) + 10;
  const plotW = Math.max(40, width - axisW - 8);
  const sx = (v: number) => axisW + ((v - lo) / (hi - lo || 1)) * plotW;
  const inside = (v: number) => v >= lo && v <= hi;
  const labels = labelRows(
    marks.filter((m) => inside(m.value)).map((m) => ({ x: sx(m.value), text: m.label })),
    axisW,
    axisW + plotW,
  );
  const padT = 6 + (labels.length ? (Math.max(...labels.map((l) => l.row)) + 1) * 15 : 0);
  const plotH = 170;
  const H = padT + plotH + 22;
  const sy = (c: number) => padT + plotH - (c / yTop) * plotH;
  const xTicks = niceTicks(lo, hi, Math.max(2, Math.floor(plotW / 64))).filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
  const xDec = xTicks.length > 1 ? decimalsOf(xTicks[1] - xTicks[0]) : 2;
  const shortUnit = unit.trim().length <= 3 ? unit : '';
  // Bars 2px apart, unless there are so many that the gap would hide them.
  const gap = plotW / bins.length >= 6 ? 1 : 0;
  const hb = hover !== null ? bins[hover] : null;
  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={tr('Histogram')}>
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={axisW} x2={axisW + plotW} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={axisW - 6} y={sy(t)} dy="0.35em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
                {fmtNum(t)}
              </text>
            </g>
          ))}
          {hb && <rect x={sx(hb.from)} y={padT} width={Math.max(1, sx(hb.to) - sx(hb.from))} height={plotH} fill="var(--bg-2)" opacity={0.7} rx={3} />}
          {bins.map((b, i) => {
            const y = sy(b.count);
            return b.count > 0 ? <path key={i} d={colPath(sx(b.from) + gap, y, Math.max(1, sx(b.to) - sx(b.from) - gap * 2), padT + plotH - y, true)} fill={seriesColor(0)} /> : null;
          })}
          {xTicks.map((t, i) => (
            <text key={i} x={sx(t)} y={padT + plotH + 15} textAnchor={i === xTicks.length - 1 && sx(t) > axisW + plotW - 16 ? 'end' : 'middle'} className="fill-fg-3 text-[11px] tabular-nums">
              {fmtNum(t, { maximumFractionDigits: Math.min(4, xDec) })}
              {i === xTicks.length - 1 && shortUnit ? (GLUED.test(shortUnit) ? shortUnit : `\u202f${shortUnit.trim()}`) : ''}
            </text>
          ))}
          {stats && inside(stats.median) && <RefLine x={sx(stats.median)} y1={padT - 2} y2={padT + plotH} color="var(--fg)" />}
          {stats && inside(stats.mean) && <RefLine x={sx(stats.mean)} y1={padT - 2} y2={padT + plotH} color="var(--fg)" dashed />}
          {marks.map((m, i) => (inside(m.value) ? <RefLine key={i} x={sx(m.value)} y1={padT - 2} y2={padT + plotH} color="var(--accent)" /> : null))}
          {labels.map((l, i) => (
            <text key={i} x={l.x} y={10 + l.row * 15} textAnchor="middle" className="pointer-events-none fill-fg-2 text-[11px]">
              {l.text}
            </text>
          ))}
          {bins.map((b, i) => (
            <rect key={i} x={sx(b.from)} y={padT} width={Math.max(1, sx(b.to) - sx(b.from))} height={plotH} fill="transparent" onPointerEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      {hb && (
        <HoverTip
          x={sx((hb.from + hb.to) / 2)}
          y={Math.max(0, sy(hb.count) - 58)}
          width={width}
          title={binText(hb, unit)}
          rows={[
            { color: seriesColor(0), value: fmtNum(hb.count), name: hb.count === 1 ? tr('value') : tr('values') },
            ...(total > 0 ? [{ value: shareText(hb.count / total), name: tr('of all') }] : []),
          ]}
        />
      )}
    </div>
  );
}

/** A distribution's summary: count, median, mean, spread, the ends and the quartiles (≈ when worked out from bins). */
function SummaryRow({ s, unit, estimated, keys }: { s: Summary; unit: string; estimated: boolean; keys: boolean }) {
  const d = decimalsFor(s.max - s.min);
  const v = (x: number) => `${estimated ? '≈ ' : ''}${numText(x, unit, '', { maximumFractionDigits: d })}`;
  const cells: [string, string, ReactNode?][] = [
    [tr('Count'), fmtNum(s.n)],
    [tr('Median'), v(s.median), keys ? <LineKey color="var(--fg)" /> : undefined],
    [tr('Mean'), v(s.mean), keys ? <LineKey color="var(--fg)" dashed /> : undefined],
    [tr('Std. deviation'), v(s.sd)],
    [tr('Lowest'), v(s.min)],
    [tr('Lower quartile'), v(s.q1)],
    [tr('Upper quartile'), v(s.q3)],
    [tr('Highest'), v(s.max)],
  ];
  return (
    <dl className="m-0 mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-line @md:grid-cols-4">
      {cells.map(([label, value, key]) => (
        <div key={label} className="min-w-0 bg-bg-1 px-3 py-2">
          <dt className="flex items-center gap-1.5 truncate text-[11.5px] text-fg-3">
            {key}
            {label}
          </dt>
          <dd className="m-0 text-[14px] font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

interface BoxGroup {
  name: string;
  s: Summary;
  /** Where the whiskers end: the furthest values within one and a half box lengths of the box. */
  low: number;
  high: number;
  /** The values past them. */
  out: number[];
}

function boxOf(name: string, values: number[]): BoxGroup | null {
  const s = summarize(values);
  if (!s) return null;
  const reach = 1.5 * (s.q3 - s.q1);
  let low = s.q1;
  let high = s.q3;
  const out: number[] = [];
  for (const v of values) {
    if (v < s.q1 - reach || v > s.q3 + reach) out.push(v);
    else {
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
  }
  return { name, s, low, high, out };
}

/** Groups side by side as box plots on one scale: the middle half as a box, the median across it, the mean as a ring. */
function BoxPlots({ groups, marks, unit }: { groups: BoxGroup[]; marks: RefMark[]; unit: string }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ends = [...groups.flatMap((g) => [g.s.min, g.s.max]), ...marks.map((m) => m.value)];
  const ticks = niceTicks(Math.min(...ends), Math.max(...ends), Math.max(2, Math.min(8, Math.floor(width / 90))));
  const x0 = ticks[0];
  const x1 = ticks[ticks.length - 1];
  const nameW = Math.max(...groups.map((g) => textWidth(g.name, 12.5))) + 16;
  // Names beside their boxes when they fit in a third of the width, else over them.
  const beside = nameW <= width * 0.34;
  const left = beside ? nameW : 8;
  const right = width - 10;
  const sx = (v: number) => left + ((v - x0) / (x1 - x0 || 1)) * (right - left);
  const labels = labelRows(
    marks.filter((m) => m.value >= x0 && m.value <= x1).map((m) => ({ x: sx(m.value), text: m.label })),
    left,
    right,
  );
  const padT = 4 + (labels.length ? (Math.max(...labels.map((l) => l.row)) + 1) * 15 : 0);
  const rowH = beside ? 36 : 48;
  const boxH = beside ? 18 : 16;
  const plotB = padT + groups.length * rowH;
  const H = plotB + 20;
  const mid = (i: number) => padT + i * rowH + (beside ? rowH / 2 : 17 + (rowH - 17) / 2);
  const d = decimalsFor(x1 - x0);
  const v = (x: number) => numText(x, unit, '', { maximumFractionDigits: d });
  const color = seriesColor(0);
  const g = hover !== null ? groups[hover] : null;
  return (
    <div>
      <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
        {width > 0 && (
          <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={groups.map((x) => x.name).join(', ')}>
            {ticks.map((t, i) => (
              <g key={i}>
                <line x1={sx(t)} x2={sx(t)} y1={padT} y2={plotB} stroke="var(--viz-grid)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={sx(t)} y={H - 4} textAnchor="middle" className="fill-fg-3 text-[11px] tabular-nums">
                  {fmtNum(t, { maximumFractionDigits: d })}
                </text>
              </g>
            ))}
            <line x1={left} x2={right} y1={plotB} y2={plotB} stroke="var(--viz-axis)" strokeWidth={1} shapeRendering="crispEdges" />
            {marks.map((m, i) => (m.value >= x0 && m.value <= x1 ? <RefLine key={i} x={sx(m.value)} y1={padT - 2} y2={plotB} color="var(--accent)" /> : null))}
            {groups.map((b, i) => {
              const cy = mid(i);
              const top = padT + i * rowH;
              const cap = boxH * 0.6;
              return (
                <g key={i} onPointerEnter={() => setHover(i)}>
                  <rect x={0} y={top + 1} width={width} height={rowH - 2} rx={6} fill={hover === i ? 'var(--bg-2)' : 'transparent'} opacity={0.5} />
                  {beside ? (
                    <text x={left - 12} y={cy} dy="0.35em" textAnchor="end" className={cx('text-[12.5px]', hover === i ? 'fill-fg' : 'fill-fg-2')}>
                      {b.name}
                    </text>
                  ) : (
                    <text x={left} y={top + 12} className={cx('text-[12.5px]', hover === i ? 'fill-fg' : 'fill-fg-2')} style={{ paintOrder: 'stroke', stroke: 'var(--panel)', strokeWidth: 4, strokeLinejoin: 'round' }}>
                      {fitText(b.name, right - left, 12.5)}
                    </text>
                  )}
                  <line x1={sx(b.low)} x2={sx(b.s.q1)} y1={cy} y2={cy} stroke="var(--fg-3)" strokeWidth={1.5} />
                  <line x1={sx(b.s.q3)} x2={sx(b.high)} y1={cy} y2={cy} stroke="var(--fg-3)" strokeWidth={1.5} />
                  <line x1={sx(b.low)} x2={sx(b.low)} y1={cy - cap / 2} y2={cy + cap / 2} stroke="var(--fg-3)" strokeWidth={1.5} />
                  <line x1={sx(b.high)} x2={sx(b.high)} y1={cy - cap / 2} y2={cy + cap / 2} stroke="var(--fg-3)" strokeWidth={1.5} />
                  <rect x={sx(b.s.q1)} y={cy - boxH / 2} width={Math.max(2, sx(b.s.q3) - sx(b.s.q1))} height={boxH} rx={3} fill={wash(color, 24)} stroke={color} strokeWidth={1.5} />
                  <line x1={sx(b.s.median)} x2={sx(b.s.median)} y1={cy - boxH / 2} y2={cy + boxH / 2} stroke="var(--fg)" strokeWidth={2.5} />
                  <circle cx={sx(b.s.mean)} cy={cy} r={3.5} fill="var(--panel)" stroke="var(--fg)" strokeWidth={1.5} />
                  {b.out.map((o, k) => (
                    <circle key={k} cx={sx(o)} cy={cy} r={3.5} fill={color} stroke="var(--panel)" strokeWidth={1.5} />
                  ))}
                </g>
              );
            })}
            {labels.map((l, i) => (
              <text key={i} x={l.x} y={10 + l.row * 15} textAnchor="middle" className="pointer-events-none fill-fg-2 text-[11px]">
                {l.text}
              </text>
            ))}
          </svg>
        )}
        {g && hover !== null && (
          <HoverTip
            x={sx(g.s.median)}
            y={Math.max(0, mid(hover) - 112)}
            width={width}
            title={g.name}
            rows={[
              { value: v(g.s.median), name: tr('median') },
              { value: `${v(g.s.q1)} – ${v(g.s.q3)}`, name: tr('the middle half') },
              { value: `${v(g.s.min)} – ${v(g.s.max)}`, name: tr('all of them') },
              { value: v(g.s.mean), name: tr('mean') },
              { value: fmtNum(g.s.n), name: g.s.n === 1 ? tr('value') : tr('values') },
            ]}
          />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-fg-3">
        <span className="inline-flex items-center gap-1.5">
          <svg width={18} height={10} aria-hidden>
            <rect x={1} y={1} width={16} height={8} rx={2} fill={wash(color, 24)} stroke={color} strokeWidth={1.5} />
          </svg>
          {tr('the middle half of the values')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LineKey color="var(--fg)" />
          {tr('median')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width={10} height={10} aria-hidden>
            <circle cx={5} cy={5} r={3.5} fill="var(--panel)" stroke="var(--fg)" strokeWidth={1.5} />
          </svg>
          {tr('mean')}
        </span>
        {groups.some((b) => b.out.length > 0) && (
          <span className="inline-flex items-center gap-1.5">
            <svg width={10} height={10} aria-hidden>
              <circle cx={5} cy={5} r={3.5} fill={color} />
            </svg>
            {tr('far from the rest')}
          </span>
        )}
      </div>
    </div>
  );
}

/** A histogram's numbers: each bin, its count and its share. */
function BinTable({ bins, unit }: { bins: Bin[]; unit: string }) {
  const total = bins.reduce((m, b) => m + b.count, 0);
  return (
    <div className="max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead className="sticky top-0 bg-bg-1">
          <tr>
            <th className="px-2.5 py-1.5 text-left font-medium text-fg-3">{tr('Range')}</th>
            <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Count')}</th>
            <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Share')}</th>
          </tr>
        </thead>
        <tbody>
          {bins.map((b, i) => (
            <tr key={i} className="border-t border-line/70">
              <td className="px-2.5 py-1 text-fg-2">{binText(b, unit)}</td>
              <td className="px-2.5 py-1 text-right">{fmtNum(b.count)}</td>
              <td className="px-2.5 py-1 text-right text-fg-3">{total ? shareText(b.count / total) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Box plots' numbers: each group's summary. */
function GroupTable({ groups, unit }: { groups: BoxGroup[]; unit: string }) {
  const d = decimalsFor(Math.max(...groups.map((g) => g.s.max)) - Math.min(...groups.map((g) => g.s.min)));
  const v = (x: number) => numText(x, unit, '', { maximumFractionDigits: d });
  const heads = [tr('Count'), tr('Median'), tr('Mean'), tr('Std. deviation'), tr('Lowest'), tr('Lower quartile'), tr('Upper quartile'), tr('Highest')];
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-[12.5px] tabular-nums">
        <thead className="bg-bg-1">
          <tr>
            <th className="px-2.5 py-1.5" />
            {heads.map((h) => (
              <th key={h} className="px-2.5 py-1.5 text-right font-medium whitespace-nowrap text-fg-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={i} className="border-t border-line/70">
              <td className="min-w-[8rem] px-2.5 py-1 text-fg-2">{g.name}</td>
              {[fmtNum(g.s.n), v(g.s.median), v(g.s.mean), v(g.s.sd), v(g.s.min), v(g.s.q1), v(g.s.q3), v(g.s.max)].map((x, k) => (
                <td key={k} className="px-2.5 py-1 text-right whitespace-nowrap">
                  {x}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Distribution({ data }: { data: Data }) {
  const [asTable, setAsTable] = useState(false);
  const unit = str(data.unit);
  const values = useMemo(
    () =>
      arr(data.values ?? data.data)
        .map((v) => num(v))
        .filter((v): v is number => v !== null),
    [data.values, data.data],
  );
  const width = num(data.bin_width ?? data.bin);
  const given = useMemo(
    () =>
      arr(data.bins)
        .filter(isObj)
        .map((b) => ({ from: num(b.from ?? b.start ?? b.min), to: num(b.to ?? b.end ?? b.max), count: num(b.count ?? b.n ?? b.value) }))
        .filter((b): b is Bin => b.from !== null && b.to !== null && b.to > b.from && b.count !== null && b.count >= 0)
        .sort((a, b) => a.from - b.from),
    [data.bins],
  );
  const bins = useMemo(() => (values.length ? binValues(values, width) : given), [values, width, given]);
  const estimated = !values.length && given.length > 0;
  const stats = useMemo(() => (values.length ? summarize(values) : summarizeBins(given)), [values, given]);
  const groups = useMemo(
    () =>
      arr(data.groups)
        .filter(isObj)
        .slice(0, 12)
        .map((g, i) =>
          boxOf(
            textOf(g, 'name', 'label', 'title') || `${tr('Group')} ${i + 1}`,
            arr(g.values ?? g.data)
              .map((v) => num(v))
              .filter((v): v is number => v !== null),
          ),
        )
        .filter((g): g is BoxGroup => !!g),
    [data.groups],
  );
  const marks = arr(data.marks)
    .filter(isObj)
    .map((m) => ({ value: num(m.value ?? m.x), label: textOf(m, 'label', 'name') }))
    .filter((m): m is RefMark => m.value !== null);
  return (
    <Card>
      <Head title={data.title} aside={bins.length > 0 || groups.length > 0 ? <TableToggle on={asTable} onChange={setAsTable} /> : undefined} />
      {bins.length > 0 && (asTable ? <BinTable bins={bins} unit={unit} /> : <Histogram bins={bins} stats={stats} marks={marks} unit={unit} />)}
      {stats && bins.length > 0 && <SummaryRow s={stats} unit={unit} estimated={estimated} keys={!asTable} />}
      {groups.length > 0 && <div className={cx(bins.length > 0 && 'mt-5 border-t border-line pt-4')}>{asTable ? <GroupTable groups={groups} unit={unit} /> : <BoxPlots groups={groups} marks={marks} unit={unit} />}</div>}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a waterfall: from a start, through gains and losses, to an end --------------------------------------------------

interface WfBar {
  label: string;
  kind: 'total' | 'up' | 'down';
  from: number;
  to: number;
  value: number;
  note: string;
}

/** The fills of a waterfall's bars: totals neutral, gains and losses in the colours of good and bad. */
const WF_FILL = { total: 'color-mix(in oklab, var(--fg-3) 72%, var(--panel))', up: 'var(--ok)', down: 'var(--err)' } as const;

/** A waterfall's bars: the start, each change from the running total (a subtotal shows it), an "Other" to a given end, the end. */
function waterfallBars(data: Data, done: boolean): { bars: WfBar[]; start: number | null; end: number | null } {
  const first = isObj(data.start) ? data.start : { value: data.start };
  const start = num(first.value ?? first.amount);
  const bars: WfBar[] = [];
  let run = start ?? 0;
  if (start !== null) bars.push({ label: textOf(first, 'label', 'name') || tr('Start'), kind: 'total', from: 0, to: start, value: start, note: str(first.note) });
  for (const st of arr(data.steps ?? data.changes).filter(isObj)) {
    const label = textOf(st, 'label', 'name');
    if (!label) continue;
    if (yes(st.subtotal) || yes(st.total)) {
      bars.push({ label, kind: 'total', from: 0, to: run, value: run, note: str(st.note) });
      continue;
    }
    const v = num(st.value ?? st.change ?? st.amount);
    if (v === null) continue;
    bars.push({ label, kind: v < 0 ? 'down' : 'up', from: run, to: run + v, value: v, note: str(st.note) });
    run += v;
  }
  // The end once the agent has written it (or the block is whole), so that it does not jump about while the steps arrive.
  const last = isObj(data.end) ? data.end : str(data.end) ? { label: str(data.end) } : null;
  if (!bars.length || (!last && !done)) return { bars, start, end: null };
  const given = last ? num(last.value ?? last.amount) : null;
  if (given !== null && Math.abs(given - run) > 1e-9 * Math.max(1, Math.abs(given))) {
    bars.push({ label: tr('Other'), kind: given < run ? 'down' : 'up', from: run, to: given, value: given - run, note: '' });
    run = given;
  }
  bars.push({ label: (last && textOf(last, 'label', 'name')) || tr('End'), kind: 'total', from: 0, to: run, value: run, note: '' });
  return { bars, start, end: run };
}

function Waterfall({ data, done }: { data: Data; done: boolean }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const { bars, start, end } = waterfallBars(data, done);
  const n = bars.length;
  const change = start !== null && end !== null && n > 2 ? end - start : null;
  const full = (x: number) => numText(x, unit, prefix);
  const levels = bars.flatMap((b) => [b.from, b.to]);
  const ticks = niceTicks(Math.min(0, ...levels), Math.max(0, ...levels), 4);
  const t0 = ticks[0];
  const t1 = ticks[ticks.length - 1];
  const tickText = (t: number) => shortText(t, unit.trim().length <= 3 ? unit : '', prefix);
  const axisW = Math.max(26, ...ticks.map((t) => textWidth(tickText(t), 11))) + 10;
  const plotW = Math.max(40, width - axisW - 4);
  const band = n ? plotW / n : plotW;
  // Columns when each has room for its label in two lines; else rows, each with its label on the left.
  const columns = band >= 62;
  // The amounts on the bars all short when any is large, so that they read alike.
  const short = bars.some((b) => Math.abs(b.value) >= 10_000);
  const barText = (b: WfBar) => (b.kind === 'total' ? shortText(b.value, unit, prefix, short) : signedText(b.value, unit, prefix, short));
  const tipRows = (b: WfBar) =>
    b.kind === 'total'
      ? [{ color: WF_FILL.total, value: full(b.value) }]
      : [
          { color: WF_FILL[b.kind], value: `${b.value > 0 ? '+' : ''}${full(b.value)}`, name: tr('change') },
          { value: full(b.to), name: tr('after it') },
        ];
  let chart: ReactNode = null;
  let tip: ReactNode = null;
  if (width > 0 && n > 0 && columns) {
    const per = Math.floor((band - 6) / 6.3);
    const lines = Math.max(...bars.map((b) => wrapText(b.label, per).length));
    const padT = 18;
    const plotH = 210;
    const H = padT + plotH + 10 + lines * 13;
    const sy = (v: number) => padT + plotH - ((v - t0) / (t1 - t0 || 1)) * plotH;
    const barW = Math.min(24, band * 0.6);
    const cxOf = (i: number) => axisW + band * i + band / 2;
    chart = (
      <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={bars.map((b) => b.label).join(', ')} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={axisW} x2={axisW + plotW} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={axisW - 6} y={sy(t)} dy="0.35em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
              {tickText(t)}
            </text>
          </g>
        ))}
        {hover !== null && <rect x={axisW + band * hover} y={padT - 16} width={band} height={plotH + 16} fill="var(--bg-2)" opacity={0.7} rx={4} />}
        {bars.slice(0, -1).map((b, i) => (
          <line key={i} x1={cxOf(i) + barW / 2} x2={cxOf(i + 1) - barW / 2} y1={sy(b.to)} y2={sy(b.to)} stroke="var(--line-2)" strokeWidth={1} shapeRendering="crispEdges" />
        ))}
        {bars.map((b, i) => {
          const top = sy(Math.max(b.from, b.to));
          const h = Math.max(1, Math.abs(sy(b.from) - sy(b.to)));
          // Rounded where the bar ends up: a gain's top, a loss's bottom, a total's end away from zero.
          const roundTop = b.kind === 'up' || (b.kind === 'total' && b.value >= 0);
          const below = b.kind === 'down' || (b.kind === 'total' && b.value < 0);
          const label = barText(b);
          return (
            <g key={i}>
              <path d={colPath(cxOf(i) - barW / 2, top, barW, h, roundTop)} fill={WF_FILL[b.kind]} />
              {textWidth(label, 11) <= band - 4 && (
                <text x={cxOf(i)} y={below ? top + h + 13 : top - 5} textAnchor="middle" className={cx('text-[11px] tabular-nums', b.kind === 'total' ? 'fill-fg font-semibold' : 'fill-fg-2')}>
                  {label}
                </text>
              )}
              {wrapText(b.label, per).map((l, k) => (
                <text key={k} x={cxOf(i)} y={padT + plotH + 16 + k * 13} textAnchor="middle" className={cx('text-[11px]', hover === i ? 'fill-fg' : 'fill-fg-3')}>
                  {l}
                </text>
              ))}
              <rect x={axisW + band * i} y={0} width={band} height={H} fill="transparent" onPointerEnter={() => setHover(i)} />
            </g>
          );
        })}
      </svg>
    );
    const b = hover !== null ? bars[hover] : null;
    if (b && hover !== null) tip = <HoverTip x={cxOf(hover) + barW / 2} y={Math.max(0, sy(Math.max(b.from, b.to)) - 40)} width={width} title={b.label} rows={tipRows(b)} />;
  } else if (width > 0 && n > 0) {
    const rowH = 30;
    const barH = 16;
    const nameW = Math.min(width * 0.4, Math.max(...bars.map((b) => textWidth(b.label, 12.5))) + 12);
    const valW = Math.max(...bars.map((b) => textWidth(barText(b), 12))) + 10;
    const left = nameW;
    const right = Math.max(left + 40, width - valW);
    const sx = (v: number) => left + ((v - t0) / (t1 - t0 || 1)) * (right - left);
    const H = n * rowH + 18;
    const yOf = (i: number) => i * rowH + (rowH - barH) / 2;
    // The amounts along the bottom: the ends always, those between where they keep clear of their neighbours.
    const tickW = (t: number) => tickText(t).length * 7;
    const lastStart = sx(t1) - tickW(t1);
    let edge = -Infinity;
    const shownTicks = new Set<number>();
    ticks.forEach((t, i) => {
      const w = tickW(t);
      const a = i === 0 ? sx(t) : i === ticks.length - 1 ? lastStart : sx(t) - w / 2;
      if (i === 0 || i === ticks.length - 1 || (a >= edge + 12 && a + w + 12 <= lastStart)) {
        shownTicks.add(i);
        edge = a + w;
      }
    });
    chart = (
      <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={bars.map((b) => b.label).join(', ')} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={sx(t)} x2={sx(t)} y1={0} y2={n * rowH} stroke={t === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
            {shownTicks.has(i) && (
              <text x={sx(t)} y={H - 3} textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'} className="fill-fg-3 text-[11px] tabular-nums">
                {tickText(t)}
              </text>
            )}
          </g>
        ))}
        {bars.slice(0, -1).map((b, i) => (
          <line key={i} x1={sx(b.to)} x2={sx(b.to)} y1={yOf(i) + barH} y2={yOf(i + 1)} stroke="var(--line-2)" strokeWidth={1} shapeRendering="crispEdges" />
        ))}
        {bars.map((b, i) => {
          const a = sx(Math.min(b.from, b.to));
          const w = Math.max(1, Math.abs(sx(b.to) - sx(b.from)));
          const roundRight = b.kind === 'up' || (b.kind === 'total' && b.value >= 0);
          return (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <rect x={0} y={i * rowH + 1} width={width} height={rowH - 2} rx={6} fill={hover === i ? 'var(--bg-2)' : 'transparent'} opacity={0.7} />
              <text x={nameW - 10} y={i * rowH + rowH / 2} dy="0.35em" textAnchor="end" className={cx('text-[12.5px]', b.kind === 'total' ? 'fill-fg font-medium' : 'fill-fg-2')}>
                {fitText(b.label, nameW - 14, 12.5)}
              </text>
              <path d={rowPath(a, yOf(i), w, barH, roundRight)} fill={WF_FILL[b.kind]} />
              <text x={width - 2} y={i * rowH + rowH / 2} dy="0.35em" textAnchor="end" className={cx('text-[12px] tabular-nums', b.kind === 'total' ? 'fill-fg font-semibold' : 'fill-fg-2')}>
                {barText(b)}
              </text>
            </g>
          );
        })}
      </svg>
    );
    const b = hover !== null ? bars[hover] : null;
    if (b && hover !== null) tip = <HoverTip x={sx(Math.max(b.from, b.to))} y={Math.max(0, hover * rowH - 46)} width={width} title={b.label} rows={tipRows(b)} />;
  }
  return (
    <Card>
      <Head title={data.title} className={change !== null ? 'mb-1' : undefined} aside={n > 0 ? <TableToggle on={asTable} onChange={setAsTable} /> : undefined} />
      {change !== null && start !== null && end !== null && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 text-[13px] tabular-nums">
          <span className="text-fg-3">
            {full(start)} → {full(end)}
          </span>
          <span className={cx('font-medium', change > 0 ? 'text-ok' : change < 0 ? 'text-err' : 'text-fg-3')}>
            {change > 0 ? '▲ +' : change < 0 ? '▼ ' : ''}
            {full(change)}
            {start !== 0 ? ` (${change > 0 ? '+' : change < 0 ? '−' : ''}${fmtNum(Math.abs(change / start) * 100, { maximumFractionDigits: 1 })}%)` : ''}
          </span>
        </div>
      )}
      <div ref={ref} className="relative">
        {asTable ? (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px] tabular-nums">
              <thead className="bg-bg-1">
                <tr>
                  <th className="px-2.5 py-1.5" />
                  <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Change')}</th>
                  <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Running total')}</th>
                </tr>
              </thead>
              <tbody>
                {bars.map((b, i) => (
                  <tr key={i} className={cx('border-t border-line/70', b.kind === 'total' && 'font-semibold')}>
                    <td className="px-2.5 py-1 text-fg-2">{b.label}</td>
                    <td className={cx('px-2.5 py-1 text-right', b.kind === 'up' && 'text-ok', b.kind === 'down' && 'text-err')}>{b.kind === 'total' ? '' : `${b.value > 0 ? '+' : ''}${full(b.value)}`}</td>
                    <td className="px-2.5 py-1 text-right">{full(b.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {chart}
            {tip}
          </>
        )}
      </div>
      {bars.some((b) => b.note) && (
        <ul className="m-0 mt-3 list-none space-y-1 border-t border-line p-0 pt-3 text-[12.5px] text-fg-2">
          {bars.map((b, i) =>
            b.note ? (
              <li key={i} className="flex gap-2">
                <span className="mt-[5px] h-2 w-2 shrink-0 rounded-[2px]" style={{ background: WF_FILL[b.kind] }} />
                <span className="min-w-0">
                  <span className="font-medium text-fg">{b.label}</span>: {b.note}
                </span>
              </li>
            ) : null,
          )}
        </ul>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a treemap ----------------------------------------------------------------------------------------------------------

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface TmLeaf {
  name: string;
  value: number;
  note: string;
}
interface TmItem extends TmLeaf {
  children: TmLeaf[];
  color: string;
}

/**
 * Rectangles for values filling a box, as near square as they can be (squarified): the largest first, each row along the
 * box's shorter side taking items while that makes its longest, thinnest rectangle less so.
 */
function squarify<T extends { value: number }>(items: T[], box: Box): (Box & { item: T })[] {
  const list = items.filter((it) => it.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((m, it) => m + it.value, 0);
  const out: (Box & { item: T })[] = [];
  if (!list.length || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  const rest = { ...box };
  let row: { item: T; area: number }[] = [];
  const worst = (r: { area: number }[], side: number) => {
    const sum = r.reduce((m, x) => m + x.area, 0);
    return r.reduce((m, x) => Math.max(m, (side * side * x.area) / (sum * sum), (sum * sum) / (side * side * x.area)), 0);
  };
  const place = () => {
    const sum = row.reduce((m, x) => m + x.area, 0);
    if (rest.w >= rest.h) {
      const w = Math.min(rest.w, sum / Math.max(1e-9, rest.h));
      let y = rest.y;
      for (const x of row) {
        const h = (x.area / sum) * rest.h;
        out.push({ x: rest.x, y, w, h, item: x.item });
        y += h;
      }
      rest.x += w;
      rest.w -= w;
    } else {
      const h = Math.min(rest.h, sum / Math.max(1e-9, rest.w));
      let x0 = rest.x;
      for (const x of row) {
        const w = (x.area / sum) * rest.w;
        out.push({ x: x0, y: rest.y, w, h, item: x.item });
        x0 += w;
      }
      rest.y += h;
      rest.h -= h;
    }
    row = [];
  };
  for (const item of list) {
    const area = item.value * scale;
    const side = Math.min(rest.w, rest.h);
    if (row.length && worst([...row, { item, area }], side) > worst(row, side)) place();
    row.push({ item, area });
  }
  if (row.length) place();
  return out;
}

function Treemap({ data, done }: { data: Data; done: boolean }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [open, setOpen] = useState<string | null>(null);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const items: TmItem[] = arr(data.items ?? data.children ?? data.groups)
    .filter(isObj)
    .map((it, i) => {
      const kids: TmLeaf[] = arr(it.children ?? it.items)
        .filter(isObj)
        .map((c) => ({ name: textOf(c, 'name', 'label', 'title'), value: Math.max(0, num(c.value ?? c.size ?? c.amount) ?? 0), note: str(c.note) }))
        .filter((c) => c.name && c.value > 0);
      const sum = kids.reduce((m, c) => m + c.value, 0);
      const own = num(it.value ?? it.size ?? it.amount);
      if (kids.length && own !== null && own > sum * 1.0001) kids.push({ name: tr('Other'), value: own - sum, note: '' });
      return { name: textOf(it, 'name', 'label', 'title'), value: kids.length ? Math.max(sum, own ?? 0) : Math.max(0, own ?? 0), note: str(it.note), children: kids, color: i < 8 ? seriesColor(i) : 'var(--fg-3)' };
    })
    .filter((it) => it.name && it.value > 0);
  const total = items.reduce((m, it) => m + it.value, 0);
  const group = open !== null ? (items.find((it) => it.name === open && it.children.length > 0) ?? null) : null;
  const H = Math.round(Math.max(220, Math.min(400, width * 0.56)));
  const v = (x: number) => numText(x, unit, prefix);
  const go = (name: string | null) => {
    if (!done) return;
    setOpen(name);
    setHover(null);
  };
  const point = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
  const keyed = (name: string) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      go(name);
    }
  };
  /** What each tile is, for the tooltip: its name, value, group, note, and whether a click opens a group. */
  const about = new Map<string, { name: string; value: number; group?: TmItem; note: string; opens?: boolean }>();
  /** A tile: its rectangle (2px apart from its neighbours), its name and value where they fit; `opens` the group it goes into. */
  const tile = (key: string, b: Box, name: string, value: number, color: string, opens?: string) => {
    const x = b.x + 1;
    const y = b.y + 1;
    const w = Math.max(0, b.w - 2);
    const h = Math.max(0, b.h - 2);
    const label = w >= 30 && h >= 20 ? fitText(name, w - 12, 12) : '';
    const amount = label && h >= 38 ? fitText(v(value), w - 12, 11.5) : '';
    const can = !!opens && done;
    return (
      <g
        key={key}
        onPointerMove={(e) => setHover({ key, ...point(e) })}
        onClick={can ? () => go(opens) : undefined}
        onKeyDown={can ? keyed(opens) : undefined}
        role={can ? 'button' : undefined}
        tabIndex={can ? 0 : undefined}
        aria-label={can ? `${name}, ${v(value)}` : undefined}
        className={can ? 'cursor-pointer outline-none' : undefined}
      >
        <rect x={x} y={y} width={w} height={h} rx={3} fill={wash(color, hover?.key === key ? 52 : 34)} />
        {label && (
          <text x={x + 6} y={y + 15} className="pointer-events-none fill-fg text-[12px] font-medium">
            {label}
          </text>
        )}
        {amount && (
          <text x={x + 6} y={y + 30} className="pointer-events-none fill-fg-2 text-[11.5px] tabular-nums">
            {amount}
          </text>
        )}
      </g>
    );
  };
  const drawn: ReactNode[] = [];
  if (width > 0 && group) {
    squarify(group.children, { x: 0, y: 0, w: width, h: H }).forEach((t, k) => {
      about.set(`c${k}`, { name: t.item.name, value: t.item.value, group, note: t.item.note });
      drawn.push(tile(`c${k}`, t, t.item.name, t.item.value, group.color));
    });
  } else if (width > 0) {
    squarify(items, { x: 0, y: 0, w: width, h: H }).forEach((t, i) => {
      const it = t.item;
      about.set(`i${i}`, { name: it.name, value: it.value, note: it.note, opens: it.children.length > 0 });
      // A group: its name over its children (its value too when both fit whole), which open it as well.
      const withValue = textWidth(it.name, 12) + textWidth(v(it.value), 11.5) + 22 <= t.w;
      const head = withValue ? it.name : fitText(it.name, t.w - 14, 12);
      if (!it.children.length || t.w < 64 || t.h < 52 || !head) {
        drawn.push(tile(`i${i}`, t, it.name, it.value, it.color, it.children.length ? it.name : undefined));
        return;
      }
      drawn.push(
        <g key={`i${i}`}>
          <rect x={t.x + 1} y={t.y + 1} width={t.w - 2} height={t.h - 2} rx={4} fill={wash(it.color, hover?.key === `i${i}` ? 26 : 16)} />
          <g
            onPointerMove={(e) => setHover({ key: `i${i}`, ...point(e) })}
            onClick={done ? () => go(it.name) : undefined}
            onKeyDown={done ? keyed(it.name) : undefined}
            role={done ? 'button' : undefined}
            tabIndex={done ? 0 : undefined}
            aria-label={done ? `${it.name}, ${v(it.value)}` : undefined}
            className={done ? 'cursor-pointer outline-none' : undefined}
          >
            <rect x={t.x + 1} y={t.y + 1} width={t.w - 2} height={20} fill="transparent" />
            <text x={t.x + 7} y={t.y + 15} className="pointer-events-none fill-fg text-[12px] font-semibold">
              {head}
              {withValue && (
                <tspan dx={6} className="fill-fg-3 font-normal tabular-nums">
                  {v(it.value)}
                </tspan>
              )}
            </text>
          </g>
          {squarify(it.children, { x: t.x + 3, y: t.y + 21, w: t.w - 6, h: t.h - 24 }).map((c, k) => {
            about.set(`i${i}:${k}`, { name: c.item.name, value: c.item.value, group: it, note: c.item.note, opens: true });
            return tile(`i${i}:${k}`, c, c.item.name, c.item.value, it.color, it.name);
          })}
        </g>,
      );
    });
  }
  const tip = hover ? about.get(hover.key) : undefined;
  const level = group
    ? group.children.map((c) => ({ name: c.name, value: c.value, note: c.note, color: group.color, opens: false }))
    : items.map((it) => ({ name: it.name, value: it.value, note: it.note, color: it.color, opens: it.children.length > 0 }));
  const whole = group ? group.value : total;
  return (
    <Card>
      <Head title={data.title} aside={total > 0 && !group ? <span className="text-[13px] font-semibold tabular-nums">{v(total)}</span> : undefined} />
      {group && (
        <div className="mb-2 flex min-w-0 items-center gap-1.5 text-[13px]">
          <button type="button" onClick={() => go(null)} className="inline-flex shrink-0 items-center gap-0.5 rounded-md py-0.5 pr-1.5 pl-0.5 font-medium text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg">
            <ChevronLeft size={15} />
            {tr('All')}
          </button>
          <span className="text-fg-3">/</span>
          <span className="truncate font-medium">{group.name}</span>
          <span className="shrink-0 text-fg-3 tabular-nums">
            {v(group.value)}
            {total ? ` · ${shareText(group.value / total)}` : ''}
          </span>
        </div>
      )}
      <div
        ref={ref}
        className="relative"
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && group) go(null);
        }}
      >
        {width > 0 && items.length > 0 && (
          <svg width={width} height={H} className="block" role="img" aria-label={(group ? group.children : items).map((x) => x.name).join(', ')}>
            {drawn}
          </svg>
        )}
        {hover && tip && (
          <NoteTip
            x={hover.x}
            y={hover.y > 96 ? hover.y - 84 : hover.y + 18}
            width={width}
            title={tip.group && !group ? `${tip.group.name} › ${tip.name}` : tip.name}
            rows={[
              { value: v(tip.value) },
              ...(total ? [{ value: shareText(tip.value / total), name: tr('of all') }] : []),
              ...(tip.group && tip.group.value ? [{ value: shareText(tip.value / tip.group.value), name: tr('of {0}').replace('{0}', tip.group.name) }] : []),
            ]}
            note={[tip.note, tip.opens && done ? tr('Click to see inside') : ''].filter(Boolean).join(' · ') || undefined}
          />
        )}
      </div>
      {level.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-x-6 p-0 @lg:grid-cols-2">
          {[...level]
            .sort((a, b) => b.value - a.value)
            .map((r, i) => {
              const body = (
                <>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: r.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{r.name}</span>
                    {r.note && <span className="block truncate text-[11.5px] text-fg-3">{r.note}</span>}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{v(r.value)}</span>
                  <span className="w-11 shrink-0 text-right text-[12px] text-fg-3 tabular-nums">{whole ? shareText(r.value / whole) : ''}</span>
                </>
              );
              return (
                <li key={`${i}:${r.name}`} className="min-w-0 border-b border-line/70">
                  {r.opens && done ? (
                    <button type="button" onClick={() => go(r.name)} className="flex w-full items-center gap-2.5 rounded-md py-1.5 text-left text-[13px] transition-colors hover:bg-bg-1">
                      {body}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2.5 py-1.5 text-[13px]">{body}</div>
                  )}
                </li>
              );
            })}
        </ul>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- an activity calendar ---------------------------------------------------------------------------------------------

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** The day `n` days after `d`, at noon (so no change of the clocks moves it to another day). */
const dayAfter = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const dayOf = (v: unknown): Date | null => {
  const t = str(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? parseDate(t) : null;
};
const daysFrom = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);

/** The day a week starts on where the app's language is spoken (0 Sunday … 6 Saturday); Monday when it cannot tell. */
function firstWeekday(): number {
  try {
    const l = new Intl.Locale(LOCALE ?? navigator.language ?? 'en') as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const f = (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay;
    if (typeof f === 'number' && f >= 1 && f <= 7) return f % 7;
  } catch {}
  return 1;
}

/** The five shades of a day: none, then four steps of one hue. */
const SHADES = ['var(--bg-2)', ...[30, 52, 76, 100].map((p) => `color-mix(in oklab, var(--viz-1) ${p}%, var(--bg-2))`)];

function Activity({ data }: { data: Data }) {
  const [box, width] = useBoxWidth<HTMLDivElement>();
  const scroller = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const ws = useMemo(firstWeekday, []);
  const unit = str(data.unit);
  const minutes = /^(min|mins|minutes?)$/i.test(unit.trim());
  const amounts = useMemo(() => {
    const m = new Map<string, number>();
    const add = (k: string, v: number | null) => {
      if (v !== null && /^\d{4}-\d{2}-\d{2}$/.test(k)) m.set(k, (m.get(k) ?? 0) + v);
    };
    if (isObj(data.days)) for (const [k, v] of Object.entries(data.days)) add(k.slice(0, 10), typeof v === 'boolean' ? (v ? 1 : 0) : num(v));
    else for (const d of arr(data.days ?? data.items)) if (isObj(d)) add(str(d.date ?? d.day).slice(0, 10), num(d.value ?? d.count ?? d.amount) ?? (d.done === undefined ? null : yes(d.done) ? 1 : 0));
    return m;
  }, [data.days, data.items]);
  const today = dayAfter(new Date(), 0);
  const keys = [...amounts.keys()].sort();
  const last = dayOf(data.end) ?? dayOf(keys[keys.length - 1]);
  let first = dayOf(data.start) ?? dayOf(keys[0]);
  if (first && last && daysFrom(first, last) > 3 * 366) first = dayAfter(last, -3 * 366);
  const ok = !!first && !!last && daysFrom(first, last) >= 0;
  // While there is no range yet (the data still on its way), today stands in for it: nothing of it is drawn.
  const from = ok ? first! : today;
  const to = ok ? last! : today;
  const lead = (from.getDay() - ws + 7) % 7;
  const gridStart = dayAfter(from, -lead);
  const nDays = daysFrom(gridStart, to) + 1;
  const weeks = Math.ceil(nDays / 7);
  const labelW = 30;
  const pitch = Math.max(11, Math.min(22, Math.floor((width - labelW) / Math.max(1, weeks))));
  const gap = pitch >= 16 ? 3 : 2;
  const cell = pitch - gap;
  const topH = 18;
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [weeks, pitch, ok]);
  const valueAt = (d: Date) => amounts.get(isoDay(d)) ?? 0;
  // The days shown, their total, the days with something, the best one and the longest run of them.
  let total = 0;
  let active = 0;
  let best: { v: number; d: Date } | null = null;
  let run = 0;
  let longest = { n: 0, end: from };
  const shown: { i: number; d: Date; v: number }[] = [];
  for (let i = lead; ok && i < nDays; i++) {
    const d = dayAfter(gridStart, i);
    const v = valueAt(d);
    shown.push({ i, d, v });
    if (v > 0) {
      total += v;
      active++;
      run++;
      if (run > longest.n) longest = { n: run, end: d };
      if (!best || v > best.v) best = { v, d };
    } else run = 0;
  }
  // The streak now: back from today (from yesterday while today has nothing yet), or from the last day shown.
  let streakEnd = daysFrom(today, to) >= 0 ? today : to;
  if (valueAt(streakEnd) <= 0 && daysFrom(streakEnd, today) === 0) streakEnd = dayAfter(streakEnd, -1);
  let current = 0;
  while (ok && daysFrom(from, dayAfter(streakEnd, -current)) >= 0 && valueAt(dayAfter(streakEnd, -current)) > 0) current++;
  const showCurrent = ok && daysFrom(to, today) <= 1;
  const positives = shown
    .map((x) => x.v)
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const cuts = [0.25, 0.5, 0.75].map((p) => quantile(positives, p));
  const shade = (v: number) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
  const amount = (v: number) => (minutes ? fmtMinutes(v) : numText(v, unit));
  const edges = [positives[0], ...cuts, positives[positives.length - 1]];
  const rangeOf = (k: number) => (k === 0 ? tr('None') : `${amount(edges[k - 1])} – ${amount(edges[k])}`);
  const daysText = (k: number) => (k === 1 ? tr('1 day') : tr('{0} days').replace('{0}', fmtNum(k)));
  // Months along the top, over the week each starts in; the first only when the next does not crowd it.
  const months: { x: number; text: string }[] = [];
  for (let m = new Date(from.getFullYear(), from.getMonth(), 1, 12); ok && daysFrom(m, to) >= 0; m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12)) {
    const at = daysFrom(from, m) < 0 ? from : m;
    months.push({ x: labelW + Math.floor(daysFrom(gridStart, at) / 7) * pitch, text: fmtDate(at, 'month') });
  }
  if (months.length > 1 && months[1].x - months[0].x < textWidth(months[0].text, 11) + 6) months.shift();
  const svgW = labelW + weeks * pitch;
  const lastMonth = months[months.length - 1];
  if (lastMonth) {
    lastMonth.x = Math.min(lastMonth.x, svgW - textWidth(lastMonth.text, 11) - 2);
    const before = months[months.length - 2];
    if (before && lastMonth.x - before.x < textWidth(before.text, 11) + 6) months.pop();
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left - labelW) / pitch);
    const row = Math.floor((e.clientY - r.top - topH) / pitch);
    const i = col * 7 + row;
    if (col < 0 || row < 0 || row > 6 || col >= weeks || i < lead || i >= nDays) return setHover(null);
    const b = box.current?.getBoundingClientRect();
    setHover({ i, x: r.left - (b?.left ?? 0) + labelW + col * pitch + cell / 2, y: r.top - (b?.top ?? 0) + topH + row * pitch });
  };
  const hd = hover ? dayAfter(gridStart, hover.i) : null;
  const hv = hd ? valueAt(hd) : 0;
  const at = (d: Date) => ({ x: labelW + Math.floor((lead + daysFrom(from, d)) / 7) * pitch, y: topH + ((lead + daysFrom(from, d)) % 7) * pitch });
  return (
    <Card>
      <Head title={data.title} sub={ok ? `${fmtDate(from, 'medium')} – ${fmtDate(to, 'medium')}` : undefined} />
      {ok && (
        <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
          <Figure label={tr('Total')} value={amount(total)} sub={tr('on {0} of {1} days').replace('{0}', fmtNum(active)).replace('{1}', fmtNum(shown.length))} />
          <Figure label={tr('Longest streak')} value={daysText(longest.n)} sub={longest.n > 1 ? `${fmtDate(dayAfter(longest.end, 1 - longest.n), 'short')} – ${fmtDate(longest.end, 'short')}` : longest.n ? fmtDate(longest.end, 'short') : undefined} />
          {showCurrent && <Figure label={tr('Current streak')} value={daysText(current)} sub={current > 0 ? tr('since {0}').replace('{0}', fmtDate(dayAfter(streakEnd, 1 - current), 'short')) : undefined} />}
          {best && <Figure label={tr('Best day')} value={amount(best.v)} sub={fmtDate(best.d, 'dayMonth')} />}
        </div>
      )}
      <div ref={box} className={cx('relative', ok && 'mt-4')} onPointerLeave={() => setHover(null)}>
        {ok && width > 0 && (
          <div ref={scroller} className="overflow-x-auto">
            <svg width={svgW} height={topH + 7 * pitch} className="block" role="img" aria-label={str(data.title) || tr('Activity')} onPointerMove={onMove}>
              {months.map((m, k) => (
                <text key={k} x={m.x} y={11} className="fill-fg-3 text-[11px]">
                  {m.text}
                </text>
              ))}
              {[0, 1, 2, 3, 4, 5, 6].map((r) => {
                const d = dayAfter(gridStart, r);
                return [1, 3, 5].includes(d.getDay()) ? (
                  <text key={r} x={0} y={topH + r * pitch + cell / 2} dy="0.35em" className="fill-fg-3 text-[10.5px]">
                    {fmtDate(d, 'weekday')}
                  </text>
                ) : null;
              })}
              {shown.map(({ i, d, v }) => (
                <rect key={i} x={labelW + Math.floor(i / 7) * pitch} y={topH + (i % 7) * pitch} width={cell} height={cell} rx={Math.min(3, cell / 4)} fill={SHADES[shade(v)]} opacity={daysFrom(today, d) > 0 ? 0.45 : 1} />
              ))}
              {daysFrom(from, today) >= 0 && daysFrom(today, to) >= 0 && (
                <rect x={at(today).x - 0.5} y={at(today).y - 0.5} width={cell + 1} height={cell + 1} rx={Math.min(3, cell / 4) + 0.5} fill="none" stroke="var(--fg)" strokeWidth={1.5} className="pointer-events-none" />
              )}
              {hd && <rect x={at(hd).x - 1} y={at(hd).y - 1} width={cell + 2} height={cell + 2} rx={Math.min(3, cell / 4) + 1} fill="none" stroke="var(--fg-2)" strokeWidth={1} className="pointer-events-none" />}
            </svg>
          </div>
        )}
        {hover && hd && <HoverTip x={hover.x} y={Math.max(0, hover.y - 52)} width={width} title={fmtDate(hd, 'long')} rows={[{ color: SHADES[shade(hv)], value: hv > 0 ? amount(hv) : tr('None') }]} />}
      </div>
      {positives.length > 0 && (
        <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-fg-3">
          <span className="mr-0.5">{tr('Less')}</span>
          {SHADES.map((c, k) => (
            <span key={k} title={rangeOf(k)} className="inline-block h-[11px] w-[11px] rounded-[3px]" style={{ background: c }} />
          ))}
          <span className="ml-0.5">{tr('More')}</span>
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- values on a map ----------------------------------------------------------------------------------------------------

function MapValues({ data }: { data: Data }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const raw = arr(data.points ?? data.places ?? data.items).filter(isObj);
  const key = JSON.stringify(raw);
  const points = useMemo(
    () =>
      mapPoints(
        raw.map((p) => {
          const n = num(p.value ?? p.count ?? p.amount);
          return { ...p, name: textOf(p, 'name', 'label', 'place', 'title'), value: n, tip: [n !== null ? numText(n, unit, prefix) : '', str(p.note)].filter(Boolean).join(' · ') };
        }),
        'name',
        'tip',
        'value',
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, unit, prefix],
  );
  const rows = raw
    .map((p) => ({ name: textOf(p, 'name', 'label', 'place', 'title'), value: num(p.value ?? p.count ?? p.amount), note: str(p.note) }))
    .filter((r) => r.name)
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.value ?? 0)));
  const wide = width >= 600;
  const listed = rows.length <= 11 ? rows.length : 10;
  const height = wide ? Math.max(300, Math.min(440, listed * 40 + 20)) : 280;
  return (
    <Card>
      <Head title={data.title} />
      <div ref={ref} className={cx('grid gap-x-5 gap-y-3', wide && points.length > 0 && 'grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]')}>
        {points.length > 0 && <MapBox points={points} sized numbered={false} height={height} />}
        {rows.length > 0 && (
          <div className="min-w-0">
            <More
              items={rows}
              n={10}
              render={(r, i) => (
                <div key={i} className="flex items-center gap-2.5 border-b border-line/70 py-1.5 last:border-b-0">
                  <span className={cx('w-5 shrink-0 text-right text-[12.5px] font-semibold tabular-nums', i === 0 ? 'text-accent' : 'text-fg-3')}>{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate font-medium">{r.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{r.value !== null ? numText(r.value, unit, prefix) : '—'}</span>
                    </div>
                    {r.value !== null && max > 0 && <Meter value={Math.abs(r.value)} max={max} thin color="var(--accent)" className="mt-1" />}
                    {r.note && <div className="mt-0.5 truncate text-[11.5px] text-fg-3">{r.note}</div>}
                  </div>
                </div>
              )}
            />
          </div>
        )}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

export const DATA_UIS: Record<string, AnswerUiView> = {
  chart: Chart,
  table: DataTable,
  stats: Stats,
  heatmap: Heatmap,
  gauge: Gauge,
  funnel: Funnel,
  breakdown: Breakdown,
  plot: Plot,
  calculator: Calculator,
  progress: Progress,
  results: Results,
  sankey: Sankey,
  distribution: Distribution,
  waterfall: Waterfall,
  treemap: Treemap,
  activity: Activity,
  'map-values': MapValues,
};
