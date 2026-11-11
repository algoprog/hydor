// The entries of the data file: adding, starting and stopping them, and how long they lasted.
import { fail } from './errors.mjs';
import { instantOf } from './zone.mjs';

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

// The moments an entry began and ended, in minutes since 1970; one still running ends at now (a moment, never
// before its start).
export function spanOf(entry, now, timeZone) {
  const from = instantOf(entry.start, timeZone);
  return { from, to: entry.end === undefined ? Math.max(now, from) : instantOf(entry.end, timeZone) };
}

// How long an entry lasted in real minutes.
export function minutesOf(entry, now, timeZone) {
  const { from, to } = spanOf(entry, now, timeZone);
  return to - from;
}

export function addEntry(data, { project, start, end, note = '' }) {
  checkProject(project);
  if (instantOf(end, data.timeZone) <= instantOf(start, data.timeZone)) fail(`the end must be after the start: ${start} to ${end}`);
  const entry = { id: nextId(data), project, start, end, note };
  data.entries.push(entry);
  return entry;
}

export function startEntry(data, { project, start, note = '' }) {
  checkProject(project);
  instantOf(start, data.timeZone);
  const running = runningEntry(data);
  if (running) fail(`a timer is already running: #${running.id} (${running.project})`);
  const entry = { id: nextId(data), project, start, note };
  data.entries.push(entry);
  return entry;
}

export function stopEntry(data, end) {
  const entry = runningEntry(data);
  if (!entry) fail('no timer is running');
  if (instantOf(end, data.timeZone) <= instantOf(entry.start, data.timeZone)) fail(`the end must be after the start: ${entry.start} to ${end}`);
  entry.end = end;
  return entry;
}
