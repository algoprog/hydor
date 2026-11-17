// Step 3: replays the picking of notes over the collection, for a grid of settings, and measures it.
//   1. checks the re-expression of the fusion against the app's own findNotes (same list, same relevance) at its settings;
//   2. for every setting (word weight, Z_MIN, identifier rule, Z_TURN) and every query, in session order, finds what
//      would have been given (notes given earlier in the session are not given again, nor counted as missed later);
//   3. scores it against each kind of positives, and the hand-judged ones (judged.json, if there is one).
// Writes results.json (aggregate numbers only) and per-query details (detail.json, with ids only) to OUT.
import fs from 'node:fs';
import path from 'node:path';
import { findNotes } from '../../server/memory/search.ts';
import { OUT, type QueryRec } from './common.ts';
import { identifierTokens } from './ident.ts';
import { bearsAt, givenFor, gather, identOf, K, LIMIT, load, queryVec, rank, type Base, type Cfg } from './lib.ts';

const L = load();
const queries = L.col.queries;

// ---- 1. the real findNotes against ours ------------------------------------------------------------

async function validate(sample: QueryRec[]) {
  let same = 0;
  let sameRel = 0;
  let nearTies = 0;
  for (const q of sample) {
    const b = gather(L, q);
    const real = await findNotes(b.pd.db, { places: b.pd.places, query: q.text, limit: LIMIT, kinds: ['note', 'topic'], now: q.ts, vector: queryVec(L, q) });
    const mine = rank(b, 0.1);
    const ids = (a: { id: number }[]) => a.map((x) => x.id).join(',');
    if (ids(real.map((r) => ({ id: r.entry.id }))) === ids(mine)) same++;
    else if (new Set(real.map((r) => r.entry.id)).size === new Set(mine.map((m) => m.id)).size && real.every((r) => mine.some((m) => m.id === r.entry.id))) nearTies++;
    const relReal = real.filter((r) => r.relevant).map((r) => r.entry.id).join(',');
    const relMine = mine.filter((m) => bearsAt(m, b.stats, 2.6)).map((m) => m.id).join(',');
    if (relReal === relMine) sameRel++;
  }
  console.log(`validation against findNotes on ${sample.length} queries: same ranked list ${same}, same set in another order ${nearTies}, same relevant list ${sameRel}`);
  if (sameRel !== sample.length) throw new Error('the re-expression of findNotes differs from the app');
}

// ---- how noisy the automatic positives are, against the hand-judged queries ---------------------------

function noise() {
  const file = path.join(OUT, 'judge', 'sample.json');
  if (!fs.existsSync(file) || !Object.keys(judged).length) return;
  const shown: Record<number, number[]> = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out: Record<string, unknown>[] = [];
  const qs = queries.filter((q) => judged[q.qid]);
  const nJ = qs.filter((q) => judged[q.qid].length).length;
  console.log(`judged: ${qs.length} queries (${qs.filter((q) => q.turn === 0).length} first messages), ${nJ} with at least one helpful note, mean ${(qs.reduce((n, q) => n + judged[q.qid].length, 0) / Math.max(1, nJ)).toFixed(1)} helpful notes per such query`);
  for (const lab of ['a', 'b', 'c', 'ab', 'any'] as const) {
    let pos = 0;
    let agree = 0;
    let withLab = 0;
    let anyAgree = 0;
    let judgedTotal = 0;
    let judgedFound = 0;
    for (const q of qs) {
      const J = new Set(judged[q.qid]);
      const P = [...positives(q, lab)].filter((id) => (shown[q.qid] ?? []).includes(id) && q.pool.includes(id));
      if (P.length) {
        withLab++;
        pos += P.length;
        const hit = P.filter((id) => J.has(id)).length;
        agree += hit;
        if (hit) anyAgree++;
      }
      if (J.size) {
        judgedTotal += J.size;
        judgedFound += [...J].filter((id) => positives(q, lab).has(id)).length;
      }
    }
    const row = { label: lab, queriesWithLabel: withLab, positives: pos, shareJudgedHelpful: agree / Math.max(1, pos), queriesWithAnyHelpful: anyAgree / Math.max(1, withLab), shareOfJudgedCovered: judgedFound / Math.max(1, judgedTotal) };
    out.push(row);
    console.log(`  ${lab}: ${withLab} queries, ${pos} positives shown, ${(100 * row.shareJudgedHelpful).toFixed(0)}% judged helpful, ${(100 * row.queriesWithAnyHelpful).toFixed(0)}% of queries have one judged helpful, covers ${(100 * row.shareOfJudgedCovered).toFixed(0)}% of the judged helpful notes`);
  }
  fs.writeFileSync(path.join(OUT, 'noise.json'), JSON.stringify(out));
}

// ---- 2 and 3. grid ---------------------------------------------------------------------------------

const Z_MINS = [2.0, 2.3, 2.6, 3.0];
const W_WORDS = [0.1, 0.3, 1.0];
const IDENT = [null, 0.01, 0.03, 0.05, 0.1, 0.2];
const Z_TURNS = [2.6, 3.0, 3.5];
const LABELS = ['a', 'b', 'c', 'ab', 'any', 'judged'] as const;
type Lab = (typeof LABELS)[number];
const SEGS = ['first', 'later', 'all'] as const;

