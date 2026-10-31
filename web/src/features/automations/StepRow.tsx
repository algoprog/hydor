// One of the automations' tools as a step among the agent's others (its line reads as the feature's
// `step` says), opening to what it sent and got back.
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { ToolItem } from '@shared/types';
import { cx } from '../../components/ui';
import { StepLine, ToolDetail } from '../session/items';

export function StepRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="tl-item">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx('group flex min-h-8 w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors hover:bg-bg-2', open && 'bg-bg-2')}
      >
        <StepLine item={item} />
        <ChevronRight size={14} className={cx('shrink-0 text-fg-3 opacity-0 transition group-hover:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && <ToolDetail t={item.tool} item={item} sessionKey={sessionKey} />}
    </div>
  );
}
