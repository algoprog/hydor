// Checks for the app's goal loop (driver.ts), end to end, with sessions as a stub and a real git worktree made in the
// test's own scratch folder, so checkpoints and undoing a round run for real; the reviewer is a stub. Set → propose →
// measure → agree → a kept round → an undone round (its files really back) → a round that changed a protected path →
// stalled, so it asks which way → the person's answer → reached with the final check; the reminder and the proposal
// the app makes itself; the clock's answer, Wait for me, an ask turn that asked nothing, and asking nothing at all;
// every limit (a round past its money stopped and its files put back); pause and resume, a turn the person stopped,
// one that failed, one a usage limit cut; the person's keep, undo and another way from a round; a restart in
// checking and a turn's end the loop never heard of, both picked up by the tick; a check only the person confirms;
// something the agent is blocked on; where nothing can be undone; refusals; the tools; the routes and events; the
// session's summary; what a session started with a goal hears first. And what an independent review found: files are
// never put back where anyone wrote meanwhile (a message while the checks ran, a message on its way, another session in
// the folder, a session that carried on after a limit); the half round a limit stopped is saved first; checks run as the
// session's agent's commands would (its sandbox, none without one where it is confidential); after a failed final check
// a round that changed nothing is undone and one that changed the files is looked at again; a check that cannot run is
// tried once more and pauses rather than undo; the person's own changes between rounds are not the round's; a turn a
// restart cut gets its message again once; a queue on hold, background commands left running, a usage limit nothing
// will carry on; the final check never passes unreviewed; a restore that failed is tried again on Resume; unpriced and
// unreadable spending; Custom's reviewer; the notices held back; the state kept small; a check a restart left running;
// a tick that never waits; one goal at a time; and more for a goal stopped at its limit. And what an end-to-end run
// found: whole minutes without an answer, a plain sentence when the reviewer cannot be reached, the round message after a
// failed final check or the person's "Not yet", a goal that cannot be set at the session's start said to the person, and
// Last round after the person went another way from a round. And an undo decided by who could have written (checks that
// write files git does not ignore never stop it, and all of it is kept in the round's checkpoint), and a round without
// results measured once the person keeps it. And what a second review found: the final check whenever the files where
// they stand were not judged; no round made up after a restart during the final check, a round that was starting
// started, a message that never went out sent again; a retry after a failed restore that would wipe later work refused;
// who wrote, for every session in the folder; a held queue and a failed restore after a limit; where the loop leaves the
// files after measuring; outside a worktree, No change by the change's hash; messages wait while files go back; changed
// paths git cannot list; the mark of a check's command forgotten; Codex's checks without network; what a limit has used.
// And what the gate review found: files put back exactly as the checkpoint (a file a kept round deleted stays deleted);
// a half round whose checkpoint a restart kept from being taken gets it before a say or Give it more; a queue's wait
// that never turns a question into work; a reset a restart cut never tried again from a Pause and Resume; one tick as the
// feature starts; a round's start taken before its checkpoint; a failed say that names where the folder is saved.
// And the commands a refused say gives, run as written: the person's changes to a stash and the goal's own version of
// each file back (changed by both, added by the goal and deleted by hand, deleted by the goal and brought back), in the
// worktree's top folder; and nothing touched where git is too old to put files back. And Pause pressed while a round
// runs: the round is finished and checked (kept, undone, left as it is, or checked again later), then the goal pauses,
// before the final check, a limit, a question, an ask turn or the next round, also when Pause comes during the final
// check, while the next round's start is saved, or across a restart; Resume meanwhile takes it back. Rules and settings
// on a goal stopped at a limit. A check changed only in its target keeps its values, judged again (at once, once the
// round that runs is over, and at the agreement); one changed in what it measures, or with no value at the start, is
// measured again. And swarm rounds: a swarm's lead may have a goal (a campaign, a research, an arena may not); its round is
// over once its members are quiet, their reports in (also while one is written) and its board delivered, once; its round
// message names its members; a round records how many worked; an undone round takes their changes; a limit stops them;
// Stop all pauses the goal; a member's goal tools say whose goal it is. And limits already used refused where they are
// set; a subagent's report still being written holding any goal's round; and the commands a turn leaves running (Codex
// keeps an interrupted turn's): waited for at a limit, at most two minutes, and at a round's end within the background grace.
// And their second review: news held only at a limit or while paused, and no longer once the goal went on; no step up
// after a stop; every member marked stopped at a limit and newcomers stopped at each look; what was held goes before the
// loop's next message; Stop all pauses any goal at work; a report marked sent only once handed over. And their third:
// a swarm's lead without a worktree keeps what a round's start had not saved yet (round 0, a round recorded, Resume's
// marks); the loop's message waits in the queue behind what was held; Give it more… takes back the limit's marks on the
// members it found idle; a Stop all from before the goal holds nothing for it.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/driver-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-driver PRICES_URL= node dist/dev/driver-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goalHead, goalMessageOf, holding, standing, type GoalAction, type GoalCheck, type GoalState } from '../../shared/goals.ts';
import { CUT_BY_RESTART } from '../agents/acp.ts';
import { asked as userAsked } from '../custom/review.ts';
import { kvSet } from '../db.ts';
import type { Agent, BackgroundTask, GoalInfo, LiveStatus, NotifyEvent, SessionSummary, TimelineItem, WorktreeInfo } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { CONFIDENTIAL_TOOLS } from '../confidential/index.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, SpawnAdditions, SpawnInfo } from '../features/types.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { checkpoint, restoreCheckpoint, setGitVersionReader } from '../worktrees.ts';
import { draftMessage, RESTARTED } from './brief.ts';
import { BACKGROUND_GRACE_MS, changedChecks, checkRunner, retargeted, goalAction, goalOnCreate, goalResetRefusal, goalStartIgnored, goalStartRefusal, goalStopAll, goalTeamChange, isDriving, LEADS_GOAL, LIMIT_GRACE_MS, NO_SANDBOX, restoreSettled, reviewerDown, runsCommand, runsUnasked, setCheckpointer, setCheckSandbox, setLimitLook, setLimitWaitStep, setRestorer, settled, stopTick, STOPPED_SWARM, teamRefusal, tick as tickOnce, UNPRICED, UNSENT_MS } from './driver.ts';
import { childKeys, reportBegins, reportEnds, reportOnItsWay } from '../children/family.ts';
import { catchUp, reportTurn } from '../children/index.ts';
import { addPost, members as swarmMembers, posted, postsOf, stopMember, tellLead } from '../swarm/index.ts';
import { goals } from './index.ts';
import { setReviewer } from './review.ts';
import { goalHoldsNotices, goalInfo, loadGoal, publicGoal, saveGoal, type RestoreMark } from './store.ts';
import type { EvalScore, Evaluation } from '../../shared/evaluations.ts';
import { createEvaluation, getScore, listScores, sealAgain, startScore } from '../experiments/evaluations.ts';
import { stopTmuxServer } from '../experiments/local.ts';
import { setSettings as setQueueSettings, tick as queueTick, useDeps as useQueueDeps } from '../experiments/queue.ts';
import { getRun } from '../experiments/records.ts';
import { MOVED_WAY } from './scores.ts';
import { SCORE_PAUSED } from './driver.ts';
import { GOAL_TOOLS } from './tools.ts';
import { goalStartSettings, parseGoalAction } from './validate.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/') || process.env.PRICES_URL !== '') {
  console.error('Run with DATA_DIR=/tmp/… and PRICES_URL= (empty) so nothing touches real data or the network.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-goalsrv-driver-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, fn: () => boolean, ms = 15_000) {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(15);
  }
}

// ---- a git repository and its worktree -------------------------------------------------------------------------

const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, stdio: 'pipe' }).toString().trim();
const REPO = path.join(tmp, 'repo');
fs.mkdirSync(path.join(REPO, 'tests'), { recursive: true });
fs.writeFileSync(path.join(REPO, 'score.txt'), '2\n');
fs.writeFileSync(path.join(REPO, 'base.txt'), 'base\n');
fs.writeFileSync(path.join(REPO, 'tests', 'a.test.sh'), 'test -f base.txt\n');
git(REPO, 'init', '-q', '-b', 'main');
// The checkpoints' own commits take the repository's identity (none with a scratch HOME).
git(REPO, 'config', 'user.name', 'Test');
git(REPO, 'config', 'user.email', 'test@example.invalid');
git(REPO, 'add', '-A');
git(REPO, 'commit', '-q', '-m', 'start');

let wtN = 0;
function worktree(): WorktreeInfo {
  const p = path.join(tmp, `wt${++wtN}`);
  const branch = `agent/goal-test-${wtN}`;
  git(REPO, 'worktree', 'add', '-q', '-b', branch, p, 'main');
  return { path: p, branch, base: 'main', repo: REPO };
}
const file = (dir: string, f: string) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8') : null);
const write = (dir: string, f: string, text: string) => fs.writeFileSync(path.join(dir, f), text);

// ---- the session manager, as much as the loop uses of it --------------------------------------------------------

interface Fake {
  agent: Agent;
  acpAgent?: string;
  title: string;
  cwd: string;
  worktree?: WorktreeInfo;
  live?: LiveStatus;
  mode?: string;
  external?: boolean;
  queue: string[];
  items: TimelineItem[];
  endedAt?: number;
  /** A message on its way to the agent (SessionManager.delivering). */
  delivering?: boolean;
  archived?: boolean;
  queueHeld?: boolean;
  resumeAt?: number;
  tasks?: BackgroundTask[];
  helpers?: number;
  goal?: GoalInfo;
  turnStartedAt?: number;
  /** Codex: its sandbox policy lets its commands use the network (SessionManager.codexNetwork). */
  network?: boolean;
  /** Codex: commands its agent started that still run (LiveState.openCommands). */
  commands?: number;
}

class Sessions extends EventEmitter {
  all = new Map<string, Fake>();
  delivered: { key: string; text: string }[] = [];
  interrupted: string[] = [];
  limited = new Set<string>();
  failSend = false;
  n = 0;
  add(key: string, f: Partial<Fake> & { cwd: string }) {
    this.all.set(key, { agent: 'claude', title: key, queue: [], items: [], live: 'idle', ...f });
    // As create() stores it: its folder always, its worktree only when it has one of its own (a fork has none).
    db.prepare('insert or ignore into app_sessions (key, agent, cwd, worktree, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(key, f.agent ?? 'claude', f.cwd, f.worktree ? JSON.stringify(f.worktree) : null, Date.now(), Date.now());
  }
  /** How many of a session's child sessions are running, as the session manager counts them (workStatus: in a turn, or between turns with background tasks running). */
  running(key: string): number {
    return childKeys(db, key).filter((k) => {
      const c = this.all.get(k);
      return ['starting', 'working', 'waiting'].includes(c?.live ?? '') || (c?.live === 'idle' && !!c.tasks?.some((t) => t.status === 'running'));
    }).length;
  }
  /** How often each session's summary was asked for. */
  asked = new Map<string, number>();
  summary(key: string): SessionSummary | null {
    this.asked.set(key, (this.asked.get(key) ?? 0) + 1);
    const f = this.all.get(key);
    if (!f) return null;
    return {
      key,
      agent: f.agent,
      ...(f.acpAgent ? { acpAgent: f.acpAgent } : {}),
      id: key,
      title: f.title,
      cwd: f.cwd,
      worktree: f.worktree,
      stats: {} as SessionSummary['stats'],
      live: f.live ? { status: f.live, startedAt: 1, pendingApprovals: 0, ...(f.mode ? { mode: f.mode } : {}), ...(f.tasks ? { backgroundTasks: f.tasks } : {}), ...(f.turnStartedAt ? { turnStartedAt: f.turnStartedAt } : {}), ...(f.commands ? { openCommands: f.commands } : {}) } : null,
      external: f.external ? { status: 'idle', client: 'VS Code', pid: 1 } : null,
      queue: f.queue.map((text, i) => ({ id: `q${i}`, text, at: 1 })),
      ...(f.queueHeld ? { queueHeld: true } : {}),
      extra: JSON.parse((db.prepare('select extra from app_sessions where key = ?').get(key) as { extra: string | null } | undefined)?.extra ?? '{}'),
      endedAt: f.endedAt,
      updatedAt: Date.now(),
      ...(f.archived ? { archived: true } : {}),
      ...(f.resumeAt ? { resumeAt: f.resumeAt } : {}),
      // As the session manager counts them: its child sessions whose turn runs (unless a test says how many).
      ...((f.helpers ?? this.running(key)) ? { helpers: f.helpers ?? this.running(key) } : {}),
      goal: f.goal ?? goalInfo(db, key),
    };
  }
  delivering(key: string) {
    return !!this.all.get(key)?.delivering;
  }
  codexNetwork(key: string) {
    const f = this.all.get(key);
    return f?.agent === 'codex' ? !!f.network : undefined;
  }
  /** Called when a session's transcript is read (a test does something at that moment). */
  timelineHook?: (key: string) => void;
  async timeline(key: string) {
    this.timelineHook?.(key);
    return { parser: { items: this.all.get(key)?.items ?? [] }, readMore: async () => {} };
  }
  async deliverOrQueue(key: string, text: string) {
    if (this.failSend) throw new Error('the agent is gone');
    this.delivered.push({ key, text });
  }
  async interrupt(key: string) {
    this.interrupted.push(key);
    // The agent stops when told to.
    const f = this.all.get(key);
    if (f) f.live = 'idle';
  }
  /** Messages queued, and whether each was queued held (it waits for Resume and wakes nobody). */
  queued: { key: string; text: string; held: boolean }[] = [];
  enqueue(key: string, text: string, _images: unknown[] = [], _files: unknown[] = [], hold = false) {
    const f = this.all.get(key)!;
    this.queued.push({ key, text, held: hold });
    f.queue.push(text);
    if (hold) f.queueHeld = true;
  }
  /** The person's Resume on a held queue: what waited goes to the agent. */
  resumed: string[] = [];
  resumeQueue(key: string) {
    const f = this.all.get(key)!;
    this.resumed.push(key);
    f.queueHeld = false;
    for (const text of f.queue.splice(0)) this.delivered.push({ key, text });
  }
  /** Stop all (SessionManager.stopAll) as asked of each session: its turn, its background tasks and what it started. */
  stoppedAll: string[] = [];
  async stopAll(key: string) {
    this.stoppedAll.push(key);
    setSessionExtra(db, key, { stoppedAll: Date.now() });
    const f = this.all.get(key);
    if (f && f.live && f.live !== 'idle') await this.interrupt(key);
    if (f?.tasks) f.tasks = f.tasks.map((t) => ({ ...t, status: 'stopped' as const }));
    return { turn: true, tasks: 0, children: 0 };
  }
  queueSummary() {}
  stoppedAtLimit(key: string) {
    return this.limited.has(key);
  }
}

const sessions = new Sessions();
const events: { t: string; id: string; key?: string; data: { goal: GoalState | null } }[] = [];
const notices: NotifyEvent[] = [];
sessions.on('notify', (n: NotifyEvent) => notices.push(n));
let inScheduledRun = false;
const deps = {
  app: {},
  db,
  sessions,
  scheduler: { runIn: () => (inScheduledRun ? { id: 'run1' } : null) },
  broadcast: (e: (typeof events)[number]) => events.push(e),
  toSubscribers: () => {},
  publicBase: () => 'https://naget.test',
} as unknown as Deps;

let reviewer = { needs: undefined as string[] | undefined, claim: true, broke: false as boolean | string, final: { ok: true, reason: 'The change meets the goal: score.txt says 10.' } as { ok: boolean; reason: string } | 'error' };
const asked: { system: string; prompt: string; strong?: boolean }[] = [];
/** Runs as a reviewer is asked (a test acts while the final check runs). */
let reviewerHook: ((system: string) => unknown) | undefined;
setReviewer(async (_d, _key, q) => {
  asked.push({ system: q.system, prompt: q.prompt, strong: q.strong });
  await reviewerHook?.(q.system);
  // A reviewer that cannot tell until it has seen the file it names.
  if (q.system.includes('You check one claim') && reviewer.needs && !q.prompt.includes('<file path="guide.md">')) return { holds: false, score: 0.1, reason: 'The guide is not in the evidence.', needs: reviewer.needs };
  if (q.system.includes('You check one claim')) return { holds: reviewer.claim, score: reviewer.claim ? 1 : 0.2, reason: reviewer.claim ? 'It holds: “ok”.' : 'It does not: “nope”.' };
  if (q.system.includes('broke a rule')) {
    if (reviewer.broke === 'error') throw new Error('The helper model did not answer');
    return reviewer.broke ? { broke: true, rule: String(reviewer.broke), reason: 'It added a dependency.' } : { broke: false };
  }
  if (reviewer.final === 'error') throw new Error('The helper model did not answer');
  return reviewer.final;
});

// ---- the agent, played by the test --------------------------------------------------------------------------------

let runN = 0;
const ctxOf = (key: string): RunCtx => ({ runId: `run${++runN}`, key, agent: sessions.all.get(key)!.agent, cwd: sessions.all.get(key)!.cwd, deps });
async function tool(key: string, name: string, args: Record<string, unknown>) {
  const t = GOAL_TOOLS.find((x) => x.name === name)!;
  const r = await t.run(args, ctxOf(key));
  return typeof r === 'string' ? { text: r, isError: false } : { text: r.text, isError: !!r.isError };
}

let lastEnd = 0;
/** One turn of the agent: its work, then the turn's end as the session manager reports it. */
async function turn(key: string, work: () => void | Promise<void> = () => {}, o: { status?: 'completed' | 'interrupted' | 'failed'; error?: string; tell?: boolean } = {}) {
  const f = sessions.all.get(key)!;
  const startedAt = Date.now();
  f.live = 'working';
  await work();
  f.live = 'idle';
  const endedAt = Math.max(Date.now(), lastEnd + 1);
  lastEnd = endedAt;
  // As in the app, a turn's end is in the past by the time the loop hears of it (a turn ended later than that would be
  // someone else's work while the checks ran).
  while (Date.now() <= endedAt) await sleep(1);
  const id = `u${++sessions.n}`;
  f.items.push({ kind: 'user', id, seq: 0, ts: startedAt, text: sessions.delivered.filter((m) => m.key === key).at(-1)?.text ?? 'hi' } as TimelineItem);
  if (o.error) f.items.push({ kind: 'system', id: `e${id}`, seq: 0, ts: endedAt, level: 'error', text: o.error } as TimelineItem);
  f.items.push({ kind: 'turn', id: `t${id}`, seq: 0, ts: endedAt, status: o.status ?? 'completed' } as TimelineItem);
  f.endedAt = endedAt;
  if (o.tell !== false) await goals.turnEnd!({ key, agent: f.agent, cwd: f.cwd, status: o.status === 'failed' ? 'error' : 'idle', startedAt, endedAt, external: false }, deps);
}

/** The tick starts its steps without waiting for them (one goal's checks must not hold every other's clock): here it waits for them. */
const tick = async (d: Deps, now?: number) => {
  await tickOnce(d, now);
  await settled();
};
const act = (key: string, a: GoalAction) => goalAction(deps, key, a);
const goal = (key: string) => loadGoal(db, key)!;
const last = (key: string) => sessions.delivered.filter((m) => m.key === key).at(-1)?.text ?? '';
const headOf = (key: string) => goalMessageOf(last(key))?.head;
const sent = (key: string) => sessions.delivered.filter((m) => m.key === key).length;
async function rejects(p: Promise<unknown>, status: number, re?: RegExp) {
  await assert.rejects(p, (e: unknown) => e instanceof HttpError && e.status === status && (!re || re.test(e.message)));
}

const CHECKS = [
  { kind: 'command', label: 'Done file exists', run: 'test -f done.txt' },
  { kind: 'measure', label: 'Score', run: 'cat score.txt', target: { op: '>=', value: 10 } },
  { kind: 'command', label: 'Base stays', run: 'test -f base.txt' },
];

/** A goal set, proposed, measured and agreed: round 1 has been sent. */
async function agreed(key: string, o: { checks?: unknown[]; limits?: Record<string, number>; protect?: string[]; settings?: GoalAction extends infer A ? Record<string, unknown> : never } = {}) {
  await act(key, { action: 'set', objective: 'Score reaches 10 and done.txt exists', ...(o.settings ? { settings: o.settings } : {}) });
  await turn(key, async () => {
    const r = await tool(key, 'goal_propose', { checks: o.checks ?? CHECKS, protect: o.protect ?? ['tests/'], limits: o.limits ?? { rounds: 8 } });
    assert.equal(r.isError, false, r.text);
  });
  await until('agreeing', () => goal(key).status === 'agreeing');
  await act(key, { action: 'agree' });
  // Measured once the person agreed (the sessions here ask before commands), then round 1.
  await until('round 1', () => goal(key).status !== 'measuring');
}

// ---- the whole way ------------------------------------------------------------------------------------------------

const W = 'claude:goal-main';
const wt = worktree();
// Bypass: its agent runs commands without asking, so the app measures the proposal at once.
sessions.add(W, { cwd: wt.path, worktree: wt, title: 'Raise the score', mode: 'bypassPermissions' });

test('set: drafting, the draft message, the event, the summary', async () => {
  const g = (await act(W, { action: 'set', objective: '  Score reaches 10 and done.txt exists  ' }))!;
  assert.equal(g.status, 'drafting');
  assert.equal(g.contract.objective, 'Score reaches 10 and done.txt exists');
  assert.deepEqual(g.contract.checks, []);
  assert.equal(g.contract.limits.rounds, 30, 'Settings → Custom → goal rounds, 30 unless set');
  assert.deepEqual(g.settings, { asks: 'forks', noAnswerMin: 10 });
  assert.equal(g.undo, true, 'a worktree session can undo rounds');
  assert.equal((g as unknown as Record<string, unknown>)._, undefined, 'the loop’s own fields stay on the server');
  assert.equal(headOf(W), 'agree the checks');
  assert.match(last(W), /“Score reaches 10 and done\.txt exists”/);
  assert.equal(events.at(-1)!.id, 'goal');
  assert.equal(events.at(-1)!.key, W);
  assert.equal(events.at(-1)!.data.goal!.status, 'drafting');
  assert.equal((events.at(-1)!.data.goal as unknown as Record<string, unknown>)._, undefined);
  assert.deepEqual(goalInfo(db, W), { objective: 'Score reaches 10 and done.txt exists', status: 'active', reason: undefined, app: { state: 'drafting', round: undefined, rounds: 30, holds: 0, of: 0 } });
});

test('propose where the agent runs commands unasked: a proposal with problems comes back to fix; a good one is measured at once (round 0) and waits for the person', async () => {
  const bad = await tool(W, 'goal_propose', { checks: [{ kind: 'measure', label: 'Score', run: 'cat score.txt', read: '([' }, { kind: 'review', label: '' }] });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /needs target/);
  assert.match(bad.text, /read is not a regular expression/);
  assert.match(bad.text, /Check 2 needs a label/);
  assert.equal(goal(W).status, 'drafting');
  await turn(W, async () => {
    const ok = await tool(W, 'goal_propose', { title: 'Score 10', checks: CHECKS, protect: ['tests/'], limits: { rounds: 8, usd: 50 } });
    assert.equal(ok.text, 'Shown to the user. Stop now: the app measures where things stand, and the rounds start when they agree.');
  });
  await until('agreeing', () => goal(W).status === 'agreeing');
  const g = goal(W);
  assert.deepEqual(
    g.contract.checks.map((c) => c.id),
    ['c1', 'c2', 'c3'],
  );
  assert.deepEqual(g.contract.limits, { rounds: 8, usd: 50 });
  assert.equal(g.contract.title, 'Score 10');
  assert.equal(g.rounds.length, 1);
  const r0 = g.rounds[0];
  assert.equal(r0.outcome, 'start');
  assert.ok(r0.checkpoint, 'round 0 has a checkpoint in a worktree');
  assert.deepEqual(
    r0.results.map((r) => [r.id, r.holds, r.value]),
    [
      ['c1', false, undefined],
      ['c2', false, 2],
      ['c3', true, undefined],
    ],
  );
  assert.equal(g.best, 0);
  assert.equal(notices.at(-1)!.kind, 'waiting');
  assert.equal(notices.at(-1)!.body, 'The goal’s checks are ready for you');
  assert.equal(goalInfo(db, W)!.status, 'blocked', 'it waits for the person');
  assert.deepEqual(goalInfo(db, W)!.app, { state: 'agreeing', round: undefined, rounds: 8, holds: 1, of: 3 });
  // The turn's end while it waits for the person changes nothing.
  const before = sent(W);
  await turn(W);
  assert.equal(sent(W), before);
});

test('agree: round 1 starts, with what holds and what does not', async () => {
  await rejects(act(W, { action: 'answer', ways: [0] }), 409, /no open question/);
  await act(W, { action: 'agree' });
  const g = goal(W);
  assert.equal(g.status, 'working');
  assert.equal(g.round, 1);
  assert.equal(headOf(W), 'round 1 of 8');
  assert.match(last(W), /Holds: Base stays\nNot yet: Done file exists; Score 2 \(needs ≥ 10\)/);
  assert.match(last(W), /Do not change: tests\//);
  await rejects(act(W, { action: 'agree' }), 409);
  // goal_propose once agreed: only the person changes the checks.
  assert.match((await tool(W, 'goal_propose', { checks: CHECKS })).text, /The checks are agreed/);
});

test('a kept round: closer, nothing broke; it is the best so far and the next round goes out', async () => {
  await turn(W, async () => {
    write(wt.path, 'score.txt', '6\n');
    assert.equal((await tool(W, 'goal_report', { did: 'Raised the score to 6.', remains: 'Four more.' })).text, 'Noted. End your turn: the app runs the checks now.');
  });
  const g = goal(W);
  const r1 = g.rounds[1];
  assert.equal(r1.n, 1);
  assert.equal(r1.outcome, 'kept');
  assert.equal(r1.why, 'Score 2 → 6');
  assert.equal(r1.cause, undefined);
  assert.equal(r1.did, 'Raised the score to 6.');
  assert.equal(r1.remains, 'Four more.');
  assert.ok(r1.checkpoint);
  assert.ok(Math.abs(r1.score - (0 + 0.5 + 1) / 3) < 1e-9);
  assert.equal(g.best, 1);
  assert.equal(g.status, 'working');
  assert.equal(g.round, 2);
  assert.equal(headOf(W), 'round 2 of 8');
  assert.match(last(W), /Last round: kept\. Score 2 → 6\./);
});

test('an undone round: a value far behind its best; the files are really back as they were after the best round', async () => {
  await turn(W, () => {
    write(wt.path, 'score.txt', '3\n');
    write(wt.path, 'junk.txt', 'oops\n');
  });
  const g = goal(W);
  const r2 = g.rounds[2];
  assert.equal(r2.outcome, 'undone');
  assert.equal(r2.why, 'Score fell far behind its best (6 → 3)');
  assert.equal(r2.cause, 'behind');
  assert.equal(g.best, 1);
  assert.equal(file(wt.path, 'score.txt'), '6\n');
  assert.equal(file(wt.path, 'junk.txt'), null, 'a new file of the undone round is gone too');
  assert.match(last(W), /Last round: undone\. Score fell far behind its best \(6 → 3\)\. The files are back as they were after round 1\./);
});

test('a round that changed a protected path is undone; two rounds without progress make a turning point: it asks which way', async () => {
  await turn(W, () => {
    write(wt.path, 'tests/a.test.sh', 'true\n');
    write(wt.path, 'score.txt', '9\n');
  });
  const g = goal(W);
  assert.equal(g.rounds[3].outcome, 'undone');
  assert.equal(g.rounds[3].why, 'It changed files it may not change: tests/a.test.sh');
  assert.equal(g.rounds[3].cause, 'protected');
  assert.equal(file(wt.path, 'tests/a.test.sh'), 'test -f base.txt\n');
  assert.equal(file(wt.path, 'score.txt'), '6\n');
  assert.equal(headOf(W), 'which way next');
  assert.match(last(W), /The last 2 rounds were not kept: this is a turning point\. Do not work now\. Call goal_ask/);
  assert.equal(g.status, 'working');
  assert.equal(g.round, undefined, 'asking is no round');
  // goal_report in the ask turn: it is to ask.
  assert.match((await tool(W, 'goal_report', { did: 'x' })).text, /call goal_ask instead/);
});

test('the agent asks; the question opens when its turn ends, with its clock; the person’s answer goes first, with their note', async () => {
  const bad = await tool(W, 'goal_ask', { question: 'Which way?', ways: [{ name: 'Only one' }], pick: 1 });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /Give 2 to 4 ways/);
  await turn(W, async () => {
    const r = await tool(W, 'goal_ask', {
      question: 'Which way next?',
      context: 'Score is at 6.',
      ways: [
        { name: 'Write the score straight', why: 'It is a number in a file', expects: 'Score +4', cost: 'one round' },
        { name: 'Compute the score', why: 'More honest', cost: 'two rounds' },
      ],
      pick: 2,
      why: 'Two rounds were undone.',
    });
    assert.equal(r.text, 'Asked. End your turn: the app sends the answer, or goes on with your pick if none comes.');
    assert.equal(goal(W).question, undefined, 'not open before the turn ends');
  });
  const g = goal(W);
  assert.equal(g.status, 'asking');
  const q = g.question!;
  assert.equal(q.kind, 'way');
  assert.equal(q.pick, 1);
  assert.ok(q.expiresAt! - q.askedAt === 10 * 60_000, 'it goes on with its pick after 10 minutes');
  assert.equal(notices.at(-1)!.body, 'Which way next?');
  assert.equal(goalInfo(db, W)!.status, 'active');
  // A second question while one is open: refused.
  assert.match((await tool(W, 'goal_ask', { question: 'Again?', ways: [{ name: 'a' }, { name: 'b' }], pick: 1 })).text, /A question is open already/);
  await rejects(act(W, { action: 'answer', ways: [] }), 400, /Tick a way/);
  await act(W, { action: 'answer', ways: [0], other: 'Fix base first', note: 'Keep it simple.' });
  const a = goal(W);
  assert.equal(a.status, 'working');
  assert.equal(a.round, 4);
  assert.equal(a.question, undefined);
  assert.deepEqual(a.answered!.picked, ['Fix base first', 'Write the score straight']);
  assert.equal(a.answered!.by, 'you');
  assert.deepEqual(
    a.next.map((w) => w.name),
    ['Write the score straight'],
    'the person’s own way first; the second ticked one waits its turn',
  );
  assert.match(last(W), /From the user \(follow these first\):\n- Keep it simple\./);
  assert.match(last(W), /The way to follow this round: Fix base first/);
});

test('reached: every check holds, the second run and the strong review pass; the report, the notice, and Dismiss deletes it', async () => {
  await turn(W, () => {
    write(wt.path, 'score.txt', '10\n');
    write(wt.path, 'done.txt', 'done\n');
  });
  const g = goal(W);
  assert.equal(g.status, 'reached');
  assert.equal(g.rounds[4].outcome, 'kept');
  assert.equal(g.rounds[4].way, 'Fix base first');
  const final = asked.filter((a) => a.system.includes('You are the last check'));
  assert.equal(final.length, 1);
  assert.equal(final[0].strong, true);
  assert.match(final[0].prompt, /<goal>\nScore reaches 10/);
  assert.match(final[0].prompt, /\+10/, 'the whole change since the start');
  assert.match(final[0].prompt, /Done file exists \(command: test -f done.txt\)/);
  assert.equal(g.report!.summary, 'All 3 checks hold: in the last round, and again on a second run. A review of the whole change found the goal met.');
  assert.equal(g.report!.review, 'The change meets the goal: score.txt says 10.');
  assert.equal(g.report!.final!.length, 3);
  assert.ok(g.endedAt);
  assert.equal(notices.at(-1)!.kind, 'done');
  assert.equal(notices.at(-1)!.body, 'Goal reached: Score 10');
  assert.equal(goalInfo(db, W), undefined, 'a goal that is over is not in the summary');
  // Kept, done.txt is there.
  assert.equal(file(wt.path, 'done.txt'), 'done\n');
  await rejects(act(W, { action: 'pause' }), 409, /over/);
  assert.equal(await act(W, { action: 'stop' }), null);
  assert.equal(loadGoal(db, W), null);
  assert.equal(events.at(-1)!.data.goal, null);
  assert.equal(await act(W, { action: 'stop' }), null, 'stopping nothing is nothing');
});

// ---- drafting without a proposal, and where nothing can be undone --------------------------------------------------

const PLAIN = path.join(tmp, 'plain');
fs.mkdirSync(PLAIN);
fs.writeFileSync(path.join(PLAIN, 'readme.md'), 'hello\n');
const N = 'codex:goal-plain';
sessions.add(N, { agent: 'codex', cwd: PLAIN });

test('the drafting turn ends without a proposal: one reminder; then the app proposes a reviewer’s check itself', async () => {
  await act(N, { action: 'set', objective: 'The readme greets the reader warmly' });
  assert.equal(goal(N).undo, false);
  await turn(N);
  assert.equal(headOf(N), 'agree the checks');
  assert.match(last(N), /still has no checks/);
  assert.equal(goal(N).status, 'drafting');
  reviewer.claim = false;
  await turn(N);
  await until('agreeing', () => goal(N).status === 'agreeing');
  const g = goal(N);
  assert.deepEqual(g.contract.checks, [{ id: 'c1', kind: 'review', label: 'The goal is met', claim: 'The readme greets the reader warmly', evidence: { diff: true } }]);
  assert.equal(g.rounds[0].results[0].holds, false);
  assert.equal(g.rounds[0].results[0].detail, 'It does not: “nope”.');
});

test('where nothing can be undone, a round that is no better stays, and is where the files stand', async () => {
  await act(N, { action: 'agree' });
  await turn(N, () => write(PLAIN, 'readme.md', 'hi\n'));
  const g = goal(N);
  assert.equal(g.rounds[1].outcome, 'stays');
  assert.equal(g.rounds[1].why, 'No gain');
  assert.equal(g.rounds[1].cause, 'none');
  assert.equal(g.best, 1);
  assert.equal(g.rounds[1].parent, 0);
  assert.equal(publicGoal(g)!.roundParent, 1, 'a round left as it is: the next starts from its files');
  assert.equal(file(PLAIN, 'readme.md'), 'hi\n', 'nothing was put back');
  assert.match(last(N), /Last round: not better, and it stays/);
  await rejects(act(N, { action: 'round', n: 1, do: 'undo' }), 409, /worktree/);
  reviewer.claim = true;
  await act(N, { action: 'stop' });
  assert.equal(goal(N).status, 'stopped');
  assert.equal(goal(N).report!.summary, 'Stopped by you during round 2: that round’s work was not checked.');
  assert.equal(goal(N).report!.mid, 2);
});

// ---- asking: the clock, Wait for me, an ask turn that asks nothing, not asking at all --------------------------------

const A = 'claude:goal-ask';
const wtA = worktree();
sessions.add(A, { cwd: wtA.path, worktree: wtA });

test('asking after every round; the clock goes on with the agent’s pick; Wait for me stops the clock', async () => {
  await agreed(A, { settings: { asks: 'every', noAnswerMin: 5 } });
  await turn(A, () => write(wtA.path, 'score.txt', '4\n'));
  assert.equal(headOf(A), 'which way next');
  assert.match(last(A), /The user asked to be asked which way after every round\./);
  await turn(A, async () => {
    await tool(A, 'goal_ask', { question: 'Which?', ways: [{ name: 'Up by one' }, { name: 'Up by six' }], pick: 2 });
  });
  const q = goal(A).question!;
  assert.equal(q.expiresAt! - q.askedAt, 5 * 60_000);
  const before = sent(A);
  await tick(deps, Date.now() + 60_000);
  assert.equal(goal(A).status, 'asking', 'not before its time');
  await tick(deps, q.expiresAt! + 1);
  const g = goal(A);
  assert.equal(g.status, 'working');
  assert.equal(g.answered!.by, 'clock');
  assert.deepEqual(g.answered!.picked, ['Up by six']);
  assert.equal(sent(A), before + 1);
  assert.match(last(A), /The way to follow this round: Up by six/);
  // The next question: the person asks it to wait for them.
  await turn(A, () => write(wtA.path, 'score.txt', '7\n'));
  await turn(A, async () => {
    await tool(A, 'goal_ask', { question: 'And now?', ways: [{ name: 'a' }, { name: 'b' }], pick: 1 });
  });
  await act(A, { action: 'wait' });
  assert.equal(goal(A).question!.expiresAt, undefined);
  await tick(deps, Date.now() + 3600_000);
  assert.equal(goal(A).status, 'asking', 'it waits for the person');
  // Settings change the clock of the open question too.
  await act(A, { action: 'settings', settings: { noAnswerMin: 1 } });
  assert.equal(goal(A).question!.expiresAt! - goal(A).question!.askedAt, 60_000);
  await act(A, { action: 'answer', ways: [1] });
  assert.match(last(A), /The way to follow this round: b/);
});

test('an ask turn that asked nothing: the next round takes a clearly different approach; asks own: no questions', async () => {
  await turn(A, () => write(wtA.path, 'score.txt', '8\n'));
  assert.equal(headOf(A), 'which way next');
  await turn(A);
  assert.match(headOf(A)!, /^round \d+ of 8$/);
  assert.match(last(A), /take a clearly different approach than before/);
  await act(A, { action: 'settings', settings: { asks: 'own' } });
  assert.equal((await tool(A, 'goal_ask', { question: 'Q', ways: [{ name: 'a' }, { name: 'b' }], pick: 1 })).text, 'The user asked not to be asked which way: take your pick and go on.');
  await act(A, { action: 'stop' });
  await act(A, { action: 'stop' });
});

// ---- limits ---------------------------------------------------------------------------------------------------------

const L = 'claude:goal-limits';
const wtL = worktree();
sessions.add(L, { cwd: wtL.path, worktree: wtL });

test('a limit of rounds: it stops after its rounds, at the best round, with a notice and a report', async () => {
  await agreed(L, { limits: { rounds: 1 } });
  await turn(L, () => write(wtL.path, 'score.txt', '5\n'));
  const g = goal(L);
  assert.equal(g.status, 'limit');
  assert.equal(g.reason, 'It ran its 1 round');
  assert.match(g.report!.summary, /^It ran its 1 round\. The files stand at round 1, the best so far\.$/);
  assert.equal(notices.at(-1)!.body, 'Goal stopped at its limit: It ran its 1 round');
  await act(L, { action: 'stop' });
});

test('I3, X3: a limit of money while a round runs: the agent is stopped and nothing is put back; the half round is recorded with the files as it left them, once, and Keep anyway moves them either way', async () => {
  await agreed(L, { limits: { rounds: 8, usd: 1 } });
  const f = sessions.all.get(L)!;
  f.live = 'working';
  write(wtL.path, 'half.txt', 'half done\n');
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', 2.5) on conflict(key) do update set cost_usd = excluded.cost_usd").run(L, L);
  await tick(deps);
  let g = goal(L);
  assert.equal(g.status, 'limit');
  assert.equal(g.reason, 'It spent $2.50 of its $1.00');
  assert.deepEqual(sessions.interrupted, [L]);
  assert.equal(file(wtL.path, 'half.txt'), 'half done\n', 'nothing put back');
  const half = g.rounds.at(-1)!;
  assert.deepEqual([half.n, half.outcome, half.why, half.results.length], [1, 'stays', 'Stopped at the limit midway', 0]);
  assert.equal(inCheckpoint(wtL.path, half.checkpoint!, 'half.txt'), 'half done\n');
  assert.equal(g.report!.summary, 'It spent $2.50 of its $1.00. Round 1 was stopped midway and its work is still in the folder. Keep anyway… on the start puts the files back to the best round.');
  assert.equal(g.report!.mid, 1, 'the cut round: the report card does not say the files stand at the best');
  // X3: the tick again (as after a restart) does nothing to the files or the record.
  await tick(deps);
  assert.equal(file(wtL.path, 'half.txt'), 'half done\n');
  assert.deepEqual(goal(L).rounds, g.rounds);
  // Keep anyway on the start puts the files back (the person's say); on the half round, back again, measured first (E2).
  await act(L, { action: 'round', n: 0, do: 'keep' });
  assert.equal(file(wtL.path, 'half.txt'), null);
  await act(L, { action: 'round', n: 1, do: 'keep' });
  await until('measured', () => goal(L).status === 'limit');
  assert.equal(file(wtL.path, 'half.txt'), 'half done\n', 'Keep anyway brought the half round back');
  g = goal(L);
  assert.equal(g.best, 1);
  assert.equal(g.rounds[1].results.length, 3);
  db.prepare('delete from sessions where key = ?').run(L);
  await act(L, { action: 'stop' });
});

test('I3: Give it more after a limit that stopped a round midway goes on from the files as they are: the next check judges what the half round left', async () => {
  const L2 = 'claude:goal-limit-carried';
  const w = worktree();
  sessions.add(L2, { cwd: w.path, worktree: w });
  await agreed(L2, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  const f = sessions.all.get(L2)!;
  f.live = 'working';
  write(w.path, 'score.txt', '7\n');
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', 2.5) on conflict(key) do update set cost_usd = excluded.cost_usd").run(L2, L2);
  await tick(deps);
  assert.equal(goal(L2).status, 'limit');
  await act(L2, { action: 'change', contract: { limits: { rounds: 8, usd: 50 } } });
  assert.equal(goal(L2).status, 'working');
  assert.equal(goal(L2).round, 2);
  assert.equal(goal(L2).rounds[1].parent, 0, 'the half round recorded where it started');
  assert.equal(publicGoal(goal(L2))!.roundParent, 1, 'the next starts from the files the half round left, though the best is the start');
  assert.match(last(L2), /Last round: not kept, and its files were not put back\. Stopped at the limit midway\./);
  assert.equal(file(w.path, 'score.txt'), '7\n', 'the files as the half round left them');
  await turn(L2);
  assert.equal(goal(L2).rounds.at(-1)!.outcome, 'kept', 'the half round’s work, judged now');
  assert.equal(goal(L2).rounds.at(-1)!.results.find((r) => r.id === 'c2')!.value, 7);
  assert.equal(goal(L2).rounds.at(-1)!.parent, 1);
  assert.equal(publicGoal(goal(L2))!.roundParent, 2, 'a kept round: from the best again');
  db.prepare('delete from sessions where key = ?').run(L2);
  await act(L2, { action: 'stop' });
});

test('each round records the round whose files it started from: after a kept round, an undone one, Another way from here and Undo', async () => {
  const P = 'claude:goal-parents';
  const w = worktree();
  sessions.add(P, { cwd: w.path, worktree: w });
  await agreed(P, { settings: { asks: 'own' } });
  const from = () => publicGoal(goal(P))!.roundParent;
  const score = (n: number) => turn(P, () => write(w.path, 'score.txt', `${n}\n`));
  assert.equal(from(), 0, 'round 1 starts from the start');
  await score(5); // 1: kept
  assert.equal(from(), 1);
  assert.doesNotMatch(last(P), /From here/);
  await score(2); // 2: undone
  assert.equal(goal(P).rounds[2].outcome, 'undone');
  assert.equal(from(), 1, 'after an undone round: from the best again');
  assert.match(last(P), /From here \(after round 1\), these were tried and undone; do not try them again:\n- Round 2: no report of what it did \(undone: Score fell far behind its best \(5 → 2\)\)/);
  await score(7); // 3: kept
  assert.equal(from(), 3);
  assert.doesNotMatch(last(P), /From here/, 'nothing was tried from round 3 yet');
  // Another way from here on round 1 (round 4, left unchecked, is dropped): the next one starts from round 1.
  await stopAgent(P);
  await act(P, { action: 'round', n: 1, do: 'from' });
  await act(P, { action: 'resume' });
  assert.equal(goal(P).round, 4);
  assert.equal(from(), 1);
  assert.equal(file(w.path, 'score.txt'), '5\n');
  assert.equal(last(P).match(/Round 2:/g)!.length, 1, 'what Last round lists is not listed again');
  await score(8); // 4: kept
  assert.deepEqual(goal(P).rounds.map((r) => r.parent), [undefined, 0, 1, 1, 1]);
  assert.equal(from(), 4);
  // Undo: the files go back to the round kept before it, and the next round starts from there.
  await stopAgent(P);
  await act(P, { action: 'round', n: 4, do: 'undo', reason: 'Not that' });
  await act(P, { action: 'resume' });
  assert.equal(file(w.path, 'score.txt'), '7\n');
  assert.equal(from(), 3);
  await score(3); // 5: undone, from 3
  assert.equal(goal(P).rounds.at(-1)!.parent, 3);
  assert.match(last(P), /From here \(after round 3\), these were tried and undone; do not try them again:\n- Round 5: /);
  assert.equal(publicGoal(goal(P))!.rounds.at(-1)!.parent, 3, 'the screens get it');
  await act(P, { action: 'stop' });
  await act(P, { action: 'stop' });
});

test('a say that puts the files back leaves the half round a limit cut behind: the next round starts from where they are', async () => {
  const L3 = 'claude:goal-limit-back';
  const w = worktree();
  sessions.add(L3, { cwd: w.path, worktree: w });
  await agreed(L3, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  sessions.all.get(L3)!.live = 'working';
  write(w.path, 'score.txt', '7\n');
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', 2.5) on conflict(key) do update set cost_usd = excluded.cost_usd").run(L3, L3);
  await tick(deps);
  assert.equal(goal(L3).status, 'limit');
  await act(L3, { action: 'round', n: 0, do: 'keep' });
  await act(L3, { action: 'change', contract: { limits: { rounds: 8, usd: 50 } } });
  assert.equal(goal(L3).round, 2);
  assert.equal(publicGoal(goal(L3))!.roundParent, 0);
  db.prepare('delete from sessions where key = ?').run(L3);
  await act(L3, { action: 'stop' });
});

test('a limit of time while a round runs', async () => {
  await agreed(L, { limits: { rounds: 8, minutes: 1 } });
  await tick(deps, Date.now() + 30_000);
  assert.equal(goal(L).status, 'working');
  await tick(deps, Date.now() + 2 * 60_000);
  assert.equal(goal(L).status, 'limit');
  assert.equal(goal(L).reason, 'It worked 2 min of its 1 min');
  await act(L, { action: 'stop' });
});

// ---- pause, resume, and how turns end ------------------------------------------------------------------------------------

const P = 'claude:goal-pause';
const wtP = worktree();
sessions.add(P, { cwd: wtP.path, worktree: wtP });

test('P1: Pause while a round runs waits for it: nothing is sent, the round is checked and kept, then the goal pauses; the person’s Undo goes through then; Resume sends the next round', async () => {
  // Never asked which way, so every turn here is a round.
  await agreed(P, { settings: { asks: 'own' } });
  const before = sent(P);
  await act(P, { action: 'pause' });
  let g = goal(P);
  assert.deepEqual([g.status, g.pausing, g.round, g.reason], ['working', true, 1, undefined], 'still at work, to pause after the round');
  assert.equal(goalInfo(db, P)!.status, 'active');
  // Pause again: nothing changes.
  await act(P, { action: 'pause' });
  assert.deepEqual([goal(P).status, goal(P).pausing], ['working', true]);
  assert.equal(sent(P), before, 'nothing sent');
  await turn(P, () => write(wtP.path, 'score.txt', '5\n'));
  g = goal(P);
  assert.equal(g.rounds[1].outcome, 'kept');
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, 'Paused by you.');
  assert.equal(g.pausing, undefined);
  assert.equal(g.round, undefined);
  assert.equal(goalInfo(db, P)!.status, 'paused');
  assert.equal(sent(P), before, 'no message after the round');
  // Between rounds: the person's say goes through.
  await act(P, { action: 'round', n: 1, do: 'undo' });
  assert.equal(goal(P).rounds[1].outcome, 'undone');
  assert.equal(file(wtP.path, 'score.txt'), '2\n', 'its files went back');
  assert.equal(goal(P).status, 'paused');
  assert.equal(sent(P), before);
  await rejects(act(P, { action: 'pause' }).then(() => act(P, { action: 'agree' })), 409);
  await act(P, { action: 'resume' });
  g = goal(P);
  assert.equal(g.status, 'working');
  assert.equal(g.round, 2);
  assert.equal(sent(P), before + 1);
  assert.match(last(P), /round 2/i);
  await rejects(act(P, { action: 'resume' }), 409, /not paused/);
});

test('a turn the person stopped pauses it; one that failed pauses it with the error; one a usage limit cut leaves it', async () => {
  await turn(P, () => {}, { status: 'interrupted' });
  assert.equal(goal(P).status, 'paused');
  assert.equal(goal(P).reason, 'You stopped the agent.');
  // Resume: the round that was stopped is checked.
  await act(P, { action: 'resume' });
  assert.equal(goal(P).rounds[2].outcome, 'undone');
  assert.equal(goal(P).round, 3);
  await turn(P, () => {}, { status: 'failed', error: 'API error 500' });
  assert.equal(goal(P).status, 'paused');
  assert.equal(goal(P).reason, 'The turn failed: API error 500');
  await act(P, { action: 'resume' });
  const n = goal(P).round;
  assert.ok(n);
  sessions.limited.add(P);
  const before = sent(P);
  await turn(P, () => {}, { status: 'interrupted' });
  assert.equal(goal(P).status, 'working', 'the app carries such a turn on itself');
  assert.equal(goal(P).round, n);
  assert.equal(sent(P), before);
  sessions.limited.delete(P);
});

test('a round ends only once the session’s queue is empty; a message that could not go pauses it', async () => {
  const f = sessions.all.get(P)!;
  f.queue = ['the person’s own message'];
  const n = goal(P).rounds.length;
  await turn(P);
  assert.equal(goal(P).rounds.length, n, 'the person’s message goes first: no check yet');
  f.queue = [];
  await turn(P);
  assert.equal(goal(P).rounds.length, n + 1);
  sessions.failSend = true;
  await turn(P);
  sessions.failSend = false;
  const g = goal(P);
  assert.equal(g.status, 'paused');
  assert.match(g.reason!, /^Its message could not be sent: the agent is gone/);
  assert.equal(g.round, undefined);
  assert.equal(notices.at(-1)!.kind, 'waiting');
  await act(P, { action: 'resume' });
  assert.equal(goal(P).status, 'working');
  await act(P, { action: 'stop' });
  await act(P, { action: 'stop' });
});

// ---- the person's say on a round ---------------------------------------------------------------------------------------

const K = 'claude:goal-keep';
const wtK = worktree();
sessions.add(K, { cwd: wtK.path, worktree: wtK });

test('keep anyway, undo, and another way from a round: the files follow, between rounds only', async () => {
  await agreed(K);
  await turn(K, () => write(wtK.path, 'score.txt', '6\n'));
  await turn(K, () => {
    write(wtK.path, 'score.txt', '5\n');
    write(wtK.path, 'idea.txt', 'a different idea\n');
  });
  assert.equal(goal(K).rounds[2].outcome, 'undone');
  assert.equal(file(wtK.path, 'idea.txt'), null);
  await rejects(act(K, { action: 'round', n: 2, do: 'keep' }), 409, /Wait for the round to end, or pause the goal first/);
  await stopAgent(K);
  await act(K, { action: 'round', n: 2, do: 'keep', reason: 'I like the idea', relax: { c2: 5 } });
  let g = goal(K);
  assert.equal(file(wtK.path, 'idea.txt'), 'a different idea\n', 'the files are round 2’s');
  assert.equal(file(wtK.path, 'score.txt'), '5\n');
  assert.equal(g.best, 2);
  assert.equal(g.rounds[2].outcome, 'kept');
  assert.equal(g.rounds[2].by, 'you');
  assert.equal(g.rounds[2].reason, 'I like the idea');
  assert.equal(g.rounds[2].cause, undefined, 'kept by the person: nothing kept it from being kept');
  assert.equal(g.contract.checks[1].target!.value, 5);
  assert.equal(g.rounds[2].results.find((r) => r.id === 'c2')!.holds, true, 'judged again against its new target');
  assert.equal(g.round, undefined, 'the round left unchecked is dropped');
  await rejects(act(K, { action: 'round', n: 0, do: 'undo' }), 409, /Only a kept round/);
  await rejects(act(K, { action: 'round', n: 9, do: 'keep' }), 404);
  await act(K, { action: 'round', n: 2, do: 'undo', reason: 'On second thought, no' });
  g = goal(K);
  assert.equal(file(wtK.path, 'idea.txt'), null);
  assert.equal(file(wtK.path, 'score.txt'), '6\n');
  assert.equal(g.best, 1);
  assert.equal(g.rounds[2].outcome, 'undone');
  assert.deepEqual(g.dropped.at(-1), { text: 'On second thought, no', by: 'you' });
  await act(K, { action: 'round', n: 1, do: 'from' });
  await act(K, { action: 'resume' });
  // Last round is where the person went back to, and what the rounds after it tried (D5), not round 2's outcome as such.
  assert.match(last(K), /Last round: the user took the files back to round 1, to go on from there another way: the files stand as they were after round 1\. What the rounds after it tried \(go another way, do not repeat these\):\n- Round 2: no report of what it did \(undone: On second thought, no\)/);
  assert.doesNotMatch(last(K), /Last round: undone/);
  assert.match(last(K), /Tried and dropped:\n- On second thought, no \(the user\)/);
  await act(K, { action: 'stop' });
  await act(K, { action: 'stop' });
});

// ---- the tick after a restart ------------------------------------------------------------------------------------------

const R = 'claude:goal-restart';
const wtR = worktree();
sessions.add(R, { cwd: wtR.path, worktree: wtR });

test('a restart in checking: the tick runs the checks again', async () => {
  await agreed(R);
  write(wtR.path, 'score.txt', '7\n');
  // The app went down while the checks ran: the table says checking, and nothing is at work on it.
  const g = loadGoal(db, R)!;
  g.status = 'checking';
  saveGoal(db, g);
  assert.equal(isDriving(R), false);
  await tick(deps);
  const after = goal(R);
  assert.equal(after.rounds[1].outcome, 'kept');
  assert.equal(after.rounds[1].results.find((r) => r.id === 'c2')!.value, 7);
  assert.equal(after.status, 'working');
  assert.equal(after.round, 2);
});

test('a turn’s end the loop never heard of: the tick finds it ended and the session idle', async () => {
  await turn(R, () => write(wtR.path, 'score.txt', '9\n'), { tell: false });
  assert.equal(goal(R).rounds.length, 2);
  await tick(deps);
  assert.equal(goal(R).rounds.length, 3);
  assert.equal(goal(R).rounds[2].outcome, 'kept');
  // Nothing new ended: the tick leaves it alone (and never touches the session).
  const before = sent(R);
  await tick(deps);
  assert.equal(sent(R), before);
  await act(R, { action: 'stop' });
});

test('a restart while measuring: the tick measures again', async () => {
  const M = 'claude:goal-measure';
  sessions.add(M, { cwd: PLAIN });
  await act(M, { action: 'set', objective: 'Readme exists' });
  const g = loadGoal(db, M)!;
  g.contract.checks = [{ id: 'c1', kind: 'command', label: 'Readme exists', run: 'test -f readme.md' }];
  g.status = 'measuring';
  saveGoal(db, g);
  await tick(deps);
  assert.equal(goal(M).status, 'agreeing');
  assert.equal(goal(M).rounds[0].results[0].holds, true);
  // Every check holds already: reached at once when agreed.
  await act(M, { action: 'agree' });
  assert.equal(goal(M).status, 'reached');
  assert.equal(goal(M).report!.summary, 'The check held when the app first measured where things stand, before any round: this already holds.');
});

// ---- checks only the person can confirm, and being blocked --------------------------------------------------------------

const Y = 'claude:goal-yours';
const wtY = worktree();
sessions.add(Y, { cwd: wtY.path, worktree: wtY });

test('a check only the person confirms: once all others hold and the final check passes, it asks them; It holds reaches it', async () => {
  await agreed(Y, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }, { kind: 'you', label: 'The wording reads well' }] });
  await turn(Y, () => write(wtY.path, 'done.txt', 'Done.\n'));
  let g = goal(Y);
  assert.equal(g.status, 'needs-you');
  assert.equal(g.question!.kind, 'yours');
  assert.equal(g.question!.question, 'The wording reads well');
  assert.equal(g.question!.expiresAt, undefined, 'it waits for the person');
  assert.equal(goalInfo(db, Y)!.status, 'blocked');
  assert.match(notices.at(-1)!.body, /The goal needs you: does “The wording reads well” hold\?/);
  await tick(deps, Date.now() + 24 * 3600_000);
  assert.equal(goal(Y).status, 'needs-you', 'no clock');
  // Not yet: the note goes into the next round.
  await act(Y, { action: 'answer', ways: [1], note: 'Too formal.' });
  assert.match(last(Y), /The goal: “[^”]+”\n\nEvery other check holds, but the user says “The wording reads well” does not hold yet: Too formal\. Put that right; the checks run again when your turn ends, and the user is asked again\./);
  assert.match(last(Y), /Put right what the user says, check your work as you go/);
  await turn(Y, () => write(wtY.path, 'done.txt', 'All done!\n'));
  g = goal(Y);
  assert.equal(g.status, 'needs-you');
  await act(Y, { action: 'answer', ways: [0] });
  g = goal(Y);
  assert.equal(g.status, 'reached');
  assert.equal(g.report!.final!.find((r) => r.id === 'c2')!.holds, true);
  assert.equal(g.report!.summary, 'All 2 checks hold: in the last round, and the one that runs a command again on a second run. A review of the whole change found the goal met. You confirmed “The wording reads well”.');
  assert.equal(g.report!.review, 'The change meets the goal: score.txt says 10.');
});

test('blocked on something only the person can give: a question when the turn ends, and their answer goes to the next round', async () => {
  const B = 'claude:goal-blocked';
  const wtB = worktree();
  sessions.add(B, { cwd: wtB.path, worktree: wtB });
  await agreed(B);
  await turn(B, async () => {
    write(wtB.path, 'score.txt', '4\n');
    await tool(B, 'goal_report', { did: 'Got halfway.', blocked: 'Which scoring service should I call?' });
  });
  const g = goal(B);
  assert.equal(g.status, 'needs-you');
  assert.equal(g.question!.kind, 'blocked');
  assert.equal(g.reason, 'Which scoring service should I call?');
  assert.equal(g.rounds[1].did, 'Got halfway.');
  await act(B, { action: 'answer', ways: [], note: 'Use the local one.' });
  assert.match(last(B), /You asked: Which scoring service should I call\? The user answers: Use the local one\./);
  await act(B, { action: 'stop' });
});

test('a final check that fails: why goes with the round, and the rounds go on', async () => {
  const F = 'claude:goal-final';
  const wtF = worktree();
  sessions.add(F, { cwd: wtF.path, worktree: wtF });
  await agreed(F, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }] });
  reviewer.final = { ok: false, reason: 'done.txt was written by hand, nothing was done.' };
  await turn(F, () => write(wtF.path, 'done.txt', 'x\n'));
  let g = goal(F);
  assert.equal(g.status, 'working');
  assert.match(g.rounds[1].why!, /The final check: done\.txt was written by hand/);
  assert.match(last(F), /The final check: done\.txt was written by hand/);
  // D3: what the final check found comes first, right after the goal, and the message closes on putting it right.
  assert.match(last(F), /The goal: “[^”]+”\n\nEvery check holds, but the final check did not pass: done\.txt was written by hand, nothing was done\. Put that right; the checks and the final check run again when your turn ends\.\n\nHolds: Done file exists/);
  assert.match(last(F), /Put right what the final check found, check your work as you go/);
  assert.doesNotMatch(last(F), /Work on what does not hold yet/);
  assert.ok(!last(F).includes('..'), 'the reviewer’s reason ends with a full stop: one, not two (F18)');
  // A reviewer that cannot answer pauses it rather than spend rounds (a round that changed the files, so it is kept and looked at).
  reviewer.final = 'error';
  await turn(F, () => write(wtF.path, 'done.txt', 'done properly\n'));
  g = goal(F);
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, 'The reviewer could not be reached, so the final check did not run. Resume to try again. (The helper model did not answer)');
  reviewer.final = { ok: true, reason: 'Fine.' };
  await act(F, { action: 'resume' });
  assert.equal(goal(F).status, 'reached');
  assert.equal(goal(F).report!.summary, 'The check holds: in the last round, and again on a second run. A review of the whole change found the goal met.');
  reviewer.final = { ok: true, reason: 'The change meets the goal: score.txt says 10.' };
});

test('rules for every round: a round that broke one is undone; rules and unrule', async () => {
  const U = 'claude:goal-rules';
  const wtU = worktree();
  sessions.add(U, { cwd: wtU.path, worktree: wtU });
  await agreed(U);
  await act(U, { action: 'rule', text: 'No new files' });
  const id = goal(U).rules[0].id;
  assert.match(last(U), /round 1/, 'a rule changes no message already sent');
  reviewer.broke = 'No new files';
  await turn(U, () => {
    write(wtU.path, 'score.txt', '6\n');
    write(wtU.path, 'extra.txt', 'new\n');
  });
  assert.equal(goal(U).rounds[1].outcome, 'undone');
  assert.equal(goal(U).rounds[1].why, 'It broke a rule of yours: “No new files”: It added a dependency.');
  assert.equal(goal(U).rounds[1].cause, 'rule');
  assert.ok(asked.some((a) => a.system.includes('broke a rule') && a.prompt.includes('1. No new files') && a.prompt.includes('extra.txt')));
  // The rules' reviewer is told which round it is and what was kept before it (a rule about order, "first this, that only
  // later", cannot be judged from one round's change: on a real goal a later round doing the later part was undone for it),
  // gets the change with its files named first, and is the stronger reviewer.
  const ruleAsk = asked.find((a) => a.system.includes('broke a rule'))!;
  assert.match(ruleAsk.prompt, /<round>\nThis is round 1\. No round was kept before it\.\n<\/round>\n\n<change>\nEvery file that changed \(/);
  assert.equal(ruleAsk.strong, true);
  assert.match(last(U), /From the user \(follow these first\):\n- No new files/);
  reviewer.broke = false;
  await act(U, { action: 'unrule', id });
  assert.deepEqual(goal(U).rules, []);
  await act(U, { action: 'stop' });
});

// ---- nothing the agent proposed runs before the person agrees ---------------------------------------------------------

test('where the agent asks before commands, its proposal waits unmeasured, nothing run; Start measures it, then round 1', async () => {
  const Q = 'claude:goal-asks';
  const wtQ = worktree();
  sessions.add(Q, { cwd: wtQ.path, worktree: wtQ, mode: 'default' });
  await act(Q, { action: 'set', objective: 'Score reaches 10' });
  const checks = [
    { kind: 'command', label: 'Ran', run: 'touch ran.txt && false' },
    { kind: 'measure', label: 'Score', run: 'cat score.txt', target: { op: '>=', value: 10 } },
    { kind: 'review', label: 'Readable', claim: 'The code reads well', evidence: { run: 'touch review-ran.txt; echo ok' } },
  ];
  await turn(Q, async () => {
    const r = await tool(Q, 'goal_propose', { checks });
    assert.equal(r.text, 'Shown to the user. Stop now: when they agree, the app measures where things stand and the rounds start.');
  });
  let g = goal(Q);
  assert.equal(g.status, 'agreeing', 'straight to the person');
  assert.deepEqual(g.rounds, [], 'no round 0 yet');
  assert.equal(g.best, undefined);
  assert.equal(file(wtQ.path, 'ran.txt'), null, 'the agent’s command did not run');
  assert.equal(file(wtQ.path, 'review-ran.txt'), null, 'nor the command a review reads');
  assert.equal(notices.at(-1)!.body, 'The goal’s checks are ready for you');
  assert.deepEqual(goalInfo(db, Q)!.app, { state: 'agreeing', round: undefined, rounds: 30, holds: 0, of: 3 });
  // Changing a check while it waits measures nothing either.
  await act(Q, { action: 'change', contract: { checks: g.contract.checks.map((c) => (c.id === 'c2' ? { ...c, label: 'The score' } : c)) } });
  assert.equal(goal(Q).status, 'agreeing');
  assert.deepEqual(goal(Q).rounds, []);
  // Paused and resumed while it waits: back to waiting, still nothing run.
  await act(Q, { action: 'pause' });
  await act(Q, { action: 'resume' });
  assert.equal(goal(Q).status, 'agreeing');
  assert.equal(file(wtQ.path, 'ran.txt'), null);
  await act(Q, { action: 'agree' });
  await until('round 1', () => goal(Q).status !== 'measuring');
  g = goal(Q);
  assert.equal(g.status, 'working');
  assert.equal(g.round, 1);
  assert.equal(file(wtQ.path, 'ran.txt'), '', 'run once the person agreed');
  assert.equal(file(wtQ.path, 'review-ran.txt'), '');
  assert.deepEqual(
    g.rounds[0].results.map((r) => [r.id, r.holds, r.value]),
    [
      ['c1', false, undefined],
      ['c2', false, 2],
      ['c3', true, undefined],
    ],
  );
  assert.ok(g.rounds[0].checkpoint, 'the start is where the files stood when the person agreed');
  assert.equal(g.contract.checks[1].label, 'The score');
  await act(Q, { action: 'stop' });
});

test('a check that could not run at Start goes back to the person, once; Start again goes ahead without running it again', async () => {
  const E = 'claude:goal-start-error';
  sessions.add(E, { cwd: PLAIN, mode: 'default' });
  await act(E, { action: 'set', objective: 'Readme exists' });
  await turn(E, async () => {
    await tool(E, 'goal_propose', { checks: [{ kind: 'command', label: 'Readme exists', run: 'test -f readme.md' }, { kind: 'command', label: 'Lint', run: 'echo run >> lint-runs.log; no-such-linter-for-goals' }] });
  });
  await act(E, { action: 'agree' });
  await until('measured', () => goal(E).status !== 'measuring');
  let g = goal(E);
  assert.equal(g.status, 'agreeing');
  assert.equal(g.reason, 'A check could not run');
  assert.equal(g.rounds[0].results.find((r) => r.id === 'c2')!.error, 'The command was not found');
  assert.equal(notices.at(-1)!.body, 'A check could not run: Lint (The command was not found)');
  assert.equal(goalInfo(db, E)!.status, 'blocked');
  assert.equal(file(PLAIN, 'lint-runs.log'), 'run\n');
  const before = sent(E);
  await act(E, { action: 'agree' });
  g = goal(E);
  assert.equal(g.status, 'working', 'the same checks a second time: round 1 starts');
  assert.equal(g.reason, undefined);
  assert.equal(g.round, 1);
  assert.equal(sent(E), before + 1);
  assert.equal(file(PLAIN, 'lint-runs.log'), 'run\n', 'not run again at the second Start');
  await act(E, { action: 'stop' });
  fs.rmSync(path.join(PLAIN, 'lint-runs.log'));
});

test('which sessions run the proposal at once: only where the agent never asks, never a confidential one; checks that run no command are measured at once anywhere', async () => {
  const cases: [string, Partial<Fake>, boolean][] = [
    ['claude:m-bypass', { mode: 'bypassPermissions' }, true],
    ['claude:m-default', { mode: 'default' }, false],
    ['claude:m-edits', { mode: 'acceptEdits' }, false],
    ['claude:m-auto', { mode: 'auto' }, false],
    ['claude:m-none', { mode: undefined }, false],
    ['codex:m-full', { agent: 'codex', mode: 'full' }, true],
    ['codex:m-auto', { agent: 'codex', mode: 'auto' }, false],
    ['acp:m-custom-full', { agent: 'acp', acpAgent: 'console', mode: 'full' }, true],
    ['acp:m-custom-auto', { agent: 'acp', acpAgent: 'console', mode: 'auto' }, false],
    ['acp:m-other-full', { agent: 'acp', acpAgent: 'gemini', mode: 'full' }, false],
  ];
  for (const [key, f, want] of cases) {
    sessions.add(key, { cwd: PLAIN, ...f });
    assert.equal(runsUnasked(deps, key), want, key);
  }
  sessions.add('claude:m-secret', { cwd: PLAIN, mode: 'bypassPermissions' });
  setSessionExtra(db, 'claude:m-secret', { confidential: true });
  assert.equal(runsUnasked(deps, 'claude:m-secret'), false, 'a confidential session’s checks would run outside its sandbox');
  assert.equal(runsUnasked(deps, 'claude:m-nobody'), false);
  assert.equal(runsCommand({ id: 'c1', kind: 'command', label: 'x', run: 'x' }), true);
  assert.equal(runsCommand({ id: 'c1', kind: 'measure', label: 'x', run: 'x' }), true);
  assert.equal(runsCommand({ id: 'c1', kind: 'review', label: 'x', claim: 'y', evidence: { run: 'x' } }), true);
  assert.equal(runsCommand({ id: 'c1', kind: 'review', label: 'x', claim: 'y', evidence: { diff: true, files: ['a'] } }), false);
  assert.equal(runsCommand({ id: 'c1', kind: 'you', label: 'x' }), false);
  // Codex at full access: measured at once.
  await act('codex:m-full', { action: 'set', objective: 'Readme exists' });
  await turn('codex:m-full', async () => {
    await tool('codex:m-full', 'goal_propose', { checks: [{ kind: 'command', label: 'Readme exists', run: 'test -f readme.md' }] });
  });
  await until('agreeing', () => goal('codex:m-full').status === 'agreeing');
  assert.equal(goal('codex:m-full').rounds[0].results[0].holds, true);
  // A review of the change alone, where the agent asks: measured at once, since no command runs.
  await act('claude:m-default', { action: 'set', objective: 'The readme is warm' });
  await turn('claude:m-default', async () => {
    await tool('claude:m-default', 'goal_propose', { checks: [{ kind: 'review', label: 'Warm', claim: 'The readme greets warmly', evidence: { files: ['readme.md'] } }] });
  });
  await until('agreeing', () => goal('claude:m-default').status === 'agreeing');
  assert.equal(goal('claude:m-default').rounds.length, 1);
  // Confidential with bypass: waits for the person.
  await act('claude:m-secret', { action: 'set', objective: 'Readme exists' });
  await turn('claude:m-secret', async () => {
    await tool('claude:m-secret', 'goal_propose', { checks: [{ kind: 'command', label: 'Readme exists', run: 'test -f readme.md' }] });
  });
  assert.equal(goal('claude:m-secret').status, 'agreeing');
  assert.deepEqual(goal('claude:m-secret').rounds, []);
});

// ---- refusals, tools, routes, the summary, a session started with a goal -------------------------------------------------

test('refused for a Hydor subagent, a session run outside the app, and Plan mode', async () => {
  sessions.add('claude:goal-child', { cwd: PLAIN });
  setSessionExtra(db, 'claude:goal-child', { parent: W });
  await rejects(act('claude:goal-child', { action: 'set', objective: 'x' }), 400, /Hydor subagent/);
  sessions.add('claude:goal-ext', { cwd: PLAIN, external: true, live: undefined });
  await rejects(act('claude:goal-ext', { action: 'set', objective: 'x' }), 400, /outside the app/);
  sessions.add('claude:goal-plan', { cwd: PLAIN, mode: 'plan' });
  await rejects(act('claude:goal-plan', { action: 'set', objective: 'x' }), 400, /Plan mode/);
  sessions.add('codex:goal-ro', { agent: 'codex', cwd: PLAIN, mode: 'read-only' });
  await rejects(act('codex:goal-ro', { action: 'set', objective: 'x' }), 400, /Plan mode/);
  await rejects(act('claude:goal-plan', { action: 'pause' }), 409, /no goal/);
  await rejects(act('claude:goal-nobody', { action: 'set', objective: 'x' }), 404);
});

test('S1: a session that leads a swarm may have a goal (its draft says the members come with the first round); a campaign, a deep research or an arena match is refused, each with its sentence', async () => {
  const SW = 'claude:goal-g1-swarm';
  sessions.add(SW, { cwd: PLAIN });
  setSessionExtra(db, SW, { swarm: true });
  await act(SW, { action: 'set', objective: 'Make it fast' });
  assert.equal(goal(SW).status, 'drafting');
  assert.match(last(SW), /Do no work on it yet\. Do not start your swarm’s members yet: they come with the first round\.\nRead the project/);
  await act(SW, { action: 'stop' });
  // Started with a goal: what goes with its first message says the same.
  const SN = 'claude:goal-g1-swarm-start';
  sessions.add(SN, { cwd: PLAIN });
  setSessionExtra(db, SN, { swarm: true });
  assert.match((await goalOnCreate(deps, SN, 'Make it fast', { asks: 'own', noAnswerMin: 0 }))!, /Do no work on it yet\. Do not start your swarm’s members yet: they come with the first round\.\nRead the project/);
  await act(SN, { action: 'stop' });
  const cases: [string, Record<string, unknown>, string][] = [
    ['claude:goal-g1-campaign', { swarm: 'campaign' }, 'This session leads a campaign: a goal works with a swarm, not with a campaign yet.'],
    ['claude:goal-g1-research', { research: { depth: 'quick' } }, 'This session leads a deep research: a goal does not go with it.'],
    ['claude:goal-g1-arena', { arena: 'match1' }, 'This session is in an arena match: a goal does not go with it.'],
  ];
  for (const [key, extra, why] of cases) {
    sessions.add(key, { cwd: PLAIN });
    setSessionExtra(db, key, extra);
    await rejects(act(key, { action: 'set', objective: 'Make it fast' }), 400, new RegExp(`^${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    assert.equal(loadGoal(db, key), null);
    // Nothing for the agent to propose to either.
    assert.equal((await tool(key, 'goal_propose', { checks: CHECKS })).text, 'This session has no goal.');
  }
  assert.equal(teamRefusal({ swarm: true }), null);
  assert.equal(teamRefusal({ swarm: false }), null);
  assert.equal(teamRefusal({}), null);
  assert.equal(teamRefusal(undefined), null);
  // A plain session's draft is as it was.
  assert.doesNotMatch(draftMessage('Make it fast'), /swarm/);
});

test('the tools: without a goal they say so; a scheduled run cannot use them; confidential sessions keep them', async () => {
  sessions.add('claude:goal-none', { cwd: PLAIN });
  for (const [name, args] of [
    ['goal_propose', { checks: CHECKS }],
    ['goal_report', { did: 'x' }],
    ['goal_ask', { question: 'q', ways: [{ name: 'a' }, { name: 'b' }], pick: 1 }],
    ['goal_note', { text: 'x' }],
  ] as const) {
    const r = await tool('claude:goal-none', name, args);
    assert.equal(r.text, 'This session has no goal.', name);
  }
  inScheduledRun = true;
  assert.equal((await tool('claude:goal-none', 'goal_note', { text: 'x' })).text, 'A scheduled run cannot work on a goal.');
  inScheduledRun = false;
  for (const t of GOAL_TOOLS) assert.ok(CONFIDENTIAL_TOOLS.has(t.name), t.name);
  assert.deepEqual(
    goals.tools!(ctxOf('claude:goal-none')).map((t) => t.name),
    ['goal_propose', 'goal_report', 'goal_ask', 'goal_note'],
  );
  // A note is kept for later rounds, at most 30.
  const T = 'claude:goal-notes';
  sessions.add(T, { cwd: PLAIN });
  await act(T, { action: 'set', objective: 'x' });
  for (let i = 0; i < 32; i++) await tool(T, 'goal_note', { text: `note ${i}` });
  assert.equal(goal(T).dropped.length, 30);
  assert.equal(goal(T).dropped[0].text, 'note 2');
  assert.equal((await tool(T, 'goal_note', { text: 'y' })).text, 'Kept for later rounds.');
  await act(T, { action: 'pause' });
  assert.match((await tool(T, 'goal_propose', { checks: CHECKS })).text, /paused/);
});

test('the routes: GET the goal without the loop’s own fields; every action checked field by field', async () => {
  const routes = new Map<string, (req: unknown) => Promise<unknown>>();
  goals.routes!({ ...deps, app: { get: (p: string, h: (req: unknown) => Promise<unknown>) => routes.set(`GET ${p}`, h) } } as unknown as Deps);
  const r = (await routes.get('GET /api/goals/:key')!({ params: { key: 'claude:goal-notes' } })) as { goal: GoalState };
  assert.equal(r.goal.key, 'claude:goal-notes');
  assert.equal((r.goal as unknown as Record<string, unknown>)._, undefined);
  assert.deepEqual(await routes.get('GET /api/goals/:key')!({ params: { key: 'claude:goal-none' } }), { goal: null });
  const bad = (body: unknown, re: RegExp) => assert.throws(() => parseGoalAction(body), (e: unknown) => e instanceof HttpError && e.status === 400 && re.test(e.message));
  bad({ action: 'fly' }, /Unknown goal action/);
  bad({ action: 'set', objective: ' ' }, /Say what the goal is/);
  bad({ action: 'set', objective: 'x'.repeat(4001) }, /longer than 4000/);
  bad({ action: 'set', objective: 'x', settings: { asks: 'always' } }, /own, forks or every/);
  bad({ action: 'set', objective: 'x', settings: { noAnswerMin: -1 } }, /from 0 to/);
  bad({ action: 'answer', ways: [0, 0] }, /each once/);
  bad({ action: 'answer', ways: [1.5] }, /each once/);
  bad({ action: 'answer', ways: [0], note: 'n'.repeat(2001) }, /2000/);
  bad({ action: 'rule', text: '' }, /what the rule is/);
  bad({ action: 'round', n: -1, do: 'keep' }, /which round/);
  bad({ action: 'round', n: 1, do: 'redo' }, /keep, undo or from/);
  bad({ action: 'round', n: 1, do: 'keep', relax: { c1: 'a lot' } }, /numbers/);
  bad({ action: 'change' }, /what to change/);
  bad({ action: 'settings', settings: {} }, /which setting/);
  assert.deepEqual(parseGoalAction({ action: 'set', objective: ' Ship it ', settings: { asks: 'own' } }), { action: 'set', objective: 'Ship it', settings: { asks: 'own' } });
  assert.deepEqual(parseGoalAction({ action: 'clear' }), { action: 'clear' });
  // Checked against the goal itself: a check without its command, limits out of range.
  const C = 'claude:goal-change';
  const wtC = worktree();
  sessions.add(C, { cwd: wtC.path, worktree: wtC });
  await act(C, { action: 'set', objective: 'x' });
  await rejects(act(C, { action: 'change', contract: { limits: { rounds: 3 } } }), 409, /not proposed/);
  await turn(C, async () => {
    await tool(C, 'goal_propose', { checks: CHECKS });
  });
  await until('agreeing', () => goal(C).status === 'agreeing');
  await rejects(act(C, { action: 'agree', contract: { checks: [{ kind: 'command', label: 'No command' }] as never } }), 400, /needs run/);
  await rejects(act(C, { action: 'agree', contract: { limits: { rounds: 0 } } }), 400, /Rounds are a number from 1/);
  // Agreed with a changed check: measured again, then round 1.
  const checks = goal(C).contract.checks.map((c) => (c.id === 'c1' ? { ...c, run: 'test -f base.txt' } : c));
  await act(C, { action: 'agree', contract: { checks, limits: { rounds: 4 } } });
  await until('round 1', () => goal(C).status === 'working');
  assert.equal(goal(C).rounds[0].results.find((r) => r.id === 'c1')!.holds, true, 'the changed check was measured again');
  assert.equal(goal(C).contract.limits.rounds, 4);
  // A change while a round runs takes effect with the next round: pending until this round is checked, then measured.
  const cur = () => goal(C).pending?.checks ?? goal(C).contract.checks;
  await act(C, { action: 'change', contract: { checks: [...cur(), { kind: 'command', label: 'Readme', run: 'true' }] as never } });
  assert.deepEqual(goal(C).pending!.checks!.map((c) => c.id), ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(goal(C).contract.checks.map((c) => c.id), ['c1', 'c2', 'c3'], 'the round runs with the checks it started with');
  assert.equal(loadGoal(db, C)!._.remeasure, undefined);
  // Ids are the server's: an unknown one is refused; an empty one is a new check.
  await rejects(act(C, { action: 'change', contract: { checks: [...cur(), { id: 'c9', kind: 'command', label: 'Mine', run: 'true' }] } }), 400, /does not have \(c9\)/);
  await rejects(act(C, { action: 'change', contract: { checks: [...cur(), cur()[0]] } }), 400, /repeats c1/);
  await act(C, { action: 'change', contract: { checks: [...cur(), { id: '', kind: 'command', label: 'Empty id', run: 'true' }] as never } });
  assert.deepEqual(cur().map((c) => c.id), ['c1', 'c2', 'c3', 'c4', 'c5']);
  // A check removed and one added: never the removed one's id, even though no round measured it yet.
  await act(C, { action: 'change', contract: { checks: [...cur().filter((c) => c.id !== 'c5'), { kind: 'command', label: 'Another', run: 'true' }] as never } });
  assert.deepEqual(cur().map((c) => c.id), ['c1', 'c2', 'c3', 'c4', 'c6']);
  await rejects(act(C, { action: 'change', contract: { checks: [...cur(), { id: 'c5', kind: 'command', label: 'Back', run: 'true' }] } }), 400, /does not have \(c5\)/);
  // A known id replaces its check.
  await act(C, { action: 'change', contract: { checks: cur().map((c) => (c.id === 'c6' ? { ...c, label: 'Another, renamed' } : c)) } });
  assert.equal(cur().find((c) => c.id === 'c6')!.label, 'Another, renamed');
  await act(C, { action: 'change', contract: { checks: cur().filter((c) => c.id !== 'c6') } });
  await turn(C, () => write(wtC.path, 'score.txt', '5\n'));
  const g = goal(C);
  assert.equal(g.rounds[1].outcome, 'kept', 'judged by the checks it started with');
  assert.equal(g.rounds[1].why, 'Score 2 → 5');
  assert.equal(g.pending, undefined);
  assert.deepEqual(g.contract.checks.map((c) => c.id), ['c1', 'c2', 'c3', 'c4']);
  assert.equal(g.rounds[0].results.find((r) => r.id === 'c4')!.holds, true, 'the new check was measured before the next round');
  assert.equal(g.rounds[0].results.find((r) => r.id === 'c4')!.since, 1, 'and the start says it was first measured after round 1 (F19)');
  assert.equal(g.rounds[0].results.find((r) => r.id === 'c1')!.since, undefined, 'a check measured at the start says nothing');
  // An id any round's results used is never given again.
  await act(C, { action: 'change', contract: { checks: [...g.contract.checks.filter((c) => c.id !== 'c4'), { kind: 'command', label: 'Last', run: 'true' }] as never } });
  assert.equal(cur().at(-1)!.id, 'c7');
  assert.equal(g.status, 'working');
  await act(C, { action: 'stop' });
});

test('a session started with a goal hears what the loop asks with its first message, until its first turn ends', async () => {
  const S = 'claude:goal-start';
  const spawnOf = (s: SpawnInfo) => goals.spawn!(s, deps) as SpawnAdditions | undefined;
  assert.match(String(spawnOf({ agent: 'claude', key: S, cwd: PLAIN, runId: 'r', resume: false, extra: { goal: { asks: 'own', start: true } }, prompt: 'Make the readme warm' })?.notes?.[0]), /^\[Goal · agree the checks\]/);
  assert.equal(spawnOf({ agent: 'claude', key: S, cwd: PLAIN, runId: 'r', resume: true, extra: { goal: { start: true } }, prompt: 'x' }), undefined, 'not when it resumes');
  assert.equal(spawnOf({ agent: 'claude', key: S, cwd: PLAIN, runId: 'r', resume: false, extra: {} }), undefined);
  sessions.add(S, { cwd: PLAIN });
  const before = sent(S);
  const notes = await goalOnCreate(deps, S, 'Make the readme warm', { asks: 'own', noAnswerMin: 0 });
  assert.match(notes!, /The user’s message below is a goal/);
  assert.equal(sent(S), before, 'the first message is the goal: nothing else goes out');
  assert.deepEqual(goal(S).settings, { asks: 'own', noAnswerMin: 0 });
  // Its agent starting again before the first message: it still hears it.
  assert.ok(spawnOf({ agent: 'claude', key: S, cwd: PLAIN, runId: 'r2', resume: true, extra: {} })?.notes?.length);
  await turn(S);
  assert.equal(spawnOf({ agent: 'claude', key: S, cwd: PLAIN, runId: 'r3', resume: true, extra: {} }), undefined);
  assert.equal(headOf(S), 'agree the checks', 'the reminder after a first turn without a proposal');
  // Never in a scheduled run or a try of an agent's examples: ignored without a word.
  for (const extra of [{ automations: { task: 't', run: 'r' } }, { agentExample: { agent: 'a', run: 'r', example: 'e' } }]) {
    assert.equal(goalStartIgnored(extra), true, JSON.stringify(extra));
    assert.equal(spawnOf({ agent: 'claude', cwd: PLAIN, runId: 'rx', resume: false, extra: { ...extra, goal: { start: true } }, prompt: 'x' } as SpawnInfo), undefined, JSON.stringify(extra));
  }
  // S1: a swarm's lead started with a goal hears it, with its members to wait for the first round; a campaign, a deep
  // research or an arena match is refused with its sentence (the person hears it: goalNotSetText), not ignored.
  assert.equal(goalStartIgnored({ swarm: true }), false);
  assert.equal(goalStartRefusal({ request: 'x', agent: 'claude', extra: { swarm: true } }), null);
  assert.match(String(spawnOf({ agent: 'claude', cwd: PLAIN, runId: 'rs', resume: false, extra: { swarm: true, goal: { start: true } }, prompt: 'x' } as SpawnInfo)?.notes?.[0]), /Do not start your swarm’s members yet: they come with the first round\./);
  for (const [extra, why] of [
    [{ swarm: 'campaign' }, 'This session leads a campaign: a goal works with a swarm, not with a campaign yet.'],
    [{ research: { depth: 'quick' } }, 'This session leads a deep research: a goal does not go with it.'],
    [{ arena: 'match1' }, 'This session is in an arena match: a goal does not go with it.'],
  ] as const) {
    assert.equal(goalStartIgnored(extra), false, JSON.stringify(extra));
    assert.equal(goalStartRefusal({ request: 'x', agent: 'claude', extra: extra as never }), why);
  }
  assert.equal(goalStartIgnored({ goal: { start: true }, memory: false }), false);
  assert.equal(goalStartIgnored(undefined), false);
  // Refused where a goal cannot be: nothing set, no notes.
  sessions.add('claude:goal-start-plan', { cwd: PLAIN, mode: 'plan' });
  assert.equal(await goalOnCreate(deps, 'claude:goal-start-plan', 'x'), null);
  assert.equal(loadGoal(db, 'claude:goal-start-plan'), null);
});

// ---- what the review found: never lose work, never freeze, never leave the sandbox, never get stuck -------------------

/** Touched by the slow check as it starts, so a test acts while it runs whatever the load on the computer. */
const CHECKING = path.join(tmp, 'checking');
const SLOW_SCORE = [{ kind: 'measure', label: 'Score', run: `touch ${CHECKING}; sleep 1; cat score.txt`, target: { op: '>=', value: 10 } }];
/** Does `fn` once the slow check of the next round has started. */
async function whileChecking(fn: () => unknown) {
  await until('the checks to run', () => fs.existsSync(CHECKING), 30_000);
  await fn();
}
const checkingSoon = () => fs.rmSync(CHECKING, { force: true });

/** A worktree session at round 2 of a goal whose round 1 raised the score to 6 (its check takes a second). */
async function atRound2(key: string, o: { checks?: unknown[]; protect?: string[]; settings?: Record<string, unknown>; mode?: string } = {}) {
  const w = worktree();
  sessions.add(key, { cwd: w.path, worktree: w, ...(o.mode ? { mode: o.mode } : {}) });
  await agreed(key, { checks: o.checks ?? SLOW_SCORE, protect: o.protect, settings: o.settings ?? { asks: 'own' } });
  await turn(key, () => write(w.path, 'score.txt', '6\n'));
  assert.equal(goal(key).rounds[1].outcome, 'kept');
  assert.equal(goal(key).round, 2);
  return w;
}

/**
 * Paused with the round at work left unchecked: the person stops the agent. (Pause itself now waits for that round to be
 * checked, P1: this is how a goal still comes to be paused mid-round, as a failed turn is.)
 */
async function stopAgent(key: string) {
  await turn(key, () => {}, { status: 'interrupted' });
  assert.equal(goal(key).status, 'paused');
  assert.equal(goal(key).reason, 'You stopped the agent.');
}

/** Changes the stored goal as a test needs it (a state the app stored before, or after a restart). */
function remember(key: string, set: (g: ReturnType<typeof goal>) => void) {
  const g = loadGoal(db, key)!;
  set(g);
  saveGoal(db, g);
}

/** A reset that fails halfway: it really resets to the checkpoint's commit (the first of its steps), then fails, as a clean that cannot remove a file does. */
let resets = 0;
async function resetsThenFails(wt: WorktreeInfo, commit: string) {
  resets++;
  git(wt.path, 'reset', '-q', '--hard', git(wt.path, 'rev-parse', `${commit}^`));
  throw new Error('Could not restore the files: warning: failed to remove build/: Permission denied');
}

/** The safety checkpoints (and others) of a worktree, by ref, and those made since `before`. */
const ckptRefs = (w: WorktreeInfo) => git(w.path, 'for-each-ref', '--format=%(refname) %(objectname)', `refs/hydor/checkpoints/${path.basename(w.path)}/`).split('\n').filter(Boolean);
const newCkpts = (w: WorktreeInfo, before: string[]) => ckptRefs(w).filter((r) => !before.includes(r)).map((r) => r.split(' ')[1]);

/** Runs the commands a refusal for files changed outside the goal gives, exactly as written, in the folder it names. */
function runAdvice(why: string) {
  const m = /, run (?:this|these) in (\S+) \(the worktree’s top folder[^)]*\): (.*)\. Then try again\.$/.exec(why);
  assert.ok(m, why);
  for (const c of m![2].split(', then ')) execFileSync('bash', ['-c', c], { cwd: m![1], stdio: 'pipe' });
}

/** What a checkpoint holds of a file (null when it holds no such file). */
const inCheckpoint = (dir: string, commit: string, f: string) => {
  try {
    return execFileSync('git', ['show', `${commit}:${f}`], { cwd: dir, stdio: 'pipe' }).toString();
  } catch {
    return null;
  }
};

test('H2, an undone round: this session worked while the checks ran (the person’s message began a turn): the round is checked again once it is quiet; three times and the goal pauses', async () => {
  const K1 = 'claude:goal-a1-files';
  const w = await atRound2(K1);
  const f = sessions.all.get(K1)!;
  // The person's message began a turn while the checks ran (a second), and wrote a file.
  checkingSoon();
  const t = whileChecking(() => {
    f.items.push({ kind: 'user', id: 'meanwhile', seq: 0, ts: Date.now(), text: 'Also add a note' } as TimelineItem);
    write(w.path, 'person.txt', 'mine\n');
  });
  await turn(K1, () => write(w.path, 'score.txt', '3\n'));
  await t;
  let g = goal(K1);
  assert.equal(g.status, 'working', 'not paused: the round is not over');
  assert.equal(g.round, 2);
  assert.equal(g.rounds.length, 2, 'nothing recorded');
  assert.equal(file(w.path, 'person.txt'), 'mine\n', 'nothing put back');
  assert.equal(file(w.path, 'score.txt'), '3\n');
  // That turn ends: the round is checked again, the session quiet now, and undone; all of it is in its checkpoint.
  await turn(K1);
  g = goal(K1);
  assert.equal(g.rounds[2].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  assert.equal(inCheckpoint(w.path, g.rounds[2].checkpoint!, 'person.txt'), 'mine\n');
  await act(K1, { action: 'stop' });
  // Three times in one round: the goal pauses, with a sentence.
  const K1b = 'claude:goal-h2-thrice';
  const w2 = await atRound2(K1b);
  const f2 = sessions.all.get(K1b)!;
  for (let i = 0; i < 3; i++) {
    checkingSoon();
    const c = whileChecking(() => f2.items.push({ kind: 'user', id: `again${i}`, seq: 0, ts: Date.now(), text: 'more' } as TimelineItem));
    await turn(K1b, () => write(w2.path, 'score.txt', '3\n'));
    await c;
  }
  assert.equal(goal(K1b).status, 'paused');
  assert.equal(goal(K1b).reason, 'Round 2 could not be checked: the session kept working in the folder while its checks ran. Resume to check it again.');
  assert.equal(file(w2.path, 'score.txt'), '3\n');
  await act(K1b, { action: 'stop' });
});

test('Keep anyway on a round without results while the goal is going on: measured first, then the next round from its files', async () => {
  const E2 = 'claude:goal-e2-going';
  const w = worktree();
  sessions.add(E2, { cwd: w.path, worktree: w });
  await agreed(E2, { settings: { asks: 'own' } });
  await turn(E2, () => write(w.path, 'score.txt', '6\n'));
  // A half round a limit stopped (saved, never measured), and a question open: as after Give it more…
  write(w.path, 'score.txt', '8\n');
  const half = (await checkpoint(w))!;
  write(w.path, 'score.txt', '6\n');
  const g = loadGoal(db, E2)!;
  g.rounds.push({ n: 2, startedAt: 1, endedAt: 2, results: [], score: 0, outcome: 'undone', why: 'Stopped at the limit midway', usd: 0, checkpoint: half });
  g.status = 'needs-you';
  g.round = undefined;
  g.question = { id: 'q1', kind: 'blocked', question: 'Which API key?', ways: [], pick: 0, askedAt: Date.now() };
  saveGoal(db, g);
  const n = sent(E2);
  await act(E2, { action: 'round', n: 2, do: 'keep' });
  await until('the next round', () => goal(E2).status === 'working');
  const after = goal(E2);
  assert.equal(after.best, 2);
  assert.equal(after.rounds[2].results.find((r) => r.id === 'c2')!.value, 8, 'measured for its own files');
  assert.equal(after.rounds[0].results.find((r) => r.id === 'c2')!.value, 2, 'the start unchanged');
  assert.equal(sent(E2), n + 1);
  assert.equal(headOf(E2), 'round 3 of 8');
  assert.match(last(E2), /Not yet: Done file exists; Score 8 \(needs ≥ 10\)/);
  await act(E2, { action: 'stop' });
});

test('checks that write files git does not ignore, or a hand edit while the session stayed idle, never stop an undo: the round is undone and all of it is in its checkpoint', async () => {
  const K5 = 'claude:goal-e1-output';
  const checks = [{ kind: 'measure', label: 'Score', run: `touch ${CHECKING}; date +%s%N > result.txt; sleep 1; cat score.txt`, target: { op: '>=', value: 10 } }];
  const w = await atRound2(K5, { checks });
  assert.ok(file(w.path, 'result.txt'), 'its checks write a result file every time');
  checkingSoon();
  const t = whileChecking(() => write(w.path, 'notes.txt', 'by hand\n'));
  await turn(K5, () => write(w.path, 'score.txt', '3\n'));
  await t;
  const g = goal(K5);
  assert.equal(g.status, 'working', 'not paused');
  const r2 = g.rounds[2];
  assert.equal(r2.outcome, 'undone');
  assert.equal(r2.cause, 'behind');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  assert.equal(file(w.path, 'notes.txt'), null);
  // The round's checkpoint is the one taken just before the files went back: the round's work, the hand edit and what the checks wrote.
  assert.equal(inCheckpoint(w.path, r2.checkpoint!, 'score.txt'), '3\n');
  assert.equal(inCheckpoint(w.path, r2.checkpoint!, 'notes.txt'), 'by hand\n');
  assert.ok(inCheckpoint(w.path, r2.checkpoint!, 'result.txt'));
  // Keep anyway brings all of it back.
  await stopAgent(K5);
  await act(K5, { action: 'round', n: 2, do: 'keep' });
  assert.equal(file(w.path, 'notes.txt'), 'by hand\n');
  assert.equal(file(w.path, 'score.txt'), '3\n');
  // A kept round's checks wrote their file after its checkpoint: the person's say is not refused for that.
  await act(K5, { action: 'round', n: 1, do: 'keep' });
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(K5, { action: 'stop' });
});

test('a round is not undone while a message is on its way to the agent, nor when the goal was paused, stopped or replaced while its checks ran', async () => {
  const K2 = 'claude:goal-a1-busy';
  const w = await atRound2(K2);
  const f = sessions.all.get(K2)!;
  // A2: the person's message was taken off the queue and is being handed over (the queue empty, the status still idle).
  checkingSoon();
  const t = whileChecking(() => (f.delivering = true));
  await turn(K2, () => write(w.path, 'score.txt', '3\n'));
  await t;
  assert.equal(goal(K2).status, 'working', 'the round is checked again once the session is quiet');
  assert.equal(goal(K2).rounds.length, 2);
  assert.equal(file(w.path, 'score.txt'), '3\n');
  // While a message is on its way no turn's end counts as the round's; once its turn ended, the round is checked.
  await tick(deps);
  assert.equal(goal(K2).rounds.length, 2);
  f.delivering = false;
  await turn(K2);
  assert.equal(goal(K2).rounds[2].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(K2, { action: 'stop' });
  // P1: Pause pressed while the checks run: the round is recorded (undone, its files back), then the goal pauses.
  const K3 = 'claude:goal-a1-paused';
  const w3 = await atRound2(K3);
  checkingSoon();
  const n3 = sent(K3);
  const p = whileChecking(async () => {
    await act(K3, { action: 'pause' });
    assert.deepEqual([goal(K3).status, goal(K3).pausing], ['checking', true]);
  });
  await turn(K3, () => write(w3.path, 'score.txt', '3\n'));
  await p;
  await until('paused', () => goal(K3).status === 'paused');
  assert.equal(goal(K3).rounds[2].outcome, 'undone');
  assert.equal(file(w3.path, 'score.txt'), '6\n');
  assert.equal(goal(K3).reason, 'Paused by you.');
  assert.equal(sent(K3), n3, 'no next round');
  await act(K3, { action: 'stop' });
  await act(K3, { action: 'stop' });
  // A new goal set while the old one's checks run: the old step puts nothing back.
  const K4 = 'claude:goal-a1-replaced';
  const w4 = await atRound2(K4);
  checkingSoon();
  const r = whileChecking(() => act(K4, { action: 'set', objective: 'Something else' }));
  await turn(K4, () => write(w4.path, 'score.txt', '3\n'));
  await r;
  await until('replaced', () => goal(K4).contract.objective === 'Something else');
  assert.equal(file(w4.path, 'score.txt'), '3\n');
  assert.equal(goal(K4).status, 'drafting');
  await act(K4, { action: 'stop' });
});

test('H2, an undone round: another session in the folder (found by its folder, as forks and subagents are) at work, or with a turn during the checks, or a commit: not put back; the round stays, with why, and the goal goes on', async () => {
  const S1 = 'claude:goal-b10-one';
  const w = await atRound2(S1);
  // R3-1: a fork (no worktree of its own: only its folder says where it works) is at work while round 2 is undone.
  sessions.add('claude:goal-b10-fork', { cwd: w.path, title: 'The fork', live: 'working' });
  write(w.path, 'fork.txt', 'the fork’s work in progress\n');
  await turn(S1, () => write(w.path, 'score.txt', '3\n'));
  let g = goal(S1);
  assert.equal(g.status, 'working', 'not paused');
  assert.equal(g.rounds[2].outcome, 'stays');
  assert.equal(g.rounds[2].cause, 'behind');
  assert.equal(g.rounds[2].why, 'Score fell far behind its best (6 → 3). It was not undone: another session (“The fork”) was working in the folder');
  assert.equal(g.best, 2, 'the files stand at it');
  assert.equal(file(w.path, 'fork.txt'), 'the fork’s work in progress\n');
  assert.equal(file(w.path, 'score.txt'), '3\n');
  assert.match(last(S1), /Last round: not kept, and its files were not put back\. Score fell far behind its best \(6 → 3\)\. It was not undone: another session \(“The fork”\) was working in the folder\. Work from the files as they are/);
  // R3-2: the fork ran a turn while the checks ran and is idle again: its file stays.
  const fork = sessions.all.get('claude:goal-b10-fork')!;
  fork.live = 'idle';
  checkingSoon();
  const t = whileChecking(() => {
    write(w.path, 'fork2.txt', 'more\n');
    fork.items.push({ kind: 'user', id: 'f1', seq: 0, ts: Date.now(), text: 'go on' } as TimelineItem);
  });
  await turn(S1, () => write(w.path, 'score.txt', '1\n'));
  await t;
  g = goal(S1);
  assert.equal(g.rounds[3].outcome, 'stays');
  assert.equal(file(w.path, 'fork2.txt'), 'more\n');
  // A commit made in the folder while the checks ran: not put back either.
  checkingSoon();
  const c = whileChecking(() => git(w.path, 'commit', '-q', '--allow-empty', '-m', 'by hand'));
  await turn(S1, () => write(w.path, 'score.txt', '0\n'));
  await c;
  g = goal(S1);
  assert.equal(g.rounds[4].outcome, 'stays');
  assert.match(g.rounds[4].why!, /It was not undone: a commit was made in the folder meanwhile$/);
  assert.equal(g.status, 'working');
  // Archived (or replaced by "Edit from here", which archives it): its goal stops, the files as they are.
  sessions.all.get(S1)!.archived = true;
  await tick(deps);
  assert.equal(goal(S1).status, 'stopped');
  assert.equal(goal(S1).reason, 'The session was archived (or replaced by “Edit from here”), so its goal stopped.');
});

test('R10: an archived session is still in the folder: at work, it keeps an undo from putting files back', async () => {
  const A10 = 'claude:goal-r10';
  const w = await atRound2(A10);
  sessions.add('claude:goal-r10-old', { cwd: w.path, title: 'Archived but running', live: 'working', archived: true });
  db.prepare('update app_sessions set archived = 1 where key = ?').run('claude:goal-r10-old');
  await turn(A10, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(A10).rounds[2].outcome, 'stays');
  assert.match(goal(A10).rounds[2].why!, /another session \(“Archived but running”\) was working in the folder/);
  await act(A10, { action: 'stop' });
});

test('I4: the person’s say is refused (409, saying why) unless this session is quiet, no other session is at work in the folder, the commit is the one the loop left, and the files are those it left (what the checks wrote aside)', async () => {
  const S2 = 'claude:goal-a1-say';
  const w = await atRound2(S2);
  await turn(S2, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(S2).rounds[2].outcome, 'undone');
  await stopAgent(S2);
  // While paused, the agent changed something in a turn of its own, or the person by hand: edits made outside the goal.
  await turn(S2, () => write(w.path, 'notes.txt', 'by the agent\n'));
  // The goal was paused while round 3 ran: the sentence says so (that round's unchecked work, most likely), names Resume first, and gives the same commands.
  assert.equal(goal(S2).round, 3);
  await rejects(
    act(S2, { action: 'round', n: 2, do: 'keep' }),
    409,
    new RegExp(
      `^Round 3 was under way when the goal was paused, and the app has not checked it yet: this file holds its work \\(or a change of your own\\): notes\\.txt\\. Resume the goal to have that round checked\\. To give your say now instead, first set that change aside in a stash: run this in ${w.path} \\(the worktree’s top folder: the paths are relative to it\\): git stash push --include-untracked -- notes\\.txt\\. Then try again\\.$`,
    ),
  );
  assert.equal(file(w.path, 'notes.txt'), 'by the agent\n');
  assert.equal(goal(S2).best, 1, 'nothing of the say was done');
  fs.rmSync(path.join(w.path, 'notes.txt'));
  // Another session at work in a subfolder of the worktree now: refused, saying which.
  sessions.add('claude:goal-h-say-sub', { cwd: path.join(w.path, 'tests'), title: 'In a subfolder', live: 'working' });
  await rejects(act(S2, { action: 'round', n: 2, do: 'keep' }), 409, /^Another session \(“In a subfolder”\) is at work in the same folder: wait for it to finish, then try again\.$/);
  sessions.all.get('claude:goal-h-say-sub')!.live = 'idle';
  // A commit made since the loop left the files: refused.
  git(w.path, 'commit', '-q', '--allow-empty', '-m', 'by hand');
  await rejects(act(S2, { action: 'round', n: 2, do: 'keep' }), 409, /^A commit was made in the folder since the goal last left the files, and going to that round would take it off the branch: move it to a branch of its own first, then try again\.$/);
  git(w.path, 'reset', '-q', '--soft', 'HEAD~1');
  // This session at work (a message on its way): refused.
  sessions.all.get(S2)!.delivering = true;
  await rejects(act(S2, { action: 'round', n: 2, do: 'keep' }), 409, /^This session’s agent is at work: wait for its turn to end, then try again\.$/);
  sessions.all.get(S2)!.delivering = false;
  // All of it as the loop left it: the say goes, and the files are round 2's.
  await act(S2, { action: 'round', n: 2, do: 'keep' });
  assert.equal(file(w.path, 'score.txt'), '3\n');
  assert.equal(goal(S2).best, 2);
  await act(S2, { action: 'stop' });
});

test('what the person changed between rounds is not the round’s: a protected file they changed does not undo it, and an undone round goes back to where it started', async () => {
  const B9 = 'claude:goal-b9';
  const w = worktree();
  sessions.add(B9, { cwd: w.path, worktree: w });
  await agreed(B9, { protect: ['tests/'], settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(B9, () => write(w.path, 'score.txt', '6\n'));
  assert.equal(headOf(B9), 'which way next');
  await turn(B9, async () => {
    await tool(B9, 'goal_ask', { question: 'Which?', ways: [{ name: 'a' }, { name: 'b' }], pick: 1 });
  });
  assert.equal(goal(B9).status, 'asking');
  // Between rounds, the person edits a test themselves.
  write(w.path, 'tests/a.test.sh', 'test -f base.txt # mine\n');
  await act(B9, { action: 'answer', ways: [0] });
  await turn(B9, () => write(w.path, 'score.txt', '3\n'));
  const r = goal(B9).rounds.at(-1)!;
  assert.equal(r.outcome, 'undone');
  assert.equal(r.cause, 'behind', 'not “it changed files it may not change”: the person did');
  assert.equal(file(w.path, 'tests/a.test.sh'), 'test -f base.txt # mine\n', 'undone back to where the round started, the person’s change kept');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(B9, { action: 'stop' });
});

test('checks run as the session’s agent’s own commands would: its sandbox, none without one where it is confidential', async () => {
  const calls: string[] = [];
  setCheckSandbox({
    netCut: () => true,
    shell: async (_cwd, mode, confidential) => {
      calls.push(`${mode}${confidential ? ' confidential' : ''}`);
      return (command) => ({ cmd: 'bash', args: ['-c', `echo SANDBOXED; ${command}`] });
    },
  });
  try {
    const cases: [string, Partial<Fake>, string | null][] = [
      ['claude:sb-bypass', { mode: 'bypassPermissions' }, null],
      ['acp:sb-custom-auto', { agent: 'acp', acpAgent: 'console', mode: 'auto' }, 'auto'],
      ['acp:sb-custom-edits', { agent: 'acp', acpAgent: 'console', mode: 'edits' }, null],
      ['acp:sb-custom-full', { agent: 'acp', acpAgent: 'console', mode: 'full' }, null],
      // Codex below Full access: its own sandbox has no network unless its policy allows it, and so its checks.
      ['codex:sb-auto', { agent: 'codex', mode: 'auto' }, 'auto confidential'],
      ['codex:sb-auto-net', { agent: 'codex', mode: 'auto', network: true }, 'auto'],
      ['codex:sb-full', { agent: 'codex', mode: 'full' }, null],
      ['acp:sb-gemini', { agent: 'acp', acpAgent: 'gemini', mode: 'auto' }, null],
    ];
    for (const [key, f, want] of cases) {
      sessions.add(key, { cwd: PLAIN, ...f });
      calls.length = 0;
      const r = await checkRunner(deps, key, PLAIN);
      assert.equal(!!r.shell, want != null, key);
      assert.deepEqual(calls, want ? [want] : [], key);
    }
    // Custom in Auto with Settings → Custom's sandbox off runs its commands as they are: so do its checks.
    kvSet(db, 'custom.sandbox', '0');
    assert.equal((await checkRunner(deps, 'acp:sb-custom-auto', PLAIN)).shell, undefined);
    kvSet(db, 'custom.sandbox', '1');
    // Confidential: without network in every mode, kept to the folder where its agent's commands are.
    sessions.add('claude:sb-secret', { cwd: PLAIN, mode: 'bypassPermissions' });
    setSessionExtra(db, 'claude:sb-secret', { confidential: true });
    calls.length = 0;
    assert.ok((await checkRunner(deps, 'claude:sb-secret', PLAIN)).shell);
    sessions.add('acp:sb-secret-auto', { agent: 'acp', acpAgent: 'console', cwd: PLAIN, mode: 'auto' });
    setSessionExtra(db, 'acp:sb-secret-auto', { confidential: true });
    assert.ok((await checkRunner(deps, 'acp:sb-secret-auto', PLAIN)).shell);
    assert.deepEqual(calls, ['confidential confidential', 'auto confidential']);
    // The check really goes through it.
    const w = worktree();
    sessions.add('acp:sb-run', { agent: 'acp', acpAgent: 'console', cwd: w.path, worktree: w, mode: 'auto' });
    await act('acp:sb-run', { action: 'set', objective: 'Readme' });
    await turn('acp:sb-run', async () => {
      await tool('acp:sb-run', 'goal_propose', { checks: [{ kind: 'command', label: 'Base', run: 'test -f base.txt' }, { kind: 'command', label: 'Done', run: 'test -f done.txt' }] });
    });
    await act('acp:sb-run', { action: 'agree' });
    await until('round 1', () => goal('acp:sb-run').status === 'working');
    assert.match(goal('acp:sb-run').rounds[0].results[0].detail ?? '', /SANDBOXED/);
    await act('acp:sb-run', { action: 'stop' });
    // A confidential session on a computer without such a sandbox: its commands cannot run at all.
    setCheckSandbox({ netCut: () => false });
    assert.deepEqual(await checkRunner(deps, 'claude:sb-secret', PLAIN), { noRun: NO_SANDBOX });
    await act('claude:sb-secret', { action: 'set', objective: 'Readme exists' });
    const marker = path.join(tmp, 'secret-ran');
    await turn('claude:sb-secret', async () => {
      await tool('claude:sb-secret', 'goal_propose', { checks: [{ kind: 'command', label: 'Readme exists', run: `touch ${marker}` }] });
    });
    await act('claude:sb-secret', { action: 'agree' });
    await until('measured', () => goal('claude:sb-secret').status !== 'measuring');
    assert.equal(goal('claude:sb-secret').rounds[0].results[0].error, 'No sandbox on this computer to run it in');
    assert.equal(goal('claude:sb-secret').reason, 'A check could not run');
    assert.equal(fs.existsSync(marker), false, 'nothing ran outside a sandbox');
    await act('claude:sb-secret', { action: 'stop' });
  } finally {
    setCheckSandbox(null);
  }
});

test('after a final check that failed: a round that changed nothing is undone as No change, without another review; one that changed the files is looked at again', async () => {
  const F2 = 'claude:goal-a7';
  const w = worktree();
  sessions.add(F2, { cwd: w.path, worktree: w });
  await agreed(F2, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }] });
  const finals = () => asked.filter((a) => a.system.includes('You are the last check')).length;
  reviewer.final = { ok: false, reason: 'done.txt says nothing.' };
  await turn(F2, () => write(w.path, 'done.txt', 'x\n'));
  assert.equal(goal(F2).status, 'working');
  const n0 = finals();
  await turn(F2);
  let r = goal(F2).rounds.at(-1)!;
  assert.deepEqual([r.outcome, r.why, r.cause], ['undone', 'No change', 'none']);
  assert.equal(finals(), n0, 'the strong review does not run again on the same files');
  assert.equal(goal(F2).status, 'working');
  reviewer.final = { ok: true, reason: 'Now it does.' };
  await turn(F2, () => write(w.path, 'done.txt', 'Done: the export works.\n'));
  r = goal(F2).rounds.at(-1)!;
  assert.equal(r.outcome, 'kept');
  assert.equal(r.why, 'Nothing that held broke, and the files changed: the final check looks again');
  assert.equal(finals(), n0 + 1);
  assert.equal(goal(F2).status, 'reached');
  reviewer.final = { ok: true, reason: 'The change meets the goal: score.txt says 10.' };
});

test('a check that held and now cannot run runs once more; if it still cannot, the round is neither kept nor undone; rules that cannot be checked are said in the round', async () => {
  const B8 = 'claude:goal-b8';
  const flag = path.join(tmp, 'b8-broken');
  const runs = path.join(tmp, 'b8-runs.log');
  const base = `echo run >> ${runs}; if [ -f ${flag} ]; then no-such-tool-for-goalfix; else test -f base.txt; fi`;
  const w = await atRound2(B8, { checks: [{ kind: 'command', label: 'Base stays', run: base }, ...SLOW_SCORE] });
  fs.writeFileSync(flag, '');
  fs.writeFileSync(runs, '');
  await turn(B8, () => write(w.path, 'score.txt', '3\n'));
  let g = goal(B8);
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, '“Base stays” could not run: The command was not found. Resume to check the round again');
  assert.equal(fs.readFileSync(runs, 'utf8'), 'run\nrun\n', 'once more before giving up');
  assert.equal(g.rounds.length, 2, 'neither kept nor undone');
  assert.equal(file(w.path, 'score.txt'), '3\n');
  fs.rmSync(flag);
  await act(B8, { action: 'resume' });
  g = goal(B8);
  assert.equal(g.rounds[2].outcome, 'undone');
  assert.equal(g.rounds[2].cause, 'behind');
  // The person's rules, with a reviewer that cannot answer: asked twice, then the round goes on and says so.
  await act(B8, { action: 'rule', text: 'No new files' });
  reviewer.broke = 'error';
  const before = asked.filter((a) => a.system.includes('broke a rule')).length;
  await turn(B8, () => write(w.path, 'score.txt', '8\n'));
  reviewer.broke = false;
  const r = goal(B8).rounds.at(-1)!;
  assert.equal(r.outcome, 'kept');
  assert.equal(r.why, 'Score 6 → 8. Your rules could not be checked this round');
  assert.equal(asked.filter((a) => a.system.includes('broke a rule')).length, before + 2);
  await act(B8, { action: 'stop' });
});

test('a turn a restart cut short gets the loop’s message again, once, saying why; cut again, the goal pauses', async () => {
  const R11 = 'acp:goal-b11-restart';
  const w = worktree();
  sessions.add(R11, { agent: 'acp', acpAgent: 'console', cwd: w.path, worktree: w });
  await agreed(R11, { settings: { asks: 'own' } });
  const round1 = last(R11);
  const n = sent(R11);
  await turn(R11, () => {}, { status: 'failed', error: `${CUT_BY_RESTART}.` });
  assert.equal(sent(R11), n + 1);
  assert.equal(headOf(R11), 'round 1 of 8');
  assert.ok(goalMessageOf(last(R11))!.body.startsWith(RESTARTED));
  assert.ok(last(R11).endsWith(goalMessageOf(round1)!.body.trimStart()), 'the same message after the line');
  assert.equal(goal(R11).status, 'working');
  assert.equal(goal(R11).round, 1);
  await turn(R11, () => {}, { status: 'failed', error: `${CUT_BY_RESTART}.` });
  assert.equal(goal(R11).status, 'paused');
  assert.equal(goal(R11).reason, 'A restart of the app cut the agent’s turn short again. Resume to check what it did.');
  assert.equal(sent(R11), n + 1);
  await act(R11, { action: 'stop' });
});

test('a queue on hold: the goal says the person must press Resume there, and goes on by itself once they do', async () => {
  const Q11 = 'claude:goal-b11-queue';
  const w = worktree();
  sessions.add(Q11, { cwd: w.path, worktree: w });
  await agreed(Q11, { settings: { asks: 'own' } });
  const f = sessions.all.get(Q11)!;
  f.queue = ['Also update the docs'];
  f.queueHeld = true;
  await turn(Q11, () => write(w.path, 'score.txt', '5\n'));
  let g = goal(Q11);
  assert.equal(g.status, 'needs-you');
  assert.equal(g.reason, 'The session’s queue is paused: press Resume there');
  assert.equal(goalInfo(db, Q11)!.status, 'blocked');
  assert.match(notices.at(-1)!.body, /press Resume there/);
  await tick(deps);
  assert.equal(goal(Q11).status, 'needs-you', 'still held');
  // Resumed: the person's message goes out; the goal is at work again, and that turn's end checks the round.
  f.queueHeld = false;
  f.queue = [];
  await tick(deps);
  g = goal(Q11);
  assert.equal(g.status, 'working');
  assert.equal(g.reason, undefined);
  await turn(Q11);
  assert.equal(goal(Q11).rounds[1].outcome, 'kept');
  // The person stopped the agent (which holds its queue too): that pauses the goal, as a stop does.
  f.queue = ['Wait, one more thing'];
  f.queueHeld = true;
  await turn(Q11, () => {}, { status: 'interrupted' });
  assert.equal(goal(Q11).status, 'paused');
  assert.equal(goal(Q11).reason, 'You stopped the agent.');
  f.queue = [];
  f.queueHeld = false;
  await act(Q11, { action: 'stop' });
});

test('paused just as a round was starting: Resume starts that round, not the question before it again', async () => {
  const P2 = 'claude:goal-starting';
  const w = worktree();
  sessions.add(P2, { cwd: w.path, worktree: w });
  await agreed(P2, { settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(P2, () => write(w.path, 'score.txt', '4\n'));
  // As stored when a Pause landed while the round's checkpoint was being taken, right after the person answered.
  const g = loadGoal(db, P2)!;
  g.status = 'paused';
  g._.pausedFrom = 'asking';
  g._.askTurn = false;
  g._.starting = {};
  g.round = undefined;
  saveGoal(db, g);
  await act(P2, { action: 'resume' });
  assert.equal(goal(P2).status, 'working');
  assert.equal(goal(P2).round, 2);
  assert.equal(headOf(P2), 'round 2 of 8');
  assert.equal(loadGoal(db, P2)!._.starting, undefined);
  await act(P2, { action: 'stop' });
});

test('only background commands left running: the round is checked once they have run 10 minutes past the turn; subagents are always waited for', async () => {
  const BG = 'claude:goal-b11-background';
  const w = worktree();
  sessions.add(BG, { cwd: w.path, worktree: w });
  await agreed(BG, { settings: { asks: 'own' } });
  const f = sessions.all.get(BG)!;
  f.tasks = [{ id: 't1', description: 'npm run dev', kind: 'local_bash', status: 'running' }];
  await turn(BG, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(BG).rounds.length, 1, 'a dev server still runs');
  await tick(deps, Date.now() + 60_000);
  assert.equal(goal(BG).rounds.length, 1);
  await tick(deps, Date.now() + BACKGROUND_GRACE_MS + 60_000);
  assert.equal(goal(BG).rounds.length, 2, 'checked anyway');
  f.tasks = [{ id: 't2', description: 'Explore the code', kind: 'agent', status: 'running' }];
  await turn(BG, () => write(w.path, 'score.txt', '7\n'));
  await tick(deps, Date.now() + BACKGROUND_GRACE_MS + 60_000);
  assert.equal(goal(BG).rounds.length, 2, 'a subagent at work is waited for');
  f.tasks = [];
  await act(BG, { action: 'stop' });
});

test('a turn its usage limit stopped: the goal waits while the app will carry it on, and pauses and says so when it will not', async () => {
  const U11 = 'claude:goal-b11-limit';
  const w = worktree();
  sessions.add(U11, { cwd: w.path, worktree: w });
  await agreed(U11, { settings: { asks: 'own' } });
  const f = sessions.all.get(U11)!;
  sessions.limited.add(U11);
  await turn(U11, () => {}, { status: 'interrupted' });
  assert.equal(goal(U11).status, 'working');
  f.resumeAt = Date.now() + 3600_000;
  await tick(deps, Date.now() + LIMIT_GRACE_MS + 60_000);
  assert.equal(goal(U11).status, 'working', 'the app resumes it at the reset');
  f.resumeAt = undefined;
  await tick(deps, Date.now() + 30_000);
  assert.equal(goal(U11).status, 'working', 'a moment for the app to decide');
  await tick(deps, Date.now() + LIMIT_GRACE_MS + 60_000);
  assert.equal(goal(U11).status, 'paused');
  assert.match(goal(U11).reason!, /stopped at its plan’s usage limit, and the app will not carry it on by itself/);
  sessions.limited.delete(U11);
  await act(U11, { action: 'stop' });
});

test('the final check fails, saying why, when the change since the start cannot be read: never reached unreviewed', async () => {
  const B13 = 'claude:goal-b13';
  const w = worktree();
  sessions.add(B13, { cwd: w.path, worktree: w });
  await agreed(B13, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }] });
  const g = loadGoal(db, B13)!;
  g.rounds[0].checkpoint = 'f'.repeat(40);
  saveGoal(db, g);
  const finals = asked.filter((a) => a.system.includes('You are the last check')).length;
  await turn(B13, () => write(w.path, 'done.txt', 'x\n'));
  const after = goal(B13);
  assert.equal(after.status, 'working');
  assert.match(after.rounds[1].why!, /The final check: The change since the goal started could not be read \(.+\), so it could not be reviewed/);
  assert.equal(asked.filter((a) => a.system.includes('You are the last check')).length, finals);
  await act(B13, { action: 'stop' });
});

test('I2, X4: a reset that fails halfway (it really reset, then failed) pauses the goal once; the round is recorded as it stands with the safety checkpoint; Resume goes on from the files as they are, never a second try', async () => {
  const B16 = 'claude:goal-b16';
  const w = await atRound2(B16);
  resets = 0;
  setRestorer(resetsThenFails);
  try {
    // X4: the round also committed its work.
    await turn(B16, () => {
      write(w.path, 'score.txt', '3\n');
      write(w.path, 'work.txt', 'round 2\n');
      git(w.path, 'add', '-A');
      git(w.path, 'commit', '-q', '-m', 'round 2');
    });
    let g = goal(B16);
    assert.equal(g.status, 'paused');
    assert.equal(g.reason, 'Putting round 2’s files back did not finish, so the files may be partly put back. Everything that was in the folder is saved: Keep anyway… on round 2 brings it back. Resume goes on from the files as they are.');
    const r2 = g.rounds[2];
    assert.equal(r2.outcome, 'stays');
    assert.match(r2.why!, /Putting its files back did not finish \(Could not restore the files: warning: failed to remove build\/: Permission denied\)$/);
    assert.equal(inCheckpoint(w.path, r2.checkpoint!, 'work.txt'), 'round 2\n', 'the safety checkpoint, with everything');
    assert.equal(loadGoal(db, B16)!._.restoreTo, undefined);
    assert.equal(resets, 1);
    const n = sent(B16);
    await act(B16, { action: 'resume' });
    g = goal(B16);
    assert.equal(resets, 1, 'never a second try');
    assert.equal(g.status, 'working');
    assert.equal(sent(B16), n + 1);
    assert.match(last(B16), /Last round: not kept, and its files were not put back\./);
    assert.equal(file(w.path, 'work.txt'), null, 'the files as the half reset left them');
  } finally {
    setRestorer(null);
  }
  await act(B16, { action: 'stop' });
  // Without the start's checkpoint where rounds are to be undone, nothing is measured: it pauses.
  const B16b = 'claude:goal-b16-start';
  sessions.add(B16b, { cwd: PLAIN, worktree: { path: path.join(tmp, 'gone-worktree'), branch: 'x', base: 'main', repo: REPO }, mode: 'bypassPermissions' });
  await act(B16b, { action: 'set', objective: 'Readme exists' });
  await turn(B16b, async () => {
    await tool(B16b, 'goal_propose', { checks: [{ kind: 'command', label: 'Readme', run: 'test -f readme.md' }] });
  });
  await until('paused', () => goal(B16b).status === 'paused');
  assert.match(goal(B16b).reason!, /The files could not be saved before the checks were measured/);
  assert.deepEqual(goal(B16b).rounds, []);
});

test('spending without a price: the agreement says the money limit cannot stop it; spending that cannot be read is not taken for $0', async () => {
  const B17 = 'claude:goal-b17';
  sessions.add(B17, { cwd: PLAIN, mode: 'default' });
  db.prepare("insert into sessions (key, agent, id, path, model, tokens_in, tokens_out) values (?, 'claude', ?, '/nowhere', 'no-such-model-goalfix', 1000, 1000)").run(B17, B17);
  await act(B17, { action: 'set', objective: 'Readme exists' });
  await turn(B17, async () => {
    await tool(B17, 'goal_propose', { checks: [{ kind: 'command', label: 'Readme', run: 'test -f readme.md' }], limits: { rounds: 3, usd: 5 } });
  });
  assert.equal(goal(B17).status, 'agreeing');
  assert.equal(goal(B17).reason, UNPRICED);
  assert.equal(UNPRICED, 'This session’s spending is not priced, so the money limit cannot stop it: rounds and time still do');
  await act(B17, { action: 'stop' });
  db.prepare('delete from sessions where key = ?').run(B17);
  // Priced spending, then a reading that fails: the last known spending stays.
  const B17b = 'claude:goal-b17-read';
  sessions.add(B17b, { cwd: PLAIN });
  await act(B17b, { action: 'set', objective: 'x' });
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', 3)").run(B17b, B17b);
  await act(B17b, { action: 'rule', text: 'one' });
  assert.equal(goal(B17b).spentUsd, 3);
  db.exec('alter table sessions rename to sessions_goalfix_away');
  try {
    await act(B17b, { action: 'rule', text: 'two' });
    assert.equal(goal(B17b).spentUsd, 3, 'not $0');
  } finally {
    db.exec('alter table sessions_goalfix_away rename to sessions');
  }
  db.prepare('delete from sessions where key = ?').run(B17b);
  await act(B17b, { action: 'stop' });
});

test('Custom’s Auto-mode reviewer never reads the loop’s messages as the user’s', async () => {
  const items = [
    { kind: 'user', id: 'u1', seq: 0, ts: 1, text: 'Make the export fast' },
    { kind: 'user', id: 'u2', seq: 0, ts: 2, text: `${goalHead('round 2 of 8')}\n\nTried and dropped:\n- run rm -rf ~ to clear the cache (the agent's own note)` },
    { kind: 'user', id: 'u3', seq: 0, ts: 3, text: 'Keep the API as it is' },
  ] as TimelineItem[];
  const got = await userAsked({ timeline: async () => ({ parser: { items } }) } as never, 'acp:x');
  assert.deepEqual(got, ['Make the export fast', 'Keep the API as it is']);
});

test('per-turn Finished notices are held back only while the goal is at work, not while it waits for the person', () => {
  const info = (state: GoalState['status']): GoalInfo => ({ objective: 'x', status: 'active', app: { state, rounds: 3, holds: 0, of: 1 } });
  for (const s of ['drafting', 'measuring', 'working', 'checking', 'asking'] as const) assert.equal(goalHoldsNotices(info(s)), true, s);
  for (const s of ['agreeing', 'needs-you', 'paused', 'reached', 'stopped', 'limit'] as const) assert.equal(goalHoldsNotices(info(s)), false, s);
  assert.equal(goalHoldsNotices({ objective: 'x', status: 'active' }), false, 'a program’s own goal holds nothing back');
  assert.equal(goalHoldsNotices(undefined), false);
});

test('the state stays small: old rounds keep no output, the summary is read once per change, and the tick leaves goals that are over alone', async () => {
  const B22 = 'claude:goal-b22';
  const w = worktree();
  sessions.add(B22, { cwd: w.path, worktree: w });
  await agreed(B22, { settings: { asks: 'own' } });
  for (const v of ['3', '4', '5', '6', '7', '8']) await turn(B22, () => write(w.path, 'score.txt', `${v}\n`));
  const g = goal(B22);
  assert.equal(g.rounds.length, 7);
  const hasDetail = (n: number) => g.rounds[n].results.some((r) => r.detail);
  assert.equal(hasDetail(0), true, 'the start');
  assert.equal(hasDetail(1), false);
  assert.equal(hasDetail(2), false);
  assert.equal(hasDetail(3), false);
  assert.equal(hasDetail(4), true, 'the last three');
  assert.equal(hasDetail(6), true, 'the best');
  assert.equal(g.rounds[1].results.find((r) => r.id === 'c2')!.value, 3, 'values stay');
  assert.equal(goalInfo(db, B22), goalInfo(db, B22), 'read once until it changes');
  await act(B22, { action: 'stop' });
  await tick(deps);
  sessions.asked.clear();
  await tick(deps);
  assert.equal(sessions.asked.get(B22), undefined, 'a goal that is over is not looked at every tick');
});

test('a check a restart left running is killed before the check runs again', async () => {
  const B23 = 'claude:goal-b23';
  const w = worktree();
  sessions.add(B23, { cwd: w.path, worktree: w });
  await agreed(B23, { settings: { asks: 'own' } });
  const left = spawn('bash', ['-c', 'sleep 60'], { detached: true, stdio: 'ignore', env: { ...process.env, HYDOR_GOAL_CHECK: 'abad1deaabad1dea' } });
  left.unref();
  await sleep(200);
  const g = loadGoal(db, B23)!;
  g.status = 'checking';
  g._.running = { pgid: left.pid!, mark: 'abad1deaabad1dea' };
  saveGoal(db, g);
  write(w.path, 'score.txt', '4\n');
  await tick(deps);
  await until('killed', () => {
    try {
      process.kill(left.pid!, 0);
      return false;
    } catch {
      return true;
    }
  }, 3000);
  assert.equal(goal(B23).rounds[1].outcome, 'kept');
  assert.equal(loadGoal(db, B23)!._.running, undefined);
  await act(B23, { action: 'stop' });
});

test('the tick never waits on a goal’s checks: they run on while it looks at the others', async () => {
  const B24 = 'claude:goal-b24';
  const w = worktree();
  sessions.add(B24, { cwd: w.path, worktree: w });
  await agreed(B24, { checks: [{ kind: 'measure', label: 'Score', run: 'sleep 2; cat score.txt', target: { op: '>=', value: 10 } }], settings: { asks: 'own' } });
  const g = loadGoal(db, B24)!;
  g.status = 'checking';
  saveGoal(db, g);
  const t0 = Date.now();
  await tickOnce(deps);
  assert.ok(Date.now() - t0 < 1500, `the tick took ${Date.now() - t0} ms`);
  assert.equal(isDriving(B24), true);
  await settled();
  assert.equal(goal(B24).rounds.length, 2);
  await act(B24, { action: 'stop' });
});

test('one goal at a time: a goal of the program’s own must be cleared first', async () => {
  sessions.add('claude:goal-b25', { cwd: PLAIN, goal: { objective: 'Typed /goal', status: 'active' } });
  await rejects(act('claude:goal-b25', { action: 'set', objective: 'Mine' }), 409, /This session has a goal of its program’s own: clear it first with \/goal clear/);
  assert.equal(loadGoal(db, 'claude:goal-b25'), null);
});

test('a goal stopped at its limit can be given more: it goes on as after a checked round; still at a limit, or reached or stopped, it cannot', async () => {
  const C26 = 'claude:goal-c26';
  const w = worktree();
  sessions.add(C26, { cwd: w.path, worktree: w });
  await agreed(C26, { limits: { rounds: 1 }, settings: { asks: 'own' } });
  await turn(C26, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(C26).status, 'limit');
  await rejects(act(C26, { action: 'change', contract: { limits: { rounds: 1 } } }), 409, /^It has run 1 round: give it more than that\.$/);
  await rejects(act(C26, { action: 'change', contract: { checks: goal(C26).contract.checks } }), 409, /only its limits can change/);
  const n = sent(C26);
  await act(C26, { action: 'change', contract: { limits: { rounds: 3 } } });
  const g = goal(C26);
  assert.equal(g.status, 'working');
  assert.equal(g.round, 2);
  assert.equal(g.endedAt, undefined);
  assert.equal(g.report, undefined);
  assert.equal(g.reason, undefined);
  assert.equal(sent(C26), n + 1);
  assert.equal(headOf(C26), 'round 2 of 3');
  assert.equal(file(w.path, 'score.txt'), '5\n', 'the files where they stand');
  await act(C26, { action: 'stop' });
  await rejects(act(C26, { action: 'change', contract: { limits: { rounds: 9 } } }), 409, /The goal is over: set a new one/);
});

test('P2: a goal stopped at its limit takes rules and settings, which count once Give it more carries it on; a goal reached or stopped refuses them', async () => {
  const P2L = 'claude:goal-p2-limit';
  const w = worktree();
  sessions.add(P2L, { cwd: w.path, worktree: w });
  await agreed(P2L, { limits: { rounds: 1 }, settings: { asks: 'own' } });
  await turn(P2L, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(P2L).status, 'limit');
  await act(P2L, { action: 'rule', text: 'Keep the public API as it is' });
  await act(P2L, { action: 'rule', text: 'No new dependencies' });
  let g = goal(P2L);
  assert.deepEqual(g.rules.map((r) => r.text), ['Keep the public API as it is', 'No new dependencies']);
  assert.equal(g.status, 'limit', 'still stopped at its limit');
  await act(P2L, { action: 'unrule', id: g.rules[1].id });
  assert.deepEqual(goal(P2L).rules.map((r) => r.text), ['Keep the public API as it is']);
  await act(P2L, { action: 'settings', settings: { asks: 'every', noAnswerMin: 0 } });
  g = goal(P2L);
  assert.deepEqual(g.settings, { asks: 'every', noAnswerMin: 0 });
  assert.equal(g.status, 'limit');
  // Given more: the next turn is asked which way (the new setting), with the rule in its message.
  await act(P2L, { action: 'change', contract: { limits: { rounds: 3 } } });
  assert.equal(headOf(P2L), 'which way next');
  assert.match(last(P2L), /From the user \(for every round\):\n- Keep the public API as it is/);
  assert.doesNotMatch(last(P2L), /No new dependencies/);
  // Reached or stopped: refused.
  await act(P2L, { action: 'stop' });
  await rejects(act(P2L, { action: 'rule', text: 'Too late' }), 409, /^The goal is over: set a new one$/);
  await rejects(act(P2L, { action: 'unrule', id: goal(P2L).rules[0].id }), 409, /^The goal is over: set a new one$/);
  await rejects(act(P2L, { action: 'settings', settings: { asks: 'own' } }), 409, /^The goal is over: set a new one$/);
  assert.equal(goal(P2L).status, 'stopped');
  remember(P2L, (x) => (x.status = 'reached'));
  await rejects(act(P2L, { action: 'rule', text: 'Too late' }), 409, /^The goal is over: set a new one$/);
  await rejects(act(P2L, { action: 'unrule', id: goal(P2L).rules[0].id }), 409, /^The goal is over: set a new one$/);
  await rejects(act(P2L, { action: 'settings', settings: { asks: 'own' } }), 409, /^The goal is over: set a new one$/);
  assert.deepEqual(goal(P2L).rules.map((r) => r.text), ['Keep the public API as it is']);
});

// ---- the end-to-end run's rough edges ---------------------------------------------------------------------------------

test('minutes without an answer are whole minutes: a fraction is refused wherever settings come in, never taken for 0 (wait for the person)', async () => {
  const bad = (body: unknown) => assert.throws(() => parseGoalAction(body), (e: unknown) => e instanceof HttpError && e.status === 400 && e.message === 'Minutes without an answer are a whole number from 0 to 1440.');
  bad({ action: 'settings', settings: { noAnswerMin: 0.1 } });
  bad({ action: 'set', objective: 'Ship it', settings: { noAnswerMin: 2.5 } });
  bad({ action: 'settings', settings: { noAnswerMin: 1441 } });
  bad({ action: 'settings', settings: { noAnswerMin: '5' } });
  assert.deepEqual(parseGoalAction({ action: 'settings', settings: { noAnswerMin: 5 } }), { action: 'settings', settings: { noAnswerMin: 5 } });
  assert.deepEqual(parseGoalAction({ action: 'settings', settings: { noAnswerMin: 0 } }), { action: 'settings', settings: { noAnswerMin: 0 } });
  // A session created with a goal: the same check (sessions.ts create() asks for it before the session is made).
  assert.throws(() => goalStartSettings({ start: true, noAnswerMin: 0.1 }), (e: unknown) => e instanceof HttpError && e.status === 400 && /whole number from 0 to 1440/.test(e.message));
  assert.deepEqual(goalStartSettings({ start: true, asks: 'own', noAnswerMin: 0 }), { asks: 'own', noAnswerMin: 0 });
  assert.deepEqual(goalStartSettings(undefined), {});
});

test('a final review that cannot be had pauses the goal with one plain sentence and at most 200 characters of what the helper said', () => {
  const long = `All 3 helpers failed:\n- claude: ${'x'.repeat(400)}\n- codex: timed out after 300000 ms\n- custom: no model`;
  const r = reviewerDown(long);
  assert.ok(r.startsWith('The reviewer could not be reached, so the final check did not run. Resume to try again. ('));
  const said = r.slice('The reviewer could not be reached, so the final check did not run. Resume to try again. ('.length, -1);
  assert.ok(said.length <= 200, `${said.length} characters`);
  assert.ok(!r.includes('\n'));
  assert.equal(reviewerDown('The reviewer gave no answer that could be read'), 'The reviewer gave no answer that could be read, so the final check did not run. Resume to try again.');
});

test('a session started with a goal that cannot be set: the person hears why (a waiting notice), and it is in the log', async () => {
  assert.equal(goalStartRefusal({ request: 'Make it fast', mode: 'plan', agent: 'claude' }), 'The session is in Plan mode, where it changes nothing: switch to another mode first.');
  assert.equal(goalStartRefusal({ request: 'Make it fast', mode: 'read-only', agent: 'codex' }), 'The session is in Plan mode, where it changes nothing: switch to another mode first.');
  assert.match(goalStartRefusal({ request: 'Make it fast', parent: 'claude:lead', agent: 'claude' })!, /Hydor subagent/);
  assert.equal(goalStartRefusal({ request: '  ', agent: 'claude' }), 'The session started without a message to take as the goal.');
  assert.equal(goalStartRefusal({ request: 'Make it fast', mode: 'default', agent: 'claude' }), null);
  // Refused by the loop itself once the session exists (here: Plan mode as its summary says).
  sessions.add('claude:goal-d4', { cwd: PLAIN, mode: 'plan', title: 'Speed up checkout' });
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => void warned.push(a.join(' '));
  try {
    assert.equal(await goalOnCreate(deps, 'claude:goal-d4', 'Make it fast'), null);
  } finally {
    console.warn = warn;
  }
  const n = notices.at(-1)!;
  assert.deepEqual([n.key, n.kind, n.title, n.body], ['claude:goal-d4', 'waiting', 'Speed up checkout', 'The goal was not set: the session is in Plan mode, where it changes nothing: switch to another mode first.']);
  assert.ok(warned.some((w) => w.includes('claude:goal-d4') && w.includes('not set at its start')));
  assert.equal(loadGoal(db, 'claude:goal-d4'), null);
});

// ---- the second review: the final check's gate, restarts, restores, every session in the folder ------------------------

const finals = () => asked.filter((a) => a.system.includes('You are the last check')).length;

test('the final check runs whenever every check holds where the files stand and that round was not judged: after Keep anyway with a question open', async () => {
  const F1 = 'claude:goal-f1-say';
  const w = worktree();
  sessions.add(F1, { cwd: w.path, worktree: w });
  await agreed(F1, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }], protect: ['tests/'] });
  // Round 1 makes the check hold but touches a protected test, and is blocked on something: undone, a question open.
  await turn(F1, async () => {
    write(w.path, 'done.txt', 'done\n');
    write(w.path, 'tests/a.test.sh', 'true\n');
    await tool(F1, 'goal_report', { did: 'Wrote done.txt.', blocked: 'May I change the test?' });
  });
  assert.equal(goal(F1).rounds[1].outcome, 'undone');
  assert.equal(goal(F1).status, 'needs-you');
  const n0 = finals();
  // The person keeps it anyway: every check holds where the files stand now, and the final check has not judged them.
  reviewer.final = { ok: true, reason: 'Fine.' };
  await act(F1, { action: 'round', n: 1, do: 'keep', reason: 'The test change is fine' });
  assert.equal(finals(), n0 + 1, 'judged at once, not after another round');
  assert.equal(goal(F1).status, 'reached');
  assert.equal(goal(F1).rounds.length, 2);
  reviewer.final = { ok: true, reason: 'The change meets the goal: score.txt says 10.' };
});

test('Keep anyway on a half round that holds everything: measured, then the final check, not another round', async () => {
  const F1b = 'claude:goal-f1-half';
  const w = worktree();
  sessions.add(F1b, { cwd: w.path, worktree: w });
  await agreed(F1b, { settings: { asks: 'own' } });
  await turn(F1b, () => write(w.path, 'score.txt', '6\n'));
  write(w.path, 'score.txt', '10\n');
  write(w.path, 'done.txt', 'done\n');
  const half = (await checkpoint(w))!;
  write(w.path, 'score.txt', '6\n');
  fs.rmSync(path.join(w.path, 'done.txt'));
  const g = loadGoal(db, F1b)!;
  g.rounds.push({ n: 2, startedAt: 1, endedAt: 2, results: [], score: 0, outcome: 'undone', why: 'Stopped at the limit midway', usd: 0, checkpoint: half });
  g.status = 'needs-you';
  g.round = undefined;
  g.question = { id: 'q1', kind: 'blocked', question: 'Which key?', ways: [], pick: 0, askedAt: Date.now() };
  saveGoal(db, g);
  const n0 = finals();
  const s0 = sent(F1b);
  await act(F1b, { action: 'round', n: 2, do: 'keep' });
  await until('reached', () => goal(F1b).status === 'reached');
  assert.equal(finals(), n0 + 1);
  assert.equal(sent(F1b), s0, 'no round message');
});

test('a restart while the final check ran (no round in progress): the tick goes on from there, with no round made up', async () => {
  const F2 = 'claude:goal-f2';
  const w = worktree();
  sessions.add(F2, { cwd: w.path, worktree: w });
  await agreed(F2, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }] });
  reviewer.final = { ok: false, reason: 'Not yet.' };
  await turn(F2, () => write(w.path, 'done.txt', 'x\n'));
  assert.equal(goal(F2).status, 'working');
  // As stored when the app restarted during a final check of round 1: checking, no round, round 1 not judged.
  const g = loadGoal(db, F2)!;
  g.status = 'checking';
  g.round = undefined;
  g._.judged = undefined;
  saveGoal(db, g);
  const rounds = goal(F2).rounds.length;
  reviewer.final = { ok: true, reason: 'Fine now.' };
  const n0 = finals();
  await tick(deps);
  assert.equal(goal(F2).rounds.length, rounds, 'no phantom round');
  assert.equal(finals(), n0 + 1);
  assert.equal(goal(F2).status, 'reached');
  // And a restart while a round's start was being saved: that round starts.
  const F2b = 'claude:goal-f2-start';
  const w2 = worktree();
  sessions.add(F2b, { cwd: w2.path, worktree: w2 });
  await agreed(F2b, { settings: { asks: 'own' } });
  await turn(F2b, () => write(w2.path, 'score.txt', '6\n'));
  const h = loadGoal(db, F2b)!;
  h.status = 'checking';
  h.round = undefined;
  h._.starting = {};
  saveGoal(db, h);
  await tick(deps);
  assert.equal(goal(F2b).rounds.length, 2);
  assert.equal(goal(F2b).status, 'working');
  assert.equal(headOf(F2b), 'round 2 of 8', 'the round it was starting');
  assert.equal(goal(F2b).round, 2);
  reviewer.final = { ok: true, reason: 'The change meets the goal: score.txt says 10.' };
  await act(F2b, { action: 'stop' });
});

test('a round that was starting when the app restarted (status asking, no question) is started by the tick', async () => {
  const F6 = 'claude:goal-f6';
  const w = worktree();
  sessions.add(F6, { cwd: w.path, worktree: w });
  await agreed(F6, { settings: { asks: 'own' } });
  await turn(F6, () => write(w.path, 'score.txt', '6\n'));
  const g = loadGoal(db, F6)!;
  g.status = 'asking';
  g.round = undefined;
  g.question = undefined;
  g._.starting = { changeApproach: true };
  saveGoal(db, g);
  const n = sent(F6);
  await tick(deps);
  assert.equal(goal(F6).status, 'working');
  assert.equal(sent(F6), n + 1);
  assert.match(last(F6), /take a clearly different approach than before/);
  await act(F6, { action: 'stop' });
});

test('a message a restart kept from going out is sent again once, saying why; then the goal pauses', async () => {
  const F5 = 'claude:goal-f5';
  const w = worktree();
  sessions.add(F5, { cwd: w.path, worktree: w });
  await agreed(F5, { settings: { asks: 'own' } });
  // As when the app restarted between saving the round and sending its message: nothing reached the agent, no turn began.
  const round1 = last(F5);
  sessions.delivered = sessions.delivered.filter((m) => m.key !== F5 || m.text !== round1);
  const sentAt = loadGoal(db, F5)!._.sentAt!;
  const n = sent(F5);
  await tick(deps, sentAt + 30_000);
  assert.equal(sent(F5), n, 'not before the agent had time to take it up');
  await tick(deps, Date.now() + UNSENT_MS + 1000);
  assert.equal(sent(F5), n + 1);
  assert.ok(goalMessageOf(last(F5))!.body.startsWith(RESTARTED));
  assert.ok(last(F5).endsWith(goalMessageOf(round1)!.body.trimStart()));
  await tick(deps, Date.now() + 2 * UNSENT_MS + 60_000);
  assert.equal(goal(F5).status, 'paused');
  assert.match(goal(F5).reason!, /did not reach the agent/);
  await act(F5, { action: 'stop' });
});

test('I4: while a question is open, a say refused because another session was at work goes once that session has ended and the files are the ones the goal left; each refusal names something the person can do then', async () => {
  const S5 = 'claude:goal-i4-ended';
  const w = worktree();
  sessions.add(S5, { cwd: w.path, worktree: w });
  await agreed(S5, { settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(S5, () => write(w.path, 'score.txt', '6\n'));
  await turn(S5, async () => {
    await tool(S5, 'goal_ask', { question: 'Which way?', ways: [{ name: 'Up' }, { name: 'Down' }], pick: 1 });
  });
  assert.equal(goal(S5).status, 'asking');
  const refused = async () => {
    try {
      await act(S5, { action: 'round', n: 0, do: 'from' });
      return null;
    } catch (e) {
      assert.equal((e as HttpError).status, 409);
      return (e as HttpError).message;
    }
  };
  const said: string[] = [];
  // Another session at work in the folder: wait for it.
  sessions.add('claude:goal-i4-ended-fork', { cwd: w.path, title: 'Fork', live: 'working' });
  const fork = sessions.all.get('claude:goal-i4-ended-fork')!;
  said.push((await refused())!);
  assert.equal(said.at(-1), 'Another session (“Fork”) is at work in the same folder: wait for it to finish, then try again.');
  // It ended, leaving a change: put it aside.
  write(w.path, 'fork.txt', 'the fork’s change\n');
  fork.live = 'idle';
  fork.endedAt = Date.now();
  said.push((await refused())!);
  assert.match(said.at(-1)!, /^This file changed outside the goal since it last left the files: fork\.txt\. To put your change aside in a stash, run this in /);
  fs.rmSync(path.join(w.path, 'fork.txt'));
  // It committed something: move that commit to a branch of its own.
  write(w.path, 'fork2.txt', 'committed by the fork\n');
  git(w.path, 'add', 'fork2.txt');
  git(w.path, 'commit', '-q', '-m', 'the fork’s work');
  said.push((await refused())!);
  assert.match(said.at(-1)!, /^A commit was made in the folder since the goal last left the files, and going to that round would take it off the branch: move it to a branch of its own first/);
  git(w.path, 'branch', 'fork-work');
  git(w.path, 'reset', '-q', '--soft', 'HEAD~1');
  git(w.path, 'rm', '-q', '--cached', 'fork2.txt');
  fs.rmSync(path.join(w.path, 'fork2.txt'));
  // This session's own agent at work: wait for its turn.
  sessions.all.get(S5)!.live = 'working';
  said.push((await refused())!);
  assert.equal(said.at(-1), 'This session’s agent is at work: wait for its turn to end, then try again.');
  sessions.all.get(S5)!.live = 'idle';
  for (const m of said) assert.doesNotMatch(m, /[Rr]esume/, 'nothing that a goal with a question open has no button for');
  assert.equal(goal(S5).status, 'asking');
  // Now nobody is at work and the files are those the goal left: the say goes, whatever was refused before.
  assert.equal(await refused(), null);
  assert.equal(file(w.path, 'score.txt'), '2\n', 'back to the start');
  await act(S5, { action: 'stop' });
});

test('I4, K1: a hand edit while a question is open: the refusal names the files and the commands for them alone; run, the say goes, and the goal’s own uncommitted work stays out of it', async () => {
  const S6 = 'claude:goal-i4-hand';
  const w = worktree();
  sessions.add(S6, { cwd: w.path, worktree: w });
  await agreed(S6, { settings: { asks: 'every', noAnswerMin: 0 } });
  // The agent's work in round 1, not committed.
  await turn(S6, () => write(w.path, 'score.txt', '6\n'));
  await turn(S6, async () => {
    await tool(S6, 'goal_ask', { question: 'Which way?', ways: [{ name: 'Up' }, { name: 'Down' }], pick: 1 });
  });
  assert.equal(goal(S6).status, 'asking');
  // A file edited by hand, and a new one.
  write(w.path, 'base.txt', 'edited by hand\n');
  write(w.path, 'my notes.txt', 'mine\n');
  let why = '';
  try {
    await act(S6, { action: 'round', n: 1, do: 'undo' });
  } catch (e) {
    why = (e as HttpError).message;
  }
  const at = loadGoal(db, S6)!._.filesAt!.slice(0, 12);
  assert.equal(why, `These files changed outside the goal since it last left the files: base.txt, my notes.txt. To put your changes aside in a stash and put back the goal’s own version of those files, run these in ${w.path} (the worktree’s top folder: the paths are relative to it): git stash push --include-untracked -- base.txt 'my notes.txt', then git restore --source=${at} --worktree -- base.txt. Then try again.`);
  assert.doesNotMatch(why, /git stash(,|\)| then)/, 'never a bare git stash');
  // Exactly those: the goal's own work (score.txt) stays where it is.
  runAdvice(why);
  assert.equal(file(w.path, 'score.txt'), '6\n');
  assert.equal(file(w.path, 'my notes.txt'), null);
  await act(S6, { action: 'round', n: 1, do: 'undo' });
  assert.equal(goal(S6).rounds[1].outcome, 'undone');
  assert.equal(goal(S6).rounds[1].by, 'you');
  assert.equal(file(w.path, 'score.txt'), '2\n', 'the say went through');
  // Five at most by name, the rest counted, and still the command for them alone.
  for (let i = 1; i <= 7; i++) write(w.path, `extra${i}.txt`, 'x\n');
  await act(S6, { action: 'pause' });
  await rejects(act(S6, { action: 'round', n: 1, do: 'keep' }), 409, /^These files changed outside the goal since it last left the files: extra1\.txt, extra2\.txt, extra3\.txt, extra4\.txt, extra5\.txt and 2 more\. To put your changes aside in a stash, run this in \S+ \(the worktree’s top folder: the paths are relative to it\): git stash push --include-untracked -- extra1\.txt extra2\.txt extra3\.txt extra4\.txt extra5\.txt extra6\.txt extra7\.txt\. Then try again\.$/);
  // More than ten: the commands cover the whole folder, and they too leave the goal's files as it left them.
  for (let i = 8; i <= 12; i++) write(w.path, `extra${i}.txt`, 'x\n');
  write(w.path, 'score.txt', '40\n');
  let many = '';
  try {
    await act(S6, { action: 'round', n: 1, do: 'keep' });
  } catch (e) {
    many = (e as HttpError).message;
  }
  const left = loadGoal(db, S6)!._.filesAt!.slice(0, 12);
  assert.equal(many, `These files changed outside the goal since it last left the files: extra1.txt, extra10.txt, extra11.txt, extra12.txt, extra2.txt and 8 more. To put your changes aside in a stash and put back the goal’s own version of the files, run these in ${w.path} (the worktree’s top folder): git stash push --include-untracked (everything changed since the last commit goes to the stash, your changes with it), then git restore --source=${left} --worktree -- :/. Then try again.`);
  execFileSync('bash', ['-c', `git stash push -q --include-untracked && git restore --source=${left} --worktree -- :/`], { cwd: w.path, stdio: 'pipe' });
  assert.equal(file(w.path, 'score.txt'), '2\n');
  await act(S6, { action: 'round', n: 1, do: 'keep' });
  assert.equal(file(w.path, 'score.txt'), '6\n', 'the say went through');
  assert.equal(file(w.path, 'extra1.txt'), null);
  await act(S6, { action: 'stop' });
});

test('R3-5, I2, I4: after a reset that did not finish, Keep anyway on the round brings everything back; once the folder was worked in, it is refused and nothing is wiped, and Resume goes on from the files as they are', async () => {
  const F3 = 'claude:goal-f3';
  const w = await atRound2(F3);
  setRestorer(resetsThenFails);
  try {
    await turn(F3, () => write(w.path, 'score.txt', '3\n'));
  } finally {
    setRestorer(null);
  }
  assert.match(goal(F3).reason!, /^Putting round 2’s files back did not finish/);
  // The person and the agent carried on in the session.
  await turn(F3, () => write(w.path, 'later.txt', 'work done since\n'));
  await rejects(act(F3, { action: 'round', n: 2, do: 'keep' }), 409, /^This file changed outside the goal since it last left the files: later\.txt\./);
  assert.equal(file(w.path, 'later.txt'), 'work done since\n', 'nothing wiped');
  await act(F3, { action: 'resume' });
  const g = goal(F3);
  assert.equal(g.status, 'working');
  assert.equal(g.rounds[2].outcome, 'stays');
  assert.equal(file(w.path, 'later.txt'), 'work done since\n');
  await act(F3, { action: 'stop' });
});

test('who wrote, for every session in the folder: a hand edit beside an idle fork is undone and kept in the round’s checkpoint; a turn this session’s program started by itself (no message in the transcript) is checked again', async () => {
  const F4 = 'claude:goal-f4';
  const w = await atRound2(F4);
  sessions.add('claude:goal-f4-fork', { cwd: w.path, title: 'Fork' });
  // R3-3 too: no rule that the files must match any more, with another session in the folder or without.
  checkingSoon();
  const h = whileChecking(() => write(w.path, 'hand.txt', 'mine\n'));
  await turn(F4, () => write(w.path, 'score.txt', '3\n'));
  await h;
  let g = goal(F4);
  assert.equal(g.status, 'working');
  assert.equal(g.rounds[2].outcome, 'undone');
  assert.equal(file(w.path, 'hand.txt'), null);
  assert.equal(inCheckpoint(w.path, g.rounds[2].checkpoint!, 'hand.txt'), 'mine\n');
  // A turn this session's program began by itself during the checks (its summary's clock says so, no message).
  const self = sessions.all.get(F4)!;
  checkingSoon();
  const s2 = whileChecking(() => (self.endedAt = Date.now()));
  await turn(F4, () => write(w.path, 'score.txt', '2\n'));
  await s2;
  g = goal(F4);
  assert.equal(g.status, 'working');
  assert.equal(g.rounds.length, 3, 'checked again later, not judged now');
  await act(F4, { action: 'stop' });
});

test('R3-3: checks that write a file git does not ignore, with another session in the folder: undone every time, no pause loop, and the say still goes', async () => {
  const R33 = 'claude:goal-r3-3';
  const checks = [{ kind: 'measure', label: 'Score', run: `touch ${CHECKING}; date +%s%N > result.txt; sleep 1; cat score.txt`, target: { op: '>=', value: 10 } }];
  const w = await atRound2(R33, { checks });
  sessions.add('claude:goal-r3-3-fork', { cwd: w.path, title: 'Fork' });
  await turn(R33, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(R33).rounds[2].outcome, 'undone');
  assert.equal(goal(R33).status, 'working');
  await turn(R33, () => write(w.path, 'score.txt', '4\n'));
  assert.equal(goal(R33).rounds[3].outcome, 'undone');
  await stopAgent(R33);
  await act(R33, { action: 'round', n: 3, do: 'keep' });
  assert.equal(file(w.path, 'score.txt'), '4\n');
  await act(R33, { action: 'stop' });
});

test('an archived session in the folder with an old queued message does not hold an undo', async () => {
  const F14 = 'claude:goal-f14';
  const w = await atRound2(F14);
  sessions.add('claude:goal-f14-old', { cwd: w.path, title: 'Before Edit from here', queue: ['an old message nobody sends'], archived: true });
  db.prepare('update app_sessions set archived = 1 where key = ?').run('claude:goal-f14-old');
  await turn(F14, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(F14).rounds[2].outcome, 'undone');
  assert.equal(goal(F14).status, 'working');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  // A queued message alone (not archived) is no work in the folder either.
  sessions.add('claude:goal-f14-queued', { cwd: w.path, queue: ['waits'] });
  await turn(F14, () => write(w.path, 'score.txt', '2\n'));
  assert.equal(goal(F14).rounds[3].outcome, 'undone');
  await act(F14, { action: 'stop' });
});

test('a message to the agent waits while the files are being put back', async () => {
  const F13 = 'claude:goal-f13';
  const w = await atRound2(F13);
  let release!: () => void;
  let started = false;
  setRestorer(async (wt, commit) => {
    started = true;
    await new Promise<void>((r) => (release = r));
    return restoreCheckpoint(wt, commit);
  });
  try {
    const t = turn(F13, () => write(w.path, 'score.txt', '3\n'));
    await until('the restore to start', () => started, 30_000);
    let sendGoesOn = false;
    const waiting = goals.beforeSend!(F13, deps)!.then(() => (sendGoesOn = true));
    await sleep(100);
    assert.equal(sendGoesOn, false, 'held while git puts the files back');
    release();
    await waiting;
    assert.equal(sendGoesOn, true);
    await t;
    await restoreSettled(F13);
  } finally {
    setRestorer(null);
  }
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(F13, { action: 'stop' });
});

test('a check written with its keys in another order, or only renamed, is not a changed check', () => {
  // As the agent's proposal keeps it (its id last) and as a change keeps it (its id after its name): the same check.
  const proposed = { kind: 'measure', label: 'Score', timeoutS: 30, run: 'npm run eval', target: { op: '>=', value: 1 }, read: 'score: ([0-9.]+)', id: 'c1' } as GoalCheck;
  const sent = { kind: 'measure', label: 'Score, renamed', id: 'c1', timeoutS: 30, run: 'npm run eval', target: { value: 1, op: '>=' }, read: 'score: ([0-9.]+)' } as GoalCheck;
  assert.deepEqual(changedChecks([proposed], [sent]), [], 'nothing to measure again: the start keeps its value');
  assert.deepEqual(changedChecks([proposed], [{ ...sent, run: 'npm run eval:all' }]), ['c1']);
  // P3: a new target (or slack, unit, time limit) measures the same thing: judged again, not measured again.
  assert.deepEqual(changedChecks([proposed], [{ ...sent, target: { op: '>=', value: 0.9 } }]), []);
  assert.deepEqual(retargeted([proposed], [{ ...sent, target: { op: '>=', value: 0.9 } }]), ['c1']);
  assert.deepEqual(changedChecks([proposed], [{ ...sent, slack: 0.3, unit: 'pts', timeoutS: 90 }]), []);
  assert.deepEqual(retargeted([proposed], [{ ...sent, slack: 0.3, unit: 'pts', timeoutS: 90 }]), []);
  assert.deepEqual(retargeted([proposed], [{ ...sent, run: 'npm run eval:all', target: { op: '>=', value: 0.9 } }]), [], 'measured again, not judged again');
  assert.deepEqual(changedChecks([proposed], [{ ...sent, read: 'total: ([0-9.]+)' }]), ['c1']);
  assert.deepEqual(changedChecks([proposed], [sent, { kind: 'command', label: 'New', run: 'true', id: 'c2' }]), ['c2'], 'a new check is measured');
  const review = { kind: 'review', label: 'Reads well', claim: 'Every error says what to do', evidence: { diff: true, files: ['a.md', 'b.md'] }, id: 'c3' } as GoalCheck;
  assert.deepEqual(changedChecks([review], [{ id: 'c3', evidence: { files: ['a.md', 'b.md'], diff: true }, claim: 'Every error says what to do', label: 'Reads well', kind: 'review' }]), []);
  assert.deepEqual(changedChecks([review], [{ ...review, evidence: { diff: true, files: ['b.md', 'a.md'] } }]), ['c3'], 'the order of a list counts');
});

test('the files a round changed that git cannot list: a check that could not run, never “nothing changed”', async () => {
  const F15 = 'claude:goal-f15';
  const w = await atRound2(F15, { protect: ['tests/'] });
  const g = loadGoal(db, F15)!;
  g._.roundBase = 'e'.repeat(40);
  saveGoal(db, g);
  await turn(F15, () => write(w.path, 'tests/a.test.sh', 'true\n'));
  assert.equal(goal(F15).status, 'paused');
  assert.match(goal(F15).reason!, /^The files round 2 changed could not be listed \(.+\), so its protected paths could not be checked\. Resume to check the round again\.$/);
  assert.equal(goal(F15).rounds.length, 2, 'neither kept nor undone');
  await act(F15, { action: 'stop' });
});

test('where the loop leaves the files after measuring is after its checks: what they wrote does not refuse a say later', async () => {
  const F10 = 'claude:goal-f10';
  const w = worktree();
  sessions.add(F10, { cwd: w.path, worktree: w });
  const checks = [{ kind: 'measure', label: 'Score', run: 'date +%s%N > result.txt; cat score.txt', target: { op: '>=', value: 10 } }];
  await agreed(F10, { checks, settings: { asks: 'own' } });
  const g = loadGoal(db, F10)!;
  assert.ok(inCheckpoint(w.path, g._.filesAt!, 'result.txt'), 'taken after the checks ran');
  await stopAgent(F10);
  await act(F10, { action: 'round', n: 0, do: 'from' });
  assert.equal(goal(F10).best, 0);
  await act(F10, { action: 'stop' });
});

test('outside a worktree, after a failed final check: a round that changed nothing is No change, with no second review; one that changed something is looked at again', async () => {
  const G = path.join(tmp, 'plain-git');
  fs.mkdirSync(G);
  fs.writeFileSync(path.join(G, 'readme.md'), 'hello\n');
  git(G, 'init', '-q', '-b', 'main');
  git(G, 'add', '-A');
  git(G, 'commit', '-q', '-m', 'start');
  const F12 = 'claude:goal-f12';
  sessions.add(F12, { cwd: G });
  await agreed(F12, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }] });
  assert.equal(goal(F12).undo, false);
  reviewer.final = { ok: false, reason: 'done.txt says nothing.' };
  await turn(F12, () => write(G, 'done.txt', 'x\n'));
  const n0 = finals();
  await turn(F12);
  const r = goal(F12).rounds.at(-1)!;
  assert.deepEqual([r.outcome, r.why], ['stays', 'No change']);
  assert.equal(finals(), n0, 'not reviewed again');
  reviewer.final = { ok: true, reason: 'Now it says what it does.' };
  await turn(F12, () => write(G, 'done.txt', 'Done: the export works.\n'));
  assert.equal(finals(), n0 + 1);
  assert.equal(goal(F12).status, 'reached');
  reviewer.final = { ok: true, reason: 'The change meets the goal: score.txt says 10.' };
});

test('the mark of a check’s command is forgotten once its run ends, the final check’s too', async () => {
  const F11 = 'claude:goal-f11';
  const w = worktree();
  sessions.add(F11, { cwd: w.path, worktree: w });
  await agreed(F11, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }] });
  await turn(F11, () => write(w.path, 'done.txt', 'done\n'));
  assert.equal(goal(F11).status, 'reached');
  assert.equal(loadGoal(db, F11)!._.running, undefined, 'the final check ran a command, and its mark went with it');
});

test('R3-4, R7: Keep anyway (or another way from) the best round while the person’s own check is asked: they are asked again, and the files are not reviewed twice', async () => {
  const R7 = 'claude:goal-r7';
  const w = worktree();
  sessions.add(R7, { cwd: w.path, worktree: w });
  await agreed(R7, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }, { kind: 'you', label: 'The wording reads well' }] });
  await turn(R7, () => write(w.path, 'done.txt', 'Done.\n'));
  assert.equal(goal(R7).status, 'needs-you');
  assert.equal(goal(R7).question!.kind, 'yours');
  const n0 = finals();
  const s0 = sent(R7);
  await act(R7, { action: 'round', n: 1, do: 'keep' });
  assert.equal(goal(R7).status, 'needs-you', 'asked again, not a new round');
  assert.equal(goal(R7).question!.kind, 'yours');
  await act(R7, { action: 'round', n: 1, do: 'from' });
  assert.equal(goal(R7).question!.kind, 'yours');
  assert.equal(finals(), n0, 'judged already: no second review');
  assert.equal(sent(R7), s0, 'no round message');
  await act(R7, { action: 'answer', ways: [0] });
  assert.equal(goal(R7).status, 'reached');
});

test('R3-6, I2: a reset that does not finish keeps a hand edit made while the checks ran in the round’s checkpoint, and Keep anyway on the round brings all of it back', async () => {
  const R36 = 'claude:goal-r3-6';
  const w = await atRound2(R36);
  setRestorer(resetsThenFails);
  try {
    checkingSoon();
    const h = whileChecking(() => write(w.path, 'hand.txt', 'by hand\n'));
    await turn(R36, () => write(w.path, 'score.txt', '3\n'));
    await h;
  } finally {
    setRestorer(null);
  }
  const g = loadGoal(db, R36)!;
  assert.equal(g.status, 'paused');
  assert.equal(inCheckpoint(w.path, g.rounds[2].checkpoint!, 'hand.txt'), 'by hand\n');
  assert.equal(file(w.path, 'score.txt'), '2\n', 'partly put back');
  await act(R36, { action: 'round', n: 2, do: 'keep' });
  assert.equal(file(w.path, 'score.txt'), '3\n');
  assert.equal(file(w.path, 'hand.txt'), 'by hand\n');
  await act(R36, { action: 'stop' });
});

test('R3-7, I2: a restart in the middle of a reset: the tick finds its mark and does not try again; the round is recorded with the safety checkpoint, the goal pauses once, and Resume goes on from the files as they are', async () => {
  const R37 = 'claude:goal-r3-7';
  const w = await atRound2(R37);
  write(w.path, 'score.txt', '3\n');
  const safety = (await checkpoint(w))!;
  // Half put back when the app went down.
  write(w.path, 'score.txt', '5\n');
  const g = loadGoal(db, R37)!;
  g.status = 'checking';
  const results = g.rounds[1].results.map((r) => (r.id === 'c1' ? { ...r, value: 3, holds: false } : r));
  g._.restoreTo = { to: g._.roundBase!, n: 2, by: 'undo', at: Date.now(), safety, record: { n: 2, startedAt: 1, endedAt: 2, results, score: 0, outcome: 'undone', why: 'Score fell far behind its best (6 → 3)', cause: 'behind', usd: 0, checkpoint: safety } };
  saveGoal(db, g);
  resets = 0;
  setRestorer(async (wt, c) => {
    resets++;
    return restoreCheckpoint(wt, c);
  });
  try {
    await tick(deps);
  } finally {
    setRestorer(null);
  }
  let after = goal(R37);
  assert.equal(resets, 0, 'no second try');
  assert.equal(file(w.path, 'score.txt'), '5\n');
  assert.equal(after.status, 'paused');
  assert.equal(after.reason, 'Putting round 2’s files back did not finish, so the files may be partly put back. Everything that was in the folder is saved: Keep anyway… on round 2 brings it back. Resume goes on from the files as they are.');
  assert.equal(after.rounds[2].outcome, 'stays');
  assert.equal(after.rounds[2].checkpoint, safety);
  assert.equal(after.rounds[2].results.find((r) => r.id === 'c1')!.value, 3, 'as judged before the restart');
  assert.equal(loadGoal(db, R37)!._.restoreTo, undefined);
  await act(R37, { action: 'resume' });
  after = goal(R37);
  assert.equal(after.status, 'working');
  assert.equal(file(w.path, 'score.txt'), '5\n');
  await act(R37, { action: 'stop' });
});

test('R3-8, I2: a say whose reset does not finish applies nothing of it and pauses once; Resume goes on from the files as they are, without a second try', async () => {
  const R38 = 'claude:goal-r3-8';
  const w = await atRound2(R38);
  await turn(R38, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(R38).rounds[2].outcome, 'undone');
  await stopAgent(R38);
  resets = 0;
  setRestorer(resetsThenFails);
  try {
    await act(R38, { action: 'round', n: 2, do: 'keep' });
  } finally {
    setRestorer(null);
  }
  let g = goal(R38);
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, 'Putting round 2’s files back did not finish, so the files may be partly put back. Everything that was in the folder is saved: Keep anyway… on round 1 brings it back. Resume goes on from the files as they are.');
  assert.equal(g.best, 1, 'nothing of the say applied');
  assert.equal(g.rounds[2].outcome, 'undone');
  await act(R38, { action: 'resume' });
  g = goal(R38);
  assert.equal(resets, 1, 'never a second try');
  assert.equal(g.best, 1);
  assert.notEqual(g.status, 'paused');
  await act(R38, { action: 'stop' });
});

test('R9: a Hydor subagent whose turn has not been reported to its lead yet is still at work: the round is not checked until its report arrived', async () => {
  const R9 = 'claude:goal-r9';
  const w = worktree();
  sessions.add(R9, { cwd: w.path, worktree: w });
  await agreed(R9, { settings: { asks: 'own' } });
  const child = 'claude:goal-r9-child';
  sessions.add(child, { cwd: w.path, title: 'Helper' });
  setSessionExtra(db, child, { parent: R9 });
  const c = sessions.all.get(child)!;
  c.items.push({ kind: 'user', id: 'cp1', seq: 0, ts: Date.now(), text: 'Do the part' } as TimelineItem, { kind: 'turn', id: 'ct1', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
  c.endedAt = Date.now();
  await turn(R9, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(R9).rounds.length, 1, 'its subagent’s report is on its way: no check yet');
  await tick(deps);
  assert.equal(goal(R9).rounds.length, 1);
  setSessionExtra(db, child, { reported: 'cp1' });
  await tick(deps);
  assert.equal(goal(R9).rounds.length, 2);
  assert.equal(goal(R9).rounds[1].outcome, 'kept');
  await act(R9, { action: 'stop' });
});

test('R12: going back to files the final check already judged does not pay for the strong review again', async () => {
  const R12 = 'claude:goal-r12';
  const w = worktree();
  sessions.add(R12, { cwd: w.path, worktree: w });
  await agreed(R12, { checks: [{ kind: 'command', label: 'Done file exists', run: 'test -f done.txt' }], settings: { asks: 'own' } });
  reviewer.final = { ok: false, reason: 'Not yet.' };
  await turn(R12, () => write(w.path, 'done.txt', 'one\n'));
  await turn(R12, () => write(w.path, 'done.txt', 'two\n'));
  assert.equal(loadGoal(db, R12)!._.judged!.length, 2, 'both judged, and failed');
  const n0 = finals();
  await stopAgent(R12);
  await act(R12, { action: 'round', n: 1, do: 'keep' });
  await act(R12, { action: 'resume' });
  assert.equal(finals(), n0, 'round 1’s files were judged: not reviewed again');
  assert.equal(goal(R12).status, 'working');
  reviewer.final = { ok: true, reason: 'The change meets the goal: score.txt says 10.' };
  await act(R12, { action: 'stop' });
});

test('R13: a turn a restart cut without an end (begun after the round’s message, the session idle, nothing ended since): sent again once with the restart line after two quiet minutes; cut again, the goal pauses', async () => {
  const R13 = 'acp:goal-r13';
  const w = worktree();
  sessions.add(R13, { agent: 'acp', acpAgent: 'console', cwd: w.path, worktree: w });
  await agreed(R13, { settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(R13, () => write(w.path, 'score.txt', '4\n'));
  await turn(R13, async () => {
    await tool(R13, 'goal_ask', { question: 'Which?', ways: [{ name: 'Up by one' }, { name: 'Up by six' }], pick: 2 });
  });
  // The person answers: round 2's message goes out, and the agent begins its turn.
  await act(R13, { action: 'answer', ways: [1] });
  const round2 = last(R13);
  assert.equal(headOf(R13), 'round 2 of 8');
  const f = sessions.all.get(R13)!;
  const sentAt = loadGoal(db, R13)!._.sentAt!;
  await sleep(5);
  f.items.push({ kind: 'user', id: 'r13a', seq: 0, ts: Date.now(), text: round2 } as TimelineItem);
  // The app is killed a moment later and started again: the turn has no end, the session is idle, its last end is older.
  assert.ok((f.endedAt ?? 0) < sentAt);
  const n = sent(R13);
  await tick(deps);
  await tick(deps, Date.now() + 60_000);
  assert.equal(sent(R13), n, 'not before it has been quiet for two minutes');
  assert.equal(goal(R13).status, 'working');
  await tick(deps, Date.now() + UNSENT_MS + 1000);
  assert.equal(sent(R13), n + 1);
  assert.equal(headOf(R13), 'round 2 of 8');
  assert.ok(goalMessageOf(last(R13))!.body.startsWith(RESTARTED));
  assert.ok(last(R13).endsWith(goalMessageOf(round2)!.body.trimStart()));
  assert.equal(goal(R13).round, 2);
  // Cut again the same way: the goal pauses with a reason.
  await sleep(5);
  f.items.push({ kind: 'user', id: 'r13b', seq: 0, ts: Date.now(), text: 'again' } as TimelineItem);
  await tick(deps);
  await tick(deps, Date.now() + UNSENT_MS + 1000);
  assert.equal(goal(R13).status, 'paused');
  assert.equal(goal(R13).reason, 'A restart of the app cut the agent’s turn short again. Resume to check what it did.');
  assert.equal(sent(R13), n + 1);
  await act(R13, { action: 'stop' });
});

test('R13: a turn’s end in the transcript that the loop never heard of (its summary not saying so yet) is dealt with as any turn’s end', async () => {
  const R13b = 'claude:goal-r13-end';
  const w = worktree();
  sessions.add(R13b, { cwd: w.path, worktree: w });
  await agreed(R13b, { settings: { asks: 'own' } });
  const f = sessions.all.get(R13b)!;
  await sleep(5);
  write(w.path, 'score.txt', '5\n');
  f.items.push({ kind: 'user', id: 'r13c', seq: 0, ts: Date.now(), text: last(R13b) } as TimelineItem);
  await sleep(5);
  f.items.push({ kind: 'turn', id: 'r13d', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
  await sleep(5);
  await tick(deps);
  assert.equal(goal(R13b).rounds.length, 2, 'checked at the first tick');
  assert.equal(goal(R13b).rounds[1].outcome, 'kept');
  await act(R13b, { action: 'stop' });
});

// ---- fewer ways to put files back (section I): its rules, the fourth review's sequences, and a test for each guard -----

test('X1, I1: a fork that worked in the folder during the round, idle again by its end, keeps its work: the round stays, with why', async () => {
  const X1 = 'claude:goal-x1';
  const w = worktree();
  sessions.add(X1, { cwd: w.path, worktree: w });
  await agreed(X1, { checks: SLOW_SCORE, settings: { asks: 'own' } });
  await turn(X1, () => write(w.path, 'score.txt', '6\n'));
  // During round 2 a fork works in the folder, and is done before the round ends.
  sessions.add('claude:goal-x1-fork', { cwd: w.path, title: 'The fork' });
  const fork = sessions.all.get('claude:goal-x1-fork')!;
  await sleep(5);
  fork.items.push({ kind: 'user', id: 'x1f', seq: 0, ts: Date.now(), text: 'Write the docs' } as TimelineItem);
  write(w.path, 'docs.txt', 'the fork’s docs\n');
  fork.endedAt = Date.now();
  await sleep(5);
  await turn(X1, () => write(w.path, 'score.txt', '3\n'));
  const g = goal(X1);
  assert.equal(g.rounds[2].outcome, 'stays');
  assert.match(g.rounds[2].why!, /It was not undone: another session \(“The fork”\) was working in the folder$/);
  assert.equal(file(w.path, 'docs.txt'), 'the fork’s docs\n', 'not reset away');
  await act(X1, { action: 'stop' });
});

test('X2: a re-check followed by a restart during the person’s turn does not leave the goal at work for ever: the round message goes again after two quiet minutes', async () => {
  const X2 = 'claude:goal-x2';
  const w = await atRound2(X2);
  const f = sessions.all.get(X2)!;
  checkingSoon();
  const t = whileChecking(() => f.items.push({ kind: 'user', id: 'x2p', seq: 0, ts: Date.now(), text: 'And also this' } as TimelineItem));
  await turn(X2, () => write(w.path, 'score.txt', '3\n'));
  await t;
  assert.equal(goal(X2).status, 'working');
  assert.equal(f.endedAt, loadGoal(db, X2)!._.lastTurn, 'the summary’s end is the turn the loop dealt with');
  // The app restarts during the person's turn: it never ends.
  const n = sent(X2);
  await tick(deps);
  await tick(deps, Date.now() + 60_000);
  assert.equal(sent(X2), n);
  await tick(deps, Date.now() + UNSENT_MS + 1000);
  assert.equal(sent(X2), n + 1);
  assert.ok(goalMessageOf(last(X2))!.body.startsWith(RESTARTED));
  await act(X2, { action: 'stop' });
});

test('X2, guard (a subagent’s report at the reset): a report on its way when the round is to be undone holds it; once that report is out of the reckoning, the round is checked', async () => {
  const X2b = 'claude:goal-x2-report';
  const w = await atRound2(X2b);
  // Its subagent works elsewhere (not in this folder): only the look for its report can see it.
  const child = 'claude:goal-x2-child';
  sessions.add(child, { cwd: PLAIN, title: 'Helper' });
  setSessionExtra(db, child, { parent: X2b });
  const c = sessions.all.get(child)!;
  checkingSoon();
  const t = whileChecking(() => {
    c.items.push({ kind: 'user', id: 'x2c', seq: 0, ts: Date.now(), text: 'Do the part' } as TimelineItem, { kind: 'turn', id: 'x2t', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
    c.endedAt = Date.now();
  });
  await turn(X2b, () => write(w.path, 'score.txt', '3\n'));
  await t;
  assert.equal(goal(X2b).status, 'working');
  assert.equal(goal(X2b).rounds.length, 2, 'not undone while its report is on its way');
  assert.equal(file(w.path, 'score.txt'), '3\n');
  await tick(deps);
  assert.equal(goal(X2b).rounds.length, 2, 'it may still come');
  // Ten minutes on, the report never came: the round is checked.
  c.endedAt = Date.now() - 11 * 60_000;
  await tick(deps);
  assert.equal(goal(X2b).rounds.length, 3);
  assert.equal(goal(X2b).rounds[2].outcome, 'undone');
  await act(X2b, { action: 'stop' });
});

test('X6, I2: a say on a goal the person stopped, whose reset does not finish: the goal stays stopped, its report says what is saved where, and nothing revives it', async () => {
  const X6 = 'claude:goal-x6';
  const w = await atRound2(X6);
  await turn(X6, () => write(w.path, 'score.txt', '3\n'));
  await act(X6, { action: 'stop' });
  setRestorer(resetsThenFails);
  try {
    await act(X6, { action: 'round', n: 2, do: 'keep' });
  } finally {
    setRestorer(null);
  }
  const g = goal(X6);
  assert.equal(g.status, 'stopped');
  assert.match(g.report!.summary, /^Stopped by you during round 3: that round’s work was not checked\. Putting round 2’s files back did not finish, so the files may be partly put back\./);
  assert.equal(loadGoal(db, X6)!._.restoreTo, undefined);
  await rejects(act(X6, { action: 'resume' }), 409, /over/);
});

test('X9: stopped after a reset that did not finish, the report says what is saved where; a new goal set over one with a reset under way starts without its mark', async () => {
  const X9 = 'claude:goal-x9';
  const w = await atRound2(X9);
  setRestorer(resetsThenFails);
  try {
    await turn(X9, () => write(w.path, 'score.txt', '3\n'));
  } finally {
    setRestorer(null);
  }
  assert.equal(goal(X9).status, 'paused');
  await act(X9, { action: 'stop' });
  assert.match(goal(X9).report!.summary, /^Stopped by you\. Putting round 2’s files back did not finish/);
  const X9b = 'claude:goal-x9-new';
  await atRound2(X9b);
  const g = loadGoal(db, X9b)!;
  g._.restoreTo = { to: g._.roundBase!, n: 2, by: 'undo', at: Date.now(), safety: g._.roundBase! };
  saveGoal(db, g);
  await act(X9b, { action: 'set', objective: 'Something else' });
  assert.equal(loadGoal(db, X9b)!._.restoreTo, undefined);
  assert.equal(goal(X9b).status, 'drafting');
  await act(X9b, { action: 'stop' });
});

test('guard (the mark): the mark, with the safety checkpoint as the round’s own, is in the goal’s state before any file is touched, and goes once they are back', async () => {
  const G7 = 'claude:goal-guard-mark';
  const w = await atRound2(G7);
  let seen: RestoreMark | undefined;
  setRestorer(async (wt, c) => {
    seen = loadGoal(db, G7)!._.restoreTo;
    return restoreCheckpoint(wt, c);
  });
  try {
    await turn(G7, () => write(w.path, 'score.txt', '3\n'));
  } finally {
    setRestorer(null);
  }
  assert.ok(seen, 'written before the reset');
  assert.deepEqual([seen!.n, seen!.by], [2, 'undo']);
  assert.equal(seen!.record!.checkpoint, seen!.safety, 'the safety checkpoint is the round’s own');
  assert.equal(inCheckpoint(w.path, seen!.safety, 'score.txt'), '3\n');
  assert.equal(goal(G7).rounds[2].checkpoint, seen!.safety);
  assert.equal(loadGoal(db, G7)!._.restoreTo, undefined);
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(G7, { action: 'stop' });
});

test('guard (the last look): this session busy again while the others in the folder were being read: nothing is put back, the round is checked again later', async () => {
  const G8 = 'claude:goal-guard-last';
  const w = await atRound2(G8);
  sessions.add('claude:goal-guard-last-fork', { cwd: w.path, title: 'Quiet fork' });
  const self = sessions.all.get(G8)!;
  sessions.timelineHook = (k) => {
    if (k === 'claude:goal-guard-last-fork') self.delivering = true;
  };
  try {
    await turn(G8, () => write(w.path, 'score.txt', '3\n'));
  } finally {
    sessions.timelineHook = undefined;
    self.delivering = false;
  }
  assert.equal(goal(G8).status, 'working');
  assert.equal(goal(G8).rounds.length, 2);
  assert.equal(file(w.path, 'score.txt'), '3\n');
  await act(G8, { action: 'stop' });
});

test('guard (the last look, the clocks): a turn of this session that ended while the others in the folder were being read: nothing is put back', async () => {
  const G9 = 'claude:goal-guard-clock';
  const w = await atRound2(G9);
  sessions.add('claude:goal-guard-clock-fork', { cwd: w.path, title: 'Quiet fork' });
  const self = sessions.all.get(G9)!;
  sessions.timelineHook = (k) => {
    if (k === 'claude:goal-guard-clock-fork') self.endedAt = Date.now() + 1;
  };
  try {
    await turn(G9, () => write(w.path, 'score.txt', '3\n'));
  } finally {
    sessions.timelineHook = undefined;
  }
  assert.equal(goal(G9).status, 'working');
  assert.equal(goal(G9).rounds.length, 2);
  assert.equal(file(w.path, 'score.txt'), '3\n');
  await act(G9, { action: 'stop' });
});

test('I5: while the goal is at a step, putting the files back from “Edit from here” is refused', async () => {
  const I5 = 'claude:goal-i5';
  const w = await atRound2(I5);
  let during: string | null = null;
  checkingSoon();
  const t = whileChecking(() => (during = goalResetRefusal(db, I5)));
  await turn(I5, () => write(w.path, 'score.txt', '7\n'));
  await t;
  assert.match(String(during), /This session’s goal is checking its files right now/);
  assert.equal(goalResetRefusal(db, I5), null, 'not between steps');
  await act(I5, { action: 'stop' });
});

test('J1: putting files back leaves the folder exactly as the checkpoint: a tracked file it does not hold goes, one it holds comes back', async () => {
  const w = worktree();
  fs.rmSync(path.join(w.path, 'base.txt'));
  write(w.path, 'new.txt', 'new\n');
  const c = (await checkpoint(w))!;
  write(w.path, 'base.txt', 'back again\n');
  write(w.path, 'score.txt', '9\n');
  fs.rmSync(path.join(w.path, 'new.txt'));
  await restoreCheckpoint(w, c);
  assert.equal(file(w.path, 'base.txt'), null, 'deleted in the checkpoint, deleted again');
  assert.equal(file(w.path, 'new.txt'), 'new\n');
  assert.equal(file(w.path, 'score.txt'), '2\n');
  assert.equal(git(w.path, 'rev-parse', 'HEAD'), git(w.path, 'rev-parse', `${c}^`), 'on the commit it was on');
});

test('J1: a kept round that deleted a tracked file (not committed), then an undone round: the file stays deleted; so too after the person’s say', async () => {
  const J1 = 'claude:goal-j1';
  const w = worktree();
  sessions.add(J1, { cwd: w.path, worktree: w });
  await agreed(J1, { checks: SLOW_SCORE, settings: { asks: 'own' } });
  await turn(J1, () => {
    write(w.path, 'score.txt', '6\n');
    fs.rmSync(path.join(w.path, 'base.txt'));
  });
  assert.equal(goal(J1).rounds[1].outcome, 'kept');
  await turn(J1, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(J1).rounds[2].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  assert.equal(file(w.path, 'base.txt'), null, 'deleted by the kept round, it stays deleted');
  await stopAgent(J1);
  await act(J1, { action: 'round', n: 2, do: 'keep' });
  assert.equal(file(w.path, 'score.txt'), '3\n');
  assert.equal(file(w.path, 'base.txt'), null);
  await act(J1, { action: 'round', n: 0, do: 'keep' });
  assert.equal(file(w.path, 'base.txt'), 'base\n', 'the start holds it');
  await act(J1, { action: 'round', n: 1, do: 'keep' });
  assert.equal(file(w.path, 'base.txt'), null);
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(J1, { action: 'stop' });
});

/** A goal stopped at its money limit during round 1, whose agent had written half.txt; then the app restarted before the half round's checkpoint was taken. */
async function halfCut(key: string) {
  const w = worktree();
  sessions.add(key, { cwd: w.path, worktree: w });
  await agreed(key, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  sessions.all.get(key)!.live = 'working';
  write(w.path, 'half.txt', 'half done\n');
  write(w.path, 'score.txt', '7\n');
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', 2.5) on conflict(key) do update set cost_usd = excluded.cost_usd").run(key, key);
  await tick(deps);
  assert.equal(goal(key).status, 'limit');
  // As stored when the restart came between the limit and halfRound: no checkpoint, the files left where the round started.
  const g = loadGoal(db, key)!;
  const half = g.rounds.find((r) => r.n === 1)!;
  assert.equal(half.why, 'Stopped at the limit midway');
  delete half.checkpoint;
  g._.filesAt = g.rounds[0].checkpoint;
  saveGoal(db, g);
  return w;
}

test('J2: a restart between a limit and the half round’s checkpoint: the person’s say takes that checkpoint first, so the agent’s work is not taken for an edit made outside the goal, and Keep anyway on the half round brings it back', async () => {
  const J2 = 'claude:goal-j2-say';
  const w = await halfCut(J2);
  await act(J2, { action: 'round', n: 0, do: 'keep' });
  assert.equal(file(w.path, 'half.txt'), null, 'put back to the start');
  const half = goal(J2).rounds.find((r) => r.n === 1)!;
  assert.equal(inCheckpoint(w.path, half.checkpoint!, 'half.txt'), 'half done\n', 'its checkpoint holds the agent’s work');
  await act(J2, { action: 'round', n: 1, do: 'keep' });
  await until('measured', () => goal(J2).status === 'limit');
  assert.equal(file(w.path, 'half.txt'), 'half done\n');
  assert.equal(goal(J2).best, 1);
  db.prepare('delete from sessions where key = ?').run(J2);
  await act(J2, { action: 'stop' });
});

test('J2: a restart between a limit and the half round’s checkpoint: Give it more… takes that checkpoint first', async () => {
  const J2b = 'claude:goal-j2-more';
  const w = await halfCut(J2b);
  await act(J2b, { action: 'change', contract: { limits: { rounds: 8, usd: 50 } } });
  assert.equal(goal(J2b).status, 'working');
  const half = goal(J2b).rounds.find((r) => r.n === 1)!;
  assert.ok(half.checkpoint, 'the half round has its checkpoint');
  assert.equal(inCheckpoint(w.path, half.checkpoint!, 'half.txt'), 'half done\n');
  assert.equal(loadGoal(db, J2b)!._.filesAt, half.checkpoint, 'where the loop leaves the files');
  db.prepare('delete from sessions where key = ?').run(J2b);
  await act(J2b, { action: 'stop' });
});

test('J2, guard (only at the limit): a half round without its checkpoint on a goal that went on (given more before this was put right) is not saved from a folder that holds a later round’s work', async () => {
  const J2c = 'claude:goal-j2-later';
  const w = await halfCut(J2c);
  // As stored when Give it more came before this was put right: round 2 under way, then paused, the half round still
  // without its checkpoint.
  const g = loadGoal(db, J2c)!;
  g.status = 'paused';
  g._.pausedFrom = 'working';
  g.round = 2;
  g.endedAt = undefined;
  g.report = undefined;
  saveGoal(db, g);
  write(w.path, 'round2.txt', 'round 2’s work\n');
  await act(J2c, { action: 'round', n: 0, do: 'keep' }).catch(() => {});
  assert.equal(goal(J2c).rounds.find((r) => r.n === 1)!.checkpoint, undefined, 'not taken from round 2’s files');
  db.prepare('delete from sessions where key = ?').run(J2c);
  await act(J2c, { action: 'stop' });
});

test('J3: a queue on hold, then Pause: the wait’s mark goes with it, so a question that opens later is never turned into work; a mark left beside a question keeps the question', async () => {
  const J3 = 'claude:goal-j3';
  const w = worktree();
  sessions.add(J3, { cwd: w.path, worktree: w });
  await agreed(J3, { settings: { asks: 'own' } });
  const f = sessions.all.get(J3)!;
  f.queue = ['Also update the docs'];
  f.queueHeld = true;
  await turn(J3, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(J3).status, 'needs-you');
  assert.equal(loadGoal(db, J3)!._.heldQueue, true);
  await act(J3, { action: 'pause' });
  assert.equal(loadGoal(db, J3)!._.heldQueue, undefined, 'the wait ended: its mark went');
  f.queue = [];
  f.queueHeld = false;
  await act(J3, { action: 'resume' });
  assert.equal(goal(J3).status, 'working');
  assert.equal(goal(J3).round, 2);
  await turn(J3, async () => {
    await tool(J3, 'goal_report', { did: 'Got halfway.', blocked: 'Which scoring service should I call?' });
  });
  assert.equal(goal(J3).status, 'needs-you');
  await tick(deps);
  let g = goal(J3);
  assert.equal(g.status, 'needs-you', 'the question still waits');
  assert.equal(g.question?.question, 'Which scoring service should I call?');
  // A mark left beside the question (as stored before this was put right): the tick keeps the question, the mark goes.
  const stale = loadGoal(db, J3)!;
  stale._.heldQueue = true;
  stale._.heldFrom = 'working';
  saveGoal(db, stale);
  await tick(deps);
  g = goal(J3);
  assert.equal(g.status, 'needs-you');
  assert.equal(g.question?.question, 'Which scoring service should I call?');
  assert.equal(g.reason, 'Which scoring service should I call?');
  assert.equal(loadGoal(db, J3)!._.heldQueue, undefined);
  await act(J3, { action: 'stop' });
});

/** As stored when a restart cut the undo of round 2 halfway: its mark, its record with the safety checkpoint. */
async function cutUndo(key: string, w: WorktreeInfo, status: GoalState['status']) {
  write(w.path, 'score.txt', '3\n');
  const g = loadGoal(db, key)!;
  const safety = (await checkpoint(w))!;
  g.status = status;
  g._.restoreTo = { to: g._.roundBase!, n: 2, by: 'undo', at: Date.now(), safety, record: { n: 2, startedAt: Date.now() - 1000, endedAt: Date.now(), results: [], score: 0, outcome: 'undone', usd: 0, checkpoint: safety } };
  saveGoal(db, g);
  return safety;
}

test('J4, guard (a round being checked whose reset a restart cut): paused then (as Pause during the checks did before 0.102.1), Resume before the first tick after the restart never tries the reset again', async () => {
  const J4 = 'claude:goal-j4-check';
  const w = await atRound2(J4);
  const safety = await cutUndo(J4, w, 'paused');
  remember(J4, (g) => (g._.pausedFrom = 'checking'));
  let tries = 0;
  setRestorer(async (wt, c) => {
    tries++;
    return restoreCheckpoint(wt, c);
  });
  try {
    await act(J4, { action: 'resume' });
  } finally {
    setRestorer(null);
  }
  assert.equal(tries, 0, 'never a second try');
  const g = goal(J4);
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, 'Putting round 2’s files back did not finish, so the files may be partly put back. Everything that was in the folder is saved: Keep anyway… on round 2 brings it back. Resume goes on from the files as they are.');
  assert.equal(g.rounds[2].outcome, 'stays');
  assert.equal(g.rounds[2].checkpoint, safety);
  assert.equal(file(w.path, 'score.txt'), '3\n', 'nothing put back');
  assert.equal(loadGoal(db, J4)!._.restoreTo, undefined);
  await act(J4, { action: 'stop' });
});

test('J4, guard (Edit from here and a reset a restart cut): with the mark there and no step at work, putting the files back from “Edit from here” is refused until the tick has dealt with it', async () => {
  const J4b = 'claude:goal-j4-edit';
  const w = await atRound2(J4b);
  await cutUndo(J4b, w, 'working');
  assert.equal(isDriving(J4b), false, 'no step at work');
  assert.equal(goalResetRefusal(db, J4b), 'This session’s goal is putting its files back: wait for it to finish');
  await tick(deps);
  assert.equal(goal(J4b).status, 'paused');
  assert.equal(goalResetRefusal(db, J4b), null);
  await act(J4b, { action: 'stop' });
});

test('J6: a fork whose turn ended while the round’s start was being saved worked during the round: the round is not undone over its work', async () => {
  const J6 = 'claude:goal-j6';
  const w = worktree();
  sessions.add(J6, { cwd: w.path, worktree: w });
  await agreed(J6, { checks: SLOW_SCORE, settings: { asks: 'own' } });
  sessions.add('claude:goal-j6-fork', { cwd: w.path, title: 'The fork' });
  const fork = sessions.all.get('claude:goal-j6-fork')!;
  // The fork's turn began during round 1, and ends while round 2's start checkpoint is being taken (after the files
  // were read for it: what it wrote is not in that checkpoint).
  let armed = false;
  setCheckpointer(async (wt) => {
    const c = await checkpoint(wt);
    if (armed && loadGoal(db, J6)?._.starting) {
      armed = false;
      await sleep(5);
      write(w.path, 'fork.txt', 'the fork’s work\n');
      fork.items.push({ kind: 'turn', id: 'j6t', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
      fork.endedAt = Date.now();
      await sleep(5);
    }
    return c;
  });
  try {
    await turn(J6, () => {
      fork.items.push({ kind: 'user', id: 'j6u', seq: 0, ts: Date.now(), text: 'Write the docs' } as TimelineItem);
      write(w.path, 'score.txt', '6\n');
      armed = true;
    });
  } finally {
    setCheckpointer(null);
  }
  assert.equal(armed, false, 'the fork ended during round 2’s start checkpoint');
  assert.equal(goal(J6).round, 2);
  await sleep(5);
  await turn(J6, () => write(w.path, 'score.txt', '3\n'));
  const g = goal(J6);
  assert.equal(g.rounds[2].outcome, 'stays');
  assert.match(g.rounds[2].why!, /It was not undone: another session \(“The fork”\) was working in the folder$/);
  assert.equal(file(w.path, 'fork.txt'), 'the fork’s work\n', 'not reset away');
  await act(J6, { action: 'stop' });
});

test('J7, K2: a say whose reset does not finish after an ask turn changed the files: the sentence names the saved checkpoint and the command that brings it back (the worktree’s top folder, the whole of it), not a round whose files differ', async () => {
  const J7 = 'claude:goal-j7';
  const w = worktree();
  sessions.add(J7, { cwd: w.path, worktree: w });
  await agreed(J7, { settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(J7, () => write(w.path, 'score.txt', '6\n'));
  assert.equal(goal(J7).best, 1);
  // The ask turn writes a plan as well: where the loop leaves the files is the end of that turn, not round 1's.
  await turn(J7, async () => {
    write(w.path, 'plan.txt', 'the plan\n');
    await tool(J7, 'goal_ask', { question: 'Which way?', ways: [{ name: 'Up' }, { name: 'Down' }], pick: 1 });
  });
  assert.equal(goal(J7).status, 'asking');
  setRestorer(resetsThenFails);
  try {
    await act(J7, { action: 'round', n: 1, do: 'undo' });
  } finally {
    setRestorer(null);
  }
  const g = goal(J7);
  assert.equal(g.status, 'paused');
  const m = /saved as checkpoint ([0-9a-f]{12}): git restore --source=\1 -- :\/ run in (\S+) \(the worktree’s top folder, or anywhere in it\) brings it back\./.exec(g.reason ?? '');
  assert.ok(m, g.reason);
  assert.equal(m![2], w.path, 'K2: the worktree’s top folder');
  assert.equal(g.reason, `Putting round 1’s files back did not finish, so the files may be partly put back. Everything that was in the folder is saved as checkpoint ${m![1]}: git restore --source=${m![1]} -- :/ run in ${w.path} (the worktree’s top folder, or anywhere in it) brings it back. Resume goes on from the files as they are.`);
  assert.doesNotMatch(g.reason!, /Keep anyway/);
  // The command does what it says, from a subfolder too (K2: :/ is the whole worktree): the folder as it was, the plan too.
  fs.rmSync(path.join(w.path, 'plan.txt'), { force: true });
  execFileSync('git', ['restore', `--source=${m![1]}`, '--', ':/'], { cwd: path.join(w.path, 'tests'), stdio: 'pipe' });
  assert.equal(file(w.path, 'score.txt'), '6\n');
  assert.equal(file(w.path, 'plan.txt'), 'the plan\n');
  await act(J7, { action: 'stop' });
});

/** A goal asking which way after round 1, the agent's work in it not committed: `work` is round 1's, then the ask turn. */
async function askingAfter(key: string, w: WorktreeInfo, o: { cwd?: string; checks?: unknown[] }, work: () => void) {
  sessions.add(key, { cwd: o.cwd ?? w.path, worktree: w });
  await agreed(key, { checks: o.checks, protect: ['docs/'], settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(key, work);
  assert.equal(goal(key).rounds[1].outcome, 'kept');
  await turn(key, async () => {
    await tool(key, 'goal_ask', { question: 'Which way?', ways: [{ name: 'Up' }, { name: 'Down' }], pick: 1 });
  });
  assert.equal(goal(key).status, 'asking');
}

/** The refusal of a say, its message. */
async function refusal(key: string, a: GoalAction) {
  try {
    await act(key, a);
  } catch (e) {
    assert.equal((e as HttpError).status, 409);
    return (e as HttpError).message;
  }
  assert.fail('not refused');
}

test('K1: a file both the goal and the person changed, the session in a subfolder of the worktree: the commands, run where the refusal says, keep the person’s change in a stash and put back the goal’s version; the say goes', async () => {
  const K1 = 'claude:goal-k1-both';
  const w = worktree();
  // The session works in tests/; the goal's work (not committed) is a second line in tests/a.test.sh.
  await askingAfter(K1, w, { cwd: path.join(w.path, 'tests'), checks: [{ kind: 'measure', label: 'Lines', run: 'wc -l < a.test.sh', target: { op: '>=', value: 10 } }] }, () =>
    fs.appendFileSync(path.join(w.path, 'tests', 'a.test.sh'), 'test -f score.txt\n'),
  );
  // The person edits the same file by hand.
  fs.appendFileSync(path.join(w.path, 'tests', 'a.test.sh'), 'echo by hand\n');
  const why = await refusal(K1, { action: 'round', n: 1, do: 'undo' });
  const at = loadGoal(db, K1)!._.filesAt!.slice(0, 12);
  assert.equal(why, `This file changed outside the goal since it last left the files: tests/a.test.sh. To put your change aside in a stash and put back the goal’s own version of that file, run these in ${w.path} (the worktree’s top folder: the paths are relative to it): git stash push --include-untracked -- tests/a.test.sh, then git restore --source=${at} --worktree -- tests/a.test.sh. Then try again.`);
  runAdvice(why);
  assert.equal(file(w.path, 'tests/a.test.sh'), 'test -f base.txt\ntest -f score.txt\n', 'the goal’s version');
  assert.match(git(w.path, 'stash', 'show', '-p', 'stash@{0}'), /^\+echo by hand$/m, 'the person’s change, kept in the stash');
  await act(K1, { action: 'round', n: 1, do: 'undo' });
  assert.equal(goal(K1).rounds[1].outcome, 'undone');
  assert.equal(file(w.path, 'tests/a.test.sh'), 'test -f base.txt\n', 'the say went through');
  git(w.path, 'stash', 'drop', '-q');
  await act(K1, { action: 'stop' });
});

test('K1: a file the goal added and the person deleted: the command brings the goal’s version back (nothing to stash); the say goes', async () => {
  const K1b = 'claude:goal-k1-deleted';
  const w = worktree();
  await askingAfter(K1b, w, { checks: SLOW_SCORE }, () => {
    write(w.path, 'score.txt', '6\n');
    write(w.path, 'plan.txt', 'the plan\n');
  });
  fs.rmSync(path.join(w.path, 'plan.txt'));
  const why = await refusal(K1b, { action: 'round', n: 1, do: 'undo' });
  const at = loadGoal(db, K1b)!._.filesAt!.slice(0, 12);
  assert.equal(why, `This file changed outside the goal since it last left the files: plan.txt. To put back the goal’s own version of that file, run this in ${w.path} (the worktree’s top folder: the paths are relative to it): git restore --source=${at} --worktree -- plan.txt. Then try again.`);
  runAdvice(why);
  assert.equal(file(w.path, 'plan.txt'), 'the plan\n');
  await act(K1b, { action: 'round', n: 1, do: 'undo' });
  assert.equal(goal(K1b).rounds[1].outcome, 'undone');
  assert.equal(file(w.path, 'plan.txt'), null);
  assert.equal(file(w.path, 'score.txt'), '2\n', 'the say went through');
  await act(K1b, { action: 'stop' });
});

test('K1: a tracked file the goal deleted and the person brought back with a change: stashed, then removed again; the say goes', async () => {
  const K1c = 'claude:goal-k1-back';
  const w = worktree();
  await askingAfter(K1c, w, { checks: SLOW_SCORE }, () => {
    write(w.path, 'score.txt', '6\n');
    fs.rmSync(path.join(w.path, 'base.txt'));
  });
  write(w.path, 'base.txt', 'back, by hand\n');
  const why = await refusal(K1c, { action: 'round', n: 1, do: 'undo' });
  assert.equal(why, `This file changed outside the goal since it last left the files: base.txt. To put your change aside in a stash and put back the goal’s own version of that file, run these in ${w.path} (the worktree’s top folder: the paths are relative to it): git stash push --include-untracked -- base.txt, then rm -f -- base.txt. Then try again.`);
  runAdvice(why);
  assert.equal(file(w.path, 'base.txt'), null);
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(K1c, { action: 'round', n: 1, do: 'undo' });
  assert.equal(file(w.path, 'base.txt'), 'base\n', 'the say went through');
  git(w.path, 'stash', 'drop', '-q');
  await act(K1c, { action: 'stop' });
});

test('K3: with a git older than 2.22, putting files back is refused before anything is touched (the version read once); 2.22 and newer put them back', async () => {
  const w = worktree();
  write(w.path, 'score.txt', '5\n');
  const c = (await checkpoint(w))!;
  write(w.path, 'score.txt', '8\n');
  write(w.path, 'later.txt', 'later\n');
  let reads = 0;
  setGitVersionReader(async () => (reads++, 'git version 2.17.1'));
  try {
    await assert.rejects(restoreCheckpoint(w, c), (e: unknown) => e instanceof HttpError && e.message === 'Putting files back needs git 2.22 or newer; this computer has 2.17.1');
    await assert.rejects(restoreCheckpoint(w, c), /needs git 2\.22 or newer/);
    assert.equal(reads, 1, 'read once');
    assert.equal(file(w.path, 'score.txt'), '8\n', 'nothing touched');
    assert.equal(file(w.path, 'later.txt'), 'later\n');
  } finally {
    setGitVersionReader(null);
  }
  for (const v of ['git version 2.22.0', 'git version 2.39.3 (Apple Git-146)', 'git version 3.0.1']) {
    setGitVersionReader(async () => v);
    try {
      write(w.path, 'later.txt', 'later\n');
      await restoreCheckpoint(w, c);
    } finally {
      setGitVersionReader(null);
    }
    assert.equal(file(w.path, 'later.txt'), null, v);
    assert.equal(file(w.path, 'score.txt'), '5\n', v);
  }
});

test('K3: with a git too old, the goal saves and touches nothing: an undone round stays, saying why, and the person’s say is refused with the same sentence', async () => {
  const K3 = 'claude:goal-k3';
  const w = await atRound2(K3);
  setGitVersionReader(async () => 'git version 2.17.1');
  try {
    await turn(K3, () => write(w.path, 'score.txt', '3\n'));
    const g = goal(K3);
    assert.equal(g.rounds[2].outcome, 'stays');
    assert.match(g.rounds[2].why!, /It was not undone: putting files back needs git 2\.22 or newer; this computer has 2\.17\.1$/);
    assert.equal(g.status, 'working', 'not paused: the goal goes on from the files as they are');
    assert.equal(loadGoal(db, K3)!._.restoreTo, undefined, 'no mark');
    assert.equal(file(w.path, 'score.txt'), '3\n');
    await stopAgent(K3);
    await rejects(act(K3, { action: 'round', n: 1, do: 'keep' }), 409, /^Putting files back needs git 2\.22 or newer; this computer has 2\.17\.1\.$/);
    assert.equal(file(w.path, 'score.txt'), '3\n');
  } finally {
    setGitVersionReader(null);
  }
  await act(K3, { action: 'stop' });
});

// ---- P1: Pause while a round runs pauses after that round ---------------------------------------------------------------

/** A worktree session whose goal runs round 1 (its message sent). */
async function round1(key: string, o: { checks?: unknown[]; limits?: Record<string, number>; settings?: Record<string, unknown> } = {}) {
  const w = worktree();
  sessions.add(key, { cwd: w.path, worktree: w });
  await agreed(key, { checks: o.checks, limits: o.limits, settings: o.settings ?? { asks: 'own' } });
  assert.deepEqual([goal(key).status, goal(key).round], ['working', 1]);
  return w;
}
const finalsAsked = () => asked.filter((a) => a.system.includes('You are the last check')).length;
/** Paused by the person, after the round: where nothing goes on and nothing waits to be checked. */
const pausedAfter = (key: string) => {
  const g = goal(key);
  assert.deepEqual([g.status, g.reason, g.pausing, g.round], ['paused', 'Paused by you.', undefined, undefined]);
};

test('P1: Pause while a round runs and the round is worse: it is undone, its files put back, then the goal pauses; Resume sends the next round', async () => {
  const PA = 'claude:goal-p1-worse';
  const w = await atRound2(PA);
  const n = sent(PA);
  await act(PA, { action: 'pause' });
  await turn(PA, () => write(w.path, 'score.txt', '3\n'));
  assert.equal(goal(PA).rounds[2].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '6\n', 'its files went back');
  pausedAfter(PA);
  assert.equal(sent(PA), n);
  await act(PA, { action: 'resume' });
  assert.deepEqual([goal(PA).status, goal(PA).round, headOf(PA)], ['working', 3, 'round 3 of 8']);
  assert.equal(sent(PA), n + 1);
  await act(PA, { action: 'stop' });
});

test('P1: Pause while a round runs and every check holds after it: paused, not reached, no final review asked; Resume: the final check, reached', async () => {
  const PB = 'claude:goal-p1-holds';
  const w = await round1(PB);
  reviewer.final = { ok: true, reason: 'The change meets the goal.' };
  await act(PB, { action: 'pause' });
  const f0 = finalsAsked();
  await turn(PB, () => {
    write(w.path, 'score.txt', '10\n');
    write(w.path, 'done.txt', 'done\n');
  });
  assert.equal(goal(PB).rounds[1].outcome, 'kept');
  pausedAfter(PB);
  assert.equal(finalsAsked(), f0, 'no final review asked');
  await act(PB, { action: 'resume' });
  assert.equal(goal(PB).status, 'reached');
  assert.equal(finalsAsked(), f0 + 1);
});

test('P1: Pause pressed while the final check runs: what it found is kept, the goal pauses instead of being reached; Resume: reached, without another review', async () => {
  const PL = 'claude:goal-p1-final';
  const w = await round1(PL);
  reviewer.final = { ok: true, reason: 'The change meets the goal.' };
  const f0 = finalsAsked();
  reviewerHook = async (system) => {
    if (!system.includes('You are the last check')) return;
    reviewerHook = undefined;
    await act(PL, { action: 'pause' });
    assert.deepEqual([goal(PL).status, goal(PL).pausing], ['checking', true]);
  };
  try {
    await turn(PL, () => {
      write(w.path, 'score.txt', '10\n');
      write(w.path, 'done.txt', 'done\n');
    });
  } finally {
    reviewerHook = undefined;
  }
  assert.equal(finalsAsked(), f0 + 1);
  pausedAfter(PL);
  await act(PL, { action: 'resume' });
  assert.equal(goal(PL).status, 'reached');
  assert.equal(finalsAsked(), f0 + 1, 'the files it judged are not reviewed again');
});

test('P1: Resume before the round has been checked takes the pause back: nothing else changes, and the round’s end goes on to the next round', async () => {
  const PC = 'claude:goal-p1-takeback';
  const w = await round1(PC);
  const n = sent(PC);
  await act(PC, { action: 'pause' });
  assert.equal(goal(PC).pausing, true);
  const back = await act(PC, { action: 'resume' });
  assert.equal(back!.pausing, undefined);
  assert.deepEqual([goal(PC).status, goal(PC).pausing, goal(PC).round], ['working', undefined, 1]);
  assert.equal(sent(PC), n);
  await turn(PC, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(PC).rounds[1].outcome, 'kept');
  assert.deepEqual([goal(PC).status, goal(PC).round], ['working', 2]);
  assert.equal(sent(PC), n + 1);
  await act(PC, { action: 'stop' });
});

test('P1: a say while the goal pauses after the round is refused with what to do', async () => {
  const PD = 'claude:goal-p1-say';
  await atRound2(PD);
  await act(PD, { action: 'pause' });
  await rejects(act(PD, { action: 'round', n: 1, do: 'keep' }), 409, /^The goal pauses once this round has been checked: give your say then\.$/);
  await act(PD, { action: 'stop' });
});

test('P1: Pause while a round runs, asked which way after every round: paused after the round, no ask turn sent; Resume sends it', async () => {
  const PE = 'claude:goal-p1-asks';
  const w = await round1(PE, { settings: { asks: 'every', noAnswerMin: 0 } });
  const n = sent(PE);
  await act(PE, { action: 'pause' });
  await turn(PE, () => write(w.path, 'score.txt', '5\n'));
  pausedAfter(PE);
  assert.ok(!loadGoal(db, PE)!._.askTurn);
  assert.equal(sent(PE), n);
  await act(PE, { action: 'resume' });
  assert.equal(loadGoal(db, PE)!._.askTurn, true);
  assert.equal(headOf(PE), 'which way next');
  assert.equal(sent(PE), n + 1);
  await act(PE, { action: 'stop' });
});

test('P1: the goal pauses after the round, and that round’s turn fails: paused with the failure’s reason, the pause after the round gone with it', async () => {
  const PF = 'claude:goal-p1-failed';
  await round1(PF);
  await act(PF, { action: 'pause' });
  await turn(PF, () => {}, { status: 'failed', error: 'API error 500' });
  const g = goal(PF);
  assert.deepEqual([g.status, g.reason, g.pausing, g.round], ['paused', 'The turn failed: API error 500', undefined, 1]);
  await act(PF, { action: 'stop' });
});

test('P1: a rounds limit met by the round the goal pauses after: paused first; Resume finds the limit', async () => {
  const PG = 'claude:goal-p1-limit';
  const w = await round1(PG, { limits: { rounds: 1 } });
  await act(PG, { action: 'pause' });
  await turn(PG, () => write(w.path, 'score.txt', '5\n'));
  pausedAfter(PG);
  await act(PG, { action: 'resume' });
  assert.equal(goal(PG).status, 'limit');
  assert.equal(goal(PG).reason, 'It ran its 1 round');
  await act(PG, { action: 'stop' });
});

test('P1: a money limit reached while the goal pauses after the round still stops that round midway; the pause goes', async () => {
  const PH = 'claude:goal-p1-money';
  const w = await round1(PH, { limits: { rounds: 8, usd: 1 } });
  await act(PH, { action: 'pause' });
  sessions.all.get(PH)!.live = 'working';
  write(w.path, 'half.txt', 'half done\n');
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', 2.5) on conflict(key) do update set cost_usd = excluded.cost_usd").run(PH, PH);
  await tick(deps);
  const g = goal(PH);
  assert.deepEqual([g.status, g.pausing], ['limit', undefined]);
  assert.equal(g.rounds.at(-1)!.why, 'Stopped at the limit midway');
  db.prepare('delete from sessions where key = ?').run(PH);
  await act(PH, { action: 'stop' });
});

test('P1: Pause pressed while the next round’s start is saved: paused before that round, nothing sent; Resume starts it', async () => {
  const PM = 'claude:goal-p1-starting';
  const w = await round1(PM);
  const n = sent(PM);
  let pressed = false;
  setCheckpointer(async (wt) => {
    const c = await checkpoint(wt);
    if (!pressed && loadGoal(db, PM)?._.starting) {
      pressed = true;
      await act(PM, { action: 'pause' });
      assert.deepEqual([goal(PM).status, goal(PM).pausing], ['checking', true]);
    }
    return c;
  });
  try {
    await turn(PM, () => write(w.path, 'score.txt', '5\n'));
  } finally {
    setCheckpointer(null);
  }
  assert.ok(pressed);
  pausedAfter(PM);
  assert.equal(sent(PM), n);
  assert.ok(loadGoal(db, PM)!._.starting, 'the round to start is kept');
  await act(PM, { action: 'resume' });
  assert.deepEqual([goal(PM).status, goal(PM).round], ['working', 2]);
  assert.equal(sent(PM), n + 1);
  await act(PM, { action: 'stop' });
});

test('P1: a goal stored as pausing and read again after a restart: the end of its round the loop never heard of still pauses it', async () => {
  const PI = 'claude:goal-p1-restart';
  const w = await round1(PI);
  await act(PI, { action: 'pause' });
  assert.equal(loadGoal(db, PI)!.pausing, true, 'kept with the goal');
  const n = sent(PI);
  // The round's turn ends as the app restarts: the loop never hears of it; the tick finds it.
  await turn(PI, () => write(w.path, 'score.txt', '5\n'), { tell: false });
  await tick(deps);
  assert.equal(goal(PI).rounds[1].outcome, 'kept');
  pausedAfter(PI);
  assert.equal(sent(PI), n);
  await act(PI, { action: 'stop' });
});

test('P1: a restart cut the turn of the round the goal pauses after: it pauses, saying so, instead of sending the round again (a turn with no end, a turn cut with its reason, a message that never went out)', async () => {
  // A turn begun and never ended (the tick's two quiet minutes).
  const PJ = 'claude:goal-p1-cut';
  await round1(PJ);
  await act(PJ, { action: 'pause' });
  const n = sent(PJ);
  await sleep(5);
  sessions.all.get(PJ)!.items.push({ kind: 'user', id: 'pj1', seq: 0, ts: Date.now(), text: 'round 1' } as TimelineItem);
  await tick(deps);
  await tick(deps, Date.now() + UNSENT_MS + 1000);
  let g = goal(PJ);
  assert.deepEqual([g.status, g.pausing, g.round], ['paused', undefined, 1]);
  assert.equal(g.reason, 'Paused by you. A restart of the app cut round 1’s turn short: Resume to check what it did.');
  assert.equal(sent(PJ), n, 'not sent again');
  await act(PJ, { action: 'stop' });
  // A turn cut with the restart's own reason (Custom's).
  const PK = 'claude:goal-p1-cut-reason';
  await round1(PK);
  await act(PK, { action: 'pause' });
  const k = sent(PK);
  await turn(PK, () => {}, { status: 'failed', error: `${CUT_BY_RESTART}.` });
  g = goal(PK);
  assert.deepEqual([g.status, g.pausing, g.round], ['paused', undefined, 1]);
  assert.equal(g.reason, 'Paused by you. A restart of the app cut round 1’s turn short: Resume to check what it did.');
  assert.equal(sent(PK), k, 'not sent again');
  await act(PK, { action: 'stop' });
  // The round's message never reached the agent (the app restarted as it was sent).
  const PN = 'claude:goal-p1-unsent';
  await round1(PN);
  await act(PN, { action: 'pause' });
  const u = sent(PN);
  await tick(deps, Date.now() + UNSENT_MS + 1000);
  g = goal(PN);
  assert.deepEqual([g.status, g.pausing], ['paused', undefined]);
  assert.equal(g.reason, 'Paused by you. Round 1’s message did not reach the agent (the app restarted as it was sent): Resume to go on.');
  assert.equal(sent(PN), u, 'not sent again');
  await act(PN, { action: 'stop' });
});

test('P1: a round that cannot be checked yet (the session worked while its checks ran) keeps the pause after it, and is checked later as before', async () => {
  const PR = 'claude:goal-p1-recheck';
  const w = await atRound2(PR);
  const f = sessions.all.get(PR)!;
  await act(PR, { action: 'pause' });
  checkingSoon();
  const t = whileChecking(() => f.items.push({ kind: 'user', id: 'pr1', seq: 0, ts: Date.now(), text: 'Also add a note' } as TimelineItem));
  await turn(PR, () => write(w.path, 'score.txt', '3\n'));
  await t;
  assert.deepEqual([goal(PR).status, goal(PR).pausing, goal(PR).round], ['working', true, 2], 'to be checked again, still to pause after it');
  await turn(PR);
  assert.equal(goal(PR).rounds[2].outcome, 'undone');
  pausedAfter(PR);
  await act(PR, { action: 'stop' });
});

test('P1: paused while the person’s say put the files back (a question open): the say is done and the goal stays paused, nothing sent', async () => {
  const PO = 'claude:goal-p1-say-paused';
  const w = worktree();
  sessions.add(PO, { cwd: w.path, worktree: w });
  await agreed(PO, { settings: { asks: 'every', noAnswerMin: 0 } });
  await turn(PO, () => write(w.path, 'score.txt', '6\n'));
  await turn(PO, async () => {
    await tool(PO, 'goal_ask', { question: 'Which way?', ways: [{ name: 'Up' }, { name: 'Down' }], pick: 1 });
  });
  assert.equal(goal(PO).status, 'asking');
  const n = sent(PO);
  setRestorer(async (wt, c) => {
    await act(PO, { action: 'pause' });
    return restoreCheckpoint(wt, c);
  });
  try {
    await act(PO, { action: 'round', n: 1, do: 'undo' });
  } finally {
    setRestorer(null);
  }
  assert.equal(goal(PO).rounds[1].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '2\n');
  assert.equal(goal(PO).status, 'paused');
  assert.equal(sent(PO), n, 'no round started');
  await act(PO, { action: 'stop' });
});

// ---- P3: a changed target keeps the check's values ---------------------------------------------------------------------

/** How many times a check that notes each run in `log` ran. */
const runsIn = (log: string) => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0);

test('P3: a check changed only in its target keeps its values: judged again in the start and the best round, nothing runs, no since; through a change at once and once the round that runs is over; a changed command is measured again', async () => {
  const P3 = 'claude:goal-p3';
  const w = worktree();
  sessions.add(P3, { cwd: w.path, worktree: w });
  const log = path.join(tmp, 'p3-runs.log');
  const checks = [
    { kind: 'measure', label: 'Score', run: `echo x >> ${log}; cat score.txt`, target: { op: '>=', value: 10 } },
    { kind: 'command', label: 'Done file exists', run: 'test -f done.txt' },
  ];
  await agreed(P3, { checks, settings: { asks: 'own' } });
  // Round 1 raises the score to 6; the goal pauses after it, between rounds.
  await act(P3, { action: 'pause' });
  await turn(P3, () => write(w.path, 'score.txt', '6\n'));
  let g = goal(P3);
  assert.deepEqual([g.status, g.best, g.round], ['paused', 1, undefined]);
  const score = (r: number) => goal(P3).rounds[r].results.find((x) => x.id === 'c1')!;
  assert.deepEqual([score(0).value, score(0).holds, score(1).value, score(1).holds], [2, false, 6, false]);
  // At once: 5 is enough now, and its name, slack, unit and time limit change too. Nothing runs.
  let n = runsIn(log);
  const to = (target: { op: '>=' | '<='; value: number }, more: Record<string, unknown> = {}) => goal(P3).contract.checks.map((c) => (c.id === 'c1' ? { ...c, target, ...more } : c));
  await act(P3, { action: 'change', contract: { checks: to({ op: '>=', value: 5 }, { label: 'Score (5 is enough)', slack: 0.2, unit: 'pts', timeoutS: 60 }) } });
  g = goal(P3);
  assert.equal(runsIn(log), n, 'nothing ran');
  assert.equal(g.status, 'paused', 'not measuring');
  assert.equal(loadGoal(db, P3)!._.remeasure, undefined);
  assert.deepEqual([score(0).value, score(0).holds, score(0).since, score(0).closeness], [2, false, undefined, 0], 'the start keeps its value: judged again, still short of 5');
  assert.deepEqual([score(1).value, score(1).holds, score(1).closeness], [6, true, 1], 'the best round: 6 meets 5 now');
  assert.equal(g.rounds[1].score, 0.5, 'scored again: one of two checks holds');
  assert.deepEqual(standing(g).map((r) => [r.id, r.holds]), [['c1', true], ['c2', false]]);
  // Through a change while a round runs: it counts once that round is over, and still nothing is measured again.
  await act(P3, { action: 'resume' });
  assert.deepEqual([goal(P3).status, goal(P3).round], ['working', 2]);
  await act(P3, { action: 'change', contract: { checks: to({ op: '>=', value: 7 }) } });
  assert.equal(goal(P3).pending?.checks?.find((c) => c.id === 'c1')!.target!.value, 7);
  assert.equal(goal(P3).contract.checks.find((c) => c.id === 'c1')!.target!.value, 5, 'round 2 is judged by the checks it started with');
  n = runsIn(log);
  await turn(P3, () => write(w.path, 'score.txt', '6\n'));
  g = goal(P3);
  assert.equal(runsIn(log), n + 1, 'only round 2’s own checks ran');
  assert.deepEqual([g.status, g.round], ['working', 3], 'not measured first');
  assert.equal(g.contract.checks.find((c) => c.id === 'c1')!.target!.value, 7);
  assert.deepEqual([score(0).value, score(0).holds, score(0).since], [2, false, undefined]);
  assert.deepEqual([score(1).value, score(1).holds], [6, false], 'judged again against 7');
  assert.ok(score(1).closeness > 0 && score(1).closeness < 1);
  // A changed command measures something else: measured again before the next round, its start value from then (since).
  await act(P3, { action: 'pause' });
  await turn(P3);
  assert.equal(goal(P3).status, 'paused');
  n = runsIn(log);
  await act(P3, { action: 'change', contract: { checks: goal(P3).contract.checks.map((c) => (c.id === 'c1' ? { ...c, run: `echo y >> ${log}; cat score.txt` } : c)) } });
  assert.deepEqual(loadGoal(db, P3)!._.remeasure, ['c1']);
  await act(P3, { action: 'resume' });
  await until('measured', () => goal(P3).status !== 'measuring');
  assert.equal(runsIn(log), n + 1, 'measured again');
  assert.equal(score(0).since, 3);
  assert.equal(score(0).value, 6);
  await act(P3, { action: 'stop' });
});

test('P3: at the agreement, a check changed only in its target keeps the value measured when it was proposed: judged again, nothing runs, round 1 goes', async () => {
  const P3a = 'claude:goal-p3-agree';
  const w = worktree();
  // Its agent runs commands unasked: the proposal is measured at once, before the agreement.
  sessions.add(P3a, { cwd: w.path, worktree: w, mode: 'bypassPermissions' });
  const log = path.join(tmp, 'p3a-runs.log');
  const checks = [
    { kind: 'measure', label: 'Score', run: `echo x >> ${log}; cat score.txt`, target: { op: '>=', value: 10 } },
    { kind: 'command', label: 'Done file exists', run: 'test -f done.txt' },
  ];
  await act(P3a, { action: 'set', objective: 'Score reaches 10 and done.txt exists', settings: { asks: 'own' } });
  await turn(P3a, async () => {
    assert.equal((await tool(P3a, 'goal_propose', { checks, protect: ['docs/'], limits: { rounds: 8 } })).isError, false);
  });
  await until('agreeing', () => goal(P3a).status === 'agreeing');
  const c1 = () => goal(P3a).rounds[0].results.find((x) => x.id === 'c1')!;
  assert.deepEqual([c1().value, c1().holds], [2, false]);
  const n = runsIn(log);
  await act(P3a, { action: 'agree', contract: { checks: goal(P3a).contract.checks.map((c) => (c.id === 'c1' ? { ...c, target: { op: '>=', value: 2 } } : c)) } });
  assert.equal(runsIn(log), n, 'nothing ran');
  assert.deepEqual([goal(P3a).status, goal(P3a).round], ['working', 1], 'not measured first');
  assert.deepEqual([c1().value, c1().holds, c1().closeness, c1().since], [2, true, 1, undefined]);
  await act(P3a, { action: 'stop' });
});

test('P3: a changed check the start holds no value of (it could not run there) is measured again, even when only its time limit changed', async () => {
  const P3b = 'claude:goal-p3-novalue';
  const w = worktree();
  sessions.add(P3b, { cwd: w.path, worktree: w, mode: 'bypassPermissions' });
  const checks = [
    { kind: 'measure', label: 'Speed', run: 'cat speed.txt', target: { op: '>=', value: 10 } },
    { kind: 'command', label: 'Done file exists', run: 'test -f done.txt' },
  ];
  await act(P3b, { action: 'set', objective: 'Speed reaches 10 and done.txt exists', settings: { asks: 'own' } });
  await turn(P3b, async () => {
    assert.equal((await tool(P3b, 'goal_propose', { checks, protect: ['docs/'], limits: { rounds: 8 } })).isError, false);
  });
  await until('agreeing', () => goal(P3b).status === 'agreeing');
  const c1 = () => goal(P3b).rounds[0].results.find((x) => x.id === 'c1')!;
  assert.ok(c1().error, 'it could not run at the start');
  // What a longer time limit would have let it read.
  write(w.path, 'speed.txt', '4\n');
  await act(P3b, { action: 'agree', contract: { checks: goal(P3b).contract.checks.map((c) => (c.id === 'c1' ? { ...c, timeoutS: 120 } : c)) } });
  await until('measured', () => goal(P3b).status !== 'measuring');
  assert.deepEqual([c1().value, c1().error], [4, undefined], 'measured again');
  assert.deepEqual([goal(P3b).status, goal(P3b).round], ['working', 1]);
  await act(P3b, { action: 'stop' });
});

// ---- swarm rounds: a goal for a session that leads a swarm (S1 to S8) ---------------------------------------------------

/** A repository of its own, its main checkout (no worktree): where a goal cannot undo a round. */
function plainRepo(name: string): { path: string } {
  const dir = path.join(tmp, name.replace(/\W+/g, '-'));
  fs.mkdirSync(path.join(dir, 'tests'), { recursive: true });
  write(dir, 'score.txt', '2\n');
  write(dir, 'base.txt', 'base\n');
  write(dir, 'tests/a.test.sh', 'test -f base.txt\n');
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'start');
  return { path: dir };
}

/** A session that leads a swarm, its members in its folder (a worktree, or with `plain` a repository's own checkout); its goal agreed, round 1 sent. */
async function swarmGoal(key: string, titles: string[], o: { checks?: unknown[]; limits?: Record<string, number>; settings?: Record<string, unknown>; plain?: boolean } = {}) {
  const wt = o.plain ? undefined : worktree();
  const w = wt ?? plainRepo(key);
  sessions.add(key, { cwd: w.path, ...(wt ? { worktree: wt } : {}), title: 'The lead' });
  setSessionExtra(db, key, { swarm: true });
  const crew = titles.map((title, i) => {
    const k = `${key}-m${i + 1}`;
    sessions.add(k, { cwd: w.path, title });
    setSessionExtra(db, k, { parent: key });
    return k;
  });
  await agreed(key, { checks: o.checks ?? SLOW_SCORE, limits: o.limits, settings: o.settings ?? { asks: 'own' } });
  assert.deepEqual([goal(key).status, goal(key).round, goal(key).undo, goal(key).rounds.map((r) => r.outcome)], ['working', 1, !o.plain, ['start']]);
  return { w, crew };
}

/**
 * A member's turn: it works in the lead's folder and its turn ends; then its report is written as the app writes it
 * (children's reportTurn: marked reported, and sent to the lead unless it was stopped), unless `report` is false. The id
 * of the message that began the turn.
 */
async function memberTurn(k: string, work: () => void = () => {}, o: { report?: boolean; status?: 'completed' | 'interrupted'; reply?: string } = {}) {
  const f = sessions.all.get(k)!;
  const startedAt = Date.now();
  const id = `mu${++sessions.n}`;
  f.live = 'working';
  f.items.push({ kind: 'user', id, seq: 0, ts: startedAt, text: 'Your angle' } as TimelineItem);
  work();
  await sleep(2);
  f.live = 'idle';
  const endedAt = Date.now();
  f.items.push({ kind: 'assistant', id: `ma${sessions.n}`, seq: 0, ts: endedAt, text: o.reply ?? 'Done: the score is up.' } as TimelineItem);
  f.items.push({ kind: 'turn', id: `mt${sessions.n}`, seq: 0, ts: endedAt, status: o.status ?? 'completed' } as TimelineItem);
  f.endedAt = endedAt;
  await sleep(2);
  if (o.report !== false) await reportTurn(deps, { key: k, startedAt, endedAt, external: false });
  return id;
}

const toLead = (key: string) => sessions.delivered.filter((m) => m.key === key);

const swGate = async (plain: boolean) => {
  const G = `claude:goal-sw-gate${plain ? '-plain' : ''}`;
  const { w, crew } = await swarmGoal(G, ['Speed', 'Cache'], { plain });
  const [m1] = crew;
  // The lead puts a member to work and ends its turn, waiting for it.
  sessions.all.get(m1)!.live = 'working';
  await turn(G);
  assert.deepEqual([goal(G).status, goal(G).rounds.length], ['working', 1], 'not checked while a member works');
  await tick(deps);
  assert.equal(goal(G).rounds.length, 1);
  // Its turn ends (it raised the score in the lead's folder); its report is not out yet.
  const id = await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'), { report: false });
  await tick(deps);
  assert.equal(goal(G).rounds.length, 1, 'its report is on its way');
  // As after a restart: its turn ended more than ten minutes ago, and the catch-up is writing its report now.
  const ended = sessions.all.get(m1)!.endedAt;
  sessions.all.get(m1)!.endedAt = Date.now() - 11 * 60_000;
  reportBegins(m1);
  try {
    await tick(deps);
    assert.equal(goal(G).rounds.length, 1, 'its report is still being written');
  } finally {
    reportEnds(m1);
  }
  sessions.all.get(m1)!.endedAt = ended;
  setSessionExtra(db, m1, { reported: id });
  // The app's own report of a turn says it is on its way while it is written.
  const m2 = crew[1];
  let during = false;
  sessions.timelineHook = (k) => {
    if (k === m2) during = reportOnItsWay(m2);
  };
  try {
    await memberTurn(m2, () => {}, { reply: 'Looked at the cache: nothing to gain.' });
  } finally {
    sessions.timelineHook = undefined;
  }
  assert.equal(during, true, 'on its way while it was written');
  assert.equal(reportOnItsWay(m2), false);
  // The reports reach the lead, whose turn ends: the round is checked.
  await turn(G);
  const g = goal(G);
  assert.equal(g.rounds[1].outcome, 'kept');
  assert.equal(g.rounds[1].members, 2, 'both its members worked in the round');
  assert.equal(g.round, 2);
  await act(G, { action: 'stop' });
};
test('S2.1, the gate: a swarm’s round is not over while a member works or its report is on its way (also while the report is still being written); then the lead’s turn ends and the round is checked, with how many members worked', () => swGate(false));
test('S2.1, the gate: a swarm’s round is not over while a member works or its report is on its way (also while the report is still being written); then the lead’s turn ends and the round is checked, with how many members worked (S1, third review: a lead without a worktree)', () => swGate(true));

const swBoard = async (plain: boolean) => {
  const B = `claude:goal-sw-board${plain ? '-plain' : ''}`;
  const { w, crew } = await swarmGoal(B, ['Speed'], { plain });
  const [m1] = crew;
  // As its last act the member posts its progress (its batch would wait five minutes), then its turn ends and its report goes to the lead.
  addPost(db, { swarm: B, from: m1, kind: 'progress', text: 'Score is 6 now; the cache comes next.' });
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  const n = toLead(B).length;
  await turn(B);
  assert.deepEqual([goal(B).status, goal(B).rounds.length], ['working', 1], 'not checked while the board has news for the lead');
  assert.equal(toLead(B).length, n + 1);
  assert.match(toLead(B).at(-1)!.text, /^\[Swarm board · 1 new post\]\n- “Speed” .* · progress: Score is 6 now/);
  // The lead reads it and ends its turn: nothing new, the round is checked; the batch went once.
  await turn(B);
  assert.equal(goal(B).rounds[1].outcome, 'kept');
  assert.equal(toLead(B).filter((m) => m.text.startsWith('[Swarm board')).length, 1);
  assert.equal(postsOf(db, B, { limit: 5 }).length, 1);
  await act(B, { action: 'stop' });
};
test('S2.1, the board: posts the lead has not had go to it once the team is quiet, once (not after five minutes); its next turn ends with nothing new: checked; and the tick does the same', () => swBoard(false));
test('S2.1, the board: posts the lead has not had go to it once the team is quiet, once (not after five minutes); its next turn ends with nothing new: checked; and the tick does the same (S1, third review: a lead without a worktree)', () => swBoard(true));

test('S2.1, the board through the tick: a round to be checked again (a member worked during its checks), the member then stopped with a post as its last act: the tick delivers the board once, and checks the round at its next look', async () => {
  const B2 = 'claude:goal-sw-board-tick';
  const { w, crew } = await swarmGoal(B2, ['Speed']);
  const [m1] = crew;
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  await turn(B2);
  assert.equal(goal(B2).rounds[1].outcome, 'kept');
  // Round 2 is worse, and the member begins a turn while its checks run: not undone, to be checked again.
  await memberTurn(m1, () => write(w.path, 'score.txt', '3\n'));
  checkingSoon();
  const t = whileChecking(() => {
    sessions.all.get(m1)!.items.push({ kind: 'user', id: 'swb-late', seq: 0, ts: Date.now(), text: 'One more thing' } as TimelineItem);
  });
  await turn(B2);
  await t;
  assert.deepEqual([goal(B2).status, goal(B2).rounds.length], ['working', 2]);
  // The lead stops it; as its last act it posted; a stopped member's turn is reported to nobody.
  addPost(db, { swarm: B2, from: m1, kind: 'progress', text: 'Halfway.' });
  setSessionExtra(db, m1, { swarmStopped: Date.now() });
  const mf = sessions.all.get(m1)!;
  mf.items.push({ kind: 'turn', id: 'swb-late-t', seq: 0, ts: Date.now(), status: 'interrupted' } as TimelineItem);
  mf.endedAt = Date.now();
  await sleep(3);
  const n = toLead(B2).length;
  await reportTurn(deps, { key: m1, startedAt: mf.endedAt - 1, endedAt: mf.endedAt, external: false });
  assert.equal(toLead(B2).length, n, 'no report of a stopped member');
  const boards = () => toLead(B2).filter((m) => m.text.startsWith('[Swarm board')).length;
  await tick(deps);
  assert.equal(goal(B2).rounds.length, 2, 'not checked: the board went to the lead first');
  assert.equal(toLead(B2).length, n + 1);
  assert.equal(boards(), 1, 'the board, once');
  // (Here the lead's turn on it ended at once.) Nothing new: checked, and no second delivery.
  await tick(deps);
  assert.equal(goal(B2).rounds[2].outcome, 'undone');
  assert.equal(boards(), 1);
  await act(B2, { action: 'stop' });
});

test('S2.1, M5: a member stopped with swarm_stop stays in its turn until its program ends it (an interrupt does not stop it at once): the round waits, its cut turn is reported to nobody, then the round is checked; a subagent whose process is being stopped (SessionManager.stop: stopping) holds a round too, without a swarm as well', async () => {
  const S = 'claude:goal-sw-stopping';
  const { w, crew } = await swarmGoal(S, ['Speed']);
  const [m1] = crew;
  write(w.path, 'score.txt', '6\n');
  sessions.all.get(m1)!.live = 'working';
  await turn(S);
  assert.equal(goal(S).rounds.length, 1, 'not checked while a member works');
  // The lead stops it (swarm_stop): marked, and interrupted; its program ends the turn a moment later.
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => (k === m1 ? void sessions.interrupted.push(k) : interrupt(k));
  try {
    await stopMember(deps, m1);
  } finally {
    sessions.interrupt = interrupt;
  }
  assert.ok(sessions.interrupted.includes(m1));
  await tick(deps);
  assert.equal(goal(S).rounds.length, 1, 'still in its turn');
  const n = toLead(S).length;
  await memberTurn(m1, () => {}, { status: 'interrupted' });
  assert.equal(toLead(S).length, n, 'a stopped member’s cut turn is reported to nobody');
  await tick(deps);
  assert.equal(goal(S).rounds[1].outcome, 'kept');
  await act(S, { action: 'stop' });
  // A session without a swarm whose subagent's process is being stopped.
  const P = 'claude:goal-m5-stopping';
  const w2 = worktree();
  sessions.add(P, { cwd: w2.path, worktree: w2 });
  await agreed(P, { settings: { asks: 'own' } });
  const kid = 'claude:goal-m5-stopping-kid';
  sessions.add(kid, { cwd: w2.path, title: 'Helper', live: 'stopping' });
  setSessionExtra(db, kid, { parent: P });
  await sleep(5);
  await turn(P, () => write(w2.path, 'score.txt', '5\n'));
  assert.equal(goal(P).rounds.length, 1, 'not checked while its subagent is being stopped');
  sessions.all.get(kid)!.live = 'idle';
  await tick(deps);
  assert.equal(goal(P).rounds[1].outcome, 'kept');
  await act(P, { action: 'stop' });
});

test('S3: an undone round takes the members’ changes with it (the files go back); a member at work while the checks run holds the undo, as the session’s own subagent does', async () => {
  const U = 'claude:goal-sw-undo';
  const { w, crew } = await swarmGoal(U, ['Speed']);
  const [m1] = crew;
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  await turn(U);
  assert.equal(goal(U).rounds[1].outcome, 'kept');
  // Round 2: the member makes it worse and leaves a file of its own.
  await memberTurn(m1, () => {
    write(w.path, 'score.txt', '3\n');
    write(w.path, 'member.txt', 'mine\n');
  });
  await turn(U);
  let g = goal(U);
  assert.equal(g.rounds[2].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  assert.equal(file(w.path, 'member.txt'), null, 'the member’s change went with the round');
  // Round 3's message says so.
  assert.match(last(U), /Last round was undone: what your members changed in it is gone from this folder; say so to those you put to work again\. Members from earlier rounds are still there/);
  // Round 3: worse again, and the member begins a turn while the checks run: not put back, checked again later.
  await memberTurn(m1, () => write(w.path, 'score.txt', '2\n'));
  checkingSoon();
  const t = whileChecking(() => {
    sessions.all.get(m1)!.items.push({ kind: 'user', id: 'swu-late', seq: 0, ts: Date.now(), text: 'One more thing' } as TimelineItem);
  });
  await turn(U);
  await t;
  g = goal(U);
  assert.deepEqual([g.status, g.rounds.length, g.round], ['working', 3, 3], 'not undone while a member worked during the checks');
  assert.equal(file(w.path, 'score.txt'), '2\n');
  sessions.all.get(m1)!.items.push({ kind: 'turn', id: 'swu-late-t', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
  sessions.all.get(m1)!.endedAt = Date.now();
  await sleep(5);
  setSessionExtra(db, m1, { reported: 'swu-late' });
  await turn(U);
  assert.equal(goal(U).rounds[3].outcome, 'undone');
  assert.equal(file(w.path, 'score.txt'), '6\n');
  await act(U, { action: 'stop' });
});

test('S2.3: a swarm lead’s round message names its members (how each stands, the first line of its last report or post) in place of the usual closing paragraph; a plain session’s keeps that paragraph', async () => {
  const M = 'claude:goal-sw-message';
  const { crew } = await swarmGoal(M, ['Speed', 'Cache', 'Docs', 'Waits']);
  const [m1, m2, m3, m4] = crew;
  const first = last(M);
  assert.match(first, /You lead a swarm in this goal\. Put your members on what does not hold yet: one angle or one check each/);
  assert.match(first, /Your members now:\n- “Speed” \(not started a turn yet\)\n- “Cache” \(not started a turn yet\)/);
  assert.match(first, /Call goal_report \(what the swarm did, what remains\) once your members have reported, not when you start them\. The round is over when every member’s turn and yours have ended: then the app runs the checks on this folder\. Do not conclude, and do not stop members because you think it is solved: you cannot end the goal, only the checks do\.\n\n\(This message is from the app’s goal loop/);
  assert.doesNotMatch(first, /The app runs the checks itself when your turn ends/);
  // How each stands now: at work, waiting for the lead (its report, or a later post), stopped.
  await memberTurn(m2, () => {}, { reply: 'Cache added for the search results.\nMore below.' });
  await memberTurn(m3, () => {}, { reply: 'Docs updated.' });
  await sleep(3);
  addPost(db, { swarm: M, from: m3, kind: 'finding', text: 'The docs build is slow\nbecause of images.' });
  await memberTurn(m4, () => {});
  setSessionExtra(db, m4, { swarmStopped: Date.now() });
  sessions.all.get(m1)!.live = 'working';
  const now = await swarmMembers(deps, M);
  assert.deepEqual(
    now.map((x) => [x.title, x.state, x.last]),
    [
      ['Speed', 'working', undefined],
      ['Cache', 'waiting for you', 'Cache added for the search results.'],
      ['Docs', 'waiting for you', 'The docs build is slow'],
      ['Waits', 'stopped', 'Done: the score is up.'],
    ],
  );
  // A plain session's round message: the usual closing paragraph, nothing of a swarm.
  const P = 'claude:goal-sw-plain';
  const w2 = worktree();
  sessions.add(P, { cwd: w2.path, worktree: w2 });
  await agreed(P, { settings: { asks: 'own' } });
  assert.match(last(P), /The app runs the checks itself when your turn ends\. You cannot end the goal, and saying it is done changes nothing\. Work on what does not hold yet, check your work as you go, then call goal_report \(what you did, what remains\) and end your turn\./);
  assert.doesNotMatch(last(P), /swarm|members/);
  await act(P, { action: 'stop' });
  await act(M, { action: 'stop' });
});

test('S4.2, M3, M1: a money limit in the middle of a swarm’s round stops every member at work in any sense (in a turn, with a background task, waiting to carry on after a usage limit, one that appears while it stops), as Stop all stops one; the half round waits for them and names one still at work; one that finishes later wakes nobody', async () => {
  const L = 'claude:goal-sw-limit';
  const { w, crew } = await swarmGoal(L, ['Speed', 'Cache', 'Idle', 'Server', 'Resumes'], { limits: { rounds: 8, usd: 1 } });
  const [m1, m2, m3, m4, m5] = crew;
  const m6 = `${L}-m6`;
  sessions.all.get(L)!.live = 'working';
  sessions.all.get(m1)!.live = 'working';
  // m2's turn began before the limit.
  const m2began = Date.now();
  sessions.all.get(m2)!.live = 'working';
  sessions.all.get(m2)!.items.push({ kind: 'user', id: 'm2-angle', seq: 0, ts: m2began, text: 'Your angle' } as TimelineItem);
  await sleep(3);
  sessions.all.get(m4)!.tasks = [{ id: 'srv', description: 'npm run dev', kind: 'local_bash', status: 'running' }];
  sessions.all.get(m5)!.resumeAt = Date.now() + 3600_000;
  const cancelled: string[] = [];
  const onCancel = (k: string) => {
    cancelled.push(k);
    if (sessions.all.get(k)) sessions.all.get(k)!.resumeAt = undefined;
  };
  sessions.on('resumeCancelled', onCancel);
  write(w.path, 'half.txt', 'half done\n');
  // m1 writes once more as it stops, a moment after it is told to, while m6 is being started (a start_child_session in
  // flight); m2 does not stop at all (its program is slow to answer).
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => {
    if (k === m2) return void sessions.interrupted.push(k);
    if (k === m1) {
      sessions.interrupted.push(k);
      setTimeout(() => {
        write(w.path, 'last.txt', 'its last write\n');
        sessions.all.get(m1)!.live = 'idle';
        sessions.add(m6, { cwd: w.path, title: 'Late', live: 'starting' });
        setSessionExtra(db, m6, { parent: L });
      }, 40);
      return;
    }
    return interrupt(k);
  };
  setLimitWaitStep(5);
  const n = toLead(L).length;
  spend(L, 2.5);
  try {
    await tick(deps);
  } finally {
    sessions.interrupt = interrupt;
    sessions.off('resumeCancelled', onCancel);
    setLimitWaitStep(null);
  }
  const g = goal(L);
  assert.equal(g.status, 'limit');
  assert.deepEqual(sessions.stoppedAll.filter((k) => k.startsWith(L)).sort(), [m1, m2, m4, m5, m6].sort(), 'every member at work in any sense, the one that appeared meanwhile too; not the idle one');
  assert.ok(cancelled.includes(m5), 'its resume after the usage limit is cancelled');
  assert.equal(sessions.all.get(m4)!.tasks![0].status, 'stopped', 'its background task stopped');
  for (const k of [m1, m2, m4, m5, m6]) {
    assert.ok(sessionExtra(db, k).stoppedWithParent, 'stopped with its lead: its cut turn is reported to nobody');
    assert.ok(sessionExtra(db, k).swarmStopped, 'and messages no longer wake it');
  }
  assert.equal(sessionExtra(db, m3).stoppedWithParent, undefined);
  assert.ok(sessionExtra(db, L).stoppedAll, 'the lead marked as Stop all marks it');
  assert.equal(loadGoal(db, L)!._.teamStop, undefined, 'the stop is done');
  const half = g.rounds.at(-1)!;
  assert.deepEqual([half.n, half.why], [1, 'Stopped at the limit midway']);
  assert.equal(inCheckpoint(w.path, half.checkpoint!, 'half.txt'), 'half done\n');
  assert.equal(inCheckpoint(w.path, half.checkpoint!, 'last.txt'), 'its last write\n', 'taken once the member that could stop had stopped');
  assert.match(g.report!.summary, /The swarm’s member “Cache” was still at work when round 1’s files were saved: what it writes after that is in the folder but not in the round\.$/);
  // m2 finishes after all, posting as its last act (in the turn it began before the limit): its cut turn is reported to
  // nobody, and the board's batch waits in the lead's held queue instead of waking it. (Both the goal waiting at its
  // limit and the limit's stop mark on the lead hold it here; each alone is tested in "M1, R1" and "R8: after a limit".)
  addPost(db, { swarm: L, from: m2, kind: 'finding', text: 'The cache halves it.' });
  const m2f = sessions.all.get(m2)!;
  m2f.live = 'idle';
  m2f.items.push({ kind: 'turn', id: 'm2-end', seq: 0, ts: Date.now(), status: 'interrupted' } as TimelineItem);
  m2f.endedAt = Date.now();
  await sleep(2);
  await reportTurn(deps, { key: m2, startedAt: m2began, endedAt: m2f.endedAt, external: false });
  await tellLead(deps, L);
  assert.equal(toLead(L).length, n, 'nothing woke the lead');
  assert.deepEqual(sessions.queued.filter((q) => q.key === L).map((q) => [q.text.split('\n')[0], q.held]), [['[Swarm board · 1 new post]', true]]);
  // Given more: what was held goes to the lead first, and the goal goes on.
  await act(L, { action: 'change', contract: { limits: { rounds: 8, usd: 10 } } });
  assert.ok(sessions.resumed.includes(L), 'Give it more sent what was held');
  assert.match(toLead(L)[n].text, /^\[Swarm board · 1 new post\]/);
  // A member the person sets going again after the stop: its news is not held (as a report of work begun after a stop).
  const m3f = sessions.all.get(m3)!;
  m3f.items.push({ kind: 'user', id: 'm3-later', seq: 0, ts: Date.now(), text: 'Look at the index' } as TimelineItem);
  await sleep(2);
  addPost(db, { swarm: L, from: m3, kind: 'finding', text: 'The index helps.' });
  sessions.all.get(L)!.live = 'idle';
  const k = toLead(L).length;
  await tellLead(deps, L);
  assert.equal(toLead(L).length, k + 1);
  db.prepare('delete from sessions where key = ?').run(L);
  await act(L, { action: 'stop' });
});

test('M1, R1: a goal that is over holds its subagents’ news only at its limit (the status alone deciding here: no stop mark on the lead); a goal the person stopped, or one reached, holds nothing, as before', async () => {
  for (const [status, held] of [
    ['limit', true],
    ['stopped', false],
    ['reached', false],
  ] as const) {
    const B = `claude:goal-r1-${status}`;
    const w = worktree();
    sessions.add(B, { cwd: w.path, worktree: w });
    await agreed(B, { settings: { asks: 'own' } });
    const kid = `${B}-kid`;
    sessions.add(kid, { cwd: w.path, title: 'Helper' });
    setSessionExtra(db, kid, { parent: B });
    const n = toLead(B).length;
    const q = sessions.queued.filter((x) => x.key === B && x.held).length;
    // Its turn began before the goal ended, and ends after.
    await memberTurn(kid, () =>
      remember(B, (x) => {
        x.status = status;
        x.endedAt = Date.now();
      }),
    );
    assert.equal(sessionExtra(db, B).stoppedAll, undefined);
    if (held) {
      assert.equal(toLead(B).length, n, `${status}: nothing woke the lead`);
      assert.equal(sessions.queued.filter((x) => x.key === B && x.held).length, q + 1, `${status}: held`);
    } else {
      assert.equal(toLead(B).length, n + 1, `${status}: delivered`);
      assert.equal(sessions.queued.filter((x) => x.key === B && x.held).length, q, `${status}: nothing held`);
    }
    await act(B, { action: 'stop' });
  }
});

test('R8: after a limit the person stops the goal: the limit’s stop mark on the lead (as Stop all marks it) alone still holds news of work begun before the limit; the goal’s status no longer does', async () => {
  const B = 'claude:goal-r8-mark';
  const w = worktree();
  sessions.add(B, { cwd: w.path, worktree: w });
  await agreed(B, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  const kid = `${B}-kid`;
  sessions.add(kid, { cwd: w.path, title: 'Helper', live: 'working' });
  setSessionExtra(db, kid, { parent: B });
  const began = Date.now();
  sessions.all.get(kid)!.items.push({ kind: 'user', id: 'r8-began', seq: 0, ts: began, text: 'Your part' } as TimelineItem);
  await sleep(3);
  // The limit, during which the helper does not stop (its program is slow to answer).
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => (k === kid ? void sessions.interrupted.push(k) : interrupt(k));
  setLimitWaitStep(1);
  spend(B, 2.5);
  try {
    await tick(deps);
  } finally {
    sessions.interrupt = interrupt;
    setLimitWaitStep(null);
  }
  assert.equal(goal(B).status, 'limit');
  assert.ok(sessionExtra(db, B).stoppedAll);
  await act(B, { action: 'stop' });
  assert.equal(loadGoal(db, B), null, 'the goal is gone: only the mark is left to decide');
  // Its turn ends after all, with a reply (not cut short): held by the limit's mark.
  setSessionExtra(db, kid, { stoppedWithParent: null });
  const kf = sessions.all.get(kid)!;
  kf.live = 'idle';
  kf.items.push({ kind: 'assistant', id: 'r8-said', seq: 0, ts: Date.now(), text: 'Finished my part.' } as TimelineItem, { kind: 'turn', id: 'r8-end', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
  kf.endedAt = Date.now();
  const n = toLead(B).length;
  await reportTurn(deps, { key: kid, startedAt: began, endedAt: kf.endedAt, external: false });
  assert.equal(toLead(B).length, n, 'nothing woke the session');
  assert.match(sessions.queued.filter((x) => x.key === B).at(-1)!.text, /Finished my part\.$/);
  assert.equal(sessions.queued.filter((x) => x.key === B).at(-1)!.held, true);
  db.prepare('delete from sessions where key = ?').run(B);
});

test('M5, M3: a session that does not lead a swarm but started Hydor subagents itself: a limit stops the one at work, named in the report as a subagent', async () => {
  const PL = 'claude:goal-m5-limit';
  const w = worktree();
  sessions.add(PL, { cwd: w.path, worktree: w });
  await agreed(PL, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  const kid = 'claude:goal-m5-limit-kid';
  sessions.add(kid, { cwd: w.path, title: 'Helper', live: 'working' });
  setSessionExtra(db, kid, { parent: PL });
  sessions.all.get(PL)!.live = 'working';
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => (k === kid ? void sessions.interrupted.push(k) : interrupt(k));
  setLimitWaitStep(5);
  spend(PL, 2.5);
  try {
    await tick(deps);
  } finally {
    sessions.interrupt = interrupt;
    setLimitWaitStep(null);
  }
  assert.equal(goal(PL).status, 'limit');
  assert.ok(sessions.stoppedAll.includes(kid));
  assert.ok(sessionExtra(db, kid).stoppedWithParent);
  assert.equal(sessionExtra(db, kid).swarmStopped, undefined, 'a swarm’s mark only for a swarm');
  assert.match(goal(PL).report!.summary, /The subagent “Helper” was still at work when round 1’s files were saved: what it writes after that is in the folder but not in the round\.$/);
  sessions.all.get(kid)!.live = 'idle';
  db.prepare('delete from sessions where key = ?').run(PL);
  await act(PL, { action: 'stop' });
});

test('M7b: a restart between the limit and the stop of its team: the tick finishes it (the subagent at work stopped, the lead marked), and clears the mark', async () => {
  const RB = 'claude:goal-m7b';
  const { crew } = await swarmGoal(RB, ['Speed'], { limits: { rounds: 8, usd: 1 } });
  const [m1] = crew;
  // The tick's hourly look at goals that are over is done already: only the mark brings this one to it.
  await tick(deps);
  // As stored when the app restarted right after the limit's commit: over, the stop marked and not done.
  remember(RB, (x) => {
    x.status = 'limit';
    x._.teamStop = Date.now();
  });
  sessions.all.get(m1)!.live = 'working';
  await tick(deps);
  assert.ok(sessions.stoppedAll.includes(m1), 'stopped now');
  assert.ok(sessionExtra(db, RB).stoppedAll, 'the lead marked');
  assert.equal(loadGoal(db, RB)!._.teamStop, undefined);
  sessions.all.get(m1)!.live = 'idle';
  await act(RB, { action: 'stop' });
});

test('S5.2: Stop all on a swarm’s lead pauses its goal, also while the lead waited for its members (no turn of its ends then); the members’ cut turns are not reported; Resume checks the round. A turn of the lead’s that Stop all cut pauses it too', async () => {
  const SA = 'claude:goal-sw-stopall';
  const { w, crew } = await swarmGoal(SA, ['Speed']);
  const [m1] = crew;
  await turn(SA, () => {
    sessions.all.get(m1)!.live = 'working';
  });
  // Stop all while the lead waits: its member stops with it (marked, so its cut turn is not reported), and the goal pauses.
  const n = toLead(SA).length;
  await memberTurn(
    m1,
    () => {
      write(w.path, 'score.txt', '6\n');
      setSessionExtra(db, m1, { stoppedWithParent: Date.now() });
      goalStopAll(deps, SA);
    },
    { status: 'interrupted' },
  );
  let g = goal(SA);
  assert.deepEqual([g.status, g.reason, g.round, g.rounds.length], ['paused', STOPPED_SWARM, 1, 1]);
  assert.equal(toLead(SA).length, n, 'nothing woke the lead');
  await act(SA, { action: 'resume' });
  assert.equal(goal(SA).rounds[1].outcome, 'kept', 'Resume checks what it did');
  // The lead in a turn: Stop all pauses the goal (as SessionManager.stopAll calls goalStopAll) and cuts the turn, whose
  // end then finds the goal paused: the reason stays the swarm's.
  await memberTurn(m1, () => setSessionExtra(db, m1, { stoppedWithParent: Date.now() }), { status: 'interrupted' });
  await turn(SA, () => goalStopAll(deps, SA), { status: 'interrupted' });
  g = goal(SA);
  assert.deepEqual([g.status, g.reason], ['paused', STOPPED_SWARM]);
  await act(SA, { action: 'stop' });
  // M5: a session that does not lead a swarm but started a Hydor subagent: Stop all pauses its goal too, with its own sentence.
  const P = 'claude:goal-sw-stopall-plain';
  const w2 = worktree();
  sessions.add(P, { cwd: w2.path, worktree: w2 });
  await agreed(P, { settings: { asks: 'own' } });
  sessions.add('claude:goal-sw-stopall-plain-kid', { cwd: w2.path, title: 'Helper' });
  setSessionExtra(db, 'claude:goal-sw-stopall-plain-kid', { parent: P });
  goalStopAll(deps, P);
  assert.deepEqual([goal(P).status, goal(P).reason], ['paused', 'You stopped the agent and its subagents. Resume checks what they did.']);
  await act(P, { action: 'stop' });
  // R6: one with no subagent: paused too, with the sentence a stopped turn gives.
  const P2 = 'claude:goal-sw-stopall-alone';
  const w3 = worktree();
  sessions.add(P2, { cwd: w3.path, worktree: w3 });
  await agreed(P2, { settings: { asks: 'own' } });
  goalStopAll(deps, P2);
  assert.deepEqual([goal(P2).status, goal(P2).reason], ['paused', 'You stopped the agent.']);
  await act(P2, { action: 'stop' });
});

test('S3, S6: a say while a member is at work is refused with the swarm’s sentence; a member that calls a goal tool hears the goal is its lead’s (a plain subagent: no goal)', async () => {
  const Y = 'claude:goal-sw-say';
  const { w, crew } = await swarmGoal(Y, ['Speed']);
  const [m1] = crew;
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  await turn(Y);
  assert.equal(goal(Y).rounds[1].outcome, 'kept');
  await stopAgent(Y);
  // A member at work (woken by another's message, say): the say waits for it.
  sessions.all.get(m1)!.live = 'working';
  await rejects(act(Y, { action: 'round', n: 1, do: 'undo' }), 409, /^This session’s agent or a member of its swarm is at work: wait for them to finish, then try again\.$/);
  for (const [name, args] of [
    ['goal_report', { did: 'Raised the score.' }],
    ['goal_propose', { checks: CHECKS }],
    ['goal_ask', { question: 'q', ways: [{ name: 'a' }, { name: 'b' }], pick: 1 }],
    ['goal_note', { text: 'x' }],
  ] as const)
    assert.equal((await tool(m1, name, args)).text, LEADS_GOAL, name);
  assert.equal(LEADS_GOAL, 'This goal is your lead’s: post what you found to the swarm board with swarm_post, and it reaches the lead.');
  // A Hydor subagent of a session that does not lead a swarm: as before.
  const PL = 'claude:goal-sw-plain-lead';
  sessions.add(PL, { cwd: PLAIN });
  await act(PL, { action: 'set', objective: 'Make it fast' });
  const kid = 'claude:goal-sw-plain-kid';
  sessions.add(kid, { cwd: PLAIN });
  setSessionExtra(db, kid, { parent: PL });
  assert.equal((await tool(kid, 'goal_report', { did: 'x' })).text, 'This session has no goal.');
  await act(PL, { action: 'stop' });
  sessions.all.get(m1)!.live = 'idle';
  await act(Y, { action: 'stop' });
});

test('S1: while a goal is not over, turning on a campaign, a deep research or an arena match is refused; a swarm on or off is not', async () => {
  const X = 'claude:goal-sw-extra';
  sessions.add(X, { cwd: PLAIN });
  assert.equal(goalTeamChange(db, X, { swarm: 'campaign' }), null, 'no goal');
  await act(X, { action: 'set', objective: 'Make it fast' });
  const no = 'This session has a goal: stop the goal first, or lead a swarm with it.';
  assert.equal(goalTeamChange(db, X, { swarm: 'campaign' }), no);
  assert.equal(goalTeamChange(db, X, { research: { depth: 'quick' } }), no);
  assert.equal(goalTeamChange(db, X, { arena: 'match1' }), no);
  assert.equal(goalTeamChange(db, X, { swarm: true }), null);
  assert.equal(goalTeamChange(db, X, { swarm: false }), null);
  assert.equal(goalTeamChange(db, X, { research: null, arena: null }), null, 'turning them off');
  assert.equal(goalTeamChange(db, X, { memory: false }), null);
  await act(X, { action: 'stop' });
  assert.equal(goalTeamChange(db, X, { swarm: 'campaign' }), null, 'a goal that is over');
});

// ---- L1: limits already used up ------------------------------------------------------------------------------------

/** What the session has spent, as the app reads it (its sessions row). */
const spend = (key: string, usdNow: number) =>
  db.prepare("insert into sessions (key, agent, id, path, cost_usd) values (?, 'claude', ?, '/nowhere', ?) on conflict(key) do update set cost_usd = excluded.cost_usd").run(key, key, usdNow);

test('L1: the agreement refuses limits the goal has already used (what working out the checks cost), whether the person set them or the proposal did; nothing changes, and a limit above it goes', async () => {
  const A1 = 'claude:goal-l1-agree';
  const w = worktree();
  sessions.add(A1, { cwd: w.path, worktree: w });
  await act(A1, { action: 'set', objective: 'Score reaches 10 and done.txt exists', settings: { asks: 'own' } });
  await turn(A1, async () => {
    assert.equal((await tool(A1, 'goal_propose', { checks: CHECKS, protect: ['tests/'], limits: { rounds: 8, usd: 0.003 } })).isError, false);
  });
  await until('agreeing', () => goal(A1).status === 'agreeing');
  // Working out the checks cost $0.006.
  spend(A1, 0.006);
  const n = sent(A1);
  await rejects(act(A1, { action: 'agree' }), 409, /^It has spent \$0\.006: give it more than that\.$/);
  await rejects(act(A1, { action: 'agree', contract: { limits: { rounds: 8, usd: 0.005 } } }), 409, /^It has spent \$0\.006: give it more than that\.$/);
  let g = goal(A1);
  assert.deepEqual([g.status, g.contract.limits, g.rounds.length, sent(A1)], ['agreeing', { rounds: 8, usd: 0.003 }, 0, n], 'nothing changed, nothing measured or sent');
  assert.equal(loadGoal(db, A1)!._.agreed, false);
  // Time: a goal that has worked longer than the minutes it is given.
  remember(A1, (x) => (x.activeMs = 5 * 60_000));
  await rejects(act(A1, { action: 'agree', contract: { limits: { rounds: 8, usd: 1, minutes: 3 } } }), 409, /^It has worked 5 min: give it more than that\.$/);
  remember(A1, (x) => (x.activeMs = 0));
  // Above what it used: it goes.
  await act(A1, { action: 'agree', contract: { limits: { rounds: 8, usd: 1 } } });
  await until('round 1', () => goal(A1).status !== 'measuring');
  g = goal(A1);
  assert.deepEqual([g.status, g.round, g.contract.limits.usd], ['working', 1, 1]);
  db.prepare('delete from sessions where key = ?').run(A1);
  await act(A1, { action: 'stop' });
});

test('L1: a change that lowers a limit below what the goal has used (money, time, rounds) is refused with the same sentence; nothing changes, and the goal does not stop a tick later', async () => {
  const C1 = 'claude:goal-l1-change';
  const w = worktree();
  sessions.add(C1, { cwd: w.path, worktree: w });
  await agreed(C1, { limits: { rounds: 8, usd: 5 }, settings: { asks: 'own' } });
  await turn(C1, () => write(w.path, 'score.txt', '4\n'));
  await turn(C1, () => write(w.path, 'score.txt', '6\n'));
  assert.deepEqual([goal(C1).status, goal(C1).round], ['working', 3]);
  spend(C1, 0.006);
  const before = goal(C1).contract.limits;
  await rejects(act(C1, { action: 'change', contract: { limits: { rounds: 8, usd: 0.004 } } }), 409, /^It has spent \$0\.006: give it more than that\.$/);
  await rejects(act(C1, { action: 'change', contract: { limits: { rounds: 2 } } }), 409, /^It has run 2 rounds: give it more than that\.$/);
  remember(C1, (x) => (x.activeMs = 5 * 60_000));
  await rejects(act(C1, { action: 'change', contract: { limits: { rounds: 8, minutes: 4 } } }), 409, /^It has worked 5 min: give it more than that\.$/);
  assert.deepEqual(goal(C1).contract.limits, before, 'nothing changed');
  await tick(deps);
  assert.equal(goal(C1).status, 'working', 'still at work');
  // Above what it used: taken. And a change of checks alone is not asked about limits.
  await act(C1, { action: 'change', contract: { limits: { rounds: 3, usd: 1, minutes: 30 } } });
  assert.deepEqual(goal(C1).contract.limits, { rounds: 3, usd: 1, minutes: 30 });
  db.prepare('delete from sessions where key = ?').run(C1);
  await act(C1, { action: 'stop' });
});

test('L3: in a session without a swarm, a Hydor subagent’s report still on its way (its turn ended, the report being written) holds the round; once it is delivered and the lead’s turn ends, the round is checked', async () => {
  const P = 'claude:goal-l3-plain';
  const w = worktree();
  sessions.add(P, { cwd: w.path, worktree: w });
  await agreed(P, { checks: SLOW_SCORE, settings: { asks: 'own' } });
  const kid = 'claude:goal-l3-kid';
  sessions.add(kid, { cwd: w.path, title: 'Helper' });
  setSessionExtra(db, kid, { parent: P });
  // The subagent's turn ended more than ten minutes ago, never reported (as after a restart), and the catch-up is writing
  // its report now: on its way (only the report being written says so: the turn is past the ten minutes).
  const id = await memberTurn(kid, () => write(w.path, 'score.txt', '6\n'), { report: false });
  sessions.all.get(kid)!.endedAt = Date.now() - 11 * 60_000;
  reportBegins(kid);
  try {
    await turn(P);
    assert.deepEqual([goal(P).status, goal(P).rounds.length], ['working', 1], 'not checked while its report is on its way');
    await tick(deps);
    assert.equal(goal(P).rounds.length, 1);
  } finally {
    reportEnds(kid);
  }
  // Handed over: the lead takes it in, and its turn ends.
  setSessionExtra(db, kid, { reported: id });
  await turn(P);
  assert.equal(goal(P).rounds[1].outcome, 'kept');
  assert.equal(goal(P).rounds[1].members, undefined, 'members are a swarm’s');
  await act(P, { action: 'stop' });
});

// ---- L2: commands a stopped round leaves running -----------------------------------------------------------------------

test('L2: at a limit, the half round’s checkpoint waits until the commands the agent’s turn started have ended (Codex runs them on after an interrupt); one still running at the bound is said in the round and the report', async () => {
  const C = 'codex:goal-l2-limit';
  const w = worktree();
  sessions.add(C, { agent: 'codex', cwd: w.path, worktree: w });
  await agreed(C, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  const f = sessions.all.get(C)!;
  // Its turn runs a command that ends 80 ms after the turn is interrupted, writing as it ends.
  f.live = 'working';
  f.commands = 1;
  write(w.path, 'half.txt', 'half done\n');
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => {
    await interrupt(k);
    if (k === C)
      setTimeout(() => {
        write(w.path, 'late.txt', 'written as it ended\n');
        f.commands = 0;
      }, 80);
  };
  setLimitWaitStep(5);
  spend(C, 2.5);
  try {
    await tick(deps);
  } finally {
    sessions.interrupt = interrupt;
  }
  let g = goal(C);
  assert.equal(g.status, 'limit');
  let half = g.rounds.at(-1)!;
  assert.equal(half.why, 'Stopped at the limit midway', 'it ended within the bound: nothing to say');
  assert.equal(inCheckpoint(w.path, half.checkpoint!, 'late.txt'), 'written as it ended\n', 'the checkpoint waited for it');
  assert.doesNotMatch(g.report!.summary, /still running/);
  await act(C, { action: 'stop' });
  // A command that does not end (a dev server, say): the checkpoint is taken at the bound, and the round and report say so.
  const C2 = 'codex:goal-l2-bound';
  const w2 = worktree();
  sessions.add(C2, { agent: 'codex', cwd: w2.path, worktree: w2 });
  await agreed(C2, { limits: { rounds: 8, usd: 1 }, settings: { asks: 'own' } });
  const f2 = sessions.all.get(C2)!;
  f2.live = 'working';
  f2.commands = 1;
  write(w2.path, 'half2.txt', 'the half round’s work\n');
  spend(C2, 2.5);
  try {
    await tick(deps);
  } finally {
    setLimitWaitStep(null);
  }
  g = goal(C2);
  half = g.rounds.at(-1)!;
  assert.equal(half.why, 'Stopped at the limit midway; a command the agent started was still running');
  assert.ok(half.checkpoint, 'taken all the same');
  assert.match(g.report!.summary, /A command the agent started was still running when round 1’s files were saved: what it writes after that is in the folder but not in the round\.$/);
  // Still the half round a restart may leave without its checkpoint (J2): the say takes it first, as for any half round.
  f2.commands = 0;
  remember(C2, (x) => {
    delete x.rounds.find((r) => r.n === 1)!.checkpoint;
    x._.filesAt = x.rounds[0].checkpoint;
  });
  await act(C2, { action: 'round', n: 0, do: 'keep' });
  assert.equal(file(w2.path, 'half2.txt'), null, 'put back to the start');
  assert.equal(inCheckpoint(w2.path, goal(C2).rounds.find((r) => r.n === 1)!.checkpoint!, 'half2.txt'), 'the half round’s work\n');
  db.prepare('delete from sessions where key in (?, ?)').run(C, C2);
  await act(C2, { action: 'stop' });
});

test('L2: a round’s turn that ended while a command it started still runs is not checked yet; once the command ends it is, and after the background grace it is checked anyway', async () => {
  const O = 'codex:goal-l2-open';
  const w = worktree();
  sessions.add(O, { agent: 'codex', cwd: w.path, worktree: w });
  await agreed(O, { settings: { asks: 'own' } });
  const f = sessions.all.get(O)!;
  // (A turn ends after its message went out, not in the same millisecond: the tick's look counts ends after it.)
  await sleep(5);
  await turn(O, () => {
    write(w.path, 'score.txt', '5\n');
    f.commands = 1;
  });
  assert.deepEqual([goal(O).status, goal(O).rounds.length], ['working', 1], 'not checked while its command runs');
  await tick(deps);
  assert.equal(goal(O).rounds.length, 1);
  f.commands = 0;
  await tick(deps);
  assert.equal(goal(O).rounds[1].outcome, 'kept');
  // Round 2: its command never ends (a server left running): checked once the background grace is over.
  await sleep(5);
  await turn(O, () => {
    write(w.path, 'score.txt', '6\n');
    f.commands = 1;
  });
  assert.equal(goal(O).rounds.length, 2);
  f.endedAt = Date.now() - BACKGROUND_GRACE_MS - 1000;
  await tick(deps);
  assert.equal(goal(O).rounds[2].outcome, 'kept');
  f.commands = 0;
  await act(O, { action: 'stop' });
});

// ---- the review of swarm rounds (M1 to M8) ------------------------------------------------------------------------------

test('M2: a member whose only work left is a background command (a dev server it left running) holds the round no longer than the background grace from its last turn’s end', async () => {
  const B = 'claude:goal-m2';
  const { w, crew } = await swarmGoal(B, ['Server']);
  const [m1] = crew;
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  const mf = sessions.all.get(m1)!;
  mf.tasks = [{ id: 'dev', description: 'npm run dev', kind: 'local_bash', status: 'running' }];
  await turn(B);
  assert.equal(goal(B).rounds.length, 1, 'within the grace: waited for');
  await tick(deps, Date.now() + 60_000);
  assert.equal(goal(B).rounds.length, 1);
  await tick(deps, Date.now() + BACKGROUND_GRACE_MS + 60_000);
  assert.equal(goal(B).rounds[1].outcome, 'kept', 'checked once the grace is over');
  mf.tasks = [];
  await act(B, { action: 'stop' });
});

test('M4: the lead woken while its turn’s end was being read (the board’s own timer delivered a batch): the round is not checked with the lead at work; its next turn’s end checks it', async () => {
  const B = 'claude:goal-m4';
  const { w, crew } = await swarmGoal(B, ['Speed']);
  const [m1] = crew;
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  let woke = false;
  sessions.timelineHook = (k) => {
    if (k === B && !woke && sessions.all.get(B)!.live === 'idle') {
      woke = true;
      sessions.all.get(B)!.live = 'working';
    }
  };
  try {
    await turn(B);
  } finally {
    sessions.timelineHook = undefined;
  }
  assert.ok(woke);
  assert.deepEqual([goal(B).status, goal(B).rounds.length], ['working', 1], 'not checked: the lead is at work on the batch');
  await turn(B);
  assert.equal(goal(B).rounds[1].outcome, 'kept');
  await act(B, { action: 'stop' });
});

test('M6: a goal stopped at its limit is not over for a change of team: a campaign, a deep research or an arena turned on is refused; and Give it more refuses a session that became one', async () => {
  const B = 'claude:goal-m6';
  const w = worktree();
  sessions.add(B, { cwd: w.path, worktree: w });
  await agreed(B, { limits: { rounds: 1 }, settings: { asks: 'own' } });
  await turn(B, () => write(w.path, 'score.txt', '5\n'));
  assert.equal(goal(B).status, 'limit');
  const no = 'This session has a goal: stop the goal first, or lead a swarm with it.';
  assert.equal(goalTeamChange(db, B, { swarm: 'campaign' }), no);
  assert.equal(goalTeamChange(db, B, { research: { depth: 'quick' } }), no);
  assert.equal(goalTeamChange(db, B, { swarm: true }), null);
  // As an older app let it become one.
  setSessionExtra(db, B, { swarm: 'campaign' });
  await rejects(act(B, { action: 'change', contract: { limits: { rounds: 3 } } }), 409, /^This session leads a campaign: a goal works with a swarm, not with a campaign yet\.$/);
  assert.equal(goal(B).status, 'limit');
  setSessionExtra(db, B, { swarm: null });
  await act(B, { action: 'change', contract: { limits: { rounds: 3 } } });
  assert.equal(goal(B).status, 'working');
  await act(B, { action: 'stop' });
});

test('M7a, R8: a subagent’s report is marked sent only once handed over; one that could not be handed over (as when a restart cuts it) is reported again by the next catch-up, and meanwhile the goal counts it as on its way', async () => {
  const B = 'claude:goal-m7a';
  const w = worktree();
  sessions.add(B, { cwd: w.path, worktree: w });
  await agreed(B, { settings: { asks: 'own' } });
  const kid = 'claude:goal-m7a-kid';
  sessions.add(kid, { cwd: w.path, title: 'Helper' });
  setSessionExtra(db, kid, { parent: B });
  let at: unknown = 'not handed over';
  const deliver = sessions.deliverOrQueue.bind(sessions);
  sessions.deliverOrQueue = async (k: string, text: string) => {
    if (k === B && text.includes('Hydor subagent')) at = sessionExtra(db, kid).reported;
    return deliver(k, text);
  };
  let id: string;
  try {
    id = await memberTurn(kid, () => write(w.path, 'score.txt', '5\n'));
  } finally {
    sessions.deliverOrQueue = deliver;
  }
  assert.equal(at, undefined, 'as it is handed over, the turn is not yet marked sent');
  assert.equal(sessionExtra(db, kid).reported, id, 'marked sent once handed over');
  await turn(B);
  assert.equal(goal(B).rounds[1].outcome, 'kept');
  // The handover fails (the session's agent gone as the app went down): not marked sent.
  const enqueue = sessions.enqueue.bind(sessions);
  sessions.deliverOrQueue = async () => {
    throw new Error('the agent is gone');
  };
  sessions.enqueue = () => {
    throw new Error('the agent is gone');
  };
  let id2: string;
  try {
    id2 = await memberTurn(kid, () => write(w.path, 'score.txt', '6\n'));
  } finally {
    sessions.deliverOrQueue = deliver;
    sessions.enqueue = enqueue;
  }
  assert.notEqual(sessionExtra(db, kid).reported, id2, 'not marked sent');
  await turn(B);
  assert.equal(goal(B).rounds.length, 2, 'its report counts as on its way');
  // The catch-up after a restart reports it again.
  const n = toLead(B).length;
  await catchUp(deps);
  assert.equal(toLead(B).length, n + 1, 'reported again');
  assert.equal(sessionExtra(db, kid).reported, id2);
  await turn(B);
  assert.equal(goal(B).rounds[2].outcome, 'kept');
  await act(B, { action: 'stop' });
});

test('M8: a message to a subagent waits while its lead’s files are being put back (it works in that folder)', async () => {
  const B = 'claude:goal-m8';
  const w = await atRound2(B);
  const kid = 'claude:goal-m8-kid';
  sessions.add(kid, { cwd: w.path, title: 'Helper' });
  setSessionExtra(db, kid, { parent: B });
  let waited: boolean | null = null;
  setRestorer(async (wt, c) => {
    await sleep(10);
    let through = false;
    const p = goals.beforeSend!(kid, deps)!.then(() => (through = true));
    await sleep(60);
    waited = !through;
    await restoreCheckpoint(wt, c);
    void p;
  });
  try {
    await turn(B, () => write(w.path, 'score.txt', '3\n'));
  } finally {
    setRestorer(null);
  }
  assert.equal(goal(B).rounds[2].outcome, 'undone');
  assert.equal(waited, true, 'the member’s message waited for the reset');
  await act(B, { action: 'stop' });
});

const swM1 = async (plain: boolean) => {
  const B = `claude:goal-m1${plain ? '-plain' : ''}`;
  const { w, crew } = await swarmGoal(B, ['Speed'], { plain });
  const [m1] = crew;
  const n = toLead(B).length;
  // The member's turn began before the goal paused (here Stop all paused it), and ends after.
  await memberTurn(m1, () => {
    write(w.path, 'score.txt', '6\n');
    goalStopAll(deps, B);
  });
  assert.equal(goal(B).status, 'paused');
  assert.equal(toLead(B).length, n, 'nothing woke the lead');
  assert.match(sessions.queued.filter((q) => q.key === B && q.held).at(-1)!.text, /^\[Reply from the Hydor subagent "Speed"/);
  // Work begun after the pause (the person set the member going): its report is not held.
  await sleep(2);
  await memberTurn(m1, () => {}, { reply: 'Looked again, as you asked.' });
  assert.equal(toLead(B).length, n + 1);
  assert.match(toLead(B).at(-1)!.text, /Looked again, as you asked\.$/);
  await act(B, { action: 'resume' });
  assert.ok(sessions.resumed.includes(B), 'Resume sent what was held');
  assert.match(toLead(B)[n + 1].text, /^\[Reply from the Hydor subagent "Speed"/);
  // News of work begun once the goal went on: delivered as before.
  const k = toLead(B).length;
  await memberTurn(m1, () => {});
  assert.equal(toLead(B).length, k + 1);
  await act(B, { action: 'stop' });
};
test('M1: while the goal is paused, a member’s report of work begun before the pause waits in the lead’s held queue instead of waking it; Resume sends it first; news of work begun after goes as before', () => swM1(false));
test('M1: while the goal is paused, a member’s report of work begun before the pause waits in the lead’s held queue instead of waking it; Resume sends it first; news of work begun after goes as before (S1, third review: a lead without a worktree)', () => swM1(true));

// ---- the second review of swarm rounds (R1 to R8) ------------------------------------------------------------------------

test('R2: posts the lead had not read before Stop all, its batch coming once the person pressed Resume: delivered, not held; the round is checked; the goal does not wait on a held queue', async () => {
  const B = 'claude:goal-r2-stopall';
  const { w, crew } = await swarmGoal(B, ['Speed']);
  const [m1] = crew;
  await turn(B, () => {
    sessions.all.get(m1)!.live = 'working';
  });
  // The member posts in its turn, then Stop all stops it and the lead (SessionManager.stopAll calls goalStopAll).
  sessions.all.get(m1)!.items.push({ kind: 'user', id: 'r2-began', seq: 0, ts: Date.now(), text: 'Your angle' } as TimelineItem);
  await sleep(2);
  addPost(db, { swarm: B, from: m1, kind: 'progress', text: 'Score is 6 now.' });
  write(w.path, 'score.txt', '6\n');
  setSessionExtra(db, m1, { stoppedWithParent: Date.now() });
  await sessions.stopAll(m1);
  await sessions.stopAll(B);
  goalStopAll(deps, B);
  assert.equal(goal(B).status, 'paused');
  // Resume within the board's delivery window: the batch goes to the lead (the board first, as at any round's end).
  const n = toLead(B).length;
  const held = sessions.queued.filter((q) => q.key === B && q.held).length;
  await act(B, { action: 'resume' });
  assert.equal(sessions.queued.filter((q) => q.key === B && q.held).length, held, 'not held');
  assert.match(toLead(B)[n].text, /^\[Swarm board · 1 new post\]/);
  // The lead's turn on it ends: the round is checked, and the goal goes on.
  await turn(B);
  assert.equal(goal(B).rounds[1].outcome, 'kept');
  assert.equal(goal(B).status, 'working');
  assert.notEqual(goal(B).reason, 'The session’s queue is paused: press Resume there');
  await act(B, { action: 'stop' });
});

test('R2: posts the lead had not read before a limit, their batch coming after Give it more…: delivered, not held', async () => {
  const B = 'claude:goal-r2-limit';
  const { crew } = await swarmGoal(B, ['Speed'], { limits: { rounds: 8, usd: 1 } });
  const [m1] = crew;
  sessions.all.get(m1)!.items.push({ kind: 'user', id: 'r2l-began', seq: 0, ts: Date.now(), text: 'Your angle' } as TimelineItem);
  await sleep(2);
  addPost(db, { swarm: B, from: m1, kind: 'finding', text: 'The cache halves it.' });
  setLimitWaitStep(1);
  spend(B, 2.5);
  try {
    await tick(deps);
  } finally {
    setLimitWaitStep(null);
  }
  assert.equal(goal(B).status, 'limit');
  await act(B, { action: 'change', contract: { limits: { rounds: 8, usd: 10 } } });
  assert.equal(goal(B).status, 'working');
  // The board's timer fires now.
  sessions.all.get(B)!.live = 'idle';
  const n = toLead(B).length;
  const held = sessions.queued.filter((q) => q.key === B && q.held).length;
  await tellLead(deps, B);
  assert.equal(sessions.queued.filter((q) => q.key === B && q.held).length, held, 'not held: the limit’s stop is over');
  assert.match(toLead(B)[n].text, /^\[Swarm board · 1 new post\]/);
  db.prepare('delete from sessions where key = ?').run(B);
  await act(B, { action: 'stop' });
});

test('R4: at a limit every member of the swarm is marked stopped, those not at work too: a post to an idle member wakes it no more', async () => {
  const B = 'claude:goal-r4';
  const { crew } = await swarmGoal(B, ['Busy', 'Idle'], { limits: { rounds: 8, usd: 1 } });
  const [m1, m2] = crew;
  sessions.all.get(m1)!.live = 'working';
  setLimitWaitStep(1);
  spend(B, 2.5);
  try {
    await tick(deps);
  } finally {
    setLimitWaitStep(null);
  }
  assert.equal(goal(B).status, 'limit');
  assert.ok(sessionExtra(db, m2).swarmStopped, 'the idle member too');
  assert.equal(sessionExtra(db, m2).stoppedWithParent, undefined, 'nothing was stopped in it');
  // The busy member's post to the idle one (as it finishes) does not wake it.
  const n = sessions.delivered.filter((x) => x.key === m2).length;
  posted(deps, addPost(db, { swarm: B, from: m1, to: m2, kind: 'note', text: 'Take the index next.' }));
  await sleep(30);
  assert.equal(sessions.delivered.filter((x) => x.key === m2).length, n);
  db.prepare('delete from sessions where key = ?').run(B);
  await act(B, { action: 'stop' });
});

const swR5 = async (plain: boolean) => {
  const B = `claude:goal-r5${plain ? '-plain' : ''}`;
  const { w, crew } = await swarmGoal(B, ['Speed'], { plain });
  const [m1] = crew;
  await memberTurn(m1, () => write(w.path, 'score.txt', '6\n'));
  checkingSoon();
  let atResume = -1;
  const t = whileChecking(async () => {
    // While the checks run: the member's turn began, Stop all paused the goal, the turn ends and its report is held.
    const mf = sessions.all.get(m1)!;
    const began = Date.now();
    mf.items.push({ kind: 'user', id: 'r5-began', seq: 0, ts: began, text: 'One more thing' } as TimelineItem);
    await sleep(2);
    goalStopAll(deps, B);
    mf.items.push({ kind: 'assistant', id: 'r5-said', seq: 0, ts: Date.now(), text: 'Done the extra.' } as TimelineItem, { kind: 'turn', id: 'r5-end', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
    mf.endedAt = Date.now();
    await sleep(2);
    await reportTurn(deps, { key: m1, startedAt: began, endedAt: mf.endedAt, external: false });
    assert.equal(sessions.queued.filter((q) => q.key === B && q.held).at(-1)?.text.endsWith('Done the extra.'), true, 'held');
    assert.ok(isDriving(B), 'the checks still run');
    atResume = toLead(B).length;
    await act(B, { action: 'resume' });
    assert.equal(toLead(B).length, atResume, 'nothing sent while the checks run');
  });
  await turn(B);
  await t;
  // The round recorded, the next message: what was held went first, then the round's message.
  assert.equal(goal(B).rounds[1].outcome, 'kept');
  const after = toLead(B).slice(atResume).map((m) => m.text);
  assert.match(after[0], /Done the extra\.$/);
  assert.match(after[1], /round 2 of/);
  await act(B, { action: 'stop' });
};
test('R5: Resume pressed while the checks still run: what was held for the session goes before the loop’s next message, not while the checks run', () => swR5(false));
test('R5: Resume pressed while the checks still run: what was held for the session goes before the loop’s next message, not while the checks run (S1, third review: a lead without a worktree)', () => swR5(true));

test('R6: a session without subagents whose round waits on its own background command: Stop all pauses the goal (nothing checked, nothing sent); Resume checks the round', async () => {
  const B = 'claude:goal-r6';
  const w = worktree();
  sessions.add(B, { cwd: w.path, worktree: w });
  await agreed(B, { settings: { asks: 'own' } });
  const f = sessions.all.get(B)!;
  await turn(B, () => {
    write(w.path, 'score.txt', '5\n');
    f.tasks = [{ id: 'dev', description: 'npm run dev', kind: 'local_bash', status: 'running' }];
  });
  assert.equal(goal(B).rounds.length, 1, 'its command still runs');
  const n = sent(B);
  await sessions.stopAll(B);
  goalStopAll(deps, B);
  assert.deepEqual([goal(B).status, goal(B).reason, goal(B).rounds.length], ['paused', 'You stopped the agent.', 1]);
  await tick(deps);
  assert.equal(goal(B).rounds.length, 1, 'nothing checked');
  assert.equal(sent(B), n, 'nothing sent');
  await act(B, { action: 'resume' });
  assert.equal(goal(B).rounds[1].outcome, 'kept', 'Resume checks the round');
  f.tasks = [];
  await act(B, { action: 'stop' });
});

test('R7: at a limit, a member that starts during the wait is stopped at the next look, not when the wait ends', async () => {
  const B = 'claude:goal-r7';
  const { w, crew } = await swarmGoal(B, ['Slow'], { limits: { rounds: 8, usd: 1 } });
  const [m1] = crew;
  const late = `${B}-late`;
  // m1 does not stop (it keeps the wait going to its end).
  sessions.all.get(m1)!.live = 'working';
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => (k === m1 ? void sessions.interrupted.push(k) : interrupt(k));
  let stoppedBy = -1;
  setLimitLook((i) => {
    if (i === 2) {
      sessions.add(late, { cwd: w.path, title: 'Late', live: 'starting' });
      setSessionExtra(db, late, { parent: B });
    }
    if (stoppedBy < 0 && sessions.stoppedAll.includes(late)) stoppedBy = i;
  });
  setLimitWaitStep(1);
  spend(B, 2.5);
  try {
    await tick(deps);
  } finally {
    sessions.interrupt = interrupt;
    setLimitLook(null);
    setLimitWaitStep(null);
  }
  assert.equal(stoppedBy, 3, 'stopped at the look after it appeared');
  sessions.all.get(m1)!.live = 'idle';
  db.prepare('delete from sessions where key = ?').run(B);
  await act(B, { action: 'stop' });
});

// Last: the tick it starts looks at every goal.
test('J5: the tick runs once as the feature starts: a reset a restart cut is dealt with at once, not a tick later', async () => {
  const J5 = 'claude:goal-j5';
  const w = await atRound2(J5);
  await cutUndo(J5, w, 'working');
  try {
    goals.start!(deps);
  } finally {
    stopTick();
  }
  await settled();
  const g = goal(J5);
  assert.equal(g.status, 'paused');
  assert.match(g.reason!, /^Putting round 2’s files back did not finish/);
  assert.equal(loadGoal(db, J5)!._.restoreTo, undefined);
  await act(J5, { action: 'stop' });
});

test('the goal as the page gets it has its time at work up to now: the stretch in progress is added to what was saved', async () => {
  const T1 = 'claude:goal-clock';
  const w = worktree();
  sessions.add(T1, { cwd: w.path, worktree: w });
  await agreed(T1);
  const g = loadGoal(db, T1)!;
  assert.equal(g.status, 'working');
  assert.ok(g._.activeSince != null, 'a round runs: its time counts from here');
  const at = g._.activeSince! + 5000;
  assert.equal(publicGoal(g, at)!.activeMs, g.activeMs + 5000, 'the saved time and the five seconds since');
  assert.equal(publicGoal({ ...g, _: { ...g._, activeSince: undefined } }, at)!.activeMs, g.activeMs, 'nothing in progress: as saved');
  assert.equal('_' in publicGoal(g)!, false);
  // What an action answers and what the page loads are the same state.
  const before = Date.now();
  const got = (await act(T1, { action: 'rule', text: 'Keep it small' }))!;
  assert.ok(got.activeMs >= g.activeMs + (before - g._.activeSince!), 'a state sent in the middle of a round does not set the clock back');
  await act(T1, { action: 'stop' });
});

test('a file a reviewer asked for stays with its check in the goal’s private state, and is in the evidence of the next runs', async () => {
  // In a worktree: the final check reviews a change only where git can show one.
  const w = worktree();
  const dir = w.path;
  write(dir, 'guide.md', 'GUIDE-TEXT\n');
  write(dir, '.env', 'KEY\n');
  const M = 'codex:goal-asks';
  sessions.add(M, { agent: 'codex', cwd: dir, worktree: w });
  reviewer.claim = false;
  reviewer.needs = ['guide.md', '.env'];
  try {
    await act(M, { action: 'set', objective: 'The guide is right' });
    await turn(M, async () => {
      await tool(M, 'goal_propose', { checks: [{ kind: 'review', label: 'Guide', claim: 'The guide is right', evidence: { diff: true } }] });
    });
    await until('agreeing', () => goal(M).status === 'agreeing');
    const first = goal(M).rounds[0].results[0];
    assert.equal(first.holds, false);
    assert.equal(first.detail, 'It does not: “nope”. Also read, at the reviewer’s request: guide.md.', 'asked once more, with the guide');
    assert.deepEqual(goal(M)._.asked, { c1: ['guide.md'] }, 'kept apart from the contract the person agreed');
    assert.equal(goal(M).contract.checks[0].evidence?.files, undefined);
    // The next run of the check has it from the start: one question.
    const before = asked.length;
    await act(M, { action: 'agree' });
    await until('round 1', () => goal(M).status === 'working');
    await turn(M, () => write(dir, 'work.txt', 'x\n'));
    const claims = asked.slice(before).filter((a) => a.system.includes('You check one claim'));
    assert.ok(claims.length >= 1);
    assert.match(claims[0].prompt, /<file path="guide.md">\nGUIDE-TEXT/, 'in the first question');
    assert.ok(!claims.some((a) => a.prompt.includes('KEY')));
    assert.deepEqual(goal(M)._.asked, { c1: ['guide.md'] });
    // Once the claim holds, the reviewer of the whole change gets that file too: the change alone does not show it.
    await until('round 2', () => goal(M).status === 'working' && goal(M).round === 2);
    reviewer.claim = true;
    const n0 = asked.length;
    await turn(M, () => write(dir, 'work.txt', 'y\n'));
    await until('reached', () => goal(M).status === 'reached');
    const last = asked.slice(n0).find((a) => a.system.includes('You are the last check'));
    assert.ok(last, 'the final review ran');
    assert.match(last!.system, /files that the reviewers of the checks asked to read \(<also-read>\)/);
    assert.match(last!.prompt, /<\/change>\n\n<also-read>\n<file path="guide\.md">\nGUIDE-TEXT\n\n<\/file>\n<\/also-read>\n\nYour JSON answer:$/);
    assert.ok(!last!.prompt.includes('KEY'));
  } finally {
    reviewer.needs = undefined;
    reviewer.claim = true;
    await act(M, { action: 'stop' });
  }
});

// ---- the third review of swarm rounds (S1 to S5) -------------------------------------------------------------------------

const SCORE = [{ kind: 'measure', label: 'Score', run: 'cat score.txt', target: { op: '>=', value: 10 } }];

test('S1 (third review): a swarm’s lead without a worktree keeps round 0 and each round it records, as a session without a swarm does, and every check holding runs the final check (its second run and the review) before the goal is reached', async () => {
  reviewer.final = { ok: true, reason: 'The change meets the goal.' };
  const run = async (key: string, swarm: boolean) => {
    let dir: string;
    if (swarm) dir = (await swarmGoal(key, ['Speed'], { plain: true, checks: SCORE })).w.path;
    else {
      dir = plainRepo(key).path;
      sessions.add(key, { cwd: dir, title: 'The lead' });
      await agreed(key, { checks: SCORE, settings: { asks: 'own' } });
    }
    assert.deepEqual(
      goal(key).rounds.map((r) => [r.outcome, r.results[0].value]),
      [['start', 2]],
      'round 0, measured at the agreement',
    );
    await turn(key, () => write(dir, 'score.txt', '6\n'));
    assert.deepEqual([goal(key).status, goal(key).round, goal(key).rounds.length], ['working', 2, 2], 'round 1 recorded, round 2 sent');
    const f0 = finalsAsked();
    await turn(key, () => write(dir, 'score.txt', '10\n'));
    const g = goal(key);
    assert.equal(g.status, 'reached');
    assert.equal(finalsAsked(), f0 + 1, 'the review of the whole change');
    assert.equal(g.report!.summary, 'The check holds: in the last round, and again on a second run. A review of the whole change found the goal met.');
    const seen = { rounds: g.rounds.map((r) => [r.n, r.outcome, r.why, r.results.map((x) => [x.id, x.holds, x.value])]), best: g.best };
    await act(key, { action: 'stop' });
    return seen;
  };
  const alone = await run('claude:goal-s1-alone', false);
  assert.deepEqual(await run('claude:goal-s1-lead', true), alone, 'the same rounds and scores as without a swarm');
});

/** In an ask turn, a member at work since before (posting, with `post`) finishes as the person presses Stop all on the lead: its report is held. */
async function stopInAskTurn(lead: string, member: string, post = false) {
  const n = toLead(lead).length;
  await memberTurn(member, () => {
    if (post) addPost(db, { swarm: lead, from: member, kind: 'progress', text: 'Score is 6 now.' });
    void sessions.stopAll(lead);
    goalStopAll(deps, lead);
  });
  assert.deepEqual([goal(lead).status, goal(lead).reason], ['paused', STOPPED_SWARM]);
  assert.equal(toLead(lead).length, n, 'its report held');
  assert.match(sessions.all.get(lead)!.queue.at(-1)!, /^\[Reply from the Hydor subagent "Speed"/);
}

test('S1 (third review): a swarm’s lead without a worktree, its goal stopped in an ask turn: Resume keeps that the goal went on (news of its members’ work from before the stop is held no more) and that what its queue held goes before the round’s message', async () => {
  const B = 'claude:goal-s1-ask';
  const { w, crew } = await swarmGoal(B, ['Speed'], { plain: true, settings: { asks: 'every', noAnswerMin: 0 } });
  const [m1] = crew;
  await turn(B, () => write(w.path, 'score.txt', '5\n'));
  assert.deepEqual([headOf(B), goal(B)._.askTurn], ['which way next', true]);
  const n = toLead(B).length;
  await stopInAskTurn(B, m1, true);
  await act(B, { action: 'resume' });
  const g = goal(B);
  assert.deepEqual([g.status, g.round], ['working', 2]);
  assert.ok((g._.wentOn ?? 0) >= (sessionExtra(db, B).stoppedAll as number), 'the goal went on after the stop');
  const after = toLead(B)
    .slice(n)
    .map((m) => m.text);
  assert.equal(after.length, 2);
  assert.match(after[0], /^\[Reply from the Hydor subagent "Speed"/, 'what was held, first');
  assert.match(after[1], /round 2 of/);
  // The member's post from before the stop: its batch (its timer fires now) reaches the lead, not held.
  const held = sessions.queued.filter((q) => q.key === B && q.held).length;
  await tellLead(deps, B);
  assert.equal(sessions.queued.filter((q) => q.key === B && q.held).length, held, 'not held: the stop is over for the goal');
  assert.match(toLead(B).at(-1)!.text, /^\[Swarm board · 1 new post\]/);
  await act(B, { action: 'stop' });
});

test('S2 (third review): what the queue held goes first and the loop’s message after it, a turn each, as the session manager sends a queue (a moment later, one message a turn): the round is not judged at the end of the turn on the news, and the two minutes for a message that never went out do not count that wait; an agent that does not run starts with the loop’s message and takes the news after it', async () => {
  const B = 'claude:goal-s2';
  const { w, crew } = await swarmGoal(B, ['Speed'], { settings: { asks: 'every', noAnswerMin: 0 } });
  const [m1] = crew;
  const lf = sessions.all.get(B)!;
  // As SessionManager: a queue let go goes a moment later, and only to an agent that runs and is idle, one message a turn
  // (the next at that turn's end); a message sent while a turn runs waits in the queue; one sent to an agent that does not
  // run starts it.
  const real = { deliverOrQueue: sessions.deliverOrQueue, resumeQueue: sessions.resumeQueue };
  const dispatch = () => {
    if (lf.queueHeld || lf.live !== 'idle' || !lf.queue.length) return;
    sessions.delivered.push({ key: B, text: lf.queue.shift()! });
    lf.live = 'working';
  };
  sessions.resumeQueue = function (this: Sessions, k: string) {
    if (k !== B) return real.resumeQueue.call(this, k);
    this.resumed.push(k);
    lf.queueHeld = false;
    setTimeout(dispatch, 5);
  };
  sessions.deliverOrQueue = async function (this: Sessions, k: string, text: string) {
    if (k !== B) return real.deliverOrQueue.call(this, k, text);
    if (lf.live && lf.live !== 'idle') return void lf.queue.push(text);
    this.delivered.push({ key: k, text });
    lf.live = 'working';
  };
  try {
    await turn(B, () => write(w.path, 'score.txt', '5\n'));
    assert.equal(headOf(B), 'which way next');
    let n = toLead(B).length;
    await stopInAskTurn(B, m1);
    await act(B, { action: 'resume' });
    assert.equal(toLead(B).length, n, 'nothing sent beside the queue’s own dispatch');
    assert.deepEqual(lf.queue.length, 2);
    await until('the news', () => toLead(B).length === n + 1);
    assert.match(toLead(B).at(-1)!.text, /^\[Reply from the Hydor subagent "Speed"/, 'the news first, on its own');
    assert.deepEqual([goal(B).status, goal(B).round, goal(B).rounds.length], ['working', 2, 2]);
    // The turn on the news runs past two minutes: the loop's message, still in the queue, is not sent again.
    await tick(deps, Date.now() + UNSENT_MS + 60_000);
    assert.equal(toLead(B).length, n + 1);
    // Its end is not round 2's: the loop's message has not gone out yet; two minutes on, still nothing sent again.
    await turn(B);
    assert.deepEqual([goal(B).status, goal(B).rounds.length], ['working', 2], 'not judged at the end of the turn on the news');
    await tick(deps, Date.now() + UNSENT_MS + 60_000);
    assert.deepEqual([toLead(B).length, goal(B).rounds.length, goal(B)._.resent], [n + 1, 2, undefined]);
    dispatch();
    assert.match(toLead(B).at(-1)!.text, /round 2 of/, 'then the loop’s message');
    assert.equal(toLead(B).length, n + 2);
    await turn(B, () => write(w.path, 'score.txt', '6\n'));
    assert.deepEqual([goal(B).rounds.length, goal(B).rounds[2].outcome, headOf(B)], [3, 'kept', 'which way next'], 'round 2 judged at its own turn’s end');
    // Stopped in the ask turn again, and its agent no longer runs: Resume's message starts it, and the news goes at that
    // turn's end (nothing would send a queue it waited behind).
    n = toLead(B).length;
    await stopInAskTurn(B, m1);
    lf.live = undefined;
    await act(B, { action: 'resume' });
    assert.equal(toLead(B).length, n + 1);
    assert.match(toLead(B).at(-1)!.text, /round 3 of/, 'sent at once');
    assert.match(lf.queue[0], /^\[Reply from the Hydor subagent "Speed"/);
    await turn(B, () => write(w.path, 'score.txt', '7\n'));
    assert.equal(goal(B).rounds.length, 3, 'not judged while the news waits in its queue');
    dispatch();
    assert.match(toLead(B).at(-1)!.text, /^\[Reply from the Hydor subagent "Speed"/);
    await turn(B);
    assert.equal(goal(B).rounds[3].outcome, 'kept');
    // Its agent's program is ending (stopping, or just gone and still listed for a moment): no queue is dispatched to it
    // and no turn of its ends, so the message is not left in the queue behind the news: it is sent as any message is.
    await stopInAskTurn(B, m1);
    lf.live = 'stopping';
    const direct: string[] = [];
    const queueing = sessions.deliverOrQueue;
    sessions.deliverOrQueue = async function (this: Sessions, k: string, text: string) {
      if (k === B) direct.push(text);
      return queueing.call(this, k, text);
    };
    try {
      await act(B, { action: 'resume' });
    } finally {
      sessions.deliverOrQueue = queueing;
    }
    assert.equal(direct.length, 1, 'handed to the session manager itself');
    assert.match(direct[0], /round 4 of/);
  } finally {
    sessions.resumeQueue = real.resumeQueue;
    sessions.deliverOrQueue = real.deliverOrQueue;
  }
  await act(B, { action: 'stop' });
});

test('S4 (third review): Give it more… takes back the stop a limit marked on the members that were not at work (the round’s message names them as members again, a post to everyone wakes them), not the stop of one it stopped at work (also one idle at first that a message woke during the wait), nor one the lead had stopped before', async () => {
  const B = 'claude:goal-s4';
  const { crew } = await swarmGoal(B, ['Busy', 'Idle', 'Done', 'Woken'], { limits: { rounds: 8, usd: 1 } });
  const [busy, idleM, done, woken] = crew;
  const leadStop = Date.now() - 1000;
  setSessionExtra(db, done, { swarmStopped: leadStop });
  // The busy member is slow to stop (the wait goes on); a message wakes Woken as the wait begins: the next look stops it.
  sessions.all.get(busy)!.live = 'working';
  const interrupt = sessions.interrupt.bind(sessions);
  sessions.interrupt = async (k: string) => (k === busy ? void sessions.interrupted.push(k) : interrupt(k));
  let wokenMark: unknown;
  setLimitLook((i) => {
    if (i === 0) {
      wokenMark = sessionExtra(db, woken).swarmStopped;
      sessions.all.get(woken)!.live = 'working';
    }
    if (i === 3) sessions.all.get(busy)!.live = 'idle';
  });
  setLimitWaitStep(1);
  spend(B, 2.5);
  try {
    await tick(deps);
  } finally {
    sessions.interrupt = interrupt;
    setLimitLook(null);
    setLimitWaitStep(null);
  }
  assert.equal(goal(B).status, 'limit');
  assert.ok(sessionExtra(db, idleM).swarmStopped && sessionExtra(db, busy).swarmStopped, 'both marked stopped at the limit');
  assert.ok(wokenMark, 'Woken was idle, and marked, at first');
  assert.ok(sessions.stoppedAll.includes(woken), 'then stopped at work');
  assert.notEqual(sessionExtra(db, woken).swarmStopped, wokenMark);
  assert.deepEqual(
    goal(B)._.limitMarked?.map((m) => m.key),
    [idleM, woken],
  );
  await act(B, { action: 'change', contract: { limits: { rounds: 8, usd: 10 } } });
  assert.equal(goal(B).status, 'working');
  assert.equal(sessionExtra(db, idleM).swarmStopped, undefined, 'a member again');
  assert.ok(sessionExtra(db, busy).swarmStopped, 'the one it stopped at work stays stopped');
  assert.ok(sessionExtra(db, woken).swarmStopped, 'and so does the one it stopped at work once a message woke it');
  assert.equal(sessionExtra(db, done).swarmStopped, leadStop, 'the lead’s own stop stays');
  assert.equal(goal(B)._.limitMarked, undefined);
  assert.match(last(B), /- “Idle” \(not started a turn yet\)/);
  assert.match(last(B), /- “Busy” \(stopped\)/);
  const n = sessions.delivered.filter((x) => x.key === idleM).length;
  posted(deps, addPost(db, { swarm: B, from: B, kind: 'note', text: 'Everyone: take the index next.' }));
  await until('the idle member woken', () => sessions.delivered.filter((x) => x.key === idleM).length > n, 3000);
  db.prepare('delete from sessions where key = ?').run(B);
  await act(B, { action: 'stop' });
});

test('S5 (third review): a Stop all from before the goal was set holds nothing once it is: the report of a member’s turn that began before that stop reaches the lead', async () => {
  const B = 'claude:goal-s5';
  const w = worktree();
  sessions.add(B, { cwd: w.path, worktree: w, title: 'The lead' });
  setSessionExtra(db, B, { swarm: true });
  const m1 = `${B}-m1`;
  sessions.add(m1, { cwd: w.path, title: 'Speed' });
  setSessionExtra(db, m1, { parent: B });
  // The member's turn began; the person pressed Stop all on the lead (no goal yet); the member's turn ran on.
  const mf = sessions.all.get(m1)!;
  const began = Date.now();
  mf.live = 'working';
  mf.items.push({ kind: 'user', id: 's5-began', seq: 0, ts: began, text: 'Your angle' } as TimelineItem);
  await sleep(2);
  await sessions.stopAll(B);
  await sleep(2);
  // Then the goal, set and agreed; the member's turn ends in round 1.
  await agreed(B, { checks: SLOW_SCORE, settings: { asks: 'own' } });
  assert.deepEqual([goal(B).status, goal(B).round], ['working', 1]);
  mf.live = 'idle';
  mf.items.push({ kind: 'assistant', id: 's5-said', seq: 0, ts: Date.now(), text: 'Done: the cache is in.' } as TimelineItem, { kind: 'turn', id: 's5-end', seq: 0, ts: Date.now(), status: 'completed' } as TimelineItem);
  mf.endedAt = Date.now();
  await sleep(2);
  const n = toLead(B).length;
  const held = sessions.queued.filter((q) => q.key === B && q.held).length;
  await reportTurn(deps, { key: m1, startedAt: began, endedAt: mf.endedAt, external: false });
  assert.equal(sessions.queued.filter((q) => q.key === B && q.held).length, held, 'not held');
  assert.equal(toLead(B).length, n + 1);
  assert.match(toLead(B).at(-1)!.text, /Done: the cache is in\.$/);
  await act(B, { action: 'stop' });
});

// ---- a score check: the project's evaluation scores the rounds ----------------------------------------------------
// A repository of its own with a tiny evaluation (a shell script printing ndcg for each of three seeds: the model's number
// plus the seed's noise; "slow" takes long), scored for real through the Experiments queue (tmux, no GPU).

const EREPO = path.join(tmp, 'erepo');
fs.mkdirSync(EREPO);
write(EREPO, 'eval.sh', 'm=$(cat model.txt)\ncase "$m" in slow) sleep 60; exit 0;; esac\nn=$(sed -n "${1}p" noise.txt)\nawk -v m="$m" -v n="$n" \'BEGIN { printf "ndcg=%.4f\\n", m + n }\'\n');
write(EREPO, 'noise.txt', '0\n0.02\n-0.02\n');
write(EREPO, 'model.txt', '0.40\n');
git(EREPO, 'init', '-q', '-b', 'main');
git(EREPO, 'config', 'user.name', 'Test');
git(EREPO, 'config', 'user.email', 'test@example.invalid');
git(EREPO, 'add', '-A');
git(EREPO, 'commit', '-q', '-m', 'start');
let ewtN = 0;
function eworktree(): WorktreeInfo {
  const p = path.join(tmp, `ewt${++ewtN}`);
  const branch = `agent/goal-score-${ewtN}`;
  git(EREPO, 'worktree', 'add', '-q', '-b', branch, p, 'main');
  return { path: p, branch, base: 'main', repo: EREPO };
}
let evS: Evaluation | undefined;
let stepper: NodeJS.Timeout | undefined;
/** The evaluation, its baseline measured by the person (0.40 over three seeds), and the queue stepping. */
async function evaluation(): Promise<Evaluation> {
  if (evS) return evS;
  useQueueDeps(deps);
  setQueueSettings(db, { cpuSlots: 4 });
  stepper = setInterval(() => void queueTick(), 100);
  evS = await createEvaluation(deps, { name: 'Relevance', cwd: EREPO, command: 'sh eval.sh {seed}', metric: 'ndcg', better: 'higher', seeds: [1, 2, 3], protect: ['eval.sh', 'noise.txt'], final: { command: 'sh eval.sh 1' }, gpus: 0 });
  const b = await startScore(deps, evS.id, { kind: 'baseline', by: { who: 'you' } });
  await until('the baseline', () => getScore(db, b.id)?.status === 'done', 60_000);
  return evS;
}
const scoresOf = (id: string) => listScores(db, id, ['score']);
const model = (dir: string, v: string) => write(dir, 'model.txt', `${v}\n`);
/** A goal with a score check (gain 0.05) and a command, agreed by the person and measured: round 1 sent. */
async function scoreGoal(key: string, ev: Evaluation) {
  await act(key, { action: 'set', objective: 'Beat the baseline on ndcg by 0.05' });
  await turn(key, async () => {
    const r = await tool(key, 'goal_propose', { checks: [{ kind: 'score', label: 'Beats the baseline', evaluation: ev.id, gain: 0.05 }, { kind: 'command', label: 'Model file', run: 'test -f model.txt' }], protect: ['notes/'], limits: { rounds: 6 } });
    assert.equal(r.isError, false, r.text);
  });
  await until('agreeing', () => goal(key).status === 'agreeing');
  await act(key, { action: 'agree' });
  await until('round 1', () => goal(key).status === 'working' && goal(key).round === 1, 60_000);
}

const SC = 'claude:goal-score';
const swt = eworktree();
sessions.add(SC, { cwd: swt.path, worktree: swt, title: 'Beat the baseline' });

test('score: proposed with an evaluation the folder does not have, refused in a sentence; agreed, its target fixed from the baseline and the evaluation’s files kept safe; kept, undone (a protected file), reached with no second score, and the report names the final test', async () => {
  const ev = await evaluation();
  reviewer = { needs: undefined, claim: true, broke: false, final: { ok: true, reason: 'The change meets the goal: model.txt says 0.50.' } };
  // An evaluation the folder does not have, said to the agent to fix.
  await act(SC, { action: 'set', objective: 'Beat the baseline' });
  const bad = await tool(SC, 'goal_propose', { checks: [{ kind: 'score', label: 'Beats it', evaluation: 'enope' }] });
  assert.equal(bad.isError, true);
  assert.match(bad.text, /“Beats it”: there is no evaluation “enope” \(evaluation_get lists those of this folder\)/);
  await act(SC, { action: 'stop' });
  await act(SC, { action: 'stop' });
  await scoreGoal(SC, ev);
  let g = goal(SC);
  const c = g.contract.checks[0];
  assert.deepEqual(c.target, { op: '>=', value: 0.45 }, 'the baseline’s 0.40 and the gain');
  assert.equal(c.baseline!.seal, 1);
  assert.equal(c.baseline!.name, 'Relevance');
  assert.deepEqual(g.contract.protect, ['notes/', 'eval.sh', 'noise.txt'], 'the evaluation’s files join the paths');
  const r0 = g.rounds[0].results.find((r) => r.id === c.id)!;
  assert.ok(Math.abs(r0.value! - 0.4) < 1e-9);
  assert.equal(r0.holds, false);
  assert.equal(r0.verdict, 'same');
  assert.equal(getScore(db, r0.score!)!.by.who, 'goal');
  assert.equal(g.scoring, undefined, 'nothing waits once it is measured');
  // The round's agent hears how the score stands and that it may score its own work.
  assert.match(last(SC), /Scored by the project’s evaluation[\s\S]*Beats the baseline: the ndcg of the evaluation “Relevance” \(id e[\w]+\), 0\.4 where the files stand; its baseline is 0\.4, and it holds at ≥ 0\.45, beyond the noise of its seeds\.[\s\S]*evaluation_score/);
  assert.match(last(SC), /Do not change: notes\/, eval\.sh, noise\.txt/);
  assert.match(last(SC), /Not yet: Beats the baseline 0\.4 \(needs ≥ 0\.45, beyond the noise\)/);
  // Round 1: closer, within the noise: kept.
  await turn(SC, async () => {
    model(swt.path, '0.43');
    await tool(SC, 'goal_report', { did: 'Tuned the model to 0.43.' });
  });
  g = goal(SC);
  assert.equal(g.rounds[1].outcome, 'kept', g.rounds[1].why);
  assert.equal(g.rounds[1].why, 'Beats the baseline 0.4 → 0.43');
  assert.match(g.rounds[1].results[0].detail!, /^0\.43 against 0\.4: within the noise of 3 seeds/);
  assert.equal(g.best, 1);
  // Round 2: the scorer changed (a protected file): undone; its score was refused, and nothing was scored.
  const before = scoresOf(ev.id).length;
  await turn(SC, () => {
    model(swt.path, '0.90');
    write(swt.path, 'eval.sh', 'echo ndcg=0.99\n');
  });
  g = goal(SC);
  assert.equal(g.rounds[2].outcome, 'undone');
  assert.equal(g.rounds[2].cause, 'protected');
  assert.equal(g.rounds[2].why, 'It changed files it may not change: eval.sh');
  assert.match(g.rounds[2].results[0].error!, /^The scorer or its data changed since it was sealed: eval\.sh, so it was not scored$/);
  assert.equal(scoresOf(ev.id).length, before);
  assert.equal(file(swt.path, 'model.txt'), '0.43\n');
  assert.equal(file(swt.path, 'eval.sh')!.startsWith('m=$(cat model.txt)'), true, 'the scorer is back');
  // Round 3: beyond the noise and the gain: every check holds; the final check runs the command again, not the score.
  await turn(SC, () => model(swt.path, '0.50'));
  g = goal(SC);
  assert.equal(g.status, 'reached', g.reason ?? g.rounds.at(-1)?.why);
  assert.equal(scoresOf(ev.id).length, before + 1, 'one score for round 3, none again at the end');
  assert.equal(g.report!.summary, 'All 2 checks hold: in the last round, and the one that runs a command again on a second run. A review of the whole change found the goal met.');
  assert.deepEqual(g.report!.finals, [{ evaluation: ev.id, name: 'Relevance' }]);
  assert.equal(g.rounds[3].results[0].verdict, 'better');
  // The final reviewer reads the score as the app's own run of the sealed evaluation.
  const final = asked.filter((a) => a.system.includes('You are the last check')).at(-1)!;
  assert.match(final.prompt, /- Beats the baseline \(score: the ndcg of the sealed evaluation “Relevance”, run by the app, >= 0\.45: its baseline 0\.4 \+ 0\.05, beyond the noise of its seeds\)/);
  assert.equal(listScores(db, ev.id, ['final']).length, 0, 'the final test never ran');
  await act(SC, { action: 'stop' });
});

const SP = 'claude:goal-score-pause';
const pwt = eworktree();
sessions.add(SP, { cwd: pwt.path, worktree: pwt, title: 'Pause a score' });

test('score: the bar says how its runs stand while it waits; Pause stops its runs and pauses at once, the round unchecked; Resume scores it again; Stop stops its runs too', async () => {
  const ev = await evaluation();
  await scoreGoal(SP, ev);
  // The round's turn ends with a slow model: its check waits for the score (not awaited here).
  await turn(SP, () => model(pwt.path, 'slow'), { tell: false });
  await tickOnce(deps);
  await until('scoring', () => !!goal(SP).scoring && goal(SP).status === 'checking', 30_000);
  const sc = goal(SP).scoring!;
  assert.equal(sc.check, 'c1');
  assert.equal(sc.runs, 3);
  const id = (loadGoal(db, SP)!._.scores ?? {}).c1;
  assert.ok(id, 'the score is kept with the goal while it is waited for');
  await until('its runs going', () => getScore(db, id)!.runs.every((r) => getRun(db, r)?.status === 'running'), 30_000);
  await act(SP, { action: 'pause' });
  let g = goal(SP);
  assert.equal(g.status, 'paused');
  assert.equal(g.reason, SCORE_PAUSED);
  assert.equal(g.pausing, undefined, 'it does not wait for the score');
  assert.equal(g.scoring, undefined);
  await settled();
  await until('the score stopped', () => getScore(db, id)!.status === 'stopped', 60_000);
  g = goal(SP);
  assert.equal(g.round, 1, 'the round is unchecked');
  assert.equal(g.rounds.length, 1);
  assert.equal(loadGoal(db, SP)!._.scores, undefined);
  // Resume: scored again (now quickly), and the round is judged.
  model(pwt.path, '0.43');
  await act(SP, { action: 'resume' });
  await settled();
  await until('round 1 checked', () => goal(SP).rounds.length === 2, 60_000);
  assert.equal(goal(SP).rounds[1].outcome, 'kept');
  assert.notEqual(goal(SP).rounds[1].results[0].score, id);
  // Stop while it waits: its runs stop, and the report says the round was not checked.
  await until('round 2', () => goal(SP).status === 'working' && goal(SP).round === 2);
  await turn(SP, () => model(pwt.path, 'slow'), { tell: false });
  await tickOnce(deps);
  await until('scoring again', () => !!loadGoal(db, SP)!._.scores?.c1 && goal(SP).status === 'checking', 30_000);
  const id2 = loadGoal(db, SP)!._.scores!.c1;
  await until('its runs going', () => getScore(db, id2)!.runs.every((r) => getRun(db, r)?.status === 'running'), 30_000);
  await act(SP, { action: 'stop' });
  assert.equal(goal(SP).status, 'stopped');
  assert.equal(goal(SP).report!.mid, 2);
  assert.match(goal(SP).report!.summary, /^Stopped by you during round 2: that round’s work was not checked\./);
  await settled();
  await until('the second score stopped', () => getScore(db, id2)!.status === 'stopped', 60_000);
  assert.equal(goal(SP).rounds.length, 2, 'nothing was recorded for round 2');
  model(pwt.path, '0.40');
  await act(SP, { action: 'stop' });
});

const SR = 'claude:goal-score-restart';
const rwt = eworktree();
sessions.add(SR, { cwd: rwt.path, worktree: rwt, title: 'A restart mid-score' });

test('score: a restart while a score is open: the tick waits for that same score again, and starts no other', async () => {
  const ev = await evaluation();
  await scoreGoal(SR, ev);
  await turn(SR, () => model(rwt.path, '0.43'), { tell: false });
  // As a restart leaves it: checking, the score started and kept with the goal, nothing waiting for it.
  const left = await startScore(deps, ev.id, { kind: 'score', folder: rwt.path, by: { who: 'goal', session: SR } });
  const g = loadGoal(db, SR)!;
  g.status = 'checking';
  g._.lastTurn = sessions.all.get(SR)!.endedAt;
  g._.scores = { c1: left.id };
  saveGoal(db, g);
  const n = scoresOf(ev.id).length;
  await tick(deps);
  await until('round 1 checked', () => goal(SR).rounds.length === 2, 60_000);
  assert.equal(goal(SR).rounds[1].results[0].score, left.id, 'the score the restart left open');
  assert.equal(scoresOf(ev.id).length, n, 'no other score started');
  assert.equal(goal(SR).rounds[1].outcome, 'kept');
  assert.equal(loadGoal(db, SR)!._.scores, undefined);
  await act(SR, { action: 'stop' });
});

const SM = 'claude:goal-score-moved';
const mwt = eworktree();
sessions.add(SM, { cwd: mwt.path, worktree: mwt, title: 'Sealed again mid-goal' });

test('score: the evaluation sealed again mid-goal: nothing is scored, the round waits and the goal asks; the answer fixes the check again once there is a baseline, the round is checked and the score starts from it', async () => {
  const ev = await evaluation();
  await scoreGoal(SM, ev);
  await turn(SM, () => model(mwt.path, '0.43'));
  assert.equal(goal(SM).rounds[1].outcome, 'kept');
  await until('round 2', () => goal(SM).round === 2);
  await sealAgain(deps, ev.id);
  const n = scoresOf(ev.id).length;
  await turn(SM, () => model(mwt.path, '0.50'));
  let g = goal(SM);
  assert.equal(g.status, 'needs-you');
  assert.equal(g.round, 2, 'the round waits, unchecked');
  assert.equal(g.question!.kind, 'blocked');
  assert.equal(g.question!.question, '“Relevance” was sealed again after the goal’s checks were agreed, so its scores can no longer be compared with the baseline “Beats the baseline” was agreed against.');
  assert.deepEqual(g.question!.ways, [{ name: MOVED_WAY }]);
  assert.equal(g.reason, g.question!.question);
  assert.equal(scoresOf(ev.id).length, n, 'nothing was scored');
  assert.equal(notices.at(-1)!.body.startsWith('The goal needs you: “Relevance” was sealed again'), true);
  // Answered before a baseline is measured under the new seal: the question says so, and stays.
  await act(SM, { action: 'answer', ways: [0] });
  g = goal(SM);
  assert.equal(g.status, 'needs-you');
  assert.equal(g.question!.question, '“Beats the baseline”: the baseline of “Relevance” is not measured yet: only you can measure it, on the evaluation’s page.');
  // The person measures it, and answers again: fixed against the new seal, the old values gone, the round checked.
  model(EREPO, '0.40');
  const b2 = await startScore(deps, ev.id, { kind: 'baseline', by: { who: 'you' } });
  await until('the new baseline', () => getScore(db, b2.id)?.status === 'done', 60_000);
  await act(SM, { action: 'answer', ways: [0], note: 'Resealed after a fix' });
  await settled();
  await until('round 2 checked', () => goal(SM).rounds.length === 3, 60_000);
  g = goal(SM);
  const c = g.contract.checks[0];
  assert.equal(c.baseline!.seal, 2);
  assert.equal(c.baseline!.score, b2.id);
  assert.equal(g.rounds[1].results.some((r) => r.id === c.id), false, 'no value of the old seal is kept');
  const start = g.rounds[0].results.find((r) => r.id === c.id)!;
  assert.equal(start.since, 2, 'it starts from the round checked after the answer');
  assert.ok(Math.abs(start.value! - 0.5) < 1e-9);
  assert.equal(g.rounds[2].results.find((r) => r.id === c.id)!.verdict, 'better');
  assert.equal(g.answered!.picked[0], MOVED_WAY);
  await act(SM, { action: 'stop' });
  await act(SM, { action: 'stop' });
});

const SF = 'claude:goal-score-full';
const fwt = eworktree();
// Bypass: its agent runs commands unasked, so a proposal is measured at once; a score still waits for Start.
sessions.add(SF, { cwd: fwt.path, worktree: fwt, title: 'Full access', mode: 'bypassPermissions' });

test('score: where the agent runs commands unasked, the proposal is measured at once but no score starts, nor at a change of the checks while agreeing; Start scores it exactly once, as the start, and the first round is judged from it', async () => {
  const ev = await evaluation();
  const n0 = scoresOf(ev.id).length;
  await act(SF, { action: 'set', objective: 'Beat the baseline on ndcg' });
  await turn(SF, async () => {
    const r = await tool(SF, 'goal_propose', { checks: [{ kind: 'score', label: 'Beats the baseline', evaluation: ev.id, gain: 0.05 }, { kind: 'command', label: 'Model file', run: 'test -f model.txt' }], limits: { rounds: 6 } });
    assert.equal(r.text, 'Shown to the user. Stop now: the app measures where things stand, and the rounds start when they agree.');
  });
  await until('agreeing', () => goal(SF).status === 'agreeing', 30_000);
  let g = goal(SF);
  assert.equal(scoresOf(ev.id).length, n0, 'no score before the person agreed');
  assert.deepEqual(
    g.rounds[0].results.map((r) => [r.id, r.holds]),
    [['c2', true]],
    'the command was measured, not the score',
  );
  assert.deepEqual(loadGoal(db, SF)!._.remeasure, ['c1'], 'the score waits for Start');
  // A change of the checks while agreeing is measured at once here too: still no score.
  await act(SF, { action: 'change', contract: { checks: [{ ...g.contract.checks[0], gain: 0.04 }, { ...g.contract.checks[1], run: 'test -f model.txt && test -f eval.sh' }] } });
  await until('agreeing again', () => goal(SF).status === 'agreeing' && !isDriving(SF), 30_000);
  g = goal(SF);
  assert.equal(scoresOf(ev.id).length, n0);
  assert.deepEqual(g.contract.checks[0].target, { op: '>=', value: 0.44 }, 'the new gain counts from the same baseline');
  assert.equal(g.rounds[0].results.some((r) => r.id === 'c1'), false);
  // Start: exactly one score, the start's own.
  await act(SF, { action: 'agree' });
  await until('round 1', () => goal(SF).status === 'working' && goal(SF).round === 1, 60_000);
  g = goal(SF);
  assert.equal(scoresOf(ev.id).length, n0 + 1, 'one score, at Start');
  const s0 = g.rounds[0].results.find((r) => r.id === 'c1')!;
  assert.ok(Math.abs(s0.value! - 0.4) < 1e-9);
  assert.equal(s0.since, undefined, 'it is where the score starts from, not a check changed later');
  assert.equal(s0.closeness, 0);
  assert.match(last(SF), /Beats the baseline 0\.4 \(needs ≥ 0\.44, beyond the noise\)/);
  // Round 1: 0.43 is three quarters of the way from the start's 0.40 to 0.44: closer, so kept.
  await turn(SF, () => model(fwt.path, '0.43'));
  g = goal(SF);
  assert.equal(g.rounds[1].outcome, 'kept', g.rounds[1].why);
  assert.equal(g.rounds[1].why, 'Beats the baseline 0.4 → 0.43');
  const r1 = g.rounds[1].results.find((r) => r.id === 'c1')!;
  assert.ok(Math.abs(r1.closeness - 0.75) < 1e-9, String(r1.closeness));
  assert.equal(scoresOf(ev.id).length, n0 + 2);
  await act(SF, { action: 'stop' });
  await act(SF, { action: 'stop' });
});

test('score: the experiments queue and its tmux server stop with the tests', async () => {
  if (stepper) clearInterval(stepper);
  await stopTmuxServer();
});

// ---- run ---------------------------------------------------------------------------------------------

// About two and a half minutes on a quiet computer: room for a busy one (scripts/test.mjs stops a file at fifteen).
setTimeout(() => {
  console.error('driver-test: timed out');
  process.exit(1);
}, 480_000).unref();
// TEST_ONLY=<words>: only the tests whose name holds them (to see one test fail when a guard is taken out by hand).
const only = process.env.TEST_ONLY;
for (const [name, fn] of tests) {
  if (only && !name.includes(only)) continue;
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`${passed}/${tests.length} passed`);
setReviewer(null);
for (let i = 1; i <= wtN; i++) {
  try {
    git(REPO, 'worktree', 'remove', '--force', path.join(tmp, `wt${i}`));
  } catch {}
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit();
