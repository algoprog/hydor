// Vectors for search by meaning. Each note's embedding (MODEL, DIM numbers of unit length) is kept in a few
// bits a number, on levels fitted once per dimension to texts in the model's nine languages (codebook.ts,
// made by scripts/memory-embeddings): 384 bytes a note at 4 bits. A query stays in full precision, and its
// score against a note is the sum, over the note's bytes, of a table made once per query: a scan reads
// each note's bytes once and adds them up. Each place's vectors are kept in memory within a budget (about
// a 64th of the computer's memory, at most 512 MB); a place bigger than that is read from the database
// each time it is scanned, so millions of notes never have to fit in memory.
import os from 'node:os';
import type { DB } from '../db.ts';
import { CODEBOOK } from './codebook.ts';
import { memorySchema, onEntriesChanged, placeKey, placeSql, type Place } from './store.ts';

export const MODEL = CODEBOOK.model;
export const DIM = CODEBOOK.dim;
const BITS = CODEBOOK.bits;
const K = 1 << BITS;
/** What each stored vector says it was made with: another model or codebook means making them again. */
export const VECTOR_MODEL = `${MODEL}@${CODEBOOK.version}`;
/** Bytes a note. */
export const BYTES = (DIM * BITS) / 8;

const levels = new Float32Array(Uint8Array.from(Buffer.from(CODEBOOK.levels, 'base64')).buffer);
if (levels.length !== DIM * K) throw new Error('memory codebook: wrong size');
// The midpoints between neighbouring levels: a number's code is how many of its dimension's it is above.
const cuts = new Float32Array(DIM * (K - 1));
for (let d = 0; d < DIM; d++) for (let k = 0; k < K - 1; k++) cuts[d * (K - 1) + k] = (levels[d * K + k] + levels[d * K + k + 1]) / 2;
// What each value of each byte adds to a stored vector's squared length, to divide scores by its length.
const squares = queryTable(new Float32Array(DIM), true);

/** For tests: the levels now, to put back after setting others. */
export const codebookForTests = () => levels.slice();

/** For tests: other levels (DIM x K, each dimension's rising), for made-up vectors unlike the model's. */
export function setCodebookForTests(next: Float32Array) {
  if (next.length !== levels.length) throw new Error('wrong size');
  levels.set(next);
  for (let d = 0; d < DIM; d++) for (let k = 0; k < K - 1; k++) cuts[d * (K - 1) + k] = (levels[d * K + k] + levels[d * K + k + 1]) / 2;
  squares.set(queryTable(new Float32Array(DIM), true));
}

/** A unit vector in BITS bits a number. */
export function quantize(v: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(BYTES);
  for (let d = 0; d < DIM; d++) {
    const c = d * (K - 1);
    let lo = 0;
    let hi = K - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (v[d] > cuts[c + m]) lo = m + 1;
      else hi = m;
    }
    if (BITS === 8) out[d] = lo;
    else out[d >> 1] |= d & 1 ? lo << 4 : lo;
  }
  return out;
}

/** A stored vector back as numbers (each dimension's level, scaled to length 1 when the codebook says so). */
export function dequantize(code: Uint8Array, off = 0): Float32Array {
  const v = new Float32Array(DIM);
  for (let d = 0; d < DIM; d++) {
    const c = BITS === 8 ? code[off + d] : d & 1 ? code[off + (d >> 1)] >> 4 : code[off + (d >> 1)] & 15;
    v[d] = levels[d * K + c];
  }
  const k = scale(code, off);
  if (k !== 1) for (let d = 0; d < DIM; d++) v[d] *= k;
  return v;
}

/** For one query: what each value of each of a note's bytes adds to its score (`square`: to its squared length). */
export function queryTable(q: ArrayLike<number>, square = false): Float32Array {
  const t = new Float32Array(BYTES * 256);
  const f = (d: number, c: number) => (square ? levels[d * K + c] ** 2 : q[d] * levels[d * K + c]);
  if (BITS === 8) {
    for (let d = 0; d < DIM; d++) for (let c = 0; c < 256; c++) t[d * 256 + c] = f(d, c);
    return t;
  }
  for (let j = 0; j < BYTES; j++) {
    const a = 2 * j;
    const base = j * 256;
    for (let h = 0; h < 16; h++) {
      const vb = f(a + 1, h);
      for (let l = 0; l < 16; l++) t[base + (h << 4) + l] = f(a, l) + vb;
    }
  }
  return t;
}

