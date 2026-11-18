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
  /** When its page last finished loading (ms): a reload too quick to be seen loading still shows as a new load. */
  loadedAt?: number;
  /** The page's icon (an address, or a data: URL), when it has one. */
  favicon?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  /** The group it is in (your own browsing's tabs), by its id in the view's `groups`. */
  group?: string;
  /**
   * A private tab of your own browsing: its sign-ins, cookies, site data and cache are kept apart, in memory, and forgotten
   * when the last private tab closes; its pages are not kept in the history, the list of closed tabs or the tabs reopened at
   * the next start.
   */
  private?: boolean;
  /** The language its page is in, as found when it loaded (a code of TRANSLATE_LANGS, such as 'de'), when translation is offered. */
  lang?: string;
  /** Its page's translation, from when it starts until the page shows its own words again. */
  translation?: TabTranslation;
  /** Its page has an article that reader view can show. */
  readerable?: boolean;
  /** Reader view shows on it now. */
  reader?: boolean;
}

/** A page's translation in your own browsing (server/browser/translate.ts). */
export interface TabTranslation {
  /** Pieces are still on their way, all found so far are done, or the model could not translate. */
  state: 'translating' | 'translated' | 'failed';
  /** The language it is translated into (a code of TRANSLATE_LANGS). */
  to: string;
  /** The language the page was in, when known. */
  from?: string;
  /** The pieces of the page translated, and found, so far. */
  done: number;
  total: number;
  /** Why it failed, in a sentence. */
  error?: string;
  /** The model that translates, by its name ("Claude Haiku"). */
  model?: string;
}

/**
 * The languages pages are translated into and from: a code (ISO 639-1, and zh-TW for Chinese in traditional characters), its
 * English name and its own. The first ones are the app's own languages.
 */
