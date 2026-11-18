// The Browser page (/browser): a browser of your own, part of the desktop app. A bar across the top (the tabs' controls on
// the left over their column; back, forward, reload and the box, which searches, opens, asks and tells an agent what to
// do; Save to the Library, Ask, extensions and the menu on the right), under it three columns: your tabs (with the sites
// you pinned and the agents at work), the page, and, when something is in it, a right column: Ask about the page, an
// agent's conversation while you watch its browser, or history, downloads, bookmarks, extensions, site permissions and
// settings. Everything lasting sits beside the page, never over it (the page is the desktop app's own native view). The
// pages are the pages themselves (PageView draws them natively). Elsewhere the page says it is part of the desktop app
// and starts nothing; the agents' browsers keep their live picture in sessions.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Wordmark } from '../../components/Logo';
import { useSearch } from 'wouter';
import type { BrowserView } from '@shared/browser';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Clock,
  Download,
  Ellipsis,
  ExternalLink,
  FileDown,
  Globe,
  History,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Puzzle,
  RotateCw,
  Search,
  Settings,
  ShieldQuestion,
  Sparkles,
  Star,
  WandSparkles,
  X,
} from 'lucide-react';
import { tr } from '../../i18n/runtime';
import { enc, post } from '../../lib/api';
import { MOD } from '../../lib/format';
import { go } from '../../lib/nav';
import { canReveal, revealLabel } from '../../lib/reveal';
import { toastError, useToasts, useUI } from '../../lib/store';
import { Button, cx, Empty, IconButton, Kbd, MenuItem, MenuSep, Popover, Sheet, Throbber, useIsMobile } from '../../components/ui';
import { live as socket } from '../../lib/ws';
import { useAskRun } from '../guide/ask';
import { NavButton } from '../layout/PageHeader';
import { useNavWidth } from '../layout/SideColumn';
import { AgentBody, AgentDialog, useAgentsRefresh } from './AgentTabs';
import { AgentBar, AgentBox, AgentConversation } from './AgentView';
import { askAboutTab, BrowserAskPanel, pickForAsk } from './BrowserAsk';
import { toggleBookmark } from './BookmarkBar';
import { BookmarksPanel } from './Bookmarks';
import { keepPicture } from './pictures';
import { SaveButton, useSavePlace } from './SaveButton';
import {
  activeTab,
  addBookmark,
  addLater,
  groupWithAi,
  useGrouping,
  addFromStore,
  answerPermission,
  closeTab,
  isNative,
  isWebPage,
  KEY,
  listenTabs,
  loadAgentBrowsers,
  loadBookmarks,
  loadExtensions,
  loadPrefs,
  navigate,
  newTab,
  openBrowsing,
  ownBrowserHere,
  permissionWords,
  reopenClosed,
  storePage,
  switchTab,
  useBookmarks,
  desktopBrowser,
  goTo,
  showDownload,
  usePrefs,
} from './browsing';
import { BrowserSettingsPanel } from './BrowserSettings';
import { ExtensionButtons, ExtensionsPanel } from './Extensions';
import { FindBar } from './FindBar';
import { HandOffPopover, startDo } from './HandOff';
import { HistoryPanel } from './History';
import { Omnibox } from './Omnibox';
import { KeyRow } from './Dock';
import type { LiveViewApi } from './LiveView';
import { Panel } from './Panel';
import { PermissionsPanel } from './Permissions';
import { PageView } from './PageView';
import { TabColumn } from './TabColumn';
import { SlideColumn } from '../../components/SlideColumn';
import { TabMenu } from './TabStrip';
import { hostOf, listenBrowser, loadBrowser, useBrowser } from './store';

type PanelId = 'bookmarks' | 'extensions' | 'downloads' | 'permissions' | 'history' | 'settings';
const isPanel = (v: unknown): v is PanelId => v === 'bookmarks' || v === 'extensions' || v === 'downloads' || v === 'permissions' || v === 'history' || v === 'settings';

/** A site asks for something (camera, location…): Don’t allow or Allow, in a row above the page. */
function PermissionBar({ view }: { view: BrowserView }) {
  const p = view.permission;
  const [busy, setBusy] = useState(false);
  if (!p) return null;
  const answer = async (allow: boolean) => {
    setBusy(true);
    await answerPermission(p.id, allow);
    setBusy(false);
  };
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-warn/8 px-3 py-2">
      <ShieldQuestion size={16} className="shrink-0 text-warn" />
      <div className="min-w-[min(100%,220px)] flex-1 text-[13.5px] leading-snug">
        <span translate="no" className="font-medium">
          {hostOf(p.origin) || p.origin}
        </span>{' '}
        wants {permissionWords(p)}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void answer(false)}>
          Don’t allow
        </Button>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void answer(true)}>
          Allow
        </Button>
      </div>
    </div>
  );
}

