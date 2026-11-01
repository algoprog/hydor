// Where knowledge bases live: the bases and their sources, each document read from them, its passages (with a
// full-text index over them, ranked by BM25) and the passages' vectors for search by meaning (4 bits a number,
// like memory's notes). Files dropped on the page are kept in the data folder, a folder each base.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { KnowledgeBase, KnowledgeDoc, KnowledgeSource } from '../../shared/knowledge.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';

export const KNOWLEDGE_DIR = () => path.join(config.dataDir, 'knowledge');
export const filesDir = (base: string) => path.join(KNOWLEDGE_DIR(), base.replace(/[^a-z0-9]/g, ''), 'files');

const ready = new WeakSet<DB>();

export function knowledgeSchema(db: DB) {
  if (ready.has(db)) return;
  db.exec(`
    create table if not exists kb_bases (id text primary key, name text not null, description text, created_at integer not null, indexed_at integer);
    create table if not exists kb_sources (id text primary key, base text not null, kind text not null, path text not null, name text not null, added_at integer not null);
    create table if not exists kb_docs (
      id integer primary key, base text not null, source text not null, path text not null, title text not null, format text not null,
      size integer not null, mtime real not null, passages integer not null default 0, status text not null, error text, indexed_at integer not null,
      unique (base, path)
    );
    create table if not exists kb_chunks (id integer primary key, doc integer not null, seq integer not null, part text, text text not null);
    create index if not exists kb_chunks_doc on kb_chunks (doc, seq);
    create table if not exists kb_vectors (chunk integer primary key, model text not null, code blob not null);
  `);
  const has = db.prepare("select 1 from sqlite_master where name = 'kb_fts'").get();
  if (!has)
    db.exec(`
      create virtual table kb_fts using fts5(text, part, content = 'kb_chunks', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
      create trigger kb_chunks_ai after insert on kb_chunks begin insert into kb_fts (rowid, text, part) values (new.id, new.text, new.part); end;
      create trigger kb_chunks_ad after delete on kb_chunks begin insert into kb_fts (kb_fts, rowid, text, part) values ('delete', old.id, old.text, old.part); end;
    `);
  ready.add(db);
}

interface BaseRow {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  indexed_at: number | null;
}

interface SourceRow {
  id: string;
  base: string;
  kind: 'files' | 'folder';
  path: string;
  name: string;
  added_at: number;
}

const toSource = (r: SourceRow): KnowledgeSource => ({ id: r.id, kind: r.kind, path: r.path, name: r.name, addedAt: r.added_at });

export function baseRows(db: DB): BaseRow[] {
  knowledgeSchema(db);
  return db.prepare('select * from kb_bases order by created_at').all() as BaseRow[];
}

export function baseRow(db: DB, id: string): BaseRow {
  knowledgeSchema(db);
  const r = db.prepare('select * from kb_bases where id = ?').get(id) as BaseRow | undefined;
  if (!r) throw new HttpError(404, 'No such knowledge base');
  return r;
}

export function sourcesOf(db: DB, base: string): KnowledgeSource[] {
  knowledgeSchema(db);
  return (db.prepare('select * from kb_sources where base = ? order by added_at').all(base) as SourceRow[]).map(toSource);
}

/** What the page shows of a base: its sources and counts, and what could not be read. */
export function baseView(db: DB, r: BaseRow, indexing?: { done: number; total: number }): KnowledgeBase {
  const n = db.prepare("select count(*) as docs, coalesce(sum(passages), 0) as passages from kb_docs where base = ? and status = 'indexed'").get(r.id) as { docs: number; passages: number };
  const embedded = (db.prepare('select count(*) as n from kb_vectors v join kb_chunks c on c.id = v.chunk join kb_docs d on d.id = c.doc where d.base = ?').get(r.id) as { n: number }).n;
  const errors = db.prepare("select path, error from kb_docs where base = ? and status = 'error' order by path limit 20").all(r.id) as { path: string; error: string }[];
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? undefined,
    createdAt: r.created_at,
    sources: sourcesOf(db, r.id),
    filesDir: filesDir(r.id),
    docs: n.docs,
    passages: n.passages,
    embedded,
    errors,
    indexing,
    indexedAt: r.indexed_at ?? undefined,
  };
}

const clean = (s: unknown, max: number) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

export function createBase(db: DB, b: { name?: unknown; description?: unknown }): BaseRow {
  knowledgeSchema(db);
  const name = clean(b.name, 60) || 'My documents';
  const id = `kb${crypto.randomBytes(5).toString('hex')}`;
  db.prepare('insert into kb_bases (id, name, description, created_at) values (?, ?, ?, ?)').run(id, name, clean(b.description, 300) || null, Date.now());
  // Files dropped on the page are a source of their own from the start.
  fs.mkdirSync(filesDir(id), { recursive: true, mode: 0o700 });
  addSource(db, id, 'files', filesDir(id), 'Files you added');
  return baseRow(db, id);
}

export function updateBase(db: DB, id: string, b: { name?: unknown; description?: unknown }) {
  baseRow(db, id);
  if (b.name !== undefined) {
    const name = clean(b.name, 60);
    if (!name) throw new HttpError(400, 'Give it a name');
    db.prepare('update kb_bases set name = ? where id = ?').run(name, id);
  }
  if (b.description !== undefined) db.prepare('update kb_bases set description = ? where id = ?').run(clean(b.description, 300) || null, id);
}

