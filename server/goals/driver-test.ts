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
// check, while the next round's start is saved, or across a restart; Resume meanwhile takes it back.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/goals/driver-test.ts
//   DATA_DIR=/tmp/hydor-test-goal-driver PRICES_URL= node dist/dev/driver-test.js
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { goalHead, goalMessageOf, holding, type GoalAction, type GoalCheck, type GoalState } from '../../shared/goals.ts';
import { CUT_BY_RESTART } from '../agents/acp.ts';
import { asked as userAsked } from '../custom/review.ts';
import { kvSet } from '../db.ts';
import type { Agent, BackgroundTask, GoalInfo, LiveStatus, NotifyEvent, SessionSummary, TimelineItem, WorktreeInfo } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { CONFIDENTIAL_TOOLS } from '../confidential/index.ts';
import { openDb } from '../db.ts';
import type { Deps, RunCtx, SpawnAdditions, SpawnInfo } from '../features/types.ts';
import { setSessionExtra } from '../sessionExtra.ts';
import { checkpoint, restoreCheckpoint, setGitVersionReader } from '../worktrees.ts';
import { RESTARTED } from './brief.ts';
import { BACKGROUND_GRACE_MS, changedChecks, checkRunner, goalAction, goalOnCreate, goalResetRefusal, goalStartIgnored, goalStartRefusal, isDriving, LIMIT_GRACE_MS, NO_SANDBOX, restoreSettled, reviewerDown, runsCommand, runsUnasked, setCheckpointer, setCheckSandbox, setRestorer, settled, stopTick, teamRefusal, tick as tickOnce, UNPRICED, UNSENT_MS } from './driver.ts';
import { goals } from './index.ts';
import { setReviewer } from './review.ts';
import { goalHoldsNotices, goalInfo, loadGoal, saveGoal, type RestoreMark } from './store.ts';
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
      live: f.live ? { status: f.live, startedAt: 1, pendingApprovals: 0, ...(f.mode ? { mode: f.mode } : {}), ...(f.tasks ? { backgroundTasks: f.tasks } : {}), ...(f.turnStartedAt ? { turnStartedAt: f.turnStartedAt } : {}) } : null,
      external: f.external ? { status: 'idle', client: 'VS Code', pid: 1 } : null,
      queue: f.queue.map((text, i) => ({ id: `q${i}`, text, at: 1 })),
      ...(f.queueHeld ? { queueHeld: true } : {}),
      extra: JSON.parse((db.prepare('select extra from app_sessions where key = ?').get(key) as { extra: string | null } | undefined)?.extra ?? '{}'),
      endedAt: f.endedAt,
      updatedAt: Date.now(),
      ...(f.archived ? { archived: true } : {}),
      ...(f.resumeAt ? { resumeAt: f.resumeAt } : {}),
      ...(f.helpers ? { helpers: f.helpers } : {}),
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

let reviewer = { claim: true, broke: false as boolean | string, final: { ok: true, reason: 'The change meets the goal: score.txt says 10.' } as { ok: boolean; reason: string } | 'error' };
const asked: { system: string; prompt: string; strong?: boolean }[] = [];
/** Runs as a reviewer is asked (a test acts while the final check runs). */
let reviewerHook: ((system: string) => unknown) | undefined;
setReviewer(async (_d, _key, q) => {
  asked.push({ system: q.system, prompt: q.prompt, strong: q.strong });
  await reviewerHook?.(q.system);
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
  assert.equal(file(PLAIN, 'readme.md'), 'hi\n', 'nothing was put back');
  assert.match(last(N), /Last round: not better, and it stays/);
  await rejects(act(N, { action: 'round', n: 1, do: 'undo' }), 409, /worktree/);
  reviewer.claim = true;
  await act(N, { action: 'stop' });
  assert.equal(goal(N).status, 'stopped');
  assert.equal(goal(N).report!.summary, 'Stopped by you during round 2: that round’s work was not checked.');
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
  assert.match(last(L2), /Last round: not kept, and its files were not put back\. Stopped at the limit midway\./);
  assert.equal(file(w.path, 'score.txt'), '7\n', 'the files as the half round left them');
  await turn(L2);
  assert.equal(goal(L2).rounds.at(-1)!.outcome, 'kept', 'the half round’s work, judged now');
  assert.equal(goal(L2).rounds.at(-1)!.results.find((r) => r.id === 'c2')!.value, 7);
  db.prepare('delete from sessions where key = ?').run(L2);
  await act(L2, { action: 'stop' });
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

test('a goal and a team do not combine in this version: a session that leads a swarm, a campaign, a deep research or an arena match is refused', async () => {
  const cases: [string, Record<string, unknown>, string][] = [
    ['claude:goal-g1-swarm', { swarm: true }, 'This session leads a swarm: a goal for a team comes in a later version.'],
    ['claude:goal-g1-campaign', { swarm: 'campaign' }, 'This session leads a campaign: a goal for a team comes in a later version.'],
    ['claude:goal-g1-research', { research: { depth: 'quick' } }, 'This session leads a deep research: a goal for a team comes in a later version.'],
    ['claude:goal-g1-arena', { arena: 'match1' }, 'This session leads an arena match: a goal for a team comes in a later version.'],
  ];
  for (const [key, extra, why] of cases) {
    sessions.add(key, { cwd: PLAIN });
    setSessionExtra(db, key, extra);
    await rejects(act(key, { action: 'set', objective: 'Make it fast' }), 400, new RegExp(`^${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    assert.equal(loadGoal(db, key), null);
    // Nothing for the agent to propose to either.
    assert.equal((await tool(key, 'goal_propose', { checks: CHECKS })).text, 'This session has no goal.');
  }
  assert.equal(teamRefusal({ swarm: false }), null);
  assert.equal(teamRefusal({}), null);
  assert.equal(teamRefusal(undefined), null);
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
  // Never in a scheduled run, a try of an agent's examples, or a session that leads its own work.
  for (const extra of [{ automations: { task: 't', run: 'r' } }, { agentExample: { agent: 'a', run: 'r', example: 'e' } }, { swarm: true }, { swarm: 'campaign' }, { research: { depth: 'quick' } }, { arena: 'match1' }]) {
    assert.equal(goalStartIgnored(extra), true, JSON.stringify(extra));
    assert.equal(spawnOf({ agent: 'claude', cwd: PLAIN, runId: 'rx', resume: false, extra: { ...extra, goal: { start: true } }, prompt: 'x' } as SpawnInfo), undefined, JSON.stringify(extra));
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
  assert.deepEqual(changedChecks([proposed], [{ ...sent, target: { op: '>=', value: 0.9 } }]), ['c1']);
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

// ---- run ---------------------------------------------------------------------------------------------

setTimeout(() => {
  console.error('driver-test: timed out');
  process.exit(1);
}, 240_000).unref();
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
