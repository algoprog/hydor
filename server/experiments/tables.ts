// Results tables: runs picked (or every finished run of an experiment) as rows, by experiment, by command or by one
// setting's value; the runs of a row are seeds, averaged (mean ± std, n). Each column is a metric: the best row in bold, and
// each row tested against the baseline (paired over examples when the runs kept per-example scores, else paired
// over seeds when the rows share seeds, else Welch's t-test), Holm-corrected across the rows, a dagger on the
// cells that are significantly better and a double dagger on those significantly worse. Seeds that barely change a
// number (one side's standard deviation next to nothing) give no test over seeds, and a note says so; per-example
// scores the same as the baseline's on every example read as the same, and a note says that too. Written as LaTeX (booktabs, with the marker line the pre-submission check
// finds), Markdown and CSV. Also: placing a table in a LaTeX file, replacing the one it made before.
import fs from 'node:fs';
import path from 'node:path';
import { checkpointsIn, sweptCheckpoint, withoutOutputs } from '../../shared/experiment-outputs.ts';
import { identicalNote, seedsFlatNote, TABLE_MARK, type QueuedCode, type ResultsCell, type ResultsColumn, type ResultsTable, type ResultsTableSpec, type RunRecord } from '../../shared/experiments.ts';
import { commandLabels, seedless } from './commands.ts';
import { looseObject } from './metrics.ts';
import { holm, mean, pairedBootstrap, pairedT, std, welch } from './stats.ts';

/** Per-example scores: metric → example id → value. */
export type ScoreMap = Map<string, Map<string, number>>;

/** The most of a scores file read. */
const MAX_SCORES = 50 * 1024 * 1024;

/**
 * Per-example scores as a run writes them: JSON lines (or Python's printed dicts) with an id ("id", "qid", "query",
 * "example", "doc") and a number per metric, or trec_eval -q's lines ("metric  query  value"; its "all" line left out).
 */
export function parseScores(text: string): ScoreMap {
  const out: ScoreMap = new Map();
  const put = (metric: string, id: string, v: number) => {
    if (!Number.isFinite(v) || !id) return;
    let m = out.get(metric);
    if (!m) out.set(metric, (m = new Map()));
    m.set(id, v);
  };
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('{')) {
      // JSON, or as Python prints a dict.
      const o = looseObject(t);
      const idKey = o && ['id', 'qid', 'query_id', 'query', 'example', 'example_id', 'doc', 'idx'].find((k) => o[k] !== undefined && o[k] !== null);
      if (!o || !idKey) continue;
      const id = String(o[idKey]);
      for (const [k, v] of Object.entries(o)) if (k !== idKey && typeof v === 'number') put(k, id, v);
      continue;
    }
    const f = t.split(/\s+/);
    if (f.length === 3 && f[1] !== 'all' && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(f[2])) put(f[0], f[1], Number(f[2]));
  }
  return out;
}

/** The per-example scores a run kept (in its folder, when it ended), or null. */
export function readScores(run: RunRecord): ScoreMap | null {
  if (!run.scores || !run.folder) return null;
  try {
    const file = path.join(run.folder, 'scores.jsonl');
    const st = fs.statSync(file);
    if (st.size > MAX_SCORES) return null;
    const m = parseScores(fs.readFileSync(file, 'utf8'));
    return m.size ? m : null;
  } catch {
    return null;
  }
}

// ---- working it out ------------------------------------------------------------------------------------------

export const seedOf = (r: Pick<RunRecord, 'seed' | 'params'>): string | undefined => {
  const s = r.seed ?? r.params?.seed ?? r.params?.random_seed;
  return s === undefined || s === null ? undefined : String(s);
};

const valueOf = (r: RunRecord, c: ResultsColumn): number | undefined => {
  const v = c.value === 'best' ? r.metrics?.best?.[c.metric] : r.metrics?.last?.[c.metric];
  return typeof v === 'number' && Number.isFinite(v) ? v * (c.scale ?? 1) : undefined;
};

