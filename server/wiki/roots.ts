// Where wiki memory lives: whether it is on for a project (or the shared wiki), and its folder.
//
// Every wiki folder resolves (real path) inside the hub (the one absolute path, from Settings) or inside its
// project's own folder. Nothing an agent can write (a `- Wiki:` line in AGENTS.md, an entry in wikis.json) can point
// a wiki anywhere else: a path that is absolute, starts with ~, climbs with .., goes through a hidden folder or leads
// out through a symbolic link (or to the hub itself) is refused (a binding in AGENTS.md is then ignored, a registry entry is an error).
// Only a project has its own wiki: a session in a folder that is not a project uses the shared wiki, whatever the
// folder holds (a .wiki folder, an AGENTS.md line).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { allSpaces, spaceById } from '../spaces/index.ts';
import { projectOfFolder } from '../spaces/found.ts';
import { wikiSettings } from './settings/settings.ts';

const SKIP = new Set(['.git', '.archive', '.history', '.sessions']);
const RETIRED = ['archived', 'superseded', 'retired'];

/** Wiki memory is on for the shared wiki (space null) as Settings says, and for a project unless it says otherwise. */
export function wikiMemoryOn(db: DB, space: string | null): boolean {
  const on = wikiSettings(db).enabled;
  if (!space) return on;
  return spaceById(db, space)?.wikiMemory ?? on;
}

/** The project a session's wiki memory belongs to: its own project, else the one its folder is in; null: the shared wiki. */
export function wikiSpaceOfSession(db: DB, key: string, cwd?: string): string | null {
  // The session's own project, else that of the session that started it (as knowledge scopes it).
  let x = sessionExtra(db, key);
  for (let i = 0; i < 8 && typeof x.space !== 'string' && typeof x.parent === 'string'; i++) x = sessionExtra(db, x.parent);
  const own = typeof x.space === 'string' ? x.space : null;
  if (own && spaceById(db, own)) return own;
  if (!cwd) return null;
  return projectOfFolder(allSpaces(db), cwd, os.homedir())?.id ?? null;
}

const inside = (base: string, target: string) => {
  const rel = path.relative(base, target);
  return !!rel && rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
};

/**
 * A relative path of plain folder names, or null: nothing absolute or starting with ~, no `..`, no backslashes or
 * control characters, and no Git, archive, session or Hydor-internal folder (other hidden names, like .wiki, are fine).
 */
export function plainRelative(spec: string): string[] | null {
  if (typeof spec !== 'string' || !spec.trim() || spec.length > 500 || /[\0\r\n\\]/.test(spec)) return null;
  const s = spec.trim();
  if (s.startsWith('/') || s.startsWith('~') || /^[a-z]:/i.test(s)) return null;
  const parts = s.split('/').filter((p) => p && p !== '.');
  if (!parts.length) return null;
  for (const p of parts) if (p === '..' || SKIP.has(p.toLowerCase()) || p.toLowerCase().startsWith('.hydor-')) return null;
  return parts;
}

/**
 * `target` (lexically under `base`, a real path) as a real path still inside `base`: every part that exists is looked
 * at, so a symbolic link leading out refuses it. With `create`, missing folders are made; otherwise null when missing.
 */
function within(base: string, target: string, create: boolean): string | null {
  if (!inside(base, target)) throw new Error('A wiki folder must be inside its hub or project');
  let current = base;
  for (const part of path.relative(base, target).split(path.sep)) {
    current = path.join(current, part);
    let st: fs.Stats | undefined;
    try {
      st = fs.lstatSync(current);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (!st) {
      if (!create) return null;
      fs.mkdirSync(current, { mode: 0o700 });
      continue;
    }
    if (st.isSymbolicLink()) {
      const real = fs.realpathSync(current);
      if (!inside(base, real) || !fs.statSync(real).isDirectory()) throw new Error('A wiki folder cannot lead outside its hub or project');
      current = real;
    } else if (!st.isDirectory()) throw new Error('A wiki folder is not a folder');
  }
  const real = fs.realpathSync(current);
  if (!inside(base, real)) throw new Error('A wiki folder cannot lead outside its hub or project');
  return real;
}

/** A wiki folder with the folders it keeps (made when `create`). */
function prepared(root: string, create: boolean): string {
  if (create) for (const d of ['wiki', 'raw']) fs.mkdirSync(path.join(root, d), { recursive: true, mode: 0o700 });
  return root;
}

/**
 * The shared wiki's folder (Settings → Memory → Wiki memory → folder), its real path, whatever the switches say:
 * null while it does not exist and `create` is not given. Session checkpoints live under it too.
 */
export function hubDir(db: DB, o: { create?: boolean } = {}): string | null {
  const hub = path.resolve(wikiSettings(db).hubPath);
  if (!path.isAbsolute(hub)) throw new Error('The wiki hub must be an absolute path');
  if (!fs.existsSync(hub)) {
    if (!o.create) return null;
    fs.mkdirSync(hub, { recursive: true, mode: 0o700 });
  }
  const real = fs.realpathSync(hub);
  if (!fs.statSync(real).isDirectory()) throw new Error('The wiki hub is not a folder');
  return real;
}

// ---- projects' folder names in the hub --------------------------------------------------------------------------

const tables = new WeakSet<DB>();
function projectDirs(db: DB) {
  if (tables.has(db)) return;
  db.exec('create table if not exists wiki_project_dirs (space text primary key, dir text not null unique)');
  tables.add(db);
}

const slug = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30).replace(/-$/, '') || 'project';

