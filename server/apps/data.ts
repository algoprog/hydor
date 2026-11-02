// What apps keep: each app's collections of records (shared/app-manifest.ts DataCollection), in
// app_data. Its steps keep and find them (Keep data), its agents with the app_data tool, people and
// programs through /api/apps/:id/data, and its screens later. A collection with fields checks values and
// tidies them to their kinds (numbers, dates, yes or no…); one without keeps any JSON. Each record has an
// id, and when it was added and last changed. Finding is by fields ({ "read": false }, { "price": { "<":
// 100 } }), by words anywhere in a record, sorted by a field.
import type { AnswerField } from '../../shared/apps.ts';
import { checkAnswer } from '../../shared/apps.ts';
import type { DataCollection } from '../../shared/app-manifest.ts';
import { asText, DATA_LIMITS, isEmpty, order, same } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { newId } from './store.ts';

export type DataRecord = Record<string, unknown> & { id: string; createdAt: number; updatedAt: number };

export interface DataQuery {
  /** One record, by its id. */
  id?: string;
  /** Records whose fields match: a value, or { "<": 10 } and the like (=, !=, <, >, <=, >=, contains, in, empty). */
  where?: Record<string, unknown>;
  /** Words to look for anywhere in a record. */
  search?: string;
  /** A field to sort by, "-field" for the highest (or latest) first; unset: oldest first. */
  sort?: string;
  limit?: number;
}

