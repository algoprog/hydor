// Saved pages: the Pages library in SQLite. Each save is a new version (the oldest go past a count and
// a size; an agent's saves of a page in a row, in one turn, are kept as one version: the last one, which says how many
// saves it holds); each page keeps its own small storage (window.hydor.storage), comments on its blocks (outside its HTML)
// and its icon (for links to it from other pages), and has a link of its own,
// signed with the app's key, that opens it on any device without the app's sign-in. A page of another kind
// (slides, a document, a spreadsheet: kinds.ts) keeps its model's text in place of HTML, and its own page is made
// from it when it shows; its pictures are kept apart (assets.ts).
import crypto from 'node:crypto';
import { cleanDescription, STORAGE_LIMITS, VERSION_LIMITS, type PageDataEntry, type PageInfo, type PageVersion } from '../../shared/pages.ts';
import { applyCommentOps, cleanPageComments, type PageComment } from '../../shared/page-comments.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { signWithKey } from '../links.ts';
import { dropRefs, initAssets, noteRefs } from './assets.ts';
import { fitFolder, initFolders } from './folders.ts';
import { kindOf, mustKind, type PageKind, type PageMode } from './kinds.ts';

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
  // An agent's version: the turn it was saved in (its session's, and which of its user's messages it answered), and how
  // many of its saves in a row it holds (folded into one).
  const vcols = (db.prepare('pragma table_info(page_versions)').all() as { name: string }[]).map((c) => c.name);
  if (!vcols.includes('turn')) db.exec('alter table page_versions add column turn text');
  if (!vcols.includes('steps')) db.exec('alter table page_versions add column steps integer');
  // Its picture in Pages: which version and data it shows (thumbs.ts).
  const cols = (db.prepare('pragma table_info(pages)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('thumb')) db.exec('alter table pages add column thumb text');
  // A slide deck, a document or a spreadsheet (kinds.ts), or a page of HTML (null).
  if (!cols.includes('kind')) db.exec('alter table pages add column kind text');
  // A template's screen belongs to the template (server/apps): its pages are its own, not the library's.
  if (!cols.includes('app')) db.exec('alter table pages add column app text');
  // The space it belongs to (shared/spaces.ts), or none: the Library shows each space's pages together.
  if (!cols.includes('space')) db.exec('alter table pages add column space text');
  // Who made a version, when it was someone the project is shared with (server/spaces/share.ts): their name.
  if (!(db.prepare('pragma table_info(page_versions)').all() as { name: string }[]).some((c) => c.name === 'who')) db.exec('alter table page_versions add column who text');
  // The Library folder it is in (folders.ts), or none: at its space's top.
  if (!cols.includes('folder')) db.exec('alter table pages add column folder text');
  // What it is, in a few sentences (shared/pages.ts cleanDescription): the Library's search finds it by it.
  if (!cols.includes('description')) db.exec('alter table pages add column description text');
  // Locked by its owner, so it doesn't change by accident (page-tools.ts): no new version until it is unlocked.
  if (!cols.includes('locked')) db.exec('alter table pages add column locked integer');
  initFolders(db);
  // A page's icon (the emoji the page editor puts at its top), for links to it in other pages: kept as each version is
  // saved, and read once from the pages saved before ('' for none).
  // Comments on its blocks (shared/page-comments.ts): kept with the page, outside its HTML, not by version.
  if (!cols.includes('comments')) db.exec('alter table pages add column comments text');
  if (!cols.includes('icon')) {
    db.exec('alter table pages add column icon text');
    const set = db.prepare('update pages set icon = ? where id = ?');
    const rows = db.prepare('select p.id, v.html from pages p join page_versions v on v.page_id = p.id and v.version = p.version where p.kind is null').all() as { id: string; html: string }[];
    db.transaction(() => {
      for (const r of rows) set.run(iconOf(r.html), r.id);
    })();
  }
  initAssets(db);
}

const newId = () => crypto.randomBytes(5).toString('hex');

/** A page's icon: the emoji in its .n-icon (the page editor's), or ''. */
export function iconOf(html: string): string {
  const m = /<div[^>]*\bclass="[^"]*\bn-icon\b[^"]*"[^>]*>\s*([^<]{1,16}?)\s*<\/div>/.exec(html.slice(0, 200_000));
  return m && !/[&<>"]/.test(m[1]) ? m[1] : '';
}
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
  thumb: string | null;
  kind: string | null;
  app: string | null;
  space: string | null;
  folder: string | null;
  icon: string | null;
  description: string | null;
  locked: number | null;
  versions: number;
  bytes: number;
  by: PageVersion['by'] | null;
  who: string | null;
  storage: number;
}

const SELECT = `select p.*, (select count(*) from page_versions v where v.page_id = p.id) as versions,
  (select bytes from page_versions v where v.page_id = p.id and v.version = p.version) as bytes,
  (select by from page_versions v where v.page_id = p.id and v.version = p.version) as by,
  (select who from page_versions v where v.page_id = p.id and v.version = p.version) as who,
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
  by: r.by ?? undefined,
  ...(r.who ? { who: r.who } : {}),
  thumb: r.thumb ?? undefined,
  ...(kindOf(r.kind) ? { kind: r.kind as PageKind } : {}),
  ...(r.app ? { app: r.app } : {}),
  ...(r.space ? { space: r.space } : {}),
  ...(r.folder ? { folder: r.folder } : {}),
  ...(r.icon ? { icon: r.icon } : {}),
  ...(r.description ? { description: r.description } : {}),
  ...(r.locked ? { locked: true } : {}),
});

/** The library's pages: a template's screens stay with their template. */
export function listPages(db: DB): PageInfo[] {
  return (db.prepare(`${SELECT} where p.app is null order by p.updated_at desc`).all() as Row[]).map(toInfo);
}

/** A template's screens, as pages. */
export function pagesOfApp(db: DB, app: string): PageInfo[] {
  return (db.prepare(`${SELECT} where p.app = ? order by p.created_at`).all(app) as Row[]).map(toInfo);
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
  return (
    db.prepare('select version, title, bytes, created_at, by, steps, who from page_versions where page_id = ? order by version desc').all(id) as {
      version: number;
      title: string;
      bytes: number;
      created_at: number;
      by: PageVersion['by'];
      steps: number | null;
      who: string | null;
    }[]
  ).map((v) => ({ version: v.version, title: v.title, bytes: v.bytes, createdAt: v.created_at, by: v.by, ...(v.steps && v.steps > 1 ? { steps: v.steps } : {}), ...(v.who ? { who: v.who } : {}) }));
}

/** A version as it is kept: a page's HTML, or another kind's text (the current version when `version` is left out). */
export function pageSource(db: DB, id: string, version?: number): { title: string; text: string; version: number; kind: 'page' | PageKind } | null {
  const p = db.prepare('select version, kind from pages where id = ?').get(id) as { version: number; kind: string | null } | undefined;
  const v = version ?? p?.version;
  if (!p || v === undefined) return null;
  const r = db.prepare('select title, html, version from page_versions where page_id = ? and version = ?').get(id, v) as { title: string; html: string; version: number } | undefined;
  return r ? { title: r.title, text: r.html, version: r.version, kind: kindOf(p.kind) ? (p.kind as PageKind) : 'page' } : null;
}

/**
 * A version's page as HTML to show (the current one when `version` is left out): another kind's own page, to
 * click through, every page of it to print, or its first page still.
 */
export async function pageHtml(db: DB, id: string, version?: number, mode: PageMode = 'viewer'): Promise<{ title: string; html: string; version: number } | null> {
  const src = pageSource(db, id, version);
  if (!src) return null;
  if (src.kind === 'page') return { title: src.title, html: src.text, version: src.version };
  return { title: src.title, html: await mustKind(src.kind).page(db, src.text, src.title, mode), version: src.version };
}

/** A version's model (another kind than a page of HTML), for its editor. */
export function pageModel(db: DB, id: string, version?: number): unknown {
  const src = pageSource(db, id, version);
  if (!src || src.kind === 'page') return null;
  return mustKind(src.kind).read(src.text);
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
  if (drop.length) dropRefs(db, id, drop.map((v) => v.version));
}

/** What a new version keeps: a page's HTML, or another kind's text (checked, its new pictures kept apart). */
function contentOf(db: DB, kind: 'page' | PageKind, p: { html?: unknown; model?: unknown }): { text: string; sources: string[] } {
  if (kind === 'page') {
    if (p.model !== undefined && p.html === undefined) throw new HttpError(400, 'This is a page of HTML: send its html.');
    return { text: checkHtml(p.html), sources: [] };
  }
  const k = mustKind(kind);
  if (p.model === undefined) throw new HttpError(400, `This page is a ${k.noun}: send its model.`);
  const out = k.keep(db, typeof p.model === 'string' ? safeJson(p.model) : p.model);
  if (Buffer.byteLength(out.text) > k.max) throw new HttpError(413, `The ${k.noun} is over ${Math.round(k.max / 1024 / 1024)} MB without its pictures; make it smaller.`);
  return out;
}

const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    throw new HttpError(400, 'The model is not valid JSON');
  }
};

const DEFAULT_TITLE: Record<string, string> = { slides: 'Slides', doc: 'Document', sheet: 'Spreadsheet', notebook: 'Notebook' };

/**
 * A new page. `folder`: the Library folder it goes in, of its `space` (folders.ts placeFor makes the two agree).
 * `description`: what it is, in a few sentences (cut to DESCRIPTION_WORDS words).
 */
export function createPage(
  db: DB,
  p: {
    title: unknown;
    html?: unknown;
    kind?: PageKind;
    model?: unknown;
    by: PageVersion['by'];
    sessionKey?: string;
    sourceItem?: string;
    app?: string;
    space?: string | null;
    folder?: string | null;
    turn?: string;
    description?: unknown;
  },
): PageInfo {
  const kind = p.kind ?? 'page';
  const { text: html, sources } = contentOf(db, kind, p);
  const title = cleanTitle(p.title, DEFAULT_TITLE[kind] ?? 'Page');
  if ((db.prepare('select count(*) as n from pages').get() as { n: number }).n >= MAX_PAGES) throw new HttpError(409, `Pages holds at most ${MAX_PAGES} pages; delete some first.`);
  const now = Date.now();
  let id = newId();
  while (db.prepare('select 1 from pages where id = ?').get(id)) id = newId();
  db.transaction(() => {
    db.prepare('insert into pages (id, title, version, created_at, updated_at, session_key, source_item, link_nonce, kind, app, space, folder, description) values (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      title,
      now,
      now,
      p.sessionKey ?? null,
      p.sourceItem ?? null,
      nonce(),
      kind === 'page' ? null : kind,
      p.app ?? null,
      p.app ? null : (p.space ?? null),
      p.app ? null : (p.folder ?? null),
      cleanDescription(p.description) || null,
    );
    db.prepare('insert into page_versions (page_id, version, title, html, bytes, created_at, by, turn) values (?, 1, ?, ?, ?, ?, ?, ?)').run(id, title, html, Buffer.byteLength(html), now, p.by, p.turn ?? null);
    if (kind === 'page') db.prepare('update pages set icon = ? where id = ?').run(iconOf(html), id);
    noteRefs(db, id, 1, sources);
  })();
  return pageInfo(db, id)!;
}

/** How long apart an agent's saves in a row may be to be kept as one version. */
export const FOLD_MS = 5 * 60_000;

/**
 * A new version of a page: it becomes the current one, and its title the page's. An agent's save in a turn (`turn`: its
 * session's, answering one message of its user) takes the place of the version before it when that was saved in the
 * same turn less than FOLD_MS ago: saves in a row are one version (the last), its number still the next one, so an
 * editor holding the one before hears that a newer one is there. A version the user made, kept or brought back is never
 * folded into. `onFold` hears which version went. `who`: someone the project is shared with made it (their name).
 * `description`, when given, takes the place of the page's (left out, it keeps the one it has).
 */
export function addVersion(
  db: DB,
  id: string,
  p: { title?: unknown; html?: unknown; model?: unknown; by: PageVersion['by']; turn?: string; onFold?: (version: number) => void; who?: string; description?: unknown },
): PageInfo {
  const cur = mustPage(db, id);
  if (cur.locked) throw new HttpError(423, `“${cur.title}” is locked, so it doesn't change by accident: unlock it first (More → Unlock the page).`);
  const { text: html, sources } = contentOf(db, cur.kind ?? 'page', p);
  const title = p.title === undefined || p.title === null || !String(p.title).trim() ? cur.title : cleanTitle(p.title);
  const now = Date.now();
  let folded: number | null = null;
  db.transaction(() => {
    const last = db.prepare('select version, by, turn, created_at, steps from page_versions where page_id = ? order by version desc limit 1').get(id) as
      | { version: number; by: PageVersion['by']; turn: string | null; created_at: number; steps: number | null }
      | undefined;
    const fold = !!last && p.by === 'agent' && !!p.turn && last.by === 'agent' && last.turn === p.turn && last.version === cur.version && now - last.created_at <= FOLD_MS;
    const next = ((db.prepare('select max(version) as v from page_versions where page_id = ?').get(id) as { v: number | null }).v ?? 0) + 1;
    db.prepare('insert into page_versions (page_id, version, title, html, bytes, created_at, by, turn, steps, who) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      next,
      title,
      html,
      Buffer.byteLength(html),
      now,
      p.by,
      p.turn ?? null,
      fold ? (last!.steps ?? 1) + 1 : null,
      p.who ?? null,
    );
    db.prepare('update pages set title = ?, version = ?, updated_at = ? where id = ?').run(title, next, now, id);
    const description = cleanDescription(p.description);
    if (description) db.prepare('update pages set description = ? where id = ?').run(description, id);
    if (!cur.kind) db.prepare('update pages set icon = ? where id = ?').run(iconOf(html), id);
    noteRefs(db, id, next, sources);
    if (fold) {
      db.prepare('delete from page_versions where page_id = ? and version = ?').run(id, last!.version);
      dropRefs(db, id, [last!.version]);
      folded = last!.version;
    }
    prune(db, id);
  })();
  if (folded !== null) p.onFold?.(folded);
  return pageInfo(db, id)!;
}

