// Memory's store: entries (about the user, a project, a session) and every change to them, in SQLite.
// A deleted entry stays, marked deleted, so a change can be undone; erasing removes it and its history.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { MemoryEntry, MemoryHistoryRow, MemoryScope, MemorySource, MemoryState } from '../../shared/memory.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';

/** The longest an entry may be. */
export const MAX_TEXT = 500;

const ready = new WeakSet<DB>();

/** Makes the tables (once per connection). */
export function memorySchema(db: DB) {
  if (ready.has(db)) return;
  db.exec(`
    create table if not exists memory_entries (
      id integer primary key autoincrement,
      scope text not null,
      scope_key text not null default '',
      text text not null,
      status text not null default 'active',
      created_at integer not null,
      updated_at integer not null,
      session text,
      turn text,
      source text not null default 'auto'
    );
    create index if not exists memory_entries_scope on memory_entries(scope, scope_key, status);
    create table if not exists memory_history (
      id integer primary key autoincrement,
      entry integer not null references memory_entries(id) on delete cascade,
      at integer not null,
      action text not null,
      before text,
      after text,
      why text,
      session text,
      turn text,
      source text not null
    );
    create index if not exists memory_history_entry on memory_history(entry, at);
    create index if not exists memory_history_session on memory_history(session, at);
    -- How far each session's turns were read for memory: the last timeline item, and when.
    create table if not exists memory_cursor (key text primary key, item text, at integer not null);
  `);
  ready.add(db);
}

// ---- switches ---------------------------------------------------------------------------------

export const memoryOn = (db: DB) => kvGet(db, 'memory.enabled') !== '0';
export const autoOn = (db: DB) => kvGet(db, 'memory.auto') !== '0';

/** Memory for one session: on for all, and not turned off for it. */
export const sessionMemoryOn = (db: DB, key: string | undefined) => memoryOn(db) && (!key || sessionExtra(db, key).memory !== false);

export function setSwitches(db: DB, p: { enabled?: boolean; auto?: boolean }) {
  if (typeof p.enabled === 'boolean') kvSet(db, 'memory.enabled', p.enabled ? '1' : '0');
  if (typeof p.auto === 'boolean') kvSet(db, 'memory.auto', p.auto ? '1' : '0');
}

export function noteError(db: DB, message: string | null) {
  kvSet(db, 'memory.lastError', message ? JSON.stringify({ at: Date.now(), message: message.slice(0, 300) }) : '');
}

export function memoryState(db: DB): MemoryState {
  memorySchema(db);
  const counts: Record<MemoryScope, number> = { global: 0, repo: 0, session: 0 };
  for (const r of db.prepare("select scope, count(*) as n from memory_entries where status = 'active' group by scope").all() as { scope: MemoryScope; n: number }[]) counts[r.scope] = r.n;
  let lastError: MemoryState['lastError'];
  try {
    lastError = JSON.parse(kvGet(db, 'memory.lastError') || 'null') ?? undefined;
  } catch {}
  return { enabled: memoryOn(db), auto: autoOn(db), counts, lastError };
}

// ---- where an entry belongs ---------------------------------------------------------------------

/** A worktree's main repository: its .git file points into <main>/.git/worktrees/<name>. */
function mainRepo(dir: string, gitFile: string): string | null {
  try {
    const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(gitFile, 'utf8'));
    if (!m) return null;
    const gitdir = path.resolve(dir, m[1].trim());
    let common = gitdir;
    try {
      common = path.resolve(gitdir, fs.readFileSync(path.join(gitdir, 'commondir'), 'utf8').trim());
    } catch {}
    return path.basename(common) === '.git' ? path.dirname(common) : null;
  } catch {
    return null;
  }
}

/**
 * Where a folder's project memory lives: the root of its repository (the main one, for a worktree, so
 * every branch's sessions share it), or the folder itself outside git. None for the home folder or the
 * root: sessions there are about anything, not one project. A repository at the home folder itself
 * (kept dotfiles) does not make every folder under it one project.
 */
export function repoRoot(cwd: string): string | null {
  const dir = path.resolve(cwd);
  const home = path.resolve(os.homedir());
  if (dir === home || dir === path.parse(dir).root) return null;
  for (let d = dir; d !== home; ) {
    const g = path.join(d, '.git');
    let st: fs.Stats | undefined;
    try {
      st = fs.statSync(g);
    } catch {}
    if (st?.isDirectory()) return d;
    if (st?.isFile()) return mainRepo(d, g) ?? d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return dir;
}

// ---- entries ----------------------------------------------------------------------------------

interface Row {
  id: number;
  scope: MemoryScope;
  scope_key: string;
  text: string;
  status: 'active' | 'deleted';
  created_at: number;
  updated_at: number;
  session: string | null;
  turn: string | null;
  source: MemorySource;
}

const toEntry = (r: Row): MemoryEntry => ({
  id: r.id,
  scope: r.scope,
  scopeKey: r.scope_key,
  text: r.text,
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  session: r.session ?? undefined,
  turn: r.turn ?? undefined,
  source: r.source,
});

/** Who changed an entry, where and why. */
export interface ChangeBy {
  source: MemorySource;
  session?: string;
  turn?: string;
  why?: string;
  at?: number;
}

/** Text as stored: one paragraph, at most MAX_TEXT characters. */
export const cleanText = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT - 1).trimEnd() + '…' : s;
};

