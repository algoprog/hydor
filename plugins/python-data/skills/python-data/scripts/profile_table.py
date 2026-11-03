"""Profile a table before analysing it: its size, columns, types, gaps, duplicates and a few rows.

    python profile_table.py data.csv [--sheet NAME] [--sep ;]

Reads CSV/TSV, Excel (.xlsx, .xls) and Parquet. Prints plain text an agent or a person can read.
"""

import argparse
import sys

import pandas as pd


def load(path, sheet=None, sep=None):
    low = path.lower()
    if low.endswith((".xlsx", ".xlsm", ".xls")):
        return pd.read_excel(path, sheet_name=sheet or 0)
    if low.endswith(".parquet"):
        return pd.read_parquet(path)
    if low.endswith((".tsv", ".tab")):
        return pd.read_csv(path, sep="\t")
    # sep=None lets pandas sniff the separator (; and tabs as well as commas).
    return pd.read_csv(path, sep=sep, engine="python" if sep is None else "c")


def main():
    a = argparse.ArgumentParser()
    a.add_argument("path")
    a.add_argument("--sheet")
    a.add_argument("--sep")
    a.add_argument("--rows", type=int, default=5)
    o = a.parse_args()
    df = load(o.path, o.sheet, o.sep)
    print(f"{o.path}: {len(df):,} rows x {df.shape[1]} columns")
    dups = int(df.duplicated().sum())
    print(f"Exact duplicate rows: {dups:,}")
    print("\nColumns:")
    for c in df.columns:
        s = df[c]
        missing = int(s.isna().sum())
        line = f"  {str(c)[:40]:40} {str(s.dtype):14} missing {missing:,} ({missing / max(len(df), 1):.0%})  unique {s.nunique(dropna=True):,}"
        if pd.api.types.is_numeric_dtype(s) and s.notna().any():
            line += f"  min {s.min():g}  median {s.median():g}  max {s.max():g}"
        elif s.notna().any():
            top = s.astype(str).value_counts().head(3)
            line += "  top: " + ", ".join(f"{k[:20]!r} ({v})" for k, v in top.items())
        print(line)
    print(f"\nFirst {o.rows} rows:")
    with pd.option_context("display.max_columns", 30, "display.width", 200):
        print(df.head(o.rows).to_string())


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # a short reason, not a traceback
        print(f"Could not read the table: {type(e).__name__}: {e}", file=sys.stderr)
        sys.exit(1)
