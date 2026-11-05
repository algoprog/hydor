# REPRODUCTION.md: its outline

Write it for someone who wants to know whether to trust the paper's number, and how to get it
themselves. Plain words; numbers exactly as you got them.

```markdown
# Reproducing <the paper's title> (<arXiv id or DOI>)

## Verdict
Reproduced | Close | Not reproduced | Could not run: in one sentence, with the main reason.

## The numbers
| Metric | Setting (table, row, column) | The paper | Ours | Difference |
| --- | --- | ---: | ---: | ---: |
| MRR@10 | Table 2, BM25 + monoT5, MS MARCO dev | 38.4 | 38.1 | -0.3 |

Within noise means: <the tolerance used, and why>.

## The setting
- Code: <repository> at <commit or tag> (<date>)
- Environment: Python <version>, <key libraries with versions>; freeze.txt beside this file
- Data: <dataset, version, split, where from>
- Checkpoints: <repository and revision>
- Hardware: <GPU, count, precision>; seeds: <seeds>

## What was run
The commands, in order, from a fresh clone.

## Changes and fixes
- <file>: <what changed>, because <why>.

## What it took
| Step | Minutes |
| --- | ---: |
Total: <hours>, <GPU hours>, <disk used>.

## What is still different, and why
For each gap: what is thought to cause it, what was tried, and what would settle it.
```
