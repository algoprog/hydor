// Making a project from a bundle (POST /api/projects/arrive): everything is written into staging folders first (beside the
// place for the project's folder, under the data folder for the rest), every hash and the end totals are checked, and only
// then is the folder renamed into place and the project made with what it carries (skills, wiki, knowledge, pictures, kept
// things, notes, agents). Any failure, a broken stream or a cancel undoes all of it: no project, no staged folder.
import fs from 'node:fs';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SKILL_NAME } from '../../../shared/skillpack.ts';
import type { Arrived, ArrivalPlace, SendHow } from '../../../shared/transfer.ts';
import { allAssistants, findAssistant, saveAssistant, removeAssistant, taskRoot } from '../../assistants/store.ts';
import { HttpError } from '../../auth.ts';
import { config } from '../../config.ts';
import type { DB } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { fileHash } from '../../filemove.ts';
import { addSource, baseRows, createBase, deleteBase, filesDir } from '../../knowledge/store.ts';
import { dropVectorBlocks, scanSoon } from '../../knowledge/indexer.ts';
import { addMedia, deleteMedia, initMedia, setCaption } from '../../media/store.ts';
import { remakeStills } from '../../media/versions.ts';
import { addEntry, deleteEntry, entries, eraseEntry, sameText } from '../../memory/store.ts';
import { putAsset } from '../../pages/assets.ts';
import { makeFolder, putInFolder } from '../../pages/folders.ts';
import { pictureAddress } from '../../pages/kept-pictures.ts';
import type { PageKind } from '../../pages/kinds.ts';
import { createPage, deletePage, initPages } from '../../pages/store.ts';
import { record } from '../../skillpack/history.ts';
import { clearSpaceSwitches, setSpaceSwitch, spaceSkillsDir } from '../../skillpack/spaceSkills.ts';
import { hubDir, wikiRoot } from '../../wiki/roots.ts';
import { attachKeptFile } from '../kept-files.ts';
import { allSpaces, createSpace, deleteSpace, spaceById, updateSpace } from '../index.ts';
import { deletePath } from '../../files.ts';
import { folderNewsOfSpace } from '../../sidebar/folders.ts';
import type { BundleManifest, ManifestKeptFile } from './carry.ts';
import { memoryKeyOf } from './carry.ts';
import { BundleError, caseInsensitive, freeSpace, homeDir, isFreePlace, joinSafe, moveDir, nameProblem, relativeTo, relParts, sizeWords, stagingName, tempBeside } from './safe.ts';
import { readBundle } from './stream.ts';
import { findingOf } from '../../../shared/findings.ts';

export type Heard = Pick<Deps, 'db' | 'broadcast'>;

