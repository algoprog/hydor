// Past conversations by meaning, for search_sessions: each message a user wrote (the indexer's chunks of kind "user",
// which say what each session was about) gets a vector from memory's embedding model in the background, the newest
// first and a batch at a time, so the model never works long at once. A vector is kept by its chunk with the hash of
// its words: when the indexer reads a transcript afresh, its new chunks take the vectors of the same words instead of
// having them made again, and vectors whose chunk is gone are dropped once nothing waits. A search scores every
// message, keeps each session's best, and counts a session only when it stands out from the rest for that query.
import crypto from 'node:crypto';
import type { DB } from '../db.ts';
import { embed, meaningOn, meaningReady } from './embed.ts';
import { memoryOn } from './store.ts';
import { bulkStats, BYTES, quantize, queryTable, scale, scoreAt, VECTOR_MODEL } from './vectors.ts';

/** Characters of a message that are embedded (the model reads 512 tokens), and the fewest words worth a vector. */
const MAX_CHARS = 1500;
const MIN_WORDS = 3;
/** Messages per batch, and the wait between batches (longer when the model could not answer). */
const BATCH = 48;
const PAUSE_MS = 15_000;
const RETRY_MS = 10 * 60_000;
/** Standard deviations above the bulk of a query's similarities a session's best message must stand to count (as for notes: search.ts). */
const Z_MIN = 2.6;
/** A message too short for a vector: kept so it is not asked about again. */
const NONE = Buffer.alloc(0);

const hashOf = (t: string) => crypto.createHash('sha1').update(t).digest('base64url').slice(0, 22);
const textOf = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);

const ready = new WeakSet<DB>();
export function transcriptSchema(db: DB) {
  if (ready.has(db)) return;
  db.exec(`
    -- A user message's vector, for search_sessions by meaning: its chunk (chunk_text), its session, the hash of its
    -- words (what the indexer's new chunks of the same words reuse) and its 4-bit code (empty: too short for one).
    create table if not exists session_vectors (chunk integer primary key, key text not null, hash text not null, model text not null, code blob not null);
    create index if not exists session_vectors_hash on session_vectors(hash, model);
  `);
  ready.add(db);
}

/** How many of the users' messages have a vector, of all of them. */
export function transcriptCounts(db: DB): { embedded: number; total: number } {
  transcriptSchema(db);
  const total = (db.prepare("select count(*) as n from chunk_text where kind = 'user'").get() as { n: number }).n;
  const embedded = (db.prepare("select count(*) as n from chunk_text c join session_vectors v on v.chunk = c.id and v.model = ? where c.kind = 'user'").get(VECTOR_MODEL) as { n: number }).n;
  return { embedded, total };
}

/**
 * One batch: messages without a vector, the newest first; the same words as a message kept reuse its vector. Returns
 * how many got one (0: none waits; -1: the model could not answer now). `wait` starts the model when it is not running.
 */
