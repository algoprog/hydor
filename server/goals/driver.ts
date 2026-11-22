// The app's goal loop (shared/goals.ts): one goal to a session, for every agent program. The agent first proposes the
// checks that say when the goal is done; the app measures where things stand and the person agrees. Then round after
// round: the app sends what to work on, and when the agent's turn ends (and its queue, subagents and background work
// with it) runs the checks itself, keeps the round or undoes it (in a worktree), and goes on, asks the person which
// way, or stops when every check holds and the final check passes, or a limit is reached. The person's own messages
// are ordinary turns inside a round and go first. Everything it needs is in its table (store.ts), so a restart of the
// app loses nothing: a tick every 15 seconds closes questions whose time is up, stops a round past its money or time,
// and picks up what a restart cut short. It never touches a session's live state; it sends a message only when the
// loop really goes on. It never puts files back where anyone (the person, the agent, another session in the same
// folder) could have written since the loop last looked at them: putBack is the one way it restores.
import crypto from 'node:crypto';
import path from 'node:path';
import { GOAL_MAX_RULES, GOAL_PATIENCE, GOAL_SETTINGS, goalMessageOf, goalOver, standing, tally, type GoalAction, type GoalCheck, type GoalContract, type GoalQuestion, type GoalResult, type GoalRound, type GoalSettings, type GoalState, type GoalStatus } from '../../shared/goals.ts';
import type { NotifyEvent, SessionSummary, WorktreeInfo } from '../../shared/types.ts';
import { netCutAvailable, sandboxAvailable, sandboxShell, type Shell } from '../agent/sandbox.ts';
import { CUT_BY_RESTART } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { spending } from '../budget/spend.ts';
import { ancestorsOf, betweenAgents, childKeys, parentOf as parentSession, reportOnItsWay, stillAtWork } from '../children/family.ts';
import { modeFamily, neverAsks } from '../children/modes.ts';
import { confidentialKey } from '../confidential/index.ts';
import { customSettings } from '../custom/settings.ts';
import type { DB } from '../db.ts';
import type { Deps, TurnInfo } from '../features/types.ts';
import { lastTurn, opensTurn } from '../opinion/turns.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { boardNow, boardWaits, members as swarmMembers } from '../swarm/index.ts';
import { checkpoint as takeCheckpoint, restoreCheckpoint, restoreRefusal } from '../worktrees.ts';
import { askMessage, draftMessage, draftNotes, reminderMessage, restartedMessage, roundMessage } from './brief.ts';
import { addAsked, alsoBlocks, changedPaths, diffText, headOf, killLeftover, parentOf, pathsIn, protectedHits, runChecks, sameFiles, treeOf, untrackedStamp, type CheckEnv } from './checks.ts';
import { finalReview, reviewClaim, reviewRules } from './review.ts';
import { allGoals, dropGoal, goalUpdated, loadGoal, publicGoal, saveGoal, type Judged, type RestoreMark, type StoredGoal } from './store.ts';
import { goalDefaults } from './settings.ts';
import { cleanContract, cleanSettings, topId } from './validate.ts';
import { allButYouHold, duration, limitReason, reckon, rejudged, relaxed, scored, scoreOf, stalled, usd, type RoundInput } from './verdict.ts';

export const NO_GOAL = 'This session has no goal.';
/** S6: what a swarm member hears when it calls a goal tool while its lead has a goal. */
export const LEADS_GOAL = 'This goal is your lead’s: post what you found to the swarm board with swarm_post, and it reaches the lead.';
const PAUSED = 'The user paused the goal: stop now and end your turn.';
/** How often the tick runs. */
export const TICK_MS = 15_000;
/** How often the limit's wait for the agent (and a swarm's members) to stop looks again, 60 looks at most; tests wait less (null puts it back). */
let limitWaitStep = 500;
/** Tests: called after each look of the limit's wait, with its number. */
let limitLook: ((i: number) => void) | undefined;
export const setLimitLook = (fn: ((i: number) => void) | null) => (limitLook = fn ?? undefined);
/** How many looks the limit's wait gives the agent (and a swarm's members) to stop: 30 s at 500 ms. */
const LIMIT_LOOKS = 60;
/** And the commands its turn left running (L2): two minutes at 500 ms. */
const LIMIT_LOOKS_COMMANDS = 240;
export const setLimitWaitStep = (ms: number | null) => (limitWaitStep = ms ?? 500);
/** At most this many notes of what was tried and dropped. */
const MAX_DROPPED = 30;
/**
 * How long only background commands (no subagent) may keep a session busy after its last turn ended before the round
 * counts as over: a dev server or a watcher the agent left running never ends by itself. Subagents are always waited for.
 */
export const BACKGROUND_GRACE_MS = 10 * 60_000;
/**
 * How long after a turn its plan's usage limit stopped the loop waits for the app to carry it on by itself (it moves the
 * session to another account, or learns when the limit lifts and schedules it) before it says nothing will.
 */
export const LIMIT_GRACE_MS = 2 * 60_000;
/** Why a check that runs a command cannot run in a confidential session on this computer. */
export const NO_SANDBOX = 'No sandbox on this computer to run it in';
/** How often a goal that is over (and has nothing left to do) is looked at, to drop it a day after its session went. */
const SWEEP_MS = 3600_000;

const rid = () => crypto.randomBytes(4).toString('hex');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** A text from a model, a person or git, without its closing full stop: put into a sentence that ends with one of its own. */
const bare = (s: string) => s.trim().replace(/[.!?…]+$/, '');

// ---- the state, saved and sent -------------------------------------------------------------------------------

/** Where a goal's time counts as work: a round runs, or its checks do. */
const ACTIVE: GoalStatus[] = ['working', 'checking'];

/** Moves a goal to a status, counting its active time. */
function setStatus(g: StoredGoal, s: GoalStatus, now = Date.now()) {
  if (g._.activeSince != null) {
    g.activeMs += Math.max(0, now - g._.activeSince);
    g._.activeSince = undefined;
  }
  if (ACTIVE.includes(s)) g._.activeSince = now;
  g.status = s;
  // Waiting for the session's queue is the one status queueOnHold sets (after this): any other move ends that wait, so a
  // mark left from it can never send the goal back to work later from a question (J3).
  g._.heldQueue = undefined;
  g._.heldFrom = undefined;
  // Pause pressed while a round ran (pausesHere) holds only while that round runs or is checked: paused for any other
  // reason, waiting on the person, over, it goes, and never outlives the round (P1).
  if (s !== 'working' && s !== 'checking') g.pausing = undefined;
  if (goalOver(s)) {
    g.endedAt ??= now;
    g.round = undefined;
  }
}

/** Its time at work so far, the stretch in progress too. */
const activeNow = (g: StoredGoal, now = Date.now()) => g.activeMs + (g._.activeSince != null ? Math.max(0, now - g._.activeSince) : 0);

/** Sessions whose spending could not be read, said once in the log each. */
const unreadSpend = new Set<string>();

/**
 * What the session (and its Hydor subagents) have spent, at API prices; null when it could not be read. Never 0 for an
 * error: that would let a goal run on past its money limit while the reading fails, and make the next good reading
 * look like all of it was spent at once.
 */
function spentNow(d: Deps, key: string): number | null {
  try {
    const v = spending(d.db, key).spentUsd;
    unreadSpend.delete(key);
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    if (!unreadSpend.has(key)) console.warn(`[goal] ${key}: its spending could not be read: ${(e as Error).message}`);
    unreadSpend.add(key);
    return null;
  }
}

/** Whether some of the session's spending has no price (a model without one): the money limit cannot see it. */
function unpriced(d: Deps, key: string): boolean {
  try {
    return spending(d.db, key).unpriced;
  } catch {
    return false;
  }
}

/** Said while the person agrees to a money limit the session's spending cannot be counted against. */
export const UNPRICED = 'This session’s spending is not priced, so the money limit cannot stop it: rounds and time still do';

/** What the agreement says of the money limit: that it cannot stop this session (its spending has no price), or nothing. */
const agreeNote = (d: Deps, g: StoredGoal) => (g.contract.limits.usd != null && unpriced(d, g.key) ? UNPRICED : undefined);

/**
 * Each check's output (its detail) is kept for the start, the best round and the last three rounds only: the state is
 * saved and sent whole at every change, and fifty rounds of twelve checks of 1500 characters would make each save
 * close to a megabyte. Older rounds keep each check's value, whether it held and its error.
 */
function trimDetails(g: StoredGoal) {
  const keep = new Set([0, g.best, ...g.rounds.slice(-3).map((r) => r.n)]);
  for (const r of g.rounds) {
    if (keep.has(r.n) || !r.results.some((x) => x.detail != null)) continue;
    r.results = r.results.map(({ detail: _detail, ...x }) => x);
  }
}

/** Saves the goal, tells the open pages (the "goal" feature event) and the session's summary. */
function commit(d: Deps, g: StoredGoal) {
  const spent = spentNow(d, g.key);
  if (spent != null) {
    // Set while its spending could not be read: counted from the first time it can be.
    if (g._.spendUnread) {
      g._.spentAtStart = spent - g.spentUsd;
      g._.spendUnread = undefined;
    }
    g.spentUsd = Math.max(0, spent - g._.spentAtStart);
  }
  trimDetails(g);
  saveGoal(d.db, g);
  d.broadcast({ t: 'feature', id: 'goal', key: g.key, data: { goal: publicGoal(g) } });
  d.sessions.queueSummary(g.key);
}

function drop(d: Deps, key: string) {
  dropGoal(d.db, key);
  d.broadcast({ t: 'feature', id: 'goal', key, data: { goal: null } });
  d.sessions.queueSummary(key);
}

/** The same goal read again after something that took a while: null when it was replaced or dropped meanwhile. */
function fresh(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>): StoredGoal | null {
  const f = loadGoal(d.db, g.key);
  return f && f.id === g.id ? f : null;
}

/** Keeps a field of the loop's own on the stored goal, without telling anyone (nothing the person sees changed). */
function remember(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, set: (f: StoredGoal) => void) {
  const f = fresh(d, g);
  if (!f) return;
  set(f);
  saveGoal(d.db, f);
}

function notify(d: Deps, key: string, kind: NotifyEvent['kind'], body: string) {
  const s = d.sessions.summary(key);
  if (s) d.sessions.emit('notify', { key, kind, title: s.title, body: clip(body.replace(/\s+/g, ' ').trim(), 200), agent: s.agent, at: Date.now() } satisfies NotifyEvent);
}

// ---- the session ---------------------------------------------------------------------------------------------

const IN_PLAN = 'The session is in Plan mode, where it changes nothing: switch to another mode first.';
const IN_SUBAGENT = 'A Hydor subagent cannot have a goal of its own: set it on the session that started it.';

/**
 * Why a session that leads a team cannot have a goal, or null. A swarm may (swarm rounds: a round is the whole team's
 * work in the lead's folder, which the checks judge). A campaign may not (its members work in worktrees of their own and
 * the lead merges commits: a round could not be undone), nor a deep research or an arena match, whose own ends do not go
 * with a goal's. Asked when a goal is set (refusal), at a session's start with one (goalStartRefusal), and when the
 * session's settings change while it has one (goalTeamChange).
 */
export function teamRefusal(extra: SessionSummary['extra']): string | null {
  if (extra?.swarm === 'campaign') return 'This session leads a campaign: a goal works with a swarm, not with a campaign yet.';
  if (extra?.research) return 'This session leads a deep research: a goal does not go with it.';
  if (extra?.arena) return 'This session is in an arena match: a goal does not go with it.';
  return null;
}

/** Whether the session leads a swarm (not a campaign): its goal's rounds are the whole team's work. */
const leadsSwarm = (d: Pick<Deps, 'db'>, key: string) => sessionExtra(d.db, key).swarm === true;

/**
 * S1: why a change of the session's settings (PATCH /api/sessions/:key/extra) is refused while its goal is not over, or
 * null: a campaign, a deep research or an arena match turned on. A swarm turned on or off is not: it counts from the
 * loop's next message.
 */
export function goalTeamChange(db: DB, key: string, patch: Record<string, unknown>): string | null {
  const g = loadGoal(db, key);
  // A goal at its limit is not over for this (M6): Give it more… can still carry it on.
  if (!g || (goalOver(g.status) && g.status !== 'limit')) return null;
  const on = (v: unknown) => v != null && v !== false && v !== '';
  if (patch.swarm === 'campaign' || on(patch.research) || on(patch.arena)) return 'This session has a goal: stop the goal first, or lead a swarm with it.';
  return null;
}

/** Why a goal cannot be set in this session, or null. */
export function refusal(s: SessionSummary): string | null {
  if (s.subagentOf) return 'A subagent works inside the session that started it: set the goal there.';
  if (s.extra?.parent) return IN_SUBAGENT;
  const team = teamRefusal(s.extra);
  if (team) return team;
  if (s.external) return `This session runs in ${s.external.client}, outside the app: continue it here first.`;
  const mode = s.live?.mode ?? s.prefs?.mode;
  if (mode === 'plan' || (s.agent === 'codex' && mode === 'read-only')) return IN_PLAN;
  return null;
}

/**
 * Why a session about to be created with a goal (the start page's Goal option) cannot have it, decided before its agent
 * starts so that the draft's instructions do not go with its first message: a Hydor subagent, a team that cannot have one
 * (a campaign, a deep research, an arena match: teamRefusal), Plan mode, or no message to take as the goal. Null when it
 * can; the person hears why when it cannot (goalNotSetText).
 */
export function goalStartRefusal(o: { request: string; parent?: unknown; mode?: string; agent: string; extra?: SessionSummary['extra'] }): string | null {
  if (o.parent) return IN_SUBAGENT;
  const team = teamRefusal(o.extra);
  if (team) return team;
  if (o.mode === 'plan' || (o.agent === 'codex' && o.mode === 'read-only')) return IN_PLAN;
  if (!o.request.trim()) return 'The session started without a message to take as the goal.';
  return null;
}

/** What the person hears when a session they started with a goal could not have it. */
export const goalNotSetText = (reason: string) => `The goal was not set: ${lower(reason)}`;

/** The session's folder, and its worktree when rounds can be undone there. */
function place(d: Deps, key: string, g?: Pick<StoredGoal, 'undo'>): { s: SessionSummary; cwd: string; w?: WorktreeInfo } | null {
  const s = d.sessions.summary(key);
  const cwd = s?.cwd ?? s?.worktree?.path;
  if (!s || !cwd) return null;
  return { s, cwd, ...(s.worktree && (!g || g.undo) ? { w: s.worktree } : {}) };
}

/** Whether the session's agent is in a turn, by its key. */
const liveBusyKey = (d: Deps, key: string) => {
  const s = d.sessions.summary(key);
  return !!s && liveBusy(s);
};

/** The session's agent is in a turn, starting, stopping or waiting for an answer. */
const liveBusy = (s: SessionSummary) => {
  const st = s.live?.status;
  return st === 'working' || st === 'waiting' || st === 'starting' || st === 'stopping';
};

/**
 * The session has ended its turn and has nothing else at work: no message waiting or being handed to its agent, no
 * subagent still running, and no background command, unless only background commands have kept it busy for
 * BACKGROUND_GRACE_MS since its last turn ended (a dev server left running: the checks run anyway).
 */
export function idle(d: Deps, key: string, now = Date.now(), o: { heldQueue?: boolean } = {}): boolean {
  const s = d.sessions.summary(key);
  if (!s) return false;
  // A queue on hold (`heldQueue`) sends nothing by itself: no turn begins until the person presses Resume there.
  if (s.queue?.length && !(o.heldQueue && s.queueHeld)) return false;
  return !atWork(d, s, now);
}

/**
 * A session's live work: its turn, a message on its way to its agent (taken off the queue, or sent: its status says
 * working only seconds later), its subagents, or background commands within BACKGROUND_GRACE_MS of its last turn, and
 * as those, commands its turn started that still run after it (Codex: openCommands; a dev server left running is waited
 * for no longer than a background task). Not what waits in its queue.
 */
function atWork(d: Deps, s: SessionSummary, now = Date.now(), seen = new Set<string>()): boolean {
  if (liveBusy(s) || d.sessions.delivering?.(s.key)) return true;
  seen.add(s.key);
  // Its program's own subagents; its Hydor subagents by their own work (M2): one in a turn, starting, waiting or being
  // stopped (SessionManager.stop's stopping, which the running children leave out) is at work; one whose only work left
  // is background commands gets the same grace as the session's own, from its last turn's end, or a dev server one of
  // them left running would hold the round for ever (the session manager counts it among the running children as long as
  // it runs). For every session with a goal (M5).
  const own = stillAtWork({ ...s, helpers: 0 });
  if (own.subagents) return true;
  const kids = childKeys(d.db, s.key);
  if (!kids.length && s.helpers) return true;
  for (const k of kids) {
    const c = seen.has(k) ? null : d.sessions.summary(k);
    if (c && atWork(d, c, now, seen)) return true;
  }
  return (!!own.background || !!s.live?.openCommands) && now - (s.endedAt ?? now) < BACKGROUND_GRACE_MS;
}

/** L2: how many commands the session's agent started still run (Codex keeps an interrupted turn's commands running). */
const openCommands = (d: Deps, key: string) => d.sessions.summary(key)?.live?.openCommands ?? 0;

/** Whether a check runs a command: a command or a measured number, or a review that reads a command's output. */
export const runsCommand = (c: GoalCheck): boolean => c.kind === 'command' || c.kind === 'measure' || (c.kind === 'review' && !!c.evidence?.run?.trim());

/**
 * Whether the app may run the agent's proposed commands before the person agreed to them: only where the session's
 * agent runs anything without asking anyway (Claude Code's Bypass, Codex's and Custom's Full access), and never in a
 * confidential session (the checks run outside its sandbox). A mode not known asks.
 */
export function runsUnasked(d: Deps, key: string): boolean {
  const s = d.sessions.summary(key);
  if (!s || confidentialKey(d.db, key)) return false;
  return neverAsks(modeFamily(s.agent, s.acpAgent), s.live?.mode ?? s.prefs?.mode);
}

/** The app's sandbox as the checks use it: whether it can cut the network here, and the wrapper for a command. Tests put their own in. */
interface CheckBox {
  netCut(): boolean;
  shell(cwd: string, mode: string, confidential: boolean): Promise<((command: string) => Shell) | undefined>;
}
const realBox: CheckBox = { netCut: () => !!sandboxAvailable() && netCutAvailable(), shell: sandboxShell };
let box: CheckBox = realBox;
/** Tests put a sandbox of their own in place of the app's; null puts it back. */
export const setCheckSandbox = (b: Partial<CheckBox> | null) => (box = b ? { ...realBox, ...b } : realBox);