/** Brings an older version back, as a new version (nothing is lost). */
export function restoreVersion(db: DB, id: string, version: number): PageInfo {
  const old = pageSource(db, id, version);
  if (!old) throw new HttpError(404, 'That version is no longer kept');
  return addVersion(db, id, old.kind === 'page' ? { title: old.title, html: old.text, by: 'restore' } : { title: old.title, model: mustKind(old.kind).read(old.text), by: 'restore' });
}

/** A copy of a page's current version, as a page of its own (its data stays with the original). */
export function copyPage(db: DB, id: string): PageInfo {
  const p = mustPage(db, id);
  const cur = pageSource(db, id)!;
  const title = cleanTitle(`${p.title} (copy)`);
  const place = { space: p.space, folder: p.folder, description: p.description };
  return createPage(db, cur.kind === 'page' ? { title, html: cur.text, by: 'made', ...place } : { title, kind: cur.kind, model: mustKind(cur.kind).read(cur.text), by: 'made', ...place });
}

export function renamePage(db: DB, id: string, title: unknown): PageInfo {
  mustPage(db, id);
  db.prepare('update pages set title = ?, updated_at = ? where id = ?').run(cleanTitle(title), Date.now(), id);
  return pageInfo(db, id)!;
}

/** Gives a page its description (cut to DESCRIPTION_WORDS words; empty takes it away). Not a change to the page itself. */
export function describePage(db: DB, id: string, description: unknown): PageInfo {
  mustPage(db, id);
  db.prepare('update pages set description = ? where id = ?').run(cleanDescription(description) || null, id);
  return pageInfo(db, id)!;
}

