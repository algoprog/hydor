// What the evaluation pages say, worked out from the records: how a score stands to the baseline (in words, and the
// chance in plain words when a test gave one), what each of the page's three tiles shows (the baseline, the latest
// score, the final test), the line under an evaluation's name in the column, and which sealed files differ. No React
// here: evalWords-test.ts checks it. Sentences are plain template strings, which the page's translator takes whole.
import type { EvalScore, Evaluation, EvaluationListed, SealState } from '@shared/evaluations';
import { HELD_OUT } from '@shared/evaluations';
import { LOCALE } from '../../i18n/locale';
import { num } from './api';

/** A small number beside a score (its spread, a difference): a few digits, in e-notation only when very small or large. */
export function small(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return num(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  return a < 1e-6 || a >= 1e6 ? v.toExponential(1) : String(Number(v.toPrecision(digits)));
}

/** "0.431 ± 0.004"; the mean alone when there is one value. "–" when there is none. */
export function meanStd(s: Pick<EvalScore, 'mean' | 'std' | 'values'>): string {
  if (s.mean === undefined) return '–';
  return s.values.length > 1 && s.std !== undefined ? `${num(s.mean)} ± ${small(s.std)}` : num(s.mean);
}

export type Tone = 'better' | 'worse' | 'same';

export interface Standing {
  tone: Tone;
  /** "0.019 better than the baseline". */
  long: string;
  /** For a narrow place: "0.019 better". */
  short: string;
}

/** How a score stands to the baseline, or null when it was not compared with one. */
export function standing(against: EvalScore['against']): Standing | null {
  if (!against) return null;
  const by = small(Math.abs(against.delta), 3);
  if (against.verdict === 'better') return { tone: 'better', long: `${by} better than the baseline`, short: `${by} better` };
  if (against.verdict === 'worse') return { tone: 'worse', long: `${by} worse than the baseline`, short: `${by} worse` };
  // With a test, "the same" means it found no difference the noise would not explain.
  return { tone: 'same', long: against.p === null ? 'The same as the baseline' : 'The same as the baseline, within the noise', short: 'same as baseline' };
}

export const toneClass = (t: Tone) => (t === 'better' ? 'text-ok' : t === 'worse' ? 'text-err' : 'text-fg-2');

/** How often chance alone would give a difference like this, in plain words; '' when no test was made. */
export function chanceWords(against: EvalScore['against']): string {
  const p = against?.p;
  if (p === null || p === undefined || !Number.isFinite(p)) return '';
  if (p < 0.001) return 'A difference like this would happen by chance less than 1 time in 1,000';
  if (p < 0.4) {
    const n = Number((1 / p).toPrecision(p < 0.01 ? 2 : 1));
    return `A difference like this would happen by chance about 1 time in ${n.toLocaleString(LOCALE)}`;
  }
  const tenths = Math.min(9, Math.round(p * 10));
  return `A difference like this would happen by chance about ${tenths} times in 10`;
}

export const betterWords = (better: Evaluation['better']) => (better === 'higher' ? 'higher is better' : 'lower is better');

export const hasSeed = (command: string) => command.includes('{seed}');

/** "3 seeds", or '' when the command takes no seed. */
export const seedsWords = (ev: Pick<Evaluation, 'command' | 'seeds'>) => (hasSeed(ev.command) ? (ev.seeds.length === 1 ? '1 seed' : `${ev.seeds.length} seeds`) : '');

// ---- the sealed files ------------------------------------------------------------------------------------------------

/** A sealed path as it reads: one in the held-out folder is said to be there. */
export function pathWords(p: string): { held: boolean; name: string } {
  return p.startsWith(HELD_OUT) ? { held: true, name: p.slice(HELD_OUT.length) } : { held: false, name: p };
}

/** The sealed files that differ: how many, the first two by name, and how many are not named. */
export function changedSummary(state: Pick<SealState, 'changed' | 'more'>, named = 2): { count: number; names: string[]; held: boolean[]; more: number } {
  const count = state.changed.length + (state.more ?? 0);
  const first = state.changed.slice(0, named).map((c) => pathWords(c.path));
  return { count, names: first.map((x) => x.name), held: first.map((x) => x.held), more: count - first.length };
}

/** Whether putting files back could do anything: files added since stay, so those alone are not put back. */
export const canPutBack = (state: Pick<SealState, 'changed' | 'more'>) => !!state.more || state.changed.some((c) => c.what !== 'added');

export const filesWords = (n: number) => (n === 1 ? '1 file' : `${n.toLocaleString(LOCALE)} files`);

/** "24 Nov", with the year when it is another. */
export function sealDate(at: number, now = Date.now()): string {
  const d = new Date(at);
  const other = d.getFullYear() !== new Date(now).getFullYear();
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', ...(other ? { year: 'numeric' } : {}) });
}

// ---- scores ----------------------------------------------------------------------------------------------------------

export const isOpen = (s: Pick<EvalScore, 'status'>) => s.status === 'waiting' || s.status === 'running';

/** A score that has not ended, in words: "Waiting", "Running · 2 of 3" (runs done of all). */
export function openWords(s: Pick<EvalScore, 'status' | 'runs'>, done: number): string {
  if (s.status === 'waiting') return 'Waiting';
  return s.runs.length > 1 ? `Running · ${Math.min(done, s.runs.length)} of ${s.runs.length}` : 'Running';
}

/** The baseline's tile: measured (maybe being measured again), being measured, or not measured yet. */
export function baselineTile(ev: Pick<Evaluation, 'baseline' | 'seal'>, scores: EvalScore[]): { state: 'measured' | 'measuring' | 'none'; score?: EvalScore; again?: EvalScore } {
  const going = scores.find((s) => s.kind === 'baseline' && s.seal === ev.seal.n && isOpen(s));
  const base = ev.baseline ? scores.find((s) => s.id === ev.baseline && s.status === 'done') : undefined;
  if (base) return { state: 'measured', score: base, ...(going ? { again: going } : {}) };
  return going ? { state: 'measuring', score: going } : { state: 'none' };
}

/** The latest finished score of this seal (the baseline's own measurements are not one). */
export const latestScore = (ev: Pick<Evaluation, 'seal'>, scores: EvalScore[]) => scores.find((s) => s.kind === 'score' && s.status === 'done' && s.seal === ev.seal.n);

/** The final test's tile. `finals`: the final tests, newest first. */
export function finalTile(ev: Pick<Evaluation, 'final' | 'finals' | 'seal'>, finals: EvalScore[]): { state: 'unset' | 'unrun' | 'running' | 'done' | 'failed'; score?: EvalScore } {
  if (!ev.final) return { state: 'unset' };
  const now = finals.filter((s) => s.seal === ev.seal.n);
  const going = now.find(isOpen);
  if (going) return { state: 'running', score: going };
  // The newest says where it stands: a run that failed after a number came is said, not hidden behind that number.
  const last = now[0];
  if (!last) return { state: 'unrun' };
  return { state: last.status === 'done' ? 'done' : 'failed', score: last };
}

/** "Run 2 times since it was sealed". */
export const finalRunsWords = (n: number) => (n === 1 ? 'Run 1 time since it was sealed' : `Run ${n} times since it was sealed`);

/** The scores a chart shows: this seal's finished ones, oldest first. */
export const chartScores = (ev: Pick<Evaluation, 'seal'>, scores: EvalScore[]) =>
  scores.filter((s) => s.kind === 'score' && s.status === 'done' && s.seal === ev.seal.n && s.mean !== undefined).sort((a, b) => a.createdAt - b.createdAt);

/** The second line of an evaluation in the column and on its card. */
export function entryLine(ev: Pick<EvaluationListed, 'last' | 'state'>, scoring: boolean): { changed: boolean; text: string; standing: Standing | null } {
  const changed = !ev.state.ok;
  if (scoring) return { changed, text: 'Scoring…', standing: null };
  const last = ev.last;
  if (!last || last.mean === undefined) return { changed, text: 'No score yet', standing: null };
  // Beside "changed" there is no room for how it stands too.
  return { changed, text: num(last.mean), standing: changed ? null : standing(last.against) };
}

/** What sealing again means, said before it happens. */
export const SEAL_AGAIN = 'Sealing again accepts the files as they are now. Earlier scores are no longer compared with new ones, and the baseline has to be measured again.';

/** The request Set it up with an agent puts in the start page's box. */
export const SETUP_REQUEST =
  'Set up an evaluation for this folder: read how it trains and evaluates, then propose the scoring command, the number that counts, the files that must stay as they are and a final test on held-out data, with evaluation_propose. Ask me what you cannot find out.';
