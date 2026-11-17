// Script test for the work tray's list (work.ts): which Hydor subagents (child sessions) and background tasks it holds, their states, the
// order (what needs you, what runs, what ended newest first), the line that sums them up, and what Stop says it stops.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/lib/work-test.ts && node dist/dev/work-test.js
import assert from 'node:assert/strict';
import type { BackgroundTask, SessionSummary, TimelineItem, ToolSubagent } from '@shared/types';
import { childrenOf, childState, needsLine, programSubs, stopWords, taskKindLabel, taskKindOf, taskState, workItems, workSummary } from './work';

let n = 0;
const ses = (more: Partial<SessionSummary> = {}): SessionSummary => ({ key: `claude:c${++n}`, agent: 'claude', id: String(n), title: `Child ${n}`, stats: {} as SessionSummary['stats'], ...more });
const live = (status: string, more: Record<string, unknown> = {}) => ({ status, startedAt: 1, pendingApprovals: 0, ...more }) as unknown as SessionSummary['live'];
const task = (id: string, status: string, more: Partial<BackgroundTask> = {}): BackgroundTask => ({ id, description: id, kind: 'local_bash', status, ...more });
const call = (id: string, sub: Partial<ToolSubagent> = {}, ts = 100): TimelineItem =>
  ({ kind: 'tool', id, seq: 1, ts, tool: { name: 'Agent', title: 'Agent', category: 'agent', status: 'completed', subagent: { title: `Sub ${id}`, state: 'running', ...sub } } }) as unknown as TimelineItem;
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
  assert.deepEqual(['local_bash', 'local_agent', 'monitor', 'workflow', 'x'].map((k) => taskKindLabel(k)), ['Command', 'Subagent', 'Monitor', 'Workflow', 'Background task']);
  // With the program's name, a subagent task says whose it is; the other kinds do not change.
  assert.equal(taskKindLabel('local_agent', 'Claude Code'), 'Claude Code subagent');
  assert.equal(taskKindLabel('local_agent', 'Codex'), 'Codex subagent');
  assert.equal(taskKindLabel('local_bash', 'Claude Code'), 'Command');
  assert.equal(taskKindLabel('monitor', 'Codex'), 'Monitor');
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
  assert.deepEqual([w.text, w.needs, w.children, w.tasks], ['2 subagents and 1 background task running', 0, 2, 1]);
  w = workSummary(workItems([kid('waiting')], []));
  assert.deepEqual([w.text, w.needs], ['1 subagent running', 1]);
  w = workSummary(workItems([], [task('a', 'running'), task('b', 'running')]));
  assert.equal(w.text, '2 background tasks running');
  w = workSummary(workItems([kid('idle'), kid('idle'), kid('idle')], [task('a', 'completed'), task('b', 'failed')]));
  assert.equal(w.text, '3 subagents · 2 background tasks · all done');
  assert.equal(workSummary(workItems([kid('idle')], [])).text, '1 subagent · all done');
  assert.equal(workSummary(workItems([], [task('a', 'stopped')])).text, '1 background task · all done');
  assert.equal(needsLine(1), '1 needs you');
  assert.equal(needsLine(3), '3 need you');
});

test('the program’s own subagents (tasks of kind subagent) count as subagents, not as background tasks', () => {
  const kid = (state: 'working' | 'waiting' | 'idle') => ses({ live: live(state) });
  const agent = (id: string, status: string) => task(id, status, { kind: 'local_agent' });
  // One Hydor subagent and one program subagent running, and a command.
  let w = workSummary(workItems([kid('working')], [agent('a', 'running'), task('c', 'running')]));
  assert.equal(w.text, '2 subagents and 1 background task running');
  // The fields Stop all uses keep their meaning: Hydor subagents, and every running task.
  assert.deepEqual([w.children, w.tasks], [1, 2]);
  assert.equal(workSummary(workItems([], [agent('a', 'running'), agent('b', 'running')])).text, '2 subagents running');
  assert.equal(workSummary(workItems([], [agent('a', 'running')])).text, '1 subagent running');
  assert.equal(workSummary(workItems([], [agent('a', 'running'), task('c', 'running'), task('d', 'running')])).text, '1 subagent and 2 background tasks running');
  // A finished program subagent is no longer running: the command is.
  assert.equal(workSummary(workItems([], [agent('a', 'completed'), task('c', 'running')])).text, '1 background task running');
  // Nothing running: the same split over every item.
  w = workSummary(workItems([kid('idle')], [agent('a', 'completed'), agent('b', 'failed'), task('c', 'completed')]));
  assert.equal(w.text, '3 subagents · 1 background task · all done');
  assert.equal(workSummary(workItems([], [agent('a', 'completed')])).text, '1 subagent · all done');
  assert.equal(workSummary(workItems([], [agent('a', 'stopped'), agent('b', 'stopped')])).text, '2 subagents · all done');
});

