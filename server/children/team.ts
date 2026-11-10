// The team: what a session's main agent is told about its helpers when it starts. It leads on its own tier (Best, or
// Max for a hard problem) and hands well-defined parts to helpers on cheaper tiers, so most of the work costs less
// while the judgement stays with the strongest model in the room. Settings → Models → Tiers turns it off.
import { swarmMode } from '../../shared/swarm.ts';
import { modelFamily, tierProgram, tierRank, type Tier, type TierPick } from '../../shared/tiers.ts';
import type { Agent } from '../../shared/types.ts';
import type { Deps, SpawnInfo } from '../features/types.ts';
import { seenModels, teamOf, tierOf, tiersOf } from '../assistants/tiers.ts';
import { findAssistant } from '../assistants/store.ts';

const samePick = (a: TierPick, b: TierPick) => (a.model ?? '') === (b.model ?? '') && (a.effort ?? '') === (b.effort ?? '');

/** The names Claude Code's own Agent tool takes for a model. */
const NATIVE = ['haiku', 'sonnet', 'opus', 'fable'];

/** A tier's model as Claude Code's Agent tool names it ("sonnet" for Sonnet 5.5 and for claude-sonnet-4-6); none for a model it has no name for. */
function nativeName(d: Deps, pick: TierPick): string | undefined {
  if (!pick.model) return undefined;
  const label = (seenModels(d.db).claude ?? []).find((m) => m.value === pick.model)?.label ?? pick.model;
  const words = `${modelFamily(label)?.name ?? ''} ${label} ${pick.model}`.toLowerCase().split(/[^a-z]+/);
  return NATIVE.find((n) => words.includes(n));
}

/**
 * What the main agent of a session is told about leading helpers. `native`: Claude Code's names for the Standard and
 * Quick models, for its own Agent tool; `stepUp`: it may step itself up to Max (step_up_session). The same words from
 * one session to the next, so the provider's cache of the instructions holds.
 */
export function teamInstructions(o: { native?: { standard?: string; quick?: string }; stepUp?: boolean } = {}): string {
  const lines = [
    '# Working with helpers',
    'You are this session’s main agent: you work out what is asked, plan, decide, and answer for the result. Helpers are cheaper models that take well-defined parts of the work: one on quick costs a small fraction of what you do, one on standard clearly less than you. Hand over what can be handed over whole, to the cheapest tier that will do it well, and keep your own effort for what needs you.',
    '- Yours: understanding the request, the plan and its decisions, the hard reasoning (a stubborn bug, a design with trade-offs), putting the parts together, checking the result, and the answer. Also anything small: what you can finish in a few steps is quicker done than briefed.',
    '- A helper on quick: a job so clear that little can go wrong and its result can be checked, such as a targeted edit in files you name, the same mechanical change across many files, a function or a module to an exact specification, tests for cases you list, facts pulled out of documents, converting or formatting.',
    '- A helper on standard: a clear part of medium size that still takes judgement along the way, such as a change you have described but not spelled out line by line, a feature in code it must first read, research on a set question, a draft to your outline. It has to be worth a brief: a part of a few minutes’ work is yours or a quick helper’s.',
    '- A hard part that stands on its own can go to a helper on best; the hardest thinking stays with you.',
    '- Decide the design before you hand a part over, and write a brief that stands alone (the helper sees nothing of this conversation): the goal, the files and facts it needs, exact names, what not to touch, how to check the result, what to report. A helper left to guess costs more than it saves.',
    '- Start parts that do not depend on each other together with start_child_session, then end your turn: each reply comes back to you as a message. What depends on a part waits for it.',
    '- You answer for what helpers hand back. Read what changed and run the checks before you build on it or report it. Fix a slip yourself, send the helper back with message_child for more, or run the part again one tier up with step_up_child when the tier was too weak for it.',
  ];
  const { standard, quick } = o.native ?? {};
  if (standard || quick) {
    const models = [standard ? `model "${standard}" for a standard part` : '', quick ? `model "${quick}" for a quick one` : ''].filter(Boolean).join(' and ');
    lines.push(
      `- Your own Agent tool hands a part over inside this turn, its result coming back as the tool’s result: right for a search or a small job you need before your next step. Give it ${models}; with none it runs on your model and costs what you do.`,
    );
  }
  if (o.stepUp)
    lines.push(
      '- When the problem proves harder than it looked (a fix that has failed twice, a cause you cannot find, constraints that pull against each other, a proof), call step_up_session to carry on with the strongest model instead of going round in circles.',
    );
  return lines.join('\n');
}

