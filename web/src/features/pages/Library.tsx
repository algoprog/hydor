// The Library (/library): everything kept, by space. Pages and small tools, slide decks, documents, spreadsheets
// LaTeX documents and Jupyter notebooks (agents' and yours), and the pictures, videos and sounds you kept, each in the space it was made in
// (an agent's save goes in its session's space; you pick when you keep something yourself) or in none. On a wide
// screen the places are a list beside it: Everything (each space's things together, under its name), each space,
// Not in a space, and Published (the sites published from pages or a project's build); on a phone, a row of chips.
// Kinds filter what a place shows, a box finds things by name, and each card's More moves it to another space, or
// turns it into another kind (slides from a document, a page from a spreadsheet…): an agent makes that from it, in its
// project and folder, and it stays as it is.
// Files dropped anywhere on it (folders too) are added as what they are (uploads.ts): onto a project in the list of
// places, into that project; elsewhere, into the place open (none on Everything); a line says where while they are
// dragged. Upload files, beside a project's name (and in New), picks them on a device without a mouse.
// A place (a project, or none) holds folders too (folders.tsx): its folders show first, as tiles, then its things; a
// folder opens with the way back over it, and things go in folders by More → Move to a folder or, on a computer, by
// dragging them onto one. Finding by name and the kind chips look through the whole place and say where each thing is.
// Addresses: /library?project=<id>|none, &folder=<id>, &kind=<kind> (image, video and audio each, media pictures and
// videos both: the old Media tab's ?tab=media too), ?tab=published; ?new=page|design|slides|doc|sheet|tex|notebook|diagram opens New
// with that kind, ?new=folder New → Folder and ?new=import New → Import a folder.
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { useSearch } from 'wouter';
import {
  AppWindow,
  ArrowDownUp,
  AudioLines,
  ArrowRight,
  Boxes,
  Copy,
  Database,
  Download,
  Ellipsis,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  FolderTree,
  Globe,
  ImageIcon,
  Layers,
  LibraryBig,
  MessageSquarePlus,
  NotebookText,
  Palette,
  Workflow,
  PenLine,
  Pencil,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Sheet,
  Sigma,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { TURN_INTO, type TurnTo } from '@shared/content-asks';
import type { MediaItem } from '@shared/media';
import type { LibFolder, PageInfo, SiteInfo } from '@shared/pages';
import type { SpaceView } from '@shared/spaces';
import { openShare, useSharedThings } from '../spaces/ShareHost';
import { api, del, enc, patch, post } from '../../lib/api';
import { ago, bytes } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { Button, cx, Empty, IconButton, MenuBack, MenuItem, MenuLabel, MenuSep, Popover, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { downloadMedia, recaption, SoundTile, startSessionWithMedia, Still } from '../media/parts';
import { useMedia } from '../media/state';
import { useAskRun } from '../guide/ask';
import { SpaceMark } from '../spaces/parts';
import { SpaceMenu } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { preloadEditors } from './editors';
import { exportFile, type ExportFormat } from './exportFile';
import { EXPORTS } from './exports';
import { NewPageDialog, PublishDialog, RenameDialog, SiteRow, Thumb, type NewKind } from './parts';
import { CAN_DRAG, dragThing, FolderCrumbs, folderChain, FolderMenu, FolderNameDialog, FolderTile, ImportFolderDialog, moveToFolder, placeFolders, placeTopName } from './folders';
import { usePagesStore } from './state';
import { turnRequest } from './types/requests';
import { startMaking } from './types/start';
import { addToLibrary, dragsFiles, droppedFiles, dropMoves, pickFiles } from './uploads';
import { DropHint } from './UploadTray';

// ---- what the Library holds ----------------------------------------------------------------------------

type ItemKind = 'page' | 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook' | 'diagram' | 'image' | 'video' | 'audio';
/** What a place shows: everything, one kind, or pictures and videos together. */
type Show = 'all' | 'page' | 'slides' | 'doc' | 'sheet' | 'tex' | 'notebook' | 'diagram' | 'image' | 'video' | 'audio' | 'media';

interface Item {
  key: string;
  kind: ItemKind;
  title: string;
  space?: string;
  /** The Library folder it is in (of its space); none at its place's top. */
  folder?: string;
  /** When it last changed (a picture: when it was kept). */
  at: number;
  made: number;
  page?: PageInfo;
  media?: MediaItem;
}

const KIND: Record<ItemKind, { label: string; icon: ReactNode }> = {
  page: { label: 'Page', icon: <AppWindow size={12} /> },
  slides: { label: 'Slides', icon: <Presentation size={12} /> },
  doc: { label: 'Document', icon: <FileText size={12} /> },
  sheet: { label: 'Spreadsheet', icon: <Sheet size={12} /> },
  tex: { label: 'LaTeX', icon: <Sigma size={12} /> },
  notebook: { label: 'Notebook', icon: <NotebookText size={12} /> },
  diagram: { label: 'Diagram', icon: <Workflow size={12} /> },
  image: { label: 'Picture', icon: <ImageIcon size={12} /> },
  video: { label: 'Video', icon: <Play size={12} /> },
  audio: { label: 'Audio', icon: <AudioLines size={12} /> },
};

const SHOWS: { value: Show; label: string; has: (k: ItemKind) => boolean }[] = [
  { value: 'all', label: 'All', has: () => true },
  { value: 'page', label: 'Pages', has: (k) => k === 'page' },
  { value: 'slides', label: 'Slides', has: (k) => k === 'slides' },
  { value: 'doc', label: 'Documents', has: (k) => k === 'doc' },
  { value: 'sheet', label: 'Spreadsheets', has: (k) => k === 'sheet' },
  { value: 'tex', label: 'LaTeX', has: (k) => k === 'tex' },
  { value: 'notebook', label: 'Notebooks', has: (k) => k === 'notebook' },
  { value: 'diagram', label: 'Diagrams', has: (k) => k === 'diagram' },
  { value: 'image', label: 'Pictures', has: (k) => k === 'image' },
  { value: 'video', label: 'Videos', has: (k) => k === 'video' },
  { value: 'audio', label: 'Audio', has: (k) => k === 'audio' },
];
/** Pictures and videos together: the old Media tab's address (and an older link's), with no chip of its own. */
const BOTH: (typeof SHOWS)[number] = { value: 'media', label: 'Pictures and videos', has: (k) => k === 'image' || k === 'video' };
const showOf = (v: Show) => SHOWS.find((s) => s.value === v) ?? BOTH;

type Sort = 'changed' | 'name' | 'made';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'changed', label: 'Last changed' },
  { value: 'name', label: 'Name' },
  { value: 'made', label: 'Newest made' },
];

