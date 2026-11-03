#!/usr/bin/env python3
"""A first look at a data file before analysing it: what is in each column, and what needs checking.

    python3 profile_data.py data.csv                 CSV, TSV or text with any common separator
    python3 profile_data.py book.xlsx --sheet Sales  an Excel sheet (needs openpyxl; data-python has it)
    python3 profile_data.py data.csv --header-row 3 --max-rows 200000

Reports rows and columns; per column its kind (number, date, yes/no, text, mixed), gaps, distinct
values, ranges, the most common values, numbers stored as text, mixed date formats and outliers; then
duplicate rows, blank rows and rows of the wrong length, and a list of things to check. It only reads
the file. Standard library only, apart from openpyxl for .xlsx and .xlsm.
"""
import argparse
import csv
import datetime as dt
import math
import os
import re
import statistics
import sys
from collections import Counter

MISSING = {"", "na", "n/a", "nan", "null", "none", "nil", "-", "--", "—", "#n/a", "?"}
BOOLS = {"yes", "no", "true", "false", "oui", "non", "ja", "nein", "sí", "si"}
MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}
CURRENCY = re.compile(
    r"r\$|kr\b|zł|[$€£¥₹₽₩₺]"
    r"|\b(?:usd|eur|gbp|chf|jpy|cad|aud|sek|nok|dkk|pln|inr|brl|mxn)\b", re.I)
GROUP = "[.\u00a0\u202f ]"  # thousands separators after a decimal comma: dot, no-break spaces, space
DISTINCT_CAP = 100_000

PLAIN_NUM = re.compile(r"^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$")
US_NUM = re.compile(r"^[+-]?[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$")            # 1,234.56
EU_NUM = re.compile(r"^[+-]?(?:[1-9]\d{0,2}(?:" + GROUP + r"\d{3})+|\d+)(?:,\d+)?$")  # 1.234,56
ISO_DATE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$")
NUM_DATE = re.compile(r"^(\d{1,2})([/.\-])(\d{1,2})\2(\d{2}|\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?m\.?)?)?$", re.I)
WORD_DATE1 = re.compile(r"^(\d{1,2})\s+([a-z]{3,9})\.?,?\s+(\d{4})$", re.I)        # 3 Nov 2026
WORD_DATE2 = re.compile(r"^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$", re.I)        # Nov 3, 2026


def parse_number(s):
    """(value, style, cleaned) for a number written as text, or None. style: plain, us, eu, ambiguous."""
    t = s.strip().replace("−", "-")
    cleaned = False
    neg = False
    if t.startswith("(") and t.endswith(")"):
        t, neg, cleaned = t[1:-1].strip(), True, True
    if t.endswith("-") and not t.startswith("-"):
        t, neg, cleaned = t[:-1].strip(), True, True
    t2 = CURRENCY.sub("", t).strip()
    if t2 != t:
        t, cleaned = t2, True
    pct = t.endswith("%")
    if pct:
        t, cleaned = t[:-1].strip(), True
    if not t:
        return None
    if PLAIN_NUM.match(t):
        v = float(t)
        style = "ambiguous" if re.match(r"^[+-]?[1-9]\d{0,2}\.\d{3}$", t) else "plain"  # 1.234: decimal or thousands?
    elif US_NUM.match(t):
        v = float(t.replace(",", ""))
        style = "ambiguous" if re.match(r"^[+-]?[1-9]\d{0,2},\d{3}$", t) else "us"      # 1,234: thousands or decimal?
        cleaned = True
    elif EU_NUM.match(t):
        v = float(re.sub(GROUP, "", t).replace(",", "."))
        style = "eu"
        cleaned = True
    else:
        return None
    if neg:
        v = -v
    if pct:
        v = v / 100
    return v, style, cleaned


