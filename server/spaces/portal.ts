// What someone a project is shared with reads and sends through their link (the page /p/<token>, its data under
// /p-api/<token>/…; share.ts makes the links). The token is the permission: no sign-in, and the app's cookies count for
// nothing here. Every route answers for that one project's own things (its Library items, its sessions, its runs, its
// reading list) as the person may (View and comment, or Edit documents), and nothing else: never the owner's API,
// files, terminal, agents, settings or other projects. A token that opens nothing counts as a wrong password from its
// address (server/auth.ts: ten in an hour pause it, for links and sign-ins alike); a link that stopped, ran out or was
// made again says so (410), uncounted.
//
// Documents show as they show at a page's own address: their own page, made here, in the sandboxed frame. Comments
// (documents and LaTeX documents) come with their writers' names, the owner's under the name the owner gave. With
// Edit documents, documents, spreadsheets and slides (and LaTeX where TeX runs shut in by bubblewrap) open in the
// Library's own editors, which ask what they ask of /api/pages/… here instead (web/src/lib/machine.ts): the project's
// pictures, a document's files to download, and LaTeX typeset. Nothing they save can put words in anyone else's mouth:
// comments keep who wrote them.
//
//   GET  /p-api/:token                      the project: its documents, sessions, runs and reading list (?visit=1 counts a visit)
//   GET  /p-api/:token/items/:id            a document: its own page to read (or its model, to edit) and its comments
//   POST /p-api/:token/items/:id/storage    a page's stored data, to read (get, keys)
//   POST /p-api/:token/items/:id/comments   { text, quote? } a comment; { id, reply }; { id, resolved }; one's own: { id, text }, { id, delete: true }
//   POST /p-api/:token/items/:id/versions   Edit documents: { model, base, force? } a new version
//   GET  /p-api/:token/sessions/:key        a session as a read-only link shows it (?from=: from that item on)
//   GET  /p-api/:token/pages/:id/thumb, GET /p-api/:token/pages/assets/:sha, POST /p-api/:token/pages/assets, GET /p-api/:token/pages/:id/export,
//   GET  /p-api/:token/pages/tex/setup, POST …/tex/compile, GET …/tex/:key/(pdf|sync|place|:page)   the editors' own calls
import fs from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newCommentId, type Comment } from '../../shared/comments.ts';
import { normalizeDoc, withComments, type Doc } from '../../shared/docs.ts';
import { normalizeTex, TEX_MAIN, texFileText, type TexComment, type TexDoc } from '../../shared/latex.ts';
import type { PageInfo } from '../../shared/pages.ts';
import { PORTAL_COMMENTS, PORTAL_EDITS, type PortalItem, type PortalItemView, type PortalPaper, type PortalRun, type PortalSession, type PortalView, type ProjectShare } from '../../shared/share.ts';
import type { Space } from '../../shared/spaces.ts';
import type { NotifyEvent, SessionSummary, TimelineItem } from '../../shared/types.ts';
import { clientAddress, HttpError, linkPause, wrongLink } from '../auth.ts';
import type { DB } from '../db.ts';
import { listRuns } from '../experiments/records.ts';
import type { Deps } from '../features/types.ts';
import { guestItem } from '../guests.ts';
import { previewItem } from '../history/common.ts';
import { Limiter, waitText } from '../apps/limits.ts';
import { dropRefs, getAsset, putAsset } from '../pages/assets.ts';
import { EXPORT_TYPES, exportPage, type ExportFormat } from '../pages/export.ts';
import { compileTex, forEditor, texPagePicture, texPdfFile, texPlaceOf, texSetup, texSourceAt } from '../pages/latex.ts';
import { addVersion, listPages, pageHtml, pageInfo, pageModel, storageOp } from '../pages/store.ts';
import { refreshThumbs, thumbFile } from '../pages/thumbs.ts';
import { sessionsIn } from './index.ts';
import { anchorByQuote, carryComments, commentVersion, docWords, findWords, forPerson, noteActivity, noteComment, noteShareVersion, noteVisit, openShare, ownerName, personComments, stamp, type Who } from './share.ts';

