// Your own browsing by meaning, for the address bar and the search box: each page of your history, each bookmark and each
// download gets a vector from memory's embedding model (the one on your computer, when search by meaning is on), made
// in the background a batch at a time, the newest history first. What is embedded is only what you would read in a
// list: a page's title and its address without scheme or query string, a bookmark's title, address and folder, a
// download's file name and the site it came from. These vectors are private to this file's table (`browser_vectors`):
// they are never put in the vectors the app finds its own things by (find_vectors), and nothing agents can call reads
// them. A vector goes when what it is of goes (a page removed or cleared from the history, a bookmark deleted, a
// download cleared), and a changed title is embedded again.
import crypto from 'node:crypto';
import type { BookmarkNode } from '../../shared/browser.ts';
import type { DB } from '../db.ts';
import { embed, meaningOn, meaningReady, requestVector } from '../memory/embed.ts';
import { BYTES, quantize, queryTable, scale, scoreAt, VECTOR_MODEL } from '../memory/vectors.ts';
import { loadBookmarks } from './bookmarks.ts';
import { downloadsTable } from './downloads.ts';
import { table as historyTable } from './history.ts';

export type BrowsingKind = 'history' | 'bookmark' | 'download';
export const BROWSING_KINDS: BrowsingKind[] = ['history', 'bookmark', 'download'];

/** Characters of an item that are embedded. */
const TEXT_MAX = 300;
/** Items a batch embeds, the fewest that are worth starting the model for, and the wait between batches. */
const BATCH = 64;
const WORTH_STARTING = 48;
const PAUSE_MS = 10_000;
const RETRY_MS = 10 * 60_000;
/** The least cosine similarity a query and an item need to count as alike. */
export const MIN_ALIKE = 0.4;

const hashOf = (t: string) => crypto.createHash('sha1').update(t).digest('base64url').slice(0, 22);

// ---- what is embedded -------------------------------------------------------------------------------------------

/** An address as it is embedded: its site (without www.) and path, without the scheme, the query string or the #fragment. */
function plainAddress(url: string): string {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/i.exec(url);
  if (!m) return url.replace(/[?#].*$/s, '');
  let rest = m[2];
  try {
    rest = decodeURIComponent(rest);
  } catch {}
  return m[1].toLowerCase().replace(/^www\./, '') + (rest === '/' ? '' : rest);
}

const hostOf = (url: string) => /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1].toLowerCase().replace(/^www\./, '') ?? '';
const joinLines = (...parts: string[]) => parts.filter(Boolean).join('\n').replace(/[ \t]+/g, ' ').slice(0, TEXT_MAX);

export const historyText = (title: string, url: string) => joinLines(title, plainAddress(url));
export const bookmarkText = (title: string, url: string, folder?: string) => joinLines(title, plainAddress(url), folder ?? '');
export const downloadText = (name: string, url: string) => joinLines(name, hostOf(url));

// ---- the table, and its codes in memory -------------------------------------------------------------------------

interface Coded {
  code: Uint8Array;
  hash: string;
  /** The score factor of the code (see vectors.ts scale). */
  k: number;
}
type Codes = Map<BrowsingKind, Map<string, Coded>>;
const ready = new WeakSet<DB>();
const caches = new WeakMap<DB, Codes>();

function table(db: DB) {
  if (ready.has(db)) return;
  db.exec(`create table if not exists browser_vectors (
    kind text not null,
    ref text not null,
    hash text not null,
    model text not null,
    code blob not null,
    primary key (kind, ref)
  )`);
  ready.add(db);
}

/** A kind's codes, read once and kept in step with the table, so a query scans memory. */
function codes(db: DB, kind: BrowsingKind): Map<string, Coded> {
  table(db);
  let all = caches.get(db);
  if (!all) caches.set(db, (all = new Map()));
  let m = all.get(kind);
  if (!m) {
    m = new Map();
    for (const r of db.prepare('select ref, hash, code from browser_vectors where kind = ? and model = ?').iterate(kind, VECTOR_MODEL) as Iterable<{ ref: string; hash: string; code: Buffer }>)
      if (r.code.length === BYTES) {
        const code = new Uint8Array(r.code);
        m.set(r.ref, { code, hash: r.hash, k: scale(code, 0) });
      }
    all.set(kind, m);
  }
  return m;
}

/** Vectors made: kept, and in memory. */
function put(db: DB, rows: { kind: BrowsingKind; ref: string; hash: string; code: Uint8Array }[]) {
  table(db);
  const ins = db.prepare('insert or replace into browser_vectors (kind, ref, hash, model, code) values (?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const r of rows) ins.run(r.kind, r.ref, r.hash, VECTOR_MODEL, Buffer.from(r.code));
  })();
  for (const r of rows) codes(db, r.kind).set(r.ref, { code: r.code, hash: r.hash, k: scale(r.code, 0) });
}

