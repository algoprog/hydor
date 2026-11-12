// `hydor tasks`: scheduled tasks, the page Settings → Scheduled tasks. List (as it always printed), show, new, edit, pause,
// resume, run now, runs (the latest ones) and remove. A task starts by itself: on a schedule (--every, --at, --cron,
// --once), when a webhook is called (--webhook) or when a watcher sees a change (--watch-…); the options after that are
// the page's (agent, model, folder, project, spending cap). The API replaces a whole task when it saves one, so `edit`
// reads the task, changes the fields named and sends it all.
import path from 'node:path';
import { scheduleText, type ScheduledTask, type TaskRun, type TaskSchedule } from '../../../shared/automations.ts';
import { enc } from '../client.ts';
import { tildify, timeAgo, truncate } from '../term.ts';
import { choose, fields, flag, markdown, mark, num, pickOne, str, table, UsageError, type Area, type Ctx, type Values } from './kit.ts';

const TASK_HINT = 'hydor tasks lists them';
const task = { name: 'task', kind: 'task', pick: true } as const;

// ---- reading what is typed ----------------------------------------------------------------------------------------

/** How often, in minutes: `30`, `30m`, `2h`, `1d`, `1h30m`. */
export function parseMinutes(text: string, what = 'a time'): number {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)(?:d|days?))?(?:(\d+)(?:h|hrs?|hours?))?(?:(\d+)(?:m|mins?|minutes?))?$/.exec(t);
  if (!t || !m || !(m[1] || m[2] || m[3])) throw new UsageError(`${what} takes minutes, hours or days, such as 30m, 2h or 1d (it was “${text}”)`);
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** A moment, in the computer's time: `2026-11-20 09:00`, `tomorrow 9:00`, `today 17:30`, `09:00` (the next one), `in 2h`. */
export function parseWhen(text: string, now = Date.now()): number {
  const t = text.trim().toLowerCase();
  let at: number | undefined;
  let m: RegExpExecArray | null;
  if ((m = /^in\s+(.+)$/.exec(t))) at = now + parseMinutes(m[1], '--once “in …”') * 60_000;
  else if ((m = /^(today|tomorrow)?\s*(\d{1,2}):(\d{2})$/.exec(t))) {
    const d = new Date(now);
    d.setHours(Number(m[2]), Number(m[3]), 0, 0);
    if (m[1] === 'tomorrow') d.setDate(d.getDate() + 1);
    else if (!m[1] && d.getTime() <= now) d.setDate(d.getDate() + 1);
    at = d.getTime();
  } else if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?$/.exec(t))) at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 9), Number(m[5] ?? 0)).getTime();
  else if (/^\d{12,13}$/.test(t)) at = Number(t);
  if (at === undefined || !Number.isFinite(at)) throw new UsageError(`--once takes a moment such as “2026-11-20 09:00”, “tomorrow 9:00” or “in 2h” (it was “${text}”)`);
  if (at <= now) throw new UsageError(`--once “${text}” has passed`);
  return at;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Days of the week for --days: weekdays, weekends, every, or names (mon,wed,fri) or numbers (0 is Sunday). */
export function parseDays(text: string): number[] | undefined {
  const t = text.trim().toLowerCase();
  if (t === 'weekdays') return [1, 2, 3, 4, 5];
  if (t === 'weekends') return [0, 6];
  if (t === 'every' || t === 'all' || t === 'daily') return undefined;
  const out = t
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((d) => (/^[0-6]$/.test(d) ? Number(d) : DAYS.indexOf(d.slice(0, 3))));
  if (!out.length || out.some((d) => d < 0)) throw new UsageError(`--days takes weekdays, weekends, every, or days such as mon,wed,fri (it was “${text}”)`);
  return [...new Set(out)].sort();
}

/** A folder as the server wants it: a full path here, as typed (`~/x` too) for another computer's Hydor. */
const folderArg = (ctx: Ctx, f: string) => (ctx.conn.here && !f.startsWith('~') ? path.resolve(f) : f);

const SCHEDULE_OPTIONS = ['every', 'at', 'cron', 'once', 'webhook', 'watch-feed', 'watch-page', 'watch-folder'] as const;

