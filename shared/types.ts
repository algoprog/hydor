// Types shared by the server and the web client.
import type { SessionExtra, SessionNote } from './features.ts';
import type { ApprovalForm } from './forms.ts';
import type { QuickAnswer } from './inbox.ts';
import type { AppTheme } from './themes.ts';
import type { SignatureCard } from './signatures.ts';

/** Claude Code, Codex, or an agent that speaks the Agent Client Protocol (Gemini CLI, OpenCode…). */
export type Agent = 'claude' | 'codex' | 'acp';

/** An ACP agent the app can start (Settings → More agents). */
export interface AcpAgentDef {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  /** How to install it (presets). */
  hint?: string;
  /** Console, the app's own agent: always there, not removable. */
  builtin?: boolean;
}

export type ItemStatus = 'pending' | 'running' | 'ok' | 'error' | 'declined' | 'interrupted' | 'waiting';

export interface FileChange {
  path: string;
  op: 'edit' | 'create' | 'write' | 'delete' | 'move';
  movePath?: string;
  added: number;
  removed: number;
  /** Unified-diff hunks (no file headers). */
  diff?: string;
  diffTruncated?: boolean;
}

export interface TodoEntry {
  text: string;
  status: 'pending' | 'in_progress' | 'completed' | string;
}

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  header?: string;
  question: string;
  multiSelect?: boolean;
  options: QuestionOption[];
  allowOther?: boolean;
}

export interface ApprovalOption {
  id: string;
  label: string;
  style?: 'primary' | 'danger' | 'default';
}

export interface ApprovalRequest {
  id: string;
  /** What is being approved, shown as the card title. */
  title: string;
  detail?: string;
  /** The tool_use / item this approval belongs to, when known. */
  itemId?: string;
  kind: 'tool' | 'command' | 'file' | 'permissions' | 'question' | 'plan' | 'other';
  options: ApprovalOption[];
  questions?: Question[];
  /** A form to fill in (an MCP server asks, mid-call): its fields, answered with the "accept" option. */
  form?: ApprovalForm;
  /** Asked by a connected app rather than the agent: its name. */
  from?: string;
  /** The detail is plain words in Markdown (a change to the app, ask_form's message), not a command's output. */
  prose?: boolean;
  /**
   * One of the user's apps an agent runs for them (use_app), asking for what the request left out: the card shows
   * as the app (its icon and name), with what the request said already; its form's fields are the questions left.
   */
  app?: {
    id: string;
    name: string;
    icon: string;
    color: string;
    given: { label: string; value: string }[];
    /** Keys it needs that the vault does not have yet: the card saves them there (POST /api/apps/:id/secrets) before it answers. */
    secrets?: { name: string; label: string; help?: string; url?: string }[];
  };
  /**
   * A signature: a pad to draw one an agent asked for (kept by the card itself, POST /api/signatures, before it answers
   * with the saved one's id alone), or where an agent would place one, to allow or deny.
   */
  signature?: SignatureCard;
  createdAt: number;
}

export type ToolCategory =
  | 'command'
  | 'edit'
  | 'read'
  | 'search'
  | 'web'
  | 'task'
  | 'todo'
  | 'mcp'
  | 'question'
  | 'plan'
  | 'message'
  | 'other';

export interface ToolInfo {
  /** Raw tool name, e.g. Bash, Edit, exec_command, apply_patch, mcp__server__tool. */
  name: string;
  category: ToolCategory;
  /** One-line summary: the command, the path, the query. */
  title: string;
  subtitle?: string;
  /** What the step is for, in the agent's own words (Claude's command descriptions). */
  label?: string;
  status: ItemStatus;
  input?: unknown;
  output?: string;
  /** Full output size in bytes when `output` was shortened. */
  outputBytes?: number;
  truncated?: boolean;
  exitCode?: number | null;
  durationMs?: number;
  background?: boolean;
  taskId?: string;
  cwd?: string;
  files?: FileChange[];
  todos?: TodoEntry[];
  questions?: Question[];
  answers?: Record<string, string>;
  agentId?: string;
  error?: string;
  /** The agent's own guard refused the command (auto-mode classifier / built-in safety check): the reason it gave. */
  blocked?: string;
  /** Custom's Auto mode decided this step without asking: "Auto: routine command", or why it stopped it. */
  auto?: string;
  /** Live-only: output streamed while running. */
  liveOutput?: string;
}

interface BaseItem {
  id: string;
  seq: number;
  ts?: number;
  turn?: string;
}

export type UserItem = BaseItem & {
  kind: 'user';
  text: string;
  images?: number;
  /** queued: typed while the agent was busy; slash: a slash command; note: injected by the harness. */
  meta?: 'queued' | 'slash' | 'note' | 'command-output';
  /** Set when the text is a message delivered from another Claude session (on the user's behalf). */
  peer?: PeerFrom;
  /** The message opened with a conversation carried over from another agent's session; `text` is the request after it. */
  handoff?: HandoffInfo;
  /** Byte offset of the transcript line that holds the message's images (they are read from there to show). */
  imageAt?: number;
};

/** A conversation carried over from a session of another agent (see server/handoff.ts). */
export interface HandoffInfo {
  agent: Agent;
  key?: string;
  title?: string;
  /** Messages carried over, and those left out to fit. */
  messages: number;
  omitted: number;
  context: string;
}

