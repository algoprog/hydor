// What a session started from the terminal starts with: what the options name, then what the web app's start page
// picked last (GET /api/bootstrap → start; read only, the terminal never changes them), then the server's defaults.
// The model is Automatic ("auto") by default when the server has tiers with a team (GET /api/models/tiers → team),
// unless one is named or the start page last picked another for that program. Also the names things show by: the
// program's, its models' and its modes'.
import path from 'node:path';
import { agentMode, assistantExtra, type Assistant, type AssistantMode } from '../../shared/assistants.ts';
import type { AcpAgentDef, Agent, AgentCatalog, StartSettings } from '../../shared/types.ts';
import { programOf, UsageError, type Opts } from './args.ts';
import { type Conn } from './client.ts';

export interface Boot {
  version: string;
  home: string;
  defaultCwd: string;
  start?: StartSettings;
  acpAgents?: AcpAgentDef[];
}

/** What a new session starts with. */
export interface Plan {
  agent: Agent;
  acpAgent?: string;
  model?: string;
  effort?: string;
  mode?: string;
  assistant?: Assistant;
  cwd?: string;
  worktree: boolean;
  capUsd?: number;
  memory: boolean;
  title?: string;
}

/** The tiers as the server keeps them, and the team settings when it has them (newer servers). */
export interface TiersState {
  tiers: Record<string, Record<string, { model?: string; effort?: string }>>;
  defaults: Record<string, Record<string, { model?: string; effort?: string }>>;
  team?: { on: boolean; hard: boolean };
}

const APP_MODES = new Set(['ask', 'edits', 'plan', 'full']);

/** The program's name: Claude Code, Codex, Custom, or the ACP agent's own. */
export function programName(agent: Agent, acpAgent: string | undefined, acp?: AcpAgentDef[]): string {
  if (agent === 'claude') return 'Claude Code';
  if (agent === 'codex') return 'Codex';
  if (acpAgent === 'console') return 'Custom';
  return acp?.find((a) => a.id === acpAgent)?.name ?? acpAgent ?? 'Agent';
}

/** The start page's name for a program: 'claude', 'codex', 'acp:<id>'. */
export const agentKey = (agent: Agent, acp?: string) => (agent === 'acp' ? `acp:${acp ?? ''}` : agent);

/** A mode as the program names it: one of ask, edits, plan, full (mapped), or the program's own name as given. */
export function modeFor(mode: string | undefined, agent: Agent, acpAgent?: string): string | undefined {
  if (!mode) return undefined;
  if (APP_MODES.has(mode)) {
    const m = agentMode(mode as AssistantMode, agent, acpAgent);
    if (!m) throw new UsageError(`This agent has no mode like “${mode}”: give one of its own (hydor models shows them)`);
    return m;
  }
  return mode;
}

/** One of your agents by its id or its name (any case). */
export async function findAssistant(conn: Conn, which: string): Promise<Assistant> {
  const { assistants } = await conn.api<{ assistants: Assistant[] }>('GET', '/api/assistants');
  const w = which.trim().toLowerCase();
  const a = assistants.find((x) => x.id.toLowerCase() === w) ?? assistants.find((x) => x.name.toLowerCase() === w) ?? assistants.find((x) => x.name.toLowerCase().startsWith(w));
  if (!a) throw new UsageError(`No agent named “${which}”: hydor agents lists them`);
  return a;
}

/** The tiers, or null when the server has none to give. */
export async function tiersOf(conn: Conn): Promise<TiersState | null> {
  try {
    return await conn.api<TiersState>('GET', '/api/models/tiers');
  } catch {
    return null;
  }
}

