// Script test for the stops a page shows (stopping.ts): what a Stop is from what a session does as you press it, how a live
// state, its approvals and its conversation show it stopped until the session says so itself, and the registry that keeps
// the stops shown (a fake host and clock stand in for the page's stores and timers).
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/stopping-test.ts && node dist/dev/stopping-test.js
import assert from 'node:assert/strict';
import type { LiveOverlay, LiveState, SessionSummary, TimelineItem } from '@shared/types';
import {
  STOP_SHOWN_MS,
  lastEnd,
  stopOf,
  stopRegistry,
  stoppedLive,
  stoppedOverlay,
  stoppedTurn,
  type Stop,
  type StopClock,
  type StopHost,
} from './stopping';

const live = (status: LiveState['status'], more: Partial<LiveState> = {}): LiveState => ({ status, startedAt: 1, pendingApprovals: 0, ...more });
const working = (turnStartedAt: number, more: Partial<LiveState> = {}): LiveState => live('working', { turnStartedAt, ...more });
const overlay = (approvals: LiveOverlay['approvals'] = []): LiveOverlay => ({ items: [], patches: {}, approvals });
const user = (id: string): TimelineItem => ({ kind: 'user', id, seq: 0, ts: 1000, text: 'hi' }) as TimelineItem;
const asst = (id: string, streaming: boolean): TimelineItem => ({ kind: 'assistant', id, seq: 0, ts: 1000, text: 'x', streaming }) as TimelineItem;
const tool = (id: string, status: string): TimelineItem => ({ kind: 'tool', id, seq: 0, ts: 1000, tool: { name: 'Bash', category: 'command', title: 'ls', status } }) as TimelineItem;
const end = (id: string): TimelineItem => ({ kind: 'turn', id, seq: 0, ts: 1000, status: 'done' }) as TimelineItem;
const stopped = (more: Partial<Stop> = {}): Stop => ({ at: 5000, scope: 'turn', turn: true, turnStartedAt: 2000, tasks: [], helpers: false, ...more });
const summary = (key: string, more: Partial<SessionSummary> = {}): SessionSummary => ({ key, agent: 'claude', id: '1', title: 't', stats: {} as SessionSummary['stats'], ...more });

let passed = 0;
let total = 0;
const test = (name: string, fn: () => void) => {
  total++;
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
};

// ---- a fake host and clock for the registry ---------------------------------------------

type Sess = ReturnType<StopHost['session']>;

function fakeHost() {
  const sessions = new Map<string, Sess>();
  const calls: string[] = [];
  const seen = { lastStops: {} as Record<string, Stop>, changed: 0 };
  const host: StopHost = {
    session: (key) => sessions.get(key) ?? {},
    show: (key) => {
      calls.push(`show:${key}`);
    },
    refresh: (key) => {
      calls.push(`refresh:${key}`);
    },
    changed: (stops) => {
      seen.changed++;
      seen.lastStops = stops;
    },
  };
  return { host, sessions, calls, seen };
}

interface Timer {
  fn: () => void;
  ms: number;
  cancelled: boolean;
}

function fakeClock() {
  const clk = { now: 0 };
  const timers: Timer[] = [];
  const clock: StopClock = {
    now: () => clk.now,
    later: (fn, ms) => {
      const t: Timer = { fn, ms, cancelled: false };
      timers.push(t);
      return t;
    },
    cancel: (t) => {
      (t as Timer).cancelled = true;
    },
  };
  return { clock, timers, clk };
}

function rig() {
  const h = fakeHost();
  const c = fakeClock();
  return { host: h, clk: c.clk, timers: c.timers, reg: stopRegistry(h.host, c.clock) };
}

// ---- pure functions ---------------------------------------------------------------------

test('stopOf: an idle session with no tasks and no subagents has nothing to stop', () => {
  assert.equal(stopOf('all', live('idle'), undefined, 5000), null);
});

test('stopOf: a working turn in scope turn is stopped with its start, and no tasks or subagents', () => {
  assert.deepEqual(stopOf('turn', working(100), undefined, 5000), { at: 5000, scope: 'turn', turn: true, turnStartedAt: 100, tasks: [], helpers: false });
});

test('stopOf: a waiting turn counts as a turn, and a starting session has no turn to stop', () => {
  assert.equal(stopOf('turn', live('waiting'), undefined, 1)?.turn, true);
  assert.equal(stopOf('turn', live('starting'), undefined, 1), null);
});

