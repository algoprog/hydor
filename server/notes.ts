// Notes the app adds to a conversation beside what the agent wrote: a memory update, a second opinion,
// a spending cap reached. Each shows with the turn of the item it is anchored to (the reply it is
// about), or at the end of the conversation without one. The pages showing the session hear of each
// change (index.ts passes `notes` events on).
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { SessionNote } from '../shared/features.ts';
import type { DB } from './db.ts';

/** 'note' (added or changed) and 'removed', each with the note. */
export const noteEvents = new EventEmitter();

interface Row {
  id: string;
  key: string;
  kind: string;
  at: number;
  anchor: string | null;
  data: string;
}

const toNote = (r: Row): SessionNote => ({ id: r.id, key: r.key, kind: r.kind, at: r.at, anchor: r.anchor ?? undefined, data: JSON.parse(r.data) });

export function addNote(db: DB, n: { key: string; kind: string; anchor?: string; data: unknown; at?: number }): SessionNote {
  const note: SessionNote = { id: crypto.randomBytes(8).toString('hex'), key: n.key, kind: n.kind, at: n.at ?? Date.now(), anchor: n.anchor, data: n.data };
  db.prepare('insert into session_notes (id, key, kind, at, anchor, data) values (?, ?, ?, ?, ?, ?)').run(note.id, note.key, note.kind, note.at, note.anchor ?? null, JSON.stringify(note.data ?? null));
  noteEvents.emit('note', note);
  return note;
}

export function getNote(db: DB, id: string): SessionNote | null {
  const r = db.prepare('select * from session_notes where id = ?').get(id) as Row | undefined;
  return r ? toNote(r) : null;
}

/** Replaces a note's data. */
export function updateNote(db: DB, id: string, data: unknown): SessionNote | null {
  const n = getNote(db, id);
  if (!n) return null;
  db.prepare('update session_notes set data = ? where id = ?').run(JSON.stringify(data ?? null), id);
  const next = { ...n, data };
  noteEvents.emit('note', next);
  return next;
}

export function removeNote(db: DB, id: string) {
  const n = getNote(db, id);
  if (!n) return;
  db.prepare('delete from session_notes where id = ?').run(id);
  noteEvents.emit('removed', n);
}

/** A session's notes, oldest first; only one kind when given. */
export function notesOf(db: DB, key: string, kind?: string): SessionNote[] {
  const rows = (kind ? db.prepare('select * from session_notes where key = ? and kind = ? order by at').all(key, kind) : db.prepare('select * from session_notes where key = ? order by at').all(key)) as Row[];
  return rows.map(toNote);
}

/** Drops a removed session's notes, and how long its cards waited for the user. */
export function dropNotes(db: DB, key: string) {
  db.prepare('delete from session_notes where key = ?').run(key);
  db.prepare('delete from approval_waits where key = ?').run(key);
}
