// Exercise native hooks, project/chat privacy and retained checkpoint status in an isolated hub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace, updateSpace } from '../../spaces/index.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { wikiHookToken } from './hook-auth.ts';
import { wikiSession } from './index.ts';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-hook-route-')));
const project = path.join(root, 'project');
const hub = path.join(root, 'new-hub');
fs.mkdirSync(project);
const db = openDb(path.join(root, 'test.db'));
const app = Fastify();
const run = '0123456789ab';
const key = 'codex:123e4567-e89b-12d3-a456-426614174001';
let prepare = async () => 'Synthetic safe context';
const deps = { app, db, sessions: {
  summary: () => ({ cwd: project }),
  liveByRun: (id: string) => id === run ? { key, cwd: project, agent: 'codex' } : null,
  wikiCheckpointSummary: () => prepare(),
  codexHookCoverage: async () => null,
} } as unknown as Deps;
const event = { session_id: key.slice(6), hook_event_name: 'PreCompact', trigger: 'auto' };
const call = (body: Record<string, unknown>, token = wikiHookToken(run)) => app.inject({ method: 'POST', url: '/agent/codex/wiki-event', headers: { authorization: `Bearer ${token}` }, payload: body });
const status = async () => (await app.inject({ method: 'GET', url: `/api/sessions/${encodeURIComponent(key)}/wiki-checkpoint` })).json();
try {
  wikiSession.routes!(deps);
  setWikiSettings(db, { enabled: true, hubPath: hub });
  const space = createSpace(db, { name: 'Project', folder: project });
  setSessionExtra(db, key, { space: space.id });
  const spawn = { agent: 'codex' as const, key, cwd: project, runId: run, resume: true, extra: { space: space.id } };
  assert.equal((await wikiSession.spawn!(spawn, deps))?.env?.HYDOR_WIKI_AUTO_HOOKS, '1', 'a missing hub must not suppress hook registration');
  assert.equal((await call(event, 'invalid')).statusCode, 403);
  assert.equal((await call({ ...event, session_id: 'wrong' })).statusCode, 403);
  assert.equal((await call({ ...event, trigger: 'manual' })).statusCode, 400);
  assert.deepEqual((await status()).status, 'unavailable');
  await call(event);
  assert.equal((await status()).status, 'saved');
  assert.equal((await status()).event, 'PreCompact');
  assert.ok(fs.existsSync(path.join(hub, '.sessions', 'digests')), 'the first hook creates a missing configured hub');
  await call({ ...event, hook_event_name: 'PostCompact' });
  assert.equal((await status()).event, 'PreCompact', 'retaining a pre-compaction summary does not report a post-compaction write');
  setSessionExtra(db, key, { wikiEnabled: false });
  assert.equal((await status()).status, 'disabled');
  prepare = async () => { throw new Error('disabled chat was read'); };
  await call(event);
  setSessionExtra(db, key, { wikiEnabled: true, memory: false });
  assert.equal((await status()).status, 'disabled');
  setSessionExtra(db, key, { memory: true, confidential: true });
  assert.equal((await status()).status, 'disabled');
  setSessionExtra(db, key, { confidential: null });
  updateSpace(db, space.id, { wikiMemory: false });
  assert.equal(await wikiSession.spawn!(spawn, deps), undefined);
  assert.equal((await status()).status, 'disabled', 'the project switch remains authoritative');
  await call(event);
  console.log('Native wiki hook route, retained status and project/chat privacy passed');
} finally {
  await app.close();
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}
