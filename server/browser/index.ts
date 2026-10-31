// A web browser agents drive, with a live view the user can watch and take over: a real Chromium over
// CDP, one browser context per session, pages read as numbered outlines (and screenshots for models
// that see images), and the user's say on logins, payments, dialogs and this machine's own addresses.
import type { Feature } from '../features/types.ts';
import { findChromes, pickChrome } from './chrome.ts';
import { forgetSession } from './ops.ts';
import { browserRoutes } from './routes.ts';
import { closeBrowser, killAll, reapStale, setBrowserDeps, sweepIdle } from './session.ts';
import { browserSettings } from './settings.ts';
import { dropSteps, pruneSteps } from './steps.ts';
import { BROWSER_INSTRUCTIONS, browserTools } from './tools.ts';
import type { DB } from '../db.ts';

/** On, and a Chromium to run. */
const usable = (db: DB) => {
  const s = browserSettings(db);
  return s.enabled && !!pickChrome(s.chrome);
};

export const browser: Feature = {
  id: 'browser',
  routes(d) {
    setBrowserDeps(d);
    browserRoutes(d);
  },
  tools: (ctx) => (usable(ctx.deps.db) ? browserTools(ctx) : []),
  spawn: (_s, d) => (usable(d.db) ? { instructions: [BROWSER_INSTRUCTIONS] } : undefined),
  start(d) {
    setBrowserDeps(d);
    reapStale();
    // Reads the browsers' versions now, for Settings → Browser.
    findChromes();
    pruneSteps();
    setInterval(sweepIdle, 60_000).unref();
    process.once('exit', killAll);
    // A session's browser ends with its agent, and goes (with its step pictures) when the session is removed.
    d.sessions.on('live', (key: string, live: unknown) => {
      if (!live) void closeBrowser(key, 'the session ended');
    });
    d.sessions.on('sessions', (_upsert: unknown, removed: string[] = []) => {
      for (const key of removed) {
        void closeBrowser(key, 'the session was removed');
        dropSteps(key);
        forgetSession(key);
      }
    });
  },
};
