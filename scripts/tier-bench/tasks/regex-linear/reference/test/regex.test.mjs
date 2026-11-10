import test from 'node:test';
import assert from 'node:assert/strict';
import { compile } from '../src/regex.mjs';

const m = (p, t) => {
  const r = compile(p).match(t);
  return r && [r.index, r.text];
};
const pos = (p) => {
  try {
    compile(p);
  } catch (e) {
    assert.ok(e instanceof SyntaxError);
    assert.ok(e.message.includes(`position ${e.position}`));
    return e.position;
  }
  assert.fail(`no error for ${p}`);
};

test('leftmost-longest', () => {
  assert.deepEqual(m('a|ab', 'ab'), [0, 'ab']);
  assert.deepEqual(m('bcd|ab', 'abcd'), [0, 'ab']);
  assert.deepEqual(m('a*', 'baaa'), [0, '']);
  assert.deepEqual(m('(a|b){2,3}c', 'abbbc'), [1, 'bbbc']);
  assert.deepEqual(m('^a|b$', 'xab'), [2, 'b']);
  assert.equal(m('^$', 'a'), null);
});

test('classes and escapes', () => {
  assert.deepEqual(m('[a-c-e]+', 'x-cab-e'), [1, '-cab-e']);
  assert.deepEqual(m('[^\\d\\s]+', '1 2ab 3'), [3, 'ab']);
  assert.deepEqual(m('\\w+@\\w+\\.\\w{2,3}', 'mail: bob@site.com.'), [6, 'bob@site.com']);
  assert.equal(m('a.c', 'a\nc'), null);
});

test('errors carry their position', () => {
  assert.equal(pos('a**'), 2);
  assert.equal(pos('[z-a'), 1);
  assert.equal(pos('(a(b'), 2);
  assert.equal(pos('a{2000}('), 7);
  assert.equal(pos('a{1001}'), 0);
  assert.throws(() => compile(1), TypeError);
});

test('no blow-up on patterns that make backtracking exponential', () => {
  const started = Date.now();
  assert.equal(compile('(a*)*b').test('a'.repeat(30000)), false);
  assert.equal(compile('(a|aa)+$').test('a'.repeat(30000) + 'b'), false);
  assert.equal(compile('(a?){25}a{25}').match(('a'.repeat(24) + 'b').repeat(1250)), null);
  assert.equal(compile('a*b').test('a'.repeat(50000)), false);
  assert.equal(compile('(ab|cd)*e').match('ab'.repeat(50000) + 'e').text.length, 100001);
  assert.ok(Date.now() - started < 2000);
});
