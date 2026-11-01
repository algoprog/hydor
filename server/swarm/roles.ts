// Who is who in a swarm: its lead (a session started in Swarm mode) and its members (the lead's child
// sessions). Kept by run as each agent starts, since an agent lists its tools before the app has stored a
// new session's settings; read from those settings otherwise.
import type { SessionExtra } from '../../shared/features.ts';
import { leadsSwarm } from '../../shared/swarm.ts';
import type { DB } from '../db.ts';
import { sessionExtra } from '../sessionExtra.ts';

export type SwarmRole = { role: 'lead' } | { role: 'member'; swarm: string };

const byRun = new Map<string, SwarmRole>();

/** The role of a session starting with these settings: a lead, a member (its parent leads a swarm), or none. */
export function roleFromExtra(db: DB, extra: SessionExtra | undefined): SwarmRole | null {
  if (leadsSwarm(extra)) return { role: 'lead' };
  const p = extra?.parent;
  return typeof p === 'string' && p && leadsSwarm(sessionExtra(db, p)) ? { role: 'member', swarm: p } : null;
}

/** Noted as an agent starts (Feature.spawn), for its run. */
export function noteRun(runId: string, role: SwarmRole | null) {
  if (!role) return void byRun.delete(runId);
  byRun.set(runId, role);
  if (byRun.size > 1000) byRun.delete(byRun.keys().next().value!);
}

/** A run's role in a swarm: as noted when it started, else from its session's settings. */
export function roleOf(db: DB, ctx: { runId?: string; key: string }): SwarmRole | null {
  return (ctx.runId ? byRun.get(ctx.runId) : undefined) ?? (ctx.key ? roleFromExtra(db, sessionExtra(db, ctx.key)) : null);
}
