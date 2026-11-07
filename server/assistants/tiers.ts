// Settings → Models → Tiers: which model (and effort) Quick, Standard and Best mean for each agent program,
// kept in the kv table. An agent that thinks with a tier starts on its model; a lead gives each helper a tier.
import { cleanTiers, tierProgram, type Tier, type TierMap, type TierPick } from '../../shared/tiers.ts';
import type { Agent } from '../../shared/types.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

const KEY = 'models.tiers';

/** The tiers as set, each one not set taking its default. */
export function tiersOf(db: DB): TierMap {
  try {
    return cleanTiers(JSON.parse(kvGet(db, KEY) ?? 'null'));
  } catch {
    return cleanTiers(null);
  }
}

export function setTiers(db: DB, v: unknown): TierMap {
  const t = cleanTiers(v);
  kvSet(db, KEY, JSON.stringify(t));
  return t;
}

/** A tier's model and effort for an agent program; null for the programs without tiers (ACP agents other than Custom). */
export function tierPick(db: DB, tier: Tier, agent: Agent, acpAgent?: string): TierPick | null {
  const p = tierProgram(agent, acpAgent);
  return p ? tiersOf(db)[p][tier] : null;
}
