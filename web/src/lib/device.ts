// The settings this browser keeps (theme, language, the chime, what Enter does, the sidebar, the conversation's zoom, voice), told to the server
// of the machine this page shows when the page connects and whenever one changes: agents read them (app_api's GET
// /device, GET /api/settings) as they change them (features/guide applies a change). shared/device.ts says what each is.
import type { DeviceNotices, DeviceReport, DeviceSettings } from '@shared/device';
import { validZoom } from '@shared/zoom';
import { speechLang, useVoicePrefs } from '../features/voice/prefs';
import { currentLang } from '../i18n';
import { desktopSystem, inDesktopApp, notifyPrefs, pushState } from './notify';
import { useUI } from './store';
import { findTheme, useThemes } from './theme';
import { live } from './ws';

/** This page's own id: one for each open page, so an agent can name it. */
const PAGE_ID = (() => {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return `p-${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}`;
})();

/** Which browser and system this is, in a few words: "Chrome on Mac", "Hydor for Windows", "Safari on iPhone (Home Screen)". */
function deviceLabel(): string {
  if (inDesktopApp) return `Hydor for ${desktopSystem === 'windows' ? 'Windows' : desktopSystem === 'linux' ? 'Linux' : 'Mac'}`;
  const ua = navigator.userAgent;
  const system = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'A browser';
  const home = window.matchMedia?.('(display-mode: standalone)').matches ? ' (Home Screen)' : '';
  return `${browser}${system ? ` on ${system}` : ''}${home}`;
}

const NOTICES: Record<string, DeviceNotices> = { on: 'on', off: 'off', denied: 'blocked', unsupported: 'unsupported', app: 'app' };

/** The voices this browser reads aloud in, those for the language spoken first. */
function voices(lang: string): SpeechSynthesisVoice[] {
  if (typeof speechSynthesis === 'undefined') return [];
  const base = speechLang(lang).toLowerCase().split('-')[0];
  return [...speechSynthesis.getVoices()].sort((a, b) => Number(b.lang.toLowerCase().startsWith(base)) - Number(a.lang.toLowerCase().startsWith(base)) || a.name.localeCompare(b.name));
}

async function report(): Promise<DeviceReport> {
  const ui = useUI.getState();
  const v = useVoicePrefs.getState();
  const all = voices(v.lang);
  let enter: DeviceSettings['enter'] = 'join';
  try {
    if (localStorage.getItem('wa.followUp') === 'queue') enter = 'queue';
  } catch {}
  const settings: Partial<DeviceSettings> = {
    theme: ui.theme,
    darkTheme: findTheme(ui.darkTheme)?.name ?? ui.darkTheme,
    lightTheme: findTheme(ui.lightTheme)?.name ?? ui.lightTheme,
    motion: ui.motion,
    textSize: ui.textSize,
    zoom: Math.round(validZoom(ui.convZoom) * 100),
    language: currentLang(),
    sound: notifyPrefs().sound,
    enter,
    terminalSuggestions: ui.termSuggest,
    wordSuggestions: ui.wordSuggestions,
    technicalDetails: ui.technicalDetails,
    sidebar: ui.sideOpen,
    groupSessions: ui.groupByFolder,
    voiceLanguage: v.lang,
    dictation: v.use,
    readingVoice: v.voice ? (all.find((x) => x.voiceURI === v.voice)?.name ?? v.voice) : '',
    readingSpeed: v.rate,
  };
  const notifications = NOTICES[await pushState().catch(() => 'unsupported')] ?? 'unsupported';
  return { id: PAGE_ID, label: deviceLabel(), settings, notifications, ...(all.length ? { voices: all.slice(0, 40).map((x) => x.name) } : {}) };
}

let timer: number | null = null;

/** Tell the server again, a moment after a setting of this browser's changed (several changes at once go as one). */
export function deviceChanged() {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void report()
      .then((r) => live.device(r))
      .catch(() => {});
  }, 400);
}

const WATCHED = ['theme', 'darkTheme', 'lightTheme', 'motion', 'textSize', 'convZoom', 'termSuggest', 'wordSuggestions', 'technicalDetails', 'sideOpen', 'groupByFolder'] as const;

/** Starts telling: now, and whenever one of these settings changes. */
export function startDeviceReports() {
  deviceChanged();
  useUI.subscribe((s, prev) => {
    if (WATCHED.some((k) => s[k] !== prev[k])) deviceChanged();
  });
  useVoicePrefs.subscribe(deviceChanged);
  useThemes.subscribe(deviceChanged);
  window.addEventListener('hydor:device', deviceChanged);
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.addEventListener?.('voiceschanged', deviceChanged);
  // Notices allowed or blocked in the browser's own settings meanwhile.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && deviceChanged());
}
