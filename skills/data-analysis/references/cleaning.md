# Cleaning data

Open this when a file needs more than a quick fix: placeholder values, rows that repeat, numbers or
dates written several ways, names spelled several ways, rows you are unsure of. Clean for the
question you are answering, make every change countable and reversible, and lose nothing without a
trace.

## Ground rules

- Keep the original as it came. Clean into a new file with a script you can run again from the
  start; a step run twice must not change the data twice (amounts divided by 100 again).
- What looks wrong may be real: a huge order, a rare category, a refund. The profile shows where to
  look; it is not a list of things to change.
- Never drop rows, columns or categories silently. Rows you cannot fix safely go to a set-aside file
  with the reason.
- Every conversion counts its failures: a value that did not convert is reported, never quietly
  turned into an empty cell.
- Log each step: what, by which rule, how many rows, why (an example at the end).
- Ask the person before changes of meaning: deleting rows, filling gaps, merging names, converting
  units, choosing how to read a date or a number. Or say what you chose, and keep it easy to undo.
- Without code, the same method works in a spreadsheet (`save_sheet`): the original on one sheet,
  the cleaned data on a second, the set-aside rows with their reason on a third, the log on a fourth.

## The order of work

1. Read everything as text, so nothing is converted behind your back (leading zeros, "N/A", 1.234).
2. Fix the shape: the header row, notes above or below the table, Total lines, blank rows, a column
   holding two things ("Leeds, UK").
3. Tidy the text: spaces, invisible characters, how accents are stored.
4. Mark the gaps and placeholders.
5. Convert numbers, dates and units with a stated format, counting what fails.
6. Check ranges and the rules between columns.
7. One label for one thing; then names of the same thing.
8. Duplicates, at the grain.
9. Set aside what is still doubtful.
10. Compare before and after.

The snippets below share one example: `raw` is the file read as text, `df` the copy being cleaned
(`to_number` is in `references/pandas-recipes.md`).

```python
import re
import unicodedata
import pandas as pd

raw = pd.read_csv("orders.csv", sep=";", dtype=str, keep_default_na=False)
df = raw.copy()
```

## Text and Unicode

- Trim the ends and collapse runs of spaces. No-break and thin spaces look like spaces but do not
  match them; Python's `\s` catches them.
- Invisible characters (zero-width spaces, byte-order marks, direction marks) come with copied text
  and break matching: remove them.
- An accent can be stored two ways that look the same (é as one character, or e plus an accent):
  normalise to NFC so they match. NFKC goes further (① becomes 1, ﬁ becomes fi, Ａ becomes A): use it
  only for matching keys, not for the text people read.
- Garbled accents (Ã© for é, â€™ for ’) mean the file was read with the wrong encoding: read it
  again with the right one (UTF-8, or cp1252 for older Windows exports); don't replace them by hand.
- IDs are text: keep leading zeros (postcodes, phone numbers, product codes), and never let a
  spreadsheet turn 1E5 into a number or 3-4 into a date.

```python
def tidy(s):
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"[\u200b-\u200f\u2060\ufeff]", "", s)   # invisible characters
    return re.sub(r"\s+", " ", s).strip()                # every kind of space, once

for col in ["customer", "supplier", "country"]:
    df[col] = raw[col].map(tidy)
```

## Gaps and placeholder values

Empty is often written as a value: 0, -1, 99, 999, "N/A", "n.a.", "unknown", "TBD", "-", "?",
1900-01-01, 2099-12-31. Call a value a placeholder only with evidence: the data dictionary says so,
or it turns up far more often than its neighbours (a spike of exactly 0 ages).

- Decide column by column: 0 is a real value as often as a placeholder (no sales that day).
- Count each placeholder before replacing it with an empty value, and log it.
- Where the source tells them apart, keep "unknown", "not applicable", "not asked" and "refused"
  apart: a column saying why beats one empty cell for all.
- Fill a gap only by a stated rule ("Unknown" for a category, the last value for a running balance),
  with a column marking what was filled. Never invent an amount or a date.
- Leaving rows with gaps out changes who is counted (often the newest customers, the youngest people):
  say how many and who.

```python
PLACEHOLDERS = {"qty": {"", "-1", "-"}, "country": {"", "N/A", "unknown", "?"}}
for col, values in PLACEHOLDERS.items():
    found = df[col].isin(values)
    print(col, df.loc[found, col].value_counts().to_dict())   # look before replacing
    df[col] = df[col].mask(found)                            # an empty value
```

## Numbers, dates, units and time zones: say the format

