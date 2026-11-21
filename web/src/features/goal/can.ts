// Whether a session can be given a goal. The server refuses where the goal loop cannot drive the session; the menu does not
// offer it there. Pure, so the test can read it.
import { arenaOf } from '@shared/arena';
import { researchOf } from '@shared/research';
import type { SessionExtra } from '@shared/features';
import type { SessionSummary } from '@shared/types';

/**
 * A session that leads a team a goal does not go with: a campaign (its members work in worktrees of their own and merge with
 * commits, so a round could not be undone), a deep research, or an arena match. A swarm's lead may have a goal: a round is the
 * whole swarm's work in the lead's folder.
 */
export const leadsTeam = (extra: SessionSummary['extra']): boolean => extra?.swarm === 'campaign' || !!researchOf(extra) || !!arenaOf(extra);

/** Set a goal is offered for any session of the app's own except a Hydor subagent's, one open elsewhere, one that already has a goal and one that leads a campaign, a deep research or an arena match (a swarm's lead may). */
export const canSetGoal = (s: Pick<SessionSummary, 'goal' | 'external' | 'subagentOf' | 'extra'>): boolean =>
  !s.goal && !s.external && !s.subagentOf && typeof s.extra?.parent !== 'string' && !leadsTeam(s.extra);

/**
 * What the start page's Goal option changes when it is turned on: a deep research, an arena match and a campaign do not go with a
 * goal, so they are cleared; a swarm stays (its lead has the goal).
 */
export const goalStartPatch = (extra: Pick<SessionExtra, 'swarm'>): Partial<SessionExtra> => ({ research: undefined, arena: undefined, ...(extra.swarm === 'campaign' ? { swarm: undefined } : {}) });

/**
 * What the start page's Swarm option changes: a swarm clears a deep research and keeps the goal; a campaign clears the goal
 * as well (its members work in worktrees of their own, so a round could not be undone).
 */
export const swarmStartPatch = (swarm: true | 'campaign' | undefined): Partial<SessionExtra> => (swarm ? { swarm, research: undefined, ...(swarm === 'campaign' ? { goal: undefined } : {}) } : { swarm });
