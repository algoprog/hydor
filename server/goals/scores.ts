// Goals the app checks, scored by an evaluation (shared/evaluations.ts, server/experiments/evaluations.ts): a check of kind
// score holds when the project's own sealed way of keeping score beats its baseline by at least the gain agreed, beyond
// the noise of its seeds. Here: what such a check needs of its evaluation when it is proposed, agreed or changed (it exists,
// can score the session's folder, has a baseline: the target is fixed from that baseline then, and its protected files
// join the goal's), whether the evaluation moved since (sealed again, another baseline, removed), running it (a score of
// the session's folder through the Experiments queue, by the goal, waited for with how its runs stand for the bar, a
// score a restart left open waited for again rather than started twice, its runs stopped when the person pauses or stops
// the goal), and which evaluations have a final test, which a goal never runs.
import fs from 'node:fs';
import path from 'node:path';
import { ACTIVE } from '../../shared/experiments.ts';
import type { EvalScore, Evaluation } from '../../shared/evaluations.ts';
import { meets, scoreTarget, type GoalCheck, type GoalResult, type GoalScoring } from '../../shared/goals.ts';
import { confidentialKey } from '../confidential/index.ts';
import type { DB } from '../db.ts';
import { ChangedError, getEvaluation, getScore, rootFor, allowedFolder, startScore, stopScore, verdictOf, waitScore } from '../experiments/evaluations.ts';
import { getRun } from '../experiments/records.ts';
import type { Deps } from '../features/types.ts';
import { DEFAULT_SCORE_TIMEOUT_S, MAX_SCORE_TIMEOUT_S } from './checks.ts';
import { duration, num } from './verdict.ts';

/** The evaluation's page in the app, where the person measures its baseline and runs its final test. */
export const evalPage = (id: string) => `/experiments?evaluation=${encodeURIComponent(id)}`;

/** Why a confidential session cannot have a score check: the evaluation's runs go through the queue, outside its sandbox. */
export const SCORE_CONFIDENTIAL = 'A confidential session cannot be scored by an evaluation: its runs are not kept off the network';

const real = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const slashes = (p: string) => p.split(path.sep).join('/');

/** The finished baseline of an evaluation under its current seal, or null. */
function baselineOf(db: DB, ev: Evaluation): EvalScore | null {
  const b = ev.baseline ? getScore(db, ev.baseline) : null;
  return b && b.status === 'done' && b.seal === ev.seal.n && b.mean != null && Number.isFinite(b.mean) ? b : null;
}

/** The evaluation's protected paths as the goal writes them: from the session's folder, only those that lie in it. */
export function protectFor(ev: Pick<Evaluation, 'protect'>, root: string, cwd: string): string[] {
  const up = slashes(path.relative(real(cwd), real(root)));
  const out: string[] = [];
  for (const e of ev.protect) {
    if (!up) out.push(e);
    else if (up !== '..' && !up.startsWith('../')) out.push(`${up}/${e}`);
    else {
      // The session works in a folder inside the evaluation's: what lies inside its own folder, from there.
      const down = `${slashes(path.relative(real(root), real(cwd)))}/`;
      if (e.startsWith(down) && e.length > down.length) out.push(e.slice(down.length));
    }
  }
  return out;
}

/**
 * Score checks made ready to agree: each one's evaluation must exist, be able to score the session's folder and have a
 * baseline, and its target is fixed from that baseline (its mean plus or minus the gain) with the seal and names it is of.
 * `before`: the goal's checks now (the person's change): a check with the same id, evaluation and an agreed baseline
 * keeps that baseline (a new gain is counted from it), unless the evaluation moved since; `again` fixes every one afresh
 * from the evaluation as it is now (the person's Start, their answer after the evaluation moved). `who` says whom the
 * sentences are for. Returns the checks, the evaluations' protected paths (from the session's folder), and the problems.
 */
