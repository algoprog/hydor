// Finding notes: by their words (the full-text index, ranked by BM25) and, when search by meaning runs, by what
// they mean (vectors.ts). The two lists are joined by rank (reciprocal rank fusion: scores of different kinds
// never have to be compared), then a little weight goes to notes changed or needed lately and needed often.
// A note found by meaning counts only when it is alike enough, so a request about nothing kept finds nothing.
import type { MemoryEntry, MemoryKind } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import { queryVector } from './embed.ts';
import { entries, memorySchema, placeSql, words, type Place } from './store.ts';
import { nearest } from './vectors.ts';

/** Reciprocal rank fusion's constant: a list's first gets 1/61, its tenth 1/70. */
const RRF_K = 60;
/**
 * What each list weighs in the fusion. Measured on nine benchmarks (scripts/memory-embeddings/README.md): with
 * mDenseOn, words at a tenth of meaning's weight did best (+0.6 nDCG@10 over meaning alone, better on eight of
 * nine), while equal weights lost 7 points. Without meaning, words are all there is and their weight does not matter.
 */
const W_WORDS = 0.1;
const W_MEANING = 1;
/** Cosine similarity below which a note is not taken as being about the query (mDenseOn, query against note:
 * notes a request bore on measured 0.24 to 0.55, ones it did not 0.15 to 0.26, "thanks" 0.40). */
export const MIN_SIMILARITY = 0.3;
/** At most this much is added for being recent (changed or needed within months) and for being needed often. */
const FRESH = 0.3;
const OFTEN = 0.2;
const FRESH_DAYS = 90;

/** A text's words as an FTS5 query: any of them, and a longer one by its start too (deploy… finds deployment). */
export function anyWords(text: string): string | null {
  const ws = words(text).slice(0, 32);
  if (!ws.length) return null;
  return ws.map((w) => (w.length > 5 ? `("${w}" OR "${w.slice(0, Math.max(5, w.length - 2))}"*)` : `"${w}"`)).join(' OR ');
}

/** Every word of a text as an FTS5 query, the last one by its start (as someone types). */
export function allWords(text: string): string | null {
  const ws = words(text).slice(0, 12);
  if (!ws.length) return null;
  return ws.map((w, i) => `"${w}"${i === ws.length - 1 ? '*' : ''}`).join(' ');
}

/** Ids of the notes matching an FTS5 query in the places, best first. */
export function wordHits(db: DB, places: Place[] | 'all', fts: string, o: { limit: number; now: number; kinds?: MemoryKind[] }): number[] {
  memorySchema(db);
  const where = placeSql(places);
  const kinds = o.kinds ? `and e.kind in (${o.kinds.map(() => '?').join(',')})` : '';
  try {
    return (
      db
        .prepare(
          `select e.id as id from memory_fts join memory_entries e on e.id = memory_fts.rowid
           where memory_fts match ? and e.status = 'active' and (e.expires_at is null or e.expires_at > ?) and ${where.sql} ${kinds}
           order by bm25(memory_fts) limit ?`,
        )
        .all(fts, o.now, ...where.args, ...(o.kinds ?? []), o.limit) as { id: number }[]
    ).map((r) => r.id);
  } catch {
    return [];
  }
}

export interface Found {
  entry: MemoryEntry;
  score: number;
  /** Found by its words (the rank in that list), by its meaning (the similarity), or both. */
  wordRank?: number;
  meaning?: number;
  /** Bears on the query: alike in meaning, or among the best by words when meaning is not at hand. */
  relevant: boolean;
}

/** A little more for notes changed or needed lately, and needed often. */
export function boost(e: MemoryEntry, now: number): number {
  const last = Math.max(e.updatedAt, e.usedAt ?? 0);
  const fresh = Math.exp(-Math.max(0, now - last) / (FRESH_DAYS * 86400_000));
  const often = Math.min(1, Math.log2(1 + e.uses) / 6);
  return 1 + FRESH * fresh + OFTEN * often;
}

/**
 * Notes about a query in the places (or all), best first. Meaning is used when its worker answers now
 * (with `wait`, it is started for this); `vector` gives the query's vector instead. `mode` "all" asks
 * for every word (a search box); otherwise any word counts and ranking sorts them out.
 */
export async function findNotes(
  db: DB,
  o: { places: Place[] | 'all'; query: string; limit?: number; kinds?: MemoryKind[]; now?: number; mode?: 'any' | 'all'; wait?: boolean; vector?: Float32Array | null },
): Promise<Found[]> {
  const now = o.now ?? Date.now();
  const limit = o.limit ?? 20;
  const pool = Math.max(50, limit * 3);
  const fts = (o.mode === 'all' ? allWords : anyWords)(o.query);
  const byWords = fts ? wordHits(db, o.places, fts, { limit: pool, now, kinds: o.kinds }) : [];
  const vec = o.vector !== undefined ? o.vector : o.query.trim() ? await queryVector(db, o.query, { wait: o.wait }) : null;
  const byMeaning = vec ? nearest(db, o.places, vec, { k: pool, min: MIN_SIMILARITY, now }) : [];
  const fused = new Map<number, { rrf: number; wordRank?: number; meaning?: number }>();
  byWords.forEach((id, i) => fused.set(id, { rrf: W_WORDS / (RRF_K + i + 1), wordRank: i }));
  byMeaning.forEach((h, i) => {
    const f = fused.get(h.id) ?? { rrf: 0 };
    f.rrf += W_MEANING / (RRF_K + i + 1);
    f.meaning = h.score;
    fused.set(h.id, f);
  });
  if (!fused.size) return [];
  const found: Found[] = [];
  for (const e of entries(db, { ids: [...fused.keys()], live: now, kinds: o.kinds, limit: fused.size })) {
    const f = fused.get(e.id)!;
    found.push({ entry: e, score: f.rrf * boost(e, now), wordRank: f.wordRank, meaning: f.meaning, relevant: f.meaning != null || (!vec && (f.wordRank ?? 99) < 10) });
  }
  return found.sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt).slice(0, limit);
}
