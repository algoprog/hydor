// The Browser page (/browser): a browser of your own inside the app. Tabs, an address bar that searches, back, forward,
// reload, bookmarks, Chrome extensions (in the desktop app), find in page, downloads, the permissions sites ask for, and
// the agents' browsers beside yours. In the desktop app the page is the page itself (PageView draws it natively); anywhere
// else it is a live picture you drive, laid out for the size it has here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearch } from 'wouter';
import type { BrowserView } from '@shared/browser';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Bot,
  Download,
  Ellipsis,
  FileDown,
  Globe,
  MessageCircleQuestion,
  Puzzle,
  RotateCw,
  Search,
  ShieldQuestion,
  Star,
  Wand2,
  X,
} from 'lucide-react';
import { enc, post } from '../../lib/api';
import { MOD } from '../../lib/format';
import { go, openFile } from '../../lib/nav';
import { Button, cx, Empty, IconButton, Kbd, MenuItem, MenuSep, Popover, Throbber, useIsMobile } from '../../components/ui';
import { live as socket } from '../../lib/ws';
import { AgentDialog, AgentPane, AgentsPanel, useAgentsRefresh } from './AgentTabs';
import { BookmarkBar, toggleBookmark } from './BookmarkBar';
import { BookmarksPanel } from './Bookmarks';
import {
  activeTab,
  addFromStore,
  answerPermission,
  closeTab,
  goTo,
  isNative,
  isWebPage,
  KEY,
  loadAgentBrowsers,
  loadBookmarks,
  loadExtensions,
  navigate,
  newTab,
  openBrowsing,
  permissionWords,
  shownAddress,
  storePage,
  useAgentBrowsers,
  useBookmarks,
  desktopBrowser,
} from './browsing';
import { ExtensionButtons, ExtensionsPanel } from './Extensions';
import { FindBar } from './FindBar';
import { HandOffPopover } from './HandOff';
import { KeyRow } from './Dock';
import type { LiveViewApi } from './LiveView';
import { Panel } from './Panel';
import { PermissionsPanel } from './Permissions';
import { PageView } from './PageView';
import { TabMenu, TabStrip } from './TabStrip';
import { hostOf, listenBrowser, loadBrowser, useBrowser } from './store';

type PanelId = 'bookmarks' | 'extensions' | 'downloads' | 'agents' | 'permissions';
const isPanel = (v: unknown): v is PanelId => v === 'bookmarks' || v === 'extensions' || v === 'downloads' || v === 'agents' || v === 'permissions';

/** The address bar: shows the tab's address; what you type is opened, or searched for. */
function AddressBar({ inputRef, url, tabId, starred, canStar, onStar }: { inputRef: React.RefObject<HTMLInputElement | null>; url: string; tabId?: string; starred: boolean; canStar: boolean; onStar: () => void }) {
  const [text, setText] = useState(shownAddress(url));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shownAddress(url));
  }, [url, editing]);
  const submit = (inNew: boolean) => {
    const t = text.trim();
    if (!t) return;
    setEditing(false);
    inputRef.current?.blur();
    void goTo(t, inNew ? { newTab: true } : { tab: tabId }).then(() => {
      // The page takes the keyboard, as in any browser.
      if (tabId && !inNew) void desktopBrowser()?.focus(tabId);
    });
  };
  return (
    <div className="relative min-w-0 flex-1">
      <input
        ref={inputRef}
        value={text}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onFocus={(e) => (setEditing(true), e.target.select())}
        onBlur={() => setEditing(false)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit(e.altKey || e.ctrlKey || e.metaKey);
          } else if (e.key === 'Escape') {
            setText(shownAddress(url));
            e.currentTarget.blur();
          }
        }}
        placeholder="Search or enter an address"
        aria-label="Address"
        translate="no"
        className={cx('h-9 w-full rounded-full border border-line-2 bg-bg-2 pr-10 pl-4 text-[13.5px] outline-none placeholder:text-fg-3 focus:border-accent/60 focus:bg-bg-1 focus:ring-3 focus:ring-accent/15')}
      />
      <button
        aria-label={starred ? 'Remove the bookmark' : 'Bookmark this page'}
        title={starred ? 'Remove the bookmark' : 'Bookmark this page'}
        disabled={!canStar}
        onClick={onStar}
        className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-fg-3 hover:bg-bg-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40"
      >
        <Star size={15} className={cx(starred && 'fill-warn text-warn')} />
      </button>
    </div>
  );
}

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

/** A finished download: shown in its folder by the desktop app when it can, else opened as the app opens files. */
const showDownload = (path: string) => {
  const b = desktopBrowser();
  if (!b?.showFile) return openFile(path);
  void b.showFile(path).then((ok) => ok || openFile(path), () => openFile(path));
};

