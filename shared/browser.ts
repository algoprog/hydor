// The web browser agents drive (server/browser), as the pages see it: a session's browser and its live
// view (with the agent's pointer in it), the user's input when they take over, the cards it adds to a
// conversation, and Settings → Browser.
import type { AgentPointer } from './pointer.ts';

/** One tab of a session's browser. */
export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  active: boolean;
  loading?: boolean;
  /** The page's icon (an address, or a data: URL), when it has one. */
  favicon?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
}

/**
 * Which browser runs a session's tabs: a Chromium the server started (`chrome`, its pages seen as pictures), or the
 * desktop app's own (`desktop`: the app's window shows its pages themselves, and you use them as in any browser).
 */
export type BrowserEngine = 'chrome' | 'desktop';

/** BrowserSettings.chrome's value for the desktop app's own browser. */
export const DESKTOP_CHROME = 'desktop';

/** The browser of your own (the Browser page): its key, and the profile that keeps its sign-ins. Agents never get it. */
export const BROWSING_KEY = 'browsing';
export const BROWSING_PROFILE = 'browsing';

/**
 * Something only the user can do in the browser: what the agent asked for (a login, a captcha), a
 * purchase or payment it stopped before, an address on this machine it wants to open, or a button that would send,
 * post, delete or transfer something on a signed-in site, which it may press only once you allow it (confirm).
 */
export interface BrowserAsk {
  id: string;
  kind: 'ask' | 'payment' | 'local' | 'confirm';
  /**
   * The agent's reason (ask), the button it would have pressed (payment, confirm: its words, as “Send”), or the
   * address (local: host:port).
   */
  text: string;
  url?: string;
  title?: string;
  at: number;
}

/** A JavaScript dialog the page opened (alert, confirm, prompt, or "leave this page?"): for the user to answer. */
export interface BrowserDialog {
  type: 'alert' | 'confirm' | 'prompt' | 'beforeunload';
  message: string;
  defaultPrompt?: string;
  url: string;
}

/** A session's browser, for its live view. */
export interface BrowserView {
  key: string;
  open: boolean;
  /** The logged-in profile it uses (Settings → Browser); a fresh one when unset. */
  profile?: string;
  profileName?: string;
  tabs: BrowserTab[];
  /** Who drives: the agent, or the user who took over. */
  driver: 'agent' | 'user';
  /** What the agent is doing right now ("Clicking “Sign in”"). */
  busy?: string;
  /** Waiting for the user, oldest first. */
  asks: BrowserAsk[];
  dialog?: BrowserDialog;
  /** The page's size in CSS pixels; `mobile` while it is laid out for a phone the user drives from. */
  viewport: { w: number; h: number; mobile?: boolean };
  /** Files the browser saved lately, into the session's folder. */
  downloads: { name: string; path: string; done: boolean; failed?: boolean; at: number }[];
  /** Tabs you closed lately (your own browsing), newest first: to open again (Ctrl+Shift+T). */
  closed?: ClosedTab[];
  /** Where the agent's pointer rests, as fractions of the page: the live view shows it there until the agent acts again. */
  pointer?: { x: number; y: number };
  /** Which browser runs it (shown as the page itself in the desktop app's window when `desktop`). */
  engine?: BrowserEngine;
  /**
   * The session got its tab from your own browsing (Do this here): the site it is kept to. It works with your
   * sign-ins there, uses nothing but the browser, and asks before it sends, posts, deletes or transfers anything.
   */
  handedFrom?: string;
  /** A site asks for a permission in your own browsing (camera, microphone, location, notifications…). */
  permission?: BrowserPermissionAsk;
}

/** A page of your own browsing asks for a permission: yours to allow or block. */
export interface BrowserPermissionAsk {
  id: string;
  /** Chromium's name for it: media, geolocation, notifications, clipboard-read, midi… */
  permission: string;
  /** For media: which ones (video, audio). */
  media?: string[];
  /** The site asking (its origin). */
  origin: string;
  tab: string;
}

/** News from the server ({ t: 'feature', id: 'browser', key, data }); `download` goes to every page. */
export type BrowserEvent =
  | { type: 'state'; view: BrowserView }
  | { type: 'frame'; tab: string; data: string; w: number; h: number }
  /** The agent's pointer moves or acts (shared/pointer.ts), for the live view to draw. */
  | { type: 'pointer'; tab: string; pointer: AgentPointer }
  | { type: 'download'; download: ChromeDownload };

