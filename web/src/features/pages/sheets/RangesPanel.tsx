// Two panels of Data: Named ranges (Excel's Name Manager: a name for a range, a value or a LAMBDA, used in formulas and
// the name box), and Protect sheets and ranges (cells that warn before they change, or refuse to until the protection
// is taken off; a whole sheet with some cells left open).
import { useState } from 'react';
import { Lock, Pencil, ShieldAlert, Trash2 } from 'lucide-react';
import { formulaProblem, isRangeName, type NamedRange, type SheetProtect } from '@shared/sheets';
import { Button, cx, IconButton, Segmented } from '../../../components/ui';
import { Row, SidePanel, smallInput } from './Panel';

export function NamesPanel({
  names,
  sheetId,
  sheetName,
  picked,
  narrow,
  onChange,
  onRename,
  onGo,
  onClose,
}: {
  names: NamedRange[];
  sheetId: string;
  sheetName: string;
  /** The cells picked, as a name's range: "'Sheet 1'!$B$2:$B$9". */
  picked: string;
  narrow: boolean;
  onChange: (names: NamedRange[]) => void;
  onRename: (from: string, to: string) => void;
  onGo: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [ref, setRef] = useState(picked);
  const [scope, setScope] = useState<'book' | 'sheet'>('book');
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState({ name: '', ref: '' });
  const clash = (n: string, sheet: string | undefined, except = -1) => names.some((x, i) => i !== except && x.name.toLowerCase() === n.toLowerCase() && (x.sheet ?? '') === (sheet ?? ''));
  const problem = (n: string, r: string, sheet: string | undefined, except = -1) =>
    !n.trim() ? '' : !isRangeName(n.trim()) ? 'A name starts with a letter and has no spaces, and is not a cell’s name (A1).' : clash(n.trim(), sheet, except) ? 'There is a name like that already.' : r.trim() && formulaProblem(r.trim().replace(/^=/, '')) ? 'That is no range, value or formula.' : '';
  const addProblem = problem(name, ref, scope === 'sheet' ? sheetId : undefined);
  const add = () => {
    if (!name.trim() || !ref.trim() || addProblem) return;
    onChange([...names, { name: name.trim(), ref: ref.trim().replace(/^=/, ''), ...(scope === 'sheet' ? { sheet: sheetId } : {}) }]);
    setName('');
  };
  return (
    <SidePanel title="Named ranges" narrow={narrow} onClose={onClose}>
      <div className="space-y-1 px-3.5 pt-3 text-[12px] leading-snug text-fg-3">A name stands for a range, a value or a LAMBDA in formulas (=SUM(Sales), =B2*TaxRate) and in the name box.</div>
      {names.map((n, i) =>
        editing === i ? (
          <Row key={i} className="space-y-1.5 border-b border-line">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="Name" translate="no" className={smallInput} />
            <input value={draft.ref} onChange={(e) => setDraft({ ...draft, ref: e.target.value })} onKeyDown={(e) => e.stopPropagation()} aria-label="What it stands for" translate="no" className={cx(smallInput, 'font-mono text-[12px]')} />
            {problem(draft.name, draft.ref, n.sheet, i) && <div className="text-[12px] text-err">{problem(draft.name, draft.ref, n.sheet, i)}</div>}
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!draft.name.trim() || !draft.ref.trim() || !!problem(draft.name, draft.ref, n.sheet, i)}
                onClick={() => {
                  const to = draft.name.trim();
                  const r = draft.ref.trim().replace(/^=/, '');
                  if (to !== n.name) onRename(n.name, to);
                  if (r !== n.ref) onChange(names.map((x, j) => (j === i ? { ...x, name: to, ref: r } : x)));
                  setEditing(null);
                }}
              >
                Save
              </Button>
            </div>
          </Row>
        ) : (
          <div key={i} className="group flex items-center gap-1 border-b border-line py-1.5 pr-1.5 pl-3.5">
            <button type="button" onClick={() => onGo(n.name)} className="min-w-0 flex-1 text-left" title="Go there">
              <div translate="no" className="truncate text-[13px] font-medium">
                {n.name}
                {n.sheet && <span className="ml-1.5 text-[11px] font-normal text-fg-3">{n.sheet === sheetId ? sheetName : 'another sheet'} only</span>}
              </div>
              <div translate="no" className="truncate font-mono text-[11.5px] text-fg-3">
                {n.ref}
              </div>
            </button>
            <IconButton
              label="Change it"
              size="sm"
              onClick={() => {
                setDraft({ name: n.name, ref: n.ref });
                setEditing(i);
              }}
            >
              <Pencil size={13} />
            </IconButton>
            <IconButton label="Delete it" size="sm" onClick={() => onChange(names.filter((_, j) => j !== i))}>
              <Trash2 size={13} />
            </IconButton>
          </div>
        ),
      )}
      <Row label="Add a name" className="space-y-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && add())} placeholder="TaxRate" aria-label="Name" translate="no" className={smallInput} />
        <input value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => (e.stopPropagation(), e.key === 'Enter' && add())} aria-label="The range, value or formula it stands for" translate="no" className={cx(smallInput, 'font-mono text-[12px]')} />
        <div className="flex items-center justify-between gap-2">
          <Segmented<'book' | 'sheet'>
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'book', label: 'Whole workbook' },
              { value: 'sheet', label: 'This sheet' },
            ]}
          />
          <Button size="sm" variant="primary" disabled={!name.trim() || !ref.trim() || !!addProblem} onClick={add}>
            Add
          </Button>
        </div>
        {addProblem && <div className="text-[12px] text-err">{addProblem}</div>}
        <Button size="sm" variant="ghost" onClick={() => setRef(picked)}>
          Use the cells picked
        </Button>
      </Row>
    </SidePanel>
  );
}

