// Step 5: the aggregate tables for the README, from results.json, noise.json, ident-stats.json and collection.json
// (numbers only: no texts, no ids). Prints Markdown and writes OUT/tables.md.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, type Collection } from './common.ts';
import type { Row } from './replay.ts';

const read = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'));
const rows = read<Row[]>('results.json');
const noise = fs.existsSync(path.join(OUT, 'noise.json')) ? read<Record<string, number | string>[]>('noise.json') : [];
const identStats = fs.existsSync(path.join(OUT, 'ident-stats.json')) ? read<Record<string, number>[]>('ident-stats.json') : [];
const col = read<Collection>('collection.json');

const get = (seg: Row['seg'], label: Row['label'], c: { w?: number; z?: number; zTurn?: number; ident?: number | null }) =>
  rows.find((r) => r.seg === seg && r.label === label && r.cfg.w === (c.w ?? 0.1) && r.cfg.z === (c.z ?? 2.6) && r.cfg.zTurn === (c.zTurn ?? Math.max(c.z ?? 2.6, 2.6)) && r.cfg.ident === (c.ident ?? null))!;
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const pm = (x: number, se: number) => `${f2(x)} ±${f2(se)}`;
const out: string[] = [];
const table = (head: string[], body: string[][]) => out.push(`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...body.map((r) => `| ${r.join(' | ')} |`), '');

// ---- the collection
const qs = col.queries;
/** As the replay reads them: a is the first five of a recall result, for sessions of at most six recall calls. */
const nonEmpty = (q: (typeof qs)[number], l: 'a' | 'b' | 'c') => (l === 'a' ? q.recallCalls <= 6 && q.aTop.length > 0 : q.pos[l].length > 0);
out.push('### Collection', '');
table(
  ['', 'first messages', 'later messages'],
  [
    ['queries', String(qs.filter((q) => q.turn === 0).length), String(qs.filter((q) => q.turn > 0).length)],
    ['pool size, mean (notes and topics)', f2(qs.filter((q) => q.turn === 0).reduce((n, q) => n + q.pool.length, 0) / qs.filter((q) => q.turn === 0).length), f2(qs.filter((q) => q.turn > 0).reduce((n, q) => n + q.pool.length, 0) / qs.filter((q) => q.turn > 0).length)],
    ...(['a', 'b', 'c'] as const).map((l) => [`with positives of source ${l}`, ...[0, 1].map((later) => { const s = qs.filter((q) => (q.turn > 0) === !!later); return `${s.filter((q) => nonEmpty(q, l)).length} (${pct(s.filter((q) => nonEmpty(q, l)).length / s.length)})`; })]),
  ],
);

// ---- noise
if (noise.length) {
  out.push('### How the automatic positives compare with the hand-judged queries', '');
  table(
    ['source', 'judged queries having it', 'positives shown', 'judged helpful', 'queries with at least one judged helpful', 'share of judged helpful notes it covers'],
    noise.map((n) => [String(n.label), String(n.queriesWithLabel), String(n.positives), pct(Number(n.shareJudgedHelpful)), pct(Number(n.queriesWithAnyHelpful)), pct(Number(n.shareOfJudgedCovered))]),
  );
}

const lab = ['judged', 'any'] as const;
const head = ['', 'notes given', 'nothing given', 'topic and its note both', 'judged recall', 'judged precision', 'auto recall', 'auto precision'];
const line = (name: string, seg: Row['seg'], c: Parameters<typeof get>[2]) => {
  const a = get(seg, 'judged', c);
  const b = get(seg, 'any', c);
  return [name, f2(a.avgGiven), pct(a.nothing), pct(a.both), pm(a.recall, a.recallSe), pm(a.precision, a.precisionSe), f2(b.recall), f2(b.precision)];
};

const jn = (seg: Row['seg']) => get(seg, 'judged', {}).nR;
const an = (seg: Row['seg']) => get(seg, 'any', {}).nR;
out.push(`### First messages: Z_MIN (W_WORDS 0.1, no identifier rule; ${get('first', 'judged', {}).nq} queries, ${jn('first')} with judged positives, ${an('first')} with automatic ones)`, '');
table(head, [2.0, 2.3, 2.6, 3.0].map((z) => line(`Z_MIN ${z.toFixed(1)}${z === 2.6 ? ' (the app)' : ''}`, 'first', { z })));

out.push('Notes added by each step down in Z_MIN: how many of them were positives (marginal precision).', '');
const steps: string[][] = [];
for (const [from, to] of [[3.0, 2.6], [2.6, 2.3], [2.3, 2.0]]) {
  const r = (l: Row['label'], z: number) => get('first', l, { z });
  const m = (l: Row['label']) => {
    const dg = r(l, to).givenWithPos - r(l, from).givenWithPos;
    return `${pct((r(l, to).hits - r(l, from).hits) / Math.max(1, dg))} of ${dg}`;
  };
  steps.push([`${from} to ${to}`, m('judged'), m('any'), m('ab')]);
}
table(['step', 'judged', 'any automatic', 'a or b'], steps);

out.push('Chance level: precision of picking notes at random from the pool.', '');
table(['', 'judged', 'any automatic', 'a or b'], [['first messages', ...(['judged', 'any', 'ab'] as const).map((l) => f2(get('first', l, {}).chance))], ['later messages', ...(['judged', 'any', 'ab'] as const).map((l) => f2(get('later', l, {}).chance))]]);

out.push('### Ranking alone, top 10 whatever the bar (recall@10, precision@10): W_WORDS', '');
table(
  ['W_WORDS', 'judged R@10', 'judged P@10', 'a or b R@10', 'a or b P@10', 'any R@10', 'any P@10', 'notes given at Z_MIN 2.6'],
  [0.1, 0.3, 1.0].map((w) => {
    const j = get('first', 'judged', { w });
    const ab = get('first', 'ab', { w });
    const an_ = get('first', 'any', { w });
    return [String(w), f2(j.r10), f2(j.p10), f2(ab.r10), f2(ab.p10), f2(an_.r10), f2(an_.p10), f2(j.avgGiven)];
  }),
);

out.push('### Identifier rule at Z_MIN 2.6 and 2.3 (first messages): cut-off = max(2, share of the pool)', '');
const idHead = ['', 'notes given', 'nothing given', 'judged recall', 'judged precision', 'auto recall', 'auto precision'];
const idRow = (name: string, c: Parameters<typeof get>[2]) => {
  const a = get('first', 'judged', c);
  const b = get('first', 'any', c);
  return [name, f2(a.avgGiven), pct(a.nothing), pm(a.recall, a.recallSe), pm(a.precision, a.precisionSe), f2(b.recall), f2(b.precision)];
};
table(idHead, [2.6, 2.3].flatMap((z) => [null, 0.01, 0.05, 0.1, 0.2].map((ident) => idRow(`Z_MIN ${z.toFixed(1)}, ${ident == null ? 'rule off' : `cut-off ${pct(ident)}`}`, { z, ident }))));
if (identStats.length) {
  out.push('What the rule finds, over all queries:', '');
  table(
    ['cut-off', 'queries with an identifier token', 'queries it finds notes for', 'notes a query', 'its notes that are positives: judged', 'any automatic', 'a or b', 'hand-judged additions that helped'],
    identStats.map((s) => [pct(s.frac), pct(s.shareWithTokens), pct(s.shareFires), f2(s.notesPerQuery), pct(s.precisionJudged), pct(s.precisionAny), pct(s.precisionAb), `${s.pairsHelpful} of ${s.pairsJudged}`]),
  );
}

out.push(`### Later messages: Z_TURN (${get('later', 'judged', {}).nq} messages, ${jn('later')} with judged positives not given before, ${an('later')} with automatic ones)`, '');
const later = (name: string, c: Parameters<typeof get>[2]) => {
  const a = get('later', 'judged', c);
  const b = get('later', 'any', c);
  return [name, pct(a.anyGiven), f2(a.avgGiven), pct(a.both), pm(a.recall, a.recallSe), pm(a.precision, a.precisionSe), f2(b.recall), f2(b.precision)];
};
table(
  ['', 'anything given', 'notes given', 'topic and its note both', 'judged recall', 'judged precision', 'auto recall', 'auto precision'],
  [2.3, 2.6].flatMap((z) => [2.6, 3.0, 3.5].map((zTurn) => later(`Z_MIN ${z.toFixed(1)}, Z_TURN ${Math.max(z, zTurn).toFixed(1)}`, { z, zTurn }))).filter((r, i, all) => all.findIndex((x) => x[0] === r[0]) === i),
);
out.push('Later messages with the identifier rule (cut-off 5%) at Z_MIN 2.6:', '');
table(
  ['', 'anything given', 'notes given', 'topic and its note both', 'judged recall', 'judged precision', 'auto recall', 'auto precision'],
  [2.6, 3.0, 3.5].map((zTurn) => later(`Z_TURN ${zTurn.toFixed(1)}, identifier rule`, { zTurn, ident: 0.05 })),
);

const md = out.join('\n');
fs.writeFileSync(path.join(OUT, 'tables.md'), md);
console.log(md);
process.exit(0);