interface Row {
  key: string;
  label: string;
  runs: RunRecord[];
  /** Rows by command: the command without what only says where it writes, and every whole command in the row. */
  same?: string;
  commands?: Set<string>;
}

/**
 * The rows: by experiment or by command (in the order they first come) or by a setting's value (numbers in order). A
 * row by command is told apart by its command without where it writes; its key is its first run's whole command.
 */
function rowsOf(spec: ResultsTableSpec, runs: RunRecord[]): Row[] {
  const by = spec.rows && spec.rows.startsWith('param:') ? spec.rows.slice(6) : null;
  const byCommand = spec.rows === 'command';
  const keyOf = (r: RunRecord) => (by ? (r.params?.[by] === undefined ? '—' : String(r.params[by])) : r.group || 'Other runs');
  const rows = new Map<string, Row>();
  for (const r of runs) {
    const whole = byCommand ? seedless(r, seedOf(r)) : '';
    const same = byCommand ? withoutOutputs(whole, { keepCheckpoints: sweptCheckpoint(r) }) : undefined;
    const k = same ?? keyOf(r);
    let row = rows.get(k);
    if (!row) {
      const key = byCommand ? whole : k;
      rows.set(k, (row = { key, label: spec.labels?.[key] ?? (!by ? k : r.params?.[by] === undefined ? `${by} not set` : `${by} = ${k}`), runs: [], ...(byCommand ? { same, commands: new Set<string>() } : {}) }));
    }
    row.commands?.add(whole);
    row.runs.push(r);
  }
  const list = [...rows.values()];
  if (byCommand) {
    const labels = commandLabels(list.map((x) => x.same!));
    // Named by the caller under any of its whole commands (or as it reads without where it writes).
    list.forEach((x, i) => (x.label = [...x.commands!, x.same!].map((c) => spec.labels?.[c]).find(Boolean) ?? labels[i]));
  }
  if (by) {
    const num = list.every((x) => x.key === '—' || Number.isFinite(Number(x.key)));
    list.sort((a, b) => (num ? Number(a.key) - Number(b.key) : a.key.localeCompare(b.key)));
  }
  return list;
}

/** A row's per-example scores for a metric, averaged over its runs (the examples every run scored); null without them. */
function examplesOf(row: Row, metric: string, scores: (r: RunRecord) => ScoreMap | null, scale: number): Map<string, number> | null {
  const maps = row.runs.map((r) => scores(r)?.get(metric));
  if (!maps.length || maps.some((m) => !m?.size)) return null;
  const out = new Map<string, number>();
  for (const id of maps[0]!.keys()) {
    const vs = maps.map((m) => m!.get(id));
    if (vs.every((v) => v !== undefined)) out.set(id, mean(vs as number[]) * scale);
  }
  return out.size ? out : null;
}

interface Tested {
  p: number | null;
  how: string;
  /** Every example scored the same as the baseline: no test to make. */
  identical?: boolean;
}

