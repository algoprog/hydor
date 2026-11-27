// Experiments (its own section on the rail, /experiments): a queue of jobs that wait for free GPUs on any of your machines (or a
// cluster's queue over SSH), run on their own and are kept as records (commit and patch, settings, seed,
// environment, metrics, log), an agent on call that wakes when a run goes wrong, sweeps, and results tables with
// significance for the paper. The queue is queue.ts; records.ts keeps the records (and is what the rest of the app
// reads); tables.ts the tables, clusters.ts the clusters, remote.ts the other machines, tools.ts the agents' tools,
// evaluations.ts how a project keeps score (one sealed command and one number), evolve.ts the search that tries
// many small changes to a few files and keeps the best by an evaluation's score.
import type { FastifyRequest } from 'fastify';
import { standingsOf } from '../../shared/experiment-attempts.ts';
import { ACTIVE, type ExperimentGroup, type RunRecord, type RunStatus } from '../../shared/experiments.ts';
import { HttpError } from '../auth.ts';
import type { Deps, Feature } from '../features/types.ts';
import { isInternal } from '../internal.ts';
import { memoryOn } from '../memory/store.ts';
import { agentsUse, heldNow, letRun } from './budget.ts';
import { codeFolder, codeStatus, keepsCode, logAfter, makeTable, patchOf, putInLatex, runsList, runView, seriesFor, startSweep, cleanTableSpec } from './api.ts';
import { checkCluster, getCluster, listClusters, noteCheck, removeCluster, saveCluster } from './clusters.ts';
import { cleanJob, queueNow, resume, runAgain, setSettings, settingsOf, stopRun, submit, tellRuns, useDeps } from './queue.ts';
import { describeBackfill, describeGroup, enableExperimentDescriptions } from './describe.ts';
import { evaluationRoutes } from './evaluation-routes.ts';
import { getScore, resumeScores, runsOfEvaluation } from './evaluations.ts';
import { resumeEvolutions, runsOfEvolution } from './evolve.ts';
import { evolveRoutes } from './evolve-routes.ts';
import { archiveGroup, BULK_MAX, markRuns, patchRun } from './marks.ts';
import { archivedGroups, awayIds, deleteInfo, deleteRun, deleteTable, getInfo, getRun, getSweep, getTable, isFinalRun, keepRunFiles, listInfo, listRuns, listTables, marked, okId, recomputeTable, runFiles, saveInfo, saveTable, workOut } from './records.ts';
import { remoteMachine } from './remote.ts';
import { findingsByExperiment } from './shown-findings.ts';
import { experimentTools, SPAWN_NOTE } from './tools.ts';
import { askGb, lastPeak, readTrial, startTrial } from './trial.ts';

const P = (req: FastifyRequest) => req.params as Record<string, string>;
const Q = (req: FastifyRequest) => req.query as Record<string, string | undefined>;
const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, any>;

const runId = (req: FastifyRequest) => {
  const id = P(req).id;
  if (!okId(id)) throw new HttpError(400, 'Bad run id');
  return id;
};

/** Who starts a run through the API: an agent (its app_api, or an agent on another machine) or the person. */
const startedBy = (req: FastifyRequest) => (isInternal(req) || B(req).agent === true ? { agent: true } : { page: true });

const statusesOf = (s: string | undefined): RunStatus[] | undefined => {
  if (!s) return undefined;
  if (s === 'active') return ACTIVE;
  return s.split(',').filter((x): x is RunStatus => ['queued', 'waiting', 'starting', 'running', 'done', 'failed', 'stopped', 'lost'].includes(x));
};

