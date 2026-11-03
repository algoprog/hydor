// Pages: HTML pages agents make. show_html shows one in the conversation (the page is the call's own
// input, so it lives in the agent's transcript); the user's clicks on its choices come back to the
// message box. save_page keeps one in the Pages library, with versions and storage of its own, and an
// address of its own for a phone's home screen. save_slides keeps a slide deck there (slides.ts), to edit,
// present and export; save_doc, save_sheet and save_latex keep documents, spreadsheets and LaTeX documents
// (docs.ts, sheets.ts, latex.ts; kinds.ts says what each kind does). export_page makes a file of any of them (a
// PDF, a Word document, a PowerPoint deck, an Excel file…) for the agent to hand over. publish_site asks the user to put a folder (a project's build) or a saved page at a
// link; nothing is published until they confirm on the card.
//
// While an agent writes a page, the pages showing its session watch it grow (drafts.ts); the user can
// change a page in the editor (visual or code), and the agent hears of it with their next message
// (edits.ts). Each saved page has a picture in Pages (thumbs.ts).
//
// Routes, signed in:
//   GET/POST /api/pages, GET/PATCH/DELETE /api/pages/:id, GET /api/pages/kept?key=, GET /api/pages/drafts?key=
//   POST /api/pages/:id/versions, GET /api/pages/:id/versions/:v, POST …/restore, POST /api/pages/:id/copy
//   POST /api/pages/:id/storage, GET/DELETE /api/pages/:id/data, POST /api/pages/:id/link, GET /api/pages/:id/thumb
//   POST /api/pages/file-edit, GET /api/pages/:id/export?format=, POST /api/pages/assets, GET /api/pages/assets/:sha
//   GET/PUT /api/pages/file (a file of the computer's in an editor: filemodel.ts)
//   GET /api/pages/picture?url=, GET /api/pages/fonts.css?f=, GET /api/pages/fonts/*
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
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { setCaptureDb } from '../capture/index.ts';
import { sessionSpace, spaceChoice } from '../spaces/choice.ts';
import { allSpaces } from '../spaces/index.ts';
import { draftsOf, endDrafts, feedDraft, type ToolStream } from './drafts.ts';
import { dropEdits, initEdits, noteEdit, noteFileEdit, takeEdits } from './edits.ts';
import { getAsset, MAX_ASSET, putAsset, sweepAssets, takeIn } from './assets.ts';
import { exportPage, EXPORT_TYPES, type ExportFormat } from './export.ts';
import { fontFile, fontsCss } from './fonts.ts';
import { agentDoc, SAVE_DOC_DESCRIPTION, SAVE_DOC_SCHEMA } from './docs.ts';
import { agentTex, compileSummary, compileTex, readTex, SAVE_LATEX_DESCRIPTION, SAVE_LATEX_SCHEMA, texRoutes } from './latex.ts';
import { agentBook, SAVE_SHEET_DESCRIPTION, SAVE_SHEET_SCHEMA } from './sheets.ts';
import { agentDeck, SAVE_SLIDES_DESCRIPTION, SAVE_SLIDES_SCHEMA } from './slides.ts';
import { openFile, saveFile } from './filemodel.ts';
import { kindForFile, kindOf, mustKind, type PageKind } from './kinds.ts';
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
  pageModel,
  pageSource,
  pageToken,
  putValues,
  renamePage,
  resetPageLink,
  setPageSpace,
  restoreVersion,
  storageEntries,
  storageOp,
  storageText,
  versionsOf,
} from './store.ts';
import { dropThumbs, enableThumbs, refreshThumbs, thumbFile } from './thumbs.ts';

export { MAX_PAGE } from './store.ts';

const tell = (d: Deps, data: PagesEvent) => d.broadcast({ t: 'feature', id: 'pages', data });

/** A kind a request names, checked. */
const mustKindName = (k: string): PageKind => {
  mustKind(k);
  return k as PageKind;
};

