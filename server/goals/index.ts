// Goals the app checks (shared/goals.ts, driver.ts): the agent's four tools on every session's own server, a turn's end
// that may end a round, the tick that survives restarts, and the goal as the web reads it (GET /api/goals/:key; it
// changes it through POST /api/sessions/:key/goal in server/index.ts, which SessionManager.goal hands to the driver).
// Every change is sent to the open pages as the feature event "goal" ({ goal }, null once it is deleted).
import type { Feature } from '../features/types.ts';
import { draftNotes } from './brief.ts';
import { goalStartIgnored, onTurnEnd, restoreSettled, startTick } from './driver.ts';
import { loadGoal, publicGoal } from './store.ts';
import { GOAL_TOOLS } from './tools.ts';

export const goals: Feature = {
  id: 'goal',

  tools: () => GOAL_TOOLS,

  spawn(s, d) {
    // Started with the goal as its first message (the start page's Goal option): what the loop asks first goes with that
    // message, also when its agent had to start again before it got it. By the goal once it is set (Codex learns its key later).
    const g = s.key ? loadGoal(d.db, s.key) : null;
    const first = g ? g.status === 'drafting' && !!g._.first : !s.resume && !!s.extra?.goal?.start && !!s.prompt && !goalStartIgnored(s.extra);
    return first ? { notes: [draftNotes({ swarm: s.extra?.swarm === true })] } : undefined;
  },

  turnEnd(t, d) {
    return onTurnEnd(d, t);
  },

  // A message to the session's agent waits while the loop puts its files back (git's reset and clean take a moment):
  // the agent must not start working on files that are being replaced under it.
  beforeSend(key, d) {
    return restoreSettled(key, d.db);
  },

  start(d) {
    startTick(d);
  },

  routes(d) {
    d.app.get('/api/goals/:key', async (req) => {
      const key = (req.params as { key: string }).key;
      return { goal: publicGoal(loadGoal(d.db, key)) };
    });
  },
};
