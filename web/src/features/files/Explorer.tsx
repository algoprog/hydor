import { memo, useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileJson,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderUp,
  MessageSquarePlus,
  MoreHorizontal,
  NotebookText,
  Pencil,
  SquareTerminal,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, post } from '../../lib/api';
import { basename, dirname, joinPath, tildify } from '../../lib/format';
import { go, openFile } from '../../lib/nav';
import { toast, toastError, useApp, useUI } from '../../lib/store';
import { entriesFromDrop, pickedFromInput, startUpload, walkEntries } from '../../lib/upload';
import { cx, IconButton, MenuItem, MenuSep, Popover, useConfirm, useIsMobile } from '../../components/ui';
import { FolderPicker } from '../../components/FolderPicker';
import { openTerminalAt } from '../terminal/TerminalPanel';
import { mu } from '../../lib/machine';
import { RefreshIcon } from '../../components/RefreshIcon';

export interface FsEntry {
  name: string;
  path: string;
  type: 'dir' | 'file' | 'symlink' | 'other';
  size: number;
  mtime: number;
  git?: string;
  dirLink?: boolean;
}

const isDir = (e: FsEntry) => e.type === 'dir' || !!e.dirLink;
const INTERNAL = 'application/x-wa-path';

const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rs|go|java|c|cc|cpp|h|hpp|cs|rb|php|swift|kt|scala|sh|bash|zsh|lua|r|jl|sql|css|scss|html|vue|svelte|toml|yaml|yml|xml|ini|conf|tex|zig|ex|exs|dart|nix)$/i;
function FileIcon({ e, open }: { e: FsEntry; open?: boolean }) {
  if (isDir(e)) return open ? <FolderOpen size={15} className="shrink-0 text-accent/80" /> : <Folder size={15} className="shrink-0 text-accent/80" />;
  const n = e.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/.test(n)) return <FileImage size={15} className="shrink-0 text-fg-3" />;
  if (/\.(json|jsonl|ndjson)$/.test(n)) return <FileJson size={15} className="shrink-0 text-fg-3" />;
  if (/\.(zip|tar|gz|tgz|zst|bz2|xz|7z|rar)$/.test(n)) return <FileArchive size={15} className="shrink-0 text-fg-3" />;
  if (n.endsWith('.ipynb')) return <NotebookText size={15} className="shrink-0 text-fg-3" />;
  if (/\.(md|txt|rst|log|csv|tsv)$/.test(n)) return <FileText size={15} className="shrink-0 text-fg-3" />;
  if (CODE.test(n)) return <FileCode2 size={15} className="shrink-0 text-fg-3" />;
  return <File size={15} className="shrink-0 text-fg-3" />;
}

const GIT_CLS: Record<string, string> = { M: 'text-warn', A: 'text-ok', U: 'text-ok', D: 'text-err', R: 'text-info', C: 'text-err', '•': 'text-warn' };

