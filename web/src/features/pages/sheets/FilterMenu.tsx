// A filter's menu for one column, opened from its button on the header row, as in Google Sheets: sort the filtered
// rows A to Z or Z to A by it, filter by a condition (is empty, text contains, greater than, between, a date before,
// a formula…), or by its values (each with how many rows have it, a find field, Select all and Clear). OK applies it.
import { useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowDownZA } from 'lucide-react';
import type { Cond, CondOp, FilterCol } from '@shared/sheets';
import { Button, cx, MenuItem, MenuSep } from '../../../components/ui';
import { smallInput } from './Panel';

/** The conditions a filter or a rule offers, in the order the menus list them, with how many values each takes. */
export const COND_CHOICES: { op: CondOp; label: string; n: 0 | 1 | 2; date?: boolean }[] = [
  { op: 'empty', label: 'Is empty', n: 0 },
  { op: 'notEmpty', label: 'Is not empty', n: 0 },
  { op: 'contains', label: 'Text contains', n: 1 },
  { op: 'notContains', label: 'Text does not contain', n: 1 },
  { op: 'starts', label: 'Text starts with', n: 1 },
  { op: 'ends', label: 'Text ends with', n: 1 },
  { op: 'is', label: 'Text is exactly', n: 1 },
  { op: 'dateIs', label: 'Date is', n: 1, date: true },
  { op: 'before', label: 'Date is before', n: 1, date: true },
  { op: 'after', label: 'Date is after', n: 1, date: true },
  { op: 'gt', label: 'Greater than', n: 1 },
  { op: 'gte', label: 'Greater than or equal to', n: 1 },
  { op: 'lt', label: 'Less than', n: 1 },
  { op: 'lte', label: 'Less than or equal to', n: 1 },
  { op: 'eq', label: 'Is equal to', n: 1 },
  { op: 'neq', label: 'Is not equal to', n: 1 },
  { op: 'between', label: 'Is between', n: 2 },
  { op: 'notBetween', label: 'Is not between', n: 2 },
  { op: 'formula', label: 'Custom formula is', n: 1 },
];

/** The days a date condition may name, with their words. */
export const DATE_CHOICES: [string, string][] = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['yesterday', 'Yesterday'],
  ['week', 'In the past week'],
  ['month', 'In the past month'],
  ['year', 'In the past year'],
  ['', 'Exact date'],
];

