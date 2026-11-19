// How far an update of a copy installed from git has got, in a number the pages can draw: a share from 0 to 1, which
// step it is on, and about how long is left. The server (server/updates.ts, with what each step's output says) and the
// pages (web/src/lib/updates.ts: a machine running an older Hydor sends none of this, so they estimate it from the
// phase and its start) both use these, so they agree on the steps, the guesses and the curve.

/** The steps of an update from git, in order. Installing packages happens only when the new version changed them. */
export type UpdateStep = 'pull' | 'install' | 'build' | 'restart';

/** How far an update has got, as the pages show it. */
export interface UpdateProgress {
  /** 0 to 1, over all the steps; never goes back. */
  share: number;
  /** The step it is on (1-based) of how many. */
  step: number;
  steps: number;
  /** About how long is left, in ms; absent while a step runs longer than expected and nothing says how far it is. */
  left?: number;
  /** A step without anything to measure it by has taken over 1.5 times as long as it did last time. */
  slow?: boolean;
}

/** How long each step takes, in ms. */
export type StepTimes = Record<UpdateStep, number>;

/** What the steps took the last time on a machine, and what the last install and build counted (server/updates.ts keeps it). */
export interface Took extends Partial<StepTimes> {
  /** Packages the last install added. */
  packages?: number;
  /** Modules the last web build read. */
  modules?: number;
}

/** What each step is guessed to take when nothing is known of the machine. */
export const GUESS: StepTimes = { pull: 10_000, install: 90_000, build: 150_000, restart: 15_000 };

/** A step without anything to measure it by is slow once it has run this many times as long as expected. */
export const SLOW_AFTER = 1.5;

/** The steps an update will take: installing only when package files changed, restarting only when the server can. */
export function planOf(install: boolean, restart: boolean): UpdateStep[] {
  return ['pull', ...(install ? (['install'] as const) : []), 'build', ...(restart ? (['restart'] as const) : [])];
}

const good = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** What each step is expected to take: what it took last time on this machine where that is known, else the guess. */
export function expectedOf(kept?: Took | null): StepTimes {
  return {
    pull: good(kept?.pull) ? kept.pull : GUESS.pull,
    install: good(kept?.install) ? kept.install : GUESS.install,
    build: good(kept?.build) ? kept.build : GUESS.build,
    restart: good(kept?.restart) ? kept.restart : GUESS.restart,
  };
}

/**
 * How much of a step with nothing to measure it by is done after `elapsed` ms, when it takes `expected`: in step with
 * the clock up to 90% of the expected time, then slower and slower, so that it never stands still and never reaches
 * the end (a step that runs long is not done because the clock says so).
 */
export function timeShare(elapsed: number, expected: number): number {
  if (!(expected > 0) || !(elapsed > 0)) return 0;
  const knee = 0.9 * expected;
  if (elapsed <= knee) return elapsed / expected;
  // 0.9 at the knee with the same slope, then 1 − 0.1 / (1 + x / 0.1 expected): 0.95 at the expected time.
  return Math.min(0.999, 1 - 0.1 / (1 + (elapsed - knee) / (0.1 * expected)));
}

/** What is left of a step with nothing to measure it by. */
export const timeLeft = (elapsed: number, expected: number): number => Math.max(0, expected * (1 - timeShare(elapsed, expected)));

/** Whether a step with nothing to measure it by has taken far longer than expected. */
export const isSlow = (elapsed: number, expected: number): boolean => elapsed > SLOW_AFTER * expected;

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/**
 * The whole update from the step it is on: the steps before it count as done (their expected time), the step itself by
 * `stepShare` (0 to 1) of its expected time, over the time of all of them. `stepLeft` is what is left of this step;
 * absent (slow), the update's is not known either. The share stays below 0.99 until the restart.
 */
export function combine(plan: UpdateStep[], exp: StepTimes, step: UpdateStep, stepShare: number, stepLeft: number | undefined, slow = false): UpdateProgress {
  const i = Math.max(0, plan.indexOf(step));
  const total = plan.reduce((t, s) => t + exp[s], 0) || 1;
  const before = plan.slice(0, i).reduce((t, s) => t + exp[s], 0);
  const after = plan.slice(i + 1).reduce((t, s) => t + exp[s], 0);
  const share = clamp((before + exp[step] * clamp(stepShare)) / total, 0, step === 'restart' ? 0.999 : 0.99);
  const out: UpdateProgress = { share, step: i + 1, steps: plan.length };
  if (slow) out.slow = true;
  else if (stepLeft != null) out.left = Math.max(0, Math.round(stepLeft + after));
  return out;
}

/** The update by the clock alone: the step it is on and how long that has run. */
export function estimate(plan: UpdateStep[], exp: StepTimes, step: UpdateStep, elapsed: number): UpdateProgress {
  const slow = isSlow(elapsed, exp[step]);
  return combine(plan, exp, step, timeShare(elapsed, exp[step]), timeLeft(elapsed, exp[step]), slow);
}

/**
 * What a page remembers of one update it watches on a machine that does not say how far it has got: when it first saw
 * each step (for a machine whose clock differs from this one's), whether packages were installed, and the furthest the
 * share has been (it never goes back, though the steps were guessed again when installing turned out to be needed).
 */
export interface RemoteRun {
  seen: Partial<Record<UpdateStep, number>>;
  /** The start of the step the page saw first, to tell one update from the next. */
  pullSince?: number;
  max: number;
}

export const newRemoteRun = (): RemoteRun => ({ seen: {}, max: 0 });

/**
 * An update on a machine that sends no progress, from its phase and when that began (`since`, by its own clock: when it
 * is ahead of `now`, from when this page first saw the phase). Installing counts once it has been seen (most updates
 * leave the packages alone). Null for a phase that is not a step.
 */
export function estimateRemote(mem: RemoteRun, run: { phase: string; since: number }, canRestart: boolean, now: number): UpdateProgress | null {
  const step = run.phase as UpdateStep;
  if (step !== 'pull' && step !== 'install' && step !== 'build' && step !== 'restart') return null;
  if (step === 'pull' && mem.pullSince != null && mem.pullSince !== run.since) {
    mem.seen = {};
    mem.max = 0;
  }
  if (step === 'pull') mem.pullSince = run.since;
  mem.seen[step] ??= now;
  const start = run.since > now ? mem.seen[step]! : run.since;
  const p = estimate(planOf(step === 'install' || mem.seen.install != null, canRestart), GUESS, step, Math.max(0, now - start));
  mem.max = Math.max(mem.max, p.share);
  return { ...p, share: mem.max };
}
