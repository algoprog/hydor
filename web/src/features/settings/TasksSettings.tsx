// Scheduled tasks: agent work that starts by itself, every so often, at a time of day, once, or when a
// webhook calls. Each run starts a new session (or posts into one you pick) with the task's prompt.
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, Copy, MoreHorizontal, Pencil, Play, Plus, RefreshCw, Trash2, Webhook } from 'lucide-react';
import type { Agent, ScheduledTask, TaskSchedule } from '@shared/types';
import { api, del, enc, post } from '../../lib/api';
import { basename, timeAgo, untilText } from '../../lib/format';
import { openSession } from '../../lib/nav';
import { toast, toastError, useApp, useSessions } from '../../lib/store';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { EffortPicker, ModelPicker, ModePicker } from '../../components/AgentPickers';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, Dialog, Dots, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Section, Segmented, Switch, useConfirm } from '../../components/ui';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Every 30 min", "Weekdays at 9:00", "Once, Nov 3 9:00", "When its webhook is called". */
export function scheduleText(s: TaskSchedule): string {
  if (s.kind === 'every') return s.minutes % 60 === 0 ? `Every ${s.minutes / 60 === 1 ? 'hour' : `${s.minutes / 60} hours`}` : `Every ${s.minutes} min`;
  if (s.kind === 'once') return `Once, ${new Date(s.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  if (s.kind === 'webhook') return 'When its webhook is called';
  const d = s.days?.slice().sort();
  const which = !d?.length || d.length === 7 ? 'Daily' : d.join() === '1,2,3,4,5' ? 'Weekdays' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAY_NAMES[x]).join(', ');
  return `${which} at ${s.time}`;
}

const hookUrl = (t: ScheduledTask) => (t.hookPath ? `${location.origin}${t.hookPath}` : '');

function TaskRow({ t, onEdit, onChanged }: { t: ScheduledTask; onEdit: () => void; onChanged: () => void }) {
  const home = useApp((s) => s.boot?.home);
  const [menu, setMenu] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const [running, setRunning] = useState(false);
  const failed = t.lastStatus && t.lastStatus !== 'ok';
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2">{t.schedule.kind === 'webhook' ? <Webhook size={15} /> : <CalendarClock size={15} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13.5px] font-medium text-fg">{t.name}</span>
          <AgentIcon agent={t.agent} size={13} />
        </div>
        <div className="mt-0.5 truncate text-[12px] text-fg-3">
          {scheduleText(t.schedule)} · {t.target ? 'posts into a session' : `new session in ${t.cwd === home ? '~' : basename(t.cwd)}`}
          {t.enabled && t.nextAt ? ` · next ${untilText(t.nextAt)}` : ''}
        </div>
        {t.lastAt && (
          <div className={cx('mt-0.5 truncate text-[12px]', failed ? 'text-err' : 'text-fg-3')}>
            Last run {timeAgo(t.lastAt)} ago{failed ? `: ${t.lastStatus}` : ''}
            {t.lastKey && (
              <button className="ml-1.5 text-accent hover:underline" onClick={() => openSession(t.lastKey!)}>
                Open
              </button>
            )}
          </div>
        )}
        {t.schedule.kind === 'webhook' && t.hookPath && (
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-md bg-bg-1 px-2 py-1 font-mono text-[11.5px] text-fg-2">{hookUrl(t)}</code>
            <IconButton label="Copy the address" size="sm" onClick={() => navigator.clipboard.writeText(hookUrl(t)).then(() => toast('Copied the webhook address', 'ok'))}>
              <Copy size={13} />
            </IconButton>
          </div>
        )}
      </div>
      <Switch
        on={t.enabled}
        label={t.enabled ? 'Pause' : 'Turn on'}
        onChange={(on) =>
          post('/api/tasks', { ...t, enabled: on })
            .then(onChanged)
            .catch(toastError)
        }
      />
      <IconButton ref={setAnchor} label="Task menu" size="sm" onClick={() => setMenu((m) => !m)}>
        {running ? <Dots /> : <MoreHorizontal size={16} />}
      </IconButton>
      <Popover anchor={{ current: anchor }} open={menu} onClose={() => setMenu(false)} align="end" width={200}>
        <MenuItem
          icon={<Play size={14} />}
          onClick={async () => {
            setMenu(false);
            setRunning(true);
            try {
              const r = await post<{ key?: string }>(`/api/tasks/${enc(t.id)}/run`);
              toast(`Started ${t.name}`, 'ok');
              if (r.key) openSession(r.key);
            } catch (e) {
              toastError(e);
            } finally {
              setRunning(false);
              onChanged();
            }
          }}
        >
          Run now
        </MenuItem>
        <MenuItem icon={<Pencil size={14} />} onClick={() => (setMenu(false), onEdit())}>
          Edit
        </MenuItem>
        {t.schedule.kind === 'webhook' && (
          <MenuItem
            icon={<RefreshCw size={14} />}
            onClick={async () => {
              setMenu(false);
              if (!(await confirm({ title: 'Make a new webhook address?', body: 'The current address stops working. Update the services that call it.', confirm: 'New address' }))) return;
              post(`/api/tasks/${enc(t.id)}/rotate`).then(onChanged, toastError);
            }}
          >
            New address
          </MenuItem>
        )}
        <MenuSep />
        <MenuItem
          danger
          icon={<Trash2 size={14} />}
          onClick={async () => {
            setMenu(false);
            if (!(await confirm({ title: `Delete ${t.name}?`, body: 'It stops running. Sessions it started stay.', confirm: 'Delete', danger: true }))) return;
            del(`/api/tasks/${enc(t.id)}`).then(onChanged, toastError);
          }}
        >
          Delete
        </MenuItem>
      </Popover>
      {confirmNode}
    </div>
  );
}

type Draft = Omit<ScheduledTask, 'id' | 'createdAt' | 'enabled'> & { id?: string; enabled?: boolean };

function toLocalInput(ts: number) {
  return new Date(ts - new Date(ts).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function TaskEditor({ open, task, onClose, onSaved }: { open: boolean; task: ScheduledTask | null; onClose: () => void; onSaved: () => void }) {
  const boot = useApp((s) => s.boot);
  const sessions = useSessions();
  const blank = (): Draft => ({ name: '', prompt: '', agent: 'claude', cwd: boot?.defaultCwd || boot?.home || '/', schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }, mode: 'default' });
  const [d, setD] = useState<Draft>(blank);
  const [unit, setUnit] = useState<'min' | 'hour'>('hour');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setD(task ? { ...task } : blank());
    setUnit(task?.schedule.kind === 'every' && task.schedule.minutes % 60 !== 0 ? 'min' : 'hour');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const sch = d.schedule;
  const recent = useMemo(() => sessions.order.map((k) => sessions.byKey[k]).filter((s) => s && !s.archived && s.agent === d.agent).slice(0, 40), [sessions, d.agent]);

  const save = async () => {
    setBusy(true);
    try {
      await post('/api/tasks', d);
      onSaved();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={task ? 'Edit task' : 'New scheduled task'} width={600}>
      <div className="space-y-4">
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name, e.g. Morning CI summary" className={inputCls} autoFocus />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<Agent>
            size="sm"
            value={d.agent}
            onChange={(a) => set({ agent: a, model: undefined, effort: undefined, mode: a === 'claude' ? 'default' : 'auto', target: undefined })}
            options={(['claude', 'codex'] as Agent[]).map((a) => ({ value: a, label: agentName(a), icon: <AgentIcon agent={a} size={13} /> }))}
          />
          <FolderChip value={d.cwd} onChange={(c) => set({ cwd: c })} />
        </div>
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-line-2 px-1.5 py-1">
          <ModelPicker agent={d.agent} value={d.model ?? null} onChange={(v) => set({ model: v ?? undefined })} />
          <EffortPicker agent={d.agent} model={d.model ?? null} value={d.effort ?? null} onChange={(v) => set({ effort: v ?? undefined })} />
          <ModePicker agent={d.agent} value={d.mode ?? null} onChange={(v) => set({ mode: v })} />
        </div>
        <div>
          <textarea
            value={d.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            rows={5}
            placeholder={sch.kind === 'webhook' ? 'Review this pull request: {{body.pull_request.html_url}}' : 'What the agent should do each time'}
            className={cx(inputCls, 'h-auto min-h-[110px] resize-y py-2 leading-relaxed')}
          />
          {sch.kind === 'webhook' && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg-3">
              Fill in parts of the call with <code className="font-mono">{'{{body.path.to.field}}'}</code>, <code className="font-mono">{'{{headers.name}}'}</code>,{' '}
              <code className="font-mono">{'{{query.name}}'}</code>, <code className="font-mono">{'{{body}}'}</code> or <code className="font-mono">{'{{request}}'}</code>. They reach the agent marked as
              outside data. Anyone with the address can start a run, so keep it private and prefer a mode that asks before changes.
            </p>
          )}
        </div>
        <div className="space-y-2.5">
          <div className="text-[12.5px] font-medium text-fg-2">When</div>
          <Segmented<TaskSchedule['kind']>
            size="sm"
            value={sch.kind}
            onChange={(k) =>
              set({
                schedule:
                  k === 'every' ? { kind: 'every', minutes: 60 } : k === 'daily' ? { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } : k === 'once' ? { kind: 'once', at: Date.now() + 3600_000 } : { kind: 'webhook' },
              })
            }
            options={[
              { value: 'daily', label: 'At a time' },
              { value: 'every', label: 'Repeating' },
              { value: 'once', label: 'Once' },
              { value: 'webhook', label: 'Webhook' },
            ]}
          />
          {sch.kind === 'daily' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="time" value={sch.time} onChange={(e) => set({ schedule: { ...sch, time: e.target.value } })} className={cx(inputCls, 'h-8 w-28 text-[13px]')} />
              <div className="flex gap-1">
                {DAYS.map((x, i) => {
                  const on = !sch.days?.length || sch.days.includes(i);
                  return (
                    <button
                      key={i}
                      type="button"
                      title={DAY_NAMES[i]}
                      onClick={() => {
                        const cur = sch.days?.length ? sch.days : [0, 1, 2, 3, 4, 5, 6];
                        const next = on ? cur.filter((y) => y !== i) : [...cur, i];
                        set({ schedule: { ...sch, days: next.length === 7 ? undefined : next.length ? next : [i] } });
                      }}
                      className={cx('h-8 w-8 rounded-lg text-[12px] font-medium transition-colors', on ? 'bg-accent text-accent-fg' : 'bg-bg-2 text-fg-3 hover:text-fg')}
                    >
                      {x}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {sch.kind === 'every' && (
            <div className="flex items-center gap-2 text-[13px] text-fg-2">
              Every
              <input
                type="number"
                min={unit === 'min' ? 5 : 1}
                value={unit === 'min' ? sch.minutes : Math.max(1, Math.round(sch.minutes / 60))}
                onChange={(e) => set({ schedule: { kind: 'every', minutes: Math.max(5, Number(e.target.value) * (unit === 'min' ? 1 : 60)) } })}
                className={cx(inputCls, 'h-8 w-20 text-[13px]')}
              />
              <Segmented<'min' | 'hour'>
                size="sm"
                value={unit}
                onChange={(u) => {
                  setUnit(u);
                  set({ schedule: { kind: 'every', minutes: u === 'min' ? Math.max(5, sch.minutes) : Math.max(60, Math.round(sch.minutes / 60) * 60) } });
                }}
                options={[
                  { value: 'min', label: 'minutes' },
                  { value: 'hour', label: 'hours' },
                ]}
              />
            </div>
          )}
          {sch.kind === 'once' && <input type="datetime-local" value={toLocalInput(sch.at)} onChange={(e) => set({ schedule: { kind: 'once', at: new Date(e.target.value).getTime() } })} className={cx(inputCls, 'h-8 w-60 text-[13px]')} />}
          {sch.kind === 'webhook' && <p className="text-[12.5px] text-fg-3">Save the task to get its address; each call to it starts a run.</p>}
        </div>
        <div className="space-y-2">
          <div className="text-[12.5px] font-medium text-fg-2">Each run</div>
          <select
            value={d.target ?? ''}
            onChange={(e) => set({ target: e.target.value || undefined })}
            className={cx(inputCls, 'h-9 text-[13px]')}
          >
            <option value="">Starts a new session</option>
            {recent.map((s) => (
              <option key={s.key} value={s.key}>
                Posts into: {s.title.slice(0, 70)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={save} disabled={busy || !d.name.trim() || !d.prompt.trim()}>
          {busy ? 'Saving…' : task ? 'Save' : 'Create task'}
        </Button>
      </div>
    </Dialog>
  );
}

export function TasksSettings() {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null);
  const [editing, setEditing] = useState<{ task: ScheduledTask | null } | null>(null);
  const load = () =>
    api<{ tasks: ScheduledTask[] }>('/api/tasks')
      .then((r) => setTasks(r.tasks))
      .catch(toastError);
  useEffect(() => {
    load();
    window.addEventListener('wa:tasks', load);
    return () => window.removeEventListener('wa:tasks', load);
  }, []);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[13px] text-fg-3">Times are this computer's local time. A run that cannot start (the computer was off) runs at the next chance.</p>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({ task: null })}>
          New task
        </Button>
      </div>
      <Section>
        {!tasks ? (
          <div className="flex justify-center py-4 text-fg-3">
            <Dots />
          </div>
        ) : tasks.length ? (
          <div className="-my-2 divide-y divide-line">
            {tasks.map((t) => (
              <TaskRow key={t.id} t={t} onEdit={() => setEditing({ task: t })} onChanged={load} />
            ))}
          </div>
        ) : (
          <Empty icon={<Clock size={20} />} title="No scheduled tasks yet">
            Run a prompt every morning, every hour, once at a set time, or whenever a service such as Gitea or GitHub calls a webhook.
          </Empty>
        )}
      </Section>
      <TaskEditor open={!!editing} task={editing?.task ?? null} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}