export interface ArriveOptions {
  /** Where the project's folder goes: missing, or an empty folder. */
  folder: string;
  how: SendHow;
  /** The sending machine's name, for "Copied from …". */
  from: string;
  /** Where each of its other folders go ('' for one that is not sent); default: the same place under home. */
  also?: string[];
  signal?: AbortSignal;
  /** Heard as the files arrive (at most every 100 ms, and at the end). */
  onProgress?: (p: { files: number; bytes: number }) => void;
  /** For tests: called once the project is made, before the arrival ends; if it throws, everything is undone. */
  failAfterPlacing?: () => void | Promise<void>;
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'space';

const exists = (p: string) => !!fs.lstatSync(p, { throwIfNoEntry: false });
const text = (v: unknown, max = 100_000): string | undefined => (typeof v === 'string' && v ? v.slice(0, max) : undefined);

// ---- where it would go ---------------------------------------------------------------------------------------------

/**
 * Where a project arriving would go on this machine (GET /api/projects/arrival). With `rel` (its folder under the sender's
 * home): the same place under this home, or with -2, -3… after it when that is taken; without, a new project's place
 * (<task folders>/Projects/<name>, as a new project gets). `also`: the places its other folders would go under home
 * ('' when that place has files in it already).
 */
export function arrivalPlace(db: DB, q: { name?: string; rel?: string; also?: string[] }, version: string): ArrivalPlace {
  const home = homeDir();
  let folder: string;
  if (q.rel) {
    const parts = relParts(q.rel);
    const base = path.join(home, ...parts);
    folder = base;
    for (let i = 2; !isFreePlace(folder); i++) folder = `${base}-${i}`;
  } else {
    const root = path.join(taskRoot(db), 'Projects');
    const name = slug(q.name?.trim() || 'project');
    folder = path.join(root, name);
    for (let i = 2; !isFreePlace(folder); i++) folder = path.join(root, `${name}-${i}`);
  }
  const also = q.also?.map((rel) => {
    try {
      const p = path.join(home, ...relParts(rel));
      return isFreePlace(p) ? p : '';
    } catch {
      return '';
    }
  });
  return { folder, free: freeSpace(folder), home, platform: process.platform, version, ...(also ? { also } : {}) };
}

// ---- arriving ------------------------------------------------------------------------------------------------------

const firstMissing = (p: string): string | null => {
  let at = path.resolve(p);
  let missing: string | null = null;
  while (!exists(at)) {
    missing = at;
    const up = path.dirname(at);
    if (up === at) break;
    at = up;
  }
  return missing;
};

/** The staging folder of an area under the data folder. */
const areaDir = (data: string, area: string) => path.join(data, area.replace('/', '-'));

function checkManifest(m: unknown): BundleManifest {
  const x = m as BundleManifest | null;
  if (!x || typeof x !== 'object' || x.v !== 1 || !x.project || typeof x.project.name !== 'string' || !x.project.name.trim()) throw new BundleError('The bundle’s manifest is not one this version reads');
  for (const k of ['also', 'skills', 'notes', 'agents', 'knowledge'] as const) if (!Array.isArray(x[k])) throw new BundleError(`The bundle’s manifest has no ${k}`);
  if (!x.kept || !Array.isArray(x.kept.pages) || !Array.isArray(x.kept.media)) throw new BundleError('The bundle’s manifest has no kept things');
  if (!x.totals || typeof x.totals.bytes !== 'number') throw new BundleError('The bundle’s manifest has no totals');
  return x;
}

/**
 * Makes a project from a bundle. The folder must be missing or an empty folder (409); the disk must have room for it (507).
 * Returns what arrived; throws (leaving nothing behind) when the stream breaks, a hash fails or `signal` aborts.
 */
export async function arrive(d: Heard, stream: Readable, o: ArriveOptions): Promise<Arrived> {
  const { db } = d;
  if (!path.isAbsolute(o.folder)) throw new HttpError(400, 'Which folder? Give its whole path');
  const folder = path.resolve(o.folder);
  if (!isFreePlace(folder)) throw new HttpError(409, `There are files at ${folder} already: pick a new or empty folder`);
  if (!['copy', 'sync', 'move'].includes(o.how)) throw new HttpError(400, 'how: copy, sync or move');
  const parent = path.dirname(folder);
  const preexisting = exists(folder);

  // What to undo, last made first.
  const undo: (() => void | Promise<void>)[] = [];
  const rollback = async () => {
    for (const f of undo.reverse()) {
      try {
        await f();
      } catch (e) {
        console.warn(`[transfer] undoing an arrival: ${(e as Error).message}`);
      }
    }
  };
  const rm = (p: string) => fs.promises.rm(p, { recursive: true, force: true });

  const data = path.join(config.dataDir, stagingName());
  let stage = '';
  try {
    // Staging: beside the folder's place, and under the data folder.
    const top = firstMissing(parent);
    await fs.promises.mkdir(parent, { recursive: true });
    if (top)
      undo.push(async () => {
        for (let at = parent; ; at = path.dirname(at)) {
          try {
            fs.rmdirSync(at);
          } catch {
            break;
          }
          if (at === top) break;
        }
      });
    stage = path.join(parent, stagingName());
    await fs.promises.mkdir(stage);
    let stagePlaced = false;
    undo.push(() => (stagePlaced ? undefined : rm(stage)));
    await fs.promises.mkdir(data, { recursive: true });
    undo.push(() => rm(data));
    const insensitive = caseInsensitive(stage);

    let manifest: BundleManifest | null = null;
    const leftOut: string[] = [];
    let files = 0;
    let bytes = 0;
    let lastTold = 0;
    const tell = (force = false) => {
      if (!o.onProgress) return;
      const now = Date.now();
      if (!force && now - lastTold < 100) return;
      lastTold = now;
      o.onProgress({ files, bytes });
    };
    const rootOf = (area: string) => (area === 'folder' ? stage : areaDir(data, area));
    const dirs: { abs: string; mode: number; mtime: number }[] = [];
    // Names taken so far, by area, for disks that do not tell A from a; folders left out, by area.
    const taken = new Map<string, Map<string, string>>();
    const skipped = new Set<string>();

    /** Why a path cannot be had here ('' for: it is inside a folder that was left out already), or null. */
    const blocked = (area: string, rel: string): string | null => {
      const parts = rel.split('/');
      let prefix = '';
      for (const part of parts) {
        prefix = prefix ? `${prefix}/${part}` : part;
        if (skipped.has(`${area}\0${prefix}`)) return '';
        const bad = nameProblem(part);
        if (bad) return bad;
        if (insensitive) {
          const m = taken.get(area) ?? new Map<string, string>();
          taken.set(area, m);
          const low = prefix.toLowerCase();
          const was = m.get(low);
          if (was !== undefined && was !== prefix) return 'a file or folder with a name that differs only in case is there already, and this disk does not tell them apart';
          m.set(low, prefix);
        }
      }
      return null;
    };
    const say = (area: string, rel: string, why: string) => leftOut.push(`${area === 'folder' ? '' : `${area}: `}${rel}: ${why}`);

    // Nothing the bundle says may be written outside its staging roots, whatever links it carries: links are made last, only
    // where nothing is, never below or through another link, and every folder written into is looked at (lstat) first.
    const linkRecords: { area: string; path: string; target: string }[] = [];
    const linkPaths = new Map<string, Set<string>>();
    /** Every path written, and every folder above one, by area: a link may not take the place of any of them. */
    const touched = new Map<string, Set<string>>();
    const touch = (area: string, rel: string) => {
      const set = touched.get(area) ?? new Set<string>();
      touched.set(area, set);
      for (let at = rel; at && !set.has(at); at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '') set.add(at);
    };
    /** Whether the path is, or is below, a link the bundle carries. */
    const underLink = (area: string, rel: string) => {
      const set = linkPaths.get(area);
      if (!set) return false;
      for (let at = rel; at; at = at.includes('/') ? at.slice(0, at.lastIndexOf('/')) : '') if (set.has(at)) return true;
      return false;
    };
    /** Folders below an area's root checked to be real folders (not links), made when missing; false when one is not. */
    const realDirs = new Set<string>();
    const ensureDir = (root: string, parts: string[]): boolean => {
      fs.mkdirSync(root, { recursive: true });
      let at = root;
      for (const part of parts) {
        at = path.join(at, part);
        if (realDirs.has(at)) continue;
        let st = fs.lstatSync(at, { throwIfNoEntry: false });
        if (!st) {
          fs.mkdirSync(at);
          st = fs.lstatSync(at);
        }
        if (st.isSymbolicLink() || !st.isDirectory()) return false;
        realDirs.add(at);
      }
      return true;
    };
    const THROUGH_LINK = 'it is at or below a link of the bundle, which would lead it somewhere else';

    const end = await readBundle(
      stream,
      {
        manifest: async (m) => {
          if (manifest) throw new BundleError('The bundle has two manifests');
          manifest = checkManifest(m);
          const free = freeSpace(parent);
          if (free !== null && free < manifest.totals.bytes) throw new HttpError(507, `${parent} has ${sizeWords(free)} free; the project needs ${sizeWords(manifest.totals.bytes)}`);
        },
        dir: (r) => {
          if (!manifest) throw new BundleError('The bundle does not begin with its manifest');
          const why = underLink(r.area, r.path) ? THROUGH_LINK : blocked(r.area, r.path);
          if (why !== null) {
            if (why) say(r.area, r.path, why);
            skipped.add(`${r.area}\0${r.path}`);
            return;
          }
          const abs = joinSafe(rootOf(r.area), r.path);
          if (!ensureDir(rootOf(r.area), r.path.split('/'))) {
            say(r.area, r.path, 'a link or a file is in the way of this folder');
            skipped.add(`${r.area}\0${r.path}`);
            return;
          }
          touch(r.area, r.path);
          dirs.push({ abs, mode: r.mode, mtime: r.mtime });
        },
        link: (r) => {
          if (!manifest) throw new BundleError('The bundle does not begin with its manifest');
          // Kept for the end, when everything else is written; the names are checked now.
          const why = blocked(r.area, r.path);
          if (why !== null) {
            if (why) say(r.area, r.path, why);
            return;
          }
          const set = linkPaths.get(r.area) ?? new Set<string>();
          linkPaths.set(r.area, set);
          set.add(r.path);
          linkRecords.push({ area: r.area, path: r.path, target: r.target });
        },
        file: async (r, body) => {
          if (!manifest) throw new BundleError('The bundle does not begin with its manifest');
          const count = new TransformCount((n) => {
            bytes += n;
            tell();
          });
          const why = underLink(r.area, r.path) ? THROUGH_LINK : blocked(r.area, r.path);
          if (why !== null) {
            if (why) say(r.area, r.path, why);
            for await (const _ of body.pipe(count));
            bytes -= count.n;
            return;
          }
          const abs = joinSafe(rootOf(r.area), r.path);
          const at = fs.lstatSync(abs, { throwIfNoEntry: false });
          if (!ensureDir(rootOf(r.area), r.path.split('/').slice(0, -1)) || (at && (at.isSymbolicLink() || at.isDirectory()))) {
            say(r.area, r.path, 'a link or a folder is in the way of this file');
            for await (const _ of body.pipe(count));
            bytes -= count.n;
            return;
          }
          const tmp = tempBeside(abs);
          await pipeline(body, count, fs.createWriteStream(tmp, { mode: 0o600, flags: 'wx' }));
          return async (v) => {
            if (v.void) {
              bytes -= count.n;
              await fs.promises.rm(tmp, { force: true });
              say(r.area, r.path, 'it changed while it was being sent, so it was left out');
              return;
            }
            await fs.promises.rename(tmp, abs);
            touch(r.area, r.path);
            if (process.platform !== 'win32') await fs.promises.chmod(abs, r.mode & 0o777);
            const t = new Date(r.mtime);
            await fs.promises.utimes(abs, t, t);
            files++;
            tell();
          };
        },
      },
      { signal: o.signal },
    );
    tell(true);
    if (!manifest) throw new BundleError('The bundle has no manifest');
    const m: BundleManifest = manifest;
    void end;

    // Links, now that every file and folder is written and the bundle is verified.
    for (const l of linkRecords) {
      const set = linkPaths.get(l.area)!;
      const parts = l.path.split('/');
      const root = rootOf(l.area);
      const refuse = (why: string) => say(l.area, l.path, `a link, ${why}`);
      if (parts.slice(0, -1).some((_, i) => set.has(parts.slice(0, i + 1).join('/')))) {
        refuse('which is below another link of the bundle');
        continue;
      }
      if (touched.get(l.area)?.has(l.path)) {
        refuse('but a file or folder of that name is in the bundle too');
        continue;
      }
      // Its target must not go through another link (or `..` out of one): where it leads is then where it says.
      const walked = parts.slice(0, -1);
      let through = false;
      for (const part of l.target.split('/')) {
        if (!part || part === '.') continue;
        if (set.has(walked.join('/'))) through = true;
        if (part === '..') walked.pop();
        else walked.push(part);
      }
      if (through) {
        refuse('whose target goes through another link');
        continue;
      }
      try {
        if (!ensureDir(root, parts.slice(0, -1))) {
          refuse('a link or a file is in the way of its place');
          continue;
        }
        const abs = joinSafe(root, l.path);
        if (fs.lstatSync(abs, { throwIfNoEntry: false })) {
          refuse('but something is there already');
          continue;
        }
        fs.symlinkSync(l.target, abs);
      } catch {
        refuse('which this system could not make');
      }
    }

    // Folders: modes (the owner always keeps access) and times, deepest first, after everything was written into them; a link is
    // never followed.
    for (const dd of dirs.sort((a, b) => b.abs.length - a.abs.length)) {
      const st = fs.lstatSync(dd.abs, { throwIfNoEntry: false });
      if (!st?.isDirectory()) continue;
      if (process.platform !== 'win32') fs.chmodSync(dd.abs, (dd.mode & 0o777) | 0o700);
      const t = new Date(dd.mtime);
      fs.utimesSync(dd.abs, t, t);
    }
    if (o.signal?.aborted) throw new Error('Cancelled');

    // ---- placing --------------------------------------------------------------------------------------------------
    await moveDir(stage, folder);
    stagePlaced = true; // the staging folder is the project's folder now
    undo.push(async () => {
      await rm(folder);
      if (preexisting) fs.mkdirSync(folder);
    });

    // Its other folders: each to its place under home when that is free; used as it is when it has files already.
    const home = homeDir();
    const folders: string[] = [];
    for (const a of m.also) {
      const asked = o.also?.[a.index];
      if (asked === '') continue;
      let dest: string;
      try {
        dest = asked ?? path.join(home, ...relParts(a.rel));
      } catch {
        continue;
      }
      if (!path.isAbsolute(dest)) continue;
      const src = areaDir(data, `also/${a.index}`);
      if (isFreePlace(dest) && fs.existsSync(src)) {
        const made = firstMissing(dest);
        await moveDir(src, dest);
        undo.push(() => rm(made ?? dest));
      } else if (!fs.existsSync(dest)) continue;
      folders.push(dest);
    }

    const p = m.project;
    const made = createSpace(db, {
      name: p.name,
      color: p.color,
      description: p.description,
      instructions: p.instructions,
      sharedKnowledge: p.sharedKnowledge,
      wikiMemory: p.wikiMemory,
      wikiDocumentLimit: p.wikiDocumentLimit,
      memoryShared: p.memoryShared,
      folder,
      ...(folders.length ? { folders } : {}),
    });
    const id = made.id;
    undo.push(() => {
      db.prepare('delete from spaces where id = ?').run(id);
    });
    const result: Arrived = { project: { id, name: made.name, folder }, files, bytes, notes: 0, skills: 0, agents: 0, kept: 0, documents: 0, wiki: false, leftOut };

    // Skills, with their history and switches.
    const skillsStage = areaDir(data, 'skills');
    if (fs.existsSync(skillsStage)) {
      const dest = spaceSkillsDir(id);
      await moveDir(skillsStage, dest);
      undo.push(async () => {
        await rm(path.dirname(dest));
        db.prepare('delete from skillpack_history where space = ?').run(id);
        db.prepare('delete from kv where k = ?').run(`skillpack.space.${id}`);
      });
      for (const name of m.skills) {
        if (!SKILL_NAME.test(name)) continue;
        const f = path.join(dest, name, 'SKILL.md');
        if (!fs.existsSync(f)) continue;
        record(db, { name, action: 'create', before: null, after: fs.readFileSync(f, 'utf8'), space: id });
        result.skills++;
      }
    }
    for (const [key, on] of Object.entries(m.switches ?? {})) {
      const at = /^(claude|codex):(.+)$/.exec(key);
      try {
        setSpaceSwitch(db, id, { name: at ? at[2] : key, agent: at?.[1], on });
      } catch {}
    }

    // Agents of its own.
    const agentIds = new Map<string, string>();
    for (const a of m.agents) {
      try {
        const { canAsk: _c, ...def } = a.def;
        const saved = saveAssistant(db, { ...def, projects: [id] }, { why: `Arrived with the project “${made.name}” from ${o.from}` });
        agentIds.set(a.from, saved.id);
        undo.push(() => removeAssistant(db, saved.id));
        result.agents++;
      } catch (e) {
        say('folder', `agent ${a.def?.name ?? a.from}`, `could not be made again here (${(e as Error).message})`);
      }
    }
    for (const a of m.agents) {
      const now = agentIds.get(a.from);
      const ask = a.def?.canAsk?.map((x) => agentIds.get(x) ?? (findAssistant(db, x) ? x : '')).filter(Boolean);
      if (!now || !ask?.length) continue;
      const cur = findAssistant(db, now);
      if (cur) saveAssistant(db, { ...cur, canAsk: ask }, { why: 'Arrived with its project' });
    }
    const assistant = p.assistant ? (agentIds.get(p.assistant) ?? (findAssistant(db, p.assistant)?.builtin ? p.assistant : undefined)) : undefined;
    if (assistant) updateSpace(db, id, { assistant });

    // Its wiki memory.
    if (m.wiki) {
      const wikiStage = areaDir(data, 'wiki');
      updateSpace(db, id, { wikiMemory: true });
      let root: string | null = null;
      try {
        root = wikiRoot(db, id);
        const had = !!root;
        root = wikiRoot(db, id, { create: true });
        if (root && !had) undo.push(() => rm(root!));
      } catch (e) {
        say('folder', 'its wiki', `could not be placed (${(e as Error).message})`);
      }
      if (root && fs.existsSync(wikiStage)) {
        await fs.promises.cp(wikiStage, root, { recursive: true, force: true, preserveTimestamps: true, verbatimSymlinks: true });
        result.wiki = true;
      } else if (!root) say('folder', 'its wiki', 'could not be placed: wiki memory has no place for it here');
    }

    // Its own knowledge bases.
    const toIndex: string[] = [];
    for (const b of m.knowledge) {
      const base = createBase(db, { name: b.name, description: b.description, space: id });
      undo.push(() => deleteBase(db, base.id));
      toIndex.push(base.id);
      const src = areaDir(data, `knowledge/${b.id}`);
      if (b.files && fs.existsSync(src)) {
        await fs.promises.cp(src, filesDir(base.id), { recursive: true, force: true, preserveTimestamps: true, verbatimSymlinks: true });
        result.documents += countFiles(src);
      }
      for (const f of b.folders) {
        let at: string;
        try {
          at = f.rel ? joinSafe(folder, f.rel) : folder;
        } catch {
          continue;
        }
        if (fs.existsSync(at) && fs.statSync(at).isDirectory()) addSource(db, base.id, 'folder', at, f.name);
        else say('folder', f.rel || '.', `a folder the documents “${b.name}” read, which did not arrive`);
      }
      for (const out of b.outside) say('folder', out, `the documents “${b.name}” read this folder, which is outside the project and cannot be sent`);
    }

    // Kept things.
    await keep(db, d, m, id, folder, data, result, undo);

    // Memory notes: keyed by the new folder's place, now that its files (a Git root among them) are there.
    const key = memoryKeyOf(folder);
    for (const n of m.notes) {
      if (!n || typeof n.text !== 'string' || !['note', 'topic', 'profile', 'finding'].includes(n.kind)) continue;
      if (n.kind === 'note' && sameText(db, { scope: 'repo', scopeKey: key }, n.text)) continue;
      try {
        const finding = n.kind === 'finding' ? (findingOf(n.finding) ?? undefined) : undefined;
        if (n.kind === 'finding' && !finding) continue;
        const e = addEntry(db, { scope: 'repo', scopeKey: key, text: n.text, kind: n.kind, title: n.title, basis: n.basis as never, expiresAt: n.expiresAt, ...(finding ? { finding } : {}) }, { source: n.source ?? 'auto', at: n.createdAt });
        db.prepare('update memory_entries set updated_at = ? where id = ?').run(Number(n.updatedAt) || n.createdAt, e.id);
        undo.push(() => eraseEntry(db, e.id));
        result.notes++;
      } catch (e) {
        console.warn(`[transfer] a note was not kept: ${(e as Error).message}`);
      }
    }

    await o.failAfterPlacing?.();

    // It came from another machine.
    const s = spaceById(db, id)!;
    db.prepare('update spaces set data = ? where id = ?').run(JSON.stringify({ ...s, came: { from: o.from, at: Date.now(), how: o.how } }), id);

    // Done: told to the pages; the knowledge bases are read.
    d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
    if (result.skills || Object.keys(m.switches ?? {}).length) d.broadcast({ t: 'feature', id: 'skillpack', data: { space: id } });
    if (toIndex.length) {
      d.broadcast({ t: 'feature', id: 'knowledge', data: { changed: true } });
      for (const b of toIndex) scanSoon(db, b);
    }
    if (result.kept) {
      d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
      d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', reload: true } });
    }
    if (result.wiki) d.broadcast({ t: 'feature', id: 'wiki', data: { space: id } });
    await rm(data);
    return result;
  } catch (e) {
    await rollback();
    if (stage) await rm(stage).catch(() => {});
    await rm(data).catch(() => {});
    throw e;
  }
}

function countFiles(dir: string): number {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
  return n;
}

/** Counts the bytes that pass. */
class TransformCount extends Transform {
  n = 0;
  constructor(private seen: (n: number) => void) {
    super();
  }
  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: (e?: Error | null, d?: Buffer) => void) {
    this.n += chunk.length;
    this.seen(chunk.length);
    cb(null, chunk);
  }
}

