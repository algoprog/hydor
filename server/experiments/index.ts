// Experiments (System → Experiments): a queue of jobs that wait for free GPUs on any of your machines (or a
// cluster's queue over SSH), run on their own and are kept as records (commit and patch, settings, seed,
// environment, metrics, log), an agent on call that wakes when a run goes wrong, sweeps, and results tables with
// significance for the paper. The queue is queue.ts; records.ts keeps the records (and is what the rest of the app
// reads); tables.ts the tables, clusters.ts the clusters, remote.ts the other machines, tools.ts the agents' tools.
import type { FastifyRequest } from 'fastify';
import { ACTIVE, type RunStatus } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import type { Deps, Feature } from '../features/types.ts';
import { logAfter, makeTable, patchOf, putInLatex, runsList, runView, startSweep, cleanTableSpec } from './api.ts';
import { checkCluster, getCluster, listClusters, noteCheck, removeCluster, saveCluster } from './clusters.ts';
import { cleanJob, queueNow, resume, runAgain, setSettings, settingsOf, stopRun, submit, tellRuns, useDeps } from './queue.ts';
import { deleteRun, deleteTable, getRun, getSweep, getTable, listRuns, listTables, okId, recomputeTable, saveTable, workOut } from './records.ts';
import { experimentTools, SPAWN_NOTE } from './tools.ts';

const P = (req: FastifyRequest) => req.params as Record<string, string>;
const Q = (req: FastifyRequest) => req.query as Record<string, string | undefined>;
const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, any>;

const runId = (req: FastifyRequest) => {
  const id = P(req).id;
  if (!okId(id)) throw new HttpError(400, 'Bad run id');
  return id;
};

const statusesOf = (s: string | undefined): RunStatus[] | undefined => {
  if (!s) return undefined;
  if (s === 'active') return ACTIVE;
  return s.split(',').filter((x): x is RunStatus => ['queued', 'waiting', 'starting', 'running', 'done', 'failed', 'stopped', 'lost'].includes(x));
};

