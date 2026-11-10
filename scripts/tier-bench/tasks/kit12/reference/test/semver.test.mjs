import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, compare, satisfies } from '../src/semver.mjs';

test('parse', () => {
  assert.deepEqual(parse('v1.2.3-beta.1'), { major: 1, minor: 2, patch: 3, prerelease: ['beta', '1'] });
  for (const bad of ['1.2', '01.2.3', '1.2.3+b', ' 1.2.3', '1.0.0-01', 5]) assert.throws(() => parse(bad), RangeError);
});

test('compare', () => {
  assert.equal(compare('1.2.3', '1.10.0'), -1);
  assert.equal(compare('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compare('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
  assert.equal(compare('1.0.0-1', '1.0.0-a'), -1);
  assert.equal(compare('v2.0.0', '2.0.0'), 0);
});

test('satisfies', () => {
  assert.equal(satisfies('1.5.0', '^1.2.3'), true);
  assert.equal(satisfies('0.3.0', '^0.2.3'), false);
  assert.equal(satisfies('0.0.4', '^0.0.3'), false);
  assert.equal(satisfies('1.3.0', '~1.2.3'), false);
  assert.equal(satisfies('1.2.4-beta', '^1.2.3'), false);
  assert.equal(satisfies('1.2.3-beta.2', '>=1.2.3-beta.1 <2.0.0'), true);
  assert.throws(() => satisfies('1.2.3', '1.x'), RangeError);
});
