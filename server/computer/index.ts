// Computer use, in the desktop apps (Mac, Windows, Linux on X11): agents see the computer's screen and use its mouse and
// keyboard, in any app, beside the browser (which stays the way for websites). Off at first (Settings → Capabilities
// → Computer use, which on a Mac also asks macOS for its two permissions); each session asks the user before its agent
// starts. While an agent acts, a glow lines the screen's edges (desktop/glow.cjs), with a note that Esc stops it; Esc,
// Stop in the menu bar or tray (⌘⇧Esc too on a Mac), Settings or the session's line ends it. Elsewhere than the
// desktop apps it is not offered.
import fs from 'node:fs';
import type { FastifyRequest } from 'fastify';
import { HttpError } from '../auth.ts';
import { askDesktop, onDesktop } from '../desktop.ts';
import type { Deps, Feature } from '../features/types.ts';
import { clearActive, computerSettings, computerState, forgetSession, hooks, setComputerDeps, setComputerSettings, stopAll, wordsHere } from './access.ts';
import { dropSteps, pruneSteps, stepFile } from './steps.ts';
import { computerInstructions, computerTools, forgetGeometry } from './tools.ts';
import type { DB } from '../db.ts';

const usable = (db: DB) => !!hooks.system() && computerSettings(db).enabled;

function routes(d: Deps) {
  const { app, db } = d;
  const P = (req: FastifyRequest) => req.params as Record<string, string>;
  app.get('/api/computer', async () => computerState(db));
  app.put('/api/computer/settings', async (req) => {
    setComputerSettings(db, (req.body ?? {}) as { enabled?: unknown });
    return computerState(db);
  });
  /** Asks macOS for a permission: its own prompt the first time, then its System Settings at the right place. */
  app.post('/api/computer/permissions/:which', async (req) => {
    const which = P(req).which;
    if (which !== 'accessibility' && which !== 'screen') throw new HttpError(400, 'Which permission: accessibility or screen');
    if (hooks.system() !== 'mac') throw new HttpError(400, 'Only the Mac app asks macOS for permissions');
    try {
      await askDesktop({ what: 'request', which }, 15_000);
    } catch (e) {
      throw new HttpError(502, `The Mac app could not ask macOS: ${(e as Error).message}`);
    }
    return computerState(db, true);
  });
  app.post('/api/computer/stop', async () => {
    stopAll();
    return computerState(db);
  });
  /** A step's picture of the screen, for its row in the conversation. */
  app.get('/api/computer/sessions/:key/steps/:n', async (req, reply) => {
    const f = stepFile(decodeURIComponent(P(req).key), Number(String(P(req).n).replace(/\.jpg$/, '')));
    if (!f) return reply.code(404).send({ error: 'No picture for that step' });
    return reply.header('Cache-Control', 'private, max-age=604800, immutable').type('image/jpeg').send(fs.createReadStream(f));
  });
}

export const computer: Feature = {
  id: 'computer',
  routes(d) {
    setComputerDeps(d);
    routes(d);
  },
  tools: (ctx) => (usable(ctx.deps.db) ? computerTools(ctx) : []),
  spawn: (_s, d) => (usable(d.db) ? { instructions: [computerInstructions()] } : undefined),
  // A turn's end: the agent is no longer at the computer.
  turnEnd: (t) => clearActive(t.key),
  start(d) {
    setComputerDeps(d);
    pruneSteps();
    // Esc, Stop in the desktop app's menu bar or tray, or ⌘⇧Esc on a Mac.
    onDesktop('computer-stop', () => {
      if (stopAll()) d.broadcast({ t: 'toast', level: 'info', text: wordsHere().stopped });
    });
    d.sessions.on('live', (key: string, live: unknown) => {
      if (!live) {
        forgetSession(key);
        forgetGeometry(key);
      }
    });
    d.sessions.on('sessions', (_upsert: unknown, removed: string[] = []) => {
      for (const key of removed) {
        forgetSession(key);
        forgetGeometry(key);
        dropSteps(key);
      }
    });
  },
};
