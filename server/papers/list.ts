// A reading list: the "papers" records an app keeps (the Reading list's, or those of an app made from it), as the papers
// tools see them. Papers come in (added, or completed when the list has them already: matched by Zotero key, DOI, arXiv
// id or title) and go out (found by their status, tag, project or words, written as a .bib). Each record keeps only the
// fields its collection has. A PDF given with a paper (an upload, kept in its run's folder) goes to the list's own folder
// of PDFs, so it stays when the run is gone. A paper's project is kept as the id of one of the user's projects when the
// words given name one (by its name or id), with its name beside it to show (project_name); other words stay as given.
import fs from 'node:fs';
import path from 'node:path';
import type { DataCollection } from '../../shared/app-manifest.ts';
import type { DB } from '../db.ts';
import { bibText } from '../../shared/latex-bib.ts';
import { addRecord, allRecords, updateRecords, type DataRecord } from '../apps/data.ts';
import { bibOfPaper, findSame, mergePaper, tagsOf, tidyPaper, type Paper } from './bib.ts';

/** The ready-made Reading list: what other apps read when they keep no list of their own. */
export const READING_LIST = 'tpl:reading-list';

export type PaperRow = Paper & { id: string; createdAt: number; updatedAt: number };

/** One of the user's projects, named by its name or its id; null when the words name none. */
export type ProjectOf = (given: string) => { id: string; name: string } | null;

/** A project as a paper keeps it: the user's project's id and name, else the words given (as its name too). */
export function placeProject(given: unknown, projectOf?: ProjectOf): Pick<Paper, 'project' | 'project_name'> {
  const g = typeof given === 'string' ? given.trim().slice(0, 300) : '';
  if (!g) return {};
  const s = projectOf?.(g);
  return s ? { project: s.id, project_name: s.name } : { project: g, project_name: g };
}

/** A former project's id ("sp" and ten hex digits), whose project is gone: its name stays as the list last knew it. */
const GONE_PROJECT = /^sp[0-9a-f]{10}$/;

/**
 * The list's projects as they are now: a project named by its words becomes its id once it is one of the user's projects,
 * and each name follows its project when it was renamed. Changes only what differs.
 */
export function tidyProjects(list: PaperList, projectOf: ProjectOf): number {
  if (!list.names) return 0;
  let changed = 0;
  for (const p of list.all()) {
    const project = String(p.project ?? '').trim();
    let want: Pick<Paper, 'project' | 'project_name'>;
    if (!project) want = { project: p.project ?? '', project_name: '' };
    else {
      const s = projectOf(project);
      want = s ? { project: s.id, project_name: s.name } : { project, project_name: GONE_PROJECT.test(project) ? p.project_name || project : project };
    }
    if ((want.project ?? '') === (p.project ?? '') && (want.project_name ?? '') === (p.project_name ?? '')) continue;
    list.update(p.id, { project: want.project || null, project_name: want.project_name || null });
    changed++;
  }
  return changed;
}

export interface PaperList {
  /** The app whose records these are ("tpl:reading-list", or an app's id). */
  app: string;
  all(): PaperRow[];
  add(p: Paper): PaperRow;
  update(id: string, set: Record<string, unknown>): void;
  /** Its own folder, for the PDFs given with papers. */
  folder?: string;
  /** Whether its records keep the project's name beside its id (a list made before it did keeps the words given). */
  names?: boolean;
}

/** An app's "papers" as a list: its records read and written through what apps keep (data.ts), changes told to its pages. */
export function appList(db: DB, app: string, data: Record<string, DataCollection> | undefined, o: { changed?: (collection: string) => void; folder?: string } = {}): PaperList {
  const c = data?.papers;
  if (!c) throw new Error('This app keeps no list of papers (a "papers" collection).');
  const fields = c.fields ? new Set(c.fields.map((f) => f.id)) : null;
  // Only the fields the collection has; a cleared one goes as null.
  const own = (v: Record<string, unknown>) => Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== 'id' && (!fields || fields.has(k)) && x !== undefined));
  return {
    app,
    folder: o.folder,
    names: !fields || fields.has('project_name'),
    all: () => allRecords(db, app, 'papers') as PaperRow[],
    add(p) {
      const r = addRecord(db, app, data, 'papers', own(p as unknown as Record<string, unknown>)) as DataRecord & Paper;
      o.changed?.('papers');
      return r as PaperRow;
    },
    update(id, set) {
      updateRecords(db, app, data, 'papers', { id }, own(set));
      o.changed?.('papers');
    },
  };
}

