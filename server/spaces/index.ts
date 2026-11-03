// Spaces: a project's sessions, files, documents, memory, guidelines, skills and assistant together, picked by
// name on the start page in place of a folder. A space's folder holds its files and is where its sessions work,
// so its project memory is the folder's (server/memory keys a project by its folder); it can also work with
// other folders of yours, where they are (Claude Code works in them as in its own); its knowledge bases are
// searched by its sessions alone, with the shared ones too unless it leaves them out (server/knowledge/scope.ts);
// every session started in it (extra.space) gets its guidelines (server/guidelines) and its own skills with the
// skill library's (server/skillpack/spaceSkills.ts), and starts as its assistant. A group brings other spaces
// together: its sessions also get their documents, guidelines, skills and folders (Claude Code works in those
// folders too). Deleting a space keeps its folder and sessions, its knowledge bases become shared and its
// skills join the skill library; it leaves the groups it was in.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isGroup, MAX_FOLDERS, MAX_GROUP, MAX_SPACE_INSTRUCTIONS, SPACE_COLORS, type Space, type SpaceView } from '../../shared/spaces.ts';
import { taskRoot } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { docsBySpace, releaseSpace } from '../knowledge/store.ts';
import { hideSuggestion, spaceSuggestions } from './suggest.ts';
import { copyToSpace, releaseSpaceSkills, removeSpaceSkill, restoreSpaceSkill, saveSpaceSkill, skillsOf, spaceSkillDoc, spaceSkillsView } from '../skillpack/spaceSkills.ts';

const made = new WeakSet<DB>();
function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`create table if not exists spaces (id text primary key, data text not null, created_at integer not null)`);
  made.add(db);
}

export function allSpaces(db: DB): Space[] {
  tables(db);
  return (db.prepare('select data from spaces order by created_at').all() as { data: string }[]).map((r) => JSON.parse(r.data));
}

export function spaceById(db: DB, id: string): Space | null {
  tables(db);
  const r = db.prepare('select data from spaces where id = ?').get(id) as { data: string } | undefined;
  return r ? JSON.parse(r.data) : null;
}

/** Spaces with how many sessions each has, when one last was at work, how many documents their knowledge holds, and how many skills they have. */
export function spaceViews(db: DB): SpaceView[] {
  const docs = docsBySpace(db);
  const counts = new Map(
    (db.prepare("select json_extract(extra, '$.space') as space, count(*) as n, max(updated_at) as last from app_sessions where json_extract(extra, '$.space') is not null group by 1").all() as { space: string; n: number; last: number | null }[]).map((r) => [
      r.space,
      r,
    ]),
  );
  const kept = libraryCounts(db);
  return allSpaces(db).map((s) => ({
    ...s,
    sessions: counts.get(s.id)?.n ?? 0,
    lastAt: counts.get(s.id)?.last ?? undefined,
    docs: docs.get(s.id) ?? 0,
    skills: skillsOf(s.id).length,
    library: kept.get(s.id) ?? 0,
  }));
}

/** How many things each space holds in the Library: pages (an app's screens aside) and the pictures and videos kept. */
function libraryCounts(db: DB): Map<string, number> {
  const out = new Map<string, number>();
  for (const sql of ['select space, count(*) as n from pages where space is not null and app is null group by space', 'select space, count(*) as n from media where space is not null group by space'])
    try {
      for (const r of db.prepare(sql).all() as { space: string; n: number }[]) out.set(r.space, (out.get(r.space) ?? 0) + r.n);
    } catch {}
  return out;
}

/** A space's sessions, the last at work first. */
export function sessionsIn(db: DB, id: string, limit = 100): string[] {
  return (db.prepare("select key from app_sessions where json_extract(extra, '$.space') = ? order by updated_at desc limit ?").all(id, limit) as { key: string }[]).map((r) => r.key);
}

const clean = (s: unknown, max: number) => String(s ?? '').trim().slice(0, max);
const slug = (name: string) => name.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'space';

/** A folder of its own for a new space: in the task folders' place (Settings → Assistants), under Spaces. */
function newFolder(db: DB, name: string): string {
  const root = path.join(taskRoot(db), 'Spaces');
  for (let i = 1; ; i++) {
    const p = path.join(root, i === 1 ? slug(name) : `${slug(name)}-${i}`);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
      return p;
    }
  }
}

const home = (p: string) => p.replace(/^~(?=\/|$)/, process.env.HOME ?? '~');
const isFolder = (p: string) => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The folders it works with besides its own, as given (or kept from `prev`): folders that exist, each once,
 * not its own folder nor one inside it (its sessions have those already).
 */
