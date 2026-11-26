// Goals the app's own loop drives (shared/goals.ts): one table, a goal to a session, its state as JSON. Besides the
// GoalState the web sees, a goal keeps fields of the loop's own under `_` (what was spent when it started, the time its
// last message went out, a question the agent asked that opens when its turn ends…): they never leave the server
// (publicGoal). A copy of every row is kept in memory, by database, so the sessions' summaries read it for nothing.
import { goalOver, goalWaits, holding, type GoalQuestion, type GoalRound, type GoalState } from '../../shared/goals.ts';
import type { GoalInfo } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import type { GoalFix } from './brief.ts';

/** The loop's own fields, kept with the goal and never sent out. */
export interface GoalPrivate {
  /** What the session had spent when the goal was set, so the goal's own spending is what came after. */
  spentAtStart: number;
  /** What it had spent when the round in progress started. */
  roundSpent?: number;
  roundStartedAt?: number;
  /** The way the round in progress follows. */
  way?: string;
  /** The round whose files the round in progress started from (GoalRound.parent). */
  parent?: number;
  /**
   * The round a limit stopped midway whose work is still in the folder, though it is not the best: the next round starts
   * from it. Gone once a round is kept or a say of the person's puts the files somewhere else.
   */
  halfIn?: number;
  /** In a git folder without checkpoints: its commit when the goal was set, to show a reviewer what changed since. */
  baseCommit?: string;
  /** When the loop's last message went out: a turn that ended before it is not the agent's answer to it. */
  sentAt?: number;
  /** When the last turn the loop dealt with ended. */
  lastTurn?: number;
  /** The session started with the goal as its first message: the draft's instructions go with it (index.ts spawn). */
  first?: boolean;
  /** The drafting turn ended without a proposal once already, and the agent was reminded. */
  reminded?: boolean;
  /** The person agreed: measuring goes on to the rounds. */
  agreed?: boolean;
  /** The measuring in progress is the one the person's Start asked for: a check that could not run sends it back to them. */
  atAgree?: boolean;
  /** Checks to measure (again) before the next round: added or changed. */
  remeasure?: string[];
  /** The running turn is the one asked which way next, not a round. */
  askTurn?: boolean;
  /** The round (by number) after which the agent was last asked which way: rounds without progress count from there. */
  askedAfter?: number;
  /** What the agent said of the round in progress (goal_report). */
  report?: { did: string; remains?: string };
  /** A question the agent asked (goal_ask) or something it is blocked on (goal_report): it opens when the turn ends. */
  ask?: Omit<GoalQuestion, 'id' | 'askedAt' | 'expiresAt'>;
  /** The open question is about this check (kind yours). */
  yours?: string;
  /** Checks of kind you that the person confirmed. */
  confirmed?: Record<string, boolean>;
  /** For the next round message: the person's note, and the round they took the files back to so it goes another way from there. */
  note?: string;
  from?: number;
  /** The next round message says to take a clearly different approach (an ask turn that asked nothing). */
  changeApproach?: boolean;
  /** Since when the goal has been at work, for its active time. */
  activeSince?: number;
  /** Where the files stood when the round in progress started (a checkpoint): its change is judged from there, and it is undone back to it. */
  roundBase?: string;
  /** Where the loop last left the files (a checkpoint), and when (leftAt): what anyone did in the folder after that is theirs. */
  filesAt?: string;
  leftAt?: number;
  /** A reset under way (driver.ts putBack): written before any file is touched, so a restart that cuts it is found (I2). */
  restoreTo?: RestoreMark;
  /** A reset did not finish (I2): the sentence the pause gave, kept for the report if the goal is stopped before Resume. */
  unfinished?: string;
  /** How many times the round in progress was to be checked while the session went on working (three: the goal pauses). */
  rechecks?: number;
  /** A final check failed, or the person said their check does not hold yet: rounds are kept when they change the files and break nothing. */
  afterFinal?: boolean;
  /** The loop's last message, to send again once when a restart of the app cut the agent's turn short. */
  lastMessage?: string;
  /** The message (by when it went out) already sent again after a restart cut its turn. */
  resent?: number;
  /** It waits because the session's queue is on hold: it goes on by itself once the queue does, as it was (heldFrom). */
  heldQueue?: boolean;
  heldFrom?: GoalState['status'];
  /**
   * What the final check found of the last few states of the files it judged (by the tree they stand for, or outside a
   * worktree a hash of the change since the start), newest last: it never pays for the strong review twice on the same
   * files. notYet: the person said a check of theirs does not hold yet for those files.
   */
  judged?: Judged[];
  /** Every check holds and this is left to put right (a failed final check, the person's "Not yet"): each round message says so first. */
  fix?: GoalFix;
  /** A round the person kept that had no results (a half round a limit stopped): measured now, then it is the best. */
  measureFor?: number;
  /** Where the goal goes back to once that is measured (paused, at its limit); unset: on to the next round. */
  measureBack?: GoalState['status'];
  /** A round was about to start (its checkpoint being taken) when the goal was paused: Resume starts it. */
  starting?: { changeApproach?: boolean };
  /** The command of a check running now (its process group and mark), killed if a restart left it running (checks.ts killLeftover). */
  running?: { pgid: number; mark: string };
  /** The session's spending could not be read when the goal was set: what it had spent is taken the first time it can be. */
  spendUnread?: boolean;
  /** The highest check id ("c7" → 7) the goal ever gave, so a removed check's id is never given again. */
  topId?: number;
  /** What the final check did, kept while a check only the person confirms waits, for the report. */
  final?: { reran: number; review?: string };
  /** The status it had when the person paused it. */
  pausedFrom?: GoalState['status'];
  /** By check id, the files a reviewer asked for that the app could read (at most 8 each): part of that check's evidence from the start (checks.ts). */
  asked?: Record<string, string[]>;
  /** By check id, the score a score check waits for (scores.ts): a restart waits for that score again rather than start another. */
  scores?: Record<string, string>;
  /** Score checks whose evaluation moved (sealed again, another baseline, removed) while the goal ran: the open question is about them, and the round in progress waits. */
  moved?: string[];
  /** Score checks fixed afresh after their evaluation moved: no value of theirs is kept, and the next round checked gives where they start from. */
  rebased?: string[];
  /** When it was last paused (M1: news for its lead from work begun before then waits in the lead's held queue). */
  pausedAt?: number;
  /** When it last went on after a pause or its limit (Resume, Give it more…): a stop of its session before then is over (R2). */
  wentOn?: number;
  /** What its session's queue held for it goes before the loop's next message (R5: Resume while a step still ran). */
  releaseHeld?: boolean;
  /** S4: the swarm's members its limit marked stopped while they were not at work (and when): Give it more… takes those marks back. */
  limitMarked?: { key: string; at: number }[];
  /**
   * M7b: when the stop of its team at a limit began (its subagents at work stopped, the lead marked as stopped): set until
   * that is done, so a restart that cuts it has the tick finish it.
   */
  teamStop?: number;
}

