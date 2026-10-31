// Search everything (the search box, Ctrl+K): what it asks the server. By words the server finds sessions by
// title, messages that hold the words and memory notes. By meaning (memory's search by meaning, when it is on)
// it finds everything else too: the app's own pages, settings and actions, and sessions, apps, scheduled tasks,
// assistants, skills, pages and connected apps (sources.ts). Their vectors come from two places. What ships with
// the app has them in shipped-vectors.json, made ahead of time (npm run find:vectors), so no one computes them.
// What people make gets its vector the moment it is made or changed, as the pages are told (event, below), and
// keeps it in find_vectors by the hash of its text, 4 bits a number like memory's notes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { FindResponse, FoundNote, FoundSession } from '../../shared/find.ts';
import type { SearchHit, ServerEvent } from '../../shared/types.ts';
import { APP_ROOT } from '../config.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { searchSessions } from '../indexer/index.ts';
import { embed, meaningOn, meaningReady, queryVector } from '../memory/embed.ts';
import { findNotes } from '../memory/search.ts';
import { memoryOn } from '../memory/store.ts';
import { BYTES, quantize, queryTable, scale, scoreAt, VECTOR_MODEL } from '../memory/vectors.ts';
import { itemsOf, KINDS, MAX_SESSIONS, sessionItem, type Item, type Kind } from './sources.ts';

/**
 * Below this, a text is not taken as being about the query (mDenseOn, a query against an entry as the search box
 * writes them: the right one measured 0.36 to 0.51, in other languages too; the others mostly 0.21 to 0.31, a
 * related wrong one up to 0.46; a query about nothing here at most 0.24).
 */
export const MIN_SIMILARITY = 0.35;
export const SHIPPED_FILE = path.join(APP_ROOT, 'server/find/shipped-vectors.json');

export const hashOf = (text: string) => crypto.createHash('sha1').update(text).digest('base64url').slice(0, 22);

type D = Pick<Deps, 'db' | 'sessions' | 'scheduler'>;

// ---- vectors, by the hash of their text ---------------------------------------------------------

/** The vectors made ahead of time for what ships with the app (none when they were made for another model). */
let shipped: Map<string, Uint8Array> | null = null;
export function shippedVectors(): Map<string, Uint8Array> {
  if (shipped) return shipped;
  shipped = new Map();
  try {
    const f = JSON.parse(fs.readFileSync(SHIPPED_FILE, 'utf8')) as { model: string; vectors: Record<string, string> };
    if (f.model !== VECTOR_MODEL) console.warn(`[find] ${path.basename(SHIPPED_FILE)} was made for ${f.model}, not ${VECTOR_MODEL}: run npm run find:vectors`);
    else for (const [h, b64] of Object.entries(f.vectors)) shipped.set(h, new Uint8Array(Buffer.from(b64, 'base64')));
  } catch {}
  return shipped;
}

/** For tests: vectors made with a stand-in for the model, in place of the shipped ones. */
export const setShippedForTests = (m: Map<string, Uint8Array>) => {
  shipped = m;
};

const ready = new WeakSet<DB>();
let made: Map<string, Uint8Array> | null = null;
/** The vectors made here, read once into memory (a few thousand short texts: a megabyte or two). */
function madeHere(db: DB): Map<string, Uint8Array> {
  if (!ready.has(db)) {
    db.exec('create table if not exists find_vectors (hash text primary key, model text not null, code blob not null)');
    ready.add(db);
  }
  if (made) return made;
  made = new Map();
  for (const r of db.prepare('select hash, code from find_vectors where model = ?').iterate(VECTOR_MODEL) as Iterable<{ hash: string; code: Buffer }>)
    if (r.code.length === BYTES) made.set(r.hash, new Uint8Array(r.code));
  return made;
}

const vectorOf = (db: DB, hash: string) => shippedVectors().get(hash) ?? madeHere(db).get(hash);

/** Texts still without a vector, made in order in the background. */
const waiting = new Map<string, string>();
let making: Promise<void> | null = null;

function want(d: D, items: (Item & { hash: string })[]) {
  if (!meaningOn(d.db)) return;
  for (const it of items) if (!vectorOf(d.db, it.hash)) waiting.set(it.hash, it.text);
  if (waiting.size && !making) making = make(d.db).finally(() => (making = null));
}

async function make(db: DB) {
  try {
    while (waiting.size && meaningOn(db)) {
      const batch = [...waiting].slice(0, 64);
      const vecs = await embed(
        db,
        batch.map(([, t]) => t),
        'document',
        { wait: true, timeoutMs: 180_000 },
      );
      if (!vecs) break;
      const put = db.prepare('insert or replace into find_vectors (hash, model, code) values (?, ?, ?)');
      db.transaction(() =>
        batch.forEach(([h], i) => {
          const code = quantize(vecs[i]);
          put.run(h, VECTOR_MODEL, Buffer.from(code));
          madeHere(db).set(h, code);
          waiting.delete(h);
        }),
      )();
      await new Promise((r) => setImmediate(r));
    }
  } catch (e) {
    console.warn(`[find] vectors: ${(e as Error).message}`);
  }
}

/** For tests: the vectors of what is waiting, now. */
export const makeWaiting = async (db: DB) => {
  if (making) await making;
  await make(db);
};

// ---- what there is, kind by kind ------------------------------------------------------------------

const hashed = (items: Item[]) => items.map((it) => ({ ...it, hash: hashOf(it.text) }));
const lists = new Map<Kind, (Item & { hash: string })[]>();

