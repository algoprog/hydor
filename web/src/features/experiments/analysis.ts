// What the Experiments pages work out from runs, with no React: the colours runs take on charts, how metrics fall
// into sections (dev, train, …), smoothing a curve, plotting one metric along another, the metrics that matter most
// across an experiment, the hyperparameters that differ between its runs, and how strongly each goes with a metric.
import { betterOf, type MetricSeries, type RunRecord } from '@shared/experiments';
import { metricScore, num, rankMetrics } from './api';

/** Runs drawn on the charts at once, at most: one colour each, in the charts' fixed order, never cycled. */
export const MAX_SHOWN = 8;
/** The colours runs take on charts, in order (the app's validated chart palette, light and dark: --viz-1…8). */
export const RUN_COLORS: string[] = Array.from({ length: MAX_SHOWN }, (_, i) => `var(--viz-${i + 1})`);

/** A run's key, unique across this computer's runs and other machines' (the same id can come from two). */
export const runKey = (r: Pick<RunRecord, 'id' | 'machine'>) => `${r.machine?.id ?? ''}:${r.id}`;

/**
 * A section of charts: the metrics that share a prefix the run gave them ("train/loss" and "train/acc" are "train";
 * "dev_nll" and "dev_bpb" are "dev"), the metrics that say how well it does without one ("Metrics"), and the rest
 * (learning rate, speed, memory, times, counts: "Other", folded at first when there are other sections).
 */
export interface MetricSection {
  /** "p:<prefix>", "metrics" or "other". */
  id: string;
  /** The prefix as the run wrote it ("dev", "train"), or the page's own word ("Metrics", "Other"). */
  label: string;
  /** label is the run's own word (shown with translate="no"). */
  own: boolean;
  /** Its metrics, the most telling first. */
  metrics: string[];
  /** Folded until opened, unless the person opened it before. */
  folded: boolean;
}
// The words that make a metric's first word its section (dev_nll, train-loss, eval.acc): single words, so they are not taken for text.
const HELD_OUT = new Set(['val', 'valid', 'validation', 'dev', 'eval', 'evaluation', 'test', 'heldout']);
const TRAINING = new Set(['train', 'training']);

export function sectionsOf(metrics: string[]): MetricSection[] {
  interface Bucket {
    id: string;
    label: string;
    word: 'held' | 'train' | null;
    first: number;
    metrics: string[];
  }
  const buckets = new Map<string, Bucket>();
  const plain: string[] = [];
  const names = [...new Set(metrics)];
  names.forEach((name, i) => {
    const slash = name.indexOf('/');
    let prefix = slash > 0 ? name.slice(0, slash) : '';
    if (!prefix) {
      const w = name.split(/[_\-. ]+/)[0];
      if (HELD_OUT.has(w.toLowerCase()) || TRAINING.has(w.toLowerCase())) prefix = w;
    }
    if (!prefix) return void plain.push(name);
    const low = prefix.toLowerCase();
    const word = HELD_OUT.has(low) ? 'held' : TRAINING.has(low) ? 'train' : null;
    const id = `p:${word ? low : prefix}`;
    const b = buckets.get(id) ?? { id, label: prefix, word, first: i, metrics: [] };
    b.metrics.push(name);
    buckets.set(id, b);
  });
  // A prefix of a single metric that is not one of the split words is no section of its own: the metric goes with the rest.
  for (const b of [...buckets.values()])
    if (!b.word && b.metrics.length < 2) {
      buckets.delete(b.id);
      plain.push(...b.metrics);
    }
  const rank = (list: string[]) => rankMetrics(list, () => true);
  const good = rank(plain.filter((m) => metricScore(m, true) >= 4));
  const rest = rank(plain.filter((m) => metricScore(m, true) < 4));
  const own = (b: Bucket): MetricSection => ({ id: b.id, label: b.label, own: true, metrics: rank(b.metrics), folded: false });
  const all = [...buckets.values()];
  const byFirst = (a: Bucket, b: Bucket) => a.first - b.first;
  const out: MetricSection[] = [
    ...all.filter((b) => b.word === 'held').sort(byFirst).map(own),
    ...all.filter((b) => b.word === 'train').sort(byFirst).map(own),
  ];
  if (good.length) out.push({ id: 'metrics', label: 'Metrics', own: false, metrics: good, folded: false });
  out.push(...all.filter((b) => !b.word).sort((a, b) => a.label.localeCompare(b.label)).map(own));
  if (rest.length) out.push({ id: 'other', label: 'Other', own: false, metrics: rest, folded: out.length > 0 });
  return out;
}

