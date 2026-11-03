// npm run find:vectors: the vectors of everything the search box finds that ships with the app (its pages,
// settings and actions, themes, app templates, built-in assistants and skills), made once here so no one's
// computer has to (server/find/shipped-vectors.json). Run it whenever any of those change (CLAUDE.md);
// server/find/find-test.ts fails until you do. Only texts without a vector yet are embedded, on the CPU unless
// HYDOR_EMBED_DEVICE says otherwise. It needs a Python with PyTorch and Transformers 5.6+: HYDOR_EMBED_PYTHON,
// else the app's own one (Settings → Memory → Search by meaning sets it up in the data folder).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from '../server/db.ts';
import { hashOf, SHIPPED_FILE } from '../server/find/index.ts';
import { shippedItems } from '../server/find/sources.ts';
import { embed, stopMeaning } from '../server/memory/embed.ts';
import { quantize, VECTOR_MODEL } from '../server/memory/vectors.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run it as npm run find:vectors (a scratch DATA_DIR under /tmp, so nothing touches real data).');
  process.exit(2);
}
if (!process.env.HYDOR_EMBED_PYTHON) {
  const own = ['.hydor', '.naget-agent', '.web-agent'].map((d) => path.join(os.homedir(), d, 'memory', 'venv', 'bin', 'python')).find((p) => fs.existsSync(p));
  if (!own) {
    console.error('No Python with PyTorch and Transformers here: turn on search by meaning in Settings → Memory, or set HYDOR_EMBED_PYTHON.');
    process.exit(2);
  }
  process.env.HYDOR_EMBED_PYTHON = own;
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-find-vectors-'));
const db = openDb(path.join(tmp, 'v.db'));
kvSet(db, 'memory.meaning', '1');
if (!process.env.HYDOR_EMBED_DEVICE) kvSet(db, 'memory.meaning.device', 'cpu');

let before: Record<string, string> = {};
try {
  const f = JSON.parse(fs.readFileSync(SHIPPED_FILE, 'utf8')) as { model: string; vectors: Record<string, string> };
  if (f.model === VECTOR_MODEL) before = f.vectors;
  else console.log(`The vectors were made for ${f.model}: all of them again, for ${VECTOR_MODEL}.`);
} catch {}

const texts = new Map(shippedItems(db).map((it) => [hashOf(it.text), it.text]));
const need = [...texts].filter(([h]) => !before[h]);
console.log(`${texts.size} texts ship with the app; ${need.length} without a vector yet.`);
const out: Record<string, string> = {};
for (const h of texts.keys()) if (before[h]) out[h] = before[h];
for (let i = 0; i < need.length; i += 64) {
  const batch = need.slice(i, i + 64);
  const vecs = await embed(
    db,
    batch.map(([, t]) => t),
    'document',
    { wait: true, timeoutMs: 900_000 },
  );
  if (!vecs) {
    console.error(`The model did not answer (${process.env.HYDOR_EMBED_PYTHON}): it needs PyTorch, Transformers 5.6+ and 2.5 GB of free memory.`);
    process.exit(1);
  }
  batch.forEach(([h], k) => (out[h] = Buffer.from(quantize(vecs[k])).toString('base64')));
  console.log(`  ${Math.min(i + 64, need.length)} of ${need.length}`);
}

// One vector a line, in order, so a change shows as the lines it changed.
const keys = Object.keys(out).sort();
const body = keys.map((k) => `    ${JSON.stringify(k)}: ${JSON.stringify(out[k])}`).join(',\n');
fs.writeFileSync(SHIPPED_FILE, `{\n  "model": ${JSON.stringify(VECTOR_MODEL)},\n  "vectors": {\n${body}\n  }\n}\n`);
const dropped = Object.keys(before).filter((h) => !texts.has(h)).length;
console.log(`Wrote ${path.relative(process.cwd(), SHIPPED_FILE)}: ${keys.length} vectors, ${need.length} new, ${dropped} no longer used.`);
stopMeaning();
db.close();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
