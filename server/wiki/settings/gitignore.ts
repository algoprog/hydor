// Add a project's wiki to Git's ignore file without changing its index or existing ignore entries.
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../../git.ts';

/** Ignore a wiki below the project and report files Git already tracks. */
export async function ignoreProjectWiki(project: string, wiki: string, enabled: boolean): Promise<{ changed: boolean; tracked: boolean }> {
  if (!enabled) return { changed: false, tracked: false };
  const root = path.resolve(project);
  const target = path.resolve(wiki);
  const rel = path.relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel) || rel.includes('\n') || rel.includes('\r')) throw new Error('Wiki must be inside the project');
  const repo = await git(root, ['rev-parse', '--is-inside-work-tree']);
  const trackedResult = repo.ok ? await git(root, ['ls-files', '-z', '--', target]) : null;
  if (trackedResult && !trackedResult.ok) throw new Error('Cannot inspect tracked wiki files');
  const tracked = !!trackedResult?.out;
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
