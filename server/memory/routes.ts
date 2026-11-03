// Memory's routes for the pages: the switches (memory, search by meaning and where it runs), every entry with
// its history, searches, edits and end dates, notes no agent needed for long, what a topic sums up, the
// tidy-up (run now, undo one of its changes), undoing a change from the note under a reply, export and
// clearing all.
import path from 'node:path';
import type { MemoryChange, MemoryEntry, MemoryKind, MemoryListEntry, MemoryNoteData, MemoryScope, MemoryState } from '../../shared/memory.ts';
import { scopeName } from '../../shared/memory.ts';
import { HttpError } from '../auth.ts';
import type { Deps } from '../features/types.ts';
import { getNote, updateNote } from '../notes.ts';
import { meaningState, setMeaning, type MeaningDevice } from './embed.ts';
import { findNotes } from './search.ts';
import { secretIn } from './secrets.ts';
import {
  addEntry,
  childrenOf,
  clearAll,
  deleteEntry,
  entries,
  eraseEntry,
  getEntry,
  history,
  keepEntry,
  memoryCounts,
  memoryOn,
  restoreEntry,
  setEnabled,
  setExpiry,
  setTidyOn,
  staleCount,
  staleEntries,
  tidyOn,
  updateEntry,
  words,
  type ChangeBy,
} from './store.ts';
import { helperAsk, lastTidy, tidy, undoTidy } from './tidy.ts';

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

/** An end date from the page: a time from now to five years on, or null to take it away. */
function checkExpiry(v: unknown): number | null {
  if (v === null) return null;
  const t = Number(v);
  if (!Number.isFinite(t) || t <= Date.now() || t > Date.now() + 5 * 365 * 86400_000) throw new HttpError(400, 'The end date should be from now to five years on');
  return Math.round(t);
}

function exportMarkdown(list: MemoryListEntry[]): string {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const out = ['# Memory', '', `Exported from Hydor on ${day(Date.now())}.`];
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
      for (const e of es) {
        const what = [e.kind !== 'note' && e.kind, `added ${day(e.createdAt)}`, e.updatedAt !== e.createdAt && `changed ${day(e.updatedAt)}`, e.expiresAt && `until ${day(e.expiresAt)}`].filter(Boolean).join(', ');
        out.push(`- ${e.text} _(${what})_`);
      }
    }
  return out.join('\n') + '\n';
}

export function memoryState(db: Deps['db']): MemoryState {
  return { enabled: memoryOn(db), counts: memoryCounts(db), meaning: meaningState(db), tidyOn: tidyOn(db), tidy: lastTidy(db), stale: staleCount(db) };
}

/** Plain matching for the deleted ones (the index only searches the active): every word, in any order. */
const matches = (text: string, q: string) => words(q).every((w) => text.toLowerCase().includes(w));