/** Files the browser saved lately. */
function DownloadsPanel({ onClose }: { onClose: () => void }) {
  const downloads = useBrowser((s) => s.views[KEY]?.downloads) ?? [];
  return (
    <Panel title="Downloads" onClose={onClose}>
      {!downloads.length && <div className="px-4 py-3 text-[12.5px] leading-relaxed text-fg-3">Nothing downloaded yet. Files you save from a page go to your Downloads folder.</div>}
      {downloads.map((d) => (
        <button key={`${d.path}${d.at}`} disabled={!d.done || d.failed} onClick={() => showDownload(d.path)} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left enabled:hover:bg-bg-2">
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

export function BrowserPage() {
  const mobile = useIsMobile();
  const search = useSearch();
  const view = useBrowser((s) => s.views[KEY]);
  const nodes = useBookmarks((s) => s.nodes);
  const agentCount = useAgentBrowsers((s) => s.browsers.length);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelId | null>(() => {
    const p = new URLSearchParams(search).get('panel');
    return isPanel(p) ? p : null;
  });
  const [watching, setWatching] = useState<string | null>(null);
  const [find, setFind] = useState(false);
  const [findTick, setFindTick] = useState(0);
  const [menu, setMenu] = useState(false);
  const [hand, setHand] = useState<'ask' | 'do' | null>(null);
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
    if (isPanel(panelParam)) setPanel(panelParam);
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
  const native = isNative(view);
  const marked = useMemo(() => (tab?.url ? nodes.filter((n) => n.url === tab.url) : []), [nodes, tab?.url]);
  const canHand = !!tab && /^https?:/i.test(tab.url);

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

  // Keys: while the app's own page has the focus here, and, in the desktop app, the ones a native page passes on to it
  // (a native page takes keys itself, so it tells the app which shortcuts it saw).
  const st = useRef({ view, find, watching });
  st.current = { view, find, watching };
  useEffect(() => {
    // Returns whether the key was a shortcut of this page.
    const run = (k: { key: string; mod: boolean; alt: boolean; shift: boolean; ctrl: boolean; meta: boolean }, typing: boolean, fromPage: boolean): boolean => {
      const s = st.current;
      if (s.watching) return false;
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

  const toggle = (p: PanelId) => setPanel((x) => (x === p ? null : p));
  const watch = (key: string) => {
    setWatching(key);
    if (mobile) setPanel(null);
  };
  const star = () => tab && void toggleBookmark(tab.url, tab.title, marked);
  const store = tab ? storePage(tab.url) : null;
  const [adding, setAdding] = useState(false);
  const closeFind = () => {
    setFind(false);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
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
      <div className="flex h-full items-center justify-center">
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
          {store && (
            <MenuItem icon={<Puzzle size={14} />} onClick={() => (setMenu(false), void addFromStore(store))}>
              Add to Hydor
            </MenuItem>
          )}
          <MenuSep />
        </>
      )}
      <MenuItem icon={<MessageCircleQuestion size={14} />} disabled={!canHand} onClick={() => (setMenu(false), setHand('ask'))}>
        Ask about this page
      </MenuItem>
      <MenuItem icon={<Wand2 size={14} />} disabled={!canHand} onClick={() => (setMenu(false), setHand('do'))}>
        Do this here
      </MenuItem>
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
      <MenuSep />
      <MenuItem icon={<Bookmark size={14} />} checked={panel === 'bookmarks'} onClick={() => (setMenu(false), toggle('bookmarks'))}>
        Bookmarks
      </MenuItem>
      <MenuItem icon={<Puzzle size={14} />} checked={panel === 'extensions'} onClick={() => (setMenu(false), toggle('extensions'))}>
        Extensions
      </MenuItem>
      <MenuItem icon={<Download size={14} />} checked={panel === 'downloads'} hint={view.downloads.length ? String(view.downloads.length) : undefined} onClick={() => (setMenu(false), toggle('downloads'))}>
        Downloads
      </MenuItem>
      <MenuItem icon={<Bot size={14} />} checked={panel === 'agents'} hint={agentCount ? String(agentCount) : undefined} onClick={() => (setMenu(false), toggle('agents'))}>
        Agents’ tabs
      </MenuItem>
      <MenuItem icon={<ShieldQuestion size={14} />} checked={panel === 'permissions'} onClick={() => (setMenu(false), toggle('permissions'))}>
        Site permissions
      </MenuItem>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      {!mobile && <TabStrip view={view} />}
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-bg px-2">
        {mobile && <TabMenu view={view} />}
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
        <AddressBar inputRef={address} url={tab?.url ?? ''} tabId={tab?.id} starred={marked.length > 0} canStar={!!tab && isWebPage(tab.url)} onStar={star} />
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
        <IconButton ref={menuRef} label="Menu" active={menu} onClick={() => setMenu((m) => !m)}>
          <Ellipsis size={18} />
        </IconButton>
      </div>
      {!mobile && <BookmarkBar />}
      <PermissionBar view={view} />
      {find && !watching && <FindBar onClose={closeFind} focusTick={findTick} />}

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {watching ? (
            <AgentPane k={watching} onBack={() => setWatching(null)} />
          ) : (
            <>
              <div ref={area} className="relative min-h-0 flex-1 bg-bg-1">
                <div className="absolute inset-0">
                  <PageView ref={live} k={KEY} view={view} driving={view.driver === 'user'} fit="fill" className="h-full w-full" />
                </div>
                <AgentDialog k={KEY} view={view} />
              </div>
              {mobile && !native && <KeyRow live={live} />}
            </>
          )}
        </div>
        {panel === 'bookmarks' && <BookmarksPanel onClose={() => setPanel(null)} />}
        {panel === 'extensions' && <ExtensionsPanel onClose={() => setPanel(null)} />}
        {panel === 'downloads' && <DownloadsPanel onClose={() => setPanel(null)} />}
        {panel === 'permissions' && <PermissionsPanel onClose={() => setPanel(null)} />}
        {panel === 'agents' && <AgentsPanel onClose={() => setPanel(null)} onWatch={watch} />}
      </div>

      <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={250}>
        {menuItems}
      </Popover>
      {tab && (
        <HandOffPopover
          anchor={menuRef}
          open={hand !== null}
          mode={hand ?? 'ask'}
          tab={tab.id}
          title={tab.title || tab.url}
          onClose={() => setHand(null)}
          onStarted={() => {
            setPanel('agents');
            for (const ms of [600, 2000, 5000]) window.setTimeout(() => void loadAgentBrowsers(), ms);
          }}
        />
      )}
    </div>
  );
}