/** What a stored vector's score is multiplied by: one over its length, when the codebook says so. */
export const scale = (codes: Uint8Array, off: number) => (CODEBOOK.renorm ? 1 / Math.sqrt(scoreAt(squares, codes, off)) : 1);

/** A note's score for the query whose table `t` is: the dot product with its stored vector. */
export function scoreAt(t: Float32Array, codes: Uint8Array, off: number): number {
  let s = 0;
  for (let j = 0, base = 0; j < BYTES; j++, base += 256) s += t[base + codes[off + j]];
  return s;
}

// ---- each place's vectors -----------------------------------------------------------------------

interface Block {
  ids: Int32Array;
  codes: Uint8Array;
  /** Each vector's score factor (see scale). */
  scales: Float64Array;
  /** End dates (0: none), to leave out what expired since it was read. */
  expires: Float64Array;
  n: number;
  at: number;
}

/** Memory for the vectors kept: a 64th of the computer's, between 32 and 512 MB. */
let budget = Math.min(512, Math.max(32, Math.round(os.totalmem() / 64 / 2 ** 20))) * 2 ** 20;
const blocks = new WeakMap<DB, Map<string, Block>>();
let held = 0;

export function setVectorBudget(bytes: number) {
  budget = bytes;
}

function forget(db: DB, place?: Place) {
  const m = blocks.get(db);
  if (!m) return;
  for (const [k, b] of m)
    if (!place || k === placeKey(place)) {
      held -= b.codes.byteLength;
      m.delete(k);
    }
}
onEntriesChanged(forget);

const blockSql = `select e.id as id, coalesce(e.expires_at, 0) as expires, v.code as code from memory_vectors v join memory_entries e on e.id = v.entry
  where e.scope = ? and e.scope_key = ? and e.status = 'active' and v.model = ?`;

/** A place's vectors from memory, read when needed; null when they would take more than the budget. */
function block(db: DB, p: Place): Block | null {
  let m = blocks.get(db);
  if (!m) blocks.set(db, (m = new Map()));
  const k = placeKey(p);
  const have = m.get(k);
  if (have) {
    have.at = Date.now();
    return have;
  }
  const n = (db.prepare(`select count(*) as n from (${blockSql})`).get(p.scope, p.scopeKey, VECTOR_MODEL) as { n: number }).n;
  if (n * BYTES > budget) return null;
  const b: Block = { ids: new Int32Array(n), codes: new Uint8Array(n * BYTES), scales: new Float64Array(n), expires: new Float64Array(n), n: 0, at: Date.now() };
  for (const r of db.prepare(blockSql).iterate(p.scope, p.scopeKey, VECTOR_MODEL) as Iterable<{ id: number; expires: number; code: Buffer }>) {
    if (b.n >= n || r.code.length !== BYTES) continue;
    b.ids[b.n] = r.id;
    b.expires[b.n] = r.expires;
    b.codes.set(r.code, b.n * BYTES);
    b.scales[b.n] = scale(b.codes, b.n * BYTES);
    b.n++;
  }
  // The least recently used places make room.
  held += b.codes.byteLength;
  const all = [...m.entries()].sort((x, y) => x[1].at - y[1].at);
  while (held > budget && all.length) {
    const [ok, ob] = all.shift()!;
    held -= ob.codes.byteLength;
    m.delete(ok);
  }
  m.set(k, b);
  return b;
}

export interface VectorHit {
  id: number;
  /** Cosine similarity with the query (of the stored, quantized vector). */
  score: number;
}

/** Keeps the k best of what it is offered. */
class Best {
  ids: number[] = [];
  scores: number[] = [];
  constructor(private k: number) {}
  get floor() {
    return this.ids.length < this.k ? -Infinity : this.scores[this.scores.length - 1];
  }
  offer(id: number, s: number) {
    if (s <= this.floor) return;
    let i = this.scores.length;
    while (i > 0 && this.scores[i - 1] < s) i--;
    this.scores.splice(i, 0, s);
    this.ids.splice(i, 0, id);
    if (this.ids.length > this.k) this.ids.pop(), this.scores.pop();
  }
  hits(): VectorHit[] {
    return this.ids.map((id, i) => ({ id, score: this.scores[i] }));
  }
}

