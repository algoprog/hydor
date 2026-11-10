// Settings → Models → Tiers: which model (and effort) Quick, Standard, Best and Max mean for each agent program, and
// how sessions use them (the team), kept in the kv table. An agent that thinks with a tier starts on its model; a
// session on Automatic starts on Best's, or Max's for a hard problem; a lead gives each helper a tier. Only the picks
// that were changed are kept: the others follow the models each program offers, remembered here each time a program
// lists them, so a tier left alone moves to its family's newest model by itself.
import {
  cleanTeam,
  defaultTiers,
  tierOfModel,
  tierOverrides,
  tierProgram,
  withDefaults,
  type KnownModel,
  type TeamSettings,
  type Tier,
  type TierMap,
  type TierOverrides,
  type TierPick,
  type TierProgram,
} from '../../shared/tiers.ts';
import type { Agent, ModelOption } from '../../shared/types.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

const KEY = 'models.tiers';
const TEAM = 'models.team';
const SEEN = 'models.tiers.seen';

type Seen = Partial<Record<TierProgram, KnownModel[]>>;

/** The kept list as it was last read, by database: asked for at every start, changed a few times a year. */
const read = new WeakMap<DB, { raw: string; seen: Seen }>();

/** The models Claude Code and Codex offered when they last listed them (none before they ever did). */
export function seenModels(db: DB): Seen {
  const raw = kvGet(db, SEEN) ?? '';
  const had = read.get(db);
  if (had?.raw === raw) return had.seen;
  let seen: Seen = {};
  try {
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') seen = v as Seen;
  } catch {}
  read.set(db, { raw, seen });
  return seen;
}

/** A program listed its models (the session manager's catalog): the tiers nobody changed follow them. */
export function noteModels(db: DB, program: 'claude' | 'codex', models: ModelOption[]) {
  if (!models.length) return;
  const slim: KnownModel[] = models.map((m) => ({ value: m.value, label: m.label, ...(m.resolved ? { resolved: m.resolved } : {}), ...(m.isDefault ? { isDefault: true } : {}) }));
  const next = JSON.stringify({ ...seenModels(db), [program]: slim });
  if (next !== (kvGet(db, SEEN) ?? '')) kvSet(db, SEEN, next);
}

/** What each tier means until it is changed, for the models the programs offer now. */
export const tierDefaults = (db: DB): TierMap => defaultTiers(seenModels(db));

/** The picks that were changed. A table kept before 0.52 had every pick written out: those nobody changed are dropped. */
function kept(db: DB, defaults: TierMap): TierOverrides {
  let raw: unknown = null;
  try {
    raw = JSON.parse(kvGet(db, KEY) ?? 'null');
  } catch {}
  const o = raw && typeof raw === 'object' ? (raw as { v?: unknown; picks?: unknown }) : null;
  return o?.v === 2 ? tierOverrides(o.picks, defaults) : tierOverrides(raw, defaults, true);
}

/** The tiers as set, each one not set taking its default. */
export function tiersOf(db: DB): TierMap {
  const defaults = tierDefaults(db);
  return withDefaults(kept(db, defaults), defaults);
}

/** Keeps the tiers as sent (the whole table, or some picks): what differs from the defaults. */
export function setTiers(db: DB, v: unknown): TierMap {
  const defaults = tierDefaults(db);
  const picks = tierOverrides(v, defaults);
  kvSet(db, KEY, JSON.stringify({ v: 2, picks }));
  return withDefaults(picks, defaults);
}

/** A tier's model and effort for an agent program; null for the programs without tiers (ACP agents other than Custom). */
export function tierPick(db: DB, tier: Tier, agent: Agent, acpAgent?: string): TierPick | null {
  const p = tierProgram(agent, acpAgent);
  return p ? tiersOf(db)[p][tier] : null;
}

/** How sessions use the tiers: the team on or off, and Max for hard problems. */
export function teamOf(db: DB): TeamSettings {
  try {
    return cleanTeam(JSON.parse(kvGet(db, TEAM) ?? 'null'));
  } catch {
    return cleanTeam(null);
  }
}

/** Changes how sessions use the tiers: what is sent, the rest as it was. */
export function setTeam(db: DB, v: unknown): TeamSettings {
  const t = cleanTeam(v, teamOf(db));
  kvSet(db, TEAM, JSON.stringify(t));
  return t;
}

/**
 * The tier a session's model is for its program (`model` unset: the program's own default): the tier that names it,
 * or its family. Undefined for a model the tiers do not know, and for programs without tiers.
 */
export function tierOf(db: DB, o: { agent: Agent; acpAgent?: string; model?: string; effort?: string }): Tier | undefined {
  const p = tierProgram(o.agent, o.acpAgent);
  if (!p) return undefined;
  return tierOfModel(tiersOf(db)[p], seenModels(db)[p] ?? [], o.model, o.effort);
}

/** A model's name as people read it ("Fable 5.2" for claude-fable-5-2), from what its program listed; the name itself otherwise. */
export function modelName(db: DB, agent: Agent, acpAgent: string | undefined, model: string | undefined): string {
  const p = tierProgram(agent, acpAgent);
  const list = (p && seenModels(db)[p]) || [];
  const v = (model ?? '').toLowerCase();
  const hit = model ? (list.find((m) => m.value.toLowerCase() === v && m.value !== 'default') ?? list.find((m) => m.resolved?.toLowerCase() === v && m.value !== 'default')) : undefined;
  return hit?.label ?? model ?? '';
}
