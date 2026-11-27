// Metrics, read from a run's log as it grows (and from the metrics file it writes): key=value pairs (Lightning's
// progress bars, most hand-written loops), JSON objects on a line and Python's printed dicts (Hugging Face's
// Trainer), and Keras' "loss: 0.41 - accuracy: 0.87". For each metric the last value, the best (lower is better for
// losses, errors, perplexity… by name, else higher, unless the job says), the step, and a series thinned to a few
// hundred points for the charts. Also what the agent on call watches for in the text: NaN and out of memory.
import fs from 'node:fs';
import { betterOf, type MetricSeries, type RunMetrics, type RunProgress } from '../../shared/experiments.ts';

/** Points kept per metric for the charts: past twice this, every other older point goes. */
const KEEP = 300;
/** At most this many metrics per run (a log full of numbers stops adding new ones). */
export const MAX_METRICS = 100;
/** Longer lines are not read for metrics (a dumped tensor, a base64 blob). */
const MAX_LINE = 10_000;
/** Metrics not kept, and how often each was read: at most this many are remembered (the oldest go first). */
const MAX_PENDING = 2000;
/** Keys that say how many steps the run will take; one of them in a line is the run's plan. */
const PLAN_KEYS = new Set(['total_steps', 'max_steps', 'num_training_steps', 'num_train_steps', 'train_steps', 'plan_steps', 'steps_total', 'num_steps', 'n_steps', 'total_iters', 'max_iters', 'num_iters', 'total_iterations', 'max_iterations']);

/** Keys that say where the run is, not how it does; the first found is the step. */
const STEP_KEYS = ['step', 'global_step', 'iter', 'iteration', 'it', 'trainer/global_step', 'epoch'];
/** Numbers that are settings or bookkeeping, not metrics. */
const NOT_METRIC = new Set(['seed', 'rank', 'local_rank', 'world_size', 'pid', 'port', 'v_num', 'num_workers', 'workers', 'gpu', 'gpus', 'device', 'batch', 'batch_idx', 'total', 'n', 'i', 'id']);

export interface Reading {
  values: Record<string, number>;
  step?: number;
  /** An explicit "N of T" in the line (a progress bar of the training, "step 120/1000"). */
  progress?: { done: number; total: number };
  /** A total number of steps the run says it will take. */
  plan?: number;
}

// ---- reading a line ------------------------------------------------------------------------------------------

