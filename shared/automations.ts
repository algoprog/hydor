// Automations: scheduled tasks and what they carry (a schedule, a watcher, a webhook's options), their
// runs, the proposals an agent makes from chat, and the words both sides use for them.
import type { SessionExtra } from './features.ts';
import type { Agent } from './types.ts';

/** Only run a webhook call whose payload has a value at a path (or skip it). */
export interface PayloadFilter {
  /** "body.action", "headers.x-github-event", "query.kind" (a bare path reads the body). */
  path: string;
  value: string;
  /** Skip the run when it matches, instead of running only then. */
  skip?: boolean;
}

/** A cheap check that wakes the agent only when something changed (no model call). */
export type WatchSpec =
  | { kind: 'feed'; url: string; local?: boolean }
  | { kind: 'page'; url: string; match?: string; selector?: string; local?: boolean }
  | { kind: 'json'; url: string; path: string; op?: JsonOp; value?: string; local?: boolean }
  | { kind: 'folder'; path: string; pattern?: string }
  | { kind: 'command'; command: string; on?: 'output' | 'exit' }
  /** New email in a folder of a connected mail account (Apps → Connected apps → Email): one run per email. */
  | { kind: 'mail'; account: string; folder?: string; from?: string; subject?: string; unread?: boolean }
  /**
   * New items in what one of a connected account's tools that only looks answers (a CRM's deals, a drive's files, a
   * helpdesk's tickets): one run per new item. Or, with `before`, a run a set time before each event a calendar's list
   * tool gives (server/automations/account-watch.ts).
   */
  | AccountWatch;

/** A connected account's tool, called at each check without a model. */
export interface AccountWatch {
  kind: 'account';
  /** The connected account (its id in Apps → Connected apps). */
  app: string;
  /** Its name when the watcher was saved, for the task list. */
  name?: string;
  /** A tool of it that only looks (lists or searches). */
  tool: string;
  /** Its arguments; text may hold {{now}}, {{now+2d}}, {{now-1h}}, {{today}} or {{tomorrow}}, filled in at each check. */
  args?: Record<string, unknown>;
  /** Where the items are in its answer, like "results" or "data.items" ("" for the answer itself); found at the first look when unset. */
  list?: string;
  /** The field that tells items apart, like "id" or "url" ("*" for the whole item); found at the first look when unset. */
  id?: string;
  /** A run a set time before each event instead of one per new item (a calendar). */
  before?: EventBefore;
}

/** "Before each event": how long before, which field holds the start, and which events count. */
export interface EventBefore {
  /** Minutes before its start (15, 30, 60…). */
  minutes?: number;
  /** Or the evening before, at this time ("18:00", in your time zone). */
  evening?: string;
  /** The field with its start time ("start.dateTime", "start_time"); found at the first look when unset. */
  start?: string;
  /** Only events whose title contains this. */
  title?: string;
  /** Only events with other people in them. */
  others?: boolean;
}

/** A connected account as the watcher's form offers it (GET /api/automations/accounts). */
export interface WatchAccount {
  id: string;
  name: string;
  /** The catalog's category ("calendar", "sales"…), and whether "Before each event" fits it. */
  category: string;
  calendar: boolean;
  /** Not signed in, or never tested: why it cannot be watched yet. */
  problem?: string;
  /** Its tools that only look and are On: the ones a watcher may call. */
  tools: { name: string; description?: string; schema?: { properties?: Record<string, any>; required?: string[] } }[];
  /** How many of its tools it does not offer: those that send, change or delete things, and those set to Ask first or Off. */
  skipped: { outside: number; notOn: number };
  /** Starting points that fit it (new files, new deals…): the tool and arguments they fill in. */
  presets: { id: string; label: string; tool: string; args: Record<string, unknown>; before?: boolean }[];
}

/** What Try it found in a connected account's answer: the lists of items, the fields of the one chosen, its items. */
export interface AccountFind {
  /** Each list of items in the answer: where it is, how many, and a label ("results: 12 items"). */
  lists: { path: string; count: number }[];
  /** The list it uses ("" for the answer itself); null when the answer has none. */
  list: string | null;
  /** The fields of its items that could tell them apart, or hold a start time, with a value of the first. */
  fields: { path: string; sample: string; unique: boolean; time: boolean }[];
  /** The field it uses to tell items apart. */
  id: string | null;
  /** For "Before each event": the field with the start time. */
  start?: string | null;
  /** The items as lines (the first 8). */
  items: string[];
  /** The answer as it came, shortened. */
  raw: string;
}