const safe = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'paper';

/** A PDF on this computer given with a paper (an upload in a run's folder), copied into the list's own folder. */
function keepPdf(list: PaperList, p: Paper): Paper {
  if (!list.folder || !p.pdf || !path.isAbsolute(p.pdf) || !/[/\\]uploads[/\\]/.test(p.pdf) || !fs.existsSync(p.pdf)) return p;
  try {
    fs.mkdirSync(list.folder, { recursive: true });
    let dest = path.join(list.folder, `${safe(p.key || p.title)}.pdf`);
    for (let n = 2; fs.existsSync(dest) && fs.statSync(dest).size !== fs.statSync(p.pdf).size; n++) dest = path.join(list.folder, `${safe(p.key || p.title)}-${n}.pdf`);
    fs.copyFileSync(p.pdf, dest);
    return { ...p, pdf: dest };
  } catch {
    return p;
  }
}

export interface KeepResult {
  added: number;
  updated: number;
  unchanged: number;
  /** The papers kept, as the list has them now. */
  papers: PaperRow[];
  /** How many the list has now. */
  count: number;
}

/**
 * Papers into the list: each new one added (to read unless it says, today's date, the project and tags given), each one
 * it has completed with what it lacks (`metadata`: a record from Zotero, newer, changes its record too).
 */
export function keepPapers(list: PaperList, incoming: Partial<Paper>[], o: { today: string; status?: string; project?: string; tags?: string[]; metadata?: boolean; projectOf?: ProjectOf }): KeepResult {
  const have = list.all();
  const out: KeepResult = { added: 0, updated: 0, unchanged: 0, papers: [], count: 0 };
  for (const raw of incoming) {
    const p = keepPdf(list, tidyPaper(raw as Paper & Record<string, unknown>));
    if (!p.title) continue;
    if (o.tags?.length) p.tags = tagsOf([...(p.tags ?? []), ...o.tags]);
    if (o.project && !p.project) p.project = o.project;
    if (p.project && list.names) Object.assign(p, placeProject(p.project, o.projectOf));
    const same = findSame(have, p);
    if (same) {
      const set = mergePaper(same, p, { metadata: o.metadata });
      if (set) {
        list.update(same.id, set as Record<string, unknown>);
        Object.assign(same, set);
        out.updated++;
      } else out.unchanged++;
      out.papers.push(same);
      continue;
    }
    // A new paper without its BibTeX gets an entry made from what it knows (its key as people make them).
    const e = p.bibtex ? null : bibOfPaper(p);
    const bib = e ? { bibtex: bibText(e), key: p.key || e.key } : {};
    const row = list.add({ ...p, ...bib, status: p.status || o.status || 'To read', added: p.added || o.today, ...((p.status || o.status) === 'Read' && !p.read_on ? { read_on: o.today } : {}) });
    have.push(row);
    out.papers.push(row);
    out.added++;
  }
  out.count = have.length;
  return out;
}

/** What a list's papers are found by: status, a tag, a project, words anywhere in them, or their ids. */
export interface PaperQueryOptions {
  status?: string;
  tag?: string;
  project?: string;
  search?: string;
  ids?: string[];
  limit?: number;
}

/** The papers that match, newest first. A project matches by its id or its name. */
export function findPapers(list: PaperList, q: PaperQueryOptions, projectOf?: ProjectOf): PaperRow[] {
  const low = (s: unknown) => String(s ?? '').trim().toLowerCase();
  const words = low(q.search).split(/\s+/).filter(Boolean);
  const ids = new Set((q.ids ?? []).map(String));
  const named = q.project ? projectOf?.(q.project) : null;
  const projects = new Set([q.project, named?.id, named?.name].filter(Boolean).map(low));
  return list
    .all()
    .filter(
      (p) =>
        (!ids.size || ids.has(p.id)) &&
        (!q.status || low(p.status) === low(q.status)) &&
        (!q.tag || (p.tags ?? []).some((t) => low(t) === low(q.tag))) &&
        (!projects.size || projects.has(low(p.project)) || projects.has(low(p.project_name))),
    )
    .filter((p) => {
      if (!words.length) return true;
      const hay = low([p.title, p.authors, p.venue, p.year, p.doi, p.arxiv, p.notes, p.project_name || p.project, (p.tags ?? []).join(' '), p.abstract].join(' '));
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, Math.min(q.limit ?? 1000, 5000)));
}
