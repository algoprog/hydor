// Turns a folder of judged runs (each `<run>/result.json` that collect.ts wrote, and `result-change.json` for the change requests) into the table of every run and the paired
// summary: for each brief the runs of one label beside those of another (a label is a date, a model, a version of Hydor's guide: anything the person driving the runs sets
// apart), the differences, their median over briefs with a bootstrap interval, kept apart for the three groups of briefs.
//   node scripts/webapp-bench/report.ts <folder of runs> [--labels <first>,<second>] [--out results/<date>.md] [--title "..."]
// With two labels in the folder they are compared (the second minus the first, so the earlier or the baseline goes first: by default the labels are taken in alphabetical order,
// which puts dates in order); with more, --labels says which two. Every label's runs are in the table of every run either way.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Collected } from './collect.ts';
import { BRIEFS_DIR } from './prepare.ts';
import { type Interval, bootstrap, median } from './stats.ts';

export type Group = 'accounts' | 'logic' | 'larger';
export const GROUP_NAMES: Record<Group, string> = {
  accounts: 'Small apps with accounts and lists',
  logic: 'Small tools that are mostly their own logic',
  larger: 'Larger apps',
};
export interface Run {
  brief: string;
  label: string;
  c: Collected;
}

export function readRuns(folder: string, change = false): Run[] {
  const out: Run[] = [];
  for (const name of readdirSync(folder).sort()) {
    const file = join(folder, name, change ? 'result-change.json' : 'result.json');
    if (!existsSync(file)) continue;
    const c = JSON.parse(readFileSync(file, 'utf8')) as Collected;
    out.push({ brief: c.run.brief, label: c.run.label, c });
  }
  return out;
}

export function groupsOf(): Record<string, Group> {
  const groups: Record<string, Group> = {};
  for (const name of readdirSync(BRIEFS_DIR)) {
    const file = join(BRIEFS_DIR, name, 'expect.json');
    if (existsSync(file)) groups[name] = JSON.parse(readFileSync(file, 'utf8')).group;
  }
  return groups;
}

// ------------------------------------------------------------------------------------------------ formatting

const dash = '–';
const money = (v: number | null) => (v === null ? dash : `$${v.toFixed(2)}`);
const minutes = (s: number | null) => (s === null ? dash : (s / 60).toFixed(1));
const kilo = (v: number | null) => (v === null ? dash : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(v));
const signed = (v: number | null, digits = 1, unit = '') => (v === null ? dash : `${v > 0 ? '+' : ''}${v.toFixed(digits)}${unit}`);
const share = (r: Run) => r.c.judged.score.passed / r.c.judged.score.total;

function interval(i: Interval, digits: number, unit = ''): string {
  if (i.median === null) return dash;
  const range = i.low === null ? 'no interval from fewer than two pairs' : `95% bootstrap interval ${signed(i.low, digits, unit)} to ${signed(i.high, digits, unit)}`;
  return `${signed(i.median, digits, unit)} (${range}; ${i.n} pair${i.n === 1 ? '' : 's'})`;
}

// ------------------------------------------------------------------------------------------------ the pairs

/** The same brief, run under two labels: `a` is the first (the earlier, the baseline) and `b` the second. Every difference is `b` minus `a`. */
export interface Pair {
  brief: string;
  a: Run;
  b: Run;
}

/** The labels in a set of runs, in alphabetical order (a date written year first sorts in time). */
export const labelsOf = (runs: Run[]): string[] => [...new Set(runs.map((r) => r.label))].sort();

/** The two labels that are compared: the ones asked for, or the only two there are. Says why when it cannot tell. */
export function chooseLabels(runs: Run[], asked?: string): [string, string] | { why: string } {
  const have = labelsOf(runs);
  if (asked) {
    const wanted = asked.split(',').map((l) => l.trim());
    if (wanted.length !== 2 || wanted[0] === wanted[1]) return { why: `--labels takes two different labels, like --labels 2026-11-26,2026-12-10 (the folder has: ${have.join(', ') || 'none'})` };
    const missing = wanted.filter((l) => !have.includes(l));
    return missing.length > 0 ? { why: `there are no runs labelled ${missing.join(', ')} (the folder has: ${have.join(', ')})` } : [wanted[0]!, wanted[1]!];
  }
  if (have.length === 2) return [have[0]!, have[1]!];
  return { why: have.length < 2 ? `only ${have.length === 1 ? `the label ${have[0]}` : 'no label'} so far: there is nothing to compare it with yet` : `there are ${have.length} labels (${have.join(', ')}): say which two to compare with --labels <first>,<second>` };
}