/** A curve smoothed as TensorBoard and W&B do (an exponential moving average, debiased at the start); NaN and ±∞ points stay gaps. weight 0 is the curve itself, 0.99 the smoothest. */
export function smooth(points: [number, number][], weight: number): [number, number][] {
  if (!(weight > 0)) return points;
  const w = Math.min(weight, 0.999);
  let last = 0;
  let k = 0;
  return points.map(([x, y]) => {
    if (!Number.isFinite(y)) return [x, y] as [number, number];
    last = last * w + (1 - w) * y;
    k++;
    return [x, last / (1 - w ** k)] as [number, number];
  });
}

/** A metric plotted along another one read at the same steps (dev_bpb along tokens): [x's value at that step, y]; points with no x at or before their step go. */
export function alongX(points: [number, number][], x: [number, number][]): [number, number][] {
  const xs = x.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])).sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [step, y] of points) {
    // The last x at or before this step (binary search).
    let lo = 0;
    let hi = xs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid][0] <= step) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) out.push([xs[lo - 1][1], y]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Whether a curve never goes down (steps, tokens seen, time): one that can be an x axis. */
export function increasing(points: [number, number][]): boolean {
  const p = points.filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])).sort((a, b) => a[0] - b[0]);
  if (p.length < 2 || points.some((q) => !Number.isFinite(q[1]))) return false;
  for (let i = 1; i < p.length; i++) if (p[i][1] < p[i - 1][1]) return false;
  return p[p.length - 1][1] > p[0][1];
}

/** The metrics that can be the x axis for these runs: curves of 2 points or more that never go down in any run that has them (tokens, elapsed_s, epoch…), the most common first. */
export function xChoices(series: (MetricSeries | undefined)[]): string[] {
  const seen = new Map<string, { runs: number; ok: boolean; first: number }>();
  for (const s of series)
    for (const [k, pts] of Object.entries(s ?? {})) {
      if (!Array.isArray(pts) || pts.length < 2) continue;
      const e = seen.get(k) ?? { runs: 0, ok: true, first: seen.size };
      e.runs++;
      if (!increasing(pts)) e.ok = false;
      seen.set(k, e);
    }
  return [...seen.entries()]
    .filter(([, e]) => e.ok)
    .sort((a, b) => b[1].runs - a[1].runs || a[1].first - b[1].first)
    .map(([k]) => k);
}

