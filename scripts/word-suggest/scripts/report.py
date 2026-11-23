"""Gather runs/eval/*/metrics.jsonl into one CSV and one Markdown table.

  .venv/bin/python scripts/report.py [--root runs/eval] [--out runs/report] [--group all|surface.chat|lang.el ...]
                                      [--cols acc@0,acc@2,ksr_best,bpb,...] [--match substring]

One row per (run, variant). The CSV has every numeric field of every line; the Markdown table the columns of --cols for
the chosen --group (overall unless said otherwise; 'surface.chat.acc@0' style fields are picked by group prefix).
"""
import argparse
import csv
import glob
import json
import os
import sys

DEFAULT_COLS = ["n_examples", "n_words", "acc@0", "acc@0_after_first", "acc@1", "acc@2", "acc@3", "char_acc", "ksr@0.3",
                "prec@0.3", "cov@0.3", "ksr_best", "tau_best", "bpb", "nll", "llm_tokens_per_s", "llm_s_per_example"]


def load(root, match=None):
    rows = []
    for path in sorted(glob.glob(os.path.join(root, "*", "metrics.jsonl"))):
        run = os.path.basename(os.path.dirname(path))
        if match and match not in run:
            continue
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                d = json.loads(line)
                d["run"] = run
                rows.append(d)
    return rows


def pick(row, group, col):
    key = col if group == "all" else f"{group}.{col}"
    v = row.get(key)
    if v is None and col.startswith(("llm_", "wall_", "metric_")):
        v = row.get(col)
    return v


def fmt(v):
    if v is None:
        return ""
    if isinstance(v, float):
        return f"{v:.4g}" if abs(v) < 1000 else f"{v:.0f}"
    return str(v)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default="runs/eval")
    ap.add_argument("--out", default="runs/report")
    ap.add_argument("--group", default="all")
    ap.add_argument("--cols", default=",".join(DEFAULT_COLS))
    ap.add_argument("--match", default=None)
    a = ap.parse_args(argv)
    rows = [r for r in load(a.root, a.match) if "variant" in r]
    if not rows:
        raise SystemExit(f"no metrics.jsonl with variants under {a.root}")
    keys = ["run", "variant"] + sorted({k for r in rows for k in r if k not in ("run", "variant")})
    os.makedirs(os.path.dirname(os.path.abspath(a.out + ".csv")), exist_ok=True)
    with open(a.out + ".csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow(r)
    cols = a.cols.split(",")
    head = ["run", "variant", "ctx", "fmt"] + cols
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    for r in rows:
        cells = [r["run"], r["variant"], str(r.get("ctx", "")), str(r.get("fmt", ""))] + [fmt(pick(r, a.group, c)) for c in cols]
        lines.append("| " + " | ".join(cells) + " |")
    with open(a.out + ".md", "w") as f:
        f.write(f"Group: {a.group}\n\n" + "\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"# wrote {a.out}.csv and {a.out}.md ({len(rows)} rows)", file=sys.stderr)


if __name__ == "__main__":
    main()