const limits = new Limiter();
const HOUR = 3600_000;

/** Someone a project is shared with, as their link opens it. */
interface Person {
  share: ProjectShare;
  space: Space;
  who: Who;
}

const P = (req: FastifyRequest) => req.params as Record<string, string>;
const quiet = (reply: FastifyReply) => reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');

/** Browsers say where a request was sent from: only this site's own pages may change anything through a link. */
function sameSite(req: FastifyRequest): boolean {
  const o = req.headers.origin;
  if (!o) return true;
  try {
    return new URL(o).host === req.headers.host;
  } catch {
    return false;
  }
}

/**
 * The person a request's link is for. While its address is paused for wrong links, every link is refused; a token
 * that opens nothing is counted (and may start the pause); one that once worked says why it no longer does.
 */
function personOf(db: DB, req: FastifyRequest, write = false): Person {
  const ip = clientAddress(req.socket.remoteAddress ?? '', req.headers['x-forwarded-for']);
  const pause = linkPause(db, ip);
  if (pause) throw pause;
  const o = openShare(db, String(P(req).token ?? ''));
  if (!o) throw wrongLink(db, ip) ?? new HttpError(404, 'This link does not open anything.');
  if ('gone' in o) throw new HttpError(410, o.gone);
  if (write && !sameSite(req)) throw new HttpError(403, 'Send it from the project’s own page');
  return { ...o, who: { id: o.share.id, name: o.share.name } };
}

/** At most `n` of something an hour for one person. */
function take(p: Person, what: string, n: number, say: string) {
  const k = `${what}:${p.share.id}`;
  if (!limits.take(k, n, HOUR)) throw new HttpError(429, `${say} Try again ${waitText(limits.wait(k, n, HOUR))}.`);
}

const itemView = (p: PageInfo): PortalItem => ({ id: p.id, title: p.title, ...(p.kind ? { kind: p.kind } : {}), version: p.version, updatedAt: p.updatedAt, ...(p.thumb ? { thumb: p.thumb } : {}) });

/** A document of the person's project, by its id: nothing outside it, nothing of an app's. */
function itemOf(db: DB, p: Person, id: unknown): PageInfo {
  const page = typeof id === 'string' && /^[a-f0-9]{10}$/.test(id) ? pageInfo(db, id) : null;
  if (!page || page.space !== p.space.id || page.app) throw new HttpError(404, 'This project has no such document');
  return page;
}

/** Whether TeX runs shut in here (bubblewrap): only then do people's links change and typeset LaTeX. Asked every ten minutes. */
let shut: { at: number; on: boolean } | null = null;
async function texShutIn(): Promise<boolean> {
  if (shut && Date.now() - shut.at < 10 * 60_000) return shut.on;
  const on = (await texSetup().catch(() => null))?.sandbox === true;
  shut = { at: Date.now(), on };
  return on;
}

async function canEdit(p: Person, page: PageInfo): Promise<boolean> {
  if (p.share.role !== 'edit' || !page.kind || !PORTAL_EDITS.includes(page.kind)) return false;
  return page.kind !== 'tex' || (await texShutIn());
}

// ---- the project ------------------------------------------------------------------------------------------------

/** A session a person may not see: one kept Confidential (its words go nowhere else). */
const hidden = (s: SessionSummary) => !!(s.extra as { confidential?: unknown } | undefined)?.confidential;

function projectSessions(d: Deps, space: string): PortalSession[] {
  const out: PortalSession[] = [];
  for (const key of sessionsIn(d.db, space, 200)) {
    const s = d.sessions.summary(key);
    if (!s || hidden(s)) continue;
    out.push({ key, title: s.title, agent: s.agent, ...(s.acpName ? { acpName: s.acpName } : {}), ...(s.updatedAt ? { updatedAt: s.updatedAt } : {}), status: s.live?.status ?? 'idle' });
  }
  return out;
}

