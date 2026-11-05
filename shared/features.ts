// What the app's capabilities (search, browser, memory, assistants…) share between server and pages:
// the settings a session keeps beyond its agent's own, and the notes the app adds to a conversation.
import type { ArenaStart } from './arena.ts';
import type { ResearchSettings } from './research.ts';

/** Settings a session keeps beyond its agent's own. Each capability reads and writes its own fields. */
export interface SessionExtra {
  /** Memory: false turns it off for this session. */
  memory?: boolean;
  /** The assistant it started as (Researcher, Writer…). */
  assistant?: string;
  /** Most this session may spend, in US dollars (API prices); none when unset. */
  capUsd?: number;
  /** The session that started this one, for a child session. */
  parent?: string;
  /** Swarm: this session leads a team of agents that attack its task from different angles (true), or a campaign that makes one big change part by part ("campaign"). */
  swarm?: boolean | 'campaign';
  /** Deep research: this session leads a research, with these settings (shared/research.ts). */
  research?: ResearchSettings;
  /** The arena: on the start page, the other models to run the same prompt on; on a session, its match's id. */
  arena?: ArenaStart | string;
  /** The space it belongs to (shared/spaces.ts), by its id. */
  space?: string;
  /** Agent Guidelines for this session alone (shared/guidelines.ts). */
  guidelines?: string;
  /** Confidential: models on this computer only, nothing sent out, commands without network (shared/confidential.ts). Set when it starts, never removed. */
  confidential?: true;
  /** Any other capability's settings, under its own name. */
  [field: string]: unknown;
}

/**
 * Something the app adds to a conversation beside what the agent wrote: a memory update, a second
 * opinion, a spending cap reached. It shows with the turn of its anchor, or at the end without one.
 */
export interface SessionNote {
  id: string;
  key: string;
  /** Which capability shows it: "memory", "opinion", "budget"… */
  kind: string;
  at: number;
  /** The timeline item it follows (usually the reply it is about). */
  anchor?: string;
  data: unknown;
}
