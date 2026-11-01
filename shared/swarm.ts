// Swarm: a session that leads a team of agents on a hard problem. Its members are child sessions, each
// attacking the problem from its own angle; they post what they try and find to the swarm's board, read
// each other's posts and message each other. The lead hears of the board as it goes, steers, starts more
// members as some finish, and gives the user the checked answer.

export type SwarmKind = 'progress' | 'finding' | 'question' | 'note';

export const SWARM_KINDS: SwarmKind[] = ['progress', 'finding', 'question', 'note'];

/** A post on a swarm's board. */
export interface SwarmPost {
  id: number;
  /** The lead session's key, which names the swarm. */
  swarm: string;
  /** Who wrote it: a member's session key, or the lead's. */
  from: string;
  /** For one member or the lead; everyone when unset. */
  to?: string;
  kind: SwarmKind;
  text: string;
  at: number;
}

/** GET /api/swarm/:key: a swarm's board. */
export interface SwarmBoard {
  swarm: string;
  /** How many members may work at once (Settings → Child sessions). */
  size: number;
  /** Its members' session keys, oldest first. */
  members: string[];
  /** Members the lead (or the user) stopped. */
  stopped: string[];
  /** The latest posts, oldest first. */
  posts: SwarmPost[];
}

/** Whether a session's settings make it a swarm's lead. */
export const leadsSwarm = (extra: { swarm?: unknown } | null | undefined): boolean => extra?.swarm === true;
