// Script test for how a session moves to another account at the plan's usage limit (SessionManager.afterTurn,
// switchAtLimit, switchForSubagents, beforeResume), above all for its own background subagents the limit stopped:
// a turn the agent starts by itself on a subagent's notice and the limit refuses at once is a "quick turn" that still
// counts; the move waits for subagents still at work; a session that is idle with subagents stopped at the limit moves
// too; and what it tells the agent names them. Also what happens when that move fails (the error toast, and the
// continue at the reset with Resume after usage limits on), and moveToAccount over a stale copy of the history the
// other account already holds (cleared before the agent stops, or refused with the agent left running). The model
// counts too: a limit of another model alone (Weekly · Fable only) does not hold a Sonnet session back, and an account
// whose plan turned the session's model away is passed over for it.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-limit-test.ts
//   DATA_DIR=/tmp/hydor-test-limit CLAUDE_CONFIG_DIR=/tmp/hydor-test-limit/claude CODEX_HOME=/tmp/hydor-test-limit/codex GROK_HOME=/tmp/hydor-test-limit/grok node dist/dev/sessions-limit-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { accountById, addAccount, removeAccount } from './accounts.ts';
import { config } from './config.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, openDb } from './db.ts';
import { SessionManager, subagentsLine } from './sessions.ts';
import { isSignedOut, markSignedIn, markSignedOut, needSignIn, onSignedIn, resetSignIn, signInNeeds } from './signin.ts';

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
  return { tasks: new Map<string, Task>(), limitTasks: new Map<string, string>(), state: { status }, limitStopped: undefined as boolean | undefined, signedOut: undefined as boolean | undefined, exited: false };
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
    signedOutHits: new Set<string>(),
    signedOutEnds: new Map<string, number>(),
    switching: new Set<string>(),
    userStopped: new Set<string>(),
    moveNotes: new Map<string, string>(),
    limitAfter: new Map(),
    limitReads: new Map(),
    onLimited: () => {},
    resumeLookup: undefined as undefined | ((k: string) => number | undefined),
    external: { get: () => null },
    // What watchStatus would otherwise run for real.
    notify: () => {},
    keepEnding: () => {},
    heldDone: new Map<string, number>(),
    stillAtWork: () => false,
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
    summary: () => null,
  };
  m.accountAgentOf = proto.accountAgentOf.bind(m);
  m.familyOf = proto.familyOf.bind(m);
  m.refusesModel = proto.refusesModel.bind(m);
  m.acpAccountAgentOf = proto.acpAccountAgentOf.bind(m);
  m.lastUsageOf = proto.lastUsageOf.bind(m);
  m.afterTurn = proto.afterTurn.bind(m);
  m.finishedNotice = proto.finishedNotice.bind(m);
  m.releaseHeld = proto.releaseHeld.bind(m);
  m.afterLimit = proto.afterLimit.bind(m);
  m.afterSignOut = proto.afterSignOut.bind(m);
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

// ---- the "Finished" notice waits while what the session started still runs ----------------------------

/** watchStatus with the real notice parts, recording the notices; a held one goes out 30 ms after its work ends. */
function noticing() {
  const t = manager();
  const notices: { kind: string; body?: string }[] = [];
  let current: unknown = summary('idle');
  t.m.notify = (n: { kind: string }) => notices.push(n);
  t.m.stillAtWork = proto.stillAtWork.bind(t.m);
  t.m.releaseHeld = (key: string) => proto.releaseHeld.call(t.m, key, 30);
  t.m.summary = () => current;
  const look = (s: unknown) => {
    current = s;
    t.watchStatus([s]);
  };
  /** Its turn (of `ms`) ends now, with these background tasks still listed. */
  const turnEnds = (ms: number, tasks: unknown[]) => {
    t.m.statuses.set(KEY, { status: 'working', turnStart: Date.now() - ms });
    look(summary('idle', { live: { status: 'idle', backgroundTasks: tasks } }));
  };
  return { t, notices, look, turnEnds };
}
const command = (status = 'running') => ({ id: 'b1', kind: 'local_bash', description: 'npm run build', status });
const done = (notices: { kind: string }[]) => notices.filter((n) => n.kind === 'done').length;

test('finished notice: held while a background command still runs, sent once it ends with no turn after it', async () => {
  const { t, notices, look, turnEnds } = noticing();
  turnEnds(60_000, [command()]);
  await sleep(1700);
  assert.equal(done(notices), 0);
  assert.ok(t.m.heldDone.has(KEY));
  // The command ends, and the agent takes no turn on it.
  look(summary('idle', { live: { status: 'idle', backgroundTasks: [] } }));
  await sleep(150);
  assert.equal(done(notices), 1);
  assert.equal(t.m.heldDone.has(KEY), false);
});

test('finished notice: a held one goes out at the end of the next turn, however short, once nothing runs', async () => {
  const { notices, turnEnds } = noticing();
  turnEnds(60_000, [command()]);
  // The command ends and wakes the agent for a 2-second turn.
  turnEnds(2_000, [command('completed')]);
  await sleep(1700);
  assert.equal(done(notices), 1);
  // A short turn with no notice held sends none, as before.
  turnEnds(2_000, []);
  await sleep(1700);
  assert.equal(done(notices), 1);
});