const expandedKey = (root: string) => `wa.tree.${root}`;
// Fingers: rows don't drag (a long press opens the menu instead).
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function Explorer() {
  const mobile = useIsMobile();
  const isz = mobile ? 'md' : 'sm';
  const boot = useApp((s) => s.boot);
  const root = useUI((s) => s.explorerRoot) ?? boot?.defaultCwd ?? '/';
  const hidden = useUI((s) => s.showHidden);
  const [dirs, setDirs] = useState<Record<string, FsEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rootInput, setRootInput] = useState('');
  const [editRoot, setEditRoot] = useState(false);
  const [creating, setCreating] = useState<{ dir: string; kind: 'file' | 'dir' } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ e: FsEntry; anchor: HTMLElement } | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const uploadDir = useRef(root);
  const menuAnchor = useRef<HTMLElement | null>(null);

  const load = useCallback(
    async (dir: string) => {
      try {
        const r = await api<{ entries: FsEntry[] }>(`/api/fs/list?path=${encodeURIComponent(dir)}${hidden ? '&hidden=1' : ''}`);
        setDirs((d) => ({ ...d, [dir]: r.entries }));
      } catch (e) {
        setDirs((d) => ({ ...d, [dir]: [] }));
        if (dir === root) toastError(e);
      }
    },
    [hidden, root],
  );

  useEffect(() => {
    let saved: string[] = [];
    try {
      saved = JSON.parse(localStorage.getItem(expandedKey(root)) ?? '[]');
    } catch {}
    const set = new Set<string>(saved.filter((p) => p.startsWith(root)));
    setExpanded(set);
    setDirs({});
    load(root);
    for (const p of set) load(p);
  }, [root, hidden, load]);

  useEffect(() => {
    try {
      localStorage.setItem(expandedKey(root), JSON.stringify([...expanded].slice(0, 200)));
    } catch {}
  }, [expanded, root]);

  const refreshAll = useCallback(() => {
    load(root);
    for (const p of expanded) load(p);
  }, [expanded, load, root]);

  // Agents change files constantly; keep what is on screen fresh.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refreshAll(), 5000);
    return () => clearInterval(t);
  }, [refreshAll]);

  const toggle = (p: string) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else {
        n.add(p);
        if (!dirs[p]) load(p);
      }
      return n;
    });
  };

  const dirOf = (e: FsEntry) => (isDir(e) ? e.path : dirname(e.path));

  const doUpload = async (dir: string, files: { file: File; rel: string }[], empty: string[] = []) => {
    if (!dir) return;
    setExpanded((s) => new Set(s).add(dir));
    await startUpload(dir, files, empty, () => load(dir));
  };

  const onDrop = async (e: DragEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const from = e.dataTransfer.getData(INTERNAL);
    if (from) {
      if (from === dir || dirname(from) === dir || dir.startsWith(from + '/')) return;
      try {
        await post('/api/fs/rename', { from, to: joinPath(dir, basename(from)) });
        load(dirname(from));
        load(dir);
      } catch (err) {
        toastError(err);
      }
      return;
    }
    const entries = entriesFromDrop(e.dataTransfer);
    if (entries.length) {
      const { files, emptyDirs } = await walkEntries(entries);
      doUpload(dir, files, emptyDirs);
    } else if (e.dataTransfer.files.length) {
      doUpload(dir, pickedFromInput(e.dataTransfer.files));
    }
  };

  const dragOver = (e: DragEvent, dir: string) => {
    const t = e.dataTransfer.types;
    if (!t.includes('Files') && !t.includes(INTERNAL)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = t.includes(INTERNAL) ? 'move' : 'copy';
    if (dropTarget !== dir) setDropTarget(dir);
  };

  const create = async (name: string) => {
    const c = creating;
    setCreating(null);
    if (!c || !name.trim()) return;
    const p = joinPath(c.dir, name.trim());
    try {
      if (c.kind === 'dir') await post('/api/fs/mkdir', { path: p });
      else await api('/api/fs/write', { method: 'PUT', body: { path: p, content: '', create: true } });
      await load(c.dir);
      if (c.kind === 'file') openFile(p);
    } catch (e) {
      toastError(e);
    }
  };

  const rename = async (e: FsEntry, name: string) => {
    setRenaming(null);
    if (!name.trim() || name === e.name) return;
    try {
      await post('/api/fs/rename', { from: e.path, to: joinPath(dirname(e.path), name.trim()) });
      load(dirname(e.path));
    } catch (err) {
      toastError(err);
    }
  };

  const remove = async (e: FsEntry) => {
    const ok = await confirm({
      title: `Delete ${e.name}?`,
      body: isDir(e) ? 'The folder and everything in it moves to ~/.web-agent/trash.' : 'The file moves to ~/.web-agent/trash.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await post('/api/fs/delete', { path: e.path });
      load(dirname(e.path));
    } catch (err) {
      toastError(err);
    }
  };

  const renderDir = (dir: string, depth: number): ReactNode => {
    const list = dirs[dir];
    const rows: ReactNode[] = [];
    if (creating && creating.dir === dir) {
      rows.push(<NameInput key="__new" depth={depth} kind={creating.kind} onDone={create} />);
    }
    if (!list) {
      rows.push(
        <div key="__loading" style={{ paddingLeft: 12 + depth * 14 }} className="py-1 text-[12px] text-fg-3">
          Loading…
        </div>,
      );
      return rows;
    }
    for (const e of list) {
      const open = isDir(e) && expanded.has(e.path);
      rows.push(
        <TreeRow
          key={e.path}
          e={e}
          depth={depth}
          open={open}
          renaming={renaming === e.path}
          drop={dropTarget === e.path}
          onClick={() => (isDir(e) ? toggle(e.path) : openFile(e.path))}
          onRename={(n) => rename(e, n)}
          onMenu={(el) => {
            menuAnchor.current = el;
            setMenu({ e, anchor: el });
          }}
          onDragOver={(ev) => (isDir(e) ? dragOver(ev, e.path) : dragOver(ev, dirname(e.path)))}
          onDrop={(ev) => onDrop(ev, isDir(e) ? e.path : dirname(e.path))}
        />,
      );
      if (open) rows.push(<div key={`${e.path}/__children`}>{renderDir(e.path, depth + 1)}</div>);
    }
    if (!list.length && !(creating && creating.dir === dir)) {
      rows.push(
        <div key="__empty" style={{ paddingLeft: 26 + depth * 14 }} className="py-0.5 text-[12px] text-fg-3 italic">
          empty
        </div>,
      );
    }
    return rows;
  };

  const home = boot?.home;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-2 pt-2.5 pb-1.5">
        {editRoot ? (
          <div className="min-w-0 flex-1">
            <FolderPicker
              value={rootInput}
              onChange={(v) => {
                setRootInput(v);
              }}
              autoFocus
            />
            <div className="mt-1 flex justify-end gap-1">
              <button className="rounded px-2 py-0.5 text-[12px] text-fg-3 hover:text-fg" onClick={() => setEditRoot(false)}>
                Cancel
              </button>
              <button
                className="rounded bg-bg-3 px-2 py-0.5 text-[12px]"
                onClick={() => {
                  const v = rootInput.startsWith('~') ? (home ?? '') + rootInput.slice(1) : rootInput;
                  useUI.getState().set({ explorerRoot: v.replace(/\/+$/, '') || '/' });
                  setEditRoot(false);
                }}
              >
                Open
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-left font-mono text-[12px] text-fg-2 hover:bg-bg-2 hover:text-fg"
              title={`${root} (click to change)`}
              onClick={() => {
                setRootInput(tildify(root, home));
                setEditRoot(true);
              }}
            >
              {tildify(root, home)}
            </button>
            <IconButton label="Up one folder" size={isz} onClick={() => useUI.getState().set({ explorerRoot: dirname(root) })} disabled={root === '/'}>
              <FolderUp size={14} />
            </IconButton>
            <IconButton label="New file" size={isz} onClick={() => setCreating({ dir: root, kind: 'file' })}>
              <FilePlus2 size={14} />
            </IconButton>
            <IconButton label="New folder" size={isz} onClick={() => setCreating({ dir: root, kind: 'dir' })}>
              <FolderPlus size={14} />
            </IconButton>
            <IconButton
              label="Upload files"
              size={isz}
              onClick={() => {
                uploadDir.current = root;
                fileInput.current?.click();
              }}
            >
              <Upload size={14} />
            </IconButton>
            <IconButton label={hidden ? 'Hide dotfiles' : 'Show dotfiles'} size={isz} onClick={() => useUI.getState().set({ showHidden: !hidden })}>
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </IconButton>
            <IconButton label="Refresh" size={isz} onClick={refreshAll}>
              <RefreshIcon size={13} />
            </IconButton>
          </>
        )}
      </div>
      <div
        className={cx('min-h-0 flex-1 overflow-auto pb-6 transition-colors', dropTarget === root && 'bg-accent/8 outline-2 -outline-offset-4 outline-accent/50 outline-dashed')}
        onDragOver={(e) => dragOver(e, root)}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
        }}
        onDrop={(e) => onDrop(e, root)}
      >
        {renderDir(root, 0)}
      </div>
      {!mobile && <div className="border-t border-line px-3 py-1.5 text-[11px] text-fg-3">Drop files or folders on a folder to upload</div>}
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) doUpload(uploadDir.current, pickedFromInput(e.target.files));
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
          if (e.target.files?.length) doUpload(uploadDir.current, pickedFromInput(e.target.files));
          e.target.value = '';
        }}
      />
      <Popover anchor={menuAnchor} open={!!menu} onClose={() => setMenu(null)} width={230}>
        {menu && (
          <>
            {!isDir(menu.e) && (
              <MenuItem icon={<FileText size={14} />} onClick={() => (setMenu(null), openFile(menu.e.path))}>
                Open
              </MenuItem>
            )}
            {isDir(menu.e) && (
              <MenuItem icon={<FolderOpen size={14} />} onClick={() => (setMenu(null), useUI.getState().set({ explorerRoot: menu.e.path }))}>
                Open as root
              </MenuItem>
            )}
            <MenuItem icon={<FilePlus2 size={14} />} onClick={() => (setMenu(null), setExpanded((s) => new Set(s).add(dirOf(menu.e))), setCreating({ dir: dirOf(menu.e), kind: 'file' }))}>
              New file here
            </MenuItem>
            <MenuItem icon={<FolderPlus size={14} />} onClick={() => (setMenu(null), setExpanded((s) => new Set(s).add(dirOf(menu.e))), setCreating({ dir: dirOf(menu.e), kind: 'dir' }))}>
              New folder here
            </MenuItem>
            <MenuItem
              icon={<Upload size={14} />}
              onClick={() => {
                setMenu(null);
                uploadDir.current = dirOf(menu.e);
                fileInput.current?.click();
              }}
            >
              Upload files here
            </MenuItem>
            <MenuItem
              icon={<FolderUp size={14} />}
              onClick={() => {
                setMenu(null);
                uploadDir.current = dirOf(menu.e);
                folderInput.current?.click();
              }}
            >
              Upload a folder here
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<SquareTerminal size={14} />} onClick={() => (setMenu(null), openTerminalAt(dirOf(menu.e)))}>
              Open terminal here
            </MenuItem>
            <MenuItem icon={<MessageSquarePlus size={14} />} onClick={() => (setMenu(null), go(`/?cwd=${encodeURIComponent(dirOf(menu.e))}`))}>
              New agent session here
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(null), setRenaming(menu.e.path))}>
              Rename
            </MenuItem>
            <MenuItem
              icon={<Copy size={14} />}
              onClick={() => {
                setMenu(null);
                navigator.clipboard.writeText(menu.e.path).then(() => toast('Path copied', 'ok'));
              }}
            >
              Copy path
            </MenuItem>
            {!isDir(menu.e) && (
              <MenuItem
                icon={<Download size={14} />}
                onClick={() => {
                  setMenu(null);
                  const a = document.createElement('a');
                  a.href = mu(`/api/fs/raw?download=1&path=${encodeURIComponent(menu.e.path)}`);
                  a.click();
                }}
              >
                Download
              </MenuItem>
            )}
            <MenuItem danger icon={<Trash2 size={14} />} onClick={() => (setMenu(null), remove(menu.e))}>
              Delete
            </MenuItem>
          </>
        )}
      </Popover>
      {confirmNode}
    </div>
  );
}

