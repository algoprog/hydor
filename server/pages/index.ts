// Pages: HTML pages agents make. show_html shows one in the conversation (the page is the call's own
// input, so it lives in the agent's transcript); the user's clicks on its choices come back to the
// message box. save_page keeps one in the Pages library, with versions and storage of its own, and an
// address of its own for a phone's home screen. save_slides keeps a slide deck there (slides.ts), to edit,
// present and export; save_doc, save_sheet, save_latex and save_notebook keep documents, spreadsheets, LaTeX documents
// and Jupyter notebooks (docs.ts, sheets.ts, latex.ts, notebooks.ts; kinds.ts says what each kind does). export_page makes a file of any of them (a
// PDF, a Word document, a PowerPoint deck, an Excel file…) for the agent to hand over. publish_site asks the user to put a folder (a project's build) or a saved page at a
// link; nothing is published until they confirm on the card.
//
// While an agent writes a page, the pages showing its session watch it grow (drafts.ts); the user can
// change a page in the editor (visual or code), and the agent hears of it with their next message
// (edits.ts). Each saved page has a picture in Pages (thumbs.ts).
//
// Routes, signed in:
//   GET/POST /api/pages, GET/PATCH/DELETE /api/pages/:id, GET /api/pages/kept?key=, GET /api/pages/drafts?key=
//   POST /api/pages/folders, PATCH/DELETE /api/pages/folders/:id (the Library's folders: folders.ts),
//   POST /api/pages/import-folder (a folder of this computer brought in: import-folder.ts)
//   POST /api/pages/:id/versions, GET /api/pages/:id/versions/:v, POST …/restore, POST /api/pages/:id/copy
//   POST /api/pages/:id/storage, GET/DELETE /api/pages/:id/data, POST /api/pages/:id/link, GET /api/pages/:id/thumb
//   GET/POST /api/pages/:id/comments (comments on a page's blocks: shared/page-comments.ts)
//   POST /api/pages/file-edit, GET /api/pages/:id/export?format=, POST /api/pages/docs/print, POST /api/pages/assets, GET /api/pages/assets/:sha,
//   POST /api/pages/video-still, POST /api/pages/videos, GET /api/pages/videos/:sha
//   GET/PUT /api/pages/file (a file of the computer's in an editor: filemodel.ts)
//   GET/POST /api/pages/:id/notebook (where a notebook of the Library runs: notebooks.ts)
//   POST /api/library/uploads, PUT/DELETE /api/library/uploads/:id, POST /api/library/move (files dropped on the Library: uploads.ts)
//   GET /api/pages/picture?url=, GET /api/pages/fonts.css?f=, GET /api/pages/fonts/*
//   GET/POST /api/sites, DELETE /api/sites/:id, GET/POST /api/sites/requests/:id
// Routes whose token is the permission (no sign-in, never the app's cookies at work):
//   GET /pg/:token (the page's own address), /pg/:token/html, /pg/:token/manifest.webmanifest, POST /pg/:token/storage,
//   GET /pg/video/:sha/:sig (a deck's video, its signed address the permission)
//   GET /site/:token/* (published sites, sandboxed)
import crypto from 'node:crypto';
import fs from 'node:fs';
import { isAbsPath } from '../platform.ts';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { FastifyRequest } from 'fastify';
import type { PageInfo, PagesEvent, PublishRequest } from '../../shared/pages.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { resolvePath } from '../files.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { setCaptureDb } from '../capture/index.ts';
import { confidentialKey, confidentialRun } from '../confidential/index.ts';
import { sessionSpace, spaceChoice } from '../spaces/choice.ts';
import { allSpaces } from '../spaces/index.ts';
import { carryComments } from '../spaces/share.ts';
import { draftsOf, draftsOfPage, endDrafts, feedDraft, settleDraft, type ToolStream } from './drafts.ts';
import { agentNotebook, dropWorkFolder, SAVE_NOTEBOOK_DESCRIPTION, SAVE_NOTEBOOK_SCHEMA, workFile, writeWorkFile } from './notebooks.ts';
import { dropEdits, initEdits, noteEdit, noteFileEdit, takeEdits } from './edits.ts';
import { getAsset, MAX_ASSET, putAsset, sweepAssets, takeIn } from './assets.ts';
import { pagePictures } from './page-pictures.ts';
import { videoStillOf } from './video-still.ts';
import { getVideo, sendVideo, takeVideoPiece, videoAddressOk } from './videos.ts';
import { videoSrc } from '../../shared/slides.ts';
import { exportPage, EXPORT_TYPES, type ExportFormat } from './export.ts';
import { fontFile, fontsCss } from './fonts.ts';
import { agentDoc, docPage, readDoc, SAVE_DOC_DESCRIPTION, SAVE_DOC_SCHEMA } from './docs.ts';
import { applyDocEdits } from '../../shared/doc-edits.ts';
import { applyDeckEdits, changesSlides } from '../../shared/deck-edits.ts';
import { applyBookEdits } from '../../shared/sheet-edits.ts';
import { applyTexEdits } from '../../shared/tex-edits.ts';
import { TEX_MAIN } from '../../shared/latex.ts';
import { normalizeDoc } from '../../shared/docs.ts';
import { commentsForAgent } from '../../shared/page-comments.ts';
import { dbBlocks, dbKey, dbsForAgent, pageDatabases } from '../../shared/page-db.ts';
import { agentTex, compileSummary, compileTex, readTex, SAVE_LATEX_DESCRIPTION, SAVE_LATEX_SCHEMA, texRoutes } from './latex.ts';
import { arxivRoutes, dropPaperFolder } from './latex-arxiv.ts';
import { checkRoutes, LATEX_CHECK } from './latex-check.ts';
import { actionsLine, pageActionTool } from './actions.ts';
import { HOW_TO_MAKE, makeInstructions } from './content-types.ts';
import { agentBook, readBook, SAVE_SHEET_DESCRIPTION, SAVE_SHEET_SCHEMA } from './sheets.ts';
import { agentDeck, readDeck, SAVE_SLIDES_DESCRIPTION, SAVE_SLIDES_SCHEMA } from './slides.ts';
import { myThemeByName } from './my-themes.ts';
import { withSheetsAndLogo } from './slides-sources.ts';
import { agentFileComments, openFile, openFileComments, saveFile, texFileForAgent } from './filemodel.ts';
import { kindForFile, kindOf, mustKind, type PageKind } from './kinds.ts';
import { shellManifest, shellPage } from './shell.ts';
import { uploadRoutes } from './uploads.ts';
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
  pageComments,
  changeComments,
  storageMap,
  renamePage,
  describePage,
  resetPageLink,
  setPageSpace,
  restoreVersion,
  storageEntries,
  storageOp,
  storageText,
  versionsOf,
} from './store.ts';
import { dropThumbs, enableThumbs, refreshThumbs, thumbFile } from './thumbs.ts';
import { agentPlace, changeFolder, deleteFolder, folderPath, listFolders, makeFolder, placeFor, putInFolder } from './folders.ts';
import { importFolder } from './import-folder.ts';
import { describeLater, enableDescriptions } from './describe.ts';
import { searchLibrary } from './search.ts';
import { meaningStarting } from '../memory/embed.ts';
import { DESCRIPTION_WORDS, type LibFolder } from '../../shared/pages.ts';

export { MAX_PAGE } from './store.ts';

const tell = (d: Deps, data: PagesEvent) => d.broadcast({ t: 'feature', id: 'pages', data });

/**
 * The save tools' libraryFolder: where in the Library what they save goes (folders.ts agentPlace). Not `folder`, which
 * save_latex takes for a LaTeX project's folder of the session.
 */
const FOLDER_PROP = {
  type: 'string',
  description: 'A folder of the user’s Library to put it in: its name ("Thesis"), or a path ("Thesis/Drafts"); made when missing. Left out, something new goes at the top of the session’s project, and one you change stays where it is.',
};
const withFolder = <S extends { properties?: Record<string, unknown> }>(schema: S): S => ({ ...schema, properties: { ...schema.properties, libraryFolder: FOLDER_PROP } });

/** The save tools' description: what the Library shows of it besides its title, and what its search finds it by. */
const DESCRIPTION_PROP = {
  type: 'string',
  description: `What it is, in two or three sentences (under ${DESCRIPTION_WORDS} words): what it holds or covers and what it is for, with the names, topics and dates someone would look for it by. The Library shows it, and its search (and the user's and agents' searches) find it by it. Give it whenever you make one; on a new version, only when what it is has changed (left out, it keeps the one it has). With id and nothing else to save, it changes the description (and title) alone, as no new version.`,
};
const withDescription = <S extends { properties?: Record<string, unknown> }>(schema: S): S => ({ ...schema, properties: { ...schema.properties, description: DESCRIPTION_PROP } });

