// Goals: a session works towards a goal round after round, and the app itself decides how each round went. The person and
// the agent first agree what "done" means as a short list of checks (a command that must pass, a number that must reach a
// target, a score from the project's evaluation that must beat its baseline, a sentence a reviewer must find true,
// something the person confirms). After every round the app runs the checks,
// keeps the round when things got closer or undoes it (where it can: a session in a worktree), and stops when every check
// holds, a limit is reached, or it needs the person. The agent cannot end a goal: only the checks can. The person steers
// at any time (rules for every round, a say on each round), and the agent asks which way to go at turning points.
// The types here are the goal as the server keeps it and the web shows it (GET /api/goals/:key, feature events "goal").

export type GoalCheckKind = 'command' | 'measure' | 'score' | 'review' | 'you';

/** One of the checks that say when a goal is done ("Done when"). */
export interface GoalCheck {
  /** "c1", "c2"…: given by the app. */
  id: string;
  kind: GoalCheckKind;
  /** What it says, in plain words: "Tests pass". */
  label: string;
  /** command, measure: the shell command the app runs in the session's folder. command holds when it ends without an error. */
  run?: string;
  /** measure: a regular expression whose first group is the number; the last number in the output unless set. */
  read?: string;
  /** measure: what the number must reach. score: the same, set by the app from the baseline (its mean plus or minus the gain). */
  target?: { op: '>=' | '<='; value: number };
  /** measure: shown after the number ("ms"). */
  unit?: string;
  /** measure: how far a later round may fall behind the best value and still be kept, as a share of that value (0.1 unless set). */
  slack?: number;
  /** score: the project's evaluation that scores the work (Experiments → Evaluations), by its id. */
  evaluation?: string;
  /** score: how much better than the baseline it must be, in the score's own units; 0 is any gain beyond the noise of its seeds. */
  gain?: number;
  /**
   * score: the baseline it must beat, fixed by the app when the check is agreed, so the goal keeps meaning the same thing:
   * the baseline score's id and mean, the evaluation's seal then, and its name and its number's name to show. A goal never
   * compares across seals: an evaluation sealed again, or given another baseline, while the goal runs asks the person.
   */
  baseline?: { score: string; mean: number; seal: number; name: string; metric: string };
  /** review: the sentence the reviewer must find true in what it is shown. */
  claim?: string;
  /** review: what the reviewer looks at: what changed since the goal started, files of the folder, a command's output. */
  evidence?: { diff?: boolean; files?: string[]; run?: string };
  /**
   * command, measure, review with a command: the most seconds it may take (600 unless set, 3600 at most). score: the most
   * seconds it waits for its score, the queue included (6 hours unless set, 48 at most, and never past the goal's own time).
   */
  timeoutS?: number;
}

/** A check whose result is a number against a target: a measured one, or a score. */
export const numeric = (c: Pick<GoalCheck, 'kind'>): boolean => c.kind === 'measure' || c.kind === 'score';

/** A score check's target: the baseline's mean, better by the gain in the evaluation's direction (rounded off the sum's float noise). */
export const scoreTarget = (better: 'higher' | 'lower', mean: number, gain: number): NonNullable<GoalCheck['target']> => ({
  op: better === 'higher' ? '>=' : '<=',
  value: Number((better === 'higher' ? mean + gain : mean - gain).toPrecision(12)),
});

/** How a score check runs while the goal waits for it: which check, its runs (one for each seed) and how many have ended. */
export interface GoalScoring {
  check: string;
  runs: number;
  done: number;
  /** None of its runs has started yet: they wait in the queue (`why`: what for, as the queue says it). */
  waiting: boolean;
  why?: string;
  since: number;
}

/** When a goal stops by itself. Rounds always has a number; money and time only when set. */
export interface GoalLimits {
  rounds: number;
  usd?: number;
  minutes?: number;
}

/** How much it asks the person: only when it cannot go on, at turning points, or after every round. */
export type GoalAsks = 'own' | 'forks' | 'every';

export interface GoalSettings {
  asks: GoalAsks;
  /** Minutes before an unanswered question goes on with the agent's pick; 0 waits for the person. */
  noAnswerMin: number;
}

/** A new goal asks at turning points and goes on with its pick after ten minutes (the user's choice, 2026-11-20). */
export const GOAL_SETTINGS: GoalSettings = { asks: 'forks', noAnswerMin: 10 };
/** Rounds a new goal gets before it stops at its limit, unless the agent proposes fewer or the person changes it (Settings → Goals). */
export const GOAL_ROUNDS = 30;