test('the program’s subagents: one for each call that started one, one for each task no call matched', () => {
  const items = [call('c1', { id: 'a1', type: 'Explore', model: 'sonnet' }), call('c2', { state: 'done', endedAt: 900 }, 200), { kind: 'assistant', id: 'x', seq: 3, text: 'hi' } as TimelineItem];
  // No tasks: the call's own state, its key made from its id.
  let subs = programSubs('claude', items, [], true);
  assert.equal(subs.length, 2);
  assert.deepEqual(subs[0], { key: 'claude:agent-a1', id: 'a1', toolUseId: 'c1', title: 'Sub c1', type: 'Explore', model: 'sonnet', state: 'running', startedAt: 100 });
  assert.deepEqual([subs[1].key, subs[1].state, subs[1].startedAt, subs[1].endedAt], [undefined, 'done', 200, 900]);
  // A running subagent died with its program when that no longer runs.
  assert.deepEqual(programSubs('claude', items, [], false).map((x) => x.state), ['stopped', 'done']);
  // Codex's older rollouts never wrote that a subagent finished: with its program gone, it counts as done.
  assert.deepEqual(programSubs('codex', items, [], false).map((x) => x.state), ['done', 'done']);
  // A task by the subagent's id, or by the call's id, says how it stands, and gives a call without a key its key.
  const byId = task('a1', 'completed', { kind: 'local_agent', startedAt: 150, endedAt: 450 });
  const byCall = task('t9', 'failed', { kind: 'local_agent', toolUseId: 'c2', startedAt: 250 });
  subs = programSubs('claude', items, [byId, byCall], true);
  assert.deepEqual(subs.map((x) => [x.state, x.startedAt, x.endedAt]), [['done', 150, 450], ['failed', 250, 900]]);
  assert.deepEqual(subs.map((x) => x.key), ['claude:agent-a1', 'claude:agent-t9']);
  // Codex keys are the thread's id.
  assert.equal(programSubs('codex', [call('c1', { id: 'th1' })], [], true)[0].key, 'codex:th1');
  // A task no call matched is one of its own, titled by its description; commands are not subagents; a task listed twice is one.
  const lone = task('z1', 'running', { kind: 'local_agent', description: 'Search the docs', startedAt: 50, toolUseId: 'gone' });
  subs = programSubs('claude', [call('c1', { id: 'a1' })], [lone, { ...lone, status: 'completed' }, task('cmd', 'running')], true);
  assert.equal(subs.length, 2);
  assert.deepEqual([subs[1].key, subs[1].title, subs[1].state, subs[1].toolUseId], ['claude:agent-z1', 'Search the docs', 'running', 'gone']);
});

test('the tray: a program subagent replaces the agent tasks it covers, is ordered as the rest, and counts as a subagent', () => {
  const items = [call('c1', { id: 'a1' }, 100), call('c2', { id: 'a2', state: 'done', endedAt: 5000 }, 200)];
  const tasks = [task('a1', 'running', { kind: 'local_agent', startedAt: 100 }), task('a2', 'completed', { kind: 'local_agent', endedAt: 4000 }), task('cmd', 'running', { startedAt: 300 })];
  const subs = programSubs('claude', items, tasks, true);
  const w = workItems([], tasks, subs);
  // No duplicates: the two agent tasks are the two subagent rows, and the command stays a task.
  assert.deepEqual(w.map((i) => [i.type, i.id, i.state]), [['sub', 'claude:agent-a1', 'running'], ['task', 'cmd', 'running'], ['sub', 'claude:agent-a2', 'done']]);
  const sum = workSummary(w);
  assert.equal(sum.text, '1 subagent and 1 background task running');
  assert.deepEqual([sum.children, sum.tasks], [0, 2]);
  // With a Hydor subagent too, and with everything done.
  assert.equal(workSummary(workItems([ses({ live: live('working') })], tasks, subs)).text, '2 subagents and 1 background task running');
  assert.equal(workSummary(workItems([], [], programSubs('codex', [call('c1', { id: 'th', state: 'done' }), call('c2', { state: 'failed' })], [], true))).text, '2 subagents · all done');
  // Without the subagents given, an agent task is a task row, as before.
  assert.deepEqual(workItems([], tasks).map((i) => i.type), ['task', 'task', 'task']);
  // A subagent still running that nothing lists (its program is gone) is stopped and does not count as running.
  const dead = workItems([], [], programSubs('claude', [call('c1', { id: 'a1' })], [], false));
  assert.deepEqual(dead.map((i) => i.state), ['stopped']);
  assert.equal(workSummary(dead).text, '1 subagent · all done');
});

test('what Stop says it stops: the turn, the subagents and the background tasks, each case in its own words', () => {
  assert.deepEqual(stopWords(true, 0, 0), { note: null, label: 'Stop the current turn' });
  assert.equal(stopWords(true, 2, 1).note, 'Stops this turn, 2 subagents and 1 background task');
  assert.equal(stopWords(true, 2, 1).label, 'Stop this turn, 2 subagents and 1 background task');
  assert.equal(stopWords(true, 2, 0).note, 'Stops this turn and 2 subagents');
  assert.equal(stopWords(true, 1, 0).label, 'Stop this turn and 1 subagent');
  assert.equal(stopWords(true, 0, 1).note, 'Stops this turn and 1 background task');
  assert.equal(stopWords(true, 0, 2).label, 'Stop this turn and 2 background tasks');
  assert.equal(stopWords(false, 2, 1).note, 'Stops 2 subagents and 1 background task');
  assert.equal(stopWords(false, 1, 3).label, 'Stop 1 subagent and 3 background tasks');
  assert.equal(stopWords(false, 2, 0).note, 'Stops 2 subagents');
  assert.equal(stopWords(false, 0, 1).note, 'Stops 1 background task');
  assert.equal(stopWords(false, 0, 3).label, 'Stop 3 background tasks');
});

console.log(`${passed}/${total} passed`);