/** What a save may carry besides what it saves: with an id and nothing else, it changes these alone (describeOnly). */
const NAMING = new Set(['id', 'title', 'description', 'project', 'libraryFolder']);
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * A save of a page the agent names that gives only its title and description (and folder), and nothing to save: they
 * change, and no new version is made. The answer for the agent, or null for any other save.
 */
function describeOnly(ctx: RunCtx, a: Record<string, unknown>, kind: PageKind | 'page'): string | null {
  const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
  if (!id || !(given(a.description) || given(a.title)) || Object.entries(a).some(([k, v]) => !NAMING.has(k) && given(v))) return null;
  const db = ctx.deps.db;
  const cur = mustPage(db, id);
  if ((cur.kind ?? 'page') !== kind) return null;
  if (given(a.title)) renamePage(db, id, a.title);
  if (given(a.description)) describePage(db, id, a.description);
  moveForAgent(db, id, a.libraryFolder, ctx.key);
  tell(ctx.deps, { what: 'pages' });
  // No new version: the draft the user may have watched come in gives way to the page as it is.
  if (kind !== 'page') settleDraft(ctx.deps, ctx.key, mustKind(kind).tool, id, { failed: true });
  const p = mustPage(db, id);
  const changed = [given(a.title) && 'title', given(a.description) && 'description'].filter(Boolean).join(' and ');
  return `Changed the ${changed} of "${p.title}" (page ${p.id}); it is otherwise as it was (still version ${p.version}).${p.description ? ` Its description: ${p.description}` : ''}`;
}

/** For the agent, about a new page it saved without a description. */
const DESCRIBE_NOTE = `It had no description, so one is being written from what it holds; give description (under ${DESCRIPTION_WORDS} words: what it is and what it is for) whenever you save something new.`;

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
  'Ready-made classes, all optional: .n-options > .n-option (rows: .n-letter, h3, p), .n-grid > .n-card (an img or .n-media, then .n-body), table.n-compare (.n-yes, .n-no, .n-best; wrap wide ones in .n-scroll), .n-proscons > .n-pros + .n-cons (h4, ul), .n-btn (.n-primary), .n-field (a label around an input), .n-row, .n-tag, .n-muted. A picked choice gets .n-selected. ' +
  'Blocks as the user’s page editor writes them (Notion’s): ul.n-todo > li > input[type=checkbox] (checked when done) + span (its words); a block kept under a list’s item, where an item would be: li.n-block > the block (a p, a heading, a quote…; no marker) + the item’s own nested lists; details.n-toggle > summary + blocks; .n-callout > span.n-callout-icon (an emoji) + div.n-callout-text; .n-cols > div per column; nav.n-toc (the editor fills it with links to the headings); a database (Notion’s: a table, or a board of cards by a select column, whose rows the user adds and changes): <div class="n-db" data-db="tasks" data-title="Tasks" data-schema=\'{"cols":[{"name":"Task","kind":"text"},{"name":"Status","kind":"select","options":["To do","Doing","Done"]},{"name":"Due","kind":"date"}],"rows":[{"Task":"Book flights","Status":"To do"}],"view":"table"}\'></div> (kinds text, number, select, multi, date, check, link; "view": "board" with "group": a select column; data-schema gives its start: its rows then live in the page’s data, changed with save_page’s databases); pre.n-code[data-lang="python"] (code as plain text, coloured as it shows: data-lang is one of plain, bash, c, cpp, csharp, css, diff, go, html, java, js, json, kotlin, lua, markdown, php, python, ruby, rust, sql, swift, ts, yaml; left out, the page tells it from the code; plain <pre><code class="language-python"> is coloured too, by its class); table.n-tbl; .n-cover (a div with a gradient background-image, or an img) then .n-icon (an emoji) before the first heading; a.n-video[data-video="https://www.youtube-nocookie.com/embed/ID"] > img (a video’s still, linked to the video); a link to another of the user’s pages (get_page lists their ids): <a class="n-pagelink" href="/pages/ID" data-page="ID"><span class="n-pagelink-icon">its emoji, or nothing</span>its title</a>, which opens that page in the app; .n-math[data-tex] (KaTeX’s HTML, with <link id="n-katex"> to KaTeX’s CSS on jsDelivr); colours of words .n-tc-grey|brown|orange|yellow|green|blue|purple|pink|red, and behind them .n-hl-… (on a block or a span/mark).';

const SHOW_HTML: RunTool = {
  name: 'show_html',
  annotations: { readOnlyHint: true },
  description: [
    'Show the user an HTML page inside the conversation: a report, a dashboard, a table, a mock-up, options to pick from.',
    'Use it when a page is clearer than text, or when asked for one; a single figure, chart or diagram that belongs in your reply is lighter as a',
    '```html live or ```mermaid block inside it. The page renders in a sandboxed frame: in the conversation, beside it or',
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
    'The user can leave comments on a page’s blocks in its editor; get_page shows them, and comments answers, resolves or adds them (with id; leave html out to only answer them).',
    'A database block’s rows are the page’s own data: get_page shows them, and databases adds, changes or removes them (with id; leave html out to only change them).',
    'Pictures: name a picture file of your folder (one generate_image, make_svg or make_plot made: images/…) as an img’s src or in CSS url(): it goes inside the page (made smaller where this computer can); a page with its pictures may be up to 2 MB.',
    `Give each new page a description (under ${DESCRIPTION_WORDS} words): the Library shows it and its search finds the page by it.`,
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A saved page’s id, to save a new version of it.' },
      title: { type: 'string', description: 'The page’s name in the Library and on a home screen: "Workout log".' },
      html: { type: 'string', description: 'The whole page, <!doctype html> included. With id and comments or databases, leave it out to only answer the comments or change the rows.' },
      databases: {
        type: 'object',
        description:
          'Changes to the page’s database blocks, by their names (data-db): {"tasks": {"add": [{"Task": "Book flights", "Status": "To do"}], "update": [{"id": "r1", "Status": "Done"}], "remove": ["r2"]}}; also "rows" (all of them anew), "cols" (the columns: [{"name", "kind": text|number|select|multi|date|check|link, "options": [names]}]) and "title". Values by column name: get_page shows each database’s columns, rows and their ids.',
      },
      comments: {
        type: 'array',
        description:
          'Changes to the comments on the page’s blocks (get_page lists them with their ids): {"id": "c1", "reply": "what you did"}, adding "resolve": true once one is dealt with ("reopen": true opens it again); a comment of your own: {"text": "…", "on": "words of the block it is about"}.',
        items: { type: 'object' },
      },
      project: { type: 'string', description: 'The project (by its name) to keep it in; left out, this session’s project.' },
      libraryFolder: FOLDER_PROP,
      description: DESCRIPTION_PROP,
    },
    required: ['title'],
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
    const other = id ? kindOf(mustPage(db, id).kind) : null;
    if (other) throw new Error(`Page ${id} is a ${other.noun}: change it with ${other.tool}.`);
    const named = describeOnly(ctx, a, 'page');
    if (named) return named;
    const answering = a.comments !== undefined && a.comments !== null;
    const rows = a.databases && typeof a.databases === 'object' && !Array.isArray(a.databases) ? (a.databases as Record<string, unknown>) : null;
    if ((a.html === undefined || a.html === null || a.html === '') && !(id && (answering || rows)))
      throw new Error('html: give the whole page (only answering comments or changing a database’s rows, with id, leaves it out).');
    // Its databases' rows (the page's own data, shared/page-db.ts): changed as asked, kept as the page stores them.
    const fill = async (pid: string) => {
      if (!rows) return '';
      const html = (await pageHtml(db, pid))?.html ?? '';
      const blocks = dbBlocks(html);
      const stored = storageMap(db, pid);
      const D = pageDatabases();
      const notes: string[] = [];
      const puts: [string, string][] = [];
      for (const [name, ch] of Object.entries(rows).slice(0, 20)) {
        const b = blocks.find((x) => x.name === name);
        if (!b) {
          notes.push(`The page has no database "${name}": put <div class="n-db" data-db="${name}"></div> in its html first.`);
          continue;
        }
        let cur: unknown = b.schema;
        try {
          if (stored[dbKey(name)]) cur = JSON.parse(stored[dbKey(name)]);
        } catch {}
        const next = D.change(D.normalize(cur, b.title), ch);
        puts.push([dbKey(name), JSON.stringify(next)]);
        notes.push(`Database ${name}: ${next.rows.length} row${next.rows.length === 1 ? '' : 's'}.`);
      }
      try {
        if (puts.length) putValues(db, pid, puts);
      } catch (e) {
        return ` Its databases were left as they were: ${(e as Error).message}.`;
      }
      if (puts.length) tell(ctx.deps, { what: 'pages' });
      return notes.length ? ` ${notes.join(' ')}` : '';
    };
    // Its comments: answered, resolved or added (shared/page-comments.ts), after the new version if there is one.
    const comment = (pid: string) => {
      if (!answering) return '';
      const r = changeComments(db, pid, a.comments, 'agent');
      tell(ctx.deps, { what: 'comments', id: pid });
      const open = r.list.filter((c) => !c.resolved).length;
      return [` Its comments: ${open} open, ${r.list.length - open} resolved.`, ...r.notes].join(' ');
    };
    if (a.html === undefined || a.html === null || a.html === '') {
      if (given(a.description)) describePage(db, id!, a.description);
      const page = mustPage(db, id!);
      const done = [answering && 'answered its comments', rows && 'changed its databases', given(a.description) && 'changed its description'].filter(Boolean).join(' and ');
      return `Saved "${page.title}" (page ${page.id}): ${done}; the page itself is as it was.${await fill(page.id)}${comment(page.id)}`;
    }
    // Pictures from the session's folder (and the app's kept ones) go inside the page.
    const pictured = typeof a.html === 'string' ? pagePictures(db, a.html, ctx.cwd) : { html: a.html, notes: [] };
    const p = id
      ? addVersion(db, id, { title: a.title, html: pictured.html, by: 'agent', description: a.description })
      : createPage(db, { title: a.title, html: pictured.html, by: 'agent', description: a.description, ...placeOf(ctx, a.project, a.libraryFolder) });
    if (id) moveForAgent(db, id, a.libraryFolder, ctx.key);
    tell(ctx.deps, { what: 'pages' });
    refreshThumbs(ctx.deps, [p.id]);
    const unnamed = !p.description;
    if (unnamed) describeLater(ctx.deps, p.id);
    return `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can open it at its own address and add it to a phone’s home screen.${pictured.notes.length ? ` ${pictured.notes.join(' ')}` : ''}${unnamed && !id ? ` ${DESCRIBE_NOTE}` : ''}${await fill(p.id)}${comment(p.id)}`;
  },
};

