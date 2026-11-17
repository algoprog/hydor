// Script test for how a session moves to another account at the plan's usage limit (SessionManager.afterTurn,
// switchAtLimit, switchForSubagents, beforeResume), above all for its own background subagents the limit stopped:
// a turn the agent starts by itself on a subagent's notice and the limit refuses at once is a "quick turn" that still
// counts; the move waits for subagents still at work; a session that is idle with subagents stopped at the limit moves
// too; and what it tells the agent names them.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-limit-test.ts
//   DATA_DIR=/tmp/hydor-test-limit CLAUDE_CONFIG_DIR=/tmp/hydor-test-limit/claude CODEX_HOME=/tmp/hydor-test-limit/codex node dist/dev/sessions-limit-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from './db.ts';
import { SessionManager, subagentsLine } from './sessions.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-limit-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const KEY = 'claude:00000000-0000-0000-0000-000000000001';
const proto = SessionManager.prototype as any;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const okLimited = { ok: true, limited: { label: 'x', resetsAt: null }, windows: [] };

type Task = { status: string; kind: string; description: string };
const agentTask = (description: string, status = 'running'): Task => ({ status, kind: 'local_agent', description });

/** A stand-in for a running Claude Code session's adapter. */
function fakeAdapter(status = 'idle') {
  return { tasks: new Map<string, Task>(), limitTasks: new Map<string, string>(), state: { status }, limitStopped: undefined as boolean | undefined, exited: false };
}

/** The manager's own methods, with stand-ins for everything that would reach an agent, an account or the network. */
function manager(opts: { adapter?: ReturnType<typeof fakeAdapter>; free?: { id: string } | null; usage?: unknown } = {}) {
  const adapter = opts.adapter ?? fakeAdapter();
  const calls = {
    switchAtLimit: [] as unknown[][],
    switchForSubagents: [] as unknown[][],
    carryOver: [] as unknown[][],
    delivered: [] as string[],
    usageOf: [] as unknown[][],
    toasts: [] as unknown[],
  };
  let from: string | undefined = 'a';
  const m: any = {
    db,
    lives: new Map([[KEY, { adapter }]]),
    statuses: new Map(),
    endedTurns: new Map(),
    limitHits: new Set<string>(),
    limitEnds: new Map(),
    switching: new Set<string>(),
    userStopped: new Set<string>(),
    moveNotes: new Map<string, string>(),
    limitAfter: new Map(),
    onLimited: () => {},
    resumeLookup: undefined as undefined | ((k: string) => number | undefined),
    external: { get: () => null },
    // What watchStatus would otherwise run for real.
    notify: () => {},
    keepEnding: () => {},
    helpersAtWork: () => false,
    runningHelpers: () => new Map(),
    lastReply: () => null,
    queueSummary: () => {},
    leaveCredit: async () => {},
    setFlags: () => {},
    emit: (...a: unknown[]) => {
      if (a[0] === 'toast') calls.toasts.push(a[1]);
      return true;
    },
    controlFor: () => ({ lastUsage: { limited: null } }),
    accountOf: () => from,
    accountName: (_agent: string, id: string | undefined) => `Account ${id ?? 'default'}`,
    usageOf: async (...a: unknown[]) => {
      calls.usageOf.push(a);
      return opts.usage;
    },
    freeAccount: async () => (opts.free === undefined ? { id: 'b' } : opts.free),
    carryOver: async (...a: unknown[]) => {
      calls.carryOver.push(a);
      return false;
    },
    deliverOrQueue: async (_key: string, text: string) => {
      calls.delivered.push(text);
    },
    toCredit: async () => false,
    resumeAfterLimit: async () => {},
  };
  m.afterTurn = proto.afterTurn.bind(m);
  m.afterLimit = proto.afterLimit.bind(m);
  m.switchAtLimit = proto.switchAtLimit.bind(m);
  m.switchForSubagents = proto.switchForSubagents.bind(m);
  m.subagentsAtWork = proto.subagentsAtWork.bind(m);
  m.subagentsToContinue = proto.subagentsToContinue.bind(m);
  // The real waiting, with short timings.
  m.subagentsStop = (key: string) => proto.subagentsStop.call(m, key, 300, 20);
  m.takeMoveNote = proto.takeMoveNote.bind(m);
  return {
    m,
    adapter,
    calls,
    setFrom: (a: string | undefined) => (from = a),
    watchStatus: proto.watchStatus.bind(m) as (list: unknown[]) => void,
    switchAtLimit: proto.switchAtLimit.bind(m) as (key: string, resetsAt: number | undefined) => Promise<unknown>,
    switchForSubagents: proto.switchForSubagents.bind(m) as (key: string) => Promise<unknown>,
    beforeResume: proto.beforeResume.bind(m) as (key: string) => Promise<boolean>,
    resumeAfterLimit: proto.resumeAfterLimit.bind(m) as (key: string, resetsAt: number | undefined) => Promise<unknown>,
    takeMoveNote: m.takeMoveNote as (key: string, text: string) => string,
  };
}

