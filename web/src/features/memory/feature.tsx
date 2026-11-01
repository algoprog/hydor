// Memory: what the agents remember about you, a repository and a session. A note under each reply that
// changed it, Settings → Memory for all of it, a session's menu to turn it off there, and an option to
// start a session without it.
import { useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import type { SessionSummary } from '@shared/types';
import { go } from '../../lib/nav';
import { MenuItem, MenuSep, OptionRow, Popover, SettingChip } from '../../components/ui';
import type { WebFeature } from '../registry';
import { MemoryNote } from './MemoryNote';
import { MemorySettings } from './MemorySettings';
import { SessionMemoryItem } from './parts';
import { useMemoryState } from './state';

function SessionMenu({ s, close }: { s: SessionSummary; close: () => void }) {
  const st = useMemoryState();
  return <SessionMemoryItem label="Memory" sessionKey={s.key} on={s.extra?.memory !== false} allOff={!!st && !st.enabled} close={close} />;
}

/** On the start page: memory on (the agent gets what earlier sessions learned), or off for this session. */
function StartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const st = useMemoryState();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!st?.enabled) return null;
  const off = value.memory === false;
  const set = (memory: false | undefined) => {
    onChange({ memory });
    setOpen(false);
  };
  return (
    <>
      <SettingChip
        ref={ref}
        label="Memory"
        value={off ? 'Off' : 'On'}
        on={off}
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={off ? 'This session starts without memory: it sees nothing earlier sessions kept, and nothing from it is kept' : 'The agent gets what earlier sessions learned, and keeps what this one learns'}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={290} title="Memory">
        <OptionRow label="On" hint="Uses and adds to what agents remember" selected={!off} onClick={() => set(undefined)} />
        <OptionRow label="Off for this session" hint="Starts fresh and keeps nothing from it" selected={off} onClick={() => set(false)} />
        <MenuSep />
        <MenuItem
          icon={<Brain size={14} />}
          onClick={() => {
            setOpen(false);
            go('/settings?s=memory');
          }}
        >
          What agents remember
        </MenuItem>
      </Popover>
    </>
  );
}

export const memoryFeature: WebFeature = {
  id: 'memory',
  noteViews: { memory: MemoryNote },
  settings: [{ id: 'memory', label: 'Memory', icon: Brain, sub: 'What agents remember about you, your projects and each session, and when it was written', Body: MemorySettings }],
  SessionMenu,
  sessionMenuPart: 'settings',
  StartOptions: StartOption,
};
