// Assistants: presets that shape a session (Researcher, Writer, Tutor…): who the agent is for it, how it
// works, what it may use, and the agent, model and mode it suggests. Shared by the server (instructions,
// Custom's tool limits) and the pages (the pickers on the start page and in a session's message box,
// Settings → Assistants).
import type { AnswerField } from './apps.ts';
import type { TaskSchedule } from './automations.ts';
import type { SessionExtra } from './features.ts';
import type { Tier } from './tiers.ts';
import type { Agent } from './types.ts';

/** What an assistant may use, by kind: each agent's own tools fall under one of these. */
export type ToolKind = 'read' | 'edit' | 'run' | 'web' | 'mcp';

/** When the agent asks first, in words every agent's modes map to. */
export type AssistantMode = 'ask' | 'edits' | 'full' | 'plan';

export interface Assistant {
  /** Stable: sessions (extra.assistant) and apps refer to it by this. */
  id: string;
  name: string;
  /** One of ASSISTANT_ICONS. */
  icon: string;
  /** One line, shown in the picker. */
  description: string;
  /** Who the agent is for this session and how it works: added to the agent's instructions. */
  instructions: string;
  /** The agent it suggests, picked with it on the start page; none keeps the one picked there. */
  agent?: Agent;
  /** For agent "acp": which one ("console" is Custom). */
  acpAgent?: string;
  /** The model it suggests, in that agent's own names. */
  model?: string;
  /** What it may use; none means everything. Tools the app itself adds (pages, memory…) stay on. */
  tools?: ToolKind[];
  /** Connections on in its sessions, by id (Apps → Connected apps). */
  connections?: string[];
  /** Skills it favors, by name. */
  skills?: string[];
  /** Its permission mode; none keeps the one picked on the start page. */
  mode?: AssistantMode;
  /** Where its sessions start when no folder is picked: a new task folder (the default), or the folder on the start page (Coder). */
  folder?: 'task' | 'project';
  /** The projects it works in, by id: it is offered only there, and works in the project's folder. None: everywhere. */
  projects?: string[];
  /** The tier it thinks with (Settings → Models → Tiers names each one's model). None: Automatic, the model picked where it starts. */
  tier?: Tier;
  /** The highest tier the helpers it starts may have ("never above"). None: any. */
  helperMax?: Tier;
  /** Other agents it may hand parts of its work to, by id. */
  canAsk?: string[];
  /** False: other agents may not hand it work. */
  askable?: false;
  /** What its sessions may spend in a month, in dollars; when it is reached, no new session starts as it until the next month. */
  budgetUsd?: number;
  /** False: a helper it starts on a tier that fails a check is not run again one tier up. */
  stepUp?: false;
  /** It keeps one conversation of its own: messages from you, other agents and its schedules go into it in turn, through its inbox. */
  standing?: boolean;
  /** What it hands back (fields, checked) and where each result goes, besides the conversation. */
  output?: AgentOutput;
  /** Comes with the app: it can be duplicated, not changed. */
  builtin?: boolean;
  /** The .claude/agents file it was imported from. */
  source?: string;
}

/** Where an agent's results go, besides the conversation. */
export type OutputTarget =
  /** A file in the folder it works in: "{date}", "{time}" and "{agent}" fill in; .json gets the fields as JSON, anything else Markdown. */
  | { kind: 'file'; path: string }
  /** A page in the Library, in its project when it works in one. */
  | { kind: 'library' }
  /** A POST of the result as JSON to an address, signed with a key from the vault when one is named. */
  | { kind: 'webhook'; url: string; secret?: string }
  /** A notification, with the result's first line. */
  | { kind: 'notify' };

export interface AgentOutput {
  /** The fields it fills in, as an app's answer fields; none: one Markdown field, its result. */
  fields?: AnswerField[];
  to?: OutputTarget[];
}

/** One result an agent handed back (hand_back), with where it went. */
export interface AgentResult {
  at: number;
  /** The session that handed it back. */
  key: string;
  /** Its first line, for the list. */
  line: string;
  value: Record<string, unknown>;
  sent: { kind: OutputTarget['kind']; ok: boolean; detail: string }[];
}

/** A message in a standing agent's inbox: who sent it, and its answer once it came. */
export interface InboxItem {
  id: string;
  /** user: you; agent: another session (its key); task: one of its schedules. */
  from: { kind: 'user' | 'agent' | 'task'; key?: string; name: string };
  text: string;
  /** queued: waiting its turn; sent: with the agent now; answered; failed (why in reply). */
  status: 'queued' | 'sent' | 'answered' | 'failed';
  reply?: string;
  createdAt: number;
  sentAt?: number;
  answeredAt?: number;
}

