// Hidden checker for invoice-rules. Run: node check.mjs <workdir>
// Every case runs in a child process of its own (node check.mjs <workdir> --case <n>) with a 5-second limit, four at a
// time, so a case that hangs fails alone. A case is one whole order compared with its expected result, or a short
// list of invalid orders, each of which must throw a RangeError with the right code.
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (!process.argv[2]) {
  console.error('usage: node check.mjs <workdir>');
  process.exit(1);
}
const dir = path.resolve(process.argv[2]);
const self = fileURLToPath(import.meta.url);

// ---------- the orders ----------
const line = (id, sku, quantity, unitPrice, taxClass, discounts) => ({ id, sku, quantity, unitPrice, taxClass, ...(discounts ? { discounts } : {}) });
const pct = (percent) => ({ type: 'percent', percent });
const amt = (amount) => ({ type: 'amount', amount });
const R = (standard, reduced) => ({ standard, reduced });
const CASES = [];
// A case: [name, order] (compared with the expected result) or [name, [[order, code], ...]] (each must throw).
const add = (name, order) => CASES.push([name, order]);

// The worked examples of SPEC.md, section 6.
add('worked 1: exact money, tax per class', { currency: 'USD', taxRates: R(2000, 500), lines: [line('A', 'PEN', 3, '0.07', 'standard'), line('B', 'INK', 1, '0.12', 'standard')] });
add('worked 2: weighed goods', { currency: 'EUR', taxRates: R(2000, 700), lines: [line('A', 'CHEESE', '1.015', '1.00', 'reduced'), line('B', 'HAM', '0.125', '1.00', 'reduced')] });
add('worked 3: half-even tax', { currency: 'JPY', taxRates: R(1000, 800), lines: [line('A', 'RICE', 1, '125', 'standard'), line('B', 'TEA', 2, '35', 'reduced')] });
add('worked 4: line discounts', { currency: 'USD', taxRates: R(2000, 500), lines: [line('A', 'SHIRT', 2, '12.50', 'standard', [amt('3.00'), pct('10'), pct('5')])] });
add('worked 5: a capped amount discount', { currency: 'GBP', taxRates: R(2000, 500), lines: [line('A', 'MUG', 1, '4.00', 'standard', [pct('50'), amt('2.50')]), line('B', 'PLATE', 1, '6.00', 'standard')] });
add('worked 6: buy 2 get 1, ties', {
  currency: 'USD', taxRates: R(2000, 500), promotions: [{ sku: 'SOCK', buy: 2, free: 1 }],
  lines: [line('A', 'SOCK', 2, '5.00', 'standard'), line('B', 'SOCK', 3, '4.00', 'standard'), line('C', 'SOCK', 1, '4.00', 'standard')],
});
add('worked 7: a free unit after a percentage, a weighed line left out', {
  currency: 'EUR', taxRates: R(2100, 1000), promotions: [{ sku: 'TEA', buy: 2, free: 1 }],
  lines: [line('A', 'TEA', 3, '3.35', 'standard', [pct('10')]), line('B', 'TEA', '1.000', '3.35', 'standard')],
});
add('worked 8: who counts as undiscounted', {
  currency: 'USD', taxRates: R(2000, 500), promotions: [{ sku: 'CUP', buy: 3, free: 1 }], coupons: [{ type: 'percent', percent: '15' }],
  lines: [line('A', 'BAG', 1, '20.00', 'standard', [pct('0')]), line('B', 'CUP', 2, '4.10', 'reduced'), line('C', 'HAT', 1, '10.00', 'standard', [amt('1.00')])],
});
add('worked 9: buy 1 get 1, coupon on all lines', {
  currency: 'JPY', taxRates: R(1000, 800), promotions: [{ sku: 'ONIGIRI', buy: 1, free: 1 }], coupons: [{ type: 'percent', percent: '5', scope: 'all' }],
  lines: [line('A', 'ONIGIRI', 3, '150', 'standard'), line('B', 'ONIGIRI', 1, '130', 'standard')],
});
add('worked 10: an amount coupon, equal remainders', {
  currency: 'USD', taxRates: R(2000, 500), coupons: [{ type: 'amount', amount: '10.00' }],
  lines: [line('A', 'X', 1, '10.00', 'standard'), line('B', 'Y', 1, '10.00', 'reduced'), line('C', 'Z', 1, '10.00', 'standard')],
});
add('worked 11: spread in a tax-inclusive 3-decimal order', {
  currency: 'KWD', pricesIncludeTax: true, taxRates: R(1500, 500), coupons: [{ type: 'amount', amount: '1.000' }],
  lines: [line('A', 'DATES', 1, '2.300', 'standard'), line('B', 'MILK', 2, '1.150', 'reduced'), line('C', 'BREAD', 1, '0.700', 'zero')],
});
const books = { currency: 'USD', taxRates: R(2000, 500), shipping: { fee: '4.95', taxClass: 'standard', freeFrom: '50.00' }, lines: [line('A', 'BOOK', 2, '25.00', 'reduced')] };
add('worked 12: shipping free at exactly the threshold', books);
add('worked 13: a coupon that brings back shipping', { ...books, coupons: [{ type: 'amount', amount: '5.00' }] });
add('worked 14: reverse charge with tax included', {
  currency: 'EUR', pricesIncludeTax: true, reverseCharge: true, taxRates: R(2000, 1000),
  lines: [line('A', 'LAMP', 1, '12.00', 'standard'), line('B', 'BOOK', 1, '5.00', 'exempt')],
});
add('worked 15: half-even when taking tax out', { currency: 'GBP', pricesIncludeTax: true, taxRates: R(2000, 500), lines: [line('A', 'WINE', 1, '18.03', 'standard')] });

// Money and rounding.
add('money: KWD prices with three decimals', {
  currency: 'KWD', taxRates: R(1500, 500), lines: [line('A', 'OIL', 3, '1.005', 'standard', [amt('0.015')]), line('B', 'SALT', 1, '0.53', 'reduced')],
});
add('money: fewer decimals than the currency', { currency: 'USD', taxRates: R(2000, 500), lines: [line('A', 'X', 1, '5', 'standard'), line('B', 'Y', 2, '4.9', 'standard'), line('C', 'Z', 1, '04.50', 'reduced')] });
add('money: weighed goods in a currency without decimals', {
  currency: 'JPY', taxRates: R(1000, 800), lines: [line('A', 'BEEF', '0.375', '98', 'reduced'), line('B', 'FISH', '1.25', '30', 'reduced'), line('C', 'PORK', '0.5', '45', 'reduced')],
});
add('money: a weighed quantity of "2" and of three decimals', { currency: 'EUR', taxRates: R(2000, 700), lines: [line('A', 'NUTS', '2', '1.99', 'reduced'), line('B', 'FIGS', '0.335', '3.00', 'reduced')] });
add('tax: on the sum of each class, not line by line', {
  currency: 'USD', taxRates: R(1900, 700),
  lines: [line('A', 'P1', 1, '0.13', 'standard'), line('B', 'P2', 1, '0.13', 'standard'), line('C', 'P3', 1, '0.13', 'standard'), line('D', 'P4', 1, '0.07', 'reduced'), line('E', 'P5', 1, '0.07', 'reduced')],
});
add('tax: zero-rated lines are listed, exempt lines are not', {
  currency: 'GBP', taxRates: R(2000, 500), lines: [line('A', 'KIDS', 1, '3.00', 'zero'), line('B', 'STAMP', 1, '4.00', 'exempt'), line('C', 'PEN', 1, '2.03', 'standard'), line('D', 'INK', 1, '1.03', 'standard')],
});