/** Shift, Control, Alt and Meta, as CDP counts them. */
export const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 } as const;

/** The user's input while they drive; x and y are fractions of the page's width and height. */
export type BrowserInput =
  | { t: 'mouse'; type: 'down' | 'up' | 'move'; x: number; y: number; button?: 'left' | 'middle' | 'right'; clicks?: number; mods?: number }
  | { t: 'wheel'; x: number; y: number; dx: number; dy: number }
  | { t: 'key'; type: 'down' | 'up'; key: string; code?: string; keyCode?: number; text?: string; mods?: number }
  | { t: 'text'; text: string };

/** A Chromium the browser can run: `path` is DESKTOP_CHROME for the desktop app's own. */
export interface ChromeInfo {
  path: string;
  source: 'system' | 'playwright' | 'downloaded' | 'desktop';
  label: string;
  version?: string;
  /** Playwright's headless shell: it cannot show a window. */
  shell?: boolean;
}

export interface BrowserSettings {
  /** Unset: on when a Chromium is found. */
  enabled?: boolean;
  /** The Chromium to use (its path), or '' for the best one found. */
  chrome: string;
  headless: boolean;
  /** Keep pages away from this machine and its network (a session can allow its own dev server). */
  blockPrivate: boolean;
  /** Screenshots for models that see images. */
  screenshots: boolean;
  /** Only these sites (and their subdomains), when any are listed. */
  allow: string[];
  /** Never these sites. */
  block: string[];
  /**
   * Ask before an agent presses a button that sends, posts, publishes, deletes or transfers something on a site it is
   * signed in to (a profile that keeps sign-ins, or a tab you handed it from your own browsing). On unless turned off.
   */
  confirmSignedIn?: boolean;
}

/** A named profile: a browser folder of its own that keeps logins, which the user fills by taking over. */
export interface BrowserProfile {
  id: string;
  name: string;
  createdAt: number;
}

export interface ChromeDownload {
  state: 'idle' | 'running' | 'done' | 'failed';
  received?: number;
  total?: number;
  version?: string;
  error?: string;
}

/** Settings → Browser. */
export interface BrowserSettingsState {
  settings: BrowserSettings & { enabled: boolean };
  chromes: ChromeInfo[];
  /** The one in use. */
  chrome: ChromeInfo | null;
  download: ChromeDownload;
  profiles: BrowserProfile[];
  /** Chrome's own sandbox is off: this system does not allow it. */
  noSandbox?: boolean;
  /** Browsers open now. */
  open: number;
}

/** A session's own browser settings (its settings' `browser` field). */
export interface SessionBrowserOptions {
  profile?: string;
  allow?: string[];
  block?: string[];
  /** Addresses on this machine or its network the user allowed for it (host:port). */
  local?: string[];
}

/** A card the browser adds to the conversation (a note of kind "browser"). */
export interface BrowserNote {
  ask: BrowserAsk;
  status: 'waiting' | 'done' | 'skipped';
  endedAt?: number;
}

/**
 * What the agent is doing right now in a few words, for the live view's busy line: whole phrases, so the page
 * translates them (`name` is the part's name as the page has it, in quotes, or its number).
 */
export function busyWords(action: string, name: string, more: { direction?: string; keys?: string } = {}): string {
  switch (action) {
    case 'click':
    case 'double_click':
      return `Clicking ${name}`;
    case 'hover':
      return `Pointing at ${name}`;
    case 'type':
      return `Typing into ${name}`;
    case 'select':
      return `Choosing in ${name}`;
    case 'scroll':
      return more.direction === 'up' ? 'Scrolling up' : more.direction === 'left' ? 'Scrolling left' : more.direction === 'right' ? 'Scrolling right' : 'Scrolling down';
    case 'keys':
      return `Pressing ${more.keys ?? ''}`;
    case 'back':
      return 'Going back';
    default:
      return 'Waiting';
  }
}

// ---- your own browsing: bookmarks and extensions ----------------------------------------------------------------

/** The two folders every bookmark sits under, directly or in folders of its own. */
export const BOOKMARK_ROOTS = ['bar', 'other'] as const;
export type BookmarkRoot = (typeof BOOKMARK_ROOTS)[number];

/** A bookmark (with `url`) or a folder (without). */
export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  /** The folder it is in: a folder's id, or 'bar' (the bookmarks bar) or 'other' (Other bookmarks). */
  parent: string;
  /** Its place in that folder, from 0. */
  pos: number;
  addedAt: number;
}

