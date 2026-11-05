// An editor's menus, as Google Docs and Office have them: a row of named menus (Edit, View, Insert, Format, Tools…)
// that hold everything the editor can do, each action with its keys beside it and a tick for what is on. A list inside
// a menu opens in the menu's place, with the way back at its top, never as a menu over a menu. While one menu is open,
// pointing at another's name opens that one, and the arrow keys move through the rows and from menu to menu, as a menu
// bar does. Search the menus (the magnifier at the row's end, or Alt+/) finds any action by its words, in English or
// in the language the app is read in, and does it. Where there is no room for the row (a phone, a narrow panel) one
// button holds the menus; with compact 'auto' the bar tells by itself, from the room it is given beside the editor's
// title. Pressing a menu never takes the focus from what is being edited, so the words or cells picked stay picked for
// the action.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Menu as MenuIcon, Search } from 'lucide-react';
import { cx, IconButton, MenuBack, MenuItem, MenuSep, Popover } from '../../../components/ui';
import { tr } from '../../../i18n/runtime';
import { keyLabel } from './keys';

export interface MenuAction {
  /** Its words in the menu: "Find and replace". */
  label: string;
  icon?: ReactNode;
  /** Its keys, as the editors write them ("Ctrl+H"); shown the way this computer writes them. */
  keys?: string;
  /** Ticked: a setting that is on. */
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  /** More words Search the menus finds it by ("search replace"). */
  also?: string;
  run?: () => void;
  /** A list that opens in the menu's place instead. */
  items?: MenuEntry[];
}

/** An action, '-' for a line between groups, or nothing (left out, so `cond && {…}` works). */
export type MenuEntry = MenuAction | '-' | false | null | undefined;

export interface MenuDef {
  label: string;
  items: MenuEntry[];
}

/** The entries to show: no gaps, and no line at either end or twice in a row. */
function shown(items: MenuEntry[]): (MenuAction | '-')[] {
  const out: (MenuAction | '-')[] = [];
  for (const it of items) {
    if (!it) continue;
    if (it === '-') {
      if (out.length && out[out.length - 1] !== '-') out.push('-');
    } else out.push(it);
  }
  while (out[out.length - 1] === '-') out.pop();
  return out;
}

/** Keeps the editor's focus (and its selection) while a menu is pressed; fields inside a menu still take it. */
const keepFocus = (e: React.MouseEvent) => {
  const t = e.target as HTMLElement;
  if (t.closest('input,textarea,select,[contenteditable="true"]')) return;
  e.preventDefault();
};

/** The rows of a menu that can be pressed, in order. */
const rowsOf = (el: HTMLElement | null) => (el ? [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')] : []);

/** Moves through a menu's rows with ↑ and ↓ (and Home, End), wrapping round. */
function moveFocus(e: ReactKeyboardEvent<HTMLElement>, box: HTMLElement | null) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return false;
  const rows = rowsOf(box);
  if (!rows.length) return false;
  e.preventDefault();
  const i = rows.indexOf(document.activeElement as HTMLButtonElement);
  const n = rows.length;
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : i < 0 ? n - 1 : (i - 1 + n) % n;
  rows[next].focus();
  return true;
}

/** A menu's list: its rows, a list inside it opened in its place, and the way back. */
function MenuList({ items, close, title }: { items: MenuEntry[]; close: () => void; title?: string }) {
  const [path, setPath] = useState<MenuAction[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const inner = path[path.length - 1];
  const rows = shown(inner ? (inner.items ?? []) : items);
  // A list opened from the keyboard starts on its first row, so ↓ and Enter go on from there.
  const [keyed, setKeyed] = useState(false);
  useEffect(() => {
    if (keyed) rowsOf(box.current)[path.length ? 1 : 0]?.focus();
  }, [path.length, keyed]);
  return (
    <div
      ref={box}
      role="menu"
      aria-label={title}
      onMouseDown={keepFocus}
      onKeyDown={(e) => {
        if (moveFocus(e, box.current)) return setKeyed(true);
        if (e.key === 'ArrowLeft' && path.length) {
          e.preventDefault();
          e.stopPropagation();
          setKeyed(true);
          setPath((p) => p.slice(0, -1));
        }
      }}
    >
      {inner && <MenuBack onClick={() => setPath((p) => p.slice(0, -1))}>{inner.label}</MenuBack>}
      {rows.map((it, i) =>
        it === '-' ? (
          <MenuSep key={`sep${i}`} />
        ) : (
          <Fragment key={`${it.label}${i}`}>
            <div
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' && it.items && !it.disabled) {
                  e.preventDefault();
                  e.stopPropagation();
                  setKeyed(true);
                  setPath((p) => [...p, it]);
                }
              }}
            >
              <MenuItem
                icon={it.icon}
                hint={it.keys ? keyLabel(it.keys) : undefined}
                checked={it.checked}
                disabled={it.disabled}
                danger={it.danger}
                submenu={!!it.items}
                onClick={() => {
                  if (it.items) return setPath((p) => [...p, it]);
                  close();
                  it.run?.();
                }}
              >
                {it.label}
              </MenuItem>
            </div>
          </Fragment>
        ),
      )}
    </div>
  );
}

