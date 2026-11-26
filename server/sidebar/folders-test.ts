// Script tests for the sessions' folders in the sidebar: made at the top level and inside a project; their names (empty,
// the same name in the same place refused and in another allowed, too long cut); a project that is not there; renaming; a
// session put in and taken out; a folder of another project (or of none) refused; deleting a folder or its project takes
// the sessions out and keeps them; a session that is not there is never made again by it; the routes and the news.
// Build and run:
//   OUTDIR=dist/dev node scripts/build-server.mjs server/sidebar/folders-test.ts
//   DATA_DIR=/tmp/hydor-test-folders node dist/dev/folders-test.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { MAX_SESSION_FOLDER_NAME, MAX_SESSION_FOLDERS, sessionFolderList } from '../../shared/sidebar.ts';
import type { ServerEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import { createSpace } from '../spaces/index.ts';
import { createSessionFolder, deleteSessionFolder, dropSpaceFolders, moveSessionToFolder, renameSessionFolder, sessionFolders, sessionFoldersFeature } from './folders.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-folders-test-'));
const db = openDb(path.join(tmp, 'test.db'));
let passed = 0;
const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const fails = (fn: () => unknown, status: number, message?: string | RegExp) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof HttpError, `an HttpError, not ${(e as Error).stack}`);
    assert.equal((e as HttpError).status, status);
    if (typeof message === 'string') assert.equal((e as Error).message, message);
    else if (message) assert.match((e as Error).message, message);
    return;
  }
  assert.fail('should have been refused');
};
const row = (key: string, extra: Record<string, unknown> = {}) =>
  db.prepare('insert or replace into app_sessions (key, agent, cwd, extra, created_at, updated_at) values (?, ?, ?, ?, ?, ?)').run(key, 'claude', tmp, JSON.stringify(extra), Date.now(), Date.now());
const told: string[] = [];
const put = (key: string) => (f: string | null) => {
  setSessionExtra(db, key, { folder: f });
  told.push(key);
};

const proj = createSpace(db, { name: 'Shop', folder: tmp } as never);
const other = createSpace(db, { name: 'Blog', folder: tmp } as never);

test('a folder at the top level and one inside a project', () => {
  const a = createSessionFolder(db, { name: '  Ideas  ' });
  assert.match(a.id, /^sf[0-9a-f]{10}$/);
  assert.equal(a.name, 'Ideas');
  assert.equal(a.space, undefined);
  const b = createSessionFolder(db, { name: 'Ideas', space: proj.id });
  assert.equal(b.space, proj.id, 'the same name in another place is fine');
  assert.deepEqual(sessionFolders(db).map((f) => f.id), [a.id, b.id]);
});

test('names: empty refused, the same name in the same place refused (any case), too long cut, an unknown project refused', () => {
  fails(() => createSessionFolder(db, { name: '   ' }), 400, 'Give the folder a name');
  fails(() => createSessionFolder(db, {}), 400, 'Give the folder a name');
  fails(() => createSessionFolder(db, { name: 'IDEAS' }), 400, 'There is already a folder called “IDEAS” there');
  fails(() => createSessionFolder(db, { name: 'ideas', space: proj.id }), 400, /already a folder/);
  createSessionFolder(db, { name: 'Ideas', space: other.id });
  fails(() => createSessionFolder(db, { name: 'X', space: 'spnope' }), 404, 'No such project');
  const long = createSessionFolder(db, { name: 'x'.repeat(100) });
  assert.equal(long.name.length, MAX_SESSION_FOLDER_NAME);
  deleteSessionFolder(db, long.id);
});

test('rename: the same rules, in its own place', () => {
  const [a, b] = sessionFolders(db);
  const c = createSessionFolder(db, { name: 'Later' });
  assert.equal(renameSessionFolder(db, c.id, ' Soon ').name, 'Soon');
  assert.equal(renameSessionFolder(db, c.id, 'soon').name, 'soon', 'its own name in another case is its own');
  fails(() => renameSessionFolder(db, c.id, 'ideas'), 400, /already a folder called “ideas” there/);
  fails(() => renameSessionFolder(db, c.id, ''), 400, 'Give the folder a name');
  fails(() => renameSessionFolder(db, 'sfnothing1', 'A'), 404, 'No such folder');
  assert.equal(renameSessionFolder(db, b.id, 'Plans').name, 'Plans');
  assert.equal(sessionFolders(db).find((f) => f.id === b.id)?.space, proj.id);
  renameSessionFolder(db, b.id, 'Ideas');
  deleteSessionFolder(db, c.id);
  assert.equal(sessionFolders(db)[0].id, a.id);
});

