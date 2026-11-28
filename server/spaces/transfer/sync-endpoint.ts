// The endpoint side of keeping a project in sync with its copy on another machine: what this machine's copy holds now
// (its files by area, details, notes and mark), the hashes and bytes of the files the hub asks for, and the changes the hub
// makes (files written, renamed or removed, details and notes). shared/transfer.ts has the shapes; hub.ts drives them.
//
// The same functions answer the hub's own endpoint (endpoints.ts calls them directly) and other hubs (the routes below).
// Every path goes through safe.ts; a file is written to a temporary name beside it and renamed over its place only when
// the place still looks the way the hub saw it (`expect`), so a change made in between is never lost.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { SKILL_NAME } from '../../../shared/skillpack.ts';
import { isGroup, type Space } from '../../../shared/spaces.ts';
import type { ProjectSyncMark, SyncArea, SyncDetails, SyncFile, SyncNote, SyncState } from '../../../shared/transfer.ts';
import { HttpError } from '../../auth.ts';
import type { DB } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { deletePath, trashCopy } from '../../files.ts';
import { addEntry, deleteEntry, entries } from '../../memory/store.ts';
import { record } from '../../skillpack/history.ts';
import { spaceSkillsDir, spaceSwitches, spaceView } from '../../skillpack/spaceSkills.ts';
import { wikiMemoryOn, wikiRoot } from '../../wiki/roots.ts';
import { spaceById, updateSpace } from '../index.ts';
import { memoryKeyOf } from './carry.ts';
import { keyOf, noteHash } from './merge.ts';
import { BundleError, isSafeRel, isTemporary, joinSafe, nameProblem, relativeTo, tempBeside } from './safe.ts';
import { bundleStream, readBundle } from './stream.ts';
import { SYNC_FILE_LIMIT, walk } from './walk.ts';

export type SyncDeps = Pick<Deps, 'db' | 'broadcast'>;

const AREAS: SyncArea[] = ['folder', 'skills', 'wiki'];
const isArea = (a: unknown): a is SyncArea => AREAS.includes(a as SyncArea);
/** The most files, renames, removes or notes one request may carry. */
const MAX_OPS = 20_000;

/** What a file is as the hub saw it: the same size and time. */
export interface Expect {
  size: number;
  mtime: number;
}
export interface AskedFile {
  area: SyncArea;
  path: string;
}
export interface PullFile extends AskedFile {
  size: number;
  mtime: number;
  /** What the file it will replace on the other machine must look like (null: it must not be there); carried in its record so a push can check it. */
  expect?: Expect | null;
}
export interface PushResult {
  area: string;
  path: string;
  ok: boolean;
  /** 'changed': it was not as the hub saw it (or changed while it was read): the next round looks again. */
  why?: string;
  size?: number;
  mtime?: number;
}
export interface ApplyBody {
  rename?: { area: SyncArea; path: string; expect: Expect; to: string }[];
  remove?: { area: SyncArea; path: string; expect: Expect }[];
  details?: Partial<SyncDetails>;
  addNotes?: SyncNote[];
  forgetNotes?: string[];
}
export interface ApplyResult {
  op: 'rename' | 'remove' | 'details' | 'notes';
  area?: string;
  path?: string;
  ok: boolean;
  why?: string;
  size?: number;
  mtime?: number;
}

// ---- where a project's areas are ----------------------------------------------------------------------------

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const realOr = (p: string) => {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};

interface Roots {
  space: Space;
  /** null: the folder is not there. */
  folder: string | null;
  skills: string;
  /** null: wiki memory is off for it, or its wiki has no folder yet. */
  wiki: string | null;
  /** Wiki memory is on for it (its folder may not be made yet: it is made when a file arrives for it). */
  wikiOn: boolean;
  /** The wiki's folder inside the project's, relative: it is an area of its own. */
  skip: string[];
}