/** The y range for these values: their least and greatest (padded 8%); with ignoreOutliers the 5th to 95th percentile (padded 10%); on a log scale only values above 0 count. null when there is none. */
export function domainOf(values: number[], ignoreOutliers = false, log = false): [number, number] | null {
  const v = values.filter((x) => Number.isFinite(x) && (!log || x > 0)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (q: number) => {
    const p = q * (v.length - 1);
    const i = Math.floor(p);
    return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (p - i);
  };
  let lo = ignoreOutliers ? at(0.05) : v[0];
  let hi = ignoreOutliers ? at(0.95) : v[v.length - 1];
  const pad = ignoreOutliers ? 0.1 : 0.08;
  if (log) {
    let a = Math.log10(lo);
    let b = Math.log10(hi);
    const d = (b - a) * pad || 0.05;
    a -= d;
    b += d;
    return [10 ** a, 10 ** b];
  }
  const d = (hi - lo) * pad || Math.abs(hi) * 0.05 || 1;
  lo -= d;
  hi += d;
  return [lo, hi];
}

/** A run's value of a metric: its last (the default) or its best. */
export function valueOf(r: RunRecord, metric: string, which: 'last' | 'best' = 'last'): number | undefined {
  const v = which === 'best' ? (r.metrics?.best?.[metric] ?? r.metrics?.last?.[metric]) : r.metrics?.last?.[metric];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * The metrics that say most about an experiment's runs, the first `n`: the most telling by name (metricScore: quality
 * numbers, held-out ones first; curves over values printed once) among those at least half of the runs have (or two
 * runs, when fewer), never bookkeeping (a score below 2).
 */
export function keyMetricsOf(runs: RunRecord[], n = 4): string[] {
  const seen = new Map<string, { count: number; repeated: boolean; first: number }>();
  for (const r of runs) {
    const rep = new Set(r.metrics?.repeated ?? []);
    for (const k of Object.keys(r.metrics?.last ?? {})) {
      const e = seen.get(k) ?? { count: 0, repeated: false, first: seen.size };
      e.count++;
      if (rep.has(k)) e.repeated = true;
      seen.set(k, e);
    }
  }
  const need = runs.length >= 2 ? Math.max(2, Math.ceil(runs.length / 2)) : 1;
  return [...seen.entries()]
    .map(([k, e]) => ({ k, e, score: metricScore(k, e.repeated) }))
    .filter((x) => x.score >= 2 && x.e.count >= need)
    .sort((a, b) => b.score - a.score || b.e.count - a.e.count || a.e.first - b.e.first)
    .slice(0, n)
    .map((x) => x.k);
}

/**
 * The metrics a runs table shows at first, the first `n`: as keyMetricsOf, but any that two runs have (an experiment
 * that mixes training and evaluation runs has metrics of each kind), and a copy kept as the best or the final one
 * (best_dev_nll, dev_nll_best) left out when the metric itself is there.
 */
export function tableMetricsOf(runs: RunRecord[], n = 4): string[] {
  const seen = new Map<string, { count: number; repeated: boolean; first: number }>();
  for (const r of runs) {
    const rep = new Set(r.metrics?.repeated ?? []);
    for (const k of Object.keys(r.metrics?.last ?? {})) {
      const e = seen.get(k) ?? { count: 0, repeated: false, first: seen.size };
      e.count++;
      if (rep.has(k)) e.repeated = true;
      seen.set(k, e);
    }
  }
  const need = Math.min(2, runs.length);
  const ok = [...seen.entries()].map(([k, e]) => ({ k, e, score: metricScore(k, e.repeated) })).filter((x) => x.score >= 2 && x.e.count >= need);
  const names = new Set(ok.map((x) => x.k));
  const copy = (k: string) => {
    const m = /^(?:best|final|min|max)[_\-.](.+)$/i.exec(k) ?? /^(.+)[_\-.](?:best|final)$/i.exec(k);
    return !!m && names.has(m[1]);
  };
  const sorted = ok.filter((x) => !copy(x.k)).sort((a, b) => b.score - a.score || b.e.count - a.e.count || a.e.first - b.e.first);
  // After the first two, a metric that runs not yet covered have comes before one that only repeats them: training and
  // evaluation runs of one experiment each get their numbers in the table.
  const out: string[] = [];
  const covered = new Set<string>();
  const holders = (k: string) => runs.filter((r) => r.metrics?.last?.[k] !== undefined).map(runKey);
  for (const x of sorted) {
    if (out.length >= n) break;
    const ids = holders(x.k);
    if (out.length < 2 || ids.some((id) => !covered.has(id))) {
      out.push(x.k);
      for (const id of ids) covered.add(id);
    }
  }
  for (const x of sorted) if (out.length < n && !out.includes(x.k)) out.push(x.k);
  return out;
}

/** The hyperparameters a runs table shows at first: those that differ, the ones most runs have first (then in their own order), at most `n`. */
export function tableParamsOf(runs: RunRecord[], n = 6): string[] {
  const ps = runs.map(paramsOf);
  const have = (k: string) => ps.filter((p) => p[k] !== undefined).length;
  return differingParams(runs)
    .map((k, i) => ({ k, i, c: have(k) }))
    .filter((x) => x.c >= Math.min(2, runs.length))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .slice(0, n)
    .map((x) => x.k);
}

/** The one metric that says most about an experiment: its first key metric, else the first a runs table would show (any two runs have it). */
export function keyMetricOf(runs: RunRecord[]): string | undefined {
  return keyMetricsOf(runs, 1)[0] ?? tableMetricsOf(runs, 1)[0];
}

/** The run with the best value of a metric (betterOf its name, or what the run said), of those that have it. */
export function bestRun(runs: RunRecord[], metric: string, which: 'last' | 'best' = 'last'): RunRecord | undefined {
  const dir = betterOf(metric, runs.find((r) => r.better?.[metric])?.better);
  let best: RunRecord | undefined;
  let bv = 0;
  for (const r of runs) {
    const v = valueOf(r, metric, which);
    if (v === undefined) continue;
    if (!best || (dir === 'max' ? v > bv : v < bv)) {
      best = r;
      bv = v;
    }
  }
  return best;
}

/** A run's hyperparameters: its params, and its seed as "seed" when it has one. */
export function paramsOf(r: RunRecord): Record<string, string | number | boolean> {
  return { ...(r.params ?? {}), ...(r.seed !== undefined ? { seed: r.seed } : {}) };
}

/** Names of hyperparameters that only say where a run writes or what it is called (out, output_dir, run_name…): never shown by default. */
export const OUTPUT_PARAM = /^(out|output|outdir|out_dir|output_dir|save_dir|save_path|logdir|log_dir|checkpoint_dir|ckpt_dir|run_name|name|exp_name|wandb_name|wandb_project)$/i;

/** Every hyperparameter the runs have, in the order they first come (the newest run's order first). */
export function allParams(runs: RunRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of [...runs].sort((a, b) => b.createdAt - a.createdAt)) for (const k of Object.keys(paramsOf(r))) seen.add(k);
  return [...seen];
}

