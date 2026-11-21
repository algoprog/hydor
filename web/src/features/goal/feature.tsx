// Goal mode: a session works towards a goal round after round, and the app itself runs the checks that say how each round
// went (shared/goals.ts). In a session: the dock above the message box (GoalDock), set from its menu (Set a goal). On the
// start page, under Options: Goal, off or until it is done, with how much it asks. Not kept for the next session.
import { useRef, useState } from 'react';
import { Target } from 'lucide-react';
import type { GoalSettings } from '@shared/goals';
import type { SessionExtra } from '@shared/features';
import { OptionRow, Popover, SettingChip } from '../../components/ui';
import type { WebFeature } from '../registry';
import { useCostlyMode } from '../tips/ModeExplainer';
import { AsksControls } from './Asks';
import { goalStartPatch } from './can';
import { settingsOfDefaults, useGoalDefaults } from './defaults';
import { GoalsSettingsBody } from './GoalsSettings';
import { asksChip } from './words';

/** The settings a start-page goal carries, from what extra holds; what it does not say starts from the defaults (Settings → Goals). */
const settingsOf = (g: SessionExtra['goal'], base: GoalSettings): GoalSettings => ({ asks: g?.asks ?? base.asks, noAnswerMin: g?.noAnswerMin ?? base.noAnswerMin });

/** On the start page, under Options: no goal, or a goal the session starts with (its first message is the goal). */
function GoalStartOption({ value, onChange, scheduled }: { value: SessionExtra; onChange: (patch: Partial<SessionExtra>) => void; scheduled?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { ask, dialog } = useCostlyMode();
  const on = !!value.goal;
  // Goals on a schedule do not ship: a scheduled task's editor has no Goal option.
  const settings = settingsOf(value.goal, settingsOfDefaults(useGoalDefaults()));
  // start: the session's loop has not taken it yet; the server clears it once it has.
  // Goal goes with a swarm (the lead has it) but not with a campaign, deep research or the arena: turning it on clears those.
  const turnOn = (s: GoalSettings) => onChange({ goal: { ...s, start: true }, ...goalStartPatch(value) });
  if (scheduled) return null;
  return (
    // Its words are the goal's own ("Goal" is a football word elsewhere): the chip and its popover are one part.
    <span data-i18n="goal" className="contents">
      <SettingChip
        ref={ref}
        label="Goal"
        icon={<Target size={14} />}
        value={on ? 'Until it is done' : 'Off'}
        on={on}
        open={open}
        onClick={() => setOpen((o) => !o)}
        title={on ? `It works round after round until checks you agree hold. ${asksChip(settings)}.` : 'The agent works until it thinks it is done'}
      />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={320} title="Goal">
        <OptionRow label="Off" hint="The agent works until it thinks it is done" selected={!on} onClick={() => (onChange({ goal: undefined }), setOpen(false))} />
        <OptionRow
          label="Until it is done"
          hint="It works round after round until checks you agree hold"
          selected={on}
          onClick={() => ask('goal', () => (turnOn(settings), setOpen(false)))}
        />
        {on && (
          <div className="mx-1 mt-1 border-t border-line px-2 pt-2.5 pb-1.5">
            <div className="mb-1.5 text-[11.5px] font-medium text-fg-3">How much it asks you</div>
            <AsksControls value={settings} onChange={turnOn} />
          </div>
        )}
        <div className="mx-1 mt-1 border-t border-line px-2 pt-2 pb-1 text-[12px] leading-snug text-fg-3">
          The agent first works out the checks and shows you; nothing starts before you agree. Your message is the goal.
        </div>
      </Popover>
      {dialog}
    </span>
  );
}

export const goalFeature: WebFeature = {
  id: 'goal',
  StartOptions: GoalStartOption,
  settings: [{ id: 'goals', label: 'Goals', icon: Target, sub: 'What a new goal starts from: its rounds, how much it asks you, and when it goes on with its own pick', Body: GoalsSettingsBody }],
};
