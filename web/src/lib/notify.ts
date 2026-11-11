// "A session finished, failed or needs you", on this device: a toast (and a soft chime) while the app
// is in view, a system notification while it is in the background, and Web Push when no page is open
// (a phone in a pocket). Push needs this device's permission and a subscription the server keeps.
// In a desktop app, the app itself shows each one as the system's own notification (desktop/main.cjs),
// even with its window closed, and the page shows only those the system did not show.
import type { NotifyEvent } from '@shared/types';
import { noticeText } from '@shared/notice';
import { tr } from '../i18n/runtime';
import { api, post } from './api';
import { machineId, machinePath } from './machine';
import { ownName } from './machines';
import { goFull, sessionPath } from './nav';
import { useToasts } from './store';

const PREFS = 'wa.notify';

export interface NotifyPrefs {
  /** A chime with each notice. */
  sound: boolean;
}

export function notifyPrefs(): NotifyPrefs {
  try {
    return { sound: false, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') };
  } catch {
    return { sound: false };
  }
}

export function setNotifyPrefs(p: Partial<NotifyPrefs>) {
  try {
    localStorage.setItem(PREFS, JSON.stringify({ ...notifyPrefs(), ...p }));
  } catch {}
}

let pushOn = false;

/** What the desktop app's window gives its page (desktop/preload.cjs); none in a browser. */
interface DesktopBridge {
  onNotices?: (show: (n: NotifyEvent) => void, open: (path: string) => void) => void;
  notices?: () => Promise<SystemNotices | null>;
  testNotice?: (title: string, body: string) => Promise<{ ok: boolean; error: string } | null>;
  noticeSettings?: () => Promise<boolean>;
}
/** Whether the system shows the desktop app's notifications: null before the first; `error`, what it said when not. */
export interface SystemNotices {
  shows: boolean | null;
  error: string;
}
const bridge = (window as unknown as { hydorDesktop?: DesktopBridge }).hydorDesktop;

/** In a desktop app, the app shows the notices as the system's own notifications, and the page none of its own. */
export const systemNotices = typeof bridge?.onNotices === 'function';

/** Whether the system shows the desktop app's notifications (null outside one). */
export const systemNoticesState = (): Promise<SystemNotices | null> => bridge?.notices?.().catch(() => null) ?? Promise.resolve(null);

/** A notification from the desktop app to try them: whether the system showed it (null outside one). */
export const testSystemNotice = (): Promise<{ ok: boolean; error: string } | null> =>
  bridge?.testNotice?.(tr('Hydor'), tr('Notifications work on this device.')).catch(() => null) ?? Promise.resolve(null);

/**
 * Turns the desktop app's notifications on: a test one, which shows when the system allows them; when it does not
 * show, the system's settings open where you allow them (Hydor's page of a Mac's Notifications, Windows' Notifications).
 * 'on': it showed; 'settings': the settings are open (whenBack tries again); 'off': nothing more to do here.
 */
export async function turnOnSystemNotices(): Promise<'on' | 'settings' | 'off'> {
  const r = await testSystemNotice();
  if (r?.ok) return 'on';
  const opened = await (bridge?.noticeSettings?.() ?? Promise.resolve(false)).catch(() => false);
  return opened ? 'settings' : 'off';
}

/** Calls `fn` when the window is in front again after it was not (back from the system's settings). Returns how to stop. */
export function whenBack(fn: () => void): () => void {
  let away = !document.hasFocus();
  const blur = () => {
    away = true;
  };
  const focus = () => {
    if (!away) return;
    away = false;
    fn();
  };
  window.addEventListener('blur', blur);
  window.addEventListener('focus', focus);
  return () => {
    window.removeEventListener('blur', blur);
    window.removeEventListener('focus', focus);
  };
}

let bridged = false;

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

/** Registers the service worker and learns whether this device already gets pushes. */
export async function initNotifications() {
  // A notice the system did not show: here instead. Its machine is this server's own when it names none.
  if (systemNotices && !bridged) {
    bridged = true;
    bridge!.onNotices!(
      (n) => show(n, n.machine ? n.machine.id : null),
      (path) => goFull(path),
    );
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'wa-open' && typeof e.data.url === 'string') goFull(e.data.url);
  });
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    pushOn = !!(await reg.pushManager?.getSubscription());
  } catch {}
}

