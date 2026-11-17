// What the replay and the judging share: the collection with its vectors, one in-memory memory database per pool of
// notes (built with the app's own schema, so its own code runs on it), and the picking of notes written as the app does
// it (search.ts findNotes, inject.ts memoryParts) but with every number a parameter.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type { MemoryEntry } from '../../shared/memory.ts';
import type { DB } from '../../server/db.ts';
import { boost, MIN_SIMILARITY, wordHits, anyWords } from '../../server/memory/search.ts';
import { entries, memorySchema, type Place } from '../../server/memory/store.ts';
import { BYTES, nearest, quantize, VECTOR_MODEL, type ScanStats, type VectorHit } from '../../server/memory/vectors.ts';
import { MEMORY_BUDGET, SMALL_PLACE } from '../../server/memory/inject.ts';
import { assertCopy, DB_COPY, OUT, textKey, versionAt, type Collection, type QueryRec } from './common.ts';
import { identifierNotes } from './ident.ts';

export const RRF_K = 60;
/** The app's constants (search.ts) as far as they are not exported. */
export const FLOOR = 0.15;
export const Z_NOTES = 12;
const PER_NOTE = 400;
const REQUEST_HEAD_CHARS = 'From memory (see Memory from earlier sessions in your instructions), the notes that bear most on this:'.length;
export const K = 10;
export const LIMIT = K * 3;

export interface Loaded {
  col: Collection;
  vectors: { docs: Record<string, string>; queries: Record<string, string> };
  stored: Map<number, Buffer>;
}

export function load(): Loaded {
  assertCopy(DB_COPY);
  const col: Collection = JSON.parse(fs.readFileSync(path.join(OUT, 'collection.json'), 'utf8'));
  const vectors = JSON.parse(fs.readFileSync(path.join(OUT, 'vectors.json'), 'utf8'));
  const copy = new Database(DB_COPY, { readonly: true });
  const stored = new Map<number, Buffer>();
  for (const r of copy.prepare('select entry, code from memory_vectors').all() as { entry: number; code: Buffer }[]) stored.set(r.entry, r.code);
  copy.close();
  return { col, vectors, stored };
}

const f32 = (b64: string) => new Float32Array(Buffer.from(b64, 'base64').buffer.slice(0));

export interface PoolDb {
  db: DB;
  places: Place[];
  /** Pool notes as of the query: id -> entry. */
  small: Set<string>;
  texts: Map<number, string>;
}

const cache = new Map<string, PoolDb>();

/** An in-memory memory database holding the pool of a query as it was then (texts, vectors, links). */
export function poolDb(L: Loaded, q: QueryRec): PoolDb {
  const ns = q.pool.map((id) => L.col.notes[id]);
  const sig = ns.map((n) => `${n.id}:${versionAt(n, q.ts)}`).join(',') + '|' + q.repo;
  const have = cache.get(sig);
  if (have) {
    cache.delete(sig);
    cache.set(sig, have);
    return have;
  }
  const db = new Database(':memory:') as unknown as DB;
  memorySchema(db);
  const put = db.prepare("insert into memory_entries (id, scope, scope_key, text, status, created_at, updated_at, kind) values (?, ?, ?, ?, 'active', ?, ?, ?)");
  const putV = db.prepare('insert into memory_vectors (entry, model, code) values (?, ?, ?)');
  const link = db.prepare('insert or ignore into memory_links (parent, child) values (?, ?)');
  const ids = new Set(q.pool);
  const texts = new Map<number, string>();
  db.transaction(() => {
    for (const n of ns) {
      const v = versionAt(n, q.ts);
      const text = n.versions[v].text;
      texts.set(n.id, text);
      put.run(n.id, n.scope, n.scopeKey, text, n.created, Math.max(n.created, n.versions[v].at), n.kind);
      const key = `${n.id}:${v}`;
      // The app's own stored vector where it is of this very text, else one made here the same way.
      const own = v === n.versions.length - 1 ? L.stored.get(n.id) : undefined;
      const code = own && own.length === BYTES ? own : Buffer.from(quantize(f32(L.vectors.docs[key])));
      putV.run(n.id, VECTOR_MODEL, code);
    }
    for (const n of ns) for (const c of n.children) if (ids.has(c)) link.run(n.id, c);
  })();
  const places: Place[] = [
    { scope: 'global', scopeKey: '' },
    { scope: 'repo', scopeKey: q.repo },
  ];
  // A place with no topics and little kept is given whole: not part of what picking decides (inject.ts).
  const small = new Set<string>();
  for (const p of places) {
    const here = ns.filter((n) => n.scope === p.scope && n.scopeKey === p.scopeKey);
    const chars = here.filter((n) => n.kind === 'note').reduce((s, n) => s + (texts.get(n.id)?.length ?? 0), 0);
    if (!here.some((n) => n.kind === 'topic') && chars <= SMALL_PLACE) small.add(`${p.scope}|${p.scopeKey}`);
  }
  const pd = { db, places, small, texts };
  cache.set(sig, pd);
  if (cache.size > 40) {
    // Left for the garbage collector: bases of earlier queries still hold theirs.
    cache.delete(cache.keys().next().value!);
  }
  return pd;
}

