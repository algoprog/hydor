// Where a session was started: here, in Hydor, or in another app whose Claude Code and Codex sessions the app lists
// too (VS Code, a terminal, Claude's desktop app, a script), by what the agent wrote down as it started (Claude
// Code's entrypoint, Codex's source). A session's Info says it ("Started from"), and the sidebar marks a folder whose
// work began outside Hydor with where its sessions came from (features/sessions/groups.ts).
import type { FolderOrigin } from '@shared/sidebar';
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

/** Where the sessions of a folder whose work began outside Hydor came from: one agent's, in one account. */
export interface FolderSource {
  agent: Agent;
  /** The account added in Settings → Accounts whose history they are in; none for the agent's own sign-in. */
  account?: string;
  /** The apps they were started in ("VS Code", "Terminal"…), the most sessions first. */
  apps: string[];
  sessions: number;
}

/** The apps, by the names they show as, each once, in the order given. */
const appsOf = (sources: string[]) => [...new Set(sources.map((x) => STARTED_IN[x] ?? x))];

/** As the server says it for a folder (bootstrap's folderOrigins, which knows every session): undefined when its work began in Hydor. */
export const fromOrigins = (o: FolderOrigin[]): FolderSource[] | undefined =>
  o.length ? o.map((x) => ({ agent: x.agent, account: x.account, apps: appsOf(x.sources), sessions: x.sessions })) : undefined;

/**
 * Where a folder's sessions came from, the most sessions first, when the first of them was started outside Hydor;
 * undefined when Hydor started it. From the sessions the page holds, for a folder the server did not know of yet.
 * A sub-agent's thread counts for its parent, which is listed as well.
 */
export function folderSources(list: readonly SessionSummary[]): FolderSource[] | undefined {
  const own = list.filter((s) => s.source !== 'subagent');
  if (!own.length) return undefined;
  const when = (s: SessionSummary) => s.createdAt ?? s.updatedAt ?? Infinity;
  if (startedHere(own.reduce((a, b) => (when(b) < when(a) ? b : a)))) return undefined;
  const by = new Map<string, FolderOrigin & { counts: Map<string, number> }>();
  for (const s of own) {
    if (startedHere(s)) continue;
    const k = `${s.agent}:${s.account ?? ''}`;
    let x = by.get(k);
    if (!x) by.set(k, (x = { agent: s.agent, account: s.account, sources: [], sessions: 0, counts: new Map() }));
    x.sessions++;
    if (s.source) x.counts.set(s.source, (x.counts.get(s.source) ?? 0) + 1);
  }
  return fromOrigins(
    [...by.values()]
      .sort((a, b) => b.sessions - a.sessions)
      .map(({ counts, ...x }) => ({ ...x, sources: [...counts].sort((a, b) => b[1] - a[1]).map(([src]) => src) })),
  );
}
