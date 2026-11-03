// The Files page. On the left, the places: the files opened lately, home, the folders you pinned, your spaces'
// folders, the folders sessions worked in, and the trash. On the right, the folder you are in (FolderView), a
// search of names and text inside files, the recent files or the trash; files open in tabs above it, the
// first tab going back to the folder. On a phone the folder fills the screen, the places are a sheet from the
// page's title, and a file opens on a page of its own. Each folder has an address of its own (/files?dir=),
// so Back goes to the folder you were in.
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSearch } from 'wouter';
import { ChevronDown, Clock, FileText, Folder, House, NotebookText, Search, Sheet, Sigma, Trash2, X } from 'lucide-react';
import { editorKindOf } from '@shared/documents';
import { api } from '../../lib/api';
import { basename } from '../../lib/format';
import { filePath, go, showInFiles } from '../../lib/nav';
import { useApp, useUI } from '../../lib/store';
import { FolderFinder } from '../../components/FolderPicker';
import { cx, Throbber, IconButton, MenuBack, Popover, SheetsOnPhone, useIsMobile, useMediaQuery } from '../../components/ui';
import { rememberFilesPlace, SystemHeader } from '../system/SystemHeader';
import { goFolder } from './actions';
import { FileAskButton, FileAskPanel, FileAskPill, useFileAsk } from './FileAsk';
import { FileEditor } from './FileEditor';
import { FileInEditor } from './FileInEditor';
import { FolderView } from './FolderView';
import { useFolderLead } from './ItemMenu';
import { Places, type Place } from './Places';
import { noteOpened } from './prefs';
import { searchFromUrl, searchUrl, SearchView } from './SearchView';
import { RecentView, TrashView } from './TrashView';

const NotebookView = lazy(() => import('../notebook/NotebookView'));

/** The editors files open in, by kind: what the button back to one says, and its icon. */
const IN_EDITOR = {
  doc: { label: 'Open in the document editor', icon: <FileText size={14} /> },
  sheet: { label: 'Open in the spreadsheet editor', icon: <Sheet size={14} /> },
  tex: { label: 'Open in the LaTeX editor', icon: <Sigma size={14} /> },
};

/**
 * A file: notebooks open as notebooks (with their JSON a click away); Word, Excel, CSV and LaTeX files in the editor of
 * their kind (their text or preview a click away); everything else in the text editor, or as a preview or a picture.
 * `embedded`: in a dialog over another page (FilePeek), showing documents as they look first. A file opened at a line
 * (a search's match) shows as text, at that line.
 */
export function FileView({ path, line, embedded, onDirty }: { path: string; line?: number; embedded?: boolean; onDirty?: (dirty: boolean) => void }) {
  const saveFirst = useRef<(() => Promise<boolean>) | null>(null);
  const wide = useMediaQuery('(min-width: 1100px)');
  const ask = useFileAsk();
  if (embedded) return <FileBody path={path} line={line} embedded onDirty={onDirty} />;
  // Ask an agent about the file: beside it on a wide screen, over it otherwise (folding away to watch it change).
  const panel = ask.open && <FileAskPanel path={path} beforeSend={() => saveFirst.current?.() ?? Promise.resolve(true)} className={wide ? 'w-[400px] shrink-0 border-l border-line' : undefined} />;
  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1">
        <FileBody path={path} line={line} onDirty={onDirty} saveFirst={saveFirst} />
      </div>
      {wide && panel}
      {!wide && !ask.folded && panel && createPortal(<div className="fixed inset-0 z-50 flex flex-col bg-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)]">{panel}</div>, document.body)}
      {!wide && ask.open && ask.folded && <FileAskPill path={path} />}
    </div>
  );
}

