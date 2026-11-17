// Script tests for how a Claude session remembers that the plan's usage limit stopped it (ClaudeLive.limitStopped),
// which decides whether it continues by itself after the reset:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/agents/limit-test.ts && node dist/dev/limit-test.js
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ClaudeLive } from './claude.ts';

const make = () => {
  const runner = new EventEmitter() as any;
  runner.writeLine = () => {};
  const a = new ClaudeLive(runner, { sessionId: 's' } as any);
  let hits = 0;
  a.on('limithit', () => hits++);
  const line = (m: object) => runner.emit('line', JSON.stringify(m), false);
  return { a, line, hits: () => hits };
};
const limitError = { type: 'assistant', error: 'rate_limit', message: { content: [{ type: 'text', text: "You've hit your weekly limit" }] } };
const failed = { type: 'result', is_error: true, subtype: 'success', result: "You've hit your weekly limit · resets Nov 5" };

const hitSummary = (name: string) =>
  `Agent "${name}" failed: Agent terminated early due to an API error: You've hit your 5-hour limit · resets 4:20am (UTC) (error type rate_limit, HTTP 429, request id req_1, model sent to the API: claude-sonnet-5-5)`;
const started = (id: string, description: string) => ({ type: 'system', subtype: 'task_started', task_id: id, description, task_type: 'local_agent', tool_use_id: `tu_${id}` });
const notice = (id: string, status: string, summary: string) => ({ type: 'system', subtype: 'task_notification', task_id: id, status, summary });

const tests: [string, () => void][] = [
  [
    'a turn stopped by the limit stays stopped through a turn the CLI starts itself without reaching the model',
    () => {
      const t = make();
      t.line(limitError);
      t.line(failed);
      assert.equal(t.a.limitStopped, true);
      // A background task's notice: the CLI runs a turn that asks the model nothing.
      t.line({ type: 'user', message: { role: 'user', content: '<task-notification>failed</task-notification>' } });
      t.line({ type: 'result', is_error: false, subtype: 'success', result: '', usage: { output_tokens: 0 } });
      assert.equal(t.a.limitStopped, true);
      assert.equal(t.hits(), 2, 'no new limit hit for the quiet turn');
    },
  ],
  [
    'a turn that got through clears it',
    () => {
      const t = make();
      t.line(limitError);
      t.line(failed);
      t.line({ type: 'result', is_error: false, subtype: 'success', result: 'Done', usage: { output_tokens: 120 } });
      assert.equal(t.a.limitStopped, false);
    },
  ],
  [
    'the notice turn hitting the limit again keeps it stopped',
    () => {
      const t = make();
      t.line(failed);
      t.line(limitError);
      t.line(failed);
      assert.equal(t.a.limitStopped, true);
    },
  ],
  [
    'a subagent the usage limit stopped is kept, with what it was doing',
    () => {
      const t = make();
      t.line(started('t1', 'Check the logs'));
      t.line(notice('t1', 'failed', hitSummary('Check the logs')));
      assert.deepEqual([...t.a.limitTasks], [['t1', 'Check the logs']]);
    },
  ],
  [
    'a subagent that failed for another reason is not kept',
    () => {
      const t = make();
      t.line(started('t1', 'Check the logs'));
      t.line(notice('t1', 'failed', 'Agent "Check the logs" failed: Request was aborted'));
      assert.equal(t.a.limitTasks.size, 0);
    },
  ],
  [
    'a later notice of another kind for it removes it',
    () => {
      const t = make();
      t.line(started('t1', 'Check the logs'));
      t.line(notice('t1', 'failed', hitSummary('Check the logs')));
      assert.equal(t.a.limitTasks.size, 1);
      t.line(notice('t1', 'completed', 'Agent "Check the logs" completed'));
      assert.equal(t.a.limitTasks.size, 0);
    },
  ],
  [
    'a task that runs again (a task_updated to running, or a new task_started) removes it',
    () => {
      const t = make();
      t.line(started('t1', 'Check the logs'));
      t.line(started('t2', 'Read the docs'));
      t.line(notice('t1', 'failed', hitSummary('Check the logs')));
      t.line(notice('t2', 'failed', hitSummary('Read the docs')));
      assert.equal(t.a.limitTasks.size, 2);
      t.line({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { status: 'running' } });
      assert.deepEqual([...t.a.limitTasks.keys()], ['t2']);
      t.line(started('t2', 'Read the docs'));
      assert.equal(t.a.limitTasks.size, 0);
    },
  ],
  [
    'a task_updated that is not to running leaves it',
    () => {
      const t = make();
      t.line(started('t1', 'Check the logs'));
      t.line(notice('t1', 'failed', hitSummary('Check the logs')));
      t.line({ type: 'system', subtype: 'task_updated', task_id: 't1', patch: { description: 'Other' } });
      assert.equal(t.a.limitTasks.size, 1);
    },
  ],
  [
    'a notice with no task_started uses the quoted name, else the id',
    () => {
      const t = make();
      t.line(notice('t1', 'failed', hitSummary('Review the diff')));
      t.line(notice('t2', 'failed', "Agent terminated early: You've hit your weekly limit"));
      assert.equal(t.a.limitTasks.get('t1'), 'Review the diff');
      assert.equal(t.a.limitTasks.get('t2'), 't2');
    },
  ],
  [
    'replayed lines fill it too',
    () => {
      const runner = new EventEmitter() as any;
      runner.writeLine = () => {};
      const a = new ClaudeLive(runner, { sessionId: 's' } as any);
      runner.emit('line', JSON.stringify(started('t1', 'Check the logs')), true);
      runner.emit('line', JSON.stringify(notice('t1', 'failed', hitSummary('Check the logs'))), true);
      assert.deepEqual([...a.limitTasks], [['t1', 'Check the logs']]);
    },
  ],
];

let passed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).message}`);
    process.exitCode = 1;
  }
}
console.log(`${passed} of ${tests.length} passed`);
