import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve } from '../src/solve.mjs';

const sample = `6
3 3
1 2
2 3
1 3
10 5
1 4
3 7
6 10
1 4
2 6
2 1
1 2
4 3
1 3
3 4
2 4
4 3
1 2
3 4
1 4
5 3
1 5
1 5
1 5
`;

test('the sample', () => {
  assert.equal(solve(sample), 'No\nYes\nYes\nYes\nNo\nYes\n');
});

test('one interval needs two positions', () => {
  assert.equal(solve('2\n2 1\n1 2\n5 1\n2 3\n'), 'Yes\nYes\n');
});

test('nested intervals: the inner one decides', () => {
  assert.equal(solve('2\n6 2\n1 6\n3 4\n6 2\n1 6\n3 5\n'), 'Yes\nYes\n');
  assert.equal(solve('1\n6 3\n1 6\n3 4\n1 3\n'), 'No\n');
});

test('windows of two lengths cannot both hold two', () => {
  assert.equal(solve('1\n7 9\n1 3\n2 4\n3 5\n4 6\n5 7\n1 4\n2 5\n3 6\n4 7\n'), 'No\n');
});

test('many small cases in one input', () => {
  const parts = ['1000'];
  for (let i = 0; i < 1000; i++) parts.push('2 1', '1 2');
  assert.equal(solve(parts.join('\n') + '\n'), 'Yes\n'.repeat(1000));
});
