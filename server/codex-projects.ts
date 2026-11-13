// The names Codex gives the folders of its projects, and the projects themselves. Codex keeps its projects (a name and the
// folders it works in) in its state database (<codex home>/state_N.sqlite); the Codex app also makes a folder for each of
// your ChatGPT projects, named only by its id (~/.codex/.chatgpt-projects/g-p-…). The sidebar names those folders by
// these, and the app makes a project of each Codex project you have worked in (server/spaces/found.ts).
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

interface CodexProject {
  name: string;
  roots: string[];
}

const cache = new Map<string, { mtime: number; names: Record<string, string>; projects: CodexProject[] }>();

/** What one state database holds (read-only), kept until the file changes. */
function readIn(file: string): { names: Record<string, string>; projects: CodexProject[] } {
  let mtime = 0;
  try {
    mtime = fs.statSync(file).mtimeMs;
    const wal = `${file}-wal`;
    if (fs.existsSync(wal)) mtime = Math.max(mtime, fs.statSync(wal).mtimeMs);
  } catch {
    return { names: {}, projects: [] };
  }
  const hit = cache.get(file);
  if (hit && hit.mtime === mtime) return hit;
  const names: Record<string, string> = {};
  const projects: CodexProject[] = [];
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    const rows = db.prepare('select p.id as id, p.name as name, r.path as path from projects p join project_roots r on r.project_id = p.id order by p.position, r.position').all() as { id: string; name: string; path: string }[];
    const byId = new Map<string, CodexProject>();
    for (const r of rows) {
      const dir = r.path?.replace(/\/+$/, '');
      const name = r.name?.trim();
      if (!dir || !name) continue;
      if (name !== path.basename(dir)) names[dir] = name;
      let p = byId.get(r.id);
      if (!p) {
        p = { name, roots: [] };
        byId.set(r.id, p);
        projects.push(p);
      }
      if (!p.roots.includes(dir)) p.roots.push(dir);
    }
  } catch {
    /* an older Codex without projects, or a database busy or locked */
  } finally {
    db?.close();
  }
  const entry = { mtime, names, projects };
  cache.set(file, entry);
  return entry;
}

/** Folder → the name of the Codex project it belongs to, for every Codex account (only names that differ from the folder's). */
export function codexFolderNames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const home of agentRoots.codexHomes) {
    const f = stateDb(home);
    if (f) Object.assign(out, readIn(f).names);
  }
  return out;
}

/** Every Codex project, for every Codex account: its name and the folders it works in, the first its own. */
export function codexProjects(): { name: string; roots: string[] }[] {
  const out: CodexProject[] = [];
  for (const home of agentRoots.codexHomes) {
    const f = stateDb(home);
    if (f) out.push(...readIn(f).projects.map((p) => ({ name: p.name, roots: [...p.roots] })));
  }
  return out;
}
