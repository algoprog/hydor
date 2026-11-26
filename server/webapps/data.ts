// What a web app keeps in its own SQLite file, for the Data tab of its page: its tables, and their rows page by page.
// Read only, and only this: the file is opened read-only by the server, from the app's data folder (the one it is run
// with as KIT_DATA_DIR), and nothing the page sends ever becomes SQL: a table is one of the names the file itself lists,
// the rest is numbers. The app runs under its own account and can put anything in that folder, so the file is checked
// before it is opened: a plain file of that folder (a link out of the folder, or one to a file with other names, is no
// way to read any other file of this computer) that starts as a SQLite file does.
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { WebAppDataPage, WebAppDataTables, WebAppTable } from "../../shared/webapps.ts";
import { HttpError } from "../auth.ts";

/** The database file taken for granted when hydor.json names none. */
export const DEFAULT_DATA_FILE = "app.db";
/** The most rows one page may hold. */
export const DATA_MAX_LIMIT = 200;
export const DATA_DEFAULT_LIMIT = 50;
/** A cell longer than this is cut (the page folds what it shows anyway). */
export const DATA_CELL_MAX = 2000;
/** The most tables listed. */
const TABLES_MAX = 300;

const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const EXT = /\.(db|sqlite|sqlite3)$/i;
const HEADER = "SQLite format 3\0";
/** Columns that hold what should not be on a screen: a person's password, a session's token, a key. */
const SECRET_COLUMN = /^(.*_)?(password|passwd|secret|hash|salt|token|api_?key)$/i;

const within = (inner: string, outer: string) => inner.startsWith(outer.endsWith(path.sep) ? outer : outer + path.sep);

