// Live Codex session through `codex app-server` (JSON-RPC over stdio), one process per thread.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { ApprovalOption, ApprovalRequest, ModelOption, Question, TimelineItem, ToolInfo } from '../../shared/types.ts';
import { config } from '../config.ts';
import { clip, firstLine, stripWrappers } from '../history/common.ts';
import { codexGoal, commandInfo, fileChanges, unwrapShellString } from '../history/codex.ts';
import type { Runner, RunSpec } from '../runner/client.ts';
import { HttpError } from '../auth.ts';
import { elicitCard, elicitCheck, elicitResult } from './elicit.ts';
import { LiveAdapter, type ApprovalAnswer, type ImageInput, type LiveConfig, type ModelCall } from './live.ts';
import { RpcError, RpcPeer } from './rpc.ts';
import { splitHandoff } from '../handoff.ts';
import type { GivenAdditions } from '../features/types.ts';
import { PAGE_SERVER } from '../mcp.ts';
import { signedOutText } from '../signin.ts';

type Json = Record<string, any>;

/** Aggregated configuration only: this does not prove that a hook captured a checkpoint. */
export interface CodexHookCounts { trusted: number; needsReview: number; disabled: number }
export interface CodexHookCoverage {
  complete: boolean;
  events: Record<'sessionStart' | 'preCompact' | 'postCompact' | 'stop', CodexHookCounts>;
}

/** Keep only event counts; hook commands, source paths and other private configuration never leave this adapter. */
export function summarizeCodexHooks(response: unknown): CodexHookCoverage | null {
  if (!response || typeof response !== 'object' || !Array.isArray((response as Json).data) || !(response as Json).data.length) return null;
  const events: CodexHookCoverage['events'] = {
    sessionStart: { trusted: 0, needsReview: 0, disabled: 0 },
    preCompact: { trusted: 0, needsReview: 0, disabled: 0 },
    postCompact: { trusted: 0, needsReview: 0, disabled: 0 },
    stop: { trusted: 0, needsReview: 0, disabled: 0 },
  };
  let complete = true;
  for (const item of (response as Json).data) {
    if (!item || !Array.isArray(item.hooks) || !Array.isArray(item.errors) || !Array.isArray(item.warnings)) { complete = false; continue; }
    if (item.errors.length || item.warnings.length) complete = false;
    for (const hook of item.hooks) {
      if (!hook || typeof hook !== 'object' || !Object.hasOwn(events, hook.eventName)) continue;
      const count = events[hook.eventName as keyof typeof events];
      if (hook.enabled === false) count.disabled++;
      else if (hook.enabled !== true) complete = false;
      else if (hook.trustStatus === 'trusted' || hook.trustStatus === 'managed') count.trusted++;
      else if (hook.trustStatus === 'untrusted' || hook.trustStatus === 'modified') count.needsReview++;
      else complete = false;
    }
  }
  return { complete, events };
}

export interface CodexOpts {
  cwd: string;
  /** This app's MCP address for the session (show_html). */
  pageServer?: string;
  threadId?: string;
  /** Start as a copy of this thread (a fork), opened by this process so it can write to it. */
  forkFrom?: string;
  /** Copy the thread only up to this turn (the rest is left out). */
  forkLastTurn?: string;
  model?: string;
  effort?: string;
  mode?: string;
  /** What the app's capabilities add: instructions, MCP servers (server/features). */
  add?: GivenAdditions;
  /** Hydor-owned, credential-free command for the native automatic compaction checkpoint. */
  wikiHookCommand?: string;
}

/** Accept only the uniquely identified command from the isolated session-flags layer. */
export function codexWikiHookConfig(command: string, response: unknown): Json | null {
  const rows = (response as Json)?.data;
  if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0].hooks) || !Array.isArray(rows[0].errors) || !Array.isArray(rows[0].warnings) || rows[0].errors.length || rows[0].warnings.length) return null;
  const hooks = rows[0].hooks.filter((h: Json) => h.source === 'sessionFlags' && h.eventName === 'preCompact');
  if (hooks.length !== 1) return null;
  const h = hooks[0];
  if (h.command !== command || h.handlerType !== 'command' || h.async !== false || h.matcher !== null || h.timeoutSec !== 20 || h.enabled !== true || h.isManaged !== false || h.trustStatus !== 'untrusted' || !/^\/<session-flags>\/config\.toml:pre_compact:0:0$/.test(h.key) || !/^sha256:[a-f0-9]{64}$/.test(h.currentHash)) return null;
  // Keep hook definition and trust in one table to avoid conflicting config merge order.
  return { hooks: { PreCompact: [{ hooks: [{ type: 'command', command, timeout: 20 }] }], state: { [h.key]: { trusted_hash: h.currentHash } } } };
}

/** Avoid overlapping existing compaction hooks or plugins whose capture behavior is unknown. */
export function codexWikiHooksMayOverlap(response: unknown): boolean {
  const rows = (response as Json)?.data;
  if (!Array.isArray(rows) || rows.length !== 1 || !Array.isArray(rows[0].hooks) || !Array.isArray(rows[0].errors) || !Array.isArray(rows[0].warnings) || rows[0].errors.length || rows[0].warnings.length) return true;
  return rows[0].hooks.some((h: Json) => h.enabled !== false && (h.eventName === 'preCompact' || h.source === 'plugin' || !!h.pluginId));
}

