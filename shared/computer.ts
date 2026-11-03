// Computer use in the Mac app (server/computer/): agents see the Mac's screen and use its mouse and keyboard. What
// the pages and the server share about it.

/** macOS's answer for Screen Recording (Electron's getMediaAccessStatus). */
export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

/** What macOS lets Hydor do; the programs its server starts do it in the app's name. */
export interface ComputerPermissions {
  /** Accessibility: use the mouse and keyboard. */
  accessibility: boolean;
  /** Screen Recording: see the screen. */
  screen: ScreenAccess;
}

/** The session whose agent is using the Mac now. */
export interface ComputerActive {
  key: string;
  title: string;
  since: number;
}

/** Settings → Capabilities → Computer use. */
export interface ComputerState {
  /** The server runs inside the Mac app, the only place computer use works. */
  available: boolean;
  /** Let agents use this Mac (off at first). */
  enabled: boolean;
  /** What macOS allows (null: the Mac app did not say). Absent outside the Mac app. */
  permissions?: ComputerPermissions | null;
  /** The session using the Mac now. */
  active: ComputerActive | null;
  /** How many sessions the user allowed (until Stop, or the app restarts). */
  allowed: number;
}

/** Computer use's news to the pages ({ t: 'feature', id: 'computer' }). */
export type ComputerEvent = { type: 'active'; active: ComputerActive | null };

/**
 * The card a session shows the first time its agent wants the Mac, in the language the user reads the app in (the
 * server words it from these with the pages' dictionaries: npm run i18n:extract reads them here).
 */
export const COMPUTER_CARD = {
  title: 'Let the agent use your Mac?',
  again: 'You stopped the agent using your Mac. Let it go on?',
  detail:
    'It sees your screen and uses the mouse and keyboard, in any app, for the rest of this session. To stop it at any time, choose **Stop** in the menu bar or press **⌘⇧Esc**; it asks again before it goes on.',
  allow: 'Allow for this session',
  deny: 'Not now',
};

/** The note in every page after Stop in the menu bar or ⌘⇧Esc. */
export const STOPPED_NOTE = 'Stopped: agents no longer use your Mac until you allow it again';