function listOf(d: D, kind: Kind) {
  let l = lists.get(kind);
  if (!l) {
    try {
      l = hashed(itemsOf(kind, d));
    } catch (e) {
      console.warn(`[find] ${kind}: ${(e as Error).message}`);
      l = [];
    }
    lists.set(kind, l);
    want(d, l);
  }
  return l;
}

/** A kind's list changed: read it again, and make the vectors of what is new. */
function refresh(d: D, kind: Kind) {
  lists.delete(kind);
  listOf(d, kind);
}

const later = new Map<Kind, NodeJS.Timeout>();
function soon(d: D, kind: Kind) {
  clearTimeout(later.get(kind));
  const t = setTimeout(() => (later.delete(kind), refresh(d, kind)), 300);
  t.unref?.();
  later.set(kind, t);
}

/** The pages hear of each feature's list changing by its id. */
const FEATURE_KIND: Record<string, Kind> = { apps: 'apps', assistants: 'assistants', skillpack: 'skills', pages: 'pages', connections: 'connections' };
let wasOn: boolean | null = null;

/** An event went to the pages: what it changed gets its vector now. */
export function onEvent(e: ServerEvent, d: D) {
  if (e.t === 'sessions') {
    const l = lists.get('sessions');
    if (!l) return;
    const gone = new Set([...(e.remove ?? []), ...e.upsert.filter((s) => s.archived).map((s) => s.key)].map((k) => `s:${k}`));
    const fresh = hashed(e.upsert.filter((s) => !s.archived).map(sessionItem));
    const ids = new Set(fresh.map((x) => x.id));
    lists.set('sessions', [...fresh, ...l.filter((x) => !ids.has(x.id) && !gone.has(x.id))].slice(0, MAX_SESSIONS));
    want(d, fresh);
  } else if (e.t === 'tasks') soon(d, 'tasks');
  else if (e.t === 'feature') {
    const k = FEATURE_KIND[e.id];
    if (k) soon(d, k);
    // Search by meaning was just turned on: everything gets its vector.
    if (e.id === 'memory') {
      const on = meaningOn(d.db);
      if (on && wasOn === false) for (const kind of KINDS) refresh(d, kind);
      wasOn = on;
    }
  }
}

// ---- finding ----------------------------------------------------------------------------------

/** The items alike in meaning to the query's vector, best first. */
function alike(db: DB, items: (Item & { hash: string })[], q: Float32Array, limit: number): { id: string; score: number }[] {
  const t = queryTable(q);
  const out: { id: string; score: number }[] = [];
  for (const it of items) {
    const c = vectorOf(db, it.hash);
    if (!c) continue;
    const s = scoreAt(t, c, 0) * scale(c, 0);
    if (s >= MIN_SIMILARITY) out.push({ id: it.id, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** What a search finds on the server. */
export async function findAll(d: D, query: string): Promise<FindResponse> {
  const { db } = d;
  const q = query.trim().slice(0, 300);
  const out: FindResponse = { meaning: false, alike: [], sessions: [], messages: [], notes: [] };
  if (!q) return out;
  // By words: sessions by title, and messages that hold the words.
  const hits: SearchHit[] = searchSessions(db, q, 30);
  const sessions = new Map<string, FoundSession>();
  hits
    .filter((h) => h.kind === 'title')
    .forEach((h, i) => sessions.set(h.key, { key: h.key, agent: h.agent, title: h.title, cwd: h.cwd, updatedAt: h.updatedAt, score: 1 / (61 + i) }));
  out.messages = hits.filter((h) => h.kind !== 'title' && h.snippet).slice(0, 10);
  // By meaning, when it answers now (otherwise it starts, for the next search).
  const v = meaningOn(db) && q.length >= 3 ? await queryVector(db, q, { wait: false }) : null;
  if (v) {
    out.meaning = true;
    for (const kind of KINDS) if (kind !== 'sessions') out.alike.push(...alike(db, listOf(d, kind), v, 12));
    out.alike.sort((a, b) => b.score - a.score);
    alike(db, listOf(d, 'sessions'), v, 12).forEach((h, i) => {
      const key = h.id.slice(2);
      const s = sessions.get(key);
      if (s) {
        s.score += 1 / (61 + i);
        s.meaning = h.score;
      } else {
        const sum = d.sessions.summary(key);
        if (sum && !sum.archived) sessions.set(key, { key, agent: sum.agent, acpName: sum.acpName, title: sum.title, firstPrompt: sum.firstPrompt, cwd: sum.cwd, updatedAt: sum.updatedAt, meaning: h.score, score: 1 / (61 + i) });
      }
    });
  } else if (meaningOn(db) && !meaningReady()) for (const kind of KINDS) listOf(d, kind);
  out.sessions = [...sessions.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  if (memoryOn(db))
    out.notes = (await findNotes(db, { places: 'all', query: q, limit: 6, vector: v })).map(
      (f): FoundNote => ({ id: f.entry.id, scope: f.entry.scope, scopeKey: f.entry.scopeKey, kind: f.entry.kind, text: f.entry.text, updatedAt: f.entry.updatedAt, meaning: f.meaning }),
    );
  return out;
}

/** For tests: forget the lists read (the next search reads them again). */
export const dropLists = () => lists.clear();

export const find: Feature = {
  id: 'find',
  routes(d) {
    d.app.get('/api/find', async (req) => findAll(d, String((req.query as { q?: string }).q ?? '')));
  },
  event: onEvent,
  start(d) {
    wasOn = meaningOn(d.db);
    shippedVectors();
    // What was made while search by meaning was off (or before this version) gets its vector soon after start.
    setTimeout(() => {
      if (meaningOn(d.db)) for (const kind of KINDS) listOf(d, kind);
    }, 30_000).unref();
  },
};
