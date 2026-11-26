// Backups of a launched app inside this Hydor: `<id>.tar.gz` holding SQLite's own online backup of the app's database (the file its
// hydor.json names; the backup API, so the app may keep running and the copy is whole), the rest of the data folder (`files/`, the session key…) and a
// `manifest.json` (the rows in each table). An app that names no SQLite database is stopped while its folder is copied, which its caller does. Beside the archive, `<id>.json` with the manifest and the
// archive's size and SHA-256. A backup counts only once it was restored into a scratch folder and read back (SQLite's integrity check, the rows of every
// table against the manifest). The id is the UTC time (`20261124-193012`) and a label (launch, manual, scheduled, pre-launch, before-restore).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { RunBackup } from "../../shared/webapps.ts";

const ID = /^\d{8}-\d{6}(-[a-z0-9-]+)?$/;
export const isBackupId = (v: unknown): v is string => typeof v === "string" && ID.test(v);
export const DB_FILE = "app.db";
/** The SQLite file and what SQLite keeps beside it: never copied as plain files. */
const sideOf = (db: string) => new Set([db, `${db}-wal`, `${db}-shm`, `${db}-journal`]);
const SAFE_DB = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export interface BackupManifest {
  format: number;
  createdAt: string;
  launch: string | null;
  label: string | null;
  database: { file: string; bytes: number; sha256: string } | null;
  tables: Record<string, number>;
  entries: string[];
  files: number;
  dataBytes: number;
  /** The app was stopped while this was copied (it names no SQLite database that can be copied while it runs). */
  stopped?: boolean;
}
export interface BackupRecord extends BackupManifest {
  id: string;
  archive: { file: string; bytes: number; sha256: string };
}

const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "").replace("T", "-");

/** The rows in each table of a database file, by table. */
function counts(file: string): Record<string, number> {
  const db = new Database(file, { readonly: true });
  try {
    const names = (db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name").all() as { name: string }[]).map((r) => r.name);
    const out: Record<string, number> = {};
    for (const n of names) out[n] = (db.prepare(`select count(*) as n from "${n.replaceAll('"', '""')}"`).get() as { n: number }).n;
    return out;
  } finally {
    db.close();
  }
}

function integrity(file: string): string {
  const db = new Database(file, { readonly: true });
  try {
    return String((db.prepare("pragma integrity_check").get() as { integrity_check: string }).integrity_check);
  } finally {
    db.close();
  }
}

/** What else is in the data folder: everything but the database that is copied by SQLite itself. */
const entriesOf = (dir: string, db: string | null): string[] => {
  const side = db ? sideOf(db) : new Set<string>();
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => !side.has(n)) : [];
};

function bytesIn(p: string): { files: number; bytes: number } {
  // A link is counted as itself, never followed.
  const s = fs.lstatSync(p);
  if (!s.isDirectory()) return { files: 1, bytes: s.size };
  let files = 0;
  let bytes = 0;
  for (const n of fs.readdirSync(p)) {
    const sub = bytesIn(path.join(p, n));
    files += sub.files;
    bytes += sub.bytes;
  }
  return { files, bytes };
}

function tar(args: string[]): { status: number | null; err: string } {
  const r = spawnSync("tar", args, { encoding: "utf8" });
  return { status: r.status, err: (r.stderr ?? "").trim().split("\n")[0] };
}

export interface BackupAsked {
  label?: string;
  launch?: string;
  /** The SQLite file in the data folder, copied by SQLite itself so the app may be running; null: there is none, and every file is copied as it is. */
  db?: string | null;
  /** The app is stopped while this is made (said in the record). */
  stopped?: boolean;
}