/** The hyperparameters whose values differ between the runs (a run without one counts as its own value), output names (OUTPUT_PARAM) left out. */
export function differingParams(runs: RunRecord[]): string[] {
  if (runs.length < 2) return [];
  const ps = runs.map(paramsOf);
  return allParams(runs).filter((k) => !OUTPUT_PARAM.test(k) && new Set(ps.map((p) => paramText(p[k]))).size > 1);
}

/** A hyperparameter's value as text: numbers as num() says them, true and false, strings as they are; "–" for none. */
export function paramText(v: unknown): string {
  if (v === undefined || v === null) return '–';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

/** Spearman's rank correlation of two lists of numbers (ties get their mean rank); null under 3 pairs or when either does not vary. */
export function spearman(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const ranks = (v: number[]) => {
    const idx = v.map((x, i) => i).sort((a, b) => v[a] - v[b]);
    const r = new Array<number>(v.length);
    for (let i = 0; i < idx.length; ) {
      let j = i;
      while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
      for (let k = i; k <= j; k++) r[idx[k]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const a = ranks(xs.slice(0, n));
  const b = ranks(ys.slice(0, n));
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i] - ma) * (b[i] - mb);
    saa += (a[i] - ma) ** 2;
    sbb += (b[i] - mb) ** 2;
  }
  if (!(saa > 0) || !(sbb > 0)) return null;
  return Math.max(-1, Math.min(1, sab / Math.sqrt(saa * sbb)));
}

/** The correlation ratio (η, 0 to 1) of a metric over the values of a setting that is not a number; null under 3 runs or one value only. */
export function corrRatio(cats: string[], ys: number[]): number | null {
  const n = Math.min(cats.length, ys.length);
  if (n < 3) return null;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < n; i++) groups.set(cats[i], [...(groups.get(cats[i]) ?? []), ys[i]]);
  if (groups.size < 2) return null;
  const mean = ys.slice(0, n).reduce((s, y) => s + y, 0) / n;
  let total = 0;
  let between = 0;
  for (let i = 0; i < n; i++) total += (ys[i] - mean) ** 2;
  for (const g of groups.values()) between += g.length * (g.reduce((s, y) => s + y, 0) / g.length - mean) ** 2;
  if (!(total > 0)) return null;
  return Math.sqrt(Math.min(1, between / total));
}

