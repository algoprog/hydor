// Searching past conversations: by words (the app's full-text index of every session) and, when search by meaning is
// on, by what the user asked. search_sessions and memory_search both use it; `keep` limits it to the sessions a
// caller may find (a project's, or those of the projects open to it). The current session and sessions with memory
// off are never found, and a subagent's words count for the session that started it.
import { ftsQuery } from '../indexer/index.ts';
import { line } from '../mcp.ts';
import type { DB } from '../db.ts';
import type { RunCtx } from '../features/types.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { meaningOn, queryVector } from './embed.ts';
import { anyWords } from './search.ts';
import { nearSessions } from './transcripts.ts';

interface Hit {
  key: string;
  snips: string[];
  ts?: number;
}

/** Reciprocal rank fusion's constant, as for notes (search.ts). */
const RRF_K = 60;

export interface SessionFound {
  key: string;
  /** The session as a line (as list_sessions writes it), or just its key when it is gone. */
  line: string;
  /** What matched: quoted words, or what the user asked. */
  quotes: string[];
  /** Its working folder. */
  cwd?: string;
}

/**
 * The sessions about a query, best first, at most `limit`. `keep(key, cwd)` says whether a session may be found
 * (called once for each, with its own key: a subagent's hit counts for its parent). `wide` reads more of the index
 * before keeping (for a search kept to some sessions). `loose`: a question rather than words: when no session has
 * every word, any of them will do (as notes are found).
 */
export async function findSessions(
  ctx: Pick<RunCtx, 'deps' | 'key'>,
  o: { query: string; everything?: boolean; limit: number; keep?: (key: string, cwd?: string) => boolean; wide?: boolean; loose?: boolean },
): Promise<SessionFound[]> {
  const fts = ftsQuery(o.query);
  if (!fts) throw new Error('query is empty');
  const db: DB = ctx.deps.db;
  const find = (match: string) => {
    try {
      return db
        .prepare(
          `select c.key, c.ts, snippet(chunks, 0, char(1), char(2), '…', 16) as snip
           from chunks join chunk_text c on c.id = chunks.rowid
           where chunks match ? ${o.everything ? '' : "and c.kind in ('user', 'assistant')"} order by rank limit ?`,
        )
        .all(match, o.wide ? 2000 : 400) as { key: string; ts: number | null; snip: string }[];
    } catch {
      return [];
    }
  };
  let rows = find(fts);
  const any = !rows.length && o.loose ? anyWords(o.query) : null;
  if (any) rows = find(any);
  const parent = db.prepare('select hidden, parent_key from sessions where key = ?');
  const allowed = new Map<string, string | null>();
  /** The session a hit counts for (a subagent's words belong to the session that started it), or null when it may not be found. */
  const owner = (k: string): string | null => {
    if (allowed.has(k)) return allowed.get(k)!;
    let key: string | null = k;
    const p = parent.get(k) as { hidden: number; parent_key: string | null } | undefined;
    if (p?.hidden) key = p.parent_key;
    if (key && (key === ctx.key || sessionExtra(db, key).memory === false)) key = null;
    if (key && o.keep && !o.keep(key, ctx.deps.sessions.summary(key)?.cwd)) key = null;
    allowed.set(k, key);
    return key;
  };
  // By words: sessions in the order of their best chunk.
  const byWords = new Map<string, Hit>();
  for (const r of rows) {
    const key = owner(r.key);
    if (!key) continue;
    const h = byWords.get(key);
    const snip = r.snip.replace(/\u0001/g, '**').replace(/\u0002/g, '**').replace(/\s+/g, ' ').trim();
    if (h) {
      if (h.snips.length < 2 && !h.snips.includes(snip)) h.snips.push(snip);
      continue;
    }
    if (byWords.size >= 60) continue;
    byWords.set(key, { key, snips: [snip], ts: r.ts ?? undefined });
  }
  // By meaning: sessions by what the user asked in them, when the model answers.
  const v = meaningOn(db) ? await queryVector(db, o.query, { wait: true, timeoutMs: 8000 }).catch(() => null) : null;
  const byMeaning = new Map<string, { chunk: number; rank: number }>();
  if (v)
    nearSessions(db, v, { limit: 120, keep: (k) => !!owner(k) }).forEach((h) => {
      const key = owner(h.key)!;
      if (!byMeaning.has(key)) byMeaning.set(key, { chunk: h.chunk, rank: byMeaning.size });
    });
  const score = new Map<string, number>();
  [...byWords.keys()].forEach((k, i) => score.set(k, 1 / (RRF_K + i + 1)));
  for (const [k, m] of byMeaning) score.set(k, (score.get(k) ?? 0) + 1 / (RRF_K + m.rank + 1));
  const best = [...score].sort((x, y) => y[1] - x[1]).slice(0, o.limit);
  const message = db.prepare('select text from chunk_text where id = ?');
  return best.map(([key]) => {
    const s = ctx.deps.sessions.summary(key);
    const w = byWords.get(key);
    const m = byMeaning.get(key);
    const asked = !w && m ? (message.get(m.chunk) as { text: string } | undefined)?.text.replace(/\s+/g, ' ').trim() : undefined;
    const quotes = w ? w.snips.map((x) => `“${x}”`) : asked ? [`asked: “${asked.length > 200 ? `${asked.slice(0, 199)}…` : asked}”`] : [];
    return { key, line: s ? line(s) : `- ${key}`, quotes, cwd: s?.cwd };
  });
}
