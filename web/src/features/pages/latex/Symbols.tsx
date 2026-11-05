// The Symbols panel of the LaTeX editor (the toolbar's Ω, and Insert → Symbol): maths symbols by group (Greek letters,
// operators, relations, arrows, brackets, accents, big operators, more), drawn with KaTeX, with a field that finds one
// by its name or command, and those used lately first. A click puts its command at the cursor (the editor wraps it in
// $…$ when the cursor is not in maths, and loads the package it needs).
import { useEffect, useMemo, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import { cx } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { loadKatex, texHtmlNow } from '../common/katex';
import { symDraw, SYMBOLS, type Sym } from './symbols';

const RECENT_KEY = 'wa.tex.symbols.recent';
const GROUP_KEY = 'wa.tex.symbols.group';
const ALL = SYMBOLS.flatMap((g) => g.syms);
const TAB_MARK: Record<string, string> = { greek: '\\alpha', operators: '\\pm', relations: '\\leq', arrows: '\\to', brackets: '\\langle\\rangle', accents: '\\hat{a}', big: '\\textstyle\\sum', more: '\\infty' };

function recent(): Sym[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    return list.map((t) => ALL.find((s) => s[0] === t)).filter((s): s is Sym => !!s);
  } catch {
    return [];
  }
}

/** Remembers a symbol as used, most recent first. */
export function rememberSymbol(s: Sym) {
  const list = [
    s[0],
    ...recent()
      .map((x) => x[0])
      .filter((t) => t !== s[0]),
  ].slice(0, 16);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}

const fold = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');

export function SymbolsPanel({ onPick }: { onPick: (s: Sym) => void }) {
  const [q, setQ] = useState('');
  const used = useMemo(recent, []);
  const [group, setGroup] = useState(() => localStorage.getItem(GROUP_KEY) ?? (used.length ? 'recent' : 'greek'));
  const [ready, setReady] = useState(false);
  const [over, setOver] = useState<Sym | null>(null);
  useEffect(() => {
    let alive = true;
    void loadKatex().then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(GROUP_KEY, group);
    } catch {}
  }, [group]);
  const words = fold(q.trim());
  const shown = words ? ALL.filter((s) => fold(`${s[0]} ${s[1]} ${tr(s[1])}`).includes(words)).slice(0, 96) : group === 'recent' ? used : (SYMBOLS.find((g) => g.id === group)?.syms ?? []);
  const label = words ? `${shown.length} symbol${shown.length === 1 ? '' : 's'}` : group === 'recent' ? 'Used lately' : (SYMBOLS.find((g) => g.id === group)?.label ?? '');
  const draw = (tex: string) => (ready ? (texHtmlNow(tex, false) ?? '') : '');
  return (
    <div className="flex w-full flex-col gap-1.5 p-1">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a symbol"
          aria-label="Find a symbol"
          spellCheck={false}
          className="h-8.5 w-full rounded-lg border border-line bg-bg pr-2.5 pl-8 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
        />
      </div>
      {!words && (
        <div role="tablist" className="flex items-center justify-between gap-0.5">
          {used.length > 0 && (
            <button
              type="button"
              role="tab"
              aria-selected={group === 'recent'}
              title="Used lately"
              aria-label="Used lately"
              onClick={() => setGroup('recent')}
              className={cx('flex h-8 w-8 items-center justify-center rounded-lg transition-colors', group === 'recent' ? 'bg-bg-3 text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg')}
            >
              <Clock size={14} />
            </button>
          )}
          {SYMBOLS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={group === g.id}
              title={g.label}
              aria-label={g.label}
              onClick={() => setGroup(g.id)}
              className={cx('flex h-8 min-w-8 items-center justify-center overflow-hidden rounded-lg px-1 text-[12px] transition-colors', group === g.id ? 'bg-bg-3 text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
              dangerouslySetInnerHTML={{ __html: draw(TAB_MARK[g.id]) }}
            />
          ))}
        </div>
      )}
      <div className="px-1 text-[11.5px] font-medium text-fg-3">{label}</div>
      <div className="grid max-h-[min(44vh,260px)] grid-cols-8 gap-0.5 overflow-y-auto overscroll-contain">
        {shown.map((s) => (
          <button
            key={s[0]}
            type="button"
            title={`${s[0]}${s[2] ? ` (${s[2]})` : ''}`}
            aria-label={s[0]}
            onMouseEnter={() => setOver(s)}
            onFocus={() => setOver(s)}
            onClick={() => onPick(s)}
            className="flex h-10 min-w-0 items-center justify-center overflow-hidden rounded-lg text-[15px] text-fg transition-colors hover:bg-bg-2"
          >
            <span translate="no" className="pointer-events-none max-w-full" dangerouslySetInnerHTML={{ __html: draw(symDraw(s)) }} />
          </button>
        ))}
        {!shown.length && <p className="col-span-8 py-6 text-center text-[12.5px] text-fg-3">No symbol has those words.</p>}
      </div>
      <div translate="no" className="flex h-6 items-center gap-2 border-t border-line px-1 pt-1 font-mono text-[11.5px] text-fg-2">
        {over ? (
          <>
            <span className="truncate">{over[0]}</span>
            {over[2] && <span className="shrink-0 text-fg-3">{over[2]}</span>}
          </>
        ) : null}
      </div>
    </div>
  );
}
