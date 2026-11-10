# src/invoice.mjs

The module exports `computeInvoice(order)`: it checks an order, applies the discounts, taxes and shipping below in
the order given, and returns the invoice. Plain integers throughout: no floating-point arithmetic on money at all.

## 1. Money

Every amount in the result is an integer number of minor units of the order's currency (cents for USD). The
currencies and their decimals:

| decimals | currencies |
| --- | --- |
| 0 | `JPY`, `KRW` |
| 2 | `USD`, `EUR`, `GBP`, `CHF` |
| 3 | `KWD`, `BHD`, `OMR` |

Codes are case-sensitive (`"usd"` is unknown). Amounts in the order (unit prices, discount amounts, coupon amounts,
the shipping fee and its threshold) are strings: one or more digits, optionally a `.` and one or more digits, and
nothing else (no sign, spaces, exponent or separators; `"04.50"` is fine, `".5"`, `"5."`, `"1,00"` and the number
`4.99` are not). They may have fewer decimals than the currency (`"4.9"` is 490 cents, `"5"` is 500) but not more:
`"4.999"` in USD and `"500.0"` in JPY are errors, even when the extra digits are zeros. Convert them exactly, digit
by digit: `"1.005"` in KWD is 1005 fils, while `parseFloat("1.005") * 1000` is 1004.9999999999999; three units at
`"0.07"` are 21 cents, while `0.07 * 3` is 0.21000000000000002.

**Rounding.** Wherever a step below says "rounded", the exact value (a fraction) is rounded to the nearest integer,
and a value exactly halfway goes to the even neighbour (half-even, "banker's rounding"): 12.5 → 12, 13.5 → 14,
100.5 → 100, 101.5 → 102, 2.4999 → 2, 2.5001 → 3. Half-up would give 13 and 101 for the first and third. Round
only where a step says so, never in between: keep exact integers or fractions (BigInt is the safe way; products
such as an amount times a quantity in thousandths times basis points can pass 2^53). The results are plain numbers.

## 2. The order

```
{
  currency: "USD",
  pricesIncludeTax: false,          // optional, false when missing: are prices with tax included?
  reverseCharge: false,             // optional, false when missing
  taxRates: { standard: 2000, reduced: 500 },   // basis points: 2000 is 20%
  lines: [
    { id: "A", sku: "TEA", quantity: 3, unitPrice: "4.99", taxClass: "standard",
      discounts: [ { type: "percent", percent: "10" }, { type: "amount", amount: "1.00" } ] },   // discounts optional
  ],
  promotions: [ { sku: "TEA", buy: 2, free: 1 } ],                               // optional
  coupons: [ { type: "percent", percent: "15", scope: "undiscounted" }, { type: "amount", amount: "5.00" } ],  // optional
  shipping: { fee: "4.95", taxClass: "standard", freeFrom: "50.00" }             // optional; freeFrom optional
}
```

- Tax classes: `standard` (rate `taxRates.standard`), `reduced` (rate `taxRates.reduced`), `zero` (rate 0) and
  `exempt` (no tax at all, kept apart from the taxed classes).
- `quantity` is either a whole number of units (a JavaScript integer, 1 or more), or a string for weighed goods:
  digits, optionally `.` and one to three digits (`"1.25"`, `"0.125"`, `"2"`), more than zero. A string quantity
  always makes the line weighed, even `"2"`.
- Percentages (`percent`) are strings: digits, optionally `.` and one or two digits (`"12.5"` is 12.5%, `"33.33"`),
  from 0 to 100 (`"100.00"` is allowed).

## 3. Errors

An invalid order throws a `RangeError` whose `code` property says why (and whose `message` is any non-empty text).
The checks run in exactly this order and the first one that fails is thrown:

1. `currency` is not in the table → `UNKNOWN_CURRENCY`.
2. `taxRates` is not an object whose `standard` and `reduced` are both integers from 0 to 10000 → `INVALID_TAX_RATES`.
3. `lines` is not an array with at least one line → `NO_LINES`.
4. Each line in turn, all its checks before the next line's:
   a. `id` is not a non-empty string, or an earlier line has the same id → `INVALID_LINE_ID`;
   b. `sku` is not a non-empty string → `INVALID_SKU`;
   c. `taxClass` is not one of the four → `UNKNOWN_TAX_CLASS`;
   d. `quantity` is a number below zero or a string that starts with `-` → `NEGATIVE_QUANTITY`; anything else that
      is not a valid quantity (zero, `2.5` as a number, `"1.2345"`, `"1."`, `null`) → `INVALID_QUANTITY`;
   e. `unitPrice` is not a valid amount string → `INVALID_AMOUNT`; it has more decimals than the currency →
      `TOO_MANY_DECIMALS`;
   f. `discounts`, when present: not an array → `INVALID_DISCOUNT`; then each discount in turn: `type` `"percent"`
      with `percent` not a valid percentage string → `INVALID_DISCOUNT`, above 100 → `DISCOUNT_OVER_100`; `type`
      `"amount"` with `amount` checked as `unitPrice` is (`INVALID_AMOUNT`, `TOO_MANY_DECIMALS`); any other `type` →
      `INVALID_DISCOUNT`.