const TreeRow = memo(function TreeRow({
  e,
  depth,
  open,
  renaming,
  drop,
  onClick,
  onRename,
  onMenu,
  onDragOver,
  onDrop,
}: {
  e: FsEntry;
  depth: number;
  open: boolean;
  renaming: boolean;
  drop: boolean;
  onClick: () => void;
  onRename: (n: string) => void;
  onMenu: (el: HTMLElement) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const press = useRef<number | null>(null);
  if (renaming) return <NameInput depth={depth} kind={isDir(e) ? 'dir' : 'file'} initial={e.name} onDone={onRename} />;
  return (
    <div
      ref={ref}
      role="treeitem"
      aria-expanded={isDir(e) ? open : undefined}
      draggable={!TOUCH}
      onDragStart={(ev) => {
        ev.dataTransfer.setData(INTERNAL, e.path);
        ev.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={(ev) => {
        ev.preventDefault();
        onMenu(ref.current!);
      }}
      onTouchStart={() => {
        press.current = window.setTimeout(() => onMenu(ref.current!), 550);
      }}
      onTouchEnd={() => press.current && clearTimeout(press.current)}
      onTouchMove={() => press.current && clearTimeout(press.current)}
      style={{ paddingLeft: 6 + depth * 14 }}
      className={cx(
        'group flex h-7 cursor-pointer items-center gap-1.5 pr-1 text-[13px] select-none [-webkit-touch-callout:none] hover:bg-bg-2 max-md:h-10 max-md:gap-2 max-md:text-[14px] max-md:active:bg-bg-2',
        drop && 'bg-accent/12 outline-1 -outline-offset-1 outline-accent/60',
      )}
    >
      <ChevronRight size={12} className={cx('shrink-0 text-fg-3 transition-transform max-md:size-3.5', !isDir(e) && 'invisible', open && 'rotate-90')} />
      <FileIcon e={e} open={open} />
      <span className={cx('min-w-0 flex-1 truncate', e.git && e.git !== '•' && GIT_CLS[e.git])} title={e.path}>
        {e.name}
      </span>
      {e.git && <span className={cx('w-3 shrink-0 text-center font-mono text-[10.5px]', GIT_CLS[e.git] ?? 'text-fg-3')}>{e.git}</span>}
      <button
        className="invisible flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded text-fg-3 group-hover:visible hover:bg-bg-3 hover:text-fg max-md:visible max-md:h-9 max-md:w-9"
        onClick={(ev) => {
          ev.stopPropagation();
          onMenu(ref.current!);
        }}
        aria-label="More"
      >
        <MoreHorizontal size={13} />
      </button>
    </div>
  );
});

function NameInput({ depth, kind, initial = '', onDone }: { depth: number; kind: 'file' | 'dir'; initial?: string; onDone: (name: string) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (val: string) => {
    if (done.current) return;
    done.current = true;
    onDone(val);
  };
  return (
    <div style={{ paddingLeft: 24 + depth * 14 }} className="flex h-7 items-center gap-1.5 pr-2 max-md:h-10">
      {kind === 'dir' ? <Folder size={15} className="shrink-0 text-accent/80" /> : <File size={15} className="shrink-0 text-fg-3" />}
      <input
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => {
          const dot = initial.lastIndexOf('.');
          e.target.setSelectionRange(0, dot > 0 && kind === 'file' ? dot : initial.length);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') finish(v);
          if (e.key === 'Escape') finish('');
        }}
        onBlur={() => finish(v)}
        className="h-6 min-w-0 flex-1 rounded border border-accent/60 bg-bg-1 px-1.5 text-[13px] outline-none max-md:h-8"
        placeholder={kind === 'dir' ? 'folder name' : 'file name'}
      />
    </div>
  );
}
