// Papers: what the research apps' steps use to find, read and keep papers. Three tools, for apps' steps only (agents in
// sessions read papers with read_page and read_document, as the papers skill says):
//   read_paper     a paper from a link, an arXiv id, a DOI, a title, or a PDF or LaTeX source on this computer: its record
//                  and BibTeX, and its text from an open copy, in parts a model step takes whole (resolve.ts)
//   reading_list   the papers an app keeps (its "papers" records; the Reading list's for an app that keeps none): find,
//                  keep (added or completed), import a .bib, export one as a file to download (list.ts, bib.ts)
//   zotero_sync    an app's papers and the user's Zotero library kept in step, the last sync's version kept with the
//                  app (zotero.ts)
import fs from 'node:fs';
import path from 'node:path';
import type { DataCollection } from '../../shared/app-manifest.ts';
import { momentOf } from '../../shared/app-manifest.ts';
import type { Feature, RunCtx, RunTool } from '../features/types.ts';
import { addRecord, findRecords } from '../apps/data.ts';
import { putMediaBuffer, mediaPath, refMedia } from '../apps/media.ts';
import { WORK_DIR } from '../apps/runs.ts';
import { getApp, getRun, type RunRecord } from '../apps/store.ts';
import { templateById } from '../apps/templates.ts';
import type { DB } from '../db.ts';
import { allSpaces } from '../spaces/index.ts';
import { userTimezone } from '../userPrefs.ts';
import { readBib, statusOf, tagsOf, writeBib } from './bib.ts';
import { appList, findPapers, keepPapers, READING_LIST, tidyProjects, type PaperList, type ProjectOf } from './list.ts';
import { readPaper } from './resolve.ts';
import { syncZotero, vaultSender, type ZoteroSend } from './zotero.ts';

/** The run an app's step belongs to (a step's tools are called with its run's id, as "flow-<id>"). */
function runOfStep(ctx: RunCtx): RunRecord | null {
  const m = /^flow-(.+)$/.exec(ctx.runId);
  return m ? getRun(ctx.deps.db, m[1]) : null;
}

/** An app's records as they are now (a run of an app of yours goes by the app; a ready-made app's, or a test's, by its recipe). */
function keptOf(ctx: RunCtx, r: RunRecord): Record<string, DataCollection> | undefined {
  const own = r.app.startsWith('tpl:') || r.app === 'test' ? null : getApp(ctx.deps.db, r.app);
  return own?.data ?? r.recipe.data;
}

/**
 * The reading list a step works on: its app's own papers; for finding only (`read`), the Reading list's when its app
 * keeps none. Its PDFs go in the app's folder of runs, under papers/.
 */
function listFor(ctx: RunCtx, read = false): PaperList {
  const r = runOfStep(ctx);
  if (!r) throw new Error('reading_list works in an app’s steps only.');
  const db = ctx.deps.db;
  const changed = (app: string) => (collection: string) => ctx.deps.broadcast({ t: 'feature', id: 'apps', data: { data: { app, collection } } });
  const data = keptOf(ctx, r);
  if (data?.papers) {
    const slug = r.app.startsWith('tpl:') ? r.app.slice(4) : (getApp(db, r.app)?.slug ?? 'test');
    return appList(db, r.app, data, { changed: changed(r.app), folder: path.join(WORK_DIR, slug, 'papers') });
  }
  if (!read) throw new Error('This app keeps no list of papers: give it a "papers" collection, or use the Reading list.');
  return appList(db, READING_LIST, templateById('reading-list')?.data, { changed: changed(READING_LIST) });
}

/** The user's projects by their id or name (the id first), as papers keep them. */
export function projectsOf(db: DB): ProjectOf {
  const all = allSpaces(db);
  return (given) => {
    const s = given.trim().toLowerCase();
    if (!s) return null;
    const hit = all.find((x) => x.id.toLowerCase() === s) ?? all.find((x) => x.name.trim().toLowerCase() === s);
    return hit ? { id: hit.id, name: hit.name } : null;
  };
}

const today = (ctx: RunCtx) => momentOf(userTimezone(ctx.deps.db)).today;
const str = (v: unknown, max = 2000) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');

/** The papers' fields an answer shows (their BibTeX and abstract left out: long, and asked for when wanted). */
const brief = (p: object, full = false) =>
  Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== null && v !== undefined && v !== '' && (full || (k !== 'bibtex' && k !== 'abstract' && k !== 'createdAt' && k !== 'updatedAt'))));

