import assert from 'node:assert/strict';
import { test } from 'node:test';
import { linkProbabilities } from '../src/linkload.mjs';

const link = (id, a, b, quality) => ({ id, a, b, quality });
const near = (actual, expected) => {
  assert.equal(actual.length, expected.length);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 0.02, `link ${i}: ${v}, expected ${expected[i]}`));
};

test('a triangle with equal qualities: each link is in two of the three trees', () => {
  near(linkProbabilities(['x', 'y', 'z'], [link('1', 'x', 'y', 1), link('2', 'y', 'z', 1), link('3', 'z', 'x', 1)]), [2 / 3, 2 / 3, 2 / 3]);
});

test('a path: every link is in the only tree', () => {
  near(linkProbabilities(['x', 'y', 'z'], [link('1', 'x', 'y', 4), link('2', 'y', 'z', 0.5)]), [1, 1]);
});

test('two links between the same nodes share the tree by their qualities', () => {
  near(linkProbabilities(['x', 'y'], [link('1', 'x', 'y', 1), link('2', 'y', 'x', 3)]), [0.25, 0.75]);
});

test('a link that names a node that does not exist throws', () => {
  assert.throws(() => linkProbabilities(['x'], [link('1', 'x', 'q', 1)]));
});
