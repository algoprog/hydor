// Script tests for where a turn's time went (turnTime.ts): the model's own time, its steps by kind, the time a card waited
// for the user taken from the step that waited, steps that ran side by side fitted into the turn, and the rest; the parts
// always add up to the turn. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/session/turnTime-test.ts && node dist/dev/turnTime-test.js
import assert from 'node:assert/strict';
import type { TimelineItem, ToolCategory } from '@shared/types';
import { timeSplit, type Turn } from './turnTime';

let passed = 0;
const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);
const S = 1000;
const t0 = 1_800_000_000_000;
let seq = 0;
const step = (category: ToolCategory, ms: number): TimelineItem => ({ kind: 'tool', id: `t${++seq}`, seq, tool: { name: 'x', category, title: 'x', status: 'ok', durationMs: ms } }) as TimelineItem;
const thought = (ms: number): TimelineItem => ({ kind: 'thinking', id: `h${++seq}`, seq, text: 'x', durationMs: ms }) as TimelineItem;
const turn = (durationMs: number, more: Partial<Turn> = {}): Turn => ({ kind: 'turn', id: 'turn:1', seq: 0, status: 'completed', durationMs, ...more }) as Turn;
const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

test('the model, the steps by kind, and the rest', () => {
  const r = timeSplit(turn(60 * S, { modelMs: 20 * S }), [step('command', 25 * S), step('read', 3 * S), step('edit', 2 * S)], t0, []);
  assert.deepEqual(r, { model: 20 * S, commands: 25 * S, files: 5 * S, web: 0, other: 0, wait: 0, rest: 10 * S });
});

test('a card that waited for the user: the wait is the user’s, not the step’s', () => {
  const r = timeSplit(turn(100 * S, { modelMs: 10 * S }), [step('command', 70 * S)], t0, [{ kind: 'command', at: t0 + 20 * S, until: t0 + 80 * S }]);
  assert.equal(r.wait, 60 * S);
  assert.equal(r.commands, 10 * S);
  assert.equal(sum(r), 100 * S);
  // A wait before the turn began, or after it ended, is another turn's.
  const other = timeSplit(turn(10 * S), [], t0, [
    { kind: 'tool', at: t0 - 50 * S, until: t0 - 40 * S },
    { kind: 'tool', at: t0 + 5 * S, until: t0 + 30 * S },
  ]);
  assert.equal(other.wait, 5 * S);
});

test('steps side by side fit into the turn; the parts always add up to it', () => {
  const r = timeSplit(turn(30 * S, { modelMs: 10 * S }), [step('task', 40 * S), step('task', 40 * S), step('web', 20 * S)], t0, []);
  assert.equal(r.model, 10 * S);
  assert.ok(Math.abs(r.other + r.web - 20 * S) < 1, 'what is left of the turn');
  assert.ok(Math.abs(r.other / r.web - 4) < 1e-9, 'in proportion');
  assert.ok(Math.abs(sum(r) - 30 * S) < 1);
});

test('without the model’s own time (Codex, ACP agents): its thinking stands for it', () => {
  const r = timeSplit(turn(20 * S), [thought(4 * S), step('command', 6 * S)], t0, []);
  assert.deepEqual([r.model, r.commands, r.rest], [4 * S, 6 * S, 10 * S]);
});

for (const [name, fn] of tests) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n     ${(e as Error).message.split('\n').join('\n     ')}`);
  }
}
console.log(`\n${passed}/${tests.length} passed`);
if (passed !== tests.length) process.exit(1);