const summary = (status: string, extra: Record<string, unknown> = {}) => ({ key: KEY, agent: 'claude', cwd: tmp, title: 'A session', account: 'a', live: { status }, ...extra });

/** Records watchStatus's calls to the two moves instead of running them. */
function recording(t: ReturnType<typeof manager>) {
  t.m.switchAtLimit = (...a: unknown[]) => (t.calls.switchAtLimit.push(a), Promise.resolve());
  t.m.switchForSubagents = (...a: unknown[]) => (t.calls.switchForSubagents.push(a), Promise.resolve());
}

/** A turn that began and ended between two looks at the session. */
function quickTurn(t: ReturnType<typeof manager>, extra: Record<string, unknown> = {}) {
  t.m.statuses.set(KEY, { status: 'idle', turnStart: 0 });
  t.m.endedTurns.set(KEY, Date.now() - 500);
  t.watchStatus([summary('idle', extra)]);
}

// ---- watchStatus -> afterTurn ---------------------------------------------------------

test('a quick turn that hit the limit moves the session, once, and forgets the hit', () => {
  const t = manager();
  recording(t);
  t.m.limitHits.add(KEY);
  quickTurn(t);
  assert.equal(t.calls.switchAtLimit.length, 1);
  assert.equal(t.calls.switchAtLimit[0][0], KEY);
  assert.equal(t.calls.switchForSubagents.length, 0);
  assert.equal(t.m.limitHits.has(KEY), false);
  assert.ok(t.m.limitEnds.has(KEY), 'the turn end at the limit is noted');
});

test('a quick turn without a hit but with subagents the limit stopped moves it for them', () => {
  const t = manager();
  recording(t);
  t.adapter.limitTasks.set('t1', 'Check the logs');
  quickTurn(t);
  assert.equal(t.calls.switchAtLimit.length, 0);
  assert.equal(t.calls.switchForSubagents.length, 1);
  assert.equal(t.calls.switchForSubagents[0][0], KEY);
});

test('a quick turn with neither moves nothing', () => {
  const t = manager();
  recording(t);
  quickTurn(t);
  assert.equal(t.calls.switchAtLimit.length, 0);
  assert.equal(t.calls.switchForSubagents.length, 0);
});

