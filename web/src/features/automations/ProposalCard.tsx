// A task an agent proposed from chat (schedule_task, update_task), as a card in the conversation: when
// it runs in your time zone, what it does and who runs it. Nothing changes until you confirm, edit or
// decline it here; your answer goes back to the agent as a message.
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, CalendarPlus, Check, Eye, Pause, Play, Trash2, Webhook, X, type LucideIcon } from 'lucide-react';
import { scheduleText, watchText, type TaskDraft, type TaskProposal } from '@shared/automations';
import type { ToolItem } from '@shared/types';
import { api, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { tildify } from '../../lib/format';
import { go } from '../../lib/nav';
import { toastError, useApp } from '../../lib/store';
import { AgentIcon } from '../../components/AgentIcon';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import { Badge, Button, cx, Throbber } from '../../components/ui';
import { TaskEditor } from '../settings/TasksSettings';
import { localTime } from './parts';
import { StepRow } from './StepRow';
import { LOCALE } from '../../i18n/locale';

const WORDS: Record<TaskProposal['action'], { ask: string; yes: string; done: string; no: string; declined: string; icon: LucideIcon }> = {
  create: { ask: 'Schedule this task?', yes: 'Schedule it', done: 'Scheduled', no: 'Not now', declined: 'Not scheduled', icon: CalendarPlus },
  update: { ask: 'Change this task?', yes: 'Change it', done: 'Changed', no: 'Keep it as is', declined: 'Kept as it was', icon: CalendarClock },
  pause: { ask: 'Pause this task?', yes: 'Pause it', done: 'Paused', no: 'Keep it running', declined: 'Kept running', icon: Pause },
  resume: { ask: 'Turn this task back on?', yes: 'Turn it on', done: 'On again', no: 'Keep it paused', declined: 'Kept paused', icon: Play },
  delete: { ask: 'Delete this task?', yes: 'Delete it', done: 'Deleted', no: 'Keep it', declined: 'Kept', icon: Trash2 },
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-px text-[12px] text-fg-3">{label}</dt>
      <dd className="min-w-0 text-[13px] text-fg">{children}</dd>
    </>
  );
}

function Who({ t, sessionKey }: { t: TaskDraft; sessionKey: string }) {
  const home = useApp((s) => s.boot?.home);
  const acpName = useApp((s) => (t.agent === 'acp' ? s.boot?.acpAgents?.find((a) => a.id === t.acpAgent)?.name : undefined));
  const cat = useCatalog(t.agent, t.acpAgent);
  const name = t.agent === 'claude' ? 'Claude Code' : t.agent === 'codex' ? 'Codex' : (acpName ?? t.acpAgent ?? 'Agent');
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5">
      <AgentIcon agent={t.agent} name={acpName} size={13} />
      <span>{name}</span>
      <span className="text-fg-3">· {cat ? modelLabel(cat, t.model) : (t.model ?? 'its default model')}</span>
      <span className="text-fg-3">· {t.target === sessionKey ? 'in this conversation' : t.target ? 'in another session' : `a new session in ${tildify(t.cwd, home)}`}</span>
    </span>
  );
}

function Prompt({ text }: { text: string }) {
  const [all, setAll] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 4;
  return (
    <>
      <span className={cx('block whitespace-pre-wrap', !all && 'line-clamp-4')}>{text}</span>
      {long && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-0.5 text-[12px] text-accent hover:underline">
          {all ? 'Less' : 'All of it'}
        </button>
      )}
    </>
  );
}

function When({ p, t }: { p: TaskProposal; t: TaskDraft }) {
  const s = t.schedule;
  const Icon = s.kind === 'watch' ? Eye : s.kind === 'webhook' ? Webhook : null;
  return (
    <span className="block">
      <span className="flex items-start gap-1.5">
        {Icon && <Icon size={13} className="mt-[3px] shrink-0 text-fg-3" />}
        {s.kind === 'watch' ? `${watchText(s.watch)}, checked every ${s.minutes} min` : p.when}
      </span>
      {s.kind === 'watch' && s.watch.kind === 'command' && <code className="mt-1 block truncate rounded-md bg-bg-1 px-2 py-1 font-mono text-[11.5px] text-fg-2">{s.watch.command}</code>}
      {s.kind === 'watch' && 'url' in s.watch && <span className="block truncate text-[12px] text-fg-3">{s.watch.url}</span>}
      {s.kind === 'watch' && p.status === 'pending' && <span className="block text-[12px] text-fg-3">It looks right after you confirm, and the agent wakes only when something changed.</span>}
      {p.status !== 'declined' && p.next.length > 0 && (
        <span className="block text-[12px] text-fg-3">
          {p.next.length === 1 ? '' : 'Next: '}
          {p.next.map((n) => localTime(n, p.tz)).join(' · ')} ({p.tz})
        </span>
      )}
    </span>
  );
}