/** The schedule the options say, or undefined when none of them is given. */
export function scheduleOf(ctx: Ctx, v: Values): TaskSchedule | undefined {
  const given = SCHEDULE_OPTIONS.filter((k) => v[k] !== undefined && v[k] !== false);
  if (given.length > 1) throw new UsageError(`Say when once: ${given.map((k) => `--${k}`).join(' and ')} cannot go together`);
  const k = given[0];
  if (!k) return undefined;
  const days = str(v, 'days');
  if (days !== undefined && k !== 'at') throw new UsageError('--days goes with --at');
  switch (k) {
    case 'every': {
      const minutes = parseMinutes(str(v, 'every') ?? '', '--every');
      if (minutes < 5) throw new UsageError('--every takes 5 minutes or more');
      return { kind: 'every', minutes };
    }
    case 'at': {
      const time = /^(\d{1,2}):(\d{2})$/.exec((str(v, 'at') ?? '').trim());
      if (!time || Number(time[1]) > 23 || Number(time[2]) > 59) throw new UsageError(`--at takes a time of day such as 09:00 (it was “${str(v, 'at')}”)`);
      const d = days === undefined ? undefined : parseDays(days);
      return { kind: 'daily', time: `${time[1].padStart(2, '0')}:${time[2]}`, ...(d ? { days: d } : {}) };
    }
    case 'cron': {
      const expr = (str(v, 'cron') ?? '').trim();
      if (!expr || expr.length > 120) throw new UsageError('--cron takes five fields (“0 9 * * 1-5”) or @hourly, @daily, @weekly, @monthly, @yearly');
      return { kind: 'cron', expr };
    }
    case 'once':
      return { kind: 'once', at: parseWhen(str(v, 'once') ?? '') };
    case 'webhook': {
      const out: Extract<TaskSchedule, { kind: 'webhook' }> = { kind: 'webhook' };
      if (str(v, 'secret')) out.secret = str(v, 'secret');
      if (str(v, 'header')) out.header = str(v, 'header');
      const f = str(v, 'filter');
      const s = str(v, 'skip');
      if (f && s) throw new UsageError('--filter and --skip cannot go together');
      const spec = f ?? s;
      if (spec) {
        const i = spec.indexOf('=');
        if (i < 1) throw new UsageError('--filter and --skip take path=value, such as body.action=opened or headers.x-github-event=ping');
        out.filter = { path: spec.slice(0, i), value: spec.slice(i + 1), ...(s ? { skip: true } : {}) };
      }
      return out;
    }
    default: {
      const minutes = str(v, 'check-every') ? parseMinutes(str(v, 'check-every')!, '--check-every') : 60;
      if (minutes < 1 || minutes > 10080) throw new UsageError('--check-every takes 1 minute to 7 days');
      if (k === 'watch-feed') return { kind: 'watch', minutes, watch: { kind: 'feed', url: str(v, 'watch-feed')! } };
      if (k === 'watch-page')
        return {
          kind: 'watch',
          minutes,
          watch: { kind: 'page', url: str(v, 'watch-page')!, ...(str(v, 'match') ? { match: str(v, 'match') } : {}), ...(str(v, 'selector') ? { selector: str(v, 'selector') } : {}) },
        };
      return { kind: 'watch', minutes, watch: { kind: 'folder', path: folderArg(ctx, str(v, 'watch-folder')!), ...(str(v, 'pattern') ? { pattern: str(v, 'pattern') } : {}) } };
    }
  }
}

// ---- the task's fields ----------------------------------------------------------------------------------------------

/** The fields the API takes to save a task (the page's own list), from one as GET gives it. */
const bodyOf = (t: ScheduledTask) => {
  const { name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, app } = t;
  return { id: t.id, enabled: t.enabled, name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, app } as Record<string, unknown>;
};