/** What a new session starts with, from the options, the start page's last picks and the server. */
export async function planStart(conn: Conn, o: Opts, boot: Boot, tiers: TiersState | null): Promise<Plan> {
  const start = boot.start ?? {};
  let assistant: Assistant | undefined;
  if (o.as) assistant = await findAssistant(conn, o.as);
  else if (start.assistant && start.assistant !== 'general') {
    try {
      assistant = await findAssistant(conn, start.assistant);
    } catch {}
  }
  const named = programOf(o.agent);
  let prog: { agent: Agent; acpAgent?: string };
  if (named) prog = named;
  else if (assistant?.agent) prog = { agent: assistant.agent, acpAgent: assistant.acpAgent };
  else {
    const k = start.agent;
    prog = k === 'codex' ? { agent: 'codex' } : k?.startsWith('acp:') && k.length > 4 ? { agent: 'acp', acpAgent: k.slice(4) } : { agent: 'claude' };
    if (prog.agent === 'acp' && boot.acpAgents && !boot.acpAgents.some((a) => a.id === prog.acpAgent)) prog = { agent: 'claude' };
  }
  if (prog.agent === 'acp' && named && boot.acpAgents && !boot.acpAgents.some((a) => a.id === prog.acpAgent)) {
    throw new UsageError(`No agent program “${o.agent}”: use claude, codex, custom, or one of ${boot.acpAgents.map((a) => a.id).join(', ')}`);
  }
  const run = start.runs?.[agentKey(prog.agent, prog.acpAgent)] ?? {};
  const own = assistant && assistant.agent === prog.agent ? assistant : undefined;
  let model = o.model ?? own?.model ?? (run.model || undefined);
  // Automatic when the server has a team, unless an agent of yours thinks with a tier of its own.
  if (!model && tiers?.team?.on && !assistant?.tier) model = 'auto';
  if (model === 'auto' && !tiers?.team) model = undefined;
  const mode = o.mode ? modeFor(o.mode, prog.agent, prog.acpAgent) : assistant?.mode ? agentMode(assistant.mode, prog.agent, prog.acpAgent) : (run.mode ?? undefined);
  return {
    ...prog,
    model,
    effort: o.effort ?? run.effort ?? undefined,
    mode: mode ?? undefined,
    assistant,
    // On another computer, a folder here means nothing there: its default folder, unless one is named.
    cwd: o.cwd ? (conn.local ? path.resolve(o.cwd) : o.cwd) : conn.local ? process.cwd() : undefined,
    worktree: o.worktree,
    capUsd: o.cap ?? start.capUsd,
    memory: o.noMemory ? false : start.memory !== false,
    title: o.title,
  };
}

/** The body that starts it (POST /api/sessions), with the first message. */
export function startBody(plan: Plan, prompt: string, startId: string) {
  const extra: Record<string, unknown> = {
    ...(plan.assistant ? assistantExtra(plan.assistant) : {}),
    ...(plan.memory ? {} : { memory: false }),
    ...(plan.capUsd ? { capUsd: plan.capUsd } : {}),
  };
  return {
    agent: plan.agent,
    ...(plan.acpAgent ? { acpAgent: plan.acpAgent } : {}),
    prompt,
    ...(plan.cwd ? { cwd: plan.cwd } : {}),
    ...(plan.model ? { model: plan.model } : {}),
    ...(plan.effort ? { effort: plan.effort } : {}),
    ...(plan.mode ? { mode: plan.mode } : {}),
    ...(plan.worktree ? { worktree: true } : {}),
    ...(plan.title ? { title: plan.title } : {}),
    ...(Object.keys(extra).length ? { extra } : {}),
    startId,
  };
}

/** A new start's own id, so a start sent again after its answer was lost makes no second session. */
export const newStartId = () => `new-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`.slice(0, 40);

/** A program's catalog (its models, modes and commands), or an empty one when it cannot be read. */
export async function catalogOf(conn: Conn, agent: Agent, acpAgent?: string): Promise<AgentCatalog> {
  try {
    return await conn.api<AgentCatalog>('GET', `/api/catalog/${agent}${agent === 'acp' ? `?acp=${encodeURIComponent(acpAgent ?? 'console')}` : ''}`, undefined, { timeoutMs: 30_000 });
  } catch {
    return { models: [], modes: [], defaultMode: '' };
  }
}

/** A mode's label in the program's list ("Ask", "Accept edits"…). */
export function modeLabel(mode: string | undefined, cat: AgentCatalog): string {
  const m = mode ?? cat.defaultMode;
  return cat.modes.find((x) => x.value === m)?.label ?? m ?? '';
}
