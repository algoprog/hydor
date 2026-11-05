// Data validation, as a side panel (Data → Data validation, and Insert → Dropdown): the sheet's rules for what cells
// take, each with its range; add one for the cells picked or change one: a dropdown of options, each with the colour
// of its chip (or of a range's values), a checkbox, a rating of stars, a number or a date that meets a condition, words
// of a length, or what a formula allows; and what happens to other input: a warning, or refused.
import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { cleanRanges, cleanSource, COMPARE_OPS, textOn, type ListOption, type Validation } from '@shared/sheets';
import { Button, cx, IconButton, Segmented } from '../../../components/ui';
import { COND_CHOICES, CondFields } from './FilterMenu';
import { Row, SidePanel, smallInput } from './Panel';

/** Colours for options' chips, soft enough to read words on. */
export const CHIP_COLORS = ['#c9daf8', '#d9ead3', '#fff2cc', '#f4cccc', '#d9d2e9', '#fce5cd', '#d0e0e3', '#ead1dc', '#e6e6e6'];

const KINDS: { type: Validation['type'] | 'source'; label: string }[] = [
  { type: 'list', label: 'Dropdown' },
  { type: 'source', label: 'Dropdown from a range' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'rating', label: 'Rating' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'length', label: 'Text length' },
  { type: 'formula', label: 'Custom formula is' },
];

const COMPARE = COND_CHOICES.filter((c) => COMPARE_OPS.includes(c.op));

function summary(v: Validation): string {
  if (v.type === 'list') return v.source ? `Dropdown from ${v.source}` : `Dropdown: ${(v.options ?? []).map((o) => o.v).join(', ')}`;
  return KINDS.find((k) => k.type === v.type)?.label ?? '';
}