function foldersOf(b: Record<string, unknown>, prev: Space | undefined, own: string | undefined): string[] | undefined {
  if (b.folders === undefined) return prev?.folders;
  if (!Array.isArray(b.folders)) throw new HttpError(400, 'folders: a list of folders');
  const out: string[] = [];
  for (const f of b.folders) {
    const p = path.resolve(home(String(f ?? '').trim()));
    if (!String(f ?? '').trim() || out.includes(p) || (own && (p === own || p.startsWith(own + path.sep)))) continue;
    if (!isFolder(p)) throw new HttpError(400, `No folder at ${p}`);
    out.push(p);
  }
  return out.length ? out.slice(0, MAX_FOLDERS) : undefined;
}

/** A space's fields as given (or kept from `prev`); a new one's colour is the next of the list. */
function fields(b: Record<string, unknown>, prev: Space | undefined, nextColor = 'blue'): Omit<Space, 'id' | 'createdAt' | 'folder'> {
  const name = b.name !== undefined ? clean(b.name, 60) : (prev?.name ?? '');
  if (!name) throw new HttpError(400, 'Give the space a name');
  const color = b.color !== undefined ? String(b.color) : (prev?.color ?? nextColor);
  const shared = b.sharedKnowledge !== undefined ? b.sharedKnowledge !== false : prev?.sharedKnowledge !== false;
  return {
    name,
    color: color in SPACE_COLORS ? color : 'blue',
    description: (b.description !== undefined ? clean(b.description, 300) : prev?.description) || undefined,
    instructions: (b.instructions !== undefined ? clean(b.instructions, MAX_SPACE_INSTRUCTIONS) : prev?.instructions) || undefined,
    assistant: (b.assistant !== undefined ? clean(b.assistant, 80) : prev?.assistant) || undefined,
    ...(shared ? {} : { sharedKnowledge: false }),
  };
}
/**
 * The spaces a group brings together, as given (or kept from `prev`): spaces that exist, not itself and not
 * other groups, each once. A space that is in a group cannot become one (groups stay one level deep).
 */
function membersOf(db: DB, b: Record<string, unknown>, prev: Space | undefined): string[] | undefined {
  if (b.members === undefined) return prev?.members;
  if (!Array.isArray(b.members)) throw new HttpError(400, 'members: a list of spaces');
  const all = new Map(allSpaces(db).map((s) => [s.id, s]));
  const ids = [...new Set(b.members.map(String))].filter((id) => id !== prev?.id && all.has(id) && !isGroup(all.get(id)!)).slice(0, MAX_GROUP);
  if (ids.length && prev && [...all.values()].some((s) => s.members?.includes(prev.id))) throw new HttpError(400, `${prev.name} is in a group already, so it cannot bring other spaces together itself`);
  return ids.length ? ids : undefined;
}

export function createSpace(db: DB, b: Record<string, unknown>): Space {
  tables(db);
  const colors = Object.keys(SPACE_COLORS);
  const f = { ...fields(b, undefined, colors[allSpaces(db).length % colors.length]), members: membersOf(db, b, undefined) };
  const given = typeof b.folder === 'string' && b.folder.trim() ? path.resolve(home(b.folder.trim())) : null;
  if (given && !isFolder(given)) throw new HttpError(400, `No folder at ${given}`);
  // The others are checked before a new folder is made for it.
  const folders = foldersOf(b, undefined, given ?? undefined);
  const folder = given ?? newFolder(db, f.name);
  const s: Space = { id: `sp${crypto.randomBytes(5).toString('hex')}`, ...f, folder, ...(folders ? { folders } : {}), createdAt: Date.now() };
  if (!s.members) delete s.members;
  db.prepare('insert into spaces (id, data, created_at) values (?, ?, ?)').run(s.id, JSON.stringify(s), s.createdAt);
  return s;
}

export function updateSpace(db: DB, id: string, b: Record<string, unknown>): Space {
  const prev = spaceById(db, id);
  if (!prev) throw new HttpError(404, 'No such space');
  const { sharedKnowledge: _was, members: _had, folders: _also, ...kept } = prev;
  const members = membersOf(db, b, prev);
  const folders = foldersOf(b, prev, prev.folder);
  const next: Space = { ...kept, ...fields(b, prev), ...(members ? { members } : {}), ...(folders ? { folders } : {}) };
  db.prepare('update spaces set data = ? where id = ?').run(JSON.stringify(next), id);
  return next;
}