5. `promotions`, when present: not an array → `INVALID_PROMOTION`; then each in turn: `sku` not a non-empty
   string, `buy` or `free` not an integer of 1 or more, or the same `sku` as an earlier promotion → `INVALID_PROMOTION`.
6. `coupons`, when present: not an array → `INVALID_COUPON`; then each in turn: `type` `"percent"` with `percent` not
   a valid percentage string → `INVALID_COUPON`, above 100 → `DISCOUNT_OVER_100`, `scope` present and neither
   `"undiscounted"` nor `"all"` → `INVALID_COUPON`; `type` `"amount"` with `amount` checked as `unitPrice` is; any other
   `type`, or a second coupon of a type already seen → `INVALID_COUPON` (a coupon's own fields are checked first: a
   second percentage coupon of `"150"` throws `DISCOUNT_OVER_100`).
7. `shipping`, when present: `fee` checked as `unitPrice` is, then `taxClass` (`UNKNOWN_TAX_CLASS`), then `freeFrom`
   when present, checked as `unitPrice` is.

So a line with `taxClass: "luxury"` and `quantity: -1` throws `UNKNOWN_TAX_CLASS`; an order in `"XYZ"` whose first
line has a negative quantity throws `UNKNOWN_CURRENCY`; and if line 1 has `unitPrice: "1.999"` in USD and line 2
`taxClass: "luxury"`, the error is `TOO_MANY_DECIMALS`.

## 4. The steps, in this order

Each line has a running amount, which starts at its gross amount and is lowered by each discount. A discount that
lowers a line's amount by more than 0 is recorded on that line as an entry `{ kind, amount }`, in the order applied;
a discount that comes to 0 leaves no entry.

1. **Gross.** `gross` = unit price × quantity. With a whole-number quantity it is exact; with a weighed quantity it
   is rounded: `"1.015"` × `"1.00"` = 101.5 cents → 102; `"0.125"` × `"1.00"` = 12.5 → 12.
2. **Line percentage discounts.** Each line's `percent` discounts, in their listed order, before any of its
   `amount` discounts wherever those are listed. Each takes `percent`% of the running amount, rounded, and lowers it
   (so two of them compound): kind `"line-percent"`.
3. **Line amount discounts.** Then each line's `amount` discounts in their listed order, each lowering the running
   amount by its amount but never below zero: a discount larger than what is left takes only what is left, and the
   warning `LINE_DISCOUNT_CAPPED` is given. Kind `"line-amount"`.
4. **Promotions** ("buy N get M free"), in their listed order. A promotion counts the units of the lines with its
   `sku` whose quantity is a number, not a string (weighed lines never take part). With U units,
   `floor(U / (buy + free)) × free` units are free. They are the cheapest units: a line's unit price here is its running amount divided by its
   quantity, compared exactly as fractions (not rounded), and lines with the same unit price go in line order.
   Free units go to the cheapest line, as many as it has, then to the next. A line given k free units of its q
   loses its running amount × k / q, rounded: kind `"promotion"`. A line already at 0 is the cheapest of all and
   takes free units like any other (they are worth 0, so no entry). A promotion that frees no unit (U < buy + free)
   gives the warning `PROMOTION_UNUSED`; free units worth 0 still count as freed.
5. **Percentage coupon.** With `scope: "undiscounted"` (also when `scope` is missing) it applies only to the lines
   that have no entry yet (steps 2 to 4 left them as they were); with `scope: "all"`, to every line. On each line it
   applies to, `percent`% of the running amount, rounded: kind `"coupon-percent"`. If it applies to no line at all,
   the warning `COUPON_NOT_APPLICABLE` is given.
