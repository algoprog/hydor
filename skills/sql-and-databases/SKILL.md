---
name: sql-and-databases
description: Use when writing or fixing SQL, designing or changing a database schema, writing a migration, adding indexes, or touching live data in SQLite, PostgreSQL or MySQL.
category: data
triggers: [sql quer*, database migration*, schema migration*, schema change*, database schema, create index, explain analyze, postgres*, mysql, sqlite, foreign key*, deadlock*]
---

# SQL and databases

Databases hold the data people can least afford to lose. Understand the schema before writing a query,
pass values as parameters, check NULLs and joins against real rows, change live schemas in small
reversible steps, and take a backup before anything that cannot be undone.

## 1. Understand the schema first

- Find how the project reaches the database: an ORM (Prisma, Drizzle, SQLAlchemy, Django, ActiveRecord),
  a query builder (Knex, Kysely), or plain SQL; and how it migrates (`prisma migrate`, Alembic, Django,
  Rails, Knex, Flyway, golang-migrate). Use the project's way, not a parallel one.
- Look at the real tables, not only the models:
  - SQLite: `sqlite3 app.db ".tables"`, `sqlite3 app.db ".schema orders"`.
  - PostgreSQL: `psql "$DATABASE_URL" -c '\d orders'` (`\dt` tables, `\di` indexes).
  - MySQL: `SHOW CREATE TABLE orders;`, `SHOW INDEX FROM orders;`.
- Note keys, foreign keys, unique constraints, which columns allow NULL, types (money as integer cents
  or `numeric`, never floating point; times with a time zone), and row counts of the tables involved.
- Know which database you are connected to (development, staging, production). Read-only unless writing
  is the task.

## 2. Write queries that are safe and correct

- Values always as parameters: `$1` in node-postgres, `%s` in psycopg, `?` in SQLite and MySQL drivers,
  or the ORM's bound values. Never build SQL from input with concatenation, f-strings or template
  literals. Identifiers (a column to sort by, ASC or DESC) cannot be parameters: pick them from an
  allowlist.
- NULL traps:
  - `= NULL` is never true. Use `IS NULL` and `IS NOT NULL`.
  - `NOT IN (subquery)` returns no rows at all if the subquery yields a NULL. Use `NOT EXISTS`.
  - `COUNT(col)` skips NULLs, `COUNT(*)` counts rows; `SUM` over no rows is NULL (`COALESCE(SUM(x), 0)`).
  - Anything concatenated or compared with NULL gives NULL.
- Join traps:
  - A condition on the right-hand table of a `LEFT JOIN`, written in `WHERE`, turns it into an inner
    join. Put it in the `ON` clause.
  - Joining two one-to-many tables multiplies rows and inflates sums. Aggregate each in a subquery
    first, then join.
  - Compare row counts before and after each join on real data.
- Every selected column that is not aggregated belongs in `GROUP BY`; filter groups with `HAVING`.
- Pagination: `ORDER BY` something unique (add the id as a tiebreaker). For large tables, keyset
  pagination (`WHERE id > $1 ORDER BY id LIMIT 50`) rather than large offsets.
- Try a new query with a `LIMIT` on real data and check a few rows by hand.

## 3. Indexes and query plans

- Index the columns large tables are filtered, joined and sorted by. A composite index serves queries on
  its leading columns: `(customer_id, created_at)` serves `WHERE customer_id = ? ORDER BY created_at`.
- Read the plan: PostgreSQL `EXPLAIN (ANALYZE, BUFFERS) ...`, MySQL `EXPLAIN ANALYZE ...` (8.0.18+),
  SQLite `EXPLAIN QUERY PLAN ...`. Look for full scans of big tables (`Seq Scan`, `type: ALL`,
  `SCAN orders`) and estimates far from the actual row counts.
- `EXPLAIN ANALYZE` runs the statement: for writes, wrap it in `BEGIN; ... ROLLBACK;`.
- A function on the column hides it from a plain index: `WHERE lower(email) = ...` needs an index on
  `lower(email)`; `WHERE date(created_at) = ...` is better written as a range.
