// Tests the wiki file boundary using only disposable directories and no real wiki data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activeWikiDocument, applyWikiChanges, checkWiki, ingestWikiSource, readWiki, resolveWiki, wikiHash } from './core.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-core-'));
try {
  const hub = path.join(tmp, 'hub');
  const project = path.join(tmp, 'project');
  const wiki = path.join(project, '.wiki');
  fs.mkdirSync(wiki, { recursive: true });
  fs.mkdirSync(path.join(hub, 'topics', 'one'), { recursive: true });
  fs.writeFileSync(path.join(hub, 'wikis.json'), JSON.stringify({ wikis: { one: { path: 'topics/one' }, old: { path: '.archive/old', status: 'archived' } } }));
  assert.equal(resolveWiki({ hub, cwd: project, projectWiki: '.wiki' }), fs.realpathSync(wiki));
  assert.equal(resolveWiki({ hub, cwd: project, name: 'one' }), fs.realpathSync(path.join(hub, 'topics', 'one')));
  assert.throws(() => resolveWiki({ hub, cwd: project, name: 'old' }), /Archived/);
  assert.throws(() => resolveWiki({ hub, cwd: project, name: 'unknown' }), /registered/);

  const source = 'A unique source.\n';
  const first = ingestWikiSource(wiki, source, 'https://example.org/source');
  assert.equal(first.existing, false);
  assert.equal(fs.readFileSync(path.join(wiki, first.originalPath), 'utf8'), source);
  const sourceNote = fs.readFileSync(path.join(wiki, first.path), 'utf8');
  assert.match(sourceNote, /^---\ntitle: .+\nsource: "https:\/\/example\.org\/source"\ntype: articles\ningested: \d{4}-\d{2}-\d{2}\ntags: \[\]\nsummary: /);
  assert.ok(sourceNote.endsWith(source));
  assert.equal(ingestWikiSource(wiki, source, 'https://example.org/source').existing, true);
  const second = ingestWikiSource(wiki, source, 'https://example.net/mirror');
  assert.equal(second.existing, false, 'new origin requires its own source note');
  assert.equal(second.originalPath, first.originalPath, 'identical original bytes are preserved once');
  assert.notEqual(second.path, first.path);
  assert.equal(fs.readFileSync(path.join(wiki, first.path), 'utf8'), sourceNote, 'the first origin note remains unchanged');
  assert.equal(fs.readFileSync(path.join(wiki, first.originalPath), 'utf8'), source, 'the original remains unchanged');
  assert.match(fs.readFileSync(path.join(wiki, second.path), 'utf8'), /source: "https:\/\/example\.net\/mirror"/);
  assert.equal(ingestWikiSource(wiki, source, 'https://example.net/mirror').existing, true);
  assert.throws(() => ingestWikiSource(wiki, source, 'https://x.invalid/?token=secret'), /credentials/);
  assert.throws(() => applyWikiChanges(wiki, [{ path: first.originalPath, content: 'modified', expectedSha256: wikiHash(source) }]), /immutable/);

  applyWikiChanges(wiki, [{ path: 'wiki/concepts/test.md', content: '# Start\n', expectedSha256: null }]);
  const original = readWiki(wiki, 'wiki/concepts/test.md');
  fs.writeFileSync(path.join(wiki, original.path), '# Another writer\n');
  assert.throws(() => applyWikiChanges(wiki, [{ path: original.path, content: '# Stale\n', expectedSha256: original.sha256 }]), /conflict/);
  assert.equal(readWiki(wiki, original.path).content, '# Another writer\n');
  assert.throws(() => readWiki(wiki, '../outside'), /Invalid/);
  assert.throws(() => readWiki(wiki, '.ARCHIVE/x.md'), /archived/);
  assert.equal(activeWikiDocument('---\nstatus: archived\n---\nActive plan'), true);
  assert.equal(activeWikiDocument('---\ndocument_status: archived\n---\nHidden'), false);
  fs.writeFileSync(path.join(wiki, 'old.md'), '---\ndocument_status: retired\n---\nHidden');
  assert.throws(() => readWiki(wiki, 'old.md'), /Retired/);
  fs.writeFileSync(path.join(wiki, 'audit.md'), '---\nsources:\n  - raw/articles/missing.md\n---\n[Missing](missing.md)');
  const audit = checkWiki(wiki);
  assert.ok(audit.issues.some((i) => i.detail.includes('Missing or excluded source')));
  assert.ok(audit.issues.some((i) => i.detail.includes('Missing or excluded link')));
  fs.symlinkSync(tmp, path.join(wiki, 'shortcut'));
  assert.throws(() => applyWikiChanges(wiki, [{ path: 'shortcut/file.md', content: 'bad', expectedSha256: null }]), /symbolic/);
  fs.mkdirSync(path.join(wiki, '.hydor-wiki-write.lock'));
  assert.throws(() => applyWikiChanges(wiki, [{ path: 'other.md', content: 'x', expectedSha256: null }]), /locked/);
  console.log('Wiki core: source identity, boundaries and conflict checks passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