test('nothing moves with Switch accounts off, for an external session, for acp, without onLimited, or with a resume set', () => {
  const cases: [string, (t: ReturnType<typeof manager>) => Record<string, unknown>][] = [
    ['external', () => ({ external: { client: 'VS Code', status: 'idle' } })],
    ['acp', () => ({ agent: 'acp' })],
    ['no onLimited', (t) => ((t.m.onLimited = undefined), {})],
    ['resume set', (t) => ((t.m.resumeLookup = () => 123), {})],
  ];
  for (const [name, setup] of cases) {
    const t = manager();
    recording(t);
    t.adapter.limitTasks.set('t1', 'A');
    t.m.limitHits.add(KEY);
    quickTurn(t, setup(t));
    assert.equal(t.calls.switchAtLimit.length + t.calls.switchForSubagents.length, 0, name);
  }
  kvSet(db, 'auto_switch', '0');
  try {
    const t = manager();
    recording(t);
    t.adapter.limitTasks.set('t1', 'A');
    t.m.limitHits.add(KEY);
    quickTurn(t);
    assert.equal(t.calls.switchAtLimit.length + t.calls.switchForSubagents.length, 0, 'Switch accounts off');
  } finally {
    kvSet(db, 'auto_switch', '1');
  }
});

test('a normal turn end (working to idle) with a hit moves the session', () => {
  const t = manager();
  recording(t);
  t.m.limitHits.add(KEY);
  t.m.statuses.set(KEY, { status: 'working', turnStart: Date.now() });
  t.watchStatus([summary('idle')]);
  assert.equal(t.calls.switchAtLimit.length, 1);
  assert.equal(t.calls.switchForSubagents.length, 0);
  assert.equal(t.m.limitHits.has(KEY), false);
});

test('a normal turn end without a hit moves nothing, with subagents stopped at the limit it moves for them', () => {
  const t = manager();
  recording(t);
  t.m.statuses.set(KEY, { status: 'working', turnStart: Date.now() });
  t.watchStatus([summary('idle')]);
  assert.equal(t.calls.switchAtLimit.length + t.calls.switchForSubagents.length, 0);
  t.adapter.limitTasks.set('t1', 'A');
  t.m.statuses.set(KEY, { status: 'working', turnStart: Date.now() });
  t.watchStatus([summary('idle')]);
  assert.equal(t.calls.switchForSubagents.length, 1);
});

// ---- switchAtLimit --------------------------------------------------------------------

test('switchAtLimit waits for a subagent still at work, then moves and names the ones the limit stopped', async () => {
  const t = manager();
  const task = agentTask('Check the logs');
  t.adapter.tasks.set('t1', task);
  setTimeout(() => {
    task.status = 'failed';
    t.adapter.limitTasks.set('t1', 'Check the logs');
  }, 100);
  const started = Date.now();
  await t.switchAtLimit(KEY, undefined);
  assert.ok(Date.now() - started >= 90, 'it waited');
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b']]);
  assert.equal(t.calls.delivered.length, 1);
  const msg = t.calls.delivered[0];
  assert.ok(msg.includes('reached its usage limit, so this session now runs on Account b'), msg);
  assert.ok(msg.includes('"Check the logs"'), msg);
  assert.ok(msg.includes('SendMessage'), msg);
  assert.equal(t.m.switching.has(KEY), false, 'the move is over');
});

test('switchAtLimit names the subagents the limit stopped and the ones still at work, once each', async () => {
  const t = manager();
  t.adapter.limitTasks.set('t1', 'Check the logs');
  t.adapter.limitTasks.set('t2', 'Read the docs');
  t.adapter.tasks.set('t3', agentTask('Read the docs'));
  const stopping = setTimeout(() => t.adapter.tasks.get('t3')!.status === 'running' && (t.adapter.tasks.get('t3')!.status = 'stopped'), 60);
  await t.switchAtLimit(KEY, undefined);
  clearTimeout(stopping);
  const msg = t.calls.delivered[0];
  assert.ok(msg.includes('"Check the logs" and "Read the docs"'), msg);
  assert.equal(msg.split('"Read the docs"').length, 2, 'named once');
});

test('switchAtLimit does not move when, while it waited, a turn got through (limitStopped false)', async () => {
  const t = manager();
  const task = agentTask('A');
  t.adapter.tasks.set('t1', task);
  setTimeout(() => {
    t.adapter.limitStopped = false;
    task.status = 'completed';
  }, 100);
  await t.switchAtLimit(KEY, undefined);
  assert.equal(t.calls.carryOver.length, 0);
  assert.equal(t.calls.delivered.length, 0);
});