test('finished notice: sent at once with nothing running; held while a Hydor subagent works; dropped when the process ends', async () => {
  const { t, notices, look, turnEnds } = noticing();
  turnEnds(60_000, []);
  await sleep(1700);
  assert.equal(done(notices), 1);
  t.m.runningHelpers = () => new Map([[KEY, new Set(['claude:child'])]]);
  turnEnds(60_000, []);
  await sleep(1700);
  assert.equal(done(notices), 1);
  assert.ok(t.m.heldDone.has(KEY));
  // Its process ends: the notice held for that work no longer comes, even once the subagent is done.
  look(summary('off', { live: null }));
  assert.equal(t.m.heldDone.has(KEY), false);
  t.m.runningHelpers = () => new Map();
  look(summary('idle', { live: { status: 'idle', backgroundTasks: [] } }));
  await sleep(150);
  assert.equal(done(notices), 1);
});

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
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'limit']]);
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
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'limit']]);
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
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'limit']]);
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

// ---- Grok Build sessions ---------------------------------------------------------------

const GROK_KEY = 'acp:00000000-0000-0000-0000-000000000002';
const grokUsage = (limited: boolean, used = 10) => ({ agent: 'grok', ok: true, fetchedAt: Date.now(), windows: [{ id: 'w', label: 'Weekly', usedPercent: used, resetsAt: null }], limited: limited ? { label: 'Weekly limit', resetsAt: Date.now() + 3600_000 } : null });

/** A manager whose Grok session (an ACP session of Grok Build) is the one in `lives`, with its real account helpers. */
function grokManager(opts: Parameters<typeof manager>[0] = {}) {
  const t = manager(opts);
  t.m.lives.set(GROK_KEY, { adapter: { ...t.adapter, agent: 'acp' } });
  t.m.acpAccountAgentOf = (key: string) => (key === GROK_KEY ? 'grok' : null);
  t.m.accountAgentOf = proto.accountAgentOf.bind(t.m);
  return t;
}
const grokSummary = (status: string, extra: Record<string, unknown> = {}) => ({ ...summary(status), key: GROK_KEY, agent: 'acp', acpAgent: 'grok', ...extra });

test('freeAccount for Grok Build picks the added account with usage left, the least used first', async () => {
  const a = addAccount(db, 'grok', 'Work');
  const b = addAccount(db, 'grok', 'Personal');
  const c = addAccount(db, 'grok', 'Spare');
  try {
    const reads = new Map<string | undefined, ReturnType<typeof grokUsage> | undefined>([
      [undefined, grokUsage(true)],
      [a.id, grokUsage(true)],
      [b.id, grokUsage(false, 60)],
      [c.id, grokUsage(false, 20)],
    ]);
    const asked: unknown[][] = [];
    const m: any = { db, usageOf: async (agent: string, id: string | undefined) => (asked.push([agent, id]), reads.get(id)) };
    const free = (except: string | undefined) => proto.freeAccount.call(m, 'grok', except) as Promise<{ id: string | undefined } | null>;
    assert.equal((await free(undefined))?.id, c.id, 'the main account and Work are at their limit; Spare is the least used');
    assert.ok(asked.every((x) => x[0] === 'grok'));
    assert.equal((await free(c.id))?.id, b.id);
    // The one the session runs as is never picked, and an unreadable account is skipped.
    reads.set(b.id, { ...grokUsage(false), ok: false });
    reads.set(c.id, grokUsage(true));
    assert.equal(await free(a.id), null);
    reads.set(undefined, grokUsage(false, 5));
    const main = await free(a.id);
    assert.ok(main && main.id === undefined, 'the main account takes it when it has usage left');
    // Claude Code's pool is its own.
    assert.equal(await proto.freeAccount.call(Object.assign(m, { usageOf: async () => grokUsage(false) }), 'claude', undefined), null);
  } finally {
    for (const x of [a, b, c]) removeAccount(db, x.id, true);
  }
});

test('a Grok session the limit stopped moves to another account, told in the same words, with no subagent or credit steps', async () => {
  const t = grokManager({ free: { id: 'b' } });
  t.adapter.limitTasks.set('t1', 'A');
  t.adapter.tasks.set('t1', agentTask('A'));
  t.m.limitHits.add(GROK_KEY);
  t.m.statuses.set(GROK_KEY, { status: 'working', turnStart: Date.now() });
  t.m.switchAtLimit = proto.switchAtLimit.bind(t.m);
  t.m.lastUsageOf = proto.lastUsageOf.bind(t.m);
  t.m.lastUsageOf = () => grokUsage(true);
  t.watchStatus([grokSummary('idle')]);
  const after = t.m.limitAfter.get(GROK_KEY);
  assert.ok(after, 'the turn is followed');
  assert.deepEqual(await after.after, { goes: 'account', to: 'Account b' });
  assert.deepEqual(t.calls.carryOver, [[GROK_KEY, 'a', 'b', 'limit']]);
  assert.deepEqual(t.calls.delivered, ['Account a reached its usage limit, so this session now runs on Account b. Continue where you left off.']);
});

test('a Grok session waits for the usage reading its limit hit started, to know when the limit lifts', async () => {
  const t = grokManager({ free: null });
  kvSet(db, 'auto_resume', '1');
  try {
    let resets: number | undefined;
    t.m.resumeAfterLimit = async (_key: string, at: number | undefined) => ((resets = at), { goes: 'resume', at: (at ?? 0) + 60_000 });
    let last: unknown = null;
    t.m.lastUsageOf = () => last;
    t.m.limitReads.set(GROK_KEY, new Promise<void>((r) => setTimeout(() => ((last = grokUsage(true)), r()), 30)));
    t.m.limitHits.add(GROK_KEY);
    t.m.statuses.set(GROK_KEY, { status: 'working', turnStart: Date.now() });
    t.watchStatus([grokSummary('idle')]);
    const done = await t.m.limitAfter.get(GROK_KEY).after;
    assert.ok(resets && resets > Date.now(), 'the reset time from the fresh reading');
    assert.equal((done as { goes: string }).goes, 'resume');
  } finally {
    kvSet(db, 'auto_resume', '0');
  }
});

