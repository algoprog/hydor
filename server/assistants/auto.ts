// Automatic: a session started with no model of its own (model "auto") thinks with the Best tier's model for its
// program. It moves to Max only when its own agent steps up (step_up_session, with Max for hard problems on), once a
// problem has proved harder than Best can manage: a request is never sent to Max on its wording alone, which the
// benchmark found costly (16 of 37 coding requests, 43% more than Best on them, for one problem more solved). Also the
// note a conversation gets when a session moves to Max.
import { tierLabel, tierProgram, type Tier, type TierNote } from '../../shared/tiers.ts';
import type { Agent } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { modelName, tiersOf } from './tiers.ts';

/** What a session on Automatic starts with: Best's model and effort for its program. */
export interface AutoPlan {
  tier: Tier;
  model?: string;
  effort?: string;
}

/** The plan for a session started on Automatic: Best's model and effort for its program; null for programs without tiers. */
export function autoPlan(db: DB, o: { agent: Agent; acpAgent?: string }): AutoPlan | null {
  const p = tierProgram(o.agent, o.acpAgent);
  if (!p) return null;
  const { best } = tiersOf(db)[p];
  return { tier: 'best', model: best.model, effort: best.effort };
}

/** What a move to a tier's model says in the conversation. */
export function tierNote(db: DB, o: { agent: Agent; acpAgent?: string; event: TierNote['event']; tier: Tier; model?: string; why?: string }): TierNote {
  return { event: o.event, tier: o.tier, label: modelName(db, o.agent, o.acpAgent, o.model) || tierLabel(o.tier), ...(o.why ? { why: o.why } : {}) };
}