const fromPage = (p: PageInfo): Item => ({ key: `p:${p.id}`, kind: p.kind ?? 'page', title: p.title, space: p.space, folder: p.folder, at: p.updatedAt, made: p.createdAt, page: p });
const fromMedia = (m: MediaItem): Item => ({ key: `m:${m.id}`, kind: m.kind, title: m.title, space: m.space, folder: m.folder, at: m.updatedAt, made: m.createdAt, media: m });

/** Everything kept, the last changed first; with the spaces as they are now (a space deleted: in none) and the folders (one gone: at the top). */
function useItems(): Item[] | null {
  const pages = usePagesStore((s) => s.pages);
  const folders = usePagesStore((s) => s.folders);
  const media = useMedia((s) => s.items);
  const spaces = useSpaces();
  return useMemo(() => {
    if (!pages) return null;
    const known = new Set((spaces ?? []).map((s) => s.id));
    const dirs = new Set((folders ?? []).map((f) => f.id));
    const all = [...pages.map(fromPage), ...(media ?? []).map(fromMedia)].map((it) => {
      const x = it.space && spaces && !known.has(it.space) ? { ...it, space: undefined } : it;
      return x.folder && folders && !dirs.has(x.folder) ? { ...x, folder: undefined } : x;
    });
    return all.sort((a, b) => b.at - a.at);
  }, [pages, folders, media, spaces]);
}

/**
 * What the Library's search finds for the words (GET /api/library/search): its items' keys, best first, by their titles
 * and descriptions, by words and by meaning. Asked a moment after the words change, and again when the Library does;
 * when meaning's model was starting, once more a few seconds later, to find by meaning too. Null until it answers.
 */
function useLibrarySearch(q: string, version: string): { q: string; keys: string[] } | null {
  const [found, setFound] = useState<{ q: string; keys: string[] } | null>(null);
  useEffect(() => {
    if (!q) {
      setFound(null);
      return;
    }
    let gone = false;
    let again: ReturnType<typeof setTimeout> | undefined;
    const ask = (retry: boolean) =>
      api<{ hits: { id: string }[]; starting?: boolean }>(`/api/library/search?q=${enc(q)}&limit=200`)
        .then((r) => {
          if (gone) return;
          setFound({ q, keys: r.hits.map((h) => h.id.replace(/^page:/, 'p:').replace(/^media:/, 'm:')) });
          if (r.starting && retry) again = setTimeout(() => void ask(false), 3000);
        })
        .catch(() => {});
    const t = setTimeout(() => void ask(true), 200);
    return () => {
      gone = true;
      clearTimeout(t);
      clearTimeout(again);
    };
  }, [q, version]);
  return found;
}

function sorted(list: Item[], sort: Sort): Item[] {
  if (sort === 'name') return [...list].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'made') return [...list].sort((a, b) => b.made - a.made);
  return list;
}

/** What "Turn it into" offers, by what an agent makes. */
const TURN: Record<TurnTo, { label: string; icon: ReactNode }> = {
  slides: { label: 'Slides', icon: <Presentation size={14} /> },
  doc: { label: 'A document', icon: <FileText size={14} /> },
  page: { label: 'A page', icon: <AppWindow size={14} /> },
  diagram: { label: 'A diagram', icon: <Workflow size={14} /> },
};

/**
 * Turn it into, where the menu was (its first row goes back to it): a session starts at once to make the other kind
 * from it, its message "Turn “Bakery plan” into slides", its agent told the rest; in its project, what is made landing
 * there, in its folder. Mounted while open, so the cards do not each ask which agent would run it.
 */
function TurnMenu({ p, anchor, onClose, onBack }: { p: PageInfo; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void; onBack: () => void }) {
  const run = useAskRun();
  const folders = usePagesStore((s) => s.folders);
  const spaces = useSpaces();
  const turn = (to: TurnTo) => {
    onClose();
    const names = p.folder ? folderChain(folders, p.folder).map((f) => f.name) : [];
    const r = turnRequest({ from: p.kind ?? 'page', to, id: p.id, title: p.title, folder: names.join('/') || undefined });
    startMaking(run, { prompt: r.prompt, make: r.make, space: p.space ? spaces?.find((s) => s.id === p.space) : null });
  };
  return (
    <Popover anchor={anchor} open onClose={onClose} align="end" width={240}>
      <MenuBack onClick={onBack}>Turn it into</MenuBack>
      {TURN_INTO[p.kind ?? 'page'].map((to) => (
        <MenuItem key={to} icon={TURN[to].icon} onClick={() => turn(to)}>
          {TURN[to].label}
        </MenuItem>
      ))}
    </Popover>
  );
}

/** Moves an item to a space (or out of one), saying where it went. */
async function moveTo(it: Item, space: string | null, spaces: SpaceView[] | null) {
  try {
    if (it.page) await patch(`/api/pages/${enc(it.page.id)}`, { space });
    else if (it.media) {
      const r = await patch<{ item: MediaItem }>(`/api/media/${enc(it.media.id)}`, { space });
      useMedia.getState().put(r.item);
    }
    const name = spaces?.find((s) => s.id === space)?.name;
    toast(name ? tr(`Moved to ${name}`) : 'Moved out of its project', 'ok');
  } catch (e) {
    toastError(e);
  }
}

// ---- one thing kept ----------------------------------------------------------------------------------------