const made = new WeakSet<DB>();
export function ensureDataTables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists app_data (
      app_id text not null,
      collection text not null,
      id text not null,
      data text not null,
      created_at integer not null,
      updated_at integer not null,
      primary key (app_id, collection, id)
    );
    create index if not exists app_data_order on app_data (app_id, collection, created_at);
  `);
  made.add(db);
}

interface Row {
  id: string;
  data: string;
  created_at: number;
  updated_at: number;
}

const toRecord = (r: Row): DataRecord => {
  let v: Record<string, unknown> = {};
  try {
    v = JSON.parse(r.data);
  } catch {}
  return { ...v, id: r.id, createdAt: r.created_at, updatedAt: r.updated_at };
};

/** The collection, or an error naming those the app keeps. */
function collectionOf(data: Record<string, DataCollection> | undefined, name: string): DataCollection {
  const c = data?.[name];
  if (!c) throw new HttpError(404, data && Object.keys(data).length ? `The template keeps no collection “${name}” (it keeps ${Object.keys(data).join(', ')})` : 'The template keeps no data: add a collection under What it keeps');
  return c;
}

/** A record's values as the collection keeps them: its fields checked and tidied (unknown ones dropped), or any JSON. */
function tidy(c: DataCollection, values: Record<string, unknown>, where: string): Record<string, unknown> {
  const raw = Object.fromEntries(Object.entries(values ?? {}).filter(([k]) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt'));
  let out = raw;
  if (c.fields?.length) {
    const fields: AnswerField[] = c.fields.map((f) => ({ ...f, required: false }));
    const unknown = Object.keys(raw).filter((k) => !fields.some((f) => f.id === k));
    if (unknown.length) throw new HttpError(400, `${where}: there is no field ${unknown.join(', ')} (it has ${fields.map((f) => f.id).join(', ')})`);
    const checked = checkAnswer(fields, raw);
    if (!checked.ok) throw new HttpError(400, `${where}: ${checked.errors.join('; ')}`);
    out = Object.fromEntries(Object.entries(checked.value).filter(([k]) => k in raw));
  }
  const size = JSON.stringify(out).length;
  if (size > DATA_LIMITS.record) throw new HttpError(413, `${where}: a record is at most ${Math.round(DATA_LIMITS.record / 1024)} KB (this one is ${Math.round(size / 1024)} KB)`);
  return out;
}

/** Whether a record matches a "where". */
export function matches(rec: Record<string, unknown>, where: Record<string, unknown> | undefined): boolean {
  for (const [k, cond] of Object.entries(where ?? {})) {
    const v = rec[k];
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      for (const [op, want] of Object.entries(cond as Record<string, unknown>)) {
        const o = op.trim().toLowerCase();
        let ok: boolean;
        if (o === '=' || o === '==' || o === 'is') ok = same(v, want);
        else if (o === '!=' || o === '≠' || o === 'not') ok = !same(v, want);
        else if (o === 'contains') ok = Array.isArray(v) ? v.some((x) => same(x, want)) : asText(v).toLowerCase().includes(asText(want).toLowerCase());
        else if (o === 'in') ok = Array.isArray(want) && want.some((x) => same(v, x));
        else if (o === 'empty') ok = isEmpty(v) === (want !== false);
        else if (o === '<' || o === '>' || o === '<=' || o === '>=') {
          const c = order(v, want);
          ok = c !== null && (o === '<' ? c < 0 : o === '>' ? c > 0 : o === '<=' ? c <= 0 : c >= 0);
        } else throw new HttpError(400, `“${op}” is not a way to compare (=, !=, <, >, <=, >=, contains, in, empty)`);
        if (!ok) return false;
      }
    } else if (Array.isArray(v) ? !v.some((x) => same(x, cond)) : !same(v, cond)) return false;
  }
  return true;
}

function rows(db: DB, app: string, collection: string): Iterable<Row> {
  return db.prepare('select id, data, created_at, updated_at from app_data where app_id = ? and collection = ? order by created_at, rowid').iterate(app, collection) as Iterable<Row>;
}

/** The records that match, sorted, and how many matched in all. */
export function findRecords(db: DB, app: string, data: Record<string, DataCollection> | undefined, collection: string, q: DataQuery = {}): { records: DataRecord[]; count: number } {
  ensureDataTables(db);
  collectionOf(data, collection);
  if (q.id) {
    const r = db.prepare('select id, data, created_at, updated_at from app_data where app_id = ? and collection = ? and id = ?').get(app, collection, q.id) as Row | undefined;
    const rec = r ? toRecord(r) : null;
    return rec && matches(rec, q.where) ? { records: [rec], count: 1 } : { records: [], count: 0 };
  }
  const words = (q.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const hits: DataRecord[] = [];
  for (const r of rows(db, app, collection)) {
    if (words.length) {
      const hay = r.data.toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
    }
    const rec = toRecord(r);
    if (matches(rec, q.where)) hits.push(rec);
  }
  if (q.sort) {
    const desc = q.sort.startsWith('-');
    const key = q.sort.replace(/^[-+]/, '');
    hits.sort((a, b) => {
      const c = order(a[key], b[key]) ?? asText(a[key]).localeCompare(asText(b[key]));
      return desc ? -c : c;
    });
  }
  const limit = Math.max(1, Math.min(q.limit ?? 100, DATA_LIMITS.find));
  return { records: hits.slice(0, limit), count: hits.length };
}

/** Every record of a collection, oldest first (for a download). */
export function allRecords(db: DB, app: string, collection: string): DataRecord[] {
  ensureDataTables(db);
  return [...rows(db, app, collection)].map(toRecord);
}

export function countRecords(db: DB, app: string, collection?: string): number {
  ensureDataTables(db);
  const r = (collection ? db.prepare('select count(*) as n from app_data where app_id = ? and collection = ?').get(app, collection) : db.prepare('select count(*) as n from app_data where app_id = ?').get(app)) as { n: number };
  return r.n;
}

export function addRecord(db: DB, app: string, data: Record<string, DataCollection> | undefined, collection: string, values: Record<string, unknown>): DataRecord {
  ensureDataTables(db);
  const c = collectionOf(data, collection);
  if (countRecords(db, app) >= DATA_LIMITS.records) throw new HttpError(413, `The template keeps ${DATA_LIMITS.records.toLocaleString('en-US')} records already, its most: remove some first`);
  const v = tidy(c, values, collection);
  const id = typeof values?.id === 'string' && /^[\w-]{1,64}$/.test(values.id) ? values.id : newId(5);
  const now = Date.now();
  try {
    db.prepare('insert into app_data (app_id, collection, id, data, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(app, collection, id, JSON.stringify(v), now, now);
  } catch {
    throw new HttpError(409, `${collection} has a record ${id} already`);
  }
  return { ...v, id, createdAt: now, updatedAt: now };
}

/** Changes the records that match (one by id, or by where): `set`'s fields replace theirs; a field set to null is cleared. */
export function updateRecords(db: DB, app: string, data: Record<string, DataCollection> | undefined, collection: string, q: DataQuery, set: Record<string, unknown>): DataRecord[] {
  ensureDataTables(db);
  const c = collectionOf(data, collection);
  if (!q.id && !q.where) throw new HttpError(400, 'Say which records to change: one by its id, or those that match (where; {} for all)');
  const hits = findRecords(db, app, data, collection, { ...q, limit: DATA_LIMITS.find, sort: undefined }).records;
  const now = Date.now();
  const out: DataRecord[] = [];
  const write = db.prepare('update app_data set data = ?, updated_at = ? where app_id = ? and collection = ? and id = ?');
  for (const rec of hits) {
    const { id, createdAt, updatedAt: _u, ...old } = rec;
    const merged = Object.fromEntries(Object.entries({ ...old, ...set }).filter(([, v]) => v !== null && v !== undefined));
    const v = tidy(c, merged, `${collection} ${id}`);
    write.run(JSON.stringify(v), now, app, collection, id);
    out.push({ ...v, id, createdAt, updatedAt: now });
  }
  return out;
}

/** Removes the records that match (one by id, or by where; {} for all); how many went. */
export function removeRecords(db: DB, app: string, data: Record<string, DataCollection> | undefined, collection: string, q: DataQuery): number {
  ensureDataTables(db);
  collectionOf(data, collection);
  if (!q.id && !q.where) throw new HttpError(400, 'Say which records to remove: one by its id, or those that match (where; {} for all)');
  if (q.id && !q.where) return db.prepare('delete from app_data where app_id = ? and collection = ? and id = ?').run(app, collection, q.id).changes;
  const ids = findRecords(db, app, data, collection, { ...q, limit: DATA_LIMITS.records }).records.map((r) => r.id);
  const del = db.prepare('delete from app_data where app_id = ? and collection = ? and id = ?');
  db.transaction(() => ids.forEach((id) => del.run(app, collection, id)))();
  return ids.length;
}

/** The collections an app keeps, with how many records each has. */
export function collectionsOf(db: DB, app: string, data: Record<string, DataCollection> | undefined) {
  ensureDataTables(db);
  return Object.entries(data ?? {}).map(([name, c]) => ({ name, count: countRecords(db, app, name), fields: c.fields ?? null, description: c.description ?? null }));
}

/** Forgets what an app keeps (one collection, or all of it). */
export function clearData(db: DB, app: string, collection?: string): number {
  ensureDataTables(db);
  return (collection ? db.prepare('delete from app_data where app_id = ? and collection = ?').run(app, collection) : db.prepare('delete from app_data where app_id = ?').run(app)).changes;
}