6. **Amount coupon.** Spread over all the lines (every tax class, exempt too) in proportion to their running
   amounts, so that the parts add up to the coupon exactly. Let C be the coupon and T the sum of the running
   amounts. If C > T, C becomes T and the warning `COUPON_CAPPED` is given. Each line first gets
   `floor(C × amount / T)`; the R units still missing go one each to the R lines with the largest remainders
   `(C × amount) mod T`, and lines with the same remainder go in line order. Kind `"coupon-amount"`. (T = 0: nothing.)
7. **Net.** A line's `net` is its running amount now. The goods total is the sum of the nets.
8. **Shipping**, only when the order has `shipping`. It is free when `freeFrom` is given and the goods total is at
   least `freeFrom` (exactly equal counts), with the warning `FREE_SHIPPING`; otherwise its charge is `fee`. Coupons
   and discounts never apply to shipping, and the threshold is measured after all of them.
9. **Tax**, per class, on the sum of the nets of that class's lines plus the shipping charge if shipping is in that
   class, never line by line. A class is listed when at least one line is in it, or when shipping is charged (more
   than 0) and is in it, in the order `standard`, `reduced`, `zero`; `exempt` is never listed. For a class with the
   amount A and the rate r (basis points):
   - prices without tax (`pricesIncludeTax` false): `base` = A, `tax` = A × r / 10000, rounded;
   - prices with tax included: `tax` = A × r / (10000 + r), rounded, and `base` = A − `tax`;
   - with `reverseCharge` true, `base` is found as above but the `tax` reported is 0.

   Exempt lines (and shipping, if exempt) add their amounts to the `exempt` total instead.
10. **Totals.** `goods` = the sum of the gross amounts; `discounts` = the sum of all entries; `shipping` = the
    shipping charge (0 without shipping or when free); `exempt`; `tax` = the sum of the reported taxes; and
    `grandTotal` = the sum of the listed bases + `tax` + `exempt`. (So with prices without tax, the grand total is
    goods − discounts + shipping + tax; with tax included, goods − discounts + shipping, less any tax that reverse
    charge removed.)

**Warnings** are listed once each, in this order, whichever of them were given: `LINE_DISCOUNT_CAPPED`,
`PROMOTION_UNUSED`, `COUPON_NOT_APPLICABLE`, `COUPON_CAPPED`, `FREE_SHIPPING`.

## 5. The result

The result of worked example 6 below, in full:

```
{
  currency: "USD",
  lines: [                                          // in the order's line order
    { id: "A", gross: 1000, discounts: [], net: 1000 },
    { id: "B", gross: 1200, discounts: [ { kind: "promotion", amount: 800 } ], net: 400 },
    { id: "C", gross: 400, discounts: [], net: 400 }
  ],
  taxes: [ { taxClass: "standard", rate: 2000, base: 1800, tax: 360 } ],
  totals: { goods: 2600, discounts: 800, shipping: 0, exempt: 0, tax: 360, grandTotal: 2160 },
  warnings: []
}
```

Every amount is a plain integer number (not a BigInt). The checker compares exactly these properties and ignores
any others.

## 6. Worked examples

Each of these is one of the checker's orders. "std" is `standard`, "red" is `reduced`; prices are without tax
unless the example says otherwise; a line is written id: quantity × unit price, sku, class, discounts.

1. **Exact money, tax per class.** USD, std 2000. A: 3 × "0.07" PEN std; B: 1 × "0.12" INK std. Gross 21 and 12.
   Std base 33, tax 6.6 → 7 (tax line by line would be 4.2 → 4 and 2.4 → 2: 6). Totals: goods 33, tax 7, grand 40.
2. **Weighed goods.** EUR, std 2000, red 700. A: "1.015" × "1.00" CHEESE red → 101.5 → 102; B: "0.125" × "1.00"
   HAM red → 12.5 → 12. Red base 114, tax 7.98 → 8. Goods 114, grand 122.
3. **Half-even tax.** JPY, std 1000, red 800. A: 1 × "125" std; B: 2 × "35" red. Std tax 12.5 → 12; red base 70,
   tax 5.6 → 6. Goods 195, tax 18, grand 213.
4. **Line discounts.** USD, std 2000. A: 2 × "12.50" std, discounts listed as amount "3.00", percent "10", percent
   "5". Gross 2500; 10% → 250, 2250; 5% of 2250 = 112.5 → 112, 2138; then the amount 300 → 1838. Entries
   line-percent 250, line-percent 112, line-amount 300. Tax 367.6 → 368. Discounts 662, grand 2206.