/** Puts a page in a space (its id, checked by the caller), or in none; out of its folder unless that is of the space. Moving it is not a change to the page. */
export function setPageSpace(db: DB, id: string, space: string | null): PageInfo {
  const p = mustPage(db, id);
  if (p.app) throw new HttpError(400, 'An app’s screen stays with its app');
  db.prepare('update pages set space = ? where id = ?').run(space, id);
  fitFolder(db, 'pages', id);
  return pageInfo(db, id)!;
}

export function deletePage(db: DB, id: string) {
  db.prepare('delete from pages where id = ?').run(id);
  dropRefs(db, id);
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

// ---- comments on its blocks ------------------------------------------------------------------------------

/** A page's comments (a page of HTML's: other kinds keep theirs in their model). */
export function pageComments(db: DB, id: string): PageComment[] {
  const r = db.prepare('select comments from pages where id = ?').get(id) as { comments: string | null } | undefined;
  if (!r?.comments) return [];
  try {
    return cleanPageComments(JSON.parse(r.comments));
  } catch {
    return [];
  }
}

/** Changes a page's comments (as `by` makes them): the list after them, what could not be done, and the new ones' ids. */
export function changeComments(db: DB, id: string, ops: unknown, by: 'user' | 'agent'): { list: PageComment[]; notes: string[]; added: string[] } {
  const p = mustPage(db, id);
  if (p.kind) throw new HttpError(400, `This page is a ${mustKind(p.kind).noun}: its comments are in it.`);
  return db.transaction(() => {
    const out = applyCommentOps(pageComments(db, id), ops, by);
    db.prepare('update pages set comments = ? where id = ?').run(out.list.length ? JSON.stringify(out.list) : null, id);
    return out;
  })();
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

/** One call of window.hydor.storage: get, set, remove or keys. */
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

/** Every value a page keeps, for its Data view. */
export function storageEntries(db: DB, id: string): PageDataEntry[] {
  mustPage(db, id);
  return (db.prepare('select key, value, bytes, updated_at from page_storage where page_id = ? order by key').all(id) as { key: string; value: string; bytes: number; updated_at: number }[]).map(
    (r) => ({ key: r.key, value: JSON.parse(r.value), bytes: r.bytes, updatedAt: r.updated_at }),
  );
}

/** Forgets everything a page keeps. */
export function clearStorage(db: DB, id: string) {
  mustPage(db, id);
  db.prepare('delete from page_storage where page_id = ?').run(id);
}

/** When a page's data last changed (0: it keeps none). */
export function dataStamp(db: DB, id: string): number {
  return (db.prepare('select coalesce(max(updated_at), 0) as t from page_storage where page_id = ?').get(id) as { t: number }).t;
}

/** Everything a page keeps, as JSON text by key (a picture of the page shows it). */
export function storageMap(db: DB, id: string): Record<string, string> {
  return Object.fromEntries(rows(db, id).map((r) => [r.key, r.value]));
}

/** What a page's databases hold (shared/page-db.ts), as JSON text by key: shown by a published copy or a page saved as a file. */
export function dbSeed(db: DB, id: string): Record<string, string> {
  return Object.fromEntries(rows(db, id).flatMap((r) => (r.key.startsWith('n-db:') ? [[r.key, r.value]] : [])));
}

/** Everything a page keeps, for an agent to read (cut to `max` characters); its databases are shown apart (dbsForAgent). */
export function storageText(db: DB, id: string, max = 16_000): string {
  const list = rows(db, id).filter((r) => !r.key.startsWith('n-db:'));
  if (!list.length) return '';
  const out = JSON.stringify(Object.fromEntries(list.map((r) => [r.key, JSON.parse(r.value)])), null, 1);
  return out.length > max ? `${out.slice(0, max)}\n… (${list.length} keys; cut here)` : out;
}