/** A project's folder name in the hub (shop-website-1a2b3c): chosen once and kept, so renaming the project does not move it. */
export function projectDir(db: DB, space: string, name: string): string {
  projectDirs(db);
  const row = db.prepare('select dir from wiki_project_dirs where space = ?').get(space) as { dir: string } | undefined;
  if (row) return row.dir;
  const id = space.replace(/^sp/, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  for (let n = 6; ; n += 2) {
    const dir = `${slug(name)}-${id.slice(0, n)}`;
    if (!db.prepare('select 1 from wiki_project_dirs where dir = ?').get(dir)) {
      db.prepare('insert into wiki_project_dirs (space, dir) values (?, ?)').run(space, dir);
      return dir;
    }
    if (n > id.length) throw new Error('No folder name for the project wiki');
  }
}

// ---- bindings and the registry ----------------------------------------------------------------------------------

/** The wiki folder a project's AGENTS.md names (`- Wiki: \`knowledge/wiki\``), as written, or undefined. Only read: whether it is allowed is roots' call. */
export function projectBinding(folder: string): string | undefined {
  try {
    const file = path.join(folder, 'AGENTS.md');
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 128 * 1024) return undefined;
    const m = /^\s*-\s*Wiki:\s*`([^`\r\n]+)`/im.exec(fs.readFileSync(file, 'utf8'));
    return m ? m[1].replace(/\/_index\.md$/, '') : undefined;
  } catch {
    return undefined;
  }
}

/** A project's folder, its real path, or null when it has none on this computer. */
function projectBase(folder: string | undefined): string | null {
  if (!folder || !path.isAbsolute(folder)) return null;
  try {
    const real = fs.realpathSync(folder);
    return fs.statSync(real).isDirectory() ? real : null;
  } catch {
    return null;
  }
}

/** A project's wiki folder by its AGENTS.md binding: relative, inside the project; null when there is none or it is not allowed. */
function boundRoot(folder: string, base: string, hub: string | null, create: boolean): { root: string | null } | null {
  const spec = projectBinding(folder);
  const parts = spec === undefined ? null : plainRelative(spec);
  if (!parts) return null;
  try {
    const target = path.join(base, ...parts);
    if (!inside(base, target) || (hub && (target === hub || inside(target, hub)))) return null;
    return { root: within(base, target, create) };
  } catch {
    return null;
  }
}

/** The wiki folder of a registered wiki (<hub>/wikis.json), by name: relative paths inside the hub only. Null while missing. */
export function namedWikiRoot(db: DB, name: string): string | null {
  const hub = hubDir(db);
  if (!hub) return null;
  if (name === 'hub') return hub;
  const file = path.join(hub, 'wikis.json');
  let text: string;
  try {
    const st = fs.lstatSync(file);
    if (!st.isFile() || st.size > 8 * 1024 * 1024) throw new Error('not a file');
    text = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error('Wiki is not registered');
  }
  let registry: { wikis?: Record<string, { path?: unknown; status?: unknown }> };
  try { registry = JSON.parse(text); } catch { throw new Error('Wiki is not registered'); }
  const entry = registry.wikis && Object.hasOwn(registry.wikis, name) ? registry.wikis[name] : undefined;
  if (!entry || typeof entry !== 'object') throw new Error('Wiki is not registered');
  if (RETIRED.includes(String(entry.status ?? '').toLowerCase())) throw new Error('Archived wikis are excluded');
  const spec = typeof entry.path === 'string' ? entry.path.replace(/^<HUB>\/?/, '') : `topics/${name}`;
  const parts = plainRelative(spec);
  // The projects' own wikis are not named wikis: each stays with its project.
  if (!parts || parts[0].toLowerCase() === 'projects') throw new Error('A registered wiki must be a relative folder inside the hub');
  const root = within(hub, path.join(hub, ...parts), false);
  if (!root) throw new Error('Wiki root does not exist');
  const config = path.join(root, 'config.md');
  if (fs.existsSync(config) && /^---\s*\r?\n[\s\S]*?^document_status\s*:\s*["']?(?:archived|superseded|retired)/im.test(fs.readFileSync(config, 'utf8'))) throw new Error('Retired wiki is excluded');
  return root;
}

/**
 * The wiki's folder, its real path: the shared wiki (space null) or a project's. Null while wiki memory is off for
 * it, or while the folder does not exist and `create` is not given; with `create`, made with wiki/ and raw/.
 * Throws when the folder would lie outside the hub or the project.
 */
export function wikiRoot(db: DB, space: string | null, o: { create?: boolean } = {}): string | null {
  if (!wikiMemoryOn(db, space)) return null;
  const create = !!o.create;
  if (!space) {
    const hub = hubDir(db, { create });
    return hub ? prepared(hub, create) : null;
  }
  const project = spaceById(db, space);
  if (!project) return null;
  const settings = wikiSettings(db);
  const base = projectBase(project.folder);
  // A binding in the project's own folder wins when it is allowed.
  const bound = base ? boundRoot(project.folder, base, hubDir(db), create) : null;
  if (bound) return bound.root ? prepared(bound.root, create) : null;
  if (settings.projectWikis === 'folder') {
    if (!base) return null;
    const parts = plainRelative(settings.projectPath);
    if (!parts) throw new Error('The project wiki path must be inside the project');
    const root = within(base, path.join(base, ...parts), create);
    return root ? prepared(root, create) : null;
  }
  const hub = hubDir(db, { create });
  if (!hub) return null;
  const root = within(hub, path.join(hub, 'projects', projectDir(db, space, project.name)), create);
  return root ? prepared(root, create) : null;
}
