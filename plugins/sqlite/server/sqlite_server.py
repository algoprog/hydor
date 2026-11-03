"""SQLite tools for agents: look at a database, query it safely, change it, and move data in and out of CSV.

Reads open the file read-only (a query cannot change it, whatever it says); changes run in one
transaction each. Paths are full paths (~ works), since the server does not run in the agent's folder.
"""

import csv
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mcp_server import Server, ToolError  # noqa: E402

MAX_ROWS = 1000
server = Server(
    "sqlite",
    "1.0.0",
    instructions="SQLite tools. Give databases and CSV files as full paths. Look before you change: sqlite_tables, then sqlite_schema, then sqlite_query. sqlite_execute changes data; ask the user first unless they asked for the change.",
)


def full(path, must_exist=True):
    if not isinstance(path, str) or not path.strip():
        raise ToolError("Give the database's path.")
    p = os.path.expanduser(path.strip())
    if not os.path.isabs(p):
        raise ToolError(f"Give the full path (from /), not {path!r}: this tool does not run in your working folder.")
    if must_exist and not os.path.exists(p):
        raise ToolError(f"There is no file at {p}.")
    return p


def read_only(path):
    p = full(path)
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=10)
    con.execute("PRAGMA query_only = 1")
    return con


def writable(path, create=False):
    p = full(path, must_exist=not create)
    if create:
        os.makedirs(os.path.dirname(p) or ".", exist_ok=True)
    return sqlite3.connect(p, timeout=10)


def quote(name):
    return '"' + str(name).replace('"', '""') + '"'


@server.tool(
    "sqlite_tables",
    "List a SQLite database's tables and views, with how many rows each table has.",
    {"type": "object", "properties": {"database": {"type": "string", "description": "Full path to the .db / .sqlite file."}}, "required": ["database"]},
    read_only=True,
)
def tables(database):
    con = read_only(database)
    try:
        out = []
        for name, kind in con.execute("SELECT name, type FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name"):
            item = {"name": name, "type": kind}
            if kind == "table":
                item["rows"] = con.execute(f"SELECT count(*) FROM {quote(name)}").fetchone()[0]
            out.append(item)
        return {"database": full(database), "tables": out}
    finally:
        con.close()


@server.tool(
    "sqlite_schema",
    "Show how a table is defined (columns, types, keys, indexes, foreign keys), or every table's CREATE statement when no table is given.",
    {
        "type": "object",
        "properties": {"database": {"type": "string", "description": "Full path to the database."}, "table": {"type": "string", "description": "One table or view; leave out for all."}},
        "required": ["database"],
    },
    read_only=True,
)
def schema(database, table=None):
    con = read_only(database)
    try:
        if not table:
            rows = con.execute("SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name").fetchall()
            return "\n\n".join(f"-- {kind} {name}\n{sql};" for kind, name, sql in rows) or "The database is empty."
        found = con.execute("SELECT sql FROM sqlite_schema WHERE name = ?", (table,)).fetchone()
        if not found:
            raise ToolError(f"No table or view named {table!r}. Use sqlite_tables to see them.")
        cols = [
            {"name": c[1], "type": c[2], "not_null": bool(c[3]), "default": c[4], "primary_key": bool(c[5])}
            for c in con.execute(f"PRAGMA table_info({quote(table)})")
        ]
        indexes = [{"name": i[1], "unique": bool(i[2])} for i in con.execute(f"PRAGMA index_list({quote(table)})")]
        fks = [{"column": f[3], "references": f"{f[2]}({f[4]})"} for f in con.execute(f"PRAGMA foreign_key_list({quote(table)})")]
        return {"table": table, "create": found[0], "columns": cols, "indexes": indexes, "foreign_keys": fks}
    finally:
        con.close()


@server.tool(
    "sqlite_query",
    "Run a query that only reads (SELECT, WITH, PRAGMA, EXPLAIN QUERY PLAN) and get its rows. The database is opened read-only. Use ? placeholders with params for values.",
    {
        "type": "object",
        "properties": {
            "database": {"type": "string", "description": "Full path to the database."},
            "sql": {"type": "string", "description": "One statement."},
            "params": {"type": "array", "description": "Values for the ? placeholders, in order.", "items": {}},
            "limit": {"type": "integer", "description": f"Most rows to return (default 200, at most {MAX_ROWS}).", "minimum": 1, "maximum": MAX_ROWS},
        },
        "required": ["database", "sql"],
    },
    read_only=True,
)
def query(database, sql, params=None, limit=200):
    con = read_only(database)
    try:
        try:
            cur = con.execute(sql, params or [])
        except sqlite3.OperationalError as e:
            if "readonly" in str(e) or "query_only" in str(e):
                raise ToolError("That statement changes the database: use sqlite_execute for changes.")
            raise ToolError(f"SQLite: {e}")
        cols = [d[0] for d in cur.description or []]
        n = max(1, min(int(limit or 200), MAX_ROWS))
        rows = cur.fetchmany(n + 1)
        more = len(rows) > n
        return {"columns": cols, "rows": [list(r) for r in rows[:n]], "returned": min(len(rows), n), "more": more}
    finally:
        con.close()


