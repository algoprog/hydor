// What the Browser page (BrowserPage.tsx) shares between its parts: the browser of your own (key 'browsing') as
// the server's routes have it, your bookmarks and extensions, the agents' browsers open now, the desktop app's
// bridge to its pages, and the plain words for what a site may ask for.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import {
  BROWSING_KEY,
  type BookmarkNode,
  type BookmarkOrganizeState,
  type AdblockPage,
  type AdblockStats,
  type BrowserGroup,
  type BrowserPermissionAsk,
  type BrowserTab,
  type BrowserView,
  type BrowsingPrefs,
  type ExtensionsState,
  type HistoryEntry,
  type LaterItem,
  type ReaderPrefs,
  type SuggestResult,
} from '@shared/browser';
import type { PageHighlight } from '@shared/highlights';
import { api, del, enc, patch, post } from '../../lib/api';
import { machineId } from '../../lib/machine';
import { openFile, openSession } from '../../lib/nav';
import { canReveal, reveal } from '../../lib/reveal';
import { agentKey, lastAgent, startSettings } from '../../lib/start';
import { activeBase } from '../../lib/theme';
import { toast, toastError, useApp, useToasts } from '../../lib/store';
import { desktopBrowser, nativePages, type TabStateChange } from './PageView';
import { useBrowser } from './store';

export const KEY = BROWSING_KEY;

// ---- the desktop app's bridge ----------------------------------------------------------------------------------

export interface ExtensionBadge {
  extension: string;
  text: string;
  color?: string;
  title?: string;
}

export { desktopBrowser };

/**
 * Your own browser is part of the desktop app: its window, on its own computer (not a web page, not another machine's
 * pages). The sidebar, the search box and Settings show it only there; /browser says so elsewhere.
 */
export const ownBrowserHere = (): boolean => !!desktopBrowser() && !machineId;

/** A finished download: shown in its folder by the desktop app when it can (selected in the system's file manager), else opened as the app opens files. */
export const showDownload = (path: string) => (canReveal() ? reveal(path) : openFile(path));

/** The desktop app shows this browser's pages itself (not as pictures). */
export const isNative = nativePages;

/** Chooses a folder with the desktop app's own dialog, when there is one. */
export const chooseFolder = (): ((current: string) => Promise<string | null>) | undefined =>
  (window as unknown as { hydorDesktop?: { chooseFolder?: (current: string) => Promise<string | null> } }).hydorDesktop?.chooseFolder;

// ---- badges of the extensions' buttons -------------------------------------------------------------------------

export const useBadges = create<{ byId: Record<string, ExtensionBadge> }>(() => ({ byId: {} }));
let badgesHeard = false;
/** Hears the extensions' badges from the desktop app, once. */
export function listenBadges() {
  if (badgesHeard) return;
  const b = desktopBrowser();
  if (!b) return;
  badgesHeard = true;
  b.onBadge((x) => useBadges.setState((s) => ({ byId: { ...s.byId, [x.extension]: x } })));
}

// ---- your own browser ------------------------------------------------------------------------------------------

/** Takes the state the server answered with. */
export function takeView(view: BrowserView | undefined | null) {
  if (view) useBrowser.setState((s) => ({ views: { ...s.views, [KEY]: view } }));
  return view ?? null;
}

/** Starts your browser (reopening the tabs it had), and opens `url` in a new tab when given. */
export async function openBrowsing(url?: string): Promise<BrowserView> {
  const r = await post<{ key: string; view: BrowserView }>('/api/browser/browsing/open', url ? { url } : {});
  takeView(r.view);
  return r.view;
}

/** What was typed in the address bar: a shortcut's site searched, an address opened, anything else searched; `plain`: always searched with your engine. */
export async function goTo(text: string, o: { tab?: string; newTab?: boolean; private?: boolean; plain?: boolean } = {}) {
  try {
    takeView((await post<{ view: BrowserView }>('/api/browser/browsing/go', { text, ...o, ...(o.private ? { private: true } : {}) })).view);
  } catch (e) {
    toastError(e);
  }
}

