// Projects found in Claude Code and Codex. The folders those programs work in (started in a terminal, in VS Code or in
// their own apps) and the projects Codex keeps become projects here by themselves, so the work you did elsewhere is
// in one place with what you do here; and every session that works in a project's folder, wherever it was started,
// belongs to that project. A folder counts once at least two of Claude Code's or Codex's own sessions worked in it
// (a repository's subfolders count for the repository); a Codex project counts once a session worked in one of its
// folders. Left out as on the Projects page's suggestions (server/spaces/suggest.ts): the home folder, hidden and
// temporary folders, the ones the app makes, those in "Not a project" (a project you delete goes there too, so it is
// not made again) and those a project has already.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_FOLDERS, type FoundIn, type Space } from '../../shared/spaces.ts';
import { WORK_DIR as APPS_WORK_DIR } from '../apps/runs.ts';
import { taskRoot } from '../assistants/store.ts';
import { codexFolderNames, codexProjects } from '../codex-projects.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { parseExtra } from '../sessionExtra.ts';
import { folderNames, setSidebarPlaces, sidebarPlaces } from '../sidebar/index.ts';
import { WORKTREES_ROOT } from '../worktrees.ts';
import { allSpaces, createSpace } from './index.ts';
import { hiddenSuggestions } from './suggest.ts';

/** How many sessions of Claude Code's or Codex's own a folder needs to become a project. */
export const FOUND_MIN = 2;
/** What starts a session a program or script runs by itself (not one you work in). */
const SCRIPTED = ['sdk-cli', 'sdk-ts', 'sdk-py', 'mcp', 'exec', 'subagent'];

/** A folder a project could be made for. */
export interface FoundProject {
  folder: string;
  name: string;
  /** Codex's other folders for it. */
  folders?: string[];
  found: FoundIn[];
  /** When a session last worked in it. */
  lastAt: number;
}

/** Whether `dir` is `root` or inside it (also on Windows paths). */
const within = (dir: string, root: string) => {
  const rel = path.relative(root, dir);
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
};

const isDir = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The project the work in a folder belongs to: the one whose own folder is it or holds it, the innermost when
 * there are several. A project in the home folder or at the root of a disk has only that folder, not all you do under it.
 */
export function projectOfFolder(spaces: Space[], dir: string, home: string): Space | undefined {
  const d = path.resolve(dir);
  const h = path.resolve(home);
  let best: Space | undefined;
  let bestLen = -1;
  for (const s of spaces) {
    if (!s.folder) continue;
    const f = path.resolve(s.folder);
    const only = f === h || path.parse(f).root === f;
    if (only ? d !== f : !within(d, f)) continue;
    if (f.length > bestLen) {
      best = s;
      bestLen = f.length;
    }
  }
  return best;
}

/** A session's work folder: its worktree's main checkout, else where it ran. */
const REPO = `case when json_valid(a.worktree) then nullif(json_extract(a.worktree, '$.repo'), '') end`;

interface Row {
  key: string;
  agent: string | null;
  created_at: number | null;
  updated_at: number | null;
  /** The app's own row, when there is one. */
  has: string | null;
  extra: string | null;
  dir: string | null;
}

/**
 * Gives every session that works in a project's folder and is in no project yet (none, or one that is gone) that
 * project; returns the keys it changed. Only `keys` when given. Sessions with no row of their own yet get one with
 * the session's own times, and a row keeps its times: the session list orders by the later of the two, so
 * nothing here may count as activity.
 */
