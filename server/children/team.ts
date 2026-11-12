// The team: what a session's main agent is told about its subagents when it starts. It leads on its own tier (Best, or
// Max once it has stepped up) and hands well-defined parts to subagents on cheaper tiers, so most of the work costs less
// while the judgement stays with the strongest model in the room. Settings → Models → Tiers turns it off.
import { swarmMode } from '../../shared/swarm.ts';
import { modelFamily, resolvedName, tierProgram, tierRank, type Tier, type TierPick } from '../../shared/tiers.ts';
import { rateFor } from '../prices.ts';
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

/** What a subagent on a tier costs beside its lead, in words ("about 1/40 of what you do"); `r`: its price over the lead's. */
export function costWords(r: number): string {
  if (r <= 0) return 'nothing';
  if (r >= 0.85) return 'about what you do';
  if (r >= 0.6) return 'about two thirds of what you do';
  if (r >= 0.4) return 'about half of what you do';
  if (r >= 0.29) return 'about a third of what you do';
  if (r >= 0.22) return 'about a quarter of what you do';
  const n = Math.round(1 / r);
  return `about 1/${n > 12 ? Math.round(n / 5) * 5 : n} of what you do`;
}

/**
 * What the main agent of a session is told about leading subagents. `native`: Claude Code's names for the Standard and
 * Quick models, for its own Agent tool; `stepUp`: it may step itself up to Max (step_up_session); `costs`: what a
 * subagent on each tier costs beside the lead, when both prices are known (costWords). The same words for every session
 * on one model, so the provider's cache of the instructions holds.
 */
export function teamInstructions(o: { native?: { standard?: string; quick?: string }; stepUp?: boolean; costs?: { quick?: string; standard?: string } } = {}): string {
  const { standard, quick } = o.native ?? {};
  const costs = o.costs?.quick && o.costs.standard ? `one on quick costs ${o.costs.quick}, one on standard ${o.costs.standard}` : 'one on quick costs a small fraction of what you do, one on standard clearly less than you';
  const lines = [
    '# Working with subagents',
    `You are this session’s main agent: you work out what is asked, decide how it is done, and answer for the result. You are also the most expensive model in it, so the doing goes to subagents wherever a cheaper model does it as well: ${costs}.`,
    '- Sort the work before you start on it, in a line or two the user can read: the parts that go to subagents, each with its tier, and what you keep and why. Only a job of a few steps needs no sorting: do it.',
    '- Hand over the doing, keep the deciding. Count a part by what would have to be written and read for it, not by how hard it is: more than about fifty lines of code or text to write, the same change in many places, tests, a draft, a handful of files or pages to read through, is a subagent’s part once what is wanted is clear, however easy it would be for you. Easy is the reason to hand it over: you would be paid the most for the least. Yours are an edit of a few lines, a command or two, what is itself a decision (a design, a diagnosis), and the hard core of the problem.',
    '- quick, for a job specified so exactly that little can go wrong and its result can be checked: a function or a small module to a written specification, a targeted edit in files you name, the same mechanical change across many files, tests for cases you list, facts pulled out of documents, converting or formatting. Prefer it whenever the job is that clear.',
    '- standard, for a clear part that still takes judgement along the way: a change you have described but not spelled out, a feature in code that must first be read, a module whose rules bear on each other (a parser, a state machine), research on a set question, a draft to your outline. It saves less than quick does and reads its way in first, so it has to be a part of some size: a small one is yours, or a quick subagent’s.',
    '- best, for a hard part that stands on its own. The hardest thinking stays with you.',
    '- Where a part could go to either of two tiers, give it to the lower one and check what comes back: a try that falls short costs little, and the part then goes one tier up with what was wrong. Starting too high costs every time.',
    '- A brief stands alone, since the subagent sees nothing of this conversation: the goal, the files and facts it needs, exact names, what not to touch, how to check the result, what to report. Where the specification is already written down (a file, the request itself), the brief is a few lines that point at it: do not weigh the time a brief takes against the time the work would take you, weigh a few lines against the whole of the work at your price. Decide the design first: a subagent left to guess costs more than it saves.',
  ];
  if (standard || quick) {
    const models = [quick ? `model "${quick}" for a quick part` : '', standard ? `model "${standard}" for a standard one` : ''].filter(Boolean).join(' and ');
    lines.push(
      `- Two kinds of subagent. Your program’s own (its Agent tool), for a part of a few minutes: start those that do not depend on each other in one message, each with ${models} (with no model it runs on yours and saves nothing), and their results come back in this turn. Hydor subagents (start_child_session), for a long part, one the user should be able to follow and steer, or another program’s model: start them together, then end your turn, and each reply comes back to you as a message. What depends on a part waits for it.`,
    );
  } else lines.push('- Start parts that do not depend on each other together with start_child_session, then end your turn: each reply comes back to you as a message. What depends on a part waits for it.');
  lines.push(
    '- You answer for what subagents hand back: run the checks and read what changed before you build on it or report it. Fix a slip yourself, send the subagent back for more, or give the part to a higher tier when the tier was too weak for it (step_up_child does that for a Hydor subagent).',
  );
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
 * What a starting session is told about leading subagents; null when it is not told: the team is off, it is a swarm
 * (its lead has its own instructions), an app's run or a question on Help (small jobs of their own), confidential (its
 * subagents run on this computer's models), its program has no tiers, it thinks with less than Best itself, or no tier
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
  // What each cheaper tier costs beside this lead, when the price table knows both models.
  const lead = priceOf(d, s, modelOf(d, s).model ?? picks[own].model);
  const beside = (t: 'quick' | 'standard') => {
    const p = priceOf(d, s, picks[t].model);
    return lead && p !== null && lead > 0 ? costWords(p / lead) : undefined;
  };
  // A session on Automatic is told of stepping up whatever it thinks with now (one already on Max too): the same words from one such session to the next.
  const stepUp = x.auto === true && teamOf(d.db).hard && !findAssistant(d.db, x.assistant)?.tier && !!(picks.max.model || picks.max.effort) && !samePick(picks.max, picks.best);
  return teamInstructions({ native, stepUp, costs: { quick: beside('quick'), standard: beside('standard') } });
}

/** What a model costs for a million tokens in and a million out, at API prices; 0 for one on this computer; null when no price is known. */
function priceOf(d: Deps, s: { agent: Agent; acpAgent?: string }, model: string | undefined): number | null {
  if (!model) return null;
  if (/^(ollama|vllm)\//.test(model)) return 0;
  const p = tierProgram(s.agent, s.acpAgent);
  const name = p && p !== 'console' ? resolvedName(seenModels(d.db)[p] ?? [], model) : model;
  const r = rateFor(d.db, name) ?? rateFor(d.db, model);
  return r ? r.input + r.output : null;
}
