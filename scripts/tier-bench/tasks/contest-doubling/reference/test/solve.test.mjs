import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve } from '../src/solve.mjs';

test('the samples', () => {
  assert.equal(solve('2 5\n1 1\n'), '2 1 1 1 0\n');
  assert.equal(solve('2 4\n1 0\n'), '1 1 1 0\n');
  assert.equal(solve('1 1\n0\n'), '0\n');
  assert.equal(solve('3 4\n0 0 2\n'), '1 1 0 0\n');
  assert.equal(solve('4 7\n1 0 1 0\n'), '2 3 4 4 5 5 5\n');
});

test('one position: k operations give one sequence while k <= X', () => {
  assert.equal(solve('1 5\n3\n'), '1 1 1 0 0\n');
});

test('a doubling chain: the number made at one position is used at the next', () => {
  // (1,0,0): one operation gives (0,2,0), which allows up to 2 at position 2 and then the new ones at 3.
  assert.equal(solve('3 7\n1 0 0\n'), '1 1 2 2 1 1 1\n');
});

test('the counts are taken modulo 998244353', () => {
  const out = solve('20 300\n' + Array(20).fill(250000).join(' ') + '\n').trim().split(' ').map(Number);
  assert.equal(out.length, 300);
  assert.ok(out.every((v) => Number.isInteger(v) && v >= 0 && v < 998244353));
  assert.ok(out.some((v) => v > 1000000));
});
