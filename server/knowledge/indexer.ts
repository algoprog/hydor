// Reading knowledge bases: each source's files (the files dropped on the page, or a folder on this computer,
// read where it is and looked over again now and then) are read once, cut into passages that keep the page,
// slide, sheet or heading they came from, and indexed by their words at once. Their vectors for search by
// meaning follow in the background, while it is on, so a big folder never holds anything up.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { TEXT_EXTS } from '../../shared/knowledge.ts';
import type { DB } from '../db.ts';
import { canRead, extractText } from '../documents/extract.ts';
import { embed, meaningHeld, meaningOn } from '../memory/embed.ts';
import { keep, release, searchBudget, used, type Kept } from '../memory/ram.ts';
import { BYTES, quantize, VECTOR_MODEL } from '../memory/vectors.ts';
import { htmlMarkdown } from '../web/fetch.ts';
import { baseRow, baseRows, docsOf, dropDoc, knowledgeSchema, saveDoc, sourcesOf } from './store.ts';
import { wikiActiveChecker, wikiSourceRoot } from '../wiki/knowledge/bindings.ts';
import { emitIndexed } from './events.ts';

/** Folders never read: tools' caches, dependencies, version control. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.cache', 'target', '.idea', '.vscode']);
/** Most files read from one folder, and most of a text file read (of a bigger one, its beginning; documents have their own limits). */
const MAX_FILES = 20_000;
const MAX_TEXT = 4 * 1024 * 1024;
const TEXT = new Set(TEXT_EXTS);

const isText = (f: string) => TEXT.has(path.extname(f).slice(1).toLowerCase());
/** Whether a file can go into a knowledge base. */
export const readable = (f: string) => canRead(f) || isText(f);

/** The files of a source to read: under the folder, skipping hidden and tool folders, at most MAX_FILES. A folder on a network share is slow to walk, so it never blocks the server. */
export async function filesUnder(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string, depth: number): Promise<void> => {
    if (out.length >= MAX_FILES || depth > 12) return;
    let list: fs.Dirent[];
    try {
      list = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || out.length >= MAX_FILES) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(p, depth + 1);
      } else if (e.isFile() && readable(p)) out.push(p);
    }
  };
  await walk(dir, 0);
  return out;
}

/**
 * `fn` over the items, a few at a time (a network share answers each call slowly, not all at once); the results in
 * order. Node does file calls on a pool of four threads that the whole app shares: a share that stalls holds two at most.
 */
async function inBatches<T, R>(items: T[], fn: (item: T) => Promise<R>, size = 2): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

// ---- passages ------------------------------------------------------------------------------------------

/** How long a passage may get, about how long the last one may be to stand alone, and how much the next repeats. */
const MAX = 1400;
const OVERLAP = 200;

/** A part's name from a heading: the page, slide or sheet as such; other headings as a path ("Methods › Data"). */
function partOf(title: string, level: number, heads: string[]): string {
  if (/^(Page|Slide) \d+/.test(title) || title.startsWith('Sheet: ')) {
    heads.length = 0;
    return title.replace(/^Sheet: (.*?)(?: \(first \d+ rows.*\))?$/, 'sheet $1');
  }
  heads.length = Math.max(0, level - 1);
  heads[level - 1] = title;
  return heads.filter(Boolean).join(' › ').slice(0, 160);
}

/** A section's text in passages of at most MAX, at paragraph (else sentence, else word) breaks, each opening with the end of the last. */
function pieces(text: string): string[] {
  const paras = text.split(/\n{2,}/).flatMap((p) => {
    if (p.length <= MAX) return [p];
    // A paragraph longer than a passage: at sentences, and a run-on at words.
    const out: string[] = [];
    let cur = '';
    for (const s of p.match(/[^.!?。！？\n]+[.!?。！？]*\s*|\n/g) ?? [p]) {
      if (cur.length + s.length > MAX && cur) {
        out.push(cur.trim());
        cur = '';
      }
      if (s.length > MAX) for (let i = 0; i < s.length; i += MAX) out.push(s.slice(i, i + MAX));
      else cur += s;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  });
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > MAX) {
      out.push(cur);
      // The next passage opens with the end of this one, from a word's start.
      const tail = cur.slice(-OVERLAP);
      cur = `${tail.slice(tail.search(/\s/) + 1)}\n\n${p}`;
    } else cur = cur ? `${cur}\n\n${p}` : p;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/** A document's text in passages, each with the part it is in (a page, a slide, a sheet, a heading). */
export function passages(text: string): { part?: string; text: string }[] {
  const out: { part?: string; text: string }[] = [];
  const heads: string[] = [];
  let part: string | undefined;
  let buf: string[] = [];
  const flush = () => {
    const t = buf.join('\n').trim();
    buf = [];
    if (t) for (const p of pieces(t)) out.push({ part, text: p });
  };
  for (const line of text.split('\n')) {
    const h = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line);
    if (h) {
      flush();
      part = partOf(h[2].trim(), h[1].length, heads);
    }
    buf.push(line);
  }
  flush();
  return out;
}

