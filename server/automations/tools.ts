// From chat: tools on each session's own MCP server, so any agent (Claude Code, Codex, Custom, ACP
// agents) can set up automations for the user: "remind me Friday at 9", "every Monday summarize X",
// "tell me when this page changes". An agent only proposes; the user confirms or declines in a card in
// the conversation, and the agent hears the answer as a message. Runs started by a schedule cannot
// schedule more; they report how they went and keep a notepad across runs.
import crypto from 'node:crypto';
import { DAY_NAMES, OUTCOME_LABEL, scheduleText, type RunMark, type RunOutcome, type ScheduledTask, type TaskDraft, type TaskProposal, type TaskSchedule } from '../../shared/automations.ts';
import { acpAgents } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import type { Deps, RunCtx, RunTool } from '../features/types.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { cleanExtra } from '../scheduler.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { userTimezone } from '../userPrefs.ts';
import { localText, nextRuns, parseLocal } from './schedule.ts';

// ---- which sessions are runs ------------------------------------------------------------------------

/** Run marks by the agent process's run id, noted when it starts (before its settings are saved). */
const marks = new Map<string, { mark: RunMark; at: number }>();

/** A starting agent's settings: a run of a task keeps its mark. */
export function noteSpawn(runId: string, extra: Record<string, unknown> | undefined) {
  const m = extra?.automations as RunMark | undefined;
  if (!m || typeof m !== 'object' || typeof m.run !== 'string') return;
  marks.set(runId, { mark: m, at: Date.now() });
  if (marks.size > 500) for (const [k, v] of marks) if (Date.now() - v.at > 2 * 86_400_000) marks.delete(k);
}

/** The run a session's agent was started for, if any. */
export function runMark(db: DB, ctx: Pick<RunCtx, 'runId' | 'key'>): RunMark | null {
  const m = marks.get(ctx.runId)?.mark ?? (sessionExtra(db, ctx.key).automations as RunMark | undefined);
  return m && typeof m === 'object' && typeof m.run === 'string' ? m : null;
}

/** A scheduled run is going on here (a run's own session, or one it posts into), or this session's parent is one. */
function inRun(d: Deps, ctx: RunCtx): boolean {
  if (runMark(d.db, ctx) || d.scheduler.runIn(ctx.key)) return true;
  const parent = sessionExtra(d.db, ctx.key).parent;
  return typeof parent === 'string' && !!(sessionExtra(d.db, parent).automations || d.scheduler.runIn(parent));
}

// ---- proposals --------------------------------------------------------------------------------------

interface ProposalRow {
  id: string;
  key: string;
  action: TaskProposal['action'];
  task_id: string | null;
  data: string;
  before: string | null;
  status: TaskProposal['status'];
  created_at: number;
  decided_at: number | null;
}

export function migrateProposals(db: DB) {
  db.exec(`create table if not exists task_proposals (
    id text primary key, key text not null, action text not null, task_id text, data text not null, before text,
    status text not null, created_at integer not null, decided_at integer
  );
  create index if not exists task_proposals_key on task_proposals(key, status);`);
}

function toProposal(db: DB, r: ProposalRow): TaskProposal {
  const tz = userTimezone(db);
  const task = JSON.parse(r.data) as TaskDraft;
  return {
    id: r.id,
    key: r.key,
    action: r.action,
    task,
    before: r.before ? (JSON.parse(r.before) as TaskDraft) : undefined,
    status: r.status,
    when: scheduleText(task.schedule, tz),
    // A watcher's checks are not runs: it looks right away, then every few minutes.
    next: r.status === 'declined' || task.schedule.kind === 'watch' ? [] : nextRuns(task.schedule, Date.now(), tz, 3),
    tz,
    taskId: r.task_id ?? undefined,
    createdAt: r.created_at,
    decidedAt: r.decided_at ?? undefined,
  };
}

