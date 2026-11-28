// What a project carries to another machine: its details, its folder, other folders it works with, its own skills, memory
// notes, agents, knowledge bases, kept things (pages, pictures, videos, sounds) and wiki; a plan of it (what would go, what
// would stay behind, how big: nothing is read), and the bundle that carries it (a manifest, then each part's files).
// arrive.ts makes a project from such a bundle.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import type { Assistant } from '../../../shared/assistants.ts';
import { isGroup, type Space } from '../../../shared/spaces.ts';
import type { CarryPlan, LeftOut } from '../../../shared/transfer.ts';
import { allAssistants } from '../../assistants/store.ts';
import { HttpError } from '../../auth.ts';
import { config } from '../../config.ts';
import type { DB } from '../../db.ts';
import { baseRows, filesDir, sourcesOf } from '../../knowledge/store.ts';
import { MEDIA_DIR } from '../../media/store.ts';
import { entries, repoRoot } from '../../memory/store.ts';
import { folderPath, listFolders } from '../../pages/folders.ts';
import { kindOf } from '../../pages/kinds.ts';
import { initPages } from '../../pages/store.ts';
import { spaceSkillsDir, spaceSwitches } from '../../skillpack/spaceSkills.ts';
import { hubDir, wikiRoot } from '../../wiki/roots.ts';
import { isWikiBase } from '../../wiki/knowledge/bindings.ts';
import { spaceById } from '../index.ts';
import { homeDir, relativeTo } from './safe.ts';
import { bundleStream, type BundleWriter } from './stream.ts';
import { walk, LEFT_OUT_LISTED, type WalkResult } from './walk.ts';

// ---- the manifest ----------------------------------------------------------------------------------------------

export const MANIFEST_VERSION = 1;

/** A memory note as it travels: its text and how it is known, without ids, links or what session wrote it. */
export interface ManifestNote {
  kind: 'note' | 'topic' | 'profile' | 'finding';
  text: string;
  title?: string;
  basis?: string;
  source: 'auto' | 'agent' | 'user';
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
  /** A finding's own data (its `replaces` and `run` are left out: they point at things that do not travel). */
  finding?: unknown;
}

/** An agent of the project's own: its definition, without id, schedules or other projects. */
export interface ManifestAgent {
  /** Its id here: the project's `assistant` may name it. */
  from: string;
  def: Omit<Assistant, 'id' | 'projects' | 'builtin'>;
}

export interface ManifestBase {
  /** Its id here: the files of the area `knowledge/<id>`. */
  id: string;
  name: string;
  description?: string;
  /** The files dropped into it travel (area `knowledge/<id>`). */
  files: boolean;
  /** Folder sources inside the project's folder: where they are in it ('' for the folder itself). */
  folders: { rel: string; name: string }[];
  /** Folder sources outside it: they cannot go. */
  outside: string[];
}

/** The file a kept thing has in the project's folder (kept-files.ts), as it stood. */
export interface ManifestKeptFile {
  /** In the project's folder, '/' between parts. */
  rel: string;
  /** Its bytes' hash as the app recorded it (a LaTeX project's folder: of its files). */
  sha: string | null;
  auto: number;
  title: string | null;
  adopted?: number;
}

export interface ManifestPage {
  id: string;
  title: string;
  /** 'page' for HTML, else the kind (slides, doc, sheet, tex, notebook, diagram, board). */
  kind: string;
  /** The current version as it is kept: HTML, or the model's JSON. */
  text: string;
  description?: string;
  /** Its library folder, as a path from its project's top: "Thesis/Drafts". */
  folder?: string;
  source?: { url: string; site: string };
  createdAt: number;
  updatedAt: number;
  /** The kept pictures it shows (area `assets`, by sha). */
  assets: string[];
  file?: ManifestKeptFile;
}

export interface ManifestMedia {
  id: string;
  kind: 'image' | 'video' | 'audio';
  title: string;
  description: string;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  duration?: number;
  peaks?: number[];
  lyrics?: string;
  prompt?: string;
  model?: string;
  source?: string;
  sha?: string;
  caption: string;
  captionBy?: string;
  /** Its file in the area `media`. */
  file: string;
  folder?: string;
  createdAt: number;
  projectFile?: ManifestKeptFile;
}

