// Hydor subagents (child sessions in the code): an agent hands a part of its job to a new session, which works in parallel and
// whose reply comes back to it as a message.
import type { Tier } from './tiers.ts';
import type { Agent } from './types.ts';

/** A note of kind "child": the card a child session gets in its parent's conversation. */
export interface ChildNote {
  child: string;
  agent: Agent;
  /** For an ACP agent: which one, and its name ("Custom"). */
  acpAgent?: string;
  acpName?: string;
  model?: string;
  /** Who it is, as its lead was told: its program and model ("Custom · Qwen3 Coder"), after the agent of yours it works as and
   * before its tier when it has them ("Translator · Claude Code · haiku · Quick"). childLabel gives the program and model alone. */
  label: string;
  title: string;
  /** The start of its brief. */
  brief: string;
  cwd: string;
  worktree?: boolean;
  capUsd?: number;
  /** One of the user's agents it works as: its name then, and its id. */
  as?: string;
  asId?: string;
  /** The tier it was given (or the named agent's own). */
  tier?: Tier;
  /** It runs again one tier up: the child it takes over from, that child's tier, and why it fell short. */
  steppedFrom?: { key: string; tier: Tier; why: string };
  startedAt: number;
}

/** A child's program and model ("Claude Code · sonnet"): its label without the agent of yours it works as and its tier, which its
 * card and the terminal show by themselves (a tier's label is its id, capitalised; this also reads tiers newer than this version). */
export function childLabel(n: Pick<ChildNote, 'label' | 'as' | 'tier'>): string {
  let l = n.label;
  if (n.as && l.startsWith(`${n.as} · `)) l = l.slice(n.as.length + 3);
  const cut = l.lastIndexOf(' · ');
  if (n.tier && cut > 0 && l.slice(cut + 3).toLowerCase() === n.tier.toLowerCase()) l = l.slice(0, cut);
  return l;
}

/** Settings → Capabilities → Subagents. */
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

/** A child's turn as its parent was told of it (server/children resultMessage): the parent's conversation shows it as one line. */
export interface ChildReply {
  title: string;
  key: string;
  /** "Claude Code · claude-opus-5-5". */
  label: string;
  /** continues: a usage limit stopped its turn, and it carries on (with another account, on API credit, or once the limit lifts). */
  ended: 'replied' | 'stopped' | 'failed' | 'continues';
  /** Why it was stopped, its error, or how it carries on ("with Work 2, an account with usage left"). */
  why?: string;
  /** The reply's length when `text` is the helper model's summary of it. */
  summaryOf?: number;
  /** What it wrote, or the summary of a long reply; empty when it wrote nothing. */
  text: string;
}

const REPLIED = /^\[Reply from the (?:Hydor subagent|child session) "(.*)" \(([^\s,()]+), (.*)\)\]$/;
const STOPPED = /^\[The (?:Hydor subagent|child session) "(.*)" \(([^\s,()]+), (.*?)\) was stopped before it finished(?:: (.*?))?\.(?: What it wrote is below\.)?\]$/;
const FAILED = /^\[The (?:Hydor subagent|child session) "(.*)" \(([^\s,()]+), (.*?)\) stopped with an error: (.*)\]$/;
const CONTINUES = /^\[The (?:Hydor subagent|child session) "(.*)" \(([^\s,()]+), (.*?)\) reached a usage limit and carries on(?: (.*?))?\.\]$/;
const SUMMARY = /^Its reply is long \(([\d,]+) characters\), so here is a summary\./;

/** A message that is a child's reply, read back; null for any other message. */
export function childReplyOf(message: string): ChildReply | null {
  if (!message.startsWith('[')) return null;
  const nl = message.indexOf('\n');
  const head = nl === -1 ? message : message.slice(0, nl);
  const rest = nl === -1 ? '' : message.slice(nl + 1);
  let m: RegExpExecArray | null;
  let who: Omit<ChildReply, 'text'>;
  if ((m = REPLIED.exec(head))) who = { title: m[1], key: m[2], label: m[3], ended: 'replied' };
  else if ((m = STOPPED.exec(head))) who = { title: m[1], key: m[2], label: m[3], ended: 'stopped', ...(m[4] ? { why: m[4] } : {}) };
  else if ((m = FAILED.exec(head))) who = { title: m[1], key: m[2], label: m[3], ended: 'failed', why: m[4] };
  // What follows is for the agent alone: its reply comes later, in a message of its own.
  else if ((m = CONTINUES.exec(head))) return { title: m[1], key: m[2], label: m[3], ended: 'continues', ...(m[4] ? { why: m[4] } : {}), text: '' };
  else return null;
  if (rest.startsWith('(It wrote no reply.')) return { ...who, text: '' };
  const s = SUMMARY.exec(rest);
  if (!s) return { ...who, text: rest.trim() };
  const cut = rest.indexOf('\n\n');
  return { ...who, summaryOf: Number(s[1].replace(/,/g, '')), text: cut === -1 ? '' : rest.slice(cut + 2).trim() };
}
