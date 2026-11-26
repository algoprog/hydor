// What the Evolve pages say and draw, worked out from the records: an evolution's state in words (its header, its row on
// the evaluation's page, its line in the column), how a try stands to the start, what its score cell reads, and the
// points of the chart. No React here: evolveWords-test.ts checks it. Sentences are plain template strings, which the
// page's translator takes whole.
import type { Candidate, Evolution } from '@shared/evolve';
import type { Evaluation } from '@shared/evaluations';
import { LOCALE } from '../../i18n/locale';
import { num, took } from './api';
import { meanStd, small, type Standing } from './evalWords';

export const EVOLVE_ABOUT = 'Hydor tries many small changes to the files you name, scores each with the evaluation, and keeps the best. Your own files are not touched.';
export const TAKE_ABOUT = 'This makes a branch in your repository with this version. The files you have checked out are not touched.';
export const FINAL_UNSEEN = 'The final test has not seen this version: take it, check its branch out, then run the final test from the evaluation’s page.';

/** Working now: its tries are being made. */
export const isGoing = (e: Pick<Evolution, 'status'>) => e.status === 'starting' || e.status === 'running';
export const isEnded = (e: Pick<Evolution, 'status'>) => e.status === 'done' || e.status === 'stopped' || e.status === 'failed';

const count = (n: number) => n.toLocaleString(LOCALE);

/** What it is for, else the files it changes. */
export const evolveTitle = (e: Pick<Evolution, 'aim' | 'files'>) => e.aim?.trim() || e.files.join(', ');

export const triedWords = (e: Pick<Evolution, 'tried' | 'candidates'>) => `${count(e.tried)} of ${count(e.candidates)} tried`;
export const failedWords = (n: number) => `${count(n)} failed`;
export const askedWords = (n: number) => (n === 1 ? 'A model was asked 1 time' : `A model was asked ${count(n)} times`);

/** The first paragraph of why something failed, and the rest of it (the end of a log). */
export function splitWhy(why: string | undefined): { first: string; rest: string } {
  const text = (why ?? '').trim();
  const at = text.indexOf('\n\n');
  return at < 0 ? { first: text, rest: '' } : { first: text.slice(0, at), rest: text.slice(at + 2) };
}

/** Why one that is done ended, in a sentence of its own. */
export function doneWords(why: string | undefined): string {
  let m = /^No new best in the last (\d+)$/.exec(why ?? '');
  if (m) return `Done: no new best in the last ${m[1]}`;
  m = /^(\d+) tried$/.exec(why ?? '');
  if (m) return `Done: all ${m[1]} tried`;
  if (/^Its .+ hours? (is|are) up$/.test(why ?? '')) return 'Done: its time is up';
  return 'Done';
}

/** The time it has been working, with what passed since it was read while it still works. */
export const workedMs = (e: Pick<Evolution, 'activeMs' | 'status'>, readAt: number, now = Date.now()) => e.activeMs + (e.status === 'running' ? Math.max(0, now - readAt) : 0);

export interface StateLine {
  tone: 'going' | 'paused' | 'done' | 'stopped' | 'failed';
  /** The parts of the line, joined with " · ". */
  parts: string[];
  /** Why it was paused by the app or failed, as the server says it. */
  why?: string;
}

/** The line under its title. `ms`: the time it has worked. */
export function stateLine(e: Evolution, ms: number): StateLine {
  if (e.status === 'starting') return { tone: 'going', parts: ['Starting', 'scoring the start first'] };
  if (e.status === 'running') return { tone: 'going', parts: ['Running', triedWords(e), ...(e.failed ? [failedWords(e.failed)] : []), took(ms)] };
  if (e.status === 'paused') return { tone: 'paused', parts: ['Paused'], ...(e.why ? { why: e.why } : {}) };
  if (e.status === 'done') return { tone: 'done', parts: [doneWords(e.why)] };
  if (e.status === 'stopped') return { tone: 'stopped', parts: [e.why || 'Stopped'] };
  return { tone: 'failed', parts: ['Failed:'], why: e.why };
}

/** How something stands to the start, from its gain (positive is better), in the words an evaluation's scores use. */
export function gainStanding(gain: number | undefined, start?: number): Standing | null {
  if (gain === undefined || !Number.isFinite(gain)) return null;
  // Rounding is no difference.
  if (Math.abs(gain) <= 1e-12 * Math.max(1, Math.abs(start ?? 0))) return { tone: 'same', long: 'The same as the start', short: 'same as the start' };
  const by = small(Math.abs(gain), 3);
  return gain > 0 ? { tone: 'better', long: `${by} better than the start`, short: `${by} better` } : { tone: 'worse', long: `${by} worse than the start`, short: `${by} worse` };
}

/** Its row on the evaluation's page: its state, and for one that is done, what came of it. */
export function rowWords(e: Evolution & { bestGain?: number }): { text: string; standing: Standing | null } {
  const plain = (text: string) => ({ text, standing: null });
  if (e.status === 'starting') return plain('Starting');
  if (e.status === 'running') return plain(`Running · ${triedWords(e)}`);
  if (e.status === 'paused') return plain(`Paused · ${triedWords(e)}`);
  if (e.status === 'stopped') return plain('Stopped');
  if (e.status === 'failed') return plain('Failed');
  const standing = gainStanding(e.bestGain, e.start?.mean);
  return standing ? { text: 'Done', standing } : plain(e.best ? 'Done' : 'Done · nothing beat the start');
}

/** The second line of its evaluation in the column while it works. */
export const columnWords = (e: Pick<Evolution, 'tried' | 'candidates'>) => `Evolving · ${count(e.tried)} of ${count(e.candidates)}`;

