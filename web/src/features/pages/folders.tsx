// The Library's folders (server/pages/folders.ts): a place's folders as tiles before its things, each with how many
// things are in it; the way back from a folder (Thesis › Chapter drafts); a folder's ⋯ (Rename, Move to a folder, Move
// to a project, Delete); a short picker of a place's folders as a tree (More → Move to a folder); on a computer, things
// and folders dragged onto a folder or onto the way back; a name for a new folder; and a folder of this computer brought
// in (New → Import a folder): a LaTeX project as one document, any other as a folder of the Library with its documents.
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { Check, ChevronRight, Ellipsis, Folder, FolderInput, FolderOpen, FolderTree, Layers, LibraryBig, Pencil, Search, Trash2 } from 'lucide-react';
import type { FolderImport, FolderSkip, LibFolder } from '@shared/pages';
import type { MediaItem } from '@shared/media';
import type { SpaceView } from '@shared/spaces';
import { del, enc, patch, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { FolderPicker } from '../../components/FolderPicker';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuLabel, MenuSep, Popover, Throbber, useConfirm } from '../../components/ui';
import { useMedia } from '../media/state';
import { SpaceMark } from '../spaces/parts';
import { SpaceMenu, SpaceSelect } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';

/** Something of the Library that can go in a folder: a page (of any kind), a picture, video or sound, or a folder. */
export interface Placed {
  kind: 'page' | 'media' | 'folder';
  id: string;
}

const DRAG = 'application/x-hydor-library';
/** Things are dragged onto folders with a mouse; on a touch screen, More → Move to a folder does it. */
export const CAN_DRAG = typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches;

export function dragThing(e: DragEvent, t: Placed) {
  e.dataTransfer.setData(DRAG, JSON.stringify(t));
  e.dataTransfer.effectAllowed = 'move';
}

/** The folders of a place (a project's id, or null for none), and each one's folders. */
export function placeFolders(folders: LibFolder[] | null, space: string | null): LibFolder[] {
  return (folders ?? []).filter((f) => (f.space ?? null) === space);
}

/** A folder's path from its place's top: its folders, the top first, it last. */
export function folderChain(folders: LibFolder[] | null, id: string | null): LibFolder[] {
  const by = new Map((folders ?? []).map((f) => [f.id, f]));
  const out: LibFolder[] = [];
  for (let f = id ? by.get(id) : undefined; f && out.length < 50; f = f.parent ? by.get(f.parent) : undefined) out.unshift(f);
  return out;
}

const byName = (a: LibFolder, b: LibFolder) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** The name of a place's top, as the way back starts with it: a project's, "Not in a project", or "Everything" with no projects. */
export const placeTopName = (space: string | null, spaces: SpaceView[] | null) => (space ? (spaces?.find((s) => s.id === space)?.name ?? 'Project') : spaces?.length ? 'Not in a project' : 'Everything');

