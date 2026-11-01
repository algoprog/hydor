// Assistants: Researcher, Writer, Tutor… picked when a session starts (the start page's picker), made
// and changed in Settings → Assistants, and named in a session's menu.
import { WandSparkles } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { go } from '../../lib/nav';
import { MenuItem } from '../../components/ui';
import type { WebFeature } from '../registry';
import { AssistantStartOption } from './AssistantPicker';
import { AssistantsSettings } from './AssistantsSettings';
import { AssistantIcon } from './icons';
import { useAssistantsState } from './state';

/** "Assistant · Researcher": the one the session started as; it opens Settings → Assistants. */
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
        go('/settings?s=assistants');
      }}
    >
      Assistant
    </MenuItem>
  );
}

export const assistantsFeature: WebFeature = {
  id: 'assistants',
  settings: [
    {
      id: 'assistants',
      label: 'Assistants',
      icon: WandSparkles,
      sub: 'Presets to start sessions as (Researcher, Writer, Tutor…), and where task folders go',
      Body: AssistantsSettings,
    },
  ],
  StartOptions: AssistantStartOption,
  SessionMenu,
  sessionMenuPart: 'settings',
};
