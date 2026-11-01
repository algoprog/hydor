// Child sessions: an agent hands a part of its job to a new session, which works in parallel and whose
// reply comes back to it as a message.
import type { Agent } from './types.ts';

/** A note of kind "child": the card a child session gets in its parent's conversation. */
export interface ChildNote {
  child: string;
  agent: Agent;
  /** For an ACP agent: which one, and its name ("Custom"). */
  acpAgent?: string;
  acpName?: string;
  model?: string;
  /** "Custom · Qwen3 Coder", "Claude Code · sonnet". */
  label: string;
  title: string;
  /** The start of its brief. */
  brief: string;
  cwd: string;
  worktree?: boolean;
  capUsd?: number;
  startedAt: number;
}

/** Settings → Child sessions. */
export interface ChildSettings {
  /** How many children of one session may work at the same time. */
  maxRunning: number;
  /** How many members of a swarm may work at the same time. */
  swarmSize: number;
}

export const MAX_RUNNING_DEFAULT = 4;
export const MAX_RUNNING_LIMIT = 12;
export const SWARM_SIZE_DEFAULT = 5;
export const SWARM_SIZE_LIMIT = 16;