export const READ_PAPER: RunTool = {
  name: 'read_paper',
  annotations: { readOnlyHint: true, openWorldHint: true },
  description: [
    'Finds and reads a paper, for an app’s step: from a link (arXiv, a DOI’s, ACL Anthology, OpenReview, a PDF or a paper’s page), an arXiv id, a DOI, a title, or a PDF, a .tex file or a LaTeX project’s folder on this computer, or a LaTeX document of the Library (/pages/<id>); upload, a file the form took, comes first.',
    'Gives JSON: found, its record (title, authors, year, venue, doi, arxiv, url, pdf, abstract, bibtex, key) and, unless text is false, its text from an open copy only (never past a paywall), in parts of at most 18,000 characters (parts, a PDF’s pages marked [Page N]; chars, pages), its sections, where the text came from (source), for LaTeX its folder, main file, figures (file, caption, label) and .bib files, and notes on what could not be read.',
    'text: false reads its record alone (quick). pages: true reads a PDF first, for citing pages. max_chars: at most this much text (90,000 unless set).',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      paper: { type: 'string', description: 'The paper: a link, an arXiv id, a DOI, a title, or a file or folder on this computer.' },
      upload: { type: 'string', description: 'A file the form took (its path): read instead of paper when given.' },
      text: { type: 'boolean', description: 'Read its text too (true unless set).' },
      pages: { type: 'boolean', description: 'A PDF first, with its pages marked.' },
      max_chars: { type: 'number', description: 'At most this many characters of its text (1,000 to 300,000; 90,000 unless set).' },
    },
  },
  async run(a, ctx) {
    const max = Number(a.max_chars);
    const r = await readPaper(
      { paper: str(a.paper, 2000), upload: str(a.upload, 2000) },
      { text: a.text !== false && a.text !== 'false' && a.text !== 'No', pages: a.pages === true || a.pages === 'true', maxChars: Number.isFinite(max) && max > 0 ? Math.max(1000, Math.min(300_000, max)) : undefined, cwd: ctx.cwd, db: ctx.deps.db, signal: ctx.signal },
    );
    return JSON.stringify(r);
  },
};

const FIND_PROPS = {
  status: { type: 'string', description: 'To read, Reading or Read.' },
  tag: { type: 'string' },
  project: { type: 'string', description: 'One of the user’s projects, by its name or id (kept as its id, its name in project_name), or any name.' },
  search: { type: 'string', description: 'Words anywhere in a paper: its title, authors, venue, notes, tags.' },
  ids: { type: 'array', items: { type: 'string' }, description: 'Papers by their record ids.' },
};

export const READING_LIST_TOOL: RunTool = {
  name: 'reading_list',
  description: [
    'The papers of a reading list, for an app’s step: its app’s own (its "papers" records), or for finding only, the Reading list’s when its app keeps none.',
    'op "find" (the default): those that match status, tag, project, search (words) or ids, newest first: { papers, count }.',
    'op "keep": papers ({ title, authors, year, venue, doi, arxiv, url, pdf, abstract, bibtex, tags, status, notes, project }) added, or the ones it has (the same DOI, arXiv id or title) completed with what they lack; new ones take project, tags and status (To read unless set): { added, updated, unchanged, papers, count }. A project that is one of the user’s is kept as its id, with its name in project_name.',
    'op "import": a .bib (bibtex, its text; or path, its file) kept the same way: { added, updated, unchanged, skipped, count }.',
    'op "export": the papers that match as a .bib: { bibtex, file (its address, to download), name, count }.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      op: { type: 'string', enum: ['find', 'keep', 'import', 'export'] },
      ...FIND_PROPS,
      papers: { type: 'array', items: { type: 'object' }, description: 'keep: the papers.' },
      tags: { description: 'keep, import: tags for the new papers (a list, or text split at commas).' },
      bibtex: { type: 'string', description: 'import: the .bib’s text.' },
      path: { type: 'string', description: 'import: a .bib file on this computer.' },
      full: { type: 'boolean', description: 'find: with each paper’s BibTeX and abstract.' },
    },
  },
  async run(a, ctx) {
    const op = str(a.op, 20) || 'find';
    const q = { status: statusOf(a.status) || str(a.status, 40), tag: str(a.tag, 60), project: str(a.project, 300), search: str(a.search, 300), ids: Array.isArray(a.ids) ? a.ids.map(String) : undefined, limit: Number(a.limit) || undefined };
    const projectOf = projectsOf(ctx.deps.db);
    if (op === 'find') {
      const list = listFor(ctx, true);
      tidyProjects(list, projectOf);
      const found = findPapers(list, q, projectOf);
      return JSON.stringify({ papers: found.map((p) => brief(p, a.full === true)), count: found.length, list: list.app === READING_LIST ? 'Reading list' : 'this app' });
    }
    const list = listFor(ctx);
    // Projects named by their words (a paper's page, an agent) become the projects' ids, and names follow renamed ones.
    tidyProjects(list, projectOf);
    const keepOpts = { today: today(ctx), status: statusOf(a.status) || undefined, project: str(a.project, 300) || undefined, tags: tagsOf(a.tags), projectOf };
    if (op === 'keep') {
      const incoming = (Array.isArray(a.papers) ? a.papers : a.papers && typeof a.papers === 'object' ? [a.papers] : []).filter((x: unknown) => x && typeof x === 'object');
      if (!incoming.length) throw new Error('keep: give the papers ({ title, … } each).');
      const k = keepPapers(list, incoming, keepOpts);
      return JSON.stringify({ added: k.added, updated: k.updated, unchanged: k.unchanged, count: k.count, papers: k.papers.map((p) => brief(p, true)) });
    }
    if (op === 'import') {
      let text = typeof a.bibtex === 'string' ? a.bibtex : '';
      const file = str(a.path, 2000);
      if (!text.trim() && file) {
        const p = path.resolve(ctx.cwd, file.replace(/^~(?=\/|$)/, process.env.HOME ?? ''));
        if (!/\.bib$/i.test(p)) throw new Error(`${path.basename(p)} is not a .bib file.`);
        text = fs.readFileSync(p, 'utf8').slice(0, 20_000_000);
      }
      if (!text.trim()) throw new Error('import: give the .bib’s text (bibtex) or its file (path).');
      const { papers, skipped } = readBib(text);
      if (!papers.length) throw new Error(`No entry with a title was found in it${skipped ? ` (${skipped} left out)` : ''}: is it BibTeX?`);
      const k = keepPapers(list, papers, keepOpts);
      return JSON.stringify({ added: k.added, updated: k.updated, unchanged: k.unchanged, skipped, count: k.count, entries: papers.length });
    }
    if (op === 'export') {
      const found = findPapers(list, q, projectOf).reverse();
      if (!found.length) throw new Error('No paper matches, so there is nothing to export.');
      const bibtex = writeBib(found);
      const name = `${['reading-list', q.project ? (projectOf(q.project)?.name ?? q.project) : '', q.tag, q.status].filter(Boolean).join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}.bib`;
      const m = putMediaBuffer(ctx.deps.db, Buffer.from(bibtex, 'utf8'), name, 'text/x-bibtex');
      const file = mediaPath(m);
      const r = runOfStep(ctx);
      if (r) refMedia(ctx.deps.db, `run:${r.id}`, file, { keep: true });
      return JSON.stringify({ bibtex: bibtex.length > 150_000 ? `${bibtex.slice(0, 150_000)}\n% … (the file has them all)` : bibtex, file, name, count: found.length });
    }
    throw new Error('op is find, keep, import or export.');
  },
};

