// Searching the sessions by their words: titles and folders, then the full-text index of what was said. The indexer's
// worker answers searches (findSessions, its own connection to the database), so a search that matches many messages
// keeps no request of the server waiting; this thread answers only when the worker cannot.
import type { SearchHit } from '../../shared/types.ts';
import type { DB } from '../db.ts';

/** Builds an FTS5 query: every word must match, the last one as a prefix. */
export function ftsQuery(q: string): string | null {
  const words = q
    .split(/\s+/)
    .map((w) => w.replace(/["]/g, '').trim())
    .filter(Boolean)
    .slice(0, 12);
  if (!words.length) return null;
  return words.map((w, i) => `"${w}"${i === words.length - 1 && w.length > 1 ? '*' : ''}`).join(' ');
}

export function searchSessions(db: DB, q: string, limit = 40): SearchHit[] {
  const fts = ftsQuery(q);
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  const like = `%${q.replace(/[%_]/g, '')}%`;

  // Titles and folders first.
  const meta = db
    .prepare(
      `select s.key, s.agent, coalesce(a.title, s.title, s.first_prompt, a.first_prompt) as title, coalesce(s.cwd, a.cwd) as cwd, s.updated_at
       from sessions s left join app_sessions a on a.key = s.key
       where s.hidden = 0 and (coalesce(a.title, s.title, '') like ? or s.first_prompt like ? or s.cwd like ?)
       order by s.updated_at desc limit 15`,
    )
    .all(like, like, like) as { key: string; agent: 'claude' | 'codex'; title: string; cwd: string; updated_at: number }[];
  for (const r of meta) {
    seen.add(r.key);
    hits.push({ key: r.key, agent: r.agent, title: r.title ?? 'Untitled', cwd: r.cwd, updatedAt: r.updated_at, kind: 'title', snippet: '' });
  }
  if (!fts) return hits;

  let rows: { key: string; kind: string; ts: number | null; snip: string }[] = [];
  try {
    rows = db
      .prepare(
        `select c.key, c.kind, c.ts, snippet(chunks, 0, char(1), char(2), '…', 18) as snip
         from chunks join chunk_text c on c.id = chunks.rowid
         where chunks match ? order by rank limit 400`,
      )
      .all(fts) as typeof rows;
  } catch {
    return hits;
  }
  const keys = [...new Set(rows.map((r) => r.key))].filter((k) => !seen.has(k));
  if (!keys.length) return hits;
  const info = new Map<string, { agent: 'claude' | 'codex'; title: string; cwd: string; updated_at: number; hidden: number; parent_key: string | null }>();
  const stmt = db.prepare(
    `select s.key, s.agent, coalesce(a.title, s.title, s.first_prompt) as title, s.cwd, s.updated_at, s.hidden, s.parent_key
     from sessions s left join app_sessions a on a.key = s.key where s.key = ?`,
  );
  for (const k of keys) {
    const r = stmt.get(k) as any;
    if (r) info.set(k, r);
  }
  for (const r of rows) {
    if (seen.has(r.key) || hits.length >= limit) continue;
    let s = info.get(r.key);
    if (!s) continue;
    let key = r.key;
    // A subagent's match points at its parent session.
    if (s.hidden && s.parent_key) {
      key = s.parent_key;
      if (seen.has(key)) continue;
      s = stmt.get(key) as typeof s | undefined;
      if (!s) continue;
    } else if (s.hidden) {
      continue;
    }
    seen.add(key);
    hits.push({ key, agent: s.agent, title: s.title ?? 'Untitled', cwd: s.cwd, updatedAt: s.updated_at, kind: r.kind, snippet: r.snip, ts: r.ts ?? undefined });
  }
  return hits;
}
