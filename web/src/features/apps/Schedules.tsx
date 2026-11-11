// When a template runs by itself (its Runs tab): the scheduled tasks that run it, at a time, when a
// webhook is called or when a watcher sees a change, each as Settings → Tasks shows it, and a new one.
// Each of their runs is a run of the template, in the list below with the rest.
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { ScheduledTask, TaskDraft } from '@shared/automations';
import type { AppDef } from '@shared/apps';
import { api } from '../../lib/api';
import { useApp } from '../../lib/store';
import { Button } from '../../components/ui';
import { draftOf, TaskEditor, TaskRow } from '../settings/TasksSettings';

export function Schedules({ app }: { app: AppDef }) {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null);
  const [editing, setEditing] = useState<{ task: ScheduledTask | null; initial?: TaskDraft } | null>(null);
  const load = () =>
    api<{ tasks: ScheduledTask[] }>('/api/tasks').then(
      (r) => setTasks(r.tasks.filter((t) => t.app?.id === app.id)),
      () => setTasks([]),
    );
  useEffect(() => {
    load();
    window.addEventListener('wa:tasks', load);
    return () => window.removeEventListener('wa:tasks', load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);
  const fresh = (): TaskDraft => ({
    name: app.name,
    prompt: '',
    agent: 'claude',
    cwd: useApp.getState().boot?.home ?? '~',
    schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
    app: { id: app.id, inputs: Object.fromEntries(app.fields.filter((f) => f.default).map((f) => [f.id, f.default!])) },
  });
  if (!tasks) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-[min(100%,240px)] flex-1">
          <h3 className="text-[13.5px] font-semibold">When it runs by itself</h3>
          {!tasks.length && <p className="text-[12.5px] text-fg-3">At a time, when a webhook is called, or when a watcher sees a change, with answers you set. Its runs show below.</p>}
        </div>
        <Button size="sm" variant="subtle" icon={<Plus size={14} />} onClick={() => setEditing({ task: null, initial: fresh() })}>
          Add a schedule
        </Button>
      </div>
      <div className="divide-y divide-line">
        {tasks.map((t) => (
          <TaskRow key={t.id} flush t={t} onEdit={() => setEditing({ task: t })} onDuplicate={() => setEditing({ task: null, initial: { ...draftOf(t), name: `${t.name} copy` } })} onChanged={load} />
        ))}
      </div>
      {!tasks.length && <div className="pb-2" />}
      <TaskEditor open={!!editing} task={editing?.task ?? null} initial={editing?.initial} title={editing?.task ? undefined : 'Run it by itself'} onClose={() => setEditing(null)} onSaved={load} />
    </section>
  );
}