test('switchAtLimit does not move when, while it waited, you stopped the session', async () => {
  const t = manager();
  const task = agentTask('A');
  t.adapter.tasks.set('t1', task);
  setTimeout(() => {
    t.m.userStopped.add(KEY);
    task.status = 'stopped';
  }, 100);
  await t.switchAtLimit(KEY, undefined);
  assert.equal(t.calls.carryOver.length, 0);
  assert.equal(t.calls.delivered.length, 0);
});

test('switchAtLimit does not move when, while it waited, the session moved to another account', async () => {
  const t = manager();
  const task = agentTask('A');
  t.adapter.tasks.set('t1', task);
  setTimeout(() => {
    t.setFrom('c');
    task.status = 'stopped';
  }, 100);
  await t.switchAtLimit(KEY, undefined);
  assert.equal(t.calls.carryOver.length, 0);
});

test('switchAtLimit with nothing to wait for moves at once, whatever limitStopped says', async () => {
  const t = manager();
  t.adapter.limitStopped = false;
  t.m.userStopped.add(KEY);
  await t.switchAtLimit(KEY, undefined);
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b']]);
  assert.ok(!t.calls.delivered[0].includes('subagent'), 'no subagent line without subagents');
});

test('switchAtLimit also waits while the turn the agent starts on a notice is working', async () => {
  const t = manager();
  t.adapter.state.status = 'working';
  setTimeout(() => (t.adapter.state.status = 'idle'), 100);
  const started = Date.now();
  await t.switchAtLimit(KEY, undefined);
  assert.ok(Date.now() - started >= 90, 'it waited');
  assert.equal(t.calls.carryOver.length, 1);
});

// ---- switchAtLimit: how the session carries on -----------------------------------------

/** Makes switchAtLimit wait for a subagent at work, which `during` changes after 100 ms. */
function waitsFor(t: ReturnType<typeof manager>, during: (done: () => void) => void) {
  const task = agentTask('A');
  t.adapter.tasks.set('t1', task);
  setTimeout(() => during(() => (task.status = 'stopped')), 100);
}

test('switchAtLimit says it moved to the other account', async () => {
  const t = manager();
  assert.deepEqual(await t.switchAtLimit(KEY, undefined), { goes: 'account', to: 'Account b' });
});

test('switchAtLimit says it moved to API credit when no account has usage left and credit is on', async () => {
  const t = manager({ free: null });
  t.m.toCredit = async () => true;
  assert.deepEqual(await t.switchAtLimit(KEY, undefined), { goes: 'credit' });
  assert.equal(t.calls.delivered.length, 1);
  assert.ok(t.calls.delivered[0].includes('API credit'), t.calls.delivered[0]);
});

test('switchAtLimit with no account free and Resume after usage limits on says what the resume says', async () => {
  const t = manager({ free: null });
  const resume = { goes: 'resume', at: 123 };
  const asked: unknown[][] = [];
  t.m.resumeAfterLimit = async (...a: unknown[]) => (asked.push(a), resume);
  kvSet(db, 'auto_resume', '1');
  try {
    assert.deepEqual(await t.switchAtLimit(KEY, 99), resume);
    assert.deepEqual(asked, [[KEY, 99]]);
  } finally {
    kvSet(db, 'auto_resume', '0');
  }
});

test('switchAtLimit with no account free and Resume after usage limits off says nothing carries on', async () => {
  const t = manager({ free: null });
  kvSet(db, 'auto_resume', '0');
  assert.equal(await t.switchAtLimit(KEY, undefined), null);
  assert.equal(t.calls.delivered.length, 0);
});

test('switchAtLimit says nothing carries on when, while it waited, you stopped the session', async () => {
  const t = manager();
  waitsFor(t, (done) => (t.m.userStopped.add(KEY), done()));
  assert.equal(await t.switchAtLimit(KEY, undefined), null);
});