@server.tool(
    "sqlite_execute",
    "Change a database: INSERT, UPDATE, DELETE, CREATE, ALTER, DROP. Runs in one transaction (all or nothing) and says how many rows changed. With create: true the database file is made when missing.",
    {
        "type": "object",
        "properties": {
            "database": {"type": "string", "description": "Full path to the database."},
            "sql": {"type": "string", "description": "One statement, or several separated by semicolons (then no params)."},
            "params": {"type": "array", "description": "Values for the ? placeholders of a single statement.", "items": {}},
            "create": {"type": "boolean", "description": "Make the database file if it does not exist."},
        },
        "required": ["database", "sql"],
    },
    destructive=True,
)
def execute(database, sql, params=None, create=False):
    con = writable(database, create=bool(create))
    con.isolation_level = None  # the transaction is ours: all or nothing
    try:
        before = con.total_changes
        con.execute("BEGIN")
        try:
            if params:
                con.execute(sql, params)
            else:
                for stmt in statements(sql):
                    con.execute(stmt)
            con.execute("COMMIT")
        except sqlite3.Error as e:
            if con.in_transaction:
                con.execute("ROLLBACK")
            raise ToolError(f"SQLite: {e} (nothing was changed)")
        return {"changed_rows": con.total_changes - before}
    finally:
        con.close()


def statements(sql):
    """The statements of a script, each ending where SQLite says one is complete (quotes and triggers kept whole)."""
    out, buf = [], ""
    for ch in sql:
        buf += ch
        if ch == ";" and sqlite3.complete_statement(buf):
            if buf.strip(" ;\n\t\r"):
                out.append(buf)
            buf = ""
    if buf.strip(" ;\n\t\r"):
        out.append(buf)
    return out


@server.tool(
    "sqlite_import_csv",
    "Load a CSV file into a table: its header row names the columns. The table is made when missing (all columns TEXT unless every value is a number). replace: true empties it first.",
    {
        "type": "object",
        "properties": {
            "database": {"type": "string", "description": "Full path to the database (made when missing)."},
            "table": {"type": "string"},
            "csv_path": {"type": "string", "description": "Full path to the CSV file."},
            "delimiter": {"type": "string", "description": "The separator, if not a comma (; or a tab)."},
            "replace": {"type": "boolean"},
        },
        "required": ["database", "table", "csv_path"],
    },
    destructive=True,
)
def import_csv(database, table, csv_path, delimiter=",", replace=False):
    src = full(csv_path)
    with open(src, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f, delimiter=delimiter or ","))
    if not rows:
        raise ToolError("The CSV file is empty.")
    head, body = rows[0], rows[1:]

    def kind(i):
        vals = [r[i] for r in body if i < len(r) and r[i] != ""]
        if vals and all(v.lstrip("-").isdigit() for v in vals):
            return "INTEGER"
        try:
            if vals:
                [float(v) for v in vals]
                return "REAL"
        except ValueError:
            pass
        return "TEXT"

    con = writable(database, create=True)
    try:
        with con:
            cols = ", ".join(f"{quote(h or f'column{i + 1}')} {kind(i)}" for i, h in enumerate(head))
            con.execute(f"CREATE TABLE IF NOT EXISTS {quote(table)} ({cols})")
            if replace:
                con.execute(f"DELETE FROM {quote(table)}")
            marks = ", ".join("?" for _ in head)
            con.executemany(f"INSERT INTO {quote(table)} VALUES ({marks})", [(r + [None] * len(head))[: len(head)] for r in body])
        return {"table": table, "rows_added": len(body), "columns": head}
    except sqlite3.Error as e:
        raise ToolError(f"SQLite: {e} (nothing was changed)")
    finally:
        con.close()


@server.tool(
    "sqlite_export_csv",
    "Write a read-only query's rows to a CSV file (with a header row), for a spreadsheet or another tool.",
    {
        "type": "object",
        "properties": {
            "database": {"type": "string"},
            "sql": {"type": "string"},
            "csv_path": {"type": "string", "description": "Full path of the CSV to write."},
            "params": {"type": "array", "items": {}},
        },
        "required": ["database", "sql", "csv_path"],
    },
)
def export_csv(database, sql, csv_path, params=None):
    dest = full(csv_path, must_exist=False)
    con = read_only(database)
    try:
        cur = con.execute(sql, params or [])
        os.makedirs(os.path.dirname(dest) or ".", exist_ok=True)
        n = 0
        with open(dest, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow([d[0] for d in cur.description or []])
            for r in cur:
                w.writerow(r)
                n += 1
        return {"csv": dest, "rows": n}
    except sqlite3.Error as e:
        raise ToolError(f"SQLite: {e}")
    finally:
        con.close()


if __name__ == "__main__":
    server.run()