/** The one field a result has when an agent names none. */
export const RESULT_FIELD: AnswerField = { id: 'result', label: 'Result', type: 'markdown', required: true };
export const outputFields = (o?: AgentOutput): AnswerField[] => (o?.fields?.length ? o.fields : [RESULT_FIELD]);
export const hasOutput = (a: Pick<Assistant, 'output'>): boolean => !!(a.output?.fields?.length || a.output?.to?.length);

/** Whether an agent works in a project (by its id; none: a session in no project). Agents without projects work everywhere. */
export const inScope = (a: Pick<Assistant, 'projects'>, space?: string | null): boolean => !a.projects?.length || (!!space && a.projects.includes(space));

/**
 * Whether the agent a session works as (`lead`; null: none) may hand work to `target`: never one that does
 * not take work from other agents; a built-in agent (or none) may ask any other, since you drive those
 * sessions; an agent of yours only those it lists.
 */
export const mayAsk = (lead: Pick<Assistant, 'id' | 'builtin' | 'canAsk'> | null, target: Pick<Assistant, 'id' | 'askable'>): boolean =>
  target.askable !== false && (!lead || lead.id !== target.id) && (!lead || !!lead.builtin || !!lead.canAsk?.includes(target.id));

/** Settings → Assistants, with the list. */
export interface AssistantsState {
  assistants: Assistant[];
  /** How the agents talk to you: added to every agent's instructions. */
  tone: string;
  /** Where new task folders go. */
  taskRoot: string;
  defaultTaskRoot: string;
  /** Agents clean up after a task: what they made along the way and no longer need. */
  cleanUp: boolean;
}

/** One of an agent's schedules: a scheduled task that runs as it (Settings → Scheduled tasks). */
export interface AgentSchedule {
  id: string;
  name: string;
  schedule: TaskSchedule;
  enabled: boolean;
  nextAt?: number;
  lastStatus?: string;
}

/** What the Agents page shows of an agent beside its settings. */
export interface AgentActivity {
  schedules: AgentSchedule[];
  /** Its sessions at work now, and those waiting for you (an approval or a question). */
  working: number;
  waiting: number;
  /** When a session last started as it. */
  lastAt?: number;
  /** What its sessions spent since the month began, in dollars, and how many started. */
  monthUsd: number;
  monthSessions: number;
  /** A standing agent's inbox: messages waiting their turn, and the one it is answering. */
  inbox?: { queued: number; sent: number };
}

/** An agent drafted from a description (New agent → Draft it): its settings, and a schedule with the message each run starts with. */
export interface AgentDraft {
  agent: Partial<Assistant>;
  schedule?: TaskSchedule;
  task?: string;
}

/** What switching a session's assistant changed: its settings, and the model and mode the assistant set (in the agent's own names). */
export interface AssistantSwitch {
  extra: SessionExtra;
  model?: string;
  mode?: string;
}

export const DEFAULT_ASSISTANT = 'general';

export const TOOL_KINDS: { id: ToolKind; label: string; hint: string }[] = [
  { id: 'read', label: 'Read files', hint: 'Open, list and search files and folders' },
  { id: 'edit', label: 'Create and change files', hint: 'Write new files and edit existing ones' },
  { id: 'run', label: 'Run commands', hint: 'Programs and scripts on this computer' },
  { id: 'web', label: 'Use the web', hint: 'Search and read web pages' },
  { id: 'mcp', label: 'Other tools', hint: 'MCP servers and plugins set up for the agents' },
];

export const ASSISTANT_MODES: { id: AssistantMode; label: string; hint: string }[] = [
  { id: 'ask', label: 'Ask', hint: 'Asks before changing files and running commands' },
  { id: 'edits', label: 'Accept edits', hint: 'Changes files freely, asks before commands' },
  { id: 'full', label: 'Full access', hint: 'Never asks' },
  { id: 'plan', label: 'Plan', hint: 'Reads and plans only, until you approve' },
];

/** Icons an assistant can have (lucide names; the pages draw them). */
export const ASSISTANT_ICONS = [
  'sparkles',
  'telescope',
  'pen-line',
  'code',
  'graduation-cap',
  'calendar-check',
  'chart-column',
  'bot',
  'briefcase',
  'book-open',
  'calculator',
  'chef-hat',
  'dumbbell',
  'heart',
  'languages',
  'lightbulb',
  'megaphone',
  'music',
  'palette',
  'plane',
  'house',
  'mail',
  'scale',
  'shield',
  'wallet',
  'stethoscope',
  'leaf',
  'newspaper',
  'wrench',
  'users',
] as const;

