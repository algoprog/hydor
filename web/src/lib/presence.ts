// Your visits, for the start page's "While you were away" (server/away): once the app has been open and in front for a
// minute, and you have used it (a click, a key, a scroll or a touch) in the last few minutes, it tells the server you are
// here, and again each minute while that lasts. The server keeps when each visit ended, on every device, so "since" is
// the end of your last visit: a reload or a glance shorter than a minute never moves it, and a window left open on a
// desk all night does not count as a visit. Told to the machine the page shows; an older one without the route is left
// alone after its first no.
import { api, ApiError } from './api';
import { viaLink } from './machine';

/** In front this long before it counts as a visit. */
const SETTLE = 60_000;
/** Said again this often while it lasts. */
const EVERY = 60_000;
/** Without a click, key, scroll or touch for this long, you are not counted as here. */
const IDLE = 5 * 60_000;
const TICK = 15_000;

export function startPresence(): () => void {
  if (viaLink) return () => {};
  let inFront = document.visibilityState === 'visible' ? Date.now() : 0;
  let lastUse = Date.now();
  let lastSaid = 0;
  let unknown = false;
  const used = () => void (lastUse = Date.now());
  const seen = () => {
    if (document.visibilityState !== 'visible') inFront = 0;
    else if (!inFront) inFront = Date.now();
  };
  const tick = () => {
    const now = Date.now();
    if (unknown || !inFront || document.visibilityState !== 'visible') return;
    if (now - inFront < SETTLE || now - lastUse > IDLE || now - lastSaid < EVERY) return;
    lastSaid = now;
    api('/api/away/here', { method: 'POST' }).catch((e) => {
      // An older server has no such route: nothing to tell it.
      if (e instanceof ApiError && e.status === 404) unknown = true;
    });
  };
  const opts = { passive: true, capture: true } as const;
  const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
  for (const ev of events) window.addEventListener(ev, used, opts);
  document.addEventListener('visibilitychange', seen);
  const t = setInterval(tick, TICK);
  return () => {
    clearInterval(t);
    document.removeEventListener('visibilitychange', seen);
    for (const ev of events) window.removeEventListener(ev, used, opts);
  };
}