// Line discounts.
add('line discounts: percentages compound and round half-even', { currency: 'CHF', taxRates: R(810, 260), lines: [line('A', 'WATCH', 3, '9.95', 'standard', [pct('12.5'), pct('12.5')])] });
add('line discounts: 100% and 33.33%, then nothing left to take', {
  currency: 'USD', taxRates: R(2000, 500), lines: [line('A', 'GIFT', 1, '9.99', 'standard', [amt('1.00'), pct('100')]), line('B', 'CARD', 1, '10.00', 'standard', [pct('33.33')])],
});
add('line discounts: an amount equal to what is left, and an amount of zero', {
  currency: 'EUR', taxRates: R(2000, 700), lines: [line('A', 'X', 1, '5.00', 'standard', [amt('5.00')]), line('B', 'Y', 2, '0.75', 'reduced', [amt('0.00')])],
});

// Promotions.
add('promotion: the cheapest unit is measured after line discounts', {
  currency: 'USD', taxRates: R(2000, 500), promotions: [{ sku: 'SHOE', buy: 1, free: 1 }],
  lines: [line('A', 'SHOE', 2, '10.00', 'standard', [pct('50')]), line('B', 'SHOE', 2, '6.25', 'reduced')],
});
add('promotion: unit prices are compared as exact fractions', {
  currency: 'USD', taxRates: R(2000, 500), promotions: [{ sku: 'PEN', buy: 2, free: 1 }],
  lines: [line('A', 'PEN', 3, '1.00', 'standard', [amt('0.01')]), line('B', 'PEN', 2, '1.00', 'standard', [amt('0.01')])],
});
add('promotion: free units fill the cheapest line, then the next', {
  currency: 'EUR', taxRates: R(2000, 700), promotions: [{ sku: 'APPLE', buy: 2, free: 2 }],
  lines: [line('A', 'APPLE', 3, '0.50', 'reduced'), line('B', 'APPLE', 2, '0.40', 'reduced'), line('C', 'APPLE', 4, '0.45', 'reduced')],
});
add('promotion: a fully discounted line takes the free unit', {
  currency: 'USD', taxRates: R(2000, 500), promotions: [{ sku: 'CAP', buy: 1, free: 1 }],
  lines: [line('A', 'CAP', 1, '15.00', 'standard', [pct('100')]), line('B', 'CAP', 1, '15.00', 'standard')],
});
add('promotion: the value of free units rounds half-even', {
  currency: 'GBP', taxRates: R(2000, 500), promotions: [{ sku: 'LIME', buy: 3, free: 1 }], lines: [line('A', 'LIME', 4, '0.05', 'reduced', [amt('0.02')])],
});
add('promotion: two promotions in their order, one unused', {
  currency: 'USD', taxRates: R(1900, 500), promotions: [{ sku: 'BAR', buy: 2, free: 1 }, { sku: 'GUM', buy: 4, free: 1 }],
  lines: [line('A', 'BAR', 3, '1.20', 'standard'), line('B', 'GUM', 2, '0.80', 'standard'), line('C', 'BAR', 1, '1.50', 'standard')],
});
add('promotion: KRW buy 2 get 1 and a coupon on the other lines', {
  currency: 'KRW', taxRates: R(1000, 0), promotions: [{ sku: 'KIMCHI', buy: 2, free: 1 }], coupons: [{ type: 'percent', percent: '10' }],
  lines: [line('A', 'KIMCHI', 3, '4500', 'standard'), line('B', 'NOODLE', 2, '1250', 'reduced')],
});

// Coupons.
add('coupon: a percentage on all lines, after line discounts', {
  currency: 'GBP', taxRates: R(2000, 500), coupons: [{ type: 'percent', percent: '20', scope: 'all' }],
  lines: [line('A', 'X', 1, '10.03', 'standard', [pct('10')]), line('B', 'Y', 1, '5.53', 'standard')],
});
add('coupon: a percentage that applies to no line, then an amount coupon', {
  currency: 'EUR', taxRates: R(2000, 700), coupons: [{ type: 'percent', percent: '10' }, { type: 'amount', amount: '2.00' }],
  lines: [line('A', 'X', 1, '8.00', 'standard', [amt('1.00')]), line('B', 'Y', 1, '4.00', 'reduced', [pct('25')])],
});
add('coupon: the amount coupon comes after the percentage, whatever the listed order', {
  currency: 'USD', taxRates: R(2000, 500), coupons: [{ type: 'amount', amount: '3.00' }, { type: 'percent', percent: '10' }],
  lines: [line('A', 'X', 1, '20.00', 'standard'), line('B', 'Y', 1, '7.00', 'reduced', [pct('10')])],
});
add('coupon: larger than the goods, capped, and shipping is still charged', {
  currency: 'USD', taxRates: R(2000, 500), coupons: [{ type: 'amount', amount: '50.00' }], shipping: { fee: '5.00', taxClass: 'standard', freeFrom: '30.00' },
  lines: [line('A', 'X', 1, '12.00', 'standard'), line('B', 'Y', 1, '8.00', 'exempt')],
});
add('coupon: exactly the goods total, no warning', {
  currency: 'JPY', taxRates: R(1000, 800), coupons: [{ type: 'amount', amount: '1000' }], lines: [line('A', 'X', 2, '300', 'standard'), line('B', 'Y', 1, '400', 'reduced')],
});
add('coupon: a line at zero in the spread, ties by line order', {
  currency: 'EUR', taxRates: R(2000, 700), coupons: [{ type: 'amount', amount: '1.01' }],
  lines: [line('A', 'FREEBIE', 1, '0.00', 'standard'), line('B', 'X', 1, '3.00', 'standard'), line('C', 'Y', 1, '3.00', 'standard')],
});
add('coupon: spread over an exempt line too', {
  currency: 'GBP', taxRates: R(2000, 500), coupons: [{ type: 'amount', amount: '6.00' }], lines: [line('A', 'X', 1, '10.00', 'standard'), line('B', 'Y', 1, '20.00', 'exempt')],
});
add('coupon: largest remainders over five lines', {
  currency: 'USD', taxRates: R(2000, 500), coupons: [{ type: 'amount', amount: '1.00' }],
  lines: [line('A', 'P', 1, '1.00', 'standard'), line('B', 'Q', 1, '2.00', 'reduced'), line('C', 'R', 1, '3.00', 'standard'), line('D', 'S', 1, '0.50', 'zero'), line('E', 'T', 1, '0.25', 'exempt')],
});
add('coupon: OMR prices with tax, an amount coupon over two classes', {
  currency: 'OMR', pricesIncludeTax: true, taxRates: R(500, 200), coupons: [{ type: 'amount', amount: '0.100' }],
  lines: [line('A', 'X', 1, '1.050', 'standard'), line('B', 'Y', 3, '0.333', 'reduced')],
});
add('coupon: BHD, a weighed line and a 7.5% coupon', {
  currency: 'BHD', taxRates: R(1000, 500), coupons: [{ type: 'percent', percent: '7.5' }], lines: [line('A', 'SAFFRON', '0.750', '2.345', 'standard'), line('B', 'RICE', 4, '0.135', 'reduced')],
});