test('an ACP session of another agent, and a Grok turn with no hit, move nothing', async () => {
  const other = grokManager();
  other.m.acpAccountAgentOf = () => null;
  other.m.limitHits.add(GROK_KEY);
  other.m.statuses.set(GROK_KEY, { status: 'working', turnStart: Date.now() });
  other.watchStatus([grokSummary('idle')]);
  assert.equal(other.m.limitAfter.get(GROK_KEY), undefined);
  const t = grokManager();
  recording(t);
  t.adapter.limitTasks.set('t1', 'A');
  t.m.statuses.set(GROK_KEY, { status: 'working', turnStart: Date.now() });
  t.watchStatus([grokSummary('idle')]);
  assert.equal(t.calls.switchAtLimit.length + t.calls.switchForSubagents.length, 0, 'subagent moves are Claude Code’s');
});

test('beforeResume for a Grok session moves it to the account with usage left, with the note for its next message', async () => {
  const t = grokManager({ free: { id: 'b' }, usage: grokUsage(true) });
  t.m.beforeResume = proto.beforeResume.bind(t.m);
  assert.equal(await t.m.beforeResume(GROK_KEY), false);
  assert.deepEqual(t.calls.carryOver, [[GROK_KEY, 'a', 'b', 'limit']]);
  assert.deepEqual(t.calls.usageOf, [['grok', 'a', 60_000]]);
  assert.equal(t.takeMoveNote(GROK_KEY, 'hi'), 'Account a reached its usage limit, so this session now runs on Account b, which has usage left.');
});

// ---- an account signed out ------------------------------------------------------------

/** A signed-out turn of the session ended (as the adapter's 'signedout' leaves it, the account marked), seen as it went idle. */
function signedOutTurn(t: ReturnType<typeof manager>, extra: Record<string, unknown> = {}) {
  markSignedOut('claude', 'a');
  t.m.signedOutHits.add(KEY);
  t.m.statuses.set(KEY, { status: 'working', turnStart: Date.now() });
  t.watchStatus([summary('idle', extra)]);
}

/** Runs a signed-out test with no marks or prompts left over from another. */
const signedOutTest = (name: string, fn: () => void | Promise<void>) =>
  test(name, async () => {
    resetSignIn();
    try {
      await fn();
    } finally {
      resetSignIn();
    }
  });

signedOutTest('a session whose account is signed out moves to another account with usage, and is told so', async () => {
  const t = manager({ free: { id: 'b' } });
  signedOutTurn(t);
  assert.ok(t.m.signedOutHits.size === 0, 'the hit is taken at the turn end');
  assert.deepEqual(await t.m.limitAfter.get(KEY).after, { goes: 'account', to: 'Account b', signedOut: true });
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'signedout']]);
  assert.deepEqual(t.calls.delivered, ['Account a is signed out, so this session now runs on Account b. Continue where you left off.']);
  assert.deepEqual(signInNeeds(), [], 'nobody is asked while another account can do the work');
  assert.equal(isSignedOut('claude', 'a'), true);
  assert.equal(t.calls.switchAtLimit.length, 0);
  assert.ok(t.m.signedOutEnds.has(KEY));
  assert.equal(t.m.switching.has(KEY), false);
});

signedOutTest('a moved session that a goal continues by itself is not told to continue again', async () => {
  const t = manager({ free: { id: 'b' } });
  t.m.carryOver = async (...a: unknown[]) => (t.calls.carryOver.push(a), true);
  signedOutTurn(t);
  await t.m.limitAfter.get(KEY).after;
  assert.equal(t.calls.carryOver.length, 1);
  assert.deepEqual(t.calls.delivered, []);
});

signedOutTest('with no other account to take it, the user is asked to sign in again, for this session', async () => {
  const t = manager({ free: null });
  signedOutTurn(t);
  assert.equal(await t.m.limitAfter.get(KEY).after, null);
  assert.equal(t.calls.carryOver.length + t.calls.delivered.length, 0);
  const [need] = signInNeeds();
  assert.deepEqual([need.agent, need.account, need.sessions, need.background], ['claude', 'a', [KEY], false]);
});

signedOutTest('with Switch accounts off, or an external session, the user is asked and nothing moves', async () => {
  kvSet(db, 'auto_switch', '0');
  try {
    const t = manager({ free: { id: 'b' } });
    signedOutTurn(t);
    await t.m.limitAfter.get(KEY).after;
    assert.equal(t.calls.carryOver.length, 0);
    assert.deepEqual(signInNeeds().map((n) => n.sessions), [[KEY]]);
  } finally {
    kvSet(db, 'auto_switch', '1');
  }
  resetSignIn();
  const t = manager({ free: { id: 'b' } });
  signedOutTurn(t, { external: { client: 'VS Code', status: 'idle' } });
  await t.m.limitAfter.get(KEY).after;
  assert.equal(t.calls.carryOver.length, 0);
  assert.deepEqual(signInNeeds().map((n) => n.sessions), [[KEY]]);
});

signedOutTest('a quick signed-out turn (begun and ended between two looks) is acted on too', async () => {
  const t = manager({ free: null });
  markSignedOut('claude', 'a');
  t.m.signedOutHits.add(KEY);
  quickTurn(t);
  await t.m.limitAfter.get(KEY).after;
  assert.deepEqual(signInNeeds().map((n) => n.sessions), [[KEY]]);
});

