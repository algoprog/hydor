// The answer UIs for science and the sky (the night sky, unit conversion, formulas): their views, by name (shared/answer-ui/science.ts has what each takes).
import type { ReactNode } from 'react';
import { ArrowLeftRight, Telescope } from 'lucide-react';
import { LOCALE } from '../../../i18n/locale';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { arr, Card, Chip, Copy, fmtDate, fmtMinutes, fmtNum, fmtTime, Head, isObj, Md, num, obj, Section, seriesColor, str, textOf, useKept, yes, type AnswerUiView, type Data } from '../kit';
import { NumBox, useBoxWidth } from './data';

// ---- the night sky ----------------------------------------------------------------------------------------------------

/** A time of the night as minutes from noon of its date: the small hours come after the evening (02:10 is 26:10). */
function nightMin(v: unknown): number | null {
  const m = /(\d{1,2}):(\d{2})/.exec(str(v));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59) return null;
  const x = h * 60 + mi;
  return x < 12 * 60 ? x + 24 * 60 : x;
}

/** Minutes of the night back to a time of day ("20:34"), as the app's language writes it. */
const clock = (x: number) => {
  const m = ((Math.round(x) % 1440) + 1440) % 1440;
  return fmtTime(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
};

/** When something is above the horizon within a..b, from its rise and set (either may be before the night starts). */
function upSpans(rise: number | null, set: number | null, a: number, b: number): [number, number][] {
  const spans: [number, number][] = rise !== null && set !== null ? (rise < set ? [[rise, set]] : [[a, set], [rise, b]]) : rise !== null ? [[rise, b]] : set !== null ? [[a, set]] : [];
  return spans.map(([x, y]): [number, number] => [Math.max(a, x), Math.min(b, y)]).filter(([x, y]) => y > x);
}

/** A stretch of time without the parts in `cuts`. */
function minus(base: [number, number], cuts: [number, number][]): [number, number][] {
  let parts: [number, number][] = [base];
  for (const [c0, c1] of cuts)
    parts = parts.flatMap(([p0, p1]): [number, number][] => (c1 <= p0 || c0 >= p1 ? [[p0, p1]] : [...(c0 > p0 ? [[p0, c0] as [number, number]] : []), ...(c1 < p1 ? [[c1, p1] as [number, number]] : [])]));
  return parts.filter(([x, y]) => y - x >= 1);
}

/** The sky's colour from day through the three twilights to night: these are colours of the sky, the same in both themes. */
const SKY: Record<string, string> = { day: '#8fbbe8', civil: '#5d86c0', nautical: '#34508a', astro: '#1d2c5a', night: '#0c1430' };
const SKY_NAME: Record<string, () => string> = { day: () => tr('Daylight'), civil: () => tr('Civil twilight'), nautical: () => tr('Nautical twilight'), astro: () => tr('Astronomical twilight'), night: () => tr('Night') };

/** The Moon as it looks: lit on the right while it waxes, on the left as it wanes (from the northern hemisphere). */
export function MoonPhase({ illumination, waxing, size = 48 }: { illumination: number; waxing: boolean; size?: number }) {
  const k = Math.max(0, Math.min(1, illumination / 100));
  const r = size / 2 - 1;
  const c = size / 2;
  const rx = r * Math.abs(1 - 2 * k);
  const lit = waxing
    ? `M${c},${c - r}A${r},${r} 0 0 1 ${c},${c + r}A${rx},${r} 0 0 ${k < 0.5 ? 0 : 1} ${c},${c - r}Z`
    : `M${c},${c - r}A${r},${r} 0 0 0 ${c},${c + r}A${rx},${r} 0 0 ${k < 0.5 ? 1 : 0} ${c},${c - r}Z`;
  return (
    <svg width={size} height={size} className="block shrink-0" aria-hidden>
      <circle cx={c} cy={c} r={r} fill="#2a2f3a" stroke="var(--line-2)" strokeWidth={1} />
      {k >= 0.995 ? <circle cx={c} cy={c} r={r} fill="#efe6c6" /> : k > 0.005 ? <path d={lit} fill="#efe6c6" /> : null}
    </svg>
  );
}

const BORTLE: Record<number, string> = {
  1: 'Excellent dark site',
  2: 'Truly dark site',
  3: 'Rural sky',
  4: 'Rural to suburban sky',
  5: 'Suburban sky',
  6: 'Bright suburban sky',
  7: 'Suburban to urban sky',
  8: 'City sky',
  9: 'Inner-city sky',
};

const hourFormat = (() => {
  try {
    return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric' });
  } catch {
    return new Intl.DateTimeFormat('en', { hour: 'numeric' });
  }
})();

/** A row of the night's timeline: a name on the left, the hours it is up as a bar, and what goes on its right. */
function SkyRow({ label, sub, spans, best, color, right, note, off, a, b, hours, offText }: { label: ReactNode; sub?: string; spans: [number, number][]; best?: number | null; color: string; right?: string; note?: string; off?: boolean; a: number; b: number; hours: number[]; offText?: string }) {
  const x = (t: number) => `${((t - a) / (b - a)) * 100}%`;
  return (
    <>
      <div className={cx('min-w-0 self-center leading-tight', off && 'opacity-60')}>
        <div className="text-[13px] font-medium">{label}</div>
        {sub && <div className="truncate text-[11.5px] text-fg-3 tabular-nums">{sub}</div>}
      </div>
      <div className="relative h-6 self-center overflow-hidden rounded-md bg-bg-1">
        {hours.map((h) => (
          <span key={h} className="absolute inset-y-0 w-px" style={{ left: x(h * 60), background: h % 24 === 0 ? 'var(--viz-axis)' : 'var(--viz-grid)' }} />
        ))}
        {off ? (
          <span className="absolute inset-0 grid place-items-center text-[11.5px] text-fg-3">{offText}</span>
        ) : (
          spans.map(([s, e], i) => <span key={i} className="absolute inset-y-[5px] rounded-full" style={{ left: x(s), width: `max(4px, calc(${x(e)} - ${x(s)}))`, background: color }} />)
        )}
        {!off && best !== null && best !== undefined && best >= a && best <= b && <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel bg-fg" style={{ left: x(best) }} title={tr('Best at {0}').replace('{0}', clock(best))} />}
      </div>
      <div className="self-center text-right text-[12px] leading-tight text-fg-2 tabular-nums">{right}</div>
      {note && <div className="col-span-2 col-start-2 -mt-0.5 text-[12px] leading-snug text-fg-3">{note}</div>}
    </>
  );
}

function Sky({ data }: { data: Data }) {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const sun = obj(data.sun);
  const moon = isObj(data.moon) ? data.moon : null;
  const t = (k: string) => nightMin(sun[k]);
  const set = t('set');
  const rise = t('rise');
  const a = (set ?? 17 * 60) - 30;
  const b = Math.max(a + 120, (rise ?? 31 * 60) + 30);
  // The sky through the night: day, the twilights, night, and back.
  const changes: [number | null, string][] = [
    [set, 'civil'],
    [t('civil_dusk'), 'nautical'],
    [t('nautical_dusk'), 'astro'],
    [t('astro_dusk'), 'night'],
    [t('astro_dawn'), 'astro'],
    [t('nautical_dawn'), 'nautical'],
    [t('civil_dawn'), 'civil'],
    [rise, 'day'],
  ];
  const skySpans: { from: number; to: number; state: string }[] = [];
  let from = a;
  let state = 'day';
  for (const [at, next] of changes) {
    if (at === null || at < from || at > b) continue;
    if (at > from) skySpans.push({ from, to: at, state });
    from = at;
    state = next;
  }
  if (b > from) skySpans.push({ from, to: b, state });
  const illum = moon ? num(moon.illumination ?? moon.illum) : null;
  const waxing = moon ? (moon.waxing === undefined ? /wax|first|young/i.test(str(moon.phase)) : yes(moon.waxing)) : true;
  const moonUp = moon ? upSpans(nightMin(moon.rise), nightMin(moon.set), a, b) : [];
  const dusk = t('astro_dusk');
  const dawn = t('astro_dawn');
  const dark = dusk !== null && dawn !== null && dawn > dusk ? minus([dusk, dawn], illum !== null && illum < 3 ? [] : moonUp) : [];
  const darkTotal = dark.reduce((m, [x, y]) => m + (y - x), 0);
  const hours: number[] = [];
  for (let h = Math.ceil(a / 60); h * 60 <= b; h++) hours.push(h);
  const every = width && width < 460 ? 3 : 2;
  const planets = arr(data.planets).filter(isObj);
  const targets = arr(data.targets).filter(isObj);
  const events = arr(data.events).filter(isObj);
  const cond = obj(data.conditions);
  const bortle = num(cond.bortle);
  const conditions = [
    [tr('Clouds'), str(cond.clouds)],
    [tr('Seeing'), str(cond.seeing)],
    [tr('Transparency'), str(cond.transparency)],
    [tr('Light pollution'), bortle !== null ? `${tr('Bortle {0}').replace('{0}', fmtNum(bortle))}${BORTLE[Math.round(bortle)] ? ` · ${tr(BORTLE[Math.round(bortle)])}` : ''}` : ''],
    [tr('Wind'), str(cond.wind)],
    [tr('Dew'), str(cond.dew)],
  ].filter(([, v]) => v);
  const timeline = set !== null || rise !== null || moonUp.length > 0 || planets.length > 0;
  return (
    <Card>
      <Head title={data.location || tr('The night sky')} sub={str(data.date) ? fmtDate(data.date, 'long') : undefined} />
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {moon && (
          <div className="flex min-w-0 items-center gap-3">
            <MoonPhase illumination={illum ?? 0} waxing={waxing} size={48} />
            <div className="min-w-0 leading-snug">
              <div className="text-[14px] font-semibold">{str(moon.phase) || tr('The Moon')}</div>
              <div className="text-[12.5px] text-fg-3 tabular-nums">
                {[illum !== null ? tr('{0} lit').replace('{0}', `${fmtNum(illum, { maximumFractionDigits: 0 })}%`) : '', str(moon.rise) ? tr('rises {0}').replace('{0}', fmtTime(moon.rise)) : '', str(moon.set) ? tr('sets {0}').replace('{0}', fmtTime(moon.set)) : ''].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
        )}
        {darkTotal > 0 && (
          <div className="min-w-0 leading-snug">
            <div className="text-[14px] font-semibold">{tr('{0} of moonless dark').replace('{0}', fmtMinutes(darkTotal))}</div>
            <div className="text-[12.5px] text-fg-3 tabular-nums">{dark.map(([x, y]) => `${clock(x)} – ${clock(y)}`).join(', ')}</div>
          </div>
        )}
        {(set !== null || rise !== null) && (
          <div className="min-w-0 leading-snug">
            <div className="text-[14px] font-semibold tabular-nums">{[set !== null ? tr('Sunset {0}').replace('{0}', clock(set)) : '', rise !== null ? tr('Sunrise {0}').replace('{0}', clock(rise)) : ''].filter(Boolean).join(' · ')}</div>
            {dusk !== null && dawn !== null && <div className="text-[12.5px] text-fg-3 tabular-nums">{tr('Fully dark {0} – {1}').replace('{0}', clock(dusk)).replace('{1}', clock(dawn))}</div>}
          </div>
        )}
      </div>
      {str(data.verdict) && (
        <div className="mt-3 flex gap-2.5 rounded-lg bg-bg-1 px-3 py-2.5 text-[13.5px]">
          <Telescope size={15} className="mt-[3px] shrink-0 text-fg-3" />
          <Md text={data.verdict} className="min-w-0" />
        </div>
      )}
      {timeline && (
        <Section title={tr('Through the night')} className="mt-4">
          <div ref={ref} className="grid grid-cols-[76px_minmax(0,1fr)_minmax(52px,auto)] gap-x-2.5 gap-y-1.5 @md:grid-cols-[100px_minmax(0,1fr)_minmax(64px,auto)]">
            <div className="self-center text-[13px] font-medium">{tr('Sky')}</div>
            <div className="relative h-6 overflow-hidden rounded-md border border-line">
              {skySpans.map((s, i) => (
                <span key={i} className="absolute inset-y-0" style={{ left: `${((s.from - a) / (b - a)) * 100}%`, width: `${((s.to - s.from) / (b - a)) * 100}%`, background: SKY[s.state] }} title={`${SKY_NAME[s.state]?.() ?? ''}: ${clock(s.from)} – ${clock(s.to)}`} />
              ))}
            </div>
            <div />
            {darkTotal > 0 && <SkyRow label={tr('Moonless dark')} spans={dark} color="var(--ok)" right={fmtMinutes(darkTotal)} a={a} b={b} hours={hours} />}
            {moon && (
              <SkyRow
                label={
                  <span className="inline-flex items-center gap-1.5">
                    <MoonPhase illumination={illum ?? 0} waxing={waxing} size={14} />
                    {tr('Moon')}
                  </span>
                }
                spans={moonUp}
                color="var(--viz-4)"
                right={illum !== null ? `${fmtNum(illum, { maximumFractionDigits: 0 })}%` : ''}
                off={!moonUp.length && (str(moon.rise) !== '' || str(moon.set) !== '')}
                offText={tr('Down all night')}
                a={a}
                b={b}
                hours={hours}
              />
            )}
            {planets.map((p, i) => {
              const off = p.visible === false || str(p.visible).toLowerCase() === 'false';
              const best = nightMin(p.best);
              const mag = num(p.magnitude ?? p.mag);
              return (
                <SkyRow
                  key={i}
                  label={textOf(p, 'name')}
                  sub={mag !== null ? tr('mag {0}').replace('{0}', `${mag < 0 ? '−' : ''}${fmtNum(Math.abs(mag), { maximumFractionDigits: 1 })}`) : undefined}
                  spans={upSpans(nightMin(p.rise), nightMin(p.set), a, b)}
                  best={best}
                  color={seriesColor(0)}
                  right={[best !== null ? clock(best) : str(p.best), str(p.direction)].filter(Boolean).join(' ')}
                  note={str(p.note)}
                  off={off}
                  offText={tr('Not visible')}
                  a={a}
                  b={b}
                  hours={hours}
                />
              );
            })}
            <div />
            <div className="relative h-4">
              {hours.map((h) =>
                h % every === 0 ? (
                  <span key={h} className="absolute -translate-x-1/2 text-[11px] whitespace-nowrap text-fg-3 tabular-nums" style={{ left: `${((h * 60 - a) / (b - a)) * 100}%` }}>
                    {hourFormat.format(new Date(2000, 0, 1, h % 24))}
                  </span>
                ) : null,
              )}
            </div>
            <div />
          </div>
        </Section>
      )}
      {targets.length > 0 && (
        <Section title={tr('What to point at')} className="mt-5">
          <ul className="m-0 grid list-none gap-x-6 gap-y-2.5 p-0 @xl:grid-cols-2">
            {targets.map((g, i) => {
              const best = nightMin(g.best);
              const mag = num(g.magnitude ?? g.mag);
              return (
                <li key={i} className="min-w-0 text-[13px] leading-snug">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{textOf(g, 'name')}</span>
                    {str(g.kind) && <span className="text-[12px] text-fg-3">{str(g.kind)}</span>}
                  </div>
                  <div className="text-[12px] text-fg-3 tabular-nums">{[best !== null ? tr('best {0}').replace('{0}', clock(best)) : str(g.best), mag !== null ? tr('mag {0}').replace('{0}', fmtNum(mag, { maximumFractionDigits: 1 })) : ''].filter(Boolean).join(' · ')}</div>
                  {str(g.note) && <div className="text-[12.5px] text-fg-2">{str(g.note)}</div>}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {events.length > 0 && (
        <Section title={tr('Events')} className="mt-5">
          <ul className="m-0 list-none space-y-2 p-0">
            {events.map((e, i) => (
              <li key={i} className="flex gap-3 text-[13px] leading-snug">
                <span className="w-[4.5rem] shrink-0 pt-px text-[12.5px] text-fg-3 tabular-nums">{str(e.time) ? fmtTime(e.time) : ''}</span>
                <div className="min-w-0">
                  <div className="font-medium">{textOf(e, 'title', 'name')}</div>
                  {str(e.note) && <Md text={e.note} className="text-[12.5px] text-fg-2" />}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {conditions.length > 0 && (
        <Section title={tr('Conditions')} className="mt-5">
          <div className="grid grid-cols-2 gap-2 @xl:grid-cols-3">
            {conditions.map(([label, value], i) => (
              <div key={i} className="min-w-0 rounded-lg bg-bg-1 px-3 py-2">
                <div className="text-[11.5px] text-fg-3">{label}</div>
                <div className="text-[13px] leading-snug font-medium">{value}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Card>
  );
}

// ---- a unit converter -------------------------------------------------------------------------------------------------

interface Unit {
  sym: string;
  name: string;
  f: number;
  alias: string[];
}
const u = (sym: string, name: string, f: number, ...alias: string[]): Unit => ({ sym, name, f, alias });

/** Each quantity's units, by how many of its base unit each is (temperature converts by formula), and the ones to list. */
const QUANTITIES: Record<string, { name: string; units: Unit[]; show: string[] }> = {
  length: {
    name: 'Length',
    units: [
      u('nm', 'Nanometres', 1e-9, 'nanometer', 'nanometers', 'nanometre'),
      u('µm', 'Micrometres', 1e-6, 'um', 'μm', 'micron', 'microns', 'micrometer', 'micrometers', 'micrometre'),
      u('mm', 'Millimetres', 1e-3, 'millimeter', 'millimeters', 'millimetre'),
      u('cm', 'Centimetres', 1e-2, 'centimeter', 'centimeters', 'centimetre'),
      u('m', 'Metres', 1, 'meter', 'meters', 'metre'),
      u('km', 'Kilometres', 1e3, 'kilometer', 'kilometers', 'kilometre', 'kms'),
      u('in', 'Inches', 0.0254, 'inch', '″', '"'),
      u('ft', 'Feet', 0.3048, 'foot', '′', "'"),
      u('yd', 'Yards', 0.9144, 'yard'),
      u('mi', 'Miles', 1609.344, 'mile'),
      u('nmi', 'Nautical miles', 1852, 'nautical mile', 'NM'),
      u('au', 'Astronomical units', 149_597_870_700, 'AU', 'astronomical unit'),
      u('ly', 'Light years', 9_460_730_472_580_800, 'light year', 'light-year', 'light-years'),
      u('pc', 'Parsecs', 3.0856775814913673e16, 'parsec'),
    ],
    show: ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'],
  },
  mass: {
    name: 'Mass',
    units: [
      u('mg', 'Milligrams', 1e-6, 'milligram'),
      u('g', 'Grams', 1e-3, 'gram', 'gr'),
      u('kg', 'Kilograms', 1, 'kilogram', 'kilo', 'kilos', 'kgs'),
      u('t', 'Tonnes', 1000, 'tonne', 'metric ton', 'metric tons'),
      u('oz', 'Ounces', 0.028349523125, 'ounce'),
      u('lb', 'Pounds', 0.45359237, 'pound', 'lbs'),
      u('st', 'Stone', 6.35029318, 'stones'),
      u('ton', 'Short tons (US)', 907.18474, 'short ton', 'tons', 'US ton'),
    ],
    show: ['g', 'kg', 'oz', 'lb', 'st'],
  },
  temperature: {
    name: 'Temperature',
    units: [u('°C', 'Celsius', 1, 'C', 'celsius', 'centigrade', 'degC'), u('°F', 'Fahrenheit', 1, 'F', 'fahrenheit', 'degF'), u('K', 'Kelvin', 1, 'kelvin', 'k')],
    show: ['°C', '°F', 'K'],
  },
  volume: {
    name: 'Volume',
    units: [
      u('ml', 'Millilitres', 1e-3, 'mL', 'milliliter', 'milliliters', 'millilitre', 'cm³', 'cc'),
      u('cl', 'Centilitres', 1e-2, 'cL', 'centiliter', 'centilitre'),
      u('l', 'Litres', 1, 'L', 'liter', 'liters', 'litre'),
      u('m³', 'Cubic metres', 1000, 'm3', 'cubic meter', 'cubic meters', 'cubic metre'),
      u('tsp', 'Teaspoons', 0.00492892159375, 'teaspoon'),
      u('tbsp', 'Tablespoons', 0.01478676478125, 'tablespoon'),
      u('floz', 'Fluid ounces (US)', 0.0295735295625, 'fl oz', 'fl. oz', 'fluid ounce', 'fluid ounces'),
      u('cup', 'Cups (US)', 0.2365882365, 'cups'),
      u('pt', 'Pints (US)', 0.473176473, 'pint', 'pints'),
      u('qt', 'Quarts (US)', 0.946352946, 'quart', 'quarts'),
      u('gal', 'Gallons (US)', 3.785411784, 'gallon', 'gallons', 'US gal'),
      u('imp gal', 'Gallons (UK)', 4.54609, 'imperial gallon', 'UK gallon'),
    ],
    show: ['ml', 'l', 'tsp', 'tbsp', 'floz', 'cup', 'pt', 'gal'],
  },
  speed: {
    name: 'Speed',
    units: [u('m/s', 'Metres a second', 1, 'mps'), u('km/h', 'Kilometres an hour', 1 / 3.6, 'kph', 'kmh', 'km/hr'), u('mph', 'Miles an hour', 0.44704, 'mi/h', 'miles per hour'), u('kn', 'Knots', 1852 / 3600, 'kt', 'knot', 'kts'), u('ft/s', 'Feet a second', 0.3048, 'fps')],
    show: ['m/s', 'km/h', 'mph', 'kn', 'ft/s'],
  },
  area: {
    name: 'Area',
    units: [
      u('mm²', 'Square millimetres', 1e-6, 'mm2'),
      u('cm²', 'Square centimetres', 1e-4, 'cm2'),
      u('m²', 'Square metres', 1, 'm2', 'sq m', 'square meter', 'square meters'),
      u('ha', 'Hectares', 1e4, 'hectare'),
      u('km²', 'Square kilometres', 1e6, 'km2', 'sq km'),
      u('in²', 'Square inches', 0.00064516, 'in2', 'sq in'),
      u('ft²', 'Square feet', 0.09290304, 'ft2', 'sq ft', 'sqft', 'square foot', 'square feet'),
      u('yd²', 'Square yards', 0.83612736, 'yd2', 'sq yd'),
      u('ac', 'Acres', 4046.8564224, 'acre', 'acres'),
      u('mi²', 'Square miles', 2_589_988.110336, 'mi2', 'sq mi'),
    ],
    show: ['m²', 'ha', 'km²', 'ft²', 'ac', 'mi²'],
  },
  data: {
    name: 'Data',
    units: [
      u('bit', 'Bits', 0.125, 'b', 'bits'),
      u('B', 'Bytes', 1, 'byte', 'bytes'),
      u('kB', 'Kilobytes', 1e3, 'KB', 'kilobyte', 'kilobytes'),
      u('MB', 'Megabytes', 1e6, 'megabyte', 'megabytes'),
      u('GB', 'Gigabytes', 1e9, 'gigabyte', 'gigabytes'),
      u('TB', 'Terabytes', 1e12, 'terabyte', 'terabytes'),
      u('PB', 'Petabytes', 1e15, 'petabyte', 'petabytes'),
      u('KiB', 'Kibibytes', 1024, 'kibibyte'),
      u('MiB', 'Mebibytes', 1024 ** 2, 'mebibyte'),
      u('GiB', 'Gibibytes', 1024 ** 3, 'gibibyte'),
      u('TiB', 'Tebibytes', 1024 ** 4, 'tebibyte'),
      u('Mbit', 'Megabits', 125_000, 'Mb', 'megabit', 'megabits'),
      u('Gbit', 'Gigabits', 1.25e8, 'Gb', 'gigabit', 'gigabits'),
    ],
    show: ['B', 'kB', 'MB', 'GB', 'MiB', 'GiB'],
  },
  time: {
    name: 'Time',
    units: [
      u('ns', 'Nanoseconds', 1e-9, 'nanosecond'),
      u('µs', 'Microseconds', 1e-6, 'us', 'μs', 'microsecond'),
      u('ms', 'Milliseconds', 1e-3, 'millisecond'),
      u('s', 'Seconds', 1, 'sec', 'secs', 'second'),
      u('min', 'Minutes', 60, 'mins', 'minute'),
      u('h', 'Hours', 3600, 'hr', 'hrs', 'hour'),
      u('d', 'Days', 86_400, 'day'),
      u('wk', 'Weeks', 604_800, 'week', 'w'),
      u('mo', 'Months', 2_629_746, 'month'),
      u('yr', 'Years', 31_556_952, 'year', 'y'),
    ],
    show: ['s', 'min', 'h', 'd', 'wk', 'yr'],
  },
  energy: {
    name: 'Energy',
    units: [
      u('J', 'Joules', 1, 'joule'),
      u('kJ', 'Kilojoules', 1e3, 'kilojoule'),
      u('MJ', 'Megajoules', 1e6, 'megajoule'),
      u('cal', 'Calories', 4.184, 'calorie'),
      u('kcal', 'Kilocalories', 4184, 'Cal', 'kilocalorie', 'food calorie'),
      u('Wh', 'Watt-hours', 3600, 'watt-hour', 'watt hour'),
      u('kWh', 'Kilowatt-hours', 3.6e6, 'kilowatt-hour', 'kilowatt hour'),
      u('BTU', 'British thermal units', 1055.05585262, 'Btu', 'btu'),
      u('eV', 'Electronvolts', 1.602176634e-19, 'electronvolt'),
    ],
    show: ['J', 'kJ', 'cal', 'kcal', 'Wh', 'kWh'],
  },
  pressure: {
    name: 'Pressure',
    units: [
      u('Pa', 'Pascals', 1, 'pascal'),
      u('hPa', 'Hectopascals', 100, 'hectopascal'),
      u('kPa', 'Kilopascals', 1000, 'kilopascal'),
      u('MPa', 'Megapascals', 1e6, 'megapascal'),
      u('bar', 'Bar', 1e5, 'bars'),
      u('mbar', 'Millibar', 100, 'mb', 'millibars'),
      u('atm', 'Atmospheres', 101_325, 'atmosphere'),
      u('psi', 'Pounds per square inch', 6894.757293168, 'PSI', 'lbf/in²'),
      u('mmHg', 'Millimetres of mercury', 133.322387415, 'torr', 'Torr'),
      u('inHg', 'Inches of mercury', 3386.389),
    ],
    show: ['Pa', 'hPa', 'kPa', 'bar', 'atm', 'psi'],
  },
};

/** A unit of a quantity by its symbol, one of its other names, or its name (in any case). */
function findUnit(q: string, s: string): Unit | undefined {
  const units = QUANTITIES[q]?.units ?? [];
  const t = s.trim();
  if (!t) return undefined;
  const low = t.toLowerCase();
  return units.find((x) => x.sym === t) ?? units.find((x) => x.alias.includes(t)) ?? units.find((x) => [x.sym, x.name, ...x.alias].some((n) => n.toLowerCase() === low || `${n.toLowerCase()}s` === low));
}

const TO_C: Record<string, (v: number) => number> = { '°C': (v) => v, '°F': (v) => ((v - 32) * 5) / 9, K: (v) => v - 273.15 };
const FROM_C: Record<string, (c: number) => number> = { '°C': (c) => c, '°F': (c) => (c * 9) / 5 + 32, K: (c) => c + 273.15 };
const TEMP_RULE: Record<string, string> = {
  '°C>°F': '°F = °C × 9/5 + 32',
  '°F>°C': '°C = (°F − 32) × 5/9',
  '°C>K': 'K = °C + 273.15',
  'K>°C': '°C = K − 273.15',
  '°F>K': 'K = (°F − 32) × 5/9 + 273.15',
  'K>°F': '°F = (K − 273.15) × 9/5 + 32',
};

function convert(q: string, v: number, from: Unit, to: Unit): number {
  return q === 'temperature' ? FROM_C[to.sym](TO_C[from.sym](v)) : (v * from.f) / to.f;
}

/** A converted value: six significant digits, very large or small ones in scientific notation. */
function unitNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e12 || a < 1e-5)) return fmtNum(v, { notation: 'scientific', maximumSignificantDigits: 4 });
  return fmtNum(v, { maximumSignificantDigits: 6 });
}

function UnitBox({ value, unit, units, onValue, onUnit, disabled }: { value: number; unit: Unit; units: Unit[]; onValue: (v: number) => void; onUnit: (sym: string) => void; disabled: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-bg-1 px-3 pt-2 pb-1.5 focus-within:border-accent">
      <NumBox value={value} onChange={onValue} disabled={disabled} label={tr(unit.name)} write={(v) => (Number.isFinite(v) ? String(Number(v.toPrecision(6))) : '')} bare className="w-full text-[22px]" />
      <select value={unit.sym} disabled={disabled} onChange={(e) => onUnit(e.target.value)} aria-label={tr('Unit')} className="mt-0.5 w-full min-w-0 cursor-pointer truncate bg-transparent text-[13px] text-fg-2 outline-none disabled:cursor-default">
        {units.map((x) => (
          <option key={x.sym} value={x.sym}>
            {`${tr(x.name)} (${x.sym})`}
          </option>
        ))}
      </select>
    </div>
  );
}

function UnitConverter({ data, done }: { data: Data; done: boolean }) {
  const [kept, setKept] = useKept<{ v?: number; from?: string; to?: string }>('convert', {});
  const given = str(data.quantity).toLowerCase().trim();
  const q = QUANTITIES[given] ? given : (Object.keys(QUANTITIES).find((k) => findUnit(k, str(data.from))) ?? '');
  const Q = QUANTITIES[q];
  if (!Q) return <Card>{str(data.from) || str(data.to) ? <Head title={`${str(data.from)} → ${str(data.to)}`} /> : null}</Card>;
  const from = findUnit(q, kept.from ?? str(data.from)) ?? Q.units[0];
  const to = findUnit(q, kept.to ?? str(data.to)) ?? Q.units.find((x) => x !== from) ?? Q.units[0];
  const value = kept.v ?? num(data.value) ?? 1;
  const result = convert(q, value, from, to);
  const set = (x: { v?: number; from?: string; to?: string }) => done && setKept((k) => ({ ...k, ...x }));
  const listed = (arr(data.show).length ? arr(data.show).map((s) => str(s)) : Q.show)
    .map((s) => findUnit(q, s))
    .filter((x, i, all): x is Unit => !!x && x !== from && x !== to && all.indexOf(x) === i);
  const rule = q === 'temperature' ? (TEMP_RULE[`${from.sym}>${to.sym}`] ?? '') : from !== to ? `1 ${from.sym} = ${unitNum(from.f / to.f)} ${to.sym}` : '';
  return (
    <Card>
      <Head kicker={tr(Q.name)} title={`${unitNum(value)} ${from.sym} = ${unitNum(result)} ${to.sym}`} aside={done ? <Copy text={`${unitNum(result)} ${to.sym}`} label={tr('Copy the result')} /> : undefined} />
      <div className="grid items-center gap-2 @md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <UnitBox value={value} unit={from} units={Q.units} onValue={(v) => set({ v })} onUnit={(sym) => set({ from: sym })} disabled={!done} />
        <button type="button" disabled={!done} onClick={() => set({ from: to.sym, to: from.sym, v: result })} title={tr('Swap the units')} aria-label={tr('Swap the units')} className="grid h-8 w-8 place-items-center justify-self-center rounded-full border border-line bg-panel text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg disabled:opacity-50">
          <ArrowLeftRight size={14} />
        </button>
        <UnitBox value={result} unit={to} units={Q.units} onValue={(v) => set({ v: convert(q, v, to, from) })} onUnit={(sym) => set({ to: sym })} disabled={!done} />
      </div>
      {rule && <div className="mt-2 text-[12px] text-fg-3 tabular-nums">{rule}</div>}
      {listed.length > 0 && (
        <ul className="m-0 mt-3 grid list-none gap-x-6 p-0 @md:grid-cols-2">
          {listed.map((x) => (
            <li key={x.sym} className="min-w-0">
              <button type="button" disabled={!done} onClick={() => set({ to: x.sym })} className="flex w-full items-baseline justify-between gap-3 border-b border-line/70 py-1.5 text-left text-[13.5px] transition-colors enabled:hover:bg-bg-1">
                <span className="min-w-0 truncate text-fg-3">{tr(x.name)}</span>
                <span className="shrink-0 font-medium tabular-nums">
                  {unitNum(convert(q, value, from, x))} <span className="font-normal text-fg-3">{x.sym}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---- a formula ----------------------------------------------------------------------------------------------------------

function Formula({ data, done }: { data: Data; done: boolean }) {
  const tex = str(data.tex ?? data.latex)
    .trim()
    .replace(/^\$+|\$+$/g, '');
  const vars = arr(data.variables ?? data.symbols).filter(isObj);
  return (
    <Card>
      <Head kicker={data.field} title={data.name ?? data.title} aside={done && tex ? <Copy text={tex} label={tr('Copy LaTeX')} /> : undefined} />
      {tex && <div className="overflow-x-auto rounded-xl bg-bg-1 px-4 py-3.5 text-center text-[13px] @md:text-[15px]">{done ? <Md text={`$$\n${tex}\n$$`} /> : <code className="block truncate text-left font-mono text-[12.5px] text-fg-3">{tex}</code>}</div>}
      {vars.length > 0 && (
        <Section title={tr('Where')} className="mt-4">
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-2">
            {vars.map((v, i) => {
              const sym = str(v.symbol ?? v.name)
                .trim()
                .replace(/^\$+|\$+$/g, '');
              return (
                <div key={i} className="contents">
                  <dt className="text-[14.5px] whitespace-nowrap">{sym && (done ? <Md text={`$${sym}$`} inline /> : <code className="font-mono text-[12.5px]">{sym}</code>)}</dt>
                  <dd className="m-0 min-w-0 text-[13.5px] text-fg-2">
                    <Md text={v.meaning ?? v.text} inline />
                    {str(v.unit) && <Chip className="ml-2 align-[1px]">{str(v.unit)}</Chip>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
      )}
      {str(data.explanation) && <Md text={data.explanation} className="mt-4 text-[13.5px] text-fg-2" />}
      {str(data.example) && (
        <div className="mt-4 rounded-xl border border-line px-3.5 py-3">
          <div className="mb-1 aui-h4">{tr('Example')}</div>
          <Md text={data.example} className="text-[13.5px]" />
        </div>
      )}
    </Card>
  );
}

export const SCIENCE_UIS: Record<string, AnswerUiView> = {
  sky: Sky,
  'unit-converter': UnitConverter,
  formula: Formula,
};