/** What a confidential session saved stays out of reach of other sessions' agents (server/confidential). */
const outOfReach = (ctx: RunCtx, p: { sessionKey?: string }) => !!p.sessionKey && p.sessionKey !== ctx.key && confidentialKey(ctx.deps.db, p.sessionKey) && !confidentialRun(ctx);

const GET_PAGE: RunTool = {
  name: 'get_page',
  annotations: { readOnlyHint: true },
  description:
    'The user’s saved pages, slide decks, documents, spreadsheets, LaTeX documents and Jupyter notebooks (Pages). With no id: each one’s id, title, kind, project and Library folder, version and last change (and its description, when there are few). With query: the ones that fit it best, found by their titles and descriptions, by words and by meaning, each with its description: to find the one the user means among many. With an id: its description, then a page’s current HTML, the data it stores and the comments on its blocks (to change it, or answer them, with save_page), or a deck’s slides, a document, a spreadsheet, a LaTeX project or a notebook’s cells and outputs as it is kept (to change it with save_slides, save_doc, save_sheet, save_latex or save_notebook, or with page_action what its editor does in a click to the whole of it), or to answer questions about it. With path instead: a LaTeX file of this computer (as Files opens it in its editor): the comments the user wrote on the words of its project’s files, which the app keeps beside them (answer them with save_latex’s path and comments).',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A saved page’s id.' },
      query: { type: 'string', description: 'Instead of id: what to look for ("the budget for the Lisbon trip", "thesis slides"): the pages that fit it best, best first.' },
      limit: { type: 'number', description: 'With query: how many, at most (10 unless set, up to 50).' },
      path: { type: 'string', description: 'Instead of id: a .tex file of this computer, for the comments kept on its project.' },
    },
  },
  async run(a, ctx) {
    const db = ctx.deps.db;
    if (typeof a.path === 'string' && a.path.trim() && !(typeof a.id === 'string' && a.id.trim())) return texFileForAgent(db, fromSession(ctx.cwd, a.path.trim()));
    const id = typeof a.id === 'string' ? a.id.trim() : '';
    if (!id) {
      const list = listPages(db).filter((p) => !outOfReach(ctx, p));
      const names = new Map(allSpaces(db).map((x) => [x.id, x.name]));
      const folders = new Map<string, LibFolder>(listFolders(db).map((f) => [f.id, f]));
      const line = (p: PageInfo, described: boolean) =>
        `- ${p.id} · ${p.title}${p.kind ? ` · ${kindOf(p.kind)?.noun ?? p.kind}` : ''}${p.space && names.has(p.space) ? ` · in the project “${names.get(p.space)}”` : ''}${p.folder && folders.has(p.folder) ? ` · in the folder “${folderPath(db, p.folder, folders)}”` : ''} · version ${p.version} · changed ${new Date(p.updatedAt).toISOString()}${described && p.description ? `\n  ${p.description}` : ''}`;
      // Looking for one: the best by their titles and descriptions, by words and by meaning (search.ts).
      const query = typeof a.query === 'string' ? a.query.trim() : '';
      if (query) {
        const limit = Math.max(1, Math.min(50, Math.round(Number(a.limit)) || 10));
        const r = await searchLibrary(db, query, { pages: list, media: false, limit, wait: 15_000, min: 0.3 });
        if (!r.hits.length) return `Nothing in the Library fits “${query}”${r.meaning ? '' : ' by its words'}. Without query, get_page lists everything.`;
        return [`The ${r.hits.length === 1 ? 'one' : `${r.hits.length}`} that fit “${query}” best${r.meaning ? ' (by words and by meaning)' : ' (by words: search by meaning is not running)'}, best first:`, ...r.hits.map((h) => line(h.page!, true))].join('\n');
      }
      // Few: each with its description too; many: their titles, and query finds one by what it is.
      const few = list.length <= 30;
      return list.length
        ? [...list.map((p) => line(p, few)), ...(few ? [] : [`(${list.length} in all: get_page with query finds the ones that fit what you look for, with their descriptions.)`])].join('\n')
        : 'No saved pages yet.';
    }
    const p = mustPage(db, id);
    if (outOfReach(ctx, p)) throw new HttpError(404, 'No saved page with that id');
    const k = kindOf(p.kind);
    const about = p.description ? ` Its description: ${p.description}` : ' It has no description yet.';
    if (k) {
      const by = p.who ? ` It was last changed by ${p.who}, someone the user shared the project with: keep their changes.` : p.by === 'edit' || p.by === 'made' ? ` It was last changed by the user in its editor: keep their changes.` : '';
      return `${p.title} (page ${p.id}, version ${p.version} of ${p.versions} kept).${about}${by} ${k.forAgent(pageSource(db, id)!.text)}`;
    }
    const html = (await pageHtml(db, id))!.html;
    const data = storageText(db, id);
    const by = p.who ? ` It was last changed by ${p.who}, someone the user shared the project with: keep their changes.` : p.by === 'edit' || p.by === 'made' ? ' It was last changed by the user in the page editor: keep their changes.' : '';
    // Agents' tool output is cut further on anyway: say so here rather than lose the end unnoticed.
    const cut = html.length > 100_000 ? `${html.slice(0, 100_000)}\n… (cut: the page is ${Math.round(html.length / 1024)} KB; write the whole page anew to change it)` : html;
    const notes = commentsForAgent(pageComments(db, id));
    const dbs = dbsForAgent(html, storageMap(db, id));
    return `${p.title} (page ${p.id}, version ${p.version} of ${p.versions} kept).${about}${by}\n\n${data ? `Stored data:\n${data}\n\n` : 'It stores no data yet.\n\n'}${dbs ? `${dbs}\n\n` : ''}${notes ? `${notes}\n\n` : ''}HTML:\n${cut}`;
  },
};

const isObjIn = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The page an agent's save_slides, save_doc… names to change (it must be of that kind), or null to make a new one. */
function changing(db: Deps['db'], a: Record<string, unknown>, kind: PageKind): string | null {
  const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
  if (id && mustPage(db, id).kind !== kind) {
    throw new Error(`Page ${id} is not a ${mustKind(kind).noun}: change it with ${kindOf(mustPage(db, id).kind)?.tool ?? 'save_page'}, or leave out id to make a new one.`);
  }
  return id;
}

