// The findings an experiment's page shows: those of any project whose evidence names one of the experiment's runs, or a
// results table made of them. A replaced finding is no longer kept as a live note, so it does not show.
import { type ExperimentFinding } from '../../shared/experiments.ts';
import type { DB } from '../db.ts';
import { entries, repoRoot } from '../memory/store.ts';
import { allSpaces } from '../spaces/index.ts';
import { getRun, getTable, okId } from './records.ts';

/** The findings by experiment (a run's group), the newest first. */
export function findingsByExperiment(db: DB): Map<string, ExperimentFinding[]> {
  const out = new Map<string, ExperimentFinding[]>();
  const list = entries(db, { scope: 'repo', kinds: ['finding'], live: Date.now(), limit: 5000 });
  if (!list.length) return out;
  const groupOf = new Map<string, string | undefined>();
  const group = (id: string) => {
    if (!groupOf.has(id)) groupOf.set(id, okId(id) ? getRun(db, id)?.group : undefined);
    return groupOf.get(id);
  };
  // The project (space) of a memory's folder, looked up once for each.
  let projects: Map<string, string> | undefined;
  const projectOf = (root: string) => {
    if (!projects) {
      projects = new Map();
      for (const s of allSpaces(db)) {
        const at = s.folder ? (repoRoot(s.folder) ?? s.folder) : '';
        if (at && !projects.has(at)) projects.set(at, s.id);
      }
    }
    return projects.get(root);
  };
  for (const e of list) {
    const f = e.finding;
    if (!f) continue;
    const named = new Set<string>();
    for (const v of f.evidence) {
      if (v.kind === 'run') {
        const g = group(v.ref.trim().replace(/^\/(?:system\/)?experiments\//, ''));
        if (g) named.add(g);
      } else if (v.kind === 'table') {
        const ref = v.ref.trim();
        for (const id of (okId(ref) ? getTable(db, ref)?.rows.flatMap((r) => r.runs) : undefined) ?? []) {
          const g = group(id);
          if (g) named.add(g);
        }
      }
    }
    if (!named.size) continue;
    const project = projectOf(e.scopeKey);
    const shown: ExperimentFinding = { id: e.id, verdict: f.verdict, statement: f.statement, ...(f.learned ? { learned: f.learned } : {}), at: e.updatedAt, root: e.scopeKey, ...(project ? { project } : {}) };
    for (const g of named) out.set(g, [...(out.get(g) ?? []), shown]);
  }
  for (const l of out.values()) l.sort((a, b) => b.at - a.at || b.id - a.id);
  return out;
}