export function claimSessions(db: DB, o: { keys?: string[]; home?: string } = {}): string[] {
  const spaces = allSpaces(db);
  if (!spaces.length) return [];
  const home = path.resolve(o.home ?? config.home);
  const ids = new Set(spaces.map((s) => s.id));
  const rows: Row[] = [];
  const chunks: (string[] | undefined)[] = [];
  if (o.keys) for (let i = 0; i < o.keys.length; i += 500) chunks.push(o.keys.slice(i, i + 500));
  else chunks.push(undefined);
  for (const ks of chunks) {
    const marks = ks ? `${ks.map(() => '?').join(',')}` : '';
    rows.push(
      ...(db
        .prepare(
          `select s.key as key, s.agent as agent, s.created_at as created_at, s.updated_at as updated_at, a.key as has, a.extra as extra,
             coalesce(${REPO}, nullif(s.cwd, ''), nullif(a.cwd, '')) as dir
           from sessions s left join app_sessions a on a.key = s.key
           where s.hidden = 0 ${ks ? `and s.key in (${marks})` : ''}`,
        )
        .all(...(ks ?? [])) as Row[]),
      // Sessions of the app's with no transcript yet.
      ...(db
        .prepare(
          `select a.key as key, a.agent as agent, a.created_at as created_at, a.updated_at as updated_at, a.key as has, a.extra as extra,
             coalesce(${REPO}, nullif(a.cwd, '')) as dir
           from app_sessions a
           where not exists (select 1 from sessions s where s.key = a.key) ${ks ? `and a.key in (${marks})` : ''}`,
        )
        .all(...(ks ?? [])) as Row[]),
    );
  }
  const known = new Map<string, Space | undefined>();
  const claims: { r: Row; space: string; extra: Record<string, unknown> }[] = [];
  for (const r of rows) {
    if (!r.dir) continue;
    const extra = parseExtra(r.extra);
    if (typeof extra.space === 'string' && ids.has(extra.space)) continue;
    let sp = known.get(r.dir);
    if (!known.has(r.dir)) {
      sp = projectOfFolder(spaces, r.dir, home);
      known.set(r.dir, sp);
    }
    if (sp) claims.push({ r, space: sp.id, extra });
  }
  if (!claims.length) return [];
  const update = db.prepare('update app_sessions set extra = ? where key = ?');
  const insert = db.prepare('insert into app_sessions (key, agent, extra, created_at, updated_at) values (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const { r, space, extra } of claims) {
      const json = JSON.stringify({ ...extra, space });
      if (r.has) update.run(json, r.key);
      else insert.run(r.key, r.agent, json, r.created_at ?? r.updated_at, r.updated_at ?? r.created_at);
    }
  })();
  return claims.map((c) => c.r.key);
}

/** How a folder's work tallies up: sessions of each program, and when the last was at work. */
interface Tally {
  claude: number;
  codex: number;
  lastAt: number;
}

