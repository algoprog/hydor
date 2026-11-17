// Wiki rebuilds and old archive pruning must not move, reactivate or remove reviewed contracts.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { archiveWiki, dropArchive, restoreWiki } from '../core.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contract-rebuild-'));
const wiki = path.join(root, 'wiki');
const first = '2026-11-17T00-00-00-000Z';
const second = '2026-11-17T00-00-01-000Z';
try {
  fs.mkdirSync(path.join(wiki, 'contracts'), { recursive: true });
  const contract = path.join(wiki, 'contracts', 'policy.md');
  const content = '---\ndocument_kind: contract\n---\n# Approved\n';
  fs.writeFileSync(contract, content);
  await assert.rejects(archiveWiki(root, first), /containing project contracts/);
  assert.equal(fs.readFileSync(contract, 'utf8'), content);
  assert.equal(fs.existsSync(path.join(root, '.history')), false);
  fs.rmSync(contract);
  await archiveWiki(root, first);
  const archived = path.join(root, '.history', 'rebuilds', first, 'wiki', 'contracts', 'old.md');
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.writeFileSync(archived, content);
  await assert.rejects(restoreWiki(root, first, second), /containing project contracts/);
  dropArchive(root, first);
  assert.equal(fs.readFileSync(archived, 'utf8'), content);
  assert.equal(fs.existsSync(path.join(root, '.history', 'rebuilds', second)), false);

  // A confirmed contract outside the default directory is equally protected.
  const customRoot = path.join(root, 'custom');
  const custom = path.join(customRoot, 'wiki', 'references', 'policy.md');
  fs.mkdirSync(path.dirname(custom), { recursive: true });
  fs.writeFileSync(custom, content);
  await assert.rejects(archiveWiki(customRoot, first), /containing project contracts/);
  assert.equal(fs.readFileSync(custom, 'utf8'), content);

  // A broken link is unsafe too, and the other entries must not move before that is known.
  const linkRoot = path.join(root, 'links');
  fs.mkdirSync(linkRoot);
  fs.symlinkSync('missing', path.join(linkRoot, 'wiki'));
  await assert.rejects(archiveWiki(linkRoot, first), /symbolic links/);
  assert.equal(fs.lstatSync(path.join(linkRoot, 'wiki')).isSymbolicLink(), true);
  fs.unlinkSync(path.join(linkRoot, 'wiki'));
  fs.mkdirSync(path.join(linkRoot, 'wiki'));
  fs.writeFileSync(path.join(linkRoot, 'wiki', 'article.md'), '# Preserved');
  fs.symlinkSync('missing', path.join(linkRoot, 'index.md'));
  await assert.rejects(archiveWiki(linkRoot, first), /symbolic link/);
  assert.equal(fs.readFileSync(path.join(linkRoot, 'wiki', 'article.md'), 'utf8'), '# Preserved');
  assert.equal(fs.existsSync(path.join(linkRoot, '.history')), false);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log('Reviewed contracts survive rebuild, restore and archive pruning');