export function pairsOf(runs: Run[], labels: [string, string]): Pair[] {
  const by = new Map<string, Partial<Record<'a' | 'b', Run>>>();
  for (const r of runs) {
    const side = r.label === labels[0] ? 'a' : r.label === labels[1] ? 'b' : null;
    if (!side) continue;
    const have = by.get(r.brief) ?? {};
    if (have[side]) throw new Error(`there are two runs of ${r.brief} labelled ${r.label}: a label holds one run of each description (give a repeat a label of its own)`);
    by.set(r.brief, { ...have, [side]: r });
  }
  return [...by.entries()].filter((e): e is [string, { a: Run; b: Run }] => !!e[1].a && !!e[1].b).map(([brief, v]) => ({ brief, a: v.a, b: v.b })).sort((x, y) => (x.brief < y.brief ? -1 : 1));
}

const both = (pairs: Pair[], f: (r: Run) => number | null | undefined): number[] => pairs.flatMap((p) => {
  const [a, b] = [f(p.a), f(p.b)];
  return a === null || a === undefined || b === null || b === undefined ? [] : [b - a];
});
const ratios = (pairs: Pair[], f: (r: Run) => number | null | undefined): number[] => pairs.flatMap((p) => {
  const [a, b] = [f(p.a), f(p.b)];
  return a === null || a === undefined || b === null || b === undefined || a === 0 ? [] : [b / a];
});

export function summary(pairs: Pair[], [la, lb]: [string, string]): string[] {
  if (pairs.length === 0) return [`No brief has both a run labelled ${la} and one labelled ${lb} yet.`];
  const lines: string[] = [];
  const checks = both(pairs, (r) => share(r) * 100);
  const counts = both(pairs, (r) => r.c.judged.score.passed);
  const better = checks.filter((d) => d > 0.0001).length;
  const worse = checks.filter((d) => d < -0.0001).length;
  const allA = pairs.filter((p) => p.a.c.judged.score.all).length;
  const allB = pairs.filter((p) => p.b.c.judged.score.all).length;
  lines.push(`- Checks passed (${lb} minus ${la}, in points of the share of the brief's lines): median ${interval(bootstrap(checks), 1, ' points')}. In whole lines: median ${signed(median(counts), 1)}.`);
  lines.push(`- Briefs where ${lb} passed more: ${better}; the same: ${checks.length - better - worse}; fewer: ${worse}. Every line passed: ${la} ${allA} of ${pairs.length}, ${lb} ${allB} of ${pairs.length}.`);
  lines.push(`- Cost in US dollars (${lb} minus ${la}): median ${interval(bootstrap(both(pairs, (r) => r.c.run.costUsd)), 2)}. Ratio ${lb} / ${la}: median ${interval(bootstrap(ratios(pairs, (r) => r.c.run.costUsd)), 2)}.`);
  lines.push(`- Time in minutes (${lb} minus ${la}): median ${interval(bootstrap(both(pairs, (r) => (r.c.run.seconds === null ? null : r.c.run.seconds / 60))), 1)}. Ratio ${lb} / ${la}: median ${interval(bootstrap(ratios(pairs, (r) => r.c.run.seconds)), 2)}.`);
  lines.push(`- Lines in the app (${lb} minus ${la}): median ${interval(bootstrap(both(pairs, (r) => r.c.size.lines)), 0)}.`);
  const built = pairs.filter((p) => p.a.c.started).length;
  const builtB = pairs.filter((p) => p.b.c.started).length;
  lines.push(`- A production build starts: ${la} ${built} of ${pairs.length}, ${lb} ${builtB} of ${pairs.length}.`);
  return lines;
}

// ------------------------------------------------------------------------------------------------ the whole report

