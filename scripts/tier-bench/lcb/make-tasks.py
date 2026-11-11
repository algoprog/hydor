#!/usr/bin/env python3
"""Makes the LiveCodeBench tasks for the tiers' benchmark: python3 make-tasks.py [--cache dir] [--ids a,b --out dir].

It reads test6.jsonl and LiveCodeBench's clone (both from fetch.sh) in the cache folder (default
~/.cache/hydor-bench/lcb, or LCB_CACHE) and writes one task folder for each chosen problem into <cache>/tasks/lcb-<id>/.
By default the problems are the 30 of selection.json, picked from the hard ones of release v6 by the rule in select();
the selection and the exclusions are written to selection.json again, which must not change. With --ids the problems are those ids
(any difficulty) and the folders go to --out: that is for trying the grader on easy ones.
"""
import argparse
import json
import os
import random
import re
import sys
import types

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = 2026
# How many problems of each platform: 30 hard ones, split about as the 80 hard ones of release v6 are.
QUOTA = {"atcoder": 22, "leetcode": 8}

TASK_STDIN = (
    "PROBLEM.md describes a problem we need solved. Work it out on your own: do not look the problem or its solution up "
    "anywhere. Please write solution.py: a Python 3 program that reads the input from standard input and writes the "
    "answer to standard output, in the formats PROBLEM.md gives. It must give the right answer for every input within "
    "the constraints, quickly enough for the largest ones. Python 3 standard library only.\n"
)
TASK_FUNCTION = (
    "PROBLEM.md describes a problem we need solved. Work it out on your own: do not look the problem or its solution up "
    "anywhere. Please complete solution.py, which has the class and method to fill in (keep their names and "
    "parameters): it must return the right answer for every input within the constraints, quickly enough for the "
    "largest ones. Python 3 standard library only.\n"
)


