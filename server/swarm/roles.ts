// Who is who in a swarm: its lead (a session started in Swarm mode, as a swarm or a campaign) and its members
// (the lead's child sessions). Kept by run as each agent starts, since an agent lists its tools before the app
// has stored a new session's settings; read from those settings otherwise.
import type { SessionExtra } from '../../shared/features.ts';
import { swarmMode, type SwarmMode } from '../../shared/swarm.ts';
import type { DB } from '../db.ts';
import { GivenAtStart } from '../features/freshStart.ts';
import { sessionExtra } from '../sessionExtra.ts';

export type SwarmRole = { role: 'lead'; mode: SwarmMode } | { role: 'member'; swarm: string; mode: SwarmMode };

const byRun = new Map<string, SwarmRole>();
/** Each run's role as it started, in words, also when it had none: Swarm mode turned on or off later starts it afresh. */
export const givenRole = new GivenAtStart(1000);

/** A role in words, to tell whether a session's settings still give its agent the one it started with. */
export const roleWords = (r: SwarmRole | null): string => (r ? (r.role === 'lead' ? `lead ${r.mode}` : `member ${r.mode} of ${r.swarm}`) : 'none');

/** The role of a session starting with these settings: a lead, a member (its parent leads a swarm), or none. */
export function roleFromExtra(db: DB, extra: SessionExtra | undefined): SwarmRole | null {
  const own = swarmMode(extra);
  if (own) return { role: 'lead', mode: own };
  const p = extra?.parent;
  const theirs = typeof p === 'string' && p ? swarmMode(sessionExtra(db, p)) : null;
  return theirs ? { role: 'member', swarm: p as string, mode: theirs } : null;
}

/** Noted as an agent starts (Feature.spawn), for its run. */
export function noteRun(runId: string, role: SwarmRole | null) {
  givenRole.note(runId, roleWords(role));
  if (!role) return void byRun.delete(runId);
  byRun.set(runId, role);
  if (byRun.size > 1000) byRun.delete(byRun.keys().next().value!);
}

/** A run's role in a swarm: as noted when it started, else from its session's settings. */
export function roleOf(db: DB, ctx: { runId?: string; key: string }): SwarmRole | null {
  return (ctx.runId ? byRun.get(ctx.runId) : undefined) ?? (ctx.key ? roleFromExtra(db, sessionExtra(db, ctx.key)) : null);
}
