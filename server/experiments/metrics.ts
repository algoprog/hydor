// Metrics, read from a run's log as it grows (and from the metrics file it writes): key=value pairs (Lightning's
// progress bars, most hand-written loops), JSON objects on a line and Python's printed dicts (Hugging Face's
// Trainer), and Keras' "loss: 0.41 - accuracy: 0.87". For each metric the last value, the best (lower is better for
// losses, errors, perplexity… by name, else higher, unless the job says), the step, and a series thinned to a few
// hundred points for the charts. Also what the agent on call watches for in the text: NaN and out of memory.
import fs from 'node:fs';
import { betterOf, type MetricSeries } from '../../shared/experiments.ts';

/** Points kept per metric for the charts: past twice this, every other older point goes. */
const KEEP = 300;
/** At most this many metrics per run (a log full of numbers stops adding new ones). */
const MAX_METRICS = 100;
/** Longer lines are not read for metrics (a dumped tensor, a base64 blob). */
const MAX_LINE = 10_000;

/** Keys that say where the run is, not how it does; the first found is the step. */
const STEP_KEYS = ['step', 'global_step', 'iter', 'iteration', 'it', 'trainer/global_step', 'epoch'];
/** Numbers that are settings or bookkeeping, not metrics. */
const NOT_METRIC = new Set(['seed', 'rank', 'local_rank', 'world_size', 'pid', 'port', 'v_num', 'num_workers', 'workers', 'gpu', 'gpus', 'device', 'batch', 'batch_idx', 'total', 'n', 'i', 'id']);

export interface Reading {
  values: Record<string, number>;
  step?: number;
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
      if (this.s[this.i] === '}') return this.i++, out;
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
      if (this.s[this.i] === close) return this.i++, out;
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
const STEP_TEXT = /\b(step|iter(?:ation)?|epoch)\s*[:=#]?\s*\[?(\d+)(?:\s*\/\s*\d+)?/i;

const toNum = (s: string): number => (/nan/i.test(s) ? NaN : /inf/i.test(s) ? (s.startsWith('-') ? -Infinity : Infinity) : Number(s));

/** What a line of output says of the run's metrics, if anything. */
export function parseLine(raw: string): Reading | null {
  // A progress bar redraws itself with carriage returns: its last state is what it says.
  const line = raw.includes('\r') ? (raw.split('\r').filter((x) => x.trim()).pop() ?? '') : raw;
  if (!line.trim() || line.length > MAX_LINE) return null;
  const values: Record<string, number> = {};
  let rest = line;
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
  for (const k of STEP_KEYS) {
    const hit = Object.keys(values).find((x) => x.toLowerCase() === k);
    if (hit !== undefined && Number.isFinite(values[hit])) {
      step ??= values[hit];
    }
  }
  for (const k of Object.keys(values)) if (STEP_KEYS.includes(k.toLowerCase()) || NOT_METRIC.has(k.toLowerCase())) delete values[k];
  if (!Object.keys(values).length) return null;
  if (step === undefined) {
    const m = STEP_TEXT.exec(rest);
    if (m) step = Number(m[2]);
  }
  return step === undefined ? { values } : { values, step };
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

export interface MetricsSnapshot {
  last: Record<string, number>;
  best: Record<string, number>;
  step?: number;
}

/**
 * A run's metrics as they come: last, best, step and series, and what the watcher needs (a metric gone NaN, a
 * loss more than doubled over its best for a while). Kept in the database between restarts (snapshot + series).
 */
export class Tracker {
  last: Record<string, number> = {};
  best: Record<string, number> = {};
  step?: number;
  series: MetricSeries = {};
  /** Readings of each metric so far (the step when a line gives none). */
  private count: Record<string, number> = {};
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
    }
    if (from?.series) {
      this.series = from.series;
      for (const [k, pts] of Object.entries(from.series)) this.count[k] = pts.length;
    }
  }

  snapshot(): MetricsSnapshot {
    return { last: { ...this.last }, best: { ...this.best }, ...(this.step !== undefined ? { step: this.step } : {}) };
  }

  /** Steps as the log gives them, and what is added to them once they start again from 0 (a step counted per epoch). */
  private rawStep?: number;
  private offset = 0;

  /** Takes one reading; true when it added anything. */
  add(r: Reading): boolean {
    let added = false;
    let x: number | undefined;
    if (r.step !== undefined && Number.isFinite(r.step)) {
      // A step that went back (counted per epoch, a second phase) keeps the series going forward.
      if (this.rawStep !== undefined && r.step < this.rawStep) this.offset += this.rawStep;
      this.rawStep = r.step;
      this.step = r.step;
      x = r.step + this.offset;
    }
    for (const [k, v] of Object.entries(r.values)) {
      if (!(k in this.last) && Object.keys(this.last).length >= MAX_METRICS) continue;
      added = true;
      this.last[k] = v;
      const n = (this.count[k] = (this.count[k] ?? 0) + 1);
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
  return { text: all.slice(-lines).join('\n'), size };
}

/** A log as people read it: each line's last redraw (\r), no colour codes. */
export function tidyLog(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    .split('\n')
    .map((l) => (l.includes('\r') ? (l.split('\r').filter((x) => x.length).pop() ?? '') : l))
    .join('\n');
}
