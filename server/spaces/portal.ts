// What someone a project, or one thing of the Library, is shared with reads and sends through their link (the page
// /p/<token>, its data under /p-api/<token>/…; share.ts makes the links). The token is the permission: no sign-in, and
// the app's cookies count for nothing here. Every route answers for what the link opens (a project's own things: its
// Library items, its sessions, its runs, its reading list; or the one thing shared) as the person may (View and comment,
// or Edit), and nothing else: never the owner's API, files, terminal, agents, settings or other things. A token that
// opens nothing counts as a wrong password from its address (server/auth.ts: ten in an hour pause it, for links and
// sign-ins alike); a link that stopped, ran out or was made again says so (410), uncounted. A picture, video or sound
// shared alone is portal-media.ts.
//
// Documents show as they show at a page's own address: their own page, made here, in the sandboxed frame. Comments
// (every kind but a notebook) come with their writers' names, the owner's under the name the owner gave. With Edit,
// documents, spreadsheets, slides, pages and designs (and LaTeX where TeX runs shut in by bubblewrap) open in the
// Library's own editors, which ask what they ask of /api/pages/… here instead (web/src/lib/machine.ts): the pictures and
// videos it shows, a document's files to download, a page's comments, and LaTeX typeset. Nothing they save can put words
// in anyone else's mouth (comments keep who wrote them), nor change a page's code (its scripts) or have this computer
// fetch something new from the web.
//
//   GET  /p-api/:token                      what it opens: a project's documents, sessions, runs and reading list, or the one thing (?visit=1 counts a visit)
//   GET  /p-api/:token/items/:id            a document: its own page to read (or its model, or a page's HTML, to edit) and its comments
//   POST /p-api/:token/items/:id/storage    a page's stored data, to read (get, keys)
//   POST /p-api/:token/items/:id/comments   { text, quote? | slide | sheet?, cell } a comment; { id, reply }; { id, resolved }; one's own: { id, text }, { id, delete: true }
//   POST /p-api/:token/items/:id/versions   Edit: { model | html, base, force? } a new version
//   GET  /p-api/:token/sessions/:key        a project's session as a read-only link shows it (?from=: from that item on)
//   GET/POST /p-api/:token/pages/:id/comments   a page's comments, as its editor reads and changes them ({ ops })
//   GET  /p-api/:token/pages/:id/thumb, GET /p-api/:token/pages/assets/:sha, POST /p-api/:token/pages/assets, GET /p-api/:token/pages/videos/:sha, GET /p-api/:token/pages/:id/export,
//   GET  /p-api/:token/pages/tex/setup, POST …/tex/compile, GET …/tex/:key/(pdf|sync|place|:page)   the editors' own calls
import fs from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { newCommentId, type Comment } from '../../shared/comments.ts';
import { normalizeDoc, withComments, type Doc } from '../../shared/docs.ts';
import { normalizeTex, TEX_MAIN, texFileText, type TexComment, type TexDoc } from '../../shared/latex.ts';
import type { PageInfo } from '../../shared/pages.ts';
import { cleanAnchor, type PageComment } from '../../shared/page-comments.ts';
import { cleanSheetComments, parseRef, refName, SHEET_LIMITS, type SheetComment } from '../../shared/sheets.ts';
import { slideTitle, type Deck } from '../../shared/slides.ts';
import type { MediaItem } from '../../shared/media.ts';
import { kindKey, PORTAL_COMMENTS, PORTAL_EDITS, type PortalComment, type PortalItem, type PortalItemView, type PortalMedia, type PortalPaper, type PortalRun, type PortalSession, type PortalView, type ProjectShare } from '../../shared/share.ts';
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
import { addVersion, changeComments, listPages, pageComments, pageHtml, pageInfo, pageModel, storageOp } from '../pages/store.ts';
import { getVideo, sendVideo } from '../pages/videos.ts';
import { codeOf, sameCode, webAddressesOf } from '../pages/html-code.ts';
import { isDesignHtml, withDesignKit } from '../../shared/design.ts';
import { refreshThumbs, thumbFile } from '../pages/thumbs.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { sessionsIn } from './index.ts';
import { anchorByQuote, carryComments, commentLists, commentVersion, docWords, findWords, forPerson, mapLists, noteActivity, noteComment, noteShareVersion, noteVisit, openShare, ownerName, personComments, personLists, placeOf, stamp, withLists, type Who } from './share.ts';

