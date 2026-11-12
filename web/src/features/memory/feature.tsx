// Memory: what the agents remember about you, a repository and a session. A note under each reply that
// changed it, Settings → Memory for all of it, a session's menu to turn it off there, and an option to
// start a session without it.
import { useRef, useState } from 'react';
import { Brain } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import { isConfidential } from '@shared/confidential';
import type { SessionSummary } from '@shared/types';
import { go } from '../../lib/nav';
import { MenuItem, MenuSep, OptionRow, Popover, SettingChip } from '../../components/ui';
import type { WebFeature } from '../registry';
import { MemoryNote } from './MemoryNote';
import { MemorySettings } from './MemorySettings';
import { SessionMemoryItem } from './parts';
import { setSessionMemory, useMemoryState } from './state';

function SessionMenu({ s, close }: { s: SessionSummary; close: () => void }) {
  const st = useMemoryState();
  // A confidential session keeps memory off.
  if (isConfidential(s.extra)) return null;
  return <SessionMemoryItem label="Memory" sessionKey={s.key} on={s.extra?.memory !== false} allOff={!!st && !st.enabled} close={close} />;
}

/** On the start page: memory on (the agent gets what earlier sessions learned), or off for this session. */
function StartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const st = useMemoryState();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!st?.enabled) return null;
  // A confidential session keeps nothing in memory (it reads what is there).
  if (isConfidential(value)) return <SettingChip label="Memory" icon={<Brain size={14} />} value="Off" title="Memory is off in a confidential session: nothing from it is kept" disabled onClick={() => {}} />;
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
        icon={<Brain size={14} />}
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

/** In a session's options (the message box's chip): the same choice as on the start page, for this session. */
function SessionOption({ s }: { s: SessionSummary }) {
  return <StartOption value={s.extra ?? {}} onChange={(p) => setSessionMemory(s.key, p.memory !== false)} />;
}

export const memoryFeature: WebFeature = {
  id: 'memory',
  noteViews: { memory: MemoryNote },
  settings: [{ id: 'memory', label: 'Memory', icon: Brain, sub: 'What agents remember about you, your projects and each session, and when it was written', Body: MemorySettings }],
  SessionMenu,
  sessionMenuPart: 'settings',
  SessionOptions: SessionOption,
  StartOptions: StartOption,
};
