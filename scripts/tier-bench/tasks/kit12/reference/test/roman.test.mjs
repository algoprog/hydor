import test from 'node:test';
import assert from 'node:assert/strict';
import { toRoman, fromRoman } from '../src/roman.mjs';

test('toRoman', () => {
  assert.equal(toRoman(1994), 'MCMXCIV');
  assert.equal(toRoman(3999), 'MMMCMXCIX');
  for (const bad of [0, 4000, 2.5, '5']) assert.throws(() => toRoman(bad), RangeError);
});

test('fromRoman', () => {
  assert.equal(fromRoman('mcmxciv'), 1994);
  for (const bad of ['', 'IIII', 'IC', 'VX', 'MMMM']) assert.throws(() => fromRoman(bad), RangeError);
  for (let n = 1; n <= 3999; n++) assert.equal(fromRoman(toRoman(n)), n);
});
