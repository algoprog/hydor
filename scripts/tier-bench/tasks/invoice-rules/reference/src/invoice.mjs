// Invoice rules, as SPEC.md states them. All money is BigInt minor units inside, plain numbers in the result.

const DECIMALS = { JPY: 0, KRW: 0, USD: 2, EUR: 2, GBP: 2, CHF: 2, KWD: 3, BHD: 3, OMR: 3 };
const CLASSES = ['standard', 'reduced', 'zero', 'exempt'];
const TAXED = ['standard', 'reduced', 'zero'];
const WARNING_ORDER = ['LINE_DISCOUNT_CAPPED', 'PROMOTION_UNUSED', 'COUPON_NOT_APPLICABLE', 'COUPON_CAPPED', 'FREE_SHIPPING'];

function fail(code) {
  const err = new RangeError(`invalid order: ${code}`);
  err.code = code;
  throw err;
}

const isDigits = (s) => s.length > 0 && [...s].every((c) => c >= '0' && c <= '9');

// "12.34" → { int: "12", frac: "34" }, or null when the text is not digits[.digits].
function decimal(s, maxFrac = Infinity) {
  if (typeof s !== 'string') return null;
  const parts = s.split('.');
  if (parts.length > 2 || !isDigits(parts[0])) return null;
  if (parts.length === 2 && (!isDigits(parts[1]) || parts[1].length > maxFrac)) return null;
  return { int: parts[0], frac: parts[1] ?? '' };
}

// value × 10^scale as a BigInt (the text must have at most scale decimals).
const scaled = (d, scale) => BigInt(d.int + d.frac.padEnd(scale, '0'));

// Checks an amount string and gives its minor units.
function money(s, places) {
  const d = decimal(s);
  if (!d) fail('INVALID_AMOUNT');
  if (d.frac.length > places) fail('TOO_MANY_DECIMALS');
  return scaled(d, places);
}

// A percentage string as basis points (hundredths of a percent).
function percentBp(s, badCode) {
  const d = decimal(s, 2);
  if (!d) fail(badCode);
  const bp = scaled(d, 2);
  if (bp > 10000n) fail('DISCOUNT_OVER_100');
  return bp;
}

// n / d rounded half to even, for n >= 0 and d > 0.
function roundDiv(n, d) {
  const q = n / d;
  const r2 = (n % d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) return q + 1n;
  return q;
}

const nonEmptyString = (x) => typeof x === 'string' && x.length > 0;
const positiveInt = (x) => Number.isInteger(x) && x >= 1;

function quantityOf(q) {
  if ((typeof q === 'number' && q < 0) || (typeof q === 'string' && q.startsWith('-'))) fail('NEGATIVE_QUANTITY');
  if (typeof q === 'number') {
    if (!Number.isSafeInteger(q) || q < 1) fail('INVALID_QUANTITY');
    return { thousandths: BigInt(q) * 1000n, units: BigInt(q), whole: true };
  }
  const d = decimal(q, 3);
  if (!d) fail('INVALID_QUANTITY');
  const thousandths = scaled(d, 3);
  if (thousandths === 0n) fail('INVALID_QUANTITY');
  return { thousandths, units: null, whole: false };
}