/** Deletes a base: its passages, vectors and the files dropped into it (folders on this computer stay as they are). */
export function deleteBase(db: DB, id: string) {
  baseRow(db, id);
  db.transaction(() => {
    for (const { id: doc } of db.prepare('select id from kb_docs where base = ?').all(id) as { id: number }[]) dropDoc(db, doc);
    db.prepare('delete from kb_sources where base = ?').run(id);
    db.prepare('delete from kb_bases where id = ?').run(id);
  })();
  fs.rmSync(path.dirname(filesDir(id)), { recursive: true, force: true });
}

export function addSource(db: DB, base: string, kind: 'files' | 'folder', p: string, name?: string): KnowledgeSource {
  const abs = path.resolve(p);
  const have = sourcesOf(db, base).find((s) => s.path === abs);
  if (have) return have;
  if (kind === 'folder') {
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      throw new HttpError(400, `No folder at ${abs}`);
    }
    if (!st.isDirectory()) throw new HttpError(400, `${abs} is not a folder`);
  }
  const s: SourceRow = { id: `src${crypto.randomBytes(5).toString('hex')}`, base, kind, path: abs, name: clean(name, 80) || path.basename(abs) || abs, added_at: Date.now() };
  db.prepare('insert into kb_sources (id, base, kind, path, name, added_at) values (?, ?, ?, ?, ?, ?)').run(s.id, s.base, s.kind, s.path, s.name, s.added_at);
  return toSource(s);
}

/** Forgets a folder (its documents leave the base; the folder itself is untouched). */
export function removeSource(db: DB, base: string, id: string) {
  const s = sourcesOf(db, base).find((x) => x.id === id);
  if (!s) throw new HttpError(404, 'No such source');
  if (s.kind === 'files') throw new HttpError(400, 'Remove the files themselves instead');
  db.transaction(() => {
    for (const { id: doc } of db.prepare('select id from kb_docs where base = ? and source = ?').all(base, id) as { id: number }[]) dropDoc(db, doc);
    db.prepare('delete from kb_sources where id = ?').run(id);
  })();
}

// ---- documents and passages ------------------------------------------------------------------------

interface DocRow {
  id: number;
  base: string;
  source: string;
  path: string;
  title: string;
  format: string;
  size: number;
  mtime: number;
  passages: number;
  status: KnowledgeDoc['status'];
  error: string | null;
  indexed_at: number;
}

export const toDoc = (r: DocRow): KnowledgeDoc => ({ id: r.id, base: r.base, path: r.path, title: r.title, format: r.format, size: r.size, passages: r.passages, status: r.status, error: r.error ?? undefined, indexedAt: r.indexed_at });

export function docsOf(db: DB, base: string, o: { source?: string; limit?: number } = {}): DocRow[] {
  knowledgeSchema(db);
  return (o.source ? db.prepare('select * from kb_docs where base = ? and source = ? order by path limit ?').all(base, o.source, o.limit ?? 100_000) : db.prepare('select * from kb_docs where base = ? order by path limit ?').all(base, o.limit ?? 100_000)) as DocRow[];
}

export function docById(db: DB, id: number): DocRow | undefined {
  knowledgeSchema(db);
  return db.prepare('select * from kb_docs where id = ?').get(id) as DocRow | undefined;
}

export function docByPath(db: DB, p: string): DocRow | undefined {
  knowledgeSchema(db);
  return db.prepare('select * from kb_docs where path = ? order by indexed_at desc limit 1').get(path.resolve(p)) as DocRow | undefined;
}

export function dropDoc(db: DB, id: number) {
  db.prepare('delete from kb_vectors where chunk in (select id from kb_chunks where doc = ?)').run(id);
  db.prepare('delete from kb_chunks where doc = ?').run(id);
  db.prepare('delete from kb_docs where id = ?').run(id);
}

/** Puts a document's passages in place of what it had (a new document, or one that changed). */
export function saveDoc(
  db: DB,
  d: { base: string; source: string; path: string; title: string; format: string; size: number; mtime: number; status: KnowledgeDoc['status']; error?: string; chunks: { part?: string; text: string }[] },
) {
  db.transaction(() => {
    const old = db.prepare('select id from kb_docs where base = ? and path = ?').get(d.base, d.path) as { id: number } | undefined;
    if (old) dropDoc(db, old.id);
    const r = db
      .prepare('insert into kb_docs (base, source, path, title, format, size, mtime, passages, status, error, indexed_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(d.base, d.source, d.path, d.title, d.format, d.size, d.mtime, d.chunks.length, d.status, d.error ?? null, Date.now());
    const put = db.prepare('insert into kb_chunks (doc, seq, part, text) values (?, ?, ?, ?)');
    d.chunks.forEach((c, i) => put.run(r.lastInsertRowid, i, c.part ?? null, c.text));
  })();
}

export interface ChunkRow {
  id: number;
  doc: number;
  seq: number;
  part: string | null;
  text: string;
}

export function chunksOf(db: DB, doc: number, from: number, count: number): ChunkRow[] {
  return db.prepare('select * from kb_chunks where doc = ? and seq >= ? order by seq limit ?').all(doc, from, count) as ChunkRow[];
}

export function chunkById(db: DB, id: number): ChunkRow | undefined {
  knowledgeSchema(db);
  return db.prepare('select * from kb_chunks where id = ?').get(id) as ChunkRow | undefined;
}
