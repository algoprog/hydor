// Verify automatic lesson suggestions remain reviewable and require an explicit, hash-bound save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { Deps, TurnInfo } from '../../features/types.ts';
import { openDb } from '../../db.ts';
import { notesOf } from '../../notes.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { autoLessons, suggestLessons, type AutoLessonsNote } from './auto.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-auto-lessons-')));
const project = path.join(temp, 'project');
const root = path.join(project, '.wiki');
fs.mkdirSync(root, { recursive: true });
const db = openDb(path.join(temp, 'test.db'));
const app = Fastify();
const key = 'codex:auto-test';
const items = [
  { kind: 'user', id: 'user-1', seq: 1, text: 'Correction: use three retries.', ts: Date.now() },
  { kind: 'assistant', id: 'assistant-1', seq: 2, text: 'I changed the retry count.', ts: Date.now() },
];
const deps = { app, db, sessions: { summary: () => ({ cwd: project, agent: 'codex' }), timeline: async () => ({ readMore: async () => {}, parser: { items } }) } } as unknown as Deps;
const turn = { key, agent: 'codex', cwd: project, status: 'idle', external: false, startedAt: Date.now(), endedAt: Date.now() } as TurnInfo;
const candidate = { title: 'Retry count', lesson: 'Use three retries.', evidence: 'User correction', uncertainty: 'Not tested', sourceIds: ['user-1'] };
let called = 0;
const ask = async () => { called++; return { lessons: [candidate] }; };
try {
  autoLessons.routes!(deps);
  setWikiSettings(db, { enabled: true, hubPath: root, defaultAutoLessons: true, gitIgnore: false });
  setSessionExtra(db, key, { wikiAutoLessons: false });
  await suggestLessons(turn, deps, ask as never);
  assert.equal(called, 0, 'a disabled chat must not be sent to a helper');
  setSessionExtra(db, key, { wikiAutoLessons: true });
  await suggestLessons(turn, deps, ask as never);
  const [note] = notesOf(db, key, 'wiki-lessons');
  const data = note.data as AutoLessonsNote;
  assert.equal(called, 1);
  assert.equal(data.status, 'proposed');
  assert.match(data.preview.content, /Use three retries/);
  assert.equal(fs.existsSync(path.join(root, data.preview.path)), false, 'generation does not save to the wiki');
  await suggestLessons(turn, deps, ask as never);
  assert.equal(called, 1, 'duplicate turn notifications are throttled');
  const url = `/api/wiki-lessons/${note.id}/save`;
  assert.equal((await app.inject({ method: 'POST', url, payload: { sha256: '0'.repeat(64) } })).statusCode, 409);
  assert.equal(fs.existsSync(path.join(root, data.preview.path)), false);
  setSessionExtra(db, key, { memory: false });
  assert.equal((await app.inject({ method: 'POST', url, payload: { sha256: data.preview.sha256 } })).statusCode, 409);
  setSessionExtra(db, key, { memory: true });
  const saved = await app.inject({ method: 'POST', url, payload: { sha256: data.preview.sha256 } });
  assert.equal(saved.statusCode, 200, saved.body);
  assert.equal(fs.readFileSync(path.join(root, data.preview.path), 'utf8'), data.preview.content);
  assert.equal((notesOf(db, key, 'wiki-lessons')[0].data as AutoLessonsNote).status, 'saved');
  assert.equal((await app.inject({ method: 'POST', url, payload: { sha256: data.preview.sha256 } })).statusCode, 409);
  const changedKey = 'codex:auto-privacy';
  setSessionExtra(db, changedKey, { wikiAutoLessons: true });
  await suggestLessons({ ...turn, key: changedKey }, deps, (async () => {
    setSessionExtra(db, changedKey, { wikiEnabled: false });
    return { lessons: [candidate] };
  }) as never);
  assert.equal(notesOf(db, changedKey, 'wiki-lessons').length, 0, 'disabling wiki while the helper runs prevents a suggestion');
  const invalidKey = 'codex:auto-invalid';
  setSessionExtra(db, invalidKey, { wikiAutoLessons: true });
  await suggestLessons({ ...turn, key: invalidKey }, deps, (async () => ({ lessons: [{ ...candidate, sourceIds: ['unknown'] }] })) as never);
  assert.equal(notesOf(db, invalidKey, 'wiki-lessons').length, 0, 'source IDs must refer to real messages');
  console.log('Automatic lesson preview, privacy and explicit approval tests passed');
} finally {
  await app.close();
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
