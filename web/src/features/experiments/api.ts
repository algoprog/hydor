// What the Experiments page reads and how it says it: runs (this machine's, and every connected machine's), the
// queue now, a run's status in words (what a waiting run waits for, how long an ended one took, how far a running
// one is), which metrics matter most and so come first, durations, metrics in a line, and the run's address. Changes
// come through the app's socket ({ t: 'feature', id: 'experiments' }): the page reloads what changed.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExperimentGroup, ExperimentsSettings, MetricSeries, QueueNow, RunRecord, RunStatus } from '@shared/experiments';
import { api, enc } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';

export type { RunRecord };

/** A run's page's tabs, and an experiment's. */
export type RunTab = 'overview' | 'charts' | 'log';
export type ExperimentTab = 'runs' | 'charts' | 'params';

/** A run's page: /system/experiments/<id>, with ?m=<machine> for a run kept on another machine, and &tab= for a tab other than Overview. */
export const runPath = (r: Pick<RunRecord, 'id' | 'machine'>, tab?: RunTab) => {
  const q = new URLSearchParams();
  if (r.machine) q.set('m', r.machine.id);
  if (tab && tab !== 'overview') q.set('tab', tab);
  const s = q.toString();
  return `/system/experiments/${enc(r.id)}${s ? `?${s}` : ''}`;
};

/** An experiment's page: /system/experiments?e=<group> ('' for the runs without one), with &tab= for a tab other than Runs. */
export const experimentPath = (group: string, tab?: ExperimentTab) => `/system/experiments?e=${enc(group)}${tab && tab !== 'runs' ? `&tab=${tab}` : ''}`;

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

/** What a waiting run waits for: a GPU, a slot (a run without a GPU ends first), the cluster's queue, or something else. */
export type WaitKind = 'gpu' | 'slot' | 'cluster' | 'other';
export function waitKind(r: Pick<RunRecord, 'why' | 'clusterJob'>): WaitKind {
  const why = r.why ?? '';
  // The server's words for each (queue.ts, gpus.ts), as patterns so they are not taken for the page's own words.
  if (r.clusterJob || /^In the cluster/.test(why)) return 'cluster';
  if (/^Waiting for one of your runs without a GPU/.test(why)) return 'slot';
  if (/^Waiting for (1 GPU|\d+ GPUs)/.test(why) || /nvidia-smi/.test(why)) return 'gpu';
  return 'other';
}

