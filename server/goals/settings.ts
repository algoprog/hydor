// What a new goal starts from (Settings → Capabilities → Goals): how many rounds it gets, how much it asks, and the
// minutes before it goes on with its own pick. Kept in the settings table under goals.rounds, goals.asks and
// goals.noAnswerMin. The rounds fall back to the old Custom setting (custom.goalRounds) until they are set here, so
// nobody loses the number they had.
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { GOAL_ROUNDS, GOAL_SETTINGS, type GoalAsks, type GoalDefaults } from '../../shared/goals.ts';

const ASKS: GoalAsks[] = ['own', 'forks', 'every'];
const MAX_ROUNDS = 500;
const MAX_MINUTES = 1440;

const whole = (v: string | undefined, min: number, max: number): number | undefined => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
};

export function goalDefaults(db: DB): GoalDefaults {
  const asks = kvGet(db, 'goals.asks');
  return {
    rounds: whole(kvGet(db, 'goals.rounds'), 1, MAX_ROUNDS) ?? whole(kvGet(db, 'custom.goalRounds'), 1, MAX_ROUNDS) ?? GOAL_ROUNDS,
    asks: ASKS.includes(asks as GoalAsks) ? (asks as GoalAsks) : GOAL_SETTINGS.asks,
    noAnswerMin: whole(kvGet(db, 'goals.noAnswerMin'), 0, MAX_MINUTES) ?? GOAL_SETTINGS.noAnswerMin,
  };
}

/** Changes any of the three (a 400 with a sentence, and nothing changed, when one is not valid); returns them as they are now. */
export function setGoalDefaults(db: DB, patch: unknown): GoalDefaults {
  if (patch == null || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(400, 'Send rounds, asks or noAnswerMin.');
  const p = patch as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
  if (p.rounds !== undefined && !int(p.rounds, 1, MAX_ROUNDS)) throw new HttpError(400, `Rounds a goal may run: a whole number from 1 to ${MAX_ROUNDS}.`);
  if (p.asks !== undefined && !ASKS.includes(p.asks as GoalAsks)) throw new HttpError(400, 'How much a goal asks: own, forks or every.');
  if (p.noAnswerMin !== undefined && !int(p.noAnswerMin, 0, MAX_MINUTES)) throw new HttpError(400, `Minutes before it goes on with its own pick: a whole number from 0 to ${MAX_MINUTES}, 0 to wait for you.`);
  if (p.rounds !== undefined) kvSet(db, 'goals.rounds', String(p.rounds));
  if (p.asks !== undefined) kvSet(db, 'goals.asks', p.asks as string);
  if (p.noAnswerMin !== undefined) kvSet(db, 'goals.noAnswerMin', String(p.noAnswerMin));
  return goalDefaults(db);
}