function validate(order) {
  if (!order || typeof order !== 'object' || !Object.hasOwn(DECIMALS, order.currency)) fail('UNKNOWN_CURRENCY');
  const places = DECIMALS[order.currency];
  const rates = order.taxRates;
  const rateOk = (r) => Number.isInteger(r) && r >= 0 && r <= 10000;
  if (!rates || typeof rates !== 'object' || !rateOk(rates.standard) || !rateOk(rates.reduced)) fail('INVALID_TAX_RATES');
  if (!Array.isArray(order.lines) || order.lines.length === 0) fail('NO_LINES');

  const ids = new Set();
  const lines = order.lines.map((line) => {
    if (!line || !nonEmptyString(line.id) || ids.has(line.id)) fail('INVALID_LINE_ID');
    ids.add(line.id);
    if (!nonEmptyString(line.sku)) fail('INVALID_SKU');
    if (!CLASSES.includes(line.taxClass)) fail('UNKNOWN_TAX_CLASS');
    const quantity = quantityOf(line.quantity);
    const price = money(line.unitPrice, places);
    const percents = [];
    const amounts = [];
    if (line.discounts !== undefined) {
      if (!Array.isArray(line.discounts)) fail('INVALID_DISCOUNT');
      for (const d of line.discounts) {
        if (d?.type === 'percent') percents.push(percentBp(d.percent, 'INVALID_DISCOUNT'));
        else if (d?.type === 'amount') amounts.push(money(d.amount, places));
        else fail('INVALID_DISCOUNT');
      }
    }
    return { id: line.id, sku: line.sku, taxClass: line.taxClass, quantity, price, percents, amounts };
  });

  const promotions = [];
  if (order.promotions !== undefined) {
    if (!Array.isArray(order.promotions)) fail('INVALID_PROMOTION');
    const skus = new Set();
    for (const p of order.promotions) {
      if (!p || !nonEmptyString(p.sku) || !positiveInt(p.buy) || !positiveInt(p.free) || skus.has(p.sku)) fail('INVALID_PROMOTION');
      skus.add(p.sku);
      promotions.push({ sku: p.sku, buy: BigInt(p.buy), free: BigInt(p.free) });
    }
  }

  let percentCoupon = null;
  let amountCoupon = null;
  if (order.coupons !== undefined) {
    if (!Array.isArray(order.coupons)) fail('INVALID_COUPON');
    for (const c of order.coupons) {
      if (c?.type === 'percent') {
        const bp = percentBp(c.percent, 'INVALID_COUPON');
        if (c.scope !== undefined && c.scope !== 'undiscounted' && c.scope !== 'all') fail('INVALID_COUPON');
        if (percentCoupon) fail('INVALID_COUPON');
        percentCoupon = { bp, all: c.scope === 'all' };
      } else if (c?.type === 'amount') {
        const amount = money(c.amount, places);
        if (amountCoupon) fail('INVALID_COUPON');
        amountCoupon = { amount };
      } else fail('INVALID_COUPON');
    }
  }

  let shipping = null;
  if (order.shipping !== undefined) {
    const s = order.shipping;
    const fee = money(s?.fee, places);
    if (!CLASSES.includes(s.taxClass)) fail('UNKNOWN_TAX_CLASS');
    const freeFrom = s.freeFrom === undefined ? null : money(s.freeFrom, places);
    shipping = { fee, taxClass: s.taxClass, freeFrom };
  }

  return {
    currency: order.currency,
    inclusive: order.pricesIncludeTax === true,
    reverseCharge: order.reverseCharge === true,
    rates: { standard: BigInt(rates.standard), reduced: BigInt(rates.reduced), zero: 0n },
    lines,
    promotions,
    percentCoupon,
    amountCoupon,
    shipping,
  };
}

