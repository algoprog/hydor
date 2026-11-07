// The answer UIs that compare options and help decide: their views, by name (shared/answer-ui/compare.ts has what each takes).
import { Fragment, useState } from 'react';
import { Check, CheckCircle2, MessageSquarePlus, Minus, RotateCcw, ThumbsDown, ThumbsUp, Trophy, X } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx } from '../../ui';
import { useWidth } from '../charts';
import { arr, Btn, Card, Chip, fmtNum, Head, isObj, LinkOut, Md, Meter, num, Pic, Ring, Section, Seg, seriesColor, Stars, str, textOf, TONE, TONE_FILL, useAsk, useKept, withUnit, words, yes, type AnswerUiView, type Data, type Tone } from '../kit';

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
  const anyPic = options.some((o) => str(o.image));
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
          return (
            <label
              key={i}
              className={cx(
                'relative flex min-w-0 overflow-hidden rounded-xl border transition-colors',
                // A picture sits beside the words when the choices are one under the other, above them in a grid.
                anyPic ? (options.length > 1 ? 'flex-row @md:flex-col' : 'flex-row') : 'flex-col',
                done ? 'cursor-pointer' : 'cursor-default',
                on ? 'border-accent bg-accent-soft ring-1 ring-accent' : 'border-line hover:border-line-2 hover:bg-bg-1',
              )}
            >
              <input type={multiple ? 'checkbox' : 'radio'} name={group} checked={on} disabled={!done} onChange={() => pick(i)} className="sr-only" />
              {anyPic && <Pic src={o.image} alt={title} zoom={false} className={cx('min-h-24 w-[34%] max-w-40 shrink-0 self-stretch rounded-none', options.length > 1 && '@md:aspect-[16/9] @md:min-h-0 @md:w-full @md:max-w-none @md:self-auto')} />}
              {yes(o.recommended) && anyPic && (
                <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg shadow-sm">{tr('Recommended')}</span>
              )}
              <div className="flex min-w-0 flex-1 gap-2.5 p-3">
                <PickMark on={on} multiple={multiple} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-fg">{title}</span>
                    {yes(o.recommended) && !anyPic && <Chip tone="accent">{tr('Recommended')}</Chip>}
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
};