const limits = new Limiter();
const HOUR = 3600_000;

/**
 * What each person added from their editors (pictures, videos, sounds), by their hash: theirs alone to show and to use
 * in an edit, before a version keeps them (then the version's own pictures are shown to whoever the link opens it for).
 */
const uploads = new Map<string, Set<string>>();
export function rememberUpload(shareId: string, sha: string) {
  const s = uploads.get(shareId) ?? new Set<string>();
  s.add(sha);
  if (s.size > 400) s.delete(s.values().next().value!);
  uploads.set(shareId, s);
}
export const uploadedBy = (shareId: string, sha: string) => uploads.get(shareId)?.has(sha) ?? false;

/** What a link opens: a project, a page of the Library (of any kind), or a picture, video or sound. */
export type Scope = { kind: 'project'; space: Space } | { kind: 'page'; page: PageInfo } | { kind: 'media'; media: MediaItem };

/** Someone a project, or a thing, is shared with, as their link opens it. */
export interface Person {
  share: ProjectShare;
  scope: Scope;
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
export function personOf(db: DB, req: FastifyRequest, write = false): Person {
  const ip = clientAddress(req.socket.remoteAddress ?? '', req.headers['x-forwarded-for']);
  const pause = linkPause(db, ip);
  if (pause) throw pause;
  const o = openShare(db, String(P(req).token ?? ''));
  if (!o) throw wrongLink(db, ip) ?? new HttpError(404, 'This link does not open anything.');
  if ('gone' in o) throw new HttpError(410, o.gone);
  if (write && !sameSite(req)) throw new HttpError(403, 'Send it from its own page');
  const scope: Scope = 'space' in o ? { kind: 'project', space: o.space } : 'page' in o ? { kind: 'page', page: o.page } : { kind: 'media', media: o.media };
  return { share: o.share, scope, who: { id: o.share.id, name: o.share.name } };
}

/** At most `n` of something an hour for one person. */
export function take(p: Person, what: string, n: number, say: string) {
  const k = `${what}:${p.share.id}`;
  if (!limits.take(k, n, HOUR)) throw new HttpError(429, `${say} Try again ${waitText(limits.wait(k, n, HOUR))}.`);
}

const itemView = (p: PageInfo): PortalItem => ({ id: p.id, title: p.title, ...(p.kind ? { kind: p.kind } : {}), version: p.version, updatedAt: p.updatedAt, ...(p.thumb ? { thumb: p.thumb } : {}) });

/** A document the person's link opens, by its id: one of their project's, or the one shared; nothing else, nothing of an app's. */
function itemOf(db: DB, p: Person, id: unknown): PageInfo {
  const page = typeof id === 'string' && /^[a-f0-9]{10}$/.test(id) ? pageInfo(db, id) : null;
  const ours = !!page && !page.app && (p.scope.kind === 'project' ? page.space === p.scope.space.id : p.scope.kind === 'page' && page.id === p.scope.page.id);
  if (!ours) throw new HttpError(404, p.scope.kind === 'project' ? 'This project has no such document' : 'This link does not open that');
  return page!;
}

/** Where pictures and videos a page shows are noted (page_asset_refs) for what the link opens: its project's pages, or the one shared. */
function refScope(p: Person): { sql: string; arg: string } | null {
  if (p.scope.kind === 'project') return { sql: 'g.space = ?', arg: p.scope.space.id };
  if (p.scope.kind === 'page') return { sql: 'g.id = ?', arg: p.scope.page.id };
  return null;
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
  if (p.share.role !== 'edit' || !PORTAL_EDITS.includes(kindKey(page.kind)) || page.locked) return false;
  return page.kind !== 'tex' || (await texShutIn());
}

// ---- the project ------------------------------------------------------------------------------------------------

/**
 * A session a person never sees, nor hears of: one kept Confidential (SessionExtra.confidential: its words go nowhere
 * else), as the session's own stored settings say, or the summary the app has of it.
 */
const confidential = (x: unknown) => !!(x as { confidential?: unknown } | null | undefined)?.confidential;
const hidden = (db: DB, s: SessionSummary) => confidential(s.extra) || confidential(sessionExtra(db, s.key));

function projectSessions(d: Deps, space: string): PortalSession[] {
  const out: PortalSession[] = [];
  for (const key of sessionsIn(d.db, space, 200)) {
    const s = d.sessions.summary(key);
    if (!s || hidden(d.db, s)) continue;
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

/** A picture, video or sound as a link shows it: never its file's place, what it was made from, or its session. */
export const mediaView = (m: MediaItem): PortalMedia => ({
  id: m.id,
  kind: m.kind,
  title: m.title,
  ...(m.description ? { description: m.description } : {}),
  mime: m.mime,
  bytes: m.bytes,
  ...(m.width ? { width: m.width } : {}),
  ...(m.height ? { height: m.height } : {}),
  ...(m.duration ? { duration: m.duration } : {}),
  ...(m.peaks?.length ? { peaks: m.peaks } : {}),
  updatedAt: m.updatedAt,
});

async function portalView(d: Deps, p: Person): Promise<PortalView> {
  const { db } = d;
  const me = { id: p.share.id, name: p.share.name, role: p.share.role, ...(p.share.expiresAt ? { expiresAt: p.share.expiresAt } : {}) };
  const texEdits = p.share.role === 'edit' && (await texShutIn());
  const none = { sessions: [], runs: [], reading: [] };
  if (p.scope.kind === 'page') {
    // Read again: its title and version as they are now.
    const page = pageInfo(db, p.scope.page.id) ?? p.scope.page;
    return { thing: { kind: 'page', id: page.id, title: page.title }, owner: ownerName(db), me, items: [itemView(page)], media: [], ...none, texEdits };
  }
  if (p.scope.kind === 'media') {
    const m = p.scope.media;
    return { thing: { kind: 'media', id: m.id, title: m.title }, owner: ownerName(db), me, items: [], media: [mediaView(m)], ...none, texEdits: false };
  }
  const s = p.scope.space;
  return {
    project: { name: s.name, color: s.color, ...(s.description ? { description: s.description } : {}) },
    owner: ownerName(db),
    me,
    items: listPages(db)
      .filter((x) => x.space === s.id)
      .map(itemView),
    media: [],
    sessions: projectSessions(d, s.id),
    runs: projectRuns(db, s.id),
    reading: readingList(db, s),
    texEdits,
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

/** What a person asks of a document's comments: a new one (on words, a slide, or a sheet's cell), or a change of one. */
type Op = { add: string; quote?: string; slide?: number; sheet?: string; cell?: string } | { id: string; reply: string } | { id: string; resolved: boolean } | { id: string; text: string } | { id: string; delete: true };

function opOf(b: Record<string, unknown>): Op {
  const text = (k: string) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, 4000) : '');
  const id = typeof b.id === 'string' ? b.id : '';
  if (!id) {
    if (!text('text')) throw new HttpError(400, 'Write the comment');
    const quote = typeof b.quote === 'string' ? b.quote.replace(/\s+/g, ' ').trim() : '';
    if (quote.length > 500) throw new HttpError(400, 'Pick fewer words to comment on (at most 500 characters)');
    const slide = Number(b.slide);
    const sheet = typeof b.sheet === 'string' ? b.sheet.slice(0, 100) : '';
    const cell = typeof b.cell === 'string' ? b.cell.replace(/\$/g, '').trim().toUpperCase().slice(0, 12) : '';
    return { add: text('text'), ...(quote ? { quote } : {}), ...(Number.isInteger(slide) && slide > 0 ? { slide } : {}), ...(sheet ? { sheet } : {}), ...(cell ? { cell } : {}) };
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

/** A comment op on a list (a document's or a LaTeX document's, a slide's, a sheet's): the list after it, and what was said. `place` puts a new comment where it goes. */
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

/** A change of a comment kept in one of a model's lists (a slide's, a sheet's): the list that holds it. */
function listOf(lists: Map<string, Comment[]>, id: string): string {
  for (const [k, l] of lists) if (l.some((c) => c.id === id)) return k;
  throw new HttpError(404, 'That comment is no longer there');
}

/** A comment op on slides: a new one on a slide (by its number, the first when left out). */
function slidesOp(deck: unknown, op: Op, w: Who, now: number): { model: unknown; said?: Said } {
  const lists = commentLists('slides', deck);
  const keys = [...lists.keys()];
  let key: string;
  if ('add' in op) {
    const n = op.slide ?? 1;
    if (!keys[n - 1]) throw new HttpError(400, `There is no slide ${n}: the slides are 1 to ${keys.length}`);
    key = keys[n - 1];
  } else key = listOf(lists, op.id);
  const { list, said } = onList(lists.get(key)!, op, w, now, (c) => c);
  return { model: withLists('slides', deck, new Map([[key, list]])), said };
}

/** A comment op on a spreadsheet: a new one on a cell of a sheet (by its id or name, the first when left out); on a cell that has one already, a reply to it. */
function sheetOp(book: unknown, op: Op, w: Who, now: number): { model: unknown; said?: Said } {
  const lists = commentLists('sheet', book) as Map<string, SheetComment[]>;
  const sheets = ((book as { sheets?: { id: string; name: string }[] }).sheets ?? []).filter((x) => lists.has(x.id));
  if ('add' in op) {
    const sh = op.sheet ? sheets.find((x) => x.id === op.sheet || x.name === op.sheet) : sheets[0];
    if (!sh) throw new HttpError(400, op.sheet ? `There is no sheet “${op.sheet}”` : 'This spreadsheet has no sheet');
    const at = op.cell ? parseRef(op.cell) : null;
    if (!at || at.r >= SHEET_LIMITS.rows || at.c >= SHEET_LIMITS.cols) throw new HttpError(400, 'Say which cell it is on, as B4');
    const cell = refName(at.r, at.c);
    const list = lists.get(sh.id) ?? [];
    const there = list.find((c) => c.cell === cell);
    const out = there ? onList(list, { id: there.id, reply: op.add }, w, now, (c) => c as SheetComment) : onList<SheetComment>(list, op, w, now, (c) => ({ ...c, cell }));
    return { model: withLists('sheet', book, new Map([[sh.id, cleanSheetComments(out.list)]])), said: out.said };
  }
  const key = listOf(lists, op.id);
  const { list, said } = onList(lists.get(key)!, op, w, now, (c) => c as SheetComment);
  return { model: withLists('sheet', book, new Map([[key, list]])), said };
}

/** The words of a page of HTML as it reads (its tags, scripts and styles left out), to find a comment's words in. */
const pageText = (html: string) =>
  html
    .replace(/<(script|style|template)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** A comment op on a page of HTML (or a design): kept apart from its HTML, a new one on the block its words are in. */
async function htmlOp(db: DB, page: PageInfo, op: Op, w: Who): Promise<{ said?: Said }> {
  const list = pageComments(db, page.id);
  let ops: Record<string, unknown>[];
  if ('add' in op) {
    let words = '';
    if (op.quote) {
      const f = findWords(pageText((await pageHtml(db, page.id))?.html ?? ''), op.quote);
      if (!f) throw new HttpError(400, NOT_THERE.replace('the document', 'the page'));
      words = f.words.replace(/\s+/g, ' ').slice(0, 300);
    }
    ops = [{ text: op.add, ...(words ? { quote: words, on: words } : {}) }];
  } else {
    const c = list.find((x) => x.id === op.id);
    if (!c) throw new HttpError(404, 'That comment is no longer there');
    const own = c.by === 'person' && c.who === w.id;
    if (('delete' in op || 'text' in op) && !own) throw new HttpError(403, 'You can change or delete only your own comments');
    ops = ['reply' in op ? { id: op.id, reply: op.reply } : 'resolved' in op ? { id: op.id, ...(op.resolved ? { resolve: true } : { reopen: true }) } : 'delete' in op ? { id: op.id, delete: true } : { id: op.id, edit: op.text }];
  }
  const r = changeComments(db, page.id, ops, { name: w.name, who: w.id });
  if (r.added[0] && 'add' in op) return { said: { cid: r.added[0], text: op.add } };
  if (r.replied[0] && 'reply' in op) return { said: { cid: r.replied[0].id, parent: r.replied[0].parent, text: op.reply } };
  return {};
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
    // A deck's comments a slide, a workbook's a sheet: who wrote each kept across them all.
    if (kind === 'slides' || kind === 'sheet') return withLists(kind, model, personLists(commentLists(kind, stored), commentLists(kind, model), w));
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return model;
}

/** Every comment of a model, in all its lists. */
const allComments = (kind: PageInfo['kind'], model: unknown): Comment[] => (kind === 'doc' || kind === 'tex' || kind === 'slides' || kind === 'sheet' ? [...commentLists(kind, model).values()].flat() : []);

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

/** The owner hears of it: a notice (to every open page and pushed to their phone), and an inbox line until it is answered. `on`: a page's id, or "media:<id>". */
export function tellOwner(d: Deps, on: { id: string; title: string }, w: Who, said: Said) {
  noteComment(d.db, on.id, said, w);
  const text = said.text.replace(/\s+/g, ' ');
  const n: NotifyEvent = {
    key: `share:${w.id}`,
    kind: 'waiting',
    title: on.title,
    body: `${w.name} ${said.parent ? 'replied' : 'commented'}: “${text.length > 140 ? `${text.slice(0, 139)}…` : text}”`,
    agent: 'acp',
    at: Date.now(),
    url: placeOf(on.id),
  };
  const s = d.sessions as unknown as { emit?: (e: string, n: NotifyEvent) => void };
  if (typeof s.emit === 'function') s.emit('notify', n);
}

/** A page's comments as a person's portal lists them, each with where it is, the owner's under the owner's name. */
function portalComments(db: DB, page: PageInfo, model: unknown): PortalComment[] | undefined {
  if (!PORTAL_COMMENTS.includes(kindKey(page.kind))) return undefined;
  const owner = ownerName(db);
  if (!page.kind) return forPerson(pageComments(db, page.id), owner).map(({ on, ...c }: PageComment) => ({ ...c, ...(on?.words ? { on: on.words } : {}) }));
  const lists = [...commentLists(page.kind, model)];
  if (page.kind === 'slides') return lists.flatMap(([, l], i) => forPerson(l, owner).map((c) => ({ ...c, slide: i + 1 })));
  if (page.kind === 'sheet') {
    const names = new Map(((model as { sheets?: { id: string; name: string }[] } | null)?.sheets ?? []).map((x) => [x.id, x.name]));
    return lists.flatMap(([k, l]) => forPerson(l as SheetComment[], owner).map((c) => ({ ...c, sheet: names.get(k) ?? '', cell: c.cell })));
  }
  return forPerson(lists[0]?.[1], owner);
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
  const remember = (m: Map<string, Set<string>>, id: string, v: string) => {
    const s = m.get(id) ?? new Set<string>();
    s.add(v);
    if (s.size > 200) s.delete(s.values().next().value!);
    m.set(id, s);
  };
  /** A picture or a video a page the link opens shows (in any of its versions kept). */
  const shown = (p: Person, sha: string) => {
    const sc = refScope(p);
    return !!sc && !!db.prepare(`select 1 from page_asset_refs r join pages g on g.id = r.page_id where r.sha = ? and ${sc.sql} and g.app is null limit 1`).get(sha, sc.arg);
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
    const model = page.kind ? pageModel(db, page.id) : null;
    const comments = portalComments(db, page, model);
    // Where a new comment can go: a deck's slides (by their titles), a workbook's sheets.
    const places =
      page.kind === 'slides'
        ? { slides: ((model as Deck | null)?.slides ?? []).map((x) => slideTitle(x)) }
        : page.kind === 'sheet'
          ? { sheets: ((model as { sheets?: { id: string; name: string }[] } | null)?.sheets ?? []).map((x) => ({ id: x.id, name: x.name })) }
          : {};
    const html = (await pageHtml(db, page.id, undefined, 'viewer'))!.html;
    if (await canEdit(p, page)) {
      // A page of HTML (or a design) is edited as its HTML; another kind as its model, the owner's comments under the owner's name.
      if (!page.kind) return { page: itemView(page), editable: true, html, ...(comments ? { comments } : {}) };
      const owner = ownerName(db);
      return { page: itemView(page), editable: true, model: mapLists(page.kind, model, (l) => forPerson(l, owner)), ...(comments ? { comments } : {}), ...places };
    }
    return { page: itemView(page), editable: false, html, ...(comments ? { comments } : {}), ...places };
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
    if (!PORTAL_COMMENTS.includes(kindKey(page.kind))) throw new HttpError(400, 'A notebook takes no comments');
    const op = opOf(body(req));
    take(p, 'comment', 200, 'That is a lot of comments in an hour.');
    const now = Date.now();
    // A page of HTML keeps its comments apart from it: no new version.
    if (!page.kind) {
      const out = await htmlOp(db, page, op, p.who);
      if (out.said) {
        tellOwner(d, page, p.who, out.said);
        noteActivity(db, p.share.id, out.said.parent ? 'reply' : 'comment', page);
      }
      d.broadcast({ t: 'feature', id: 'pages', data: { what: 'comments', id: page.id } });
      d.broadcast({ t: 'feature', id: 'sharing', data: { activity: true } });
      return { version: page.version, comments: portalComments(db, page, null) };
    }
    const model = pageModel(db, page.id);
    const out = page.kind === 'doc' ? docOp(model as Doc, op, p.who, now) : page.kind === 'tex' ? texOp(model as TexDoc, op, p.who, now) : page.kind === 'slides' ? slidesOp(model, op, p.who, now) : sheetOp(model, op, p.who, now);
    const saved = addVersion(db, page.id, { model: out.model, by: 'edit', who: p.share.name });
    keepRunAsOne(db, page.id, page.version, saved.version);
    noteShareVersion(db, page.id, saved.version, p.share.id, 'comment');
    if (out.said) {
      tellOwner(d, saved, p.who, out.said);
      noteActivity(db, p.share.id, out.said.parent ? 'reply' : 'comment', saved);
    }
    changed();
    return { version: saved.version, comments: portalComments(db, saved, pageModel(db, page.id)) };
  });

  app.post('/p-api/:token/items/:id/versions', { bodyLimit: 24 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    if (p.share.role !== 'edit') throw new HttpError(403, 'This link lets you read and comment, not change it');
    if (!(await canEdit(p, page)))
      throw new HttpError(403, page.locked ? 'Its owner locked it: it can’t be changed now' : page.kind === 'tex' ? 'LaTeX documents are changed through a link only where TeX runs shut in on the owner’s computer' : 'This kind of document is not changed through a link');
    const b = body(req);
    take(p, 'save', 240, 'That is a lot of saves in an hour.');
    const base = Number(b.base);
    if (!page.kind) {
      // A page of HTML, or a design: its words, pictures and layout change; its code (scripts, what runs) never does, and
      // nothing new is fetched from the web by this computer (its picture in the Library is taken here).
      if (typeof b.html !== 'string') throw new HttpError(400, 'Send the page’s HTML');
      if (Number.isInteger(base) && base > 0 && base !== page.version && b.force !== true) throw new HttpError(409, `Version ${page.version} was saved after the one you changed (${base}).`);
      const stored = (await pageHtml(db, page.id))?.html ?? '';
      // A design carries the app's own fitting script, put back here as the app has it (so it is not theirs to change).
      const design = isDesignHtml(b.html);
      const html = design ? withDesignKit(b.html) : b.html;
      if (!sameCode(codeOf(stored, { trustedKit: isDesignHtml(stored) }), codeOf(html, { trustedKit: design })))
        throw new HttpError(400, 'A page’s code (its scripts, and what runs when it is clicked) can’t be changed through a link: change its words, pictures and layout');
      const had = new Set(webAddressesOf(stored));
      if (webAddressesOf(html).some((u) => !had.has(u))) throw new HttpError(400, 'Add pictures from your device: a picture or a file at a web address can’t be added through a link');
      const saved = addVersion(db, page.id, { html, by: 'edit', who: p.share.name });
      noteShareVersion(db, page.id, saved.version, p.share.id, 'edit');
      noteActivity(db, p.share.id, 'edit', saved);
      changed([page.id]);
      return { page: itemView(saved) };
    }
    if (!b.model || typeof b.model !== 'object') throw new HttpError(400, 'Send the document’s model');
    let model: unknown = b.model;
    if (Number.isInteger(base) && base > 0 && base !== page.version) {
      // Only people's comments came meanwhile: they join this save.
      const c = carryComments(db, page.id, base, model);
      model = c.model;
      if (!c.onlyComments && b.force !== true) throw new HttpError(409, `Version ${page.version} was saved after the one you changed (${base}).`);
    }
    const stored = pageModel(db, page.id);
    // Pictures come from the person's device (as naget-asset:): a picture at a web address that was not there before
    // would have this computer fetch it when it draws the document (an export, its picture in the list).
    const webSrcs = (v: unknown) => new Set([...JSON.stringify(v ?? null).matchAll(/"src":"(https?:\/\/[^"]+)"/gi)].map((m) => m[1]));
    const had = webSrcs(stored);
    if ([...webSrcs(model)].some((u) => !had.has(u))) throw new HttpError(400, 'Add pictures from your device: a picture at a web address can’t be added through a link');
    model = withTheirComments(page.kind, model, stored, p.who);
    const saved = addVersion(db, page.id, { model, by: 'edit', who: p.share.name });
    noteShareVersion(db, page.id, saved.version, p.share.id, 'edit');
    noteActivity(db, p.share.id, 'edit', saved);
    for (const said of newWords(allComments(page.kind, stored), allComments(page.kind, model), p.who)) tellOwner(d, saved, p.who, said);
    changed([page.id]);
    return { page: itemView(saved) };
  });

  app.get('/p-api/:token/sessions/:key', async (req, reply) => {
    const p = person(req);
    quiet(reply);
    const key = String(P(req).key ?? '');
    const s = p.scope.kind === 'project' && sessionsIn(db, p.scope.space.id, 500).includes(key) ? d.sessions.summary(key) : null;
    if (!s || hidden(db, s)) throw new HttpError(404, 'This project has no such session');
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
    const ours = /^[a-f0-9]{16,64}$/.test(sha) && (uploadedBy(p.share.id, sha) || shown(p, sha));
    const a = ours ? getAsset(db, sha) : null;
    if (!a) return reply.code(404).send({ error: 'No such picture' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox").type(a.mime).send(a.data);
  });

  // A video a page or a deck shows (or one the person added in an editor), in parts for the player.
  app.get('/p-api/:token/pages/videos/:sha', async (req, reply) => {
    const p = person(req);
    const sha = String(P(req).sha ?? '');
    const ours = /^[a-f0-9]{16,64}$/.test(sha) && (uploadedBy(p.share.id, sha) || shown(p, sha));
    return sendVideo(req, reply, ours ? getVideo(db, sha) : null);
  });

  // A page's comments as its editor reads and changes them (a page of HTML, or a design): theirs under their name.
  app.get('/p-api/:token/pages/:id/comments', async (req, reply) => {
    const p = person(req);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    if (page.kind) throw new HttpError(400, 'Its comments are in it');
    return { comments: forPerson(pageComments(db, page.id), ownerName(db)) };
  });
  app.post('/p-api/:token/pages/:id/comments', { bodyLimit: 256 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    const page = itemOf(db, p, P(req).id);
    if (page.kind) throw new HttpError(400, 'Its comments are in it');
    take(p, 'comment', 200, 'That is a lot of comments in an hour.');
    const ops = (body(req).ops ?? []) as unknown;
    // The owner's comments come back under their own name (who: owner) from the editor: kept as theirs.
    const r = changeComments(db, page.id, ops, { name: p.share.name, who: p.share.id });
    const said: Said[] = [
      ...r.added.map((cid) => ({ cid, text: r.list.find((c) => c.id === cid)?.text ?? '' })),
      ...r.replied.map((x) => ({ cid: x.id, parent: x.parent, text: r.list.find((c) => c.id === x.parent)?.replies?.find((y) => y.id === x.id)?.text ?? '' })),
    ];
    for (const one of said) tellOwner(d, page, p.who, one);
    if (said.length) noteActivity(db, p.share.id, said[said.length - 1].parent ? 'reply' : 'comment', page);
    d.broadcast({ t: 'feature', id: 'pages', data: { what: 'comments', id: page.id } });
    return { comments: forPerson(r.list, ownerName(db)), added: r.added };
  });

  // A picture added in an editor (Edit): from the person's device only, never fetched by this computer.
  app.post('/p-api/:token/pages/assets', { bodyLimit: 18 * 1024 * 1024 }, async (req, reply) => {
    const p = person(req, true);
    quiet(reply);
    if (p.share.role !== 'edit') throw new HttpError(403, 'This link lets you read and comment, not change it');
    const b = body(req);
    const m = typeof b.data === 'string' ? /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(b.data) : null;
    if (!m) throw new HttpError(400, 'Add a picture from your device (a link to one on the web cannot be fetched from here)');
    take(p, 'picture', 120, 'That is a lot of pictures in an hour.');
    const sha = putAsset(db, Buffer.from(m[1], 'base64'));
    rememberUpload(p.share.id, sha);
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
