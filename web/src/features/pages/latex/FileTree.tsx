// The LaTeX editor's files tree: the document's files in their folders, as the shared reading of what it uses gives
// them (shared/latex-files.ts): the main file first and marked, then folders and files in a sensible order (sources in
// the order the document reads them, the bibliography, styles and classes, pictures, data, the rest). In the Library,
// the files the document does not use show apart, greyed, under Not used (they stay in it); for a file of this computer,
// what TeX takes from its folder as it is shows too (pictures, styles, classes, data: read-only here). A click opens a
// file; the one in view is marked. Where the document can change: the + at the top (New file, New folder, Add pictures,
// Add a file from this device), a folder's ⋯ (the same, into it; Rename, Delete), a file's ⋯ or right click (Rename,
// Delete); on a computer, files and folders dragged onto a folder, or onto Files at the top, move there (their
// references with them), and files dropped in from the device go into the folder they are dropped on.
// Also the view of a picture or of a file of the folder, in the source's place: FileView.
import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Copy, Ellipsis, File, FileCode2, FilePlus, FileText, FileUp, Folder, FolderOpen, FolderPlus, ImageIcon, ImagePlus, LocateFixed, Pencil, Plus, Sheet, Trash2 } from 'lucide-react';
import { TEX_MAIN } from '@shared/latex';
import { texTree, type TexFileKind, type TexTreeNode, type TexUse } from '@shared/latex-files';
import { api } from '../../../lib/api';
import { bytes } from '../../../lib/format';
import { toast } from '../../../lib/store';
import { Button, cx, IconButton, MenuItem, MenuSep, Popover, Throbber } from '../../../components/ui';

/** A file of the project as the tree shows it. */
export interface TreeEntry {
  /** Its path in the project. */
  name: string;
  kind: TexFileKind;
  /** A text file the editor holds, a picture the document keeps, or a file of the folder TeX reads as it is. */
  where: 'text' | 'picture' | 'folder';
  used: boolean;
  /** A file of the folder's size, in bytes. */
  size?: number;
}

/** What the tree asks the editor to do: new things go in `folder` ("" the project's top, or "chapters/"). */
export interface TreeActions {
  onOpen: (name: string) => void;
  onNew: (what: 'file' | 'folder' | 'pictures' | 'device', folder: string) => void;
  /** A file, or a folder ("chapters/"). */
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  /** Files and folders ("chapters/") moved into a folder ("" the top). */
  onMove: (names: string[], folder: string) => void;
  /** Files from the device dropped on a folder. */
  onDropFiles: (files: File[], folder: string) => void;
}

const DRAG = 'application/x-hydor-tex-files';
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** A file's icon, by its kind. */
export function kindIcon(kind: TexFileKind, size = 14): ReactNode {
  if (kind === 'tex') return <FileText size={size} />;
  if (kind === 'bib') return <BookOpen size={size} />;
  if (kind === 'style') return <FileCode2 size={size} />;
  if (kind === 'picture') return <ImageIcon size={size} />;
  if (kind === 'data') return <Sheet size={size} />;
  return <File size={size} />;
}

const folderOf = (name: string) => (name.includes('/') ? name.slice(0, name.lastIndexOf('/') + 1) : '');

/** The + at the top of the tree (and the folder's ⋯): what can be added, into `folder`. */
function NewItems({ folder, onNew, close }: { folder: string; onNew: TreeActions['onNew']; close: () => void }) {
  const pick = (what: Parameters<TreeActions['onNew']>[0]) => () => {
    close();
    onNew(what, folder);
  };
  return (
    <>
      <MenuItem icon={<FilePlus size={14} />} onClick={pick('file')}>
        New file
      </MenuItem>
      <MenuItem icon={<FolderPlus size={14} />} onClick={pick('folder')}>
        New folder
      </MenuItem>
      <MenuItem icon={<ImagePlus size={14} />} onClick={pick('pictures')}>
        Add pictures
      </MenuItem>
      <MenuItem icon={<FileUp size={14} />} onClick={pick('device')}>
        Add a file from this device
      </MenuItem>
    </>
  );
}

/** The + button: New file, New folder, Add pictures, Add a file from this device, at the project's top. */
export function NewButton({ onNew, className }: { onNew: TreeActions['onNew']; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton ref={ref} label="Add a file, a folder or pictures" size="sm" active={open} onClick={() => setOpen((x) => !x)} className={className}>
        <Plus size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={250} title="Add">
        <NewItems folder="" onNew={onNew} close={() => setOpen(false)} />
      </Popover>
    </>
  );
}

