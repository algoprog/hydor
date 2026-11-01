import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Check, ChevronDown, ChevronRight, Folder, FolderOpen, History, House, Search } from 'lucide-react';
import type { DirEntry } from '@shared/types';
import { api } from '../lib/api';
import { basename, dirname, tildify } from '../lib/format';
import { useApp } from '../lib/store';
import { cx, MenuSep, Popover, useSheets } from './ui';

// The folders used lately as last loaded: a menu opens with them while it asks again.
let recentKnown: string[] | null = null;

/**
 * Folders sessions worked in lately, newest first: those picked, not the ones the app made for a task, an
 * app's run or a worktree. Loaded each time `when` turns true (a picker opening).
 */
export function useRecentFolders(when: boolean): string[] | null {
  const [dirs, setDirs] = useState<string[] | null>(recentKnown);
  useEffect(() => {
    if (!when) return;
    let alive = true;
    api<{ dirs: string[] }>('/api/fs/recent?picked=1')
      .then((r) => {
        recentKnown = r.dirs;
        if (alive) setDirs(r.dirs);
      })
      .catch(() => alive && setDirs((d) => d ?? []));
    return () => {
      alive = false;
    };
  }, [when]);
  return dirs;
}

// The folders in each folder listed so far (null: no such folder), by listKey: shown at once while asked again.
const listed = new Map<string, string[] | null>();
const listKey = (path: string, hidden: boolean) => `${hidden ? 1 : 0}${path}`;

/** Lists the folders in `path` (hidden ones too with `hidden`) into `listed`. */
async function listFolders(path: string, hidden: boolean, signal?: AbortSignal): Promise<void> {
  try {
    const r = await api<{ entries: { path: string }[] }>(`/api/fs/list?dirs=1${hidden ? '&hidden=1' : ''}&path=${encodeURIComponent(path)}`, { signal });
    listed.set(listKey(path, hidden), r.entries.map((e) => e.path));
  } catch {
    if (!signal?.aborted) listed.set(listKey(path, hidden), null);
  }
}

/** The folders in `path`: [] while none is asked (null), undefined until they first come, null when it is no folder. */
function useSubfolders(path: string | null, hidden: boolean): string[] | null | undefined {
  const key = path === null ? null : listKey(path, hidden);
  const [, setLoaded] = useState(0);
  useEffect(() => {
    if (path === null) return;
    const ctl = new AbortController();
    void listFolders(path, hidden, ctl.signal).then(() => ctl.signal.aborted || setLoaded((n) => n + 1));
    return () => ctl.abort();
  }, [key]);
  if (key === null) return [];
  return listed.has(key) ? listed.get(key) : undefined;
}

/** A row of a folder menu: a folder, or another choice (a new task folder). */
export interface FolderChoice {
  key: string;
  icon: ReactNode;
  name: string;
  /** Muted after the name: where it is. */
  where?: string;
  title?: string;
  /** The one in use: a check at its end. */
  on?: boolean;
  pick: () => void;
  /** A folder: Tab, or the arrow at its end, lists the folders inside it. */
  path?: string;
}

/**
 * The inside of a folder menu: a field over `lead` (the spaces), the folder in use, the ones used last and
 * `more` (a new task folder). A name finds those of `lead` it names, and folders among those used lately,
 * in the folder in use and in the home folder; a
 * path (~/code/, or code/ from home) lists the folders there. Either way they take the list's place, so
 * nothing opens over the menu. ↑ ↓ and Enter pick; Tab, or the arrow at a row's end, lists the folders
 * inside one. `footer` ends the menu while nothing is typed.
 */
