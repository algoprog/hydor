// The answer UIs for shopping (products, product grids, spec sheets, price history): their views, by name (shared/answer-ui/shopping.ts has what each takes).
import { useMemo, useState } from 'react';
import { Bath, BedDouble, Check, ChevronLeft, ChevronRight, ExternalLink, MapPin, Maximize2, Search, X } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { niceTicks, useWidth } from '../charts';
import { arr, Card, Chip, fmtDate, fmtMoney, fmtNum, Head, hostOf, isObj, KeyValues, LinkOut, MapBox, mapPoints, Md, num, parseDate, Pic, Section, Seg, seriesColor, Stars, str, textOf, useAui, useKept, words, type AnswerUiView, type Data, type Tone } from '../kit';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A price as given: a number in its currency, or the words as they are ("$429.95"). */
const priceText = (v: unknown, currency?: string) => (typeof v === 'number' ? fmtMoney(v, currency, Number.isInteger(v) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}) : str(v));

/** How much a sale takes off, in whole percent; null when either price is not a number or nothing is off. */
function savings(price: unknown, was: unknown): number | null {
  const p = num(price);
  const w = num(was);
  if (p === null || w === null || w <= 0 || p >= w) return null;
  const off = Math.round(((w - p) / w) * 100);
  return off > 0 ? off : null;
}

/** Specs given as a list of { label, value }, or as one object of label: value. */
function specRows(v: unknown): { label: string; value: unknown }[] {
  if (isObj(v)) return Object.entries(v).map(([label, value]) => ({ label, value: isObj(value) ? textOf(value, 'value', 'text') : value }));
  return arr(v)
    .map((x) => (isObj(x) ? { label: textOf(x, 'label', 'name', 'key'), value: x.value ?? x.text } : { label: '', value: x }))
    .filter((x) => x.label || str(x.value));
}

