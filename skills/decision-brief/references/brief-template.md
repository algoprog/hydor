# The decision brief

One page. The recommendation comes first; everything after it supports it. Leave out sections that
do not apply.

```markdown
# Decision: <the question> (by <date>)

**Recommendation.** <Option>: <why, in two or three sentences tied to the criteria that weigh most>.
How sure: <high / medium / low>, because <…>.

**Goal.** <What the choice is for.> **Must-haves:** <…>. **Reversible?** <easily / at a cost / no>.

**Options**
1. <Keep things as they are>: <one line>
2. <Option>: <one line>
3. <Option>: <one line>
Ruled out: <option>, because it fails <must-have>.

**How they compare** (1 = poor, 5 = excellent)

| Criterion (weight) | Option 1 | Option 2 | Option 3 |
| --- | --- | --- | --- |
| <criterion> (<weight>) | <score> | <score> | <score> |
| **Weighted total** | **…** | **…** | **…** |

**Trade-offs.** Choosing <X> gives up <…>. Choosing <Y> gives up <…>.

**Risks.** <risk> (<likelihood>, <impact>): <what reduces it>.

**What would change this.** <condition> → <other option>.

**Next steps.** <step>, <who>, <when>. Review on <date>.

**Assumptions and sources.** <estimates marked as such; links>.
```

## A filled-in example

```markdown
# Decision: which job offer should Sam accept? (by Friday 14 Nov)

**Recommendation.** Northwind. It pays the most over two years and has the easier commute, the two
things Sam weighted highest. Its main risk, a young product that may not last, is bearable with six
months' savings. How sure: medium. If training matters as much to Sam as pay, Contoso comes out ahead.

**Goal.** Better pay and room to grow, without a long commute. **Must-haves:** no more than three
office days a week. **Reversible?** At a cost: leaving within a year looks poor on a CV.

**Options**
1. Stay at the current job: known team, no raise until April.
2. Northwind: €66,000, 25 minutes away, a two-year-old product.
3. Contoso: €62,000 plus €3,000 a year for training, 75 minutes away, stable.
Ruled out: Fabrikam, because it asks for five office days.

**How they compare** (1 = poor, 5 = excellent)

| Criterion (weight) | Stay | Northwind | Contoso |
| --- | --- | --- | --- |
| Pay over two years (30) | 2 | 5 | 4 |
| Commute (25) | 3 | 4 | 2 |
| Growth and training (20) | 2 | 3 | 5 |
| Stability (15) | 5 | 2 | 4 |
| Team and manager (10) | 4 | 4 | 3 |
| **Weighted total** | **2.9** | **3.8** | **3.6** |

**Trade-offs.** Northwind gives up Contoso's training budget and some security. Contoso gives up
about five hours a week to the commute (50 minutes more each way, three office days).

**Risks.** Northwind's product is cut (medium, high): keep six months' savings and stay in touch
with Contoso's recruiter. The commute to Contoso wears Sam down (high, medium): ask about two days
from home.

**What would change this.** If training and growth weigh 30 rather than 20 (taken from commute),
Contoso leads, 3.9 to 3.7. If Northwind will not put the salary in writing before Friday, Contoso.

**Next steps.** Sam asks Northwind for the written offer (Mon); compares pensions (Tue); decides by
Fri. Review on 1 May: is the role what was promised?

**Assumptions and sources.** Commute times from a route planner at 8:00 on a weekday. Northwind's
funding from its press release of 2 Sep.
```

The weighted total is each score times its weight, added up and divided by 100. Stay:
(2×30 + 3×25 + 2×20 + 5×15 + 4×10) ÷ 100 = 2.9.

## In a spreadsheet

Weights in column B, one option per column from C, criteria in rows 2 to 6:

| | A | B | C | D | E |
| --- | --- | --- | --- | --- | --- |
| 1 | Criterion | Weight | Stay | Northwind | Contoso |
| 2 | Pay over two years | 30 | 2 | 5 | 4 |
| … | | | | | |
| 7 | Weighted total | `=SUM(B2:B6)` | `=SUMPRODUCT($B$2:$B$6,C2:C6)/100` | (same, across) | |

A check cell beside the weights, `=IF(SUM(B2:B6)=100,"OK","Weights must add to 100")`, saves
confusion when the person changes them.
