# Bug report template

One bug per report. Write it so someone who has never seen the app can reproduce it in two minutes.

```markdown
## <What is wrong, and where>

**Severity:** Critical | High | Medium | Low
**Environment:** <address>, build <commit or version>, <browser and version>, <screen size>, account <test user>
**Seen:** <how often: every time | 3 of 5 tries | once>

**Steps**
1. Sign in as <test user>.
2. Go to <page or address>.
3. <Exact action, with the exact values typed.>

**Expected:** <what should happen, in one line>
**Actual:** <what happens instead, in one line>

**Evidence**
- Screenshot: <file or attachment>
- Console: `<exact error text>`
- Request: `<METHOD> <address>` returned `<status>`: `<short response body>`

**Notes:** <anything that narrows it down: works in Firefox, started after build X, only with coupons;
a suspected cause, marked as a guess>
```

## Example

```markdown
## Coupon discount applied twice when Apply is double-clicked

**Severity:** High
**Environment:** https://staging.shop.example, build 4f2c9e1, Chrome 141, 1280x800, account qa-buyer-1
**Seen:** 5 of 5 tries

**Steps**
1. Sign in as qa-buyer-1.
2. Add "Travel mug" (24.00) to the cart and open the cart.
3. Type SAVE10 in Coupon and double-click Apply.

**Expected:** One 10% discount: total 21.60.
**Actual:** Two discount lines appear: total 19.44. The order is saved at 19.44.

**Evidence**
- Screenshot: cart-double-discount.png
- Requests: two `POST /api/cart/coupons` 200 within 80 ms; the second should have been refused.

**Notes:** A single click works. The Apply button stays active while the first request runs.
```

## Severity, briefly

| Severity | Meaning |
| --- | --- |
| Critical | Data loss, a security hole, wrong payments, or a main flow blocked for everyone |
| High | A main flow broken for some users, or with no workaround |
| Medium | Wrong behaviour with a workaround; confusing errors |
| Low | Cosmetic issues, typos, small layout problems |

## The summary at the end

```markdown
**Verdict:** Not ready: 1 critical, 2 high.

**Bugs**
- Critical: <title> (link or section)
- High: <title>
- Medium: <title>

**Tested:** <flows>, on <browsers>, at <widths>, as <accounts>.
**Not tested:** <flows, browsers, devices, or data you could not cover, and why>.
```