def load_problems(cache, clone):
    """The problems of test6.jsonl as LiveCodeBench's own CodeGenerationProblem objects."""
    # LiveCodeBench's module imports the `datasets` package only to download problems, which is not done here, so an
    # empty stand-in lets its class decode the tests (base64, zlib, pickle, json) exactly as its own code does.
    stub = types.ModuleType("datasets")
    stub.load_dataset = None
    sys.modules.setdefault("datasets", stub)
    sys.path.insert(0, clone)
    from lcb_runner.benchmarks.code_generation import CodeGenerationProblem

    problems = {}
    with open(os.path.join(cache, "test6.jsonl"), encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            problems[row["question_id"]] = CodeGenerationProblem(**row)
    return problems


RULE = (
    "The 30 are drawn from the hard problems of release v6 (22 AtCoder, 8 LeetCode) in the order of Random(2026) over "
    "each platform's sorted question ids. A problem is excluded when its official tests contradict its statement or "
    "when its statement accepts any one of several answers, because LiveCodeBench compares a solution's output with "
    "one exact answer; each excluded problem is replaced by the next of its platform in that order, under the same rule."
)

# Problems left out because LiveCodeBench compares a solution's output with one exact answer, so these cannot be
# graded fairly: a test that contradicts the statement, or a statement that accepts any one of several answers.
# Each one is replaced by the next problem of its platform in the order of select().
EXCLUDED = {
    "abc397_d": "an official test contradicts the statement: N = 27 expects `3 0`, but the statement asks for positive integers",
    "abc398_f": "the statement says that if multiple solutions exist, any of them is accepted",
    "abc396_e": "the statement says that if there are multiple good sequences with the same minimum sum, printing any of them is accepted",
    "arc190_a": "the statement says that if there are multiple ways that minimize the cost, printing any one is accepted",
}

# A statement that matches this has to be read by a person before its problem is chosen: it may accept more than one
# answer. Phrases about operations done "in any order" or "any number of times" are not looked at.
ANY_ANSWER = re.compile(
    r"multiple|several|more than one|arbitrar|any one|any of|any valid|any such|print any|is accepted|accepted as|"
    r"considered correct|also (be )?accepted|case-insensitive|\bwhichever",
    re.I,
)
NOT_AN_ANSWER = re.compile(r"in any order|any number of times", re.I)

# Problems that match ANY_ANSWER and were read: their answer is one exact one all the same.
REVIEWED = {
    "abc394_g": "the matching word is only 'multiple times' of a move; each query has one exact answer",
    "arc192_b": "the judge ignores letter case, but the statement gives the exact form to print (Fennec or Snuke), which is what LiveCodeBench compares",
    "3701": "the statement asks for the lexicographically smallest of the possible captions, so the answer is unique",
}


def accepts_any_answer(problem):
    return ANY_ANSWER.search(NOT_AN_ANSWER.sub("", problem.question_content)) is not None


def select(problems):
    """The hard problems: a random sample of each platform's (seed 2026) from its question ids in sorted order, the
    excluded ones left out.

    The order is what Random(2026) gives: first the sample of the platform's quota (AtCoder, then LeetCode), then the
    rest of the platform's hard problems in a random order. The chosen are the first of each platform's order that are
    not excluded, so a replacement is the next problem in that order."""
    rng = random.Random(SEED)
    hard = {
        platform: sorted(i for i, p in problems.items() if p.difficulty.value == "hard" and p.platform.value == platform)
        for platform in QUOTA
    }
    order = {platform: rng.sample(hard[platform], count) for platform, count in QUOTA.items()}
    for platform, count in QUOTA.items():
        order[platform] += rng.sample([i for i in hard[platform] if i not in order[platform]], len(hard[platform]) - count)
    chosen = []
    for platform, count in QUOTA.items():
        picked = [i for i in order[platform] if i not in EXCLUDED][:count]
        for i in picked:
            if accepts_any_answer(problems[i]) and i not in REVIEWED:
                sys.exit(f"{i}: its statement may accept more than one answer: read it, then add it to EXCLUDED or REVIEWED")
        chosen += picked
    return sorted(chosen)


def check_script(clone):
    """The checker every task gets: check.mjs of this folder, with the places of grade.py and of the clone written in."""
    with open(os.path.join(HERE, "check.mjs"), encoding="utf-8") as f:
        text = f.read()
    return text.replace("__GRADE_PY__", os.path.join(HERE, "grade.py")).replace("__LCB_CLONE__", clone)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def make_task(problem, folder, check):
    """One task folder: what the agent is asked and starts with, and what grades it."""
    functional = problem.metadata.get("func_name") is not None
    # The statement as LiveCodeBench gives it: no title, platform, contest or address, nothing to look it up by.
    statement = problem.question_content.strip() + "\n"
    if functional:
        starter = problem.starter_code.rstrip() + "\n"
        statement += "\n## Starter code\n\n```python\n" + starter + "```\n"
        # LiveCodeBench's grader adds these imports itself; the file has them so that it also runs on its own.
        write(os.path.join(folder, "seed", "solution.py"), "from typing import *\n\n" + starter)
    write(os.path.join(folder, "seed", "PROBLEM.md"), statement)
    write(os.path.join(folder, "task.md"), TASK_FUNCTION if functional else TASK_STDIN)
    # The public tests and then the private ones, in the shape LiveCodeBench's grader takes.
    write(os.path.join(folder, "tests.json"), problem.get_evaluation_sample()["input_output"])
    write(os.path.join(folder, "check.mjs"), check)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.environ.get("LCB_CACHE", os.path.expanduser("~/.cache/hydor-bench/lcb")))
    ap.add_argument("--ids", help="make these problems (comma separated question ids) instead of the selection")
    ap.add_argument("--out", help="the folder for the tasks, with --ids")
    args = ap.parse_args()
    cache = os.path.abspath(os.path.expanduser(args.cache))
    clone = os.path.join(cache, "LiveCodeBench")
    for needed in (os.path.join(cache, "test6.jsonl"), clone):
        if not os.path.exists(needed):
            sys.exit(f"{needed} is missing: run fetch.sh first")

    problems = load_problems(cache, clone)
    if args.ids:
        if not args.out:
            sys.exit("--ids needs --out")
        ids, out = args.ids.split(","), os.path.abspath(args.out)
    else:
        ids, out = select(problems), os.path.join(cache, "tasks")
        entries = [
            {
                "id": i,
                "title": problems[i].question_title,
                "platform": problems[i].platform.value,
                "date": problems[i].contest_date.date().isoformat(),
                "difficulty": problems[i].difficulty.value,
            }
            for i in ids
        ]
        record = {
            "rule": RULE,
            "excluded": [{"id": i, "reason": r} for i, r in EXCLUDED.items()],
            "reviewed": [{"id": i, "why": w} for i, w in REVIEWED.items() if i in ids],
            "problems": entries,
        }
        write(os.path.join(HERE, "selection.json"), json.dumps(record, indent=2, ensure_ascii=False) + "\n")
    check = check_script(clone)
    for i in ids:
        make_task(problems[i], os.path.join(out, f"lcb-{i}"), check)
    print(f"{len(ids)} tasks in {out}")


if __name__ == "__main__":
    main()
