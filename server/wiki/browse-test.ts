// Exercise project wiki browsing against isolated projects and the real HTTP routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { setWikiSettings } from './settings/settings.ts';
import { wikiRoot } from './roots.ts';
import { wikiBrowse } from './browse-feature.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-browse-')));
const db = openDb(path.join(temp, 'test.db'));
const app = Fastify();
app.setErrorHandler((error, _request, reply) => reply.code((error as { status?: number }).status ?? 500).send({ error: (error as Error).message }));
try {
  const projectA = path.join(temp, 'project-a');
  const projectB = path.join(temp, 'project-b');
  const projectC = path.join(temp, 'project-c');
  const wikiA = path.join(projectA, 'knowledge', 'custom');
  for (const folder of [path.join(wikiA, 'wiki', 'concepts'), path.join(wikiA, 'raw', 'articles'), projectB, projectC]) fs.mkdirSync(folder, { recursive: true });
  // An explicit project binding takes precedence over the configured default.
  fs.writeFileSync(path.join(projectA, 'AGENTS.md'), '- Wiki: `knowledge/custom/_index.md`\n');
  fs.writeFileSync(path.join(wikiA, 'wiki', 'concepts', 'sky.md'), '---\ntitle: Sky\nsources:\n  - raw/articles/source.md\n---\n# Sky\n[Source](../../raw/articles/source.md)\n');
  fs.writeFileSync(path.join(wikiA, 'raw', 'articles', 'source.md'), '---\ntitle: Source\n---\nBlue sky evidence.\n');
  fs.mkdirSync(path.join(wikiA, 'wiki', '.archive'));
  fs.mkdirSync(path.join(wikiA, 'wiki', '.history'));
  fs.writeFileSync(path.join(wikiA, 'wiki', '.archive', 'old.md'), 'archive payload');
  fs.writeFileSync(path.join(wikiA, 'wiki', '.history', 'old.md'), 'history payload');
  fs.writeFileSync(path.join(wikiA, 'wiki', 'retired.md'), '---\ndocument_status: retired\n---\nretired payload');
  const outside = path.join(temp, 'outside.md');
  fs.writeFileSync(outside, 'outside payload');
  fs.symlinkSync(outside, path.join(wikiA, 'wiki', 'link.md'));
  const a = createSpace(db, { name: 'Project A', folder: projectA });
  const b = createSpace(db, { name: 'Project B', folder: projectB });
  const c = createSpace(db, { name: 'Project C', folder: projectC });
  const deps = { app, db } as unknown as Deps;
  setWikiSettings(db, { hubPath: path.join(temp, 'hub') });
  const wikiB = wikiRoot(db, b.id, { create: true })!;
  fs.mkdirSync(path.join(wikiB, 'wiki', 'concepts'), { recursive: true });
  fs.writeFileSync(path.join(wikiB, 'wiki', 'concepts', 'sky.md'), '---\ntitle: Bob\'s sky guide\n---\n# Other project private content\n');
  assert.ok(wikiB.startsWith(fs.realpathSync(path.join(temp, 'hub', 'projects')) + path.sep));
  wikiBrowse.routes!(deps);
  await app.ready();
  const list = async (id: string) => app.inject({ method: 'GET', url: `/api/projects/${id}/wiki` });
  const file = async (id: string, rel: string) => app.inject({ method: 'GET', url: `/api/projects/${id}/wiki/file?path=${encodeURIComponent(rel)}` });

  const before = fs.readdirSync(temp).sort().join();
  setWikiSettings(db, { enabled: false });
  assert.deepEqual(await (await list(a.id)).json(), { status: 'off', on: false, inherited: true });
  updateSpace(db, a.id, { wikiMemory: true });
  assert.equal((await list(a.id)).json().status, 'ready', 'a project can turn it on itself');
  assert.equal((await list(a.id)).json().inherited, false);
  updateSpace(db, a.id, { wikiMemory: null });
  setWikiSettings(db, { enabled: true, projectPath: '.wiki' });
  // Looking never makes a folder: a project with nothing yet is empty.
  const empty = (await list(c.id)).json();
  assert.deepEqual(empty, { status: 'empty', on: true, inherited: true });
  assert.equal(fs.readdirSync(path.join(temp, 'hub', 'projects')).length, 1, 'only project B has a folder in the hub');
  updateSpace(db, c.id, { wikiMemory: false });
  assert.equal((await list(c.id)).json().status, 'off');
  assert.equal((await file(c.id, 'wiki/concepts/sky.md')).statusCode, 404);
  updateSpace(db, c.id, { wikiMemory: null });
  void before;
  assert.equal((await list('spmissing')).statusCode, 404);
  const bodyA = (await list(a.id)).json();
  const bodyB = (await list(b.id)).json();
  assert.equal(bodyA.status, 'ready');
  assert.equal(bodyA.root, fs.realpathSync(wikiA));
  assert.deepEqual(bodyA.articles.map((entry: { path: string }) => entry.path), ['wiki/concepts/sky.md']);
  assert.deepEqual(bodyA.sources.map((entry: { path: string }) => entry.path), ['raw/articles/source.md']);
  assert.deepEqual(bodyB.articles, [{ path: 'wiki/concepts/sky.md', title: "Bob's sky guide" }], 'a title keeps its apostrophe');
  assert.equal(bodyB.root, wikiB);
  assert.equal(bodyA.on, true);
  const article = await file(a.id, 'wiki/concepts/sky.md');
  assert.equal(article.statusCode, 200);
  assert.match(article.json().content, /\[Source\]\(\.\.\/\.\.\/raw\/articles\/source\.md\)/);
  assert.match((await file(a.id, 'raw/articles/source.md')).json().content, /Blue sky evidence/);
  assert.match((await file(b.id, 'wiki/concepts/sky.md')).json().content, /Other project private content/);
  assert.equal((await file(b.id, 'raw/articles/source.md')).statusCode, 404);
  for (const bad of ['../outside.md', 'wiki/../../../outside.md', 'wiki/.archive/old.md', 'wiki/.history/old.md', 'wiki/retired.md', 'wiki/link.md', 'wiki/../raw/articles/source.md', '/etc/passwd']) {
    assert.equal((await file(a.id, bad)).statusCode, 404, `must reject ${bad}`);
  }
  setWikiSettings(db, { enabled: false });
  assert.equal((await file(a.id, 'wiki/concepts/sky.md')).statusCode, 404);
  assert.equal((await list(a.id)).json().status, 'off');
  console.log('Wiki project browsing and boundary tests passed');
} finally {
  await app.close();
  db.close();
  // Delete only the disposable project fixtures.
  fs.rmSync(temp, { recursive: true, force: true });
}