/** A row against the baseline for one column, by the test asked for (or the fitting one). */
function test(spec: ResultsTableSpec, c: ResultsColumn, row: Row, base: Row, scores: (r: RunRecord) => ScoreMap | null): Tested {
  const asked = spec.test;
  if (asked === 'none') return { p: null, how: '' };
  const pairs = (a: Row, b: Row) => {
    const bySeed = (x: Row) => new Map(x.runs.flatMap((r) => (seedOf(r) !== undefined && valueOf(r, c) !== undefined ? [[seedOf(r)!, valueOf(r, c)!] as const] : [])));
    const sa = bySeed(a);
    const sb = bySeed(b);
    const common = [...sa.keys()].filter((s) => sb.has(s));
    return { a: common.map((s) => sa.get(s)!), b: common.map((s) => sb.get(s)!), all: common.length === a.runs.length && common.length === b.runs.length };
  };
  if (asked !== 'welch') {
    const ea = examplesOf(row, c.metric, scores, c.scale ?? 1);
    const eb = examplesOf(base, c.metric, scores, c.scale ?? 1);
    if (ea && eb) {
      const same = ea.size === eb.size && [...ea].every(([id, v]) => eb.has(id) && Math.abs(v - eb.get(id)!) <= 1e-12 * Math.max(1, Math.abs(v)));
      if (same) return { p: null, how: '', identical: true };
      const ids = [...ea.keys()].filter((id) => eb.has(id));
      if (ids.length >= 2) {
        const a = ids.map((id) => ea.get(id)!);
        const b = ids.map((id) => eb.get(id)!);
        if (asked === 'bootstrap') return { p: pairedBootstrap(a, b).p, how: `paired bootstrap over ${ids.length} examples` };
        return { p: pairedT(a, b).p, how: `paired t-test over ${ids.length} examples` };
      }
    }
    if (asked === 'bootstrap') return { p: null, how: 'no per-example scores for a bootstrap' };
    const pr = pairs(row, base);
    if (pr.a.length >= 2 && (asked === 'paired' || pr.all)) return { p: pairedT(pr.a, pr.b).p, how: `paired t-test over ${pr.a.length} seeds` };
    if (asked === 'paired') return { p: null, how: 'the runs do not pair by seed' };
  }
  const a = row.runs.map((r) => valueOf(r, c)).filter((v): v is number => v !== undefined);
  const b = base.runs.map((r) => valueOf(r, c)).filter((v): v is number => v !== undefined);
  if (a.length < 2 || b.length < 2) return { p: null, how: 'one seed is too few for a test' };
  return { p: welch(a, b).p, how: `Welch's t-test over ${Math.min(a.length, b.length) === Math.max(a.length, b.length) ? a.length : `${Math.min(a.length, b.length)}–${Math.max(a.length, b.length)}`} seeds` };
}

/** Under this share of the mean's size, a standard deviation over seeds is next to no spread. */
const FLAT = 1e-3;

/**
 * Whether a row's runs give next to the same number for every seed: exactly equal, or a standard deviation below a
 * thousandth of the mean's size. A test over seeds then says how stable training is, not whether a difference holds.
 */
function barelyVaries(row: Row, c: ResultsColumn): boolean {
  const vs = row.runs.map((r) => valueOf(r, c)).filter((v): v is number => v !== undefined);
  return vs.length > 1 && (vs.every((v) => v === vs[0]) || std(vs) < FLAT * Math.abs(mean(vs)));
}

/** Decimals for a column: as asked, else by the size of its numbers. */
function digitsOf(c: ResultsColumn, cells: ResultsCell[]): number {
  if (c.digits !== undefined) return Math.min(Math.max(Math.round(c.digits), 0), 8);
  const big = Math.max(0, ...cells.map((x) => Math.abs(x.mean ?? 0)));
  return big < 1 ? 3 : big < 100 ? 2 : 1;
}

// ---- what a table says about itself ------------------------------------------------------------------------------

/** The most runs, or metrics, a note names. */
const NAMED = 5;

/**
 * "a, b, c"; past the first `most`, "a, b, c, d, e (+3)". Names with commas and a count, no "and" or "more": a list
 * is a value inside a sentence, and the page's translator leaves a value's words as they are.
 */
function listed(words: string[], more = 0, most = NAMED): string {
  const shown = words.slice(0, most);
  const rest = words.length - shown.length + more;
  return `${shown.join(', ')}${rest ? ` (+${rest})` : ''}`;
}

/** How a note names each run: by its name, with its id when another has the same one. */
function namer(runs: RunRecord[]): (r: RunRecord) => string {
  const count = new Map<string, number>();
  for (const r of runs) if (r.name) count.set(r.name, (count.get(r.name) ?? 0) + 1);
  return (r) => (!r.name ? r.id : count.get(r.name)! > 1 ? `${r.name} (${r.id})` : r.name);
}

const metricsOf = (r: RunRecord) => Object.keys(r.metrics?.last ?? {});