/**
 * How a goal's check commands run in a session: as the session's agent's own commands would, never more freely. (Codex
 * below Full access: also without network, unless its sandbox policy allows it.) The
 * person agreed to these commands, but `npm test` runs code the agent wrote, so agreeing to the checks must not be a way
 * out of what the session's agent is kept to.
 * - A confidential session promises that nothing it runs reaches the network: its checks run in the app's sandbox
 *   without network (kept to the folder too where its agent's commands are), and where this computer has no such
 *   sandbox they cannot run at all.
 * - Custom: through the wrapper its own Bash tool gets in its mode (sandboxShell): kept to its folder in Auto when
 *   Settings → Custom's sandbox is on; as they are in its other modes, as its own commands are.
 * - Codex below Full access runs its commands in a sandbox of its own: its checks go in the app's, kept to the folder,
 *   where this computer has one.
 * - Otherwise (Claude Code, Codex at Full access, other ACP agents) as they are, as the agent's own commands run.
 */
export async function checkRunner(d: Deps, key: string, cwd: string): Promise<{ shell?: (command: string) => Shell; noRun?: string }> {
  const s = d.sessions.summary(key);
  const mode = s?.live?.mode ?? s?.prefs?.mode;
  const family = s ? modeFamily(s.agent, s.acpAgent) : null;
  const customWalls = family === 'custom' && mode === 'auto' && customSettings(d.db).sandbox;
  const codexWalls = family === 'codex' && !neverAsks('codex', mode);
  // Codex's own sandbox keeps its commands off the network below Full access unless its settings allow it: so do its checks.
  const codexCut = codexWalls && !d.sessions.codexNetwork?.(key) && box.netCut();
  if (confidentialKey(d.db, key)) {
    if (!box.netCut()) return { noRun: NO_SANDBOX };
    // sandboxShell keeps a command to its folder in 'auto' (walls) and cuts the network for a confidential one in any mode.
    const shell = await box.shell(cwd, customWalls || codexWalls ? 'auto' : 'confidential', true).catch(() => undefined);
    return shell ? { shell } : { noRun: NO_SANDBOX };
  }
  if (customWalls || codexWalls) {
    const shell = await box.shell(cwd, 'auto', codexCut).catch(() => undefined);
    return shell ? { shell } : {};
  }
  return {};
}

/** Sends the loop's message (queued after the person's own, when there are some). False, and the goal paused, when it could not go. */
async function say(d: Deps, g: StoredGoal, text: string, o: { again?: boolean } = {}): Promise<boolean> {
  // Kept to send again once if a restart of the app cuts the agent's turn short (the original, not the copy sent again).
  if (!o.again) remember(d, g, (f) => (f._.lastMessage = text));
  // What its queue held while the goal was stopped or paused goes first, then this message after it (R5). S2: queued
  // behind what was held, and the queue let go once, so the session manager sends them in order, one a turn. Sent beside
  // the queue's dispatch (which takes a moment, the agent still idle meanwhile), this message could go first or with the
  // news, and the end of the turn on the news be taken for the round's. While it waits in the queue the session is not
  // idle, so nothing takes it for a message that never went out (quiet's two minutes count once the queue is empty).
  // Only where the agent runs: a queue goes to a running agent, so one that is not running starts with this message
  // (sent below) and takes what was held at that turn's end.
  if (fresh(d, g)?._.releaseHeld) {
    remember(d, g, (f) => (f._.releaseHeld = undefined));
    if (heldNewsOnly(d, g.key)) {
      let queued = false;
      if (d.sessions.summary(g.key)?.live) {
        try {
          d.sessions.enqueue(g.key, text, [], [], true);
          queued = true;
        } catch {
          // Not queued: sent as any message below.
        }
      }
      d.sessions.resumeQueue(g.key);
      if (queued) return true;
    }
  }
  try {
    await d.sessions.deliverOrQueue(g.key, text);
    return true;
  } catch (e) {
    const f = fresh(d, g);
    if (f && !goalOver(f.status)) {
      // Nothing ran: Resume starts the round (or the question) again.
      f.round = undefined;
      f._.roundBase = undefined;
      f._.askTurn = false;
      pause(d, f, `Its message could not be sent: ${clip(bare((e as Error).message), 200)}. Resume to try again.`, { notice: true });
    }
    return false;
  }
}

// ---- one step at a time --------------------------------------------------------------------------------------

/** Sessions whose goal a step is driving now: a turn's end, the tick or an action finds it busy and leaves it. */
const driving = new Set<string>();
/** Steps the tick started without waiting for them (settled() waits for them, for the tests). */
const started = new Set<Promise<unknown>>();

async function drive(key: string, fn: () => Promise<void>): Promise<boolean> {
  if (driving.has(key)) return false;
  driving.add(key);
  try {
    await fn();
  } finally {
    driving.delete(key);
  }
  return true;
}

/** Starts a step without waiting for it: its errors go to the log. */
function launch(key: string, p: Promise<unknown>) {
  const q = p.catch((e) => console.error(`[goal] ${key}: ${(e as Error).message}`)).finally(() => started.delete(q));
  started.add(q);
}

/** Whether a step is at work on the session's goal (for tests and the routes). */
export const isDriving = (key: string) => driving.has(key);

/**
 * Why "Edit from here" may not put the session's files back now, or null (I5): its goal is at a step (checking a round,
 * putting files back, measuring) or has a reset under way. That reset is the app's only one outside the loop: it would
 * move the files under the loop's feet.
 */
export function goalResetRefusal(db: DB, key: string): string | null {
  if (driving.has(key)) return 'This session’s goal is checking its files right now: wait for it to finish, or pause the goal first';
  if (loadGoal(db, key)?._.restoreTo) return 'This session’s goal is putting its files back: wait for it to finish';
  return null;
}

/** Waits until every step the tick (or an action) started without waiting has ended, those they start too. For the tests. */
export async function settled() {
  while (started.size) await Promise.allSettled([...started]);
}

// ---- putting files back --------------------------------------------------------------------------------------
//
// Putting files back (git's hard reset and clean of the folder) is the one thing the loop does that could lose someone's
// work, so it happens in two places only, both through putBack: an undone round (checkStep), under the conditions of I1,
// and the person's say on a round (sayOnRound), under those of I4. Nothing is put back after a limit, and a reset that
// fails or that a restart cut is never tried a second time: the goal pauses once, everything that was in the folder is
// saved in the round's checkpoint, and the person decides (unfinished).

/**
 * Every session other than `key` whose folder is `folder` or lies inside it: by its folder (cwd: a fork and a Hydor
 * subagent without a worktree of their own leave the worktree column empty), or by its worktree. Archived ones too:
 * archiving does not stop an agent. This session's own Hydor subagents are among them, and sessions the app did not
 * start (a terminal, VS Code) as its index knows them.
 */
function sessionsIn(d: Deps, key: string, folder: string): string[] {
  const inside = (p: string | null | undefined) => !!p && (p === folder || p.startsWith(folder.endsWith(path.sep) ? folder : folder + path.sep));
  const out = new Set<string>();
  for (const r of d.db.prepare('select key, cwd, worktree from app_sessions where key != ? and (instr(cwd, ?) = 1 or worktree is not null)').all(key, folder) as { key: string; cwd: string | null; worktree: string | null }[]) {
    let wt: string | undefined;
    try {
      wt = r.worktree ? (JSON.parse(r.worktree) as WorktreeInfo | null)?.path : undefined;
    } catch {}
    if (inside(r.cwd) || wt === folder) out.add(r.key);
  }
  for (const r of d.db.prepare('select key, cwd from sessions where key != ? and instr(cwd, ?) = 1').all(key, folder) as { key: string; cwd: string | null }[]) if (inside(r.cwd)) out.add(r.key);
  return [...out];
}

/** Another session's own live work: its turn, a message on its way, its subagents, or (in a terminal or VS Code) its turn there. */
const othersWork = (d: Deps, s: SessionSummary) => atWork(d, s) || (!!s.external && s.external.status !== 'idle');

/**
 * Whether a session worked after `at`, from what can be read at once: a turn that began since (its live state) or ended
 * since (its summary's end time, which the app writes about two seconds after the turn ends: the transcript's items,
 * read by workedSince, cover that gap).
 */
const workedSinceNow = (s: SessionSummary, at: number) => (s.live?.turnStartedAt ?? 0) > at || (s.endedAt ?? 0) > at;

/** The same, with the session's transcript too: a message that began a turn, or a turn that ended, after `at`. */
async function workedSince(d: Deps, s: SessionSummary, at: number): Promise<boolean> {
  if (workedSinceNow(s, at)) return true;
  // Only a session that runs (or whose transcript changed lately) can have a turn since: the others' transcripts stay unread.
  if (!s.live && !s.external && (s.updatedAt ?? 0) < at - 60_000) return false;
  const items = (await d.sessions.timeline(s.key).catch(() => null))?.parser.items ?? [];
  return items.some((it) => (it.ts ?? 0) > at && (opensTurn(it) || it.kind === 'turn'));
}

/**
 * Whether a Hydor subagent of the session has a turn whose report has not reached it yet (server/children marks each
 * child's last reported turn as extra.reported): between a subagent's turn ending and its report arriving (seconds to
 * minutes) its lead is not done. Also while a report is being written (L3: reportTurn marks the turn reported before it
 * sends it, and a long reply is summarized first, up to a minute): the round would be checked, and judged, without what
 * the subagent brought. Turns that ended more than ten minutes ago are left out (a report that never comes, as for a
 * confidential subagent of a session that is not, must not hold the goal for ever).
 */
export async function reportsPending(d: Deps, key: string, now = Date.now()): Promise<boolean> {
  for (const k of childKeys(d.db, key)) {
    const s = d.sessions.summary(k);
    if (!s) continue;
    if (confidentialKey(d.db, k) && !confidentialKey(d.db, key)) continue;
    if (reportOnItsWay(k)) return true;
    if (liveBusy(s) || (s.endedAt ?? 0) < now - 10 * 60_000) continue;
    const turn = lastTurn((await d.sessions.timeline(k).catch(() => null))?.parser.items ?? []);
    if (turn?.prompt && turn.status && sessionExtra(d.db, k).reported !== turn.prompt.id) return true;
  }
  return false;
}

/**
 * Who keeps the files from being put back: this session or one of its own Hydor subagents (at work now, or since the
 * moment that counts for them), another session in the folder (by its title), a commit made since, or (for the person's
 * say) files that are not the ones the loop last left there.
 */
export type Hold = { by: 'self'; now?: boolean } | { by: 'other'; who: string } | { by: 'commit' } | Edited | { by: 'git'; why: string };

/**
 * Files changed outside the goal since it last left them (`at`, a checkpoint): which (relative to the worktree's top
 * folder, `top`), and of those, which the folder has now (`here`), which the goal's files have (`left`) and which the
 * last commit has (`committed`: a stash of a path leaves that version in the folder), unless git could not say.
 */
type Edited = { by: 'edited'; paths: string[]; top: string; at: string; here?: string[]; left?: string[]; committed?: string[] };

/** When the looks count from: this session and its own subagents (`self`), every other session in the folder (`others`); unset: at work now only. */
interface Since {
  self?: number;
  others?: number;
}

/**
 * The look after the safety checkpoint, for what needs reading over time: a subagent of this session with a report on its
 * way, a turn of this session or of one of its own subagents since `since.self`, a turn of another session in the
 * folder since `since.others` (live state, summary's end time, transcript).
 */
async function whoHolds(d: Deps, key: string, w: WorktreeInfo, since: Since): Promise<Hold | null> {
  const self = d.sessions.summary(key);
  if (!self || (await reportsPending(d, key))) return { by: 'self', now: true };
  if (since.self != null && (await workedSince(d, self, since.self))) return { by: 'self' };
  const kids = new Set(childKeys(d.db, key));
  for (const k of sessionsIn(d, key, w.path)) {
    const s = d.sessions.summary(k);
    const at = kids.has(k) ? since.self : since.others;
    if (s && at != null && (await workedSince(d, s, at))) return kids.has(k) ? { by: 'self' } : { by: 'other', who: s.title || k };
  }
  return null;
}

/**
 * The last look, right before the reset with nothing awaited in between, for what is true now: this session not quiet
 * (a turn, a message waiting or on its way, a subagent at work), another session in the folder at work, and the clocks
 * that can be read at once for a turn since the moments that count.
 */
function holdsNow(d: Deps, key: string, w: WorktreeInfo, since: Since): Hold | null {
  const self = d.sessions.summary(key);
  if (!self || !idle(d, key)) return { by: 'self', now: true };
  if (since.self != null && workedSinceNow(self, since.self)) return { by: 'self' };
  const kids = new Set(childKeys(d.db, key));
  for (const k of sessionsIn(d, key, w.path)) {
    const s = d.sessions.summary(k);
    if (!s) continue;
    const at = kids.has(k) ? since.self : since.others;
    if (othersWork(d, s) || (at != null && workedSinceNow(s, at))) return kids.has(k) ? { by: 'self', now: true } : { by: 'other', who: s.title || k };
  }
  return null;
}

/** Restores in progress, by session: a message to its agent waits for its end (the feature's beforeSend). */
const restoring = new Map<string, Promise<unknown>>();

/**
 * Waits for a restore of the session's files in progress, if any, so no message starts its agent halfway through one:
 * its own, or (M8) that of the session that started it, and so on up, whose folder its Hydor subagents work in (a
 * member woken during the reset would write in a folder being reset, and what it wrote could be wiped, not saved).
 * Another session in the folder is caught by the looks before the reset. Not for long: the reset's four git steps give
 * up after two minutes each.
 */
export async function restoreSettled(key: string, db?: DB) {
  for (const k of [key, ...(db ? ancestorsOf(db, key) : [])]) await restoring.get(k)?.catch(() => {});
}

/** How the loop saves the folder in a checkpoint; tests do something while it runs (null puts it back). */
let checkpoint: (w: WorktreeInfo) => Promise<string | null> = takeCheckpoint;
export const setCheckpointer = (fn: typeof checkpoint | null) => (checkpoint = fn ?? takeCheckpoint);

/** The git steps that put files back; tests put a slow or failing one in its place (null puts it back). */
let restorer: (w: WorktreeInfo, commit: string) => Promise<void> = restoreCheckpoint;
export const setRestorer = (fn: typeof restorer | null) => (restorer = fn ?? restoreCheckpoint);

/** What putBack did: put back (with the safety checkpoint), held (who), or could not (the goal moved on, nothing saved, the reset failed). */
type PutBack = { ok: true; safety: string } | { ok: false; held: Hold } | { ok: false; cause: 'gone' | 'unsaved' } | { ok: false; cause: 'failed'; why: string };

/**
 * The one way files are put back, in this order:
 * 1. the safety checkpoint: the folder as it is now, saved (none taken: nothing is put back);
 * 2. the look over time (whoHolds: turns since the moments the caller gives, a subagent's report on its way); then the
 *    commit under the safety checkpoint must be `head` (the commit the files stood on), and for the person's say its
 *    files must be those of `files` (where the loop last left them);
 * 3. the mark, written into the goal's state with the safety checkpoint as the round's own (`record`), so that a restart
 *    from here finds it (unfinished);
 * 4. the last look (holdsNow: this session quiet, nobody else at work, and the clocks again), with nothing awaited between
 *    it and the reset;
 * 5. the reset. On success the mark goes and "where the loop left the files" is where they went; the caller gets the
 *    safety checkpoint. On failure the goal pauses once (unfinished): it is never tried a second time.
 * The goal must still be this one, in `status` (null: any).
 */
async function putBack(
  d: Deps,
  g: Pick<StoredGoal, 'key' | 'id'>,
  o: { w: WorktreeInfo; to: string; n: number; by: RestoreMark['by']; status: GoalStatus | null; since: Since; head?: string; files?: string; record?: GoalRound; target?: number },
): Promise<PutBack> {
  // A git too old to put files back (worktrees.ts restoreRefusal): nothing is saved, marked or touched.
  const old = await restoreRefusal(o.w.path);
  if (old) return { ok: false, held: { by: 'git', why: old } };
  const safety = await checkpoint(o.w).catch(() => null);
  if (!safety) return { ok: false, cause: 'unsaved' };
  const held = await whoHolds(d, g.key, o.w, o.since);
  if (held) return { ok: false, held };
  if (o.head && (await parentOf(o.w.path, safety)) !== o.head) return { ok: false, held: { by: 'commit' } };
  // The files must be those the loop last left (`files`, a checkpoint): which differ, for the person to put aside.
  if (o.files && (await treeOf(o.w.path, safety)) !== (await treeOf(o.w.path, o.files))) return { ok: false, held: await edited(o.w.path, o.files, safety) };
  const mark: RestoreMark = { to: o.to, n: o.n, by: o.by, at: Date.now(), safety, ...(o.record ? { record: { ...o.record, checkpoint: safety } } : {}), ...(o.target != null ? { target: o.target } : {}) };
  const f = fresh(d, g);
  if (!f || (o.status && f.status !== o.status)) return { ok: false, cause: 'gone' };
  f._.restoreTo = mark;
  saveGoal(d.db, f);
  const again = holdsNow(d, g.key, o.w, o.since);
  if (again) {
    remember(d, g, (x) => (x._.restoreTo = undefined));
    return { ok: false, held: again };
  }
  const p = restorer(o.w, o.to);
  restoring.set(g.key, p);
  try {
    await p;
  } catch (e) {
    const why = clip(bare((e as Error).message), 200);
    await unfinished(d, g, o.w, why);
    return { ok: false, cause: 'failed', why };
  } finally {
    if (restoring.get(g.key) === p) restoring.delete(g.key);
  }
  remember(d, g, (x) => {
    x._.restoreTo = undefined;
    x._.filesAt = o.to;
    x._.leftAt = Date.now();
  });
  return { ok: true, safety };
}

/** Which files differ between where the goal left them (`at`) and the folder as it is (`now`), and which of them each has (K1). */
async function edited(top: string, at: string, now: string): Promise<Edited> {
  const paths = await changedPaths(top, at, now).catch(() => []);
  // Only for the files a sentence names one by one (editedText): the commands for more cover the whole folder.
  if (!paths.length || paths.length > 10) return { by: 'edited', paths, top, at };
  try {
    // The folder stands on the commit under `at` (putBack looked at that first).
    const [here, left, committed] = await Promise.all([pathsIn(top, now, paths), pathsIn(top, at, paths), pathsIn(top, `${at}^`, paths)]);
    const of = (set: Set<string>) => paths.filter((p) => set.has(p));
    return { by: 'edited', paths, top, at, here: of(here), left: of(left), committed: of(committed) };
  } catch {
    return { by: 'edited', paths, top, at };
  }
}

/** Who held the files, in words: "another session (“Fork”) was working in the folder". */
function holdText(h: Hold): string {
  if (h.by === 'other') return `another session (“${clip(h.who, 80)}”) was working in the folder`;
  if (h.by === 'commit') return 'a commit was made in the folder meanwhile';
  if (h.by === 'edited') return 'the folder was changed outside the goal';
  if (h.by === 'git') return h.why.charAt(0).toLowerCase() + h.why.slice(1);
  return 'this session was working in the folder meanwhile';
}