/** Deletes a space; returns the names its skills have in the skill library now. */
export function deleteSpace(db: DB, id: string): string[] {
  tables(db);
  const s = spaceById(db, id);
  db.prepare('delete from spaces where id = ?').run(id);
  releaseSpace(db, id);
  // What the Library kept in it stays there, in no space.
  for (const table of ['pages', 'media'])
    try {
      db.prepare(`update ${table} set space = null where space = ?`).run(id);
    } catch {}
  const skills = s ? releaseSpaceSkills(db, s) : [];
  // It leaves the groups it was in.
  for (const g of allSpaces(db).filter((x) => x.members?.includes(id))) {
    const members = g.members!.filter((m) => m !== id);
    const { members: _had, ...rest } = g;
    db.prepare('update spaces set data = ? where id = ?').run(JSON.stringify(members.length ? { ...rest, members } : rest), g.id);
  }
  return skills;
}

/** The spaces a group brings together, as they are now (none for a plain space). */
export function membersNow(db: DB, s: Space): Space[] {
  return (s.members ?? []).map((id) => spaceById(db, id)).filter((x): x is Space => !!x);
}

/** The space a session is in (its extra.space), with the spaces it brings together; null outside one. */
export function spaceOfSession(db: DB, extra: { space?: unknown }): { space: Space; members: Space[] } | null {
  const space = typeof extra.space === 'string' && extra.space ? spaceById(db, extra.space) : null;
  return space ? { space, members: membersNow(db, space) } : null;
}

/** A space, and the groups that bring it in: the sessions where its skills are used. */
const withGroups = (db: DB, id: string) => [id, ...allSpaces(db).filter((g) => g.members?.includes(id)).map((g) => g.id)];

/** Most of a space's files a new session is told of by name. */
const GLANCE = 40;

/**
 * What a space's folder holds, at its top, for a new session: "contract.pdf, notes.md, Receipts/ (folder) …
 * and 12 more", the last changed first. Hidden files are left out; null when there is nothing.
 */
export function folderGlance(dir: string): string | null {
  let list: fs.Dirent[];
  try {
    list = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith('.'));
  } catch {
    return null;
  }
  if (!list.length) return null;
  const when = (e: fs.Dirent) => {
    try {
      return fs.statSync(path.join(dir, e.name)).mtimeMs;
    } catch {
      return 0;
    }
  };
  const named = list
    .map((e) => ({ e, t: when(e) }))
    .sort((a, b) => b.t - a.t)
    .slice(0, GLANCE)
    .map(({ e }) => (e.isDirectory() ? `${e.name}/` : e.name));
  return named.join(', ') + (list.length > GLANCE ? ` … and ${list.length - GLANCE} more` : '');
}

/** "a, b and c". */
const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : (xs[0] ?? ''));

/**
 * What a session in a space is told; in a group, of each space it brings together too. The space's own
 * guidelines come with the user's other Agent Guidelines (server/guidelines), the most general first.
 * `glance`: what its folder holds now (folderGlance), files the user added to the space among them.
 * `skills`: the names of its own skills, and of those of the spaces it brings together (server/skillpack).
 */
export function spaceInstructions(s: Space, members: Space[] = [], glance?: string | null, skills: string[] = []): string {
  const lines = [
    `# Space: ${s.name}`,
    `The user keeps this work in a space of its own, "${s.name}"${s.description ? ` (${s.description})` : ''}: its sessions, files, memory and guidelines belong together. Its folder, ${s.folder}, holds the space's files: keep what you make for it there.`,
  ];
  if (glance) lines.push('', `In its folder now (the last changed first; the user adds files to the space there): ${glance}. Open those the task needs.`);
  if (s.folders?.length)
    lines.push('', `It also works with ${s.folders.length === 1 ? 'this folder' : 'these folders'} of the user's, where ${s.folders.length === 1 ? 'it is' : 'they are'}: ${s.folders.join(', ')}. They belong to the space too: use them as the task needs.`);
  if (skills.length)
    lines.push(
      '',
      `Skills of the space's own: ${and(skills)}. They are in your skills list with the others, in place of any of the same name, and say how this work is done here: when one fits the task, use it.`,
    );
  if (members.length) {
    lines.push(
      '',
      `"${s.name}" brings together ${members.length} more space${members.length === 1 ? '' : 's'}, all yours to work with: their folders and files, their documents (knowledge_search searches them) and what they ask below. Use what bears on the task, from any of them; keep what you make in ${s.folder} unless the user says otherwise.`,
    );
    for (const m of members) {
      lines.push('', `## ${m.name}${m.description ? ` (${m.description})` : ''}`, `Its folder: ${m.folder}`);
      if (m.folders?.length) lines.push(`It also works with: ${m.folders.join(', ')}`);
      if (m.instructions) lines.push(m.instructions);
    }
  }
  return lines.join('\n');
}