test('a session goes in a folder of its own project and out again', () => {
  const [top, inProj] = sessionFolders(db);
  row('claude:free-1');
  row('claude:proj-1', { space: proj.id });
  moveSessionToFolder(db, 'claude:free-1', top.id, put('claude:free-1'));
  assert.equal(sessionExtra(db, 'claude:free-1').folder, top.id);
  moveSessionToFolder(db, 'claude:proj-1', inProj.id, put('claude:proj-1'));
  assert.deepEqual(sessionExtra(db, 'claude:proj-1'), { space: proj.id, folder: inProj.id }, 'its other settings stay');
  moveSessionToFolder(db, 'claude:free-1', null, put('claude:free-1'));
  assert.equal(sessionExtra(db, 'claude:free-1').folder, undefined);
  fails(() => moveSessionToFolder(db, 'claude:free-1', 'sfnothing1', put('claude:free-1')), 404, 'No such folder');
  fails(() => moveSessionToFolder(db, 'claude:free-1', 7, put('claude:free-1')), 400);
});

test('a folder of another project, or a top-level folder for a project session, is refused', () => {
  const [top, inProj] = sessionFolders(db);
  fails(() => moveSessionToFolder(db, 'claude:free-1', inProj.id, put('x')), 400, 'That folder is in the project “Shop”: only its sessions go in it');
  fails(() => moveSessionToFolder(db, 'claude:proj-1', top.id, put('x')), 400, 'That folder is outside the session’s project: make one inside “Shop”');
  row('claude:blog-1', { space: other.id });
  fails(() => moveSessionToFolder(db, 'claude:blog-1', inProj.id, put('x')), 400, /“Shop”/);
  assert.equal(sessionExtra(db, 'claude:blog-1').folder, undefined);
});

test('deleting a folder keeps its sessions, out of any folder, and names them', () => {
  const f = createSessionFolder(db, { name: 'Temp' });
  row('claude:t-1', { folder: f.id, memory: true });
  row('claude:t-2', { folder: f.id });
  row('claude:t-3', { folder: sessionFolders(db)[0].id });
  const keys = deleteSessionFolder(db, f.id).sort();
  assert.deepEqual(keys, ['claude:t-1', 'claude:t-2']);
  assert.deepEqual(sessionExtra(db, 'claude:t-1'), { memory: true });
  assert.equal(sessionExtra(db, 'claude:t-3').folder, sessionFolders(db)[0].id, 'another folder’s sessions stay in it');
  assert.ok(db.prepare('select 1 from app_sessions where key = ?').get('claude:t-1'));
  assert.equal(sessionFolders(db).some((x) => x.id === f.id), false);
  fails(() => deleteSessionFolder(db, f.id), 404, 'No such folder');
});

test('a bulk clear never brings back a session that is gone', () => {
  const f = createSessionFolder(db, { name: 'Ghosts' });
  row('claude:gone-1', { folder: f.id });
  db.prepare('delete from app_sessions where key = ?').run('claude:gone-1');
  assert.deepEqual(deleteSessionFolder(db, f.id), []);
  assert.equal(db.prepare('select 1 from app_sessions where key = ?').get('claude:gone-1'), undefined);
});

test('dropSpaceFolders removes a project’s folders and takes its sessions out of them', () => {
  const f1 = createSessionFolder(db, { name: 'A', space: other.id });
  const f2 = createSessionFolder(db, { name: 'B', space: other.id });
  row('claude:d-1', { space: other.id, folder: f1.id });
  row('claude:d-2', { space: other.id, folder: f2.id });
  row('claude:d-3', { space: proj.id, folder: sessionFolders(db).find((f) => f.space === proj.id)!.id });
  assert.deepEqual(dropSpaceFolders(db, other.id).sort(), ['claude:d-1', 'claude:d-2']);
  assert.deepEqual(sessionExtra(db, 'claude:d-1'), { space: other.id });
  assert.equal(sessionFolders(db).some((f) => f.space === other.id), false);
  assert.ok(sessionExtra(db, 'claude:d-3').folder, 'another project’s folders stay');
  assert.deepEqual(dropSpaceFolders(db, other.id), []);
});

