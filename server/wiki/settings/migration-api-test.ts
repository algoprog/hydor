// Exercise real settings routes and explicit, preview-bound decisions with disposable folders.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../../db.ts';
import type { Deps } from '../../features/types.ts';
import { wikiSettingsFeature } from './index.ts';
import { setWikiSettings, wikiSettings } from './settings.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-migration-api-')));
const db = openDb(path.join(temp, 'app.db'));
const app = Fastify();
wikiSettingsFeature.routes!({ app, db } as unknown as Deps);
try {
  const source = path.join(temp, 'source');
  const target = path.join(temp, 'target');
  fs.mkdirSync(source); fs.mkdirSync(target);
  fs.writeFileSync(path.join(source, 'a.md'), 'source');
  fs.writeFileSync(path.join(target, 'a.md'), 'target');
  fs.writeFileSync(path.join(target, 'only-target.md'), 'retained');
  setWikiSettings(db, { hubPath: source });
  const request = (method: 'POST' | 'PUT', url: string, payload: object) => app.inject({ method, url, payload });
  assert.equal((await request('PUT', '/api/wiki/settings', { hubPath: target })).statusCode, 409, 'direct settings changes cannot bypass review');
  assert.equal(wikiSettings(db).hubPath, source);
  const preview = (await request('POST', '/api/wiki/migration/preview', { hubPath: target })).json();
  assert.equal(preview.sourceFiles, 1); assert.equal(preview.targetFiles, 2); assert.equal(preview.conflicts, 1);
  assert.deepEqual(preview.conflictPaths, ['a.md']);
  assert.equal((await request('POST', '/api/wiki/migration/apply', { hubPath: target, planToken: preview.planToken, action: 'merge' })).statusCode, 400, 'a conflict needs a choice');
  const next = (await request('POST', '/api/wiki/migration/preview', { hubPath: target })).json();
  const moved = await request('POST', '/api/wiki/migration/apply', { hubPath: target, planToken: next.planToken, action: 'merge', conflict: 'target' });
  assert.equal(moved.statusCode, 200, moved.body);
  const result = moved.json();
  assert.equal(wikiSettings(db).hubPath, target);
  assert.equal(fs.readFileSync(path.join(target, 'a.md'), 'utf8'), 'target');
  assert.equal(fs.readFileSync(path.join(result.migration.sourceBackup, 'a.md'), 'utf8'), 'source');
  assert.equal(fs.readFileSync(path.join(result.migration.targetBackup, 'a.md'), 'utf8'), 'target');
  assert.equal(fs.existsSync(source), false);
  assert.equal((await request('POST', '/api/wiki/migration/apply', { hubPath: target, planToken: next.planToken, action: 'keep' })).statusCode, 409, 'tokens cannot be reused');
  // A failed settings transaction must restore both original directory trees.
  const rollbackTarget = path.join(temp, 'rollback-target');
  fs.mkdirSync(rollbackTarget);
  fs.writeFileSync(path.join(rollbackTarget, 'other.md'), 'destination');
  const rollbackPreview = (await request('POST', '/api/wiki/migration/preview', { hubPath: rollbackTarget })).json();
  db.exec("CREATE TRIGGER reject_wiki_move BEFORE UPDATE ON kv WHEN NEW.k = 'wiki.hubPath' BEGIN SELECT RAISE(ABORT, 'simulated settings failure'); END");
  assert.equal((await request('POST', '/api/wiki/migration/apply', { hubPath: rollbackTarget, planToken: rollbackPreview.planToken, action: 'replace' })).statusCode, 500);
  assert.equal(wikiSettings(db).hubPath, target);
  assert.equal(fs.readFileSync(path.join(target, 'a.md'), 'utf8'), 'target');
  assert.equal(fs.readFileSync(path.join(rollbackTarget, 'other.md'), 'utf8'), 'destination');
  db.exec('DROP TRIGGER reject_wiki_move');
  // A file appearing after an empty preview must trigger another user review.
  const initiallyMissing = path.join(temp, 'initially-missing');
  setWikiSettings(db, { hubPath: initiallyMissing });
  const emptyPreview = (await request('POST', '/api/wiki/migration/preview', { hubPath: rollbackTarget })).json();
  fs.mkdirSync(initiallyMissing);
  fs.writeFileSync(path.join(initiallyMissing, 'new.md'), 'new');
  assert.equal((await request('POST', '/api/wiki/migration/apply', { hubPath: rollbackTarget, planToken: emptyPreview.planToken, action: 'keep' })).statusCode, 409);
  assert.equal(wikiSettings(db).hubPath, initiallyMissing);
  console.log('Wiki migration review and backup routes passed');
} finally {
  await app.close(); db.close();
  // Remove only the disposable test data created above.
  fs.rmSync(temp, { recursive: true, force: true });
}
