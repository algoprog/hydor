// Computer use, in the Mac app: agents see the Mac's screen and use its mouse and keyboard, in any app, beside the
// browser (which stays the way for websites). Off at first (Settings → Capabilities → Computer use, which also asks
// macOS for its two permissions); each session asks the user before its agent starts; Stop in the menu bar, ⌘⇧Esc,
// Settings or the session's line ends it. Elsewhere than the Mac app it is not offered.
import fs from 'node:fs';
import type { FastifyRequest } from 'fastify';
import { STOPPED_NOTE } from '../../shared/computer.ts';
import { HttpError } from '../auth.ts';
import { askDesktop, onDesktop } from '../desktop.ts';
import type { Deps, Feature } from '../features/types.ts';
import { clearActive, computerSettings, computerState, forgetSession, hooks, setComputerDeps, setComputerSettings, stopAll } from './access.ts';
import { dropSteps, pruneSteps, stepFile } from './steps.ts';
import { COMPUTER_INSTRUCTIONS, computerTools, forgetGeometry } from './tools.ts';
import type { DB } from '../db.ts';

const usable = (db: DB) => hooks.inApp() && computerSettings(db).enabled;

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
    if (!hooks.inApp()) throw new HttpError(400, 'Computer use needs the Naget Agent Mac app');
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
  spawn: (_s, d) => (usable(d.db) ? { instructions: [COMPUTER_INSTRUCTIONS] } : undefined),
  // A turn's end: the agent is no longer at the Mac.
  turnEnd: (t) => clearActive(t.key),
  start(d) {
    setComputerDeps(d);
    pruneSteps();
    // Stop in the Mac app's menu bar, or ⌘⇧Esc.
    onDesktop('computer-stop', () => {
      if (stopAll()) d.broadcast({ t: 'toast', level: 'info', text: STOPPED_NOTE });
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