/** The one working on each evaluation, by the evaluation's id (the newest, when there are two). */
export function evolvingBy<T extends Evolution>(list: T[]): Map<string, T> {
  const by = new Map<string, T>();
  for (const e of list) if (isGoing(e) && !by.has(e.evaluation)) by.set(e.evaluation, e);
  return by;
}

export interface TryScore {
  /** The number, with its spread once every seed was run. */
  value: string;
  /** What is being done with it now, or what the number is worth. */
  note: string;
  failed: boolean;
}

/** A try's score cell. `seeds`: how many the start was scored with (one: the first score is the whole score). */
export function tryScore(c: Pick<Candidate, 'status' | 'quick' | 'full'>, seeds: number): TryScore {
  const quick = c.quick ? num(c.quick.value) : '';
  if (c.status === 'failed') return { value: '', note: '', failed: true };
  if (c.status === 'proposing') return { value: '', note: 'Writing a change…', failed: false };
  if (c.status === 'scoring') return { value: '', note: 'Scoring…', failed: false };
  if (c.status === 'checking') return { value: quick, note: 'Checking with all seeds…', failed: false };
  if (c.full) return { value: meanStd(c.full), note: '', failed: false };
  return { value: quick, note: quick && seeds > 1 ? 'first seed only' : '', failed: false };
}

export const modelWords = (m: Candidate['model']) => (m === 'strong' ? 'Strong' : 'Quick');
export const builtOnWords = (n: number | undefined) => (n === undefined ? 'The start' : `#${n}`);

/** What evolve_get answered, as its step in a conversation says it: the state and the best so far, in one line. */
export function readWords(out: { status?: Evolution['status']; why?: string; tried?: number; candidates?: number; best?: { gain?: number } | null } | null): string {
  if (!out?.status) return '';
  const counts = out.tried !== undefined && out.candidates !== undefined;
  const state =
    out.status === 'running' || out.status === 'paused'
      ? `${out.status === 'running' ? 'Running' : 'Paused'}${counts ? ` · ${triedWords(out as Evolution)}` : ''}`
      : out.status === 'starting'
        ? 'Starting'
        : out.status === 'done'
          ? 'Done'
          : out.status === 'stopped'
            ? 'Stopped'
            : 'Failed';
  const best = gainStanding(out.best?.gain);
  if (best) return `${state} · best is ${best.long}`;
  if (out.status === 'running' || out.status === 'paused') return `${state} · nothing better yet`;
  return out.status === 'done' ? `${state} · nothing beat the start` : state;
}

// ---- the chart ------------------------------------------------------------------------------------------------------

export interface ChartPoint {
  n: number;
  id: string;
  value: number;
  /** Checked with all seeds; else only its first, quick score. */
  full: boolean;
}

export interface ChartData {
  points: ChartPoint[];
  failed: { n: number; id: string }[];
  /** The best so far, as steps: from try 0 (the start) on, the number of each try that raised it. */
  steps: { n: number; value: number }[];
  start?: number;
  /** The last try's number. */
  last: number;
  /** The values the axis spans; a point outside is drawn at its edge. */
  lo: number;
  hi: number;
}

const quantile = (sorted: number[], q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/** What the chart draws, from the tries in any order. */
export function chartData(candidates: Candidate[], start: number | undefined, better: Evaluation['better']): ChartData {
  const points: ChartPoint[] = [];
  const failed: ChartData['failed'] = [];
  let last = 0;
  for (const c of [...candidates].sort((a, b) => a.n - b.n)) {
    last = c.n;
    if (c.status === 'failed') failed.push({ n: c.n, id: c.id });
    else if (c.full) points.push({ n: c.n, id: c.id, value: c.full.mean, full: true });
    else if (c.quick) points.push({ n: c.n, id: c.id, value: c.quick.value, full: false });
  }
  const steps: ChartData['steps'] = [];
  if (start !== undefined) {
    const dir = better === 'higher' ? 1 : -1;
    let best = start;
    steps.push({ n: 0, value: start });
    for (const p of points)
      if (p.full && dir * (p.value - best) > 0) {
        best = p.value;
        steps.push({ n: p.n, value: best });
      }
  }
  // The values that matter always show: the start and the best. Of many tries, a few far off are not let to flatten the rest.
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const must = steps.map((s) => s.value);
  let lo = Math.min(...values, ...must);
  let hi = Math.max(...values, ...must);
  if (values.length >= 20) {
    const a = Math.min(quantile(values, 0.05), ...must);
    const b = Math.max(quantile(values, 0.95), ...must);
    const room = (b - a) * 0.6;
    lo = Math.max(lo, a - room);
    hi = Math.min(hi, b + room);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
  return { points, failed, steps, start, last, lo: lo - pad, hi: hi + pad };
}

/** Changes whenever something a try shows changes: a row is drawn again only then. */
export const trySign = (c: Candidate) =>
  `${c.status}|${c.summary}|${c.why ?? ''}|${c.quick?.value ?? ''}|${c.full?.mean ?? ''}|${c.full?.std ?? ''}|${c.gain ?? ''}|${c.bestWhenScored ? 1 : 0}|${c.model}|${c.parent ?? ''}`;

/** The newly read tries, with those that did not change kept as the very objects they were. */
export function keepSame(before: Candidate[], read: Candidate[]): Candidate[] {
  const had = new Map(before.map((c) => [c.id, c]));
  let same = before.length === read.length;
  const out = read.map((c, i) => {
    const old = had.get(c.id);
    const kept = old && trySign(old) === trySign(c) ? old : c;
    if (kept !== before[i]) same = false;
    return kept;
  });
  return same ? before : out;
}