- Indexes cost writes and space: do not index everything, and drop ones never used.

## 4. Transactions and concurrency

- Writes that belong together go in one transaction. Keep transactions short: no network calls or
  waiting for a person inside them.
- Read-then-write races (check a balance, then update it): one atomic statement
  (`UPDATE accounts SET balance = balance - $1 WHERE id = $2 AND balance >= $1`), a row lock
  (`SELECT ... FOR UPDATE` in PostgreSQL and MySQL), or a unique constraint, and handle the conflict.
- Deadlocks: touch rows and tables in the same order everywhere, and retry the whole transaction when the
  database reports a deadlock or serialisation failure.
- Defaults differ: PostgreSQL uses READ COMMITTED, MySQL InnoDB REPEATABLE READ, and SQLite allows one
  writer at a time (set a busy timeout; WAL mode lets readers continue during a write).

## 5. Change schemas safely on live data

Never one big change that breaks the running app. Expand, migrate, contract:

1. **Expand:** add the new column or table without blocking: nullable, or with a constant default. In
   PostgreSQL create indexes with `CREATE INDEX CONCURRENTLY` (outside a transaction).
2. **Backfill** existing rows in batches (a few thousand per transaction, by primary-key range), written
   so it can stop and resume.
3. **Switch:** deploy code that writes both and reads the new; then code that only uses the new.
4. **Contract:** once nothing uses the old column (check), drop it in a later release.

- Renames and type changes on live tables follow the same pattern (add, copy, switch, drop), never in place.
- PostgreSQL, large tables: add constraints as `NOT VALID`, then `VALIDATE CONSTRAINT` separately; set
  `SET lock_timeout = '5s'` before DDL so it fails fast instead of queueing every query behind it.
- Every migration gets a tested way back (up, down, up again on a copy), or a written reason why not.
  Dropping data cannot be undone by a down migration: back up first.
- Worked examples in `references/migrations.md`; database differences in `references/dialects.md`.

## 6. Back up before risky changes

Before a migration on real data, a bulk UPDATE or DELETE, or a manual fix:

- SQLite: `sqlite3 app.db ".backup 'app-before.db'"`, or `VACUUM INTO 'app-before.db'`. Not `cp` while
  the app is writing (the WAL file holds recent changes).
- PostgreSQL: `pg_dump -Fc -f before.dump "$DATABASE_URL"`; restore with `pg_restore -d <database> before.dump`.
- MySQL: `mysqldump --single-transaction --routines --triggers <database> > before.sql`.
- Check that the backup opens and has the rows, and say where it is.
- Manual fixes: `BEGIN;`, run the change with a WHERE you first ran as a SELECT, compare the affected
  row count with what you expect, then `COMMIT`, or `ROLLBACK` if anything differs.
- Production: ask before any write, and before heavy reads that could slow everyone down.

## 7. Differences that bite

| | SQLite | PostgreSQL | MySQL (InnoDB) |
| --- | --- | --- | --- |
| Types | Loose (any value fits) unless `STRICT` tables | Strict | Strict in the default SQL mode |
| Foreign keys | Off until `PRAGMA foreign_keys = ON`, per connection | Enforced | Enforced |
| Upsert | `ON CONFLICT (k) DO UPDATE SET v = excluded.v` | Same | `ON DUPLICATE KEY UPDATE` |
| `RETURNING` | 3.35 and later | Yes | No |
| DDL inside a transaction | Yes | Yes (except `CONCURRENTLY`) | No: each DDL statement commits |
| NULLs in ascending order | First | Last | First |
| `'a' = 'A'` | False | False | True with the default collations |
| Quoting names | "double quotes" | "double quotes"; unquoted names fold to lower case | `backticks` |

## Pitfalls

- An UPDATE or DELETE without a WHERE, or with one not first tried as a SELECT.
- SQL built from strings.
- Running a migration on production before a copy.
- A long ALTER or backfill holding locks while the app waits.
- Floating point for money; timestamps without time zones.
- Trusting the ORM's SQL without looking at it (turn on query logging).