/** Drops the vectors of these items (and the same from memory). */
export function dropVectors(db: DB, kind: BrowsingKind, refs: string[]) {
  if (!refs.length) return;
  table(db);
  const del = db.prepare('delete from browser_vectors where kind = ? and ref = ?');
  db.transaction(() => {
    for (const r of refs) del.run(kind, r);
  })();
  const m = codes(db, kind);
  for (const r of refs) m.delete(r);
}

/** After history pages went (removed, cleared, trimmed): no vector stays of a page that is not there. */
export function sweepHistoryVectors(db: DB) {
  table(db);
  historyTable(db);
  const gone = (db.prepare("select ref from browser_vectors where kind = 'history' and ref not in (select cast(id as text) from browser_history)").all() as { ref: string }[]).map((r) => r.ref);
  dropVectors(db, 'history', gone);
}

/** After downloads went (cleared, trimmed). */
export function sweepDownloadVectors(db: DB) {
  table(db);
  downloadsTable(db);
  const gone = (db.prepare("select ref from browser_vectors where kind = 'download' and ref not in (select cast(id as text) from browser_downloads)").all() as { ref: string }[]).map((r) => r.ref);
  dropVectors(db, 'download', gone);
}

/** The bookmarks as they are now: a vector of a bookmark that is gone, or whose title or address changed, goes (a changed one is made again). */
export function syncBookmarkVectors(db: DB, nodes: BookmarkNode[]) {
  table(db);
  const items = bookmarkItems(nodes);
  const have = codes(db, 'bookmark');
  if (!have.size) return;
  const gone: string[] = [];
  for (const [ref, c] of have) {
    const it = items.get(ref);
    if (!it || hashOf(it.text) !== c.hash) gone.push(ref);
  }
  dropVectors(db, 'bookmark', gone);
}

/** Every vector of your browsing, gone (for when everything is cleared). */
export function dropAllBrowserVectors(db: DB) {
  table(db);
  db.prepare('delete from browser_vectors').run();
  caches.delete(db);
}

// ---- making the vectors, in the background ----------------------------------------------------------------------

interface Item {
  kind: BrowsingKind;
  ref: string;
  text: string;
}

/** The bookmarks (not folders) as items, by id; a folder's name, when it is not the bar or Other bookmarks, goes with its bookmarks. */
function bookmarkItems(nodes: BookmarkNode[]): Map<string, Item> {
  const names = new Map(nodes.filter((n) => n.url === undefined).map((n) => [n.id, n.title]));
  const out = new Map<string, Item>();
  for (const n of nodes) if (n.url) out.set(n.id, { kind: 'bookmark', ref: n.id, text: bookmarkText(n.title, n.url, names.get(n.parent)) });
  return out;
}

/** Up to `limit` items without a vector: history newest first, then bookmarks, then downloads. */
function missing(db: DB, limit: number): Item[] {
  table(db);
  historyTable(db);
  downloadsTable(db);
  const out: Item[] = [];
  const hist = db
    .prepare(`select h.id, h.url, h.title from browser_history h left join browser_vectors v on v.kind = 'history' and v.ref = cast(h.id as text) and v.model = ? where v.ref is null order by h.at desc, h.id desc limit ?`)
    .all(VECTOR_MODEL, limit) as { id: number; url: string; title: string }[];
  for (const r of hist) out.push({ kind: 'history', ref: String(r.id), text: historyText(r.title, r.url) });
  if (out.length < limit) {
    const have = codes(db, 'bookmark');
    const mine = [...bookmarkItems(loadBookmarks(db)).values()].filter((it) => !have.has(it.ref));
    out.push(...mine.slice(0, limit - out.length));
  }
  if (out.length < limit) {
    const dl = db
      .prepare(`select d.id, d.name, d.url from browser_downloads d left join browser_vectors v on v.kind = 'download' and v.ref = cast(d.id as text) and v.model = ? where v.ref is null order by d.at desc, d.id desc limit ?`)
      .all(VECTOR_MODEL, limit - out.length) as { id: number; name: string; url: string }[];
    for (const r of dl) out.push({ kind: 'download', ref: String(r.id), text: downloadText(r.name, r.url) });
  }
  return out;
}

