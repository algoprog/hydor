// The model arena: one prompt to two or three models at once, their answers side by side, and the one you
// keep. Every pick counts toward which models win on your own tasks. What the server and the pages share.
import type { Agent } from './types.ts';

/** One of the models in a match: an agent and, unless it is the agent's default, its model. */
export interface Contender {
  agent: Agent;
  /** For agent "acp": which one ("console" is Custom). */
  acpAgent?: string;
  model?: string;
}

/** On the start page, in the new session's settings: the models to run the same prompt on beside it. */
export interface ArenaStart {
  with: Contender[];
}

export interface ArenaEntry extends Contender {
  key: string;
}

export interface ArenaMatch {
  id: string;
  prompt: string;
  createdAt: number;
  entries: ArenaEntry[];
  /** The session kept, once picked; the others were archived. */
  winner?: string;
  decidedAt?: number;
}

/** A model's record over the matches decided: its rating (Elo, from 1000), wins and matches. */
export interface ArenaStanding extends Contender {
  id: string;
  rating: number;
  wins: number;
  played: number;
}

export interface ArenaState {
  matches: ArenaMatch[];
  board: ArenaStanding[];
}

/** The most models in one match, the one started from the start page's row among them. */
export const ARENA_MAX = 3;

/** A model's identity across matches. */
export const contenderId = (c: Contender) => `${c.agent === 'acp' ? `acp:${c.acpAgent ?? ''}` : c.agent}|${c.model ?? ''}`;

/** The models a start page's settings ask for besides its own, when they make sense (an arena at most ARENA_MAX). */
export function arenaOf(extra: { arena?: unknown } | null | undefined): Contender[] | null {
  const a = extra?.arena as Partial<ArenaStart> | undefined;
  if (!a || typeof a !== 'object' || !Array.isArray(a.with)) return null;
  const out = a.with
    .filter((c): c is Contender => !!c && (c.agent === 'claude' || c.agent === 'codex' || (c.agent === 'acp' && typeof c.acpAgent === 'string')))
    .map((c) => ({ agent: c.agent, ...(c.agent === 'acp' ? { acpAgent: String(c.acpAgent) } : {}), ...(c.model ? { model: String(c.model) } : {}) }))
    .slice(0, ARENA_MAX - 1);
  return out.length ? out : null;
}