export async function fixScores(
  d: Pick<Deps, 'db'>,
  o: { key: string; cwd: string; checks: GoalCheck[]; before?: GoalCheck[]; again?: boolean; who: 'agent' | 'you' },
): Promise<{ checks: GoalCheck[]; protect: string[]; errors: string[] }> {
  const errors: string[] = [];
  const protect: string[] = [];
  const checks: GoalCheck[] = [];
  const secret = o.checks.some((c) => c.kind === 'score') && confidentialKey(d.db, o.key);
  for (const c of o.checks) {
    if (c.kind !== 'score') {
      checks.push(c);
      continue;
    }
    const named = `“${c.label}”`;
    const { target: _t, baseline: _b, ...plain } = c;
    const gain = c.gain ?? 0;
    if (secret) {
      errors.push(`${named}: ${SCORE_CONFIDENTIAL.charAt(0).toLowerCase()}${SCORE_CONFIDENTIAL.slice(1)}.`);
      continue;
    }
    if (!o.cwd) {
      errors.push(`${named}: the session’s folder is not known, so nothing can score it.`);
      continue;
    }
    const ev = c.evaluation ? getEvaluation(d.db, c.evaluation) : null;
    if (!ev) {
      errors.push(`${named}: there is no evaluation “${c.evaluation ?? ''}”${o.who === 'agent' ? ' (evaluation_get lists those of this folder)' : ': pick one of this folder’s evaluations'}.`);
      continue;
    }
    let root: string | null = null;
    try {
      root = await rootFor(ev, o.cwd);
      if (root) await allowedFolder(ev, root);
    } catch {
      root = null;
    }
    if (!root) {
      errors.push(`${named}: “${ev.name}” cannot score this session’s folder: an evaluation scores its own folder, a folder inside it, or a git worktree of the same repository.`);
      continue;
    }
    protect.push(...protectFor(ev, root, o.cwd));
    const was = o.again ? undefined : o.before?.find((x) => x.id === c.id && x.kind === 'score' && x.evaluation === c.evaluation && x.baseline && x.target);
    if (was?.baseline && !movedWhy(d.db, was)) {
      checks.push({ ...plain, gain, target: scoreTarget(was.target!.op === '>=' ? 'higher' : 'lower', was.baseline.mean, gain), baseline: was.baseline });
      continue;
    }
    const base = baselineOf(d.db, ev);
    if (!base) {
      errors.push(
        o.who === 'you'
          ? `${named}: the baseline of “${ev.name}” is not measured yet: only you can measure it, on the evaluation’s page.`
          : `${named}: the baseline of “${ev.name}” is not measured yet, and only the user can measure it (on the evaluation’s page): ask them to, or propose another check.`,
      );
      continue;
    }
    checks.push({ ...plain, gain, target: scoreTarget(ev.better, base.mean!, gain), baseline: { score: base.id, mean: base.mean!, seal: ev.seal.n, name: ev.name, metric: ev.metric } });
  }
  return { checks, protect: [...new Set(protect)], errors };
}

/** Why a score check no longer means what was agreed (its evaluation removed, sealed again, or given another baseline), or null. */
export function movedWhy(db: DB, c: GoalCheck): string | null {
  if (c.kind !== 'score' || !c.baseline) return null;
  const ev = c.evaluation ? getEvaluation(db, c.evaluation) : null;
  if (!ev) return `The evaluation “${c.baseline.name}” was removed, so “${c.label}” can no longer be scored: change the goal’s checks, or stop it`;
  if (ev.seal.n !== c.baseline.seal) return `“${ev.name}” was sealed again after the goal’s checks were agreed, so its scores can no longer be compared with the baseline “${c.label}” was agreed against`;
  if (ev.baseline !== c.baseline.score) return `The baseline of “${ev.name}” changed after the goal’s checks were agreed, so “${c.label}” no longer means what was agreed`;
  return null;
}

/** What the question says under a moved evaluation's sentence, and its one way on. */
export const MOVED_CONTEXT = 'Measure the evaluation’s baseline again on its page if it has none now, then go on: the check is fixed against the evaluation as it is now, and this round is scored again. Or stop the goal.';
export const MOVED_WAY = 'Go on against it as it is now';

/** A score's seconds of waiting: the check's own, else six hours, at most 48. */
export const scoreTimeoutOf = (c: GoalCheck) => Math.min(Math.max(1, Math.round(c.timeoutS ?? DEFAULT_SCORE_TIMEOUT_S)), MAX_SCORE_TIMEOUT_S);

/**
 * Why a check got no score to judge the round by: Pause or Stop ended its wait (`cut`), its evaluation moved since it was
 * agreed (`moved`), its wait ran past its time (`late`), or something the files cannot help (`unrun`: its runs stopped by
 * someone else, the folder it cannot score).
 */
