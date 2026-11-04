---
name: python-data
description: Use when analysing a table (CSV, Excel, Parquet) or making charts with Python while the Python for data plugin is on (its environment already has pandas, NumPy, SciPy, Matplotlib, openpyxl and PyArrow).
category: data
triggers: [pandas, analyse this csv, analyze this csv, plot the data, chart from the data]
---

# Python for data

This plugin's Python is `${PLUGIN_DATA}/venv/bin/python`. It has pandas, NumPy, SciPy, Matplotlib,
openpyxl and PyArrow. Use it for every step below instead of installing packages into the user's
own Python. For the method of an analysis (the question first, checks, honest caveats), follow the
data-analysis skill too when it is there.

## 1. Profile the table first

```bash
"${PLUGIN_DATA}/venv/bin/python" "${PLUGIN_ROOT}/skills/python-data/scripts/profile_table.py" data.csv
```

It prints the size, each column's type, gaps, unique values and range, duplicate rows and the first
rows. Options: `--sheet NAME` for an Excel sheet, `--sep ';'` when it guesses the separator wrong.
Read it before writing analysis code: wrong types (numbers read as text, dates as text) and gaps
change every answer.

## 2. Analyse in a script, not in your head

- Write a short script to a file (`analysis.py`) and run it with the plugin's Python, so the work can
  be read and run again. Print the numbers you will report.
- Fix types explicitly: `pd.to_datetime(df["date"], errors="coerce")`, `pd.to_numeric(..., errors="coerce")`,
  then count what became missing.
- Check every result a second way: totals against the raw sum, counts against `len(df)`, a group's
  figure against a filter of that group.

## 3. Charts that answer the question

- Matplotlib with the `Agg` backend (no window): `import matplotlib; matplotlib.use("Agg")`.
- One message per chart; label both axes with units; start bars at zero; date axes in order.
- Save as PNG at `dpi=150` (and SVG when the user will edit it), then look at the image before
  handing it over.

## 4. Hand over

Put results where the user can use them: a CSV or Excel file (openpyxl), the charts, and a short
summary with the numbers and their caveats. Name the files you made.

## Pitfalls

- Using another Python (the system's, or a project's venv) and installing pandas again.
- Reading European CSVs with commas as decimal marks: use `decimal=","` and `sep=";"`.
- Averages of averages; percentages of different bases added together.
- Dropping rows with gaps without saying how many.