/** A task that runs a template: which one, and the answers it gives it. */
function AppLine({ t }: { t: TaskProposal['task'] }) {
  const answers = Object.entries(t.app?.inputs ?? {});
  return (
    <div className="min-w-0">
      <span className="font-medium" translate="no">
        {t.appName ?? t.app?.id}
      </span>
      {answers.length > 0 && (
        <div className="mt-0.5 line-clamp-3 text-[12.5px] text-fg-3" translate="no">
          {answers.map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

/** For a change: the parts that change, as they are and as they would be. */
function Changes({ p, sessionKey }: { p: TaskProposal; sessionKey: string }) {
  const a = p.before!;
  const b = p.task;
  const rows: [string, ReactNode, ReactNode][] = [];
  if (a.name !== b.name) rows.push(['Name', a.name, b.name]);
  if (JSON.stringify(a.schedule) !== JSON.stringify(b.schedule)) rows.push(['When', scheduleText(a.schedule, p.tz, LOCALE), <When p={p} t={b} />]);
  if (a.prompt !== b.prompt) rows.push(['Does', <span className="line-clamp-2">{a.prompt}</span>, <Prompt text={b.prompt} />]);
  if (a.agent !== b.agent || a.acpAgent !== b.acpAgent || a.model !== b.model || a.cwd !== b.cwd || a.target !== b.target) rows.push(['Runs', <Who t={a} sessionKey={sessionKey} />, <Who t={b} sessionKey={sessionKey} />]);
  return (
    <>
      {rows.map(([label, before, after]) => (
        <Row key={label} label={label}>
          <span className="block text-[12px] text-fg-3 line-through decoration-fg-3/50">{before}</span>
          <span className="block">{after}</span>
        </Row>
      ))}
    </>
  );
}

export function ProposalCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const id = /proposal (\w+)\)/.exec(t.output ?? '')?.[1];
  const [p, setP] = useState<TaskProposal | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<{ proposal: TaskProposal }>(`/api/automations/proposals/${enc(id)}`).then(
      (r) => alive && setP(r.proposal),
      () => alive && setGone(true),
    );
    return () => {
      alive = false;
    };
  }, [id]);
  // Answered on another device: the card follows.
  useFeatureEvent('automations', (e) => {
    const x = (e.data as { proposal?: TaskProposal } | undefined)?.proposal;
    if (x && x.id === id) setP(x);
  });
  const running = t.status === 'running' || t.status === 'pending';
  if (!id && !running) return <StepRow item={item} sessionKey={sessionKey} />;
  if (gone) return <StepRow item={item} sessionKey={sessionKey} />;
  if (!p)
    return (
      <div className="tl-item my-1.5 flex items-center gap-2.5 rounded-2xl border border-line bg-panel px-4 py-3 text-[13px] text-fg-3">
        <Throbber /> Preparing the task…
      </div>
    );
  const w = WORDS[p.action];
  const task = p.task;
  const answer = async (yes: boolean, edited?: TaskDraft) => {
    setBusy(yes ? 'yes' : 'no');
    try {
      setP((await post<{ proposal: TaskProposal }>(`/api/automations/proposals/${enc(p.id)}/${yes ? 'confirm' : 'decline'}`, edited ? { task: edited } : {})).proposal);
    } catch (e) {
      toastError(e);
      throw e;
    } finally {
      setBusy(null);
    }
  };
  const pending = p.status === 'pending';
  return (
    <div className="tl-item my-1.5 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-3 px-4 pt-3">
        <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]', pending ? 'bg-accent-soft text-accent' : 'bg-bg-2 text-fg-3')}>
          <w.icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-fg-3">{pending ? w.ask : p.status === 'confirmed' ? w.done : w.declined}</div>
          <div className="truncate text-[14.5px] font-semibold tracking-tight">{task.name}</div>
        </div>
        {pending ? <Badge tone="info">Waiting for you</Badge> : p.status === 'confirmed' ? <Badge tone="ok">{w.done}</Badge> : <Badge>{w.declined}</Badge>}
      </div>
      <dl className={cx('grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 py-3', !pending && 'opacity-75')}>
        {p.action === 'update' && p.before ? (
          <Changes p={p} sessionKey={sessionKey} />
        ) : (
          <>
            <Row label="When">
              <When p={p} t={task} />
            </Row>
            {task.app ? (
              <Row label="Runs">
                <AppLine t={task} />
              </Row>
            ) : (
              <>
                <Row label="Does">
                  <Prompt text={task.prompt} />
                </Row>
                <Row label="Runs">
                  <Who t={task} sessionKey={sessionKey} />
                </Row>
              </>
            )}
          </>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
        {pending ? (
          <>
            <Button size="sm" variant={p.action === 'delete' ? 'danger' : 'primary'} icon={busy === 'yes' ? <Throbber /> : <Check size={14} />} disabled={!!busy} onClick={() => answer(true).catch(() => {})}>
              {w.yes}
            </Button>
            {(p.action === 'create' || p.action === 'update') && (
              <Button size="sm" disabled={!!busy} onClick={() => setEditing(true)}>
                Edit…
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={<X size={14} />} disabled={!!busy} onClick={() => answer(false).catch(() => {})}>
              {w.no}
            </Button>
            <span className="ml-auto text-[11.5px] text-fg-3 max-sm:hidden">The agent hears your answer.</span>
          </>
        ) : (
          <>
            <span className="text-[12.5px] text-fg-3">
              {p.status === 'confirmed' ? (p.action === 'delete' ? 'The task is gone.' : task.schedule.kind === 'watch' ? 'Watching.' : p.next[0] ? `Next run ${localTime(p.next[0], p.tz)}.` : 'Saved.') : 'Nothing changed.'}
            </span>
            {p.status === 'confirmed' && p.action !== 'delete' && (
              <button type="button" onClick={() => go('/settings?s=tasks')} className="text-[12.5px] text-accent hover:underline">
                Scheduled tasks
              </button>
            )}
          </>
        )}
      </div>
      {editing && <TaskEditor open task={null} initial={task} title={p.action === 'update' ? 'Change the task' : 'Schedule the task'} submitLabel={w.yes} onClose={() => setEditing(false)} onSubmit={(d) => answer(true, d)} />}
    </div>
  );
}