/** The runs without any of the columns' metrics, named, with what they report instead. */
function withoutMetricsNote(runs: RunRecord[], cols: ResultsColumn[], name: (r: RunRecord) => string): string {
  const asked = new Set(cols.map((c) => c.metric));
  // Those that report the same are said together.
  const alike = new Map<string, { what: string; runs: RunRecord[] }>();
  for (const r of runs) {
    const have = metricsOf(r);
    // A metric asked for that is there and has no number to show (NaN, or no best).
    const empty = have.filter((k) => asked.has(k));
    const what = empty.length ? `no number for ${listed(empty)}` : have.length ? `${listed(have)} instead` : 'no metrics';
    let g = alike.get(what);
    if (!g) alike.set(what, (g = { what, runs: [] }));
    g.runs.push(r);
  }
  let left = NAMED;
  let unnamed = 0;
  const said: string[] = [];
  for (const g of alike.values()) {
    const shown = g.runs.slice(0, left);
    left -= shown.length;
    if (!shown.length) unnamed += g.runs.length;
    else said.push(`${listed(shown.map(name), g.runs.length - shown.length)} ${g.runs.length === 1 ? 'reports' : 'report'} ${g.what}`);
  }
  if (unnamed) said.push(`${unnamed} more ${unnamed === 1 ? 'reports' : 'report'} other metrics`);
  return `${runs.length} run${runs.length === 1 ? ' has' : 's have'} none of these metrics: ${said.join('; ')}.`;
}

/** A metric's name as it reads whatever its case and separators: loss and LOSS, ndcg@10 and ndcg_at_10. */
const loose = (metric: string) =>
  metric
    .toLowerCase()
    .replace(/[_\s/-]at[_\s/-]?(?=\d)/g, '@')
    .replace(/[_\s/@-]|\.(?!\d)|(?<!\d)\./g, '');

/** A column's metric that some runs print written another way. */
function otherSpellings(runs: RunRecord[], cols: ResultsColumn[]): string[] {
  const out: string[] = [];
  for (const metric of new Set(cols.map((c) => c.metric))) {
    const others = new Set(runs.flatMap((r) => (r.metrics?.last?.[metric] !== undefined ? [] : metricsOf(r).filter((k) => k !== metric && loose(k) === loose(metric)))));
    for (const other of others) out.push(`Some runs print “${other}”, not “${metric}”: a column takes a metric’s name exactly, upper and lower case and separators too.`);
  }
  return out;
}

/** What a run ran, when its record says: the code kept when it was queued, and what had changed if it ran the folder as it was at its start. */
const ranCode = (r: RunRecord): { code: QueuedCode; changed: string } | null => (r.queuedCode ? { code: r.queuedCode, changed: r.codeAt === 'start' ? (r.codeChanged ?? []).join('\n') : '' } : null);

/** Whether two kept codes differ: another commit, other changes, or a file both kept that is not the same. */
const otherCode = (a: NonNullable<ReturnType<typeof ranCode>>, b: NonNullable<ReturnType<typeof ranCode>>) =>
  a.changed !== b.changed || a.code.commit !== b.code.commit || a.code.patch !== b.code.patch || Object.entries(a.code.files).some(([file, sha]) => b.code.files[file] !== undefined && b.code.files[file] !== sha);

/** That the rows' runs did not all run the same code: those that ran another than the first queued. */
function codeNote(runs: RunRecord[], name: (r: RunRecord) => string): string {
  const known = runs
    .flatMap((r) => {
      const ran = ranCode(r);
      return ran ? [{ r, ran }] : [];
    })
    .sort((a, b) => a.ran.code.at - b.ran.code.at || a.r.createdAt - b.r.createdAt);
  const later = known.slice(1).filter((x) => otherCode(known[0].ran, x.ran));
  return later.length ? `The rows did not all run the same code: ${listed(later.map((x) => name(x.r)))} ran a later version than ${name(known[0].r)}.` : '';
}

