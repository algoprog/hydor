// The LaTeX editor's table editor (Insert → Table, and Edit this table with the cursor in one): a grid to type the
// cells in, rows and columns added and taken away, each column's alignment, a header row, the lines between rows
// (booktabs' rules, plain \hline at the top, under the header and at the bottom, one under every row, or none),
// lines between columns, and a caption and a label when it is a table that floats with its caption. Rows copied from
// a spreadsheet paste in as cells. What it makes is a table environment (shared/latex-table.ts writes it); a table read back from
// the source comes in the same grid.
import { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Plus, X } from 'lucide-react';
import { TABLE_LIMITS, type ColAlign, type TableLines, type TexTable } from '@shared/latex-table';
import { Button, cx, Dialog, inputCls, Segmented, Switch } from '../../../components/ui';

const ALIGNS: { value: ColAlign; label: string; icon: React.ReactNode }[] = [
  { value: 'l', label: 'Align left', icon: <AlignLeft size={13} /> },
  { value: 'c', label: 'Centre', icon: <AlignCenter size={13} /> },
  { value: 'r', label: 'Align right', icon: <AlignRight size={13} /> },
];

export function TableEditor({ open, initial, editing, onClose, onDone }: { open: boolean; initial: TexTable; editing: boolean; onClose: () => void; onDone: (t: TexTable) => void }) {
  const [t, setT] = useState<TexTable>(initial);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setT(initial);
  }, [open, initial]);
  const cols = Math.max(1, t.align.length, ...t.rows.map((r) => r.length));
  const set = (f: (x: TexTable) => TexTable) => setT((x) => f(x));
  const cell = (r: number, c: number, v: string) => set((x) => ({ ...x, rows: x.rows.map((row, i) => (i === r ? Array.from({ length: cols }, (_, j) => (j === c ? v : (row[j] ?? ''))) : row)) }));
  const addRow = (at = t.rows.length) => set((x) => (x.rows.length >= TABLE_LIMITS.rows ? x : { ...x, rows: [...x.rows.slice(0, at), Array(cols).fill(''), ...x.rows.slice(at)] }));
  const addCol = () => set((x) => (cols >= TABLE_LIMITS.cols ? x : { ...x, align: [...Array.from({ length: cols }, (_, i) => x.align[i] ?? 'l'), 'c'], rows: x.rows.map((r) => [...Array.from({ length: cols }, (_, i) => r[i] ?? ''), '']) }));
  const delRow = (r: number) => set((x) => (x.rows.length <= 1 ? x : { ...x, rows: x.rows.filter((_, i) => i !== r) }));
  const delCol = (c: number) => set((x) => (cols <= 1 ? x : { ...x, align: x.align.filter((_, i) => i !== c), rows: x.rows.map((r) => r.filter((_, i) => i !== c)) }));
  const focusCell = (r: number, c: number) => requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>(`[data-cell="${r}:${c}"]`)?.focus());

  /** Rows copied from a spreadsheet (tabs between cells, a line a row) fill the grid from the cell pasted in. */
  const paste = (e: React.ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const grid = text
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .split('\n')
      .map((l) => l.split('\t'));
    set((x) => {
      const width = Math.min(TABLE_LIMITS.cols, Math.max(cols, c + Math.max(...grid.map((g) => g.length))));
      const height = Math.min(TABLE_LIMITS.rows, Math.max(x.rows.length, r + grid.length));
      const rows = Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => grid[i - r]?.[j - c] ?? x.rows[i]?.[j] ?? ''));
      return { ...x, rows, align: Array.from({ length: width }, (_, j) => x.align[j] ?? 'l') };
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? 'Edit the table' : 'A new table'}
      width={820}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => onDone({ ...t, align: Array.from({ length: cols }, (_, i) => t.align[i] ?? 'l'), rows: t.rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? '')) })}>
            {editing ? 'Update the table' : 'Insert the table'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <div ref={box} className="overflow-x-auto overscroll-contain rounded-xl border border-line bg-bg">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {Array.from({ length: cols }, (_, c) => (
                  <th key={c} className="border-b border-line px-1 py-1 font-normal">
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center rounded-lg bg-bg-2 p-0.5">
                        {ALIGNS.map((a) => (
                          <button
                            key={a.value}
                            type="button"
                            title={a.label}
                            aria-label={a.label}
                            aria-pressed={(t.align[c] ?? 'l') === a.value}
                            onClick={() => set((x) => ({ ...x, align: Array.from({ length: cols }, (_, i) => (i === c ? a.value : (x.align[i] ?? 'l'))) }))}
                            className={cx('flex h-6 w-6 items-center justify-center rounded-md transition-colors', (t.align[c] ?? 'l') === a.value ? 'bg-panel text-fg shadow-sm' : 'text-fg-3 hover:text-fg')}
                          >
                            {a.icon}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        title="Remove this column"
                        aria-label="Remove this column"
                        disabled={cols <= 1}
                        onClick={() => delCol(c)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-err disabled:opacity-30"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </th>
                ))}
                <th className="w-8 border-b border-line" />
              </tr>
            </thead>
            <tbody>
              {t.rows.map((row, r) => (
                <tr key={r} className={cx(r === 0 && t.header && 'bg-bg-2/60')}>
                  {Array.from({ length: cols }, (_, c) => (
                    <td key={c} className="border-b border-line/70 p-0.5">
                      <input
                        data-cell={`${r}:${c}`}
                        value={row[c] ?? ''}
                        onChange={(e) => cell(r, c, e.target.value)}
                        onPaste={(e) => paste(e, r, c)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (r === t.rows.length - 1) addRow();
                            focusCell(r + 1, c);
                          }
                        }}
                        translate="no"
                        spellCheck={false}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        className={cx(
                          'h-8 w-full min-w-[110px] rounded-md bg-transparent px-2 font-mono text-[12.5px] text-fg outline-none focus:bg-bg-2 focus:ring-1 focus:ring-accent/50',
                          r === 0 && t.header && 'font-semibold',
                          (t.align[c] ?? 'l') === 'c' ? 'text-center' : (t.align[c] ?? 'l') === 'r' ? 'text-right' : 'text-left',
                        )}
                      />
                    </td>
                  ))}
                  <td className="border-b border-line/70 px-0.5">
                    <button
                      type="button"
                      title="Remove this row"
                      aria-label="Remove this row"
                      disabled={t.rows.length <= 1}
                      onClick={() => delRow(r)}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-err disabled:opacity-30"
                    >
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => (addRow(), focusCell(t.rows.length, 0))}>
            Add a row
          </Button>
          <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={addCol}>
            Add a column
          </Button>
          <span className="ml-auto text-[12px] text-fg-3">Paste rows from a spreadsheet into a cell to fill the grid.</span>
        </div>
        <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
          <div className="space-y-2">
            <span className="block text-[12.5px] font-medium text-fg-2">Lines between rows</span>
            <Segmented<TableLines>
              size="sm"
              value={t.lines}
              onChange={(lines) => set((x) => ({ ...x, lines }))}
              options={[
                { value: 'booktabs', label: 'Booktabs' },
                { value: 'hline', label: 'Ruled' },
                { value: 'all', label: 'Every row' },
                { value: 'none', label: 'No lines' },
              ]}
            />
            <label className="flex items-center justify-between gap-3 text-[13px] text-fg">
              The first row is a header
              <Switch on={t.header} onChange={(header) => set((x) => ({ ...x, header }))} label="The first row is a header" />
            </label>
            <label className="flex items-center justify-between gap-3 text-[13px] text-fg">
              Lines between columns
              <Switch on={t.rules} onChange={(rules) => set((x) => ({ ...x, rules }))} label="Lines between columns" />
            </label>
          </div>
          <div className="space-y-2">
            <label className="flex items-center justify-between gap-3 text-[13px] text-fg">
              A table with a caption, placed by LaTeX
              <Switch on={t.float} onChange={(float) => set((x) => ({ ...x, float }))} label="A table with a caption, placed by LaTeX" />
            </label>
            <input value={t.caption} disabled={!t.float} onChange={(e) => set((x) => ({ ...x, caption: e.target.value }))} placeholder="Caption" aria-label="Caption" translate="no" className={cx(inputCls, 'h-8.5 text-[13px] disabled:opacity-50')} />
            <input
              value={t.label}
              disabled={!t.float}
              onChange={(e) => set((x) => ({ ...x, label: e.target.value.replace(/[{}\\%\s]/g, '') }))}
              placeholder="Label, to refer to it (tab:results)"
              aria-label="Label"
              translate="no"
              spellCheck={false}
              className={cx(inputCls, 'h-8.5 font-mono text-[12.5px] disabled:opacity-50')}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
