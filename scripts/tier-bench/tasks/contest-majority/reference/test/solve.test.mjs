import assert from 'node:assert/strict';
import { test } from 'node:test';
import { solve } from '../src/solve.mjs';

test('sample 1', () => {
  assert.equal(solve('3 3 2\n000\n011\n101\n000\n001\n').trim(), 'Yes\nYes');
});

test('sample 2', () => {
  assert.equal(solve('2 1 2\n0\n0\n0\n1\n').trim(), 'Yes\nNo');
});

test('a single string makes only itself', () => {
  const all = ['000', '001', '010', '011', '100', '101', '110', '111'];
  const out = solve(`1 3 8\n101\n${all.join('\n')}\n`).trim().split('\n');
  assert.deepEqual(out, all.map((t) => (t === '101' ? 'Yes' : 'No')));
});

test('three strings with two ones each make 111 but not 000', () => {
  assert.equal(solve('3 3 2\n011\n101\n110\n111\n000\n').trim(), 'Yes\nNo');
});

test('even-weight strings make every string of length 3', () => {
  const all = ['000', '001', '010', '011', '100', '101', '110', '111'];
  const out = solve(`4 3 8\n000\n011\n101\n110\n${all.join('\n')}\n`).trim().split('\n');
  assert.deepEqual(out, all.map(() => 'Yes'));
});

test('two columns that never show 1 and 1 together rule out 11', () => {
  assert.equal(solve('3 2 4\n00\n01\n10\n11\n10\n01\n00\n').trim(), 'No\nYes\nYes\nYes');
});