export type ScoreTrouble = 'cut' | 'moved' | 'late' | 'unrun';

export interface ScoreHow {
  /** The session's key: the score is the goal's (by: goal). */
  key: string;
  /** The session's folder: the evaluation scores the part of it that stands for its own (rootFor). */
  cwd: string;
  /** The most seconds to wait, the goal's own time limit counted in. */
  timeoutS: number;
  /** Pause and Stop: the score's runs are stopped. */
  signal: AbortSignal;
  /** A score started for this check before a restart cut its wait: waited for again, never started twice. */
  open?: string;
  started(id: string): void;
  /** How its runs stand while it waits (null once it is over). */
  progress(p: GoalScoring | null): void;
}

/** Said when Pause or Stop ended a score's wait (the step leaves the round unchecked). */
export const SCORE_CUT = 'It was stopped: the goal was paused or stopped while it was being scored';

const errorOf = (id: string, error: string, t0: number, more: Partial<GoalResult> = {}): GoalResult => ({ id, holds: false, closeness: 0, error, ...more, ms: Date.now() - t0 });

/** "+0.019", "−0.004". */
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v))}`;

/** How a score stands against the baseline, in a sentence: "0.431 against 0.412: within the noise of 3 seeds (p = 0.21)". */
export function scoreDetail(c: GoalCheck, mean: number, base: number, v: { delta: number; p: number | null; verdict: 'better' | 'worse' | 'same' }, n: number): string {
  const head = `${num(mean)} against ${num(base)}`;
  const p = v.p == null ? '' : v.p < 0.001 ? ' (p < 0.001)' : ` (p = ${num(v.p)})`;
  const needs = c.target ? signed(c.target.value - base) : '';
  if (v.verdict === 'same' && v.p != null) return `${head}: within the noise of ${n} ${n === 1 ? 'seed' : 'seeds'}${p}${c.target && !meets(c, mean) ? `, and short of the ${needs} it needs` : ''}.`;
  if (v.verdict === 'same') return `${head}: no better.`;
  if (v.verdict === 'worse') return `${head}: ${signed(v.delta)}, worse${p}.`;
  const beyond = v.p != null ? `, beyond the noise of ${n} seeds${p}` : ' (too few runs on a side to test the noise)';
  return c.target && !meets(c, mean) ? `${head}: ${signed(v.delta)}${beyond}, but short of the ${needs} it needs.` : `${head}: ${signed(v.delta)}${beyond}.`;
}

/** How a score's runs stand, for the bar. */
function progressOf(db: DB, c: GoalCheck, s: EvalScore, since: number): GoalScoring {
  const runs = s.runs.map((id) => getRun(db, id));
  const why = s.status === 'waiting' ? runs.find((r) => r?.why)?.why : undefined;
  return { check: c.id, runs: s.runs.length, done: runs.filter((r) => r && !ACTIVE.includes(r.status)).length, waiting: s.status === 'waiting', ...(why ? { why } : {}), since };
}

/**
 * Runs a score check: the evaluation scores the session's folder (or waits for the score a restart left open), and the
 * result is its mean against the baseline the check was agreed against. It holds when the mean meets the target and
 * the score is better than the baseline beyond the noise of its seeds (with too few seeds to test, by its mean). A score
 * refused (its protected files changed) or failed is an error with the evaluation's own sentence: an outcome of the files,
 * which does not hold. An evaluation that moved since, a wait past its time, or a score stopped by someone else is
 * trouble the round cannot be judged by; Pause and Stop (`signal`) stop its runs.
 */
export async function scoreCheck(d: Deps, c: GoalCheck, how: ScoreHow): Promise<{ result: GoalResult; trouble?: ScoreTrouble }> {
  const t0 = Date.now();
  try {
    if (!c.evaluation || !c.baseline || !c.target) return { result: errorOf(c.id, 'It has no baseline agreed to be scored against', t0), trouble: 'unrun' };
    if (confidentialKey(d.db, how.key)) return { result: errorOf(c.id, SCORE_CONFIDENTIAL, t0), trouble: 'unrun' };
    const moved = movedWhy(d.db, c);
    if (moved) return { result: errorOf(c.id, moved, t0), trouble: 'moved' };
    const ev = getEvaluation(d.db, c.evaluation)!;
    const base = getScore(d.db, c.baseline.score);
    if (!base || base.status !== 'done' || !base.values.length) return { result: errorOf(c.id, `The baseline of “${ev.name}” is not there any more`, t0), trouble: 'moved' };
    const root = await rootFor(ev, how.cwd).catch(() => null);
    if (!root) return { result: errorOf(c.id, `“${ev.name}” cannot score this session’s folder`, t0), trouble: 'unrun' };
    if (how.signal.aborted) return { result: errorOf(c.id, SCORE_CUT, t0), trouble: 'cut' };
    // A score of this check that a restart left open (or that ended meanwhile) is this one's.
    const left = how.open ? getScore(d.db, how.open) : null;
    let s: EvalScore;
    if (left && left.kind === 'score' && left.evaluation === ev.id && left.seal === ev.seal.n && left.status !== 'stopped') s = left;
    else {
      try {
        s = await startScore(d, ev.id, { kind: 'score', folder: root, by: { who: 'goal', session: how.key } });
      } catch (e) {
        // Refused: the files it protects differ from the seal. That is how these files stand, not a check that could not run.
        if (e instanceof ChangedError) return { result: errorOf(c.id, `${e.message}, so it was not scored`, t0) };
        return { result: errorOf(c.id, `It could not be scored: ${(e as Error).message}`, t0), trouble: 'unrun' };
      }
    }
    how.started(s.id);
    const end = t0 + how.timeoutS * 1000;
    let shown = '';
    while ((s.status === 'waiting' || s.status === 'running') && Date.now() < end && !how.signal.aborted) {
      const p = progressOf(d.db, c, s, t0);
      const key = JSON.stringify({ ...p, since: 0 });
      if (key !== shown) {
        shown = key;
        how.progress(p);
      }
      s = (await waitScore(d, s.id, Math.max(50, Math.min(5000, end - Date.now())), how.signal)) ?? s;
    }
    if (s.status === 'waiting' || s.status === 'running') {
      await stopScore(d, s.id).catch(() => {});
      if (how.signal.aborted) return { result: errorOf(c.id, SCORE_CUT, t0, { score: s.id }), trouble: 'cut' };
      const span = how.timeoutS < 60 ? `${how.timeoutS} s` : duration(how.timeoutS * 1000);
      return { result: errorOf(c.id, `It took longer than its ${span} to be scored, so its runs were stopped`, t0, { score: s.id }), trouble: 'late' };
    }
    // Sealed again or given another baseline while it was scored: nothing is compared across them.
    const after = movedWhy(d.db, c);
    if (after) return { result: errorOf(c.id, after, t0, { score: s.id }), trouble: 'moved' };
    if (s.status === 'stopped') return { result: errorOf(c.id, s.why ?? 'Its score was stopped', t0, { score: s.id }), trouble: 'unrun' };
    if (s.status === 'failed') {
      const printed = s.printed?.length ? `It printed: ${s.printed.slice(0, 12).join(', ')}` : undefined;
      return { result: errorOf(c.id, s.why ?? 'Its score failed', t0, { score: s.id, ...(printed ? { detail: printed } : {}) }) };
    }
    if (s.mean == null || !s.values.length) return { result: errorOf(c.id, 'Its score has no number', t0, { score: s.id }) };
    const v = verdictOf(s.values, base.values, ev.better);
    // The mean without the float noise of its sum, so that one at its target is.
    const mean = Number(s.mean.toPrecision(12));
    const holds = meets(c, mean) && v.verdict === 'better';
    return { result: { id: c.id, holds, value: mean, closeness: holds ? 1 : 0, verdict: v.verdict, score: s.id, detail: scoreDetail(c, mean, base.mean!, v, s.values.length), ms: Date.now() - t0 } };
  } finally {
    how.progress(null);
  }
}

/** The evaluations of a goal's score checks that have a final test (each once), for its report. */
export function finalTests(db: DB, checks: GoalCheck[]): { evaluation: string; name: string }[] {
  const out: { evaluation: string; name: string }[] = [];
  for (const id of new Set(checks.filter((c) => c.kind === 'score' && c.evaluation).map((c) => c.evaluation!))) {
    const ev = getEvaluation(db, id);
    if (ev?.final) out.push({ evaluation: ev.id, name: ev.name });
  }
  return out;
}