/**
 * Whose a new page is, and which project it goes in: the project named (by its name or id) when there is one; else an
 * agent's goes in its session's project, and an app's step (which has no session) in none.
 */
function madeBy(ctx: RunCtx, project: unknown): { sessionKey?: string; space: string | null } {
  const s = typeof project === 'string' ? project.trim().toLowerCase() : '';
  const all = s ? allSpaces(ctx.deps.db) : [];
  const named = (all.find((x) => x.id.toLowerCase() === s) ?? all.find((x) => x.name.trim().toLowerCase() === s))?.id ?? null;
  if (!ctx.step) return { sessionKey: ctx.key, space: named ?? sessionSpace(ctx.deps.db, ctx.key) };
  return { space: named };
}

/** Where a new page goes: madeBy's place (the project named, else the session's), then a Library folder in it when one is named. */
function placeOf(ctx: RunCtx, project: unknown, folder: unknown): { sessionKey?: string; space: string | null; folder?: string | null } {
  const m = madeBy(ctx, project);
  return { ...(m.sessionKey ? { sessionKey: m.sessionKey } : {}), ...agentPlace(ctx.deps.db, folder, m.space) };
}

/** A save's input with the project to keep it in, by its name. */
const withProject = (schema: { properties: Record<string, unknown> } & Record<string, unknown>) => ({
  ...schema,
  properties: { ...schema.properties, project: { type: 'string', description: 'The project (by its name) to keep it in; left out, this session’s project.' } },
});

/**
 * Each session's turn now: made anew with each message of its user, or with the first save of a turn that began
 * without one (a command, or one its agent began itself), and forgotten when the turn ends. Its agent's saves of a page
 * in one turn are kept as one version (store.ts addVersion).
 */
const turns = new Map<string, string>();
const newTurn = (key: string) => {
  const t = `${key}#${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
  turns.set(key, t);
  return t;
};

/**
 * Keeps what an agent (or an app's step) made: a new version of the page it named, or a new page of its own (in the
 * project it names, else its session's). Its saves of a page in a row, in one turn, are kept as one version (store.ts
 * addVersion), so working in steps does not fill the Versions list.
 */
function keepModel(ctx: RunCtx, id: string | null, kind: PageKind, title: unknown, model: unknown, o: { project?: unknown; folder?: unknown; description?: unknown } = {}) {
  const db = ctx.deps.db;
  const turn = turns.get(ctx.key) ?? newTurn(ctx.key);
  let folded: number | undefined;
  const p = id
    ? addVersion(db, id, { title, model, by: 'agent', turn, description: o.description, onFold: (v) => (folded = v) })
    : createPage(db, { title, kind, model, by: 'agent', turn, description: o.description, ...placeOf(ctx, o.project, o.folder) });
  if (id) moveForAgent(db, id, o.folder, ctx.key);
  tell(ctx.deps, { what: 'pages' });
  refreshThumbs(ctx.deps, [p.id]);
  // The draft the user watched while the call came in gives way to this version.
  settleDraft(ctx.deps, ctx.key, mustKind(kind).tool, id, { saved: { pageId: p.id, version: p.version } });
  // Without a description (an agent's that left it out, or one kept from before descriptions): the helper writes one.
  if (!p.description) describeLater(ctx.deps, p.id);
  return { ...p, folded, describeNote: !id && !p.description ? [DESCRIBE_NOTE] : [] };
}

/** A saved page an agent changed, put in the folder it names (made when missing), when it names one. */
function moveForAgent(db: Deps['db'], id: string, folder: unknown, key: string) {
  if (typeof folder !== 'string' || !folder.trim()) return;
  const place = agentPlace(db, folder, mustPage(db, id).space ?? sessionSpace(db, key));
  putInFolder(db, 'pages', id, place.folder);
}

/** For the agent, when its save took the place of its own save before it (keepModel). */
const foldNote = (p: { folded?: number }) => (p.folded ? [`It took the place of version ${p.folded}, your save of it a moment ago: saves in a row are kept as one version.`] : []);

/** A save whose call the user watched come in (drafts.ts): when it fails, its draft goes and the page shows as it was. */
const watched = (tool: RunTool): RunTool => ({
  ...tool,
  async run(a, ctx) {
    try {
      return await tool.run(a, ctx);
    } catch (e) {
      const id = typeof a.id === 'string' && a.id.trim() ? a.id.trim() : null;
      settleDraft(ctx.deps, ctx.key, tool.name, id, { failed: true });
      throw e;
    }
  },
});

const SAVE_SLIDES: RunTool = {
  name: 'save_slides',
  description: SAVE_SLIDES_DESCRIPTION,
  inputSchema: withDescription(withProject(withFolder(SAVE_SLIDES_SCHEMA))),
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'slides');
    const named = describeOnly(ctx, a, 'slides');
    if (named) return named;
    const prev = id ? pageSource(ctx.deps.db, id)?.text : undefined;
    // Its format and progress bar stay as they were unless the call says (a PowerPoint compatible deck stays one).
    let kept: ReturnType<typeof readDeck> | null = null;
    try {
      kept = prev ? readDeck(prev) : null;
    } catch {}
    // One of the user's own themes by its name brings its colours, fonts and logo; the logo stays as it was unless said.
    const mine = myThemeByName(ctx.deps.db, a.theme);
    const logo = a.logo !== undefined ? a.logo : (mine?.logo ?? kept?.logo);
    let input: Record<string, unknown> = { ratio: a.ratio, theme: mine?.theme ?? a.theme, logo, slides: a.slides, footer: a.footer, guides: a.guides, comments: a.comments, format: a.format ?? kept?.format, progress: a.progress ?? kept?.progress };
    // Some slides changed, added or taken out: the deck they make, its look as it was unless said.
    if (changesSlides(a)) {
      if (!id || !prev) throw new Error('change, add and remove change a saved deck: give its id (get_page lists them), or send the whole deck as slides.');
      if (a.slides !== undefined) throw new Error('Give slides (the whole deck) or change, add and remove (some of its slides), not both.');
      const was = readDeck(prev);
      input = { ratio: a.ratio ?? was.ratio, theme: mine?.theme ?? a.theme ?? was.theme, logo: a.logo !== undefined ? a.logo : (mine?.logo ?? was.logo), footer: a.footer ?? was.footer, guides: a.guides ?? was.guides, comments: a.comments, format: a.format ?? was.format, progress: a.progress ?? was.progress, slides: applyDeckEdits(was, a).slides };
    }
    // The version it changes: the parts it sends back as they were keep their look; its logo takes its picture's shape, and
    // its charts from spreadsheets their numbers.
    const made = await agentDeck(ctx.deps.db, input, ctx.cwd, prev);
    const notes = made.notes;
    const deck = withSheetsAndLogo(ctx.deps.db, made.deck, { logo: a.logo }, notes);
    const p = keepModel(ctx, id, 'slides', a.title, deck, { project: a.project, folder: a.libraryFolder, description: a.description });
    const n = deck.slides.length;
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}), ${n} slide${n === 1 ? '' : 's'}. It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit it, present it and export it to PowerPoint or PDF.`,
      ...foldNote(p),
      ...p.describeNote,
      ...notes,
    ].join(' ');
  },
};