signedOutTest('a session you stopped yourself is not asked about; one already moving is left to that move', async () => {
  const t = manager({ free: null });
  t.m.userStopped.add(KEY);
  markSignedOut('claude', 'a');
  // The adapter's own handler does not count a hit for a turn you stopped; one that slipped in is still not asked about.
  t.m.signedOutHits.add(KEY);
  t.m.statuses.set(KEY, { status: 'working', turnStart: Date.now() });
  t.watchStatus([summary('idle')]);
  await t.m.limitAfter.get(KEY).after;
  assert.deepEqual(signInNeeds(), []);
  const u = manager({ free: null });
  u.m.switching.add(KEY);
  signedOutTurn(u);
  assert.equal(u.m.limitAfter.get(KEY), undefined);
  assert.deepEqual(signInNeeds(), []);
});

signedOutTest('a move that fails asks the user instead, and says why', async () => {
  const t = manager({ free: { id: 'b' } });
  t.m.carryOver = async () => {
    throw new Error('no luck');
  };
  signedOutTurn(t);
  assert.equal(await t.m.limitAfter.get(KEY).after, null);
  assert.deepEqual(signInNeeds().map((n) => n.sessions), [[KEY]]);
  assert.equal((t.calls.toasts[0] as { text: string }).text, 'A session: could not switch accounts: no luck');
  assert.equal(t.m.switching.has(KEY), false);
});

signedOutTest('after a sign-in the session it stopped is stopped and told to continue; others are left', async () => {
  const t = manager({ free: null });
  const stopped: string[] = [];
  t.m.exists = (k: string) => k !== 'claude:gone';
  t.m.accountOf = (k: string) => t.m.lives.get(k)?.account ?? 'a';
  t.m.stopAndWait = async (k: string) => void stopped.push(k);
  t.m.continueAfterSignIn = proto.continueAfterSignIn.bind(t.m);
  // The constructor's own wiring.
  const off = onSignedIn((agent, account, keys) => void t.m.continueAfterSignIn(agent, account, keys));
  try {
    const WORKING = 'claude:00000000-0000-0000-0000-000000000002';
    const OTHER = 'claude:00000000-0000-0000-0000-000000000003';
    t.m.lives.set(WORKING, { adapter: { ...fakeAdapter('working') }, account: 'a' });
    t.m.lives.set(OTHER, { adapter: fakeAdapter(), account: 'z' });
    t.m.lives.get(KEY).account = 'a';
    markSignedOut('claude', 'a');
    for (const k of [KEY, WORKING, OTHER, 'claude:gone']) needSignIn({ agent: 'claude', account: 'a', session: k });
    markSignedIn('claude', 'a');
    await sleep(30);
    assert.deepEqual(stopped, [KEY]);
    assert.deepEqual(t.calls.delivered, ['Signed in again. Continue where you left off.']);
    assert.deepEqual(signInNeeds(), []);
    assert.equal(isSignedOut('claude', 'a'), false);
  } finally {
    off();
  }
});

signedOutTest('a sign-in nobody was waiting on continues nothing', async () => {
  const t = manager({ free: null });
  t.m.continueAfterSignIn = proto.continueAfterSignIn.bind(t.m);
  const off = onSignedIn((agent, account, keys) => void t.m.continueAfterSignIn(agent, account, keys));
  try {
    markSignedOut('claude', 'a');
    markSignedIn('claude', 'a');
    await sleep(20);
    assert.deepEqual(t.calls.delivered, []);
  } finally {
    off();
  }
});

signedOutTest('a message to a session whose account is signed out moves it first, and it no longer waits for a sign-in', async () => {
  const t = manager({ free: { id: 'b' } });
  t.m.switchBeforeSend = proto.switchBeforeSend.bind(t.m);
  t.m.leaveSignedOut = proto.leaveSignedOut.bind(t.m);
  t.m.beforeResume = async () => assert.fail('a sign-out is not a limit');
  markSignedOut('claude', 'a');
  needSignIn({ agent: 'claude', account: 'a', session: KEY });
  await t.m.switchBeforeSend(KEY);
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'signedout']]);
  assert.equal(t.m.moveNotes.get(KEY), 'Account a is signed out, so this session now runs on Account b.');
  assert.deepEqual(signInNeeds(), []);
  assert.equal(t.m.switching.has(KEY), false);
});

signedOutTest('a message goes on as it is when no other account can take the session, or its account is not signed out', async () => {
  const none = manager({ free: null });
  none.m.switchBeforeSend = proto.switchBeforeSend.bind(none.m);
  none.m.leaveSignedOut = proto.leaveSignedOut.bind(none.m);
  markSignedOut('claude', 'a');
  await none.m.switchBeforeSend(KEY);
  assert.equal(none.calls.carryOver.length, 0);
  resetSignIn();
  const fine = manager({ free: { id: 'b' } });
  fine.m.switchBeforeSend = proto.switchBeforeSend.bind(fine.m);
  fine.m.leaveSignedOut = proto.leaveSignedOut.bind(fine.m);
  await fine.m.switchBeforeSend(KEY);
  assert.equal(fine.calls.carryOver.length, 0);
});

