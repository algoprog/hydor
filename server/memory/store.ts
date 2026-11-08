// Memory's store: entries (about the user, a project, a session) and every change to them, in SQLite, with
// a full-text index of their text (FTS5, kept current by triggers), their vectors for search by meaning
// (vectors.ts) and the links from a topic or a profile to the notes it sums up. A deleted entry stays,
// marked deleted, so a change can be undone; erasing removes it and its history. Each session's memory
// block is kept too (memory_blocks), so an agent's instructions stay the same while its provider's cache
// holds them.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MEMORY_BASES, PROFILE_WORDS_DEFAULT, PROFILE_WORDS_MAX, PROFILE_WORDS_MIN, TOP_K_DEFAULT, TOP_K_MAX, isUserProfile, type MemoryBasis, type MemoryEntry, type MemoryHistoryRow, type MemoryKind, type MemoryScope, type MemorySource } from '../../shared/memory.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';

/** The longest a note may be; topics and profiles, which sum several up, get more. */
export const MAX_TEXT = 500;
export const MAX_SUMMARY = 800;
/** A note no agent has needed for this long is suggested for removal. */
export const STALE_DAYS = 120;

const ready = new WeakSet<DB>();

/** Makes the tables (once per connection), adding what older versions did not have. */
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
  const cols = new Set((db.prepare('pragma table_info(memory_entries)').all() as { name: string }[]).map((c) => c.name));
  if (!cols.has('kind')) db.exec("alter table memory_entries add column kind text not null default 'note'");
  if (!cols.has('expires_at')) db.exec('alter table memory_entries add column expires_at integer');
  if (!cols.has('used_at')) db.exec('alter table memory_entries add column used_at integer');
  if (!cols.has('uses')) db.exec('alter table memory_entries add column uses integer not null default 0');
  if (!cols.has('title')) db.exec('alter table memory_entries add column title text');
  if (!cols.has('basis')) db.exec('alter table memory_entries add column basis text');
  if (!cols.has('hits')) db.exec('alter table memory_entries add column hits integer not null default 0');
  if (!cols.has('hit_at')) db.exec('alter table memory_entries add column hit_at integer');
  db.exec(`
    drop index if exists memory_entries_scope;
    -- A place's entries, the latest changed first, without sorting all of them.
    create index if not exists memory_entries_place on memory_entries(scope, scope_key, status, updated_at desc, id desc);
    create index if not exists memory_entries_expiry on memory_entries(expires_at) where expires_at is not null;
    create table if not exists memory_links (
      parent integer not null references memory_entries(id) on delete cascade,
      child integer not null references memory_entries(id) on delete cascade,
      primary key (parent, child)
    ) without rowid;
    create index if not exists memory_links_child on memory_links(child);
    -- A note's vector: its embedding by \`model\`, quantized (vectors.ts).
    create table if not exists memory_vectors (
      entry integer primary key references memory_entries(id) on delete cascade,
      model text not null,
      code blob not null
    );
    -- What a session's agent was given of memory (inject.ts): the same block until its conversation is condensed
    -- (\`epoch\`) or it rests for a while, so its instructions stay as its provider cached them.
    create table if not exists memory_blocks (key text not null, flavor text not null, epoch integer not null, text text not null, at integer not null, primary key (key, flavor)) without rowid;
  `);
  if (!db.prepare("select 1 from sqlite_master where type = 'table' and name = 'memory_fts'").get())
    db.exec(`
      create virtual table memory_fts using fts5(text, content = 'memory_entries', content_rowid = 'id', tokenize = 'unicode61 remove_diacritics 2');
      insert into memory_fts(memory_fts) values ('rebuild');
    `);
  db.exec(`
    create trigger if not exists memory_fts_insert after insert on memory_entries begin
      insert into memory_fts(rowid, text) values (new.id, new.text);
    end;
    create trigger if not exists memory_fts_delete after delete on memory_entries begin
      insert into memory_fts(memory_fts, rowid, text) values ('delete', old.id, old.text);
    end;
    -- New words for the index, and the old vector no longer says what the text does.
    create trigger if not exists memory_fts_update after update of text on memory_entries begin
      insert into memory_fts(memory_fts, rowid, text) values ('delete', old.id, old.text);
      insert into memory_fts(rowid, text) values (new.id, new.text);
      delete from memory_vectors where entry = new.id;
    end;
  `);
  ready.add(db);
}