const SAVE_DOC: RunTool = {
  name: 'save_doc',
  description: SAVE_DOC_DESCRIPTION,
  inputSchema: withDescription(withProject(withFolder(SAVE_DOC_SCHEMA))),
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'doc');
    const named = describeOnly(ctx, a, 'doc');
    if (named) return named;
    const { id: _id, title: _title, project: _project, edits, libraryFolder: _into, description: _description, ...rest } = a;
    const prev = id ? pageSource(ctx.deps.db, id)?.text : undefined;
    // Small changes: made on its Markdown as get_page gives it, then saved as the whole document sent back would be.
    if (edits !== undefined && edits !== null) {
      if (!id || !prev) throw new Error('edits change a saved document: give its id (get_page lists them), or send the whole document as markdown.');
      if (typeof rest.markdown === 'string' || Array.isArray(rest.blocks)) throw new Error('Give edits (small changes) or the whole document (markdown or blocks), not both.');
      if (!Array.isArray(edits) || !edits.length) throw new Error('edits is a list of changes, such as [{"find": "…", "replace": "…"}]: see save_doc’s description.');
      rest.markdown = applyDocEdits(readDoc(prev), edits)!.markdown;
    }
    // The version it changes: what the agent leaves out (paper, font) stays, and unchanged blocks keep their ids.
    const { doc, notes } = await agentDoc(ctx.deps.db, rest, ctx.cwd, prev);
    const p = keepModel(ctx, id, 'doc', a.title, doc, { project: a.project, folder: a.libraryFolder, description: a.description });
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit it as in Word or Google Docs and export it as a Word document, a PDF or Markdown.`,
      ...foldNote(p),
      ...p.describeNote,
      ...notes,
    ].join(' ');
  },
};

const SAVE_SHEET: RunTool = {
  name: 'save_sheet',
  description: SAVE_SHEET_DESCRIPTION,
  inputSchema: withDescription(withProject(withFolder(SAVE_SHEET_SCHEMA))),
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'sheet');
    const named = describeOnly(ctx, a, 'sheet');
    if (named) return named;
    const { id: _id, title: _title, project: _project, update, libraryFolder: _into, description: _description, ...rest } = a;
    const prev = id ? readBook(pageSource(ctx.deps.db, id)!.text) : undefined;
    // Some cells changed: on top of the sheets they name, the others as they are.
    if (update !== undefined && update !== null) {
      if (!prev) throw new Error('update changes a saved spreadsheet: give its id (get_page lists them), or send the whole workbook as sheets.');
      if (rest.sheets !== undefined || rest.file !== undefined) throw new Error('Give update (some cells) or sheets (the whole workbook), not both.');
      if (!Array.isArray(update) || !update.length) throw new Error('update is a list of changes, such as [{"sheet": "Budget", "cells": {"B7": 1250}}]: see save_sheet’s description.');
      rest.sheets = applyBookEdits(prev, update).sheets;
    }
    // The version it changes: its comments' threads stay as they are, changed only by the comments asked for.
    const { book, notes } = await agentBook(rest, ctx.cwd, prev);
    const p = keepModel(ctx, id, 'sheet', a.title, book, { project: a.project, folder: a.libraryFolder, description: a.description });
    const n = book.sheets.length;
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}), ${n} sheet${n === 1 ? '' : 's'}. It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit it as in Excel or Google Sheets and export it as an Excel file, a CSV or a PDF.`,
      ...foldNote(p),
      ...p.describeNote,
      ...notes,
    ].join(' ');
  },
};

const SAVE_LATEX: RunTool = {
  name: 'save_latex',
  description: SAVE_LATEX_DESCRIPTION,
  inputSchema: withDescription(withProject(withFolder(SAVE_LATEX_SCHEMA))),
  async run(a, ctx) {
    const db = ctx.deps.db;
    // A file of this computer's: its comments only (the app keeps them); the file the agent changes itself.
    if (typeof a.path === 'string' && a.path.trim() && !(typeof a.id === 'string' && a.id.trim())) {
      const r = await agentFileComments(db, fromSession(ctx.cwd, a.path.trim()), a.comments);
      tell(ctx.deps, { what: 'file-comments', paths: r.paths });
      // No page is saved: nothing to watch come in.
      settleDraft(ctx.deps, ctx.key, 'save_latex', null, { failed: true });
      return r.text;
    }
    const id = changing(db, a, 'tex');
    const named = describeOnly(ctx, a, 'tex');
    if (named) return named;
    const { id: _id, project: _project, edits, libraryFolder: _into, description: _description, ...rest } = a;
    const prev = id ? readTex(pageSource(db, id)!.text) : undefined;
    // Small changes in its files: made on them as get_page gives them, the files they change then sent as written.
    if (edits !== undefined && edits !== null) {
      if (!prev) throw new Error('edits change a saved LaTeX document: give its id (get_page lists them), or send its files with source and files.');
      if (typeof rest.source === 'string' || typeof rest.main === 'string' || typeof rest.tex === 'string') throw new Error('Give edits (small changes) or source (the whole of main.tex), not both.');
      if (!Array.isArray(edits) || !edits.length) throw new Error('edits is a list of changes, such as [{"find": "…", "replace": "…"}]: see save_latex’s description.');
      const files = new Map<string, string>([[TEX_MAIN, prev.main], ...prev.files.map((f) => [f.name, f.text] as [string, string])]);
      const out = applyTexEdits(files, edits).files;
      rest.source = out.get(TEX_MAIN);
      const changed = Object.fromEntries([...out].filter(([n, t]) => n !== TEX_MAIN && files.get(n) !== t));
      // Beside the files it sends itself, in either form (by name, or a list).
      if (Object.keys(changed).length)
        rest.files = Array.isArray(rest.files) ? [...rest.files, ...Object.entries(changed).map(([name, text]) => ({ name, text }))] : { ...(isObjIn(rest.files) ? rest.files : {}), ...changed };
    }
    // The version it changes: the files and pictures the agent leaves out stay. (The title goes in a template's text.)
    const { doc, notes } = await agentTex(db, rest, ctx.cwd, prev);
    // Typeset first: the agent hears of errors to fix, and the picture in the list comes from this run.
    const r = await compileTex(db, doc);
    const p = keepModel(ctx, id, 'tex', a.title, doc, { project: a.project, folder: a.libraryFolder, description: a.description });
    return [
      [
        `Saved "${p.title}" (page ${p.id}, version ${p.version}). It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can edit the source beside its typeset pages and export it as a PDF, its .tex source or the project as a .zip.`,
        ...foldNote(p),
        ...p.describeNote,
        ...notes,
      ].join(' '),
      compileSummary(r),
    ].join('\n\n');
  },
};

const SAVE_NOTEBOOK: RunTool = {
  name: 'save_notebook',
  description: SAVE_NOTEBOOK_DESCRIPTION,
  inputSchema: withDescription(withFolder(SAVE_NOTEBOOK_SCHEMA)),
  async run(a, ctx) {
    const id = changing(ctx.deps.db, a, 'notebook');
    const named = describeOnly(ctx, a, 'notebook');
    if (named) return named;
    const nb = agentNotebook(a, (p) => fromSession(ctx.cwd, p));
    const p = keepModel(ctx, id, 'notebook', a.title, nb, { folder: a.libraryFolder, description: a.description });
    const cells = Array.isArray(nb.cells) ? nb.cells : [];
    const outs = cells.filter((c: { outputs?: unknown[] }) => c.outputs?.length).length;
    return [
      `Saved "${p.title}" (page ${p.id}, version ${p.version}), ${cells.length} cell${cells.length === 1 ? '' : 's'}, ${outs ? `${outs} with outputs` : 'no outputs yet'}. It shows in the conversation and in the Library (${ctx.deps.publicBase()}/pages/${p.id}), where the user can read it, edit and run its cells, ask an agent about it, and export it as an .ipynb file, a Python script, a PDF or a web page.`,
      ...p.describeNote,
    ].join(' ');
  },
};

