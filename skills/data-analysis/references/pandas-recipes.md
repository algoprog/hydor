# pandas recipes

Run scripts with `data-python` from this skill's scripts folder (pandas, matplotlib and openpyxl,
installed once). Written for pandas 2.2 and later, 3.x included: assign columns with `df["x"] = …`,
never through a chained selection (`df[df.a > 0]["b"] = …` changes nothing in pandas 3).

## Load

```python
import pandas as pd

df = pd.read_csv("sales.csv")                                        # UTF-8 with commas
df = pd.read_csv("export.csv", sep=";", decimal=",", thousands=".",  # a European export
                 encoding="cp1252")
df = pd.read_excel("book.xlsx", sheet_name="Sales")                  # one sheet (sheet_name=None: all)
df = pd.read_csv("big.csv", usecols=["date", "region", "amount"])    # only the columns needed
raw = df.copy()                                                      # keep the original untouched
```

Read everything as text first when the file is messy, then convert column by column:
`pd.read_csv(path, dtype=str, keep_default_na=False)`.

A row with more fields than the header stops `read_csv` ("Expected 6 fields in line 64, saw 7"):
usually a separator inside a value that was not quoted. Look at that line, fix the file if you can,
or add `on_bad_lines="warn"` to skip such rows with a warning naming each one, and report how many
went.

## Look

```python
print(df.shape)
print(df.dtypes)
print(df.head(10))
print(df.sample(10, random_state=1))
print(df.describe(include="all").T)
print(df["region"].value_counts(dropna=False))
print(df.isna().sum())
print(df.duplicated().sum(), "duplicate rows;", df["order_id"].duplicated().sum(), "repeated ids")
```

## Clean

```python
import re

df.columns = [re.sub(r"\s+", "_", c.strip().lower()) for c in df.columns]

def to_number(col, decimal="."):
    """'€1.234,56', '(45.00)', '12-', '12%', '$1,234.50' → numbers; what does not convert becomes NaN."""
    s = col.astype("string").str.strip()
    neg = (s.str.match(r"^\(.*\)$") | s.str.endswith("-")).fillna(False)
    pct = s.str.endswith("%").fillna(False)
    s = s.str.replace(r"[^\d,.\-]", "", regex=True).str.replace(r"-$", "", regex=True)
    if decimal == ",":
        s = s.str.replace(".", "", regex=False).str.replace(",", ".", regex=False)
    else:
        s = s.str.replace(",", "", regex=False)
    n = pd.to_numeric(s, errors="coerce").astype("float64")
    n = n.where(~neg, -n.abs())
    return n.where(~pct, n / 100)

df["amount"] = to_number(df["amount"])
bad = raw.loc[df["amount"].isna() & raw["amount"].notna(), "amount"]
print(len(bad), "amounts did not convert:", bad.unique()[:10])     # look before going on

# Dates: say the format, so 03/04 is never guessed
df["date"] = pd.to_datetime(df["date"], format="%d.%m.%Y", errors="coerce")
# Several formats in one column, all day-first:
df["date"] = pd.to_datetime(df["date"], format="mixed", dayfirst=True, errors="coerce")

# One label for one thing
df["country"] = df["country"].str.strip().str.rstrip(".").str.title()
df["country"] = df["country"].replace({"Uk": "United Kingdom", "U.K": "United Kingdom"})

# Duplicates: look, then drop, and count what went
print(df[df.duplicated(keep=False)].sort_values(list(df.columns)).head(20))
before = len(df)
df = df.drop_duplicates()
print(before - len(df), "exact duplicate rows removed")

# Rows that are not data (a Total line, notes under the table)
df = df[~df["date"].isna()]
```

Log every step in plain words ("removed 14 duplicate rows from the overlapping March exports"):
the log becomes the caveats of the report.

## Analyse

```python
# Totals by group, biggest first
by_region = (df.groupby("region")["amount"]
               .agg(["count", "sum", "mean", "median"])
               .sort_values("sum", ascending=False))

# A pivot table: months down, regions across, with totals
df["month"] = df["date"].dt.to_period("M")
pivot = pd.pivot_table(df, index="month", columns="region", values="amount",
                       aggfunc="sum", fill_value=0, margins=True, margins_name="Total")

# Over time
monthly = df.set_index("date")["amount"].resample("MS").sum()     # by calendar month
change = monthly.pct_change()                                     # against the month before
yoy = monthly.pct_change(12)                                      # against the same month last year

# Shares of the whole
share = df.groupby("product")["amount"].sum()
share = (share / share.sum()).sort_values(ascending=False)

# A join that says what did not match
merged = orders.merge(customers, on="customer_id", how="left",
                      validate="many_to_one", indicator=True)
print(merged["_merge"].value_counts())   # left_only: orders with no known customer
```

`validate` stops the join when the keys are not what you think (a customer listed twice would
otherwise double those orders silently).

## Check

```python
total = df["amount"].sum()
assert abs(by_region["sum"].sum() - total) < 0.01, "regions do not add up to the total"
assert abs(pivot.loc["Total", "Total"] - total) < 0.01
# Against a figure from outside the data, e.g. the statement's total:
print(f"{total:,.2f} here against 1,271,517.00 on the statement")
```

## Charts

```python
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.ticker import StrMethodFormatter

fig, ax = plt.subplots(figsize=(8, 4.5))
monthly.plot(ax=ax, color="#1d4ed8", linewidth=2)
ax.set_title("Sales rose 18% from January to June", loc="left")    # the finding, not "Sales"
ax.set_ylabel("Sales (€)")
ax.set_xlabel("")
ax.yaxis.set_major_formatter(StrMethodFormatter("{x:,.0f}"))
ax.set_ylim(bottom=0)
ax.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig.savefig("sales-by-month.png", dpi=150)

# Sorted bars, the one that matters in colour, the rest grey
s = df.groupby("product")["amount"].sum().sort_values()
colours = ["#b8bcc2"] * (len(s) - 1) + ["#1d4ed8"]
fig, ax = plt.subplots(figsize=(8, 0.45 * len(s) + 1))
s.plot.barh(ax=ax, color=colours)
for i, v in enumerate(s):
    ax.text(v, i, f" {v:,.0f}", va="center")
ax.set_title("Coffee brings in the most", loc="left")
ax.set_xlabel("Sales (€)")
ax.set_ylabel("")
ax.xaxis.set_major_formatter(StrMethodFormatter("{x:,.0f}"))
ax.margins(x=0.15)                       # room for the labels at the ends of the bars
ax.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
fig.savefig("sales-by-product.png", dpi=150)
```

Look at each PNG before handing it over: labels cut off, overlapping text, a wrong title.

## Save what you made

```python
df.to_csv("sales-clean.csv", index=False)
with pd.ExcelWriter("analysis.xlsx") as xw:
    df.to_excel(xw, sheet_name="Clean data", index=False)
    by_region.to_excel(xw, sheet_name="By region")
    pivot.to_excel(xw, sheet_name="By month")
```

Months made with `to_period("M")` arrive in Excel as text ("2026-01"); dates stay dates. For a
workbook the person will keep working in, with formulas, formats and charts, use the spreadsheets
skill or `save_sheet` instead of a plain export.