// ---- switches ---------------------------------------------------------------------------------

export const memoryOn = (db: DB) => kvGet(db, 'memory.enabled') !== '0';

/** Memory for one session: on for all, and not turned off for it. */
export const sessionMemoryOn = (db: DB, key: string | undefined) => memoryOn(db) && (!key || sessionExtra(db, key).memory !== false);

export function setEnabled(db: DB, on: boolean) {
  kvSet(db, 'memory.enabled', on ? '1' : '0');
}

/** The nightly tidy-up (it asks the helper model; "Tidy up now" works either way). */
export const tidyOn = (db: DB) => kvGet(db, 'memory.tidy.enabled') !== '0';
export function setTidyOn(db: DB, on: boolean) {
  kvSet(db, 'memory.tidy.enabled', on ? '1' : '0');
}

/** The tidy-up reads the conversations since the last one too (Learn from conversations): on unless turned off. */
export const learnOn = (db: DB) => kvGet(db, 'memory.learn.enabled') !== '0';
export function setLearnOn(db: DB, on: boolean) {
  kvSet(db, 'memory.learn.enabled', on ? '1' : '0');
}

/** How many notes about the user and the project agents start with (k of the top-k): 1 to TOP_K_MAX. */
export function topK(db: DB): number {
  const k = Number(kvGet(db, 'memory.topK'));
  return Number.isInteger(k) && k >= 1 && k <= TOP_K_MAX ? k : TOP_K_DEFAULT;
}
export function setTopK(db: DB, k: number) {
  if (!Number.isInteger(k) || k < 1 || k > TOP_K_MAX) throw new Error(`The number of notes should be from 1 to ${TOP_K_MAX}`);
  kvSet(db, 'memory.topK', String(k));
}

/** How many words the user's profile may have: PROFILE_WORDS_MIN to PROFILE_WORDS_MAX. */
export function profileWords(db: DB): number {
  const n = Number(kvGet(db, 'memory.profileWords'));
  return Number.isInteger(n) && n >= PROFILE_WORDS_MIN && n <= PROFILE_WORDS_MAX ? n : PROFILE_WORDS_DEFAULT;
}
export function setProfileWords(db: DB, n: number) {
  if (!Number.isInteger(n) || n < PROFILE_WORDS_MIN || n > PROFILE_WORDS_MAX) throw new Error(`The profile's length should be from ${PROFILE_WORDS_MIN} to ${PROFILE_WORDS_MAX.toLocaleString('en')} words`);
  kvSet(db, 'memory.profileWords', String(n));
}