const EXPORT_PAGE: RunTool = {
  name: 'export_page',
  description: [
    'Save a page, slide deck, document, spreadsheet, LaTeX document or notebook of the user’s Library as a file, to hand over with present_files: a page as a PDF or a Word document (docx),',
    'a deck as PowerPoint (pptx), a PDF (a slide a page) or its slides as pictures (png: a zip of them, or one slide with slide), a document as Word (docx), PDF or Markdown (md), a spreadsheet as Excel (xlsx), CSV (its first sheet) or PDF,',
    'a LaTeX document as its typeset PDF, its main source (tex) or the whole project (zip), a notebook as its .ipynb file (ipynb), a Python script of its cells (py) or a PDF; any of them as a web page (html) that works on its own.',
    'A deck’s web page (html) is one small file that opens in any browser and works offline (its pictures, videos and fonts inside it), but for its 3D parts, embedded web pages and the libraries its custom code loads; its PowerPoint file (pptx) turns what PowerPoint lacks into pictures or PowerPoint’s nearest effects, and says what changed.',
    'The file goes in this session’s folder unless you give a path.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'The page’s or deck’s id (get_page lists them).' },
      format: { type: 'string', enum: ['pdf', 'docx', 'pptx', 'xlsx', 'csv', 'md', 'tex', 'zip', 'html', 'ipynb', 'py', 'png'] },
      slide: { type: 'number', description: 'With png: that slide alone (from 1), as a picture.' },
      path: { type: 'string', description: 'Where to write it: a file name or a path, from the session’s folder or absolute.' },
    },
    required: ['id', 'format'],
  },
  async run(a, ctx) {
    const format = String(a.format) as ExportFormat;
    if (!EXPORT_TYPES[format]) throw new Error(`format is one of ${Object.keys(EXPORT_TYPES).join(', ')}.`);
    const f = await exportPage(ctx.deps.db, String(a.id ?? ''), { format, slide: Number(a.slide) || undefined });
    const dest = typeof a.path === 'string' && a.path.trim() ? fromSession(ctx.cwd, a.path.trim()) : path.join(ctx.cwd || config.defaultCwd, f.name);
    const file = fs.existsSync(dest) && fs.statSync(dest).isDirectory() ? path.join(dest, f.name) : dest;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, f.data);
    return `Wrote ${file} (${Math.max(1, Math.round(f.data.length / 1024))} KB).${f.note ? ` ${f.note}` : ''} Hand it to the user with present_files.`;
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
  `Pages: show_html shows a page in the conversation (a report, a dashboard, a table, a mock-up, options to pick from). When the user wants something to keep and come back to (a tracker, a log, a calculator, a checklist, a planner), make it a page and save it with save_page rather than as an HTML file, unless they ask for a file: it goes into their Library, can go on a phone’s home screen, and keeps what it stores with hydor.storage on every device (a file’s localStorage stays in one browser). For slides or a presentation, make a deck with save_slides (they edit, present and export it to PowerPoint or PDF in the Library) rather than a .pptx file; likewise a document to read, edit or print (a letter, a report, a CV) with save_doc rather than a .docx, a spreadsheet (a budget, a tracker of numbers, a table with totals) with save_sheet rather than an .xlsx, anything in LaTeX (a paper, a thesis, maths) with save_latex rather than a .tex file, and a Jupyter notebook to read, run and come back to (a lesson, an analysis to show) with save_notebook, unless they ask for a file made another way or it belongs with a project’s code and data in a folder. get_page lists all of these, to change one, with the Library folder each is in, and its query finds the ones that fit what you look for; the save tools’ libraryFolder puts one in a folder of the Library (by its name or a path, made when missing), and their description says what it is (under ${DESCRIPTION_WORDS} words, given with each new one): the Library shows it, and its search finds things by it. page_action does to a saved one what its editor does in a click to the whole of it (every slide animated, the accessibility check’s fixes, PowerPoint compatible, a theme; suggested changes accepted; a table sorted, duplicates removed, rows and columns put in or taken out with formulas following; a LaTeX project’s files renamed; a notebook’s outputs cleared; a copy), rather than writing it all out with the save tool. export_page saves one as a file to hand over (PDF, Word, PowerPoint, Excel, CSV, Markdown, LaTeX, a notebook or a Python script). Pages look like part of this app (its theme, light or dark as the app is) unless the user asks for another look: show_html says how. When the user asks for a known kind of slide, deck, document, section, page part, page or spreadsheet by name (a SWOT slide, a pitch deck, a cover letter, an executive summary, a habit tracker, a pricing table, a budget), read how to make it well with how_to_make before you make it.`;

/** The tools that make and change pictures and videos, for the agent beside a deck, a document or a page. */
const PICTURES =
  'Pictures: generate_image makes one, or changes one it already shows (give its naget-asset: source); make_svg draws one, make_plot draws a chart from data; remove_background and erase_from_image take things out of one; edit_image crops, turns, adjusts or marks one up; generate_video and edit_video make and edit videos (one it shows by its naget-video: source). They save into your folder: put what they make in its place with the save tool.';