// Shipping and tax modes.
add('shipping: just below the threshold, in its own class', {
  currency: 'EUR', taxRates: R(2000, 700), shipping: { fee: '3.90', taxClass: 'reduced', freeFrom: '25.00' }, lines: [line('A', 'X', 1, '24.99', 'standard')],
});
add('shipping: no threshold, prices with tax', { currency: 'GBP', pricesIncludeTax: true, taxRates: R(2000, 500), shipping: { fee: '3.99', taxClass: 'standard' }, lines: [line('A', 'X', 1, '10.00', 'standard')] });
add('shipping: exempt shipping goes to the exempt total', { currency: 'USD', taxRates: R(2000, 500), shipping: { fee: '2.00', taxClass: 'exempt' }, lines: [line('A', 'X', 1, '10.00', 'standard')] });
add('shipping: free shipping does not list its class', {
  currency: 'USD', taxRates: R(2000, 500), shipping: { fee: '6.00', taxClass: 'reduced', freeFrom: '20.00' }, lines: [line('A', 'X', 1, '25.00', 'standard')],
});
add('shipping: the threshold is measured after discounts and before tax', {
  currency: 'GBP', taxRates: R(2000, 500), shipping: { fee: '4.02', taxClass: 'standard', freeFrom: '40.00' }, lines: [line('A', 'COAT', 1, '45.02', 'standard', [pct('15')])],
});
add('reverse charge with prices without tax, and shipping', {
  currency: 'EUR', reverseCharge: true, taxRates: R(2000, 1000), shipping: { fee: '5.00', taxClass: 'standard' },
  lines: [line('A', 'X', 2, '15.00', 'standard'), line('B', 'Y', 1, '8.00', 'reduced')],
});
add('prices with tax: line discounts, then tax taken out per class', {
  currency: 'USD', pricesIncludeTax: true, taxRates: R(1000, 500),
  lines: [line('A', 'X', 1, '11.00', 'standard', [pct('10')]), line('B', 'Y', 1, '4.20', 'reduced'), line('C', 'Z', 1, '3.00', 'zero')],
});
add('warnings: all five, once each, in their order', {
  currency: 'USD', taxRates: R(2000, 500), promotions: [{ sku: 'GUM', buy: 5, free: 1 }],
  coupons: [{ type: 'percent', percent: '10' }, { type: 'amount', amount: '100.00' }], shipping: { fee: '5.00', taxClass: 'standard', freeFrom: '0' },
  lines: [line('A', 'GUM', 1, '2.00', 'standard', [amt('3.00')]), line('B', 'GUM', 1, '1.00', 'standard', [pct('10')]), line('C', 'MINT', 1, '0.50', 'standard', [amt('1.00')])],
});