const judged: Record<number, number[]> = fs.existsSync(path.join(OUT, 'judged.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'judged.json'), 'utf8')) : {};

/** Positives of a query for a label set. */
function positives(q: QueryRec, lab: Lab): Set<number> {
  const a = q.recallCalls <= 6 ? q.aTop : [];
  const sets: Record<Lab, number[]> = { a, b: q.pos.b, c: q.pos.c, ab: [...a, ...q.pos.b], any: [...a, ...q.pos.b, ...q.pos.c], judged: judged[q.qid] ?? [] };
  return new Set(sets[lab]);
}

interface Acc {
  nq: number;
  nothing: number;
  given: number;
  both: number;
  /** Queries with something given. */
  nGiven: number;
  byLab: Record<Lab, { chance: number; nR: number; recall2: number; prec2: number; recall: number; r10: number; p10: number; nP: number; prec: number; hits: number; givenWithPos: number }>;
}
const acc = (): Acc => ({ nq: 0, nothing: 0, given: 0, both: 0, nGiven: 0, byLab: Object.fromEntries(LABELS.map((l) => [l, { chance: 0, nR: 0, recall2: 0, prec2: 0, recall: 0, r10: 0, p10: 0, nP: 0, prec: 0, hits: 0, givenWithPos: 0 }])) as Acc['byLab'] });

const topicOf = (q: QueryRec) => {
  const m = new Map<number, number[]>();
  for (const id of q.pool) {
    const n = L.col.notes[id];
    if (n.kind === 'topic') m.set(id, n.children);
  }
  return m;
};

const bases = new Map<number, Base>();
const baseOf = (q: QueryRec) => bases.get(q.qid) ?? (bases.set(q.qid, gather(L, q)), bases.get(q.qid)!);

// Queries by session, in order.
const bySession = new Map<number, QueryRec[]>();
for (const q of queries) (bySession.get(q.session) ?? bySession.set(q.session, []).get(q.session)!).push(q);

export interface Row {
  cfg: Cfg;
  seg: (typeof SEGS)[number];
  label: Lab;
  nq: number;
  nothing: number;
  anyGiven: number;
  avgGiven: number;
  both: number;
  nR: number;
  recall: number;
  precision: number;
  /** Standard errors of the two means (queries are the sample). */
  recallSe: number;
  precisionSe: number;
  nP: number;
  /** Precision of picking at random from the pool. */
  chance: number;
  r10: number;
  p10: number;
  microPrecision: number;
  /** Given notes that were positives, and notes given, over the queries that have positives (for the cost of one more note). */
  hits: number;
  givenWithPos: number;
}

/** Standard error of a mean from its sum, sum of squares and count. */
const se = (sum: number, sum2: number, n: number) => (n > 1 ? Math.sqrt(Math.max(0, sum2 / n - (sum / n) ** 2) / (n - 1)) : 0);

function run(cfg: Cfg, detail?: Record<number, { given: number[]; ranking: number[] }>): Row[] {
  const accs = Object.fromEntries(SEGS.map((s) => [s, acc()])) as Record<(typeof SEGS)[number], Acc>;
  for (const qs of bySession.values()) {
    const sessionGiven = new Set<number>();
    for (const q of qs) {
      const b = baseOf(q);
      // Not part of what picking decides when every place is given whole.
      const live = q.pool.some((id) => !b.pd.small.has(`${L.col.notes[id].scope}|${L.col.notes[id].scopeKey}`));
      if (!live) continue;
      const { ids, ranking } = givenFor(b, cfg, sessionGiven);
      if (detail) detail[q.qid] = { given: ids, ranking: ranking.slice(0, K) };
      const topics = topicOf(q);
      const both = ids.some((id) => topics.has(id) && topics.get(id)!.some((c) => ids.includes(c)));
      const nonSmall = new Set(q.pool.filter((id) => !b.pd.small.has(`${L.col.notes[id].scope}|${L.col.notes[id].scopeKey}`)));
      for (const seg of [q.turn === 0 ? 'first' : 'later', 'all'] as const) {
        const A = accs[seg];
        A.nq++;
        A.given += ids.length;
        if (!ids.length) A.nothing++;
        else {
          A.nGiven++;
          if (both) A.both++;
        }
        for (const lab of LABELS) {
          const P = [...positives(q, lab)].filter((id) => nonSmall.has(id) && !sessionGiven.has(id));
          if (!P.length) continue;
          const t = A.byLab[lab];
          const hit = ids.filter((id) => P.includes(id)).length;
          const top = ranking.slice(0, K);
          const hit10 = top.filter((id) => P.includes(id)).length;
          t.nR++;
          t.chance += P.length / nonSmall.size;
          t.recall += hit / P.length;
          t.recall2 += (hit / P.length) ** 2;
          t.r10 += hit10 / P.length;
          t.p10 += top.length ? hit10 / top.length : 0;
          t.hits += hit;
          t.givenWithPos += ids.length;
          if (ids.length) {
            t.nP++;
            t.prec += hit / ids.length;
            t.prec2 += (hit / ids.length) ** 2;
          }
        }
      }
      for (const id of ids) sessionGiven.add(id);
    }
  }
  const rows: Row[] = [];
  for (const seg of SEGS)
    for (const lab of LABELS) {
      const A = accs[seg];
      const t = A.byLab[lab];
      rows.push({
        cfg,
        seg,
        label: lab,
        nq: A.nq,
        nothing: A.nothing / Math.max(1, A.nq),
        anyGiven: A.nGiven / Math.max(1, A.nq),
        avgGiven: A.given / Math.max(1, A.nq),
        both: A.both / Math.max(1, A.nGiven),
        nR: t.nR,
        recall: t.recall / Math.max(1, t.nR),
        precision: t.prec / Math.max(1, t.nP),
        recallSe: se(t.recall, t.recall2, t.nR),
        precisionSe: se(t.prec, t.prec2, t.nP),
        nP: t.nP,
        chance: t.chance / Math.max(1, t.nR),
        r10: t.r10 / Math.max(1, t.nR),
        p10: t.p10 / Math.max(1, t.nR),
        microPrecision: t.hits / Math.max(1, t.givenWithPos),
        hits: t.hits,
        givenWithPos: t.givenWithPos,
      });
    }
  return rows;
}

const identJudged: Record<string, number> = fs.existsSync(path.join(OUT, 'ident-judged.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'ident-judged.json'), 'utf8')) : {};

/** How often the identifier rule has anything to work on, and how good what it adds is. */
function identStats() {
  const out: Record<string, unknown>[] = [];
  for (const frac of [0.01, 0.05, 0.1, 0.2]) {
    let withTokens = 0;
    let fires = 0;
    let notes = 0;
    const hit: Record<string, number> = { judged: 0, any: 0, ab: 0 };
    const withLabel: Record<string, number> = { judged: 0, any: 0, ab: 0 };
    for (const q of queries) {
      const b = baseOf(q);
      if (identifierTokens(q.text).length) withTokens++;
      const m = identOf(b, frac).filter((id) => !b.pd.small.has(`${L.col.notes[id].scope}|${L.col.notes[id].scopeKey}`));
      if (m.length) fires++;
      notes += m.length;
      for (const lab of ['judged', 'any', 'ab'] as const) {
        const P = positives(q, lab);
        if (!P.size) continue;
        withLabel[lab] += m.length;
        hit[lab] += m.filter((id) => P.has(id)).length;
      }
    }
    // The pairs judged by hand (judge.ts): of those this cut-off would still find, how many helped.
    let pairs = 0;
    let helpful = 0;
    for (const [key, v] of Object.entries(identJudged)) {
      const [qid, id] = key.split(':').map(Number);
      const q = queries.find((x) => x.qid === qid);
      if (!q || v < 0 || !identOf(baseOf(q), frac).includes(id)) continue;
      pairs++;
      helpful += v;
    }
    const row = { frac, pairsJudged: pairs, pairsHelpful: helpful, queries: queries.length, shareWithTokens: withTokens / queries.length, shareFires: fires / queries.length, notesPerQuery: notes / queries.length, precisionJudged: hit.judged / Math.max(1, withLabel.judged), precisionAny: hit.any / Math.max(1, withLabel.any), precisionAb: hit.ab / Math.max(1, withLabel.ab), addedJudged: withLabel.judged, addedAny: withLabel.any };
    out.push(row);
    console.log(`identifier rule at ${frac}: tokens in ${(100 * row.shareWithTokens).toFixed(0)}% of queries, notes found for ${(100 * row.shareFires).toFixed(0)}%, ${row.notesPerQuery.toFixed(2)} notes a query; those notes are positives: judged ${(100 * row.precisionJudged).toFixed(0)}% (of ${withLabel.judged}), any ${(100 * row.precisionAny).toFixed(0)}% (of ${withLabel.any}), a or b ${(100 * row.precisionAb).toFixed(0)}%; hand-judged additions: ${helpful} of ${pairs}`);
  }
  fs.writeFileSync(path.join(OUT, 'ident-stats.json'), JSON.stringify(out));
}

await validate(queries.filter((_, i) => i % 7 === 0));
noise();
identStats();

const rows: Row[] = [];
const t0 = Date.now();
for (const w of W_WORDS)
  for (const z of Z_MINS)
    for (const ident of IDENT)
      for (const zTurn of Z_TURNS) {
        // Later messages' bar only means something when it is stricter than the first's: below Z_MIN it is Z_MIN.
        rows.push(...run({ w, z, zTurn: Math.max(z, zTurn), ident }));
      }
console.log(`${rows.length / (SEGS.length * LABELS.length)} settings in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(rows));

// Per-query details of the app's settings (ids only), for reading by hand.
const detail: Record<number, { given: number[]; ranking: number[] }> = {};
run({ w: 0.1, z: 2.6, zTurn: 2.6, ident: null }, detail);
fs.writeFileSync(path.join(OUT, 'detail-baseline.json'), JSON.stringify(detail));
process.exit(0);
