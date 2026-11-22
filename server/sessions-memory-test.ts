// Script test for a new session that asks to build its project's memory first (SessionManager's holdFirst, answerGate,
// releaseGate, buildReached, resumeGates, liveState, liveSnapshot, send and the queue; the decisions are
// server/wiki/ask-test.ts): the first message is held and the agent has had nothing; the session needs you while it
// asks and shows "building" while it builds, with no second notification; the agent gets the first message when the
// essentials are read, when the job ends, on Start now, Start without memory and Don't ask; a failed build asks again;
// what is sent meanwhile goes after the first message; a message on its way to the agent counts as delivering until
// the agent has it (the goal loop's idle); "Start without memory" keeps the question away for a week; and
// the cards and the waiting come back after a restart, a build that ended meanwhile starting the agent.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-memory-test.ts
//   DATA_DIR=/tmp/hydor-test-mem CLAUDE_CONFIG_DIR=/tmp/hydor-test-mem/claude CODEX_HOME=/tmp/hydor-test-mem/codex node dist/dev/sessions-memory-test.js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvGet, openDb } from './db.ts';
import { config } from './config.ts';
import { SessionManager } from './sessions.ts';
import { createSpace } from './spaces/index.ts';
import { buildApi, SNOOZE_MS, askedNot, loadGates, saveGates } from './wiki/ask.ts';
import type { BuildOffer } from './wiki/areas/build.ts';
import { saveJob, wikiJobEvents, type JobState } from './wiki/areas/jobs.ts';
import { sessionExtra, setSessionExtra } from './sessionExtra.ts';
import { dropGoal, loadGoal, saveGoal } from './goals/store.ts';
import { registerFeatures } from './features/registry.ts';
import { STOPPED_SWARM } from './goals/driver.ts';
import { checkpoint } from './worktrees.ts';
import { execFileSync } from 'node:child_process';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-mem-test-'));
fs.mkdirSync(path.join(process.env.DATA_DIR, 'uploads'), { recursive: true });
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const proto = SessionManager.prototype as any;

const folder = path.join(tmp, 'shop');
fs.mkdirSync(folder);
const space = createSpace(db, { name: 'Shop API', folder });

const offer: BuildOffer = {
  empty: true,
  fresh: true,
  counts: { sessions: 38, commits: 412, documents: 9, notes: 14, files: ['README.md', 'docs/'] },
  worth: true,
  essentials: 12,
  sources: 60,
  minutesEssentials: 5,
  minutesAll: 45,
  helper: { label: 'Automatic', priced: false },
};

const built: { space: string | null; o: any }[] = [];
const stopped: (string | null)[] = [];
let startFails: string | null = null;
buildApi.start = async (_db, sp, o) => {
  built.push({ space: sp, o });
  if (startFails) throw new Error(startFails);
  saveJob(db, sp, { kind: 'build', state: 'running', done: 0, total: 60, startedAt: Date.now(), essentials: 12 });
  return { started: true, sources: 60, essentials: 12 };
};
buildApi.stop = (sp) => {
  stopped.push(sp);
  return true;
};

/** A session of the manager's own methods on a real database, with a stand-in for its agent. */
function manager() {
  const sent: { text: string; images: number }[] = [];
  const notices: any[] = [];
  const emitted: any[][] = [];
  const adapter: any = {
    state: { status: 'idle', startedAt: 1, pendingApprovals: 0 },
    exited: false,
    approvals: new Map(),
    overlay: () => ({ items: [], patches: {}, approvals: [] }),
    sendMessage: async (text: string, images: unknown[]) => {
      sent.push({ text, images: images.length });
      adapter.state = { ...adapter.state, status: 'working' };
    },
  };
  const m: any = Object.create(proto);
  Object.assign(m, {
    db,
    lives: new Map(),
    statuses: new Map(),
    releasing: new Set(),
    userStopped: new Set(),
    queues: new Map(),
    held: new Set(),
    queuesLoaded: false,
    timelines: new Map(),
    external: { get: () => null },
    queueSummary: () => {},
    snapshot: async () => {},
    notify: (n: unknown) => notices.push(n),
    summary: () => ({ title: 'Fix the checkout tests' }),
    emit: (...a: unknown[]) => (emitted.push(a), true),
    start: async (key: string) => {
      m.lives.set(key, { key, adapter, agent: 'claude', cwd: folder });
    },
  });
  const sessions = (key: string) => m.lives.set(key, { key, adapter, agent: 'claude', cwd: folder });
  return { m, adapter, sent, notices, emitted, sessions };
}

/** A new session as create() leaves it when it asks: its row, its agent started, its first message held. */
async function asking(text = 'The checkout tests fail. Find out why.', o: { live?: boolean } = {}) {
  // Sessions left waiting by the tests before are another matter.
  saveGates(db, new Map());
  const h = manager();
  const key = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, first_prompt, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(key, 'claude', folder, text, Date.now(), Date.now());
  setSessionExtra(db, key, { space: space.id, memoryBuild: true });
  if (o.live !== false) h.sessions(key);
  await h.m.holdFirst(key, { space: space.id, name: 'Shop API', offer }, { text, said: text, images: [{ mediaType: 'image/png', data: Buffer.from('png').toString('base64') }] });
  return { ...h, key };
}

const jobBase = (o: Partial<JobState>): JobState => ({ kind: 'build', state: 'running', done: 0, total: 60, startedAt: Date.now(), essentials: 12, ...o });
const live = (h: { m: any }, key: string) => h.m.liveState(key);

