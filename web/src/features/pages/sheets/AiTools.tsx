// The spreadsheet editor's AI tools that open in place: Write a formula (say what you want, get the formula with a line
// on what it does, put it in), Explain this formula (in plain words), and a table made with AI (say what it is for, see
// it, put it in here or on a sheet of its own). Each asks the helper model (server/write/sheets.ts) and says what that
// costs under its field; each has its own working state, the rest of the sheet usable meanwhile.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Sparkles, WandSparkles } from 'lucide-react';
import type { ExplainAnswer, FormulaAnswer, SheetAiCost, SheetContext, TableAnswer } from '@shared/sheet-ai';
import { api } from '../../../lib/api';
import { Button, cx, Dialog, inputCls, Popover, Throbber } from '../../../components/ui';
import { aiCost } from './ai';

/** What the helper model costs, in a line under an AI tool's field. */
export function CostLine({ className }: { className?: string }) {
  const [c, setC] = useState<SheetAiCost | null>(null);
  useEffect(() => void aiCost().then(setC), []);
  return c ? <div className={cx('text-[11.5px] leading-snug text-fg-3', className)}>{c.note}</div> : null;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** A question to the helper model, stopped by `signal`. */
export const askAi = <T,>(path: string, body: unknown, signal?: AbortSignal) => api<T>(path, { method: 'POST', body, signal });

/** Write a formula: what you want in words, the formula the helper model writes, and Insert. */
export function FormulaAi({ anchor, open, context, onInsert, onClose }: { anchor: RefObject<HTMLElement | null>; open: boolean; context: () => SheetContext; onInsert: (formula: string) => void; onClose: () => void }) {
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<FormulaAnswer | null>(null);
  const [error, setError] = useState('');
  const stop = useRef<AbortController | null>(null);
  useEffect(() => {
    if (open) return;
    stop.current?.abort();
    setBusy(false);
    setGot(null);
    setError('');
  }, [open]);
  const ask = async () => {
    if (!words.trim() || busy) return;
    stop.current?.abort();
    const c = (stop.current = new AbortController());
    setBusy(true);
    setError('');
    setGot(null);
    try {
      setGot(await askAi<FormulaAnswer>('/api/write/sheet-formula', { ...context(), ask: words.trim() }, c.signal));
    } catch (e) {
      if (!c.signal.aborted) setError(errText(e));
    } finally {
      if (stop.current === c) setBusy(false);
    }
  };
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={420} title="Write a formula">
      <form
        className="space-y-2 p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <div className="text-[12.5px] font-medium">Write a formula</div>
        <textarea
          autoFocus
          value={words}
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          rows={2}
          placeholder="Total of column C where B is Paid"
          aria-label="What the formula is to work out"
          className={cx(inputCls, 'resize-none py-2 text-[13px] leading-snug')}
        />
        <CostLine />
        {error && <div className="text-[12.5px] text-err">{error}</div>}
        {got && (
          <div className="rounded-lg border border-line bg-bg-1 p-2">
            <div translate="no" className="font-mono text-[12.5px] break-all">
              {got.formula}
            </div>
            {got.explain && <div className="mt-1 text-[12.5px] leading-snug text-fg-2">{got.explain}</div>}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {got ? (
            <>
              <Button size="sm" variant="ghost" type="submit" disabled={busy}>
                Try again
              </Button>
              <Button size="sm" variant="primary" type="button" onClick={() => (onInsert(got.formula), onClose())}>
                Insert
              </Button>
            </>
          ) : (
            <Button size="sm" variant="primary" type="submit" disabled={!words.trim() || busy} icon={busy ? <Throbber size={13} /> : <Sparkles size={14} />}>
              {busy ? 'Writing' : 'Write it'}
            </Button>
          )}
        </div>
      </form>
    </Popover>
  );
}

/** Explain this formula: the helper model's words on what the active cell's formula does. */
export function ExplainAi({ anchor, open, formula, context, onClose }: { anchor: RefObject<HTMLElement | null>; open: boolean; formula: string; context: () => SheetContext; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open || !formula) return;
    const c = new AbortController();
    setText('');
    setError('');
    askAi<ExplainAnswer>('/api/write/sheet-explain', { ...context(), formula }, c.signal)
      .then((r) => setText(r.text))
      .catch((e) => !c.signal.aborted && setError(errText(e)));
    return () => c.abort();
  }, [open, formula]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} width={400} title="Explain this formula">
      <div className="space-y-2 p-1.5">
        <div translate="no" className="font-mono text-[12px] break-all text-fg-2">
          {formula}
        </div>
        {text ? (
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap">{text}</div>
        ) : error ? (
          <div className="text-[12.5px] text-err">{error}</div>
        ) : (
          <div className="flex items-center gap-2 text-[12.5px] text-fg-3">
            <Throbber size={13} /> Explaining it
          </div>
        )}
        <CostLine />
      </div>
    </Popover>
  );
}

/** Insert → Table made with AI: say what it is for, see it, and put it in here or on a sheet of its own. */
export function TableAi({ onInsert, onClose }: { onInsert: (t: TableAnswer, where: 'here' | 'sheet') => void; onClose: () => void }) {
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<TableAnswer | null>(null);
  const [error, setError] = useState('');
  const stop = useRef<AbortController | null>(null);
  useEffect(() => () => stop.current?.abort(), []);
  const make = async () => {
    if (!words.trim() || busy) return;
    const c = (stop.current = new AbortController());
    setBusy(true);
    setError('');
    try {
      setGot(await askAi<TableAnswer>('/api/write/sheet-table', { ask: words.trim() }, c.signal));
    } catch (e) {
      if (!c.signal.aborted) setError(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const shown = (v: string | number | boolean | null) => (v === true ? '☑' : v === false ? '☐' : v === null ? '' : String(v));
  return (
    <Dialog
      open
      onClose={onClose}
      width={620}
      title="Table made with AI"
      footer={
        got ? (
          <>
            <Button variant="ghost" onClick={() => setGot(null)}>
              Make another
            </Button>
            <Button variant="ghost" onClick={() => (onInsert(got, 'sheet'), onClose())}>
              On a new sheet
            </Button>
            <Button variant="primary" onClick={() => (onInsert(got, 'here'), onClose())}>
              Insert here
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!words.trim() || busy} onClick={() => void make()} icon={busy ? <Throbber size={14} /> : <WandSparkles size={15} />}>
              {busy ? 'Making it' : 'Make the table'}
            </Button>
          </>
        )
      }
    >
      {!got ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={words}
            onChange={(e) => setWords(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void make();
            }}
            rows={3}
            placeholder="A packing list for a week in Iceland, with quantities and checkboxes"
            aria-label="The table you want"
            className={cx(inputCls, 'resize-none py-2 text-[13.5px] leading-snug')}
          />
          <CostLine />
          {error && <div className="text-[12.5px] text-err">{error}</div>}
        </div>
      ) : (
        <div className="max-h-[50vh] overflow-auto rounded-lg border border-line">
          <table translate="no" className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {got.columns.map((c, i) => (
                  <th key={i} className="border-b border-line bg-bg-1 px-2 py-1 text-left font-semibold whitespace-nowrap">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {got.rows.slice(0, 12).map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} className={cx('border-b border-line px-2 py-1 whitespace-nowrap', typeof v === 'number' && 'text-right tabular-nums')}>
                      {shown(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {got.rows.length > 12 && <div className="px-2 py-1.5 text-[12px] text-fg-3">and {got.rows.length - 12} more rows</div>}
        </div>
      )}
    </Dialog>
  );
}