/** The project's experiments: what they were and how they went; never their commands, folders, logs or machines. */
function projectRuns(db: DB, space: string): PortalRun[] {
  try {
    return listRuns(db, { project: space, limit: 200 })
      .filter((r) => r.project === space)
      .map((r) => ({
        id: r.id,
        ...(r.name ? { name: r.name } : {}),
        ...(r.group ? { group: r.group } : {}),
        status: r.status,
        createdAt: r.createdAt,
        ...(r.startedAt ? { startedAt: r.startedAt } : {}),
        ...(r.endedAt ? { endedAt: r.endedAt } : {}),
        ...(r.metrics?.last ? { metrics: r.metrics.last } : {}),
        ...(r.metrics?.best ? { best: r.metrics.best } : {}),
        ...(r.params ? { params: r.params } : {}),
        ...(r.seed !== undefined ? { seed: r.seed } : {}),
        ...(r.tags?.length ? { tags: r.tags } : {}),
      }));
  } catch {
    return [];
  }
}

const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const web = (v: unknown) => (typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v.trim()) ? v.trim() : '');

/**
 * The project's reading list: the Reading list app's papers whose project is this one (by its id or its name). Their
 * notes, files and BibTeX stay out; a paper links to its page, its DOI's or arXiv's.
 */
function readingList(db: DB, space: Space): PortalPaper[] {
  // The ready-made app's own records, and those of an app made from it.
  let own: string[] = [];
  try {
    own = (db.prepare("select id from apps where slug = 'reading-list' or json_extract(data, '$.template') = 'reading-list'").all() as { id: string }[]).map((r) => r.id);
  } catch {}
  try {
    const ids = ['tpl:reading-list', ...own];
    const rows = db.prepare(`select id, data from app_data where app_id in (${ids.map(() => '?').join(', ')}) order by created_at desc limit 2000`).all(...ids) as { id: string; data: string }[];
    const name = space.name.trim().toLowerCase();
    const ours = (v: unknown): boolean => (Array.isArray(v) ? v.some(ours) : typeof v === 'string' && (v === space.id || v.trim().toLowerCase() === name));
    const out: PortalPaper[] = [];
    for (const r of rows) {
      let rec: Record<string, unknown>;
      try {
        rec = JSON.parse(r.data);
      } catch {
        continue;
      }
      if (!ours(rec.project) || !str(rec.title)) continue;
      const doi = str(rec.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      const arxiv = str(rec.arxiv ?? rec.arxivId ?? rec.arxiv_id).replace(/^arxiv:/i, '');
      const link = web(rec.link) || web(rec.url) || (/^10\.\d{4,9}\/\S+$/.test(doi) ? `https://doi.org/${doi}` : '') || (/^[\w.\/-]{4,40}$/.test(arxiv) ? `https://arxiv.org/abs/${arxiv}` : '');
      const authors = Array.isArray(rec.authors) ? rec.authors.map((a) => str(a, 120)).filter(Boolean).join(', ') : str(rec.authors, 600);
      const tags = Array.isArray(rec.tags) ? rec.tags.map((t) => str(t, 40)).filter(Boolean).slice(0, 12) : str(rec.tags).split(/\s*,\s*/).filter(Boolean).slice(0, 12);
      out.push({
        id: r.id,
        title: str(rec.title),
        ...(authors ? { authors } : {}),
        ...(str(rec.year, 10) ? { year: str(rec.year, 10) } : {}),
        ...(str(rec.venue, 200) ? { venue: str(rec.venue, 200) } : {}),
        ...(link ? { link } : {}),
        ...(str(rec.status, 30) ? { status: str(rec.status, 30) } : {}),
        ...(tags.length ? { tags } : {}),
      });
    }
    return out;
  } catch {
    return [];
  }
}

async function portalView(d: Deps, p: Person): Promise<PortalView> {
  const { db } = d;
  const s = p.space;
  return {
    project: { name: s.name, color: s.color, ...(s.description ? { description: s.description } : {}) },
    owner: ownerName(db),
    me: { id: p.share.id, name: p.share.name, role: p.share.role, ...(p.share.expiresAt ? { expiresAt: p.share.expiresAt } : {}) },
    items: listPages(db)
      .filter((x) => x.space === s.id)
      .map(itemView),
    sessions: projectSessions(d, s.id),
    runs: projectRuns(db, s.id),
    reading: readingList(db, s),
    texEdits: p.share.role === 'edit' && (await texShutIn()),
  };
}

/** What a person sees of a session's item: what a read-only link shows, without the harness's own notes, commands' output, or what turns cost. */
function portalItem(it: TimelineItem): TimelineItem | null {
  if (it.kind === 'user' && (it.meta === 'note' || it.meta === 'command-output')) return null;
  const g = guestItem(it);
  if (!g) return null;
  if (g.kind === 'system') {
    const { detail: _d, ...rest } = g;
    return rest;
  }
  if (g.kind === 'turn') {
    const { tokens: _t, costUsd: _c, ...rest } = g;
    return rest;
  }
  return g;
}

// ---- comments -----------------------------------------------------------------------------------------------------

/** What a person asks of a document's comments. */
type Op = { add: string; quote?: string } | { id: string; reply: string } | { id: string; resolved: boolean } | { id: string; text: string } | { id: string; delete: true };

function opOf(b: Record<string, unknown>): Op {
  const text = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, 4000) : '');
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) {
    if (!text('text')) throw new HttpError(400, 'Write the comment');
    const quote = typeof b.quote === 'string' ? b.quote.replace(/\s+/g, ' ').trim() : '';
    if (quote.length > 500) throw new HttpError(400, 'Pick fewer words to comment on (at most 500 characters)');
    return quote ? { add: text('text'), quote } : { add: text('text') };
  }
  if (b.delete === true) return { id, delete: true };
  if (text('reply')) return { id, reply: text('reply') };
  if (typeof b.resolved === 'boolean') return { id, resolved: b.resolved };
  if (text('text')) return { id, text: text('text') };
  throw new HttpError(400, 'Say what to do: a reply, resolved, a new text or delete');
}

