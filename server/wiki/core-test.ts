// Tests the wiki file boundary using only disposable directories and no real wiki data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { activeWikiDocument, applyWikiChanges, checkWiki, checkOrigin, ingestWikiSource, readWiki, wikiHash } from './core.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-core-'));
try {
  const project = path.join(tmp, 'project');
  const wiki = path.join(project, '.wiki');
  fs.mkdirSync(path.join(wiki, 'wiki'), { recursive: true });

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
  assert.throws(() => ingestWikiSource(wiki, 'The key is AKIAIOSFODNN7EXAMPLE and password: hunter2hunter2', 'manual:note'), /credentials/, 'pasted text is checked for secrets');
  assert.throws(() => applyWikiChanges(wiki, [{ path: first.originalPath, content: 'modified', expectedSha256: wikiHash(source) }]), /written only/);
  assert.throws(() => applyWikiChanges(wiki, [{ path: first.path, content: 'modified', expectedSha256: wikiHash(sourceNote) }]), /immutable/);

  applyWikiChanges(wiki, [{ path: 'wiki/concepts/test.md', content: '# Start\n', expectedSha256: null }]);
  const original = readWiki(wiki, 'wiki/concepts/test.md');
  fs.writeFileSync(path.join(wiki, original.path), '# Another writer\n');
  assert.throws(() => applyWikiChanges(wiki, [{ path: original.path, content: '# Stale\n', expectedSha256: original.sha256 }]), /conflict/);
  assert.equal(readWiki(wiki, original.path).content, '# Another writer\n');
  assert.equal(activeWikiDocument('---\n"document_status": "retired"\n---\nHidden'), false, 'quoted retirement metadata is excluded');
  assert.throws(() => readWiki(wiki, '../outside'), /Invalid/);
  assert.throws(() => readWiki(wiki, '.ARCHIVE/x.md'), /hidden/);
  assert.equal(activeWikiDocument('---\nstatus: archived\n---\nActive plan'), true);
  assert.equal(activeWikiDocument('---\ndocument_status: archived\n---\nHidden'), false);
  fs.writeFileSync(path.join(wiki, 'old.md'), '---\ndocument_status: retired\n---\nHidden');
  assert.throws(() => readWiki(wiki, 'old.md'), /Retired/);
  fs.writeFileSync(path.join(wiki, 'audit.md'), '---\nsources:\n  - raw/articles/missing.md\n---\n[Missing](missing.md)');
  const audit = checkWiki(wiki);
  assert.ok(audit.issues.some((i) => i.detail.includes('Missing or excluded source')));
  assert.ok(audit.issues.some((i) => i.detail.includes('Missing or excluded link')));
  fs.symlinkSync(tmp, path.join(wiki, 'wiki', 'shortcut'));
  assert.throws(() => applyWikiChanges(wiki, [{ path: 'wiki/shortcut/file.md', content: 'bad', expectedSha256: null }]), /symbolic/);
  // Hidden paths are refused for reads and writes: .git, .sessions, locks, any part starting with a dot.
  for (const dot of ['.git/config', '.sessions/digests/x.md', 'wiki/.git/HEAD', 'wiki/.hidden.md', '.hydor-wiki-write.lock', '.hydor-1.tmp', 'raw/articles/.x.md']) {
    fs.mkdirSync(path.dirname(path.join(wiki, dot)), { recursive: true });
    fs.writeFileSync(path.join(wiki, dot), 'hidden');
    assert.throws(() => readWiki(wiki, dot), /hidden/, `read ${dot}`);
    assert.throws(() => applyWikiChanges(wiki, [{ path: dot, content: 'x', expectedSha256: null }]), /hidden|written only/, `write ${dot}`);
    assert.equal(fs.readFileSync(path.join(wiki, dot), 'utf8'), 'hidden');
  }
  fs.rmSync(path.join(wiki, '.hydor-wiki-write.lock'), { recursive: true });
  // Writes only go to wiki/**/*.md, index.md and log.md (and raw notes by the lessons workflow); never settings or other folders.
  for (const bad of ['wikis.json', 'config.md', 'notes.md', 'wiki/data.json', 'wiki/page.txt', 'other/a.md', 'projects/x/wiki/a.md', 'raw/articles/x.pdf', 'index.md/x.md']) {
    assert.throws(() => applyWikiChanges(wiki, [{ path: bad, content: 'x', expectedSha256: null }]), /written only|Invalid|hidden|holds its files/, `write ${bad}`);
  }
  assert.equal(fs.existsSync(path.join(wiki, 'wikis.json')), false);
  assert.equal(fs.existsSync(path.join(wiki, 'config.md')), false);
  applyWikiChanges(wiki, [{ path: 'index.md', content: '# Index\n', expectedSha256: null }]);
  applyWikiChanges(wiki, [{ path: 'log.md', content: '# Log\n', expectedSha256: null }]);
  assert.equal(readWiki(wiki, 'index.md').content, '# Index\n');
  // Reads stay in wiki/, raw/ and the root's Markdown files.
  fs.mkdirSync(path.join(wiki, 'projects', 'x'), { recursive: true });
  fs.writeFileSync(path.join(wiki, 'projects', 'x', 'a.md'), 'another project');
  assert.throws(() => readWiki(wiki, 'projects/x/a.md'), /holds its files/);
  assert.throws(() => readWiki(wiki, 'wikis.json'), /holds its files/);
  // The check does not look into hidden folders or other folders at the root.
  assert.ok(!checkWiki(wiki).issues.some((i) => i.path.startsWith('projects') || i.path.startsWith('.')));
  fs.mkdirSync(path.join(wiki, '.hydor-wiki-write.lock'));
  assert.throws(() => applyWikiChanges(wiki, [{ path: 'wiki/other.md', content: 'x', expectedSha256: null }]), /locked/);
  fs.rmSync(path.join(wiki, '.hydor-wiki-write.lock'), { recursive: true });

  // Origins: no credentials in user info (any scheme), query, path or fragment.
  for (const bad of ['ssh://user:pw@host.example/repo', 'ssh://deploy@host/repo', 'https://user:pw@example.org/x', 'git+https://tok@github.com/a/b', 'https://example.org/dl?access_token=abc123', 'https://example.org/dl?api_key=abc123',
    'https://example.org/hook/xoxb-123456789012-abcdefghijklmnop', 'https://example.org/a/Zk3pQ9vL2mX8wR5tY7uI1oP4aS6dF0gH', 'https://example.org/page#access_token=abc123', 'https://example.org/page#Zk3pQ9vL2mX8wR5tY7uI1oP4aS6dF0gH',
    'https://example.org/p?x=ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'user:pw@host.example']) {
    assert.throws(() => checkOrigin(bad), /credentials/, bad);
  }
  for (const good of ['https://example.org/docs/page?id=42&lang=en#section-2', 'https://github.com/a/b/commit/0123456789abcdef0123456789abcdef01234567', 'file:/home/me/report.pdf#0123456789abcdef', 'Manual document A', 'manual:sample', 'mailto:someone@example.org', 'https://example.org/e1b2c3d4-0000-4000-8000-123456789abc']) checkOrigin(good);
  console.log('Wiki core: source identity, boundaries and conflict checks passed');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