/** Folders worth a project of their own, the most recently at work first (nothing is made: see syncFoundProjects). */
export function foundProjects(db: DB, o: { home?: string } = {}): FoundProject[] {
  const home = path.resolve(o.home ?? config.home);
  const spaces = allSpaces(db);
  const covered = spaces
    .flatMap((s) => [s.folder, ...(s.folders ?? [])])
    .filter(Boolean)
    .map((p) => path.resolve(p));
  const made = [taskRoot(db), APPS_WORK_DIR, WORKTREES_ROOT, config.dataDir, os.tmpdir(), '/tmp', '/dev/shm']
    .filter(Boolean)
    .map((p) => path.resolve(p))
    // (not one the home folder is in)
    .filter((r) => !within(home, r));
  const hidden = new Set(hiddenSuggestions(db).map((p) => path.resolve(p)));

  // Where sessions worked: the folder, who worked there (the ones that count, apart), and when.
  const groups = db
    .prepare(
      `select s.cwd as cwd, s.agent as agent,
         (coalesce(a.created_by_app, 0) = 0 and s.agent in ('claude', 'codex') and coalesce(s.source, '') not in (${SCRIPTED.map((x) => `'${x}'`).join(', ')})) as counted,
         count(*) as n, max(coalesce(s.updated_at, 0)) as at
       from sessions s left join app_sessions a on a.key = s.key
       where s.hidden = 0 and s.cwd is not null and s.cwd != ''
       group by 1, 2, 3`,
    )
    .all() as { cwd: string; agent: string; counted: number; n: number; at: number }[];

  /** The project a folder's work belongs to: the git repository holding it (not the home folder or above), else the folder. */
  const repos = new Map<string, string>();
  const repoOf = (dir: string): string => {
    const hit = repos.get(dir);
    if (hit !== undefined) return hit;
    let root = dir;
    if (within(dir, home) && dir !== home)
      for (let d = dir; d !== home && d !== path.dirname(d); d = path.dirname(d))
        if (fs.existsSync(path.join(d, '.git'))) {
          root = d;
          break;
        }
    repos.set(dir, root);
    return root;
  };

  const tally = new Map<string, Tally>();
  for (const g of groups) {
    if (!g.counted) continue;
    const folder = repoOf(path.resolve(g.cwd));
    const t = tally.get(folder) ?? { claude: 0, codex: 0, lastAt: 0 };
    t[g.agent as 'claude' | 'codex'] += g.n;
    t.lastAt = Math.max(t.lastAt, g.at);
    tally.set(folder, t);
  }
  /** The programs behind a folder, the one with more sessions first (for a Codex project, Codex on a tie). */
  const programs = (t: Tally | undefined, codexOwn: boolean): FoundIn[] => {
    const claude = t?.claude ?? 0;
    const codex = Math.max(t?.codex ?? 0, codexOwn ? 1 : 0);
    const out: FoundIn[] = [];
    if (claude) out.push('claude');
    if (codex) out.push('codex');
    if (out.length === 2 && (codex > claude || (codex === claude && codexOwn))) out.reverse();
    return out;
  };

  interface Candidate extends FoundProject {
    codex?: boolean;
  }
  const candidates = new Map<string, Candidate>();
  for (const [folder, t] of tally) if (t.claude + t.codex >= FOUND_MIN) candidates.set(folder, { folder, name: '', found: programs(t, false), lastAt: t.lastAt });

  // Codex's own projects: a folder it works in, with a session that worked there.
  for (const p of codexProjects()) {
    const own = path.resolve(p.roots[0]);
    if (!isDir(own)) continue;
    const roots = p.roots.map((r) => path.resolve(r));
    let lastAt = -1;
    for (const g of groups) if (roots.some((r) => within(path.resolve(g.cwd), r))) lastAt = Math.max(lastAt, g.at);
    if (lastAt < 0) continue;
    const t = tally.get(own);
    const folders = roots.slice(1).filter((r) => r !== own && !within(r, own) && isDir(r));
    candidates.set(own, {
      folder: own,
      name: p.name,
      ...(folders.length ? { folders: [...new Set(folders)].slice(0, MAX_FOLDERS) } : {}),
      found: programs(t, true),
      lastAt: Math.max(lastAt, t?.lastAt ?? 0),
      codex: true,
    });
  }

  const wanted = (c: Candidate) => {
    const p = c.folder;
    if (p === home || !within(p, home)) return false;
    // ~/.config, ~/.claude…: the app's and other programs' own folders (but where the Codex app keeps its projects').
    if (
      !c.codex &&
      path
        .relative(home, p)
        .split(path.sep)
        .some((seg) => seg.startsWith('.'))
    )
      return false;
    if (made.some((r) => within(p, r)) || covered.some((r) => within(p, r)) || hidden.has(p)) return false;
    return isDir(p);
  };

  // Its name: the one you gave the folder in the sidebar, else Codex's, else the folder's own; a name that is taken gets its parent folder, then a number.
  const mine = folderNames(db);
  const codexNames = codexFolderNames();
  const taken = new Set(spaces.map((s) => s.name.toLowerCase()));
  const out: FoundProject[] = [];
  for (const c of [...candidates.values()].filter(wanted).sort((a, b) => b.lastAt - a.lastAt || a.folder.localeCompare(b.folder))) {
    let name = (mine[c.folder] ?? (c.codex ? c.name : undefined) ?? codexNames[c.folder] ?? path.basename(c.folder)).trim().slice(0, 60) || path.basename(c.folder);
    if (taken.has(name.toLowerCase())) {
      name = `${path.basename(path.dirname(c.folder))}/${name}`.slice(0, 60);
      const base = name;
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} ${i}`;
    }
    taken.add(name.toLowerCase());
    const { codex: _codex, ...rest } = c;
    out.push({ ...rest, name });
  }
  return out;
}

/**
 * Makes a project of each folder foundProjects finds, then gives the sessions that work in a project's folder their
 * project. A folder you had dragged into place in the sidebar keeps its place for its project. Run again at once,
 * it makes nothing.
 */
export function syncFoundProjects(db: DB, o: { home?: string } = {}): { made: Space[]; claimed: string[] } {
  const made: Space[] = [];
  // The most recently at work first: the Projects page lists projects in the order they were made.
  for (const f of foundProjects(db, o))
    try {
      made.push(createSpace(db, { name: f.name, folder: f.folder, ...(f.folders ? { folders: f.folders } : {}) }, { found: f.found }));
    } catch (e) {
      console.warn(`[projects] could not make a project of ${f.folder}:`, e instanceof Error ? e.message : e);
    }
  const claimed = claimSessions(db, o);
  if (made.length) {
    const places = sidebarPlaces(db);
    const next = places.map((p) => {
      const m = made.find((s) => p === `dir:${s.folder}`);
      return m ? `space:${m.id}` : p;
    });
    if (next.some((p, i) => p !== places[i])) setSidebarPlaces(db, next);
  }
  return { made, claimed };
}