/** A file's text: a document read as text (PDF, Office…), a web page without its markup, or the text itself. */
export async function fileText(file: string): Promise<{ text: string; format: string; note?: string } | null> {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (canRead(file)) {
    const d = await extractText(file);
    return d ? { text: d.text, format: d.format, note: d.note } : null;
  }
  if (!isText(file)) return null;
  const st = fs.statSync(file);
  const big = st.size > MAX_TEXT;
  const raw = big ? textStart(file) : fs.readFileSync(file, 'utf8');
  if (raw.includes('\u0000')) throw new Error('Not a text file');
  // A very big one (a log, a data file): its beginning, saying so at its end as a long document's text does.
  const mb = (n: number) => (n / 1048576).toFixed(n < 10 * 1048576 ? 1 : 0).replace(/\.0$/, '');
  const cut = big ? `\n\n… (cut here: the first ${mb(MAX_TEXT)} MB of ${mb(st.size)} MB were read)` : '';
  if (ext === 'html' || ext === 'htm') return { text: htmlMarkdown(raw).markdown + cut, format: 'html' };
  return { text: raw + cut, format: ext || 'text' };
}

/** The first MAX_TEXT bytes of a text file, to the end of its last whole line (of one long line, its last whole character). */
function textStart(file: string): string {
  const buf = Buffer.alloc(MAX_TEXT);
  const fd = fs.openSync(file, 'r');
  let n: number;
  try {
    n = fs.readSync(fd, buf, 0, MAX_TEXT, 0);
  } finally {
    fs.closeSync(fd);
  }
  const end = buf.lastIndexOf(0x0a, n - 1);
  // Streaming, the decoder keeps back a character whose last bytes did not fit.
  return new TextDecoder().decode(buf.subarray(0, end > 0 ? end : n), { stream: true });
}

// ---- reading the sources ---------------------------------------------------------------------------------

/** Bases being read now, and how far: for the page. */
export const progress = new Map<string, { done: number; total: number }>();
const queue: string[] = [];
let busy = false;
let tell: (base: string) => void = () => {};
export const onIndexed = (fn: (base: string) => void) => (tell = fn);

/** Bases whose documents that could not be read are tried again too, when next read. */
const retry = new Set<string>();

/**
 * Reads a base again soon: what is new or changed in its sources, and forgets what is gone. With `failed`, the
 * documents that could not be read are tried again too (Read again now, and the first reading after the app starts:
 * a newer version may read them).
 */
export function scanSoon(db: DB, base: string, o: { failed?: boolean } = {}) {
  if (o.failed) retry.add(base);
  if (!queue.includes(base)) queue.push(base);
  if (!busy) void drain(db);
}

async function drain(db: DB) {
  busy = true;
  try {
    while (queue.length) {
      const base = queue.shift()!;
      try {
        await scan(db, base);
      } catch (e) {
        console.warn(`[knowledge] ${base}: ${(e as Error).message}`);
      }
      progress.delete(base);
      tell(base);
    }
  } finally {
    busy = false;
  }
  fillSoon(db);
}

