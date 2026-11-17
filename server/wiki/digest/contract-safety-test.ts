// Automatic wiki upkeep must never expose, rewrite, split or merge reviewed contracts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from '../../db.ts';
import { areaArticles } from '../areas/articles.ts';
import { mergeOne } from '../areas/merge.ts';
import { listArticles } from './digest.ts';
import { splitArticle } from './split.ts';
import { storeArticle, writeIndex } from './write.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contract-upkeep-'));
const db = openDb(path.join(root, 'test.db'));
try {
  kvSet(db, 'memory.meaning', '0');
  const files = {
    'wiki/contracts/standard.md': '---\ntitle: Standard contract\ndocument_kind: contract\n---\n\n# Standard contract\n\nprotected-marker-one\n',
    'wiki/references/custom.md': '---\ntitle: Custom contract\ndocument_kind: contract\n---\n\n# Custom contract\n\nprotected-marker-two\n',
    'wiki/ordinary.md': '---\ntitle: Ordinary article\n---\n\n# Ordinary article\n\nAn ordinary useful article.\n',
  };
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const listed = await listArticles(db, root, null, { title: 'contract', text: 'protected-marker-one protected-marker-two' });
  assert.deepEqual([...listed.all], ['wiki/ordinary.md']);
  assert.ok(listed.lines.every((a) => !a.path.includes('contract') && !a.first.includes('protected-marker')));
  assert.deepEqual(areaArticles(root).map((a) => a.path), ['wiki/ordinary.md']);
  await writeIndex(root);
  const index = fs.readFileSync(path.join(root, 'index.md'), 'utf8');
  assert.ok(index.includes('ordinary.md'));
  assert.ok(!index.includes('protected-marker') && !index.includes('contracts/standard.md') && !index.includes('references/custom.md'));
  let asks = 0;
  const ask = async () => { asks++; return {}; };
  const queue = { kind: 'fold' as const, from: ['wiki/ordinary.md', 'wiki/references/custom.md'], into: null, title: 'Combined', why: 'Old queue', addedAt: '2026-11-17', tries: 0 };
  assert.equal((await mergeOne(root, ask, queue, Date.now())).ok, false);
  assert.equal((await mergeOne(root, ask, { ...queue, from: ['wiki/ordinary.md'], into: 'wiki/contracts/standard.md' }, Date.now())).ok, false);
  const split = await splitArticle(root, ask, { path: 'wiki/references/custom.md', title: 'Custom', current: files['wiki/references/custom.md'], incoming: { title: 'Incoming', text: 'Nothing', kind: 'document' }, taken: new Set(), source: 'test', now: Date.now() });
  assert.equal(split.ok, false);
  const stored = await storeArticle(root, { path: 'wiki/references/custom.md', title: 'Custom', body: '# Rewritten', now: Date.now() });
  assert.equal(stored.status, 'refused');
  assert.equal(asks, 0);
  for (const [rel, content] of Object.entries(files)) assert.equal(fs.readFileSync(path.join(root, rel), 'utf8'), content);
  assert.equal(fs.existsSync(path.join(root, '.history')), false);
} finally {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('Automatic upkeep excludes reviewed contracts');