/**
 * I2's sentence: a reset that did not finish, what is saved where, and what Resume does. `back`: the round whose files are
 * exactly the safety checkpoint's (Keep anyway on it brings them back); null when no round's are (J7: a say's safety
 * checkpoint holds where the loop last left the files, which may be no round's, after an ask turn that changed them),
 * and the sentence names the checkpoint itself and the command that brings it back.
 */
function unfinishedText(m: RestoreMark, back: number | null, top: string): string {
  const c = m.safety.slice(0, 12);
  // K2: `:/` is the whole worktree from anywhere in it (a session may work in a subfolder of it).
  const where = back == null ? ` as checkpoint ${c}: git restore --source=${c} -- :/ run in ${shellQuoted(top)} (the worktree’s top folder, or anywhere in it) brings it back` : `: Keep anyway… on ${back ? `round ${back}` : 'the start'} brings it back`;
  return `Putting round ${m.target ?? m.n}’s files back did not finish, so the files may be partly put back. Everything that was in the folder is saved${where}. Resume goes on from the files as they are.`;
}

/** Whether a say's safety checkpoint holds exactly the files of the goal's best round (or the start), so Keep anyway on it brings them back. */
async function bestHolds(g: StoredGoal, w: WorktreeInfo, m: RestoreMark): Promise<boolean> {
  const c = g.rounds.find((r) => r.n === (g.best ?? 0))?.checkpoint;
  if (!c) return false;
  try {
    return (await treeOf(w.path, c)) === (await treeOf(w.path, m.safety));
  } catch {
    return false;
  }
}

/**
 * I2: a reset failed (`why`), or a restart cut it (the tick found its mark): the same end for every caller, and no second
 * try. The round it was for is recorded as it stands (it stays, its checkpoint the safety one: Keep anyway on it brings
 * back everything that was in the folder), "where the loop left the files" is the folder as it is now, the mark goes, and
 * the goal pauses once with I2's sentence (Resume goes on from the files as they are). A goal that is over stays over:
 * the sentence goes into its report.
 */
async function unfinished(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, w: WorktreeInfo, why?: string) {
  const here = await checkpoint(w).catch(() => null);
  // J7: for a say, whether the best round's files are those saved (read before the goal is read to change: nothing is
  // awaited after that). Its best round may not change in between: this runs inside the goal's step, or the tick's.
  const pre = fresh(d, g);
  const same = pre?._.restoreTo?.by === 'say' ? { best: pre.best, holds: await bestHolds(pre, w, pre._.restoreTo) } : null;
  const f = fresh(d, g);
  const m = f?._.restoreTo;
  if (!f || !m) return;
  f._.restoreTo = undefined;
  if (here) {
    f._.filesAt = here;
    f._.leftAt = Date.now();
  }
  if (m.by === 'undo' && m.record) {
    const r: GoalRound = { ...m.record, outcome: 'stays', why: [m.record.why && bare(m.record.why), `Putting its files back did not finish${why ? ` (${why})` : ''}`].filter(Boolean).join('. ') };
    f.rounds = [...f.rounds.filter((x) => x.n !== r.n), r].sort((x, y) => x.n - y.n);
    if (r.results.length) f.best = r.n;
    if (f.round === r.n) {
      f.round = undefined;
      f._.report = undefined;
      f._.way = undefined;
      f._.roundBase = undefined;
      f._.rechecks = undefined;
    }
    applyPending(f);
  }
  const back = m.by === 'undo' ? m.n : same?.holds && same.best === f.best ? (f.best ?? 0) : null;
  const text = unfinishedText(m, back, w.path);
  f._.unfinished = text;
  f._.running = undefined;
  if (goalOver(f.status)) {
    f.report = { ...(f.report ?? { summary: '' }), summary: [f.report?.summary, text].filter(Boolean).join(' ') };
    return commit(d, f);
  }
  pause(d, f, text, { notice: true });
}

// ---- the checks ----------------------------------------------------------------------------------------------

/**
 * What changed since the goal started: from round 0's checkpoint (to `now`, or to the files as they are), else (outside a
 * worktree) from the commit it started on, in the session's folder only. Throws when git could not show it.
 */
async function changeSinceStart(g: StoredGoal, cwd: string, w: WorktreeInfo | undefined, now?: string): Promise<string> {
  const c0 = g.rounds[0]?.checkpoint;
  if (w && c0) {
    const to = now ?? (await checkpoint(w).catch(() => null)) ?? undefined;
    return diffText(w.path, c0, to);
  }
  if (g._.baseCommit) return diffText(cwd, g._.baseCommit, undefined, { here: true });
  return '';
}

/** What running the checks needs: where, how (the session's sandbox), the change for a reviewer, and who hears of each command starting. */
function checkContext(d: Deps, g: StoredGoal, p: { cwd: string; w?: WorktreeInfo }, run: { shell?: (command: string) => Shell; noRun?: string }, now?: string): CheckEnv {
  let diff: Promise<string> | null = null;
  return {
    cwd: p.cwd,
    how: {
      shell: run.shell,
      // Kept with the goal, so a restart that cuts the check short can kill what it left running before the check runs again.
      started: (r) => remember(d, g, (f) => (f._.running = r)),
    },
    noRun: run.noRun,
    confirmed: g._.confirmed ?? {},
    diff: () => (diff ??= changeSinceStart(g, p.cwd, p.w, now)),
    review: (claim, evidence) => reviewClaim(d, g.key, claim, evidence),
    asked: (id) => (fresh(d, g) ?? g)._.asked?.[id] ?? [],
    askedMore: (id, added) =>
      remember(d, g, (f) => {
        const all = (f._.asked ??= {});
        all[id] = addAsked(all[id] ?? [], added);
      }),
  };
}

/** Runs checks, and forgets the mark of their command once the run is over, however it ends (only a run cut by a restart keeps it). */
async function runAll(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, checks: GoalCheck[], env: CheckEnv): Promise<GoalResult[]> {
  try {
    return await runChecks(checks, env);
  } finally {
    remember(d, g, (f) => (f._.running = undefined));
  }
}

/**
 * Outside a worktree, what tells a round that changed nothing since the final check: a hash of the change's text and of
 * what the new files git does not track hold (the change names those only).
 */
const changeHash = async (text: string, cwd: string) => crypto.createHash('sha1').update(text).update('\0').update(await untrackedStamp(cwd)).digest('hex');

/** New results go into the rounds named (the start first: where each check starts from), and those rounds are scored again. */
function mergeResults(g: StoredGoal, results: GoalResult[], ns: number[]) {
  for (const n of [...new Set(ns)].sort((a, b) => a - b)) {
    const r = g.rounds.find((x) => x.n === n);
    if (!r) continue;
    const by = new Map(r.results.map((x) => [x.id, x]));
    for (const x of results) by.set(x.id, x);
    const all = [...by.values()];
    const start = n === 0 ? { results: all } : g.rounds[0];
    r.results = scored(g.contract.checks, all, start);
    r.score = scoreOf(g.contract.checks, all, start);
  }
}

/** The highest check id the goal has used: its checks', any round's results', and any it gave before. */
const usedTop = (g: StoredGoal) => Math.max(g._.topId ?? 0, topId(g.contract.checks.map((c) => c.id)), topId((g.pending?.checks ?? []).map((c) => c.id)), topId(g.rounds.flatMap((r) => r.results.map((x) => x.id))));

/**
 * A session's settings say it never starts a goal by itself, without a word: nobody there set one (a scheduled run, a try
 * of an agent's examples). A team that cannot have one is refused with a sentence instead (goalStartRefusal).
 */
export function goalStartIgnored(extra: Record<string, unknown> | undefined): boolean {
  return !!(extra?.automations || extra?.agentExample);
}

/** "All 5 checks hold", "The check holds", and their past for the start. */
const allHold = (n: number, past = false) => (n === 1 ? `The check ${past ? 'held' : 'holds'}` : `All ${n} checks ${past ? 'held' : 'hold'}`);
const listed = (labels: string[]) => (labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0]);

/** What a goal reached through its rounds did to get there, in plain sentences: the last round, the second run, the review, the person. */
function reachedSummary(g: StoredGoal, f: { reran: number; review?: string }): string {
  const n = g.contract.checks.length;
  const again = !f.reran ? '' : f.reran === n ? ', and again on a second run' : `, and the ${f.reran === 1 ? 'one that runs a command' : `${f.reran} that run commands`} again on a second run`;
  const yours = g.contract.checks.filter((c) => c.kind === 'you' && g._.confirmed?.[c.id]).map((c) => `“${c.label}”`);
  return [`${allHold(n)}: in the last round${again}.`, f.review ? 'A review of the whole change found the goal met.' : '', yours.length ? `You confirmed ${listed(yours)}.` : ''].filter(Boolean).join(' ');
}

/** A value with its objects' keys in one order and nothing undefined, so the same thing reads the same however it was written. */
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>)
            .filter(([, x]) => x !== undefined)
            .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;
/**
 * What of a check decides what the app measures: its kind, command, how its number is read, its claim and evidence. Its
 * name, target, slack and unit only say how a value is named, judged or shown, and its time limit how long a run may take
 * (P3): a check changed in those alone measures the same thing.
 */
const measured = ({ label: _label, target: _target, slack: _slack, unit: _unit, timeoutS: _timeoutS, ...c }: GoalCheck) => JSON.stringify(canonical(c));
/** All of a check but its name: whether it changed at all. */
const defined = ({ label: _label, ...c }: GoalCheck) => JSON.stringify(canonical(c));

/**
 * Checks that are new or that measure something else than before (measured): those are measured again, and the start then
 * holds where they stand now, not where they stood at the start (since). A check written with its keys in another order
 * (what the agent proposed and what a change sends are written differently), only renamed, or changed only in how its
 * value is judged (its target, slack, unit, time limit) is not: it keeps its values (retargeted, rejudged).
 */
export function changedChecks(before: GoalCheck[], after: GoalCheck[]): string[] {
  const was = new Map(before.map((c) => [c.id, measured(c)]));
  return after.filter((c) => was.get(c.id) !== measured(c)).map((c) => c.id);
}

/** Checks that measure what they did and whose target changed: their stored values are judged again (rejudged), not measured. */
export function retargeted(before: GoalCheck[], after: GoalCheck[]): string[] {
  const was = new Map(before.map((c) => [c.id, c]));
  return after
    .filter((c) => {
      const b = was.get(c.id);
      return !!b && measured(b) === measured(c) && JSON.stringify(canonical(b.target)) !== JSON.stringify(canonical(c.target));
    })
    .map((c) => c.id);
}

/**
 * Puts the person's checks in place of the goal's (a change, at once or once the round that runs is over, or at the
 * agreement) and says which to measure again (P3). Those that measure something else, and any changed one the start holds
 * no value of to judge again (it could not run there: a longer time limit is how that is put right), are measured again;
 * one changed only in its target keeps its values, judged again against it wherever they are stored and those rounds
 * scored again; a change of name, slack, unit or time limit alone changes nothing that was measured.
 */
function putChecks(g: StoredGoal, after: GoalCheck[]): string[] {
  const before = g.contract.checks;
  const start = g.rounds[0];
  const valued = (id: string) => {
    const r = start?.results.find((x) => x.id === id);
    return !!r && !r.error;
  };
  const was = new Map(before.map((c) => [c.id, defined(c)]));
  const measure = new Set(changedChecks(before, after));
  for (const c of after) if (was.has(c.id) && was.get(c.id) !== defined(c) && start && !valued(c.id)) measure.add(c.id);
  g.contract = { ...g.contract, checks: after };
  g.rounds = rejudged(after, g.rounds, retargeted(before, after).filter((id) => !measure.has(id)));
  return [...measure];
}

/**
 * Checks and protected paths the person changed while a round ran take effect now that it is over (checked, or dropped):
 * that round was judged by the checks it started with; what changed is measured before the next one.
 */
function applyPending(g: StoredGoal) {
  const p = g.pending;
  if (!p) return;
  g.pending = undefined;
  if (p.checks) {
    const changed = putChecks(g, p.checks);
    if (changed.length) g._.remeasure = [...new Set([...(g._.remeasure ?? []), ...changed])];
  }
  if (p.protect) g.contract = { ...g.contract, protect: p.protect };
}

// ---- where it goes next ---------------------------------------------------------------------------------------

function pause(d: Deps, g: StoredGoal, reason: string, o: { notice?: boolean } = {}) {
  if (g.status !== 'paused') {
    g._.pausedFrom = g.status;
    g._.pausedAt = Date.now();
  }
  setStatus(g, 'paused');
  g.reason = reason;
  commit(d, g);
  if (o.notice) notify(d, g.key, 'waiting', `Goal paused: ${reason}`);
}

/** Whether Pause, pressed now, waits for the round at work to be checked (P1): a round runs (not an ask turn), or it is checked. */
const pausesAfterRound = (g: StoredGoal) => (g.status === 'working' && g.round != null && !g._.askTurn) || g.status === 'checking';

/**
 * P1: Pause was pressed while a round ran (pausing): the goal pauses here, with that round recorded, instead of going on
 * (true: the caller stops). Called wherever the loop would go on after a round, each time after the last thing awaited
 * before it acts: what comes after a round (afterRound: before the final check, after it, and before a limit, a
 * question, an ask turn or the next round) and a round that starts (startRound: after its checkpoint). The two places
 * that would send a round's message again after a restart (turnStep, quiet) pause instead.
 */
function pausesHere(d: Deps, g: StoredGoal): boolean {
  if (!g.pausing) return false;
  pause(d, g, 'Paused by you.');
  return true;
}

/** P1: paused where a restart cut the round's turn (or its message never reached the agent): Resume checks what it did. */
const cutWhilePausing = (g: StoredGoal, began: boolean) =>
  began ? `Paused by you. A restart of the app cut round ${g.round}’s turn short: Resume to check what it did.` : `Paused by you. Round ${g.round}’s message did not reach the agent (the app restarted as it was sent): Resume to go on.`;

function reach(d: Deps, g: StoredGoal, o: { summary: string; final?: GoalResult[]; review?: string }) {
  g.question = undefined;
  g.reason = undefined;
  setStatus(g, 'reached');
  g.report = { summary: o.summary, ...(o.final ? { final: o.final } : {}), ...(o.review ? { review: o.review } : {}) };
  commit(d, g);
  notify(d, g.key, 'done', `Goal reached: ${g.contract.title ?? g.contract.objective}`);
}

/**
 * The report of a goal stopped at a limit. A round the limit stopped midway is not put back (I3): its work is still in
 * the folder, recorded as a round of its own, and Keep anyway on the best round puts the files back if the person wants.
 */
function limitSummary(g: StoredGoal, reason: string, mid: number | undefined): string {
  const b = g.best ?? 0;
  if (mid == null) return `${reason}.${g.undo ? ` The files stand at ${b ? `round ${b}, the best so far` : 'the start'}.` : ''}`;
  return `${reason}. Round ${mid} was stopped midway and its work is still in the folder.${g.undo ? ` Keep anyway… on ${b ? `round ${b}` : 'the start'} puts the files back to the best round.` : ''}`;
}

/**
 * The goal stops at a limit. A round it stops midway stays in the folder as the agent leaves it (nothing is put back): it
 * is recorded as a round of its own (stays, "Stopped at the limit midway"), its checkpoint taken once the agent has been
 * stopped (halfRound), and Give it more… goes on from the files as they are.
 */
function atLimit(d: Deps, g: StoredGoal, reason: string) {
  const mid = g.round;
  g.question = undefined;
  if (mid != null) {
    const half: GoalRound = {
      n: mid,
      startedAt: g._.roundStartedAt ?? Date.now(),
      endedAt: Date.now(),
      ...(g._.report?.did ? { did: g._.report.did } : {}),
      ...(g._.report?.remains ? { remains: g._.report.remains } : {}),
      ...(g._.way ? { way: g._.way } : {}),
      results: [],
      score: 0,
      outcome: 'stays',
      why: HALF,
      usd: 0,
    };
    g.rounds = [...g.rounds.filter((r) => r.n !== mid), half];
    g._.report = undefined;
    g._.way = undefined;
    g._.roundBase = undefined;
  }
  setStatus(g, 'limit');
  g.reason = reason;
  g.report = { summary: limitSummary(g, reason, mid), final: standing(g), ...(mid != null ? { mid } : {}) };
  commit(d, g);
  notify(d, g.key, 'waiting', `Goal stopped at its limit: ${reason}`);
}

/** Why a round a limit stopped midway stays (atLimit). */
const HALF = 'Stopped at the limit midway';

/**
 * J2: the round a limit stopped midway, when its checkpoint was never taken (a restart came between the limit and
 * halfRound): its number, else undefined. Only while the goal is still at that limit, and only its latest round: the
 * folder then still holds that round's work and nothing after it (once it goes on, a later round's would be taken for it).
 */
function halfWithout(g: StoredGoal): number | undefined {
  if (g.status !== 'limit') return undefined;
  const r = g.rounds.reduce<GoalRound | undefined>((a, x) => (!a || x.n > a.n ? x : a), undefined);
  return r && r.n > 0 && !!r.why?.startsWith(HALF) && !r.results.length && !r.checkpoint ? r.n : undefined;
}

/** The checkpoint of a round a limit stopped midway, taken once its agent was told to stop: Keep anyway on it brings its work back. */
async function halfRound(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, n: number, o: { late?: string[]; swarm?: boolean; commandRunning?: boolean } = {}) {
  const f = fresh(d, g);
  // S4.2, M3: a subagent still at work after the wait: the report names it (what it writes after is not the round's).
  // L2: a command the agent started still running then: the round and the report say so, so nobody takes the folder for final.
  const late = o.late ?? [];
  if (f && (late.length || o.commandRunning)) {
    if (o.commandRunning) {
      const r = f.rounds.find((y) => y.n === n);
      if (r?.why === HALF) r.why = HALF_RUNNING;
    }
    if (f.report) f.report = { ...f.report, summary: [f.report.summary, late.length ? TEAM_LATE(n, late, !!o.swarm) : '', o.commandRunning ? COMMAND_LATE(n) : ''].filter(Boolean).join(' ') };
    commit(d, f);
  }
  const w = f?.undo ? place(d, f.key, f)?.w : undefined;
  if (!w) return;
  const here = await checkpoint(w).catch(() => null);
  if (!here) return;
  remember(d, g, (x) => {
    const r = x.rounds.find((y) => y.n === n);
    if (r && !r.checkpoint) r.checkpoint = here;
    x._.filesAt = here;
    x._.leftAt = Date.now();
  });
}

