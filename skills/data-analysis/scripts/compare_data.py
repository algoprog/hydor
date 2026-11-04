#!/usr/bin/env python3
"""Compare a data file before and after cleaning: rows, keys, totals, empty cells, and what changed.

    python3 compare_data.py raw.csv clean.csv --key order_id --sum amount
    python3 compare_data.py raw.csv clean.csv --key order_id --sum amount --aside set-aside.csv
    python3 compare_data.py export.xlsx clean.csv --sheet Orders --key "Order ID" --key Line

Columns are matched by name, ignoring case, spaces and punctuation ("Order ID" and order_id are one
column). --key names the column (or the columns, together) that tells rows apart: with it, rows are
matched across the files, and it says which rows went, which are new, which changed and how. --aside is
the file of rows set aside for checking: then every row of the original should be in the cleaned file
or in that one. It only reads the files. Standard library only, apart from openpyxl for .xlsx (run it
with data-python); it uses profile_data.py beside it.
"""
import argparse
import datetime as dt
import math
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict

sys.dont_write_bytecode = True  # no __pycache__ in the skill's folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from profile_data import MISSING, many, parse_date, parse_number, read_csv, read_xlsx, short  # noqa: E402


def text(v):
    """A cell as text, the same for CSV and Excel: 12.0 is '12', a date at midnight '2026-03-04'."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, float):
        if math.isnan(v):
            return ""
        return str(int(v)) if v.is_integer() and abs(v) < 1e15 else repr(v)
    if isinstance(v, dt.datetime):
        return v.date().isoformat() if v.time() == dt.time() else v.isoformat(sep=" ")
    if isinstance(v, (dt.date, dt.time)):
        return v.isoformat()
    return str(v)


def blank(s):
    return s.strip().lower() in MISSING


def name_key(name):
    return re.sub(r"[\W_]+", "", name.casefold()) or name


def loose(key):
    """A key without the differences cleaning tends to make: spaces, capitals, leading zeros, '.0'."""
    return tuple(re.sub(r"\.0+$", "", re.sub(r"\s+", "", k).casefold()).lstrip("0") for k in key)


def tidy(s):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFC", s)).strip().casefold()


def amount(x):
    return f"{x:,.2f}" if abs(x) >= 1 or x == 0 else f"{x:.4g}"


def signed(x):
    return ("+" if x >= 0 else "−") + amount(abs(x))


def numbers(values, decimal_comma=False):
    """Each value as a number (None when empty or not a number), read in the column's own style; the
    values that are not numbers; and how many, like 1.000 or 1,234, nothing in the column tells how to
    read. '1.234' is 1234 in a column that also has 1.234,56."""
    parsed = [None if blank(v) else parse_number(v) for v in values]
    styles = Counter(p[1] for p in parsed if p)
    comma = decimal_comma or (styles["eu"] and not styles["us"])
    out, bad = [], []
    for v, p in zip(values, parsed):
        if p is None:
            out.append(None)
            if not blank(v):
                bad.append(v)
        elif p[1] == "ambiguous" and comma:  # read it with the separators the other way round
            out.append(parse_number(v.replace(".", "\0").replace(",", ".").replace("\0", ","))[0])
        else:
            out.append(p[0])
    unsure = 0 if comma or styles["us"] else styles["ambiguous"]
    return out, bad, unsure


def mostly_numbers(values):
    filled = [v for v in values[:500] if not blank(v)]
    return bool(filled) and sum(parse_number(v) is not None for v in filled) >= 0.9 * len(filled)


def date_reading(x, y):
    """How the date written as x was read, when y is the same day: 'as written', 'day-first' or
    'month-first' (for dates like 03/04/2026); None when they are not the same day."""
    dx, dy = parse_date(x), parse_date(y)
    if not (dx and dy):
        return None
    if dx[0] == dy[0]:
        return "day-first" if dx[1] == "ambiguous" else "as written"
    if dx[1] == "ambiguous":
        try:
            if dt.date(dx[0].year, dx[0].day, dx[0].month) == dy[0]:
                return "month-first"
        except ValueError:
            pass
    return None


class Table:
    def __init__(self, path, sheet=None, header_row=1, sep=None, encoding=None):
        if not os.path.isfile(path):
            raise SystemExit(f"No such file: {path}")
        ext = os.path.splitext(path)[1].lower()
        if ext in (".xls", ".ods", ".numbers"):
            raise SystemExit(f"{path}: save it as .xlsx or .csv first (soffice --headless --convert-to xlsx FILE).")
        rows, self.how = read_xlsx(path, sheet) if ext in (".xlsx", ".xlsm") else read_csv(path, sep, encoding)
        self.path = path
        if len(rows) < header_row:
            raise SystemExit(f"{path}: there is no row {header_row} with the column names.")
        head = [text(h).strip() for h in rows[header_row - 1]]
        data = rows[header_row:]
        width = len(head)
        while width and not head[width - 1] and all(len(r) < width or not text(r[width - 1]).strip() for r in data):
            width -= 1
        self.names = [h or f"(column {i + 1})" for i, h in enumerate(head[:width])]
        self.rows, self.line = [], []  # the cells of each row, and its row number in the file
        for n, r in enumerate(data, start=header_row + 1):
            cells = [text(v) for v in r[:width]] + [""] * (width - len(r))
            if any(c.strip() for c in cells):
                self.rows.append(cells)
                self.line.append(n)
        self.col = {}
        for i, name in enumerate(self.names):
            self.col.setdefault(name_key(name), i)

    def index(self, name, what):
        i = self.col.get(name_key(name))
        if i is None:
            raise SystemExit(f"{what} {name!r} is not a column of {self.path}; its columns are: {', '.join(self.names)}")
        return i

    def values(self, c):
        return [r[c] for r in self.rows]

    def keys(self, names):
        """key → the indexes of its rows, and the indexes of the rows without a key."""
        cols = [self.index(n, "--key") for n in names]
        keys, none = defaultdict(list), []
        for i, r in enumerate(self.rows):
            k = tuple(r[c].strip() for c in cols)
            if all(blank(x) for x in k):
                none.append(i)
            else:
                keys[k].append(i)
        return keys, none

    def describe(self, label):
        return f"{label}: {os.path.basename(self.path)}: {many(len(self.rows), 'row')}, {many(len(self.names), 'column')} ({self.how})"


def show_key(k):
    return repr(k[0]) if len(k) == 1 else "(" + ", ".join(repr(x) for x in k) + ")"


def keys_list(ks, n):
    return ", ".join(show_key(k) for k in ks[:n])


def total(vals, rows):
    """The sum of the numbers in these rows."""
    return math.fsum(vals[i] for i in rows if vals[i] is not None)


def examples(counter, n):
    return ", ".join(f"{short(v, 30)!r} x{c:,}" for v, c in counter.most_common(n))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("before", help="the original file")
    ap.add_argument("after", help="the cleaned file")
    ap.add_argument("--key", action="append", default=[], help="the column that tells rows apart (repeat it for a key of several columns)")
    ap.add_argument("--sum", action="append", default=[], help="a column of amounts to total in each file (repeat it for more)")
    ap.add_argument("--aside", help="the file of rows set aside for checking")
    ap.add_argument("--sheet", help="the original's sheet, for an Excel file (default: the first)")
    ap.add_argument("--after-sheet", help="the cleaned file's sheet, for an Excel file (default: the first)")
    ap.add_argument("--header-row", type=int, default=1, help="the row of the original holding the column names (default 1)")
    ap.add_argument("--decimal-comma", action="store_true", help="the original writes numbers as 1.234,56 (when its values cannot tell)")
    ap.add_argument("--sep", help="the original's separator, if guessing it goes wrong (tab for a tab)")
    ap.add_argument("--encoding", help="the original's text encoding, if guessing it goes wrong")
    ap.add_argument("--show", type=int, default=3, help="how many examples to show (default 3)")
    a = ap.parse_args()

    sep = "\t" if a.sep in ("\\t", "tab") else a.sep
    before = Table(a.before, a.sheet, a.header_row, sep, a.encoding)
    after = Table(a.after, a.after_sheet)
    aside = Table(a.aside) if a.aside else None
    for k in a.key:
        for t in (before, after, aside) if aside else (before, after):
            t.index(k, "--key")
    for col in a.sum:
        before.index(col, "--sum")
        after.index(col, "--sum")
    print(before.describe("Before"))
    print(after.describe("After"))
    if aside:
        print(aside.describe("Set aside"))
    checks = []

    # Columns, matched by name
    common = [(i, after.col[name_key(n)]) for i, n in enumerate(before.names) if name_key(n) in after.col]
    renamed = [f"{before.names[i]!r} = {after.names[j]!r}" for i, j in common if tidy(before.names[i]) != tidy(after.names[j])]
    print(f"\nColumns: {len(common)} in both" + (f" (matched by name: {', '.join(renamed[:6])}{', …' if len(renamed) > 6 else ''})" if renamed else ""))
    for label, t, other in (("only before", before, after), ("only after", after, before)):
        only = [n for n in t.names if name_key(n) not in other.col]
        if only:
            print(f"  {label}: {', '.join(only)}")

    # Rows
    nb, na, ns = len(before.rows), len(after.rows), len(aside.rows) if aside else 0
    gap = nb - na - ns
    if aside:
        tail = "all accounted for" if not gap else (f"{gap:,} not accounted for" if gap > 0 else f"{-gap:,} more than the original")
        print(f"\nRows: {nb:,} before, {na:,} after, {ns:,} set aside ({tail})")
    else:
        print(f"\nRows: {nb:,} before, {na:,} after" + (f" ({abs(gap):,} {'fewer' if gap > 0 else 'more'})" if gap else ""))

    # Keys: which rows were kept, set aside, lost, added, or kept with their key written differently
    bkeys, akeys, bnone, anone, pairs, set_aside, lost, new = {}, {}, [], [], [], [], [], []
    if a.key:
        bkeys, bnone = before.keys(a.key)
        akeys, anone = after.keys(a.key)
        skeys = set(aside.keys(a.key)[0]) if aside else set()
        only_b = [k for k in bkeys if k not in akeys]
        only_a = [k for k in akeys if k not in bkeys]
        loose_new = {}
        for k in only_a:
            loose_new.setdefault(loose(k), k)
        reformed = [(k, loose_new.pop(loose(k))) for k in only_b if loose(k) in loose_new]
        moved = {k for k, _ in reformed} | {m for _, m in reformed}
        pairs = [(k, k) for k in bkeys if k in akeys] + reformed
        set_aside = [k for k in only_b if k not in moved and k in skeys]
        lost = [k for k in only_b if k not in moved and k not in skeys]
        new = [k for k in only_a if k not in moved]
        name = " + ".join(a.key)
        print(f"\nKey {name}:")
        for label, ks, none, t in (("before", bkeys, bnone, before), ("after", akeys, anone, after)):
            rep = sum(len(v) - 1 for v in ks.values())
            print(f"  {label}: {many(len(ks), 'key')}" + (f", {many(rep, 'repeat')}" if rep else "")
                  + (f", {many(len(none), 'row')} without one" if none else ""))
            if none and label == "before":
                ex = ", ".join(f"row {t.line[i]} {short(' '.join(c for c in t.rows[i] if c.strip()), 30)!r}" for i in none[:a.show])
                print(f"    rows without a key: {ex}")
            if rep and label == "after":
                checks.append(f"{name}: still {many(rep, 'repeat')} after cleaning")
        print(f"  kept: {len(pairs):,}" + (f"; set aside: {len(set_aside):,}" if aside else "")
              + f"; {'in neither file' if aside else 'gone'}: {len(lost):,}" + (f" (e.g. {keys_list(lost, a.show)})" if lost else "")
              + f"; new: {len(new):,}" + (f" (e.g. {keys_list(new, a.show)})" if new else ""))
        if reformed:
            ex = ", ".join(f"{show_key(k)} → {show_key(m)}" for k, m in reformed[:a.show])
            print(f"  kept, but the key is written differently: {len(reformed):,} (e.g. {ex})")
            checks.append(f"{name}: {many(len(reformed), 'key')} written differently after cleaning (e.g. {ex}): leading zeros, spaces or capitals lost?")
        if lost:
            where = "in neither the cleaned file nor the set-aside one: dropped without a trace?" if aside else "gone from the cleaned file: removed on purpose, and logged?"
            checks.append(f"{many(len(lost), 'key')} of the original (e.g. {keys_list(lost, a.show)}) {where}")
        if new:
            checks.append(f"{many(len(new), 'key')} in the cleaned file but not in the original (e.g. {keys_list(new, a.show)}): where from?")
    else:
        print("  (add --key with the column that tells rows apart, to see which rows went and what changed in each)")

    # Totals, and where a difference comes from
    if a.sum:
        print("\nTotals:")
    else:
        keycols = {name_key(k) for k in a.key}
        numeric = [before.names[i] for i, _ in common if name_key(before.names[i]) not in keycols and mostly_numbers(before.values(i))]
        if numeric:
            print(f"\nTotals: add --sum for the amounts that matter (columns that look like numbers: {', '.join(numeric[:8])})")
    for col in a.sum:
        bi, ai = before.index(col, "--sum"), after.index(col, "--sum")
        col = before.names[bi]
        bv, bbad, unsure = numbers(before.values(bi), a.decimal_comma)
        av, abad, _ = numbers(after.values(ai))
        bt, at = math.fsum(x for x in bv if x is not None), math.fsum(x for x in av if x is not None)
        line = f"  {col}: {amount(bt)} before → {amount(at)} after ({signed(at - bt)})"
        if aside and name_key(col) in aside.col:
            sv = numbers(aside.values(aside.col[name_key(col)]))[0]
            line += f"; {amount(math.fsum(x for x in sv if x is not None))} in the set-aside file"
        print(line)
        if a.key:
            parts = []
            if set_aside:
                parts.append(f"rows set aside {signed(-math.fsum(total(bv, bkeys[k]) for k in set_aside))}")
            if lost:
                lost_total = math.fsum(total(bv, bkeys[k]) for k in lost)
                parts.append(f"rows {'in neither file' if aside else 'gone'} {signed(-lost_total)}")
                if aside and lost_total:
                    checks.append(f"{col}: {amount(lost_total)} is in rows that are in neither the cleaned file nor the set-aside one")
            changed = math.fsum(total(av, akeys[m]) - total(bv, bkeys[k]) for k, m in pairs)
            if abs(changed) > 1e-9:
                parts.append(f"kept rows changed {signed(changed)}")
                if abs(changed) > 0.005 * max(abs(bt), abs(at)):
                    checks.append(f"{col}: the kept rows' total changed by {signed(changed)}: repeats merged and values corrected,"
                                  " or numbers read the wrong way (cents as euros, 1.234 as one or as a thousand)?")
            if new:
                parts.append(f"new rows {signed(math.fsum(total(av, akeys[k]) for k in new))}")
            nokey = total(av, anone) - total(bv, bnone)
            if abs(nokey) > 1e-9:
                parts.append(f"rows without a key {signed(nokey)}")
            if parts:
                print("    the difference: " + "; ".join(parts))
        for label, bad in (("before", bbad), ("after", abad)):
            if bad:
                print(f"    not numbers {label}: {len(bad):,} (e.g. {examples(Counter(bad), a.show)})")
        if unsure:
            print(f"    {many(unsure, 'value')} like 1.000 or 1,234 in the original, read with a decimal point (1.000 is one):"
                  " add --decimal-comma if it writes 1.234,56")
        if abad:
            checks.append(f"{col}: {many(len(abad), 'value')} in the cleaned file not a number (e.g. {examples(Counter(abad), a.show)})")

    # Empty cells: emptied by cleaning means values that did not convert; filled, gaps someone filled in.
    # With a key, counted in the rows kept (one to one); without, from the totals per column.
    one = [(bkeys[k][0], akeys[m][0]) for k, m in pairs if len(bkeys[k]) == 1 and len(akeys[m]) == 1]
    lines = []
    for bi, ai in common:
        bvals, avals = before.values(bi), after.values(ai)
        name = before.names[bi]
        eb, ea = sum(map(blank, bvals)), sum(map(blank, avals))
        if one:
            emptied = Counter(bvals[i] for i, j in one if blank(avals[j]) and not blank(bvals[i]))
            filled = Counter(avals[j] for i, j in one if blank(bvals[i]) and not blank(avals[j]))
            n_emptied, n_filled = sum(emptied.values()), sum(filled.values())
        else:  # removed rows take their empty cells with them, added rows bring theirs
            emptied = filled = Counter()
            n_emptied = ea - eb if ea > eb and na <= nb else 0
            n_filled = eb - ea if eb > ea and na == nb else 0
        if not (n_emptied or n_filled):
            continue
        bits = []
        if n_emptied:
            ex = f" (e.g. {examples(emptied, a.show)})" if emptied else ""
            bits.append(f"{n_emptied:,} emptied{ex}")
            checks.append(f"{name}: {many(n_emptied, 'value')} emptied by cleaning{ex}: did not convert, or cleared on purpose?")
        if n_filled:
            bits.append(f"{many(n_filled, 'gap')} filled" + (f" (with {examples(filled, a.show)})" if filled else "") + ": say how in the caveats")
        lines.append(f"  {name}: {eb:,} empty → {ea:,}; " + "; ".join(bits))
    if lines:
        print("\nEmpty cells" + (" in the kept rows:" if one else ":"))
        print("\n".join(lines))

    # What changed in the rows kept, column by column
    if one:
        print(f"\nChanges in the kept rows ({len(one):,} matched one to one):")
        keycols = {name_key(k) for k in a.key}
        shown = 0
        for bi, ai in common:
            name = before.names[bi]
            if name_key(name) in keycols:
                continue
            bvals, avals = before.values(bi), after.values(ai)
            bn = an = kinds = None
            form, value, reading = Counter(), Counter(), Counter()
            for i, j in one:
                x, y = bvals[i], avals[j]
                if x == y or blank(x) or blank(y):  # empty cells are counted above
                    continue
                sx, sy = short(x, 30), short(y, 30)
                same_look = sx != sy and unicodedata.normalize("NFC", sx) == unicodedata.normalize("NFC", sy)
                pair = (ascii(sx), ascii(sy)) if same_look else (repr(sx), repr(sy))  # accents stored two ways look alike
                if tidy(x) == tidy(y):
                    form[pair] += 1
                    continue
                if bn is None:
                    bn, an = numbers(bvals, a.decimal_comma)[0], numbers(avals)[0]
                if bn[i] is not None and an[j] is not None:
                    (form if math.isclose(bn[i], an[j], rel_tol=1e-9, abs_tol=1e-9) else value)[pair] += 1
                    continue
                how = date_reading(x, y)
                if how:
                    form[pair] += 1
                    reading[how] += 1
                    if kinds is None:
                        kinds = Counter(d[1] for d in map(parse_date, bvals) if d)
                else:
                    value[pair] += 1
            if not (form or value):
                continue
            shown += 1
            bits = []
            if value:
                bits.append(f"{sum(value.values()):,} changed (" + ", ".join(f"{x} → {y} x{c:,}" for (x, y), c in value.most_common(a.show)) + ")")
            if form:
                bits.append(f"{sum(form.values()):,} the same, written differently (e.g. "
                            + ", ".join(f"{x} → {y}" for (x, y), _ in form.most_common(min(a.show, 2))) + ")")
            print(f"  {name}: " + "; ".join(bits))
            day, month = reading["day-first"], reading["month-first"]
            if day and month:
                checks.append(f"{name}: dates like 03/04/2026 read day-first in {day:,} rows and month-first in {month:,}")
            elif month and kinds["dmy"]:
                checks.append(f"{name}: {many(month, 'date')} like 03/04/2026 read month-first, but the original writes day-first (e.g. 13/04/2026)")
            elif day and kinds["mdy"]:
                checks.append(f"{name}: {many(day, 'date')} like 03/04/2026 read day-first, but the original writes month-first (e.g. 04/13/2026)")
            elif (day and not kinds["dmy"]) or (month and not kinds["mdy"]):
                print(f"    dates like 03/04/2026 were read {'day-first' if day else 'month-first'}: is that how the source writes them?")
        if not shown:
            print("  no values changed")
        if len(one) < len(pairs):
            print(f"  ({many(len(pairs) - len(one), 'key')} repeated in a file, left out here)")

    print("\nTo check:" if checks else "\nNothing stands out; still look at a few changed rows by eye.")
    for c in checks:
        print(f"- {c}")


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        sys.exit(0)