const CHOICES =
  'Choices: a click on an element with data-choice="Blue" puts "Chose: Blue" in the user’s message box (they send it, with anything they add); data-group="Color" on it or a container makes it "Color: Blue"; data-multi on the container lets them pick several. A <form data-choice-form="Trip"> puts its named fields there when submitted. Offer 2 to 4 options at a time.';
const LOOK =
  'Its look: unless the user asks for another (their brand, colours of their own, a style), make the page look like part of this app, in its theme: <body class="n-page">, and every colour from the page kit’s variables, which take the app’s current theme, light or dark as the app is, and the user’s own colours: var(--n-bg) the page, --n-card cards, --n-fg text, --n-muted quieter text, --n-line borders, --n-soft quiet fills, --n-accent (with --n-accent-fg on it, --n-accent-soft for tints), --n-ok, --n-warn, --n-err, --n-info, and --n-c1 to --n-c6 for the series of a chart or a diagram (a chart library takes them from getComputedStyle(document.body)); corners var(--n-radius); the app’s font comes with n-page (var(--n-mono) for code). Write no colours of your own and no prefers-color-scheme rules: the kit switches light and dark with the app.';
const CLASSES =
  'Ready-made classes, all optional: .n-options > .n-option (rows: .n-letter, h3, p), .n-grid > .n-card (an img or .n-media, then .n-body), table.n-compare (.n-yes, .n-no, .n-best; wrap wide ones in .n-scroll), .n-proscons > .n-pros + .n-cons (h4, ul), .n-btn (.n-primary), .n-field (a label around an input), .n-row, .n-tag, .n-muted. A picked choice gets .n-selected.';

const SHOW_HTML: RunTool = {
  name: 'show_html',
  annotations: { readOnlyHint: true },
  description: [
    'Show the user an HTML page inside the conversation: a report, a chart, a table, a diagram, a mock-up, options to pick from.',
    'Use it when a visual is clearer than text, or when asked for one. The page renders in a sandboxed frame: in the conversation, beside it or',
    'full screen, from a phone’s 360px to a whole screen wide, and grows to its content height. Make it fill whatever width it gets: no max-width or',
    'fixed width on the body or a wrapper; fluid layouts (grids with auto-fit columns, percentages, wrapping rows). Write a complete, self-contained page: inline CSS and',
    'JavaScript; scripts may load from CDNs (cdn.jsdelivr.net, unpkg.com, cdnjs.cloudflare.com). It cannot reach this app or the',
    'user’s files, so embed the data; localStorage keeps nothing. The user sees the page itself; do not repeat its contents in your reply.',
    LOOK,
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
    'Save a page in the user’s Library: a small app or tool they keep and come back to (a tracker, a calculator, a checklist, a planner).',
    'It shows in the conversation, in the Library, and at an address of its own that the user can add to a phone’s home screen.',
    'The same page rules, look, choices and classes as show_html, plus storage that lasts, kept by this app for the page:',
    'await hydor.storage.get(key) (the value, or null), set(key, value) (any JSON), remove(key), keys(); about 2 MB per page. localStorage keeps nothing.',
    'Leave out id to make a new page; give the id of a saved page (get_page lists them) to replace it with a new version:',
    'older versions stay restorable, and its stored data stays.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A saved page’s id, to save a new version of it.' },
      title: { type: 'string', description: 'The page’s name in the Library and on a home screen: "Workout log".' },
      html: { type: 'string', description: 'The whole page, <!doctype html> included.' },
    },
    required: ['title', 'html'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
    const other = id ? kindOf(mustPage(db, id).kind) : null;
    if (other) throw new Error(`Page ${id} is a ${other.noun}: change it with ${other.tool}.`);
    const p = id ? addVersion(db, id, { title: a.title, html: a.html, by: 'agent' }) : createPage(db, { title: a.title, html: a.html, by: 'agent', sessionKey: ctx.key, space: sessionSpace(db, ctx.key) });
    tell(ctx.deps, { what: 'pages' });
    refreshThumbs(ctx.deps, [p.id]);
    return `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can open it at its own address and add it to a phone’s home screen.`;
  },
};

