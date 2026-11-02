// Pages: HTML pages agents make. show_html shows one in the conversation (the page is the call's own
// input, so it lives in the agent's transcript); the user's clicks on its choices come back to the
// message box. save_page keeps one in the Pages library, with versions and storage of its own, and an
// address of its own for a phone's home screen. publish_site asks the user to put a folder (a
// project's build) or a saved page at a link; nothing is published until they confirm on the card.
//
// While an agent writes a page, the pages showing its session watch it grow (drafts.ts); the user can
// change a page in the editor (visual or code), and the agent hears of it with their next message
// (edits.ts). Each saved page has a picture in Pages (thumbs.ts).
//
// Routes, signed in:
//   GET/POST /api/pages, GET/PATCH/DELETE /api/pages/:id, GET /api/pages/kept?key=, GET /api/pages/drafts?key=
//   POST /api/pages/:id/versions, GET /api/pages/:id/versions/:v, POST …/restore, POST /api/pages/:id/copy
//   POST /api/pages/:id/storage, GET/DELETE /api/pages/:id/data, POST /api/pages/:id/link, GET /api/pages/:id/thumb
//   POST /api/pages/file-edit
//   GET/POST /api/sites, DELETE /api/sites/:id, GET/POST /api/sites/requests/:id
// Routes whose token is the permission (no sign-in, never the app's cookies at work):
//   GET /pg/:token (the page's own address), /pg/:token/html, /pg/:token/manifest.webmanifest, POST /pg/:token/storage
//   GET /site/:token/* (published sites, sandboxed)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { PagesEvent, PublishRequest } from '../../shared/pages.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { resolvePath } from '../files.ts';
import type { Deps, Feature, RunTool } from '../features/types.ts';
import { setCaptureDb } from '../capture/index.ts';
import { draftsOf, endDrafts, feedDraft, type ToolStream } from './drafts.ts';
import { dropEdits, initEdits, noteEdit, noteFileEdit, takeEdits } from './edits.ts';
import { shellManifest, shellPage } from './shell.ts';
import { createRequest, decideRequest, getRequest, initSites, listSites, publish, serveSite, unpublish, unpublishPage } from './sites.ts';
import {
  addVersion,
  checkHtml,
  clearStorage,
  copyPage,
  createPage,
  deletePage,
  initPages,
  keptIn,
  listPages,
  mustPage,
  pageByToken,
  pageHtml,
  pageInfo,
  pageToken,
  putValues,
  renamePage,
  resetPageLink,
  restoreVersion,
  storageEntries,
  storageOp,
  storageText,
  versionsOf,
} from './store.ts';
import { dropThumbs, enableThumbs, refreshThumbs, thumbFile } from './thumbs.ts';

export { MAX_PAGE } from './store.ts';

const tell = (d: Deps, data: PagesEvent) => d.broadcast({ t: 'feature', id: 'pages', data });

const CHOICES =
  'Choices: a click on an element with data-choice="Blue" puts "Chose: Blue" in the user’s message box (they send it, with anything they add); data-group="Color" on it or a container makes it "Color: Blue"; data-multi on the container lets them pick several. A <form data-choice-form="Trip"> puts its named fields there when submitted. Offer 2 to 4 options at a time.';
const CLASSES =
  'Ready-made classes, all optional: body.n-page (clean type, follows the app’s light or dark theme), .n-options > .n-option (rows: .n-letter, h3, p), .n-grid > .n-card (an img or .n-media, then .n-body), table.n-compare (.n-yes, .n-no, .n-best; wrap wide ones in .n-scroll), .n-proscons > .n-pros + .n-cons (h4, ul), .n-btn (.n-primary), .n-field (a label around an input), .n-row, .n-tag, .n-muted. A picked choice gets .n-selected.';

const SHOW_HTML: RunTool = {
  name: 'show_html',
  annotations: { readOnlyHint: true },
  description: [
    'Show the user an HTML page inside the conversation: a report, a chart, a table, a diagram, a mock-up, options to pick from.',
    'Use it when a visual is clearer than text, or when asked for one. The page renders in a sandboxed frame: in the conversation, beside it or',
    'full screen, from a phone’s 360px to a whole screen wide, and grows to its content height. Make it fill whatever width it gets: no max-width or',
    'fixed width on the body or a wrapper; fluid layouts (grids with auto-fit columns, percentages, wrapping rows). A page that sets no background of its own shows on white. Write a complete, self-contained page: inline CSS and',
    'JavaScript; scripts may load from CDNs (cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com). It cannot reach this app or the',
    'user’s files, so embed the data; localStorage keeps nothing. The user sees the page itself; do not repeat its contents in your reply.',
    CHOICES,
    CLASSES,
    'For a page the user will come back to (a tracker, a calculator), use save_page instead.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'A short name for the page, shown above it.' },
      html: { type: 'string', description: 'The whole page, <!doctype html> included.' },
    },
    required: ['html'],
  },
  async run(a) {
    checkHtml(a.html);
    return 'The page is showing in the conversation.';
  },
};

