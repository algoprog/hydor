// Tiers: models picked by the job rather than by name. Quick for small, very clear jobs, Standard for clear tasks of
// medium size, Best for a session's main agent (it plans, leads helpers and checks their work) and Max for the hardest
// problems. Settings → Models → Tiers names each tier's model (and effort) for each agent program; until one is
// changed it is the newest model of its family the program offers (Haiku, Sonnet, Opus and Fable for Claude Code).
// A session started on Automatic thinks with Best, or with Max when its request reads as a hard problem, and hands
// clear parts to helpers on Standard and Quick: the team. An agent of the user's thinks with one tier, or with
// Automatic, and a lead gives each helper it starts one, never above its own.
import type { Agent, ModelOption } from './types.ts';

export type Tier = 'quick' | 'standard' | 'best' | 'max';

export const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: 'quick', label: 'Quick', hint: 'The cheapest: small, very clear jobs whose result can be checked (a targeted edit, pulling out facts, sorting, formatting, short summaries)' },
  { id: 'standard', label: 'Standard', hint: 'Clear tasks of medium size: a change that is spelled out, tests, research on a set question, a draft to an outline' },
  { id: 'best', label: 'Best', hint: 'The main agent: it works out what is asked, plans, leads helpers and checks their work' },
  { id: 'max', label: 'Max', hint: 'The strongest: the hardest problems (stubborn bugs, proofs, designs with many constraints)' },
];

export const isTier = (v: unknown): v is Tier => v === 'quick' || v === 'standard' || v === 'best' || v === 'max';

export const tierLabel = (t: Tier | undefined): string => TIERS.find((x) => x.id === t)?.label ?? 'Automatic';

/** The model a session names to start on Automatic: the server picks Best's, or Max's for a hard problem. */
export const AUTO_MODEL = 'auto';

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
/** Only the picks that differ from the defaults: what is kept. */
export type TierOverrides = Partial<Record<TierProgram, Partial<Record<Tier, TierPick>>>>;

/** How sessions use the tiers (Settings → Models → Tiers). */
export interface TeamSettings {
  /** A session's main agent leads helpers: it is told to hand clear parts to helpers on cheaper tiers, and a helper asked for with no tier gets Standard. */
  on: boolean;
  /** Hard problems get Max: Automatic starts one there, and a main agent may step itself up when a problem proves harder than it looked. */
  hard: boolean;
}
export const DEFAULT_TEAM: TeamSettings = { on: true, hard: true };

export const cleanTeam = (v: unknown, base: TeamSettings = DEFAULT_TEAM): TeamSettings => {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  return { on: typeof o.on === 'boolean' ? o.on : base.on, hard: typeof o.hard === 'boolean' ? o.hard : base.hard };
};

// ---- a model's family ----------------------------------------------------------------------------

/** "Opus 5.5" → opus [5, 5]; "GPT-6-Luna" → gpt luna [6]: models of one family differ only in their version. */
export function modelFamily(label: string): { name: string; version: number[] } | null {
  const m = /\d+(?:[.-]\d+)*/.exec(label);
  if (!m) return null;
  const name = (label.slice(0, m.index) + ' ' + label.slice(m.index + m[0].length)).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
  return { name, version: m[0].split(/[.-]/).map(Number) };
}

/** Whether version `a` is newer than `b` ([5, 5] is newer than [5]). */
export const newerVersion = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
};

/** What a model list needs to say of each model for tiers: its name there, what it shows as, and what an alias stands for. */
export type KnownModel = Pick<ModelOption, 'value' | 'label'> & { resolved?: string; isDefault?: boolean };

/** The newest model of a family ("fable", "terra") in a program's list; the one listed first when two are as new. */
function newestOf(models: KnownModel[], fam: string): KnownModel | undefined {
  let best: { m: KnownModel; v: number[] } | undefined;
  for (const m of models) {
    if (m.value === 'default' || !`${m.label} ${m.value}`.toLowerCase().split(/[^a-z]+/).includes(fam)) continue;
    // A date at the end of an id (claude-haiku-4-5-20251001) is not its version: the label says that.
    const v = modelFamily(m.label)?.version ?? modelFamily(m.value)?.version ?? [];
    if (!best || newerVersion(v, best.v)) best = { m, v };
  }
  return best?.m;
}

// ---- what each tier means until it is changed ----------------------------------------------------

