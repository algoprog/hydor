// An agent's versions: each save that changes what it is keeps one (its settings and instructions, not its examples),
// with when, who saved it and what changed in sentences. The newest VERSIONS_KEEP of each agent stay; they go with it.
// An agent saved before versions were kept gets the way it was as its first version, at its first change.
import type { AgentVersion, AgentVersionBy } from '../../shared/agent-files.ts';
import { agentChanges, agentCore, VERSIONS_KEEP } from '../../shared/agent-files.ts';
import type { Assistant } from '../../shared/assistants.ts';
import type { DB } from '../db.ts';

const made = new WeakSet<DB>();

function tables(db: DB) {
  if (made.has(db)) return;
  db.exec('create table if not exists agent_versions (agent text not null, n integer not null, at integer not null, by text not null, line text not null, data text not null, primary key (agent, n))');
  made.add(db);
}

interface Row {
  agent: string;
  n: number;
  at: number;
  by: AgentVersionBy;
  line: string;
  data: string;
}

const coreText = (a: Partial<Assistant>) => JSON.stringify(agentCore(a));

/** The newest version of an agent, with what it was. */
export function latestAgentVersion(db: DB, id: string): (AgentVersion & { agent: Partial<Assistant> }) | null {
  tables(db);
  const r = db.prepare('select * from agent_versions where agent = ? order by n desc limit 1').get(id) as Row | undefined;
  return r ? { n: r.n, at: r.at, by: r.by, line: r.line, agent: JSON.parse(r.data) } : null;
}

/** The number of the version an agent is at now (0: none kept yet). */
export const currentVersion = (db: DB, id: string): number => latestAgentVersion(db, id)?.n ?? 0;

/**
 * Keeps a version of an agent just saved, when what it is changed: with who saved it and what changed (`why`, when the
 * one who saved it said, comes first). An agent saved before versions were kept gets the way it was (`before`) as its
 * first. Returns the version's number, or null when nothing it is changed.
 */
export function keepVersion(db: DB, before: Assistant | null, after: Assistant, by: AgentVersionBy, why?: string, name?: (kind: 'agent' | 'project', id: string) => string): number | null {
  tables(db);
  const last = latestAgentVersion(db, after.id);
  if (last && coreText(last.agent) === coreText(after)) return null;
  const now = Date.now();
  let n = last?.n ?? 0;
  const put = db.prepare('insert into agent_versions (agent, n, at, by, line, data) values (?, ?, ?, ?, ?, ?)');
  if (!last && before && coreText(before) !== coreText(after)) put.run(after.id, ++n, now - 1, 'before', 'As it was before versions were kept.', JSON.stringify(agentCore(before)));
  const was = last?.agent ?? before;
  const said = why?.trim() || (was ? agentChanges(was, after, name).join(' ') : by === 'install' ? 'Installed from a file.' : by === 'import' ? 'Imported from an agent file.' : 'Made it.') || 'Saved again.';
  put.run(after.id, ++n, now, by, said.slice(0, 600), JSON.stringify(agentCore(after)));
  // The newest stay.
  db.prepare('delete from agent_versions where agent = ? and n <= ?').run(after.id, n - VERSIONS_KEEP);
  return n;
}

/** An agent's versions, newest first. */
export function agentVersions(db: DB, id: string): AgentVersion[] {
  tables(db);
  return (db.prepare('select agent, n, at, by, line from agent_versions where agent = ? order by n desc').all(id) as Omit<Row, 'data'>[]).map((r) => ({ n: r.n, at: r.at, by: r.by, line: r.line }));
}

/** One version, with what the agent was then. */
export function agentVersion(db: DB, id: string, n: number): (AgentVersion & { agent: Partial<Assistant> }) | null {
  tables(db);
  const r = db.prepare('select * from agent_versions where agent = ? and n = ?').get(id, n) as Row | undefined;
  return r ? { n: r.n, at: r.at, by: r.by, line: r.line, agent: JSON.parse(r.data) } : null;
}

/** An agent deleted: its versions go with it. */
export function forgetVersions(db: DB, id: string) {
  tables(db);
  db.prepare('delete from agent_versions where agent = ?').run(id);
}
