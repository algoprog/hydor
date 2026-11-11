import assert from 'node:assert/strict';
import test from 'node:test';
import { solve } from '../src/solve.mjs';

test('the sample', () => {
  const input = '5\n5 1 2\n233 100 199\n1000000 233 234\n57306 0 1\n57307 0 1\n';
  assert.equal(solve(input).trim(), ['4', '1', '5563182', '998216169', '25736'].join('\n'));
});

test('the smallest inputs', () => {
  // N = 1: f(0, 1) is called by (0, 1) and (1, 1).
  assert.equal(solve('1\n1 0 1\n').trim(), '2');
  // N = 2, f(1, 2): (1, 2) itself, and (2, ?) cannot reach it beyond N.
  assert.equal(solve('1\n2 1 2\n').trim(), '1');
});

test('a number above 2^53 is handled exactly', () => {
  // m = N: only f(n, N) itself is called, for any n, and the answer for n = 0 is 1 + phi(1) = 2.
  const N = 10n ** 18n;
  assert.equal(solve(`2\n${N} 12345 ${N}\n${N} 0 ${N}\n`).trim(), '1\n2');
});
