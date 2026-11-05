// Scheduled tasks: agent work that starts by itself: at a time of day (in your time zone), every so
// often, once, by a cron expression, when a webhook calls, or when a watcher sees a change. Each run
// starts a new session (or posts into one you pick) with the task's prompt, and the task's history
// keeps how each run went. Examples start common ones from a short form.
import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock, Copy, CopyPlus, Eye, FlaskConical, ListChecks, MoreHorizontal, Pencil, Play, Plus, Trash2, TriangleAlert, Webhook } from 'lucide-react';
import { scheduleText, type ScheduledTask, type TaskApp, type TaskDraft, type TaskRun, type TaskSchedule } from '@shared/automations';
import { hookHelp } from '@shared/engineering';
import type { AppDef } from '@shared/apps';
import type { Agent } from '@shared/types';
import { api, del, enc, post } from '../../lib/api';
import { basename, timeAgo, untilText } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toast, toastError, useApp, useSessions } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { EffortPicker, ModelPicker, ModePicker } from '../../components/AgentPickers';
import { FolderChip } from '../../components/FolderPicker';
import { Button, cx, Dialog, Throbber, Empty, IconButton, inputCls, MenuItem, MenuSep, Popover, Section, Segmented, Switch, useConfirm } from '../../components/ui';
import { RefreshIcon } from '../../components/RefreshIcon';
import { FeatureStartOptions } from '../registry';
import { AgentPicker } from '../home/AgentPicker';
import { History } from '../automations/History';
import { HookOptions } from '../automations/HookOptions';
import { boxCls, browserZone, localTime, OutcomeBadge, RunDots } from '../automations/parts';
import { defaultMode, lastAgent, TemplateGallery } from '../automations/Templates';
import { blankWatch, WatchForm } from '../automations/WatchForm';
import { LOCALE } from '../../i18n/locale';

export { scheduleText };

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const hookUrl = (t: ScheduledTask) => (t.hookPath ? `${location.origin}${t.hookPath}` : '');

/** What a task can be saved from: the task's own fields, nothing it only reports. */
export function draftOf(t: ScheduledTask): TaskDraft {
  const { name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, app } = t;
  return { name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, app };
}

