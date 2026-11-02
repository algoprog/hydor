// What apps keep: each app's collections of records (shared/app-manifest.ts DataCollection), in
// app_data. Its steps keep and find them (Keep data), its agents with the app_data tool, people and
// programs through /api/apps/:id/data, and its screens later. A collection with fields checks values and
// tidies them to their kinds (numbers, dates, yes or no…); one without keeps any JSON. Each record has an
// id, and when it was added and last changed. Finding is by fields ({ "read": false }, { "price": { "<":
// 100 } }), by words anywhere in a record, sorted by a field.
//
// Searching is as the app's knowledge bases are searched (server/knowledge/search.ts): by words (a
// full-text index, ranked by BM25) and by meaning (each record's vector against the question's, when
// search by meaning is on in Settings → Memory), joined by rank. A record's words are indexed as it is
// kept; its vector is made a moment later, in the background, and again when it changes.
import type { AnswerField } from '../../shared/apps.ts';
import { checkAnswer } from '../../shared/apps.ts';
import type { DataCollection } from '../../shared/app-manifest.ts';
import { asText, DATA_LIMITS, isEmpty, order, same } from '../../shared/app-manifest.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { embed, queryVector } from '../memory/embed.ts';
import { anyWords } from '../memory/search.ts';
import { BYTES, quantize, queryTable, scale, scoreAt, VECTOR_MODEL } from '../memory/vectors.ts';
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
    create table if not exists app_data_vec (
      app_id text not null,
      collection text not null,
      rid text not null,
      model text not null,
      code blob not null,
      primary key (app_id, collection, rid)
    );
  `);
  // The records' words, for searching (the fts5 table cannot say "if not exists" of a virtual table's columns).
  if (!db.prepare("select 1 from sqlite_master where name = 'app_data_fts'").get()) db.exec("create virtual table app_data_fts using fts5(app_id unindexed, collection unindexed, rid unindexed, text, tokenize = 'unicode61 remove_diacritics 2')");
  made.add(db);
}

/** A record as text, for its words and its vector: each field's value, the field named. */
export function recordText(rec: Record<string, unknown>): string {
  return Object.entries(rec)
    .filter(([k]) => k !== 'id' && k !== 'createdAt' && k !== 'updatedAt')
    .map(([k, v]) => `${k}: ${asText(v, 2000)}`)
    .join('\n')
    .slice(0, 4000);
}

/** Keeps a record's words in the index, and drops its vector so a new one is made. */
function indexRecord(db: DB, app: string, collection: string, id: string, values: Record<string, unknown> | null) {
  db.prepare('delete from app_data_fts where app_id = ? and collection = ? and rid = ?').run(app, collection, id);
  db.prepare('delete from app_data_vec where app_id = ? and collection = ? and rid = ?').run(app, collection, id);
  if (values) db.prepare('insert into app_data_fts (app_id, collection, rid, text) values (?, ?, ?, ?)').run(app, collection, id, recordText(values));
  if (values) embedSoon(db);
}

let embedTimer: NodeJS.Timeout | undefined;
let embedding = false;

/** Soon: vectors for the records without one (nothing when search by meaning is off). */
export function embedSoon(db: DB, ms = 1500) {
  clearTimeout(embedTimer);
  embedTimer = setTimeout(() => void embedMissing(db), ms);
  embedTimer.unref?.();
}

/** Makes vectors for records that lack one, 64 at a time, until none is left or search by meaning cannot answer. */
export async function embedMissing(db: DB): Promise<number> {
  if (embedding) return 0;
  embedding = true;
  let made = 0;
  try {
    ensureDataTables(db);
    for (;;) {
      const rows = db
        .prepare(
          `select d.app_id as app, d.collection as collection, d.id as id, d.data as data from app_data d
           left join app_data_vec v on v.app_id = d.app_id and v.collection = d.collection and v.rid = d.id and v.model = ?
           where v.rid is null limit 64`,
        )
        .all(VECTOR_MODEL) as { app: string; collection: string; id: string; data: string }[];
      if (!rows.length) break;
      const vectors = await embed(
        db,
        rows.map((r) => recordText(JSON.parse(r.data))),
        'document',
      );
      if (!vectors) break;
      const put = db.prepare('insert or replace into app_data_vec (app_id, collection, rid, model, code) values (?, ?, ?, ?, ?)');
      db.transaction(() => rows.forEach((r, i) => put.run(r.app, r.collection, r.id, VECTOR_MODEL, Buffer.from(quantize(vectors[i])))))();
      made += rows.length;
    }
  } finally {
    embedding = false;
  }
  return made;
}

/** As knowledge search weighs them: words and meaning joined by rank, and how near a record must be to count. */
const RRF_K = 60;
const W_WORDS = 0.1;
const W_MEANING = 1;
const MIN_SIMILARITY = 0.2;

export type SearchMode = 'auto' | 'words' | 'meaning';

/**
 * The records that answer a question best: by words and by meaning, joined by rank (or by one of them).
 * `meaning` says whether meaning took part (it is off, or not ready, otherwise).
 */
export async function searchRecords(db: DB, app: string, data: Record<string, DataCollection> | undefined, collection: string, query: string, o: { mode?: SearchMode; limit?: number } = {}): Promise<{ records: (DataRecord & { score: number })[]; count: number; meaning: boolean }> {
  ensureDataTables(db);
  collectionOf(data, collection);
  const limit = Math.max(1, Math.min(o.limit ?? 10, 100));
  const pool = Math.max(50, limit * 4);
  const q = query.trim();
  if (!q) return { records: [], count: 0, meaning: false };
  const fused = new Map<string, number>();
  const add = (id: string, rank: number, w: number) => fused.set(id, (fused.get(id) ?? 0) + w / (RRF_K + rank + 1));
  const mode = o.mode ?? 'auto';
  if (mode !== 'meaning') {
    const fts = anyWords(q);
    if (fts) {
      try {
        (db.prepare('select rid from app_data_fts where app_data_fts match ? and app_id = ? and collection = ? order by bm25(app_data_fts) limit ?').all(fts, app, collection, pool) as { rid: string }[]).forEach((r, i) => add(r.rid, i, W_WORDS));
      } catch {}
    }
  }
  let meaning = false;
  if (mode !== 'words') {
    const vec = await queryVector(db, q, { wait: true, timeoutMs: 30_000 });
    if (vec) {
      meaning = true;
      const t = queryTable(vec);
      const best: { id: string; s: number }[] = [];
      for (const r of db.prepare('select rid, code from app_data_vec where app_id = ? and collection = ? and model = ?').iterate(app, collection, VECTOR_MODEL) as Iterable<{ rid: string; code: Buffer }>) {
        if (r.code.length !== BYTES) continue;
        const code = new Uint8Array(r.code.buffer, r.code.byteOffset, r.code.length);
        const s = scoreAt(t, code, 0) * scale(code, 0);
        if (s < MIN_SIMILARITY || (best.length >= pool && s <= best[best.length - 1].s)) continue;
        best.push({ id: r.rid, s });
        best.sort((x, y) => y.s - x.s);
        if (best.length > pool) best.pop();
      }
      best.forEach((h, i) => add(h.id, i, W_MEANING));
      // Records added before their vectors: made now, for the next search.
      embedSoon(db, 200);
    }
  }
  const ranked = [...fused.entries()].sort((a, b) => b[1] - a[1]);
  const records: (DataRecord & { score: number })[] = [];
  const get = db.prepare('select id, data, created_at, updated_at from app_data where app_id = ? and collection = ? and id = ?');
  for (const [id, score] of ranked.slice(0, limit)) {
    const r = get.get(app, collection, id) as Row | undefined;
    if (r) records.push({ ...toRecord(r), score: Math.round(score * 1e5) / 1e5 });
  }
  return { records, count: ranked.length, meaning };
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
  indexRecord(db, app, collection, id, v);
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
    indexRecord(db, app, collection, id, v);
    out.push({ ...v, id, createdAt, updatedAt: now });
  }
  return out;
}

/** Removes the records that match (one by id, or by where; {} for all); how many went. */
export function removeRecords(db: DB, app: string, data: Record<string, DataCollection> | undefined, collection: string, q: DataQuery): number {
  ensureDataTables(db);
  collectionOf(data, collection);
  if (!q.id && !q.where) throw new HttpError(400, 'Say which records to remove: one by its id, or those that match (where; {} for all)');
  const ids = q.id && !q.where ? [q.id] : findRecords(db, app, data, collection, { ...q, limit: DATA_LIMITS.records }).records.map((r) => r.id);
  const del = db.prepare('delete from app_data where app_id = ? and collection = ? and id = ?');
  let n = 0;
  db.transaction(() =>
    ids.forEach((id) => {
      n += del.run(app, collection, id).changes;
      indexRecord(db, app, collection, id, null);
    }),
  )();
  return n;
}

/** The collections an app keeps, with how many records each has. */
export function collectionsOf(db: DB, app: string, data: Record<string, DataCollection> | undefined) {
  ensureDataTables(db);
  return Object.entries(data ?? {}).map(([name, c]) => ({ name, count: countRecords(db, app, name), fields: c.fields ?? null, description: c.description ?? null }));
}

/** Forgets what an app keeps (one collection, or all of it). */
export function clearData(db: DB, app: string, collection?: string): number {
  ensureDataTables(db);
  for (const t of ['app_data_fts', 'app_data_vec']) (collection ? db.prepare(`delete from ${t} where app_id = ? and collection = ?`).run(app, collection) : db.prepare(`delete from ${t} where app_id = ?`).run(app));
  return (collection ? db.prepare('delete from app_data where app_id = ? and collection = ?').run(app, collection) : db.prepare('delete from app_data where app_id = ?').run(app)).changes;
}