export function getProposal(db: DB, id: string): TaskProposal {
  const r = db.prepare('select * from task_proposals where id = ?').get(id) as ProposalRow | undefined;
  if (!r) throw new HttpError(404, 'No such proposal');
  return toProposal(db, r);
}

function addProposal(db: DB, p: { key: string; action: TaskProposal['action']; task: TaskDraft; before?: TaskDraft; taskId?: string }): TaskProposal {
  const open = db.prepare(`select count(*) as n from task_proposals where key = ? and status = 'pending'`).get(p.key) as { n: number };
  if (open.n >= 5) throw new Error('Five proposals are waiting for the user already: wait for their answers first.');
  const id = crypto.randomBytes(6).toString('hex');
  db.prepare('insert into task_proposals (id, key, action, task_id, data, before, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    p.key,
    p.action,
    p.taskId ?? null,
    JSON.stringify(p.task),
    p.before ? JSON.stringify(p.before) : null,
    'pending',
    Date.now(),
  );
  // Answered ones are kept a month, for the cards in old conversations.
  db.prepare(`delete from task_proposals where status != 'pending' and decided_at < ?`).run(Date.now() - 30 * 86_400_000);
  return getProposal(db, id);
}

/** What a draft of a task may hold; anything else in it is left out. */
function strip(t: Partial<ScheduledTask>): TaskDraft {
  const { name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, origin, app, appName } = t as ScheduledTask;
  return JSON.parse(JSON.stringify({ name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, origin, app, appName }));
}

const FIELDS: [keyof TaskDraft, string][] = [
  ['name', 'the name'],
  ['schedule', 'when it runs'],
  ['prompt', 'the prompt'],
  ['agent', 'the agent'],
  ['acpAgent', 'the agent'],
  ['model', 'the model'],
  ['mode', 'the mode'],
  ['cwd', 'the folder'],
  ['target', 'where it runs'],
];