/** How strongly a hyperparameter goes with a metric across runs. */
export interface Importance {
  param: string;
  /** num: Spearman's ρ (signed, -1 to 1); cat: the correlation ratio η (0 to 1). */
  kind: 'num' | 'cat';
  /** |ρ| or η, for ordering: the strongest first. */
  score: number;
  /** For num: ρ itself. */
  rho?: number;
  /** For cat: the value whose runs did best on average. */
  bestValue?: string;
  /** For num: whether higher values go with a better metric (taking which way is better into account). */
  higherIsBetter?: boolean;
  /** Runs it was worked out from. */
  n: number;
}
/** For each hyperparameter, how strongly it goes with the metric over the runs that have both (numbers by rank, other values by η), the strongest first; those that cannot be worked out are left out. */
export function importanceOf(runs: RunRecord[], params: string[], metric: string, which: 'last' | 'best' = 'last'): Importance[] {
  const dir = betterOf(metric, runs.find((r) => r.better?.[metric])?.better);
  const out: Importance[] = [];
  for (const param of params) {
    const pairs: { v: unknown; y: number }[] = [];
    for (const r of runs) {
      const v = paramsOf(r)[param];
      const y = valueOf(r, metric, which);
      if (v !== undefined && v !== null && y !== undefined) pairs.push({ v, y });
    }
    if (pairs.length < 3 || new Set(pairs.map((p) => paramText(p.v))).size < 2) continue;
    const ys = pairs.map((p) => p.y);
    const numeric = pairs.every((p) => typeof p.v === 'number' ? Number.isFinite(p.v) : typeof p.v === 'string' && p.v.trim() !== '' && Number.isFinite(Number(p.v)));
    if (numeric) {
      const rho = spearman(pairs.map((p) => Number(p.v)), ys);
      if (rho === null) continue;
      out.push({ param, kind: 'num', score: Math.abs(rho), rho, higherIsBetter: rho > 0 === (dir === 'max'), n: pairs.length });
    } else {
      const cats = pairs.map((p) => paramText(p.v));
      const eta = corrRatio(cats, ys);
      if (eta === null) continue;
      const mean = new Map<string, { sum: number; n: number }>();
      cats.forEach((c, i) => {
        const e = mean.get(c) ?? { sum: 0, n: 0 };
        e.sum += ys[i];
        e.n++;
        mean.set(c, e);
      });
      let bestValue: string | undefined;
      let bm = 0;
      for (const [c, e] of mean) {
        const m = e.sum / e.n;
        if (bestValue === undefined || (dir === 'max' ? m > bm : m < bm)) {
          bestValue = c;
          bm = m;
        }
      }
      out.push({ param, kind: 'cat', score: eta, bestValue, n: pairs.length });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The queue's order: running first (the latest start first), then waiting (higher priority, then the oldest first), then ended (the latest end first). */
export function queueOrder(runs: RunRecord[]): RunRecord[] {
  const tier = (r: RunRecord) => (r.status === 'running' || r.status === 'starting' ? 0 : r.status === 'queued' || r.status === 'waiting' ? 1 : 2);
  const t = (r: RunRecord) => (tier(r) === 0 ? -(r.startedAt ?? r.createdAt) : tier(r) === 1 ? r.createdAt : -(r.endedAt ?? r.createdAt));
  return [...runs].sort((a, b) => tier(a) - tier(b) || (tier(a) === 1 ? (b.priority ?? 0) - (a.priority ?? 0) : 0) || t(a) - t(b));
}

/** How long a run took (ended), or has taken so far (running); null while it waits. */
export function runtimeOf(r: RunRecord, now = Date.now()): number | null {
  if (!r.startedAt) return null;
  return (r.endedAt ?? now) - r.startedAt;
}
