# A model layout, worked through

A small café model: the assumptions with a scenario switch, a monthly profit and cash sheet, a loan
schedule, checks and a summary. It was built with the script below and computed in the app's own
spreadsheet engine, so its formulas work in `save_sheet` as they are. Use it as a pattern: change the
inputs and the rows to fit the business.

## The sheets

**Assumptions**: one input per row. Column C ("In use") is what every formula reads:
`=CHOOSE($C$2,D3,E3,F3)` picks the low, base or high value by the switch in C2. Inputs in blue,
with where each number came from in column G.

**Monthly**: months across (row 1 dates made with `EDATE`, row 2 the month number), one item per row.
The first month's opening values point at the assumptions; the later months point at the month
before.

| Row | Item | Month 1 (column C) | Later months (D onwards) |
| --- | --- | --- | --- |
| 3 | Customers a day | `=Assumptions!$C$3` | `=C3*(1+Assumptions!$C$4)` |
| 4 | Revenue | `=C3*Assumptions!$C$5*Assumptions!$C$6` | same, in its own column |
| 5–6 | Direct costs, card fees | `=-C4*Assumptions!$C$7` | same |
| 7 | Gross profit | `=C4+C5+C6` | same |
| 8–10 | Rent, staff, other fixed costs | `=-Assumptions!$C$9` | same |
| 11 | Operating profit before depreciation | `=SUM(C7:C10)` | same |
| 12 | Depreciation | `=-Assumptions!$C$12/Assumptions!$C$13` | same |
| 13 | Loan interest | `=-C25*Assumptions!$C$16/12` | same |
| 14 | Profit before tax | `=C11+C12+C13` | same |
| 16 | Cash at the start of the month | `=Assumptions!$C$18` | `=C23` |
| 17–18 | Profit, depreciation added back | `=C14`, `=-C12` | same |
| 19–21 | Equipment, owner's money, loan received | `=IF(C$2=1,-Assumptions!$C$12,0)` | same |
| 22 | Loan repaid (not the interest) | `=-(PMT(Assumptions!$C$16/12,Assumptions!$C$17,-Assumptions!$C$15)+C13)` | same |
| 23 | Cash at the end of the month | `=SUM(C16:C22)` | same |
| 25 | Loan owed at the start | `=Assumptions!$C$15` | `=C26` |
| 26 | Loan owed at the end | `=C25+C22` | same |
| 27 | Made a profit (1 = yes) | `=IF(C14>0,1,0)` | same |

Costs are negative throughout, so every total is a plain sum. Tax is left out of this example; add a
row for it (and a quarterly sales-tax payment in the cash block) where it applies.

**Checks**: each difference should be 0, and one cell sums them up.

| Check | Formula |
| --- | --- |
| Cash at the end = cash at the start + every movement | `=ROUND(Monthly!N23-(Monthly!C16+SUM(Monthly!C17:N22)),2)` |
| Each month starts with the last month's end | `=ROUND(SUMPRODUCT(ABS(Monthly!D16:N16-Monthly!C23:M23)),2)` |
| Loan owed = loan − repayments | `=ROUND(Monthly!N26-(Assumptions!C15+SUM(Monthly!C22:N22)),2)` |
| Gross profit = revenue − direct costs − card fees | `=ROUND(SUM(Monthly!C7:N7)-SUM(Monthly!C4:N6),2)` |
| All checks | `=IF(MAX(ABS(B2),ABS(B3),ABS(B4),ABS(B5))<0.01,"All pass","A CHECK FAILED")` |

**Summary**: the numbers the person asked about, each with how it is worked out.

| Line | Formula |
| --- | --- |
| Lowest cash | `=MIN(Monthly!C23:N23)` |
| Month of the lowest cash | `=INDEX(Monthly!C1:N1,MATCH(B4,Monthly!C23:N23,0))` |
| First month with a profit | `=IFERROR(INDEX(Monthly!C1:N1,MATCH(1,Monthly!C27:N27,0)),"None yet")` |
| Customers a day to break even | fixed costs ÷ (spend × days × (1 − direct % − card %)) |
| Extra money needed for the buffer | `=MAX(0,buffer months × fixed costs − lowest cash)` |

## What it gives

| | Low | Base | High |
| --- | --- | --- | --- |
| Revenue, year 1 | €128,601 | €209,229 | €295,194 |
| Profit before tax, year 1 | −€72,757 | −€14,300 | €51,344 |
| Lowest cash | −€56,385 (Dec) | €5,987 (Nov) | €26,700 (Jan) |
| First month with a profit | none in year 1 | December | January |
| Customers a day to break even | 114 | 93 | 82 |
| Extra money for a three-month buffer | €91,485 | €28,513 | €7,500 |

Read it the way the person should: in the base case the café gets through its first year but with
almost no cash left in November, and it needs 93 customers a day against 80 at opening. The thing to
test first is footfall; the money to have ready is about €30,000 more than planned.

## Sensitivity without data tables

