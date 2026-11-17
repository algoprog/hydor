// A disabled or confidential wiki capture must not read the timeline or invoke a helper model.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SessionManager } from '../../sessions.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { setWikiSettings } from '../settings/settings.ts';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-summary-')));
const db = new Database(':memory:');
db.exec('create table kv (k text primary key, v text not null); create table app_sessions (key text primary key, agent text, extra text, created_at integer, updated_at integer);');
const manager = Object.create(SessionManager.prototype) as SessionManager;
Object.assign(manager, { db, lives: new Map(), summary: () => null, timeline: () => { throw new Error('Timeline must not be read'); } });
try {
  const key = 'claude:summary-test';
  setWikiSettings(db, { enabled: true, hubPath: root });
  fs.mkdirSync(path.join(root, '.sessions'));
  fs.writeFileSync(path.join(root, '.sessions', 'config.json'), '{"enabled":false}');
  assert.equal(await manager.wikiCheckpointSummary(key), '');
  fs.unlinkSync(path.join(root, '.sessions', 'config.json'));
  setSessionExtra(db, key, { memory: false });
  assert.equal(await manager.wikiCheckpointSummary(key), '');
  setSessionExtra(db, key, { memory: true, confidential: true });
  assert.equal(await manager.wikiCheckpointSummary(key), '');
  setSessionExtra(db, key, { confidential: null });
  setWikiSettings(db, { enabled: false });
  assert.equal(await manager.wikiCheckpointSummary(key), '');
  console.log('Wiki summary respects capture, memory and confidential opt-outs');
} finally {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}