/** Files the browser saved lately. */
function DownloadsPanel({ onClose }: { onClose: () => void }) {
  const downloads = useBrowser((s) => s.views[KEY]?.downloads) ?? [];
  return (
    <Panel title="Downloads" onClose={onClose}>
      {!downloads.length && <div className="px-4 py-3 text-[12.5px] leading-relaxed text-fg-3">Nothing downloaded yet. Files you save from a page go to your Downloads folder.</div>}
      {downloads.map((d) => (
        <button key={`${d.path}${d.at}`} disabled={!d.done || d.failed} title={d.done && !d.failed && canReveal() ? revealLabel() : undefined} onClick={() => showDownload(d.path)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left enabled:hover:bg-bg-2">
          <FileDown size={16} className="shrink-0 text-fg-3" />
          <span className="min-w-0 flex-1">
            <span translate="no" className="block truncate text-[13.5px]">
              {d.name}
            </span>
            <span className={cx('block text-[12px]', d.failed ? 'text-err' : 'text-fg-3')}>{d.failed ? 'Failed' : d.done ? 'Done' : 'Downloading…'}</span>
            <span translate="no" className="block truncate text-[11.5px] text-fg-3">
              {d.path}
            </span>
          </span>
        </button>
      ))}
    </Panel>
  );
}

/**
 * The page has no header, so the toolbar holds the way back to a hidden sidebar (the drawer's on a phone-sized window);
 * the screens without a toolbar (starting, failed to start, not in this app) keep it in their top left corner instead.
 */
function SidebarCorner() {
  return (
    <div className="absolute left-2 top-[calc(var(--safe-top)+8px)]">
      <NavButton />
    </div>
  );
}

/** Where your own browser is not (a web page, another machine's pages): it is part of the desktop app, and nothing here starts it. */
function NotHere() {
  return (
    <div className="relative flex h-full items-center justify-center p-6">
      <SidebarCorner />
      <Empty icon={<Globe size={20} />} title="Your own browser is part of the desktop app">
        Browse the web with tabs, bookmarks, extensions and history in Hydor’s desktop app. The agents’ browsers still work everywhere: you can watch them in their sessions.
        <div className="mt-4 flex justify-center">
          <Button size="sm" variant="primary" onClick={() => go('/guide/web#your-own-browser')}>
            Read how it works
          </Button>
        </div>
      </Empty>
    </div>
  );
}

export function BrowserPage() {
  return ownBrowserHere() ? <OwnBrowser /> : <NotHere />;
}

/** The tab column's top bar part: the app's logo, a new tab, and the fold of the column (Ctrl+B). */
function BarLead({ open }: { open: boolean }) {
  // Over the tab column, as wide as it (every column's width).
  const { width } = useNavWidth();
  return (
    <div className={cx('flex h-full shrink-0 items-center gap-0.5 border-r border-line pr-2', open ? 'pl-3.5' : 'pl-2')} style={open ? { width } : undefined}>
      {open && (
        <>
          {/* The rail names the section: the column shows the app's logo, as every column does. */}
          <h1 className="sr-only">Browser</h1>
          <span className="flex min-w-0 flex-1 items-center pl-0.5 text-fg">
            <Wordmark height={16} tide />
          </span>
        </>
      )}
      <IconButton label={`New tab (${MOD}T)`} onClick={() => void newTab()}>
        <Plus size={17} />
      </IconButton>
      <IconButton label={open ? `Hide tabs (${MOD}B)` : `Show tabs (${MOD}B)`} onClick={() => useUI.getState().set({ sideOpen: !open })}>
        {open ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
      </IconButton>
    </div>
  );
}

function OwnBrowser() {
  const mobile = useIsMobile();
  const search = useSearch();
  const view = useBrowser((s) => s.views[KEY]);
  const nodes = useBookmarks((s) => s.nodes);
  const sideOpen = useUI((s) => s.sideOpen);
  const run = useAskRun();
  const [error, setError] = useState<string | null>(null);
  // What the right column shows, besides an agent's conversation: a panel, or Ask about the page.
  const [panel, setPanel] = useState<PanelId | null>(() => {
    const p = new URLSearchParams(search).get('panel');
    return isPanel(p) ? p : null;
  });
  const [askOpen, setAskOpen] = useState(false);
  // An agent's browser shown in the page's place, with its conversation in the right column.
  const [watching, setWatching] = useState<string | null>(null);
  const [find, setFind] = useState(false);
  const [findTick, setFindTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const grouping = useGrouping((s) => s.busy);
  const [doOpen, setDoOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The history's "Clear browsing data…" opens the settings at that section.
  const [clearAt, setClearAt] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const address = useRef<HTMLInputElement>(null);
  const live = useRef<LiveViewApi>(null);
  const area = useRef<HTMLDivElement>(null);
  useAgentsRefresh();

  // Starts your browser (with the tabs it had), opening an address from the page's own (?url=) in a new tab.
  const params = new URLSearchParams(search);
  const urlParam = params.get('url');
  const panelParam = params.get('panel');
  useEffect(() => {
    listenBrowser();
    void loadBookmarks();
    void loadExtensions();
    void loadPrefs();
    void loadBrowser(KEY);
  }, []);
  // Your browser's news (its tabs, pages, pictures) comes to the pages that listen for it.
  useEffect(() => socket.sub(KEY), []);
  useEffect(() => {
    let live = true;
    setError(null);
    openBrowsing(urlParam ?? undefined).then(
      () => {
        if (!urlParam) return;
        const p = new URLSearchParams(window.location.search);
        p.delete('url');
        go(`/browser${p.size ? `?${p}` : ''}`, true);
      },
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [urlParam]);
  useEffect(() => {
    if (isPanel(panelParam)) (setAskOpen(false), setPanel(panelParam));
  }, [panelParam]);

  // Closed under you (its last tab, or you closed it elsewhere): started again, a few times at most.
  const restarts = useRef(0);
  useEffect(() => {
    if (view?.open) restarts.current = 0;
    else if (view && !error && restarts.current < 3) {
      restarts.current++;
      openBrowsing().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }
  }, [view?.open, error]); // eslint-disable-line react-hooks/exhaustive-deps

  const tab = activeTab(view);
  // The home page (Browser settings), for the Home button.
  const home = usePrefs((s) => s.prefs?.home);
  const native = isNative(view);
  const marked = useMemo(() => (tab?.url ? nodes.filter((n) => n.url === tab.url) : []), [nodes, tab?.url]);
  const canHand = !!tab && /^https?:/i.test(tab.url);
  const canAsk = !!tab && isWebPage(tab.url);

  // Without a native page, the picture is laid out for the room it has here (as the page does when a phone drives).
  const latest = useRef({ native, open: !!view?.open, watching });
  latest.current = { native, open: !!view?.open, watching };
  const sent = useRef('');
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    let t = 0;
    const send = () => {
      const l = latest.current;
      if (l.native || !l.open || l.watching) return;
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      const scale = Math.min(2, window.devicePixelRatio || 1);
      const id = `${w}x${h}@${scale}`;
      if (w < 120 || h < 120 || id === sent.current) return;
      sent.current = id;
      void post(`/api/browser/sessions/${enc(KEY)}/fit`, { w, h, scale }).catch(() => (sent.current = ''));
    };
    const ro = new ResizeObserver(() => {
      window.clearTimeout(t);
      t = window.setTimeout(send, 300);
    });
    ro.observe(el);
    t = window.setTimeout(send, 300);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [view?.open, native, watching, error]);

  const openPanel = (p: PanelId | null) => {
    setAskOpen(false);
    setPanel(p);
  };
  const togglePanel = (p: PanelId) => (setClearAt(false), openPanel(panel === p ? null : p));
  const openAsk = () => {
    setPanel(null);
    setAskOpen(true);
  };
  // Ask about the page: its column opens with the question already on its way.
  const askAbout = (q: string) => {
    if (!tab) return;
    openAsk();
    void askAboutTab(tab, q, run);
  };
  const leave = () => setWatching(null);
  const watch = (key: string) => {
    setWatching(key);
    setFind(false);
  };
  // An agent has the tab now: its browser shows in the page's place.
  const started = (key: string) => {
    watch(key);
    for (const ms of [600, 2000, 5000]) window.setTimeout(() => void loadAgentBrowsers(), ms);
  };
  const doHere = async (what: string) => {
    if (!tab) return;
    const key = await startDo(tab.id, what);
    if (key) started(key);
  };
  const star = () => tab && void toggleBookmark(tab.url, tab.title, marked);
  const where = useSavePlace();
  const save = async () => {
    if (!tab || saving) return;
    setSaving(true);
    try {
      const { place, name } = where;
      const r = await post<{ id?: string; page?: { id: string } }>(`/api/browser/browsing/tabs/${enc(tab.id)}/save-page`, { space: place.space, ...(place.folder ? { folder: place.folder } : {}) });
      const id = r.page?.id ?? r.id;
      useToasts.getState().push('ok', name ? tr(`Saved to ${name}`) : 'Saved to the Library', id ? { label: 'Open', run: () => go(`/pages/${id}`) } : undefined);
    } catch (e) {
      toastError(e);
    } finally {
      setSaving(false);
    }
  };

  // Keys: while the app's own page has the focus here, and, in the desktop app, the ones a native page passes on to it
  // (a native page takes keys itself, so it tells the app which shortcuts it saw).
  const st = useRef({ view, find, watching, star: () => {}, leave: () => {}, openPanel: (_p: PanelId) => {} });
  st.current = { view, find, watching, star, leave, openPanel };
  useEffect(() => {
    // Returns whether the key was a shortcut of this page.
    const run = (k: { key: string; mod: boolean; alt: boolean; shift: boolean; ctrl: boolean; meta: boolean }, typing: boolean, fromPage: boolean): boolean => {
      const s = st.current;
      if (s.watching) {
        // Esc leaves an agent's browser (not while a dialog is open: it closes that).
        if (k.key === 'Escape' && !typing && !fromPage && !document.querySelector('[aria-modal]')) return (s.leave(), true);
        return false;
      }
      const key = k.key.toLowerCase();
      const active = activeTab(s.view);
      // The page's own window has the focus when it is a native page that was typed in: take it back for the address bar.
      const own = () => {
        if (fromPage) window.focus();
      };
      if (k.mod && !k.alt && !k.shift && key === 't') {
        own();
        void newTab().then(() => address.current?.focus());
      } else if (k.mod && !k.alt && !k.shift && key === 'w' && active) {
        void closeTab(active.id);
      } else if (k.mod && !k.alt && !k.shift && key === 'l') {
        own();
        address.current?.focus();
        address.current?.select();
      } else if ((k.mod && !k.alt && !k.shift && key === 'r') || (k.key === 'F5' && fromPage)) {
        void navigate('reload');
      } else if (k.mod && !k.alt && !k.shift && key === 'f') {
        own();
        setFind(true);
        setFindTick((n) => n + 1);
      } else if (k.ctrl && !k.alt && !k.meta && k.key === 'Tab' && s.view?.tabs.length) {
        // The next tab, or the one before (Shift), round the column.
        const tabs = s.view.tabs;
        const at = tabs.findIndex((t) => t.active);
        void switchTab(tabs[(Math.max(0, at) + (k.shift ? -1 : 1) + tabs.length) % tabs.length].id);
      } else if (k.mod && !k.alt && !k.shift && /^[1-9]$/.test(k.key) && s.view?.tabs.length) {
        // 1 to 8: that tab; 9: the last, as in other browsers.
        const tabs = s.view.tabs;
        const t = k.key === '9' ? tabs[tabs.length - 1] : tabs[Number(k.key) - 1];
        if (t) void switchTab(t.id);
      } else if (k.mod && !k.alt && !k.shift && key === 'd') {
        s.star();
      } else if (k.mod && !k.alt && !k.shift && key === 'h') {
        s.openPanel('history');
      } else if (k.mod && !k.alt && !k.shift && key === 'j') {
        s.openPanel('downloads');
      } else if (fromPage && k.mod && !k.alt && !k.shift && key === 'b') {
        // Typed in a native page (the app's own page does not see it): the shell's own Ctrl+B, for the tab column.
        useUI.getState().set({ sideOpen: !useUI.getState().sideOpen });
      } else if (k.mod && !k.alt && k.shift && key === 't') {
        void reopenClosed();
      } else if (k.mod && !k.alt && !k.shift && key === 'p' && active) {
        void desktopBrowser()?.print(active.id);
      } else if (k.mod && !k.alt && k.shift && (key === 'delete' || key === 'backspace')) {
        setClearAt(true);
        s.openPanel('settings');
      } else if (k.alt && !k.ctrl && !k.meta && !typing && (k.key === 'ArrowLeft' || k.key === 'ArrowRight')) {
        void navigate(k.key === 'ArrowLeft' ? 'back' : 'forward');
      } else if (fromPage && k.meta && !k.alt && !k.ctrl && (k.key === '[' || k.key === ']')) {
        void navigate(k.key === '[' ? 'back' : 'forward');
      } else if (k.key === 'Escape' && s.find && !typing) setFind(false);
      else return false;
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      // F5 and ⌘[ ⌘] stay the app's own page's here: they are shortcuts only when a native page passed them on.
      if (run({ key: e.key, mod: (e.ctrlKey || e.metaKey) && !e.altKey, alt: e.altKey, shift: e.shiftKey, ctrl: e.ctrlKey, meta: e.metaKey }, typing, false)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const off = desktopBrowser()?.onKey((k) => void run({ key: k.key, mod: (k.ctrl || k.meta) && !k.alt, alt: k.alt, shift: k.shift, ctrl: k.ctrl, meta: k.meta }, false, true));
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, []);

  // What a page's right-click menu asks: Ask an agent about the selection or a picture (Ask opens beside the page with it), Bookmark this page, Read later, and Save image to Library.
  useEffect(
    () =>
      listenTabs((c) => {
        if (c.cmd === 'ask') {
          const t = activeTab(st.current.view);
          if (!t) return;
          pickForAsk(t.id, { text: c.text, url: c.url });
          setPanel(null);
          setAskOpen(true);
        } else if (c.cmd === 'bookmark') {
          if (!useBookmarks.getState().nodes.some((n) => n.url === c.url)) void addBookmark({ title: c.title || c.url, url: c.url, parent: 'bar' });
        } else if (c.cmd === 'later') {
          void addLater(c.url, c.title || c.url);
        } else if (c.cmd === 'save-image') {
          void keepPicture(c);
        } else if (c.cmd === 'ask-image') {
          const t = activeTab(st.current.view);
          if (!t) return;
          pickForAsk(t.id, { text: '', url: c.url, image: { path: c.path, name: c.name } });
          setPanel(null);
          setAskOpen(true);
        } else if (c.cmd === 'picture-failed') toastError(new Error(c.message));
      }),
    [],
  );

  const store = tab ? storePage(tab.url) : null;
  const [adding, setAdding] = useState(false);
  const closeFind = () => {
    setFind(false);
  };

  if (error) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <SidebarCorner />
        <Empty icon={<Globe size={20} />} title="The browser did not start">
          {error}
          <div className="mt-4 flex justify-center gap-2">
            <Button size="sm" variant="primary" onClick={() => (setError(null), openBrowsing().catch((e) => setError(e instanceof Error ? e.message : String(e))))}>
              Try again
            </Button>
            <Button size="sm" onClick={() => go('/settings?s=browser')}>
              Browser settings
            </Button>
          </div>
        </Empty>
      </div>
    );
  }
  if (!view?.open) {
    return (
      <div className="relative flex h-full items-center justify-center">
        <SidebarCorner />
        <Throbber size={30} />
      </div>
    );
  }

  const menuItems = (
    <>
      {mobile && (
        <>
          <MenuItem icon={<ArrowRight size={14} />} disabled={tab?.canGoForward === false} onClick={() => (setMenu(false), void navigate('forward'))}>
            Forward
          </MenuItem>
          <MenuItem icon={<RotateCw size={14} />} onClick={() => (setMenu(false), void navigate('reload'))}>
            Reload
          </MenuItem>
          <MenuItem icon={<Star size={14} />} disabled={!tab || !isWebPage(tab.url)} onClick={() => (setMenu(false), star())}>
            {marked.length ? 'Remove the bookmark' : 'Bookmark this page'}
          </MenuItem>
          <MenuItem icon={<BookmarkPlus size={14} />} disabled={!canAsk} onClick={() => (setMenu(false), void save())}>
            Save
          </MenuItem>
          <MenuItem icon={<Sparkles size={14} />} disabled={!canAsk} onClick={() => (setMenu(false), openAsk())}>
            Ask
          </MenuItem>
          {store && (
            <MenuItem icon={<Puzzle size={14} />} onClick={() => (setMenu(false), void addFromStore(store))}>
              Add to Hydor
            </MenuItem>
          )}
          <MenuSep />
        </>
      )}
      <MenuItem
        icon={<Search size={14} />}
        hint={mobile ? undefined : <Kbd>{MOD}F</Kbd>}
        onClick={() => {
          setMenu(false);
          setFind(true);
          setFindTick((n) => n + 1);
        }}
      >
        Find in page
      </MenuItem>
      <MenuItem icon={<Printer size={14} />} disabled={!tab || !canHand} hint={mobile ? undefined : <Kbd>{MOD}P</Kbd>} onClick={() => (setMenu(false), tab && void desktopBrowser()?.print(tab.id))}>
        Print…
      </MenuItem>
      <MenuItem icon={<ExternalLink size={14} />} disabled={!tab || !canHand} onClick={() => (setMenu(false), tab && void desktopBrowser()?.openExternal(tab.url))}>
        Open in your default browser
      </MenuItem>
      <MenuItem icon={<Clock size={14} />} disabled={!canAsk} onClick={() => (setMenu(false), tab && void addLater(tab.url, tab.title || tab.url))}>
        Read this page later
      </MenuItem>
      <MenuItem icon={<WandSparkles size={14} />} disabled={!canHand} onClick={() => (setMenu(false), setDoOpen(true))}>
        Do this here…
      </MenuItem>
      <MenuItem icon={<Sparkles size={14} />} disabled={grouping || view.tabs.length < 3} onClick={() => (setMenu(false), void groupWithAi())}>
        Group my tabs with AI
      </MenuItem>
      <MenuSep />
      <MenuItem icon={<History size={14} />} checked={panel === 'history'} hint={mobile ? undefined : <Kbd>{MOD}H</Kbd>} onClick={() => (setMenu(false), togglePanel('history'))}>
        History
      </MenuItem>
      <MenuItem icon={<Download size={14} />} checked={panel === 'downloads'} hint={view.downloads.length ? String(view.downloads.length) : mobile ? undefined : <Kbd>{MOD}J</Kbd>} onClick={() => (setMenu(false), togglePanel('downloads'))}>
        Downloads
      </MenuItem>
      <MenuItem icon={<Bookmark size={14} />} checked={panel === 'bookmarks'} onClick={() => (setMenu(false), togglePanel('bookmarks'))}>
        Bookmarks
      </MenuItem>
      <MenuItem icon={<Puzzle size={14} />} checked={panel === 'extensions'} onClick={() => (setMenu(false), togglePanel('extensions'))}>
        Extensions
      </MenuItem>
      <MenuItem icon={<ShieldQuestion size={14} />} checked={panel === 'permissions'} onClick={() => (setMenu(false), togglePanel('permissions'))}>
        Site permissions
      </MenuItem>
      <MenuItem icon={<Settings size={14} />} checked={panel === 'settings'} onClick={() => (setMenu(false), togglePanel('settings'))}>
        Settings
      </MenuItem>
    </>
  );

  const menuButton = (
    <IconButton ref={menuRef} label="Menu" active={menu} onClick={() => setMenu((m) => !m)}>
      <Ellipsis size={18} />
    </IconButton>
  );

  // The right column: an agent's conversation, a panel, or Ask about this page.
  let right: ReactNode = null;
  if (watching && !mobile) right = <AgentConversation k={watching} onBack={leave} />;
  else if (!watching && panel) {
    const close = () => openPanel(null);
    right =
      panel === 'bookmarks' ? (
        <BookmarksPanel onClose={close} />
      ) : panel === 'extensions' ? (
        <ExtensionsPanel onClose={close} />
      ) : panel === 'downloads' ? (
        <DownloadsPanel onClose={close} />
      ) : panel === 'permissions' ? (
        <PermissionsPanel onClose={close} />
      ) : panel === 'history' ? (
        <HistoryPanel tab={tab?.id} onClose={close} onClear={() => (setClearAt(true), openPanel('settings'))} />
      ) : (
        <BrowserSettingsPanel focusClear={clearAt} onClose={close} />
      );
  } else if (!watching && askOpen && tab) right = <BrowserAskPanel tab={tab} onClose={() => setAskOpen(false)} />;
  // On a phone every one of them is a sheet over the page (the panels bring their own).
  const rightIsPanel = !watching && !!panel;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <div className={cx('flex shrink-0 items-center border-b border-line bg-sidebar', mobile ? 'h-12' : 'h-[52px]')}>
        {!mobile && <BarLead open={sideOpen} />}
        <div className={cx('flex min-w-0 flex-1 items-center gap-1', mobile ? 'px-2' : 'pr-3 pl-2.5')}>
          {mobile && <NavButton />}
          {mobile && !watching && <TabMenu view={view} />}
          {!watching && (
            <>
              <IconButton label="Back" disabled={tab?.canGoBack === false} onClick={() => void navigate('back')}>
                <ArrowLeft size={17} />
              </IconButton>
              {!mobile && (
                <IconButton label="Forward" disabled={tab?.canGoForward === false} onClick={() => void navigate('forward')}>
                  <ArrowRight size={17} />
                </IconButton>
              )}
              {!mobile && (
                <IconButton label={tab?.loading ? 'Stop' : 'Reload'} onClick={() => void navigate(tab?.loading ? 'stop' : 'reload')}>
                  {tab?.loading ? <X size={17} /> : <RotateCw size={16} />}
                </IconButton>
              )}
              {!mobile && (
                <IconButton label="Home" disabled={!home} onClick={() => home && void goTo(home, { tab: tab?.id })}>
                  <Home size={16} />
                </IconButton>
              )}
            </>
          )}
          <div className={cx('flex min-w-0 flex-1 items-center', !mobile && 'mx-1')}>
            {watching ? (
              <AgentBox k={watching} onBack={leave} />
            ) : (
              <Omnibox inputRef={address} tab={tab} starred={marked.length > 0} canStar={!!tab && isWebPage(tab.url)} onStar={star} compact={mobile} onAskPage={canAsk ? askAbout : undefined} onDoHere={canHand ? (w) => void doHere(w) : undefined} />
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {watching ? (
              !mobile && <AgentBar k={watching} />
            ) : (
              <>
                {!mobile && (
                  <SaveButton where={where} disabled={!canAsk} saving={saving} onSave={() => void save()} />
                )}
                {!mobile && (
                  <Button size="sm" icon={<Sparkles size={14} />} aria-pressed={askOpen && !panel} disabled={!tab} onClick={() => (askOpen && !panel ? setAskOpen(false) : openAsk())} className={cx(askOpen && !panel && '!bg-accent-soft !text-accent')}>
                    Ask
                  </Button>
                )}
                {!mobile && <ExtensionButtons />}
                {!mobile && store && (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Puzzle size={14} />}
                    disabled={adding}
                    onClick={async () => {
                      setAdding(true);
                      await addFromStore(store);
                      setAdding(false);
                    }}
                  >
                    Add to Hydor
                  </Button>
                )}
                {menuButton}
              </>
            )}
          </div>
        </div>
      </div>
      {mobile && watching && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-bg px-2 py-1.5">
          <AgentBar k={watching} />
          <IconButton label="Back to your tabs" onClick={leave} className="ml-auto">
            <X size={16} />
          </IconButton>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {!mobile && sideOpen && <TabColumn view={view} watching={watching} onWatch={watch} onLeave={leave} />}
        <div className="flex min-w-0 flex-1 flex-col">
          {!watching && <PermissionBar view={view} />}
          {find && !watching && <FindBar onClose={closeFind} focusTick={findTick} tab={tab?.id} native={native} />}
          {watching ? (
            <AgentBody k={watching} onBack={leave} />
          ) : (
            <>
              <div ref={area} className="relative min-h-0 flex-1 bg-bg-1">
                <div className="absolute inset-0">
                  <PageView ref={live} k={KEY} view={view} driving={view.driver === 'user'} plain fit="fill" className="h-full w-full" />
                </div>
                <AgentDialog k={KEY} view={view} />
              </div>
              {mobile && !native && <KeyRow live={live} />}
            </>
          )}
        </div>
        {mobile ? (
          right &&
          (rightIsPanel ? (
            right
          ) : (
            <Sheet open onClose={() => setAskOpen(false)} label="Ask" width={400}>
              {right}
            </Sheet>
          ))
        ) : (
          // Slides open and shut (Motion: Full); the page beside it follows.
          <SlideColumn open={!!right} width={400}>
            {right ? <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-line bg-bg-1">{right}</aside> : null}
          </SlideColumn>
        )}
      </div>

      <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={250}>
        {menuItems}
      </Popover>
      {tab && <HandOffPopover anchor={menuRef} open={doOpen} tab={tab.id} title={tab.title || tab.url} onClose={() => setDoOpen(false)} onStarted={started} />}
    </div>
  );
}