/** "the prompt and when it runs": what differs between two drafts. */
function changed(a: TaskDraft, b: TaskDraft): string[] {
  const out = FIELDS.filter(([k]) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map(([, w]) => w);
  return [...new Set(out)];
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The user's answer to a proposal: the change is made (with their edits), and the agent hears of it. */
export async function decide(d: Deps, id: string, yes: boolean, edited?: Partial<ScheduledTask>): Promise<TaskProposal> {
  const p = getProposal(d.db, id);
  if (p.status !== 'pending') throw new HttpError(409, 'This was answered already');
  const tz = userTimezone(d.db);
  let final = p.task;
  let task: ScheduledTask | null = null;
  if (yes) {
    const draft = edited ? strip(edited) : p.task;
    switch (p.action) {
      case 'create':
        task = d.scheduler.save({ ...draft, enabled: true }, { origin: 'chat' });
        break;
      case 'update':
        task = d.scheduler.save({ ...draft, id: p.taskId, enabled: d.scheduler.task(p.taskId!).enabled });
        break;
      case 'pause':
      case 'resume':
        task = d.scheduler.setEnabled(p.taskId!, p.action === 'resume');
        break;
      case 'delete':
        d.scheduler.remove(p.taskId!);
        break;
    }
    if (task) final = strip(task);
  }
  d.db.prepare('update task_proposals set status = ?, decided_at = ?, task_id = coalesce(?, task_id), data = ? where id = ?').run(yes ? 'confirmed' : 'declined', Date.now(), task?.id ?? null, JSON.stringify(final), id);
  const out = getProposal(d.db, id);
  d.toSubscribers(p.key, { t: 'feature', id: 'automations', key: p.key, data: { proposal: out } });
  // The agent hears the answer as a message: now if it is free, after its turn if not.
  const name = final.name;
  const next = final.schedule.kind === 'watch' ? `; it looks right away, then every ${final.schedule.minutes} min` : out.next[0] ? `, next run ${localText(out.next[0], tz)} (${tz})` : '';
  const edits = yes && edited ? changed(p.task, final) : [];
  const text = !yes
    ? { create: `The user decided not to schedule “${name}”.`, update: `The user kept “${name}” as it was.`, pause: `The user kept “${name}” running.`, resume: `“${name}” stays paused.`, delete: `The user kept “${name}”.` }[p.action]
    : {
        create: `The user confirmed the scheduled task “${name}”: ${out.when}${next}. Its id is ${task?.id}.`,
        update: `The user confirmed the change to “${name}”: ${out.when}${next}.`,
        pause: `The user paused “${name}”.`,
        resume: `The user turned “${name}” back on: ${out.when}${next}.`,
        delete: `The user deleted “${name}”.`,
      }[p.action];
  const more = edits.length ? ` They changed ${list(edits)} before saving.${edits.includes('the prompt') ? ` The prompt now reads:\n\n${final.prompt.slice(0, 1500)}` : ''}` : '';
  await d.sessions.deliverOrQueue(p.key, `${text}${more}`).catch(() => {});
  return out;
}

// ---- the tools --------------------------------------------------------------------------------------

const DAY_WORDS: Record<string, number[]> = { weekdays: [1, 2, 3, 4, 5], weekends: [0, 6], everyday: [], daily: [] };

function dayList(x: unknown): number[] | undefined {
  if (x == null) return undefined;
  const out = new Set<number>();
  for (const v of Array.isArray(x) ? x : String(x).split(/[,\s]+/)) {
    const s = String(v).trim().toLowerCase();
    if (!s) continue;
    if (DAY_WORDS[s.replace(/[\s-]/g, '')]) DAY_WORDS[s.replace(/[\s-]/g, '')].forEach((d) => out.add(d));
    else if (/^\d$/.test(s)) out.add(Number(s) % 7);
    else {
      const i = DAY_NAMES.findIndex((n) => s.startsWith(n.toLowerCase()));
      if (i >= 0) out.add(i);
    }
  }
  return out.size ? [...out].sort() : undefined;
}

/** A schedule as an agent (or the helper model) writes it, in the user's time zone. */
export function toolSchedule(x: unknown, tz: string, now = Date.now()): TaskSchedule {
  const s = (x ?? {}) as Record<string, any>;
  switch (s.kind) {
    case 'once': {
      const at = s.in_minutes != null ? now + Math.round(Number(s.in_minutes) * 60_000) : typeof s.at === 'string' ? parseLocal(s.at, tz) : Number(s.at) || null;
      if (!at || !Number.isFinite(at)) throw new Error('A once schedule needs at, the local date and time like "2026-11-06 09:00" (or in_minutes).');
      if (at < now + 30_000) throw new Error(`That time has passed: it is ${localText(now, tz)} now (${tz}).`);
      return { kind: 'once', at };
    }
    case 'daily':
      return { kind: 'daily', time: String(s.time ?? ''), days: dayList(s.days) };
    case 'every':
      return { kind: 'every', minutes: Number(s.minutes) };
    case 'cron':
      return { kind: 'cron', expr: String(s.cron ?? s.expr ?? '') };
    case 'webhook':
      return { kind: 'webhook' };
    case 'watch':
      // Addresses on this machine's network only when the user allows them in the form.
      return { kind: 'watch', minutes: Number(s.minutes) || 15, watch: { ...(s.watch ?? {}), local: false } };
  }
  throw new Error('schedule.kind must be once, daily, every, cron or watch.');
}

const agentLabel = (db: DB, t: Pick<ScheduledTask, 'agent' | 'acpAgent'>) =>
  t.agent === 'claude' ? 'Claude Code' : t.agent === 'codex' ? 'Codex' : (acpAgents(db).find((a) => a.id === t.acpAgent)?.name ?? t.acpAgent ?? 'agent');

/** The task an agent described, with what it left out taken from its own session. */
function draftFrom(d: Deps, ctx: RunCtx, a: Record<string, any>, tz: string): TaskDraft {
  const s = d.sessions.summary(ctx.key);
  const want = String(a.agent ?? '').trim();
  const acp = want && want !== 'claude' && want !== 'codex' ? want : undefined;
  const agent = !want ? ctx.agent : acp ? 'acp' : (want as 'claude' | 'codex');
  const acpAgent = !want ? ctx.acpAgent : acp;
  if (agent === 'acp' && !acpAgents(d.db).some((x) => x.id === acpAgent)) throw new Error(`There is no agent “${want}”. Use claude, codex, or an ACP agent's id (console is Custom).`);
  const same = agent === ctx.agent && acpAgent === ctx.acpAgent;
  return strip({
    name: String(a.name ?? '').trim(),
    prompt: String(a.prompt ?? '').trim(),
    schedule: toolSchedule(a.schedule, tz),
    agent,
    acpAgent,
    cwd: String(a.cwd ?? '').trim() || ctx.cwd,
    model: String(a.model ?? '').trim() || (same ? s?.prefs?.model : undefined),
    effort: same ? s?.prefs?.effort : undefined,
    mode: same ? s?.prefs?.mode : undefined,
    target: a.where === 'here' ? ctx.key : undefined,
    // Each run starts as this conversation does: its assistant, memory, spending cap, connections.
    extra: cleanExtra(sessionExtra(d.db, ctx.key)),
    // Or each run runs one of the user's templates, with its form's answers.
    ...(a.template && typeof a.template === 'object' ? { app: { id: String(a.template.id ?? ''), inputs: a.template.inputs ?? {} } } : {}),
  });
}

const WATCH_SCHEMA = {
  type: 'object',
  description:
    'kind watch only. A cheap check without a model that wakes the agent only when something changed. feed: url of an RSS or Atom feed (new items). page: url (its text changed; match keeps only the lines with that text, selector a part by a simple CSS selector). json: url and path like "data.price"; op changed (default), eq, ne, gt, lt or contains, with value. folder: path (new files; pattern like "*.pdf"). command: command (its output changing, or with on "exit" its exit code).',
  properties: {
    kind: { type: 'string', enum: ['feed', 'page', 'json', 'folder', 'command'] },
    url: { type: 'string' },
    match: { type: 'string' },
    selector: { type: 'string' },
    path: { type: 'string' },
    op: { type: 'string', enum: ['changed', 'eq', 'ne', 'gt', 'lt', 'contains'] },
    value: { type: 'string' },
    pattern: { type: 'string' },
    command: { type: 'string' },
    on: { type: 'string', enum: ['output', 'exit'] },
  },
  required: ['kind'],
};

function scheduleSchema(tz: string) {
  return {
    type: 'object',
    description: `When it runs. Times are wall-clock times in the user's time zone (${tz}).`,
    properties: {
      kind: { type: 'string', enum: ['once', 'daily', 'every', 'cron', 'watch'] },
      at: { type: 'string', description: 'once: the local date and time, "2026-11-06 09:00".' },
      in_minutes: { type: 'number', description: 'once: instead of at, this many minutes from now.' },
      time: { type: 'string', description: 'daily: "HH:MM".' },
      days: { type: 'array', items: { type: 'number' }, description: 'daily: the weekdays it runs on, 0 Sunday to 6 Saturday; leave out for every day.' },
      minutes: { type: 'number', description: 'every: the interval, at least 5. watch: how often to check (default 15).' },
      cron: { type: 'string', description: 'cron: five fields, minute hour day month weekday.' },
      watch: WATCH_SCHEMA,
    },
    required: ['kind'],
  };
}

const OUTCOMES: RunOutcome[] = ['done', 'partial', 'blocked', 'failed', 'silent'];

function scheduleTask(tz: string): RunTool {
  return {
    name: 'schedule_task',
    description: [
      'Schedule work for later or on repeat: “remind me Friday at 9”, “every Monday morning summarize X”, “tell me when this page changes”.',
      `The user sees a card with the schedule in their time zone (${tz}) and confirms or declines it there. Nothing is saved until then, and their answer comes back to you as a message, so do not ask them to confirm in text.`,
      'Each run gets the prompt in a new session (or in this conversation, with where "here"), so write it as complete instructions that make sense on their own, without this conversation.',
      'For a reminder, the prompt can simply ask the agent to tell the user the reminder.',
      'To run one of the user\'s apps each time instead (Apps; app_api GET /api/apps lists them), give template (the app and its answers) in place of prompt: each run is a run of it, with the answers given.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A short name, like “Morning brief”.' },
        prompt: { type: 'string', description: 'What the agent does on each run.' },
        schedule: scheduleSchema(tz),
        where: { type: 'string', enum: ['new', 'here'], description: 'new (default): each run starts a new session. here: each run posts into this conversation.' },
        agent: { type: 'string', description: 'Who runs it: claude, codex, or an ACP agent’s id (console is Custom). Default: the agent of this conversation.' },
        model: { type: 'string', description: 'A model id; default: this conversation’s.' },
        cwd: { type: 'string', description: 'The folder runs work in; default: this conversation’s.' },
        template: {
          type: 'object',
          description: 'Instead of prompt: one of the user\'s apps to run each time. Its answers are text: from a webhook call {{body.path}}, {{headers.name}}, {{query.name}}; from a watcher {{change}}, what it saw.',
          properties: { id: { type: 'string', description: 'The app\'s id or address.' }, inputs: { type: 'object', description: 'Its form\'s answers, by field id.' } },
          required: ['id'],
        },
      },
      required: ['name', 'schedule'],
    },
    async run(a, ctx) {
      const d = ctx.deps;
      if (inRun(d, ctx)) throw new Error('A scheduled run cannot schedule more tasks. If another task would help, say so in your summary and the user can set it up.');
      const draft = draftFrom(d, ctx, a, tz);
      if (!draft.prompt && !draft.app) throw new Error('Give the prompt each run gets (or an app to run)');
      Object.assign(draft, strip(d.scheduler.normalize(draft)));
      if (draft.app) draft.appName = d.scheduler.templateName(draft.app.id);
      if (d.scheduler.list().length >= 100) throw new Error('There are 100 scheduled tasks already: the user should remove some first.');
      const p = addProposal(d.db, { key: ctx.key, action: 'create', task: draft });
      const first = p.next[0] ? `, first run ${localText(p.next[0], tz)}` : '';
      return `The user is now looking at a card to confirm “${draft.name}”: ${p.when}${first} (${tz}), ${draft.app ? `running the app “${draft.appName}”` : `run by ${agentLabel(d.db, draft)}`}. Nothing is saved until they confirm, and their answer will come to you as a message. (proposal ${p.id})`;
    },
  };
}

