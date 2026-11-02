// Apps in the pages: what the server sends, where each page lives, and live news of runs.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppBatch, AppDef, AppField, AppRecipe, AppRun, AppTemplate, RunAsk, RunProgress, RunStepView } from '@shared/apps';
import type { EnvView } from '@shared/app-manifest';
import { isActive } from '@shared/apps';
import { api, enc } from '../../lib/api';
import { onFeatureEvent } from '../../lib/featureEvents';

export interface Usage {
  runs: number;
  spent: number;
}

export interface Gallery {
  apps: (AppDef & { usage: Usage })[];
  templates: AppTemplate[];
  recent: AppRun[];
}

export interface AppKey {
  id: string;
  name: string;
  hint: string;
  createdAt: number;
  lastUsed?: number;
}

export interface AppDetail {
  app?: AppDef;
  template?: AppTemplate;
  keys?: AppKey[];
  usage?: Usage;
  publicUsage?: Usage;
  workDir?: string;
  /** How what it needs stands on this computer (its packages, commands). */
  env?: EnvView;
}

export type RunRecipe = Pick<AppRecipe, 'name' | 'icon' | 'color' | 'fields' | 'answer' | 'agent' | 'acpAgent' | 'model'>;

export interface RunDetail {
  run: AppRun;
  progress: RunProgress;
  recipe: RunRecipe;
  /** The app's address, while it exists. */
  slug: string | null;
  /** Follow-ups after the task, oldest first. */
  asks: RunAsk[];
  /** What the agent said back to the task itself (the run's reply is to the latest message). */
  first?: string;
  /** Follow-ups waiting for the turn running now to end. */
  queued: { id: string; text: string; at: number }[];
  /** Why it takes no follow-ups (a public page's run, its session gone or open elsewhere). */
  noAsks?: string;
  /** A run with steps: each step and how it went. */
  steps?: RunStepView[];
  /** An Ask a person step waiting for the answer: where, what it asks, and its form (none: yes or no). */
  question?: { step: string; question: string; fields?: AppField[]; since: number };
}

export interface BatchDetail {
  batch: AppBatch;
  runs: AppRun[];
}

export interface Estimate {
  rows: number;
  perRun: number | null;
  basis: 'runs' | 'none';
  total: number | null;
  cap: number | null;
  most: number | null;
  from: number;
}

/** The page of an app, or of a template ("tpl:<id>"). */
export const appPath = (id: string) => (id.startsWith('tpl:') ? `/apps/t/${encodeURIComponent(id.slice(4))}` : `/apps/${encodeURIComponent(id)}`);
export const runPath = (id: string) => `/apps/runs/${encodeURIComponent(id)}`;

export function fileToBase64(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** Hears of every change to a run (its status, its result), from the server's live events. */
export function useRunEvents(fn: (run: AppRun) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(
    () =>
      onFeatureEvent('apps', (e) => {
        const run = (e.data as { run?: AppRun } | null)?.run;
        if (run) ref.current(run);
      }),
    [],
  );
}

/** A run as its page shows it, kept current: on news of it, and every 2 s while it works or has follow-ups waiting. */
export function useRunDetail(id: string) {
  const [d, setD] = useState<RunDetail | null>(null);
  const [err, setErr] = useState('');
  // Only the latest look lands: an older answer arriving late would show the run going back.
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    return api<RunDetail>(`/api/apps/runs/${enc(id)}`).then(
      (r) => {
        if (n !== seq.current) return;
        setD(r);
        setErr('');
      },
      (e) => {
        if (n === seq.current) setErr((e as Error).message);
      },
    );
  }, [id]);
  useEffect(() => {
    setD(null);
    setErr('');
    load();
  }, [load]);
  useRunEvents((run) => run.id === id && load());
  const busy = !!d && (isActive(d.run.status) || d.queued.length > 0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [busy, load]);
  return { d, err, load };
}

export const money = (n?: number | null) => (n == null ? '' : n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`);

export const SOURCE_LABEL: Record<AppRun['source'], string> = { web: 'From the form', test: 'Test run', api: 'From the API', mcp: 'From another agent', public: 'Public page', batch: 'Row', step: 'A step of another run', app: 'From another template', screen: 'From its screen', task: 'From a scheduled task', chat: 'A conversation on its screen' };
