// Spaces: a project's sessions, files, documents, memory, instructions and assistant together, picked by name
// on the start page in place of a folder. A space's folder holds its files and is where its sessions work, so
// its project memory is the folder's (server/memory keys a project by its folder); its knowledge bases are
// searched by its sessions alone, with the shared ones too unless it leaves them out (server/knowledge/scope.ts);
// every session started in it (extra.space) is told its instructions, and starts as its assistant. Deleting a
// space keeps its folder and sessions, and its knowledge bases become shared.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_SPACE_INSTRUCTIONS, SPACE_COLORS, type Space, type SpaceView } from '../../shared/spaces.ts';
import { taskRoot } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { docsBySpace, releaseSpace } from '../knowledge/store.ts';

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

/** Spaces with how many sessions each has, when one last was at work, and how many documents their knowledge holds. */
export function spaceViews(db: DB): SpaceView[] {
  const docs = docsBySpace(db);
  const counts = new Map(
    (db.prepare("select json_extract(extra, '$.space') as space, count(*) as n, max(updated_at) as last from app_sessions where json_extract(extra, '$.space') is not null group by 1").all() as { space: string; n: number; last: number | null }[]).map((r) => [
      r.space,
      r,
    ]),
  );
  return allSpaces(db).map((s) => ({ ...s, sessions: counts.get(s.id)?.n ?? 0, lastAt: counts.get(s.id)?.last ?? undefined, docs: docs.get(s.id) ?? 0 }));
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
export function createSpace(db: DB, b: Record<string, unknown>): Space {
  tables(db);
  const colors = Object.keys(SPACE_COLORS);
  const f = fields(b, undefined, colors[allSpaces(db).length % colors.length]);
  let folder: string;
  if (typeof b.folder === 'string' && b.folder.trim()) {
    folder = path.resolve(b.folder.trim().replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new HttpError(400, `No folder at ${folder}`);
  } else folder = newFolder(db, f.name);
  const s: Space = { id: `sp${crypto.randomBytes(5).toString('hex')}`, ...f, folder, createdAt: Date.now() };
  db.prepare('insert into spaces (id, data, created_at) values (?, ?, ?)').run(s.id, JSON.stringify(s), s.createdAt);
  return s;
}

export function updateSpace(db: DB, id: string, b: Record<string, unknown>): Space {
  const prev = spaceById(db, id);
  if (!prev) throw new HttpError(404, 'No such space');
  const { sharedKnowledge: _was, ...kept } = prev;
  const next: Space = { ...kept, ...fields(b, prev) };
  db.prepare('update spaces set data = ? where id = ?').run(JSON.stringify(next), id);
  return next;
}

export function deleteSpace(db: DB, id: string) {
  tables(db);
  db.prepare('delete from spaces where id = ?').run(id);
  releaseSpace(db, id);
}

/** What a session in a space is told. */
export function spaceInstructions(s: Space): string {
  const lines = [
    `# Space: ${s.name}`,
    `The user keeps this work in a space of its own, "${s.name}"${s.description ? ` (${s.description})` : ''}: its sessions, files, memory and these instructions belong together. Its folder, ${s.folder}, holds the space's files: keep what you make for it there.`,
  ];
  if (s.instructions) lines.push('', s.instructions);
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
      deleteSpace(d.db, id(req));
      changed();
      // Its knowledge bases are shared now.
      d.broadcast({ t: 'feature', id: 'knowledge', data: { changed: true } });
      return { ok: true };
    });
  },
  spawn(s, d) {
    const sp = typeof s.extra.space === 'string' ? spaceById(d.db, s.extra.space) : null;
    return sp ? { instructions: [spaceInstructions(sp)] } : undefined;
  },
};
