// The answer UIs that compare options and help decide: their views, by name (shared/answer-ui/compare.ts has what each takes).
import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, CheckCircle2, ChevronLeft, ChevronRight, CircleCheck, CircleX, Coins, Dices, Flag, Info, MessageSquarePlus, Minus, RotateCcw, RotateCw, Shuffle, ThumbsDown, ThumbsUp, TriangleAlert, Trophy, X } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { useWidth } from '../charts';
import { arr, Btn, Card, Chip, fmtNum, Head, isObj, LinkOut, Md, Meter, num, Pic, Ring, Section, Seg, seriesColor, Stars, str, textOf, TONE, TONE_FILL, toneOf, useAsk, useKept, usePicsOk, withUnit, words, yes, type AnswerUiView, type Data, type Tone } from '../kit';

/** A colour mixed into the panel's (or another): a tinted background or border that reads in both themes. */
const mix = (color: string, pct: number, base = 'var(--panel)') => `color-mix(in srgb, ${color} ${pct}%, ${base})`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** A list of points, or one point given as text. */
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? arr(v) : str(v).trim() ? [v] : []);

/** The items a row marks as best: the highest or lowest number (ties all), or the one at an index. */
function bestOf(row: Data, values: unknown[]): Set<number> {
  const b = row.best;
  if (typeof b === 'number') return new Set([b]);
  const mode = str(b).toLowerCase();
  if (mode !== 'high' && mode !== 'low') return new Set();
  const nums = values.map((v) => (typeof v === 'boolean' ? null : num(v)));
  const known = nums.filter((v): v is number => v !== null);
  if (known.length < 2) return new Set();
  const target = mode === 'high' ? Math.max(...known) : Math.min(...known);
  return new Set(nums.flatMap((v, i) => (v === target ? [i] : [])));
}

function Cell({ v, row }: { v: unknown; row: Data }) {
  if (v === true) return <Check size={16} strokeWidth={2.5} className="inline text-ok" aria-label={tr('Yes')} />;
  if (v === false) return <X size={16} strokeWidth={2.5} className="inline text-fg-3" aria-label={tr('No')} />;
  if (v === null || v === undefined || v === '') return <Minus size={14} className="inline text-fg-3" />;
  if (typeof v === 'number') return <span className="tabular-nums">{withUnit(v, str(row.unit), str(row.prefix))}</span>;
  return <Md text={v} inline />;
}

