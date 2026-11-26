// Start: whether it goes when a GPU is free or waits for tonight, with the night's hours beside it (New run, and
// Evolve's window).
import type { ExperimentsSettings } from '@shared/experiments';
import { trIn } from '../../i18n/runtime';
import { Segmented } from '../../components/ui';
import { hoursWords, stopNote } from './nightWords';

export type StartAt = 'free' | 'night';

export function StartChoice({ value, onChange, night, where, labelClass = 'mb-1' }: { value: StartAt; onChange: (v: StartAt) => void; night: ExperimentsSettings | null; where: string; labelClass?: string }) {
  return (
    <div>
      {/* When it starts: not the button's "Start". */}
      <span className={`${labelClass} block text-fg-2`}>{trIn('night', 'Start')}</span>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Segmented
          size="sm"
          value={value}
          onChange={onChange}
          options={[
            { value: 'free', label: 'When a GPU is free' },
            { value: 'night', label: trIn('night', 'Tonight') },
          ]}
        />
        <span className="text-[12px] text-fg-3">{hoursWords(night, where)}</span>
      </div>
      {value === 'night' && stopNote(night, where) && <p className="mt-1 leading-relaxed text-fg-3">{stopNote(night, where)}</p>}
    </div>
  );
}