export function memoryCounts(db: DB, now = Date.now()): Record<MemoryScope, number> {
  memorySchema(db);
  const counts: Record<MemoryScope, number> = { global: 0, repo: 0, session: 0 };
  // The user's profile is not counted among the notes: Settings shows it on its own.
  const rows = db
    .prepare("select scope, count(*) as n from memory_entries where status = 'active' and (expires_at is null or expires_at > ?) and not (scope = 'global' and kind = 'profile') group by scope")
    .all(now) as { scope: MemoryScope; n: number }[];
  for (const r of rows) counts[r.scope] = r.n;
  return counts;
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
    // A template that remembers marks its folder: its runs, each in a folder of its own under it, share it.
    if (fs.existsSync(path.join(d, '.naget-memory'))) return d;
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

/** A place notes belong to: about the user (key ""), a project (its folder), a session (its key). */
export interface Place {
  scope: MemoryScope;
  scopeKey: string;
}

export const placeKey = (p: Place) => `${p.scope}\u0000${p.scopeKey}`;

/** The places one session sees and changes: about the user, its project's, its own (when `key` is given). */
export function placesOf(o: { cwd?: string; key?: string }): Place[] {
  const repo = o.cwd ? repoRoot(o.cwd) : null;
  return [{ scope: 'global', scopeKey: '' }, ...(repo ? [{ scope: 'repo' as const, scopeKey: repo }] : []), ...(o.key ? [{ scope: 'session' as const, scopeKey: o.key }] : [])];
}

export const inPlaces = (e: Place, places: Place[]) => places.some((p) => p.scope === e.scope && p.scopeKey === e.scopeKey);

/** "In one of these places" for SQL on the entries as `alias`; every place for "all". */
export function placeSql(places: Place[] | 'all', alias = 'e'): { sql: string; args: string[] } {
  if (places === 'all') return { sql: '1', args: [] };
  if (!places.length) return { sql: '0', args: [] };
  return { sql: `(${places.map(() => `(${alias}.scope = ? and ${alias}.scope_key = ?)`).join(' or ')})`, args: places.flatMap((p) => [p.scope, p.scopeKey]) };
}

// ---- entries ----------------------------------------------------------------------------------

interface Row {
  id: number;
  scope: MemoryScope;
  scope_key: string;
  kind: MemoryKind;
  text: string;
  status: 'active' | 'deleted';
  created_at: number;
  updated_at: number;
  expires_at: number | null;
  used_at: number | null;
  uses: number;
  hit_at: number | null;
  hits: number | null;
  title: string | null;
  basis: string | null;
  covers: number;
  session: string | null;
  turn: string | null;
  source: MemorySource;
}

/** A basis as stored: one of the known ones, else none. */
export const basisOf = (v: unknown): MemoryBasis | undefined => (MEMORY_BASES.includes(v as MemoryBasis) ? (v as MemoryBasis) : undefined);

/** Entries with how many notes each sums up. */
const SELECT = 'select e.*, (select count(*) from memory_links l where l.parent = e.id) as covers from memory_entries e';

const toEntry = (r: Row): MemoryEntry => ({
  id: r.id,
  scope: r.scope,
  scopeKey: r.scope_key,
  kind: r.kind ?? 'note',
  text: r.text,
  title: r.title ?? undefined,
  basis: basisOf(r.basis),
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  expiresAt: r.expires_at ?? undefined,
  usedAt: r.used_at ?? undefined,
  uses: r.uses ?? 0,
  hitAt: r.hit_at ?? undefined,
  hits: r.hits ?? 0,
  covers: r.kind && r.kind !== 'note' ? r.covers : undefined,
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

/** Text as stored: one paragraph, at most `max` characters. */
export const cleanText = (t: string, max = MAX_TEXT) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
};

/** Characters the user's profile is cut at, whatever its length in words: its words are counted where it is written (profile.ts, routes.ts). */
export const PROFILE_CHARS = 40_000;

/** The user's profile as stored: its lines kept (each trimmed, at most one empty line between), at most `max` characters. */
export function cleanProfile(t: string, max = PROFILE_CHARS): string {
  const s = t
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

const maxFor = (kind: MemoryKind) => (kind === 'note' ? MAX_TEXT : MAX_SUMMARY);

/** An entry's text as stored: the user's profile keeps its lines, everything else is one paragraph. */
const clean = (e: { scope: MemoryScope; kind: MemoryKind }, text: string) => (isUserProfile(e) ? cleanProfile(text) : cleanText(text, maxFor(e.kind)));

/** Told of every change to the entries, with the place when it is one (vectors.ts keeps a copy per place). */
type Listener = (db: DB, place?: Place) => void;
const listeners: Listener[] = [];
export const onEntriesChanged = (fn: Listener) => void listeners.push(fn);
const changed = (db: DB, place?: Place) => listeners.forEach((f) => f(db, place));

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
  const r = db.prepare(`${SELECT} where e.id = ?`).get(id) as Row | undefined;
  return r ? toEntry(r) : null;
}

/** The longest a title may be: a few words. */
export const MAX_TITLE = 60;
const cleanTitle = (t: unknown) => (typeof t === 'string' && t.trim() ? cleanText(t, MAX_TITLE).replace(/[.。]$/, '') : null);

export function addEntry(
  db: DB,
  e: { scope: MemoryScope; scopeKey: string; text: string; kind?: MemoryKind; expiresAt?: number; basis?: MemoryBasis; title?: string },
  by: ChangeBy,
): MemoryEntry {
  memorySchema(db);
  const at = by.at ?? Date.now();
  const kind = e.kind ?? 'note';
  const text = clean({ scope: e.scope, kind }, e.text);
  const scopeKey = e.scope === 'global' ? '' : e.scopeKey;
  const id = db.transaction(() => {
    const r = db
      .prepare('insert into memory_entries (scope, scope_key, kind, text, title, basis, status, created_at, updated_at, expires_at, session, turn, source) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(e.scope, scopeKey, kind, text, cleanTitle(e.title), basisOf(e.basis) ?? null, 'active', at, at, e.expiresAt ?? null, by.session ?? null, by.turn ?? null, by.source);
    const id = Number(r.lastInsertRowid);
    log(db, id, 'added', null, text, by, at);
    return id;
  })();
  changed(db, { scope: e.scope, scopeKey });
  return getEntry(db, id)!;
}

/**
 * Changes an entry's text (a deleted one stays deleted); returns what it was, or null when there is no such entry.
 * Its title goes with the old text (the tidy-up writes a new one), unless one is given; `basis`, given, says how
 * the new text is known.
 */
export function updateEntry(db: DB, id: number, text: string, by: ChangeBy, o: { basis?: MemoryBasis; title?: string } = {}): { before: string; entry: MemoryEntry } | null {
  const cur = getEntry(db, id);
  if (!cur) return null;
  const at = by.at ?? Date.now();
  const next = clean(cur, text);
  if (next === cur.text) {
    if (o.basis && o.basis !== cur.basis) setBasis(db, id, o.basis, by);
    return { before: cur.text, entry: getEntry(db, id)! };
  }
  db.transaction(() => {
    db.prepare('update memory_entries set text = ?, title = ?, updated_at = ?, session = ?, turn = ?, source = ? where id = ?').run(next, cleanTitle(o.title), at, by.session ?? null, by.turn ?? null, by.source, id);
    log(db, id, 'updated', cur.text, next, by, at);
    if (o.basis && o.basis !== cur.basis) {
      db.prepare('update memory_entries set basis = ? where id = ?').run(o.basis, id);
      log(db, id, 'basis', cur.basis ?? '', o.basis, by, at);
    }
  })();
  changed(db, cur);
  return { before: cur.text, entry: getEntry(db, id)! };
}

/** Says how an entry is known (none: not said); false when nothing changed. Its history keeps the step. */
export function setBasis(db: DB, id: number, basis: MemoryBasis | null, by: ChangeBy): boolean {
  const cur = getEntry(db, id);
  if (!cur || (cur.basis ?? null) === basis) return false;
  const at = by.at ?? Date.now();
  db.transaction(() => {
    db.prepare('update memory_entries set basis = ? where id = ?').run(basis, id);
    log(db, id, 'basis', cur.basis ?? '', basis ?? '', by, at);
  })();
  changed(db, cur);
  return true;
}

/** Titles for entries (the tidy-up's): a few words each, for the index agents start with. Not in the history. */
export function setTitles(db: DB, rows: { id: number; title: string }[]) {
  memorySchema(db);
  const put = db.prepare('update memory_entries set title = ? where id = ?');
  db.transaction(() => rows.forEach((r) => put.run(cleanTitle(r.title), r.id)))();
}

/** The title an entry is listed by: its own, else its first eight words, what is in brackets left out. */
export function titleOf(e: Pick<MemoryEntry, 'title' | 'text'>): string {
  if (e.title) return e.title;
  const ws = e.text
    .replace(/\s*\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  return ws.length > 8 ? `${ws.slice(0, 8).join(' ').replace(/[,;:]$/, '')}…` : ws.join(' ');
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
  changed(db, cur);
  return true;
}

/** Brings a deleted entry back (with new text, when given). One whose end date passed comes back without it. */
export function restoreEntry(db: DB, id: number, by: ChangeBy, text?: string): boolean {
  const cur = getEntry(db, id);
  if (!cur || cur.status === 'active') return false;
  const at = by.at ?? Date.now();
  const next = text != null ? clean(cur, text) : cur.text;
  db.transaction(() => {
    db.prepare("update memory_entries set status = 'active', text = ?, updated_at = ?, expires_at = case when expires_at <= ? then null else expires_at end where id = ?").run(next, at, at, id);
    log(db, id, 'restored', null, next, by, at);
  })();
  changed(db, cur);
  return true;
}

/** Sets when an entry stops being true, or (null) takes that away; false when nothing changed. */
export function setExpiry(db: DB, id: number, expiresAt: number | null, by: ChangeBy): boolean {
  const cur = getEntry(db, id);
  if (!cur || (cur.expiresAt ?? null) === expiresAt) return false;
  const at = by.at ?? Date.now();
  const iso = (t?: number | null) => (t ? new Date(t).toISOString() : null);
  db.transaction(() => {
    db.prepare('update memory_entries set expires_at = ? where id = ?').run(expiresAt, id);
    log(db, id, 'expiry', iso(cur.expiresAt), iso(expiresAt), by, at);
  })();
  changed(db, cur);
  return true;
}

/** Agents got these as bearing on what they were doing (needed: what Settings shows and suggests removing by). */
export function markUsed(db: DB, ids: number[], at = Date.now()) {
  if (!ids.length) return;
  memorySchema(db);
  db.prepare(`update memory_entries set uses = uses + 1, used_at = ? where id in (${ids.map(() => '?').join(',')})`).run(at, ...ids);
}

/** Agents looked these up themselves (recall found them, or they corrected one): needed, and what ranking weighs. */
export function markHit(db: DB, ids: number[], at = Date.now()) {
  if (!ids.length) return;
  memorySchema(db);
  db.prepare(`update memory_entries set uses = uses + 1, used_at = ?, hits = hits + 1, hit_at = ? where id in (${ids.map(() => '?').join(',')})`).run(at, at, ...ids);
}

// ---- what each session was given ----------------------------------------------------------------

/** A session's memory block stays while its agent works; after this long at rest the provider's cache is gone, and it is made again. */
export const BLOCK_REST_MS = 3600_000;

/**
 * The memory block a session got (`flavor`: what kind, such as read-only), while it holds: for the same `epoch`
 * (Custom counts its condensings) and used within BLOCK_REST_MS. Using it keeps it.
 */
export function keptBlock(db: DB, key: string, flavor: string, epoch: number, now = Date.now()): string | null {
  memorySchema(db);
  const r = db.prepare('select epoch, text, at from memory_blocks where key = ? and flavor = ?').get(key, flavor) as { epoch: number; text: string; at: number } | undefined;
  if (!r || r.epoch !== epoch || now - r.at > BLOCK_REST_MS) return null;
  db.prepare('update memory_blocks set at = ? where key = ? and flavor = ?').run(now, key, flavor);
  return r.text;
}

/** The user changed notes themselves (Settings, an undo): every session gets its block afresh, so the change shows at once. */
export function dropBlocks(db: DB) {
  memorySchema(db);
  db.prepare('delete from memory_blocks').run();
}

export function keepBlock(db: DB, key: string, flavor: string, epoch: number, text: string, now = Date.now()) {
  memorySchema(db);
  db.prepare('insert into memory_blocks (key, flavor, epoch, text, at) values (?, ?, ?, ?, ?) on conflict(key, flavor) do update set epoch = excluded.epoch, text = excluded.text, at = excluded.at').run(
    key,
    flavor,
    epoch,
    text,
    now,
  );
}

/** The user keeps a note suggested for removal: it counts as needed now. */
export function keepEntry(db: DB, id: number, at = Date.now()) {
  memorySchema(db);
  db.prepare('update memory_entries set used_at = ? where id = ?').run(at, id);
}

/** Removes an entry and its history for good. */
export function eraseEntry(db: DB, id: number) {
  const cur = getEntry(db, id);
  db.transaction(() => {
    db.prepare('delete from memory_history where entry = ?').run(id);
    db.prepare('delete from memory_entries where id = ?').run(id);
  })();
  if (cur) changed(db, cur);
}

/** Removes every entry, all history and where each session was read up to. */
export function clearAll(db: DB): number {
  memorySchema(db);
  const n = db.transaction(() => {
    db.prepare('delete from memory_history').run();
    db.prepare('delete from memory_cursor').run();
    db.prepare('delete from memory_links').run();
    db.prepare('delete from memory_blocks').run();
    return db.prepare('delete from memory_entries').run().changes;
  })();
  changed(db);
  return n;
}

/**
 * Entries, newest change first: of a scope or one place, some kinds, by status, or some by id. `live`
 * (a time) leaves out the ones whose end date had passed by then.
 */
export function entries(
  db: DB,
  o: { scope?: MemoryScope; scopeKey?: string; status?: 'active' | 'deleted' | 'all'; ids?: number[]; kinds?: MemoryKind[]; live?: number; limit?: number } = {},
): MemoryEntry[] {
  memorySchema(db);
  const where: string[] = [];
  const args: unknown[] = [];
  if (o.scope) where.push('e.scope = ?'), args.push(o.scope);
  if (o.scopeKey != null) where.push('e.scope_key = ?'), args.push(o.scopeKey);
  if ((o.status ?? 'active') !== 'all') where.push('e.status = ?'), args.push(o.status ?? 'active');
  if (o.kinds) where.push(`e.kind in (${o.kinds.map(() => '?').join(',')})`), args.push(...o.kinds);
  if (o.live != null) where.push('(e.expires_at is null or e.expires_at > ?)'), args.push(o.live);
  if (o.ids) {
    if (!o.ids.length) return [];
    where.push(`e.id in (${o.ids.map(() => '?').join(',')})`), args.push(...o.ids);
  }
  const sql = `${SELECT} ${where.length ? `where ${where.join(' and ')}` : ''} order by e.updated_at desc, e.id desc limit ?`;
  return (db.prepare(sql).all(...args, Math.min(o.limit ?? 5000, 20000)) as Row[]).map(toEntry);
}

/** A note in one of the places, active and not past its end date: what a session may find or change. */
export function visibleEntry(db: DB, id: number, places: Place[], now = Date.now()): MemoryEntry | null {
  const e = getEntry(db, id);
  return e && e.status === 'active' && (!e.expiresAt || e.expiresAt > now) && inPlaces(e, places) ? e : null;
}

/** An active entry of the place with this very text (in any case). */
export function sameText(db: DB, place: Place, text: string): MemoryEntry | null {
  memorySchema(db);
  const r = db.prepare(`${SELECT} where e.scope = ? and e.scope_key = ? and e.status = 'active' and lower(e.text) = lower(?) limit 1`).get(place.scope, place.scopeKey, text) as Row | undefined;
  return r ? toEntry(r) : null;
}

// ---- topics and profiles ------------------------------------------------------------------------

/** What a topic or a profile sums up (replacing what it summed up before). */
export function setLinks(db: DB, parent: number, children: number[]) {
  memorySchema(db);
  db.transaction(() => {
    db.prepare('delete from memory_links where parent = ?').run(parent);
    const add = db.prepare('insert or ignore into memory_links (parent, child) values (?, ?)');
    for (const c of children) if (c !== parent) add.run(parent, c);
  })();
}

export function addLinks(db: DB, parent: number, children: number[]) {
  memorySchema(db);
  const add = db.prepare('insert or ignore into memory_links (parent, child) values (?, ?)');
  db.transaction(() => children.forEach((c) => c !== parent && add.run(parent, c)))();
}

export function childrenOf(db: DB, parent: number): number[] {
  memorySchema(db);
  return (db.prepare('select child from memory_links where parent = ?').all(parent) as { child: number }[]).map((r) => r.child);
}

/** The topics and profiles that sum a note up. */
export function parentsOf(db: DB, child: number): number[] {
  memorySchema(db);
  return (db.prepare('select parent from memory_links where child = ?').all(child) as { parent: number }[]).map((r) => r.parent);
}

/** A note merged into another: what summed it up now sums up the other. */
export function moveLinks(db: DB, from: number, to: number) {
  memorySchema(db);
  db.transaction(() => {
    db.prepare('insert or ignore into memory_links (parent, child) select parent, ? from memory_links where child = ? and parent != ?').run(to, from, to);
    db.prepare('insert or ignore into memory_links (parent, child) select ?, child from memory_links where parent = ? and child != ?').run(to, from, to);
    db.prepare('delete from memory_links where child = ? or parent = ?').run(from, from);
  })();
}

// ---- history ----------------------------------------------------------------------------------

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

// ---- words ------------------------------------------------------------------------------------

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i in is it its me my not of on or our so that the their them then there these they this to was we what when where which who why will with you your'.split(' '),
);

/** The words of a text worth matching on. */
export function words(text: string): string[] {
  const all = (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_.-]*/gu) ?? []).map((w) => w.replace(/[._-]+$/, ''));
  return [...new Set(all)].filter((w) => w.length > 1 && !STOP.has(w));
}

// ---- tidying ----------------------------------------------------------------------------------

/** Deletes the entries whose end date has passed (they can be restored for a while, like any deleted one). */
export function expireDue(db: DB, now = Date.now()): number {
  memorySchema(db);
  const due = db.prepare("select id from memory_entries where status = 'active' and expires_at is not null and expires_at <= ?").all(now) as { id: number }[];
  for (const { id } of due) deleteEntry(db, id, { source: 'auto', why: 'Its end date passed', at: now });
  return due.length;
}

/**
 * Notes about the user or a project that no agent has needed for STALE_DAYS: not changed, found or given
 * as bearing on a request since. Topics and profiles are left out (the tidy-up keeps them current), and so
 * are notes with an end date (they go by themselves) and a session's (they go with the session).
 */
export function staleEntries(db: DB, o: { now?: number; limit?: number } = {}): MemoryEntry[] {
  memorySchema(db);
  const cut = (o.now ?? Date.now()) - STALE_DAYS * 86400_000;
  const rows = db
    .prepare(
      `${SELECT} where e.status = 'active' and e.kind = 'note' and e.scope != 'session' and e.expires_at is null and e.updated_at < ? and coalesce(e.used_at, 0) < ?
       order by max(e.updated_at, coalesce(e.used_at, 0)) limit ?`,
    )
    .all(cut, cut, o.limit ?? 50) as Row[];
  return rows.map(toEntry);
}

export function staleCount(db: DB, now = Date.now()): number {
  memorySchema(db);
  const cut = now - STALE_DAYS * 86400_000;
  return (
    db.prepare("select count(*) as n from memory_entries where status = 'active' and kind = 'note' and scope != 'session' and expires_at is null and updated_at < ? and coalesce(used_at, 0) < ?").get(cut, cut) as {
      n: number;
    }
  ).n;
}

/** Deletes the notes past their end date, and removes notes deleted long ago and those of sessions that are gone. */
export function sweep(db: DB, now = Date.now()) {
  memorySchema(db);
  expireDue(db, now);
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
    // A block rested long enough is made again anyway.
    db.prepare('delete from memory_blocks where at < ?').run(now - 2 * BLOCK_REST_MS);
  })();
}
