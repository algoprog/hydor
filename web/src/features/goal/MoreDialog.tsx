// Give a goal that stopped at a limit more: its rounds, money and time as they were, to raise. Go on sends them as the new
// limits; the server opens the goal again when no limit is hit any more, and says in a sentence when one still is.
import { useState } from 'react';
import type { GoalState } from '@shared/goals';
import { Button, Dialog } from '../../components/ui';
import { LimitsFields } from './ChecksEditor';
import { useAct } from './state';
import { limitsOf, limitsProblem } from './words';

export function MoreDialog({ g, open, onClose }: { g: GoalState; open: boolean; onClose: () => void }) {
  const [limits, setLimits] = useState(() => ({ ...g.contract.limits }));
  const [said, setSaid] = useState('');
  const [run, busy] = useAct(g.key);
  const problem = limitsProblem(limits);
  const go = async () => {
    if (busy || problem) return;
    setSaid('');
    // On success the goal opens again and the report gives way to the bar through the event.
    if ((await run({ action: 'change', contract: { limits: limitsOf(limits) } }, setSaid)) !== undefined) onClose();
  };
  return (
    <Dialog
      part="goal"
      open={open}
      onClose={onClose}
      title="Give it more"
      width={460}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !!problem} title={problem ?? undefined} onClick={() => void go()}>
            Go on
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] leading-relaxed text-fg-3">It stopped at a limit. Raise what ran out, and it goes on from where the files stand.</p>
      <LimitsFields value={limits} onChange={setLimits} />
      {(said || problem) && (
        <p role="alert" className="mt-3 text-[12.5px] leading-snug text-warn">
          {said || problem}
        </p>
      )}
    </Dialog>
  );
}
