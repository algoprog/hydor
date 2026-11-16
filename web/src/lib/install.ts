// Installing the app on a phone's home screen (or a computer's apps): Chrome and Edge on Android offer it through an
// event as the page loads, kept here from the start (main.tsx) so a button can offer it later (Settings → App → Use on
// your phone). Safari on an iPhone or iPad has no such event: there it is Share → Add to Home Screen, done by hand.

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let offered: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

/** Keeps the browser's install offer when it comes (the browser's own offer still shows as it would). */
export function watchInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    offered = e as InstallPrompt;
    tell();
  });
  window.addEventListener('appinstalled', () => {
    offered = null;
    tell();
  });
}

/** Called when the offer comes or goes; returns the way to stop listening. */
export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The browser offers to install the app now. */
export const canInstall = () => !!offered;

/** Shows the browser's install question; true when the person said yes. */
export async function installApp(): Promise<boolean> {
  const p = offered;
  if (!p) return false;
  await p.prompt();
  const r = await p.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  offered = null;
  tell();
  return r.outcome === 'accepted';
}

/** Opened from the home screen (or as an installed app): full screen, with its own icon. */
export const runningInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;

/** The device in hand: an iPhone or iPad (iPadOS says it is a Mac, but has touch), an Android phone, or another. */
export function phoneKind(): 'ios' | 'android' | null {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return null;
}
