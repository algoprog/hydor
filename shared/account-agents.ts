// The programs whose sign-ins the app manages as accounts (Settings → Agents → Accounts): Claude Code and Codex, and two of
// the ACP agents in Settings → More agents, Grok Build (the `grok` program, a Grok subscription) and Antigravity CLI (the
// `agy` program, a Google account with Google AI Pro or Ultra, or Antigravity's free plan). Claude Code, Codex and Grok Build
// can have more than one account, each in a folder of its own (server/accounts.ts); Antigravity CLI has only its own sign-in,
// since Google's terms for its consumer plans rule out switching accounts automatically.
import type { AccountAgent, Agent } from './types.ts';

/** Grok Build's preset id (server/agents/acp.ts). */
export const GROK_ID = 'grok';
/** Antigravity CLI's preset id (server/agents/acp.ts). */
export const ANTIGRAVITY_ID = 'antigravity';

type Def = { id: string; command: string } | null | undefined;
/** The agent's command is the program itself (with its Windows ending), wherever it is. */
const runs = (def: { command: string }, program: string) => new RegExp(`(^|[\\\\/])${program}(\\.exe|\\.cmd)?$`, 'i').test(def.command.trim());

/** Whether an ACP agent is Grok Build: the preset, or one of yours that runs the grok program. */
export function isGrok(def: Def): boolean {
  return !!def && (def.id === GROK_ID || runs(def, 'grok'));
}

/** Whether an ACP agent is Antigravity CLI: the preset, or one of yours that runs the agy program. */
export function isAntigravity(def: Def): boolean {
  return !!def && (def.id === ANTIGRAVITY_ID || runs(def, 'agy'));
}

/** The ACP agents with accounts: which of them an ACP agent is (Grok Build, Antigravity CLI), or null for the others. */
export function acpAccountAgent(def: Def): 'grok' | 'antigravity' | null {
  return isGrok(def) ? 'grok' : isAntigravity(def) ? 'antigravity' : null;
}

/** Whose accounts a session can run as: Claude Code's, Codex's, Grok Build's, Antigravity CLI's, or none (another ACP agent). */
export function accountAgentOf(agent: Agent, acp?: Def): AccountAgent | null {
  if (agent === 'claude' || agent === 'codex') return agent;
  return acpAccountAgent(acp);
}

/** Whether a program with accounts is one of the ACP agents (its sessions are ACP sessions of its preset). */
export const isAcpAccountAgent = (a: AccountAgent | null | undefined): a is 'grok' | 'antigravity' => a === 'grok' || a === 'antigravity';

/** Whether more accounts can be added for a program: not for Antigravity CLI (one Google sign-in, never switched automatically). */
export const takesAddedAccounts = (a: AccountAgent): boolean => a !== 'antigravity';

/** The preset id of each ACP agent with accounts: the start page keeps its picks under acp:<id>. */
export const ACP_ACCOUNT_IDS: Record<'grok' | 'antigravity', string> = { grok: GROK_ID, antigravity: ANTIGRAVITY_ID };

/** The programs' names, as the app shows them. */
export const ACCOUNT_AGENT_NAMES: Record<AccountAgent, string> = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok Build', antigravity: 'Antigravity CLI' };