def parse_date(s):
    """(date, kind) for a date written as text, or None. kind: iso, dmy, mdy, ambiguous, words."""
    t = s.strip()
    m = ISO_DATE.match(t)
    if m:
        try:
            return dt.date(int(m[1]), int(m[2]), int(m[3])), "iso"
        except ValueError:
            return None
    m = NUM_DATE.match(t)
    if m:
        a, b, y = int(m[1]), int(m[3]), int(m[4])
        if y < 100:
            y += 2000 if y < 70 else 1900
        if a > 12 and b <= 12:
            kind, day, month = "dmy", a, b
        elif b > 12 and a <= 12:
            kind, day, month = "mdy", b, a
        elif a <= 12 and b <= 12:
            kind, day, month = "ambiguous", a, b
        else:
            return None
        try:
            return dt.date(y, month, day), kind
        except ValueError:
            return None
    for rx, day_first in ((WORD_DATE1, True), (WORD_DATE2, False)):
        m = rx.match(t)
        if m:
            day, word = (m[1], m[2]) if day_first else (m[2], m[1])
            month = MONTHS.get(word[:3].lower())
            if month:
                try:
                    return dt.date(int(m[3]), month, int(day)), "words"
                except ValueError:
                    return None
    return None


class Column:
    def __init__(self, name, typed=False):
        self.name = name
        self.typed = typed  # values come typed (Excel): any number held as text is a problem
        self.n = 0
        self.missing = 0
        self.missing_tokens = Counter()
        self.kinds = Counter()
        self.numbers = []
        self.number_styles = Counter()
        self.as_text = 0  # numbers that were written as text with symbols or separators
        self.dates = []
        self.date_kinds = Counter()
        self.texts = Counter()
        self.distinct = set()
        self.distinct_over = False
        self.spaces = 0
        self.longest = 0

    def add(self, v):
        self.n += 1
        if v is None:
            self.missing += 1
            return
        if isinstance(v, bool):
            self.kinds["yes/no"] += 1
            self.texts[str(v)] += 1
            self._distinct(str(v))
            return
        if isinstance(v, (int, float)):
            if isinstance(v, float) and math.isnan(v):
                self.missing += 1
                return
            self.kinds["number"] += 1
            self.numbers.append(float(v))
            self._distinct(v)
            return
        if isinstance(v, (dt.datetime, dt.date)):
            d = v.date() if isinstance(v, dt.datetime) else v
            self.kinds["date"] += 1
            self.dates.append(d)
            self.date_kinds["stored as dates"] += 1
            self._distinct(d)
            return
        s = str(v)
        if s.strip().lower() in MISSING:
            self.missing += 1
            if s.strip():
                self.missing_tokens[s.strip()] += 1
            return
        if s != s.strip():
            self.spaces += 1
        self.longest = max(self.longest, len(s))
        self._distinct(s)
        num = parse_number(s)
        if num:
            value, style, cleaned = num
            self.kinds["number"] += 1
            self.numbers.append(value)
            self.number_styles[style] += 1
            self.as_text += cleaned or self.typed
            return
        date = parse_date(s)
        if date:
            self.kinds["date"] += 1
            self.dates.append(date[0])
            self.date_kinds[date[1]] += 1
            return
        if s.strip().lower() in BOOLS:
            self.kinds["yes/no"] += 1
            self.texts[s.strip()] += 1
            return
        self.kinds["text"] += 1
        self.texts[s] += 1

    def _distinct(self, v):
        if self.distinct_over:
            return
        self.distinct.add(v)
        if len(self.distinct) > DISTINCT_CAP:
            self.distinct_over = True
            self.distinct = set()

    @property
    def filled(self):
        return self.n - self.missing

    def kind(self):
        if not self.filled:
            return "empty"
        top, count = self.kinds.most_common(1)[0]
        return top if count >= 0.95 * self.filled else "mixed"


def many(n, one, more=None):
    """1 row, 2 rows."""
    return f"{n:,} {one if n == 1 else (more or one + 's')}"


def pct(a, b):
    return f"{100 * a / b:.1f}%" if b else "0%"


def fmt(x):
    if isinstance(x, float):
        if x.is_integer() and abs(x) < 1e15:
            return f"{int(x):,}"
        if abs(x) >= 1000:
            return f"{x:,.0f}"
        if abs(x) >= 1:
            return f"{x:,.2f}".rstrip("0").rstrip(".")
        return f"{x:.4g}"
    return str(x)