/** Opens a new tab (at `url`, else the home page), a private one with `private`; the view after it, which has the new tab in front. */
export async function newTab(url?: string, o: { private?: boolean } = {}): Promise<BrowserView | null> {
  try {
    return takeView((await post<{ view: BrowserView }>('/api/browser/browsing/tabs', { ...(url ? { url } : {}), ...(o.private ? { private: true } : {}) })).view);
  } catch (e) {
    toastError(e);
    return null;
  }
}

/** The tab shown. */
export const switchTab = (id: string) => api(`/api/browser/sessions/${enc(KEY)}/tab`, { method: 'POST', body: { id } }).then((r) => takeView(r.view), toastError);

/** Closes a tab; the last one is replaced by a new one first, as in any browser that stays open. */
export async function closeTab(id: string) {
  try {
    if ((useBrowser.getState().views[KEY]?.tabs.length ?? 0) <= 1) await post('/api/browser/browsing/tabs', {});
    takeView((await post<{ view: BrowserView }>(`/api/browser/sessions/${enc(KEY)}/tab`, { id, close: true })).view);
  } catch (e) {
    toastError(e);
  }
}

/** Closes every private tab (your browsing keeps at least one tab: a new one opens first when only private ones are left). */
export async function closePrivateTabs() {
  try {
    const tabs = useBrowser.getState().views[KEY]?.tabs ?? [];
    if (tabs.length && tabs.every((t) => t.private)) await post('/api/browser/browsing/tabs', {});
    takeView((await post<{ view: BrowserView }>('/api/browser/browsing/private/close')).view);
  } catch (e) {
    toastError(e);
  }
}

/** Closes several tabs at once (your browsing keeps at least one). */
export async function closeTabs(ids: string[]) {
  if (!ids.length) return;
  try {
    takeView((await post<{ view: BrowserView }>('/api/browser/browsing/tabs/close', { tabs: ids })).view);
  } catch (e) {
    toastError(e);
  }
}

/** A copy of a tab beside it (in its group), in front. */
export const duplicateTab = (id: string) => post<{ view: BrowserView }>(`/api/browser/browsing/tabs/${enc(id)}/duplicate`).then((r) => void takeView(r.view), toastError);

/** Reloads one tab, not only the one in front. */
export const reloadTab = (id: string) => post<{ view: BrowserView }>(`/api/browser/browsing/tabs/${enc(id)}/reload`).then((r) => void takeView(r.view), toastError);

// ---- translation, reader view, screenshots and a site's data ------------------------------------------------------

/** Starts translating a tab's page (into `to`, else the language set in the browser's settings); progress comes in the view's `translation`. */
export const translateTab = (id: string, to?: string) =>
  post<{ view: BrowserView }>(`/api/browser/browsing/tabs/${enc(id)}/translate`, to ? { to } : {}).then((r) => (takeView(r.view), true), (e) => (toastError(e), false));

/** Shows a tab's page in its own words again. */
export const showOriginal = (id: string) =>
  del<{ view: BrowserView }>(`/api/browser/browsing/tabs/${enc(id)}/translate`).then((r) => (takeView(r.view), true), (e) => (toastError(e), false));

/** Words translated (the right-click menu's Translate “…”): the text, the language it was in when found, and the model that did it. Throws with the server's words. */
export const translateText = (text: string, to?: string) => post<{ text: string; from?: string; model: string }>('/api/browser/browsing/translate', { text, ...(to ? { to } : {}) });

/** Turns reader view on or off in a tab; the app's own look goes along, for the reader's colours when they are on Auto. 409: the page has no article. */
export const setReader = (id: string, on: boolean) =>
  post<{ view: BrowserView }>(`/api/browser/browsing/tabs/${enc(id)}/reader`, { on, theme: activeBase() }).then((r) => (takeView(r.view), true), (e) => (toastError(e), false));

/** A picture of a tab's page (what shows, or all of it), saved to Downloads and copied when it could be. */
export async function screenshotTab(id: string, whole: boolean) {
  try {
    const r = await desktopBrowser()?.capture?.(id, whole);
    if (!r) return;
    useToasts.getState().push('ok', r.copied ? 'Screenshot saved to Downloads and copied' : 'Screenshot saved to Downloads', { label: 'Show in folder', run: () => showDownload(r.path) });
  } catch (e) {
    toastError(e);
  }
}

