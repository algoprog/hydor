// Memory's routes for the pages: the switches, every entry with its history, edits, undoing a change from
// the note under a reply, export and clearing all.
import path from 'node:path';
import type { MemoryChange, MemoryEntry, MemoryListEntry, MemoryNoteData, MemoryScope } from '../../shared/memory.ts';
import { scopeName } from '../../shared/memory.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { getNote, updateNote } from '../notes.ts';
import { secretIn } from './secrets.ts';
import { addEntry, clearAll, deleteEntry, entries, eraseEntry, getEntry, history, memoryState, restoreEntry, search, setSwitches, updateEntry, type ChangeBy } from './store.ts';

const SCOPES: MemoryScope[] = ['global', 'repo', 'session'];

/** A session's title, looked up once per request. */
function titles(d: Deps) {
  const seen = new Map<string, string | undefined>();
  return (key?: string) => {
    if (!key) return undefined;
    if (!seen.has(key)) seen.set(key, d.sessions.summary(key)?.title);
    return seen.get(key);
  };
}

function labelled(d: Deps, list: MemoryEntry[]): MemoryListEntry[] {
  const title = titles(d);
  return list.map((e) => ({
    ...e,
    scopeLabel: e.scope === 'global' ? scopeName('global') : e.scope === 'repo' ? path.basename(e.scopeKey) || e.scopeKey : (title(e.scopeKey) ?? 'A session that is gone'),
    sessionTitle: title(e.session),
  }));
}

const idOf = (v: unknown) => {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'No such entry');
  return id;
};

function checkText(v: unknown): string {
  const text = String(v ?? '').trim();
  if (text.length < 2) throw new HttpError(400, 'The note is empty');
  const secret = secretIn(text);
  if (secret) throw new HttpError(400, `That seems to hold ${secret}: secrets are never kept in memory`);
  return text;
}

function exportMarkdown(list: MemoryListEntry[]): string {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const out = ['# Memory', '', `Exported from Naget Agent on ${day(Date.now())}.`];
  const groups = new Map<string, MemoryListEntry[]>();
  for (const e of list) {
    const k = `${e.scope}\u0000${e.scopeKey}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const s of SCOPES)
    for (const [k, es] of groups) {
      if (!k.startsWith(`${s}\u0000`)) continue;
      const e0 = es[0];
      out.push('', `## ${s === 'global' ? 'About you' : s === 'repo' ? `Project: ${e0.scopeLabel} (${e0.scopeKey})` : `Session: ${e0.scopeLabel} (${e0.scopeKey})`}`, '');
      for (const e of es) out.push(`- ${e.text} _(added ${day(e.createdAt)}${e.updatedAt !== e.createdAt ? `, changed ${day(e.updatedAt)}` : ''})_`);
    }
  return out.join('\n') + '\n';
}

