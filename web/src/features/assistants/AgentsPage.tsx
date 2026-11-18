// The Agents page (/agents): your agents, each in a few sentences (what it does, where and when it works, what it
// thinks with, whom it asks, what it may spend) with how it is doing; New agent drafts one from what you say it
// should do; an agent's own page (/agents/<id>) changes it in place, lists its schedules, examples and recent sessions,
// opens All settings (every setting, in the editor), and in its menu its Versions and Download as a file; Install
// installs one from a file.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { BellRing, CalendarClock, CalendarDays, ChevronDown, Copy, Download, FileDown, FileUp, Globe, History, LayoutGrid, MessageSquarePlus, MoreHorizontal, Plus, Search, Settings2, Sparkles, Trash2, User, X } from 'lucide-react';
import { agentFileName } from '@shared/agent-files';
import { agentMode, DEFAULT_ASSISTANT, hasOutput, type AgentDraft, type Assistant, type AssistantsState } from '@shared/assistants';
import type { ScheduledTask, TaskDraft, TaskSchedule } from '@shared/automations';
import type { SpaceView } from '@shared/spaces';
import { api, del, enc, post, put } from '../../lib/api';
import { money, timeAgo, untilText } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { lastAgent } from '../../lib/start';
import { toast, toastError, useApp, useSessions } from '../../lib/store';
import { Badge, Button, cx, IconButton, inputCls, MenuItem, Popover, Tabs, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { NavButton, PageHeader } from '../layout/PageHeader';
import { PlaceRow, PlacesLabel } from '../layout/PlaceRow';
import { SideColumn } from '../layout/SideColumn';
import { SchedulesView } from '../automations/SchedulesView';
import { TaskEditor } from '../settings/TasksSettings';
import { SpaceMark } from '../spaces/parts';
import { useSpaces } from '../spaces/state';
import { EditAssistant, ImportDialog } from './AssistantsSettings';
import { loadActivity, nextRunOf, statusOf, useAgentActivity } from './agentsState';
import { AssistantIcon } from './icons';
import { assistantTranslate } from './language';
import { AgentSentences } from './Sentences';
import { InboxPanel, ResultsPanel } from './AgentPanels';
import { ExamplesPanel } from './AgentExamples';
import { VersionsDialog } from './AgentVersions';
import { InstallAgentDialog } from './InstallAgent';
import { useAssistants, useAssistantsState } from './state';

const saved = (r: AssistantsState) => useAssistants.getState().set(r);

const EXAMPLES = [
  'Every weekday at 8, find new papers on my research topics and keep the five best in my Library, two lines each.',
  'Every Friday afternoon, write my weekly progress report from my commits and notes, and let me check it before it goes.',
  'Review each change I make to this project for bugs and missing tests, and tell me what to fix first.',
  'Translate what I give it into Chinese and Greek, keeping headings, links and code as they are.',
];

/** The dot and words of how an agent is doing. */
function Status({ s }: { s: ReturnType<typeof statusOf> }) {
  const dot = s.tone === 'work' ? 'bg-info' : s.tone === 'need' ? 'bg-warn' : s.tone === 'stop' ? 'bg-err' : 'bg-fg-4';
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] text-fg-3">
      <span className={cx('h-[7px] w-[7px] rounded-full', dot, s.tone === 'work' && 'animate-pulse')} />
      {s.label}
    </span>
  );
}

/** "Everywhere", or the projects it works in, as small tags. */
function Scope({ a, spaces }: { a: Assistant; spaces: SpaceView[] | null }) {
  if (!a.projects?.length) return <span className="rounded-md border border-line bg-bg-2 px-1.5 py-px text-[11.5px] text-fg-2">Everywhere</span>;
  return (
    <>
      {a.projects.map((id) => (
        <span key={id} translate="no" className="rounded-md border border-line bg-bg-2 px-1.5 py-px text-[11.5px] text-fg-2">
          {spaces?.find((s) => s.id === id)?.name ?? tr('A project')}
        </span>
      ))}
    </>
  );
}