export type JsonOp = 'changed' | 'eq' | 'ne' | 'gt' | 'lt' | 'contains';

/** When a task runs: every few minutes, at a time of day, once, by a cron expression, when its URL is called, or when a watcher sees a change. */
export type TaskSchedule =
  | { kind: 'every'; minutes: number }
  | { kind: 'daily'; time: string; days?: number[] }
  | { kind: 'once'; at: number }
  | { kind: 'cron'; expr: string }
  | {
      kind: 'webhook';
      /** A signing secret: calls must carry its HMAC-SHA256 of the body (GitHub, Gitea and the like send one). */
      secret?: string;
      /** The header with the signature; the usual ones are tried when unset. */
      header?: string;
      filter?: PayloadFilter;
    }
  | { kind: 'watch'; minutes: number; watch: WatchSpec };

/** Settings each run's session starts with (server/sessionExtra.ts): an assistant, memory off, a spending cap, connections… */
export type TaskExtra = SessionExtra;

/** What a session started by a task keeps in its settings (extra.automations). */
export interface RunMark {
  /** The task; empty for a test run of one not saved yet. */
  task: string;
  run: string;
  test?: boolean;
  /** A test that sends nothing (server/outbox): calls that act outside are held as "would have sent". */
  dry?: boolean;
}

/** Agent work that starts by itself; each run starts a new session or sends a message into one. */
/**
 * A task that runs one of your templates instead of starting a session: which, and its form's answers as
 * text, filled in from a webhook's call ({{body.field}}, as in a prompt) or with what a watcher saw ({{change}}).
 */
export interface TaskApp {
  id: string;
  inputs: Record<string, string>;
}

export interface ScheduledTask {
  id: string;
  name: string;
  schedule: TaskSchedule;
  /** For a webhook task, `{{body.field}}`, `{{headers.name}}`, `{{query.name}}`, `{{body}}` and `{{request}}` fill in from the call. */
  prompt: string;
  agent: Agent;
  /** For agent 'acp': which one (Custom's id is "console"). */
  acpAgent?: string;
  cwd: string;
  model?: string;
  effort?: string;
  mode?: string;
  /** Each run's session starts with these: an assistant, memory off, a spending cap. */
  extra?: TaskExtra;
  /** Post into this session instead of starting a new one each run. */
  target?: string;
  enabled: boolean;
  nextAt?: number;
  lastAt?: number;
  /** "ok", or what went wrong starting the last run. */
  lastStatus?: string;
  /** The session the last run started or posted into. */
  lastKey?: string;
  /** Webhook tasks: the path to call (its secret is part of it). */
  hookPath?: string;
  /** Made by "Resume at reset": continues `target` once, then goes away. */
  resume?: boolean;
  createdAt: number;
  /** Pause after this many failures in a row (0: never). */
  failLimit?: number;
  /** Failures in a row so far. */
  fails?: number;
  /** Why it paused by itself. */
  pausedReason?: string;
  /** The latest runs, newest first. */
  recent?: { status: RunStatus; at: number }[];
  /** A watch task's last check. */
  check?: { at: number; ok: boolean; note?: string };
  /** Where it came from: "chat" (an agent proposed it), "session" (made from a session), "template:<id>". */
  origin?: string;
  /** It runs this template (its prompt, agent and folder go unused). */
  app?: TaskApp;
  /** That template's name now (gone: unset). */
  appName?: string;
  /**
   * A board card's refreshes (its id is board-<page>-<card>): its board and card, where it is changed (the card's …
   * → Keep it up to date…), not in the task forms.
   */
  board?: { page: string; card: string; title: string; cardTitle: string };
}

/** How a run ended, as its agent reported it (report_outcome), or as the app saw it. */
export type RunOutcome = 'done' | 'partial' | 'blocked' | 'failed' | 'silent';
/** error: the run could not start, or its turn stopped with an error. */
export type RunStatus = 'running' | RunOutcome | 'error';
export type RunTrigger = 'schedule' | 'webhook' | 'watch' | 'manual' | 'rerun' | 'test';

