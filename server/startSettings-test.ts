// Script test for the start page's picks (server/startSettings.ts): what is kept in each place (its agent, runs,
// assistant, worktree, memory, cap and Confidential), how places are tidied, merged, pruned and seeded from data saved
// before places existed. Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/startSettings-test.ts
//   DATA_DIR=/tmp/hydor-test-startsettings node dist/dev/startSettings-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvGet, kvSet, openDb } from './db.ts';
import { startSettings, updateStartSettings } from './startSettings.ts';
import type { StartPlace } from '../shared/types.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-startsettings-test-'));
let n = 0;
/** A fresh database, so each scenario starts from nothing. */
const fresh = () => openDb(path.join(tmp, `test-${++n}.db`));

// A fresh database has no places.
assert.equal(startSettings(fresh()).places, undefined);

// An update stores the record: its account is dropped, the rest kept.
{
  const db = fresh();
  const out = updateStartSettings(db, {
    cwd: '/tmp',
    places: {
      'folder:/tmp': {
        agent: 'codex',
        runs: { codex: { model: 'm', effort: 'high', mode: 'full', account: 'x' } },
        assistant: 'researcher',
        memory: false,
        capUsd: 5,
        confidential: true,
        worktree: true,
        at: 1,
      },
    },
  });
  const want = { agent: 'codex', runs: { codex: { model: 'm', effort: 'high', mode: 'full' } }, assistant: 'researcher', memory: false, capUsd: 5, confidential: true, worktree: true, at: 1 };
  assert.deepEqual(out.places, { 'folder:/tmp': want });
  assert.deepEqual(startSettings(db).places, { 'folder:/tmp': want });
}

// Keys that are not a place's name are dropped, and so is a record without a time or with a bad one.
{
  const db = fresh();
  updateStartSettings(db, {
    places: {
      bogus: { agent: 'codex', at: 1 },
      'folder:relative/path': { agent: 'codex', at: 1 },
      'project:bad space': { agent: 'codex', at: 1 },
      task: { agent: 'claude' },
      'project:sp1': { agent: 'claude', at: 0 },
      'folder:/tmp': { agent: 'codex', at: 2 },
      'project:sp2': { agent: 'codex', at: 3 },
      task2: { agent: 'codex', at: 4 },
    },
  });
  assert.deepEqual(Object.keys(startSettings(db).places ?? {}).sort(), ['folder:/tmp', 'project:sp2']);
}

// An invalid agent inside a record is dropped; the record stays.
{
  const db = fresh();
  updateStartSettings(db, { places: { 'folder:/tmp': { agent: 'evil', assistant: 'writer', at: 3 } } });
  assert.deepEqual(startSettings(db).places, { 'folder:/tmp': { assistant: 'writer', at: 3 } });
}

// null deletes a place; a second record for the same key replaces the first entirely.
{
  const db = fresh();
  updateStartSettings(db, { places: { 'folder:/tmp': { agent: 'codex', capUsd: 3, at: 1 }, task: { agent: 'claude', at: 2 } } });
  updateStartSettings(db, { places: { 'folder:/tmp': { assistant: 'writer', at: 5 } } });
  assert.deepEqual(startSettings(db).places, { 'folder:/tmp': { assistant: 'writer', at: 5 }, task: { agent: 'claude', at: 2 } });
  updateStartSettings(db, { places: { task: null } });
  assert.deepEqual(startSettings(db).places, { 'folder:/tmp': { assistant: 'writer', at: 5 } });
}

// Only the 60 places used last are kept.
{
  const db = fresh();
  const places: Record<string, unknown> = {};
  for (let i = 1; i <= 70; i++) places[`project:p${i}`] = { agent: 'claude', at: i };
  updateStartSettings(db, { places });
  const kept = startSettings(db).places ?? {};
  assert.equal(Object.keys(kept).length, 60);
  assert.deepEqual(
    Object.values(kept)
      .map((v: StartPlace) => v.at)
      .sort((a, b) => a - b),
    Array.from({ length: 60 }, (_, i) => i + 11),
  );
}

// Data saved before places existed: the pick last made becomes its place.
{
  const db = fresh();
  kvSet(db, 'start', JSON.stringify({ agent: 'codex', runs: { codex: { model: 'm', account: 'a' } }, assistant: 'writer', cwd: '/tmp', task: false }));
  const s = startSettings(db);
  assert.deepEqual(Object.keys(s.places ?? {}), ['folder:/tmp']);
  const rec = s.places!['folder:/tmp'];
  assert.equal(typeof rec.at, 'number');
  assert.deepEqual({ ...rec, at: 0 }, { agent: 'codex', runs: { codex: { model: 'm' } }, assistant: 'writer', at: 0 });
  // The seeded record is stored with the next update from the start page (its time is the one that update made).
  const out = updateStartSettings(db, { places: {}, memory: false });
  const raw = JSON.parse(kvGet(db, 'start')!);
  assert.deepEqual(raw.places['folder:/tmp'], { agent: 'codex', runs: { codex: { model: 'm' } }, assistant: 'writer', at: out.places!['folder:/tmp'].at });
}

// The key follows the pick: a new task folder, a project.
{
  const db = fresh();
  kvSet(db, 'start', JSON.stringify({ agent: 'claude', task: true }));
  assert.deepEqual(Object.keys(startSettings(db).places ?? {}), ['task']);
}
{
  const db = fresh();
  kvSet(db, 'start', JSON.stringify({ agent: 'claude', space: 'sp1', cwd: '/tmp' }));
  assert.deepEqual(Object.keys(startSettings(db).places ?? {}), ['project:sp1']);
}

// Saved places are never seeded over: an empty record stays empty, even with picks.
{
  const db = fresh();
  kvSet(db, 'start', JSON.stringify({ places: {}, agent: 'codex', cwd: '/tmp', task: false }));
  assert.deepEqual(startSettings(db).places, {});
}

// A folder alone is not a pick: no place is seeded.
{
  const db = fresh();
  kvSet(db, 'start', JSON.stringify({ cwd: '/tmp', task: false }));
  assert.equal(startSettings(db).places, undefined);
}

// A pick changed by a client that keeps no places (an agent through the API): the place picked last keeps it too.
{
  const db = fresh();
  updateStartSettings(db, { places: {}, cwd: '/tmp', task: false, agent: 'claude' });
  const out = updateStartSettings(db, { assistant: 'researcher', runs: { claude: { model: 'm' } } });
  assert.equal(out.places?.['folder:/tmp']?.assistant, 'researcher');
  assert.equal(out.places?.['folder:/tmp']?.agent, 'claude');
  assert.deepEqual(out.places?.['folder:/tmp']?.runs, { claude: { model: 'm' } });
  // An account alone is the same everywhere: no place keeps it.
  const acct = updateStartSettings(fresh(), { cwd: '/tmp', task: false, runs: { claude: { account: 'a' } } });
  assert.equal(acct.places?.['folder:/tmp'], undefined);
}

// The start page sends `places` with each change: its own changes are not a place's picks by themselves.
{
  const db = fresh();
  const out = updateStartSettings(db, { places: {}, cwd: '/tmp', task: false, assistant: 'writer' });
  assert.deepEqual(out.places, {});
}

console.log('OK startSettings-test: places kept, tidied, merged, pruned and seeded from older data');
fs.rmSync(tmp, { recursive: true, force: true });
