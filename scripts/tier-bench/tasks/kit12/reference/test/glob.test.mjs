import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, matches } from '../src/glob.mjs';

test('matches', () => {
  assert.equal(matches('*.js', 'app.js'), true);
  assert.equal(matches('*.js', 'src/app.js'), false);
  assert.equal(matches('src/**/*.js', 'src/c.js'), true);
  assert.equal(matches('[!a-c]x', '/x'), false);
  assert.equal(matches('*.{js,mjs}', 'a.mjs'), true);
  assert.equal(matches('a.b', 'axb'), false);
  assert.ok(globToRegExp('a?') instanceof RegExp);
});