function updateTask(tz: string): RunTool {
  return {
    name: 'update_task',
    description:
      'Change, pause, turn back on or delete one of the user’s scheduled tasks (ids from list_tasks). The user confirms in a card first, and their answer comes back to you as a message. For a change, give only the fields that change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        action: { type: 'string', enum: ['update', 'pause', 'resume', 'delete'], description: 'Default update.' },
        name: { type: 'string' },
        prompt: { type: 'string' },
        schedule: scheduleSchema(tz),
        where: { type: 'string', enum: ['new', 'here'] },
        model: { type: 'string' },
        cwd: { type: 'string' },
      },
      required: ['id'],
    },
    async run(a, ctx) {
      const d = ctx.deps;
      if (inRun(d, ctx)) throw new Error('A scheduled run cannot change tasks. Say what should change in your summary instead.');
      let t: ScheduledTask;
      try {
        t = d.scheduler.task(String(a.id ?? ''));
      } catch {
        throw new Error('There is no task with that id: list_tasks gives them.');
      }
      const action = (['update', 'pause', 'resume', 'delete'].includes(a.action) ? a.action : 'update') as TaskProposal['action'];
      const before = strip(t);
      const after: TaskDraft = { ...before };
      if (action === 'update') {
        if (a.name) after.name = String(a.name).trim();
        if (a.prompt) after.prompt = String(a.prompt).trim();
        if (a.schedule) after.schedule = toolSchedule(a.schedule, tz);
        if (a.where === 'here') after.target = ctx.key;
        if (a.where === 'new') delete after.target;
        if (a.model) after.model = String(a.model).trim();
        if (a.cwd) after.cwd = String(a.cwd).trim();
        Object.assign(after, strip(d.scheduler.normalize(after)));
        if (!changed(before, after).length) throw new Error('That changes nothing.');
      }
      if (action === 'pause' && !t.enabled) return `“${t.name}” is paused already.`;
      if (action === 'resume' && t.enabled) return `“${t.name}” is on already.`;
      const p = addProposal(d.db, { key: ctx.key, action, task: after, before, taskId: t.id });
      return `The user is now looking at a card to confirm this for “${t.name}”. Their answer will come to you as a message. (proposal ${p.id})`;
    },
  };
}

