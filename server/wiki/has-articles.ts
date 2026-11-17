// Whether a wiki has an article yet: a file wiki/**/*.md that is not an area's hub (wiki/areas/) and not a redirect. Cheap
// enough for every session start: an empty wiki is a readdir, a wiki with articles stops at the first one, and a "yes" is kept
// until the wiki/ folder's modified time changes (or the article it found is gone).
import fs from 'node:fs';
import path from 'node:path';
import { redirectOf } from './core.ts';

const seen = new Map<string, { mtime: number; article: string | null }>();

/** The first article under `dir` (its full path), or null. */
function scan(dir: string, top: boolean): string | null {
  let list: fs.Dirent[];
  try {
    list = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of list) {
    if (e.name.startsWith('.') || e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (top && e.name === 'areas') continue;
      const found = scan(path.join(dir, e.name), false);
      if (found) return found;
    } else if (e.isFile() && e.name.endsWith('.md')) {
      try {
        if (redirectOf(fs.readFileSync(path.join(dir, e.name), 'utf8').slice(0, 4000)) == null) return path.join(dir, e.name);
      } catch {
        /* unreadable: not counted */
      }
    }
  }
  return null;
}

/** Whether the wiki at `root` (null: none yet) has at least one article. */
export function wikiHasArticles(root: string | null): boolean {
  if (!root) return false;
  const dir = path.join(root, 'wiki');
  let mtime: number;
  try {
    mtime = fs.statSync(dir).mtimeMs;
  } catch {
    seen.delete(root);
    return false;
  }
  // A "yes" holds while the folder is as it was and the article found is still there.
  const hit = seen.get(root);
  if (hit?.article && hit.mtime === mtime && fs.existsSync(hit.article)) return true;
  const article = scan(dir, true);
  seen.set(root, { mtime, article });
  return !!article;
}