/** A place's folders as a tree, in order (each with how deep it is: 0 at the top). */
function asTree(list: LibFolder[]): { f: LibFolder; depth: number }[] {
  const out: { f: LibFolder; depth: number }[] = [];
  const ids = new Set(list.map((f) => f.id));
  const walk = (parent: string | null, depth: number) => {
    for (const f of list.filter((x) => (x.parent && ids.has(x.parent) ? x.parent : null) === parent).sort(byName)) {
      out.push({ f, depth });
      walk(f.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Something put in a folder (or, null, at its place's top), saying where it went. */
export async function moveToFolder(t: Placed, folder: LibFolder | null, topName: string) {
  try {
    if (t.kind === 'folder') await patch(`/api/pages/folders/${enc(t.id)}`, { parent: folder?.id ?? null });
    else if (t.kind === 'page') await patch(`/api/pages/${enc(t.id)}`, { folder: folder?.id ?? null });
    else {
      const r = await patch<{ item: MediaItem }>(`/api/media/${enc(t.id)}`, { folder: folder?.id ?? null });
      useMedia.getState().put(r.item);
    }
    toast(tr(`Moved to ${folder?.name ?? topName}`), 'ok');
  } catch (e) {
    toastError(e);
  }
}

/** A folder (or, null, a place's top) that things dragged onto it go into: what to spread on it, and whether one is over it. */
export function useDropInto(folder: LibFolder | null, topName: string): { over: boolean; props: Record<string, (e: DragEvent) => void> } {
  const [over, setOver] = useState(false);
  if (!CAN_DRAG) return { over: false, props: {} };
  return {
    over,
    props: {
      onDragOver: (e) => {
        if (!e.dataTransfer.types.includes(DRAG)) return;
        e.preventDefault();
        setOver(true);
      },
      onDragLeave: (e) => {
        if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e) => {
        setOver(false);
        const raw = e.dataTransfer.getData(DRAG);
        if (!raw) return;
        e.preventDefault();
        const t = JSON.parse(raw) as Placed;
        if (t.kind === 'folder' && t.id === folder?.id) return;
        void moveToFolder(t, folder, topName);
      },
    },
  };
}

/**
 * The picker of a place's folders: its top (by the place's name), then its folders as a tree. `value`: where the thing
 * is now; `moving`: a folder being moved (it and its folders are no place for it). A box finds one by name past ten.
 */
export function FolderMenu({
  anchor,
  open,
  onClose,
  folders,
  value,
  moving,
  topName,
  onPick,
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  folders: LibFolder[];
  value: string | null;
  moving?: string;
  topName: string;
  onPick: (folder: LibFolder | null) => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => {
    if (open) setQ('');
  }, [open]);
  const rows = useMemo(() => {
    const tree = asTree(folders);
    // A folder being moved, and the folders in it: not where it can go.
    const out = new Set<string>(moving ? [moving] : []);
    for (const { f } of tree) if (f.parent && out.has(f.parent)) out.add(f.id);
    const low = q.trim().toLowerCase();
    return tree.filter(({ f }) => !out.has(f.id) && (!low || f.name.toLowerCase().includes(low)));
  }, [folders, moving, q]);
  const many = folders.length > 10;
  const pick = (f: LibFolder | null) => {
    onClose();
    if ((f?.id ?? null) !== value) onPick(f);
  };
  const row = (key: string, on: boolean, depth: number, icon: ReactNode, name: ReactNode, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} className="flex h-8.5 w-full items-center gap-2 rounded-lg pr-2.5 text-left text-[13.5px] text-fg transition-colors hover:bg-bg-2" style={{ paddingLeft: 10 + depth * 14 }}>
      <span className="flex w-4 shrink-0 justify-center text-fg-3">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {on && <Check size={14} className="shrink-0 text-fg" strokeWidth={2.5} />}
    </button>
  );
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="end" width={270} title="Move it to">
      <MenuLabel>Move it to</MenuLabel>
      {many && (
        <label className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-lg bg-bg-2 px-2.5">
          <Search size={13} className="shrink-0 text-fg-3" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a folder" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
        </label>
      )}
      <div className={cx(many && 'max-h-[280px] overflow-y-auto')}>
        {!q.trim() && row('top', value === null, 0, <Layers size={14} />, <span translate="no">{topName}</span>, () => pick(null))}
        {rows.map(({ f, depth }) => row(f.id, value === f.id, q.trim() ? 0 : depth, <Folder size={14} />, <span translate="no">{f.name}</span>, () => pick(f)))}
        {!rows.length && q.trim() && <div className="px-3 py-2 text-[12.5px] text-fg-3">No folder’s name has that in it</div>}
      </div>
    </Popover>
  );
}

/** A name for a folder, in a dialog: a new one's, or a new name for one. */
export function FolderNameDialog({ open, onClose, title, initial, confirm, onDone }: { open: boolean; onClose: () => void; title: string; initial: string; confirm: string; onDone: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const done = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onDone(name.trim());
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !name.trim()} onClick={() => void done()}>
            {confirm}
          </Button>
        </>
      }
    >
      <input autoFocus value={name} maxLength={80} placeholder="Its name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void done()} className={inputCls} />
    </Dialog>
  );
}

/** A folder as a tile among a place's things: its name, how many things are in it, ⋯. A click opens it. */
export function FolderTile({ folder, count, folders, topName, onOpen }: { folder: LibFolder; count: number; folders: LibFolder[]; topName: string; onOpen: () => void }) {
  const spaces = useSpaces();
  const [menu, setMenu] = useState<'more' | 'move' | 'project' | 'rename' | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const drop = useDropInto(folder, topName);
  const close = () => setMenu(null);
  const remove = async () => {
    close();
    const ok = await confirm({
      title: tr(`Delete the folder “${folder.name}”?`),
      body: count ? 'What is in it goes up a level, out of the folder. Nothing in it is deleted.' : 'It is empty.',
      confirm: 'Delete',
      danger: true,
    });
    if (ok) del(`/api/pages/folders/${enc(folder.id)}`).catch(toastError);
  };
  const toProject = async (space: string | null) => {
    try {
      await patch(`/api/pages/folders/${enc(folder.id)}`, { space });
      const name = spaces?.find((s) => s.id === space)?.name;
      toast(name ? tr(`Moved to ${name}, with what is in it`) : 'Moved out of its project, with what is in it', 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div
      draggable={CAN_DRAG}
      onDragStart={(e) => dragThing(e, { kind: 'folder', id: folder.id })}
      {...drop.props}
      className={cx(
        'group flex h-13 min-w-0 items-center gap-1 rounded-xl border bg-panel pr-1 transition-colors',
        drop.over ? 'border-accent/70 bg-accent/10' : 'border-line hover:border-line-2',
      )}
    >
      <button type="button" onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 text-left">
        <Folder size={18} className="shrink-0 text-fg-3" />
        <span className="min-w-0">
          <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {folder.name}
          </span>
          <span className="block text-[12px] leading-4 text-fg-3">{count === 0 ? 'Empty' : count === 1 ? '1 thing' : tr(`${count} things`)}</span>
        </span>
      </button>
      <IconButton ref={anchor} label="More" size="sm" onClick={() => setMenu((m) => (m ? null : 'more'))} active={!!menu}>
        <Ellipsis size={15} />
      </IconButton>
      <Popover anchor={anchor} open={menu === 'more'} onClose={close} align="end" width={230}>
        <MenuItem icon={<Pencil size={14} />} onClick={() => setMenu('rename')}>
          Rename
        </MenuItem>
        <MenuItem icon={<FolderTree size={14} />} onClick={() => setMenu('move')}>
          Move to a folder
        </MenuItem>
        {!!spaces?.length && (
          <MenuItem icon={<FolderInput size={14} />} onClick={() => setMenu('project')}>
            Move to a project
          </MenuItem>
        )}
        <MenuSep />
        <MenuItem icon={<Trash2 size={14} />} danger onClick={() => void remove()}>
          Delete
        </MenuItem>
      </Popover>
      <FolderMenu
        anchor={anchor}
        open={menu === 'move'}
        onClose={close}
        folders={folders}
        value={folder.parent ?? null}
        moving={folder.id}
        topName={topName}
        onPick={(f) => void moveToFolder({ kind: 'folder', id: folder.id }, f, topName)}
      />
      <SpaceMenu anchor={anchor} open={menu === 'project'} onClose={close} title="Move it to" value={folder.space ?? null} onPick={(s) => s !== (folder.space ?? null) && void toProject(s)} />
      <FolderNameDialog
        open={menu === 'rename'}
        onClose={close}
        title="Rename the folder"
        initial={folder.name}
        confirm="Rename"
        onDone={async (name) => {
          await patch(`/api/pages/folders/${enc(folder.id)}`, { name });
        }}
      />
      {confirmNode}
    </div>
  );
}

/** One step of the way back: a place's top or a folder, which things dragged onto it go into. */
function Crumb({ folder, topName, onGo, last, children }: { folder: LibFolder | null; topName: string; onGo: () => void; last: boolean; children: ReactNode }) {
  const drop = useDropInto(folder, topName);
  if (last)
    return (
      <span translate="no" className="min-w-0 truncate font-semibold text-fg">
        {children}
      </span>
    );
  return (
    <button
      type="button"
      onClick={onGo}
      {...drop.props}
      className={cx('flex min-w-0 shrink items-center gap-2 truncate rounded-md px-1 text-fg-3 transition-colors hover:text-fg', drop.over && 'bg-accent/15 text-fg outline-1 outline-accent/60')}
    >
      {children}
    </button>
  );
}

/** The way back from a folder: the place, then each folder to the one open (Thesis › Chapter drafts). */
export function FolderCrumbs({ chain, space, topName, onGo }: { chain: LibFolder[]; space: SpaceView | null; topName: string; onGo: (folder: string | null) => void }) {
  return (
    // A line of its own where the find box would squeeze it (a phone, a narrow window).
    <nav aria-label="Folders" className="flex min-w-0 items-center gap-0.5 text-[17px] tracking-tight max-lg:w-full max-lg:text-[15px]">
      <Crumb folder={null} topName={topName} onGo={() => onGo(null)} last={false}>
        {space ? <SpaceMark s={space} size={20} className="rounded-md" /> : <LibraryBig size={17} className="shrink-0" />}
        <span translate={space ? 'no' : undefined} className="truncate">
          {topName}
        </span>
      </Crumb>
      {chain.map((f, i) => (
        <span key={f.id} className="flex min-w-0 items-center gap-0.5">
          <ChevronRight size={15} className="shrink-0 text-fg-3" />
          <Crumb folder={f} topName={topName} onGo={() => onGo(f.id)} last={i === chain.length - 1}>
            <span translate="no" className="truncate">
              {f.name}
            </span>
          </Crumb>
        </span>
      ))}
    </nav>
  );
}

/** Words for what was left out of a folder brought in, by why: "12 pictures, 2 PDFs". */
const SKIPPED: Record<FolderSkip, (n: number) => string> = {
  picture: (n) => (n === 1 ? '1 picture' : tr(`${n} pictures`)),
  video: (n) => (n === 1 ? '1 video' : tr(`${n} videos`)),
  audio: (n) => (n === 1 ? '1 sound' : tr(`${n} sounds`)),
  pdf: (n) => (n === 1 ? '1 PDF' : tr(`${n} PDFs`)),
  slides: (n) => (n === 1 ? '1 presentation' : tr(`${n} presentations`)),
  part: (n) => (n === 1 ? '1 part of a LaTeX document' : tr(`${n} parts of LaTeX documents`)),
  large: (n) => (n === 1 ? '1 file over 30 MB' : tr(`${n} files over 30 MB`)),
  unreadable: (n) => (n === 1 ? '1 file that could not be read' : tr(`${n} files that could not be read`)),
  kind: (n) => (n === 1 ? '1 file of another kind' : tr(`${n} files of other kinds`)),
  limit: (n) => (n === 1 ? '1 past what one import brings in' : tr(`${n} past what one import brings in`)),
};

/**
 * New → Import a folder: a folder of this computer (the app's own folder picker), brought into the place and folder the
 * Library shows (or the project picked). Then what came in, what was left out and why, and Open it.
 */
export function ImportFolderDialog({ open, onClose, space, folder, folderName }: { open: boolean; onClose: () => void; space: string | null; folder: string | null; folderName?: string }) {
  const spaces = useSpaces();
  const [path, setPath] = useState('');
  const [where, setWhere] = useState<string | null>(space);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<FolderImport | null>(null);
  const [details, setDetails] = useState(false);
  useEffect(() => {
    if (!open) return;
    // From the home folder: its folders are the ones offered first.
    setPath('~/');
    setWhere(space);
    setDone(null);
    setDetails(false);
  }, [open, space]);
  // A folder of its own: not the whole home folder, nor the computer's root.
  const picked = !/^(~|\/|~\/|[A-Za-z]:[\\/]?)$/.test(path.trim());
  const submit = async () => {
    if (!path.trim() || !picked || busy) return;
    setBusy(true);
    try {
      // Into the folder open, unless another project was picked.
      setDone(await post<FolderImport>('/api/pages/import-folder', { path: path.trim(), space: where, folder: folder && where === space ? folder : undefined }));
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const counts = new Map<FolderSkip, number>();
  for (const s of done?.skipped ?? []) counts.set(s.why, (counts.get(s.why) ?? 0) + 1);
  const n = done?.pages.length ?? 0;
  const openIt = () => {
    onClose();
    if (!done) return;
    if (done.folder) go(`/library?${new URLSearchParams({ ...(done.folder.space ? { project: done.folder.space } : spaces?.length ? { project: 'none' } : {}), folder: done.folder.id })}`);
    else if (done.pages[0]) go(`/pages/${done.pages[0].id}`);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import a folder"
      width={520}
      footer={
        done ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            {n > 0 && (
              <Button variant="primary" onClick={openIt}>
                Open it
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" icon={busy ? <Throbber className="h-3.5 w-3.5" /> : <FolderOpen size={14} />} disabled={busy || !path.trim() || !picked} onClick={() => void submit()}>
              {busy ? 'Importing…' : 'Import'}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3 text-[13.5px] leading-relaxed">
          <p className="text-fg">
            {n === 0
              ? 'Nothing in it could come into the Library.'
              : done.folder
                ? tr(`Brought in ${n === 1 ? '1 thing' : `${n} things`}, in the folder “${done.folder.name}”.`)
                : done.pages.length === 1 && done.pages[0].kind === 'tex'
                  ? tr(`It is a LaTeX project: it came in as one LaTeX document, “${done.pages[0].title}”, its files in their folders.`)
                  : tr(`Brought in ${n === 1 ? '1 thing' : `${n} things`}.`)}
          </p>
          {counts.size > 0 && (
            <div className="rounded-xl border border-line bg-bg-1 px-3 py-2.5 text-[12.5px] text-fg-2">
              <span className="font-medium text-fg">Left out: </span>
              {[...counts].map(([why, k]) => SKIPPED[why](k)).join(', ')}.
              <span className="block text-fg-3">The Library takes in documents, spreadsheets, notebooks and whole LaTeX documents; the rest stays in the folder, to open in Files.</span>
              <button type="button" onClick={() => setDetails((x) => !x)} className="mt-1 font-medium text-accent hover:underline">
                {details ? 'Hide the list' : 'Show the list'}
              </button>
              {details && (
                <ul translate="no" className="mt-1.5 max-h-48 overflow-y-auto font-mono text-[11.5px] text-fg-3">
                  {done.skipped.map((s) => (
                    <li key={s.path} className="truncate">
                      {s.path}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {done.notes.length > 0 && (
            <ul className="space-y-1 text-[12.5px] text-fg-3">
              {done.notes.slice(0, 12).map((x) => (
                <li key={x}>{x}</li>
              ))}
              {done.notes.length > 12 && <li>{tr(`And ${done.notes.length - 12} more.`)}</li>}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-3.5 text-[13.5px]">
          <p className="text-[12.5px] leading-relaxed text-fg-3">
            A LaTeX project (a folder with a whole document in it) comes in as one LaTeX document, its files and pictures in their folders. Any other folder comes in as a folder of the Library, with its documents, spreadsheets,
            notebooks and LaTeX documents, and its folders.
          </p>
          <label className="block space-y-1.5">
            <span className="text-[12.5px] font-medium text-fg-2">The folder, on this computer</span>
            <FolderPicker value={path} onChange={setPath} onPick={(p) => setPath(p)} />
          </label>
          {folder && where === space ? (
            <p className="text-[12.5px] text-fg-3">
              Into the folder <span translate="no" className="font-medium text-fg-2">{folderName}</span>
            </p>
          ) : (
            !!spaces?.length && (
              <div className="space-y-1.5">
                <span className="block text-[12.5px] font-medium text-fg-2">In a project</span>
                <SpaceSelect value={where} onChange={setWhere} className="w-full" />
              </div>
            )
          )}
        </div>
      )}
    </Dialog>
  );
}