test('the first message is held: the agent has had nothing, and the session needs you', async () => {
  const h = await asking();
  assert.deepEqual(h.sent, [], 'nothing went to the agent');
  const g = h.m.gates.get(h.key);
  assert.equal(g.state, 'asking');
  assert.equal(g.images.length, 1);
  assert.ok(fs.existsSync(g.images[0].path), 'its picture is kept');
  assert.equal(live(h, h.key).status, 'waiting');
  assert.equal(live(h, h.key).memory, 'asking');
  assert.equal(live(h, h.key).pendingApprovals, 1);
  const snap = h.m.liveSnapshot(h.key);
  const card = snap.overlay.approvals.find((a: any) => a.memory);
  assert.equal(card.title, 'Build Shop API’s memory first?');
  assert.deepEqual(card.options.map((o: any) => o.id), ['build', 'start', 'never']);
  const mine = snap.overlay.items.find((i: any) => i.kind === 'user');
  assert.equal(mine.text, 'The checkout tests fail. Find out why.');
  assert.equal(mine.meta, undefined, 'no note under the message while it asks');
  assert.equal(h.m.waitingForMemory(h.key), 'asking');
  assert.equal(loadGates(db).has(h.key), true, 'kept in the database');
});

test('it works with no live agent too (its process gone): the card still shows', async () => {
  const h = await asking('hello', { live: false });
  assert.equal(live(h, h.key).status, 'waiting');
  assert.ok(h.m.liveSnapshot(h.key).overlay.approvals.some((a: any) => a.memory));
});

test('the notification comes once: when it starts asking, and not again as it builds', async () => {
  const h = await asking();
  assert.equal(h.notices.length, 1);
  assert.equal(h.notices[0].kind, 'waiting');
  assert.equal(h.notices[0].body, 'Build Shop API’s memory first?');
  assert.equal(h.m.statuses.get(h.key).status, 'waiting', 'what the list watches starts as waiting, so it adds none');
  await h.m.answerGate(h.key, 'build');
  assert.equal(h.notices.length, 1, 'building is working, not waiting');
  assert.equal(live(h, h.key).status, 'working');
});

test('the status is Needs you while it asks and working, marked as building memory, while it builds (the page says so: web/src/lib/activity-test.ts)', async () => {
  const h = await asking();
  assert.equal(live(h, h.key).status, 'waiting');
  assert.equal(live(h, h.key).memory, 'asking');
  await h.m.answerGate(h.key, 'build');
  assert.equal(live(h, h.key).status, 'working');
  const item = h.m.liveSnapshot(h.key).overlay.items.find((i: any) => i.kind === 'user');
  assert.equal(item.meta, 'held', '"Sent to the agent when the memory is ready" under the message');
  assert.equal(h.m.atWork(h.key), true);
  assert.equal(live(h, h.key).memory, 'building');
});

test('Build memory, then start: the build starts with the session left out, and the agent waits for its essentials', async () => {
  built.length = 0;
  const h = await asking();
  await h.m.answerGate(h.key, 'build');
  assert.equal(built.length, 1);
  assert.equal(built[0].space, space.id);
  assert.equal(built[0].o.exclude, h.key, 'the session asking is not read into its own memory');
  assert.equal(h.m.gates.get(h.key).state, 'building');
  assert.deepEqual(h.sent, []);
  wikiJobEvents.emit('essentials', 'another-project');
  await sleep(20);
  assert.deepEqual(h.sent, [], 'another project’s build is not ours');
  // The manager listens in its constructor: here the same handlers are called as it wires them.
  await h.m.buildReached(space.id, 'essentials');
  assert.equal(h.sent.length, 1);
  const first = h.sent[0] as { text: string; images: number };
  assert.match(first.text, /The checkout tests fail\. Find out why\./);
  assert.equal(first.images, 1, 'with its picture');
  assert.equal(h.m.gates.has(h.key), false);
  assert.equal(loadGates(db).has(h.key), false);
  assert.equal(sessionExtra(db, h.key).memoryBuild, undefined, 'no longer marked as waiting for a wiki');
  assert.equal(live(h, h.key).memory, undefined);
  assert.equal(h.m.liveSnapshot(h.key).overlay.approvals.length, 0, 'the card goes');
});

test('the job ending releases it too: done, or stopped from the Memory page', async () => {
  for (const end of ['done', 'stopped']) {
    const h = await asking();
    await h.m.answerGate(h.key, 'build');
    await h.m.buildReached(space.id, end);
    assert.equal(h.sent.length, 1, end);
    assert.equal(h.m.gates.has(h.key), false, end);
  }
});

test('a build that fails before its essentials ends the wait with a card: Start anyway, Try again', async () => {
  built.length = 0;
  const h = await asking();
  await h.m.answerGate(h.key, 'build');
  saveJob(db, space.id, jobBase({ state: 'failed', error: 'The helper could not be reached' }));
  await h.m.buildReached(space.id, 'failed');
  assert.deepEqual(h.sent, [], 'it does not start by itself');
  assert.equal(h.m.gates.get(h.key).state, 'failed');
  assert.equal(live(h, h.key).status, 'waiting', 'it needs you again');
  const card = h.m.liveSnapshot(h.key).overlay.approvals.find((a: any) => a.memory);
  assert.equal(card.memory.error, 'The helper could not be reached');
  assert.deepEqual(card.options.map((o: any) => o.id), ['retry', 'now']);
  await h.m.answerGate(h.key, 'retry');
  assert.equal(built.length, 2, 'the build starts again');
  assert.equal(h.m.gates.get(h.key).state, 'building');
  await h.m.buildReached(space.id, 'failed');
  await h.m.answerGate(h.key, 'now');
  assert.equal(h.sent.length, 1, 'Start anyway');
});

test('a build that cannot start (a 409) is a card too, and the agent can start anyway', async () => {
  const h = await asking();
  startFails = 'It already has articles: use Update now or Rebuild';
  await h.m.answerGate(h.key, 'build');
  startFails = null;
  assert.equal(h.m.gates.get(h.key).state, 'failed');
  assert.match(h.m.gates.get(h.key).error, /already has articles/);
  await h.m.answerGate(h.key, 'now');
  assert.equal(h.sent.length, 1);
});