/** Who an incoming cross-session message came from. */
export interface PeerFrom {
  name?: string;
  mode?: string;
  address?: string;
}
/** `entry`: the transcript entry it came from (Claude), so a fork can resume up to it. */
export type AssistantItem = BaseItem & { kind: 'assistant'; text: string; phase?: string; streaming?: boolean; entry?: string };
export type ThinkingItem = BaseItem & { kind: 'thinking'; text: string; durationMs?: number; streaming?: boolean };
export type ToolItem = BaseItem & { kind: 'tool'; tool: ToolInfo };
export type SystemItem = BaseItem & {
  kind: 'system';
  level: 'info' | 'warn' | 'error';
  text: string;
  detail?: string;
  /** A cross-session notice (a peer went idle, or a message was/wasn't delivered). */
  peer?: boolean;
};
export type TurnItem = BaseItem & {
  kind: 'turn';
  status: 'completed' | 'interrupted' | 'failed' | string;
  durationMs?: number;
  tokens?: TokenUsage;
  costUsd?: number;
  model?: string;
};

export type TimelineItem = UserItem | AssistantItem | ThinkingItem | ToolItem | SystemItem | TurnItem;

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
  reasoning?: number;
}

export interface SessionStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  commands: number;
  backgroundCommands: number;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  turns: number;
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  costUsd?: number;
  /** Active generation time (ms): summed TTFT+decode per assistant reply, excluding tool runs and idle. Output throughput = tokensOut / genMs. */
  genMs?: number;
  /** Time spent working (ms): the finished turns' lengths added up, each from its message to the agent's last step. */
  workMs?: number;
}

export interface BackgroundTask {
  id: string;
  description: string;
  kind?: string;
  status: 'running' | 'completed' | 'failed' | 'stopped' | string;
  startedAt?: number;
  toolUseId?: string;
}

/** One step of a background agent: a tool it ran, or something it said. */
export interface TaskLogEntry {
  ts?: number;
  tool?: string;
  text: string;
  failed?: boolean;
}

/** The latest output of a background task. */
export interface TaskLog {
  /** output: a command's or monitor's stdout and stderr; agent: what the agent did. */
  kind: 'output' | 'agent';
  text?: string;
  entries?: TaskLogEntry[];
  /** Size of the whole output; `text` is its end when `truncated`. */
  size?: number;
  truncated?: boolean;
  updatedAt: number;
}

export type LiveStatus = 'starting' | 'idle' | 'working' | 'waiting' | 'stopping' | 'exited' | 'error';

export interface LiveState {
  status: LiveStatus;
  startedAt: number;
  pid?: number;
  model?: string;
  effort?: string;
  mode?: string;
  turnStartedAt?: number;
  pendingApprovals: number;
  error?: string;
  contextTokens?: number;
  contextWindow?: number;
  backgroundTasks?: BackgroundTask[];
  /** Output decode speed of the last reply, tokens/sec (Claude: measured from the stream; Codex: per turn). */
  tokPerSec?: number;
  /** Prompt cache (Claude): when the last request refreshed the cache, and its TTL, so the UI can count down to expiry. */
  cacheAt?: number;
  cacheTtlMs?: number;
  /** The goal the agent is working towards, while one is set (`/goal`). */
  goal?: GoalInfo;
}

/** A session running in another client (VS Code, a terminal), detected on this machine. */
export interface ExternalState {
  status: 'working' | 'waiting' | 'idle';
  /** Where it runs: "VS Code", "terminal", … */
  client: string;
  pid: number;
  detail?: string;
  since?: number;
  /** When its process started: tasks from an earlier run of the session died with that run. */
  startedAt?: number;
  /** Background commands, agents and monitors still running (from the transcript). */
  backgroundTasks?: BackgroundTask[];
}

export interface SessionSummary {
  key: string;
  agent: Agent;
  id: string;
  title: string;
  /** Settings beyond the agent's own: memory on or off, its assistant, a spending cap… */
  extra?: SessionExtra;
  /** Manual position in its sidebar group (Active, Pinned), set by drag and drop; unset ones sort first. */
  order?: number;
  external?: ExternalState | null;
  firstPrompt?: string;
  lastPrompt?: string;
  cwd?: string;
  gitBranch?: string;
  model?: string;
  source?: string;
  createdAt?: number;
  updatedAt?: number;
  sizeBytes?: number;
  stats: SessionStats;
  live?: LiveState | null;
  archived?: boolean;
  pinned?: boolean;
  createdByApp?: boolean;
  /** Settings last used from this app for the session. */
  prefs?: SessionPrefs;
  /** The conversation moved here from that session, or moved on from here to it (another agent). */
  handoffFrom?: string;
  handoffTo?: string;
  /** A fork of that session (Codex forks show only what came after; the rest is there). */
  forkFrom?: string;
  /** When a turn last finished, and when the session was last looked at: newer `doneAt` means unread. */
  doneAt?: number;
  seenAt?: number;
  /** Messages waiting for the running turn to end; `queueHeld` after you stopped the agent (or a restart). */
  queue?: QueuedMessage[];
  queueHeld?: boolean;
  /** Out of the list until then (it comes back by itself, or when it needs you). */
  snoozedUntil?: number;
  /** The session works in a worktree of its own, on its own branch. */
  worktree?: WorktreeInfo;
  /** The pull request made from the session's branch. */
  pr?: PullRequestInfo;
  /** A goal the agent keeps working towards across turns (`/goal`). */
  goal?: GoalInfo;
  /** When "Resume at reset" will continue it (after a usage limit). */
  resumeAt?: number;
  /** The added account it runs as (Settings → Accounts); missing for the CLI's own sign-in. */
  account?: string;
  /** For an ACP session: which agent (its id in Settings → More agents) and its name. */
  acpAgent?: string;
  acpName?: string;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  /** The branch it was made from, and is compared and merged against. */
  base: string;
  /** The main checkout it belongs to. */
  repo: string;
}

export interface PullRequestInfo {
  provider: 'github' | 'gitea';
  url: string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged' | 'draft';
  /** Combined status of its checks, when the host reports them. */
  checks?: 'pending' | 'success' | 'failure';
  /** The repository on the host, "owner/name". */
  repo: string;
  updatedAt?: number;
}