/** A not-yet-trusted project layer can be invisible to hooks/list until a thread starts. */
export function codexProjectHooksMayExist(cwd: string): boolean {
  let canonicalHome: string;
  let canonicalCwd: string;
  try { canonicalHome = fs.realpathSync(os.homedir()); canonicalCwd = fs.realpathSync(cwd); } catch { return true; }
  const homes = new Set([path.resolve(os.homedir()), canonicalHome]);
  for (const start of new Set([path.resolve(cwd), canonicalCwd])) {
    for (let dir = start; ; dir = path.dirname(dir)) {
      // The user's home config is already covered by hooks/list and is not a project layer.
      if (!homes.has(dir)) for (const name of ['hooks.json', 'config.toml']) {
        try { fs.lstatSync(path.join(dir, '.codex', name)); return true; }
        catch (error) { if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return true; }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
    }
  }
  return false;
}

/** Discover the exact hook hash without loading a user's configuration or executing their hooks. */
async function discoverWikiHook(command: string): Promise<Json | null> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydor-codex-hook-'));
  const keep = ['PATH', 'HOME', 'USERPROFILE', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP'];
  const env = Object.fromEntries(keep.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]!])) as Record<string, string>;
  // TOML basic strings use JSON-compatible quoting; each override is a distinct argv item, never shell text.
  const definition = `hooks.PreCompact=[{hooks=[{type="command",command=${JSON.stringify(command)},timeout=20}]}]`;
  const child = spawn(config.codexBin, ['app-server', '-c', 'features.hooks=true', '-c', definition], { cwd: home, env: codexEnv({ ...env, CODEX_HOME: home }), stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  // Spawn failures remain an unavailable hook rather than crashing the Hydor server.
  child.on('error', () => {});
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  const rpc = new RpcPeer((message) => child.stdin.write(`${JSON.stringify(message)}\n`), `wiki-discovery-${crypto.randomBytes(3).toString('hex')}`);
  child.stdin.on('error', () => rpc.failAll('Codex hook discovery unavailable'));
  child.once('close', () => rpc.failAll('Codex hook discovery exited'));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => { try { rpc.settle(JSON.parse(line)); } catch { /* Ignore non-protocol output. */ } });
  try {
    await rpc.call('initialize', { clientInfo: { name: 'hydor-wiki-discovery', version: config.version }, capabilities: { experimentalApi: true } }, 8000);
    rpc.notify('initialized');
    return codexWikiHookConfig(command, await rpc.call('hooks/list', { cwds: [home] }, 8000));
  } catch {
    return null;
  } finally {
    lines.close();
    child.kill();
    // Bound shutdown even if a broken app-server ignores termination.
    const wait = (ms: number) => new Promise<void>((resolve) => { const timer = setTimeout(resolve, ms); closed.then(() => { clearTimeout(timer); resolve(); }); });
    await wait(1000);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await wait(1000); }
    // The isolated home contains no user configuration, tokens or sessions.
    try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* Best-effort temporary cleanup. */ }
  }
}

/** What discovery found for a Codex version and hook command; a failure is remembered for a while only (it may be a passing one). */
const hookDiscoveries = new Map<string, { at: number; found: Promise<Json | null> }>();
const HOOK_RETRY_MS = 10 * 60_000;

/**
 * The hook's definition with its trust, found once per Codex version and command (not once per session): starting a second
 * Codex app server to ask it takes seconds. The app trusts only its own hook (an exact command it made itself, in a layer
 * of its own that holds nothing else), per thread; what the user's Codex has is never trusted this way.
 */
export function cachedWikiHook(version: string, command: string, discover: (command: string) => Promise<Json | null> = discoverWikiHook): Promise<Json | null> {
  const key = `${version}\0${command}`;
  const known = hookDiscoveries.get(key);
  if (known) return known.found;
  const entry = { at: Date.now(), found: discover(command).catch(() => null) };
  hookDiscoveries.set(key, entry);
  void entry.found.then((found) => { if (!found && hookDiscoveries.get(key) === entry) setTimeout(() => { if (hookDiscoveries.get(key) === entry) hookDiscoveries.delete(key); }, HOOK_RETRY_MS).unref?.(); });
  return entry.found;
}

/** Which Codex this is: what its app server says of itself, else its program's size and time (an update changes both). */
function codexVersion(initialized: unknown): string {
  const agent = (initialized as Json | null)?.userAgent;
  if (typeof agent === 'string' && agent) return agent;
  try { const st = fs.statSync(config.codexBin); return `${config.codexBin}:${st.size}:${Math.round(st.mtimeMs)}`; } catch { return config.codexBin; }
}

/** MCP servers in Codex's own config format; the app's tools need no approval. */
function codexServers(o: CodexOpts): Record<string, unknown> {
  const out: Record<string, Record<string, unknown>> = {};
  // A connected app may stop partway through a call to ask the user for a form (a card in the session
  // waits for them): Codex would give up after 60 seconds.
  for (const [name, d] of Object.entries(o.add?.mcpServers ?? {}))
    out[name] = { ...(d.type === 'http' ? { url: d.url, ...(d.headers ? { http_headers: d.headers } : {}) } : { command: d.command, args: d.args ?? [], env: d.env ?? {} }), tool_timeout_sec: 600 };
  // Its tools may take minutes (an image model at work): Codex would give up after 60 seconds.
  if (o.pageServer) out[PAGE_SERVER] = { url: o.pageServer, default_tools_approval_mode: 'approve', tool_timeout_sec: 600 };
  // Tools an assistant leaves out ("mcp__hydor__web_search"), off on their server.
  for (const m of (o.add?.disallowedTools ?? []).map((t) => /^mcp__(.+?)__(.+)$/.exec(t))) if (m && out[m[1]]) ((out[m[1]].disabled_tools ??= []) as string[]).push(m[2]);
  return out;
}

interface ModeDef {
  value: string;
  label: string;
  description: string;
  approval: string;
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  reviewer?: string;
  /** Codex collaboration mode; `plan` enables clarifying questions (request_user_input). */
  collab?: 'plan';
}

export const CODEX_MODES: ModeDef[] = [
  { value: 'plan', label: 'Plan', description: 'Discuss and plan first; Codex can ask you clarifying questions', approval: 'on-request', sandbox: 'read-only', collab: 'plan' },
  { value: 'read-only', label: 'Read only', description: 'Read files and answer; ask before changing anything', approval: 'on-request', sandbox: 'read-only' },
  { value: 'auto', label: 'Auto', description: 'Edit and run commands in the workspace; ask to go beyond it', approval: 'on-request', sandbox: 'workspace-write' },
  { value: 'auto-review', label: 'Auto review', description: 'Like Auto, but a reviewer agent answers approval requests', approval: 'on-request', sandbox: 'workspace-write', reviewer: 'auto_review' },
  { value: 'full', label: 'Full access', description: 'No sandbox and no approvals', approval: 'never', sandbox: 'danger-full-access' },
];

export function codexMode(value: string | undefined): ModeDef {
  return CODEX_MODES.find((m) => m.value === value) ?? CODEX_MODES.find((m) => m.value === 'auto')!;
}

export function codexEnv(base: Record<string, string>): Record<string, string> {
  return { ...base, CODEX_MANAGED_PACKAGE_ROOT: config.codexPackageRoot, CODEX_MANAGED_BY_NPM: '1' };
}

