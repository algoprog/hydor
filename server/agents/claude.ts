// Live Claude Code session over the stream-json protocol:
//   claude --input-format stream-json --output-format stream-json --permission-prompt-tool stdio ...
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ApprovalRequest, ModelOption, TimelineItem, ToolItem } from '../../shared/types.ts';
import { config } from '../config.ts';
import { describeClaudeTool, questionsFrom } from '../history/claude.ts';
import { firstLine, snippetDiff, stripWrappers, wholeFileDiff } from '../history/common.ts';
import type { Runner, RunSpec } from '../runner/client.ts';
import { approvalTitleFor, LiveAdapter, type ApprovalAnswer, type ImageInput, type LiveConfig, type ModelCall } from './live.ts';
import { splitHandoff } from '../handoff.ts';
import type { SpawnAdditions } from '../features/types.ts';
import { PAGE_SERVER } from '../mcp.ts';
import { JsonFields } from '../pages/drafts.ts';

type Json = Record<string, any>;

/** The app's tools that save a page, a deck, a document, a spreadsheet or a LaTeX document, given its id to save it again
 * (named naget-agent or agent-console in sessions started before the renames). */
const SAVES_PAGE = new RegExp(`^mcp__(?:${PAGE_SERVER}|naget-agent|agent-console)__save_(?:page|slides|doc|sheet|latex)$`);

export interface ClaudeOpts {
  cwd: string;
  /** Resume this session; otherwise a new one is created with `sessionId`. */
  resume?: boolean;
  sessionId: string;
  /** Start `sessionId` as a copy of that session (up to the entry `forkAt`, when given). */
  forkFrom?: string;
  forkAt?: string;
  model?: string;
  effort?: string;
  mode?: string;
  /** This app's MCP address for the session (show_html, web_search…). */
  pageServer?: string;
  /** What the app's capabilities add: instructions, MCP servers (server/features). */
  add?: Required<SpawnAdditions>;
}

export const CLAUDE_MODES = [
  { value: 'default', label: 'Ask', description: 'Ask before edits and commands that are not allowed in settings' },
  { value: 'acceptEdits', label: 'Accept edits', description: 'Edit files freely, ask before other commands' },
  { value: 'auto', label: 'Auto', description: 'A safety classifier approves routine actions and asks about risky ones' },
  { value: 'plan', label: 'Plan', description: 'Read and plan only; propose a plan for approval' },
  { value: 'bypassPermissions', label: 'Bypass', description: 'Never ask (full access)' },
];