/** Makes a backup of `data` in `out` and reads it back. With a database file named, the app may be running. */
export async function makeBackup(data: string, out: string, o: BackupAsked = {}): Promise<BackupRecord> {
  const dbName = o.db === undefined ? DB_FILE : o.db;
  if (o.label && !/^[a-z0-9-]{1,40}$/.test(o.label)) throw new Error("A label is lower-case letters, digits and hyphens.");
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const stage = fs.mkdtempSync(path.join(out, ".stage-"));
  try {
    // A plain file only: the app can put anything in its folder, a link to someone else's file included.
    let hasDb = false;
    if (dbName && SAFE_DB.test(dbName)) {
      try {
        hasDb = fs.lstatSync(path.join(data, dbName)).isFile();
      } catch {}
    }
    const manifest: BackupManifest = { format: 1, createdAt: new Date().toISOString(), launch: o.launch ?? null, label: o.label ?? null, database: null, tables: {}, entries: [], files: 0, dataBytes: 0, ...(o.stopped ? { stopped: true } : {}) };
    const include = ["manifest.json"];
    if (hasDb) {
      const src = new Database(path.join(data, dbName!), { readonly: true, fileMustExist: true });
      try {
        await src.backup(path.join(stage, dbName!));
      } finally {
        src.close();
      }
      const check = integrity(path.join(stage, dbName!)).trim();
      if (check !== "ok") throw new Error(`The copy of the database did not pass its own check (${check.split("\n")[0]}).`);
      manifest.tables = counts(path.join(stage, dbName!));
      manifest.database = { file: dbName!, bytes: fs.statSync(path.join(stage, dbName!)).size, sha256: sha256(path.join(stage, dbName!)) };
      include.push(dbName!);
    }
    manifest.entries = entriesOf(data, hasDb ? dbName : null);
    for (const e of manifest.entries) {
      const sub = bytesIn(path.join(data, e));
      manifest.files += sub.files;
      manifest.dataBytes += sub.bytes;
    }
    if (!hasDb && !manifest.entries.length) throw new Error(`There is nothing to back up: ${path.basename(data)} holds no database and no files.`);
    fs.writeFileSync(path.join(stage, "manifest.json"), JSON.stringify(manifest, null, 2));
    let id = stamp(new Date()) + (o.label ? `-${o.label}` : "");
    for (let n = 2; fs.existsSync(path.join(out, `${id}.json`)); n++) id = `${stamp(new Date())}${o.label ? `-${o.label}` : ""}-${n}`;
    const archive = path.join(out, `${id}.tar.gz`);
    const tmp = `${archive}.partial`;
    // The app names its own files: one that starts with a dash would be read by tar as an option (one that runs a command), and one with @ as another
    // archive to take in. Such a name has ./ before it; every other is written as it is.
    const plain = (n: string) => (/^[-@]/.test(n) ? `./${n}` : n);
    const t = tar(["-czf", tmp, "-C", stage, ...include.map(plain), ...(manifest.entries.length ? ["-C", data, ...manifest.entries.map(plain)] : [])]);
    // 1: a file changed while it was read, which a copy of live files may meet.
    if (t.status !== 0 && t.status !== 1) throw new Error(`tar failed: ${t.err}`);
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, archive);
    const record: BackupRecord = { id, ...manifest, archive: { file: `${id}.tar.gz`, bytes: fs.statSync(archive).size, sha256: sha256(archive) } };
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(record, null, 2), { mode: 0o600 });
    const v = verifyBackup(out, id);
    if (!v.ok) {
      fs.rmSync(archive, { force: true });
      fs.rmSync(path.join(out, `${id}.json`), { force: true });
      throw new Error(`The backup could not be read back, so it does not count: ${v.problems.join("; ")}`);
    }
    return record;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