signedOutTest('a turn stopped by a sign-out is not the work failing', () => {
  const t = manager();
  t.m.stoppedAtLimit = proto.stoppedAtLimit.bind(t.m);
  assert.equal(t.m.stoppedAtLimit(KEY, 0), false);
  t.adapter.signedOut = true;
  assert.equal(t.m.stoppedAtLimit(KEY, 0), true);
  t.adapter.signedOut = false;
  t.m.signedOutHits.add(KEY);
  assert.equal(t.m.stoppedAtLimit(KEY, 0), true);
  t.m.signedOutHits.clear();
  t.m.signedOutEnds.set(KEY, 1000);
  assert.equal(t.m.stoppedAtLimit(KEY, 500), true);
  assert.equal(t.m.stoppedAtLimit(KEY, 2000), false);
});

signedOutTest('freeAccount passes over an account found signed out, and still the one asked to leave', async () => {
  const a = addAccount(db, 'claude', 'Work');
  const b = addAccount(db, 'claude', 'Personal');
  try {
    const usage = { agent: 'claude', ok: true, fetchedAt: Date.now(), windows: [{ id: 'w', label: 'Weekly', usedPercent: 10, resetsAt: null }], limited: null };
    const m: any = { db, usageOf: async () => usage };
    const free = (except: string | undefined) => proto.freeAccount.call(m, 'claude', except) as Promise<{ id: string | undefined } | null>;
    assert.equal((await free(a.id))?.id, undefined, 'the main account, the least used first among equals, when listed first');
    markSignedOut('claude', undefined);
    markSignedOut('claude', b.id);
    assert.equal(await free(a.id), null);
    markSignedIn('claude', b.id);
    assert.equal((await free(a.id))?.id, b.id);
  } finally {
    for (const x of [a, b]) removeAccount(db, x.id, true);
  }
});

signedOutTest('the lead of a subagent that moved for a sign-out hears so, not of a usage limit', async () => {
  const { resultMessage } = await import('./children/index.ts');
  const text = resultMessage({ key: 'claude:c', title: 'T', label: 'Claude Code', link: '/s/c', turn: { reply: '' } as any, after: { goes: 'account', to: 'Work', signedOut: true } });
  assert.match(text, /^\[The Hydor subagent "T" \(claude:c, Claude Code\) found its account signed out and carries on with Work, another account\.\]/);
});

// ---- afterTurn: a move that fails -----------------------------------------------------------

/** Sets a kv value for the test (undefined: none), giving back what undoes it. */
function kvTemp(k: string, v: string | undefined) {
  const was = kvGet(db, k);
  const put = (x: string | undefined) => (x === undefined ? db.prepare('delete from kv where k = ?').run(k) : kvSet(db, k, x));
  put(v);
  return () => put(was);
}

/** A session at its limit whose move to another account fails with 'boom', its account's usage saying when it lifts. */
async function failedMove(autoResume: string, resetsAt: number) {
  const restore = kvTemp('auto_resume', autoResume);
  try {
    const t = manager();
    const scheduled: [string, number][] = [];
    t.m.switchAtLimit = async () => {
      throw new Error('boom');
    };
    // The real resumeAfterLimit, with the scheduling stood in for.
    t.m.resumeAfterLimit = proto.resumeAfterLimit.bind(t.m);
    t.m.limitLiftsAt = () => undefined;
    t.m.onLimited = (key: string, at: number) => scheduled.push([key, at]);
    t.m.resumeLookup = (key: string) => scheduled.find((x) => x[0] === key)?.[1];
    t.m.controlFor = () => ({ lastUsage: { ok: true, windows: [], limited: { label: 'x', resetsAt } } });
    t.m.afterTurn({ key: KEY, agent: 'claude', cwd: tmp, title: 'A session', account: 'a' }, true, Date.now());
    const after = await t.m.limitAfter.get(KEY).after;
    return { t, scheduled, after };
  } finally {
    restore();
  }
}

test('a move at the limit that fails tells you why, and with Resume after usage limits on continues at the reset', async () => {
  const resetsAt = Date.now() + 3_600_000;
  const { t, scheduled, after } = await failedMove('1', resetsAt);
  assert.equal(t.calls.toasts.length, 1);
  const toast = t.calls.toasts[0] as { level: string; text: string };
  assert.equal(toast.level, 'error');
  assert.ok(toast.text.includes('could not switch accounts: boom'), toast.text);
  assert.deepEqual(scheduled, [[KEY, resetsAt + 60_000]], 'it continues a minute after its own account resets');
  assert.deepEqual(after, { goes: 'resume', at: resetsAt + 60_000 });
});

test('a move at the limit that fails with Resume after usage limits off only tells you why', async () => {
  const { t, scheduled, after } = await failedMove('0', Date.now() + 3_600_000);
  assert.equal(t.calls.toasts.length, 1);
  assert.ok((t.calls.toasts[0] as { text: string }).text.includes('could not switch accounts: boom'));
  assert.deepEqual(scheduled, [], 'nothing continues by itself');
  assert.equal(after, null);
});

// ---- moveToAccount ------------------------------------------------------------------------------

const MOVE_ID = KEY.slice('claude:'.length);

