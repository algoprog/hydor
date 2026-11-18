// Tests wiki documents through Hydor's existing knowledge index and its active-content guards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb, kvSet } from '../../db.ts';
import { progress, scanSoon } from '../../knowledge/indexer.ts';
import { searchKnowledge } from '../../knowledge/search.ts';
import { docsOf } from '../../knowledge/store.ts';
import { ensureWikiKnowledge, refreshWikiKnowledge } from './index.ts';
import { wikiBaseVisible, wikiDocumentVisible } from './bindings.ts';
import { basesFor, basesOfSession } from '../../knowledge/scope.ts';
import { setSessionExtra } from '../../sessionExtra.ts';
import { createSpace, deleteSpace, updateSpace } from '../../spaces/index.ts';
import { applyWikiChanges, ingestWikiSource } from '../core.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-knowledge-')));
const db = openDb(path.join(temp, 'test.db'));
try {
  const hub = path.join(temp, '.wiki');
  fs.mkdirSync(path.join(hub, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(hub, '.archive'), { recursive: true });
  // A project's own wiki lives under the hub's projects/: the shared base must not index it.
  fs.mkdirSync(path.join(hub, 'projects', 'shop-123abc', 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(hub, 'projects', 'shop-123abc', 'wiki', 'plan.md'), 'A remarkable private telescope.');
  const active = path.join(hub, 'wiki', 'active.md');
  fs.writeFileSync(active, 'A remarkable orange telescope.');
  fs.writeFileSync(path.join(hub, '.archive', 'secret.md'), 'A remarkable hidden telescope.');
  fs.writeFileSync(path.join(hub, 'wiki', 'retired.md'), '---\ndocument_status: retired\n---\nA remarkable retired telescope.');
  kvSet(db, 'wiki.hubPath', hub);
  kvSet(db, 'memory.meaning', '0');
  const binding = ensureWikiKnowledge(db, { root: hub, space: null });
  setSessionExtra(db, 'codex:wiki-off', { confidential: true });
  assert.equal(basesOfSession(db, 'codex:wiki-off').some((b) => b.id === binding.base), false, 'a Confidential chat gets no wiki');
  assert.equal(basesOfSession(db, 'codex:wiki-on').some((b) => b.id === binding.base), true);
  const again = ensureWikiKnowledge(db, { root: hub, space: null });
  assert.equal(binding.base, again.base);
  for (let i = 0; i < 100 && (!docsOf(db, binding.base).length || progress.size); i++) await new Promise((r) => setTimeout(r, 20));
  const docs = docsOf(db, binding.base);
  assert.deepEqual(docs.map((d) => d.path), [active], 'hidden, retired and other projects’ files are not indexed');
  assert.equal((await searchKnowledge(db, { query: 'telescope', mode: 'words', within: [binding.base] })).hits.length, 1);
  // A newly ingested source and compiled article become searchable through the existing Knowledge index.
  const sourceText = 'The violet observatory is situated on a hill.\n';
  const source = ingestWikiSource(hub, sourceText, 'manual:observatory');
  const article = `---\ntitle: Observatory\nsources:\n  - ${source.path}\n---\n\nThe violet observatory is situated on a hill.\n`;
  applyWikiChanges(hub, [{ path: 'wiki/observatory.md', content: article, expectedSha256: null }]);
  refreshWikiKnowledge(db, hub);
  let hits = await searchKnowledge(db, { query: 'observatory', mode: 'words', within: [binding.base] });
  for (let i = 0; i < 150 && !hits.hits.some((h) => h.path.endsWith('/wiki/observatory.md')); i++) {
    await new Promise((r) => setTimeout(r, 20));
    hits = await searchKnowledge(db, { query: 'observatory', mode: 'words', within: [binding.base] });
  }
  assert.ok(hits.hits.some((h) => h.path.endsWith('/wiki/observatory.md')));
  assert.equal(fs.readFileSync(path.join(hub, source.originalPath), 'utf8'), sourceText);
  assert.equal(ingestWikiSource(hub, sourceText, 'manual:observatory').existing, true);
  assert.match(fs.readFileSync(path.join(hub, 'wiki/observatory.md'), 'utf8'), new RegExp(source.path));
  // Retiring a document is enforced at read/search time, even before the next index scan.
  fs.writeFileSync(active, '---\ndocument_status: retired\n---\nA remarkable orange telescope.');
  assert.equal(wikiDocumentVisible(db, binding.base, active), false);
  assert.equal((await searchKnowledge(db, { query: 'telescope', mode: 'words', within: [binding.base] })).hits.length, 0);
  // A project wiki never becomes shared when its owning project is removed.
  const projectFolder = path.join(temp, 'project');
  const projectWiki = path.join(projectFolder, '.wiki');
  fs.mkdirSync(projectWiki, { recursive: true });
  const space = createSpace(db, { name: 'Project', folder: projectFolder });
  const project = ensureWikiKnowledge(db, { root: projectWiki, space: space.id });
  assert.equal(basesFor(db, space.id).some((b) => b.id === project.base), true);
  assert.equal(basesFor(db, null).some((b) => b.id === project.base), false);
  // The project's wiki stays bound across sessions (no flapping), and is hidden while wiki memory is off for the project.
  assert.equal(ensureWikiKnowledge(db, { root: projectWiki, space: space.id }).base, project.base);
  assert.equal(wikiBaseVisible(db, project.base), true);
  updateSpace(db, space.id, { wikiMemory: false });
  assert.equal(wikiBaseVisible(db, project.base), false, 'the project’s switch hides it at once');
  assert.throws(() => ensureWikiKnowledge(db, { root: projectWiki, space: space.id }), /off/);
  updateSpace(db, space.id, { wikiMemory: null });
  assert.equal(wikiBaseVisible(db, project.base), true, 'back on: the same binding is visible again');
  assert.equal(wikiBaseVisible(db, binding.base), true, 'the shared wiki follows Settings, not the project');
  deleteSpace(db, space.id);
  assert.equal(basesFor(db, null).some((b) => b.id === project.base), false);
  kvSet(db, 'wiki.enabled', '0');
  assert.equal(wikiBaseVisible(db, binding.base), false);
  assert.equal((await searchKnowledge(db, { query: 'telescope', mode: 'words', within: [binding.base] })).hits.length, 0);
  console.log('Wiki knowledge indexing tests passed');
} finally {
  // Delete only this disposable test database and wiki.
  db.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
