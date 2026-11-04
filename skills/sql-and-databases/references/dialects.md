# SQLite, PostgreSQL and MySQL: the differences that matter

Checked against SQLite 3.51, PostgreSQL 16 tools and the MySQL 8 manual. Versions in brackets are when a
feature arrived.

## Connecting and looking around

| | SQLite | PostgreSQL | MySQL |
| --- | --- | --- | --- |
| Shell | `sqlite3 app.db` | `psql "$DATABASE_URL"` | `mysql -u user -p dbname` |
| List tables | `.tables` | `\dt` | `SHOW TABLES;` |
| Describe a table | `.schema orders` | `\d orders` | `SHOW CREATE TABLE orders;` |
| Indexes | `.indexes orders` | `\di` or `\d orders` | `SHOW INDEX FROM orders;` |
| Plan | `EXPLAIN QUERY PLAN ...` | `EXPLAIN (ANALYZE, BUFFERS) ...` | `EXPLAIN ANALYZE ...` [8.0.18] |
| Placeholders (common drivers) | `?`, `:name` | `$1` (node-postgres), `%s` (psycopg) | `?` (mysql2), `%s` (PyMySQL, mysqlclient) |

## Types and values

- **SQLite** stores any value in any column (type affinity) unless the table is `STRICT` [3.37]. There
  is no boolean (0 and 1) and no date type (store ISO-8601 text or Unix seconds; use `datetime()`,
  `strftime()`). `INTEGER PRIMARY KEY` is the row id; `AUTOINCREMENT` only stops ids being reused.
- **PostgreSQL** is strict. Use `timestamptz` for moments in time, `numeric` or integer cents for money,
  `text` rather than `varchar(n)` unless a limit is a rule, `jsonb` for JSON, identity columns
  (`GENERATED ALWAYS AS IDENTITY`) or `bigserial` for ids.
- **MySQL**: use `utf8mb4` (its `utf8` is a 3-byte subset that cannot store emoji), `DECIMAL` for money,
  `DATETIME` for stored times (`TIMESTAMP` converts to UTC and ends in 2038), `BIGINT UNSIGNED
  AUTO_INCREMENT` ids. The default collations compare case- and accent-insensitively, which also applies
  to unique indexes: `a@x.com` and `A@x.com` collide.

## Text

| | SQLite | PostgreSQL | MySQL |
| --- | --- | --- | --- |
| Concatenate | `a || b` | `a || b` | `CONCAT(a, b)` (`||` means OR by default) |
| Case-insensitive match | `LIKE` (ASCII only), or `COLLATE NOCASE` | `ILIKE`, or `lower(x) = lower(y)` with an expression index, or `citext` | `=` and `LIKE` already, with the default `_ci` collations |
| String literals | 'single quotes' (double quotes are for names) | 'single quotes' | 'single quotes' |
| Quote a name | "name" | "name"; unquoted names are folded to lower case | `name` with backticks |

## Writing

| | SQLite | PostgreSQL | MySQL |
| --- | --- | --- | --- |
| Upsert | `INSERT ... ON CONFLICT (k) DO UPDATE SET v = excluded.v` [3.24] | same | `INSERT ... AS new ON DUPLICATE KEY UPDATE v = new.v` [8.0.19] |
| Return written rows | `RETURNING` [3.35] | `RETURNING` | not available; use `LAST_INSERT_ID()` |
| Insert many rows | multi-row `VALUES` | multi-row `VALUES`, `COPY` for bulk loads | multi-row `VALUES`, `LOAD DATA` |
| Foreign keys enforced | only after `PRAGMA foreign_keys = ON;` on each connection | always | always (InnoDB) |

## Sorting and NULLs

- Ascending order puts NULLs first in SQLite and MySQL, last in PostgreSQL.
- PostgreSQL and SQLite [3.30] accept `NULLS FIRST` and `NULLS LAST`; MySQL does not (sort on
  `x IS NULL` first).
- Unique constraints allow many NULLs in all three. PostgreSQL 15 can refuse duplicate NULLs with
  `UNIQUE NULLS NOT DISTINCT`.

## Transactions, locking and DDL

| | SQLite | PostgreSQL | MySQL (InnoDB) |
| --- | --- | --- | --- |
| Default isolation | Serialised writers | READ COMMITTED | REPEATABLE READ (with gap locks) |
| Concurrent writers | One at a time; `PRAGMA busy_timeout = 5000;` and `PRAGMA journal_mode = WAL;` help | Many (row locks) | Many (row locks) |
| DDL in a transaction | Yes | Yes, except `CREATE INDEX CONCURRENTLY` and a few others | No: DDL commits implicitly |
| Add a column | Fast | Fast, even with a constant default [11] | Fast with `ALGORITHM=INSTANT` [8.0.12] |
| Build an index without blocking writes | Not possible (it locks the database; usually fine on small files) | `CREATE INDEX CONCURRENTLY` | Online DDL: `ALGORITHM=INPLACE, LOCK=NONE` |
| Change a column's type | Recreate the table | Rewrites the table for most changes (blocks) | Usually rewrites the table (`ALGORITHM=COPY`) |

SQLite's `ALTER TABLE` can add, rename [3.25] and drop [3.35] columns, but not change a column's type or
constraints: create a new table, copy, drop the old one and rename, inside a transaction, with foreign
keys turned off for the copy (the "12-step" procedure in SQLite's documentation).

## Dates and times

| | SQLite | PostgreSQL | MySQL |
| --- | --- | --- | --- |
| Now | `datetime('now')` (UTC text) | `now()` (timestamptz) | `NOW()` (session time zone), `UTC_TIMESTAMP()` |
| Truncate to day | `date(ts)` | `date_trunc('day', ts)` | `DATE(ts)` |
| Add an interval | `datetime(ts, '+7 days')` | `ts + interval '7 days'` | `ts + INTERVAL 7 DAY` |

Store moments in UTC; convert to the user's time zone only for display.

## Finding index problems (PostgreSQL)

```sql
-- Indexes no query has used (unique ones left out: they enforce rules even when nothing reads them)
SELECT s.relname AS table_name, s.indexrelname AS index_name,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0 AND NOT i.indisunique
ORDER BY pg_relation_size(s.indexrelid) DESC;

-- Tables that full scans read the most rows from: candidates for a missing index
SELECT relname AS table_name, seq_scan, seq_tup_read, idx_scan
FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 10;
```

- The counts cover this server only (a replica keeps its own) and run from the last reset
  (`SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();`, empty when never
  reset). Judge over weeks of normal use, including monthly jobs, before dropping anything.
- Drop with `DROP INDEX CONCURRENTLY name;` (outside a transaction), so writes go on meanwhile.

## Backups

| | Backup | Restore |
| --- | --- | --- |
| SQLite | `sqlite3 app.db ".backup 'copy.db'"` or `VACUUM INTO 'copy.db'` [3.27] | copy the file back while the app is stopped |
| PostgreSQL | `pg_dump -Fc -f db.dump "$DATABASE_URL"` (one database), `pg_dumpall` (roles too) | `pg_restore -d <database> db.dump` (`--clean --if-exists` to replace) |
| MySQL | `mysqldump --single-transaction --routines --triggers db > db.sql` | `mysql db < db.sql` |