function log(db: DB, entry: number, action: MemoryHistoryRow['action'], before: string | null, after: string | null, by: ChangeBy, at: number) {
  db.prepare('insert into memory_history (entry, at, action, before, after, why, session, turn, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    entry,
    at,
    action,
    before,
    after,
    by.why?.slice(0, 300) ?? null,
    by.session ?? null,
    by.turn ?? null,
    by.source,
  );
}

export function getEntry(db: DB, id: number): MemoryEntry | null {
  memorySchema(db);
  const r = db.prepare('select * from memory_entries where id = ?').get(id) as Row | undefined;
  return r ? toEntry(r) : null;
}

export function addEntry(db: DB, e: { scope: MemoryScope; scopeKey: string; text: string }, by: ChangeBy): MemoryEntry {
  memorySchema(db);
  const at = by.at ?? Date.now();
  const text = cleanText(e.text);
  const scopeKey = e.scope === 'global' ? '' : e.scopeKey;
  const id = db.transaction(() => {
    const r = db
      .prepare('insert into memory_entries (scope, scope_key, text, status, created_at, updated_at, session, turn, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.scope, scopeKey, text, 'active', at, at, by.session ?? null, by.turn ?? null, by.source);
    const id = Number(r.lastInsertRowid);
    log(db, id, 'added', null, text, by, at);
    return id;
  })();
  return getEntry(db, id)!;
}

/** Changes an entry's text (a deleted one stays deleted); returns what it was, or null when there is no such entry. */
export function updateEntry(db: DB, id: number, text: string, by: ChangeBy): { before: string; entry: MemoryEntry } | null {
  const cur = getEntry(db, id);
  if (!cur) return null;
  const at = by.at ?? Date.now();
  const next = cleanText(text);
  if (next === cur.text) return { before: cur.text, entry: cur };
  db.transaction(() => {
    db.prepare('update memory_entries set text = ?, updated_at = ?, session = ?, turn = ?, source = ? where id = ?').run(next, at, by.session ?? null, by.turn ?? null, by.source, id);
    log(db, id, 'updated', cur.text, next, by, at);
  })();
  return { before: cur.text, entry: getEntry(db, id)! };
}

/** Marks an entry deleted (it can be restored); false when there is none, or it is deleted already. */
export function deleteEntry(db: DB, id: number, by: ChangeBy): boolean {
  const cur = getEntry(db, id);
  if (!cur || cur.status === 'deleted') return false;
  const at = by.at ?? Date.now();
  db.transaction(() => {
    db.prepare("update memory_entries set status = 'deleted', updated_at = ? where id = ?").run(at, id);
    log(db, id, 'deleted', cur.text, null, by, at);
  })();
  return true;
}

export function restoreEntry(db: DB, id: number, by: ChangeBy, text?: string): boolean {
  const cur = getEntry(db, id);
  if (!cur || cur.status === 'active') return false;
  const at = by.at ?? Date.now();
  const next = text != null ? cleanText(text) : cur.text;
  db.transaction(() => {
    db.prepare("update memory_entries set status = 'active', text = ?, updated_at = ? where id = ?").run(next, at, id);
    log(db, id, 'restored', null, next, by, at);
  })();
  return true;
}

/** Removes an entry and its history for good. */
export function eraseEntry(db: DB, id: number) {
  memorySchema(db);
  db.transaction(() => {
    db.prepare('delete from memory_history where entry = ?').run(id);
    db.prepare('delete from memory_entries where id = ?').run(id);
  })();
}

/** Removes every entry, all history and where each session was read up to. */
export function clearAll(db: DB): number {
  memorySchema(db);
  return db.transaction(() => {
    db.prepare('delete from memory_history').run();
    db.prepare('delete from memory_cursor').run();
    return db.prepare('delete from memory_entries').run().changes;
  })();
}

/** Entries, newest change first: of some scopes, one place, or by status. */
export function entries(db: DB, o: { scope?: MemoryScope; scopeKey?: string; status?: 'active' | 'deleted' | 'all'; ids?: number[]; limit?: number } = {}): MemoryEntry[] {
  memorySchema(db);
  const where: string[] = [];
  const args: unknown[] = [];
  if (o.scope) where.push('scope = ?'), args.push(o.scope);
  if (o.scopeKey != null) where.push('scope_key = ?'), args.push(o.scopeKey);
  if ((o.status ?? 'active') !== 'all') where.push('status = ?'), args.push(o.status ?? 'active');
  if (o.ids) {
    if (!o.ids.length) return [];
    where.push(`id in (${o.ids.map(() => '?').join(',')})`), args.push(...o.ids);
  }
  const sql = `select * from memory_entries ${where.length ? `where ${where.join(' and ')}` : ''} order by updated_at desc, id desc limit ?`;
  return (db.prepare(sql).all(...args, Math.min(o.limit ?? 5000, 20000)) as Row[]).map(toEntry);
}

/** What one session may see and change: notes about the user, its project's, its own. */
export function visibleEntries(db: DB, o: { cwd?: string; key?: string }): MemoryEntry[] {
  const repo = o.cwd ? repoRoot(o.cwd) : null;
  return [
    ...entries(db, { scope: 'global' }),
    ...(repo ? entries(db, { scope: 'repo', scopeKey: repo }) : []),
    ...(o.key ? entries(db, { scope: 'session', scopeKey: o.key }) : []),
  ];
}

const toHistory = (r: any): MemoryHistoryRow => ({
  id: r.id,
  entry: r.entry,
  at: r.at,
  action: r.action,
  before: r.before ?? undefined,
  after: r.after ?? undefined,
  why: r.why ?? undefined,
  session: r.session ?? undefined,
  turn: r.turn ?? undefined,
  source: r.source,
});

/** An entry's changes, newest first. */
export function history(db: DB, entry: number): MemoryHistoryRow[] {
  memorySchema(db);
  return (db.prepare('select * from memory_history where entry = ? order by at desc, id desc').all(entry) as any[]).map(toHistory);
}

/** Changes made in a session after a time by one kind of writer (an agent's remember and forget), oldest first. */
export function changesSince(db: DB, key: string, since: number, source: MemorySource): MemoryHistoryRow[] {
  memorySchema(db);
  return (db.prepare('select * from memory_history where session = ? and source = ? and at > ? order by at, id').all(key, source, since) as any[]).map(toHistory);
}

// ---- how far a session was read -----------------------------------------------------------------

export function cursorOf(db: DB, key: string): { item?: string; at: number } | null {
  memorySchema(db);
  const r = db.prepare('select item, at from memory_cursor where key = ?').get(key) as { item: string | null; at: number } | undefined;
  return r ? { item: r.item ?? undefined, at: r.at } : null;
}

export function setCursor(db: DB, key: string, item: string | undefined, at = Date.now()) {
  memorySchema(db);
  db.prepare('insert into memory_cursor (key, item, at) values (?, ?, ?) on conflict(key) do update set item = excluded.item, at = excluded.at').run(key, item ?? null, at);
}

// ---- finding entries ----------------------------------------------------------------------------

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i in is it its me my not of on or our so that the their them then there these they this to was we what when where which who why will with you your'.split(' '),
);

