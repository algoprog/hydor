// Tools → Goal seek (the value of one cell that makes a formula give the result wanted), and Data → Pivot table (a
// table summed up on a sheet of its own, by the columns picked for its rows and columns, its values summed, counted or
// averaged, the rows of values a filter leaves out not counted; its settings kept to change it again).
import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { colIndex, colName, parseRef, type Calc, type PivotDef, type Workbook } from '@shared/sheets';
import { pivotValues } from '@shared/sheet-pivot';
import type { GoalSeekResult } from '@shared/sheet-whatif';
import { Button, cx, Dialog, IconButton, inputCls } from '../../../components/ui';
import { Row, SidePanel, smallInput } from './Panel';

export function GoalSeekDialog({ setCell, byCell, onSeek, onApply, onClose }: { setCell: string; byCell: string; onSeek: (set: string, to: number, by: string) => GoalSeekResult | string; onApply: (by: string, value: number) => void; onClose: () => void }) {
  const [set, setSet] = useState(setCell);
  const [to, setTo] = useState('');
  const [by, setBy] = useState(byCell);
  const [got, setGot] = useState<GoalSeekResult | string | null>(null);
  const ok = !!parseRef(set.trim().toUpperCase()) && !!parseRef(by.trim().toUpperCase()) && to.trim() !== '' && Number.isFinite(Number(to));
  const seek = () => ok && setGot(onSeek(set.trim().toUpperCase(), Number(to), by.trim().toUpperCase()));
  const found = got && typeof got === 'object' ? got : null;
  return (
    <Dialog
      open
      onClose={onClose}
      width={400}
      title="Goal seek"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {found ? (
            <Button variant="primary" onClick={() => (onApply(by.trim().toUpperCase(), found.value), onClose())}>
              Put it in
            </Button>
          ) : (
            <Button variant="primary" disabled={!ok} onClick={seek}>
              Seek
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-2.5">
        {(
          [
            ['Set cell', 'The formula’s cell (C10)', set, setSet],
            ['To value', 'The result you want (1000)', to, setTo],
            ['By changing cell', 'A cell of a number it uses (B2)', by, setBy],
          ] as const
        ).map(([label, hint, v, on]) => (
          <label key={label} className="block">
            <div className="mb-1 text-[12.5px] font-medium text-fg-2">{label}</div>
            <input
              value={v}
              onChange={(e) => {
                on(e.target.value);
                setGot(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && seek()}
              placeholder={hint}
              translate="no"
              className={cx(inputCls, 'text-[13.5px]')}
            />
          </label>
        ))}
        {typeof got === 'string' && <div className="text-[12.5px] text-err">{got}</div>}
        {found && (
          <div className={cx('rounded-lg border p-2.5 text-[13px] leading-snug', found.reached ? 'border-line bg-bg-1' : 'border-warn/50 bg-warn/10')}>
            {found.reached ? `Found it: with ${by.toUpperCase()} at ${found.value}, ${set.toUpperCase()} gives ${Number(found.result.toPrecision(12))}.` : `The nearest: with ${by.toUpperCase()} at ${found.value}, ${set.toUpperCase()} gives ${Number(found.result.toPrecision(12))}, not ${to}.`}
          </div>
        )}
      </div>
    </Dialog>
  );
}

const FNS: { fn: PivotDef['values'][number]['fn']; label: string }[] = [
  { fn: 'sum', label: 'Sum' },
  { fn: 'count', label: 'Count' },
  { fn: 'average', label: 'Average' },
  { fn: 'min', label: 'Lowest' },
  { fn: 'max', label: 'Highest' },
];

export function PivotPanel({
  book,
  calc,
  start,
  editing,
  narrow,
  onMake,
  onClose,
}: {
  book: Workbook;
  calc: Calc;
  /** The settings to start from: a pivot table's own, or a new one's of the table picked. */
  start: PivotDef;
  /** Whether it changes the pivot table of the sheet on view (else it makes a new sheet). */
  editing: boolean;
  narrow: boolean;
  onMake: (def: PivotDef) => void;
  onClose: () => void;
}) {
  const [def, setDef] = useState<PivotDef>(start);
  const [filterCol, setFilterCol] = useState('');
  // The table's columns, by their headers.
  const columns = useMemo(() => {
    const m = /^(?:'((?:[^']|'')+)'|([^!]+))!([A-Z]+)(\d+):([A-Z]+)\d+$/.exec(def.source);
    const sheet = m ? book.sheets.find((s) => s.name.toLowerCase() === (m[1] ?? m[2]).replace(/''/g, "'").toLowerCase()) : undefined;
    const si = sheet ? book.sheets.indexOf(sheet) : -1;
    if (!m || si < 0) return [];
    const r = Number(m[4]) - 1;
    return Array.from({ length: colIndex(m[5]) - colIndex(m[3]) + 1 }, (_, j) => {
      const c = colIndex(m[3]) + j;
      const v = calc.value(si, r, c);
      return { col: colName(c), name: typeof v === 'string' && v.trim() ? `${v.trim()} (${colName(c)})` : `Column ${colName(c)}` };
    });
  }, [book, calc, def.source]);
  const pick = (value: string, on: (v: string) => void, label: string, none?: string) => (
    <select value={value} onChange={(e) => on(e.target.value)} aria-label={label} translate="no" className={cx(smallInput, 'min-w-0 flex-1')}>
      {none !== undefined && <option value="">{none}</option>}
      {columns.map((c) => (
        <option key={c.col} value={c.col}>
          {c.name}
        </option>
      ))}
    </select>
  );
  const filterValues = useMemo(() => (filterCol ? pivotValues(book, calc, def, filterCol) : []), [book, calc, def, filterCol]);
  const hidden = new Set((def.filters?.find((f) => f.col === filterCol)?.hide ?? []).map((h) => h.toLowerCase()));
  const setHide = (v: string, hide: boolean) => {
    const list = (def.filters ?? []).filter((f) => f.col !== filterCol);
    const cur = new Set(def.filters?.find((f) => f.col === filterCol)?.hide ?? []);
    if (hide) cur.add(v);
    else for (const x of [...cur]) if (x.toLowerCase() === v.toLowerCase()) cur.delete(x);
    setDef({ ...def, filters: cur.size ? [...list, { col: filterCol, hide: [...cur] }] : list.length ? list : undefined });
  };
  return (
    <SidePanel
      title={editing ? 'Pivot table' : 'New pivot table'}
      narrow={narrow}
      onClose={onClose}
      footer={
        <Button size="sm" variant="primary" disabled={!def.rows.length || !def.values.length} onClick={() => onMake(def)}>
          {editing ? 'Update it' : 'Make it'}
        </Button>
      }
    >
      <Row label="The table">
        <input value={def.source} onChange={(e) => setDef({ ...def, source: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="The table" translate="no" className={cx(smallInput, 'font-mono text-[12px]')} />
      </Row>
      <Row label="Rows">
        <div className="space-y-1.5">
          {def.rows.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {pick(r, (v) => setDef({ ...def, rows: def.rows.map((x, j) => (j === i ? v : x)) }), 'Rows by')}
              {def.rows.length > 1 && (
                <IconButton label="Take it out" size="sm" onClick={() => setDef({ ...def, rows: def.rows.filter((_, j) => j !== i) })}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
          ))}
          {def.rows.length < 2 && columns.length > 1 && (
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setDef({ ...def, rows: [...def.rows, columns.find((c) => !def.rows.includes(c.col))!.col] })}>
              Rows by another column too
            </Button>
          )}
        </div>
      </Row>
      <Row label="Columns">
        <div className="flex">{pick(def.cols ?? '', (v) => setDef({ ...def, cols: v || undefined }), 'Columns by', 'None')}</div>
      </Row>
      <Row label="Values">
        <div className="space-y-1.5">
          {def.values.map((v, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select value={v.fn} onChange={(e) => setDef({ ...def, values: def.values.map((x, j) => (j === i ? { ...x, fn: e.target.value as typeof v.fn } : x)) })} aria-label="Summed up as" className={cx(smallInput, 'w-[96px]')}>
                {FNS.map((f) => (
                  <option key={f.fn} value={f.fn}>
                    {f.label}
                  </option>
                ))}
              </select>
              {pick(v.col, (c) => setDef({ ...def, values: def.values.map((x, j) => (j === i ? { ...x, col: c } : x)) }), 'Of the column')}
              {def.values.length > 1 && (
                <IconButton label="Take it out" size="sm" onClick={() => setDef({ ...def, values: def.values.filter((_, j) => j !== i) })}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setDef({ ...def, values: [...def.values, { col: def.values[0]?.col ?? columns[0]?.col ?? 'A', fn: 'sum' }] })}>
            Add a value
          </Button>
        </div>
      </Row>
      <Row label="Filters">
        <div className="flex">{pick(filterCol, setFilterCol, 'Filter by', 'Pick a column')}</div>
        {filterCol && (
          <div className="mt-1.5 max-h-[180px] space-y-0.5 overflow-y-auto">
            {filterValues.map((v) => (
              <label key={v} className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={!hidden.has(v.toLowerCase())} onChange={(e) => setHide(v, !e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
                <span translate="no" className="truncate">
                  {v || '(empty)'}
                </span>
              </label>
            ))}
          </div>
        )}
        {!!def.filters?.length && (
          <div className="mt-1.5 text-[12px] text-fg-3">
            Leaving out: {def.filters.map((f) => `${f.hide.length} of ${columns.find((c) => c.col === f.col)?.name ?? f.col}`).join(', ')}
          </div>
        )}
      </Row>
    </SidePanel>
  );
}