test('Start now sends the first message and leaves the build going; Stop building stops it', async () => {
  stopped.length = 0;
  const h = await asking();
  await h.m.answerGate(h.key, 'build');
  await h.m.answerGate(h.key, 'now');
  assert.equal(h.sent.length, 1);
  assert.deepEqual(stopped, [], 'the build goes on');
  const g = await asking();
  await g.m.answerGate(g.key, 'build');
  await g.m.answerGate(g.key, 'stop');
  assert.deepEqual(stopped, [space.id]);
  assert.equal(g.sent.length, 1, 'what it wrote stays, and the agent starts');
  const i = await asking();
  await i.m.answerGate(i.key, 'build');
  await i.m.interrupt(i.key);
  assert.deepEqual(stopped, [space.id, space.id], 'Stop in the box does the same');
  assert.equal(i.sent.length, 1);
});

test('Start without memory starts the agent and keeps the question away for a week; Don’t ask for this project, for good', async () => {
  const h = await asking();
  const t = Date.now();
  await h.m.answerGate(h.key, 'start');
  assert.equal(h.sent.length, 1);
  assert.equal(h.m.gates.has(h.key), false);
  assert.equal(askedNot(db, space.id, t + 1000), 'later');
  assert.equal(askedNot(db, space.id, t + SNOOZE_MS + 60_000), null);
  const g = await asking();
  await g.m.answerGate(g.key, 'never');
  assert.equal(g.sent.length, 1);
  assert.equal(askedNot(db, space.id, t + 365 * 24 * 3600_000), 'never');
  assert.equal(kvGet(db, `wiki.ask.${space.id}`), 'never');
});

test('a choice the card does not have is refused, and so is one for a question already answered', async () => {
  const h = await asking();
  await assert.rejects(() => h.m.answerGate(h.key, 'stop'), /not on the card/);
  await assert.rejects(() => h.m.answerGate(h.key, 'bogus'), /not on the card/);
  assert.equal(h.m.gates.has(h.key), true, 'still asking');
  await h.m.answerGate(h.key, 'start');
  await assert.rejects(() => h.m.answerGate(h.key, 'start'), /answered already/);
  // Through the approvals route: the card's id, only while it is asked.
  const g = await asking();
  await g.m.answer(g.key, 'memory-ask', { decision: 'start' });
  assert.equal(g.sent.length, 1);
});

test('what is sent while it waits shows in the session’s summary, as queued messages do', async () => {
  const h = await asking('first message');
  Object.assign(h.m, { runningHelpers: () => new Map(), resumeLookup: undefined, goal: undefined });
  await h.m.send(h.key, 'a follow-up');
  const sum = proto.summary.call(h.m, h.key);
  assert.equal(sum?.queue?.length, 1);
  assert.equal(sum?.queue?.[0].text, 'a follow-up');
  assert.equal(sum?.queueHeld, undefined, 'not paused');
  assert.equal(sum?.live?.memory, 'asking');
  // And it reaches the pages: the list entry the server broadcasts carries the queue.
  const sent: any[][] = [];
  Object.assign(h.m, { pendingSummaries: new Set(), summaryTimer: null, emit: (...a: unknown[]) => (sent.push(a), true), watchStatus: () => {}, queueSummary: proto.queueSummary, flushSummaries: proto.flushSummaries, rowToSummary: proto.rowToSummary, row: proto.row, queueOf: proto.queueOf, loadQueues: proto.loadQueues, liveState: proto.liveState });
  h.m.queueSummary(h.key);
  await sleep(400);
  const upsert = sent.find((e) => e[0] === 'sessions')?.[1]?.find((x: any) => x.key === h.key);
  assert.equal(upsert?.queue?.[0]?.text, 'a follow-up', 'broadcast with its queue');
});

test('what is sent while it waits goes after the first message, in order', async () => {
  const h = await asking('first message');
  await h.m.send(h.key, 'second');
  await h.m.send(h.key, 'third');
  assert.equal(h.sent.length, 0, 'nothing reached the agent, not even when it is idle');
  assert.deepEqual(h.m.queues.get(h.key).map((q: any) => q.text), ['second', 'third']);
  h.m.dispatchQueued(h.key);
  await sleep(30);
  assert.equal(h.sent.length, 0, 'the queue waits while the question does');
  await assert.rejects(() => h.m.sendQueuedNow(h.key, h.m.queues.get(h.key)[0].id), /has not started/);
  await h.m.answerGate(h.key, 'start');
  assert.equal(h.sent.length, 1);
  assert.match(h.sent[0].text, /first message/);
  // The turn ends: the queue goes out, in order.
  h.adapter.state = { ...h.adapter.state, status: 'idle' };
  h.m.dispatchQueued(h.key);
  await sleep(30);
  assert.match(h.sent[1]?.text ?? '', /second/);
  h.adapter.state = { ...h.adapter.state, status: 'idle' };
  h.m.dispatchQueued(h.key);
  await sleep(30);
  assert.match(h.sent[2]?.text ?? '', /third/);
});

test('a message on its way to the agent: the session counts as delivering from the moment it leaves the queue until the agent has it', async () => {
  // The goal loop (server/goals) takes an idle session with an empty queue for one whose round is over: while a queued
  // message is being handed over (the agent started, the worktree's snapshot taken: seconds), it must not look so.
  const h = manager();
  const key = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', folder, Date.now(), Date.now());
  h.sessions(key);
  let release!: () => void;
  h.m.snapshot = () => new Promise<void>((res) => (release = res));
  h.m.enqueue(key, 'the person’s message', [], [], true);
  assert.equal(h.m.delivering(key), false, 'waiting in the queue is not delivering');
  h.m.resumeQueue(key);
  await sleep(20);
  assert.equal(h.m.queues.get(key), undefined, 'taken off the queue');
  assert.equal(h.adapter.state.status, 'idle', 'and the agent is not at work yet');
  assert.equal(h.m.delivering(key), true, 'so the session is delivering');
  release();
  await sleep(20);
  assert.equal(h.sent.at(-1)?.text, 'the person’s message');
  assert.equal(h.m.delivering(key), false, 'the agent has it: working, not delivering');
  // A delivery that fails ends it as well (the message goes back to the person as a toast, as before).
  h.adapter.state = { ...h.adapter.state, status: 'idle' };
  h.m.snapshot = async () => {
    throw new Error('disk full');
  };
  h.m.enqueue(key, 'third');
  await sleep(20);
  assert.equal(h.m.delivering(key), false);
  assert.ok(h.emitted.some((a) => a[0] === 'toast' && /disk full/.test((a[1] as { text: string }).text)));
  // A message sent straight away (send) is on its way the same way, until the agent has it or it fails.
  let done!: () => void;
  h.m.sendNow = () => new Promise<undefined>((res) => (done = () => res(undefined)));
  const sending = h.m.send(key, 'another');
  await sleep(5);
  assert.equal(h.m.delivering(key), true);
  done();
  await sending;
  assert.equal(h.m.delivering(key), false);
  h.m.sendNow = async () => {
    throw new Error('the agent is gone');
  };
  await assert.rejects(h.m.send(key, 'fourth'), /the agent is gone/);
  assert.equal(h.m.delivering(key), false);
});

