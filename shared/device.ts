// Settings kept on each device, in its browser: the look, the language, the chime, what Enter does, the sidebar, and
// voice. Every open page tells the server its own (web/src/lib/device.ts) when it opens and whenever one changes, so
// an agent reads them (app_api's GET /device, and GET /api/settings) as it changes them (PUT /device: the pages showing
// its session switch at once). One set per browser, so each page reports the browser it runs in.
import { isLang, LANGS, type Lang } from './i18n.ts';

export interface DeviceSettings {
  theme: 'dark' | 'light' | 'system';
  /** The themes shown in dark mode and in light mode, by name ("Naget Dark", "Midnight", or one of the user's). */
  darkTheme: string;
  lightTheme: string;
  motion: 'full' | 'calm' | 'off';
  textSize: 'default' | 'large' | 'larger';
  language: Lang;
  /** A chime with each notice while the app is open. */
  sound: boolean;
  /** What Enter does while an agent works: join its turn, or wait in the queue for it to end. */
  enter: 'join' | 'queue';
  terminalSuggestions: boolean;
  /** The sidebar shown on a computer. */
  sidebar: boolean;
  /** The sidebar's groups for projects and folders (false: sessions by day only). */
  groupSessions: boolean;
  /** The language you speak, for dictation: a BCP 47 tag such as "de-DE"; '' follows the browser's. */
  voiceLanguage: string;
  /** Dictation by the browser's own recognition, or by the app's (when Settings → Voice has it on). */
  dictation: 'browser' | 'server';
  /** The voice replies are read aloud in, by its name; '' lets the browser pick one for the language. */
  readingVoice: string;
  /** How fast replies are read aloud, 0.5 to 2. */
  readingSpeed: number;
}

/** Whether a device gets notices: on, off, blocked (the browser said no to them), unsupported, or app (the desktop app shows them itself). */
export type DeviceNotices = 'on' | 'off' | 'blocked' | 'unsupported' | 'app';

/** What a page tells the server about the browser it runs in. */
export interface DeviceReport {
  /** The page's own id: one for each open page. */
  id: string;
  /** Which browser and system it is: "Chrome on Mac", "Hydor for Windows", "Safari on iPhone (Home Screen)". */
  label: string;
  settings: Partial<DeviceSettings>;
  /** Read only: turning notices on asks the browser's own permission, which only the person can give. */
  notifications?: DeviceNotices;
  /** Read only: the voices it can read aloud in, for the language spoken first (names, at most 40). */
  voices?: string[];
}

const oneOf =
  <T extends string>(...xs: T[]) =>
  (v: unknown): T | undefined =>
    xs.includes(v as T) ? (v as T) : undefined;
const yesNo = (v: unknown) => (typeof v === 'boolean' ? v : undefined);
const name = (max: number) => (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const speechTag = (v: unknown) => (typeof v === 'string' && (v === '' || /^[a-z]{2,3}(-[a-z0-9]{2,8}){0,3}$/i.test(v)) ? v : undefined);
const speed = (v: unknown) => (typeof v === 'number' && v >= 0.5 && v <= 2 ? Math.round(v * 10) / 10 : undefined);

/** Each setting's values, as a page reports it and as an agent sets it. */
const SETTING: { [K in keyof DeviceSettings]: (v: unknown) => DeviceSettings[K] | undefined } = {
  theme: oneOf('dark', 'light', 'system'),
  darkTheme: name(60),
  lightTheme: name(60),
  motion: oneOf('full', 'calm', 'off'),
  textSize: oneOf('default', 'large', 'larger'),
  language: (v) => (isLang(v) ? v : undefined),
  sound: yesNo,
  enter: oneOf('join', 'queue'),
  terminalSuggestions: yesNo,
  sidebar: yesNo,
  groupSessions: yesNo,
  voiceLanguage: speechTag,
  dictation: oneOf('browser', 'server'),
  readingVoice: name(120),
  readingSpeed: speed,
};

/** What an agent may set on a device (PUT /device): the settings, and themeName, a theme picked by its name for dark or light mode (as its base is). */
export const DEVICE_KEYS = [...Object.keys(SETTING).filter((k) => k !== 'darkTheme' && k !== 'lightTheme'), 'themeName'];

/** The values each takes, in words: for the agent told it got one wrong, and for the guide. */
export const DEVICE_VALUES = `theme (dark, light, system), themeName (a theme's name: it shows in dark or light mode, as the theme's base is), motion (full, calm, off), textSize (default, large, larger), language (${LANGS.map((l) => l.id).join(', ')}), sound, terminalSuggestions, sidebar, groupSessions (true or false), enter (join, queue), voiceLanguage (the language spoken, for dictation: a tag such as "de-DE", or "" for the browser's), dictation (browser, server), readingVoice (a voice's name from GET /device, or "" for the browser's pick), readingSpeed (0.5 to 2)`;

/** An agent's change, checked: the settings to send, and the names it got wrong. */
export function deviceChange(body: Record<string, unknown>): { set: Record<string, unknown>; bad: string[] } {
  const set: Record<string, unknown> = {};
  const bad: string[] = [];
  for (const [k, v] of Object.entries(body)) {
    const ok = k === 'themeName' ? (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined) : k !== 'darkTheme' && k !== 'lightTheme' && k in SETTING ? SETTING[k as keyof DeviceSettings](v) : undefined;
    if (ok === undefined) bad.push(k);
    else set[k] = ok;
  }
  return { set, bad };
}

/** A page's report, kept to what it may say (it comes from the browser). */
export function cleanReport(r: unknown): DeviceReport | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Record<string, unknown>;
  const id = typeof x.id === 'string' && /^[\w-]{4,40}$/.test(x.id) ? x.id : null;
  if (!id) return null;
  const settings: Partial<DeviceSettings> = {};
  const given = x.settings && typeof x.settings === 'object' ? (x.settings as Record<string, unknown>) : {};
  for (const k of Object.keys(SETTING) as (keyof DeviceSettings)[]) {
    const v = SETTING[k](given[k]);
    if (v !== undefined) (settings as Record<string, unknown>)[k] = v;
  }
  const notifications = oneOf<DeviceNotices>('on', 'off', 'blocked', 'unsupported', 'app')(x.notifications);
  const voices = Array.isArray(x.voices) ? x.voices.filter((v): v is string => typeof v === 'string' && !!v.trim()).slice(0, 40).map((v) => v.trim().slice(0, 120)) : undefined;
  return { id, label: name(80)(x.label) || 'A browser', settings, ...(notifications ? { notifications } : {}), ...(voices?.length ? { voices } : {}) };
}