export interface TaskRun {
  id: string;
  /** Empty for a test run of a task not saved yet. */
  taskId: string;
  trigger: RunTrigger;
  startedAt: number;
  endedAt?: number;
  status: RunStatus;
  /** One line for the user: the agent's summary, or the start of its reply. */
  summary?: string;
  /** The agent's last reply (shortened). */
  reply?: string;
  costUsd?: number;
  /** The session it ran in. */
  key?: string;
  error?: string;
  /** It re-ran this run's input. */
  rerunOf?: string;
  /** Its input is kept, so it can run again with it. */
  hasInput: boolean;
  /** The template run it started (a task that runs a template). */
  appRun?: string;
  /** A test that sent nothing: calls to tools that send, post, delete or pay were held as "would have sent" (the Outbox keeps them). */
  dry?: boolean;
}

/** What a task would be: everything needed to save it (an id when it changes one). */
export type TaskDraft = Omit<ScheduledTask, 'id' | 'createdAt' | 'enabled'> & { id?: string; enabled?: boolean };

/** A task an agent proposed from chat (schedule_task, update_task): nothing changes until the user says so. */
export interface TaskProposal {
  id: string;
  /** The session that proposed it, which hears the answer. */
  key: string;
  action: 'create' | 'update' | 'pause' | 'resume' | 'delete';
  /** The task as it would be after. */
  task: TaskDraft;
  /** For a change: the task as it is now. */
  before?: TaskDraft;
  status: 'pending' | 'confirmed' | 'declined';
  /** Its schedule in words, and its next runs, in the user's time zone. */
  when: string;
  next: number[];
  tz: string;
  /** The task it made or changed. */
  taskId?: string;
  createdAt: number;
  decidedAt?: number;
}

/** What a watcher sees now (its Test button). */
export interface WatchPreview {
  ok: boolean;
  /** One line: "12 items, the newest from today". */
  note: string;
  /** What it read, shortened. */
  sample?: string;
  /** A connected account's watcher: where the items are, and the fields to pick from. */
  find?: AccountFind;
}

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const OUTCOME_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  done: 'Done',
  partial: 'Partly done',
  blocked: 'Blocked',
  failed: 'Failed',
  silent: 'Nothing new',
  error: 'Error',
};

export const TRIGGER_LABEL: Record<RunTrigger, string> = {
  schedule: 'On schedule',
  webhook: 'Webhook',
  watch: 'Watcher',
  manual: 'Run now',
  rerun: 'Re-run',
  test: 'Test run',
};

