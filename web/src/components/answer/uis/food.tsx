// The answer UIs for food and fitness: their views, by name (shared/answer-ui/food.ts has what each takes).
import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Minus, Pause, Play, Plus, RotateCcw, SkipForward, Timer, X } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { toast } from '../../../lib/store';
import { cx } from '../../ui';
import { PieChart } from '../charts';
import { arr, Btn, Card, Chip, Copy, fmtDate, fmtNum, Head, isObj, LinkOut, Md, Meter, num, Pic, Section, Seg, str, textOf, useAui, useKept, Video, withUnit, words, yes, type AnswerUiView, type Data } from '../kit';

/** Fractions a recipe writes as glyphs. */
const FRACTIONS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [1 / 2, '½'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

/** An amount as a cook reads it: 1½, ¼, 2, 800 (no 0.333). */
export function amountText(n: number): string {
  if (n >= 20) return fmtNum(Math.round(n));
  if (n >= 10) return fmtNum(Math.round(n * 2) / 2);
  const whole = Math.floor(n);
  const part = n - whole;
  if (part < 0.06) return fmtNum(whole || n, { maximumFractionDigits: 2 });
  if (part > 0.94) return fmtNum(whole + 1);
  const f = FRACTIONS.find(([v]) => Math.abs(v - part) < 0.04);
  if (f) return `${whole || ''}${f[1]}`;
  return fmtNum(n, { maximumFractionDigits: 1 });
}

/** A step's countdown: start, pause, start over; it says so when it runs out. */
function StepTimer({ minutes, label }: { minutes: number; label: string }) {
  const total = Math.round(minutes * 60);
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const end = useRef(0);
  useEffect(() => {
    if (!running) return;
    end.current = Date.now() + left * 1000;
    const t = setInterval(() => {
      const s = Math.max(0, Math.round((end.current - Date.now()) / 1000));
      setLeft(s);
      if (!s) {
        setRunning(false);
        toast(`${tr('Time is up')}: ${label}`, 'info');
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const mm = Math.floor(left / 60);
  const ss = String(left % 60).padStart(2, '0');
  const fresh = left === total && !running;
  return (
    <span className={cx('mt-1.5 inline-flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2 text-[12px] font-medium tabular-nums', !left ? 'border-ok/40 bg-ok/10 text-ok' : running ? 'border-accent/40 bg-accent-soft text-accent' : 'border-line text-fg-2')}>
      <Timer size={12} />
      {fresh ? `${fmtNum(minutes)} min` : `${mm}:${ss}`}
      <button type="button" onClick={() => (left ? setRunning((r) => !r) : (setLeft(total), setRunning(true)))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-bg-3" aria-label={running ? tr('Pause') : tr('Start the timer')}>
        {running ? <Pause size={11} fill="currentColor" /> : <Play size={11} fill="currentColor" />}
      </button>
      {!fresh && (
        <button type="button" onClick={() => (setRunning(false), setLeft(total))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-bg-3" aria-label={tr('Start over')}>
          <RotateCcw size={11} />
        </button>
      )}
    </span>
  );
}

function Recipe({ data, done }: { data: Data; done: boolean }) {
  const base = num(data.servings);
  const [servings, setServings] = useKept<number | null>('servings', null);
  const now = servings ?? base;
  const factor = base && now ? now / base : 1;
  const [have, setHave] = useKept<Record<string, boolean>>('have', {});
  const [steps, setSteps] = useKept<Record<number, boolean>>('steps', {});
  const { offline } = useAui();
  const time = isObj(data.time) ? data.time : {};
  const groups: { name: string; items: Data[] }[] = [];
  for (const x of arr(data.ingredients)) {
    if (isObj(x) && Array.isArray(x.items)) groups.push({ name: str(x.group ?? x.name), items: arr(x.items).map((i) => (isObj(i) ? i : { item: str(i) })) });
    else {
      const it = isObj(x) ? x : { item: str(x) };
      if (!groups.length || groups[groups.length - 1].name) groups.push({ name: '', items: [] });
      groups[groups.length - 1].items.push(it);
    }
  }
  const nutrition = isObj(data.nutrition) ? data.nutrition : {};
  const facts = (
    [
      ['calories', tr('Calories')],
      ['protein', tr('Protein')],
      ['carbs', tr('Carbs')],
      ['fat', tr('Fat')],
      ['fiber', tr('Fibre')],
    ] as const
  ).filter(([k]) => str(nutrition[k]));
  const times = (
    [
      ['prep', tr('Prep')],
      ['cook', tr('Cook')],
      ['total', tr('Total')],
    ] as const
  ).filter(([k]) => str(time[k]));
  const stepList = arr(data.steps);
  const doneSteps = stepList.filter((_, i) => steps[i]).length;
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.image) && !offline && <Pic src={data.image} alt={str(data.title)} className="aspect-[16/7] max-h-[300px] w-full rounded-none" />}
      <div className="p-4 @lg:p-5">
        <h3 className="aui-h3 text-[19px]">{str(data.title)}</h3>
        {str(data.description) && <Md text={data.description} className="mt-1 text-[13.5px] text-fg-2" />}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-fg-2">
          {times.map(([k, label]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <Clock size={13} className="text-fg-3" />
              <span className="text-fg-3">{label}</span>
              <span className="font-medium">{str(time[k])}</span>
            </span>
          ))}
          {str(data.difficulty) && <Chip>{({ easy: tr('Easy'), medium: tr('Medium'), hard: tr('Hard') } as Record<string, string>)[str(data.difficulty).toLowerCase()] ?? str(data.difficulty)}</Chip>}
          {words(data.tags).map((t, i) => (
            <Chip key={i}>{t}</Chip>
          ))}
        </div>
        <div className="mt-4 grid gap-6 @xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Section
            title={tr('Ingredients')}
            aside={
              base ? (
                <span className="inline-flex items-center gap-1 rounded-lg bg-bg-2 p-0.5 text-[12px]">
                  <button type="button" onClick={() => setServings(Math.max(1, (now ?? 1) - 1))} className="grid h-6 w-6 place-items-center rounded-md text-fg-2 hover:bg-panel" aria-label={tr('Fewer servings')}>
                    <Minus size={12} />
                  </button>
                  <span className="min-w-[72px] text-center font-medium tabular-nums">{tr('{0} servings').replace('{0}', fmtNum(now))}</span>
                  <button type="button" onClick={() => setServings((now ?? 1) + 1)} className="grid h-6 w-6 place-items-center rounded-md text-fg-2 hover:bg-panel" aria-label={tr('More servings')}>
                    <Plus size={12} />
                  </button>
                </span>
              ) : undefined
            }
          >
            <div className="space-y-3">
              {groups.map((g, gi) => (
                <div key={gi}>
                  {g.name && <div className="mb-1 text-[12px] font-semibold text-fg-3">{g.name}</div>}
                  <ul className="m-0 list-none space-y-0.5 p-0">
                    {g.items.map((it, ii) => {
                      const key = `${gi}:${ii}`;
                      const amount = num(it.amount);
                      const got = !!have[key];
                      return (
                        <li key={ii}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1 text-[13.5px] hover:bg-bg-1">
                            <input type="checkbox" checked={got} disabled={!done} onChange={() => setHave((h) => ({ ...h, [key]: !got }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                            <span className={cx('min-w-0', got && 'text-fg-3 line-through decoration-line-2')}>
                              {(amount !== null || str(it.unit)) && (
                                <span className="font-semibold tabular-nums">
                                  {amount !== null ? amountText(amount * factor) : ''}
                                  {str(it.unit) ? ` ${str(it.unit)}` : ''}{' '}
                                </span>
                              )}
                              {str(amount === null && !str(it.unit) && typeof it.amount === 'string' ? `${it.amount} ` : '')}
                              {textOf(it, 'item', 'name', 'text')}
                              {str(it.note) && <span className="text-fg-3">, {str(it.note)}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
          <Section title={tr('Steps')} aside={stepList.length > 1 && doneSteps > 0 ? <span className="text-[12px] text-fg-3 tabular-nums">{`${doneSteps} / ${stepList.length}`}</span> : undefined}>
            <ol className="m-0 list-none space-y-3 p-0">
              {stepList.map((s, i) => {
                const text = textOf(s, 'text', 'step', 'title');
                const timer = isObj(s) ? num(s.timer) : null;
                const finished = !!steps[i];
                return (
                  <li key={i} className="flex gap-3">
                    <button
                      type="button"
                      disabled={!done}
                      onClick={() => setSteps((x) => ({ ...x, [i]: !finished }))}
                      className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors', finished ? 'bg-ok text-white' : 'bg-bg-2 text-fg-2 hover:bg-bg-3')}
                      aria-label={finished ? tr('Not done yet') : tr('Done')}
                    >
                      {finished ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </button>
                    <div className={cx('min-w-0 pt-0.5 text-[13.5px] leading-relaxed', finished && 'text-fg-3')}>
                      <Md text={text} inline />
                      {isObj(s) && str(s.image) && <Pic src={s.image} className="mt-2 aspect-video w-full max-w-sm rounded-lg" />}
                      {timer !== null && timer > 0 && done && (
                        <div>
                          <StepTimer minutes={timer} label={`${tr('Step {0}').replace('{0}', String(i + 1))}`} />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Section>
        </div>
        {arr(data.tips).length > 0 && (
          <Section title={tr('Tips')} className="mt-5">
            <ul className="m-0 list-disc space-y-1 pl-5 text-[13.5px] text-fg-2">
              {arr(data.tips).map((t, i) => (
                <li key={i}>
                  <Md text={textOf(t)} inline />
                </li>
              ))}
            </ul>
          </Section>
        )}
        {facts.length > 0 && (
          <Section title={tr('Nutrition per serving')} className="mt-5">
            <div className="flex flex-wrap gap-2">
              {facts.map(([k, label]) => (
                <div key={k} className="min-w-[78px] rounded-lg bg-bg-1 px-3 py-2">
                  <div className="text-[15px] font-semibold">{k === 'calories' ? fmtNum(num(nutrition[k])) || str(nutrition[k]) : str(nutrition[k])}</div>
                  <div className="text-[11.5px] text-fg-3">{label}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
        {isObj(data.source) && str(data.source.name) && (
          <div className="mt-4 text-[12px] text-fg-3">
            {tr('Source')}:{' '}
            {str(data.source.url) ? (
              <LinkOut url={data.source.url} className="text-[12px]">
                {str(data.source.name)}
              </LinkOut>
            ) : (
              str(data.source.name)
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- a nutrition facts label --------------------------------------------------------------------------------------------

/** Vitamins and minerals: the part of a label under its last thick rule. */
const MICRO = /^(vitamin|calcium|iron|potassium|magnesium|zinc|folate|folic|niacin|riboflavin|thiamin|phosph|iodine|selenium|copper|manganese|biotin|choline|pantothenic)/i;

function Nutrition({ data }: { data: Data }) {
  const rows = arr(data.nutrients ?? data.items)
    .filter(isObj)
    .map((n) => ({ name: str(n.name ?? n.label), amount: n.amount ?? n.value, unit: str(n.unit), dv: num(n.dv ?? n.daily_value ?? n.percent), indent: yes(n.indent) || yes(n.sub) }))
    .filter((r) => r.name);
  const kcal = num(data.calories ?? data.kcal);
  const micro = rows.findIndex((r) => MICRO.test(r.name));
  /** The grams of a main nutrient (not of a part of one). */
  const grams = (re: RegExp) => {
    const r = rows.find((x) => !x.indent && re.test(x.name));
    const v = r ? num(r.amount) : null;
    return r && v !== null && (!r.unit || /^g$/i.test(r.unit.trim())) ? v : null;
  };
  const fat = grams(/fat|lipid/i);
  const carbs = grams(/carb/i);
  const protein = grams(/protein/i);
  const macros = fat !== null && carbs !== null && protein !== null && fat * 9 + carbs * 4 + protein * 4 > 0;
  const dv = rows.some((r) => r.dv !== null);
  const amount = (r: (typeof rows)[number]) => {
    const n = num(r.amount);
    return n !== null ? withUnit(n, r.unit, '', { maximumFractionDigits: 1 }) : `${str(r.amount)}${r.unit ? ` ${r.unit}` : ''}`;
  };
  const ink = 'border-fg/85';
  return (
    <Card>
      <div className={cx('grid gap-6', macros && '@xl:grid-cols-[minmax(0,330px)_minmax(0,1fr)] @xl:items-start')}>
        <div className={cx('w-full max-w-[360px] rounded-lg border-2 px-3 pt-2 pb-2.5', ink)}>
          <div className="text-[25px] leading-none font-extrabold tracking-tight">{tr('Nutrition Facts')}</div>
          {str(data.name) && <div className="mt-1.5 text-[13.5px] font-medium">{str(data.name)}</div>}
          {str(data.serving) && (
            <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[13.5px] font-semibold">
              <span>{tr('Serving size')}</span>
              <span className="text-right">{str(data.serving)}</span>
            </div>
          )}
          {(kcal !== null || str(data.calories)) && (
            <div className={cx('mt-1 border-t-[9px] pt-1', ink)}>
              <div className="text-[11.5px] font-semibold">{tr('Amount per serving')}</div>
              <div className="flex items-end justify-between gap-3">
                <span className="text-[22px] leading-tight font-extrabold">{tr('Calories')}</span>
                <span className="text-[32px] leading-none font-extrabold tabular-nums">{kcal !== null ? fmtNum(kcal) : str(data.calories)}</span>
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <div className={cx('mt-1 border-t-[5px]', ink)}>
              {dv && <div className="border-b border-line py-0.5 text-right text-[11.5px] font-semibold">{tr('% Daily Value*')}</div>}
              {rows.map((r, i) => (
                <div key={i} className={cx('flex items-baseline justify-between gap-3 py-[3px] text-[13px]', r.indent && 'pl-4', i === micro && i > 0 && 'border-t-[9px] border-t-fg/85', i < rows.length - 1 && i + 1 !== micro && 'border-b border-line')}>
                  <span className="min-w-0">
                    <span className={r.indent ? '' : 'font-semibold'}>{r.name}</span> <span className="tabular-nums">{amount(r)}</span>
                  </span>
                  {r.dv !== null && <span className="shrink-0 font-semibold tabular-nums">{fmtNum(r.dv)}%</span>}
                </div>
              ))}
            </div>
          )}
          {dv && <div className={cx('mt-1 border-t-[5px] pt-1.5 text-[11px] leading-snug text-fg-3', ink)}>{tr('* The % Daily Value is how much a serving adds to a day’s diet, on 2,000 calories a day.')}</div>}
        </div>
        {macros && (
          <Section title={tr('Where the calories come from')}>
            <PieChart donut size={140} labels={[tr('Fat'), tr('Carbs'), tr('Protein')]} values={[Math.round(fat! * 9), Math.round(carbs! * 4), Math.round(protein! * 4)]} unit="kcal" />
          </Section>
        )}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-4 text-[13px] text-fg-2" />}
    </Card>
  );
}

// ---- a meal plan ------------------------------------------------------------------------------------------------------

/** A day as written ("Mon"), or a date written short ("Mon, 9 Nov"). */
const dayText = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(str(v)) ? fmtDate(v, 'dayMonth') : str(v));

function MealCell({ m }: { m: Data }) {
  const { offline } = useAui();
  const kcal = num(m.kcal ?? m.calories);
  return (
    <div className="min-w-0">
      {str(m.image) && !offline && <Pic src={m.image} alt={textOf(m, 'name', 'dish', 'title')} className="mb-1.5 aspect-[4/3] w-full rounded-md" />}
      <div className="text-[13px] leading-snug font-medium">{textOf(m, 'name', 'dish', 'title')}</div>
      {(kcal !== null || str(m.note)) && (
        <div className="mt-0.5 text-[11.5px] leading-snug text-fg-3">
          {kcal !== null && <span className="tabular-nums">{`${fmtNum(kcal)} kcal`}</span>}
          {kcal !== null && str(m.note) && ' · '}
          {str(m.note)}
        </div>
      )}
    </div>
  );
}

function MealPlan({ data, done }: { data: Data; done: boolean }) {
  const days = arr(data.days ?? data.week)
    .filter(isObj)
    .map((d) => ({ day: dayText(d.day ?? d.date ?? d.name), meals: arr(d.meals ?? d.items).map((m) => (isObj(m) ? m : { name: str(m) })) }));
  const mealOf = (m: Data) => str(m.meal ?? m.type).trim();
  const named = [...new Set(days.flatMap((d) => d.meals.map(mealOf)).filter(Boolean))];
  const cols = named.length ? named : Array.from({ length: Math.max(0, ...days.map((d) => d.meals.length)) }, () => '');
  const cell = (d: (typeof days)[number], c: string, ci: number) => (named.length ? d.meals.find((m) => mealOf(m) === c) : d.meals[ci]);
  const kcalOf = (d: (typeof days)[number]) => {
    const v = d.meals.map((m) => num(m.kcal ?? m.calories)).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const totals = days.map(kcalOf);
  const known = totals.filter((x): x is number => x !== null);
  const avg = known.length ? Math.round(known.reduce((a, b) => a + b, 0) / known.length / 10) * 10 : null;
  const [pick, setPick] = useKept<number>('day', 0);
  const at = Math.min(Math.max(0, Math.round(num(pick) ?? 0)), Math.max(0, days.length - 1));
  const raw = arr(data.shopping ?? data.groceries ?? data.shopping_list);
  const shopping = raw.some(isObj) ? raw.filter(isObj).map((g) => ({ group: str(g.group ?? g.name), items: words(g.items) })) : raw.length ? [{ group: '', items: raw.map((x) => textOf(x)).filter(Boolean) }] : [];
  const [got, setGot] = useKept<Record<string, boolean>>('got', {});
  const all = shopping.reduce((m, g) => m + g.items.length, 0);
  const gotN = shopping.reduce((m, g, gi) => m + g.items.filter((_, ii) => got[`${gi}:${ii}`]).length, 0);
  const listText = () => shopping.map((g) => [g.group, ...g.items.map((it) => `- ${it}`)].filter(Boolean).join('\n')).join('\n\n');
  const few = cols.length <= 3;
  const sub = [days.length > 1 ? tr('{0} days').replace('{0}', String(days.length)) : '', avg !== null ? tr('about {0} kcal a day').replace('{0}', fmtNum(avg)) : ''].filter(Boolean).join(' · ');
  const today = days[at];
  return (
    <Card>
      <Head title={data.title} sub={sub} />
      {days.length > 0 && (
        <>
          <div className={cx('hidden overflow-x-auto', few ? '@lg:block' : '@2xl:block')}>
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="w-[76px]" />
                  {cols.map((c, i) => (
                    <th key={i} className="aui-h4 px-2 pb-1.5 text-left font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((d, i) => (
                  <tr key={i} className="border-t border-line/70">
                    <th scope="row" className="py-2.5 pr-2 text-left align-top">
                      <div className="text-[13px] font-semibold">{d.day}</div>
                      {totals[i] !== null && <div className="text-[11.5px] font-normal text-fg-3 tabular-nums">{`${fmtNum(totals[i])} kcal`}</div>}
                    </th>
                    {cols.map((c, ci) => {
                      const m = cell(d, c, ci);
                      return (
                        <td key={ci} className="px-2 py-2.5 align-top">
                          {m ? <MealCell m={m} /> : <span className="text-fg-3">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={few ? '@lg:hidden' : '@2xl:hidden'}>
            {days.length > 1 && (
              <div className={cx('mb-3 max-w-full', !done && 'pointer-events-none')}>
                <Seg size="sm" value={at} onChange={(v) => setPick(v)} options={days.map((d, i) => ({ value: i, label: d.day || String(i + 1) }))} />
              </div>
            )}
            {today && (
              <div>
                {totals[at] !== null && <div className="mb-1 text-[12px] text-fg-3 tabular-nums">{`${today.day} · ${fmtNum(totals[at])} kcal`}</div>}
                <ul className="m-0 list-none p-0">
                  {today.meals.map((m, i) => (
                    <li key={i} className="flex gap-3 border-t border-line/70 py-2.5">
                      {mealOf(m) && <div className="aui-h4 w-[84px] shrink-0 pt-0.5">{mealOf(m)}</div>}
                      <MealCell m={m} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
      {shopping.length > 0 && (
        <Section
          title={tr('Shopping list')}
          className="mt-5 border-t border-line pt-4"
          aside={
            <span className="flex items-center gap-1 text-[12px] text-fg-3 tabular-nums">
              {`${gotN}/${all}`}
              {done && <Copy text={listText} label={tr('Copy the list')} />}
            </span>
          }
        >
          <div className="grid gap-x-6 gap-y-3 @lg:grid-cols-2">
            {shopping.map((g, gi) => (
              <div key={gi} className="min-w-0">
                {g.group && <div className="mb-1 text-[12px] font-semibold text-fg-3">{g.group}</div>}
                <ul className="m-0 list-none space-y-0.5 p-0">
                  {g.items.map((it, ii) => {
                    const k = `${gi}:${ii}`;
                    const on = !!got[k];
                    return (
                      <li key={ii}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-0.5 text-[13.5px] hover:bg-bg-1">
                          <input type="checkbox" checked={on} disabled={!done} onChange={() => setGot((x) => ({ ...x, [k]: !on }))} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                          <span className={cx('min-w-0', on && 'text-fg-3 line-through decoration-line-2')}>{it}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Card>
  );
}

// ---- a workout --------------------------------------------------------------------------------------------------------

/** Seconds as a countdown shows them: 1:05, 0:40. */
const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s % 60))).padStart(2, '0')}`;
/** Seconds in words: 40 s, 1 min 30 s, 2 min. */
const secsText = (s: number) => (s < 60 ? `${fmtNum(s)} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${Math.round(s % 60)} s` : ''}`);

interface Countdown {
  kind: 'work' | 'rest';
  ex: number;
  set: number;
  ends: number;
  total: number;
}

function Workout({ data, done }: { data: Data; done: boolean }) {
  const { offline } = useAui();
  const list = arr(data.exercises ?? data.moves ?? data.items).map((x) => (isObj(x) ? x : { name: str(x) }));
  const [ticks, setTicks] = useKept<Record<string, boolean>>('sets', {});
  const [clock, setClock] = useState<Countdown | null>(null);
  const [, redraw] = useState(0);
  const ticksNow = useRef(ticks);
  ticksNow.current = ticks;
  const setsOf = (x: Data) => Math.min(12, Math.max(1, Math.round(num(x.sets) ?? 1)));
  const secsOf = (x: Data | undefined) => Math.max(0, num(x?.time) ?? 0);
  const total = list.reduce((m, x) => m + setsOf(x), 0);
  const ticked = list.reduce((m, x, i) => m + Array.from({ length: setsOf(x) }, (_, s) => ticks[`${i}:${s}`]).filter(Boolean).length, 0);
  /** The first set not yet ticked after this one: where a rest leads. */
  const nextAfter = (i: number, s: number, t: Record<string, boolean>) => {
    for (let a = i; a < list.length; a++) for (let b = a === i ? s + 1 : 0; b < setsOf(list[a]); b++) if (!t[`${a}:${b}`]) return { ex: a, set: b };
    return null;
  };
  /** After a set: its rest, when it has one and something is left to do. */
  const restAfter = (i: number, s: number, t: Record<string, boolean>) => {
    const r = num(list[i]?.rest);
    setClock(r && r > 0 && nextAfter(i, s, t) ? { kind: 'rest', ex: i, set: s, ends: Date.now() + r * 1000, total: r } : null);
  };
  const tick = (i: number, s: number) => {
    const k = `${i}:${s}`;
    const next = { ...ticksNow.current, [k]: !ticksNow.current[k] };
    setTicks(next);
    if (next[k]) restAfter(i, s, next);
    else if (clock && clock.ex === i && clock.set === s) setClock(null);
  };
  // A countdown that runs out: a timed set is ticked and its rest begins; a rest just ends.
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => {
      if (Date.now() < clock.ends) {
        redraw((n) => n + 1);
        return;
      }
      clearInterval(t);
      if (clock.kind === 'work') {
        toast(`${tr('Time is up')}: ${str(list[clock.ex]?.name)}`, 'info');
        const next = { ...ticksNow.current, [`${clock.ex}:${clock.set}`]: true };
        setTicks(next);
        restAfter(clock.ex, clock.set, next);
      } else {
        toast(tr('Rest is over'), 'info');
        setClock(null);
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock]);
  const left = clock ? Math.max(0, Math.ceil((clock.ends - Date.now()) / 1000)) : 0;
  const meta = [str(data.duration) && { icon: true, text: str(data.duration) }, str(data.level) && { icon: false, text: str(data.level) }].filter(Boolean) as { icon: boolean; text: string }[];
  return (
    <Card>
      <Head title={data.title} aside={total > 1 ? <span className="text-[12px] text-fg-3 tabular-nums">{tr('{0} of {1} sets').replace('{0}', String(ticked)).replace('{1}', String(total))}</span> : undefined} className="mb-2" />
      {meta.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-2">
          {meta.map((m, i) =>
            m.icon ? (
              <span key={i} className="inline-flex items-center gap-1.5">
                <Clock size={13} className="text-fg-3" />
                {m.text}
              </span>
            ) : (
              <Chip key={i}>{m.text}</Chip>
            ),
          )}
        </div>
      )}
      {total > 1 && <Meter value={ticked} max={total} thin tone={ticked === total ? 'good' : undefined} />}
      {str(data.warmup) && (
        <div className="mt-4 rounded-lg bg-bg-1 px-3 py-2">
          <div className="aui-h4 mb-0.5">{tr('Warm-up')}</div>
          <Md text={data.warmup} className="text-[13px] text-fg-2" />
        </div>
      )}
      <ol className="m-0 mt-4 list-none p-0">
        {list.map((x, i) => {
          const sets = setsOf(x);
          const secs = secsOf(x);
          const rest = num(x.rest) ?? 0;
          const name = textOf(x, 'name', 'title');
          const finished = Array.from({ length: sets }, (_, s) => ticks[`${i}:${s}`]).every(Boolean);
          const facts = [secs ? `${sets} × ${secsText(secs)}` : str(x.reps) ? `${sets} × ${str(x.reps)}` : sets > 1 ? tr('{0} sets').replace('{0}', String(sets)) : '', str(x.weight)].filter(Boolean).join(' · ');
          return (
            <li key={i} className="border-b border-line/70 py-3 first:pt-0 last:border-b-0 last:pb-0">
              <div className="flex gap-3">
                <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold', finished ? 'bg-ok text-white' : 'bg-bg-2 text-fg-2')}>{finished ? <Check size={13} strokeWidth={3} /> : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 pt-0.5">
                    <span className={cx('font-semibold', finished && 'text-fg-3')}>{name}</span>
                    {facts && <span className="text-[12.5px] text-fg-2 tabular-nums">{facts}</span>}
                  </div>
                  {str(x.note) && <Md text={x.note} className="mt-0.5 text-[12.5px] text-fg-3" />}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: sets }, (_, s) => {
                      const on = !!ticks[`${i}:${s}`];
                      const running = clock?.kind === 'work' && clock.ex === i && clock.set === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          disabled={!done}
                          aria-pressed={on}
                          onClick={() => (secs && !on && !running ? setClock({ kind: 'work', ex: i, set: s, ends: Date.now() + secs * 1000, total: secs }) : tick(i, s))}
                          title={secs && !on && !running ? tr('Start the timer') : undefined}
                          className={cx(
                            'inline-flex h-7 items-center justify-center gap-1 rounded-full border px-2.5 text-[12px] font-medium whitespace-nowrap tabular-nums transition-colors disabled:cursor-default',
                            on ? 'border-ok bg-ok text-white' : running ? 'border-accent bg-accent-soft text-accent' : 'border-line text-fg-2 hover:bg-bg-2',
                          )}
                        >
                          {on && <Check size={12} strokeWidth={3} />}
                          {!on && secs > 0 && !running && <Play size={10} fill="currentColor" />}
                          {running ? clockText(left) : tr('Set {0}').replace('{0}', String(s + 1))}
                        </button>
                      );
                    })}
                    {rest > 0 && (
                      <span className="ml-1 inline-flex items-center gap-1 text-[11.5px] text-fg-3">
                        <Timer size={11} />
                        {tr('Rest {0}').replace('{0}', secsText(rest))}
                      </span>
                    )}
                  </div>
                  {clock && clock.ex === i && (
                    <div className={cx('mt-2.5 flex items-center gap-3 rounded-xl px-3 py-2', clock.kind === 'rest' ? 'bg-info/10' : 'bg-accent-soft')}>
                      <Timer size={16} className={cx('shrink-0', clock.kind === 'rest' ? 'text-info' : 'text-accent')} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] text-fg-2">
                          {clock.kind === 'rest'
                            ? (() => {
                                const n = nextAfter(clock.ex, clock.set, ticks);
                                return n ? `${tr('Rest')} · ${tr('next: {0}').replace('{0}', `${textOf(list[n.ex], 'name', 'title')}, ${tr('set {0}').replace('{0}', String(n.set + 1))}`)}` : tr('Rest');
                              })()
                            : `${name} · ${tr('set {0}').replace('{0}', String(clock.set + 1))}`}
                        </div>
                        <Meter value={left} max={clock.total} thin tone={clock.kind === 'rest' ? 'info' : 'accent'} className="mt-1.5" />
                      </div>
                      <span className="text-[22px] font-semibold tabular-nums">{clockText(left)}</span>
                      <Btn onClick={() => setClock(null)} title={clock.kind === 'rest' ? tr('Skip the rest') : tr('Stop')} icon={clock.kind === 'rest' ? <SkipForward size={14} /> : <X size={14} />} />
                    </div>
                  )}
                  {str(x.image) && !offline && <Pic src={x.image} alt={name} className="mt-2 aspect-video w-full max-w-xs rounded-lg" />}
                  {str(x.video) && <Video url={x.video} title={name} className="mt-2 max-w-sm" />}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {str(data.cooldown) && (
        <div className="mt-4 rounded-lg bg-bg-1 px-3 py-2">
          <div className="aui-h4 mb-0.5">{tr('Cool-down')}</div>
          <Md text={data.cooldown} className="text-[13px] text-fg-2" />
        </div>
      )}
      {total > 1 && ticked === total && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ok/10 px-3 py-2 text-[13px]">
          <span className="font-medium text-ok">{tr('All sets done. Well done!')}</span>
          <Btn icon={<RotateCcw size={13} />} onClick={() => (setTicks({}), setClock(null))}>
            {tr('Start over')}
          </Btn>
        </div>
      )}
    </Card>
  );
}

export const FOOD_UIS: Record<string, AnswerUiView> = {
  recipe: Recipe,
  nutrition: Nutrition,
  'meal-plan': MealPlan,
  workout: Workout,
};