/** A tab's page as a PDF file in Downloads. */
export async function savePageAsPdf(id: string) {
  try {
    const r = await desktopBrowser()?.savePdf?.(id);
    if (!r) return;
    useToasts.getState().push('ok', 'Saved as PDF in Downloads', { label: 'Show in folder', run: () => showDownload(r.path) });
  } catch (e) {
    toastError(e);
  }
}

/** Deletes the cookies and site data of a tab's site (you are signed out of it). */
export async function deleteSiteData(id: string) {
  try {
    const r = await desktopBrowser()?.clearSite?.(id);
    if (!r?.cleared) return;
    toast(`Deleted the cookies and site data of ${r.site}`, 'ok');
  } catch (e) {
    toastError(e);
  }
}

// ---- tab groups ------------------------------------------------------------------------------------------------

/** Makes a group of tabs; its id (so that its name can be typed in at once), or null when it could not. */
export async function groupTabs(tabs: string[], o: { name?: string; color?: BrowserGroup['color'] } = {}): Promise<string | null> {
  try {
    const r = await post<{ group: BrowserGroup; view: BrowserView }>('/api/browser/browsing/groups', { tabs, ...o });
    takeView(r.view);
    return r.group.id;
  } catch (e) {
    toastError(e);
    return null;
  }
}

/** Puts tabs in a group, or in none (`null`). */
export const moveToGroup = (tabs: string[], group: string | null) =>
  post<{ view: BrowserView }>('/api/browser/browsing/tabs/group', { tabs, group }).then((r) => void takeView(r.view), toastError);

/** Renames a group, changes its colour, folds it or opens it. */
export const editGroup = (id: string, change: { name?: string; color?: BrowserGroup['color']; folded?: boolean }) => {
  // Shown at once; the server's answer follows.
  useBrowser.setState((s) => {
    const v = s.views[KEY];
    if (!v?.groups) return s;
    const groups = v.groups.map((g) => {
      if (g.id !== id) return g;
      const { folded: _f, ...rest } = g;
      const next = { ...rest, ...(change.name !== undefined ? { name: change.name } : {}), ...(change.color ? { color: change.color } : {}) };
      return (change.folded ?? g.folded) ? { ...next, folded: true } : next;
    });
    return { views: { ...s.views, [KEY]: { ...v, groups } } };
  });
  return patch<{ view: BrowserView }>(`/api/browser/browsing/groups/${enc(id)}`, change).then((r) => void takeView(r.view), toastError);
};

/** Takes a group apart (its tabs stay), or closes it with its tabs. */
export const removeGroup = (id: string, closeToo = false) =>
  del<{ view: BrowserView }>(`/api/browser/browsing/groups/${enc(id)}${closeToo ? '?close=1' : ''}`).then((r) => void takeView(r.view), toastError);

/** A new tab in a group. */
export async function newTabIn(group: string) {
  const v = await newTab();
  const t = v?.tabs.find((x) => x.active);
  if (t) await moveToGroup([t.id], group);
}

/** Whether Group my tabs is waiting for the helper model's answer. */
export const useGrouping = create<{ busy: boolean }>(() => ({ busy: false }));

/** Group my tabs with AI: the helper model is sent the titles and addresses of the tabs in no group (nothing of the pages); the groups are made, with Undo. */
export async function groupWithAi() {
  if (useGrouping.getState().busy) return;
  useGrouping.setState({ busy: true });
  try {
    const r = await post<{ applied: number; before: unknown; view: BrowserView }>('/api/browser/browsing/tabs/group-with-ai', {});
    takeView(r.view);
    if (!r.applied) return void toast('No tabs go together to make a group', 'info');
    useToasts.getState().push('ok', r.applied === 1 ? 'Made 1 group of your tabs' : `Made ${r.applied} groups of your tabs`, {
      label: 'Undo',
      run: () => void post<{ view: BrowserView }>('/api/browser/browsing/groups/restore', r.before).then((x) => void takeView(x.view), toastError),
    });
  } catch (e) {
    toastError(e);
  } finally {
    useGrouping.setState({ busy: false });
  }
}

/** Back, forward, reload or stop, in the active tab. */
export const navigate = (what: 'back' | 'forward' | 'reload' | 'stop') =>
  post<{ view: BrowserView }>(`/api/browser/sessions/${enc(KEY)}/nav`, { do: what }).then((r) => takeView(r.view), toastError);