export function TaskRow({ t, onEdit, onDuplicate, onChanged }: { t: ScheduledTask; onEdit: () => void; onDuplicate: () => void; onChanged: () => void }) {
  const home = useApp((s) => s.boot?.home);
  const acpName = useApp((s) => (t.agent === 'acp' ? s.boot?.acpAgents?.find((a) => a.id === t.acpAgent)?.name : undefined));
  const [menu, setMenu] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState(false);
  const failed = t.lastStatus && t.lastStatus !== 'ok';
  const Icon = t.schedule.kind === 'webhook' ? Webhook : t.schedule.kind === 'watch' ? Eye : CalendarClock;
  return (
    <div className="py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-bg-2 text-fg-2">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span translate="no" className="truncate text-[13.5px] font-medium text-fg">
              {t.name}
            </span>
            {!t.app && <AgentIcon agent={t.agent} name={acpName} size={13} />}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-fg-3">
            {scheduleText(t.schedule, undefined, LOCALE)} ·{' '}
            {t.app ? (
              <>
                runs <span translate="no">{t.appName ?? 'an app that is gone'}</span>
              </>
            ) : t.target ? (
              'posts into a session'
            ) : (
              `new session in ${t.cwd === home ? '~' : basename(t.cwd)}`
            )}
            {t.enabled && t.nextAt ? ` · next ${untilText(t.nextAt)}` : ''}
          </div>
          {t.schedule.kind === 'watch' && t.check && (
            <div className={cx('mt-0.5 truncate text-[12px]', t.check.ok ? 'text-fg-3' : 'text-warn')}>
              Looked {timeAgo(t.check.at)} ago: {t.check.note}
            </div>
          )}
          {t.pausedReason && !t.enabled && (
            <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-warn/10 px-2 py-1.5 text-[12px] leading-snug text-warn">
              <TriangleAlert size={13} className="mt-px shrink-0" />
              <span>{t.pausedReason} Turn it on to try again.</span>
            </div>
          )}
          {(t.lastAt || t.recent?.length) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
              {t.recent?.length ? (
                <button type="button" onClick={() => setHistory((h) => !h)} className="inline-flex items-center gap-1.5 text-fg-3 transition-colors hover:text-fg" aria-expanded={history}>
                  <RunDots recent={t.recent} />
                  <span>{history ? 'Hide history' : 'History'}</span>
                </button>
              ) : null}
              {t.lastAt && (
                <span className={cx('min-w-0 truncate', failed ? 'text-err' : 'text-fg-3')}>
                  {t.recent?.length ? '· ' : ''}Last run {timeAgo(t.lastAt)} ago{failed ? `: ${t.lastStatus}` : ''}
                </span>
              )}
              {t.lastKey && !t.app && (
                <button className="text-accent hover:underline" onClick={() => openSession(t.lastKey!)}>
                  Open
                </button>
              )}
            </div>
          )}
          {t.schedule.kind === 'webhook' && t.hookPath && (
            <>
              <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-md bg-bg-1 px-2 py-1 font-mono text-[11.5px] text-fg-2">{hookUrl(t)}</code>
                <IconButton label="Copy the address" size="sm" onClick={() => navigator.clipboard.writeText(hookUrl(t)).then(() => toast('Copied the webhook address', 'ok'))}>
                  <Copy size={13} />
                </IconButton>
              </div>
              {/* An example's task: where its address goes. */}
              {hookHelp(t.origin, t.schedule) && <p className="mt-1 text-[12px] leading-snug text-fg-3">{hookHelp(t.origin, t.schedule)}</p>}
            </>
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
          {running ? <Throbber /> : <MoreHorizontal size={16} />}
        </IconButton>
        <Popover anchor={{ current: anchor }} open={menu} onClose={() => setMenu(false)} align="end" width={210}>
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
          <MenuItem icon={<ListChecks size={14} />} onClick={() => (setMenu(false), setHistory((h) => !h))}>
            {history ? 'Hide history' : 'History'}
          </MenuItem>
          <MenuItem icon={<CopyPlus size={14} />} onClick={() => (setMenu(false), onDuplicate())}>
            Duplicate
          </MenuItem>
          {t.schedule.kind === 'webhook' && (
            <MenuItem
              icon={<RefreshIcon size={14} />}
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
              if (!(await confirm({ title: `Delete ${t.name}?`, body: 'It stops running, and its history goes. Sessions it started stay.', confirm: 'Delete', danger: true }))) return;
              del(`/api/tasks/${enc(t.id)}`).then(onChanged, toastError);
            }}
          >
            Delete
          </MenuItem>
        </Popover>
        {confirmNode}
      </div>
      {history && (
        <div className="pl-11">
          <History task={t} />
        </div>
      )}
    </div>
  );
}

function toLocalInput(ts: number) {
  return new Date(ts - new Date(ts).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Settings beyond the agent's own, without the ones cleared. */
const tidyExtra = (x: Record<string, unknown>) => {
  const out = Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  return Object.keys(out).length ? out : undefined;
};

/** A test run in the form: started, then how it went. */
function TestStrip({ run }: { run: TaskRun }) {
  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
      <FlaskConical size={14} className="mt-0.5 shrink-0 text-fg-3" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="font-medium text-fg-2">Test run</span>
          <OutcomeBadge status={run.status} />
          {run.status === 'running' && <Throbber className="h-3.5 text-fg-3" />}
          {run.appRun ? (
            <button type="button" className="text-accent hover:underline" onClick={() => go(`/apps/runs/${enc(run.appRun!)}`)}>
              Open its run
            </button>
          ) : (
            run.key && (
              <button type="button" className="text-accent hover:underline" onClick={() => openSession(run.key!)}>
                Open its session
              </button>
            )
          )}
        </div>
        <p className="mt-0.5 line-clamp-3 text-[12.5px] leading-snug text-fg-2">{run.summary ?? (run.status === 'running' ? (run.appRun ? 'It runs like a real run of the app; this updates when it ends.' : 'It runs like a real run, in a session of its own; this updates when it ends.') : '')}</p>
      </div>
    </div>
  );
}

/** A task that runs a template: the answers its form gets on each run (a webhook's call and a watcher's find fill them in). */
function AppAnswers({ app, schedule, onChange }: { app: TaskApp; schedule: TaskSchedule; onChange: (a: TaskApp) => void }) {
  const [def, setDef] = useState<AppDef | null | undefined>(undefined);
  useEffect(() => {
    api<{ app: AppDef }>(`/api/apps/${enc(app.id)}`).then(
      (r) => setDef(r.app),
      () => setDef(null),
    );
  }, [app.id]);
  if (def === undefined) return <Throbber className="text-fg-3" />;
  if (def === null) return <p className="text-[12.5px] text-err">Its app is gone: remove the task, or make it again from another app.</p>;
  const put = (id: string, v: string) => {
    const inputs = { ...app.inputs };
    if (v) inputs[id] = v;
    else delete inputs[id];
    onChange({ ...app, inputs });
  };
  return (
    <div className="space-y-2.5">
      <p className="text-[13px] text-fg-2">
        Each run, it runs <span className="font-medium text-fg" translate="no">{def.name}</span> with these answers.
      </p>
      {def.fields.map((f) => (
        <label key={f.id} className="block">
          <span className="mb-1 flex items-baseline gap-1 text-[12.5px] text-fg-3">
            <span translate="no">{f.label || f.id}</span>
            {f.required && <span className="text-err">*</span>}
          </span>
          {f.type === 'file' ? (
            <span className="block text-[12.5px] text-fg-3">A task cannot attach files.</span>
          ) : f.type === 'choice' || f.type === 'yesno' ? (
            <select className={cx(inputCls, 'h-9 text-[13px]')} value={app.inputs[f.id] ?? ''} onChange={(e) => put(f.id, e.target.value)}>
              <option value="">—</option>
              {(f.type === 'yesno' ? ['Yes', 'No'] : (f.options ?? [])).map((o) => (
                <option key={o} value={o} translate="no">
                  {o}
                </option>
              ))}
            </select>
          ) : f.type === 'long' ? (
            <textarea className={cx(inputCls, 'h-auto min-h-[72px] resize-y py-2 text-[13px] leading-relaxed')} rows={3} placeholder={f.placeholder} value={app.inputs[f.id] ?? ''} onChange={(e) => put(f.id, e.target.value)} />
          ) : (
            <input className={cx(inputCls, 'h-9 text-[13px]')} placeholder={f.placeholder} value={app.inputs[f.id] ?? ''} onChange={(e) => put(f.id, e.target.value)} />
          )}
        </label>
      ))}
      {!def.fields.length && <p className="text-[12.5px] text-fg-3">Its form asks nothing.</p>}
      {schedule.kind === 'webhook' && (
        <p className="text-[12px] leading-relaxed text-fg-3">
          Fill in parts of the call with <code className="font-mono">{'{{body.path.to.field}}'}</code>, <code className="font-mono">{'{{headers.name}}'}</code> or <code className="font-mono">{'{{query.name}}'}</code>; the run takes them as data, never as instructions.
        </p>
      )}
      {schedule.kind === 'watch' && (
        <p className="text-[12px] leading-relaxed text-fg-3">
          <code className="font-mono">{'{{change}}'}</code> is what the watcher saw change.
        </p>
      )}
    </div>
  );
}

export function TaskEditor({
  open,
  task,
  initial,
  title,
  note,
  onClose,
  onSaved,
  onSubmit,
  submitLabel,
}: {
  open: boolean;
  task: ScheduledTask | null;
  /** A draft to start from (a template, a session, an agent's proposal). */
  initial?: TaskDraft | null;
  title?: string;
  /** A line above the form (why this draft). */
  note?: string;
  onClose: () => void;
  onSaved?: () => void;
  /** Instead of saving it: what to do with the task as edited (an agent's proposal confirms with it). */
  onSubmit?: (d: TaskDraft) => Promise<void>;
  submitLabel?: string;
}) {
  const boot = useApp((s) => s.boot);
  const sessions = useSessions();
  const blank = (): TaskDraft => {
    const w = lastAgent();
    return {
      name: '',
      prompt: '',
      agent: w.agent,
      acpAgent: w.acp ?? undefined,
      cwd: boot?.defaultCwd || boot?.home || '/',
      schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] },
      mode: w.agent === 'claude' ? 'default' : w.agent === 'codex' ? 'auto' : defaultMode(w.agent, w.acp),
    };
  };
  const [d, setD] = useState<TaskDraft>(blank);
  const [unit, setUnit] = useState<'min' | 'hour'>('hour');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ next: number[]; tz: string } | null>(null);
  const [test, setTest] = useState<TaskRun | null>(null);
  const [testing, setTesting] = useState(false);
  useEffect(() => {
    if (!open) return;
    const start = task ? draftOf(task) : initial ? { ...blank(), ...initial } : blank();
    setD(task ? { ...start, id: task.id, enabled: task.enabled } : start);
    setUnit(start.schedule.kind === 'every' && start.schedule.minutes % 60 !== 0 ? 'min' : 'hour');
    setTest(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, initial]);
  const set = (p: Partial<TaskDraft>) => setD((x) => ({ ...x, ...p }));
  const sch = d.schedule;
  const recent = useMemo(
    () => sessions.order.map((k) => sessions.byKey[k]).filter((s) => s && !s.archived && s.agent === d.agent && (d.agent !== 'acp' || s.acpAgent === d.acpAgent)).slice(0, 40),
    [sessions, d.agent, d.acpAgent],
  );
  // When it runs next, worked out by the server in your time zone.
  const schedKey = JSON.stringify(sch);
  useEffect(() => {
    if (!open || sch.kind === 'webhook' || sch.kind === 'watch') return setPreview(null);
    const h = setTimeout(() => post<{ next: number[]; tz: string }>('/api/automations/next', { schedule: sch }).then(setPreview, () => setPreview(null)), 250);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedKey]);
  // A test run reports back when it ends.
  useEffect(() => {
    if (!test || test.status !== 'running') return;
    const h = setInterval(() => api<{ run: TaskRun }>(`/api/automations/runs/${enc(test.id)}`).then((r) => setTest(r.run), () => {}), 3000);
    return () => clearInterval(h);
  }, [test]);

  const save = async () => {
    setBusy(true);
    try {
      if (onSubmit) await onSubmit(d);
      else await post('/api/tasks', d);
      onSaved?.();
      onClose();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const runTest = async () => {
    setTesting(true);
    try {
      const r = await post<{ runId: string }>('/api/automations/test-run', { task: d });
      setTest((await api<{ run: TaskRun }>(`/api/automations/runs/${enc(r.runId)}`)).run);
    } catch (e) {
      toastError(e);
    } finally {
      setTesting(false);
    }
  };
  const extra = d.extra ?? {};

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title ?? (task ? 'Edit task' : 'New scheduled task')}
      width={620}
      footer={
        <>
          <Button variant="ghost" className="mr-auto" icon={<FlaskConical size={14} />} onClick={runTest} disabled={testing || !d.name.trim() || (!d.app && !d.prompt.trim())} title="Run it once now, as the form is, without saving">
            {testing ? 'Starting…' : 'Test run'}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !d.name.trim() || (!d.app && !d.prompt.trim())}>
            {busy ? 'Saving…' : (submitLabel ?? (task ? 'Save' : 'Create task'))}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {note && <p className="rounded-xl bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed text-fg-2">{note}</p>}
        <input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="Name, e.g. Morning CI summary" className={inputCls} autoFocus={!initial} />
        {d.app ? (
          <AppAnswers app={d.app} schedule={sch} onChange={(app) => set({ app })} />
        ) : (
          <>
        <div className="flex flex-wrap items-center gap-2">
          <AgentPicker
            agent={d.agent}
            acpId={d.acpAgent ?? null}
            acpList={boot?.acpAgents ?? []}
            onPick={(a: Agent, id) => set({ agent: a, acpAgent: id ?? undefined, model: undefined, effort: undefined, mode: a === 'claude' ? 'default' : a === 'codex' ? 'auto' : defaultMode(a, id), target: undefined })}
          />
          <FolderChip value={d.cwd} onChange={(c) => set({ cwd: c })} />
        </div>
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-line-2 px-1.5 py-1">
          <ModelPicker label="Model" agent={d.agent} acp={d.acpAgent} value={d.model ?? null} onChange={(v) => set({ model: v ?? undefined })} />
          <EffortPicker label="Effort" agent={d.agent} acp={d.acpAgent} model={d.model ?? null} value={d.effort ?? null} onChange={(v) => set({ effort: v ?? undefined })} />
          <ModePicker label="Permissions" agent={d.agent} acp={d.acpAgent} value={d.mode ?? null} onChange={(v) => set({ mode: v })} />
          <FeatureStartOptions value={extra} onChange={(p) => set({ extra: tidyExtra({ ...extra, ...p }) })} cwd={d.cwd} />
        </div>
        <div>
          <textarea
            value={d.prompt}
            onChange={(e) => set({ prompt: e.target.value })}
            rows={5}
            placeholder={sch.kind === 'webhook' ? 'Review this pull request: {{body.pull_request.html_url}}' : sch.kind === 'watch' ? 'What to do when it changes: what changed comes with each run' : 'What the agent should do each time'}
            className={cx(inputCls, 'h-auto min-h-[110px] resize-y py-2 leading-relaxed')}
          />
          {sch.kind === 'webhook' && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg-3">
              Fill in parts of the call with <code className="font-mono">{'{{body.path.to.field}}'}</code>, <code className="font-mono">{'{{headers.name}}'}</code>,{' '}
              <code className="font-mono">{'{{query.name}}'}</code>, <code className="font-mono">{'{{body}}'}</code> or <code className="font-mono">{'{{request}}'}</code>. They reach the agent marked as
              outside data. Anyone with the address can start a run, so keep it private (or require a signature below) and prefer a mode that asks before changes.
            </p>
          )}
        </div>
          </>
        )}
        <div className="space-y-2.5">
          <div className="text-[12.5px] font-medium text-fg-2">When</div>
          <div className="-mx-1 overflow-x-auto px-1 [&::-webkit-scrollbar]:hidden">
            <Segmented<'daily' | 'every' | 'once' | 'watch' | 'webhook'>
              size="sm"
              value={sch.kind === 'cron' ? 'daily' : sch.kind}
              onChange={(k) =>
                set({
                  schedule:
                    k === 'every'
                      ? { kind: 'every', minutes: 60 }
                      : k === 'daily'
                        ? { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }
                        : k === 'once'
                          ? { kind: 'once', at: Date.now() + 3600_000 }
                          : k === 'watch'
                            ? { kind: 'watch', minutes: 15, watch: blankWatch('feed') }
                            : { kind: 'webhook' },
                })
              }
              options={[
                { value: 'daily', label: 'At a time' },
                { value: 'every', label: 'Repeating' },
                { value: 'once', label: 'Once' },
                { value: 'watch', label: 'Watch' },
                { value: 'webhook', label: 'Webhook' },
              ]}
            />
          </div>
          {sch.kind === 'daily' && (
            <div className="flex flex-wrap items-center gap-2">
              <input type="time" value={sch.time} onChange={(e) => set({ schedule: { ...sch, time: e.target.value } })} className={cx(boxCls, 'h-8 w-28 text-[13px]')} />
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
              <button type="button" onClick={() => set({ schedule: { kind: 'cron', expr: `${sch.time.split(':')[1] ?? '0'} ${Number(sch.time.split(':')[0])} * * ${sch.days?.length ? sch.days.join(',') : '*'}` } })} className="text-[12px] text-fg-3 hover:text-fg">
                Cron expression…
              </button>
            </div>
          )}
          {sch.kind === 'cron' && (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <input value={sch.expr} onChange={(e) => set({ schedule: { kind: 'cron', expr: e.target.value } })} placeholder="*/15 9-17 * * 1-5" className={cx(boxCls, 'h-8 w-56 max-w-full font-mono text-[13px]')} spellCheck={false} />
                <button type="button" onClick={() => set({ schedule: { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] } })} className="text-[12px] text-fg-3 hover:text-fg">
                  A time of day instead
                </button>
              </div>
              <p className="text-[12px] text-fg-3">Five fields: minute, hour, day of the month, month, weekday (0 or 7 is Sunday), in your time zone.</p>
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
                className={cx(boxCls, 'h-8 w-20 text-[13px]')}
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
          {sch.kind === 'once' && <input type="datetime-local" value={toLocalInput(sch.at)} onChange={(e) => set({ schedule: { kind: 'once', at: new Date(e.target.value).getTime() } })} className={cx(boxCls, 'h-8 w-60 text-[13px]')} />}
          {sch.kind === 'watch' && <WatchForm value={sch} onChange={(s) => set({ schedule: s })} cwd={d.cwd} />}
          {sch.kind === 'webhook' && (
            <>
              <p className="text-[12.5px] text-fg-3">Save the task to get its address; each call to it starts a run.</p>
              <HookOptions value={sch} onChange={(s) => set({ schedule: s })} />
            </>
          )}
          {preview && preview.next.length > 0 && (
            <p className="text-[12px] text-fg-3">
              Next: {preview.next.map((t) => localTime(t, preview.tz)).join(' · ')}
              {preview.tz !== browserZone() ? ` (${preview.tz})` : ''}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="text-[12.5px] font-medium text-fg-2">Each run</div>
          {!d.app && (
            <select value={d.target ?? ''} onChange={(e) => set({ target: e.target.value || undefined })} className={cx(inputCls, 'h-9 text-[13px]')}>
              <option value="">Starts a new session</option>
              {recent.map((s) => (
                <option key={s.key} value={s.key}>
                  Posts into: {s.title.slice(0, 70)}
                </option>
              ))}
            </select>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-fg-2">
            <label className={cx('flex items-center gap-2', d.app && 'hidden')}>
              Stops past $
              <input
                type="number"
                min={0}
                step={0.5}
                value={typeof extra.capUsd === 'number' ? extra.capUsd : ''}
                onChange={(e) => set({ extra: tidyExtra({ ...extra, capUsd: Number(e.target.value) > 0 ? Number(e.target.value) : undefined }) })}
                placeholder="no cap"
                className={cx(boxCls, 'h-8 w-24 text-[13px]')}
              />
            </label>
            <label className="flex items-center gap-2">
              Pause after
              <input
                type="number"
                min={0}
                value={d.failLimit ?? 3}
                onChange={(e) => set({ failLimit: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                className={cx(boxCls, 'h-8 w-16 text-[13px]')}
              />
              failures in a row
            </label>
          </div>
          <p className="text-[12px] leading-relaxed text-fg-3">
            A run tells you how it went; one with nothing to report stays quiet, and failures always notify. With 0, failures never pause it.
          </p>
        </div>
        {test && <TestStrip run={test} />}
      </div>
    </Dialog>
  );
}

export function TasksSettings() {
  const [tasks, setTasks] = useState<ScheduledTask[] | null>(null);
  const [editing, setEditing] = useState<{ task: ScheduledTask | null; draft?: TaskDraft } | null>(null);
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
        <p className="min-w-0 flex-1 text-[13px] text-fg-3">Times are in your time zone ({browserZone()}). A run that cannot start (the computer was off) runs at the next chance.</p>
        <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => setEditing({ task: null })}>
          New task
        </Button>
      </div>
      <Section>
        {!tasks ? (
          <div className="flex justify-center py-4 text-fg-3">
            <Throbber />
          </div>
        ) : tasks.length ? (
          <div className="-my-2 divide-y divide-line">
            {tasks.map((t) => (
              <TaskRow key={t.id} t={t} onEdit={() => setEditing({ task: t })} onDuplicate={() => setEditing({ task: null, draft: { ...draftOf(t), name: `${t.name} (copy)` } })} onChanged={load} />
            ))}
          </div>
        ) : (
          <Empty icon={<Clock size={20} />} title="No scheduled tasks yet">
            Run a prompt every morning, once at a set time, whenever a service such as GitHub calls a webhook, or when a page, a feed or a folder changes. Or start from an example below; agents can also set one up when you ask them in a
            conversation.
          </Empty>
        )}
      </Section>
      <TemplateGallery onMore={(draft) => setEditing({ task: null, draft })} />
      <TaskEditor open={!!editing} task={editing?.task ?? null} initial={editing?.draft} onClose={() => setEditing(null)} onSaved={load} />
    </div>
  );
}