export interface BundleManifest {
  v: typeof MANIFEST_VERSION;
  from: { host: string; platform: string; home: string; version: string };
  project: {
    id: string;
    name: string;
    color: string;
    description?: string;
    instructions?: string;
    assistant?: string;
    sharedKnowledge?: boolean;
    wikiMemory?: boolean;
    wikiDocumentLimit?: number;
    memoryShared?: boolean;
    folder: string;
    folders?: string[];
  };
  /** Its folder relative to the sender's home folder, when it is under it. */
  rel?: string;
  /** Its other folders that go (under the sender's home): area `also/<index>`. */
  also: { index: number; path: string; rel: string }[];
  /** The names of its own skills (area `skills`), and the skills it switches on or off for itself. */
  skills: string[];
  switches: Record<string, boolean>;
  notes: ManifestNote[];
  agents: ManifestAgent[];
  knowledge: ManifestBase[];
  kept: { pages: ManifestPage[]; media: ManifestMedia[]; folders: string[]; assets: { sha: string; mime: string; bytes: number }[] };
  /** Its wiki memory's folder (area `wiki`); `rel` where it was inside the project's folder. */
  wiki: { rel?: string } | null;
  totals: { files: number; bytes: number };
}

export interface CarryOptions {
  /** Leave out what can be made again (default true). */
  leaveOut?: boolean;
  /** Its other folders under home go too (default false). */
  also?: boolean;
}

// ---- gathering ---------------------------------------------------------------------------------------------------

/** The space, checked: there, not a group, its folder there. */
export function sendable(db: DB, id: string): Space {
  const s = spaceById(db, id);
  if (!s) throw new HttpError(404, 'No such project');
  if (isGroup(s)) throw new HttpError(400, 'A group can’t be sent: send its projects one by one');
  if (!fs.existsSync(s.folder) || !fs.statSync(s.folder).isDirectory()) throw new HttpError(400, `The folder of “${s.name}” is not there (${s.folder}), so there is nothing to send`);
  return s;
}

/** Where its memory notes are kept: its repository's root, else its folder. */
export const memoryKeyOf = (folder: string) => repoRoot(folder) ?? folder;

const ownBases = (db: DB, id: string) => baseRows(db).filter((b) => b.space === id && !isWikiBase(db, b.id));

/** The agents whose projects include it, its own. */
export const agentsOf = (db: DB, id: string) => allAssistants(db).filter((a) => !a.builtin && a.projects?.includes(id));

const realOr = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

/** Its wiki folder when it has one that goes: not the shared hub, not the folder itself. */
function wikiOf(db: DB, s: Space): { root: string; rel?: string } | null {
  let root: string | null = null;
  try {
    root = wikiRoot(db, s.id);
  } catch {
    return null;
  }
  if (!root || !fs.existsSync(root)) return null;
  const real = realOr(root);
  const own = realOr(s.folder);
  const hub = (() => {
    try {
      return hubDir(db);
    } catch {
      return null;
    }
  })();
  if (real === own || (hub && (real === hub || relativeTo(real, hub) !== null))) return null;
  const rel = relativeTo(own, real);
  return { root: real, ...(rel ? { rel } : {}) };
}

interface Part {
  area: string;
  root: string;
  walked: WalkResult;
}

interface Gathered {
  space: Space;
  parts: Part[];
  /** Files of the media store: path in the area `media`, and where they are. */
  media: { path: string; abs: string }[];
  manifest: BundleManifest;
  plan: CarryPlan;
}

const skillsExist = (id: string) => fs.existsSync(spaceSkillsDir(id));

/** The kept pages' rows, and the media's. */
function keptRows(db: DB, id: string) {
  initPages(db);
  const pages = db.prepare('select * from pages where space = ? and app is null order by created_at').all(id) as Record<string, any>[];
  let media: Record<string, any>[] = [];
  try {
    media = db.prepare('select * from media where space = ? order by created_at').all(id) as Record<string, any>[];
  } catch {}
  return { pages, media };
}

const SHA = /^[a-f0-9]{16,64}$/;

/** The kept pictures (and models) the current version of a page shows, those this app keeps. */
function assetsOf(db: DB, pageId: string, version: number): { sha: string; mime: string; bytes: number }[] {
  const rows = db.prepare('select a.sha as sha, a.mime as mime, a.bytes as bytes from page_asset_refs r join page_assets a on a.sha = r.sha where r.page_id = ? and r.version = ?').all(pageId, version) as { sha: string; mime: string; bytes: number }[];
  return rows.filter((r) => SHA.test(r.sha));
}

