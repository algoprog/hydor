// Parts of the LaTeX editor: the dialog that names a file, the errors and warnings under the source (each going to
// its line, TeX's log a click away), and the outline of the document's sections.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleAlert, ScrollText, Sparkles, TriangleAlert } from 'lucide-react';
import type { TexCompiled, TexHeading, TexIssue } from '@shared/latex';
import { Button, cx, Dialog, inputCls } from '../../../components/ui';

/** Where an error or a warning is, in a few characters: "main.tex:12". */
export const where = (x: TexIssue) => (x.file ? `${x.file}${x.line ? `:${x.line}` : ''}` : x.line ? `line ${x.line}` : '');

/** A name to give, in a dialog: a new file's, or a new name for one. */
export function NameDialog({
  open,
  title,
  initial,
  hint,
  check,
  onClose,
  onDone,
}: {
  open: boolean;
  title: string;
  initial: string;
  hint: string;
  check: (name: string) => string | null;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const why = name.trim() ? check(name.trim()) : null;
  const done = () => {
    if (!name.trim() || why) return;
    onDone(name.trim());
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={done} disabled={!name.trim() || !!why}>
            OK
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          done();
        }}
        className="space-y-2"
      >
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} translate="no" spellCheck={false} />
        <p className={cx('text-[12.5px]', why ? 'text-err' : 'text-fg-3')}>{why ?? hint}</p>
      </form>
    </Dialog>
  );
}

/** The errors and warnings of the last typesetting, each going to its line; TeX's log a click away. */
export function Problems({
  result,
  open,
  onToggle,
  onGo,
  onLog,
  onAsk,
}: {
  result: TexCompiled | null;
  open: boolean;
  onToggle: () => void;
  onGo: (x: TexIssue) => void;
  onLog: () => void;
  onAsk?: () => void;
}) {
  const errors = result?.errors ?? [];
  const warnings = result?.warnings ?? [];
  const items = [...errors.map((x) => ({ x, err: true })), ...warnings.map((x) => ({ x, err: false }))];
  return (
    <div className="shrink-0 border-t border-line bg-panel">
      <div className="flex h-9 items-center gap-1 pr-1.5 pl-1">
        <button type="button" onClick={onToggle} disabled={!items.length} className="flex h-7 min-w-0 items-center gap-2 rounded-lg px-1.5 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 disabled:hover:bg-transparent">
          {!result ? (
            <span className="text-fg-3">Not typeset yet</span>
          ) : result.missing ? (
            <span className="truncate text-fg-3">Not typeset here</span>
          ) : !items.length ? (
            <span className="flex items-center gap-1.5 text-fg-3">
              <Check size={14} className="text-ok" />
              No problems
            </span>
          ) : (
            <>
              {errors.length > 0 && (
                <span className="flex items-center gap-1 font-medium text-err">
                  <CircleAlert size={14} />
                  {`${errors.length} error${errors.length === 1 ? '' : 's'}`}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="flex items-center gap-1 text-warn">
                  <TriangleAlert size={14} />
                  {`${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
                </span>
              )}
              {open ? <ChevronDown size={13} className="text-fg-3" /> : <ChevronUp size={13} className="text-fg-3" />}
            </>
          )}
        </button>
        <span className="flex-1" />
        {onAsk && errors.length > 0 && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={13} className="text-accent" />} onClick={onAsk} className="h-7 px-2 text-[12.5px]">
            Ask the agent to fix them
          </Button>
        )}
        {result?.log ? (
          <Button size="sm" variant="ghost" icon={<ScrollText size={13} />} onClick={onLog} className="h-7 px-2 text-[12.5px]">
            Log
          </Button>
        ) : null}
      </div>
      {open && items.length > 0 && (
        <ul className="max-h-[min(40vh,320px)] overflow-y-auto overscroll-contain border-t border-line py-1">
          {items.map(({ x, err }, i) => (
            <li key={i}>
              <button type="button" onClick={() => onGo(x)} disabled={!x.file && !x.line} className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors hover:bg-bg-2 disabled:hover:bg-transparent">
                {err ? <CircleAlert size={14} className="mt-0.5 shrink-0 text-err" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                  {where(x) && (
                    <span translate="no" className="mr-1.5 font-mono text-[11.5px] text-fg-3">
                      {where(x)}
                    </span>
                  )}
                  <span translate="no" className="text-fg">
                    {x.message}
                  </span>
                  {x.hint && <span className="block text-fg-3">{x.hint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The document's sections, to go to one; the one the cursor is in stands out. */
export function OutlineList({ outline, current, onGo }: { outline: TexHeading[]; current: TexHeading | null; onGo: (h: TexHeading) => void }) {
  if (!outline.length) return <p className="px-3 py-3 text-[12.5px] leading-relaxed text-fg-3">No sections yet: \section&#123;…&#125; makes one.</p>;
  const top = Math.min(...outline.map((h) => h.level));
  return (
    <nav translate="no" className="py-1">
      {outline.map((h, i) => (
        <button
          key={`${h.file}:${h.line}:${i}`}
          type="button"
          onClick={() => onGo(h)}
          title={`${h.file}:${h.line}`}
          style={{ paddingLeft: 10 + Math.min(4, h.level - top) * 12 }}
          className={cx(
            'block w-full truncate py-1 pr-2 text-left text-[12.5px] transition-colors hover:bg-bg-2',
            h === current ? 'bg-accent-soft font-medium text-accent' : h.level - top === 0 ? 'text-fg' : 'text-fg-2',
          )}
        >
          {h.title}
        </button>
      ))}
    </nav>
  );
}
