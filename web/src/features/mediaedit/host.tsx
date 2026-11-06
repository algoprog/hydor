// The picture and video editors, each in a tab of its own inside the app, opened from anywhere with openEditor (a
// slide's, a document's or a page's picture, the Library, Files, any picture shown full size). While one is open a
// slim strip of tabs shows at the top of the main area: first the page you were on, then a tab for each editor
// ("Picture · boat.jpg"), each closed with its ×, which asks first when its changes are not saved. The page stays as it
// was under its tab (hidden, not closed), so a deck's unsaved changes, its selection and its undo are all there when
// you come back. On a phone an editor takes the whole screen, with an arrow back to the page and, with more than one
// open, a switcher. Each kind of editor is loaded the first time one is opened (EDITORS).
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { ArrowLeft, Clapperboard, Copy, Image as ImageIcon, PanelTop, X } from 'lucide-react';
import { create } from 'zustand';
import type { EditKind, Saved, SaveTo } from '@shared/mediaedit';
import { useLocation } from 'wouter';
import { cx, IconButton, MenuItem, MenuSep, Popover, Throbber, useConfirm, useIsMobile } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { useSessions } from '../../lib/store';

export interface OpenEditor {
  kind: EditKind;
  /**
   * The picture or video: one the app keeps ("naget-asset:…", "naget-video:…"), a Library item's file
   * (/api/media/<id>/file), a file's path, or an https or data: address.
   */
  src: string;
  /** Its name, for its tab ("boat.jpg"). */
  title: string;
  /** Where it was opened from: the first tab's name (the deck's), and what showing that page again takes, if anything. */
  from: { label: string; back?: () => void };
  /**
   * Where Save writes the result: a picture kept for a deck, document or page; over a Library item; over a file (or,
   * when its kind of file changes, a copy beside it). None: Save keeps it in the Library as a new item.
   */
  to?: SaveTo;
  /** What to do with the result: put it back where it came from. Called after the editor wrote it where `to` says. */
  save: (r: Saved) => Promise<void> | void;
  /** Offer "Save a copy" (to the Library; for a file, beside it). */
  copy?: boolean;
  /** The session it is from (a video of the conversation): a copy kept in the Library is noted as from it. */
  session?: string;
}

export interface EditorHandle {
  id: string;
  /** Closes its tab, whatever it holds. */
  close(): void;
  /** The page it came from is gone (a deck closed): its Save keeps the result in the Library instead. */
  detach(): void;
}

/** What each editor is given by its tab. */
export interface EditorProps {
  o: OpenEditor;
  /** Its tab shows (the page and the other tabs are hidden): only then does it take keys. */
  active: boolean;
  /** The page it came from is gone: Save keeps the result in the Library. */
  detached: boolean;
  /** Changes not saved: closing the tab asks first. */
  setDirty(dirty: boolean): void;
  /** Hands the result to where it came from (`o.save`), then closes the tab and shows that page again. */
  done(r: Saved): Promise<void>;
  /** Closes the tab, asking first when there are changes not saved. */
  close(): void;
  /** On a phone, the way back to the page and the switcher, for the start of its own top bar; null where the strip shows. */
  lead: ReactNode | null;
}

/** The editor of each kind, loaded the first time one is opened. */
const EDITORS: Partial<Record<EditKind, LazyExoticComponent<ComponentType<EditorProps>>>> = {
  image: lazy(() => import('./ImageEditor').then((m) => ({ default: m.ImageEditor }))),
  video: lazy(() => import('./VideoEditor').then((m) => ({ default: m.VideoEditor }))),
};

interface Tab {
  id: string;
  o: OpenEditor;
  dirty: boolean;
  detached: boolean;
  /** The address it was opened at: the page tab is named by the editors opened there. */
  at: string;
}

const useTabs = create<{ tabs: Tab[]; active: string | null }>(() => ({ tabs: [], active: null }));

let next = 0;

/** Opens an editor in a tab of its own (the one already open for the same picture, if there is one), and shows it. */
export function openEditor(o: OpenEditor): EditorHandle {
  const s = useTabs.getState();
  const same = s.tabs.find((t) => t.o.kind === o.kind && t.o.src === o.src && JSON.stringify(t.o.to ?? null) === JSON.stringify(o.to ?? null) && !t.detached);
  const id = same?.id ?? `ed${++next}`;
  if (same) useTabs.setState({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, o } : t)), active: id });
  else useTabs.setState({ tabs: [...s.tabs, { id, o, dirty: false, detached: false, at: location.pathname + location.search }], active: id });
  return {
    id,
    close: () => drop(id),
    detach: () => useTabs.setState((x) => ({ tabs: x.tabs.map((t) => (t.id === id ? { ...t, detached: true } : t)) })),
  };
}