// ---- tools -----------------------------------------------------------------------------------------

/** Custom's own tools; any it gains later are placed by their names (below). */
const CUSTOM_TOOLS: Record<string, ToolKind | null> = {
  read_file: 'read',
  list_dir: 'read',
  glob: 'read',
  grep: 'read',
  write_file: 'edit',
  edit_file: 'edit',
  multi_edit: 'edit',
  apply_patch: 'edit',
  bash: 'run',
  bash_output: 'run',
  bash_kill: 'run',
  web_fetch: 'web',
  todo_write: null,
  skill: null,
  find_tools: null,
};

/** Claude Code's tools by kind: what --disallowedTools names for an assistant's limits, and what imports read. */
export const CLAUDE_TOOLS: Record<ToolKind, string[]> = {
  read: ['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'],
  edit: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
  run: ['Bash', 'BashOutput', 'KillShell', 'KillBash', 'PowerShell'],
  web: ['WebFetch', 'WebSearch'],
  mcp: [],
};

/** The app's own session server (hydor; naget-agent, or Custom's naget_agent, before the rename); its tools are the app's capabilities. */
const APP_SERVERS = ['hydor', 'naget-agent', 'naget_agent'];

/** How Custom writes a server's name inside its tools' names. */
const cleanServer = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');

/** A tool name's kind, from what it does (web_search, read_page, http_request and browser tools are the web; read_document reads files). */
function kindByName(n: string): ToolKind | null {
  if (/^(web_|fetch|browse|browser|http|read_page)/.test(n)) return 'web';
  if (/^(bash|shell|run_|exec|python|terminal)/.test(n)) return 'run';
  if (/^(write_|edit_|create_file|delete_|move_|rename_|apply_patch)/.test(n)) return 'edit';
  if (/^(read_file|read_document|list_dir|glob|grep|find_files|search_files)$/.test(n)) return 'read';
  return null;
}

/**
 * Which kind a tool is, by its name: one of Custom's own (read_file, bash…), one of the app's own (Custom
 * calls them by their short names, web_search; elsewhere "mcp__hydor__web_search"), or another MCP
 * server's ("mcp__server__tool"). Null for those always there: the plan, skills, the app's own tools beyond
 * the web and files (pages, memory…), and those of `given` servers (the connections the app gave the
 * session), which have their own settings. Other MCP servers, the user's own, are "mcp".
 */
export function toolKind(name: string, given: readonly string[] = []): ToolKind | null {
  const m = /^mcp__(.+?)__(.+)$/.exec(name);
  if (!m) return name in CUSTOM_TOOLS ? CUSTOM_TOOLS[name] : kindByName(name);
  if (APP_SERVERS.includes(m[1])) return kindByName(m[2]);
  return given.some((g) => cleanServer(g) === m[1] || g === m[1]) ? null : 'mcp';
}

/** Whether a tool may be used when only `allowed` kinds are; with none given, every tool may. */
export function toolAllowed(name: string, allowed?: readonly string[] | null, given: readonly string[] = []): boolean {
  if (!allowed) return true;
  const k = toolKind(name, given);
  return k === null || allowed.includes(k);
}

/** The kinds an assistant leaves out; none when it allows everything. */
export const toolsOff = (a: Pick<Assistant, 'tools'>): ToolKind[] => (a.tools ? TOOL_KINDS.map((k) => k.id).filter((k) => !a.tools!.includes(k)) : []);

/**
 * The session settings that start a session with an assistant: its id, and its connections turned on
 * (Connections keeps a session's own choices in extra.connections, app id → on).
 */
export const assistantExtra = (a: Pick<Assistant, 'id' | 'connections'>): { assistant: string; connections?: Record<string, boolean> } => ({
  assistant: a.id,
  ...(a.connections?.length ? { connections: Object.fromEntries(a.connections.map((c) => [c, true])) } : {}),
});

// ---- modes ------------------------------------------------------------------------------------------

const MODE_OF: Record<string, Record<AssistantMode, string>> = {
  claude: { ask: 'default', edits: 'acceptEdits', full: 'bypassPermissions', plan: 'plan' },
  codex: { ask: 'read-only', edits: 'auto', full: 'full', plan: 'plan' },
  console: { ask: 'ask', edits: 'edits', full: 'full', plan: 'plan' },
};

/** The agent's own mode for an assistant's; undefined when the agent has none like it (another ACP agent). */
export function agentMode(mode: AssistantMode | undefined, agent: Agent, acpAgent?: string): string | undefined {
  if (!mode) return undefined;
  return MODE_OF[agent === 'acp' ? (acpAgent ?? '') : agent]?.[mode];
}
