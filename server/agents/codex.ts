// Live Codex session through `codex app-server` (JSON-RPC over stdio), one process per thread.
import crypto from 'node:crypto';
import type { ApprovalOption, ApprovalRequest, ModelOption, Question, TimelineItem, ToolInfo } from '../../shared/types.ts';
import { config } from '../config.ts';
import { clip, firstLine } from '../history/common.ts';
import { codexGoal, commandInfo, fileChanges, unwrapShellString } from '../history/codex.ts';
import type { Runner, RunSpec } from '../runner/client.ts';
import { LiveAdapter, type ApprovalAnswer, type ImageInput, type LiveConfig } from './live.ts';
import { RpcPeer } from './rpc.ts';
import { splitHandoff } from '../handoff.ts';
import { PAGE_SERVER } from '../mcp.ts';

type Json = Record<string, any>;

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

/** A live ThreadItem (camelCase, app-server shape) as a timeline item. */
export function liveItem(it: Json, ts: number): TimelineItem | null {
  const id = String(it.id);
  const base = { id, seq: 0, ts };
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

export class CodexLive extends LiveAdapter {
  readonly agent = 'codex' as const;
  rpc: RpcPeer;
  turnId?: string;
  settings: Json = {};
  private turnStartMs = 0;
  private lastTurnOut = 0;
  private serverReqs = new Map<string, { id: string | number; method: string; params: Json }>();
  private next: Json = {};

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

  /** Initializes a freshly started app server and starts or resumes the thread. */
  async boot(): Promise<void> {
    await this.rpc.call('initialize', {
      clientInfo: { name: 'web_agent', title: 'Web Agent', version: config.version },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.rpc.notify('initialized');
    const mode = codexMode(this.opts.mode);
    const common = {
      model: this.opts.model || null,
      config: {
        // Also the thread's default effort, so turns Codex starts by itself (a goal's) use it too.
        ...(this.opts.effort ? { model_reasoning_effort: this.opts.effort } : {}),
        // The app's page server, next to the user's own MCP servers.
        ...(this.opts.pageServer ? { mcp_servers: { [PAGE_SERVER]: { url: this.opts.pageServer, default_tools_approval_mode: 'approve' } } } : {}),
      },
      cwd: this.opts.cwd,
      approvalPolicy: mode.approval,
      sandbox: mode.sandbox,
      ...(mode.reviewer ? { approvalsReviewer: mode.reviewer } : {}),
    };
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
    if (this.rpc.settle(m)) return;
    if (m.id != null && m.method) this.onServerRequest(m);
    else if (m.method) this.onNotification(m.method, m.params ?? {});
    else if (m.result?.thread?.id && !this.sessionId) this.onThread(m.result);
    this.emit('activity');
    this.changed();
  }

  private onNotification(method: string, p: Json) {
    const now = Date.now();
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
        this.emit('result', t);
        break;
      }
      case 'item/started':
      case 'item/completed': {
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
      case 'mcpServer/elicitation/request': {
        // A form with nothing to fill in is a yes/no question (Codex asks this way before an MCP tool runs).
        const fields = p.mode === 'url' ? ['url'] : Object.keys(p.requestedSchema?.properties ?? {});
        this.approvals.set(id, {
          id,
          kind: 'other',
          title: fields.length ? `${p.serverName ?? 'An MCP server'} asks for input` : `${p.serverName ?? 'An MCP server'} asks to go ahead`,
          detail: String(p.message ?? JSON.stringify(p, null, 2)),
          options: [
            ...(fields.length ? [] : [{ id: 'accept', label: 'Allow', style: 'primary' as const }]),
            { id: 'decline', label: 'Decline', style: 'danger' },
            { id: 'cancel', label: 'Cancel' },
          ],
          createdAt: now,
        });
        break;
      }
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
    const ho = splitHandoff(text);
    this.overlayItems.set(`local:${clientId}`, { kind: 'user', id: `local:${clientId}`, seq: 0, ts: Date.now(), text: ho?.request ?? text, images: images.length || undefined, handoff: ho?.handoff });
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
      case 'mcpServer/elicitation/request':
        result = a.decision === 'accept' ? { action: 'accept', content: {}, _meta: null } : { action: a.decision === 'cancel' ? 'cancel' : 'decline', content: null, _meta: null };
        break;
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