/** What a new goal starts from, as Settings → Capabilities → Goals sets it: its rounds, how much it asks, and the minutes before it goes on with its own pick. */
export interface GoalDefaults extends GoalSettings {
  rounds: number;
}
/** Rounds without progress before it changes its approach (or asks which way). */
export const GOAL_PATIENCE = 2;
export const GOAL_MAX_CHECKS = 12;
export const GOAL_MAX_WAYS = 4;
export const GOAL_MAX_RULES = 12;

/** What the person agrees to before any round runs. */
export interface GoalContract {
  /** The goal as the person set it. */
  objective: string;
  /** The goal in one short sentence, as the agent read it. */
  title?: string;
  checks: GoalCheck[];
  /** Paths (folders end in "/") the agent may not change: the tests, the test data, the checks' own scripts. */
  protect: string[];
  limits: GoalLimits;
}

/** How one check stood after a round. */
export interface GoalResult {
  /** The check's id. */
  id: string;
  holds: boolean;
  /** measure: the number read. score: the score's mean. */
  value?: number;
  /** score: how it compared with the baseline, beyond the noise of its seeds where that could be tested, and the score's id. */
  verdict?: 'better' | 'worse' | 'same';
  score?: string;
  /** 0 to 1: how close to holding (closeness() below). */
  closeness: number;
  /** The end of the command's output, or the reviewer's reason, for the person and for the next round. */
  detail?: string;
  /** The check could not be run or read (a missing command, no number, a reviewer without an answer): it counts as not holding. */
  error?: string;
  /**
   * In the start's results only: this check was measured for the first time after this round, not at the start (the person
   * added or changed it while the goal ran). Its value is where that check starts from; the screens show no value "at the start".
   */
  since?: number;
  ms: number;
}

/**
 * How a round ended. start: the measurement before any work. kept: closer, nothing broken: the new best. undone: not closer, or
 * something that held broke, or a path it may not change changed: the files went back to the best round. stays: the same, in a
 * folder where rounds cannot be undone (the next round is told what got worse).
 */
export type GoalOutcome = 'start' | 'kept' | 'undone' | 'stays';

export interface GoalRound {
  /** 0 is the start; rounds count from 1. */
  n: number;
  startedAt: number;
  endedAt: number;
  /** What the agent said it did, and what it thinks remains (goal_report). */
  did?: string;
  remains?: string;
  /** The way it followed, when the person or the agent named one. */
  way?: string;
  results: GoalResult[];
  /** The weighted closeness of all checks, 0 to 1. */
  score: number;
  outcome: GoalOutcome;
  /** Why, in a sentence: "Speed fell far behind its best (365 → 910 ms)". */
  why?: string;
  /**
   * What kept it from being kept, for the screens to mark it without reading the sentence: a path it may not change changed
   * (protected), a rule of the person's was broken (rule), a check that held stopped holding (broke), a number fell behind its
   * best (behind), or nothing got closer (none).
   */
  cause?: 'protected' | 'rule' | 'broke' | 'behind' | 'none';
  /** The person overruled the outcome (Keep anyway, Undo), with their reason. */
  by?: 'you';
  reason?: string;
  /** What the round cost and how its files stood when it ended (a checkpoint commit, in a worktree). */
  usd: number;
  /** In a session that leads a swarm: how many of its members worked in this round (left out when none did). */
  members?: number;
  checkpoint?: string;
}

/** A way to go that the agent sees, for the person to pick from. */
export interface GoalWay {
  name: string;
  why?: string;
  /** What it should bring: "Relevance +0.06 to +0.10 · Speed about the same". */
  expects?: string;
  /** What it costs: "about 2 rounds · $1.20". */
  cost?: string;
}

/** A question the goal has open for the person. */
export interface GoalQuestion {
  id: string;
  /** way: which way next. yours: a check only the person can confirm. blocked: something only they can give. */
  kind: 'way' | 'yours' | 'blocked';
  question: string;
  /** Where things stand, in a sentence or two. */
  context?: string;
  ways: GoalWay[];
  /** The agent's own pick, as an index into ways. */
  pick: number;
  /** Why it asks, in a sentence. */
  why?: string;
  askedAt: number;
  /** When it goes on with its pick; unset: it waits for the person. */
  expiresAt?: number;
}