// Errors.
const ok = { currency: 'USD', taxRates: R(2000, 500), lines: [line('A', 'X', 1, '1.00', 'standard')] };
const withLine = (patch, extra = {}) => ({ ...ok, ...extra, lines: [{ ...ok.lines[0], ...patch }] });
add('errors: unknown currency, checked first', [
  [{ ...ok, currency: 'usd' }, 'UNKNOWN_CURRENCY'], [{ ...withLine({ quantity: -1 }), currency: 'XYZ' }, 'UNKNOWN_CURRENCY'], [{ ...ok, currency: undefined }, 'UNKNOWN_CURRENCY'],
]);
add('errors: tax rates', [
  [{ ...ok, taxRates: { standard: 2000 } }, 'INVALID_TAX_RATES'], [{ ...ok, taxRates: R(10001, 500) }, 'INVALID_TAX_RATES'], [{ ...ok, taxRates: R(12.5, 500) }, 'INVALID_TAX_RATES'],
  [{ ...ok, taxRates: undefined }, 'INVALID_TAX_RATES'], [{ ...ok, taxRates: R(2000, 500), lines: [] }, 'NO_LINES'],
]);
add('errors: lines, ids and skus', [
  [{ ...ok, lines: undefined }, 'NO_LINES'], [{ ...ok, lines: [ok.lines[0], { ...ok.lines[0] }] }, 'INVALID_LINE_ID'], [withLine({ id: '' }), 'INVALID_LINE_ID'], [withLine({ sku: undefined }), 'INVALID_SKU'],
]);
add('errors: unknown tax class, on a line or on shipping', [
  [withLine({ taxClass: 'Standard' }), 'UNKNOWN_TAX_CLASS'], [{ ...ok, shipping: { fee: '1.00', taxClass: 'express' } }, 'UNKNOWN_TAX_CLASS'],
]);
add('errors: negative quantity', [[withLine({ quantity: -2 }), 'NEGATIVE_QUANTITY'], [withLine({ quantity: '-1.5' }), 'NEGATIVE_QUANTITY']]);
add('errors: invalid quantity', [
  [withLine({ quantity: 0 }), 'INVALID_QUANTITY'], [withLine({ quantity: 2.5 }), 'INVALID_QUANTITY'], [withLine({ quantity: '1.2345' }), 'INVALID_QUANTITY'], [withLine({ quantity: '1.' }), 'INVALID_QUANTITY'],
  [withLine({ quantity: '0.000' }), 'INVALID_QUANTITY'], [withLine({ quantity: null }), 'INVALID_QUANTITY'],
]);
add('errors: invalid amounts', [
  [withLine({ unitPrice: '1,00' }), 'INVALID_AMOUNT'], [withLine({ unitPrice: 4.99 }), 'INVALID_AMOUNT'], [withLine({ unitPrice: '.50' }), 'INVALID_AMOUNT'], [withLine({ unitPrice: '5.' }), 'INVALID_AMOUNT'],
  [withLine({ unitPrice: '-1.00' }), 'INVALID_AMOUNT'], [{ ...ok, shipping: { fee: 'free', taxClass: 'standard' } }, 'INVALID_AMOUNT'],
]);
add('errors: more decimals than the currency has', [
  [withLine({ unitPrice: '4.999' }), 'TOO_MANY_DECIMALS'], [{ ...withLine({ unitPrice: '500.0' }), currency: 'JPY' }, 'TOO_MANY_DECIMALS'], [{ ...withLine({ discounts: [amt('0.001')] }), currency: 'EUR' }, 'TOO_MANY_DECIMALS'],
  [{ ...withLine({ unitPrice: '1.000' }), currency: 'KWD', coupons: [{ type: 'amount', amount: '1.0000' }] }, 'TOO_MANY_DECIMALS'], [{ ...ok, shipping: { fee: '1.00', taxClass: 'standard', freeFrom: '50.001' } }, 'TOO_MANY_DECIMALS'],
]);
add('errors: a discount over 100%', [[withLine({ discounts: [pct('100.01')] }), 'DISCOUNT_OVER_100'], [{ ...ok, coupons: [{ type: 'percent', percent: '150' }] }, 'DISCOUNT_OVER_100']]);
add('errors: invalid discounts, promotions and coupons', [
  [withLine({ discounts: [pct('12.345')] }), 'INVALID_DISCOUNT'], [withLine({ discounts: [{ type: 'bogus' }] }), 'INVALID_DISCOUNT'], [withLine({ discounts: pct('10') }), 'INVALID_DISCOUNT'],
  [{ ...ok, promotions: [{ sku: 'X', buy: 0, free: 1 }] }, 'INVALID_PROMOTION'], [{ ...ok, promotions: [{ sku: 'X', buy: 2, free: 1 }, { sku: 'X', buy: 3, free: 1 }] }, 'INVALID_PROMOTION'],
  [{ ...ok, coupons: [amt('1.00'), amt('2.00')] }, 'INVALID_COUPON'], [{ ...ok, coupons: [{ type: 'percent', percent: '10', scope: 'some' }] }, 'INVALID_COUPON'], [{ ...ok, coupons: [{ type: 'percent', percent: 'abc' }] }, 'INVALID_COUPON'],
]);
add("errors: a line's checks run in their order", [
  [withLine({ taxClass: 'luxury', quantity: -1 }), 'UNKNOWN_TAX_CLASS'], [withLine({ quantity: -1, unitPrice: 'x' }), 'NEGATIVE_QUANTITY'], [withLine({ unitPrice: '1.999', discounts: [pct('150')] }), 'TOO_MANY_DECIMALS'],
  [{ ...ok, lines: [ok.lines[0], { ...ok.lines[0], taxClass: 'luxury' }] }, 'INVALID_LINE_ID'], [withLine({ sku: '', taxClass: 'luxury' }), 'INVALID_SKU'],
]);
add('errors: line by line, then the sections in their order', [
  [{ ...ok, lines: [{ ...ok.lines[0], unitPrice: '1.999' }, { ...ok.lines[0], id: 'B', taxClass: 'luxury' }] }, 'TOO_MANY_DECIMALS'],
  [{ ...ok, lines: [ok.lines[0], { ...ok.lines[0], id: 'B', quantity: -3 }], promotions: [{ sku: 'X', buy: 0, free: 1 }] }, 'NEGATIVE_QUANTITY'],
  [{ ...ok, promotions: [{ sku: '', buy: 1, free: 1 }], coupons: [{ type: 'gift' }] }, 'INVALID_PROMOTION'],
  [{ ...ok, coupons: [{ type: 'gift' }], shipping: { fee: 'x', taxClass: 'standard' } }, 'INVALID_COUPON'],
  [{ ...ok, coupons: [{ type: 'percent', percent: '10' }, { type: 'percent', percent: '150' }] }, 'DISCOUNT_OVER_100'],
  [{ ...ok, taxRates: R(-1, 500), lines: [] }, 'INVALID_TAX_RATES'],
]);

