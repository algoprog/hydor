// The desktop app installing its new version: the whole window is the logo and its rising water until the window
// closes and opens again on the new version. It reads as the app's own start (index.html #boot) played backwards and
// then forwards: the page colour clears over the app, the logo comes in exactly where the loading logo stands, a stream
// of water running through its Ω, and the reopened window starts on that same logo, so the change is not seen.
// If the install fails, the app starts the same server again and the window stays open: the screen goes when the
// socket is back (and says what went wrong); if the app never began installing, it goes after a minute and a half.
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sea } from '../features/tour/scenes';
import { api } from '../lib/api';
import { machineId } from '../lib/machine';
import { inDesktopApp } from '../lib/notify';
import { toast, useApp, type Bootstrap } from '../lib/store';

/** The wordmark's Ω (components/Logo.tsx), as index.html #boot draws it. */
const OMEGA_D = 'M4 95H24C24 80.6 3 65.3 3 47.3C3 23 23.2 5 48 5C72.8 5 93 23 93 47.3C93 65.3 72 80.6 72 95H92';

/** How long the screen waits for the app to begin installing (the socket to drop) before it gives the window back. */
const GIVE_UP_MS = 90_000;

export function UpdateScreen() {
  const update = useApp((s) => s.boot?.update);
  const connected = useApp((s) => s.connected);
  const restarting = inDesktopApp && !machineId && update?.kind === 'app' && update.running?.phase === 'restart';
  const since = restarting ? update!.running!.since : 0;
  // The restart it gave up waiting for: a later one has another start, and shows again.
  const [dismissed, setDismissed] = useState<number | null>(null);
  const shown = restarting && dismissed !== since;
  const lost = useRef(false);

  // Nothing under it takes a click or a key while it shows.
  useEffect(() => {
    if (!shown) return;
    const root = document.getElementById('root');
    if (root) root.inert = true;
    return () => {
      if (root) root.inert = false;
    };
  }, [shown]);

  // The sea rises slowly from the frame after it is drawn.
  const [risen, setRisen] = useState(false);
  useEffect(() => {
    if (!shown) return setRisen(false);
    const f = requestAnimationFrame(() => setRisen(true));
    return () => cancelAnimationFrame(f);
  }, [shown]);

  // The socket never dropped: the app did not begin installing.
  useEffect(() => {
    if (!shown) return;
    lost.current = false;
    const t = setTimeout(() => {
      if (!lost.current && useApp.getState().connected) setDismissed(since);
    }, GIVE_UP_MS);
    return () => clearTimeout(t);
  }, [shown, since]);

  // The app starts the same server again when the install fails, and this window stays open: ask how it went.
  useEffect(() => {
    if (!shown) return;
    if (!connected) {
      lost.current = true;
      return;
    }
    if (!lost.current) return;
    lost.current = false;
    api<Bootstrap>('/api/bootstrap')
      .then((b) => {
        const boot = useApp.getState().boot;
        if (boot) useApp.getState().set({ boot: { ...boot, update: b.update ?? undefined } });
        if (b.update?.running?.phase !== 'restart' && b.update?.last && !b.update.last.ok) toast(`The update did not install: ${b.update.last.error}`, 'error');
      })
      .catch(() => {});
  }, [shown, connected]);

  if (!shown) return null;
  return createPortal(<Screen to={update!.running!.to} deb={update!.format === 'deb'} risen={risen} />, document.body);
}

function Screen({ to, deb, risen }: { to?: string; deb: boolean; risen: boolean }) {
  const id = useId();
  const clip = `${id}c`;
  const mask = `${id}m`;
  const sea = `${id}s`;
  const glow = `${id}g`;
  // The loader's stream (styles.css, .current-run), on the wordmark's Ω.
  const stream = { d: OMEGA_D, pathLength: 100, stroke: `url(#${sea})`, strokeLinecap: 'round' as const, className: 'current-run' };
  return (
    <div className="update-screen fixed inset-0 grid place-items-center overflow-hidden bg-bg text-fg" style={{ zIndex: 2147483000 }} role="status" aria-live="polite">
      <Sea level={risen ? 1 : 0} />
      <div className="relative">
        {/* The loading logo of index.html, the same size in the same place. */}
        <svg className="update-mark" viewBox="-4 -1 530 102" fill="none" strokeWidth={10} aria-hidden style={{ width: 'min(232px, 56vw)', height: 'auto', display: 'block', overflow: 'visible' }}>
          <defs>
            <clipPath id={clip}>
              <rect x="-10" y="0" width="542" height="100" />
            </clipPath>
            <mask id={mask} maskUnits="userSpaceOnUse" x="-10" y="-10" width="116" height="120">
              <path d={OMEGA_D} stroke="#fff" strokeWidth="10" />
            </mask>
            <linearGradient id={sea} gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="90" y2="96">
              <stop offset="0" style={{ stopColor: 'var(--water-1)' }} />
              <stop offset="0.5" style={{ stopColor: 'var(--water-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--water-3)' }} />
            </linearGradient>
            <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="4.4" />
            </filter>
          </defs>
          {/* The stream's glow, under the letters and outside their clip, which would cut it at their height. */}
          <g transform="translate(324 0)" className="current">
            <g className="current-fade">
              <path {...stream} filter={`url(#${glow})`} opacity={0.75} />
            </g>
          </g>
          <g clipPath={`url(#${clip})`}>
            <path d="M5 0V100M61 0V100M5 50H61" stroke="currentColor" />
            <path transform="translate(104 0)" d="M-1 -6L35 52L71 -6M35 52V100" stroke="currentColor" />
            <path transform="translate(212 0)" d="M5 0V100M5 5H30A39 45 0 0 1 30 95H5" stroke="currentColor" />
            <g transform="translate(324 0)">
              <path className="current-bed" d={OMEGA_D} style={{ stroke: 'var(--water-ink)', opacity: 0.3 }} />
              <g className="current" mask={`url(#${mask})`}>
                <g className="current-fade current-late">
                  <path {...stream} opacity={0.4} />
                </g>
                <g className="current-fade">
                  <path {...stream} />
                  <path {...stream} stroke="#fff" strokeWidth={2} opacity={0.5} />
                </g>
              </g>
            </g>
            <path transform="translate(458 0)" d="M5 100V5H34A25 20 0 0 1 34 50H5M30 50L66 106" stroke="currentColor" />
          </g>
        </svg>
        {/* Under the logo without moving it: the logo stays where the loading logo stands. */}
        <div className="update-words absolute top-full left-1/2 mt-9 w-[min(88vw,560px)] -translate-x-1/2 text-center text-balance">
          <p className="text-[15px] font-medium text-fg">{to ? `Updating to Hydor ${to}` : 'Updating Hydor'}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">
            {deb ? 'Give your password when asked, and Hydor opens again by itself. Running agents carry on.' : 'Hydor closes and opens again by itself in a moment. Running agents carry on.'}
          </p>
        </div>
      </div>
    </div>
  );
}
