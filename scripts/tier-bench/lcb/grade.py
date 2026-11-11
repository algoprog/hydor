#!/usr/bin/env python3
"""Grades one solution with LiveCodeBench's own code: python3 grade.py <task folder> <solution.py> [--lcb <clone>].

The task folder holds tests.json, the problem's tests in the shape LiveCodeBench's grader takes: {"inputs": [...],
"outputs": [...], "fn_name": null or the method's name}. The solution is run on them by LiveCodeBench's
evaluate_generations_by_problem and run_test, with its default timeout of 6 seconds for a test, and counts as right
when every test passes (its pass@1 for one sample). The last line printed is {"passed": 1, "total": 1} or
{"passed": 0, "total": 1, "failed": ["why"]}.
"""
import json
import os
import sys

# The clone of LiveCodeBench: --lcb, else HYDOR_LCB_CLONE, else where fetch.sh puts it.
CLONE = os.environ.get("HYDOR_LCB_CLONE", os.path.expanduser("~/.cache/hydor-bench/lcb/LiveCodeBench"))
# LiveCodeBench's own default (--timeout in lcb_runner/runner/parser.py), in seconds for each test.
TIMEOUT = 6


def finish(passed, why=None):
    result = {"passed": 1 if passed else 0, "total": 1}
    if not passed:
        result["failed"] = [why or "failed"]
    print(json.dumps(result))
    sys.exit(0)


def main():
    global CLONE
    args = sys.argv[1:]
    if "--lcb" in args:
        i = args.index("--lcb")
        CLONE = args[i + 1]
        del args[i : i + 2]
    if len(args) != 2:
        print("usage: grade.py <task folder> <solution.py> [--lcb <LiveCodeBench clone>]", file=sys.stderr)
        sys.exit(2)
    task, solution = args

    if not os.path.isfile(solution):
        finish(False, "no solution.py")
    with open(solution, encoding="utf-8", errors="replace") as f:
        code = f.read()
    with open(os.path.join(task, "tests.json"), encoding="utf-8") as f:
        tests = json.load(f)

    # LiveCodeBench has no __init__.py files at the top, so its folder on the path is all that its imports need.
    sys.path.insert(0, CLONE)
    from lcb_runner.evaluation.compute_code_generation_metrics import evaluate_generations_by_problem
    from lcb_runner.evaluation.pass_k_utils import extract_instance_results

    sample = {"input_output": json.dumps(tests)}
    # The arguments are (generations of the problem, its sample, debug, timeout), as evaluate_generations passes them.
    results, metadata = evaluate_generations_by_problem(([code], sample, False, TIMEOUT))
    result, meta = results[0], metadata[0]
    # LiveCodeBench's own reading of the results: every number above zero.
    right = extract_instance_results({0: [result]})[0]
    # A run that gave fewer results than there are tests stopped early, so it is not a pass.
    if right and len(result) == len(tests["inputs"]):
        finish(True)
    why = str(meta.get("error_message") or "failed")
    if meta.get("error"):
        why += ": " + str(meta["error"])
    # Which test it stopped at (they run in order, the public examples first).
    finish(False, f"{why} (test {len(result)} of {len(tests['inputs'])})"[:300])


if __name__ == "__main__":
    main()