const SAVE_PAGE: RunTool = {
  name: 'save_page',
  description: [
    'Save a page in the user’s Pages library: a small app or tool they keep and come back to (a tracker, a calculator, a checklist, a planner).',
    'It shows in the conversation, in Pages, and at an address of its own that the user can add to a phone’s home screen.',
    'The same page rules, choices and classes as show_html, plus storage that lasts, kept by this app for the page:',
    'await naget.storage.get(key) (the value, or null), set(key, value) (any JSON), remove(key), keys(); about 2 MB per page. localStorage keeps nothing.',
    'Leave out id to make a new page; give the id of a saved page (get_page lists them) to replace it with a new version:',
    'older versions stay restorable, and its stored data stays.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A saved page’s id, to save a new version of it.' },
      title: { type: 'string', description: 'The page’s name in Pages and on a home screen: "Workout log".' },
      html: { type: 'string', description: 'The whole page, <!doctype html> included.' },
    },
    required: ['title', 'html'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
    const p = id ? addVersion(db, id, { title: a.title, html: a.html, by: 'agent' }) : createPage(db, { title: a.title, html: a.html, by: 'agent', sessionKey: ctx.key });
    tell(ctx.deps, { what: 'pages' });
    refreshThumbs(ctx.deps, [p.id]);
    return `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in Pages (${ctx.deps.publicBase()}/pages/${p.id}), where the user can open it at its own address and add it to a phone’s home screen.`;
  },
};

const GET_PAGE: RunTool = {
  name: 'get_page',
  annotations: { readOnlyHint: true },
  description:
    'The user’s saved pages (Pages). With no id: each page’s id, title, version and last change. With an id: that page’s current HTML and the data it stores, to change it with save_page or to answer questions about it.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'A saved page’s id.' } } },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    if (!id) {
      const list = listPages(db);
      return list.length ? list.map((p) => `- ${p.id} · ${p.title} · version ${p.version} · changed ${new Date(p.updatedAt).toISOString()}`).join('\n') : 'No saved pages yet.';
    }
    const p = mustPage(db, id);
    const html = pageHtml(db, id)!.html;
    const data = storageText(db, id);
    const by = p.by === 'edit' || p.by === 'made' ? ' It was last changed by the user in the page editor: keep their changes.' : '';
    // Agents' tool output is cut further on anyway: say so here rather than lose the end unnoticed.
    const cut = html.length > 100_000 ? `${html.slice(0, 100_000)}\n… (cut: the page is ${Math.round(html.length / 1024)} KB; write the whole page anew to change it)` : html;
    return `${p.title} (page ${p.id}, version ${p.version} of ${p.versions} kept).${by}\n\n${data ? `Stored data:\n${data}\n\n` : 'It stores no data yet.\n\n'}HTML:\n${cut}`;
  },
};

/** A path an agent gave: from its session's folder, from home (~), or absolute. */
const fromSession = (cwd: string, p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : path.resolve(cwd || config.defaultCwd, p));

