// Automations in a conversation: a task an agent proposes (schedule_task, update_task) as a card you
// confirm, a run's report and notepad as steps of its work, and "Make this an automation" in a
// session's menu, which drafts a task from the session for you to edit, test and save.
import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { create } from 'zustand';
import { OUTCOME_LABEL, type RunStatus, type TaskDraft } from '@shared/automations';
import type { SessionSummary, ToolInfo } from '@shared/types';
import { post } from '../../lib/api';
import { toast } from '../../lib/store';
import { Button, Dialog, MenuItem, Throbber } from '../../components/ui';
import type { WebFeature } from '../registry';
import { TaskEditor } from '../settings/TasksSettings';
import { ProposalCard } from './ProposalCard';
import { StepRow } from './StepRow';

const arg = (t: ToolInfo, k: string) => {
  const v = (t.input as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};
const running = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';

/** Which session's "Make this an automation" is open. */
const useDraft = create<{ key: string | null; set: (key: string | null) => void }>((set) => ({ key: null, set: (key) => set({ key }) }));

function MakeAutomation({ s, close }: { s: SessionSummary; close: () => void }) {
  return (
    <MenuItem icon={<CalendarPlus size={15} />} onClick={() => (close(), useDraft.getState().set(s.key))}>
      Make this an automation
    </MenuItem>
  );
}

/** The draft, read from the session by the helper model, in the task form. */
function DraftHost({ s }: { s: SessionSummary }) {
  const open = useDraft((x) => x.key === s.key);
  const [draft, setDraft] = useState<{ draft: TaskDraft; why?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDraft(null);
    setError(null);
    if (!open) return;
    let alive = true;
    post<{ draft: TaskDraft; why?: string }>('/api/automations/draft', { key: s.key }).then(
      (r) => alive && setDraft(r),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, [open, s.key]);
  if (!open) return null;
  const close = () => useDraft.getState().set(null);
  if (!draft)
    return (
      <Dialog open onClose={close} title="Make this an automation" width={440} footer={error ? <Button onClick={close}>Close</Button> : undefined}>
        {error ? (
          <p className="py-2 text-[13.5px] leading-relaxed text-err">{error}</p>
        ) : (
          <div className="flex items-center gap-3 py-6 text-[13.5px] text-fg-2">
            <Throbber className="h-5" />
            Reading the session to draft a task that can run again…
          </div>
        )}
      </Dialog>
    );
  return (
    <TaskEditor
      open
      task={null}
      initial={draft.draft}
      title="New automation from this session"
      note={`Drafted from this session${draft.why ? `: ${draft.why}` : '.'} Change anything, try it with a test run, then save.`}
      onClose={close}
      onSaved={() => toast(`Saved “${draft.draft.name}”. It is in Settings → Scheduled tasks.`, 'ok')}
    />
  );
}

export const automationsFeature: WebFeature = {
  id: 'automations',
  toolViews: {
    // A proposal needs you: outside the folded work.
    schedule_task: { place: 'attention', Row: ProposalCard, step: (t) => ({ verb: running(t) ? 'Proposing' : 'Proposed', title: arg(t, 'name') ?? 'a scheduled task' }) },
    update_task: { place: 'attention', Row: ProposalCard, step: () => ({ verb: 'Proposed', title: 'a change to a task' }) },
    list_tasks: { Row: StepRow, step: (t) => ({ category: 'read', verb: running(t) ? 'Looking at' : 'Looked at', title: 'the scheduled tasks' }) },
    report_outcome: {
      Row: StepRow,
      step: (t) => {
        const st = arg(t, 'status') as RunStatus | undefined;
        const summary = arg(t, 'summary');
        return { verb: 'Reported', title: `${st && OUTCOME_LABEL[st] ? OUTCOME_LABEL[st].toLowerCase() : 'how it went'}${summary ? `: ${summary}` : ''}` };
      },
    },
    task_notes: { Row: StepRow, step: (t) => ({ verb: arg(t, 'action') === 'read' ? 'Read' : 'Updated', title: 'the task’s notes' }) },
  },
  SessionMenu: MakeAutomation,
  sessionMenuPart: 'more',
  SessionDock: DraftHost,
};
