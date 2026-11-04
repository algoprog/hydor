// Where a session was started: here, in Hydor, or in another app whose Claude Code and Codex sessions the app lists
// too (VS Code, a terminal, Claude's desktop app, a script), by what the agent wrote down as it started (Claude
// Code's entrypoint, Codex's source). A session's Info says it ("Started from"), and the sidebar marks a folder
// whose sessions were all started elsewhere with where they came from (features/sessions/groups.ts).
import type { Agent, SessionSummary } from '@shared/types';

/** The app a session was started in, by what its agent wrote down. */
const STARTED_IN: Record<string, string> = {
  'claude-vscode': 'VS Code',
  vscode: 'VS Code',
  cli: 'Terminal',
  'claude-desktop': 'Claude desktop',
  'sdk-cli': 'Another app',
  'sdk-ts': 'Another app',
  'sdk-py': 'Another app',
  mcp: 'Another app',
  exec: 'codex exec',
  subagent: 'A sub-agent',
};

type Origin = Pick<SessionSummary, 'agent' | 'createdByApp' | 'source'>;

/** Hydor started it: from the start page, a scheduled task, an app's run, another session… (other agents run only here). */
export const startedHere = (s: Origin) => !!s.createdByApp || s.agent === 'acp';

/** Where it was started, as its Info names it: "Hydor", "VS Code", "Terminal"…; undefined when its agent did not say. */
export function startedIn(s: Origin): string | undefined {
  if (startedHere(s)) return 'Hydor';
  return s.source ? (STARTED_IN[s.source] ?? s.source) : undefined;
}

/** Where the sessions of a folder that came from elsewhere were started: one agent's, in one account. */
export interface FolderSource {
  agent: Agent;
  /** The account added in Settings → Accounts whose history they are in; none for the agent's own sign-in. */
  account?: string;
  /** The apps they were started in ("VS Code", "Terminal"…), the most sessions first. */
  apps: string[];
  sessions: number;
}

/**
 * Where a folder's sessions came from, the most sessions first, when none of them was started here; undefined when
 * one was. A sub-agent's thread counts for its parent, which is listed as well.
 */
export function folderSources(list: readonly SessionSummary[]): FolderSource[] | undefined {
  const by = new Map<string, { agent: Agent; account?: string; sessions: number; apps: Map<string, number> }>();
  for (const s of list) {
    if (startedHere(s)) return undefined;
    if (s.source === 'subagent') continue;
    const k = `${s.agent}:${s.account ?? ''}`;
    let x = by.get(k);
    if (!x) by.set(k, (x = { agent: s.agent, account: s.account, sessions: 0, apps: new Map() }));
    x.sessions++;
    const app = startedIn(s);
    if (app) x.apps.set(app, (x.apps.get(app) ?? 0) + 1);
  }
  if (!by.size) return undefined;
  return [...by.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .map(({ apps, ...x }) => ({ ...x, apps: [...apps].sort((a, b) => b[1] - a[1]).map(([app]) => app) }));
}