async function scan(db: DB, base: string) {
  knowledgeSchema(db);
  baseRow(db, base);
  const sources = sourcesOf(db, base);
  const known = new Map(docsOf(db, base).map((d) => [d.path, d]));
  const found: { file: string; source: string }[] = [];
  for (const s of sources) {
    if (!(await fsp.access(s.path).then(() => true, () => false))) continue;
    const wiki = wikiSourceRoot(db, s.id);
    if (wiki && !wiki.active) continue;
    const files = await filesUnder(s.path);
    // One checker for the scan of a wiki: what its files share is asked once.
    const active = wiki ? wikiActiveChecker(wiki.root) : null;
    const keep = active ? await inBatches(files, (file) => active(file)) : files.map(() => true);
    files.forEach((file, i) => keep[i] && found.push({ file, source: s.id }));
  }
  const seen = new Set(found.map((f) => f.file));
  // Gone from the folder (or the folder is gone): out of the base.
  for (const [p, d] of known) if (!seen.has(p)) dropDoc(db, d.id);
  const failed = retry.delete(base);
  const changed = await inBatches(found, async ({ file }) => {
    const d = known.get(file);
    if (!d || (failed && d.status === 'error')) return true;
    try {
      const st = await fsp.stat(file);
      return st.size !== d.size || Math.abs(st.mtimeMs - d.mtime) > 1;
    } catch {
      return false;
    }
  });
  const todo = found.filter((_, i) => changed[i]);
  let last = 0;
  progress.set(base, { done: 0, total: todo.length });
  for (const [i, { file, source }] of todo.entries()) {
    await indexFile(db, base, source, file);
    progress.set(base, { done: i + 1, total: todo.length });
    // The page hears how far it got every few seconds.
    if (Date.now() - last > 3000) {
      last = Date.now();
      tell(base);
    }
  }
  db.prepare('update kb_bases set indexed_at = ? where id = ?').run(Date.now(), base);
}

async function indexFile(db: DB, base: string, source: string, file: string) {
  let st: fs.Stats;
  try {
    st = await fsp.stat(file);
  } catch {
    return;
  }
  const doc = { base, source, path: file, title: path.basename(file), size: st.size, mtime: st.mtimeMs };
  try {
    const t = await fileText(file);
    if (!t) return;
    const chunks = passages(t.text);
    saveDoc(db, { ...doc, format: t.format, status: chunks.length ? 'indexed' : 'empty', error: chunks.length ? undefined : (t.note ?? 'No text in it'), chunks });
    // New or changed, and read: whatever listens (wiki memory) may learn from it.
    if (chunks.length) emitIndexed({ base, path: file, title: doc.title });
  } catch (e) {
    saveDoc(db, { ...doc, format: path.extname(file).slice(1).toLowerCase(), status: 'error', error: String((e as Error).message ?? e).slice(0, 300), chunks: [] });
  }
}

/** Reads every base again (folders change while nobody looks); with `failed`, trying again what could not be read. */
export function scanAll(db: DB, o: { failed?: boolean } = {}) {
  for (const b of baseRows(db)) scanSoon(db, b.id, o);
}

// ---- vectors -------------------------------------------------------------------------------------------

let filling = false;
let fillTimer: NodeJS.Timeout | undefined;
/** When the model cannot run (setting itself up, starting, short of memory), how soon to try again. */
const RETRY_MS = 2 * 60_000;

/** Soon: vectors for the passages without one, while search by meaning is on. */
export function fillSoon(db: DB, ms = 3000) {
  clearTimeout(fillTimer);
  fillTimer = setTimeout(() => void fillVectors(db), ms);
  fillTimer.unref?.();
}

/** The text a passage's vector is made from: where it is from, then the passage. */
const vectorText = (r: { title: string; part: string | null; text: string }) => `${r.title}${r.part ? ` · ${r.part}` : ''}\n${r.text}`.slice(0, 2400);

export async function fillVectors(db: DB): Promise<number> {
  // Scheduled work may outlive the database that requested it.
  if (!db.open || filling || !meaningOn(db)) return 0;
  filling = true;
  let made = 0;
  let held = false;
  let told = Date.now();
  try {
    knowledgeSchema(db);
    const next = db.prepare(
      `select c.id as id, c.part as part, c.text as text, d.title as title from kb_chunks c join kb_docs d on d.id = c.doc
       left join kb_vectors v on v.chunk = c.id and v.model = ? where v.chunk is null limit 64`,
    );
    const put = db.prepare('insert or replace into kb_vectors (chunk, model, code) values (?, ?, ?)');
    for (;;) {
      const rows = next.all(VECTOR_MODEL) as { id: number; part: string | null; text: string; title: string }[];
      if (!rows.length) break;
      // Starts the worker when memory allows; null when it cannot run now (tried again in a while).
      const vecs = await embed(db, rows.map(vectorText), 'document', { wait: true, timeoutMs: 180_000 });
      // The database can close while the embedder is running.
      if (!db.open) return made;
      if (!vecs || vecs.length !== rows.length) {
        held = true;
        break;
      }
      db.transaction(() => rows.forEach((r, i) => put.run(r.id, VECTOR_MODEL, Buffer.from(quantize(vecs[i])))))();
      made += rows.length;
      dropVectorBlocks();
      // The pages hear how far it got every few seconds: a big base takes a while on a CPU.
      if (Date.now() - told > 3000) {
        told = Date.now();
        tell('');
      }
    }
  } catch (e) {
    held = true;
    console.warn(`[knowledge] vectors: ${(e as Error).message}`);
  } finally {
    filling = false;
  }
  // The pages hear the end, or why it waits (setting itself up, short of memory…), and it tries again in a while;
  // stopped, once Try again in Settings → Memory starts it again (the memory feature's event).
  if (made || held) tell('');
  if (held && db.open && meaningHeld(db)?.why !== 'failed') fillSoon(db, RETRY_MS);
  return made;
}