function listTasks(tz: string): RunTool {
  return {
    name: 'list_tasks',
    description: 'The user’s scheduled tasks: id, name, when each runs (in their time zone), the next run, how the last one went, and whether it is paused.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    async run(_a, ctx) {
      const d = ctx.deps;
      const tasks = d.scheduler.list();
      if (!tasks.length) return 'There are no scheduled tasks yet.';
      const lines = tasks.map((t) =>
        [
          `- ${t.id} · ${t.name}`,
          scheduleText(t.schedule, tz),
          t.enabled ? (t.nextAt ? `next ${localText(t.nextAt, tz)}` : 'no run to come') : `paused${t.pausedReason ? ` (${t.pausedReason})` : ''}`,
          t.recent?.[0] ? `last: ${OUTCOME_LABEL[t.recent[0].status].toLowerCase()}, ${localText(t.recent[0].at, tz)}` : 'not run yet',
          agentLabel(d.db, t),
          t.target === ctx.key ? 'posts into this conversation' : t.target ? 'posts into another session' : `new session in ${t.cwd}`,
        ].join(' · '),
      );
      return `${lines.join('\n')}\n\nTimes are in ${tz}.`;
    },
  };
}

const REPORT_OUTCOME: RunTool = {
  name: 'report_outcome',
  description:
    'For a scheduled run: say how it went, once, at the end. done; partial; blocked (you need the user: access, a decision); failed; or silent, when there is nothing worth telling the user this time (no notification goes out). The summary is the one line the user sees in the notification and in the task’s history.',
  inputSchema: {
    type: 'object',
    properties: { status: { type: 'string', enum: OUTCOMES }, summary: { type: 'string', description: 'One line for the user.' } },
    required: ['status', 'summary'],
  },
  async run(a, ctx) {
    const d = ctx.deps;
    const status = a.status as RunOutcome;
    if (!OUTCOMES.includes(status)) throw new Error('status must be done, partial, blocked, failed or silent.');
    const summary = String(a.summary ?? '').trim();
    if (!summary && status !== 'silent') throw new Error('Add a one-line summary for the user.');
    const runId = d.scheduler.runIn(ctx.key)?.id ?? runMark(d.db, ctx)?.run;
    if (!runId) return 'This conversation is not a scheduled run right now, so there is nothing to record.';
    if (!d.scheduler.report(runId, status, summary)) return 'This run has ended already; there is nothing more to record.';
    return status === 'silent' ? 'Noted: nothing to report, so no notification goes out.' : `Noted: ${status}. The user sees your summary when the run ends.`;
  },
};