/** Bookmarks of another browser on this computer that can be imported. */
export interface BookmarkSource {
  /** Stable for a scan: the browser and profile ('chrome:Default', 'firefox:abc.default-release', 'safari'). */
  id: string;
  /** The browser's name as people know it (Google Chrome, Microsoft Edge, Firefox, Safari…). */
  browser: string;
  /** Its profile's name, when it has several. */
  profile?: string;
  /** How many bookmarks it has (folders not counted). */
  count: number;
  /** Why it cannot be read now, when it cannot (Safari without Full Disk Access, Firefox's file locked…). */
  error?: string;
}

/** A Chrome extension in your own browsing (the desktop app's browser runs it). */
export interface BrowserExtension {
  /** Its Chrome Web Store id (32 letters a–p): from the store, the browser it came from, or its key. */
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Where it came from: the Chrome Web Store, a folder on this computer, or another browser here. */
  source: 'store' | 'folder' | 'import';
  /** The browser it was imported from, or the folder it is loaded from. */
  from?: string;
  enabled: boolean;
  /** Also in agents' browsers that keep sign-ins (profiles): off unless you turn it on. */
  agents: boolean;
  /** Its toolbar button, when it has one: its words and its popup page (inside the extension). */
  action?: { title?: string; popup?: string };
  /** Whether it has an icon (GET /api/browser/extensions/:id/icon). */
  icon?: boolean;
  /** Its options page inside the extension, when it has one. */
  options?: string;
  manifestVersion: number;
  /** The chrome.* APIs it asks for that the desktop app's browser does not have: those parts of it may not work. */
  unsupported?: string[];
  installedAt: number;
}

/** An extension installed in another browser on this computer, which can be brought in. */
export interface ExtensionSource {
  /** `<browser source id>/<extension id>`. */
  id: string;
  extensionId: string;
  browser: string;
  profile?: string;
  name: string;
  version: string;
  /** Turned on in that browser. */
  enabled: boolean;
  /** Already brought in. */
  have: boolean;
}

/** Your own browsing's extensions, and those of other browsers here that can be brought in. */
export interface ExtensionsState {
  extensions: BrowserExtension[];
  sources: ExtensionSource[];
  /** Extensions run only in the desktop app's own browser; false elsewhere (they are kept, and run there). */
  runs: boolean;
}

// ---- your own browsing: what you set for it, its history and the address bar's suggestions ----------------------

/** The search engines the address bar can use (`custom`: a template of your own with %s for the words). */
export const SEARCH_ENGINES = ['google', 'duckduckgo', 'bing', 'brave', 'ecosia', 'startpage', 'custom'] as const;
export type SearchEngine = (typeof SEARCH_ENGINES)[number];

/** Your own browser's settings (the Browser page's settings panel). */
export interface BrowsingPrefs {
  /** The home page: the Home button, new tabs and a first start open it (Google unless you change it). */
  home: string;
  /** Where words typed in the address bar are searched. */
  engine: SearchEngine;
  /** For `custom`: the search page's address with %s where the words go. */
  customSearch?: string;
  /** Search suggestions from the engine as you type (what you type goes to it, as in any browser). */
  suggest: boolean;
  /** Block ads and trackers (the desktop app's own blocker). */
  adblock: boolean;
  /** Sites where ads are allowed (hosts, without www.). */
  allowAds: string[];
}

/** A page you visited in your own browser. */
export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  /** When you last visited it (ms). */
  at: number;
  /** How many times you visited it, and typed its address. */
  visits: number;
  typed: number;
}

/** A tab you closed lately, to open again. */
export interface ClosedTab {
  url: string;
  title: string;
  at: number;
}

/** One suggestion under the address bar. */
export type Suggestion =
  /** A page: from your history or bookmarks, or what you typed as an address. */
  | { kind: 'history' | 'bookmark' | 'url'; url: string; title?: string }
  /** One of your open tabs: switch to it. */
  | { kind: 'tab'; url: string; title?: string; tab: string }
  /** Words to search with your search engine. */
  | { kind: 'search'; text: string };

/** The address bar's suggestions for what you typed. */
export interface SuggestResult {
  /** The address to complete what you typed to, inline (it starts with what you typed, scheme and www. left out). */
  inline?: string;
  items: Suggestion[];
}
