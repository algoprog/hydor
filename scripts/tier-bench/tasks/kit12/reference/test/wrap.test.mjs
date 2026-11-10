import test from 'node:test';
import assert from 'node:assert/strict';
import { wordWrap } from '../src/wrap.mjs';

test('wordWrap', () => {
  assert.equal(wordWrap('the quick brown fox', 10), 'the quick\nbrown fox');
  assert.equal(wordWrap('one\n\ntwo three', 7), 'one\n\ntwo\nthree');
  assert.equal(wordWrap('ab abcdefghij k', 4), 'ab\nabcd\nefgh\nij k');
  assert.equal(wordWrap('', 5), '');
  assert.throws(() => wordWrap('x', 0), RangeError);
});
