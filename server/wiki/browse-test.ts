// Exercise project wiki browsing against isolated projects and the real HTTP routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { createSpace } from '../spaces/index.ts';
import { setWikiSettings } from './settings/settings.ts';
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
  const wikiB = path.join(projectB, '.wiki');
  for (const folder of [path.join(wikiA, 'wiki', 'concepts'), path.join(wikiA, 'raw', 'articles'), path.join(wikiB, 'wiki', 'concepts'), projectC]) fs.mkdirSync(folder, { recursive: true });
  // An explicit project binding takes precedence over the configured default.
  fs.writeFileSync(path.join(projectA, 'AGENTS.md'), '- Wiki: `knowledge/custom/_index.md`\n');
  fs.writeFileSync(path.join(wikiA, 'wiki', 'concepts', 'sky.md'), '---\ntitle: Sky\nsources:\n  - raw/articles/source.md\n---\n# Sky\n[Source](../../raw/articles/source.md)\n');
  fs.writeFileSync(path.join(wikiA, 'raw', 'articles', 'source.md'), '---\ntitle: Source\n---\nBlue sky evidence.\n');
  fs.writeFileSync(path.join(wikiB, 'wiki', 'concepts', 'sky.md'), '# Other project private content\n');
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
  wikiBrowse.routes!(deps);
  await app.ready();
  const list = async (id: string) => app.inject({ method: 'GET', url: `/api/projects/${id}/wiki` });
  const file = async (id: string, rel: string) => app.inject({ method: 'GET', url: `/api/projects/${id}/wiki/file?path=${encodeURIComponent(rel)}` });

  assert.equal((await list(a.id)).json().status, 'disabled');
  setWikiSettings(db, { enabled: true, projectPath: '.wiki' });
  assert.equal((await list(c.id)).json().status, 'missing');
  assert.equal((await list('spmissing')).statusCode, 404);
  const bodyA = (await list(a.id)).json();
  const bodyB = (await list(b.id)).json();
  assert.equal(bodyA.status, 'ready');
  assert.equal(bodyA.root, fs.realpathSync(wikiA));
  assert.deepEqual(bodyA.articles.map((entry: { path: string }) => entry.path), ['wiki/concepts/sky.md']);
  assert.deepEqual(bodyA.sources.map((entry: { path: string }) => entry.path), ['raw/articles/source.md']);
  assert.deepEqual(bodyB.articles.map((entry: { path: string }) => entry.path), ['wiki/concepts/sky.md']);
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
  console.log('Wiki project browsing and boundary tests passed');
} finally {
  await app.close();
  db.close();
  // Delete only the disposable project fixtures.
  fs.rmSync(temp, { recursive: true, force: true });
}