/** What a comment op said, for the owner's inbox and notice: a new comment, or a reply under one. */
interface Said {
  cid: string;
  parent?: string;
  text: string;
}

/** A comment op on a list (a document's or a LaTeX document's): the list after it, and what was said. `place` puts a new comment on its words. */
function onList<C extends Comment>(list: C[], op: Op, w: Who, now: number, place: (c: Comment, quote: string | undefined) => C): { list: C[]; said?: Said } {
  if ('add' in op) {
    const c = place({ id: newCommentId(), ...stamp(w), text: op.add, at: now }, op.quote);
    return { list: [...list, c], said: { cid: c.id, text: op.add } };
  }
  const c = list.find((x) => x.id === op.id);
  if (!c) throw new HttpError(404, 'That comment is no longer there');
  const own = c.by === 'person' && c.who === w.id;
  if ('reply' in op) {
    const r = { id: newCommentId(), ...stamp(w), text: op.reply, at: now };
    return { list: list.map((x) => (x === c ? { ...x, replies: [...(x.replies ?? []), r] } : x)), said: { cid: r.id, parent: c.id, text: op.reply } };
  }
  if ('resolved' in op) return { list: list.map((x) => (x === c ? (op.resolved ? { ...x, resolved: true } : (({ resolved: _r, ...rest }) => rest as C)(x)) : x)) };
  if (!own) throw new HttpError(403, 'You can change or delete only your own comments');
  if ('delete' in op) return { list: list.filter((x) => x !== c) };
  return { list: list.map((x) => (x === c ? { ...x, text: op.text } : x)) };
}

const NOT_THERE = 'Those words are not in the document as written: copy them from it again, or leave them out to comment on the whole document.';