/** Where a sync's latest version is kept: the app's "syncs" records, the latest of the library first. */
function lastSync(ctx: RunCtx, list: PaperList, data: Record<string, DataCollection> | undefined): number {
  if (!data?.syncs) return 0;
  const recs = findRecords(ctx.deps.db, list.app, data, 'syncs', { where: { service: 'zotero' }, sort: '-createdAt', limit: 1 }).records;
  return Number(recs[0]?.version) || 0;
}

/** A stand-in for Zotero, for tests (null: the real one, with the vault's key). */
let zoteroForTests: { send: ZoteroSend; user: string } | null = null;
export const useZoteroForTests = (z: typeof zoteroForTests) => void (zoteroForTests = z);

export const ZOTERO_SYNC: RunTool = {
  name: 'zotero_sync',
  annotations: { openWorldHint: true },
  description: [
    'Keeps an app’s reading list (its "papers" records) and the user’s Zotero library in step, for an app’s step: what changed in Zotero since the last sync comes in (new papers added, those it has completed, matched by Zotero key, DOI, arXiv id or title; those deleted in Zotero stay, no longer linked), and the papers only here go to Zotero.',
    'Needs the vault’s ZOTERO_API_KEY (ZOTERO_USER_ID too, else it is found from the key). direction: both (the default), pull or push.',
    'Gives { summary ("12 new from Zotero, 3 sent to it"), added, updated, sent, unlinked, failed, library, version, at }, and keeps the sync with the app (its "syncs" records) so the next one moves only what changed.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: { direction: { type: 'string', enum: ['both', 'pull', 'push'] } },
  },
  async run(a, ctx) {
    const r = runOfStep(ctx);
    if (!r) throw new Error('zotero_sync works in an app’s steps only.');
    const list = listFor(ctx);
    const data = keptOf(ctx, r);
    const vault = zoteroForTests ? null : vaultSender(ctx.deps.db);
    const send = zoteroForTests?.send ?? vault!.send;
    const user = zoteroForTests ? zoteroForTests.user : vault!.user();
    const direction = a.direction === 'pull' || a.direction === 'push' ? a.direction : 'both';
    const res = await syncZotero(list, { send, user, since: lastSync(ctx, list, data), direction, today: today(ctx) });
    const at = momentOf(userTimezone(ctx.deps.db)).now;
    if (data?.syncs) {
      addRecord(ctx.deps.db, list.app, data, 'syncs', { service: 'zotero', library: res.library, version: res.version, at, summary: res.summary, added: res.added, updated: res.updated, sent: res.sent, unlinked: res.unlinked });
      ctx.deps.broadcast({ t: 'feature', id: 'apps', data: { data: { app: list.app, collection: 'syncs' } } });
    }
    return JSON.stringify({ ...res, at });
  },
};

export const papers: Feature = {
  id: 'papers',
  // For apps' steps alone: an agent in a session has read_page, read_document and the papers skill.
  tools: (ctx) => (ctx.step ? [READ_PAPER, READING_LIST_TOOL, ZOTERO_SYNC] : []),
};
