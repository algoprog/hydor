// Exercise the real lifecycle route with a run token and an isolated database and wiki hub.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import type { Deps } from '../../features/types.ts';
import { runToken } from '../../mcp.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { wikiSession } from './index.ts';

const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-route-'));
const db = new Database(':memory:');
const app = Fastify();
const key = 'acp:wiki-route-test';
const token = runToken('wiki-route-test');
db.exec('create table kv (k text primary key, v text not null); create table app_sessions (key text primary key, agent text, extra text, created_at integer, updated_at integer);');
const deps = { app, db, sessions: { liveByRun: (id: string) => id === 'wiki-route-test' ? { key, cwd: hub } : null } } as unknown as Deps;
wikiSession.routes!(deps);
const call = async (event: string, summary = '') => {
  const response = await app.inject({ method: 'POST', url: `/agent/run/${token}/wiki-event`, payload: { event, summary } });
  return { code: response.statusCode, body: response.json() as { status: string; trigger?: string } };
};

try {
  assert.equal((await call('PreCompact')).body.status, 'disabled');
  assert.deepEqual(fs.readdirSync(hub), []);
  setWikiSettings(db, { enabled: true, hubPath: hub });
  const invalid = await app.inject({ method: 'POST', url: '/agent/run/not-a-valid-token/wiki-event', payload: { event: 'PreCompact' } });
  assert.equal(invalid.statusCode, 403);
  assert.equal((await call('invalid')).code, 400);
  const pre = await call('PreCompact', 'Goal: preserve context. Password: hunter22.');
  assert.deepEqual(pre.body, { status: 'saved', trigger: 'pre-compact' });
  const context = await wikiSession.context!({ key, cwd: hub, extra: {} }, deps);
  assert.match(context!, /Goal: preserve context/);
  assert.doesNotMatch(context!, /hunter22/);
  assert.match(context!, /historical evidence/);
  const post = await call('PostCompact', 'Goal: continue after compaction.');
  assert.deepEqual(post.body, { status: 'saved', trigger: 'post-compact' });
  // Rehydration should not confuse later metadata-only events with a useful summary.
  await call('Stop');
  assert.match((await wikiSession.context!({ key, cwd: hub, extra: {} }, deps))!, /Goal: continue after compaction/);
  db.prepare('insert into kv (k,v) values (?,?)').run('memory.enabled', '0');
  assert.equal((await call('PreCompact')).body.status, 'disabled');
  assert.equal(await wikiSession.context!({ key, cwd: hub, extra: {} }, deps), null);
  db.prepare('delete from kv where k = ?').run('memory.enabled');
  setSessionExtra(db, key, { memory: false });
  assert.equal((await call('PreCompact')).body.status, 'disabled');
  assert.equal(await wikiSession.context!({ key, cwd: hub, extra: {} }, deps), null);
  setSessionExtra(db, key, { memory: true, confidential: true });
  assert.equal((await call('PreCompact')).body.status, 'disabled');
  assert.equal(await wikiSession.context!({ key, cwd: hub, extra: {} }, deps), null);
  setSessionExtra(db, key, { confidential: null });
  setWikiSettings(db, { hubPath: path.join(hub, 'missing') });
  assert.equal((await call('PreCompact')).body.status, 'failed');
  process.stdout.write('Wiki session route tests passed\n');
} finally {
  await app.close();
  db.close();
  fs.rmSync(hub, { recursive: true, force: true });
}