export function FileTree({
  entries,
  main,
  order,
  folders,
  current,
  readOnly,
  actions,
  className,
}: {
  entries: TreeEntry[];
  /** The main file's name as shown ("main.tex", or a file of this computer's own name). */
  main: string;
  /** The order the document reads its sources in. */
  order: string[];
  /** Folders made here that nothing is in yet. */
  folders: string[];
  /** The file in view ("main.tex" for the main file). */
  current: string;
  readOnly: boolean;
  actions: TreeActions;
  className?: string;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ name: string; el: HTMLElement } | null>(null);
  const [drop, setDrop] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLElement | null>(null);
  anchor.current = menu?.el ?? null;
  const byName = useMemo(() => new Map(entries.map((e) => [e.name, e])), [entries]);
  const used = useMemo(() => texTree(entries.filter((e) => e.used).map((e) => e.name), { order, folders }), [entries, order, folders]);
  const unused = useMemo(() => texTree(entries.filter((e) => !e.used).map((e) => e.name), { order }), [entries, order]);

  // The file in view brought into sight, its folders opened.
  useEffect(() => {
    const parts = current.split('/').slice(0, -1);
    if (parts.length) setClosed((c) => (parts.some((_, i) => c.has(`${parts.slice(0, i + 1).join('/')}/`)) ? new Set([...c].filter((x) => !current.startsWith(x))) : c));
    requestAnimationFrame(() => root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }));
  }, [current]);

  const movable = (name: string) => !readOnly && (name.endsWith('/') || byName.get(name)?.where !== 'folder');
  const onDragStart = (e: DragEvent, name: string) => {
    if (!movable(name)) return e.preventDefault();
    e.dataTransfer.setData(DRAG, JSON.stringify([name]));
    e.dataTransfer.effectAllowed = 'move';
  };
  const dropZone = (folder: string) =>
    readOnly
      ? {}
      : {
          onDragOver: (e: DragEvent) => {
            const t = e.dataTransfer.types;
            if (!t.includes(DRAG) && !t.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
            setDrop(folder);
          },
          onDragLeave: (e: DragEvent) => {
            if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDrop((d) => (d === folder ? null : d));
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setDrop(null);
            const raw = e.dataTransfer.getData(DRAG);
            if (raw) {
              const names = (JSON.parse(raw) as string[]).filter((n) => n !== folder && !(n.endsWith('/') && folder.startsWith(n)) && folderOf(n.endsWith('/') ? n.slice(0, -1) : n) !== folder);
              if (names.length) actions.onMove(names, folder);
            } else if (e.dataTransfer.files.length) actions.onDropFiles([...e.dataTransfer.files], folder);
          },
        };

  // ↑ ↓ go from row to row, ← → close and open a folder (or go to its folder), Enter opens.
  const onKeyDown = (e: KeyboardEvent) => {
    const rows = [...(root.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const row = rows[at];
    const folder = row.dataset.folder;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    } else if (e.key === 'ArrowRight' && folder) {
      e.preventDefault();
      setClosed((c) => new Set([...c].filter((x) => x !== folder)));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (folder && !closed.has(folder)) setClosed((c) => new Set([...c, folder]));
      else {
        const up = folderOf((folder ?? row.dataset.name ?? '').replace(/\/$/, ''));
        rows.find((r) => r.dataset.folder === up)?.focus();
      }
    } else if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && (row.dataset.name || folder)) {
      e.preventDefault();
      setMenu({ name: folder ?? row.dataset.name!, el: row });
    }
  };

  const rowCls = (on: boolean, faint: boolean) =>
    cx(
      'group flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md pr-1 text-left text-[12.5px] transition-colors outline-none pointer-coarse:h-9 focus-visible:ring-2 focus-visible:ring-accent/40',
      on ? 'bg-accent-soft font-medium text-accent' : faint ? 'text-fg-3 hover:bg-bg-2 hover:text-fg-2' : 'text-fg-2 hover:bg-bg-2 hover:text-fg',
    );
  const more = (name: string) =>
    !readOnly && (name.endsWith('/') || byName.get(name)?.where !== 'folder') ? (
      <span
        role="button"
        tabIndex={-1}
        aria-label="More"
        onClick={(e) => {
          e.stopPropagation();
          setMenu({ name, el: e.currentTarget.parentElement as HTMLElement });
        }}
        className="ml-auto flex size-6 shrink-0 items-center justify-center rounded text-fg-3 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 hover:bg-bg-3 hover:text-fg pointer-coarse:opacity-100"
      >
        <Ellipsis size={14} />
      </span>
    ) : null;

  const nodes = (list: TexTreeNode[], depth: number, faint: boolean): ReactNode =>
    list.map((n) => {
      const pad = { paddingLeft: 6 + depth * 14 };
      if (n.kind === 'folder') {
        const open = !closed.has(n.name);
        return (
          <div key={`d:${n.name}`} role="group">
            <button
              type="button"
              role="treeitem"
              aria-expanded={open}
              aria-level={depth + 1}
              data-row
              data-folder={n.name}
              draggable={!TOUCH && movable(n.name)}
              onDragStart={(e) => onDragStart(e, n.name)}
              {...dropZone(n.name)}
              onClick={() => setClosed((c) => (open ? new Set([...c, n.name]) : new Set([...c].filter((x) => x !== n.name))))}
              onContextMenu={(e) => {
                if (readOnly) return;
                e.preventDefault();
                setMenu({ name: n.name, el: e.currentTarget });
              }}
              style={pad}
              translate="no"
              className={cx(rowCls(false, faint), drop === n.name && 'bg-accent/15 outline-1 -outline-offset-1 outline-accent/70')}
            >
              {open ? <ChevronDown size={13} className="shrink-0 text-fg-3" /> : <ChevronRight size={13} className="shrink-0 text-fg-3" />}
              <span className="shrink-0 text-fg-3">{open ? <FolderOpen size={14} /> : <Folder size={14} />}</span>
              <span className="min-w-0 truncate">{n.label}</span>
              {more(n.name)}
            </button>
            {open && nodes(n.items, depth + 1, faint)}
          </div>
        );
      }
      const e = byName.get(n.name);
      const on = current === n.name;
      const fromFolder = e?.where === 'folder';
      return (
        <button
          key={`f:${n.name}`}
          type="button"
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={on}
          data-row
          data-name={n.name}
          draggable={!TOUCH && movable(n.name)}
          onDragStart={(ev) => onDragStart(ev, n.name)}
          {...dropZone(folderOf(n.name))}
          onClick={() => actions.onOpen(n.name)}
          onContextMenu={(ev) => {
            if (!movable(n.name)) return;
            ev.preventDefault();
            setMenu({ name: n.name, el: ev.currentTarget });
          }}
          title={fromFolder ? `${n.name}: in the folder, typeset as it is${e?.size !== undefined ? ` (${bytes(e.size)})` : ''}` : n.name}
          style={{ paddingLeft: 6 + depth * 14 + 17 }}
          translate="no"
          className={rowCls(on, faint)}
        >
          <span className={cx('shrink-0', on ? 'text-accent' : 'text-fg-3', fromFolder && !on && 'opacity-70')}>{kindIcon(n.type)}</span>
          <span className={cx('min-w-0 truncate', fromFolder && !on && 'text-fg-3')}>{n.label}</span>
          {more(n.name)}
        </button>
      );
    });

  const menuFor = menu?.name ?? '';
  const isFolder = menuFor.endsWith('/');
  const close = () => setMenu(null);
  return (
    <div ref={root} role="tree" aria-label="Files" onKeyDown={onKeyDown} className={cx('flex min-h-0 flex-col overflow-y-auto overscroll-contain px-1.5 py-1.5', className)}>
      <div {...dropZone('')} className={cx('rounded-md', drop === '' && 'bg-accent/10 outline-1 -outline-offset-1 outline-accent/60')}>
        <button
          type="button"
          role="treeitem"
          aria-level={1}
          aria-selected={current === TEX_MAIN}
          data-row
          data-name={TEX_MAIN}
          onClick={() => actions.onOpen(TEX_MAIN)}
          title="The main file: the one LaTeX typesets"
          style={{ paddingLeft: 23 }}
          translate="no"
          className={rowCls(current === TEX_MAIN, false)}
        >
          <span className={cx('shrink-0', current === TEX_MAIN ? 'text-accent' : 'text-fg-2')}>
            <FileText size={14} />
          </span>
          <span className="min-w-0 truncate font-medium">{main}</span>
          <span className="ml-auto shrink-0 rounded bg-bg-2 px-1 text-[10.5px] leading-4 font-normal text-fg-3">main</span>
        </button>
        {nodes(used, 0, false)}
      </div>
      {unused.length > 0 && (
        <>
          <div className="px-2 pt-3 pb-1 text-[11.5px] font-medium text-fg-3" title="Files the document does not read. They stay in it, and are not typeset.">
            Not used
          </div>
          {nodes(unused, 0, true)}
        </>
      )}
      <Popover anchor={anchor} open={!!menu} onClose={close} align="end" width={240} title={<span translate="no">{menuFor.replace(/\/$/, '').split('/').pop()}</span>}>
        {isFolder && (
          <>
            <NewItems folder={menuFor} onNew={actions.onNew} close={close} />
            <MenuSep />
          </>
        )}
        <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), actions.onRename(menuFor))}>
          Rename
        </MenuItem>
        <MenuItem icon={<Trash2 size={14} />} danger onClick={() => (close(), actions.onDelete(menuFor))}>
          Delete
        </MenuItem>
      </Popover>
    </div>
  );
}