/** Built sites often load their files from the root (/assets/…), which a link under /site/… does not have. */
function rootPaths(folder: string): boolean {
  try {
    const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8').slice(0, 1 << 20);
    return /\s(?:src|href)\s*=\s*["']?\/(?!\/)[^"'\s>]/i.test(html);
  } catch {
    return false;
  }
}

const PUBLISH_SITE: RunTool = {
  name: 'publish_site',
  description: [
    'Publish a website at a link of its own, for others to open or for the user’s phone: a built folder (dist/, build/ or out/ with an index.html;',
    'build it with relative asset paths, e.g. Vite base: \'./\') or a saved page (page: its id). The user sees a card and decides, with a private',
    '(unguessable) or a public link: nothing is published until they confirm, and you get a message with the outcome and the link.',
    'Sites run sandboxed: no cookies, localStorage forgets on reload, no server code; calls to outside APIs over HTTPS work.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      folder: { type: 'string', description: 'The folder to publish: from the session’s folder, or absolute.' },
      page: { type: 'string', description: 'Instead of a folder: a saved page’s id.' },
      name: { type: 'string', description: 'The site’s name; a public link is made from it.' },
    },
    required: ['name'],
  },
  async run(a, ctx) {
    const page = typeof a.page === 'string' && a.page.trim() ? a.page.trim() : undefined;
    const folder = !page && typeof a.folder === 'string' && a.folder.trim() ? fromSession(ctx.cwd, a.folder.trim()) : undefined;
    if (!page && !folder) throw new Error('Give folder (a built site) or page (a saved page’s id).');
    const r = createRequest(ctx.deps.db, { sessionKey: ctx.key, name: a.name, folder, pageId: page });
    tell(ctx.deps, { what: 'request', request: r });
    const what = r.kind === 'page' ? `the saved page "${r.pageTitle ?? r.pageId}"` : `${r.folder}, ${r.files} file${r.files === 1 ? '' : 's'}`;
    const warn =
      r.folder && rootPaths(r.folder)
        ? ' Note: its index.html loads files from the root (/…), which will not be found under the site’s link; rebuild it with relative paths (Vite: base: \'./\') before the user confirms.'
        : '';
    return `The user is asked to confirm publishing "${r.name}" (${what}) (request ${r.id}). Nothing is published until they do; you will get a message with the outcome and the link.${warn}`;
  },
};

/**
 * What every agent is told at its start: which of these tools fits what. Without it agents knew the
 * tools only by name (Claude Code defers MCP tools' descriptions), and one asked for "a tracker I can
 * keep" wrote an HTML file that never reached Pages.
 */
const INSTRUCTIONS =
  'Pages: show_html shows a page in the conversation (a report, a chart, a table, a mock-up, options to pick from). When the user wants something to keep and come back to (a tracker, a log, a calculator, a checklist, a planner), make it a page and save it with save_page rather than as an HTML file, unless they ask for a file: it goes into their Pages library, can go on a phone’s home screen, and keeps what it stores with naget.storage on every device (a file’s localStorage stays in one browser). get_page lists saved pages, to change one.';

/** What the agent hears once the user decided on its publish_site card. */
function outcome(r: PublishRequest, base: string): string {
  if (r.status === 'published' && r.site) {
    const how = r.site.visibility === 'public' ? 'a public link: anyone can open it' : 'a private link: only people who have it can open it';
    return `publish_site: the user published "${r.name}" at ${base}${r.site.path} (${how}). They can unpublish it in Pages → Published.`;
  }
  if (r.status === 'failed') return `publish_site: publishing "${r.name}" failed: ${r.error ?? 'unknown error'}`;
  return `publish_site: the user chose not to publish "${r.name}".`;
}

/** A request from this app's own pages (the shell of a page's own address), not from a page or another site. */
function sameOrigin(req: FastifyRequest): boolean {
  const o = req.headers.origin;
  if (!o) return false;
  if (config.allowedOrigins.includes(o)) return true;
  try {
    return new URL(o).host === req.headers.host;
  } catch {
    return false;
  }
}

