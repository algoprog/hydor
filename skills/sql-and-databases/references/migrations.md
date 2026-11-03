# Migrations on live data: worked examples

The pattern is always the same: expand (add without breaking), migrate (backfill, then switch the
code), contract (remove the old). Each step is its own migration and, where it involves code, its own
deploy. PostgreSQL syntax unless noted; the ideas carry over.

## Add a required column

Goal: `orders.currency`, NOT NULL, default 'EUR'.

```sql
-- 1. Expand: a constant default is a metadata-only change in PostgreSQL 11+ (no table rewrite).
SET lock_timeout = '5s';
ALTER TABLE orders ADD COLUMN currency text DEFAULT 'EUR';

-- 2. Backfill rows that existed before (only needed if they should not get the default),
--    in batches, resumable:
UPDATE orders SET currency = 'GBP'
WHERE id BETWEEN 1 AND 10000 AND country = 'GB' AND currency = 'EUR';
-- ...next range, until done; pause briefly between batches on a busy database.

-- 3. Enforce NOT NULL without a long lock: a CHECK constraint validated separately,
--    which SET NOT NULL then uses instead of scanning the table (PostgreSQL 12+).
ALTER TABLE orders ADD CONSTRAINT orders_currency_not_null CHECK (currency IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_currency_not_null;
ALTER TABLE orders ALTER COLUMN currency SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_currency_not_null;
```

Down: `ALTER TABLE orders DROP COLUMN currency;` (loses the values: back up first if they matter).

## Rename a column without downtime

Goal: `users.name` becomes `users.full_name`.

1. Add `full_name` (nullable).
2. Deploy code that writes both columns and still reads `name`.
3. Backfill: `UPDATE users SET full_name = name WHERE full_name IS NULL AND id BETWEEN ...` in batches.
4. Deploy code that reads `full_name` (and still writes both, so a rollback is safe).
5. Deploy code that stops writing `name`.
6. Later, after checking nothing reads it (logs, other services, reports): drop `name`.

A rename in place (`ALTER TABLE ... RENAME COLUMN`) is instant, but every running copy of the old code
breaks at that moment. It is fine only when the app is stopped during the change, or the column is new
and unused.

## Change a column's type

Goal: `amount` from `float` to `numeric(12,2)`.

Same as a rename: add `amount_new numeric(12,2)`, write both, backfill with
`amount_new = round(amount::numeric, 2)`, compare (`SELECT count(*) FROM t WHERE amount_new <> round(amount::numeric, 2)`),
switch reads, stop writing the old, drop it. An in-place `ALTER COLUMN ... TYPE` rewrites the table under
an exclusive lock in PostgreSQL, and usually copies the table in MySQL.

## Add an index to a big table

```sql
-- PostgreSQL: does not block writes; cannot run inside a transaction block.
CREATE INDEX CONCURRENTLY IF NOT EXISTS orders_customer_created_idx ON orders (customer_id, created_at);
-- If it fails, it leaves an INVALID index: drop it and try again.
--   SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
--   DROP INDEX CONCURRENTLY orders_customer_created_idx;
```

```sql
-- MySQL 8 (InnoDB): online, reads and writes continue.
ALTER TABLE orders ADD INDEX orders_customer_created_idx (customer_id, created_at), ALGORITHM=INPLACE, LOCK=NONE;
```

Migration tools often wrap every migration in a transaction: mark this one as non-transactional (for
example `disable_ddl_transaction!` in Rails, `atomic = False` in Django, a separate file with no
transaction in others).

## Add a foreign key to existing data

```sql
-- Find orphans first:
SELECT count(*) FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
WHERE o.customer_id IS NOT NULL AND c.id IS NULL;
-- Fix or remove them (with a backup), then:
ALTER TABLE orders ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers (id) NOT VALID;   -- quick, new rows checked from now on
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_fk;         -- checks old rows without blocking writes
```

## Backfill in batches (a script)

```python
# Resumable: each batch commits on its own; rerunning skips finished rows.
import time
import psycopg

with psycopg.connect(DATABASE_URL, autocommit=True) as conn:
    (last_id,) = conn.execute("SELECT coalesce(max(id), 0) FROM orders").fetchone()
    start, size = 0, 5000
    while start <= last_id:
        cur = conn.execute(
            "UPDATE orders SET currency = 'GBP' "
            "WHERE id > %s AND id <= %s AND country = 'GB' AND currency = 'EUR'",
            (start, start + size),
        )
        print(f"ids {start + 1}-{start + size}: {cur.rowcount} rows")
        start += size
        time.sleep(0.1)  # let other traffic through on a busy database
```

## SQLite: changes ALTER TABLE cannot make

```sql
PRAGMA foreign_keys = OFF;
BEGIN;
CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0)
);
INSERT INTO orders_new (id, customer_id, total_cents)
  SELECT id, customer_id, CAST(round(total * 100) AS INTEGER) FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;
-- recreate indexes, triggers and views that referred to orders
PRAGMA foreign_key_check;
COMMIT;
PRAGMA foreign_keys = ON;
```

Back up the file first (`.backup` or `VACUUM INTO`), and stop the app's writers while this runs.

## Before running any of these on production

- [ ] Tried on a copy of production data (or a realistic size), with timings.
- [ ] Backup taken and checked.
- [ ] Lock timeout set, and the time of lowest traffic chosen for the risky step.
- [ ] Down migration written and tried, or the reason it cannot exist written down.
- [ ] The code deployed at each step works with both the old and the new schema.
- [ ] The user said yes.
