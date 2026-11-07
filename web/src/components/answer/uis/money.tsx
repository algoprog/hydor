// The answer UIs for money (stock quotes, loans, budgets, savings growth, pricing plans, splitting a bill): their views, by name (shared/answer-ui/money.ts has what each takes).
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, MessageSquarePlus, Target, X } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { niceTicks, XYChart } from '../charts';
import { arr, Btn, Card, Chip, Copy, fmtDate, fmtMoney, fmtNum, Head, isObj, KeyValues, LinkOut, Md, Meter, num, parseDate, Section, Seg, seriesColor, str, textOf, useAsk, useKept, yes, type AnswerUiView, type Data } from '../kit';
import { currencySign, HoverTip, niceStep, shareText, SliderRow, useBoxWidth } from './data';

/** Money as the app's language writes it; whole amounts without cents. */
function money(n: number | null | undefined, currency: string, whole = false): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const round = whole || Math.abs(n) >= 1000 || Number.isInteger(n);
  return fmtMoney(round ? Math.round(n) : n, currency, round ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A round number at or above `x` (1, 2, 2.5, 5 times a power of ten): a slider's end. */
function niceCeil(x: number): number {
  if (!(x > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(x));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** A length of time in months as years and months: "24 years 8 months". */
function spanText(months: number): string {
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  const ys = y === 1 ? tr('1 year') : y ? tr('{0} years').replace('{0}', fmtNum(y)) : '';
  const ms = m === 1 ? tr('1 month') : m ? tr('{0} months').replace('{0}', fmtNum(m)) : '';
  return [ys, ms].filter(Boolean).join(' ') || tr('{0} months').replace('{0}', '0');
}

/** A figure in a tile: its label, the amount large, a line under it. */
function Tile({ label, value, sub, tone, big }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad'; big?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-bg-1 px-3.5 py-3">
      <div className="truncate text-[12.5px] text-fg-3">{label}</div>
      <div className={cx('mt-0.5 leading-tight font-semibold tracking-tight tabular-nums', big ? 'text-[24px]' : 'text-[19px]', tone === 'good' && 'text-ok', tone === 'bad' && 'text-err')}>{value || '—'}</div>
      {sub && <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{sub}</div>}
    </div>
  );
}

// ---- a stock quote ----------------------------------------------------------------------------------------------------

const RANGES = [
  { id: '1M', days: 31 },
  { id: '6M', days: 183 },
  { id: '1Y', days: 366 },
];

function RangeBar({ label, low, high, at, currency }: { label: string; low: number; high: number; at: number | null; currency: string }) {
  const f = high > low && at !== null ? Math.max(0, Math.min(1, (at - low) / (high - low))) : null;
  return (
    <div className="min-w-0 text-[12.5px]">
      <div className="mb-1 text-fg-3">{label}</div>
      <div className="flex items-center gap-2 tabular-nums">
        <span className="text-fg-2">{money(low, currency)}</span>
        <span className="relative h-1.5 min-w-10 flex-1 rounded-full bg-bg-3">
          {f !== null && <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-fg" style={{ left: `${f * 100}%` }} />}
        </span>
        <span className="text-fg-2">{money(high, currency)}</span>
      </div>
    </div>
  );
}

const dateFormat = (d: Date, o: Intl.DateTimeFormatOptions) => {
  try {
    return new Intl.DateTimeFormat(LOCALE, o).format(d);
  } catch {
    return d.toDateString();
  }
};

/** A price over time, on a time scale (the points may be daily for a while and weekly before), with the price under the pointer. */
function PriceChart({ points, currency, height = 210 }: { points: { d: Date; close: number }[]; currency: string; height?: number }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const sign = currencySign(currency);
  const t0 = points[0].d.getTime();
  const t1 = points[points.length - 1].d.getTime();
  const closes = points.map((p) => p.close);
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.02 || 1;
  const ticks = niceTicks(lo - pad, hi + pad, 4);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const tickText = (v: number) => `${sign}${fmtNum(v, { maximumFractionDigits: y1 - y0 < 5 ? 2 : 0 })}`;
  const axisW = Math.max(...ticks.map((t) => tickText(t).length)) * 6.6 + 10;
  const padT = 8;
  const plotW = Math.max(10, width - axisW - 6);
  const plotH = height - padT - 22;
  const sx = (t: number) => axisW + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const sy = (v: number) => padT + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.d.getTime()).toFixed(1)},${sy(p.close).toFixed(1)}`).join('');
  // Dates along the bottom: days for a month or two, months for up to two years, years past that.
  const day = 86_400_000;
  const span = (t1 - t0) / day;
  const marks: { t: number; label: string }[] = [];
  if (span <= 62) {
    const step = Math.max(1, Math.round(span / Math.max(2, Math.floor(plotW / 90))));
    for (let t = t0; t <= t1; t += step * day) marks.push({ t, label: dateFormat(new Date(t), { day: 'numeric', month: 'short' }) });
  } else if (span <= 800) {
    const every = Math.max(1, Math.ceil(span / 30.4 / Math.max(2, Math.floor(plotW / 64))));
    const d = new Date(points[0].d.getFullYear(), points[0].d.getMonth() + 1, 1, 12);
    for (let k = 0; d.getTime() <= t1; k++, d.setMonth(d.getMonth() + 1)) if (k % every === 0) marks.push({ t: d.getTime(), label: dateFormat(d, d.getMonth() === 0 ? { month: 'short', year: 'numeric' } : { month: 'short' }) });
  } else {
    const every = Math.max(1, Math.ceil(span / 365 / Math.max(2, Math.floor(plotW / 56))));
    const d = new Date(points[0].d.getFullYear() + 1, 0, 1, 12);
    for (let k = 0; d.getTime() <= t1; k++, d.setFullYear(d.getFullYear() + 1)) if (k % every === 0) marks.push({ t: d.getTime(), label: String(d.getFullYear()) });
  }
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const t = t0 + ((e.clientX - r.left) / (r.width || 1)) * (t1 - t0);
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(points[i].d.getTime() - t) < Math.abs(points[best].d.getTime() - t)) best = i;
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={tr('Price')}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={axisW} x2={axisW + plotW} y1={sy(t)} y2={sy(t)} stroke={i === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={axisW - 6} y={sy(t)} dy="0.35em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
                {tickText(t)}
              </text>
            </g>
          ))}
          {marks.map((m, i) => (
            <text key={i} x={Math.min(Math.max(sx(m.t), axisW + 18), axisW + plotW - 18)} y={padT + plotH + 15} textAnchor="middle" className="fill-fg-3 text-[11px]">
              {m.label}
            </text>
          ))}
          <path d={`${line}L${sx(t1).toFixed(1)},${padT + plotH}L${sx(t0).toFixed(1)},${padT + plotH}Z`} fill={seriesColor(0)} opacity={0.1} />
          <path d={line} fill="none" stroke={seriesColor(0)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hp && (
            <g>
              <line x1={sx(hp.d.getTime())} x2={sx(hp.d.getTime())} y1={padT} y2={padT + plotH} stroke="var(--line-2)" strokeWidth={1} />
              <circle cx={sx(hp.d.getTime())} cy={sy(hp.close)} r={4} fill={seriesColor(0)} stroke="var(--panel)" strokeWidth={2} />
            </g>
          )}
          <rect x={axisW} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hp && <HoverTip x={sx(hp.d.getTime())} y={Math.max(0, sy(hp.close) - 56)} width={width} title={fmtDate(hp.d, 'medium')} rows={[{ value: money(hp.close, currency) }]} />}
    </div>
  );
}

function Stock({ data, done }: { data: Data; done: boolean }) {
  const cur = str(data.currency) || 'USD';
  const price = num(data.price);
  const change = num(data.change);
  const changePct = num(data.change_pct);
  const hist = useMemo(
    () =>
      arr(data.history)
        .filter(isObj)
        .map((h) => ({ d: parseDate(h.date), close: num(h.close ?? h.price ?? h.value) }))
        .filter((h): h is { d: Date; close: number } => !!h.d && h.close !== null)
        .sort((a, b) => a.d.getTime() - b.d.getTime()),
    [data.history],
  );
  const spanDays = hist.length > 1 ? (hist[hist.length - 1].d.getTime() - hist[0].d.getTime()) / 86_400_000 : 0;
  const options = [...RANGES.filter((r) => spanDays >= r.days * 0.75).map((r) => r.id), ...(spanDays > 366 * 1.1 ? ['All'] : [])];
  const [range, setRange] = useKept<string>('range', '');
  const pick = options.includes(range) ? range : options.includes('1Y') ? '1Y' : (options[options.length - 1] ?? 'All');
  const days = RANGES.find((r) => r.id === pick)?.days ?? Infinity;
  const end = hist.length ? hist[hist.length - 1].d.getTime() : 0;
  const shown = days === Infinity ? hist : hist.filter((h) => end - h.d.getTime() <= days * 86_400_000);
  const moved = shown.length > 1 ? shown[shown.length - 1].close / shown[0].close - 1 : null;
  const dir = change ?? changePct ?? 0;
  const day = isObj(data.day) ? { low: num(data.day.low), high: num(data.day.high) } : null;
  const year = isObj(data.year) ? { low: num(data.year.low), high: num(data.year.high) } : null;
  const stats = arr(data.stats).filter(isObj);
  const news = arr(data.news).filter(isObj);
  const pctText = (p: number) => `${p > 0 ? '+' : p < 0 ? '−' : ''}${fmtNum(Math.abs(p), { maximumFractionDigits: 2 })}%`;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="aui-h3 text-[18px]">{str(data.symbol)}</h3>
            {str(data.exchange) && <Chip>{str(data.exchange)}</Chip>}
          </div>
          {str(data.name) && <div className="text-[13px] text-fg-3">{str(data.name)}</div>}
        </div>
        <div className="text-right">
          <div className="text-[30px] leading-none font-semibold tracking-tight tabular-nums">{price !== null ? money(price, cur) : '—'}</div>
          {(change !== null || changePct !== null) && (
            <div className={cx('mt-1 text-[13px] font-medium tabular-nums', dir > 0 ? 'text-ok' : dir < 0 ? 'text-err' : 'text-fg-3')}>
              {dir > 0 ? '▲' : dir < 0 ? '▼' : ''} {change !== null && `${change > 0 ? '+' : change < 0 ? '−' : ''}${money(Math.abs(change), cur)}`} {changePct !== null && (change !== null ? `(${pctText(changePct)})` : pctText(changePct))}
            </div>
          )}
          {str(data.as_of) && <div className="mt-0.5 text-[11.5px] text-fg-3">{tr('As of {0}').replace('{0}', /T|\d:\d/.test(str(data.as_of)) ? fmtDate(data.as_of, 'dateTime') : fmtDate(data.as_of))}</div>}
        </div>
      </div>
      {shown.length > 1 && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {options.length > 1 && done ? <Seg size="sm" options={options.map((o) => ({ value: o, label: ({ '1M': tr('1M'), '6M': tr('6M'), '1Y': tr('1Y') } as Record<string, string>)[o] ?? tr('All') }))} value={pick} onChange={setRange} /> : <span />}
            {moved !== null && (
              <span className={cx('text-[12.5px] font-medium tabular-nums', moved > 0 ? 'text-ok' : moved < 0 ? 'text-err' : 'text-fg-3')}>
                {moved > 0 ? '▲' : moved < 0 ? '▼' : ''} {pctText(moved * 100)}
                <span className="ml-1 font-normal text-fg-3">{tr('since {0}').replace('{0}', fmtDate(shown[0].d))}</span>
              </span>
            )}
          </div>
          <PriceChart points={shown} currency={cur} />
        </div>
      )}
      {((day && day.low !== null && day.high !== null) || (year && year.low !== null && year.high !== null)) && (
        <div className="mt-4 grid gap-x-6 gap-y-3 @lg:grid-cols-2">
          {day && day.low !== null && day.high !== null && <RangeBar label={tr('Today’s range')} low={day.low} high={day.high} at={price} currency={cur} />}
          {year && year.low !== null && year.high !== null && <RangeBar label={tr('52-week range')} low={year.low} high={year.high} at={price} currency={cur} />}
        </div>
      )}
      {stats.length > 0 && (
        <Section className="mt-4">
          <KeyValues cols={2} rows={stats.map((s) => ({ label: textOf(s, 'label', 'name'), value: typeof s.value === 'number' ? fmtNum(s.value) : s.value }))} />
        </Section>
      )}
      {news.length > 0 && (
        <Section title={tr('Headlines')} className="mt-4">
          <ul className="m-0 list-none space-y-2.5 p-0">
            {news.map((n, i) => (
              <li key={i} className="text-[13.5px] leading-snug">
                {str(n.url) ? (
                  <LinkOut url={n.url} icon={false} className="font-medium text-fg">
                    {textOf(n, 'title', 'headline')}
                  </LinkOut>
                ) : (
                  <span className="font-medium">{textOf(n, 'title', 'headline')}</span>
                )}
                {(str(n.source) || str(n.date)) && <div className="mt-0.5 text-[12px] text-fg-3">{[str(n.source), str(n.date) ? fmtDate(n.date) : ''].filter(Boolean).join(' · ')}</div>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Card>
  );
}

// ---- a loan -----------------------------------------------------------------------------------------------------------

interface Amort {
  payment: number;
  months: number;
  interest: number;
  years: { principal: number; interest: number; balance: number }[];
  balances: number[];
}

/** A loan paid monthly: the payment, how long it takes (sooner with extra), the interest, and each year's share. */
function amortize(principal: number, ratePct: number, years: number, extra: number): Amort {
  const n = Math.max(1, Math.min(1200, Math.round(years * 12)));
  const r = Math.max(0, ratePct) / 100 / 12;
  const payment = principal <= 0 ? 0 : r === 0 ? principal / n : (principal * r) / (1 - (1 + r) ** -n);
  let bal = Math.max(0, principal);
  let months = 0;
  let interest = 0;
  let yp = 0;
  let yi = 0;
  const out: Amort = { payment, months: 0, interest: 0, years: [], balances: [bal] };
  while (bal > 0.005 && months < n + 1) {
    const int = bal * r;
    const princ = Math.min(bal, payment + Math.max(0, extra) - int);
    if (princ <= 0) break;
    bal -= princ;
    interest += int;
    yp += princ;
    yi += int;
    months++;
    if (months % 12 === 0 || bal <= 0.005) {
      out.years.push({ principal: yp, interest: yi, balance: Math.max(0, bal) });
      out.balances.push(Math.max(0, bal));
      yp = yi = 0;
    }
  }
  return { ...out, months, interest };
}

function Loan({ data, done }: { data: Data; done: boolean }) {
  const cur = str(data.currency) || 'USD';
  const sign = currencySign(cur);
  const init = { principal: num(data.principal ?? data.amount) ?? 0, rate: num(data.rate) ?? 0, years: num(data.years ?? data.term) ?? 0, extra: num(data.extra) ?? 0 };
  const [mine, setMine] = useKept<Partial<Record<keyof typeof init, number>>>('loan', {});
  const [table, setTable] = useState(false);
  const v = { ...init, ...mine };
  const set = (k: keyof typeof init) => (n: number) => done && setMine((m) => ({ ...m, [k]: n }));
  const a = useMemo(() => amortize(v.principal, v.rate, v.years, v.extra), [v.principal, v.rate, v.years, v.extra]);
  const plain = useMemo(() => (v.extra > 0 ? amortize(v.principal, v.rate, v.years, 0) : null), [v.principal, v.rate, v.years, v.extra]);
  const firstPay = useMemo(() => amortize(init.principal, init.rate, init.years, 0).payment, [init.principal, init.rate, init.years]);
  const start = /^\d{4}-\d{2}/.test(str(data.start)) ? parseDate(str(data.start).slice(0, 7)) : null;
  const lastPay = start && a.months ? new Date(start.getFullYear(), start.getMonth() + a.months - 1, 15) : null;
  const pMax = niceCeil(Math.max(init.principal * 2, 1000));
  const eMax = niceCeil(Math.max(firstPay, init.extra * 3, 100));
  const label = (i: number) => (start ? String(start.getFullYear() + i) : String(i));
  if (!(init.principal > 0) && !(v.principal > 0)) return <Card>{str(data.title) ? <Head title={data.title} /> : null}</Card>;
  return (
    <Card>
      <Head title={data.title} />
      <div className="grid gap-x-8 gap-y-5 @xl:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <SliderRow label={tr('Amount borrowed')} value={v.principal} min={0} max={pMax} step={niceStep(pMax)} onChange={set('principal')} disabled={!done} box prefix={sign} />
          <SliderRow label={tr('Interest rate')} value={v.rate} min={0} max={Math.max(15, Math.ceil(init.rate * 2))} step={0.05} onChange={set('rate')} disabled={!done} box unit="%" />
          <SliderRow label={tr('Years')} value={v.years} min={1} max={Math.max(40, Math.ceil(init.years))} step={1} onChange={set('years')} disabled={!done} box />
          <SliderRow label={tr('Extra each month')} value={v.extra} min={0} max={eMax} step={niceStep(eMax)} onChange={set('extra')} disabled={!done} box prefix={sign} />
        </div>
        <div className="grid min-w-0 grid-cols-2 content-start gap-2">
          <Tile big label={tr('Each month')} value={money(a.payment + Math.max(0, v.extra), cur)} sub={v.extra > 0 ? tr('{0} plus {1} extra').replace('{0}', money(a.payment, cur)).replace('{1}', money(v.extra, cur)) : undefined} />
          <Tile big label={tr('Total interest')} value={money(a.interest, cur, true)} sub={tr('{0} paid in all').replace('{0}', money(v.principal + a.interest, cur, true))} />
          <div className="col-span-2">
            <Tile
              label={tr('Paid off')}
              value={lastPay ? fmtDate(lastPay, 'monthYear') : spanText(a.months)}
              sub={
                plain && plain.months > a.months
                  ? tr('{0} sooner, saving {1} in interest').replace('{0}', spanText(plain.months - a.months)).replace('{1}', money(plain.interest - a.interest, cur, true))
                  : lastPay
                    ? tr('in {0}').replace('{0}', spanText(a.months))
                    : undefined
              }
            />
          </div>
        </div>
      </div>
      {a.balances.length > 1 && (
        <div className="mt-5">
          <div className="mb-1 aui-h4">{tr('Balance')}</div>
          <XYChart
            kind="line"
            x={Array.from({ length: Math.max(a.balances.length, plain?.balances.length ?? 0) }, (_, i) => label(i))}
            series={plain ? [{ name: tr('With the extra'), values: a.balances }, { name: tr('Without it'), values: plain.balances }] : [{ name: tr('Balance'), values: a.balances }]}
            prefix={sign}
            min={0}
            height={200}
          />
        </div>
      )}
      {a.years.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setTable((t) => !t)} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
            {table ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {table ? tr('Hide the yearly table') : tr('Year by year')}
          </button>
          {table && (
            <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[12.5px] tabular-nums">
                <thead className="sticky top-0 bg-bg-1">
                  <tr>
                    <th className="px-2.5 py-1.5 text-left font-medium text-fg-3">{tr('Year')}</th>
                    <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Principal')}</th>
                    <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Interest')}</th>
                    <th className="px-2.5 py-1.5 text-right font-medium text-fg-3">{tr('Balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {a.years.map((y, i) => (
                    <tr key={i} className="border-t border-line/70">
                      <td className="px-2.5 py-1 text-fg-2">{label(i + (start ? 0 : 1))}</td>
                      <td className="px-2.5 py-1 text-right">{money(y.principal, cur, true)}</td>
                      <td className="px-2.5 py-1 text-right">{money(y.interest, cur, true)}</td>
                      <td className="px-2.5 py-1 text-right font-medium">{money(y.balance, cur, true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a budget ---------------------------------------------------------------------------------------------------------

function Budget({ data }: { data: Data }) {
  const cur = str(data.currency) || 'USD';
  const income = arr(data.income)
    .filter(isObj)
    .map((x) => ({ name: textOf(x, 'name', 'label', 'source'), amount: num(x.amount ?? x.value) ?? 0 }));
  const expenses = arr(data.expenses ?? data.spending)
    .filter(isObj)
    .map((x) => ({ name: textOf(x, 'name', 'label'), amount: num(x.amount ?? x.value) ?? 0, category: str(x.category), note: str(x.note) }));
  const inTotal = income.reduce((m, x) => m + x.amount, 0);
  const outTotal = expenses.reduce((m, x) => m + x.amount, 0);
  const left = inTotal - outTotal;
  const cats: { name: string; amount: number; items: typeof expenses }[] = [];
  for (const e of expenses) {
    const k = e.category || e.name;
    const c = cats.find((x) => x.name === k);
    if (c) {
      c.amount += e.amount;
      c.items.push(e);
    } else cats.push({ name: k, amount: e.amount, items: [e] });
  }
  cats.sort((a, b) => b.amount - a.amount);
  const color = (i: number) => (i < 8 ? seriesColor(i) : 'var(--fg-3)');
  return (
    <Card>
      <Head title={data.title} sub={data.period} />
      {(inTotal > 0 || outTotal > 0) && (
        <div className="grid grid-cols-2 gap-2 @xl:grid-cols-4">
          <Tile label={tr('Income')} value={money(inTotal, cur)} />
          <Tile label={tr('Spending')} value={money(outTotal, cur)} />
          <Tile label={left >= 0 ? tr('Left over') : tr('Overspent')} value={money(Math.abs(left), cur)} tone={left >= 0 ? 'good' : 'bad'} />
          {inTotal > 0 && <Tile label={tr('Savings rate')} value={shareText(left / inTotal)} tone={left < 0 ? 'bad' : undefined} />}
        </div>
      )}
      {income.length > 1 && (
        <div className="mt-2 text-[12.5px] text-fg-3">
          {tr('Income')}: {income.map((x) => `${x.name} ${money(x.amount, cur)}`).join(' · ')}
        </div>
      )}
      {outTotal > 0 && (
        <div className="mt-4">
          <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={cats.map((c) => c.name).join(', ')}>
            {cats.map((c, i) => (
              <div key={i} title={`${c.name}: ${money(c.amount, cur)}`} className="h-full min-w-[2px]" style={{ flex: `${c.amount} 1 0%`, background: color(i) }} />
            ))}
            {left > 0 && <div title={`${tr('Left over')}: ${money(left, cur)}`} className="h-full bg-bg-3" style={{ flex: `${left} 1 0%` }} />}
          </div>
          {left < 0 && inTotal > 0 && (
            <div className="relative mt-1 h-4 text-[11px] text-err">
              <span className="absolute -top-8 h-8 w-0.5 bg-err" style={{ left: `${(inTotal / outTotal) * 100}%` }} />
              <span className="absolute whitespace-nowrap" style={{ right: `${100 - (inTotal / outTotal) * 100}%` }}>
                {tr('Income')} ▲
              </span>
            </div>
          )}
          <ul className="m-0 mt-3 list-none p-0">
            {cats.map((c, i) => {
              const detail = c.items.length > 1 || c.items[0]?.name !== c.name || !!c.items[0]?.note;
              return (
                <li key={i} className="border-b border-line/70 py-2 last:border-b-0">
                  <div className="flex items-center gap-2.5 text-[13.5px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color(i) }} />
                    <span className="min-w-0 flex-1 font-medium">{c.name}</span>
                    {inTotal > 0 && <span className="text-[12px] text-fg-3 tabular-nums">{shareText(c.amount / inTotal)}</span>}
                    <span className="min-w-[72px] text-right font-semibold tabular-nums">{money(c.amount, cur)}</span>
                  </div>
                  {detail && <div className="mt-0.5 pl-5 text-[12px] text-fg-3">{c.items.map((it) => `${it.name} ${money(it.amount, cur)}${it.note ? ` (${it.note})` : ''}`).join(' · ')}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {str(data.goal) && (
        <div className="mt-3 flex gap-2 rounded-lg bg-bg-2 px-3 py-2 text-[13px] text-fg-2">
          <Target size={14} className="mt-[3px] shrink-0 text-fg-3" />
          <Md text={data.goal} inline />
        </div>
      )}
    </Card>
  );
}

// ---- savings growth ---------------------------------------------------------------------------------------------------

/** Deposits and their growth at the end of each year, compounded monthly. */
function grow(initial: number, monthly: number, ratePct: number, years: number) {
  const r = ratePct / 100 / 12;
  let bal = Math.max(0, initial);
  let dep = bal;
  const out: { deposits: number; growth: number; balance: number }[] = [];
  for (let y = 1; y <= Math.min(100, Math.round(years)); y++) {
    for (let m = 0; m < 12; m++) {
      bal = bal * (1 + r) + monthly;
      dep += monthly;
    }
    out.push({ deposits: dep, growth: bal - dep, balance: bal });
  }
  return out;
}

function Savings({ data, done }: { data: Data; done: boolean }) {
  const cur = str(data.currency) || 'USD';
  const sign = currencySign(cur);
  const init = { initial: num(data.initial ?? data.start) ?? 0, monthly: num(data.monthly) ?? 0, rate: num(data.rate) ?? 0, years: num(data.years) ?? 0 };
  const inflation = num(data.inflation);
  const [mine, setMine] = useKept<Partial<Record<keyof typeof init, number>>>('savings', {});
  const v = { ...init, ...mine };
  const set = (k: keyof typeof init) => (n: number) => done && setMine((m) => ({ ...m, [k]: n }));
  const years = useMemo(() => grow(v.initial, v.monthly, v.rate, v.years), [v.initial, v.monthly, v.rate, v.years]);
  const end = years[years.length - 1];
  const iMax = niceCeil(Math.max(init.initial * 3, 1000));
  const mMax = niceCeil(Math.max(init.monthly * 3, 100));
  const overtakes = years.findIndex((y) => y.growth > y.deposits);
  if (!years.length && !(init.years > 0)) return <Card>{str(data.title) ? <Head title={data.title} /> : null}</Card>;
  return (
    <Card>
      <Head title={data.title} />
      <div className="grid gap-x-8 gap-y-5 @xl:grid-cols-2">
        <div className="min-w-0 space-y-3">
          <SliderRow label={tr('To start with')} value={v.initial} min={0} max={iMax} step={niceStep(iMax)} onChange={set('initial')} disabled={!done} box prefix={sign} />
          <SliderRow label={tr('Each month')} value={v.monthly} min={0} max={mMax} step={niceStep(mMax)} onChange={set('monthly')} disabled={!done} box prefix={sign} />
          <SliderRow label={tr('Yearly return')} value={v.rate} min={0} max={Math.max(15, Math.ceil(init.rate * 2))} step={0.1} onChange={set('rate')} disabled={!done} box unit="%" />
          <SliderRow label={tr('Years')} value={v.years} min={1} max={Math.max(50, Math.ceil(init.years))} step={1} onChange={set('years')} disabled={!done} box />
        </div>
        {end && (
          <div className="grid min-w-0 grid-cols-2 content-start gap-2">
            <div className="col-span-2">
              <Tile big label={tr('After {0}').replace('{0}', spanText(years.length * 12))} value={money(end.balance, cur, true)} sub={inflation !== null && inflation > 0 ? tr('{0} in today’s money, at {1}% inflation').replace('{0}', money(end.balance / (1 + inflation / 100) ** years.length, cur, true)).replace('{1}', fmtNum(inflation)) : undefined} />
            </div>
            <Tile label={tr('You put in')} value={money(end.deposits, cur, true)} />
            <Tile label={tr('Growth')} value={money(end.growth, cur, true)} tone={end.growth < 0 ? 'bad' : undefined} />
          </div>
        )}
      </div>
      {years.length > 1 && (
        <div className="mt-5">
          <XYChart
            kind="stacked-bar"
            x={years.map((_, i) => String(i + 1))}
            series={[
              { name: tr('What you put in'), values: years.map((y) => y.deposits) },
              { name: tr('Growth'), values: years.map((y) => Math.max(0, y.growth)) },
            ]}
            prefix={sign}
            xLabel={tr('Years')}
            height={220}
          />
          {overtakes >= 0 && <div className="mt-1 text-[12.5px] text-fg-3">{tr('From year {0}, growth is more than all you have put in.').replace('{0}', String(overtakes + 1))}</div>}
        </div>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- pricing plans ----------------------------------------------------------------------------------------------------

const PLAN_COLS: Record<number, string> = { 1: '', 2: '@md:grid-cols-2', 3: '@2xl:grid-cols-3', 4: '@lg:grid-cols-2' };
/** A plan's card that has its row to itself, with room: its features beside its price. */
const PLAN_INNER: Record<number, string> = { 1: '@md:grid-cols-2', 2: '', 3: '@md:@max-2xl:grid-cols-2' };

function Pricing({ data, done }: { data: Data; done: boolean }) {
  const cur = str(data.currency) || 'USD';
  const ask = useAsk();
  const plans = arr(data.plans).filter(isObj);
  const yearlyOf = (p: Data) => num(p.yearly);
  const save = plans.reduce((m, p) => {
    const mo = num(p.price);
    const y = yearlyOf(p);
    return mo && y ? Math.max(m, 1 - y / (mo * 12)) : m;
  }, 0);
  const anyYearly = plans.some((p) => yearlyOf(p) !== null && num(p.price) !== null);
  const [billing, setBilling] = useKept<'month' | 'year'>('billing', 'month');
  const yearly = anyYearly && billing === 'year';
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          anyYearly && done ? (
            <Seg
              size="sm"
              options={[
                { value: 'month', label: tr('Monthly') },
                { value: 'year', label: save >= 0.01 ? tr('Yearly, save {0}').replace('{0}', shareText(save)) : tr('Yearly') },
              ]}
              value={billing}
              onChange={setBilling}
            />
          ) : undefined
        }
      />
      <div className={cx('grid gap-3', PLAN_COLS[plans.length] ?? '@lg:grid-cols-2 @2xl:grid-cols-3')}>
        {plans.map((p, i) => {
          const price = num(p.price);
          const y = yearlyOf(p);
          const shownPrice = yearly && y !== null ? y / 12 : price;
          const hl = yes(p.highlight);
          const features = arr(p.features).map((f) => ({ text: textOf(f, 'text', 'name', 'label'), on: isObj(f) ? f.included !== false && str(f.included).toLowerCase() !== 'false' : true }));
          const cta = str(p.cta) || tr('Choose {0}').replace('{0}', textOf(p, 'name'));
          return (
            <div key={i} className={cx('grid min-w-0 content-start gap-x-6 gap-y-4 rounded-xl p-4', PLAN_INNER[plans.length] ?? '@md:@max-lg:grid-cols-2', hl ? 'border-2 border-accent bg-accent-soft/30' : 'border border-line')}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold">{textOf(p, 'name')}</span>
                  {str(p.badge) && <Chip tone="accent">{str(p.badge)}</Chip>}
                </div>
                {str(p.description) && <Md text={p.description} className="mt-0.5 text-[12.5px] text-fg-3" />}
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-[28px] leading-none font-semibold tracking-tight tabular-nums">{shownPrice !== null ? money(shownPrice, cur) : str(p.price) || '—'}</span>
                  {shownPrice !== null && <span className="text-[12.5px] text-fg-3">{str(p.period) || tr('a month')}</span>}
                </div>
                <div className="mt-1 min-h-[18px] text-[12px] text-fg-3">{yearly && y !== null ? tr('{0} billed yearly').replace('{0}', money(y, cur)) : yearly && price !== null && price > 0 ? tr('Billed monthly') : ''}</div>
                <div className="mt-3">
                  {str(p.url) ? (
                    <a href={str(p.url)} target="_blank" rel="noopener noreferrer" className={cx('inline-flex h-8 w-full items-center justify-center rounded-lg px-3 text-[12.5px] font-medium transition-colors', hl ? 'bg-accent text-accent-fg hover:opacity-90' : 'border border-line bg-panel text-fg hover:bg-bg-2')}>
                      {cta}
                    </a>
                  ) : (
                    <Btn primary={hl} disabled={!done} className="w-full" icon={<MessageSquarePlus size={14} />} onClick={() => ask(tr('Tell me more about the {0} plan.').replace('{0}', textOf(p, 'name')))}>
                      {cta}
                    </Btn>
                  )}
                </div>
              </div>
              {features.length > 0 && (
                <ul className="m-0 list-none space-y-1.5 p-0 text-[13px]">
                  {features.map((f, k) => (
                    <li key={k} className={cx('flex gap-2', !f.on && 'text-fg-3')}>
                      {f.on ? <Check size={15} strokeWidth={2.5} className="mt-px shrink-0 text-ok" aria-label={tr('Included')} /> : <X size={15} strokeWidth={2.5} className="mt-px shrink-0 text-fg-3" aria-label={tr('Not included')} />}
                      <span className="min-w-0">{f.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[12.5px] text-fg-3" />}
    </Card>
  );
}

// ---- splitting a bill -------------------------------------------------------------------------------------------------

/** A share as a fraction a person reads: ½, ⅓, ¼, or 1/5. */
const PART: Record<number, string> = { 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙', 8: '⅛' };

function SplitBill({ data, done }: { data: Data; done: boolean }) {
  const cur = str(data.currency) || 'USD';
  const listed = arr(data.people).map((p) => textOf(p, 'name')).filter(Boolean);
  const items = arr(data.items)
    .filter(isObj)
    .map((it) => ({ name: textOf(it, 'name', 'item', 'title'), price: num(it.price ?? it.amount) ?? 0, who: arr(it.who ?? it.shared_by).map((w) => textOf(w, 'name')).filter(Boolean) }));
  // Everyone named: the people, and anyone an item names who is not among them.
  const people = [...listed, ...items.flatMap((it) => it.who).filter((w, i, all) => !listed.includes(w) && all.indexOf(w) === i)];
  const tax = num(data.tax) ?? 0;
  const tip0 = num(data.tip) ?? 0;
  const [tip, setTip] = useKept<number | null>('tip', null);
  const tipPct = tip ?? tip0;
  const subtotal = items.reduce((m, it) => m + it.price, 0);
  const payer = str(data.paid_by ?? data.payer);
  const shares = people.map((name) => {
    const mine = items.filter((it) => (it.who.length ? it.who.includes(name) : true)).map((it) => ({ name: it.name, part: it.who.length || people.length, amount: it.price / (it.who.length || people.length || 1) }));
    const sub = mine.reduce((m, x) => m + x.amount, 0);
    return { name, items: mine, sub, total: sub * (1 + tax / 100 + tipPct / 100) };
  });
  const taxAmt = (subtotal * tax) / 100;
  const tipAmt = (subtotal * tipPct) / 100;
  const total = subtotal + taxAmt + tipAmt;
  const summary = () =>
    [
      `${str(data.title) || tr('The bill')}: ${money(total, cur)} (${tr('tip {0}%').replace('{0}', fmtNum(tipPct))})`,
      ...shares.map((s) => `${s.name}: ${money(s.total, cur)}`),
      ...(payer && people.includes(payer) ? [tr('Pay {0}.').replace('{0}', payer)] : []),
    ].join('\n');
  return (
    <Card>
      <Head title={data.title} aside={done && people.length > 0 && items.length > 0 ? <Copy text={summary} label={tr('Copy the split')} /> : undefined} />
      {people.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0 @lg:grid-cols-2">
          {shares.map((s, i) => (
            <li key={i} className="flex min-w-0 gap-3 rounded-xl bg-bg-1 px-3.5 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-3 text-[13px] font-semibold text-fg-2">{s.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{s.name}</span>
                  <span className="shrink-0 text-[17px] font-semibold tabular-nums">{money(s.total, cur)}</span>
                </div>
                {payer && people.includes(payer) && (
                  <div className="text-[12px] text-fg-3">{s.name === payer ? tr('Paid {0}, gets back {1}').replace('{0}', money(total, cur)).replace('{1}', money(total - s.total, cur)) : tr('Owes {0}').replace('{0}', payer)}</div>
                )}
                {s.items.length > 0 && (
                  <div className="mt-1 text-[12px] leading-snug text-fg-3">
                    {s.items.map((x) => (x.part > 1 ? `${x.name} ${PART[x.part] ?? `1/${x.part}`}` : x.name)).join(' · ')}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="mt-4 grid gap-x-8 gap-y-3 @xl:grid-cols-2">
          <div className="min-w-0">
            <SliderRow label={tr('Tip')} value={tipPct} min={0} max={Math.max(30, Math.ceil(tip0 + 10))} step={1} onChange={(n) => done && setTip(n)} disabled={!done} text={`${fmtNum(tipPct)}% · ${money(tipAmt, cur)}`} />
          </div>
          <dl className="m-0 min-w-0 text-[13px]">
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-fg-3">{tr('Items')}</dt>
              <dd className="m-0 tabular-nums">{money(subtotal, cur)}</dd>
            </div>
            {tax > 0 && (
              <div className="flex justify-between gap-3 py-0.5">
                <dt className="text-fg-3">{tr('Tax ({0}%)').replace('{0}', fmtNum(tax))}</dt>
                <dd className="m-0 tabular-nums">{money(taxAmt, cur)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 py-0.5">
              <dt className="text-fg-3">{tr('Tip ({0}%)').replace('{0}', fmtNum(tipPct))}</dt>
              <dd className="m-0 tabular-nums">{money(tipAmt, cur)}</dd>
            </div>
            <div className="mt-1 flex justify-between gap-3 border-t border-line pt-1.5 text-[14px] font-semibold">
              <dt>{tr('Total')}</dt>
              <dd className="m-0 tabular-nums">{money(total, cur)}</dd>
            </div>
          </dl>
        </div>
      )}
    </Card>
  );
}

// ---- an investment portfolio ------------------------------------------------------------------------------------------

interface Holding {
  i: number;
  name: string;
  symbol: string;
  kind: string;
  value: number;
  cost: number | null;
  today: number | null;
}
type HoldingSort = 'name' | 'value' | 'gain' | 'today';

/** A kind of holding as a name: the agent's word with a capital ("stock" → "Stock"), or Other. */
const kindName = (k: string) => (k ? `${k.charAt(0).toLocaleUpperCase()}${k.slice(1)}` : tr('Other'));
/** Money with its sign: "+$1,250", "−$320". */
const signedMoney = (n: number, currency: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${money(Math.abs(n), currency, true)}`;
/** A share as a signed percentage: 0.0123 as "+1.23%". */
const signedPct = (x: number, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${fmtNum(Math.abs(x) * 100, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const toneOfSign = (x: number | null) => (x === null || Math.abs(x) < 1e-9 ? 'text-fg-3' : x > 0 ? 'text-ok' : 'text-err');

function Portfolio({ data, done }: { data: Data; done: boolean }) {
  const cur = str(data.currency) || 'USD';
  const [by, setBy] = useKept<'kind' | 'holding'>('by', 'kind');
  const [sort, setSort] = useKept<{ key: HoldingSort; down: boolean } | null>('sort', null);
  const [lit, setLit] = useState<number | null>(null);
  const holdings: Holding[] = arr(data.holdings ?? data.positions ?? data.items)
    .filter(isObj)
    .map((h, i) => {
      const cost = num(h.cost ?? h.cost_basis ?? h.basis);
      return { i, name: textOf(h, 'name', 'title', 'symbol'), symbol: str(h.symbol ?? h.ticker).trim(), kind: str(h.kind ?? h.type ?? h.class).trim(), value: num(h.value ?? h.market_value ?? h.amount) ?? NaN, cost: cost !== null && cost > 0 ? cost : null, today: num(h.change_pct ?? h.today_pct ?? h.today) };
    })
    .filter((h) => h.name && Number.isFinite(h.value));
  const total = holdings.reduce((m, h) => m + h.value, 0);
  const costed = holdings.filter((h) => h.cost !== null);
  const paid = costed.reduce((m, h) => m + (h.cost ?? 0), 0);
  const gain = costed.reduce((m, h) => m + h.value - (h.cost ?? 0), 0);
  // Today's change in money: each holding's value now less what it was before today's change.
  const moved = holdings.filter((h) => h.today !== null && h.today > -100);
  const todayAbs = moved.reduce((m, h) => m + h.value - h.value / (1 + (h.today ?? 0) / 100), 0);
  const todayPct = moved.length && total - todayAbs > 0 ? todayAbs / (total - todayAbs) : null;
  // The allocation: by kind (when the holdings say theirs), or by holding (the largest seven, the rest as one).
  const kinds = holdings.some((h) => h.kind);
  const byKind = kinds && by === 'kind';
  let parts: { name: string; value: number; color: string }[];
  if (byKind) {
    const sums = new Map<string, number>();
    for (const h of holdings) sums.set(kindName(h.kind), (sums.get(kindName(h.kind)) ?? 0) + h.value);
    parts = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: i < 8 ? seriesColor(i) : 'var(--fg-3)' }));
  } else {
    const ranked = [...holdings].sort((a, b) => b.value - a.value);
    const head = ranked.length > 8 ? ranked.slice(0, 7) : ranked;
    parts = head.map((h, i) => ({ name: h.symbol || h.name, value: h.value, color: seriesColor(i) }));
    if (ranked.length > head.length) parts.push({ name: tr('Other'), value: ranked.slice(head.length).reduce((m, h) => m + h.value, 0), color: 'var(--line-2)' });
  }
  parts = parts.filter((p) => p.value > 0);
  const whole = parts.reduce((m, p) => m + p.value, 0);
  const top = holdings.reduce((m, h) => Math.max(m, h.value), 0);
  const gainOf = (h: Holding) => (h.cost !== null ? h.value - h.cost : null);
  const s = sort ?? { key: 'value', down: true };
  const sorted = [...holdings].sort((a, b) => {
    const r =
      s.key === 'name'
        ? a.name.localeCompare(b.name)
        : s.key === 'gain'
          ? (gainOf(a) ?? -Infinity) - (gainOf(b) ?? -Infinity)
          : s.key === 'today'
            ? (a.today ?? -Infinity) - (b.today ?? -Infinity)
            : a.value - b.value;
    return s.down ? -r : r;
  });
  const head = (key: HoldingSort, label: string, right = true) => {
    const on = s.key === key;
    return (
      <button
        type="button"
        disabled={!done}
        onClick={() => setSort(on ? { key, down: !s.down } : { key, down: key !== 'name' })}
        className={cx('inline-flex items-center gap-1 font-medium transition-colors enabled:hover:text-fg', right && 'flex-row-reverse', on && sort && 'text-fg')}
      >
        {label}
        {on && sort && (s.down ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
      </button>
    );
  };
  return (
    <Card>
      <Head title={data.title} sub={str(data.as_of) ? tr('As of {0}').replace('{0}', fmtDate(data.as_of)) : undefined} />
      {holdings.length > 0 && (
        <div className="grid grid-cols-2 gap-2 @lg:grid-cols-3">
          <div className="col-span-2 @lg:col-span-1">
            <Tile big label={tr('Total value')} value={money(total, cur, true)} sub={holdings.length === 1 ? tr('1 holding') : tr('{0} holdings').replace('{0}', fmtNum(holdings.length))} />
          </div>
          {costed.length > 0 && (
            <Tile big label={gain < 0 ? tr('Loss') : tr('Gain')} value={signedMoney(gain, cur)} tone={gain > 0 ? 'good' : gain < 0 ? 'bad' : undefined} sub={paid > 0 ? tr('{0} on {1} paid').replace('{0}', signedPct(gain / paid)).replace('{1}', money(paid, cur, true)) : undefined} />
          )}
          {todayPct !== null && <Tile big label={tr('Today')} value={signedMoney(todayAbs, cur)} tone={todayAbs > 0 ? 'good' : todayAbs < 0 ? 'bad' : undefined} sub={signedPct(todayPct, 2)} />}
        </div>
      )}
      {parts.length > 0 && whole > 0 && (
        <Section
          title={tr('Allocation')}
          className="mt-5"
          aside={
            kinds && done ? (
              <Seg
                size="sm"
                options={[
                  { value: 'kind', label: tr('By kind') },
                  { value: 'holding', label: tr('By holding') },
                ]}
                value={byKind ? 'kind' : 'holding'}
                onChange={(v) => {
                  setBy(v);
                  setLit(null);
                }}
              />
            ) : undefined
          }
        >
          <div className="flex h-6 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={parts.map((p) => p.name).join(', ')} onPointerLeave={() => setLit(null)}>
            {parts.map((p, i) => (
              <div key={`${i}:${p.name}`} onPointerEnter={() => setLit(i)} title={`${p.name}: ${shareText(p.value / whole)}`} className="h-full min-w-[3px] transition-opacity" style={{ flex: `${p.value} 1 0%`, background: p.color, opacity: lit === null || lit === i ? 1 : 0.45 }} />
            ))}
          </div>
          <ul className="m-0 mt-2.5 grid list-none gap-x-6 p-0 @md:grid-cols-2" onPointerLeave={() => setLit(null)}>
            {parts.map((p, i) => (
              <li key={`${i}:${p.name}`} onPointerEnter={() => setLit(i)} className={cx('flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-[13px]', lit === i && 'bg-bg-2')}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{money(p.value, cur, true)}</span>
                <span className="w-12 shrink-0 text-right font-medium tabular-nums">{shareText(p.value / whole)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {holdings.length > 0 && (
        <Section title={tr('Holdings')} className="mt-5">
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-fg-3">
                  <th className="px-1 py-1.5 text-left font-medium">{head('name', tr('Holding'), false)}</th>
                  <th className="px-1 py-1.5 text-right font-medium">{head('value', tr('Value'))}</th>
                  <th className="hidden px-1 py-1.5 text-right font-medium @xl:table-cell">{tr('Weight')}</th>
                  <th className="px-1 py-1.5 text-right font-medium">{head('gain', tr('Gain'))}</th>
                  <th className="hidden px-1 py-1.5 text-right font-medium @sm:table-cell">{head('today', tr('Today'))}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => {
                  const g = gainOf(h);
                  return (
                    <tr key={h.i} className="border-b border-line/60">
                      <td className="px-1 py-2 align-top">
                        <div className="leading-snug font-medium">{h.name}</div>
                        {(h.symbol || h.kind) && <div className="text-[11.5px] text-fg-3">{[h.symbol, h.kind ? kindName(h.kind) : ''].filter(Boolean).join(' · ')}</div>}
                      </td>
                      <td className="px-1 py-2 text-right align-top whitespace-nowrap tabular-nums">
                        <div className="font-medium">{money(h.value, cur, true)}</div>
                        {total > 0 && <div className="text-[11.5px] text-fg-3 @xl:hidden">{shareText(h.value / total)}</div>}
                      </td>
                      <td className="hidden px-1 py-2 align-top @xl:table-cell">
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <span className="text-[12px] text-fg-2 tabular-nums">{total > 0 ? shareText(h.value / total) : ''}</span>
                          <Meter value={h.value} max={top || 1} thin className="w-14" />
                        </div>
                      </td>
                      <td className={cx('px-1 py-2 text-right align-top whitespace-nowrap tabular-nums', toneOfSign(g))}>
                        {g !== null && h.cost ? (
                          <>
                            <div className="font-medium">{signedMoney(g, cur)}</div>
                            <div className="text-[11.5px]">{signedPct(g / h.cost)}</div>
                          </>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                      <td className={cx('hidden px-1 py-2 text-right align-top whitespace-nowrap tabular-nums @sm:table-cell', toneOfSign(h.today))}>{h.today !== null ? signedPct(h.today / 100, 2) : <span className="text-fg-3">—</span>}</td>
                    </tr>
                  );
                })}
                <tr className="font-semibold">
                  <td className="px-1 py-2">{tr('Total')}</td>
                  <td className="px-1 py-2 text-right whitespace-nowrap tabular-nums">{money(total, cur, true)}</td>
                  <td className="hidden px-1 py-2 text-right tabular-nums @xl:table-cell">100%</td>
                  <td className={cx('px-1 py-2 text-right whitespace-nowrap tabular-nums', costed.length ? toneOfSign(gain) : 'text-fg-3')}>{costed.length ? signedMoney(gain, cur) : '—'}</td>
                  <td className={cx('hidden px-1 py-2 text-right whitespace-nowrap tabular-nums @sm:table-cell', toneOfSign(todayPct))}>{todayPct !== null ? signedPct(todayPct, 2) : '—'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>
      )}
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

export const MONEY_UIS: Record<string, AnswerUiView> = {
  stock: Stock,
  loan: Loan,
  budget: Budget,
  savings: Savings,
  pricing: Pricing,
  'split-bill': SplitBill,
  portfolio: Portfolio,
};