/** Two Claude accounts, the session's history in the first one's projects folder, and what moveToAccount touches of the manager. */
function moving(opts: { transcript?: (file: string) => string } = {}) {
  const a = addAccount(db, 'claude', `From ${Math.random().toString(36).slice(2, 8)}`);
  const b = addAccount(db, 'claude', `To ${Math.random().toString(36).slice(2, 8)}`);
  const projects = (id: string) => path.join(accountById(db, id)!.dir, 'projects');
  const rel = path.join('-tmp-proj', `${MOVE_ID}.jsonl`);
  const subRel = path.join('-tmp-proj', MOVE_ID, 'subagents', 'agent-x.jsonl');
  const inA = { file: path.join(projects(a.id), rel), sub: path.join(projects(a.id), subRel), folder: path.join(projects(a.id), '-tmp-proj', MOVE_ID) };
  const inB = { file: path.join(projects(b.id), rel), sub: path.join(projects(b.id), subRel), folder: path.join(projects(b.id), '-tmp-proj', MOVE_ID) };
  for (const f of [inA.file, inA.sub]) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `history of ${path.basename(f)}\n`);
  }
  db.prepare('insert or replace into app_sessions (key, agent, account) values (?, ?, ?)').run(KEY, 'claude', a.id);
  db.prepare('insert or replace into sessions (key, agent, id, path) values (?, ?, ?, ?)').run(KEY, 'claude', MOVE_ID, inA.file);
  const calls = { stopped: 0, poked: [] as unknown[], stoppedWith: [] as boolean[] };
  const m: any = {
    db,
    lives: new Map(),
    external: { get: () => null },
    timelines: new Map(),
    indexer: { poke: (files: unknown) => calls.poked.push(files) },
    queueSummary: () => {},
    accountOf: () => a.id,
    transcriptFor: () => (opts.transcript ? opts.transcript(inA.file) : inA.file),
    stopAndWait: async () => {
      calls.stopped++;
      // What the other account held of the history when the agent was stopped.
      calls.stoppedWith.push(fs.existsSync(inB.file) || fs.existsSync(inB.folder));
    },
  };
  const move = () => proto.moveToAccount.call(m, KEY, b.id) as Promise<void>;
  const done = () => {
    db.prepare('delete from app_sessions where key = ?').run(KEY);
    db.prepare('delete from sessions where key = ?').run(KEY);
    for (const x of [a, b]) removeAccount(db, x.id, true);
  };
  return { a, b, inA, inB, calls, move, done };
}

/** The Trash entries (in the app's data folder) that end with a name; removed when `take`. */
function trashed(suffix: string, take = false) {
  const dir = path.join(config.dataDir, 'trash');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(suffix)) : [];
  const found = names.map((n) => ({ name: n, text: fs.readFileSync(path.join(dir, n), 'utf8') }));
  if (take) for (const n of names) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
  return found;
}

test('moveToAccount over a stale copy that is only links of the history: the copy goes before the agent stops, the history moves', async () => {
  const t = moving();
  try {
    // The stale copy: hard links of the transcript and of its subagent's, as the app's own kept links were.
    fs.mkdirSync(path.dirname(t.inB.file), { recursive: true });
    fs.linkSync(t.inA.file, t.inB.file);
    fs.mkdirSync(path.dirname(t.inB.sub), { recursive: true });
    fs.linkSync(t.inA.sub, t.inB.sub);
    await t.move();
    assert.equal(fs.readFileSync(t.inB.file, 'utf8'), `history of ${path.basename(t.inA.file)}\n`, 'the other account holds the transcript');
    assert.equal(fs.readFileSync(t.inB.sub, 'utf8'), 'history of agent-x.jsonl\n', 'and its subagent’s');
    assert.equal(fs.existsSync(t.inA.file), false, 'the old transcript is gone');
    assert.equal(fs.existsSync(t.inA.folder), false, 'and the old folder');
    assert.equal(t.calls.stopped, 1, 'the agent stopped once');
    assert.deepEqual(t.calls.stoppedWith, [false], 'the stale copy was cleared before the agent stopped');
    assert.equal((db.prepare('select account from app_sessions where key = ?').get(KEY) as { account: string }).account, t.b.id, 'the session runs as the other account');
    assert.equal((db.prepare('select path from sessions where key = ?').get(KEY) as { path: string }).path, t.inB.file, 'the index follows the history');
    assert.deepEqual(trashed(`-${MOVE_ID}.jsonl`), [], 'a copy that is only links is not kept in the Trash');
  } finally {
    t.done();
  }
});

test('moveToAccount over a different file at the transcript’s place: the history takes it, the old file is in the Trash', async () => {
  const t = moving();
  try {
    fs.mkdirSync(path.dirname(t.inB.file), { recursive: true });
    fs.writeFileSync(t.inB.file, 'an older, different copy\n');
    await t.move();
    assert.equal(fs.readFileSync(t.inB.file, 'utf8'), `history of ${path.basename(t.inA.file)}\n`, 'the other account holds the history that moved');
    assert.equal(fs.existsSync(t.inA.file), false);
    assert.equal(t.calls.stopped, 1);
    const set = trashed(`-${MOVE_ID}.jsonl`, true);
    assert.equal(set.length, 1, 'the old file is in the Trash');
    assert.equal(set[0].text, 'an older, different copy\n');
    assert.ok(set[0].name.endsWith(`-${MOVE_ID}.jsonl`));
  } finally {
    t.done();
  }
});

test('moveToAccount that cannot be made says so and leaves the agent running', async () => {
  const stray = path.join(tmp, 'elsewhere', `${MOVE_ID}.jsonl`);
  fs.mkdirSync(path.dirname(stray), { recursive: true });
  fs.writeFileSync(stray, 'x\n');
  const t = moving({ transcript: () => stray });
  try {
    await assert.rejects(t.move(), (e) => e instanceof HttpError && e.status === 409);
    assert.equal(t.calls.stopped, 0, 'the agent was not stopped');
    assert.equal((db.prepare('select account from app_sessions where key = ?').get(KEY) as { account: string }).account, t.a.id, 'the session stays on its account');
    assert.ok(fs.existsSync(t.inA.file), 'its history stays');
  } finally {
    t.done();
  }
});

