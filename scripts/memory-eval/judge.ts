// Step 4: a sample of queries to judge by hand. Writes OUT/judge/batch-N.md: each query with the candidates worth a look
// (the best by meaning and by words, the automatic positives, what the app's settings give, what the identifier rule
// finds), the notes' texts as they were then. sample.json says which notes were shown for each query. Read them, and write
// OUT/judged.json: { "<qid>": [ids of notes that would have helped this request], ... } (queries in it are kept, not shown again). Notes not shown count as not helping (a pooled judgement: said in the README).
import fs from 'node:fs';
import path from 'node:path';
import { OUT, type QueryRec } from './common.ts';
import { identifierTokens } from './ident.ts';
import { gather, givenFor, identOf, load, rank, type Base } from './lib.ts';

/** How many of each to judge: two thirds of 30 are first messages; later ones get more, as the evidence is thinnest there. */
const FIRST_N = Number(process.env.JUDGE_FIRST ?? 20);
const LATER_N = Number(process.env.JUDGE_LATER ?? 22);
const PER_BATCH = 6;
const L = load();

// A fixed shuffle, so the same queries come up each time.
const h = (n: number) => {
  let x = (n + 1) * 2654435761;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519);
  x ^= x >>> 13;
  return x >>> 0;
};
// Queries already judged (judged.json) stay in the sample and are not shown again: only what is missing is drawn.
const judgedFile = path.join(OUT, 'judged.json');
const done = new Set(fs.existsSync(judgedFile) ? Object.keys(JSON.parse(fs.readFileSync(judgedFile, 'utf8'))).map(Number) : []);
const eligible = L.col.queries.filter((q) => q.pool.length >= 15 && q.text.length >= 25);
const byKind = (first: boolean) => eligible.filter((q) => (q.turn === 0) === first).sort((a, b) => h(a.qid) - h(b.qid));
const have = (first: boolean) => byKind(first).filter((q) => done.has(q.qid));
const fresh: QueryRec[] = [
  ...byKind(true).filter((q) => !done.has(q.qid)).slice(0, Math.max(0, FIRST_N - have(true).length)),
  ...byKind(false).filter((q) => !done.has(q.qid)).slice(0, Math.max(0, LATER_N - have(false).length)),
];
const pick: QueryRec[] = [...have(true), ...have(false), ...fresh];

const clip = (t: string, n: number) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

function candidates(b: Base): number[] {
  const q = b.q;
  const out: number[] = [];
  const add = (id: number) => out.includes(id) || out.push(id);
  b.hits.slice(0, 12).forEach((x) => add(x.id));
  b.byWords.slice(0, 5).forEach(add);
  [...q.aTop, ...q.pos.b, ...q.pos.c].slice(0, 12).forEach(add);
  givenFor(b, { w: 0.1, z: 2.6, zTurn: 2.6, ident: null }, new Set()).ids.forEach(add);
  rank(b, 0.1).slice(0, 5).forEach((r) => add(r.id));
  identOf(b, 0.03).forEach(add);
  return out;
}

fs.mkdirSync(path.join(OUT, 'judge'), { recursive: true });
const sample: Record<number, number[]> = {};
let shownCount = 0;
pick.forEach((q) => {
  const b = gather(L, q);
  const lines = [`## query ${q.qid}  (${q.turn === 0 ? 'first message' : `message ${q.turn + 1}`}, pool ${q.pool.length}, repo ${path.basename(q.repo)})`, '', `> ${clip(q.text, 700)}`, ''];
  const shown = candidates(b);
  sample[q.qid] = shown;
  if (done.has(q.qid)) return;
  for (const id of shown) {
    const n = L.col.notes[id];
    const tags = [q.aTop.includes(id) ? 'a' : '', q.pos.b.includes(id) ? 'b' : '', q.pos.c.includes(id) ? 'c' : ''].join('');
    lines.push(`- #${id} ${n.kind === 'topic' ? '[topic] ' : ''}${tags ? `{${tags}} ` : ''}${clip(b.pd.texts.get(id)!, 240)}`);
  }
  lines.push('');
  const file = path.join(OUT, 'judge', `batch-${Math.floor(shownCount++ / PER_BATCH) + 1}.md`);
  fs.appendFileSync(file, lines.join('\n') + '\n');
});
fs.writeFileSync(path.join(OUT, 'judge', 'sample.json'), JSON.stringify(sample));
console.log(`${Object.keys(sample).length} queries in the sample, ${fresh.length} to judge now, in ${Math.ceil(fresh.length / PER_BATCH)} batches`);

// The notes the identifier rule adds (what the bar at Z_MIN 2.6 would not give): a sample of query and note pairs to judge,
// OUT/judge/ident.md, and OUT/ident-judged.json ({ "<qid>:<note id>": 1 or 0 }) once judged.
const IDENT_N = Number(process.env.JUDGE_IDENT_N ?? 36);
const pairs: { q: QueryRec; id: number; tokens: string[] }[] = [];
for (const q of [...L.col.queries].sort((a, b) => h(a.qid + 7) - h(b.qid + 7))) {
  if (pairs.length >= IDENT_N) break;
  if (q.text.length < 20) continue;
  const b = gather(L, q);
  const gate = new Set(givenFor(b, { w: 0.1, z: 2.6, zTurn: 2.6, ident: null }, new Set()).ids);
  const add = givenFor(b, { w: 0.1, z: 2.6, zTurn: 2.6, ident: 0.05 }, new Set()).ids.filter((id) => !gate.has(id));
  if (!add.length) continue;
  const id = add[0];
  const text = b.pd.texts.get(id)!.toLowerCase();
  pairs.push({ q, id, tokens: identifierTokens(q.text).filter((t) => text.includes(t.toLowerCase()) || (t.includes('/') && text.includes(t.slice(t.lastIndexOf('/') + 1).toLowerCase()))) });
}
fs.writeFileSync(
  path.join(OUT, 'judge', 'ident.md'),
  pairs.map((p) => `## ${p.q.qid}:${p.id}  (${p.q.turn === 0 ? 'first' : `message ${p.q.turn + 1}`}) matched on ${p.tokens.join(', ')}\n> ${clip(p.q.text, 450)}\n- #${p.id} ${clip(L.col.notes[p.id].versions.at(-1)!.text, 260)}\n`).join('\n'),
);
console.log(`${pairs.length} identifier pairs`);
process.exit(0);