/** A request made from a page or deck open in Pages (`extra.page`: its id): the session is about changing it. */
function askInstructions(db: Deps['db'], v: unknown): string | null {
  const id = typeof v === 'string' ? v : v && typeof v === 'object' ? String((v as { id?: unknown }).id ?? '') : '';
  const p = id ? pageInfo(db, id) : null;
  if (!p) return null;
  const k = kindOf(p.kind);
  const how: Record<string, string> = {
    slides:
      'Read it with get_page (each slide and part has its id; slides are numbered from 1 in the order they show), change what they ask, and save it with save_slides and that id: only the slides that change (change, add, remove) when the rest stays as it is. "This slide" or "slide 3" means the one they name; "every slide" means all of them; a message that starts with a slide or a part and its id is about exactly that one. For the whole deck at once (animating every slide, putting right what the accessibility check finds, describing its pictures, PowerPoint compatible, a ready-made theme, the slides’ shape) use page_action. Free through app_api: POST /api/write/design-ideas {deck: its id, slide: its place from 0} gives three layouts of a slide’s own words to choose from, and POST /api/write/rewrite {text, how} rewrites words.',
    doc: 'Read it with get_page, change what they ask (a section is a heading and what follows it, up to the next heading of its level), and save it with save_doc and that id: edits for a few changes (a section, words found and replaced), else the whole document. A message that starts with the words or the picture they picked (by its source) is about exactly those. page_action accepts or rejects the suggested changes (all, or by id), sets the page up (paper, margins, font) and the header and footer, without sending the document back. Free through app_api: POST /api/write/rewrite {text, how} rewrites words.',
    sheet:
      'Read it with get_page, change what they ask (cells and ranges as A1 or B2:D9, on the sheet they name; a message that starts with the cells they picked is about those), and save it with save_sheet and that id: update for the cells that change, else the whole workbook; keep formulas as formulas. page_action does what the Data, Edit and sheet tabs’ menus do in one call: sort, take out duplicate rows, fill down, clear, trim spaces, split text into columns, summarize a table, put in or take out rows and columns (formulas following), and rename, copy, delete or move sheets, and ask the helper model for the AI cells (=AI(…)) that wait (ask_ai).',
    tex: 'Read it with get_page (its files, and the errors of its last typesetting), change what they ask (lines are numbered from 1 in each file, as its editor shows them), and save it with save_latex and that id, sending what changes (edits for small changes in a file; what you leave out stays); it is typeset again, and you hear of any errors: fix them. page_action move_files renames or moves files, pictures and folders, every reference to them following.',
    notebook:
      'Read it with get_page (its cells in order, numbered from 1, each with its id and what its last run showed), change what they ask ("cell 3" is the third, as the notebook shows them; a message that starts with a cell and its id is about that one), and save the whole notebook with save_notebook and that id, keeping the cells, ids and outputs you do not change. To run code and keep real outputs, export it (export_page, ipynb) into your folder, run it there, and save it back with save_notebook and path. page_action clear_outputs clears outputs. To answer a question about it, read it and answer.',
  };
  return [
    `The user is asking from their ${k?.noun ?? 'page'} "${p.title}" (saved page ${p.id}), open in front of them in the Library: their messages are about changing it.`,
    k ? how[p.kind!] : 'Read it with get_page and save the whole changed page with save_page and that id. When they name a part (its words, or its CSS selector), change that part, and the rest only as needed.',
    actionsLine(k ? p.kind! : 'page'),
    p.kind === 'sheet' || p.kind === 'tex' || p.kind === 'notebook' ? '' : PICTURES,
    'When they ask, export_page gives its files (PowerPoint, Word, Excel, PDF, a web page…) and publish_site puts it at a link, once they confirm.',
    'What they look at shows your changes as you write them, and updates as soon as you save; keep their own changes, and answer in a sentence or two what you changed. Do not make a new page or a file unless they ask.',
  ]
    .filter(Boolean)
    .join(' ');
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
  checkRoutes(app, db);
  arxivRoutes(app, db);
  // Files dropped on the Library or picked with Upload files, and files the desktop app moves in by their path.
  uploadRoutes(d);
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
    return { pages: listPages(db).map((p) => (published.has(p.id) ? { ...p, published: true } : p)), folders: listFolders(db) };
  });
  // ---- the Library's folders ------------------------------------------------------------------------
  /** A new folder: in a folder (parent), or at the top of a project (space) or of none. */
  app.post('/api/pages/folders', async (req) => {
    const b = B(req);
    const folder = makeFolder(db, { name: b.name, parent: typeof b.parent === 'string' && b.parent ? b.parent : null, space: spaceChoice(db, b.space) });
    tell(d, { what: 'pages' });
    return { folder };
  });
  /** A folder renamed ({ name }), moved into another (parent), to the top (parent: null), or to another project (space): what is in it goes along. */
  app.patch('/api/pages/folders/:id', async (req) => {
    const b = B(req);
    if (b.name === undefined && b.parent === undefined && b.space === undefined) throw new HttpError(400, 'Send its new name, the folder to move it into (parent: an id, or null for the top), or the project to move it to (space)');
    const r = changeFolder(db, P(req).id, {
      name: b.name,
      parent: b.parent === undefined ? undefined : typeof b.parent === 'string' && b.parent ? b.parent : null,
      space: b.space === undefined ? undefined : spaceChoice(db, b.space),
    });
    tell(d, { what: 'pages' });
    if (r.media) d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', reload: true } });
    return { folder: r.folder };
  });
  /** A folder deleted: what is in it goes up a level; nothing is deleted with it. */
  app.delete('/api/pages/folders/:id', async (req) => {
    const r = deleteFolder(db, P(req).id);
    tell(d, { what: 'pages' });
    if (r.media) d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', reload: true } });
    return { ok: true, moved: r.moved };
  });
  /** A folder of this computer brought in: a LaTeX project as one document, any other as a folder of the Library with its documents. */
  app.post('/api/pages/import-folder', async (req) => {
    const b = B(req);
    if (typeof b.path !== 'string' || !b.path.trim()) throw new HttpError(400, 'Send the folder’s path (absolute, or from ~)');
    const space = spaceChoice(db, b.space, sessionSpace(db, key(b.sessionKey)));
    const r = await importFolder(db, b.path, { space, folder: typeof b.folder === 'string' && b.folder ? b.folder : null, sessionKey: key(b.sessionKey) });
    if (r.pages.length || r.folders) tell(d, { what: 'pages' });
    if (r.pages.length) refreshThumbs(d, r.pages.map((p) => p.id));
    // Each gets a description, from what it holds.
    for (const p of r.pages) describeLater(d, p.id);
    return r;
  });
  app.get('/api/pages/kept', async (req) => ({ items: keptIn(db, String((req.query as { key?: string }).key ?? '')) }));
  /** The pages an agent of this session is writing now, whole so far. */
  app.get('/api/pages/drafts', async (req) => {
    const q = req.query as { key?: string; page?: string };
    // A page's: the saves of it being written now, from any session (its editor, opened mid-way).
    return { drafts: q.page ? draftsOfPage(String(q.page)) : draftsOf(String(q.key ?? '')) };
  });
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
      // The space picked, or (not asked) the session's; in a folder of it, when one is asked for.
      const place = placeFor(db, b.folder, spaceChoice(db, b.space, sessionSpace(db, sessionKey)));
      page =
        typeof b.kind === 'string' && b.kind !== 'page'
          ? createPage(db, { title: b.title, kind: mustKindName(b.kind), model: b.model ?? mustKind(b.kind).fresh(typeof b.title === 'string' && b.title.trim() ? b.title.trim() : ''), by: 'made', sessionKey, description: b.description, ...place })
          : createPage(db, { title: b.title, html: b.html, by: item ? 'user' : 'made', sessionKey, sourceItem: item, description: b.description, ...place });
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
    // A page kept from a conversation says what it is (one made empty, to fill in, waits for its maker).
    if (item && !page.description) describeLater(d, page.id);
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
    // A file of this computer's by its path (Save to Library on a file an agent handed over, or in Files), or a file's
    // name and bytes as the browser sends them (a file someone opens in New page).
    const from = typeof b.path === 'string' && b.path.trim() ? resolvePath(b.path) : null;
    const name = from ? path.basename(from) : typeof b.name === 'string' ? b.name.slice(0, 300) : '';
    const kind = kindForFile(name);
    // PowerPoint's old binary files are another format altogether.
    if (/\.(ppt|pps|pot)$/i.test(name)) throw new HttpError(415, 'PowerPoint 97–2003 files (.ppt) cannot be opened here: save it as a .pptx in PowerPoint (or LibreOffice) and open that.');
    if (!kind || (!from && typeof b.data !== 'string')) {
      throw new HttpError(400, 'Send a file’s path, or its name and its data (base64): a .docx, .md, .txt or .html document, an .xlsx, .ods, .csv or .tsv spreadsheet, a PowerPoint deck (.pptx), a .tex file or a LaTeX project’s .zip, or a Jupyter notebook (.ipynb).');
    }
    let data: Buffer;
    if (from) {
      const st = await fs.promises.stat(from).catch(() => null);
      if (!st?.isFile()) throw new HttpError(404, `Not found: ${from}`);
      // A PowerPoint file may be larger than other files: its videos come along (as large as the slides editor takes).
      const max = kind === 'slides' ? 200 : 30;
      if (st.size > max * 1024 * 1024) throw new HttpError(413, `It is over ${max} MB, too large to keep in the Library`);
      data = await fs.promises.readFile(from);
    } else data = Buffer.from(String(b.data), 'base64');
    const k = mustKind(kind);
    let got: Awaited<ReturnType<NonNullable<typeof k.fromFile>>>;
    try {
      got = await k.fromFile!(data, name, db);
    } catch (e) {
      throw new HttpError(422, `That file could not be read: ${(e as Error).message}`);
    }
    const page = createPage(db, {
      title: typeof b.title === 'string' && b.title.trim() ? b.title : name.replace(/\.[^.]+$/, ''),
      kind,
      model: got.model,
      by: 'made',
      sessionKey: key(b.sessionKey),
      description: b.description,
      ...placeFor(db, b.folder, spaceChoice(db, b.space, sessionSpace(db, key(b.sessionKey)))),
    });
    changed(page.id);
    // A file brought in says what it is: the helper reads it.
    if (!page.description) describeLater(d, page.id);
    return { page, notes: got.notes ?? [] };
  });
  /**
   * Renames a page ({ title }), gives it a description ({ description }: '' takes it away), moves it to a space ({ space: a
   * space's id, or null for none }), or into a Library folder ({ folder: an id, or null for none }).
   */
  app.patch('/api/pages/:id', async (req) => {
    const b = B(req);
    const id = P(req).id;
    if (b.title === undefined && b.description === undefined && b.space === undefined && b.folder === undefined)
      throw new HttpError(400, 'Send its new title, its description, the project to move it to (space: an id, or null), or the folder to put it in (folder: an id, or null)');
    let page = mustPage(db, id);
    if (b.space !== undefined) page = setPageSpace(db, id, spaceChoice(db, b.space));
    if (b.folder !== undefined) {
      putInFolder(db, 'pages', id, typeof b.folder === 'string' && b.folder ? b.folder : null);
      page = mustPage(db, id);
    }
    if (b.title !== undefined) page = renamePage(db, id, b.title);
    if (b.description !== undefined) page = describePage(db, id, b.description);
    tell(d, { what: 'pages' });
    return { page };
  });
  /**
   * What the Library holds that fits the words, best first (search.ts): pages of every kind and the pictures, videos and
   * sounds kept, by their titles and descriptions, by words and (search by meaning on) by meaning. `starting`: meaning's
   * model is starting, so the same search in a few seconds finds by meaning too.
   */
  app.get('/api/library/search', async (req) => {
    const q = req.query as { q?: string; limit?: string };
    const r = await searchLibrary(db, String(q.q ?? ''), { limit: Number(q.limit) || 50 });
    return {
      hits: r.hits.map((h) => ({ id: h.id, score: h.score, by: h.by, ...(h.meaning !== undefined ? { meaning: h.meaning } : {}) })),
      meaning: r.meaning,
      ...(!r.meaning && meaningStarting(db) ? { starting: true } : {}),
    };
  });
  app.delete('/api/pages/:id', async (req) => {
    const id = P(req).id;
    if (unpublishPage(db, id)) tell(d, { what: 'sites' });
    deletePage(db, id);
    dropEdits(db, id);
    dropThumbs(id);
    dropWorkFolder(id);
    dropPaperFolder(id);
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
    let model = b.model;
    if (Number.isInteger(base) && base > 0 && base !== cur.version) {
      // Comments people wrote meanwhile through a shared project's links join this save (server/spaces/share.ts); only
      // when something else changed is it refused, unless `force`.
      const carried = model !== undefined ? carryComments(db, id, base, model) : { model, onlyComments: false };
      model = carried.model;
      if (!carried.onlyComments && b.force !== true) throw new HttpError(409, `Version ${cur.version} was saved after the one you changed (${base}).`);
    }
    const page = addVersion(db, id, { title: b.title, html: b.html, model, by: 'edit' });
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
  /**
   * Where a notebook of the Library runs: GET says the file its kernel is known by (to find one already running);
   * POST writes the notebook there as it is kept now (a kernel starts from a notebook's file, in its folder).
   */
  app.get('/api/pages/:id/notebook', async (req) => {
    const p = mustPage(db, P(req).id);
    if (p.kind !== 'notebook') throw new HttpError(400, 'This page is not a notebook');
    return { path: workFile(p.id), savedAt: p.updatedAt };
  });
  app.post('/api/pages/:id/notebook', async (req) => {
    const p = mustPage(db, P(req).id);
    if (p.kind !== 'notebook') throw new HttpError(400, 'This page is not a notebook');
    return { path: writeWorkFile(p.id, pageSource(db, p.id)!.text) };
  });
  /** A file of this computer in one of the editors (Files opens Word, Excel, CSV and LaTeX files so), and saved back to it. */
  app.get('/api/pages/file', async (req) => openFile(db, String((req.query as { path?: string }).path ?? '')));
  app.get('/api/pages/file/comments', async (req) => openFileComments(db, String((req.query as { path?: string }).path ?? '')));
  app.put('/api/pages/file', { bodyLimit: 40 * 1024 * 1024 }, async (req) => saveFile(db, B(req)));
  /** The user changed an HTML file in the page editor beside a conversation: its agent hears of it with their next message. */
  app.post('/api/pages/file-edit', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    const sessionKey = key(b.sessionKey);
    if (!sessionKey || typeof b.path !== 'string' || !isAbsPath(b.path) || typeof b.before !== 'string' || typeof b.after !== 'string') throw new HttpError(400, 'Which session, file, and what changed?');
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
  /** Comments on a page's blocks, as its editor shows them; changes to them as a list (see PageCommentOp), made by the user. */
  app.get('/api/pages/:id/comments', async (req) => {
    mustPage(db, P(req).id);
    return { comments: pageComments(db, P(req).id) };
  });
  app.post('/api/pages/:id/comments', async (req) => {
    const r = changeComments(db, P(req).id, B(req).ops, 'user');
    tell(d, { what: 'comments', id: P(req).id });
    return { comments: r.list, added: r.added };
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
    const q = req.query as { format?: string; v?: string; paper?: string; slide?: string };
    const format = String(q.format ?? '') as ExportFormat;
    if (!EXPORT_TYPES[format]) throw new HttpError(400, `format is one of ${Object.keys(EXPORT_TYPES).join(', ')}`);
    const f = await exportPage(db, P(req).id, { format, version: q.v ? Number(q.v) : undefined, paper: q.paper === 'letter' ? 'letter' : 'a4', slide: q.slide ? Number(q.slide) : undefined });
    // What there is to say of it (a PowerPoint file's fonts inside it, and which compressed), beside it.
    if (f.note) reply.header('X-Export-Note', f.note.replace(/[^\x20-\x7e]/g, '?'));
    return reply
      .header('Cache-Control', 'no-store')
      .header('Content-Disposition', `attachment; filename="${f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(f.name)}`)
      .type(f.type)
      .send(f.data);
  });
  /** A document as it prints (unsaved changes and all), for the editor to print: its pages, header and footer, maths. */
  app.post('/api/pages/docs/print', { bodyLimit: 12 * 1024 * 1024 }, async (req) => {
    const b = B(req);
    let doc;
    try {
      doc = normalizeDoc(b.model);
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
    return { html: docPage(db, doc, typeof b.title === 'string' ? b.title.slice(0, 300) : 'Document', 'print') };
  });

  // ---- a deck's pictures and fonts ---------------------------------------------------------------
  /** A picture for a deck (the editor's upload, or one at an address on the web), or a 3D part's model (a .glb, model: true): kept, and its source. */
  app.post('/api/pages/assets', { bodyLimit: Math.ceil(MAX_ASSET * 1.4) + 4096 }, async (req) => {
    const b = B(req);
    if (typeof b.data === 'string' && b.model === true) {
      const m = /^data:(?:model\/gltf-binary|model\/gltf\+json|application\/octet-stream);base64,([A-Za-z0-9+/=]+)$/i.exec(b.data);
      if (!m) throw new HttpError(400, 'data is a data: address of a 3D model (a .glb file, or a .gltf with its files inside it)');
      return { src: `naget-asset:${putAsset(db, Buffer.from(m[1], 'base64'), { model: true })}` };
    }
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
  /** A YouTube or Vimeo video's still, fetched here and kept as a picture (for a video put on a slide or a page): its source. */
  app.post('/api/pages/video-still', async (req) => {
    const url = B(req).url;
    if (typeof url !== 'string' || !videoSrc(url)) throw new HttpError(400, 'url is the address of a video on YouTube or Vimeo');
    const src = await videoStillOf(db, url);
    if (!src) throw new HttpError(422, 'That video’s still could not be had: it may be private, or its site could not be reached');
    return { src };
  });
  /** A video for a deck from this device, in pieces sent in order (the bytes themselves): the last one gives its source. */
  app.post('/api/pages/videos', async (req) => {
    const body = req.body as Readable | undefined;
    if (!body || typeof body.pipe !== 'function') throw new HttpError(400, 'Send the video’s bytes (application/octet-stream), a piece at a time');
    return takeVideoPiece(db, body, req.query as Record<string, string>);
  });
  app.get('/api/pages/videos/:sha', async (req, reply) => sendVideo(req, reply, getVideo(db, P(req).sha)));
  app.get('/api/pages/assets/:sha', async (req, reply) => {
    const a = getAsset(db, P(req).sha);
    if (!a) return reply.code(404).send({ error: 'No such picture' });
    // A picture of its own address is the same picture for ever; SVG runs nothing as a picture, and is kept from running as a page.
    return reply.header('Cache-Control', 'private, max-age=31536000, immutable').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox").type(a.mime).send(a.data);
  });
  /**
   * A picture on the web, for what the app shows of it (whose own pages load no picture from the web): a deck or a
   * document in its editor, and the pictures in agents' replies. What an address gave is remembered for a while (the
   * picture kept, or why not), so a reply shown again, or on another device, fetches nothing.
   */
  const pictures = new Map<string, { sha?: string; error?: string; at: number }>();
  app.get('/api/pages/picture', async (req, reply) => {
    const url = String((req.query as { url?: string }).url ?? '');
    if (!/^https?:\/\//i.test(url) || url.length > 4096) throw new HttpError(400, 'url is an http(s) address');
    let seen = pictures.get(url);
    if (seen && Date.now() - seen.at > (seen.sha ? 6 * 3600_000 : 10 * 60_000)) seen = undefined;
    let a = seen?.sha ? getAsset(db, seen.sha) : null;
    if (!a && !seen?.error) {
      const notes: string[] = [];
      const src = await takeIn(db, url, { notes });
      const sha = src.startsWith('naget-asset:') ? src.slice('naget-asset:'.length) : undefined;
      a = sha ? getAsset(db, sha) : null;
      seen = a ? { sha, at: Date.now() } : { error: notes[0] ?? 'Not a picture', at: Date.now() };
      pictures.delete(url);
      pictures.set(url, seen);
      if (pictures.size > 1000) pictures.delete(pictures.keys().next().value!);
    }
    if (!a) return reply.code(404).send({ error: seen?.error ?? 'Not a picture' });
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
  // A deck's video from a device, for what opens without the app's sign-in (a deck's own page, published copies, the
  // conversation's frame): the address, signed by this server, is the permission.
  app.get('/pg/video/:sha/:sig', async (req, reply) => {
    const { sha, sig } = P(req);
    reply.header('X-Robots-Tag', 'noindex, nofollow');
    return videoAddressOk(sha, sig) ? sendVideo(req, reply, getVideo(db, sha)) : reply.code(404).send({ error: 'No such video' });
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
  tools: () => [SHOW_HTML, SAVE_PAGE, watched(SAVE_SLIDES), watched(SAVE_DOC), watched(SAVE_SHEET), watched(SAVE_LATEX), SAVE_NOTEBOOK, GET_PAGE, EXPORT_PAGE, PUBLISH_SITE, LATEX_CHECK, HOW_TO_MAKE, pageActionTool({ keep: keepModel, hidden: outOfReach })],
  spawn: (s, d) => {
    const ask = s.extra?.page ? askInstructions(d.db, s.extra.page) : null;
    // Something asked for from the gallery or Turn it into (`extra.make`): the request in full, the message being short.
    const make = s.extra?.make ? makeInstructions(s.extra.make) : null;
    return { instructions: [INSTRUCTIONS, ...(ask ? [ask] : []), ...(make ? [make] : [])] };
  },
  // The pages the user changed in the editor, with their next message (which starts a new turn of saves).
  beforeMessage: (key, d) => {
    newTurn(key);
    return takeEdits(d.db, key);
  },
  start(d) {
    setCaptureDb(d.db);
    d.sessions.on('toolstream', (key: string, e: ToolStream) => feedDraft(d, key, e));
    // A turn that ended (or an agent that stopped) leaves no page being written, and its saves are done with.
    d.sessions.on('live', (key: string, live: { status?: string } | null) => {
      if (live && ['working', 'waiting', 'starting'].includes(live.status ?? '')) return;
      endDrafts(d, key);
      turns.delete(key);
    });
    enableThumbs();
    // What comes in without a description gets one from the helper model (describe.ts).
    enableDescriptions();
    setTimeout(() => refreshThumbs(d), 30_000).unref();
    // Pictures no deck shows any more, once a day.
    setInterval(() => sweepAssets(d.db), 86_400_000).unref();
  },
};
