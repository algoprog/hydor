// A picker of emoji and special characters, for the editors' Insert → Special characters and for an icon (a callout's,
// a page's): Emoji or Symbols, the groups of each on tabs, and a field that finds a character by its English name
// ("arrow", "euro", "theta", "heart"). The ones picked lately come first. It is what goes inside a Popover: the editor
// opens it and puts the character where it should go. Pressing a character leaves the focus where it was, so the
// caret in a document stays put. The names are English search words, so they are left as they are in other languages.
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { cx, Segmented } from '../../../components/ui';
import { allChars, CHAR_GROUPS, type CharEntry } from './chars';

const RECENT_KEY = 'wa.chars.recent';
const RECENT_MAX = 24;

function recentChars(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

const keep = (e: React.MouseEvent) => {
  if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
};

export function CharPicker({ onPick, kinds = ['emoji', 'symbols'] }: { onPick: (ch: string) => void; kinds?: ('emoji' | 'symbols')[] }) {
  const [kind, setKind] = useState<'emoji' | 'symbols'>(kinds[0] ?? 'emoji');
  const groups = useMemo(() => CHAR_GROUPS.filter((g) => g.kind === kind), [kind]);
  const [group, setGroup] = useState<string>(groups[0]?.id ?? '');
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<string[]>(recentChars);
  const [hover, setHover] = useState<CharEntry | null>(null);
  const all = useMemo(allChars, []);
  const allowed = useMemo(() => new Set(CHAR_GROUPS.filter((g) => kinds.includes(g.kind)).map((g) => g.id)), [kinds]);
  const byChar = useMemo(() => new Map(all.map((c) => [c.ch, c])), [all]);

  const current = groups.some((g) => g.id === group) ? group : groups[0]?.id;
  const words = q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const list: CharEntry[] = useMemo(() => {
    if (words.length) {
      const seen = new Set<string>();
      return all.filter((c) => {
        if (!allowed.has(c.group) || seen.has(c.ch)) return false;
        const hay = ` ${c.words.toLocaleLowerCase()} ${c.ch}`;
        const ok = words.every((w) => hay.includes(` ${w}`) || hay.includes(w));
        if (ok) seen.add(c.ch);
        return ok;
      });
    }
    return all.filter((c) => c.group === current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, allowed, current, words.join(' ')]);
  const recents = useMemo(() => recent.map((ch) => byChar.get(ch) ?? { ch, words: '', group: '' }).filter((c) => !c.group || allowed.has(c.group)), [recent, byChar, allowed]);

  const pick = (ch: string) => {
    onPick(ch);
    const next = [ch, ...recent.filter((x) => x !== ch)].slice(0, RECENT_MAX);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const emojiNow = words.length ? false : kind === 'emoji';
  const cell = (c: CharEntry, key: string) => (
    <button
      key={key}
      type="button"
      title={c.words || c.ch}
      aria-label={c.words || c.ch}
      onMouseEnter={() => setHover(c)}
      onFocus={() => setHover(c)}
      onClick={() => pick(c.ch)}
      className={cx('flex h-9 items-center justify-center rounded-lg hover:bg-bg-2', emojiNow || /\p{Extended_Pictographic}/u.test(c.ch) ? 'text-[21px]' : 'text-[18px] text-fg')}
    >
      {c.ch}
    </button>
  );

  return (
    <div className="flex w-full flex-col" onMouseDown={keep}>
      <div className="flex items-center gap-1.5 p-1">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find by name"
            aria-label="Find a character"
            spellCheck={false}
            className="h-8 w-full rounded-lg border border-line bg-bg pr-2 pl-7.5 text-[13px] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
          />
        </div>
        {kinds.length > 1 && (
          <Segmented
            size="sm"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setQ('');
            }}
            options={[
              { value: 'emoji', label: 'Emoji' },
              { value: 'symbols', label: 'Symbols' },
            ]}
          />
        )}
      </div>
      {!words.length && (
        <div className="flex gap-0.5 px-1 pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              title={g.label}
              aria-label={g.label}
              aria-pressed={g.id === current}
              onClick={() => setGroup(g.id)}
              className={cx('flex h-8 min-w-0 flex-1 items-center justify-center rounded-lg text-[16px] transition-colors', g.id === current ? 'bg-bg-2 text-fg' : 'text-fg-2 opacity-70 hover:bg-bg-2 hover:opacity-100')}
            >
              {g.icon}
            </button>
          ))}
        </div>
      )}
      <div className="h-[244px] overflow-y-auto overscroll-contain px-1">
        {!words.length && recents.length > 0 && (
          <>
            <div className="px-1 pt-1 pb-0.5 text-[11.5px] font-medium text-fg-3">Recently used</div>
            <div translate="no" className="grid grid-cols-8 gap-0.5">
              {recents.map((c) => cell(c, `r:${c.ch}`))}
            </div>
            <div className="px-1 pt-2 pb-0.5 text-[11.5px] font-medium text-fg-3">{groups.find((g) => g.id === current)?.label}</div>
          </>
        )}
        {list.length ? (
          <div translate="no" className="grid grid-cols-8 gap-0.5">
            {list.map((c) => cell(c, `${c.group}:${c.ch}`))}
          </div>
        ) : (
          <div className="px-2 py-6 text-center text-[13px] text-fg-3">Nothing found by that name.</div>
        )}
      </div>
      <div className="flex h-8 items-center gap-2 border-t border-line px-2.5 text-[12px] text-fg-3">
        {hover ? (
          <>
            <span className="text-[16px] text-fg">{hover.ch}</span>
            <span translate="no" className="truncate">
              {hover.words}
            </span>
          </>
        ) : (
          <span>Point at a character to see its name.</span>
        )}
      </div>
    </div>
  );
}