function routes(d: Deps) {
  const app = d.app;
  useDeps(d);

  // A final test is the person's alone: an agent's calls (app_api, which come from inside the app) do not read or
  // touch its runs.
  const hidden = (req: FastifyRequest, id: string) => {
    const r = isInternal(req) ? getRun(d.db, id) : null;
    return !!r && isFinalRun(r);
  };
  const open = (req: FastifyRequest) => {
    const id = runId(req);
    if (hidden(req, id)) throw new HttpError(403, 'That run is a final test: only the person reads it');
    return id;
  };
  const noFinals = (req: FastifyRequest) => {
    const named: unknown = B(req).runs;
    if (Array.isArray(named) && named.some((id) => typeof id === 'string' && okId(id) && hidden(req, id))) throw new HttpError(403, 'One of those runs is a final test: only the person reads it');
    return B(req);
  };

  // ---- runs ----------------------------------------------------------------------------------------------
  app.get('/api/experiments/runs', async (req) => {
    const q = Q(req);
    const status = statusesOf(q.status);
    // The runs that score evaluations are not experiments, nor are trials: they come when their group or tag is asked
    // for, with evaluation=1, and in a list of what is running now.
    const plain = !(q.group || q.tag === 'evaluation' || q.tag === 'try' || q.evaluation === '1' || (status?.length && status.every((s) => ACTIVE.includes(s))));
    const limit = Math.min(Number(q.limit) || 200, 1000);
    // ?archived=0 (the terminal's list): what was put aside is left out, and more are read so the limit still fills.
    const left = q.archived === '0';
    let runs = await runsList(d, { group: q.group, tag: q.tag, status, cwd: q.cwd, project: q.project, sweep: q.sweep, night: q.night, q: q.q, limit: left ? 5000 : limit, plain }, q.everywhere === '1');
    if (left) {
      const away = awayIds(d.db);
      runs = runs.filter((r) => (r.machine ? !r.archivedAt : !away.has(r.id))).slice(0, limit);
    }
    return { runs: isInternal(req) ? runs.filter((r) => !isFinalRun(r)) : runs };
  });
  app.get('/api/experiments/runs/:id', async (req) => runView(d, open(req), Q(req).log === '0' ? 0 : Math.min(Number(Q(req).lines ?? 300) || 0, 5000)));
  app.get('/api/experiments/runs/:id/log', async (req) => logAfter(d, open(req), Number(Q(req).from) || 0));
  app.get('/api/experiments/runs/:id/patch', async (req) => ({ patch: await patchOf(d, open(req)) }));
  // carryOn with continues: a run on another machine (continues: its id there) carried on from here, by its page's Run again.
  app.post('/api/experiments/jobs', async (req) => {
    const { carryOn, continues } = B(req);
    const theirs = carryOn === true && typeof continues === 'string' && okId(continues) ? continues : undefined;
    return { run: heldNow(d, await submit(d, await cleanJob(d.db, B(req)), { startedBy: startedBy(req), ...(theirs ? { carryOn: true, theirs } : {}) })) };
  });
  /** What agents' runs used in seven days against their ceiling, and how many it holds. */
  app.get('/api/experiments/budget', async () => agentsUse(d.db));
  app.post('/api/experiments/runs/:id/let-run', async (req) => {
    if (isInternal(req)) throw new HttpError(403, 'Only the person lets a held run go: tell them it waits (its page has Let it run)');
    const id = runId(req);
    // A copy of a run another machine keeps: let go there.
    const r = getRun(d.db, id);
    if (r?.remote) {
      const m = remoteMachine(r.remote.machine);
      if (!m) throw new HttpError(502, 'Its machine is no longer in Settings → Machines');
      await m.call('POST', `/api/experiments/runs/${r.remote.id}/let-run`, 20_000, {});
      return { run: r };
    }
    return { run: letRun(d, id) };
  });
  // warn: another machine's Hydor passes on a stop its app decided (a sweep's early stop), which warns the run first.
  app.post('/api/experiments/runs/:id/stop', async (req) => ({ run: await stopRun(d, open(req), typeof B(req).why === 'string' && B(req).why.trim() ? B(req).why.trim().slice(0, 200) : undefined, { app: B(req).warn === true }) }));
  app.post('/api/experiments/runs/:id/again', async (req) => {
    // code: "own", the code the run ran; "now" (or left out), the folder's as it is now.
    const { code, ...changes } = B(req);
    if (code !== undefined && code !== 'own' && code !== 'now') throw new HttpError(400, 'code: "own" (the code it ran) or "now" (the folder as it is now)');
    // A training must not change code between its checkpoints: carrying on runs the code it ran.
    if (code === 'now' && (changes.carryOn === true || changes.resume === true)) throw new HttpError(400, 'Carrying on runs the code it ran with: leave code out, or start over to run the folder as it is now');
    return { run: heldNow(d, await runAgain(d, open(req), changes, startedBy(req), { own: code === 'own' })) };
  });
  app.get('/api/experiments/runs/:id/code', async (req) => codeStatus(d, open(req)));
  app.post('/api/experiments/runs/:id/code', async (req) => codeFolder(d, open(req)));
  app.get('/api/experiments/code', async (req) => keepsCode(Q(req).cwd ?? ''));
  // Notes, stars and archiving. What the person puts aside stays theirs: a call from inside the app (an agent's) does not archive.
  const theirs = (req: FastifyRequest) => {
    if (isInternal(req) && B(req).archived !== undefined) throw new HttpError(403, 'Only the person archives runs and experiments, on the Experiments page');
  };
  app.patch('/api/experiments/runs/:id', async (req) => {
    theirs(req);
    return { run: patchRun(d, open(req), B(req), isInternal(req) ? 'agent' : 'user') };
  });
  app.post('/api/experiments/runs/bulk', async (req) => {
    theirs(req);
    const b = B(req);
    const given: unknown[] = Array.isArray(b.ids) ? b.ids : [];
    const ids = [...new Set(given.filter((x): x is string => typeof x === 'string' && okId(x)))];
    if (!ids.length) throw new HttpError(400, 'ids: the runs’ ids');
    if (ids.some((id) => hidden(req, id))) throw new HttpError(403, 'One of those runs is a final test: only the person reads it');
    if (ids.length > BULK_MAX) throw new HttpError(400, `At most ${BULK_MAX} runs at once`);
    if (b.starred === undefined && b.archived === undefined && b.stop !== true) throw new HttpError(400, 'What to do with them: starred, archived or stop');
    // Stopped first: a run that ends at once can be archived by the same call.
    let stopped = 0;
    const failed: { id: string; error: string }[] = [];
    if (b.stop === true)
      for (const id of ids) {
        const r = getRun(d.db, id);
        if (!r || !ACTIVE.includes(r.status)) continue;
        try {
          await stopRun(d, id);
          stopped++;
        } catch (e) {
          failed.push({ id, error: (e as Error).message });
        }
      }
    const { runs, skipped } = markRuns(d, ids, { starred: b.starred, archived: b.archived });
    return { runs, skipped, stopped, ...(failed.length ? { failed } : {}) };
  });
  app.delete('/api/experiments/runs/:id', async (req) => {
    const id = open(req);
    const r = getRun(d.db, id);
    if (!r) throw new HttpError(404, 'There is no such run');
    if (ACTIVE.includes(r.status)) throw new HttpError(409, 'It has not ended: stop it first');
    // ?files=keep: what it wrote into its own folder is moved aside first.
    const kept = Q(req).files === 'keep' ? keepRunFiles([id]) : undefined;
    deleteRun(d.db, id);
    // The last run of an experiment goes: what was written of it goes too.
    if (r.group && !listRuns(d.db, { group: r.group, limit: 1 }).length) deleteInfo(d.db, r.group);
    tellRuns(d, [id]);
    return { ok: true, ...(kept ? { kept } : {}) };
  });
  /** What the runs behind an evaluation, one of its scores or an evolution wrote into their own folders: what deleting it deletes. */
  app.get('/api/experiments/run-files', async (req) => {
    if (isInternal(req)) throw new HttpError(403, 'Only the person deletes evaluations, scores and evolutions');
    const q = Q(req);
    const named = q.runs?.split(',').filter(okId).slice(0, BULK_MAX);
    const runs = q.evaluation ? runsOfEvaluation(d.db, q.evaluation) : q.score ? (getScore(d.db, q.score)?.runs ?? []) : q.evolution ? runsOfEvolution(d.db, q.evolution) : (named ?? null);
    if (!runs) throw new HttpError(400, 'Which one: evaluation, score or evolution (its id), or runs (their ids)');
    return { folderFiles: await runFiles(runs) };
  });
  // ---- trying a command first --------------------------------------------------------------------------------
  app.post('/api/experiments/try', async (req) => {
    const run = heldNow(d, await startTrial(d, B(req), { startedBy: startedBy(req) }));
    return { trial: readTrial(d.db, run.id), run };
  });
  app.get('/api/experiments/try/:id', async (req) => ({ trial: readTrial(d.db, runId(req)) }));
  /** The most GPU memory the last run of the same command here held, when one is known: what New run offers. */
  app.get('/api/experiments/last-peak', async (req) => {
    const q = Q(req);
    const command = q.command?.trim() ?? '';
    const cwd = q.cwd?.trim() ?? '';
    const gb = command && cwd ? lastPeak(d.db, command, cwd) : undefined;
    return gb ? { peakGb: gb, askGb: askGb(gb) } : {};
  });
  app.get('/api/experiments/queue', async () => queueNow(d));
  app.get('/api/experiments/settings', async () => settingsOf(d.db));
  app.put('/api/experiments/settings', async (req) => setSettings(d.db, B(req)));
  /** The metric series of many runs at once (the page's charts and sparklines), by run id; unknown ids are left out. */
  app.get('/api/experiments/series', async (req) => {
    // ?runs=a,b, or ?runs=a&runs=b (an array).
    const asked: string | string[] | undefined = (req.query as Record<string, string | string[] | undefined>).runs;
    const ids = [...new Set((Array.isArray(asked) ? asked.join(',') : (asked ?? '')).split(',').map((x) => x.trim()).filter(okId))].slice(0, 100);
    return { series: await seriesFor(d, ids.filter((id) => !hidden(req, id))) };
  });
  /** The experiments (groups) runs belong to, the latest first, with how many runs each has and what each is (title, description, category). */
  app.get('/api/experiments/groups', async (req) => {
    const seen = new Map<string, RunRecord[]>();
    for (const r of marked(listRuns(d.db, { limit: 5000, plain: Q(req).evaluation !== '1' }))) {
      if (!r.group) continue;
      const g = seen.get(r.group);
      if (g) g.push(r);
      else seen.set(r.group, [r]);
    }
    const info = listInfo(d.db);
    const gone = archivedGroups(d.db);
    const findings = findingsByExperiment(d.db);
    const groups: ExperimentGroup[] = [...seen].map(([name, runs]) => {
      const i = info.get(name);
      const stand = standingsOf(runs);
      const away = new Set(stand.archived.map((r) => r.id));
      const verdict = findings.get(name)?.[0]?.verdict;
      return {
        name,
        runs: runs.length,
        done: runs.filter((r) => r.status === 'done' && !away.has(r.id)).length,
        lastAt: runs.reduce((t, r) => Math.max(t, r.createdAt), 0),
        shown: stand.rows.length,
        earlier: stand.folded.length,
        archived: stand.archived.length,
        ...(gone.has(name) ? { archivedAt: gone.get(name) } : {}),
        ...(verdict ? { verdict } : {}),
        ...(i?.title ? { title: i.title } : {}),
        ...(i?.description ? { description: i.description } : {}),
        ...(i?.category ? { category: i.category } : {}),
        ...(i?.by ? { by: i.by } : {}),
        ...(i?.at ? { at: i.at } : {}),
      };
    });
    return { groups: groups.sort((a, b) => b.lastAt - a.lastAt) };
  });
  /** The findings whose evidence names a run or a results table of one experiment, the newest first. */
  app.get('/api/experiments/findings', async (req) => {
    const group = Q(req).group?.trim() ?? '';
    if (!group) throw new HttpError(400, 'Which experiment: group');
    return { findings: findingsByExperiment(d.db).get(group) ?? [], memory: memoryOn(d.db) };
  });
  /** Changes an experiment's title, description or category (the fields given replace the old ones, '' clears one); kept as the user's. */
  app.put('/api/experiments/groups', async (req) => {
    const b = B(req);
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : '';
    if (!name) throw new HttpError(400, 'Which experiment: name (its group)');
    const p: { title?: string; description?: string; category?: string } = {};
    for (const k of ['title', 'description', 'category'] as const) {
      if (b[k] === undefined || b[k] === null) continue;
      if (typeof b[k] !== 'string') throw new HttpError(400, `${k} is text`);
      p[k] = b[k];
    }
    if (b.archived !== undefined) {
      theirs(req);
      if (typeof b.archived !== 'boolean') throw new HttpError(400, 'archived is true or false');
      archiveGroup(d, name, b.archived);
      // Archiving alone leaves what was written of it as it is, and who wrote it.
      if (!Object.keys(p).length) {
        const { runs: _runs, ...kept } = getInfo(d.db, name) ?? { name, runs: 0 };
        return { group: { ...kept, ...(b.archived ? { archivedAt: archivedGroups(d.db).get(name) } : {}) } };
      }
    }
    const { runs: _runs, ...group } = saveInfo(d.db, name, p, 'user');
    d.broadcast({ t: 'feature', id: 'experiments', data: { groups: [name] } });
    return { group };
  });
  /** Has the helper model write an experiment's title, description and category now, over what is there (the user asked). */
  app.post('/api/experiments/groups/describe', async (req) => {
    const name = typeof B(req).name === 'string' ? B(req).name.trim() : '';
    if (!name) throw new HttpError(400, 'Which experiment: name (its group)');
    const got = await describeGroup(d, name, { force: true });
    if (!got) throw new HttpError(502, 'The helper model gave no title and description to use. Try again, or write them yourself.');
    const { runs: _runs, ...group } = got;
    return { group };
  });

  // ---- sweeps --------------------------------------------------------------------------------------------
  app.post('/api/experiments/sweeps', async (req) => {
    const s = await startSweep(d, B(req), { startedBy: startedBy(req) });
    return { sweep: s.sweep, runs: s.runs.map((r) => heldNow(d, r)) };
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
  app.post('/api/experiments/tables', async (req) => ({ table: makeTable(d, noFinals(req)) }));
  /** A table as the spec would make it now, not kept (the dialog shows it as you choose). */
  app.post('/api/experiments/tables/preview', async (req) => ({ table: workOut(d.db, cleanTableSpec(noFinals(req)), 'preview') }));
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

  evaluationRoutes(d);
  evolveRoutes(d);
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
    // Scores whose runs ended while the app was not running are worked out; then the evolutions that were running
    // go on, each candidate that was being scored waiting for its score again.
    void resumeScores(d)
      .then(() => resumeEvolutions(d))
      .catch((e) => console.error('[experiments] evolutions:', (e as Error)?.message ?? e));
    // Experiments without a title and description get them from the helper model, in the background.
    enableExperimentDescriptions();
    describeBackfill(d);
  },
};