/** L2: why a half round stays, when a command the agent started was still running as its files were saved. */
const HALF_RUNNING = 'Stopped at the limit midway; a command the agent started was still running';
/** L2: and the limit report's sentence for it. */
const COMMAND_LATE = (n: number) => `A command the agent started was still running when round ${n}’s files were saved: what it writes after that is in the folder but not in the round.`;

/** The limit report's sentence naming the subagents (a swarm's members) still at work as a half round's files were saved. */
const TEAM_LATE = (n: number, titles: string[], swarm: boolean) => {
  const one = titles.length === 1;
  const names = titles.map((t) => `“${clip(t, 60)}”`);
  const list = one ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  const who = swarm ? `The swarm’s ${one ? 'member' : 'members'}` : `The ${one ? 'subagent' : 'subagents'}`;
  return `${who} ${list} ${one ? 'was' : 'were'} still at work when round ${n}’s files were saved: what ${one ? 'it writes' : 'they write'} after that is in the folder but not in the round.`;
};

/** S2.5: how many of the lead's members worked since `since` (began or ended a turn). */
async function membersWorked(d: Deps, key: string, since: number): Promise<number> {
  let n = 0;
  for (const k of childKeys(d.db, key)) {
    const s = d.sessions.summary(k);
    if (s && (await workedSince(d, s, since))) n++;
  }
  return n;
}

/** S5.2: why the goal of a swarm's lead paused when the person stopped the whole team (Stop all). */
export const STOPPED_SWARM = 'You stopped the swarm. Resume checks what it did.';
/** M5: the same for a session that has Hydor subagents and does not lead a swarm. */
export const STOPPED_TEAM = 'You stopped the agent and its subagents. Resume checks what they did.';

/**
 * S5.2, M5, R6: the person stopped a session and everything it started (the session's Stop all, or a swarm board's while
 * a round is at work): the goal pauses as when they stop the agent, whether the session was in a turn or waiting for its
 * subagents or a background command of its own (then no turn of its ends to say so, and the round would be checked and
 * the next one sent). Resume checks what the round did. For every session whose round is at work; the reason says who
 * was stopped (a swarm, the agent and its Hydor subagents, or the agent: a stopped turn's own sentence).
 */
export function goalStopAll(d: Deps, key: string) {
  const g = loadGoal(d.db, key);
  if (!g || (g.status !== 'working' && g.status !== 'checking')) return;
  pause(d, g, leadsSwarm(d, key) ? STOPPED_SWARM : childKeys(d.db, key).length ? STOPPED_TEAM : 'You stopped the agent.');
}

/**
 * M3: the session's Hydor subagents at work in any sense: in a turn or starting, between turns with background tasks or
 * commands still running, or waiting to carry on after their plan's usage limit (a resume scheduled).
 */
function childrenAtWork(d: Deps, key: string): string[] {
  return childKeys(d.db, key).filter((k) => {
    const s = d.sessions.summary(k);
    if (!s) return false;
    const left = stillAtWork(s);
    return liveBusy(s) || !!left.subagents || !!left.background || !!s.live?.openCommands || !!s.resumeAt || !!d.sessions.delivering?.(k);
  });
}

/**
 * M3: one subagent stopped at its lead's limit, as Stop all stops it: marked as stopped with its parent (its cut turn is
 * reported to nobody), and a swarm's member as stopped (messages no longer wake it), its scheduled resume after a usage
 * limit cancelled, and then its turn, its background tasks and its own subagents stopped (SessionManager.stopAll).
 */
async function stopChild(d: Deps, k: string, swarm: boolean) {
  const now = Date.now();
  setSessionExtra(d.db, k, { stoppedWithParent: now, ...(swarm ? { swarmStopped: now } : {}) });
  d.sessions.emit('resumeCancelled', k);
  await d.sessions.stopAll(k).catch(() => {});
}

/**
 * M1, M3, M7b: a limit stops the session's team: the session marked as Stop all marks it (news of its subagents' work
 * from before now waits in its held queue instead of waking it), its turn interrupted, and every subagent at work stopped
 * (stopChild), those that appear meanwhile too (a start_child_session in flight: `again` looks for them). The goal is
 * marked while this is under way (teamStop), so a restart that cuts it has the tick finish it.
 */
async function stopTeam(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, stopped = new Set<string>()) {
  const key = g.key;
  const swarm = leadsSwarm(d, key);
  const now = Date.now();
  setSessionExtra(d.db, key, { stoppedAll: now });
  // R4: every member of a swarm is marked stopped, those not at work too (nothing is stopped in them), so a post on the
  // board wakes none of them after the limit; message_child still reaches one after Give it more… S4: the idle ones
  // marked so are kept in the goal (limitMarked), and Give it more… takes those marks back; those at work keep theirs.
  if (swarm) {
    const atWork = new Set(childrenAtWork(d, key));
    const marked: { key: string; at: number }[] = [];
    for (const k of childKeys(d.db, key))
      if (!atWork.has(k) && !sessionExtra(d.db, k).swarmStopped) {
        setSessionExtra(d.db, k, { swarmStopped: now });
        marked.push({ key: k, at: now });
      }
    if (marked.length) remember(d, g, (x) => (x._.limitMarked = [...(x._.limitMarked ?? []), ...marked]));
  }
  const st = d.sessions.summary(key)?.live?.status;
  if (st === 'working' || st === 'waiting' || st === 'starting') await d.sessions.interrupt(key).catch(() => {});
  const again = async () => {
    for (const k of childrenAtWork(d, key))
      if (!stopped.has(k)) {
        stopped.add(k);
        await stopChild(d, k, swarm);
      }
  };
  await again();
  return again;
}

/** Stops a goal for a reason of the app's (its session archived or replaced): the files stay as they are. */
function stopFor(d: Deps, g: StoredGoal, reason: string) {
  g.question = undefined;
  g.reason = reason;
  setStatus(g, 'stopped');
  g.report = { summary: reason, final: standing(g) };
  commit(d, g);
}

/** Opens what the agent asked (goal_ask) or is blocked on (goal_report): the person answers, or the clock does for a way. */
function openQuestion(d: Deps, g: StoredGoal) {
  const q = g._.ask!;
  g._.ask = undefined;
  g._.askTurn = false;
  const now = Date.now();
  const clock = q.kind === 'way' && g.settings.noAnswerMin > 0;
  g.question = { ...q, id: rid(), askedAt: now, ...(clock ? { expiresAt: now + g.settings.noAnswerMin * 60_000 } : {}) } as GoalQuestion;
  g.round = undefined;
  if (q.kind === 'way') g._.askedAfter = tally(g).rounds;
  setStatus(g, q.kind === 'way' ? 'asking' : 'needs-you');
  g.reason = q.kind === 'blocked' ? q.question : undefined;
  commit(d, g);
  notify(d, g.key, 'waiting', q.kind === 'way' ? q.question : `The goal needs you: ${q.question}`);
}

/** A check only the person can confirm: it waits for them. */
function askYours(d: Deps, g: StoredGoal, c: GoalCheck) {
  g._.yours = c.id;
  g.question = { id: rid(), kind: 'yours', question: c.label, context: 'Every other check holds. Only you can say whether this one does.', ways: [{ name: 'It holds' }, { name: 'Not yet' }], pick: 0, askedAt: Date.now() };
  g.round = undefined;
  setStatus(g, 'needs-you');
  g.reason = `Only you can say whether “${c.label}” holds.`;
  commit(d, g);
  notify(d, g.key, 'waiting', `The goal needs you: does “${c.label}” hold?`);
}

/** The session's queue is on hold (after a restart, or a stop): nothing goes to its agent until the person presses Resume there. */
const QUEUE_HELD = 'The session’s queue is paused: press Resume there';

function queueOnHold(d: Deps, g: StoredGoal) {
  const from = g.status;
  setStatus(g, 'needs-you');
  g._.heldQueue = true;
  g._.heldFrom = from;
  g.reason = QUEUE_HELD;
  commit(d, g);
  notify(d, g.key, 'waiting', `The goal waits: ${QUEUE_HELD}`);
}

/** Starts the next round: what to work on goes to the agent (after the person's own messages). */
async function startRound(d: Deps, g: StoredGoal, o: { changeApproach?: boolean } = {}) {
  // What the person changed while the last round ran counts from now on; checks they changed are measured first.
  applyPending(g);
  if (g._.remeasure?.length) {
    g._.agreed = true;
    setStatus(g, 'measuring');
    commit(d, g);
    return measureStep(d, g.key);
  }
  const lim = limitReason(g, activeNow(g));
  if (lim) return atLimit(d, g, lim);
  // Where the files stand as the round starts: its change is judged from here (so what the person changed between rounds
  // is not taken for the round's), and it is undone back to here. Saved first: the checkpoint takes a moment.
  let base: string | undefined;
  // When the round starts: before its checkpoint, so that another session's turn ending while it is taken counts as
  // during the round (I1: other sessions count from the round's start).
  const began = Date.now();
  // A swarm's lead (S2.3): its members as they stand, for the message, read with the checkpoint.
  const team = leadsSwarm(d, g.key);
  let crew: Awaited<ReturnType<typeof swarmMembers>> | undefined;
  if (g.undo || team) {
    // Marked, so a Pause in that moment leaves a round to start on Resume rather than going back over the last one.
    if (g.undo) g._.starting = { ...(o.changeApproach ? { changeApproach: true } : {}) };
    // S1: saved before the await, whenever there is one: what the caller changed and has not saved (the start measured,
    // a round just recorded, an answer, Resume's marks) would be lost when the goal is read again after it.
    commit(d, g);
    const w = g.undo ? place(d, g.key, g)?.w : undefined;
    const status = g.status;
    const [ckpt, members] = await Promise.all([w ? checkpoint(w).catch(() => null) : null, team ? swarmMembers(d, g.key).catch(() => []) : undefined]);
    base = ckpt ?? undefined;
    crew = members;
    const f = fresh(d, g);
    if (!f || f.status !== status) return;
    g = f;
    // Hold: Pause pressed while its checkpoint was taken (the goal was checking), or before a restart that left it to start
    // (the tick starts it again): paused before the round, which Resume starts (starting stays). The only await here; a
    // goal without a worktree or a swarm awaits nothing before its round goes out, and afterRound held before calling it.
    if (pausesHere(d, g)) return;
  }
  g._.starting = undefined;
  const n = tally(g).rounds + 1;
  const way = g.next.shift();
  const since = g.rounds.filter((r) => r.n > (g._.askedAfter ?? 0));
  // Every check holds and something is left to put right: it says so first, as long as they all still hold where the files stand.
  const fix = g._.fix && allButYouHold(g.contract.checks, standing(g)) ? g._.fix : undefined;
  const text = roundMessage(g, { n, way, note: g._.note, from: g._.from, changeApproach: o.changeApproach || g._.changeApproach || stalled(since), fix, ...(crew ? { swarm: { members: crew } } : {}) });
  g._.note = undefined;
  g._.from = undefined;
  g._.changeApproach = undefined;
  g._.way = way?.name;
  g._.report = undefined;
  g._.ask = undefined;
  g._.askTurn = false;
  g._.roundBase = base;
  g._.unfinished = undefined;
  g.round = n;
  g.reason = undefined;
  g.question = undefined;
  const now = Date.now();
  g._.roundStartedAt = began;
  g._.roundSpent = spentNow(d, g.key) ?? undefined;
  g._.sentAt = now;
  // Saved with the state: a restart before it goes out sends this one again, never the one before (quiet).
  g._.lastMessage = text;
  setStatus(g, 'working', now);
  commit(d, g);
  await say(d, g, text);
}

/** Asks which way to go next instead of a round. */
async function sendAsk(d: Deps, g: StoredGoal, why: string) {
  g._.askTurn = true;
  g._.askedAfter = tally(g).rounds;
  g.round = undefined;
  g._.sentAt = Date.now();
  const text = askMessage(g, why);
  g._.lastMessage = text;
  setStatus(g, 'working');
  commit(d, g);
  await say(d, g, text);
}

/**
 * Checks were proposed (by the agent, or the app's own when it proposed none). They are measured at once (true: the
 * caller runs measureStep) only where that runs no command the person has not agreed to: the session's agent runs
 * commands unasked anyway, or no check runs one. Otherwise they wait for the person unmeasured, with nothing run.
 */
function proposed(d: Deps, g: StoredGoal): boolean {
  g.rounds = [];
  g.best = undefined;
  g._.agreed = false;
  g._.atAgree = undefined;
  g._.remeasure = undefined;
  if (runsUnasked(d, g.key) || !g.contract.checks.some(runsCommand)) {
    setStatus(g, 'measuring');
    commit(d, g);
    return true;
  }
  setStatus(g, 'agreeing');
  g.reason = agreeNote(d, g);
  commit(d, g);
  notify(d, g.key, 'waiting', 'The goal’s checks are ready for you');
  return false;
}

/** After the person agreed (and any checks they changed were measured): reached at once, or round 1. */
async function goOn(d: Deps, g: StoredGoal) {
  if (g.rounds.length <= 1) {
    const res = standing(g);
    if (g.contract.checks.length && g.contract.checks.every((c) => res.find((r) => r.id === c.id)?.holds))
      return reach(d, g, { summary: `${allHold(g.contract.checks.length, true)} when the app first measured where things stand, before any round: this already holds.`, final: res });
  }
  await startRound(d, g);
}

/**
 * Why the goal paused when the final review could not be had: one plain sentence for the person, and the end of what the
 * helper said (its fallbacks' errors run long and are not for people) after it, at most 200 characters.
 */
export function reviewerDown(error: string): string {
  const said = error.replace(/\s+/g, ' ').trim();
  const first = said === 'The reviewer gave no answer that could be read' ? 'The reviewer gave no answer that could be read' : 'The reviewer could not be reached';
  return `${first}, so the final check did not run. Resume to try again.${said && said !== first ? ` (${clip(said, 200)})` : ''}`;
}

/** The second run of the checks once all but the person's hold, and the strong review of the whole change. */
async function finalCheck(d: Deps, g: StoredGoal): Promise<{ ok: boolean; reason: string; results: GoalResult[]; review?: string; flaky: GoalResult[]; reran: number } | { error: string; reviewer?: true }> {
  const p = place(d, g.key, g);
  if (!p) return { error: 'The session is gone' };
  const env = checkContext(d, g, p, await checkRunner(d, g.key, p.cwd));
  const again = g.contract.checks.filter((c) => c.kind === 'command' || c.kind === 'measure');
  const second = await runAll(d, g, again, env);
  const flaky = second
    .filter((r) => !r.holds)
    .map((r) => ({ ...r, detail: [`It held once and not on a second run.${r.error ? ` ${r.error}.` : ''}`, r.detail ?? ''].filter(Boolean).join('\n') }));
  const by = new Map(standing(g).map((r) => [r.id, r]));
  for (const r of [...second, ...flaky]) by.set(r.id, r);
  const results = scored(g.contract.checks, g.contract.checks.map((c) => by.get(c.id)).filter((r): r is GoalResult => !!r), g.rounds[0]);
  if (flaky.length) {
    const names = flaky.map((r) => g.contract.checks.find((c) => c.id === r.id)?.label ?? r.id);
    return { ok: false, reason: `${names.join(', ')} held once and not on a second run`, results, flaky, reran: again.length };
  }
  // A change that could not be read is not "no change": the goal is not reached unreviewed.
  let change: string;
  try {
    change = await env.diff();
  } catch (e) {
    return { ok: false, reason: `The change since the goal started could not be read (${clip(bare((e as Error).message), 200)}), so it could not be reviewed`, results, flaky: [], reran: again.length };
  }
  if (!change.trim()) return { ok: true, reason: 'Every check held on a second run.', results, flaky: [], reran: again.length };
  // The files the review checks name and those their reviewers asked to read go to the last reviewer too: it judges the
  // same claims (checks.ts alsoBlocks).
  const also = await alsoBlocks(p.cwd, g.contract.checks, (fresh(d, g) ?? g)._.asked);
  const v = await finalReview(d, g.key, g.contract.objective, g.contract.checks, change, also);
  if ('error' in v) return { error: v.error, reviewer: true };
  return { ok: v.ok, reason: v.reason, review: v.reason, results, flaky: [], reran: again.length };
}

/** After a round was checked (or when a goal goes on): done, at a limit, a question, asking which way, or the next round. */
async function afterRound(d: Deps, g: StoredGoal) {
  // P1: Pause pressed while the round ran (pausing): the round is recorded, and the goal pauses before anything that comes
  // after a round (the final check, a limit, a question, an ask turn, the next round), at the first of the three holds
  // below it reaches: each comes after the last thing awaited, so nothing can be sent between it and what it holds.
  // Resume comes back here. (A goal with only its start, goOn, starts round 1: startRound holds.)
  if (g.rounds.length <= 1) return goOn(d, g);
  // Every check but the person's holds where the files stand (the best round): the final check judges those files, once.
  // What it found of the last few states of the files is kept (judged): files it already judged are not paid for twice
  // (after a round undone, the person's Keep anyway back to them, a restart). Judged and passed: the person's own check is
  // asked, or the goal is reached; judged and not passed (or the person said "Not yet" of them): on with the rounds.
  if (allButYouHold(g.contract.checks, standing(g))) {
    // Saved first (the round just checked with it): judging takes a while, and the goal is read again after.
    if (g.status !== 'checking') setStatus(g, 'checking');
    commit(d, g);
    const p = place(d, g.key, g);
    const key = p ? await judgedKey(g, p) : `n:${g.best ?? 0}`;
    let now = fresh(d, g);
    if (!now || now.status !== 'checking') return;
    g = now;
    // Hold: before the final check, or what was found of these files before (no review is asked while it waits).
    if (pausesHere(d, g)) return;
    const n = g.best ?? g.rounds[g.rounds.length - 1].n;
    const known = g._.judged?.find((j) => j.key === key);
    if (known?.ok && !known.notYet) {
      g._.fix = undefined;
      g._.final = { reran: known.reran ?? 0, ...(known.review ? { review: known.review } : {}) };
      const left = g.contract.checks.filter((c) => c.kind === 'you' && !g._.confirmed?.[c.id]);
      if (left.length) return askYours(d, g, left[0]);
      return reach(d, g, { summary: reachedSummary(g, g._.final), final: standing(g), ...(known.review ? { review: known.review } : {}) });
    }
    if (!known) {
      const f = await finalCheck(d, g);
      // The final check ran the commands again: where the loop leaves the files is after it.
      const w = g.undo ? p?.w : undefined;
      const left = w ? ((await checkpoint(w).catch(() => null)) ?? undefined) : undefined;
      now = fresh(d, g);
      if (!now || now.status !== 'checking') return;
      g = now;
      if (left) {
        g._.filesAt = left;
        g._.leftAt = Date.now();
      }
      if ('error' in f) return pause(d, g, f.reviewer ? reviewerDown(f.error) : `The final check could not run: ${bare(f.error)}. Resume to try again.`, { notice: true });
      g._.judged = [...(g._.judged ?? []).filter((j) => j.key !== key), { key, n, ok: f.ok, reason: f.reason, reran: f.reran, ...(f.review ? { review: f.review } : {}) }].slice(-JUDGED_KEPT);
      if (f.ok) {
        g._.fix = undefined;
        g._.final = { reran: f.reran, ...(f.review ? { review: f.review } : {}) };
      } else {
        // Not yet: why goes with the round it judged, and a check that held only once no longer holds where the files stand.
        // From now on a round is kept when it changes the files and breaks nothing (the score can rise no more).
        const lr = g.rounds.find((r) => r.n === n) ?? g.rounds[g.rounds.length - 1];
        lr.why = [lr.why && bare(lr.why), `The final check: ${bare(f.reason)}`].filter(Boolean).join('. ');
        if (f.flaky.length) mergeResults(g, f.flaky, [n]);
        g._.afterFinal = true;
        g._.fix = { by: 'final', reason: f.reason };
      }
      // Hold: Pause pressed while the final check ran. What it found is kept (judged): Resume does not pay for it again,
      // and goes on from it (the person's check, reached, or on with the rounds).
      if (pausesHere(d, g)) return;
      if (f.ok) {
        const left = g.contract.checks.filter((c) => c.kind === 'you' && !g._.confirmed?.[c.id]);
        if (left.length) return askYours(d, g, left[0]);
        return reach(d, g, { summary: reachedSummary(g, g._.final!), final: f.results, ...(f.review ? { review: f.review } : {}) });
      }
    }
  }
  // Hold: what comes after a round that is not the final check (a limit, a question, an ask turn, the next round).
  if (pausesHere(d, g)) return;
  const lim = limitReason(g, activeNow(g));
  if (lim) return atLimit(d, g, lim);
  if (g._.ask) return openQuestion(d, g);
  const since = g.rounds.filter((r) => r.n > (g._.askedAfter ?? 0));
  if (g.settings.asks === 'every') return sendAsk(d, g, 'The user asked to be asked which way after every round.');
  if (g.settings.asks === 'forks' && stalled(since)) return sendAsk(d, g, `The last ${plural(GOAL_PATIENCE, 'round was', 'rounds were')} not kept: this is a turning point.`);
  await startRound(d, g);
}

