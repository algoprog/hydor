// What was kept in a project, shown among its files (the project's Files tab: spaces/SpaceFiles.tsx). Pages, designs,
// slides, documents, spreadsheets, LaTeX documents, notebooks, diagrams and boards that agents or you made in the
// project, and the pictures, videos and sounds kept in it, are things of the app and not files in its folder: each shows
// as a tile like a file's (its picture, its kind, its name, when it changed, ⋯) or as a row of the list, opens in its
// own editor or viewer, and has its own menu (edit, rename, share, move to another project, duplicate, turn it into
// another kind, download or export, delete). `useKept` lists them for a project, the newest first. Most also have a
// file of their own in the project's folder (`keptFile`), which the Files tab shows instead.
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AppWindow,
  AudioLines,
  Copy,
  Database,
  Download,
  Ellipsis,
  ExternalLink,
  FileText,
  FolderInput,
  FolderOpen,
  Globe,
  ImageIcon,
  LayoutDashboard,
  MessageSquarePlus,
  NotebookText,
  PenLine,
  Pencil,
  Play,
  Presentation,
  RefreshCw,
  Sheet,
  Sigma,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';
import { TURN_INTO, type TurnTo } from '@shared/content-asks';
import type { MediaItem } from '@shared/media';
import type { PageInfo } from '@shared/pages';
import type { SpaceView } from '@shared/spaces';
import { del, enc, patch, post } from '../../lib/api';
import { ago, bytes } from '../../lib/format';
import { go } from '../../lib/nav';
import { canReveal, reveal, revealLabel } from '../../lib/reveal';
import { toast, toastError } from '../../lib/store';
import { tr, trIn } from '../../i18n/runtime';
import { cx, IconButton, MenuBack, MenuItem, MenuLabel, MenuSep, Popover, useConfirm, useIsMobile } from '../../components/ui';
import { ownBrowserHere } from '../browser/browsing';
import { useAskRun } from '../guide/ask';
import { downloadMedia, recaption, SoundTile, startSessionWithMedia, Still } from '../media/parts';
import { useMedia } from '../media/state';
import { folderName, FolderStep, ProjectRow, useSubfolders } from '../spaces/FolderPick';
import { openShare, useSharedThings } from '../spaces/ShareHost';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { openInBrowser } from './BrowserLists';
import { exportFile, type ExportFormat } from './exportFile';
import { EXPORTS } from './exports';
import { RenameDialog, Thumb } from './parts';
import { usePagesStore } from './state';
import { turnRequest } from './types/requests';
import { startMaking } from './types/start';

// ---- what is kept ---------------------------------------------------------------------------------------

/** `web`: a page saved from the Browser (it has the address it came from, whatever its kind). */
export type KeptKind = 'page' | 'slides' | 'doc' | 'web' | 'sheet' | 'tex' | 'notebook' | 'diagram' | 'board' | 'image' | 'video' | 'audio';

export interface Kept {
  key: string;
  kind: KeptKind;
  title: string;
  space?: string;
  /** When it last changed (a picture: when it was kept). */
  at: number;
  made: number;
  page?: PageInfo;
  media?: MediaItem;
}

export const KIND: Record<KeptKind, { label: string; icon: ReactNode }> = {
  page: { label: 'Page', icon: <AppWindow size={12} /> },
  slides: { label: 'Slides', icon: <Presentation size={12} /> },
  doc: { label: 'Document', icon: <FileText size={12} /> },
  web: { label: 'Web page', icon: <Globe size={12} /> },
  sheet: { label: 'Spreadsheet', icon: <Sheet size={12} /> },
  tex: { label: 'LaTeX', icon: <Sigma size={12} /> },
  notebook: { label: 'Notebook', icon: <NotebookText size={12} /> },
  diagram: { label: 'Diagram', icon: <Workflow size={12} /> },
  board: { label: 'Board', icon: <LayoutDashboard size={12} /> },
  image: { label: 'Picture', icon: <ImageIcon size={12} /> },
  video: { label: 'Video', icon: <Play size={12} /> },
  audio: { label: 'Audio', icon: <AudioLines size={12} /> },
};