export function computeInvoice(order) {
  const o = validate(order);
  const warnings = new Set();

  // 1. Gross.
  const lines = o.lines.map((l) => {
    const gross = l.quantity.whole ? l.price * l.quantity.units : roundDiv(l.price * l.quantity.thousandths, 1000n);
    return { ...l, gross, amount: gross, entries: [] };
  });
  const apply = (line, kind, amount) => {
    if (amount > 0n) {
      line.amount -= amount;
      line.entries.push({ kind, amount });
    }
  };

  // 2. Line percentages, then 3. line amounts.
  for (const line of lines) for (const bp of line.percents) apply(line, 'line-percent', roundDiv(line.amount * bp, 10000n));
  for (const line of lines) {
    for (const want of line.amounts) {
      if (want > line.amount) warnings.add('LINE_DISCOUNT_CAPPED');
      apply(line, 'line-amount', want > line.amount ? line.amount : want);
    }
  }

  // 4. Promotions: the cheapest whole units are free.
  for (const promo of o.promotions) {
    const eligible = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.sku === promo.sku && line.quantity.whole);
    const units = eligible.reduce((sum, { line }) => sum + line.quantity.units, 0n);
    let free = (units / (promo.buy + promo.free)) * promo.free;
    if (free === 0n) {
      warnings.add('PROMOTION_UNUSED');
      continue;
    }
    // amount_a / q_a < amount_b / q_b  <=>  amount_a × q_b < amount_b × q_a
    eligible.sort((a, b) => {
      const left = a.line.amount * b.line.quantity.units;
      const right = b.line.amount * a.line.quantity.units;
      return left < right ? -1 : left > right ? 1 : a.index - b.index;
    });
    for (const { line } of eligible) {
      if (free === 0n) break;
      const q = line.quantity.units;
      const k = free < q ? free : q;
      free -= k;
      apply(line, 'promotion', roundDiv(line.amount * k, q));
    }
  }

  // 5. Percentage coupon.
  if (o.percentCoupon) {
    const targets = lines.filter((line) => o.percentCoupon.all || line.entries.length === 0);
    if (targets.length === 0) warnings.add('COUPON_NOT_APPLICABLE');
    for (const line of targets) apply(line, 'coupon-percent', roundDiv(line.amount * o.percentCoupon.bp, 10000n));
  }

  // 6. Amount coupon, by largest remainder.
  if (o.amountCoupon) {
    const total = lines.reduce((sum, line) => sum + line.amount, 0n);
    let coupon = o.amountCoupon.amount;
    if (coupon > total) {
      coupon = total;
      warnings.add('COUPON_CAPPED');
    }
    if (total > 0n) {
      const parts = lines.map((line, index) => ({ line, index, share: (coupon * line.amount) / total, rest: (coupon * line.amount) % total }));
      let left = coupon - parts.reduce((sum, p) => sum + p.share, 0n);
      const byRest = [...parts].sort((a, b) => (a.rest > b.rest ? -1 : a.rest < b.rest ? 1 : a.index - b.index));
      for (const p of byRest) {
        if (left === 0n) break;
        p.share += 1n;
        left -= 1n;
      }
      for (const p of parts) apply(p.line, 'coupon-amount', p.share);
    }
  }

  // 7. Net, 8. shipping.
  const goodsNet = lines.reduce((sum, line) => sum + line.amount, 0n);
  let shippingCharge = 0n;
  if (o.shipping) {
    if (o.shipping.freeFrom !== null && goodsNet >= o.shipping.freeFrom) warnings.add('FREE_SHIPPING');
    else shippingCharge = o.shipping.fee;
  }

  // 9. Tax per class.
  const sums = { standard: 0n, reduced: 0n, zero: 0n, exempt: 0n };
  const listed = new Set();
  for (const line of lines) {
    sums[line.taxClass] += line.amount;
    listed.add(line.taxClass);
  }
  if (o.shipping && shippingCharge > 0n) {
    sums[o.shipping.taxClass] += shippingCharge;
    listed.add(o.shipping.taxClass);
  }
  const taxes = [];
  let baseTotal = 0n;
  let taxTotal = 0n;
  for (const cls of TAXED) {
    if (!listed.has(cls)) continue;
    const a = sums[cls];
    const r = o.rates[cls];
    let base;
    let tax;
    if (o.inclusive) {
      tax = roundDiv(a * r, 10000n + r);
      base = a - tax;
    } else {
      base = a;
      tax = roundDiv(a * r, 10000n);
    }
    if (o.reverseCharge) tax = 0n;
    baseTotal += base;
    taxTotal += tax;
    taxes.push({ taxClass: cls, rate: Number(r), base: Number(base), tax: Number(tax) });
  }

  // 10. Totals.
  const goods = lines.reduce((sum, line) => sum + line.gross, 0n);
  const discounts = lines.reduce((sum, line) => sum + line.entries.reduce((s, e) => s + e.amount, 0n), 0n);
  return {
    currency: o.currency,
    lines: lines.map((line) => ({ id: line.id, gross: Number(line.gross), discounts: line.entries.map((e) => ({ kind: e.kind, amount: Number(e.amount) })), net: Number(line.amount) })),
    taxes,
    totals: {
      goods: Number(goods),
      discounts: Number(discounts),
      shipping: Number(shippingCharge),
      exempt: Number(sums.exempt),
      tax: Number(taxTotal),
      grandTotal: Number(baseTotal + taxTotal + sums.exempt),
    },
    warnings: WARNING_ORDER.filter((w) => warnings.has(w)),
  };
}