/** The database file to read: its real path, or null when the app has none yet. Refuses anything that is not a plain file of the data folder. */
export function dataFile(dataFolder: string, given: unknown): string | null {
  const name = given === undefined || given === null || given === "" ? DEFAULT_DATA_FILE : given;
  if (typeof name !== "string" || !FILE.test(name) || !EXT.test(name))
    throw new HttpError(400, "That is not the name of a database file in the app's data folder.");
  let folder: string;
  try {
    folder = fs.realpathSync(dataFolder);
  } catch {
    return null;
  }
  const file = path.join(folder, name);
  let real: string;
  try {
    real = fs.realpathSync(file);
  } catch {
    return null;
  }
  // A link in the folder that leads out of it (the app can make one) is no database of this app's.
  if (!within(real, folder) || path.dirname(real) !== folder)
    throw new HttpError(400, "That file is not in the app's own data folder, so it is not read.");
  const s = fs.statSync(real);
  if (!s.isFile() || s.nlink > 1) throw new HttpError(400, "That is not a plain database file, so it is not read.");
  const fd = fs.openSync(real, "r");
  try {
    const head = Buffer.alloc(HEADER.length);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    if (n === 0) return null;
    if (head.toString("latin1") !== HEADER) throw new HttpError(400, "That file is not a SQLite database.");
  } finally {
    fs.closeSync(fd);
  }
  return real;
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

function open(file: string): Database.Database {
  const db = new Database(file, { readonly: true, fileMustExist: true, timeout: 1500 });
  try {
    db.pragma("trusted_schema = OFF");
    db.pragma("query_only = ON");
  } catch {}
  return db;
}

/** Runs `fn` with the file open, however it ends; a file that cannot be read is a sentence. */
function withDb<T>(file: string, fn: (db: Database.Database) => T): T {
  let db: Database.Database | null = null;
  try {
    db = open(file);
    return fn(db);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    const code = (e as { code?: string }).code ?? "";
    if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED")
      throw new HttpError(503, "The app is using its data right now: try again in a moment.");
    throw new HttpError(422, `The app's data could not be read (${String((e as Error).message).split("\n")[0].slice(0, 160)}).`);
  } finally {
    try {
      db?.close();
    } catch {}
  }
}

interface MasterRow {
  name: string;
  sql: string | null;
}

/** The names of the plain tables of the file: not its own internal ones, nor virtual tables (which load modules) and the tables behind them. */
function tableNames(db: Database.Database): string[] {
  const rows = db
    .prepare("select name, sql from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\' order by name")
    .all() as MasterRow[];
  const virtual = rows.filter((r) => /^\s*create\s+virtual\s+table/i.test(r.sql ?? "")).map((r) => r.name);
  return rows
    .filter((r) => !virtual.includes(r.name) && !virtual.some((v) => r.name.startsWith(`${v}_`)))
    .map((r) => r.name)
    .slice(0, TABLES_MAX);
}

interface ColumnInfo {
  name: string;
  type: string;
  pk: number;
  hidden?: number;
}

const columnsOf = (db: Database.Database, table: string) =>
  (db.prepare(`pragma table_xinfo(${quote(table)})`).all() as ColumnInfo[])
    .filter((c) => !c.hidden)
    .map((c) => ({ name: c.name, type: c.type || "", pk: c.pk > 0 }));

/** The tables of the app's database, each with its columns and how many rows it has. */
export function listTables(dataFolder: string, given?: unknown): WebAppDataTables {
  const file = dataFile(dataFolder, given);
  const name = typeof given === "string" && given ? given : DEFAULT_DATA_FILE;
  if (!file) return { file: name, exists: false, tables: [] };
  return withDb(file, (db) => {
    const tables: WebAppTable[] = tableNames(db).map((t) => ({
      name: t,
      columns: columnsOf(db, t),
      rows: Number((db.prepare(`select count(*) as n from ${quote(t)}`).get() as { n: number }).n),
    }));
    return { file: name, exists: true, tables };
  });
}

const whole = (v: unknown, what: string, min: number, max: number, fallback: number): number => {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "string" && /^[0-9]{1,12}$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${what} is a whole number from ${min} to ${max}.`);
  return n;
};

function cell(v: unknown): { v: string | number | null; cut: boolean } {
  if (v === null || v === undefined) return { v: null, cut: false };
  if (typeof v === "bigint") return { v: v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v.toString(), cut: false };
  if (typeof v === "number") return { v: Number.isFinite(v) ? v : String(v), cut: false };
  if (Buffer.isBuffer(v)) return { v: `[${v.length} byte${v.length === 1 ? "" : "s"} of binary data]`, cut: false };
  const s = String(v);
  return s.length > DATA_CELL_MAX ? { v: s.slice(0, DATA_CELL_MAX), cut: true } : { v: s, cut: false };
}

/** A page of one table's rows: `limit` from `offset`, in the order the file keeps them. */
export function readRows(dataFolder: string, table: string, query: { file?: unknown; offset?: unknown; limit?: unknown } = {}): WebAppDataPage {
  const file = dataFile(dataFolder, query.file);
  const offset = whole(query.offset, "The first row", 0, 1_000_000_000, 0);
  const limit = whole(query.limit, "The page size", 1, DATA_MAX_LIMIT, DATA_DEFAULT_LIMIT);
  if (!file) throw new HttpError(404, "The app has no data yet.");
  return withDb(file, (db) => {
    // Only a name the file itself lists is ever used, and quoted.
    if (!tableNames(db).includes(table)) throw new HttpError(404, "The app's data has no such table.");
    const columns = columnsOf(db, table);
    const hidden = columns.map((c) => SECRET_COLUMN.test(c.name));
    const total = Number((db.prepare(`select count(*) as n from ${quote(table)}`).get() as { n: number }).n);
    const select = columns.map((c) => quote(c.name)).join(", ");
    const stmt = db.prepare(`select ${select} from ${quote(table)} limit ? offset ?`).raw(true).safeIntegers(true);
    let truncated = false;
    const rows = (stmt.all(limit, offset) as unknown[][]).map((r) =>
      r.map((v, i) => {
        if (hidden[i] && v !== null && v !== "") return "••••••";
        const c = cell(v);
        if (c.cut) truncated = true;
        return c.v;
      }),
    );
    return {
      table,
      columns: columns.map((c, i) => ({ ...c, ...(hidden[i] ? { hidden: true } : {}) })),
      rows,
      total,
      offset,
      limit,
      truncated,
    };
  });
}

/**
 * The id of the first row of a table whose column has this value (the app's list of kept answers: the row a run was kept as), or null: no data, no such
 * table or column, no such row. Read only, like the rest: the table and the column are names the file itself lists, and the value is a parameter.
 */
export function rowIdOf(dataFolder: string, table: string, column: string, value: string): string | null {
  let file: string | null;
  try {
    file = dataFile(dataFolder, undefined);
  } catch {
    return null;
  }
  if (!file) return null;
  try {
    return withDb(file, (db) => {
      if (!tableNames(db).includes(table)) return null;
      const cols = columnsOf(db, table);
      if (!cols.some((c) => c.name === column) || !cols.some((c) => c.name === "id")) return null;
      const r = db.prepare(`select ${quote("id")} as id from ${quote(table)} where ${quote(column)} = ? limit 1`).get(value) as { id: unknown } | undefined;
      return r && (typeof r.id === "string" || typeof r.id === "number") ? String(r.id) : null;
    });
  } catch {
    return null;
  }
}
