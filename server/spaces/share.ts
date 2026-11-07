// Sharing with people: the owner invites someone (an advisor, a student, a client) by a personal link, /p/<token>,
// into one project (to see it and comment on its documents under their own name, or with Edit documents to change them
// too), or to one thing of the Library alone: a document, spreadsheet, slides, LaTeX document, notebook, page or design,
// or a picture, video or sound (View and comment, or Edit). Each link is one person's: their name, what they may do and
// until when. Only its hash is kept; it stops at once when the owner stops it (or the thing is deleted), and a new link
// for the same person keeps who they are (their comments stay theirs). A link that was stopped, ran out or was made
// again says so; a token that never opened anything counts as a wrong password from its address (server/auth.ts). What
// a person's browser reads and sends is portal.ts (and portal-media.ts), under /p-api/<token>/… alone.
//
// Here: the links, the owner's routes, what the owner hears (a notice and an inbox line when someone comments, until
// it is answered or resolved), what an agent in a shared project is told (who reads its sessions), and comments by
// people carried into a save made on an older version, so a document, deck or workbook saved on top of them keeps
// them. A person's comment on a document, slides or a spreadsheet is a new version of it (comments live in it, so
// agents read and answer them as the owner's); a run of them in a row is kept as one version, its latest.
//
// Routes, signed in (the owner's):
//   GET    /api/projects/:id/shares               the people it is shared with, and the name they see the owner by
//   POST   /api/projects/:id/shares               invite someone { name, role, days } → { share, token }
//   PATCH  /api/projects/:id/shares/:share        change what they may do, or until when { role?, days?, name? }
//   POST   /api/projects/:id/shares/:share/link   a new link for them (the old one stops) → { share, token }
//   DELETE /api/projects/:id/shares/:share        stop sharing with them
//   …and the same for one thing: /api/pages/:id/shares… (a page of any kind) and /api/media/:id/shares… (a picture,
//   video or sound)
//   GET    /api/shares                            every thing shared alone, with how many people
//   PUT    /api/projects/sharing                  the name people see the owner's comments under { owner }
import crypto from 'node:crypto';
import type { Comment } from '../../shared/comments.ts';
import { normalizeDoc, withComments, type Doc } from '../../shared/docs.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import { normalizeTex, type TexComment, type TexDoc } from '../../shared/latex.ts';
import type { MediaItem } from '../../shared/media.ts';
import type { PageInfo } from '../../shared/pages.ts';
import { SHARE_ROLES, type ProjectShare, type ShareActivity, type ShareRole, type ShareThing } from '../../shared/share.ts';
import type { Space } from '../../shared/spaces.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { mediaComments } from '../media/comments.ts';
import { getMedia, initMedia } from '../media/store.ts';
import { anchorComments } from '../pages/docs.ts';
import { pageComments, pageInfo, pageModel } from '../pages/store.ts';
import { spaceById } from './index.ts';
import { portalMediaRoutes } from './portal-media.ts';
import { portalRoutes } from './portal.ts';

const DAY = 86_400_000;
/** Links that stopped, ran out or were made again are remembered this long, to say so rather than count a guess. */
const REMEMBER = 30 * DAY;
/** People one project can be shared with at once. */
const MOST = 50;
const OWNER_KEY = 'sharing:owner';