test('stopOf: a session waiting for its memory to be built gives no stop, even while working', () => {
  assert.equal(stopOf('turn', working(100, { memory: 'building' }), undefined, 1), null);
});

test('stopOf: scope all takes the running background tasks only, and scope turn takes none of them', () => {
  const l = live('idle', {
    backgroundTasks: [
      { id: 'a', description: 'x', status: 'running' },
      { id: 'b', description: 'y', status: 'completed' },
    ],
  });
  const s = stopOf('all', l, undefined, 1);
  assert.deepEqual(s?.tasks, ['a']);
  assert.equal(s?.turn, false);
  assert.equal(stopOf('turn', l, undefined, 1), null);
});

test('stopOf: Hydor subagents count only in scope all', () => {
  assert.equal(stopOf('all', live('idle'), 2, 5000)?.helpers, true);
  assert.equal(stopOf('turn', live('idle'), 2, 5000), null);
});

test('stoppedLive: the turn you stopped shows idle, with no start time and nothing waiting; the input is not changed', () => {
  const l = working(100, { model: 'm', pendingApprovals: 2 });
  const out = stoppedLive(stopped({ turnStartedAt: 100 }), l)!;
  assert.equal(out.status, 'idle');
  assert.equal('turnStartedAt' in out, false);
  assert.equal(out.pendingApprovals, 0);
  assert.equal(out.model, 'm');
  assert.equal(l.status, 'working');
  assert.equal(l.turnStartedAt, 100);
  assert.equal(l.pendingApprovals, 2);
});

test('stoppedLive: a turn that began at another time is a new one, so the very same live state comes back', () => {
  const l = working(200);
  assert.equal(stoppedLive(stopped({ turnStartedAt: 100 }), l), l);
});

test('stoppedLive: null gives null, and an idle live state with nothing to hide comes back as it is', () => {
  assert.equal(stoppedLive(stopped(), null), null);
  const idle = live('idle');
  assert.equal(stoppedLive(stopped({ turn: false, tasks: [] }), idle), idle);
});

test('stoppedLive: scope all ends the stopped background task and keeps the turn running, with the ended list after it', () => {
  const stop = stopped({ scope: 'all', turn: false, tasks: ['a'] });
  const a = { id: 'a', description: 'x', status: 'running' };
  const c = { id: 'c', description: 'z', status: 'running' };
  const old = { id: 'o', description: 'old', status: 'completed' };
  const out = stoppedLive(stop, working(100, { backgroundTasks: [a, c], endedTasks: [old] }))!;
  assert.equal(out.status, 'working');
  assert.deepEqual(out.backgroundTasks, [c]);
  assert.deepEqual(out.endedTasks, [{ id: 'a', description: 'x', status: 'stopped', endedAt: 5000 }, old]);
  assert.equal(a.status, 'running');
});

test('stoppedOverlay: a stopped turn that still shows as working drops its approval cards; an idle one keeps the overlay', () => {
  const card = { id: 'p1' } as any;
  const ov = overlay([card]);
  assert.deepEqual(stoppedOverlay(stopped({ turnStartedAt: 100 }), working(100), ov).approvals, []);
  assert.equal(ov.approvals.length, 1);
  assert.equal(stoppedOverlay(stopped(), live('idle'), ov), ov);
  const none = overlay();
  assert.equal(stoppedOverlay(stopped({ turnStartedAt: 100 }), working(100), none), none);
});

test('lastEnd: the id of the last turn end, and undefined when a conversation has none', () => {
  assert.equal(lastEnd([user('u1'), end('e1'), asst('a1', false), end('e2')]), 'e2');
  assert.equal(lastEnd([user('u1'), asst('a1', true)]), undefined);
  assert.equal(lastEnd([]), undefined);
});

test('stoppedTurn: what was under way shows stopped and an end "Stopped after" closes it; the items before are kept as they are', () => {
  const items = [user('u1'), asst('a1', true), tool('t1', 'running')];
  const r = stoppedTurn(items, stopped());
  assert.equal(r.length, 4);
  assert.equal(r[0], items[0]);
  assert.equal((r[1] as { streaming?: boolean }).streaming, false);
  assert.equal(items[1].kind === 'assistant' && items[1].streaming, true);
  assert.equal((r[2] as { tool: { status: string } }).tool.status, 'interrupted');
  assert.deepEqual(r[3], { kind: 'turn', id: 'stopped:5000', seq: 0, ts: 5000, status: 'interrupted', durationMs: 3000 });
});