const AGENT_OPTIONS = {
  agent: { type: 'string', value: '<program>', desc: 'claude, codex, custom or an ACP agent’s id', values: ['claude', 'codex', 'custom'] as string[] },
  model: { type: 'string', value: '<name>', desc: 'The model (hydor models lists them)' },
  effort: { type: 'string', value: '<level>', desc: 'How hard it thinks: low, medium, high, xhigh, max' },
  mode: { type: 'string', value: '<mode>', desc: 'What it may do alone: ask, edits, auto, plan, full…' },
  cwd: { type: 'string', value: '<folder>', desc: 'The folder it works in', kind: 'dir' },
  project: { type: 'string', value: '<project>', desc: 'Start its sessions in this project', kind: 'project' },
  as: { type: 'string', value: '<agent>', desc: 'Start its sessions as one of your agents', kind: 'agent' },
  budget: { type: 'string', value: '<dollars>', desc: 'Stop a run that has spent this much' },
  'no-memory': { type: 'boolean', desc: 'Keep memory out of its sessions' },
  target: { type: 'string', value: '<session>', desc: 'Post each run into this session', kind: 'session' },
  'fail-limit': { type: 'string', value: '<n>', desc: 'Pause after this many failures in a row (0: never)' },
  app: { type: 'string', value: '<app>', desc: 'Run this app each time instead of an agent', kind: 'app' },
  input: { type: 'string', value: '<json>', desc: 'With --app: its form’s answers, as JSON' },
} as const;

const WHEN_OPTIONS = {
  every: { type: 'string', value: '<time>', desc: 'Every 30m, 2h, 1d (5 minutes or more)' },
  at: { type: 'string', value: '<hh:mm>', desc: 'At this time of day (with --days)' },
  days: { type: 'string', value: '<days>', desc: 'With --at: weekdays, weekends, or mon,wed,fri' },
  cron: { type: 'string', value: '<expr>', desc: 'A cron expression: “0 9 * * 1-5”, @daily…' },
  once: { type: 'string', value: '<when>', desc: 'Once: “2026-11-20 09:00”, “tomorrow 9:00”, “in 2h”' },
  webhook: { type: 'boolean', desc: 'When its address is called (shown once it is made)' },
  secret: { type: 'string', value: '<text>', desc: 'With --webhook: the signing secret calls must carry' },
  header: { type: 'string', value: '<name>', desc: 'With --webhook: the header that carries the signature' },
  filter: { type: 'string', value: '<path=value>', desc: 'With --webhook: run only when it holds (body.action=opened)' },
  skip: { type: 'string', value: '<path=value>', desc: 'With --webhook: skip the run when it holds' },
  'watch-feed': { type: 'string', value: '<url>', desc: 'When a feed has something new' },
  'watch-page': { type: 'string', value: '<url>', desc: 'When a page changes (--match, --selector narrow it)' },
  'watch-folder': { type: 'string', value: '<folder>', desc: 'When a folder gets new files (--pattern “*.pdf”)', kind: 'dir' },
  'check-every': { type: 'string', value: '<time>', desc: 'With --watch-…: how often it looks (default 1h)' },
  match: { type: 'string', value: '<text>', desc: 'With --watch-page: only lines holding this' },
  selector: { type: 'string', value: '<css>', desc: 'With --watch-page: only this part of the page' },
  pattern: { type: 'string', value: '<glob>', desc: 'With --watch-folder: only files like this' },
} as const;

const TEXT_OPTIONS = {
  name: { type: 'string', value: '<name>', desc: 'The task’s name (default: the start of its prompt)' },
  prompt: { type: 'string', value: '<text>', desc: 'What the agent is asked each time' },
  file: { type: 'string', value: '<path>', desc: 'The prompt from a file (- is stdin)', kind: 'file' },
} as const;

/** The program an `--agent` word names, in the API's two fields. */
function programOf(word: string): { agent: string; acpAgent?: string } {
  const w = word.trim().toLowerCase();
  if (w === 'claude' || w === 'codex') return { agent: w };
  if (w === 'custom') return { agent: 'acp', acpAgent: 'console' };
  return { agent: 'acp', acpAgent: word.trim() };
}