test('switchAtLimit says where the session went when, while it waited, it moved to another account', async () => {
  const t = manager();
  waitsFor(t, (done) => (t.setFrom('c'), done()));
  assert.deepEqual(await t.switchAtLimit(KEY, undefined), { goes: 'account', to: 'Account c' });
  assert.equal(t.calls.carryOver.length, 0);
});

test('switchAtLimit says it went on when, while it waited, a turn got through', async () => {
  const t = manager();
  waitsFor(t, (done) => ((t.adapter.limitStopped = false), done()));
  assert.deepEqual(await t.switchAtLimit(KEY, undefined), { goes: 'on' });
  assert.equal(t.calls.carryOver.length, 0);
});

test('switchAtLimit says nothing carries on when another move is already under way', async () => {
  const t = manager();
  t.m.switching.add(KEY);
  assert.equal(await t.switchAtLimit(KEY, undefined), null);
  assert.equal(t.calls.carryOver.length, 0);
});

// ---- resumeAfterLimit -------------------------------------------------------------------

/** The real resumeAfterLimit, with the time the limit lifts and the scheduling stood in for. */
function resuming(lifts: number | null | undefined, opts: { usage?: unknown } = {}) {
  const t = manager({ usage: opts.usage });
  const scheduled: [string, number][] = [];
  t.m.limitLiftsAt = () => lifts;
  t.m.onLimited = (key: string, at: number) => scheduled.push([key, at]);
  t.m.resumeLookup = (key: string) => scheduled.find((s) => s[0] === key)?.[1];
  return { ...t, scheduled };
}

test('resumeAfterLimit schedules the resume a minute after the limit lifts and says when', async () => {
  const lifts = Date.now() + 3_600_000;
  const t = resuming(lifts);
  assert.deepEqual(await t.resumeAfterLimit(KEY, undefined), { goes: 'resume', at: lifts + 60_000 });
  assert.deepEqual(t.scheduled, [[KEY, lifts + 60_000]]);
});

test('resumeAfterLimit schedules nothing again when a resume is set, and says when it is', async () => {
  const t = resuming(Date.now() + 3_600_000);
  t.m.resumeLookup = () => 456;
  assert.deepEqual(await t.resumeAfterLimit(KEY, undefined), { goes: 'resume', at: 456 });
  assert.equal(t.scheduled.length, 0);
});

test('resumeAfterLimit schedules nothing for a session you stopped', async () => {
  const t = resuming(Date.now() + 3_600_000);
  t.m.userStopped.add(KEY);
  assert.equal(await t.resumeAfterLimit(KEY, undefined), null);
  assert.equal(t.scheduled.length, 0);
});

test('resumeAfterLimit says it went on, and schedules nothing, when a turn got through', async () => {
  const t = resuming(Date.now() + 3_600_000);
  t.adapter.limitStopped = false;
  assert.deepEqual(await t.resumeAfterLimit(KEY, undefined), { goes: 'on' });
  assert.equal(t.scheduled.length, 0);
});

test('resumeAfterLimit says nothing carries on when no time is known for the limit to lift', async () => {
  const t = resuming(null);
  assert.equal(await t.resumeAfterLimit(KEY, undefined), null);
  assert.equal(t.scheduled.length, 0);
  assert.equal(t.calls.usageOf.length, 1, 'it looked at the usage');
});

test('resumeAfterLimit does nothing for an acp session', async () => {
  const t = resuming(Date.now() + 3_600_000);
  assert.equal(await t.resumeAfterLimit('acp:00000000-0000-0000-0000-000000000001', undefined), null);
  assert.equal(t.scheduled.length, 0);
});

// ---- afterTurn -> afterLimit ----------------------------------------------------------------

test('afterLimit tells how the move at the limit went, once it is settled', async () => {
  const t = manager();
  t.m.switchAtLimit = async () => ({ goes: 'account', to: 'Account b' });
  t.m.limitHits.add(KEY);
  quickTurn(t);
  assert.deepEqual(await t.m.afterLimit(KEY, 0), { goes: 'account', to: 'Account b' });
});

