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

/** A child's turn as its parent was told of it (server/children resultMessage): the parent's conversation shows it as one line. */
export interface ChildReply {
  title: string;
  key: string;
  /** "Claude Code · claude-opus-5-5". */
  label: string;
  ended: 'replied' | 'stopped' | 'failed';
  /** Why it was stopped, or its error. */
  why?: string;
  /** The reply's length when `text` is the helper model's summary of it. */
  summaryOf?: number;
  /** What it wrote, or the summary of a long reply; empty when it wrote nothing. */
  text: string;
}

const REPLIED = /^\[Reply from the child session "(.*)" \(([^\s,()]+), (.*)\)\]$/;
const STOPPED = /^\[The child session "(.*)" \(([^\s,()]+), (.*?)\) was stopped before it finished(?:: (.*?))?\.(?: What it wrote is below\.)?\]$/;
const FAILED = /^\[The child session "(.*)" \(([^\s,()]+), (.*?)\) stopped with an error: (.*)\]$/;
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
  else return null;
  if (rest.startsWith('(It wrote no reply.')) return { ...who, text: '' };
  const s = SUMMARY.exec(rest);
  if (!s) return { ...who, text: rest.trim() };
  const cut = rest.indexOf('\n\n');
  return { ...who, summaryOf: Number(s[1].replace(/,/g, '')), text: cut === -1 ? '' : rest.slice(cut + 2).trim() };
}
