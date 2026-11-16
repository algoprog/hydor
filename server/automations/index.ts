// Automations: tasks agents propose or set up from chat (confirmed by the user in a card), watchers
// that wake them only when something changed, run history with outcomes, tasks drafted from a session
// that worked, and webhooks that can wait for the reply. The scheduler (server/scheduler.ts) runs them.
import os from 'node:os';
import path from 'node:path';
import { scheduleText, type ScheduledTask } from '../../shared/automations.ts';
import type { Feature } from '../features/types.ts';
import { validSchedule } from '../scheduler.ts';
import { userTimezone } from '../userPrefs.ts';
import { draftFromSession } from './draft.ts';
import { hookRoutes } from './hooks.ts';
import { nextRuns } from './schedule.ts';
import { automationTools, decide, getProposal, migrateProposals, noteSpawn } from './tools.ts';
import { checkWatch, validWatch } from './watch.ts';
import { findOf, useAccountDeps, watchAccounts } from './account-watch.ts';
import { scheduleWeek } from './week.ts';

const home = (p: string) => (!p || p === '~' ? os.homedir() : p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);

export const automations: Feature = {
  id: 'automations',
  routes(d) {
    migrateProposals(d.db);
    // A connected account's watcher calls its tools as the Outbox does.
    useAccountDeps(d);
    const { app, scheduler } = d;
    const id = (req: { params: unknown }) => (req.params as { id: string }).id;
    const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, any>;
    // Run history.
    app.get('/api/automations/tasks/:id/runs', async (req) => ({ runs: scheduler.runs(id(req), 50) }));
    app.get('/api/automations/runs/:id', async (req) => ({ run: scheduler.run1(id(req)) }));
    app.post('/api/automations/runs/:id/rerun', async (req) => scheduler.rerun(id(req)));
    // Schedules: everything that runs by itself over a week or a month, what ran and what will (the Agents page's view).
    app.get('/api/automations/week', async (req) => {
      const q = (req.query ?? {}) as { start?: string; days?: string };
      return scheduleWeek(d.db, scheduler.list(), { tz: userTimezone(d.db), now: Date.now(), start: q.start || undefined, days: q.days ? Number(q.days) : undefined });
    });
    // Pause a task or turn it on (its switch, wherever it shows).
    app.post('/api/automations/tasks/:id/enabled', async (req) => ({ task: scheduler.setEnabled(id(req), body(req).on === true) }));
    // The notepad a task's runs keep.
    app.get('/api/automations/tasks/:id/notes', async (req) => ({ text: scheduler.notes(id(req)) }));
    app.put('/api/automations/tasks/:id/notes', async (req) => ({ text: scheduler.setNotes(id(req), String(body(req).text ?? '')) }));
    // A schedule in words and its next runs, in the user's time zone (the task form).
    app.post('/api/automations/next', async (req) => {
      const tz = userTimezone(d.db);
      const s = validSchedule(body(req).schedule);
      return { tz, text: scheduleText(s, tz), next: nextRuns(s, Date.now(), tz, 3) };
    });
    // What a watcher sees now (its Test button; a connected account's Try it, with where it found the items).
    app.post('/api/automations/watch/test', async (req) => {
      const w = validWatch(body(req).watch);
      try {
        const r = await checkWatch(w, undefined, { cwd: home(String(body(req).cwd ?? '')) });
        return { ok: true, note: r.note, sample: r.sample, ...(r.find ? { find: r.find } : {}) };
      } catch (e) {
        return { ok: false, note: (e as Error).message, ...(findOf(e) ? { find: findOf(e) } : {}) };
      }
    });
    // The connected accounts a watcher may call, with their tools that only look and the starting points that fit them.
    app.get('/api/automations/accounts', async () => ({ accounts: watchAccounts() }));
    // A run of the form as it is, without saving it; `dry`: one that sends nothing (calls that act outside are held as "would have sent").
    app.post('/api/automations/test-run', async (req) => scheduler.testRun((body(req).task ?? {}) as Partial<ScheduledTask>, { dry: body(req).dry === true }));
    // "Make this an automation".
    app.post('/api/automations/draft', async (req) => draftFromSession(d, String(body(req).key ?? '')));
    // Tasks agents proposed from chat: the card asks, the answer goes back to the agent.
    app.get('/api/automations/proposals/:id', async (req) => ({ proposal: getProposal(d.db, id(req)) }));
    app.post('/api/automations/proposals/:id/confirm', async (req) => ({ proposal: await decide(d, id(req), true, body(req).task) }));
    app.post('/api/automations/proposals/:id/decline', async (req) => ({ proposal: await decide(d, id(req), false) }));
    hookRoutes(d);
  },
  tools: (ctx) => automationTools(ctx),
  spawn(s) {
    noteSpawn(s.runId, s.extra);
    return undefined;
  },
  turnEnd: (t, d) => d.scheduler.turnEnded(t),
};
