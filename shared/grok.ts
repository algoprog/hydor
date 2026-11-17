// Grok Build, xAI's coding agent (the `grok` program): an ACP agent like the others in Settings → More agents, and the one
// among them whose sign-ins the app manages as accounts (a Grok subscription, several of them with GROK_HOME folders).
import type { AccountAgent, Agent } from './types.ts';

/** Its preset's id (server/agents/acp.ts). */
export const GROK_ID = 'grok';

/** Whether an ACP agent is Grok Build: the preset, or one of yours that runs the grok program. */
export function isGrok(def: { id: string; command: string } | null | undefined): boolean {
  return !!def && (def.id === GROK_ID || /(^|[\\/])grok(\.exe|\.cmd)?$/i.test(def.command.trim()));
}

/** Whose accounts a session can run as: Claude Code's, Codex's, Grok Build's, or none (another ACP agent). */
export function accountAgentOf(agent: Agent, acp?: { id: string; command: string } | null): AccountAgent | null {
  if (agent === 'claude' || agent === 'codex') return agent;
  return isGrok(acp) ? 'grok' : null;
}

/** The programs' names, as the app shows them. */
export const ACCOUNT_AGENT_NAMES: Record<AccountAgent, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok Build' };
