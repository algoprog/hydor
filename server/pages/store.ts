// Saved pages: the Pages library in SQLite. Each save is a new version (the oldest go past a count and
// a size); each page keeps its own small storage (window.naget.storage) and has a link of its own,
// signed with the app's key, that opens it on any device without the app's sign-in.
import crypto from 'node:crypto';
import { STORAGE_LIMITS, VERSION_LIMITS, type PageInfo, type PageVersion } from '../../shared/pages.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { signWithKey } from '../links.ts';

export const MAX_PAGE = 2 * 1024 * 1024;
const MAX_PAGES = 1000;

export function initPages(db: DB) {
  db.exec(`
    create table if not exists pages (
      id text primary key,
      title text not null,
      version integer not null,
      created_at integer not null,
      updated_at integer not null,
      session_key text,
      source_item text,
      link_nonce text not null
    );
    create index if not exists pages_source on pages(session_key);
    create table if not exists page_versions (
      page_id text not null references pages(id) on delete cascade,
      version integer not null,
      title text not null,
      html text not null,
      bytes integer not null,
      created_at integer not null,
      by text not null,
      primary key (page_id, version)
    );
    create table if not exists page_storage (
      page_id text not null references pages(id) on delete cascade,
      key text not null,
      value text not null,
      bytes integer not null,
      updated_at integer not null,
      primary key (page_id, key)
    );
  `);
}

const newId = () => crypto.randomBytes(5).toString('hex');
const nonce = () => crypto.randomBytes(9).toString('base64url');