export const queryVec = (L: Loaded, q: QueryRec) => f32(L.vectors.queries[textKey(q.text)]);

// ---- the search, as findNotes does it ---------------------------------------------------------------

export interface Base {
  q: QueryRec;
  pd: PoolDb;
  byWords: number[];
  hits: VectorHit[];
  stats: ScanStats;
  ents: Map<number, MemoryEntry>;
  /** Per word weight: the fused list, best first, cut to LIMIT as findNotes does. */
  ranked: Map<number, Ranked[]>;
  idents: Map<number, number[]>;
}

export interface Ranked {
  id: number;
  score: number;
  meaning?: number;
  z?: number;
  wordRank?: number;
}

/** What findNotes gathers for a request, before its fusion: the words' list, the meaning's list and the bulk statistics. */
export function gather(L: Loaded, q: QueryRec): Base {
  const pd = poolDb(L, q);
  const fts = anyWords(q.text);
  const pool = Math.max(50, LIMIT * 3);
  const byWords = fts ? wordHits(pd.db, pd.places, fts, { limit: pool, now: q.ts, kinds: ['note', 'topic'] }) : [];
  const stats: ScanStats = { n: 0, mean: 0, sd: 0 };
  const hits = nearest(pd.db, pd.places, queryVec(L, q), { k: pool, min: FLOOR, now: q.ts, stats });
  const ids = new Set<number>([...byWords, ...hits.map((h) => h.id)]);
  const ents = new Map<number, MemoryEntry>();
  for (const e of entries(pd.db, { ids: [...ids], live: q.ts, kinds: ['note', 'topic'], limit: ids.size })) ents.set(e.id, e);
  return { q, pd, byWords, hits, stats, ents, ranked: new Map(), idents: new Map() };
}

/** The fused list for a word weight (search.ts findNotes after its two lists): best first, LIMIT of them. */
export function rank(b: Base, wWords: number, wMeaning = 1): Ranked[] {
  const have = b.ranked.get(wWords);
  if (have) return have;
  const fused = new Map<number, { rrf: number; wordRank?: number; meaning?: number }>();
  b.byWords.forEach((id, i) => fused.set(id, { rrf: wWords / (RRF_K + i + 1), wordRank: i }));
  b.hits.forEach((h, i) => {
    const f = fused.get(h.id) ?? { rrf: 0 };
    f.rrf += wMeaning / (RRF_K + i + 1);
    f.meaning = h.score;
    fused.set(h.id, f);
  });
  const out: (Ranked & { updated: number })[] = [];
  for (const [id, f] of fused) {
    const e = b.ents.get(id);
    if (!e) continue;
    const z = f.meaning != null && b.stats.n >= Z_NOTES && b.stats.sd > 1e-6 ? (f.meaning - b.stats.mean) / b.stats.sd : undefined;
    out.push({ id, score: f.rrf * boost(e, b.q.ts), meaning: f.meaning, z, wordRank: f.wordRank, updated: e.updatedAt });
  }
  const sorted = out.sort((a, c) => c.score - a.score || c.updated - a.updated).slice(0, LIMIT);
  b.ranked.set(wWords, sorted);
  return sorted;
}