- **Numbers:** say the decimal mark and the thousands separator: 1.234,56 in much of Europe, 1,234.56
  in the UK and US, 1'234.56 in Switzerland. 1.234 alone could be either: the rest of the column
  tells you.
- **Dates:** say the format. 03/04/2026 is 3 April in Europe and 4 March in the US; a value like
  13/04 shows which. Two-digit years need a century. A number like 45383 in a date column is an Excel
  date (days since 30 Dec 1899).
- **Time zones:** say which zone the times are in, convert to one, keep the original. A date taken
  from a UTC time can be the day before or after locally; once a year a local hour repeats and one
  never happens.
- **Units and currencies:** one unit per column, named in its header (`amount_eur`, `weight_kg`).
  Convert only when both units are known; never add up different currencies without a stated rate
  and date.

```python
df["amount"] = to_number(raw["amount"], decimal=",")
df["ordered"] = pd.to_datetime(raw["ordered"].str.strip(), format="%d/%m/%Y", errors="coerce")
for col in ["amount", "ordered"]:
    failed = raw.loc[df[col].isna() & raw[col].str.strip().ne(""), col]
    print(col, len(failed), "did not convert:", list(failed.unique()[:10]))

serial = pd.to_numeric(raw["delivered"], errors="coerce")             # Excel dates as numbers
df["delivered"] = pd.to_datetime(raw["delivered"], format="%d/%m/%Y", errors="coerce")
df["delivered"] = df["delivered"].fillna(pd.to_datetime(serial, unit="D", origin="1899-12-30"))

local = pd.to_datetime(raw["time"], format="%Y-%m-%d %H:%M", errors="coerce")
df["time_utc"] = (local.dt.tz_localize("Europe/Berlin", ambiguous="NaT", nonexistent="NaT")
                  .dt.tz_convert("UTC"))                               # the change-over hours: NaT, to look at
```

## Ranges, and rules between columns

- Ranges: ages 0 to 120, percentages 0 to 100, quantities above 0 (a negative may be a return),
  dates inside the export's period.
- Rules between columns: start before end, delivery after order, parts adding up to the total, age
  matching the date of birth, a refund with an order behind it.
- Outliers: check a few against the source first. A mistake with a clear cause (cents in a euros
  column, an extra zero) is fixed by a rule; a real extreme stays, and the analysis uses medians or
  shows it apart. Never delete outliers to tidy a chart.

```python
df["qty"] = pd.to_numeric(df["qty"], errors="coerce")
broken = (df["delivered"] < df["ordered"]) | (df["qty"] <= 0) | (df["ordered"] > pd.Timestamp.today())
print(broken.sum(), "rows break a rule")
print(df[broken].head(10))
```

## One label for one thing

- Group in lower case after tidying: "UK", "uk " and "U.K." are the same label written three ways.
- Map with a table (original → standard) built from the distinct values (`value_counts()`), kept
  with the script. A value not in the table stays as it is and is listed, never forced into the
  nearest label.
- Check mappings that change meaning: the UK and Great Britain are not the same place; two firms
  with similar names may be different firms.
- A rare category is not a wrong one: keep it.

```python
COUNTRY = {"uk": "United Kingdom", "u.k.": "United Kingdom", "united kingdom": "United Kingdom",
           "deutschland": "Germany", "germany": "Germany"}
lower = df["country"].str.lower()
df["country_std"] = lower.map(COUNTRY)
print(df.loc[df["country_std"].isna() & lower.notna(), "country"].value_counts())   # not mapped yet
```

## Names of the same thing