export const activeTab = (view: BrowserView | undefined): BrowserTab | undefined => view?.tabs.find((t) => t.active) ?? view?.tabs[0];

/** A page worth bookmarking or handing to an agent: a web page, not a blank one or the browser's own. */
export const isWebPage = (url: string | undefined) => !!url && /^(https?|file):/i.test(url);

/** The address to show in the address bar. */
export const shownAddress = (url: string | undefined) => (!url || url === 'about:blank' ? '' : url);

/** A tab's name: its title, else its site, else "New tab". */
export function tabName(t: BrowserTab): string {
  if (t.title && t.title !== t.url) return t.title;
  try {
    const u = new URL(t.url);
    return u.host || (u.protocol === 'about:' ? '' : t.url) || 'New tab';
  } catch {
    return t.url && t.url !== 'about:blank' ? t.url : 'New tab';
  }
}

/** A Chrome Web Store page of an extension: its address. */
export const storePage = (url: string | undefined) => (url && /^https:\/\/(chromewebstore\.google\.com\/detail\/|chrome\.google\.com\/webstore\/detail\/)/.test(url) ? url : null);

// ---- permissions -----------------------------------------------------------------------------------------------

/** What a site asks for, as a whole phrase to follow "<site> wants" (so a page in another language can translate it). */
export function permissionWords(p: BrowserPermissionAsk): string {
  switch (p.permission) {
    case 'media': {
      const video = p.media?.includes('video');
      const audio = p.media?.includes('audio');
      return video && audio ? 'to use your camera and microphone' : video ? 'to use your camera' : audio ? 'to use your microphone' : 'to use your camera or microphone';
    }
    case 'geolocation':
      return 'to know where you are';
    case 'notifications':
      return 'to show notifications';
    case 'clipboard-read':
      return 'to read what you copied';
    case 'clipboard-sanitized-write':
      return 'to copy to your clipboard';
    case 'display-capture':
      return 'to share your screen';
    case 'midi':
    case 'midiSysex':
      return 'to use your MIDI devices';
    case 'pointerLock':
      return 'to capture your mouse';
    case 'fullscreen':
      return 'to fill your screen';
    case 'openExternal':
      return 'to open another app';
    case 'idle-detection':
      return 'to know when you are away';
    case 'window-management':
      return 'to see your screens and place windows on them';
    case 'persistent-storage':
      return 'to keep data on this computer';
    case 'hid':
    case 'serial':
    case 'usb':
      return 'to connect to a device';
    case 'sensors':
    case 'accelerometer':
    case 'gyroscope':
    case 'magnetometer':
      return 'to use your motion sensors';
    default:
      return 'to use a feature of your computer';
  }
}

export const answerPermission = (id: string, allow: boolean) => post<{ view?: BrowserView }>(`/api/browser/sessions/${enc(KEY)}/permission`, { id, allow }).then((r) => takeView(r.view), toastError);

// ---- bookmarks -------------------------------------------------------------------------------------------------

export const useBookmarks = create<{ nodes: BookmarkNode[]; loaded: boolean }>(() => ({ nodes: [], loaded: false }));

export async function loadBookmarks() {
  try {
    useBookmarks.setState({ nodes: (await api<{ nodes: BookmarkNode[] }>('/api/browser/bookmarks')).nodes, loaded: true });
  } catch {}
}

const takeNodes = <T extends { nodes?: BookmarkNode[] }>(r: T): T => {
  if (r.nodes) useBookmarks.setState({ nodes: r.nodes, loaded: true });
  return r;
};

export const addBookmark = (b: { title: string; url?: string; parent?: string; pos?: number }) =>
  post<{ node: BookmarkNode; nodes: BookmarkNode[] }>('/api/browser/bookmarks', b).then(takeNodes, (e) => (toastError(e), null));
export const editBookmark = (id: string, b: { title?: string; url?: string; parent?: string; pos?: number }) => patch<{ nodes: BookmarkNode[] }>(`/api/browser/bookmarks/${enc(id)}`, b).then(takeNodes, (e) => (toastError(e), null));
export const removeBookmark = (id: string) => del<{ nodes: BookmarkNode[] }>(`/api/browser/bookmarks/${enc(id)}`).then(takeNodes, (e) => (toastError(e), null));

// ---- organize bookmarks with AI --------------------------------------------------------------------------------

