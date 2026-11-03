---
name: sqlite-databases
description: Use when a task involves a SQLite database file (.db, .sqlite, .sqlite3): finding what is in it, answering questions from it, fixing or changing its data, or loading a CSV into one.
category: data
triggers: [sqlite, ".db file", database file, query the database]
---

# SQLite databases

The SQLite plugin gives you tools for these files: `sqlite_tables`, `sqlite_schema`, `sqlite_query`,
`sqlite_execute`, `sqlite_import_csv` and `sqlite_export_csv`. They take full paths (from `/`), since they
do not run in your working folder.

## 1. Look before anything else

1. `sqlite_tables` to see what is there and how big each table is.
2. `sqlite_schema` for the tables that matter: column names, types, primary and foreign keys.
3. A few rows of each with `sqlite_query` (`SELECT * FROM t LIMIT 5`) to see what the values really
   look like: dates as text or numbers, empty strings or NULL, ids as text.

## 2. Answer questions with queries that only read

- `sqlite_query` opens the file read-only, so it cannot change anything. Pass values with `?` and
  `params` rather than pasting them into the SQL.
- Count before you trust a join: compare `count(*)` before and after, to catch rows that multiply or
  disappear.
- NULL is not equal to anything, itself included: use `IS NULL`, and `coalesce()` in totals.
- When there are more rows than you asked for, the answer says `more: true`. Aggregate in SQL
  (`GROUP BY`, `sum`, `avg`) rather than reading thousands of rows.
- For big results, `sqlite_export_csv` writes them to a file the user can open.

## 3. Change data carefully

1. Say what will change and how many rows (count them first with the same `WHERE`), and ask the
   user unless they asked for exactly this change.
2. Back up the file first: copy it next to itself (`shop.db` to `shop.backup-2026-11-03.db`).
3. Run the change with `sqlite_execute`. A script of several statements runs as one transaction:
   if one fails, none of them happen.
4. Check the result with a query, and report the rows changed and where the backup is.

## 4. CSV in and out

- `sqlite_import_csv` makes the table from the header row when it is missing; numbers become INTEGER
  or REAL, the rest TEXT. Check the counts after: rows in the file minus the header.
- `sqlite_export_csv` writes any read-only query's rows with a header row.

## Pitfalls

- Relative paths: always give the full path.
- Changing data the user only asked you to look at.
- Trusting a column's declared type: SQLite stores what it is given. Check with `typeof(col)`.
- Deleting or updating without first running the same `WHERE` as a `SELECT count(*)`.