export const TRANSLATE_LANGS: readonly { code: string; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'zh', name: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'sv', name: 'Swedish', native: 'Svenska' },
  { code: 'da', name: 'Danish', native: 'Dansk' },
  { code: 'no', name: 'Norwegian', native: 'Norsk' },
  { code: 'fi', name: 'Finnish', native: 'Suomi' },
  { code: 'is', name: 'Icelandic', native: 'Íslenska' },
  { code: 'pl', name: 'Polish', native: 'Polski' },
  { code: 'cs', name: 'Czech', native: 'Čeština' },
  { code: 'sk', name: 'Slovak', native: 'Slovenčina' },
  { code: 'sl', name: 'Slovenian', native: 'Slovenščina' },
  { code: 'hr', name: 'Croatian', native: 'Hrvatski' },
  { code: 'sr', name: 'Serbian', native: 'Српски' },
  { code: 'bg', name: 'Bulgarian', native: 'Български' },
  { code: 'mk', name: 'Macedonian', native: 'Македонски' },
  { code: 'ro', name: 'Romanian', native: 'Română' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar' },
  { code: 'sq', name: 'Albanian', native: 'Shqip' },
  { code: 'lt', name: 'Lithuanian', native: 'Lietuvių' },
  { code: 'lv', name: 'Latvian', native: 'Latviešu' },
  { code: 'et', name: 'Estonian', native: 'Eesti' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська' },
  { code: 'be', name: 'Belarusian', native: 'Беларуская' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'ka', name: 'Georgian', native: 'ქართული' },
  { code: 'hy', name: 'Armenian', native: 'Հայերեն' },
  { code: 'az', name: 'Azerbaijani', native: 'Azərbaycan' },
  { code: 'kk', name: 'Kazakh', native: 'Қазақ' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'he', name: 'Hebrew', native: 'עברית' },
  { code: 'fa', name: 'Persian', native: 'فارسی' },
  { code: 'ur', name: 'Urdu', native: 'اردو' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'th', name: 'Thai', native: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu' },
  { code: 'tl', name: 'Filipino', native: 'Filipino' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'sw', name: 'Swahili', native: 'Kiswahili' },
  { code: 'am', name: 'Amharic', native: 'አማርኛ' },
  { code: 'ca', name: 'Catalan', native: 'Català' },
  { code: 'eu', name: 'Basque', native: 'Euskara' },
  { code: 'gl', name: 'Galician', native: 'Galego' },
  { code: 'cy', name: 'Welsh', native: 'Cymraeg' },
  { code: 'ga', name: 'Irish', native: 'Gaeilge' },
  { code: 'af', name: 'Afrikaans', native: 'Afrikaans' },
];

/** Whether a code is one of TRANSLATE_LANGS. */
export const isTranslateLang = (v: unknown): v is string => typeof v === 'string' && TRANSLATE_LANGS.some((l) => l.code === v);

/** A language's English name by its code (the code itself when it is not one of them). */
export const langName = (code: string): string => TRANSLATE_LANGS.find((l) => l.code === code)?.name ?? code;

/** How reader view shows an article: text size in CSS pixels (14 to 28), colours (`auto` follows the app's theme), and font. */
export interface ReaderPrefs {
  size: number;
  theme: 'auto' | 'dark' | 'light' | 'sepia';
  font: 'sans' | 'serif';
}

export const READER_DEFAULTS: ReaderPrefs = { size: 19, theme: 'auto', font: 'serif' };

/** The colours a tab group may have: the app's own (blue, green, amber, red and purple are its info, ok, warn, err and codex colours, orange its claude colour). */
export const GROUP_COLORS = ['grey', 'blue', 'green', 'amber', 'orange', 'red', 'purple'] as const;
export type GroupColor = (typeof GROUP_COLORS)[number];

/** A group of your own browsing's tabs: a name and a colour, folded (its tabs hidden in the tab column) or open. */
export interface BrowserGroup {
  id: string;
  name: string;
  color: GroupColor;
  folded?: boolean;
}

/** The tabs as the tab column shows them: each group (in the order they were made) with its tabs, then the tabs in no group. */
export function inTabOrder<T extends { id: string; group?: string }>(tabs: T[], groups: BrowserGroup[] = []): { group: BrowserGroup | null; tabs: T[] }[] {
  const out: { group: BrowserGroup | null; tabs: T[] }[] = [];
  for (const g of groups) {
    const mine = tabs.filter((t) => t.group === g.id);
    if (mine.length) out.push({ group: g, tabs: mine });
  }
  const loose = tabs.filter((t) => !t.group || !groups.some((g) => g.id === t.group));
  if (loose.length) out.push({ group: null, tabs: loose });
  return out;
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
  /** The groups your tabs are in (your own browsing), in the order they were made; a tab says which one is its own. */
  groups?: BrowserGroup[];
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

/**
 * Organize with AI (the Bookmarks panel): the helper model sorts your bookmarks into folders by topic. Either way the
 * links pinned on the bookmarks bar itself stay where they are, and Undo puts everything back until the bookmarks change.
 */
export interface BookmarkOrganizeStart {
  /**
   * true (Keep my folders): your folders, and the bookmarks in them, stay as they are; loose bookmarks (in Other bookmarks
   * itself, or in folders that only collect them, such as an import's) go into the folder that fits, one of yours or a
   * new one, and such collecting folders left empty go. false (Start over): every bookmark goes into new folders by topic
   * in Other bookmarks, and the old folders go once empty.
   */
  keepFolders: boolean;
}

/** Where Organize with AI stands (GET /api/browser/bookmarks/organize). */
export interface BookmarkOrganizeState {
  /** idle: nothing to show; running; done: applied (see the counts); failed: nothing was changed (see error). */
  status: 'idle' | 'running' | 'done' | 'failed';
  keepFolders?: boolean;
  /** While running: 'plan' while the folders are worked out, 'sort' while the bookmarks are filed into them. */
  step?: 'plan' | 'sort';
  /** While sorting: how many bookmarks are sorted so far, of how many. When done: `total` is how many were looked at. */
  done?: number;
  total?: number;
  startedAt?: number;
  finishedAt?: number;
  /** When done: bookmarks moved, new folders made, old folders removed, and bookmarks the model gave no folder (they stay where they were). */
  moved?: number;
  made?: number;
  removed?: number;
  left?: number;
  /** When done: Undo can still put the bookmarks back as they were (nothing has changed them since). */
  canUndo?: boolean;
  /** When failed: why, in a sentence. */
  error?: string;
}

/** A page you set aside to read later (your own browsing; agents never see the list). */
export interface LaterItem {
  id: string;
  url: string;
  title: string;
  addedAt: number;
  /** When you marked it as read; unset while it waits. */
  readAt?: number;
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
  /** What you must allow first: 'full-disk-access' when macOS keeps Hydor from reading it (Safari, until Hydor has Full Disk Access). */
  needs?: 'full-disk-access';
}

/** The history of another browser on this computer (or of one of its profiles) that can be imported. */
export interface HistorySource {
  /** The same as its BookmarkSource's id, so the two lists can be put together: 'chrome:Default', 'firefox:abc.default-release', 'safari'. */
  id: string;
  /** The browser's name as people know it (Google Chrome, Microsoft Edge, Firefox, Safari…). */
  browser: string;
  /** Its profile's name, when it has several. */
  profile?: string;
  /** How many pages of its history would come in (its latest 20,000 at most). */
  count: number;
  /** Why it cannot be read now, when it cannot (Safari without Full Disk Access, its file held by the browser while it runs…). */
  error?: string;
  /** What you must allow first: 'full-disk-access' when macOS keeps Hydor from reading it (Safari, until Hydor has Full Disk Access). */
  needs?: 'full-disk-access';
}

/** What importing another browser's history did. */
export interface HistoryImport {
  /** Pages new to your history. */
  added: number;
  /** Pages your history had already, now with that browser's visits (a later last visit, more visits). */
  updated: number;
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
  /** Hide cookie banners (with the ad blocker on): EasyList's cookie notice list added to its lists. On at first. */
  cookieBanners: boolean;
  /** The language pages are translated into (a code of TRANSLATE_LANGS): the app's own language at first. */
  translateTo: string;
  /** Offer to translate a page whose language is not `translateTo` (a button in the address bar). On at first. */
  translateOffer: boolean;
  /** Languages whose pages are translated as soon as they load, and languages never offered (codes of TRANSLATE_LANGS). */
  translateAlways: string[];
  translateNever: string[];
  /** Sites never offered or translated by themselves (hosts, without www.). */
  translateNeverSites: string[];
  /** Pages without a dark look of their own are shown dark (Chromium's auto dark mode). Off at first. */
  darkPages: boolean;
  /** Sites shown as they are while dark pages is on (hosts, without www.). */
  darkExcept: string[];
  /** Pages may play sound by themselves, before you click or type in them. Off at first: sound waits until you use the page. */
  autoplay: boolean;
  /** How reader view shows articles. */
  reader: ReaderPrefs;
  /** The Browser page has offered once to bring in the other browsers' bookmarks and history (in the desktop app; the welcome tour's page counts too). */
  importOffered: boolean;
}

/** A page you visited in your own browser. */
/** A file your own browser downloaded, as the Library's Downloads list shows it (server/browser/downloads.ts keeps them). */
export interface DownloadEntry {
  id: number;
  name: string;
  /** Where it was saved ('' when it failed). */
  path: string;
  /** The address it came from ('' when it has none a page could open: a blob or data address). */
  url: string;
  at: number;
  failed: boolean;
}

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
  /** A page: from your history or bookmarks, or what you typed as an address. `meaning`: it was found by what it is about, none of the words typed are in it. */
  | { kind: 'history' | 'bookmark' | 'url'; url: string; title?: string; meaning?: true }
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