/** The MCP servers for a session's run, written where only this user can read them; returns the path. */
function mcpConfigFile(sessionId: string, cfg: object): string {
  const dir = path.join(config.dataDir, 'mcp');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${sessionId.replace(/[^\w-]/g, '')}.json`);
  fs.writeFileSync(file, JSON.stringify(cfg), { mode: 0o600 });
  return file;
}

/** How long a call to the app's own tools (and the capabilities' servers) may take: ten minutes, as for Codex. */
const TOOL_TIMEOUT_MS = 600_000;

export function claudeSpec(o: ClaudeOpts, env: Record<string, string>): RunSpec {
  const args = [
    '--output-format',
    'stream-json',
    '--verbose',
    '--input-format',
    'stream-json',
    '--include-partial-messages',
    '--permission-prompt-tool',
    'stdio',
    '--replay-user-messages',
    '--allow-dangerously-skip-permissions',
  ];
  if (o.forkFrom) args.push('--resume', o.forkFrom, '--fork-session', '--session-id', o.sessionId, ...(o.forkAt ? ['--resume-session-at', o.forkAt] : []));
  else if (o.resume) args.push('--resume', o.sessionId);
  else args.push('--session-id', o.sessionId);
  if (o.model) args.push('--model', o.model);
  if (o.effort) args.push('--effort', o.effort);
  if (o.mode) args.push('--permission-mode', o.mode);
  // The app's own server (and the capabilities' servers) join the user's MCP servers. The app's tools
  // need no approval here: those that need the user's say ask in the conversation themselves.
  // Their tools may take minutes (a video model at work, a form waiting for the user): over HTTP, Claude Code
  // gives up on a call after 60 seconds unless the server's entry says how long to wait, as Codex's does.
  const servers: Record<string, unknown> = {};
  for (const [name, d] of Object.entries(o.add?.mcpServers ?? {})) servers[name] = { ...(d.type === 'http' ? { type: 'http', url: d.url, ...(d.headers ? { headers: d.headers } : {}) } : { type: 'stdio', command: d.command, args: d.args ?? [], env: d.env ?? {} }), timeout: TOOL_TIMEOUT_MS };
  if (o.pageServer) servers[PAGE_SERVER] = { type: 'http', url: o.pageServer, timeout: TOOL_TIMEOUT_MS };
  // In a file only this user can read, not on the command line: its addresses carry the run's token.
  if (Object.keys(servers).length) args.push('--mcp-config', mcpConfigFile(o.sessionId, { mcpServers: servers }));
  if (o.pageServer) args.push('--allowedTools', `mcp__${PAGE_SERVER}`);
  if (o.add?.instructions.length) {
    const text = o.add.instructions.join('\n\n');
    // Windows takes command lines of 32,767 characters at most: there the instructions go in a file of their own.
    if (process.platform === 'win32') {
      const dir = path.join(config.dataDir, 'mcp');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, `${o.sessionId.replace(/[^\w-]/g, '')}-instructions.md`);
      fs.writeFileSync(file, text, { mode: 0o600 });
      args.push('--append-system-prompt-file', file);
    } else args.push('--append-system-prompt', text);
  }
  if (o.add?.args?.length) args.push(...o.add.args);
  // An assistant's limits: tools switched off, and none of the user's own MCP servers.
  if (o.add?.disallowedTools?.length) args.push('--disallowedTools', o.add.disallowedTools.join(','));
  if (o.add?.strictMcp) args.push('--strict-mcp-config');
  return { cmd: config.claudeBin, args, cwd: o.cwd, env };
}

export function claudeModels(init: Json | undefined): ModelOption[] {
  const list: Json[] = Array.isArray(init?.models) ? init.models : [];
  return list.map((m) => ({
    value: String(m.value),
    label: String(m.displayName ?? m.value),
    resolved: m.resolvedModel ? String(m.resolvedModel) : undefined,
    description: m.description,
    efforts: Array.isArray(m.supportedEffortLevels) ? m.supportedEffortLevels : [],
    isDefault: m.value === 'default',
  }));
}

/** Readable reasons for a turn that stopped early. */
const RESULT_ERRORS: Record<string, string> = {
  error_max_turns: 'Stopped: the turn limit was reached',
  error_max_budget_usd: 'Stopped: the budget limit was reached',
};

export class ClaudeLive extends LiveAdapter {
  readonly agent = 'claude' as const;
  init?: Json;
  private nonce = crypto.randomBytes(3).toString('hex');
  private seq = 0;
  private pending = new Map<string, { resolve: (v: Json) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private raw = new Map<string, Json>();
  private msgId: string | null = null;
  private genStart = 0;
  private genOut = 0;
  private blocks = new Map<number, string>();
  private toolJson = new Map<string, string>();
  private toolNames = new Map<string, string>();
  /** A call saving a page again, while the model writes it: the page's id, read as soon as it comes (SAVES_PAGE). */
  private savedIds = new Map<string, JsonFields>();

  constructor(runner: Runner, opts: ClaudeOpts) {
    super(runner);
    this.sessionId = opts.sessionId;
    this.state.model = opts.model;
    this.state.effort = opts.effort;
    this.state.mode = opts.mode;
    runner.on('line', (line: string, replay: boolean) => this.onLine(line, replay));
  }

  /** First contact with a freshly started CLI. */
  async initialize(): Promise<void> {
    const res = await this.control({ subtype: 'initialize', perTaskStopAffordance: true }, 60_000);
    this.onInit(res);
  }

  private onInit(res: Json) {
    this.init = res;
    if (res.current_permission_mode && !this.state.mode) this.state.mode = res.current_permission_mode;
    if (this.state.status === 'starting') this.state.status = 'idle';
    this.changed();
  }

  /** Puts files back as they were before a message (Claude Code's own file checkpoints). */
  async rewindFiles(userMessageId: string, dryRun = false): Promise<Json> {
    return this.control({ subtype: 'rewind_files', user_message_id: userMessageId, dry_run: dryRun }, 120_000);
  }

  private control(request: Json, timeoutMs = 30_000): Promise<Json> {
    const id = `wa-${this.nonce}-${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${request.subtype} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.runner.writeLine({ type: 'control_request', request_id: id, request });
    });
  }

  private onLine(line: string, replay: boolean) {
    // Partial-message deltas only matter live.
    if (replay && line.startsWith('{"type":"stream_event"')) return;
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    this.touch();
    switch (m.type) {
      case 'control_response':
        this.onControlResponse(m.response ?? {});
        break;
      case 'control_request':
        this.onControlRequest(m);
        break;
      case 'control_cancel_request':
        if (this.approvals.delete(m.request_id)) this.setWorking();
        break;
      case 'system':
        this.onSystem(m, replay);
        break;
      case 'stream_event':
        if (!m.parent_tool_use_id) this.onStream(m.event ?? {});
        break;
      case 'assistant':
        // "You've hit your session limit": the plan's usage ran out mid-turn.
        if (!m.parent_tool_use_id && m.error === 'rate_limit') {
          this.limitStopped = true;
          if (!replay) this.emit('limithit');
        }
        if (!replay) this.callFrom(m);
        if (!m.parent_tool_use_id) this.onAssistant(m);
        break;
      case 'user':
        if (!m.parent_tool_use_id) this.onUser(m);
        break;
      case 'result':
        this.onResult(m, replay);
        break;
      case 'rate_limit_event':
        this.emit('ratelimit', m.rate_limit_info);
        break;
      case 'tool_progress':
        if (m.tool_use_id && !m.parent_tool_use_id) {
          this.patches.set(m.tool_use_id, { ...(this.patches.get(m.tool_use_id) ?? {}), durationMs: Math.round((m.elapsed_time_seconds ?? 0) * 1000) });
        }
        break;
    }
    this.emit('activity');
    this.changed();
  }

  private onControlResponse(r: Json) {
    const id = r.request_id;
    const p = this.pending.get(id);
    const payload = r.response ?? {};
    // The init reply (ours or one replayed from before a restart) lists models and the account.
    if (r.subtype === 'success' && Array.isArray(payload.models) && Array.isArray(payload.commands)) {
      if (!p) this.onInit(payload);
    }
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    if (r.subtype === 'error') p.reject(new Error(String(r.error ?? 'request failed')));
    else p.resolve(payload);
  }

  private onControlRequest(m: Json) {
    const r = m.request ?? {};
    const id = String(m.request_id);
    if (r.subtype === 'can_use_tool') {
      this.raw.set(id, r);
      this.approvals.set(id, buildApproval(id, r));
      this.state.status = 'waiting';
      return;
    }
    if (r.subtype === 'request_user_dialog') return; // never declared, never answered
    this.runner.writeLine({
      type: 'control_response',
      response: { subtype: 'error', request_id: id, error: `${r.subtype} is not supported by this client` },
    });
  }

  /** `replay`: re-read after a restart, so when a task started is unknown (not now). */
  private onSystem(m: Json, replay: boolean) {
    switch (m.subtype) {
      case 'init':
        if (m.session_id && m.session_id !== this.sessionId) {
          this.sessionId = m.session_id;
          this.emit('identity');
        }
        if (m.model) this.state.model = m.model;
        if (m.permissionMode) this.state.mode = m.permissionMode;
        if (this.state.status === 'starting') this.state.status = 'idle';
        break;
      case 'status':
        if (m.permissionMode) this.state.mode = m.permissionMode;
        break;
      case 'session_state_changed':
        if (m.state === 'idle' && !this.approvals.size) this.state.status = 'idle';
        else if (m.state === 'running') this.setWorking();
        else if (m.state === 'requires_action') this.state.status = 'waiting';
        break;
      case 'task_started':
        this.tasks.set(m.task_id, {
          id: m.task_id,
          description: m.description ?? m.task_id,
          kind: m.task_type ?? m.subagent_type,
          status: 'running',
          startedAt: replay ? undefined : Date.now(),
          toolUseId: m.tool_use_id,
        });
        break;
      case 'task_updated': {
        const t = this.tasks.get(m.task_id);
        if (t && m.patch?.status) t.status = m.patch.status === 'killed' ? 'stopped' : m.patch.status;
        if (t && m.patch?.description) t.description = m.patch.description;
        break;
      }
      case 'task_notification': {
        const t = this.tasks.get(m.task_id);
        if (t) t.status = m.status;
        break;
      }
      case 'background_tasks_changed': {
        const running = new Set<string>((m.tasks ?? []).map((t: Json) => t.task_id));
        for (const t of m.tasks ?? []) {
          if (!this.tasks.has(t.task_id)) {
            this.tasks.set(t.task_id, { id: t.task_id, description: t.description, kind: t.task_type, status: 'running', startedAt: replay ? undefined : Date.now() });
          }
        }
        for (const t of this.tasks.values()) if (t.status === 'running' && !running.has(t.id)) t.status = 'completed';
        break;
      }
      case 'api_retry':
        this.overlayItems.set('retry', {
          kind: 'system',
          id: 'retry',
          seq: 0,
          ts: Date.now(),
          level: 'warn',
          text: `API error${m.error_status ? ` ${m.error_status}` : ''}, retrying (${m.attempt}/${m.max_retries})`,
        });
        break;
      case 'compact_boundary':
        this.overlayItems.delete('retry');
        break;
    }
  }

  /** Output decode speed for the reply that just finished streaming (tokens over its generation wall time). */
  private finishReply() {
    if (this.genStart && this.genOut > 0) {
      const sec = (Date.now() - this.genStart) / 1000;
      if (sec > 0.05) this.state.tokPerSec = Math.round(this.genOut / sec);
    }
    this.genStart = 0;
    this.genOut = 0;
  }

  private setWorking() {
    if (this.approvals.size) this.state.status = 'waiting';
    else {
      if (this.state.status !== 'working') this.state.turnStartedAt = this.state.turnStartedAt ?? Date.now();
      this.state.status = 'working';
    }
  }

  // ---- streaming overlay -------------------------------------------------

  private onStream(ev: Json) {
    switch (ev.type) {
      case 'message_start':
        this.msgId = ev.message?.id ?? null;
        this.blocks.clear();
        this.overlayItems.delete('retry');
        this.genStart = Date.now();
        this.genOut = 0;
        this.state.cacheAt = this.genStart; // this request refreshes the prompt cache
        this.setWorking();
        break;
      case 'message_delta': {
        const out = ev.usage?.output_tokens;
        if (typeof out === 'number') this.genOut = out;
        if (ev.delta?.stop_reason) this.finishReply();
        break;
      }
      case 'message_stop':
        this.finishReply();
        break;
      case 'content_block_start': {
        const b = ev.content_block ?? {};
        const idx = Number(ev.index);
        const ts = Date.now();
        if (b.type === 'text' || b.type === 'thinking') {
          const id = `${this.msgId}:${idx}`;
          this.blocks.set(idx, id);
          const item: TimelineItem =
            b.type === 'text'
              ? { kind: 'assistant', id, seq: 0, ts, text: b.text ?? '', streaming: true }
              : { kind: 'thinking', id, seq: 0, ts, text: b.thinking ?? '', streaming: true };
          this.overlayItems.set(id, item);
        } else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
          const id = String(b.id);
          this.blocks.set(idx, id);
          this.toolJson.set(id, '');
          this.toolNames.set(id, b.name);
          if (SAVES_PAGE.test(String(b.name))) this.savedIds.set(id, new JsonFields(new Set(['id'])));
          const tool = describeClaudeTool(String(b.name), {});
          this.overlayItems.set(id, { kind: 'tool', id, seq: 0, ts, tool: { ...tool, title: tool.title || b.name, status: 'pending' } });
          this.emit('toolstream', { id, name: String(b.name), at: 'start' });
        }
        break;
      }
      case 'content_block_delta': {
        const id = this.blocks.get(Number(ev.index));
        if (!id) break;
        const item = this.overlayItems.get(id);
        const d = ev.delta ?? {};
        if (d.type === 'text_delta' && item?.kind === 'assistant') item.text += d.text ?? '';
        else if (d.type === 'thinking_delta' && item?.kind === 'thinking') item.text += d.thinking ?? '';
        else if (d.type === 'input_json_delta') {
          const acc = (this.toolJson.get(id) ?? '') + (d.partial_json ?? '');
          this.toolJson.set(id, acc);
          if (d.partial_json) this.emit('toolstream', { id, name: this.toolNames.get(id) ?? '', at: 'delta', delta: d.partial_json });
          // The page a save changes, before its long input is written whole: its card in the reply knows it at once.
          const ids = this.savedIds.get(id);
          if (ids && d.partial_json && ids.feed(d.partial_json).has('id')) {
            const page = ids.fields.get('id') ?? '';
            if (/^[a-f0-9]{10}$/.test(page) && item?.kind === 'tool') {
              item.tool = { ...item.tool, input: { id: page } };
              this.savedIds.delete(id);
            }
          }
          if (item?.kind === 'tool') {
            const peek = acc.match(/"(?:command|file_path|pattern|query|url|description)"\s*:\s*"((?:[^"\\]|\\.)*)/);
            if (peek) {
              try {
                item.tool = { ...item.tool, title: JSON.parse(`"${peek[1]}"`) };
              } catch {}
            }
          }
        }
        break;
      }
      case 'content_block_stop': {
        const id = this.blocks.get(Number(ev.index));
        if (!id) break;
        const item = this.overlayItems.get(id);
        if (item?.kind === 'assistant' || item?.kind === 'thinking') item.streaming = false;
        if (item?.kind === 'tool') {
          let input: Json = {};
          try {
            input = JSON.parse(this.toolJson.get(id) || '{}');
          } catch {}
          (item as ToolItem).tool = { ...describeClaudeTool(this.toolNames.get(id) ?? item.tool.name, input), status: 'running' };
          this.toolJson.delete(id);
          this.savedIds.delete(id);
          this.emit('toolstream', { id, name: this.toolNames.get(id) ?? item.tool.name, at: 'end', input });
        }
        break;
      }
    }
  }

  /** What a model call used (a subagent's too): each block of its message repeats it, under the message's id. */
  private callFrom(m: Json) {
    const msg = m.message ?? {};
    const u = msg.usage;
    if (!u || !msg.id || msg.model === '<synthetic>') return;
    const call: ModelCall = { id: String(msg.id), model: msg.model, tokens: { in: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), cached: u.cache_read_input_tokens ?? 0, out: u.output_tokens ?? 0 } };
    this.emit('call', call);
  }

  private onAssistant(m: Json) {
    const u = m.message?.usage;
    if (u) {
      this.state.contextTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      // Prompt-cache TTL: the creation bucket tells whether this prefix was written for 5 min or 1 hour.
      const cc = u.cache_creation ?? {};
      if ((cc.ephemeral_1h_input_tokens ?? 0) > 0) this.state.cacheTtlMs = 3_600_000;
      else if ((cc.ephemeral_5m_input_tokens ?? 0) > 0) this.state.cacheTtlMs = 300_000;
      else if (!this.state.cacheTtlMs && ((u.cache_read_input_tokens ?? 0) > 0 || (u.cache_creation_input_tokens ?? 0) > 0)) this.state.cacheTtlMs = 300_000;
      if ((u.cache_read_input_tokens ?? 0) > 0 || (u.cache_creation_input_tokens ?? 0) > 0) this.state.cacheAt = Date.now();
    }
    if (m.message?.model && m.message.model !== '<synthetic>') this.state.model = m.message.model;
    this.setWorking();
  }

  private onUser(m: Json) {
    const content = m.message?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type !== 'tool_result') continue;
        // The tool ran (or was refused): any approval for it is settled.
        for (const [id, a] of this.approvals) if (a.itemId === b.tool_use_id) this.approvals.delete(id);
      }
    }
    const isPrompt = !(Array.isArray(content) && content.some((b: Json) => b?.type === 'tool_result'));
    if (isPrompt && !m.isSynthetic && !m.isMeta) {
      this.setWorking();
      this.state.turnStartedAt = this.state.turnStartedAt ?? Date.now();
    }
  }

  /** `replay`: re-read after a restart; an old turn's error is already in the transcript, so it is not re-added. */
  private onResult(m: Json, replay = false) {
    // A turn the CLI starts by itself (a background task's notice) while the plan is still used up can end
    // without asking the model anything: that does not show the limit lifted, so the session stays stopped on it.
    const kept = this.limitStopped === true && !m.is_error && !((m.usage?.output_tokens ?? 0) > 0);
    this.limitStopped = kept || (!!m.is_error && (this.limitStopped === true || /hit your .*limit/i.test(String(m.result ?? ''))));
    if (!replay && this.limitStopped && !kept) this.emit('limithit');
    this.approvals.clear();
    this.state.status = 'idle';
    this.state.turnStartedAt = undefined;
    this.overlayItems.delete('retry');
    for (const it of this.overlayItems.values()) if (it.kind === 'assistant' || it.kind === 'thinking') it.streaming = false;
    // Overlay items normally leave as the transcript catches up (prune); sweep any that never match.
    const endedAt = Date.now();
    setTimeout(() => {
      let swept = false;
      for (const [id, it] of this.overlayItems) {
        if ((it.ts ?? 0) <= endedAt && !id.startsWith('result:')) {
          this.overlayItems.delete(id);
          swept = true;
        }
      }
      if (swept) this.changed();
    }, 15_000);
    const mu = m.modelUsage && Object.values(m.modelUsage as Json)[0];
    if (mu?.contextWindow) this.state.contextWindow = mu.contextWindow;
    // An interrupt ends the turn as error_during_execution/aborted_streaming; the transcript already
    // says "Interrupted by user", so that is not an error to show.
    if (m.is_error && m.subtype !== 'success' && m.terminal_reason !== 'aborted_streaming' && !replay) {
      const raw = Array.isArray(m.errors) && m.errors.length ? String(m.errors[0]) : '';
      // "[ede_diagnostic] …" is the CLI's internal trace, not a message for people: keep it as the detail.
      const internal = raw.startsWith('[ede_diagnostic]');
      const text = RESULT_ERRORS[m.subtype] ?? (raw && !internal ? raw : 'The turn ended unexpectedly');
      const id = `result:${m.uuid ?? Date.now()}`;
      this.overlayItems.set(id, { kind: 'system', id, seq: 0, ts: Date.now(), level: internal ? 'warn' : 'error', text, detail: internal ? raw : undefined });
    }
    this.emit('result', m, replay);
  }

  // ---- actions -------------------------------------------------------------

  async sendMessage(text: string, images: ImageInput[]): Promise<void> {
    const uuid = crypto.randomUUID();
    const content: Json[] = images.map((img) => ({ type: 'image', source: { type: 'base64', media_type: img.mediaType, data: img.data } }));
    if (text) content.push({ type: 'text', text });
    this.runner.writeLine({
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      session_id: this.sessionId ?? '',
      uuid,
      origin: { kind: 'human' },
    });
    // What the app added for the agent alone (<system-reminder>) is not shown, as in the transcript.
    const shown = stripWrappers(text).text;
    const ho = splitHandoff(shown);
    this.overlayItems.set(uuid, { kind: 'user', id: uuid, seq: 0, ts: Date.now(), text: ho?.request ?? shown, images: images.length || undefined, handoff: ho?.handoff });
    this.setWorking();
    this.state.turnStartedAt = this.state.turnStartedAt ?? Date.now();
    this.touch();
    this.changed();
  }

  async interrupt(): Promise<void> {
    await this.control({ subtype: 'interrupt' }, 15_000).catch(() => {});
  }

  async answer(id: string, a: ApprovalAnswer): Promise<void> {
    const r = this.raw.get(id);
    const appr = this.approvals.get(id);
    if (!r || !appr) throw new Error('This request was already answered');
    let response: Json;
    switch (a.decision) {
      case 'deny':
        response = { behavior: 'deny', message: a.message?.trim() || 'The user declined this action.' };
        break;
      case 'allow_always':
        response = { behavior: 'allow', updatedInput: r.input, updatedPermissions: r.permission_suggestions ?? [] };
        break;
      case 'allow_accept_edits':
        response = { behavior: 'allow', updatedInput: r.input, updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }] };
        break;
      case 'answer':
        response = { behavior: 'allow', updatedInput: { ...r.input, answers: a.answers ?? {} } };
        break;
      default:
        response = { behavior: 'allow', updatedInput: r.input };
    }
    this.runner.writeLine({ type: 'control_response', response: { subtype: 'success', request_id: id, response } });
    this.approvals.delete(id);
    this.raw.delete(id);
    this.setWorking();
    this.changed();
  }

  async configure(cfg: LiveConfig): Promise<void> {
    if (cfg.model !== undefined) {
      await this.control({ subtype: 'set_model', model: cfg.model || 'default' });
      this.state.model = cfg.model || undefined;
    }
    if (cfg.effort !== undefined && cfg.effort) {
      await this.control({ subtype: 'apply_flag_settings', settings: { effortLevel: cfg.effort } });
      this.state.effort = cfg.effort;
    }
    if (cfg.mode !== undefined && cfg.mode) {
      await this.control({ subtype: 'set_permission_mode', mode: cfg.mode });
      this.state.mode = cfg.mode;
    }
    this.changed();
  }

  async stopTask(taskId: string): Promise<void> {
    await this.control({ subtype: 'stop_task', task_id: taskId });
    const t = this.tasks.get(taskId);
    if (t) t.status = 'stopped';
    this.changed();
  }

  async rename(title: string): Promise<void> {
    await this.control({ subtype: 'rename_session', title, source: 'host' }).catch(() => {});
  }

  async usage(): Promise<Json> {
    return this.control({ subtype: 'get_usage', skip_behaviors: true }, 20_000);
  }

  stop() {
    // Ask the turn to stop first so the CLI can write a clean transcript tail.
    if (this.state.status === 'working' || this.state.status === 'waiting') this.interrupt().catch(() => {});
    setTimeout(() => this.runner.stop(), 600);
  }

  protected onExited() {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error('session ended'));
    }
    this.pending.clear();
  }
}

