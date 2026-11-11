// The data file: one JSON document with the time zone, the currency, the hourly rates and the entries.
import fs from 'node:fs';
import { fail } from './errors.mjs';
import { isKnownZone } from './zone.mjs';

export function loadData(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return fail(`cannot read ${file}: ${e.code ?? e.message}`);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail(`${file} is not valid JSON`);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) fail(`${file}: expected a JSON object`);
  if (typeof data.timeZone !== 'string' || !isKnownZone(data.timeZone)) fail(`${file}: "timeZone" must be a time zone name such as Europe/Athens`);
  if (typeof data.currency !== 'string' || data.currency === '') fail(`${file}: "currency" must be a currency code such as EUR`);
  data.rates ??= {};
  for (const [project, rate] of Object.entries(data.rates)) {
    if (!Number.isInteger(rate) || rate < 0) fail(`${file}: the rate of ${project} must be a whole number of cents per hour`);
  }
  data.entries ??= [];
  if (!Array.isArray(data.entries)) fail(`${file}: "entries" must be a list`);
  for (const e of data.entries) {
    if (!Number.isInteger(e.id) || typeof e.project !== 'string' || typeof e.start !== 'string') fail(`${file}: an entry needs an id, a project and a start`);
    e.note ??= '';
  }
  return data;
}

// Writes the file whole or not at all: a temporary file beside it, then a rename.
export function saveData(file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(temp, file);
}