/** Changes `body` by the options given: agent, model, folder, project, spending cap and the rest. */
async function applyOptions(ctx: Ctx, v: Values, body: Record<string, unknown>) {
  if (str(v, 'agent')) {
    const p = programOf(str(v, 'agent')!);
    body.agent = p.agent;
    body.acpAgent = p.acpAgent;
  }
  for (const k of ['model', 'effort', 'mode'] as const) if (str(v, k) !== undefined) body[k] = str(v, k) || undefined;
  if (str(v, 'cwd')) body.cwd = folderArg(ctx, str(v, 'cwd')!);
  const extra = { ...((body.extra as Record<string, unknown> | undefined) ?? {}) };
  if (str(v, 'project')) {
    const list = (await ctx.conn.api<{ spaces: { id: string; name: string; folder: string }[] }>('GET', '/api/projects')).spaces;
    const s = pickOne(list, str(v, 'project')!, { id: (x) => x.id, names: (x) => [x.name], what: 'project', hint: 'hydor projects lists them' });
    extra.space = s.id;
    if (!str(v, 'cwd')) body.cwd = s.folder;
  }
  if (str(v, 'as')) {
    const list = (await ctx.conn.api<{ assistants: { id: string; name: string }[] }>('GET', '/api/assistants')).assistants;
    extra.assistant = pickOne(list, str(v, 'as')!, { id: (x) => x.id, names: (x) => [x.name], what: 'agent', hint: 'hydor agents lists them' }).id;
  }
  const cap = num(v, 'budget');
  if (cap !== undefined) {
    if (cap > 0) extra.capUsd = cap;
    else delete extra.capUsd;
  }
  if (flag(v, 'no-memory')) extra.memory = false;
  body.extra = Object.keys(extra).length ? extra : undefined;
  if (str(v, 'target') !== undefined) {
    const key = str(v, 'target')!;
    if (key && ctx.conn) {
      const { resolveKey } = await import('../commands.ts');
      body.target = await resolveKey(ctx.conn, key);
    } else body.target = undefined;
  }
  const fl = num(v, 'fail-limit');
  if (fl !== undefined) {
    if (!Number.isInteger(fl) || fl > 50) throw new UsageError('--fail-limit takes a whole number from 0 to 50');
    body.failLimit = fl;
  }
  if (str(v, 'app')) {
    const list = (await ctx.conn.api<{ apps: { id: string; slug: string; name: string }[] }>('GET', '/api/apps')).apps;
    const a = pickOne(list, str(v, 'app')!, { id: (x) => x.id, names: (x) => [x.slug, x.name], what: 'app', hint: 'hydor apps lists them' });
    let inputs: Record<string, string> = {};
    if (str(v, 'input')) {
      try {
        inputs = JSON.parse(str(v, 'input')!);
      } catch {
        throw new UsageError('--input takes the app’s answers as JSON, such as \'{"city":"Lisbon"}\'');
      }
    }
    body.app = { id: a.id, inputs };
  } else if (str(v, 'input')) throw new UsageError('--input goes with --app');
}

/** The prompt: the words, --prompt, --file (- is stdin), or (on a terminal) the editor. */
async function promptOf(ctx: Ctx, words: string[], v: Values, current?: string): Promise<string | undefined> {
  if (str(v, 'prompt') !== undefined) return str(v, 'prompt');
  if (words.length) return words.join(' ');
  if (str(v, 'file')) return (await ctx.readText({ file: str(v, 'file') })) ?? undefined;
  if (current === undefined && ctx.interactive) return (await ctx.readText({ current: '', ext: 'md' })) ?? undefined;
  return undefined;
}

// ---- finding a task --------------------------------------------------------------------------------------------------

async function listTasks(ctx: Ctx): Promise<ScheduledTask[]> {
  return (await ctx.conn.api<{ tasks: ScheduledTask[] }>('GET', '/api/tasks')).tasks;
}

/** The task named (its id, its name, or the start of either), or picked on a terminal. */
async function findTask(ctx: Ctx, given: string | undefined): Promise<ScheduledTask> {
  const list = await listTasks(ctx);
  return choose(ctx, list, given, { id: (t) => t.id, names: (t) => [t.name], what: 'task', hint: TASK_HINT, label: (t) => t.name, detail: (t) => scheduleText(t.schedule) });
}

