// Conditional formatting, as a side panel (Format → Conditional formatting): the sheet's rules in order (the first
// that holds gives a cell its look, a colour scale or data bars show with it), each with its range and a preview; add
// one for the cells picked, change one (where it applies; a condition and the look it gives, a colour scale of two or
// three colours at the lowest, middle and highest values, or data bars), move it up or down, or delete it.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Bold, Italic, Plus, Strikethrough, Trash2, Underline } from 'lucide-react';
import { cleanRanges, type Cond, type CondRule, type CondStyle, type ScalePoint } from '@shared/sheets';
import { Button, cx, IconButton, Segmented } from '../../../components/ui';
import { COND_CHOICES, CondFields } from './FilterMenu';
import { Row, SidePanel, smallInput } from './Panel';
import { ColorTool } from './Toolbar';
import { Tool } from '../slides/controls';

/** Conditions that look at a range's values together, besides those of one cell. */
const RANGE_CHOICES: typeof COND_CHOICES = [
  { op: 'dup', label: 'Duplicate values', n: 0 },
  { op: 'unique', label: 'Unique values', n: 0 },
  { op: 'top', label: 'Top values', n: 1 },
  { op: 'bottom', label: 'Bottom values', n: 1 },
  { op: 'above', label: 'Above average', n: 0 },
  { op: 'below', label: 'Below average', n: 0 },
];
const ALL_CHOICES = [...COND_CHOICES, ...RANGE_CHOICES];

/** Looks offered first, as Sheets offers them: soft fills with darker words. */
const PRESETS: CondStyle[] = [
  { fill: '#b7e1cd', color: '#0d652d' },
  { fill: '#fce8b2', color: '#7f6000' },
  { fill: '#f4c7c3', color: '#a50e0e' },
  { fill: '#c9daf8', color: '#1c4587' },
  { b: true, color: '#c5221f' },
];

const SCALES: [string, string, string | null][] = [
  ['#f8696b', '#ffeb84', '#63be7b'],
  ['#63be7b', '#ffeb84', '#f8696b'],
  ['#ffffff', '#57bb8a', null],
  ['#ffffff', '#e67c73', null],
  ['#ffffff', '#6d9eeb', null],
];

/** What a rule says, in a few words, for its line in the list. */
function summary(rule: CondRule): string {
  if (rule.scale) return 'Colour scale';
  if (rule.bar) return 'Data bars';
  const w = rule.when;
  const c = ALL_CHOICES.find((x) => x.op === w?.op);
  if (!w || !c) return '';
  if (w.op === 'top' || w.op === 'bottom') return `${c.label}: ${w.a ?? 10}${w.b === '%' ? '%' : ''}`;
  return c.n === 0 ? c.label : c.n === 2 ? `${c.label} ${w.a} and ${w.b}` : `${c.label} ${w.a ?? ''}`;
}