// ---- kept things -----------------------------------------------------------------------------------------------------

/** The ids of the kept pages in a text of another page, as they were on the sending machine, made the new ones. */
const IDS = /\b[a-f0-9]{10}\b/g;

async function keep(db: DB, d: Heard, m: BundleManifest, id: string, folder: string, data: string, result: Arrived, undo: (() => void | Promise<void>)[]) {
  const { pages, media } = m.kept;
  if (!pages.length && !media.length && !m.kept.folders.length) return;
  initPages(db);
  initMedia(db);

  // Library folders of the project, shallowest first.
  const folderIds = new Map<string, string>();
  const paths = [...new Set([...m.kept.folders, ...pages.map((p) => p.folder), ...media.map((x) => x.folder)].filter((x): x is string => !!x))].sort((a, b) => a.split('/').length - b.split('/').length);
  undo.push(() => void db.prepare('delete from library_folders where space = ?').run(id));
  for (const p of paths) {
    const parts = p.split('/');
    const parent = parts.length > 1 ? folderIds.get(parts.slice(0, -1).join('/')) : undefined;
    if (parts.length > 1 && !parent) continue;
    try {
      folderIds.set(p, makeFolder(db, { name: parts[parts.length - 1], parent: parent ?? null, space: id }, 'number').id);
    } catch {}
  }

  // The pictures pages show (by sha: the same bytes make the same one).
  const shas = new Map<string, string>();
  for (const a of m.kept.assets) {
    const f = path.join(areaDir(data, 'assets'), a.sha);
    if (!/^[a-f0-9]{16,64}$/.test(a.sha) || !fs.existsSync(f)) continue;
    try {
      shas.set(a.sha, putAsset(db, fs.readFileSync(f), { model: a.mime.startsWith('model/') }));
    } catch {}
  }

  // The file a kept thing has in the project's folder, when it arrived: its own, as the sender had it.
  const fileOf = (k: ManifestKeptFile | undefined): { abs: string; k: ManifestKeptFile } | null => {
    if (!k) return null;
    try {
      const abs = joinSafe(folder, k.rel);
      return exists(abs) ? { abs, k } : null;
    } catch {
      return null;
    }
  };
  const forgetFiles = () => {
    for (const t of ['pages', 'media']) db.prepare(`update ${t} set project_file = null, project_file_sig = null, project_file_sha = null, project_file_auto = null, project_file_title = null where space = ?`).run(id);
  };

  const pageIds = new Map<string, string>();
  const newPages: { id: string; text: string; kind: string; version: number }[] = [];
  for (const pg of pages) {
    try {
      let body = pg.text;
      if (pg.kind === 'page') body = body.replace(/\/pg\/pic\/([a-f0-9]{16,64})\/[\w-]{16,64}/g, (all, sha: string) => (shas.has(sha) ? pictureAddress(shas.get(sha)!) : all));
      const made = createPage(db, {
        title: pg.title,
        kind: pg.kind === 'page' ? undefined : (pg.kind as PageKind),
        ...(pg.kind === 'page' ? { html: body } : { model: JSON.parse(body) }),
        by: 'made',
        space: id,
        folder: pg.folder ? (folderIds.get(pg.folder) ?? null) : null,
        description: pg.description,
        ...(pg.source ? { source: pg.source } : {}),
      });
      pageIds.set(pg.id, made.id);
      newPages.push({ id: made.id, text: body, kind: pg.kind, version: made.version });
      db.prepare('update pages set created_at = ?, updated_at = ? where id = ?').run(pg.createdAt, pg.updatedAt, made.id);
      undo.push(() => {
        forgetFiles();
        deletePage(db, made.id);
      });
      const f = fileOf(pg.file);
      if (f) attachKeptFile(db, 'page', made.id, { file: f.abs, sha: f.k.sha, auto: f.k.auto, fileTitle: f.k.title });
      result.kept++;
    } catch (e) {
      result.leftOut.push(`${pg.title}: could not be made again here as a ${pg.kind === 'page' ? 'page' : pg.kind} (${(e as Error).message}); ${pg.file ? 'its file came as a file' : 'it was left out'}`);
    }
  }
  // Pages that name one another by id: the new ids.
  if (pageIds.size && newPages.length) {
    for (const np of newPages) {
      const next = np.text.replace(IDS, (x) => pageIds.get(x) ?? x);
      if (next === np.text) continue;
      db.prepare('update page_versions set html = ?, bytes = ? where page_id = ? and version = ?').run(next, Buffer.byteLength(next), np.id, np.version);
    }
  }

  for (const it of media) {
    const staged = path.join(areaDir(data, 'media'), it.file);
    try {
      if (!/^[A-Za-z0-9._-]+$/.test(it.file) || !fs.existsSync(staged)) throw new Error('its file did not arrive');
      const sha = it.sha || (await fileHash(staged));
      const made = await addMedia(db, {
        kind: it.kind,
        from: staged,
        move: true,
        source: it.source || `sent from ${m.from.host}`,
        sha,
        ext: path.extname(it.file).slice(1) || 'bin',
        mime: it.mime,
        bytes: it.bytes,
        title: it.title,
        description: it.description,
        width: it.width,
        height: it.height,
        duration: it.duration,
        peaks: it.peaks,
        lyrics: it.lyrics,
        prompt: it.prompt,
        model: it.model,
        space: id,
      });
      undo.push(async () => {
        forgetFiles();
        await deleteMedia(db, made.id);
      });
      if (['pending', 'done', 'failed', 'edited'].includes(it.caption)) setCaption(db, made.id, { title: it.title, description: it.description, caption: it.caption as 'pending', by: it.captionBy ?? null, error: null });
      db.prepare('update media set created_at = ? where id = ?').run(it.createdAt, made.id);
      if (it.folder && folderIds.has(it.folder)) putInFolder(db, 'media', made.id, folderIds.get(it.folder)!);
      const f = fileOf(it.projectFile);
      if (f) attachKeptFile(db, 'media', made.id, { file: f.abs, sha, auto: f.k.auto, fileTitle: f.k.title, adopted: !!f.k.adopted });
      void remakeStills(made).catch(() => {});
      result.kept++;
    } catch (e) {
      result.leftOut.push(`${it.title}: could not be made again here (${(e as Error).message}); ${it.projectFile ? 'its file came as a file' : 'it was left out'}`);
    }
  }
  void d;
}

