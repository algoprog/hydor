// The reasoning efforts of Custom's models: which values there are, which each model offers, and what an endpoint's model
// is set to. Shared by the server (the pickers, the settings), Custom's agent (what it accepts and sends) and the page.
import type { AgentModel } from './types.ts';

/**
 * The efforts OpenRouter documents for `reasoning.effort`, lowest first
 * (openrouter.ai/docs/guides/best-practices/reasoning-tokens): also the ones an endpoint's levels are ticked from.
 */
export const KNOWN_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** The levels of an endpoint's model that reasons, until set otherwise. */
export const ENDPOINT_EFFORTS = ['low', 'medium', 'high'];

/** What Custom asks an OpenRouter model for when no effort is picked. */
export const OPENROUTER_EFFORT = 'medium';

/** A level typed by hand: one word, as a server takes it. "default" is the menu's own (nothing picked). */
export const isEffortName = (v: string) => /^[a-z0-9][a-z0-9_.-]{0,31}$/.test(v) && v !== 'default';

/** Each once: the known ones lowest first, then any others in the order given. */
export function orderEfforts(list: string[]): string[] {
  const all = [...new Set(list)];
  return [...KNOWN_EFFORTS.filter((v) => all.includes(v)), ...all.filter((v) => !KNOWN_EFFORTS.includes(v))];
}

/**
 * The efforts a model of Custom's offers, when it reasons: your plans' as their programs list them, OpenRouter's as its
 * catalog does, your endpoints' as set; none for the others.
 */
export function effortsOf(m: Pick<AgentModel, 'provider' | 'reasoning' | 'efforts'>): string[] {
  if (!m.reasoning) return [];
  if (m.provider === 'endpoint') return m.efforts ?? ENDPOINT_EFFORTS;
  if (m.provider === 'openrouter' || m.provider === 'claude' || m.provider === 'codex') return m.efforts ?? [];
  return [];
}

/**
 * What a session on a model may be set to: its levels, else low, medium and high (kept for the session, and sent only
 * where a model takes one).
 */
export function acceptedEfforts(m: Pick<AgentModel, 'provider' | 'reasoning' | 'efforts'> | undefined): string[] {
  const own = m ? effortsOf(m) : [];
  return own.length ? own : ENDPOINT_EFFORTS;
}