// What the reference gives for each order (worked examples 1 to 15 checked by hand against SPEC.md).
const EXPECTED = {
  "worked 1: exact money, tax per class": {"currency":"USD","lines":[{"id":"A","gross":21,"discounts":[],"net":21},{"id":"B","gross":12,"discounts":[],"net":12}],"taxes":[{"taxClass":"standard","rate":2000,"base":33,"tax":7}],"totals":{"goods":33,"discounts":0,"shipping":0,"exempt":0,"tax":7,"grandTotal":40},"warnings":[]},
  "worked 2: weighed goods": {"currency":"EUR","lines":[{"id":"A","gross":102,"discounts":[],"net":102},{"id":"B","gross":12,"discounts":[],"net":12}],"taxes":[{"taxClass":"reduced","rate":700,"base":114,"tax":8}],"totals":{"goods":114,"discounts":0,"shipping":0,"exempt":0,"tax":8,"grandTotal":122},"warnings":[]},
  "worked 3: half-even tax": {"currency":"JPY","lines":[{"id":"A","gross":125,"discounts":[],"net":125},{"id":"B","gross":70,"discounts":[],"net":70}],"taxes":[{"taxClass":"standard","rate":1000,"base":125,"tax":12},{"taxClass":"reduced","rate":800,"base":70,"tax":6}],"totals":{"goods":195,"discounts":0,"shipping":0,"exempt":0,"tax":18,"grandTotal":213},"warnings":[]},
  "worked 4: line discounts": {"currency":"USD","lines":[{"id":"A","gross":2500,"discounts":[{"kind":"line-percent","amount":250},{"kind":"line-percent","amount":112},{"kind":"line-amount","amount":300}],"net":1838}],"taxes":[{"taxClass":"standard","rate":2000,"base":1838,"tax":368}],"totals":{"goods":2500,"discounts":662,"shipping":0,"exempt":0,"tax":368,"grandTotal":2206},"warnings":[]},
  "worked 5: a capped amount discount": {"currency":"GBP","lines":[{"id":"A","gross":400,"discounts":[{"kind":"line-percent","amount":200},{"kind":"line-amount","amount":200}],"net":0},{"id":"B","gross":600,"discounts":[],"net":600}],"taxes":[{"taxClass":"standard","rate":2000,"base":600,"tax":120}],"totals":{"goods":1000,"discounts":400,"shipping":0,"exempt":0,"tax":120,"grandTotal":720},"warnings":["LINE_DISCOUNT_CAPPED"]},
  "worked 6: buy 2 get 1, ties": {"currency":"USD","lines":[{"id":"A","gross":1000,"discounts":[],"net":1000},{"id":"B","gross":1200,"discounts":[{"kind":"promotion","amount":800}],"net":400},{"id":"C","gross":400,"discounts":[],"net":400}],"taxes":[{"taxClass":"standard","rate":2000,"base":1800,"tax":360}],"totals":{"goods":2600,"discounts":800,"shipping":0,"exempt":0,"tax":360,"grandTotal":2160},"warnings":[]},
  "worked 7: a free unit after a percentage, a weighed line left out": {"currency":"EUR","lines":[{"id":"A","gross":1005,"discounts":[{"kind":"line-percent","amount":100},{"kind":"promotion","amount":302}],"net":603},{"id":"B","gross":335,"discounts":[],"net":335}],"taxes":[{"taxClass":"standard","rate":2100,"base":938,"tax":197}],"totals":{"goods":1340,"discounts":402,"shipping":0,"exempt":0,"tax":197,"grandTotal":1135},"warnings":[]},
  "worked 8: who counts as undiscounted": {"currency":"USD","lines":[{"id":"A","gross":2000,"discounts":[{"kind":"coupon-percent","amount":300}],"net":1700},{"id":"B","gross":820,"discounts":[{"kind":"coupon-percent","amount":123}],"net":697},{"id":"C","gross":1000,"discounts":[{"kind":"line-amount","amount":100}],"net":900}],"taxes":[{"taxClass":"standard","rate":2000,"base":2600,"tax":520},{"taxClass":"reduced","rate":500,"base":697,"tax":35}],"totals":{"goods":3820,"discounts":523,"shipping":0,"exempt":0,"tax":555,"grandTotal":3852},"warnings":["PROMOTION_UNUSED"]},
  "worked 9: buy 1 get 1, coupon on all lines": {"currency":"JPY","lines":[{"id":"A","gross":450,"discounts":[{"kind":"promotion","amount":150},{"kind":"coupon-percent","amount":15}],"net":285},{"id":"B","gross":130,"discounts":[{"kind":"promotion","amount":130}],"net":0}],"taxes":[{"taxClass":"standard","rate":1000,"base":285,"tax":28}],"totals":{"goods":580,"discounts":295,"shipping":0,"exempt":0,"tax":28,"grandTotal":313},"warnings":[]},
  "worked 10: an amount coupon, equal remainders": {"currency":"USD","lines":[{"id":"A","gross":1000,"discounts":[{"kind":"coupon-amount","amount":334}],"net":666},{"id":"B","gross":1000,"discounts":[{"kind":"coupon-amount","amount":333}],"net":667},{"id":"C","gross":1000,"discounts":[{"kind":"coupon-amount","amount":333}],"net":667}],"taxes":[{"taxClass":"standard","rate":2000,"base":1333,"tax":267},{"taxClass":"reduced","rate":500,"base":667,"tax":33}],"totals":{"goods":3000,"discounts":1000,"shipping":0,"exempt":0,"tax":300,"grandTotal":2300},"warnings":[]},
  "worked 11: spread in a tax-inclusive 3-decimal order": {"currency":"KWD","lines":[{"id":"A","gross":2300,"discounts":[{"kind":"coupon-amount","amount":434}],"net":1866},{"id":"B","gross":2300,"discounts":[{"kind":"coupon-amount","amount":434}],"net":1866},{"id":"C","gross":700,"discounts":[{"kind":"coupon-amount","amount":132}],"net":568}],"taxes":[{"taxClass":"standard","rate":1500,"base":1623,"tax":243},{"taxClass":"reduced","rate":500,"base":1777,"tax":89},{"taxClass":"zero","rate":0,"base":568,"tax":0}],"totals":{"goods":5300,"discounts":1000,"shipping":0,"exempt":0,"tax":332,"grandTotal":4300},"warnings":[]},
  "worked 12: shipping free at exactly the threshold": {"currency":"USD","lines":[{"id":"A","gross":5000,"discounts":[],"net":5000}],"taxes":[{"taxClass":"reduced","rate":500,"base":5000,"tax":250}],"totals":{"goods":5000,"discounts":0,"shipping":0,"exempt":0,"tax":250,"grandTotal":5250},"warnings":["FREE_SHIPPING"]},
  "worked 13: a coupon that brings back shipping": {"currency":"USD","lines":[{"id":"A","gross":5000,"discounts":[{"kind":"coupon-amount","amount":500}],"net":4500}],"taxes":[{"taxClass":"standard","rate":2000,"base":495,"tax":99},{"taxClass":"reduced","rate":500,"base":4500,"tax":225}],"totals":{"goods":5000,"discounts":500,"shipping":495,"exempt":0,"tax":324,"grandTotal":5319},"warnings":[]},
  "worked 14: reverse charge with tax included": {"currency":"EUR","lines":[{"id":"A","gross":1200,"discounts":[],"net":1200},{"id":"B","gross":500,"discounts":[],"net":500}],"taxes":[{"taxClass":"standard","rate":2000,"base":1000,"tax":0}],"totals":{"goods":1700,"discounts":0,"shipping":0,"exempt":500,"tax":0,"grandTotal":1500},"warnings":[]},
  "worked 15: half-even when taking tax out": {"currency":"GBP","lines":[{"id":"A","gross":1803,"discounts":[],"net":1803}],"taxes":[{"taxClass":"standard","rate":2000,"base":1503,"tax":300}],"totals":{"goods":1803,"discounts":0,"shipping":0,"exempt":0,"tax":300,"grandTotal":1803},"warnings":[]},
  "money: KWD prices with three decimals": {"currency":"KWD","lines":[{"id":"A","gross":3015,"discounts":[{"kind":"line-amount","amount":15}],"net":3000},{"id":"B","gross":530,"discounts":[],"net":530}],"taxes":[{"taxClass":"standard","rate":1500,"base":3000,"tax":450},{"taxClass":"reduced","rate":500,"base":530,"tax":26}],"totals":{"goods":3545,"discounts":15,"shipping":0,"exempt":0,"tax":476,"grandTotal":4006},"warnings":[]},
  "money: fewer decimals than the currency": {"currency":"USD","lines":[{"id":"A","gross":500,"discounts":[],"net":500},{"id":"B","gross":980,"discounts":[],"net":980},{"id":"C","gross":450,"discounts":[],"net":450}],"taxes":[{"taxClass":"standard","rate":2000,"base":1480,"tax":296},{"taxClass":"reduced","rate":500,"base":450,"tax":22}],"totals":{"goods":1930,"discounts":0,"shipping":0,"exempt":0,"tax":318,"grandTotal":2248},"warnings":[]},
  "money: weighed goods in a currency without decimals": {"currency":"JPY","lines":[{"id":"A","gross":37,"discounts":[],"net":37},{"id":"B","gross":38,"discounts":[],"net":38},{"id":"C","gross":22,"discounts":[],"net":22}],"taxes":[{"taxClass":"reduced","rate":800,"base":97,"tax":8}],"totals":{"goods":97,"discounts":0,"shipping":0,"exempt":0,"tax":8,"grandTotal":105},"warnings":[]},
  "money: a weighed quantity of \"2\" and of three decimals": {"currency":"EUR","lines":[{"id":"A","gross":398,"discounts":[],"net":398},{"id":"B","gross":100,"discounts":[],"net":100}],"taxes":[{"taxClass":"reduced","rate":700,"base":498,"tax":35}],"totals":{"goods":498,"discounts":0,"shipping":0,"exempt":0,"tax":35,"grandTotal":533},"warnings":[]},
  "tax: on the sum of each class, not line by line": {"currency":"USD","lines":[{"id":"A","gross":13,"discounts":[],"net":13},{"id":"B","gross":13,"discounts":[],"net":13},{"id":"C","gross":13,"discounts":[],"net":13},{"id":"D","gross":7,"discounts":[],"net":7},{"id":"E","gross":7,"discounts":[],"net":7}],"taxes":[{"taxClass":"standard","rate":1900,"base":39,"tax":7},{"taxClass":"reduced","rate":700,"base":14,"tax":1}],"totals":{"goods":53,"discounts":0,"shipping":0,"exempt":0,"tax":8,"grandTotal":61},"warnings":[]},
  "tax: zero-rated lines are listed, exempt lines are not": {"currency":"GBP","lines":[{"id":"A","gross":300,"discounts":[],"net":300},{"id":"B","gross":400,"discounts":[],"net":400},{"id":"C","gross":203,"discounts":[],"net":203},{"id":"D","gross":103,"discounts":[],"net":103}],"taxes":[{"taxClass":"standard","rate":2000,"base":306,"tax":61},{"taxClass":"zero","rate":0,"base":300,"tax":0}],"totals":{"goods":1006,"discounts":0,"shipping":0,"exempt":400,"tax":61,"grandTotal":1067},"warnings":[]},
  "line discounts: percentages compound and round half-even": {"currency":"CHF","lines":[{"id":"A","gross":2985,"discounts":[{"kind":"line-percent","amount":373},{"kind":"line-percent","amount":326}],"net":2286}],"taxes":[{"taxClass":"standard","rate":810,"base":2286,"tax":185}],"totals":{"goods":2985,"discounts":699,"shipping":0,"exempt":0,"tax":185,"grandTotal":2471},"warnings":[]},
  "line discounts: 100% and 33.33%, then nothing left to take": {"currency":"USD","lines":[{"id":"A","gross":999,"discounts":[{"kind":"line-percent","amount":999}],"net":0},{"id":"B","gross":1000,"discounts":[{"kind":"line-percent","amount":333}],"net":667}],"taxes":[{"taxClass":"standard","rate":2000,"base":667,"tax":133}],"totals":{"goods":1999,"discounts":1332,"shipping":0,"exempt":0,"tax":133,"grandTotal":800},"warnings":["LINE_DISCOUNT_CAPPED"]},
  "line discounts: an amount equal to what is left, and an amount of zero": {"currency":"EUR","lines":[{"id":"A","gross":500,"discounts":[{"kind":"line-amount","amount":500}],"net":0},{"id":"B","gross":150,"discounts":[],"net":150}],"taxes":[{"taxClass":"standard","rate":2000,"base":0,"tax":0},{"taxClass":"reduced","rate":700,"base":150,"tax":10}],"totals":{"goods":650,"discounts":500,"shipping":0,"exempt":0,"tax":10,"grandTotal":160},"warnings":[]},
  "promotion: the cheapest unit is measured after line discounts": {"currency":"USD","lines":[{"id":"A","gross":2000,"discounts":[{"kind":"line-percent","amount":1000},{"kind":"promotion","amount":1000}],"net":0},{"id":"B","gross":1250,"discounts":[],"net":1250}],"taxes":[{"taxClass":"standard","rate":2000,"base":0,"tax":0},{"taxClass":"reduced","rate":500,"base":1250,"tax":62}],"totals":{"goods":3250,"discounts":2000,"shipping":0,"exempt":0,"tax":62,"grandTotal":1312},"warnings":[]},
  "promotion: unit prices are compared as exact fractions": {"currency":"USD","lines":[{"id":"A","gross":300,"discounts":[{"kind":"line-amount","amount":1}],"net":299},{"id":"B","gross":200,"discounts":[{"kind":"line-amount","amount":1},{"kind":"promotion","amount":100}],"net":99}],"taxes":[{"taxClass":"standard","rate":2000,"base":398,"tax":80}],"totals":{"goods":500,"discounts":102,"shipping":0,"exempt":0,"tax":80,"grandTotal":478},"warnings":[]},
  "promotion: free units fill the cheapest line, then the next": {"currency":"EUR","lines":[{"id":"A","gross":150,"discounts":[],"net":150},{"id":"B","gross":80,"discounts":[{"kind":"promotion","amount":80}],"net":0},{"id":"C","gross":180,"discounts":[{"kind":"promotion","amount":90}],"net":90}],"taxes":[{"taxClass":"reduced","rate":700,"base":240,"tax":17}],"totals":{"goods":410,"discounts":170,"shipping":0,"exempt":0,"tax":17,"grandTotal":257},"warnings":[]},
  "promotion: a fully discounted line takes the free unit": {"currency":"USD","lines":[{"id":"A","gross":1500,"discounts":[{"kind":"line-percent","amount":1500}],"net":0},{"id":"B","gross":1500,"discounts":[],"net":1500}],"taxes":[{"taxClass":"standard","rate":2000,"base":1500,"tax":300}],"totals":{"goods":3000,"discounts":1500,"shipping":0,"exempt":0,"tax":300,"grandTotal":1800},"warnings":[]},
  "promotion: the value of free units rounds half-even": {"currency":"GBP","lines":[{"id":"A","gross":20,"discounts":[{"kind":"line-amount","amount":2},{"kind":"promotion","amount":4}],"net":14}],"taxes":[{"taxClass":"reduced","rate":500,"base":14,"tax":1}],"totals":{"goods":20,"discounts":6,"shipping":0,"exempt":0,"tax":1,"grandTotal":15},"warnings":[]},
  "promotion: two promotions in their order, one unused": {"currency":"USD","lines":[{"id":"A","gross":360,"discounts":[{"kind":"promotion","amount":120}],"net":240},{"id":"B","gross":160,"discounts":[],"net":160},{"id":"C","gross":150,"discounts":[],"net":150}],"taxes":[{"taxClass":"standard","rate":1900,"base":550,"tax":104}],"totals":{"goods":670,"discounts":120,"shipping":0,"exempt":0,"tax":104,"grandTotal":654},"warnings":["PROMOTION_UNUSED"]},
  "promotion: KRW buy 2 get 1 and a coupon on the other lines": {"currency":"KRW","lines":[{"id":"A","gross":13500,"discounts":[{"kind":"promotion","amount":4500}],"net":9000},{"id":"B","gross":2500,"discounts":[{"kind":"coupon-percent","amount":250}],"net":2250}],"taxes":[{"taxClass":"standard","rate":1000,"base":9000,"tax":900},{"taxClass":"reduced","rate":0,"base":2250,"tax":0}],"totals":{"goods":16000,"discounts":4750,"shipping":0,"exempt":0,"tax":900,"grandTotal":12150},"warnings":[]},
  "coupon: a percentage on all lines, after line discounts": {"currency":"GBP","lines":[{"id":"A","gross":1003,"discounts":[{"kind":"line-percent","amount":100},{"kind":"coupon-percent","amount":181}],"net":722},{"id":"B","gross":553,"discounts":[{"kind":"coupon-percent","amount":111}],"net":442}],"taxes":[{"taxClass":"standard","rate":2000,"base":1164,"tax":233}],"totals":{"goods":1556,"discounts":392,"shipping":0,"exempt":0,"tax":233,"grandTotal":1397},"warnings":[]},
  "coupon: a percentage that applies to no line, then an amount coupon": {"currency":"EUR","lines":[{"id":"A","gross":800,"discounts":[{"kind":"line-amount","amount":100},{"kind":"coupon-amount","amount":140}],"net":560},{"id":"B","gross":400,"discounts":[{"kind":"line-percent","amount":100},{"kind":"coupon-amount","amount":60}],"net":240}],"taxes":[{"taxClass":"standard","rate":2000,"base":560,"tax":112},{"taxClass":"reduced","rate":700,"base":240,"tax":17}],"totals":{"goods":1200,"discounts":400,"shipping":0,"exempt":0,"tax":129,"grandTotal":929},"warnings":["COUPON_NOT_APPLICABLE"]},
  "coupon: the amount coupon comes after the percentage, whatever the listed order": {"currency":"USD","lines":[{"id":"A","gross":2000,"discounts":[{"kind":"coupon-percent","amount":200},{"kind":"coupon-amount","amount":222}],"net":1578},{"id":"B","gross":700,"discounts":[{"kind":"line-percent","amount":70},{"kind":"coupon-amount","amount":78}],"net":552}],"taxes":[{"taxClass":"standard","rate":2000,"base":1578,"tax":316},{"taxClass":"reduced","rate":500,"base":552,"tax":28}],"totals":{"goods":2700,"discounts":570,"shipping":0,"exempt":0,"tax":344,"grandTotal":2474},"warnings":[]},
  "coupon: larger than the goods, capped, and shipping is still charged": {"currency":"USD","lines":[{"id":"A","gross":1200,"discounts":[{"kind":"coupon-amount","amount":1200}],"net":0},{"id":"B","gross":800,"discounts":[{"kind":"coupon-amount","amount":800}],"net":0}],"taxes":[{"taxClass":"standard","rate":2000,"base":500,"tax":100}],"totals":{"goods":2000,"discounts":2000,"shipping":500,"exempt":0,"tax":100,"grandTotal":600},"warnings":["COUPON_CAPPED"]},
  "coupon: exactly the goods total, no warning": {"currency":"JPY","lines":[{"id":"A","gross":600,"discounts":[{"kind":"coupon-amount","amount":600}],"net":0},{"id":"B","gross":400,"discounts":[{"kind":"coupon-amount","amount":400}],"net":0}],"taxes":[{"taxClass":"standard","rate":1000,"base":0,"tax":0},{"taxClass":"reduced","rate":800,"base":0,"tax":0}],"totals":{"goods":1000,"discounts":1000,"shipping":0,"exempt":0,"tax":0,"grandTotal":0},"warnings":[]},
  "coupon: a line at zero in the spread, ties by line order": {"currency":"EUR","lines":[{"id":"A","gross":0,"discounts":[],"net":0},{"id":"B","gross":300,"discounts":[{"kind":"coupon-amount","amount":51}],"net":249},{"id":"C","gross":300,"discounts":[{"kind":"coupon-amount","amount":50}],"net":250}],"taxes":[{"taxClass":"standard","rate":2000,"base":499,"tax":100}],"totals":{"goods":600,"discounts":101,"shipping":0,"exempt":0,"tax":100,"grandTotal":599},"warnings":[]},
  "coupon: spread over an exempt line too": {"currency":"GBP","lines":[{"id":"A","gross":1000,"discounts":[{"kind":"coupon-amount","amount":200}],"net":800},{"id":"B","gross":2000,"discounts":[{"kind":"coupon-amount","amount":400}],"net":1600}],"taxes":[{"taxClass":"standard","rate":2000,"base":800,"tax":160}],"totals":{"goods":3000,"discounts":600,"shipping":0,"exempt":1600,"tax":160,"grandTotal":2560},"warnings":[]},
  "coupon: largest remainders over five lines": {"currency":"USD","lines":[{"id":"A","gross":100,"discounts":[{"kind":"coupon-amount","amount":15}],"net":85},{"id":"B","gross":200,"discounts":[{"kind":"coupon-amount","amount":30}],"net":170},{"id":"C","gross":300,"discounts":[{"kind":"coupon-amount","amount":44}],"net":256},{"id":"D","gross":50,"discounts":[{"kind":"coupon-amount","amount":7}],"net":43},{"id":"E","gross":25,"discounts":[{"kind":"coupon-amount","amount":4}],"net":21}],"taxes":[{"taxClass":"standard","rate":2000,"base":341,"tax":68},{"taxClass":"reduced","rate":500,"base":170,"tax":8},{"taxClass":"zero","rate":0,"base":43,"tax":0}],"totals":{"goods":675,"discounts":100,"shipping":0,"exempt":21,"tax":76,"grandTotal":651},"warnings":[]},
  "coupon: OMR prices with tax, an amount coupon over two classes": {"currency":"OMR","lines":[{"id":"A","gross":1050,"discounts":[{"kind":"coupon-amount","amount":51}],"net":999},{"id":"B","gross":999,"discounts":[{"kind":"coupon-amount","amount":49}],"net":950}],"taxes":[{"taxClass":"standard","rate":500,"base":951,"tax":48},{"taxClass":"reduced","rate":200,"base":931,"tax":19}],"totals":{"goods":2049,"discounts":100,"shipping":0,"exempt":0,"tax":67,"grandTotal":1949},"warnings":[]},
  "coupon: BHD, a weighed line and a 7.5% coupon": {"currency":"BHD","lines":[{"id":"A","gross":1759,"discounts":[{"kind":"coupon-percent","amount":132}],"net":1627},{"id":"B","gross":540,"discounts":[{"kind":"coupon-percent","amount":40}],"net":500}],"taxes":[{"taxClass":"standard","rate":1000,"base":1627,"tax":163},{"taxClass":"reduced","rate":500,"base":500,"tax":25}],"totals":{"goods":2299,"discounts":172,"shipping":0,"exempt":0,"tax":188,"grandTotal":2315},"warnings":[]},
  "shipping: just below the threshold, in its own class": {"currency":"EUR","lines":[{"id":"A","gross":2499,"discounts":[],"net":2499}],"taxes":[{"taxClass":"standard","rate":2000,"base":2499,"tax":500},{"taxClass":"reduced","rate":700,"base":390,"tax":27}],"totals":{"goods":2499,"discounts":0,"shipping":390,"exempt":0,"tax":527,"grandTotal":3416},"warnings":[]},
  "shipping: no threshold, prices with tax": {"currency":"GBP","lines":[{"id":"A","gross":1000,"discounts":[],"net":1000}],"taxes":[{"taxClass":"standard","rate":2000,"base":1166,"tax":233}],"totals":{"goods":1000,"discounts":0,"shipping":399,"exempt":0,"tax":233,"grandTotal":1399},"warnings":[]},
  "shipping: exempt shipping goes to the exempt total": {"currency":"USD","lines":[{"id":"A","gross":1000,"discounts":[],"net":1000}],"taxes":[{"taxClass":"standard","rate":2000,"base":1000,"tax":200}],"totals":{"goods":1000,"discounts":0,"shipping":200,"exempt":200,"tax":200,"grandTotal":1400},"warnings":[]},
  "shipping: free shipping does not list its class": {"currency":"USD","lines":[{"id":"A","gross":2500,"discounts":[],"net":2500}],"taxes":[{"taxClass":"standard","rate":2000,"base":2500,"tax":500}],"totals":{"goods":2500,"discounts":0,"shipping":0,"exempt":0,"tax":500,"grandTotal":3000},"warnings":["FREE_SHIPPING"]},
  "shipping: the threshold is measured after discounts and before tax": {"currency":"GBP","lines":[{"id":"A","gross":4502,"discounts":[{"kind":"line-percent","amount":675}],"net":3827}],"taxes":[{"taxClass":"standard","rate":2000,"base":4229,"tax":846}],"totals":{"goods":4502,"discounts":675,"shipping":402,"exempt":0,"tax":846,"grandTotal":5075},"warnings":[]},
  "reverse charge with prices without tax, and shipping": {"currency":"EUR","lines":[{"id":"A","gross":3000,"discounts":[],"net":3000},{"id":"B","gross":800,"discounts":[],"net":800}],"taxes":[{"taxClass":"standard","rate":2000,"base":3500,"tax":0},{"taxClass":"reduced","rate":1000,"base":800,"tax":0}],"totals":{"goods":3800,"discounts":0,"shipping":500,"exempt":0,"tax":0,"grandTotal":4300},"warnings":[]},
  "prices with tax: line discounts, then tax taken out per class": {"currency":"USD","lines":[{"id":"A","gross":1100,"discounts":[{"kind":"line-percent","amount":110}],"net":990},{"id":"B","gross":420,"discounts":[],"net":420},{"id":"C","gross":300,"discounts":[],"net":300}],"taxes":[{"taxClass":"standard","rate":1000,"base":900,"tax":90},{"taxClass":"reduced","rate":500,"base":400,"tax":20},{"taxClass":"zero","rate":0,"base":300,"tax":0}],"totals":{"goods":1820,"discounts":110,"shipping":0,"exempt":0,"tax":110,"grandTotal":1710},"warnings":[]},
  "warnings: all five, once each, in their order": {"currency":"USD","lines":[{"id":"A","gross":200,"discounts":[{"kind":"line-amount","amount":200}],"net":0},{"id":"B","gross":100,"discounts":[{"kind":"line-percent","amount":10},{"kind":"coupon-amount","amount":90}],"net":0},{"id":"C","gross":50,"discounts":[{"kind":"line-amount","amount":50}],"net":0}],"taxes":[{"taxClass":"standard","rate":2000,"base":0,"tax":0}],"totals":{"goods":350,"discounts":350,"shipping":0,"exempt":0,"tax":0,"grandTotal":0},"warnings":["LINE_DISCOUNT_CAPPED","PROMOTION_UNUSED","COUPON_NOT_APPLICABLE","COUPON_CAPPED","FREE_SHIPPING"]},
};

