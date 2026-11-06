// Parts of the LaTeX editor: the dialog that names a file, the errors and warnings under the source (each going to
// its line, TeX's log a click away), and the outline of the document's sections.
import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleAlert, ScrollText, Sparkles, TriangleAlert } from 'lucide-react';
import type { TexCompiled, TexHeading, TexIssue } from '@shared/latex';
import { Button, cx, Dialog, inputCls, Throbber } from '../../../components/ui';

/** Where an error or a warning is, in a few characters: "main.tex:12" (`name`: a file's name as the tabs show it). */
export const where = (x: TexIssue, name: (file: string) => string = (f) => f) => (x.file ? `${name(x.file)}${x.line ? `:${x.line}` : ''}` : x.line ? `line ${x.line}` : '');

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
  name,
  ai,
}: {
  result: TexCompiled | null;
  open: boolean;
  onToggle: () => void;
  onGo: (x: TexIssue) => void;
  onLog: () => void;
  /** A file's name as the tabs show it. */
  name?: (file: string) => string;
  onAsk?: () => void;
  /** AI beside each: Explain (in plain words, under it) and Fix (a change to accept); none for an older version. */
  ai?: { help: (x: TexIssue) => { busy?: boolean; text?: string; error?: string } | undefined; explain: (x: TexIssue, warning: boolean) => void; fix?: (x: TexIssue) => void };
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
          {items.map(({ x, err }, i) => {
            const got = ai?.help(x);
            return (
              <li key={i} className="group/problem">
                <div className="flex items-start transition-colors hover:bg-bg-2">
                  <button type="button" onClick={() => onGo(x)} disabled={!x.file && !x.line} className="flex min-w-0 flex-1 items-start gap-2 py-1.5 pl-3 text-left">
                    {err ? <CircleAlert size={14} className="mt-0.5 shrink-0 text-err" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0 text-warn" />}
                    <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                      {where(x, name) && (
                        <span translate="no" className="mr-1.5 font-mono text-[11.5px] text-fg-3">
                          {where(x, name)}
                        </span>
                      )}
                      <span translate="no" className="text-fg">
                        {x.message}
                      </span>
                      {x.hint && <span className="block text-fg-3">{x.hint}</span>}
                    </span>
                  </button>
                  {ai && (
                    <span className="flex shrink-0 items-center gap-0.5 py-1 pr-2 pl-1 opacity-70 group-hover/problem:opacity-100 pointer-coarse:opacity-100">
                      <button type="button" onClick={() => ai.explain(x, !err)} className={cx('h-6 rounded-md px-1.5 text-[12px] text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg', got?.text && 'text-accent')}>
                        {got?.busy ? <Throbber className="h-3 w-3" /> : 'Explain'}
                      </button>
                      {err && ai.fix && (
                        <button type="button" onClick={() => ai.fix!(x)} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg">
                          <Sparkles size={12} className="text-accent" />
                          Fix
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {(got?.text || got?.error) && <p className={cx('mx-3 mb-1.5 ml-[34px] rounded-lg px-2.5 py-1.5 text-[12.5px] leading-relaxed', got.error ? 'text-err' : 'bg-bg-2 text-fg-2')}>{got.text ?? got.error}</p>}
              </li>
            );
          })}
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