/** A card: its picture (with its kind), its name, its space when the list mixes them (and its folder), and More. */
function ItemCard({ it, showSpace, showFolder }: { it: Item; showSpace?: boolean; showFolder?: boolean }) {
  const spaces = useSpaces();
  const folders = usePagesStore((s) => s.folders);
  const [menu, setMenu] = useState(false);
  // What it can be turned into, shown where the menu was.
  const [turning, setTurning] = useState(false);
  const [moving, setMoving] = useState(false);
  const [filing, setFiling] = useState(false);
  // The folders of its place, for Move to a folder; the one it is in, to say where it is in a list of the whole place.
  const mine = placeFolders(folders, it.space ?? null);
  const inFolder = it.folder ? folders?.find((f) => f.id === it.folder) : undefined;
  const topName = placeTopName(it.space ?? null, spaces);
  const [rename, setRename] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const p = it.page;
  const m = it.media;
  const space = it.space ? spaces?.find((s) => s.id === it.space) : undefined;
  // Shared with people by links of their own: how many.
  const people = useSharedThings()(p ? 'page' : 'media', p ? p.id : m!.id);
  const open = (mode?: string) => (p ? go(`/pages/${p.id}${mode ? `?mode=${mode}` : ''}`) : m && go(`/media/${m.id}`));
  const close = () => setMenu(false);
  const remove = async () => {
    close();
    const ok = await confirm({
      title: tr(`Delete “${it.title}”?`),
      body: p ? 'Its versions, what it keeps and any published copy go with it.' : 'It goes from your Library. The file it was saved from, if it is still there, stays.',
      confirm: 'Delete',
      danger: true,
    });
    if (ok) del(p ? `/api/pages/${enc(p.id)}` : `/api/media/${enc(m!.id)}`).catch(toastError);
  };
  const duplicate = async () => {
    close();
    if (!p) return;
    try {
      const r = await post<{ page: PageInfo }>(`/api/pages/${enc(p.id)}/copy`);
      toast(tr(`Made “${r.page.title}”`), 'ok');
    } catch (e) {
      toastError(e);
    }
  };
  const download = async (format: ExportFormat) => {
    close();
    if (!p) return;
    try {
      await exportFile(p.id, format);
    } catch (e) {
      toastError(e);
    }
  };
  const sub = m?.caption === 'pending' ? 'Writing its title…' : tr(`Changed ${ago(it.at)}`);
  return (
    <div
      draggable={CAN_DRAG}
      onDragStart={(e) => dragThing(e, { kind: p ? 'page' : 'media', id: p ? p.id : m!.id })}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2"
    >
      {/* A sound's picture is its shape, with a button to play it where it is (beside the one that opens it, not in it). */}
      {m?.kind === 'audio' ? (
        <SoundTile m={m} onOpen={() => open()} className="aspect-[16/10] w-full border-b border-line" />
      ) : (
        <button type="button" onClick={() => open()} className="relative block text-left" aria-label={it.title}>
          {p ? <Thumb page={p} className="aspect-[16/10] w-full border-b border-line" /> : <Still m={m!} className="aspect-[16/10] w-full border-b border-line" />}
          {/* Its kind, on the picture: a page's is plain to see, the others are named. */}
          {it.kind !== 'page' && it.kind !== 'video' && (
            <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              {KIND[it.kind].icon}
              {KIND[it.kind].label}
            </span>
          )}
        </button>
      )}
      <div className="flex min-w-0 items-start gap-1 py-2 pr-1 pl-3">
        <button type="button" onClick={() => open()} className="min-w-0 flex-1 text-left">
          <span translate="no" title={(p ? p.description : m?.description) || undefined} className="block truncate text-[13.5px] leading-5 font-medium text-fg">
            {it.title}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] leading-4 text-fg-3">
            {showSpace && space && (
              <span className="flex min-w-0 shrink items-center gap-1">
                <SpaceMark s={space} size={12} />
                <span translate="no" className="truncate">
                  {space.name}
                </span>
                <span>·</span>
              </span>
            )}
            {showFolder && inFolder && (
              <span className="flex min-w-0 shrink items-center gap-1" title={folderChain(folders, inFolder.id).map((f) => f.name).join(' › ')}>
                <Folder size={11} className="shrink-0" />
                <span translate="no" className="truncate">
                  {inFolder.name}
                </span>
                <span>·</span>
              </span>
            )}
            <span className="shrink-0 truncate">{sub}</span>
            {people > 0 && <Users size={11} className="shrink-0 text-info" aria-label={tr(people === 1 ? 'Shared with 1 person' : `Shared with ${people} people`)} />}
            {p?.published && <Globe size={11} className="shrink-0 text-accent" aria-label="Published" />}
            {!!p?.storageBytes && <Database size={11} className="shrink-0" aria-label={tr(`Keeps ${bytes(p.storageBytes)}`)} />}
          </span>
        </button>
        <IconButton ref={anchor} label="More" size="sm" onClick={() => setMenu((x) => !x)} active={menu || moving || filing || turning}>
          <Ellipsis size={15} />
        </IconButton>
      </div>
      <Popover anchor={anchor} open={menu} onClose={close} align="end" width={240}>
        {p ? (
          <>
            {p.kind === 'slides' ? (
              <MenuItem icon={<Play size={14} />} onClick={() => (close(), go(`/pages/${p.id}?present=1`))}>
                Present
              </MenuItem>
            ) : (
              <MenuItem icon={<PenLine size={14} />} onClick={() => (close(), open('edit'))}>
                Edit
              </MenuItem>
            )}
            <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), setRename(true))}>
              Edit the title and description
            </MenuItem>
          </>
        ) : (
          <MenuItem icon={<MessageSquarePlus size={14} />} onClick={() => (close(), startSessionWithMedia(m!))}>
            Start a session with it
          </MenuItem>
        )}
        <MenuItem
          icon={<UserPlus size={14} />}
          hint={people ? tr(people === 1 ? '1 person' : `${people} people`) : undefined}
          onClick={() => (close(), openShare(p ? { kind: 'page', id: p.id, title: p.title, pageKind: p.kind } : { kind: 'media', id: m!.id, title: m!.title, mediaKind: m!.kind }))}
        >
          Share with people
        </MenuItem>
        {!!spaces?.length && (
          <MenuItem icon={<FolderInput size={14} />} onClick={() => (close(), setMoving(true))}>
            Move to a project
          </MenuItem>
        )}
        {mine.length > 0 && (
          <MenuItem icon={<FolderTree size={14} />} onClick={() => (close(), setFiling(true))}>
            Move to a folder
          </MenuItem>
        )}
        {p ? (
          <>
            <MenuItem icon={<Copy size={14} />} onClick={duplicate}>
              Duplicate
            </MenuItem>
            <MenuItem icon={<Sparkles size={14} />} submenu onClick={() => (close(), setTurning(true))}>
              Turn it into
            </MenuItem>
            <MenuSep />
            <MenuLabel>Download as</MenuLabel>
            {EXPORTS(p.kind).map((x) => (
              <MenuItem key={x.format} icon={x.icon} onClick={() => void download(x.format)}>
                {x.label}
              </MenuItem>
            ))}
          </>
        ) : (
          <>
            <MenuItem icon={<Download size={14} />} onClick={() => (close(), downloadMedia(m!))}>
              Download
            </MenuItem>
            <MenuItem icon={<RefreshCw size={14} />} onClick={() => (close(), void recaption(m!))}>
              Write its title and description again
            </MenuItem>
          </>
        )}
        <MenuSep />
        <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
          Delete
        </MenuItem>
      </Popover>
      {p && turning && <TurnMenu p={p} anchor={anchor} onClose={() => setTurning(false)} onBack={() => (setTurning(false), setMenu(true))} />}
      <SpaceMenu anchor={anchor} open={moving} onClose={() => setMoving(false)} title="Move it to" value={it.space ?? null} onPick={(s) => s !== (it.space ?? null) && void moveTo(it, s, spaces)} />
      <FolderMenu
        anchor={anchor}
        open={filing}
        onClose={() => setFiling(false)}
        folders={mine}
        value={inFolder?.id ?? null}
        topName={topName}
        onPick={(f) => void moveToFolder({ kind: p ? 'page' : 'media', id: p ? p.id : m!.id }, f, topName)}
      />
      {p && <RenameDialog page={p} open={rename} onClose={() => setRename(false)} />}
      {confirmNode}
    </div>
  );
}

