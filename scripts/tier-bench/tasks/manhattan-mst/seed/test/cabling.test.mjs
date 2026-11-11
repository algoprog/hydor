import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCables } from '../src/cabling.mjs';

test('no sensors, and one', () => {
  assert.deepEqual(planCables([]), { total: 0, cables: [] });
  assert.deepEqual(planCables([[5, 5]]), { total: 0, cables: [] });
});

test('two sensors', () => {
  const r = planCables([[0, 0], [3, 4]]);
  assert.equal(r.total, 7);
  assert.equal(r.cables.length, 1);
});

test('three sensors in a row cost the length of the row', () => {
  const r = planCables([[0, 0], [10, 0], [4, 0]]);
  assert.equal(r.total, 10);
  assert.equal(r.cables.length, 2);
});

test('the corners of a square: three of its four sides', () => {
  const r = planCables([[0, 0], [0, 5], [5, 5], [5, 0]]);
  assert.equal(r.total, 15);
});

test('sensors in the same place cost nothing to connect', () => {
  const r = planCables([[7, 7], [7, 7], [7, 7]]);
  assert.equal(r.total, 0);
  assert.equal(r.cables.length, 2);
});
