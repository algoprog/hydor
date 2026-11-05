// Results tables: runs picked (or every finished run of an experiment) as rows, by experiment or by one setting's
// value; the runs of a row are seeds, averaged (mean ± std, n). Each column is a metric: the best row in bold, and
// each row tested against the baseline (paired over examples when the runs kept per-example scores, else paired
// over seeds when the rows share seeds, else Welch's t-test), Holm-corrected across the rows, a dagger on the
// cells that are significantly better. Written as LaTeX (booktabs, with the marker line the pre-submission check
// finds), Markdown and CSV. Also: placing a table in a LaTeX file, replacing the one it made before.
import fs from 'node:fs';
import path from 'node:path';
import { TABLE_MARK, type ResultsCell, type ResultsColumn, type ResultsTable, type ResultsTableSpec, type RunRecord } from '../../shared/experiments.ts';
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

const seedOf = (r: RunRecord): string | undefined => {
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
}

/** The rows: by experiment (in the order they first come) or by a setting's value (numbers in order). */
function rowsOf(spec: ResultsTableSpec, runs: RunRecord[]): Row[] {
  const by = spec.rows && spec.rows.startsWith('param:') ? spec.rows.slice(6) : null;
  const keyOf = (r: RunRecord) => (by ? (r.params?.[by] === undefined ? '—' : String(r.params[by])) : r.group || 'Other runs');
  const rows = new Map<string, Row>();
  for (const r of runs) {
    const k = keyOf(r);
    let row = rows.get(k);
    if (!row) rows.set(k, (row = { key: k, label: spec.labels?.[k] ?? (by ? `${by} = ${k}` : k), runs: [] }));
    row.runs.push(r);
  }
  const list = [...rows.values()];
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

/** Decimals for a column: as asked, else by the size of its numbers. */
function digitsOf(c: ResultsColumn, cells: ResultsCell[]): number {
  if (c.digits !== undefined) return Math.min(Math.max(Math.round(c.digits), 0), 8);
  const big = Math.max(0, ...cells.map((x) => Math.abs(x.mean ?? 0)));
  return big < 1 ? 3 : big < 100 ? 2 : 1;
}

/** A results table from its spec and runs, kept under `id`. */
export function makeTable(spec: ResultsTableSpec, all: RunRecord[], o: { id: string; scores: (r: RunRecord) => ScoreMap | null; at?: number }): ResultsTable {
  const cols = spec.columns.filter((c) => c.metric?.trim());
  const notes: string[] = [];
  // Runs that have not ended are left out; so are runs with none of the columns' metrics.
  const ended = all.filter((r) => r.status === 'done' || r.status === 'stopped' || r.status === 'failed' || r.status === 'lost');
  if (ended.length < all.length) notes.push(`${all.length - ended.length} run${all.length - ended.length === 1 ? ' has' : 's have'} not ended and ${all.length - ended.length === 1 ? 'is' : 'are'} left out.`);
  const runs = ended.filter((r) => cols.some((c) => valueOf(r, c) !== undefined));
  if (runs.length < ended.length) notes.push(`${ended.length - runs.length} run${ended.length - runs.length === 1 ? ' has' : 's have'} none of these metrics.`);
  const rows = rowsOf(spec, runs);
  const base = rows.find((r) => r.key === spec.baseline) ?? rows[0];
  if (spec.baseline && base && base.key !== spec.baseline) notes.push(`There is no row “${spec.baseline}”: the first row is the baseline.`);
  const alpha = spec.alpha && spec.alpha > 0 && spec.alpha < 1 ? spec.alpha : 0.05;
  const tests: string[] = [];
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
        cells[ri].significant = adj[ri] !== null && adj[ri]! < alpha && better;
      });
      tests[ci] = [...hows].join('; ');
    } else tests[ci] = '';
    cells.forEach((x, ri) => (grid[ri][ci] = x));
  });
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
    tests,
  };
  const words = describe(table, base?.label, alpha);
  if (words.dagger) table.footnote = words.dagger;
  table.latex = latexOf(table, words);
  table.markdown = markdownOf(table, words);
  table.csv = csvOf(table);
  return table;
}

// ---- writing it out --------------------------------------------------------------------------------------------

/** What the caption and the footnote say: how the cells read, and what a dagger means. */
function describe(t: ResultsTable, baseLabel: string | undefined, alpha: number): { cells: string; dagger?: string } {
  const ns = t.rows.flatMap((r) => r.cells.map((c) => c.n)).filter((n) => n > 0);
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  const cells = !ns.length ? '' : hi <= 1 ? 'The best in bold.' : `Mean ± standard deviation over ${lo === hi ? hi : `${lo}–${hi}`} seeds; the best in bold.`;
  const any = t.rows.some((r) => r.cells.some((c) => c.p !== undefined && c.p !== null));
  if (!any || !baseLabel) return { cells };
  const how = [...new Set((t.tests ?? []).filter(Boolean).flatMap((h) => h.split('; ')))].join('; ');
  const corr = t.spec.correction === 'none' ? '' : ', Holm-corrected';
  return { cells, dagger: `† Better than ${baseLabel} at p < ${alpha} (${how}${corr}).` };
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
    .replace(/p < /g, '$p < ')
    .replace(/(\$p < [\d.]+)/g, '$1$')
    .replace(/t-test/g, '$t$-test');

const colLabel = (c: ResultsColumn) => c.label?.trim() || c.metric;

function cellText(x: ResultsCell, d: number, kind: 'tex' | 'md'): string {
  if (x.mean === null) return kind === 'tex' ? '--' : '–';
  const m = x.mean.toFixed(d);
  const sd = x.n > 1 && x.std !== null && x.std !== undefined ? x.std.toFixed(d) : null;
  if (kind === 'tex') return `${x.best ? `\\textbf{${m}}` : m}${sd ? ` $\\pm$ ${sd}` : ''}${x.significant ? '$^\\dagger$' : ''}`;
  return `${x.best ? `**${m}**` : m}${sd ? ` ± ${sd}` : ''}${x.significant ? ' †' : ''}`;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'results';

function latexOf(t: ResultsTable, words: { cells: string; dagger?: string }): string {
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
  const body = t.rows.map((r) => [texEscape(r.label), ...r.cells.map((x, ci) => cellText(x, digits[ci], 'tex'))].join(' & ') + ' \\\\');
  return [
    '\\begin{table}[t]',
    '\\centering',
    `\\caption{${texWords(caption)}}`,
    `\\label{tab:${slug(t.spec.group ?? t.spec.caption ?? 'results')}}`,
    TABLE_MARK(t.id),
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

function markdownOf(t: ResultsTable, words: { cells: string; dagger?: string }): string {
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
  return foot ? `${lines.join('\n')}\n\n${foot}` : lines.join('\n');
}

function csvOf(t: ResultsTable): string {
  const cols = t.spec.columns.filter((c) => c.metric?.trim());
  const q = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ['row', 'label', ...cols.flatMap((c) => ['mean', 'std', 'n', 'p', 'p_holm', 'significant'].map((x) => `${c.metric}_${x}`))];
  const rows = t.rows.map((r) => [r.key, r.label, ...r.cells.flatMap((x) => [x.mean, x.std, x.n, x.p, x.pAdj, x.significant === undefined ? '' : x.significant ? 'yes' : 'no'])]);
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
