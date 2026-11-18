// The bookmarks panel: the tree (folders open and close; drag a row to move it, or use its arrows), adding a folder,
// renaming and deleting, and bringing bookmarks in from the browsers on this computer or from a file, or out.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, FileUp, Folder, FolderOpen, FolderPlus, Globe, Pencil, Trash2 } from 'lucide-react';
import type { BookmarkNode, BookmarkSource } from '@shared/browser';
import { api, post } from '../../lib/api';
import { mu } from '../../lib/machine';
import { canOpenFullDiskAccess } from '../../lib/notify';
import { toast, toastError } from '../../lib/store';
import { Button, cx, IconButton, Throbber } from '../../components/ui';
import { RenameDialog, openBookmark, useDeleteBookmark } from './BookmarkBar';
import { addBookmark, childrenOf, editBookmark, loadBookmarks, useBookmarks, withinFolder } from './browsing';
import { OpenSettings, REOPEN_NOTE } from './ImportBrowsers';
import { Note, Panel } from './Panel';

interface Row {
  node: BookmarkNode;
  depth: number;
  /** Its place among its siblings, and how many there are. */
  index: number;
  count: number;
}

/** Where a drag would put the row: before or after another, or inside a folder (at its end). */
type Drop = { id: string; where: 'before' | 'after' | 'into' } | { id: 'bar' | 'other'; where: 'into' };

export function BookmarksPanel({ onClose }: { onClose: () => void }) {
  const nodes = useBookmarks((s) => s.nodes);
  const loaded = useBookmarks((s) => s.loaded);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [rename, setRename] = useState<BookmarkNode | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop | null>(null);
  const [remove, confirmNode] = useDeleteBookmark();
  useEffect(() => void loadBookmarks(), []);

  const rowsOf = (parent: string, depth: number): Row[] => {
    const items = childrenOf(nodes, parent);
    return items.flatMap((node, index) => [{ node, depth, index, count: items.length }, ...(!node.url && !closed[node.id] ? rowsOf(node.id, depth + 1) : [])]);
  };
  const bar = useMemo(() => rowsOf('bar', 0), [nodes, closed]); // eslint-disable-line react-hooks/exhaustive-deps
  const other = useMemo(() => rowsOf('other', 0), [nodes, closed]); // eslint-disable-line react-hooks/exhaustive-deps

  const newFolder = async () => {
    const r = await addBookmark({ title: 'New folder', parent: 'bar' });
    if (r?.node) setRename(r.node);
  };

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
    const isOpen = !closed[n.id];
    const hot = drop?.id === n.id ? drop.where : null;
    return (
      <div
        key={n.id}
        draggable
        onDragStart={(e) => (e.dataTransfer.setData('text/plain', n.id), (e.dataTransfer.effectAllowed = 'move'), setDragging(n.id))}
        onDragOver={(e) => over(e, n)}
        onDrop={(e) => (e.preventDefault(), void finish())}
        onDragEnd={() => (setDragging(null), setDrop(null))}
        style={{ paddingLeft: 8 + r.depth * 16 }}
        className={cx(
          'group relative flex h-9 items-center gap-1.5 pr-1.5 text-[13px] hover:bg-bg-2',
          dragging === n.id && 'opacity-40',
          hot === 'into' && 'bg-accent/10 ring-1 ring-accent/40 ring-inset',
          hot === 'before' && 'before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:rounded before:bg-accent',
          hot === 'after' && 'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded after:bg-accent',
        )}
      >
        {n.url ? (
          <span className="w-4 shrink-0" />
        ) : (
          <button aria-label={isOpen ? 'Close folder' : 'Open folder'} onClick={() => setClosed((c) => ({ ...c, [n.id]: isOpen }))} className="flex h-5 w-4 shrink-0 items-center justify-center text-fg-3 hover:text-fg">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
        <button
          onClick={(e) => (n.url ? openBookmark(n, e.ctrlKey || e.metaKey) : setClosed((c) => ({ ...c, [n.id]: isOpen })))}
          title={n.url ? `${n.title}\n${n.url}` : n.title}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {n.url ? <Globe size={14} className="shrink-0 text-fg-3" /> : isOpen ? <FolderOpen size={14} className="shrink-0 text-fg-3" /> : <Folder size={14} className="shrink-0 text-fg-3" />}
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

  return (
    <Panel
      title="Bookmarks"
      onClose={onClose}
      actions={
        <IconButton label="New folder" size="sm" onClick={() => void newFolder()}>
          <FolderPlus size={16} />
        </IconButton>
      }
    >
      {!loaded ? (
        <div className="flex justify-center py-10">
          <Throbber size={24} />
        </div>
      ) : (
        <>
          {section('bar', 'Bookmarks bar', bar)}
          {section('other', 'Other bookmarks', other)}
          {!nodes.length && <Note>Click the star in the address bar to bookmark a page, or bring in the bookmarks of another browser below.</Note>}
        </>
      )}
      <ImportBox />
      <RenameDialog node={rename} onClose={() => setRename(null)} />
      {confirmNode}
    </Panel>
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