// ---- each base's vectors, as the search scans them -----------------------------------------------------

interface Block {
  db: DB;
  ids: Int32Array;
  codes: Uint8Array;
  n: number;
  /** Its place in the memory all search indexes share (ram.ts). */
  kept: Kept;
}

/** Bases' vectors kept in memory while the shared budget allows, until passages change; the rest are read from the database as scanned. */
const blocks = new Map<string, Block>();
/** How many vectors each base of each database has, until passages change: a base too big to keep is not counted at every search. */
let counts = new WeakMap<DB, Map<string, number>>();

export function dropVectorBlocks() {
  for (const b of blocks.values()) release(b.kept);
  blocks.clear();
  counts = new WeakMap();
}

const BASE_VECTORS = 'from kb_vectors v join kb_chunks c on c.id = v.chunk join kb_docs d on d.id = c.doc where d.base = ? and v.model = ?';

/** A base's vectors from memory, read when needed; null when they do not fit the budget now. */
function vectorBlock(db: DB, base: string): Block | null {
  const have = blocks.get(base);
  if (have && have.db === db) {
    used(have.kept);
    return have;
  }
  if (have) {
    release(have.kept);
    blocks.delete(base);
  }
  if (searchBudget() < BYTES) return null;
  let known = counts.get(db);
  if (!known) counts.set(db, (known = new Map()));
  let count = known.get(base);
  if (count === undefined) {
    count = (db.prepare(`select count(*) as n ${BASE_VECTORS} and length(v.code) = ?`).get(base, VECTOR_MODEL, BYTES) as { n: number }).n;
    known.set(base, count);
  }
  let b: Block;
  const kept = keep(count * (BYTES + 4), () => {
    if (blocks.get(base) === b) blocks.delete(base);
  });
  if (!kept) return null;
  b = { db, ids: new Int32Array(count), codes: new Uint8Array(count * BYTES), n: 0, kept };
  try {
    for (const r of db.prepare(`select v.chunk as id, v.code as code ${BASE_VECTORS}`).iterate(base, VECTOR_MODEL) as Iterable<{ id: number; code: Buffer }>) {
      if (b.n >= count || r.code.length !== BYTES) continue;
      b.ids[b.n] = r.id;
      b.codes.set(r.code, b.n * BYTES);
      b.n++;
    }
  } catch (e) {
    release(kept);
    throw e;
  }
  blocks.set(base, b);
  return b;
}

/** Each of a base's vectors, from memory when it is kept, else read from the database as it goes: `codes` at `off` is one's BYTES. */
export function scanVectors(db: DB, base: string, each: (id: number, codes: Uint8Array, off: number) => void) {
  const b = vectorBlock(db, base);
  if (b) {
    for (let i = 0, off = 0; i < b.n; i++, off += BYTES) each(b.ids[i], b.codes, off);
    return;
  }
  for (const r of db.prepare(`select v.chunk as id, v.code as code ${BASE_VECTORS}`).iterate(base, VECTOR_MODEL) as Iterable<{ id: number; code: Buffer }>) if (r.code.length === BYTES) each(r.id, r.code, 0);
}

/** The vectors of just these passages (those that have one), read by id. */
export function chunkVectors(db: DB, ids: Iterable<number>): Map<number, Uint8Array> {
  const out = new Map<number, Uint8Array>();
  const all = [...ids];
  for (let i = 0; i < all.length; i += 500) {
    const part = all.slice(i, i + 500);
    const rows = db.prepare(`select chunk, code from kb_vectors where model = ? and length(code) = ? and chunk in (${part.map(() => '?').join(',')})`).all(VECTOR_MODEL, BYTES, ...part) as { chunk: number; code: Buffer }[];
    for (const r of rows) out.set(r.chunk, r.code);
  }
  return out;
}