/** One row for each group: how many pairs, and the median of what changed between the labels in checks, cost and time. */
function lineTable(groups: [string, Pair[]][], [la, lb]: [string, string]): string[] {
  const head = ['Group', 'Pairs', `Median Δ points (${lb} minus ${la})`, 'Median Δ cost (USD)', `Median cost ratio ${lb} / ${la}`, 'Median Δ minutes', `Median time ratio ${lb} / ${la}`, `${lb} passed more / same / fewer`];
  const rows = groups.map(([name, ps]) => {
    const pts = both(ps, (r) => share(r) * 100);
    const better = pts.filter((d) => d > 0.0001).length;
    const worse = pts.filter((d) => d < -0.0001).length;
    return [name, String(ps.length), signed(median(pts), 1), signed(median(both(ps, (r) => r.c.run.costUsd)), 2), signed(median(ratios(ps, (r) => r.c.run.costUsd)), 2).replace('+', ''), signed(median(both(ps, (r) => (r.c.run.seconds === null ? null : r.c.run.seconds / 60))), 1), signed(median(ratios(ps, (r) => r.c.run.seconds)), 2).replace('+', ''), ps.length ? `${better} / ${pts.length - better - worse} / ${worse}` : dash];
  });
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((x) => `| ${x.join(' | ')} |`)];
}

const failedIds = (r: Run) => r.c.judged.lines.filter((l) => l.status === 'fail' || l.status === 'could-not-run').map((l) => l.id).join(', ') || dash;
const notCheckedIds = (r: Run) => r.c.judged.lines.filter((l) => l.status === 'not-checked').map((l) => l.id);
const hydorCell = (r: Run) => (!r.c.hydor ? dash : !r.c.hydor.ran ? 'not run' : `${r.c.hydor.passed} passed, ${r.c.hydor.failed} failed`);
const nameOf = (r: Run, groups: Record<string, Group>) => `${r.brief}${groups[r.brief] && groups[r.brief] !== 'accounts' ? ` (${groups[r.brief]})` : ''}`;

function runTable(runs: Run[], groups: Record<string, Group>, change: boolean): string[] {
  const hasHydor = runs.some((r) => r.c.hydor);
  const head = [
    ...['Brief', 'Label', 'Model', 'Checks', 'All', 'Failed', 'Cost', 'Tokens in / out', 'Minutes'],
    ...(change ? ['Lines changed', 'Files changed'] : ['Files', 'Lines']),
    'Builds and starts',
    ...(hasHydor ? ["Hydor's contract (not in the score)"] : []),
  ];
  const rows = [...runs].sort((x, y) => (x.brief < y.brief ? -1 : x.brief > y.brief ? 1 : x.label < y.label ? -1 : 1)).map((r) => {
    const j = r.c.judged;
    const common = [nameOf(r, groups), r.label, r.c.run.model ?? dash, `${j.score.passed}/${j.score.total}${notCheckedIds(r).length ? ` (+${notCheckedIds(r).length} not checked)` : ''}`, j.score.all ? 'yes' : 'no', failedIds(r), money(r.c.run.costUsd), `${kilo(r.c.run.tokens.input)} / ${kilo(r.c.run.tokens.output)}`, minutes(r.c.run.seconds)];
    return [...common, ...(change ? [r.c.changed ? String(r.c.changed.lines) : dash, r.c.changed ? String(r.c.changed.files) : dash] : [String(r.c.size.files), String(r.c.size.lines)]), r.c.started ? 'yes' : 'no', ...(hasHydor ? [hydorCell(r)] : [])];
  });
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
}

function pairTable(pairs: Pair[], change: boolean, [la, lb]: [string, string]): string[] {
  const head = ['Brief', `Checks ${la} / ${lb}`, 'Δ points', `Cost ${la} / ${lb}`, 'Δ $', `Minutes ${la} / ${lb}`, 'Δ min', change ? `Lines changed ${la} / ${lb}` : `Lines ${la} / ${lb}`];
  const rows = pairs.map((p) => {
    const [a, b] = [p.a.c, p.b.c];
    const dm = a.run.seconds !== null && b.run.seconds !== null ? (b.run.seconds - a.run.seconds) / 60 : null;
    const dc = a.run.costUsd !== null && b.run.costUsd !== null ? b.run.costUsd - a.run.costUsd : null;
    return [p.brief, `${a.judged.score.passed}/${a.judged.score.total} · ${b.judged.score.passed}/${b.judged.score.total}`, signed((share(p.b) - share(p.a)) * 100, 1), `${money(a.run.costUsd)} · ${money(b.run.costUsd)}`, signed(dc, 2), `${minutes(a.run.seconds)} · ${minutes(b.run.seconds)}`, signed(dm, 1), change ? `${a.changed?.lines ?? dash} · ${b.changed?.lines ?? dash}` : `${a.size.lines} · ${b.size.lines}`];
  });
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)];
}