test('afterLimit knows nothing of a turn that ended before the time asked about', async () => {
  const t = manager();
  t.m.switchAtLimit = async () => ({ goes: 'account', to: 'Account b' });
  t.m.limitHits.add(KEY);
  quickTurn(t);
  assert.equal(t.m.afterLimit(KEY, Date.now() + 60_000), undefined);
});

test('afterLimit with a resume already set says when it resumes, and moves nothing', async () => {
  const t = manager();
  recording(t);
  t.m.resumeLookup = () => 456;
  t.m.limitHits.add(KEY);
  quickTurn(t);
  assert.deepEqual(await t.m.afterLimit(KEY, 0), { goes: 'resume', at: 456 });
  assert.equal(t.calls.switchAtLimit.length, 0);
});

test('afterLimit knows nothing of a turn the limit did not stop', () => {
  const t = manager();
  recording(t);
  quickTurn(t);
  assert.equal(t.m.afterLimit(KEY, 0), undefined);
});

test('afterLimit says nothing carries on with Switch accounts and Resume after usage limits off', async () => {
  kvSet(db, 'auto_switch', '0');
  kvSet(db, 'auto_resume', '0');
  try {
    const t = manager();
    recording(t);
    t.m.limitHits.add(KEY);
    quickTurn(t);
    assert.equal(await t.m.afterLimit(KEY, 0), null);
    assert.equal(t.calls.switchAtLimit.length, 0);
  } finally {
    kvSet(db, 'auto_switch', '1');
  }
});

test('afterLimit with Switch accounts off and Resume after usage limits on says what the resume says', async () => {
  kvSet(db, 'auto_switch', '0');
  kvSet(db, 'auto_resume', '1');
  try {
    const t = manager();
    t.m.resumeAfterLimit = async () => ({ goes: 'resume', at: 789 });
    t.m.limitHits.add(KEY);
    quickTurn(t);
    assert.deepEqual(await t.m.afterLimit(KEY, 0), { goes: 'resume', at: 789 });
  } finally {
    kvSet(db, 'auto_switch', '1');
    kvSet(db, 'auto_resume', '0');
  }
});

test('afterLimit turns a move with no answer into nothing carries on', async () => {
  const t = manager();
  t.m.switchAtLimit = async () => undefined;
  t.m.limitHits.add(KEY);
  quickTurn(t);
  assert.equal(await t.m.afterLimit(KEY, 0), null);
});

test('afterLimit knows nothing for an acp session', () => {
  const t = manager();
  recording(t);
  t.m.limitHits.add(KEY);
  quickTurn(t, { agent: 'acp' });
  assert.equal(t.m.afterLimit(KEY, 0), undefined);
});

test('afterLimit says nothing carries on when the move fails, and the failure is toasted once', async () => {
  const t = manager();
  t.m.switchAtLimit = () => Promise.reject(new Error('no luck'));
  t.m.limitHits.add(KEY);
  quickTurn(t);
  const after = await t.m.afterLimit(KEY, 0);
  assert.equal(t.calls.toasts.length, 1);
  const toast = t.calls.toasts[0] as { level: string; text: string };
  assert.equal(toast.level, 'error');
  assert.ok(toast.text.includes('no luck'), toast.text);
  assert.equal(after, null);
});

// ---- switchForSubagents ---------------------------------------------------------------

test('switchForSubagents moves an idle session whose account is used up, naming the subagents', async () => {
  const t = manager({ usage: okLimited });
  t.adapter.limitTasks.set('t1', 'Check the logs');
  t.adapter.limitTasks.set('t2', 'Read the docs');
  await t.switchForSubagents(KEY);
  assert.deepEqual(t.calls.usageOf, [['claude', 'a', 60_000]]);
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b']]);
  assert.equal(t.calls.delivered.length, 1);
  const msg = t.calls.delivered[0];
  assert.ok(msg.includes('"Check the logs" and "Read the docs"'), msg);
  assert.ok(msg.includes('now runs on Account b'), msg);
  assert.equal(t.m.switching.has(KEY), false);
});