function docOp(doc: Doc, op: Op, w: Who, now: number): { model: Doc; said?: Said } {
  // The words a new comment is on, as the document has them.
  const on: { id?: string; words?: string } = {};
  const { list, said } = onList(doc.comments ?? [], op, w, now, (c, quote) => {
    if (!quote) return c;
    const words = docWords(doc, quote);
    if (!words) throw new HttpError(400, NOT_THERE);
    on.id = c.id;
    on.words = words;
    return c;
  });
  let next = withComments(doc, list);
  if (on.id && on.words) {
    const notes: string[] = [];
    next = anchorByQuoteExact(next, on.id, on.words, notes);
    if (notes.length) throw new HttpError(400, NOT_THERE);
  }
  return { model: next, said };
}

/** A new comment of a document put on these words, as written there. */
function anchorByQuoteExact(doc: Doc, id: string, words: string, notes: string[]): Doc {
  const c = (doc.comments ?? []).find((x) => x.id === id);
  if (!c) return doc;
  const withQuote = withComments(doc, (doc.comments ?? []).map((x) => (x.id === id ? { ...x, quote: words.slice(0, 500) } : x)));
  const out = anchorByQuote(withQuote, [id]);
  const marked = out.blocks.some((b) => (b.type === 'p' || b.type === 'li' ? b.runs : b.type === 'table' ? b.rows.flat().flatMap((x) => x.runs) : []).some((r) => r.cm?.includes(id)));
  if (!marked) notes.push(NOT_THERE);
  return out;
}

function texOp(doc: TexDoc, op: Op, w: Who, now: number): { model: TexDoc; said?: Said } {
  const { list, said } = onList<TexComment>(doc.comments ?? [], op, w, now, (c, quote) => {
    if (!quote) return { ...c, file: TEX_MAIN, from: 0, to: 0 };
    // Its words in main.tex first, then in the other files in their order.
    for (const name of [TEX_MAIN, ...doc.files.map((f) => f.name)]) {
      const text = texFileText(doc, name) ?? '';
      const f = findWords(text, quote);
      if (f) return { ...c, quote: f.words.slice(0, 500), file: name, from: f.at, to: f.at + f.words.length };
    }
    throw new HttpError(400, NOT_THERE.replace('the document', 'the document’s source'));
  });
  return { model: { ...doc, comments: list }, said };
}

