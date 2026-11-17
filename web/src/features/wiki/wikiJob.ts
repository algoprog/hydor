// What a project's wiki is doing at a person's request (a build from its history, a rebuild, an update), as GET
// /api/projects/:id/wiki/rebuild says it, and the hooks that keep it current: it loads again when the server says the wiki changed, and
// every few seconds while a job runs.
import { useCallback, useEffect, useState } from 'react';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';

export interface WikiStep {
  id: 'files' | 'notes' | 'sessions' | 'commits' | 'documents' | 'sources' | 'organise' | 'hubs';
  label: string;
  done: number;
  total: number;
  essential: boolean;
  /** The commits a commits step holds. */
  count?: number;
}

export interface WikiJobProgressData {
  steps: WikiStep[];
  current: string[];
  minutesLeft: number;
  minutesLeftEssentials?: number;
  essentials?: number;
  essentialsAt?: number;
}

/** GET /api/projects/:id/wiki/rebuild. */
export interface WikiJob {
  state: 'idle' | 'running' | 'done' | 'failed' | 'stopped';
  kind?: 'build' | 'rebuild' | 'update' | 'reorganise';
  phase?: string;
  done: number;
  total: number;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  parts?: string[];
  did?: string[];
  progress?: WikiJobProgressData;
  archives: { at: string; articles: number }[];
}

/** The wiki's job status. `version` grows when the page already knows the wiki changed (a project page). */
export function useWikiJob(id: string, active: boolean, version = 0): [WikiJob | null, () => void] {
  const [job, setJob] = useState<WikiJob | null>(null);
  const [tick, setTick] = useState(0);
  useFeatureEvent('wiki', (e) => {
    if ((e.data as { space?: string | null } | null)?.space === id) setTick((n) => n + 1);
  });
  useEffect(() => {
    if (!active) return;
    let live = true;
    api<WikiJob>(`/api/projects/${enc(id)}/wiki/rebuild`).then(
      (r) => live && setJob(r),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id, active, version, tick]);
  useEffect(() => {
    if (job?.state !== 'running') return;
    const t = setTimeout(() => setTick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [job, tick]);
  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return [job, refresh];
}