export async function fillTranscripts(db: DB, o: { limit?: number; wait?: boolean } = {}): Promise<number> {
  transcriptSchema(db);
  const rows = db
    .prepare(`select c.id, c.key, c.text from chunk_text c left join session_vectors v on v.chunk = c.id and v.model = ? where c.kind = 'user' and v.chunk is null order by c.id desc limit ?`)
    .all(VECTOR_MODEL, o.limit ?? BATCH) as { id: number; key: string; text: string }[];
  if (!rows.length) {
    // Nothing waits: the vectors of chunks that are gone can go too.
    db.prepare('delete from session_vectors where not exists (select 1 from chunk_text c where c.id = session_vectors.chunk)').run();
    return 0;
  }
  const put = db.prepare('insert or replace into session_vectors (chunk, key, hash, model, code) values (?, ?, ?, ?, ?)');
  const same = db.prepare('select code from session_vectors where hash = ? and model = ? limit 1');
  const todo: { id: number; key: string; text: string; hash: string }[] = [];
  let done = 0;
  db.transaction(() => {
    for (const r of rows) {
      const text = textOf(r.text);
      const hash = hashOf(text);
      if (text.split(' ').length < MIN_WORDS) {
        put.run(r.id, r.key, hash, VECTOR_MODEL, NONE);
        continue;
      }
      const kept = same.get(hash, VECTOR_MODEL) as { code: Buffer } | undefined;
      if (kept) {
        put.run(r.id, r.key, hash, VECTOR_MODEL, kept.code);
        done++;
      } else todo.push({ id: r.id, key: r.key, text, hash });
    }
  })();
  if (!todo.length) return Math.max(done, 1);
  const vecs = await embed(
    db,
    todo.map((t) => t.text),
    'document',
    { wait: o.wait ?? true, timeoutMs: 180_000 },
  );
  if (!vecs || vecs.length !== todo.length) return done || -1;
  db.transaction(() => todo.forEach((t, i) => put.run(t.id, t.key, t.hash, VECTOR_MODEL, Buffer.from(quantize(vecs[i])))))();
  return done + todo.length;
}

/** Messages waiting for a vector, counted up to `max`. */
function waiting(db: DB, max: number): number {
  transcriptSchema(db);
  return (
    db
      .prepare(`select count(*) as n from (select 1 from chunk_text c left join session_vectors v on v.chunk = c.id and v.model = ? where c.kind = 'user' and v.chunk is null limit ?)`)
      .get(VECTOR_MODEL, max) as { n: number }
  ).n;
}

let started = false;
/**
 * Once: the messages get their vectors in the background while memory and search by meaning are on: whenever the
 * model is running anyway, and once a batch is waiting otherwise (a message or two is not worth starting it for).
 */
export function startTranscriptVectors(db: DB) {
  if (started) return;
  started = true;
  let busy = false;
  let notBefore = Date.now() + 2 * 60_000;
  const tick = async () => {
    if (busy || Date.now() < notBefore || !memoryOn(db) || !meaningOn(db)) return;
    const n0 = waiting(db, BATCH);
    if (!n0) {
      notBefore = Date.now() + 5 * 60_000;
      return;
    }
    if (n0 < BATCH && !meaningReady()) return;
    busy = true;
    try {
      const n = await fillTranscripts(db);
      if (n < 0) notBefore = Date.now() + RETRY_MS;
      else if (n === 0) notBefore = Date.now() + 5 * 60_000;
    } catch (e) {
      console.warn(`[memory] past conversations by meaning: ${(e as Error).message}`);
      notBefore = Date.now() + RETRY_MS;
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), PAUSE_MS).unref();
}

export interface SessionHit {
  key: string;
  /** The best message's similarity, and its chunk. */
  score: number;
  chunk: number;
}

/**
 * Sessions whose messages are nearest a query vector, each by its best message, best first: only those standing
 * out from the rest for this query. `keep` says which sessions may be found.
 */
export function nearSessions(db: DB, q: ArrayLike<number>, o: { limit: number; keep?: (key: string) => boolean }): SessionHit[] {
  transcriptSchema(db);
  const t = queryTable(q);
  const best = new Map<string, { score: number; chunk: number }>();
  const all: number[] = [];
  for (const r of db.prepare('select chunk, key, code from session_vectors where model = ? and length(code) = ?').iterate(VECTOR_MODEL, BYTES) as Iterable<{ chunk: number; key: string; code: Buffer }>) {
    const s = scoreAt(t, r.code, 0) * scale(r.code, 0);
    all.push(s);
    const b = best.get(r.key);
    if (!b || s > b.score) best.set(r.key, { score: s, chunk: r.chunk });
  }
  if (!all.length) return [];
  const { mean, sd } = bulkStats(all);
  return [...best]
    .filter(([key, b]) => (b.score - mean) / (sd || 1) >= Z_MIN && (!o.keep || o.keep(key)))
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, o.limit)
    .map(([key, b]) => ({ key, ...b }));
}