/** Whether an editor is open (the page's own keys might wait while one shows). */
export const editorShowing = () => !!useTabs.getState().active;

function drop(id: string) {
  useTabs.setState((x) => ({ tabs: x.tabs.filter((t) => t.id !== id), active: x.active === id ? null : x.active }));
}

const setTab = (id: string, p: Partial<Tab>) => useTabs.setState((x) => ({ tabs: x.tabs.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

/**
 * What an editor's keys may leave to the app as it goes on (the search box, the sidebar, the terminal), all others kept
 * from the page under it, which still listens for its own (a deck's Delete and Ctrl+Z). Call it on an editor's keydown.
 */
export function keepKeys(e: React.KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  // Escape goes on too: the menus an editor opens close on it.
  if (k === 'escape' || (mod && !e.shiftKey && !e.altKey && (k === 'k' || k === 'b' || k === '`'))) return;
  e.stopPropagation();
}

/** A name for the page an editor opens from, when its opener does not know one: the session's title, the Library, Files. */
export function pageName(): string {
  const p = location.pathname.replace(/^\/m\/[a-z0-9-]{1,40}(?=\/)/, '');
  const s = /^\/s\/([^/]+)$/.exec(p);
  if (s) return useSessions.getState().byKey[decodeURIComponent(s[1])]?.title || tr('The session');
  if (p.startsWith('/library') || p.startsWith('/media/')) return tr('Library');
  if (p === '/files' || p === '/file' || p === '/search') return tr('Files');
  if (p.startsWith('/apps')) return tr('Apps');
  return tr('Back');
}

const kindWord = (k: EditKind) => (k === 'video' ? 'Video' : 'Picture');

function TabName({ t }: { t: Tab }) {
  // A picture with no name of its own is simply "Picture".
  if (!t.o.title || t.o.title === kindWord(t.o.kind)) return <span className="min-w-0 truncate">{kindWord(t.o.kind)}</span>;
  return (
    <>
      <span className="shrink-0">{kindWord(t.o.kind)} · </span>
      <span translate="no" className="min-w-0 truncate">
        {t.o.title}
      </span>
    </>
  );
}

/**
 * Around the app's pages (Shell): the tabs, the page, and each open editor. The page stays built under its tab, only
 * hidden, so nothing of it is lost while an editor shows.
 */
export function EditorHost({ children }: { children: ReactNode }) {
  const { tabs, active } = useTabs();
  const mobile = useIsMobile();
  const [loc] = useLocation();
  const [confirm, confirmNode] = useConfirm();
  const showing = tabs.some((t) => t.id === active) ? active : null;
  // Moving to another page shows it: an editor stays open in its tab.
  const where = useRef(loc);
  useEffect(() => {
    if (where.current === loc) return;
    where.current = loc;
    if (useTabs.getState().active) useTabs.setState({ active: null });
  }, [loc]);
  // Leaving the app with changes not saved asks first.
  const dirty = tabs.some((t) => t.dirty);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const here = location.pathname + location.search;
  const opener = [...tabs].reverse().find((t) => t.at === here);
  const label = opener?.o.from.label || pageName();
  const showPage = () => {
    useTabs.setState({ active: null });
    opener?.o.from.back?.();
  };
  const close = async (t: Tab) => {
    if (t.dirty) {
      const ok = await confirm({ title: `Close “${t.o.title}” without saving?`, body: 'Your changes to it are not saved.', confirm: 'Close without saving', danger: true });
      if (!ok) return;
    }
    drop(t.id);
  };

  const strip = tabs.length > 0 && !(mobile && showing);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {strip && (
        <div role="tablist" aria-label="Open editors" className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b border-line bg-bg-1 px-2 pt-[var(--safe-top)] [&::-webkit-scrollbar]:hidden">
          <StripTab active={!showing} onClick={showPage} icon={<PanelTop size={13} />}>
            <span translate="no" className="min-w-0 truncate">
              {label}
            </span>
          </StripTab>
          {tabs.map((t) => (
            <StripTab
              key={t.id}
              active={t.id === showing}
              onClick={() => useTabs.setState({ active: t.id })}
              icon={t.o.kind === 'video' ? <Clapperboard size={13} /> : <ImageIcon size={13} />}
              dirty={t.dirty}
              onClose={() => void close(t)}
              closeLabel={`Close “${t.o.title}”`}
            >
              <TabName t={t} />
            </StripTab>
          ))}
        </div>
      )}
      {/*
        The page and the editors, one over the other, each the area's whole size: what does not show is unseen and out of
        reach (inert), but laid out as it was, so the page keeps its scroll, its sizes and everything open in it. The page's
        safe area above is the strip's on a phone.
      */}
      <div className="relative min-h-0 flex-1">
        <div className={cx('absolute inset-0', showing && 'invisible')} inert={!!showing} style={strip ? ({ '--safe-top': '0px' } as React.CSSProperties) : undefined}>
          {children}
        </div>
        {tabs.map((t) => {
          const Editor = EDITORS[t.o.kind];
          const on = t.id === showing;
          const lead = mobile ? <PhoneLead t={t} tabs={tabs} label={label} onPage={showPage} onClose={(x) => void close(x)} /> : null;
          return (
            <div key={t.id} className={cx('absolute inset-0', !on && 'invisible')} inert={!on}>
              {Editor ? (
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-fg-3">
                      <Throbber size={28} />
                    </div>
                  }
                >
                  <Editor
                    o={t.o}
                    active={on}
                    detached={t.detached}
                    setDirty={(d) => void (t.dirty !== d && setTab(t.id, { dirty: d }))}
                    done={async (r) => {
                      await t.o.save(r);
                      drop(t.id);
                      if (!t.detached) t.o.from.back?.();
                    }}
                    close={() => void close(t)}
                    lead={lead}
                  />
                </Suspense>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13.5px] text-fg-3">
                  {lead}
                  That editor is not here yet.
                </div>
              )}
            </div>
          );
        })}
      </div>
      {confirmNode}
    </div>
  );
}

