import test from 'node:test';
import assert from 'node:assert/strict';
import { pageCount, pageSlice } from '../src/paginate.mjs';

test('pageCount rounds up', () => {
  assert.equal(pageCount(25, 10), 3);
  assert.equal(pageCount(1, 10), 1);
});

test('pageCount at an exact multiple', () => {
  assert.equal(pageCount(20, 10), 2);
});

test('pageSlice returns one page', () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.deepEqual(pageSlice(items, 2, 10), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.deepEqual(pageSlice(items, 3, 10), [21, 22, 23, 24, 25]);
});