/**
 * A reset of the session's files under way (driver.ts putBack): where the files are going, for which round, by which
 * caller (an undone round, the person's say on round `target`), when, and the safety checkpoint that holds the folder as
 * it was just before. `record`: an undone round's record, its checkpoint the safety one, so a restart that cuts the reset
 * still records the round with everything that was in the folder.
 */
export interface RestoreMark {
  to: string;
  n: number;
  by: 'undo' | 'say';
  at: number;
  safety: string;
  record?: GoalRound;
  target?: number;
}

/** A state of the files the final check judged, and what it found. */
export interface Judged {
  key: string;
  n: number;
  ok: boolean;
  reason?: string;
  reran?: number;
  review?: string;
  notYet?: boolean;
}

export type StoredGoal = GoalState & { _: GoalPrivate };

const made = new WeakSet<DB>();
/** Every row's JSON by session key, by database. */
const rows = new WeakMap<DB, Map<string, string>>();
/**
 * What the sidebar shows of each goal, and each goal read once, by the JSON they were made from: every session's summary
 * asks for its goal (often several times a second while agents work), and the tick reads every goal every 15 seconds;
 * neither parses a goal again until it changes.
 */
const infos = new WeakMap<DB, Map<string, { json: string; info: GoalInfo | undefined }>>();
const peeks = new WeakMap<DB, Map<string, { json: string; goal: StoredGoal | null }>>();

function cacheOf<T>(m: WeakMap<DB, Map<string, T>>, db: DB): Map<string, T> {
  let c = m.get(db);
  if (!c) m.set(db, (c = new Map()));
  return c;
}

function table(db: DB): Map<string, string> {
  if (!made.has(db)) {
    db.exec('create table if not exists goals (key text primary key, id text not null, status text not null, data text not null, updated integer not null)');
    made.add(db);
  }
  let m = rows.get(db);
  if (!m) {
    m = new Map();
    for (const r of db.prepare('select key, data from goals').all() as { key: string; data: string }[]) m.set(r.key, r.data);
    rows.set(db, m);
  }
  return m;
}

function parse(json: string | undefined): StoredGoal | null {
  if (!json) return null;
  try {
    const g = JSON.parse(json) as StoredGoal;
    if (!g || typeof g !== 'object' || !g.contract) return null;
    g._ ??= { spentAtStart: 0 };
    return g;
  } catch {
    return null;
  }
}