export function cleanTitle(t: unknown, fallback = 'Page'): string {
  const s = String(t ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return s || fallback;
}

export function checkHtml(html: unknown): string {
  const s = typeof html === 'string' ? html : '';
  if (!s.trim()) throw new HttpError(400, 'html is empty');
  if (Buffer.byteLength(s) > MAX_PAGE) throw new HttpError(413, 'The page is over 2 MB; keep it smaller (embed less data).');
  return s;
}

interface Row {
  id: string;
  title: string;
  version: number;
  created_at: number;
  updated_at: number;
  session_key: string | null;
  link_nonce: string;
  versions: number;
  bytes: number;
  storage: number;
}

const SELECT = `select p.*, (select count(*) from page_versions v where v.page_id = p.id) as versions,
  (select bytes from page_versions v where v.page_id = p.id and v.version = p.version) as bytes,
  (select coalesce(sum(bytes), 0) from page_storage s where s.page_id = p.id) as storage from pages p`;

const toInfo = (r: Row): PageInfo => ({
  id: r.id,
  title: r.title,
  version: r.version,
  versions: r.versions,
  bytes: r.bytes ?? 0,
  storageBytes: r.storage,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  sessionKey: r.session_key ?? undefined,
});

export function listPages(db: DB): PageInfo[] {
  return (db.prepare(`${SELECT} order by p.updated_at desc`).all() as Row[]).map(toInfo);
}

export function pageInfo(db: DB, id: string): PageInfo | null {
  const r = db.prepare(`${SELECT} where p.id = ?`).get(String(id)) as Row | undefined;
  return r ? toInfo(r) : null;
}

export function mustPage(db: DB, id: string): PageInfo {
  const p = pageInfo(db, id);
  if (!p) throw new HttpError(404, 'No saved page with that id');
  return p;
}

export function versionsOf(db: DB, id: string): PageVersion[] {
  return (db.prepare('select version, title, bytes, created_at, by from page_versions where page_id = ? order by version desc').all(id) as { version: number; title: string; bytes: number; created_at: number; by: PageVersion['by'] }[]).map(
    (v) => ({ version: v.version, title: v.title, bytes: v.bytes, createdAt: v.created_at, by: v.by }),
  );
}

/** A version's page (the current one when `version` is left out). */
export function pageHtml(db: DB, id: string, version?: number): { title: string; html: string; version: number } | null {
  const v = version ?? (db.prepare('select version from pages where id = ?').get(id) as { version: number } | undefined)?.version;
  if (v === undefined) return null;
  const r = db.prepare('select title, html, version from page_versions where page_id = ? and version = ?').get(id, v) as { title: string; html: string; version: number } | undefined;
  return r ?? null;
}

/** Keeps the newest versions within the limits; the current one always stays. */
function prune(db: DB, id: string) {
  const list = db.prepare('select version, bytes from page_versions where page_id = ? order by version desc').all(id) as { version: number; bytes: number }[];
  let total = 0;
  const drop = list.filter((v, i) => {
    total += v.bytes;
    return i > 0 && (i >= VERSION_LIMITS.count || total > VERSION_LIMITS.bytes);
  });
  const del = db.prepare('delete from page_versions where page_id = ? and version = ?');
  for (const v of drop) del.run(id, v.version);
}

export function createPage(db: DB, p: { title: unknown; html: unknown; by: PageVersion['by']; sessionKey?: string; sourceItem?: string }): PageInfo {
  const html = checkHtml(p.html);
  const title = cleanTitle(p.title);
  if ((db.prepare('select count(*) as n from pages').get() as { n: number }).n >= MAX_PAGES) throw new HttpError(409, `Pages holds at most ${MAX_PAGES} pages; delete some first.`);
  const now = Date.now();
  let id = newId();
  while (db.prepare('select 1 from pages where id = ?').get(id)) id = newId();
  db.transaction(() => {
    db.prepare('insert into pages (id, title, version, created_at, updated_at, session_key, source_item, link_nonce) values (?, ?, 1, ?, ?, ?, ?, ?)').run(
      id,
      title,
      now,
      now,
      p.sessionKey ?? null,
      p.sourceItem ?? null,
      nonce(),
    );
    db.prepare('insert into page_versions (page_id, version, title, html, bytes, created_at, by) values (?, 1, ?, ?, ?, ?, ?)').run(id, title, html, Buffer.byteLength(html), now, p.by);
  })();
  return pageInfo(db, id)!;
}

/** A new version of a page: it becomes the current one, and its title the page's. */
export function addVersion(db: DB, id: string, p: { title?: unknown; html: unknown; by: PageVersion['by'] }): PageInfo {
  const cur = mustPage(db, id);
  const html = checkHtml(p.html);
  const title = p.title === undefined || p.title === null || !String(p.title).trim() ? cur.title : cleanTitle(p.title);
  const now = Date.now();
  db.transaction(() => {
    const next = ((db.prepare('select max(version) as v from page_versions where page_id = ?').get(id) as { v: number | null }).v ?? 0) + 1;
    db.prepare('insert into page_versions (page_id, version, title, html, bytes, created_at, by) values (?, ?, ?, ?, ?, ?, ?)').run(id, next, title, html, Buffer.byteLength(html), now, p.by);
    db.prepare('update pages set title = ?, version = ?, updated_at = ? where id = ?').run(title, next, now, id);
    prune(db, id);
  })();
  return pageInfo(db, id)!;
}

/** Brings an older version back, as a new version (nothing is lost). */
export function restoreVersion(db: DB, id: string, version: number): PageInfo {
  const old = pageHtml(db, id, version);
  if (!old) throw new HttpError(404, 'That version is no longer kept');
  return addVersion(db, id, { title: old.title, html: old.html, by: 'restore' });
}

export function renamePage(db: DB, id: string, title: unknown): PageInfo {
  mustPage(db, id);
  db.prepare('update pages set title = ?, updated_at = ? where id = ?').run(cleanTitle(title), Date.now(), id);
  return pageInfo(db, id)!;
}

export function deletePage(db: DB, id: string) {
  db.prepare('delete from pages where id = ?').run(id);
}

/** Which show_html calls of a session were kept, and as which page. */
export function keptIn(db: DB, sessionKey: string): Record<string, string> {
  const rows = db.prepare('select id, source_item from pages where session_key = ? and source_item is not null').all(sessionKey) as { id: string; source_item: string }[];
  return Object.fromEntries(rows.map((r) => [r.source_item, r.id]));
}

// ---- the page's own link ----------------------------------------------------------------------------

const linkSig = (id: string, n: string) => signWithKey(`page-link:${id}:${n}`).slice(0, 32);

/** The token in the page's own address (/pg/<token>): its id and a signature of it. */
export function pageToken(db: DB, id: string): string {
  const r = db.prepare('select link_nonce from pages where id = ?').get(id) as { link_nonce: string } | undefined;
  if (!r) throw new HttpError(404, 'No saved page with that id');
  return `${id}.${linkSig(id, r.link_nonce)}`;
}

/** The page a token opens, if the signature is right and the link was not reset since. */
export function pageByToken(db: DB, token: string): string | null {
  const [id, sig, extra] = String(token ?? '').split('.');
  if (!id || !sig || extra !== undefined || !/^[a-f0-9]{10}$/.test(id)) return null;
  const r = db.prepare('select link_nonce from pages where id = ?').get(id) as { link_nonce: string } | undefined;
  if (!r) return null;
  const want = linkSig(id, r.link_nonce);
  return want.length === sig.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig)) ? id : null;
}

