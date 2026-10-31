// Connections: apps and services signed in once for every agent, their marketplace, and the vault for keys.
import { PlugZap } from 'lucide-react';
import type { WebFeature } from '../registry';
import { ConnectionsSettings } from './ConnectionsSettings';
import { SecretCard } from './SecretCard';
import { SessionAppsDialog, SessionAppsItem } from './SessionApps';

export const connectionsFeature: WebFeature = {
  id: 'connections',
  settings: [
    {
      id: 'connections',
      label: 'Connections',
      icon: PlugZap,
      sub: 'Apps every agent can use, from a marketplace anyone can add to, and a vault for keys',
      Body: ConnectionsSettings,
    },
  ],
  // An agent asking for a key: a card outside the folded work, since it needs you.
  toolViews: { request_secret: { place: 'attention', Row: SecretCard } },
  SessionMenu: SessionAppsItem,
  sessionMenuPart: 'settings',
  SessionDock: SessionAppsDialog,
};
