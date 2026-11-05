// Computer use in the desktop apps (server/computer/): agents see the computer's screen and use its mouse and keyboard,
// on a Mac, on Windows, and on Linux with an X11 desktop. What the pages and the server share about it.

/** The desktop app's system. */
export type ComputerSystem = 'mac' | 'windows' | 'linux';

/** macOS's answer for Screen Recording (Electron's getMediaAccessStatus). */
export type ScreenAccess = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown';

/** What macOS lets Hydor do; the programs its server starts do it in the app's name. */
export interface ComputerPermissions {
  /** Accessibility: use the mouse and keyboard. */
  accessibility: boolean;
  /** Screen Recording: see the screen. */
  screen: ScreenAccess;
}

/** The session whose agent is using the computer now. */
export interface ComputerActive {
  key: string;
  title: string;
  since: number;
}

/** Settings → Capabilities → Computer use. */
export interface ComputerState {
  /** The server runs inside a desktop app (Mac, Windows, Linux), the only place computer use works. */
  available: boolean;
  /** Which desktop app (null: none). */
  system: ComputerSystem | null;
  /** What keeps computer use from working on this computer now (a Linux desktop on Wayland, a library missing), in words. */
  problem?: string | null;
  /** Let agents use this computer (off at first). */
  enabled: boolean;
  /** What macOS allows (null: the Mac app did not say). Only in the Mac app. */
  permissions?: ComputerPermissions | null;
  /** The session using the computer now. */
  active: ComputerActive | null;
  /** How many sessions the user allowed (until Stop, or the app restarts). */
  allowed: number;
}

/** Computer use's news to the pages ({ t: 'feature', id: 'computer' }). */
export type ComputerEvent = { type: 'active'; active: ComputerActive | null };

/**
 * What the user reads about computer use outside the pages, by system: the card a session shows the first time its
 * agent wants the computer, the note after Stop, and the glow's note at the top of the screen while an agent is at it.
 * The server says them in the language the user reads the app in, from the pages' dictionaries (npm run
 * i18n:extract reads them here).
 */
export const COMPUTER_WORDS: Record<ComputerSystem, { title: string; again: string; detail: string; stopped: string; using: string }> = {
  mac: {
    title: 'Let the agent use your Mac?',
    again: 'You stopped the agent using your Mac. Let it go on?',
    detail:
      'It sees your screen and uses the mouse and keyboard, in any app, for the rest of this session. While it works, a glow lines the edges of your screen. To stop it at any time, press **Esc** (or choose **Stop** in the menu bar); it asks again before it goes on.',
    stopped: 'Stopped: agents no longer use your Mac until you allow it again',
    using: 'An agent is using your Mac',
  },
  windows: {
    title: 'Let the agent use your PC?',
    again: 'You stopped the agent using your PC. Let it go on?',
    detail:
      'It sees your screen and uses the mouse and keyboard, in any app, for the rest of this session. While it works, a glow lines the edges of your screen. To stop it at any time, press **Esc** (or choose **Stop** from Hydor’s icon in the notification area); it asks again before it goes on.',
    stopped: 'Stopped: agents no longer use your PC until you allow it again',
    using: 'An agent is using your PC',
  },
  linux: {
    title: 'Let the agent use your computer?',
    again: 'You stopped the agent using your computer. Let it go on?',
    detail:
      'It sees your screen and uses the mouse and keyboard, in any app, for the rest of this session. While it works, a glow lines the edges of your screen. To stop it at any time, press **Esc** (or choose **Stop** from Hydor’s icon in the system tray); it asks again before it goes on.',
    stopped: 'Stopped: agents no longer use your computer until you allow it again',
    using: 'An agent is using your computer',
  },
};

/** The card's two buttons. */
export const COMPUTER_ALLOW = 'Allow for this session';
export const COMPUTER_DENY = 'Not now';
/** The glow's note: what stops the agent. */
export const PRESS_ESC = 'Press Esc to stop';
/** The tag beside the agent's pointer over the screen (and in the browser's live view). */
export const AGENT_TAG = 'Agent';
