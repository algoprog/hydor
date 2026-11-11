// The entries of the data file: adding, starting and stopping them, and how long they lasted.
import { fail } from './errors.mjs';
import { minutesBetween, parseLocal } from './zone.mjs';

const PROJECT = /^[A-Za-z0-9._-]+$/;

export function checkProject(name) {
  if (!PROJECT.test(name)) fail(`not a project name (letters, digits, . _ and - only): ${name}`);
}

export function nextId(data) {
  return data.entries.reduce((most, e) => Math.max(most, e.id), 0) + 1;
}

// The entry that has no end yet, if there is one.
export function runningEntry(data) {
  return data.entries.find((e) => e.end === undefined);
}

// How long an entry lasted in whole minutes; one still running lasts until now.
export function minutesOf(entry, now) {
  return Math.max(0, minutesBetween(entry.start, entry.end ?? now));
}

export function addEntry(data, { project, start, end, note = '' }) {
  checkProject(project);
  parseLocal(start);
  parseLocal(end);
  if (minutesBetween(start, end) <= 0) fail(`the end must be after the start: ${start} to ${end}`);
  const entry = { id: nextId(data), project, start, end, note };
  data.entries.push(entry);
  return entry;
}

export function startEntry(data, { project, start, note = '' }) {
  checkProject(project);
  parseLocal(start);
  const running = runningEntry(data);
  if (running) fail(`a timer is already running: #${running.id} (${running.project})`);
  const entry = { id: nextId(data), project, start, note };
  data.entries.push(entry);
  return entry;
}

export function stopEntry(data, end) {
  const entry = runningEntry(data);
  if (!entry) fail('no timer is running');
  parseLocal(end);
  if (minutesBetween(entry.start, end) <= 0) fail(`the end must be after the start: ${entry.start} to ${end}`);
  entry.end = end;
  return entry;
}
