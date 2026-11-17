// Automatic wiki upkeep must never expose, rewrite, split or merge reviewed contracts.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kvSet, openDb } from '../../db.ts';
import { areaArticles } from '../areas/articles.ts';
import { mergeOne } from '../areas/merge.ts';
import { createSpace } from '../../spaces/index.ts';
import { wikiRoot } from '../roots.ts';
import { setWikiSettings } from '../settings/settings.ts';
import { forgetFileLists } from './anchors.ts';
import { digestText, listArticles } from './digest.ts';
import { checkWikiDrift } from './drift.ts';
import { PLAN_SYSTEM } from './plan.ts';
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

  // A document turned into a contract during the planning call must not reach the later writing call.
  setWikiSettings(db, { enabled: true, hubPath: root });
  const ordinary = path.join(root, 'wiki/ordinary.md');
  const promoted = files['wiki/ordinary.md'].replace('title: Ordinary article', 'title: Ordinary article\ndocument_kind: contract');
  const input = { space: null, base: 'test', title: 'Source', path: 'synthetic.md', origin: 'synthetic', text: 'Synthetic project information for the wiki.', cut: false, kind: 'document' as const, notes: false, hash: 'synthetic', now: () => Date.now(), source: null, quiet: true };
  const prompts: string[] = [];
  await digestText(db, async (q) => {
    prompts.push(q.prompt);
    if (q.system === PLAN_SYSTEM) {
      await Promise.resolve();
      fs.writeFileSync(ordinary, promoted);
      return { update: ['wiki/ordinary.md'], create: [{ title: 'Separate topic' }], notes: [] };
    }
    return { articles: [{ path: 'wiki/separate-topic.md', content: '# Separate topic\n\nA separate useful article for this test.\n' }] };
  }, input);
  assert.equal(prompts.length, 2, 'an unrelated article still reaches the writer');
  assert.ok(prompts.every((prompt) => !prompt.includes('protected-marker-one') && !prompt.includes('protected-marker-two')));
  assert.ok(prompts.every((prompt) => !prompt.includes('wiki/contracts/standard.md') && !prompt.includes('wiki/references/custom.md')));
  assert.ok(!prompts[1].includes('wiki/ordinary.md') && !prompts[1].includes('Ordinary article'), 'the newly protected contract is not supplied to the writer');
  assert.equal(fs.readFileSync(ordinary, 'utf8'), promoted);

  // A contract created while the writer is answering is protected again immediately before storage.
  fs.writeFileSync(ordinary, files['wiki/ordinary.md']);
  let writing = false;
  await digestText(db, async (q) => {
    if (q.system === PLAN_SYSTEM) return { update: ['wiki/ordinary.md'], create: [], notes: [] };
    writing = true;
    await Promise.resolve();
    fs.writeFileSync(ordinary, promoted);
    return { articles: [{ path: 'wiki/ordinary.md', content: '# Ordinary article\n\nAn ordinary useful article.\n\nA synthetic addition.\n' }] };
  }, input);
  assert.equal(writing, true);
  assert.equal(fs.readFileSync(ordinary, 'utf8'), promoted, 'the reviewed contract is never rewritten');
  assert.equal(fs.existsSync(path.join(root, '.history')), false, 'no automatic contract snapshot is made');

  // Drift checks neither modify reviewed contracts nor send them to the helper.
  const project = path.join(root, 'drift-project');
  fs.mkdirSync(project);
  const git = (...args: string[]) => execFileSync('git', ['-C', project, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '-q');
  fs.writeFileSync(path.join(project, 'tracked.txt'), 'before\n');
  git('add', 'tracked.txt'); git('commit', '-q', '-m', 'before');
  const head = git('rev-parse', 'HEAD');
  const space = createSpace(db, { name: 'Drift contract safety', folder: project });
  const driftRoot = wikiRoot(db, space.id, { create: true })!;
  const article = (title: string, contract = false) => `---\ntitle: ${title}\n${contract ? 'document_kind: contract\n' : ''}anchors:\n  - tracked.txt\ncommit: ${head}\n---\n\n# ${title}\n\nSynthetic article for drift testing.\n`;
  const driftFiles = { 'a-ordinary.md': article('Ordinary'), 'b-promoted.md': article('Promoted'), 'c-contract.md': article('Existing contract', true) };
  for (const [name, text] of Object.entries(driftFiles)) fs.writeFileSync(path.join(driftRoot, 'wiki', name), text);
  fs.writeFileSync(path.join(project, 'tracked.txt'), 'after\n');
  git('add', 'tracked.txt'); git('commit', '-q', '-m', 'after');
  forgetFileLists();
  const driftPrompts: string[] = [];
  const promotedPath = path.join(driftRoot, 'wiki/b-promoted.md');
  const promotedDrift = article('Promoted', true);
  await checkWikiDrift(db, { only: space.id, force: true, ask: async ({ prompt }) => {
    driftPrompts.push(prompt);
    // Another review may promote a later article while the first helper call is in progress.
    fs.writeFileSync(promotedPath, promotedDrift);
    return { status: 'keep' };
  } });
  assert.equal(driftPrompts.length, 1, 'only the ordinary article reaches the helper');
  assert.ok(driftPrompts.every((prompt) => !prompt.includes('Existing contract') && !prompt.includes('Promoted')));
  assert.equal(fs.readFileSync(path.join(driftRoot, 'wiki/c-contract.md'), 'utf8'), driftFiles['c-contract.md']);
  assert.equal(fs.readFileSync(promotedPath, 'utf8'), promotedDrift);
} finally {
  db.close();
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('Automatic upkeep excludes reviewed contracts');
