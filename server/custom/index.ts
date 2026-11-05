// Custom, the app's own agent: Auto mode's reviewer (its fixed rules run in Custom itself, see
// server/agent/review.ts), the sandbox setting for its commands, and /goal. Fork and "Edit from here"
// are in fork.ts, which sessions.ts calls.
import { sandboxAvailable } from '../agent/sandbox.ts';
import { confidentialKey, privateHelper } from '../confidential/index.ts';
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
    /**
     * Auto mode: allow, ask or deny one step, by the helper model; in a confidential session by the helper model when
     * it runs on this computer, else by the session's own model, else the user decides.
     */
    d.app.post('/agent/run/:token/review', async (req, reply) => {
      const live = runOfToken(req.params);
      if (!live) return reply.code(403).send({ error: 'Not a running agent' });
      const step = (req.body ?? {}) as StepInfo;
      if (!confidentialKey(d.db, live.key)) return reviewStep(d.db, d.sessions, live.key, live.cwd, step);
      const model = privateHelper(d, live.key);
      return model ? reviewStep(d.db, d.sessions, live.key, live.cwd, step, model) : { decision: 'ask', reason: 'no model on this computer to check it, so you decide' };
    });
    // Its sandbox setting, and whether its session is confidential (commands without network, in every mode).
    d.app.get('/agent/run/:token/custom', async (req, reply) => {
      const live = runOfToken(req.params);
      if (!live) return reply.code(403).send({ error: 'Not a running agent' });
      return { sandbox: customSettings(d.db).sandbox, confidential: confidentialKey(d.db, live.key) };
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
