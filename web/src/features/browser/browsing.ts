// What the Browser page (BrowserPage.tsx) shares between its parts: the browser of your own (key 'browsing') as
// the server's routes have it, your bookmarks and extensions, the agents' browsers open now, the desktop app's
// bridge to its pages, and the plain words for what a site may ask for.
import { create } from 'zustand';
import { BROWSING_KEY, type BookmarkNode, type BrowserPermissionAsk, type BrowserTab, type BrowserView, type ExtensionsState } from '@shared/browser';
import { api, del, enc, patch, post } from '../../lib/api';
import { toast, toastError } from '../../lib/store';
import { desktopBrowser, nativePages } from './PageView';
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

/** What was typed in the address bar: an address is opened, anything else searched. */
export async function goTo(text: string, o: { tab?: string; newTab?: boolean } = {}) {
  try {
    takeView((await post<{ view: BrowserView }>('/api/browser/browsing/go', { text, ...o })).view);
  } catch (e) {
    toastError(e);
  }
}

export async function newTab(url?: string) {
  try {
    takeView((await post<{ view: BrowserView }>('/api/browser/browsing/tabs', url ? { url } : {})).view);
  } catch (e) {
    toastError(e);
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
