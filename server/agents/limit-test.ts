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