function failureCounts(runs: Run[], labels: string[]): string[] {
  const out: string[] = [];
  for (const label of labels) {
    const counts = new Map<string, number>();
    const mine = runs.filter((r) => r.label === label);
    for (const r of mine) for (const l of r.c.judged.lines) if (l.status === 'fail' || l.status === 'could-not-run') counts.set(l.id, (counts.get(l.id) ?? 0) + 1);
    out.push(`- ${label} (${mine.length} run${mine.length === 1 ? '' : 's'}): ${[...counts].sort((x, y) => y[1] - x[1]).map(([id, n]) => `${id} ${n}`).join(', ') || 'no line failed'}`);
  }
  return out;
}

/** What Hydor's contract checker said of the runs that had a hydor.json, apart from the score. */
function hydorSection(runs: Run[], groups: Record<string, Group>): string[] {
  const have = runs.filter((r) => r.c.hydor).sort((x, y) => (x.brief < y.brief ? -1 : x.brief > y.brief ? 1 : x.label < y.label ? -1 : 1));
  if (have.length === 0) return [];
  const rows = have.map((r) => `| ${nameOf(r, groups)} | ${r.label} | ${hydorCell(r)} | ${r.c.hydor!.lines.filter((l) => l.state === 'failed' || l.state === 'notRun').map((l) => l.id).join(', ') || dash} |`);
  return ["## Hydor's contract, apart from the score", '', `${have.length} of ${runs.length} runs had a hydor.json, so Hydor's contract checker was run on them. Its lines (and \`agree\`, which fails when judge.json and hydor.json say different things about how to start) are not in any score above.`, '', '| Brief | Label | Lines | Failed or not run |', '| --- | --- | --- | --- |', ...rows, ''];
}

export interface ReportOptions {
  labels?: [string, string];
  title?: string;
}

export function buildReport(runs: Run[], groups: Record<string, Group>, changeRuns: Run[] = [], o: ReportOptions = {}): string {
  const out: string[] = [`# ${o.title ?? 'The cost of building a small web app from a description'}`, ''];
  const ids = new Set(runs.map((r) => r.brief));
  const labels = labelsOf(runs);
  out.push(`${runs.length} runs over ${ids.size} brief${ids.size === 1 ? '' : 's'}, in ${labels.length} label${labels.length === 1 ? '' : 's'}: ${labels.map((l) => `${l} (${runs.filter((r) => r.label === l).length})`).join(', ')}. Models: ${[...new Set(runs.map((r) => r.c.run.model ?? 'not recorded'))].join(', ')}. Budget and time given to each builder: ${[...new Set(runs.map((r) => `${r.c.run.budgetUsd} US dollars, ${r.c.run.minutes} minutes`))].join('; ')}.`, '');
  out.push('## Every run', '', ...runTable(runs, groups, false), '');
  const chosen = o.labels ?? chooseLabels(runs);
  if ('why' in chosen) {
    out.push('## Nothing to compare yet', '', `${chosen.why.charAt(0).toUpperCase()}${chosen.why.slice(1)}.`, '', ...hydorSection(runs, groups));
    return `${out.join('\n')}\n`;
  }
  const [la, lb] = chosen;
  const pairs = pairsOf(runs, chosen);
  const group = (g: Group) => pairs.filter((p) => groups[p.brief] === g);
  const [accounts, logic, larger] = [group('accounts'), group('logic'), group('larger')];
  out.push(`## ${lb} against ${la}`, '', `Every difference is ${lb} minus ${la}, and every ratio ${lb} / ${la}: a cost ratio under 1 means ${lb} cost less.`, '');
  out.push('## One row for each group', '', ...lineTable([[GROUP_NAMES.accounts, accounts], [GROUP_NAMES.logic, logic], [GROUP_NAMES.larger, larger]], chosen), '');
  const sections: [Group, Pair[]][] = [['accounts', accounts], ['logic', logic], ['larger', larger]];
  for (const [g, ps] of sections) out.push(`## ${GROUP_NAMES[g]}: ${ps.length} pair${ps.length === 1 ? '' : 's'}`, '', ...pairTable(ps, false, chosen), '', ...summary(ps, chosen), '');
  out.push(`## All pairs together: ${pairs.length}`, '', ...summary(pairs, chosen), '');
  out.push('## Where each label loses lines', '', ...failureCounts(runs, [la, lb]), '');
  const worse = pairs.filter((p) => share(p.b) < share(p.a) || (p.b.c.run.costUsd ?? 0) > (p.a.c.run.costUsd ?? Infinity) || (p.b.c.run.seconds ?? 0) > (p.a.c.run.seconds ?? Infinity));
  out.push(`## Where ${lb} is worse than ${la}`, '', worse.length === 0 ? `In no pair did ${lb} pass fewer lines, cost more or take longer.` : worse.map((p) => {
    const why: string[] = [];
    if (share(p.b) < share(p.a)) why.push(`passed fewer lines (${p.b.c.judged.score.passed} against ${p.a.c.judged.score.passed}; it failed ${failedIds(p.b)})`);
    if ((p.b.c.run.costUsd ?? 0) > (p.a.c.run.costUsd ?? Infinity)) why.push(`cost more (${money(p.b.c.run.costUsd)} against ${money(p.a.c.run.costUsd)})`);
    if ((p.b.c.run.seconds ?? 0) > (p.a.c.run.seconds ?? Infinity)) why.push(`took longer (${minutes(p.b.c.run.seconds)} against ${minutes(p.a.c.run.seconds)} minutes)`);
    return `- ${nameOf(p.b, groups)}: under ${lb} it ${why.join(', ')}.`;
  }).join('\n'), '');
  out.push(...hydorSection(runs, groups));
  out.push(...CAN_SHOW(pairs.length, [accounts.length, logic.length, larger.length]), '');
  if (changeRuns.length > 0) {
    const cp = pairsOf(changeRuns, chosen);
    out.push('## The change request: what it costs to change the app afterwards', '', ...runTable(changeRuns, groups, true), '', ...pairTable(cp, true, chosen), '', ...summary(cp, chosen), '');
  }
  return `${out.join('\n')}\n`;
}