const TASK_NOTES: RunTool = {
  name: 'task_notes',
  description:
    'This task’s notepad, kept across its runs: what you already reported, a running total, where you stopped. read gives it; write replaces it; append adds to its end. Keep it short: the next run starts by reading it.',
  inputSchema: {
    type: 'object',
    properties: { action: { type: 'string', enum: ['read', 'write', 'append'] }, text: { type: 'string' } },
    required: ['action'],
  },
  async run(a, ctx) {
    const d = ctx.deps;
    const mark = runMark(d.db, ctx);
    const targets = d.scheduler.targeting(ctx.key);
    const taskId = d.scheduler.runIn(ctx.key)?.task_id || mark?.task || (targets.length === 1 ? targets[0].id : '');
    if (!taskId) {
      if (mark?.test) return 'This is a test run of a task not saved yet: its notepad starts once it is saved.';
      throw new Error('This conversation is not one of a task’s runs, so there is no notepad here.');
    }
    if (a.action === 'read') return d.scheduler.notes(taskId) || '(The notepad is empty.)';
    const text = String(a.text ?? '');
    if (a.action === 'write') return `Saved the notepad (${d.scheduler.setNotes(taskId, text).length} characters).`;
    if (a.action === 'append') {
      const cur = d.scheduler.notes(taskId);
      return `Added to the notepad (${d.scheduler.setNotes(taskId, cur ? `${cur}\n${text}` : text).length} characters now).`;
    }
    throw new Error('action must be read, write or append.');
  },
};

