// The routes of evaluations (evaluations.ts), under /api/experiments/evaluations. Sealing, changing and deleting
// an evaluation, the baseline and the final test are the person's alone: an agent's calls (app_api, which come
// from inside the app) are refused here as well as by app_api's rules, and never get a final test's numbers.
import type { FastifyRequest } from 'fastify';
import type { EvalScore, Evaluation } from '../../shared/evaluations.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { isInternal } from '../internal.ts';
import {
  changesOf,
  checkHome,
  createEvaluation,
  deleteScore,
  evaluationsFor,
  foldersOf,
  getScore,
  listed,
  listEvaluations,
  listScores,
  mustEvaluation,
  removeEvaluation,
  restoreFiles,
  sealAgain,
  setBaseline,
  startScore,
  stopScore,
  updateEvaluation,
} from './evaluations.ts';
import { config } from '../config.ts';
import { suggestProtected } from './evaluation-suggest.ts';
import { okId } from './records.ts';

const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
const Q = (req: FastifyRequest) => req.query as Record<string, string | undefined>;

const idOf = (req: FastifyRequest) => {
  const id = (req.params as Record<string, string>).id;
  if (!okId(id)) throw new HttpError(400, 'Bad id');
  return id;
};
const folderOf = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 4000) : undefined);

/** Refuses an agent's call. */
const personOnly = (req: FastifyRequest, why: string) => {
  if (isInternal(req)) throw new HttpError(403, why);
};

/** An evaluation as this caller may see it: where the held-out data is stays between you and the app. */
function shown<T extends Evaluation>(req: FastifyRequest, ev: T): T {
  return isInternal(req) && ev.final?.heldOut ? { ...ev, final: { command: ev.final.command } } : ev;
}

export function evaluationRoutes(d: Deps) {
  const app = d.app;

  const scoreFor = (req: FastifyRequest): EvalScore => {
    const s = getScore(d.db, idOf(req));
    if (!s) throw new HttpError(404, 'There is no such score');
    return s;
  };
  const by = (req: FastifyRequest): EvalScore['by'] => ({ who: isInternal(req) ? 'agent' : 'you' });

  app.get('/api/experiments/evaluations', async (req) => {
    const cwd = folderOf(Q(req).cwd);
    const all = cwd ? (await evaluationsFor(d.db, cwd, { below: true })).map((x) => x.evaluation) : listEvaluations(d.db);
    return { evaluations: all.map((ev) => shown(req, listed(d.db, ev))) };
  });
  app.post('/api/experiments/evaluations', async (req) => {
    personOnly(req, 'Only the person creates and seals an evaluation: propose one with evaluation_propose');
    return { evaluation: await createEvaluation(d, B(req)) };
  });
  // For New evaluation: what a command and its folder suggest protecting (names only, nothing is read or changed).
  app.get('/api/experiments/evaluations/suggest', async (req) => {
    const cwd = folderOf(Q(req).cwd);
    if (!cwd) throw new HttpError(400, 'Which folder does the evaluation run in?');
    return { suggestions: await suggestProtected(cwd.replace(/^~(?=$|\/)/, config.home), Q(req).command ?? '') };
  });
  app.get('/api/experiments/evaluations/:id', async (req) => {
    const ev = await checkHome(d, idOf(req));
    // The scores evolutions asked for (one for each candidate tried) only when asked for: ?evolve=1.
    return { evaluation: shown(req, ev), scores: listScores(d.db, ev.id, ['score', 'baseline'], 200, { evolve: Q(req).evolve === '1' }), folders: await foldersOf(ev) };
  });
  app.put('/api/experiments/evaluations/:id', async (req) => {
    personOnly(req, 'Only the person changes an evaluation: propose one with evaluation_propose');
    return updateEvaluation(d, idOf(req), B(req));
  });
  app.delete('/api/experiments/evaluations/:id', async (req) => {
    personOnly(req, 'Only the person deletes an evaluation');
    await removeEvaluation(d, idOf(req));
    return { ok: true };
  });
  app.post('/api/experiments/evaluations/:id/seal', async (req) => {
    personOnly(req, 'Only the person seals an evaluation: propose one with evaluation_propose');
    return { evaluation: await sealAgain(d, idOf(req)) };
  });
  app.get('/api/experiments/evaluations/:id/changes', async (req) => changesOf(d.db, idOf(req), folderOf(Q(req).folder), { hideHeldOut: isInternal(req) }));
  app.post('/api/experiments/evaluations/:id/restore', async (req) => restoreFiles(d, idOf(req), folderOf(B(req).folder)));

  app.post('/api/experiments/evaluations/:id/scores', async (req) => {
    const b = B(req);
    if (b.seeds !== undefined && b.seeds !== null) personOnly(req, 'A score uses the evaluation’s own seeds: leave seeds out');
    return { score: await startScore(d, idOf(req), { kind: 'score', folder: folderOf(b.folder), seeds: b.seeds, by: by(req) }) };
  });
  app.post('/api/experiments/evaluations/:id/baseline', async (req) => {
    personOnly(req, 'Only the person sets the baseline');
    const id = idOf(req);
    const b = B(req);
    if (typeof b.score === 'string' && b.score) {
      const evaluation = setBaseline(d, id, b.score);
      return { evaluation, score: getScore(d.db, b.score) };
    }
    const score = await startScore(d, id, { kind: 'baseline', folder: folderOf(b.folder), by: by(req) });
    return { evaluation: mustEvaluation(d.db, id), score };
  });
  app.post('/api/experiments/evaluations/:id/final', async (req) => {
    personOnly(req, 'Only the person runs the final test');
    return { score: await startScore(d, idOf(req), { kind: 'final', folder: folderOf(B(req).folder), by: by(req) }) };
  });
  app.get('/api/experiments/evaluations/:id/final', async (req) => {
    personOnly(req, 'Only the person reads the final test');
    return { scores: listScores(d.db, mustEvaluation(d.db, idOf(req)).id, ['final']) };
  });

  app.get('/api/experiments/evaluations/scores/:id', async (req) => {
    const score = scoreFor(req);
    // The final tests are read from their evaluation, by the person.
    if (score.kind === 'final') throw new HttpError(404, 'There is no such score');
    return { score };
  });
  app.post('/api/experiments/evaluations/scores/:id/stop', async (req) => {
    const score = scoreFor(req);
    if (score.kind === 'final') personOnly(req, 'Only the person stops a final test');
    return { score: await stopScore(d, score.id) };
  });
  app.delete('/api/experiments/evaluations/scores/:id', async (req) => {
    personOnly(req, 'Only the person deletes a score');
    deleteScore(d, scoreFor(req).id);
    return { ok: true };
  });
}
