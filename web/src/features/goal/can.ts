// Whether a session can be given a goal. The server refuses where the goal loop cannot drive the session; the menu does not
// offer it there. Pure, so the test can read it.
import { arenaOf } from '@shared/arena';
import { researchOf } from '@shared/research';
import { leadsSwarm } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';

/**
 * A session that leads a team: a swarm or a campaign, a deep research, or an arena match. In this version a goal does not
 * combine with a team ("This session leads a swarm: a goal for a team comes in a later version"); teams inside a goal are
 * planned for the next one, and lifting this one function is all the menu needs then.
 */
export const leadsTeam = (extra: SessionSummary['extra']): boolean => leadsSwarm(extra) || !!researchOf(extra) || !!arenaOf(extra);

/** Set a goal is offered for any session of the app's own except a Hydor subagent's, one open elsewhere, one that already has a goal and one that leads a team. */
export const canSetGoal = (s: Pick<SessionSummary, 'goal' | 'external' | 'subagentOf' | 'extra'>): boolean =>
  !s.goal && !s.external && !s.subagentOf && typeof s.extra?.parent !== 'string' && !leadsTeam(s.extra);