export const spaces: Feature = {
  id: 'spaces',
  routes(d: Deps) {
    const id = (req: { params: unknown }) => String((req.params as { id: string }).id);
    const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
    const changed = () => d.broadcast({ t: 'feature', id: 'spaces', data: { changed: true } });
    d.app.get('/api/spaces', async () => ({ spaces: spaceViews(d.db) }));
    d.app.post('/api/spaces', async (req) => {
      const s = createSpace(d.db, body(req));
      changed();
      return s;
    });
    // Folders sessions worked in lately that no space has yet (server/spaces/suggest.ts).
    d.app.get('/api/spaces/suggestions', async () => ({ folders: spaceSuggestions(d.db) }));
    d.app.post('/api/spaces/suggestions/hide', async (req) => {
      const folder = typeof body(req).folder === 'string' ? String(body(req).folder).trim() : '';
      if (!folder.startsWith('/')) throw new HttpError(400, 'Which folder?');
      hideSuggestion(d.db, folder);
      changed();
      return { folders: spaceSuggestions(d.db) };
    });
    d.app.get('/api/spaces/:id', async (req) => {
      const s = spaceById(d.db, id(req));
      if (!s) throw new HttpError(404, 'No such space');
      return { space: s, sessions: sessionsIn(d.db, s.id) };
    });
    d.app.patch('/api/spaces/:id', async (req) => {
      const s = updateSpace(d.db, id(req), body(req));
      changed();
      return s;
    });
    d.app.delete('/api/spaces/:id', async (req) => {
      const skills = deleteSpace(d.db, id(req));
      changed();
      // Its knowledge bases are shared now, and its skills in the library.
      d.broadcast({ t: 'feature', id: 'knowledge', data: { changed: true } });
      if (skills.length) d.broadcast({ t: 'feature', id: 'skillpack', data: { library: true } });
      return { ok: true, skills };
    });

    // Its own skills (server/skillpack/spaceSkills.ts).
    const space = (req: { params: unknown }) => {
      const s = spaceById(d.db, id(req));
      if (!s) throw new HttpError(404, 'No such space');
      return s;
    };
    const skill = (req: { params: unknown }) => String((req.params as { name: string }).name);
    const skillsChanged = (s: Space) => {
      changed();
      d.broadcast({ t: 'feature', id: 'skillpack', data: { space: s.id } });
    };
    d.app.get('/api/spaces/:id/skills', async (req) => spaceSkillsView(d.db, space(req).id, withGroups(d.db, space(req).id)));
    d.app.get('/api/spaces/:id/skills/:name', async (req) => {
      const doc = spaceSkillDoc(d.db, space(req), skill(req));
      if (!doc) throw new HttpError(404, `The space has no skill named ${skill(req)}`);
      return doc;
    });
    d.app.post('/api/spaces/:id/skills', async (req) => {
      const s = space(req);
      const b = body(req);
      const out = typeof b.from === 'string' && b.from ? copyToSpace(d.db, s.id, b.from) : saveSpaceSkill(d.db, s.id, b);
      skillsChanged(s);
      return out;
    });
    d.app.put('/api/spaces/:id/skills/:name', async (req) => {
      const s = space(req);
      const out = saveSpaceSkill(d.db, s.id, body(req), skill(req));
      skillsChanged(s);
      return out;
    });
    d.app.delete('/api/spaces/:id/skills/:name', async (req) => {
      const s = space(req);
      removeSpaceSkill(d.db, s.id, skill(req));
      skillsChanged(s);
      return { ok: true };
    });
    d.app.post('/api/spaces/:id/skills/:name/restore', async (req) => {
      const s = space(req);
      restoreSpaceSkill(d.db, s.id, skill(req));
      skillsChanged(s);
      return { ok: true };
    });
  },
  spawn(s, d) {
    const sp = typeof s.extra.space === 'string' ? spaceById(d.db, s.extra.space) : null;
    if (!sp) return undefined;
    const members = membersNow(d.db, sp);
    // Claude Code works in the space's other folders, and those of the spaces a group brings together, as in its own.
    const dirs = s.agent === 'claude' ? [...new Set([...(sp.folders ?? []), ...members.flatMap((m) => [m.folder, ...(m.folders ?? [])])])].filter((f) => f !== sp.folder && fs.existsSync(f)) : [];
    // Its skills reach the agent with the library's (server/skillpack): here it is told they are there.
    const skills = [...new Set([sp, ...members].flatMap((m) => skillsOf(m.id).map((k) => k.name)))];
    return { instructions: [spaceInstructions(sp, members, folderGlance(sp.folder), skills)], ...(dirs.length ? { args: dirs.flatMap((f) => ['--add-dir', f]) } : {}) };
  },
};
