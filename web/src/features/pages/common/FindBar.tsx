// The bar every editor shows to find words and put others in their place (Ctrl+F, and Ctrl+H to replace): what to
// find, how many there are and which one is on view ("3 of 12"), the one before and the next (Shift+Enter, Enter),
// Match case, Whole words and Regular expression, and under them, when replacing, the words to put in with Replace
// and Replace all. The editor works out the matches (find.ts), marks them and goes to the current one; the bar only
// holds what is asked (useFind) and says what the editor found. The switches are remembered on this device. The bar
// has no place of its own: the editor puts it where it fits, over the top right of what it edits, say.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaseSensitive, ChevronDown, ChevronRight, ChevronUp, Regex, WholeWord, X } from 'lucide-react';
import { Button, cx, IconButton } from '../../../components/ui';
import { FIND_DEFAULTS, type FindOptions } from './find';

const OPTS_KEY = 'wa.find.opts';

export interface FindState {
  open: boolean;
  /** The replace row shows. */
  replacing: boolean;
  query: string;
  replacement: string;
  options: FindOptions;
  /** Changes each time the bar is asked for again (Ctrl+F pressed while it shows): it takes the keys and picks its words. */
  focusKey: number;
  /** Opens the bar (with the replace row too); while it shows, it takes the keys again. */
  show: (replace?: boolean) => void;
  close: () => void;
  setQuery: (q: string) => void;
  setReplacement: (r: string) => void;
  setOptions: (o: FindOptions) => void;
  setReplacing: (on: boolean) => void;
}

function savedOptions(): FindOptions {
  try {
    const o = JSON.parse(localStorage.getItem(OPTS_KEY) ?? 'null');
    if (o && typeof o === 'object') return { matchCase: !!o.matchCase, wholeWord: !!o.wholeWord, regex: !!o.regex };
  } catch {}
  return FIND_DEFAULTS;
}

/** What the find bar holds, kept by the editor that shows it. */
export function useFind(): FindState {
  const [open, setOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [options, setOpts] = useState<FindOptions>(savedOptions);
  const [focusKey, setFocusKey] = useState(0);
  const show = useCallback((replace?: boolean) => {
    setOpen(true);
    if (replace) setReplacing(true);
    setFocusKey((k) => k + 1);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  const setOptions = useCallback((o: FindOptions) => {
    setOpts(o);
    try {
      localStorage.setItem(OPTS_KEY, JSON.stringify(o));
    } catch {}
  }, []);
  return useMemo(() => ({ open, replacing, query, replacement, options, focusKey, show, close, setQuery, setReplacement, setOptions, setReplacing }), [open, replacing, query, replacement, options, focusKey, show, close, setOptions]);
}

/** A switch on the bar: lit while on. */
function Toggle({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors', on ? 'bg-accent-soft text-accent' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
    >
      {children}
    </button>
  );
}

const fieldCls = 'h-8 w-full min-w-0 rounded-lg border border-line bg-bg px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-accent';

export function FindBar({
  find,
  count,
  index,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  extra,
  className,
}: {
  find: FindState;
  count: number;
  /** The match on view, from 0, or -1. */
  index: number;
  onNext: () => void;
  onPrev: () => void;
  /** Without it there is no replace row (a document only to read). */
  onReplace?: () => void;
  onReplaceAll?: () => void;
  /** More switches under the fields ("All sheets", "In formulas"). */
  extra?: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const canReplace = !!onReplace;
  const { query, options: o } = find;

  // Asked for again (Ctrl+F while it shows): back to the words to find, picked so typing replaces them.
  useEffect(() => {
    if (!find.open) return;
    const el = input.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [find.open, find.focusKey]);

  const keys = (e: React.KeyboardEvent, replaceRow: boolean) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      find.close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (replaceRow && (e.ctrlKey || e.metaKey) && e.altKey) onReplaceAll?.();
      else if (replaceRow) onReplace?.();
      else if (e.shiftKey) onPrev();
      else onNext();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
      // The editor's own Ctrl+F would only ask for the bar again: pick the words instead.
      e.preventDefault();
      input.current?.select();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'h' || e.key === 'H') && canReplace) {
      e.preventDefault();
      find.setReplacing(!find.replacing);
    }
  };

  const status = !query ? '' : count === 0 ? 'No matches' : index >= 0 ? `${index + 1} of ${count}` : count === 1 ? '1 match' : `${count} matches`;
  const broken = !!query && o.regex && count === 0 && !validRegex(query);

  return (
    <div role="search" className={cx('w-[min(440px,calc(100vw-16px))] rounded-xl border border-line bg-elevated p-1.5 shadow-lg', className)}>
      <div className="flex items-center gap-1">
        {canReplace && (
          <button
            type="button"
            title={find.replacing ? 'Hide replace' : 'Replace'}
            aria-label={find.replacing ? 'Hide replace' : 'Replace'}
            aria-expanded={find.replacing}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => find.setReplacing(!find.replacing)}
            className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg"
          >
            {find.replacing ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            ref={input}
            value={query}
            onChange={(e) => find.setQuery(e.target.value)}
            onKeyDown={(e) => keys(e, false)}
            placeholder="Find"
            aria-label="Find"
            spellCheck={false}
            className={cx(fieldCls, 'pr-24', broken && 'border-err focus:border-err')}
          />
          {status && <span className={cx('pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[11.5px] tabular-nums', count === 0 ? 'text-err' : 'text-fg-3')}>{status}</span>}
        </div>
        <Toggle label="Match case" on={o.matchCase} onClick={() => find.setOptions({ ...o, matchCase: !o.matchCase })}>
          <CaseSensitive size={16} />
        </Toggle>
        <Toggle label="Whole words" on={o.wholeWord} onClick={() => find.setOptions({ ...o, wholeWord: !o.wholeWord })}>
          <WholeWord size={16} />
        </Toggle>
        <Toggle label="Regular expression" on={o.regex} onClick={() => find.setOptions({ ...o, regex: !o.regex })}>
          <Regex size={15} />
        </Toggle>
        <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />
        <IconButton label="Previous match" size="sm" disabled={count === 0} onMouseDown={(e) => e.preventDefault()} onClick={onPrev}>
          <ChevronUp size={16} />
        </IconButton>
        <IconButton label="Next match" size="sm" disabled={count === 0} onMouseDown={(e) => e.preventDefault()} onClick={onNext}>
          <ChevronDown size={16} />
        </IconButton>
        <IconButton label="Close" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={find.close}>
          <X size={15} />
        </IconButton>
      </div>
      {canReplace && find.replacing && (
        <div className="mt-1.5 flex items-center gap-1 pl-7">
          <input value={find.replacement} onChange={(e) => find.setReplacement(e.target.value)} onKeyDown={(e) => keys(e, true)} placeholder="Replace with" aria-label="Replace with" spellCheck={false} className={cx(fieldCls, 'flex-1')} />
          <Button size="sm" variant="ghost" disabled={count === 0} onMouseDown={(e) => e.preventDefault()} onClick={onReplace} className="shrink-0">
            Replace
          </Button>
          <Button size="sm" variant="ghost" disabled={count === 0} onMouseDown={(e) => e.preventDefault()} onClick={onReplaceAll} className="shrink-0">
            Replace all
          </Button>
        </div>
      )}
      {extra && <div className={cx('mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-fg-2', canReplace ? 'pl-7' : 'pl-1')}>{extra}</div>}
    </div>
  );
}

function validRegex(q: string): boolean {
  try {
    new RegExp(q, 'u');
    return true;
  } catch {
    try {
      new RegExp(q);
      return true;
    } catch {
      return false;
    }
  }
}