const GET_PAGE: RunTool = {
  name: 'get_page',
  annotations: { readOnlyHint: true },
  description:
    'The user’s saved pages, slide decks, documents, spreadsheets and LaTeX documents (Pages). With no id: each one’s id, title, kind, version and last change. With an id: a page’s current HTML and the data it stores (to change it with save_page), or a deck’s slides, a document, a spreadsheet or a LaTeX project as it is kept (to change it with save_slides, save_doc, save_sheet or save_latex), or to answer questions about it.',
  inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'A saved page’s id.' } } },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    if (!id) {
      const list = listPages(db);
      const names = new Map(allSpaces(db).map((x) => [x.id, x.name]));
      return list.length
        ? list
            .map((p) => `- ${p.id} · ${p.title}${p.kind ? ` · ${kindOf(p.kind)?.noun ?? p.kind}` : ''}${p.space && names.has(p.space) ? ` · in the project “${names.get(p.space)}”` : ''} · version ${p.version} · changed ${new Date(p.updatedAt).toISOString()}`)
            .join('\n')
        : 'No saved pages yet.';
    }
    const p = mustPage(db, id);
    const k = kindOf(p.kind);
    if (k) {
      const by = p.by === 'edit' || p.by === 'made' ? ` It was last changed by the user in its editor: keep their changes.` : '';
      return `${p.title} (page ${p.id}, version ${p.version} of ${p.versions} kept).${by} ${k.forAgent(pageSource(db, id)!.text)}`;
    }
    const html = (await pageHtml(db, id))!.html;
    const data = storageText(db, id);
    const by = p.by === 'edit' || p.by === 'made' ? ' It was last changed by the user in the page editor: keep their changes.' : '';
    // Agents' tool output is cut further on anyway: say so here rather than lose the end unnoticed.
    const cut = html.length > 100_000 ? `${html.slice(0, 100_000)}\n… (cut: the page is ${Math.round(html.length / 1024)} KB; write the whole page anew to change it)` : html;
    return `${p.title} (page ${p.id}, version ${p.version} of ${p.versions} kept).${by}\n\n${data ? `Stored data:\n${data}\n\n` : 'It stores no data yet.\n\n'}HTML:\n${cut}`;
  },
};

/** The page an agent's save_slides, save_doc… names to change (it must be of that kind), or null to make a new one. */
function changing(db: Deps['db'], a: Record<string, unknown>, kind: PageKind): string | null {
  const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
  if (id && mustPage(db, id).kind !== kind) {
    throw new Error(`Page ${id} is not a ${mustKind(kind).noun}: change it with ${kindOf(mustPage(db, id).kind)?.tool ?? 'save_page'}, or leave out id to make a new one.`);
  }
  return id;
}

/** Keeps what an agent made: a new version of the page it named, or a new page of its session. */
function keepModel(ctx: RunCtx, id: string | null, kind: PageKind, title: unknown, model: unknown) {
  const db = ctx.deps.db;
  const p = id ? addVersion(db, id, { title, model, by: 'agent' }) : createPage(db, { title, kind, model, by: 'agent', sessionKey: ctx.key, space: sessionSpace(db, ctx.key) });
  tell(ctx.deps, { what: 'pages' });
  refreshThumbs(ctx.deps, [p.id]);
  return p;
}

