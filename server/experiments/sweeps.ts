// Sweeps: one command with {name} placeholders and values for each setting, expanded into runs (every combination,
// or a random sample of them, at most N), and the early stop: a run whose metric at a step is worse than the median
// of the other runs at that step stops (the median stopping rule), so the sweep's GPU time goes to the runs that
// may win. Also filling a command's placeholders and reading settings from a command, for every run.
import type { MetricSeries } from '../../shared/experiments.ts';
import { rng } from './stats.ts';
import { valueAt } from './metrics.ts';

export type Value = string | number | boolean;

/** The most runs one sweep makes. */
export const MAX_SWEEP = 200;

/** A value as it goes into a shell command: as it is when that is safe, else in single quotes. */
export function shellValue(v: Value): string {
  const s = String(v);
  return /^[\w.,:+\-/@%=]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Placeholders a command has: {name} (a shell's ${name} is not one). */
export function placeholders(command: string): string[] {
  return [...new Set([...command.matchAll(/(?<!\$)\{([A-Za-z_][\w.-]*)\}/g)].map((m) => m[1]))];
}

/** The command with its {name} placeholders filled from `values` (the others left as they are). */
export function fillCommand(command: string, values: Record<string, Value>): string {
  return command.replace(/(?<!\$)\{([A-Za-z_][\w.-]*)\}/g, (all, k: string) => (values[k] === undefined ? all : shellValue(values[k])));
}

/**
 * Every combination of the settings' values (grid), or a random sample of them without repeats (random), at most
 * `maxRuns`. A grid larger than maxRuns is refused, in words, rather than cut where it happens to.
 */
export function expandSweep(params: Record<string, Value[]>, mode: 'grid' | 'random' = 'grid', maxRuns?: number, seed = Date.now()): Record<string, Value>[] {
  const names = Object.keys(params);
  if (!names.length) throw new Error('Give at least one setting with its values, like { "lr": [0.001, 0.0003] }');
  for (const n of names) if (!Array.isArray(params[n]) || !params[n].length) throw new Error(`${n} has no values: give a list, like [1, 2, 3]`);
  const total = names.reduce((a, n) => a * params[n].length, 1);
  const cap = Math.min(maxRuns && maxRuns > 0 ? Math.floor(maxRuns) : MAX_SWEEP, MAX_SWEEP);
  const at = (i: number): Record<string, Value> => {
    const out: Record<string, Value> = {};
    for (let k = names.length - 1; k >= 0; k--) {
      const vs = params[names[k]];
      out[names[k]] = vs[i % vs.length];
      i = Math.floor(i / vs.length);
    }
    return Object.fromEntries(names.map((n) => [n, out[n]]));
  };
  if (mode === 'grid') {
    if (total > cap) throw new Error(`Every combination is ${total} runs, more than ${cap}: use mode "random" with maxRuns, or fewer values`);
    return Array.from({ length: total }, (_, i) => at(i));
  }
  const n = Math.min(cap, total);
  const next = rng(seed);
  const picked = new Set<number>();
  // Sampling without repeats: by drawing while the space is large, by shuffling when it is small.
  if (total <= 4 * n) {
    const all = Array.from({ length: total }, (_, i) => i);
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, n).map(at);
  }
  while (picked.size < n) picked.add(Math.floor(next() * total));
  return [...picked].map(at);
}

/** "lr=0.001, batch=32": a run of a sweep, by its settings. */
export const settingsLine = (v: Record<string, Value>) =>
  Object.entries(v)
    .map(([k, x]) => `${k}=${x}`)
    .join(', ');

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The median stopping rule for one run: at its latest step (once past `afterSteps` and three readings), its metric
 * against the median of the other runs that reached that step (three at least). Stop when it is worse.
 */
export function earlyStop(own: MetricSeries, others: MetricSeries[], rule: { metric: string; better: 'max' | 'min'; afterSteps?: number }): { stop: false } | { stop: true; step: number; value: number; median: number; others: number } {
  const pts = own[rule.metric];
  if (!pts || pts.length < 3) return { stop: false };
  const [step, value] = pts[pts.length - 1];
  if (step < (rule.afterSteps ?? 0)) return { stop: false };
  const vs = others.map((o) => valueAt(o[rule.metric], step)).filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (vs.length < 3) return { stop: false };
  const m = median(vs);
  const worse = rule.better === 'min' ? value > m : value < m;
  return worse ? { stop: true, step, value, median: m, others: vs.length } : { stop: false };
}

// ---- settings read from a command ----------------------------------------------------------------------------

/** A command's words as a shell splits them (quotes and backslashes), up to its first ; && || or |. */
export function shellWords(command: string): string[] {
  const out: string[] = [];
  let cur = '';
  let has = false;
  let q: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && i + 1 < command.length) cur += command[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      has = true;
    } else if (c === '\\' && i + 1 < command.length) {
      cur += command[++i];
      has = true;
    } else if (/\s/.test(c)) {
      if (has) out.push(cur);
      cur = '';
      has = false;
      if (c === '\n') break;
    } else if (c === ';' || c === '|' || (c === '&' && command[i + 1] === '&')) break;
    else {
      cur += c;
      has = true;
    }
  }
  if (has) out.push(cur);
  return out;
}

const asValue = (s: string): Value => (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : s === 'true' ? true : s === 'false' ? false : s);

/**
 * Settings a command gives its program: --name value, --name=value, a flag alone (true), and name=value words
 * after the program (Hydra's overrides). Variables set before the program (CUDA_VISIBLE_DEVICES=1 python…) are not.
 */
export function paramsOf(command: string): Record<string, Value> {
  const words = shellWords(command);
  let i = 0;
  while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i])) i++;
  const out: Record<string, Value> = {};
  for (i++; i < words.length; i++) {
    const w = words[i];
    const long = /^--([A-Za-z][\w.-]*)(?:=(.*))?$/s.exec(w);
    if (long) {
      const name = long[1];
      if (long[2] !== undefined) out[name] = asValue(long[2]);
      else if (i + 1 < words.length && (!words[i + 1].startsWith('-') || /^-\d/.test(words[i + 1]))) out[name] = asValue(words[++i]);
      else out[name] = true;
      continue;
    }
    const hydra = /^\+{0,2}([A-Za-z_][\w./-]*)=(.+)$/s.exec(w);
    if (hydra) out[hydra[1]] = asValue(hydra[2]);
  }
  return out;
}