test('I5: Edit from here with the files put back is refused while the session’s goal has a reset of its own under way', async () => {
  const h = manager();
  const key = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', folder, Date.now(), Date.now());
  h.sessions(key);
  saveGoal(db, {
    key,
    id: 'g1',
    status: 'checking',
    contract: { objective: 'Fast checkout', checks: [], protect: [], limits: { rounds: 3 } },
    settings: { asks: 'forks', noAnswerMin: 10 },
    rounds: [],
    undo: true,
    rules: [],
    next: [],
    dropped: [],
    startedAt: 1,
    spentUsd: 0,
    activeMs: 0,
    _: { spentAtStart: 0, restoreTo: { to: 'abc', n: 2, by: 'undo', at: 1, safety: 'def' } },
  });
  await assert.rejects(h.m.rewind(key, { itemId: 'u1', text: 'Try it again', restoreFiles: true }), (e: any) => e.status === 409 && /goal is putting its files back/.test(e.message));
  // Without putting the files back, the goal is no reason to refuse it (here it fails later, for want of a transcript).
  await assert.rejects(h.m.rewind(key, { itemId: 'u1', text: 'Try it again' }), (e: any) => !/goal is putting its files back/.test(e.message));
  dropGoal(db, key);
});

test('J8: Edit from here checks the goal again right before its reset: a reset the goal began while the conversation was read refuses it, and the files stay as they are', async () => {
  const h = manager();
  const key = `claude:${crypto.randomUUID()}`;
  const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...a], { cwd, stdio: 'pipe' }).toString().trim();
  const repo = path.join(tmp, 'j8-repo');
  fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n');
  git(repo, 'init', '-q', '-b', 'main');
  // The checkpoint's own commit takes the repository's identity (none in a scratch HOME).
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'start');
  const w = { path: path.join(tmp, 'j8-wt'), branch: 'agent/j8', base: 'main', repo };
  git(repo, 'worktree', 'add', '-q', '-b', w.branch, w.path, 'main');
  db.prepare('insert into app_sessions (key, agent, cwd, worktree, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(key, 'claude', w.path, JSON.stringify(w), Date.now(), Date.now());
  db.exec('create table if not exists checkpoints (key text not null, at integer not null, commit_id text not null)');
  const before = (await checkpoint(w))!;
  db.prepare('insert into checkpoints (key, at, commit_id) values (?, ?, ?)').run(key, Date.now() - 1000, before);
  fs.writeFileSync(path.join(w.path, 'a.txt'), 'two\n');
  h.sessions(key);
  const g = {
    key,
    id: 'g1',
    status: 'checking' as const,
    contract: { objective: 'Fast checkout', checks: [], protect: [], limits: { rounds: 3 } },
    settings: { asks: 'forks' as const, noAnswerMin: 10 },
    rounds: [],
    undo: true,
    rules: [],
    next: [],
    dropped: [],
    startedAt: 1,
    spentUsd: 0,
    activeMs: 0,
    _: { spentAtStart: 0 },
  };
  saveGoal(db, g);
  // The goal begins a reset of its own while the conversation is read (after rewind's first look).
  h.m.timeline = async () => {
    saveGoal(db, { ...g, _: { spentAtStart: 0, restoreTo: { to: before, n: 2, by: 'undo', at: Date.now(), safety: before } } });
    return { parser: { items: [{ kind: 'user', id: 'u1', seq: 0, ts: Date.now(), text: 'Make it faster' }] } };
  };
  await assert.rejects(h.m.rewind(key, { itemId: 'u1', text: 'Try it again', restoreFiles: true }), (e: any) => e.status === 409 && /goal is putting its files back/.test(e.message));
  assert.equal(fs.readFileSync(path.join(w.path, 'a.txt'), 'utf8'), 'two\n', 'nothing put back');
  dropGoal(db, key);
  git(repo, 'worktree', 'remove', '--force', w.path);
});

test('after a restart, a session that was asking still asks, and its card comes back', async () => {
  const h = await asking();
  // A new manager over the same database: nothing in memory.
  const again = manager();
  again.sessions(h.key);
  await again.m.resumeGates();
  assert.equal(again.m.gates.get(h.key).state, 'asking');
  assert.equal(again.m.liveState(h.key).status, 'waiting');
  assert.ok(again.m.liveSnapshot(h.key).overlay.approvals.some((a: any) => a.memory?.state === 'asking'));
  assert.deepEqual(again.sent, []);
  await again.m.answerGate(h.key, 'start');
  assert.equal(again.sent.length, 1, 'and it can be answered');
});