/** The model a starting (or running) session thinks with: the one it starts with, else its last. */
function modelOf(d: Deps, s: Pick<SpawnInfo, 'key' | 'model'>): { model?: string; effort?: string } {
  if (s.model) return { model: s.model };
  const sum = s.key ? d.sessions.summary(s.key) : null;
  return { model: sum?.live?.model ?? sum?.prefs?.model ?? sum?.model, effort: sum?.live?.effort ?? sum?.prefs?.effort ?? undefined };
}

/**
 * The tier a session leads on: its model's (a model the tiers do not know counts as Best, as does a program's own
 * default before its models are known).
 */
export function leadTier(d: Deps, s: { agent: Agent; acpAgent?: string; key?: string; model?: string }): Tier {
  return tierOf(d.db, { agent: s.agent, acpAgent: s.acpAgent, ...modelOf(d, s) }) ?? 'best';
}

/**
 * Whether a session may step itself up to Max (step_up_session): it started on Automatic (`auto`), Max for hard problems
 * is on, its program's Max is a model (or an effort) other than what it thinks with, it is on a lower tier, and the
 * agent it works as does not name a tier of its own. Why not, in words, when it may not.
 */
export function stepUpSelf(d: Deps, s: { agent: Agent; acpAgent?: string; key?: string; model?: string; assistant?: unknown; auto?: unknown }): { max: TierPick } | { no: string } {
  const p = tierProgram(s.agent, s.acpAgent);
  if (!p) return { no: 'This agent keeps its own model: there are no tiers for it.' };
  if (!teamOf(d.db).hard) return { no: 'Stepping up to Max is turned off (Settings → Models → Tiers).' };
  // A model the user picked by name stays: only a session whose model the tiers picked moves by itself.
  if (s.auto !== true) return { no: 'This session’s model was picked for it by name, so it stays on it.' };
  const a = findAssistant(d.db, s.assistant);
  if (a?.tier) return { no: `${a.name} thinks with one tier by its own settings, and stays on it.` };
  const picks = tiersOf(d.db)[p];
  const own = leadTier(d, s);
  if (own === 'max') return { no: 'You think with the strongest model already.' };
  if ((!picks.max.model && !picks.max.effort) || samePick(picks.max, picks[own])) return { no: 'No stronger model is set for Max (Settings → Models → Tiers).' };
  return { max: picks.max };
}

/**
 * What a starting session is told about leading helpers; null when it is not told: the team is off, it is a swarm
 * (its lead has its own instructions), an app's run or a question on Help (small jobs of their own), confidential (its
 * children run on this computer's models), its program has no tiers, it thinks with less than Best itself, or no tier
 * below its own would run anything cheaper (Custom before its tiers are set).
 */
export function teamNote(d: Deps, s: SpawnInfo): string | null {
  const x = s.extra ?? {};
  if (!teamOf(d.db).on || swarmMode(x) || x.app || x.help || x.confidential) return null;
  const p = tierProgram(s.agent, s.acpAgent);
  if (!p) return null;
  const own = leadTier(d, s);
  if (tierRank(own) < tierRank('best')) return null;
  const picks = tiersOf(d.db)[p];
  const cheaper = (['standard', 'quick'] as const).filter((t) => (picks[t].model || picks[t].effort) && !samePick(picks[t], picks[own]));
  if (!cheaper.length) return null;
  const native = s.agent === 'claude' ? { standard: nativeName(d, picks.standard), quick: nativeName(d, picks.quick) } : undefined;
  // A session on Automatic is told of stepping up whatever it thinks with now (one already on Max too): the same words from one such session to the next.
  const stepUp = x.auto === true && teamOf(d.db).hard && !findAssistant(d.db, x.assistant)?.tier && !!(picks.max.model || picks.max.effort) && !samePick(picks.max, picks.best);
  return teamInstructions({ native, stepUp });
}