// ---- the session's model: limits of one model alone, and a plan that does not include it ----------------------

const HOUR = 3600_000;
/** Claude Code usage: its windows (`model` on one of a model alone), and the limit it shows when one is full. */
const claudeUsageOf = (windows: [id: string, used: number, model?: string][], limited: { label: string; resetsAt: number; model?: string } | null = null) => ({
  agent: 'claude',
  ok: true,
  fetchedAt: Date.now(),
  windows: windows.map(([id, used, model]) => ({ id, label: model ? `Weekly · ${model} only` : id, usedPercent: used, resetsAt: Date.now() + 5 * HOUR, ...(model ? { model } : {}) })),
  limited,
});
const fableOnly = (resetsAt = Date.now() + 5 * HOUR) => ({ label: 'Weekly · Fable only', resetsAt, model: 'fable' });
/** A manager that knows which accounts turn which model families away (for their plans), by account. */
const refusing = (refuses: (id: string | undefined, family: string) => boolean) => ({ refuses }) as const;

signedOutTest('freeAccount for a Sonnet session takes an account whose only full window is a Fable-only one, and passes it over for a Fable session', async () => {
  const a = addAccount(db, 'claude', 'Work');
  try {
    const usage = claudeUsageOf([['weekly_all', 40], ['weekly_fable', 100, 'fable']], fableOnly());
    const m: any = { db, usageOf: async (_agent: string, id: string | undefined) => (id === a.id ? usage : undefined), controlFor: () => ({ refuses: () => false }) };
    m.refusesModel = proto.refusesModel.bind(m);
    const free = (family: string | null) => proto.freeAccount.call(m, 'claude', undefined, family) as Promise<{ id: string | undefined } | null>;
    assert.equal((await free('sonnet'))?.id, a.id, 'a limit of Fable alone leaves Sonnet its usage');
    assert.equal(await free('fable'), null, 'it holds a Fable session back');
    assert.equal(await free(null), null, 'and one whose model is not known: every limit counts');
    // With anyLimit (subagents of unknown models) every limit counts, as for an unknown model.
    assert.equal(await proto.freeAccount.call(m, 'claude', undefined, 'sonnet', true), null);
    // A limit of the whole account holds every model back.
    usage.windows[0].usedPercent = 100;
    assert.equal(await free('sonnet'), null);
  } finally {
    removeAccount(db, a.id, true);
  }
});

signedOutTest('freeAccount passes over an account whose plan turned the family away, for that family only', async () => {
  const a = addAccount(db, 'claude', 'Work');
  const b = addAccount(db, 'claude', 'Personal');
  try {
    const reads = new Map<string | undefined, ReturnType<typeof claudeUsageOf>>([
      [a.id, claudeUsageOf([['weekly_all', 10]])],
      [b.id, claudeUsageOf([['weekly_all', 50]])],
    ]);
    const asked: (string | undefined)[] = [];
    const m: any = {
      db,
      usageOf: async (_agent: string, id: string | undefined) => (asked.push(id), reads.get(id)),
      controlFor: (_agent: string, id: string | undefined) => refusing((f) => f === 'fable' && id === a.id),
    };
    m.refusesModel = proto.refusesModel.bind(m);
    const free = (family: string | null) => proto.freeAccount.call(m, 'claude', undefined, family) as Promise<{ id: string | undefined } | null>;
    assert.equal((await free('sonnet'))?.id, a.id, 'Work takes a Sonnet session: the least used');
    assert.equal((await free(null))?.id, a.id);
    asked.length = 0;
    assert.equal((await free('fable'))?.id, b.id, 'Work\'s plan does not include Fable: Personal takes it');
    assert.ok(!asked.includes(a.id), 'the usage of an account that refuses is not even read');
    // Claude Code's refusals are its own: another agent's accounts are not asked.
    assert.equal(m.refusesModel('codex', a.id, 'fable'), false);
  } finally {
    for (const x of [a, b]) removeAccount(db, x.id, true);
  }
});

signedOutTest('freeAccount picks the least used by the windows that hold the model back', async () => {
  const a = addAccount(db, 'claude', 'Work');
  const b = addAccount(db, 'claude', 'Personal');
  try {
    const reads = new Map<string | undefined, ReturnType<typeof claudeUsageOf>>([
      [a.id, claudeUsageOf([['weekly_all', 90], ['weekly_fable', 10, 'fable']])],
      [b.id, claudeUsageOf([['weekly_all', 50], ['weekly_fable', 99, 'fable']])],
    ]);
    const m: any = { db, usageOf: async (_agent: string, id: string | undefined) => reads.get(id), controlFor: () => ({ refuses: () => false }) };
    m.refusesModel = proto.refusesModel.bind(m);
    const free = (family: string | null, anyLimit = false) => proto.freeAccount.call(m, 'claude', undefined, family, anyLimit) as Promise<{ id: string | undefined } | null>;
    assert.equal((await free('sonnet'))?.id, b.id, 'for Sonnet the Fable window counts for nothing: 50 beats 90');
    assert.equal((await free('fable'))?.id, a.id, 'for Fable both count: 90 beats 99');
    assert.equal((await free(null))?.id, a.id, 'with no model known all count');
    assert.equal((await free('sonnet', true))?.id, a.id, 'and with anyLimit');
  } finally {
    for (const x of [a, b]) removeAccount(db, x.id, true);
  }
});