function routes(d: Deps) {
  const app = d.app;
  useDeps(d);

  // ---- runs ----------------------------------------------------------------------------------------------
  app.get('/api/experiments/runs', async (req) => {
    const q = Q(req);
    const runs = await runsList(
      d,
      { group: q.group, tag: q.tag, status: statusesOf(q.status), cwd: q.cwd, project: q.project, sweep: q.sweep, q: q.q, limit: Math.min(Number(q.limit) || 200, 1000) },
      q.everywhere === '1',
    );
    return { runs };
  });
  app.get('/api/experiments/runs/:id', async (req) => runView(d, runId(req), Q(req).log === '0' ? 0 : Math.min(Number(Q(req).lines ?? 300) || 0, 5000)));
  app.get('/api/experiments/runs/:id/log', async (req) => logAfter(d, runId(req), Number(Q(req).from) || 0));
  app.get('/api/experiments/runs/:id/patch', async (req) => ({ patch: await patchOf(d, runId(req)) }));
  app.post('/api/experiments/jobs', async (req) => {
    const b = B(req);
    const spec = await cleanJob(d.db, b);
    return { run: await submit(d, spec, { startedBy: b.startedBy && typeof b.startedBy === 'object' ? b.startedBy : { page: true } }) };
  });
  app.post('/api/experiments/runs/:id/stop', async (req) => ({ run: await stopRun(d, runId(req), typeof B(req).why === 'string' && B(req).why.trim() ? B(req).why.trim().slice(0, 200) : undefined) }));
  app.post('/api/experiments/runs/:id/again', async (req) => ({ run: await runAgain(d, runId(req), B(req), { page: true }) }));
  app.delete('/api/experiments/runs/:id', async (req) => {
    const id = runId(req);
    const r = getRun(d.db, id);
    if (!r) throw new HttpError(404, 'There is no such run');
    if (ACTIVE.includes(r.status)) throw new HttpError(409, 'It has not ended: stop it first');
    deleteRun(d.db, id);
    tellRuns(d, [id]);
    return { ok: true };
  });
  app.get('/api/experiments/queue', async () => queueNow(d));
  app.get('/api/experiments/settings', async () => settingsOf(d.db));
  app.put('/api/experiments/settings', async (req) => setSettings(d.db, B(req)));
  /** The experiments (groups) runs belong to, the latest first, with how many runs each has. */
  app.get('/api/experiments/groups', async () => {
    const seen = new Map<string, { name: string; runs: number; done: number; lastAt: number }>();
    for (const r of listRuns(d.db, { limit: 5000 })) {
      if (!r.group) continue;
      const g = seen.get(r.group) ?? { name: r.group, runs: 0, done: 0, lastAt: r.createdAt };
      g.runs++;
      if (r.status === 'done') g.done++;
      g.lastAt = Math.max(g.lastAt, r.createdAt);
      seen.set(r.group, g);
    }
    return { groups: [...seen.values()].sort((a, b) => b.lastAt - a.lastAt) };
  });

  // ---- sweeps --------------------------------------------------------------------------------------------
  app.post('/api/experiments/sweeps', async (req) => {
    const s = await startSweep(d, B(req), { startedBy: { page: true } });
    return { sweep: s.sweep, runs: s.runs };
  });
  app.get('/api/experiments/sweeps/:id', async (req) => {
    const sweep = getSweep(d.db, P(req).id);
    if (!sweep) throw new HttpError(404, 'There is no such sweep');
    return { sweep, runs: listRuns(d.db, { sweep: sweep.id, limit: 1000, oldest: true }) };
  });

  // ---- clusters ------------------------------------------------------------------------------------------
  app.get('/api/experiments/clusters', async () => ({ clusters: listClusters(d.db) }));
  app.post('/api/experiments/clusters', async (req) => ({ cluster: saveCluster(d.db, B(req)) }));
  app.post('/api/experiments/clusters/check', async (req) => {
    const b = B(req);
    const saved = typeof b.id === 'string' ? getCluster(d.db, b.id) : null;
    if (typeof b.id === 'string' && !saved) throw new HttpError(404, 'There is no such cluster');
    const host = saved?.host ?? String(b.host ?? '').trim();
    if (!/^[A-Za-z0-9_.@%:[\]-]{1,200}$/.test(host) || host.startsWith('-')) throw new HttpError(400, 'Give the SSH host, like hpc or me@login.cluster.edu');
    const r = await checkCluster({ host, kind: saved?.kind ?? (b.kind === 'ssh' ? 'ssh' : 'slurm') });
    if (saved) noteCheck(d.db, saved.id, { at: Date.now(), ...r });
    return r;
  });
  app.delete('/api/experiments/clusters/:id', async (req) => {
    const id = P(req).id;
    if (listRuns(d.db, { status: ACTIVE, limit: 5000 }).some((r) => r.where === `c:${id}`)) throw new HttpError(409, 'Runs are still going on it: stop them first');
    removeCluster(d.db, id);
    return { ok: true };
  });

  // ---- results tables ------------------------------------------------------------------------------------
  app.get('/api/experiments/tables', async () => ({ tables: listTables(d.db) }));
  app.post('/api/experiments/tables', async (req) => ({ table: makeTable(d, B(req)) }));
  /** A table as the spec would make it now, not kept (the dialog shows it as you choose). */
  app.post('/api/experiments/tables/preview', async (req) => ({ table: workOut(d.db, cleanTableSpec(B(req)), 'preview') }));
  app.get('/api/experiments/tables/:id', async (req) => {
    const t = getTable(d.db, P(req).id);
    if (!t) throw new HttpError(404, 'There is no such table');
    return { table: t };
  });
  /** Worked out again from its runs as they are now, and kept; `changed` says whether any number moved. */
  app.post('/api/experiments/tables/:id/recompute', async (req) => {
    const before = getTable(d.db, P(req).id);
    const t = recomputeTable(d.db, P(req).id);
    if (!before || !t) throw new HttpError(404, 'There is no such table');
    saveTable(d.db, t);
    return { table: t, changed: t.markdown !== before.markdown };
  });
  app.post('/api/experiments/tables/:id/insert', async (req) => {
    const b = B(req);
    if (typeof b.page !== 'string' || !b.page) throw new HttpError(400, 'Which LaTeX document: page (its id)');
    return putInLatex(d, P(req).id, b.page, typeof b.file === 'string' && b.file ? b.file : 'main.tex');
  });
  app.delete('/api/experiments/tables/:id', async (req) => {
    deleteTable(d.db, P(req).id);
    return { ok: true };
  });
}

export const experiments: Feature = {
  id: 'experiments',
  routes,
  tools: (ctx) => experimentTools(ctx),
  spawn(s) {
    // A public app's run has none of these tools.
    if ((s.extra as { app?: { public?: boolean } } | undefined)?.app?.public) return undefined;
    return { instructions: [SPAWN_NOTE] };
  },
  start(d) {
    resume(d);
  },
};
