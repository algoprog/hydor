// The answer UIs for numbers: their views, by name (shared/answer-ui/data.ts has what each takes).
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowDownWideNarrow, ArrowUp, ArrowUpNarrowWide, Check, Download, Search, Table2 } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { ChartTable, PieChart, RadarChart, ScatterChart, Sparkline, XYChart, type ScatterPoint, type XYKind } from '../charts';
import {
  arr,
  Card,
  Chip,
  compact,
  Copy,
  Delta,
  download,
  fmtDate,
  fmtMoney,
  fmtNum,
  Head,
  isObj,
  LinkOut,
  Md,
  Meter,
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

function TableCell({ c, v, max }: { c: Col; v: unknown; max: number }) {
  if (v === null || v === undefined || v === '') return <span className="text-fg-3">—</span>;
  switch (c.type) {
    case 'link':
      return <LinkOut url={v}>{/^https?:/i.test(str(v)) ? undefined : str(v)}</LinkOut>;
    case 'image':
      return <Pic src={v} className="h-10 w-10 rounded-md" />;
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

/** The width of an element, as it changes. */
export function useBoxWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

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
};
