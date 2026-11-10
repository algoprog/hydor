import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.mjs';

test('slugify basics', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
  assert.equal(slugify('Crème Brûlée'), 'creme-brulee');
  assert.equal(slugify('日本語'), '');
  assert.equal(slugify('a b c', { separator: '_' }), 'a_b_c');
});

test('slugify cuts and trims', () => {
  assert.equal(slugify('Hello World', { maxLength: 6 }), 'hello');
  assert.equal(slugify('Hello World', { maxLength: 7 }), 'hello-w');
});

test('slugify needs a string', () => {
  assert.throws(() => slugify(42), TypeError);
});