export const useOrganize = create<{ state: BookmarkOrganizeState | null }>(() => ({ state: null }));

/** Counts what changed the state by hand (start, stop, undo, forget), so a poll that was already on its way does not put back what it saw before. */
let organizeGen = 0;

function takeOrganize(state: BookmarkOrganizeState | undefined) {
  if (!state) return;
  const was = useOrganize.getState().state?.status;
  useOrganize.setState({ state });
  // The folders are made on the server: read the bookmarks again.
  if (was === 'running' && state.status === 'done') void loadBookmarks();
}

export async function loadOrganize() {
  const gen = organizeGen;
  try {
    const s = await api<BookmarkOrganizeState>('/api/browser/bookmarks/organize');
    if (gen === organizeGen) takeOrganize(s);
  } catch {}
}

/** Starts sorting the bookmarks into folders by topic; false when the server refused (its sentence is shown). */
export async function startOrganize(keepFolders: boolean): Promise<boolean> {
  organizeGen++;
  try {
    takeOrganize(await post<BookmarkOrganizeState>('/api/browser/bookmarks/organize', { keepFolders }));
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

/** Stops a running job (nothing changes), or forgets a finished or failed one and its Undo. */
export async function stopOrganize() {
  organizeGen++;
  try {
    takeOrganize((await del<{ state: BookmarkOrganizeState }>('/api/browser/bookmarks/organize')).state);
  } catch (e) {
    toastError(e);
  }
}

/** Puts the bookmarks back as they were before the last sort. */
export async function undoOrganize() {
  organizeGen++;
  try {
    const r = await post<{ nodes: BookmarkNode[]; state: BookmarkOrganizeState }>('/api/browser/bookmarks/organize/undo');
    useBookmarks.setState({ nodes: r.nodes, loaded: true });
    takeOrganize(r.state);
    toast('Your bookmarks are back as they were', 'info');
  } catch (e) {
    toastError(e);
  }
}

/** Asks how the job is going while it runs (one request at a time, every 1.5 s) for as long as the caller wants it: call the result to stop. */
export function watchOrganize(): () => void {
  let alive = true;
  let busy = false;
  let timer: number | undefined;
  const tick = async () => {
    timer = undefined;
    if (!alive || busy || useOrganize.getState().state?.status !== 'running') return;
    busy = true;
    const gen = organizeGen;
    try {
      const s = await api<BookmarkOrganizeState>('/api/browser/bookmarks/organize', { signal: AbortSignal.timeout(10_000) });
      if (alive && gen === organizeGen) takeOrganize(s);
    } catch {
      // Asked again in a moment.
    } finally {
      busy = false;
    }
    schedule();
  };
  const schedule = () => {
    if (alive && !busy && timer === undefined && useOrganize.getState().state?.status === 'running') timer = window.setTimeout(() => void tick(), 1500);
  };
  const off = useOrganize.subscribe(schedule);
  schedule();
  return () => {
    alive = false;
    off();
    if (timer !== undefined) window.clearTimeout(timer);
  };
}

// ---- read later ------------------------------------------------------------------------------------------------

/** Your Read later list (oldest first, as the server keeps it) and the choice to show what you have read. */
export const useLater = create<{ items: LaterItem[]; loaded: boolean; showRead: boolean }>(() => ({ items: [], loaded: false, showRead: false }));

export async function loadLater() {
  try {
    useLater.setState({ items: (await api<{ items: LaterItem[] }>('/api/browser/browsing/later')).items, loaded: true });
  } catch {}
}

const takeLater = <T extends { items?: LaterItem[] }>(r: T): T => {
  if (r.items) useLater.setState({ items: r.items, loaded: true });
  return r;
};

/** Sets a page aside to read later (a page already on the list goes back to waiting). Whether it could. */
export const addLater = (url: string, title: string) =>
  post<{ items: LaterItem[]; existed: boolean }>('/api/browser/browsing/later', { url, title }).then(
    (r) => (takeLater(r), toast(r.existed ? 'Already on your Read later list' : 'Added to Read later', 'ok'), true),
    (e) => (toastError(e), false),
  );
export const markLater = (id: string, read: boolean) => patch<{ items: LaterItem[] }>(`/api/browser/browsing/later/${enc(id)}`, { read }).then(takeLater, (e) => (toastError(e), null));
export const removeLater = (id: string) => del<{ items: LaterItem[] }>(`/api/browser/browsing/later/${enc(id)}`).then(takeLater, (e) => (toastError(e), null));

/** What is shown of the list: newest first; the pages you have read only with Show read. */
export const laterShown = (items: LaterItem[], showRead: boolean) => items.filter((n) => showRead || n.readAt === undefined).sort((a, b) => b.addedAt - a.addedAt);

/** The items of a folder ('bar', 'other' or a folder's id), in order. */
export const childrenOf = (nodes: BookmarkNode[], parent: string) => nodes.filter((n) => n.parent === parent).sort((a, b) => a.pos - b.pos);

/** Every folder under `id`, and `id` itself: where a folder may not be moved into. */
export function withinFolder(nodes: BookmarkNode[], id: string): Set<string> {
  const out = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of nodes) if (!n.url && !out.has(n.id) && out.has(n.parent)) (out.add(n.id), (grew = true));
  }
  return out;
}