function Comparison({ data }: { data: Data }) {
  const items = arr(data.items).map((it) => (isObj(it) ? it : { name: str(it) }));
  const rows = arr(data.rows).filter(isObj);
  const winner = num(data.winner);
  const anyPic = items.some((it) => str(it.image));
  let lastGroup = '';
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 @lg:px-5" />}
      <div className="overflow-x-auto">
        <table className="aui-compare w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-panel" />
              {items.map((it, i) => (
                <th key={i} className={cx('min-w-[120px] px-3 pt-4 pb-3 text-left align-bottom font-normal', i === winner && 'bg-accent-soft/60')}>
                  {anyPic && <Pic src={it.image} alt={str(it.name)} fit="contain" className="mb-2 h-20 w-full rounded-lg bg-bg-1" />}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {str(it.url) ? (
                      <LinkOut url={it.url} icon={false} className="font-semibold text-fg">
                        {str(it.name)}
                      </LinkOut>
                    ) : (
                      <span className="font-semibold text-fg">{str(it.name)}</span>
                    )}
                    {(str(it.badge) || i === winner) && <Chip tone="accent">{str(it.badge) || tr('Pick')}</Chip>}
                  </div>
                  {str(it.subtitle) && <div className="mt-0.5 text-[12px] text-fg-3">{str(it.subtitle)}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const values = arr(row.values).length ? (row.values as unknown[]) : [];
              const best = bestOf(row, values);
              const group = str(row.group);
              const head = group && group !== lastGroup;
              lastGroup = group || lastGroup;
              return (
                <Fragment key={r}>
                  {head && (
                    <tr>
                      <td colSpan={items.length + 1} className="px-4 pt-4 pb-1 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase @lg:px-5">
                        {group}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-line/70">
                    <th scope="row" className="sticky left-0 z-[1] bg-panel px-4 py-2 text-left align-top text-[13px] font-medium whitespace-nowrap text-fg-3 @lg:px-5">
                      {str(row.label)}
                    </th>
                    {items.map((_, i) => (
                      <td key={i} className={cx('px-3 py-2 align-top', i === winner && 'bg-accent-soft/60', best.has(i) && 'font-semibold text-fg')}>
                        <span className={cx(best.has(i) && 'rounded-md bg-ok/12 px-1.5 py-0.5 text-ok [box-decoration-break:clone]')}>
                          <Cell v={values[i] ?? null} row={row} />
                        </span>
                      </td>
                    ))}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {str(data.verdict) && (
        <div className="border-t border-line px-4 py-3 text-[13.5px] @lg:px-5">
          <Md text={data.verdict} inline />
        </div>
      )}
    </Card>
  );
}

// ---- pros and cons ---------------------------------------------------------------------------------------------------

function PcList({ good, items }: { good: boolean; items: unknown[] }) {
  return (
    <div className="min-w-0 rounded-xl p-3.5" style={{ background: mix(good ? 'var(--ok)' : 'var(--err)', 6) }}>
      <div className={cx('mb-2 flex items-center gap-1.5 text-[13px] font-semibold', good ? 'text-ok' : 'text-err')}>
        {good ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
        {good ? tr('Pros') : tr('Cons')}
        {items.length > 0 && <span className="font-normal text-fg-3 tabular-nums">{items.length}</span>}
      </div>
      {items.length > 0 ? (
        <ul className="m-0 list-none space-y-1.5 p-0">
          {items.map((x, i) => (
            <li key={i} className="flex gap-2 text-[13.5px] leading-snug">
              {good ? <Check size={15} strokeWidth={2.5} className="mt-px shrink-0 text-ok" /> : <X size={15} strokeWidth={2.5} className="mt-px shrink-0 text-err" />}
              <Md text={textOf(x, 'text', 'point', 'title')} inline className="min-w-0" />
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-[13px] text-fg-3">—</div>
      )}
    </div>
  );
}

function ProsCons({ data, done }: { data: Data; done: boolean }) {
  const options = arr(data.options ?? data.items)
    .filter(isObj)
    .map((o, i) => ({ name: textOf(o, 'name', 'title', 'label') || tr('Option {0}').replace('{0}', String(i + 1)), pros: listOf(o.pros), cons: listOf(o.cons), verdict: o.verdict }));
  const list = options.length ? options : [{ name: '', pros: listOf(data.pros), cons: listOf(data.cons), verdict: data.verdict }];
  const [at, setAt] = useKept<number>('option', 0);
  const cur = done ? clamp(num(at) ?? 0, 0, list.length - 1) : 0;
  const o = list[cur];
  return (
    <Card>
      <Head title={data.subject ?? data.title} />
      {options.length > 1 && <Seg options={options.map((x, i) => ({ value: i, label: x.name }))} value={cur} onChange={(v) => done && setAt(v)} className="mb-3" />}
      {options.length === 1 && <div className="mb-2 font-semibold">{options[0].name}</div>}
      {(o.pros.length > 0 || o.cons.length > 0) && (
        <div className="grid gap-2.5 @md:grid-cols-2">
          <PcList good items={o.pros} />
          <PcList good={false} items={o.cons} />
        </div>
      )}
      {str(o.verdict) && (
        <div className="mt-3 rounded-lg bg-bg-2 px-3 py-2 text-[13.5px]">
          <Md text={o.verdict} inline />
        </div>
      )}
      {options.length > 0 && str(data.verdict) && <Md text={data.verdict} className="mt-3 text-[13.5px]" />}
    </Card>
  );
}

// ---- a decision matrix -----------------------------------------------------------------------------------------------

function DecisionMatrix({ data, done }: { data: Data; done: boolean }) {
  const options = arr(data.options).map((o) => textOf(o, 'name', 'title', 'label'));
  const criteria = arr(data.criteria)
    .filter(isObj)
    .map((c) => ({
      name: textOf(c, 'name', 'label', 'title'),
      weight: clamp(Math.round(num(c.weight) ?? 3), 0, 5),
      // Kept in place (a missing score stays a gap), so each lines up with its option.
      scores: (Array.isArray(c.scores) ? c.scores : Array.isArray(c.values) ? c.values : []).map((v: unknown) => num(v)),
      note: str(c.note),
    }));
  const [kept, setKept] = useKept<Record<string, number>>('weights', {});
  const weight = (i: number) => (done && typeof kept[i] === 'number' ? kept[i] : criteria[i].weight);
  const changed = done && criteria.some((c, i) => typeof kept[i] === 'number' && kept[i] !== c.weight);
  // Each option's weighted score, 0 to 10: what it scores on each criterion, by how much that criterion matters.
  const totals = options.map((_, j) => {
    let sw = 0;
    let sum = 0;
    criteria.forEach((c, i) => {
      const s = c.scores[j];
      if (s === null || s === undefined) return;
      sw += weight(i);
      sum += weight(i) * clamp(s, 0, 10);
    });
    return sw > 0 ? sum / sw : null;
  });
  const known = totals.filter((t): t is number => t !== null);
  const top = known.length ? Math.max(...known) : null;
  const ranked = options.map((name, j) => ({ name, j, total: totals[j] })).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const one = (n: number | null) => (n === null ? '—' : fmtNum(n, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  return (
    <Card>
      <Head
        title={data.title}
        aside={
          changed ? (
            <button type="button" onClick={() => setKept({})} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
              <RotateCcw size={12} />
              {tr('Reset')}
            </button>
          ) : undefined
        }
      />
      {options.length > 0 && criteria.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 @lg:-mx-5 @lg:px-5">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line">
                <th className="py-1.5 pr-3 text-left text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr('What matters')}</th>
                {options.map((o, j) => (
                  <th key={j} className="min-w-[68px] px-1 py-1.5 text-center font-semibold text-fg">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(j) }} />
                      {o}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="min-w-[150px] py-2 pr-3 align-top">
                    <div className="leading-snug font-medium text-fg">{c.name}</div>
                    {c.note && <div className="text-[11.5px] leading-snug text-fg-3">{c.note}</div>}
                    <label className="mt-1 flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={5}
                        step={1}
                        value={weight(i)}
                        disabled={!done}
                        onChange={(e) => setKept((k) => ({ ...k, [i]: Number(e.target.value) }))}
                        aria-label={`${tr('How much it matters')}: ${c.name}`}
                        className="h-1 w-full max-w-[112px] cursor-pointer accent-[var(--accent)] disabled:cursor-default"
                      />
                      <span className="w-6 shrink-0 text-[11.5px] text-fg-3 tabular-nums">×{weight(i)}</span>
                    </label>
                  </td>
                  {options.map((_, j) => {
                    const s = c.scores[j];
                    return (
                      <td key={j} className="px-1 py-2 text-center align-middle">
                        <span
                          className="inline-grid h-7 min-w-[36px] place-items-center rounded-md px-1.5 font-medium text-fg tabular-nums"
                          style={s !== null && s !== undefined ? { background: `color-mix(in srgb, var(--viz-1) ${Math.round(4 + clamp(s, 0, 10) * 5)}%, transparent)` } : undefined}
                        >
                          {s !== null && s !== undefined ? fmtNum(s) : '—'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {known.length > 0 && (
        <Section title={tr('Weighted score')} className="mt-4">
          <div className="space-y-1.5">
            {ranked.map((r) => {
              const lead = top !== null && r.total !== null && Math.abs(r.total - top) < 0.005;
              return (
                <div key={r.j} className="flex items-center gap-2.5">
                  <span className="flex w-[34%] max-w-44 min-w-0 shrink-0 items-center gap-1.5 text-[13px]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: seriesColor(r.j) }} />
                    <span className={cx('truncate', lead ? 'font-semibold text-fg' : 'text-fg-2')}>{r.name}</span>
                    {lead && <Trophy size={13} className="shrink-0 text-accent" aria-label={tr('Top score')} />}
                  </span>
                  <span className="relative h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-3">
                    <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300" style={{ width: `${clamp((r.total ?? 0) * 10, 0, 100)}%`, background: seriesColor(r.j) }} />
                  </span>
                  <span className={cx('w-9 shrink-0 text-right text-[13px] tabular-nums', lead ? 'font-semibold text-fg' : 'text-fg-2')}>{one(r.total)}</span>
                </div>
              );
            })}
          </div>
          {done && criteria.length > 1 && <div className="mt-2 text-[12px] text-fg-3">{tr('Move the sliders to change how much each one counts.')}</div>}
        </Section>
      )}
      {str(data.recommendation) && (
        <div className="mt-3 rounded-lg bg-bg-2 px-3 py-2 text-[13.5px]">
          <Md text={data.recommendation} inline />
        </div>
      )}
    </Card>
  );
}

// ---- choices ----------------------------------------------------------------------------------------------------------

/** A choice's mark: a round one when one may be picked, a square one when several may. */
function PickMark({ on, multiple }: { on: boolean; multiple: boolean }) {
  return (
    <span className={cx('mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center border-2 transition-colors', multiple ? 'rounded-[5px]' : 'rounded-full', on ? 'border-accent bg-accent text-accent-fg' : 'border-line-2 bg-panel')} aria-hidden>
      {on && <Check size={11} strokeWidth={3.5} />}
    </span>
  );
}

function Choices({ data, done }: { data: Data; done: boolean }) {
  const options = arr(data.options ?? data.choices ?? data.items).map((o) => (isObj(o) ? o : { title: str(o) }));
  const multiple = yes(data.multiple);
  const [picked, setPicked] = useKept<number[]>('picked', []);
  const [sent, setSent] = useKept<boolean>('sent', false);
  const ask = useAsk();
  const chosen = (Array.isArray(picked) ? picked : []).filter((i) => typeof i === 'number' && i < options.length);
  const picOks = usePicsOk(options.map((o) => o.image));
  const anyPic = picOks.some(Boolean);
  const pick = (i: number) => {
    if (!done) return;
    setSent(false);
    setPicked((p) => {
      const now = Array.isArray(p) ? p : [];
      return multiple ? (now.includes(i) ? now.filter((x) => x !== i) : [...now, i].sort((a, b) => a - b)) : [i];
    });
  };
  const send = () => {
    ask(`${tr('I’ll go with:')} ${chosen.map((i) => textOf(options[i], 'title', 'name', 'label')).join(', ')}`);
    setSent(true);
  };
  const [group] = useState(() => `aui-choice-${Math.random().toString(36).slice(2, 8)}`);
  return (
    <Card>
      <Head title={data.question ?? data.title} sub={multiple && done ? tr('Pick as many as you like.') : undefined} />
      <div className={cx('grid gap-2.5', anyPic && options.length > 1 && '@md:grid-cols-2')}>
        {options.map((o, i) => {
          const on = chosen.includes(i);
          const title = textOf(o, 'title', 'name', 'label');
          const tags = words(o.tags);
          const hasPic = picOks[i];
          return (
            <label
              key={i}
              className={cx(
                'relative flex min-w-0 overflow-hidden rounded-xl border transition-colors',
                // A picture sits beside the words when the choices are one under the other, above them in a grid.
                hasPic ? (options.length > 1 ? 'flex-row @md:flex-col' : 'flex-row') : 'flex-col',
                done ? 'cursor-pointer' : 'cursor-default',
                on ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:border-line-2 hover:bg-bg-1',
              )}
            >
              <input type={multiple ? 'checkbox' : 'radio'} name={group} checked={on} disabled={!done} onChange={() => pick(i)} className="sr-only" />
              {str(o.image) && <Pic src={o.image} alt={title} zoom={false} className={cx('min-h-24 w-[34%] max-w-40 shrink-0 self-stretch rounded-none', options.length > 1 && '@md:aspect-[16/9] @md:min-h-0 @md:w-full @md:max-w-none @md:self-auto')} />}
              {yes(o.recommended) && hasPic && (
                <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg shadow-sm">{tr('Recommended')}</span>
              )}
              <div className="flex min-w-0 flex-1 gap-2.5 p-3">
                <PickMark on={on} multiple={multiple} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-fg">{title}</span>
                    {yes(o.recommended) && !hasPic && <Chip tone="accent">{tr('Recommended')}</Chip>}
                  </div>
                  {str(o.description) && <Md text={o.description} className="mt-0.5 text-[13px] text-fg-2" />}
                  {(tags.length > 0 || str(o.price)) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {tags.map((t, k) => (
                        <Chip key={k}>{t}</Chip>
                      ))}
                      {str(o.price) && <span className="ml-auto pl-1 text-[13px] font-semibold whitespace-nowrap text-fg">{str(o.price)}</span>}
                    </div>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
      {done && options.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
          {sent && chosen.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-fg-3">
              <Check size={14} className="text-ok" />
              {tr('In your message box')}
            </span>
          )}
          <Btn primary disabled={!chosen.length} icon={<MessageSquarePlus size={14} />} onClick={send}>
            {tr('Send my choice')}
          </Btn>
        </div>
      )}
    </Card>
  );
}

// ---- a recommendation -----------------------------------------------------------------------------------------------------

function NameLink({ x, className }: { x: Data; className?: string }) {
  const name = textOf(x, 'name', 'title', 'label');
  return str(x.url) ? (
    <LinkOut url={x.url} className={cx('font-semibold text-fg', className)}>
      {name}
    </LinkOut>
  ) : (
    <span className={cx('font-semibold text-fg', className)}>{name}</span>
  );
}

function Recommendation({ data }: { data: Data }) {
  const pick = isObj(data.pick) ? data.pick : isObj(data.winner) ? data.winner : {};
  const alts = arr(data.alternatives ?? data.runners_up ?? data.others).map((x) => (isObj(x) ? x : { name: str(x) }));
  const avoid = arr(data.avoid ?? data.skip).map((x) => (isObj(x) ? x : { name: str(x) }));
  const name = textOf(pick, 'name', 'title', 'label');
  const hasPick = !!(name || str(pick.why));
  return (
    <Card pad={false} className="overflow-hidden">
      {str(data.title) && <Head title={data.title} className="mb-0 px-4 pt-4 @lg:px-5" />}
      {hasPick && (
        <div className="flex flex-col gap-4 p-4 @lg:flex-row @lg:items-start @lg:p-5">
          {str(pick.image) && <Pic src={pick.image} alt={name} className="aspect-[16/9] w-full shrink-0 rounded-xl @lg:aspect-[4/3] @lg:w-56" />}
          <div className="min-w-0 flex-1">
            <Chip tone="accent">
              <Trophy size={12} />
              {tr('Top pick')}
            </Chip>
            <div className="mt-1.5 text-[20px] leading-tight font-semibold tracking-tight">
              <NameLink x={{ ...pick, name }} />
            </div>
            {(num(pick.rating) !== null || str(pick.price)) && (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {num(pick.rating) !== null && <Stars value={pick.rating} />}
                {str(pick.price) && <span className="text-[15px] font-semibold">{str(pick.price)}</span>}
              </div>
            )}
            {str(pick.why) && <Md text={pick.why} className="mt-2 text-[14px] text-fg-2" />}
          </div>
        </div>
      )}
      {alts.length > 0 && (
        <div className={cx('px-4 py-3.5 @lg:px-5', (hasPick || str(data.title)) && 'border-t border-line')}>
          <Section title={tr('Also good')}>
            <ul className="m-0 list-none space-y-3 p-0">
              {alts.map((a, i) => (
                <li key={i} className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <NameLink x={a} className="text-[14px]" />
                    {str(a.best_for ?? a.bestFor) && <Chip>{tr('Best for: {0}').replace('{0}', str(a.best_for ?? a.bestFor))}</Chip>}
                    {str(a.price) && <span className="ml-auto text-[13px] font-semibold whitespace-nowrap">{str(a.price)}</span>}
                  </div>
                  {str(a.why) && <Md text={a.why} className="mt-0.5 text-[13px] text-fg-2" />}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
      {avoid.length > 0 && (
        <div className={cx('px-4 py-3.5 @lg:px-5', (hasPick || alts.length > 0 || str(data.title)) && 'border-t border-line')}>
          <Section title={tr('Skip')}>
            <ul className="m-0 list-none space-y-2 p-0">
              {avoid.map((a, i) => (
                <li key={i} className="flex min-w-0 gap-2 text-[13px]">
                  <X size={15} strokeWidth={2.5} className="mt-px shrink-0 text-err" />
                  <div className="min-w-0">
                    <span className="font-semibold text-fg">{textOf(a, 'name', 'title', 'label')}</span>
                    {str(a.why) && (
                      <>
                        <span className="text-fg-3"> · </span>
                        <Md text={a.why} inline className="text-fg-2" />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </Card>
  );
}

// ---- a ranking ----------------------------------------------------------------------------------------------------------

/** How far an item moved: ▲ up, ▼ down, – the same, or new to the ranking. */
function Move({ v }: { v: unknown }) {
  if (/^new$/i.test(str(v).trim())) return <span className="text-[11px] font-semibold text-info uppercase">{tr('New')}</span>;
  const n = num(v);
  if (n === null) return null;
  if (n === 0) return <span className="text-[12px] text-fg-3">–</span>;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[12px] font-semibold tabular-nums', n > 0 ? 'text-ok' : 'text-err')} title={n > 0 ? tr('Up {0}').replace('{0}', fmtNum(Math.abs(n))) : tr('Down {0}').replace('{0}', fmtNum(Math.abs(n)))}>
      <span className="text-[9px]">{n > 0 ? '▲' : '▼'}</span>
      {fmtNum(Math.abs(n))}
    </span>
  );
}

function Ranking({ data }: { data: Data }) {
  const items = arr(data.items ?? data.ranking ?? data.rows).map((x) => (isObj(x) ? x : { name: str(x) }));
  const values = items.map((it) => num(it.value ?? it.score));
  const known = values.filter((v): v is number => v !== null);
  const max = known.length ? Math.max(...known.map(Math.abs)) : 0;
  const anyPic = items.some((it) => str(it.image));
  const anyMove = items.some((it) => it.change !== undefined && it.change !== null && it.change !== '');
  const unit = str(data.unit);
  const prefix = str(data.prefix);
  const pics = items.map((it) => it.image).filter((p) => str(p));
  return (
    <Card>
      <Head title={data.title} />
      {str(data.metric) && known.length > 0 && (
        <div className="mb-1 flex items-center gap-3 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">
          <span className="min-w-0 flex-1 text-right">{str(data.metric)}</span>
          {anyMove && <span className="w-8 shrink-0" />}
        </div>
      )}
      <ol className="m-0 list-none p-0">
        {items.map((it, i) => {
          const v = values[i];
          const rank = num(it.rank) ?? i + 1;
          return (
            <li key={i} className={cx('flex items-center gap-3 py-2.5', i > 0 && 'border-t border-line/70')}>
              <span className={cx('w-6 shrink-0 text-center text-[15px] font-semibold tabular-nums', rank === 1 ? 'text-accent' : 'text-fg-3')}>{fmtNum(rank)}</span>
              {anyPic && <Pic src={it.image} alt={textOf(it, 'name', 'title')} group={pics} className="h-9 w-[54px] shrink-0 rounded-md ring-1 ring-line" />}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold text-fg">{textOf(it, 'name', 'title', 'label')}</span>
                    {str(it.tag) && <Chip>{str(it.tag)}</Chip>}
                  </div>
                  {v !== null && <span className="shrink-0 font-semibold text-fg tabular-nums">{withUnit(v, unit, prefix)}</span>}
                </div>
                {v !== null && max > 0 && <Meter value={Math.abs(v)} max={max} thin className="mt-1.5" />}
                {str(it.detail ?? it.note) && <Md text={it.detail ?? it.note} inline className="mt-1 block text-[12.5px] text-fg-3" />}
              </div>
              {anyMove && (
                <span className="w-8 shrink-0 text-right">
                  <Move v={it.change} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {str(data.note) && <Md text={data.note} className="mt-2 text-[12.5px] text-fg-3" />}
    </Card>
  );
}

// ---- a scorecard ----------------------------------------------------------------------------------------------------------

function Scorecard({ data }: { data: Data }) {
  const max = num(data.max) || 10;
  const aspects = arr(data.aspects ?? data.scores ?? data.criteria)
    .filter(isObj)
    .map((a) => ({ name: textOf(a, 'name', 'label', 'title'), score: num(a.score ?? a.value ?? a.rating), note: str(a.note) }));
  const scored = aspects.map((a) => a.score).filter((s): s is number => s !== null);
  const overall = num(data.overall ?? data.score) ?? (scored.length ? scored.reduce((m, s) => m + s, 0) / scored.length : null);
  const share = overall === null ? 0 : overall / max;
  const tone: Tone = share >= 0.75 ? 'good' : share >= 0.5 ? 'warn' : 'bad';
  const digits = max <= 10 ? 1 : 0;
  const subject = str(data.subject ?? data.title ?? data.name);
  return (
    <Card>
      <div className="flex items-center gap-3.5">
        {str(data.image) && <Pic src={data.image} alt={subject} className="h-16 w-20 shrink-0 rounded-lg @lg:h-20 @lg:w-28" />}
        <div className="min-w-0 flex-1">
          <Head title={subject} sub={data.subtitle} className="mb-0" />
        </div>
        {overall !== null && (
          <Ring value={overall} max={max} size={74} stroke={7} tone={tone}>
            <span className="flex flex-col items-center">
              <span className="text-[21px] leading-none font-semibold tabular-nums">{fmtNum(overall, { maximumFractionDigits: digits })}</span>
              <span className="mt-1 text-[10.5px] text-fg-3 tabular-nums">/ {fmtNum(max)}</span>
            </span>
          </Ring>
        )}
      </div>
      {aspects.length > 0 && (
        <div className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-3.5 @xl:grid-cols-2">
          {aspects.map((a, i) => (
            <div key={i} className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 font-medium text-fg">{a.name}</span>
                {a.score !== null && <span className="shrink-0 font-semibold tabular-nums">{fmtNum(a.score, { maximumFractionDigits: digits })}</span>}
              </div>
              <Meter value={a.score ?? 0} max={max} thin className="mt-1" />
              {a.note && <div className="mt-1 text-[12px] leading-snug text-fg-3">{a.note}</div>}
            </div>
          ))}
        </div>
      )}
      {str(data.verdict) && (
        <div className="mt-4 rounded-lg bg-bg-2 px-3 py-2 text-[13.5px]">
          <Md text={data.verdict} inline />
        </div>
      )}
    </Card>
  );
}

// ---- versus ---------------------------------------------------------------------------------------------------------------

type Side = 'left' | 'right' | 'tie' | '';

function sideWon(v: unknown): Side {
  const w = str(v).trim().toLowerCase();
  if (w === 'left' || w === 'a' || w === '0') return 'left';
  if (w === 'right' || w === 'b' || w === '1') return 'right';
  if (w === 'tie' || w === 'draw' || w === 'both' || w === 'even') return 'tie';
  return '';
}

function VsHead({ s, color, wins, lead, right }: { s: Data; color: string; wins: number | null; lead: boolean; right?: boolean }) {
  return (
    <div className={cx('flex min-w-0 flex-col', right ? 'items-end text-right' : 'items-start text-left')}>
      {str(s.image) && <Pic src={s.image} alt={str(s.name)} fit="contain" className="mb-2 h-20 w-full rounded-lg bg-bg-1 @lg:h-28" />}
      <div className={cx('flex min-w-0 items-center gap-1.5', right && 'flex-row-reverse')}>
        <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} />
        <span className="text-[15px] leading-snug font-semibold text-fg">{str(s.name)}</span>
      </div>
      {str(s.subtitle) && <div className="text-[12px] text-fg-3">{str(s.subtitle)}</div>}
      {wins !== null && <div className={cx('mt-1 text-[12px]', lead ? 'font-semibold text-fg' : 'text-fg-3')}>{wins === 1 ? tr('1 win') : tr('{0} wins').replace('{0}', String(wins))}</div>}
    </div>
  );
}

/** A side's value in a row: its number (with what goes around it) or its words, the winner's marked. */
function VsValue({ v, n, row, win, right }: { v: unknown; n: number | null; row: Data; win: boolean; right?: boolean }) {
  const text = n !== null ? withUnit(n, str(row.unit), str(row.prefix)) : v;
  return (
    <div className={cx('flex min-w-0 items-start gap-1.5 text-[13.5px]', right ? 'flex-row-reverse text-right' : 'text-left', win ? 'font-semibold text-fg' : 'text-fg-2')}>
      <span className={cx('min-w-0', n !== null && 'tabular-nums')}>{n !== null ? str(text) : <Md text={text} inline />}</span>
      {win && <CheckCircle2 size={14} className="mt-[3px] shrink-0 text-ok" aria-label={tr('Better')} />}
    </div>
  );
}

function Versus({ data }: { data: Data }) {
  const L = isObj(data.left) ? data.left : isObj(data.a) ? data.a : { name: str(data.left ?? data.a) };
  const R = isObj(data.right) ? data.right : isObj(data.b) ? data.b : { name: str(data.right ?? data.b) };
  const rows = arr(data.rows ?? data.stats).filter(isObj);
  const won = rows.map((r) => sideWon(r.winner));
  const lw = won.filter((w) => w === 'left').length;
  const rw = won.filter((w) => w === 'right').length;
  const called = won.some(Boolean);
  const numOf = (v: unknown) => (typeof v === 'boolean' ? null : num(v));
  return (
    <Card>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <VsHead s={L} color={seriesColor(0)} wins={called ? lw : null} lead={lw > rw} />
        <span className="grid h-9 w-9 place-items-center rounded-full bg-bg-2 text-[12px] font-bold text-fg-3">{tr('vs')}</span>
        <VsHead s={R} color={seriesColor(1)} wins={called ? rw : null} lead={rw > lw} right />
      </div>
      {rows.length > 0 && (
        <div className="mt-3">
          {rows.map((r, i) => {
            const ln = numOf(r.left);
            const rn = numOf(r.right);
            const both = ln !== null && rn !== null;
            const top = both ? Math.max(Math.abs(ln), Math.abs(rn)) || 1 : 1;
            return (
              <div key={i} className="border-t border-line/70 py-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
                  <VsValue v={r.left} n={ln} row={r} win={won[i] === 'left'} />
                  <span className="max-w-[9rem] pt-px text-center text-[11.5px] leading-snug font-semibold tracking-wide text-fg-3 uppercase">{str(r.label)}</span>
                  <VsValue v={r.right} n={rn} row={r} win={won[i] === 'right'} right />
                </div>
                {both && (
                  <div className="mt-1.5 grid grid-cols-2 gap-0.5" aria-hidden>
                    <span className="flex h-2 justify-end overflow-hidden rounded-l-full bg-bg-3">
                      <span className="h-full rounded-l-full" style={{ width: `${(Math.abs(ln) / top) * 100}%`, background: seriesColor(0) }} />
                    </span>
                    <span className="flex h-2 overflow-hidden rounded-r-full bg-bg-3">
                      <span className="h-full rounded-r-full" style={{ width: `${(Math.abs(rn) / top) * 100}%`, background: seriesColor(1) }} />
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {str(data.verdict) && (
        <div className="mt-2 rounded-lg bg-bg-2 px-3 py-2 text-[13.5px]">
          <Md text={data.verdict} inline />
        </div>
      )}
    </Card>
  );
}

// ---- a quadrant chart ---------------------------------------------------------------------------------------------------

interface QItem {
  name: string;
  x: number;
  y: number;
  note: string;
}
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const shortName = (s: string) => (s.length > 26 ? `${s.slice(0, 25)}…` : s);

/** Where each point's name goes: beside it, on the side and at the height that keeps it clear of the others. */
function placeLabels(items: QItem[], sx: (v: number) => number, sy: (v: number) => number, plot: Box, taken: Box[]) {
  const boxes = [...taken, ...items.map((it) => ({ x0: sx(it.x) - 7, x1: sx(it.x) + 7, y0: sy(it.y) - 7, y1: sy(it.y) + 7 }))];
  return items.map((it) => {
    const px = sx(it.x);
    const py = sy(it.y);
    const w = shortName(it.name).length * 6.4 + 2;
    const tries: { anchor: 'start' | 'end'; x: number; y: number }[] = [
      { anchor: 'start', x: px + 10, y: py },
      { anchor: 'end', x: px - 10, y: py },
      { anchor: 'start', x: px + 8, y: py - 14 },
      { anchor: 'start', x: px + 8, y: py + 14 },
      { anchor: 'end', x: px - 8, y: py - 14 },
      { anchor: 'end', x: px - 8, y: py + 14 },
    ];
    const order = px + 10 + w > plot.x1 ? [1, 4, 5, 0, 2, 3] : [0, 1, 2, 3, 4, 5];
    let best = tries[order[0]];
    for (const k of order) {
      const t = tries[k];
      const x0 = t.anchor === 'start' ? t.x : t.x - w;
      const box = { x0, x1: x0 + w, y0: t.y - 7, y1: t.y + 7 };
      if (box.x0 < plot.x0 + 2 || box.x1 > plot.x1 - 2 || box.y0 < plot.y0 || box.y1 > plot.y1) continue;
      if (boxes.some((b) => overlaps(b, box))) continue;
      best = t;
      break;
    }
    const x0 = best.anchor === 'start' ? best.x : best.x - w;
    boxes.push({ x0, x1: x0 + w, y0: best.y - 7, y1: best.y + 7 });
    return best;
  });
}

function Quadrant({ data }: { data: Data }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const xa = isObj(data.x) ? data.x : { label: str(data.x_label ?? data.x) };
  const ya = isObj(data.y) ? data.y : { label: str(data.y_label ?? data.y) };
  const names = (Array.isArray(data.quadrants) ? data.quadrants : []).slice(0, 4).map((q: unknown) => textOf(q, 'name', 'label', 'title'));
  const items: QItem[] = arr(data.items ?? data.points)
    .filter(isObj)
    .map((it) => ({ name: textOf(it, 'name', 'label', 'title'), x: num(it.x), y: num(it.y), note: str(it.note ?? it.detail) }))
    .filter((it): it is QItem => it.x !== null && it.y !== null)
    .map((it) => ({ ...it, x: clamp(it.x, 0, 100), y: clamp(it.y, 0, 100) }));
  const padL = 24;
  const padR = 4;
  const padT = 4;
  const padB = 34;
  const plotW = Math.max(60, width - padL - padR);
  const plotH = Math.round(clamp(plotW * 0.7, 220, 420));
  const H = padT + plotH + padB;
  const sx = (v: number) => padL + (v / 100) * plotW;
  const sy = (v: number) => padT + plotH - (v / 100) * plotH;
  const plot = { x0: padL, x1: padL + plotW, y0: padT, y1: padT + plotH };
  // The quadrants' names sit in their outer corners: points' names keep clear of them.
  const corner = (k: number) => {
    const right = k % 2 === 1;
    const bottom = k >= 2;
    const w = (names[k] ?? '').length * 6.6 + 4;
    const x = right ? plot.x1 - 8 : plot.x0 + 8;
    const y = bottom ? plot.y1 - 9 : plot.y0 + 15;
    return { x, y, anchor: right ? ('end' as const) : ('start' as const), box: { x0: right ? x - w : x, x1: right ? x : x + w, y0: y - 10, y1: y + 4 } };
  };
  const corners = [0, 1, 2, 3].map(corner);
  const labels = width > 0 ? placeLabels(items, sx, sy, plot, corners.filter((_, k) => names[k]).map((c) => c.box)) : [];
  const h = hover !== null ? items[hover] : null;
  const xLabel = str(xa.label);
  const yLabel = str(ya.label);
  return (
    <Card>
      <Head title={data.title} />
      <div ref={ref} className="relative">
        {width > 0 && (
          <svg width={width} height={H} className="block overflow-visible" role="img" aria-label={items.map((it) => it.name).join(', ')}>
            <rect x={plot.x0} y={plot.y0} width={plotW} height={plotH} rx={10} fill="none" stroke="var(--line)" />
            <path d={`M${plot.x0 + 10},${plot.y0}H${sx(50)}V${sy(50)}H${plot.x0}V${plot.y0 + 10}Q${plot.x0},${plot.y0} ${plot.x0 + 10},${plot.y0}Z`} fill="var(--bg-2)" opacity={0.55} />
            <path d={`M${sx(50)},${sy(50)}H${plot.x1}V${plot.y1 - 10}Q${plot.x1},${plot.y1} ${plot.x1 - 10},${plot.y1}H${sx(50)}Z`} fill="var(--bg-2)" opacity={0.55} />
            <line x1={sx(50)} x2={sx(50)} y1={plot.y0} y2={plot.y1} stroke="var(--viz-axis)" shapeRendering="crispEdges" />
            <line x1={plot.x0} x2={plot.x1} y1={sy(50)} y2={sy(50)} stroke="var(--viz-axis)" shapeRendering="crispEdges" />
            {corners.map((c, k) =>
              names[k] ? (
                <text key={k} x={c.x} y={c.y} textAnchor={c.anchor} className="fill-fg-3 text-[11px] font-semibold tracking-wide uppercase">
                  {names[k]}
                </text>
              ) : null,
            )}
            {items.map((it, i) => (
              <circle key={i} cx={sx(it.x)} cy={sy(it.y)} r={hover === i ? 7.5 : 6} fill={seriesColor(0)} stroke="var(--panel)" strokeWidth={2} />
            ))}
            {items.map((it, i) =>
              labels[i] ? (
                <text key={i} x={labels[i].x} y={labels[i].y} dy="0.35em" textAnchor={labels[i].anchor} className={cx('pointer-events-none text-[11.5px]', hover === i ? 'fill-fg font-semibold' : 'fill-fg-2')}>
                  {shortName(it.name)}
                </text>
              ) : null,
            )}
            {items.map((it, i) => (
              <circle key={i} cx={sx(it.x)} cy={sy(it.y)} r={14} fill="transparent" className="cursor-default" onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover((x) => (x === i ? null : x))} onClick={() => setHover((x) => (x === i ? null : i))} />
            ))}
            {/* The axes: what each measures, and the words at its ends. */}
            {str(xa.low) && (
              <text x={plot.x0} y={plot.y1 + 16} className="fill-fg-3 text-[11px]">
                {str(xa.low)}
              </text>
            )}
            {xLabel && (
              <text x={sx(50)} y={plot.y1 + 16} textAnchor="middle" className="fill-fg-2 text-[11.5px] font-semibold">
                {`${xLabel} →`}
              </text>
            )}
            {str(xa.high) && (
              <text x={plot.x1} y={plot.y1 + 16} textAnchor="end" className="fill-fg-3 text-[11px]">
                {str(xa.high)}
              </text>
            )}
            {str(ya.low) && (
              <text x={12} y={plot.y1} textAnchor="start" transform={`rotate(-90 12 ${plot.y1})`} className="fill-fg-3 text-[11px]">
                {str(ya.low)}
              </text>
            )}
            {yLabel && (
              <text x={12} y={sy(50)} textAnchor="middle" transform={`rotate(-90 12 ${sy(50)})`} className="fill-fg-2 text-[11.5px] font-semibold">
                {`${yLabel} →`}
              </text>
            )}
            {str(ya.high) && (
              <text x={12} y={plot.y0} textAnchor="end" transform={`rotate(-90 12 ${plot.y0})`} className="fill-fg-3 text-[11px]">
                {str(ya.high)}
              </text>
            )}
          </svg>
        )}
        {h && (h.note || h.name.length > 26) && (
          <div className="pointer-events-none absolute z-10 max-w-[240px] rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-[12px] shadow-pop" style={{ left: clamp(sx(h.x) + 12, 4, Math.max(4, width - 244)), top: sy(h.y) > H / 2 ? sy(h.y) - 64 : sy(h.y) + 14 }}>
            <div className="font-semibold text-fg">{h.name}</div>
            {h.note && <div className="mt-0.5 leading-snug text-fg-2">{h.note}</div>}
          </div>
        )}
      </div>
    </Card>
  );
}

// ---- SWOT -------------------------------------------------------------------------------------------------------------

const SWOT: { key: string; letter: string; label: () => string; tone: Tone }[] = [
  { key: 'strengths', letter: 'S', label: () => tr('Strengths'), tone: 'good' },
  { key: 'weaknesses', letter: 'W', label: () => tr('Weaknesses'), tone: 'warn' },
  { key: 'opportunities', letter: 'O', label: () => tr('Opportunities'), tone: 'info' },
  { key: 'threats', letter: 'T', label: () => tr('Threats'), tone: 'bad' },
];

function Swot({ data }: { data: Data }) {
  const src = isObj(data.swot) ? data.swot : data;
  return (
    <Card>
      <Head title={data.subject ?? data.title} />
      <div className="grid gap-2.5 @md:grid-cols-2">
        {SWOT.map((q) => {
          const items = listOf(src[q.key] ?? src[q.key.charAt(0)]);
          const fill = TONE_FILL[q.tone];
          return (
            <div key={q.key} className="min-w-0 rounded-xl p-3.5" style={{ background: mix(fill, 7) }}>
              <div className="mb-2 flex items-center gap-2">
                <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md text-[12.5px] font-bold', TONE[q.tone])}>{q.letter}</span>
                <span className="font-semibold text-fg">{q.label()}</span>
              </div>
              {items.length > 0 ? (
                <ul className="m-0 list-none space-y-1.5 p-0">
                  {items.map((x, i) => (
                    <li key={i} className="flex gap-2 text-[13.5px] leading-snug text-fg-2">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: fill }} />
                      <Md text={textOf(x, 'text', 'point', 'title')} inline className="min-w-0" />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-[13px] text-fg-3">—</div>
              )}
            </div>
          );
        })}
      </div>
      {str(data.summary ?? data.verdict) && (
        <div className="mt-3 rounded-lg bg-bg-2 px-3 py-2 text-[13.5px]">
          <Md text={data.summary ?? data.verdict} inline />
        </div>
      )}
    </Card>
  );
}

// ---- a decision tree -----------------------------------------------------------------------------------------------------

interface DtOption {
  label: string;
  next: string;
}
interface DtNode {
  id: string;
  question: string;
  note: string;
  options: DtOption[];
  result: string;
  tone: Tone;
  image: string;
  links: { label: string; url: string }[];
}

/** Markdown as plain words, for the message box: no stars, backticks or link addresses. */
const plainMd = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();

/** The nodes, read leniently: an answer that ends in a result of its own (no `next`) becomes an end node of its own. */
function dtNodes(v: unknown): DtNode[] {
  const out: DtNode[] = [];
  arr(v)
    .filter(isObj)
    .forEach((n, i) => {
      const id = str(n.id).trim() || `#${i}`;
      const extra: DtNode[] = [];
      const options = arr(n.options ?? n.answers ?? n.choices)
        .map((o, k) => {
          if (!isObj(o)) return { label: str(o), next: '' };
          const label = textOf(o, 'label', 'text', 'answer', 'name');
          const next = str(o.next ?? o.to ?? o.goto).trim();
          if (!next && str(o.result)) {
            extra.push({ id: `${id}>${k}`, question: '', note: '', options: [], result: str(o.result), tone: toneOf(o.tone), image: '', links: [] });
            return { label, next: `${id}>${k}` };
          }
          return { label, next };
        })
        .filter((o) => o.label);
      out.push({
        id,
        question: str(n.question ?? n.ask),
        note: str(n.note ?? n.hint),
        options,
        result: str(n.result ?? n.outcome),
        tone: toneOf(n.tone),
        image: str(n.image),
        links: arr(n.links)
          .map((l) => (isObj(l) ? { label: textOf(l, 'label', 'title', 'name'), url: str(l.url ?? l.href) } : { label: '', url: str(l) }))
          .filter((l) => /^https?:\/\//i.test(l.url)),
      });
      out.push(...extra);
    });
  return out;
}

const END_ICON: Record<Tone, LucideIcon> = { good: CircleCheck, warn: TriangleAlert, bad: CircleX, info: Info, accent: Flag, neutral: Flag };
const TONE_TEXT: Record<Tone, string> = { good: 'text-ok', warn: 'text-warn', bad: 'text-err', info: 'text-info', accent: 'text-accent', neutral: 'text-fg-3' };

function DecisionTree({ data, done }: { data: Data; done: boolean }) {
  const nodes = dtNodes(data.nodes ?? data.steps);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const first = byId.get(str(data.start).trim()) ?? nodes[0];
  const [picks, setPicks] = useKept<number[]>('path', []);
  const ask = useAsk();
  // The path so far: the answers kept, followed from the first node for as long as they lead somewhere.
  const trail: { node: DtNode; pick: number }[] = [];
  let cur = first;
  for (const p of done && Array.isArray(picks) ? picks : []) {
    const next = cur && typeof p === 'number' ? byId.get(cur.options[p]?.next ?? '') : undefined;
    if (!cur || !next || trail.length >= 80) break;
    trail.push({ node: cur, pick: p });
    cur = next;
  }
  const title = str(data.title);
  if (!cur) return <Card>{title ? <Head title={title} className="mb-0" /> : null}</Card>;
  const end = !cur.options.length;
  const go = (path: number[]) => done && setPicks(path);
  const taken = trail.map((t) => t.pick);
  const send = () =>
    ask(
      [
        title,
        ...trail.map((t) => `- ${plainMd(t.node.question) || '…'} → ${t.node.options[t.pick].label}`),
        cur.result ? `${tr('Result:')} ${plainMd(cur.result)}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  const Icon = END_ICON[cur.tone];
  const backAndOver = trail.length > 0 && (
    <div className="flex flex-wrap items-center gap-2">
      <Btn icon={<ChevronLeft size={14} />} onClick={() => go(taken.slice(0, -1))}>
        {tr('Back')}
      </Btn>
      <Btn icon={<RotateCcw size={13} />} onClick={() => go([])}>
        {tr('Start over')}
      </Btn>
    </div>
  );
  return (
    <Card>
      <Head title={title} />
      {trail.length > 0 && (
        <ol className="m-0 mb-3 flex list-none flex-wrap items-center gap-x-1 gap-y-1.5 p-0 text-[12.5px]" aria-label={tr('Your answers')}>
          {trail.map((t, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="shrink-0 text-fg-3" aria-hidden />}
              <button
                type="button"
                onClick={() => go(taken.slice(0, i))}
                title={`${tr('Change this answer')}: ${plainMd(t.node.question)}`}
                className="max-w-[240px] truncate rounded-full bg-bg-2 px-2.5 py-0.5 font-medium text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg"
              >
                {t.node.options[t.pick].label}
              </button>
            </li>
          ))}
        </ol>
      )}
      {!end && (
        <div className="rounded-xl bg-bg-1 p-4">
          <div className="mb-1 text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{tr('Question {0}').replace('{0}', String(trail.length + 1))}</div>
          {cur.question && <Md text={cur.question} className="text-[15px] leading-snug font-medium text-fg" />}
          {cur.note && <Md text={cur.note} className="mt-1 text-[13px] text-fg-3" />}
          {cur.image && <Pic src={cur.image} alt={plainMd(cur.question)} className="mt-3 aspect-[16/9] max-h-64 w-full rounded-lg" />}
          <div className="mt-3 grid gap-2">
            {cur.options.map((o, k) => {
              const leads = byId.has(o.next);
              const off = done && !leads;
              return (
                <button
                  key={k}
                  type="button"
                  disabled={!done || !leads}
                  onClick={() => go([...taken, k])}
                  title={off ? tr('This answer leads nowhere') : undefined}
                  className={cx(
                    'group/o flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-left text-[14px] font-medium text-fg transition-colors',
                    done && leads ? 'hover:border-accent/50 hover:bg-accent-soft' : 'cursor-default',
                    off && 'opacity-55',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <Md text={o.label} inline />
                  </span>
                  <ChevronRight size={16} className={cx('shrink-0 text-fg-3 transition-transform', done && leads && 'group-hover/o:translate-x-0.5 group-hover/o:text-accent')} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      )}
      {end && (
        <div className="rounded-xl border p-4" style={{ background: mix(TONE_FILL[cur.tone], 8), borderColor: mix(TONE_FILL[cur.tone], 30) }}>
          <div className="flex items-start gap-3">
            <Icon size={20} className={cx('mt-0.5 shrink-0', TONE_TEXT[cur.tone])} />
            <div className="min-w-0 flex-1">
              {cur.result ? <Md text={cur.result} className="text-[14.5px] text-fg" /> : <p className="aui-p text-[14px] text-fg-2">{tr('That is the end of this path.')}</p>}
              {cur.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  {cur.links.map((l, i) => (
                    <LinkOut key={i} url={l.url}>
                      {l.label || undefined}
                    </LinkOut>
                  ))}
                </div>
              )}
            </div>
          </div>
          {cur.image && <Pic src={cur.image} alt="" className="mt-3 aspect-[16/9] max-h-64 w-full rounded-lg" />}
        </div>
      )}
      {done && (trail.length > 0 || end) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {backAndOver || <span />}
          {end && trail.length > 0 && (
            <Btn primary icon={<MessageSquarePlus size={14} />} onClick={send}>
              {tr('Send my answers')}
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}

// ---- a random picker ------------------------------------------------------------------------------------------------------

interface PickOption {
  label: string;
  weight: number;
  note: string;
}

/** A random number from 0 up to 1, from the browser's strong source when it has one. */
function rand(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  } catch {
    return Math.random();
  }
}

/** An index picked at random, each as likely as its weight (all alike when none has any). */
function pickIndex(weights: number[]): number {
  const total = weights.reduce((m, w) => m + w, 0);
  if (!(total > 0)) return Math.floor(rand() * weights.length);
  let x = rand() * total;
  let last = 0;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    last = i;
    x -= weights[i];
    if (x < 0) return i;
  }
  return last;
}

/** The user asked their system for less motion: a spin or a roll lands at once. */
const calm = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Timers that stop with the view: `later` once, `every` again and again; `stop` clears them all. */
function useTimers() {
  const ids = useRef<number[]>([]);
  useEffect(() => () => ids.current.forEach((t) => (clearTimeout(t), clearInterval(t))), []);
  return useMemo(
    () => ({
      later: (fn: () => void, ms: number) => void ids.current.push(window.setTimeout(fn, ms)),
      every: (fn: () => void, ms: number) => void ids.current.push(window.setInterval(fn, ms)),
      stop: () => {
        ids.current.forEach((t) => (clearTimeout(t), clearInterval(t)));
        ids.current = [];
      },
    }),
    [],
  );
}

/** A wheel slice's colour: the palette's hues in order, softened past eight so no two neighbours match. */
const sliceColor = (i: number) => (i < 8 ? seriesColor(i) : mix(seriesColor(i % 8), i < 16 ? 55 : 30));
const SPIN_MS = 4200;

/** The words that go with a pick in the message box: the UI's title first, when it has one. */
const withTitle = (title: string, text: string) => (title ? `${title}\n${text}` : text);

function Wheel({ options, done, title }: { options: PickOption[]; done: boolean; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [last, setLast] = useKept<{ at: number; turn: number } | null>('wheel', null);
  const [spinning, setSpinning] = useState(false);
  const timers = useTimers();
  const ask = useAsk();
  // Slices: the options that can come up (all of them when none has a weight above zero), sized by their weight.
  const some = options.some((o) => o.weight > 0);
  const live = options.map((o, i) => ({ ...o, i, weight: some ? o.weight : 1 })).filter((o) => o.weight > 0);
  const total = live.reduce((m, o) => m + o.weight, 0);
  let a = 0;
  const slices = live.map((o) => {
    const a0 = a;
    a += (o.weight / (total || 1)) * 360;
    return { ...o, a0, a1: a };
  });
  const weighted = new Set(live.map((o) => o.weight)).size > 1;
  const at = last && typeof last.at === 'number' && last.at >= 0 && last.at < options.length ? last.at : null;
  const turn = last && Number.isFinite(last.turn) ? last.turn : 0;
  const shown = !spinning && at !== null ? options[at] : null;
  const D = Math.max(180, Math.min(300, width >= 576 ? 280 : width));
  const c = D / 2;
  const R = c - 4;
  const hub = 15;
  const pt = (deg: number, rr: number) => {
    const t = ((deg - 90) * Math.PI) / 180;
    return `${(c + rr * Math.cos(t)).toFixed(2)},${(c + rr * Math.sin(t)).toFixed(2)}`;
  };
  const slicePath = (a0: number, a1: number) => (a1 - a0 >= 359.99 ? `M${c - R},${c}a${R},${R} 0 1 0 ${2 * R},0a${R},${R} 0 1 0 ${-2 * R},0Z` : `M${c},${c}L${pt(a0, R)}A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${pt(a1, R)}Z`);
  const spin = () => {
    if (!done || spinning || !slices.length) return;
    const s = slices[pickIndex(slices.map((x) => x.weight))];
    // Where in the slice the pointer stops: anywhere but its very edges.
    const theta = s.a0 + (s.a1 - s.a0) * (0.12 + 0.76 * rand());
    const quick = calm();
    const delta = (((360 - theta - (turn % 360)) % 360) + 360) % 360;
    setSpinning(true);
    setLast({ at: s.i, turn: turn + (quick ? 0 : 360 * 5) + delta });
    timers.later(() => setSpinning(false), quick ? 350 : SPIN_MS + 80);
  };
  const maxChars = Math.max(4, Math.floor((R - hub - 20) / 6.6));
  return (
    <div ref={ref} className="flex flex-col items-center gap-5 @xl:flex-row @xl:items-start">
      {width > 0 && slices.length > 0 && (
        <div className="relative shrink-0 [--slice:26%] dark:[--slice:40%]" style={{ width: D, height: D + 6 }}>
          <div className="absolute top-[6px] left-0" style={{ width: D, height: D, transform: `rotate(${turn}deg)`, transition: `transform ${calm() ? 300 : SPIN_MS}ms cubic-bezier(0.15, 0.75, 0.12, 1)` }}>
            <svg width={D} height={D} className="block" role="img" aria-label={slices.map((s) => s.label).join(', ')}>
              {slices.map((s) => {
                const on = shown && s.i === at;
                const mid = (s.a0 + s.a1) / 2;
                // Its name reads from the rim inwards, as far in as the slice is still wide enough for a line of text.
                const inner = Math.max(hub + 8, 14 / Math.max(0.001, ((s.a1 - s.a0) * Math.PI) / 180));
                const chars = Math.min(maxChars, Math.floor((R - 12 - inner) / 6.6));
                const label = s.label.length > chars ? `${s.label.slice(0, Math.max(1, chars - 1))}…` : s.label;
                return (
                  <g key={s.i}>
                    <path d={slicePath(s.a0, s.a1)} style={{ fill: on ? mix(sliceColor(s.i), 62) : `color-mix(in srgb, ${sliceColor(s.i)} var(--slice), var(--panel))` }} stroke="var(--panel)" strokeWidth={2} strokeLinejoin="round" />
                    {chars >= 3 && (
                      <text x={c + R - 12} y={c} dy="0.35em" textAnchor="end" transform={`rotate(${mid - 90} ${c} ${c})`} className={cx('pointer-events-none fill-fg text-[12px]', on && 'font-semibold')}>
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
              <circle cx={c} cy={c} r={R} fill="none" stroke="var(--line-2)" strokeWidth={1} />
            </svg>
          </div>
          <svg width={D} height={D + 6} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
            <circle cx={c} cy={c + 6} r={hub} fill="var(--panel)" stroke="var(--line-2)" strokeWidth={1.5} />
            <path d={`M${c - 10},0H${c + 10}L${c},20Z`} fill="var(--fg)" stroke="var(--panel)" strokeWidth={2} strokeLinejoin="round" />
          </svg>
        </div>
      )}
      <div className="w-full min-w-0 flex-1">
        {shown ? (
          <div className="rounded-xl bg-accent-soft px-4 py-3">
            <div className="text-[11.5px] font-semibold tracking-wide text-accent uppercase">{tr('The wheel picked')}</div>
            <div className="mt-0.5 text-[20px] leading-tight font-semibold text-fg">{shown.label}</div>
            {shown.note && <Md text={shown.note} className="mt-1 text-[13px] text-fg-2" />}
          </div>
        ) : (
          spinning && <div className="rounded-xl bg-bg-1 px-4 py-3 text-[14px] font-medium text-fg-3">{tr('Spinning…')}</div>
        )}
        {done && slices.length > 0 && (
          <div className={cx('flex flex-wrap items-center gap-2', (shown || spinning) && 'mt-3')}>
            <Btn primary={!shown} icon={<RotateCw size={13} />} onClick={spin} disabled={spinning}>
              {at === null ? tr('Spin') : tr('Spin again')}
            </Btn>
            {shown && (
              <Btn primary icon={<MessageSquarePlus size={14} />} onClick={() => ask(withTitle(title, tr('The wheel picked: {0}').replace('{0}', shown.label)))}>
                {tr('Send it')}
              </Btn>
            )}
          </div>
        )}
        {options.length > 0 && (
          <ul className={cx('m-0 list-none space-y-0.5 p-0', (done || shown || spinning) && 'mt-3')}>
            {options.map((o, i) => {
              const s = slices.find((x) => x.i === i);
              return (
                <li key={i} className={cx('flex items-start gap-2.5 rounded-lg px-2 py-1 text-[13px]', shown && i === at && 'bg-bg-2')}>
                  <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s ? mix(sliceColor(i), 62) : 'var(--bg-3)' }} />
                  <span className="min-w-0 flex-1">
                    <span className={cx('font-medium', s ? 'text-fg' : 'text-fg-3 line-through')}>{o.label}</span>
                    {o.note && <Md text={o.note} inline className="block text-[12px] text-fg-3" />}
                  </span>
                  {weighted && s && <span className="shrink-0 text-[12px] text-fg-3 tabular-nums">{fmtNum((s.weight / total) * 100, { maximumFractionDigits: 0 })}%</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Where a six-sided die's pips sit, from its top left (0 to 1 across and down). */
const PIPS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.28, 0.28], [0.72, 0.72]],
  3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
  4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
  6: [[0.28, 0.24], [0.72, 0.24], [0.28, 0.5], [0.72, 0.5], [0.28, 0.76], [0.72, 0.76]],
};

function Die({ value, sides, tilt }: { value: number; sides: number; tilt?: number }) {
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" className="block shrink-0" style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined} role="img" aria-label={String(value)}>
      <rect x={2} y={2} width={60} height={60} rx={13} fill="var(--panel)" stroke="var(--line-2)" strokeWidth={2} />
      {sides === 6 && PIPS[value] ? (
        PIPS[value].map(([x, y], i) => <circle key={i} cx={2 + x * 60} cy={2 + y * 60} r={5.4} fill="var(--fg)" />)
      ) : (
        <text x={32} y={33} dy="0.35em" textAnchor="middle" className="fill-fg text-[24px] font-semibold tabular-nums">
          {value}
        </text>
      )}
    </svg>
  );
}

function DiceRoll({ count, sides, done, title }: { count: number; sides: number; done: boolean; title: string }) {
  const [last, setLast] = useKept<number[] | null>('dice', null);
  const [tumble, setTumble] = useState<number[] | null>(null);
  const timers = useTimers();
  const ask = useAsk();
  const throwAll = () => Array.from({ length: count }, () => 1 + Math.floor(rand() * sides));
  const roll = () => {
    if (!done || tumble) return;
    const final = throwAll();
    if (calm()) return setLast(final);
    setTumble(throwAll());
    timers.every(() => setTumble(throwAll()), 75);
    timers.later(() => {
      timers.stop();
      setTumble(null);
      setLast(final);
    }, 700);
  };
  const kept = Array.isArray(last) && last.length === count && last.every((v) => typeof v === 'number' && v >= 1 && v <= sides) ? last : null;
  const faces = tumble ?? kept ?? Array.from({ length: count }, (_, i) => Math.min(sides, i + 1));
  const sum = kept ? kept.reduce((m, v) => m + v, 0) : null;
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className={cx('flex flex-wrap justify-center gap-3', !kept && !tumble && 'opacity-45')}>
        {faces.map((v, i) => (
          <Die key={i} value={v} sides={sides} tilt={tumble ? ((v * 47 + i * 29) % 36) - 18 : 0} />
        ))}
      </div>
      {kept && !tumble && count > 1 && (
        <div className="text-[14px] text-fg-2">
          {tr('Total')} <span className="text-[20px] font-semibold text-fg tabular-nums">{fmtNum(sum)}</span>
        </div>
      )}
      {done && (
        <div className="flex flex-wrap justify-center gap-2">
          <Btn primary={!kept} icon={<Dices size={14} />} onClick={roll} disabled={!!tumble}>
            {kept ? tr('Roll again') : tr('Roll')}
          </Btn>
          {kept && !tumble && (
            <Btn primary icon={<MessageSquarePlus size={14} />} onClick={() => ask(withTitle(title, tr('I rolled {0}').replace('{0}', `${kept.join(' + ')}${count > 1 ? ` = ${sum}` : ''}`)))}>
              {tr('Send it')}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

function CoinFlip({ faces, done, title }: { faces: PickOption[]; done: boolean; title: string }) {
  const [last, setLast] = useKept<{ side: number; turn: number } | null>('coin', null);
  const [flipping, setFlipping] = useState(false);
  const timers = useTimers();
  const ask = useAsk();
  const turn = last && Number.isFinite(last.turn) ? last.turn : 0;
  const side = last && (last.side === 0 || last.side === 1) ? last.side : null;
  const flip = () => {
    if (!done || flipping) return;
    const next = pickIndex(faces.map((f) => f.weight));
    const up = Math.round(turn / 180) % 2;
    const quick = calm();
    setFlipping(true);
    setLast({ side: next, turn: turn + (quick ? 0 : 360 * 4) + (next !== up ? 180 : 0) });
    timers.later(() => setFlipping(false), quick ? 250 : 1700);
  };
  const face = (f: PickOption, back: boolean) => (
    <div className={cx('absolute inset-0 grid place-items-center rounded-full border-2 border-accent/50 bg-accent-soft p-1.5 [backface-visibility:hidden]', back && '[transform:rotateY(180deg)]')}>
      <div className="grid h-full w-full place-items-center rounded-full border border-dashed border-accent/40 bg-panel/40 px-3 text-center">
        <span className={cx('line-clamp-3 leading-tight font-semibold text-accent', f.label.length > 10 ? 'text-[13px]' : 'text-[19px]')}>{f.label}</span>
      </div>
    </div>
  );
  const shown = side !== null && !flipping ? faces[side] : null;
  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="[perspective:700px]">
        <div className="relative h-32 w-32 [transform-style:preserve-3d]" style={{ transform: `rotateY(${turn}deg)`, transition: `transform ${calm() ? 200 : 1600}ms cubic-bezier(0.2, 0.7, 0.2, 1)` }}>
          {face(faces[0], false)}
          {face(faces[1], true)}
        </div>
      </div>
      {shown && (
        <div className="text-center">
          <div className="text-[20px] font-semibold text-fg">{shown.label}</div>
          {shown.note && <Md text={shown.note} className="mt-0.5 text-[13px] text-fg-2" />}
        </div>
      )}
      {done && (
        <div className="flex flex-wrap justify-center gap-2">
          <Btn primary={side === null} icon={<Coins size={14} />} onClick={flip} disabled={flipping}>
            {side === null ? tr('Flip') : tr('Flip again')}
          </Btn>
          {shown && (
            <Btn primary icon={<MessageSquarePlus size={14} />} onClick={() => ask(withTitle(title, tr('The coin came up: {0}').replace('{0}', shown.label)))}>
              {tr('Send it')}
            </Btn>
          )}
        </div>
      )}
    </div>
  );
}

function DrawNames({ options, count, done, title }: { options: PickOption[]; count: number; done: boolean; title: string }) {
  const [last, setLast] = useKept<number[] | null>('drawn', null);
  const [shuffle, setShuffle] = useState<number[] | null>(null);
  const timers = useTimers();
  const ask = useAsk();
  const k = Math.max(1, Math.min(count, options.length));
  /** `k` different ones, each as likely as its weight among those still in the hat. */
  const drawSome = () => {
    const pool = options.map((o, i) => ({ i, w: o.weight }));
    const some = pool.some((p) => p.w > 0);
    const out: number[] = [];
    while (out.length < k && pool.length) {
      const j = pickIndex(pool.map((p) => (some ? p.w : 1)));
      out.push(pool[j].i);
      pool.splice(j, 1);
    }
    return out;
  };
  const draw = () => {
    if (!done || shuffle || !options.length) return;
    const final = drawSome();
    if (calm()) return setLast(final);
    setShuffle(drawSome());
    timers.every(() => setShuffle(drawSome()), 70);
    timers.later(() => {
      timers.stop();
      setShuffle(null);
      setLast(final);
    }, 900);
  };
  const kept = Array.isArray(last) && last.length > 0 && last.every((i) => typeof i === 'number' && i >= 0 && i < options.length) ? last : null;
  const slots = shuffle ?? kept;
  return (
    <div>
      {slots && (
        <ol className={cx('m-0 grid list-none gap-2 p-0', slots.length > 1 && '@md:grid-cols-2')}>
          {slots.map((i, n) => (
            <li key={n} className={cx('flex min-w-0 items-start gap-3 rounded-xl px-3.5 py-2.5', shuffle ? 'bg-bg-1' : 'bg-accent-soft')}>
              {slots.length > 1 && <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-panel text-[12px] font-semibold text-fg-2 tabular-nums">{n + 1}</span>}
              <span className="min-w-0 flex-1">
                <span className={cx('block truncate text-[16px] font-semibold', shuffle ? 'text-fg-3' : 'text-fg')}>{options[i]?.label}</span>
                {!shuffle && options[i]?.note && <Md text={options[i].note} inline className="block text-[12.5px] text-fg-2" />}
              </span>
            </li>
          ))}
        </ol>
      )}
      {done && options.length > 0 && (
        <div className={cx('flex flex-wrap items-center gap-2', slots && 'mt-3')}>
          <Btn primary={!kept} icon={<Shuffle size={14} />} onClick={draw} disabled={!!shuffle}>
            {kept ? tr('Draw again') : k > 1 ? tr('Draw {0}').replace('{0}', String(k)) : tr('Draw')}
          </Btn>
          {kept && !shuffle && (
            <Btn primary icon={<MessageSquarePlus size={14} />} onClick={() => ask(withTitle(title, tr('Drawn: {0}').replace('{0}', kept.map((i) => options[i].label).join(', '))))}>
              {tr('Send it')}
            </Btn>
          )}
        </div>
      )}
      {options.length > 0 && (
        <Section title={tr('In the hat')} className="mt-4" aside={<span className="text-[12px] text-fg-3 tabular-nums">{options.length}</span>}>
          <div className="flex flex-wrap gap-1.5">
            {options.map((o, i) => {
              const out = !shuffle && kept?.includes(i);
              const never = o.weight <= 0 && options.some((x) => x.weight > 0);
              return (
                <span key={i} title={o.note ? plainMd(o.note) : undefined} className={cx('inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-0.5 text-[12.5px]', out ? 'border-accent/40 bg-accent-soft font-semibold text-accent' : never ? 'border-line text-fg-3 line-through' : 'border-line text-fg-2')}>
                  {o.label}
                </span>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

function Picker({ data, done }: { data: Data; done: boolean }) {
  const k = str(data.kind ?? data.type).trim().toLowerCase();
  const kind = /^(dice|die|roll)$/.test(k) ? 'dice' : /^(coin|flip)$/.test(k) ? 'coin' : /^(draw|hat|names|raffle|lottery)$/.test(k) ? 'draw' : 'wheel';
  const options: PickOption[] = arr(data.options ?? data.items ?? data.names)
    .map((o) => (isObj(o) ? { label: textOf(o, 'label', 'name', 'title', 'text'), weight: Math.max(0, num(o.weight) ?? 1), note: str(o.note) } : { label: str(o), weight: 1, note: '' }))
    .filter((o) => o.label);
  const title = str(data.title);
  const count = Math.round(num(data.count) ?? 1);
  if (kind === 'dice') {
    const n = Math.max(1, Math.min(6, count));
    const sides = Math.max(2, Math.min(100, Math.round(num(data.sides) ?? 6)));
    return (
      <Card>
        <Head title={title} sub={n > 1 ? tr('{0} dice with {1} sides').replace('{0}', String(n)).replace('{1}', String(sides)) : sides !== 6 ? tr('A die with {0} sides').replace('{0}', String(sides)) : undefined} />
        <DiceRoll count={n} sides={sides} done={done} title={title} />
      </Card>
    );
  }
  if (kind === 'coin') {
    const faces = options.length >= 2 ? options.slice(0, 2) : [{ label: tr('Heads'), weight: 1, note: '' }, { label: tr('Tails'), weight: 1, note: '' }];
    return (
      <Card>
        <Head title={title} />
        <CoinFlip faces={faces} done={done} title={title} />
      </Card>
    );
  }
  return (
    <Card>
      <Head title={title} sub={kind === 'draw' && options.length > 1 && count > 1 ? tr('Draws {0} of {1}').replace('{0}', String(Math.min(count, options.length))).replace('{1}', String(options.length)) : undefined} />
      {kind === 'draw' ? <DrawNames options={options} count={count} done={done} title={title} /> : <Wheel options={options} done={done} title={title} />}
    </Card>
  );
}

// ---- a Venn diagram ----------------------------------------------------------------------------------------------------------

interface Circle {
  x: number;
  y: number;
  r: number;
}

/** Which circles a point is in, one bit each. */
const maskAt = (cs: Circle[], x: number, y: number) => cs.reduce((m, c, i) => (Math.hypot(x - c.x, y - c.y) < c.r ? m | (1 << i) : m), 0);

/** The circles for two or three sets (or one, while the rest stream in), in a box `w` wide: their places and the box's height. */
function vennLayout(n: number, w: number): { circles: Circle[]; h: number; top: number } {
  const top = 26;
  if (n <= 1) {
    const r = Math.min(w * 0.3, 105);
    return { circles: [{ x: w / 2, y: top + r, r }], h: top + 2 * r + 6, top };
  }
  if (n === 2) {
    const r = Math.min(w / 3.3, 122);
    const d = r * 1.15;
    return { circles: [{ x: w / 2 - d / 2, y: top + r, r }, { x: w / 2 + d / 2, y: top + r, r }], h: top + 2 * r + 6, top };
  }
  const r = Math.min(w / 3.25, 112);
  const d = r * 1.1;
  const y0 = top + r;
  return {
    circles: [
      { x: w / 2 - d / 2, y: y0, r },
      { x: w / 2 + d / 2, y: y0, r },
      { x: w / 2, y: y0 + d * 0.866, r },
    ],
    h: y0 + d * 0.866 + r + 26,
    top,
  };
}

/**
 * Where each region's words go: the point inside it farthest from every circle's edge (found on a grid), with how far it
 * is from the region's edge across and up and down, for deciding what fits there.
 */
function regionSpots(cs: Circle[]) {
  const spots = new Map<number, { x: number; y: number; clear: number }>();
  if (!cs.length) return spots;
  const x0 = Math.min(...cs.map((c) => c.x - c.r));
  const x1 = Math.max(...cs.map((c) => c.x + c.r));
  const y0 = Math.min(...cs.map((c) => c.y - c.r));
  const y1 = Math.max(...cs.map((c) => c.y + c.r));
  for (let y = y0; y <= y1; y += 3)
    for (let x = x0; x <= x1; x += 3) {
      let m = 0;
      let clear = Infinity;
      cs.forEach((c, i) => {
        const d = Math.hypot(x - c.x, y - c.y);
        if (d < c.r) m |= 1 << i;
        clear = Math.min(clear, Math.abs(c.r - d));
      });
      if (!m) continue;
      const s = spots.get(m);
      if (!s || clear > s.clear) spots.set(m, { x, y, clear });
    }
  return spots;
}

/** How far a region reaches across from a point, on each side, at a height (to the first change of region). */
function spanAt(cs: Circle[], m: number, x: number, y: number): number {
  let l = 0;
  let r = 0;
  while (l < 400 && maskAt(cs, x - l - 2, y) === m) l += 2;
  while (r < 400 && maskAt(cs, x + r + 2, y) === m) r += 2;
  return Math.min(l, r);
}

/** The sets a region belongs to, as dots in their colours. */
function SetDots({ mask, n }: { mask: number; n: number }) {
  return (
    <span className="inline-flex shrink-0 -space-x-1" style={{ width: 12 + (n - 1) * 8 }} aria-hidden>
      {Array.from({ length: n }, (_, i) => (mask & (1 << i) ? <span key={i} className="h-3 w-3 rounded-full ring-2 ring-panel" style={{ background: seriesColor(i) }} /> : null))}
    </span>
  );
}

function Venn({ data, done }: { data: Data; done: boolean }) {
  const uid = useId();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [listHover, setListHover] = useState<number | null>(null);
  const [pin, setPin] = useState<number | null>(null);
  const sets = arr(data.sets ?? data.circles)
    .slice(0, 3)
    .map((s, i) => (isObj(s) ? { name: textOf(s, 'name', 'label', 'title') || String.fromCharCode(65 + i), items: listOf(s.items ?? s.only) } : { name: str(s), items: [] as unknown[] }));
  const n = sets.length;
  // Each region by the sets it is in (one bit each): a set's own items, then the overlaps'.
  const regions = new Map<number, { label: string; items: unknown[] }>();
  sets.forEach((s, i) => regions.set(1 << i, { label: '', items: s.items }));
  for (const o of arr(data.overlaps ?? data.intersections).filter(isObj)) {
    const idx = [...new Set(arr(o.sets ?? o.of).map((x) => (typeof x === 'number' ? x : sets.findIndex((s) => s.name.toLowerCase() === str(x).trim().toLowerCase()))))].filter((x) => Number.isInteger(x) && x >= 0 && x < n);
    if (idx.length < 2) continue;
    const m = idx.reduce((a, x) => a | (1 << x), 0);
    const had = regions.get(m);
    regions.set(m, { label: had?.label || str(o.label ?? o.name), items: [...(had?.items ?? []), ...listOf(o.items)] });
  }
  const order = [1, 2, 4, 3, 5, 6, 7].filter((m) => m < 1 << n && (m & (m - 1) ? regions.has(m) : true));
  const nameOf = (m: number) => {
    const label = regions.get(m)?.label;
    if (label) return label;
    const names = sets.filter((_, i) => m & (1 << i)).map((s) => s.name);
    if (names.length === 1) return tr('Only {0}').replace('{0}', names[0]);
    if (names.length === 3) return tr('All three');
    return tr('{0} and {1}').replace('{0}', names[0]).replace('{1}', names[1]);
  };
  const W = Math.max(200, Math.min(width, 420));
  const { circles, h, top } = useMemo(() => vennLayout(n, W), [n, W]);
  const spots = useMemo(() => regionSpots(circles), [circles]);
  // Each region's items written inside it when every region's fit; else how many there are.
  const textOfItem = (x: unknown) => plainMd(textOf(x, 'text', 'name', 'title', 'label'));
  const fits = useMemo(() => {
    for (const m of order) {
      const r = regions.get(m);
      const s = spots.get(m);
      if (!r || !s) continue;
      const lines = [...(r.label && m & (m - 1) ? [r.label] : []), ...r.items.map(textOfItem)];
      if (!lines.length) continue;
      if (lines.length > 4) return false;
      const blockH = lines.length * 14;
      const widest = Math.max(...lines.map((l) => l.length * 6.3));
      for (const dy of [-blockH / 2 + 4, 0, blockH / 2 - 4]) if (widest / 2 + 4 > spanAt(circles, m, s.x, s.y + dy)) return false;
      if (maskAt(circles, s.x, s.y - blockH / 2 - 2) !== m || maskAt(circles, s.x, s.y + blockH / 2 + 2) !== m) return false;
    }
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circles, spots, JSON.stringify(order.map((m) => regions.get(m)))]);
  const focus = hover ?? (done ? pin : null);
  const lit = hover ?? listHover ?? (done ? pin : null);
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const m = maskAt(circles, e.clientX - b.left, e.clientY - b.top);
    setHover(m || null);
  };
  const nameSpots = circles.map((c, i) => (n === 3 && i === 2 ? { x: c.x, y: c.y + c.r + 18 } : { x: n === 1 ? c.x : c.x + (i === 0 ? -0.32 : 0.32) * c.r, y: top - 9 }));
  const nameMax = Math.max(6, Math.floor((circles[0]?.r ?? 80) * 1.55 / 7));
  const shown = focus !== null ? [focus] : order;
  return (
    <Card>
      <Head title={data.title} />
      <div className="grid items-start gap-x-6 gap-y-3 @xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div ref={ref} className="min-w-0">
          {width > 0 && n > 0 && (
            <svg width={W} height={h} className="mx-auto block touch-manipulation overflow-visible" role="img" aria-label={sets.map((s) => s.name).join(', ')} onPointerMove={onMove} onPointerLeave={() => setHover(null)} onClick={(e) => {
              if (!done) return;
              const b = e.currentTarget.getBoundingClientRect();
              const m = maskAt(circles, e.clientX - b.left, e.clientY - b.top);
              setPin((p) => (!m || p === m ? null : m));
            }}>
              <defs>
                {circles.map((c, i) => (
                  <clipPath key={i} id={`${uid}c${i}`}>
                    <circle cx={c.x} cy={c.y} r={c.r} />
                  </clipPath>
                ))}
                {lit !== null && (
                  <mask id={`${uid}m`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={h}>
                    <rect x={0} y={0} width={W} height={h} fill="#fff" />
                    {circles.map((c, i) => (lit & (1 << i) ? null : <circle key={i} cx={c.x} cy={c.y} r={c.r} fill="#000" />))}
                  </mask>
                )}
              </defs>
              {circles.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={seriesColor(i)} fillOpacity={0.13} />
              ))}
              {lit !== null && (
                <g mask={`url(#${uid}m)`} className="pointer-events-none">
                  {circles.reduce<React.ReactNode>(
                    (inner, _, i) => (lit & (1 << i) ? <g clipPath={`url(#${uid}c${i})`}>{inner}</g> : inner),
                    <rect x={0} y={0} width={W} height={h} fill="var(--fg)" fillOpacity={0.17} />,
                  )}
                </g>
              )}
              {circles.map((c, i) => (
                <circle key={i} cx={c.x} cy={c.y} r={c.r} fill="none" stroke={seriesColor(i)} strokeWidth={2} />
              ))}
              {sets.map((s, i) => (
                <text key={i} x={nameSpots[i].x} y={nameSpots[i].y} textAnchor="middle" className="pointer-events-none fill-fg text-[13px] font-semibold">
                  {s.name.length > nameMax ? `${s.name.slice(0, nameMax - 1)}…` : s.name}
                </text>
              ))}
              {order.map((m) => {
                const r = regions.get(m);
                const s = spots.get(m);
                if (!r || !s) return null;
                const label = r.label && m & (m - 1) ? r.label : '';
                if (fits) {
                  const lines = [...(label ? [{ t: label, b: true }] : []), ...r.items.map((x) => ({ t: textOfItem(x), b: false }))];
                  return (
                    <text key={m} x={s.x} y={s.y - ((lines.length - 1) * 14) / 2} textAnchor="middle" className="pointer-events-none text-[11.5px]">
                      {lines.map((l, k) => (
                        <tspan key={k} x={s.x} dy={k ? 14 : 0} dominantBaseline="central" className={l.b ? 'fill-fg font-semibold' : 'fill-fg-2'}>
                          {l.t}
                        </tspan>
                      ))}
                    </text>
                  );
                }
                const roomy = s.clear > 20;
                const room = Math.floor((spanAt(circles, m, s.x, s.y + 12) * 2 - 6) / 6);
                const short = label && room >= 4 ? (label.length > room ? `${label.slice(0, room - 1)}…` : label) : '';
                return (
                  <g key={m} className="pointer-events-none">
                    {r.items.length > 0 && (
                      <text x={s.x} y={short && roomy ? s.y - 6 : s.y} dy="0.35em" textAnchor="middle" className={cx('fill-fg font-semibold tabular-nums', lit === m ? 'text-[17px]' : 'text-[15px]')}>
                        {r.items.length}
                      </text>
                    )}
                    {short && (
                      <text x={s.x} y={r.items.length && roomy ? s.y + 11 : s.y} dy="0.35em" textAnchor="middle" className="fill-fg-2 text-[11px]">
                        {short}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
        {order.some((m) => regions.get(m)?.items.length || regions.get(m)?.label) && (
          <div className="min-w-0">
            {focus !== null && pin !== null && done && hover === null && (
              <button type="button" onClick={() => setPin(null)} className="mb-1 inline-flex items-center gap-1 text-[12.5px] font-medium text-fg-3 transition-colors hover:text-fg">
                <ChevronLeft size={13} />
                {tr('All of it')}
              </button>
            )}
            <ul className="m-0 list-none space-y-1 p-0">
              {shown.map((m) => {
                const r = regions.get(m);
                return (
                  <li key={m} onPointerEnter={() => setListHover(m)} onPointerLeave={() => setListHover(null)} className={cx('rounded-xl px-3 py-2 transition-colors', lit === m ? 'bg-bg-2' : 'hover:bg-bg-1')}>
                    <button
                      type="button"
                      onFocus={() => setListHover(m)}
                      onBlur={() => setListHover(null)}
                      onClick={() => done && setPin((p) => (p === m ? null : m))}
                      aria-pressed={pin === m}
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <SetDots mask={m} n={n} />
                      <span className="min-w-0 flex-1 text-[13px] font-semibold text-fg">{nameOf(m)}</span>
                      {(r?.items.length ?? 0) > 0 && <span className="text-[12px] text-fg-3 tabular-nums">{r!.items.length}</span>}
                    </button>
                    {r && r.items.length > 0 ? (
                      <ul className="m-0 mt-1 list-none space-y-0.5 p-0" style={{ paddingLeft: 20 + (n - 1) * 8 }}>
                        {r.items.map((x, i) => (
                          <li key={i} className="flex gap-2 text-[13px] leading-snug text-fg-2">
                            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-3" />
                            <Md text={textOf(x, 'text', 'name', 'title', 'label')} inline className="min-w-0" />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      focus === m && (
                        <div className="mt-1 text-[12.5px] text-fg-3" style={{ paddingLeft: 20 + (n - 1) * 8 }}>
                          {tr('Nothing here')}
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {str(data.note) && <Md text={data.note} className="mt-3 text-[13px] text-fg-3" />}
    </Card>
  );
}

export const COMPARE_UIS: Record<string, AnswerUiView> = {
  comparison: Comparison,
  'pros-cons': ProsCons,
  'decision-matrix': DecisionMatrix,
  choices: Choices,
  recommendation: Recommendation,
  ranking: Ranking,
  scorecard: Scorecard,
  versus: Versus,
  quadrant: Quadrant,
  swot: Swot,
  'decision-tree': DecisionTree,
  picker: Picker,
  venn: Venn,
};
