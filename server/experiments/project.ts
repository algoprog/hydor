// Which project (a Space) a run belongs to when it is submitted without one: the project of the session that starts it
// (its extra.space, else the one its folder is in), else the project of the folder it is started for (a run started
// from the page: where it runs; a score's runs: the evaluation's folder). A shared project's Runs tab and the
// pre-submission check find a project's runs by it.
import path from 'node:path';
import { isConfidential } from '../../shared/confidential.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { projectOfFolder } from '../spaces/found.ts';
import { allSpaces } from '../spaces/index.ts';

/** The folder a session works in: its worktree's main checkout, else where it runs. */
function sessionFolder(db: DB, key: string): string | undefined {
  for (const sql of [
    `select coalesce(case when json_valid(worktree) then nullif(json_extract(worktree, '$.repo'), '') end, nullif(cwd, '')) as dir from app_sessions where key = ?`,
    'select cwd as dir from sessions where key = ?',
  ]) {
    try {
      const dir = (db.prepare(sql).get(key) as { dir: string | null } | undefined)?.dir;
      if (dir) return dir;
    } catch {
      /* a database without the table (a test's) */
    }
  }
  return undefined;
}

/**
 * The project of a run: `given` when it came with one. None for a confidential session's runs, which stay out of what a
 * project shares with others.
 */
export function projectFor(db: DB, o: { given?: string; session?: string; folder?: string }): string | undefined {
  let extra: ReturnType<typeof sessionExtra> = {};
  try {
    if (o.session) extra = sessionExtra(db, o.session);
  } catch {}
  if (isConfidential(extra)) return undefined;
  if (o.given) return o.given;
  const spaces = allSpaces(db);
  if (!spaces.length) return undefined;
  if (typeof extra.space === 'string' && spaces.some((s) => s.id === extra.space)) return extra.space;
  for (const dir of [o.session ? sessionFolder(db, o.session) : undefined, o.folder]) {
    const found = dir && path.isAbsolute(dir) ? projectOfFolder(spaces, dir, config.home) : undefined;
    if (found) return found.id;
  }
  return undefined;
}