/** The words of a text worth matching on. */
export function words(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_.-]*/gu) ?? [])].filter((w) => w.length > 1 && !STOP.has(w));
}

/** How well an entry matches some words: one point per word it holds (or a word's start, 4+ letters). */
export function matchScore(text: string, query: string[]): number {
  if (!query.length) return 0;
  const t = text.toLowerCase();
  let n = 0;
  for (const w of query) if (t.includes(w) || (w.length > 4 && t.includes(w.slice(0, Math.max(4, w.length - 2))))) n++;
  return n;
}

/** Entries ordered by how well they match the words, then newest first. */
export function rank(list: MemoryEntry[], query: string[] = []): MemoryEntry[] {
  const scored = list.map((e) => ({ e, s: matchScore(e.text, query) }));
  return scored.sort((a, b) => b.s - a.s || b.e.updatedAt - a.e.updatedAt || b.e.id - a.e.id).map((x) => x.e);
}

/** Entries matching a search (every word, in any order), best first; all of them for an empty one. */
export function search(list: MemoryEntry[], q: string): MemoryEntry[] {
  const w = words(q);
  if (!w.length) return list;
  return rank(
    list.filter((e) => matchScore(e.text, w) > 0),
    w,
  );
}

/** Removes notes deleted long ago and those of sessions that are gone. */
export function sweep(db: DB, now = Date.now()) {
  memorySchema(db);
  const old = now - 30 * 86400_000;
  db.transaction(() => {
    const gone = db.prepare("select id from memory_entries where status = 'deleted' and updated_at < ?").all(old) as { id: number }[];
    const orphans = db
      .prepare(
        "select id from memory_entries where scope = 'session' and not exists (select 1 from sessions s where s.key = scope_key) and not exists (select 1 from app_sessions a where a.key = scope_key)",
      )
      .all() as { id: number }[];
    for (const { id } of [...gone, ...orphans]) eraseEntry(db, id);
    db.prepare('delete from memory_cursor where not exists (select 1 from sessions s where s.key = memory_cursor.key) and not exists (select 1 from app_sessions a where a.key = memory_cursor.key)').run();
  })();
}
