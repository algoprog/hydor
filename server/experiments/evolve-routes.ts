// The routes of Evolve (evolve.ts), under /api/experiments/evolutions. Agents read them; through app_api, starting
// one, pausing, resuming, stopping and taking the best ask the person on a card each time (server/guide/api.ts), and
// deleting one is the person's alone.
import type { FastifyRequest } from 'fastify';
import type { Candidate, Evolution } from '../../shared/evolve.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { Deps } from '../features/types.ts';
import { isInternal } from '../internal.ts';
import { getEvaluation, mustEvaluation } from './evaluations.ts';
import { candidateDetail, candidatesOf, deleteEvolution, letEvolutionRun, listEvolutions, mustEvolution, pauseEvolution, refuseEvolutionAtCeiling, resumeEvolution, startEvolution, stopEvolution, takeBest } from './evolve.ts';
import { suggestEvolveFiles } from './evolve-suggest.ts';
import { okId } from './records.ts';

const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
const Q = (req: FastifyRequest) => req.query as Record<string, string | undefined>;

const param = (req: FastifyRequest, name: string) => {
  const id = (req.params as Record<string, string>)[name];
  if (!okId(id)) throw new HttpError(400, 'Bad id');
  return id;
};

export function evolveRoutes(d: Deps) {
  const app = d.app;
  const by = (req: FastifyRequest): Evolution['by'] => ({ who: isInternal(req) ? 'agent' : 'you' });

  app.get('/api/experiments/evolutions', async (req) => {
    const evaluation = Q(req).evaluation;
    const list = listEvolutions(d.db, evaluation && okId(evaluation) ? evaluation : undefined);
    // With how its best stands to the start, for a list that says what came of it.
    const kept = d.db.prepare('select data from exp_candidates where id = ?');
    return {
      evolutions: list.map((e) => {
        const row = e.best ? (kept.get(e.best) as { data: string } | undefined) : undefined;
        const gain = row ? (JSON.parse(row.data) as Candidate).gain : undefined;
        return gain === undefined ? e : { ...e, bestGain: gain };
      }),
    };
  });
  app.post('/api/experiments/evolutions', async (req) => ({ evolution: await startEvolution(d, B(req), by(req)) }));
  // For a new evolution: the files it might change (names only, nothing is read into the page or changed).
  app.get('/api/experiments/evolutions/suggest', async (req) => {
    const id = Q(req).evaluation;
    if (!id || !okId(id)) throw new HttpError(400, 'Which evaluation scores the changes?');
    const ev = mustEvaluation(d.db, id);
    const from = Q(req).from?.trim();
    return { files: await suggestEvolveFiles(d.db, ev, from ? from.replace(/^~(?=$|\/)/, config.home) : ev.cwd) };
  });
  app.get('/api/experiments/evolutions/:id', async (req) => {
    const evolution = mustEvolution(d.db, param(req, 'id'));
    const ev = getEvaluation(d.db, evolution.evaluation);
    return {
      evolution,
      candidates: candidatesOf(d.db, evolution.id, { newest: true }),
      evaluation: ev ? { id: ev.id, name: ev.name, metric: ev.metric, better: ev.better } : null,
      finalTest: !!ev?.final,
    };
  });
  app.get('/api/experiments/evolutions/:id/candidates/:cid', async (req) => ({ candidate: await candidateDetail(d.db, param(req, 'id'), param(req, 'cid')) }));
  app.post('/api/experiments/evolutions/:id/pause', async (req) => ({ evolution: pauseEvolution(d, param(req, 'id')) }));
  app.post('/api/experiments/evolutions/:id/resume', async (req) => {
    const id = param(req, 'id');
    // An agent does not set a search going again past the ceiling on agents' GPU hours, unless you let it run beyond.
    if (isInternal(req)) {
      const e = mustEvolution(d.db, id);
      const ev = getEvaluation(d.db, e.evaluation);
      if (ev && !e.letRun) await refuseEvolutionAtCeiling(d.db, ev, e.from ?? ev.cwd);
    }
    return { evolution: resumeEvolution(d, id) };
  });
  app.post('/api/experiments/evolutions/:id/let-run', async (req) => {
    if (isInternal(req)) throw new HttpError(403, 'Only the person lets a held search go: tell them it waits (its page has Let it run)');
    return { evolution: letEvolutionRun(d, param(req, 'id')) };
  });
  app.post('/api/experiments/evolutions/:id/stop', async (req) => ({ evolution: await stopEvolution(d, param(req, 'id'), isInternal(req) ? 'Stopped by an agent' : 'Stopped by you') }));
  app.post('/api/experiments/evolutions/:id/take', async (req) => {
    const c = B(req).candidate;
    if (c !== undefined && c !== null && c !== '' && (typeof c !== 'string' || !okId(c))) throw new HttpError(400, 'Bad try id');
    return takeBest(d, param(req, 'id'), typeof c === 'string' && c ? c : undefined);
  });
  app.delete('/api/experiments/evolutions/:id', async (req) => {
    if (isInternal(req)) throw new HttpError(403, 'Only the person deletes an evolution');
    const kept = await deleteEvolution(d, param(req, 'id'), { keepFiles: (req.query as { files?: string }).files === 'keep' });
    return { ok: true, ...(kept ? { kept } : {}) };
  });
}