const SAVE_SLIDES: RunTool = {
  name: 'save_slides',
  description: SAVE_SLIDES_DESCRIPTION,
  inputSchema: SAVE_SLIDES_SCHEMA,
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'slides');
    const { deck, notes } = await agentDeck(ctx.deps.db, { ratio: a.ratio, theme: a.theme, slides: a.slides }, ctx.cwd);
    const p = keepModel(ctx, id, 'slides', a.title, deck);
    const n = deck.slides.length;
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}), ${n} slide${n === 1 ? '' : 's'}. It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit it, present it and export it to PowerPoint or PDF.`,
      ...notes,
    ].join(' ');
  },
};

const SAVE_DOC: RunTool = {
  name: 'save_doc',
  description: SAVE_DOC_DESCRIPTION,
  inputSchema: SAVE_DOC_SCHEMA,
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'doc');
    const { id: _id, title: _title, ...rest } = a;
    // The version it changes: what the agent leaves out (paper, font) stays, and unchanged blocks keep their ids.
    const { doc, notes } = await agentDoc(ctx.deps.db, rest, ctx.cwd, id ? pageSource(ctx.deps.db, id)?.text : undefined);
    const p = keepModel(ctx, id, 'doc', a.title, doc);
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit it as in Word or Google Docs and export it as a Word document, a PDF or Markdown.`,
      ...notes,
    ].join(' ');
  },
};

