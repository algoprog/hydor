// Set a goal: from a session's menu. What done looks like as a sentence, how much it asks you, and Draft the checks: the
// agent works out how to check it and shows you; nothing starts before you agree.
import { useState } from 'react';
import { GOAL_SETTINGS, type GoalSettings } from '@shared/goals';
import type { SessionSummary } from '@shared/types';
import { Button, cx, Dialog, inputCls } from '../../components/ui';
import { AsksControls } from './Asks';
import { useAct } from './state';

export function SetGoal({ s, open, onClose }: { s: SessionSummary; open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [settings, setSettings] = useState<GoalSettings>({ ...GOAL_SETTINGS });
  const [run, busy] = useAct(s.key);
  const set = async () => {
    if (busy || !text.trim()) return;
    if ((await run({ action: 'set', objective: text.trim(), settings })) !== undefined) {
      setText('');
      onClose();
    }
  };
  return (
    <Dialog
      part="goal"
      open={open}
      onClose={onClose}
      title="Set a goal"
      width={500}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={set} disabled={busy || !text.trim()}>
            {busy ? 'Drafting…' : 'Draft the checks'}
          </Button>
        </>
      }
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && void set()}
        rows={4}
        autoFocus
        aria-label="The goal, as something that is true when the work is done"
        placeholder="The goal, as something that is true when the work is done"
        className={cx(inputCls, 'h-auto py-2 leading-relaxed')}
      />
      <div className="mt-4 mb-1.5 text-[11px] font-semibold tracking-wide text-fg-3 uppercase">How much it asks you</div>
      <AsksControls value={settings} onChange={setSettings} />
      <p className="mt-4 text-[12.5px] leading-snug text-fg-3">The agent first works out how to check it and shows you; nothing starts before you agree.</p>
    </Dialog>
  );
}