function routes(d: Deps) {
  const { app, db } = d;
  initPages(db);
  initSites(db);
  initEdits(db);
  const P = (req: FastifyRequest) => req.params as Record<string, string>;
  const B = (req: FastifyRequest) => (req.body ?? {}) as Record<string, unknown>;
  const key = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 300) : undefined);
  const changed = (id: string) => {
    tell(d, { what: 'pages' });
    refreshThumbs(d, [id]);
  };

  // ---- the library -------------------------------------------------------------------------------
  app.get('/api/pages', async () => {
    const published = new Set(listSites(db).flatMap((s) => (s.pageId ? [s.pageId] : [])));
    // Pictures out of date (a page's data changed) are taken again meanwhile.
    refreshThumbs(d);
    return { pages: listPages(db).map((p) => (published.has(p.id) ? { ...p, published: true } : p)) };
  });
  app.get('/api/pages/kept', async (req) => ({ items: keptIn(db, String((req.query as { key?: string }).key ?? '')) }));
  /** The pages an agent of this session is writing now, whole so far. */
  app.get('/api/pages/drafts', async (req) => ({ drafts: draftsOf(String((req.query as { key?: string }).key ?? '')) }));
  /**
   * Keep: a page from the conversation (and what it stored meanwhile) goes into Pages; with `edited`, the
   * user's changed version goes on top of it (and the agent hears of it). Without `item`, a page the user
   * makes (from a starting point in Pages).
   */
  app.post('/api/pages', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const sessionKey = key(b.sessionKey);
    const item = key(b.item);
    const edited = typeof b.edited === 'string' && b.edited.trim() ? b.edited : undefined;
    let page = sessionKey && item ? pageInfo(db, keptIn(db, sessionKey)[item] ?? '') : null;
    if (page && !edited) return { page };
    const fresh = !page;
    if (!page) {
      const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? Object.entries(b.data as Record<string, unknown>).map(([k, v]) => [k, JSON.stringify(v)] as [string, string]) : [];
      page = createPage(db, { title: b.title, html: b.html, by: item ? 'user' : 'made', sessionKey, sourceItem: item });
      try {
        if (data.length) putValues(db, page.id, data.filter(([, v]) => v !== undefined));
      } catch (e) {
        deletePage(db, page.id);
        throw e;
      }
    }
    if (edited) {
      const from = page.version;
      page = addVersion(db, page.id, { title: b.title, html: edited, by: 'edit' });
      noteEdit(db, [sessionKey], page.id, from, page.version, fresh && !!item);
    }
    changed(page.id);
    return { page: pageInfo(db, page.id) };
  });
  app.get('/api/pages/:id', async (req) => {
    const p = mustPage(db, P(req).id);
    return { page: p, html: pageHtml(db, p.id)!.html, versions: versionsOf(db, p.id), link: `/pg/${pageToken(db, p.id)}` };
  });
  app.patch('/api/pages/:id', async (req) => {
    const page = renamePage(db, P(req).id, B(req).title);
    tell(d, { what: 'pages' });
    return { page };
  });
  app.delete('/api/pages/:id', async (req) => {
    const id = P(req).id;
    if (unpublishPage(db, id)) tell(d, { what: 'sites' });
    deletePage(db, id);
    dropEdits(db, id);
    dropThumbs(id);
    tell(d, { what: 'pages' });
    return { ok: true };
  });
  /**
   * The user's changed page, as a new version. `base`: the version they changed; when a newer one was
   * saved meanwhile it is refused (409) unless `force`. The agents of `sessionKey` and of the session that
   * made the page hear of it with the user's next message.
   */
  app.post('/api/pages/:id/versions', { bodyLimit: 6 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const id = P(req).id;
    const cur = mustPage(db, id);
    const base = Number(b.base);
    if (Number.isInteger(base) && base > 0 && base !== cur.version && b.force !== true) throw new HttpError(409, `Version ${cur.version} was saved after the one you changed (${base}).`);
    const page = addVersion(db, id, { title: b.title, html: b.html, by: 'edit' });
    noteEdit(db, [key(b.sessionKey), cur.sessionKey], id, Number.isInteger(base) && base > 0 ? base : cur.version, page.version);
    changed(id);
    return { page };
  });
  app.get('/api/pages/:id/versions/:v', async (req) => {
    const v = pageHtml(db, P(req).id, Number(P(req).v));
    if (!v) throw new HttpError(404, 'That version is no longer kept');
    return v;
  });
  app.post('/api/pages/:id/versions/:v/restore', async (req) => {
    const page = restoreVersion(db, P(req).id, Number(P(req).v));
    changed(page.id);
    return { page };
  });
  /** The user changed an HTML file in the page editor beside a conversation: its agent hears of it with their next message. */
  app.post('/api/pages/file-edit', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const sessionKey = key(b.sessionKey);
    if (!sessionKey || typeof b.path !== 'string' || !b.path.startsWith('/') || typeof b.before !== 'string' || typeof b.after !== 'string') throw new HttpError(400, 'Which session, file, and what changed?');
    if (b.before !== b.after) noteFileEdit(db, sessionKey, b.path.slice(0, 4096), b.before, b.after);
    return { ok: true };
  });
  /** A copy of the page as it is now, without its data. */
  app.post('/api/pages/:id/copy', async (req) => {
    const page = copyPage(db, P(req).id);
    changed(page.id);
    return { page };
  });
  app.post('/api/pages/:id/storage', { bodyLimit: 1024 * 1024 }, async (req) => storageOp(db, P(req).id, req.body));
  /** What the page keeps, every value. */
  app.get('/api/pages/:id/data', async (req) => ({ entries: storageEntries(db, P(req).id) }));
  app.delete('/api/pages/:id/data', async (req) => {
    clearStorage(db, P(req).id);
    tell(d, { what: 'pages' });
    return { ok: true };
  });
  /** Its picture in Pages (404 until it is taken; the pages hear { what: 'thumb' } when it is). */
  app.get('/api/pages/:id/thumb', async (req, reply) => {
    const f = thumbFile(db, P(req).id);
    if (!f) {
      refreshThumbs(d, [P(req).id]);
      return reply.code(404).send({ error: 'No picture yet' });
    }
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type('image/webp').send(fs.createReadStream(f));
  });
  /** A new address for the page; the old one stops working. */
  app.post('/api/pages/:id/link', async (req) => ({ link: `/pg/${resetPageLink(db, P(req).id)}` }));

  // ---- published sites ---------------------------------------------------------------------------
  app.get('/api/sites', async () => ({ sites: listSites(db) }));
  app.post('/api/sites', async (req) => {
    const b = B(req);
    const pageId = typeof b.pageId === 'string' && b.pageId ? b.pageId : undefined;
    const folder = !pageId && typeof b.folder === 'string' && b.folder.trim() ? resolvePath(b.folder) : undefined;
    const site = publish(db, { name: b.name, visibility: b.visibility, folder, pageId });
    tell(d, { what: 'sites' });
    return { site };
  });
  app.delete('/api/sites/:id', async (req) => {
    unpublish(db, P(req).id);
    tell(d, { what: 'sites' });
    return { ok: true };
  });
  app.get('/api/sites/requests/:id', async (req) => {
    const request = getRequest(db, P(req).id);
    if (!request) throw new HttpError(404, 'No such request to publish');
    return { request };
  });
  /** The user's answer on a publish_site card; the agent hears the outcome. */
  app.post('/api/sites/requests/:id', async (req) => {
    const b = B(req);
    const request = decideRequest(db, P(req).id, b.publish === true, b.visibility);
    tell(d, { what: 'request', request });
    if (request.site) tell(d, { what: 'sites' });
    d.sessions.deliverOrQueue(request.sessionKey, outcome(request, d.publicBase())).catch((e) => console.error(`[pages] could not tell the agent: ${(e as Error).message}`));
    return { request };
  });

  // ---- a page's own address ------------------------------------------------------------------------
  const byToken = (req: FastifyRequest) => {
    const id = pageByToken(db, P(req).token);
    return id ? pageInfo(db, id) : null;
  };
  app.get('/pg/:token', async (req, reply) => {
    const p = byToken(req);
    reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');
    if (!p) return reply.code(404).type('text/plain; charset=utf-8').send('This link no longer opens a page: it was reset, or the page was deleted.');
    const s = shellPage(P(req).token, p.title);
    return reply.header('Content-Security-Policy', s.csp).type('text/html; charset=utf-8').send(s.html);
  });
  // The page as JSON, never as a document of this origin.
  app.get('/pg/:token/html', async (req, reply) => {
    const p = byToken(req);
    reply.header('Cache-Control', 'no-store');
    if (!p) return reply.code(404).send({ error: 'Not found' });
    return { title: p.title, html: pageHtml(db, p.id)!.html };
  });
  app.get('/pg/:token/manifest.webmanifest', async (req, reply) => {
    const p = byToken(req);
    if (!p) return reply.code(404).send({ error: 'Not found' });
    return reply.header('Cache-Control', 'no-cache').type('application/manifest+json').send(JSON.stringify(shellManifest(P(req).token, p.title)));
  });
  app.post('/pg/:token/storage', { bodyLimit: 1024 * 1024 }, async (req, reply) => {
    if (!sameOrigin(req)) return reply.code(403).send({ error: 'Cross-origin request refused' });
    const p = byToken(req);
    if (!p) return reply.code(404).send({ error: 'Not found' });
    return storageOp(db, p.id, req.body);
  });

  // ---- published sites, sandboxed ----------------------------------------------------------------
  app.get('/site/:token', async (req, reply) => {
    const q = req.url.indexOf('?');
    return reply.redirect(`/site/${encodeURIComponent(P(req).token)}/${q >= 0 ? req.url.slice(q) : ''}`, 301);
  });
  app.get('/site/:token/*', async (req, reply) => serveSite(db, req, reply));
}

export const pages: Feature = {
  id: 'pages',
  routes,
  tools: () => [SHOW_HTML, SAVE_PAGE, GET_PAGE, PUBLISH_SITE],
  spawn: () => ({ instructions: [INSTRUCTIONS] }),
  // The pages the user changed in the editor, with their next message.
  beforeMessage: (key, d) => takeEdits(d.db, key),
  start(d) {
    setCaptureDb(d.db);
    d.sessions.on('toolstream', (key: string, e: ToolStream) => feedDraft(d, key, e));
    // A turn that ended (or an agent that stopped) leaves no page being written.
    d.sessions.on('live', (key: string, live: { status?: string } | null) => {
      if (!live || !['working', 'waiting', 'starting'].includes(live.status ?? '')) endDrafts(d, key);
    });
    enableThumbs();
    setTimeout(() => refreshThumbs(d), 30_000).unref();
  },
};