/** "Every 30 min", "Weekdays at 9:00", "Once, Nov 3 9:00", "When its webhook is called"; a time zone (and a locale) formats a once. */
export function scheduleText(s: TaskSchedule, tz?: string, locale = 'en-GB'): string {
  const every = (m: number) => (m % 60 === 0 ? `every ${m / 60 === 1 ? 'hour' : `${m / 60} hours`}` : `every ${m} min`);
  switch (s.kind) {
    case 'every':
      return every(s.minutes).replace(/^e/, 'E');
    case 'once':
      return `Once, ${new Date(s.at).toLocaleString(locale, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`;
    case 'webhook':
      return 'When its webhook is called';
    case 'cron':
      return `Cron ${s.expr}`;
    case 'watch':
      return `${watchText(s.watch)}, checked ${every(s.minutes)}`;
    case 'daily': {
      const d = s.days?.slice().sort();
      const which = !d?.length || d.length === 7 ? 'Daily' : d.join() === '1,2,3,4,5' ? 'Weekdays' : d.join() === '0,6' ? 'Weekends' : d.map((x) => DAY_NAMES[x]).join(', ');
      return `${which} at ${s.time}`;
    }
  }
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** "New items in a feed (example.com)", "Changes to a page (shop.com)"… */
export function watchText(w: WatchSpec): string {
  switch (w.kind) {
    case 'feed':
      return `New items in ${hostOf(w.url)}`;
    case 'page':
      return `Changes to ${hostOf(w.url)}${w.selector ? ` (${w.selector})` : w.match ? ` (near “${w.match}”)` : ''}`;
    case 'json':
      return `${w.path} at ${hostOf(w.url)}${!w.op || w.op === 'changed' ? ' changing' : ` ${JSON_OP_TEXT[w.op]} ${w.value ?? ''}`}`;
    case 'folder':
      return `New files in ${w.path}${w.pattern ? ` (${w.pattern})` : ''}`;
    case 'command':
      return `${w.on === 'exit' ? 'The exit code' : 'The output'} of “${w.command.length > 40 ? `${w.command.slice(0, 39)}…` : w.command}” changing`;
    case 'mail':
      return `New email in ${w.account}${w.folder && !/^inbox$/i.test(w.folder) ? ` (${w.folder})` : ''}${w.from ? ` from “${w.from}”` : ''}${w.subject ? ` about “${w.subject}”` : ''}${w.unread ? ', unread' : ''}`;
    case 'account': {
      const who = w.name || w.app;
      if (!w.before) return `New items from ${who} (${w.tool})`;
      const b = w.before;
      const which = `each event in ${who}${b.title ? ` titled “${b.title}”` : ''}${b.others ? ' with other people' : ''}`;
      return b.evening ? `The evening before ${which}, at ${b.evening}` : `${leadText(b.minutes ?? 30)} before ${which}`;
    }
  }
}

/** "30 min", "1 hour", "2 hours". */
export const leadText = (m: number) => (m % 60 === 0 ? (m === 60 ? '1 hour' : `${m / 60} hours`) : `${m} min`);

export const JSON_OP_TEXT: Record<JsonOp, string> = { changed: 'changes', eq: 'equals', ne: 'is not', gt: 'is above', lt: 'is below', contains: 'contains' };

// ---- the message a run starts with -----------------------------------------------------------------

/** Why a run started, as its message tells the agent. */
export const RUN_WHY: Record<RunTrigger, string> = {
  schedule: 'started on its schedule',
  webhook: 'started by a call to its webhook',
  watch: 'started because its watcher saw a change',
  manual: 'started by hand',
  rerun: 'run again with an earlier run’s input',
  test: 'a test before it is saved or changed',
};

/** The first line of a run's message (server/scheduler.ts): the task, how often it runs, why this run started, the time. */
export function runHead(o: { task: string; when: string; trigger: RunTrigger; now: string }): string {
  return `This is ${o.trigger === 'test' ? 'a test run' : 'a run'} of the scheduled task “${o.task}” (${o.when}), ${RUN_WHY[o.trigger]}. It is now ${o.now}.`;
}

const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// "How often" may hold parentheses and commas itself (a watcher's), so it runs up to the known "why".
const RUN_HEAD = new RegExp(`^This is (?:a test run|a run) of the scheduled task “(.+?)” \\((.*)\\), (${Object.values(RUN_WHY).map(reEscape).join('|')})\\. It is now .+?\\.\\n`);

/** A message a run sent: the task's own prompt, apart from what the run adds for its agent. */
export interface RunMessage {
  task: string;
  /** How often it runs: "Daily at 14:27". */
  when: string;
  trigger: RunTrigger;
  /** The run's lines for its agent: the time, report_outcome, its notes from earlier runs. */
  preamble: string;
  /** The task's prompt (a webhook's filled in, a re-run's input). */
  body: string;
}

/** A run's message split in two; null for any other message. */
export function splitRunMessage(text: string): RunMessage | null {
  const m = RUN_HEAD.exec(text);
  if (!m) return null;
  let cut = text.indexOf('\n\n', m[0].length);
  // The notes from earlier runs are a block of their own, which may hold blank lines.
  const notes = text.indexOf('\n<task-notes>\n', m[0].length);
  if (notes !== -1 && (cut === -1 || notes < cut)) {
    const close = text.indexOf('\n</task-notes>', notes);
    cut = close === -1 ? -1 : text.indexOf('\n\n', close);
  }
  if (cut === -1) return null;
  const trigger = (Object.keys(RUN_WHY) as RunTrigger[]).find((k) => RUN_WHY[k] === m[3]) ?? 'schedule';
  return { task: m[1], when: m[2], trigger, preamble: text.slice(0, cut), body: text.slice(cut + 2) };
}
