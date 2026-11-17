// Looking beyond one project, only when an agent asks: which projects a session may look into, by name, and
// which session belongs to which project. Other projects' notes, wiki, documents and conversations are only ever
// read, and never from a project that keeps itself to itself (Space.memoryShared false); the session's own
// project is always open to it. memory_search, search_sessions, wiki_read, wiki_status and knowledge_read all
// resolve their `project` input here.
import os from 'node:os';
import path from 'node:path';
import { isGroup, type Space } from '../../shared/spaces.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { allSpaces, spaceById } from '../spaces/index.ts';
import { projectOfFolder } from '../spaces/found.ts';
import { wikiSpaceOfSession } from '../wiki/roots.ts';
import { projects } from './refile.ts';
import { repoRoot } from './store.ts';

/** Whether agents in other projects may search and read this project's memory: unless it keeps itself to itself. */
export function memoryShared(db: DB, spaceId: string): boolean {
  return spaceById(db, spaceId)?.memoryShared !== false;
}

/** A project agents may look into: a space with a folder of its own, not a group. */
export interface Target {
  id: string;
  name: string;
  space: Space;
  /** Where its notes are kept (its repository's root), null for a folder that has none (the home folder). */
  root: string | null;
  /** The names it goes by, lower case: its own, its folder's, and those its files give (git remote, package). */
  names: string[];
  /** The session's own project (or a project of the group it works in): always open to it. */
  here: boolean;
  /** It keeps itself to itself. */
  shut: boolean;
}

/** Every project (plain spaces with a folder), and for each the names it goes by. */
export function targets(db: DB): Target[] {
  const known = new Map(projects(db).map((p) => [p.id, p.names]));
  const out: Target[] = [];
  for (const s of allSpaces(db)) {
    if (isGroup(s) || !s.folder) continue;
    const own = [s.name, path.basename(s.folder)].map((n) => n.trim().toLowerCase()).filter(Boolean);
    out.push({ id: s.id, name: s.name, space: s, root: repoRoot(s.folder), names: [...new Set([...own, ...(known.get(s.id) ?? [])])], here: false, shut: s.memoryShared === false });
  }
  return out;
}

/**
 * The project a session works in: its own space (else that of the session that started it), else the project its
 * folder is in. A group is its member projects (and the group's own folder, as a project of its own, if it has notes).
 */
export function hereOf(db: DB, key: string, cwd?: string): { space: Space | null; ids: string[] } {
  const id = wikiSpaceOfSession(db, key, cwd);
  const space = id ? spaceById(db, id) : null;
  if (!space) return { space: null, ids: [] };
  return { space, ids: isGroup(space) ? (space.members ?? []).filter((m) => spaceById(db, m)) : [space.id] };
}

/** The projects of a session's scope, marked as its own. */
export function targetsFor(db: DB, key: string, cwd?: string): { list: Target[]; here: Target[]; space: Space | null } {
  const h = hereOf(db, key, cwd);
  const list = targets(db).map((t) => ({ ...t, here: h.ids.includes(t.id) }));
  return { list, here: list.filter((t) => t.here), space: h.space };
}

/** The projects a name could mean: by a name it goes by, whole and case aside. */
export function namedTargets(list: Target[], name: string): Target[] {
  const n = name.trim().toLowerCase();
  return n ? list.filter((t) => t.names.includes(n)) : [];
}

/** What a caller may search: its own project(s), and the others that are open. */
export interface Scope {
  /** In words, for a heading: "this project", "all projects", or the project's name. */
  label: string;
  /** The projects to search. */
  chosen: Target[];
  /** The session is in none (or in a group with no member projects). */
  outside: boolean;
  /** The session's own scope: a project, or a group. */
  space: Space | null;
  /** The session's own project(s), whether chosen or not. */
  here: Target[];
  /** Every project there is, with names. */
  all: Target[];
  /** The session's own project is among the chosen. */
  includesHere: boolean;
}

