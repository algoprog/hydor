# LiveCodeBench problems in the tiers' benchmark

Thirty hard problems from [LiveCodeBench](https://github.com/LiveCodeBench/LiveCodeBench) (release v6: 175 problems
from contests held between 4 January and 6 April 2025), made into tasks for `run.mjs` next to the benchmark's own.
The point is trust: the problems, their tests and the code that grades a solution are LiveCodeBench's, not ours, so
anyone can check them. Grading is all or nothing for each problem, as in LiveCodeBench's pass@1: a task scores 1 when
the solution passes every test (the public examples and the private ones), else 0.

- **Problems:** the 80 problems of v6 marked "hard" (60 from AtCoder, 20 from LeetCode), of which 30 are drawn at
  random: 22 from AtCoder and 8 from LeetCode, with `random.Random(2026)` over each platform's sorted question ids.
  `selection.json` lists them (id, title, platform, date), so everyone gets the same thirty, with the rule below and
  the exclusions.
- **Exclusions:** LiveCodeBench compares a solution's output with one exact answer, so a problem is left out when its
  official tests contradict its statement, or when its statement accepts any one of several answers ("print any",
  "if there are multiple ..., any of them is accepted"). Each one left out is replaced by the next problem of its
  platform in the Random(2026) order (the draw of the quota first, then the platform's other hard problems in a random
  order), under the same rule. `make-tasks.py` applies this itself: its `EXCLUDED` list has the reason for each, and it
  stops on a chosen statement that looks like one accepting several answers until someone has read it and put it in
  `EXCLUDED` or in `REVIEWED` (read, and its answer is one exact one). The four excluded so far: `abc397_d` (a test
  expects `3 0` for N = 27, the statement asks for positive integers), `abc398_f`, `abc396_e` and `arc190_a` (each
  accepts any of several answers); they were replaced by `abc399_e`, `arc192_b` and `arc195_e`, and the LeetCode eight
  did not change.
- **Tests and grader:** `grade.py` imports LiveCodeBench's own `evaluate_generations_by_problem` and `run_test`
  (`lcb_runner/evaluation/`) from a pinned clone and calls them with its default timeout (6 seconds for each test).
  Nothing of the comparison is rewritten here. The tests are decoded by LiveCodeBench's own `CodeGenerationProblem`.
- **Caveat:** the contests are from January to April 2025, before the models under test were trained, so a model may
  have seen these problems and their solutions. The task tells the agent to solve them on its own, and the
  benchmark's agents have no web access, but what a model remembers is out of our hands.
- **Pinned:** LiveCodeBench at commit `28fef95ea8c9f7a547c8329f2cd3d32b92c1fa24` (15 July 2025) and `test6.jsonl` of
  the dataset `livecodebench/code_generation_lite` with SHA-256
  `bb4c364f71921c4495a6ad15abe1a927350b720009f4933e2e71f8af0f6fd1f5`; `fetch.sh` checks both.

## Make the tasks and run them

```bash
scripts/tier-bench/lcb/fetch.sh                  # test6.jsonl (134 MB) and the clone, into ~/.cache/hydor-bench/lcb
python3 scripts/tier-bench/lcb/make-tasks.py     # 30 task folders in ~/.cache/hydor-bench/lcb/tasks/lcb-<id>/
node scripts/tier-bench/run.mjs --tasks-dir ~/.cache/hydor-bench/lcb/tasks --out /tmp/hydor-bench/lcb.json
node scripts/tier-bench/report.mjs /tmp/hydor-bench/lcb.json
```

`LCB_CACHE` (or `--cache`) names another cache folder. The Python needs NumPy and nothing else (not LiveCodeBench's
whole list of requirements: its evaluation code uses NumPy and the standard library; `make-tasks.py` puts an empty
stand-in where the `datasets` package would be, since it only downloads problems). `grade.py` runs with `python3`; set
`LCB_PYTHON` to use another one. Grading takes a few seconds for a solution that passes, at most 6 seconds for each
test that is too slow, and `check.mjs` gives up after 170 seconds (the runner's limit is 180).

A task folder holds `task.md` (the request), `seed/PROBLEM.md` (the statement as LiveCodeBench gives it, with no title,
platform or contest, and for LeetCode problems the starter code in a code block), `seed/solution.py` (the starter
code, LeetCode problems only: AtCoder ones start with no file), `tests.json` (all the tests in the shape
LiveCodeBench's grader takes) and `check.mjs` (which runs `grade.py` and prints `{"passed": 1, "total": 1}` or
`{"passed": 0, "total": 1, "failed": ["why"]}`). Statements may still name AtCoder or a contest in their own text.

## How this differs from LiveCodeBench's own runs

LiveCodeBench asks a model for one reply with code and grades that. Here an agent works in a folder with tools: it
reads PROBLEM.md, may write test programs and run its solution on the examples (or on inputs of its own) and then
leaves solution.py. The request is also worded differently. LiveCodeBench's published numbers are single replies, so
ours are not comparable to its leaderboard, only to each other.

## What the checks do not cover

The exclusions rest on reading the statements and on one test known to contradict its statement. Another problem
may still have a wrong or odd test; LiveCodeBench's own errata are in its repository (`ERRATA.md`).