/** An account added for an agent, beside the CLI's own (Settings → Accounts). */
export interface AgentAccount {
  id: string;
  agent: Agent;
  name: string;
}

export interface GoalInfo {
  objective: string;
  /** active: being worked on. paused: waiting for Resume (Codex). blocked, limited: stopped by the agent, a usage limit or its token budget (Codex). */
  status: 'active' | 'paused' | 'blocked' | 'limited';
  /** Times it was checked and found not met yet (Claude). */
  turns?: number;
  /** Why the last check found it not met (Claude). */
  reason?: string;
  tokensUsed?: number;
  tokenBudget?: number;
  /** Time spent on it, in seconds (Codex). */
  seconds?: number;
}

/** Scheduled tasks and their schedules live with the rest of the automations (shared/automations.ts). */
export type { ScheduledTask, TaskSchedule } from './automations.ts';

export interface QueuedMessage {
  id: string;
  text: string;
  at: number;
  images?: number;
  files?: number;
  /** What is attached, to show and to edit. */
  att?: QueuedAttachment[];
}

export interface QueuedAttachment {
  /** `img:<n>` or `file:<n>`: which one, to show it and to keep it when the message is edited. */
  ref: string;
  name: string;
  image: boolean;
}

/** A session finished, failed or needs you: shown on open pages and pushed to subscribed devices. */
export interface NotifyEvent {
  key: string;
  kind: 'done' | 'waiting' | 'failed';
  title: string;
  body: string;
  agent: Agent;
  at: number;
  /** Set when the session is on another machine (Settings → Machines). */
  machine?: { id: string; name: string };
  /** Waiting on an approval that is a plain yes or no: a notification's Approve and Deny buttons answer it. */
  approval?: QuickAnswer;
  /** Where it opens, when that is not its session (a template's run, which may have none). */
  url?: string;
}

/** Another machine running Hydor that this one uses (Settings → Machines); its token stays on the server. */
export interface MachineView {
  /** Its pages are /m/<id>/… */
  id: string;
  name: string;
  via: 'url' | 'ssh';
  url?: string;
  /** SSH host (from ~/.ssh/config, or user@host) and the port Hydor listens on there. */
  ssh?: string;
  port?: number;
  status: MachineStatus;
}

export interface MachineStatus {
  state: 'connecting' | 'online' | 'offline';
  /** Its hostname and Hydor version, once reached. */
  host?: string;
  version?: string;
  error?: string;
  /** Sessions there that need you, and that are working. */
  waiting: number;
  working: number;
  since?: number;
}

export interface SessionPrefs {
  model?: string;
  effort?: string;
  mode?: string;
  /** The added account new sessions run as ('' or missing: the CLI's own sign-in). */
  account?: string;
}

/** An agent's model, effort and mode on the start page; null is the agent's own default. */
export interface StartRun {
  model?: string | null;
  effort?: string | null;
  mode?: string | null;
  /** An added account ('' for the CLI's own sign-in). */
  account?: string;
}

/**
 * What the start page had picked last, so it opens that way again: kept on the server, the same on
 * every device. Anything missing falls back to the start page's own defaults.
 */
export interface StartSettings {
  /** 'claude', 'codex' or 'acp:<id>'. */
  agent?: string;
  /** Each agent's last model, effort, mode and account, by the same names as `agent`. */
  runs?: Record<string, StartRun>;
  /** The assistant (General, Researcher…). */
  assistant?: string;
  /** The space picked last (its folder is `cwd`). */
  space?: string;
  /** A new task folder, or the folder in `cwd`. */
  task?: boolean;
  /** The folder picked last (also kept while a new task folder is the pick). */
  cwd?: string;
  /** A worktree of its own, when the folder is a git repository. */
  worktree?: boolean;
  /** false: without memory. */
  memory?: boolean;
  /** A spending cap in US dollars. */
  capUsd?: number;
  /** Confidential: local models only, nothing leaves this computer. */
  confidential?: boolean;
}

/** Live additions layered over the persisted timeline. */
export interface LiveOverlay {
  /** Items not yet written to the transcript (streaming text, starting tools). */
  items: TimelineItem[];
  /** Patches for persisted items, keyed by item id. */
  patches: Record<string, Partial<ToolInfo>>;
  approvals: ApprovalRequest[];
}

export interface TimelinePage {
  items: TimelineItem[];
  total: number;
  start: number;
}

export interface SearchHit {
  key: string;
  agent: Agent;
  title: string;
  cwd?: string;
  updatedAt?: number;
  kind: string;
  /** Snippet with \u0001 … \u0002 around matches. */
  snippet: string;
  ts?: number;
}

export interface ModelOption {
  value: string;
  label: string;
  /** The concrete model id an alias maps to (Claude: opus -> claude-opus-5-5). */
  resolved?: string;
  description?: string;
  efforts: string[];
  defaultEffort?: string;
  isDefault?: boolean;
  /** Custom's: it runs on this computer or your private network, so a confidential session may use it. */
  local?: boolean;
}

export interface ModeOption {
  value: string;
  label: string;
  description: string;
}

export interface AgentCatalog {
  models: ModelOption[];
  modes: ModeOption[];
  defaultMode: string;
  /** Slash commands and skills the agent takes as messages (Claude: from its initialize reply). */
  commands?: { name: string; description?: string; argumentHint?: string }[];
  /** Something to know when picking a mode here (Codex inside a container: no sandbox). */
  modeNote?: string;
}

export interface UsageWindow {
  id: string;
  label: string;
  usedPercent: number | null;
  resetsAt?: number | null;
  windowMinutes?: number | null;
  severity?: string;
  active?: boolean;
  detail?: string;
}

