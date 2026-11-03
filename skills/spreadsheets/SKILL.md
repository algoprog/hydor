---
name: spreadsheets
description: Use when the user wants an Excel file (.xlsx) made or changed from code (a budget, tracker, schedule, invoice, data table, anything with rows, totals or charts), or an .xlsx, .xls, .ods or .csv read, cleaned up or analysed. For a new spreadsheet to edit in the app, make it with save_sheet instead.
category: documents
---

# Spreadsheets

First, the app's own spreadsheets: for a new one, make it with the `save_sheet` tool (hydor),
with its formulas. It shows in the conversation, the user edits it in Pages (as in Excel or Google
Sheets), and `export_page` writes it as an .xlsx, CSV or PDF file to hand over with `present_files`.
Use this skill for what those lack (charts, conditional formatting, pivot tables, data validation, the
user's own template), for a workbook of the user's own, or when they ask for a file made this way.

You build the workbook with **openpyxl** in a short Python script and hand it over as a file. The
scripts in `scripts/` (next to this file):

- `scripts/office-python` runs Python with openpyxl (and python-docx, python-pptx, reportlab, pypdf),
  installed once into a private environment in the app's data folder. If it says Python or its venv
  module is missing, tell the user the one command it gives.
- `scripts/check_xlsx.py` checks a workbook: sheets, formulas, references to sheets that do not
  exist, and, where LibreOffice is installed, what each formula comes to, listing any error
  (`#REF!`, `#DIV/0!`, `#NAME?`…). Run it as `scripts/office-python scripts/check_xlsx.py file.xlsx`.
- `scripts/render-pages FILE` shows the sheets as printed pages (PNG), to look at (needs LibreOffice).

## Reading one

Use the `read_document` tool (hydor): every sheet comes as a table with its row numbers and
column letters, numbers as formatted, and some formulas. Big sheets show their first rows; for the
whole of a big one, load it in Python: `load_workbook(path, read_only=True, data_only=True)` gives
the values as last calculated (`data_only=False` gives the formulas). CSV: the `csv` module.

## Making one

1. **Plan** the sheets: one table per sheet, a header row, one column per field, one kind of value
   per column (dates as dates, money as numbers with a money format, never as text).
2. **Write the script** and run it with `<this folder>/scripts/office-python make_budget.py`:
   - inputs as values, results as **formulas** (`ws["D5"] = "=SUM(D2:D4)"`), so the user can change
     a number and see the rest follow;
   - number formats: `'"€"#,##0.00'`, `'0.0%'`, `'yyyy-mm-dd'`, `'#,##0'`;
   - a bold header with a fill, `ws.freeze_panes = "A2"`, column widths
     (`ws.column_dimensions["A"].width = 18`), `ws.auto_filter.ref = ws.dimensions` for lists;
   - charts with `openpyxl.chart` (BarChart, LineChart, PieChart) placed beside the data;
   - `wb.calculation.fullCalcOnLoad = True`, so every program calculates on opening.
3. **Check it**: `scripts/office-python scripts/check_xlsx.py budget.xlsx`. openpyxl does not
   calculate formulas; Excel, LibreOffice and Google Sheets do when the file opens. With LibreOffice
   installed the check works them out and lists errors: fix those. `scripts/render-pages` shows how
   it prints.
4. **Hand it over** with `present_files` and a short caption; in your reply, a sentence on what is
   in it.

```python
from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.styles import Font, PatternFill

wb = Workbook()
ws = wb.active
ws.title = "Budget"
ws.append(["Month", "Income", "Spending", "Saved"])
for i, (m, inc, out) in enumerate([("Jan", 3200, 2650), ("Feb", 3200, 2900)], start=2):
    ws.append([m, inc, out, f"=B{i}-C{i}"])
ws.append(["Total", "=SUM(B2:B3)", "=SUM(C2:C3)", "=SUM(D2:D3)"])
for c in ws[1]:
    c.font = Font(bold=True, color="FFFFFF")
    c.fill = PatternFill("solid", fgColor="1F4E79")
for row in ws.iter_rows(min_row=2, min_col=2, max_col=4):
    for c in row:
        c.number_format = '"€"#,##0'
ws.freeze_panes = "A2"
chart = BarChart()
chart.title = "Saved per month"
chart.add_data(Reference(ws, min_col=4, min_row=1, max_row=3), titles_from_data=True)
chart.set_categories(Reference(ws, min_col=1, min_row=2, max_row=3))
ws.add_chart(chart, "F2")
wb.calculation.fullCalcOnLoad = True
wb.save("budget.xlsx")
```

## Changing one

`load_workbook("theirs.xlsx")` keeps formulas, styles and most of the layout (not pivot tables, and
charts only when you rebuild them). Save under a new name unless told otherwise. `.xls` and `.ods`:
convert first with `soffice --headless --convert-to xlsx file.xls`. To hand back a CSV instead, write
it with the `csv` module (UTF-8, with a header row).
