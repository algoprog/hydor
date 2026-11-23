"""Per-language comparison of eval.py runs on the same FLORES sentences.

  .venv/bin/python scripts/compare_langs.py qwen=runs/eval/flores_langgate:llm slm=runs/eval/flores_langgate:slm \
      mm_small=runs/eval/mmbert_small_flores mm_base=runs/eval/mmbert_base_flores

Each argument is label=<run dir>[:<variant>] (the first line of metrics.jsonl when no variant is given). The score of a language
is acc@1, or char_acc for the languages the evaluator scores per character (no-space scripts). Prints mean and median over
languages, how many languages each run wins (best of all), and the same per script and per tertile of the first run's score.
"""
import json
import os
import statistics
import sys
from collections import defaultdict


def load(spec):
    label, _, rest = spec.partition("=")
    path, _, variant = rest.partition(":")
    with open(os.path.join(path, "metrics.jsonl")) as f:
        rows = [json.loads(l) for l in f if l.strip()]
    row = next((r for r in rows if r["variant"] == variant), None) if variant else rows[0]
    if row is None:
        raise SystemExit(f"{spec}: no such variant")
    sc = {}
    for k, v in row.items():
        if k.startswith("lang.") and (k.endswith(".acc@1") or k.endswith(".char_acc")):
            lang = k[5:].rsplit(".", 1)[0]
            if k.endswith(".acc@1") or lang not in sc:
                sc[lang] = (0, v) if k.endswith(".acc@1") else (1, v)
    return label, {l: v for l, (_, v) in sc.items()}, row


def main(args):
    runs = [load(a) for a in args]
    labels = [r[0] for r in runs]
    langs = sorted(set.intersection(*[set(r[1]) for r in runs]))
    S = {l: {lab: sc[l] for lab, sc, _ in runs} for l in langs}
    print(f"{len(langs)} languages in common")
    print("| run | mean | median | wins (best of all) | beats first run |")
    print("|---|---|---|---|---|")
    for lab in labels:
        vals = [S[l][lab] for l in langs]
        wins = sum(1 for l in langs if S[l][lab] >= max(S[l].values()) - 1e-12)
        beats = sum(1 for l in langs if S[l][lab] > S[l][labels[0]]) if lab != labels[0] else "-"
        print(f"| {lab} | {statistics.mean(vals):.4f} | {statistics.median(vals):.4f} | {wins} | {beats} |")
    groups = defaultdict(list)
    for l in langs:
        groups["script " + l.split("_")[-1]].append(l)
    order = sorted(langs, key=lambda l: S[l][labels[0]])
    t = len(order) // 3
    for name, part in (("lowest third of " + labels[0], order[:t]), ("middle third", order[t:2 * t]),
                       ("highest third of " + labels[0], order[2 * t:])):
        groups[name] = part
    print("\n| group | n | " + " | ".join(labels) + " | best |")
    print("|---|---|" + "---|" * (len(labels) + 1))
    for g, part in sorted(groups.items(), key=lambda kv: (not kv[0].startswith(("lowest", "middle", "highest")), -len(kv[1]))):
        if len(part) < 4 and not g.startswith(("lowest", "middle", "highest")):
            continue
        means = [statistics.mean(S[l][lab] for l in part) for lab in labels]
        print(f"| {g} | {len(part)} | " + " | ".join(f"{m:.3f}" for m in means) + f" | {labels[max(range(len(labels)), key=lambda i: means[i])]} |")


if __name__ == "__main__":
    main(sys.argv[1:])