/** A manager for a Claude Code session on that model, whose accounts turn away the families `refuses` says. */
function modelManager(model: string, opts: Parameters<typeof manager>[0] = {}, refuses: (f: string) => boolean = () => false) {
  const t = manager(opts);
  (t.adapter.state as any).model = model;
  t.m.controlFor = () => ({ lastUsage: { limited: null }, refuses });
  return t;
}

test('beforeResume moves a Fable session whose own account has usage but whose plan does not include Fable, with a note that says so', async () => {
  const t = modelManager('claude-fable-5-2', { usage: claudeUsageOf([['weekly_all', 10]]) }, (f) => f === 'fable');
  assert.equal(await t.beforeResume(KEY), false);
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'model']]);
  assert.equal(t.takeMoveNote(KEY, 'carry on'), "Account a's plan does not include Fable, so this session now runs on Account b, which has usage left.");
  // A Sonnet session on the same account has no reason to leave it.
  const s = modelManager('claude-sonnet-5', { usage: claudeUsageOf([['weekly_all', 10]]) }, (f) => f === 'fable');
  assert.equal(await s.beforeResume(KEY), false);
  assert.equal(s.calls.carryOver.length, 0);
  assert.equal(s.takeMoveNote(KEY, 'carry on'), '');
});

test('beforeResume does not move a Sonnet session whose account is only at a Fable-only limit, and moves a Fable one for the limit', async () => {
  const usage = claudeUsageOf([['weekly_all', 40], ['weekly_fable', 100, 'fable']], fableOnly());
  const sonnet = modelManager('claude-sonnet-5', { usage });
  assert.equal(await sonnet.beforeResume(KEY), false);
  assert.equal(sonnet.calls.carryOver.length, 0);
  assert.equal(sonnet.takeMoveNote(KEY, 'hi'), '');
  // Its model is not in the session's state: the summary's one counts.
  const viaSummary = modelManager('', { usage });
  (viaSummary.adapter.state as any).model = undefined;
  viaSummary.m.summary = () => ({ model: 'sonnet' });
  await viaSummary.beforeResume(KEY);
  assert.equal(viaSummary.calls.carryOver.length, 0);
  const fable = modelManager('fable', { usage });
  await fable.beforeResume(KEY);
  assert.deepEqual(fable.calls.carryOver, [[KEY, 'a', 'b', 'limit']]);
  assert.equal(fable.takeMoveNote(KEY, 'hi'), 'Account a reached its usage limit, so this session now runs on Account b, which has usage left.');
});

test('switchAtLimit after a refusal says the plan does not include the model, and moves for that reason', async () => {
  const t = modelManager('claude-fable-5-2', {}, (f) => f === 'fable');
  await t.switchAtLimit(KEY, undefined);
  assert.deepEqual(t.calls.carryOver, [[KEY, 'a', 'b', 'model']]);
  assert.deepEqual(t.calls.delivered, ["Account a's plan does not include Fable, so this session now runs on Account b. Continue where you left off."]);
  // The same refusal for another model than the session's changes nothing: a plain limit.
  const s = modelManager('claude-sonnet-5', {}, (f) => f === 'fable');
  await s.switchAtLimit(KEY, undefined);
  assert.deepEqual(s.calls.carryOver, [[KEY, 'a', 'b', 'limit']]);
  assert.deepEqual(s.calls.delivered, ['Account a reached its usage limit, so this session now runs on Account b. Continue where you left off.']);
});

signedOutTest('limitLiftsAt leaves out an account that turned the model away, and counts only the limits that hold the model back', async () => {
  const a = addAccount(db, 'claude', 'Work');
  const b = addAccount(db, 'claude', 'Personal');
  try {
    const now = Date.now();
    const later = now + 9 * HOUR;
    const sooner = now + 3 * HOUR;
    const reads = new Map<string | undefined, ReturnType<typeof claudeUsageOf>>();
    let family: string | null = 'fable';
    let refused = true;
    const m: any = {
      db,
      accountAgentOf: () => 'claude',
      familyOf: () => family,
      accountOf: () => undefined,
      lastUsageOf: (_agent: string, id: string | undefined) => reads.get(id),
      controlFor: (_agent: string, id: string | undefined) => refusing((f) => refused && f === 'fable' && id === a.id),
    };
    m.refusesModel = proto.refusesModel.bind(m);
    const lifts = () => proto.limitLiftsAt.call(m, KEY) as number | null | undefined;
    // The session's own account (the main one) and Personal are at the Fable-only limit; Work has usage but turns Fable away.
    const fableLimitUntil = (resetsAt: number) => {
      const u = claudeUsageOf([['weekly_all', 20], ['weekly_fable', 100, 'fable']], fableOnly(resetsAt));
      u.windows[1].resetsAt = resetsAt;
      return u;
    };
    reads.set(undefined, fableLimitUntil(later));
    reads.set(a.id, claudeUsageOf([['weekly_all', 10]]));
    reads.set(b.id, fableLimitUntil(sooner));
    assert.equal(lifts(), sooner, 'Work is left out for Fable: the earliest Fable reset among the others');
    refused = false;
    assert.equal(lifts(), null, 'where Work takes Fable, a session can go on there now');
    refused = true;
    family = 'sonnet';
    assert.equal(lifts(), null, 'a Sonnet session is not held back by a limit of Fable alone: usage now');
    // With no model known, every limit counts: Work (which turns nothing away for it) has usage, the others do not.
    family = null;
    assert.equal(lifts(), null);
    reads.set(a.id, fableLimitUntil(later + HOUR));
    assert.equal(lifts(), sooner, 'and with Work at the limit too, the earliest reset of them all');
  } finally {
    for (const x of [a, b]) removeAccount(db, x.id, true);
  }
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
