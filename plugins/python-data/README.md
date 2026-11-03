# Python for data

Sets up a Python environment of its own (in the plugin's data folder, not your system's Python) with:

- **pandas** and **NumPy** for tables and numbers
- **SciPy** for statistics
- **Matplotlib** for charts
- **openpyxl** for Excel files, **PyArrow** for Parquet

Agents are told where its Python is, and the skill `python-data` shows them how to profile a table,
analyse it and chart it with this environment. Setting it up downloads about 150 MB of packages.
