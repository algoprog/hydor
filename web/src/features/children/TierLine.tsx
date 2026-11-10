// A line in a conversation when its session moved to a tier's model by itself: Automatic started it on Max because
// its request reads as a hard problem, or its agent stepped itself up when the problem proved harder than it looked.
import { ChevronsUp } from 'lucide-react';
import type { SessionNote } from '@shared/features';
import { tierLabel, type TierNote } from '@shared/tiers';

export function TierLine({ note }: { note: SessionNote }) {
  const d = note.data as TierNote;
  return (
    <div className="mt-3 flex items-start gap-2 rounded-xl border border-line bg-panel px-3 py-2 text-[12.5px] leading-snug text-fg-2">
      <ChevronsUp size={14} className="mt-px shrink-0 text-accent" />
      <span className="min-w-0">
        <span className="text-fg">{d.event === 'auto' ? 'Automatic picked' : 'Stepped up to'}</span>{' '}
        {/* The tier by its name among the agents' words ("Max" is also a column's largest value elsewhere). */}
        <span data-i18n="agents" className="font-medium text-fg">
          {tierLabel(d.tier)}
        </span>{' '}
        <span translate="no" className="text-fg">
          ({d.label})
        </span>
        {d.why && (
          <span translate="no" className="text-fg-3">
            {' · '}
            {d.why}
          </span>
        )}
      </span>
    </div>
  );
}