export function FolderFinder({
  value,
  onPick,
  autoFocus,
  lead = [],
  more = [],
  footer,
  recent: count = 3,
  anchor,
}: {
  /** The folder in use, checked; null when it is none of them (a new task folder). */
  value: string | null;
  onPick: (path: string) => void;
  autoFocus?: boolean;
  /** Choices before the folders (the spaces), found by their names too. */
  lead?: FolderChoice[];
  more?: FolderChoice[];
  footer?: ReactNode;
  /** How many of the folders used last show while nothing is typed. */
  recent?: number;
  /** What the menu opened from: over it, the menu keeps its height while something is typed. */
  anchor?: RefObject<HTMLElement | null>;
}) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const sheet = useSheets();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  // The row moved to with the arrows (or the pointer); else the first match, or the one in use.
  const [sel, setSel] = useState<number | null>(null);
  // A menu over its chip, or a sheet from the bottom, grows and shrinks at the top, where the field is: so
  // while something is typed it keeps the height it had, and the matches scroll in it.
  const [fixed, setFixed] = useState(0);
  // A name is looked for in these two: listed now, its first letter finds them at once.
  useEffect(() => {
    void listFolders(home, false);
    if (value && value !== home) void listFolders(value, false);
  }, []);
  const recent = useRecentFolders(true) ?? [];
  const text = q.trim();
  const asPath = text.startsWith('/') || text.startsWith('~') || text.includes('/');
  const full = text.startsWith('~') ? home + text.slice(1) : text.startsWith('/') ? text : `${home}/${text}`;
  const cut = full.lastIndexOf('/');
  // A path lists the folder it names up to its last slash; a name looks in home and in the folder in use.
  const base = asPath ? full.slice(0, Math.max(cut, 1)) : home;
  const part = (asPath ? full.slice(cut + 1) : text).toLowerCase();
  const hidden = part.startsWith('.');
  const inBase = useSubfolders(text ? base : null, hidden);
  const inValue = useSubfolders(text && !asPath && value && value !== home ? value : null, hidden);
  const loading = inBase === undefined || inValue === undefined;

  // 0 the name typed, 1 a name starting so, 2 one holding it, 3 a path holding it; -1 no match.
  const byName = (p: string) => {
    const n = basename(p).toLowerCase();
    if (n === part) return 0;
    if (n.startsWith(part)) return 1;
    if (n.includes(part)) return 2;
    return !asPath && tildify(p, home).toLowerCase().includes(part) ? 3 : -1;
  };
  // A folder used lately, for a path: one inside what is typed.
  const under = (p: string) => (p.toLowerCase().startsWith(full.toLowerCase()) ? 3 : -1);
  const found: { p: string; r: number; i: number }[] = [];
  const add = (ps: string[] | null | undefined, rank: (p: string) => number) => {
    for (const p of ps ?? []) {
      const r = rank(p);
      if (r >= 0 && !found.some((f) => f.p === p)) found.push({ p, r, i: found.length });
    }
  };
  if (text && asPath) {
    // A path ending in a slash names a folder: it comes first, over what is in it.
    if (!part && inBase) found.push({ p: base, r: -1, i: 0 });
    add(inBase, byName);
    add(recent, under);
  } else if (text) {
    add(recent, byName);
    add(inValue, byName);
    add(inBase, byName);
  }
  found.sort((a, b) => a.r - b.r || a.i - b.i);
  const folder = (p: string): FolderChoice => {
    const up = dirname(p);
    return {
      key: p,
      icon: p === home ? <House size={15} /> : <Folder size={15} />,
      name: p === home ? 'Home folder' : basename(p) || '/',
      // Where it is, unless that goes without saying: in home, or in the folder whose path is typed.
      where: p === home || p === '/' || up === home || (asPath && up === base) ? '' : tildify(up, home),
      title: tildify(p, home),
      on: p === value,
      pick: () => onPick(p),
      path: p,
    };
  };
  const last = recent.slice(0, count);
  // The folder in use leads while nothing is typed, when it is not among the last used.
  const folders = text ? found.slice(0, asPath ? 200 : 8).map((f) => f.p) : [...(value && !last.includes(value) ? [value] : []), ...last];
  // As many of `lead` as of the folders used last (the one in use among them), the rest found by name.
  const leadRows = text ? lead.filter((c) => c.name.toLowerCase().includes(text.toLowerCase())) : lead.filter((c, i) => i < count || c.on);
  // A folder shown among `lead` (a space's, a pinned one) isn't listed again.
  const inLead = new Set(leadRows.map((c) => c.path).filter(Boolean));
  const folderRows = folders.filter((p) => !inLead.has(p)).map(folder);
  const rows = text ? [...leadRows, ...folderRows] : [...leadRows, ...folderRows, ...more];
  // A line between the spaces and the folders, and between the folders and a new task folder.
  const seps = new Set(text ? [] : [leadRows.length, leadRows.length + folderRows.length].filter((i) => i > 0 && i < rows.length));
  const hi = Math.min(sel ?? (text ? 0 : rows.findIndex((r) => r.on)), rows.length - 1);

  useEffect(() => {
    list.current?.querySelector('[data-hi]')?.scrollIntoView({ block: 'nearest' });
  }, [hi, text]);

  const inside = (p: string) => {
    setQ(tildify(p, home).replace(/\/?$/, '/'));
    setSel(null);
    input.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const d = e.key === 'ArrowDown' ? 1 : -1;
      setSel(hi < 0 ? (d > 0 ? 0 : rows.length - 1) : (hi + d + rows.length) % rows.length);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      rows[hi]?.pick();
    } else if (e.key === 'Tab' && !e.shiftKey && (text || sel !== null) && rows[hi]?.path) {
      e.preventDefault();
      inside(rows[hi].path!);
    }
  };

  const held = !!text && fixed > 0;
  return (
    <div ref={root} className={cx(held && 'flex flex-col')} style={held ? { height: fixed } : undefined}>
      <div className="relative mb-1 shrink-0">
        <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
        <input
          ref={input}
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => {
            const el = root.current;
            const a = anchor?.current?.getBoundingClientRect();
            if (!q && el) setFixed(sheet || (a && el.getBoundingClientRect().top < a.top) ? el.offsetHeight : 0);
            setQ(e.target.value);
            setSel(null);
          }}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          enterKeyHint="go"
          aria-label="Find a folder, or type its path"
          placeholder="Find a folder, or type its path"
          className="h-8.5 w-full rounded-lg bg-bg-2 pr-2.5 pl-8 text-[13px] outline-none placeholder:text-fg-3 max-sm:h-11 max-sm:text-[15px]"
        />
      </div>
      <div ref={list} className={cx('overflow-y-auto overscroll-contain', held ? 'min-h-0 flex-1' : 'max-h-[min(50dvh,300px)]')}>
        {rows.map((r, i) => (
          <Fragment key={r.key}>
            {seps.has(i) && <MenuSep />}
            <div
              data-hi={i === hi || undefined}
              onMouseMove={() => i !== hi && setSel(i)}
              className={cx('group flex items-center rounded-lg', i === hi && 'bg-bg-2')}
            >
              <button type="button" onClick={r.pick} title={r.title} className="flex h-8 min-w-0 flex-1 items-center gap-2.5 pr-1 pl-2.5 text-left max-sm:h-11">
                <span className="flex shrink-0 text-fg-3">{r.icon}</span>
                <span className="max-w-[70%] shrink-0 truncate text-[13.5px] text-fg max-sm:text-[14.5px]">{r.name}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-fg-3">{r.where}</span>
                {r.on && <Check size={14} className="shrink-0" strokeWidth={2.5} />}
              </button>
              {r.path && (
                <button
                  type="button"
                  tabIndex={-1}
                  title="The folders in it"
                  aria-label={`The folders in ${r.name}`}
                  onClick={() => inside(r.path!)}
                  className={cx(
                    'mr-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg max-sm:size-10',
                    i === hi ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    // A touch screen shows the arrows among matches; on the folders used last they would read as the row's own tap.
                    text ? 'pointer-coarse:opacity-100' : 'pointer-coarse:hidden',
                  )}
                >
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </Fragment>
        ))}
        {text && !loading && !rows.length && <div className="px-2.5 py-2 text-[12.5px] text-fg-3">{asPath && inBase === null ? 'No folder there' : 'No folder by that name'}</div>}
      </div>
      {!text && footer && (
        <>
          <MenuSep />
          {footer}
        </>
      )}
    </div>
  );
}