function Preview({ rule }: { rule: CondRule }) {
  if (rule.scale) return <span className="h-6 w-10 shrink-0 rounded-md border border-line" style={{ background: `linear-gradient(90deg, ${rule.scale.min.color}, ${rule.scale.mid?.color ?? rule.scale.max.color}, ${rule.scale.max.color})` }} />;
  if (rule.bar)
    return (
      <span className="relative h-6 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-bg">
        <span className="absolute inset-y-1 left-0 w-3/5 rounded-r-sm opacity-70" style={{ background: rule.bar.color }} />
      </span>
    );
  const s = rule.style ?? {};
  return (
    <span
      className="grid h-6 w-10 shrink-0 place-items-center rounded-md border border-line text-[12px]"
      style={{ background: s.fill, color: s.color, fontWeight: s.b ? 700 : undefined, fontStyle: s.i ? 'italic' : undefined, textDecoration: [s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ') || undefined }}
    >
      123
    </span>
  );
}

export function CondPanel({ rules, picked, narrow, onChange, onClose }: { rules: CondRule[]; picked: string; narrow: boolean; onChange: (rules: CondRule[]) => void; onClose: () => void }) {
  const [at, setAt] = useState<number | null>(rules.length ? null : -1);
  const [draft, setDraft] = useState<CondRule>({ range: picked, when: { op: 'notEmpty' }, style: PRESETS[0] });
  const [rangeText, setRangeText] = useState(picked);
  const editing = at !== null;
  const open = (i: number) => {
    setAt(i);
    const r = i >= 0 ? rules[i] : { range: picked, when: { op: 'notEmpty' } as Cond, style: PRESETS[0] };
    setDraft(r);
    setRangeText(r.range.split(',').join(', '));
  };
  const done = () => {
    const range = cleanRanges(rangeText);
    if (!range) return;
    const rule: CondRule = draft.scale ? { range, scale: draft.scale } : draft.bar ? { range, bar: draft.bar } : { range, when: draft.when, style: draft.style };
    if (!rule.scale && !rule.bar && (!rule.when || !rule.style || !Object.keys(rule.style).length)) return;
    onChange(at !== null && at >= 0 ? rules.map((r, i) => (i === at ? rule : r)) : [...rules, rule]);
    setAt(null);
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const kind: 'one' | 'scale' | 'bar' = draft.scale ? 'scale' : draft.bar ? 'bar' : 'one';
  const style = draft.style ?? {};
  const setStyle = (s: Partial<CondStyle>) => {
    const next: CondStyle = { ...style, ...s };
    for (const k of Object.keys(next) as (keyof CondStyle)[]) if (next[k] === undefined || next[k] === false) delete next[k];
    setDraft({ ...draft, style: next });
  };
  const point = (p: ScalePoint | undefined, place: 'min' | 'mid' | 'max', set: (p: ScalePoint | undefined) => void) => {
    const label = place === 'min' ? 'Lowest' : place === 'mid' ? 'Middle' : 'Highest';
    const at2 = p?.at ?? (place === 'mid' ? 'pctile' : place);
    return (
      <div className="flex items-center gap-1.5">
        <ColorTool
          label={`${label} colour`}
          icon={<span className="h-3.5 w-3.5 rounded-full border border-line-2" style={{ background: p?.color ?? 'transparent' }} />}
          value={p?.color}
          none="None"
          onPick={(c) => set(c ? { ...(p ?? {}), color: c } : undefined)}
        />
        <span className="w-[62px] shrink-0 text-[12.5px] text-fg-2">{label}</span>
        {p && (
          <select value={at2} aria-label={`${label} point`} onChange={(e) => set({ ...p, at: e.target.value as ScalePoint['at'], v: p.v ?? 50 })} className={cx(smallInput, 'shrink-0')} style={{ width: 128 }}>
            {place !== 'max' && place !== 'mid' && <option value="min">Lowest value</option>}
            {place === 'max' && <option value="max">Highest value</option>}
            <option value="num">Number</option>
            <option value="pct">Percent</option>
            <option value="pctile">Percentile</option>
          </select>
        )}
        {p && at2 !== 'min' && at2 !== 'max' && <input value={p.v ?? 50} onChange={(e) => set({ ...p, v: Number(e.target.value) || 0 })} aria-label={`${label} value`} className={cx(smallInput, 'w-0 min-w-0 flex-1')} />}
      </div>
    );
  };
  return (
    <SidePanel
      title="Conditional formatting"
      narrow={narrow}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => (rules.length ? setAt(null) : onClose())}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={done}>
              Done
            </Button>
          </>
        ) : undefined
      }
    >
      {!editing ? (
        <div className="py-1.5">
          {rules.map((r, i) => (
            <div key={i} className="group flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-2">
              <button type="button" onClick={() => open(i)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <Preview rule={r} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px]">{summary(r)}</span>
                  <span translate="no" className="block truncate text-[11.5px] text-fg-3">
                    {r.range.split(',').join(', ')}
                  </span>
                </span>
              </button>
              <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp size={14} />
              </IconButton>
              <IconButton label="Move down" size="sm" disabled={i === rules.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown size={14} />
              </IconButton>
              <IconButton label="Delete the rule" size="sm" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
          {rules.length > 1 && <div className="px-3.5 pt-1 pb-2 text-[11.5px] text-fg-3">Rules apply in order: the first that holds for a cell gives its look.</div>}
          <div className="px-3 pt-1.5">
            <Button size="sm" icon={<Plus size={14} />} onClick={() => open(-1)}>
              Add a rule
            </Button>
          </div>
        </div>
      ) : (
        <div className="py-1.5">
          <Row label="Apply to range">
            <input value={rangeText} onChange={(e) => setRangeText(e.target.value)} aria-label="Apply to range" spellCheck={false} translate="no" className={cx(smallInput, !cleanRanges(rangeText) && 'border-err')} />
          </Row>
          <Row>
            <Segmented<'one' | 'scale' | 'bar'>
              size="sm"
              value={kind}
              onChange={(k) =>
                setDraft(
                  k === 'scale'
                    ? { range: draft.range, scale: { min: { color: SCALES[0][0] }, mid: { color: SCALES[0][1] }, max: { color: SCALES[0][2]! } } }
                    : k === 'bar'
                      ? { range: draft.range, bar: { color: '#638ec6' } }
                      : { range: draft.range, when: { op: 'notEmpty' }, style: PRESETS[0] },
                )
              }
              options={[
                { value: 'one', label: 'Single colour' },
                { value: 'scale', label: 'Colour scale' },
                { value: 'bar', label: 'Data bars' },
              ]}
            />
          </Row>
          {kind === 'one' && (
            <>
              <Row label="Format cells if">
                <CondFields cond={draft.when ?? null} onChange={(c) => setDraft({ ...draft, when: c ?? undefined })} ops={ALL_CHOICES} />
                {(draft.when?.op === 'top' || draft.when?.op === 'bottom') && (
                  <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-fg-2">
                    <input type="checkbox" checked={draft.when.b === '%'} onChange={(e) => setDraft({ ...draft, when: { ...draft.when!, b: e.target.checked ? '%' : undefined } })} className="accent-[var(--accent)]" />
                    As a percent of the cells
                  </label>
                )}
                {draft.when?.op === 'formula' && <div className="mt-1.5 text-[11.5px] leading-snug text-fg-3">Write it for the range’s first cell, with $ before what stays: =$C2&gt;100 looks at column C of each row.</div>}
              </Row>
              <Row label="Formatting style">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {PRESETS.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDraft({ ...draft, style: p })}
                      className={cx('grid h-7 w-10 place-items-center rounded-md border text-[12px]', JSON.stringify(p) === JSON.stringify(style) ? 'border-accent ring-2 ring-accent/30' : 'border-line')}
                      style={{ background: p.fill, color: p.color, fontWeight: p.b ? 700 : undefined }}
                    >
                      123
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-0.5">
                  <Tool label="Bold" on={!!style.b} onClick={() => setStyle({ b: !style.b })}>
                    <Bold size={15} />
                  </Tool>
                  <Tool label="Italic" on={!!style.i} onClick={() => setStyle({ i: !style.i })}>
                    <Italic size={15} />
                  </Tool>
                  <Tool label="Underline" on={!!style.u} onClick={() => setStyle({ u: !style.u })}>
                    <Underline size={15} />
                  </Tool>
                  <Tool label="Strikethrough" on={!!style.s} onClick={() => setStyle({ s: !style.s })}>
                    <Strikethrough size={15} />
                  </Tool>
                  <ColorTool label="Text colour" icon={<span className="text-[13px] font-semibold">A</span>} value={style.color} none="Automatic" onPick={(c) => setStyle({ color: c })} />
                  <ColorTool label="Fill colour" icon={<span className="h-3.5 w-3.5 rounded-sm border border-line-2" style={{ background: style.fill ?? 'transparent' }} />} value={style.fill} none="No fill" onPick={(c) => setStyle({ fill: c })} />
                </div>
              </Row>
            </>
          )}
          {kind === 'scale' && draft.scale && (
            <Row label="Colours">
              <div className="mb-2 flex flex-wrap gap-1.5">
                {SCALES.map((sc, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label="A colour scale"
                    onClick={() => setDraft({ ...draft, scale: { min: { color: sc[0] }, ...(sc[2] ? { mid: { color: sc[1] } } : {}), max: { color: sc[2] ?? sc[1] } } })}
                    className="h-6 w-12 rounded-md border border-line"
                    style={{ background: `linear-gradient(90deg, ${sc.filter(Boolean).join(', ')})` }}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                {point(draft.scale.min, 'min', (p) => p && setDraft({ ...draft, scale: { ...draft.scale!, min: p } }))}
                {point(draft.scale.mid, 'mid', (p) => {
                  const { mid: _m, ...rest } = draft.scale!;
                  setDraft({ ...draft, scale: p ? { ...rest, mid: p } : rest });
                })}
                {point(draft.scale.max, 'max', (p) => p && setDraft({ ...draft, scale: { ...draft.scale!, max: p } }))}
              </div>
            </Row>
          )}
          {kind === 'bar' && draft.bar && (
            <Row label="Bar colour">
              <div className="flex items-center gap-2">
                <ColorTool label="Bar colour" icon={<span className="h-3.5 w-6 rounded-sm" style={{ background: draft.bar.color }} />} value={draft.bar.color} none="Blue" onPick={(c) => setDraft({ ...draft, bar: { color: c ?? '#638ec6' } })} />
                <span className="text-[12.5px] text-fg-3">Each cell’s bar is as long as its value, the highest’s the longest.</span>
              </div>
            </Row>
          )}
        </div>
      )}
    </SidePanel>
  );
}
