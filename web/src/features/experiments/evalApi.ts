// What the evaluation pages read: the list (with which ones are scoring now), and one evaluation with its scores, the
// folders it can score, its final tests and how far its running scores are. Changes come through the app's socket
// ({ t: 'feature', id: 'experiments', data: { evals } }, and { runs } while a score runs).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EvalFolder, EvalScore, Evaluation, EvaluationListed } from '@shared/evaluations';
import type { RunRecord } from '@shared/experiments';
import { api, ApiError, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { isOpen } from './evalWords';

const BASE = '/api/experiments/evaluations';

export const evalUrl = (id: string, rest = '') => `${BASE}/${enc(id)}${rest}`;
export const scoreUrl = (id: string, rest = '') => `${BASE}/scores/${enc(id)}${rest}`;

/** An evaluation's page: /experiments?evaluation=<id>, with &score=<id> to show one of its scores. */
export const evaluationPath = (id: string, score?: string) => `/experiments?evaluation=${enc(id)}${score ? `&score=${enc(score)}` : ''}`;

/** The evaluation a run scored, when the app made it to score one. */
export const scoredBy = (r: Pick<RunRecord, 'tags' | 'env'>) => (r.tags?.includes('evaluation') ? r.env?.HYDOR_EVALUATION : undefined);

/** Waits a moment before reading again, so a burst of changes is read once. */
function useSoon(load: () => void, ms = 400): () => void {
  const timer = useRef<number | null>(null);
  const latest = useRef(load);
  latest.current = load;
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return useCallback(() => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      latest.current();
    }, ms);
  }, [ms]);
}

/** The evaluations, newest first (null while they are first read), and the ids of those being scored now. */
export function useEvaluations(): { evaluations: EvaluationListed[] | null; scoring: Set<string>; reload: () => void } {
  const [evaluations, setEvaluations] = useState<EvaluationListed[] | null>(null);
  const [scoring, setScoring] = useState<Set<string>>(() => new Set());
  const alive = useRef(true);
  const load = useCallback(() => {
    api<{ evaluations: EvaluationListed[] }>(BASE)
      .then((r) => {
        if (!alive.current) return;
        setEvaluations(r.evaluations);
        if (!r.evaluations.length) return setScoring(new Set());
        // The runs going now include those that score evaluations.
        return api<{ runs: RunRecord[] }>('/api/experiments/runs?status=queued,waiting,starting,running&limit=500').then((x) => {
          if (alive.current) setScoring(new Set(x.runs.map(scoredBy).filter((id): id is string => !!id)));
        });
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    alive.current = true;
    load();
    const t = window.setInterval(load, 20_000);
    return () => {
      alive.current = false;
      window.clearInterval(t);
    };
  }, [load]);
  const soon = useSoon(load);
  useFeatureEvent('experiments', (e) => {
    const d = e.data as { evals?: unknown; runs?: unknown } | null;
    if (d?.evals || d?.runs) soon();
  });
  return { evaluations, scoring, reload: load };
}

export interface EvaluationDetail {
  evaluation: Evaluation;
  /** Scores and measurements of the baseline, newest first. */
  scores: EvalScore[];
  finals: EvalScore[];
  folders: EvalFolder[];
  /** How many of a running score's runs are done, by score id. */
  done: Record<string, number>;
}

/** One evaluation with everything its page shows. */
export function useEvaluation(id: string): { data: EvaluationDetail | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<EvaluationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The newest read wins: an older one that answers late is left.
  const turn = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++turn.current;
    try {
      const [d, f] = await Promise.all([
        api<{ evaluation: Evaluation; scores: EvalScore[]; folders: EvalFolder[] }>(evalUrl(id)),
        api<{ scores: EvalScore[] }>(evalUrl(id, '/final')),
      ]);
      const done: Record<string, number> = {};
      const going = d.scores.filter(isOpen);
      if (going.length) {
        const r = await api<{ runs: RunRecord[] }>(`/api/experiments/runs?group=${enc(`eval-${id}`)}&limit=1000`);
        const status = new Map(r.runs.map((x) => [x.id, x.status]));
        for (const s of going) done[s.id] = s.runs.filter((x) => status.get(x) === 'done').length;
      }
      if (mine !== turn.current) return;
      setData({ evaluation: d.evaluation, scores: d.scores, folders: d.folders, finals: f.scores, done });
      setError(null);
    } catch (e) {
      if (mine !== turn.current) return;
      setError(e instanceof ApiError && e.status === 404 ? 'This evaluation is no longer kept.' : (e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    setData(null);
    setError(null);
    void reload();
    return () => {
      turn.current++;
    };
  }, [reload]);
  const soon = useSoon(() => void reload(), 500);
  const ids = useRef(new Set<string>());
  ids.current = new Set([...(data?.scores ?? []), ...(data?.finals ?? [])].filter(isOpen).flatMap((s) => s.runs));
  useFeatureEvent('experiments', (e) => {
    const d = e.data as { evals?: string[]; runs?: string[] } | null;
    if (d?.evals?.includes(id) || d?.runs?.some((r) => ids.current.has(r))) soon();
  });
  // While something runs, a slower look as well; else the sealed files are looked at again now and then.
  const going = ids.current.size > 0;
  useEffect(() => {
    const t = window.setInterval(() => void reload(), going ? 5000 : 45_000);
    return () => window.clearInterval(t);
  }, [going, reload]);
  return { data, error, reload };
}
