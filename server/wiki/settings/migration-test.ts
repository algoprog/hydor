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
    const preview = previewWikiMigration(source, target);
    assert.equal(preview.conflicts.length, 1);
    const result = applyWikiMigration(preview, 'merge', policy);
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
    const result = applyWikiMigration(previewWikiMigration(source, target), 'replace');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.existsSync(path.join(target, 'wiki/target.md')), false);
    assert.equal(fs.readFileSync(path.join(result.targetBackup!, 'wiki/target.md'), 'utf8'), 'only target');
    result.rollback();
    assert.equal(fs.readFileSync(path.join(source, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), 'from target');
  }
  {
    const { source, target } = pair('changed');
    const preview = previewWikiMigration(source, target);
    fs.writeFileSync(path.join(source, 'wiki/source.md'), 'changed');
    assert.throws(() => applyWikiMigration(preview, 'merge'), /changed since/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
  }
  {
    const { source, target } = pair('rename-error');
    const preview = previewWikiMigration(source, target);
    const originalRename = fs.renameSync;
    // Simulate failure after the staged target was installed, before the source moved.
    fs.renameSync = ((from, to) => {
      if (String(from) === source) throw new Error('simulated source rename failure');
      return originalRename(from, to);
    }) as typeof fs.renameSync;
    try { assert.throws(() => applyWikiMigration(preview, 'replace'), /simulated source rename failure/); }
    finally { fs.renameSync = originalRename; }
    assert.equal(fs.readFileSync(path.join(source, 'wiki/conflict.md'), 'utf8'), 'from source');
    assert.equal(fs.readFileSync(path.join(target, 'wiki/conflict.md'), 'utf8'), 'from target');
  }
  {
    const { source, target } = pair('tie');
    fs.utimesSync(path.join(target, 'wiki/conflict.md'), 100, 100);
    assert.throws(() => applyWikiMigration(previewWikiMigration(source, target), 'merge', 'oldest'), /equal modification times/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
    assert.throws(() => previewWikiMigration(source, path.join(source, 'sub')), /overlap/);
  }
  {
    const { source, target } = pair('symbolic');
    fs.symlinkSync(path.join(source, 'wiki/source.md'), path.join(target, 'link'));
    assert.throws(() => previewWikiMigration(source, target), /Symbolic links/);
  }
  {
    const { source, target } = pair('no-target');
    fs.rmSync(target, { recursive: true });
    const result = applyWikiMigration(previewWikiMigration(source, target), 'merge', 'source');
    assert.equal(result.targetBackup, null);
    assert.equal(fs.readFileSync(path.join(target, 'wiki/source.md'), 'utf8'), 'only source');
    result.rollback();
    assert.ok(fs.existsSync(source)); assert.equal(fs.existsSync(target), false);
  }
  {
    const { source, target } = pair('registry');
    const registry = JSON.stringify({ wikis: { portable: { path: '<HUB>/topics/one' }, relative: { path: 'topics/two' }, absolute: { path: path.join(source, 'topics', 'three') }, external: { path: path.join(temp, 'other') } } });
    fs.writeFileSync(path.join(source, 'wikis.json'), registry);
    const result = applyWikiMigration(previewWikiMigration(source, target), 'merge', 'source');
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
    assert.throws(() => previewWikiMigration(source, target), /valid JSON/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
  }
  {
    const { source, target } = pair('external-relative');
    fs.writeFileSync(path.join(source, 'wikis.json'), JSON.stringify({ wikis: { external: { path: '../outside' } } }));
    assert.throws(() => applyWikiMigration(previewWikiMigration(source, target), 'merge', 'source'), /outside the source hub/);
    assert.ok(fs.existsSync(source)); assert.ok(fs.existsSync(target));
  }
  console.log('Wiki migration tests passed');
} finally {
  // Remove only this test's isolated temporary tree and its test backups.
  fs.rmSync(temp, { recursive: true, force: true });
}