function AgentCard({ a, spaces }: { a: Assistant; spaces: SpaceView[] | null }) {
  const act = useAgentActivity()?.[a.id];
  const next = nextRunOf(act);
  return (
    <button
      type="button"
      onClick={() => go(`/agents/${enc(a.id)}`)}
      className="flex min-w-0 flex-col gap-2 rounded-2xl border border-line bg-panel p-3.5 text-left transition-colors hover:border-line-2"
    >
      <div className="flex w-full min-w-0 items-start gap-3">
        <AssistantIcon icon={a.icon} size={16} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span translate={assistantTranslate(a)} className="min-w-0 flex-1 text-[14px] leading-snug font-semibold break-words">
              {a.name}
            </span>
            <Status s={statusOf(a, act)} />
          </div>
          <div translate={assistantTranslate(a)} className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-fg-2">
            {a.description || a.instructions.slice(0, 160) || tr('No description')}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pl-[44px] text-[12px] text-fg-3">
        <Scope a={a} spaces={spaces} />
        {a.tier && <span className="rounded-md bg-accent-soft px-1.5 py-px text-[11.5px] text-fg-2">{a.tier === 'quick' ? 'Quick' : a.tier === 'standard' ? 'Standard' : 'Best'}</span>}
        {next ? <span>next run {untilText(next)}</span> : act?.schedules.length ? <span>{act.schedules.length === 1 ? '1 schedule' : `${act.schedules.length} schedules`}</span> : null}
        {act?.inbox && act.inbox.queued + act.inbox.sent > 0 && <span>{act.inbox.queued ? `${act.inbox.queued} in its inbox` : 'answering a message'}</span>}
        {act && act.monthUsd > 0 && (
          <span>
            {money(act.monthUsd)} this month{a.budgetUsd ? ` of ${money(a.budgetUsd)}` : ''}
          </span>
        )}
      </div>
    </button>
  );
}

// ---- a new agent, from what it should do ---------------------------------------------------------------------

interface Draft {
  a: Partial<Assistant>;
  schedule?: TaskSchedule;
  task?: string;
}

/** The task that runs an agent on its schedule: its agent program and mode, in the project's folder or the task folders' root. */
export function scheduleDraft(a: Pick<Assistant, 'id' | 'name' | 'agent' | 'acpAgent' | 'mode' | 'projects'>, schedule: TaskSchedule, prompt: string, folder: string): TaskDraft {
  const w = lastAgent();
  const agent = a.agent ?? w.agent;
  const acpAgent = a.agent ? a.acpAgent : (w.acp ?? undefined);
  return {
    name: a.name,
    schedule,
    prompt,
    agent,
    acpAgent,
    cwd: folder,
    mode: agentMode(a.mode, agent, acpAgent) ?? (agent === 'claude' ? 'default' : agent === 'codex' ? 'auto' : undefined),
    extra: { assistant: a.id },
  };
}

