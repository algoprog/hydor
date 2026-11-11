// Script test for the work tray's list (work.ts): which child sessions and background tasks it holds, their states, the
// order (what needs you, what runs, what ended newest first), the line that sums them up, and what Stop says it stops.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/work-test.ts && node dist/dev/work-test.js
import assert from 'node:assert/strict';
import type { BackgroundTask, SessionSummary } from '@shared/types';
import { childrenOf, childState, needsLine, stopWords, taskKindLabel, taskKindOf, taskState, workItems, workSummary } from './work';

let n = 0;
const ses = (more: Partial<SessionSummary> = {}): SessionSummary => ({ key: `claude:c${++n}`, agent: 'claude', id: String(n), title: `Child ${n}`, stats: {} as SessionSummary['stats'], ...more });
const live = (status: string, more: Record<string, unknown> = {}) => ({ status, startedAt: 1, pendingApprovals: 0, ...more }) as unknown as SessionSummary['live'];
const task = (id: string, status: string, more: Partial<BackgroundTask> = {}): BackgroundTask => ({ id, description: id, kind: 'local_bash', status, ...more });
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

test('a session’s children are the sessions that name it as their parent, oldest first; a swarm lead has none here', () => {
  const lead = ses({ key: 'claude:lead' });
  const a = ses({ extra: { parent: 'claude:lead' }, createdAt: 20 });
  const b = ses({ extra: { parent: 'claude:lead' }, createdAt: 10 });
  const other = ses({ extra: { parent: 'claude:else' } });
  const byKey = Object.fromEntries([lead, a, b, other].map((x) => [x.key, x]));
  assert.deepEqual(childrenOf(byKey, 'claude:lead').map((x) => x.key), [b.key, a.key]);
  assert.deepEqual(childrenOf(byKey, 'claude:none'), []);
  const swarm = { ...lead, extra: { swarm: true as const } };
  assert.deepEqual(childrenOf({ ...byKey, [swarm.key]: swarm }, 'claude:lead'), []);
});

test('a child is waiting for you, at work (also kept working by helpers of its own), done, failed, or stopped with its parent', () => {
  assert.equal(childState(ses({ live: live('waiting') })), 'needs');
  assert.equal(childState(ses({ live: live('working') })), 'running');
  assert.equal(childState(ses({ live: live('starting') })), 'running');
  assert.equal(childState(ses({ live: live('idle'), helpers: 1 })), 'running');
  assert.equal(childState(ses({ live: live('idle') })), 'done');
  assert.equal(childState(ses({ live: null, updatedAt: 5 })), 'done');
  assert.equal(childState(ses({ live: live('error', { error: 'boom' }) })), 'failed');
  assert.equal(childState(ses({ live: null, updatedAt: 1000, extra: { stoppedWithParent: 990 } })), 'stopped');
  // It went on after the stop (you gave it more to do, and it finished): done.
  assert.equal(childState(ses({ live: null, updatedAt: 990 + 10 * 60_000, extra: { stoppedWithParent: 990 } })), 'done');
});

test('a task’s state and kind', () => {
  assert.equal(taskState(task('a', 'running')), 'running');
  assert.equal(taskState(task('a', 'completed')), 'done');
  assert.equal(taskState(task('a', 'failed')), 'failed');
  assert.equal(taskState(task('a', 'stopped')), 'stopped');
  assert.equal(taskState(task('a', 'killed')), 'stopped');
  assert.deepEqual(['local_bash', 'local_agent', 'monitor_mcp', 'local_workflow', 'x', undefined].map(taskKindOf), ['command', 'subagent', 'monitor', 'workflow', 'task', 'task']);
  assert.deepEqual(['local_bash', 'local_agent', 'monitor', 'workflow', 'x'].map(taskKindLabel), ['Command', 'Subagent', 'Monitor', 'Workflow', 'Background task']);
});

test('the order: what needs you, what runs (oldest first), then what ended, newest first, children and tasks together', () => {
  const waits = ses({ key: 'claude:waits', live: live('waiting', { turnStartedAt: 500 }) });
  const runsOld = ses({ key: 'claude:old', live: live('working', { turnStartedAt: 100 }) });
  const doneKid = ses({ key: 'claude:doneKid', live: null, updatedAt: 3000 });
  const items = workItems(
    [doneKid, runsOld, waits],
    [task('t-done-old', 'completed', { startedAt: 1, endedAt: 2000 }), task('t-run', 'running', { startedAt: 300 }), task('t-failed', 'failed', { startedAt: 1, endedAt: 4000 }), task('t-stopped', 'stopped', { startedAt: 1 })],
  );
  assert.deepEqual(
    items.map((i) => i.id),
    ['claude:waits', 'claude:old', 't-run', 't-failed', 'claude:doneKid', 't-done-old', 't-stopped'],
  );
  assert.deepEqual(items.map((i) => i.state), ['needs', 'running', 'running', 'failed', 'done', 'done', 'stopped']);
});

test('a task listed twice is one row, and nothing at all is an empty list', () => {
  assert.deepEqual(workItems([], [task('a', 'running'), task('a', 'completed')]).map((i) => [i.id, i.state]), [['a', 'running']]);
  assert.deepEqual(workItems([], []), []);
});

test('the line that sums it up: what runs, who needs you, or that all is done', () => {
  const kid = (state: 'working' | 'waiting' | 'idle') => ses({ live: live(state) });
  let w = workSummary(workItems([kid('working'), kid('working'), kid('idle')], [task('a', 'running'), task('b', 'completed')]));
  assert.deepEqual([w.text, w.needs, w.children, w.tasks], ['2 helper sessions and 1 background task running', 0, 2, 1]);
  w = workSummary(workItems([kid('waiting')], []));
  assert.deepEqual([w.text, w.needs], ['1 helper session running', 1]);
  w = workSummary(workItems([], [task('a', 'running'), task('b', 'running')]));
  assert.equal(w.text, '2 background tasks running');
  w = workSummary(workItems([kid('idle'), kid('idle'), kid('idle')], [task('a', 'completed'), task('b', 'failed')]));
  assert.equal(w.text, '3 helper sessions · 2 background tasks · all done');
  assert.equal(workSummary(workItems([kid('idle')], [])).text, '1 helper session · all done');
  assert.equal(workSummary(workItems([], [task('a', 'stopped')])).text, '1 background task · all done');
  assert.equal(needsLine(1), '1 needs you');
  assert.equal(needsLine(3), '3 need you');
});

test('what Stop says it stops: the turn, the tasks and the helper sessions, each case in its own words', () => {
  assert.deepEqual(stopWords(true, 0, 0), { note: null, label: 'Stop the current turn' });
  assert.equal(stopWords(true, 2, 1).note, 'Stops this turn, 2 background tasks and 1 helper session');
  assert.equal(stopWords(true, 1, 0).note, 'Stops this turn and 1 background task');
  assert.equal(stopWords(true, 0, 2).note, 'Stops this turn and 2 helper sessions');
  assert.equal(stopWords(false, 1, 0).note, 'Stops 1 background task');
  assert.equal(stopWords(false, 0, 2).note, 'Stops 2 helper sessions');
  assert.equal(stopWords(false, 3, 1).note, 'Stops 3 background tasks and 1 helper session');
  assert.equal(stopWords(false, 3, 1).label, 'Stop 3 background tasks and 1 helper session');
});

console.log(`${passed}/${total} passed`);