test('the cap, and the list as kept', () => {
  const before = sessionFolders(db).length;
  const many = Array.from({ length: MAX_SESSION_FOLDERS - before }, (_, i) => createSessionFolder(db, { name: `n${i}` }));
  fails(() => createSessionFolder(db, { name: 'one more' }), 400, /At most 200 folders/);
  for (const f of many) deleteSessionFolder(db, f.id);
  assert.deepEqual(sessionFolderList([{ id: 'sfabcde', name: ' A ', createdAt: 5 }, { id: 'sfabcde', name: 'again' }, { id: 'bad', name: 'x' }, { id: 'sfabcdf', name: '  ' }, { id: 'sfabcdg', name: 'B', space: 'sp1' }, null, 4]), [
    { id: 'sfabcde', name: 'A', createdAt: 5 },
    { id: 'sfabcdg', name: 'B', space: 'sp1', createdAt: 0 },
  ]);
  assert.deepEqual(sessionFolderList('x'), []);
});

test('the routes: the folders, the news to open pages, and the sessions told', async () => {
  const app = Fastify();
  app.setErrorHandler((err: Error, _req, reply) => {
    reply.code(err instanceof HttpError ? err.status : 500).send({ error: err.message });
  });
  const events: ServerEvent[] = [];
  const queued: string[] = [];
  const there = new Set(['claude:route-1']);
  const d = {
    app,
    db,
    broadcast: (e: ServerEvent) => events.push(e),
    sessions: { queueSummary: (k: string) => queued.push(k), summary: (k: string) => (there.has(k) ? {} : null), setFolder: (k: string, f: string | null) => put(k)(f) },
  } as unknown as Deps;
  sessionFoldersFeature.routes!(d);
  row('claude:route-1');
  let r = await app.inject({ method: 'POST', url: '/api/session-folders', payload: { name: 'Routes' } });
  assert.equal(r.statusCode, 200);
  const made = r.json().folder;
  assert.ok(r.json().folders.some((f: { id: string }) => f.id === made.id));
  assert.deepEqual(events.at(-1), { t: 'feature', id: 'session-folders', data: { folders: sessionFolders(db) } });
  r = await app.inject({ method: 'POST', url: '/api/session-folders', payload: { name: 'routes' } });
  assert.equal(r.statusCode, 400);
  r = await app.inject({ method: 'PATCH', url: `/api/session-folders/${made.id}`, payload: { name: 'Roads' } });
  assert.equal(r.json().folder.name, 'Roads');
  r = await app.inject({ method: 'GET', url: '/api/session-folders' });
  assert.ok(r.json().folders.some((f: { name: string }) => f.name === 'Roads'));
  r = await app.inject({ method: 'POST', url: '/api/sessions/claude%3Aroute-1/folder', payload: { folder: made.id } });
  assert.deepEqual(r.json(), { ok: true });
  assert.equal(sessionExtra(db, 'claude:route-1').folder, made.id);
  r = await app.inject({ method: 'POST', url: '/api/sessions/claude%3Aroute-nope/folder', payload: { folder: made.id } });
  assert.equal(r.statusCode, 404);
  assert.equal(r.json().error, 'Session not found');
  r = await app.inject({ method: 'POST', url: '/api/sessions/claude%3Aroute-1/folder', payload: { folder: 'sfnothing1' } });
  assert.equal(r.statusCode, 404);
  r = await app.inject({ method: 'DELETE', url: `/api/session-folders/${made.id}` });
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().folders.some((f: { id: string }) => f.id === made.id), false);
  assert.deepEqual(queued, ['claude:route-1'], 'the session that moved out is told to the pages');
  assert.equal(sessionExtra(db, 'claude:route-1').folder, undefined);
  r = await app.inject({ method: 'DELETE', url: `/api/session-folders/${made.id}` });
  assert.equal(r.statusCode, 404);
});

for (const [name, fn] of tests) {
  try {
    await fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (e) {
    console.log(`FAIL ${name}\n${(e as Error).stack}`);
    process.exitCode = 1;
  }
}
console.log(`\n${passed}/${tests.length} passed`);
fs.rmSync(tmp, { recursive: true, force: true });