const CAN_SHOW = (pairs: number, sizes: number[]): string[] => [
  `**What this can and cannot show.** ${pairs} pair${pairs === 1 ? '' : 's'} with one run each${pairs > 0 ? ` (${sizes.join(', ')} in the three groups)` : ''} is a small sample, and a group of a few pairs is smaller still. A builder agent is not deterministic: the same brief built twice by the same agent in the same setting can differ by more than the`,
  'difference between two labels, and one run of each says nothing of that spread (a repeat under a label of its own shows it). The intervals above come from drawing the briefs again (the briefs, not the runs, are what is resampled), so they',
  'do not include the builder\'s own run-to-run noise either; they are wider than they look from the median alone, and with a handful of pairs a bootstrap interval is a rough guide, not a test.',
  'The three groups are chosen, not drawn. A median over a group says what happens for descriptions like these, not for descriptions in general.',
  'What it can show: a large, one-sided difference that holds in nearly every pair (one label passing more lines in nearly every brief, or costing a third as much), and **where** it does not hold: a brief where it passed fewer lines or cost more, and the lines each label fails.',
  'What it cannot show: that one setting is better in general (other models, other briefs, other makers), that a difference is due to what was changed and not to something else that changed between the labels, how an app looks or',
  'feels, what happens in a browser with scripts, security beyond who may see which rows and where the secrets are, or what a year of changes costs. Cost and time are the driver\'s. Each builder wrote `judge.json`; that work is in every run.',
];

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string' }, title: { type: 'string' }, labels: { type: 'string' } } });
  const folder = positionals[0];
  if (!folder || !existsSync(folder)) {
    console.error('usage: node scripts/webapp-bench/report.ts <folder of runs> [--labels <first>,<second>] [--out file.md] [--title "..."]');
    return 2;
  }
  const runs = readRuns(resolve(folder));
  let labels: [string, string] | undefined;
  if (values.labels) {
    const chosen = chooseLabels(runs, values.labels);
    if ('why' in chosen) {
      console.error(chosen.why);
      return 2;
    }
    labels = chosen;
  }
  const text = buildReport(runs, groupsOf(), readRuns(resolve(folder), true), { ...(labels ? { labels } : {}), ...(values.title ? { title: values.title } : {}) });
  if (values.out) writeFileSync(values.out, text);
  else process.stdout.write(text);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exit(await main());