/** Each tier's families for a program, the one wanted first: the newest model of the first family the program offers. */
const FAMILIES: Record<'claude' | 'codex', Record<Tier, string[]>> = {
  claude: { quick: ['haiku'], standard: ['sonnet'], best: ['opus'], max: ['fable', 'opus'] },
  // Three models for four tiers: small jobs go to the Standard model at low effort.
  codex: { quick: ['terra', 'luna'], standard: ['terra', 'luna'], best: ['sol', 'terra'], max: ['astra', 'sol', 'terra'] },
};

/** Before a program has said which models it offers: Claude Code's own names for its families; Codex's default model at each effort. */
const UNSEEN: TierMap = {
  claude: { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus' }, max: { model: 'fable' } },
  codex: { quick: { effort: 'low' }, standard: { effort: 'medium' }, best: { effort: 'high' }, max: { effort: 'xhigh' } },
  console: { quick: {}, standard: {}, best: {}, max: {} },
};

/** What Settings → Models → Tiers held before 0.52 when nothing was changed: kept tables from then drop these. */
const LEGACY: Partial<Record<TierProgram, Partial<Record<Tier, TierPick>>>> = {
  claude: { quick: { model: 'haiku' }, standard: { model: 'sonnet' }, best: { model: 'opus' } },
  codex: { quick: { effort: 'low' }, standard: { effort: 'medium' }, best: { effort: 'high' } },
  console: { quick: {}, standard: {}, best: {} },
};

const samePick = (a?: TierPick, b?: TierPick) => (a?.model ?? '') === (b?.model ?? '') && (a?.effort ?? '') === (b?.effort ?? '');

/**
 * What each tier means until it is changed, from the models each program offers (`seen`; none yet: its own names):
 * Claude Code's Haiku, Sonnet, Opus and newest Fable; Codex's Terra (at low effort for Quick), Sol and Astra, or the
 * nearest it offers, with more effort where two tiers share a model; nothing for Custom (its models are the user's).
 */
export function defaultTiers(seen: Partial<Record<TierProgram, KnownModel[]>> = {}): TierMap {
  const out: TierMap = { claude: { ...UNSEEN.claude }, codex: { ...UNSEEN.codex }, console: { ...UNSEEN.console } };
  for (const p of ['claude', 'codex'] as const) {
    const models = seen[p];
    if (!models?.length) continue;
    for (const t of TIERS) {
      let m: KnownModel | undefined;
      for (const fam of FAMILIES[p][t.id]) if ((m = newestOf(models, fam))) break;
      // A family the program does not offer leaves the pick as it is before it is seen (Codex: its default model).
      const effort = UNSEEN[p][t.id].effort;
      out[p][t.id] = m ? { model: m.value, ...(effort ? { effort } : {}) } : { ...UNSEEN[p][t.id] };
    }
    // Codex: Max on its own model needs no more effort than Best.
    if (p === 'codex' && out.codex.max.model && out.codex.max.model !== out.codex.best.model) out.codex.max = { ...out.codex.max, effort: 'high' };
  }
  return out;
}

/** A pick as sent: its model and effort trimmed; null when it is not one. */
function cleanPick(v: unknown): TierPick | null {
  if (!v || typeof v !== 'object') return null;
  const pick = v as Record<string, unknown>;
  const model = typeof pick.model === 'string' ? pick.model.trim().slice(0, 200) : '';
  const effort = typeof pick.effort === 'string' ? pick.effort.trim().slice(0, 40) : '';
  return { ...(model ? { model } : {}), ...(effort ? { effort } : {}) };
}

/**
 * Tiers as sent or as kept (a whole table, or only some picks), checked: only what differs from the defaults is kept,
 * so a tier left alone follows its program's newest model. `legacy`: a table kept before 0.52, whose untouched picks
 * were written out too.
 */
export function tierOverrides(v: unknown, defaults: TierMap, legacy = false): TierOverrides {
  const out: TierOverrides = {};
  const src = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  for (const p of TIER_PROGRAMS) {
    const prog = src[p.id] && typeof src[p.id] === 'object' ? (src[p.id] as Record<string, unknown>) : {};
    for (const t of TIERS) {
      const pick = cleanPick(prog[t.id]);
      if (!pick || samePick(pick, defaults[p.id][t.id]) || (legacy && samePick(pick, LEGACY[p.id]?.[t.id] ?? { model: '\0' }))) continue;
      (out[p.id] ??= {})[t.id] = pick;
    }
  }
  return out;
}

/** The whole table: each pick as set, else its default. */
export function withDefaults(o: TierOverrides, defaults: TierMap): TierMap {
  const out = {} as TierMap;
  for (const p of TIER_PROGRAMS) {
    out[p.id] = {} as Record<Tier, TierPick>;
    for (const t of TIERS) out[p.id][t.id] = { ...(o[p.id]?.[t.id] ?? defaults[p.id][t.id]) };
  }
  return out;
}

/** Which program's tiers an agent uses; null for ACP agents other than Custom (they keep their own model). */
export const tierProgram = (agent: Agent, acpAgent?: string): TierProgram | null =>
  agent === 'claude' ? 'claude' : agent === 'codex' ? 'codex' : agent === 'acp' && acpAgent === 'console' ? 'console' : null;

const RANK: Record<Tier, number> = { quick: 0, standard: 1, best: 2, max: 3 };

/** How high a tier is: quick 0, standard 1, best 2, max 3. */
export const tierRank = (t: Tier): number => RANK[t];

/** The tier one step up; none above Max. */
export const nextTier = (t: Tier): Tier | undefined => (t === 'quick' ? 'standard' : t === 'standard' ? 'best' : t === 'best' ? 'max' : undefined);

/** A tier no higher than `max` ("never above"); `max` unset leaves it as it is. */
export const clampTier = (t: Tier, max?: Tier): Tier => (max && RANK[t] > RANK[max] ? max : t);

/** The lower of two tiers; one unset gives the other. */
export const lowerTier = (a?: Tier, b?: Tier): Tier | undefined => (!a ? b : !b ? a : RANK[a] <= RANK[b] ? a : b);

// ---- which tier a model is ------------------------------------------------------------------------

/** A model's name as its program resolves it ("opus" → claude-opus-5-5; a live session's "claude-opus-5-5[1m]" too), in lower case. */
function resolvedName(models: KnownModel[], model: string | undefined): string {
  const v = (model ?? '').toLowerCase().replace(/\[1m\]$/, '');
  const named = models.filter((m) => m.value !== 'default');
  const hit = !v || v === 'default' ? (models.find((m) => m.isDefault) ?? models[0]) : (named.find((m) => m.value.toLowerCase() === v) ?? named.find((m) => m.resolved?.toLowerCase() === v));
  return (hit?.resolved ?? hit?.value ?? v).toLowerCase();
}

/** One name is the other with its date ("claude-haiku-4-5-20251001" and "claude-haiku-4-5"). */
const dated = (long: string, short: string) => long.startsWith(short) && /^-\d{8}$/.test(long.slice(short.length));

/** Whether two names are the same model for a program: an alias and what it stands for, or an id with and without its date. */
export function sameModel(models: KnownModel[], a: string | undefined, b: string | undefined): boolean {
  const x = resolvedName(models, a);
  const y = resolvedName(models, b);
  return !!x && !!y && (x === y || dated(x, y) || dated(y, x));
}

/** What says which family a model is, whatever its version: "claude-opus-4-8" and "opus" are both "opus", "gpt-5.6-terra" is "terra". */
function familyWords(models: KnownModel[], model: string | undefined): string {
  return resolvedName(models, model)
    .split(/[^a-z]+/)
    .filter((w) => w && w !== 'claude' && w !== 'gpt' && w !== 'latest' && w !== 'preview')
    .join(' ');
}

/**
 * The tier a model is in a program's tiers: the highest that names it (with `effort`, the one at that effort when
 * several name the model), else the highest that names a model of its family (an older Opus where Best is Opus).
 * Undefined when none does: a model the tiers do not know.
 */
export function tierOfModel(picks: Record<Tier, TierPick>, models: KnownModel[], model: string | undefined, effort?: string): Tier | undefined {
  const down = [...TIERS].reverse().filter((t) => picks[t.id].model);
  const hits = down.filter((t) => sameModel(models, picks[t.id].model, model));
  if (hits.length) return (effort ? hits.find((t) => picks[t.id].effort === effort) : undefined)?.id ?? hits[0].id;
  const fam = familyWords(models, model);
  return fam ? down.find((t) => familyWords(models, picks[t.id].model) === fam)?.id : undefined;
}
