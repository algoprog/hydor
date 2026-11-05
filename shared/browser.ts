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
}

/**
 * Something only the user can do in the browser: what the agent asked for (a login, a captcha), a
 * purchase or payment it stopped before, or an address on this machine it wants to open.
 */
export interface BrowserAsk {
  id: string;
  kind: 'ask' | 'payment' | 'local';
  /** The agent's reason (ask), the button it would have pressed (payment), or the address (local: host:port). */
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
  /** Where the agent's pointer rests, as fractions of the page: the live view shows it there until the agent acts again. */
  pointer?: { x: number; y: number };
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

/** A Chromium the browser can run. */
export interface ChromeInfo {
  path: string;
  source: 'system' | 'playwright' | 'downloaded';
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