/** 'app': in a desktop app, which shows the notices itself while it runs (it has no web push). */
export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'app';

/** A desktop app's window (desktop/main.cjs adds this to its user agent: HydorMac, HydorWindows, HydorLinux). */
export const inDesktopApp = /\b(?:HydorMac|HydorWindows|HydorLinux|NagetAgentMac)\//.test(navigator.userAgent);
/** Which desktop app the window is: 'mac', 'windows' or 'linux' (null in a browser). */
export const desktopSystem: 'mac' | 'windows' | 'linux' | null = /\bHydorWindows\//.test(navigator.userAgent) ? 'windows' : /\bHydorLinux\//.test(navigator.userAgent) ? 'linux' : inDesktopApp ? 'mac' : null;

/** Whether the desktop app can open the system's settings where you allow its notifications (a Mac's, Windows'). */
export const systemNoticeSettings = typeof bridge?.noticeSettings === 'function' && desktopSystem !== 'linux';

export async function pushState(): Promise<PushState> {
  if (inDesktopApp) return 'app';
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return 'off';
  // The server may have dropped it (an expired subscription): subscribe again.
  const r = await api<{ subscribed: boolean }>(`/api/push?endpoint=${encodeURIComponent(sub.endpoint)}`).catch(() => ({ subscribed: true }));
  return r.subscribed ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  if (inDesktopApp) return 'app';
  if (!supported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>('/api/push');
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
  await post('/api/push/subscribe', { subscription: sub.toJSON() });
  pushOn = true;
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  }
  pushOn = false;
  return 'off';
}

let audio: AudioContext | null = null;

/** A short, soft two-note chime: rising when done, falling when it needs you or failed. */
export function chime(kind: NotifyEvent['kind']) {
  try {
    audio ??= new AudioContext();
    const ctx = audio;
    const notes = kind === 'done' ? [660, 880] : kind === 'waiting' ? [880, 660] : [440, 330];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const t = ctx.currentTime + i * 0.14;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch {}
}

/**
 * A notice from a server: nothing if you are looking at that session, else a toast or a system
 * notification. `own`: it came on this server's own socket while the page shows another machine.
 */
export function handleNotify(n: NotifyEvent, own = false) {
  // Hands-free mode says what it hears of (features/voice/HandsFree.tsx).
  window.dispatchEvent(new CustomEvent('hydor:notify', { detail: n }));
  // The desktop app shows it, and hands it back (initNotifications) only when the system did not.
  if (systemNotices) return;
  // The machine the session is on (null: this server's own).
  const on = n.machine ? n.machine.id : own ? null : machineId;
  // The machine this page shows sends its own notices.
  if (own && on === machineId) return;
  show(n, on);
}

/** A notice about a session on the machine `on` (null: this server's own), shown by the page. */
function show(n: NotifyEvent, on: string | null) {
  // A session's notice opens it; one about something else (a template's run) where it says.
  const path = machinePath(on, n.url ?? sessionPath(n.key));
  const where = on === machineId ? undefined : (n.machine?.name ?? ownName());
  const visible = document.visibilityState === 'visible';
  if (visible && document.hasFocus() && location.pathname === path) return;
  if (notifyPrefs().sound) chime(n.kind);
  if (visible) {
    useToasts.getState().notice({ key: `${on ?? ''}/${n.key}`, agent: n.agent, kind: n.kind, title: n.title, body: n.body, machine: where, open: () => goFull(path) });
  } else if (!pushOn && 'Notification' in window && Notification.permission === 'granted') {
    // The service worker shows pushed ones; without a subscription the page does it.
    const t = noticeText(n, tr);
    const note = new Notification(t.title, { body: where ? `${where} · ${t.body}` : t.body, tag: `${on ?? ''}/${n.key}`, icon: '/icon-192.png?v=3' });
    note.onclick = () => {
      window.focus();
      goFull(path);
      note.close();
    };
  }
}
