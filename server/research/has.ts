// Which projects have research in them, for the project list: they get a Research tab (project-research.ts has the page).
import path from 'node:path';
import { isGroup, type Space } from '../../shared/spaces.ts';
import type { DB } from '../db.ts';
import { listEvaluations } from '../experiments/evaluations.ts';
import { awayIds, tables as runTables } from '../experiments/records.ts';
import { repoRoot } from '../memory/store.ts';

/** Whether a folder is the directory or inside it. */
export const insideOf = (p: string, dir: string) => {
  const a = path.resolve(p);
  const b = path.resolve(dir);
  return a === b || a.startsWith(b + path.sep);
};

/**
 * The projects with research in them: an experiment run whose folder is the project's folder or inside it, a finding of
 * the project, or an evaluation (and so an evolution) in its folder. A group has none of its own.
 */
export function researchProjects(db: DB, spaces: Space[]): Set<string> {
  const out = new Set<string>();
  const plain = spaces.filter((s) => !isGroup(s) && s.folder);
  if (!plain.length) return out;
  const covers = (s: Space, cwds: string[]) => cwds.some((c) => insideOf(c, s.folder));
  let runs: string[] = [];
  /** Projects some run names (a run knows its project when it is submitted). */
  const named = new Set<string>();
  try {
    runTables(db);
    // Trials of a command ("Try it first") are no research, nor are runs that score an evaluation (it has the evaluation),
    // nor what was archived.
    const plain = `not (instr(spec, '"HYDOR_TRY":') > 0 and instr(spec, '"try"') > 0) and not (instr(spec, '"HYDOR_EVALUATION":') > 0 and instr(spec, '"evaluation"') > 0) and id not in (select value from json_each(?))`;
    const away = JSON.stringify([...awayIds(db)]);
    runs = (db.prepare(`select distinct cwd from exp_runs where cwd is not null and ${plain}`).all(away) as { cwd: string }[]).map((r) => r.cwd);
    for (const r of db.prepare(`select distinct project from exp_runs where project is not null and ${plain}`).all(away) as { project: string }[]) named.add(r.project);
  } catch {}
  let evals: string[] = [];
  try {
    evals = listEvaluations(db).map((e) => e.cwd);
  } catch {}
  let found = new Set<string>();
  try {
    found = new Set((db.prepare("select distinct scope_key from memory_entries where scope = 'repo' and kind = 'finding' and status = 'active'").all() as { scope_key: string }[]).map((r) => r.scope_key));
  } catch {}
  for (const s of plain) if (named.has(s.id) || covers(s, runs) || covers(s, evals) || (found.size && found.has(repoRoot(s.folder) ?? s.folder))) out.add(s.id);
  return out;
}
