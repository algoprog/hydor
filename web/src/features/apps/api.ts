// Apps in the pages: what the server sends, where each page lives, and live news of runs.
import { useEffect, useRef } from 'react';
import type { AppBatch, AppDef, AppRecipe, AppRun, AppTemplate, RunProgress } from '@shared/apps';
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
}

export type RunRecipe = Pick<AppRecipe, 'name' | 'icon' | 'color' | 'fields' | 'answer' | 'agent' | 'acpAgent' | 'model'>;

export interface RunDetail {
  run: AppRun;
  progress: RunProgress;
  recipe: RunRecipe;
  /** The app's address, while it exists. */
  slug: string | null;
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

export const money = (n?: number | null) => (n == null ? '' : n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n < 10 ? n.toFixed(2) : n.toFixed(0)}`);

export const SOURCE_LABEL: Record<AppRun['source'], string> = { web: 'From the form', test: 'Test run', api: 'From the API', mcp: 'From another agent', public: 'Public page', batch: 'Row' };
