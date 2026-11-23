// The ACP agents whose sign-ins the app manages as accounts, Grok Build and Antigravity CLI (shared/account-agents.ts): the
// control of each of their accounts, whichever program it is for. Each program's own module says how it signs in, reads
// its plan's usage and lists its models (grok.ts, antigravity.ts); the sessions and the server ask through this one.
import type { AccountStatus, AgentUsage, LoginFlow, ModelOption } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { antigravityControl, dropAntigravityControl } from './antigravity.ts';
import { dropGrokControl, grokControl } from './grok.ts';

export type AcpAccountAgent = 'grok' | 'antigravity';

/** What the app asks of an account of an ACP agent. */
export interface AcpAccountControl {
  /** The last reading of the plan's usage (also one that failed). */
  lastUsage: AgentUsage | null;
  /** The email this account was last seen signed in as, to name it in notes. */
  email?: string;
  usage(): Promise<AgentUsage>;
  /** The program's models for this account, with the efforts each takes (before any session: the start page's pickers). */
  models(): Promise<ModelOption[]>;
  account(): Promise<AccountStatus>;
  startLogin(): Promise<LoginFlow>;
  /** A sign-in that ends with a code pasted back from the browser (Antigravity CLI's). */
  submitCode?(flowId: string, code: string): LoginFlow;
  cancelLogin(flowId: string): void;
  logout(): Promise<void>;
}

/** The control of an account of an ACP agent: the program's own sign-in (none), or an added account by its id. */
export function acpControl(db: DB, agent: AcpAccountAgent, account?: string | null): AcpAccountControl {
  return agent === 'grok' ? grokControl(db, account) : antigravityControl(db, account);
}

/** An added account was removed: a sign-in that runs for it stops, and its control goes. */
export function dropAcpControls(id: string) {
  dropGrokControl(id);
  dropAntigravityControl(id);
}