// ---------- running ----------
// Only the properties SPEC.md section 5 lists are compared; anything else in the result is ignored.
const list = (x, f) => (Array.isArray(x) ? x.map(f) : x);
const project = (r) => ({
  currency: r?.currency,
  lines: list(r?.lines, (l) => ({ id: l?.id, gross: l?.gross, discounts: list(l?.discounts, (d) => ({ kind: d?.kind, amount: d?.amount })), net: l?.net })),
  taxes: list(r?.taxes, (t) => ({ taxClass: t?.taxClass, rate: t?.rate, base: t?.base, tax: t?.tax })),
  totals: r?.totals && { goods: r.totals.goods, discounts: r.totals.discounts, shipping: r.totals.shipping, exempt: r.totals.exempt, tax: r.totals.tax, grandTotal: r.totals.grandTotal },
  warnings: Array.isArray(r?.warnings) ? [...r.warnings] : r?.warnings,
});
// The first place where a and b differ, as a path, or null.
function diff(a, b, at = 'result') {
  if (Object.is(a, b)) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return `${at}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`;
  if (Array.isArray(a) && a.length !== b.length) return `${at}: got ${a.length} items ${JSON.stringify(a)}, expected ${b.length} ${JSON.stringify(b)}`;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = diff(a[k], b[k], Array.isArray(a) ? `${at}[${k}]` : `${at}.${k}`);
    if (d) return d;
  }
  return null;
}

