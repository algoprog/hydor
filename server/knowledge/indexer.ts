// Reading knowledge bases: each source's files (the files dropped on the page, or a folder on this computer,
// read where it is and looked over again now and then) are read once, cut into passages that keep the page,
// slide, sheet or heading they came from, and indexed by their words at once. Their vectors for search by
// meaning follow in the background, while it is on, so a big folder never holds anything up.
import fs from 'node:fs';
import path from 'node:path';
import { TEXT_EXTS } from '../../shared/knowledge.ts';
import type { DB } from '../db.ts';
import { canRead, extractText } from '../documents/extract.ts';
import { embed, meaningOn } from '../memory/embed.ts';
import { quantize, VECTOR_MODEL } from '../memory/vectors.ts';
import { htmlMarkdown } from '../web/fetch.ts';
import { baseRow, baseRows, docsOf, dropDoc, knowledgeSchema, saveDoc, sourcesOf } from './store.ts';

/** Folders never read: tools' caches, dependencies, version control. */
const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.cache', 'target', '.idea', '.vscode']);
/** Most files read from one folder, and the largest text file (documents have their own limit). */
const MAX_FILES = 20_000;
const MAX_TEXT = 4 * 1024 * 1024;
const TEXT = new Set(TEXT_EXTS);

const isText = (f: string) => TEXT.has(path.extname(f).slice(1).toLowerCase());
/** Whether a file can go into a knowledge base. */
export const readable = (f: string) => canRead(f) || isText(f);

/** The files of a source to read: under the folder, skipping hidden and tool folders, at most MAX_FILES. */
export function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string, depth: number) => {
    if (out.length >= MAX_FILES || depth > 12) return;
    let list: fs.Dirent[];
    try {
      list = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || out.length >= MAX_FILES) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p, depth + 1);
      } else if (e.isFile() && readable(p)) out.push(p);
    }
  };
  walk(dir, 0);
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
  if (st.size > MAX_TEXT) throw new Error(`${Math.round(st.size / 1048576)} MB of text: too big to read here`);
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.includes('\u0000')) throw new Error('Not a text file');
  if (ext === 'html' || ext === 'htm') return { text: htmlMarkdown(raw).markdown, format: 'html' };
  return { text: raw, format: ext || 'text' };
}

// ---- reading the sources ---------------------------------------------------------------------------------

/** Bases being read now, and how far: for the page. */
export const progress = new Map<string, { done: number; total: number }>();
const queue: string[] = [];
let busy = false;
let tell: (base: string) => void = () => {};
export const onIndexed = (fn: (base: string) => void) => (tell = fn);

/** Reads a base again soon: what is new or changed in its sources, and forgets what is gone. */
export function scanSoon(db: DB, base: string) {
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
    if (!fs.existsSync(s.path)) continue;
    for (const file of filesUnder(s.path)) found.push({ file, source: s.id });
  }
  const seen = new Set(found.map((f) => f.file));
  // Gone from the folder (or the folder is gone): out of the base.
  for (const [p, d] of known) if (!seen.has(p)) dropDoc(db, d.id);
  const todo = found.filter(({ file }) => {
    const d = known.get(file);
    if (!d) return true;
    try {
      const st = fs.statSync(file);
      return st.size !== d.size || Math.abs(st.mtimeMs - d.mtime) > 1;
    } catch {
      return false;
    }
  });
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
    st = fs.statSync(file);
  } catch {
    return;
  }
  const doc = { base, source, path: file, title: path.basename(file), size: st.size, mtime: st.mtimeMs };
  try {
    const t = await fileText(file);
    if (!t) return;
    const chunks = passages(t.text);
    saveDoc(db, { ...doc, format: t.format, status: chunks.length ? 'indexed' : 'empty', error: chunks.length ? undefined : (t.note ?? 'No text in it'), chunks });
  } catch (e) {
    saveDoc(db, { ...doc, format: path.extname(file).slice(1).toLowerCase(), status: 'error', error: String((e as Error).message ?? e).slice(0, 300), chunks: [] });
  }
}

/** Reads every base again (folders change while nobody looks). */
export function scanAll(db: DB) {
  for (const b of baseRows(db)) scanSoon(db, b.id);
}

// ---- vectors -------------------------------------------------------------------------------------------

let filling = false;
let fillTimer: NodeJS.Timeout | undefined;

/** Soon: vectors for the passages without one, while search by meaning is on. */
export function fillSoon(db: DB, ms = 3000) {
  clearTimeout(fillTimer);
  fillTimer = setTimeout(() => void fillVectors(db), ms);
  fillTimer.unref?.();
}

/** The text a passage's vector is made from: where it is from, then the passage. */
const vectorText = (r: { title: string; part: string | null; text: string }) => `${r.title}${r.part ? ` · ${r.part}` : ''}\n${r.text}`.slice(0, 2400);

export async function fillVectors(db: DB): Promise<number> {
  if (filling || !meaningOn(db)) return 0;
  filling = true;
  let made = 0;
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
      // Starts the worker when memory allows; null when it cannot run now (tried again after the next reading).
      const vecs = await embed(db, rows.map(vectorText), 'document', { wait: true, timeoutMs: 180_000 });
      if (!vecs || vecs.length !== rows.length) break;
      db.transaction(() => rows.forEach((r, i) => put.run(r.id, VECTOR_MODEL, Buffer.from(quantize(vecs[i])))))();
      made += rows.length;
      dropVectorBlocks();
    }
  } catch (e) {
    console.warn(`[knowledge] vectors: ${(e as Error).message}`);
  } finally {
    filling = false;
  }
  if (made) tell('');
  return made;
}

/** Each base's vectors as the search scans them, read once and kept until passages change. */
let blocks: Map<string, { ids: Int32Array; codes: Uint8Array }> | null = null;
export const dropVectorBlocks = () => (blocks = null);

export function vectorBlock(db: DB, base: string): { ids: Int32Array; codes: Uint8Array } {
  blocks ??= new Map();
  const have = blocks.get(base);
  if (have) return have;
  const rows = db
    .prepare('select v.chunk as id, v.code as code from kb_vectors v join kb_chunks c on c.id = v.chunk join kb_docs d on d.id = c.doc where d.base = ? and v.model = ?')
    .all(base, VECTOR_MODEL) as { id: number; code: Buffer }[];
  const width = rows[0]?.code.length ?? 0;
  const b = { ids: Int32Array.from(rows.map((r) => r.id)), codes: new Uint8Array(rows.length * width) };
  rows.forEach((r, i) => b.codes.set(r.code, i * width));
  blocks.set(base, b);
  return b;
}