/** The file itself; `saveFirst` (the Files page, not a dialog) brings the Ask button. */
function FileBody({
  path,
  line,
  embedded,
  onDirty,
  saveFirst,
}: {
  path: string;
  line?: number;
  embedded?: boolean;
  onDirty?: (dirty: boolean) => void;
  saveFirst?: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const notebook = path.endsWith('.ipynb');
  const askButton = saveFirst && <FileAskButton />;
  const [source, setSource] = useState(false);
  const kind = editorKindOf(path);
  const [asText, setAsText] = useState(() => !!line);
  if (kind && !asText) return <FileInEditor path={path} embedded={embedded} onDirty={onDirty} fileMenu={!embedded} onText={() => setAsText(true)} actions={askButton} saveFirst={saveFirst} />;
  if (notebook && !source) {
    return (
      <Suspense
        fallback={
          <div className="flex h-full items-center justify-center text-fg-3">
            <Throbber size={34} />
          </div>
        }
      >
        <NotebookView path={path} onSource={() => setSource(true)} embedded={embedded} onDirty={onDirty} />
      </Suspense>
    );
  }
  return (
    <FileEditor
      path={path}
      line={line}
      embedded={embedded}
      preview={embedded}
      onDirty={onDirty}
      fileMenu={!embedded}
      saveFirst={saveFirst}
      actions={
        <>
          {notebook ? (
            <IconButton label="Open as a notebook" size="sm" onClick={() => setSource(false)}>
              <NotebookText size={14} />
            </IconButton>
          ) : (
            kind && (
              <IconButton label={IN_EDITOR[kind].label} size="sm" onClick={() => setAsText(false)}>
                {IN_EDITOR[kind].icon}
              </IconButton>
            )
          )}
          {askButton}
        </>
      }
    />
  );
}

// The place last shown (a folder, a search…), which the first tab goes back to, and how that tab shows it.
let lastPlace = '/files';
let lastHere: { icon: ReactNode; label: string } | null = null;

/** Open files as tabs, after the place they were opened from. */
function FileTabs({ current, place }: { current: string | null; place: { icon: ReactNode; label: string } }) {
  const tabs = useUI((s) => s.tabs).filter((t) => t.kind === 'file');
  if (!tabs.length) return null;
  const tab = 'group flex h-8.5 max-w-[220px] min-w-0 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-lg border border-b-0 text-[13px] transition-colors';
  return (
    <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-line px-2 [&::-webkit-scrollbar]:hidden">
      <div onClick={() => go(lastPlace)} title="Back to the folder" className={cx(tab, 'px-3', !current ? 'border-line bg-bg text-fg' : 'border-transparent text-fg-3 hover:text-fg-2')}>
        <span className="shrink-0 text-fg-3">{place.icon}</span>
        <span translate="no" className="min-w-0 truncate">
          {place.label}
        </span>
      </div>
      <span className="mb-2 h-4 w-px shrink-0 self-end bg-line" />
      {tabs.map((t) => {
        const active = t.ref === current;
        return (
          <div
            key={t.id}
            onClick={() => go(filePath(t.ref))}
            onAuxClick={(e) => e.button === 1 && useUI.getState().closeTab(t.id)}
            title={t.ref}
            className={cx(tab, 'pr-1 pl-3', active ? 'border-line bg-bg text-fg' : 'border-transparent text-fg-3 hover:text-fg-2')}
          >
            <FileText size={14} className="shrink-0" />
            <span translate="no" className="min-w-0 truncate">
              {basename(t.ref)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                useUI.getState().closeTab(t.id);
                if (active) {
                  const rest = useUI.getState().tabs.filter((x) => x.kind === 'file');
                  go(rest.length ? filePath(rest[rest.length - 1].ref) : lastPlace);
                }
              }}
              className={cx('flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md hover:bg-bg-3', active ? 'opacity-70' : 'opacity-0 group-hover:opacity-100')}
              aria-label="Close file"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function FilesPage({ path, line, search }: { path: string | null; line?: number; search?: boolean }) {
  const mobile = useIsMobile();
  const boot = useApp((s) => s.boot);
  const home = boot?.home ?? '/';
  const root = useUI((s) => s.explorerRoot) ?? boot?.defaultCwd ?? home;
  const qs = useSearch();
  const params = new URLSearchParams(qs);
  const placeParam = params.get('place');
  const place: Place = search ? 'search' : placeParam === 'trash' ? 'trash' : placeParam === 'recent' ? 'recent' : 'folder';
  const dir = (params.get('dir') || root).replace(/(.)\/+$/, '$1');
  const query = searchFromUrl(params, root);
  // The places (a sheet on a phone), and Go to a folder: in the sheet's place on a phone, by its row elsewhere.
  const [places, setPlaces] = useState<false | 'places' | 'find'>(false);
  const titleRef = useRef<HTMLButtonElement>(null);
  const findAt = useRef<HTMLElement | null>(null);
  const [finding, setFinding] = useState(false);
  const lead = useFolderLead((p) => (setFinding(false), onDir(p)), dir);
  // Too narrow for the places' column beside the folder (a small window, the sidebar open): they fold into the title.
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    setPageWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setPageWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [mobile]);
  const fold = !mobile && pageWidth > 0 && pageWidth < 840;

  // The folder shown is the one the rest of the app means by "the folder open in Files".
  useEffect(() => {
    if (!path && place === 'folder' && dir !== useUI.getState().explorerRoot) useUI.getState().set({ explorerRoot: dir });
  }, [dir, place, path]);
  useEffect(() => {
    if (!path) {
      lastPlace = `${location.pathname.replace(/^\/m\/[^/]+/, '')}${qs ? `?${qs}` : ''}`;
      rememberFilesPlace(lastPlace);
    }
  }, [path, qs]);

  // A file opened joins the recent ones; a folder given as a file opens as the folder.
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<{ exists: boolean; dir?: boolean }>(`/api/fs/stat?path=${encodeURIComponent(path)}`).then(
      (st) => {
        if (!alive) return;
        if (st.dir) {
          useUI.getState().closeTab(`f:${path}`);
          goFolder(path, undefined, true);
        } else if (st.exists) noteOpened(path);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [path]);

  function onDir(d: string) {
    setPlaces(false);
    goFolder(d);
  }
  const onPlace = (p: 'recent' | 'trash') => (setPlaces(false), go(`/files?place=${p}`));
  const finder = <FolderFinder value={place === 'folder' ? dir : null} onPick={(p) => (setFinding(false), onDir(p))} lead={lead} autoFocus anchor={mobile || fold ? titleRef : findAt} />;
  const onFile = (p: string, l?: number) => showInFiles(p, l);
  const shown =
    place === 'search'
      ? { icon: <Search size={14} />, label: 'Search' }
      : place === 'recent'
        ? { icon: <Clock size={14} />, label: 'Recent files' }
        : place === 'trash'
          ? { icon: <Trash2 size={14} />, label: 'Trash' }
          : { icon: dir === home ? <House size={14} /> : <Folder size={14} />, label: dir === home ? 'Home folder' : basename(dir) || dir };
  if (!path) lastHere = shown;
  const here = path && lastHere ? lastHere : shown;

  const main =
    place === 'search' ? (
      <SearchView query={query} onFile={onFile} />
    ) : place === 'trash' ? (
      <TrashView />
    ) : place === 'recent' ? (
      <RecentView onFile={(p) => onFile(p)} />
    ) : (
      <FolderView dir={dir} onDir={onDir} select={params.get('sel')} onFile={(p) => onFile(p)} onSearch={(q) => go(searchUrl({ q, in: dir }))} />
    );
  const placesList = (
    <Places
      place={place}
      dir={dir}
      onDir={onDir}
      onPlace={onPlace}
      onFind={(el) => {
        if (mobile || fold) return setPlaces('find');
        findAt.current = el;
        setFinding((o) => !o);
      }}
    />
  );

  // The places as a menu from the title: on a phone (a sheet), and in a window too narrow for their column.
  const title = (
    <button
      ref={titleRef}
      type="button"
      onClick={() => setPlaces((o) => (o ? false : 'places'))}
      className="-ml-1 flex max-w-full min-w-0 items-center gap-1 rounded-lg px-1 text-left hover:bg-bg-2 active:bg-bg-2"
      aria-label="Places"
    >
      <span translate="no" className="truncate">
        {here.label}
      </span>
      <ChevronDown size={15} className="shrink-0 text-fg-3" />
    </button>
  );
  const placesMenu = (
    <Popover anchor={titleRef} open={!!places} onClose={() => setPlaces(false)} width={places === 'find' ? 340 : 260} title={places === 'find' ? 'Go to a folder' : 'Places'}>
      {places === 'find' ? (
        <>
          <MenuBack onClick={() => setPlaces('places')}>Places</MenuBack>
          {finder}
        </>
      ) : (
        placesList
      )}
    </Popover>
  );

  if (mobile) {
    if (path) return <FileView key={path} path={path} line={line} />;
    return (
      <SheetsOnPhone.Provider value>
        <div className="flex h-full min-h-0 flex-col">
          <SystemHeader tab="files" actions={title} />
          <div className="min-h-0 flex-1">{main}</div>
          {placesMenu}
        </div>
      </SheetsOnPhone.Provider>
    );
  }

  return (
    <div ref={pageRef} className="flex h-full min-h-0 flex-col">
      <SystemHeader tab="files" actions={fold ? title : undefined} />
      <div className="flex min-h-0 flex-1">
        {!fold && (
          <nav aria-label="Places" className="w-[232px] shrink-0 overflow-y-auto border-r border-line bg-bg-1">
            {placesList}
            <Popover anchor={findAt} open={finding} onClose={() => setFinding(false)} width={340}>
              {finder}
            </Popover>
          </nav>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <FileTabs current={path} place={here} />
          <div className="min-h-0 flex-1">{path ? <FileView key={path} path={path} line={line} /> : main}</div>
        </div>
      </div>
      {fold && placesMenu}
    </div>
  );
}