test('after a restart while it builds: still building when the build goes on, the agent starts when it reached its essentials or ended', async () => {
  const waiting = async (job: JobState | null) => {
    const h = await asking();
    await h.m.answerGate(h.key, 'build');
    if (job) saveJob(db, space.id, job);
    else db.prepare("delete from kv where k = ?").run(`wiki.job.${space.id}`);
    const again = manager();
    again.sessions(h.key);
    await again.m.resumeGates();
    return { key: h.key, ...again };
  };
  const going = await waiting(jobBase({ state: 'running' }));
  assert.equal(going.m.gates.get(going.key).state, 'building');
  assert.equal(going.m.liveState(going.key).memory, 'building');
  assert.deepEqual(going.sent, []);
  // Its job goes on (resume.ts) and reaches its essentials: the agent starts.
  await going.m.buildReached(space.id, 'essentials');
  assert.equal(going.sent.length, 1);
  const reached = await waiting(jobBase({ state: 'running', essentialsAt: Date.now() }));
  assert.equal(reached.sent.length, 1, 'the essentials were read while the server was down');
  assert.equal(reached.m.gates.has(reached.key), false);
  const ended = await waiting(jobBase({ state: 'done', endedAt: Date.now() }));
  assert.equal(ended.sent.length, 1, 'the job ended while it was down');
  const stoppedJob = await waiting(jobBase({ state: 'stopped' }));
  assert.equal(stoppedJob.sent.length, 1);
  const failed = await waiting(jobBase({ state: 'failed', error: 'No helper' }));
  assert.deepEqual(failed.sent, [], 'a build that failed before its essentials asks again');
  assert.equal(failed.m.gates.get(failed.key).state, 'failed');
  const lost = await waiting(null);
  assert.equal(lost.m.gates.get(lost.key).state, 'failed', 'no job at all: the build never started');
});

test('a session deleted while it waited leaves no card behind', async () => {
  const h = await asking();
  db.prepare('delete from app_sessions where key = ?').run(h.key);
  const again = manager();
  await again.m.resumeGates();
  assert.equal(again.m.gates.has(h.key), false);
  assert.equal(loadGates(db).has(h.key), false);
});

test('a first message that cannot be sent leaves a card to start again', async () => {
  const h = await asking();
  h.adapter.sendMessage = async () => {
    throw new Error('The agent did not start');
  };
  await assert.rejects(() => h.m.answerGate(h.key, 'start'), /did not start/);
  assert.equal(h.m.gates.get(h.key).state, 'failed');
  assert.match(h.m.gates.get(h.key).error, /did not start/);
});

test('the real manager listens to the wiki jobs: essentials reached, a job that ends', async () => {
  const { EventEmitter } = await import('node:events');
  const sm: any = new SessionManager(db, new EventEmitter() as any, {} as any, {} as any);
  const h = manager();
  const key = `claude:${crypto.randomUUID()}`;
  saveGates(db, new Map());
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', folder, Date.now(), Date.now());
  Object.assign(sm, { snapshot: async () => {}, notify: () => {}, queueSummary: () => {}, start: async () => {} });
  sm.lives.set(key, { key, adapter: h.adapter, agent: 'claude', cwd: folder });
  await sm.holdFirst(key, { space: space.id, name: 'Shop API', offer }, { text: 'hello there', said: 'hello there', images: [] });
  await sm.answerGate(key, 'build');
  assert.deepEqual(h.sent, []);
  wikiJobEvents.emit('essentials', space.id);
  await sleep(50);
  assert.equal(h.sent.length, 1, 'the essentials event started the agent');
  const other = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(other, 'claude', folder, Date.now(), Date.now());
  sm.lives.set(other, { key: other, adapter: h.adapter, agent: 'claude', cwd: folder });
  await sm.holdFirst(other, { space: space.id, name: 'Shop API', offer }, { text: 'second one', said: 'second one', images: [] });
  await sm.answerGate(other, 'build');
  wikiJobEvents.emit('end', space.id, 'done');
  await sleep(50);
  assert.equal(h.sent.length, 2, 'the end event started it too');
});

/** create() with a stand-in for the agent's start: what it does with the first message of a person's session. */
async function created(o: Record<string, unknown>, over: Record<string, unknown> = {}) {
  const h = manager();
  saveGates(db, new Map());
  // What the tests before left of the choices and the jobs is not this one's.
  db.prepare("delete from kv where k like 'wiki.ask.%' or k like 'wiki.job.%'").run();
  const key = `claude:${crypto.randomUUID()}`;
  const spawned: any[] = [];
  Object.assign(h.m, {
    spawn: async (_agent: string, _cwd: string, opts: any) => {
      spawned.push(opts);
      h.sessions(key);
      return { key, adapter: h.adapter, agent: 'claude', cwd: folder };
    },
    controlFor: () => ({}),
    savePrefs: () => {},
    queueAncestors: () => {},
    autoSwitch: () => false,
    freeAccount: async () => null,
    ...over,
  });
  const k = await h.m.create({ agent: 'codex', cwd: folder, prompt: 'Fix the checkout tests', ...o });
  return { ...h, key: k, spawned };
}

test('create(): a person’s session in a project with an empty wiki holds its message and spawns the agent as before', async () => {
  buildApi.offer = async () => offer;
  const h = await created({ askMemory: true, extra: { space: space.id } });
  assert.deepEqual(h.sent, [], 'no first message');
  assert.equal(h.m.gates.get(h.key).state, 'asking');
  assert.equal(h.spawned.length, 1, 'the agent is spawned');
  assert.equal(h.spawned[0].extra.memoryBuild, true, 'told of the wiki to come when it starts (spawn)');
  assert.equal(sessionExtra(db, h.key).memoryBuild, true);
  await h.m.answerGate(h.key, 'start');
  assert.equal(h.sent.length, 1);
  assert.equal(sessionExtra(db, h.key).memoryBuild, undefined);
});

test('create(): the project is found from the folder when the page does not say it', async () => {
  buildApi.offer = async () => offer;
  const h = await created({ askMemory: true });
  assert.equal(h.m.gates.get(h.key)?.project, space.id);
});