export interface GoalAnswer {
  /** The ways ticked, as indexes, in the order to follow them. */
  ways: number[];
  /** A way of the person's own ("Something else"). */
  other?: string;
  note?: string;
  /** Who answered: the person, or the clock (the agent's pick went ahead). */
  by: 'you' | 'clock';
  at: number;
}

/** Something the person said that holds for every round. */
export interface GoalRule {
  id: string;
  text: string;
  at: number;
}

/**
 * Where a goal stands. drafting: the agent is working out the checks. agreeing: the checks wait for the person's Start.
 * measuring: the app measures the start. working: a round runs. checking: the app runs the checks. asking: a question is open
 * and nothing runs. paused: by the person, or after a turn that failed. needs-you: it cannot go on without the person.
 * reached: every check holds. stopped: the person stopped it. limit: rounds, money or time ran out.
 */
export type GoalStatus = 'drafting' | 'agreeing' | 'measuring' | 'working' | 'checking' | 'asking' | 'paused' | 'needs-you' | 'reached' | 'stopped' | 'limit';

/** A goal that is over: nothing more will run. */
export const goalOver = (s: GoalStatus): boolean => s === 'reached' || s === 'stopped' || s === 'limit';
/** A goal that waits for the person and does nothing meanwhile. */
export const goalWaits = (s: GoalStatus): boolean => s === 'agreeing' || s === 'needs-you' || s === 'paused';

/** A goal, as GET /api/goals/:key gives it and the "goal" feature event sends it whenever it changes. */
export interface GoalState {
  /** The session's key. */
  key: string;
  /** This goal's own id: a new goal in the same session gets a new one. */
  id: string;
  status: GoalStatus;
  /** Why it stands there, when that needs saying: why it paused, which limit, what it needs. */
  reason?: string;
  contract: GoalContract;
  settings: GoalSettings;
  /** The start (n 0) and every round since, oldest first. */
  rounds: GoalRound[];
  /** The round the files stand at now: the best so far. */
  best?: number;
  /** The round in progress (the next number), while one runs. */
  round?: number;
  /**
   * Pause was pressed while a round ran: that round is finished and checked as any round (kept, undone or left as it
   * is), and then the goal pauses. Resume meanwhile takes the pause back, and the goal carries straight on.
   */
  pausing?: true;
  /** Whether rounds can be undone here: the session works in a worktree. */
  undo: boolean;
  rules: GoalRule[];
  /** The ways it will follow next, in order: the person's picks first. */
  next: GoalWay[];
  /** What was tried and dropped, so later rounds do not try it again. */
  dropped: { text: string; by?: 'you' }[];
  question?: GoalQuestion;
  /** The last answer given, for the conversation's record. */
  answered?: GoalAnswer & { question: string; picked: string[] };
  startedAt: number;
  endedAt?: number;
  /** Money spent on it so far, at API prices, and the time it has been at work (not paused), in ms. */
  spentUsd: number;
  activeMs: number;
  /** When it is over: what the last check found, in sentences for the report card. */
  /**
   * `mid`: the round that was cut short (a limit, or the person's Stop, in the middle of it): its unfinished work is still
   * in the folder, so the files do not stand at the best round. `finals`: reached, the evaluations of its score checks that
   * have a final test, which a goal never runs: the person may, on the evaluation's page.
   */
  report?: { summary: string; final?: GoalResult[]; review?: string; mid?: number; finals?: { evaluation: string; name: string }[] };
  /** A score check waits for its score (measuring or checking): how its runs stand, for the bar. */
  scoring?: GoalScoring;
  /**
   * Checks or protected paths the person changed while a round ran: that round is judged by the checks it started with,
   * and these take effect (measured first where they changed) once it has been checked.
   */
  pending?: Partial<Pick<GoalContract, 'checks' | 'protect'>>;
}

// ---- what the web sends: POST /api/sessions/:key/goal -------------------------------------------------------------------

