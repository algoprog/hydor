// Above the grid: the name box (the cell or range picked; type a name such as C12 or B2:D9, and Enter goes there)
// and the formula bar (what the cell holds: its formula, or its value as one would type it; type there too). While
// a formula is typed, the functions that start with what is typed are offered, and the one being filled in shows how
// it is written, the argument the caret is in in bold, with a line on what it gives.
import { useEffect, useRef, useState } from 'react';
import { SquareFunction } from 'lucide-react';
import { FUNCTION_NAMES } from '@shared/sheets';
import { cx } from '../../../components/ui';
import { argAt, argsOf, FUNCTION_INFO } from './functions';

/**
 * What to offer while a formula is typed: functions starting with the word before the caret, and the one being filled
 * in (its name, and which of its arguments the caret is in: the commas before it in the call).
 */
export function formulaHelp(text: string, caret: number): { word: string; names: string[]; inside: { name: string; arg: number } | null } {
  if (!text.startsWith('=')) return { word: '', names: [], inside: null };
  const before = text.slice(0, caret);
  // Not inside quoted words.
  if ((before.match(/"/g)?.length ?? 0) % 2) return { word: '', names: [], inside: null };
  const m = /(?:^=|[=(,;+\-*/^&<>:\s%])([A-Za-z][A-Za-z0-9.]*)$/.exec(before);
  const word = m ? m[1].toUpperCase() : '';
  const names = word ? FUNCTION_NAMES.filter((n) => n.startsWith(word) && n !== word).slice(0, 6) : [];
  // The innermost function whose ( is still open before the caret, and the commas of its own before the caret.
  let depth = 0;
  let commas = 0;
  let inside: { name: string; arg: number } | null = null;
  let quoted = false;
  for (let i = before.length - 1; i >= 0; i--) {
    const ch = before[i];
    if (ch === '"') quoted = !quoted;
    if (quoted) continue;
    if (ch === ')' || ch === '}') depth++;
    else if (ch === '{') depth--;
    else if ((ch === ',' || ch === ';') && depth === 0) commas++;
    else if (ch === '(') {
      if (depth === 0) {
        const f = /([A-Za-z][A-Za-z0-9.]*)$/.exec(before.slice(0, i));
        const name = f ? f[1].toUpperCase() : '';
        inside = FUNCTION_INFO[name] ? { name, arg: commas } : null;
        break;
      }
      depth--;
    }
  }
  return { word, names, inside };
}

/** A function as it is written, the argument the caret is in in bold. */
function Signature({ name, arg }: { name: string; arg: number }) {
  const { args } = argsOf(FUNCTION_INFO[name][0]);
  const on = argAt(args, arg);
  return (
    <span translate="no" className="font-mono text-[12px] text-fg-2">
      {name}(
      {args.map((a, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <span className={i === on ? 'font-bold text-fg' : undefined}>{a}</span>
        </span>
      ))}
      )
    </span>
  );
}

export function FormulaBar({
  name,
  onName,
  text,
  editing,
  readOnly,
  narrow,
  caret,
  onStart,
  onText,
  onCaret,
  onKey,
  onSuggest,
  barRef,
}: {
  /** The selection's name ("B2", "B2:D9"). */
  name: string;
  onName: (text: string) => boolean;
  /** What the bar shows: the words being typed, or what the cell holds. */
  text: string;
  /** Words are being typed (anywhere). */
  editing: boolean;
  readOnly?: boolean;
  narrow: boolean;
  caret: number;
  onStart: () => void;
  onText: (text: string, caret: number) => void;
  onCaret: (text: string, caret: number) => void;
  onKey: (e: React.KeyboardEvent<HTMLElement>) => void;
  onSuggest: (name: string) => void;
  barRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [box, setBox] = useState(name);
  const [boxFocus, setBoxFocus] = useState(false);
  useEffect(() => {
    if (!boxFocus) setBox(name);
  }, [name, boxFocus]);
  const help = editing ? formulaHelp(text, caret) : null;
  const lines = Math.min(4, text.split('\n').length);
  const nameRef = useRef<HTMLInputElement>(null);
  return (
    <div className="relative flex shrink-0 items-stretch border-b border-line bg-bg">
      <input
        ref={nameRef}
        value={box}
        aria-label="Name box: the cell picked; type a cell or range to go there"
        title="Type a cell (C12) or a range (B2:D9) and press Enter to go there"
        spellCheck={false}
        translate="no"
        onFocus={(e) => {
          setBoxFocus(true);
          e.target.select();
        }}
        onBlur={() => {
          setBoxFocus(false);
          setBox(name);
        }}
        onChange={(e) => setBox(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (onName(box)) nameRef.current?.blur();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            setBox(name);
            nameRef.current?.blur();
          }
          e.stopPropagation();
        }}
        className={cx('h-8 shrink-0 border-r border-line bg-transparent px-2 text-[12.5px] font-medium tabular-nums outline-none focus:bg-bg-1', narrow ? 'w-[68px]' : 'w-[96px]')}
      />
      <span className="grid w-8 shrink-0 place-items-center text-fg-3" aria-hidden>
        <SquareFunction size={15} />
      </span>
      <textarea
        ref={barRef}
        value={text}
        rows={lines}
        readOnly={readOnly}
        aria-label="What the cell holds: its formula or value"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        translate="no"
        onFocus={() => !editing && !readOnly && onStart()}
        onChange={(e) => onText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onSelect={(e) => editing && onCaret((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
        onKeyDown={(e) => {
          if (!editing) return;
          if (e.key === 'Tab' && help?.names.length) {
            e.preventDefault();
            onSuggest(help.names[0]);
            return;
          }
          onKey(e);
        }}
        className="min-h-8 min-w-0 flex-1 resize-none bg-transparent py-[7px] pr-2 font-mono text-[12.5px] leading-[18px] outline-none"
      />
      {help && (help.names.length > 0 || help.inside) && (
        <div className="absolute top-full right-2 left-[136px] z-40 mt-1 max-w-[460px] overflow-hidden rounded-xl border border-line bg-elevated p-1 shadow-lg max-sm:left-2">
          {help.inside && !help.names.length && (
            <div className="px-2 py-1">
              <Signature name={help.inside.name} arg={help.inside.arg} />
              <div className="mt-0.5 text-[12px] leading-snug text-fg-3">{FUNCTION_INFO[help.inside.name][1]}</div>
            </div>
          )}
          {help.names.map((n, i) => (
            <button key={n} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => onSuggest(n)} className={cx('flex w-full flex-col rounded-lg px-2 py-1 text-left hover:bg-bg-2', i === 0 && 'bg-bg-2')}>
              <span className="flex w-full items-center gap-2">
                <span translate="no" className="font-mono text-[12.5px] font-medium">
                  {n}
                </span>
                <span translate="no" className="min-w-0 truncate font-mono text-[11.5px] text-fg-3">
                  {FUNCTION_INFO[n]?.[0].replace(/^[^(]*/, '') ?? '(…)'}
                </span>
                {i === 0 && <span className="ml-auto shrink-0 text-[11px] text-fg-3">Tab</span>}
              </span>
              {i === 0 && FUNCTION_INFO[n] && <span className="truncate text-[11.5px] text-fg-3">{FUNCTION_INFO[n][1]}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
