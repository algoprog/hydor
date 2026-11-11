// The report: time per day, in total and per project, with what the projects earn.
import { spanOf } from './entries.mjs';
import { formatDuration } from './duration.mjs';
import { centsFor, formatCents } from './money.mjs';
import { addDays, dayName, dayNumber } from './weeks.mjs';
import { dateOf } from './zone.mjs';

// How many minutes the spans cover together: where spans overlap, the time counts once.
function coveredMinutes(spans) {
  let covered = 0;
  let end = -Infinity;
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    covered += Math.max(0, span.to - Math.max(span.from, end));
    end = Math.max(end, span.to);
  }
  return covered;
}

// Everything the report shows for the entries that start between two dates (inclusive). `now` is the moment a
// running entry counts up to.
export function buildReport(data, { from, to }, now) {
  const perDay = new Map();
  const perProject = new Map();
  for (const entry of data.entries) {
    const day = dateOf(entry.start);
    if (day < from || day > to) continue;
    const span = spanOf(entry, now, data.timeZone);
    if (!perDay.has(day)) perDay.set(day, []);
    perDay.get(day).push(span);
    perProject.set(entry.project, (perProject.get(entry.project) ?? 0) + (span.to - span.from));
  }
  const days = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) {
    const date = addDays(from, n - dayNumber(from));
    days.push({ date, minutes: coveredMinutes(perDay.get(date) ?? []) });
  }
  const projects = [...perProject.keys()].sort().map((name) => {
    const minutes = perProject.get(name);
    const rate = data.rates[name];
    return { name, minutes, amount: rate === undefined ? undefined : formatCents(centsFor(minutes, rate), data.currency) };
  });
  return { days, total: days.reduce((sum, d) => sum + d.minutes, 0), projects };
}

// The text of a report under a title: the days, the total, a blank line, then one line per project.
export function renderReport(title, report) {
  const line = (label, minutes) => `${label.padEnd(14)}${formatDuration(minutes).padStart(8)}`;
  const lines = [title];
  for (const d of report.days) lines.push(line(`${dayName(d.date)} ${d.date}`, d.minutes));
  lines.push(line('Total', report.total));
  if (report.projects.length > 0) {
    lines.push('');
    for (const p of report.projects) lines.push(line(p.name, p.minutes) + (p.amount === undefined ? '' : p.amount.padStart(12)));
  }
  return `${lines.join('\n')}\n`;
}