/** Rows by command whose runs of one seed name different checkpoints, which did not keep them apart. */
function checkpointNotes(rows: Row[]): string[] {
  return rows.flatMap((row) => {
    const bySeed = new Map<string, Set<string>>();
    for (const r of row.runs) {
      if (sweptCheckpoint(r)) continue;
      const paths = checkpointsIn(seedless(r, seedOf(r))).join(', ');
      const seed = seedOf(r) ?? '';
      bySeed.set(seed, (bySeed.get(seed) ?? new Set()).add(paths));
    }
    const differ = [...new Set([...bySeed.values()].filter((x) => x.size > 1).flatMap((x) => [...x]))].filter(Boolean);
    return differ.length ? [`${row.label}: its runs name different checkpoints (${listed(differ, 0, 3)}) and are averaged as one row. If they are different models, put each in an experiment of its own and make rows by experiment.`] : [];
  });
}

/** A results table from its spec and runs, kept under `id`. `unfinished`: its experiment's runs that did not finish. */
export function makeTable(spec: ResultsTableSpec, all: RunRecord[], o: { id: string; scores: (r: RunRecord) => ScoreMap | null; at?: number; unfinished?: RunRecord[] }): ResultsTable {
  const cols = spec.columns.filter((c) => c.metric?.trim());
  const notes: string[] = [];
  // Runs that have not ended are left out; so are runs with none of the columns' metrics.
  const ended = all.filter((r) => r.status === 'done' || r.status === 'stopped' || r.status === 'failed' || r.status === 'lost');
  const unfinished = o.unfinished ?? [];
  const name = namer([...all, ...unfinished]);
  if (ended.length < all.length) notes.push(`${all.length - ended.length} run${all.length - ended.length === 1 ? ' has' : 's have'} not ended and ${all.length - ended.length === 1 ? 'is' : 'are'} left out.`);
  if (unfinished.length) notes.push(`${unfinished.length} run${unfinished.length === 1 ? ' that did not finish is' : 's that did not finish are'} left out: ${listed(unfinished.map(name))}.`);
  const runs = ended.filter((r) => cols.some((c) => valueOf(r, c) !== undefined));
  const without = ended.filter((r) => !runs.includes(r));
  if (without.length) notes.push(withoutMetricsNote(without, cols, name));
  notes.push(...otherSpellings(ended, cols));
  const rows = rowsOf(spec, runs);
  const code = codeNote(runs, name);
  if (code) notes.push(code);
  if (spec.rows === 'command') notes.push(...checkpointNotes(rows));
  // Rows by a setting no run has would be one row of everything, read as so many seeds: that is said.
  const by = spec.rows?.startsWith('param:') ? spec.rows.slice(6) : null;
  if (by && runs.length && !runs.some((r) => r.params?.[by] !== undefined)) {
    const have = [...new Set(runs.flatMap((r) => Object.keys(r.params ?? {})))].sort();
    notes.push(`No run has a setting called “${by}”, so all ${runs.length} runs are one row and its spread is over runs, not seeds. ${have.length ? `Their settings are: ${have.join(', ')}.` : 'They have no settings: make rows by experiment, or start the runs with settings (params).'}`);
  }
  // A row by command is long to write out: it may be named by its label too, or by any of its commands.
  const asked = rows.find((r) => r.key === spec.baseline) ?? (spec.rows === 'command' && spec.baseline ? rows.find((r) => r.label === spec.baseline || r.same === spec.baseline || r.commands!.has(spec.baseline!)) : undefined);
  const base = asked ?? rows[0];
  if (spec.baseline && base && !asked) notes.push(`There is no row “${spec.baseline}”: the first row is the baseline.`);
  const alpha = spec.alpha && spec.alpha > 0 && spec.alpha < 1 ? spec.alpha : 0.05;
  const tests: string[] = [];
  /** The comparisons left untested because the seeds barely change the number. */
  const flat: string[] = [];
  /** The notes for rows whose examples all scored as the baseline's. */
  const identical: string[] = [];
  // Cells, column by column (the best, the tests and Holm's correction are within a column).
  const grid: ResultsCell[][] = rows.map(() => []);
  cols.forEach((c, ci) => {
    const cells: ResultsCell[] = rows.map((row) => {
      const vs = row.runs.map((r) => valueOf(r, c)).filter((v): v is number => v !== undefined);
      return vs.length ? { mean: mean(vs), std: vs.length > 1 ? std(vs) : null, n: vs.length } : { mean: null, std: null, n: 0 };
    });
    const filled = cells.filter((x) => x.mean !== null);
    if (filled.length > 1) {
      const top = c.better === 'min' ? Math.min(...filled.map((x) => x.mean!)) : Math.max(...filled.map((x) => x.mean!));
      for (const x of filled) if (Math.abs(x.mean! - top) <= 1e-12 * Math.max(1, Math.abs(top))) x.best = true;
    }
    if (base && rows.length > 1 && spec.test !== 'none') {
      const hows = new Set<string>();
      const ps = rows.map((row, ri) => {
        if (row === base || cells[ri].mean === null || cells[rows.indexOf(base)].mean === null) return null;
        const t = test(spec, c, row, base, o.scores);
        if (t.identical) {
          identical.push(identicalNote(row.label, colLabel(c), base.label));
          Object.assign(cells[ri], { p: null, pAdj: null, significant: false, verdict: 'same' });
          return null;
        }
        if (/ seeds$/.test(t.how) && (barelyVaries(row, c) || barelyVaries(base, c))) {
          flat.push(`${row.label}, ${colLabel(c)}`);
          return null;
        }
        if (t.how) hows.add(t.how);
        cells[ri].p = t.p;
        return t.p;
      });
      const adj = spec.correction === 'none' ? ps : holm(ps);
      const bm = cells[rows.indexOf(base)].mean!;
      rows.forEach((row, ri) => {
        if (row === base || ps[ri] === null) return;
        cells[ri].pAdj = adj[ri];
        const better = c.better === 'min' ? cells[ri].mean! < bm : cells[ri].mean! > bm;
        const worse = c.better === 'min' ? cells[ri].mean! > bm : cells[ri].mean! < bm;
        const apart = adj[ri] !== null && adj[ri]! < alpha;
        cells[ri].significant = apart && better;
        if (adj[ri] !== null) cells[ri].verdict = apart && better ? 'better' : apart && worse ? 'worse' : 'same';
      });
      tests[ci] = [...hows].join('; ');
    } else tests[ci] = '';
    cells.forEach((x, ri) => (grid[ri][ci] = x));
  });
  const seedsNote = flat.length ? seedsFlatNote(flat.join('; ')) : '';
  if (seedsNote) notes.push(seedsNote);
  notes.push(...identical);
  const madeAt = o.at ?? Date.now();
  const table: ResultsTable = {
    id: o.id,
    spec,
    rows: rows.map((r, ri) => ({ key: r.key, label: r.label, runs: r.runs.map((x) => x.id), cells: grid[ri] })),
    latex: '',
    markdown: '',
    csv: '',
    madeAt,
    ...(notes.length ? { notes } : {}),
    // A column nothing was tested in has none to say.
    tests: tests.filter(Boolean),
  };
  const words = describe(table, base?.label, alpha);
  if (words.dagger) table.footnote = words.dagger;
  // In what is copied out too (a comment in LaTeX, small print in Markdown): one line, so the marker stays near its tabular.
  const comment = [seedsNote, ...identical].filter(Boolean).join('. ').replace(/\s+/g, ' ');
  table.latex = latexOf(table, words, comment);
  table.markdown = markdownOf(table, words, comment);
  table.csv = csvOf(table);
  return table;
}