/** A run's status in a few words: "Running 2 h 13 min", "Waiting for a GPU", "Done", "Failed". */
export function statusWords(r: RunRecord, now = Date.now()): string {
  switch (r.status) {
    case 'queued':
      return 'In line';
    case 'waiting': {
      const k = waitKind(r);
      return k === 'gpu' ? 'Waiting for a GPU' : k === 'slot' ? 'Waiting for a run to end' : k === 'cluster' ? 'In the cluster’s queue' : 'Waiting';
    }
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

/** An ended run's status with how long it took ("Done after 1 h 47 min", "Failed after 12 s"); else statusWords. */
export function endedWords(r: RunRecord, now = Date.now()): string {
  if (isActive(r) || !r.startedAt || !r.endedAt) return statusWords(r, now);
  const ms = Math.max(0, r.endedAt - r.startedAt);
  return `${statusWords(r, now)} after ${ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : took(ms)}`;
}

/** How far a running run is (a whole percent) and, when it has gone long enough to tell, how long is left (ms). */
export function progressOf(r: RunRecord): { pct: number; left?: number } | null {
  const p = r.metrics?.progress;
  if (r.status !== 'running' || !p || !(p.done > 0) || !(p.done < p.total)) return null;
  const elapsed = p.at - (r.startedAt ?? p.at);
  const left = elapsed >= 60_000 && p.done / p.total >= 0.01 ? (elapsed * (p.total - p.done)) / p.done : undefined;
  return { pct: Math.round((p.done / p.total) * 100), left };
}

/** "about 41 min left", "less than a minute left". */
export const leftWords = (ms: number) => (ms < 60_000 ? 'less than a minute left' : `about ${took(ms)} left`);

/** The GPUs a run holds in words: "GPU 0", "GPUs 0–3" (three or more in a row), "GPUs 0, 2". */
export function gpuWords(ids: number[]): string {
  const s = [...new Set(ids)].sort((a, b) => a - b);
  if (s.length === 1) return `GPU ${s[0]}`;
  const parts: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    if (j - i >= 2) parts.push(`${s[i]}–${s[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(s[k]));
    i = j + 1;
  }
  return `GPUs ${parts.join(', ')}`;
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

// How much a metric matters, by the words in its name: a quality number (loss, accuracy, F1…) most, a rate or a
// learning rate less, bookkeeping (sizes, counts, times, steps) least. One that was read many times (a curve) gets more.
// As arrays of single words: a string of several words would be taken for the page's own text (i18n:extract).
const WORDS = (list: string[]) => new Set(list);
const QUALITY = WORDS([
  'loss', 'acc', 'accuracy', 'f1', 'bleu', 'rouge', 'rouge1', 'rouge2', 'rougel', 'chrf', 'meteor', 'ndcg', 'mrr',
  'map', 'recall', 'precision', 'prec', 'auc', 'auroc', 'ppl', 'perplexity', 'bpb', 'bpc', 'nll', 'll', 'wer',
  'cer', 'em', 'exact', 'score', 'reward', 'return', 'win', 'ksr', 'top1', 'top5', 'error', 'err', 'mse', 'mae',
  'rmse', 'iou', 'dice', 'psnr', 'ssim', 'fid', 'kl', 'agreement', 'correct', 'hit', 'hits', 'success', 'pass',
]);
const HELD_OUT = WORDS(['val', 'valid', 'validation', 'dev', 'eval', 'test', 'heldout']);
const RATE = WORDS(['lr', 'learning', 'grad', 'norm', 'throughput', 'mem', 'memory']);
const BOOKKEEPING = WORDS([
  'elapsed', 'time', 'seconds', 'secs', 'sec', 'duration', 'eta', 'epoch', 'n', 'num', 'count', 'total', 'size',
  'params', 'tokens', 'bytes', 'positions', 'examples', 'words', 'seqs', 'batch', 'accum', 'world', 'rank', 'steps',
  'step',
]);
const PER_SECOND = /per[^a-z]?(s|sec|secs|second|seconds)($|[^a-z])|\/s($|[^a-z])|_s_/;

export function metricScore(name: string, repeated: boolean): number {
  const low = name.toLowerCase();
  // Words with their digits (f1, top5, rouge2); "acc@1" and "ksr@0.1" are acc and ksr.
  const words = low.split(/[^a-z0-9]+/).filter(Boolean);
  const has = (set: Set<string>) => words.some((w) => set.has(w));
  let score = repeated ? 2 : 0;
  if (has(QUALITY)) score += 4 + (has(HELD_OUT) ? 1 : 0);
  else if (has(RATE) || PER_SECOND.test(low)) score -= 2;
  else if (has(BOOKKEEPING)) score -= 5;
  return score;
}

/** The names, the ones that matter most first (the order they came in otherwise). */
export function rankMetrics(names: string[], repeated: (k: string) => boolean): string[] {
  return names
    .map((k, i) => ({ k, i, s: metricScore(k, repeated(k)) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.k);
}

/**
 * Numbers a run printed once, as a list: those that say how well it did first (its results), the rest in the order
 * it printed them (settings read best as the run listed them).
 */
export function rankValues(names: string[]): string[] {
  return rankMetrics(names, () => false).filter((k) => metricScore(k, false) >= 4).concat(names.filter((k) => metricScore(k, false) < 4));
}

/** The run's metrics worth a glance (a curve or a quality number), the first `n` by how much they matter. */
export function keyMetrics(r: RunRecord, n = 2): string[] {
  const m = r.metrics;
  if (!m) return [];
  const rep = new Set(m.repeated ?? []);
  return rankMetrics(Object.keys(m.last ?? {}), (k) => rep.has(k))
    .filter((k) => metricScore(k, rep.has(k)) >= 2)
    .slice(0, n);
}

/** The run's key metrics in a line: "train_loss 4.18 · val_acc 0.91". */
export function metricsLine(r: RunRecord, n = 2): string {
  const last = r.metrics?.last ?? {};
  return keyMetrics(r, n)
    .map((k) => `${k} ${num(last[k])}`)
    .join(' · ');
}

/** Every metric the runs have, in the order they first come. */
export function metricsOf(runs: RunRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of runs) for (const k of Object.keys(r.metrics?.last ?? {})) seen.add(k);
  return [...seen];
}

/**
 * The runs, this machine's and (with `everywhere`) every connected machine's. A change here reloads this machine's
 * own (a burst of them, once); the other machines' are asked again every 20 seconds.
 */
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
  const loadOwn = useCallback(() => {
    api<{ runs: RunRecord[] }>('/api/experiments/runs?limit=500')
      .then((r) => setRuns((prev) => [...r.runs, ...(prev ?? []).filter((x) => x.machine)].sort((a, b) => b.createdAt - a.createdAt)))
      .catch(() => {});
  }, []);
  useEffect(load, [load]);
  useFeatureEvent('experiments', () => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      loadOwn();
    }, 400);
  });
  // Other machines' runs and the times in the rows: a slower look as well.
  useEffect(() => {
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { runs, reload: load, error };
}

/** The queue now (running, waiting, this computer's GPUs), looked at every five seconds while shown. */
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

/** How long a failed read of a run's series waits before it is tried again. */
const RETRY_MS = 15_000;

/** A run's key, unique across this computer's runs and other machines' (the same id can come from two). */
const keyOf = (r: Pick<RunRecord, 'id' | 'machine'>) => `${r.machine?.id ?? ''}:${r.id}`;

/**
 * The metrics over steps of these runs, by runKey: this computer's in one call (GET /api/experiments/series), each
 * other machine's run through its machine; undefined while a run's load. What was read is kept across renders, and
 * only what is missing is asked for (a read that failed is not kept: it is tried again after 15 seconds). Runs still
 * going are read again every 10 seconds, a change to one (the app's socket) reads it again, and a run that has just
 * ended is read once more for its last points.
 */
export function useSeries(runs: RunRecord[]): Record<string, MetricSeries | undefined> {
  const cache = useRef(new Map<string, MetricSeries>());
  const inFlight = useRef(new Set<string>());
  // When a read of a run failed (it is not asked for again within 15 seconds), and the runs to read again once the read now going ends.
  const failedAt = useRef(new Map<string, number>());
  const again = useRef(new Map<string, RunRecord>());
  const [version, setVersion] = useState(0);
  const latest = useRef(runs);
  latest.current = runs;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback((rs: RunRecord[], last = false) => {
    // `last`: the run has ended; one read still going may have missed its last points, so it is read again after.
    if (last) for (const r of rs) if (inFlight.current.has(keyOf(r))) again.current.set(keyOf(r), r);
    const todo = rs.filter((r) => !inFlight.current.has(keyOf(r)));
    if (!todo.length) return;
    for (const r of todo) inFlight.current.add(keyOf(r));
    const done = (r: RunRecord, s: MetricSeries | undefined) => {
      inFlight.current.delete(keyOf(r));
      if (!alive.current) return;
      // A read that failed is not kept: the run stays unread (or keeps what it had) and is tried again after 15 seconds.
      if (s) {
        cache.current.set(keyOf(r), s);
        failedAt.current.delete(keyOf(r));
      } else failedAt.current.set(keyOf(r), Date.now());
      setVersion((v) => v + 1);
      const next = again.current.get(keyOf(r));
      if (next) {
        again.current.delete(keyOf(r));
        read([next]);
      }
    };
    const own = todo.filter((r) => !r.machine);
    for (let i = 0; i < own.length; i += 100) {
      const chunk = own.slice(i, i + 100);
      api<{ series: Record<string, MetricSeries> }>(`/api/experiments/series?runs=${chunk.map((r) => enc(r.id)).join(',')}`)
        .then((x) => chunk.forEach((r) => done(r, x.series?.[r.id] ?? {})))
        .catch(() => chunk.forEach((r) => done(r, undefined)));
    }
    for (const r of todo.filter((x) => x.machine)) {
      api<{ series?: MetricSeries }>(`/api/experiments/runs/${enc(r.id)}?lines=0`, { base: baseOf(r.machine!.id) })
        .then((x) => done(r, x.series ?? {}))
        .catch(() => done(r, undefined));
    }
  }, []);

  const sig = runs.map(keyOf).join('|');
  const unread = () => latest.current.filter((r) => !cache.current.has(keyOf(r)) && Date.now() - (failedAt.current.get(keyOf(r)) ?? 0) >= RETRY_MS);
  useEffect(() => {
    read(unread());
  }, [sig, read]); // eslint-disable-line react-hooks/exhaustive-deps
  // Reads that failed: again after 15 seconds (looked at every 5).
  useEffect(() => {
    const t = window.setInterval(() => read(unread()), 5000);
    return () => window.clearInterval(t);
  }, [read]); // eslint-disable-line react-hooks/exhaustive-deps
  // A run that was going and has ended: its last points, once.
  const wasActive = useRef(new Map<string, boolean>());
  const activeSig = runs.map((r) => keyOf(r) + (isActive(r) ? '+' : '-')).join('|');
  useEffect(() => {
    const ended = latest.current.filter((r) => wasActive.current.get(keyOf(r)) === true && !isActive(r));
    wasActive.current = new Map(latest.current.map((r) => [keyOf(r), isActive(r)]));
    if (ended.length) read(ended, true);
  }, [activeSig, read]);
  // Runs going: again every 10 seconds.
  useEffect(() => {
    const t = window.setInterval(() => read(latest.current.filter(isActive)), 10_000);
    return () => window.clearInterval(t);
  }, [read]);
  // The server says which runs changed: those that are shown are read again, once in a second.
  const changed = useRef(new Set<string>());
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  useFeatureEvent('experiments', (e) => {
    const ids = (e.data as { runs?: unknown } | null)?.runs;
    if (!Array.isArray(ids)) return;
    for (const id of ids) if (typeof id === 'string') changed.current.add(id);
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      const set = changed.current;
      changed.current = new Set();
      read(latest.current.filter((r) => set.has(r.id) && !r.machine));
    }, 1000);
  });

  return useMemo(() => {
    const o: Record<string, MetricSeries | undefined> = {};
    for (const r of runs) {
      const s = cache.current.get(keyOf(r));
      if (s) o[keyOf(r)] = s;
    }
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, version]);
}

/** The experiments' titles, descriptions and categories, by group (GET /api/experiments/groups), read again when they change. */
export function useGroups(): { groups: Map<string, ExperimentGroup>; reload: () => void } {
  const [groups, setGroups] = useState<Map<string, ExperimentGroup>>(() => new Map());
  const alive = useRef(true);
  const load = useCallback(() => {
    api<{ groups: ExperimentGroup[] }>('/api/experiments/groups')
      .then((r) => alive.current && setGroups(new Map(r.groups.map((g) => [g.name, g]))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    alive.current = true;
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  useFeatureEvent('experiments', () => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      load();
    }, 2000);
  });
  return { groups, reload: load };
}