export function ProtectPanel({ list, picked, narrow, onChange, onClose }: { list: SheetProtect[]; picked: string; narrow: boolean; onChange: (list: SheetProtect[]) => void; onClose: () => void }) {
  const [what, setWhat] = useState<'range' | 'sheet'>('range');
  const [range, setRange] = useState(picked);
  const [except, setExcept] = useState('');
  const [warn, setWarn] = useState(false);
  const [note, setNote] = useState('');
  const whole = list.some((p) => !p.range);
  const add = () => {
    const p: SheetProtect = what === 'sheet' ? {} : { range: range.trim().toUpperCase() };
    if (what === 'sheet' && except.trim()) p.except = except.trim().toUpperCase();
    if (warn) p.warn = true;
    if (note.trim()) p.note = note.trim();
    onChange([...list.filter((x) => what !== 'sheet' || x.range), p]);
    setNote('');
  };
  return (
    <SidePanel title="Protect sheets and ranges" narrow={narrow} onClose={onClose}>
      <div className="px-3.5 pt-3 text-[12px] leading-snug text-fg-3">Protected cells warn before they change, or refuse to change until their protection is taken off here.</div>
      {list.map((p, i) => (
        <div key={i} className="flex items-center gap-2 border-b border-line py-2 pr-1.5 pl-3.5">
          {p.warn ? <ShieldAlert size={15} className="shrink-0 text-warn" /> : <Lock size={15} className="shrink-0 text-fg-2" />}
          <div className="min-w-0 flex-1">
            <div translate="no" className="truncate text-[13px] font-medium">
              {p.range ?? 'The whole sheet'}
            </div>
            <div className="truncate text-[11.5px] text-fg-3">
              {p.warn ? 'Warns before a change' : 'Refuses changes'}
              {p.except ? ` · open: ${p.except}` : ''}
              {p.note ? ` · ${p.note}` : ''}
            </div>
          </div>
          <IconButton label="Take this protection off" size="sm" onClick={() => onChange(list.filter((_, j) => j !== i))}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      ))}
      <Row label="Protect" className="space-y-2">
        <Segmented<'range' | 'sheet'>
          size="sm"
          value={what}
          onChange={setWhat}
          options={[
            { value: 'range', label: 'A range' },
            { value: 'sheet', label: 'The whole sheet' },
          ]}
        />
        {what === 'range' ? (
          <input value={range} onChange={(e) => setRange(e.target.value)} onKeyDown={(e) => e.stopPropagation()} aria-label="The range" translate="no" className={cx(smallInput, 'font-mono text-[12px]')} />
        ) : (
          <input value={except} onChange={(e) => setExcept(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Except these cells (B2:D20, F2:F20)" aria-label="Cells left open" translate="no" className={cx(smallInput, 'font-mono text-[12px]')} />
        )}
        <Segmented<'refuse' | 'warn'>
          size="sm"
          value={warn ? 'warn' : 'refuse'}
          onChange={(v) => setWarn(v === 'warn')}
          options={[
            { value: 'refuse', label: 'Refuse changes' },
            { value: 'warn', label: 'Show a warning' },
          ]}
        />
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Why (optional)" aria-label="Why it is protected" className={smallInput} />
        <div className="flex justify-end">
          <Button size="sm" variant="primary" disabled={what === 'range' && !range.trim()} onClick={add}>
            {what === 'sheet' && whole ? 'Protect it instead' : 'Protect'}
          </Button>
        </div>
      </Row>
    </SidePanel>
  );
}
