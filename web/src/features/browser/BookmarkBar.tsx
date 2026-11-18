// The sites pinned at the top of the tab column: the items of the bookmarks bar, folders opening a list of theirs; and the
// parts of bookmarks that the bookmarks panel shares (opening one, renaming, deleting).
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Ellipsis, ExternalLink, Folder, FolderOpen, Pencil, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { BookmarkNode } from '@shared/browser';
import { Button, cx, Dialog, inputCls, MenuItem, Popover, useConfirm } from '../../components/ui';
import { activeTab, addBookmark, childrenOf, countIn, editBookmark, goTo, KEY, newTab, removeBookmark, useBookmarks } from './browsing';
import { useBrowser } from './store';
import { SiteIcon } from './TabStrip';

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

/** Items as a list, their own folders opening in place; a click goes to the bookmark. */
function NodeList({ nodes, all, onPick, depth = 0 }: { nodes: BookmarkNode[]; all: BookmarkNode[]; onPick: (n: BookmarkNode, inNew: boolean) => void; depth?: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!nodes.length) return <div className="px-2.5 py-2 text-[12.5px] text-fg-3">Empty</div>;
  return (
    <>
      {nodes.map((n) =>
        n.url ? (
          <div key={n.id} style={{ paddingLeft: depth * 14 }} translate="no">
            <MenuItem icon={<SiteIcon url={n.url} size={14} />} onClick={() => onPick(n, false)}>
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
            {open[n.id] && <NodeList nodes={childrenOf(all, n.id)} all={all} onPick={onPick} depth={depth + 1} />}
          </div>
        ),
      )}
    </>
  );
}

/** A folder's items as a list. */
function FolderList({ nodes, parent, onPick }: { nodes: BookmarkNode[]; parent: string; onPick: (n: BookmarkNode, inNew: boolean) => void }) {
  return <NodeList nodes={childrenOf(nodes, parent)} all={nodes} onPick={onPick} />;
}

/**
 * A clear layer under a list that floats over the page: the page (the desktop app's own view) is taken away for a still
 * picture of itself only when something is found over several places of it, which a small list is not; this covers them
 * all. A press on it closes the list.
 */
function Scrim({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? createPortal(<div className="fixed inset-0 z-40" onPointerDown={onClose} aria-hidden />, document.body) : null;
}

/** One pinned site: a 40 px tile with its icon, or a folder opening a list of its own. */
function Tile({ n, nodes, onMenu }: { n: BookmarkNode; nodes: BookmarkNode[]; onMenu: (n: BookmarkNode, el: HTMLElement) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={ref}
        data-bar-item={n.id}
        title={n.url ? `${n.title}\n${n.url}` : n.title}
        aria-label={n.title || n.url || 'Folder'}
        onClick={(e) => (n.url ? openBookmark(n, e.ctrlKey || e.metaKey) : setOpen((o) => !o))}
        onAuxClick={(e) => e.button === 1 && (e.preventDefault(), openBookmark(n, true))}
        onContextMenu={(e: ReactMouseEvent<HTMLButtonElement>) => (e.preventDefault(), onMenu(n, e.currentTarget))}
        className={cx('flex h-10 w-10 items-center justify-center rounded-[10px] bg-bg-2 transition-colors hover:bg-bg-3', open && 'bg-bg-3')}
      >
        {n.url ? <SiteIcon url={n.url} size={20} /> : <Folder size={19} className="text-fg-2" />}
      </button>
      {!n.url && <Scrim open={open} onClose={() => setOpen(false)} />}
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

/** Tiles to a row, and rows before the rest go under a "…" tile. */
const PER_ROW = 5;
const ROWS = 2;

/**
 * The sites pinned in the tab column: the items of the bookmarks bar as tiles, five to a row, two rows at most (then a
 * "…" tile lists the rest). A click opens the site in this tab, a middle or Ctrl click in a new one, a right click edits it.
 */
export function PinnedTiles() {
  const nodes = useBookmarks((s) => s.nodes);
  const items = useMemo(() => childrenOf(nodes, 'bar'), [nodes]);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState<BookmarkNode | null>(null);
  const [rename, setRename] = useState<BookmarkNode | null>(null);
  const menuAt = useRef<HTMLElement | null>(null);
  const [remove, confirmNode] = useDeleteBookmark();

  if (!items.length) return null;
  const cap = PER_ROW * ROWS;
  const over = items.length > cap;
  const shown = over ? items.slice(0, cap - 1) : items;
  const rest = over ? items.slice(cap - 1) : [];
  return (
    <div className="grid grid-cols-5 gap-2.5 px-2.5 pt-3 pb-1">
      {shown.map((n) => (
        <Tile
          key={n.id}
          n={n}
          nodes={nodes}
          onMenu={(x, el) => {
            menuAt.current = el;
            setMenu(x);
          }}
        />
      ))}
      {over && (
        <>
          <button ref={moreRef} aria-label="More pinned sites" title="More pinned sites" onClick={() => setMore((o) => !o)} className={cx('flex h-10 w-10 items-center justify-center rounded-[10px] bg-bg-2 text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg', more && 'bg-bg-3')}>
            <Ellipsis size={18} />
          </button>
          <Scrim open={more} onClose={() => setMore(false)} />
          <Popover anchor={moreRef} open={more} onClose={() => setMore(false)} width={300}>
            <div className="max-h-[60vh] overflow-y-auto">
              <NodeList
                nodes={rest}
                all={nodes}
                onPick={(b, inNew) => {
                  setMore(false);
                  openBookmark(b, inNew);
                }}
              />
            </div>
          </Popover>
        </>
      )}
      <Scrim open={!!menu} onClose={() => setMenu(null)} />
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