function StripTab({ active, onClick, icon, children, dirty, onClose, closeLabel }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode; dirty?: boolean; onClose?: () => void; closeLabel?: string }) {
  return (
    <div
      role="tab"
      aria-selected={active}
      className={cx(
        'group relative -mb-px flex h-8 max-w-[15rem] min-w-0 shrink-0 items-center gap-1.5 rounded-t-lg border border-b-0 pr-1 pl-2.5 text-[12.5px]',
        active ? 'border-line bg-bg text-fg' : 'border-transparent text-fg-3 hover:bg-bg-2 hover:text-fg',
        !onClose && 'pr-3',
      )}
    >
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-1.5 text-left outline-none">
        <span className="shrink-0 opacity-80">{icon}</span>
        {children}
      </button>
      {onClose && (
        <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="relative flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-md text-fg-3 hover:bg-bg-3 hover:text-fg">
          {/* Changes not saved: a dot, which shows the × when the pointer is over it. */}
          {dirty && <span className="absolute h-2 w-2 rounded-full bg-accent group-hover:hidden" />}
          <X size={13} className={cx(dirty && 'invisible group-hover:visible')} />
        </button>
      )}
    </div>
  );
}

/** A phone's way back to the page, and with several editors open, a switcher. */
function PhoneLead({ t, tabs, label, onPage, onClose }: { t: Tab; tabs: Tab[]; label: string; onPage: () => void; onClose: (t: Tab) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton label={`Back to “${label}”`} onClick={onPage}>
        <ArrowLeft size={18} />
      </IconButton>
      {tabs.length > 1 && (
        <>
          <button
            ref={ref}
            type="button"
            onClick={() => setOpen((x) => !x)}
            aria-label="Open editors"
            title="Open editors"
            className={cx('tnum flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-lg border border-line-2 px-1.5 text-[12px] font-medium text-fg-2', open && 'bg-bg-2 text-fg')}
          >
            <Copy size={12} />
            {tabs.length}
          </button>
          <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={280} title="Open editors">
            <MenuItem icon={<PanelTop size={14} />} onClick={() => (setOpen(false), onPage())}>
              <span translate="no">{label}</span>
            </MenuItem>
            <MenuSep />
            {tabs.map((x) => (
              <div key={x.id} className="flex items-center gap-0.5">
                <div className="min-w-0 flex-1">
                  <MenuItem icon={x.o.kind === 'video' ? <Clapperboard size={14} /> : <ImageIcon size={14} />} checked={x.id === t.id} onClick={() => (setOpen(false), useTabs.setState({ active: x.id }))}>
                    <span className="flex min-w-0">
                      <TabName t={x} />
                    </span>
                  </MenuItem>
                </div>
                <IconButton label={`Close “${x.o.title}”`} size="sm" onClick={() => (setOpen(false), onClose(x))}>
                  <X size={14} />
                </IconButton>
              </div>
            ))}
          </Popover>
        </>
      )}
    </>
  );
}