/** A short list of pros or cons, marked ✓ or ✗. */
function Points({ good, items }: { good: boolean; items: unknown[] }) {
  if (!items.length) return null;
  return (
    <Section title={good ? tr('Pros') : tr('Cons')}>
      <ul className="m-0 list-none space-y-1.5 p-0">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2 text-[13.5px] leading-snug">
            {good ? <Check size={15} strokeWidth={2.5} className="mt-px shrink-0 text-ok" /> : <X size={15} strokeWidth={2.5} className="mt-px shrink-0 text-err" />}
            <Md text={textOf(x, 'text', 'point', 'title')} inline className="min-w-0" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ---- a product -----------------------------------------------------------------------------------------------------------

function Product({ data, done }: { data: Data; done: boolean }) {
  const more = typeof data.images === 'string' ? [data.images] : arr(data.images).map((p) => textOf(p, 'url', 'src', 'image'));
  const pics = [...new Set([str(data.image), ...more].map((p) => p.trim()).filter(Boolean))];
  const [at, setAt] = useState(0);
  const shown = pics[Math.min(at, pics.length - 1)];
  const name = str(data.name ?? data.title);
  const off = savings(data.price, data.was);
  const specs = specRows(data.specs);
  const pros = Array.isArray(data.pros) ? arr(data.pros) : str(data.pros) ? [data.pros] : [];
  const cons = Array.isArray(data.cons) ? arr(data.cons) : str(data.cons) ? [data.cons] : [];
  const offers = arr(data.offers ?? data.stores)
    .filter(isObj)
    .map((o) => ({ store: textOf(o, 'store', 'name', 'seller') || hostOf(o.url), price: o.price, n: num(o.price), url: str(o.url), note: str(o.note), stock: o.in_stock ?? o.inStock }));
  const prices = offers.map((o) => o.n).filter((n): n is number => n !== null);
  const lowest = prices.length > 1 ? Math.min(...prices) : null;
  return (
    <Card>
      <div className={cx('grid gap-5', pics.length > 0 && '@xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
        {pics.length > 0 && (
          <div className="min-w-0">
            <Pic src={shown} alt={name} group={pics} fit="contain" className="aspect-[4/3] max-h-72 w-full rounded-xl bg-bg-1 @xl:aspect-square @xl:max-h-none" />
            {pics.length > 1 && (
              <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                {pics.map((p, i) => (
                  <button key={p} type="button" onClick={() => done && setAt(i)} aria-label={tr('Picture {0}').replace('{0}', String(i + 1))} className={cx('shrink-0 rounded-lg border-2 p-px transition-colors', i === Math.min(at, pics.length - 1) ? 'border-accent' : 'border-transparent hover:border-line-2')}>
                    <Pic src={p} alt="" zoom={false} fit="contain" className="h-12 w-12 rounded-md bg-bg-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="min-w-0">
          {str(data.brand) && <div className="text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{str(data.brand)}</div>}
          {name && <h3 className="aui-h3 text-[19px]">{name}</h3>}
          {num(data.rating) !== null && (
            <div className="mt-1">
              <Stars value={data.rating} count={data.reviews} />
            </div>
          )}
          {(str(data.price) || str(data.was)) && (
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              {str(data.price) && <span className="text-[26px] leading-none font-semibold tracking-tight tabular-nums">{priceText(data.price, str(data.currency))}</span>}
              {str(data.was) && <s className="text-[14px] text-fg-3 tabular-nums">{priceText(data.was, str(data.currency))}</s>}
              {off !== null && <Chip tone="good">−{off}%</Chip>}
            </div>
          )}
          {words(data.badges).length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {words(data.badges).map((b, i) => (
                <Chip key={i} tone={i === 0 ? 'accent' : 'neutral'}>
                  {b}
                </Chip>
              ))}
            </div>
          )}
          {str(data.summary ?? data.description) && <Md text={data.summary ?? data.description} className="mt-3 text-[14px] text-fg-2" />}
          {str(data.url) && (
            <LinkOut url={data.url} className="mt-3 text-[13px]">
              {hostOf(data.url) || tr('Open')}
            </LinkOut>
          )}
        </div>
      </div>
      {specs.length > 0 && (
        <Section title={tr('Specs')} className="mt-5">
          <KeyValues rows={specs} cols={2} />
        </Section>
      )}
      {(pros.length > 0 || cons.length > 0) && (
        <div className="mt-5 grid gap-x-6 gap-y-4 @md:grid-cols-2">
          <Points good items={pros} />
          <Points good={false} items={cons} />
        </div>
      )}
      {offers.length > 0 && (
        <Section title={tr('Where to buy')} className="mt-5">
          <div className="overflow-hidden rounded-xl border border-line">
            {offers.map((o, i) => {
              const out = o.stock === false || /^(no|false|out)/i.test(str(o.stock));
              const best = lowest !== null && o.n === lowest && !out;
              return (
                <div key={i} className={cx('flex min-w-0 items-center gap-3 px-3 py-2.5', i > 0 && 'border-t border-line/70', best && 'bg-ok/[0.06]')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-fg">{o.store}</span>
                      {best && <Chip tone="good">{tr('Lowest price')}</Chip>}
                      {o.stock !== undefined && o.stock !== null && o.stock !== '' && <span className={cx('text-[12px]', out ? 'text-err' : 'text-ok')}>{out ? tr('Out of stock') : tr('In stock')}</span>}
                    </div>
                    {o.note && <div className="text-[12px] text-fg-3">{o.note}</div>}
                  </div>
                  <span className={cx('shrink-0 text-[14.5px] font-semibold tabular-nums', out && 'text-fg-3')}>{priceText(o.price, str(data.currency))}</span>
                  {/^https?:\/\//i.test(o.url) ? (
                    <a href={o.url} target="_blank" rel="noopener noreferrer" title={tr('Go to the store')} aria-label={`${tr('Go to the store')}: ${o.store}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-accent">
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="w-7 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </Card>
  );
}

// ---- products ------------------------------------------------------------------------------------------------------------

type ProductSort = '' | 'price' | 'rating';

function ProductTile({ it }: { it: Data }) {
  const name = textOf(it, 'name', 'title', 'label');
  const currency = str(it.currency);
  const off = savings(it.price, it.was);
  const url = str(it.url ?? it.link);
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="relative">
        <Pic src={it.image} alt={name} fit="contain" className="aspect-square w-full rounded-none bg-bg-1" />
        {str(it.tag) && <span className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg shadow-sm">{str(it.tag)}</span>}
        {off !== null && <span className="absolute top-2 right-2 rounded-full bg-ok px-1.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">−{off}%</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        {/^https?:\/\//i.test(url) ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-fg hover:text-accent hover:underline">
            {name}
          </a>
        ) : (
          <span className="line-clamp-2 text-[13.5px] leading-snug font-semibold text-fg">{name}</span>
        )}
        {num(it.rating) !== null && <Stars value={it.rating} size={11} count={it.reviews} />}
        {str(it.note) && <Md text={it.note} className="text-[12.5px] leading-snug text-fg-2" />}
        <div className="mt-auto pt-1.5">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            {str(it.price) && <span className="text-[16px] font-semibold tabular-nums">{priceText(it.price, currency)}</span>}
            {str(it.was) && <s className="text-[12px] text-fg-3 tabular-nums">{priceText(it.was, currency)}</s>}
          </div>
          {str(it.store) && <div className="truncate text-[11.5px] text-fg-3">{str(it.store)}</div>}
        </div>
      </div>
    </div>
  );
}

function Products({ data, done }: { data: Data; done: boolean }) {
  const items = arr(data.items ?? data.products).map((x) => (isObj(x) ? x : { name: str(x) }));
  const [sort, setSort] = useKept<ProductSort>('sort', '');
  const by: ProductSort = done && (sort === 'price' || sort === 'rating') ? sort : '';
  const list = useMemo(() => {
    const rows = items.map((it, i) => ({ it, i }));
    if (by === 'price') return [...rows].sort((a, b) => (num(a.it.price) ?? Infinity) - (num(b.it.price) ?? Infinity) || a.i - b.i);
    if (by === 'rating') return [...rows].sort((a, b) => (num(b.it.rating) ?? -1) - (num(a.it.rating) ?? -1) || (num(b.it.reviews) ?? 0) - (num(a.it.reviews) ?? 0) || a.i - b.i);
    return rows;
  }, [items, by]);
  const canSort = done && items.length > 2 && (items.some((it) => num(it.price) !== null) || items.some((it) => num(it.rating) !== null));
  return (
    <Card>
      <Head title={data.title} />
      {canSort && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Seg<ProductSort>
            size="sm"
            options={[
              { value: '', label: tr('Suggested') },
              ...(items.some((it) => num(it.price) !== null) ? [{ value: 'price' as const, label: tr('Lowest price') }] : []),
              ...(items.some((it) => num(it.rating) !== null) ? [{ value: 'rating' as const, label: tr('Top rated') }] : []),
            ]}
            value={by}
            onChange={setSort}
          />
          <span className="ml-auto text-[12px] text-fg-3 tabular-nums">{tr('{0} items').replace('{0}', String(items.length))}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3">
        {list.map(({ it, i }) => (
          <ProductTile key={i} it={it} />
        ))}
      </div>
    </Card>
  );
}

// ---- a spec sheet --------------------------------------------------------------------------------------------------------

function Specs({ data, done }: { data: Data; done: boolean }) {
  const given = arr(data.groups ?? data.sections)
    .filter(isObj)
    .map((g) => ({ name: textOf(g, 'name', 'title', 'label'), specs: specRows(g.specs ?? g.items ?? g.rows) }));
  // A flat list of specs, without groups, is one group.
  const groups = given.length ? given : data.specs ? [{ name: '', specs: specRows(data.specs) }] : [];
  const total = groups.reduce((m, g) => m + g.specs.length, 0);
  const [q, setQ] = useState('');
  const needle = done ? q.trim().toLowerCase() : '';
  const shown = needle
    ? groups
        .map((g) => (g.name.toLowerCase().includes(needle) ? g : { ...g, specs: g.specs.filter((s) => `${s.label} ${str(s.value)}`.toLowerCase().includes(needle)) }))
        .filter((g) => g.specs.length)
    : groups.filter((g) => g.specs.length || g.name);
  const title = str(data.title ?? data.name);
  return (
    <Card>
      <div className="flex items-center gap-4">
        {str(data.image) && <Pic src={data.image} alt={title} fit="contain" className="h-20 w-28 shrink-0 rounded-lg bg-bg-1 @lg:h-24 @lg:w-36" />}
        <div className="min-w-0 flex-1">
          <Head title={title} sub={data.subtitle} className="mb-0" />
        </div>
      </div>
      {done && total >= 14 && (
        <label className="relative mt-3 block">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Find a spec')} className="h-8 w-full rounded-lg border border-line bg-bg-1 pr-2 pl-8 text-[13px] outline-none focus:border-accent" />
        </label>
      )}
      {shown.length > 0 ? (
        <div className={cx('mt-4 gap-x-8', shown.length > 1 && '@xl:columns-2')}>
          {shown.map((g, i) => (
            <section key={i} className="mb-4 break-inside-avoid last:mb-0">
              {g.name && <h4 className="aui-h4 mb-1">{g.name}</h4>}
              <KeyValues rows={g.specs} />
            </section>
          ))}
        </div>
      ) : needle ? (
        <div className="py-6 text-center text-[13px] text-fg-3">{tr('No spec matches.')}</div>
      ) : null}
      {str(data.note) && <Md text={data.note} className="mt-3 border-t border-line pt-3 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- price history ---------------------------------------------------------------------------------------------------------

interface PricePoint {
  t: number;
  price: number;
}

const DAY = 86_400_000;

/** The price that held longest over the points (each holds until the next): what it usually costs. */
function usualPrice(points: PricePoint[], end: number): number | null {
  const time = new Map<number, number>();
  points.forEach((p, i) => time.set(p.price, (time.get(p.price) ?? 0) + Math.max(DAY, (points[i + 1]?.t ?? end) - p.t)));
  let best: number | null = null;
  let most = -1;
  for (const [price, t] of time)
    if (t > most) {
      most = t;
      best = price;
    }
  return best;
}

/** The price over time as a step line (a price holds until it changes), its lowest and highest marked. */
function PriceChart({ points, end, money }: { points: PricePoint[]; end: number; money: (n: number) => string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 200;
  const prices = points.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const span = hi - lo || hi * 0.1 || 1;
  const ticks = niceTicks(Math.max(0, lo - span * 0.35), hi + span * 0.15, 3);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const tick = (v: number) => money(v).replace(/[.,]00$/, '');
  const axisW = Math.max(30, Math.max(...ticks.map((t) => tick(t).length)) * 6.6 + 10);
  const padT = 20;
  const padB = 22;
  const plotW = Math.max(40, width - axisW - 10);
  const plotH = height - padT - padB;
  const t0 = points[0].t;
  const sx = (t: number) => axisW + ((t - t0) / (end - t0 || 1)) * plotW;
  const sy = (v: number) => padT + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
  let line = '';
  points.forEach((p, i) => (line += i === 0 ? `M${sx(p.t).toFixed(1)},${sy(p.price).toFixed(1)}` : `H${sx(p.t).toFixed(1)}V${sy(p.price).toFixed(1)}`));
  line += `H${sx(end).toFixed(1)}`;
  const area = `${line}V${sy(y0).toFixed(1)}H${sx(t0).toFixed(1)}Z`;
  // Months along x: as many as fit, on the first of each.
  const months: number[] = [];
  const m = new Date(t0);
  m.setDate(1);
  m.setHours(12, 0, 0, 0);
  while (m.getTime() <= end) {
    if (m.getTime() >= t0) months.push(m.getTime());
    m.setMonth(m.getMonth() + 1);
  }
  const every = Math.max(1, Math.ceil((months.length * 54) / plotW));
  // The low and the high: each marked once, where the price was at it (the lowest's latest time; the highest nearest the middle).
  const lowAt = prices.lastIndexOf(lo);
  const mid = (t0 + end) / 2;
  const highAt = lo === hi ? -1 : points.reduce((b, p, i) => (p.price === hi && (b < 0 || Math.abs(p.t - mid) < Math.abs(points[b].t - mid)) ? i : b), -1);
  const segMid = (i: number) => (sx(points[i].t) + sx(points[i + 1]?.t ?? end)) / 2;
  const mark = (i: number, below: boolean, text: string) => {
    const x = clamp(segMid(i), axisW + 30, axisW + plotW - 30);
    const y = sy(points[i].price);
    return (
      <g key={`${i}${below}`}>
        <circle cx={segMid(i)} cy={y} r={3.5} fill={seriesColor(0)} stroke="var(--panel)" strokeWidth={2} />
        <text x={x} y={below ? y + 15 : y - 8} textAnchor="middle" className="fill-fg-2 text-[11px] font-medium tabular-nums">
          {text}
        </text>
      </g>
    );
  };
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(clamp(t0 + ((e.clientX - r.left) / r.width) * (end - t0), t0, end));
  };
  const at = hover === null ? -1 : points.reduce((b, p, i) => (p.t <= hover ? i : b), 0);
  const hx = hover === null ? 0 : sx(hover);
  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible" role="img" aria-label={tr('Price over time')}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={axisW} x2={axisW + plotW} y1={sy(t)} y2={sy(t)} stroke={i === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)'} shapeRendering="crispEdges" />
              <text x={axisW - 6} y={sy(t)} dy="0.35em" textAnchor="end" className="fill-fg-3 text-[11px] tabular-nums">
                {tick(t)}
              </text>
            </g>
          ))}
          <path d={area} fill={seriesColor(0)} opacity={0.1} />
          <path d={line} fill="none" stroke={seriesColor(0)} strokeWidth={2} strokeLinejoin="round" />
          {highAt >= 0 && mark(highAt, false, `${tr('High')} ${money(hi)}`)}
          {mark(lowAt, true, `${tr('Low')} ${money(lo)}`)}
          <circle cx={sx(end)} cy={sy(points[points.length - 1].price)} r={4} fill={seriesColor(0)} stroke="var(--panel)" strokeWidth={2} />
          {months.map((t, i) =>
            i % every === 0 ? (
              <text key={t} x={sx(t)} y={height - 6} textAnchor="middle" className="fill-fg-3 text-[11px]">
                {new Date(t).getMonth() === 0 || i === 0 ? `${fmtDate(new Date(t), 'month')} ${new Date(t).getFullYear()}` : fmtDate(new Date(t), 'month')}
              </text>
            ) : null,
          )}
          {hover !== null && at >= 0 && (
            <g>
              <line x1={hx} x2={hx} y1={padT} y2={padT + plotH} stroke="var(--line-2)" />
              <circle cx={hx} cy={sy(points[at].price)} r={4} fill={seriesColor(0)} stroke="var(--panel)" strokeWidth={2} />
            </g>
          )}
          <rect x={axisW} y={padT} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hover !== null && at >= 0 && (
        <div className="pointer-events-none absolute z-10 min-w-[120px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-pop" style={{ left: clamp(hx + 12, 8, Math.max(8, width - 170)), top: 0 }}>
          <div className="mb-0.5 text-[11.5px] text-fg-3">{fmtDate(new Date(hover), 'medium')}</div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block h-[2px] w-3 shrink-0 rounded-full" style={{ background: seriesColor(0) }} />
            <span className="font-semibold text-fg tabular-nums">{money(points[at].price)}</span>
            <span className="text-fg-3">{tr('Price')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function PriceHistory({ data }: { data: Data }) {
  const currency = str(data.currency);
  const money = (n: number) => fmtMoney(n, currency || undefined);
  const points: PricePoint[] = arr(data.points ?? data.history ?? data.prices)
    .map((p) => {
      const d = parseDate(isObj(p) ? (p.date ?? p.day ?? p.t) : Array.isArray(p) ? p[0] : null);
      const price = num(isObj(p) ? (p.price ?? p.value) : Array.isArray(p) ? p[1] : null);
      return d && price !== null ? { t: d.getTime(), price } : null;
    })
    .filter((p): p is PricePoint => !!p)
    .sort((a, b) => a.t - b.t);
  const prices = points.map((p) => p.price);
  const low = num(data.low) ?? (prices.length ? Math.min(...prices) : null);
  const high = num(data.high) ?? (prices.length ? Math.max(...prices) : null);
  const current = num(data.current ?? data.price) ?? (prices.length ? prices[prices.length - 1] : null);
  // The line runs on to today when the last price is recent (it still holds), else to the last point.
  const last = points.length ? points[points.length - 1].t : 0;
  const today = Date.now();
  const end = points.length ? Math.max(last + DAY, today > last && today - last < 60 * DAY ? today : last + DAY) : 0;
  const usual = points.length > 2 ? usualPrice(points, end) : null;
  const vsUsual = current !== null && usual ? (current - usual) / usual : null;
  const pos = current !== null && low !== null && high !== null && high > low ? clamp((current - low) / (high - low), 0, 1) : null;
  const where: { tone: Tone; text: string } | null =
    current === null || low === null || high === null || high <= low ? null : current <= low * 1.005 ? { tone: 'good', text: tr('At its lowest price') } : pos !== null && pos <= 0.2 ? { tone: 'good', text: tr('Near its lowest price') } : pos !== null && pos >= 0.9 ? { tone: 'bad', text: tr('Near its highest price') } : null;
  const stores = arr(data.stores ?? data.offers)
    .filter(isObj)
    .map((s) => ({ store: textOf(s, 'store', 'name', 'seller') || hostOf(s.url), price: num(s.price), raw: s.price, url: str(s.url) }));
  const storeLow = stores.length > 1 ? Math.min(...stores.map((s) => s.price ?? Infinity)) : null;
  return (
    <Card>
      <Head title={data.item ?? data.title ?? data.name} aside={where ? <Chip tone={where.tone}>{where.text}</Chip> : undefined} />
      {current !== null && (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <div className="text-[28px] leading-none font-semibold tracking-tight tabular-nums">{money(current)}</div>
            {vsUsual !== null && usual !== null && (
              <div className={cx('mt-1.5 text-[12.5px]', Math.abs(vsUsual) < 0.005 ? 'text-fg-3' : vsUsual < 0 ? 'text-ok' : 'text-err')}>
                {Math.abs(vsUsual) < 0.005
                  ? tr('Its usual price')
                  : (vsUsual < 0 ? tr('{0} below its usual {1}') : tr('{0} above its usual {1}')).replace('{0}', `${fmtNum(Math.abs(vsUsual) * 100, { maximumFractionDigits: 0 })}%`).replace('{1}', money(usual))}
              </div>
            )}
          </div>
          {pos !== null && low !== null && high !== null && (
            <div className="min-w-[180px] flex-1 pb-0.5">
              <div className="relative h-1.5 rounded-full bg-bg-3">
                <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel shadow-sm" style={{ left: `${pos * 100}%`, background: seriesColor(0) }} aria-hidden />
              </div>
              <div className="mt-1.5 flex justify-between gap-3 text-[11.5px] text-fg-3 tabular-nums">
                <span>
                  {tr('Low')} {money(low)}
                </span>
                <span>
                  {tr('High')} {money(high)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      {points.length > 1 && (
        <div className="mt-4">
          <PriceChart points={points} end={end} money={money} />
        </div>
      )}
      {str(data.verdict) && (
        <div className="mt-3 rounded-lg bg-bg-2 px-3 py-2 text-[13.5px]">
          <Md text={data.verdict} inline />
        </div>
      )}
      {stores.length > 0 && (
        <Section title={tr('Prices now')} className="mt-4">
          <div className="overflow-hidden rounded-xl border border-line">
            {stores.map((s, i) => {
              const best = storeLow !== null && s.price === storeLow;
              return (
                <div key={i} className={cx('flex min-w-0 items-center gap-3 px-3 py-2', i > 0 && 'border-t border-line/70', best && 'bg-ok/[0.06]')}>
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">{s.store}</span>
                  {best && <Chip tone="good">{tr('Lowest price')}</Chip>}
                  <span className="shrink-0 font-semibold tabular-nums">{s.price !== null ? money(s.price) : str(s.raw)}</span>
                  {/^https?:\/\//i.test(s.url) ? (
                    <a href={s.url} target="_blank" rel="noopener noreferrer" title={tr('Go to the store')} aria-label={`${tr('Go to the store')}: ${s.store}`} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-fg-3 transition-colors hover:bg-bg-2 hover:text-accent">
                      <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="w-7 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </Card>
  );
}

// ---- homes for sale or rent --------------------------------------------------------------------------------------------

type ListingSort = '' | 'price' | 'area' | 'value';

/** An area's unit: ft² when it says feet, m² otherwise. */
const areaUnit = (v: unknown) => (/ft|feet|foot|sq\.?\s*f|\bsf\b/i.test(str(v)) ? 'ft²' : 'm²');

/** A price as a number, from one written with its currency after it too ("950 EUR", "1,450 €"); null when there is none. */
const amountOf = (v: unknown) => num(v) ?? num(str(v).replace(/\s*(?:[A-Z]{3}|[€$£¥₹])\s*$/, ''));

/** A listing's currency: as given, else the sign or code its price is written with ("$649,000", "1,450 EUR"). */
const listingCurrency = (it: Data) => str(it.currency).trim() || (/^\s*([^\d\s.,+-]+)/.exec(str(it.price))?.[1] ?? /\b([A-Z]{3})\s*$/.exec(str(it.price))?.[1] ?? '');

function ListingCard({ it, pin, done }: { it: Data; pin: number | null; done: boolean }) {
  const { offline } = useAui();
  const title = textOf(it, 'title', 'name', 'address');
  const pics = [...new Set([it.image, ...(typeof it.images === 'string' ? [it.images] : arr(it.images))].map((p) => textOf(p, 'url', 'src', 'image').trim()).filter(Boolean))];
  const [at, setAt] = useState(0);
  const pic = pics.length && !offline ? pics[Math.min(at, pics.length - 1)] : '';
  const cur = listingCurrency(it);
  const unit = areaUnit(it.area_unit ?? it.unit);
  const price = amountOf(it.price);
  const area = num(it.area ?? it.size);
  const perArea = price !== null && area !== null && area > 0 ? price / area : null;
  const beds = num(it.beds ?? it.bedrooms);
  const baths = num(it.baths ?? it.bathrooms);
  const per = str(it.per).trim();
  const tags = words(it.tags ?? it.features);
  const url = str(it.url ?? it.link).trim();
  const facts = [
    beds !== null && { icon: BedDouble, text: beds === 0 ? tr('Studio') : beds === 1 ? tr('1 bed') : tr('{0} beds').replace('{0}', fmtNum(beds)) },
    baths !== null && { icon: Bath, text: baths === 1 ? tr('1 bath') : tr('{0} baths').replace('{0}', fmtNum(baths)) },
    area !== null && { icon: Maximize2, text: `${fmtNum(area)} ${unit}` },
  ].filter(Boolean) as { icon: typeof Bath; text: string }[];
  const flip = (step: number) => setAt((a) => (Math.min(a, pics.length - 1) + step + pics.length) % pics.length);
  const arrow = 'absolute top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white transition-colors hover:bg-black/65 disabled:hidden';
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel @md:flex-row @xl:flex-col">
      {pic && (
        <div className="relative shrink-0 @md:w-[40%] @md:max-w-[230px] @xl:w-auto @xl:max-w-none">
          <Pic src={pic} alt={title} group={pics} className="aspect-[16/10] w-full @md:aspect-auto @md:h-full @md:min-h-[176px] @xl:aspect-[16/10] @xl:h-auto @xl:min-h-0" />
          {pin !== null && <span className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full border-2 border-panel bg-accent text-[11px] font-semibold text-accent-fg">{pin}</span>}
          {str(it.type) && <span className="absolute top-2 right-2 max-w-[60%] truncate rounded-full bg-panel/90 px-2 py-0.5 text-[11px] font-semibold text-fg shadow-sm">{str(it.type)}</span>}
          {pics.length > 1 && (
            <>
              <button type="button" disabled={!done} onClick={() => flip(-1)} title={tr('Previous picture')} aria-label={tr('Previous picture')} className={cx(arrow, 'left-2')}>
                <ChevronLeft size={16} />
              </button>
              <button type="button" disabled={!done} onClick={() => flip(1)} title={tr('Next picture')} aria-label={tr('Next picture')} className={cx(arrow, 'right-2')}>
                <ChevronRight size={16} />
              </button>
              <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">{`${Math.min(at, pics.length - 1) + 1}/${pics.length}`}</span>
            </>
          )}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <div className="flex min-w-0 items-baseline gap-1.5">
            {pin !== null && !pic && <span className="grid h-5 w-5 shrink-0 place-items-center self-center rounded-full bg-accent text-[10.5px] font-semibold text-accent-fg">{pin}</span>}
            {str(it.price) && <span className="text-[18px] leading-tight font-semibold tracking-tight tabular-nums">{priceText(it.price, cur)}</span>}
            {per && <span className="text-[12.5px] text-fg-3">/ {per}</span>}
          </div>
          {perArea !== null && <span className="text-[12px] text-fg-3 tabular-nums">{`${fmtMoney(perArea, cur, { minimumFractionDigits: 0, maximumFractionDigits: perArea >= 100 ? 0 : 2 })}/${unit}`}</span>}
        </div>
        {facts.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px] text-fg-2">
            {facts.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 tabular-nums">
                <f.icon size={13} className="shrink-0 text-fg-3" />
                {f.text}
              </span>
            ))}
          </div>
        )}
        {title && (
          <div className="mt-2 leading-snug font-semibold">
            {/^https?:\/\//i.test(url) ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent hover:underline">
                {title}
              </a>
            ) : (
              title
            )}
          </div>
        )}
        {str(it.address) && str(it.address) !== title && (
          <div className="mt-0.5 flex items-start gap-1 text-[12px] text-fg-3">
            <MapPin size={12} className="mt-[3px] shrink-0" />
            <span className="min-w-0">{str(it.address)}</span>
          </div>
        )}
        {(!pic || offline) && str(it.type) && <div className="mt-1 text-[12px] text-fg-3">{str(it.type)}</div>}
        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.slice(0, 5).map((t, i) => (
              <Chip key={i}>{t}</Chip>
            ))}
            {tags.length > 5 && <Chip>{`+${tags.length - 5}`}</Chip>}
          </div>
        )}
        {str(it.note) && <Md text={it.note} className="mt-2 text-[12.5px] text-fg-2" />}
      </div>
    </article>
  );
}

function Listings({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const items = arr(data.listings ?? data.homes ?? data.properties ?? data.items).filter(isObj);
  const points = mapPoints(items, 'title', 'address');
  const pins = points.length > 0 && !offline;
  const [sort, setSort] = useKept<ListingSort>('sort', '');
  // Numbers match the map's pins: only homes with a position have one.
  let n = 0;
  const rows = items.map((it, i) => {
    const price = amountOf(it.price);
    const area = num(it.area ?? it.size);
    return { it, i, pin: mapPoints([it]).length ? ++n : null, price, area: area !== null && area > 0 ? area : null, value: price !== null && area !== null && area > 0 ? price / area : null };
  });
  const by: ListingSort = done && (sort === 'price' || sort === 'area' || sort === 'value') ? sort : '';
  const shown =
    by === 'price'
      ? [...rows].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.i - b.i)
      : by === 'area'
        ? [...rows].sort((a, b) => (b.area ?? -Infinity) - (a.area ?? -Infinity) || a.i - b.i)
        : by === 'value'
          ? [...rows].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity) || a.i - b.i)
          : rows;
  const unit = areaUnit(items.find((it) => str(it.area_unit ?? it.unit))?.area_unit ?? items.find((it) => str(it.unit))?.unit);
  const options: { value: ListingSort; label: string }[] = [
    { value: '', label: tr('Suggested') },
    ...(rows.filter((r) => r.price !== null).length > 1 ? [{ value: 'price' as const, label: tr('Lowest price') }] : []),
    ...(rows.filter((r) => r.area !== null).length > 1 ? [{ value: 'area' as const, label: tr('Largest') }] : []),
    ...(rows.filter((r) => r.value !== null).length > 1 ? [{ value: 'value' as const, label: tr('Cheapest per {0}').replace('{0}', unit) }] : []),
  ];
  return (
    <Card pad={false} className="overflow-hidden">
      {(str(data.title) || items.length > 1) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 pb-3 @lg:px-5">
          <div className="min-w-0">
            {str(data.title) && <h3 className="aui-h3">{str(data.title)}</h3>}
            {items.length > 1 && <div className="mt-0.5 text-[12.5px] text-fg-3">{tr('{0} homes').replace('{0}', String(items.length))}</div>}
          </div>
          {options.length > 1 && (
            <div className={cx('max-w-full', !done && 'pointer-events-none opacity-60')}>
              <Seg<ListingSort> size="sm" value={by} onChange={setSort} options={options} />
            </div>
          )}
        </div>
      )}
      {pins && <MapBox points={points} height={250} className="rounded-none border-y border-line" />}
      <div className={cx('grid gap-3 p-4 @lg:p-5 @xl:grid-cols-2', !pins && 'border-t border-line')}>
        {shown.map((r) => (
          <ListingCard key={r.i} it={r.it} pin={pins ? r.pin : null} done={done} />
        ))}
      </div>
    </Card>
  );
}

export const SHOPPING_UIS: Record<string, AnswerUiView> = {
  product: Product,
  products: Products,
  specs: Specs,
  'price-history': PriceHistory,
  listings: Listings,
};
