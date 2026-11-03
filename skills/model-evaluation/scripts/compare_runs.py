#!/usr/bin/env python3
"""Score one evaluation run, or compare two, with confidence intervals and a paired test.

Standard library only. Each run is a JSONL or CSV file with one row per test item: an id and
a score (1/0, true/false, or any number such as a judge's 1-5 rating). Two runs are compared
on the items they share, as a paired comparison (same items, different systems).

  python3 compare_runs.py base.jsonl
  python3 compare_runs.py base.jsonl tuned.jsonl --names base,tuned
  python3 compare_runs.py a.csv b.csv --id question_id --score correct

What it prints: each run's mean with a 95% interval (Wilson for right/wrong scores), the
difference B - A with a 95% interval from a paired bootstrap, and a p-value (McNemar's exact
test for right/wrong scores, a paired sign-flip test otherwise).
"""
import argparse
import csv
import json
import math
import random
import statistics
import sys

Z = 1.959964  # 95%


def to_number(v):
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().lower()
    if s in ("true", "yes", "correct", "pass"):
        return 1.0
    if s in ("false", "no", "incorrect", "fail"):
        return 0.0
    return float(s)


def read_run(path, id_field, score_field):
    rows = {}
    with open(path, newline="", encoding="utf-8") as f:
        if path.lower().endswith((".csv", ".tsv")):
            reader = csv.DictReader(f, delimiter="\t" if path.lower().endswith(".tsv") else ",")
            items = list(reader)
        else:
            items = [json.loads(line) for line in f if line.strip()]
    for i, item in enumerate(items, 1):
        if id_field not in item or score_field not in item:
            sys.exit(f"{path}, row {i}: needs fields '{id_field}' and '{score_field}' (use --id and --score).")
        key = str(item[id_field])
        if key in rows:
            sys.exit(f"{path}: id {key} appears twice. Each test item must appear once.")
        try:
            rows[key] = to_number(item[score_field])
        except ValueError:
            sys.exit(f"{path}, row {i}: score {item[score_field]!r} is not a number or true/false.")
    if not rows:
        sys.exit(f"{path}: no rows.")
    return rows


def is_binary(xs):
    return all(x in (0.0, 1.0) for x in xs)


def wilson(k, n):
    p = k / n
    d = 1 + Z * Z / n
    c = (p + Z * Z / (2 * n)) / d
    h = Z * math.sqrt(p * (1 - p) / n + Z * Z / (4 * n * n)) / d
    return c - h, c + h


def mean_ci(xs):
    n = len(xs)
    m = statistics.fmean(xs)
    if is_binary(xs):
        return m, wilson(sum(xs), n), "Wilson"
    if n < 2:
        return m, (m, m), "one item"
    se = statistics.stdev(xs) / math.sqrt(n)
    return m, (m - Z * se, m + Z * se), "normal"


def mcnemar_exact(a, b):
    """Two-sided exact McNemar test on paired right/wrong scores."""
    only_a = sum(1 for x, y in zip(a, b) if x == 1 and y == 0)
    only_b = sum(1 for x, y in zip(a, b) if x == 0 and y == 1)
    n = only_a + only_b
    if n == 0:
        return 1.0, only_a, only_b
    k = min(only_a, only_b)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail), only_a, only_b


def sign_flip_p(diffs, rounds, rng):
    obs = abs(statistics.fmean(diffs))
    if obs == 0:
        return 1.0
    hits = 0
    for _ in range(rounds):
        s = sum(d if rng.random() < 0.5 else -d for d in diffs) / len(diffs)
        hits += abs(s) >= obs - 1e-12
    return (hits + 1) / (rounds + 1)


def bootstrap_ci(diffs, rounds, rng):
    n = len(diffs)
    means = sorted(sum(diffs[rng.randrange(n)] for _ in range(n)) / n for _ in range(rounds))
    return means[int(0.025 * rounds)], means[min(rounds - 1, int(0.975 * rounds))]


def pct(x, binary):
    return f"{100 * x:.1f}%" if binary else f"{x:.3f}"


def main():
    p = argparse.ArgumentParser(description="Score one evaluation run or compare two, with 95% intervals.")
    p.add_argument("a", help="run A: JSONL or CSV, one row per test item")
    p.add_argument("b", nargs="?", help="run B, to compare with A on the same items")
    p.add_argument("--id", default="id", help="the field naming each item (default id)")
    p.add_argument("--score", default="score", help="the field with the score (default score)")
    p.add_argument("--names", default="A,B", help="names for the two runs, like base,tuned")
    p.add_argument("--resamples", type=int, default=2000, help="bootstrap and sign-flip rounds (default 2000)")
    p.add_argument("--seed", type=int, default=0)
    args = p.parse_args()
    rng = random.Random(args.seed)
    name_a, _, name_b = args.names.partition(",")
    name_b = name_b or "B"

    a = read_run(args.a, args.id, args.score)
    if not args.b:
        xs = list(a.values())
        m, (lo, hi), how = mean_ci(xs)
        binary = is_binary(xs)
        print(f"{name_a}: {pct(m, binary)} over {len(xs)} items, 95% interval {pct(lo, binary)} to {pct(hi, binary)} ({how})")
        half = f"{100 * (hi - lo) / 2:.1f} points" if binary else f"{(hi - lo) / 2:.3f}"
        print(f"That is about ±{half}: differences smaller than that need more items to tell apart.")
        return

    b = read_run(args.b, args.id, args.score)
    shared = sorted(set(a) & set(b))
    if len(shared) < len(a) or len(shared) < len(b):
        print(f"Note: {len(a) - len(shared)} items only in {name_a}, {len(b) - len(shared)} only in {name_b}; "
              f"comparing the {len(shared)} items both have.")
    if len(shared) < 2:
        sys.exit("Too few shared items to compare.")
    xa = [a[k] for k in shared]
    xb = [b[k] for k in shared]
    binary = is_binary(xa) and is_binary(xb)
    for name, xs in ((name_a, xa), (name_b, xb)):
        m, (lo, hi), how = mean_ci(xs)
        print(f"{name}: {pct(m, binary)} (95% interval {pct(lo, binary)} to {pct(hi, binary)}, {how})")

    diffs = [y - x for x, y in zip(xa, xb)]
    d = statistics.fmean(diffs)
    lo, hi = bootstrap_ci(diffs, args.resamples, rng)
    if binary:
        fmt = lambda x: f"{100 * x:+.1f}"  # noqa: E731
        unit = " points"
    else:
        fmt = lambda x: f"{x:+.3f}"  # noqa: E731
        unit = ""
    print(f"Difference {name_b} - {name_a}: {fmt(d)}{unit} (95% interval {fmt(lo)} to {fmt(hi)}{unit}, paired bootstrap)")
    if binary:
        pval, only_a, only_b = mcnemar_exact(xa, xb)
        print(f"Items only {name_a} got right: {only_a}; only {name_b}: {only_b}. McNemar exact p = {pval:.3g}")
    else:
        pval = sign_flip_p(diffs, args.resamples, rng)
        print(f"Paired sign-flip test: p = {pval:.3g}")
    if lo > 0 or hi < 0:
        better = name_b if d > 0 else name_a
        print(f"Verdict: {better} is better on this test set; the interval does not include 0.")
    else:
        print("Verdict: no clear difference; the interval includes 0. More items, or a bigger change, are needed to tell.")


if __name__ == "__main__":
    main()
