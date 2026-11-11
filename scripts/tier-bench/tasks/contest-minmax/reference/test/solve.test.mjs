import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/solve.mjs';

test('sample 1', () => {
  assert.equal(solve('2 2 3\n').trim(), '67');
});

test('sample 2', () => {
  assert.equal(solve('99 82 44353\n').trim(), '213254234');
});

test('one value allowed: the only matrix counts', () => {
  assert.equal(solve('5 7 1\n').trim(), '1');
});

test('one row: every matrix counts, M^W of them', () => {
  assert.equal(solve('1 3 10\n').trim(), '1000');
});
