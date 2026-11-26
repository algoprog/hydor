'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { workOut } = require('./sums');

test('two 900 g loaves the usual way', () => {
  // All flour = 1800 / 1.74 = 1034.48; starter = 206.90, half of it 103.45
  assert.deepStrictEqual(workOut({ loaves: 2, loafWeight: 900 }).result, {
    flour: 931, water: 641, salt: 20.7, starter: 207, totalDough: 1800,
  });
});

test('own percentages, decimals included', () => {
  // All flour = 1000 / 1.775 = 563.38
  assert.deepStrictEqual(workOut({ loaves: '1', loafWeight: '1000', water: '75', salt: '2.5', starter: '0' }).result, {
    flour: 563, water: 423, salt: 14.1, starter: 0, totalDough: 1000,
  });
});

test('nonsense gets a sentence and no answer', () => {
  const good = { loaves: 2, loafWeight: 900 };
  const bad = [
    { loaves: 0 }, { loaves: 61 }, { loaves: 2.5 }, { loaves: '' }, { loaves: 'two' }, { loaves: true },
    { loafWeight: 0.5 }, { loafWeight: 199 }, { loafWeight: 1501 }, { loafWeight: undefined },
    { water: 150 }, { water: 49.9 }, { salt: 5.1 }, { salt: -1 }, { salt: '2,5' }, { starter: 51 }, { starter: [20] },
  ];
  for (const change of bad) {
    const out = workOut({ ...good, ...change });
    assert.strictEqual(out.ok, false, JSON.stringify(change));
    assert.strictEqual(out.result, undefined);
    assert.match(out.errors[0].message, /\.$/);
  }
});

test('the ends of each range are allowed', () => {
  assert.ok(workOut({ loaves: 1, loafWeight: 200, water: 50, salt: 0, starter: 0 }).ok);
  assert.ok(workOut({ loaves: 60, loafWeight: 1500, water: 100, salt: 5, starter: 50 }).ok);
});