const GRID = 'grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-3.5';

function Grid({ items, showSpace, showFolder }: { items: Item[]; showSpace?: boolean; showFolder?: boolean }) {
  return (
    <div className={GRID}>
      {items.map((it) => (
        <ItemCard key={it.key} it={it} showSpace={showSpace} showFolder={showFolder} />
      ))}
    </div>
  );
}

// ---- places ------------------------------------------------------------------------------------------------

/** Where the Library looks: everything, a space's things, those in none, or what was published. */
type Place = { kind: 'all' } | { kind: 'none' } | { kind: 'published' } | { kind: 'space'; id: string };

function placeOf(q: URLSearchParams): Place {
  if (q.get('tab') === 'published') return { kind: 'published' };
  const s = q.get('project');
  if (s === 'none') return { kind: 'none' };
  if (s) return { kind: 'space', id: s };
  return { kind: 'all' };
}

function addressOf(place: Place, show: Show, folder?: string | null): string {
  const q = new URLSearchParams();
  if (place.kind === 'published') q.set('tab', 'published');
  else {
    if (place.kind === 'none') q.set('project', 'none');
    if (place.kind === 'space') q.set('project', place.id);
    if (folder) q.set('folder', folder);
    if (show !== 'all') q.set('kind', show);
  }
  const s = q.toString();
  return `/library${s ? `?${s}` : ''}`;
}

const samePlace = (a: Place, b: Place) => a.kind === b.kind && (a.kind !== 'space' || a.id === (b as { id: string }).id);

/** Where files dropped on a place go: a project's id, or '' for none; and the place's own key while they are over it. */
type DropOn = { space: string; at: string; over: boolean };

/** One place in the list beside the Library (or a chip of the row over it, on a phone); files dropped on it go in its project. */
function PlaceButton({ on, icon, label, count, onClick, chip, mine, drop }: { on: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void; chip?: boolean; mine?: boolean; drop?: DropOn }) {
  const dropAttrs = drop ? { 'data-drop': drop.space, 'data-drop-at': drop.at } : {};
  if (chip)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        {...dropAttrs}
        className={cx(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-2 text-[13px] transition-colors',
          drop?.over ? 'border-accent bg-accent/15 text-fg' : on ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg',
        )}
      >
        {icon}
        <span translate={mine ? 'no' : undefined} className="max-w-[160px] truncate">
          {label}
        </span>
        {count !== undefined && <span className={cx('tnum text-[12px]', on ? 'text-bg/70' : 'text-fg-3')}>{count}</span>}
      </button>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? 'true' : undefined}
      {...dropAttrs}
      className={cx(
        'flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors',
        drop?.over ? 'bg-accent/15 text-fg outline-1 -outline-offset-1 outline-accent/70' : on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-1 hover:text-fg',
      )}
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <span translate={mine ? 'no' : undefined} className="min-w-0 flex-1 truncate">
        {label}
      </span>
      {count !== undefined && count > 0 && <span className="tnum text-[12px] text-fg-3">{count}</span>}
    </button>
  );
}