export function codexSpec(o: CodexOpts, env: Record<string, string>): RunSpec {
  return { cmd: config.codexBin, args: ['app-server'], cwd: o.cwd, env: codexEnv(env) };
}

export function codexModels(list: Json[] | undefined): ModelOption[] {
  return (list ?? [])
    .filter((m) => !m.hidden)
    .map((m) => ({
      value: String(m.model ?? m.id),
      label: String(m.displayName ?? m.model),
      description: m.description,
      efforts: (m.supportedReasoningEfforts ?? []).map((e: Json) => e.reasoningEffort),
      defaultEffort: m.defaultReasoningEffort,
      isDefault: !!m.isDefault,
    }));
}

function sandboxPolicy(mode: ModeDef, current?: Json): Json {
  if (mode.sandbox === 'danger-full-access') return { type: 'dangerFullAccess' };
  if (mode.sandbox === 'read-only') return { type: 'readOnly', networkAccess: false };
  return {
    type: 'workspaceWrite',
    writableRoots: current?.type === 'workspaceWrite' ? current.writableRoots ?? [] : [],
    networkAccess: current?.type === 'workspaceWrite' ? !!current.networkAccess : false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function modeFromSettings(s: Json): string | undefined {
  if (s.collaborationMode?.mode === 'plan') return 'plan';
  const sp = s.sandboxPolicy?.type;
  if (s.approvalPolicy === 'never' && sp === 'dangerFullAccess') return 'full';
  if (sp === 'readOnly') return 'read-only';
  if (sp === 'workspaceWrite') return s.approvalsReviewer === 'auto_review' ? 'auto-review' : 'auto';
  return undefined;
}

/** A record's type without its spelling: subAgentActivity, SubAgentActivity and sub_agent_activity are one (the app-server and the rollouts differ). */
const typeOf = (it: Json) => String(it.type ?? '').replace(/[_-]/g, '').toLowerCase();

/** A field of a record in either spelling (agentThreadId, agent_thread_id). */
const field = (it: Json, camel: string): any => it[camel] ?? it[camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)];

/** A message to a subagent as people can read it: Codex may send it encrypted (Fernet tokens start gAAAA), which says nothing. */
function readablePrompt(v: unknown): string {
  const t = typeof v === 'string' ? v.trim() : '';
  return t && !/^gAAAA/.test(t) ? t : '';
}

/** What a call that works with subagents is called in the conversation. */
function collabTitle(tool: string, prompt: string): string {
  const what = prompt ? `: ${firstLine(prompt, 100)}` : '';
  switch (tool) {
    case 'spawnAgent':
      return `Start a subagent${what}`;
    case 'sendInput':
    case 'sendMessage':
    case 'followupTask':
      return `Message to a subagent${what}`;
    case 'resumeAgent':
      return 'Resume a subagent';
    case 'closeAgent':
      return 'Close a subagent';
    case 'interruptAgent':
      return 'Interrupt a subagent';
    case 'wait':
    case 'waitAgent':
      return 'Wait for subagents';
    case 'listAgents':
      return 'List subagents';
    default:
      return tool ? `Subagents: ${tool.replace(/([A-Z])/g, ' $1').toLowerCase()}` : 'Subagents';
  }
}

/** A live ThreadItem (camelCase, app-server shape) as a timeline item. */
export function liveItem(it: Json, ts: number): TimelineItem | null {
  const id = String(it.id);
  const base = { id, seq: 0, ts };
  // What a subagent does reaches the app as its task (CodexLive.onAgentItem), not as a step of the turn.
  if (typeOf(it) === 'subagentactivity') return null;
  if (typeOf(it) === 'collabagenttoolcall') {
    const tool = String(it.tool ?? '');
    const prompt = readablePrompt(it.prompt);
    const status = it.status === 'failed' ? 'error' : it.status === 'inProgress' ? 'running' : 'ok';
    const model = typeof it.model === 'string' && it.model ? it.model : undefined;
    const effort = field(it, 'reasoningEffort');
    const input = { ...(prompt ? { prompt } : {}), ...(model ? { model } : {}), ...(typeof effort === 'string' && effort ? { reasoningEffort: effort } : {}) };
    return { ...base, kind: 'tool', tool: { name: tool || 'collabAgentToolCall', category: 'task', title: collabTitle(tool, prompt), status, ...(Object.keys(input).length ? { input } : {}) } };
  }
  switch (it.type) {
    case 'userMessage': {
      const text = (it.content ?? []).filter((c: Json) => c.type === 'text').map((c: Json) => c.text).join('\n');
      const images = (it.content ?? []).filter((c: Json) => c.type === 'image' || c.type === 'localImage').length;
      const ho = splitHandoff(text);
      return { ...base, kind: 'user', text: ho?.request ?? text, images: images || undefined, handoff: ho?.handoff };
    }
    case 'agentMessage':
      return { ...base, kind: 'assistant', text: String(it.text ?? ''), phase: it.phase ?? undefined };
    case 'reasoning':
      return { ...base, kind: 'thinking', text: [...(it.summary ?? []), ...(it.content ?? [])].join('\n\n') };
    case 'plan':
      return { ...base, kind: 'assistant', text: String(it.text ?? ''), phase: 'plan' };
    case 'commandExecution': {
      const tool = commandInfo(it);
      return { ...base, kind: 'tool', tool };
    }
    case 'fileChange': {
      const files = fileChanges(it.changes);
      const status = it.status === 'completed' ? 'ok' : it.status === 'failed' ? 'error' : it.status === 'declined' ? 'declined' : 'running';
      return { ...base, kind: 'tool', tool: { name: 'apply_patch', category: 'edit', title: files.length === 1 ? files[0].path : `${files.length} files`, status, files } };
    }
    case 'mcpToolCall': {
      const out = it.result?.content ? (it.result.content as Json[]).map((c) => (c.type === 'text' ? c.text : `[${c.type}]`)).join('\n') : it.error ? JSON.stringify(it.error) : '';
      const c = clip(out, 64 * 1024);
      return {
        ...base,
        kind: 'tool',
        tool: {
          name: `mcp__${it.server}__${it.tool}`,
          category: 'mcp',
          title: `${it.server} · ${it.tool}`,
          status: it.status === 'inProgress' ? 'running' : it.status === 'failed' ? 'error' : 'ok',
          input: it.arguments,
          output: c.text || undefined,
          durationMs: it.durationMs ?? undefined,
        },
      };
    }
    case 'webSearch':
      return { ...base, kind: 'tool', tool: { name: 'web_search', category: 'web', title: String(it.query ?? 'Web search'), status: 'running' } };
    case 'imageView':
      return { ...base, kind: 'tool', tool: { name: 'view_image', category: 'read', title: String(it.path ?? ''), subtitle: 'image', status: 'ok' } };
    case 'contextCompaction':
      return { ...base, kind: 'system', level: 'info', text: 'Compacting context…' };
    case 'hookPrompt':
      return null;
    default: {
      const { id: _i, type, ...rest } = it;
      return { ...base, kind: 'tool', tool: { name: String(type), category: 'other', title: String(type), status: 'running', input: rest } };
    }
  }
}

/** A turn error that says the plan's usage ran out (Codex's usageLimitExceeded). */
const usageLimitHit = (e: Json | undefined) => !!e && /usage_?limit_?(exceeded|reached)/i.test(JSON.stringify(e.codexErrorInfo ?? e.code ?? ''));

/** A turn's error that is the account's sign-in turned away: codexErrorInfo "unauthorized", or a message saying 401 Unauthorized. */
const unauthorized = (e: Json | undefined) => !!e && !usageLimitHit(e) && (/unauthori[sz]ed/i.test(JSON.stringify(e.codexErrorInfo ?? e.code ?? '')) || signedOutText('codex', String(e.message ?? '')));

export class CodexLive extends LiveAdapter {
  readonly agent = 'codex' as const;
  rpc: RpcPeer;
  turnId?: string;
  settings: Json = {};
  private turnStartMs = 0;
  private lastTurnOut = 0;
  /** Lines re-read after a restart: they report no model calls again. */
  private replaying = false;
  /** The thread's running token totals as last reported, and how many calls this process saw. */
  private usageTotal: Json | null = null;
  private calls = 0;
  private serverReqs = new Map<string, { id: string | number; method: string; params: Json }>();
  private next: Json = {};
  private threadHookQuerySupported?: boolean;

  constructor(
    runner: Runner,
    private opts: CodexOpts,
  ) {
    super(runner);
    this.sessionId = opts.threadId;
    this.state.model = opts.model;
    this.state.effort = opts.effort;
    this.state.mode = opts.mode ?? 'auto';
    this.rpc = new RpcPeer((o) => runner.writeLine(o), `wa-${crypto.randomBytes(3).toString('hex')}`);
    runner.on('line', (line: string, replay: boolean) => this.onLine(line, replay));
  }

  /** Inspect this running thread's hook configuration without trusting or executing any hook. */
  async hookCoverage(): Promise<CodexHookCoverage | null> {
    if (!this.sessionId) return null;
    if (this.threadHookQuerySupported === undefined) {
      // Older servers silently ignore threadId; distinguish them through the newer mutual-exclusion validation.
      try { await this.rpc.call('hooks/list', { threadId: this.sessionId, cwds: [this.opts.cwd] }, 5000); this.threadHookQuerySupported = false; }
      catch (error) { this.threadHookQuerySupported = error instanceof RpcError && error.code === -32600 && /either threadId or cwds/i.test(error.message); }
    }
    if (!this.threadHookQuerySupported) return null;
    try { return summarizeCodexHooks(await this.rpc.call('hooks/list', { threadId: this.sessionId }, 5000)); }
    catch { return null; }
  }

  /** Initializes a freshly started app server and starts or resumes the thread. */
  async boot(): Promise<void> {
    const initialized = await this.rpc.call('initialize', {
      clientInfo: { name: 'web_agent', title: 'Web Agent', version: config.version },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.rpc.notify('initialized');
    // Skill folders from the capabilities (the app's skill library), for this process's threads.
    if (this.opts.add?.skillRoots?.length) await this.rpc.call('skills/extraRoots/set', { extraRoots: this.opts.add.skillRoots }).catch(() => {});
    const mode = codexMode(this.opts.mode);
    const common = {
      model: this.opts.model || null,
      config: {
        // Also the thread's default effort, so turns Codex starts by itself (a goal's) use it too.
        ...(this.opts.effort ? { model_reasoning_effort: this.opts.effort } : {}),
        // The app's own server (and the capabilities' servers), next to the user's own MCP servers.
        ...(this.opts.pageServer || Object.keys(this.opts.add?.mcpServers ?? {}).length ? { mcp_servers: codexServers(this.opts) } : {}),
        // What the capabilities add to its instructions (memory, the assistant…).
        ...(this.opts.add?.instructions.length ? { developer_instructions: this.opts.add.instructions.join('\n\n') } : {}),
        // And to its settings (an assistant without the web: web_search "disabled").
        ...this.opts.add?.codexConfig,
      },
      cwd: this.opts.cwd,
      approvalPolicy: mode.approval,
      sandbox: mode.sandbox,
      ...(mode.reviewer ? { approvalsReviewer: mode.reviewer } : {}),
    };
    // Do not overwrite a capability's hook configuration or enable hooks against an explicit user setting.
    if (this.opts.wikiHookCommand && !codexProjectHooksMayExist(this.opts.cwd) && !Object.keys(common.config).some((key) => key === 'hooks' || key.startsWith('hooks.'))) {
      try {
        const current = await this.rpc.call('config/read', { cwd: this.opts.cwd }, 5000);
        const existing = await this.rpc.call('hooks/list', { cwds: [this.opts.cwd] }, 5000);
        if (current?.config?.features?.hooks !== false && (common.config as Json)['features.hooks'] !== false && (common.config as Json).features?.hooks !== false && !codexWikiHooksMayOverlap(existing)) {
          const wikiHook = await cachedWikiHook(codexVersion(initialized), this.opts.wikiHookCommand);
          if (wikiHook) Object.assign(common.config, wikiHook);
        }
      } catch { /* Continue without automatic coverage if discovery is unavailable. */ }
    }
    const r = this.opts.forkFrom
      ? await this.rpc.call('thread/fork', { threadId: this.opts.forkFrom, ...(this.opts.forkLastTurn ? { lastTurnId: this.opts.forkLastTurn } : {}), ...common }, 120_000)
      : this.opts.threadId
        ? await this.rpc.call('thread/resume', { threadId: this.opts.threadId, excludeTurns: true, ...common }, 120_000)
        : await this.rpc.call('thread/start', common, 120_000);
    this.onThread(r);
    // A goal set before (in this app or the Codex CLI) shows from the start.
    this.rpc
      .call('thread/goal/get', { threadId: this.sessionId })
      .then((g) => (this.setGoal(g?.goal), this.changed()))
      .catch(() => {});
    if (this.opts.effort) this.next.effort = this.opts.effort;
    if (mode.collab) this.next.collaborationMode = this.collaboration(mode);
    this.state.status = 'idle';
    this.changed();
  }

  /** Collaboration mode for turn/start; it overrides model and effort, so both are carried along. */
  private collaboration(mode: ModeDef): Json {
    return {
      mode: mode.collab ?? 'default',
      settings: { model: this.next.model ?? this.state.model ?? '', reasoning_effort: this.next.effort ?? this.state.effort ?? null, developer_instructions: null },
    };
  }

  private onThread(r: Json) {
    const t = r.thread ?? {};
    if (t.id && t.id !== this.sessionId) this.sessionId = t.id;
    if (t.path) this.transcriptPath = t.path;
    if (r.model) this.state.model = r.model;
    if (r.reasoningEffort && !this.state.effort) this.state.effort = r.reasoningEffort;
    this.emit('identity');
  }

  private onLine(line: string, replay: boolean) {
    if (replay && /"method":"item\/(agentMessage\/delta|reasoning\/|commandExecution\/outputDelta)/.test(line.slice(0, 80))) return;
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    this.touch();
    this.replaying = replay;
    if (this.rpc.settle(m)) return;
    if (m.id != null && m.method) this.onServerRequest(m);
    else if (m.method) this.onNotification(m.method, m.params ?? {});
    else if (m.result?.thread?.id && !this.sessionId) this.onThread(m.result);
    this.emit('activity');
    this.changed();
  }

  /**
   * A model call's use: what the thread's totals grew by since the last report (its first report in this
   * process gives the last call's own, as the totals may hold the whole thread's history).
   */
  private callFrom(u: Json) {
    const tot = u.total;
    if (!tot) return;
    const was = this.usageTotal;
    this.usageTotal = tot;
    const n = (o: Json | null | undefined, k: string) => (typeof o?.[k] === 'number' ? o[k] : 0);
    let base: Json | null = was;
    let now: Json = tot;
    // Counters that went down were restarted: the last call's own use stands for it.
    if (!was || n(tot, 'inputTokens') < n(was, 'inputTokens') || n(tot, 'outputTokens') < n(was, 'outputTokens')) {
      if (!u.last) return;
      base = null;
      now = u.last;
    }
    const dIn = n(now, 'inputTokens') - n(base, 'inputTokens');
    const dCached = n(now, 'cachedInputTokens') - n(base, 'cachedInputTokens');
    const dOut = n(now, 'outputTokens') - n(base, 'outputTokens');
    if (dIn <= 0 && dOut <= 0) return;
    const call: ModelCall = { id: `codex-${this.runner.meta.runId}-${++this.calls}`, model: this.state.model, tokens: { in: Math.max(0, dIn - dCached), cached: Math.max(0, dCached), out: Math.max(0, dOut) } };
    this.emit('call', call);
  }

  /**
   * What a subagent's items say, as this thread's tasks (they list in the work tray and count as running work): a
   * subagent started (or a spawnAgent call's receivers) is a running task, one spoken to runs again, one that
   * completed, was interrupted or failed has ended. Records of both spellings (the rollouts' snake_case too).
   */
  private onAgentItem(it: Json, started: boolean) {
    const type = typeOf(it);
    if (type === 'subagentactivity') {
      const thread = String(field(it, 'agentThreadId') ?? '');
      const act = String(it.kind ?? '').toLowerCase();
      const status = act === 'started' || act === 'interacted' ? 'running' : act === 'completed' ? 'completed' : act === 'interrupted' ? 'stopped' : ['errored', 'failed', 'error'].includes(act) ? 'failed' : undefined;
      if (thread && status) this.agentTask(thread, { status, path: String(field(it, 'agentPath') ?? '') });
      return;
    }
    if (type !== 'collabagenttoolcall') return;
    const tool = String(it.tool ?? '');
    const receivers: unknown[] = field(it, 'receiverThreadIds') ?? [];
    const states: Json = field(it, 'agentsStates') ?? {};
    if (tool === 'spawnAgent') {
      // Its subagents exist from the call on; what is said of them later (their activity) names them and ends them.
      for (const r of receivers) if (typeof r === 'string' && !this.tasks.has(r)) this.agentTask(r, { status: 'running', callId: String(it.id ?? ''), description: firstLine(readablePrompt(it.prompt), 60) });
      return;
    }
    // A call's states of a subagent that is not a task here are not used: a list of agents may hold others, ended long ago.
    const resumes = ['sendInput', 'sendMessage', 'followupTask', 'resumeAgent'].includes(tool) && started;
    for (const [thread, st] of Object.entries(states)) {
      const t = this.tasks.get(thread);
      const state = String((st as Json)?.status ?? '');
      if (!t) continue;
      const status = state === 'completed' ? 'completed' : state === 'interrupted' ? 'stopped' : state === 'errored' ? 'failed' : state === 'shutdown' || state === 'notFound' ? (t.status === 'running' ? 'stopped' : undefined) : (state === 'running' || state === 'pendingInit') && resumes ? 'running' : undefined;
      if (status) this.agentTask(thread, { status });
    }
  }

  /** A subagent's task: made when first heard of, its name and call filled in as they are told. */
  private agentTask(id: string, o: { status?: string; path?: string; callId?: string; description?: string }) {
    const last = (o.path ?? '').split('/').filter(Boolean).pop();
    const name = last && last !== 'root' ? last.replace(/[_-]+/g, ' ').trim() : '';
    const readable = name ? name[0].toUpperCase() + name.slice(1) : '';
    let t = this.tasks.get(id);
    if (!t) {
      t = { id, kind: 'agent', description: readable || o.description || 'Subagent', status: 'running', startedAt: this.replaying ? undefined : Date.now(), toolUseId: o.callId || undefined };
      this.tasks.set(id, t);
    }
    if (readable) t.description = readable;
    if (o.callId && !t.toolUseId) t.toolUseId = o.callId;
    if (o.status) t.status = o.status;
  }

  private onNotification(method: string, p: Json) {
    const now = Date.now();
    // A subagent's thread runs on this connection too, and its notifications carry its own thread id: its turns, steps,
    // settings and usage are its own, never the lead's. Only what its items tell of subagents (a deeper one it starts) counts.
    if (typeof p.threadId === 'string' && this.sessionId && p.threadId !== this.sessionId) {
      if (method === 'item/started' || method === 'item/completed') this.onAgentItem(p.item ?? {}, method === 'item/started');
      return;
    }
    switch (method) {
      case 'thread/started':
        if (!this.sessionId && p.thread) this.onThread({ thread: p.thread });
        break;
      case 'thread/status/changed': {
        const s = p.status ?? {};
        if (s.type === 'idle') {
          if (!this.approvals.size) this.state.status = 'idle';
        } else if (s.type === 'active') {
          const flags: string[] = s.activeFlags ?? [];
          this.state.status = flags.length ? 'waiting' : 'working';
        } else if (s.type === 'systemError') {
          this.state.status = 'idle';
          this.state.error = 'The thread hit a system error';
        }
        break;
      }
      case 'thread/settings/updated': {
        const s = p.threadSettings ?? {};
        this.settings = s;
        if (s.model) this.state.model = s.model;
        if (s.effort) this.state.effort = s.effort;
        const mode = modeFromSettings(s);
        if (mode) this.state.mode = mode;
        break;
      }
      case 'turn/started':
        this.turnId = p.turn?.id;
        this.state.status = 'working';
        this.state.turnStartedAt = now;
        this.turnStartMs = now;
        this.lastTurnOut = 0;
        this.state.error = undefined;
        break;
      case 'turn/completed': {
        const t = p.turn ?? {};
        this.turnId = undefined;
        this.state.status = 'idle';
        this.state.turnStartedAt = undefined;
        // Output over the whole turn's wall time (Codex reports no per-reply timing).
        if (this.turnStartMs && this.lastTurnOut > 0) {
          const sec = (now - this.turnStartMs) / 1000;
          if (sec > 0.1) this.state.tokPerSec = Math.round(this.lastTurnOut / sec);
        }
        this.approvals.clear();
        this.limitStopped = t.status === 'failed' && usageLimitHit(t.error);
        if (this.limitStopped && !this.replaying) this.emit('limithit');
        this.signedOut = t.status === 'failed' && unauthorized(t.error);
        if (this.signedOut && !this.replaying) this.emit('signedout');
        if (t.status === 'failed' && t.error?.message) {
          let msg = String(t.error.message);
          try {
            msg = JSON.parse(msg)?.error?.message ?? msg;
          } catch {}
          this.overlayItems.set(`turnerr:${t.id}`, { kind: 'system', id: `turnerr:${t.id}`, seq: 0, ts: now, level: 'error', text: msg });
        }
        for (const it of this.overlayItems.values()) if (it.kind === 'assistant' || it.kind === 'thinking') it.streaming = false;
        const endedAt = now;
        setTimeout(() => {
          let swept = false;
          for (const [id, it] of this.overlayItems) {
            if ((it.ts ?? 0) <= endedAt && !id.startsWith('turnerr:')) {
              this.overlayItems.delete(id);
              swept = true;
            }
          }
          if (swept) this.changed();
        }, 20_000);
        this.emit('result', t, this.replaying);
        break;
      }
      case 'item/started':
      case 'item/completed': {
        this.onAgentItem(p.item ?? {}, method === 'item/started');
        const it = liveItem(p.item ?? {}, method === 'item/started' ? now : this.overlayItems.get(String(p.item?.id))?.ts ?? now);
        if (!it) break;
        const prev = this.overlayItems.get(it.id);
        if (method === 'item/started') {
          if (it.kind === 'assistant' || it.kind === 'thinking') it.streaming = true;
        } else if (prev?.kind === 'tool' && it.kind === 'tool' && prev.tool.liveOutput && !it.tool.output) {
          it.tool.output = prev.tool.liveOutput;
        }
        this.overlayItems.set(it.id, it);
        break;
      }
      case 'item/agentMessage/delta':
      case 'item/plan/delta': {
        const it = this.overlayItems.get(String(p.itemId));
        if (it?.kind === 'assistant') it.text += p.delta ?? '';
        break;
      }
      case 'item/reasoning/summaryTextDelta':
      case 'item/reasoning/textDelta': {
        const it = this.overlayItems.get(String(p.itemId));
        if (it?.kind === 'thinking') it.text += p.delta ?? '';
        break;
      }
      case 'item/reasoning/summaryPartAdded': {
        const it = this.overlayItems.get(String(p.itemId));
        if (it?.kind === 'thinking' && it.text) it.text += '\n\n';
        break;
      }
      case 'item/commandExecution/outputDelta': {
        const it = this.overlayItems.get(String(p.itemId));
        if (it?.kind === 'tool') {
          const out = (it.tool.liveOutput ?? '') + (p.delta ?? '');
          it.tool = { ...it.tool, liveOutput: out.length > 64_000 ? out.slice(-64_000) : out };
        } else {
          const prev = this.patches.get(String(p.itemId)) ?? {};
          const out = (prev.liveOutput ?? '') + (p.delta ?? '');
          this.patches.set(String(p.itemId), { ...prev, liveOutput: out.length > 64_000 ? out.slice(-64_000) : out });
        }
        break;
      }
      case 'item/fileChange/patchUpdated': {
        const it = this.overlayItems.get(String(p.itemId));
        if (it?.kind === 'tool' && p.changes) it.tool = { ...it.tool, files: fileChanges(p.changes) };
        break;
      }
      case 'turn/plan/updated': {
        const todos = (p.plan ?? []).map((s: Json) => ({ text: String(s.step ?? ''), status: String(s.status ?? 'pending').replace('inProgress', 'in_progress') }));
        const id = `plan:${p.turnId ?? this.turnId}`;
        const tool: ToolInfo = { name: 'update_plan', category: 'todo', title: 'Plan', subtitle: p.explanation ? firstLine(p.explanation, 140) : undefined, status: 'ok', todos };
        this.overlayItems.set(id, { kind: 'tool', id, seq: 0, ts: this.overlayItems.get(id)?.ts ?? now, tool });
        break;
      }
      case 'thread/tokenUsage/updated': {
        const u = p.tokenUsage ?? {};
        if (!this.replaying) this.callFrom(u);
        if (u.last) this.state.contextTokens = u.last.inputTokens ?? undefined;
        if (u.modelContextWindow) this.state.contextWindow = u.modelContextWindow;
        if (typeof u.last?.outputTokens === 'number') this.lastTurnOut = u.last.outputTokens;
        break;
      }
      case 'account/rateLimits/updated':
        this.emit('ratelimit', p.rateLimits);
        break;
      case 'thread/goal/updated':
        this.setGoal(p.goal);
        break;
      case 'thread/goal/cleared':
        this.state.goal = undefined;
        break;
      case 'thread/name/updated':
        if (p.threadName ?? p.name) this.emit('title', p.threadName ?? p.name);
        break;
      case 'serverRequest/resolved':
        this.approvals.delete(String(p.requestId));
        this.serverReqs.delete(String(p.requestId));
        if (this.state.status === 'waiting' && !this.approvals.size) this.state.status = 'working';
        break;
      case 'error': {
        if (!p.willRetry && usageLimitHit(p.error)) this.emit('limithit');
        if (!p.willRetry && unauthorized(p.error) && !this.replaying) this.emit('signedout');
        const msg = p.error?.message ?? 'Error';
        let text = String(msg);
        try {
          text = JSON.parse(text)?.error?.message ?? text;
        } catch {}
        const id = `err:${p.turnId ?? now}`;
        this.overlayItems.set(id, { kind: 'system', id, seq: 0, ts: now, level: p.willRetry ? 'warn' : 'error', text: p.willRetry ? `${text} (retrying)` : text });
        break;
      }
      case 'warning':
      case 'configWarning':
      case 'deprecationNotice':
        break;
      case 'model/rerouted':
        this.overlayItems.set(`reroute:${now}`, { kind: 'system', id: `reroute:${now}`, seq: 0, ts: now, level: 'info', text: `Model rerouted to ${p.toModel ?? p.model ?? 'another model'}` });
        break;
    }
  }

  private onServerRequest(m: Json) {
    const id = String(m.id);
    const p: Json = m.params ?? {};
    const now = Date.now();
    this.serverReqs.set(id, { id: m.id, method: m.method, params: p });
    switch (m.method) {
      case 'item/commandExecution/requestApproval': {
        const cmd = unwrapShellString(String(p.command ?? ''));
        const opts: ApprovalOption[] = [];
        for (const d of p.availableDecisions ?? ['accept', 'acceptForSession', 'decline', 'cancel']) {
          if (d === 'accept') opts.push({ id: 'accept', label: 'Allow', style: 'primary' });
          else if (d === 'acceptForSession') opts.push({ id: 'acceptForSession', label: 'Allow for this session' });
          else if (typeof d === 'object' && d.acceptWithExecpolicyAmendment) opts.push({ id: 'amend', label: 'Always allow this command' });
          else if (d === 'decline') opts.push({ id: 'decline', label: 'Deny', style: 'danger' });
          else if (d === 'cancel') opts.push({ id: 'cancel', label: 'Deny and stop' });
        }
        if (!opts.some((o) => o.id === 'decline')) opts.push({ id: 'decline', label: 'Deny', style: 'danger' });
        this.approvals.set(id, {
          id,
          itemId: p.itemId,
          kind: 'command',
          title: p.reason ? `Run a command — ${firstLine(String(p.reason), 90)}` : 'Run a command',
          detail: `${cmd}${p.cwd ? `\n\n# in ${p.cwd}` : ''}`,
          options: opts,
          createdAt: now,
        });
        break;
      }
      case 'item/fileChange/requestApproval': {
        const item = this.overlayItems.get(String(p.itemId));
        const files = item?.kind === 'tool' ? item.tool.files ?? [] : [];
        this.approvals.set(id, {
          id,
          itemId: p.itemId,
          kind: 'file',
          title: files.length === 1 ? `Edit ${files[0].path.split('/').pop()}` : `Apply changes to ${files.length || 'some'} files`,
          detail: [p.reason, ...files.map((f) => `${f.path}\n${f.diff ?? ''}`)].filter(Boolean).join('\n\n'),
          options: [
            { id: 'accept', label: 'Allow', style: 'primary' },
            { id: 'acceptForSession', label: 'Allow edits this session' },
            { id: 'decline', label: 'Deny', style: 'danger' },
          ],
          createdAt: now,
        });
        break;
      }
      case 'item/permissions/requestApproval':
        this.approvals.set(id, {
          id,
          itemId: p.itemId,
          kind: 'permissions',
          title: 'Grant extra permissions',
          detail: [p.reason, JSON.stringify(p.permissions, null, 2)].filter(Boolean).join('\n\n'),
          options: [
            { id: 'grant_turn', label: 'Allow for this turn', style: 'primary' },
            { id: 'grant_session', label: 'Allow for this session' },
            { id: 'decline', label: 'Deny', style: 'danger' },
          ],
          createdAt: now,
        });
        break;
      case 'item/tool/requestUserInput': {
        const questions: Question[] = (p.questions ?? []).map((q: Json) => ({
          id: String(q.id),
          header: q.header,
          question: String(q.question ?? ''),
          options: (q.options ?? []).map((o: Json) => ({ label: String(o.label ?? o), description: o.description })),
          allowOther: q.isOther !== false,
        }));
        this.approvals.set(id, {
          id,
          itemId: p.itemId,
          kind: 'question',
          title: 'Codex has a question',
          questions,
          options: [{ id: 'answer', label: 'Send answers', style: 'primary' }],
          createdAt: now,
        });
        break;
      }
      case 'mcpServer/elicitation/request':
        // The same form card as a connected app's; a form with nothing to fill in is a yes/no question
        // (Codex asks this way before an MCP tool runs).
        this.approvals.set(id, { ...elicitCard(id, String(p.serverName ?? 'An MCP server'), p), createdAt: now });
        break;
      default:
        this.serverReqs.delete(id);
        this.rpc.respondError(m.id, -32601, `${m.method} is not supported by this client`);
        return;
    }
    this.state.status = 'waiting';
  }

  /** Codex's thread goal, as the app shows it; a complete one goes (the timeline notes it). */
  private setGoal(g: Json | null | undefined) {
    this.state.goal = g?.objective && g.status !== 'complete' ? codexGoal(g) : undefined;
  }

  /** Sets, pauses, resumes or clears the thread's goal (Codex keeps working while one is active). */
  async goal(action: 'set' | 'pause' | 'resume' | 'clear', objective?: string): Promise<void> {
    if (!this.sessionId) throw new Error('The thread is still starting');
    const threadId = this.sessionId;
    if (action === 'clear') await this.rpc.call('thread/goal/clear', { threadId, origin: 'user' });
    else {
      const r = await this.rpc.call('thread/goal/set', { threadId, origin: 'user', status: action === 'pause' ? 'paused' : 'active', ...(action === 'set' ? { objective } : {}) });
      this.setGoal(r?.goal);
    }
    if (action === 'clear') this.state.goal = undefined;
    this.changed();
  }

  // ---- actions -------------------------------------------------------------

  async sendMessage(text: string, images: ImageInput[]): Promise<void> {
    if (!this.sessionId) throw new Error('The thread is still starting');
    // "/goal …" as Claude Code takes it: set one, or clear, pause or resume it.
    const g = /^\/goal(?:\s+([\s\S]*))?$/.exec(text.trim());
    if (g && !images.length) {
      const arg = (g[1] ?? '').trim();
      const action = arg === 'clear' || arg === 'pause' || arg === 'resume' ? arg : arg ? 'set' : null;
      if (action) return this.goal(action, action === 'set' ? arg : undefined);
    }
    const input: Json[] = [];
    if (text) input.push({ type: 'text', text, text_elements: [] });
    for (const img of images) if (img.path) input.push({ type: 'localImage', path: img.path });
    const clientId = crypto.randomUUID();
    // What the app added for the agent alone (<system-reminder>) is not shown, as in the transcript.
    const shown = stripWrappers(text).text;
    const ho = splitHandoff(shown);
    this.overlayItems.set(`local:${clientId}`, { kind: 'user', id: `local:${clientId}`, seq: 0, ts: Date.now(), text: ho?.request ?? shown, images: images.length || undefined, handoff: ho?.handoff });
    this.touch();
    if (this.turnId) {
      try {
        await this.rpc.call('turn/steer', { threadId: this.sessionId, input, expectedTurnId: this.turnId, clientUserMessageId: clientId });
        this.changed();
        return;
      } catch {
        // The turn ended between our check and the call; start a new one.
      }
    }
    this.state.status = 'working';
    this.state.turnStartedAt = Date.now();
    this.changed();
    const r = await this.rpc.call('turn/start', { threadId: this.sessionId, input, clientUserMessageId: clientId, ...this.next });
    this.next = {};
    if (r?.turn?.id) this.turnId = r.turn.id;
  }

  /** Summarizes the thread so far to free up context. */
  async compact(): Promise<void> {
    if (!this.sessionId) throw new Error('The thread is still starting');
    await this.rpc.call('thread/compact/start', { threadId: this.sessionId }, 30_000);
  }

  async interrupt(): Promise<void> {
    if (!this.sessionId || !this.turnId) return;
    await this.rpc.call('turn/interrupt', { threadId: this.sessionId, turnId: this.turnId }, 15_000).catch(() => {});
  }

  async answer(id: string, a: ApprovalAnswer): Promise<void> {
    const req = this.serverReqs.get(id);
    if (!req) throw new Error('This request was already answered');
    let result: Json;
    switch (req.method) {
      case 'item/commandExecution/requestApproval': {
        let decision: unknown = a.decision;
        if (a.decision === 'amend') {
          const amend = (req.params.availableDecisions ?? []).find((d: unknown) => typeof d === 'object' && d && 'acceptWithExecpolicyAmendment' in d);
          decision = amend ?? 'accept';
        }
        result = { decision };
        break;
      }
      case 'item/fileChange/requestApproval':
        result = { decision: a.decision };
        break;
      case 'item/permissions/requestApproval':
        result =
          a.decision === 'decline'
            ? { permissions: {}, scope: 'turn' }
            : { permissions: req.params.permissions ?? {}, scope: a.decision === 'grant_session' ? 'session' : 'turn' };
        break;
      case 'item/tool/requestUserInput': {
        const answers: Json = {};
        for (const [qid, value] of Object.entries(a.answers ?? {})) answers[qid] = { answers: String(value).split('\n').filter(Boolean) };
        result = { answers };
        break;
      }
      case 'mcpServer/elicitation/request': {
        const wrong = elicitCheck(req.params, a);
        if (wrong) throw new HttpError(400, wrong);
        const r = elicitResult(req.params, a);
        result = { action: r.action, content: r.action === 'accept' ? (r.content ?? {}) : null, _meta: null };
        break;
      }
      default:
        throw new Error('Unsupported request');
    }
    this.rpc.respond(req.id, result);
    this.serverReqs.delete(id);
    this.approvals.delete(id);
    if (!this.approvals.size && this.state.status === 'waiting') this.state.status = 'working';
    this.changed();
  }

  async configure(cfg: LiveConfig): Promise<void> {
    // Codex takes overrides with the next turn; they stick for later turns.
    if (cfg.model !== undefined) {
      this.next.model = cfg.model || null;
      if (cfg.model) this.state.model = cfg.model;
    }
    if (cfg.effort !== undefined && cfg.effort) {
      this.next.effort = cfg.effort;
      this.state.effort = cfg.effort;
    }
    if (cfg.mode !== undefined && cfg.mode) {
      const mode = codexMode(cfg.mode);
      this.next.approvalPolicy = mode.approval;
      this.next.sandboxPolicy = sandboxPolicy(mode, this.settings.sandboxPolicy);
      this.next.approvalsReviewer = mode.reviewer ?? 'user';
      this.state.mode = mode.value;
    }
    // Keep the collaboration mode in step: plan mode carries its own model/effort settings.
    const mode = codexMode(this.state.mode);
    if (mode.collab || this.settings.collaborationMode?.mode === 'plan' || this.next.collaborationMode) {
      this.next.collaborationMode = this.collaboration(mode);
    }
    this.changed();
  }

  async stopTask(): Promise<void> {
    throw new Error('Codex does not expose its background processes to clients');
  }

  async rename(title: string): Promise<void> {
    if (this.sessionId) await this.rpc.call('thread/name/set', { threadId: this.sessionId, name: title }).catch(() => {});
  }

  stop() {
    if (this.turnId) this.interrupt().catch(() => {});
    setTimeout(() => this.runner.stop(), 600);
  }

  protected onExited() {
    this.rpc.failAll('session ended');
  }
}