function rootsOf(db: DB, id: string): Roots {
  const space = spaceById(db, id);
  if (!space) throw new HttpError(404, 'No such project');
  if (isGroup(space)) throw new HttpError(400, 'A group can’t be kept in sync');
  const folder = isDir(space.folder) ? space.folder : null;
  let wiki: string | null = null;
  let wikiOn = false;
  try {
    wikiOn = wikiMemoryOn(db, id);
    if (wikiOn) wiki = wikiRoot(db, id);
  } catch {}
  if (wiki && !isDir(wiki)) wiki = null;
  const skip: string[] = [];
  if (wiki && folder) {
    const rel = relativeTo(realOr(folder), realOr(wiki));
    if (rel) skip.push(rel);
  }
  return { space, folder, skills: spaceSkillsDir(id), wiki, wikiOn, skip };
}

const rootOf = (r: Roots, area: SyncArea): string | null => (area === 'folder' ? r.folder : area === 'skills' ? r.skills : r.wiki);

/** Where a file may be written: the wiki's folder is made now when wiki memory is on and it is not there yet. */
function writeRootOf(d: SyncDeps, r: Roots, id: string, area: SyncArea): string | null {
  if (area === 'wiki' && !r.wiki && r.wikiOn) {
    try {
      r.wiki = wikiRoot(d.db, id, { create: true });
    } catch {}
  }
  return rootOf(r, area);
}

// ---- state ---------------------------------------------------------------------------------------------------

async function listArea(root: string, area: SyncArea, skip: string[]): Promise<SyncFile[]> {
  const w = await walk(root, area === 'folder' ? { mode: 'sync', skip, maxFiles: SYNC_FILE_LIMIT } : { mode: 'copy', maxFiles: SYNC_FILE_LIMIT });
  return w.files.map((f) => ({ area, path: f.path, size: f.size, mtime: f.mtime, mode: f.mode }));
}

/** The notes of kinds note and finding of the project's place in memory, each once. */
export function syncNotes(db: DB, folder: string): SyncNote[] {
  const out = new Map<string, SyncNote>();
  const rows = entries(db, { scope: 'repo', scopeKey: memoryKeyOf(folder), status: 'active', kinds: ['note', 'finding'], live: Date.now(), limit: 20000 });
  for (const e of rows.reverse()) {
    if (e.kind !== 'note' && e.kind !== 'finding') continue;
    const hash = noteHash(e.kind, e.text);
    if (out.has(hash)) continue;
    out.set(hash, { hash, kind: e.kind, text: e.text, ...(e.title ? { title: e.title } : {}), createdAt: e.createdAt, ...(e.kind === 'finding' && e.finding ? { finding: e.finding } : {}) });
  }
  return [...out.values()];
}

export const detailsOf = (s: Space): SyncDetails => ({ name: s.name, color: s.color, ...(s.description ? { description: s.description } : {}), ...(s.instructions ? { instructions: s.instructions } : {}) });

/** What this machine's copy holds now. Throws (in words) when its folder has too many files to keep in step. */
export async function syncState(d: SyncDeps, id: string): Promise<SyncState> {
  const r = rootsOf(d.db, id);
  const [folder, skills, wiki] = await Promise.all([
    r.folder ? listArea(r.folder, 'folder', r.skip) : null,
    // No skills folder yet is no skills, not an area that is missing.
    isDir(r.skills) ? listArea(r.skills, 'skills', []) : [],
    // Wiki memory on but no wiki folder yet is an empty wiki, not one that is missing.
    r.wiki ? listArea(r.wiki, 'wiki', []) : r.wikiOn ? [] : null,
  ]);
  return { details: detailsOf(r.space), files: { folder, skills, wiki }, notes: syncNotes(d.db, r.folder ?? r.space.folder), mark: r.space.sync ?? null };
}

// ---- hashes and bytes ----------------------------------------------------------------------------------------

