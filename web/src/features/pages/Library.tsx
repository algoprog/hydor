// The Library (/library): everything kept, by space. Pages and small tools, slide decks, documents, spreadsheets
// and LaTeX documents (agents' and yours), and the pictures and videos you kept, each in the space it was made in
// (an agent's save goes in its session's space; you pick when you keep something yourself) or in none. On a wide
// screen the places are a list beside it: Everything (each space's things together, under its name), each space,
// Not in a space, and Published (the sites published from pages or a project's build); on a phone, a row of chips.
// Kinds filter what a place shows, a box finds things by name, and each card's More moves it to another space.
// Addresses: /library?space=<id>|none, &kind=<kind> (image and video each, media both: the old Media tab's
// ?tab=media too), ?tab=published; ?new=page|slides|doc|sheet|tex opens New with that kind.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearch } from 'wouter';
import {
  AppWindow,
  ArrowDownUp,
  ArrowRight,
  Boxes,
  Copy,
  Database,
  Download,
  Ellipsis,
  FileText,
  FolderInput,
  Globe,
  ImageIcon,
  Layers,
  LibraryBig,
  MessageSquarePlus,
  PenLine,
  Pencil,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  Search,
  Sheet,
  Sigma,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { MediaItem } from '@shared/media';
import type { PageInfo, SiteInfo } from '@shared/pages';
import type { SpaceView } from '@shared/spaces';
import { del, enc, patch, post } from '../../lib/api';
import { ago, bytes } from '../../lib/format';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { Button, cx, Empty, IconButton, MenuItem, MenuLabel, MenuSep, Popover, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { downloadMedia, recaption, startSessionWithMedia, Still } from '../media/parts';
import { useMedia } from '../media/state';
import { SpaceMark } from '../spaces/parts';
import { SpaceMenu } from '../spaces/SpacePick';
import { useSpaces } from '../spaces/state';
import { preloadEditors } from './editors';
import { exportFile, type ExportFormat } from './exportFile';
import { EXPORTS } from './exports';
import { NewPageDialog, PublishDialog, RenameDialog, SiteRow, Thumb, type NewKind } from './parts';
import { usePagesStore } from './state';

// ---- what the Library holds ----------------------------------------------------------------------------

type ItemKind = 'page' | 'slides' | 'doc' | 'sheet' | 'tex' | 'image' | 'video';
/** What a place shows: everything, one kind, or pictures and videos together. */
type Show = 'all' | 'page' | 'slides' | 'doc' | 'sheet' | 'tex' | 'image' | 'video' | 'media';

interface Item {
  key: string;
  kind: ItemKind;
  title: string;
  space?: string;
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
  image: { label: 'Picture', icon: <ImageIcon size={12} /> },
  video: { label: 'Video', icon: <Play size={12} /> },
};

const SHOWS: { value: Show; label: string; has: (k: ItemKind) => boolean }[] = [
  { value: 'all', label: 'All', has: () => true },
  { value: 'page', label: 'Pages', has: (k) => k === 'page' },
  { value: 'slides', label: 'Slides', has: (k) => k === 'slides' },
  { value: 'doc', label: 'Documents', has: (k) => k === 'doc' },
  { value: 'sheet', label: 'Spreadsheets', has: (k) => k === 'sheet' },
  { value: 'tex', label: 'LaTeX', has: (k) => k === 'tex' },
  { value: 'image', label: 'Pictures', has: (k) => k === 'image' },
  { value: 'video', label: 'Videos', has: (k) => k === 'video' },
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

const fromPage = (p: PageInfo): Item => ({ key: `p:${p.id}`, kind: p.kind ?? 'page', title: p.title, space: p.space, at: p.updatedAt, made: p.createdAt, page: p });
const fromMedia = (m: MediaItem): Item => ({ key: `m:${m.id}`, kind: m.kind, title: m.title, space: m.space, at: m.updatedAt, made: m.createdAt, media: m });

/** Everything kept, the last changed first; with the spaces as they are now (a space deleted: in none). */
function useItems(): Item[] | null {
  const pages = usePagesStore((s) => s.pages);
  const media = useMedia((s) => s.items);
  const spaces = useSpaces();
  return useMemo(() => {
    if (!pages) return null;
    const known = new Set((spaces ?? []).map((s) => s.id));
    const all = [...pages.map(fromPage), ...(media ?? []).map(fromMedia)].map((it) => (it.space && spaces && !known.has(it.space) ? { ...it, space: undefined } : it));
    return all.sort((a, b) => b.at - a.at);
  }, [pages, media, spaces]);
}

function sorted(list: Item[], sort: Sort): Item[] {
  if (sort === 'name') return [...list].sort((a, b) => a.title.localeCompare(b.title));
  if (sort === 'made') return [...list].sort((a, b) => b.made - a.made);
  return list;
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
    toast(name ? tr(`Moved to ${name}`) : 'Moved out of its space', 'ok');
  } catch (e) {
    toastError(e);
  }
}

// ---- one thing kept ----------------------------------------------------------------------------------------

/** A card: its picture (with its kind), its name, its space when the list mixes them, and More. */
function ItemCard({ it, showSpace }: { it: Item; showSpace?: boolean }) {
  const spaces = useSpaces();
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const anchor = useRef<HTMLButtonElement>(null);
  const p = it.page;
  const m = it.media;
  const space = it.space ? spaces?.find((s) => s.id === it.space) : undefined;
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
    <div className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel transition-colors hover:border-line-2">
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
      <div className="flex min-w-0 items-start gap-1 py-2 pr-1 pl-3">
        <button type="button" onClick={() => open()} className="min-w-0 flex-1 text-left">
          <span translate="no" className="block truncate text-[13.5px] leading-5 font-medium text-fg">
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
            <span className="shrink-0 truncate">{sub}</span>
            {p?.published && <Globe size={11} className="shrink-0 text-accent" aria-label="Published" />}
            {!!p?.storageBytes && <Database size={11} className="shrink-0" aria-label={tr(`Keeps ${bytes(p.storageBytes)}`)} />}
          </span>
        </button>
        <IconButton ref={anchor} label="More" size="sm" onClick={() => setMenu((x) => !x)} active={menu || moving}>
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
              Rename
            </MenuItem>
          </>
        ) : (
          <MenuItem icon={<MessageSquarePlus size={14} />} onClick={() => (close(), startSessionWithMedia(m!))}>
            Start a session with it
          </MenuItem>
        )}
        {!!spaces?.length && (
          <MenuItem icon={<FolderInput size={14} />} onClick={() => (close(), setMoving(true))}>
            Move to a space
          </MenuItem>
        )}
        {p ? (
          <>
            <MenuItem icon={<Copy size={14} />} onClick={duplicate}>
              Duplicate
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
      <SpaceMenu anchor={anchor} open={moving} onClose={() => setMoving(false)} title="Move it to" value={it.space ?? null} onPick={(s) => s !== (it.space ?? null) && void moveTo(it, s, spaces)} />
      {p && <RenameDialog page={p} open={rename} onClose={() => setRename(false)} />}
      {confirmNode}
    </div>
  );
}

const GRID = 'grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-3.5';

function Grid({ items, showSpace }: { items: Item[]; showSpace?: boolean }) {
  return (
    <div className={GRID}>
      {items.map((it) => (
        <ItemCard key={it.key} it={it} showSpace={showSpace} />
      ))}
    </div>
  );
}

// ---- places ------------------------------------------------------------------------------------------------

/** Where the Library looks: everything, a space's things, those in none, or what was published. */
type Place = { kind: 'all' } | { kind: 'none' } | { kind: 'published' } | { kind: 'space'; id: string };

function placeOf(q: URLSearchParams): Place {
  if (q.get('tab') === 'published') return { kind: 'published' };
  const s = q.get('space');
  if (s === 'none') return { kind: 'none' };
  if (s) return { kind: 'space', id: s };
  return { kind: 'all' };
}

function addressOf(place: Place, show: Show): string {
  const q = new URLSearchParams();
  if (place.kind === 'published') q.set('tab', 'published');
  else {
    if (place.kind === 'none') q.set('space', 'none');
    if (place.kind === 'space') q.set('space', place.id);
    if (show !== 'all') q.set('kind', show);
  }
  const s = q.toString();
  return `/library${s ? `?${s}` : ''}`;
}

const samePlace = (a: Place, b: Place) => a.kind === b.kind && (a.kind !== 'space' || a.id === (b as { id: string }).id);

/** One place in the list beside the Library (or a chip of the row over it, on a phone). */
function PlaceButton({ on, icon, label, count, onClick, chip, mine }: { on: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void; chip?: boolean; mine?: boolean }) {
  if (chip)
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={cx(
          'flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-2 text-[13px] transition-colors',
          on ? 'border-fg bg-fg text-bg' : 'border-line bg-panel text-fg-2 hover:border-line-2 hover:text-fg',
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
      className={cx('flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors', on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-1 hover:text-fg')}
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <span translate={mine ? 'no' : undefined} className="min-w-0 flex-1 truncate">
        {label}
      </span>
      {count !== undefined && count > 0 && <span className="tnum text-[12px] text-fg-3">{count}</span>}
    </button>
  );
}

function Places({ place, onPlace, items, sites, chips }: { place: Place; onPlace: (p: Place) => void; items: Item[]; sites: SiteInfo[] | null; chips?: boolean }) {
  const spaces = useSpaces() ?? [];
  const count = (id: string | null) => items.filter((it) => (it.space ?? null) === id).length;
  const none = count(null);
  const list = (
    <>
      <PlaceButton chip={chips} on={place.kind === 'all'} icon={<LibraryBig size={15} className={chips ? undefined : 'text-fg-3'} />} label="Everything" count={items.length} onClick={() => onPlace({ kind: 'all' })} />
      {spaces.length > 0 && !chips && <div className="px-2.5 pt-4 pb-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">Spaces</div>}
      {spaces.map((s) => (
        <PlaceButton key={s.id} chip={chips} mine on={place.kind === 'space' && place.id === s.id} icon={<SpaceMark s={s} size={chips ? 16 : 18} />} label={s.name} count={count(s.id)} onClick={() => onPlace({ kind: 'space', id: s.id })} />
      ))}
      {spaces.length > 0 && (none > 0 || place.kind === 'none') && (
        <PlaceButton chip={chips} on={place.kind === 'none'} icon={<Layers size={15} className={chips ? undefined : 'text-fg-3'} />} label="Not in a space" count={none} onClick={() => onPlace({ kind: 'none' })} />
      )}
      {!chips && <div className="mx-2.5 my-3 border-t border-line" />}
      <PlaceButton chip={chips} on={place.kind === 'published'} icon={<Globe size={15} className={chips ? undefined : 'text-fg-3'} />} label="Published" count={sites?.length ?? undefined} onClick={() => onPlace({ kind: 'published' })} />
    </>
  );
  if (chips) return <div className="-mx-3 mb-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [&::-webkit-scrollbar]:hidden">{list}</div>;
  return (
    <nav aria-label="Places in the Library" className="space-y-0.5">
      {list}
      {!spaces.length && (
        <div className="mt-4 rounded-xl border border-dashed border-line-2 px-3 py-3 text-[12.5px] leading-snug text-fg-3">
          <span className="block font-medium text-fg-2">Sort it by project</span>
          Make a space for a project, and what its sessions make lands together here.
          <button type="button" onClick={() => go('/spaces')} className="mt-1.5 flex items-center gap-1 font-medium text-accent hover:underline">
            Spaces <ArrowRight size={13} />
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
function SpaceSection({ space, items, onAll }: { space: SpaceView | null; items: Item[]; onAll: () => void }) {
  const more = items.length > PER_SECTION;
  return (
    <section>
      <div className="mb-3 flex min-w-0 items-center gap-2.5">
        {space ? <SpaceMark s={space} size={22} className="rounded-md" /> : <Layers size={18} className="shrink-0 text-fg-3" />}
        <h2 translate={space ? 'no' : undefined} className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
          {space ? space.name : 'Not in a space'}
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
      <Grid items={items.slice(0, PER_SECTION)} />
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
    setMaking(newAsked === 'slides' || newAsked === 'doc' || newAsked === 'sheet' || newAsked === 'tex' ? newAsked : 'page');
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

  // What the place holds, then what the kind and the words keep of it.
  const here = useMemo(() => (items ?? []).filter((it) => place.kind === 'all' || (place.kind === 'none' ? !it.space : place.kind === 'space' && it.space === place.id)), [items, search]);
  const kinds = useMemo(() => SHOWS.filter((s) => s.value === 'all' || here.some((it) => s.has(it.kind))), [here]);
  const words = find.trim().toLowerCase();
  const shown = useMemo(() => {
    const has = showOf(show).has;
    return sorted(
      here.filter((it) => has(it.kind) && (!words || `${it.title} ${it.media?.description ?? ''}`.toLowerCase().includes(words))),
      sort,
    );
  }, [here, show, words, sort]);
  // Everything, with spaces: each space's things under its name (those it holds most lately first), then those in none.
  const sections = useMemo(() => {
    if (place.kind !== 'all' || words || !spaces?.length) return null;
    const by = new Map<string | null, Item[]>();
    for (const it of shown) by.set(it.space ?? null, [...(by.get(it.space ?? null) ?? []), it]);
    const order = [...by.keys()].filter((k): k is string => k !== null).sort((a, b) => Math.max(...by.get(b)!.map((x) => x.at)) - Math.max(...by.get(a)!.map((x) => x.at)));
    return [...order.map((id) => ({ space: spaces.find((s) => s.id === id) ?? null, items: by.get(id)! })), ...(by.has(null) ? [{ space: null, items: by.get(null)! }] : [])];
  }, [shown, place.kind, words, spaces]);

  const newButton = (
    <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setMaking('page')}>
      New
    </Button>
  );
  const title = place.kind === 'published' ? 'Published' : place.kind === 'none' ? 'Not in a space' : space ? space.name : 'Everything';

  const body = () => {
    if (place.kind === 'published') return <Published sites={sites} onPublish={() => setPublish(true)} />;
    if (!items)
      return (
        <div className="flex justify-center py-10 text-fg-3">
          <Throbber size={28} />
        </div>
      );
    if (!items.length)
      return (
        <Empty icon={<LibraryBig size={22} />} title="Your Library is empty">
          <span className="block">
            Pages and small tools agents make for you, slides, documents and spreadsheets, and the pictures and videos you keep land here, sorted by space. Ask an agent for a tracker, a calculator or a
            deck, or make one here.
          </span>
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
    if (!here.length)
      return space ? (
        <Empty icon={<SpaceMark s={space} size={22} />} title={tr(`Nothing in ${space.name} yet`)}>
          <span className="block">What agents save in this space’s sessions lands here. To bring in something you have, use its More → Move to a space.</span>
          <span className="mt-3 inline-flex gap-2">
            <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setMaking('page')}>
              New page here
            </Button>
          </span>
        </Empty>
      ) : (
        <Empty icon={<Boxes size={22} />} title="Everything is in a space">
          Things you keep outside any space show here.
        </Empty>
      );
    if (!shown.length)
      return <p className="py-8 text-center text-[13px] text-fg-3">{words ? tr(`Nothing here has “${find.trim()}” in its name.`) : 'Nothing of that kind here.'}</p>;
    if (sections)
      return (
        <div className="space-y-9">
          {sections.map((s) => (
            <SpaceSection key={s.space?.id ?? 'none'} space={s.space} items={s.items} onAll={() => toPlace(s.space ? { kind: 'space', id: s.space.id } : { kind: 'none' })} />
          ))}
        </div>
      );
    return <Grid items={shown} showSpace={place.kind === 'all'} />;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Library"
        tip="library"
        sub="What agents made for you and what you kept: pages, slides, documents, pictures and videos, by space"
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
      <div className="flex min-h-0 flex-1">
        {wide && items && (
          <aside className="w-[232px] shrink-0 overflow-y-auto border-r border-line px-3 py-4">
            <Places place={place} onPlace={toPlace} items={items} sites={sites} />
          </aside>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1180px] px-3 py-4 sm:px-6 sm:py-5">
            {!wide && items && <Places chips place={place} onPlace={toPlace} items={items} sites={sites} />}
            {place.kind !== 'published' && !!here.length && (
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2.5">
                {wide && (
                  <h2 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold tracking-tight">
                    {space && <SpaceMark s={space} size={22} className="rounded-md" />}
                    <span translate={space ? 'no' : undefined} className="truncate">
                      {title}
                    </span>
                  </h2>
                )}
                {space && wide && (
                  <button type="button" onClick={() => go(`/spaces/${space.id}`)} className="text-[12.5px] font-medium text-fg-3 hover:text-fg">
                    Open the space
                  </button>
                )}
                <span className="flex-1 max-lg:hidden" />
                <label className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 lg:max-w-[280px]">
                  <Search size={14} className="shrink-0 text-fg-3" />
                  <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find by name" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3" />
                  {find && (
                    <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
                      <X size={13} />
                    </button>
                  )}
                </label>
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
                        onClick={() => go(addressOf(place, k.value), true)}
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
      </div>
      <PublishDialog open={publish} onClose={() => setPublish(false)} />
      <NewPageDialog open={!!making} kind={making ?? 'page'} space={space?.id ?? null} onClose={() => setMaking(null)} />
    </div>
  );
}

// ---- a space's own Library -------------------------------------------------------------------------------------

/** What a space holds in the Library, for its own page: the last changed first, with New (made in the space). */
/**
 * What a space holds in the Library (its page's Overview and Library tab): the cards, the last changed first, or with
 * nothing yet what will be here and New page and New slides. `framed`: false inside a card of its own.
 */
export function SpaceLibrary({ space, limit, framed = true }: { space: SpaceView; limit?: number; framed?: boolean }) {
  const items = useItems();
  const [making, setMaking] = useState<NewKind | null>(null);
  useEffect(() => {
    if (!usePagesStore.getState().pages) usePagesStore.getState().loadPages().catch(toastError);
    useMedia.getState().ensure();
  }, []);
  const mine = (items ?? []).filter((it) => it.space === space.id);
  const shown = limit ? mine.slice(0, limit) : mine;
  return (
    <>
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
          <span className="mt-1 block max-w-[440px]">Pages, slides and documents agents save in this space’s sessions land here, and so does what you keep from them.</span>
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
          <Button size="sm" variant="ghost" onClick={() => go(`/library?space=${space.id}`)}>
            {tr(`See all ${mine.length} in the Library`)}
            <ArrowRight size={13} className="ml-1" />
          </Button>
        </div>
      )}
      <NewPageDialog open={!!making} kind={making ?? 'page'} space={space.id} onClose={() => setMaking(null)} />
    </>
  );
}

/** How many things a space holds in the Library (null until known). */
export function useSpaceItemCount(id: string): number | null {
  const items = useItems();
  return items ? items.filter((it) => it.space === id).length : null;
}

