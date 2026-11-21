// How much a goal asks you: on its own, at turning points or every round, and what happens with no answer. One set of
// controls for the start page's Goal option, the Set a goal dialog, the agreement card and the bar's chip.
import { GOAL_SETTINGS, type GoalSettings } from '@shared/goals';
import { Segmented } from '../../components/ui';
import { ASKS, noAnswerWords } from './words';

const WAITS = 'Waits for you';

export function AsksControls({ value, onChange, className }: { value: GoalSettings; onChange: (s: GoalSettings) => void; className?: string }) {
  const hint = ASKS.find((a) => a.value === value.asks)?.hint;
  // "Goes on with its pick" keeps the minutes it was set to; from "Waits for you" it goes back to the usual ten.
  const goesOn = { ...value, noAnswerMin: value.noAnswerMin > 0 ? value.noAnswerMin : GOAL_SETTINGS.noAnswerMin };
  return (
    <div className={className}>
      <div className="max-w-full overflow-x-auto">
        <Segmented
          size="sm"
          value={value.asks}
          options={ASKS.map((a) => ({ value: a.value, label: a.label }))}
          onChange={(asks) => onChange({ ...value, asks })}
        />
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-fg-3">{hint}</p>
      {value.asks !== 'own' && (
        <>
          <div className="mt-2.5 mb-1.5 text-[11.5px] font-medium text-fg-3">If you don’t answer</div>
          <div className="max-w-full overflow-x-auto">
            <Segmented
              size="sm"
              value={value.noAnswerMin > 0 ? 'goes-on' : 'waits'}
              options={[
                { value: 'goes-on', label: noAnswerWords(goesOn) },
                { value: 'waits', label: WAITS },
              ]}
              onChange={(v) => onChange(v === 'waits' ? { ...value, noAnswerMin: 0 } : goesOn)}
            />
          </div>
          <p className="mt-1.5 text-[12.5px] leading-snug text-fg-3">A check only you can confirm, or something only you can give, always waits.</p>
        </>
      )}
    </div>
  );
}
