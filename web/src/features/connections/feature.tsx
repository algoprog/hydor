// Connections: services signed in once for every agent, their marketplace, and the vault for keys. They are the
// Connected apps part of the Apps page (/apps/connected, ConnectedApps.tsx); a session's menu turns them on or off
// for it, and an agent asking for a key shows its card in the conversation.
import type { ToolInfo } from '@shared/types';
import { StepRow } from '../automations/StepRow';
import type { WebFeature } from '../registry';
import { SecretCard } from './SecretCard';
import { SessionAppsDialog, SessionAppsItem } from './SessionApps';

const commandOf = (t: ToolInfo) => {
  const c = (t.input as { command?: unknown } | undefined)?.command;
  return typeof c === 'string' && c.trim() ? c.trim().split('\n')[0] : 'a command';
};

export const connectionsFeature: WebFeature = {
  id: 'connections',
  // An agent asking for a key: a card outside the folded work, since it needs you. A command run with keys
  // reads and counts as the agent's other commands.
  toolViews: {
    request_secret: { place: 'attention', Row: SecretCard },
    run_with_secrets: { Row: StepRow, step: (t: ToolInfo) => ({ category: 'command', verb: t.status === 'running' || t.status === 'pending' ? 'Running' : 'Ran', title: commandOf(t) }) },
  },
  // A confidential session reaches no connected app.
  SessionMenu: (p) => (p.s.extra?.confidential ? null : <SessionAppsItem {...p} />),
  sessionMenuPart: 'settings',
  SessionDock: SessionAppsDialog,
};
