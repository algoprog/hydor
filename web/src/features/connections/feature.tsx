// Connections: apps and services signed in once for every agent, their marketplace, and the vault for keys.
import { PlugZap } from 'lucide-react';
import type { ToolInfo } from '@shared/types';
import { StepRow } from '../automations/StepRow';
import type { WebFeature } from '../registry';
import { ConnectionsSettings } from './ConnectionsSettings';
import { SecretCard } from './SecretCard';
import { SessionAppsDialog, SessionAppsItem } from './SessionApps';

const commandOf = (t: ToolInfo) => {
  const c = (t.input as { command?: unknown } | undefined)?.command;
  return typeof c === 'string' && c.trim() ? c.trim().split('\n')[0] : 'a command';
};

export const connectionsFeature: WebFeature = {
  id: 'connections',
  settings: [
    {
      id: 'connections',
      label: 'Connections',
      icon: PlugZap,
      sub: 'Services every agent can use, from a marketplace anyone can add to, and a vault for keys',
      Body: ConnectionsSettings,
    },
  ],
  // An agent asking for a key: a card outside the folded work, since it needs you. A command run with keys
  // reads and counts as the agent's other commands.
  toolViews: {
    request_secret: { place: 'attention', Row: SecretCard },
    run_with_secrets: { Row: StepRow, step: (t: ToolInfo) => ({ category: 'command', verb: t.status === 'running' || t.status === 'pending' ? 'Running' : 'Ran', title: commandOf(t) }) },
  },
  SessionMenu: SessionAppsItem,
  sessionMenuPart: 'settings',
  SessionDock: SessionAppsDialog,
};