/** A kept thing's file in the project's folder, as a path in it, when it is in step with the thing. */
function keptFileOf(s: Space, r: Record<string, any>, media: boolean): ManifestKeptFile | undefined {
  const file = r.project_file as string | null;
  if (!file || r.project_file_sig === 'gone' || r.project_file_sig === 'changed') return undefined;
  // Only a file in step with its thing is attached on arrival: a page's at its current version, a media item's with its bytes.
  if (!media && r.project_file_version !== r.version) return undefined;
  if (media && (!r.sha || r.project_file_sha !== r.sha)) return undefined;
  const rel = relativeTo(path.resolve(s.folder), path.resolve(file));
  if (!rel) return undefined;
  return { rel, sha: r.project_file_sha ?? null, auto: r.project_file_auto ?? 0, title: r.project_file_title ?? null, ...(media && r.project_file_adopted ? { adopted: 1 } : {}) };
}

/**
 * Everything a project would carry: walks its folders (nothing is read) and writes the plan; the manifest is full
 * (kept things' texts included) only with `full`.
 */
async function gather(db: DB, id: string, o: CarryOptions, full: boolean): Promise<Gathered> {
  const s = sendable(db, id);
  const leaveOut = o.leaveOut !== false;
  const home = homeDir();
  const parts: Part[] = [];
  const folderReal = realOr(s.folder);

  // Its wiki, when it has one that goes (inside its folder it is skipped there).
  const wiki = wikiOf(db, s);
  const folderWalk = await walk(s.folder, { leaveOut, mode: 'copy', skip: wiki?.rel ? [wiki.rel] : [] });
  parts.push({ area: 'folder', root: s.folder, walked: folderWalk });

  // Other folders it works with: only those under home go, and only when asked.
  const also: BundleManifest['also'] = [];
  const alsoPlan: CarryPlan['also'] = [];
  for (const [index, f] of (s.folders ?? []).entries()) {
    const rel = relativeTo(home, path.resolve(f));
    if (!rel || !fs.existsSync(f) || !fs.statSync(f).isDirectory()) {
      alsoPlan.push({ path: f, files: 0, bytes: 0, home: false });
      continue;
    }
    const w = await walk(f, { leaveOut, mode: 'copy' });
    alsoPlan.push({ path: f, files: w.totals.files, bytes: w.totals.bytes, home: true });
    if (o.also) {
      also.push({ index, path: f, rel });
      parts.push({ area: `also/${index}`, root: f, walked: w });
    }
  }

  // Its own skills.
  let skills: string[] = [];
  if (skillsExist(id)) {
    const root = spaceSkillsDir(id);
    const w = await walk(root, { leaveOut });
    skills = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, 'SKILL.md'))).map((e) => e.name).sort();
    if (w.totals.files) parts.push({ area: 'skills', root, walked: w });
  }

  // Its wiki.
  let wikiWalk: WalkResult | null = null;
  if (wiki) {
    wikiWalk = await walk(wiki.root, { leaveOut });
    parts.push({ area: 'wiki', root: wiki.root, walked: wikiWalk });
  }

  // Its own knowledge bases: the files dropped into them, and folders they read.
  const bases: ManifestBase[] = [];
  const docsLeftOut: string[] = [];
  let docCount = 0;
  let docBytes = 0;
  for (const b of ownBases(db, id)) {
    const src = sourcesOf(db, b.id);
    const entry: ManifestBase = { id: b.id, name: b.name, ...(b.description ? { description: b.description } : {}), files: false, folders: [], outside: [] };
    for (const x of src) {
      if (x.kind === 'files') {
        // The files dropped into it live in its own folder; another folder of files is not carried.
        if (path.resolve(x.path) !== path.resolve(filesDir(b.id)) || !fs.existsSync(x.path)) continue;
        const w = await walk(x.path, { leaveOut: false });
        entry.files = true;
        docCount += w.totals.files;
        docBytes += w.totals.bytes;
        if (w.totals.files || w.dirs.length) parts.push({ area: `knowledge/${b.id}`, root: x.path, walked: w });
      } else {
        const rel = relativeTo(path.resolve(s.folder), path.resolve(x.path)) ?? (path.resolve(x.path) === path.resolve(s.folder) ? '' : null);
        if (rel === null) {
          entry.outside.push(x.path);
          docsLeftOut.push(x.path);
        } else {
          entry.folders.push({ rel, name: x.name });
          docCount += (db.prepare('select count(*) as n from kb_docs where base = ? and source = ?').get(b.id, x.id) as { n: number }).n;
        }
      }
    }
    bases.push(entry);
  }

  // Kept things.
  const rows = keptRows(db, id);
  const keptCount = rows.pages.length + rows.media.length;
  const mediaFiles: Gathered['media'] = [];
  let mediaBytes = 0;
  const assetShas = new Map<string, { sha: string; mime: string; bytes: number }>();
  const pages: ManifestPage[] = [];
  const mediaItems: ManifestMedia[] = [];
  const folders = listFolders(db).filter((f) => f.space === id);
  const folderPaths = new Map(listFolders(db).map((f) => [f.id, f]));
  const pathOf = (fid: string | null | undefined) => (fid && folderPaths.has(fid) && folderPaths.get(fid)!.space === id ? folderPath(db, fid, folderPaths) : undefined);
  for (const r of rows.pages) {
    for (const a of assetsOf(db, r.id, r.version)) assetShas.set(a.sha, a);
    if (!full) continue;
    const v = db.prepare('select html from page_versions where page_id = ? and version = ?').get(r.id, r.version) as { html: string } | undefined;
    if (!v) continue;
    const file = keptFileOf(s, r, false);
    pages.push({
      id: r.id,
      title: r.title,
      kind: kindOf(r.kind) ? r.kind : 'page',
      text: v.html,
      ...(r.description ? { description: r.description } : {}),
      ...(pathOf(r.folder) ? { folder: pathOf(r.folder) } : {}),
      ...(r.source_url ? { source: { url: r.source_url, site: r.site ?? '' } } : {}),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      assets: assetsOf(db, r.id, r.version).map((a) => a.sha),
      ...(file ? { file } : {}),
    });
  }
  for (const r of rows.media) {
    const abs = path.join(MEDIA_DIR, r.file);
    const st = fs.statSync(abs, { throwIfNoEntry: false });
    if (!st?.isFile()) continue;
    mediaFiles.push({ path: r.file, abs });
    mediaBytes += st.size;
    if (!full) continue;
    const file = keptFileOf(s, r, true);
    mediaItems.push({
      id: r.id,
      kind: r.kind,
      title: r.title,
      description: r.description ?? '',
      mime: r.mime,
      bytes: r.bytes,
      ...(r.width ? { width: r.width } : {}),
      ...(r.height ? { height: r.height } : {}),
      ...(r.duration ? { duration: r.duration } : {}),
      ...(peaksOf(r.peaks) ? { peaks: peaksOf(r.peaks) } : {}),
      ...(r.lyrics ? { lyrics: r.lyrics } : {}),
      ...(r.prompt ? { prompt: r.prompt } : {}),
      ...(r.model ? { model: r.model } : {}),
      ...(r.source ? { source: r.source } : {}),
      ...(r.sha ? { sha: r.sha } : {}),
      caption: r.caption ?? 'pending',
      ...(r.caption_by ? { captionBy: r.caption_by } : {}),
      file: r.file,
      ...(pathOf(r.folder) ? { folder: pathOf(r.folder) } : {}),
      createdAt: r.created_at,
      ...(file ? { projectFile: file } : {}),
    });
  }
  const assetList = [...assetShas.values()];
  const assetBytes = assetList.reduce((n, a) => n + a.bytes, 0);

  // Memory notes.
  const key = memoryKeyOf(s.folder);
  const noteRows = entries(db, { scope: 'repo', scopeKey: key, status: 'active', live: Date.now(), limit: 20000 }).reverse();
  const notes: ManifestNote[] = full
    ? noteRows.map((e) => {
        const f = e.finding ? (({ replaces: _r, run: _run, ...rest }) => rest)(e.finding) : undefined;
        return {
          kind: e.kind,
          text: e.text,
          ...(e.title ? { title: e.title } : {}),
          ...(e.basis ? { basis: e.basis } : {}),
          source: e.source,
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          ...(e.expiresAt ? { expiresAt: e.expiresAt } : {}),
          ...(f ? { finding: f } : {}),
        };
      })
    : [];

  // Agents of its own.
  const own = agentsOf(db, id);
  const agents: ManifestAgent[] = own.map((a) => {
    const { id: from, projects: _p, builtin: _b, ...def } = a;
    return { from, def };
  });

  const totalFiles = parts.reduce((n, p) => n + p.walked.totals.files, 0) + mediaFiles.length + assetList.length;
  const totalBytes = parts.reduce((n, p) => n + p.walked.totals.bytes, 0) + mediaBytes + assetBytes;
  const leftOut: LeftOut[] = [];
  const leftTotal = { files: 0, bytes: 0 };
  for (const p of parts.filter((x) => x.area === 'folder' || x.area.startsWith('also/'))) {
    const prefix = p.area === 'folder' ? '' : `${path.basename(p.root)}/`;
    for (const l of p.walked.leftOut) leftOut.push({ ...l, path: prefix + l.path });
    leftTotal.files += p.walked.leftOutTotal.files;
    leftTotal.bytes += p.walked.leftOutTotal.bytes;
  }
  leftOut.sort((a, b) => b.bytes - a.bytes);

  const manifest: BundleManifest = {
    v: MANIFEST_VERSION,
    from: { host: os.hostname(), platform: process.platform, home, version: config.version },
    project: {
      id: s.id,
      name: s.name,
      color: s.color,
      ...(s.description ? { description: s.description } : {}),
      ...(s.instructions ? { instructions: s.instructions } : {}),
      ...(s.assistant ? { assistant: s.assistant } : {}),
      ...(s.sharedKnowledge === false ? { sharedKnowledge: false } : {}),
      ...(s.wikiMemory !== undefined ? { wikiMemory: s.wikiMemory } : {}),
      ...(s.wikiDocumentLimit !== undefined ? { wikiDocumentLimit: s.wikiDocumentLimit } : {}),
      ...(s.memoryShared === false ? { memoryShared: false } : {}),
      folder: s.folder,
      ...(s.folders?.length ? { folders: s.folders } : {}),
    },
    ...(relativeTo(home, path.resolve(s.folder)) ? { rel: relativeTo(home, path.resolve(s.folder))! } : {}),
    also,
    skills,
    switches: spaceSwitches(db, id),
    notes,
    agents,
    knowledge: bases,
    kept: { pages, media: mediaItems, folders: folders.map((f) => folderPath(db, f.id, folderPaths)), assets: assetList },
    wiki: wiki ? { ...(wiki.rel ? { rel: wiki.rel } : {}) } : null,
    totals: { files: totalFiles, bytes: totalBytes },
  };

  const plan: CarryPlan = {
    project: { id: s.id, name: s.name, color: s.color, folder: s.folder },
    files: { count: folderWalk.totals.files, bytes: folderWalk.totals.bytes },
    git: folderWalk.git,
    leftOut: leftOut.slice(0, LEFT_OUT_LISTED),
    leftOutTotal: leftTotal,
    also: alsoPlan,
    skills: skills.length,
    notes: entries(db, { scope: 'repo', scopeKey: key, status: 'active', live: Date.now(), limit: 20000 }).length,
    agents: own.length,
    kept: keptCount,
    documents: { count: docCount, bytes: docBytes, leftOut: docsLeftOut },
    wiki: wikiWalk ? { files: wikiWalk.totals.files, bytes: wikiWalk.totals.bytes } : null,
    total: { files: totalFiles, bytes: totalBytes },
    ...(s.sync ? { sync: s.sync } : {}),
  };
  void folderReal;
  return { space: s, parts, media: mediaFiles, manifest, plan };
}

