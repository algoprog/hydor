import assert from 'node:assert/strict';
import { test } from 'node:test';
import { centsFor, formatCents } from '../src/money.mjs';

test('an hour at a rate earns the rate', () => {
  assert.equal(centsFor(60, 9000), 9000);
  assert.equal(centsFor(90, 9000), 13500);
});

test('rounds to the nearest cent, halves up', () => {
  assert.equal(centsFor(555, 7550), 69838); // 69837.5
  assert.equal(centsFor(20, 7550), 2517); // 2516.67
  assert.equal(centsFor(1, 1), 0); // 0.0167
  assert.equal(centsFor(30, 1), 1); // 0.5
});

test('a total is rounded once: three 20-minute entries are an hour', () => {
  assert.equal(centsFor(20 + 20 + 20, 7550), 7550);
});

test('shows the currency symbol, thousands separators and two decimals', () => {
  assert.equal(formatCents(123450, 'EUR'), '€1,234.50');
  assert.equal(formatCents(0, 'USD'), '$0.00');
  assert.equal(formatCents(123456789, 'GBP'), '£1,234,567.89');
  assert.equal(formatCents(1205, 'CHF'), 'CHF 12.05');
});
