# SQLite databases

Gives every agent six tools for SQLite files (`.db`, `.sqlite`, `.sqlite3`):

| Tool | What it does |
| --- | --- |
| `sqlite_tables` | The tables and views, with each table's row count |
| `sqlite_schema` | How a table is defined: columns, keys, indexes, foreign keys |
| `sqlite_query` | Runs a query that only reads; the file is opened read-only |
| `sqlite_execute` | Changes data or tables, in one transaction (all or nothing) |
| `sqlite_import_csv` | Loads a CSV file into a table |
| `sqlite_export_csv` | Writes a query's rows to a CSV file |

It needs only Python 3, with nothing to install. The skill `sqlite-databases` tells agents how to work
with a database carefully: look first, back up before changing, and check the result.