5. **A capped amount discount.** GBP, std 2000. A: 1 × "4.00" std, percent "50", amount "2.50"; B: 1 × "6.00" std.
   A: 400 → 200; the 250 takes only 200 (entry 200), net 0. Std base 600, tax 120. Discounts 400, grand 720,
   warnings `LINE_DISCOUNT_CAPPED`.
6. **Buy 2 get 1, ties.** USD, std 2000, promotion SOCK buy 2 free 1. A: 2 × "5.00" SOCK; B: 3 × "4.00" SOCK; C:
   1 × "4.00" SOCK, all std. 6 units → 2 free. B and C tie at 400 a unit; B comes first and takes both: 1200 × 2/3
   = 800. Nets 1000, 400, 400. Std base 1800, tax 360. Goods 2600, discounts 800, grand 2160.
7. **A free unit after a percentage, a weighed line left out.** EUR, std 2100, promotion TEA buy 2 free 1. A: 3 ×
   "3.35" TEA std, percent "10"; B: "1.000" × "3.35" TEA std. A: 1005, 10% = 100.5 → 100, 905. Only A's 3 units
   count: 1 free, 905 / 3 = 301.67 → 302, net 603. B: 335. Std base 938, tax 196.98 → 197. Discounts 402, grand 1135.
8. **Who counts as undiscounted.** USD, std 2000, red 500, promotion CUP buy 3 free 1, coupon percent "15". A: 1 ×
   "20.00" BAG std, percent "0"; B: 2 × "4.10" CUP red; C: 1 × "10.00" HAT std, amount "1.00". A's 0% leaves no
   entry; CUP has 2 units, so no free unit (`PROMOTION_UNUSED`); C: 900. The coupon takes A 300 (net 1700) and B
   123 (net 697), not C. Std base 2600, tax 520; red base 697, tax 34.85 → 35. Discounts 523, grand 3852.
9. **Buy 1 get 1, coupon on all lines.** JPY, std 1000, promotion ONIGIRI buy 1 free 1, coupon percent "5" scope
   "all". A: 3 × "150" ONIGIRI std; B: 1 × "130" ONIGIRI std. 4 units → 2 free: B is cheapest (130) and gives its
   one unit (130), then A one (450 / 3 = 150), net 300. The coupon: A 15 (net 285), B 0 (no entry). Std base 285,
   tax 28.5 → 28. Goods 580, discounts 295, grand 313.
10. **An amount coupon, equal remainders.** USD, std 2000, red 500, coupon amount "10.00". A: 1 × "10.00" std; B:
    1 × "10.00" red; C: 1 × "10.00" std. 1000 × 1000 / 3000 = 333 each, remainders equal, the 1 left goes to A:
    334, 333, 333. Std 666 + 667 = 1333, tax 266.6 → 267; red 667, tax 33.35 → 33. Discounts 1000, grand 2300.
11. **Spread in a tax-inclusive 3-decimal order.** KWD, prices with tax, std 1500, red 500, coupon amount "1.000".
    A: 1 × "2.300" std; B: 2 × "1.150" red; C: 1 × "0.700" zero. T = 5300. Floors 433, 433, 132 (998); remainders
    5100, 5100, 400; the 2 left go to A and B: 434, 434, 132. Nets 1866, 1866, 568. Std tax 1866 × 1500 / 11500 =
    243.39 → 243, base 1623; red tax 1866 × 500 / 10500 = 88.86 → 89, base 1777; zero base 568, tax 0. Tax 332,
    grand 4300.
12. **Shipping free at exactly the threshold.** USD, std 2000, red 500, shipping fee "4.95" std, free from "50.00".
    A: 2 × "25.00" BOOK red. Goods total 5000 = 5000: free, `FREE_SHIPPING`. Only red is listed: base 5000, tax 250.
    Grand 5250.
13. **A coupon that brings back shipping.** Example 12 with coupon amount "5.00": goods total 4500, so shipping
    495 is charged, in std, and not discounted. Std base 495, tax 99; red base 4500, tax 225. Discounts 500,
    shipping 495, tax 324, grand 5319.
14. **Reverse charge with tax included.** EUR, prices with tax, reverse charge, std 2000. A: 1 × "12.00" std; B:
    1 × "5.00" BOOK exempt. Std: tax 1200 × 2000 / 12000 = 200, base 1000, reported tax 0. Exempt 500. Tax 0,
    grand 1500.
15. **Half-even when taking tax out.** GBP, prices with tax, std 2000. A: 1 × "18.03" std. Tax 1803 / 6 = 300.5 →
    300, base 1503. Grand 1803.
