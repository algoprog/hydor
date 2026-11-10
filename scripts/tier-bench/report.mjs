// The benchmark's results as a table (Markdown): each task both ways, then the totals.
//   node scripts/tier-bench/report.mjs [results.json]
// The first table sets one agent on Best alone beside the team; the second, where they were run, every way.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A share as a percentage: whole when it is one, else to a tenth (99.5%, so that one missed check in two hundred still shows). */
const pct = (x) => `${Math.abs(x * 100 - Math.round(x * 100)) < 0.05 ? Math.round(x * 100) : (x * 100).toFixed(1)}%`;
const usd = (x) => `$${x.toFixed(2)}`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** One way's runs of one task, summed up: the share of checks passed, the cost and the time (means over its repeats). */
function cell(runs) {
  if (!runs.length) return null;
  const tiers = {};
  for (const r of runs) for (const h of r.helpers ?? []) tiers[h.tier ?? 'named'] = (tiers[h.tier ?? 'named'] ?? 0) + 1;
  // Those a Claude Code lead ran inside its own turns (its Agent tool), by the model it gave each.
  for (const r of runs) for (const h of r.inTurn ?? []) tiers[`${h.model} in turn`] = (tiers[`${h.model} in turn`] ?? 0) + 1;
  return {
    score: mean(runs.map((r) => r.check.passed / r.check.total)),
    usd: mean(runs.map((r) => r.usd ?? 0)),
    helpersUsd: mean(runs.map((r) => r.helpersUsd ?? 0)),
    min: mean(runs.map((r) => r.ms / 60_000)),
    helpers: Object.entries(tiers).map(([t, n]) => `${(n / runs.length).toFixed(runs.length > 1 ? 1 : 0)} ${t}`).join(', ') || 'none',
    model: [...new Set(runs.map((r) => r.model).filter(Boolean))].join(', '),
    moved: [...new Set(runs.flatMap((r) => (r.moved ?? []).map((m) => `${m.event === 'auto' ? 'started' : 'stepped up'} on ${m.tier}`)))].join(', '),
    ends: [...new Set(runs.map((r) => r.end).filter((e) => e !== 'done'))].join(', '),
    n: runs.length,
  };
}

export function table(results) {
  const tasks = [...new Set(results.map((r) => r.task))];
  const lines = ['| Task | Solo: checks | Solo: cost | Solo: time | Team: checks | Team: cost | Team: time | Team: helpers | Cost |', '|---|---|---|---|---|---|---|---|---|'];
  const both = [];
  for (const t of tasks) {
    const solo = cell(results.filter((r) => r.task === t && r.way === 'solo'));
    const team = cell(results.filter((r) => r.task === t && r.way === 'team'));
    const show = (c) => (c ? [`${pct(c.score)}${c.ends ? ` (${c.ends})` : ''}`, usd(c.usd), `${c.min.toFixed(1)} min`] : ['–', '–', '–']);
    const delta = solo && team && solo.usd > 0 ? `${team.usd <= solo.usd ? '−' : '+'}${pct(Math.abs(team.usd - solo.usd) / solo.usd)}` : '–';
    lines.push(`| ${t} | ${show(solo).join(' | ')} | ${show(team).join(' | ')} | ${team ? `${team.helpers}${team.moved ? `; ${team.moved}` : ''}` : '–'} | ${delta} |`);
    if (solo && team) both.push({ solo, team });
  }
  if (both.length) {
    const sum = (k, w) => both.reduce((a, b) => a + b[w][k], 0);
    const s = sum('usd', 'solo');
    const t = sum('usd', 'team');
    lines.push(
      `| **All ${both.length}** | ${pct(mean(both.map((b) => b.solo.score)))} | ${usd(s)} | ${sum('min', 'solo').toFixed(1)} min | ${pct(mean(both.map((b) => b.team.score)))} | ${usd(t)} | ${sum('min', 'team').toFixed(1)} min | | ${t <= s ? '−' : '+'}${pct(Math.abs(t - s) / (s || 1))} |`,
    );
  }
  // What each tier does alone, where it was tried: the share of checks passed and the cost.
  const alone = ['quick', 'standard', 'solo', 'max'].filter((w) => results.some((r) => r.way === w));
  if (alone.some((w) => w !== 'solo')) {
    const name = { quick: 'Quick alone', standard: 'Standard alone', solo: 'Best alone', max: 'Max alone' };
    const cols = [...alone, ...(results.some((r) => r.way === 'team') ? ['team'] : [])];
    lines.push('', `| Task | ${cols.map((w) => name[w] ?? 'Team').join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
    const sums = Object.fromEntries(cols.map((w) => [w, { usd: 0, score: 0, min: 0, n: 0 }]));
    for (const t of tasks) {
      lines.push(
        `| ${t} | ${cols
          .map((w) => {
            const c = cell(results.filter((r) => r.task === t && r.way === w));
            if (!c) return '–';
            const s = sums[w];
            (s.usd += c.usd), (s.score += c.score), (s.min += c.min), s.n++;
            return `${pct(c.score)}, ${usd(c.usd)}, ${c.min.toFixed(1)} min`;
          })
          .join(' | ')} |`,
      );
    }
    lines.push(`| **All** | ${cols.map((w) => (sums[w].n ? `${pct(sums[w].score / sums[w].n)}, ${usd(sums[w].usd)}, ${sums[w].min.toFixed(1)} min` : '–')).join(' | ')} |`);
  }
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(table(JSON.parse(fs.readFileSync(process.argv[2] ?? 'tier-bench-results.json', 'utf8'))));
