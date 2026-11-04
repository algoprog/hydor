// Where each folder's work began: in Hydor, or outside it, in Claude Code or Codex (VS Code, a terminal, their own
// apps), whose sessions the app lists too. The sidebar marks the group of a folder whose first session was started
// outside Hydor with where its sessions came from. The pages hold only the newest sessions, so the server, which has
// them all (archived ones too), says which folder began where (bootstrap's folderOrigins).
import type { FolderOrigin } from '../../shared/sidebar.ts';
import type { Agent } from '../../shared/types.ts';
import { accountOfPath } from '../accounts.ts';
import type { DB } from '../db.ts';

interface Row {
  agent: Agent;
  source: string | null;
  path: string | null;
  here: number | null;
  at: number | null;
  dir: string | null;
  account: string | null;
}

const REPO = `case when json_valid(a.worktree) then nullif(json_extract(a.worktree, '$.repo'), '') end`;

/**
 * Every folder two or more sessions worked in (a session in a worktree for its main checkout): an empty list when
 * Hydor started its first session; else where its sessions from outside came from, by agent and account, the most
 * sessions first.
 */
export function folderOrigins(db: DB): Record<string, FolderOrigin[]> {
  const rows = db
    .prepare(
      `select s.agent, s.source, s.path, a.created_by_app as here, coalesce(s.created_at, a.created_at, s.updated_at) as at,
         coalesce(${REPO}, s.cwd, a.cwd) as dir, a.account
       from sessions s left join app_sessions a on a.key = s.key
       where s.hidden = 0
       union all
       select a.agent, null, null, a.created_by_app, a.created_at, coalesce(${REPO}, a.cwd), a.account
       from app_sessions a where not exists (select 1 from sessions s where s.key = a.key)`,
    )
    .all() as Row[];
  const byDir = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.dir) continue;
    const dir = r.dir.length > 1 ? r.dir.replace(/\/+$/, '') : r.dir;
    const l = byDir.get(dir);
    if (l) l.push(r);
    else byDir.set(dir, [r]);
  }
  const here = (r: Row) => !!r.here || r.agent === 'acp';
  const out: Record<string, FolderOrigin[]> = {};
  for (const [dir, list] of byDir) {
    if (list.length < 2) continue;
    const first = list.reduce((a, b) => ((b.at ?? Infinity) < (a.at ?? Infinity) ? b : a));
    if (here(first)) {
      out[dir] = [];
      continue;
    }
    const by = new Map<string, { agent: Agent; account?: string; sessions: number; sources: Map<string, number> }>();
    for (const r of list) {
      if (here(r)) continue;
      const account = r.account ?? accountOfPath(db, r.path) ?? undefined;
      const k = `${r.agent}:${account ?? ''}`;
      let x = by.get(k);
      if (!x) by.set(k, (x = { agent: r.agent, account, sessions: 0, sources: new Map() }));
      x.sessions++;
      if (r.source) x.sources.set(r.source, (x.sources.get(r.source) ?? 0) + 1);
    }
    out[dir] = [...by.values()]
      .sort((a, b) => b.sessions - a.sessions)
      .map(({ sources, ...x }) => ({ ...x, sources: [...sources].sort((a, b) => b[1] - a[1]).map(([src]) => src) }));
  }
  return out;
}