function Places({ place, onPlace, items, sites, chips, dropAt }: { place: Place; onPlace: (p: Place) => void; items: Item[]; sites: SiteInfo[] | null; chips?: boolean; dropAt?: string }) {
  const spaces = useSpaces() ?? [];
  const count = (id: string | null) => items.filter((it) => (it.space ?? null) === id).length;
  const none = count(null);
  // Files dropped on a project go in it; on Everything, Not in a project or Published, in none.
  const drop = (space: string, at: string): DropOn => ({ space, at, over: dropAt === at });
  const list = (
    <>
      <PlaceButton chip={chips} on={place.kind === 'all'} icon={<LibraryBig size={15} className={chips ? undefined : 'text-fg-3'} />} label="Everything" count={items.length} onClick={() => onPlace({ kind: 'all' })} drop={drop('', 'all')} />
      {spaces.length > 0 && !chips && <div className="px-2.5 pt-4 pb-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">Projects</div>}
      {spaces.map((s) => (
        <PlaceButton
          key={s.id}
          chip={chips}
          mine
          on={place.kind === 'space' && place.id === s.id}
          icon={<SpaceMark s={s} size={chips ? 16 : 18} />}
          label={s.name}
          count={count(s.id)}
          onClick={() => onPlace({ kind: 'space', id: s.id })}
          drop={drop(s.id, `space:${s.id}`)}
        />
      ))}
      {spaces.length > 0 && (none > 0 || place.kind === 'none') && (
        <PlaceButton chip={chips} on={place.kind === 'none'} icon={<Layers size={15} className={chips ? undefined : 'text-fg-3'} />} label="Not in a project" count={none} onClick={() => onPlace({ kind: 'none' })} drop={drop('', 'none')} />
      )}
      {!chips && <div className="mx-2.5 my-3 border-t border-line" />}
      <PlaceButton chip={chips} on={place.kind === 'published'} icon={<Globe size={15} className={chips ? undefined : 'text-fg-3'} />} label="Published" count={sites?.length ?? undefined} onClick={() => onPlace({ kind: 'published' })} drop={drop('', 'published')} />
    </>
  );
  if (chips) return <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden">{list}</div>;
  return (
    <nav aria-label="Places in the Library" className="space-y-0.5">
      {list}
      {!spaces.length && (
        <div className="mt-4 rounded-xl border border-dashed border-line-2 px-3 py-3 text-[12.5px] leading-snug text-fg-3">
          <span className="block font-medium text-fg-2">Sort it by project</span>
          Make a project for each piece of work, and what its sessions make lands together here.
          <button type="button" onClick={() => go('/projects')} className="mt-1.5 flex items-center gap-1 font-medium text-accent hover:underline">
            Projects <ArrowRight size={13} />
          </button>
        </div>
      )}
    </nav>
  );
}

// ---- the page ------------------------------------------------------------------------------------------------

/** How many of a space's things the Everything view shows before See all. */
const PER_SECTION = 8;

/** A space's things in Everything: its name and mark, how many, and See all. */
function SpaceSection({ space, items, onAll, showFolder }: { space: SpaceView | null; items: Item[]; onAll: () => void; showFolder?: boolean }) {
  const more = items.length > PER_SECTION;
  return (
    <section>
      <div className="mb-3 flex min-w-0 items-center gap-2.5">
        {space ? <SpaceMark s={space} size={22} className="rounded-md" /> : <Layers size={18} className="shrink-0 text-fg-3" />}
        <h2 translate={space ? 'no' : undefined} className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
          {space ? space.name : 'Not in a project'}
        </h2>
        <span className="tnum text-[13px] text-fg-3">{items.length}</span>
        <span className="flex-1" />
        {(more || space) && (
          <Button size="sm" variant="ghost" onClick={onAll} className="h-7 px-2 text-[12.5px]">
            {more ? tr(`See all ${items.length}`) : 'See all'}
            <ArrowRight size={13} className="ml-1" />
          </Button>
        )}
      </div>
      <Grid items={items.slice(0, PER_SECTION)} showFolder={showFolder} />
    </section>
  );
}

/** The published sites, with Publish a folder. */
function Published({ sites, onPublish }: { sites: SiteInfo[] | null; onPublish: () => void }) {
  if (!sites)
    return (
      <div className="flex justify-center py-10 text-fg-3">
        <Throbber size={28} />
      </div>
    );
  if (!sites.length)
    return (
      <Empty icon={<Globe size={22} />} title="Nothing published">
        <span className="block">Publish a saved page, or a project’s build (its dist/ folder), at a private or a public link. Agents can ask to publish too; nothing goes out until you confirm.</span>
        <span className="mt-3 inline-flex">
          <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={onPublish}>
            Publish a folder
          </Button>
        </span>
      </Empty>
    );
  return (
    <div className="grid max-w-[920px] gap-2.5">
      {sites.map((s) => (
        <SiteRow key={s.id} site={s} />
      ))}
    </div>
  );
}