function hashFile(file: string): Promise<string | null> {
  return new Promise((resolve) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file);
    s.on('data', (c) => h.update(c));
    s.on('error', () => resolve(null));
    s.on('end', () => resolve(h.digest('hex')));
  });
}

function checkedFiles<T extends AskedFile>(v: unknown, what: string): T[] {
  if (!Array.isArray(v)) throw new HttpError(400, `${what}: a list of files`);
  if (v.length > MAX_OPS) throw new HttpError(400, `${what}: at most ${MAX_OPS} files at once`);
  for (const f of v) if (!f || !isArea((f as AskedFile).area) || !isSafeRel((f as AskedFile).path)) throw new HttpError(400, `${what}: each file has an area (folder, skills or wiki) and a relative path`);
  return v as T[];
}

/** The content hash of each file asked for (sha256, hex), by `area\npath`; null when it cannot be read. */
export async function syncHashes(d: SyncDeps, id: string, files: unknown): Promise<{ hashes: Record<string, string | null> }> {
  const r = rootsOf(d.db, id);
  const list = checkedFiles<AskedFile>(files, 'files');
  const hashes: Record<string, string | null> = {};
  const links = new Map<string, boolean>();
  let next = 0;
  const worker = async () => {
    for (let f = list[next++]; f; f = list[next++]) {
      const root = rootOf(r, f.area);
      hashes[keyOf(f.area, f.path)] = root && !(await viaLink(root, f.path, links)) ? await hashFile(joinSafe(root, f.path)) : null;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { hashes };
}

/**
 * Whether each path asked for is there (no file is read): its size and time (ms), or null when nothing is there. A path that is
 * not in the state's listing may still be on disk (Git ignores it now, or its folder became a Python environment): the hub asks
 * before it takes "not listed" for "deleted". Anything at the path counts (a folder or a link too); one behind a link is null.
 */
export async function syncStats(d: SyncDeps, id: string, files: unknown): Promise<{ stats: Record<string, Expect | null> }> {
  const r = rootsOf(d.db, id);
  const list = checkedFiles<AskedFile>(files, 'files');
  const stats: Record<string, Expect | null> = {};
  const links = new Map<string, boolean>();
  for (const f of list) {
    const root = rootOf(r, f.area);
    let out: Expect | null = null;
    if (root) {
      const parts = f.path.split('/');
      if (parts.length === 1 || !(await viaLink(root, parts.slice(0, -1).join('/'), links))) {
        const st = await fs.promises.lstat(joinSafe(root, f.path)).catch(() => null);
        if (st) out = { size: st.size, mtime: rounded(st) };
      }
    }
    stats[keyOf(f.area, f.path)] = out;
  }
  return { stats };
}

/**
 * A bundle (no manifest) of the files asked for, each with its record's `expect` as given. A file that is not what the hub listed
 * any more (another size or time, or gone) is not sent: the puller sees it missing and the next round looks again.
 */
export function syncPull(d: SyncDeps, id: string, files: unknown): Readable {
  const r = rootsOf(d.db, id);
  const list = checkedFiles<PullFile>(files, 'files');
  const links = new Map<string, boolean>();
  return bundleStream(async (w) => {
    for (const f of list) {
      const root = rootOf(r, f.area);
      if (!root || (await viaLink(root, f.path, links))) continue;
      const abs = joinSafe(root, f.path);
      let st: fs.Stats;
      try {
        st = await fs.promises.lstat(abs);
      } catch {
        continue;
      }
      if (!st.isFile() || st.size !== f.size || Math.round(st.mtimeMs) !== f.mtime) continue;
      if (!w.open) return;
      await w.file(f.area, f.path, abs, f.expect === undefined ? {} : { expect: f.expect });
    }
  });
}

// ---- writing -------------------------------------------------------------------------------------------------

const skillOf = (area: string, p: string): string | null => {
  if (area !== 'skills') return null;
  const m = /^([^/]+)\/SKILL\.md$/.exec(p);
  return m && SKILL_NAME.test(m[1]) ? m[1] : null;
};
const readText = (f: string): string | null => {
  try {
    return fs.statSync(f).size <= 1_000_000 ? fs.readFileSync(f, 'utf8') : null;
  } catch {
    return null;
  }
};
const rounded = (st: fs.Stats) => Math.round(st.mtimeMs);
const same = (st: fs.Stats, e: Expect) => st.isFile() && st.size === e.size && rounded(st) === e.mtime;

/**
 * Whether a symbolic link lies on the way from the area's root down to `rel`, the target itself included: no sync operation may
 * read, write, rename or remove through one (the project's own links, say data → /mnt/disk, are not the other machine's to
 * follow, and a file it sends must not land outside the area). Every component that exists is looked at with lstat, once per
 * folder in `cache`; the walk leaves links out of the state, so in normal use nothing is refused.
 */
async function viaLink(root: string, rel: string, cache: Map<string, boolean>): Promise<boolean> {
  let at = root;
  for (const part of rel.split('/')) {
    at = path.join(at, part);
    let link = cache.get(at);
    if (link === undefined) {
      const st = await fs.promises.lstat(at).catch(() => null);
      // What is not there is no link, and nothing below it is either.
      if (!st) return false;
      link = st.isSymbolicLink();
      // Only what is a folder or a link is kept: a path that was not there may become one.
      cache.set(at, link);
    }
    if (link) return true;
  }
  return false;
}

/** Why a path may not be written, or null. */
function refused(area: SyncArea, p: string): string | null {
  const parts = p.split('/');
  if (area === 'folder' && parts.includes('.git')) return 'git';
  if (parts.some(isTemporary)) return 'temporary';
  const bad = parts.map((x) => nameProblem(x)).find(Boolean);
  return bad ? 'name' : null;
}

/** The skills' views and pages hear that they changed. */
function skillsChanged(d: SyncDeps, id: string) {
  try {
    spaceView(id, [], spaceSwitches(d.db, id));
  } catch {}
  d.broadcast({ t: 'feature', id: 'skillpack', data: { space: id } });
}

/**
 * Files from a bundle (the hub's pull from the other machine): each is written to a temporary name beside its place, checked,
 * and renamed over it only when the place still is what its record's `expect` says; its time is the sender's. Nothing is
 * left behind when it fails: the results say what was written (a broken bundle throws).
 */
export async function syncPush(d: SyncDeps, id: string, stream: Readable, o: { signal?: AbortSignal } = {}): Promise<{ results: PushResult[] }> {
  const r = rootsOf(d.db, id);
  const results: PushResult[] = [];
  const temps = new Set<string>();
  const links = new Map<string, boolean>();
  let skills = false;
  try {
    await readBundle(
      stream,
      {
        async file(rec, body) {
          const res: PushResult = { area: rec.area, path: rec.path, ok: false };
          results.push(res);
          if (!isArea(rec.area)) return void (res.why = 'area');
          const root = writeRootOf(d, r, id, rec.area);
          if (!root) return void (res.why = rec.area === 'folder' ? 'no folder' : 'not here');
          const why = refused(rec.area, rec.path);
          if (why) return void (res.why = why);
          if (await viaLink(root, rec.path, links)) return void (res.why = 'link');
          const target = joinSafe(root, rec.path);
          const tmp = tempBeside(target);
          try {
            await fs.promises.mkdir(path.dirname(target), { recursive: true });
            temps.add(tmp);
            await pipeline(body, fs.createWriteStream(tmp, { flags: 'wx', mode: 0o600 }));
          } catch (e) {
            temps.delete(tmp);
            await fs.promises.rm(tmp, { force: true }).catch(() => {});
            // The stream's own failure goes on to the reader; a disk's is this file's.
            if (e instanceof BundleError || (e as Error).message === 'Cancelled') throw e;
            return void (res.why = (e as Error).message);
          }
          return async ({ void: dropped }) => {
            try {
              if (dropped) return void (res.why = 'changed');
              const expect = rec.expect ?? null;
              let now: fs.Stats | null = null;
              try {
                now = await fs.promises.lstat(target);
              } catch {}
              if (expect === null ? now : !now || !same(now, expect)) return void (res.why = 'changed');
              const skill = skillOf(rec.area, rec.path);
              const before = skill ? readText(target) : null;
              const after = skill ? readText(tmp) : null;
              const mtime = rec.mtime / 1000;
              await fs.promises.chmod(tmp, (rec.mode | 0o600) & 0o777);
              await fs.promises.utimes(tmp, mtime, mtime);
              await fs.promises.rename(tmp, target);
              temps.delete(tmp);
              // Read back after the time is set: it is what the hub keeps as this side's stat.
              const st = await fs.promises.lstat(target);
              res.ok = true;
              res.size = st.size;
              res.mtime = rounded(st);
              if (rec.area === 'skills') skills = true;
              if (skill && after !== null) record(d.db, { name: skill, action: before === null ? 'create' : 'update', before, after, space: id });
            } catch (e) {
              res.why = (e as Error).message;
            } finally {
              if (temps.delete(tmp)) await fs.promises.rm(tmp, { force: true }).catch(() => {});
            }
          };
        },
      },
      { signal: o.signal },
    );
  } finally {
    for (const t of temps) await fs.promises.rm(t, { force: true }).catch(() => {});
    if (skills) skillsChanged(d, id);
  }
  return { results };
}

let lastTrash = 0;
/** A file into the Trash (a copy of it there, and the file removed, when the Trash is on another disk). */
async function trash(abs: string) {
  // The Trash names what it takes by the millisecond and the file's name: two removals never share one.
  while (Date.now() === lastTrash) await new Promise((r) => setTimeout(r, 1));
  lastTrash = Date.now();
  try {
    await deletePath(abs);
  } catch (e) {
    if ((e as HttpError).status !== 409) throw e;
    await trashCopy(abs);
    await fs.promises.rm(abs, { force: true });
  }
}

/** The changes the hub makes: renames (a conflict's loser), removals (to the Trash), details and notes. */
export async function syncApply(d: SyncDeps, id: string, body: ApplyBody): Promise<{ results: ApplyResult[] }> {
  const r = rootsOf(d.db, id);
  const b = (body ?? {}) as ApplyBody;
  const results: ApplyResult[] = [];
  const links = new Map<string, boolean>();
  let skills = false;
  for (const k of ['rename', 'remove', 'addNotes', 'forgetNotes'] as const) if (b[k] !== undefined && (!Array.isArray(b[k]) || (b[k] as unknown[]).length > MAX_OPS)) throw new HttpError(400, `${k}: a list of at most ${MAX_OPS}`);

  for (const op of b.rename ?? []) {
    const res: ApplyResult = { op: 'rename', area: op.area, path: op.path, ok: false };
    results.push(res);
    try {
      if (!isArea(op.area) || !isSafeRel(op.path) || !isSafeRel(op.to)) throw new Error('path');
      const root = writeRootOf(d, r, id, op.area);
      if (!root) throw new Error('not here');
      const why = refused(op.area, op.to);
      if (why) throw new Error(why);
      if ((await viaLink(root, op.path, links)) || (await viaLink(root, op.to, links))) throw new Error('link');
      const from = joinSafe(root, op.path);
      const to = joinSafe(root, op.to);
      const st = await fs.promises.lstat(from).catch(() => null);
      if (!st || !op.expect || !same(st, op.expect)) throw new Error('changed');
      if (await fs.promises.lstat(to).catch(() => null)) throw new Error('taken');
      await fs.promises.mkdir(path.dirname(to), { recursive: true });
      await fs.promises.rename(from, to);
      const now = await fs.promises.lstat(to);
      res.ok = true;
      res.size = now.size;
      res.mtime = rounded(now);
      if (op.area === 'skills') skills = true;
    } catch (e) {
      res.why = (e as Error).message;
    }
  }

  for (const op of b.remove ?? []) {
    const res: ApplyResult = { op: 'remove', area: op.area, path: op.path, ok: false };
    results.push(res);
    try {
      if (!isArea(op.area) || !isSafeRel(op.path)) throw new Error('path');
      const root = rootOf(r, op.area);
      if (!root) throw new Error('not here');
      if (await viaLink(root, op.path, links)) throw new Error('link');
      const abs = joinSafe(root, op.path);
      const st = await fs.promises.lstat(abs).catch(() => null);
      // Already gone: what was asked is so.
      if (!st) {
        res.ok = true;
        continue;
      }
      if (!op.expect || !same(st, op.expect)) throw new Error('changed');
      const skill = skillOf(op.area, op.path);
      const text = skill ? readText(abs) : null;
      await trash(abs);
      res.ok = true;
      if (op.area === 'skills') skills = true;
      if (skill && text !== null) record(d.db, { name: skill, action: 'remove', before: text, after: null, space: id });
    } catch (e) {
      res.why = (e as Error).message;
    }
  }
  if (skills) skillsChanged(d, id);

  if (b.details && typeof b.details === 'object') {
    const res: ApplyResult = { op: 'details', ok: false };
    results.push(res);
    try {
      const put: Record<string, unknown> = {};
      for (const k of ['name', 'color', 'description', 'instructions'] as const) if (typeof b.details[k] === 'string') put[k] = b.details[k];
      updateSpace(d.db, id, put);
      d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
      res.ok = true;
    } catch (e) {
      res.why = (e as Error).message;
    }
  }

  if (b.addNotes?.length || b.forgetNotes?.length) {
    const res: ApplyResult = { op: 'notes', ok: true };
    results.push(res);
    const place = { scope: 'repo' as const, scopeKey: memoryKeyOf(r.folder ?? r.space.folder) };
    const live = () => entries(d.db, { ...place, status: 'active', kinds: ['note', 'finding'], limit: 20000 });
    try {
      const have = new Set(live().map((e) => noteHash(e.kind, e.text)));
      for (const n of b.addNotes ?? []) {
        if (!n || typeof n.text !== 'string' || (n.kind !== 'note' && n.kind !== 'finding') || have.has(noteHash(n.kind, n.text))) continue;
        try {
          // A finding without its data cannot be made.
          if (n.kind === 'finding' && !n.finding) {
            res.ok = false;
            res.why = 'a finding without its data';
            continue;
          }
          const e = addEntry(d.db, { scope: 'repo', scopeKey: place.scopeKey, text: n.text, kind: n.kind, title: n.title, ...(n.kind === 'finding' ? { finding: n.finding as never } : {}) }, { source: 'auto', at: Number(n.createdAt) || Date.now(), why: 'Kept in step with its copy on another machine' });
          have.add(noteHash(e.kind, e.text));
        } catch (e) {
          res.ok = false;
          res.why = (e as Error).message;
        }
      }
      const gone = new Set((b.forgetNotes ?? []).map(String));
      if (gone.size) for (const e of live()) if (gone.has(noteHash(e.kind, e.text))) deleteEntry(d.db, e.id, { source: 'auto', why: 'Forgotten on its copy on another machine' });
      d.broadcast({ t: 'feature', id: 'memory', data: { changed: true } });
    } catch (e) {
      res.ok = false;
      res.why = (e as Error).message;
    }
  }
  return { results };
}

// ---- the mark ------------------------------------------------------------------------------------------------

const STATES = new Set(['ok', 'syncing', 'waiting', 'held', 'error']);

/** A mark as the hub gave it, with only the fields it has. */
function checkedMark(v: unknown): ProjectSyncMark | null {
  if (v === null) return null;
  const m = v as Partial<ProjectSyncMark> | undefined;
  if (!m || typeof m !== 'object' || typeof m.link !== 'string' || !m.link || !m.by || typeof m.by.id !== 'string' || typeof m.by.name !== 'string' || !m.peer || typeof m.peer.name !== 'string' || typeof m.peer.project !== 'string' || !STATES.has(String(m.state)))
    throw new HttpError(400, 'mark: null, or { link, by: { id, name }, peer: { name, project, projectName }, state }');
  return {
    link: m.link,
    by: { id: m.by.id, name: m.by.name.slice(0, 80) },
    peer: { name: m.peer.name.slice(0, 80), project: m.peer.project, projectName: String(m.peer.projectName ?? '').slice(0, 80) },
    ...(typeof m.at === 'number' ? { at: m.at } : {}),
    state: m.state!,
    ...(typeof m.error === 'string' && m.error ? { error: m.error.slice(0, 500) } : {}),
    ...(Array.isArray(m.conflicts) && m.conflicts.length ? { conflicts: m.conflicts.slice(0, 10).map((c) => ({ path: String(c.path).slice(0, 300), copy: String(c.copy).slice(0, 300), at: Number(c.at) || 0 })) } : {}),
  };
}

/** Sets or clears the project's mark (only here: PATCH /api/projects/:id leaves it alone). Returns whether it changed. */
export function setSyncMark(d: SyncDeps, id: string, mark: unknown, ifLink?: string): boolean {
  const m = checkedMark(mark);
  const s = spaceById(d.db, id);
  if (!s) throw new HttpError(404, 'No such project');
  // `ifLink`: only when the mark now is that link's (a link that ended must not clear what another one wrote).
  if (ifLink && s.sync?.link !== ifLink) return false;
  if (JSON.stringify(s.sync ?? null) === JSON.stringify(m)) return false;
  const { sync: _was, ...rest } = s;
  d.db.prepare('update spaces set data = ? where id = ?').run(JSON.stringify(m ? { ...rest, sync: m } : rest), id);
  d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
  return true;
}

// ---- the routes ----------------------------------------------------------------------------------------------

export function syncRoutes(d: Deps) {
  const id = (req: { params: unknown }) => String((req.params as { id: string }).id);
  const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
  d.app.get('/api/projects/:id/sync/state', async (req) => syncState(d, id(req)));
  d.app.post('/api/projects/:id/sync/hashes', async (req) => (body(req).stat === true ? syncStats(d, id(req), body(req).files) : syncHashes(d, id(req), body(req).files)));
  d.app.post('/api/projects/:id/sync/pull', { compress: false } as object, async (req, reply) => {
    const stream = syncPull(d, id(req), body(req).files);
    reply.raw.once('close', () => stream.destroy());
    return reply.header('content-type', 'application/x-hydor-bundle').header('cache-control', 'no-store').send(stream);
  });
  d.app.post('/api/projects/:id/sync/push', async (req) => {
    const stream = req.body as unknown;
    if (!(stream instanceof Readable)) throw new HttpError(415, 'The body is the bundle itself: send it as application/octet-stream');
    const ac = new AbortController();
    req.raw.once('close', () => {
      if (!req.raw.complete) ac.abort();
    });
    try {
      return await syncPush(d, id(req), stream, { signal: ac.signal });
    } catch (e) {
      if (e instanceof BundleError) throw new HttpError(400, `The bundle is broken: ${e.message}`);
      throw e;
    }
  });
  d.app.post('/api/projects/:id/sync/apply', async (req) => syncApply(d, id(req), body(req) as ApplyBody));
  d.app.put('/api/projects/:id/sync/mark', async (req) => {
    const link = body(req).link;
    setSyncMark(d, id(req), body(req).mark === undefined ? null : body(req).mark, typeof link === 'string' && link ? link : undefined);
    return { mark: spaceById(d.db, id(req))?.sync ?? null };
  });
}
