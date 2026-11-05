#!/usr/bin/env python3
"""Turn a Python script with # %% cell markers into a Jupyter notebook.

    nb-python py_to_notebook.py draft.py analysis.ipynb

`# %%` starts a code cell and `# %% [markdown]` a text cell, whose lines are comments ("# " is taken off each).
Anything after `%%` other than `[markdown]` is a title for you and is left out. Text before the first marker
becomes a code cell; blank lines at the ends of a cell are dropped. The notebook has no outputs yet: run it with
run_notebook.py.
"""
import re
import sys
from pathlib import Path

try:
    import nbformat
    from nbformat.v4 import new_code_cell, new_markdown_cell, new_notebook
except ImportError:
    sys.exit("This needs nbformat: run it with this skill's scripts/nb-python.")

MARK = re.compile(r"^#\s?%%(.*)$")


def cells_of(text: str):
    cells, kind, lines = [], "code", []

    def close():
        body = "\n".join(lines).strip("\n")
        if body.strip():
            cells.append(new_markdown_cell(body) if kind == "markdown" else new_code_cell(body))

    for line in text.splitlines():
        m = MARK.match(line)
        if m:
            close()
            kind, lines = ("markdown" if re.search(r"\[(markdown|md)\]", m.group(1)) else "code"), []
        elif kind == "markdown":
            lines.append(re.sub(r"^#\s?", "", line))
        else:
            lines.append(line)
    close()
    return cells


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    cells = cells_of(src.read_text(encoding="utf-8"))
    nb = new_notebook(
        cells=cells,
        metadata={
            "kernelspec": {"display_name": "Python 3 (ipykernel)", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
        },
    )
    nbformat.validate(nb)
    nbformat.write(nb, str(dst))
    text = sum(1 for c in cells if c.cell_type == "markdown")
    print(f"Wrote {dst}: {len(cells)} cells, {text} text and {len(cells) - text} code")


if __name__ == "__main__":
    main()