test('create(): a Codex session with no model starts on the catalog’s default model, which is not remembered as the picked one', async () => {
  buildApi.offer = async () => null as any;
  const models = [
    { value: 'gpt-6-astra', label: 'GPT-6 Astra' },
    { value: 'gpt-5.5', label: 'GPT-5.5', isDefault: true },
  ];
  const saved: any[] = [];
  const over = { controlFor: () => ({ models: async () => models }), savePrefs: (_agent: string, p: any) => saved.push(p) };
  // None named: the catalog's default starts it, and its row says so; the remembered model stays unnamed.
  let h = await created({}, over);
  assert.equal(h.spawned[0].model, 'gpt-5.5');
  assert.equal((db.prepare('select model from app_sessions where key = ?').get(h.key) as any).model, 'gpt-5.5');
  assert.equal(saved.at(-1).model, undefined, 'not remembered as the user’s pick');
  // One named: as it is, and remembered.
  h = await created({ model: 'gpt-6-astra' }, over);
  assert.equal(h.spawned[0].model, 'gpt-6-astra');
  assert.equal(saved.at(-1).model, 'gpt-6-astra');
  // Automatic has its own rule: the default is not put in.
  h = await created({ model: 'auto' }, over);
  assert.equal(h.spawned[0].model, undefined);
  // A catalog with no default, or that cannot be read: as before (Codex picks).
  h = await created({}, { ...over, controlFor: () => ({ models: async () => [models[0]] }) });
  assert.equal(h.spawned[0].model, undefined);
  h = await created({}, { ...over, controlFor: () => ({ models: async () => Promise.reject(new Error('codex did not start')) }) });
  assert.equal(h.spawned[0].model, undefined);
});

test('create(): it sends at once when it does not ask: started by something else, not a person’s prompt, a handoff, memory off, no job to read', async () => {
  buildApi.offer = async () => offer;
  const sentAtOnce = async (o: Record<string, unknown>, why: string) => {
    const h = await created(o);
    assert.equal(h.sent.length, 1, why);
    assert.equal(h.m.gates.has(h.key), false, why);
  };
  await sentAtOnce({ extra: { space: space.id } }, 'the start page did not say a person started it (a script, the API)');
  await sentAtOnce({ askMemory: true, extra: { space: space.id, automations: { task: 'x' } } }, 'a scheduled run');
  await sentAtOnce({ askMemory: true, extra: { space: space.id, app: 'a1' } }, 'an app run');
  await sentAtOnce({ askMemory: true, extra: { space: space.id, parent: 'claude:abcd1234' } }, 'a subagent');
  await sentAtOnce({ askMemory: true, extra: { space: space.id, memory: false } }, 'memory off for it');
  await sentAtOnce({ askMemory: true, extra: { space: space.id }, prompt: '<conversation-handoff from="claude" session="claude:abcd1234" title="Earlier" messages="2" omitted="0">\nUser: hi\n</conversation-handoff>\n\nGo on.' }, 'a handoff');
  buildApi.offer = async () => ({ ...offer, empty: false, fresh: false });
  await sentAtOnce({ askMemory: true, extra: { space: space.id } }, 'a wiki with articles');
  buildApi.offer = async () => offer;
  const none = createSpace(db, { name: 'Elsewhere', folder: (() => { const f = path.join(tmp, 'elsewhere'); fs.mkdirSync(f); return f; })() });
  const h = await created({ askMemory: true, cwd: path.join(tmp, 'not-a-project'), extra: {} });
  assert.equal(h.sent.length, 1, 'not in a project');
  void none;
});

test('create() with a goal: in Plan mode the session starts plain and the person hears why; minutes that are not whole refuse it before it starts', async () => {
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => void warned.push(a.join(' '));
  let h: Awaited<ReturnType<typeof created>>;
  try {
    h = await created({ mode: 'plan', extra: { goal: { start: true, asks: 'own' } } });
  } finally {
    console.warn = warn;
  }
  assert.equal(h.spawned[0].extra?.goal, undefined, 'no goal goes with the first message');
  assert.equal(sessionExtra(db, h.key).goal, undefined);
  const n = h.notices.find((x: any) => x.kind === 'waiting' && x.key === h.key);
  assert.equal(n?.body, 'The goal was not set: the session is in Plan mode, where it changes nothing: switch to another mode first.');
  assert.equal(n?.title, 'Fix the checkout tests');
  assert.ok(warned.some((w) => w.includes(h.key) && w.includes('not set at its start')), 'and in the log');
  // Whole minutes only: refused with a sentence, and no session is made.
  await assert.rejects(created({ extra: { goal: { start: true, noAnswerMin: 0.1 } } }), (e: any) => e.status === 400 && /whole number from 0 to 1440/.test(e.message));
  // In a scheduled run it is ignored without a word, as before.
  const quiet = await created({ mode: 'plan', extra: { goal: { start: true }, automations: { task: 't', run: 'r' } } });
  assert.equal(quiet.notices.some((x: any) => /goal was not set/.test(x.body ?? '')), false);
});

/** Runs `fn` with the capabilities' deps registered (the goal loop takes them), as the app has them once it is up. */
async function withDeps<T>(h: { m: any }, fn: () => Promise<T>): Promise<T> {
  registerFeatures([], { db, sessions: h.m, broadcast: () => {}, publicBase: () => 'https://naget.test' } as any);
  try {
    return await fn();
  } finally {
    registerFeatures([], null as any);
  }
}

test('S1: create() with a goal and a swarm sets the goal (its first message carries the draft); with a campaign, a deep research or an arena match the person hears why it was not set', async () => {
  const h0 = manager();
  const h = await withDeps(h0, () => created({ extra: { swarm: true, goal: { start: true, asks: 'own' } } }));
  assert.ok(h.spawned[0].extra?.goal?.start, 'the draft goes with the first message');
  assert.equal(loadGoal(db, h.key)?.status, 'drafting');
  assert.equal(h.notices.some((x: any) => /goal was not set/.test(x.body ?? '')), false);
  dropGoal(db, h.key);
  for (const [extra, why] of [
    [{ swarm: 'campaign' }, 'The goal was not set: this session leads a campaign: a goal works with a swarm, not with a campaign yet.'],
    [{ research: { depth: 'quick' } }, 'The goal was not set: this session leads a deep research: a goal does not go with it.'],
    [{ arena: 'match1' }, 'The goal was not set: this session is in an arena match: a goal does not go with it.'],
  ] as const) {
    const warn = console.warn;
    console.warn = () => {};
    let c: Awaited<ReturnType<typeof created>>;
    try {
      c = await created({ extra: { ...extra, goal: { start: true } } });
    } finally {
      console.warn = warn;
    }
    assert.equal(c.spawned[0].extra?.goal, undefined, 'no goal goes with the first message');
    assert.equal(loadGoal(db, c.key), null);
    assert.equal(c.notices.find((x: any) => x.kind === 'waiting' && x.key === c.key)?.body, why);
  }
});

