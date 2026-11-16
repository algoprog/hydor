// Verify migrations using only disposable source and target directories.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyWikiMigration, previewWikiMigration, type WikiConflict } from './migration.ts';

const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-wiki-migration-')));
/** Create distinct trees with a conflicting and a unique file on each side. */
function pair(name: string) {
  const parent = path.join(temp, name), source = path.join(parent, 'source'), target = path.join(parent, 'target');
  fs.mkdirSync(path.join(source, 'wiki'), { recursive: true });
  fs.mkdirSync(path.join(target, 'wiki'), { recursive: true });
  fs.writeFileSync(path.join(source, 'wiki', 'conflict.md'), 'from source');
  fs.writeFileSync(path.join(target, 'wiki', 'conflict.md'), 'from target');
  fs.writeFileSync(path.join(source, 'wiki', 'source.md'), 'only source');
  fs.writeFileSync(path.join(target, 'wiki', 'target.md'), 'only target');
  fs.utimesSync(path.join(source, 'wiki', 'conflict.md'), 100, 100);
  fs.utimesSync(path.join(target, 'wiki', 'conflict.md'), 200, 200);
  return { source, target };
}
try {
  for (const policy of ['source', 'target', 'oldest'] as WikiConflict[]) {
    const { source, target } = pair(policy);
    const preview = await previewWikiMigration(source, target);
    assert.equal(preview.conflicts.length, 1);
    const result = await applyWikiMigration(preview, 'merge', policy);
    assert.equal(fs.existsSync(source), false);
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), policy === 'target' ? 'from target' : 'from source');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/source.md'), 'utf8'), 'only source');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/target.md'), 'utf8'), 'only target');
    assert.equal(fs.readFileSync(path.join(result.sourceBackup, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.readFileSync(path.join(result.targetBackup!, 'wiki/conflict.md'), 'utf8'), 'from target');
    assert.ok(!result.sourceBackup.startsWith(source + path.sep));
    assert.ok(!result.targetBackup!.startsWith(target + path.sep));
  }
  {
    const { source, target } = pair('replace');
    const result = await applyWikiMigration(await previewWikiMigration(source, target), 'replace');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.existsSync(path.join(target, 'wiki/target.md')), false);
    assert.equal(fs.readFileSync(path.join(result.targetBackup!, 'wiki/target.md'), 'utf8'), 'only target');
    result.rollback();
    assert.equal(fs.readFileSync(path.join(source, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), 'from target');
  }
  {
    const { source, target } = pair('changed');
    const preview = await previewWikiMigration(source, target);
    fs.writeFileSync(path.join(source, 'wiki/source.md'), 'changed');
    await assert.rejects(async () => await applyWikiMigration(preview, 'merge'), /changed since/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
  }
  {
    const { source, target } = pair('rename-error');
    const preview = await previewWikiMigration(source, target);
    const originalRename = fs.renameSync;
    // Simulate failure after the staged target was installed, before the source moved.
    fs.renameSync = ((from, to) => {
      if (String(from) === source) throw new Error('simulated source rename failure');
      return originalRename(from, to);
    }) as typeof fs.renameSync;
    try { await assert.rejects(async () => await applyWikiMigration(preview, 'replace'), /simulated source rename failure/); }
    finally { fs.renameSync = originalRename; }
    assert.equal(fs.readFileSync(path.join(source, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), 'from target');
  }
  {
    const { source, target } = pair('tie');
    fs.utimesSync(path.join(target, 'wiki/conflict.md'), 100, 100);
    await assert.rejects(async () => await applyWikiMigration(await previewWikiMigration(source, target), 'merge', 'oldest'), /equal modification times/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
    await assert.rejects(async () => await previewWikiMigration(source, path.join(source, 'sub')), /overlap/);
  }
  {
    const { source, target } = pair('symbolic');
    fs.symlinkSync(path.join(source, 'wiki/source.md'), path.join(target, 'link'));
    await assert.rejects(async () => await previewWikiMigration(source, target), /Symbolic links/);
  }
  {
    const { source, target } = pair('no-target');
    fs.rmSync(target, { recursive: true });
    const result = await applyWikiMigration(await previewWikiMigration(source, target), 'merge', 'source');
    assert.equal(result.targetBackup, null);
    assert.equal(fs.readFileSync(path.join(target, 'wiki/source.md'), 'utf8'), 'only source');
    result.rollback();
    assert.ok(fs.existsSync(source)); assert.equal(fs.existsSync(target), false);
  }
  {
    const { source, target } = pair('registry');
    const registry = JSON.stringify({ wikis: { portable: { path: '<HUB>/topics/one' }, relative: { path: 'topics/two' }, absolute: { path: path.join(source, 'topics', 'three') }, external: { path: path.join(temp, 'other') } } });
    fs.writeFileSync(path.join(source, 'wikis.json'), registry);
    const result = await applyWikiMigration(await previewWikiMigration(source, target), 'merge', 'source');
    const read = JSON.parse(fs.readFileSync(path.join(target, 'wikis.json'), 'utf8'));
    assert.equal(read.wikis.portable.path, '<HUB>/topics/one');
    assert.equal(read.wikis.relative.path, 'topics/two');
    assert.equal(read.wikis.absolute.path, path.join(target, 'topics/three'));
    assert.equal(read.wikis.external.path, path.join(temp, 'other'));
    assert.equal(fs.readFileSync(path.join(result.sourceBackup, 'wikis.json'), 'utf8'), registry);
  }
  {
    const { source, target } = pair('bad-registry');
    fs.writeFileSync(path.join(source, 'wikis.json'), '{broken');
    await assert.rejects(async () => await previewWikiMigration(source, target), /valid JSON/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
  }
  {
    const { source, target } = pair('external-relative');
    fs.writeFileSync(path.join(source, 'wikis.json'), JSON.stringify({ wikis: { external: { path: '../outside' } } }));
    await assert.rejects(async () => await applyWikiMigration(await previewWikiMigration(source, target), 'merge', 'source'), /outside the source hub/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
  }
  {
    // Session checkpoints, locks and backups are not wiki contents: writing them neither changes the fingerprint nor is moved.
    const { source, target } = pair('transient');
    const before = await previewWikiMigration(source, target);
    fs.mkdirSync(path.join(source, '.sessions', 'digests'), { recursive: true });
    fs.writeFileSync(path.join(source, '.sessions', 'digests', 'hydor-a.md'), 'checkpoint');
    fs.mkdirSync(path.join(source, '.hydor-wiki-write.lock'));
    fs.mkdirSync(path.join(source, '.hydor-wiki-backup-1-source'));
    fs.mkdirSync(path.join(source, '.archive'));
    fs.writeFileSync(path.join(source, '.archive', 'old.md'), 'kept');
    const during = await previewWikiMigration(source, target);
    assert.equal(during.sourceTree.files.some((f) => f.path.startsWith('.sessions') || f.path.startsWith('.hydor-')), false);
    // User-made hidden folders (.archive) still count and are moved.
    assert.ok(during.sourceTree.files.some((f) => f.path === '.archive/old.md'));
    const same = await previewWikiMigration(source, target);
    // A session writing another checkpoint between preview and apply does not fail the move.
    fs.writeFileSync(path.join(source, '.sessions', 'digests', 'hydor-b.md'), 'another');
    const result = await applyWikiMigration(same, 'merge', 'source');
    assert.equal(fs.readFileSync(path.join(target, '.archive', 'old.md'), 'utf8'), 'kept');
    assert.equal(fs.existsSync(path.join(target, '.sessions')), false);
    assert.ok(fs.existsSync(path.join(result.sourceBackup, '.sessions', 'digests', 'hydor-b.md')), 'the old folder is kept whole as the backup');
    assert.notEqual(before.fingerprint, during.fingerprint, 'only .archive changed the fingerprint');
  }
  {
    // Hashing yields to the event loop between files, so the server keeps answering.
    const { source, target } = pair('yield');
    for (let i = 0; i < 40; i++) fs.writeFileSync(path.join(source, 'wiki', `f${i}.md`), `file ${i}`);
    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 0);
    await previewWikiMigration(source, target);
    clearInterval(timer);
    assert.ok(ticks > 5, `the event loop ran while hashing (${ticks} ticks)`);
  }
  console.log('Wiki migration tests passed');
} finally {
  // Remove only this test's isolated temporary tree and its test backups.
  fs.rmSync(temp, { recursive: true, force: true });
}