/** How many states of the files the final check's findings are kept for. */
const JUDGED_KEPT = 5;

/**
 * The state of the files where they stand (the best round), as the final check's findings are kept by: the tree its
 * checkpoint stands for in a worktree; outside one, a hash of the change since the start (and of the new files' content);
 * else the round's number.
 */
async function judgedKey(g: StoredGoal, p: { cwd: string; w?: WorktreeInfo }): Promise<string> {
  const best = g.rounds.find((r) => r.n === g.best);
  if (p.w && best?.checkpoint) {
    const t = await treeOf(p.w.path, best.checkpoint);
    if (t) return `t:${t}`;
  }
  if (!g.undo && g._.baseCommit) {
    const text = await changeSinceStart(g, p.cwd, undefined).catch(() => null);
    if (text != null) return `h:${await changeHash(text, p.cwd)}`;
  }
  return `n:${g.best ?? 0}`;
}

// ---- measuring and checking --------------------------------------------------------------------------------------

/** Measures where things stand: every check at the start (round 0), or the ones the person changed. */
async function measureStep(d: Deps, key: string) {
  let g = loadGoal(d.db, key);
  if (!g || g.status !== 'measuring') return;
  const p = place(d, key, g);
  if (!p) return;
  const first = !g.rounds.length;
  const ids = first ? g.contract.checks.map((c) => c.id) : (g._.remeasure ?? []);
  const t0 = Date.now();
  let ckpt0: string | undefined;
  if (first && p.w) {
    ckpt0 = (await checkpoint(p.w).catch(() => null)) ?? undefined;
    // Without the start's checkpoint no round could be undone to it, and none should be said to be.
    if (!ckpt0) {
      const f = fresh(d, g);
      if (f?.status === 'measuring') pause(d, f, 'The files could not be saved before the checks were measured: is the session’s worktree still there? Resume to try again.', { notice: true });
      return;
    }
  }
  const results = await runAll(
    d,
    g,
    g.contract.checks.filter((c) => ids.includes(c.id)),
    checkContext(d, g, p, await checkRunner(d, key, p.cwd), ckpt0),
  );
  // Where the loop leaves the files is after its checks ran: what they wrote is nobody's change.
  const left = p.w ? ((await checkpoint(p.w).catch(() => null)) ?? undefined) : undefined;
  const f = fresh(d, g);
  if (!f) return;
  g = f;
  if (!g.rounds.length) {
    g.rounds = [{ n: 0, startedAt: t0, endedAt: Date.now(), results: [], score: 0, outcome: 'start', usd: 0, ...(ckpt0 ? { checkpoint: ckpt0 } : {}) }];
    g.best = 0;
  }
  if (left ?? ckpt0) {
    g._.filesAt = left ?? ckpt0;
    g._.leftAt = Date.now();
  }
  // A round the person kept that had no results (measureFor): its own, and it is the best now. Otherwise the start's
  // (where a changed check starts from) and the best round's. A check measured for the first time after rounds ran (the
  // person added or changed it) says so in the start's results (since): its value there is where it starts from, not
  // where it stood at the start.
  const kept = g._.measureFor != null && g.rounds.some((r) => r.n === g!._.measureFor) ? g._.measureFor : undefined;
  const ran = tally(g).rounds;
  if (kept != null) mergeResults(g, results, [kept]);
  else {
    mergeResults(g, ran > 0 ? results.map((r) => ({ ...r, since: ran })) : results, [0]);
    if ((g.best ?? 0) !== 0) mergeResults(g, results, [g.best!]);
  }
  // Paused or stopped meanwhile: what was measured is kept, and it goes no further (Resume measures again).
  if (g.status !== 'measuring') return commit(d, g);
  g._.remeasure = undefined;
  if (kept != null) g.best = kept;
  g._.measureFor = undefined;
  // Measured for the person's Keep anyway where the goal was not going on: back to where it stood.
  const back = g._.measureBack;
  g._.measureBack = undefined;
  if (back) {
    setStatus(g, back);
    if (goalOver(back) && g.report) g.report = { ...g.report, final: standing(g) };
    return commit(d, g);
  }
  // Measured at the person's Start: a check that could not run goes back to them, once (Start again goes ahead).
  if (g._.atAgree) {
    g._.atAgree = undefined;
    const bad = results.filter((r) => r.error);
    if (bad.length) {
      g._.agreed = false;
      setStatus(g, 'agreeing');
      g.reason = 'A check could not run';
      commit(d, g);
      const label = (id: string) => g!.contract.checks.find((c) => c.id === id)?.label ?? id;
      return notify(d, key, 'waiting', `A check could not run: ${bad.map((r) => `${label(r.id)} (${r.error})`).join('; ')}`);
    }
  }
  if (!g._.agreed) {
    setStatus(g, 'agreeing');
    g.reason = agreeNote(d, g);
    commit(d, g);
    return notify(d, key, 'waiting', 'The goal’s checks are ready for you');
  }
  // A round the person kept, measured now: on as after a checked round (the final check, when everything holds there).
  if (kept != null) return afterRound(d, g);
  await goOn(d, g);
}

/** Pauses a check of a round that cannot go on now; the round stays unchecked, so Resume checks it again. */
function holdRound(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, reason: string) {
  const f = fresh(d, g);
  if (!f || f.status !== 'checking') return;
  f._.running = undefined;
  pause(d, f, reason, { notice: true });
}

/** The round could not be checked: the session worked in the folder while its checks ran. It is checked again when it is quiet. */
function recheck(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, n: number) {
  const f = fresh(d, g);
  if (!f || f.status !== 'checking') return;
  f._.running = undefined;
  f._.rechecks = (f._.rechecks ?? 0) + 1;
  if (f._.rechecks >= 3) {
    f._.rechecks = undefined;
    return pause(d, f, `Round ${n} could not be checked: the session kept working in the folder while its checks ran. Resume to check it again.`, { notice: true });
  }
  // Still the round in progress: the next turn's end (or the tick, once the session is quiet) checks it again.
  setStatus(f, 'working');
  commit(d, f);
}

/** A round ended: the checks run, the round is kept or undone (its files put back), and the loop decides what comes next. */
async function checkStep(d: Deps, key: string) {
  let g = loadGoal(d.db, key);
  if (!g || g.status !== 'checking') return;
  const p = place(d, key, g);
  if (!p) return;
  // A reset a restart cut (its mark still there): never tried again (I2).
  if (g._.restoreTo) return p.w ? unfinished(d, g, p.w) : remember(d, g, (x) => (x._.restoreTo = undefined));
  // No round in progress: a restart came while the final check ran, or while a round's start was saved. There is no
  // round to check (one made up here would cost a round and count towards a turning point): it goes on from there.
  if (g.round == null) return g._.starting ? startRound(d, g, g._.starting) : afterRound(d, g);
  const n = g.round;
  const best = g.rounds.find((r) => r.n === g!.best) ?? g.rounds[0];
  const w = g.undo ? p.w : undefined;
  // From here on, a turn that begins means someone may have written while the checks ran (putBack).
  const ckptAt = Date.now();
  const ckpt = w ? ((await checkpoint(w).catch(() => null)) ?? undefined) : undefined;
  if (g.undo && !ckpt) return holdRound(d, g, 'The round’s files could not be saved: is the session’s worktree still there? Resume to try again.');
  // The round is judged from where it started (what the person changed before it is not the round's), else from the best round.
  const base = g._.roundBase ?? best?.checkpoint;
  // The paths it changed, for its protected paths: git failing to list them is a check that could not run (once more,
  // then the goal pauses), never "nothing changed".
  let changed: string[] = [];
  if (w && ckpt && base) {
    const list = () => changedPaths(p.cwd, base, ckpt);
    try {
      changed = await list().catch(list);
    } catch (e) {
      return holdRound(d, g, `The files round ${n} changed could not be listed (${clip(bare((e as Error).message), 200)}), so its protected paths could not be checked. Resume to check the round again.`);
    }
  }
  const hits = protectedHits(changed, g.contract.protect);
  const env = checkContext(d, g, p, await checkRunner(d, key, p.cwd), ckpt);
  let results = await runAll(d, g, g.contract.checks, env);
  // A check that held in the best round and could not run now (a reviewer that is down, a timeout, a missing tool) has not
  // stopped holding: it runs once more, and if it still cannot, the round is neither kept nor undone.
  const heldBest = (id: string) => !!best?.results.find((r) => r.id === id)?.holds;
  const unrun = g.contract.checks.filter((c) => heldBest(c.id) && results.find((r) => r.id === c.id)?.error);
  if (unrun.length) {
    const again = await runAll(d, g, unrun, env);
    results = results.map((r) => again.find((x) => x.id === r.id) ?? r);
    const still = again.find((r) => r.error);
    if (still) {
      const label = g.contract.checks.find((c) => c.id === still.id)?.label ?? still.id;
      return holdRound(d, g, `“${label}” could not run: ${bare(still.error!)}. Resume to check the round again`);
    }
  }
  // The person's rules, read by the reviewer: asked once more when it cannot answer, and then the round goes on without.
  let rule: string | undefined;
  let rulesUnchecked = false;
  if (!hits.length && g.rules.length) {
    let change: string | null;
    try {
      change = w && ckpt && base ? await diffText(w.path, base, ckpt) : await env.diff();
    } catch {
      change = null;
    }
    const texts = g.rules.map((r) => r.text);
    // With which round this is and what the rounds kept before it did (their reports): a rule about order needs it.
    const about = { round: g.round ?? g.rounds.length, before: g.rounds.filter((x) => x.n > 0 && x.outcome === 'kept').slice(-8).map((x) => `Round ${x.n}: ${clip((x.did ?? x.way ?? 'no report').replace(/\s+/g, ' '), 300)}`) };
    let r = change == null ? ({ error: 'no change to read' } as const) : await reviewRules(d, key, texts, change, about);
    if ('error' in r && change != null) r = await reviewRules(d, key, texts, change, about);
    if ('error' in r) rulesUnchecked = true;
    else rule = r.broke ?? undefined;
  }
  // After a failed final check the score can rise no more: whether the round changed the files decides.
  // Compared with where the loop left the files (after the last checks ran, so what they wrote is no change of the round's).
  // Outside a worktree, the change since the start is compared with the one the final check judged (by a hash of its text).
  let afterFinal: RoundInput['afterFinal'];
  const lastLeft = g._.filesAt ?? best?.checkpoint;
  if (g._.afterFinal && allButYouHold(g.contract.checks, best?.results ?? [])) {
    let changed: boolean | undefined;
    if (w && ckpt && lastLeft) changed = !(await sameFiles(w.path, ckpt, lastLeft));
    else if (!w && g._.judged?.at(-1)?.key.startsWith('h:')) changed = await env.diff().then(async (t) => `h:${await changeHash(t, p.cwd)}` !== g!._.judged!.at(-1)!.key, () => undefined);
    afterFinal = { changed };
  }
  const v = reckon({ checks: g.contract.checks, results, start: g.rounds[0], best, undo: g.undo, protectedHit: hits, ruleBroken: rule, afterFinal });
  // S2.5: how many of a swarm's members worked in the round (began or ended a turn since it started).
  const crew = leadsSwarm(d, key) ? await membersWorked(d, key, g._.roundStartedAt ?? ckptAt) : 0;
  // The round's record, written into the restore mark too (a restart while its files go back still records it).
  const spent = spentNow(d, key);
  const record: GoalRound = {
    n,
    startedAt: g._.roundStartedAt ?? Date.now(),
    endedAt: Date.now(),
    ...(g._.report?.did ? { did: g._.report.did } : {}),
    ...(g._.report?.remains ? { remains: g._.report.remains } : {}),
    ...(g._.way ? { way: g._.way } : {}),
    results: v.results,
    score: v.score,
    outcome: v.outcome,
    ...(v.why || rulesUnchecked ? { why: [v.why && (rulesUnchecked ? bare(v.why) : v.why), rulesUnchecked ? 'Your rules could not be checked this round' : ''].filter(Boolean).join('. ') } : {}),
    ...(v.cause ? { cause: v.cause } : {}),
    usd: spent != null && g._.roundSpent != null ? Math.max(0, spent - g._.roundSpent) : 0,
    ...(crew ? { members: crew } : {}),
  };
  let saved: string | undefined;
  let notUndone: string | undefined;
  if (v.outcome === 'undone' && w && base) {
    // I1: other sessions in the folder count from when the round started (a fork's work during the round is not this
    // round's to undo); this session and its own subagents from the round's checkpoint (their turns before it are the round).
    const started = g._.roundStartedAt ?? ckptAt;
    const r = await putBack(d, g, { w, to: base, n, by: 'undo', status: 'checking', since: { self: ckptAt, others: started }, head: ckpt ? await parentOf(w.path, ckpt) : undefined, record });
    if (!r.ok && 'cause' in r) {
      // Paused, stopped or replaced while the checks ran: the round stays unchecked (Resume checks it again), its files as they are.
      if (r.cause === 'gone') return;
      if (r.cause === 'unsaved') return holdRound(d, g, `The files could not be saved before putting them back, so round ${n} was not undone. Resume to check it again.`);
      // The reset did not finish: the round is recorded as it stands and the goal paused (unfinished), once.
      return;
    } else if (!r.ok) {
      // This session (or a subagent of its own) worked in the folder while the checks ran: the round is not over.
      if (r.held.by === 'self') return recheck(d, g, n);
      // Another session in the folder worked during the round, or a commit: not undone, not paused; the round stays, and
      // the next round hears why.
      notUndone = holdText(r.held);
    } else saved = r.safety;
  }
  const outcome = notUndone ? 'stays' : v.outcome;
  // A round that stays: where the loop leaves the files is after its checks ran (what they wrote is not the next round's change).
  const left = outcome !== 'undone' && w ? ((await checkpoint(w).catch(() => null)) ?? undefined) : undefined;
  const f = fresh(d, g);
  if (!f) return;
  g = f;
  // The round's checkpoint: the safety one when it was undone (all that was in the folder: Keep anyway brings it back).
  const round: GoalRound = { ...record, outcome, ...(notUndone ? { why: [record.why && bare(record.why), `It was not undone: ${notUndone}`].filter(Boolean).join('. ') } : {}), ...(saved || ckpt ? { checkpoint: saved ?? ckpt } : {}) };
  g.rounds = [...g.rounds.filter((r) => r.n !== n), round];
  if (outcome !== 'undone') g.best = n;
  g.round = undefined;
  g._.report = undefined;
  g._.way = undefined;
  g._.roundBase = undefined;
  g._.running = undefined;
  g._.rechecks = undefined;
  if (outcome !== 'undone' && (left || ckpt)) {
    g._.filesAt = left ?? ckpt;
    g._.leftAt = Date.now();
  }
  // What the person changed while this round ran takes effect now that it is judged.
  applyPending(g);
  // The person paused or stopped it while the checks ran: the round is recorded, and it goes no further.
  if (g.status !== 'checking') return commit(d, g);
  await afterRound(d, g);
}


/**
 * S2.1: a swarm's round is otherwise over (its lead idle, no member at work, no report on its way) but its board holds
 * posts the lead has not had: they go to the lead now (boardNow), the turn the loop dealt with is kept (`g`, saved), and
 * true: the caller stops, and the lead's next turn end (or the tick) comes back to the gate. One delivery per look: the
 * posts are read as they go, so a lead that ends its turn again with nothing new posted reaches the checks.
 */
async function boardFirst(d: Deps, g: StoredGoal): Promise<boolean> {
  if (!leadsSwarm(d, g.key) || !boardWaits(d.db, g.key)) return false;
  commit(d, g);
  await boardNow(d, g.key);
  return true;
}

