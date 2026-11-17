// What is remembered about a document beyond its text: whether the user pinned it for the wiki to read, and how often
// agents used it (knowledge_search returned one of its passages, or knowledge_read read it). Wiki memory reads the
// pinned and the most used documents first when a project has more documents than its limit (server/wiki/digest).
// Kept by base and path, not by document id: a document read again after it changed gets a new id but is the same document.
import type { DB } from '../db.ts';
import { knowledgeSchema } from './store.ts';

/** How a document is marked: pinned_at is when it was pinned (0: not pinned). */
export interface DocMarks {
  pinnedAt: number;
  uses: number;
  usedAt: number;
}

/** Marks a document as pinned for the wiki, or lets it go. */
export function setWikiPin(db: DB, base: string, path: string, pin: boolean, now = Date.now()) {
  knowledgeSchema(db);
  if (pin) db.prepare('insert into kb_doc_marks (base, path, pinned_at) values (?, ?, ?) on conflict (base, path) do update set pinned_at = excluded.pinned_at').run(base, path, now);
  else db.prepare('update kb_doc_marks set pinned_at = 0 where base = ? and path = ?').run(base, path);
}

/** One use by an agent for each document given (a document once however many passages of it were returned). */
export function countUses(db: DB, docs: { base: string; path: string }[], now = Date.now()) {
  knowledgeSchema(db);
  const seen = new Set<string>();
  const put = db.prepare('insert into kb_doc_marks (base, path, uses, used_at) values (?, ?, 1, ?) on conflict (base, path) do update set uses = uses + 1, used_at = excluded.used_at');
  db.transaction(() => {
    for (const d of docs) {
      const k = `${d.base}\n${d.path}`;
      if (seen.has(k)) continue;
      seen.add(k);
      put.run(d.base, d.path, now);
    }
  })();
}

/** The marks of the documents of a base, by path (documents never marked are not there). */
export function marksOf(db: DB, base: string): Map<string, DocMarks> {
  knowledgeSchema(db);
  const rows = db.prepare('select path, pinned_at, uses, used_at from kb_doc_marks where base = ?').all(base) as { path: string; pinned_at: number; uses: number; used_at: number | null }[];
  return new Map(rows.map((r) => [r.path, { pinnedAt: r.pinned_at, uses: r.uses, usedAt: r.used_at ?? 0 }]));
}