function buildApproval(id: string, r: Json): ApprovalRequest {
  const tool = String(r.tool_name ?? 'tool');
  const input: Json = r.input ?? {};
  const base = { id, itemId: r.tool_use_id, createdAt: Date.now(), title: r.title ?? approvalTitleFor(tool, input) };
  const allowAlways = !r.suppress_always_allow_rule && Array.isArray(r.permission_suggestions) && r.permission_suggestions.length > 0;
  const std = [
    { id: 'allow', label: 'Allow', style: 'primary' as const },
    ...(allowAlways ? [{ id: 'allow_always', label: suggestionLabel(r.permission_suggestions), style: 'default' as const }] : []),
    { id: 'deny', label: 'Deny', style: 'danger' as const },
  ];
  const reason = r.decision_reason ? String(r.decision_reason).replace(/\x1b\[[0-9;]*m/g, '') : undefined;
  if (tool === 'AskUserQuestion') {
    return { ...base, kind: 'question', questions: questionsFrom(input.questions), options: [{ id: 'answer', label: 'Send answers', style: 'primary' }, { id: 'deny', label: 'Skip', style: 'default' }] };
  }
  if (tool === 'ExitPlanMode') {
    return {
      ...base,
      kind: 'plan',
      detail: String(input.plan ?? ''),
      options: [
        { id: 'allow_accept_edits', label: 'Approve, auto-accept edits', style: 'primary' },
        { id: 'allow', label: 'Approve, ask before edits', style: 'default' },
        { id: 'deny', label: 'Keep planning', style: 'default' },
      ],
    };
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const detail = String(input.command ?? '');
    return { ...base, kind: 'command', detail: input.description ? `# ${input.description}\n${detail}` : detail, options: std, ...(reason ? { title: `${base.title} — ${firstLine(reason, 90)}` } : {}) };
  }
  if (tool === 'Edit' || tool === 'MultiEdit' || tool === 'Write') {
    const diff =
      tool === 'Write'
        ? wholeFileDiff(String(input.content ?? ''), '+')
        : tool === 'Edit'
          ? snippetDiff(String(input.old_string ?? ''), String(input.new_string ?? ''))
          : (input.edits ?? []).map((e: Json) => snippetDiff(String(e.old_string ?? ''), String(e.new_string ?? ''))).join('\n');
    return { ...base, kind: 'file', detail: `${input.file_path}\n${diff}`, options: std };
  }
  const detail = JSON.stringify(input, null, 2);
  return { ...base, kind: 'tool', detail: reason ? `${reason}\n\n${detail}` : detail, options: std };
}

function suggestionLabel(s: Json[]): string {
  const first = s[0] ?? {};
  if (first.type === 'setMode' && first.mode === 'acceptEdits') return 'Allow all edits this session';
  if (first.type === 'addRules' && Array.isArray(first.rules) && first.rules[0]) {
    const rule = first.rules[0];
    return `Always allow ${rule.toolName}${rule.ruleContent ? ` ${String(rule.ruleContent).slice(0, 40)}` : ''}`;
  }
  return 'Always allow';
}
