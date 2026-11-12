// Swarm: a session that leads a team of agents. Its members are Hydor subagents; they post what they try and
// find to the swarm's board, read each other's posts and message each other, and the lead hears of the board
// as it goes. Two kinds: a swarm attacks a hard problem, each member from its own angle, and the lead gives the
// user the checked answer; a campaign makes one big change in many parts (a migration, a rename across a
// codebase), each member doing one part in a worktree of its own with its tests, and the lead merges the
// finished parts. A campaign's board also keeps its parts: the lead's plan names them, and the members' posts
// about each say how it stands.

export type SwarmKind = 'progress' | 'finding' | 'question' | 'note' | 'plan' | 'done' | 'failed';

/** What a swarm's posts can be. */
export const SWARM_KINDS: SwarmKind[] = ['progress', 'finding', 'question', 'note'];
/** What a campaign's can be: its plan, and each part done or failed, too. */
export const CAMPAIGN_KINDS: SwarmKind[] = ['plan', 'progress', 'done', 'failed', 'finding', 'question', 'note'];

/** Which kind of team a session leads. */
export type SwarmMode = 'swarm' | 'campaign';

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
  /** In a campaign: the part it is about, as the plan names it. */
  part?: string;
  /** A campaign's plan: every part, in the order they are to be done. */
  parts?: string[];
}

export type PartStatus = 'waiting' | 'working' | 'done' | 'failed';

/** A part of a campaign, as its board's posts say it stands. */
export interface CampaignPart {
  name: string;
  status: PartStatus;
  /** The member that last posted about it. */
  member?: string;
  /** The latest post about it, in short. */
  note?: string;
  /** Times it failed. */
  tries: number;
  /** When it last changed. */
  at?: number;
}

/** GET /api/swarm/:key: a swarm's board. */
export interface SwarmBoard {
  swarm: string;
  mode: SwarmMode;
  /** How many members may work at once (Settings → Capabilities → Subagents). */
  size: number;
  /** Its members' session keys, oldest first. */
  members: string[];
  /** Members the lead (or the user) stopped. */
  stopped: string[];
  /** The latest posts, oldest first. */
  posts: SwarmPost[];
  /** A campaign's parts, from all its posts, in the plan's order. */
  parts?: CampaignPart[];
}

/** The kind of team a session's settings make it lead: a swarm (`swarm: true`), a campaign (`swarm: 'campaign'`), or none. */
export const swarmMode = (extra: { swarm?: unknown } | null | undefined): SwarmMode | null => (extra?.swarm === true ? 'swarm' : extra?.swarm === 'campaign' ? 'campaign' : null);

/** Whether a session's settings make it a swarm's lead (of either kind). */
export const leadsSwarm = (extra: { swarm?: unknown } | null | undefined): boolean => swarmMode(extra) !== null;

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** A part's name as the plan has it (any case), if it has one by that name. */
export function partNamed<T extends { name: string }>(parts: T[], name: string): T | undefined {
  const w = name.trim().toLowerCase();
  return parts.find((p) => p.name.toLowerCase() === w);
}

/**
 * A campaign's parts, read from its posts in order (on top of `start`, the parts as they stood before them): the
 * latest plan names the parts and their order (a part it keeps keeps how it stands); a post about a part makes it
 * working (progress), done or failed, and remembers who posted it and what it said.
 */
export function campaignParts(posts: SwarmPost[], start: CampaignPart[] = []): CampaignPart[] {
  let parts = start.map((p) => ({ ...p }));
  for (const p of posts) {
    if (p.kind === 'plan' && p.parts?.length) {
      const had = new Map(parts.map((x) => [x.name.toLowerCase(), x]));
      parts = p.parts.map((name) => had.get(name.toLowerCase()) ?? { name, status: 'waiting', tries: 0 });
      continue;
    }
    const x = p.part ? partNamed(parts, p.part) : undefined;
    if (!x) continue;
    if (p.from !== p.swarm) x.member = p.from;
    if (p.kind === 'progress') x.status = 'working';
    else if (p.kind === 'done') x.status = 'done';
    else if (p.kind === 'failed') {
      x.status = 'failed';
      x.tries++;
    }
    x.note = clip(p.text, 240);
    x.at = p.at;
  }
  return parts;
}

/** How many parts stand where: for the bar's "12 of 40 parts done · 2 failed". */
export function partsTally(parts: CampaignPart[]): Record<PartStatus, number> & { total: number } {
  const n = { total: parts.length, waiting: 0, working: 0, done: 0, failed: 0 };
  for (const p of parts) n[p.status]++;
  return n;
}