export interface AgentUsage {
  agent: Agent;
  ok: boolean;
  error?: string;
  fetchedAt: number;
  account?: { email?: string; plan?: string; org?: string };
  windows: UsageWindow[];
  credits?: { balance?: string; unlimited?: boolean; hasCredits?: boolean } | null;
  /** Limit resets the account holds: Codex reset credits, Claude reset grants. */
  resetCredits?: { available: number; items: LimitReset[]; nextAvailableAt?: number; cooldownUntil?: number } | null;
  /** Set while the usage is used up: which limit, and when it lifts. */
  limited?: { label: string; resetsAt?: number | null } | null;
  extra?: {
    enabled: boolean;
    monthlyLimit?: number | null;
    used?: number | null;
    utilization?: number | null;
    currency?: string | null;
    note?: string;
  } | null;
  breakdown?: { label: string; percent: number }[];
  daily?: { date: string; tokens: number }[];
  lifetimeTokens?: number;
}

/** One limit reset: using it clears the plan's usage limits now instead of waiting for them to lift. */
export interface LimitReset {
  id: string;
  title: string;
  detail?: string;
  expiresAt?: number;
  /** Uses left on it (a Claude grant can hold several). */
  left?: number;
  /** Some only work once a limit is hit. */
  usableNow: boolean;
  note?: string;
}

export interface LimitResetResult {
  ok: boolean;
  /** reset, nothing_to_reset, no_credit, already_used, cooldown, unavailable, error */
  outcome: string;
  message: string;
  usage: AgentUsage;
}

export interface AccountStatus {
  agent: Agent;
  loggedIn: boolean;
  email?: string;
  plan?: string;
  method?: string;
  detail?: string;
  error?: string;
}

export interface LoginFlow {
  id: string;
  agent: Agent;
  method: string;
  state: 'starting' | 'waiting' | 'verifying' | 'done' | 'failed' | 'cancelled';
  url?: string;
  code?: string;
  /** The flow needs the user to paste a code (Claude) or the final redirect URL (Codex browser). */
  needsInput?: 'code' | 'url';
  message?: string;
  error?: string;
}

export interface DirEntry {
  name: string;
  path: string;
  git?: boolean;
}

// ---- activity stats ----

export type StatsGranularity = 'day' | 'week' | 'month' | 'year';

export interface ActivityCounters {
  prompts: number;
  turns: number;
  messages: number;
  toolCalls: number;
  commands: number;
  fileEdits: number;
  linesAdded: number;
  linesRemoved: number;
  /** Input tokens not served from cache (Claude: input + cache writes). */
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  /** Active reply-generation time (ms) in the bucket. Output throughput = tokensOut / (genMs/1000). */
  genMs: number;
}

/** Deleting sessions nobody used for a while (Settings → General → Delete inactive sessions). */
export interface RetentionSettings {
  on: boolean;
  /** How long a session may stay inactive, in days. */
  days: number;
}

/** Estimated API cost in dollars, for priced models (subscriptions are flat-rate). */
export type StatsTotals = ActivityCounters & { sessions: number; cost?: number };

/** A model's price in dollars per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  /** Cached input; the input price when unset. */
  cacheRead?: number;
}

/** Tokens and estimated cost of one model over the window shown. */
export interface ModelUsage {
  model: string;
  /** Sessions and prompts with this model, in the window. */
  sessions?: number;
  prompts?: number;
  tokensIn: number;
  tokensCached: number;
  tokensOut: number;
  /** Null: no price known for this model (set one in Model prices). */
  cost: number | null;
  price: (ModelPrice & { source: 'custom' | 'table' }) | null;
}

export interface StatsBucket extends StatsTotals {
  key: string;
  label: string;
  /** Bucket start, ms since epoch. */
  start: number;
}

export interface StatsResponse {
  /** When the history starts, overall and per agent (ms). */
  firstAt?: number;
  firstByAgent?: Partial<Record<Agent, number>>;
  granularity: StatsGranularity;
  tz: string;
  /** The agent shown: all, one of the three kinds, or one ACP agent ("acp:console" is Custom). */
  agent: string;
  /** The one model shown, when the page asked for one. */
  model?: string;
  buckets: StatsBucket[];
  totals: StatsTotals;
  /** The same number of buckets just before this window. */
  previous: StatsTotals;
  byAgent: Record<Agent, StatsTotals>;
  /** Each agent with activity in the window, by name: Claude Code, Codex, then each ACP agent (Custom…). */
  agents: (StatsTotals & { id: string; name: string })[];
  projects: (StatsTotals & { cwd: string })[];
  byModel: ModelUsage[];
}

// ---- system monitor ----

export interface GpuSample {
  index: number;
  name: string;
  util: number;
  memUtil: number;
  memUsed: number;
  memTotal: number;
  temp: number;
  power: number;
  powerLimit: number;
  fan: number | null;
  clock: number;
  pstate: string;
}

export interface SystemSample {
  t: number;
  cpu: number;
  cores: number[];
  load: [number, number, number];
  mem: { total: number; used: number; available: number; cached: number; buffers: number };
  swap: { total: number; used: number };
  gpus: GpuSample[];
  net: { rx: number; tx: number; ifaces: Record<string, { rx: number; tx: number }> };
  disk: { read: number; write: number };
  temps: { label: string; value: number }[];
}

export interface ProcInfo {
  pid: number;
  name: string;
  cmd: string;
  user: string;
  cpu: number;
  rss: number;
  gpuMem?: number;
}

export interface SystemInfo {
  hostname: string;
  os: string;
  kernel: string;
  uptime: number;
  cpuModel: string;
  cores: number;
  mounts: { mount: string; device: string; fstype: string; size: number; used: number; avail: number }[];
  processes: { byCpu: ProcInfo[]; byMem: ProcInfo[]; gpu: ProcInfo[] };
}

