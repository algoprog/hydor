// The answer UIs for places and travel: their views, by name (shared/answer-ui/travel.ts has what each takes).
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Banknote,
  BedDouble,
  Bike,
  Car,
  Check,
  Clock,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  CornerUpLeft,
  CornerUpRight,
  Droplets,
  Flag,
  Footprints,
  Globe,
  Landmark,
  Lightbulb,
  MapPin,
  Moon,
  Navigation,
  Phone,
  Plane,
  Route,
  Star,
  Sun,
  Ticket,
  TrainFront,
  Utensils,
  Wind,
} from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { arr, Card, Chip, compact, fmtDate, fmtMoney, fmtNum, fmtTime, Head, isObj, LinkOut, MapBox, mapPoints, Md, num, obj, parseDate, Pic, Section, Seg, Stars, str, textOf, TONE, toneOf, useAui, useKept, useNow, yes, type AnswerUiView, type Data, type MapPoint, type Tone } from '../kit';

// ---- places on a map --------------------------------------------------------------------------------------------------

function Places({ data }: { data: Data }) {
  const places = arr(data.places ?? data.items).filter(isObj);
  const points = mapPoints(places);
  const { offline } = useAui();
  // Numbers on the list match the pins: only places with a position get one.
  let n = 0;
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 pb-3 @lg:px-5" />}
      {!offline && points.length > 0 && <MapBox points={points} route={!!data.route} height={300} className="rounded-none border-x-0 border-y" />}
      <ol className="m-0 grid list-none gap-0 p-0 @xl:grid-cols-2">
        {places.map((p, i) => {
          const located = mapPoints([p]).length > 0;
          const num_ = located ? ++n : null;
          return (
            <li key={i} className="flex min-w-0 gap-3 border-b border-line/70 px-4 py-3 @lg:px-5 @xl:odd:border-r">
              <div className="relative shrink-0">
                <Pic src={p.image} alt={str(p.name)} className="h-16 w-16 rounded-lg" />
                {num_ !== null && <span className="absolute -top-1.5 -left-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-panel bg-accent text-[10.5px] font-semibold text-accent-fg">{num_}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  {str(p.url) ? (
                    <LinkOut url={p.url} icon={false} className="line-clamp-2 font-semibold text-fg">
                      {str(p.name)}
                    </LinkOut>
                  ) : (
                    <span className="line-clamp-2 font-semibold">{str(p.name)}</span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-3">
                  {str(p.kind) && <span>{str(p.kind)}</span>}
                  {num(p.rating) !== null && <Stars value={p.rating} size={11} />}
                  {str(p.price) && <span className="font-medium text-fg-2">{str(p.price)}</span>}
                </div>
                {str(p.address) && (
                  <div className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-fg-3">
                    <MapPin size={11} className="shrink-0" />
                    <span className="truncate">{str(p.address)}</span>
                  </div>
                )}
                {str(p.note) && <Md text={p.note} className="mt-1 text-[12.5px] text-fg-2" />}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

// ---- weather --------------------------------------------------------------------------------------------------------------

const ICONS: Record<string, [LucideIcon, string]> = {
  sun: [Sun, 'text-[#e8a317]'],
  clear: [Sun, 'text-[#e8a317]'],
  partly: [CloudSun, 'text-fg-2'],
  cloud: [Cloud, 'text-fg-3'],
  rain: [CloudRain, 'text-info'],
  showers: [CloudDrizzle, 'text-info'],
  storm: [CloudLightning, 'text-warn'],
  snow: [CloudSnow, 'text-info'],
  sleet: [CloudHail, 'text-info'],
  fog: [CloudFog, 'text-fg-3'],
  wind: [Wind, 'text-fg-2'],
  night: [Moon, 'text-fg-2'],
  'partly-night': [CloudMoon, 'text-fg-2'],
};

/** The icon a forecast names, or one its words suggest ("Light rain" → rain). */
function iconOf(icon: unknown, words: unknown): [LucideIcon, string] {
  const k = str(icon).toLowerCase();
  if (ICONS[k]) return ICONS[k];
  const w = `${k} ${str(words)}`.toLowerCase();
  if (/thunder|storm|lightning/.test(w)) return ICONS.storm;
  if (/sleet|hail|freezing/.test(w)) return ICONS.sleet;
  if (/snow|flurr/.test(w)) return ICONS.snow;
  if (/shower|drizzle/.test(w)) return ICONS.showers;
  if (/rain/.test(w)) return ICONS.rain;
  if (/fog|mist|haze|smoke/.test(w)) return ICONS.fog;
  if (/wind|breez|gust/.test(w)) return ICONS.wind;
  if (/partly|mostly sunny|some sun|broken/.test(w)) return ICONS.partly;
  if (/cloud|overcast|grey|gray/.test(w)) return ICONS.cloud;
  if (/night|moon/.test(w)) return ICONS.night;
  return ICONS.sun;
}

function WIcon({ icon, words, size = 20 }: { icon?: unknown; words?: unknown; size?: number }) {
  const [I, c] = iconOf(icon, words);
  return <I size={size} className={cx('shrink-0', c)} aria-label={str(words) || str(icon)} />;
}

/** "Today", "Tomorrow", or the weekday, for a forecast's day. */
function dayName(v: unknown): string {
  const d = parseDate(v);
  if (!d) return str(v);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400_000);
  if (diff === 0) return tr('Today');
  if (diff === 1) return tr('Tomorrow');
  return fmtDate(d, diff > 0 && diff < 7 ? 'weekday' : 'dayMonth');
}

function Weather({ data }: { data: Data }) {
  const unit = str(data.unit).toUpperCase() === 'F' ? '°F' : '°C';
  const deg = (v: unknown) => (num(v) === null ? '' : `${fmtNum(Math.round(num(v)!))}°`);
  const now = isObj(data.now) ? data.now : null;
  const hourly = arr(data.hourly).filter(isObj);
  const daily = arr(data.daily).filter(isObj);
  const lows = daily.map((d) => num(d.low)).filter((v): v is number => v !== null);
  const highs = daily.map((d) => num(d.high)).filter((v): v is number => v !== null);
  const wMin = Math.min(...lows, ...highs);
  const wMax = Math.max(...lows, ...highs);
  const span = wMax - wMin || 1;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="aui-h3">{str(data.location)}</h3>
          {now && <div className="text-[13px] text-fg-3">{str(now.condition)}</div>}
        </div>
        {now && (
          <div className="flex items-center gap-3">
            <WIcon icon={now.icon} words={now.condition} size={40} />
            <div className="text-right">
              <div className="text-[40px] leading-none font-semibold tracking-tight">{deg(now.temp)}</div>
              {num(now.feels) !== null && <div className="mt-1 text-[12px] text-fg-3">{tr('Feels like {0}').replace('{0}', deg(now.feels))}</div>}
            </div>
          </div>
        )}
      </div>
      {now && (num(now.humidity) !== null || str(now.wind) || num(now.uv) !== null) && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-fg-2">
          {num(now.humidity) !== null && (
            <span className="inline-flex items-center gap-1.5">
              <Droplets size={13} className="text-fg-3" />
              {tr('Humidity')} <b className="font-medium">{fmtNum(num(now.humidity))}%</b>
            </span>
          )}
          {str(now.wind) && (
            <span className="inline-flex items-center gap-1.5">
              <Wind size={13} className="text-fg-3" />
              {tr('Wind')} <b className="font-medium">{str(now.wind)}</b>
            </span>
          )}
          {num(now.uv) !== null && (
            <span className="inline-flex items-center gap-1.5">
              <Sun size={13} className="text-fg-3" />
              {tr('UV index')} <b className="font-medium">{fmtNum(num(now.uv))}</b>
            </span>
          )}
        </div>
      )}
      {arr(data.alerts)
        .filter(isObj)
        .map((a, i) => (
          <div key={i} className={cx('mt-3 flex gap-2 rounded-lg px-3 py-2 text-[13px]', TONE[a.tone ? toneOf(a.tone) : 'warn'])}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">{str(a.title)}</div>
              {str(a.text) && <Md text={a.text} className="text-fg-2" />}
            </div>
          </div>
        ))}
      {hourly.length > 0 && (
        <div className="-mx-1 mt-4 flex gap-1 overflow-x-auto pb-1">
          {hourly.map((h, i) => {
            const rain = num(h.rain);
            return (
              <div key={i} className="flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-[12px] whitespace-nowrap hover:bg-bg-1">
                <span className="text-fg-3">{i === 0 && !h.time ? tr('Now') : fmtTime(h.time)}</span>
                <WIcon icon={h.icon} words={h.condition} size={20} />
                <span className="font-semibold">{deg(h.temp)}</span>
                <span className={cx('text-[11px] tabular-nums', rain && rain >= 30 ? 'text-info' : 'text-transparent')}>{rain !== null ? `${fmtNum(rain)}%` : '·'}</span>
              </div>
            );
          })}
        </div>
      )}
      {daily.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          {daily.map((d, i) => {
            const lo = num(d.low);
            const hi = num(d.high);
            const rain = num(d.rain);
            return (
              <div key={i} className="grid grid-cols-[minmax(64px,auto)_24px_minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 text-[13px] @lg:grid-cols-[96px_24px_minmax(0,1fr)_44px_minmax(110px,180px)]">
                <span className="font-medium">{dayName(d.date)}</span>
                <WIcon icon={d.icon} words={d.condition} size={18} />
                <span className="truncate text-fg-3">{str(d.condition)}</span>
                <span className={cx('hidden text-right text-[12px] tabular-nums @lg:block', rain && rain >= 30 ? 'text-info' : 'text-fg-3')}>{rain !== null && rain > 0 ? `${fmtNum(rain)}%` : ''}</span>
                <span className="col-span-4 flex items-center gap-2 tabular-nums @lg:col-span-1">
                  <span className="w-8 text-right text-fg-3">{deg(lo)}</span>
                  <span className="relative h-1.5 flex-1 rounded-full bg-bg-3">
                    {lo !== null && hi !== null && <span className="absolute inset-y-0 rounded-full" style={{ left: `${((lo - wMin) / span) * 100}%`, right: `${100 - ((hi - wMin) / span) * 100}%`, background: 'linear-gradient(90deg, var(--viz-1), var(--viz-4))' }} />}
                  </span>
                  <span className="w-8 font-medium">{deg(hi)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {(str(data.note) || str(obj(data.source).name)) && (
        <div className="mt-2 text-[12px] text-fg-3">
          {str(data.note) && <Md text={data.note} inline />} {str(obj(data.source).name) && <Chip className="ml-1">{`${str(obj(data.source).name)} · ${unit}`}</Chip>}
        </div>
      )}
    </Card>
  );
}

// ---- shared by the views below ----------------------------------------------------------------------------------------

const lang = () => LOCALE ?? (typeof navigator !== 'undefined' ? navigator.language : 'en');
const pad2 = (n: number) => String(n).padStart(2, '0');

/** Minutes past midnight from a time of day ("14:30", "2:30 pm"); null when it is not one. */
function clockMin(v: unknown): number | null {
  const m = /^(\d{1,2})(?:[:.h](\d{2}))?\s*(?:([ap])\.?\s*m\.?)?$/i.exec(str(v).trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return h > 24 || min > 59 ? null : h * 60 + min;
}

/** Minutes past midnight as a time of day in the app's language (9:00 AM). */
const minText = (m: number) => fmtTime(`${pad2(Math.floor((((m % 1440) + 1440) % 1440) / 60))}:${pad2(Math.round(((m % 60) + 60) % 60))}`);

/** The minutes in a duration as agents write one ("12 h 25 min", "1h30", "45 min", "2:05"); null when there are none. */
function durationMin(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = str(v).trim().toLowerCase();
  if (!t) return null;
  const hm = /^(\d+):(\d{2})$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const h = /(\d+(?:[.,]\d+)?)\s*(?:h|hr|hrs|hours?)\b/.exec(t) ?? /(\d+)\s*h(?=\d)/.exec(t);
  const m = /(\d+)\s*(?:m|min|mins|minutes?)\b/.exec(t) ?? /h\s*(\d+)$/.exec(t);
  if (!h && !m) return num(t);
  return (h ? Number(h[1].replace(',', '.')) * 60 : 0) + (m ? Number(m[1]) : 0);
}

/** "20–22 Nov 2026": the days from one date to another, as the app's language writes a range. */
function dateRange(a: Date, b: Date): string {
  try {
    const f = new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', year: 'numeric' }) as Intl.DateTimeFormat & { formatRange?: (x: Date, y: Date) => string };
    if (f.formatRange) return f.formatRange(a, b);
  } catch {}
  return `${fmtDate(a, 'short')} – ${fmtDate(b, 'medium')}`;
}

/** Money as a price is written: no cents when it has none ($945, not $945.00). */
const moneyWhole = (n: number, currency: string) => fmtMoney(n, currency, Number.isInteger(n) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {});

/** A sort control that is shown while the block streams but only works once it is whole; picking it again turns it off. */
function SortSeg<T extends string>({ value, options, onChange, done }: { value: T | ''; options: { value: T; label: string }[]; onChange: (v: T | '') => void; done: boolean }) {
  return (
    <div className={cx('max-w-full', !done && 'pointer-events-none opacity-60')}>
      <Seg size="sm" value={value} onChange={(v) => onChange(v === value ? '' : v)} options={options} />
    </div>
  );
}

// ---- one place --------------------------------------------------------------------------------------------------------

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Whether a day of opening hours ("Mon–Thu", "Saturday", "Weekends", "Daily") takes in today (in English words). */
function coversToday(label: string, today: number): boolean {
  const t = label.toLowerCase();
  if (/\b(daily|every ?day|all week)\b/.test(t)) return true;
  if (/\bweekends?\b/.test(t)) return today === 0 || today === 6;
  if (/\bweekdays?\b/.test(t)) return today >= 1 && today <= 5;
  const found = [...t.matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\.?/g)].map((m) => ({ d: WEEKDAYS.indexOf(m[1]), from: m.index ?? 0, to: (m.index ?? 0) + m[0].length }));
  for (let i = 0; i < found.length; i++) {
    const a = found[i];
    const b = found[i + 1];
    if (b && /^\s*(?:[-–—]|to|until|through|thru)\s*$/.test(t.slice(a.to, b.from))) {
      if (a.d <= b.d ? today >= a.d && today <= b.d : today >= a.d || today <= b.d) return true;
      i++;
    } else if (a.d === today) return true;
  }
  return false;
}

/** A place's pictures: the first large and up to four more beside it (two when narrow), all opened large on a click. */
function Mosaic({ pics, alt }: { pics: string[]; alt: string }) {
  const rest = pics.slice(1, 5);
  if (!rest.length) return <Pic src={pics[0]} alt={alt} group={pics} className="aspect-[16/7] max-h-[300px] w-full" />;
  return (
    <div className={cx('grid h-[210px] grid-rows-2 gap-0.5 @lg:h-[270px]', rest.length > 2 ? 'grid-cols-[2fr_1fr] @lg:grid-cols-[2fr_1fr_1fr]' : 'grid-cols-[2fr_1fr]')}>
      <Pic src={pics[0]} alt={alt} group={pics} className="row-span-2 h-full min-h-0 w-full" />
      {rest.map((p, i) => (
        <Pic key={i} src={p} alt={alt} group={pics} className={cx('h-full min-h-0 w-full', rest.length === 1 && 'row-span-2', i >= 2 && 'hidden @lg:block', rest.length === 3 && i === 2 && '@lg:col-span-2')} />
      ))}
    </div>
  );
}

function Place({ data }: { data: Data }) {
  const { offline } = useAui();
  const name = str(data.name ?? data.title);
  const pics = [...new Set([data.image, ...arr(data.images ?? data.photos)].map((x) => (isObj(x) ? str(x.url ?? x.src) : str(x)).trim()).filter(Boolean))];
  const points = mapPoints([{ ...data, name, note: str(data.address) }]);
  const hours = Array.isArray(data.hours)
    ? arr(data.hours)
        .map((h) => (isObj(h) ? { day: str(h.day ?? h.days), hours: str(h.hours ?? h.time ?? h.open) } : { day: '', hours: str(h) }))
        .filter((h) => h.day || h.hours)
    : [];
  const hoursLine = Array.isArray(data.hours) ? '' : str(data.hours);
  const open = typeof data.open_now === 'boolean' ? data.open_now : yes(data.open_now) ? true : /^(false|no|closed)$/i.test(str(data.open_now).trim()) ? false : null;
  const today = new Date().getDay();
  const highlights = arr(data.highlights).map((x) => textOf(x)).filter(Boolean);
  const tips = arr(data.tips).map((x) => textOf(x)).filter(Boolean);
  const phone = str(data.phone).trim();
  const site = str(data.website ?? data.url).trim();
  const facts = !!(str(data.address) || hours.length || hoursLine || phone || site || (points.length && !offline));
  const notes = highlights.length > 0 || tips.length > 0;
  const row = 'flex gap-2.5 text-[13px]';
  const icon = 'mt-[3px] shrink-0 text-fg-3';
  return (
    <Card pad={false} className="overflow-hidden">
      {pics.length > 0 && !offline && <Mosaic pics={pics} alt={name} />}
      <div className="p-4 @lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="aui-h3 text-[19px]">{name}</h3>
            {(str(data.kind) || num(data.rating) !== null || str(data.price)) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-3">
                {str(data.kind) && <span>{str(data.kind)}</span>}
                {num(data.rating) !== null && <Stars value={data.rating} count={data.reviews} />}
                {str(data.price) && <span className="font-medium text-fg-2">{str(data.price)}</span>}
              </div>
            )}
          </div>
          {open !== null && (
            <Chip tone={open ? 'good' : 'bad'} className="mt-0.5 shrink-0">
              {open ? tr('Open now') : tr('Closed now')}
            </Chip>
          )}
        </div>
        {str(data.summary) && <Md text={data.summary} className="mt-3 text-[13.5px] text-fg-2" />}
        {(notes || facts) && (
          <div className={cx('mt-4 grid gap-5', notes && facts && '@xl:grid-cols-[minmax(0,1fr)_minmax(0,250px)]')}>
            {notes && (
              <div className="min-w-0 space-y-4">
                {highlights.length > 0 && (
                  <Section title={tr('Highlights')}>
                    <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px]">
                      {highlights.map((h, i) => (
                        <li key={i} className="flex gap-2">
                          <Check size={14} strokeWidth={2.5} className="mt-[3px] shrink-0 text-accent" />
                          <Md text={h} inline />
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
                {tips.length > 0 && (
                  <Section title={tr('Tips')}>
                    <ul className="m-0 list-none space-y-1.5 p-0 text-[13.5px] text-fg-2">
                      {tips.map((h, i) => (
                        <li key={i} className="flex gap-2">
                          <Lightbulb size={14} className="mt-[3px] shrink-0 text-accent" />
                          <Md text={h} inline />
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </div>
            )}
            {facts && (
              <div className="min-w-0 space-y-3">
                {str(data.address) && (
                  <div className={row}>
                    <MapPin size={14} className={icon} />
                    <span className="min-w-0 text-fg-2">{str(data.address)}</span>
                  </div>
                )}
                {(hours.length > 0 || hoursLine) && (
                  <div className={row}>
                    <Clock size={14} className={icon} />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {hoursLine && <div className="text-fg-2">{hoursLine}</div>}
                      {hours.map((h, i) => {
                        const now = coversToday(h.day, today);
                        return (
                          <div key={i} className={cx('flex items-baseline justify-between gap-3', now ? 'font-semibold text-fg' : 'text-fg-2')}>
                            <span className="flex items-center gap-1.5">
                              {h.day}
                              {now && <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" title={tr('Today')} />}
                            </span>
                            <span className="text-right tabular-nums">{h.hours}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {phone && (
                  <div className={row}>
                    <Phone size={14} className={icon} />
                    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="text-fg-2 tabular-nums hover:text-accent">
                      {phone}
                    </a>
                  </div>
                )}
                {site && (
                  <div className={row}>
                    <Globe size={14} className={icon} />
                    <LinkOut url={site} className="min-w-0" />
                  </div>
                )}
                {points.length > 0 && <MapBox points={points} numbered={false} height={170} />}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- an itinerary -----------------------------------------------------------------------------------------------------

const STOP_KINDS: Record<string, { icon: LucideIcon; label: () => string }> = {
  sight: { icon: Landmark, label: () => tr('Sight') },
  food: { icon: Utensils, label: () => tr('Food') },
  travel: { icon: TrainFront, label: () => tr('Travel') },
  stay: { icon: BedDouble, label: () => tr('Stay') },
  activity: { icon: Ticket, label: () => tr('Activity') },
};

/** A stop's kind: as given, or as its words suggest ("Lunch at…" is food). */
function stopKind(it: Data): string {
  const k = str(it.kind ?? it.type).toLowerCase();
  if (STOP_KINDS[k]) return k;
  const w = `${k} ${str(it.title ?? it.name)}`.toLowerCase();
  if (/lunch|dinner|breakfast|brunch|café|cafe|coffee|restaurant|food|eat|drinks/.test(w)) return 'food';
  if (/train|flight|fly|bus|drive|ferry|taxi|transfer|airport|station|metro|subway/.test(w)) return 'travel';
  if (/hotel|check[- ]?in|check[- ]?out|ryokan|hostel|stay|apartment/.test(w)) return 'stay';
  if (/walk|hike|tour|class|show|concert|swim|bike|kayak|activity/.test(w)) return 'activity';
  return 'sight';
}

/** The costs of a day added up, when they are written alike ("¥1,000", "¥500"); empty when they cannot be. */
function sumCosts(list: unknown[]): string {
  let unit: string | null = null;
  let total = 0;
  let count = 0;
  for (const c of list) {
    const m = /^([^\d\s]{0,4})\s?(\d[\d,.]*)\s?([^\d\s]{0,4})$/.exec(str(c).trim());
    const n = m ? num(m[2]) : null;
    if (!m || n === null) continue;
    const u = `${m[1]}|${m[3]}`;
    if (unit !== null && unit !== u) return '';
    unit = u;
    total += n;
    count++;
  }
  if (count < 2 || unit === null) return '';
  const [pre, post] = unit.split('|');
  return `${pre}${fmtNum(total)}${post ? ` ${post}` : ''}`;
}

function Itinerary({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const days = arr(data.days).filter(isObj);
  const [pick, setPick] = useKept<number>('day', 0);
  const at = Math.min(Math.max(0, Math.round(num(pick) ?? 0)), Math.max(0, days.length - 1));
  const day: Data = days[at] ?? {};
  const items = arr(day.items ?? day.stops ?? day.plan).map((x) => (isObj(x) ? x : { title: str(x) }));
  const points = mapPoints(items, 'title', 'place');
  const showPins = points.length > 0 && !offline;
  const timed = items.some((it) => str(it.time));
  const total = sumCosts(items.map((it) => it.cost));
  const dates = days.map((d) => parseDate(d.date)).filter((d): d is Date => !!d);
  const sub = [dates.length > 1 ? dateRange(dates[0], dates[dates.length - 1]) : dates.length ? fmtDate(dates[0], 'medium') : '', days.length > 1 ? tr('{0} days').replace('{0}', String(days.length)) : ''].filter(Boolean).join(' · ');
  const dayDate = parseDate(day.date);
  let pin = 0;
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="px-4 pt-4 @lg:px-5">
        <Head title={data.title} sub={sub} className="mb-3" />
        {days.length > 1 && (
          <div className={cx('max-w-full', !done && 'pointer-events-none')}>
            <Seg size="sm" value={at} onChange={(v) => setPick(v)} options={days.map((d, i) => ({ value: i, label: parseDate(d.date) ? fmtDate(d.date, 'dayMonth') : tr('Day {0}').replace('{0}', String(i + 1)) }))} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-0.5 pb-3">
          <div className="min-w-0">
            <div className="text-[12px] font-medium text-fg-3">{[days.length > 1 ? tr('Day {0}').replace('{0}', String(at + 1)) : '', dayDate ? fmtDate(dayDate, 'long') : ''].filter(Boolean).join(' · ')}</div>
            {str(day.title) && <div className="text-[15px] leading-snug font-semibold">{str(day.title)}</div>}
          </div>
          {items.length > 0 && (
            <div className="text-[12px] text-fg-3 tabular-nums">
              {tr('{0} stops').replace('{0}', String(items.length))}
              {total && ` · ${total}`}
            </div>
          )}
        </div>
      </div>
      {points.length > 0 && <MapBox points={points} route={points.length > 1} height={240} className="rounded-none border-y border-line" />}
      <ol className={cx('m-0 list-none px-4 pt-4 pb-4 @lg:px-5', !points.length && 'border-t border-line')}>
        {items.map((it, i) => {
          const kind = STOP_KINDS[stopKind(it)];
          const Icon = kind.icon;
          const n = mapPoints([it]).length ? ++pin : null;
          const meta = [str(it.duration) && { icon: Clock, text: str(it.duration) }, str(it.cost) && { icon: Banknote, text: str(it.cost) }].filter(Boolean) as { icon: LucideIcon; text: string }[];
          return (
            <li key={i} className="flex gap-3 pb-4 last:pb-0">
              {timed && <div className="w-[52px] shrink-0 pt-1.5 text-right text-[12.5px] font-medium whitespace-nowrap text-fg-2 tabular-nums">{fmtTime(it.time)}</div>}
              <div className="relative flex shrink-0 flex-col items-center">
                <span className="relative z-[1] grid h-8 w-8 place-items-center rounded-full bg-bg-2 text-fg-2" title={kind.label()}>
                  <Icon size={15} />
                  {n !== null && showPins && <span className="absolute -top-1.5 -left-1.5 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-panel bg-accent text-[9.5px] font-semibold text-accent-fg">{n}</span>}
                </span>
                {i < items.length - 1 && <span className="absolute top-8 -bottom-4 w-px bg-line" aria-hidden />}
              </div>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="leading-snug font-semibold">{textOf(it, 'title', 'name')}</div>
                    {str(it.place) && <div className="text-[12.5px] text-fg-3">{str(it.place)}</div>}
                  </div>
                  {str(it.image) && !offline && <Pic src={it.image} alt={textOf(it, 'title', 'name')} className="h-12 w-16 shrink-0 rounded-md" />}
                </div>
                {str(it.note) && <Md text={it.note} className="mt-0.5 text-[13px] text-fg-2" />}
                {meta.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-fg-3">
                    {meta.map((m, k) => (
                      <span key={k} className="inline-flex items-center gap-1 tabular-nums">
                        <m.icon size={12} />
                        {m.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** At most `max` points of a line with its shape kept (Douglas–Peucker, its tolerance raised until few enough are left). */
function thinPath(pts: MapPoint[], max = 12): MapPoint[] {
  if (pts.length <= max) return pts;
  const k = Math.cos((pts[0].lat * Math.PI) / 180);
  const xy = pts.map((p) => [p.lng * k, p.lat]);
  const off = (i: number, a: number, b: number) => {
    const [x, y] = xy[i];
    const [x1, y1] = xy[a];
    const [x2, y2] = xy[b];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = dx || dy ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))) : 0;
    return Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
  };
  const keep = (eps: number) => {
    const out = new Set([0, pts.length - 1]);
    const todo: [number, number][] = [[0, pts.length - 1]];
    while (todo.length) {
      const [a, b] = todo.pop()!;
      let far = 0;
      let at = -1;
      for (let i = a + 1; i < b; i++) {
        const d = off(i, a, b);
        if (d > far) [far, at] = [d, i];
      }
      if (at >= 0 && far > eps) {
        out.add(at);
        todo.push([a, at], [at, b]);
      }
    }
    return [...out].sort((x, y) => x - y);
  };
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const size = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  for (let f = 0.004; f < 1; f *= 1.5) {
    const idx = keep(size * f);
    if (idx.length <= max) return idx.map((i) => pts[i]);
  }
  return [pts[0], pts[pts.length - 1]];
}

// ---- directions -------------------------------------------------------------------------------------------------------

const MODES: Record<string, { icon: LucideIcon; label: () => string; google: string }> = {
  walk: { icon: Footprints, label: () => tr('On foot'), google: 'walking' },
  drive: { icon: Car, label: () => tr('By car'), google: 'driving' },
  transit: { icon: TrainFront, label: () => tr('By public transport'), google: 'transit' },
  bike: { icon: Bike, label: () => tr('By bike'), google: 'bicycling' },
};

function modeOf(v: unknown): string {
  const s = str(v).trim().toLowerCase();
  if (MODES[s]) return s;
  if (/walk|foot/.test(s)) return 'walk';
  if (/bike|bicycl|cycl/.test(s)) return 'bike';
  if (/transit|train|bus|metro|subway|tram|public/.test(s)) return 'transit';
  if (/driv|car|taxi/.test(s)) return 'drive';
  return '';
}

/** An arrow for a step, from its words (English): left, right, the start, the arrival. */
function turnIcon(text: string, i: number, last: boolean): LucideIcon {
  const t = text.toLowerCase();
  if (last && /arriv|destination|you reach|on your (left|right)|ahead/.test(t)) return Flag;
  if (i === 0) return Navigation;
  const l = t.search(/\bleft\b/);
  const r = t.search(/\bright\b/);
  if (l >= 0 && (r < 0 || l < r)) return CornerUpLeft;
  if (r >= 0) return CornerUpRight;
  return last ? Flag : ArrowUp;
}

function Directions({ data }: { data: Data }) {
  const { offline } = useAui();
  const from = str(data.from ?? data.origin);
  const to = str(data.to ?? data.destination);
  const mode = MODES[modeOf(data.mode)];
  const Icon = mode?.icon ?? Route;
  const steps = arr(data.steps).map((s) => (isObj(s) ? s : { text: str(s) }));
  // The line keeps its shape (thinned past 200 points, which a map cannot tell apart); it is pinned at its ends only.
  const path = thinPath(mapPoints(arr(data.path ?? data.route ?? data.line).map((p) => (Array.isArray(p) ? { lat: p[0], lng: p[1] } : p))), 200);
  if (path.length > 1) {
    path[0] = { ...path[0], name: from };
    path[path.length - 1] = { ...path[path.length - 1], name: to };
  }
  const alts = arr(data.alternatives ?? data.options).filter(isObj);
  const maps = from && to ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}${mode ? `&travelmode=${mode.google}` : ''}` : '';
  const facts = [str(data.distance), mode?.label() ?? ''].filter(Boolean);
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex items-start gap-3 p-4 @lg:p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 leading-snug font-semibold">
            <span>{from}</span>
            {from && to && <ArrowRight size={14} className="shrink-0 text-fg-3" />}
            <span>{to}</span>
          </div>
          {(str(data.duration) || facts.length > 0) && (
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px] text-fg-3">
              {str(data.duration) && <span className="text-[20px] font-semibold text-fg tabular-nums">{str(data.duration)}</span>}
              {facts.map((f, i) => (
                <span key={i} className="tabular-nums">
                  {i > 0 || str(data.duration) ? '· ' : ''}
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
        {maps && (
          <LinkOut url={maps} className="mt-0.5 shrink-0 text-[12.5px]">
            Google Maps
          </LinkOut>
        )}
      </div>
      {path.length > 1 && !offline && <MapBox points={path} route ends numbered={false} height={260} className="rounded-none border-y border-line" />}
      {steps.length > 0 && (
        <ol className={cx('m-0 list-none p-0', path.length < 2 && 'border-t border-line')}>
          {steps.map((s, i) => {
            const text = textOf(s, 'text', 'instruction', 'step');
            const Turn = turnIcon(text, i, i === steps.length - 1);
            return (
              <li key={i} className="flex gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0 @lg:px-5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg-2 text-fg-2">
                  <Turn size={14} />
                </span>
                <div className="min-w-0 flex-1 pt-1 text-[13.5px]">
                  <Md text={text} inline />
                </div>
                {(str(s.distance) || str(s.duration)) && (
                  <div className="shrink-0 pt-0.5 text-right text-[12px] leading-tight text-fg-3 tabular-nums">
                    {str(s.distance) && <div className="font-medium text-fg-2">{str(s.distance)}</div>}
                    {str(s.duration) && <div>{str(s.duration)}</div>}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {alts.length > 0 && (
        <div className="border-t border-line bg-bg-1 px-4 py-3 @lg:px-5">
          <h4 className="aui-h4 mb-1.5">{tr('Other ways')}</h4>
          <ul className="m-0 list-none space-y-2 p-0">
            {alts.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-3 text-[13px]">
                <div className="min-w-0">
                  <div className="font-medium">{textOf(a, 'name', 'mode', 'title')}</div>
                  {str(a.note) && <Md text={a.note} className="text-[12.5px] text-fg-3" />}
                </div>
                <div className="shrink-0 text-right leading-tight tabular-nums">
                  <div className="font-semibold">{str(a.duration)}</div>
                  {str(a.distance) && <div className="text-[12px] text-fg-3">{str(a.distance)}</div>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

// ---- flights ----------------------------------------------------------------------------------------------------------

const FLIGHT_TAGS: Record<string, { tone: Tone; label: () => string }> = {
  cheapest: { tone: 'good', label: () => tr('Cheapest') },
  fastest: { tone: 'info', label: () => tr('Fastest') },
  best: { tone: 'accent', label: () => tr('Best') },
};
type FlightSort = 'price' | 'duration' | 'depart';

/** Two letters for an airline: its code from the flight number ("LH 401"), or its name's first letters. */
function airlineCode(f: Data): string {
  const m = /^\s*([A-Z0-9]{2})\s?\d/.exec(str(f.number));
  if (m) return m[1];
  return str(f.airline)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function Flights({ data, done }: { data: Data; done: boolean }) {
  const list = arr(data.flights ?? data.options ?? data.items).filter(isObj);
  const [sort, setSort] = useKept<FlightSort | ''>('sort', '');
  const rows = list.map((f, i) => ({ f, i, price: num(f.price), duration: durationMin(f.duration), depart: clockMin(f.depart) }));
  // With no tags given, the cheapest and the fastest are marked.
  const tagged = list.some((f) => str(f.tag));
  const least = (k: 'price' | 'duration') => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x !== null);
    return !tagged && v.length > 1 ? Math.min(...v) : null;
  };
  const cheap = least('price');
  const fast = least('duration');
  const shown = done && sort ? [...rows].sort((a, b) => (a[sort] ?? Infinity) - (b[sort] ?? Infinity)) : rows;
  const cabins = [...new Set(list.map((f) => str(f.cabin).trim()).filter(Boolean))];
  const cabin = cabins.length === 1 && list.length > 1 && list.every((f) => str(f.cabin).trim() === cabins[0]) ? cabins[0] : '';
  const sub = [str(data.date) ? fmtDate(data.date, 'long') : '', list.length > 1 ? tr('{0} flights').replace('{0}', String(list.length)) : '', cabin].filter(Boolean).join(' · ');
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-line px-4 pt-4 pb-3 @lg:px-5">
        <div className="min-w-0">
          <h3 className="aui-h3 flex flex-wrap items-center gap-x-2">
            <span>{str(data.from)}</span>
            {str(data.from) && str(data.to) && <Plane size={15} className="shrink-0 text-fg-3" />}
            <span>{str(data.to)}</span>
          </h3>
          {sub && <div className="mt-0.5 text-[12.5px] text-fg-3">{sub}</div>}
        </div>
        {rows.length > 1 && (
          <SortSeg
            value={sort}
            onChange={setSort}
            done={done}
            options={[
              { value: 'price', label: tr('Price') },
              { value: 'duration', label: tr('Duration') },
              { value: 'depart', label: tr('Departure') },
            ]}
          />
        )}
      </div>
      <ul className="m-0 list-none p-0">
        {shown.map(({ f, i, price, duration }) => {
          const tags = [...new Set([str(f.tag).toLowerCase(), cheap !== null && price === cheap ? 'cheapest' : '', fast !== null && duration === fast ? 'fastest' : ''].filter(Boolean))];
          const stops = num(f.stops);
          const via = str(f.via);
          const stopText = stops === 0 ? tr('Nonstop') : stops === null ? '' : `${stops === 1 ? tr('1 stop') : tr('{0} stops').replace('{0}', String(stops))}${via ? ` · ${via}` : ''}`;
          const cur = str(f.currency || data.currency);
          const priceText = price !== null && (cur || typeof f.price === 'number') ? moneyWhole(price, cur) : str(f.price);
          const arrive = str(f.arrive).replace(/\s*\+\s*\d\s*$/, '');
          const next = yes(f.next_day) || /\+\s*1\s*$/.test(str(f.arrive));
          const dots = stops !== null && stops > 0 ? Math.min(stops, 3) : 0;
          return (
            <li key={i} className="flex items-center gap-3 border-b border-line/70 px-4 py-3 last:border-b-0 @lg:px-5">
              <span className="hidden h-9 w-9 shrink-0 place-items-center rounded-full bg-bg-2 text-[11px] font-semibold tracking-wide text-fg-2 @sm:grid">{airlineCode(f)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[15px] font-semibold tabular-nums">
                  <span>{fmtTime(f.depart)}</span>
                  <span className="relative flex h-3 max-w-[140px] min-w-[32px] flex-1 items-center" aria-hidden>
                    <span className="h-px w-full bg-line-2" />
                    {Array.from({ length: dots }, (_, k) => (
                      <span key={k} className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-fg-3 bg-panel" style={{ left: `${((k + 1) / (dots + 1)) * 100}%` }} />
                    ))}
                  </span>
                  <span className="whitespace-nowrap">
                    {fmtTime(arrive)}
                    {next && <sup className="ml-0.5 text-[10px] font-medium text-fg-3">+1</sup>}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-fg-3">
                  <span className="font-medium text-fg-2">{str(f.airline)}</span>
                  {str(f.number) && <span className="hidden @md:inline">{str(f.number)}</span>}
                  {str(f.duration) && <span>· {str(f.duration)}</span>}
                  {stopText && <span>· {stopText}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {str(f.url) ? (
                  <LinkOut url={f.url} className="text-[15px] font-semibold tabular-nums">
                    {priceText}
                  </LinkOut>
                ) : (
                  <span className="text-[15px] font-semibold tabular-nums">{priceText}</span>
                )}
                {tags.length > 0 && (
                  <span className="flex flex-wrap justify-end gap-1">
                    {tags.map((t) => (
                      <Chip key={t} tone={FLIGHT_TAGS[t]?.tone ?? 'neutral'}>
                        {FLIGHT_TAGS[t]?.label() ?? t}
                      </Chip>
                    ))}
                  </span>
                )}
                {!cabin && str(f.cabin) && <span className="text-[11.5px] text-fg-3">{str(f.cabin)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ---- places to stay ---------------------------------------------------------------------------------------------------

type StaySort = 'price' | 'rating';

/** A guests' score on a scale of ten (one out of 5 is doubled). */
const score10 = (v: unknown) => {
  const n = num(v);
  return n === null ? null : n <= 5 ? n * 2 : n;
};

function Score({ value, count }: { value: unknown; count?: unknown }) {
  const n = num(value);
  if (n === null) return null;
  if (n <= 5) return <Stars value={n} count={count} size={11} />;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span className="rounded-md bg-accent px-1.5 py-0.5 text-[12px] leading-none font-semibold text-accent-fg tabular-nums">{fmtNum(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      {num(count) !== null && <span className="text-[11.5px] text-fg-3">({compact(num(count))})</span>}
    </span>
  );
}

function StayCard({ s, pin, cur }: { s: Data; pin: number | null; cur: string }) {
  const { offline } = useAui();
  const name = textOf(s, 'name', 'title');
  const stars = Math.min(5, Math.max(0, Math.round(num(s.stars) ?? 0)));
  const money = (v: unknown) => {
    const n = num(v);
    return n !== null && (cur || typeof v === 'number') ? moneyWhole(n, cur) : str(v);
  };
  const amenities = arr(s.amenities).map((a) => textOf(a)).filter(Boolean);
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-panel @sm:flex-row @xl:flex-col">
      {!offline && str(s.image) && (
        <div className="relative shrink-0 @sm:w-[38%] @sm:max-w-[200px] @xl:w-auto @xl:max-w-none">
          <Pic src={s.image} alt={name} className="aspect-[2/1] w-full @sm:aspect-auto @sm:h-full @sm:min-h-[150px] @xl:aspect-[16/10] @xl:h-auto @xl:min-h-0" />
          {pin !== null && <span className="absolute top-2 left-2 grid h-6 w-6 place-items-center rounded-full border-2 border-panel bg-accent text-[11px] font-semibold text-accent-fg">{pin}</span>}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 leading-snug font-semibold">
              {pin !== null && (offline || !str(s.image)) && <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[10.5px] text-accent-fg">{pin}</span>}
              {/^https?:\/\//i.test(str(s.url).trim()) ? (
                <a href={str(s.url).trim()} target="_blank" rel="noopener noreferrer" className="text-fg hover:text-accent hover:underline">
                  {name}
                </a>
              ) : (
                <span>{name}</span>
              )}
              {stars > 0 && (
                <span className="inline-flex text-fg-3" title={tr('{0} stars').replace('{0}', String(stars))}>
                  {Array.from({ length: stars }, (_, k) => (
                    <Star key={k} size={10} fill="currentColor" strokeWidth={0} />
                  ))}
                </span>
              )}
            </div>
            {str(s.area) && <div className="text-[12px] text-fg-3">{str(s.area)}</div>}
          </div>
          <Score value={s.rating} count={s.reviews} />
        </div>
        {amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {amenities.slice(0, 4).map((a, k) => (
              <Chip key={k}>{a}</Chip>
            ))}
            {amenities.length > 4 && <Chip>{`+${amenities.length - 4}`}</Chip>}
          </div>
        )}
        {str(s.note) && <Md text={s.note} className="mt-2 text-[12.5px] text-fg-2" />}
        {(str(s.price) || str(s.total)) && (
          <div className="mt-auto flex items-end justify-between gap-2 pt-3">
            <div className="min-w-0 leading-tight">
              {str(s.price) && (
                <div>
                  <span className="text-[16px] font-semibold tabular-nums">{money(s.price)}</span> <span className="text-[12px] text-fg-3">/ {str(s.per) || tr('night')}</span>
                </div>
              )}
              {str(s.total) && <div className="mt-0.5 text-[12px] text-fg-3 tabular-nums">{tr('{0} in all').replace('{0}', money(s.total))}</div>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function Stays({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const stays = arr(data.stays ?? data.hotels ?? data.items).filter(isObj);
  const points = mapPoints(stays);
  const pins = points.length > 0 && !offline;
  const [sort, setSort] = useKept<StaySort | ''>('sort', '');
  let n = 0;
  const rows = stays.map((s, i) => ({ s, i, pin: mapPoints([s]).length ? ++n : null, price: num(s.price), rating: score10(s.rating) }));
  const shown = done && sort ? [...rows].sort((a, b) => (sort === 'price' ? (a.price ?? Infinity) - (b.price ?? Infinity) : (b.rating ?? -Infinity) - (a.rating ?? -Infinity))) : rows;
  return (
    <Card pad={false} className="overflow-hidden">
      {(str(data.location) || str(data.dates) || rows.length > 1) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-4 pt-4 pb-3 @lg:px-5">
          <div className="min-w-0">
            {str(data.location) && <h3 className="aui-h3">{str(data.location)}</h3>}
            {str(data.dates) && <div className="mt-0.5 text-[12.5px] text-fg-3">{str(data.dates)}</div>}
          </div>
          {rows.length > 1 && (
            <SortSeg
              value={sort}
              onChange={setSort}
              done={done}
              options={[
                { value: 'price', label: tr('Price') },
                { value: 'rating', label: tr('Rating') },
              ]}
            />
          )}
        </div>
      )}
      {pins && <MapBox points={points} height={240} className="rounded-none border-y border-line" />}
      <div className={cx('grid gap-3 p-4 @lg:p-5 @xl:grid-cols-2', !pins && 'border-t border-line')}>
        {shown.map(({ s, i, pin }) => (
          <StayCard key={i} s={s} pin={pins ? pin : null} cur={str(s.currency || data.currency)} />
        ))}
      </div>
    </Card>
  );
}

// ---- a world clock ----------------------------------------------------------------------------------------------------

const zoneParts = new Map<string, Intl.DateTimeFormat | null>();
const zoneClocks = new Map<string, Intl.DateTimeFormat | null>();

/** A formatter for a time zone, made once; null for a name that is not a time zone (one still being written). */
function zoneFormat(cache: Map<string, Intl.DateTimeFormat | null>, tz: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat | null {
  if (!cache.has(tz))
    try {
      cache.set(tz, make());
    } catch {
      cache.set(tz, null);
    }
  return cache.get(tz) ?? null;
}

/** A time zone's offset from UTC at a moment, in minutes; null for a name that is not a time zone. */
function offsetIn(tz: string, at: number): number | null {
  const f = zoneFormat(zoneParts, tz, () => new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }));
  if (!f) return null;
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(at)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  if (![p.year, p.month, p.day, p.hour, p.minute].every(Number.isFinite)) return null;
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute) - Math.floor(at / 60000) * 60000) / 60000);
}

/** The stretches of a day (0 to 1440 minutes) that a span, which may run past midnight either way, covers. */
function within(from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (const k of [-1440, 0, 1440]) {
    const a = Math.max(0, from + k);
    const b = Math.min(1440, to + k);
    if (b > a) out.push([a, b]);
  }
  return out;
}

/** "+5 h", "−3 h", "+5:30": how far a zone is ahead of another. */
function offsetText(d: number): string {
  if (!d) return '';
  const a = Math.abs(d);
  return `${d > 0 ? '+' : '−'}${Math.floor(a / 60)}${a % 60 ? `:${pad2(a % 60)}` : ' h'}`;
}

function WorldClock({ data, done }: { data: Data; done: boolean }) {
  const now = useNow(1000);
  const [hover, setHover] = useState<number | null>(null);
  const zones = arr(data.zones ?? data.cities ?? data.items)
    .map((z) => (isObj(z) ? z : { city: str(z) }))
    .map((z) => ({ city: str(z.city ?? z.name ?? z.label), tz: str(z.tz ?? z.timezone ?? z.zone).trim(), note: str(z.note) }))
    .filter((z) => z.city || z.tz);
  const hours = arr(data.hours);
  const h0 = Math.min(24, Math.max(0, num(hours[0]) ?? 9));
  const h1 = Math.min(24, Math.max(0, num(hours[1]) ?? 17));
  const span = ((((h1 - h0) * 60) % 1440) + 1440) % 1440 || 1440;
  const offs = zones.map((z) => (z.tz ? offsetIn(z.tz, now) : null));
  const refAt = offs.findIndex((o) => o !== null);
  const ref = refAt >= 0 ? (offs[refAt] as number) : null;
  // Each zone's working hours on the first zone's clock, and how many are at work in each quarter of an hour.
  const bands = offs.map((o) => (o === null || ref === null ? null : within(h0 * 60 - (o - ref), h0 * 60 - (o - ref) + span)));
  const valid = bands.filter(Boolean).length;
  const counts = Array.from({ length: 96 }, (_, q) => bands.filter((b) => b?.some(([a, c]) => q * 15 + 7.5 >= a && q * 15 + 7.5 < c)).length);
  const most = Math.max(0, ...counts);
  const runs: [number, number][] = [];
  if (valid > 1 && most > 1)
    counts.forEach((c, q) => {
      if (c !== most) return;
      const last = runs[runs.length - 1];
      if (last && last[1] === q * 15) last[1] = q * 15 + 15;
      else runs.push([q * 15, q * 15 + 15]);
    });
  const refNow = ref === null ? null : (((Math.floor(now / 60000) + ref) % 1440) + 1440) % 1440;
  const refCity = refAt >= 0 ? zones[refAt].city : '';
  const runsText = runs.map(([a, b]) => `${minText(a)}–${minText(b)}`).join(', ');
  const summary =
    valid < 2 ? '' : most === valid ? tr('Everyone’s working hours meet: {0} in {1}').replace('{0}', runsText).replace('{1}', refCity) : most > 1 ? tr('No time suits everyone. At most {0} of {1}: {2} in {3}').replace('{0}', String(most)).replace('{1}', String(valid)).replace('{2}', runsText).replace('{3}', refCity) : tr('No working hours meet.');
  const ticks = [0, 6, 12, 18, 24];
  const hourLabel = (h: number) => {
    try {
      return new Intl.DateTimeFormat(lang(), { hour: 'numeric' }).format(new Date(2000, 0, 1, h % 24));
    } catch {
      return String(h);
    }
  };
  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!done) return;
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(1439, Math.round((((e.clientX - r.left) / r.width) * 1440) / 15) * 15)));
  };
  const grid = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 @lg:grid-cols-[132px_minmax(0,1fr)_104px]';
  const at = (m: number) => `${(m / 1440) * 100}%`;
  return (
    <Card>
      <Head title={data.title} />
      {zones.length > 0 && (
        <div className={cx(grid, 'mb-1')} aria-hidden>
          <div className="hidden @lg:block" />
          <div className="relative col-span-2 h-4 text-[10.5px] text-fg-3 @lg:col-span-1">
            {ticks.map((h) => (
              <span key={h} className={cx('absolute top-0 whitespace-nowrap', h === 0 ? '' : h === 24 ? '-translate-x-full' : '-translate-x-1/2')} style={{ left: at(h * 60) }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>
          <div className="hidden @lg:block" />
        </div>
      )}
      {zones.map((z, i) => {
        const o = offs[i];
        const shift = o === null || ref === null ? 0 : o - ref;
        let time = '—';
        let sub = '';
        if (o !== null && hover !== null) {
          const local = hover + shift;
          time = minText(local);
          sub = local < 0 ? tr('Day before') : local >= 1440 ? tr('Day after') : '';
        } else if (o !== null) {
          time = zoneFormat(zoneClocks, `${z.tz}|${lang()}`, () => new Intl.DateTimeFormat(lang(), { hour: 'numeric', minute: '2-digit', weekday: 'short', timeZone: z.tz }))?.format(now) ?? '—';
          sub = i === refAt ? '' : offsetText(shift);
        }
        const b = bands[i];
        return (
          <div key={i} className={cx(grid, 'gap-y-1.5 border-t border-line/70 py-2')}>
            <div className="min-w-0">
              <div className="truncate leading-snug font-medium">{z.city || z.tz}</div>
              {z.note && <div className="truncate text-[12px] text-fg-3">{z.note}</div>}
            </div>
            <div className="relative order-last col-span-2 h-5 overflow-hidden rounded-md bg-bg-2 @lg:order-none @lg:col-span-1" onPointerMove={track} onPointerLeave={() => setHover(null)}>
              {b?.map(([a, c], k) => <span key={k} className="absolute inset-y-0" style={{ left: at(a), width: at(c - a), background: 'var(--viz-1)', opacity: 0.35 }} />)}
              {b &&
                runs.map(([a, c], k) => (b.some(([x, y]) => (a + c) / 2 >= x && (a + c) / 2 < y) ? <span key={`r${k}`} className="absolute inset-y-0" style={{ left: at(a), width: at(c - a), background: 'var(--viz-1)' }} /> : null))}
              {[6, 12, 18].map((h) => (
                <span key={h} className="absolute inset-y-0 w-px" style={{ left: at(h * 60), background: 'var(--panel)', opacity: 0.7 }} />
              ))}
              {refNow !== null && hover === null && <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-fg" style={{ left: at(refNow) }} />}
              {hover !== null && <span className="absolute inset-y-0 w-px -translate-x-1/2 bg-fg-2" style={{ left: at(hover) }} />}
            </div>
            <div className="text-right leading-tight">
              <div className={cx('text-[14px] font-semibold whitespace-nowrap tabular-nums', hover !== null && 'text-accent')}>{time}</div>
              {sub && <div className="text-[11.5px] whitespace-nowrap text-fg-3 tabular-nums">{sub}</div>}
            </div>
          </div>
        );
      })}
      {summary && (
        <div className="mt-2 flex items-start gap-2 rounded-lg bg-bg-1 px-3 py-2 text-[13px] text-fg-2">
          <span className="mt-[5px] inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: 'var(--viz-1)' }} />
          <span>{summary}</span>
        </div>
      )}
    </Card>
  );
}

// ---- a currency converter ---------------------------------------------------------------------------------------------

/** How many decimals a currency is written with (2, or 0 for yen). */
function currencyDigits(code: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function currencyText(n: number | null, code: string): string {
  if (n === null || !Number.isFinite(n)) return '—';
  const d = currencyDigits(code);
  try {
    return new Intl.NumberFormat(lang(), { style: 'currency', currency: code, minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
  } catch {
    return `${fmtNum(n, { maximumFractionDigits: d })} ${code}`;
  }
}

/** A currency's name in the app's language ("US dollar"); empty when it has none. */
function currencyName(code: string): string {
  try {
    return (/^[A-Z]{3}$/.test(code) && new Intl.DisplayNames([lang()], { type: 'currency' }).of(code)) || '';
  } catch {
    return '';
  }
}

function Currency({ data, done }: { data: Data; done: boolean }) {
  const from = str(data.from).trim().toUpperCase();
  const to = str(data.to).trim().toUpperCase();
  const rate = num(data.rate);
  const others = arr(data.others ?? data.rates)
    .filter(isObj)
    .map((o) => ({ code: str(o.code ?? o.currency).trim().toUpperCase(), rate: num(o.rate) ?? 0 }))
    .filter((o) => o.code && o.rate > 0 && o.code !== to && o.code !== from);
  const targets = [...(to && rate !== null && rate > 0 ? [{ code: to, rate }] : []), ...others];
  const [typed, setTyped] = useKept<string | null>('amount', null);
  const [swap, setSwap] = useKept<boolean>('swap', false);
  const [pick, setPick] = useKept<string>('to', '');
  const target = targets.find((t) => t.code === pick) ?? targets[0] ?? null;
  const base = num(data.amount) ?? 1;
  const amount = typed === null ? base : num(typed.replace(/\s/g, ''));
  const left = swap && target ? target.code : from;
  const right = swap ? from : (target?.code ?? to);
  const r = target ? (swap ? 1 / target.rate : target.rate) : null;
  const result = amount !== null && r !== null ? amount * r : null;
  const inFrom = amount === null || !target ? null : swap ? amount / target.rate : amount;
  const box = 'min-w-0 rounded-xl px-3.5 py-2.5';
  return (
    <Card>
      <div className="grid items-center gap-2 @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <label className={cx(box, 'block border border-line bg-bg-1 focus-within:border-accent')}>
          <span className="flex items-baseline justify-between gap-2 text-[12px] text-fg-3">
            <span className="font-semibold text-fg-2">{left}</span>
            <span className="truncate">{currencyName(left)}</span>
          </span>
          <input
            value={typed ?? String(base)}
            inputMode="decimal"
            disabled={!done}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={tr('Amount')}
            className="mt-0.5 block w-full min-w-0 bg-transparent text-[26px] leading-tight font-semibold text-fg tabular-nums outline-none disabled:opacity-100"
          />
        </label>
        <div className="flex justify-center">
          <button type="button" disabled={!done || !target} onClick={() => setSwap((s) => !s)} title={tr('Swap')} aria-label={tr('Swap')} className="grid h-9 w-9 place-items-center rounded-full border border-line bg-panel text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-50">
            <ArrowUpDown size={15} className="@md:rotate-90" />
          </button>
        </div>
        <div className={cx(box, 'bg-accent-soft')}>
          <div className="flex items-baseline justify-between gap-2 text-[12px] text-fg-3">
            <span className="font-semibold text-accent">{right}</span>
            <span className="truncate">{currencyName(right)}</span>
          </div>
          <div className="mt-0.5 truncate text-[26px] leading-tight font-semibold tabular-nums">{right ? currencyText(result, right) : '—'}</div>
        </div>
      </div>
      {(r !== null || str(data.as_of)) && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-fg-3 tabular-nums">
          {r !== null && left && right && (
            <>
              <span>{`1 ${left} = ${fmtNum(r, { maximumFractionDigits: 4 })} ${right}`}</span>
              <span>{`1 ${right} = ${fmtNum(1 / r, { maximumFractionDigits: 4 })} ${left}`}</span>
            </>
          )}
          {str(data.as_of) && <span>{tr('Rate of {0}').replace('{0}', fmtDate(data.as_of))}</span>}
        </div>
      )}
      {targets.length > 1 && (
        <Section title={tr('In other currencies')} className="mt-4">
          <div className="grid gap-1.5 @md:grid-cols-2">
            {targets
              .filter((t) => t.code !== target?.code)
              .map((t) => (
                <button key={t.code} type="button" disabled={!done} onClick={() => setPick(t.code)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left transition-colors hover:bg-bg-1 disabled:cursor-default">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{t.code}</span> <span className="text-[12px] text-fg-3">{currencyName(t.code)}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{currencyText(inFrom === null ? null : inFrom * t.rate, t.code)}</span>
                </button>
              ))}
          </div>
        </Section>
      )}
    </Card>
  );
}

export const TRAVEL_UIS: Record<string, AnswerUiView> = {
  places: Places,
  weather: Weather,
  place: Place,
  itinerary: Itinerary,
  directions: Directions,
  flights: Flights,
  stays: Stays,
  'world-clock': WorldClock,
  currency: Currency,
};