/** Every action in the menus with where it is ("Format › Text"), for Search the menus. */
function allActions(menus: MenuDef[]): { a: MenuAction; path: string[] }[] {
  const out: { a: MenuAction; path: string[] }[] = [];
  const walk = (items: MenuEntry[], path: string[]) => {
    for (const it of items) {
      if (!it || it === '-') continue;
      if (it.items) walk(it.items, [...path, it.label]);
      else if (it.run && !it.disabled) out.push({ a: it, path });
    }
  };
  for (const m of menus) walk(m.items, [m.label]);
  return out;
}

const fold = (s: string) =>
  s
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '');

/** The actions whose words (in English or the app's language) have every word of the query; best first. */
function search(menus: MenuDef[], query: string): { a: MenuAction; path: string[] }[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { a: MenuAction; path: string[]; score: number }[] = [];
  for (const x of allActions(menus)) {
    const label = fold(`${x.a.label} ${tr(x.a.label)}`);
    const rest = fold(`${x.a.also ?? ''} ${x.path.map((p) => `${p} ${tr(p)}`).join(' ')}`);
    let score = 0;
    let ok = true;
    for (const w of words) {
      const inLabel = label.indexOf(w);
      if (inLabel === 0) score += 6;
      else if (inLabel > 0 && /[\s(“"'-]/.test(label[inLabel - 1] ?? '')) score += 4;
      else if (inLabel > 0) score += 2;
      else if (rest.includes(w)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ ...x, score: score - label.length / 200 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 9);
}

/** Search the menus: a field, and the actions it finds, the first one done with Enter. */
function MenuSearch({ menus, close }: { menus: MenuDef[]; close: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const found = useMemo(() => search(menus, q), [menus, q]);
  useEffect(() => setAt(0), [q]);
  const run = (i: number) => {
    const x = found[i];
    if (!x) return;
    close();
    x.a.run?.();
  };
  return (
    <div className="w-full" onMouseDown={keepFocus}>
      <div className="relative p-1">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-3" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (found.length) setAt((i) => (i + (e.key === 'ArrowDown' ? 1 : found.length - 1)) % found.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(at);
            }
          }}
          placeholder="Search the menus"
          aria-label="Search the menus"
          spellCheck={false}
          className="h-9 w-full rounded-lg border border-line bg-bg pr-2.5 pl-8 text-[13.5px] text-fg outline-none placeholder:text-fg-3 focus:border-accent"
        />
      </div>
      {q.trim() && !found.length && <div className="px-3 py-2.5 text-[13px] text-fg-3">Nothing in the menus has those words.</div>}
      {found.map((x, i) => (
        <button
          key={`${x.path.join('/')}/${x.a.label}`}
          type="button"
          onMouseEnter={() => setAt(i)}
          onClick={() => run(i)}
          className={cx('flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-fg', i === at && 'bg-bg-2')}
        >
          <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">{x.a.icon}</span>
          <span className="min-w-0 flex-1 truncate">
            <span>{x.a.label}</span>
            <span className="ml-2 text-[11.5px] text-fg-3">
              {x.path.map((p, j) => (
                <Fragment key={j}>
                  {j > 0 && <span aria-hidden> › </span>}
                  <span>{p}</span>
                </Fragment>
              ))}
            </span>
          </span>
          {x.a.checked && <span className="shrink-0 text-[11.5px] text-accent">✓</span>}
          {x.a.keys && <span className="shrink-0 text-[11.5px] text-fg-3">{keyLabel(x.a.keys)}</span>}
        </button>
      ))}
    </div>
  );
}

const WIDTH = 272;

/** Whether the row of menu names fits the room the bar has: its root (which takes what room there is) against the row measured unseen. */
function useRowFits(on: boolean, menus: MenuDef[]) {
  const root = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [ok, setOk] = useState(true);
  useLayoutEffect(() => {
    if (!on) return;
    const a = root.current;
    const b = row.current;
    if (!a || !b) return;
    const check = () => setOk(b.scrollWidth <= a.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(a);
    ro.observe(b);
    return () => ro.disconnect();
  }, [on, menus]);
  return { root, row, ok };
}

/** The menus of an editor: a row of names (or one button when compact), and Search the menus at the end. */
export function MenuBar({
  menus,
  compact,
  className,
}: {
  menus: MenuDef[];
  /** One Menus button instead of the row; 'auto': the row when it fits the room the bar is given, else the button. */
  compact?: boolean | 'auto';
  className?: string;
}) {
  const fits = useRowFits(compact === 'auto', menus);
  const folded = compact === 'auto' ? !fits.ok : !!compact;
  const [open, setOpen] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);
  const names = useRef<(HTMLButtonElement | null)[]>([]);
  // One steady anchor per menu name, so an open menu keeps its place and its listeners across renders.
  const anchors = useMemo(() => menus.map(() => ({ current: null as HTMLButtonElement | null })), [menus.length]);
  const one = useRef<HTMLButtonElement>(null);
  const finder = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(null), []);
  const closeSearch = useCallback(() => setSearching(false), []);

  // Alt+/ (⌥/ on a Mac, whose key gives "÷") opens Search the menus wherever the focus is in the editor.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (/^Slash$/.test(e.code) || e.key === '/')) {
        e.preventDefault();
        setOpen(null);
        setSearching(true);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  // ← and → go from one menu to the next while one is open (a list inside it goes back first).
  const across = (e: ReactKeyboardEvent, i: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const n = menus.length;
    const next = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
    setOpen(next);
    requestAnimationFrame(() => names.current[next]?.focus());
  };

  const asOne: MenuDef[] = useMemo(() => [{ label: 'Menus', items: menus.map((m) => ({ label: m.label, items: m.items })) }], [menus]);

  return (
    // Folded, it is never narrower than its two buttons: squeezed further, they would slide under the buttons beside it.
    <div ref={fits.root} className={cx('relative flex items-center gap-0.5', !folded && 'min-w-0', compact === 'auto' && 'flex-1', className)} onMouseDown={keepFocus}>
      {compact === 'auto' && (
        // The row as it would be, unseen, to tell whether it fits (in the app's language: its words are translated too).
        <div ref={fits.row} aria-hidden className="pointer-events-none invisible absolute top-0 left-0 flex items-center gap-0.5 whitespace-nowrap">
          {menus.map((m) => (
            <span key={m.label} className="h-7 shrink-0 px-2 text-[13px]">
              {m.label}
            </span>
          ))}
          <span className="ml-0.5 w-7 shrink-0" />
        </div>
      )}
      {folded ? (
        <>
          <IconButton ref={one} label="Menus" active={open === 0} onClick={() => setOpen((o) => (o === 0 ? null : 0))}>
            <MenuIcon size={17} />
          </IconButton>
          <Popover anchor={one} open={open === 0} onClose={close} width={WIDTH} title="Menus">
            <MenuList items={asOne[0].items} close={close} title="Menus" />
          </Popover>
        </>
      ) : (
        menus.map((m, i) => (
          <Fragment key={m.label}>
            <button
              ref={(el) => {
                names.current[i] = el;
                anchors[i].current = el;
              }}
              type="button"
              aria-haspopup="menu"
              aria-expanded={open === i}
              onClick={() => setOpen((o) => (o === i ? null : i))}
              onMouseEnter={() => open !== null && open !== i && setOpen(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && open === null) {
                  e.preventDefault();
                  setOpen(i);
                } else if (open !== null) across(e, i);
              }}
              className={cx('h-7 shrink-0 rounded-md px-2 text-[13px] whitespace-nowrap transition-colors', open === i ? 'bg-bg-2 text-fg' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
            >
              {m.label}
            </button>
            <Popover anchor={anchors[i]} open={open === i} onClose={close} width={WIDTH} title={m.label}>
              <div onKeyDown={(e) => across(e, i)}>
                <MenuList items={m.items} close={close} title={m.label} />
              </div>
            </Popover>
          </Fragment>
        ))
      )}
      <IconButton ref={finder} label="Search the menus (Alt+/)" size="sm" active={searching} onClick={() => setSearching((s) => !s)} className="ml-0.5">
        <Search size={15} />
      </IconButton>
      <Popover anchor={finder} open={searching} onClose={closeSearch} width={380} title="Search the menus">
        <MenuSearch menus={menus} close={closeSearch} />
      </Popover>
    </div>
  );
}