/** How many bookmarks (not folders) are in a folder, however deep. */
export function countIn(nodes: BookmarkNode[], id: string): number {
  const inside = withinFolder(nodes, id);
  return nodes.filter((n) => n.url && inside.has(n.parent)).length;
}

// ---- extensions ------------------------------------------------------------------------------------------------

export const useExtensions = create<{ state: ExtensionsState | null }>(() => ({ state: null }));

export async function loadExtensions() {
  try {
    useExtensions.setState({ state: await api<ExtensionsState>('/api/browser/extensions') });
  } catch {}
}

/** Where an extension's own page is: opened as a tab (its options, its popup where the app cannot show one). */
export const extensionPage = (id: string, page: string) => `chrome-extension://${id}/${page.replace(/^\/+/, '')}`;

/** Adds an extension from the Chrome Web Store by its address or id. */
export async function addFromStore(what: string): Promise<boolean> {
  const t = what.trim();
  try {
    await post('/api/browser/extensions/store', /^[a-p]{32}$/.test(t) ? { id: t } : { url: t });
    await loadExtensions();
    toast('Extension added', 'info');
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

// ---- the agents' browsers --------------------------------------------------------------------------------------

export interface AgentBrowser {
  key: string;
  title?: string;
  agent?: string;
  driver: 'agent' | 'user';
  busy?: string | boolean;
  asks: number;
  engine?: string;
  handedFrom?: string;
  tabs: BrowserTab[];
}

export const useAgentBrowsers = create<{ browsers: AgentBrowser[]; loaded: boolean }>(() => ({ browsers: [], loaded: false }));

export async function loadAgentBrowsers() {
  try {
    const r = await api<{ browsers: AgentBrowser[] }>('/api/browser/browsing/agents');
    useAgentBrowsers.setState({ browsers: r.browsers, loaded: true });
  } catch {}
}

/** Gives a tab handed to an agent back to your own browsing. */
export const takeBack = (tab: string) => post(`/api/browser/browsing/tabs/${enc(tab)}/take-back`).then(() => loadAgentBrowsers(), toastError);

// ---- the answers kept for sites' permission requests ----------------------------------------------------------

export interface SitePermission {
  origin: string;
  permission: string;
  media?: string[];
  allow: boolean;
}

export const useSitePermissions = create<{ list: SitePermission[] | null }>(() => ({ list: null }));

export async function loadSitePermissions() {
  try {
    useSitePermissions.setState({ list: (await api<{ permissions: SitePermission[] }>('/api/browser/browsing/permissions')).permissions });
  } catch {}
}

/** Forgets an answer: the site asks again next time. */
export async function forgetSitePermission(p: SitePermission) {
  try {
    const r = await del<{ permissions: SitePermission[] }>('/api/browser/browsing/permissions', { origin: p.origin, permission: p.permission, ...(p.media ? { media: p.media } : {}) });
    useSitePermissions.setState({ list: r.permissions });
  } catch (e) {
    toastError(e);
  }
}

// ---- your own browser's settings (home page, search engine, ad blocker) --------------------------------------------

export const usePrefs = create<{ prefs: BrowsingPrefs | null }>(() => ({ prefs: null }));

export async function loadPrefs() {
  try {
    takePrefs(await api<BrowsingPrefs>('/api/browser/browsing/prefs'));
  } catch {}
}

/** Keeps the settings, and tells the desktop app which engine its right-click menu searches with. */
function takePrefs(p: BrowsingPrefs) {
  usePrefs.setState({ prefs: p });
  try {
    void desktopBrowser()?.setPrefs?.({ engine: p.engine, ...(p.customSearch ? { customSearch: p.customSearch } : {}) });
  } catch {}
}

/** Changes some of them; false when the server refused (its words are shown). */
export async function savePrefs(p: Partial<Omit<BrowsingPrefs, 'reader'>> & { reader?: Partial<ReaderPrefs> }): Promise<boolean> {
  try {
    takePrefs(await patch<BrowsingPrefs>('/api/browser/browsing/prefs', p));
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

/** The search engines' names. */
export const ENGINE_NAMES: Record<string, string> = { google: 'Google', duckduckgo: 'DuckDuckGo', bing: 'Bing', brave: 'Brave', ecosia: 'Ecosia', startpage: 'Startpage', custom: 'Custom' };

// ---- the address bar's suggestions, history and what you closed ----------------------------------------------------

export const suggest = (q: string, signal?: AbortSignal) => api<SuggestResult>(`/api/browser/browsing/suggest?q=${enc(q)}`, { signal });

export const loadHistory = (q: string, before?: number, limit = 100) =>
  api<{ entries: HistoryEntry[] }>(`/api/browser/browsing/history?q=${enc(q)}&limit=${limit}${before ? `&before=${before}` : ''}`).then((r) => r.entries);

export const deleteHistory = (id: number) => del(`/api/browser/browsing/history/${enc(String(id))}`).then(() => true, (e) => (toastError(e), false));

/** Forgets every visit to one address (a suggestion does not say which entry it came from). */
export async function forgetAddress(url: string): Promise<boolean> {
  try {
    const found = (await loadHistory(url, undefined, 50)).filter((e) => e.url === url);
    for (const e of found) await del(`/api/browser/browsing/history/${enc(String(e.id))}`);
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}

export interface ClearWhat {
  history: boolean;
  cookies: boolean;
  cache: boolean;
  since?: number;
}

export const clearBrowsingData = (what: ClearWhat) => post('/api/browser/browsing/clear', what).then(() => true, (e) => (toastError(e), false));

/** Opens a closed tab again (the newest unless `index`). */
export async function reopenClosed(index?: number) {
  try {
    takeView((await post<{ view: BrowserView }>('/api/browser/browsing/reopen', index === undefined ? {} : { index })).view);
  } catch (e) {
    toastError(e);
  }
}

// ---- the ad blocker: what it blocked, its statistics and its filter lists ---------------------------------------

/** Whether the desktop app tells this page what the ad blocker counted (an older one does not). */
export const adblockCounts = (): boolean => !!desktopBrowser()?.adblockStats;

/** What was blocked on a tab's page, by host (null when the app cannot say). */
export const loadAdblockPage = (tab: string): Promise<AdblockPage | null> => {
  const f = desktopBrowser()?.adblockPage;
  return f ? f.call(desktopBrowser(), tab).then((p) => p ?? null, () => null) : Promise.resolve(null);
};

/** The blocker's statistics and the state of its lists, as the desktop app last said (null: none yet, or an older app). */
export const useAdblockStats = create<{ stats: AdblockStats | null; loaded: boolean }>(() => ({ stats: null, loaded: false }));

/** Reads them again. */
export async function loadAdblockStats(): Promise<AdblockStats | null> {
  const b = desktopBrowser();
  const stats = b?.adblockStats ? await b.adblockStats().catch(() => null) : null;
  useAdblockStats.setState({ stats, loaded: true });
  return stats;
}

/** Forgets the statistics (the counts start again from now). */
export async function resetAdblockStats(): Promise<boolean> {
  const b = desktopBrowser();
  if (!b?.adblockReset) return false;
  const ok = await b.adblockReset().catch(() => false);
  await loadAdblockStats();
  return ok;
}

/** Fetches the filter lists again (the statistics say meanwhile that it is updating), and reads the state they ended in. */
export async function updateAdblockLists(): Promise<boolean> {
  const b = desktopBrowser();
  if (!b?.adblockUpdate) return false;
  const now = useAdblockStats.getState().stats;
  if (now) useAdblockStats.setState({ stats: { ...now, lists: { ...now.lists, updating: true, error: undefined } } });
  const ok = await b.adblockUpdate().catch(() => false);
  await loadAdblockStats();
  return ok;
}

// ---- what a tab tells the app: sound, zoom, blocked ads ----------------------------------------------------------

export type TabState = Omit<TabStateChange, 'target'>;

export const useTabState = create<{ byTab: Record<string, TabState> }>(() => ({ byTab: {} }));

/** A zoom the desktop app reports (a factor like 1.25, or a percent) as a percent. */
export const zoomPercent = (z: number) => (z > 10 ? Math.round(z) : Math.round(z * 100));

/** Hears the tabs' states and what the right-click menu asks, as long as the page is open (the function it returns stops). */
export function listenTabs(onCommand: (c: import('./PageView').PageCommand) => void): () => void {
  const b = desktopBrowser();
  if (!b) return () => {};
  const off1 = b.onTabState((c) => {
    const { target, ...rest } = c;
    useTabState.setState((s) => ({ byTab: { ...s.byTab, [target]: { ...s.byTab[target], ...rest } } }));
  });
  const off2 = b.onCommand(onCommand);
  return () => {
    off1();
    off2();
  };
}

// ---- highlights -------------------------------------------------------------------------------------------------

/** Changes whenever a highlight is made, changed or deleted, so what shows them reads them again. */
const useHighlightTick = create<{ tick: number }>(() => ({ tick: 0 }));
const bumpHighlights = () => useHighlightTick.setState((s) => ({ tick: s.tick + 1 }));

/** The highlights of the page in a tab (null while they load, and for a page that cannot have them), kept up to date. */
export function usePageHighlights(url: string | undefined): PageHighlight[] | null {
  const tick = useHighlightTick((s) => s.tick);
  const [list, setList] = useState<{ url: string; items: PageHighlight[] } | null>(null);
  const page = isWebPage(url) ? url : undefined;
  useEffect(() => {
    if (!page) return;
    let live = true;
    api<{ highlights: PageHighlight[] }>(`/api/browser/browsing/highlights?url=${enc(page)}`).then(
      (r) => live && setList({ url: page, items: r.highlights }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [page, tick]);
  return page && list?.url === page ? list.items : null;
}

/** Highlights what is selected in a tab (the right-click menu's Highlight). */
export async function highlightSelection(tab: string): Promise<PageHighlight | null> {
  try {
    const r = await post<{ highlight: PageHighlight }>('/api/browser/browsing/highlights', { tab });
    bumpHighlights();
    return r.highlight;
  } catch (e) {
    toastError(e);
    return null;
  }
}

/** Takes a highlight away (and its marks from the pages open now). */
export const deleteHighlight = (id: string) => del(`/api/browser/browsing/highlights/${enc(id)}`).then(() => (bumpHighlights(), true), (e) => (toastError(e), false));

/** A highlight's note (empty takes it away). */
export const noteHighlight = (id: string, note: string) =>
  patch<{ highlight: PageHighlight }>(`/api/browser/browsing/highlights/${enc(id)}`, { note }).then((r) => (bumpHighlights(), r.highlight), (e) => (toastError(e), null));

/** Shows a highlight in your Browser: its page in the tab it is open in, or a new one, scrolled to the words. */
export const showHighlight = (id: string) =>
  post<{ view?: BrowserView }>(`/api/browser/browsing/highlights/${enc(id)}/open`).then((r) => (takeView(r.view), true), (e) => (toastError(e), false));

// ---- asking an agent ------------------------------------------------------------------------------------------------

/** Starts a session with these words, the agent the start page last had (as Ask about this page does). */
export async function askAgent(prompt: string): Promise<boolean> {
  const { agent, acp } = lastAgent();
  const r = startSettings().runs?.[agentKey(agent, acp)] ?? {};
  const account = useApp.getState().boot?.accounts.some((a) => a.id === r.account && a.agent === agent) ? r.account : undefined;
  try {
    const made = await post<{ key: string }>('/api/sessions', { agent, acpAgent: agent === 'acp' ? acp : undefined, prompt, model: r.model ?? undefined, account });
    openSession(made.key);
    return true;
  } catch (e) {
    toastError(e);
    return false;
  }
}