/**
 * A picture or a file of the folder, in the source's place: the picture as large as fits (a PDF in the browser's
 * viewer), a style, class or data file's text to read; its path, its size, where the document uses it (a click goes
 * there), and for a picture the document keeps, Insert as a figure, Copy its name, Rename and Remove.
 */
export function FileView({
  entry,
  url,
  textPath,
  usedAt,
  label,
  readOnly,
  onGo,
  onInsert,
  onRename,
  onRemove,
}: {
  entry: TreeEntry;
  /** Where the picture (or the PDF) is. */
  url?: string;
  /** A text file of the folder: its path on this computer, to read. */
  textPath?: string;
  usedAt: TexUse | null | undefined;
  label: (file: string) => string;
  readOnly: boolean;
  onGo: (file: string, line: number) => void;
  onInsert?: () => void;
  onRename?: () => void;
  onRemove?: () => void;
}) {
  const [text, setText] = useState<string | null | undefined>(undefined);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setText(undefined);
    setDims(null);
    if (!textPath) return;
    let alive = true;
    api<{ content: string | null; binary?: boolean; tooLarge?: boolean }>(`/api/fs/read?path=${encodeURIComponent(textPath)}`).then(
      (r) => alive && setText(r.content),
      () => alive && setText(null),
    );
    return () => {
      alive = false;
    };
  }, [textPath]);
  const picture = entry.kind === 'picture';
  const pdf = /\.pdf$/i.test(entry.name);
  const shown = picture && url && !/\.(eps|ps)$/i.test(entry.name);
  const copy = () =>
    void navigator.clipboard?.writeText(entry.name).then(
      () => toast('Name copied', 'ok'),
      () => toast(entry.name),
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-1.5 text-[12.5px]">
        <span className="shrink-0 text-fg-3">{kindIcon(entry.kind)}</span>
        <span translate="no" className="min-w-0 truncate font-mono text-[12px] text-fg">
          {entry.name}
        </span>
        <span className="text-fg-3">
          {[dims ? `${dims.w} × ${dims.h}` : null, entry.size !== undefined ? bytes(entry.size) : null, entry.where === 'folder' ? 'in the folder, typeset as it is' : null].filter(Boolean).join(' · ')}
        </span>
        <span className="flex-1" />
        {usedAt ? (
          <Button size="sm" variant="ghost" icon={<LocateFixed size={13} />} className="h-7 px-2 text-[12px]" onClick={() => onGo(usedAt.file, usedAt.line)}>
            <span translate="no">{`${label(usedAt.file)}:${usedAt.line}`}</span>
          </Button>
        ) : (
          !entry.used && <span className="text-fg-3">Not used</span>
        )}
        {entry.where === 'picture' && (
          <span className="flex items-center gap-0.5">
            {!readOnly && onInsert && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={onInsert}>
                Insert as a figure
              </Button>
            )}
            <IconButton label="Copy its name" size="sm" onClick={copy}>
              <Copy size={13} />
            </IconButton>
            {!readOnly && onRename && (
              <IconButton label="Rename" size="sm" onClick={onRename}>
                <Pencil size={13} />
              </IconButton>
            )}
            {!readOnly && onRemove && (
              <IconButton label="Remove" size="sm" onClick={onRemove}>
                <Trash2 size={13} />
              </IconButton>
            )}
          </span>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-bg-1 p-4">
        {picture ? (
          pdf && url ? (
            <iframe src={url} title={entry.name} className="h-full w-full rounded-lg border border-line bg-white" />
          ) : shown ? (
            <img
              src={url}
              alt=""
              onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              className="max-h-full max-w-full rounded-lg border border-line bg-[repeating-conic-gradient(var(--bg-2)_0%_25%,var(--bg)_0%_50%)] [background-size:16px_16px] object-contain"
            />
          ) : (
            <p className="max-w-sm text-center text-[13px] leading-relaxed text-fg-3">This picture cannot be shown here; LaTeX typesets it from the folder as it is.</p>
          )
        ) : text === undefined ? (
          <Throbber size={24} />
        ) : text === null ? (
          <p className="max-w-sm text-center text-[13px] leading-relaxed text-fg-3">This file cannot be shown here; LaTeX reads it from the folder as it is.</p>
        ) : (
          <pre translate="no" className="h-full w-full self-start overflow-auto font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-fg-2">
            {text}
          </pre>
        )}
      </div>
    </div>
  );
}
