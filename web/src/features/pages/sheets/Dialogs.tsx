// The spreadsheet editor's dialogs: Sort range (by several columns in turn, with a header row or not), Remove
// duplicates (by the columns chosen), Split text to columns (by a separator found or chosen), and Custom number
// format (an Excel code, with a preview of the cell picked and codes to start from).
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { formatValue, type CellStyle, type Scalar } from '@shared/sheets';
import { Button, cx, Dialog, IconButton, Segmented } from '../../../components/ui';
import { smallInput } from './Panel';

/** A column to choose: its index and what it is called (its header, or its letter). */
export interface ColChoice {
  c: number;
  name: string;
}

export function SortDialog({ cols, header, onHeader, onSort, onClose }: { cols: ColChoice[]; header: boolean; onHeader: (on: boolean) => void; onSort: (keys: { c: number; asc: boolean }[]) => void; onClose: () => void }) {
  const [keys, setKeys] = useState<{ c: number; asc: boolean }[]>([{ c: cols[0]?.c ?? 0, asc: true }]);
  return (
    <Dialog
      open
      onClose={onClose}
      width={460}
      title="Sort range"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => (onSort(keys), onClose())}>
            Sort
          </Button>
        </>
      }
    >
      <label className="mb-3 flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" checked={header} onChange={(e) => onHeader(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Data has a header row
      </label>
      <div className="flex flex-col gap-2">
        {keys.map((k, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-[70px] shrink-0 text-[12.5px] text-fg-3">{i === 0 ? 'Sort by' : 'Then by'}</span>
            <select value={k.c} onChange={(e) => setKeys(keys.map((x, j) => (j === i ? { ...x, c: Number(e.target.value) } : x)))} aria-label="Column" translate="no" className={cx(smallInput, 'min-w-0 flex-1')}>
              {cols.map((col) => (
                <option key={col.c} value={col.c}>
                  {col.name}
                </option>
              ))}
            </select>
            <Segmented<'asc' | 'desc'>
              size="sm"
              value={k.asc ? 'asc' : 'desc'}
              onChange={(v) => setKeys(keys.map((x, j) => (j === i ? { ...x, asc: v === 'asc' } : x)))}
              options={[
                { value: 'asc', label: 'A → Z' },
                { value: 'desc', label: 'Z → A' },
              ]}
            />
            {keys.length > 1 ? (
              <IconButton label="Remove this column" size="sm" onClick={() => setKeys(keys.filter((_, j) => j !== i))}>
                <X size={14} />
              </IconButton>
            ) : (
              <span className="w-7 shrink-0" />
            )}
          </div>
        ))}
      </div>
      {keys.length < Math.min(6, cols.length) && (
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} className="mt-2" onClick={() => setKeys([...keys, { c: cols.find((x) => !keys.some((k) => k.c === x.c))?.c ?? cols[0].c, asc: true }])}>
          Add another sort column
        </Button>
      )}
    </Dialog>
  );
}

export function DupDialog({ cols, header, onHeader, onRemove, onClose }: { cols: ColChoice[]; header: boolean; onHeader: (on: boolean) => void; onRemove: (cols: number[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState(() => new Set(cols.map((c) => c.c)));
  const all = picked.size === cols.length;
  return (
    <Dialog
      open
      onClose={onClose}
      width={420}
      title="Remove duplicates"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!picked.size} onClick={() => (onRemove(cols.filter((c) => picked.has(c.c)).map((c) => c.c)), onClose())}>
            Remove duplicates
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-2">Rows whose values in the columns chosen match a row above them are taken out; the first of each stays.</p>
      <label className="mb-2 flex items-center gap-2 text-[13.5px]">
        <input type="checkbox" checked={header} onChange={(e) => onHeader(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        Data has a header row
      </label>
      <div className="max-h-[260px] overflow-y-auto rounded-xl border border-line py-1">
        <label className="flex h-8 items-center gap-2 px-3 text-[13.5px] font-medium">
          <input type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(cols.map((c) => c.c)))} className="h-4 w-4 accent-[var(--accent)]" />
          Select all
        </label>
        {cols.map((c) => (
          <label key={c.c} className="flex h-8 items-center gap-2 px-3 text-[13.5px]">
            <input
              type="checkbox"
              checked={picked.has(c.c)}
              onChange={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  if (n.has(c.c)) n.delete(c.c);
                  else n.add(c.c);
                  return n;
                })
              }
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span translate="no" className="truncate">
              {c.name}
            </span>
          </label>
        ))}
      </div>
    </Dialog>
  );
}