/** Path input with recent folders and subfolder suggestions as you type. */
export function FolderPicker({ value, onChange, onPick, autoFocus }: { value: string; onChange: (v: string) => void; onPick?: (path: string) => void; autoFocus?: boolean }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [sel, setSel] = useState(0);
  // Enter uses the typed path unless the arrows picked a suggestion.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    api<{ dirs: string[] }>('/api/fs/recent')
      .then((r) => setRecent(r.dirs))
      .catch(() => {});
  }, []);
  const expanded = value.startsWith('~') ? home + value.slice(1) : value;
  const base = expanded.endsWith('/') ? expanded : dirname(expanded);
  const partial = expanded.endsWith('/') ? '' : expanded.slice(base.length + (base === '/' ? 0 : 1));
  useEffect(() => {
    if (!open || !base) return;
    const ctl = new AbortController();
    api<{ entries: { name: string; path: string; type: string; dirLink?: boolean }[] }>(`/api/fs/list?dirs=1&path=${encodeURIComponent(base)}`, { signal: ctl.signal })
      .then((r) => setDirs(r.entries.map((e) => ({ name: e.name, path: e.path }))))
      .catch(() => setDirs([]));
    return () => ctl.abort();
  }, [base, open]);
  const sub = dirs.filter((d) => !partial || d.name.toLowerCase().startsWith(partial.toLowerCase())).slice(0, 40);
  const rec = recent.filter((r) => !value || r.toLowerCase().includes(expanded.toLowerCase()) || r === expanded).slice(0, 8);
  const options = [...sub.map((d) => ({ path: d.path, kind: 'dir' as const })), ...rec.filter((r) => !sub.some((d) => d.path === r)).map((r) => ({ path: r, kind: 'recent' as const }))];
  const choose = (p: string, descend = false) => {
    onChange(tildify(p, home) + (descend ? '/' : ''));
    setSel(0);
    setMoved(false);
    ref.current?.focus();
  };
  const field = (
    <div className="relative">
      <Folder size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-3" />
      <input
        ref={ref}
        autoFocus={autoFocus}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setSel(0);
          setMoved(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMoved(true);
            setSel((s) => Math.min(s + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMoved(true);
            setSel((s) => Math.max(s - 1, 0));
          } else if (e.key === 'Tab' && open && options[sel]) {
            e.preventDefault();
            choose(options[sel].path, true);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && options[sel] && (moved || !onPick)) choose(options[sel].path);
            else onPick?.(expanded.replace(/\/+$/, '') || '/');
          } else if (e.key === 'Escape' && open && options.length > 0) {
            // Only the suggestions close; the menu holding the field stays.
            e.stopPropagation();
            setOpen(false);
          }
        }}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        enterKeyHint="go"
        placeholder="~/project"
        className="h-9.5 w-full rounded-[10px] border border-line-2 bg-bg-1 pr-3 pl-9 font-mono text-[13px] outline-none focus:border-accent/60 focus:ring-3 focus:ring-accent/15 max-sm:h-11 max-sm:text-[14px]"
      />
    </div>
  );
  return (
    <>
      {field}
      <Popover anchor={ref} open={open && options.length > 0} onClose={() => setOpen(false)} width={Math.max(ref.current?.offsetWidth ?? 0, 320)}>
        {options.map((o, i) => (
          <button
            key={o.kind + o.path}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (onPick && o.kind === 'recent' ? onPick(o.path) : choose(o.path, o.kind === 'dir'))}
            className={cx('flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px]', i === sel ? 'bg-bg-2' : 'hover:bg-bg-2')}
          >
            {o.kind === 'recent' ? <History size={14} className="shrink-0 text-fg-3" /> : <Folder size={14} className="shrink-0 text-fg-3" />}
            <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{tildify(o.path, home)}</span>
            {o.kind === 'recent' && <span className="text-[11px] text-fg-3">recent</span>}
          </button>
        ))}
      </Popover>
    </>
  );
}

