// Checkpoints: one file per session, only for compaction, pruned after 30 days, and never with the supplied session identifier.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { captureEvent, latestEvent } from './store.ts';

const hub = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-session-'));
try {
  const key = 'private-session-identifier';
  assert.equal(captureEvent(hub, key, 'SessionStart'), null);
  assert.equal(captureEvent(hub, key, 'PostToolUse', 49), null);
  // Only compaction keeps a checkpoint: not a turn ending, tool counts or a session starting.
  assert.equal(captureEvent(hub, key, 'Stop'), null);
  assert.equal(captureEvent(hub, key, 'PostToolUse', 50), null);
  assert.equal(fs.existsSync(path.join(hub, '.sessions', 'digests')), false);
  const pre = captureEvent(hub, key, 'PreCompact', 0, 'Goal: finish the feature. Password: hunter22. Contact a.person@example.com.');
  assert.equal(pre?.trigger, 'pre-compact');
  assert.ok(pre);
  const text = fs.readFileSync(pre.path, 'utf8');
  assert.match(text, /capture_trigger: "pre-compact"/);
  assert.doesNotMatch(text, /private-session-identifier/);
  assert.doesNotMatch(text, /hunter22|a.person@example.com/);
  assert.match(text, /finish the feature/);
  // One file per session, written over each time; a later checkpoint without a summary keeps the summary.
  const post = captureEvent(hub, key, 'PostCompact');
  assert.equal(post?.trigger, 'post-compact');
  assert.equal(post?.path, pre.path);
  assert.match(fs.readFileSync(post!.path, 'utf8'), /finish the feature/);
  const again = captureEvent(hub, key, 'PreCompact', 0, 'Goal: a newer summary.');
  assert.equal(again?.path, pre.path);
  assert.match(fs.readFileSync(pre.path, 'utf8'), /a newer summary/);
  assert.doesNotMatch(fs.readFileSync(pre.path, 'utf8'), /finish the feature/);
  const other = captureEvent(hub, 'another-session', 'PreCompact', 0, 'Goal: elsewhere.');
  assert.notEqual(other?.path, pre.path);
  const digests = path.join(hub, '.sessions', 'digests');
  assert.equal(fs.readdirSync(digests).length, 2, 'one file per session, no temporary files left');
  assert.equal(latestEvent(hub, key), pre.path);
  assert.equal(latestEvent(hub, 'other-session'), null);
  // Checkpoints older than 30 days (also in the year/month folders of earlier versions) are removed when one is written.
  const old = path.join(digests, 'hydor-' + 'a'.repeat(24) + '-2026-01-01T00-00-00-000Z-abcd1234.md');
  const oldDir = path.join(digests, '2026', '01');
  fs.mkdirSync(oldDir, { recursive: true });
  fs.writeFileSync(old, 'old');
  const nested = path.join(oldDir, 'hydor-' + 'b'.repeat(24) + '-x.md');
  fs.writeFileSync(nested, 'old too');
  const longAgo = (Date.now() - 31 * 86_400_000) / 1000;
  fs.utimesSync(old, longAgo, longAgo); fs.utimesSync(nested, longAgo, longAgo);
  const recent = path.join(digests, 'hydor-' + 'c'.repeat(24) + '.md');
  fs.writeFileSync(recent, 'recent');
  captureEvent(hub, key, 'PostCompact', 0, 'Goal: prune.');
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(nested), false);
  assert.equal(fs.existsSync(path.join(digests, '2026')), false, 'emptied folders go too');
  assert.equal(fs.existsSync(recent), true, 'recent checkpoints stay');
  fs.writeFileSync(path.join(hub, '.sessions', 'config.json'), '{"enabled":false}');
  assert.equal(captureEvent(hub, key, 'PreCompact', 0, 'x'), null);
  assert.equal(latestEvent(hub, key), null);
  const unsafe = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-session-link-'));
  try {
    fs.symlinkSync(path.join(hub, '.sessions'), path.join(unsafe, '.sessions'));
    assert.throws(() => captureEvent(unsafe, key, 'PreCompact'), /Unsafe/);
  } finally { fs.rmSync(unsafe, { recursive: true, force: true }); }
  process.stdout.write('wiki session checkpoint tests passed\n');
} finally { fs.rmSync(hub, { recursive: true, force: true }); }