When one customer, supplier or place is written several ways ("ACME Ltd", "Acme Limited", "ACME
LTD."), deciding they are one is a judgement:

1. Make a matching key: NFKC, lower case, punctuation and words like ltd, limited, gmbh, inc removed.
2. Names with the same key can be grouped; keep the original beside the group.
3. For the rest, find candidates by similarity and give each a score.
4. Confirm with another field before merging: the same postcode, email, phone or tax number. A score
   is not proof: "John Smith" and "Jane Smith" score 0.8.
5. Decide by score: high and confirmed, merge; middling, a list for the person to check; low, keep
   apart. Check a sample of the high ones too, not only the doubtful ones.
6. Keep the mapping (original, matched to, score, decided how) with the cleaned data, so any merge
   can be undone.

```python
import difflib

def match_key(name):
    s = re.sub(r"[^\w\s]", " ", unicodedata.normalize("NFKC", name).casefold())
    s = re.sub(r"\b(ltd|limited|gmbh|inc|plc|llc|co|the|and)\b", " ", s)
    return " ".join(s.split())

names = sorted(df["supplier"].dropna().unique())
keys = {n: match_key(n) for n in names}
pairs = [{"name": a, "maybe_same_as": b, "score": round(difflib.SequenceMatcher(None, keys[a], keys[b]).ratio(), 2)}
         for i, a in enumerate(names) for b in names[i + 1:]]           # fine for a few thousand names
pairs = pd.DataFrame(pairs, columns=["name", "maybe_same_as", "score"])
pairs[pairs["score"] >= 0.8].sort_values("score", ascending=False).to_csv("possible-matches.csv", index=False)
```

## Duplicates, at the grain

- Say what one row is (an order, an order line, a customer on a day), then what "the same row" means.
- Exact repeats are usually overlapping exports: find where they came from, then remove them and
  count them.
- The same key with different values is a conflict, not a repeat: keep one by a stated rule (the
  latest, the most complete) or set both aside.
- Near-repeats (the same person spelled differently) are names of the same thing, above.

```python
before = len(df)
df = df.drop_duplicates()
print(before - len(df), "exact repeats removed")
conflicts = df[df.duplicated("order_id", keep=False)].sort_values("order_id")
print(len(conflicts), "rows share an order_id with a different row")
```

## Set doubtful rows aside

Rows you cannot fix safely (an amount that would not convert, an impossible date, a conflict you
cannot settle) go to a set-aside file, not the bin: the original values, plus a `reason` column. Give
the counts by reason in the caveats ("14 rows set aside: 9 unreadable amounts, 5 dates in the
future"); the person decides what becomes of them.

```python
problems = {
    "amount did not convert": df["amount"].isna() & raw.loc[df.index, "amount"].str.strip().ne(""),
    "breaks a rule": broken.loc[df.index],
    "order_id repeated": df["order_id"].duplicated(keep=False),
}
reason = pd.Series("", index=df.index)
for why, hit in problems.items():
    reason = reason.where(~hit, (reason + "; " + why).str.lstrip("; "))
doubtful = reason.ne("")
print(reason[doubtful].value_counts())
raw.loc[doubtful[doubtful].index].assign(reason=reason[doubtful]).to_csv("set-aside.csv", index=False)
df[~doubtful].to_csv("orders-clean.csv", index=False)
```

## Compare before and after

- **Rows:** before = after + set aside + repeats removed + non-data lines (Total, blank), each with
  its line in the log.
- **Keys:** none lost, none new, none written differently ('00123' become '123'), no repeats left.
- **Totals:** each amount summed before and after; the difference is explained by the rows set aside
  or removed, and by values corrected.
- **Categories:** after mapping, each standard label counts as many rows as its old spellings did.
- **Empty cells:** more after cleaning means values that failed to convert.
- Look at a few changed rows of each kind by eye.

`scripts/compare_data.py` does all of this without pandas, and lists what to check:

```bash
python3 <this folder>/scripts/compare_data.py orders.csv orders-clean.csv --key order_id --sum amount --aside set-aside.csv
```

It matches columns by name ("Order ID" is order_id) and rows by the key, reads amounts such as
"€1.234,56", and reports rows in neither file, keys written differently, where a change in a total
comes from, values emptied by a conversion, gaps filled, and dates like 03/04 read both ways. For
Excel files add `--sheet` and run it with `data-python` instead of `python3`.

## Values a model suggests

When you, or a model, work out a value (a city from a postcode, a category from a description, a
match between two names), it is a proposal:

- Keep the original; put the proposal in its own column, with where it came from.
- A confident explanation is not evidence: check proposals against the source, a sample of the
  confident ones included.
- Never merge two people or companies because their names look alike.
- Keep the accepted answers in a file and reuse them, so a rerun does not decide differently.

## The cleaning log

| Step | What | Rows | Why |
| --- | --- | --- | --- |
| 1 | Read as text: `;` separated, decimal comma | 12,408 | the export's format |
| 2 | Removed the Total line and 2 blank rows | 3 | not data |
| 3 | "N/A" and "n.a." in amount made empty | 41 | placeholders, per the data dictionary |
| 4 | Country mapped to 14 standard names; 3 values left unmapped | 1,215 | one label for one thing |
| 5 | Exact repeats removed | 14 | the March exports overlapped |
| 6 | Set aside: 6 unreadable amounts, 9 dates in the future | 15 | cannot be fixed safely |

12,408 rows in: 12,376 clean, 15 set aside, 14 repeats and 3 non-data lines removed.
