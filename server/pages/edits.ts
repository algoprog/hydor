// The user changed a page in the editor: the agent of the session it was changed in (and of the session
// that made it) hears of it with the user's next message, with what changed as a diff of the page's
// HTML, so it builds on the user's version instead of writing its own over it. Until then a note in
// the conversation says the agent will see it; once the message went, that it did.
import type { PageEditNote } from '../../shared/pages.ts';
import type { DB } from '../db.ts';
import { addNote, getNote, updateNote } from '../notes.ts';
import { lineDiff } from '../skillpack/diff.ts';
import { pageInfo, pageSource } from './store.ts';
import { kindOf } from './kinds.ts';

export function initEdits(db: DB) {
  db.exec(`
    create table if not exists page_file_edits (
      key text not null,
      path text not null,
      before text not null,
      after text not null,
      note_id text,
      at integer not null,
      primary key (key, path)
    );
    create table if not exists page_edits (
      key text not null,
      page_id text not null,
      from_version integer not null,
      to_version integer not null,
      kept_from_item integer not null default 0,
      note_id text,
      at integer not null,
      primary key (key, page_id)
    );
  `);
}

interface Row {
  key: string;
  page_id: string;
  from_version: number;
  to_version: number;
  kept_from_item: number;
  note_id: string | null;
  at: number;
}

/**
 * The user saved version `to` of a page, made from version `from` (0: a page shown in the conversation,
 * kept with their changes as version `to`). Each session to tell gets one note per page until its next
 * message, however often the page is saved meanwhile.
 */
export function noteEdit(db: DB, keys: (string | undefined)[], pageId: string, from: number, to: number, keptFromItem = false) {
  const page = pageInfo(db, pageId);
  if (!page) return;
  for (const key of new Set(keys.filter((k): k is string => !!k))) {
    const had = db.prepare('select * from page_edits where key = ? and page_id = ?').get(key, pageId) as Row | undefined;
    const data: PageEditNote = { pageId, title: page.title, version: to, told: false };
    let noteId = had?.note_id ?? null;
    const note = noteId ? getNote(db, noteId) : null;
    if (note && !(note.data as PageEditNote).told) updateNote(db, note.id, data);
    else noteId = addNote(db, { key, kind: 'page-edit', data }).id;
    db.prepare(
      `insert into page_edits (key, page_id, from_version, to_version, kept_from_item, note_id, at) values (?, ?, ?, ?, ?, ?, ?)
       on conflict(key, page_id) do update set to_version = excluded.to_version, note_id = excluded.note_id, at = excluded.at`,
    ).run(key, pageId, from, to, keptFromItem ? 1 : 0, noteId, Date.now());
  }
}

/** The user changed an HTML file in the page editor (beside a conversation where an agent wrote it). */
export function noteFileEdit(db: DB, key: string, path: string, before: string, after: string) {
  const had = db.prepare('select note_id from page_file_edits where key = ? and path = ?').get(key, path) as { note_id: string | null } | undefined;
  const data: PageEditNote = { path, title: path.split('/').pop() || path, version: 0, told: false };
  let noteId = had?.note_id ?? null;
  const note = noteId ? getNote(db, noteId) : null;
  if (note && !(note.data as PageEditNote).told) updateNote(db, note.id, data);
  else noteId = addNote(db, { key, kind: 'page-edit', data }).id;
  db.prepare(
    `insert into page_file_edits (key, path, before, after, note_id, at) values (?, ?, ?, ?, ?, ?)
     on conflict(key, path) do update set after = excluded.after, note_id = excluded.note_id, at = excluded.at`,
  ).run(key, path, before, after, noteId, Date.now());
}

/** Past this, the diff is left out and the agent reads the page itself. */
const MAX_DIFF = 8000;

/** What the agent of `key` should hear with the user's next message; the notes it covers are then marked told. */
export function takeEdits(db: DB, key: string): string | null {
  const rows = db.prepare('select * from page_edits where key = ? order by at').all(key) as Row[];
  const files = db.prepare('select * from page_file_edits where key = ? order by at').all(key) as { path: string; before: string; after: string; note_id: string | null }[];
  if (!rows.length && !files.length) return null;
  db.prepare('delete from page_edits where key = ?').run(key);
  db.prepare('delete from page_file_edits where key = ?').run(key);
  const parts: string[] = [];
  for (const f of files) {
    if (f.note_id) {
      const n = getNote(db, f.note_id);
      if (n) updateNote(db, n.id, { ...(n.data as PageEditNote), told: true });
    }
    const d = lineDiff(f.before, f.after, 2);
    const diff = !d.diff
      ? ' Its text did not change.'
      : d.diff.length > MAX_DIFF
        ? ` Their changes are too long to show here (${d.added} lines added, ${d.removed} removed): read the file.`
        : ` Their changes:\n\`\`\`diff\n${d.diff}\n\`\`\``;
    parts.push(`- The file ${f.path}: the user changed it in the page editor.${diff}`);
  }
  for (const r of rows) {
    const page = pageInfo(db, r.page_id);
    if (r.note_id) {
      const n = getNote(db, r.note_id);
      if (n) updateNote(db, n.id, { ...(n.data as PageEditNote), told: true });
    }
    if (!page) continue;
    const before = r.from_version ? pageSource(db, r.page_id, r.from_version) : null;
    const after = pageSource(db, r.page_id, r.to_version);
    const k = kindOf(page.kind);
    const noun = k?.noun ?? 'page';
    const what = r.kept_from_item
      ? `- "${page.title}", a page you showed with show_html: the user kept it in their Pages as saved page ${page.id} and changed it (version ${r.to_version} is theirs; version 1 is yours as you showed it).`
      : `- "${page.title}" (saved ${noun} ${page.id}): the user changed it, from version ${r.from_version} to version ${r.to_version}.`;
    const base = r.kept_from_item ? pageSource(db, r.page_id, 1) : before;
    let diff = '';
    if (base && after) {
      const d = lineDiff(base.text, after.text, 2);
      diff = !d.diff
        ? ` It did not change.`
        : d.diff.length > MAX_DIFF
          ? ` Their changes are too long to show here (${d.added} lines added, ${d.removed} removed): get_page gives the ${noun} as it is now.`
          : ` Their changes, as a diff of the ${k ? `${noun} as it is kept (a line per part)` : 'page\'s HTML'}:\n\`\`\`diff\n${d.diff}\n\`\`\``;
    } else diff = ` get_page gives the ${noun} as it is now.`;
    if (page.version !== r.to_version) diff += ` (The page is at version ${page.version} now.)`;
    parts.push(what + diff);
  }
  if (!parts.length) return null;
  return [
    'The user changed a page in Hydor’s page editor since your last turn. Keep their changes when you change it again: for a saved page start from it as it is now (get_page) and save with its id (save_page, or its kind’s own: save_slides, save_doc, save_sheet, save_latex, save_notebook or save_diagram), which adds a version; a file, read it first.',
    ...parts,
  ].join('\n');
}

/** A page went: nothing more to say about it. */
export function dropEdits(db: DB, pageId: string) {
  db.prepare('delete from page_edits where page_id = ?').run(pageId);
}