export function ValidPanel({ rules, picked, start, narrow, onChange, onClose }: { rules: Validation[]; picked: string; start?: Validation; narrow: boolean; onChange: (rules: Validation[]) => void; onClose: () => void }) {
  const fresh = (): Validation =>
    start ?? {
      range: picked,
      type: 'list',
      options: [
        { v: 'Option 1', color: CHIP_COLORS[0] },
        { v: 'Option 2', color: CHIP_COLORS[1] },
      ],
    };
  const [at, setAt] = useState<number | null>(start || !rules.length ? -1 : null);
  const [draft, setDraft] = useState<Validation>(fresh);
  const [rangeText, setRangeText] = useState((start?.range ?? picked).split(',').join(', '));
  // The option whose colours show under it.
  const [pal, setPal] = useState<number | null>(null);
  const editing = at !== null;
  const open = (i: number) => {
    setAt(i);
    const v = i >= 0 ? rules[i] : fresh();
    setDraft(v);
    setRangeText(v.range.split(',').join(', '));
  };
  const kind = draft.type === 'list' && draft.source !== undefined ? 'source' : draft.type;
  const setKind = (k: string) => {
    const base = { range: draft.range, ...(draft.reject ? { reject: true } : {}) };
    if (k === 'list') setDraft({ ...base, type: 'list', options: draft.options?.length ? draft.options : fresh().options });
    else if (k === 'source') setDraft({ ...base, type: 'list', source: draft.source ?? '' });
    else if (k === 'number' || k === 'length') setDraft({ ...base, type: k, when: { op: 'between', a: '0', b: '100' } });
    else if (k === 'date') setDraft({ ...base, type: 'date', when: { op: 'after', a: 'today' } });
    else if (k === 'formula') setDraft({ ...base, type: 'formula', when: { op: 'formula', a: '=' } });
    else setDraft({ ...base, type: k as Validation['type'] });
  };
  const done = () => {
    const range = cleanRanges(rangeText);
    if (!range) return;
    const v: Validation = { ...draft, range };
    if (v.type === 'list' && v.source !== undefined) {
      const src = cleanSource(v.source);
      if (!src) return;
      v.source = src;
      delete v.options;
    }
    if (v.type === 'list' && v.options) {
      v.options = v.options.filter((o) => o.v.trim()).map((o) => ({ ...o, v: o.v.trim() }));
      if (!v.options.length) return;
    }
    onChange(at !== null && at >= 0 ? rules.map((r, i) => (i === at ? v : r)) : [...rules, v]);
    setAt(null);
    if (start) onClose();
  };
  const opts = draft.options ?? [];
  const setOpts = (list: ListOption[]) => setDraft({ ...draft, options: list });
  const swap = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= opts.length) return;
    const next = [...opts];
    [next[i], next[j]] = [next[j], next[i]];
    setOpts(next);
  };
  return (
    <SidePanel
      title="Data validation"
      narrow={narrow}
      onClose={onClose}
      footer={
        editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => (rules.length && !start ? setAt(null) : onClose())}>
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
          {rules.map((v, i) => (
            <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-2">
              <button type="button" onClick={() => open(i)} className="min-w-0 flex-1 text-left">
                <span translate="no" className="block truncate text-[13px]">
                  {summary(v)}
                </span>
                <span translate="no" className="block truncate text-[11.5px] text-fg-3">
                  {v.range.split(',').join(', ')}
                </span>
              </button>
              <IconButton label="Delete the rule" size="sm" onClick={() => onChange(rules.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
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
          <Row label="Criteria">
            <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Criteria" className={smallInput}>
              {KINDS.map((k) => (
                <option key={k.type} value={k.type}>
                  {k.label}
                </option>
              ))}
            </select>
          </Row>
          {kind === 'list' && (
            <Row label="Options">
              <div className="flex flex-col gap-1">
                {opts.map((o, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="The chip’s colour"
                        aria-label="The chip’s colour"
                        aria-expanded={pal === i}
                        onClick={() => setPal(pal === i ? null : i)}
                        className={cx('h-7 w-7 shrink-0 rounded-md border', pal === i ? 'border-accent' : 'border-line')}
                        style={{ background: o.color ?? 'transparent' }}
                      />
                      <input
                        value={o.v}
                        translate="no"
                        onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))}
                        aria-label="Option"
                        className={cx(smallInput, 'min-w-0 flex-1')}
                        style={o.color ? { boxShadow: `inset 3px 0 0 ${o.color}` } : undefined}
                      />
                      <IconButton label="Move up" size="sm" disabled={i === 0} onClick={() => swap(i, -1)}>
                        <ArrowUp size={13} />
                      </IconButton>
                      <IconButton label="Move down" size="sm" disabled={i === opts.length - 1} onClick={() => swap(i, 1)}>
                        <ArrowDown size={13} />
                      </IconButton>
                      <IconButton label="Remove the option" size="sm" onClick={() => setOpts(opts.filter((_, j) => j !== i))}>
                        <X size={13} />
                      </IconButton>
                    </div>
                    {pal === i && (
                      <div className="mt-1 mb-1.5 ml-8 flex flex-wrap gap-1.5">
                        {[undefined, ...CHIP_COLORS].map((c) => (
                          <button
                            key={c ?? 'none'}
                            type="button"
                            aria-label={c ?? 'No colour'}
                            title={c ?? 'No colour'}
                            onClick={() => (setOpts(opts.map((x, j) => (j === i ? { ...x, color: c } : x))), setPal(null))}
                            className={cx('h-6 w-6 rounded-full border', o.color === c ? 'border-accent ring-2 ring-accent/30' : 'border-line-2')}
                            style={{ background: c ?? 'transparent' }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setOpts([...opts, { v: `Option ${opts.length + 1}`, color: CHIP_COLORS[opts.length % CHIP_COLORS.length] }])} className="self-start">
                  Add an option
                </Button>
                <div className="mt-1 flex flex-wrap gap-1">
                  {opts
                    .filter((o) => o.v.trim())
                    .map((o, i) => (
                      <span key={i} translate="no" className="rounded-full px-2 text-[12px] leading-[1.6]" style={o.color ? { background: o.color, color: textOn(o.color) } : { background: 'var(--bg-2)' }}>
                        {o.v}
                      </span>
                    ))}
                </div>
              </div>
            </Row>
          )}
          {kind === 'source' && (
            <Row label="Options from the range">
              <input
                value={draft.source ?? ''}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="Sheet2!A1:A20"
                aria-label="Options from the range"
                spellCheck={false}
                translate="no"
                className={cx(smallInput, draft.source && !cleanSource(draft.source) && 'border-err')}
              />
            </Row>
          )}
          {kind === 'rating' && (
            <Row label="Stars">
              <select value={draft.max ?? 5} onChange={(e) => setDraft({ ...draft, max: Number(e.target.value) === 5 ? undefined : Number(e.target.value) })} aria-label="Stars" className={smallInput}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {`${n} stars`}
                  </option>
                ))}
              </select>
            </Row>
          )}
          {(kind === 'number' || kind === 'date' || kind === 'length') && (
            <Row label={kind === 'length' ? 'Its length' : 'It is'}>
              <CondFields cond={draft.when ?? null} onChange={(c) => setDraft({ ...draft, when: c ?? undefined })} ops={COMPARE} none={kind === 'length' ? undefined : kind === 'date' ? 'Any date' : 'Any number'} />
            </Row>
          )}
          {kind === 'formula' && (
            <Row label="Formula">
              <input value={draft.when?.a ?? '='} onChange={(e) => setDraft({ ...draft, when: { op: 'formula', a: e.target.value } })} placeholder="=LEN(A2)<=40" aria-label="Formula" spellCheck={false} translate="no" className={smallInput} />
              <div className="mt-1.5 text-[11.5px] leading-snug text-fg-3">Write it for the range’s first cell; a value is allowed where it gives TRUE.</div>
            </Row>
          )}
          <Row label="If the data is not allowed">
            <Segmented<'warn' | 'reject'>
              size="sm"
              value={draft.reject ? 'reject' : 'warn'}
              onChange={(v) => setDraft({ ...draft, reject: v === 'reject' || undefined })}
              options={[
                { value: 'warn', label: 'Show a warning' },
                { value: 'reject', label: 'Reject the input' },
              ]}
            />
          </Row>
        </div>
      )}
    </SidePanel>
  );
}
