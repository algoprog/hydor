// The report: time per day, in total and per project, with what the projects earn.
import { formatDuration } from './duration.mjs';
import { formatAmount, projectAmount } from './money.mjs';
import { addDays, dayName, dayNumber } from './weeks.mjs';
import { dateOf, minutesBetween } from './zone.mjs';

// Everything the report shows for the entries that start between two dates (inclusive).
export function buildReport(data, { from, to }) {
  const perDay = new Map();
  const perProject = new Map();
  for (const entry of data.entries) {
    const day = dateOf(entry.start);
    if (day < from || day > to) continue;
    const minutes = minutesBetween(entry.start, entry.end);
    perDay.set(day, (perDay.get(day) ?? 0) + minutes);
    if (!perProject.has(entry.project)) perProject.set(entry.project, []);
    perProject.get(entry.project).push(minutes);
  }
  const days = [];
  for (let n = dayNumber(from); n <= dayNumber(to); n++) {
    const date = addDays(from, n - dayNumber(from));
    days.push({ date, minutes: perDay.get(date) ?? 0 });
  }
  const projects = [...perProject.keys()].sort().map((name) => {
    const list = perProject.get(name);
    const rate = data.rates[name];
    return {
      name,
      minutes: list.reduce((a, b) => a + b, 0),
      amount: rate === undefined ? undefined : formatAmount(projectAmount(list, rate), data.currency),
    };
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
