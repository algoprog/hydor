# The plan as a spreadsheet

One workbook, made with `save_sheet` (the person edits it in the Library and can export it to
Excel). Dates are computed from dependencies, so when one task slips everything after it moves.

## Plan sheet

| Column | Holds | Formula (row 2) |
| --- | --- | --- |
| A ID | 1, 2, 3… | |
| B Task | verb first: "Book the removal company" | |
| C Milestone | the milestone it serves, spelled exactly as on the Milestones sheet | |
| D Owner | one name | |
| E Depends on | IDs, for people to read: "2, 5" | |
| F Start | a typed date for tasks that depend on nothing; a formula for the rest | `=WORKDAY(H2,1)` after the task in row 2 |
| G Days | working days it takes | |
| H End | | `=WORKDAY(F2,G2-1)` |
| I Status | Not started, In progress, Waiting, Done | |
| J Late | | `=IF(AND(H2<TODAY(),I2<>"Done"),"Late","")` |
| K Notes | | |
| L onwards | one column per week, its Monday in row 1 | `=IF(AND(L$1<=$H2,L$1+6>=$F2),"■","")` |

- A task that waits for several others: `=WORKDAY(MAX(H3,H6),1)`.
- Calendar days instead of working days (a move over a weekend, an event): End `=F2+G2-1`, next
  start `=H2+1`.
- Lead times (a delivery in six weeks) are tasks too, with the supplier as owner and Waiting as status.
- Week headers: the first Monday typed in L1, then `=L1+7` in M1, copied across.

## Milestones sheet

| Column | Formula (row 2) |
| --- | --- |
| A Milestone | |
| B Target | typed date |
| C Forecast | `=MAXIFS(Plan!H:H,Plan!C:C,A2)`: the latest end of its tasks |
| D Status | `=IF(C2<=B2,"On track","Late by "&(NETWORKDAYS(B2,C2)-1)&" working days")` |

## Risks sheet

Risk, Likelihood (1 to 3), Impact (1 to 3), Score `=B2*C2`, Owner, What reduces it now, Trigger and
response. Sort by score when reviewing.

## A save_sheet example

A house move, shortened. Paste the shape, then fill in the real tasks.

