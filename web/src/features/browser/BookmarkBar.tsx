// The bookmarks bar under the address bar: the items of the bookmarks bar root, folders opening a list of theirs.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ChevronsRight, ExternalLink, Folder, FolderOpen, Globe, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { BookmarkNode } from '@shared/browser';
import { Button, Dialog, inputCls, MenuItem, Popover, useConfirm } from '../../components/ui';
import { activeTab, addBookmark, childrenOf, countIn, editBookmark, goTo, KEY, newTab, removeBookmark, useBookmarks } from './browsing';
import { useBrowser } from './store';

/** Opens a bookmark here, or in a new tab (Ctrl or ⌘ held, or the middle button). */
export function openBookmark(n: BookmarkNode, inNew: boolean) {
  if (!n.url) return;
  if (inNew) return void newTab(n.url);
  void goTo(n.url, { tab: activeTab(useBrowser.getState().views[KEY])?.id });
}

/** A name asked for: a folder's new one, or a bookmark's. */
export function RenameDialog({ node, onClose }: { node: BookmarkNode | null; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => {
    setTitle(node?.title ?? '');
    setUrl(node?.url ?? '');
  }, [node?.id]);
  const save = async () => {
    if (!node) return;
    const patch: { title?: string; url?: string } = {};
    if (title.trim() !== node.title) patch.title = title.trim();
    if (node.url && url.trim() !== node.url) patch.url = url.trim();
    onClose();
    if (Object.keys(patch).length) await editBookmark(node.id, patch);
  };
  return (
    <Dialog
      open={!!node}
      onClose={onClose}
      title={node?.url ? 'Edit bookmark' : 'Rename folder'}
      width={440}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!title.trim() || (!!node?.url && !url.trim())} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3" translate="no">
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && void save()} aria-label="Name" placeholder="Name" className={inputCls} />
        {node?.url && <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && title.trim() && url.trim() && void save()} aria-label="Address" placeholder="Address" className={inputCls} />}
      </div>
    </Dialog>
  );
}

/** Deleting a folder asks first when it holds bookmarks. */
export function useDeleteBookmark() {
  const [ask, confirmNode] = useConfirm();
  const remove = async (n: BookmarkNode) => {
    const inside = n.url ? 0 : countIn(useBookmarks.getState().nodes, n.id);
    if (inside > 0 && !(await ask({ title: 'Delete this folder?', body: `It has ${inside} bookmark${inside === 1 ? '' : 's'} in it, which go with it.`, confirm: 'Delete', danger: true }))) return;
    await removeBookmark(n.id);
  };
  return [remove, confirmNode] as const;
}

