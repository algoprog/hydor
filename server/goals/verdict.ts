// How a round of a goal went, by rules alone (no model, no files): each check's closeness from where it started, the
// round's score, kept or undone and why, rounds without progress, and the limits. The driver (driver.ts) feeds it the
// checks' results; the tests (verdict-test.ts) feed it made-up ones.
import { closeness, GOAL_PATIENCE, tally, type GoalCheck, type GoalOutcome, type GoalResult, type GoalRound, type GoalState } from '../../shared/goals.ts';

/** A round must raise the score by more than this to count as a gain. */
export const NO_GAIN = 0.005;
/**
 * How far a measured value may fall behind its best, as a share of the larger of that value and the way from its start
 * to its target (so a best of 0 still leaves room), unless the check says otherwise.
 */
export const SLACK = 0.1;

/** A number as people read it: whole ones as they are, others to four figures. */
export function num(v: number): string {
  if (Number.isInteger(v)) return String(v);
  return String(Number(v.toPrecision(4)));
}

/** "$5.04". */
export const usd = (v: number): string => `$${v.toFixed(2)}`;

/** "1 h 11 min", "45 min", "3 h", "under a minute". */
export function duration(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

/** A measured value with its unit: "365 ms". */
const valueText = (c: GoalCheck, v: number) => `${num(v)}${c.unit ? ` ${c.unit}` : ''}`;

/** The results with each check's closeness, counted from its value at the start (round 0). */
export function scored(checks: GoalCheck[], results: GoalResult[], start?: Pick<GoalRound, 'results'>): GoalResult[] {
  return results.map((r) => {
    const c = checks.find((x) => x.id === r.id);
    if (!c) return r;
    const from = start?.results.find((x) => x.id === r.id)?.value;
    return { ...r, closeness: closeness(c, r, from) };
  });
}

/** The mean closeness over every check (a check without a result counts 0); 0 without checks. */
export function scoreOf(checks: GoalCheck[], results: GoalResult[], start?: Pick<GoalRound, 'results'>): number {
  if (!checks.length) return 0;
  const s = scored(checks, results, start);
  const sum = checks.reduce((n, c) => n + (s.find((r) => r.id === c.id)?.closeness ?? 0), 0);
  return sum / checks.length;
}

export interface Reckoning {
  /** kept, undone, or (where rounds cannot be undone) kept or stays. */
  outcome: Exclude<GoalOutcome, 'start'>;
  why?: string;
  /** What kept it from being kept (unset when kept), for the screens to mark it. */
  cause?: NonNullable<GoalRound['cause']>;
  score: number;
  /** The results with their closeness. */
  results: GoalResult[];
}

export interface RoundInput {
  checks: GoalCheck[];
  results: GoalResult[];
  /** Round 0: where each check started. */
  start?: Pick<GoalRound, 'results'>;
  /** The best round so far (round 0 at first): what this round is measured against. */
  best?: Pick<GoalRound, 'results'>;
  /** Whether the files can be put back (a worktree). */
  undo: boolean;
  /** Paths it changed that it may not change. */
  protectedHit?: string[];
  /** A rule of the person's that the round broke, in a sentence (the reviewer's). */
  ruleBroken?: string;
  /**
   * Set once a final check failed or the person said a check of theirs does not hold yet, while every check but the
   * person's holds where the files stand: the score can rise no more, so a round is not judged by its gain but by
   * whether it changed the files (`changed`: its files differ from the best round's; unknown without checkpoints).
   */
  afterFinal?: { changed?: boolean };
}

type NotKept = { why: string; cause: NonNullable<GoalRound['cause']> };

/** Why a round is not kept, in the order the reasons count, with its cause; undefined when it is kept. */
function notKept(i: RoundInput, score: number): NotKept | undefined {
  if (i.protectedHit?.length) {
    const list = i.protectedHit.slice(0, 5).join(', ');
    return { why: `It changed files it may not change: ${list}${i.protectedHit.length > 5 ? ` and ${i.protectedHit.length - 5} more` : ''}`, cause: 'protected' };
  }
  if (i.ruleBroken) return { why: `It broke a rule of yours: ${i.ruleBroken}`, cause: 'rule' };
  const best = i.best ?? i.start;
  const before = (id: string) => best?.results.find((r) => r.id === id);
  const now = (id: string) => i.results.find((r) => r.id === id);
  for (const c of i.checks) {
    if (before(c.id)?.holds && !now(c.id)?.holds) return { why: `${c.label} stopped holding`, cause: 'broke' };
  }
  for (const c of i.checks) {
    if (c.kind !== 'measure' || !c.target) continue;
    const b = before(c.id)?.value;
    const v = now(c.id)?.value;
    if (b == null || v == null) continue;
    // Still meeting its target: a little worse than its best is no reason to undo the round.
    if (now(c.id)?.holds) continue;
    const s0 = i.start?.results.find((r) => r.id === c.id)?.value;
    const room = (c.slack ?? SLACK) * Math.max(Math.abs(b), s0 == null ? 0 : Math.abs(c.target.value - s0));
    const worse = c.target.op === '>=' ? v < b - room : v > b + room;
    if (worse) return { why: `${c.label} fell far behind its best (${num(b)} → ${valueText(c, v)})`, cause: 'behind' };
  }
  const bestScore = scoreOf(i.checks, best?.results ?? [], i.start);
  if (!(score > bestScore + NO_GAIN)) {
    // After a final check that failed: a round that changed the files and broke nothing is kept, for the final check to
    // look at again; one that changed nothing is undone, and enough of those make a turning point (stalled).
    if (i.afterFinal) return i.afterFinal.changed === false ? { why: 'No change', cause: 'none' } : undefined;
    return { why: 'No gain', cause: 'none' };
  }
  return undefined;
}

/** What got better, for a kept round's record: a check that holds now, else the biggest move of a measured one. */
function gain(i: RoundInput, score: number): string {
  const best = i.best ?? i.start;
  const before = (id: string) => best?.results.find((r) => r.id === id);
  const now = (id: string) => i.results.find((r) => r.id === id);
  const fixed = i.checks.filter((c) => now(c.id)?.holds && !before(c.id)?.holds).map((c) => c.label);
  if (fixed.length) return `${fixed.slice(0, 3).join(', ')}${fixed.length > 3 ? ` and ${fixed.length - 3} more` : ''} now hold${fixed.length === 1 ? 's' : ''}`;
  let top: { c: GoalCheck; b: number; v: number; move: number } | null = null;
  for (const c of i.checks) {
    const b = before(c.id)?.value;
    const v = now(c.id)?.value;
    if (c.kind !== 'measure' || !c.target || b == null || v == null) continue;
    const gap = Math.abs(c.target.value - b) || Math.abs(b) || 1;
    const move = (c.target.op === '>=' ? v - b : b - v) / gap;
    if (move > 0 && (!top || move > top.move)) top = { c, b, v, move };
  }
  if (top) return `${top.c.label} ${num(top.b)} → ${valueText(top.c, top.v)}`;
  return `Closer: ${num(scoreOf(i.checks, best?.results ?? [], i.start))} → ${num(score)}`;
}

/**
 * The outcome of a round: undone when it changed a protected path, broke a rule, made a check that held stop holding,
 * let a measured value that misses its target fall far behind its best, or did not raise the score (after a failed final
 * check: did not change the files) (its cause: protected, rule, broke, behind, none); kept otherwise. Where nothing can be put back, a round that would be undone stays, with the same reason and cause.
 */
export function reckon(i: RoundInput): Reckoning {
  const results = scored(i.checks, i.results, i.start);
  const score = scoreOf(i.checks, i.results, i.start);
  const not = notKept(i, score);
  if (!not) {
    const bestScore = scoreOf(i.checks, (i.best ?? i.start)?.results ?? [], i.start);
    const why = i.afterFinal && !(score > bestScore + NO_GAIN) ? 'Nothing that held broke, and the files changed: the final check looks again' : gain(i, score);
    return { outcome: 'kept', why, score, results };
  }
  return { outcome: i.undo ? 'undone' : 'stays', why: not.why, cause: not.cause, score, results };
}

/** The last `patience` rounds (the start aside) exist and none of them was kept: it is getting nowhere. */
export function stalled(rounds: Pick<GoalRound, 'n' | 'outcome'>[], patience = GOAL_PATIENCE): boolean {
  const rs = rounds.filter((r) => r.n > 0);
  if (patience < 1 || rs.length < patience) return false;
  return rs.slice(-patience).every((r) => r.outcome !== 'kept');
}

/** Whether every check that is not the person's to confirm holds in these results. */
export function allButYouHold(checks: GoalCheck[], results: GoalResult[]): boolean {
  return checks.filter((c) => c.kind !== 'you').every((c) => results.find((r) => r.id === c.id)?.holds);
}

/**
 * Which limit the goal has reached, in a sentence ("It ran its 12 rounds"), or null. `activeMs` is its time at work now
 * (its state's plus the stretch in progress); `rounds: false` leaves the number of rounds out (a round that runs).
 */
export function limitReason(g: Pick<GoalState, 'rounds' | 'contract' | 'spentUsd'>, activeMs: number, o: { rounds?: boolean } = {}): string | null {
  const l = g.contract.limits;
  if (o.rounds !== false && tally(g).rounds >= l.rounds) return `It ran its ${l.rounds} round${l.rounds === 1 ? '' : 's'}`;
  if (l.usd != null && g.spentUsd >= l.usd) return `It spent ${usd(g.spentUsd)} of its ${usd(l.usd)}`;
  if (l.minutes != null && activeMs >= l.minutes * 60_000) return `It worked ${duration(activeMs)} of its ${duration(l.minutes * 60_000)}`;
  return null;
}

/** Measured checks given new targets (the person's Keep anyway): every round's results for them are judged again. */
export function relaxed(g: Pick<GoalState, 'contract' | 'rounds'>, relax: Record<string, number>): Pick<GoalState, 'contract' | 'rounds'> {
  const checks = g.contract.checks.map((c) => (c.kind === 'measure' && c.target && relax[c.id] != null ? { ...c, target: { ...c.target, value: relax[c.id] } } : c));
  const start = g.rounds[0];
  const rounds = g.rounds.map((r) => {
    const results = r.results.map((x) => {
      const c = checks.find((y) => y.id === x.id);
      if (!c || relax[c.id] == null || x.value == null || x.error) return x;
      const holds = c.target!.op === '>=' ? x.value >= c.target!.value : x.value <= c.target!.value;
      return { ...x, holds };
    });
    return { ...r, results: scored(checks, results, start === r ? { results } : start), score: scoreOf(checks, results, start === r ? { results } : start) };
  });
  return { contract: { ...g.contract, checks }, rounds };
}