const SAVE_SHEET: RunTool = {
  name: 'save_sheet',
  description: SAVE_SHEET_DESCRIPTION,
  inputSchema: SAVE_SHEET_SCHEMA,
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'sheet');
    const { id: _id, title: _title, ...rest } = a;
    const { book, notes } = await agentBook(rest, ctx.cwd);
    const p = keepModel(ctx, id, 'sheet', a.title, book);
    const n = book.sheets.length;
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}), ${n} sheet${n === 1 ? '' : 's'}. It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit it as in Excel or Google Sheets and export it as an Excel file, a CSV or a PDF.`,
      ...notes,
    ].join(' ');
  },
};

const SAVE_LATEX: RunTool = {
  name: 'save_latex',
  description: SAVE_LATEX_DESCRIPTION,
  inputSchema: SAVE_LATEX_SCHEMA,
  async run(a, ctx) {
    const db = ctx.deps.db;
    const id = changing(db, a, 'tex');
    const { id: _id, title: _title, ...rest } = a;
    // The version it changes: the files and pictures the agent leaves out stay.
    const { doc, notes } = await agentTex(db, rest, ctx.cwd, id ? readTex(pageSource(db, id)!.text) : undefined);
    // Typeset first: the agent hears of errors to fix, and the picture in the list comes from this run.
    const r = await compileTex(db, doc);
    const p = keepModel(ctx, id, 'tex', a.title, doc);
    return [
      [
        `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit the source beside its typeset pages and export it as a PDF, its .tex source or the project as a .zip.`,
        ...notes,
      ].join(' '),
      compileSummary(r),
    ].join('\n\n');
  },
};

const EXPORT_PAGE: RunTool = {
  name: 'export_page',
  description: [
    'Save a page, slide deck, document, spreadsheet or LaTeX document of the user’s Library as a file, to hand over with present_files: a page as a PDF or a Word document (docx),',
    'a deck as PowerPoint (pptx) or a PDF (a slide a page), a document as Word (docx), PDF or Markdown (md), a spreadsheet as Excel (xlsx), CSV (its first sheet) or PDF,',
    'a LaTeX document as its typeset PDF, its main source (tex) or the whole project (zip); any of them as a web page (html) that works on its own.',
    'The file goes in this session’s folder unless you give a path.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The page’s or deck’s id (get_page lists them).' },
      format: { type: 'string', enum: ['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'md', 'tex', 'zip', 'html'] },
      path: { type: 'string', description: 'Where to write it: a file name or a path, from the session’s folder or absolute.' },
    },
    required: ['id', 'format'],
  },
  async run(a, ctx) {
    const format = String(a.format) as ExportFormat;
    if (!EXPORT_TYPES[format]) throw new Error(`format is one of ${Object.keys(EXPORT_TYPES).join(', ')}.`);
    const f = await exportPage(ctx.deps.db, String(a.id ?? ''), { format });
    const dest = typeof a.path === 'string' && a.path.trim() ? fromSession(ctx.cwd, a.path.trim()) : path.join(ctx.cwd || config.defaultCwd, f.name);
    const file = fs.existsSync(dest) && fs.statSync(dest).isDirectory() ? path.join(dest, f.name) : dest;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, f.data);
    return `Wrote ${file} (${Math.max(1, Math.round(f.data.length / 1024))} KB). Hand it to the user with present_files.`;
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
  'Pages: show_html shows a page in the conversation (a report, a chart, a table, a mock-up, options to pick from). When the user wants something to keep and come back to (a tracker, a log, a calculator, a checklist, a planner), make it a page and save it with save_page rather than as an HTML file, unless they ask for a file: it goes into their Library, can go on a phone’s home screen, and keeps what it stores with hydor.storage on every device (a file’s localStorage stays in one browser). For slides or a presentation, make a deck with save_slides (they edit, present and export it to PowerPoint or PDF in the Library) rather than a .pptx file; likewise a document to read, edit or print (a letter, a report, a CV) with save_doc rather than a .docx, a spreadsheet (a budget, a tracker of numbers, a table with totals) with save_sheet rather than an .xlsx, and anything in LaTeX (a paper, a thesis, maths) with save_latex rather than a .tex file, unless they ask for a file made another way. get_page lists all of these, to change one. export_page saves one as a file to hand over (PDF, Word, PowerPoint, Excel, CSV, Markdown or LaTeX). Pages look like part of this app (its theme, light or dark as the app is) unless the user asks for another look: show_html says how.';

/** A request made from a page or deck open in Pages (`extra.page`: its id): the session is about changing it. */
function askInstructions(db: Deps['db'], v: unknown): string | null {
  const id = typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as { id?: unknown }).id ?? '') : '';
  const p = id ? pageInfo(db, id) : null;
  if (!p) return null;
  const k = kindOf(p.kind);
  const how: Record<string, string> = {
    slides: 'Read it with get_page (each slide and part has its id; slides are numbered from 1 in the order they show), change what they ask, and save it with save_slides and that id. "This slide" or "slide 3" means the one they name; "every slide" means all of them.',
    doc: 'Read it with get_page, change what they ask (a section is a heading and what follows it, up to the next heading of its level), and save the whole document with save_doc and that id.',
    sheet: 'Read it with get_page, change what they ask (cells and ranges as A1 or B2:D9, on the sheet they name), and save the whole workbook with save_sheet and that id; keep formulas as formulas.',
    tex: 'Read it with get_page (its files, and the errors of its last typesetting), change what they ask (lines are numbered from 1 in each file, as its editor shows them), and save it with save_latex and that id, sending what changes (what you leave out stays); it is typeset again, and you hear of any errors: fix them.',
  };
  return [
    `The user is asking from their ${k?.noun ?? 'page'} "${p.title}" (saved page ${p.id}), open in front of them in the Library: their messages are about changing it.`,
    k ? how[p.kind!] : 'Read it with get_page and save the whole changed page with save_page and that id. When they name a part, change that part, and the rest only as needed.',
    'What they look at updates as soon as you save; keep their own changes, and answer in a sentence or two what you changed. Do not make a new page or a file unless they ask.',
  ].join(' ');
}

/** What the agent hears once the user decided on its publish_site card. */
function outcome(r: PublishRequest, base: string): string {
  if (r.status === 'published' && r.site) {
    const how = r.site.visibility === 'public' ? 'a public link: anyone can open it' : 'a private link: only people who have it can open it';
    return `publish_site: the user published "${r.name}" at ${base}${r.site.path} (${how}). They can unpublish it in Library → Published.`;
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
  texRoutes(app, db);
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
      // The space picked, or (not asked) the session's.
      const space = spaceChoice(db, b.space, sessionSpace(db, sessionKey));
      page =
        typeof b.kind === 'string' && b.kind !== 'page'
          ? createPage(db, { title: b.title, kind: mustKindName(b.kind), model: b.model ?? mustKind(b.kind).fresh(typeof b.title === 'string' && b.title.trim() ? b.title.trim() : ''), by: 'made', sessionKey, space })
          : createPage(db, { title: b.title, html: b.html, by: item ? 'user' : 'made', sessionKey, sourceItem: item, space });
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
    const extra = p.kind ? { model: pageModel(db, p.id) } : { html: (await pageHtml(db, p.id))!.html };
    return { page: p, ...extra, versions: versionsOf(db, p.id), link: `/pg/${pageToken(db, p.id)}` };
  });
  /** A file someone opens (a Word document, a spreadsheet, a CSV): made into a page of its kind. */
  app.post('/api/pages/import', { bodyLimit: 40 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const name = typeof b.name === 'string' ? b.name.slice(0, 300) : '';
    const kind = kindForFile(name);
    if (!kind || typeof b.data !== 'string') {
      throw new HttpError(400, 'Send a file’s name and its data (base64): a .docx, .md, .txt or .html document, an .xlsx, .ods, .csv or .tsv spreadsheet, or a .tex file or a LaTeX project’s .zip.');
    }
    const k = mustKind(kind);
    let got: Awaited<ReturnType<NonNullable<typeof k.fromFile>>>;
    try {
      got = await k.fromFile!(Buffer.from(b.data, 'base64'), name);
    } catch (e) {
      throw new HttpError(422, `That file could not be read: ${(e as Error).message}`);
    }
    const page = createPage(db, {
      title: typeof b.title === 'string' && b.title.trim() ? b.title : name.replace(/\.[^.]+$/, ''),
      kind,
      model: got.model,
      by: 'made',
      sessionKey: key(b.sessionKey),
      space: spaceChoice(db, b.space, sessionSpace(db, key(b.sessionKey))),
    });
    changed(page.id);
    return { page, notes: got.notes ?? [] };
  });
  /** Renames a page ({ title }), or moves it to a space ({ space: a space's id, or null for none }). */
  app.patch('/api/pages/:id', async (req) => {
    const b = B(req);
    const id = P(req).id;
    if (b.title === undefined && b.space === undefined) throw new HttpError(400, 'Send its new title, or the project to move it to (space: an id, or null)');
    let page = mustPage(db, id);
    if (b.space !== undefined) page = setPageSpace(db, id, spaceChoice(db, b.space));
    if (b.title !== undefined) page = renamePage(db, id, b.title);
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
  app.post('/api/pages/:id/versions', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const id = P(req).id;
    const cur = mustPage(db, id);
    const base = Number(b.base);
    if (Number.isInteger(base) && base > 0 && base !== cur.version && b.force !== true) throw new HttpError(409, `Version ${cur.version} was saved after the one you changed (${base}).`);
    const page = addVersion(db, id, { title: b.title, html: b.html, model: b.model, by: 'edit' });
    noteEdit(db, [key(b.sessionKey), cur.sessionKey], id, Number.isInteger(base) && base > 0 ? base : cur.version, page.version);
    changed(id);
    return { page };
  });
  /** A version: its page as HTML (another kind's own page), or with ?model=1 another kind's model. */
  app.get('/api/pages/:id/versions/:v', async (req) => {
    const id = P(req).id;
    const src = pageSource(db, id, Number(P(req).v));
    if (!src) throw new HttpError(404, 'That version is no longer kept');
    if (src.kind !== 'page' && (req.query as { model?: string }).model === '1') return { title: src.title, version: src.version, model: mustKind(src.kind).read(src.text) };
    return pageHtml(db, id, src.version);
  });
  app.post('/api/pages/:id/versions/:v/restore', async (req) => {
    const page = restoreVersion(db, P(req).id, Number(P(req).v));
    changed(page.id);
    return { page };
  });
  /** A file of this computer in one of the editors (Files opens Word, Excel, CSV and LaTeX files so), and saved back to it. */
  app.get('/api/pages/file', async (req) => openFile(db, String((req.query as { path?: string }).path ?? '')));
  app.put('/api/pages/file', { bodyLimit: 40 * 1024 * 1024 }, async (req) => saveFile(db, B(req)));
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
  /** The page as a file: a PDF, a Word document or (a deck) a PowerPoint file, or a web page that works on its own. */
  app.get('/api/pages/:id/export', async (req, reply) => {
    const q = req.query as { format?: string; v?: string; paper?: string };
    const format = String(q.format ?? '') as ExportFormat;
    if (!EXPORT_TYPES[format]) throw new HttpError(400, `format is one of ${Object.keys(EXPORT_TYPES).join(', ')}`);
    const f = await exportPage(db, P(req).id, { format, version: q.v ? Number(q.v) : undefined, paper: q.paper === 'letter' ? 'letter' : 'a4' });
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .type(f.type)
      .send(f.data);
  });

  // ---- a deck's pictures and fonts ---------------------------------------------------------------
  /** A picture for a deck (the editor's upload, or one at an address on the web): kept, and its source. */
  app.post('/api/pages/assets', { bodyLimit: Math.ceil(MAX_ASSET * 1.4) + 4096 }, async (req) => {
    const b = B(req);
    if (typeof b.data === 'string') {
      const m = /^data:image\/[a-z0-9.+-]+;base64,([A-Za-z0-9+/=]+)$/i.exec(b.data);
      if (!m) throw new HttpError(400, 'data is a data: address of a picture');
      return { src: `naget-asset:${putAsset(db, Buffer.from(m[1], 'base64'))}` };
    }
    if (typeof b.url === 'string' && /^https?:\/\//i.test(b.url)) {
      const notes: string[] = [];
      const src = await takeIn(db, b.url, { notes });
      if (!src.startsWith('naget-asset:')) throw new HttpError(422, notes[0] ?? 'That picture could not be fetched');
      return { src };
    }
    throw new HttpError(400, 'Send data (a data: address) or url');
  });
  app.get('/api/pages/assets/:sha', async (req, reply) => {
    const a = getAsset(db, P(req).sha);
    if (!a) return reply.code(404).send({ error: 'No such picture' });
    // A picture of its own address is the same picture for ever; SVG runs nothing as a picture, and is kept from running as a page.
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox").type(a.mime).send(a.data);
  });
  /** A picture on the web, for a deck shown inside the app (whose own pages load no picture from the web). */
  app.get('/api/pages/picture', async (req, reply) => {
    const url = String((req.query as { url?: string }).url ?? '');
    if (!/^https?:\/\//i.test(url)) throw new HttpError(400, 'url is an http(s) address');
    const notes: string[] = [];
    const src = await takeIn(db, url, { notes });
    const a = src.startsWith('naget-asset:') ? getAsset(db, src.slice('naget-asset:'.length)) : null;
    if (!a) return reply.code(404).send({ error: notes[0] ?? 'Not a picture' });
    return reply.header('Cache-Control', 'private, max-age=86400').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox").type(a.mime).send(a.data);
  });
  /** Google's fonts for decks shown in the app, through this server (the app's pages load no font from elsewhere). */
  app.get('/api/pages/fonts.css', async (req, reply) => {
    const css = await fontsCss(String((req.query as { f?: string }).f ?? ''));
    return reply.header('Cache-Control', 'private, max-age=86400').type('text/css; charset=utf-8').send(css);
  });
  app.get('/api/pages/fonts/*', async (req, reply) => {
    const f = await fontFile(String((req.params as Record<string, string>)['*'] ?? ''));
    if (!f) return reply.code(404).send({ error: 'No such font' });
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').type(f.type).send(f.data);
  });

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
    return { title: p.title, html: (await pageHtml(db, p.id))!.html };
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
  tools: () => [SHOW_HTML, SAVE_PAGE, SAVE_SLIDES, SAVE_DOC, SAVE_SHEET, SAVE_LATEX, GET_PAGE, EXPORT_PAGE, PUBLISH_SITE],
  spawn: (s, d) => {
    const ask = s.extra?.page ? askInstructions(d.db, s.extra.page) : null;
    return { instructions: ask ? [INSTRUCTIONS, ask] : [INSTRUCTIONS] };
  },
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
    // Pictures no deck shows any more, once a day.
    setInterval(() => sweepAssets(d.db), 86_400_000).unref();
  },
};