/** A new link for the page; the old one stops working. */
export function resetPageLink(db: DB, id: string): string {
  mustPage(db, id);
  db.prepare('update pages set link_nonce = ? where id = ?').run(nonce(), id);
  return pageToken(db, id);
}

// ---- storage ------------------------------------------------------------------------------------------

const L = STORAGE_LIMITS;

function checkKey(k: unknown): string {
  if (typeof k !== 'string' || !k.length || k.length > L.key) throw new HttpError(400, `A storage key is 1 to ${L.key} characters`);
  return k;
}

/** The page's stored values, as JSON text by key. */
function rows(db: DB, id: string) {
  return db.prepare('select key, value, bytes from page_storage where page_id = ? order by key').all(id) as { key: string; value: string; bytes: number }[];
}

/** One call of window.naget.storage: get, set, remove or keys. */
export function storageOp(db: DB, id: string, body: unknown): { value: unknown } {
  const b = (body && typeof body === 'object' ? body : {}) as { op?: unknown; key?: unknown; value?: unknown };
  mustPage(db, id);
  switch (b.op) {
    case 'keys':
      return { value: rows(db, id).map((r) => r.key) };
    case 'get': {
      const r = db.prepare('select value from page_storage where page_id = ? and key = ?').get(id, checkKey(b.key)) as { value: string } | undefined;
      return { value: r ? JSON.parse(r.value) : null };
    }
    case 'remove':
      db.prepare('delete from page_storage where page_id = ? and key = ?').run(id, checkKey(b.key));
      return { value: null };
    case 'set': {
      const key = checkKey(b.key);
      const json = b.value === undefined ? undefined : JSON.stringify(b.value);
      if (json === undefined) throw new HttpError(400, 'set needs a value (use remove to delete a key)');
      putValues(db, id, [[key, json]]);
      return { value: null };
    }
    default:
      throw new HttpError(400, 'Storage knows get, set, remove and keys');
  }
}

/** Writes values (JSON text by key) within the limits: all of them, or none. */
export function putValues(db: DB, id: string, entries: [string, string][]) {
  db.transaction(() => {
    const now = Date.now();
    const have = new Map(rows(db, id).map((r) => [r.key, r.bytes]));
    let total = [...have.values()].reduce((a, n) => a + n, 0);
    const put = db.prepare('insert into page_storage (page_id, key, value, bytes, updated_at) values (?, ?, ?, ?, ?) on conflict(page_id, key) do update set value = excluded.value, bytes = excluded.bytes, updated_at = excluded.updated_at');
    for (const [k, json] of entries) {
      const key = checkKey(k);
      const bytes = Buffer.byteLength(json) + Buffer.byteLength(key);
      if (bytes > L.value) throw new HttpError(413, `That value is over ${L.value / 1024} KB`);
      total += bytes - (have.get(key) ?? 0);
      if (!have.has(key) && have.size >= L.keys) throw new HttpError(413, `A page keeps at most ${L.keys} keys`);
      if (total > L.total) throw new HttpError(413, `This page’s storage is full (${L.total / 1024 / 1024} MB)`);
      have.set(key, bytes);
      put.run(id, key, json, bytes, now);
    }
  })();
}

/** Everything a page keeps, for an agent to read (cut to `max` characters). */
export function storageText(db: DB, id: string, max = 16_000): string {
  const list = rows(db, id);
  if (!list.length) return '';
  const out = JSON.stringify(Object.fromEntries(list.map((r) => [r.key, JSON.parse(r.value)])), null, 1);
  return out.length > max ? `${out.slice(0, max)}\n… (${list.length} keys; cut here)` : out;
}
