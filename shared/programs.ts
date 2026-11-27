// Claude Code and Codex as programs a session may run on: whether each is signed in here (server/agents/programs.ts
// reads it, and the pages get it with the bootstrap and as it changes), what a new session runs on when nobody picked,
// and the words that say why a program cannot be used. Custom and the other agents need no sign-in of Hydor's to know.
import type { Agent } from './types.ts';

export type Program = 'claude' | 'codex';

export const PROGRAM_IDS: Program[] = ['claude', 'codex'];

export const PROGRAM_LABEL: Record<Program, string> = { claude: 'Claude Code', codex: 'Codex' };

/** Whether Claude Code and Codex are signed in here (any account of theirs). */
export type ProgramStatus = Record<Program, boolean>;

export const isProgram = (agent: unknown): agent is Program => agent === 'claude' || agent === 'codex';

/** Whether a session may be offered `agent`: all but a Claude Code or Codex known not to be signed in (`status` absent: not known yet, so offered). */
export const programUsable = (status: ProgramStatus | null | undefined, agent: unknown): boolean => !isProgram(agent) || status?.[agent] !== false;

/** What runs a session when nobody picked: the first signed in of Claude Code and Codex, else Custom. */
export function firstUsableProgram(status: ProgramStatus | null | undefined): { agent: Agent; acp: string | null } {
  const p = PROGRAM_IDS.find((id) => programUsable(status, id));
  return p ? { agent: p, acp: null } : { agent: 'acp', acp: 'console' };
}

/** An agent by the start page's name for it ('claude', 'codex', 'acp:<id>'); null for anything else. */
export function parseAgentKey(k: string | undefined): { agent: Agent; acp: string | null } | null {
  if (isProgram(k)) return { agent: k, acp: null };
  if (k?.startsWith('acp:') && k.length > 4) return { agent: 'acp', acp: k.slice(4) };
  return null;
}

/**
 * What a new session opens with: the agent picked last (`saved`), kept as picked even when its program has been signed
 * out since (the picker says so); the first time, or when that agent is gone, firstUsableProgram.
 */
export function agentToOpen(saved: string | undefined, acpAgents: { id: string }[] | undefined, status: ProgramStatus | null | undefined): { agent: Agent; acp: string | null } {
  const a = parseAgentKey(saved);
  const gone = a?.agent === 'acp' && acpAgents && !acpAgents.some((x) => x.id === a.acp);
  return a && !gone ? a : firstUsableProgram(status);
}

/** Why a session on the program is refused. */
export const notSetUpMessage = (p: Program): string => `${PROGRAM_LABEL[p]} is not signed in here: sign in to it in Settings → Agents → Accounts, or pick another agent.`;
