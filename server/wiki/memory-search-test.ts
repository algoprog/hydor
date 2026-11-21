// Exercise the project Memory tab's search (GET /api/projects/:id/memory/search) against isolated projects.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import type { ProjectMemorySearch } from '../../shared/project-memory.ts';
import { kvSet, openDb } from '../db.ts';
import type { Deps } from '../features/types.ts';
import { progress, scanSoon } from '../knowledge/indexer.ts';
import { addSource, createBase } from '../knowledge/store.ts';
import { addEntry } from '../memory/store.ts';
import { createSpace, updateSpace } from '../spaces/index.ts';
import { wikiBrowse } from './browse-feature.ts';
import { ensureWikiKnowledge } from './knowledge/index.ts';
import { setWikiSettings } from './settings/settings.ts';

if (!process.env.DATA_DIR?.startsWith('/tmp/')) {
  console.error('Run with DATA_DIR=/tmp/… so nothing touches real data.');
  process.exit(2);
}

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-memory-search-')));
const db = openDb(path.join(temp, 'test.db'));
const app = Fastify();
app.setErrorHandler((error, _request, reply) => reply.code((error as { status?: number }).status ?? 500).send({ error: (error as Error).message }));
const settle = async () => {
  for (let i = 0; i < 300 && progress.size; i++) await new Promise((r) => setTimeout(r, 20));
  await new Promise((r) => setTimeout(r, 80));
};
try {
  kvSet(db, 'memory.meaning', '0');
  const projectA = path.join(temp, 'project-a');
  const projectB = path.join(temp, 'project-b');
  const wikiA = path.join(projectA, 'knowledge', 'custom');
  for (const folder of [path.join(wikiA, 'wiki', 'concepts'), path.join(wikiA, 'wiki', 'areas'), path.join(wikiA, 'raw', 'articles'), projectB]) fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(projectA, 'AGENTS.md'), '- Wiki: `knowledge/custom/_index.md`\n');
  const put = (rel: string, text: string) => fs.writeFileSync(path.join(wikiA, ...rel.split('/')), text);
  put('wiki/concepts/optics.md', '---\ntitle: Telescope optics\nsummary: Mirrors and lenses\n---\n# Optics\nA telescope gathers light with a mirror. The focal length sets the magnification.\n');
  put('wiki/concepts/mounts.md', '---\ntitle: Equatorial mounts\nsummary: How a mount tracks a telescope across the sky\n---\n# Mounts\nTracking keeps stars still.\n');
  put('wiki/concepts/cafe.md', '---\ntitle: Café guide\nsummary: Espresso near the observatory\n---\n# Café\nCoffee.\n');
  put('wiki/areas/hub.md', '---\ntitle: Optics hub\n---\nEvery telescope article is listed here.\n');
  put('raw/articles/log.md', '---\ntitle: Observing log\n---\nThe telescope logbook of last winter.\n');
  const docs = path.join(temp, 'docs');
  fs.mkdirSync(docs);
  fs.writeFileSync(path.join(docs, 'manual.md'), '# Manual\n\nThe telescope manual explains the collimation.\n');
  const shared = path.join(temp, 'shared-docs');
  fs.mkdirSync(shared);
  fs.writeFileSync(path.join(shared, 'other.md'), '# Other\n\nA shared telescope handbook.\n');

  const a = createSpace(db, { name: 'Project A', folder: projectA });
  const b = createSpace(db, { name: 'Project B', folder: projectB });
  setWikiSettings(db, { hubPath: path.join(temp, 'hub'), projectWikis: 'hub' });
  ensureWikiKnowledge(db, { root: wikiA, space: a.id });
  const own = createBase(db, { name: 'Manuals', space: a.id });
  addSource(db, own.id, 'folder', docs);
  scanSoon(db, own.id);
  const theirs = createBase(db, { name: 'Shared', space: null });
  addSource(db, theirs.id, 'folder', shared);
  scanSoon(db, theirs.id);
  await settle();
  // Written after the index was read: only its title and summary can find it.
  put('wiki/concepts/late.md', '---\ntitle: Stargazing\nsummary: "Planning a telescope night"\n---\n# Stargazing\nNothing indexed yet.\n');

  const note = (scopeKey: string, text: string, kind: 'note' | 'topic' | 'profile' = 'note', scope: 'repo' | 'global' = 'repo') => addEntry(db, { scope, scopeKey, text, kind }, { source: 'agent' });
  note(projectA, 'The telescope is a 127 mm Maksutov on an EQ mount.');
  note(projectA, 'Telescope projects: profile of this project.', 'profile');
  note(projectA, 'Everything about the telescope, summed up.', 'topic');
  note(projectB, 'Telescope belongs to the other project.');
  note('', 'The user owns a telescope.', 'profile', 'global');

  wikiBrowse.routes!({ app, db, sessions: { summary: () => undefined } } as unknown as Deps);
  await app.ready();
  const search = async (id: string, query: string) => app.inject({ method: 'GET', url: `/api/projects/${id}/memory/search?q=${encodeURIComponent(query)}` });
  const body = async (id: string, query: string) => (await search(id, query)).json() as ProjectMemorySearch;

  assert.equal((await search('spmissing', 'telescope')).statusCode, 404);
  assert.equal((await search(a.id, '')).statusCode, 400);
  assert.equal((await search(a.id, '   ')).statusCode, 400);
  assert.equal((await app.inject({ method: 'GET', url: `/api/projects/${a.id}/memory/search` })).statusCode, 400);

  const r = await body(a.id, 'telescope');
  assert.equal(r.query, 'telescope');
  assert.equal(r.meaning, false, 'meaning is off');
  // Notes stay in the project: its notes, its topic and its profile; not the other project's, not the user's profile.
  assert.equal(r.notes.length, 3);
  assert.ok(r.notes.every((n) => n.scope === 'repo' && n.scopeKey === projectA));
  assert.deepEqual(r.notes.map((n) => n.kind).sort(), ['note', 'profile', 'topic']);
  // Articles: the title holding the whole question first, then the passages the index found, then the title/summary matches; no hub.
  assert.equal(r.articles[0].path, 'wiki/concepts/optics.md');
  assert.deepEqual(r.articles.map((x) => x.path).sort(), ['raw/articles/log.md', 'wiki/concepts/late.md', 'wiki/concepts/mounts.md', 'wiki/concepts/optics.md']);
  assert.equal(r.articles[0].title, 'Telescope optics');
  assert.match(r.articles[0].excerpt ?? '', /telescope/i);
  assert.ok((r.articles[0].excerpt ?? '').length <= 301);
  assert.ok(r.articles[0].by.includes('words'));
  const late = r.articles[r.articles.length - 1];
  assert.deepEqual([late.path, late.by, late.excerpt], ['wiki/concepts/late.md', ['title'], 'Planning a telescope night']);
  // Documents: this project's own bases only.
  assert.deepEqual(r.documents.map((h) => [h.baseName, path.basename(h.path)]), [['Manuals', 'manual.md']]);
  assert.match(r.documents[0].text, /telescope manual/);

  // Title match without a passage, accents aside, every word needed.
  const cafe = await body(a.id, 'cafe espresso');
  assert.deepEqual(cafe.articles.map((x) => x.path), ['wiki/concepts/cafe.md']);
  assert.deepEqual((await body(a.id, 'tractors')).articles, []);
  // Late (not yet indexed) and accented: only the title and summary words can find it, and every word must be there.
  assert.deepEqual((await body(a.id, 'stargazing planning')).articles.map((x) => x.path), ['wiki/concepts/late.md']);
  assert.deepEqual((await body(a.id, 'stargazing tractors')).articles, [], 'every word of the question must be in the title or summary');
  assert.deepEqual((await body(a.id, 'STARGAZING')).articles.map((x) => x.path), ['wiki/concepts/late.md'], 'case aside');
  // The limit is per kind and capped.
  assert.equal((await body(a.id, 'telescope')).notes.length, 3);
  const one = (await app.inject({ method: 'GET', url: `/api/projects/${a.id}/memory/search?q=telescope&limit=1` })).json() as ProjectMemorySearch;
  assert.deepEqual([one.notes.length, one.articles.length, one.documents.length], [1, 1, 1]);
  assert.equal((await app.inject({ method: 'GET', url: `/api/projects/${a.id}/memory/search?q=telescope&limit=9999` })).statusCode, 200);

  // Another project sees its own notes, and no wiki or documents of this one.
  const other = await body(b.id, 'telescope');
  assert.deepEqual(other.notes.map((n) => n.scopeKey), [projectB]);
  assert.deepEqual(other.articles, []);
  assert.deepEqual(other.documents, []);

  // Wiki memory off: no articles, notes and documents stay.
  updateSpace(db, a.id, { wikiMemory: false });
  const off = await body(a.id, 'telescope');
  assert.deepEqual(off.articles, []);
  assert.equal(off.notes.length, 3);
  assert.equal(off.documents.length, 1);
  console.log('Project memory search tests passed');
} finally {
  await app.close();
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