```json
{
  "title": "House move plan",
  "sheets": [
    {
      "name": "Plan",
      "header": true,
      "freeze": {"rows": 1, "cols": 2},
      "widths": {"A": 40, "B": 240, "C": 140, "D": 70, "E": 80, "F": 100, "G": 50, "H": 100, "I": 100, "J": 50, "K": 200, "L:Q": 90},
      "formats": {"F": "date", "H": "date"},
      "styles": {"L1:Q1": {"fmt": "date"}, "L2:Q8": {"align": "center", "color": "#1d4ed8"}},
      "rows": [
        ["ID", "Task", "Milestone", "Owner", "Depends on", "Start", "Days", "End", "Status", "Late", "Notes", "2027-01-04", "=L1+7", "=M1+7", "=N1+7", "=O1+7", "=P1+7"],
        [1, "Get three removal quotes", "Removals booked", "Sam", "", "2027-01-04", 5, "=WORKDAY(F2,G2-1)", "Done", "=IF(AND(H2<TODAY(),I2<>\"Done\"),\"Late\",\"\")", "", "=IF(AND(L$1<=$H2,L$1+6>=$F2),\"■\",\"\")", "=IF(AND(M$1<=$H2,M$1+6>=$F2),\"■\",\"\")", "=IF(AND(N$1<=$H2,N$1+6>=$F2),\"■\",\"\")", "=IF(AND(O$1<=$H2,O$1+6>=$F2),\"■\",\"\")", "=IF(AND(P$1<=$H2,P$1+6>=$F2),\"■\",\"\")", "=IF(AND(Q$1<=$H2,Q$1+6>=$F2),\"■\",\"\")"],
        [2, "Book the removal company", "Removals booked", "Sam", "1", "=WORKDAY(H2,1)", 2, "=WORKDAY(F3,G3-1)", "In progress", "=IF(AND(H3<TODAY(),I3<>\"Done\"),\"Late\",\"\")", "", "=IF(AND(L$1<=$H3,L$1+6>=$F3),\"■\",\"\")", "=IF(AND(M$1<=$H3,M$1+6>=$F3),\"■\",\"\")", "=IF(AND(N$1<=$H3,N$1+6>=$F3),\"■\",\"\")", "=IF(AND(O$1<=$H3,O$1+6>=$F3),\"■\",\"\")", "=IF(AND(P$1<=$H3,P$1+6>=$F3),\"■\",\"\")", "=IF(AND(Q$1<=$H3,Q$1+6>=$F3),\"■\",\"\")"],
        [3, "Give notice to the landlord", "Notice given", "Alex", "", "2027-01-04", 1, "=WORKDAY(F4,G4-1)", "Done", "=IF(AND(H4<TODAY(),I4<>\"Done\"),\"Late\",\"\")", "Two months' notice", "=IF(AND(L$1<=$H4,L$1+6>=$F4),\"■\",\"\")", "=IF(AND(M$1<=$H4,M$1+6>=$F4),\"■\",\"\")", "=IF(AND(N$1<=$H4,N$1+6>=$F4),\"■\",\"\")", "=IF(AND(O$1<=$H4,O$1+6>=$F4),\"■\",\"\")", "=IF(AND(P$1<=$H4,P$1+6>=$F4),\"■\",\"\")", "=IF(AND(Q$1<=$H4,Q$1+6>=$F4),\"■\",\"\")"],
        [4, "Order broadband at the new address", "Utilities set up", "Alex", "", "2027-01-11", 1, "=WORKDAY(F5,G5-1)", "Not started", "=IF(AND(H5<TODAY(),I5<>\"Done\"),\"Late\",\"\")", "Installation takes 2 to 3 weeks", "=IF(AND(L$1<=$H5,L$1+6>=$F5),\"■\",\"\")", "=IF(AND(M$1<=$H5,M$1+6>=$F5),\"■\",\"\")", "=IF(AND(N$1<=$H5,N$1+6>=$F5),\"■\",\"\")", "=IF(AND(O$1<=$H5,O$1+6>=$F5),\"■\",\"\")", "=IF(AND(P$1<=$H5,P$1+6>=$F5),\"■\",\"\")", "=IF(AND(Q$1<=$H5,Q$1+6>=$F5),\"■\",\"\")"],
        [5, "Sell or give away furniture", "Packed", "Alex", "", "2027-01-11", 10, "=WORKDAY(F6,G6-1)", "Not started", "=IF(AND(H6<TODAY(),I6<>\"Done\"),\"Late\",\"\")", "", "=IF(AND(L$1<=$H6,L$1+6>=$F6),\"■\",\"\")", "=IF(AND(M$1<=$H6,M$1+6>=$F6),\"■\",\"\")", "=IF(AND(N$1<=$H6,N$1+6>=$F6),\"■\",\"\")", "=IF(AND(O$1<=$H6,O$1+6>=$F6),\"■\",\"\")", "=IF(AND(P$1<=$H6,P$1+6>=$F6),\"■\",\"\")", "=IF(AND(Q$1<=$H6,Q$1+6>=$F6),\"■\",\"\")"],
        [6, "Pack", "Packed", "Sam", "2, 5", "=WORKDAY(MAX(H3,H6),1)", 8, "=WORKDAY(F7,G7-1)", "Not started", "=IF(AND(H7<TODAY(),I7<>\"Done\"),\"Late\",\"\")", "", "=IF(AND(L$1<=$H7,L$1+6>=$F7),\"■\",\"\")", "=IF(AND(M$1<=$H7,M$1+6>=$F7),\"■\",\"\")", "=IF(AND(N$1<=$H7,N$1+6>=$F7),\"■\",\"\")", "=IF(AND(O$1<=$H7,O$1+6>=$F7),\"■\",\"\")", "=IF(AND(P$1<=$H7,P$1+6>=$F7),\"■\",\"\")", "=IF(AND(Q$1<=$H7,Q$1+6>=$F7),\"■\",\"\")"],
        [7, "Moving day", "Moved", "Sam", "6", "=WORKDAY(H7,1)", 1, "=WORKDAY(F8,G8-1)", "Not started", "=IF(AND(H8<TODAY(),I8<>\"Done\"),\"Late\",\"\")", "", "=IF(AND(L$1<=$H8,L$1+6>=$F8),\"■\",\"\")", "=IF(AND(M$1<=$H8,M$1+6>=$F8),\"■\",\"\")", "=IF(AND(N$1<=$H8,N$1+6>=$F8),\"■\",\"\")", "=IF(AND(O$1<=$H8,O$1+6>=$F8),\"■\",\"\")", "=IF(AND(P$1<=$H8,P$1+6>=$F8),\"■\",\"\")", "=IF(AND(Q$1<=$H8,Q$1+6>=$F8),\"■\",\"\")"]
      ]
    },
    {
      "name": "Milestones",
      "header": true,
      "formats": {"B:C": "date"},
      "widths": {"A": 160, "B": 100, "C": 100, "D": 200},
      "rows": [
        ["Milestone", "Target", "Forecast", "Status"],
        ["Removals booked", "2027-01-15", "=MAXIFS(Plan!H:H,Plan!C:C,A2)", "=IF(C2<=B2,\"On track\",\"Late by \"&(NETWORKDAYS(B2,C2)-1)&\" working days\")"],
        ["Packed", "2027-02-05", "=MAXIFS(Plan!H:H,Plan!C:C,A3)", "=IF(C3<=B3,\"On track\",\"Late by \"&(NETWORKDAYS(B3,C3)-1)&\" working days\")"],
        ["Moved", "2027-02-12", "=MAXIFS(Plan!H:H,Plan!C:C,A4)", "=IF(C4<=B4,\"On track\",\"Late by \"&(NETWORKDAYS(B4,C4)-1)&\" working days\")"]
      ]
    }
  ]
}
```

Every week column (L to Q) has its own formula, with its letter in place (M$1, N$1…); build long
rows in a short script rather than by hand. Formats over columns skip a header row, so the week
dates in row 1 get theirs from `styles` (`"L1:Q1": { "fmt": "date" }`). After saving, read the sheet
back with `get_page`: it shows what each formula gives, so a wrong date or an error shows up before
the person sees it.

## When to make an .xlsx instead

`save_sheet` has no charts or conditional formatting. For coloured bars that fill the cells, a real
Gantt chart, or drop-down lists for Status, make an .xlsx with the spreadsheets skill: conditional
formatting with the same week test `AND(L$1<=$H2,L$1+6>=$F2)`, and data validation on column I.