/** A turn ended in a goal that drafts or works: how it ended decides; a round's end runs the checks. */
async function turnStep(d: Deps, key: string, t: { endedAt: number; startedAt: number; failed?: boolean }, now = Date.now()) {
  let g = loadGoal(d.db, key);
  if (!g || (g.status !== 'drafting' && g.status !== 'working')) return;
  // A turn that ended before the loop's message went out, or one dealt with already.
  if (t.endedAt < (g._.sentAt ?? 0) || t.endedAt <= (g._.lastTurn ?? 0)) return;
  const s = d.sessions.summary(key);
  // Its queue is on hold: nothing goes to the agent until the person presses Resume there (said below, once how the turn
  // ended is known: a turn the person stopped holds the queue too, and pauses the goal).
  const held = !!s && !!s.queue?.length && !!s.queueHeld && !liveBusy(s);
  // Its queue, its subagents or its background work are not done, or a subagent's report has not reached it yet: the
  // next turn's end (or the tick) tries again.
  if (!held && (!idle(d, key, now) || (await reportsPending(d, key, now)))) return;
  const turn = lastTurn((await d.sessions.timeline(key)).parser.items);
  // Stopped by its plan's usage limit: the app carries such a turn on by itself (another account, or at the reset)
  // unless the person stopped it or when the limit lifts is not known; then the goal says so instead of waiting for ever.
  if (d.sessions.stoppedAtLimit?.(key, t.startedAt)) {
    if (d.sessions.summary(key)?.resumeAt || now - t.endedAt < LIMIT_GRACE_MS) return;
    const f = fresh(d, g);
    if (!f || (f.status !== 'drafting' && f.status !== 'working')) return;
    f._.lastTurn = t.endedAt;
    return pause(d, f, 'The agent stopped at its plan’s usage limit, and the app will not carry it on by itself (it was stopped, or when the limit lifts is not known). Resume once it can go on.', { notice: true });
  }
  const f = fresh(d, g);
  if (!f || (f.status !== 'drafting' && f.status !== 'working')) return;
  g = f;
  g._.lastTurn = t.endedAt;
  g._.first = undefined;
  if (turn?.status === 'interrupted') return pause(d, g, 'You stopped the agent.');
  if (held) {
    // Not dealt with yet: the turn the queue goes on with is the one that ends the round.
    g._.lastTurn = undefined;
    return queueOnHold(d, g);
  }
  // Cut short by a restart of the app (Custom's turns stop at every restart, and nothing carries them on): the loop's
  // message goes again, once, saying why.
  if ((turn?.error ?? '').startsWith(CUT_BY_RESTART)) {
    // Pause pressed while that round ran: no message goes again, the goal pauses (Resume checks what the round did).
    if (g.pausing) return pause(d, g, cutWhilePausing(g, true), { notice: true });
    if (g._.lastMessage && g._.resent !== g._.sentAt) {
      g._.sentAt = Date.now();
      g._.resent = g._.sentAt;
      commit(d, g);
      await say(d, g, restartedMessage(g._.lastMessage), { again: true });
      return;
    }
    return pause(d, g, 'A restart of the app cut the agent’s turn short again. Resume to check what it did.', { notice: true });
  }
  if (t.failed || turn?.status === 'failed') return pause(d, g, `The turn failed: ${clip(turn?.error ?? 'an error', 300)}`);
  if (g.status === 'drafting') {
    if (!g._.reminded) {
      g._.reminded = true;
      g._.sentAt = Date.now();
      g._.lastMessage = reminderMessage(g.contract.objective, { swarm: leadsSwarm(d, key) });
      commit(d, g);
      await say(d, g, g._.lastMessage);
      return;
    }
    // Twice without a proposal: the app proposes one check for it, a reviewer reading the change against the goal.
    g.contract = { ...g.contract, checks: [{ id: 'c1', kind: 'review', label: 'The goal is met', claim: clip(g.contract.objective, 1000), evidence: { diff: true } }] };
    g._.topId = 1;
    if (!proposed(d, g)) return;
    return measureStep(d, key);
  }
  // The turn asked which way next: the question opens, or (none asked) the next round takes another approach. It was the
  // loop's own turn: where it leaves the files is after it (a say while the question is open is not refused for it).
  if (g._.askTurn) {
    const w = g.undo ? place(d, key, g)?.w : undefined;
    if (w) {
      commit(d, g);
      const here = await checkpoint(w).catch(() => null);
      const f2 = fresh(d, g);
      if (!f2 || f2.status !== 'working') return;
      g = f2;
      if (here) {
        g._.filesAt = here;
        g._.leftAt = Date.now();
      }
    }
    if (g._.ask) return openQuestion(d, g);
    g._.askTurn = false;
    return startRound(d, g, { changeApproach: true });
  }
  // S2.1: the round of a swarm is not over while its board has posts the lead has not had: they go to it now, once (not
  // when their timer says: progress alone would hold the round five minutes), and its next turn's end comes back here.
  if (await boardFirst(d, g)) return;
  // M4: looked at again with nothing awaited from here to the checks' start: a board batch (its own 2 s timer) or a
  // message may have woken the session while the transcript was read. Its next turn's end comes back here.
  if (!idle(d, key, now)) return;
  setStatus(g, 'checking');
  commit(d, g);
  await checkStep(d, key);
}

// ---- what starts it, and the person's actions --------------------------------------------------------------------

/** Sets a goal: it starts drafting, and the agent is asked for the checks (`first`: its first message is the goal, and the ask goes with it). */
export async function setGoal(d: Deps, key: string, objective: string, settings?: Partial<GoalSettings>, o: { first?: boolean } = {}): Promise<StoredGoal> {
  const s = d.sessions.summary(key);
  if (!s) throw new HttpError(404, 'There is no such session');
  const no = refusal(s);
  if (no) throw new HttpError(400, no);
  // One goal at a time: the program's own (/goal typed in Claude Code, a Codex thread's goal) would judge the same turns
  // by its own rules beside the app's. If someone types /goal in the chat while a goal of the app's runs, it goes to the
  // program as any message does and nothing here notices it (not in this version): the app's loop goes on as before.
  if (s.goal && !s.goal.app) throw new HttpError(409, 'This session has a goal of its program’s own: clear it first with /goal clear');
  const text = objective.trim();
  if (!text) throw new HttpError(400, 'Say what the goal is');
  // A goal set over one that is not over replaces it whole, its loop's own fields with it: a restore mark of the old goal
  // (a reset under way or one a restart cut) goes, and the new goal starts from the files as they are (X9).
  const now = Date.now();
  const spent = spentNow(d, key);
  const defaults = goalDefaults(d.db);
  const g: StoredGoal = {
    key,
    id: rid(),
    status: 'drafting',
    // What a new goal starts from is the person's own (Settings → Capabilities → Goals): the rounds it may run, how much it
    // asks and the minutes before it goes on with its pick; what was sent with the goal comes first.
    contract: { objective: clip(text, 4000), checks: [], protect: [], limits: { rounds: defaults.rounds } },
    settings: { asks: defaults.asks, noAnswerMin: defaults.noAnswerMin, ...(settings ?? {}) },
    rounds: [],
    undo: !!s.worktree,
    rules: [],
    next: [],
    dropped: [],
    startedAt: now,
    spentUsd: 0,
    activeMs: 0,
    _: { spentAtStart: spent ?? 0, ...(spent == null ? { spendUnread: true } : {}), sentAt: now, lastTurn: s.endedAt, ...(o.first ? { first: true } : {}) },
  };
  if (!g.undo && s.cwd) g._.baseCommit = await headOf(s.cwd).catch(() => undefined);
  // Sent again once if a restart cuts the drafting turn short (with the goal as the first message, the draft says it all again).
  g._.lastMessage = draftMessage(g.contract.objective, { swarm: leadsSwarm(d, key) });
  commit(d, g);
  if (!o.first) await say(d, g, g._.lastMessage);
  return g;
}

/**
 * A session created with a goal (the start page's Goal option): the goal is set, and what goes ahead of its first message
 * comes back. When it cannot be set the session goes on as a plain one, and the person hears why (a waiting notice).
 */
export async function goalOnCreate(d: Deps, key: string, objective: string, settings?: Partial<GoalSettings>): Promise<string | null> {
  try {
    await setGoal(d, key, objective, cleanSettings(settings, []) ?? {}, { first: true });
    return draftNotes({ swarm: leadsSwarm(d, key) });
  } catch (e) {
    const why = (e as Error).message;
    console.warn(`[goal] ${key}: not set at its start: ${why}`);
    notify(d, key, 'waiting', goalNotSetText(why));
    return null;
  }
}

const busyError = () => new HttpError(409, 'The goal is busy with a step: try again in a moment');

/** Runs a step for an action; a 409 when another step holds the goal. */
async function step(key: string, fn: () => Promise<void>) {
  if (!(await drive(key, fn))) throw busyError();
}

/** The person answered the open question, or its time was up (the agent's pick goes ahead). */
async function answerQuestion(d: Deps, g: StoredGoal, a: { ways: number[]; other?: string; note?: string; by: 'you' | 'clock' }) {
  const q = g.question!;
  const now = Date.now();
  const going = g.status === 'asking' || g.status === 'needs-you';
  if (q.kind === 'yours') {
    const id = g._.yours;
    const c = g.contract.checks.find((x) => x.id === id);
    const holds = a.ways[0] === 0;
    g.answered = { ways: a.ways.slice(0, 1), ...(a.note ? { note: a.note } : {}), by: a.by, at: now, question: q.question, picked: [q.ways[a.ways[0]]?.name ?? ''] };
    g.question = undefined;
    g._.yours = undefined;
    if (holds && c) {
      g._.confirmed = { ...g._.confirmed, [c.id]: true };
      mergeResults(g, [{ id: c.id, holds: true, closeness: 1, detail: a.note ? `You confirmed it: ${a.note}` : 'You confirmed it.', ms: 0 }], [g.best ?? 0]);
      const left = g.contract.checks.filter((x) => x.kind === 'you' && !g._.confirmed?.[x.id]);
      if (left.length) return askYours(d, g, left[0]);
      if (allButYouHold(g.contract.checks, standing(g))) {
        const f = g._.final ?? { reran: 0 };
        return reach(d, g, { summary: reachedSummary(g, f), final: standing(g), ...(f.review ? { review: f.review } : {}) });
      }
    } else {
      // Every other check holds: the next round puts right what the person says (their note), a round is kept when it
      // changes the files and breaks nothing, and the final check looks again.
      g._.fix = { by: 'you', label: c?.label ?? 'The user’s check', ...(a.note ? { note: a.note } : {}) };
      g._.afterFinal = true;
      // The files the final check passed are those the person said "Not yet" of: they are not asked again for them.
      const j = g._.judged?.at(-1);
      if (j?.ok) j.notYet = true;
    }
  } else if (q.kind === 'blocked') {
    const said = [a.other, a.note].filter(Boolean).join(' ');
    g.answered = { ways: [], ...(a.note ? { note: a.note } : {}), ...(a.other ? { other: a.other } : {}), by: a.by, at: now, question: q.question, picked: [] };
    g._.note = said ? `You asked: ${q.question} The user answers: ${said}` : `You asked: ${q.question} The user says to go on.`;
    g.question = undefined;
  } else {
    const picks = (a.by === 'clock' ? [q.pick] : a.ways).filter((i) => i >= 0 && i < q.ways.length);
    const ways = [...(a.other ? [{ name: a.other }] : []), ...picks.map((i) => q.ways[i])];
    g.next = [...ways, ...g.next];
    g.answered = { ways: picks, ...(a.other ? { other: a.other } : {}), ...(a.note ? { note: a.note } : {}), by: a.by, at: now, question: q.question, picked: ways.map((w) => w.name) };
    if (a.note) g._.note = a.note;
    g.question = undefined;
  }
  if (!going) return commit(d, g);
  await startRound(d, g);
}

/** Does what the person asked of a session's goal (POST /api/sessions/:key/goal); the goal as it stands after, or null without one. */
export async function goalAction(d: Deps, key: string, a: GoalAction): Promise<GoalState | null> {
  if (a.action === 'set') return publicGoal(await setGoal(d, key, a.objective, a.settings));
  const g = loadGoal(d.db, key);
  if (!g) {
    if (a.action === 'stop' || a.action === 'clear') return null;
    throw new HttpError(409, 'This session has no goal');
  }
  const over = goalOver(g.status);
  const notOver = () => {
    if (over) throw new HttpError(409, 'The goal is over: set a new one');
  };
  // P2: rules and settings also on a goal stopped at a limit, which Give it more… can still carry on: they count from then.
  const notEnded = () => {
    if (over && g.status !== 'limit') throw new HttpError(409, 'The goal is over: set a new one');
  };
  switch (a.action) {
    case 'stop':
    case 'clear': {
      // A goal that is over goes: that is how the person dismisses its report.
      if (over) {
        drop(d, key);
        return null;
      }
      const mid = g.status === 'working' ? g.round : undefined;
      g.question = undefined;
      g.reason = 'Stopped by you.';
      setStatus(g, 'stopped');
      // Stopped while paused after a reset that did not finish: the report says what I2's pause said (what is saved where).
      g.report = { summary: [mid != null ? `Stopped by you during round ${mid}: that round’s work was not checked.` : 'Stopped by you.', g._.unfinished ?? ''].filter(Boolean).join(' '), final: standing(g), ...(mid != null ? { mid } : {}) };
      g._.unfinished = undefined;
      commit(d, g);
      break;
    }
    case 'pause': {
      notOver();
      // P1: a round at work (running, or its checks) is finished and checked first: the goal pauses after it (pausesHere).
      // Anywhere else it pauses now.
      if (g.status === 'paused' || g.pausing) break;
      if (pausesAfterRound(g)) {
        g.pausing = true;
        commit(d, g);
        break;
      }
      pause(d, g, 'Paused by you.');
      break;
    }
    case 'resume': {
      notOver();
      // P1: before the round it waits for is checked, Resume takes the pause back: the goal goes on as if never paused.
      if (g.status !== 'paused' && g.pausing) {
        g.pausing = undefined;
        commit(d, g);
        break;
      }
      if (g.status !== 'paused') throw new HttpError(409, 'The goal is not paused');
      const from = g._.pausedFrom;
      g.reason = undefined;
      g._.pausedFrom = undefined;
      // A step still runs (the checks): it carries on as if never paused. What was held for the session goes before the
      // loop's next message, not while the checks run (R5), and the stop before this is over (R2: wentOn).
      if (driving.has(key)) {
        setStatus(g, from ?? 'working');
        g._.wentOn = Date.now();
        g._.releaseHeld = true;
        commit(d, g);
        break;
      }
      await step(key, async () => {
        const f = fresh(d, g);
        if (!f || f.status !== 'paused') return;
        // R2: the goal goes on; a stop of its session before now is over (holdsNewsFor). M1: what its subagents and board
        // held meanwhile goes now when a round waits to be checked (the agent hears it first, then the round is checked
        // at its turn's end), else right before the loop's next message (never while checks or measuring run).
        f._.wentOn = Date.now();
        if (f.round != null) releaseHeldNews(d, key);
        else f._.releaseHeld = true;
        f.reason = undefined;
        f._.pausedFrom = undefined;
        // After a reset that did not finish (I2), the round it was for is already recorded as it stands and "where the loop
        // left the files" is the folder as it was then: Resume goes on from the files as they are, without a second try.
        f._.unfinished = undefined;
        if (from === 'drafting') {
          setStatus(f, 'drafting');
          f._.sentAt = Date.now();
          f._.reminded = false;
          f._.lastMessage = draftMessage(f.contract.objective, { swarm: leadsSwarm(d, key) });
          commit(d, f);
          return void (await say(d, f, f._.lastMessage));
        }
        if (from === 'measuring') {
          setStatus(f, 'measuring');
          commit(d, f);
          return measureStep(d, key);
        }
        // Nothing measured with the person's agreement yet: back to it.
        if (from === 'agreeing' || !f.rounds.length) {
          setStatus(f, 'agreeing');
          f.reason = agreeNote(d, f);
          return commit(d, f);
        }
        // A round that ran and was not checked yet is checked now, or when the turn still running ends (or the one on what
        // was held, or on the board's news, which goes first as at any round's end: boardFirst).
        if (f.round != null) {
          setStatus(f, 'working');
          if (idle(d, key) && !(await boardFirst(d, f))) {
            setStatus(f, 'checking');
            commit(d, f);
            return checkStep(d, key);
          }
          return commit(d, f);
        }
        if (f._.starting) return startRound(d, f, f._.starting);
        if (f._.ask) return openQuestion(d, f);
        if (f.question) {
          setStatus(f, f.question.kind === 'way' ? 'asking' : 'needs-you');
          return commit(d, f);
        }
        // An ask turn cut short goes on with a round that takes another approach; otherwise what comes after the last round.
        if (f._.askTurn) return startRound(d, f, { changeApproach: true });
        setStatus(f, 'checking');
        commit(d, f);
        return afterRound(d, f);
      });
      break;
    }
    case 'agree': {
      if (g.status !== 'agreeing') throw new HttpError(409, g.status === 'measuring' ? 'The checks are still being measured' : 'The checks are not waiting for your agreement');
      const c = cleanContract(a.contract, g.contract, { title: true, ids: true, top: usedTop(g) });
      if (c.errors.length) throw new HttpError(400, c.errors[0]);
      // L1: limits the goal has already used up (what working out the checks cost, say) would stop it at once.
      const spentAlready = usedUp(d, g, c.contract.limits ?? g.contract.limits);
      if (spentAlready) throw new HttpError(409, spentAlready);
      const changed = c.contract.checks ? putChecks(g, c.contract.checks) : [];
      g.contract = { ...g.contract, ...c.contract };
      g._.topId = c.top;
      g._.agreed = true;
      g.reason = undefined;
      // Measured now, with the person's agreement: every check without a value at the start, and those they changed.
      const start = g.rounds[0];
      const ids = new Set(g.contract.checks.map((x) => x.id));
      const unmeasured = g.contract.checks.filter((x) => !start?.results.some((r) => r.id === x.id)).map((x) => x.id);
      const measure = [...new Set([...unmeasured, ...changed, ...(g._.remeasure ?? [])])].filter((id) => ids.has(id));
      if (measure.length) {
        g._.remeasure = measure;
        g._.atAgree = true;
        setStatus(g, 'measuring');
        commit(d, g);
        launch(key, drive(key, () => measureStep(d, key)));
        break;
      }
      commit(d, g);
      await step(key, async () => {
        const f = fresh(d, g);
        if (f?.status === 'agreeing') await goOn(d, f);
      });
      break;
    }
    case 'change': {
      if (over) {
        await reopen(d, key, g, a);
        break;
      }
      if (g.status === 'drafting') throw new HttpError(409, 'The agent has not proposed the checks yet');
      if (g.status === 'measuring' || g.status === 'checking') throw new HttpError(409, 'Wait for the checks to finish running');
      // A round runs (or waits to be checked): it is judged by the checks it started with, and a change of checks or
      // protected paths takes effect once it has been (pending). Limits count at once.
      const later = g.round != null;
      const cur: Pick<GoalContract, 'checks' | 'limits'> = { checks: (later ? g.pending?.checks : undefined) ?? g.contract.checks, limits: g.contract.limits };
      const c = cleanContract(a.contract, cur, { ids: true, top: usedTop(g) });
      if (c.errors.length) throw new HttpError(400, c.errors[0]);
      // L1: limits lowered below what the goal has used: refused, rather than the goal stopping a tick later.
      const overUsed = c.contract.limits ? usedUp(d, g, c.contract.limits) : null;
      if (overUsed) throw new HttpError(409, overUsed);
      g._.topId = c.top;
      if (c.contract.limits) g.contract = { ...g.contract, limits: c.contract.limits };
      if (later) {
        if (c.contract.checks || c.contract.protect) g.pending = { ...g.pending, ...(c.contract.checks ? { checks: c.contract.checks } : {}), ...(c.contract.protect ? { protect: c.contract.protect } : {}) };
        commit(d, g);
        break;
      }
      const changed = c.contract.checks ? putChecks(g, c.contract.checks) : [];
      g.contract = { ...g.contract, ...c.contract };
      if (changed.length) g._.remeasure = [...new Set([...(g._.remeasure ?? []), ...changed])];
      if (g.status === 'agreeing' && g.reason !== 'A check could not run') g.reason = agreeNote(d, g);
      // Waiting for the person's agreement: measured now, and back to the agreement, where the agent may run commands
      // unasked anyway; else when the person starts it.
      if (g.status === 'agreeing' && changed.length && g.rounds.length && runsUnasked(d, key)) {
        setStatus(g, 'measuring');
        commit(d, g);
        launch(key, drive(key, () => measureStep(d, key)));
        break;
      }
      commit(d, g);
      break;
    }
    case 'answer': {
      if (!g.question) throw new HttpError(409, 'There is no open question');
      if (g.question.kind === 'yours' && a.ways[0] !== 0 && a.ways[0] !== 1) throw new HttpError(400, 'Say whether it holds');
      if (g.question.kind === 'way' && !a.other && !a.ways.some((i) => i < g.question!.ways.length)) throw new HttpError(400, 'Tick a way, or say one of your own');
      await step(key, async () => {
        const f = fresh(d, g);
        if (f?.question?.id === g.question!.id) await answerQuestion(d, f, { ways: a.ways, other: a.other, note: a.note, by: 'you' });
      });
      break;
    }
    case 'wait': {
      if (!g.question) throw new HttpError(409, 'There is no open question');
      delete g.question.expiresAt;
      commit(d, g);
      break;
    }
    case 'settings': {
      notEnded();
      g.settings = { ...g.settings, ...a.settings };
      const q = g.question;
      if (q?.kind === 'way' && a.settings.noAnswerMin !== undefined) {
        if (g.settings.noAnswerMin > 0) q.expiresAt = q.askedAt + g.settings.noAnswerMin * 60_000;
        else delete q.expiresAt;
      }
      commit(d, g);
      break;
    }
    case 'rule': {
      notEnded();
      if (g.rules.length >= GOAL_MAX_RULES) throw new HttpError(400, `At most ${GOAL_MAX_RULES} rules: remove one first`);
      g.rules.push({ id: `r${rid()}`, text: a.text, at: Date.now() });
      commit(d, g);
      break;
    }
    case 'unrule': {
      notEnded();
      g.rules = g.rules.filter((r) => r.id !== a.id);
      commit(d, g);
      break;
    }
    case 'round':
      // Also on a goal stopped at its limit: Keep anyway brings back the round the limit stopped midway.
      await sayOnRound(d, key, g, a);
      break;
  }
  return publicGoal(loadGoal(d.db, key));
}