export type ServerEvent =
  | { t: 'hello'; version: string; build?: string }
  /** A note the app added to a session's conversation, changed, or removed. */
  | { t: 'note'; key: string; note: SessionNote; removed?: boolean }
  /** A capability's own news (a browser's frame, a memory update…): for one session's pages when `key` is set. */
  | { t: 'feature'; id: string; key?: string; data: unknown }
  | { t: 'update'; update: UpdateState | null }
  | { t: 'models'; state: ModelsState }
  | { t: 'sessions'; upsert: SessionSummary[]; remove?: string[] }
  | { t: 'items'; key: string; items: TimelineItem[]; total: number; reset?: boolean }
  | { t: 'live'; key: string; live: LiveState | null; overlay: LiveOverlay }
  | { t: 'usage'; claude?: AgentUsage; codex?: AgentUsage; accounts?: Record<string, AgentUsage> }
  | { t: 'accounts'; accounts: AgentAccount[] }
  | { t: 'acpAgents'; agents: AcpAgentDef[] }
  | { t: 'login'; flow: LoginFlow }
  | { t: 'index'; done: number; total: number; running: boolean }
  | { t: 'system'; sample: SystemSample }
  | { t: 'toast'; level: 'info' | 'error'; text: string }
  | { t: 'kernel'; id: string; e: KernelOp }
  | { t: 'notify'; n: NotifyEvent }
  | { t: 'machines' }
  | { t: 'tasks' }
  | { t: 'themes'; themes: AppTheme[] };

export type ClientEvent = { t: 'sub'; key: string } | { t: 'unsub'; key: string } | { t: 'ping' };

// ---- notebooks ----------------------------------------------------------------------

/** One output of a code cell in nbformat shape, with multi-line strings joined. */
export interface NbOutput {
  output_type: 'stream' | 'display_data' | 'execute_result' | 'error';
  name?: 'stdout' | 'stderr';
  text?: string;
  data?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  ename?: string;
  evalue?: string;
  traceback?: string[];
  /** Live outputs only, never saved: the id that update_display_data replaces. */
  transient?: { display_id?: string };
}

export type RunState = 'queued' | 'running' | 'ok' | 'error' | 'aborted';

/** The latest run of one cell in a kernel. `seq` grows with each run, so stale messages can be told apart. */
export interface CellRun {
  cellId: string;
  seq: number;
  state: RunState;
  count: number | null;
  outputs: NbOutput[];
  startedAt?: number;
  endedAt?: number;
  /** The kernel is waiting for typed input (Python's input()). */
  input?: { prompt: string; password: boolean };
}

export type KernelStatus = 'starting' | 'idle' | 'busy' | 'restarting' | 'dead';

export interface KernelInfo {
  id: string;
  /** The notebook the kernel belongs to; it runs in that notebook's folder. */
  notebook: string;
  env: string;
  envName: string;
  language?: string;
  status: KernelStatus;
  pid: number;
  startedAt: number;
  lastActivity: number;
  /** Resident memory of the kernel process, in bytes (listings only). */
  rss?: number;
  /** Why it stopped or could not start. */
  error?: string;
}

/** A Python environment (or a registered Jupyter kernel) a notebook can run in. */
export interface KernelEnv {
  id: string;
  name: string;
  /** Where it lives, for telling similar names apart. */
  detail: string;
  kind: 'venv' | 'conda' | 'system' | 'spec';
  language: string;
  version?: string;
  /** It can start a kernel now; a Python environment needs ipykernel installed. */
  ready: boolean;
}

/** Live kernel changes, sent to pages subscribed to `kernel:<id>`. */
export type KernelOp =
  | { op: 'kernel'; kernel: KernelInfo }
  | { op: 'gone' }
  | { op: 'snapshot'; kernel: KernelInfo; runs: CellRun[] }
  /** A run's state changed; a higher `seq` than the page has means a new run with no outputs yet. */
  | { op: 'run'; run: Omit<CellRun, 'outputs'> }
  | { op: 'out'; cellId: string; seq: number; output: NbOutput }
  | { op: 'clear'; cellId: string; seq: number }
  | { op: 'replace'; cellId: string; seq: number; index: number; output: NbOutput };

// ---- git ----------------------------------------------------------------------------

export interface GitCommit {
  hash: string;
  subject: string;
  author: string;
  ts: number;
}

/** A branch or tag on a commit, as the history shows it. */
export interface GitRef {
  /** "main", "origin/main" (a remote branch), "v1.2". */
  name: string;
  kind: 'branch' | 'remote' | 'tag';
  /** The branch checked out. */
  current?: boolean;
}

/** A commit in the history: its parents (to draw the graph from) and the branches and tags on it. */
export interface GitLogCommit extends GitCommit {
  parents: string[];
  refs: GitRef[];
  email?: string;
  /** HEAD points at it. */
  head?: boolean;
}

export interface GitFileStatus {
  path: string;
  /** Porcelain XY: "M.", ".M", "A.", "D.", "R.", "??", "UU"… */
  code: string;
  from?: string;
  /** Both sides changed it (a merge or rebase that stopped): to settle. */
  conflict?: boolean;
  /** Lines added and removed against the last commit (a new file: all its lines). */
  added?: number;
  removed?: number;
  binary?: boolean;
}

export type GitOperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert';

/** A merge, rebase, revert or cherry-pick that stopped on conflicts, waiting to be continued or stopped. */
export interface GitOperation {
  kind: GitOperationKind;
  /** What is merged in, or rebased onto ("origin/main"). */
  onto?: string;
  /** A rebase's commit being put on top when it stopped; a revert's or cherry-pick's commit. */
  stoppedAt?: GitCommit;
  /** A rebase's progress: commit `step` of `steps`. */
  step?: number;
  steps?: number;
  /** The files that clash, and whether each is settled (no conflict markers left in it). */
  conflicts: { path: string; resolved: boolean }[];
}

