// What the Evolve pages read: the evolutions (all, or one evaluation's), one with its tries, and one try with what it
// changed. Changes come through the app's socket ({ t: 'feature', id: 'experiments', data: { evolutions } }), up to
// four times a second while one runs: a page reads again no more often than it can draw, and keeps the tries that did
// not change as they were.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candidate, Evolution } from '@shared/evolve';
import { api, ApiError, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { isGoing, keepSame } from './evolveWords';

const BASE = '/api/experiments/evolutions';

export const evolveUrl = (id: string, rest = '') => `${BASE}/${enc(id)}${rest}`;
export const suggestUrl = (evaluation: string) => `${BASE}/suggest?evaluation=${enc(evaluation)}`;
export const evolveStartUrl = BASE;

/** An evolution's page: /experiments?evolution=<id>, with &try=<id> to open one of its tries. */
export const evolutionPath = (id: string, candidate?: string) => `/experiments?evolution=${enc(id)}${candidate ? `&try=${enc(candidate)}` : ''}`;

/** An evolution in a list, with how its best stands to the start. */
export type ListedEvolution = Evolution & { bestGain?: number };

/** Reads now, and then at most once every `every` ms however often it is asked. */
function useThrottled(load: () => Promise<void>, every: () => number) {
  const timer = useRef<number | null>(null);
  const busy = useRef(false);
  const again = useRef(false);
  const latest = useRef({ load, every });
  latest.current = { load, every };
  const alive = useRef(true);
  const ask = useCallback(() => {
    if (busy.current) {
      again.current = true;
      return;
    }
    if (timer.current) return;
    timer.current = window.setTimeout(async () => {
      timer.current = null;
      busy.current = true;
      await latest.current.load().catch(() => {});
      busy.current = false;
      if (again.current && alive.current) {
        again.current = false;
        ask();
      }
    }, latest.current.every());
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);
  return ask;
}

/** The evolutions, newest first (of one evaluation when given). */
export function useEvolutions(evaluation?: string): ListedEvolution[] {
  const [list, setList] = useState<ListedEvolution[]>([]);
  const turn = useRef(0);
  const load = useCallback(async () => {
    const mine = ++turn.current;
    const r = await api<{ evolutions: ListedEvolution[] }>(`${BASE}${evaluation ? `?evaluation=${enc(evaluation)}` : ''}`);
    if (mine === turn.current) setList(r.evolutions);
  }, [evaluation]);
  useEffect(() => {
    void load().catch(() => {});
    const t = window.setInterval(() => void load().catch(() => {}), 30_000);
    return () => {
      turn.current++;
      window.clearInterval(t);
    };
  }, [load]);
  const soon = useThrottled(load, () => 1000);
  useFeatureEvent('experiments', (e) => {
    if ((e.data as { evolutions?: string[] } | null)?.evolutions) soon();
  });
  return list;
}

export interface EvolutionDetail {
  evolution: Evolution;
  /** Newest first. */
  candidates: Candidate[];
  evaluation: { id: string; name: string; metric: string; better: 'higher' | 'lower' } | null;
  /** Whether the evaluation has a final test. */
  finalTest?: boolean;
  /** When it was read, for the time it has worked since. */
  readAt: number;
}

/** One evolution with its tries. */
export function useEvolution(id: string): { data: EvolutionDetail | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<EvolutionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const turn = useRef(0);
  // How long the last read took: a long list is read less often.
  const cost = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++turn.current;
    const t = performance.now();
    try {
      const r = await api<Omit<EvolutionDetail, 'readAt'>>(evolveUrl(id));
      cost.current = performance.now() - t;
      if (mine !== turn.current) return;
      setData((old) => ({ ...r, candidates: old && old.evolution.id === id ? keepSame(old.candidates, r.candidates) : r.candidates, readAt: Date.now() }));
      setError(null);
    } catch (e) {
      if (mine !== turn.current) return;
      setError(e instanceof ApiError && e.status === 404 ? 'This evolution is no longer kept.' : (e as Error).message);
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
  const soon = useThrottled(reload, () => Math.max(700, Math.min(6000, cost.current * 6)));
  useFeatureEvent('experiments', (e) => {
    if ((e.data as { evolutions?: string[] } | null)?.evolutions?.includes(id)) soon();
  });
  const going = !!data && isGoing(data.evolution);
  useEffect(() => {
    if (!going) return;
    const t = window.setInterval(() => void reload(), 20_000);
    return () => window.clearInterval(t);
  }, [going, reload]);
  return { data, error, reload };
}
