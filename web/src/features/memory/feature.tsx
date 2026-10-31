// Memory: what the agents remember about you, a repository and a session. A note under each reply that
// changed it, Settings → Memory for all of it, a session's menu to turn it off there, and an option to
// start a session without it.
import { Brain } from 'lucide-react';
import type { SessionExtra } from '@shared/features';
import type { SessionSummary } from '@shared/types';
import { cx } from '../../components/ui';
import type { WebFeature } from '../registry';
import { MemoryNote } from './MemoryNote';
import { MemorySettings } from './MemorySettings';
import { SessionMemoryItem } from './parts';
import { useMemoryState } from './state';

function SessionMenu({ s, close }: { s: SessionSummary; close: () => void }) {
  const st = useMemoryState();
  return <SessionMemoryItem sessionKey={s.key} on={s.extra?.memory !== false} allOff={!!st && !st.enabled} close={close} />;
}

/** On the start page: start the session without memory (it neither reads nor writes notes). */
function StartOption({ value, onChange }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void }) {
  const st = useMemoryState();
  if (!st?.enabled) return null;
  const off = value.memory === false;
  return (
    <button
      type="button"
      onClick={() => onChange({ memory: off ? undefined : false })}
      aria-pressed={off}
      title={off ? 'This session starts without memory: it sees nothing earlier sessions kept, and nothing from it is kept' : 'Memory is on: the agent gets what earlier sessions learned. Click to start without it'}
      className={cx('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] transition-colors', off ? 'bg-accent-soft text-accent' : 'text-fg-2 hover:bg-bg-2 hover:text-fg')}
    >
      <Brain size={14} className={off ? undefined : 'text-fg-3'} />
      {off ? 'No memory' : 'Memory'}
    </button>
  );
}

export const memoryFeature: WebFeature = {
  id: 'memory',
  noteViews: { memory: MemoryNote },
  settings: [{ id: 'memory', label: 'Memory', icon: Brain, sub: 'What agents remember about you, your projects and each session, and when it was written', Body: MemorySettings }],
  SessionMenu,
  StartOptions: StartOption,
};