test('switchForSubagents moves nothing when the usage could not be read', async () => {
  const t = manager({ usage: { ok: false, windows: [] } });
  t.adapter.limitTasks.set('t1', 'A');
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
});

test('switchForSubagents moves nothing when the account is not at a limit', async () => {
  const t = manager({ usage: { ok: true, limited: null, windows: [{ usedPercent: 40 }] } });
  t.adapter.limitTasks.set('t1', 'A');
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
});

test('switchForSubagents moves nothing while a subagent is at work', async () => {
  const t = manager({ usage: okLimited });
  t.adapter.limitTasks.set('t1', 'A');
  t.adapter.tasks.set('t2', agentTask('B'));
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
  assert.equal(t.calls.usageOf.length, 0, 'it did not even look at the usage');
});

test('switchForSubagents moves nothing while the session is working', async () => {
  const t = manager({ usage: okLimited, adapter: fakeAdapter('working') });
  t.adapter.limitTasks.set('t1', 'A');
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
});

test('switchForSubagents moves nothing when no account has usage left', async () => {
  const t = manager({ usage: okLimited, free: null });
  t.adapter.limitTasks.set('t1', 'A');
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
});

test('switchForSubagents moves nothing when there are no subagents to continue', async () => {
  const t = manager({ usage: okLimited });
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
});

test('switchForSubagents moves nothing while it is already moving', async () => {
  const t = manager({ usage: okLimited });
  t.adapter.limitTasks.set('t1', 'A');
  t.m.switching.add(KEY);
  await t.switchForSubagents(KEY);
  assert.equal(t.calls.carryOver.length, 0);
});

// ---- beforeResume and its note --------------------------------------------------------

test('beforeResume moves to the account with usage left and leaves a note, taken once, not by a command', async () => {
  const t = manager({ usage: okLimited });
  t.adapter.limitTasks.set('t1', 'Check the logs');
  t.adapter.limitTasks.set('t2', 'Read the docs');
  assert.equal(await t.beforeResume(KEY), false);
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b']]);
  assert.equal(t.takeMoveNote(KEY, '/compact'), '', 'a command leaves it');
  assert.equal(t.takeMoveNote(KEY, '  /compact'), '', 'also after spaces');
  const note = t.takeMoveNote(KEY, 'carry on');
  assert.ok(note.includes('Account a'), note);
  assert.ok(note.includes('now runs on Account b'), note);
  assert.ok(note.includes('which has usage left'), note);
  assert.ok(note.includes('"Check the logs" and "Read the docs"'), note);
  assert.equal(t.takeMoveNote(KEY, 'carry on'), '', 'only once');
});

test('beforeResume leaves no note when it does not move', async () => {
  const t = manager({ usage: { ok: true, limited: null, windows: [] } });
  assert.equal(await t.beforeResume(KEY), false);
  assert.equal(t.calls.carryOver.length, 0);
  assert.equal(t.takeMoveNote(KEY, 'hi'), '');
});

// ---- subagentsLine --------------------------------------------------------------------

test('subagentsLine for none, one and several names', () => {
  assert.equal(subagentsLine([]), '');
  const one = subagentsLine(['A']);
  assert.ok(one.startsWith(' Your subagent "A" stopped at that limit and can go on now: send it a message (SendMessage)'), one);
  const three = subagentsLine(['A', 'B', 'C']);
  assert.ok(three.includes('"A", "B" and "C"'), three);
  assert.ok(three.includes('send each one a message'), three);
  assert.ok(three.startsWith(' Your subagents '), three);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n`, e);
    process.exitCode = 1;
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`${passed}/${tests.length} passed`);
// watchStatus leaves timers (the capabilities hear of the ended turns a moment later): end here.
process.exit(process.exitCode ?? 0);