`save_sheet` has no what-if tables. Either change one input at a time, save, and read the Summary back
with `get_page` (note each result, then put the input back), or rebuild the same arithmetic in a short
Python loop to rank which inputs move profit and lowest cash the most. In an .xlsx, Excel's own data
tables work (the spreadsheets skill).

## The script that writes it

Run it with `python3`; it writes `model.json`, whose content is the `save_sheet` call's arguments
(title and sheets). Change `N_MONTHS` to 36 for three years: the ranges follow. After saving, read
the workbook back with `get_page` and confirm that Checks says "All pass".

```python
# Writes model.json: a small café model for save_sheet (pass the file's content as save_sheet's arguments).
import json

N_MONTHS = 12                                     # 36 for three years


def col(n):
    """Column letters from a number: 3 → C, 27 → AA."""
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


MONTHS = [col(3 + i) for i in range(N_MONTHS)]    # month 1 in column C
F, L = MONTHS[0], MONTHS[-1]                      # first and last month's columns
A = "Assumptions!$C$"                             # the "In use" column of Assumptions


def row(label, unit, first, rest=None):
    """One row across the months: `first` for month 1, `rest` (if given) for the others.
    In the formulas, {c} is this month's column and {p} the month before's."""
    out = [label, unit]
    for i, c in enumerate(MONTHS):
        f = first if i == 0 or rest is None else rest
        out.append(f.format(c=c, p=MONTHS[i - 1] if i else ""))
    return out


def choose(r):
    return f"=CHOOSE($C$2,D{r},E{r},F{r})"


inputs = [  # label, unit, low, base, high, where it comes from (rows 3 to 19)
    ("Customers a day, first month", "people", 60, 80, 100, "Footfall count at the site, 2 weekdays"),
    ("Growth in customers each month", "%", "1%", "2%", "3%", "Owner's estimate"),
    ("Average spend", "€", 6.5, 7.5, 8, "Prices of three cafés nearby"),
    ("Days open a month", "days", 26, 26, 26, ""),
    ("Direct costs (food, drink, packaging)", "% of sales", "38%", "35%", "32%", "Supplier price list"),
    ("Card fees", "% of sales", "1.5%", "1.5%", "1.5%", "Card provider's terms"),
    ("Rent", "€ a month", 2500, 2500, 2500, "Lease offer"),
    ("Staff, with employer costs", "€ a month", 7800, 7800, 7800, "Two part-time staff"),
    ("Other fixed costs", "€ a month", 1400, 1200, 1100, "Insurance, utilities, software, accountant"),
    ("Fit-out and equipment, month 1", "€", 40000, 35000, 30000, "Two quotes"),
    ("Equipment life", "months", 60, 60, 60, "Depreciated over five years"),
    ("Owner's money put in, month 1", "€", 25000, 25000, 25000, ""),
    ("Bank loan, month 1", "€", 30000, 30000, 30000, "Bank's offer"),
    ("Loan interest a year", "%", "8%", "8%", "8%", "Bank's offer"),
    ("Loan length", "months", 48, 48, 48, "Bank's offer"),
    ("Cash at the start", "€", 0, 0, 0, ""),
    ("Cash buffer wanted", "months of fixed costs", 3, 3, 3, ""),
]
assumptions = {
    "name": "Assumptions", "header": True, "freeze": {"rows": 1},
    "widths": {"A": 300, "B": 90, "C:F": 90, "G": 280},
    "styles": {"D2:F19": {"color": "#1d4ed8"}, "C2": {"color": "#1d4ed8", "b": True, "fill": "#fff3cd"}},
    "rows": [["Item", "Unit", "In use", "Low", "Base", "High", "Where it comes from"],
             ["Scenario in use (1 low, 2 base, 3 high)", "", 2, "", "", "", "Change this cell to switch the whole model"]]
            + [[label, unit, choose(r), lo, base, hi, src] for r, (label, unit, lo, base, hi, src) in enumerate(inputs, start=3)],
}

monthly_rows = [
    ["Item", "Unit", "2027-01-01"] + [f"=EDATE({MONTHS[i - 1]}1,1)" for i in range(1, N_MONTHS)],  # 1
    row("Month number", "", "1", "={p}2+1"),                                                  # 2
    row("Customers a day", "people", f"={A}3", f"={{p}}3*(1+{A}4)"),                          # 3
    row("Revenue", "€", f"={{c}}3*{A}5*{A}6"),                                                # 4
    row("Direct costs", "€", f"=-{{c}}4*{A}7"),                                               # 5
    row("Card fees", "€", f"=-{{c}}4*{A}8"),                                                  # 6
    row("Gross profit", "€", "={c}4+{c}5+{c}6"),                                             # 7
    row("Rent", "€", f"=-{A}9"),                                                              # 8
    row("Staff", "€", f"=-{A}10"),                                                            # 9
    row("Other fixed costs", "€", f"=-{A}11"),                                                # 10
    row("Operating profit before depreciation", "€", "=SUM({c}7:{c}10)"),                    # 11
    row("Depreciation", "€", f"=-{A}12/{A}13"),                                               # 12
    row("Loan interest", "€", f"=-{{c}}25*{A}16/12"),                                         # 13
    row("Profit before tax", "€", "={c}11+{c}12+{c}13"),                                     # 14
    ["Cash"] + [""] * (N_MONTHS + 1),                                                         # 15
    row("Cash at the start of the month", "€", f"={A}18", "={p}23"),                          # 16
    row("Profit before tax", "€", "={c}14"),                                                 # 17
    row("Depreciation added back (no cash)", "€", "=-{c}12"),                                # 18
    row("Fit-out and equipment", "€", f"=IF({{c}}$2=1,-{A}12,0)"),                            # 19
    row("Owner's money in", "€", f"=IF({{c}}$2=1,{A}14,0)"),                                  # 20
    row("Loan received", "€", f"=IF({{c}}$2=1,{A}15,0)"),                                     # 21
    row("Loan repaid (the part that is not interest)", "€", f"=-(PMT({A}16/12,{A}17,-{A}15)+{{c}}13)"),  # 22
    row("Cash at the end of the month", "€", "=SUM({c}16:{c}22)"),                           # 23
    ["Loan"] + [""] * (N_MONTHS + 1),                                                         # 24
    row("Loan owed at the start of the month", "€", f"={A}15", "={p}26"),                     # 25
    row("Loan owed at the end of the month", "€", "={c}25+{c}22"),                           # 26
    row("Made a profit (1 = yes)", "", "=IF({c}14>0,1,0)"),                                  # 27
]
monthly = {
    "name": "Monthly", "header": True, "freeze": {"rows": 1, "cols": 2},
    "widths": {"A": 300, "B": 60, f"{F}:{L}": 90},
    "styles": {f"{F}1:{L}1": {"fmt": "date"}, f"{F}3:{L}3": {"fmt": "number", "dp": 0},
               f"{F}4:{L}26": {"fmt": "currency", "cur": "€", "dp": 0},
               f"A7:{L}7": {"b": True}, f"A11:{L}11": {"b": True}, f"A14:{L}14": {"b": True},
               "A15": {"b": True}, f"A23:{L}23": {"b": True}, "A24": {"b": True}},
    "rows": monthly_rows,
}
checks = {
    "name": "Checks", "header": True, "widths": {"A": 420, "B": 120}, "styles": {"A6:B6": {"b": True}},
    "rows": [
        ["Check", "Difference"],
        ["Cash at the end = cash at the start + every movement", f"=ROUND(Monthly!{L}23-(Monthly!{F}16+SUM(Monthly!{F}17:{L}22)),2)"],
        ["Each month starts with the last month's end", f"=ROUND(SUMPRODUCT(ABS(Monthly!{MONTHS[1]}16:{L}16-Monthly!{F}23:{MONTHS[-2]}23)),2)"],
        ["Loan owed = loan − repayments", f"=ROUND(Monthly!{L}26-(Assumptions!C15+SUM(Monthly!{F}22:{L}22)),2)"],
        ["Gross profit = revenue − direct costs − card fees", f"=ROUND(SUM(Monthly!{F}7:{L}7)-SUM(Monthly!{F}4:{L}6),2)"],
        ["All checks", '=IF(MAX(ABS(B2),ABS(B3),ABS(B4),ABS(B5))<0.01,"All pass","A CHECK FAILED")'],
    ],
}
summary = {
    "name": "Summary", "header": True, "widths": {"A": 360, "B": 140, "C": 260},
    "styles": {"B2:B4": {"fmt": "currency", "cur": "€", "dp": 0}, "B8": {"fmt": "currency", "cur": "€", "dp": 0},
               "B5:B6": {"fmt": "date"}, "B7": {"fmt": "number", "dp": 0}},
    "rows": [
        [f"All {N_MONTHS} months", "Value", "How it is worked out"],
        ["Revenue", f"=SUM(Monthly!{F}4:{L}4)", "Sum of the months"],
        ["Profit before tax", f"=SUM(Monthly!{F}14:{L}14)", "Sum of the months"],
        ["Lowest cash", f"=MIN(Monthly!{F}23:{L}23)", "Lowest month-end cash"],
        ["Month of the lowest cash", f"=INDEX(Monthly!{F}1:{L}1,MATCH(B4,Monthly!{F}23:{L}23,0))", ""],
        ["First month with a profit", f'=IFERROR(INDEX(Monthly!{F}1:{L}1,MATCH(1,Monthly!{F}27:{L}27,0)),"None yet")', ""],
        ["Customers a day needed to break even",
         "=(Assumptions!C9+Assumptions!C10+Assumptions!C11)/(Assumptions!C5*Assumptions!C6*(1-Assumptions!C7-Assumptions!C8))",
         "Fixed costs ÷ what each customer leaves after direct costs and fees"],
        ["Extra money needed for the buffer", "=MAX(0,Assumptions!C19*(Assumptions!C9+Assumptions!C10+Assumptions!C11)-B4)",
         "Buffer of fixed costs, less the lowest cash"],
        ["Checks", "=Checks!B6", ""],
    ],
}
json.dump({"title": "Café model", "sheets": [summary, assumptions, monthly, checks]},
          open("model.json", "w"), ensure_ascii=False, indent=1)
```
