// A folder's contents: the heart of the Files page, and of a space's Files tab. A list that says when each
// thing changed and how big it is (a folder's arrow opens it in place, as a tree), or tiles with pictures;
// sorted by name, date, size or kind, folders first. The field narrows the list as you type; Enter searches
// everything under the folder, inside files too. Pick several (the box at a row's start, Ctrl or Shift with a
// click, or a long press on a phone) to act on them at once. Drag rows onto a folder to move them (Alt
// copies), or files from the computer anywhere to upload them. A right-click or ⋯ has the rest, and the
// keyboard works too: arrows, Enter, Backspace for the folder above, F2, Delete, Ctrl+A.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import {
  ArrowDownUp,
  ArrowUp,
  Boxes,
  Check,
  Copy,
  ChevronLeft,
  ChevronRight,
  Download,
  Ellipsis,
  Eye,
  FilePlus2,
  Folder,
  FolderInput,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  MessageSquarePlus,
  Pin,
  PinOff,
  Plus,
  Search,
  SquareTerminal,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FolderFinder } from '../../components/FolderPicker';
import { RefreshIcon } from '../../components/RefreshIcon';
import { Button, cx, Empty, IconButton, MenuBack, MenuItem, MenuSep, Popover, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { api, post, put } from '../../lib/api';
import { basename, bytes, dirname, joinPath } from '../../lib/format';
import { mu } from '../../lib/machine';
import { openFile } from '../../lib/nav';
import { toastError, useApp, useUI } from '../../lib/store';
import { pickedFromInput, startUpload } from '../../lib/upload';
import { FileIcon } from '../documents/fileTypes';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { addToSpace, copyPaths, download, dragStart, dropInto, moveInto, newSessionIn, rename, startSession, takesDrop, trash, type Item } from './actions';
import { ItemMenu, useFolderLead } from './ItemMenu';
import { Crumbs, upOf } from './Places';
import { setPinned, setPrefs, useFilesPrefs, usePinned, type SortBy } from './prefs';
import { SpaceChoices } from './SpaceMenu';
import { NewSpaceDialog } from '../spaces/parts';
import { LOCALE } from '../../i18n/locale';

export interface FsEntry {
  name: string;
  path: string;
  type: 'dir' | 'file' | 'symlink' | 'other';
  size: number;
  mtime: number;
  git?: string;
  dirLink?: boolean;
}

export const isDir = (e: Pick<FsEntry, 'type' | 'dirLink'>) => e.type === 'dir' || !!e.dirLink;
const itemFor = (e: FsEntry): Item => ({ path: e.path, name: e.name, dir: isDir(e), size: isDir(e) ? undefined : e.size });

// The folders listed so far (by whether hidden files show, and path): shown at once on the way back while
// they are asked for again.
const listed = new Map<string, FsEntry[] | { error: string }>();
const keyOf = (dir: string, hidden: boolean) => `${hidden ? 1 : 0}${dir}`;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const extOf = (n: string) => {
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i + 1).toLowerCase() : '';
};

/** Folders first; then by name, the last changed, the biggest, or kind (each the other way round with `reverse`). */
export function sortEntries(list: FsEntry[], by: SortBy, reverse: boolean): FsEntry[] {
  const cmp = (a: FsEntry, b: FsEntry) => {
    const c = by === 'modified' ? b.mtime - a.mtime : by === 'size' && !isDir(a) && !isDir(b) ? b.size - a.size : by === 'kind' ? collator.compare(extOf(a.name), extOf(b.name)) : 0;
    const byName = collator.compare(a.name, b.name);
    return reverse ? -(c || byName) : c || byName;
  };
  return [...list].sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || cmp(a, b));
}

// Made once: a formatter made for each row would cost a lot in a big folder.
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' });
const yearFmt = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const fullFmt = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** When something changed, as a list says it: just now, 5 min ago, 14:32 (today), Yesterday, 12 Oct, 12 Oct 2024. */
export function changedWhen(t: number, now = Date.now()): string {
  if (!t) return '';
  const s = (now - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  const d = new Date(t);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return timeFmt.format(d);
  if (d.toDateString() === new Date(now - 86_400_000).toDateString()) return 'Yesterday';
  return (d.getFullYear() === today.getFullYear() ? dayFmt : yearFmt).format(d);
}

const GIT_CLS: Record<string, string> = { M: 'text-warn', A: 'text-ok', U: 'text-ok', D: 'text-err', R: 'text-info', C: 'text-err', '•': 'text-warn' };
const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
// Fingers: rows don't drag, a long press picks one instead.
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
/** Rows shown at first: a folder of thousands shows the rest on asking. */
const FIRST = 400;

type Row = { kind: 'item'; e: FsEntry; depth: number } | { kind: 'note'; key: string; depth: number; text: string };

const expandedKey = (dir: string) => `wa.tree.${dir}`;
function loadExpanded(dir: string): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(expandedKey(dir)) ?? '[]');
    return new Set(Array.isArray(v) ? v.filter((p: unknown) => typeof p === 'string' && p.startsWith(`${dir}/`)) : []);
  } catch {
    return new Set();
  }
}

/** An element's width, as it changes (0 until it is known). */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** A thing's icon: a folder, a picture's own thumbnail (tiles), or its kind's tile. */
function Icon({ e, size, thumb }: { e: FsEntry; size: number; thumb?: boolean }) {
  const [bad, setBad] = useState(false);
  if (isDir(e))
    return (
      <span className="flex shrink-0 items-center justify-center text-accent/80" style={{ width: size, height: size }}>
        <Folder size={Math.round(size * (thumb ? 0.62 : 0.78))} strokeWidth={thumb ? 1.4 : 1.9} fill="currentColor" fillOpacity={0.14} />
      </span>
    );
  if (thumb && PICTURE.test(e.name) && !bad)
    return (
      <img
        src={mu(`/api/fs/raw?path=${encodeURIComponent(e.path)}&t=${e.mtime}`)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setBad(true)}
        className="h-full w-full object-cover"
        draggable={false}
      />
    );
  return <FileIcon path={e.path} size={size} className={thumb ? 'rounded-xl' : 'rounded-md'} />;
}