async function runCase([name, order]) {
  const { computeInvoice } = await import(pathToFileURL(path.join(dir, 'src/invoice.mjs')).href);
  if (Array.isArray(order)) {
    for (const [o, code] of order) {
      let err;
      try {
        computeInvoice(o);
      } catch (e) {
        err = e;
      }
      if (!err) throw new Error(`no error for ${JSON.stringify(o).slice(0, 160)}, expected ${code}`);
      if (!(err instanceof RangeError)) throw new Error(`threw ${err?.name} (${err?.code}), not a RangeError, expected ${code}`);
      if (err.code !== code) throw new Error(`code ${err.code}, expected ${code}, for ${JSON.stringify(o).slice(0, 160)}`);
    }
    return;
  }
  const d = diff(project(computeInvoice(order)), EXPECTED[name]);
  if (d) throw new Error(d);
}

const which = process.argv.indexOf('--case');
if (which > 0) {
  let result;
  try {
    await runCase(CASES[Number(process.argv[which + 1])]);
    result = { ok: true };
  } catch (e) {
    result = { ok: false, why: String(e?.message ?? e).split('\n')[0].slice(0, 400) };
  }
  console.log(JSON.stringify(result));
  process.exit(0);
}

const runChild = (index) =>
  new Promise((resolve) => {
    execFile(process.execPath, [self, dir, '--case', String(index)], { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 1 << 20 }, (error, stdout) => {
      try {
        const r = JSON.parse(String(stdout).trim().split('\n').pop());
        if (typeof r.ok === 'boolean') return resolve(r);
      } catch {}
      resolve({ ok: false, why: error?.killed ? 'took more than 5 s' : `the case crashed: ${String(error?.message ?? '').split('\n')[0].slice(0, 200)}` });
    });
  });
const results = new Array(CASES.length);
let next = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (next < CASES.length) {
    const i = next++;
    results[i] = await runChild(i);
  }
}));
const failed = [];
CASES.forEach(([name], i) => {
  if (!results[i].ok) {
    failed.push(name);
    if (process.env.CHECK_VERBOSE) console.error(`FAIL ${name}: ${results[i].why}`);
  }
});
console.log(JSON.stringify({ passed: CASES.length - failed.length, total: CASES.length, failed }));