/**
 * L1: what the goal has used already of `limits`, in a sentence the person can act on ("It has spent $0.006: give it more
 * than that."), or null: its rounds, its money (read now, not as last saved) and its time at work. Limits already met
 * would stop the goal the moment it went on: refused (409) wherever limits are set, at the agreement, by a change and by
 * Give it more…, with nothing changed.
 */
function usedUp(d: Deps, g: StoredGoal, limits: GoalContract['limits']): string | null {
  const ran = tally(g).rounds;
  const now = g._.spendUnread ? null : spentNow(d, g.key);
  const spent = now != null ? Math.max(0, now - g._.spentAtStart) : g.spentUsd;
  const worked = activeNow(g);
  const used =
    ran >= limits.rounds
      ? `It has run ${plural(ran, 'round', 'rounds')}`
      : limits.usd != null && spent >= limits.usd
        ? `It has spent ${usd(spent)}`
        : limits.minutes != null && worked >= limits.minutes * 60_000
          ? `It has worked ${duration(worked)}`
          : null;
  return used ? `${used}: give it more than that.` : null;
}

/**
 * More for a goal that stopped at a limit (Give it more… on its report): new limits re-open it when none is reached any
 * more, and it goes on exactly as after a checked round (a question it would ask, or the next round message), with the
 * files where they stand. Only a goal at a limit: one reached or stopped stays over.
 */
async function reopen(d: Deps, key: string, g: StoredGoal, a: Extract<GoalAction, { action: 'change' }>) {
  if (g.status !== 'limit') throw new HttpError(409, 'The goal is over: set a new one');
  // M6: the session may have become a team a goal does not go with since it stopped.
  const team = teamRefusal(sessionExtra(d.db, key));
  if (team) throw new HttpError(409, team);
  const sent = (a.contract ?? {}) as Record<string, unknown>;
  if (sent.limits == null || sent.checks !== undefined || sent.protect !== undefined) throw new HttpError(409, 'The goal stopped at its limit: only its limits can change, to give it more');
  const c = cleanContract({ limits: sent.limits }, g.contract, {});
  if (c.errors.length) throw new HttpError(400, c.errors[0]);
  const limits = c.contract.limits!;
  // Still at a limit: what it has used of it, which the new limit must be above.
  const used = usedUp(d, g, limits);
  if (used) throw new HttpError(409, used);
  await step(key, async () => {
    const f = fresh(d, g);
    if (!f || f.status !== 'limit') return;
    // R2: the goal goes on; the limit's stop of its session is over (holdsNewsFor). M1: what its subagents and board held
    // since goes right before the loop's next message (never while the final check runs).
    f._.wentOn = Date.now();
    f._.releaseHeld = true;
    // S4: the members the limit marked stopped while they were not at work are members again (a swarm_post to everyone
    // wakes them, the round message lists them as waiting), unless marked since by someone else; those it stopped at work
    // stay stopped until the lead gives them more to do.
    for (const m of f._.limitMarked ?? []) if (sessionExtra(d.db, m.key).swarmStopped === m.at) setSessionExtra(d.db, m.key, { swarmStopped: null });
    f._.limitMarked = undefined;
    // J2: a half round whose checkpoint a restart kept from being taken gets it below (where the files are left as well).
    const half = halfWithout(f);
    f.contract = { ...f.contract, limits };
    f.endedAt = undefined;
    f.report = undefined;
    f.reason = undefined;
    f.question = undefined;
    f._.unfinished = undefined;
    // Not over any more: as after a round was checked, from the files as they are (a round the limit stopped midway
    // left its work there: the next check judges it).
    setStatus(f, 'checking');
    commit(d, f);
    const w = f.undo ? place(d, key, f)?.w : undefined;
    if (w && half != null) await halfRound(d, f, half);
    else if (w) await leaveHere(d, f, w);
    const h = fresh(d, f);
    if (h?.status === 'checking') await afterRound(d, h);
  });
}

/**
 * M1: the goal goes on (Resume, Give it more…): the session's queue, held while it was stopped or the goal paused or at
 * its limit (children/family.ts holdsNewsFor), goes when it holds nothing but what agents sent it (its subagents'
 * reports, its board's batches) or the loop's own messages; one with something the person wrote waits for them to press
 * Resume there. The order, for "Resume checks what it did": with a round waiting to be checked, Resume sends what was held
 * to the agent first, its turn on it ends, and the round is checked then; otherwise (and after a Resume while a step still
 * ran, R5) it goes right before the loop's next message (say), never while checks or measuring run.
 */
function releaseHeldNews(d: Deps, key: string) {
  if (heldNewsOnly(d, key)) d.sessions.resumeQueue(key);
}

/** Whether the session's queue is held with nothing in it but what agents sent it or the loop's own messages (releaseHeldNews). */
function heldNewsOnly(d: Deps, key: string): boolean {
  const s = d.sessions.summary(key);
  return !!s?.queueHeld && !!s.queue?.length && s.queue.every((m) => betweenAgents(m.text) || !!goalMessageOf(m.text));
}

/** Where the loop leaves the files, from the folder as it is. */
async function leaveHere(d: Deps, g: Pick<StoredGoal, 'key' | 'id'>, w: WorktreeInfo) {
  const here = await checkpoint(w).catch(() => null);
  remember(d, g, (x) => {
    if (here) x._.filesAt = here;
    x._.leftAt = Date.now();
  });
}