/** `project`: made from a project's Agents tab, so it works there. */
function NewAgent({ onClose, onAll, project }: { onClose: () => void; onAll: (d: Partial<Assistant>) => void; project?: string }) {
  const st = useAssistantsState();
  const spaces = useSpaces();
  const home = useApp((s) => s.boot?.home) ?? '';
  const defaultCwd = useApp((s) => s.boot?.defaultCwd) ?? '';
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'draft' | 'make' | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const draft = async () => {
    setBusy('draft');
    try {
      const r = await post<AgentDraft>('/api/assistants/draft', { text });
      setD({ a: project ? { ...r.agent, projects: [project] } : r.agent, schedule: r.schedule, task: r.task });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  const make = async () => {
    if (!d) return;
    setBusy('make');
    try {
      const r = await post<AssistantsState & { assistant: Assistant }>('/api/assistants', { ...d.a, drafted: true });
      saved(r);
      const a = r.assistant;
      if (d.schedule) {
        const only = a.projects?.length === 1 ? spaces?.find((s) => s.id === a.projects![0]) : undefined;
        await post('/api/tasks', { ...scheduleDraft(a, d.schedule, d.task || `Do your work as ${a.name}.`, only?.folder ?? (defaultCwd || home)), enabled: true });
      }
      loadActivity();
      toast(`${a.name} is ready`, 'ok');
      go(`/agents/${enc(a.id)}`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="flex-1 text-[15px] font-semibold tracking-tight">New agent</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-1 text-fg-3 hover:bg-bg-3 hover:text-fg">
          <X size={15} />
        </button>
      </div>
      {!d ? (
        <>
          <label className="mb-1.5 block text-[13px] text-fg-3" htmlFor="agent-want">
            What should it do? Say when it should work by itself, too, if it should.
          </label>
          <textarea
            id="agent-want"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            autoFocus
            maxLength={4000}
            placeholder={EXAMPLES[1]}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && text.trim() && draft()}
            className={cx(inputCls, 'h-auto resize-y py-2 leading-relaxed')}
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" icon={busy === 'draft' ? <Throbber size={13} /> : <Sparkles size={14} />} disabled={!text.trim() || !!busy} onClick={draft}>
              {busy === 'draft' ? 'Drafting…' : 'Draft it'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAll({ icon: 'bot', folder: 'task', ...(project ? { projects: [project] } : {}) })}>
              Start empty
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setText(x)}
                className="max-w-full truncate rounded-full border border-line px-2.5 py-1 text-left text-[12px] text-fg-3 hover:border-line-2 hover:text-fg"
              >
                {x}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <AssistantIcon icon={d.a.icon ?? 'bot'} size={16} />
            <div className="min-w-0 flex-1">
              <input
                value={d.a.name ?? ''}
                onChange={(e) => setD({ ...d, a: { ...d.a, name: e.target.value } })}
                maxLength={60}
                aria-label="Name"
                className="w-full bg-transparent text-[15px] font-semibold outline-none"
              />
              <div className="text-[12.5px] text-fg-3">Drafted from what you wrote. Click any underlined words to change them.</div>
            </div>
          </div>
          <div className="mt-2">
            <AgentSentences
              a={d.a}
              editable
              onChange={(p) => setD({ ...d, a: { ...d.a, ...p } })}
              all={st?.assistants ?? []}
              spaces={spaces}
              when={{ draft: true, schedule: d.schedule, onSchedule: (schedule) => setD({ ...d, schedule, task: schedule ? d.task || `Do your work as ${d.a.name ?? 'the agent'}.` : d.task }) }}
            />
          </div>
          {d.schedule && (
            <label className="mt-2 block">
              <span className="mb-1 block text-[12.5px] text-fg-3">Each scheduled run starts with</span>
              <input value={d.task ?? ''} onChange={(e) => setD({ ...d, task: e.target.value })} maxLength={2000} className={inputCls} />
            </label>
          )}
          <details className="mt-2 text-[13px]">
            <summary className="cursor-pointer text-fg-3 hover:text-fg">Its instructions</summary>
            <textarea
              value={d.a.instructions ?? ''}
              onChange={(e) => setD({ ...d, a: { ...d.a, instructions: e.target.value } })}
              rows={6}
              maxLength={20000}
              className={cx(inputCls, 'mt-1.5 h-auto resize-y py-2 leading-relaxed')}
            />
          </details>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" disabled={!d.a.name?.trim() || !!busy} onClick={make}>
              {busy === 'make' ? 'Making it…' : 'Create agent'}
            </Button>
            <Button size="sm" variant="ghost" icon={<Settings2 size={14} />} onClick={() => onAll(d.a)}>
              All settings
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setD(null)}>
              Describe it again
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

// ---- one agent ----------------------------------------------------------------------------------------------

/** `wide`: on a computer, where the page has its column and no header of its own: the button that shows the sidebar again sits at the left of the agent's. */
function AgentDetail({ id, onEdit, wide }: { id: string; onEdit: (a: Partial<Assistant>) => void; wide?: boolean }) {
  const st = useAssistantsState();
  const boot = useApp((s) => s.boot);
  const spaces = useSpaces();
  const act = useAgentActivity()?.[id];
  const byKey = useSessions((s) => s.byKey);
  const [confirm, confirmNode] = useConfirm();
  const [task, setTask] = useState<{ task: ScheduledTask | null; draft?: TaskDraft } | null>(null);
  const [menu, setMenu] = useState(false);
  const [versions, setVersions] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const a = st?.assistants.find((x) => x.id === id);
  const recent = useMemo(
    () =>
      Object.values(byKey)
        .filter((s) => s.extra?.assistant === id && !s.archived && !s.subagentOf)
        .sort((x, y) => (y.createdAt ?? 0) - (x.createdAt ?? 0))
        .slice(0, 8),
    [byKey, id],
  );
  if (!st) return <Throbber className="mx-auto my-10 text-fg-3" />;
  if (!a)
    return (
      <div className="py-12 text-center text-[13.5px] text-fg-3">
        {wide && <NavButton />}
        There is no such agent.{' '}
        <button type="button" className="text-accent hover:underline" onClick={() => go('/agents')}>
          See your agents
        </button>
      </div>
    );
  const change = (p: Partial<Assistant>) => put<AssistantsState>(`/api/assistants/${enc(a.id)}`, { ...a, ...p }).then(saved, toastError);
  const remove = async () => {
    if (
      !(await confirm({
        title: `Delete ${a.name}?`,
        body: 'Sessions started as it keep going without its instructions. Its schedules stay, as plain scheduled tasks.',
        confirm: 'Delete',
        danger: true,
      }))
    )
      return;
    await del<AssistantsState>(`/api/assistants/${enc(a.id)}`).then(saved, toastError);
    go('/agents');
  };
  const folder = () => {
    const only = a.projects?.length === 1 ? spaces?.find((s) => s.id === a.projects![0]) : undefined;
    return only?.folder ?? (boot?.defaultCwd || boot?.home || st.taskRoot);
  };
  const editTask = (tid: string) =>
    api<{ tasks: ScheduledTask[] }>('/api/tasks')
      .then((r) => {
        const t = r.tasks.find((x) => x.id === tid);
        if (t) setTask({ task: t });
      })
      .catch(toastError);
  const spent = act?.monthUsd ?? 0;
  // Download as a file: a .hydor-agent, with nothing of yours in it.
  const download = () => {
    setMenu(false);
    const link = document.createElement('a');
    link.href = `/api/assistants/${enc(a.id)}/export`;
    link.download = agentFileName(a);
    document.body.append(link);
    link.click();
    link.remove();
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        {wide && <NavButton />}
        <AssistantIcon icon={a.icon} size={18} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 translate={assistantTranslate(a)} className="text-[18px] font-semibold tracking-tight break-words">
              {a.name}
            </h2>
            {a.builtin && <Badge>Built in</Badge>}
            {a.source && <Badge tone="claude">Imported</Badge>}
            <Status s={statusOf(a, act)} />
          </div>
          {a.builtin && <div className="text-[12.5px] text-fg-3">Built-in agents stay as they are: duplicate one to make it your own.</div>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="primary" icon={<MessageSquarePlus size={14} />} onClick={() => go(`/?assistant=${enc(a.id)}${a.projects?.length === 1 ? `&space=${enc(a.projects[0])}` : ''}`)}>
            Start a session
          </Button>
          {!a.builtin && (
            <Button size="sm" variant="secondary" icon={<Settings2 size={14} />} onClick={() => onEdit(a)}>
              All settings
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={() => onEdit({ ...a, id: undefined, builtin: undefined, source: undefined, name: `${a.name} (copy)` })}>
            Duplicate
          </Button>
          {!a.builtin && (
            <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={remove}>
              Delete
            </Button>
          )}
          <IconButton ref={more} label="More" size="sm" active={menu} onClick={() => setMenu((o) => !o)}>
            <MoreHorizontal size={15} />
          </IconButton>
          <Popover anchor={more} open={menu} onClose={() => setMenu(false)} align="end" width={230}>
            {!a.builtin && (
              <MenuItem icon={<History size={15} />} onClick={() => (setMenu(false), setVersions(true))}>
                Versions
              </MenuItem>
            )}
            <MenuItem icon={<Download size={15} />} onClick={download} hint={a.builtin ? 'To install as your own' : undefined}>
              Download as a file
            </MenuItem>
          </Popover>
        </div>
      </div>

      <AgentSentences
        a={a}
        editable={!a.builtin}
        onChange={change}
        all={st.assistants}
        spaces={spaces}
        when={{
          draft: false,
          schedules: act?.schedules ?? [],
          onAdd: () => setTask({ task: null, draft: scheduleDraft(a, { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }, '', folder()) }),
          onEdit: editTask,
        }}
      />

      {a.standing && <InboxPanel a={a} />}
      {hasOutput(a) && <ResultsPanel a={a} />}
      {!a.builtin && <ExamplesPanel a={a} />}
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="flex-1 text-[14px] font-semibold">Schedules</h3>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => setTask({ task: null, draft: scheduleDraft(a, { kind: 'daily', time: '09:00', days: [1, 2, 3, 4, 5] }, '', folder()) })}
            >
              Add a schedule
            </Button>
          </div>
          {!act ? (
            <Throbber className="text-fg-3" />
          ) : !act.schedules.length ? (
            <div className="text-[13px] text-fg-3">
              It works when you or another agent asks. A schedule has it start by itself: at a time, every so often, when a page changes, or when another service calls.
            </div>
          ) : (
            <div className="-my-1 divide-y divide-line">
              {act.schedules.map((s) => (
                <button key={s.id} type="button" onClick={() => editTask(s.id)} className="flex w-full items-center gap-3 py-2 text-left">
                  <CalendarClock size={15} className="shrink-0 text-fg-3" />
                  <span className="min-w-0 flex-1">
                    <span translate="no" className="block truncate text-[13.5px]">
                      {s.name}
                    </span>
                    <span className="block truncate text-[12px] text-fg-3">
                      {s.enabled ? (s.nextAt ? `Next ${untilText(s.nextAt)}` : 'On') : 'Paused'}
                      {s.lastStatus && s.lastStatus !== 'ok' ? ` · ${s.lastStatus}` : ''}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-line bg-panel p-4">
          <h3 className="mb-2 text-[14px] font-semibold">This month</h3>
          <div className="text-[13px] text-fg-2">
            {act ? (
              <>
                {act.monthSessions === 1 ? '1 session' : `${act.monthSessions} sessions`} · {money(spent)}
                {a.budgetUsd ? ` of ${money(a.budgetUsd)}` : ''}
              </>
            ) : (
              <Throbber className="text-fg-3" />
            )}
          </div>
          {!!a.budgetUsd && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg-3">
              <div className={cx('h-full rounded-full', spent >= a.budgetUsd ? 'bg-err' : 'bg-accent')} style={{ width: `${Math.min(100, (spent / a.budgetUsd) * 100)}%` }} />
            </div>
          )}
          <h3 className="mt-4 mb-1.5 text-[14px] font-semibold">Recent sessions</h3>
          {!recent.length ? (
            <div className="text-[13px] text-fg-3">None yet.</div>
          ) : (
            <div className="-mx-1">
              {recent.map((s) => (
                <button key={s.key} type="button" onClick={() => openSession(s.key)} className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-bg-2">
                  <span translate="no" className="min-w-0 flex-1 truncate text-[13px]">
                    {s.title || tr('Untitled')}
                  </span>
                  <span className="shrink-0 text-[12px] text-fg-3">{timeAgo(s.createdAt)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
      <TaskEditor open={!!task} task={task?.task ?? null} initial={task?.draft} title={task?.task ? undefined : `A schedule for ${a.name}`} onClose={() => setTask(null)} onSaved={loadActivity} />
      {!a.builtin && <VersionsDialog a={a} all={st.assistants} open={versions} onClose={() => setVersions(false)} />}
      {confirmNode}
    </div>
  );
}

// ---- the page --------------------------------------------------------------------------------------------------

/** Where the page is, on a computer: all the agents, a part of them, one of the ready-made ones' pages (an address of its own) or Schedules. */
type Place = 'all' | 'mine' | 'needs' | 'scheduled' | 'everywhere' | 'schedules' | `project:${string}`;

/** The address that keeps a place (so a link opens it): /agents, /agents?place=mine, /agents/schedules. */
function addressOf(p: Place): string {
  if (p === 'all') return '/agents';
  if (p === 'schedules') return '/agents/schedules';
  return `/agents?place=${encodeURIComponent(p)}`;
}

const PLACE_TITLES: Record<string, string> = { all: 'All agents', mine: 'Your agents', needs: 'Needs you', scheduled: 'On a schedule', everywhere: 'Everywhere', schedules: 'Schedules' };

/** New agent, with Import and Install under it: the page's actions, in the row of the logo on a computer. */
function NewAgentMenu({ onImport, onInstall }: { onImport: () => void; onInstall: () => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={btn} size="sm" variant="primary" icon={<Plus size={15} />} title="New agent" onClick={() => setOpen((o) => !o)}>
        New
        <ChevronDown size={14} className="-mr-1 opacity-70" />
      </Button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} align="end" width={270}>
        <MenuItem icon={<Sparkles size={15} />} onClick={() => (setOpen(false), go('/agents?new=1'))}>
          New agent
        </MenuItem>
        <MenuItem icon={<FileDown size={15} />} onClick={() => (setOpen(false), onInstall())}>
          Install an agent from a file
        </MenuItem>
        <MenuItem icon={<FileUp size={15} />} onClick={() => (setOpen(false), onImport())}>
          Import Claude Code agent files
        </MenuItem>
      </Popover>
    </>
  );
}

export function AgentsPage() {
  const [path] = useLocation();
  const search = useSearch();
  const st = useAssistantsState();
  const spaces = useSpaces();
  const act = useAgentActivity();
  const wide = useMediaQuery('(min-width: 1024px)');
  const [edit, setEdit] = useState<Partial<Assistant> | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [find, setFind] = useState('');
  const [importing, setImporting] = useState(false);
  const [installing, setInstalling] = useState(false);
  // Schedules (/agents/schedules): everything that runs by itself, on a week; agents' own ids always end in -xxxx.
  const schedules = path === '/agents/schedules';
  const id = !schedules && path.startsWith('/agents/') ? decodeURIComponent(path.slice('/agents/'.length)) : null;
  const q = new URLSearchParams(search);
  const making = q.get('new') === '1';
  // The search box's Install an agent from a file.
  useEffect(() => {
    if (q.get('install') === '1') {
      setInstalling(true);
      go('/agents', true);
    }
  }, [search]);
  const forProject = q.get('project') ?? undefined;
  useEffect(() => {
    if (id) setFilter('all');
  }, [id]);
  const mine = (st?.assistants ?? []).filter((a) => !a.builtin);
  const builtins = (st?.assistants ?? []).filter((a) => a.builtin);
  const needs = mine.filter((a) => act?.[a.id]?.waiting).length;
  const projects = (spaces ?? []).filter((s) => mine.some((a) => a.projects?.includes(s.id)));
  const scheduledCount = mine.filter((a) => act?.[a.id]?.schedules.length).length;
  const everywhere = mine.filter((a) => !a.projects?.length).length;
  // The place, on a computer: from the address (a place that is gone, as a project, shows All agents). Narrower, the chips pick the filter.
  const asked = q.get('place');
  const place: Place = schedules ? 'schedules' : !wide || id ? 'all' : asked === 'mine' || asked === 'needs' || asked === 'scheduled' || asked === 'everywhere' ? asked : asked?.startsWith('project:') && projects.some((s) => `project:${s.id}` === asked) ? (asked as Place) : 'all';
  const by = wide ? (place === 'all' || place === 'mine' || place === 'schedules' ? 'all' : place.startsWith('project:') ? place.slice(8) : place) : filter;
  const words = (wide ? find : '').trim().toLowerCase();
  const found = (a: Assistant) => !words || `${a.name} ${a.description || a.instructions.slice(0, 160)}`.toLowerCase().includes(words);
  const shown = mine.filter((a) =>
    (by === 'all'
      ? true
      : by === 'everywhere'
        ? !a.projects?.length
        : by === 'scheduled'
          ? !!act?.[a.id]?.schedules.length
          : by === 'needs'
            ? !!act?.[a.id]?.waiting
            : !!a.projects?.includes(by)) && found(a),
  );
  const builtinsShown = builtins.filter(found);
  const showBuiltins = !wide || place === 'all';
  useEffect(() => setFind(''), [place]);
  const chip = (key: string, label: string, n?: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={cx('rounded-full border px-2.5 py-1 text-[12.5px] transition-colors', filter === key ? 'border-transparent bg-accent-soft text-fg' : 'border-line text-fg-3 hover:text-fg')}
    >
      <span translate={key.startsWith('sp') ? 'no' : undefined}>{label}</span>
      {n ? ` · ${n}` : ''}
    </button>
  );
  const icon = (I: typeof User) => <I size={15} className="text-fg-3" />;
  // The column (a computer): the places, then the ready-made agents, each with its own page; the page's actions in the row of the logo.
  const column = wide && (
    <SideColumn label="Agents" tip="agents" actions={<NewAgentMenu onImport={() => setImporting(true)} onInstall={() => setInstalling(true)} />}>
      <h1 className="sr-only">Agents</h1>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-1 pb-4">
        <nav aria-label="Places in Agents" className="space-y-0.5">
          <PlaceRow on={!id && place === 'all'} icon={icon(LayoutGrid)} label="All agents" count={st ? mine.length + builtins.length : 0} onClick={() => go(addressOf('all'))} />
          <PlaceRow on={place === 'mine' || (!!id && !builtins.some((a) => a.id === id) && mine.some((a) => a.id === id))} icon={icon(User)} label="Your agents" count={mine.length} onClick={() => go(addressOf('mine'))} />
          {(needs > 0 || place === 'needs') && <PlaceRow on={place === 'needs'} icon={icon(BellRing)} label="Needs you" count={needs} onClick={() => go(addressOf('needs'))} />}
          {(scheduledCount > 0 || place === 'scheduled') && <PlaceRow on={place === 'scheduled'} icon={icon(CalendarClock)} label="On a schedule" count={scheduledCount} onClick={() => go(addressOf('scheduled'))} />}
          {projects.length > 0 && (
            <>
              <PlacesLabel>Where they work</PlacesLabel>
              <PlaceRow on={place === 'everywhere'} icon={icon(Globe)} label="Everywhere" count={everywhere} onClick={() => go(addressOf('everywhere'))} />
              {projects.map((s) => (
                <PlaceRow
                  key={s.id}
                  on={place === `project:${s.id}`}
                  icon={<SpaceMark s={s} size={15} />}
                  label={s.name}
                  mine
                  count={mine.filter((a) => a.projects?.includes(s.id)).length}
                  onClick={() => go(addressOf(`project:${s.id}`))}
                />
              ))}
            </>
          )}
          {builtins.length > 0 && (
            <>
              <PlacesLabel>Built in</PlacesLabel>
              {builtins.map((a) => (
                <PlaceRow key={a.id} on={id === a.id} icon={<AssistantIcon icon={a.icon} size={15} plain className="text-fg-3" />} label={a.name} onClick={() => go(`/agents/${enc(a.id)}`)} />
              ))}
            </>
          )}
          <div className="mx-2.5 my-3 border-t border-line" />
          <PlaceRow on={schedules} icon={icon(CalendarDays)} label="Schedules" onClick={() => go(addressOf('schedules'))} />
        </nav>
      </div>
    </SideColumn>
  );
  const header = !wide && (
    <PageHeader
      title="Agents"
      sub={schedules ? 'Everything that runs by itself: what ran, how it went, and what runs next' : 'Each agent: what it does, where and when it works, what it thinks with, and whom it asks'}
      back={id ? { label: 'All agents', onClick: () => go('/agents') } : undefined}
      actions={
        <>
          <Button size="sm" variant="ghost" icon={<FileUp size={14} />} onClick={() => setImporting(true)} title="Import Claude Code agent files (.claude/agents)">
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" variant="ghost" icon={<FileDown size={14} />} onClick={() => setInstalling(true)} title="Install an agent from a file (.hydor-agent)">
            <span className="hidden sm:inline">Install</span>
          </Button>
          <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => go('/agents?new=1')}>
            New agent
          </Button>
        </>
      }
    >
      {!id && (
        <Tabs
          value={schedules ? 'schedules' : 'agents'}
          onChange={(t) => go(t === 'schedules' ? '/agents/schedules' : '/agents')}
          options={[
            { value: 'agents', label: 'Your agents' },
            { value: 'schedules', label: 'Schedules', icon: <CalendarDays size={14} /> },
          ]}
        />
      )}
    </PageHeader>
  );
  // The row at the top of the index, as the Library's: the place's name at the left, the find box at the right (it stays at the top while the page scrolls).
  const project = place.startsWith('project:') ? projects.find((s) => `project:${s.id}` === place) : undefined;
  const toolbar = wide && !id && (
    <div className="sticky top-0 z-20 -mx-3 flex min-h-8.5 flex-wrap items-center gap-x-3 gap-y-2 bg-bg px-3 py-2 sm:-mx-6 sm:px-6">
      <NavButton />
      <h2 translate={project ? 'no' : undefined} className="min-w-0 truncate text-[17px] font-semibold tracking-tight max-sm:hidden">
        {project?.name ?? PLACE_TITLES[place]}
      </h2>
      <span className="flex-1 max-lg:hidden" />
      {place !== 'schedules' && (
        <label className="flex h-8.5 min-w-[180px] flex-1 items-center gap-2 rounded-xl border border-line bg-bg-1 px-2.5 focus-within:border-accent/60 lg:max-w-[280px]">
          <Search size={14} className="shrink-0 text-fg-3" />
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setFind('')}
            placeholder="Find an agent"
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-fg-3"
          />
          {find && (
            <button type="button" onClick={() => setFind('')} className="text-fg-3 hover:text-fg" aria-label="Clear">
              <X size={13} />
            </button>
          )}
        </label>
      )}
    </div>
  );
  return (
    <div data-i18n="agents" className="flex h-full min-h-0">
      {column}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cx('mx-auto max-w-[1120px] px-3 sm:px-6', wide ? (id ? 'py-6' : 'pt-3 pb-10') : 'py-5 sm:py-6')}>
            {toolbar}
            <div className={cx('space-y-6', wide && !id && 'pt-3')}>
              {schedules ? (
                <SchedulesView />
              ) : id ? (
                <AgentDetail id={id} onEdit={setEdit} wide={wide} />
              ) : !st ? (
                <div className="flex justify-center py-10 text-fg-3">
                  <Throbber size={28} />
                </div>
              ) : (
                <>
                  {making && <NewAgent project={forProject} onClose={() => go('/agents', true)} onAll={(d) => setEdit(d)} />}
                  {!mine.length && !making ? (
                    place !== 'all' && place !== 'mine' && wide ? (
                      <div className="py-6 text-center text-[13px] text-fg-3">None here.</div>
                    ) : (
                      !words && (
                        <section className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center">
                          <div className="text-[15px] font-semibold">Make your first agent</div>
                          <div className="mx-auto mt-1 max-w-[520px] text-[13.5px] text-fg-3">
                            Say what it should do, and Hydor drafts it: its instructions, what it may use, the model tier it thinks with, and when it works by itself.
                          </div>
                          <Button className="mt-4" variant="primary" icon={<Plus size={14} />} onClick={() => go('/agents?new=1')}>
                            New agent
                          </Button>
                        </section>
                      )
                    )
                  ) : (
                    mine.length > 0 && (
                      <section>
                        {!wide && (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {chip('all', 'All')}
                            {chip('everywhere', 'Everywhere')}
                            {projects.map((s) => chip(s.id, s.name))}
                            {mine.some((a) => act?.[a.id]?.schedules.length) && chip('scheduled', 'On a schedule')}
                            {needs > 0 && chip('needs', 'Needs you', needs)}
                          </div>
                        )}
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {shown.map((a) => (
                            <AgentCard key={a.id} a={a} spaces={spaces} />
                          ))}
                        </div>
                        {!shown.length && (!words || !showBuiltins || !builtinsShown.length) && <div className="py-6 text-center text-[13px] text-fg-3">None here.</div>}
                      </section>
                    )
                  )}
                  {showBuiltins && builtinsShown.length > 0 && (
                    <section>
                      <h2 className="mb-2 text-[13px] font-medium text-fg-3">Built in</h2>
                      <div className="flex flex-wrap gap-1.5">
                        {/* Built-in identities stay English in German; authored agents keep their words in every language. */}
                        {builtinsShown.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => go(`/agents/${enc(a.id)}`)}
                            title={a.description}
                            translate={assistantTranslate(a)}
                            className="flex items-center gap-2 rounded-full border border-line bg-panel py-1 pr-3 pl-1 text-[13px] hover:border-line-2"
                          >
                            <AssistantIcon icon={a.icon} size={12} />
                            {a.name}
                            {a.id === DEFAULT_ASSISTANT && <span className="text-[11.5px] text-fg-3">· the default</span>}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        <EditAssistant value={edit} onClose={() => setEdit(null)} onSaved={(a) => (loadActivity(), !id && go(`/agents/${enc(a.id)}`, true))} />
        <ImportDialog open={importing} onClose={() => setImporting(false)} />
        <InstallAgentDialog open={installing} onClose={() => setInstalling(false)} />
      </div>
    </div>
  );
}