test('S5.2, R6: the session’s Stop all pauses the goal whose round is at work, even with the session between turns: a swarm’s lead with its sentence, a session without subagents with a stopped turn’s', async () => {
  for (const [swarm, status, reason] of [
    [true, 'paused', STOPPED_SWARM],
    [false, 'paused', 'You stopped the agent.'],
  ] as const) {
    const h = manager();
    const key = `claude:${crypto.randomUUID()}`;
    db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', folder, Date.now(), Date.now());
    if (swarm) setSessionExtra(db, key, { swarm: true });
    h.sessions(key);
    Object.assign(h.m, { heldDone: new Map(), holdQueue: () => {} });
    saveGoal(db, {
      key,
      id: 'g1',
      status: 'working',
      round: 2,
      contract: { objective: 'Fast checkout', checks: [], protect: [], limits: { rounds: 5 } },
      settings: { asks: 'own', noAnswerMin: 10 },
      rounds: [],
      undo: true,
      rules: [],
      next: [],
      dropped: [],
      startedAt: 1,
      spentUsd: 0,
      activeMs: 0,
      _: { spentAtStart: 0, activeSince: Date.now() },
    });
    await withDeps(h, () => h.m.stopAll(key));
    const g = loadGoal(db, key)!;
    assert.deepEqual([g.status, g.reason], [status, reason], String(swarm));
    dropGoal(db, key);
  }
});

test('create(): a Codex session asks like the others', async () => {
  buildApi.offer = async () => offer;
  const h = await created({ agent: 'codex', askMemory: true, extra: { space: space.id } });
  assert.deepEqual(h.sent, [], 'its message is held');
  assert.equal(h.m.gates.get(h.key).state, 'asking');
});

test('create(): with no first message there is nothing to hold or ask', async () => {
  buildApi.offer = async () => offer;
  const h = await created({ askMemory: true, prompt: '', extra: { space: space.id } });
  assert.equal(h.m.gates.has(h.key), false);
  assert.equal(h.spawned[0].extra.memoryBuild, undefined);
});

test('the idle reaper leaves a session alone while it waits on the question or the build, in any state', async () => {
  const saved = config.idleStopMs;
  config.idleStopMs = 1000;
  try {
    for (const state of ['asking', 'building', 'failed'] as const) {
      const h = await asking();
      h.m.gates.get(h.key).state = state;
      let stoppedBy = 0;
      h.adapter.stop = () => stoppedBy++;
      h.adapter.lastActivity = Date.now() - 4 * 3600_000;
      h.m.reapIdle();
      assert.equal(stoppedBy, 0, `${state}: not stopped after hours`);
    }
    // The same session once it is answered and idle for hours is reaped as any other.
    const h = await asking();
    await h.m.answerGate(h.key, 'start');
    h.adapter.state = { ...h.adapter.state, status: 'idle' };
    let stoppedBy = 0;
    h.adapter.stop = () => stoppedBy++;
    h.adapter.lastActivity = Date.now() - 4 * 3600_000;
    h.m.reapIdle();
    assert.equal(stoppedBy, 1, 'after the gate is gone it is an idle session like any other');
  } finally {
    config.idleStopMs = saved;
  }
});

test('an agent that ended before its first message is started again as it was, with the message as its request', async () => {
  const h = await asking('Fix the checkout tests', { live: false });
  const calls: unknown[][] = [];
  h.m.start = async (...a: unknown[]) => {
    calls.push(a);
    h.sessions(h.key);
  };
  await h.m.answerGate(h.key, 'start');
  assert.equal(calls.length, 1, 'started once');
  assert.equal(calls[0][0], h.key);
  assert.equal(calls[0][2], 'Fix the checkout tests', 'its first message is the request the capabilities read');
  assert.equal(h.sent.length, 1);
  // Its process is still listed but exited: dropped, then started again.
  const g = await asking('hello again');
  g.adapter.exited = true;
  const again: unknown[][] = [];
  g.m.start = async (...a: unknown[]) => {
    again.push(a);
    g.adapter.exited = false;
    g.sessions(g.key);
  };
  await g.m.answerGate(g.key, 'start');
  assert.equal(again.length, 1, 'an exited agent is not sent to');
  assert.equal(g.sent.length, 1);
});