test('stoppedTurn: a conversation that already ends its last turn, or is empty, comes back as the same array', () => {
  const ended = [user('u1'), tool('t1', 'running'), end('e1')];
  assert.equal(stoppedTurn(ended, stopped()), ended);
  const empty: TimelineItem[] = [];
  assert.equal(stoppedTurn(empty, stopped()), empty);
});

test('stoppedTurn: only the steps after the last turn end are changed; the earlier running step stays the same object', () => {
  const t0 = tool('t0', 'running');
  const t1 = tool('t1', 'running');
  const items = [user('u0'), t0, end('e0'), user('u1'), t1];
  const r = stoppedTurn(items, stopped());
  assert.equal(r.length, 6);
  assert.equal(r[1], t0);
  assert.equal((t0 as { tool: { status: string } }).tool.status, 'running');
  assert.equal((r[4] as { tool: { status: string } }).tool.status, 'interrupted');
  assert.equal((r[5] as { kind: string }).kind, 'turn');
});

test('stoppedTurn: a stop without a turn start gives its end no duration', () => {
  const r = stoppedTurn([user('u1')], { at: 5000, scope: 'turn', turn: true, tasks: [], helpers: false });
  assert.equal(r.length, 2);
  assert.equal('durationMs' in r[1], false);
});

// ---- the registry -----------------------------------------------------------------------

test('registry begin: an idle session is not stopped, shows nothing and changes nothing', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: live('idle'), overlay: overlay() } });
  assert.equal(r.reg.begin('k', 'turn'), false);
  assert.equal(r.host.calls.includes('show:k'), false);
  assert.equal(r.host.seen.changed, 0);
});

test('registry begin: a working turn is shown stopped at once, with a timer of STOP_SHOWN_MS', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  assert.equal(r.reg.begin('k', 'turn'), true);
  assert.ok(r.host.calls.includes('show:k'));
  assert.equal(r.host.seen.lastStops.k.turn, true);
  assert.equal(r.timers.length, 1);
  assert.equal(r.timers[0].ms, 20000);
  assert.equal(r.timers[0].ms, STOP_SHOWN_MS);
  assert.equal(r.reg.has('k'), true);
});

test('registry live: the stopped turn shows idle with nothing waiting while the session has not said it is over', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay([{ id: 'p1' } as any]) }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  const out = r.reg.live('k', working(100), overlay([{ id: 'p1' } as any]));
  assert.equal(out.live?.status, 'idle');
  assert.deepEqual(out.overlay.approvals, []);
});

test('registry: the stop ends once the session is idle and its end is in the conversation, which refreshes the session', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  const idle = live('idle');
  const still = r.reg.live('k', idle, overlay());
  assert.equal(r.reg.has('k'), true);
  assert.equal(still.live, idle);
  r.reg.items('k', [user('u1'), asst('a1', false), end('e1')]);
  assert.equal(r.reg.has('k'), false);
  assert.ok(r.host.calls.includes('refresh:k'));
  assert.deepEqual(r.host.seen.lastStops, {});
  assert.equal(r.timers[0].cancelled, true);
});

test('registry: the conversation end can come first; the stop then ends when the session goes idle', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  r.reg.items('k', [user('u1'), asst('a1', false), end('e1')]);
  assert.equal(r.reg.has('k'), true);
  r.reg.live('k', live('idle'), overlay());
  assert.equal(r.reg.has('k'), false);
});

test('registry: with no conversation open, or it still loading, the stop ends as soon as the session is idle', () => {
  const r = rig();
  r.host.sessions.set('none', { live: { live: working(100), overlay: overlay() } });
  r.host.sessions.set('loading', { live: { live: working(100), overlay: overlay() }, items: null });
  r.reg.begin('none', 'turn');
  r.reg.begin('loading', 'turn');
  r.reg.live('none', live('idle'), overlay());
  r.reg.live('loading', live('idle'), overlay());
  assert.equal(r.reg.has('none'), false);
  assert.equal(r.reg.has('loading'), false);
});

