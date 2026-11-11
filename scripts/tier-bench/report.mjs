// The benchmark's results as tables (Markdown): each task each way, each way over the tasks it ran, and what the leads handed over.
//   node scripts/tier-bench/report.mjs [results.json ...]
// Several files are read as one: their runs are put together. The default file is tier-bench-results.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A share as a percentage: whole when it is one, else to a tenth (99.5%, so that one missed check in two hundred still shows). */
const pct = (x) => `${Math.abs(x * 100 - Math.round(x * 100)) < 0.05 ? Math.round(x * 100) : (x * 100).toFixed(1)}%`;
const usd = (x) => `$${x.toFixed(2)}`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
/** A share of the checks a run passed. */
const score = (r) => r.check.passed / r.check.total;

/** The ways in the order the tables show them, with the names they have in the tables. */
const WAYS = [
  ['quick', 'Quick alone'],
  ['standard', 'Standard alone'],
  ['solo', 'Best alone'],
  ['max', 'Max alone'],
  ['lead', 'Best + helpers'],
  ['team', 'Team (Automatic)'],
];
const NAME = Object.fromEntries(WAYS);

/** A difference from the other way as a signed percentage, with the minus sign −; nothing when it rounds to none. */
const signed = (d) => (pct(Math.abs(d)) === '0%' ? '0%' : `${d < 0 ? '−' : '+'}${pct(Math.abs(d))}`);

/** One way's runs of one task, summed up: the share of checks passed, the cost and the time (means over its repeats). */
function cell(runs) {
  if (!runs.length) return null;
  const scores = runs.map(score);
  return {
    score: mean(scores),
    low: Math.min(...scores),
    high: Math.max(...scores),
    spread: new Set(scores).size > 1,
    usd: mean(runs.map((r) => r.usd ?? 0)),
    min: mean(runs.map((r) => r.ms / 60_000)),
    ends: [...new Set(runs.map((r) => r.end).filter((e) => e !== 'done'))],
    // Runs whose agents read the task's hidden files (run.mjs looks for them in the transcripts).
    peeked: runs.filter((r) => r.peeked).length,
    n: runs.length,
  };
}

/** The helpers of some runs, counted by tier (or by the model a Claude Code lead gave them in its turns), as a mean per run. */
function helpersPerRun(runs) {
  const counts = {};
  for (const r of runs) for (const h of r.helpers ?? []) counts[h.tier ?? 'named'] = (counts[h.tier ?? 'named'] ?? 0) + 1;
  // Those a Claude Code lead ran inside its own turns (its Agent tool), by the model it gave each.
  for (const r of runs) for (const h of r.inTurn ?? []) counts[`${h.model} in turn`] = (counts[`${h.model} in turn`] ?? 0) + 1;
  const digits = runs.length > 1 ? 1 : 0;
  return Object.entries(counts).map(([k, n]) => `${(n / runs.length).toFixed(digits)} ${k}`).join(', ') || 'none';
}

/** A Markdown table from a header row and body rows. */
const markdown = (header, rows) => [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((row) => `| ${row.join(' | ')} |`)];

export function table(results) {
  const tasks = [...new Set(results.map((r) => r.task))];
  const ways = WAYS.map(([w]) => w).filter((w) => results.some((r) => r.way === w));
  const runsOf = (t, w) => results.filter((r) => r.task === t && r.way === w);
  const cellOf = (t, w) => cell(runsOf(t, w));
  /** The tasks a way ran, each with its summed-up cell. */
  const ran = (w) => tasks.map((t) => [t, cellOf(t, w)]).filter(([, c]) => c);

  // The first table: each task, each way, as the share of checks passed, the cost and the time.
  const first = (c) => {
    const share = c.spread ? `${pct(c.score)} (${pct(c.low)}–${pct(c.high)})` : pct(c.score);
    return [share, usd(c.usd), `${c.min.toFixed(1)} min`, ...(c.n > 1 ? [`${c.n} runs`] : []), ...(c.ends.length ? [c.ends.join(', ')] : []), ...(c.peeked ? [`${c.peeked} read the hidden files`] : [])].join(' · ');
  };
  const t1 = markdown(
    ['Task', ...ways.map((w) => NAME[w])],
    tasks.map((t) => [t, ...ways.map((w) => (cellOf(t, w) ? first(cellOf(t, w)) : '–'))]),
  );

  // The second table: each way over the tasks it ran, each task weighing the same.
  const t2rows = ways.map((w) => {
    const done = ran(w);
    const cs = done.map(([, c]) => c);
    const lowest = Math.min(...results.filter((r) => r.way === w).map(score));
    // Cost beside Best alone: over the tasks that both this way and solo ran.
    let beside = '–';
    if (w !== 'solo' && ways.includes('solo')) {
      const both = done.filter(([t]) => cellOf(t, 'solo'));
      const mine = both.reduce((a, [, c]) => a + c.usd, 0);
      const solo = both.reduce((a, [t]) => a + cellOf(t, 'solo').usd, 0);
      if (both.length && solo > 0) beside = signed(mine / solo - 1);
    }
    return [
      NAME[w],
      `${done.length}`,
      pct(mean(cs.map((c) => c.score))),
      pct(lowest),
      `${cs.filter((c) => c.score < 1).length} of ${done.length}`,
      usd(cs.reduce((a, c) => a + c.usd, 0)),
      `${cs.reduce((a, c) => a + c.min, 0).toFixed(1)} min`,
      beside,
    ];
  });
  const t2 = markdown(['Way', 'Tasks', 'Checks', 'Lowest run', 'Tasks below 100%', 'Cost', 'Time', 'Cost beside Best alone'], t2rows);

  // The third table, only when a lead ran: what it handed over, per task.
  const led = ['lead', 'team'].filter((w) => ways.includes(w));
  const t3rows = [];
  for (const t of tasks) {
    for (const w of led) {
      const runs = runsOf(t, w);
      if (!runs.length) continue;
      const moves = [...new Set(runs.flatMap((r) => (r.moved ?? []).map((m) => (m.event === 'auto' ? `started on ${m.tier}` : `stepped up to ${m.tier}`))))];
      t3rows.push([
        t,
        NAME[w],
        [...new Set(runs.map((r) => r.model).filter(Boolean))].join(', '),
        helpersPerRun(runs),
        moves.join(', '),
      ]);
    }
  }

  const blocks = [
    ['**Each task, each way**', t1],
    ['**Each way, over the tasks it ran**', t2],
  ];
  if (t3rows.length) blocks.push(['**What the leads handed over**', markdown(['Task', 'Way', "Lead's model", 'Helpers per run', 'Moves'], t3rows)]);
  return blocks.map(([title, lines]) => [title, '', ...lines].join('\n')).join('\n\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = process.argv.slice(2);
  const results = (files.length ? files : ['tier-bench-results.json']).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  console.log(table(results));
}
