// The tries of an agent's examples, kept in the agent_example_runs table: which example, the agent's version it ran
// with, its session, how it went (its reply, what it handed back, each check) and what it spent. The newest
// RUNS_KEEP of each agent stay; they go with it.
import type { AgentCheck, AgentExampleRun } from '../../shared/agent-files.ts';
import type { DB } from '../db.ts';

const RUNS_KEEP = 200;
const made = new WeakSet<DB>();

function tables(db: DB) {
  if (made.has(db)) return;
  db.exec(`create table if not exists agent_example_runs (
    id text primary key, agent text not null, example text not null, version integer not null, key text, status text not null,
    reply text, result text, checks text, error text, cost real, started_at integer not null, ended_at integer)`);
  db.exec('create index if not exists agent_example_runs_agent on agent_example_runs (agent, started_at)');
  made.add(db);
}

interface Row {
  id: string;
  agent: string;
  example: string;
  version: number;
  key: string | null;
  status: AgentExampleRun['status'];
  reply: string | null;
  result: string | null;
  checks: string | null;
  error: string | null;
  cost: number | null;
  started_at: number;
  ended_at: number | null;
}

const toRun = (r: Row): AgentExampleRun & { agent: string } => ({
  id: r.id,
  agent: r.agent,
  example: r.example,
  version: r.version,
  status: r.status,
  startedAt: r.started_at,
  ...(r.key ? { key: r.key } : {}),
  ...(r.reply ? { reply: r.reply } : {}),
  ...(r.result ? { result: JSON.parse(r.result) } : {}),
  ...(r.checks ? { checks: JSON.parse(r.checks) as AgentCheck[] } : {}),
  ...(r.error ? { error: r.error } : {}),
  ...(r.cost !== null ? { costUsd: r.cost } : {}),
  ...(r.ended_at ? { endedAt: r.ended_at } : {}),
});

export function addExampleRun(db: DB, r: { id: string; agent: string; example: string; version: number; key?: string; status: AgentExampleRun['status']; error?: string }) {
  tables(db);
  const now = Date.now();
  db.prepare('insert into agent_example_runs (id, agent, example, version, key, status, error, started_at, ended_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    r.id,
    r.agent,
    r.example,
    r.version,
    r.key ?? null,
    r.status,
    r.error ?? null,
    now,
    r.status === 'error' ? now : null,
  );
  // The newest stay.
  const old = db.prepare('select id from agent_example_runs where agent = ? order by started_at desc limit -1 offset ?').all(r.agent, RUNS_KEEP) as { id: string }[];
  for (const o of old) db.prepare('delete from agent_example_runs where id = ?').run(o.id);
}

/** Changes a try: what is given, the rest as it was. */
export function setExampleRun(
  db: DB,
  id: string,
  p: Partial<{ key: string; status: AgentExampleRun['status']; reply: string; result: Record<string, unknown> | null; checks: AgentCheck[]; error: string; costUsd: number; endedAt: number }>,
) {
  tables(db);
  const sets: string[] = [];
  const args: unknown[] = [];
  const put = (col: string, v: unknown) => (sets.push(`${col} = ?`), args.push(v));
  if (p.key !== undefined) put('key', p.key);
  if (p.status !== undefined) put('status', p.status);
  if (p.reply !== undefined) put('reply', p.reply.slice(0, 60_000));
  if (p.result !== undefined) put('result', p.result === null ? null : JSON.stringify(p.result));
  if (p.checks !== undefined) put('checks', JSON.stringify(p.checks));
  if (p.error !== undefined) put('error', p.error.slice(0, 2000));
  if (p.costUsd !== undefined) put('cost', p.costUsd);
  if (p.endedAt !== undefined) put('ended_at', p.endedAt);
  if (!sets.length) return;
  db.prepare(`update agent_example_runs set ${sets.join(', ')} where id = ?`).run(...args, id);
}

export function exampleRun(db: DB, id: string): (AgentExampleRun & { agent: string }) | null {
  tables(db);
  const r = db.prepare('select * from agent_example_runs where id = ?').get(id) as Row | undefined;
  return r ? toRun(r) : null;
}

/** The try a session is running, by its key. */
export function exampleRunOfKey(db: DB, key: string): (AgentExampleRun & { agent: string }) | null {
  tables(db);
  const r = db.prepare('select * from agent_example_runs where key = ? order by started_at desc limit 1').get(key) as Row | undefined;
  return r ? toRun(r) : null;
}

/** An agent's tries, newest first. */
export function exampleRuns(db: DB, agent: string, limit = RUNS_KEEP): (AgentExampleRun & { agent: string })[] {
  tables(db);
  return (db.prepare('select * from agent_example_runs where agent = ? order by started_at desc limit ?').all(agent, limit) as Row[]).map(toRun);
}

/** The latest try of each example of an agent's, newest first. */
export function latestTries(db: DB, agent: string): (AgentExampleRun & { agent: string })[] {
  const seen = new Set<string>();
  return exampleRuns(db, agent).filter((r) => !seen.has(r.example) && seen.add(r.example));
}

/** Tries still going (running, waiting for you, being judged), across every agent. */
export function openExampleRuns(db: DB): (AgentExampleRun & { agent: string })[] {
  tables(db);
  return (db.prepare("select * from agent_example_runs where status in ('running', 'waiting', 'judging')").all() as Row[]).map(toRun);
}

/** An agent deleted: its tries go with it. */
export function forgetExampleRuns(db: DB, agent: string) {
  tables(db);
  db.prepare('delete from agent_example_runs where agent = ?').run(agent);
}
