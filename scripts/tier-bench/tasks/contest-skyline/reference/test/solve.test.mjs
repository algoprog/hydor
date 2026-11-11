import assert from 'node:assert/strict';
import test from 'node:test';
import { solve } from '../src/solve.mjs';

test('sample 1', () => {
  assert.equal(solve('4\n2 2 3\n').trim(), '3');
});

test('sample 2: no sequence gives these counts', () => {
  assert.equal(solve('3\n2 1\n').trim(), '0');
});

test('sample 3', () => {
  assert.equal(solve('7\n3 3 3 3 4 4\n').trim(), '85');
});

test('two buildings: either order sees both from the middle', () => {
  assert.equal(solve('2\n2\n').trim(), '2');
  assert.equal(solve('2\n1\n').trim(), '0');
});

test('buildings in increasing height: the counts are 1 + N - x, and only that row gives them', () => {
  const N = 6;
  const C = Array.from({ length: N - 1 }, (_, i) => 1 + N - (i + 1));
  assert.equal(solve(`${N}\n${C.join(' ')}\n`).trim(), '1');
});

test('counts as big as N are handled exactly', () => {
  const N = 200000;
  const C = Array.from({ length: N - 1 }, (_, i) => 1 + N - (i + 1));
  assert.equal(solve(`${N}\n${C.join(' ')}\n`).trim(), '1');
  // The second count one too small: the sum of 2^-C then is not what any row of buildings gives.
  C[1]--;
  assert.equal(solve(`${N}\n${C.join(' ')}\n`).trim(), '0');
});