def short(s, n=40):
    s = str(s).replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def read_csv(path, sep=None, encoding=None):
    raw = open(path, "rb").read()
    encs = [encoding] if encoding else ["utf-8-sig", "cp1252", "latin-1"]
    for enc in encs:
        try:
            text = raw.decode(enc)
            break
        except (UnicodeDecodeError, LookupError):
            continue
    else:
        raise SystemExit(f"Could not read {path} as text with {', '.join(encs)}.")
    if sep is None:
        sample = "\n".join(text.splitlines()[:50])
        try:
            sep = csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
        except csv.Error:
            sep = "\t" if path.lower().endswith((".tsv", ".tab")) else ","
    rows = list(csv.reader(text.splitlines(), delimiter=sep))
    names = {",": "comma", ";": "semicolon", "\t": "tab", "|": "bar"}
    return rows, f"encoding {enc}, separated by {names.get(sep, repr(sep))}"


def read_xlsx(path, sheet=None):
    try:
        import openpyxl
    except ImportError:
        raise SystemExit("Reading .xlsx needs openpyxl: run this with data-python (next to this script), "
                         "or save the sheet as CSV first.")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if sheet and sheet not in wb.sheetnames:
        raise SystemExit(f"No sheet named {sheet!r}; the sheets are: {', '.join(wb.sheetnames)}")
    ws = wb[sheet] if sheet else wb.worksheets[0]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    others = [n for n in wb.sheetnames if n != ws.title]
    return rows, f"sheet {ws.title!r}" + (f" (other sheets: {', '.join(others)})" if others else "")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("file")
    ap.add_argument("--sheet", help="for Excel files: the sheet's name (default: the first)")
    ap.add_argument("--sep", help="the separator, if guessing it goes wrong (tab for a tab)")
    ap.add_argument("--encoding", help="the text encoding, if guessing it goes wrong")
    ap.add_argument("--header-row", type=int, default=1, help="the row holding the column names (default 1)")
    ap.add_argument("--max-rows", type=int, help="read only this many data rows (the first ones, not a sample)")
    a = ap.parse_args()

    path = a.file
    if not os.path.isfile(path):
        raise SystemExit(f"No such file: {path}")
    ext = os.path.splitext(path)[1].lower()
    is_csv = ext not in (".xlsx", ".xlsm")
    if ext in (".xls", ".ods", ".numbers"):
        raise SystemExit(f"{ext} files: save as .xlsx or .csv first (soffice --headless --convert-to xlsx FILE).")
    if is_csv:
        sep = "\t" if a.sep in ("\\t", "tab") else a.sep
        rows, how = read_csv(path, sep, a.encoding)
    else:
        rows, how = read_xlsx(path, a.sheet)

    print(f"{os.path.basename(path)} ({os.path.getsize(path):,} bytes), {how}")
    if len(rows) < a.header_row:
        print("The file has no rows.")
        return
    header_len = len(rows[a.header_row - 1])
    header = ["" if h is None else str(h).strip() for h in rows[a.header_row - 1]]
    data = rows[a.header_row:]
    if a.max_rows:
        data = data[: a.max_rows]
    width = len(header)
    # Empty columns at the right edge (common in Excel): no name and nothing in them.
    while width and not header[width - 1] and all(len(r) < width or r[width - 1] in (None, "") for r in data[:1000]):
        width -= 1
    header = header[:width]
    checks = []

    blank, ragged, seen, dups, dup_rows = 0, [], {}, 0, []
    cols = [Column(h or f"(column {i + 1})", typed=not is_csv) for i, h in enumerate(header)]
    for i, r in enumerate(data, start=a.header_row + 1):
        if all(v is None or (isinstance(v, str) and not v.strip()) for v in r):
            blank += 1
            continue
        if is_csv and len(r) != header_len:
            ragged.append(i)
        key = tuple("" if v is None else str(v) for v in r[:width])
        if key in seen:
            dups += 1
            if len(dup_rows) < 5:
                dup_rows.append(f"{i} (same as {seen[key]})")
        else:
            seen[key] = i
        for c, col in enumerate(cols):
            col.add(r[c] if c < len(r) else None)

    print(f"{len(data) - blank:,} data rows, {width} columns (names in row {a.header_row})")

    empty_names = [i + 1 for i, h in enumerate(header) if not h]
    dup_names = [h for h, n in Counter(header).items() if h and n > 1]
    numeric_names = [h for h in header if h and parse_number(h) and not re.match(r"^(19|20)\d\d$", h)]
    if empty_names:
        checks.append(f"columns without a name: {', '.join(map(str, empty_names))}")
    if dup_names:
        checks.append(f"column names used twice: {', '.join(dup_names)}")
    if len(numeric_names) >= max(2, width // 2):
        checks.append(f"the names row looks like data ({', '.join(numeric_names[:3])}): are the names in another row? (--header-row)")

    for col in cols:
        kind = col.kind()
        distinct = "over 100,000" if col.distinct_over else f"{len(col.distinct):,}"
        print(f"\n{col.name}: {kind}, {col.filled:,} filled, {col.missing:,} empty ({pct(col.missing, col.n)}), {distinct} distinct")
        if col.missing_tokens:
            print("  counted as empty: " + ", ".join(f"{t!r} x{n}" for t, n in col.missing_tokens.most_common(4)))
        whole = kind == "number" and all(x.is_integer() for x in col.numbers)
        if col.filled > 20 and not col.distinct_over and len(col.distinct) == col.filled and (kind == "text" or whole):
            print("  every value differs: an ID or a free-text field")
        elif (col.filled > 20 and not col.distinct_over and (kind == "text" or whole) and len(col.distinct) >= 0.9 * col.filled
              and 0 < col.filled - len(col.distinct) <= max(3, 0.02 * col.filled)):
            print(f"  nearly every value differs, but {many(col.filled - len(col.distinct), 'repeats', 'repeat')}")
            checks.append(f"{col.name}: looks like an ID, yet {many(col.filled - len(col.distinct), 'value repeats', 'values repeat')}: duplicate records?")
        if col.numbers:
            nums = sorted(col.numbers)
            if len(nums) >= 4:
                q1, med, q3 = statistics.quantiles(nums, n=4)
            else:
                q1, med, q3 = nums[0], statistics.median(nums), nums[-1]
            print(f"  numbers: min {fmt(nums[0])}, median {fmt(med)}, mean {fmt(statistics.fmean(nums))}, "
                  f"max {fmt(nums[-1])}, sum {fmt(math.fsum(nums))}")
            neg = sum(1 for x in nums if x < 0)
            if neg:
                print(f"  {neg:,} negative")
            iqr = q3 - q1
            if iqr > 0:
                far = [x for x in nums if x < q1 - 3 * iqr or x > q3 + 3 * iqr]
                if far:
                    ex = ", ".join(fmt(x) for x in sorted(set(far), key=lambda x: -abs(x - med))[:4])
                    print(f"  {len(far):,} far outside the rest (e.g. {ex})")
                    checks.append(f"{col.name}: {len(far):,} values far outside the rest (e.g. {ex}): real, or errors?")
            if col.as_text:
                how = "held as text cells (Excel's SUM skips them)" if col.typed else "written with symbols or separators (currency, %, 1,234, (12))"
                print(f"  {col.as_text:,} {how}")
                checks.append(f"{col.name}: {col.as_text:,} numbers stored as text: convert them before summing")
            st = col.number_styles
            if st["eu"] and st["us"]:
                checks.append(f"{col.name}: 1,234.56 and 1.234,56 styles mixed (decimal point and decimal comma)")
            elif st["eu"]:
                print("  written with a decimal comma (1.234,56)")
            if st["ambiguous"] and not (st["eu"] or st["us"]):
                checks.append(f"{col.name}: {st['ambiguous']:,} values like 1,234 or 1.234 may be thousands or decimals: check the source")
        if col.dates:
            ds = sorted(col.dates)
            k = col.date_kinds
            print(f"  dates: {ds[0].isoformat()} to {ds[-1].isoformat()}; written as " + ", ".join(f"{name} {n:,}" for name, n in k.most_common()))
            if k["dmy"] and k["mdy"]:
                checks.append(f"{col.name}: day-first and month-first dates mixed ({k['dmy']:,} and {k['mdy']:,}): check before using")
            elif k["ambiguous"] and not (k["dmy"] or k["mdy"]):
                checks.append(f"{col.name}: {k['ambiguous']:,} dates like 03/04/2026 may be day-first or month-first: confirm which")
            elif k["ambiguous"]:
                print(f"  read as {'day-first' if k['dmy'] else 'month-first'}, since some dates can only be read that way")
            future = sum(1 for d in ds if d > dt.date.today())
            if future:
                print(f"  {future:,} in the future")
            years = Counter(d.year for d in ds)
            if 1 < len(years) <= 12:
                print("  rows per year: " + ", ".join(f"{y} {n:,}" for y, n in sorted(years.items())))
        if kind in ("number", "date") and col.kinds["text"]:
            ex = ", ".join(repr(short(v, 20)) for v, _ in col.texts.most_common(3))
            print(f"  also {many(col.kinds['text'], 'text value')}, e.g. {ex}")
            checks.append(f"{col.name}: {many(col.kinds['text'], 'text value')} among the {kind}s (e.g. {ex})")
        if col.texts:
            print("  most common: " + ", ".join(f"{short(v, 30)!r} x{n:,}" for v, n in col.texts.most_common(5)))
            if len(col.texts) <= 500:
                groups = {}
                for v in col.texts:
                    groups.setdefault(re.sub(r"[\s.]+", " ", v).strip().lower(), []).append(v)
                near = [g for g in groups.values() if len(g) > 1]
                if near:
                    ex = "; ".join(" / ".join(repr(x) for x in g[:3]) for g in near[:3])
                    print(f"  labels that differ only by spaces, dots or capitals: {ex}")
                    checks.append(f"{col.name}: the same label written differently ({ex})")
            if col.longest > 200:
                print(f"  longest value {col.longest:,} characters")
        if kind == "mixed":
            parts = ", ".join(f"{k} {n:,}" for k, n in col.kinds.most_common())
            print(f"  mixed: {parts}")
            checks.append(f"{col.name}: mixed kinds of value ({parts})")
        if col.spaces:
            print(f"  {col.spaces:,} with spaces at the start or end")
            checks.append(f"{col.name}: {col.spaces:,} values with spaces at the start or end (they group apart)")
        if kind == "empty":
            checks.append(f"{col.name}: completely empty" + ("" if is_csv else
                          " (if it holds formulas, the file was saved without their results: open and save it in Excel or LibreOffice first)"))
        elif col.missing and col.missing / col.n >= 0.2:
            checks.append(f"{col.name}: {pct(col.missing, col.n)} empty")

    print()
    if blank:
        print(many(blank, "blank row"))
        checks.append(f"{many(blank, 'blank row')} (often a second table, or totals, below the data)")
    if ragged:
        print(f"{many(len(ragged), 'row')} with a different number of fields from the names row (e.g. row {', '.join(map(str, ragged[:5]))})")
        checks.append(f"{many(len(ragged), 'row')} of the wrong length: a separator inside a value, or a broken export")
    if dups:
        print(f"{many(dups, 'row')} exactly the same as an earlier row (e.g. row {', '.join(dup_rows)})")
        checks.append(f"{many(dups, 'duplicate row')}: real repeats, or the same data exported twice?")
    if any(isinstance(v, str) and re.match(r"^\s*(grand )?totals?\b", v, re.I) for r in data[-3:] for v in r):
        checks.append("a row near the end says Total: leave it out of sums")

    print("\nTo check:" if checks else "Nothing stands out; still look at a few rows by eye.")
    for c in checks:
        print(f"- {c}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
