---
name: financial-model
description: Use when a business or project needs its numbers modelled in a spreadsheet (a revenue and cost forecast, cash flow, break-even, pricing, how much money to raise or borrow, scenarios). Not for a household budget (spreadsheets).
category: data
triggers: [financial model, financial projections, financial forecast, cash flow forecast, cashflow, break-even, break even, revenue model, unit economics, profit and loss, p&l, burn rate]
---

# Financial model

A financial model is a spreadsheet that turns a few clearly stated assumptions into revenue, costs,
profit and cash over time, so the person can see what has to be true for the plan to work and try
"what if". Keep the assumptions apart, calculate everything else with formulas, check that it adds
up, and say plainly what it is: a planning tool built on their assumptions, not financial advice.

## 1. Purpose and shape

- **The decision it serves:** how much to raise or borrow and when, what to charge, whether to hire,
  open a second site, take a contract, or apply for a loan (banks want a cash-flow forecast).
- **How money comes in:** units × price; subscribers × monthly fee, less those who leave; billable
  hours × rate; a commission on what passes through.
- **Time:** months for the first one to two years (cash is a monthly matter), then quarters or years
  to three to five years. The start month, the currency, and whether prices include sales tax.
- **As simple as the decision allows.** A one-page model the owner understands beats twenty tabs
  nobody trusts. Ask what they already know: last year's accounts, quotes, prices, a business plan.

## 2. Structure

| Sheet | Holds |
| --- | --- |
| Assumptions | every input, one per row, with its unit, where it came from, and low, base and high values |
| Revenue | the drivers turned into revenue by month |
| Costs | variable costs, fixed costs, people (a hiring plan), one-off spending |
| P&L | revenue − direct costs = gross profit − running costs = operating profit − interest − tax = net profit |
| Cash flow | profit adjusted for timing (when customers pay, when suppliers are paid, stock, sales tax, equipment, loans, money put in) → cash at the end of each month |
| Summary | the key numbers by year, break-even month, lowest cash and when, money needed, a chart or two |
| Checks | each check showing 0 or OK, and one cell that says whether all pass |

Add a balance sheet only when a bank or investor asks for one; then it must balance every month.

**Layout rules:** time runs across the columns, the same columns on every sheet; one item per row,
with its unit; no typed numbers inside formulas (`=C5*Assumptions!$D$7`, never `=C5*1.2`); one
formula per row, the same across the months; inputs in one colour (blue is the convention), formulas
in black; every row labelled.

## 3. Revenue drivers

| Business | Revenue per month |
| --- | --- |
| Shop or café | customers a day × average spend × days open × seasonal factor |
| Subscription | customers last month + new − leaving (churn %), × price |
| Services or agency | people × hours × share billed (utilisation) × hourly rate |
| Marketplace | value of sales passing through × the commission rate |
| Products | units × price, with a ramp-up from launch |

Check the result two ways: from the top (a believable share of the market) and from the bottom
(what the shop, the team or the machines can actually handle). Ramp-ups take longer than founders
expect: say so when the curve looks too steep.

## 4. Costs

- **Variable,** per unit or per sale: materials, packaging, delivery, card fees (often 1.5 to 3%),
  commissions. Revenue minus these is the gross margin.
- **Fixed:** rent, salaries plus employer costs (often 10 to 30% on top of pay, by country), software,
  insurance, accounting, marketing, the founder's own pay.
- **In steps:** a new hire for every 200 customers, a second oven at full capacity.
- **One-off:** equipment, fit-out, deposits; spread over their useful life in the P&L
  (depreciation), paid at once in the cash flow.
- Price rises and pay rises from year two.

## 5. Cash, break-even and money needed

- **Cash is not profit:** customers may pay in 30 to 60 days, stock is bought ahead, sales tax is paid
  over each quarter, loans are repaid. A profitable business can run out of cash.
- **Break-even:** units = fixed costs ÷ (price − variable cost per unit); revenue = fixed costs ÷
  gross margin %; and the month cumulative profit turns positive. Cash break-even (the bottom of the
  cumulative cash line) often comes later.