export function memoryRoutes(d: Deps) {
  const { app, db } = d;
  const changed = () => d.broadcast({ t: 'feature', id: 'memory', data: { changed: true } });
  // Who did it says enough for your own changes; only an undo says more.
  const byUser = (why?: string): ChangeBy => ({ source: 'user', why });

  app.get('/api/memory', async () => memoryState(db));
  app.put('/api/memory', async (req) => {
    const b = (req.body ?? {}) as { enabled?: unknown; auto?: unknown };
    setSwitches(db, { enabled: typeof b.enabled === 'boolean' ? b.enabled : undefined, auto: typeof b.auto === 'boolean' ? b.auto : undefined });
    changed();
    return memoryState(db);
  });

  /** Entries: all of them, a search, one place, deleted ones, or some by id (`ids=1,2`). */
  app.get('/api/memory/entries', async (req) => {
    const q = req.query as { q?: string; scope?: string; key?: string; status?: string; ids?: string };
    const scope = SCOPES.includes(q.scope as MemoryScope) ? (q.scope as MemoryScope) : undefined;
    const status = q.status === 'deleted' || q.status === 'all' ? q.status : 'active';
    const ids = q.ids
      ? q.ids
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
          .slice(0, 200)
      : undefined;
    let list = entries(db, { scope, scopeKey: q.key, status: ids ? 'all' : status, ids });
    if (q.q?.trim()) list = search(list, q.q);
    return { entries: labelled(d, list) };
  });

  app.post('/api/memory/entries', async (req) => {
    const b = (req.body ?? {}) as { scope?: string; key?: string; text?: unknown };
    const scope = SCOPES.includes(b.scope as MemoryScope) ? (b.scope as MemoryScope) : 'global';
    if (scope !== 'global' && !b.key) throw new HttpError(400, 'Which project or session is it for?');
    const e = addEntry(db, { scope, scopeKey: scope === 'global' ? '' : String(b.key), text: checkText(b.text) }, byUser());
    changed();
    return { entry: labelled(d, [e])[0] };
  });

  app.patch('/api/memory/entries/:id', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    const text = checkText((req.body as { text?: unknown } | undefined)?.text);
    const cur = getEntry(db, id);
    if (!cur) throw new HttpError(404, 'That entry is gone');
    if (cur.status === 'deleted') restoreEntry(db, id, byUser(), text);
    else updateEntry(db, id, text, byUser());
    changed();
    return { entry: labelled(d, [getEntry(db, id)!])[0] };
  });

  /** Deletes an entry (it can be restored), or with `forever=1` erases it and its history. */
  app.delete('/api/memory/entries/:id', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    if ((req.query as { forever?: string }).forever === '1') eraseEntry(db, id);
    else deleteEntry(db, id, byUser());
    changed();
    return { ok: true };
  });

  app.post('/api/memory/entries/:id/restore', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    if (!restoreEntry(db, id, byUser())) throw new HttpError(404, 'That entry is not deleted');
    changed();
    return { entry: labelled(d, [getEntry(db, id)!])[0] };
  });

  app.get('/api/memory/entries/:id/history', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    const title = titles(d);
    return { history: history(db, id).map((h) => ({ ...h, sessionTitle: title(h.session) })) };
  });

  /** Undoes one change of a note under a reply: an added entry goes, an updated one gets its old text back, a deleted one returns. */
  app.post('/api/memory/notes/:id/undo', async (req) => {
    const note = getNote(db, (req.params as { id: string }).id);
    if (!note || note.kind !== 'memory') throw new HttpError(404, 'That note is gone');
    const data = note.data as MemoryNoteData;
    const i = Number((req.body as { index?: unknown } | undefined)?.index);
    const c: MemoryChange | undefined = data.changes?.[i];
    if (!c) throw new HttpError(400, 'No such change');
    if (c.undone) return { note };
    const cur = getEntry(db, c.entry);
    const by = { ...byUser('Undone from the conversation'), session: note.key };
    if (c.action === 'added') {
      if (cur) deleteEntry(db, c.entry, by);
    } else if (c.action === 'updated') {
      if (!cur) throw new HttpError(404, 'That entry is gone');
      if (cur.status === 'deleted') restoreEntry(db, c.entry, by, c.before);
      else updateEntry(db, c.entry, c.before ?? cur.text, by);
    } else if (cur) restoreEntry(db, c.entry, by);
    const next: MemoryNoteData = { ...data, changes: data.changes.map((x, j) => (j === i ? { ...x, undone: true } : x)) };
    changed();
    return { note: updateNote(db, note.id, next) };
  });

  app.get('/api/memory/export', async (req, reply) => {
    const md = (req.query as { format?: string }).format === 'md';
    const list = labelled(d, entries(db));
    const day = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="naget-memory-${day}.${md ? 'md' : 'json'}"`);
    if (md) return reply.type('text/markdown; charset=utf-8').send(exportMarkdown(list));
    const out = { exportedAt: new Date().toISOString(), entries: list.map((e) => ({ ...e, history: history(db, e.id) })) };
    return reply.type('application/json; charset=utf-8').send(JSON.stringify(out, null, 2));
  });

  /** Clears every entry and all history; the body must say { confirm: "all" }. */
  app.delete('/api/memory', async (req) => {
    if ((req.body as { confirm?: unknown } | undefined)?.confirm !== 'all') throw new HttpError(400, 'Clearing all memory needs a confirmation');
    const n = clearAll(db);
    changed();
    return { cleared: n };
  });
}