// ---- leaving ---------------------------------------------------------------------------------------------------------

/**
 * A moved project leaves this machine (POST /api/projects/:id/leave, after the copy arrived whole), without touching its other
 * work: what it kept (pages, boards, pictures, videos, sounds), its own knowledge bases (and its wiki's), its own agents, its
 * skills and its memory notes go with it instead of staying behind shared, in the library or in no project. Recoverable: the
 * folder, the skills and the dropped documents go to the Trash, the notes are marked forgotten (their history stays), an agent
 * that also works in other projects only loses this one. Conversations stay. When the Trash cannot take something (another
 * disk) it stays where it is and `kept` says so.
 */
export async function leave(d: Heard & Pick<Deps, 'sessions'> & Partial<Pick<Deps, 'scheduler'>>, id: string, o: { to?: string } = {}): Promise<{ ok: true; trashed: string | null; kept?: string }> {
  const { db } = d;
  const s = spaceById(db, id);
  if (!s) throw new HttpError(404, 'No such project');
  const stays: string[] = [];
  /** Into the Trash; false (and said) when it cannot be. */
  const trash = async (p: string, what: string): Promise<boolean> => {
    try {
      await deletePath(p);
      return true;
    } catch (e) {
      if ((e as HttpError).status !== 404) stays.push(`${what} (${p}) stays where it is: ${(e as Error).message}`);
      return (e as HttpError).status === 404;
    }
  };
  const step = async (what: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      console.warn(`[transfer] leaving: ${what}: ${(e as Error).message}`);
    }
  };

  // What it kept: its files are in the folder that goes to the Trash, so they are forgotten first (as deleteSpace does).
  await step('kept things', async () => {
    for (const [table, more] of [['pages', ''], ['media', ', project_file_adopted = null']])
      try {
        db.prepare(`update ${table} set project_file = null, project_file_sig = null, project_file_sha = null, project_file_auto = null, project_file_title = null${more} where space = ?`).run(id);
      } catch {}
    initPages(db);
    initMedia(db);
    for (const { id: page } of db.prepare('select id from pages where space = ? and app is null').all(id) as { id: string }[]) deletePage(db, page);
    for (const { id: media } of db.prepare('select id from media where space = ?').all(id) as { id: string }[]) await deleteMedia(db, media);
    db.prepare('delete from library_folders where space = ?').run(id);
  });

  // Its own knowledge bases and its wiki's: the index goes; the files dropped into them to the Trash.
  await step('knowledge', async () => {
    let any = false;
    for (const b of baseRows(db).filter((x) => x.space === id)) {
      const dropped = path.dirname(filesDir(b.id));
      if (fs.existsSync(dropped)) await trash(dropped, `the documents of “${b.name}”`);
      deleteBase(db, b.id);
      try {
        db.prepare('delete from kb_wiki_bindings where base = ?').run(b.id);
      } catch {}
      any = true;
    }
    if (any) dropVectorBlocks();
  });

  // Its skills: the folder to the Trash, not into the library.
  await step('skills', async () => {
    const dir = path.dirname(spaceSkillsDir(id));
    if (fs.existsSync(dir)) await trash(dir, 'the skills of the project');
    clearSpaceSwitches(db, id);
  });

  // Agents of its own go; one that works in other projects too only leaves this one.
  const agentsGone: string[] = [];
  await step('agents', () => {
    for (const a of allAssistants(db).filter((x) => !x.builtin && x.projects?.includes(id))) {
      const rest = (a.projects ?? []).filter((p) => p !== id);
      if (rest.length) saveAssistant(db, { ...a, projects: rest }, { why: `The project “${s.name}” moved away` });
      else {
        removeAssistant(db, a.id);
        agentsGone.push(a.id);
        for (const t of d.scheduler?.list({ boards: false }).filter((t) => t.extra?.assistant === a.id) ?? []) d.scheduler!.remove(t.id);
      }
    }
  });

  // Its memory notes are forgotten (they stay in the history), unless another project keeps notes in the same place.
  await step('notes', () => {
    const key = memoryKeyOf(s.folder);
    if (allSpaces(db).some((x) => x.id !== id && memoryKeyOf(x.folder) === key)) return;
    for (const e of entries(db, { scope: 'repo', scopeKey: key, status: 'active', limit: 20000 })) deleteEntry(db, e.id, { source: 'user', why: `Moved to ${o.to || 'another machine'}` });
  });

  // Its wiki, when it lives in the hub's projects/ (one inside the project's folder goes with the folder).
  await step('wiki', async () => {
    const root = wikiRoot(db, id);
    const hub = hubDir(db);
    if (root && hub && relativeTo(path.join(hub, 'projects'), root) !== null) await trash(root, 'the wiki of the project');
    try {
      db.prepare('delete from wiki_project_dirs where space = ?').run(id);
    } catch {}
  });

  // The project itself (what deleteSpace would have released is gone by now).
  const skills = deleteSpace(db, id);
  folderNewsOfSpace(d, id);
  d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
  d.broadcast({ t: 'feature', id: 'pages', data: { what: 'pages' } });
  d.broadcast({ t: 'feature', id: 'media', data: { what: 'media', reload: true } });
  d.broadcast({ t: 'feature', id: 'knowledge', data: { changed: true } });
  d.broadcast({ t: 'feature', id: 'skillpack', data: skills.length ? { library: true } : { space: id } });
  if (agentsGone.length) d.broadcast({ t: 'feature', id: 'assistants', data: { changed: true } });
  d.broadcast({ t: 'feature', id: 'wiki', data: { space: id } });

  let trashed: string | null = null;
  try {
    trashed = (await deletePath(s.folder)).trashed;
  } catch (e) {
    // Already gone: nothing to put in the Trash.
    if ((e as HttpError).status !== 404) stays.unshift(`${s.folder} stays where it is: ${(e as Error).message}`);
  }
  return { ok: true, trashed, ...(stays.length ? { kept: stays.join('; ') } : {}) };
}