- **Money needed** = the lowest point of the cash line + a buffer (three to six months of costs).
- **Burn and runway:** net burn = cash going out − cash coming in, in a month; runway = cash in the
  bank ÷ net burn. Take both from the cash flow, not the P&L loss. When revenue is growing or hires
  are planned, read the month the cash line crosses zero instead of dividing.
- **Will it make it on the money it has?** (Paul Graham's "default alive" test): with costs as they
  are and revenue growing as it has over the last few months, does the monthly profit turn positive
  before the cash runs out? If not, raising money or cutting costs is not optional. Plan for the
  raise failing (a plan B with a date to switch), and beware hiring too fast, which he calls the
  biggest killer of start-ups that raise money.
- **Loans:** repayments with PMT (`=PMT(rate/12, months, -amount)`); interest goes in the P&L, the
  repaid part only in the cash flow.

## 6. Unit economics, when customers cost money to win

When customers come through paid marketing or sales, set what one customer brings in against what
it costs to win one. Use months for everything, and work it out per channel and per product: an
average can hide one that loses money.

| Measure | Formula |
| --- | --- |
| Cost to win a customer (CAC) | sales and marketing spend in a period ÷ new customers in the same period |
| Gross profit per customer a month | revenue per customer a month × gross margin % |
| Lifetime value (LTV), simple | gross profit per customer a month ÷ monthly churn |
| Payback | CAC ÷ gross profit per customer a month: the months to earn back the cost of winning them |

- The simple LTV assumes prices and churn stay as they are; with a year or more of history, add up
  what real groups of customers paid instead.
- The usual bars (LTV at least three times CAC, payback within a year) come from venture-funded
  software; a shop, an agency or a business paying its own way sets its own, by how long it can
  wait to get the money back.
- A price change moves both sides: €100 a month at a 60% margin and 5% monthly churn gives an LTV of
  €1,200; at €120, if churn rises to 8%, €900.

## 7. Scenarios and sensitivity

- **A scenario switch:** one cell on Assumptions (1 low, 2 base, 3 high), and each input in use as
  `=CHOOSE($C$2,D8,E8,F8)` from its low, base and high columns. The whole model flips at once.
- **Sensitivity:** change the five most uncertain assumptions one at a time (say ±20%) and note how
  profit and the lowest cash move; rank them. The top two or three are what to test in real life
  first.
- Report the base case with its range: "Lowest cash: −€48k (base), −€85k (low), −€30k (high)."

## 8. Checks

- Months add up to the year totals; revenue by product adds up to total revenue.
- Each month's closing cash is the next month's opening cash, and cash flow summed equals the change
  in cash.
- A balance sheet, if any, balances every month.
- No errors (#REF!, #DIV/0!), no typed numbers in formula rows, costs entered with one sign throughout.
- Reasonable: margins against the industry's, growth against what similar businesses manage, revenue
  per employee.

## 9. Build and hand over

- **With `save_sheet`:** the sheets above, formulas as text (`"=SUM(C5:N5)"`), money and percent
  formats, frozen headers. Then read it back with `get_page`, which shows what each formula gives,
  and fix anything wrong. A worked layout with formulas, checked in the app's own spreadsheet engine,
  is in `references/model-layout.md`.
- **As an .xlsx** (the spreadsheets skill) when it needs charts, a drop-down for the scenario switch,
  or colours that change with the checks.
- **Tell the person:** the key results; the three assumptions that matter most; what would have to be
  true; the main risks. And say it plainly: "This is a planning model built from your assumptions,
  not financial, tax or investment advice. Before a loan, an investment or a tax decision, have an
  accountant look at it."

## Pitfalls

- Typed numbers hidden in formulas.
- A hockey-stick curve with no driver behind it.
- Forgotten: cash timing, sales tax, employer costs, the founder's pay, customers who leave.
- Mixed rates: growth of 12% a year is about 0.95% a month (`=(1+12%)^(1/12)-1`), not 1%; churn of
  3% a month is about 31% a year (`=1-(1-3%)^12`), not 36%. Loan rates are the exception: quoted for
  the year and divided by 12, by convention.
- Circular references (interest on a cash balance that the interest changes): avoid them, or say
  how they are handled.
- One scenario only; figures to the cent five years out.
- The model presented as a forecast of what will happen.
