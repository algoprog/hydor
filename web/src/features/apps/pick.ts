// What a ready-made app's page starts with, and what it keeps for next time. The program (agent) and the mode are
// remembered for every ready-made app; the model, tier and effort for each app on its own, and only when the person
// changed them on that app's page: an app they never changed starts on its own tier, and setting a pick back to the
// app's own forgets it. (The first version of this kept the whole pick under one key for all apps, so one run of a
// Best app made every other start on Best: from that key only the program and mode are read.)
import type { Agent } from '@shared/types';
import type { Tier } from '@shared/tiers';

/** What every ready-made app shares. */
export interface Program {
  agent: Agent;
  acpAgent?: string | null;
  mode?: string | null;
}

/** What one app keeps apart: the model by name or the tier it thinks with, and the effort. */
export interface Thinks {
  model: string | null;
  tier: Tier | null;
  effort: string | null;
}

/** The parts of an app's own recipe that the page starts from. */
export interface Own {
  agent: Agent;
  model?: string;
  tier?: Tier;
  effort?: string;
  mode?: string;
}

/** The app's own: a model named wins over its tier. */
export const ownThinks = (r: Own): Thinks => ({ model: r.model ?? null, tier: r.model ? null : (r.tier ?? null), effort: r.effort ?? null });

/** Where the choices are kept: the shared one (also read from the old key's program and mode), and one for each app. */
export const PROGRAM_KEY = 'wa.apps.agent';
export const thinksKey = (app: string) => `wa.apps.pick.${app}`;

const read = (raw: string | null): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(raw ?? 'null');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};
const text = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The program and mode to start with: the remembered ones, else the app's own. */
export function startingProgram(raw: string | null, own: Own): { agent: Agent; acpAgent: string | null; mode: string | null } {
  const r = read(raw);
  return { agent: (text(r?.agent) as Agent | null) ?? own.agent, acpAgent: text(r?.acpAgent), mode: text(r?.mode) };
}

/** The model, tier and effort to start with: what was kept for this app, else the app's own. */
export function startingThinks(raw: string | null, own: Own): Thinks {
  const r = read(raw);
  if (!r) return ownThinks(own);
  const model = text(r.model);
  return { model, tier: model ? null : (text(r.tier) as Tier | null), effort: text(r.effort) };
}

/** What to keep for this app after a run: its pick when it differs from the app's own, null (forget) when it does not. */
export function thinksToKeep(now: Thinks, own: Own): Thinks | null {
  const o = ownThinks(own);
  const model = now.model ?? null;
  const tier = model ? null : (now.tier ?? null);
  const effort = now.effort ?? null;
  return model === o.model && tier === o.tier && effort === o.effort ? null : { model, tier, effort };
}
