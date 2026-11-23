// The bookmarks panel: the tree (folders open and close, and stay so the next time; drag a row to move it, or use its
// arrows), searching it, sorting it into folders with the helper model (Organize with AI), adding a folder, renaming and
// deleting, and bringing bookmarks in from the browsers on this computer or from a file, or out.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useSearch } from 'wouter';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, FileUp, Folder, FolderOpen, FolderPlus, FolderSearch, Globe, Pencil, Search, Sparkles, Trash2, X } from 'lucide-react';
import type { BookmarkNode, BookmarkSource } from '@shared/browser';
import { tr } from '../../i18n/runtime';
import { api, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { go } from '../../lib/nav';
import { canOpenFullDiskAccess } from '../../lib/notify';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, IconButton, inputCls, Throbber, useIsMobile } from '../../components/ui';
import { RenameDialog, openBookmark, useDeleteBookmark } from './BookmarkBar';
import { addBookmark, childrenOf, editBookmark, loadBookmarks, loadOrganize, startOrganize, stopOrganize, undoOrganize, useBookmarks, useOrganize, watchOrganize, withinFolder } from './browsing';
import { OpenSettings, REOPEN_NOTE } from './ImportBrowsers';
import { Note, Panel } from './Panel';
import { SiteIcon, hostOfTab } from './TabStrip';

interface Row {
  node: BookmarkNode;
  depth: number;
  /** Its place among its siblings, and how many there are. */
  index: number;
  count: number;
}

/** Where a drag would put the row: before or after another, or inside a folder (at its end). */
type Drop = { id: string; where: 'before' | 'after' | 'into' } | { id: 'bar' | 'other'; where: 'into' };

/** A bookmark or folder with where it is: the root, and the names of the folders around it, the outermost first. */
interface Found {
  node: BookmarkNode;
  root: 'bar' | 'other';
  folders: string[];
}

const MAX_BOOKMARKS = 200;
const MAX_FOLDERS = 20;

/** Text as it is searched: lower case, without accents. */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every bookmark and folder in the order of the tree (the bookmarks bar first), each with its place. */
function flattenAll(nodes: BookmarkNode[]): Found[] {
  const byParent = new Map<string, BookmarkNode[]>();
  for (const n of nodes) {
    const l = byParent.get(n.parent);
    if (l) l.push(n);
    else byParent.set(n.parent, [n]);
  }
  const out: Found[] = [];
  const walk = (root: 'bar' | 'other', parent: string, folders: string[], seen: Set<string>) => {
    for (const n of (byParent.get(parent) ?? []).sort((a, b) => a.pos - b.pos)) {
      if (seen.has(n.id)) continue;
      out.push({ node: n, root, folders });
      if (!n.url && folders.length < 12) walk(root, n.id, [...folders, n.title], new Set(seen).add(n.id));
    }
  };
  walk('bar', 'bar', [], new Set());
  walk('other', 'other', [], new Set());
  return out;
}

/** What is searched in a node: a bookmark's title and its address without the scheme, a folder's name. */
const textOf = (n: BookmarkNode) => fold(n.url ? `${n.title}\n${n.url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')}` : n.title);

