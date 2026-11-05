// A row expanded into a card, as Airtable opens a record (the button on a row's number, Space on a row picked, or a
// right click's Expand row): its cells as a form under their headers, to read and change, each as its rule shows it
// (a checkbox, a list's options, stars; a formula's result to read); the rows before and after are a button away.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { colName as col, formatValue, inputText, textOn, type Calc, type Sheet } from '@shared/sheets';
import { isTicked, listOptions, type Rules } from '@shared/sheet-rules';
import { Button, cx, Dialog, IconButton } from '../../../components/ui';
import { smallInput } from './Panel';

export interface RowCardProps {
  sheet: Sheet;
  si: number;
  calc: Calc;
  rev: number;
  rules: Rules;
  row: number;
  /** The columns shown, and the row their names are in (null: their letters). */
  cols: number[];
  head: number | null;
  first: number;
  last: number;
  readOnly?: boolean;
  onRow: (r: number) => void;
  /** A cell given new words, as if typed in it. */
  onSet: (r: number, c: number, text: string) => void;
  onClose: () => void;
}

export function RowCard(p: RowCardProps) {
  const { sheet, si, calc, rules, row, cols, head } = p;
  const name = (c: number) => {
    const t = head !== null ? formatValue(calc.value(si, head, c), sheet.cells[`${col(c)}${head + 1}`]?.s) : '';
    return t || `Column ${col(c)}`;
  };
  const [draft, setDraft] = useState<Record<number, string>>({});
  useEffect(() => setDraft({}), [row, p.rev]);
  const commit = (c: number) => {
    if (!(c in draft)) return;
    p.onSet(row, c, draft[c]);
    setDraft((d) => {
      const n = { ...d };
      delete n[c];
      return n;
    });
  };
  return (
    <Dialog
      open
      onClose={p.onClose}
      width={520}
      title={
        <span className="flex items-center gap-2">
          {`Row ${row + 1}`}
          <span className="ml-auto flex items-center">
            <IconButton label="The row before" size="sm" disabled={row <= p.first} onClick={() => p.onRow(row - 1)}>
              <ChevronUp size={16} />
            </IconButton>
            <IconButton label="The row after" size="sm" disabled={row >= p.last} onClick={() => p.onRow(row + 1)}>
              <ChevronDown size={16} />
            </IconButton>
          </span>
        </span>
      }
      footer={
        <Button size="sm" variant="primary" onClick={p.onClose}>
          Done
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {cols.map((c) => {
          const key = `${col(c)}${row + 1}`;
          const cell = sheet.cells[key];
          const v = calc.value(si, row, c);
          const rule = rules.any ? rules.at(row, c)?.rule : undefined;
          const formula = cell?.f !== undefined;
          const label = (
            <div translate="no" className="mb-1 text-[12px] font-medium text-fg-3">
              {name(c)}
            </div>
          );
          if (rule?.type === 'checkbox')
            return (
              <label key={c} className="flex items-center gap-2.5">
                <input type="checkbox" disabled={p.readOnly || formula} checked={isTicked(v)} onChange={(e) => p.onSet(row, c, e.target.checked ? 'TRUE' : 'FALSE')} className="h-4 w-4 accent-[var(--accent)]" />
                <span translate="no" className="text-[13.5px]">
                  {name(c)}
                </span>
              </label>
            );
          if (rule?.type === 'rating') {
            const max = rule.max ?? 5;
            const n = typeof v === 'number' ? Math.round(v) : 0;
            return (
              <div key={c}>
                {label}
                <div className="flex gap-0.5 text-[20px]">
                  {[...Array(max).keys()].map((i) => (
                    <button key={i} type="button" disabled={p.readOnly || formula} aria-label={`${i + 1} of ${max} stars`} onClick={() => p.onSet(row, c, String(n === i + 1 ? 0 : i + 1))} className={i < n ? 'text-[#f5a623]' : 'text-fg-3 opacity-40'}>
                      ★
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          if (rule?.type === 'list' && !formula) {
            const opts = listOptions(calc, si, rule);
            const now = formatValue(v, cell?.s);
            return (
              <div key={c}>
                {label}
                <div className="flex flex-wrap gap-1.5">
                  {opts.map((o) => {
                    const on = o.v.toLowerCase() === now.toLowerCase();
                    return (
                      <button
                        key={o.v}
                        type="button"
                        translate="no"
                        disabled={p.readOnly}
                        onClick={() => p.onSet(row, c, on ? '' : o.v)}
                        className={cx('rounded-full border px-2.5 text-[12.5px] leading-[1.9]', on ? 'border-accent ring-2 ring-accent/30' : 'border-line')}
                        style={o.color ? { background: o.color, color: textOn(o.color) } : undefined}
                      >
                        {o.v}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }
          const text = c in draft ? draft[c] : formula ? formatValue(v, cell?.s) : inputText(cell);
          return (
            <div key={c}>
              {label}
              <textarea
                value={text}
                rows={Math.min(5, Math.max(1, text.split('\n').length))}
                readOnly={p.readOnly || formula}
                translate="no"
                title={formula ? `=${cell!.f}` : undefined}
                onChange={(e) => setDraft((d) => ({ ...d, [c]: e.target.value }))}
                onBlur={() => commit(c)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
                    e.preventDefault();
                    commit(c);
                  }
                }}
                className={cx(smallInput, 'h-auto min-h-8.5 resize-none py-1.5 leading-snug', formula && 'text-fg-2')}
              />
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