export type GoalAction =
  /** Set a goal: the agent drafts the checks first. */
  | { action: 'set'; objective: string; settings?: Partial<GoalSettings> }
  /** Start the rounds with the checks as proposed, or as the person changed them. */
  | { action: 'agree'; contract?: Partial<Pick<GoalContract, 'checks' | 'protect' | 'limits' | 'title'>> }
  /** Change checks or limits of a goal that runs: it takes effect with the next round. */
  | { action: 'change'; contract: Partial<Pick<GoalContract, 'checks' | 'protect' | 'limits'>> }
  /** Answer the open question. */
  | { action: 'answer'; ways: number[]; other?: string; note?: string }
  /** The open question waits for the person instead of going on with the pick. */
  | { action: 'wait' }
  | { action: 'pause' }
  | { action: 'resume' }
  /** Stop working towards it ("clear" is the older name). */
  | { action: 'stop' }
  | { action: 'clear' }
  | { action: 'settings'; settings: Partial<GoalSettings> }
  | { action: 'rule'; text: string }
  | { action: 'unrule'; id: string }
  /** The person's say on a round: keep it anyway, undo it, or go another way from it. relax changes measured checks' targets by id. */
  | { action: 'round'; n: number; do: 'keep' | 'undo' | 'from'; reason?: string; relax?: Record<string, number> };

// ---- shared reckoning -----------------------------------------------------------------------------------------------------

/** "≥ 0.80", "≤ 200 ms", "pass", "looks right", "you". */
export function targetText(c: GoalCheck): string {
  if (numeric(c) && c.target) return `${c.target.op === '>=' ? '≥' : '≤'} ${c.target.value}${c.unit ? ` ${c.unit}` : ''}`;
  return c.kind === 'command' ? 'pass' : c.kind === 'review' ? 'reviewer' : c.kind === 'you' ? 'you' : '';
}

/** Whether a measured value meets its target. */
export const meets = (c: GoalCheck, v: number): boolean => !!c.target && (c.target.op === '>=' ? v >= c.target.value : v <= c.target.value);

/** Whether a number holds its check: it meets the target, and a score also beats its baseline beyond the noise (its verdict). */
export const holdsAt = (c: GoalCheck, v: number, verdict?: GoalResult['verdict']): boolean => meets(c, v) && (c.kind !== 'score' || verdict === 'better');

/**
 * How close a check is to holding, 0 to 1. A check that holds is 1. A measured one that does not is the share of the way from
 * where it started to its target (0 when it stands no better than at the start, or has no start to compare with); any other is 0.
 */
export function closeness(c: GoalCheck, r: { holds: boolean; value?: number }, start?: number): number {
  if (r.holds) return 1;
  if (!numeric(c) || !c.target || r.value == null || start == null) return 0;
  const gap = c.target.value - start;
  if (!gap) return 0;
  const done = (r.value - start) / gap;
  return Math.max(0, Math.min(0.99, done));
}

/** A value of a measured check at the start of the goal (round 0). */
export const startValue = (g: Pick<GoalState, 'rounds'>, id: string): number | undefined => g.rounds[0]?.results.find((r) => r.id === id)?.value;

/** The results the files stand at: those of the best round, else of the latest. */
export function standing(g: Pick<GoalState, 'rounds' | 'best'>): GoalResult[] {
  const r = g.rounds.find((x) => x.n === g.best) ?? g.rounds[g.rounds.length - 1];
  return r?.results ?? [];
}

/** How many checks hold where the files stand, of how many. */
export function holding(g: Pick<GoalState, 'rounds' | 'best' | 'contract'>): { holds: number; of: number } {
  const res = standing(g);
  return { holds: g.contract.checks.filter((c) => res.find((r) => r.id === c.id)?.holds).length, of: g.contract.checks.length };
}

/** Rounds that ran (the start aside), and how they ended. */
export function tally(g: Pick<GoalState, 'rounds'>): { rounds: number; kept: number; undone: number } {
  const rs = g.rounds.filter((r) => r.n > 0);
  return { rounds: rs.length, kept: rs.filter((r) => r.outcome === 'kept').length, undone: rs.filter((r) => r.outcome === 'undone').length };
}

// ---- the messages the app's goal loop sends to the agent -----------------------------------------------------------------

/** Every message of the loop starts with a line like "[Goal · round 3 of 12]"; the conversation draws such a message as one slim row. */
const GOAL_HEAD = /^\[Goal(?: · ([^\]\n]{1,80}))?\]\s*\n?/;

/** A message the goal loop sent: what its head says ("round 3 of 12", "agree the checks", "which way next"), and the rest. */
export function goalMessageOf(text: string): { head: string; body: string } | null {
  const m = GOAL_HEAD.exec(text);
  return m ? { head: m[1] ?? '', body: text.slice(m[0].length) } : null;
}

export const goalHead = (what: string): string => `[Goal · ${what}]`;