/** The name field of a row being named (a new file or folder, or one renamed). */
function NameInput({ initial = '', dir, depth = 0, onDone }: { initial?: string; dir: boolean; depth?: number; onDone: (name: string) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (val: string) => {
    if (done.current) return;
    done.current = true;
    onDone(val);
  };
  return (
    <div style={{ paddingLeft: 10 + depth * 18 }} className="flex h-9 items-center gap-2 pr-3 max-md:h-14">
      <span className="w-4 shrink-0" />
      {dir ? <Folder size={18} className="shrink-0 text-accent/80" /> : <FilePlus2 size={18} className="shrink-0 text-fg-3" />}
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => {
          const dot = initial.lastIndexOf('.');
          e.target.setSelectionRange(0, dot > 0 && !dir ? dot : initial.length);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') finish(v);
          if (e.key === 'Escape') finish('');
        }}
        onBlur={() => finish(v)}
        aria-label={dir ? 'Folder name' : 'File name'}
        placeholder={dir ? 'Folder name' : 'File name'}
        className="h-7 min-w-0 flex-1 rounded-md border border-accent/60 bg-bg-1 px-2 text-[13.5px] outline-none max-md:h-9 max-md:text-[15px]"
      />
    </div>
  );
}

interface RowProps {
  e: FsEntry;
  depth: number;
  open: boolean;
  picked: boolean;
  picking: boolean;
  focused: boolean;
  drop: boolean;
  narrow: boolean;
  onClick: (ev: React.MouseEvent) => void;
  onPick: () => void;
  onToggle: () => void;
  onMenu: (el: HTMLElement, at?: { x: number; y: number }) => void;
  onLongPress: () => void;
  onDragStart: (ev: DragEvent) => void;
  onDragOver: (ev: DragEvent) => void;
  onDrop: (ev: DragEvent) => void;
}

/** A row of the list: the box to pick it, a folder's arrow, its icon and name, when it changed, its size, ⋯. */
const ListRow = memo(function ListRow({ e, depth, open, picked, picking, focused, drop, narrow, onClick, onPick, onToggle, onMenu, onLongPress, onDragStart, onDragOver, onDrop }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  const dir = isDir(e);
  const when = changedWhen(e.mtime);
  return (
    <div
      ref={ref}
      role="row"
      aria-selected={picked}
      data-path={e.path}
      draggable={!TOUCH}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onMenu(ref.current!, { x: ev.clientX, y: ev.clientY });
      }}
      onTouchStart={() => {
        press.current = window.setTimeout(() => {
          press.current = null;
          onLongPress();
        }, 480);
      }}
      onTouchEnd={(ev) => {
        // The long press picked it: the tap that ends it doesn't open it too.
        if (press.current === null) ev.preventDefault();
        else clearTimeout(press.current);
      }}
      onTouchMove={() => press.current && clearTimeout(press.current)}
      style={{ paddingLeft: 4 + depth * 18 }}
      className={cx(
        'group flex h-9 cursor-pointer items-center gap-2 pr-1.5 text-[13.5px] select-none [-webkit-touch-callout:none] max-md:h-14 max-md:gap-3 max-md:pr-1 max-md:text-[15px]',
        picked ? 'bg-accent/12' : 'hover:bg-bg-2 max-md:active:bg-bg-2',
        focused && 'outline-1 -outline-offset-1 outline-accent/50',
        drop && 'bg-accent/15 outline-1 -outline-offset-1 outline-accent/70',
      )}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={picked ? `Unpick ${e.name}` : `Pick ${e.name}`}
        onClick={(ev) => {
          ev.stopPropagation();
          onPick();
        }}
        className={cx(
          'flex size-6 shrink-0 items-center justify-center rounded-md transition-opacity max-md:size-7',
          picked || picking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-md:hidden',
        )}
      >
        <span
          className={cx('flex size-4 items-center justify-center rounded-[5px] border transition-colors max-md:size-5', picked ? 'border-accent bg-accent text-accent-fg' : 'border-line-2 bg-bg-1')}
        >
          {picked && <Check size={11} strokeWidth={3} />}
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={open ? `Close ${e.name} in place` : `Open ${e.name} in place`}
        onClick={(ev) => {
          ev.stopPropagation();
          onToggle();
        }}
        className={cx('-ml-1 flex size-5 shrink-0 items-center justify-center rounded text-fg-3 hover:bg-bg-3 hover:text-fg max-md:hidden', !dir && 'invisible')}
      >
        <ChevronRight size={13} className={cx('transition-transform', open && 'rotate-90')} />
      </button>
      <Icon e={e} size={narrow ? 36 : 20} />
      <span className="min-w-0 flex-1">
        <span translate="no" title={e.path} className={cx('block truncate', e.git && e.git !== '•' && GIT_CLS[e.git])}>
          {e.name}
        </span>
        {narrow && (
          <span className="block truncate text-[12.5px] text-fg-3">
            {!dir && (
              <>
                <span>{bytes(e.size)}</span>
                {' · '}
              </>
            )}
            <span>{when}</span>
          </span>
        )}
      </span>
      {(e.git || !narrow) && <span className={cx('w-3 shrink-0 text-center font-mono text-[11px]', e.git && (GIT_CLS[e.git] ?? 'text-fg-3'))}>{e.git}</span>}
      {!narrow && (
        <>
          <span className="tnum w-24 shrink-0 truncate text-right text-[12.5px] text-fg-3 @max-[560px]:hidden" title={e.mtime ? fullFmt.format(e.mtime) : undefined}>
            {when}
          </span>
          <span className="tnum w-20 shrink-0 text-right text-[12.5px] text-fg-3 @max-[460px]:hidden">{dir ? '' : bytes(e.size)}</span>
        </>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`More for ${e.name}`}
        onClick={(ev) => {
          ev.stopPropagation();
          onMenu(ev.currentTarget);
        }}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-fg-3 opacity-0 group-hover:opacity-100 hover:bg-bg-3 hover:text-fg max-md:size-10 max-md:opacity-100"
      >
        <Ellipsis size={15} />
      </button>
    </div>
  );
});