test('start() with no transcript yet resumes nothing: Claude Code starts afresh under the same id and gets the request', async () => {
  const key = `claude:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(key, 'claude', folder, Date.now(), Date.now());
  const spawned: any[] = [];
  const m: any = Object.create(proto);
  Object.assign(m, { db, lives: new Map(), external: { get: () => null }, summary: () => ({ prefs: {} }), sessionCwd: () => folder, transcriptFor: () => path.join(tmp, 'none.jsonl'), accountOf: () => undefined, accountOf2: undefined, spawn: async (...a: unknown[]) => (spawned.push(a), { key }) });
  await m.start(key, {}, 'Fix the checkout tests');
  assert.equal(spawned.length, 1);
  assert.equal(spawned[0][0], 'claude');
  assert.equal(spawned[0][2].sessionId, key.slice(7), 'the same session id');
  assert.equal(spawned[0][2].resume, false, 'no transcript: nothing to resume');
  assert.equal(spawned[0][2].prompt, 'Fix the checkout tests');
});

test('an agent that cannot be started again says so on the card (not a build failure), and Try again starts it', async () => {
  const h = await asking('hello', { live: false });
  let fail = true;
  h.m.start = async () => {
    if (fail) throw new Error('Codex did not start: no rollout found for thread');
    h.sessions(h.key);
  };
  await assert.rejects(() => h.m.answerGate(h.key, 'start'), /did not start/);
  const g = h.m.gates.get(h.key);
  assert.equal(g.state, 'failed');
  assert.equal(g.startFailed, true);
  const card = h.m.liveSnapshot(h.key).overlay.approvals.find((a: any) => a.memory);
  assert.equal(card.memory.startFailed, true);
  assert.match(card.memory.error, /no rollout/);
  assert.deepEqual(card.options.map((o: any) => o.id), ['new', 'now'], 'no build to retry: a new session, or the start again');
  assert.equal(card.options[0].label, 'Start in a new session');
  assert.equal(card.options[0].style, 'primary');
  assert.equal(card.options[1].label, 'Try again');
  await assert.rejects(() => h.m.answerGate(h.key, 'retry'), /not on the card/);
  assert.deepEqual(h.sent, [], 'nothing was sent');
  fail = false;
  await h.m.answerGate(h.key, 'now');
  assert.equal(h.sent.length, 1, 'and the message goes once it can start');
  assert.equal(h.m.gates.has(h.key), false);
});

test('Start in a new session: the same settings, the first message with its picture, the queue moved after it, the old one archived, the new key returned', async () => {
  const h = await asking('Fix the checkout tests', { live: false });
  db.prepare('update app_sessions set model = ?, effort = ?, mode = ?, account = ?, title = ?, agent = ? where key = ?').run('gpt-x', 'high', 'auto', 'acct1', 'Checkout', 'codex', h.key);
  setSessionExtra(db, h.key, { space: space.id, capUsd: 3 });
  h.m.start = async () => {
    throw new Error('no rollout found for thread id abc');
  };
  await h.m.send(h.key, 'second');
  await h.m.send(h.key, 'third');
  await assert.rejects(() => h.m.answerGate(h.key, 'start'), /no rollout/);
  assert.equal(h.m.gates.get(h.key).startFailed, true);
  const made: any[] = [];
  const newKey = `codex:${crypto.randomUUID()}`;
  db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(newKey, 'codex', folder, Date.now(), Date.now());
  h.m.create = async (o: any) => (made.push(o), newKey);
  const r = await h.m.answer(h.key, 'memory-ask', { decision: 'new' });
  assert.deepEqual(r, { key: newKey }, 'answers with the new key');
  assert.equal(made.length, 1);
  const o = made[0];
  assert.equal(o.agent, 'codex');
  assert.equal(o.cwd, folder);
  assert.equal(o.prompt, 'Fix the checkout tests', 'the held first message');
  assert.equal(o.images.length, 1, 'with its picture');
  assert.equal(o.images[0].mediaType, 'image/png');
  assert.equal([o.model, o.effort, o.mode, o.account, o.title].join(), 'gpt-x,high,auto,acct1,Checkout');
  assert.equal(o.extra.space, space.id);
  assert.equal(o.extra.capUsd, 3);
  assert.equal(o.extra.memoryBuild, undefined, 'not told of a wiki to come');
  assert.equal(o.askMemory, undefined, 'it does not ask again');
  assert.equal(h.m.gates.has(h.key), false);
  assert.equal(loadGates(db).has(h.key), false);
  assert.deepEqual(h.m.queues.get(newKey).map((q: any) => q.text), ['second', 'third'], 'the queue moved, in order');
  assert.equal(h.m.queues.has(h.key), false);
  assert.equal((db.prepare('select count(*) n from queued where key = ?').get(h.key) as any).n, 0);
  assert.equal((db.prepare('select count(*) n from queued where key = ?').get(newKey) as any).n, 2);
  assert.equal((db.prepare('select archived from app_sessions where key = ?').get(h.key) as any).archived, 1, 'the old one is archived');
  assert.equal(sessionExtra(db, h.key).memoryBuild, undefined);
});

test('Start in a new session from a worktree makes a new worktree of its repository and puts the old one away', async () => {
  const h = await asking('hello', { live: false });
  const wt = { path: path.join(tmp, 'wt-old'), branch: 'agent/x', base: 'main', repo: folder };
  db.prepare('update app_sessions set worktree = ?, cwd = ? where key = ?').run(JSON.stringify(wt), wt.path, h.key);
  h.m.start = async () => {
    throw new Error('did not start');
  };
  await assert.rejects(() => h.m.answerGate(h.key, 'start'), /did not start/);
  const made: any[] = [];
  const dropped: unknown[][] = [];
  h.m.create = async (o: any) => (made.push(o), `claude:${crypto.randomUUID()}`);
  h.m.dropWorktree = async (...a: unknown[]) => (dropped.push(a), {});
  await h.m.answerGate(h.key, 'new');
  assert.equal(made[0].worktree, true);
  assert.equal(made[0].cwd, folder, 'from the main checkout, not the old worktree');
  assert.deepEqual(dropped, [[h.key, { deleteBranch: true }]]);
});

test('Start in a new session is for a failed start only, and a new session that cannot be made leaves the card', async () => {
  const h = await asking('hello', { live: false });
  await assert.rejects(() => h.m.answerGate(h.key, 'new'), /not on the card/);
  h.m.start = async () => {
    throw new Error('did not start');
  };
  await assert.rejects(() => h.m.answerGate(h.key, 'start'), /did not start/);
  h.m.create = async () => {
    throw new Error('Folder not found');
  };
  await assert.rejects(() => h.m.answerGate(h.key, 'new'), /Folder not found/);
  assert.equal(h.m.gates.get(h.key)?.startFailed, true, 'the card stays');
  assert.equal((db.prepare('select archived from app_sessions where key = ?').get(h.key) as any).archived ?? 0, 0);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`not ok - ${name}`);
    console.error(e);
    process.exitCode = 1;
    break;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
process.exit();
