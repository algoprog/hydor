// Tiers: models picked by the job rather than by name. Quick for clear jobs whose result can be checked, Standard
// for most work, Best for hard, open-ended problems. Settings → Models → Tiers names each tier's model (and effort)
// for each agent program; an agent thinks with one, or with Automatic (no tier: the model picked where it starts),
// and a lead gives each helper it starts one, never above the highest it allows.
import type { Agent } from './types.ts';

export type Tier = 'quick' | 'standard' | 'best';

export const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick', hint: 'The cheapest: clear jobs whose result can be checked (translating, pulling out facts, sorting, formatting, short summaries)' },
  { id: 'standard', label: 'Standard', hint: 'Most work: writing, research, changes to code' },
  { id: 'best', label: 'Best', hint: 'The strongest: hard, open-ended problems (planning, hard bugs, proofs, reviews that matter)' },
];

export const isTier = (v: unknown): v is Tier => v === 'quick' || v === 'standard' || v === 'best';

export const tierLabel = (t: Tier | undefined): string => TIERS.find((x) => x.id === t)?.label ?? 'Automatic';

/** A tier's model and effort for one agent program, in that program's own names; unset keeps the program's default. */
export interface TierPick {
  model?: string;
  effort?: string;
}

/** The programs with tiers: Claude Code, Codex and Custom (the app's own agent, "console"). */
export type TierProgram = 'claude' | 'codex' | 'console';
export const TIER_PROGRAMS: { id: TierProgram; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'console', label: 'Custom' },
];

export type TierMap = Record<TierProgram, Record<Tier, TierPick>>;

/** Until changed: Claude Code's own model names, Codex's efforts on its default model, and nothing for Custom (its models are the user's). */
export const DEFAULT_TIERS: TierMap = {
  claude: { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus' } },
  codex: { quick: { effort: 'low' }, standard: { effort: 'medium' }, best: { effort: 'high' } },
  console: { quick: {}, standard: {}, best: {} },
};

/** Which program's tiers an agent uses; null for ACP agents other than Custom (they keep their own model). */
export const tierProgram = (agent: Agent, acpAgent?: string): TierProgram | null =>
  agent === 'claude' ? 'claude' : agent === 'codex' ? 'codex' : agent === 'acp' && acpAgent === 'console' ? 'console' : null;

const RANK: Record<Tier, number> = { quick: 0, standard: 1, best: 2 };

/** A tier no higher than `max` ("never above"); `max` unset leaves it as it is. */
export const clampTier = (t: Tier, max?: Tier): Tier => (max && RANK[t] > RANK[max] ? max : t);

/** Tiers as kept (a tier's model and effort, by program and tier), checked: unknown keys dropped, the rest as given. */
export function cleanTiers(v: unknown): TierMap {
  const out: TierMap = { claude: { quick: {}, standard: {}, best: {} }, codex: { quick: {}, standard: {}, best: {} }, console: { quick: {}, standard: {}, best: {} } };
  const src = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  for (const p of TIER_PROGRAMS) {
    const prog = src[p.id] && typeof src[p.id] === 'object' ? (src[p.id] as Record<string, unknown>) : {};
    for (const t of TIERS) {
      const pick = prog[t.id] && typeof prog[t.id] === 'object' ? (prog[t.id] as Record<string, unknown>) : null;
      const base = DEFAULT_TIERS[p.id][t.id];
      if (!pick) {
        out[p.id][t.id] = { ...base };
        continue;
      }
      const model = typeof pick.model === 'string' ? pick.model.trim().slice(0, 200) : '';
      const effort = typeof pick.effort === 'string' ? pick.effort.trim().slice(0, 40) : '';
      out[p.id][t.id] = { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
    }
  }
  return out;
}