export const ERR_NAME = (name: string, open: Target[]) => `No project called “${name}” can be searched. ${open.length ? `Projects you can search: ${open.map((t) => t.name).join(', ')}.` : 'There are no other projects to search.'}`;
export const ERR_SHUT = (t: Target) => `“${t.name}” keeps itself to itself: its notes, wiki, documents and conversations cannot be read from other projects (its own switch is in its Settings, “Searchable from other projects”).`;

/**
 * Resolves `where` for a session: "this project" (the default in a project) or "all projects" (the default outside
 * one) or a project's name. Throws, with the choices, for a name no project goes by; throws for a project that keeps
 * itself to itself, unless it is the session's own.
 */
export function scopeFor(db: DB, key: string, cwd: string | undefined, where: unknown): Scope {
  const { list, here, space } = targetsFor(db, key, cwd);
  const outside = !space;
  const open = list.filter((t) => !t.shut || t.here);
  const w = typeof where === 'string' ? where.trim() : '';
  const lower = w.toLowerCase();
  const base = { outside, space, here, all: list };
  const done = (label: string, chosen: Target[]): Scope => ({ ...base, label, chosen, includesHere: chosen.some((t) => t.here) });
  const wantsAll = lower === 'all projects' || lower === 'all' || lower === 'everywhere';
  const wantsHere = lower === 'this project' || lower === 'this' || lower === 'here';
  if (!w || wantsHere) return wantsHere || !outside ? done('this project', here) : done('all projects', open);
  if (wantsAll) return done('all projects', open);
  const hit = namedTargets(list, w);
  if (hit.length > 1) throw new Error(`“${w}” could mean ${hit.map((t) => `${t.name} (${t.space.folder})`).join(' or ')}: give the name of the project as it is on its page.`);
  if (!hit.length) throw new Error(ERR_NAME(w, open));
  const t = hit[0];
  if (t.shut && !t.here) throw new Error(ERR_SHUT(t));
  return done(t.name, [t]);
}

/**
 * The project a `project` input of wiki_read, wiki_status or knowledge_read names, for a session: null for the
 * session's own project (the tool then works as it always did); the other project, when it is open to it. Throws
 * for an unknown name and for a project that keeps itself to itself.
 */
export function otherProject(db: DB, key: string, cwd: string | undefined, name: unknown): Target | null {
  const w = typeof name === 'string' ? name.trim() : '';
  if (!w) return null;
  const lower = w.toLowerCase();
  if (lower === 'this' || lower === 'this project' || lower === 'here') return null;
  const { list, space } = targetsFor(db, key, cwd);
  const hit = namedTargets(list, w);
  if (hit.length > 1) throw new Error(`“${w}” could mean ${hit.map((t) => `${t.name} (${t.space.folder})`).join(' or ')}: give the name of the project as it is on its page.`);
  if (!hit.length) throw new Error(ERR_NAME(w, list.filter((t) => !t.shut || t.here)));
  const t = hit[0];
  // The session's own project is what the tools work in without a name; a group's member is another project's wiki and documents.
  if (t.here) return space && isGroup(space) ? t : null;
  if (t.shut) throw new Error(ERR_SHUT(t));
  return t;
}

/**
 * The project a session belongs to: its own space (else its parent's), when that is a plain project; else the project
 * whose repository its folder is in (a worktree counts), else the one whose folder holds it. Null for work outside
 * every project.
 */
export function projectOfSession(db: DB, all: Target[], key: string, cwd?: string): Target | null {
  let x = sessionExtra(db, key);
  for (let i = 0; i < 8 && typeof x.space !== 'string' && typeof x.parent === 'string'; i++) x = sessionExtra(db, x.parent);
  if (typeof x.space === 'string') {
    const t = all.find((p) => p.id === x.space);
    if (t) return t;
  }
  if (!cwd) return null;
  const root = repoRoot(cwd);
  if (root) {
    const t = all.find((p) => p.root === root);
    if (t) return t;
  }
  const s = projectOfFolder(
    all.map((t) => t.space),
    cwd,
    os.homedir(),
  );
  return (s && all.find((p) => p.id === s.id)) || null;
}
