// Sharing a project with people: the owner invites someone (an advisor, a student) into one project by a personal link,
// /p/<token>, to see it and comment on its documents under their own name, or with Edit documents to change them too.
// Each link is one person's: their name, what they may do and until when. Only its hash is kept; it stops at once when
// the owner stops it, and a new link for the same person keeps who they are (their comments stay theirs). A link that
// was stopped, ran out or was made again says so; a token that never opened anything counts as a wrong password from
// its address (server/auth.ts). What a person's browser reads and sends is portal.ts, under /p-api/<token>/… alone.
//
// Here: the links, the owner's routes, what the owner hears (a notice and an inbox line when someone comments, until
// it is answered or resolved), and comments by people carried into a save made on an older version, so a document
// saved on top of them keeps them. A person's comment is a new version of the document (comments live in it, so
// agents read and answer them as the owner's); a run of them in a row is kept as one version, its latest.
//
// Routes, signed in (the owner's):
//   GET    /api/projects/:id/shares               the people it is shared with, and the name they see the owner by
//   POST   /api/projects/:id/shares               invite someone { name, role, days } → { share, token }
//   PATCH  /api/projects/:id/shares/:share        change what they may do, or until when { role?, days?, name? }
//   POST   /api/projects/:id/shares/:share/link   a new link for them (the old one stops) → { share, token }
//   DELETE /api/projects/:id/shares/:share        stop sharing with them
//   PUT    /api/projects/sharing                  the name people see the owner's comments under { owner }
import crypto from 'node:crypto';
import type { Comment } from '../../shared/comments.ts';
import { normalizeDoc, withComments, type Doc } from '../../shared/docs.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import { normalizeTex, type TexComment, type TexDoc } from '../../shared/latex.ts';
import { SHARE_ROLES, type ProjectShare, type ShareActivity, type ShareRole } from '../../shared/share.ts';
import type { Space } from '../../shared/spaces.ts';
import { HttpError } from '../auth.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { anchorComments } from '../pages/docs.ts';
import { pageInfo, pageModel } from '../pages/store.ts';
import { spaceById } from './index.ts';
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

