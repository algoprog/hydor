import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInvoice } from '../src/invoice.mjs';

const line = (id, sku, quantity, unitPrice, taxClass, discounts) => ({ id, sku, quantity, unitPrice, taxClass, ...(discounts ? { discounts } : {}) });
const R = { standard: 2000, reduced: 500 };

test('exact money and tax per class (worked example 1)', () => {
  const r = computeInvoice({ currency: 'USD', taxRates: R, lines: [line('A', 'PEN', 3, '0.07', 'standard'), line('B', 'INK', 1, '0.12', 'standard')] });
  assert.deepEqual(r.taxes, [{ taxClass: 'standard', rate: 2000, base: 33, tax: 7 }]);
  assert.equal(r.totals.grandTotal, 40);
});

test('percentages before amounts, half-even (worked example 4)', () => {
  const r = computeInvoice({ currency: 'USD', taxRates: R, lines: [line('A', 'SHIRT', 2, '12.50', 'standard', [{ type: 'amount', amount: '3.00' }, { type: 'percent', percent: '10' }, { type: 'percent', percent: '5' }])] });
  assert.deepEqual(r.lines[0].discounts.map((d) => d.amount), [250, 112, 300]);
  assert.equal(r.totals.grandTotal, 2206);
});

test('buy 2 get 1, ties by line order (worked example 6)', () => {
  const r = computeInvoice({
    currency: 'USD', taxRates: R, promotions: [{ sku: 'SOCK', buy: 2, free: 1 }],
    lines: [line('A', 'SOCK', 2, '5.00', 'standard'), line('B', 'SOCK', 3, '4.00', 'standard'), line('C', 'SOCK', 1, '4.00', 'standard')],
  });
  assert.deepEqual(r.lines.map((l) => l.net), [1000, 400, 400]);
  assert.deepEqual(r.totals, { goods: 2600, discounts: 800, shipping: 0, exempt: 0, tax: 360, grandTotal: 2160 });
});

test('amount coupon by largest remainder in a tax-inclusive KWD order (worked example 11)', () => {
  const r = computeInvoice({
    currency: 'KWD', pricesIncludeTax: true, taxRates: { standard: 1500, reduced: 500 }, coupons: [{ type: 'amount', amount: '1.000' }],
    lines: [line('A', 'DATES', 1, '2.300', 'standard'), line('B', 'MILK', 2, '1.150', 'reduced'), line('C', 'BREAD', 1, '0.700', 'zero')],
  });
  assert.deepEqual(r.lines.map((l) => l.net), [1866, 1866, 568]);
  assert.deepEqual(r.taxes.map((t) => [t.base, t.tax]), [[1623, 243], [1777, 89], [568, 0]]);
});

test('shipping at the threshold, then brought back by a coupon (worked examples 12 and 13)', () => {
  const order = { currency: 'USD', taxRates: R, shipping: { fee: '4.95', taxClass: 'standard', freeFrom: '50.00' }, lines: [line('A', 'BOOK', 2, '25.00', 'reduced')] };
  assert.deepEqual(computeInvoice(order).warnings, ['FREE_SHIPPING']);
  assert.equal(computeInvoice({ ...order, coupons: [{ type: 'amount', amount: '5.00' }] }).totals.grandTotal, 5319);
});

test('errors in their order', () => {
  const code = (o) => {
    try {
      computeInvoice(o);
    } catch (e) {
      assert.ok(e instanceof RangeError);
      return e.code;
    }
    assert.fail('no error');
  };
  assert.equal(code({ currency: 'XYZ', taxRates: R, lines: [line('A', 'X', -1, '1.00', 'standard')] }), 'UNKNOWN_CURRENCY');
  assert.equal(code({ currency: 'USD', taxRates: R, lines: [line('A', 'X', -1, '1.00', 'luxury')] }), 'UNKNOWN_TAX_CLASS');
  assert.equal(code({ currency: 'USD', taxRates: R, lines: [line('A', 'X', 1, '1.999', 'standard'), line('B', 'X', 1, '1.00', 'luxury')] }), 'TOO_MANY_DECIMALS');
});