const made = new WeakSet<DB>();
export function shareTables(db: DB) {
  if (made.has(db)) return;
  db.exec(`
    create table if not exists project_shares (
      id text primary key,
      space text not null,
      name text not null,
      role text not null,
      hash text not null,
      created_at integer not null,
      expires_at integer,
      stopped_at integer,
      seen_at integer,
      views integer not null default 0,
      activity text
    );
    create index if not exists project_shares_space on project_shares(space);
    create unique index if not exists project_shares_hash on project_shares(hash);
    create table if not exists project_share_old (hash text primary key, share text not null, at integer not null);
    create table if not exists project_share_versions (page_id text not null, version integer not null, share text not null, kind text not null, at integer not null, primary key (page_id, version));
    create table if not exists project_share_comments (page_id text not null, cid text not null, parent text, share text not null, name text not null, text text not null, at integer not null, primary key (page_id, cid));
  `);
  // One thing shared alone (its id, and 'page' or 'media'); none: the project in `space` ('' for a thing).
  const cols = (db.prepare('pragma table_info(project_shares)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('item')) db.exec('alter table project_shares add column item text');
  if (!cols.includes('item_kind')) db.exec('alter table project_shares add column item_kind text');
  db.exec('create index if not exists project_shares_item on project_shares(item)');
  made.add(db);
}

interface Row {
  id: string;
  space: string;
  name: string;
  role: string;
  hash: string;
  created_at: number;
  expires_at: number | null;
  stopped_at: number | null;
  seen_at: number | null;
  views: number;
  activity: string | null;
  item: string | null;
  item_kind: string | null;
}

const hashOf = (token: string) => crypto.createHash('sha256').update(`hydor-share:${token}`).digest('hex');
const newToken = () => crypto.randomBytes(24).toString('base64url');
/** What a token looks like: anything else opens nothing (and is counted as a guess). */
export const TOKEN = /^[A-Za-z0-9_-]{32}$/;

function activityOf(s: string | null): ShareActivity | undefined {
  if (!s) return undefined;
  try {
    const a = JSON.parse(s);
    return a && typeof a.at === 'number' && typeof a.what === 'string' ? a : undefined;
  } catch {
    return undefined;
  }
}

const thingOf = (r: Pick<Row, 'item' | 'item_kind'>): ShareThing | undefined => (r.item && (r.item_kind === 'page' || r.item_kind === 'media') ? { kind: r.item_kind, id: r.item } : undefined);

const toShare = (r: Row): ProjectShare => ({
  id: r.id,
  space: r.space,
  ...(thingOf(r) ? { item: thingOf(r) } : {}),
  name: r.name,
  role: r.role === 'edit' ? 'edit' : 'comment',
  createdAt: r.created_at,
  ...(r.expires_at ? { expiresAt: r.expires_at } : {}),
  ...(r.seen_at ? { seenAt: r.seen_at } : {}),
  views: r.views,
  ...(r.activity ? { activity: activityOf(r.activity) } : {}),
});

const cleanName = (v: unknown) =>
  String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

function roleOf(v: unknown): ShareRole {
  if (v === 'comment' || v === 'edit') return v;
  throw new HttpError(400, `role: "comment" (${SHARE_ROLES.comment}) or "edit" (${SHARE_ROLES.edit})`);
}

/** Until when a link works, from days given now: a number of days (at most a year), or null for until it is stopped. */
function expiryOf(days: unknown, now: number): number | null {
  if (days === null || days === 0 || days === '0') return null;
  const n = Number(days);
  if (!Number.isFinite(n) || n <= 0) throw new HttpError(400, 'days: how many days the link works (7, 30…), or null for until you stop it');
  return now + Math.min(n, 365) * DAY;
}

/** What a link opens: a project, or one thing of the Library alone. */
export type ShareScope = { space: string } | { thing: ShareThing };

/** The rows of a scope: a project's own (not a thing's of it), or a thing's. */
const where = (sc: ShareScope): { sql: string; args: string[] } =>
  'space' in sc ? { sql: 'space = ? and item is null', args: [sc.space] } : { sql: 'item = ? and item_kind = ?', args: [sc.thing.id, sc.thing.kind] };

/** Links of things that were deleted stop (they already open nothing): they say so for a month, then go. */
function stopGoneThings(db: DB) {
  const now = Date.now();
  try {
    db.prepare("update project_shares set stopped_at = ? where stopped_at is null and item_kind = 'page' and item not in (select id from pages where app is null)").run(now);
  } catch {}
  try {
    initMedia(db);
    db.prepare("update project_shares set stopped_at = ? where stopped_at is null and item_kind = 'media' and item not in (select id from media)").run(now);
  } catch {}
}

/** Links that stopped or ran out a month ago, and old links made again, are forgotten. */
function sweep(db: DB) {
  const old = Date.now() - REMEMBER;
  stopGoneThings(db);
  db.prepare('delete from project_shares where (stopped_at is not null and stopped_at < ?) or (expires_at is not null and expires_at < ?)').run(old, old);
  db.prepare('delete from project_share_old where at < ?').run(old);
}

/** The people a project (or a thing) is shared with, the newest first; those whose link ran out stay (to see, invite again or remove). */
export function listShares(db: DB, space: string | ShareScope): ProjectShare[] {
  shareTables(db);
  const w = where(typeof space === 'string' ? { space } : space);
  return (db.prepare(`select * from project_shares where ${w.sql} and stopped_at is null order by created_at desc`).all(...w.args) as Row[]).map(toShare);
}

function mustIn(db: DB, sc: ShareScope, id: string): Row {
  shareTables(db);
  const w = where(sc);
  const r = db.prepare(`select * from project_shares where id = ? and ${w.sql} and stopped_at is null`).get(id, ...w.args) as Row | undefined;
  if (!r) throw new HttpError(404, 'space' in sc ? 'That person no longer has this project shared with them' : 'That person no longer has this shared with them');
  return r;
}

/** A link for someone, to a project or one thing: their link (its token, shown once). */
export function createLink(db: DB, sc: ShareScope, b: Record<string, unknown>): { share: ProjectShare; token: string } {
  shareTables(db);
  sweep(db);
  const name = cleanName(b.name);
  if (!name) throw new HttpError(400, 'Who is it for? Give their name');
  const role = roleOf(b.role ?? 'comment');
  const now = Date.now();
  const expires = expiryOf(b.days === undefined ? 30 : b.days, now);
  const w = where(sc);
  const live = (db.prepare(`select count(*) as n from project_shares where ${w.sql} and stopped_at is null`).get(...w.args) as { n: number }).n;
  if (live >= MOST) throw new HttpError(409, 'space' in sc ? `A project can be shared with ${MOST} people at once; stop sharing with some first` : `It can be shared with ${MOST} people at once; stop sharing with some first`);
  const token = newToken();
  let id = `ps${crypto.randomBytes(4).toString('hex')}`;
  while (db.prepare('select 1 from project_shares where id = ?').get(id)) id = `ps${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('insert into project_shares (id, space, name, role, hash, created_at, expires_at, views, item, item_kind) values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)').run(
    id,
    'space' in sc ? sc.space : '',
    name,
    role,
    hashOf(token),
    now,
    expires,
    'thing' in sc ? sc.thing.id : null,
    'thing' in sc ? sc.thing.kind : null,
  );
  return { share: toShare(mustIn(db, sc, id)), token };
}

/** Shares a project with someone: their link (its token, shown once). */
export const createShare = (db: DB, space: Space, b: Record<string, unknown>) => createLink(db, { space: space.id }, b);

/** Changes what someone may do, until when (days from now), or their name; their link stays the same. */
export function updateLink(db: DB, sc: ShareScope, id: string, b: Record<string, unknown>): ProjectShare {
  const r = mustIn(db, sc, id);
  const name = b.name === undefined ? r.name : cleanName(b.name);
  if (!name) throw new HttpError(400, 'Give their name');
  const role = b.role === undefined ? r.role : roleOf(b.role);
  const expires = b.days === undefined ? r.expires_at : expiryOf(b.days, Date.now());
  db.prepare('update project_shares set name = ?, role = ?, expires_at = ? where id = ?').run(name, role, expires, id);
  return toShare(mustIn(db, sc, id));
}
export const updateShare = (db: DB, space: Space, id: string, b: Record<string, unknown>) => updateLink(db, { space: space.id }, id, b);

/** A new link for someone; the old one stops (and says so when opened). They stay who they were. */
export function remakeLink(db: DB, sc: ShareScope, id: string): { share: ProjectShare; token: string } {
  const r = mustIn(db, sc, id);
  const token = newToken();
  db.transaction(() => {
    db.prepare('insert or replace into project_share_old (hash, share, at) values (?, ?, ?)').run(r.hash, id, Date.now());
    db.prepare('update project_shares set hash = ? where id = ?').run(hashOf(token), id);
  })();
  return { share: toShare(mustIn(db, sc, id)), token };
}
export const newLink = (db: DB, space: Space, id: string) => remakeLink(db, { space: space.id }, id);

/** Stops sharing with someone: their link stops at once. What they wrote stays, under their name. */
export function stopLink(db: DB, sc: ShareScope, id: string) {
  mustIn(db, sc, id);
  db.prepare('update project_shares set stopped_at = ? where id = ?').run(Date.now(), id);
}
export const stopShare = (db: DB, space: Space, id: string) => stopLink(db, { space: space.id }, id);

/** Every thing shared alone, with how many people have a link to it that works now. */
export function sharedThings(db: DB): (ShareThing & { people: number })[] {
  shareTables(db);
  const rows = db
    .prepare('select item, item_kind, count(*) as n from project_shares where item is not null and stopped_at is null and (expires_at is null or expires_at > ?) group by item, item_kind')
    .all(Date.now()) as { item: string; item_kind: string; n: number }[];
  return rows.flatMap((r) => {
    const t = thingOf(r);
    return t ? [{ ...t, people: r.n }] : [];
  });
}

/** What a link opens, as its person may see it. */
export type Opened = { share: ProjectShare; space: Space } | { share: ProjectShare; page: PageInfo } | { share: ProjectShare; media: MediaItem };

/** The person a link is for, with what it opens; `gone` says why a link that worked once no longer does; null: no link at all. */
export function openShare(db: DB, token: string): Opened | { gone: string } | null {
  shareTables(db);
  if (!TOKEN.test(token)) return null;
  const h = hashOf(token);
  const r = db.prepare('select * from project_shares where hash = ?').get(h) as Row | undefined;
  if (!r) return db.prepare('select 1 from project_share_old where hash = ?').get(h) ? { gone: 'This link was replaced by a new one. Ask for the new link.' } : null;
  if (r.stopped_at) return { gone: 'This link was turned off.' };
  if (r.expires_at && r.expires_at <= Date.now()) return { gone: 'This link has expired.' };
  const thing = thingOf(r);
  if (thing?.kind === 'page') {
    const page = pageInfo(db, thing.id);
    return page && !page.app ? { share: toShare(r), page } : { gone: 'This is no longer shared: it was deleted.' };
  }
  if (thing?.kind === 'media') {
    const media = getMedia(db, thing.id);
    return media ? { share: toShare(r), media } : { gone: 'This is no longer shared: it was deleted.' };
  }
  if (r.item) return { gone: 'This link was turned off.' };
  const space = spaceById(db, r.space);
  if (!space) return { gone: 'This project is no longer shared.' };
  return { share: toShare(r), space };
}

/** They opened it: when, and a visit counted when half an hour has gone by since the last. */
export function noteVisit(db: DB, s: ProjectShare) {
  const now = Date.now();
  if (s.seenAt && now - s.seenAt < 60_000) return;
  const visit = !s.seenAt || now - s.seenAt > 30 * 60_000;
  db.prepare(`update project_shares set seen_at = ?${visit ? ', views = views + 1' : ''} where id = ?`).run(now, s.id);
}

/** What they did last (commented on a document, changed one…), for the owner's list of people. */
export function noteActivity(db: DB, shareId: string, what: ShareActivity['what'], page?: { id: string; title: string }) {
  const a: ShareActivity = { at: Date.now(), what, ...(page ? { page: page.id, title: page.title } : {}) };
  db.prepare('update project_shares set activity = ?, seen_at = ? where id = ?').run(JSON.stringify(a), a.at, shareId);
}

/** The name the owner's comments show under, to the people a project is shared with. */
export const ownerName = (db: DB) => kvGet(db, OWNER_KEY) || 'Owner';

// ---- comments by people --------------------------------------------------------------------------------------

/** A person, as their comments carry them. */
export interface Who {
  id: string;
  name: string;
}

export const stamp = (w: Who) => ({ by: 'person' as const, name: w.name, who: w.id });

/** Who wrote a comment, as it is kept: what a person's save may not change. */
const authorOf = (c: Pick<Comment, 'by' | 'name' | 'who'>) => (c.by === 'person' ? { by: c.by, name: c.name, who: c.who } : { by: c.by });

const mine = (c: Pick<Comment, 'by' | 'who'>, w: Who) => c.by === 'person' && c.who === w.id;

/** A comment of a person's save, against the one kept: its words (theirs alone), where it is and whether it is resolved as they chose, its replies with theirs added. */
function merged<C extends Comment>(s: C, g: C, w: Who, now: number): C {
  const known = new Set((s.replies ?? []).map((r) => r.id));
  const added = (g.replies ?? []).filter((r) => !known.has(r.id)).map((r) => ({ ...r, ...stamp(w), at: now }));
  const replies = [...(s.replies ?? []), ...added];
  const { by: _b, name: _n, who: _w, resolved: _r, replies: _rs, author: _a, ...where } = g;
  const next = { ...s, ...where, ...authorOf(s), text: mine(s, w) ? g.text : s.text, at: s.at, ...(replies.length ? { replies } : {}) } as C;
  if (g.resolved) next.resolved = true;
  else delete next.resolved;
  if (!replies.length) delete next.replies;
  return next;
}

/** A comment new in a person's save: under their name, as its replies. */
const fresh = <C extends Comment>(g: C, w: Who, now: number): C => {
  const { author: _a, ...rest } = g;
  return { ...rest, ...stamp(w), at: now, replies: g.replies?.map((r) => ({ ...r, ...stamp(w), at: now })) } as C;
};

/**
 * The comments a person's save keeps: what they added (new comments and replies, under their name), theirs as they
 * changed them, and everyone else's as they were, resolved or reopened as they chose. What they took out of their
 * own goes; anyone else's comes back.
 */
export function personComments<C extends Comment>(stored: C[], given: C[], w: Who, now = Date.now()): C[] {
  return personLists(new Map([['', stored]]), new Map([['', given]]), w, now).get('') ?? [];
}

/**
 * personComments for comments kept in several lists (a deck's, one a slide; a workbook's, one a sheet): a comment
 * known in any of them is not new, wherever it is now (it moved with its part), and anyone else's that a list left
 * out comes back to its own, when that slide or sheet is still there.
 */
export function personLists<C extends Comment>(stored: Map<string, C[]>, given: Map<string, C[]>, w: Who, now = Date.now()): Map<string, C[]> {
  const byId = new Map<string, C>();
  for (const list of stored.values()) for (const c of list) byId.set(c.id, c);
  const seen = new Set<string>();
  const out = new Map<string, C[]>();
  for (const [k, list] of given) {
    const kept: C[] = [];
    for (const g of list) {
      const s = byId.get(g.id);
      if (!s) kept.push(fresh(g, w, now));
      else if (!seen.has(s.id)) {
        seen.add(s.id);
        kept.push(merged(s, g, w, now));
      }
    }
    out.set(k, kept);
  }
  for (const [k, list] of stored) for (const s of list) if (!seen.has(s.id) && !mine(s, w) && out.has(k)) out.get(k)!.push(s);
  return out;
}

// ---- where comments live in a page's model -------------------------------------------------------------------------

/**
 * A page's comments by where they are kept: a document's and a LaTeX document's in one list (''), a deck's one list a
 * slide and a workbook's one list a sheet (by its id). None for a notebook or a page of HTML (whose are kept apart).
 */
export function commentLists(kind: PageInfo['kind'], model: unknown): Map<string, Comment[]> {
  const m = (model && typeof model === 'object' ? model : {}) as Record<string, unknown>;
  const out = new Map<string, Comment[]>();
  const list = (v: unknown) => (Array.isArray(v) ? (v as Comment[]) : []);
  if (kind === 'doc' || kind === 'tex') out.set('', list(m.comments));
  const parts = kind === 'slides' ? m.slides : kind === 'sheet' ? m.sheets : undefined;
  if (Array.isArray(parts)) for (const x of parts) if (x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') out.set((x as { id: string }).id, list((x as { comments?: unknown }).comments));
  return out;
}

/** A page's model with some of its lists of comments changed (those `lists` has; the others as they were). */
export function withLists(kind: PageInfo['kind'], model: unknown, lists: Map<string, Comment[]>): unknown {
  const m = { ...((model && typeof model === 'object' ? model : {}) as Record<string, unknown>) };
  const put = (o: Record<string, unknown>, list: Comment[] | undefined) => {
    if (!list) return o;
    const { comments: _c, ...rest } = o;
    return list.length ? { ...rest, comments: list } : rest;
  };
  if (kind === 'doc' || kind === 'tex') return put(m, lists.get(''));
  const key = kind === 'slides' ? 'slides' : kind === 'sheet' ? 'sheets' : null;
  if (key && Array.isArray(m[key])) m[key] = (m[key] as Record<string, unknown>[]).map((x) => (x && typeof x.id === 'string' && lists.has(x.id) ? put(x, lists.get(x.id)) : x));
  return m;
}

/** Every list of a model changed alike. */
export const mapLists = (kind: PageInfo['kind'], model: unknown, f: (list: Comment[]) => Comment[]) =>
  withLists(kind, model, new Map([...commentLists(kind, model)].map(([k, l]) => [k, f(l)])));

/** The owner's comments as a person's page shows them: under the name the owner gave. */
export function forPerson<C extends Comment>(list: C[] | undefined, owner: string): C[] {
  const name = (c: { by: Comment['by'] }) => (c.by === 'user' ? { by: 'person' as const, name: owner, who: 'owner' } : {});
  return (list ?? []).map((c) => ({ ...c, ...name(c), ...(c.replies ? { replies: c.replies.map((r) => ({ ...r, ...name(r) })) } : {}) }));
}

/** Words as the text has them: the place of `quote` in `text`, spaces and line breaks counted as one; null when they are not there. */
export function findWords(text: string, quote: string): { at: number; words: string } | null {
  const parts = quote.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const re = new RegExp(parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+'), 'u');
  const m = re.exec(text);
  return m ? { at: m.index, words: m[0] } : null;
}

/** The words of a document (as its paragraphs, items and table cells hold them) a quote is, as written there. */
export function docWords(doc: Doc, quote: string): string | null {
  const texts: string[] = [];
  const runs = (rs: { t: string; math?: unknown }[]) => texts.push(rs.map((r) => (r.math ? '\u2063'.repeat(r.t.length) : r.t)).join(''));
  for (const b of doc.blocks) {
    if (b.type === 'p' || b.type === 'li') runs(b.runs);
    else if (b.type === 'table') for (const row of b.rows) for (const c of row) runs(c.runs);
  }
  for (const t of texts) {
    const f = findWords(t, quote);
    if (f) return f.words;
  }
  return null;
}

/** New comments of a document put on the words they quote (those not marked yet). */
export function anchorByQuote(doc: Doc, ids: string[]): Doc {
  const on = new Map<string, string>();
  for (const c of doc.comments ?? []) {
    if (!ids.includes(c.id) || !c.quote) continue;
    const words = docWords(doc, c.quote);
    if (words) on.set(c.id, words);
  }
  return on.size ? anchorComments(doc, on, []) : doc;
}

// ---- versions made by people, and saves on top of them ---------------------------------------------------------

/** A version a person made through their link: a comment (or a run of them) or a change. */
export function noteShareVersion(db: DB, pageId: string, version: number, share: string, kind: 'comment' | 'edit') {
  shareTables(db);
  db.prepare('insert or replace into project_share_versions (page_id, version, share, kind, at) values (?, ?, ?, ?, ?)').run(pageId, version, share, kind, Date.now());
}

/** Whether a version holds only people's comments over the one before. */
export function commentVersion(db: DB, pageId: string, version: number): boolean {
  shareTables(db);
  return (db.prepare('select kind from project_share_versions where page_id = ? and version = ?').get(pageId, version) as { kind: string } | undefined)?.kind === 'comment';
}

/** When a version was made (a version kept as one with the next is remembered here): 0 when it is not known. */
function versionTime(db: DB, pageId: string, version: number): number {
  const v = db.prepare('select created_at from page_versions where page_id = ? and version = ?').get(pageId, version) as { created_at: number } | undefined;
  if (v) return v.created_at;
  shareTables(db);
  return (db.prepare('select at from project_share_versions where page_id = ? and version = ?').get(pageId, version) as { at: number } | undefined)?.at ?? 0;
}

/**
 * Someone saves a document, a LaTeX document, slides or a spreadsheet on an older version than there is now (`base`):
 * the comments and replies people wrote since (through their links) join what is saved, so a save on top of them keeps
 * them. Returns the model to keep, and whether nothing but people's comments came since (then there is nothing to ask
 * about).
 */
export function carryComments(db: DB, pageId: string, base: number, model: unknown): { model: unknown; onlyComments: boolean } {
  shareTables(db);
  const cur = pageInfo(db, pageId);
  if (!cur || !cur.kind || cur.kind === 'notebook' || !(base > 0) || base >= cur.version || !model || typeof model !== 'object') return { model, onlyComments: false };
  const marks = db.prepare('select version, kind from project_share_versions where page_id = ? and version > ? and version <= ?').all(pageId, base, cur.version) as { version: number; kind: string }[];
  if (!marks.some((m) => m.kind === 'comment')) return { model, onlyComments: false };
  const kinds = new Map(marks.map((m) => [m.version, m.kind]));
  let only = true;
  for (let v = base + 1; v <= cur.version; v++) if (kinds.get(v) !== 'comment') only = false;
  const since = versionTime(db, pageId, base);
  const stored = pageModel(db, pageId) as Doc | TexDoc | null;
  const theirs = (x: { by: Comment['by']; at: number }) => x.by === 'person' && x.at > since;
  try {
    if (cur.kind === 'doc') {
      const doc = normalizeDoc(model);
      const { list, added } = carried(doc.comments ?? [], (stored as Doc | null)?.comments ?? [], theirs);
      return { model: anchorByQuote(withComments(doc, list), added), onlyComments: only };
    }
    if (cur.kind === 'tex') {
      const tex = normalizeTex(model);
      const { list } = carried(tex.comments ?? [], (stored as TexDoc | null)?.comments ?? [], theirs);
      return { model: { ...tex, comments: list }, onlyComments: only };
    }
    // A deck's (one list a slide) or a workbook's (one a sheet): each into its own slide or sheet, while the save has it.
    const given = commentLists(cur.kind, model);
    const kept = commentLists(cur.kind, stored);
    const known = new Set([...given.values()].flatMap((l) => l.map((c) => c.id)));
    const lists = new Map<string, Comment[]>();
    for (const [k, list] of given) lists.set(k, carried(list, (kept.get(k) ?? []).filter((c) => list.some((g) => g.id === c.id) || !known.has(c.id)), theirs).list);
    return { model: withLists(cur.kind, model, lists), onlyComments: only };
  } catch {
    // What was sent does not read: the save says so as it would have.
    return { model, onlyComments: false };
  }
}

/** The comments a save sends, with people's newer ones from the stored version added in: the list, and the ids of whole comments added. */
function carried<C extends Comment | TexComment>(given: C[], stored: C[], theirs: (x: { by: Comment['by']; at: number }) => boolean): { list: C[]; added: string[] } {
  const list = given.map((c) => ({ ...c }));
  const added: string[] = [];
  for (const s of stored) {
    const g = list.find((c) => c.id === s.id);
    if (!g) {
      if (theirs(s)) {
        list.push(s);
        added.push(s.id);
      }
      continue;
    }
    const ids = new Set((g.replies ?? []).map((r) => r.id));
    const more = (s.replies ?? []).filter((r) => theirs(r) && !ids.has(r.id));
    if (more.length) g.replies = [...(g.replies ?? []), ...more];
  }
  return { list, added };
}

// ---- what the owner hears ---------------------------------------------------------------------------------------

/** A comment or a reply a person wrote: kept for the inbox until someone answers it or it is resolved. `on`: a page's id, or "media:<id>". */
export function noteComment(db: DB, on: string, c: { cid: string; parent?: string; text: string }, w: Who) {
  shareTables(db);
  db.prepare('insert or replace into project_share_comments (page_id, cid, parent, share, name, text, at) values (?, ?, ?, ?, ?, ?, ?)').run(on, c.cid, c.parent ?? null, w.id, w.name, c.text.slice(0, 400), Date.now());
}

/** Where the owner opens what a comment is on: a page, or a picture, video or sound. */
export const placeOf = (on: string) => (on.startsWith('media:') ? `/media/${on.slice('media:'.length)}` : `/pages/${on}`);

/** Whether each comment and reply of a page waits on an answer, by its id: kept for the version it was worked out for. */
const states = new Map<string, { version: number; open: Map<string, boolean> }>();

/** The comments of what `on` names, as kept now: a page's (in its model, or a page of HTML's apart from it) or an item's of the Library's media. */
function commentsOn(db: DB, on: string): { title: string; list: Comment[]; version?: number } | null {
  if (on.startsWith('media:')) {
    const m = getMedia(db, on.slice('media:'.length));
    return m ? { title: m.title, list: mediaComments(db, m.id) } : null;
  }
  const p = pageInfo(db, on);
  if (!p || p.kind === 'notebook') return null;
  if (!p.kind) return { title: p.title, list: pageComments(db, p.id) };
  let lists = new Map<string, Comment[]>();
  try {
    lists = commentLists(p.kind, pageModel(db, p.id));
  } catch {}
  return { title: p.title, list: [...lists.values()].flat(), version: p.version };
}

function openStates(db: DB, on: string): { title: string; open: Map<string, boolean> } | null {
  // A page's model is read once a version (the inbox is asked every few seconds while open); the rest is read as it is.
  const p = on.startsWith('media:') ? null : pageInfo(db, on);
  const had = states.get(on);
  if (p?.kind && had && had.version === p.version) return { title: p.title, open: had.open };
  const now = commentsOn(db, on);
  if (!now) return null;
  const open = new Map<string, boolean>();
  const answer = (r: { by: Comment['by'] }) => r.by === 'user' || r.by === 'agent';
  for (const c of now.list) {
    const replies = c.replies ?? [];
    open.set(c.id, !c.resolved && !replies.some(answer));
    replies.forEach((r, i) => open.set(r.id, !c.resolved && !replies.slice(i + 1).some(answer)));
  }
  if (now.version !== undefined) {
    states.set(on, { version: now.version, open });
    if (states.size > 200) states.delete(states.keys().next().value!);
  }
  return { title: now.title, open };
}

/** People's comments waiting on the owner: an inbox line each, until it is answered (by you or an agent), resolved or gone. */
export function shareInbox(db: DB): InboxItem[] {
  shareTables(db);
  const rows = db.prepare('select * from project_share_comments order by at desc limit 300').all() as { page_id: string; cid: string; parent: string | null; name: string; text: string; at: number }[];
  const out: InboxItem[] = [];
  const done: [string, string][] = [];
  const old = Date.now() - REMEMBER;
  // Each document once, however many of its comments wait (the inbox is asked every few seconds while open).
  const seen = new Map<string, ReturnType<typeof openStates>>();
  const statesOf = (id: string) => {
    if (!seen.has(id)) seen.set(id, openStates(db, id));
    return seen.get(id)!;
  };
  for (const r of rows) {
    const s = r.at > old ? statesOf(r.page_id) : null;
    if (!s?.open.get(r.cid)) {
      done.push([r.page_id, r.cid]);
      continue;
    }
    out.push({
      id: `comment:${r.page_id}:${r.cid}`,
      kind: 'comment',
      title: r.parent ? `${r.name} replied on “${s.title}”` : `${r.name} commented on “${s.title}”`,
      detail: r.text,
      at: r.at,
      path: placeOf(r.page_id),
    });
  }
  const drop = db.prepare('delete from project_share_comments where page_id = ? and cid = ?');
  for (const [p, c] of done) drop.run(p, c);
  return out;
}

// ---- the owner's routes ---------------------------------------------------------------------------------------

function routes(d: Deps) {
  const { app, db } = d;
  shareTables(db);
  sweep(db);
  const space = (req: { params: unknown }) => {
    const s = spaceById(db, String((req.params as { id: string }).id));
    if (!s) throw new HttpError(404, 'No such project');
    return s;
  };
  const sid = (req: { params: unknown }) => String((req.params as { share: string }).share);
  const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  const changed = (s: Space) => d.broadcast({ t: 'feature', id: 'sharing', data: { space: s.id } });

  app.get('/api/projects/:id/shares', async (req) => ({ shares: listShares(db, space(req).id), owner: ownerName(db) }));
  app.post('/api/projects/:id/shares', async (req) => {
    const s = space(req);
    const out = createShare(db, s, body(req));
    changed(s);
    return out;
  });
  app.patch('/api/projects/:id/shares/:share', async (req) => {
    const s = space(req);
    const share = updateShare(db, s, sid(req), body(req));
    changed(s);
    return { share };
  });
  app.post('/api/projects/:id/shares/:share/link', async (req) => {
    const s = space(req);
    const out = newLink(db, s, sid(req));
    changed(s);
    return out;
  });
  app.delete('/api/projects/:id/shares/:share', async (req) => {
    const s = space(req);
    stopShare(db, s, sid(req));
    changed(s);
    return { ok: true };
  });

  // One thing of the Library shared alone: a page of any kind (not an app's screen), or a picture, video or sound.
  const things: [string, ShareThing['kind']][] = [
    ['/api/pages/:id/shares', 'page'],
    ['/api/media/:id/shares', 'media'],
  ];
  const thing = (kind: ShareThing['kind'], req: { params: unknown }): { thing: ShareThing } => {
    const id = String((req.params as { id: string }).id);
    if (kind === 'page') {
      const p = /^[a-f0-9]{10}$/.test(id) ? pageInfo(db, id) : null;
      if (!p || p.app) throw new HttpError(404, 'No such page in the Library');
    } else if (!(/^[a-f0-9]{10}$/.test(id) && getMedia(db, id))) throw new HttpError(404, 'No such image, video or sound in the Library');
    return { thing: { kind, id } };
  };
  const told = (sc: { thing: ShareThing }) => d.broadcast({ t: 'feature', id: 'sharing', data: { thing: sc.thing } });
  for (const [base, kind] of things) {
    app.get(base, async (req) => ({ shares: listShares(db, thing(kind, req)), owner: ownerName(db) }));
    app.post(base, async (req) => {
      const sc = thing(kind, req);
      const out = createLink(db, sc, body(req));
      told(sc);
      return out;
    });
    app.patch(`${base}/:share`, async (req) => {
      const sc = thing(kind, req);
      const share = updateLink(db, sc, sid(req), body(req));
      told(sc);
      return { share };
    });
    app.post(`${base}/:share/link`, async (req) => {
      const sc = thing(kind, req);
      const out = remakeLink(db, sc, sid(req));
      told(sc);
      return out;
    });
    app.delete(`${base}/:share`, async (req) => {
      const sc = thing(kind, req);
      stopLink(db, sc, sid(req));
      told(sc);
      return { ok: true };
    });
  }
  app.get('/api/shares', async () => ({ things: sharedThings(db) }));
  app.put('/api/projects/sharing', async (req) => {
    const name = cleanName(body(req).owner);
    if (name) kvSet(db, OWNER_KEY, name);
    else db.prepare('delete from kv where k = ?').run(OWNER_KEY);
    d.broadcast({ t: 'feature', id: 'sharing', data: { owner: true } });
    return { owner: ownerName(db) };
  });
}

/** The links of a project, or of a thing, that was deleted stop (they already open nothing): they say so for a month, then go. */
function stopOrphans(db: DB) {
  shareTables(db);
  try {
    db.prepare('update project_shares set stopped_at = ? where stopped_at is null and item is null and space not in (select id from spaces)').run(Date.now());
  } catch {}
  stopGoneThings(db);
}

/** "Maria Lopez, Nikos Papas and Eleni Kosta". */
const names = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''));

/** What an agent in a shared project is told: who reads what it writes there (not in a Confidential session, which no one sees). */
export function sharedNote(db: DB, extra: { space?: unknown; confidential?: unknown }): string | null {
  if (typeof extra.space !== 'string' || !extra.space || extra.confidential) return null;
  const sp = spaceById(db, extra.space);
  const now = Date.now();
  const people = sp ? listShares(db, sp.id).filter((x) => !x.expiresAt || x.expiresAt > now) : [];
  if (!sp || !people.length) return null;
  const list = names(people.slice(0, 8).map((x) => x.name)) + (people.length > 8 ? ` and ${people.length - 8} more` : '');
  return `The user shared the project “${sp.name}” with ${people.length === 1 ? 'someone' : `${people.length} people`}: ${list}. Through links of their own they read its documents and its sessions, this one too (your replies and your steps by name and file changes, never command output), and comment on its documents. Write nothing in this session the user would not want them to read, such as keys, passwords or private details.`;
}

export const sharing: Feature = {
  id: 'sharing',
  routes(d) {
    routes(d);
    portalRoutes(d);
    portalMediaRoutes(d);
  },
  spawn(s, d) {
    const note = sharedNote(d.db, s.extra as { space?: unknown; confidential?: unknown });
    return note ? { instructions: [note] } : undefined;
  },
  inbox: (d) => shareInbox(d.db),
  event(e, d) {
    if (e.t !== 'feature') return;
    // A project deleted, or a page or a picture, video or sound: their links stop.
    const data = e.data as { what?: string; removed?: string } | undefined;
    if (e.id === 'spaces' || (e.id === 'pages' && data?.what === 'pages') || (e.id === 'media' && data?.removed)) stopOrphans(d.db);
  },
};