/** The tools a session gets: a run reports and keeps notes; any other session may propose tasks. */
/** Notices each session or run sent lately, so a loop cannot flood the user's phone. */
const sentLately = new Map<string, number[]>();

/** A notice to the user now, in the open pages and on their phone: it opens the session, or what the work is (a template's run). */
const NOTIFY_USER: RunTool = {
  name: 'notify_user',
  description:
    'Send the user a notification now, in the app and on their phone (when they turned notifications on): something they asked to hear about, or a finding that cannot wait. Not for progress or a final answer: a session or run that ends tells them by itself. At most 5 in 10 minutes.',
  inputSchema: {
    type: 'object',
    properties: {
      message: { type: 'string', description: 'What to tell them, in a sentence or two.' },
      title: { type: 'string', description: 'A few words above it; default: the session’s or the app’s name.' },
    },
    required: ['message'],
  },
  async run(a, ctx) {
    const message = String(a.message ?? '').trim().slice(0, 500);
    if (!message) throw new Error('Say what to tell them (message)');
    const now = Date.now();
    const recent = (sentLately.get(ctx.key) ?? []).filter((t) => t > now - 10 * 60_000);
    if (recent.length >= 5) throw new Error('Five notifications in ten minutes is the most: put the rest in your answer');
    sentLately.set(ctx.key, [...recent, now]);
    const s = ctx.deps.sessions.summary(ctx.key);
    const title = String(a.title ?? '').trim().slice(0, 80) || ctx.notice?.title || s?.title || 'Hydor';
    // Straight out, not as a session's turn notice (a scheduled run's gate would take it for the run's own).
    ctx.deps.sessions.emit('notify', { key: ctx.key, kind: 'done', title, body: message, agent: ctx.agent, at: now, ...(ctx.notice ? { url: ctx.notice.url } : s ? {} : { url: '/' }) } satisfies NotifyEvent);
    return 'Sent.';
  },
};

export function automationTools(ctx: RunCtx): RunTool[] {
  const d = ctx.deps;
  const tz = userTimezone(d.db);
  const run = !!runMark(d.db, ctx);
  const target = d.scheduler.targeting(ctx.key).length > 0;
  return [...(run ? [] : [scheduleTask(tz), updateTask(tz)]), listTasks(tz), ...(run || target ? [REPORT_OUTCOME, TASK_NOTES] : []), NOTIFY_USER];
}
