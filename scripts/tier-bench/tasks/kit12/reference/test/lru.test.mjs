import test from 'node:test';
import assert from 'node:assert/strict';
import { LRUCache } from '../src/lru.mjs';

test('evicts the least recently used', () => {
  const c = new LRUCache({ capacity: 2 });
  c.set('a', 1).set('b', 2);
  c.get('a');
  c.set('c', 3);
  assert.deepEqual(c.keys(), ['a', 'c']);
  assert.equal(c.get('b'), undefined);
});

test('entries expire', () => {
  let t = 0;
  const c = new LRUCache({ capacity: 2, ttlMs: 10, now: () => t });
  c.set('a', 1);
  t = 9;
  assert.equal(c.has('a'), true);
  t = 10;
  assert.equal(c.has('a'), false);
  assert.equal(c.size, 0);
});

test('capacity must be a positive integer', () => {
  for (const capacity of [0, -1, 1.5, '2', undefined]) assert.throws(() => new LRUCache({ capacity }), RangeError);
});
