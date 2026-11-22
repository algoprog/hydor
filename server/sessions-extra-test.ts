// Checks for a session's own settings through their route (server/sessions-extra.ts): PATCH /api/sessions/:key/extra
// changes them, refused (409, with its sentence, nothing changed) when it would turn on a campaign, a deep research or an
// arena match while the session's goal is not over or stopped at its limit; a swarm on or off goes; so does any change
// once the goal is over, or without one.
// Build and run with a scratch data folder:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sessions-extra-test.ts && DATA_DIR=/tmp/hydor-test-extra node dist/dev/sessions-extra-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { HttpError } from './auth.ts';
import { openDb } from './db.ts';
import { saveGoal } from './goals/store.ts';
import { sessionExtra } from './sessionExtra.ts';
import { sessionExtraRoutes } from './sessions-extra.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const tmp = fs.mkdtempSync(path.join(process.env.DATA_DIR, 'extra-'));
const db = openDb(path.join(tmp, 'test.db'));
const app = Fastify();
app.setErrorHandler((err: Error, _req, reply) => {
  reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
});
const told: string[] = [];
sessionExtraRoutes(app, db, { queueSummary: (k) => told.push(k) });

const KEY = 'claude:extra-goal';
db.prepare('insert into app_sessions (key, agent, cwd, created_at, updated_at) values (?, ?, ?, ?, ?)').run(KEY, 'claude', tmp, Date.now(), Date.now());
const patch = (key: string, body: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/sessions/${encodeURIComponent(key)}/extra`, payload: body });
const goalWith = (status: 'working' | 'limit' | 'reached') =>
  saveGoal(db, { key: KEY, id: 'g1', status, contract: { objective: 'Fast checkout', checks: [], protect: [], limits: { rounds: 3 } }, settings: { asks: 'own', noAnswerMin: 0 }, rounds: [], undo: false, rules: [], next: [], dropped: [], startedAt: 1, spentUsd: 0, activeMs: 0, _: { spentAtStart: 0 } });

// Without a goal: anything goes.
let r = await patch(KEY, { research: { depth: 'quick' } });
assert.equal(r.statusCode, 200);
r = await patch(KEY, { research: null });
assert.equal(r.statusCode, 200);
assert.equal(sessionExtra(db, KEY).research, undefined);

// With a goal at work, and with one stopped at its limit: a campaign, a research or an arena is refused, nothing changed.
for (const status of ['working', 'limit'] as const) {
  goalWith(status);
  for (const body of [{ swarm: 'campaign' }, { research: { depth: 'quick' } }, { arena: 'match1' }]) {
    r = await patch(KEY, body);
    assert.equal(r.statusCode, 409, `${status} ${JSON.stringify(body)}`);
    assert.equal(r.json().error, 'This session has a goal: stop the goal first, or lead a swarm with it.');
  }
  const x = sessionExtra(db, KEY);
  assert.deepEqual([x.swarm, x.research, x.arena], [undefined, undefined, undefined], 'nothing changed');
  // A swarm on, and off: it goes.
  r = await patch(KEY, { swarm: true });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().extra.swarm, true);
  r = await patch(KEY, { swarm: null });
  assert.equal(r.statusCode, 200);
}
// Once the goal is over (reached): as without one.
goalWith('reached');
r = await patch(KEY, { swarm: 'campaign' });
assert.equal(r.statusCode, 200);
assert.equal(sessionExtra(db, KEY).swarm, 'campaign');
assert.ok(told.includes(KEY), 'the session’s summary is told');
// GET reads them back.
assert.equal((await app.inject({ method: 'GET', url: `/api/sessions/${encodeURIComponent(KEY)}/extra` })).json().extra.swarm, 'campaign');
console.log('sessions extra: 5 checks passed');
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