/** Whether a similarity bears on the request at a z bar (search.ts bears). */
export function bearsAt(r: Ranked, stats: ScanStats, zMin: number): boolean {
  if (r.meaning == null) return false;
  if (stats.n < Z_NOTES || stats.sd <= 1e-6) return r.meaning >= MIN_SIMILARITY;
  return (r.z ?? -Infinity) >= zMin;
}

export function identOf(b: Base, frac: number): number[] {
  const have = b.idents.get(frac);
  if (have) return have;
  const ids = b.q.pool;
  const idx = identifierNotes(b.q.text, ids.map((id) => b.pd.texts.get(id) ?? ''), frac);
  const out = idx.map((i) => ids[i]);
  b.idents.set(frac, out);
  return out;
}

// ---- what is given, as memoryParts does it ---------------------------------------------------------

export interface Cfg {
  /** Weight of the words' list in the fusion (meaning's is 1). */
  w: number;
  /** Bar (standard deviations) for a first message, and for later ones. */
  z: number;
  zTurn: number;
  /** Identifier rule: share of the pool a token may be in (null: rule off). */
  ident: number | null;
  k?: number;
}

const line = (e: MemoryEntry, text: string) => {
  const t = text.replace(/\s+/g, ' ');
  return e.kind === 'topic' ? `- ${t} [#${e.id}, sums up ${e.covers ?? 0} notes]` : `- ${t} [#${e.id}]`;
};

const placeOf = (e: { scope: string; scopeKey: string }) => `${e.scope}|${e.scopeKey}`;

/**
 * The ids given with the request, in order: the best-ranked of those that bear on it (and the identifier rule's notes),
 * at most k, from the places that are not given whole, as long as they fit the room, leaving out `skip` (given earlier).
 */
export function givenFor(b: Base, cfg: Cfg, skip: Set<number>): { ids: number[]; ranking: number[] } {
  const k = cfg.k ?? K;
  const list = rank(b, cfg.w);
  const bar = b.q.turn === 0 ? cfg.z : cfg.zTurn;
  const ident = cfg.ident != null ? identOf(b, cfg.ident) : [];
  const found: number[] = list.filter((r) => bearsAt(r, b.stats, bar) || ident.includes(r.id)).map((r) => r.id);
  for (const id of ident) if (!found.includes(id)) found.push(id);
  const ids: number[] = [];
  let room = Math.max(MEMORY_BUDGET, k * PER_NOTE) - REQUEST_HEAD_CHARS;
  const titled = new Set<string>();
  for (const id of found) {
    if (ids.length >= k) break;
    if (!b.pd.texts.has(id) || skip.has(id)) continue;
    const e = b.ents.get(id) ?? entries(b.pd.db, { ids: [id], live: b.q.ts, limit: 1 })[0];
    if (!e || b.pd.small.has(placeOf(e))) continue;
    const title = e.scope === 'global' ? 'About the user:' : `This project (${e.scopeKey}):`;
    const cost = line(e, b.pd.texts.get(id)!).length + 1 + (titled.has(placeOf(e)) ? 0 : title.length + 2);
    if (cost > room) continue;
    room -= cost;
    titled.add(placeOf(e));
    ids.push(id);
  }
  // The same list without the bar, for recall and precision at k: what ranking alone puts first.
  const ranking = list.filter((r) => !skip.has(r.id) && !b.pd.small.has(placeOf(b.ents.get(r.id)!))).map((r) => r.id);
  return { ids, ranking };
}