/** A repository a session worked in, or one added on the Git page, against its upstream. */
export interface GitRepo {
  path: string;
  name: string;
  /** null when HEAD is detached. */
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** Changed and untracked files; -1 when status took too long. */
  changed: number;
  remote: string | null;
  lastCommit?: GitCommit;
  /** When the remote was last fetched (FETCH_HEAD), ms. */
  fetchedAt?: number;
  sessions: number;
  lastUsed?: number;
  /** Added on the Git page (a folder, or a clone), not found through a session. */
  manual?: boolean;
  /** The branch tracks one the remote doesn't have (deleted there, or never pushed): it can be published again. */
  upstreamGone?: boolean;
  /** A merge, rebase, revert or cherry-pick is under way. */
  operation?: GitOperationKind;
  error?: string;
}

export interface GitRepoDetail extends GitRepo {
  remotes: { name: string; url: string }[];
  toPush: GitCommit[];
  toPull: GitCommit[];
  files: GitFileStatus[];
  stashes: GitStash[];
  /** The commit checked out; null before the first commit. */
  head: string | null;
  /** A remote has HEAD already, so it can't be amended or undone without rewriting what others have. */
  headPushed: boolean;
  op: GitOperation | null;
  /** How many tags the repository has. */
  tags: number;
}

export interface GitStash {
  /** stash@{0} */
  ref: string;
  message: string;
  /** The branch it was made on. */
  branch?: string;
  ts: number;
  /** Files it holds, new ones included. */
  files?: number;
}

export interface GitBranch {
  name: string;
  ts: number;
  upstream?: string;
  /** "ahead 2, behind 1", or "gone" when its upstream was deleted. */
  track?: string;
  ahead?: number;
  behind?: number;
  /** Its upstream was deleted on the remote. */
  gone?: boolean;
  subject: string;
  hash?: string;
  author?: string;
  /** In the current branch already: safe to delete. */
  merged: boolean;
  /** A remote branch ("origin/name"). */
  remote?: boolean;
  /** A remote branch's local branch, if one tracks it or has its name. */
  local?: string;
}

/** A file a commit or stash changed, with its diff. */
export interface GitChangedFile {
  path: string;
  added: number;
  removed: number;
  binary?: boolean;
  /** A added, M modified, D deleted, R renamed, C copied. */
  status?: string;
  from?: string;
  diff: string;
}

/** One commit: its message, where it sits, the files it changed and their diffs. */
export interface GitCommitDetail {
  hash: string;
  author: string;
  email?: string;
  ts: number;
  message: string;
  parents: string[];
  refs: GitRef[];
  /** It is HEAD. */
  head: boolean;
  /** A remote branch has it. */
  pushed: boolean;
  files: GitChangedFile[];
}

export interface GitStashDetail {
  ref: string;
  files: GitChangedFile[];
}

export interface GitActionResult {
  ok: boolean;
  output: string;
  repo: GitRepoDetail;
}

/** What Sync (or Pull) did, or why it stopped. */
export interface GitSyncResult extends GitActionResult {
  /** The branch and its remote both moved on: nothing changed; ask how to put them together. */
  diverged?: { ahead: number; behind: number };
  /** The step that failed. */
  failed?: 'fetch' | 'pull' | 'push';
  /** Bringing in the remote's commits stopped on conflicts (a merge or rebase is under way). */
  conflicts?: boolean;
  pulled?: number;
  pushed?: number;
  published?: boolean;
}

/** A clone from a link, running in the background. */
export interface GitCloneJob {
  id: string;
  /** The address, a password in it hidden. */
  url: string;
  dest: string;
  state: 'running' | 'done' | 'failed';
  /** What git is doing ("Receiving objects") and how far it got. */
  phase?: string;
  percent?: number;
  output?: string;
  repo?: GitRepo;
}

// ---- agent setup: MCP servers, skills, plugins, instruction files ----

export type McpScope = 'user' | 'project' | 'local';
export type McpTransport = 'stdio' | 'http' | 'sse';

/** A configured MCP server. Env and header values never leave the server: only their names. */
export interface McpEntry {
  agent: Agent;
  name: string;
  scope: McpScope;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  envKeys?: string[];
  headerKeys?: string[];
  bearerEnv?: string;
  enabled?: boolean;
}

export interface McpSpec {
  agents: Agent[];
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  bearerEnv?: string;
  /** Claude only (Codex keeps one global list). */
  scope?: McpScope;
  cwd?: string;
}

/** A server's state as a new session sees it: `auth` needs a sign-in, `pending` was still connecting. */
export interface McpStatus {
  name: string;
  state: 'connected' | 'failed' | 'auth' | 'pending' | 'off';
  error?: string;
  tools?: number;
}

export interface SkillEntry {
  agent: Agent;
  name: string;
  description: string;
  /** The SKILL.md file. */
  path: string;
  scope: 'user' | 'project' | 'repo' | 'system' | 'admin' | 'plugin';
  enabled: boolean;
  plugin?: string;
  /** User and project skills can be deleted; system and plugin ones are managed elsewhere. */
  deletable: boolean;
}

export interface PluginEntry {
  id: string;
  name: string;
  description?: string;
  marketplace?: string;
  installCount?: number;
  version?: string;
  scope?: string;
  enabled?: boolean;
  installed: boolean;
}

export interface MarketplaceEntry {
  name: string;
  source?: string;
  repo?: string;
  url?: string;
}