/** The places in `text` the words are at, as ranges of the text itself (the words match without regard to case and accents). */
function marks(text: string, words: string[]): [number, number][] {
  let folded = '';
  const at: number[] = []; // for each character of the folded text, where it came from in `text`
  let i = 0;
  for (const ch of text) {
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) at.push(i);
    folded += f;
    i += ch.length;
  }
  at.push(text.length);
  const out: [number, number][] = [];
  for (const w of words) {
    for (let from = folded.indexOf(w); from >= 0; from = folded.indexOf(w, from + w.length)) {
      const start = at[from];
      const last = at[from + w.length - 1];
      // To the end of the character the last folded one came from.
      let end = at[from + w.length] ?? text.length;
      if (end === last) end = last + 1;
      out.push([start, end]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const m of out) {
    const l = merged[merged.length - 1];
    if (l && m[0] <= l[1]) l[1] = Math.max(l[1], m[1]);
    else merged.push([m[0], m[1]]);
  }
  return merged;
}

/** Text with the words searched for in bold. */
function Marked({ text, words }: { text: string; words: string[] }) {
  const ranges = marks(text, words);
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <b key={i} className="font-semibold text-fg">
        {text.slice(a, b)}
      </b>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/** Where something is, as a line: "Bookmarks bar › Folder › Sub" (the folder names are what people wrote). */
function Place({ root, folders }: { root: 'bar' | 'other'; folders: string[] }) {
  return (
    <>
      {root === 'bar' ? tr('Bookmarks bar') : tr('Other bookmarks')}
      {folders.length > 0 && <span translate="no">{` › ${folders.join(' › ')}`}</span>}
    </>
  );
}

const shown = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/$/, '');

/** Which folders are open, kept on this device so the panel opens again as it was left. */
const FOLDS_KEY = 'wa.browser.bookmarkFolds';
interface Folds {
  /** Folders opened (false) or closed (true) by hand. */
  closed: Record<string, boolean>;
  /** The others are closed (once a sort has made new folders), else open. */
  foldAll: boolean;
}
function keptFolds(): Folds {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDS_KEY) ?? 'null') as Partial<Folds> | null;
    return { closed: v?.closed && typeof v.closed === 'object' ? v.closed : {}, foldAll: v?.foldAll === true };
  } catch {
    return { closed: {}, foldAll: false };
  }
}

