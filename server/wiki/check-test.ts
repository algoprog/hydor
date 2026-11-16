// Verify read-only checks against active, excluded and independently linked wiki material.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkWiki } from './core.ts';

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-check-')));
/** Create a bounded fixture without touching a real wiki. */
function put(relative: string, text: string) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
/** Fingerprint fixture bytes and names before and after the check. */
function fingerprint(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isSymbolicLink()) return [`${relative}:link:${fs.readlinkSync(absolute)}`];
    if (entry.isDirectory()) return [`${relative}:dir`, ...fingerprint(absolute)];
    return [`${relative}:${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')}`];
  }).sort();
}
try {
  put('wiki/concepts/_index.md', '[First](first.md)\n[Stale](missing.md)\n');
  put('wiki/concepts/first.md', '---\nsources: [raw/articles/absent.md]\n---\n# First\n[[second|Second]]\n[[unknown]]\n[[/wiki/concepts/second]]\n[[repeated]]\n[Missing](nope.md)\n`[[example-only]]`\n```md\n[Example](example-only.md)\n```\n');
  put('wiki/concepts/second.md', '# Second\n');
  put('wiki/concepts/lone.md', '# Lone\n');
  put('wiki/a/repeated.md', '# First match\n');
  put('wiki/b/repeated.md', '# Second match\n');
  put('wiki/concepts/retired.md', '---\ndocument_status: retired\n---\n[[retired-problem]]');
  put('.archive/hidden.md', '[[archived-problem]]');
  put('.sessions/digests/private.md', '[[private-session-problem]]');
  put('wiki/.history/hidden.md', '[[history-problem]]');
  fs.symlinkSync(path.join(root, '.archive'), path.join(root, 'wiki', 'outside-link'));
  const before = fingerprint(root);
  const report = checkWiki(root);
  assert.equal(report.truncated, false);
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/first.md' && i.detail.includes('Missing or excluded source: raw/articles/absent.md')));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/first.md' && i.detail.includes('Missing or excluded link: nope.md')));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/_index.md' && i.detail.includes('Missing or excluded link: missing.md')));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/_index.md' && i.detail.includes('Article missing from index: wiki/concepts/second.md')));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/first.md' && i.detail === 'Missing or excluded wiki link: unknown'));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/first.md' && i.detail === 'Invalid wiki link: /wiki/concepts/second'));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/first.md' && i.detail === 'Ambiguous wiki link: repeated'));
  assert.ok(report.issues.some((i) => i.path === 'wiki/concepts/lone.md' && i.detail.includes('no incoming')));
  assert.ok(!report.issues.some((i) => i.path === 'wiki/concepts/second.md' && i.detail.includes('no incoming')), 'a wiki link connects the second article');
  assert.ok(!report.issues.some((i) => /example-only|archived-problem|retired-problem|history-problem|private-session-problem/.test(i.detail)), 'examples and excluded content are not checked');
  assert.deepEqual(fingerprint(root), before, 'checking must not mutate the wiki');
  console.log('Wiki checks report active references and index gaps without writes');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
