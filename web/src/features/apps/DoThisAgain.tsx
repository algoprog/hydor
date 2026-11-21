// Do this again…: under the last reply of a turn in which the agent used a tool or showed a card, a way to have that
// work again without asking for it again: as an app drafted from the turn (the builder, from the session at that reply:
// /apps/new?from=<session>&turn=<the reply's place>), or as a scheduled task that asks the turn's request on a schedule
// (the task form, filled in with it). Not in a confidential session, whose words stay on this computer.
import { useRef, useState } from 'react';
import { CalendarClock, LayoutGrid, Repeat } from 'lucide-react';
import type { TaskDraft } from '@shared/automations';
import { enc } from '../../lib/api';
import { go } from '../../lib/nav';
import { toast, useSessions } from '../../lib/store';
import { MenuItem, Popover } from '../../components/ui';
import { TaskEditor } from '../settings/TasksSettings';

/** `seq`: the reply's place in the session; `request`: what the person asked in that turn (for a scheduled task). */
export function DoThisAgain({ sessionKey, seq, request }: { sessionKey: string; seq: number; request?: string }) {
  const s = useSessions((x) => x.byKey[sessionKey]);
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<TaskDraft | null>(null);
  if (!s || s.extra?.confidential) return null;
  const ask = request?.trim();
  return (
    <>
      <button
        ref={anchor}
        type="button"
        title="Do this again…"
        aria-label="Do this again…"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg"
      >
        <Repeat size={15} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={250}>
        <MenuItem icon={<LayoutGrid size={15} />} onClick={() => (setOpen(false), go(`/apps/new?from=${enc(sessionKey)}&turn=${seq}`))}>
          Make it an app
        </MenuItem>
        {ask && (
          <MenuItem
            icon={<CalendarClock size={15} />}
            onClick={() => {
              setOpen(false);
              // Its first words name it; the same program, in the same folder, as the session.
              const line = ask.replace(/\s+/g, ' ');
              const name = line.length > 60 ? line.slice(0, 60).replace(/\s+\S*$/, '') : line;
              // The form fills in what is left out (a folder of its own when the session had none).
              setTask({ name, prompt: ask, schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }, agent: s.agent, ...(s.acpAgent ? { acpAgent: s.acpAgent } : {}), ...(s.cwd ? { cwd: s.cwd } : {}) } as TaskDraft);
            }}
          >
            Run it every…
          </MenuItem>
        )}
      </Popover>
      {task && (
        <TaskEditor
          open
          task={null}
          initial={task}
          title="Run it every…"
          note="Asks what you asked in this turn, on the schedule you pick. Change anything, try it with a test run, then save."
          onClose={() => setTask(null)}
          onSaved={() => toast(`Saved “${task.name}”. It is in Settings → Scheduled tasks.`, 'ok')}
        />
      )}
    </>
  );
}
