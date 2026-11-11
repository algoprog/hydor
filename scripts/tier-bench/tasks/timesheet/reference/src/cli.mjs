#!/usr/bin/env node
// tt: the command line. Each command reads the data file, does its work and prints its result; a mistake in the
// arguments or the data is an error message on stderr and exit code 2, with nothing on stdout.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { formatCsv, HEADER, parseCsv } from './csv.mjs';
import { formatDuration, parseDuration } from './duration.mjs';
import { addEntry, minutesOf, startEntry, stopEntry } from './entries.mjs';
import { fail, TtError } from './errors.mjs';
import { buildReport, renderReport } from './report.mjs';
import { loadData, saveData } from './store.mjs';
import { addDays, mondayOf, weekOf, weekRange } from './weeks.mjs';
import { addMinutes, dateOf, instantOf, nowLocal, parseLocal } from './zone.mjs';

const USAGE = 'usage: tt <add|start|stop|report|export|import> [arguments] [--data <file>] [--now <YYYY-MM-DDTHH:MM>]';

// What each command takes: its options and how many words (arguments that are not options).
const COMMANDS = {
  add: { options: ['for', 'note'], words: [2, 3] },
  start: { options: ['at', 'note'], words: [1, 1] },
  stop: { options: ['at'], words: [0, 0] },
  report: { options: ['week', 'from', 'to'], words: [0, 0] },
  export: { options: [], words: [0, 0] },
  import: { options: [], words: [1, 1] },
};

function parseArgs(argv) {
  const [name, ...rest] = argv;
  const command = COMMANDS[name];
  if (!command) fail(name === undefined ? USAGE : `unknown command: ${name}\n${USAGE}`);
  const words = [];
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (!arg.startsWith('--')) {
      words.push(arg);
      continue;
    }
    const option = arg.slice(2);
    if (option !== 'data' && option !== 'now' && !command.options.includes(option)) fail(`tt ${name} does not take --${option}`);
    if (i + 1 >= rest.length) fail(`--${option} needs a value`);
    if (option in options) fail(`--${option} given twice`);
    options[option] = rest[++i];
  }
  const [min, max] = command.words;
  if (words.length < min || words.length > max) fail(`tt ${name}: wrong number of arguments\n${USAGE}`);
  return { name, words, options };
}

function reportRange(options, nowText) {
  const { week, from, to } = options;
  if (week !== undefined && (from !== undefined || to !== undefined)) fail('--week cannot be combined with --from and --to');
  if (week !== undefined) {
    return { title: (range) => `Week ${week} (${range.from} to ${range.to})`, range: weekRange(week) };
  }
  if (from !== undefined || to !== undefined) {
    if (from === undefined || to === undefined) fail('--from and --to go together');
    if (from > to) fail(`--from ${from} is after --to ${to}`);
    return { title: (range) => `Report ${range.from} to ${range.to}`, range: { from, to } };
  }
  const monday = mondayOf(dateOf(nowText));
  return { title: (range) => `Week ${weekOf(dateOf(nowText))} (${range.from} to ${range.to})`, range: { from: monday, to: addDays(monday, 6) } };
}

// Runs a command line and returns what it prints. The files are read and written relative to the working folder.
export function execute(argv) {
  const { name, words, options } = parseArgs(argv);
  const file = options.data ?? 'timesheet.json';
  const data = loadData(file);
  const nowText = options.now ?? nowLocal(data.timeZone);
  parseLocal(nowText);
  const now = instantOf(nowText, data.timeZone);

  if (name === 'add') {
    const [project, start] = words;
    if ((words[2] === undefined) === (options.for === undefined)) fail('give an end or --for <duration>, not both and not neither');
    const end = words[2] ?? addMinutes(start, parseDuration(options.for), data.timeZone);
    const entry = addEntry(data, { project, start, end, note: options.note });
    saveData(file, data);
    return `added #${entry.id} ${formatDuration(minutesOf(entry, now, data.timeZone))}\n`;
  }
  if (name === 'start') {
    const entry = startEntry(data, { project: words[0], start: options.at ?? nowText, note: options.note });
    saveData(file, data);
    return `started #${entry.id} ${entry.start}\n`;
  }
  if (name === 'stop') {
    const entry = stopEntry(data, options.at ?? nowText);
    saveData(file, data);
    return `stopped #${entry.id} ${formatDuration(minutesOf(entry, now, data.timeZone))}\n`;
  }
  if (name === 'report') {
    const { title, range } = reportRange(options, nowText);
    return renderReport(title(range), buildReport(data, range, now));
  }
  if (name === 'export') {
    const rows = data.entries.map((e) => [String(e.id), e.project, e.start, e.end ?? '', String(minutesOf(e, now, data.timeZone)), e.note]);
    return formatCsv([HEADER, ...rows]);
  }
  // import
  let text;
  try {
    text = fs.readFileSync(words[0], 'utf8');
  } catch (e) {
    return fail(`cannot read ${words[0]}: ${e.code ?? e.message}`);
  }
  const [header, ...rows] = parseCsv(text);
  if (!header || header.join(',') !== HEADER.join(',')) fail(`${words[0]}: the first row must be ${HEADER.join(',')}`);
  rows.forEach((row, i) => {
    if (row.length !== HEADER.length) fail(`${words[0]}: row ${i + 2} has ${row.length} columns, expected ${HEADER.length}`);
    const [, project, start, end, , note] = row;
    if (end === '') startEntry(data, { project, start, note });
    else addEntry(data, { project, start, end, note });
  });
  saveData(file, data);
  return `imported ${rows.length}\n`;
}

function main() {
  try {
    process.stdout.write(execute(process.argv.slice(2)));
  } catch (e) {
    if (!(e instanceof TtError)) {
      process.stderr.write(`tt: unexpected error: ${e.stack}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`tt: ${e.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) main();