/** A folder's items as a list, its own folders opening in place; a click goes to the bookmark. */
function FolderList({ nodes, parent, onPick, depth = 0 }: { nodes: BookmarkNode[]; parent: string; onPick: (n: BookmarkNode, inNew: boolean) => void; depth?: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const items = childrenOf(nodes, parent);
  if (!items.length) return <div className="px-2.5 py-2 text-[12.5px] text-fg-3">Empty</div>;
  return (
    <>
      {items.map((n) =>
        n.url ? (
          <div key={n.id} style={{ paddingLeft: depth * 14 }} translate="no">
            <MenuItem icon={<Globe size={14} />} onClick={() => onPick(n, false)}>
              {n.title || n.url}
            </MenuItem>
          </div>
        ) : (
          <div key={n.id}>
            <div style={{ paddingLeft: depth * 14 }} translate="no">
              <MenuItem icon={open[n.id] ? <FolderOpen size={14} /> : <Folder size={14} />} submenu={!open[n.id]} onClick={() => setOpen((o) => ({ ...o, [n.id]: !o[n.id] }))}>
                {n.title || 'Folder'}
              </MenuItem>
            </div>
            {open[n.id] && <FolderList nodes={nodes} parent={n.id} onPick={onPick} depth={depth + 1} />}
          </div>
        ),
      )}
    </>
  );
}

/** One item of the bar: a bookmark, or a folder that opens a list. */
function BarItem({ n, nodes, onMenu }: { n: BookmarkNode; nodes: BookmarkNode[]; onMenu: (n: BookmarkNode, el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        data-bar-item={n.id}
        title={n.url ? `${n.title}\n${n.url}` : n.title}
        onClick={(e) => (n.url ? openBookmark(n, e.ctrlKey || e.metaKey) : setOpen((o) => !o))}
        onAuxClick={(e) => e.button === 1 && (e.preventDefault(), openBookmark(n, true))}
        onContextMenu={(e: ReactMouseEvent<HTMLButtonElement>) => (e.preventDefault(), onMenu(n, e.currentTarget))}
        className="flex h-7 max-w-[170px] shrink-0 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-fg-2 transition-colors hover:bg-bg-2 hover:text-fg"
      >
        {n.url ? <Globe size={13} className="shrink-0 text-fg-3" /> : <Folder size={13} className="shrink-0 text-fg-3" />}
        <span translate="no" className="truncate">
          {n.title || n.url || 'Folder'}
        </span>
      </button>
      {!n.url && (
        <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={280}>
          <div className="max-h-[60vh] overflow-y-auto">
            <FolderList
              nodes={nodes}
              parent={n.id}
              onPick={(b, inNew) => {
                setOpen(false);
                openBookmark(b, inNew);
              }}
            />
          </div>
        </Popover>
      )}
    </>
  );
}

export function BookmarkBar() {
  const nodes = useBookmarks((s) => s.nodes);
  const items = useMemo(() => childrenOf(nodes, 'bar'), [nodes]);
  const row = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<BookmarkNode | null>(null);
  const [rename, setRename] = useState<BookmarkNode | null>(null);
  const menuAt = useRef<HTMLElement | null>(null);
  const [remove, confirmNode] = useDeleteBookmark();

  // A long bar scrolls; the » button then lists every item.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => setOver(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);

  if (!items.length) return null;
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-bg px-2">
      <div ref={row} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {items.map((n) => (
          <BarItem
            key={n.id}
            n={n}
            nodes={nodes}
            onMenu={(x, el) => {
              menuAt.current = el;
              setMenu(x);
            }}
          />
        ))}
      </div>
      {over && (
        <>
          <button ref={moreRef} aria-label="More bookmarks" title="More bookmarks" onClick={() => setMore((o) => !o)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-2 hover:text-fg">
            <ChevronsRight size={15} />
          </button>
          <Popover anchor={moreRef} open={more} onClose={() => setMore(false)} align="end" width={300}>
            <div className="max-h-[60vh] overflow-y-auto">
              <FolderList
                nodes={nodes}
                parent="bar"
                onPick={(b, inNew) => {
                  setMore(false);
                  openBookmark(b, inNew);
                }}
              />
            </div>
          </Popover>
        </>
      )}
      <Popover anchor={menuAt} open={!!menu} onClose={() => setMenu(null)} width={220}>
        {menu && (
          <>
            {menu.url && (
              <>
                <MenuItem icon={<ExternalLink size={14} />} onClick={() => (openBookmark(menu, false), setMenu(null))}>
                  Open
                </MenuItem>
                <MenuItem icon={<SquareArrowOutUpRight size={14} />} onClick={() => (openBookmark(menu, true), setMenu(null))}>
                  Open in a new tab
                </MenuItem>
              </>
            )}
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setRename(menu), setMenu(null))}>
              {menu.url ? 'Edit' : 'Rename'}
            </MenuItem>
            <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (void remove(menu), setMenu(null))}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
      <RenameDialog node={rename} onClose={() => setRename(null)} />
      {confirmNode}
    </div>
  );
}

/** The star: bookmarks the page (on the bar), or takes its bookmarks away. */
export async function toggleBookmark(url: string, title: string, marked: BookmarkNode[]) {
  if (marked.length) {
    for (const n of marked) await removeBookmark(n.id);
    return;
  }
  await addBookmark({ title: title || url, url, parent: 'bar' });
}