/** The session's goal (over or not), a copy of its own to change; null without one. */
export function loadGoal(db: DB, key: string): StoredGoal | null {
  return parse(table(db).get(key));
}

export function saveGoal(db: DB, g: StoredGoal) {
  const m = table(db);
  const json = JSON.stringify(g);
  db.prepare('insert into goals (key, id, status, data, updated) values (?, ?, ?, ?, ?) on conflict(key) do update set id = excluded.id, status = excluded.status, data = excluded.data, updated = excluded.updated').run(
    g.key,
    g.id,
    g.status,
    json,
    Date.now(),
  );
  m.set(g.key, json);
}

export function dropGoal(db: DB, key: string) {
  const m = table(db);
  db.prepare('delete from goals where key = ?').run(key);
  m.delete(key);
  cacheOf(infos, db).delete(key);
  cacheOf(peeks, db).delete(key);
}

/** A goal as it is stored now, read once until it changes: shared, so only to look at (loadGoal gives one to change). */
function peek(db: DB, key: string, json: string): StoredGoal | null {
  const c = cacheOf(peeks, db);
  const hit = c.get(key);
  if (hit?.json === json) return hit.goal;
  const goal = parse(json);
  c.set(key, { json, goal });
  return goal;
}

/** Every goal that is not over (each a copy of its own). */
export function liveGoals(db: DB): StoredGoal[] {
  const out: StoredGoal[] = [];
  for (const json of table(db).values()) {
    const g = parse(json);
    if (g && !goalOver(g.status)) out.push(g);
  }
  return out;
}

/** Every goal, over or not, as stored now: shared copies, to look at and never to change (read one with loadGoal to change it). */
export function allGoals(db: DB): readonly StoredGoal[] {
  const out: StoredGoal[] = [];
  for (const [key, json] of table(db)) {
    const g = peek(db, key, json);
    if (g) out.push(g);
  }
  return out;
}

/** When a goal's row last changed. */
export function goalUpdated(db: DB, key: string): number {
  table(db);
  return (db.prepare('select updated from goals where key = ?').get(key) as { updated: number } | undefined)?.updated ?? 0;
}

/**
 * The goal as it leaves the server: the loop's own fields stripped, and its time at work brought up to now. activeMs is
 * saved as the status changes, so while a round runs or is checked it lacks the stretch in progress: added here, the page
 * can run the clock on from the moment it got the state (it read "4 s" a minute into a round on a page just opened, and
 * fell back whenever a new state arrived in the middle of a round).
 */
export function publicGoal(g: StoredGoal | null, now = Date.now()): GoalState | null {
  if (!g) return null;
  const { _: loop, ...rest } = g;
  // Where the round in progress started from, for the map: the loop's own to keep, the screens' to draw.
  const out = rest.round != null && loop?.parent != null ? { ...rest, roundParent: loop.parent } : rest;
  return loop?.activeSince != null ? { ...out, activeMs: out.activeMs + Math.max(0, now - loop.activeSince) } : out;
}

/** What the sidebar and the goal bar show of a driven goal that is not over; undefined without one. */
export function goalInfo(db: DB, key: string): GoalInfo | undefined {
  const json = table(db).get(key);
  if (!json) return undefined;
  const c = cacheOf(infos, db);
  const hit = c.get(key);
  if (hit?.json === json) return hit.info;
  const g = parse(json);
  let info: GoalInfo | undefined;
  if (g && !goalOver(g.status)) {
    const { holds, of } = holding(g);
    const status: GoalInfo['status'] = g.status === 'paused' ? 'paused' : g.status === 'agreeing' || g.status === 'needs-you' ? 'blocked' : 'active';
    info = { objective: g.contract.objective, status, reason: g.reason, app: { state: g.status, round: g.round, rounds: g.contract.limits.rounds, holds, of } };
  }
  c.set(key, { json, info });
  return info;
}

/**
 * Whether a session's per-turn "Finished" notices are held back for its goal: only while the goal is at work (drafting,
 * measuring, working, checking, asking), when it sends a notice of its own for each event that matters; not while it
 * waits for the person (agreeing, needs-you, paused), when a turn of theirs is an ordinary one.
 */
export const goalHoldsNotices = (info: GoalInfo | undefined): boolean => !!info?.app && !goalOver(info.app.state) && !goalWaits(info.app.state);

/** Whether the session has a goal of the app's own, over or not. */
export const hasGoal = (db: DB, key: string): boolean => table(db).has(key);

/** The goal the person set for a session while it is not over, for Auto mode's reviewer (server/custom/review.ts). */
export function goalObjective(db: DB, key: string): string | undefined {
  const g = loadGoal(db, key);
  return g && !goalOver(g.status) ? g.contract.objective : undefined;
}