/** A save of a person's: their comments under their name, everyone else's as they were (share.ts personComments). */
function withTheirComments(kind: PageInfo['kind'], model: unknown, stored: unknown, w: Who): unknown {
  try {
    if (kind === 'doc') {
      const doc = normalizeDoc(model);
      const was = (stored as Doc | null)?.comments ?? [];
      const list = personComments(was, doc.comments ?? [], w);
      const given = new Set((doc.comments ?? []).map((c) => c.id));
      return anchorByQuote(
        withComments(doc, list),
        was.filter((c) => !given.has(c.id)).map((c) => c.id),
      );
    }
    if (kind === 'tex') {
      const tex = normalizeTex(model);
      return { ...tex, comments: personComments((stored as TexDoc | null)?.comments ?? [], tex.comments ?? [], w) };
    }
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return model;
}

/** What a person's save said that is new: their comments and replies the stored version did not have. */
function newWords(stored: Comment[], saved: Comment[], w: Who): Said[] {
  const before = new Map(stored.map((c) => [c.id, new Set((c.replies ?? []).map((r) => r.id))]));
  const out: Said[] = [];
  for (const c of saved) {
    const had = before.get(c.id);
    if (!had && c.by === 'person' && c.who === w.id) out.push({ cid: c.id, text: c.text });
    for (const r of c.replies ?? []) if (r.by === 'person' && r.who === w.id && !had?.has(r.id) && had) out.push({ cid: r.id, parent: c.id, text: r.text });
  }
  return out;
}

/** The owner hears of it: a notice (to every open page and pushed to their phone), and an inbox line until it is answered. */
function tellOwner(d: Deps, page: PageInfo, w: Who, said: Said) {
  noteComment(d.db, page.id, said, w);
  const text = said.text.replace(/\s+/g, ' ');
  const n: NotifyEvent = {
    key: `share:${w.id}`,
    kind: 'waiting',
    title: page.title,
    body: `${w.name} ${said.parent ? 'replied' : 'commented'}: “${text.length > 140 ? `${text.slice(0, 139)}…` : text}”`,
    agent: 'acp',
    at: Date.now(),
    url: `/pages/${page.id}`,
  };
  const s = d.sessions as unknown as { emit?: (e: string, n: NotifyEvent) => void };
  if (typeof s.emit === 'function') s.emit('notify', n);
}

/** A run of people's comments is kept as one version, its latest: the version before goes when it held only comments. */
function keepRunAsOne(db: DB, pageId: string, before: number, now: number) {
  if (now !== before + 1 || !commentVersion(db, pageId, before)) return;
  db.prepare('delete from page_versions where page_id = ? and version = ?').run(pageId, before);
  dropRefs(db, pageId, [before]);
}

// ---- the routes ---------------------------------------------------------------------------------------------------

export function portalRoutes(d: Deps) {
  const { app, db } = d;
  const person = (req: FastifyRequest, write = false) => personOf(db, req, write);
  const body = (req: FastifyRequest) => (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
  const changed = (ids?: string[]) => {
    d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
    d.broadcast({ t: 'feature', id: 'sharing', data: { activity: true } });
    // A change of its words takes its picture again; a comment changes nothing it shows.
    if (ids) refreshThumbs(d, ids);
  };
  /** The LaTeX typesettings each person's editor made, which alone their pictures and PDF are served from. */
  const typeset = new Map<string, Set<string>>();
  /** The pictures each person added from their editor, which show there before a version keeps them. */
  const added = new Map<string, Set<string>>();
  const remember = (m: Map<string, Set<string>>, id: string, v: string) => {
    const s = m.get(id) ?? new Set<string>();
    s.add(v);
    if (s.size > 200) s.delete(s.values().next().value!);
    m.set(id, s);
  };

  app.get('/p-api/:token', async (req, reply) => {
    const p = person(req);
    quiet(reply);
    if ((req.query as { visit?: string }).visit === '1') noteVisit(db, p.share);
    return portalView(d, p);
  });

  app.get('/p-api/:token/items/:id', async (req, reply): Promise<PortalItemView> => {
    const p = person(req);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    const read = p.share.activity;
    if (!read || read.page !== page.id || Date.now() - read.at > 10 * 60_000) noteActivity(db, p.share.id, 'read', page);
    const comments = page.kind && PORTAL_COMMENTS.includes(page.kind) ? forPerson((pageModel(db, page.id) as { comments?: Comment[] } | null)?.comments, ownerName(db)) : undefined;
    if (await canEdit(p, page)) {
      const model = pageModel(db, page.id) as Record<string, unknown>;
      return { page: itemView(page), editable: true, model: comments ? { ...model, comments } : model, ...(comments ? { comments } : {}) };
    }
    const html = (await pageHtml(db, page.id, undefined, 'viewer'))!.html;
    return { page: itemView(page), editable: false, html, ...(comments ? { comments } : {}) };
  });

  app.get('/p-api/:token/pages/:id/thumb', async (req, reply) => {
    const p = person(req);
    const page = itemOf(db, p, P(req).id);
    const f = thumbFile(db, page.id);
    if (!f) return reply.code(404).send({ error: 'No picture yet' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/webp').send(fs.createReadStream(f));
  });

  // A page's stored data, read as it is; what the page changes stays in the person's browser.
  app.post('/p-api/:token/items/:id/storage', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    const b = body(req);
    if (page.kind || (b.op !== 'get' && b.op !== 'keys')) throw new HttpError(403, 'A shared page’s data is read here, not changed');
    return storageOp(db, page.id, { op: b.op, key: b.key });
  });

  app.post('/p-api/:token/items/:id/comments', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    if (page.kind !== 'doc' && page.kind !== 'tex') throw new HttpError(400, 'Comments go on documents and LaTeX documents');
    const op = opOf(body(req));
    take(p, 'comment', 200, 'That is a lot of comments in an hour.');
    const now = Date.now();
    const model = pageModel(db, page.id);
    const out = page.kind === 'doc' ? docOp(model as Doc, op, p.who, now) : texOp(model as TexDoc, op, p.who, now);
    const saved = addVersion(db, page.id, { model: out.model, by: 'edit', who: p.share.name });
    keepRunAsOne(db, page.id, page.version, saved.version);
    noteShareVersion(db, page.id, saved.version, p.share.id, 'comment');
    if (out.said) {
      tellOwner(d, saved, p.who, out.said);
      noteActivity(db, p.share.id, out.said.parent ? 'reply' : 'comment', saved);
    }
    changed();
    return { version: saved.version, comments: forPerson((out.model as { comments?: Comment[] }).comments, ownerName(db)) };
  });

  app.post('/p-api/:token/items/:id/versions', { bodyLimit: 24 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    if (p.share.role !== 'edit') throw new HttpError(403, 'This link lets you read and comment, not change documents');
    if (!(await canEdit(p, page))) throw new HttpError(403, page.kind === 'tex' ? 'LaTeX documents are changed through a link only where TeX runs shut in on the owner’s computer' : 'This kind of document is not changed through a link');
    const b = body(req);
    if (!b.model || typeof b.model !== 'object') throw new HttpError(400, 'Send the document’s model');
    take(p, 'save', 240, 'That is a lot of saves in an hour.');
    const base = Number(b.base);
    let model: unknown = b.model;
    if (Number.isInteger(base) && base > 0 && base !== page.version) {
      // Only people's comments came meanwhile: they join this save.
      const c = carryComments(db, page.id, base, model);
      model = c.model;
      if (!c.onlyComments && b.force !== true) throw new HttpError(409, `Version ${page.version} was saved after the one you changed (${base}).`);
    }
    const stored = pageModel(db, page.id) as { comments?: Comment[] } | null;
    model = withTheirComments(page.kind, model, stored, p.who);
    const saved = addVersion(db, page.id, { model, by: 'edit', who: p.share.name });
    noteShareVersion(db, page.id, saved.version, p.share.id, 'edit');
    noteActivity(db, p.share.id, 'edit', saved);
    if (page.kind === 'doc' || page.kind === 'tex') for (const said of newWords(stored?.comments ?? [], (model as { comments?: Comment[] }).comments ?? [], p.who)) tellOwner(d, saved, p.who, said);
    changed([page.id]);
    return { page: itemView(saved) };
  });

  app.get('/p-api/:token/sessions/:key', async (req, reply) => {
    const p = person(req);
    quiet(reply);
    const key = String(P(req).key ?? '');
    const s = sessionsIn(db, p.space.id, 500).includes(key) ? d.sessions.summary(key) : null;
    if (!s || hidden(s)) throw new HttpError(404, 'This project has no such session');
    const tl = await d.sessions.timeline(key);
    const all = tl.parser.items;
    const from = Math.max(0, Math.min(Number((req.query as { from?: string }).from) || 0, all.length));
    const items: (TimelineItem & { n: number })[] = [];
    all.slice(from).forEach((it, i) => {
      const x = portalItem(previewItem(it));
      if (x) items.push({ ...x, n: from + i });
    });
    return { title: s.title, agent: s.agent, acpName: s.acpName, status: s.live?.status ?? 'idle', from, total: all.length, items };
  });

  // ---- what the Library's editors ask of /api/pages/… (web/src/lib/machine.ts sends it here) ----

  app.get('/p-api/:token/pages/assets/:sha', async (req, reply) => {
    const p = person(req);
    const sha = String(P(req).sha ?? '');
    const ours =
      /^[a-f0-9]{16,64}$/.test(sha) &&
      (added.get(p.share.id)?.has(sha) || !!db.prepare('select 1 from page_asset_refs r join pages g on g.id = r.page_id where r.sha = ? and g.space = ? and g.app is null limit 1').get(sha, p.space.id));
    const a = ours ? getAsset(db, sha) : null;
    if (!a) return reply.code(404).send({ error: 'No such picture' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox").type(a.mime).send(a.data);
  });

  // A picture added in an editor (Edit documents): from the person's device only, never fetched by this computer.
  app.post('/p-api/:token/pages/assets', { bodyLimit: 18 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    if (p.share.role !== 'edit') throw new HttpError(403, 'This link lets you read and comment, not change documents');
    const b = body(req);
    const m = typeof b.data === 'string' ? /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(b.data) : null;
    if (!m) throw new HttpError(400, 'Add a picture from your device (a link to one on the web cannot be fetched from here)');
    take(p, 'picture', 120, 'That is a lot of pictures in an hour.');
    const sha = putAsset(db, Buffer.from(m[1], 'base64'));
    remember(added, p.share.id, sha);
    return { src: `naget-asset:${sha}` };
  });

  app.get('/p-api/:token/pages/:id/export', async (req, reply) => {
    const p = person(req);
    const page = itemOf(db, p, P(req).id);
    const q = req.query as { format?: string; paper?: string; slide?: string };
    const format = String(q.format ?? '') as ExportFormat;
    if (!EXPORT_TYPES[format]) throw new HttpError(400, `format is one of ${Object.keys(EXPORT_TYPES).join(', ')}`);
    take(p, 'export', 60, 'That is a lot of downloads in an hour.');
    const f = await exportPage(db, page.id, { format, paper: q.paper === 'letter' ? 'letter' : 'a4', slide: q.slide ? Number(q.slide) : undefined });
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .type(f.type)
      .send(f.data);
  });

  app.get('/p-api/:token/pages/tex/setup', async (req, reply) => {
    person(req);
    quiet(reply);
    return texSetup();
  });

  // LaTeX typeset as a person's editor has it (Edit documents, where TeX runs shut in): never in a folder of the owner's.
  app.post('/p-api/:token/pages/tex/compile', { bodyLimit: 24 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    if (p.share.role !== 'edit' || !(await texShutIn())) throw new HttpError(403, 'LaTeX is typeset through a link only for Edit documents, where TeX runs shut in on the owner’s computer');
    take(p, 'typeset', 300, 'That is a lot of typesetting in an hour.');
    const b = body(req);
    let doc: TexDoc;
    try {
      doc = normalizeTex(b.model);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    const base = typeof b.base === 'string' && typeset.get(p.share.id)?.has(b.base) ? b.base : undefined;
    const r = await compileTex(db, doc, { base });
    remember(typeset, p.share.id, r.key);
    return forEditor(r);
  });

  const texKey = (p: Person, req: FastifyRequest) => {
    const key = String(P(req).key ?? '');
    if (!typeset.get(p.share.id)?.has(key)) throw new HttpError(404, 'No such typesetting');
    return key;
  };
  app.get('/p-api/:token/pages/tex/:key/pdf', async (req, reply) => {
    const f = texPdfFile(texKey(person(req), req));
    if (!f) return reply.code(404).send({ error: 'No such typesetting' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Disposition', 'inline; filename="document.pdf"').type('application/pdf').send(fs.createReadStream(f));
  });
  app.get('/p-api/:token/pages/tex/:key/sync', async (req) => {
    const key = texKey(person(req), req);
    const q = req.query as { page?: string; x?: string; y?: string };
    return (await texSourceAt(key, Number(q.page), Number(q.x), Number(q.y))) ?? {};
  });
  app.get('/p-api/:token/pages/tex/:key/place', async (req) => {
    const key = texKey(person(req), req);
    const q = req.query as { file?: string; line?: string };
    return (await texPlaceOf(key, String(q.file ?? ''), Number(q.line))) ?? {};
  });
  app.get('/p-api/:token/pages/tex/:key/:page', async (req, reply) => {
    const key = texKey(person(req), req);
    const png = await texPagePicture(key, Number(P(req).page), Number((req.query as { w?: string }).w ?? 1200));
    if (!png) return reply.code(404).send({ error: 'No such page' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/png').send(png);
  });

  // Anything else a link is asked for: nothing (a wrong token is counted all the same).
  app.route({
    method: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/p-api/:token/*',
    handler: async (req, reply) => {
      person(req);
      quiet(reply);
      return reply.code(404).send({ error: 'A shared link does not open that' });
    },
  });
}
