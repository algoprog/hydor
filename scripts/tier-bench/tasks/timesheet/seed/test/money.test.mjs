import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatAmount, projectAmount } from '../src/money.mjs';

test('an hour at a rate earns the rate', () => {
  assert.equal(projectAmount([60], 9000), 90);
  assert.equal(projectAmount([90], 9000), 135);
});

test('shows the currency symbol, thousands separators and two decimals', () => {
  assert.equal(formatAmount(1234.5, 'EUR'), '€1,234.50');
  assert.equal(formatAmount(0, 'USD'), '$0.00');
  assert.equal(formatAmount(1234567.89, 'GBP'), '£1,234,567.89');
  assert.equal(formatAmount(12, 'CHF'), 'CHF 12.00');
});