const fromPage = (p: PageInfo): Kept => ({ key: `p:${p.id}`, kind: p.source ? 'web' : (p.kind ?? 'page'), title: p.title, space: p.space, at: p.updatedAt, made: p.createdAt, page: p });
const fromMedia = (m: MediaItem): Kept => ({ key: `m:${m.id}`, kind: m.kind, title: m.title, space: m.space, at: m.updatedAt, made: m.createdAt, media: m });

/** Its own file in its project's folder, when it has one. */
export const keptFile = (it: Kept): string | undefined => it.page?.projectFile ?? it.media?.projectFile;

/** What a project keeps (pages, and pictures, videos and sounds), the last changed first; null until it is known. */
export function useKept(space: string): Kept[] | null {
  const pages = usePagesStore((s) => s.pages);
  const media = useMedia((s) => s.items);
  useEffect(() => {
    if (!usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(toastError);
    useMedia.getState().ensure();
  }, []);
  return useMemo(() => {
    if (!pages) return null;
    return [...pages.map(fromPage), ...(media ?? []).map(fromMedia)].filter((it) => it.space === space).sort((a, b) => b.at - a.at);
  }, [pages, media, space]);
}

/** Those whose name has the words in it (all, with none). */
export const keptMatching = (list: Kept[], words: string) => {
  const f = words.trim().toLowerCase();
  return f ? list.filter((it) => it.title.toLowerCase().includes(f)) : list;
};

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
 * there. Mounted while open, so the tiles do not each ask which agent would run it.
 */
export function TurnMenu({ p, anchor, onClose, onBack }: { p: PageInfo; anchor: RefObject<HTMLButtonElement | null>; onClose: () => void; onBack: () => void }) {
  const run = useAskRun();
  const spaces = useSpaces();
  const turn = (to: TurnTo) => {
    onClose();
    const r = turnRequest({ from: p.kind ?? 'page', to, id: p.id, title: p.title });
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

/** The page a web page was saved from, in your own browser (the desktop app) or a new tab. */
export const openOriginal = (url: string) => (ownBrowserHere() ? openInBrowser(url) : void window.open(url, '_blank', 'noopener'));

/** Moves a kept thing to another project (`dir`: a folder picked in its folder), saying where it went. */
async function moveTo(it: Kept, space: string, name?: string, dir?: string) {
  try {
    if (it.page) await patch(`/api/pages/${enc(it.page.id)}`, { space, dir });
    else if (it.media) {
      const r = await patch<{ item: MediaItem }>(`/api/media/${enc(it.media.id)}`, { space, dir });
      useMedia.getState().put(r.item);
    }
    toast(name ? tr(`Moved to ${name}`) : 'Moved', 'ok');
  } catch (e) {
    toastError(e);
  }
}

/** The projects a kept thing can move to, each with its folders. */
function MoveChoices({ to, onPick }: { to: SpaceView[]; onPick: (s: SpaceView, dir?: string) => void }) {
  const [into, setInto] = useState<SpaceView | null>(null);
  const folders = useSubfolders(to.map((s) => s.folder));
  if (into) return <FolderStep project={into} onBack={() => setInto(null)} onPick={(dir) => onPick(into, dir)} />;
  return (
    <>
      <MenuLabel>Move it to</MenuLabel>
      <div className={cx(to.length > 8 && 'max-h-[260px] overflow-y-auto')}>
        {to.map((s) => (
          <ProjectRow key={s.id} folders={folders(s.folder)} onFolders={() => setInto(s)}>
            <MenuItem icon={<SpaceMark s={s} size={16} />} onClick={() => onPick(s)}>
              <span translate="no">{s.name}</span>
            </MenuItem>
          </ProjectRow>
        ))}
      </div>
    </>
  );
}

// ---- one kept thing -------------------------------------------------------------------------------------

/** What opening, the menu and its dialogs do for one kept thing, for both its tile and its row. */
function useKeptThing(it: Kept) {
  const spaces = useSpaces();
  const [menu, setMenu] = useState(false);
  const [turning, setTurning] = useState(false);
  const [moving, setMoving] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const p = it.page;
  const m = it.media;
  const people = useSharedThings()(p ? 'page' : 'media', p ? p.id : m!.id);
  const web = it.kind === 'web' ? p?.source : undefined;
  const open = (mode?: string) => (p ? go(`/pages/${p.id}${mode ? `?mode=${mode}` : ''}`) : m && go(`/media/${m.id}`));
  const close = () => setMenu(false);
  const remove = async () => {
    close();
    // Each said whole, so it is translated whole: with its file in the project's folder, and without.
    const filed = !!keptFile(it) && !it.media?.projectFileAdopted;
    const ok = await confirm({
      title: tr(`Delete “${it.title}”?`),
      body: p
        ? filed
          ? 'Its versions, what it keeps and any published copy go with it. Its file in the project’s folder goes to the Trash.'
          : 'Its versions, what it keeps and any published copy go with it.'
        : filed
          ? 'It goes from this project. The file it was saved from, if it is still there, stays. Its file in the project’s folder goes to the Trash.'
          : 'It goes from this project. The file it was saved from, if it is still there, stays.',
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
  const others = (spaces ?? []).filter((s) => s.id !== it.space);

  const menus = (
    <>
      <Popover anchor={anchor} open={menu} onClose={close} align="end" width={240}>
        {p ? (
          <>
            {p.kind === 'slides' ? (
              <MenuItem icon={<Play size={14} />} onClick={() => (close(), go(`/pages/${p.id}?present=1`))}>
                {/* This action presents slides; the same word also names a tense elsewhere. */}
                {trIn('slides', 'Present')}
              </MenuItem>
            ) : (
              <MenuItem icon={<PenLine size={14} />} onClick={() => (close(), open('edit'))}>
                Edit
              </MenuItem>
            )}
            <MenuItem icon={<Pencil size={14} />} onClick={() => (close(), setRename(true))}>
              Rename
            </MenuItem>
            {web && (
              <MenuItem icon={<ExternalLink size={14} />} onClick={() => (close(), openOriginal(web.url))}>
                Open the original page
              </MenuItem>
            )}
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
        {others.length > 0 && (
          <MenuItem icon={<FolderInput size={14} />} onClick={() => (close(), setMoving(true))}>
            Move to another project
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
            {canReveal() && (
              <MenuItem icon={<FolderOpen size={14} />} onClick={() => (close(), reveal(m!.file))}>
                {revealLabel()}
              </MenuItem>
            )}
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
      <Popover anchor={anchor} open={moving} onClose={() => setMoving(false)} align="end" width={250}>
        <MoveChoices to={others} onPick={(s, dir) => (setMoving(false), void moveTo(it, s.id, folderName(s, dir) ?? s.name, dir))} />
      </Popover>
      {p && <RenameDialog page={p} open={rename} onClose={() => setRename(false)} />}
      {confirmNode}
    </>
  );
  return { open, anchor, setMenu, menus, people, busy: menu || moving || turning };
}

/** The line under a kept thing's name: when it changed (a web page: when it was saved, a picture still being titled: that). */
function when(it: Kept): string {
  if (it.media?.caption === 'pending') return tr('Writing its title…');
  return it.kind === 'web' ? tr(`Saved ${ago(it.made)}`) : tr(`Changed ${ago(it.at)}`);
}

/** The small marks after a kept thing's line: shared with people, published, keeps data. */
function Marks({ it, people }: { it: Kept; people: number }) {
  const p = it.page;
  return (
    <>
      {people > 0 && <Users size={11} className="shrink-0 text-info" aria-label={tr(people === 1 ? 'Shared with 1 person' : `Shared with ${people} people`)} />}
      {p?.published && <Globe size={11} className="shrink-0 text-accent" aria-label="Published" />}
      {!!p?.storageBytes && <Database size={11} className="shrink-0" aria-label={tr(`Keeps ${bytes(p.storageBytes)}`)} />}
    </>
  );
}

/** A kept thing as a tile of the grid: the same shape as a file's, its picture on top (4:3), its kind, its name and when it changed. */
export function KeptTile({ it }: { it: Kept }) {
  const { open, anchor, setMenu, menus, people, busy } = useKeptThing(it);
  const p = it.page;
  const m = it.media;
  return (
    <div className="press-card group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2">
      {/* A sound's picture is its shape, with a button to play it where it is (beside the one that opens it, not in it). */}
      {m?.kind === 'audio' ? (
        <SoundTile m={m} onOpen={() => open()} className="aspect-[4/3] w-full border-b border-line" />
      ) : (
        <button type="button" onClick={() => open()} className="relative block text-left" aria-label={it.title}>
          {p ? <Thumb page={p} corner className="aspect-[4/3] w-full border-b border-line" /> : <Still m={m!} className="aspect-[4/3] w-full border-b border-line" />}
          {/* Its kind, on the picture: a page's own top is plain to see (and the mark would hide its title), a video shows its length. */}
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
            <span className="truncate">{when(it)}</span>
            <Marks it={it} people={people} />
          </span>
        </button>
        <IconButton
          ref={anchor}
          label="More"
          size="sm"
          onClick={() => setMenu((x) => !x)}
          active={busy}
          className={cx('transition-opacity', !busy && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100')}
        >
          <Ellipsis size={15} />
        </IconButton>
      </div>
      {menus}
    </div>
  );
}

/** A kept thing as a row of the list: its kind's mark, its name, when it changed; the same menu. */
export function KeptRow({ it, narrow }: { it: Kept; narrow?: boolean }) {
  const { open, anchor, setMenu, menus, people, busy } = useKeptThing(it);
  const p = it.page;
  const m = it.media;
  return (
    <div
      role="row"
      onClick={() => open()}
      className="group flex h-9 cursor-pointer items-center gap-2 pr-1.5 pl-[60px] text-[13.5px] select-none hover:bg-bg-2 max-md:h-14 max-md:gap-3 max-md:pr-1 max-md:pl-3 max-md:text-[15px]"
    >
      <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent max-md:size-9 max-md:rounded-xl" title={KIND[it.kind].label}>
        {KIND[it.kind].icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span translate="no" title={(p ? p.description : m?.description) || undefined} className="truncate">
            {it.title}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-fg-3">
            <Marks it={it} people={people} />
          </span>
        </span>
        {narrow && <span className="block truncate text-[12.5px] text-fg-3">{when(it)}</span>}
      </span>
      {!narrow && (
        <>
          <span className="w-3 shrink-0" />
          <span className="tnum w-24 shrink-0 truncate text-right text-[12.5px] text-fg-3 @max-[560px]:hidden">{ago(it.at)}</span>
          <span className="w-20 shrink-0 truncate text-right text-[12.5px] text-fg-3 @max-[460px]:hidden">{KIND[it.kind].label}</span>
        </>
      )}
      <IconButton
        ref={anchor}
        label="More"
        size="sm"
        onClick={(e) => (e.stopPropagation(), setMenu((x) => !x))}
        active={busy}
        className={cx('transition-opacity', !busy && 'opacity-0 group-hover:opacity-100 max-md:opacity-100')}
      >
        <Ellipsis size={15} />
      </IconButton>
      {/* The menus are drawn elsewhere, but their clicks bubble up through here: they must not open the row. */}
      <div className="contents" onClick={(e) => e.stopPropagation()}>
        {menus}
      </div>
    </div>
  );
}

/** The kept things whose names have the words in them, as tiles (in a grid) or as rows (in a list), in the order given. */
export function KeptThings({ items, grid, filter }: { items: Kept[]; grid: boolean; filter: string }) {
  const mobile = useIsMobile();
  return (
    <>
      {keptMatching(items, filter).map((it) => (grid ? <KeptTile key={it.key} it={it} /> : <KeptRow key={it.key} it={it} narrow={mobile} />))}
    </>
  );
}
