// The names Codex gives the folders of its projects. Codex keeps its projects (a name and the folders it works in)
// in its state database (<codex home>/state_N.sqlite); the Codex app also makes a folder for each of your ChatGPT
// projects, named only by its id (~/.codex/.chatgpt-projects/g-p-…). The sidebar names those folders by these.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { agentRoots } from './config.ts';

/** The newest state database in a Codex home (state_5.sqlite today), if there is one. */
function stateDb(home: string): string | undefined {
  let best: { n: number; f: string } | undefined;
  try {
    for (const f of fs.readdirSync(home)) {
      const m = /^state_(\d+)\.sqlite$/.exec(f);
      if (m && (!best || Number(m[1]) > best.n)) best = { n: Number(m[1]), f: path.join(home, f) };
    }
  } catch {
    /* no such home */
  }
  return best?.f;
}

const cache = new Map<string, { mtime: number; names: Record<string, string> }>();

function namesIn(file: string): Record<string, string> {
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
    const wal = `${file}-wal`;
    if (fs.existsSync(wal)) mtime = Math.max(mtime, fs.statSync(wal).mtimeMs);
  } catch {
    return {};
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit.names;
  const names: Record<string, string> = {};
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const rows = db.prepare('select r.path as path, p.name as name from project_roots r join projects p on p.id = r.project_id').all() as { path: string; name: string }[];
    for (const r of rows) {
      const dir = r.path?.replace(/\/+$/, '');
      const name = r.name?.trim();
      if (dir && name && name !== path.basename(dir)) names[dir] = name;
    }
  } catch {
    /* an older Codex without projects, or a database busy or locked */
  } finally {
    db?.close();
  }
  cache.set(file, { mtime, names });
  return names;
}

/** Folder → the name of the Codex project it belongs to, for every Codex account (only names that differ from the folder's). */
export function codexFolderNames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const home of agentRoots.codexHomes) {
    const f = stateDb(home);
    if (f) Object.assign(out, namesIn(f));
  }
  return out;
}
