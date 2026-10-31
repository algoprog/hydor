"""Checks a workbook before you hand it over: its sheets, their formulas, references to sheets that
do not exist, and (where LibreOffice is installed) what every formula calculates to, listing those
that come out as errors (#REF!, #DIV/0!, #NAME?, #VALUE!…).

    office-python check_xlsx.py budget.xlsx
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

from openpyxl import load_workbook

ERRORS = ("#REF!", "#DIV/0!", "#NAME?", "#VALUE!", "#N/A", "#NUM!", "#NULL!", "Err:")


def soffice():
    for c in ("soffice", "libreoffice"):
        p = shutil.which(c)
        if p:
            return p
    mac = "/Applications/LibreOffice.app/Contents/MacOS/soffice"
    return mac if os.path.exists(mac) else None


def recalculated(path):
    """A copy of the workbook as LibreOffice saves it, with every formula worked out."""
    office = soffice()
    if not office:
        return None
    tmp = tempfile.mkdtemp()
    src = os.path.join(tmp, "in" + os.path.splitext(path)[1])
    shutil.copy(path, src)
    out = os.path.join(tmp, "out")
    subprocess.run([office, f"-env:UserInstallation=file://{tmp}/profile", "--headless", "--norestore", "--convert-to", "xlsx", "--outdir", out, src], capture_output=True, timeout=180)
    made = os.path.join(out, "in.xlsx")
    return made if os.path.exists(made) else None


def main(path):
    wb = load_workbook(path)
    names = set(wb.sheetnames)
    formulas = {}
    problems = []
    for ws in wb.worksheets:
        n = 0
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    n += 1
                    formulas[(ws.title, c.coordinate)] = c.value
                    for ref in re.findall(r"(?:'([^']+)'|([A-Za-z_][\w.]*))!", c.value):
                        sheet = ref[0] or ref[1]
                        if sheet not in names:
                            problems.append(f"{ws.title}!{c.coordinate} {c.value}: there is no sheet named “{sheet}”")
        state = "" if ws.sheet_state == "visible" else f" ({ws.sheet_state})"
        print(f"Sheet “{ws.title}”{state}: {ws.max_row} rows × {ws.max_column} columns, {n} formulas, used range {ws.dimensions}")
    if not formulas:
        print("No formulas.")
    made = recalculated(path) if formulas else None
    if made:
        values = load_workbook(made, data_only=True)
        shown = fine = 0
        for (sheet, cell), f in formulas.items():
            v = values[sheet][cell].value if sheet in values.sheetnames else None
            if isinstance(v, str) and v.startswith(ERRORS):
                problems.append(f"{sheet}!{cell} {f} → {v}")
                continue
            fine += 1
            if shown < 25:
                print(f"  {sheet}!{cell} {f} → {v}")
                shown += 1
        if fine > shown:
            print(f"  … and {fine - shown} more that work out")
        shutil.rmtree(os.path.dirname(os.path.dirname(made)), ignore_errors=True)
    elif formulas:
        print("LibreOffice is not installed here, so the formulas were not worked out: Excel, LibreOffice and Google Sheets calculate them when the file is opened.")
        for (sheet, cell), f in list(formulas.items())[:25]:
            print(f"  {sheet}!{cell} {f}")
    if problems:
        print("\nProblems:")
        for p in problems:
            print(f"  {p}")
        sys.exit(1)
    print("\nNo problems found.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: office-python check_xlsx.py WORKBOOK.xlsx")
    main(sys.argv[1])
