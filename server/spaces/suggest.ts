// Folders worth a space: those sessions worked in lately, or changed files in, that no space has yet. A
// session counts for the folder it ran in (picked on the start page) and, less, for each other folder whose
// files it changed; a folder inside a git repository counts as the repository. Recent sessions count more
// than old ones, so a project used often this month comes before one used once last spring. Folders the app
// makes itself (task folders, an app's runs, worktrees, its data), temporary ones, hidden ones and the home
// folder are left out, as are those you said are not a project ("Not a project").
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SpaceSuggestion } from '../../shared/spaces.ts';
import { WORK_DIR as APPS_WORK_DIR } from '../apps/runs.ts';
import { taskRoot } from '../assistants/store.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { WORKTREES_ROOT } from '../worktrees.ts';
import { allSpaces } from './index.ts';

const DAY = 86_400_000;
/** How far back sessions count. */
const WINDOW = 90 * DAY;
/** A session's weight halves every three weeks. */
const HALF_LIFE = 21 * DAY;
/** A folder whose files a session changed counts less than the one it ran in. */
const CHANGED = 0.6;
const HIDDEN_KEY = 'spaces.suggest.hidden';

const inside = (p: string, root: string) => p === root || p.startsWith(root.replace(/\/+$/, '') + '/');

export function hiddenSuggestions(db: DB): string[] {
  try {
    const v = JSON.parse(kvGet(db, HIDDEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** "Not a project": the folder is no longer suggested. */
export function hideSuggestion(db: DB, folder: string) {
  const p = path.resolve(folder);
  kvSet(db, HIDDEN_KEY, JSON.stringify([...new Set([p, ...hiddenSuggestions(db)])].slice(0, 500)));
}

export function spaceSuggestions(db: DB, o: { limit?: number; now?: number; home?: string } = {}): SpaceSuggestion[] {
  const { limit = 6, now = Date.now() } = o;
  const home = path.resolve(o.home ?? config.home);
  const covered = allSpaces(db).flatMap((s) => [s.folder, ...(s.folders ?? [])]);
  const made = [taskRoot(db), APPS_WORK_DIR, WORKTREES_ROOT, config.dataDir, os.tmpdir(), '/tmp', '/dev/shm']
    .filter(Boolean)
    .map((p) => path.resolve(p))
    // (not one the home folder is in)
    .filter((r) => !inside(home, r));
  const hidden = hiddenSuggestions(db);
  const exists = new Map<string, boolean>();
  const isDir = (p: string) => {
    let v = exists.get(p);
    if (v === undefined) {
      try {
        v = fs.statSync(p).isDirectory();
      } catch {
        v = false;
      }
      exists.set(p, v);
    }
    return v;
  };
  const roots = new Map<string, string>();
  /** The project a folder belongs to: the git repository it is in, else the folder itself. */
  const projectOf = (dir: string): string => {
    const known = roots.get(dir);
    if (known !== undefined) return known;
    let root = dir;
    for (let d = dir; d !== home && d !== path.dirname(d); d = path.dirname(d)) {
      if (fs.existsSync(path.join(d, '.git'))) {
        root = d;
        break;
      }
    }
    roots.set(dir, root);
    return root;
  };
  const wanted = (p: string) => {
    if (p === home || p === '/' || !inside(p, home)) return false;
    // ~/.config, ~/.claude…: the app's and other programs' own folders.
    if (
      path
        .relative(home, p)
        .split(path.sep)
        .some((seg) => seg.startsWith('.'))
    )
      return false;
    if (made.some((r) => inside(p, r)) || covered.some((r) => inside(p, r)) || hidden.includes(p)) return false;
    return isDir(p);
  };

  // Sessions of the last 90 days that are in no space, with the files they changed.
  const rows = db
    .prepare(
      `select s.key, s.cwd, s.updated_at as at, (select json_group_array(f.key) from json_each(s.state, '$.files') f) as files
       from sessions s left join app_sessions a on a.key = s.key
       where s.hidden = 0 and s.cwd is not null and s.updated_at > ? and json_extract(a.extra, '$.space') is null
       order by s.updated_at desc limit 2000`,
    )
    .all(now - WINDOW) as {
    key: string;
    cwd: string;
    at: number;
    files: string | null;
  }[];

  const tally = new Map<string, SpaceSuggestion & { score: number }>();
  for (const r of rows) {
    const weight = Math.pow(0.5, Math.max(0, now - r.at) / HALF_LIFE);
    const ran = projectOf(path.resolve(r.cwd));
    const hits = new Map<string, number>([[ran, 1]]);
    let files: string[] = [];
    try {
      files = r.files ? JSON.parse(r.files) : [];
    } catch {}
    for (const f of files) {
      if (typeof f !== 'string' || !f) continue;
      const dir = path.dirname(path.resolve(r.cwd, f));
      const p = projectOf(dir);
      if (!hits.has(p)) hits.set(p, CHANGED);
    }
    for (const [p, w] of hits) {
      if (!wanted(p)) continue;
      const t = tally.get(p) ?? {
        path: p,
        sessions: 0,
        changed: 0,
        lastAt: 0,
        score: 0,
      };
      t.sessions++;
      if (w < 1) t.changed++;
      t.lastAt = Math.max(t.lastAt, r.at);
      t.score += w * weight;
      tally.set(p, t);
    }
  }
  // A folder inside another suggested one adds to it rather than showing twice.
  const list = [...tally.values()].sort((a, b) => a.path.length - b.path.length);
  const kept: (SpaceSuggestion & { score: number })[] = [];
  for (const t of list) {
    const outer = kept.find((k) => inside(t.path, k.path));
    if (outer) {
      outer.score += t.score;
      outer.sessions += t.sessions;
      outer.changed += t.changed;
      outer.lastAt = Math.max(outer.lastAt, t.lastAt);
    } else kept.push(t);
  }
  return kept
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...t }) => t);
}
