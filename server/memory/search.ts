// Finding notes: by their words (the full-text index, ranked by BM25) and, when search by meaning runs, by what
// they mean (vectors.ts). The two lists are joined by rank (reciprocal rank fusion: scores of different kinds
// never have to be compared), then a little weight goes to notes changed or looked up lately and often.
// A note bears on the request only when it stands out from the rest for that request: how alike a request is
// to every note depends mostly on the request (a long brief is alike to all of them, a short question to few),
// so each note's similarity is measured against the mean and spread of the bulk of them for that same request.
import type { MemoryEntry, MemoryKind } from '../../shared/memory.ts';
import type { DB } from '../db.ts';
import { queryVector } from './embed.ts';
import { entries, memorySchema, placeSql, words, type Place } from './store.ts';
import { nearest, type ScanStats } from './vectors.ts';

/** Reciprocal rank fusion's constant: a list's first gets 1/61, its tenth 1/70. */
const RRF_K = 60;
/**
 * What each list weighs in the fusion. Measured on nine benchmarks (scripts/memory-embeddings/README.md): with
 * mDenseOn, words at a tenth of meaning's weight did best (+0.6 nDCG@10 over meaning alone, better on eight of
 * nine), while equal weights lost 7 points. Without meaning, words are all there is and their weight does not matter.
 */
const W_WORDS = 0.1;
const W_MEANING = 1;
/** Cosine similarity below which a note is not taken as being about the query when there are too few notes to
 * judge what stands out (mDenseOn, query against note: notes a request bore on measured 0.24 to 0.55, ones it did
 * not 0.15 to 0.26, "thanks" 0.40). */
export const MIN_SIMILARITY = 0.3;
/** Below this a note is not offered by meaning at all. */
const FLOOR = 0.15;
/**
 * Standard deviations above the bulk of the request's similarities to all notes (the best 5% left out: vectors.ts
 * bulkStats) that make a note bear on it, and the fewest notes that judgment needs. Measured on 88 notes of a real
 * project and the first messages of its last 40 sessions, 20 of them judged by hand (2026-11-08): the mean ran from
 * 0.20 (a short question) to 0.44 (a long brief). A fixed 0.3, the best 10, took 180 notes for those 20, 19% of them
 * bearing on the request; at 2.6 it takes 23, 87% bearing on it, with 54% of those judged to bear found (the rest
 * are in the index, a look-up away), and none for a question about nothing kept (things to do in a city).
 */
export const Z_MIN = 2.6;
const Z_NOTES = 12;
/** At most this much is added for being recent (changed or looked up within months) and for being looked up often. */
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
  /** How far its similarity stands above the request's mean to all notes, in standard deviations. */
  z?: number;
  /** Bears on the query: it stands out in meaning, or is among the best by words when meaning is not at hand. */
  relevant: boolean;
}

/**
 * A little more for notes changed or looked up lately, and looked up often. Being given at the start does not
 * count: the ranking itself picked those, and counting it would keep picking the same ones.
 */
export function boost(e: MemoryEntry, now: number): number {
  const last = Math.max(e.updatedAt, e.hitAt ?? 0);
  const fresh = Math.exp(-Math.max(0, now - last) / (FRESH_DAYS * 86400_000));
  const often = Math.min(1, Math.log2(1 + e.hits) / 6);
  return 1 + FRESH * fresh + OFTEN * often;
}

/** Whether a similarity bears on the request, given how alike the request is to every note. */
export function bears(sim: number, stats: ScanStats): { relevant: boolean; z?: number } {
  if (stats.n < Z_NOTES || stats.sd <= 1e-6) return { relevant: sim >= MIN_SIMILARITY };
  const z = (sim - stats.mean) / stats.sd;
  return { relevant: z >= Z_MIN, z };
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
  const stats: ScanStats = { n: 0, mean: 0, sd: 0 };
  const byMeaning = vec ? nearest(db, o.places, vec, { k: pool, min: FLOOR, now, stats }) : [];
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
    const b = f.meaning != null ? bears(f.meaning, stats) : { relevant: !vec && (f.wordRank ?? 99) < 5 };
    found.push({ entry: e, score: f.rrf * boost(e, now), wordRank: f.wordRank, meaning: f.meaning, z: b.z, relevant: b.relevant });
  }
  return found.sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt).slice(0, limit);
}
