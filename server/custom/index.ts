// Custom, the app's own agent: Auto mode's reviewer (its fixed rules run in Custom itself, see
// server/agent/review.ts), the sandbox setting for its commands, and /goal. Fork and "Edit from here"
// are in fork.ts, which sessions.ts calls.
import { sandboxAvailable } from '../agent/sandbox.ts';
import type { Feature } from '../features/types.ts';
import { runOf } from '../mcp.ts';
import { watchGoals } from './goal.ts';
import { reviewStep, type StepInfo } from './review.ts';
import { customSettings, setCustomSettings, type CustomSettings } from './settings.ts';

export const custom: Feature = {
  id: 'custom',
  routes(d) {
    // Custom's own calls, at its run's address: the run's token is the permission.
    const runOfToken = (params: unknown) => {
      const runId = runOf((params as { token: string }).token);
      return runId ? d.sessions.liveByRun(runId) : null;
    };
    /** Auto mode: allow, ask or deny one step, by the helper model. */
    d.app.post('/agent/run/:token/review', async (req, reply) => {
      const live = runOfToken(req.params);
      if (!live) return reply.code(403).send({ error: 'Not a running agent' });
      return reviewStep(d.db, d.sessions, live.key, live.cwd, (req.body ?? {}) as StepInfo);
    });
    d.app.get('/agent/run/:token/custom', async (req, reply) => {
      if (!runOfToken(req.params)) return reply.code(403).send({ error: 'Not a running agent' });
      return { sandbox: customSettings(d.db).sandbox };
    });
    const state = () => ({ ...customSettings(d.db), bwrap: !!sandboxAvailable() });
    d.app.get('/api/custom/settings', async () => state());
    d.app.put('/api/custom/settings', async (req) => {
      setCustomSettings(d.db, (req.body ?? {}) as Partial<CustomSettings>);
      return state();
    });
  },
  start(d) {
    watchGoals(d);
  },
};
