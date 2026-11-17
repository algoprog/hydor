// Verify source-bound previews, protected contract writes and revision preservation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyWikiChanges, readWiki } from '../core.ts';
import { applyRevision, previewRevision } from '../plans/revision.ts';
import { previewContract } from './tools.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-contracts-'));
try {
  fs.mkdirSync(path.join(root, 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(root, 'wiki', 'source.md'), '# Original\nUse verified sources.\n');
  const input = { slug: 'sources', title: 'Sources', scope: 'Research', origin: 'User request', sourcePath: 'wiki/source.md' };
  const preview = previewContract(root, input);
  assert.equal(fs.existsSync(path.join(root, preview.path)), false, 'preview writes nothing');
  assert.match(preview.content, /document_kind: contract/);
  // Relative module and plan links must survive moving the approved copy into wiki/contracts.
  fs.mkdirSync(path.join(root, 'wiki', 'references'), { recursive: true });
  const linkedSource = '# Übernahme\n[Module A](../modules/a.md) [Module B](../modules/b.md#scope)\n[Plan](../../output/projects/demo/plan.md?view=1#status) [Reference][module]\n\n[module]: ../modules/a.md "Module"\n\n`[Code](not-a-link.md)`\n\n[External](https://example.com/a)\n';
  fs.mkdirSync(path.join(root, 'wiki', 'modules'), { recursive: true });
  fs.mkdirSync(path.join(root, 'output', 'projects', 'demo'), { recursive: true });
  for (const rel of ['wiki/modules/a.md', 'wiki/modules/b.md', 'output/projects/demo/plan.md']) fs.writeFileSync(path.join(root, rel), '# Existing document\n');
  fs.writeFileSync(path.join(root, 'wiki', 'references', 'linked.md'), linkedSource);
  const linked = previewContract(root, { ...input, slug: 'linked', sourcePath: 'wiki/references/linked.md' });
  assert.match(linked.content, /\[Module A\]\(\.\.\/modules\/a\.md\)/);
  assert.match(linked.content, /\[Module B\]\(\.\.\/modules\/b\.md#scope\)/);
  assert.match(linked.content, /\[Plan\]\(\.\.\/\.\.\/output\/projects\/demo\/plan\.md\?view=1#status\)/);
  assert.match(linked.content, /\[module\]: \.\.\/modules\/a\.md/);
  assert.match(linked.content, /`\[Code\]\(not-a-link\.md\)`/);
  assert.equal(fs.readFileSync(path.join(root, 'wiki', 'references', 'linked.md'), 'utf8'), linkedSource);
  for (const rel of ['../modules/a.md', '../modules/b.md', '../../output/projects/demo/plan.md']) assert.ok(fs.existsSync(path.resolve(root, path.dirname(linked.path), rel)));
  applyWikiChanges(root, [{ path: linked.path, content: linked.content, expectedSha256: null }], { contracts: true });
  const linkedCurrent = readWiki(root, linked.path);
  const linkedChange = { path: linked.path, content: linkedCurrent.content.replace('Module A', 'Module Alpha'), expectedSha256: linkedCurrent.sha256, reason: 'Clarify module', authorization: 'User request' };
  const linkedRevision = previewRevision(root, linkedChange, 'contract');
  const linkedSaved = applyRevision(root, linkedChange, linkedRevision.sha256, 'contract');
  assert.equal(fs.readFileSync(path.join(root, linkedSaved.snapshot, 'document.md'), 'utf8'), linkedCurrent.content);
  assert.equal(fs.readFileSync(path.join(root, 'wiki', 'references', 'linked.md'), 'utf8'), linkedSource);
  const moved = previewContract(root, { ...input, slug: 'moved', sourcePath: 'wiki/source.md' });
  fs.writeFileSync(path.join(root, 'wiki', 'source.md'), '[A](modules/a.md) [B](../output/plan.md#result)\n');
  const rebased = previewContract(root, { ...input, slug: 'moved', sourcePath: 'wiki/source.md' });
  assert.match(rebased.content, /\[A\]\(\.\.\/modules\/a\.md\)/);
  assert.match(rebased.content, /\[B\]\(\.\.\/\.\.\/output\/plan\.md#result\)/);
  assert.notEqual(rebased.sha256, moved.sha256);
  fs.writeFileSync(path.join(root, 'wiki', 'source.md'), '<a href="modules/a.md">A</a>');
  assert.throws(() => previewContract(root, { ...input, slug: 'html' }), /HTML links/);
  fs.writeFileSync(path.join(root, 'wiki', 'source.md'), '# Changed\n');
  assert.notEqual(previewContract(root, input).sha256, preview.sha256, 'changed source invalidates preview');
  fs.writeFileSync(path.join(root, 'wiki', 'source.md'), '# Original\nUse verified sources.\n');
  assert.throws(() => applyWikiChanges(root, [{ path: preview.path, content: preview.content, expectedSha256: null }]), /contract approval/);
  applyWikiChanges(root, [{ path: preview.path, content: preview.content, expectedSha256: null }], { contracts: true });
  // A changed existing contract invalidates any pending adoption preview.
  const secondInput = { slug: 'privacy', title: 'Privacy', scope: 'Accounts', origin: 'User request', content: 'Protect account data.' };
  const beforeExistingChange = previewContract(root, secondInput);
  fs.writeFileSync(path.join(root, preview.path), preview.content + '\nChanged elsewhere.\n');
  assert.notEqual(previewContract(root, secondInput).sha256, beforeExistingChange.sha256);
  fs.writeFileSync(path.join(root, preview.path), preview.content);
  const current = readWiki(root, preview.path);
  const change = { path: preview.path, content: current.content.replace('Use verified sources.', 'Use primary sources.'), expectedSha256: current.sha256, reason: 'Clarify sources', authorization: 'User request' };
  const revision = previewRevision(root, change, 'contract');
  assert.match(revision.content, /revision: 2/);
  const result = applyRevision(root, change, revision.sha256, 'contract');
  assert.equal(fs.readFileSync(path.join(root, result.snapshot, 'document.md'), 'utf8'), current.content);
  assert.match(readWiki(root, preview.path).content, /Use primary sources/);
  assert.throws(() => previewRevision(root, change, 'contract'), /changed/);
  console.log('Contract previews and protected revisions passed');
} finally {
  // Only temporary test material is removed; clear a macOS immutable flag if one was required.
  if (process.platform === 'darwin') {
    const { spawnSync } = await import('node:child_process');
    spawnSync('/usr/bin/chflags', ['-R', 'nouchg', root]);
  }
  fs.rmSync(root, { recursive: true, force: true });
}