const SEPARATORS: [string, string][] = [
  ['auto', 'Detect automatically'],
  [',', 'Comma'],
  [';', 'Semicolon'],
  ['.', 'Period'],
  [' ', 'Space'],
  ['\t', 'Tab'],
  ['custom', 'Custom'],
];

export function SplitDialog({ guess, onSplit, onClose }: { guess: string; onSplit: (sep: string) => void; onClose: () => void }) {
  const [how, setHow] = useState('auto');
  const [custom, setCustom] = useState('');
  const sep = how === 'auto' ? guess : how === 'custom' ? custom : how;
  const named = SEPARATORS.find(([k]) => k === guess)?.[1] ?? guess;
  return (
    <Dialog
      open
      onClose={onClose}
      width={400}
      title="Split text to columns"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!sep} onClick={() => (onSplit(sep), onClose())}>
            Split
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-2">Each cell’s words are split at the separator into the columns to its right, writing over what they hold.</p>
      <div className="flex flex-col gap-1">
        {SEPARATORS.map(([k, label]) => (
          <label key={k} className="flex h-8 items-center gap-2 text-[13.5px]">
            <input type="radio" name="sep" checked={how === k} onChange={() => setHow(k)} className="accent-[var(--accent)]" />
            {label}
            {k === 'auto' && <span className="text-[12px] text-fg-3">{`(${named})`}</span>}
            {k === 'custom' && how === 'custom' && <input autoFocus value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={5} aria-label="Separator" className={cx(smallInput, 'ml-1 w-24')} />}
          </label>
        ))}
      </div>
    </Dialog>
  );
}

/** Codes to start from, as Excel and Google Sheets offer them. */
const CODES = ['#,##0.00', '0.0%', '$#,##0;[Red]-$#,##0', '#,##0;(#,##0)', '0.00E+00', '#,##0,"k"', 'yyyy-mm-dd', 'd mmm yyyy', 'dddd, d mmmm yyyy', 'h:mm AM/PM', '[h]:mm:ss', '@" items"'];

export function FormatDialog({ code, sample, style, onApply, onClose }: { code: string; sample: Scalar; style: CellStyle | undefined; onApply: (code: string) => void; onClose: () => void }) {
  const [text, setText] = useState(code);
  const shown = text.trim() ? formatValue(sample ?? 1234.5, { ...(style ?? {}), code: text.trim() }) : '';
  return (
    <Dialog
      open
      onClose={onClose}
      width={460}
      title="Custom number format"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!text.trim() || text.length > 120} onClick={() => (onApply(text.trim()), onClose())}>
            Apply
          </Button>
        </>
      }
    >
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && text.trim() && (onApply(text.trim()), onClose())}
        placeholder="#,##0.00"
        aria-label="Number format code"
        spellCheck={false}
        translate="no"
        className={cx(smallInput, 'font-mono')}
      />
      <div className="mt-2 flex h-9 items-center rounded-lg bg-bg-2 px-3 text-[13.5px] tabular-nums">
        <span className="mr-2 text-[12px] text-fg-3">Shows</span>
        <span translate="no">{shown}</span>
      </div>
      <div className="mt-3 mb-1 text-[12px] font-medium text-fg-3">Start from</div>
      <div className="grid grid-cols-2 gap-1">
        {CODES.map((c) => (
          <button key={c} type="button" onClick={() => setText(c)} className={cx('flex h-8 items-center justify-between gap-2 rounded-lg px-2 text-left font-mono text-[12px] hover:bg-bg-2', text === c && 'bg-bg-2')}>
            <span translate="no" className="truncate">
              {c}
            </span>
            <span translate="no" className="shrink-0 font-sans text-fg-3">
              {formatValue(c.includes('y') || c.includes('h') ? 46331.6 : -1234.5, { code: c })}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-fg-3">0 and # are digits, “,” groups thousands, % multiplies by 100, ; separates positive, negative and zero numbers, [Red] colours them, and dates use d, m, y, h, s.</p>
    </Dialog>
  );
}
