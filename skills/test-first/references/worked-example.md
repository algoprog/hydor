# A worked example: a bug fix, test first

The report: "Orders of exactly 50.00 are charged shipping, but the site says shipping is free from 50."

## 1. The list of behaviours

- below 50: 4.90
- exactly 50: free (the bug)
- above 50: free
- a negative total: rejected with an error

## 2. Red: reproduce the bug through the public function

```python
# tests/test_shipping.py
import pytest
from shop.shipping import shipping_fee

def test_exactly_fifty_ships_free():
    assert shipping_fee(50.00) == 0
```

Run only this test and read the failure:

```text
$ pytest tests/test_shipping.py::test_exactly_fifty_ships_free
E   assert 4.9 == 0
```

It fails on the assertion, for the reason in the report. Good: this is the reproduction.

## 3. Green: the smallest fix, at the cause

```python
# shop/shipping.py
FREE_FROM = 50.00
FLAT_FEE = 4.90

def shipping_fee(total: float) -> float:
    if total >= FREE_FROM:   # was: total > FREE_FROM
        return 0
    return FLAT_FEE
```

Run the test (passes), then the file, then the whole suite.

## 4. More cases from the list, one at a time

```python
def test_below_fifty_pays_flat_fee():
    assert shipping_fee(49.99) == 4.90

def test_rejects_negative_total():
    with pytest.raises(ValueError, match="total"):
        shipping_fee(-1)
```

The first passes already: fine, it pins behaviour that was right. Check it can fail (change `4.90` in
the code to `5.00`, see it fail, put it back). The second fails (no error is raised), so add the guard:

```python
def shipping_fee(total: float) -> float:
    if total < 0:
        raise ValueError(f"total must not be negative, got {total}")
    if total >= FREE_FROM:
        return 0
    return FLAT_FEE
```

## 5. Refactor while green

Money as floats is a latent bug (`0.1 + 0.2 != 0.3`). With the tests as a net, switch to integer cents
or `Decimal` in small steps, running the tests after each. That is a separate commit from the fix:

```text
fix: orders of exactly 50.00 ship free (was charged 4.90)
refactor: shipping fee in Decimal instead of float
```

## The same in TypeScript (Vitest)

```ts
// src/shipping.test.ts
import { describe, expect, it } from 'vitest';
import { shippingFee } from './shipping';

describe('shippingFee', () => {
  it('ships free at exactly 50', () => {
    expect(shippingFee(50)).toBe(0);
  });
  it('rejects a negative total', () => {
    expect(() => shippingFee(-1)).toThrow(/total/);
  });
});
```

Run one test: `npx vitest run src/shipping.test.ts -t "exactly 50"`.
