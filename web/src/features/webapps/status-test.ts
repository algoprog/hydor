// Script test for what the web apps pages say in words (status.ts, time.ts): which status an app is in and why, and how long ago
// in plain words. Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs web/src/features/webapps/status-test.ts && node dist/dev/status-test.js
import assert from 'node:assert/strict';
import type { WebApp } from '@shared/webapps';
import { readable, statusOf } from './status';
import { ago } from './time';

const app = (over: { shape?: Partial<WebApp['shape']>; run?: Partial<WebApp['run']>; build?: Partial<WebApp['build']>; mode?: Partial<WebApp['mode']> } = {}): WebApp => ({
  id: 'a',
  slug: 'a',
  name: 'A',
  folder: '/x/a',
  shape: { ok: true, signIn: 'hydor', build: true, dev: false, services: { ai: false, embed: false, mail: false }, database: null, keys: 0, ...over.shape },
  stage: 'build',
  decisions: [],
  settings: { tiers: [], dailyCapUsd: 1, apps: [], connections: [], notify: false },
  run: { state: 'stopped', pid: null, since: null, lastUse: null, restarts: 0, sandboxed: false, sandboxNote: null, lastExit: null, ...over.run },
  build: { state: 'built', exists: true, startedAt: null, endedAt: null, exitCode: null, log: [], box: { access: 'registry', registries: [] }, ...over.build },
  mode: { launched: false, runsAs: 'built', ...over.mode },
  createdAt: 0,
  updatedAt: 0,
});

// Being made until its hydor.json is there; a broken one, or a folder gone, is said over everything else.
assert.equal(statusOf(app({ shape: { ok: false, problem: 'This folder has no hydor.json yet, which says how Hydor builds and runs the app.' } })).label, 'Being made');
assert.equal(statusOf(app({ shape: { ok: false, problem: '“start” is missing.', problems: ['“start” is missing.'] } })).label, 'hydor.json can’t be used');
assert.equal(statusOf(app({ shape: { ok: false, problem: 'The folder is not there any more.' }, run: { state: 'running' } })).broken, 'folder');
assert.equal(readable(app({ shape: { ok: false } })), false);

// Statuses, in the order the words matter.
assert.deepEqual(statusOf(app()), { tone: 'idle', label: 'Stopped' });
assert.deepEqual(statusOf(app({ run: { state: 'running' } })), { tone: 'ok', label: 'Running' });
assert.deepEqual(statusOf(app({ run: { state: 'starting' } })), { tone: 'busy', label: 'Starting…' });
assert.deepEqual(statusOf(app({ build: { state: 'building' } })), { tone: 'busy', label: 'Building…' });
assert.deepEqual(statusOf(app({ build: { state: 'none', exists: false } })), { tone: 'idle', label: 'Not built yet' });
// An app being made runs its development command: no build is needed to run it.
assert.deepEqual(statusOf(app({ build: { state: 'none', exists: false }, mode: { runsAs: 'dev' } })), { tone: 'idle', label: 'Stopped' });
assert.deepEqual(statusOf(app({ build: { state: 'failed', problem: 'The build failed (it ended with code 1).' } })), { tone: 'err', label: 'Build failed', reason: 'The build failed (it ended with code 1).' });
assert.deepEqual(statusOf(app({ run: { state: 'crashed', lastExit: 'it ended with code 1' } })), { tone: 'err', label: 'Stopped unexpectedly', reason: 'it ended with code 1' });
assert.equal(statusOf(app({ build: { state: 'building' }, run: { state: 'running' } })).label, 'Building…');
assert.equal(statusOf(app({ build: { state: 'failed', exists: true } })).label, 'Build failed');

// How long ago (English here: no language is set outside a page).
const now = 1_800_000_000_000;
assert.equal(ago(null), '');
assert.equal(ago(0), '');
assert.equal(ago(now - 5_000, now), 'now');
assert.equal(ago(now - 3 * 60_000, now), '3 minutes ago');
assert.equal(ago(now - 60 * 60_000, now), '1 hour ago');
assert.equal(ago(now - 5 * 3_600_000, now), '5 hours ago');
assert.equal(ago(now - 26 * 3_600_000, now), 'yesterday');
assert.equal(ago(now - 3 * 86_400_000, now), '3 days ago');
assert.equal(ago(now + 10_000, now), 'now', 'a clock a little ahead is not the future');

console.log('ok - web apps words: statuses, how long ago');