/** "📁 naget-agent ▾": the folder a new session will work in; opens a picker. */
export function FolderChip({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const home = useApp((s) => s.boot?.home) ?? '';
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const name = value === home ? '~' : basename(value) || '/';
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => {
          setDraft(tildify(value, home));
          setOpen((o) => !o);
        }}
        title={tildify(value, home)}
        className={cx('inline-flex h-8 max-w-[16rem] min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg', open && 'bg-bg-2 text-fg')}
      >
        <FolderOpen size={15} className="shrink-0 text-fg-3" />
        <span className="truncate font-medium">{name}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={420}>
        <div className="p-2">
          <div className="mb-2 px-0.5 text-[12.5px] text-fg-3">Folder to work in</div>
          <FolderPicker
            value={draft}
            onChange={setDraft}
            onPick={(p) => {
              onChange(p);
              setOpen(false);
            }}
            autoFocus
          />
          <div className="mt-2 flex justify-end">
            <button
              className="h-8 rounded-lg bg-fg px-3 text-[13px] font-medium text-bg hover:opacity-90"
              onClick={() => {
                const v = draft.startsWith('~') ? home + draft.slice(1) : draft;
                onChange(v.replace(/\/+$/, '') || '/');
                setOpen(false);
              }}
            >
              Use this folder
            </button>
          </div>
        </div>
      </Popover>
    </>
  );
}