export function memoryRoutes(d: Deps) {
  const { app, db } = d;
  const changed = () => d.broadcast({ t: 'feature', id: 'memory', data: { changed: true } });
  // Who did it says enough for your own changes; only an undo says more.
  const byUser = (why?: string): ChangeBy => ({ source: 'user', why });

  app.get('/api/memory', async () => memoryState(db));
  app.put('/api/memory', async (req) => {
    const b = (req.body ?? {}) as { enabled?: unknown; meaning?: unknown; device?: unknown; retry?: unknown; tidy?: unknown };
    if (typeof b.enabled === 'boolean') setEnabled(db, b.enabled);
    if (typeof b.tidy === 'boolean') setTidyOn(db, b.tidy);
    const device = b.device === 'cpu' || b.device === 'auto' ? (b.device as MeaningDevice) : undefined;
    if (typeof b.meaning === 'boolean' || device || b.retry === true) setMeaning(db, { on: typeof b.meaning === 'boolean' ? b.meaning : undefined, device, retry: b.retry === true });
    changed();
    return memoryState(db);
  });

  /** Entries: all of them, a search, one place, one kind, deleted ones, the ones no agent needed for long (`stale=1`), or some by id. */
  app.get('/api/memory/entries', async (req) => {
    const q = req.query as { q?: string; scope?: string; key?: string; status?: string; ids?: string; kind?: string; stale?: string };
    const scope = SCOPES.includes(q.scope as MemoryScope) ? (q.scope as MemoryScope) : undefined;
    const status = q.status === 'deleted' || q.status === 'all' ? q.status : 'active';
    const kinds = q.kind === 'note' || q.kind === 'topic' || q.kind === 'profile' ? [q.kind as MemoryKind] : undefined;
    const ids = q.ids
      ? q.ids
          .split(',')
          .map(Number)
          .filter((n) => Number.isInteger(n) && n > 0)
          .slice(0, 200)
      : undefined;
    if (q.stale === '1') return { entries: labelled(d, staleEntries(db, { limit: 100 })) };
    const text = q.q?.trim();
    if (text && status === 'active' && !ids) {
      const places = scope ? (db.prepare('select distinct scope, scope_key as scopeKey from memory_entries where scope = ?').all(scope) as { scope: MemoryScope; scopeKey: string }[]) : 'all';
      const found = await findNotes(db, { places, query: text, limit: 100, kinds, mode: 'all' });
      return { entries: labelled(d, found.map((f) => f.entry).filter((e) => q.key == null || e.scopeKey === q.key)) };
    }
    let list = entries(db, { scope, scopeKey: q.key, status: ids ? 'all' : status, ids, kinds });
    if (text) list = list.filter((e) => matches(e.text, text));
    return { entries: labelled(d, list) };
  });

  app.post('/api/memory/entries', async (req) => {
    const b = (req.body ?? {}) as { scope?: string; key?: string; text?: unknown; expiresAt?: unknown };
    const scope = SCOPES.includes(b.scope as MemoryScope) ? (b.scope as MemoryScope) : 'global';
    if (scope !== 'global' && !b.key) throw new HttpError(400, 'Which project or session is it for?');
    const expiresAt = b.expiresAt == null ? undefined : (checkExpiry(b.expiresAt) ?? undefined);
    const e = addEntry(db, { scope, scopeKey: scope === 'global' ? '' : String(b.key), text: checkText(b.text), expiresAt }, byUser());
    changed();
    return { entry: labelled(d, [e])[0] };
  });

  /** A new text, a new end date (null: none), or both. */
  app.patch('/api/memory/entries/:id', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { text?: unknown; expiresAt?: unknown };
    const cur = getEntry(db, id);
    if (!cur) throw new HttpError(404, 'That entry is gone');
    if (b.text !== undefined) {
      const text = checkText(b.text);
      if (cur.status === 'deleted') restoreEntry(db, id, byUser(), text);
      else updateEntry(db, id, text, byUser());
    }
    if (b.expiresAt !== undefined) setExpiry(db, id, checkExpiry(b.expiresAt), byUser());
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

  /** Keeps a note suggested for removal: it counts as needed now. */
  app.post('/api/memory/entries/:id/keep', async (req) => {
    keepEntry(db, idOf((req.params as { id: string }).id));
    changed();
    return { ok: true };
  });

  app.get('/api/memory/entries/:id/history', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    const title = titles(d);
    return { history: history(db, id).map((h) => ({ ...h, sessionTitle: title(h.session) })) };
  });

  /** The notes a topic or a profile sums up. */
  app.get('/api/memory/entries/:id/children', async (req) => {
    const id = idOf((req.params as { id: string }).id);
    return { entries: labelled(d, entries(db, { ids: childrenOf(db, id), status: 'all', limit: 500 })) };
  });

  /** Tidies up now (in the background; the state says when it is done). */
  app.post('/api/memory/tidy', async () => {
    if (!memoryOn(db)) throw new HttpError(400, 'Memory is off');
    void tidy(db, helperAsk(db)).then(changed);
    changed();
    return { started: true };
  });

  app.post('/api/memory/tidy/undo', async (req) => {
    const i = Number((req.body as { index?: unknown } | undefined)?.index);
    try {
      const r = undoTidy(db, i);
      changed();
      return { tidy: r };
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
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
    } else if (c.action === 'expiry') {
      if (cur) setExpiry(db, c.entry, c.expiredBefore ?? null, by);
    } else if (cur) restoreEntry(db, c.entry, by);
    const next: MemoryNoteData = { ...data, changes: data.changes.map((x, j) => (j === i ? { ...x, undone: true } : x)) };
    changed();
    return { note: updateNote(db, note.id, next) };
  });

  app.get('/api/memory/export', async (req, reply) => {
    const md = (req.query as { format?: string }).format === 'md';
    const list = labelled(d, entries(db));
    const day = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="hydor-memory-${day}.${md ? 'md' : 'json'}"`);
    if (md) return reply.type('text/markdown; charset=utf-8').send(exportMarkdown(list));
    const out = { exportedAt: new Date().toISOString(), entries: list.map((e) => ({ ...e, history: history(db, e.id), sumsUp: e.kind !== 'note' ? childrenOf(db, e.id) : undefined })) };
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
