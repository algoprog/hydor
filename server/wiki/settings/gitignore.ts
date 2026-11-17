// Add a project's local wiki folder to Git's ignore file when enabled, only in a Git repository.
// Never change Git's index or existing ignore entries.
import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../../db.ts';
import { git } from '../../git.ts';
import { spaceById } from '../../spaces/index.ts';
import { wikiSettings } from './settings.ts';

/** Ignore a wiki below the project and report files Git already tracks. Outside a Git repository nothing is written. */
export async function ignoreProjectWiki(project: string, wiki: string, enabled: boolean): Promise<{ changed: boolean; tracked: boolean }> {
  if (!enabled) return { changed: false, tracked: false };
  const root = path.resolve(project);
  const target = path.resolve(wiki);
  const rel = path.relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel) || rel.includes('\n') || rel.includes('\r')) throw new Error('Wiki must be inside the project');
  const repo = await git(root, ['rev-parse', '--is-inside-work-tree']);
  // No .gitignore is made where there is no repository to read it.
  if (!repo.ok || repo.out.trim() !== 'true') return { changed: false, tracked: false };
  const trackedResult = await git(root, ['ls-files', '-z', '--', target]);
  if (!trackedResult.ok) throw new Error('Cannot inspect tracked wiki files');
  const tracked = !!trackedResult.out;
  const filename = path.join(root, '.gitignore');
  if (fs.existsSync(filename) && fs.lstatSync(filename).isSymbolicLink()) throw new Error('The ignore file is a symbolic link');
  const original = fs.existsSync(filename) ? fs.readFileSync(filename, 'utf8') : '';
  // A rooted path prevents matching an unrelated folder with the same name deeper in the project.
  const line = '/' + rel.split(path.sep).join('/').replace(/[\\*?[\]]/g, '\\$&').replace(/ $/, '\\ ') + '/';
  if (original.split(/\r?\n/).includes(line)) return { changed: false, tracked };
  const separator = original && !original.endsWith('\n') ? '\n' : '';
  fs.appendFileSync(filename, separator + line + '\n', { encoding: 'utf8', mode: 0o600 });
  return { changed: true, tracked };
}

/**
 * Guard the actual project-local wiki root, including an explicit binding, while the setting is enabled.
 * A shared or hub wiki outside the project is not added to its ignore file.
 */
export async function guardWikiFolder(db: DB, space: string | null, root: string): Promise<{ changed: boolean; tracked: boolean } | undefined> {
  const settings = wikiSettings(db);
  const folder = space ? spaceById(db, space)?.folder : undefined;
  if (!folder || !settings.gitIgnore) return undefined;
  let base: string;
  let target: string;
  try { base = fs.realpathSync(folder); target = fs.realpathSync(root); } catch { return undefined; }
  const rel = path.relative(base, target);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return undefined;
  return ignoreProjectWiki(base, target, true);
}

/** Apply the same guard to a pre-existing wiki in an unregistered working folder. */
export async function guardUnregisteredWikiFolder(db: DB, cwd: string, root: string): Promise<{ changed: boolean; tracked: boolean } | undefined> {
  if (!wikiSettings(db).gitIgnore) return undefined;
  let base: string;
  let target: string;
  try { base = fs.realpathSync(cwd); target = fs.realpathSync(root); } catch { return undefined; }
  const rel = path.relative(base, target);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) return undefined;
  return ignoreProjectWiki(base, target, true);
}
