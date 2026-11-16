// Checkpoints are distinct from periodic capture and never include supplied session identifiers.
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
  const pre = captureEvent(hub, key, 'PreCompact', 0, 'Goal: finish the feature. Password: hunter22. Contact a.person@example.com.');
  const post = captureEvent(hub, key, 'PostCompact');
  const periodic = captureEvent(hub, key, 'PostToolUse', 50);
  assert.equal(pre?.trigger, 'pre-compact');
  assert.equal(post?.trigger, 'post-compact');
  assert.equal(periodic?.trigger, 'periodic');
  assert.ok(pre && post && periodic);
  assert.notEqual(pre.path, post.path);
  assert.match(fs.readFileSync(pre.path, 'utf8'), /capture_trigger: "pre-compact"/);
  assert.doesNotMatch(fs.readFileSync(pre.path, 'utf8'), /private-session-identifier/);
  assert.doesNotMatch(fs.readFileSync(pre.path, 'utf8'), /hunter22|a.person@example.com/);
  assert.match(fs.readFileSync(pre.path, 'utf8'), /finish the feature/);
  assert.ok(latestEvent(hub, key));
  assert.equal(latestEvent(hub, 'other-session'), null);
  fs.writeFileSync(path.join(hub, '.sessions', 'config.json'), '{"enabled":false}');
  assert.equal(captureEvent(hub, key, 'Stop'), null);
  assert.equal(latestEvent(hub, key), null);
  const unsafe = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-session-link-'));
  try {
    fs.symlinkSync(path.join(hub, '.sessions'), path.join(unsafe, '.sessions'));
    assert.throws(() => captureEvent(unsafe, key, 'PreCompact'), /Unsafe/);
  } finally { fs.rmSync(unsafe, { recursive: true, force: true }); }
  process.stdout.write('wiki session checkpoint tests passed\n');
} finally { fs.rmSync(hub, { recursive: true, force: true }); }