/** The places that have vectors. */
function vectorPlaces(db: DB): Place[] {
  return (db.prepare("select distinct e.scope as scope, e.scope_key as scopeKey from memory_vectors v join memory_entries e on e.id = v.entry where e.status = 'active'").all() as Place[]).map((p) => ({ ...p }));
}

/** The notes nearest a query vector in these places (or all), best first, at least `min` alike. */
export function nearest(db: DB, places: Place[] | 'all', q: ArrayLike<number>, o: { k: number; min?: number; now?: number; skip?: Set<number> }): VectorHit[] {
  memorySchema(db);
  const now = o.now ?? Date.now();
  const t = queryTable(q);
  const best = new Best(o.k);
  const min = o.min ?? -Infinity;
  for (const p of places === 'all' ? vectorPlaces(db) : places) {
    const b = block(db, p);
    if (b) {
      for (let i = 0; i < b.n; i++) {
        if ((b.expires[i] && b.expires[i] <= now) || o.skip?.has(b.ids[i])) continue;
        const s = scoreAt(t, b.codes, i * BYTES) * b.scales[i];
        if (s >= min) best.offer(b.ids[i], s);
      }
      continue;
    }
    // Too big to keep: read it as it is scanned.
    for (const r of db.prepare(blockSql).iterate(p.scope, p.scopeKey, VECTOR_MODEL) as Iterable<{ id: number; expires: number; code: Buffer }>) {
      if ((r.expires && r.expires <= now) || o.skip?.has(r.id) || r.code.length !== BYTES) continue;
      const s = scoreAt(t, r.code, 0) * scale(r.code, 0);
      if (s >= min) best.offer(r.id, s);
    }
  }
  return best.hits();
}

// ---- keeping them -------------------------------------------------------------------------------

/** Saves notes' vectors (made from their text as it is now). */
export function setVectors(db: DB, rows: { id: number; vector: ArrayLike<number> }[]) {
  if (!rows.length) return;
  memorySchema(db);
  const put = db.prepare('insert into memory_vectors (entry, model, code) values (?, ?, ?) on conflict(entry) do update set model = excluded.model, code = excluded.code');
  const places = new Map<string, Place>();
  const where = db.prepare('select scope, scope_key as scopeKey from memory_entries where id = ?');
  db.transaction(() => {
    for (const r of rows) {
      const p = where.get(r.id) as Place | undefined;
      if (!p) continue;
      put.run(r.id, VECTOR_MODEL, Buffer.from(quantize(r.vector)));
      places.set(placeKey(p), p);
    }
  })();
  for (const p of places.values()) forget(db, p);
}

/** Active notes without a vector of this model and codebook, the latest first. */
export function missingVectors(db: DB, limit: number): { id: number; text: string }[] {
  memorySchema(db);
  return db
    .prepare(
      `select e.id, e.text from memory_entries e left join memory_vectors v on v.entry = e.id
       where e.status = 'active' and (v.entry is null or v.model != ?) order by e.updated_at desc limit ?`,
    )
    .all(VECTOR_MODEL, limit) as { id: number; text: string }[];
}

/** How many active notes have their vector. */
export function vectorCounts(db: DB): { embedded: number; total: number } {
  memorySchema(db);
  const r = db
    .prepare(
      `select count(*) as total, sum(case when v.model = ? then 1 else 0 end) as embedded
       from memory_entries e left join memory_vectors v on v.entry = e.id where e.status = 'active'`,
    )
    .get(VECTOR_MODEL) as { total: number; embedded: number | null };
  return { embedded: r.embedded ?? 0, total: r.total };
}

/** Stored vectors of some notes, as numbers. */
export function vectorsOf(db: DB, ids: number[]): Map<number, Float32Array> {
  memorySchema(db);
  const out = new Map<number, Float32Array>();
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const rows = db.prepare(`select entry, code from memory_vectors where model = ? and entry in (${part.map(() => '?').join(',')})`).all(VECTOR_MODEL, ...part) as { entry: number; code: Buffer }[];
    for (const r of rows) if (r.code.length === BYTES) out.set(r.entry, dequantize(r.code));
  }
  return out;
}

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < DIM; i++) s += a[i] * b[i];
  return s;
};

/** For tests: forget every place kept in memory. */
export const dropVectorCache = (db: DB) => forget(db);

export { placeSql };