// ---- writing it out --------------------------------------------------------------------------------------------

/** A caption of the writer's own that already says what the numbers are. */
const SAYS_SPREAD = /\bmean\s*(?:±|\$\\pm\$|\\pm|\+\/-|\+-|and)\s*(?:the\s+)?(?:std|standard\s+(?:deviation|error)|s\.?d\.?\b)/i;

/** What the caption and the footnote say: how the cells read, and what the daggers mean. */
function describe(t: ResultsTable, baseLabel: string | undefined, alpha: number): { cells: string; dagger?: string } {
  const ns = t.rows.flatMap((r) => r.cells.map((c) => c.n)).filter((n) => n > 0);
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  const said = SAYS_SPREAD.test(t.spec.caption ?? '');
  const cells = !ns.length ? '' : hi <= 1 || said ? 'The best in bold.' : `Mean ± standard deviation over ${lo === hi ? hi : `${lo}–${hi}`} seeds; the best in bold.`;
  const any = t.rows.some((r) => r.cells.some((c) => c.p !== undefined && c.p !== null));
  if (!any || !baseLabel) return { cells };
  const how = [...new Set((t.tests ?? []).filter(Boolean).flatMap((h) => h.split('; ')))].join('; ');
  const corr = t.spec.correction === 'none' ? '' : ', Holm-corrected';
  const worse = t.rows.some((r) => r.cells.some((c) => c.verdict === 'worse'));
  return { cells, dagger: `† Better than ${baseLabel} at p < ${alpha} (${how}${corr}).${worse ? ` ‡ Worse than ${baseLabel}, by the same test.` : ''}` };
}