/** CLAUDE.md / AGENTS.md and the like that an agent reads for a folder, in load order. */
export interface InstructionFile {
  path: string;
  scope: 'user' | 'parent' | 'project' | 'local' | 'rules';
  exists: boolean;
  size?: number;
  /** Shown even when missing, so it can be created. */
  primary?: boolean;
}

export interface SetupResult {
  ok: boolean;
  output: string;
}

/** An agent's own program (Claude Code, Codex, Gemini CLI…): yours, installed by the app, bundled with it, or missing. */
export interface ClientInfo {
  id: string;
  name: string;
  source: 'yours' | 'app' | 'bundled' | 'missing';
  /** The version the sessions run. */
  version?: string;
  path?: string;
  installing?: boolean;
  /** A newer version is out (as last looked up). */
  latest?: string;
  /** A newer version that did not work here, so the sessions keep running `version`. */
  failed?: string;
  /** Your own copy, when the sessions run another one (Codex: the one your terminal runs). */
  yours?: { version?: string; path: string };
}

/** One program a run of the agent programs' updates brought up to date, or tried to. */
export interface ClientUpdateItem {
  id: string;
  name: string;
  /** Your own copy, which the sessions do not run (Codex: the one your terminal runs). */
  yours?: boolean;
  from?: string;
  to?: string;
  ok: boolean;
  /** Why it failed. */
  error?: string;
  /** The new version did not work, so this one stays in use. */
  kept?: string;
}

/** Keeping the agents' programs current: once a day by itself, or now (Settings → Accounts → Agent programs). */
export interface ClientUpdates {
  /** Update automatically (on unless turned off). */
  auto: boolean;
  /** When the newest versions were last looked up. */
  checkedAt?: number;
  /** The lookup failed (offline, npm's registry unreachable). */
  error?: string;
  /** Looking for new versions, or updating (`current`: the program it is at). */
  running?: 'check' | 'update';
  current?: string;
  /** The last run that updated something or tried to. */
  last?: { at: number; auto: boolean; items: ClientUpdateItem[] };
}

/** How the last update went. */
export interface UpdateResult {
  ok: boolean;
  at: number;
  /** Installed by itself, not from "Update now". */
  auto: boolean;
  /** Short commits before and after (the Mac app: versions). */
  from?: string;
  to?: string;
  /** Built, but this server cannot restart itself: it runs the new version after a restart. */
  needsRestart?: boolean;
  error?: string;
}

/** A newer version, and updating to it, for a copy installed from git with an upstream, or for the Mac app. */
export interface UpdateState {
  /** How this copy updates: from git, commit by commit, or a desktop app, release by release. */
  kind?: 'git' | 'app';
  /** A desktop app's system, and how it was installed (server/desktop.ts): what Settings says about updating it. */
  platform?: 'mac' | 'windows' | 'linux';
  format?: 'app' | 'nsis' | 'appimage' | 'deb' | 'dir' | 'dev';
  /** Commits behind the upstream at the last check (the Mac app: 1 when a newer release is out). */
  behind: number;
  /** The newest upstream commit's subject (the Mac app: the newest version). */
  latest?: string;
  checkedAt: number;
  /** Why the upstream could not be reached (the counts are then from the last time it could). */
  error?: string;
  /**
   * Updates install themselves: from git, after 5 hours without a message from you, at most once a day; the Mac app
   * downloads a new version as soon as it is out, says so, and restarts into it a minute later.
   */
  auto: boolean;
  /** The server comes back by itself after it exits, its agents left running (the installer's service, the Docker image, the Mac app in a folder it may replace itself in). */
  canRestart: boolean;
  /** download: the Mac app getting and checking a new version. */
  running?: { phase: 'pull' | 'download' | 'install' | 'build' | 'restart'; since: number; auto: boolean };
  /** The Mac app: a new version downloaded and checked, waiting to be installed. */
  ready?: UpdateReady;
  last?: UpdateResult;
}

/** A new version of the Mac app, downloaded and checked, waiting for the app to restart into it. */
export interface UpdateReady {
  version: string;
  /** When it was ready. */
  at: number;
  /** Milliseconds until it installs by itself (the notice in the pages counts down); absent when it does not now. */
  installIn?: number;
  /** Put off with Later: when it asks again (ms since 1970). Absent with installIn, and when automatic updates are off. */
  later?: number;
}

// ---- models for Console, the app's own agent ---------------------------------------------------------

export type ModelProvider = 'openrouter' | 'ollama' | 'vllm' | 'endpoint';

/** A model Console can run, as its agent process reads it (models/agent.json, on the server only). */
export interface AgentModel {
  id: string;
  label: string;
  provider: ModelProvider;
  /** An OpenAI-compatible API ("…/v1"); empty for a vLLM model whose server is not up yet. */
  baseUrl: string;
  apiKey?: string;
  /** The name that API takes. */
  model: string;
  contextLength?: number;
  /**
   * native: the server returns tool_calls. template: the model's chat template shows it the tools (sent
   * with tool_choice "none") and its calls are read from the reply's text. text: tools are described in
   * the prompt, calls read from the text.
   */
  tools: 'native' | 'template' | 'text';
  vision?: boolean;
  headers?: Record<string, string>;
  /** A server that starts when the model is used (vLLM). */
  start?: boolean;
  /** It can think before it answers (OpenRouter's catalog says so): Custom asks for a reasoning effort. */
  reasoning?: boolean;
  /** The longest reply it gives, in tokens, when known. */
  maxOutput?: number;
  /** It runs on this computer or your private network (Ollama, vLLM, a local endpoint): a confidential session may use it. */
  local?: boolean;
}

export interface ModelEntry {
  id: string;
  label: string;
  provider: ModelProvider;
  contextLength?: number;
  vision?: boolean;
  tools?: 'native' | 'template' | 'text';
  detail?: string;
}

