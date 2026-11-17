// Step 2: the vectors the replay needs, made with the app's own embedding code (server/memory/embed.ts, the local
// mDenseOn model on the CPU): every text a note had (as a document) and every query (as a query, cut to 2000
// characters as requestVector does). Also checks that the vectors made here, quantized, are the ones the app stored for
// the notes' current texts. Needs HYDOR_EMBED_PYTHON (a Python with ONNX Runtime, tokenizers, NumPy). Writes vectors.json.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { embed, stopMeaning } from '../../server/memory/embed.ts';
import { BYTES, quantize } from '../../server/memory/vectors.ts';
import { assertCopy, DB_COPY, OUT, textKey, type Collection } from './common.ts';

assertCopy(DB_COPY);
const col: Collection = JSON.parse(fs.readFileSync(path.join(OUT, 'collection.json'), 'utf8'));
// An empty database of our own: embed.ts reads only its switches from it.
const mem = new Database(':memory:');
mem.exec('create table kv (k text primary key, v text not null)');

const b64 = (v: Float32Array) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
const docs: Record<string, string> = {};
const qs: Record<string, string> = {};
const cacheFile = path.join(OUT, 'vectors.json');
const cache: { docs: Record<string, string>; queries: Record<string, string> } = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : { docs: {}, queries: {} };
Object.assign(docs, cache.docs);
Object.assign(qs, cache.queries);

async function run(items: { key: string | number; text: string }[], kind: 'document' | 'query', into: Record<string, string>) {
  const seen = new Set<string | number>();
  const todo = items.filter((i) => into[i.key] == null && !seen.has(i.key) && seen.add(i.key));
  console.log(`${kind}: ${todo.length} to make, ${items.length - todo.length} kept`);
  for (let i = 0; i < todo.length; i += 64) {
    const part = todo.slice(i, i + 64);
    const v = await embed(mem, part.map((p) => p.text), kind, { wait: true, timeoutMs: 300_000 });
    if (!v || v.length !== part.length) throw new Error('the model did not answer (is HYDOR_EMBED_PYTHON set, and the model downloaded?)');
    part.forEach((p, j) => (into[p.key] = b64(v[j])));
    fs.writeFileSync(cacheFile, JSON.stringify({ docs, queries: qs }));
    console.log(`  ${Math.min(i + 64, todo.length)}/${todo.length}`);
  }
}

const docItems: { key: string; text: string }[] = [];
for (const n of Object.values(col.notes)) n.versions.forEach((v, i) => docItems.push({ key: `${n.id}:${i}`, text: v.text }));
await run(docItems, 'document', docs);
await run(
  col.queries.map((q) => ({ key: textKey(q.text), text: q.text.trim().slice(0, 2000) })),
  'query',
  qs,
);
fs.writeFileSync(cacheFile, JSON.stringify({ docs, queries: qs }));

// The app stored each active note's vector (quantized) from its current text: ours must agree.
const copy = new Database(DB_COPY, { readonly: true });
const stored = copy.prepare('select entry, code from memory_vectors').all() as { entry: number; code: Buffer }[];
let same = 0;
let total = 0;
let nibbles = 0;
let nibblesSame = 0;
for (const r of stored) {
  const n = col.notes[r.entry];
  const k = n && docs[`${n.id}:${n.versions.length - 1}`];
  if (!k) continue;
  const f = new Float32Array(Buffer.from(k, 'base64').buffer.slice(0));
  const code = Buffer.from(quantize(f));
  total++;
  if (code.equals(r.code)) same++;
  for (let i = 0; i < BYTES; i++) {
    nibbles++;
    if (code[i] === r.code[i]) nibblesSame++;
  }
}
console.log(`stored vectors reproduced exactly: ${same}/${total}; bytes equal ${((100 * nibblesSame) / Math.max(1, nibbles)).toFixed(2)}%`);
stopMeaning();
process.exit(0);