/** A tile: the picture (or the kind's icon), the name, and its size or when it changed. */
const Tile = memo(function Tile({
  e,
  picked,
  picking,
  focused,
  drop,
  onClick,
  onPick,
  onMenu,
  onLongPress,
  onDragStart,
  onDragOver,
  onDrop,
}: Omit<RowProps, 'depth' | 'open' | 'narrow' | 'onToggle'>) {
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  return (
    <div
      ref={ref}
      role="row"
      aria-selected={picked}
      data-path={e.path}
      draggable={!TOUCH}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onMenu(ref.current!, { x: ev.clientX, y: ev.clientY });
      }}
      onTouchStart={() => {
        press.current = window.setTimeout(() => {
          press.current = null;
          onLongPress();
        }, 480);
      }}
      onTouchEnd={(ev) => {
        if (press.current === null) ev.preventDefault();
        else clearTimeout(press.current);
      }}
      onTouchMove={() => press.current && clearTimeout(press.current)}
      className={cx(
        'group relative flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-xl p-1.5 select-none [-webkit-touch-callout:none]',
        picked ? 'bg-accent/12' : 'hover:bg-bg-2',
        focused && 'outline-1 -outline-offset-1 outline-accent/50',
        drop && 'bg-accent/15 outline-1 -outline-offset-1 outline-accent/70',
      )}
      title={e.path}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-bg-1">
        <Icon e={e} size={56} thumb />
      </div>
      <div className="min-w-0 px-0.5">
        <div translate="no" className="truncate text-[13px] leading-5">
          {e.name}
        </div>
        <div className="truncate text-[11.5px] text-fg-3">{isDir(e) ? changedWhen(e.mtime) : bytes(e.size)}</div>
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-label={picked ? `Unpick ${e.name}` : `Pick ${e.name}`}
        onClick={(ev) => {
          ev.stopPropagation();
          onPick();
        }}
        className={cx(
          'absolute top-2.5 left-2.5 flex size-6 items-center justify-center rounded-md transition-opacity',
          picked || picking ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-md:hidden',
        )}
      >
        <span className={cx('flex size-5 items-center justify-center rounded-md border shadow-sm', picked ? 'border-accent bg-accent text-accent-fg' : 'border-line-2 bg-bg-1/90')}>
          {picked && <Check size={12} strokeWidth={3} />}
        </span>
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label={`More for ${e.name}`}
        onClick={(ev) => {
          ev.stopPropagation();
          onMenu(ev.currentTarget);
        }}
        className="absolute top-2.5 right-2.5 flex size-7 items-center justify-center rounded-md bg-bg-1/90 text-fg-3 opacity-0 shadow-sm group-hover:opacity-100 hover:text-fg max-md:opacity-100"
      >
        <Ellipsis size={15} />
      </button>
    </div>
  );
});

/** A column's title over the list, which sorts by it (again: the other way round). */
function SortHead({ by, label, className }: { by: SortBy; label: string; className?: string }) {
  const { sort, reverse } = useFilesPrefs();
  const on = sort === by;
  return (
    <button
      type="button"
      onClick={() => setPrefs(on ? { reverse: !reverse } : { sort: by, reverse: false })}
      className={cx('flex items-center gap-1 rounded px-1 text-[12px] font-medium transition-colors hover:text-fg', on ? 'text-fg-2' : 'text-fg-3', className)}
    >
      {label}
      {/* Up for A to Z (and the oldest or smallest first), down the other way. */}
      {on && <ArrowUp size={11} className={cx((by === 'name' || by === 'kind') === reverse && 'rotate-180')} />}
    </button>
  );
}

const SORTS: [SortBy, string][] = [
  ['name', 'Name'],
  ['modified', 'Date changed'],
  ['size', 'Size'],
  ['kind', 'Kind'],
];

export interface FolderViewProps {
  dir: string;
  onDir: (d: string) => void;
  /** The top of the steps, and the folder it can't go above (a space's own). */
  base?: { path: string; label: string; icon?: ReactNode };
  /** Picked at first and shown (Show in its folder). */
  select?: string | null;
  /** Where a file opens: the Files page's tabs, or a window over the page. */
  onFile?: (path: string) => void;
  /** Enter in the field: a search of everything under the folder. */
  onSearch?: (q: string) => void;
  /** Inside another page (a space's Files tab): no pinning, no session here. */
  embedded?: boolean;
}