export function listBackupRecords(out: string): BackupRecord[] {
  if (!fs.existsSync(out)) return [];
  const rows: BackupRecord[] = [];
  for (const n of fs.readdirSync(out)) {
    if (!n.endsWith(".json") || !ID.test(n.slice(0, -5))) continue;
    try {
      rows.push(JSON.parse(fs.readFileSync(path.join(out, n), "utf8")) as BackupRecord);
    } catch {}
  }
  return rows.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export const asRunBackup = (b: BackupRecord): RunBackup => ({ id: b.id, label: b.label, at: Date.parse(b.createdAt) || 0, bytes: b.archive.bytes, tables: b.tables, files: b.files, ...(b.stopped ? { stopped: true } : {}) });

export interface Verified {
  id: string;
  ok: boolean;
  integrity: string | null;
  expected: Record<string, number>;
  found: Record<string, number>;
  problems: string[];
}

/** Restores an archive into a scratch folder and reads it back; nothing of the data folder is touched. */
export function verifyBackup(out: string, id: string): Verified {
  const archive = path.join(out, `${id}.tar.gz`);
  if (!ID.test(id) || !fs.existsSync(archive)) throw new Error(`There is no backup called ${id}.`);
  const scratch = fs.mkdtempSync(path.join(out, ".verify-"));
  try {
    const record = JSON.parse(fs.readFileSync(path.join(out, `${id}.json`), "utf8")) as BackupRecord;
    const problems: string[] = [];
    if (sha256(archive) !== record.archive.sha256) return { id, ok: false, integrity: null, expected: record.tables, found: {}, problems: ["The archive is not the file that was written (its SHA-256 differs)."] };
    const t = tar(["-xzf", archive, "-C", scratch]);
    if (t.status !== 0) throw new Error(`The archive could not be unpacked: ${t.err}`);
    const res: Verified = { id, ok: false, integrity: null, expected: record.tables, found: {}, problems };
    if (record.database) {
      const file = path.join(scratch, path.basename(record.database.file));
      res.integrity = integrity(file).trim();
      if (res.integrity !== "ok") problems.push(`The database in the backup fails its own check: ${res.integrity.split("\n")[0]}`);
      res.found = counts(file);
      for (const [table, n] of Object.entries(record.tables)) if (res.found[table] !== n) problems.push(`The table ${table} has ${res.found[table]} rows in the backup, and the backup said ${n}.`);
    }
    const there = (p: string) => {
      try {
        fs.lstatSync(p);
        return true;
      } catch {
        return false;
      }
    };
    for (const e of record.entries) if (!there(path.join(scratch, e))) problems.push(`${e} is missing from the archive.`);
    res.ok = problems.length === 0;
    return res;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** Puts a backup back: the app must be stopped (the caller stops it). What is there now is backed up first (`before-restore`), and the backup is checked before anything is removed. */
export async function restoreBackup(data: string, out: string, id: string): Promise<{ id: string; safety: string | null; tables: Record<string, number> }> {
  const v = verifyBackup(out, id);
  if (!v.ok) throw new Error(`That backup does not pass its checks, so nothing was changed: ${v.problems.join("; ")}`);
  const record = JSON.parse(fs.readFileSync(path.join(out, `${id}.json`), "utf8")) as BackupRecord;
  const scratch = fs.mkdtempSync(path.join(out, ".restore-"));
  try {
    const t = tar(["-xzf", path.join(out, `${id}.tar.gz`), "-C", scratch]);
    if (t.status !== 0) throw new Error(`The archive could not be unpacked: ${t.err}`);
    let safety: string | null = null;
    // The app is stopped now: what is there is backed up by the database the backup being put back knows of.
    const dbName = record.database ? path.basename(record.database.file) : null;
    if (entriesOf(data, null).length) safety = (await makeBackup(data, out, { label: "before-restore", db: dbName })).id;
    fs.mkdirSync(data, { recursive: true, mode: 0o700 });
    for (const n of fs.readdirSync(data)) fs.rmSync(path.join(data, n), { recursive: true, force: true });
    if (dbName) fs.copyFileSync(path.join(scratch, dbName), path.join(data, dbName));
    for (const e of record.entries) fs.cpSync(path.join(scratch, e), path.join(data, e), { recursive: true });
    return { id, safety, tables: record.tables };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/** Backups older than `keepDays` go, except the newest three. */
export function pruneBackups(out: string, keepDays: number): string[] {
  const all = listBackupRecords(out);
  const cutoff = Date.now() - keepDays * 86_400_000;
  const gone: string[] = [];
  all.forEach((b, i) => {
    if (i >= 3 && Date.parse(b.createdAt) < cutoff) {
      fs.rmSync(path.join(out, `${b.id}.tar.gz`), { force: true });
      fs.rmSync(path.join(out, `${b.id}.json`), { force: true });
      gone.push(b.id);
    }
  });
  return gone;
}