export function Library() {
  const search = useSearch();
  const q = new URLSearchParams(search);
  const place = placeOf(q);
  const asked = q.get('kind') ?? (q.get('tab') === 'media' ? 'media' : 'all');
  const show: Show = SHOWS.some((s) => s.value === asked) || asked === 'media' ? (asked as Show) : 'all';
  const items = useItems();
  const sites = usePagesStore((s) => s.sites);
  const spaces = useSpaces();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<Sort>(() => (localStorage.getItem('wa.pages.sort') as Sort) || 'changed');
  const [sortMenu, setSortMenu] = useState(false);
  const sortRef = useRef<HTMLButtonElement>(null);
  const [making, setMaking] = useState<NewKind | null>(null);
  const [publish, setPublish] = useState(false);
  const folders = usePagesStore((s) => s.folders);
  const [newMenu, setNewMenu] = useState(false);
  const newRef = useRef<HTMLButtonElement>(null);
  const [folderAsk, setFolderAsk] = useState(false);
  const [importing, setImporting] = useState(false);
  useEffect(() => {
    usePagesStore.getState().loadPages().catch(toastError);
    usePagesStore.getState().loadSites().catch(toastError);
    useMedia.getState().load().catch(() => {});
    preloadEditors();
  }, []);
  useEffect(() => localStorage.setItem('wa.pages.sort', sort), [sort]);
  // The search box's "New page", "New slides"… open here with the dialog.
  const newAsked = q.get('new');
  useEffect(() => {
    if (!newAsked) return;
    if (newAsked === 'folder') setFolderAsk(true);
    else if (newAsked === 'import') setImporting(true);
    else setMaking(newAsked === 'design' || newAsked === 'slides' || newAsked === 'doc' || newAsked === 'sheet' || newAsked === 'tex' || newAsked === 'notebook' || newAsked === 'diagram' ? newAsked : 'page');
    go('/library', true);
  }, [newAsked]);
  // A space that is gone: everything again.
  useEffect(() => {
    if (place.kind === 'space' && spaces && !spaces.some((s) => s.id === place.id)) go('/library', true);
  }, [place.kind === 'space' ? place.id : '', spaces]);
  const toPlace = (p: Place) => {
    setFind('');
    go(addressOf(p, samePlace(p, place) ? show : 'all'), true);
  };
  const space = place.kind === 'space' ? (spaces?.find((s) => s.id === place.id) ?? null) : null;
  // A place of its own (a project, or none; everything, when there are no projects) shows its folders, and a folder open.
  const placeSpace: string | null | undefined = place.kind === 'space' ? place.id : place.kind === 'none' || (place.kind === 'all' && !spaces?.length) ? null : undefined;
  const placeList = placeSpace === undefined ? [] : placeFolders(folders, placeSpace);
  const askedFolder = q.get('folder');
  const current = askedFolder && placeList.some((f) => f.id === askedFolder) ? askedFolder : null;
  const chain = folderChain(folders, current);
  const topName = placeTopName(placeSpace ?? null, spaces);
  const goFolder = (id: string | null) => {
    setFind('');
    go(addressOf(place, 'all', id), true);
  };

  // Files dragged over the Library: where they would go (a place of the list under them, else the place open) and
  // what it says; dropped, each goes on its way into the Library.
  const [over, setOver] = useState<{ space: string | null; at: string } | null>(null);
  const dropTarget = (el: EventTarget | null) => {
    const t = (el as HTMLElement | null)?.closest?.<HTMLElement>('[data-drop]');
    return t ? { space: t.dataset.drop || null, at: t.dataset.dropAt ?? '' } : { space: space?.id ?? null, at: 'main' };
  };
  const onDragOver = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dropMoves() ? 'move' : 'copy';
    const t = dropTarget(e.target);
    if (over?.space !== t.space || over?.at !== t.at) setOver(t);
  };
  const onDragLeave = (e: DragEvent) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(null);
  const onDrop = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    const t = dropTarget(e.target);
    setOver(null);
    void droppedFiles(e.dataTransfer).then((files) => addToLibrary(files, t.space));
  };
  const overName = over?.space ? spaces?.find((s) => s.id === over.space)?.name : undefined;

  // What the place holds, then what the kind and the words keep of it.
  const here = useMemo(() => (items ?? []).filter((it) => place.kind === 'all' || (place.kind === 'none' ? !it.space : place.kind === 'space' && it.space === place.id)), [items, search]);
  const kinds = useMemo(() => SHOWS.filter((s) => s.value === 'all' || here.some((it) => s.has(it.kind))), [here]);
  const words = find.trim().toLowerCase();
  // Found by the server (search.ts) best first, then what has the words in its title or description and the server
  // left out (a word half typed); until it answers, those alone.
  const version = useMemo(() => `${items?.length ?? 0}:${items?.[0]?.at ?? 0}:${(items ?? []).reduce((n, it) => n + (it.page?.description ?? it.media?.description ?? '').length, 0)}`, [items]);
  const ranked = useLibrarySearch(find.trim(), version);
  const shown = useMemo(() => {
    const has = showOf(show).has;
    const kept = here.filter((it) => has(it.kind));
    if (!words) return sorted(kept, sort);
    const local = sorted(
      kept.filter((it) => `${it.title} ${it.page?.description ?? it.media?.description ?? ''}`.toLowerCase().includes(words)),
      sort,
    );
    if (ranked?.q !== find.trim()) return local;
    const byKey = new Map(kept.map((it) => [it.key, it]));
    const first = ranked.keys.flatMap((k) => byKey.get(k) ?? []);
    const seen = new Set(first.map((it) => it.key));
    return [...first, ...local.filter((it) => !seen.has(it.key))];
  }, [here, show, words, sort, ranked]);
  // In a place, finding nothing and showing every kind: its folders, and what is in the folder open (or at its top).
  const folderView = placeSpace !== undefined && !words && show === 'all';
  const known = useMemo(() => new Set(placeList.map((f) => f.id)), [placeList]);
  const subfolders = useMemo(() => {
    const list = placeList.filter((f) => (f.parent && known.has(f.parent) ? f.parent : null) === current);
    // Each folder by the sort the things have: by name, by the newest made, or by the latest change of what is in it.
    const latest = (f: LibFolder) => Math.max(f.createdAt, ...here.filter((it) => it.folder === f.id).map((it) => it.at));
    if (sort === 'name') return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    if (sort === 'made') return list.sort((a, b) => b.createdAt - a.createdAt);
    return list.sort((a, b) => latest(b) - latest(a));
  }, [placeList, known, current, here, sort]);
  const countIn = (f: LibFolder) => here.filter((it) => it.folder === f.id).length + placeList.filter((x) => x.parent === f.id).length;
  const inView = useMemo(() => (folderView ? shown.filter((it) => (it.folder && known.has(it.folder) ? it.folder : null) === current) : shown), [folderView, shown, known, current]);
  // Everything, with spaces: each space's things under its name (those it holds most lately first), then those in none.
  const sections = useMemo(() => {
    if (place.kind !== 'all' || words || !spaces?.length) return null;
    const by = new Map<string | null, Item[]>();
    for (const it of shown) by.set(it.space ?? null, [...(by.get(it.space ?? null) ?? []), it]);
    const order = [...by.keys()].filter((k): k is string => k !== null).sort((a, b) => Math.max(...by.get(b)!.map((x) => x.at)) - Math.max(...by.get(a)!.map((x) => x.at)));
    return [...order.map((id) => ({ space: spaces.find((s) => s.id === id) ?? null, items: by.get(id)! })), ...(by.has(null) ? [{ space: null, items: by.get(null)! }] : [])];
  }, [shown, place.kind, words, spaces]);

  const newKinds: [NewKind, string, ReactNode][] = [
    ['page', 'Page', <AppWindow size={14} />],
    ['design', 'Design', <Palette size={14} />],
    ['slides', 'Slides', <Presentation size={14} />],
    ['doc', 'Document', <FileText size={14} />],
    ['sheet', 'Spreadsheet', <Sheet size={14} />],
    ['tex', 'LaTeX document', <Sigma size={14} />],
    ['notebook', 'Notebook', <NotebookText size={14} />],
    ['diagram', 'Diagram', <Workflow size={14} />],
  ];
  const newButton = (
    <>
      <Button ref={newRef} size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setNewMenu((x) => !x)}>
        New
      </Button>
      <Popover anchor={newRef} open={newMenu} onClose={() => setNewMenu(false)} align="end" width={220}>
        {newKinds.map(([k, label, icon]) => (
          <MenuItem key={k} icon={icon} onClick={() => (setNewMenu(false), setMaking(k))}>
            {label}
          </MenuItem>
        ))}
        <MenuSep />
        <MenuItem icon={<FolderPlus size={14} />} onClick={() => (setNewMenu(false), setFolderAsk(true))}>
          Folder
        </MenuItem>
        <MenuItem icon={<FolderInput size={14} />} onClick={() => (setNewMenu(false), setImporting(true))}>
          Import a folder
        </MenuItem>
      </Popover>
    </>
  );
  const title = place.kind === 'published' ? 'Published' : place.kind === 'none' ? 'Not in a project' : space ? space.name : 'Everything';

  const body = () => {
    if (place.kind === 'published') return <Published sites={sites} onPublish={() => setPublish(true)} />;
    if (!items)
      return (
        <div className="flex justify-center py-10 text-fg-3">
          <Throbber size={28} />
        </div>
      );
    // Nothing kept yet (folders show in their places, not in Everything).
    if (!items.length && (!folders?.length || placeSpace === undefined))
      return (
        <Empty icon={<LibraryBig size={22} />} title="Your Library is empty">
          <span className="block">
            Pages and small tools agents make for you, slides, documents and spreadsheets, and the pictures, videos and sounds you keep land here, sorted by project. Ask an agent for a tracker, a
            calculator or a deck, or make one here.
          </span>
          <span className="mt-2 block">Drop files here to add them: documents, spreadsheets, slides, pictures, videos and sounds.</span>
          <span className="mt-3 inline-flex gap-2">
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setMaking('page')}>
              New page
            </Button>
            <Button size="sm" variant="secondary" icon={<Presentation size={14} />} onClick={() => setMaking('slides')}>
              New slides
            </Button>
          </span>
        </Empty>
      );
    if (folderView && (current || subfolders.length || inView.length))
      return (
        <div className="space-y-5">
          {subfolders.length > 0 && (
            <div className={GRID}>
              {subfolders.map((f) => (
                <FolderTile key={f.id} folder={f} count={countIn(f)} folders={placeList} topName={topName} onOpen={() => goFolder(f.id)} />
              ))}
            </div>
          )}
          {inView.length > 0 ? (
            <Grid items={inView} />
          ) : (
            !subfolders.length && (
              <Empty icon={<Folder size={22} />} title="This folder is empty">
                {CAN_DRAG ? 'Drag things onto it, or use their More → Move to a folder.' : 'Put things in it with their More → Move to a folder.'}
              </Empty>
            )
          )}
        </div>
      );
    if (!here.length)
      return space ? (
        <Empty icon={<SpaceMark s={space} size={22} />} title={tr(`Nothing in ${space.name} yet`)}>
          <span className="block">What agents save in this project’s sessions lands here. Drop files here to add them; to bring in something of the Library, use its More → Move to a project.</span>
          <span className="mt-3 inline-flex gap-2">
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMaking('page')}>
              New page here
            </Button>
            <Button size="sm" variant="ghost" icon={<Upload size={14} />} onClick={() => pickFiles(space.id)}>
              Upload files
            </Button>
          </span>
        </Empty>
      ) : (
        <Empty icon={<Boxes size={22} />} title="Everything is in a project">
          Things you keep outside any project show here.
        </Empty>
      );
    if (!shown.length)
      return <p className="py-8 text-center text-[13px] text-fg-3">{words ? tr(`Nothing here matches “${find.trim()}”.`) : 'Nothing of that kind here.'}</p>;
    if (sections)
      return (
        <div className="space-y-9">
          {sections.map((s) => (
            <SpaceSection key={s.space?.id ?? 'none'} space={s.space} items={s.items} showFolder={!!folders?.length} onAll={() => toPlace(s.space ? { kind: 'space', id: s.space.id } : { kind: 'none' })} />
          ))}
        </div>
      );
    return <Grid items={shown} showSpace={place.kind === 'all'} showFolder={!!folders?.length} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col" onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      <PageHeader
        title="Library"
        tip="library"
        sub="What agents made for you and what you kept: pages, slides, documents, pictures, videos and sounds, by project"
        actions={
          place.kind === 'published' ? (
            <Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => setPublish(true)}>
              Publish a folder
            </Button>
          ) : (
            newButton
          )
        }
      />
      <div className="relative flex min-h-0 flex-1">
        {wide && items && (
          <aside className="w-[232px] shrink-0 overflow-y-auto border-r border-line px-3 py-4">
            <Places place={place} onPlace={toPlace} items={items} sites={sites} dropAt={over?.at} />
          </aside>
        )}
        <div className={cx('min-h-0 min-w-0 flex-1 overflow-y-auto', over?.at === 'main' && 'bg-accent/6 outline-2 -outline-offset-4 outline-accent/50 outline-dashed')}>
          <div className="mx-auto max-w-[1180px] px-3 py-4 sm:px-6 sm:py-5">
            {!wide && items && <Places chips place={place} onPlace={toPlace} items={items} sites={sites} dropAt={over?.at} />}
            {/* Come to share something (the search box's Share something with people): where it is done. */}
            {q.get('share') === '1' && (
              <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3.5 py-2.5 text-[13px] text-fg-2">
                <UserPlus size={15} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  To share one thing, open its <span className="font-medium text-fg">More</span> (⋯) and pick <span className="font-medium text-fg">Share with people</span>, or use{' '}
                  <span className="font-medium text-fg">Share</span> at the top of its own page.
                </span>
                <button type="button" aria-label="Close" onClick={() => go('/library', true)} className="shrink-0 rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg">
                  <X size={14} />
                </button>
              </div>
            )}
            {place.kind !== 'published' && (!!here.length || !!placeList.length) && (
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2.5">
                {folderView && chain.length > 0 ? (
                  <FolderCrumbs chain={chain} space={space} topName={topName} onGo={goFolder} />
                ) : (
                  wide && (
                  <h2 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold tracking-tight">
                    {space && <SpaceMark s={space} size={22} className="rounded-md" />}
                    <span translate={space ? 'no' : undefined} className="truncate">
                      {title}
                    </span>
                  </h2>
                  )
                )}
                {space && wide && !chain.length && (
                  <>
                    <button type="button" onClick={() => go(`/projects/${space.id}`)} className="text-[12.5px] font-medium text-fg-3 hover:text-fg">
                      Open the project
                    </button>
                    <button type="button" onClick={() => pickFiles(space.id)} className="flex items-center gap-1 text-[12.5px] font-medium text-fg-3 hover:text-fg">
                      <Upload size={13} />
                      Upload files
                    </button>
                  </>
                )}
                <span className="flex-1 max-lg:hidden" />
                <label className="flex h-8.5 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 lg:max-w-[280px]">
                  <Search size={14} className="shrink-0 text-fg-3" />
                  <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search by name or description" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
                  {find && (
                    <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                      <X size={13} />
                    </button>
                  )}
                </label>
                {space && !wide && (
                  <IconButton label="Upload files" onClick={() => pickFiles(space.id)}>
                    <Upload size={16} />
                  </IconButton>
                )}
                <Button ref={sortRef} size="sm" variant="ghost" icon={<ArrowDownUp size={13} />} onClick={() => setSortMenu((x) => !x)}>
                  <span className="max-sm:hidden">{SORTS.find((x) => x.value === sort)!.label}</span>
                </Button>
                <Popover anchor={sortRef} open={sortMenu} onClose={() => setSortMenu(false)} align="end" width={180}>
                  {SORTS.map((x) => (
                    <MenuItem key={x.value} checked={sort === x.value} onClick={() => (setSort(x.value), setSortMenu(false))}>
                      {x.label}
                    </MenuItem>
                  ))}
                </Popover>
                {kinds.length > 2 && (
                  <div className="flex w-full gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
                    {kinds.map((k) => (
                      <button
                        key={k.value}
                        type="button"
                        aria-pressed={show === k.value}
                        onClick={() => go(addressOf(place, k.value, current), true)}
                        className={cx(
                          'h-7 shrink-0 rounded-full px-3 text-[12.5px] transition-colors',
                          show === k.value ? 'bg-bg-3 font-medium text-fg' : 'text-fg-3 hover:bg-bg-2 hover:text-fg',
                        )}
                      >
                        {k.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {body()}
          </div>
        </div>
        {over && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center px-4">
            <DropHint name={overName} />
          </div>
        )}
      </div>
      <PublishDialog open={publish} onClose={() => setPublish(false)} />
      <NewPageDialog open={!!making} kind={making ?? 'page'} space={space?.id ?? null} folder={current ?? undefined} onClose={() => setMaking(null)} />
      <FolderNameDialog
        open={folderAsk}
        onClose={() => setFolderAsk(false)}
        title={chain.length ? tr(`A new folder in ${chain[chain.length - 1].name}`) : 'A new folder'}
        initial=""
        confirm="Make it"
        onDone={async (name) => {
          const r = await post<{ folder: LibFolder }>('/api/pages/folders', { name, parent: current ?? undefined, space: placeSpace ?? null });
          // Made where the Library shows (in Everything with projects, outside them): shown where it is.
          if (placeSpace === undefined) go(addressOf({ kind: 'none' }, 'all'), true);
          else if (words || show !== 'all') goFolder(current);
          toast(tr(`Made the folder “${r.folder.name}”`), 'ok');
        }}
      />
      <ImportFolderDialog open={importing} onClose={() => setImporting(false)} space={placeSpace ?? null} folder={current} folderName={chain[chain.length - 1]?.name} />
    </div>
  );
}

// ---- a space's own Library -------------------------------------------------------------------------------------

/**
 * What a space holds in the Library (its page's Overview and Library tab): the cards, the last changed first, or with
 * nothing yet what will be here and New page and New slides. `framed`: false inside a card of its own. Files dropped on
 * it go into the space's Library, as on the Library's own page.
 */
export function SpaceLibrary({ space, limit, framed = true }: { space: SpaceView; limit?: number; framed?: boolean }) {
  const items = useItems();
  const [making, setMaking] = useState<NewKind | null>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(toastError);
    useMedia.getState().ensure();
  }, []);
  const mine = (items ?? []).filter((it) => it.space === space.id);
  const shown = limit ? mine.slice(0, limit) : mine;
  const onDragOver = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = dropMoves() ? 'move' : 'copy';
    if (!over) setOver(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!dragsFiles(e.dataTransfer)) return;
    e.preventDefault();
    setOver(false);
    void droppedFiles(e.dataTransfer).then((files) => addToLibrary(files, space.id));
  };
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={onDrop}
      className={cx('relative', over && 'rounded-2xl bg-accent/6 outline-2 outline-offset-4 outline-accent/50 outline-dashed')}
    >
      {!items ? (
        <div className="flex justify-center py-6 text-fg-3">
          <Throbber size={22} />
        </div>
      ) : !mine.length ? (
        <div className={cx('flex flex-col items-center px-5 text-center text-[13px] leading-relaxed text-fg-3', framed ? 'rounded-2xl border border-dashed border-line-2 py-7' : 'pt-1 pb-3')}>
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-bg-2 text-fg-2">
            <LibraryBig size={19} />
          </span>
          <span className="mt-3 block text-[14px] font-semibold text-fg">Nothing here yet</span>
          <span className="mt-1 block max-w-[440px]">Pages, slides and documents agents save in this project’s sessions land here, and so does what you keep from them. Drop files here to add them.</span>
          <span className="mt-4 flex justify-center gap-2">
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMaking('page')}>
              New page
            </Button>
            <Button size="sm" variant="ghost" icon={<Presentation size={14} />} onClick={() => setMaking('slides')}>
              New slides
            </Button>
          </span>
        </div>
      ) : (
        <Grid items={shown} />
      )}
      {!!mine.length && limit !== undefined && mine.length > limit && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => go(`/library?project=${space.id}`)}>
            {tr(`See all ${mine.length} in the Library`)}
            <ArrowRight size={13} className="ml-1" />
          </Button>
        </div>
      )}
      <NewPageDialog open={!!making} kind={making ?? 'page'} space={space.id} onClose={() => setMaking(null)} />
      {over && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <DropHint name={space.name} />
        </div>
      )}
    </div>
  );
}

/** How many things a space holds in the Library (null until known). */
export function useSpaceItemCount(id: string): number | null {
  const items = useItems();
  return items ? items.filter((it) => it.space === id).length : null;
}

