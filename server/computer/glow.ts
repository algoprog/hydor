// What the desktop app does around an agent's actions (desktop/glow.cjs): the glow that lines the screen's edges while
// an agent uses the computer is for the person at it, never for the agent, so it is hidden for the moment a screenshot
// takes. No system can be trusted to leave it out by itself: the windows ask to be left out of captures, but macOS
// 15.4 and later may capture them all the same, Windows' copy of the screen took them in on GitHub's Windows Server
// 2022 runners (desktop/scripts/glow-test.cjs), and Linux has no such thing (there the app takes the screenshot and
// hides the glow itself). And Esc, which stops the agent, is let go while the agent itself presses it.
import { askDesktop, desktop, tellDesktop } from '../desktop.ts';

/** Runs `fn` (a screenshot) with the glow hidden. */
export async function withoutGlow<T>(fn: () => Promise<T>): Promise<T> {
  if (!desktop) return fn();
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
