// What the Experiments page reads and how it says it: runs (this machine's, and every connected machine's), the
// queue now, a run's status in words, durations, metrics in a line, and the run's address. Changes come through the
// app's socket ({ t: 'feature', id: 'experiments' }): the page reloads what changed.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExperimentsSettings, QueueNow, RunRecord, RunStatus } from '@shared/experiments';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';

export type { RunRecord };

/** A run's page: /system/experiments/<id>, with ?m=<machine> for a run kept on another machine. */
export const runPath = (r: Pick<RunRecord, 'id' | 'machine'>) => `/system/experiments/${enc(r.id)}${r.machine ? `?m=${enc(r.machine.id)}` : ''}`;

/** Where a run's own calls go: this machine, or the machine it is kept on. */
export const baseOf = (machine?: string | null) => (machine ? `/m/${machine}` : undefined);

export const ACTIVE_STATUSES: RunStatus[] = ['queued', 'waiting', 'starting', 'running'];
export const isActive = (r: Pick<RunRecord, 'status'>) => ACTIVE_STATUSES.includes(r.status);

/** "2 h 13 min", "4 min", "under a minute". */
export function took(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'under a minute';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} days ${h % 24} h`;
}

/** A run's status in a few words: "Running 2 h 13 min", "Waiting for a GPU", "Done", "Failed". */
export function statusWords(r: RunRecord, now = Date.now()): string {
  switch (r.status) {
    case 'queued':
      return 'In line';
    case 'waiting':
      return /GPU/.test(r.why ?? '') && !r.clusterJob ? 'Waiting for a GPU' : r.clusterJob ? 'In the cluster’s queue' : 'Waiting';
    case 'starting':
      return 'Starting';
    case 'running':
      return r.stopping ? 'Stopping' : `Running ${r.startedAt ? took(now - r.startedAt) : ''}`.trim();
    case 'done':
      return 'Done';
    case 'failed':
      return 'Failed';
    case 'stopped':
      return r.why?.startsWith('Stopped early') ? 'Stopped early' : 'Stopped';
    case 'lost':
      return 'Lost';
  }
}

/** The status dot's colour. */
export function statusTone(s: RunStatus): string {
  return s === 'running' || s === 'starting' ? 'bg-accent' : s === 'done' ? 'bg-ok' : s === 'failed' || s === 'lost' ? 'bg-err' : s === 'waiting' || s === 'queued' ? 'bg-warn' : 'bg-fg-3';
}

/** A number as a metric reads: a few significant digits, very large or small ones in e-notation. */
export function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return '–';
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(a >= 100 ? 5 : 4)));
}

/** The run's key metrics in a line: "loss 0.42 · acc 0.91". */
export function metricsLine(r: RunRecord, n = 3): string {
  const last = r.metrics?.last ?? {};
  return Object.keys(last)
    .slice(0, n)
    .map((k) => `${k} ${num(last[k])}`)
    .join(' · ');
}

/** Every metric the runs have, in the order they first come. */
export function metricsOf(runs: RunRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of runs) for (const k of Object.keys(r.metrics?.last ?? {})) seen.add(k);
  return [...seen];
}

/** The runs, this machine's and (with `everywhere`) every connected machine's, reloaded as they change. */
export function useRuns(everywhere = true): { runs: RunRecord[] | null; reload: () => void; error: string | null } {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const load = useCallback(() => {
    api<{ runs: RunRecord[] }>(`/api/experiments/runs?limit=500${everywhere ? '&everywhere=1' : ''}`)
      .then((r) => {
        setRuns(r.runs);
        setError(null);
      })
      .catch((e) => setError((e as Error).message));
  }, [everywhere]);
  useEffect(load, [load]);
  // A burst of changes is one reload.
  useFeatureEvent('experiments', () => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      load();
    }, 400);
  });
  // Other machines' runs and the times in the rows: a slower look as well.
  useEffect(() => {
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { runs, reload: load, error };
}

/** The queue now (running, waiting, this computer's GPUs), looked at every few seconds while shown. */
export function useQueue(): QueueNow | null {
  const [q, setQ] = useState<QueueNow | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<QueueNow>('/api/experiments/queue')
        .then((x) => alive && setQ(x))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 5000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  useFeatureEvent('experiments', () => {
    api<QueueNow>('/api/experiments/queue')
      .then(setQ)
      .catch(() => {});
  });
  return q;
}

export const loadSettings = () => api<ExperimentsSettings>('/api/experiments/settings');

/** Copies text, and says so. */
export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Saves text as a file the browser downloads. */
export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** The colours of series on a chart, in order: the app's own, as the page kit's --n-c1…6 are. */
export const VIZ = ['var(--viz-1)', 'var(--viz-2)', 'var(--ok)', 'var(--codex)', 'var(--warn)', 'var(--claude)'];
