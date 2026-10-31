// Assistants: presets that shape a session (Researcher, Writer, Tutor…): who the agent is for it, how it
// works, what it may use, and the agent, model and mode it suggests. Shared by the server (instructions,
// Custom's tool limits) and the pages (the start page's picker, Settings → Assistants).
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
  /** Connections on in its sessions, by id (Settings → Connections). */
  connections?: string[];
  /** Skills it favors, by name. */
  skills?: string[];
  /** Its permission mode; none keeps the one picked on the start page. */
  mode?: AssistantMode;
  /** Where its sessions start when no folder is picked: a new task folder (the default), or the folder on the start page (Coder). */
  folder?: 'task' | 'project';
  /** Comes with the app: it can be duplicated, not changed. */
  builtin?: boolean;
  /** The .claude/agents file it was imported from. */
  source?: string;
}

/** Settings → Assistants, with the list. */
export interface AssistantsState {
  assistants: Assistant[];
  /** How the agents talk to you: added to every agent's instructions. */
  tone: string;
  /** Where new task folders go. */
  taskRoot: string;
  defaultTaskRoot: string;
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

/** The app's own session server (Custom spells it naget_agent in tool names); its tools are the app's capabilities. */
const APP_SERVERS = ['naget-agent', 'naget_agent'];

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
 * calls them by their short names, web_search; elsewhere "mcp__naget-agent__web_search"), or another MCP
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