/** Why a say is refused (I4), in words that say what the person can do. */
const SAY_AGENT_BUSY = 'This session’s agent is at work: wait for its turn to end, then try again.';
/** The same for a session that leads a swarm (S3): its members' work holds the say too. */
const SAY_TEAM_BUSY = 'This session’s agent or a member of its swarm is at work: wait for them to finish, then try again.';
/** P1: Pause was pressed while a round ran: the goal pauses once that round has been checked. */
const SAY_PAUSING = 'The goal pauses once this round has been checked: give your say then.';
/** A path or folder as a shell takes it: quoted when it has anything but plain characters. */
const shellQuoted = (p: string) => (/^[\w./@+-]+$/.test(p) ? p : `'${p.replace(/'/g, `'\\''`)}'`);

/**
 * Why a say is refused when files changed outside the goal: which ones (up to five, then how many more), and the commands
 * that make the folder's files the goal's again while keeping the person's changes, run in the worktree's top folder
 * (the paths are relative to it; the session may work in a subfolder). For the files it names one by one (ten at most),
 * each step only where it applies: the person's changes to those still in the folder go to a stash (a stash of a path
 * puts back the last commit's version, not the goal's), the goal's own version of those its files have comes back from
 * where it left them, and those its files do not have go. For more, the same for the whole folder: everything changed
 * since the last commit to a stash, then the goal's files back. Never a bare `git stash` alone: it would also put aside
 * the goal's own work that is not committed, and the folder would still not be as the goal left it. Committing does not
 * help either: the files would still differ, and the say would take the commit off the branch.
 */
function editedText(h: Edited, open?: number): string {
  const { paths } = h;
  // Paused while round `open` ran: what differs is most likely that round's own work, which the app has not checked yet
  // (to the loop it is a change since it last left the files, like any other). Said as that, with what Resume does:
  // called the person's change, they were told to put aside work they had not made.
  const yours = open == null;
  const under = `Round ${open} was under way when the goal was paused, and the app has not checked it yet`;
  if (!paths.length)
    return yours
      ? 'The folder has changes made outside the goal since it last left the files: put aside (or undo) the changes to the files git status shows you changed, and only those, then try again.'
      : `${under}: the folder holds its work. Resume the goal to have that round checked, then try again.`;
  const one = paths.length === 1;
  const named = `${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ` and ${paths.length - 5} more` : ''}`;
  const head = yours
    ? `${one ? 'This file' : 'These files'} changed outside the goal since it last left the files: ${named}.`
    : `${under}: ${one ? 'this file holds' : 'these files hold'} its work (or a change of your own): ${named}. Resume the goal to have that round checked.`;
  const lead = yours ? 'To' : 'To give your say now instead, first';
  const then = yours ? ',' : ':';
  const at = h.at.slice(0, 12);
  const top = shellQuoted(h.top);
  if (!h.here || !h.left || !h.committed) {
    return `${head} ${lead} ${yours ? 'put your changes aside' : 'set those changes aside'} in a stash and put back the goal’s own version of the files${then} run these in ${top} (the worktree’s top folder): git stash push --include-untracked (everything changed since the last commit goes to the stash${yours ? ', your changes with it' : ''}), then git restore --source=${at} --worktree -- :/. Then try again.`;
  }
  const list = (ps: string[]) => ps.map(shellQuoted).join(' ');
  const left = new Set(h.left);
  // Those the goal's files do not have and the stash leaves behind (the last commit's version): they go.
  const gone = h.committed.filter((p) => !left.has(p));
  const steps = [
    h.here.length ? `git stash push --include-untracked -- ${list(h.here)}` : '',
    h.left.length ? `git restore --source=${at} --worktree -- ${list(h.left)}` : '',
    gone.length ? `rm -f -- ${list(gone)}` : '',
  ].filter(Boolean);
  const aside = yours ? `put your ${one ? 'change' : 'changes'} aside in a stash` : `set ${one ? 'that change' : 'those changes'} aside in a stash`;
  const what = [h.here.length ? aside : '', h.left.length || gone.length ? `put back the goal’s own version of ${one ? 'that file' : 'those files'}` : ''].filter(Boolean).join(' and ');
  return `${head} ${lead} ${what}${then} run ${steps.length > 1 ? 'these' : 'this'} in ${top} (the worktree’s top folder: the paths are relative to it): ${steps.join(', then ')}. Then try again.`;
}
const SAY_COMMITTED = 'A commit was made in the folder since the goal last left the files, and going to that round would take it off the branch: move it to a branch of its own first, then try again.';

/** The person's say on a round: keep it anyway, undo it, or go another way from it. Only where rounds can be undone, and between rounds. */
async function sayOnRound(d: Deps, key: string, g: StoredGoal, a: Extract<GoalAction, { action: 'round' }>) {
  if (!g.undo) throw new HttpError(409, 'Rounds can be kept or undone only where the session works in a worktree');
  // Every refusal names what the person can do in the goal's present status (I4): wait for the round, pause first, wait
  // for an agent's turn or another session, put changes aside, move a commit to a branch. None depends on what happened
  // before: once the other session has ended and the files are the ones the goal left, the say goes.
  const later = 'Wait for the round to end, or pause the goal first';
  if (g.pausing) throw new HttpError(409, SAY_PAUSING);
  if (g.status === 'working' || g.status === 'checking' || g.status === 'measuring') throw new HttpError(409, later);
  if (driving.has(key)) throw busyError();
  const agentBusy = leadsSwarm(d, key) ? SAY_TEAM_BUSY : SAY_AGENT_BUSY;
  if (!idle(d, key)) throw new HttpError(409, agentBusy);
  // J2: the half round a limit stopped, its checkpoint never taken (a restart came first): taken now, before anything
  // else, so the half round can be kept and where the loop left the files is the folder its agent left (else the say
  // would take the agent's own work for an edit made outside the goal).
  const half = halfWithout(g);
  if (half != null) {
    await step(key, () => halfRound(d, g, half));
    g = loadGoal(d.db, key) ?? g;
  }
  const r = g.rounds.find((x) => x.n === a.n);
  if (!r) throw new HttpError(404, 'There is no such round');
  const w = place(d, key, g)?.w;
  if (!w) throw new HttpError(409, 'The session’s worktree is gone');
  if (a.do === 'undo') {
    if (r.n === 0 || r.outcome === 'undone') throw new HttpError(409, 'Only a kept round can be undone');
    const prev = [...g.rounds].reverse().find((x) => x.n < r.n && (x.outcome === 'kept' || x.outcome === 'start') && x.checkpoint);
    if (!prev?.checkpoint) throw new HttpError(409, 'There is no kept round before it to go back to');
  } else if (!r.checkpoint) throw new HttpError(409, 'That round’s files were not saved');
  await step(key, async () => {
    let f = fresh(d, g);
    if (!f) return;
    const round = f.rounds.find((x) => x.n === a.n)!;
    const wasGoing = f.status === 'asking' || f.status === 'needs-you';
    const to = a.do === 'undo' ? [...f.rounds].reverse().find((x) => x.n < round.n && (x.outcome === 'kept' || x.outcome === 'start') && x.checkpoint)!.checkpoint! : round.checkpoint!;
    // I4: only when this session is quiet, no other session is at work in the folder now, the folder stands on the commit
    // the loop left it on, and its files are those the loop last left there (taken after the checks ran, so what they
    // wrote does not count; any other difference is an edit made outside the goal). Else a 409 that says why, and nothing
    // of the say is done. A reset that does not finish: unfinished (the say is not applied).
    const left = f._.filesAt;
    const res = await putBack(d, g, { w, to, n: a.n, target: a.n, by: 'say', status: f.status, since: {}, head: left ? await parentOf(w.path, left) : undefined, files: left });
    if (!res.ok && 'cause' in res) {
      if (res.cause === 'gone') throw new HttpError(409, 'The goal changed meanwhile: try again');
      if (res.cause === 'unsaved') throw new HttpError(409, 'The files could not be saved before putting them back: try again in a moment');
      return;
    }
    if (!res.ok) {
      const h = res.held;
      if (h.by === 'self') throw new HttpError(409, agentBusy);
      if (h.by === 'other') throw new HttpError(409, `Another session (“${clip(h.who, 80)}”) is at work in the same folder: wait for it to finish, then try again.`);
      if (h.by === 'commit') throw new HttpError(409, SAY_COMMITTED);
      if (h.by === 'git') throw new HttpError(409, `${h.why}.`);
      // Paused while a round ran: the round left unchecked, whose work this most likely is, is named.
      throw new HttpError(409, editedText(h, f.status === 'paused' && f.round != null ? f.round : undefined));
    }
    f = fresh(d, g);
    if (!f) return;
    // Paused while the files went back: the say is done, and the goal stays paused (Resume goes on from there).
    const going = wasGoing && (f.status === 'asking' || f.status === 'needs-you');
    if (a.do === 'undo') {
      const prev = [...f.rounds].reverse().find((x) => x.n < round.n && (x.outcome === 'kept' || x.outcome === 'start') && x.checkpoint)!;
      const rr = f.rounds.find((x) => x.n === a.n)!;
      rr.outcome = 'undone';
      rr.by = 'you';
      if (a.reason) rr.reason = a.reason;
      f.best = prev.n;
      f.dropped = [...f.dropped, { text: a.reason || `Round ${rr.n}: ${rr.way ?? (rr.did ? clip(rr.did.split(/(?<=[.!?])\s/)[0], 200) : 'its approach')}`, by: 'you' as const }].slice(-MAX_DROPPED);
    } else {
      if (a.relax && Object.keys(a.relax).length) {
        const ok = Object.fromEntries(Object.entries(a.relax).filter(([id]) => f!.contract.checks.some((c) => c.id === id && c.kind === 'measure')));
        Object.assign(f, relaxed(f, ok));
      }
      const rr = f.rounds.find((x) => x.n === a.n)!;
      if (rr.n > 0 && rr.outcome !== 'kept') {
        rr.outcome = 'kept';
        delete rr.cause;
        rr.by = 'you';
        if (a.reason) rr.reason = a.reason;
      }
      // A round with no results (the half round a limit stopped) is measured once its files are back, and becomes the best
      // then: what holds is known, and nothing says no check holds of files never measured.
      if (rr.n > 0 && !rr.results.length) f._.measureFor = rr.n;
      else f.best = rr.n;
      if (a.do === 'from') f._.from = rr.n;
    }
    // An open question is withdrawn, and a round left unchecked (paused midway) is dropped: the files moved under them.
    f.question = undefined;
    f._.ask = undefined;
    f._.yours = undefined;
    f.round = undefined;
    f._.report = undefined;
    f._.way = undefined;
    f._.roundBase = undefined;
    if (f._.measureFor != null) {
      // Measured first (after this step: it holds the goal's lock), then on: the next round where the goal was going on,
      // else back to where it stood (paused, or at its limit).
      f._.remeasure = f.contract.checks.map((c) => c.id);
      f._.measureBack = going ? undefined : f.status;
      f._.agreed = true;
      if (going) f.reason = undefined;
      setStatus(f, 'measuring');
      return commit(d, f);
    }
    // The goal was going on: as after a checked round (the final check first, when every check holds where the files
    // stand now and it has not judged them).
    if (going) {
      f.reason = undefined;
      return afterRound(d, f);
    }
    commit(d, f);
  });
  const after = loadGoal(d.db, key);
  if (after?.status === 'measuring' && after._.measureFor != null) launch(key, drive(key, () => measureStep(d, key)));
}

// ---- the agent's side (tools.ts) ------------------------------------------------------------------------------------

/** What a goal tool says in a session without a goal: a swarm member whose lead has one is told where its findings go (S6). */
function noGoal(d: Deps, key: string): string {
  const lead = parentSession(d.db, key);
  const lg = lead && leadsSwarm(d, lead) ? loadGoal(d.db, lead) : null;
  return lg && !goalOver(lg.status) ? LEADS_GOAL : NO_GOAL;
}

/** goal_propose: the checks, protected paths and limits the agent proposes; what was wrong, or what happens now. */
export function propose(d: Deps, key: string, a: Record<string, unknown>): { ok: boolean; text: string } {
  const g = loadGoal(d.db, key);
  if (!g || goalOver(g.status)) return { ok: false, text: noGoal(d, key) };
  if (g.status === 'paused') return { ok: false, text: PAUSED };
  if (g.status === 'measuring' && !g._.agreed) return { ok: true, text: 'The app is measuring the checks you proposed. Stop now: the rounds start when the user agrees.' };
  if (g.status !== 'drafting' && g.status !== 'agreeing') return { ok: false, text: 'The checks are agreed. Only the user can change them: say in goal_report what you would change and why.' };
  const c = cleanContract({ checks: a.checks, protect: a.protect, limits: a.limits, title: a.title }, { checks: [], limits: g.contract.limits }, { title: true });
  if (!c.contract.checks && !c.errors.length) c.errors.push('Give at least one check.');
  if (c.errors.length) return { ok: false, text: `Fix these and call goal_propose again:\n- ${c.errors.join('\n- ')}` };
  g.contract = { ...g.contract, checks: c.contract.checks!, protect: c.contract.protect ?? [], limits: c.contract.limits ?? g.contract.limits, ...(c.contract.title ? { title: c.contract.title } : {}) };
  g._.topId = c.top;
  g.reason = undefined;
  if (!proposed(d, g)) return { ok: true, text: 'Shown to the user. Stop now: when they agree, the app measures where things stand and the rounds start.' };
  launch(key, drive(key, () => measureStep(d, key)));
  return { ok: true, text: 'Shown to the user. Stop now: the app measures where things stand, and the rounds start when they agree.' };
}

/** goal_report: what the round did and what remains; something only the person can give opens a question when the turn ends. */
export function report(d: Deps, key: string, a: { did: string; remains?: string; blocked?: string }): { ok: boolean; text: string } {
  const g = loadGoal(d.db, key);
  if (!g || goalOver(g.status)) return { ok: false, text: noGoal(d, key) };
  if (g.status === 'paused') return { ok: false, text: PAUSED };
  if (g.status === 'drafting') return { ok: false, text: 'There is nothing to report yet: propose the checks with goal_propose, then stop.' };
  if (g.status === 'working' && g._.askTurn) return { ok: false, text: 'You were asked which way to go next: call goal_ask instead, then end your turn.' };
  if (g.status !== 'working' || g.round == null) return { ok: false, text: 'No round is running now: there is nothing to report.' };
  g._.report = { did: clip(a.did, 4000), ...(a.remains ? { remains: clip(a.remains, 4000) } : {}) };
  if (a.blocked) g._.ask = { kind: 'blocked', question: clip(a.blocked, 2000), ways: [], pick: 0 };
  commit(d, g);
  return { ok: true, text: 'Noted. End your turn: the app runs the checks now.' };
}

/** goal_ask: which way to go, for the person to pick; it opens when the turn ends. */
export function askWay(d: Deps, key: string, q: Omit<GoalQuestion, 'id' | 'askedAt' | 'expiresAt' | 'kind'>): { ok: boolean; text: string } {
  const g = loadGoal(d.db, key);
  if (!g || goalOver(g.status)) return { ok: false, text: noGoal(d, key) };
  if (g.question) return { ok: false, text: 'A question is open already: wait for the user’s answer.' };
  if (g.status === 'paused') return { ok: false, text: PAUSED };
  if (g.status !== 'working') return { ok: false, text: 'The goal is not at work now: there is nothing to ask.' };
  if (g.settings.asks === 'own') return { ok: true, text: 'The user asked not to be asked which way: take your pick and go on.' };
  if (g._.ask?.kind === 'blocked') return { ok: false, text: 'You said you are blocked on something only the user can give: that question goes to them first.' };
  g._.ask = { kind: 'way', ...q };
  commit(d, g);
  return { ok: true, text: 'Asked. End your turn: the app sends the answer, or goes on with your pick if none comes.' };
}

/** goal_note: something later rounds should know. */
export function note(d: Deps, key: string, text: string): { ok: boolean; text: string } {
  const g = loadGoal(d.db, key);
  if (!g || goalOver(g.status)) return { ok: false, text: noGoal(d, key) };
  g.dropped = [...g.dropped, { text: clip(text, 1000) }].slice(-MAX_DROPPED);
  commit(d, g);
  return { ok: true, text: 'Kept for later rounds.' };
}

// ---- turns and the tick -----------------------------------------------------------------------------------------

/** A turn of a session ended (the feature's turnEnd). */
export async function onTurnEnd(d: Deps, t: TurnInfo) {
  if (t.external) return;
  const g = loadGoal(d.db, t.key);
  if (!g || (g.status !== 'drafting' && g.status !== 'working')) return;
  await drive(t.key, () => turnStep(d, t.key, { endedAt: t.endedAt, startedAt: t.startedAt, failed: t.status === 'error' }));
}

let swept = 0;

/**
 * One look at every goal: questions whose time is up, rounds past their money or time, what a restart cut short, a
 * session archived or with its queue on hold. It never waits on a step it starts (the checks may take ten minutes, and
 * every other goal's clock and limits must still be looked at): the `driving` lock keeps each goal to one step at a time.
 */
export async function tick(d: Deps, now = Date.now()) {
  // A goal that is over has nothing to do but a reset a restart cut; whether its session is gone is looked at hourly.
  const sweep = now - swept >= SWEEP_MS;
  if (sweep) swept = now;
  for (const g of allGoals(d.db)) {
    if (goalOver(g.status) && !g._.restoreTo && !g._.teamStop && !sweep) continue;
    try {
      tickOne(d, g, now);
    } catch (e) {
      console.error(`[goal] ${g.key}: ${(e as Error).message}`);
    }
  }
}

/** One goal's look (`g` as stored, shared: read again with fresh() to change it). */
function tickOne(d: Deps, g: Readonly<StoredGoal>, now: number) {
  const key = g.key;
  if (driving.has(key)) return;
  const s = d.sessions.summary(key);
  if (!s) {
    // Its session was deleted: the goal goes a day later (a session being created has no summary for a moment).
    if (now - goalUpdated(d.db, key) > 24 * 3600_000) dropGoal(d.db, key);
    return;
  }
  // A reset a restart cut (its mark still there, no step at work): never tried again (I2). The goal pauses once, or a goal
  // that is over says so in its report.
  if (g._.restoreTo) {
    launch(
      key,
      drive(key, async () => {
        const f = fresh(d, g);
        const w = f?.undo ? place(d, key, f)?.w : undefined;
        if (f?._.restoreTo) await (w ? unfinished(d, f, w) : Promise.resolve(remember(d, f, (x) => (x._.restoreTo = undefined))));
      }),
    );
    return;
  }
  // M7b: a restart cut the stop of its team at a limit: it is done now (the half round's missing checkpoint is taken by
  // the person's next say or Give it more…, J2).
  if (g._.teamStop) {
    launch(
      key,
      drive(key, async () => {
        const f = fresh(d, g);
        if (!f?._.teamStop) return;
        const again = await stopTeam(d, f);
        await again();
        remember(d, f, (x) => (x._.teamStop = undefined));
      }),
    );
    return;
  }
  if (goalOver(g.status)) return;
  // Archived, or replaced by "Edit from here" (which archives it): nobody works in it any more, so its goal stops.
  if (s.archived) {
    launch(
      key,
      drive(key, async () => {
        const f = fresh(d, g);
        if (f && !goalOver(f.status)) stopFor(d, f, 'The session was archived (or replaced by “Edit from here”), so its goal stopped.');
      }),
    );
    return;
  }
  // A round was starting (its checkpoint being taken) when the app restarted: it starts now. Not while paused: Resume does.
  if (g._.starting && g.status !== 'paused') {
    launch(
      key,
      drive(key, async () => {
        const f = fresh(d, g);
        if (f?._.starting && f.status !== 'paused' && !goalOver(f.status)) await startRound(d, f, f._.starting);
      }),
    );
    return;
  }
  if (g.status === 'asking' && g.question?.expiresAt && g.question.expiresAt <= now) {
    launch(
      key,
      drive(key, async () => {
        const f = fresh(d, g);
        if (f?.status === 'asking' && f.question?.expiresAt && f.question.expiresAt <= now) await answerQuestion(d, f, { ways: [f.question.pick], by: 'clock' });
      }),
    );
    return;
  }
  if (g.status === 'working') {
    const spent = spentNow(d, key);
    const lim = limitReason({ ...g, spentUsd: spent != null ? Math.max(0, spent - g._.spentAtStart) : g.spentUsd }, activeNow(g as StoredGoal, now), { rounds: false });
    if (lim) {
      launch(
        key,
        drive(key, async () => {
          const f = fresh(d, g);
          if (f?.status !== 'working') return;
          const mid = f.round;
          atLimit(d, f, lim);
          // S4.2, M1, M3: the session's team stops with it (stopTeam), so none of it goes on spending or writing after the
          // goal stopped, and news of it wakes the session no more (held); what does not stop when told (a subagent slow to
          // answer, a command Codex runs on) is waited for, then named in the report. Marked in the goal until done (M7b).
          remember(d, f, (x) => (x._.teamStop = Date.now()));
          const again = await stopTeam(d, f);
          // The round stopped midway stays as the team left it: its checkpoint once the agent and its subagents stopped, a
          // while at most. One still at work then is named in the report.
          // L2: and once the commands its turn started have ended too (Codex runs them on after an interrupt, and nothing
          // can stop them from here): at most two minutes for those; still running then, the round and the report say so.
          if (mid != null) {
            const teamBusy = () => liveBusyKey(d, key) || childrenAtWork(d, key).length > 0;
            const open = () => openCommands(d, key) > 0;
            // Each look stops a subagent that appeared meanwhile (R7: else it would run, and keep the wait going, to its end).
            for (let i = 0; i < LIMIT_LOOKS_COMMANDS && (open() || (i < LIMIT_LOOKS && teamBusy())); i++) {
              await new Promise((r) => setTimeout(r, limitWaitStep));
              await again();
              limitLook?.(i);
            }
          }
          // And one more look: a subagent that appeared as the wait ended (a start_child_session in flight).
          await again();
          if (mid != null) {
            const late = childrenAtWork(d, key).map((k) => d.sessions.summary(k)?.title || k);
            await halfRound(d, f, mid, { late, swarm: leadsSwarm(d, key), commandRunning: openCommands(d, key) > 0 });
          }
          remember(d, f, (x) => (x._.teamStop = undefined));
        }),
      );
      return;
    }
  }
  // Waiting for the session's queue to go on: once the person resumed it (or emptied it), the goal goes on as before.
  if (g.status === 'needs-you' && g._.heldQueue) {
    if (s.queueHeld && s.queue?.length) return;
    launch(
      key,
      drive(key, async () => {
        const f = fresh(d, g);
        if (f?.status !== 'needs-you' || !f._.heldQueue) return;
        // A question open is what the goal waits for (a mark left from before it): it stays open, only the mark goes.
        if (f.question) {
          setStatus(f, f.question.kind === 'way' ? 'asking' : 'needs-you');
          if (f.reason === QUEUE_HELD) f.reason = f.question.kind === 'blocked' ? f.question.question : f._.yours ? `Only you can say whether “${f.question.question}” holds.` : undefined;
          return commit(d, f);
        }
        const back = f._.heldFrom === 'drafting' ? 'drafting' : 'working';
        f.reason = undefined;
        setStatus(f, back);
        commit(d, f);
      }),
    );
    return;
  }
  if ((g.status === 'working' || g.status === 'drafting') && s.queue?.length && s.queueHeld && !liveBusy(s)) {
    // A turn's end not dealt with yet goes through turnStep, which says how it ended first (a turn the person stopped).
    const ended = s.endedAt ?? 0;
    const unread = ended >= (g._.sentAt ?? 0) && ended > (g._.lastTurn ?? 0);
    launch(
      key,
      drive(key, async () => {
        if (unread) return turnStep(d, key, { endedAt: ended, startedAt: g._.sentAt ?? 0 }, now);
        const f = fresh(d, g);
        if (f && (f.status === 'working' || f.status === 'drafting')) queueOnHold(d, f);
      }),
    );
    return;
  }
  // Left measuring or checking by a restart: what its check command left running is killed, and that step runs again.
  if (g.status === 'measuring' || g.status === 'checking') {
    if (g._.running) {
      killLeftover(g._.running);
      remember(d, g, (f) => (f._.running = undefined));
    }
    launch(key, drive(key, () => (g.status === 'measuring' ? measureStep(d, key) : checkStep(d, key))));
    return;
  }
  // A turn ended that the loop did not hear of (the app restarted as it ended), or one it is waiting on to say more of.
  if ((g.status === 'working' || g.status === 'drafting') && idle(d, key, now)) {
    const ended = s.endedAt ?? 0;
    const sentAt = g._.sentAt ?? 0;
    if (ended >= sentAt && ended > (g._.lastTurn ?? 0)) launch(key, drive(key, () => turnStep(d, key, { endedAt: ended, startedAt: sentAt }, now)));
    // Nothing has ended since the loop's message went out or since the last turn it dealt with, and nothing is at work:
    // the message never reached the agent, a turn was cut by a restart without an end of its own, or a round that was to
    // be checked again (recheck) has nothing left to wait for (quiet).
    else launch(key, drive(key, () => quiet(d, key, sentAt, now)));
    return;
  }
  if (g.status === 'working' || g.status === 'drafting') quietSince.delete(key);
}

/** How long a goal at work may wait for the agent to take the loop's message up, or for a turn with no end, before it acts. */
export const UNSENT_MS = 2 * 60_000;

/** Goals at work whose session the tick found idle with a turn begun and not ended since the loop last heard: since when. */
const quietSince = new Map<string, { from: number; at: number }>();

/**
 * The session is idle and no turn ended since `from`: the later of when the loop's message went out (`sentAt`) and the
 * last turn it dealt with (after a round was to be checked again, X2). Four cases:
 * - a turn's end is in the transcript but the loop never heard of it (the app restarted as it ended, its summary not yet
 *   saying so): dealt with as any turn's end;
 * - a turn began after `from` and none ended, and it has stayed so for UNSENT_MS (a restart cut it, leaving no end:
 *   Custom's turn killed with the app, its model's answer lost): the message goes again once with the restart line, and
 *   a second time the goal pauses, the rule a turn cut with CUT_BY_RESTART follows. Counted from when the tick first saw it
 *   so, not from the turn's start: a turn that just ended may show its end in the transcript a few seconds late;
 * - no turn began, and the round's own turn was dealt with already (the round was to be checked again, and what held it,
 *   a turn or a report on its way, is over without a turn the loop heard end): the round is checked now;
 * - no turn began, UNSENT_MS after the message: a restart came between saving the goal and sending it.
 * Only while nothing is at work: no subagent's report on its way either.
 */
async function quiet(d: Deps, key: string, sentAt: number, now: number) {
  if (await reportsPending(d, key, now)) return void quietSince.delete(key);
  const items = (await d.sessions.timeline(key).catch(() => null))?.parser.items ?? [];
  const g = loadGoal(d.db, key);
  if (!g || (g.status !== 'working' && g.status !== 'drafting') || g._.sentAt !== sentAt || !idle(d, key, now)) return void quietSince.delete(key);
  const handled = g._.lastTurn ?? 0;
  const from = Math.max(sentAt, handled);
  const end = items.filter((it) => it.kind === 'turn' && (it.ts ?? 0) > from).at(-1);
  if (end) {
    quietSince.delete(key);
    return turnStep(d, key, { endedAt: end.ts!, startedAt: sentAt }, now);
  }
  const began = (d.sessions.summary(key)?.live?.turnStartedAt ?? 0) > from || items.some((it) => opensTurn(it) && (it.ts ?? 0) > from);
  if (began) {
    const seen = quietSince.get(key);
    if (!seen || seen.from !== from) return void quietSince.set(key, { from, at: now });
    if (now - seen.at < UNSENT_MS) return;
  } else if (handled >= sentAt && g.status === 'working' && g.round != null && !g._.askTurn) {
    quietSince.delete(key);
    // (Idle was looked at above with nothing awaited since: boardFirst awaits nothing when the board has nothing.)
    if (await boardFirst(d, g)) return;
    setStatus(g, 'checking');
    commit(d, g);
    return checkStep(d, key);
  } else if (now - sentAt < UNSENT_MS) return;
  quietSince.delete(key);
  // Pause pressed while that round ran: no message goes again, the goal pauses (Resume checks what the round did).
  if (g.pausing) return pause(d, g, cutWhilePausing(g, began), { notice: true });
  if (g._.lastMessage && g._.resent !== sentAt) {
    g._.sentAt = Date.now();
    g._.resent = g._.sentAt;
    commit(d, g);
    await say(d, g, restartedMessage(g._.lastMessage), { again: true });
    return;
  }
  pause(d, g, began ? 'A restart of the app cut the agent’s turn short again. Resume to check what it did.' : 'The loop’s message did not reach the agent (the app restarted as it was sent). Resume to send it again.', { notice: true });
}

let ticker: NodeJS.Timeout | null = null;

/**
 * Starts the tick (the feature's start, once the sessions are restored): one look now, so what a restart left (a reset
 * it cut, a round to start, a turn to deal with) is taken up at once rather than a tick later (J5), then every TICK_MS.
 */
export function startTick(d: Deps) {
  if (ticker) return;
  const run = () => void tick(d).catch((e) => console.error(`[goal] tick: ${(e as Error).message}`));
  ticker = setInterval(run, TICK_MS);
  ticker.unref();
  run();
}

/** Stops the tick (for the tests). */
export function stopTick() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}
