# The troubleshooting log

Keep it in the conversation, in the plan, or in a file next to the work when the hunt is long. One
entry per attempt. It stops you trying the same thing twice and shows the user how you got there.

```markdown
**Problem.** <the exact symptom, and the steps that make it happen>

| # | Hypothesis | Test (one change) | Result | Conclusion |
| - | ---------- | ----------------- | ------ | ---------- |
| 1 | … because … | … | … | ruled out / confirmed / unclear |
```

## Examples

**Wi-Fi drops every evening.**
| # | Hypothesis | Test | Result | Conclusion |
| - | --- | --- | --- | --- |
| 1 | The router overheats | Moved it off the shelf, checked its temperature log | Still drops at 19:30 | Ruled out |
| 2 | A neighbour's network crowds the channel | Scanned channels at 19:30; moved from 6 to 11 | No drops for three evenings | Confirmed |

**A spreadsheet total is wrong.**
| # | Hypothesis | Test | Result | Conclusion |
| - | --- | --- | --- | --- |
| 1 | Some amounts are stored as text | `=ISTEXT()` on the column | 14 cells are text | Confirmed |
| 2 | (after converting) the range misses new rows | Compared the SUM range with the last row | The range ends at row 200, data at 214 | Confirmed: both causes |

**Bread does not rise.**
| # | Hypothesis | Test | Result | Conclusion |
| - | --- | --- | --- | --- |
| 1 | The yeast is dead | Proofed a spoon of it in warm water with sugar | Foamed in 10 minutes | Ruled out |
| 2 | The kitchen is too cold | Let the dough rise in the oven with the light on | Doubled in 90 minutes | Confirmed |
