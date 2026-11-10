import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, applyDiff } from '../src/diff.mjs';

test('diffLines', () => {
  assert.deepEqual(diffLines(['a', 'b', 'c'], ['a', 'x', 'c']).map((d) => d.op + ' ' + d.line), ['equal a', 'delete b', 'insert x', 'equal c']);
  assert.deepEqual(diffLines(['x', 'y'], ['y', 'x']).map((d) => d.op + ' ' + d.line), ['delete x', 'equal y', 'insert x']);
  assert.deepEqual(diffLines([], []), []);
});

test('applyDiff', () => {
  const a = ['a', 'b', 'c'];
  const b = ['b', 'q', 'c', 'd'];
  assert.deepEqual(applyDiff(a, diffLines(a, b)), b);
  assert.throws(() => applyDiff(['a'], [{ op: 'equal', line: 'b' }]), Error);
  assert.throws(() => applyDiff(['a', 'b'], [{ op: 'equal', line: 'a' }]), Error);
});