const texEscape = (s: string) =>
  s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');

const texWords = (s: string) =>
  texEscape(s)
    .replace(/±/g, '$\\pm$')
    .replace(/–/g, '--')
    .replace(/†/g, '$^\\dagger$')
    .replace(/‡/g, '$^\\ddagger$')
    .replace(/p < /g, '$p < ')
    .replace(/(\$p < [\d.]+)/g, '$1$')
    .replace(/t-test/g, '$t$-test');

const colLabel = (c: ResultsColumn) => c.label?.trim() || c.metric;

function cellText(x: ResultsCell, d: number, kind: 'tex' | 'md'): string {
  if (x.mean === null) return kind === 'tex' ? '--' : '–';
  const m = x.mean.toFixed(d);
  const sd = x.n > 1 && x.std !== null && x.std !== undefined ? x.std.toFixed(d) : null;
  if (kind === 'tex') return `${x.best ? `\\textbf{${m}}` : m}${sd ? ` $\\pm$ ${sd}` : ''}${x.significant ? '$^\\dagger$' : x.verdict === 'worse' ? '$^\\ddagger$' : ''}`;
  return `${x.best ? `**${m}**` : m}${sd ? ` ± ${sd}` : ''}${x.significant ? ' †' : x.verdict === 'worse' ? ' ‡' : ''}`;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'results';

function latexOf(t: ResultsTable, words: { cells: string; dagger?: string }, comment: string): string {
  const cols = t.spec.columns.filter((c) => c.metric?.trim());
  const by = t.spec.rows?.startsWith('param:') ? t.spec.rows.slice(6) : null;
  const digits = cols.map((c, ci) =>
    digitsOf(
      c,
      t.rows.map((r) => r.cells[ci]),
    ),
  );
  const caption = [t.spec.caption?.trim(), words.cells, words.dagger].filter(Boolean).join(' ');
  const head = [by ? texEscape(by) : 'Method', ...cols.map((c) => `${texEscape(colLabel(c))} ${c.better === 'min' ? '$\\downarrow$' : '$\\uparrow$'}`)].join(' & ');
  // In a command's name, LaTeX would join the two hyphens of --flag into a dash.
  const name = (s: string) => (t.spec.rows === 'command' ? texEscape(s).replace(/-(?=-)/g, '-{}') : texEscape(s));
  const body = t.rows.map((r) => [name(r.label), ...r.cells.map((x, ci) => cellText(x, digits[ci], 'tex'))].join(' & ') + ' \\\\');
  return [
    '\\begin{table}[t]',
    '\\centering',
    `\\caption{${texWords(caption)}}`,
    `\\label{tab:${slug(t.spec.group ?? t.spec.caption ?? 'results')}}`,
    TABLE_MARK(t.id),
    ...(comment ? [`% ${comment}`] : []),
    `\\begin{tabular}{l${'c'.repeat(cols.length)}}`,
    '\\toprule',
    `${head} \\\\`,
    '\\midrule',
    ...body,
    '\\bottomrule',
    '\\end{tabular}',
    '\\end{table}',
  ].join('\n');
}

function markdownOf(t: ResultsTable, words: { cells: string; dagger?: string }, comment: string): string {
  const cols = t.spec.columns.filter((c) => c.metric?.trim());
  const by = t.spec.rows?.startsWith('param:') ? t.spec.rows.slice(6) : null;
  const digits = cols.map((c, ci) =>
    digitsOf(
      c,
      t.rows.map((r) => r.cells[ci]),
    ),
  );
  const pipe = (s: string) => s.replace(/\|/g, '\\|');
  const lines = [
    `| ${[by ?? 'Method', ...cols.map((c) => `${colLabel(c)} ${c.better === 'min' ? '↓' : '↑'}`)].map(pipe).join(' | ')} |`,
    `|${['---', ...cols.map(() => '---:')].join('|')}|`,
    ...t.rows.map((r) => `| ${[pipe(r.label), ...r.cells.map((x, ci) => cellText(x, digits[ci], 'md'))].join(' | ')} |`),
  ];
  const foot = [t.spec.caption?.trim(), words.cells, words.dagger].filter(Boolean).join(' ');
  const shown = foot ? `${lines.join('\n')}\n\n${foot}` : lines.join('\n');
  // The notes as small print, their words as they are (an HTML comment cannot hold the "--" of a flag).
  return comment ? `${shown}\n\n<sub>${comment.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</sub>` : shown;
}

function csvOf(t: ResultsTable): string {
  const cols = t.spec.columns.filter((c) => c.metric?.trim());
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // The verdict and p say how a cell stands: `significant` (only "better") beside "worse" misled readers.
  const head = ['row', 'label', ...cols.flatMap((c) => ['mean', 'std', 'n', 'p', 'p_holm', 'verdict'].map((x) => `${c.metric}_${x}`))];
  const rows = t.rows.map((r) => [r.key, r.label, ...r.cells.flatMap((x) => [x.mean, x.std, x.n, x.p, x.pAdj, x.verdict])]);
  return [head, ...rows].map((r) => r.map(q).join(',')).join('\n') + '\n';
}

// ---- in a LaTeX document -----------------------------------------------------------------------------------

/** The part of a table's LaTeX from its marker line to the end of its tabular: what replacing it changes. */
export function tabularPart(latex: string): string {
  const lines = latex.split('\n');
  const from = lines.findIndex((l) => l.trim().startsWith('% hydor:table '));
  const to = lines.findIndex((l, i) => i > from && l.includes('\\end{tabular}'));
  return from < 0 || to < 0 ? latex : lines.slice(from, to + 1).join('\n');
}

/**
 * A LaTeX file with the table in it: in place of the one with its marker (from the marker line to the end of its
 * tabular, the caption around it left as the author made it), else the whole table before \end{document} (or at
 * the end of a file without one).
 */
export function insertTable(text: string, t: ResultsTable): { text: string; replaced: boolean } {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === TABLE_MARK(t.id));
  if (at >= 0) {
    const end = lines.findIndex((l, i) => i > at && l.includes('\\end{tabular}'));
    const part = tabularPart(t.latex).split('\n');
    lines.splice(at, end >= 0 ? end - at + 1 : 1, ...part);
    return { text: lines.join('\n'), replaced: true };
  }
  const doc = text.lastIndexOf('\\end{document}');
  if (doc >= 0) {
    const before = text.slice(0, doc).replace(/\s*$/, '');
    return { text: `${before}\n\n${t.latex}\n\n${text.slice(doc)}`, replaced: false };
  }
  return { text: `${text.replace(/\s*$/, '')}${text.trim() ? '\n\n' : ''}${t.latex}\n`, replaced: false };
}
