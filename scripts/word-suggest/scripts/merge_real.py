"""Merge the events files of `scripts/real_chances.py --shard k/n` runs.

  .venv/bin/python scripts/merge_real.py runs/real/x/shard0.jsonl runs/real/x/shard1.jsonl ... --out runs/real/x.jsonl

The shards decode disjoint examples, so the merge is their concatenation (in the order given); it stops if an example appears in two
files. scripts/show_filter.py sorts the events by example, word and k itself.
"""
import argparse
import json


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("shards", nargs="+")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    seen, n_ex, n_ch = set(), 0, 0
    with open(a.out, "w") as out:
        for path in a.shards:
            with open(path) as f:
                for line in f:
                    r = json.loads(line)
                    if r["t"] == "e":
                        if r["id"] in seen:
                            raise SystemExit(f"{path}: example {r['id']} is in two shards")
                        seen.add(r["id"])
                        n_ex += 1
                    else:
                        n_ch += 1
                    out.write(line)
    print(json.dumps(dict(merged=a.out, examples=n_ex, chances=n_ch, shards=len(a.shards))))


if __name__ == "__main__":
    main()