export function FolderView({ dir, onDir, base, select, onFile = openFile, onSearch, embedded }: FolderViewProps) {
  const mobile = useIsMobile();
  const home = useApp((s) => s.boot?.home);
  // A narrow view (a phone, or a small window beside the sidebar) keeps its bar short: the field behind a
  // button, how it shows under ⋯.
  const rootRef = useRef<HTMLDivElement>(null);
  const width = useWidth(rootRef);
  const tight = mobile || (width > 0 && width < 600);
  const hidden = useUI((s) => s.showHidden);
  const { view, sort, reverse } = useFilesPrefs();
  const pins = usePinned();
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => loadExpanded(dir));
  const [filter, setFilter] = useState('');
  const [finding, setFinding] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set(select ? [select] : []));
  // On a phone, picking is a mode: a long press starts it, and taps pick until it ends.
  const [picking, setPicking] = useState(false);
  const anchor = useRef<string | null>(select ?? null);
  const [focus, setFocus] = useState<string | null>(select ?? null);
  // The ring around the row the keys are on shows once keys are used, until the pointer is.
  const [keys, setKeys] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState<'file' | 'dir' | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ items: Item[]; el: HTMLElement | null; at?: { x: number; y: number } } | null>(null);
  const [newMenu, setNewMenu] = useState(false);
  const [more, setMore] = useState<false | 'main' | 'sort'>(false);
  const [bar, setBar] = useState<false | 'move' | 'space'>(false);
  const [newSpaceFor, setNewSpaceFor] = useState<Item[] | null>(null);
  const [limit, setLimit] = useState(FIRST);
  const [confirm, confirmNode] = useConfirm();
  const menuAnchor = useRef<HTMLElement | null>(null);
  const pointRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const moveRef = useRef<HTMLButtonElement>(null);
  const spaceRef = useRef<HTMLButtonElement>(null);
  const barMoreRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const uploadTo = useRef(dir);
  const grid = view === 'grid';
  const top = base && (dir === base.path || !dir.startsWith(`${base.path}/`)) ? null : upOf(dir);

  // Another folder: start afresh there.
  useEffect(() => {
    setExpanded(loadExpanded(dir));
    setFilter('');
    setFinding(false);
    setSel(new Set(select ? [select] : []));
    setPicking(false);
    anchor.current = select ?? null;
    setFocus(select ?? null);
    setRenaming(null);
    setCreating(null);
    setLimit(FIRST);
  }, [dir, select]);

  useEffect(() => {
    try {
      localStorage.setItem(expandedKey(dir), JSON.stringify([...expanded].slice(0, 200)));
    } catch {}
  }, [expanded, dir]);

  const load = useCallback(
    async (d: string) => {
      try {
        const r = await api<{ entries: FsEntry[] }>(`/api/fs/list?path=${encodeURIComponent(d)}${hidden ? '&hidden=1' : ''}`);
        listed.set(keyOf(d, hidden), r.entries);
      } catch (e) {
        listed.set(keyOf(d, hidden), { error: (e as Error).message });
      }
      setVersion((n) => n + 1);
    },
    [hidden],
  );
  const refresh = useCallback(() => {
    void load(dir);
    for (const p of expanded) void load(p);
  }, [dir, expanded, load]);
  useEffect(refresh, [refresh]);
  // Agents change files all the time: what is on screen stays fresh.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  // Picked shows where it is.
  useEffect(() => {
    if (!select) return;
    const t = setTimeout(() => listRef.current?.querySelector(`[data-path="${CSS.escape(select)}"]`)?.scrollIntoView({ block: 'center' }), 60);
    return () => clearTimeout(t);
  }, [select, dir]);

  const got = listed.get(keyOf(dir, hidden));
  const error = got && !Array.isArray(got) ? got.error : null;
  const entries = Array.isArray(got) ? got : null;
  const f = filter.trim().toLowerCase();

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (d: string, depth: number): boolean => {
      const list = listed.get(keyOf(d, hidden));
      if (!list) {
        if (depth) out.push({ kind: 'note', key: `${d}/…`, depth, text: 'Loading…' });
        return false;
      }
      if (!Array.isArray(list)) {
        if (depth) out.push({ kind: 'note', key: `${d}/!`, depth, text: list.error });
        return false;
      }
      if (!list.length && depth && !f) out.push({ kind: 'note', key: `${d}/∅`, depth, text: 'Empty' });
      let any = false;
      for (const e of sortEntries(list, sort, reverse)) {
        const at = out.length;
        out.push({ kind: 'item', e, depth });
        let keep = !f || e.name.toLowerCase().includes(f);
        if (!grid && isDir(e) && expanded.has(e.path)) keep = walk(e.path, depth + 1) || keep;
        if (keep) any = true;
        else out.length = at;
      }
      return any;
    };
    walk(dir, 0);
    return out;
    // `version` moves on with every listing read.
  }, [dir, hidden, sort, reverse, expanded, f, grid, version]);
  const items = useMemo(() => rows.filter((r): r is Extract<Row, { kind: 'item' }> => r.kind === 'item'), [rows]);
  const picked = items.filter((r) => sel.has(r.e.path)).map((r) => itemFor(r.e));
  const shown = rows.slice(0, limit);

  const pick = (p: string, only = false) => {
    anchor.current = p;
    setFocus(p);
    setSel((s) => {
      if (only) return new Set([p]);
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  };
  const pickRange = (from: string, to: string) => {
    const a = items.findIndex((r) => r.e.path === from);
    const b = items.findIndex((r) => r.e.path === to);
    if (a < 0 || b < 0) return pick(to);
    const [i, j] = a < b ? [a, b] : [b, a];
    setSel(new Set(items.slice(i, j + 1).map((r) => r.e.path)));
    setFocus(to);
  };
  const clearPicks = () => {
    setSel(new Set());
    setPicking(false);
  };
  useEffect(() => {
    if (picking && !sel.size) setPicking(false);
  }, [picking, sel.size]);

  const openEntry = (e: FsEntry) => (isDir(e) ? onDir(e.path) : onFile(e.path));
  const toggle = (p: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else {
        n.add(p);
        if (!listed.has(keyOf(p, hidden))) void load(p);
      }
      return n;
    });

  const showMenu = (list: Item[], el: HTMLElement | null, at?: { x: number; y: number }) => {
    menuAnchor.current = at ? pointRef.current : el;
    setMenu({ items: list, el, at });
  };
  const menuFor = (e: FsEntry) => (el: HTMLElement, at?: { x: number; y: number }) => {
    // A right-click on something not picked is about it alone.
    if (!sel.has(e.path)) {
      setSel(new Set());
      showMenu([itemFor(e)], el, at);
    } else showMenu(picked, el, at);
  };

  const create = async (name: string) => {
    const kind = creating;
    setCreating(null);
    const n = name.trim();
    if (!kind || !n) return;
    const p = joinPath(dir, n);
    try {
      if (kind === 'dir') await post('/api/fs/mkdir', { path: p });
      else await put('/api/fs/write', { path: p, content: '', create: true });
      await load(dir);
      if (kind === 'file') onFile(p);
    } catch (e) {
      toastError(e);
    }
  };

  const upload = (to: string, folder = false) => {
    uploadTo.current = to;
    (folder ? folderInput : fileInput).current?.click();
  };
  const onPicked = (list: FileList | null) => {
    if (list?.length) void startUpload(uploadTo.current, pickedFromInput(list), [], refresh);
  };

  const onKeyDown = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (renaming || creating) return;
    if (!keys) setKeys(true);
    const i = items.findIndex((r) => r.e.path === focus);
    const cur = i >= 0 ? items[i] : null;
    const move = (to: number) => {
      const r = items[Math.max(0, Math.min(items.length - 1, to))];
      if (!r) return;
      ev.preventDefault();
      if (ev.shiftKey) pickRange(anchor.current ?? r.e.path, r.e.path);
      else {
        anchor.current = r.e.path;
        setFocus(r.e.path);
      }
      listRef.current?.querySelector(`[data-path="${CSS.escape(r.e.path)}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    const mod = ev.metaKey || ev.ctrlKey;
    if (ev.key === 'ArrowDown') move(i + (grid ? Math.max(1, Math.floor((listRef.current?.clientWidth ?? 600) / 140)) : 1));
    else if (ev.key === 'ArrowUp') move(i < 0 ? 0 : i - (grid ? Math.max(1, Math.floor((listRef.current?.clientWidth ?? 600) / 140)) : 1));
    else if (ev.key === 'ArrowRight' && grid) move(i + 1);
    else if (ev.key === 'ArrowLeft' && grid) move(i - 1);
    else if (ev.key === 'ArrowRight' && cur && isDir(cur.e) && !expanded.has(cur.e.path)) toggle(cur.e.path);
    else if (ev.key === 'ArrowLeft' && cur && expanded.has(cur.e.path)) toggle(cur.e.path);
    else if (ev.key === 'Home') move(0);
    else if (ev.key === 'End') move(items.length - 1);
    else if (ev.key === 'Enter' && cur) (ev.preventDefault(), openEntry(cur.e));
    else if (ev.key === ' ' && cur) (ev.preventDefault(), pick(cur.e.path));
    else if (ev.key === 'Backspace' && !mod && top) (ev.preventDefault(), onDir(top));
    else if ((ev.key === 'Delete' || (ev.key === 'Backspace' && ev.metaKey)) && (picked.length || cur)) (ev.preventDefault(), void trash(picked.length ? picked : [itemFor(cur!.e)], confirm, refresh));
    else if (ev.key === 'F2' && cur) (ev.preventDefault(), setRenaming(cur.e.path));
    else if (mod && ev.key.toLowerCase() === 'a') (ev.preventDefault(), setSel(new Set(items.map((r) => r.e.path))));
    else if (ev.key === 'Escape' && (sel.size || f)) (ev.preventDefault(), sel.size ? clearPicks() : setFilter(''));
    else if (ev.key.length === 1 && !mod && !ev.altKey && ev.key !== ' ') {
      // Typing narrows the list.
      setFinding(true);
      setFilter((v) => v + ev.key);
      requestAnimationFrame(() => field.current?.focus());
      ev.preventDefault();
    }
  };

  const rowProps = (e: FsEntry) => ({
    picked: sel.has(e.path),
    picking: sel.size > 0 || picking,
    focused: focus === e.path && keys,
    drop: drop === e.path,
    onClick: (ev: React.MouseEvent) => {
      if (ev.metaKey || ev.ctrlKey) return pick(e.path);
      if (ev.shiftKey && anchor.current) return pickRange(anchor.current, e.path);
      if (picking) return pick(e.path);
      anchor.current = e.path;
      setFocus(e.path);
      openEntry(e);
    },
    onPick: () => {
      if (mobile) setPicking(true);
      pick(e.path);
    },
    onMenu: menuFor(e),
    onLongPress: () => {
      navigator.vibrate?.(10);
      setPicking(true);
      pick(e.path);
    },
    onDragStart: (ev: DragEvent) => dragStart(ev, sel.has(e.path) ? picked : [itemFor(e)]),
    onDragOver: (ev: DragEvent) => {
      const to = isDir(e) ? e.path : dirname(e.path);
      if (takesDrop(ev) && drop !== to) setDrop(to);
    },
    onDrop: (ev: DragEvent) => {
      setDrop(null);
      void dropInto(ev, isDir(e) ? e.path : dirname(e.path), refresh);
    },
  });

  // The folder's own menu (⋯ in the bar): how it shows, and what to do with the folder itself.
  const folderItem: Item = { path: dir, name: basename(dir) || dir, dir: true };
  const pinned = !!pins?.includes(dir);
  const closeMore = () => setMore(false);
  const lead = useFolderLead((p) => (setBar(false), void moveInto(picked, p, () => (clearPicks(), refresh()))), dir);
  const count = entries ? { dirs: entries.filter(isDir).length, files: entries.filter((e) => !isDir(e)).length, size: entries.reduce((n, e) => n + (isDir(e) ? 0 : e.size), 0) } : null;
  // Each part its own element, so each is translated on its own ("3 folders", "12 files").
  const parts = count
    ? [count.dirs ? (count.dirs === 1 ? '1 folder' : `${count.dirs} folders`) : null, count.files ? (count.files === 1 ? '1 file' : `${count.files} files`) : null].filter((x): x is string => !!x)
    : [];
  const summary = count ? (
    parts.length ? (
      parts.map((t, i) => (
        <span key={t}>
          {i > 0 && ', '}
          <span>{t}</span>
        </span>
      ))
    ) : (
      <span>Empty</span>
    )
  ) : null;

  const newItems = (close: () => void) => (
    <>
      <MenuItem icon={<FolderPlus size={14} />} onClick={() => (close(), setCreating('dir'))}>
        New folder
      </MenuItem>
      <MenuItem icon={<FilePlus2 size={14} />} onClick={() => (close(), setCreating('file'))}>
        New file
      </MenuItem>
      <MenuSep />
      <MenuItem icon={<Upload size={14} />} onClick={() => (close(), upload(dir))}>
        Upload files
      </MenuItem>
      {!mobile && (
        <MenuItem icon={<FolderUp size={14} />} onClick={() => (close(), upload(dir, true))}>
          Upload a folder
        </MenuItem>
      )}
    </>
  );

  const pickedBar = picked.length > 0 && (
    <div className={cx('flex min-w-0 flex-1 items-center gap-0.5', mobile && 'px-1')}>
      <IconButton label="Unpick all" onClick={clearPicks}>
        <X size={16} />
      </IconButton>
      <span className="tnum min-w-0 shrink-0 pr-1 text-[13.5px] font-medium">{picked.length === 1 ? '1 picked' : `${picked.length} picked`}</span>
      <span className="flex-1" />
      <Button size="sm" variant="ghost" icon={<MessageSquarePlus size={14} />} onClick={() => (startSession(picked), clearPicks())} title="Start a session with them">
        <span className="@max-[760px]:hidden">Start a session</span>
      </Button>
      <Button ref={spaceRef} size="sm" variant="ghost" icon={<Boxes size={14} />} onClick={() => setBar((b) => (b === 'space' ? false : 'space'))} title="Add to a space">
        <span className="@max-[760px]:hidden">Add to a space</span>
      </Button>
      <Button ref={moveRef} size="sm" variant="ghost" icon={<FolderInput size={14} />} onClick={() => setBar((b) => (b === 'move' ? false : 'move'))} title="Move to another folder">
        <span className="@max-[760px]:hidden">Move to</span>
      </Button>
      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => void trash(picked, confirm, () => (clearPicks(), refresh()))} title="Delete">
        <span className="@max-[760px]:hidden">Delete</span>
      </Button>
      <IconButton ref={barMoreRef} label="More" onClick={() => showMenu(picked, barMoreRef.current)}>
        <Ellipsis size={16} />
      </IconButton>
      <Popover anchor={moveRef} open={bar === 'move'} onClose={() => setBar(false)} width={320} title="Move to">
        <FolderFinder value={dir} onPick={(p) => (setBar(false), void moveInto(picked, p, () => (clearPicks(), refresh())))} lead={lead} autoFocus anchor={moveRef} />
      </Popover>
      <Popover anchor={spaceRef} open={bar === 'space'} onClose={() => setBar(false)} width={250} title="Add to a space">
        <SpaceChoices
          onPick={(sp) => {
            setBar(false);
            void addToSpace(picked, sp);
          }}
          onNew={() => {
            setBar(false);
            setNewSpaceFor(picked);
          }}
        />
      </Popover>
      <NewSpaceDialog open={!!newSpaceFor} onClose={() => setNewSpaceFor(null)} onMade={(sp) => newSpaceFor && void addToSpace(newSpaceFor, sp)} />
    </div>
  );

  const findField = (
    <div className={cx('relative', tight ? 'min-w-0 flex-1' : 'w-40 shrink-0 @[760px]:w-56')}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
      <input
        ref={field}
        value={filter}
        autoFocus={tight && finding}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && filter.trim() && onSearch) onSearch(filter.trim());
          else if (e.key === 'Escape') (setFilter(''), setFinding(false), listRef.current?.focus());
          else if (e.key === 'ArrowDown') (e.preventDefault(), listRef.current?.focus(), setFocus(items[0]?.e.path ?? null));
        }}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        placeholder={`Find in ${base?.path === dir ? base.label : basename(dir) || 'this folder'}`}
        aria-label="Find in this folder"
        className="h-8 w-full rounded-lg border border-line bg-bg-1 pr-7 pl-8 text-[13px] outline-none placeholder:text-fg-3 focus:border-accent/60 max-md:h-10 max-md:text-[15px]"
      />
      {filter && (
        <button
          type="button"
          aria-label="Clear"
          onClick={() => (setFilter(''), field.current?.focus())}
          className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded text-fg-3 hover:text-fg"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );

  const moreMenu = (
    <Popover anchor={moreRef} open={!!more} onClose={closeMore} align="end" width={252} title={basename(dir) || dir}>
      {more === 'sort' ? (
        <>
          <MenuBack onClick={() => setMore('main')}>Sort by</MenuBack>
          {SORTS.map(([by, label]) => (
            <MenuItem key={by} checked={sort === by} onClick={() => (setPrefs({ sort: by }), closeMore())}>
              {label}
            </MenuItem>
          ))}
          <MenuSep />
          <MenuItem checked={reverse} onClick={() => (setPrefs({ reverse: !reverse }), closeMore())}>
            The other way round
          </MenuItem>
        </>
      ) : (
        <>
          {tight && (
            <>
              <MenuItem icon={<List size={14} />} checked={!grid} onClick={() => (setPrefs({ view: 'list' }), closeMore())}>
                As a list
              </MenuItem>
              <MenuItem icon={<LayoutGrid size={14} />} checked={grid} onClick={() => (setPrefs({ view: 'grid' }), closeMore())}>
                As tiles, with pictures
              </MenuItem>
            </>
          )}
          <MenuItem icon={<ArrowDownUp size={14} />} submenu hint={SORTS.find(([b]) => b === sort)?.[1]} onClick={() => setMore('sort')}>
            Sort by
          </MenuItem>
          <MenuItem icon={<Eye size={14} />} checked={hidden} onClick={() => (useUI.getState().set({ showHidden: !hidden }), closeMore())}>
            Show hidden files
          </MenuItem>
          {mobile && (
            <MenuItem icon={<Check size={14} />} onClick={() => (closeMore(), setPicking(true))}>
              Pick several
            </MenuItem>
          )}
          <MenuSep />
          {!embedded && (
            <>
              <MenuItem icon={pinned ? <PinOff size={14} /> : <Pin size={14} />} onClick={() => (closeMore(), void setPinned(dir, !pinned))}>
                {pinned ? 'Unpin from Places' : 'Pin to Places'}
              </MenuItem>
              <MenuItem icon={<MessageSquarePlus size={14} />} onClick={() => (closeMore(), newSessionIn(dir))}>
                New session in this folder
              </MenuItem>
            </>
          )}
          <MenuItem icon={<SquareTerminal size={14} />} onClick={() => (closeMore(), openTerminalAt(dir))}>
            Open a terminal here
          </MenuItem>
          <MenuItem icon={<Copy size={14} />} onClick={() => (closeMore(), copyPaths([folderItem]))}>
            Copy path
          </MenuItem>
          <MenuItem icon={<Download size={14} />} onClick={() => (closeMore(), download([folderItem]))}>
            Download as .zip
          </MenuItem>
          <MenuItem icon={<RefreshIcon size={13} />} onClick={() => (closeMore(), refresh())}>
            Refresh
          </MenuItem>
        </>
      )}
    </Popover>
  );

  const noteRow = (r: Extract<Row, { kind: 'note' }>) => (
    <div key={r.key} style={{ paddingLeft: 44 + r.depth * 18 }} className="flex h-8 items-center truncate text-[12.5px] text-fg-3 italic">
      {r.text}
    </div>
  );

  const body = error ? (
    <Empty icon={<Folder size={20} />} title="This folder can’t be opened">
      <span className="block">{error}</span>
      <span className="mt-3 flex justify-center gap-2">
        {top && (
          <Button size="sm" variant="secondary" onClick={() => onDir(top)}>
            The folder above
          </Button>
        )}
      </span>
    </Empty>
  ) : !entries ? (
    <div className="flex justify-center py-16 text-fg-3">
      <Throbber size={30} />
    </div>
  ) : !entries.length && !creating ? (
    <Empty icon={<Folder size={20} />} title="Nothing here yet">
      {mobile ? 'Add files with the + button.' : 'Drop files or folders here, or add some.'}
      <span className="mt-3 flex justify-center gap-2">
        <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => upload(dir)}>
          Upload files
        </Button>
        <Button size="sm" variant="ghost" icon={<FolderPlus size={14} />} onClick={() => setCreating('dir')}>
          New folder
        </Button>
      </span>
    </Empty>
  ) : (
    <>
      {f && onSearch && (
        <button
          type="button"
          onClick={() => onSearch(filter.trim())}
          className="flex h-9 w-full items-center gap-2.5 border-b border-line px-3 text-left text-[13px] text-fg-2 hover:bg-bg-2 max-md:h-12"
        >
          <Search size={14} className="shrink-0 text-accent" />
          <span className="min-w-0 truncate">
            Search everything in {basename(dir) || dir} for “{filter.trim()}”, inside files too
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-fg-3 max-md:hidden">Enter</span>
        </button>
      )}
      {creating && <NameInput dir={creating === 'dir'} onDone={create} />}
      {f && !items.length && <div className="px-4 py-8 text-center text-[13px] text-fg-3">Nothing here is called “{filter.trim()}”.</div>}
      {grid ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-1.5 p-2 max-md:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
          {shown.map((r) =>
            r.kind === 'item' ? (
              renaming === r.e.path ? (
                <div key={r.e.path} className="col-span-2">
                  <NameInput initial={r.e.name} dir={isDir(r.e)} onDone={(n) => (setRenaming(null), void rename(itemFor(r.e), n, refresh))} />
                </div>
              ) : (
                <Tile key={r.e.path} e={r.e} {...rowProps(r.e)} />
              )
            ) : null,
          )}
        </div>
      ) : (
        <div role="rowgroup">
          {shown.map((r) =>
            r.kind === 'note' ? (
              noteRow(r)
            ) : renaming === r.e.path ? (
              <NameInput key={r.e.path} initial={r.e.name} dir={isDir(r.e)} depth={r.depth} onDone={(n) => (setRenaming(null), void rename(itemFor(r.e), n, refresh))} />
            ) : (
              <ListRow key={r.e.path} e={r.e} depth={r.depth} open={expanded.has(r.e.path)} narrow={mobile} onToggle={() => toggle(r.e.path)} {...rowProps(r.e)} />
            ),
          )}
        </div>
      )}
      {rows.length > limit && (
        <div className="flex justify-center p-3">
          <Button size="sm" variant="secondary" onClick={() => setLimit((n) => n + 2000)}>
            Show {rows.length - limit} more
          </Button>
        </div>
      )}
    </>
  );

  return (
    <div ref={rootRef} className="@container flex h-full min-h-0 flex-col">
      {/* The bar: where the folder is, a field to find in it, New, how it shows and ⋯; or what is picked. */}
      <div className={cx('flex shrink-0 items-center gap-1 border-b border-line', mobile ? 'h-12 px-1.5' : 'h-11 px-2')}>
        {picked.length > 0 || picking ? (
          pickedBar || (
            <div className="flex flex-1 items-center gap-1 px-1">
              <IconButton label="Stop picking" onClick={clearPicks}>
                <X size={16} />
              </IconButton>
              <span className="text-[13.5px] text-fg-3">Tap to pick</span>
            </div>
          )
        ) : tight && finding ? (
          <>
            {findField}
            <Button size="sm" variant="ghost" onClick={() => (setFilter(''), setFinding(false))}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            {mobile && !embedded ? (
              // A phone's title names the folder: the bar goes up a step, as a phone's own Files app does.
              // Home is the top here (Go to a folder, in the places, reaches the rest).
              top && dir !== home ? (
                <button type="button" onClick={() => onDir(top)} className="flex h-9 min-w-0 flex-1 items-center gap-0.5 rounded-lg pr-2 text-left text-[15px] text-accent active:bg-bg-2">
                  <ChevronLeft size={20} className="shrink-0" />
                  <span translate={top === home ? undefined : 'no'} className="truncate">
                    {top === home ? 'Home folder' : basename(top) || top}
                  </span>
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate pl-2 text-[13px] text-fg-3">{summary}</span>
              )
            ) : (
              <>
                <IconButton label="The folder above" size="sm" disabled={!top} onClick={() => top && onDir(top)} className="max-md:hidden">
                  <ArrowUp size={15} />
                </IconButton>
                <Crumbs dir={dir} onDir={onDir} base={base} after={refresh} className="min-w-0 flex-1 overflow-hidden" />
              </>
            )}
            {tight ? (
              <IconButton label="Find in this folder" size={mobile ? 'md' : 'sm'} onClick={() => setFinding(true)}>
                <Search size={mobile ? 17 : 15} />
              </IconButton>
            ) : (
              findField
            )}
            {!mobile && (
              <Button ref={newRef} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setNewMenu((o) => !o)} className="ml-1">
                <span className="@max-[640px]:hidden">New</span>
              </Button>
            )}
            {!mobile && (
              <Popover anchor={newRef} open={newMenu} onClose={() => setNewMenu(false)} align="end" width={220}>
                {newItems(() => setNewMenu(false))}
              </Popover>
            )}
            {!tight && (
              <>
                <div className="ml-1 flex rounded-lg bg-bg-2 p-0.5" role="group" aria-label="How the folder shows">
                  <IconButton label="As a list" size="sm" active={!grid} onClick={() => setPrefs({ view: 'list' })} className={cx('h-7 w-7', !grid && 'bg-panel shadow-sm ring-1 ring-line')}>
                    <List size={14} />
                  </IconButton>
                  <IconButton
                    label="As tiles, with pictures"
                    size="sm"
                    active={grid}
                    onClick={() => setPrefs({ view: 'grid' })}
                    className={cx('h-7 w-7', grid && 'bg-panel shadow-sm ring-1 ring-line')}
                  >
                    <LayoutGrid size={14} />
                  </IconButton>
                </div>
              </>
            )}
            <IconButton ref={moreRef} label="More" size={mobile ? 'md' : 'sm'} active={!!more} onClick={() => setMore((m) => (m ? false : 'main'))}>
              <Ellipsis size={16} />
            </IconButton>
            {moreMenu}
          </>
        )}
      </div>
      {!grid && !mobile && entries && entries.length > 0 && (
        <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line pr-[42px] pl-[84px] text-fg-3">
          <SortHead by="name" label="Name" />
          <span className="flex-1" />
          <SortHead by="modified" label="Changed" className="w-24 justify-end @max-[560px]:hidden" />
          <SortHead by="size" label="Size" className="w-20 justify-end @max-[460px]:hidden" />
        </div>
      )}
      <div
        ref={listRef}
        tabIndex={0}
        role="grid"
        aria-label={`What is in ${basename(dir) || dir}`}
        aria-multiselectable
        onKeyDown={onKeyDown}
        onPointerDown={() => keys && setKeys(false)}
        onDragOver={(e) => takesDrop(e) && drop !== dir && setDrop(dir)}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDrop(null)}
        onDrop={(e) => {
          setDrop(null);
          void dropInto(e, dir, refresh);
        }}
        onClick={(e) => e.target === e.currentTarget && !mobile && sel.size && clearPicks()}
        className={cx('relative min-h-0 flex-1 overflow-y-auto pb-24 outline-none md:pb-6', drop === dir && 'bg-accent/6 outline-2 -outline-offset-4 outline-accent/50 outline-dashed')}
      >
        {body}
      </div>
      {!mobile && count && (
        <div className="flex h-7 shrink-0 items-center gap-3 border-t border-line px-3 text-[11.5px] text-fg-3">
          <span className="tnum">
            {summary}
            {count.size ? ` · ${bytes(count.size)}` : ''}
          </span>
          <span className="flex-1" />
          <span className="@max-[520px]:hidden">Drop files here to upload them</span>
        </div>
      )}
      {mobile && !picked.length && !picking && (
        <>
          <button
            ref={fabRef}
            type="button"
            onClick={() => setNewMenu((o) => !o)}
            aria-label="Add files or a folder"
            className="fixed right-4 bottom-[calc(16px+var(--safe-bottom))] z-30 flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-lg transition-transform active:scale-95"
          >
            <Plus size={24} />
          </button>
          <Popover anchor={fabRef} open={newMenu} onClose={() => setNewMenu(false)} align="end" width={240} title="Add to this folder">
            {newItems(() => setNewMenu(false))}
          </Popover>
        </>
      )}
      <div ref={pointRef} aria-hidden style={{ position: 'fixed', left: menu?.at?.x ?? 0, top: menu?.at?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }} />
      <ItemMenu
        items={menu?.items ?? []}
        anchor={menuAnchor}
        open={!!menu}
        onClose={() => setMenu(null)}
        after={() => (clearPicks(), refresh())}
        onOpen={(it) => (it.dir ? onDir(it.path) : onFile(it.path))}
        onRename={(it) => setRenaming(it.path)}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onPicked(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        hidden
        {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={(e) => {
          onPicked(e.target.files);
          e.target.value = '';
        }}
      />
      {confirmNode}
    </div>
  );
}