function peaksOf(v: unknown): number[] | undefined {
  if (typeof v !== 'string' || !v) return undefined;
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.map(Number) : undefined;
  } catch {
    return undefined;
  }
}

// ---- the plan and the bundle ---------------------------------------------------------------------------------------

/** What a project would carry (GET /api/projects/:id/carry): nothing is read, only listed. */
export async function carryPlan(db: DB, id: string, o: CarryOptions = {}): Promise<CarryPlan> {
  return (await gather(db, id, o, false)).plan;
}

/**
 * The bundle that carries a project, as a stream (GET /api/projects/:id/carry/bundle). The folders are listed before this
 * returns (so a project that cannot go is refused with an error, not a broken stream); the files are read as the stream is.
 */
export async function carryBundle(db: DB, id: string, o: CarryOptions = {}): Promise<Readable> {
  const g = await gather(db, id, o, true);
  return bundleStream(async (w: BundleWriter) => {
    await w.manifest(g.manifest);
    for (const p of g.parts) {
      for (const d of p.walked.dirs) await w.dir(p.area, d.path, d);
      for (const f of p.walked.files) await w.file(p.area, f.path, path.join(p.root, f.path));
      for (const l of p.walked.links) await w.link(p.area, l.path, l.target);
    }
    for (const m of g.media) await w.file('media', m.path, m.abs);
    for (const a of g.manifest.kept.assets) {
      const row = db.prepare('select data from page_assets where sha = ?').get(a.sha) as { data: Buffer } | undefined;
      if (row) await w.data('assets', a.sha, row.data);
    }
  });
}