/** A model in OpenRouter's catalog, with what the search shows about it. */
export interface OpenRouterModel extends ModelEntry {
  /** Dollars per million tokens, in and out. */
  price?: ModelPrice;
  /** When OpenRouter listed it (ms). */
  created?: number;
  /** What its maker says it is for, as plain text. */
  description?: string;
  /** The longest reply it gives, in tokens. */
  maxOutput?: number;
  /** It can think before it answers. */
  reasoning?: boolean;
  /** Its maker, as OpenRouter names it ("DeepSeek"). */
  org?: string;
}

/** How the OpenRouter search orders what it finds. */
export type OpenRouterSort = 'match' | 'new' | 'price' | 'context';

/** A model found on Hugging Face, with a first guess of how it would run here (Check tells exactly). */
export interface HfModel {
  /** org/name */
  id: string;
  downloads?: number;
  likes?: number;
  /** Last changed and first published (ms). */
  updated?: number;
  created?: number;
  pipeline?: string;
  params?: number;
  /** GGUF weights run with Ollama, safetensors with vLLM. */
  kind: 'gguf' | 'safetensors' | 'other';
  vision?: boolean;
  gated?: boolean;
  contextLength?: number;
  /** Judged by its size alone: GGUF at 4-bit, safetensors as stored (for vLLM). */
  fit?: ModelFit;
  /** For safetensors: the same model at 4-bit as GGUF, with Ollama (often there as its -GGUF repository). */
  fitGguf?: ModelFit;
}

/** How the Hugging Face search orders what it finds. */
export type HfSort = 'downloads' | 'trending' | 'likes' | 'new';

/** Whether the app starts again when this computer starts, and what does it. */
export interface StartupState {
  on: boolean;
  how: 'user-service' | 'system-service' | 'docker' | 'login-item' | 'none';
  unit?: string;
  /** A user service starts at boot only while the user lingers; otherwise once they log in. */
  linger?: boolean;
  /** Whether it can be changed from here. */
  can: boolean;
  /** A desktop app's login item: on which system (what Settings calls it). */
  platform?: 'mac' | 'windows' | 'linux';
}

export interface MachineInfo {
  /** NVIDIA graphics cards (nvidia-smi). */
  gpus: { index: number; name: string; totalBytes: number; freeBytes: number }[];
  ramBytes: number;
  ramFreeBytes: number;
  diskFreeBytes: number;
  cpus: number;
  /** A Mac with Apple silicon: its chip ("Apple M3 Max"), whose graphics share the memory (ramBytes). */
  apple?: { chip: string };
}

/** Whether a model runs well here: where, the memory it needs, roughly how fast. */
export interface ModelFit {
  verdict: 'good' | 'slow' | 'tight' | 'no';
  /** 'gpu' is an NVIDIA card, or a Mac's Apple silicon graphics. */
  where: 'gpu' | 'cpu' | 'none';
  gpu?: number;
  /** Split across these NVIDIA cards (vLLM's tensor parallelism), when one alone has too little memory. */
  gpus?: number[];
  /** Stored at 8-bit as vLLM loads it (FP8), a 16-bit model that does not fit as it is. */
  fp8?: boolean;
  needBytes: number;
  tokensPerSec?: number;
  downloadBytes: number;
  params?: number;
  notes: string[];
}

/** One quantization of a GGUF repository, as Ollama pulls it. */
export interface HfQuant {
  tag: string;
  sizeBytes: number;
  ollamaName: string;
  fit: ModelFit;
}

/** What a Hugging Face repository holds, and how it would install and run here. */
export interface HfInspect {
  repo: string;
  gated?: string;
  pipeline?: string;
  arch?: string;
  modelType?: string;
  contextLength?: number;
  params?: number;
  vision?: boolean;
  customCode?: boolean;
  kind: 'safetensors' | 'gguf' | 'other';
  quants: HfQuant[];
  downloadBytes: number;
  vllm?: { supported: boolean | null; reason?: string; fit: ModelFit };
  /** The same model as GGUF, for Ollama. */
  ggufRepo?: string;
}

export interface VllmServer {
  repo: string;
  port: number;
  pid: number;
  /** The card it runs on (the first, when split); -1 on a Mac, whose graphics have no number. */
  gpu: number;
  /** Every card it is split across (tensor parallelism), when more than one. */
  gpus?: number[];
  util: number;
  maxLen: number;
  parser?: string;
  startedAt: number;
  log: string;
  state: 'starting' | 'ready' | 'failed';
  error?: string;
}

/** A model on this machine: downloaded for vLLM, or in Ollama. */
export interface LocalModel {
  id: string;
  repo: string;
  runtime: 'vllm' | 'ollama';
  sizeBytes: number;
  arch?: string;
  detail?: string;
  vision?: boolean;
  supported?: boolean | null;
  reason?: string;
  server?: Pick<VllmServer, 'state' | 'port' | 'gpu' | 'gpus' | 'error' | 'startedAt' | 'util' | 'maxLen'>;
  installedAt?: number;
}

export interface ModelDownload {
  key: string;
  name: string;
  target: 'vllm' | 'ollama';
  doneBytes: number;
  totalBytes: number;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  error?: string;
  detail?: string;
  startedAt: number;
}

export interface ModelsState {
  openrouter: { keyHint?: string; pinned: OpenRouterModel[] };
  ollama: { url: string; version?: string };
  vllm: { command?: string; path?: string; version?: string };
  endpoints: { id: string; name: string; baseUrl: string; keyHint?: string; models: string[] }[];
  hfTokenHint?: string;
  local: LocalModel[];
  downloads: ModelDownload[];
  machine: MachineInfo;
  storage: { usedBytes: number; freeBytes: number };
}
