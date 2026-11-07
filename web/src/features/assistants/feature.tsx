// Agents (called assistants in the code): Researcher, Writer, Tutor… and your own, picked when a session starts
// (the start page's picker), made and changed on the Agents page (/agents, a tool in the sidebar), and named in a
// session's menu. Settings → Your agents keeps where task folders go and cleaning up after a task.
import { Bot, WandSparkles } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { go } from '../../lib/nav';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { AgentsPage } from './AgentsPage';
import { AssistantStartOption } from './AssistantPicker';
import { AssistantsSettings } from './AssistantsSettings';
import { AssistantIcon } from './icons';
import { useAssistantsState } from './state';

/** "Agent · Researcher": the one the session works as; it opens the agent's page. */
function SessionMenu({ s, close }: { s: SessionSummary; close: () => void }) {
  const st = useAssistantsState();
  const id = s.extra?.assistant;
  const a = typeof id === 'string' ? st?.assistants.find((x) => x.id === id) : undefined;
  if (!a) return null;
  return (
    <MenuItem
      icon={<AssistantIcon icon={a.icon} size={14} plain />}
      hint={a.name}
      onClick={() => {
        close();
        go(`/agents/${encodeURIComponent(a.id)}`);
      }}
    >
      Agent
    </MenuItem>
  );
}

export const assistantsFeature: WebFeature = {
  id: 'assistants',
  settings: [
    {
      id: 'assistants',
      label: 'Your agents',
      icon: WandSparkles,
      sub: 'Where task folders go, and cleaning up after a task; your agents themselves are on the Agents page',
      Body: AssistantsSettings,
    },
  ],
  routes: [{ match: (p) => p === '/agents' || p.startsWith('/agents/'), Page: AgentsPage }],
  nav: [{ id: 'agents', path: '/agents', label: 'Agents', icon: <Bot size={17} />, match: (p) => p === '/agents' || p.startsWith('/agents/') }],
  StartOptions: AssistantStartOption,
  SessionMenu,
  sessionMenuPart: 'settings',
};