test('registry: a new turn in the live state counts as the stopped turn being over; with a conversation open the stop waits for its end', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  const newTurn = working(999);
  const out = r.reg.live('k', newTurn, overlay());
  assert.equal(out.live, newTurn);
  assert.equal(r.reg.has('k'), true);

  r.host.sessions.set('k2', { live: { live: working(100), overlay: overlay() } });
  r.reg.begin('k2', 'turn');
  r.reg.live('k2', working(999), overlay());
  assert.equal(r.reg.has('k2'), false);
});

test('registry timer: when the timer fires the stop ends and the session is refreshed', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  r.timers[0].fn();
  assert.equal(r.reg.has('k'), false);
  assert.ok(r.host.calls.includes('refresh:k'));
});

test('registry end: a message sent ends the stop, refreshes the session once, and cancels the timer', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  r.reg.end('k');
  assert.equal(r.reg.has('k'), false);
  assert.equal(r.host.calls.filter((c) => c === 'refresh:k').length, 1);
  assert.equal(r.timers[0].cancelled, true);
  r.reg.end('k');
  assert.equal(r.host.calls.filter((c) => c === 'refresh:k').length, 1);
});

test('registry begin: beginning a session that is already stopped says so and shows it only once', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  assert.equal(r.reg.begin('k', 'turn'), true);
  assert.equal(r.reg.begin('k', 'turn'), true);
  assert.equal(r.host.calls.filter((c) => c === 'show:k').length, 1);
});

test('registry summary: a Hydor subagent summary shows its helpers as none and its live state idle, and a copy of what was shown changes nothing', () => {
  const r = rig();
  const s0 = summary('k', { helpers: 2, live: working(100) });
  r.host.sessions.set('k', { summary: s0 });
  assert.equal(r.reg.begin('k', 'all'), true);
  const shown = r.reg.summary(s0);
  assert.equal(shown.helpers, 0);
  assert.equal(shown.live?.status, 'idle');
  r.reg.summary({ ...shown, title: 'renamed' });
  assert.equal(r.reg.has('k'), true);

  // A server summary that no longer says the subagents run and is idle ends the stop, and comes back as it is.
  const server = summary('k', { live: live('idle') });
  assert.equal(r.reg.summary(server), server);
  assert.equal(r.reg.has('k'), false);
});

test('registry summary: a summary carrying a live state the page showed is not news about the turn', () => {
  const r = rig();
  r.host.sessions.set('k', { live: { live: working(100), overlay: overlay() }, items: [user('u1')] });
  r.reg.begin('k', 'turn');
  const s0 = summary('k', { live: working(100) });
  const shown = r.reg.live('k', working(100), overlay()).live;
  r.reg.summary({ ...s0, live: shown });
  r.reg.items('k', [user('u1'), end('e1')]);
  assert.equal(r.reg.has('k'), true);
  r.reg.live('k', live('idle'), overlay());
  assert.equal(r.reg.has('k'), false);
});

test('registry summary: a stopped subagent gets its stop time as stoppedWithParent, and keeps its parent', () => {
  const r = rig();
  r.clk.now = 7000;
  const child = summary('c', { live: working(100) });
  r.host.sessions.set('c', { summary: child });
  assert.equal(r.reg.begin('c', 'all', true), true);
  const out = r.reg.summary(summary('c', { live: working(100), extra: { parent: 'p' } }));
  assert.deepEqual(out.extra, { parent: 'p', stoppedWithParent: 7000 });
});

test('registry: background tasks you stopped leave the live state at once and the stop ends when they are no longer running', () => {
  const r = rig();
  const task = { id: 'a', description: 'x', status: 'running' };
  r.host.sessions.set('k', { live: { live: live('idle', { backgroundTasks: [task] }), overlay: overlay() } });
  assert.equal(r.reg.begin('k', 'all'), true);
  const out = r.reg.live('k', live('idle', { backgroundTasks: [task] }), overlay());
  assert.deepEqual(out.live?.backgroundTasks, []);
  assert.equal(r.reg.has('k'), true);
  r.reg.live('k', live('idle', { backgroundTasks: [{ id: 'a', description: 'x', status: 'completed' }] }), overlay());
  assert.equal(r.reg.has('k'), false);
});

console.log(`${passed}/${total} passed`);
process.exit(process.exitCode ?? 0);