export function BookmarksPanel({ onClose }: { onClose: () => void }) {
  const nodes = useBookmarks((s) => s.nodes);
  const loaded = useBookmarks((s) => s.loaded);
  const mobile = useIsMobile();
  // Folders opened or closed by hand; the others are open, or all closed once a sort has made new folders. Both are
  // kept as they change, without the folders that are gone.
  const [closed, setClosed] = useState(() => keptFolds().closed);
  const [foldAll, setFoldAll] = useState(() => keptFolds().foldAll);
  useEffect(() => {
    if (!loaded) return;
    const folders = new Set(nodes.filter((n) => !n.url).map((n) => n.id));
    const kept: Folds = { closed: Object.fromEntries(Object.entries(closed).filter(([id]) => folders.has(id))), foldAll };
    try {
      localStorage.setItem(FOLDS_KEY, JSON.stringify(kept));
    } catch {}
  }, [closed, foldAll, nodes, loaded]);
  const [rename, setRename] = useState<BookmarkNode | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [remove, confirmNode] = useDeleteBookmark();
  const [q, setQ] = useState('');
  // A row shown to the person (a folder or bookmark found by searching) and the one lit for a moment; `tick` makes each ask count.
  const [reveal, setReveal] = useState<{ id: string; tick: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  useEffect(() => void loadBookmarks(), []);
  // Organize with AI: how it stands, and asked again while it runs.
  const job = useOrganize((s) => s.state);
  useEffect(() => {
    void loadOrganize();
    return watchOrganize();
  }, []);
  useEffect(() => {
    if (!mobile) input.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A job that finishes while this is open: every folder closes, so the new ones show at a glance.
  const status = job?.status;
  const was = useRef(status);
  useEffect(() => {
    if (was.current === 'running' && status === 'done') (setClosed({}), setFoldAll(true));
    was.current = status;
  }, [status]);

  const isOpen = (id: string) => !(closed[id] ?? foldAll);
  const rowsOf = (parent: string, depth: number): Row[] => {
    const items = childrenOf(nodes, parent);
    return items.flatMap((node, index) => [{ node, depth, index, count: items.length }, ...(!node.url && isOpen(node.id) ? rowsOf(node.id, depth + 1) : [])]);
  };
  const bar = useMemo(() => rowsOf('bar', 0), [nodes, closed, foldAll]); // eslint-disable-line react-hooks/exhaustive-deps
  const other = useMemo(() => rowsOf('other', 0), [nodes, closed, foldAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const newFolder = async () => {
    const r = await addBookmark({ title: 'New folder', parent: 'bar' });
    if (r?.node) setRename(r.node);
  };

  // Searching: every word has to be in the text.
  const words = useMemo(() => fold(q).split(/\s+/).filter(Boolean), [q]);
  const everything = useMemo(() => flattenAll(nodes), [nodes]);
  const found = useMemo(() => {
    if (!words.length) return null;
    const hit = (f: Found) => {
      const t = textOf(f.node);
      return words.every((w) => t.includes(w));
    };
    const folders: Found[] = [];
    const marksFound: Found[] = [];
    let total = 0;
    for (const f of everything) {
      if (f.node.url) {
        if (hit(f)) (total++, marksFound.length < MAX_BOOKMARKS && marksFound.push(f));
      } else if (folders.length < MAX_FOLDERS && hit(f)) folders.push(f);
    }
    return { folders, bookmarks: marksFound, total };
  }, [everything, words]);

  // Opens a folder and those around it, scrolls to a row and lights it: the folder itself, or a bookmark in it.
  const show = (folder: string, row: string) => {
    const open: Record<string, boolean> = {};
    for (let id = folder, n = 0; n < 40; n++) {
      const f = nodes.find((x) => x.id === id);
      if (!f || f.url) break;
      open[f.id] = false;
      id = f.parent;
    }
    setQ('');
    setClosed((c) => ({ ...c, ...open }));
    setReveal((r) => ({ id: row, tick: (r?.tick ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!reveal) return;
    const el = [...(tree.current?.querySelectorAll<HTMLElement>('[data-bm]') ?? [])].find((e) => e.dataset.bm === reveal.id);
    el?.scrollIntoView({ block: 'center' });
    setFlash(reveal.id);
    const t = window.setTimeout(() => setFlash(null), 1200);
    return () => window.clearTimeout(t);
  }, [reveal]);

  // The address can ask for the dialog (?panel=bookmarks&organize=1): it opens once, and the address forgets it.
  const search = useSearch();
  const asked = new URLSearchParams(search).get('organize') === '1' && new URLSearchParams(search).get('panel') === 'bookmarks';
  const canOrganize = job?.status !== 'running' && nodes.filter((n) => n.url && n.parent !== 'bar').length >= 3;
  useEffect(() => {
    if (!asked || !loaded) return;
    const p = new URLSearchParams(window.location.search);
    p.delete('organize');
    go(`/browser${p.size ? `?${p}` : ''}`, true);
    if (canOrganize) setAsking(true);
  }, [asked, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where a drag over a row lands: a folder's middle takes it in, the edges put it before or after.
  const over = (e: DragEvent<HTMLElement>, n: BookmarkNode) => {
    if (!dragging || dragging === n.id) return;
    // A folder may not go into itself or what is in it.
    const inside = nodes.find((x) => x.id === dragging)?.url === undefined ? withinFolder(nodes, dragging) : null;
    if (inside && (inside.has(n.id) || inside.has(n.parent))) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const f = (e.clientY - r.top) / r.height;
    const where = !n.url && f > 0.28 && f < 0.72 ? 'into' : f < 0.5 ? 'before' : 'after';
    setDrop((d) => (d && d.id === n.id && d.where === where ? d : { id: n.id, where }));
  };
  const finish = async () => {
    const d = drop;
    const id = dragging;
    setDrop(null);
    setDragging(null);
    if (!d || !id) return;
    const moved = nodes.find((n) => n.id === id);
    if (!moved) return;
    if (d.where === 'into') return void (await editBookmark(id, { parent: d.id }));
    const target = nodes.find((n) => n.id === d.id);
    if (!target) return;
    // The place is where it ends up among the folder's items once it has left its old one.
    const siblings = childrenOf(nodes, target.parent).filter((n) => n.id !== id);
    const at = siblings.findIndex((n) => n.id === target.id) + (d.where === 'after' ? 1 : 0);
    await editBookmark(id, { parent: target.parent, pos: at });
  };

  const renderRow = (r: Row) => {
    const n = r.node;
    const open = isOpen(n.id);
    const hot = drop?.id === n.id ? drop.where : null;
    return (
      <div
        key={n.id}
        data-bm={n.id}
        draggable
        onDragStart={(e) => (e.dataTransfer.setData('text/plain', n.id), (e.dataTransfer.effectAllowed = 'move'), setDragging(n.id))}
        onDragOver={(e) => over(e, n)}
        onDrop={(e) => (e.preventDefault(), void finish())}
        onDragEnd={() => (setDragging(null), setDrop(null))}
        style={{ paddingLeft: 8 + r.depth * 16 }}
        className={cx(
          'group relative flex h-9 items-center gap-1.5 pr-1.5 text-[13px] transition-colors duration-500 hover:bg-bg-2',
          flash === n.id && 'bg-accent/10',
          dragging === n.id && 'opacity-40',
          hot === 'into' && 'bg-accent/10 ring-1 ring-accent/40 ring-inset',
          hot === 'before' && 'before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:rounded before:bg-accent',
          hot === 'after' && 'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded after:bg-accent',
        )}
      >
        {n.url ? (
          <span className="w-4 shrink-0" />
        ) : (
          <button aria-label={open ? 'Close folder' : 'Open folder'} onClick={() => setClosed((c) => ({ ...c, [n.id]: open }))} className="flex h-5 w-4 shrink-0 items-center justify-center text-fg-3 hover:text-fg">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        <button
          onClick={(e) => (n.url ? openBookmark(n, e.ctrlKey || e.metaKey) : setClosed((c) => ({ ...c, [n.id]: open })))}
          title={n.url ? `${n.title}\n${n.url}` : n.title}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {n.url ? <Globe size={14} className="shrink-0 text-fg-3" /> : open ? <FolderOpen size={14} className="shrink-0 text-fg-3" /> : <Folder size={14} className="shrink-0 text-fg-3" />}
          <span translate="no" className="min-w-0 flex-1 truncate">
            {n.title || n.url}
          </span>
        </button>
        <span className="flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          <IconButton label="Move up" size="sm" disabled={r.index === 0} onClick={() => void editBookmark(n.id, { pos: r.index - 1 })}>
            <ArrowUp size={13} />
          </IconButton>
          <IconButton label="Move down" size="sm" disabled={r.index === r.count - 1} onClick={() => void editBookmark(n.id, { pos: r.index + 1 })}>
            <ArrowDown size={13} />
          </IconButton>
          <IconButton label={n.url ? 'Edit' : 'Rename'} size="sm" onClick={() => setRename(n)}>
            <Pencil size={13} />
          </IconButton>
          <IconButton label="Delete" size="sm" onClick={() => void remove(n)}>
            <Trash2 size={13} />
          </IconButton>
        </span>
      </div>
    );
  };

  const section = (id: 'bar' | 'other', label: string, rows: Row[]) => {
    const hot = drop?.id === id;
    return (
      <div key={id} onDragOver={(e) => dragging && (e.preventDefault(), setDrop((d) => (d?.id === id ? d : { id, where: 'into' })))} onDrop={(e) => (e.preventDefault(), void finish())}>
        <div className={cx('px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3', hot && 'text-accent')}>{label}</div>
        {rows.length ? rows.map(renderRow) : <div className={cx('mx-3 rounded-lg border border-dashed border-line px-3 py-2 text-[12.5px] text-fg-3', hot && 'border-accent/50')}>Nothing here yet</div>}
      </div>
    );
  };

  /** What searching found: folders to show in the tree, and bookmarks to open. */
  const results = () => {
    if (!found) return null;
    const none = !found.folders.length && !found.bookmarks.length;
    return (
      <div className="pb-4">
        {none && <Note>{tr(`No bookmark matches “${q.trim()}”.`)}</Note>}
        {found.folders.length > 0 && (
          <div>
            <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">Folders</div>
            {found.folders.map((f) => (
              <button key={f.node.id} onClick={() => show(f.node.id, f.node.id)} className="flex min-h-11 w-full items-center gap-2.5 px-4 py-1.5 text-left hover:bg-bg-2">
                <Folder size={14} className="shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1">
                  <span translate="no" className="block truncate text-[13.5px]">
                    <Marked text={f.node.title} words={words} />
                  </span>
                  <span className="block truncate text-[12px] text-fg-3">
                    <Place root={f.root} folders={f.folders} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        {found.bookmarks.length > 0 && (
          <div>
            <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">
              Bookmarks
              <span className="ml-1.5 tabular-nums">{found.total}</span>
            </div>
            {found.bookmarks.map((f) => (
              <div key={f.node.id} className="group flex min-h-11 items-center pr-1.5 pl-4 hover:bg-bg-2">
                <button
                  onClick={(e) => openBookmark(f.node, e.ctrlKey || e.metaKey)}
                  onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                  onAuxClick={(e) => e.button === 1 && (e.preventDefault(), openBookmark(f.node, true))}
                  title={`${f.node.title}\n${f.node.url}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 text-left"
                >
                  <SiteIcon url={f.node.url!} size={16} />
                  <span className="min-w-0 flex-1">
                    <span translate="no" className="block truncate text-[13.5px]">
                      <Marked text={f.node.title || shown(f.node.url!)} words={words} />
                    </span>
                    <span className="block truncate text-[12px] text-fg-3">
                      <span translate="no">{hostOfTab(f.node.url!) || shown(f.node.url!)}</span>
                      {' · '}
                      <Place root={f.root} folders={f.folders} />
                    </span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                  <IconButton label="Show in folder" size="sm" onClick={() => show(f.node.parent, f.node.id)}>
                    <FolderSearch size={13} />
                  </IconButton>
                  <IconButton label="Edit" size="sm" onClick={() => setRename(f.node)}>
                    <Pencil size={13} />
                  </IconButton>
                  <IconButton label="Delete" size="sm" onClick={() => void remove(f.node)}>
                    <Trash2 size={13} />
                  </IconButton>
                </span>
              </div>
            ))}
          </div>
        )}
        {found.total > MAX_BOOKMARKS && <Note>Showing the first 200. Type more words to narrow it down.</Note>}
      </div>
    );
  };

  const searchKeys = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && q) (e.preventDefault(), e.stopPropagation(), setQ(''));
    else if (e.key === 'Enter' && found?.bookmarks[0]) (e.preventDefault(), openBookmark(found.bookmarks[0].node, e.ctrlKey || e.metaKey));
  };

  return (
    <Panel
      title="Bookmarks"
      onClose={onClose}
      actions={
        <>
          <IconButton label="Organize with AI" title="Organize with AI: sort your bookmarks into folders by topic" size="sm" disabled={!canOrganize} onClick={() => setAsking(true)}>
            <Sparkles size={16} />
          </IconButton>
          <IconButton label="New folder" size="sm" onClick={() => void newFolder()}>
            <FolderPlus size={16} />
          </IconButton>
        </>
      }
    >
      <div className="sticky top-0 z-10 border-b border-line bg-bg-1 p-3">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-fg-3" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={searchKeys} placeholder="Search your bookmarks" aria-label="Search your bookmarks" translate="no" className={cx(inputCls, 'h-9 pr-9 pl-9 text-[13.5px]')} />
        {q && (
          <IconButton label="Clear" size="sm" onClick={() => (setQ(''), input.current?.focus())} className="absolute top-1/2 right-4.5 -translate-y-1/2">
            <X size={14} />
          </IconButton>
        )}
      </div>
      <OrganizeStatus onAgain={() => setAsking(true)} />
      <div ref={tree}>
        {!loaded ? (
          <div className="flex justify-center py-10">
            <Throbber size={24} />
          </div>
        ) : found ? (
          results()
        ) : (
          <>
            {section('bar', 'Bookmarks bar', bar)}
            {section('other', 'Other bookmarks', other)}
            {!nodes.length && <Note>Click the star in the address bar to bookmark a page, or bring in the bookmarks of another browser below.</Note>}
          </>
        )}
      </div>
      {!found && <ImportBox />}
      <OrganizeDialog open={asking} onClose={() => setAsking(false)} />
      <RenameDialog node={rename} onClose={() => setRename(null)} />
      {confirmNode}
    </Panel>
  );
}

/** How sorting the bookmarks with the helper model stands: at work (with Stop), done (with Undo), or failed. */
function OrganizeStatus({ onAgain }: { onAgain: () => void }) {
  const job = useOrganize((s) => s.state);
  if (!job || job.status === 'idle') return null;
  const close = (
    <IconButton label="Close" size="sm" onClick={() => void stopOrganize()}>
      <X size={14} />
    </IconButton>
  );
  if (job.status === 'running') {
    const done = job.done ?? 0;
    const total = job.total ?? 0;
    return (
      <div role="status" className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Throbber size={14} />
          <span className="min-w-0 flex-1">{job.step === 'sort' ? <>Sorting your bookmarks… {done} of {total}</> : 'Working out the folders…'}</span>
          <Button size="sm" variant="ghost" onClick={() => void stopOrganize()}>
            Stop
          </Button>
        </div>
        {job.step === 'sort' && (
          <div className="mt-2 h-1 overflow-hidden rounded bg-bg-3">
            <div className="h-full rounded bg-accent transition-[width] duration-500" style={{ width: `${total ? Math.min(100, Math.round((done / total) * 100)) : 0}%` }} />
          </div>
        )}
      </div>
    );
  }
  if (job.status === 'failed')
    return (
      <div role="status" className="flex items-start gap-2 border-b border-line px-4 py-3 text-[13px]">
        <span className="min-w-0 flex-1 text-warn">{job.error}</span>
        <Button size="sm" variant="ghost" onClick={onAgain}>
          Try again
        </Button>
        {close}
      </div>
    );
  const moved = job.moved ?? 0;
  const made = job.made ?? 0;
  const removed = job.removed ?? 0;
  const left = job.left ?? 0;
  return (
    <div role="status" className="flex items-start gap-2 border-b border-line px-4 py-3 text-[13px]">
      <span className="min-w-0 flex-1 leading-relaxed">
        {moved === 0 ? (
          <span>Nothing to sort: your bookmarks are all in folders already.</span>
        ) : made > 0 ? (
          <span>{`Sorted ${moved} bookmark${moved === 1 ? '' : 's'} into ${made} new folder${made === 1 ? '' : 's'}.`}</span>
        ) : (
          <span>{`Sorted ${moved} bookmark${moved === 1 ? '' : 's'} into your folders.`}</span>
        )}
        {removed > 0 && <> <span>{`Removed ${removed} empty folder${removed === 1 ? '' : 's'}.`}</span></>}
        {left > 0 && <> <span>{`${left} could not be sorted and stay where they were.`}</span></>}
      </span>
      {job.canUndo && (
        <Button size="sm" variant="ghost" onClick={() => void undoOrganize()}>
          Undo
        </Button>
      )}
      {close}
    </div>
  );
}

/** Choosing how to sort the bookmarks, and what goes to the helper model. */
function OrganizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [keep, setKeep] = useState(true);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (open) setKeep(true);
  }, [open]);
  const choose = (k: boolean) => {
    setKeep(k);
    cards.current[k ? 0 : 1]?.focus();
  };
  const keys = (e: React.KeyboardEvent) => {
    // Two choices: any arrow goes to the other.
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.key)) (e.preventDefault(), choose(!keep));
  };
  const options = [
    { keep: true, title: 'Keep my folders', body: 'Your folders, and the bookmarks in them, stay as they are. Loose bookmarks go into the folder that fits: one of yours or a new one.' },
    { keep: false, title: 'Start over', body: 'Every bookmark goes into new folders by topic, in Other bookmarks, and your old folders are removed.' },
  ];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Organize your bookmarks with AI"
      width={480}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              void startOrganize(keep);
            }}
          >
            Organize
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13.5px] leading-relaxed">The helper model sorts your bookmarks into folders by topic.</p>
        <div role="radiogroup" aria-label="How to sort your bookmarks" className="space-y-2" onKeyDown={keys}>
          {options.map((o, i) => (
            <button
              key={o.title}
              ref={(el) => void (cards.current[i] = el)}
              type="button"
              role="radio"
              aria-checked={keep === o.keep}
              tabIndex={keep === o.keep ? 0 : -1}
              onClick={() => setKeep(o.keep)}
              className={cx('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors', keep === o.keep ? 'border-accent/60 bg-accent/5 ring-1 ring-accent/30' : 'border-line-2 hover:bg-bg-2')}
            >
              <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', keep === o.keep ? 'border-accent' : 'border-line-2')} aria-hidden>
                {keep === o.keep && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-medium">{o.title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-3">{o.body}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-[12.5px] leading-snug text-fg-3">
          The sites pinned on your bookmarks bar stay where they are. The titles and addresses of your bookmarks (without what follows a ? or #) and your folders’ names go to the{' '}
          <button type="button" className="text-accent hover:underline" onClick={() => (onClose(), go('/settings?s=models&find=Helper%20model'))}>
            helper model
          </button>
          , only now. You can undo it afterwards.
        </p>
      </div>
    </Dialog>
  );
}

/** Bringing bookmarks in from the other browsers here or from a file, and out as a file. */
function ImportBox() {
  const [sources, setSources] = useState<BookmarkSource[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Read again once the window is back from System Settings (Full Disk Access), and whether that was done.
  const [again, setAgain] = useState(0);
  const [retried, setRetried] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    api<{ sources: BookmarkSource[] }>('/api/browser/bookmarks/sources').then(
      (r) => {
        if (!live) return;
        setSources(r.sources);
        if (again) setRetried(true);
      },
      () => live && setSources([]),
    );
    return () => {
      live = false;
    };
  }, [again]);
  // Safari, until Hydor has Full Disk Access: a button opens where a Mac gives it.
  const access = (s: BookmarkSource) => s.needs === 'full-disk-access' && canOpenFullDiskAccess;

  const bring = async (id: string, body: { source: string } | { html: string }) => {
    setBusy(id);
    try {
      const r = await post<{ added: number; folder?: string; nodes: BookmarkNode[] }>('/api/browser/bookmarks/import', body);
      useBookmarks.setState({ nodes: r.nodes, loaded: true });
      toast(r.added ? `Brought in ${r.added} bookmark${r.added === 1 ? '' : 's'}` : 'There were no bookmarks to bring in', 'info');
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) return toast('That file is too big: bookmarks files are up to 20 MB', 'error');
    await bring('file', { html: await f.text() });
  };

  return (
    <div className="mt-4 border-t border-line pb-4">
      <div className="px-4 pt-3 pb-1 text-[11.5px] font-medium text-fg-3">Import</div>
      {sources === null && (
        <div className="flex justify-center py-3">
          <Throbber size={18} />
        </div>
      )}
      {sources?.map((s) => (
        <div key={s.id} className="flex items-center gap-2 px-4 py-1.5">
          <div className="min-w-0 flex-1">
            <div translate="no" className="truncate text-[13px]">
              {s.browser}
              {s.profile ? ` · ${s.profile}` : ''}
            </div>
            <div className={cx('text-[12px]', s.error ? 'text-warn' : 'text-fg-3')}>{s.error ? s.error : `${s.count} bookmark${s.count === 1 ? '' : 's'}`}</div>
            {access(s) && retried && <div className="text-[12px] text-fg-3">{REOPEN_NOTE}</div>}
          </div>
          {access(s) ? (
            <OpenSettings onBack={() => setAgain((n) => n + 1)} />
          ) : (
            <Button size="sm" disabled={!!s.error || !s.count || busy !== null} onClick={() => void bring(s.id, { source: s.id })}>
              {busy === s.id ? 'Importing…' : 'Import'}
            </Button>
          )}
        </div>
      ))}
      {sources?.length === 0 && <Note>No other browser with bookmarks was found on this computer.</Note>}
      <div className="flex flex-wrap gap-2 px-4 pt-2">
        <input ref={file} type="file" accept=".html,.htm,text/html" hidden onChange={(e) => (void pickFile(e.target.files?.[0]), (e.target.value = ''))} />
        <Button size="sm" icon={<FileUp size={14} />} disabled={busy !== null} onClick={() => file.current?.click()}>
          From a file
        </Button>
        <a
          href={mu('/api/browser/bookmarks/export')}
          download="bookmarks.html"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] bg-bg-2 px-3 text-[13px] font-medium text-fg ring-1 ring-line-2 transition duration-150 ring-inset select-none hover:bg-bg-3 active:scale-[0.97]"
        >
          <Download size={14} />
          Export
        </a>
      </div>
    </div>
  );
}