/** A small parser for an object as JSON or as Python prints a dict ('single quotes', True, None, nan, inf). */
class Loose {
  i = 0;
  constructor(private s: string) {}
  private ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  value(depth = 0): unknown {
    if (depth > 6) throw new Error('deep');
    this.ws();
    const c = this.s[this.i];
    if (c === '{') return this.object(depth);
    if (c === '[' || c === '(') return this.array(depth);
    if (c === '"' || c === "'") return this.string();
    const m = /^(?:[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?|[-+]?(?:nan|NaN|inf|Infinity|infinity)|true|false|True|False|null|None)/.exec(this.s.slice(this.i, this.i + 40));
    if (!m) {
      // tensor(0.5), np.float64(0.5), Decimal('1.5'): the number inside.
      const call = /^[A-Za-z_][\w.]*\(\s*/.exec(this.s.slice(this.i, this.i + 60));
      if (!call) throw new Error('value');
      this.i += call[0].length;
      const v = this.value(depth + 1);
      while (this.i < this.s.length && this.s[this.i] !== ')') this.i++;
      this.i++;
      return v;
    }
    this.i += m[0].length;
    const t = m[0];
    if (/^(true|True)$/.test(t)) return true;
    if (/^(false|False)$/.test(t)) return false;
    if (/^(null|None)$/.test(t)) return null;
    if (/nan/i.test(t)) return NaN;
    if (/inf/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity;
    return Number(t);
  }
  private string(): string {
    const q = this.s[this.i++];
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== q) {
      if (this.s[this.i] === '\\') this.i++;
      out += this.s[this.i++] ?? '';
    }
    this.i++;
    return out;
  }
  private object(depth: number): Record<string, unknown> {
    this.i++;
    const out: Record<string, unknown> = {};
    for (;;) {
      this.ws();
      if (this.s[this.i] === '}') return (this.i++, out);
      const c = this.s[this.i];
      let key: string;
      if (c === '"' || c === "'") key = this.string();
      else {
        const m = /^[A-Za-z_][\w./@-]*/.exec(this.s.slice(this.i));
        if (!m) throw new Error('key');
        key = m[0];
        this.i += key.length;
      }
      this.ws();
      if (this.s[this.i] !== ':') throw new Error(':');
      this.i++;
      out[key] = this.value(depth + 1);
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== '}') throw new Error('}');
    }
  }
  private array(depth: number): unknown[] {
    const close = this.s[this.i] === '(' ? ')' : ']';
    this.i++;
    const out: unknown[] = [];
    for (;;) {
      this.ws();
      if (this.s[this.i] === close) return (this.i++, out);
      out.push(this.value(depth + 1));
      this.ws();
      if (this.s[this.i] === ',') this.i++;
      else if (this.s[this.i] !== close) throw new Error(close);
    }
  }
}

/** An object written as JSON or as Python prints a dict, read leniently; null when it is not one. */
export function looseObject(text: string): Record<string, unknown> | null {
  try {
    const v = new Loose(text.trim()).value();
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The numbers of an object, nested ones as "outer/inner". */
function flatten(o: Record<string, unknown>, prefix = '', out: Record<string, number> = {}): Record<string, number> {
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}/${k}` : k;
    if (typeof v === 'number') out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Record<string, unknown>, key, out);
  }
  return out;
}

const NUM = String.raw`[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?|[-+]?(?:nan|inf(?:inity)?)`;
const KEY = String.raw`[A-Za-z_][\w./@-]*`;
const PAIR = new RegExp(String.raw`(?:^|[\s,;|(\[{])(${KEY})\s*=\s*(${NUM})(?=$|[\s,;|)\]}%])`, 'gi');
const COLON = new RegExp(String.raw`(?:^|\s-\s|[\s|,])(${KEY}):\s+(${NUM})(?=$|[\s,;|%])`, 'gi');
const STEP_TEXT = /\b(step|iter(?:ation)?|epoch)\s*[:=#]?\s*\[?(\d+)(?:\s*\/\s*(\d+))?/i;
const STEP_ALL = new RegExp(STEP_TEXT.source, 'gi');
/** tqdm's bar: "Training:  10%|█  | 100/1000 [00:10<01:30": what it describes, then done and total. */
const BAR = /^\s*(.*?)\s*(\d{1,3})%\|[^|]*\|\s*(\d+)\/(\d+)\s*\[/;
const BAR_WHAT = /\b(train(ing)?|steps?|iter(ation)?s?)\b/i;

const toNum = (s: string): number => (/nan/i.test(s) ? NaN : /inf/i.test(s) ? (s.startsWith('-') ? -Infinity : Infinity) : Number(s));

/** What a line of output says of the run's metrics, if anything. */
export function parseLine(raw: string): Reading | null {
  // A progress bar redraws itself with carriage returns: its last state is what it says.
  const line = raw.includes('\r')
    ? (raw
        .split('\r')
        .filter((x) => x.trim())
        .pop() ?? '')
    : raw;
  if (!line.trim() || line.length > MAX_LINE) return null;
  const values: Record<string, number> = {};
  let rest = line;
  // A progress bar of the training: "Training:  10%|█  | 100/1000 [00:10<01:30]" (not an epoch's, not a download's).
  let progress: Reading['progress'];
  const bar = BAR.exec(line);
  if (bar) {
    const what = bar[1].trim().replace(/:$/, '').trim();
    const total = Number(bar[4]);
    if ((!what || (BAR_WHAT.test(what) && !/epoch/i.test(what))) && total >= 10) progress = { done: Number(bar[3]), total };
  }
  // An object on the line (JSON, or a Python dict).
  const open = line.indexOf('{');
  const close = line.lastIndexOf('}');
  if (open >= 0 && close > open) {
    try {
      const p = new Loose(line.slice(open, close + 1));
      const o = p.value();
      if (o && typeof o === 'object' && !Array.isArray(o)) {
        Object.assign(values, flatten(o as Record<string, unknown>));
        rest = line.slice(0, open) + ' ' + line.slice(close + 1);
      }
    } catch {}
  }
  for (const m of rest.matchAll(PAIR)) values[m[1]] = toNum(m[2]);
  // Keras' "loss: 0.41 - accuracy: 0.87": two or more such pairs, so "INFO: 3 files" is not a metric.
  const colons = [...rest.matchAll(COLON)];
  if (colons.length >= 2) for (const m of colons) if (!(m[1] in values)) values[m[1]] = toNum(m[2]);
  let step: number | undefined;
  let plan: number | undefined;
  for (const k of STEP_KEYS) {
    const hit = Object.keys(values).find((x) => x.toLowerCase() === k);
    if (hit !== undefined && Number.isFinite(values[hit])) {
      step ??= values[hit];
    }
  }
  // A total number of steps among the values stays a metric too.
  for (const [k, v] of Object.entries(values)) if (PLAN_KEYS.has(k.toLowerCase()) && Number.isInteger(v) && v >= 2) plan ??= v;
  for (const k of Object.keys(values)) if (STEP_KEYS.includes(k.toLowerCase()) || NOT_METRIC.has(k.toLowerCase())) delete values[k];
  if (step === undefined) {
    const m = STEP_TEXT.exec(rest);
    if (m && Object.keys(values).length) step = Number(m[2]);
  }
  // "step 120/1000" (or iter, iteration; an epoch's "3/10" is not the run's progress).
  if (!progress) {
    for (const m of rest.matchAll(STEP_ALL)) {
      if (/^epoch$/i.test(m[1]) || m[3] === undefined) continue;
      if (Number(m[3]) >= 2) progress = { done: Number(m[2]), total: Number(m[3]) };
      break;
    }
  }
  if (!Object.keys(values).length && !progress && plan === undefined) return null;
  return { values, ...(step !== undefined ? { step } : {}), ...(progress ? { progress } : {}), ...(plan !== undefined ? { plan } : {}) };
}

// ---- what the agent on call watches for in the text ---------------------------------------------------------

const OOM = /CUDA out of memory|OutOfMemoryError|CUDA error: out of memory|CUBLAS_STATUS_ALLOC_FAILED|cudaErrorMemoryAllocation|std::bad_alloc|\bMemoryError\b|Killed process \d+|^Killed$|ResourceExhaustedError|out of memory on device/m;
const NAN_TEXT = /(loss|grad(?:ient)?[\s_-]*norm)\b[^\n]{0,24}?[=:]?\s*\b(nan|-?inf)\b|\b(nan|inf) (loss|gradients?)\b|returned nan values|Loss is (nan|inf)|non-finite loss/i;

export function oomText(line: string): boolean {
  return OOM.test(line);
}

export function nanText(line: string): boolean {
  return NAN_TEXT.test(line);
}

// ---- keeping a run's metrics ---------------------------------------------------------------------------------

export type MetricsSnapshot = RunMetrics;

/** A metric that is not kept: how many times it was read, and the point of its last reading. */
interface Pending {
  n: number;
  x: number;
  v: number;
}

/**
 * A run's metrics as they come: last, best, step and series, and what the watcher needs (a metric gone NaN, a
 * loss more than doubled over its best for a while). Kept in the database between restarts (snapshot + series).
 * Only MAX_METRICS are kept: when they are full, a metric read more than once takes the place of the latest one
 * read only once (settings printed at the start must not crowd out the losses that follow).
 */
export class Tracker {
  last: Record<string, number> = {};
  best: Record<string, number> = {};
  step?: number;
  series: MetricSeries = {};
  /** How far the phase under way has got, and how many steps it will take, when the output says. */
  progress?: RunProgress;
  plan?: number;
  /** Readings of each metric so far (the step when a line gives none). */
  private count: Record<string, number> = {};
  /** Readings of the metrics that are not kept, while there is no room for them. */
  private pending = new Map<string, Pending>();
  /** For each loss, how many readings in a row have been over twice its best. */
  private over: Record<string, number> = {};
  /** Metrics that went NaN or infinite, and losses that diverged, since the last look. */
  nan: string[] = [];
  diverged: string[] = [];

  constructor(
    private better?: Record<string, 'max' | 'min'>,
    from?: { metrics?: Partial<MetricsSnapshot>; series?: MetricSeries },
  ) {
    if (from?.metrics) {
      this.last = { ...from.metrics.last };
      this.best = { ...from.metrics.best };
      this.step = from.metrics.step;
      if (from.metrics.progress) this.progress = { ...from.metrics.progress };
      // The plan comes back from the metric that says it (those are never given up).
      for (const k of Object.keys(this.last)) if (isPlan(k, this.last[k])) this.plan ??= this.last[k];
    }
    if (from?.series) {
      this.series = from.series;
      // A metric not kept has no series here (its rows were left from the time they were kept).
      if (from.metrics) for (const k of Object.keys(this.series)) if (!(k in this.last)) delete this.series[k];
    }
    // Kept metrics have been read once at least, twice when they were found repeating.
    for (const k of Object.keys(this.last)) this.count[k] = Math.max(this.series[k]?.length ?? 0, from?.metrics?.repeated?.includes(k) ? 2 : 1);
  }

  snapshot(): MetricsSnapshot {
    return {
      last: { ...this.last },
      best: { ...this.best },
      ...(this.step !== undefined ? { step: this.step } : {}),
      repeated: Object.keys(this.last).filter((k) => (this.count[k] ?? 0) >= 2),
      ...(this.progress && this.progress.done < this.progress.total ? { progress: { ...this.progress } } : {}),
    };
  }

  /** Steps as the log gives them, and what is added to them once they start again from 0 (a step counted per epoch). */
  private rawStep?: number;
  private offset = 0;

  /**
   * Whether a metric that is not kept takes the place of one that is: when it is read for the second time, and
   * there is a kept one that was read once (the latest such). Gives what was read of it before, or null.
   */
  private admit(k: string, v: number, x: number | undefined): Pending | null {
    const was = this.pending.get(k);
    const now: Pending = { n: (was?.n ?? 0) + 1, x: x ?? 1, v };
    const victim = now.n >= 2 ? Object.keys(this.last).reverse().find((o) => (this.count[o] ?? 1) <= 1 && !isPlan(o, this.last[o])) : undefined;
    if (victim === undefined) {
      this.pending.set(k, now);
      if (this.pending.size > MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
      return null;
    }
    delete this.last[victim];
    delete this.best[victim];
    delete this.series[victim];
    delete this.count[victim];
    delete this.over[victim];
    this.pending.delete(k);
    return was ?? now;
  }

  /** Takes one reading; true when it added anything (or moved the progress). */
  add(r: Reading, now = Date.now()): boolean {
    let added = false;
    let x: number | undefined;
    let back = false;
    if (r.plan !== undefined) this.plan = r.plan;
    if (r.step !== undefined && Number.isFinite(r.step)) {
      // A step that went back (counted per epoch, a second phase) keeps the series going forward.
      if (this.rawStep !== undefined && r.step < this.rawStep) {
        this.offset += this.rawStep;
        back = true;
      }
      this.rawStep = r.step;
      this.step = r.step;
      x = r.step + this.offset;
    }
    // A new phase, as long as it is not said: what was planned and how far it got are not its.
    if (back && !r.progress && r.plan === undefined) {
      this.plan = undefined;
      if (this.progress) added = true;
      this.progress = undefined;
    }
    if (r.progress) {
      this.progress = { ...r.progress, at: now };
      added = true;
    } else if (r.step !== undefined && Number.isFinite(r.step) && this.plan !== undefined && r.step <= this.plan) {
      this.progress = { done: r.step, total: this.plan, at: now };
      added = true;
    }
    for (const [k, v] of Object.entries(r.values)) {
      let before: Pending | null = null;
      if (!(k in this.last) && Object.keys(this.last).length >= MAX_METRICS) {
        before = this.admit(k, v, x);
        if (!before) continue;
      }
      added = true;
      this.last[k] = v;
      // A metric that took a place read before has its readings so far counted (this one included).
      const n = (this.count[k] = before ? before.n + 1 : (this.count[k] ?? 0) + 1);
      if (before && Number.isFinite(before.v)) {
        this.series[k] = [[before.x, before.v]];
        this.best[k] = before.v;
      }
      if (!Number.isFinite(v)) {
        if (!this.nan.includes(k)) this.nan.push(k);
        continue;
      }
      const way = betterOf(k, this.better);
      const b = this.best[k];
      if (b === undefined || (way === 'min' ? v < b : v > b)) this.best[k] = v;
      const pts = (this.series[k] ??= []);
      // Without a step, each reading is the next one.
      const prev = pts.length ? pts[pts.length - 1][0] : 0;
      const at = x ?? (pts.length ? prev + 1 : 1);
      if (pts.length && at <= prev) pts[pts.length - 1] = [prev, v];
      else pts.push([at, v]);
      if (pts.length > 2 * KEEP) this.series[k] = pts.filter((_, i) => i % 2 === 1 || i === pts.length - 1);
      // Divergence: a loss more than twice its best, five readings in a row, after ten readings.
      if (way === 'min' && /loss/i.test(k) && n >= 10 && this.best[k] > 0) {
        this.over[k] = v > 2 * this.best[k] ? (this.over[k] ?? 0) + 1 : 0;
        if (this.over[k] === 5 && !this.diverged.includes(k)) this.diverged.push(k);
      }
    }
    return added;
  }
}

/** Whether a metric is a total number of steps (a plan). */
function isPlan(key: string, value: number): boolean {
  return PLAN_KEYS.has(key.toLowerCase()) && Number.isInteger(value) && value >= 2;
}

/** The value of a metric at a step in a series: the last at or before it, once the series has got that far. */
export function valueAt(pts: [number, number][] | undefined, step: number): number | undefined {
  if (!pts?.length || pts[pts.length - 1][0] < step) return undefined;
  let v: number | undefined;
  for (const [s, x] of pts) {
    if (s > step) break;
    v = x;
  }
  return v;
}

// ---- files as they grow ------------------------------------------------------------------------------------

/** New bytes of a file from `offset`, at most `max` (none when it has not grown; from 0 when it shrank). */
export function readFrom(file: string, offset: number, max = 1 << 20): { text: string; next: number; size: number } {
  let fd: number;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return { text: '', next: offset, size: 0 };
  }
  try {
    const size = fs.fstatSync(fd).size;
    const from = size < offset ? 0 : offset;
    const n = Math.min(max, size - from);
    if (n <= 0) return { text: '', next: from, size };
    const buf = Buffer.alloc(n);
    fs.readSync(fd, buf, 0, n, from);
    // Never cut a UTF-8 character in two: stop before a partial one at the end.
    let end = n;
    for (let k = 1; k <= 3 && end - k >= 0; k++) {
      const b = buf[end - k];
      if ((b & 0xc0) === 0x80) continue;
      if (b >= 0xc0 && k < (b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2)) end -= k;
      break;
    }
    return { text: buf.subarray(0, end).toString('utf8'), next: from + end, size };
  } finally {
    fs.closeSync(fd);
  }
}

/** The last lines of a file (reading at most its last `bytes`), progress bars' redraws kept to their last state. */
export function tailLines(file: string, lines = 200, bytes = 256 * 1024): { text: string; size: number } {
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { text: '', size: 0 };
  }
  const from = Math.max(0, size - bytes);
  const { text } = readFrom(file, from, bytes);
  const all = tidyLog(from > 0 ? text.slice(text.indexOf('\n') + 1) : text).split('\n');
  // The newline a file ends with is not a line of its own.
  const ends = all.at(-1) === '';
  if (ends) all.pop();
  return { text: all.slice(-lines).join('\n') + (ends && all.length ? '\n' : ''), size };
}

/** A log as people read it: each line's last redraw (\r), no colour codes. */
export function tidyLog(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n')
    .map((l) =>
      l.includes('\r')
        ? (l
            .split('\r')
            .filter((x) => x.length)
            .pop() ?? '')
        : l,
    )
    .join('\n');
}
