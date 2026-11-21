// Automatic in a form that picks a model (the start page, a scheduled task): the tiers pick it, Best's model and Max's if
// its agent steps up. Offered where the team is on and the program has tiers (Custom once its Best names a model); a
// confidential session picks among this computer's models. What it comes to is the line under "Automatic" in the model menu.
import type { AgentCatalog, Agent } from '@shared/types';
import { AUTO_MODEL, tierProgram, type TeamSettings, type TierMap } from '@shared/tiers';
import { modelLabel } from '../../components/AgentPickers';
import { useTeam, useTierMap } from './agentsState';

/** Whether Automatic is offered for a program: what the start page's model menu goes by. Not before the tiers and the team are loaded. */
export function autoOfferedFor(team: TeamSettings | null, tiers: TierMap | null, agent: Agent, acpId: string | null | undefined, confidential: boolean): boolean {
  const prog = tierProgram(agent, acpId ?? undefined);
  return !!team?.on && !!prog && !confidential && (prog !== 'console' || !!tiers?.console.best.model);
}

/** What Automatic's line says: Best's model, "or Max's if the problem proves too hard" when that switch is on and Max differs. */
function autoLine(team: TeamSettings | null, tiers: TierMap | null, cat: AgentCatalog | undefined, agent: Agent, acpId: string | null | undefined): { best: string | null; line: string } {
  const prog = tierProgram(agent, acpId ?? undefined);
  const best = prog ? (tiers?.[prog].best.model ?? null) : null;
  const max = prog ? (tiers?.[prog].max.model ?? null) : null;
  const line = team?.hard && max && max !== best ? `${modelLabel(cat, best)}, or ${modelLabel(cat, max)} if the problem proves too hard` : modelLabel(cat, best);
  return { best, line };
}

/**
 * Automatic for an agent program: `on` whether it is offered; `hint` the line under it for the model menu's `auto` prop
 * (only while offered); `line` the same line whenever the program has tiers (a task that is on Automatic still shows it
 * once Automatic is off); `bestModel` the model whose efforts the effort menu offers while Automatic is picked.
 */
export function useAutoModel(o: { agent: Agent; acpId?: string | null; cat?: AgentCatalog; confidential?: boolean }) {
  const tiers = useTierMap();
  const team = useTeam();
  const on = autoOfferedFor(team, tiers, o.agent, o.acpId, !!o.confidential);
  const { best, line } = autoLine(team, tiers, o.cat, o.agent, o.acpId);
  return { on, hint: on ? line : undefined, line, bestModel: best, tiers, team };
}

/** A task's model as people read it: "Automatic" for Automatic, else the program's name for it. */
export const modelText = (cat: AgentCatalog | undefined, model: string | null | undefined): string => (model === AUTO_MODEL ? 'Automatic' : modelLabel(cat, model));
