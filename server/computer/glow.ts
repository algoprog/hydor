// What the desktop app does around an agent's actions (desktop/glow.cjs): the glow that lines the screen's edges while
// an agent uses the computer is for the person at it, never for the agent, so it is hidden for the moment a screenshot
// takes wherever the system would otherwise put it in the picture (macOS 15.4 and later capture even windows that ask
// to be left out; Linux has no such thing; Windows leaves it out by itself since Windows 10 2004). And Esc, which stops
// the agent, is let go while the agent itself presses it.
import os from 'node:os';
import { askDesktop, desktop, tellDesktop } from '../desktop.ts';

/** Whether the system keeps the glow out of screenshots by itself: Windows 10 2004 (build 19041) and later. */
export function glowKeptOut(release = os.release()): boolean {
  if (desktop?.platform !== 'windows') return false;
  return Number(release.split('.')[2]) >= 19041;
}

/** Runs `fn` (a screenshot) with the glow hidden, unless the system keeps it out of pictures by itself. */
export async function withoutGlow<T>(fn: () => Promise<T>): Promise<T> {
  if (!desktop || glowKeptOut()) return fn();
  const hidden = await askDesktop({ what: 'glow', show: false }, 2000).then(
    () => true,
    () => false,
  );
  try {
    return await fn();
  } finally {
    if (hidden) tellDesktop({ type: 'glow', show: true });
  }
}

/** Runs `fn` (the agent pressing Esc) with the app's Esc let go, so the agent does not stop itself. */
export async function withoutEsc<T>(fn: () => Promise<T>): Promise<T> {
  if (!desktop) return fn();
  const off = await askDesktop({ what: 'esc', on: false }, 2000).then(
    () => true,
    () => false,
  );
  // The app lets go of the key on its own connection to the window system (X11's, say): a moment for that to land
  // before the agent's key does.
  if (off) await new Promise((r) => setTimeout(r, 40));
  try {
    return await fn();
  } finally {
    if (off) tellDesktop({ type: 'esc', on: true });
  }
}