/** A condition's fields: what it checks, and its values (a date's word or a typed date for dates). */
export function CondFields({ cond, onChange, ops = COND_CHOICES, none }: { cond: Cond | null; onChange: (c: Cond | null) => void; ops?: { op: CondOp; label: string; n: 0 | 1 | 2; date?: boolean }[]; none?: string }) {
  const choice = ops.find((o) => o.op === cond?.op);
  const word = cond && choice?.date && DATE_CHOICES.some(([w]) => w && w === cond.a) ? cond.a! : '';
  return (
    <div className="flex flex-col gap-1.5">
      <select
        value={cond?.op ?? ''}
        aria-label="Condition"
        onChange={(e) => {
          const op = e.target.value as CondOp;
          if (!op) return onChange(null);
          const c = ops.find((o) => o.op === op)!;
          onChange({ op, ...(c.n >= 1 ? { a: c.date ? 'today' : op === 'formula' ? '=' : (cond?.a ?? '') } : {}), ...(c.n === 2 ? { b: cond?.b ?? '' } : {}) });
        }}
        className={smallInput}
      >
        {none && <option value="">{none}</option>}
        {ops.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {cond && choice?.date && (
        <select value={word} aria-label="Which day" onChange={(e) => onChange({ ...cond, a: e.target.value || '' })} className={smallInput}>
          {DATE_CHOICES.map(([w, label]) => (
            <option key={w} value={w}>
              {label}
            </option>
          ))}
        </select>
      )}
      {cond && choice && choice.n >= 1 && !(choice.date && word) && (
        <input
          value={cond.a ?? ''}
          onChange={(e) => onChange({ ...cond, a: e.target.value })}
          placeholder={choice.date ? '2026-11-05' : cond.op === 'formula' ? '=$C2>100' : 'Value or formula'}
          aria-label="Value"
          spellCheck={false}
          className={smallInput}
        />
      )}
      {cond && choice?.n === 2 && <input value={cond.b ?? ''} onChange={(e) => onChange({ ...cond, b: e.target.value })} placeholder="And" aria-label="Second value" spellCheck={false} className={smallInput} />}
    </div>
  );
}

export function FilterMenu({ values, current, onSort, onApply, onClose }: { values: { v: string; n: number }[]; current: FilterCol | undefined; onSort: (asc: boolean) => void; onApply: (fc: FilterCol | null) => void; onClose: () => void }) {
  const [hidden, setHidden] = useState(() => new Set((current?.hide ?? []).map((h) => h.toLowerCase())));
  const [cond, setCond] = useState<Cond | null>(current?.when ?? null);
  const [q, setQ] = useState('');
  const shown = useMemo(() => (q ? values.filter((x) => x.v.toLowerCase().includes(q.toLowerCase())) : values), [q, values]);
  const toggle = (v: string) =>
    setHidden((h) => {
      const next = new Set(h);
      const k = v.toLowerCase();
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const apply = () => {
    const hide = values.filter((x) => hidden.has(x.v.toLowerCase())).map((x) => x.v);
    const fc: FilterCol = {};
    if (hide.length) fc.hide = hide;
    if (cond && COND_CHOICES.find((o) => o.op === cond.op)) fc.when = cond;
    onApply(fc.hide || fc.when ? fc : null);
    onClose();
  };
  return (
    <div className="flex flex-col" onMouseDown={(e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.preventDefault()}>
      <MenuItem icon={<ArrowDownAZ size={14} />} onClick={() => (onSort(true), onClose())}>
        Sort A to Z
      </MenuItem>
      <MenuItem icon={<ArrowDownZA size={14} />} onClick={() => (onSort(false), onClose())}>
        Sort Z to A
      </MenuItem>
      <MenuSep />
      <div className="px-2 pt-1 pb-2">
        <div className="mb-1.5 text-[12px] font-medium text-fg-3">Filter by condition</div>
        <CondFields cond={cond} onChange={setCond} none="None" />
      </div>
      <div className="px-2 pb-1">
        <div className="mb-1.5 flex items-center gap-2 text-[12px]">
          <span className="font-medium text-fg-3">Filter by values</span>
          <button type="button" className="ml-auto text-accent hover:underline" onClick={() => setHidden(new Set())}>
            Select all
          </button>
          <button type="button" className="text-accent hover:underline" onClick={() => setHidden(new Set(values.map((x) => x.v.toLowerCase())))}>
            Clear
          </button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a value" aria-label="Find a value" className={cx(smallInput, 'mb-1')} />
        <div className="max-h-[170px] overflow-y-auto rounded-lg border border-line">
          {shown.map((x) => (
            <label key={x.v} className="flex h-7 cursor-pointer items-center gap-2 px-2 text-[13px] hover:bg-bg-2">
              <input type="checkbox" checked={!hidden.has(x.v.toLowerCase())} onChange={() => toggle(x.v)} className="accent-[var(--accent)]" />
              <span translate={x.v ? 'no' : undefined} className={cx('min-w-0 flex-1 truncate', !x.v && 'text-fg-3 italic')}>
                {x.v || '(Empty)'}
              </span>
              <span className="text-[11.5px] text-fg-3 tabular-nums">{x.n}</span>
            </label>
          ))}
          {!shown.length && <div className="px-2 py-2 text-[12.5px] text-fg-3">No value has those words</div>}
        </div>
      </div>
      <div className="flex justify-end gap-2 px-2 pt-2 pb-1">
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" variant="primary" onClick={apply}>
          OK
        </Button>
      </div>
    </div>
  );
}
