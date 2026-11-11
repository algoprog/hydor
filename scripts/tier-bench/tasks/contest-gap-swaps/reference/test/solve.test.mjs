import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve } from '../src/solve.mjs';

test('sample 1', () => {
  assert.equal(solve('6\n6 2 3 5 4 1\n').trim(), '2');
});

test('sample 2: already sorted', () => {
  assert.equal(solve('3\n1 2 3\n').trim(), '0');
});

test('two elements swapped', () => {
  assert.equal(solve('2\n2 1\n').trim(), '1');
});

test('the whole line shifted by one takes N - 1 operations', () => {
  assert.equal(solve('5\n2 3 4 5 1\n').trim(), '4');
  assert.equal(solve('5\n5 1 2 3 4\n').trim(), '4');
});

test('a reversed line of 6 takes 3 operations: 1 and 6, then 2 and 5, then 3 and 4 become neighbours', () => {
  assert.equal(solve('6\n6 5 4 3 2 1\n').trim(), '3');
});

test('answers beyond 32 bits are exact', () => {
  const n = 200000;
  const p = Array.from({ length: n }, (_, i) => ((i + n / 2) % n) + 1);
  // Shifting by n/2: the distances add up to n * n / 2 and there are n * n / 4 inversions.
  assert.equal(solve(`${n}\n${p.join(' ')}\n`).trim(), String((n * n) / 4));
});