/** Whether each item is still there as it was embedded (looked up now, after the model's wait). */
function stillThere(db: DB, items: Item[]): (it: Item) => boolean {
  const marks = items.some((i) => i.kind === 'bookmark') ? bookmarkItems(loadBookmarks(db)) : null;
  historyTable(db);
  const hist = db.prepare('select url, title from browser_history where id = ?');
  downloadsTable(db);
  const dl = db.prepare('select name, url from browser_downloads where id = ?');
  return (it) => {
    if (it.kind === 'bookmark') return marks?.get(it.ref)?.text === it.text;
    if (it.kind === 'history') {
      const r = hist.get(Number(it.ref)) as { url: string; title: string } | undefined;
      return !!r && historyText(r.title, r.url) === it.text;
    }
    const r = dl.get(Number(it.ref)) as { name: string; url: string } | undefined;
    return !!r && downloadText(r.name, r.url) === it.text;
  };
}

/** How many items wait for a vector, counted up to `max`. */
export const waitingCount = (db: DB, max = BATCH) => missing(db, max).length;

/** How many items of each kind have a vector. */
export function browserVectorCounts(db: DB): Record<BrowsingKind, number> {
  return { history: codes(db, 'history').size, bookmark: codes(db, 'bookmark').size, download: codes(db, 'download').size };
}

/**
 * One batch: items without a vector, embedded as documents. Returns how many got one (0: none waits; -1: the model could
 * not answer now). `wait` starts the model when it is not running.
 */
export async function fillBrowserVectors(db: DB, o: { limit?: number; wait?: boolean } = {}): Promise<number> {
  const todo = missing(db, o.limit ?? BATCH);
  if (!todo.length) return 0;
  const vecs = await embed(
    db,
    todo.map((t) => t.text),
    'document',
    { wait: o.wait ?? true, timeoutMs: 120_000 },
  );
  if (!vecs || vecs.length !== todo.length) return -1;
  // What was removed or changed while the model worked gets no vector back.
  const there = stillThere(db, todo);
  const rows = todo.flatMap((t, i) => (there(t) ? [{ kind: t.kind, ref: t.ref, hash: hashOf(t.text), code: quantize(vecs[i]) }] : []));
  put(db, rows);
  return rows.length;
}

let started = false;
/**
 * Once: your history, bookmarks and downloads get their vectors in the background while search by meaning is on: a batch
 * every ten seconds, and the model is started for it only when enough waits (a page or two is found by its words).
 */
export function startBrowserVectors(db: DB) {
  if (started) return;
  started = true;
  let busy = false;
  let notBefore = Date.now() + 60_000;
  const tick = async () => {
    if (busy || Date.now() < notBefore || !meaningOn(db)) return;
    const n0 = waitingCount(db, BATCH);
    if (!n0) {
      notBefore = Date.now() + 60_000;
      return;
    }
    if (n0 < WORTH_STARTING && !meaningReady()) return;
    busy = true;
    try {
      if ((await fillBrowserVectors(db)) < 0) notBefore = Date.now() + RETRY_MS;
    } catch (e) {
      console.warn(`[browser] history by meaning: ${(e as Error).message}`);
      notBefore = Date.now() + RETRY_MS;
    } finally {
      busy = false;
    }
  };
  setInterval(() => void tick(), PAUSE_MS).unref();
}

// ---- finding ----------------------------------------------------------------------------------------------------

export interface Alike {
  kind: BrowsingKind;
  ref: string;
  /** Cosine similarity of the query and the item. */
  score: number;
}

/**
 * The items of these kinds alike in meaning to the words, best first: the cosine of the query's vector and the item's is
 * at least `min`. The query's vector comes from the model when it can answer within `waitMs` (a model not running is
 * started for what comes next); none: nothing is found. `vector` is a query vector the caller has already.
 */
export async function browsingAlike(db: DB, q: string, kinds: BrowsingKind[], o: { limit?: number; waitMs?: number; min?: number; vector?: Float32Array | null } = {}): Promise<Alike[]> {
  const text = q.trim();
  if (!text || !kinds.length) return [];
  const v = o.vector !== undefined ? o.vector : await requestVector(db, text, o.waitMs ?? 250);
  if (!v) return [];
  const t = queryTable(v);
  const min = o.min ?? MIN_ALIKE;
  const out: Alike[] = [];
  for (const kind of kinds)
    for (const [ref, c] of codes(db, kind)) {
      const s = scoreAt(t, c.code, 0) * c.k;
      if (s >= min) out.push({ kind, ref, score: s });
    }
  return out.sort((a, b) => b.score - a.score).slice(0, o.limit ?? 20);
}
