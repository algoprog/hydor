// Plan and move a wiki without discarding either original tree or following symbolic links.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type WikiConflict = 'source' | 'target' | 'oldest';
export type WikiMigrationMode = 'merge' | 'replace';
export interface WikiMigrationFile { path: string; size: number; mtimeMs: number; sha256: string }
interface Tree { exists: boolean; files: WikiMigrationFile[]; directories: string[] }
export interface WikiMigrationPreview {
  source: string;
  target: string;
  sourceTree: Tree;
  targetTree: Tree;
  conflicts: { path: string; sourceMtimeMs: number; targetMtimeMs: number; identical: boolean }[];
  fingerprint: string;
}
export interface WikiMigrationResult {
  sourceBackup: string;
  targetBackup: string | null;
  /** Restore the original trees if the caller cannot persist the new setting. */
  rollback(): void;
}
const MAX_FILES = 50_000;
const MAX_BYTES = 4 * 1024 * 1024 * 1024;

/** Read a registry without accepting malformed or unexpectedly large JSON. */
function registry(root: string): unknown {
  const file = path.join(root, 'wikis.json');
  if (!fs.existsSync(file)) return null;
  if (fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('Wiki registry cannot be read safely');
  try {
    const result: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('not an object');
    return result;
  } catch { throw new Error('Wiki registry is not valid JSON'); }
}

/** Rebase only source-root registry paths; keep external absolute and portable hub paths intact. */
function rebaseRegistry(stage: string, source: string, target: string): void {
  const data = registry(stage);
  if (!data) return;
  let changed = false;
  const inside = (root: string, p: string) => p === root || p.startsWith(root + path.sep);
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    for (const [key, item] of Object.entries(value)) {
      if (key === 'path' && typeof item === 'string') {
        if (item.startsWith('<HUB>')) continue;
        const expanded = item === '~' || item.startsWith('~/') ? path.join(os.homedir(), item.slice(1)) : item;
        if (!path.isAbsolute(expanded)) {
          // A path outside the hub could otherwise silently point to a different external wiki.
          if (!inside(source, path.resolve(source, expanded))) throw new Error('A relative wiki registry path points outside the source hub');
          continue;
        }
        const resolved = path.resolve(expanded);
        if (inside(source, resolved)) {
          (value as Record<string, unknown>)[key] = path.join(target, path.relative(source, resolved));
          changed = true;
        }
      } else visit(item);
    }
  };
  visit(data);
  if (changed) fs.writeFileSync(path.join(stage, 'wikis.json'), `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

/** Reject symbolic links in every existing ancestor, not only inside the wiki. */
function noLinks(value: string): void {
  const full = path.resolve(value);
  let current = path.parse(full).root;
  for (const part of full.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Symbolic links cannot be moved'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
}

/** Hash a file incrementally so a large source does not exhaust process memory. */
function hashFile(file: string): string {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile()) throw new Error('Only regular files can be moved');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let pos = 0;
    for (;;) {
      const n = fs.readSync(fd, buffer, 0, buffer.length, pos);
      if (!n) break;
      hash.update(buffer.subarray(0, n));
      pos += n;
    }
    const after = fs.fstatSync(fd);
    if (before.size !== pos || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('A wiki file changed while it was read');
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

/** Snapshot a tree including hidden files and empty folders without inspecting their content semantically. */
function inspect(root: string): Tree {
  noLinks(root);
  if (!fs.existsSync(root)) return { exists: false, files: [], directories: [] };
  if (!fs.lstatSync(root).isDirectory()) throw new Error('A wiki path is not a directory');
  const files: WikiMigrationFile[] = [];
  const directories: string[] = [];
  let bytes = 0;
  const walk = (dir: string, rel: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const sub = rel ? `${rel}/${entry.name}` : entry.name;
      const file = path.join(dir, entry.name);
      const st = fs.lstatSync(file);
      if (st.isSymbolicLink()) throw new Error('Symbolic links cannot be moved');
      if (st.isDirectory()) { directories.push(sub); walk(file, sub); }
      else if (st.isFile()) {
        bytes += st.size;
        if (files.length >= MAX_FILES || bytes > MAX_BYTES) throw new Error('The wiki is too large for this migration');
        files.push({ path: sub, size: st.size, mtimeMs: st.mtimeMs, sha256: hashFile(file) });
      } else throw new Error('Only regular files and folders can be moved');
    }
  };
  walk(root, '');
  return { exists: true, files, directories };
}

/** List byte-level conflicts and produce a fingerprint that binds approval to the inspected trees. */
export function previewWikiMigration(source: string, target: string): WikiMigrationPreview {
  if (!path.isAbsolute(source) || !path.isAbsolute(target) || /[\0\r\n]/.test(source + target)) throw new Error('Wiki paths must be absolute');
  source = path.resolve(source); target = path.resolve(target);
  const overlap = (a: string, b: string) => b === a || b.startsWith(a + path.sep);
  if (overlap(source, target) || overlap(target, source)) throw new Error('Wiki paths must not overlap');
  // Real paths also catch case aliases on case-insensitive filesystems.
  noLinks(source); noLinks(target);
  if (fs.existsSync(source) && fs.existsSync(path.dirname(target))) {
    const realSource = fs.realpathSync(source);
    const realTarget = fs.existsSync(target) ? fs.realpathSync(target) : path.join(fs.realpathSync(path.dirname(target)), path.basename(target));
    if (overlap(realSource, realTarget) || overlap(realTarget, realSource)) throw new Error('Wiki paths must not overlap');
  }
  const sourceTree = inspect(source), targetTree = inspect(target);
  if (!sourceTree.exists) throw new Error('Source wiki does not exist');
  registry(source);
  if (targetTree.exists) registry(target);
  const byTarget = new Map(targetTree.files.map((f) => [f.path, f]));
  const sourceDirectories = new Set(sourceTree.directories), targetDirectories = new Set(targetTree.directories);
  if (sourceTree.files.some((f) => targetDirectories.has(f.path)) || targetTree.files.some((f) => sourceDirectories.has(f.path))) throw new Error('File and folder names conflict');
  const conflicts = sourceTree.files.flatMap((s) => {
    const t = byTarget.get(s.path);
    return t ? [{ path: s.path, sourceMtimeMs: s.mtimeMs, targetMtimeMs: t.mtimeMs, identical: s.sha256 === t.sha256 }] : [];
  });
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ source, target, sourceTree, targetTree })).digest('hex');
  return { source, target, sourceTree, targetTree, conflicts, fingerprint };
}

/** Copy the selected tree and verify exact bytes; preserve modification time for the oldest rule. */
function copyFile(from: string, to: string, expected: WikiMigrationFile): void {
  fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
  noLinks(from); noLinks(path.dirname(to));
  if (hashFile(from) !== expected.sha256) throw new Error('A wiki file changed after the preview');
  fs.copyFileSync(from, to);
  if (hashFile(to) !== expected.sha256 || hashFile(from) !== expected.sha256) throw new Error('Wiki copy verification failed');
  fs.utimesSync(to, expected.mtimeMs / 1000, expected.mtimeMs / 1000);
}

/** Install the approved result; originals remain as full backups and can be restored if settings fail. */
export function applyWikiMigration(preview: WikiMigrationPreview, mode: WikiMigrationMode, conflict: WikiConflict = 'target'): WikiMigrationResult {
  if (!['merge', 'replace'].includes(mode) || !['source', 'target', 'oldest'].includes(conflict)) throw new Error('Invalid migration choice');
  const current = previewWikiMigration(preview.source, preview.target);
  if (current.fingerprint !== preview.fingerprint) throw new Error('Wiki contents changed since the preview');
  const source = current.source, target = current.target;
  if (!fs.existsSync(path.dirname(target)) || !fs.statSync(path.dirname(target)).isDirectory()) throw new Error('The target parent folder does not exist');
  noLinks(path.dirname(target));
  if (mode === 'merge' && conflict === 'oldest' && current.conflicts.some((c) => !c.identical && c.sourceMtimeMs === c.targetMtimeMs)) throw new Error('Different files have equal modification times; choose source or target');
  const id = crypto.randomBytes(12).toString('hex');
  const backupSource = path.join(path.dirname(source), `.hydor-wiki-backup-${id}-source`);
  const backupTarget = path.join(path.dirname(target), `.hydor-wiki-backup-${id}-target`);
  const staging = fs.mkdtempSync(path.join(path.dirname(target), '.hydor-wiki-stage-'));
  let targetMoved = false, installed = false, sourceMoved = false;
  try {
    const targetMap = new Map(current.targetTree.files.map((f) => [f.path, f]));
    if (mode === 'merge') {
      for (const dir of current.targetTree.directories) fs.mkdirSync(path.join(staging, dir), { recursive: true, mode: 0o700 });
      for (const file of current.targetTree.files) copyFile(path.join(target, file.path), path.join(staging, file.path), file);
    }
    for (const dir of current.sourceTree.directories) fs.mkdirSync(path.join(staging, dir), { recursive: true, mode: 0o700 });
    for (const file of current.sourceTree.files) {
      const existing = targetMap.get(file.path);
      const chooseSource = mode === 'replace' || !existing || (conflict === 'source') || (conflict === 'oldest' && file.mtimeMs < existing.mtimeMs);
      if (chooseSource) copyFile(path.join(source, file.path), path.join(staging, file.path), file);
    }
    // Only the staged registry changes; full source and destination backups retain their original bytes.
    rebaseRegistry(staging, source, target);
    if (previewWikiMigration(source, target).fingerprint !== current.fingerprint) throw new Error('Wiki contents changed during migration');
    if (fs.existsSync(backupSource) || fs.existsSync(backupTarget)) throw new Error('Backup path already exists');
    if (current.targetTree.exists) {
      fs.renameSync(target, backupTarget); targetMoved = true;
      if (JSON.stringify(inspect(backupTarget)) !== JSON.stringify(current.targetTree)) throw new Error('Target changed while it was being moved');
    }
    fs.renameSync(staging, target); installed = true;
    fs.renameSync(source, backupSource); sourceMoved = true;
    if (JSON.stringify(inspect(backupSource)) !== JSON.stringify(current.sourceTree)) throw new Error('Source changed while it was being moved');
    return {
      sourceBackup: backupSource,
      targetBackup: targetMoved ? backupTarget : null,
      rollback() {
        // Fail closed if another writer has already occupied the old source path.
        if (fs.existsSync(source)) throw new Error(`Cannot restore source; backup is at ${backupSource}`);
        fs.renameSync(backupSource, source);
        const displaced = `${staging}-rollback`;
        fs.renameSync(target, displaced);
        if (targetMoved) fs.renameSync(backupTarget, target);
        fs.rmSync(displaced, { recursive: true, force: true });
      },
    };
  } catch (error) {
    // Restore original paths where possible; never delete either original tree.
    try {
      if (sourceMoved && !fs.existsSync(source)) fs.renameSync(backupSource, source);
      if (installed) fs.renameSync(target, staging);
      if (targetMoved && !fs.existsSync(target)) fs.renameSync(backupTarget, target);
      if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    } catch {
      throw new Error(`Migration could not be rolled back automatically; inspect ${backupSource}, ${backupTarget} and ${staging}`);
    }
    throw error;
  }
}