const toShare = (r: Row): ProjectShare => ({
  id: r.id,
  space: r.space,
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

/** Links that stopped or ran out a month ago, and old links made again, are forgotten. */
function sweep(db: DB) {
  const old = Date.now() - REMEMBER;
  db.prepare('delete from project_shares where (stopped_at is not null and stopped_at < ?) or (expires_at is not null and expires_at < ?)').run(old, old);
  db.prepare('delete from project_share_old where at < ?').run(old);
}

/** The people a project is shared with, the newest first; those whose link ran out stay (to see, invite again or remove). */
export function listShares(db: DB, space: string): ProjectShare[] {
  shareTables(db);
  return (db.prepare('select * from project_shares where space = ? and stopped_at is null order by created_at desc').all(space) as Row[]).map(toShare);
}

function mustShare(db: DB, space: string, id: string): Row {
  shareTables(db);
  const r = db.prepare('select * from project_shares where id = ? and space = ? and stopped_at is null').get(id, space) as Row | undefined;
  if (!r) throw new HttpError(404, 'That person no longer has this project shared with them');
  return r;
}

/** Shares a project with someone: their link (its token, shown once). */
export function createShare(db: DB, space: Space, b: Record<string, unknown>): { share: ProjectShare; token: string } {
  shareTables(db);
  sweep(db);
  const name = cleanName(b.name);
  if (!name) throw new HttpError(400, 'Who is it for? Give their name');
  const role = roleOf(b.role ?? 'comment');
  const now = Date.now();
  const expires = expiryOf(b.days === undefined ? 30 : b.days, now);
  const live = (db.prepare('select count(*) as n from project_shares where space = ? and stopped_at is null').get(space.id) as { n: number }).n;
  if (live >= MOST) throw new HttpError(409, `A project can be shared with ${MOST} people at once; stop sharing with some first`);
  const token = newToken();
  let id = `ps${crypto.randomBytes(4).toString('hex')}`;
  while (db.prepare('select 1 from project_shares where id = ?').get(id)) id = `ps${crypto.randomBytes(4).toString('hex')}`;
  db.prepare('insert into project_shares (id, space, name, role, hash, created_at, expires_at, views) values (?, ?, ?, ?, ?, ?, ?, 0)').run(id, space.id, name, role, hashOf(token), now, expires);
  return { share: toShare(mustShare(db, space.id, id)), token };
}

/** Changes what someone may do, until when (days from now), or their name; their link stays the same. */
export function updateShare(db: DB, space: Space, id: string, b: Record<string, unknown>): ProjectShare {
  const r = mustShare(db, space.id, id);
  const name = b.name === undefined ? r.name : cleanName(b.name);
  if (!name) throw new HttpError(400, 'Give their name');
  const role = b.role === undefined ? r.role : roleOf(b.role);
  const expires = b.days === undefined ? r.expires_at : expiryOf(b.days, Date.now());
  db.prepare('update project_shares set name = ?, role = ?, expires_at = ? where id = ?').run(name, role, expires, id);
  return toShare(mustShare(db, space.id, id));
}

/** A new link for someone; the old one stops (and says so when opened). They stay who they were. */
export function newLink(db: DB, space: Space, id: string): { share: ProjectShare; token: string } {
  const r = mustShare(db, space.id, id);
  const token = newToken();
  db.transaction(() => {
    db.prepare('insert or replace into project_share_old (hash, share, at) values (?, ?, ?)').run(r.hash, id, Date.now());
    db.prepare('update project_shares set hash = ? where id = ?').run(hashOf(token), id);
  })();
  return { share: toShare(mustShare(db, space.id, id)), token };
}

/** Stops sharing with someone: their link stops at once. What they wrote stays, under their name. */
export function stopShare(db: DB, space: Space, id: string) {
  mustShare(db, space.id, id);
  db.prepare('update project_shares set stopped_at = ? where id = ?').run(Date.now(), id);
}

/** The person a link is for, with their project; `gone` says why a link that worked once no longer does; null: no link at all. */
export function openShare(db: DB, token: string): { share: ProjectShare; space: Space } | { gone: string } | null {
  shareTables(db);
  if (!TOKEN.test(token)) return null;
  const h = hashOf(token);
  const r = db.prepare('select * from project_shares where hash = ?').get(h) as Row | undefined;
  if (!r) return db.prepare('select 1 from project_share_old where hash = ?').get(h) ? { gone: 'This link was replaced by a new one. Ask for the new link.' } : null;
  if (r.stopped_at) return { gone: 'This link was turned off.' };
  if (r.expires_at && r.expires_at <= Date.now()) return { gone: 'This link has expired.' };
  const space = spaceById(db, r.space);
  if (!space) return { gone: 'This project is no longer shared.' };
  return { share: toShare(r), space };
}

/** They opened the project: when, and a visit counted when half an hour has gone by since the last. */
export function noteVisit(db: DB, s: ProjectShare) {
  const now = Date.now();
  if (s.seenAt && now - s.seenAt < 60_000) return;
  const visit = !s.seenAt || now - s.seenAt > 30 * 60_000;
  db.prepare(`update project_shares set seen_at = ?${visit ? ', views = views + 1' : ''} where id = ?`).run(now, s.id);
}

/** What they did last (commented on a document, changed one…), for the project's overview. */
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

/**
 * The comments a person's save keeps: what they added (new comments and replies, under their name), theirs as they
 * changed them, and everyone else's as they were, resolved or reopened as they chose. What they took out of their
 * own goes; anyone else's comes back.
 */
export function personComments<C extends Comment>(stored: C[], given: C[], w: Who, now = Date.now()): C[] {
  const byId = new Map(stored.map((c) => [c.id, c]));
  const out: C[] = [];
  const seen = new Set<string>();
  for (const g of given) {
    const s = byId.get(g.id);
    if (!s) {
      out.push({ ...g, ...stamp(w), at: now, replies: g.replies?.map((r) => ({ ...r, ...stamp(w), at: now })) });
      continue;
    }
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const known = new Set((s.replies ?? []).map((r) => r.id));
    const added = (g.replies ?? []).filter((r) => !known.has(r.id)).map((r) => ({ ...r, ...stamp(w), at: now }));
    const replies = [...(s.replies ?? []), ...added];
    const { by: _b, name: _n, who: _w, resolved: _r, replies: _rs, ...where } = g;
    const next = { ...s, ...where, ...authorOf(s), text: mine(s, w) ? g.text : s.text, at: s.at, ...(replies.length ? { replies } : {}) } as C;
    if (g.resolved) next.resolved = true;
    else delete next.resolved;
    if (!replies.length) delete next.replies;
    out.push(next);
  }
  for (const s of stored) if (!seen.has(s.id) && !mine(s, w)) out.push(s);
  return out;
}

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
  const runs = (rs: { t: string; math?: string }[]) => texts.push(rs.map((r) => (r.math ? '⁣'.repeat(r.t.length) : r.t)).join(''));
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
 * Someone saves a document or a LaTeX document on an older version than there is now (`base`): the comments and
 * replies people wrote since (through their links) join what is saved, so a save on top of them keeps them. Returns
 * the model to keep, and whether nothing but people's comments came since (then there is nothing to ask about).
 */
export function carryComments(db: DB, pageId: string, base: number, model: unknown): { model: unknown; onlyComments: boolean } {
  shareTables(db);
  const cur = pageInfo(db, pageId);
  if (!cur || (cur.kind !== 'doc' && cur.kind !== 'tex') || !(base > 0) || base >= cur.version || !model || typeof model !== 'object') return { model, onlyComments: false };
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
    const tex = normalizeTex(model);
    const { list } = carried(tex.comments ?? [], (stored as TexDoc | null)?.comments ?? [], theirs);
    return { model: { ...tex, comments: list }, onlyComments: only };
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

/** A comment or a reply a person wrote: kept for the inbox until someone answers it or it is resolved. */
export function noteComment(db: DB, pageId: string, c: { cid: string; parent?: string; text: string }, w: Who) {
  shareTables(db);
  db.prepare('insert or replace into project_share_comments (page_id, cid, parent, share, name, text, at) values (?, ?, ?, ?, ?, ?, ?)').run(pageId, c.cid, c.parent ?? null, w.id, w.name, c.text.slice(0, 400), Date.now());
}

/** Whether each comment and reply of a document still waits on an answer, by its id: kept for the version it was worked out for. */
const states = new Map<string, { version: number; open: Map<string, boolean> }>();

function openStates(db: DB, pageId: string): { title: string; open: Map<string, boolean> } | null {
  const p = pageInfo(db, pageId);
  if (!p || (p.kind !== 'doc' && p.kind !== 'tex')) return null;
  const had = states.get(pageId);
  if (had && had.version === p.version) return { title: p.title, open: had.open };
  const open = new Map<string, boolean>();
  let list: Comment[] = [];
  try {
    list = (pageModel(db, pageId) as { comments?: Comment[] } | null)?.comments ?? [];
  } catch {}
  const answer = (r: { by: Comment['by'] }) => r.by === 'user' || r.by === 'agent';
  for (const c of list) {
    const replies = c.replies ?? [];
    open.set(c.id, !c.resolved && !replies.some(answer));
    replies.forEach((r, i) => open.set(r.id, !c.resolved && !replies.slice(i + 1).some(answer)));
  }
  states.set(pageId, { version: p.version, open });
  if (states.size > 200) states.delete(states.keys().next().value!);
  return { title: p.title, open };
}

/** People's comments waiting on the owner: an inbox line each, until it is answered (by you or an agent), resolved or gone. */
export function shareInbox(db: DB): InboxItem[] {
  shareTables(db);
  const rows = db.prepare('select * from project_share_comments order by at desc limit 300').all() as { page_id: string; cid: string; parent: string | null; name: string; text: string; at: number }[];
  const out: InboxItem[] = [];
  const done: [string, string][] = [];
  const old = Date.now() - REMEMBER;
  for (const r of rows) {
    const s = r.at > old ? openStates(db, r.page_id) : null;
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
      path: `/pages/${r.page_id}`,
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
  app.put('/api/projects/sharing', async (req) => {
    const name = cleanName(body(req).owner);
    if (name) kvSet(db, OWNER_KEY, name);
    else db.prepare('delete from kv where k = ?').run(OWNER_KEY);
    d.broadcast({ t: 'feature', id: 'sharing', data: { owner: true } });
    return { owner: ownerName(db) };
  });
}

export const sharing: Feature = {
  id: 'sharing',
  routes(d) {
    routes(d);
    portalRoutes(d);
  },
  inbox: (d) => shareInbox(d.db),
};