const whenText = (ms?: number) => (ms ? new Date(ms).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const RUN_MARK = { running: 'busy', done: 'done', partial: 'attention', blocked: 'attention', failed: 'error', error: 'error', silent: 'off' } as const;

export const tasks: Area = {
  name: 'tasks',
  aliases: ['task', 'scheduled'],
  summary: 'Scheduled tasks: agent work that starts by itself',
  help: 'A task runs an agent on a schedule, once, when a webhook is called or when a watcher sees a change. Name one by its name or the start of its id; on a terminal, leave it out to pick from a list.',
  group: 'models',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Your scheduled tasks, when each runs next',
      examples: ['hydor tasks', 'hydor tasks --json'],
      async run(ctx) {
        const { p } = ctx.look;
        const r = await ctx.conn.api<{ tasks: ScheduledTask[] }>('GET', '/api/tasks');
        if (ctx.o.json) return ctx.json(r);
        if (!r.tasks.length) return ctx.out('No scheduled tasks yet: hydor tasks new makes one, or ask an agent to.');
        const rows = r.tasks.map((t) => [
          p.dim(t.id),
          p.bold(t.name),
          scheduleText(t.schedule),
          t.enabled ? (t.nextAt ? p.dim(`next ${whenText(t.nextAt)}`) : '') : p.yellow(t.pausedReason ? `paused: ${t.pausedReason}` : 'paused'),
          t.lastStatus ? (t.lastStatus === 'ok' ? p.green('last ok') : p.red(`last: ${t.lastStatus}`)) : '',
        ]);
        ctx.out(table(ctx, rows, { grow: 2 }));
      },
    },
    {
      name: 'show',
      args: [task],
      summary: 'One task: when, what it asks, how it went',
      examples: ['hydor tasks show daily-brief', 'hydor tasks show daily-brief --json'],
      async run(ctx, [given]) {
        const t = await findTask(ctx, given);
        if (ctx.o.json) return ctx.json(t);
        const { p } = ctx.look;
        const last = t.recent?.[0];
        ctx.out([
          p.bold(t.name),
          ...fields(ctx, [
            ['Id', t.id],
            ['When', scheduleText(t.schedule)],
            ['Next', t.enabled && t.nextAt ? whenText(t.nextAt) : undefined],
            ['State', t.enabled ? 'on' : t.pausedReason ? `paused: ${t.pausedReason}` : 'paused'],
            [
              'Runs',
              t.app ? `the app “${t.appName ?? t.app.id}”` : [t.agent === 'acp' ? (t.acpAgent === 'console' ? 'custom' : t.acpAgent) : t.agent, t.model, t.effort, t.mode].filter(Boolean).join(' · '),
            ],
            ['Folder', t.cwd ? tildify(t.cwd, ctx.look.home) : undefined],
            ['Posts into', t.target],
            ['Spending cap', t.extra?.capUsd ? `$${t.extra.capUsd} a run` : undefined],
            ['Pauses after', t.failLimit === 0 ? 'never' : t.failLimit ? `${t.failLimit} failures in a row` : undefined],
            ['Failures', t.fails ? `${t.fails} in a row` : undefined],
            ['Last run', t.lastAt ? `${timeAgo(t.lastAt)}${t.lastStatus && t.lastStatus !== 'ok' ? ` (${t.lastStatus})` : last ? ` (${last.status})` : ''}` : undefined],
            ['Last look', t.check ? `${timeAgo(t.check.at)}: ${t.check.note ?? (t.check.ok ? 'ok' : 'failed')}` : undefined],
            ['Webhook', t.hookPath ? `${ctx.conn.base}${t.hookPath}` : undefined],
            ['Came from', t.origin],
          ]),
        ]);
        if (t.prompt) ctx.out(['', p.bold('Prompt'), ...markdown(ctx, t.prompt)]);
      },
    },
    {
      name: 'new',
      aliases: ['add', 'create'],
      args: [{ name: 'prompt', kind: 'text', optional: true, rest: true }],
      options: { ...TEXT_OPTIONS, ...WHEN_OPTIONS, ...AGENT_OPTIONS },
      summary: 'Make a task',
      help: 'The prompt is the words after new, --prompt, a file (--file, - for stdin) or, on a terminal, your editor. Say when with one of --every, --at (with --days), --cron, --once, --webhook, --watch-feed, --watch-page or --watch-folder. It works in the default folder with Claude Code unless --cwd, --project, --agent say otherwise. A webhook’s address is printed once it is made. Watching a command or a JSON address is on the page.',
      examples: [
        'hydor tasks new --at 09:00 --days weekdays "Summarise my unread email"',
        'hydor tasks new --every 6h "Warn me if a disk is over 90% full"',
        'hydor tasks new --once "tomorrow 8:00" "Remind me to call the bank"',
        'hydor tasks new --webhook --filter body.action=opened "Review {{body}}"',
      ],
      async run(ctx, words, v) {
        const schedule = scheduleOf(ctx, v);
        if (!schedule) throw new UsageError('Say when it runs: --every 6h, --at 09:00, --cron "0 9 * * 1-5", --once "tomorrow 9:00", --webhook or --watch-feed/--watch-page/--watch-folder');
        const prompt = await promptOf(ctx, words, v);
        if (!prompt && !str(v, 'app')) throw new UsageError(`Say what the agent is asked: ${ctx.usage} "<prompt>", or --file <path>`);
        const boot = await ctx.conn.api<{ defaultCwd?: string; home?: string }>('GET', '/api/bootstrap');
        const body: Record<string, unknown> = {
          name: str(v, 'name') ?? truncate((prompt ?? str(v, 'app') ?? 'Task').split('\n')[0].trim(), 60),
          prompt: prompt ?? '',
          agent: 'claude',
          cwd: boot.defaultCwd ?? boot.home ?? '~',
          schedule,
        };
        await applyOptions(ctx, v, body);
        const r = await ctx.conn.api<{ task: ScheduledTask }>('POST', '/api/tasks', body);
        if (ctx.o.json) return ctx.json(r);
        const t = r.task;
        ctx.out(`Made “${t.name}” (${t.id}): ${scheduleText(t.schedule)}${t.nextAt ? `, next ${whenText(t.nextAt)}` : ''}.`);
        if (t.hookPath) ctx.out(`Its webhook address: ${ctx.conn.base}${t.hookPath}`);
      },
    },
    {
      name: 'edit',
      args: [task, { name: 'prompt', kind: 'text', optional: true, rest: true }],
      options: { ...TEXT_OPTIONS, ...WHEN_OPTIONS, ...AGENT_OPTIONS },
      summary: 'Change a task’s prompt, schedule or settings',
      help: 'Only what you name changes. With nothing named, on a terminal, the prompt opens in your editor.',
      examples: ['hydor tasks edit daily-brief --at 08:30', 'hydor tasks edit daily-brief --model opus --budget 2', 'hydor tasks edit daily-brief "A new prompt"'],
      async run(ctx, [given, ...words], v) {
        const t = await findTask(ctx, given);
        const body = bodyOf(t);
        const schedule = scheduleOf(ctx, v);
        if (schedule) {
          // A new time of day keeps the days it had; a webhook keeps its address (the server leaves it when the kind stays).
          if (schedule.kind === 'daily' && t.schedule.kind === 'daily' && str(v, 'days') === undefined && t.schedule.days) schedule.days = t.schedule.days;
          body.schedule = schedule;
        }
        if (str(v, 'name')) body.name = str(v, 'name');
        let prompt = await promptOf(ctx, words, v, t.prompt);
        let changed = !!schedule || !!str(v, 'name') || prompt !== undefined;
        const before = JSON.stringify(body);
        await applyOptions(ctx, v, body);
        changed ||= JSON.stringify(body) !== before;
        if (!changed) {
          if (!ctx.interactive) throw new UsageError(`Say what to change (--at, --every, --model, a prompt…): ${ctx.usage}`);
          prompt = (await ctx.readText({ current: t.prompt, ext: 'md' })) ?? undefined;
          if (prompt === undefined) return ctx.out('Left as it was.');
        }
        if (prompt !== undefined) body.prompt = prompt;
        const r = await ctx.conn.api<{ task: ScheduledTask }>('POST', '/api/tasks', body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Changed “${r.task.name}”: ${scheduleText(r.task.schedule)}${r.task.enabled && r.task.nextAt ? `, next ${whenText(r.task.nextAt)}` : ''}.`);
      },
    },
    {
      name: 'pause',
      args: [task],
      summary: 'Stop a task from starting until you resume it',
      examples: ['hydor tasks pause daily-brief'],
      async run(ctx, [given]) {
        const t = await findTask(ctx, given);
        const r = await ctx.conn.api<{ task: ScheduledTask }>('POST', '/api/tasks', { ...bodyOf(t), enabled: false });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Paused “${t.name}”.`);
      },
    },
    {
      name: 'resume',
      args: [task],
      summary: 'Turn a paused task on again',
      help: 'It also clears its failure count and the reason it paused.',
      examples: ['hydor tasks resume daily-brief'],
      async run(ctx, [given]) {
        const t = await findTask(ctx, given);
        const r = await ctx.conn.api<{ task: ScheduledTask }>('POST', '/api/tasks', { ...bodyOf(t), enabled: true });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`“${t.name}” is on${r.task.nextAt ? `: next ${whenText(r.task.nextAt)}` : ''}.`);
      },
    },
    {
      name: 'run',
      args: [task],
      summary: 'Run a task now, even while paused',
      help: 'It starts at once and prints the address of its session.',
      examples: ['hydor tasks run daily-brief'],
      async run(ctx, [given]) {
        const t = await findTask(ctx, given);
        const r = await ctx.conn.api<{ key?: string }>('POST', `/api/tasks/${enc(t.id)}/run`, {});
        if (ctx.o.json) return ctx.json(r);
        ctx.out(r.key ? `Started “${t.name}”: ${ctx.conn.url(r.key)}` : `Started “${t.name}”.`);
      },
    },
    {
      name: 'runs',
      args: [task],
      summary: 'A task’s latest runs',
      help: 'Newest first, 10 unless -n says more (the server keeps 100). --reply also prints the latest run’s reply.',
      options: { reply: { type: 'boolean', desc: 'Also print the latest run’s reply' } },
      examples: ['hydor tasks runs daily-brief', 'hydor tasks runs daily-brief -n 30 --json'],
      async run(ctx, [given], v) {
        const t = await findTask(ctx, given);
        const r = await ctx.conn.api<{ runs: TaskRun[] }>('GET', `/api/automations/tasks/${enc(t.id)}/runs`);
        if (ctx.o.json) return ctx.json(r);
        if (!r.runs.length) return ctx.out(`“${t.name}” has not run yet.`);
        const { p } = ctx.look;
        const limit = ctx.o.all ? r.runs.length : (ctx.o.limit ?? 10);
        const shown = r.runs.slice(0, limit);
        ctx.out(
          table(
            ctx,
            shown.map((x) => [
              mark(p, RUN_MARK[x.status]),
              p.dim(timeAgo(x.startedAt)),
              x.status,
              p.dim(x.trigger),
              x.costUsd ? p.dim(`$${x.costUsd.toFixed(2)}`) : '',
              (x.summary ?? x.error ?? '').replace(/\s+/g, ' '),
            ]),
            { grow: 5 },
          ),
        );
        if (r.runs.length > shown.length) ctx.out(p.dim(`… ${r.runs.length - shown.length} more (-n <number>, or --all)`));
        if (flag(v, 'reply') && shown[0]?.reply) ctx.out(['', p.bold('Latest reply'), ...markdown(ctx, shown[0].reply)]);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [task],
      summary: 'Delete a task and its run history',
      help: 'The sessions it started stay.',
      examples: ['hydor tasks remove daily-brief', 'hydor tasks remove daily-brief -y'],
      async run(ctx, [given]) {
        const t = await findTask(ctx, given);
        if (!(await ctx.confirm(`Remove “${t.name}”?`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', `/api/tasks/${enc(t.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${t.name}”. The sessions it started stay.`);
      },
    },
  ],
};
