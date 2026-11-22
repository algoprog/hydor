// A session's own settings (extra) as the web reads and changes them: GET and PATCH /api/sessions/:key/extra. A change is
// checked first against what may not change once a session started (Confidential, Browser-only) and against its goal (a
// goal that is not over, or stopped at its limit, goes with a swarm, not with a campaign, a deep research or an arena).
import type { FastifyInstance } from 'fastify';
import { HttpError } from './auth.ts';
import { checkBrowserOnlyChange } from './browser/handoff.ts';
import { checkExtraChange } from './confidential/index.ts';
import type { DB } from './db.ts';
import { goalTeamChange } from './goals/driver.ts';
import { sessionExtra, setSessionExtra } from './sessionExtra.ts';

export function sessionExtraRoutes(app: FastifyInstance, db: DB, sessions: { queueSummary(key: string): void }) {
  app.get('/api/sessions/:key/extra', async (req) => ({ extra: sessionExtra(db, (req.params as { key: string }).key) }));
  app.patch('/api/sessions/:key/extra', async (req) => {
    const key = (req.params as { key: string }).key;
    const patch = (req.body ?? {}) as Record<string, unknown>;
    // Confidential is set when a session starts and stays; memory stays off in one (server/confidential).
    checkExtraChange(db, key, patch);
    // Browser-only (Do this here) is set when a session starts and stays (server/browser/handoff.ts).
    checkBrowserOnlyChange(db, key, patch);
    // A goal that is not over goes with a swarm, not with a campaign, a deep research or an arena match (server/goals).
    const team = goalTeamChange(db, key, patch);
    if (team) throw new HttpError(409, team);
    const extra = setSessionExtra(db, key, patch);
    sessions.queueSummary(key);
    return { extra };
  });
}
