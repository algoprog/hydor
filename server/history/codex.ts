// Codex rollout (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl) -> timeline items.
//
// Newer CLIs write `event_msg/item_completed` records (the same ThreadItems the app
// server streams); those are used when a turn has them. Older rollouts only have the
// raw Responses API items (function calls, custom tool calls, messages).
import type { FileChange, GoalInfo, Question, SessionStats, TimelineItem, TodoEntry, ToolInfo, ToolItem } from '../../shared/types.ts';
import {
  ActivityLog,
  addFileStats,
  clip,
  emptyStats,
  firstLine,
  GEN_MS_CAP,
  makeFileChange,
  MAX_OUTPUT,
  parseApplyPatch,
  parseTs,
  stripWrappers,
  wholeFileDiff,
  type Chunk,
} from './common.ts';
import { splitHandoff } from '../handoff.ts';
import type { ParserOptions, SummaryData } from './claude.ts';

type Json = Record<string, any>;

export interface CodexSummary extends SummaryData {
  parentId?: string;
  effort?: string;
}

interface CodexState {
  stats: SessionStats;
  summary: CodexSummary;
  files: Record<string, [number, number]>;
  seq: number;
  turnId?: string;
  turnStart?: number;
  turnItems: boolean;
  turnModel?: string;
  lastTotals?: Json | null;
  forked?: boolean;
  tokenBase?: Json | null;
  calls?: Record<string, ToolItem>;
  provisional?: string[];
  covered?: string[];
}

const HEAD_RE = /^\{"timestamp":"([^"]+)",(?:"ordinal":\d+,)?"type":"([a-z_]+)"(?:,"payload":\{"type":"([a-z_]+)")?/;

// Context the CLI injects as user/developer messages; not typed by the user.
const INJECTED_PREFIXES = [
  '<environment_context>',
  '<user_instructions>',
  '<permissions instructions>',
  '<skills_instructions>',
  '<recommended_plugins>',
  '<apps_instructions>',
  '<collaboration_mode>',
  '<personality',
  '<turn_aborted>',
  '# AGENTS.md instructions',
  '<INSTRUCTIONS>',
  '<user_shell_command>',
];

/** request_user_input questions: [{id, header, question, options: [{label, description}], isOther}]. */
function codexQuestions(list: unknown): Question[] {
  if (!Array.isArray(list)) return [];
  return list.map((q: Json, i: number) => ({
    id: String(q.id ?? i),
    header: q.header,
    question: String(q.question ?? ''),
    options: Array.isArray(q.options) ? q.options.map((o: Json) => ({ label: String(o?.label ?? o), description: o?.description })) : [],
    allowOther: q.isOther !== false,
  }));
}

export class CodexParser {
  items: TimelineItem[] = [];
  private index = new Map<string, number>();
  private dirty = new Set<string>();
  stats: SessionStats = emptyStats();
  summary: CodexSummary = {};
  /** The thread's goal while it is set and not complete (from thread_goal_updated events). */
  goal: GoalInfo | null = null;
  chunks: Chunk[] = [];
  private files: Record<string, [number, number]> = {};
  private seq = 0;
  private turnId?: string;
  private turnStart?: number;
  /** The current turn has item_completed records, so raw response items are ignored. */
  private turnItems = false;
  private turnModel?: string;
  private turnTokens = { in: 0, out: 0, cached: 0 };
  private lastTotals: Json | null = null;
  /** Forked from another thread (sub-agents are): the copied history carries the parent's usage. */
  private forked = false;
  /** The parent's running totals at the fork, subtracted from this thread's. */
  private tokenBase: Json | null = null;
  private calls = new Map<string, ToolItem>();
  private provisional = new Set<string>();
  private covered = new Set<string>();
  /** A raw user message held for one record: an item_completed UserMessage may follow it. */
  private heldPrompt: { id: string; text: string; images: number; ts?: number; at?: number } | null = null;
  /** Activity of the lines parsed in this run (not part of the saved state). */
  act: ActivityLog | null;

  constructor(private opts: ParserOptions) {
    this.act = opts.collectActivity ? new ActivityLog() : null;
  }

  static fromState(s: CodexState, opts: ParserOptions): CodexParser {
    const p = new CodexParser(opts);
    p.stats = s.stats;
    p.summary = s.summary;
    p.files = s.files;
    p.seq = s.seq ?? 0;
    p.turnId = s.turnId;
    p.turnStart = s.turnStart;
    p.turnItems = !!s.turnItems;
    p.turnModel = s.turnModel;
    p.lastTotals = s.lastTotals ?? null;
    p.forked = !!s.forked;
    p.tokenBase = s.tokenBase ?? null;
    p.calls = new Map(Object.entries(s.calls ?? {}));
    p.provisional = new Set(s.provisional ?? []);
    p.covered = new Set(s.covered ?? []);
    return p;
  }

  toState(): CodexState {
    this.flushHeld();
    const calls: Record<string, ToolItem> = {};
    for (const [k, v] of this.calls) calls[k] = { ...v, tool: { ...v.tool, input: undefined, output: undefined } };
    return {
      stats: this.stats,
      summary: this.summary,
      files: this.files,
      seq: this.seq,
      turnId: this.turnId,
      turnStart: this.turnStart,
      turnItems: this.turnItems,
      turnModel: this.turnModel,
      lastTotals: this.lastTotals,
      forked: this.forked,
      tokenBase: this.tokenBase,
      calls,
      provisional: [...this.provisional],
      covered: [...this.covered],
    };
  }

  title(): string | undefined {
    return this.summary.customTitle;
  }

  /** Call once the file has stopped growing, so a trailing raw prompt is not lost. */
  finish() {
    this.flushHeld();
  }

  takeDirty(): TimelineItem[] {
    const out: TimelineItem[] = [];
    for (const id of this.dirty) {
      const i = this.index.get(id);
      if (i != null) out.push(this.items[i]);
    }
    this.dirty.clear();
    return out;
  }

  has(id: string) {
    return this.index.has(id);
  }

  private upsert(item: TimelineItem) {
    if (!this.opts.retain) return;
    const i = this.index.get(item.id);
    if (i == null) {
      item.seq = this.items.length;
      this.index.set(item.id, this.items.length);
      this.items.push(item);
    } else {
      item.seq = i;
      this.items[i] = item;
    }
    this.dirty.add(item.id);
  }

  private chunk(kind: Chunk['kind'], text: string | undefined, ts?: number) {
    if (!this.opts.collectChunks || !text) return;
    const t = text.trim();
    if (t) this.chunks.push({ kind, ts, text: t.length > 4000 ? t.slice(0, 4000) : t });
  }

  /** Where the line being read starts in the rollout (when the reader knows it). */
  private lineAt?: number;

  feed(line: string, offset?: number) {
    this.lineAt = offset;
    if (line.length < 2) return;
    const head = HEAD_RE.exec(line.slice(0, 200));
    if (head) {
      const [, , type, ptype] = head;
      if (type === 'world_state' || type === 'token_usage_record' || type === 'inter_agent_communication_metadata') return;
      if (type === 'compacted') {
        this.flushHeld();
        const ts = parseTs(head[1]);
        this.upsert({ kind: 'system', id: `compact:${this.seq++}`, seq: 0, ts, level: 'info', text: 'Context compacted' });
        return;
      }
      if (type === 'response_item' && ptype === 'reasoning' && line.includes('"summary":[]')) return;
      // Structured turns carry their own messages and reasoning; raw tool calls are still read
      // because some CLI versions run commands inside `exec` scripts without command records.
      // (Codex's goal notes are the exception: onResponseItem reads them.)
      if (type === 'response_item' && this.turnItems && (ptype === 'reasoning' || (ptype === 'message' && !line.includes('codex_internal_context source=\\"user_goal'))))
        return;
    }
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    this.handle(m);
  }

  handle(m: Json) {
    const ts = parseTs(m.timestamp);
    if (ts) {
      if (!this.summary.createdAt || ts < this.summary.createdAt) this.summary.createdAt = ts;
      if (!this.summary.updatedAt || ts > this.summary.updatedAt) this.summary.updatedAt = ts;
    }
    const p: Json = m.payload ?? {};
    const isUserItem = m.type === 'event_msg' && p.type === 'item_completed' && p.item?.type === 'UserMessage';
    if (this.heldPrompt && !isUserItem) this.flushHeld();

    switch (m.type) {
      case 'session_meta':
        this.onMeta(p);
        break;
      case 'turn_context':
        if (p.model) this.summary.model = this.turnModel = p.model;
        if (p.effort) this.summary.effort = p.effort;
        if (p.cwd && !this.summary.cwd) this.summary.cwd = p.cwd;
        break;
      case 'response_item':
        this.onResponseItem(p, ts);
        break;
      case 'event_msg':
        this.onEvent(p, ts);
        break;
    }
  }

  private onMeta(p: Json) {
    // The first header is this thread's own. A fork replays its parent's history, header
    // included, and that copy must not change whose thread this is.
    if (this.summary.id) return;
    this.summary.id = p.id ?? p.session_id;
    if (p.cwd) this.summary.cwd = p.cwd;
    if (p.cli_version) this.summary.version = p.cli_version;
    const src = p.source;
    if (p.forked_from_id || (src && typeof src === 'object' && src.subagent)) this.forked = true;
    if (typeof src === 'string') this.summary.source = src;
    else if (src && typeof src === 'object') {
      const spawn = src.subagent?.thread_spawn;
      if (spawn?.parent_thread_id) this.summary.parentId = spawn.parent_thread_id;
      this.summary.source = src.subagent ? 'subagent' : Object.keys(src)[0];
    }
    if (p.git?.branch) this.summary.gitBranch = p.git.branch;
    const ts = parseTs(p.timestamp);
    if (ts && (!this.summary.createdAt || ts < this.summary.createdAt)) this.summary.createdAt = ts;
  }

  // ---- turns -------------------------------------------------------------

  private startTurn(id: string, ts?: number) {
    this.endTurn();
    this.turnId = id;
    this.turnStart = ts;
    this.turnItems = false;
    this.turnTokens = { in: 0, out: 0, cached: 0 };
    this.stats.turns++;
    this.act?.bump(ts, 'turns');
  }

  endTurn(status = 'completed', durationMs?: number, ts?: number) {
    if (!this.turnId) return;
    const id = this.turnId;
    this.turnId = undefined;
    this.turnItems = false;
    const dur = durationMs ?? (ts && this.turnStart ? ts - this.turnStart : undefined);
    if (dur && dur > 0) this.stats.workMs = (this.stats.workMs ?? 0) + dur;
    // Codex gives per-turn wall time only, so throughput here is output over the whole turn (includes tool runs).
    if (dur && this.turnTokens.out > 0) {
      const g = Math.min(dur, GEN_MS_CAP);
      this.stats.genMs = (this.stats.genMs ?? 0) + g;
      this.act?.bump(ts, 'genMs', g);
    }
    this.upsert({
      kind: 'turn',
      id: `turn:${id}`,
      seq: 0,
      ts,
      status,
      durationMs: dur,
      tokens: { input: this.turnTokens.in, output: this.turnTokens.out, cacheRead: this.turnTokens.cached },
      model: this.turnModel,
    });
  }

  private prompt(id: string, textIn: string, images: number, ts?: number, at = this.lineAt) {
    // Codex's own context (a goal set, a nudge to keep working on it) is not something the user typed.
    const internal = /^<codex_internal_context source="([^"]*)">([\s\S]*?)<\/codex_internal_context>\s*$/.exec(textIn.trim());
    if (internal) {
      const note = internal[1] === 'user_goal' ? goalNote(internal[2]) : '';
      if (note) this.upsert({ kind: 'user', id, seq: 0, ts, text: note, meta: 'command-output' });
      // Clears, pauses and resumes are recorded only here (sets also get a thread_goal_updated event).
      if (note === 'Goal cleared') this.goal = null;
      else if (this.goal && (note === 'Goal paused' || note === 'Goal resumed')) this.goal = { ...this.goal, status: note === 'Goal paused' ? 'paused' : 'active' };
      // A session started with a goal is named after it, as Claude Code's are ("/goal …").
      if (note.startsWith('Goal set: ') && !this.summary.firstPrompt) this.summary.firstPrompt = firstLine(`/goal ${note.slice(10)}`, 300);
      return;
    }
    // A conversation carried over from another agent: the request is what follows its context.
    const ho = splitHandoff(textIn);
    const text = ho ? ho.request : textIn;
    if (!this.turnId) this.startTurn(`p:${id}`, ts);
    this.stats.userMessages++;
    this.act?.bump(ts, 'prompts');
    if (!this.summary.firstPrompt && text) this.summary.firstPrompt = firstLine(text, 300);
    if (text) this.summary.lastPrompt = firstLine(text, 300);
    this.chunk('user', text, ts);
    this.upsert({ kind: 'user', id, seq: 0, ts, text, images: images || undefined, handoff: ho?.handoff, imageAt: images ? at : undefined, turn: this.turnId });
  }

  private flushHeld() {
    const h = this.heldPrompt;
    if (!h) return;
    this.heldPrompt = null;
    this.prompt(h.id, h.text, h.images, h.ts, h.at);
  }

  // ---- item_completed (current format) -----------------------------------

  private onEvent(p: Json, ts?: number) {
    switch (p.type) {
      case 'task_started':
        this.startTurn(p.turn_id ?? `t${this.seq++}`, parseTs(p.started_at) ?? ts);
        break;
      case 'task_complete':
        // A turn the model API refused ends "complete" with only an error to show for it.
        if (p.error) {
          const raw = String(p.error.message ?? p.error);
          let msg = raw;
          try {
            msg = JSON.parse(raw)?.error?.message ?? raw;
          } catch {}
          this.upsert({ kind: 'system', id: `err:${p.turn_id ?? this.seq++}`, seq: 0, ts, level: 'error', text: firstLine(msg, 300), detail: msg.length > 300 || msg !== raw ? raw : undefined });
        }
        this.endTurn(p.error ? 'failed' : 'completed', p.duration_ms, parseTs(p.completed_at) ?? ts);
        break;
      case 'turn_aborted':
        this.upsert({ kind: 'system', id: `abort:${p.turn_id ?? this.seq++}`, seq: 0, ts, level: 'warn', text: `Turn interrupted${p.reason ? ` (${p.reason})` : ''}` });
        this.endTurn('interrupted', undefined, ts);
        break;
      case 'token_count': {
        const tot = p.info?.total_token_usage;
        if (!tot) break;
        // A fork's first reading is the parent's running total, already counted there.
        if (!this.lastTotals && this.forked) {
          this.lastTotals = this.tokenBase = tot;
          break;
        }
        const last = this.lastTotals;
        let dIn = (tot.input_tokens ?? 0) - (last?.input_tokens ?? 0);
        let dCached = (tot.cached_input_tokens ?? 0) - (last?.cached_input_tokens ?? 0);
        let dOut = (tot.output_tokens ?? 0) - (last?.output_tokens ?? 0);
        // Counters that went down were restarted by a new process.
        if (dIn < 0 || dOut < 0 || dCached < 0) {
          dIn = tot.input_tokens ?? 0;
          dCached = tot.cached_input_tokens ?? 0;
          dOut = tot.output_tokens ?? 0;
        }
        const fresh = Math.max(0, dIn - dCached);
        this.turnTokens.in += fresh;
        this.turnTokens.cached += dCached;
        this.turnTokens.out += dOut;
        this.stats.tokensIn += fresh;
        this.stats.tokensCached += dCached;
        this.stats.tokensOut += dOut;
        this.act?.bump(ts, 'tokensIn', fresh);
        this.act?.bump(ts, 'tokensCached', dCached);
        this.act?.bump(ts, 'tokensOut', dOut);
        this.lastTotals = tot;
        break;
      }
      case 'error':
        this.upsert({ kind: 'system', id: `err:${this.seq++}`, seq: 0, ts, level: 'error', text: firstLine(String(p.message ?? 'Error'), 300), detail: p.message });
        break;
      case 'thread_name_updated':
        if (p.thread_name) this.summary.customTitle = p.thread_name;
        break;
      case 'thread_goal_updated': {
        const g = p.goal ?? {};
        if (g.status === 'complete') {
          if (this.goal) this.upsert({ kind: 'system', id: `goal:${g.updatedAt ?? this.seq++}`, seq: 0, ts, level: 'info', text: `Goal met: ${g.objective ?? this.goal.objective}` });
          this.goal = null;
        } else if (g.objective) this.goal = codexGoal(g);
        break;
      }
      case 'thread_goal_cleared':
        this.goal = null;
        break;
      case 'item_completed':
        this.onItem(p.item ?? {}, parseTs(p.completed_at_ms) ?? ts, parseTs(p.started_at_ms));
        break;
      case 'exec_command_end':
        this.legacyExecEnd(p);
        break;
      case 'patch_apply_end':
        if (!this.turnItems) this.legacyPatchEnd(p, ts);
        break;
      case 'user_message':
        // Only very old rollouts lack the matching response_item.
        break;
    }
  }

  private onItem(it: Json, ts?: number, startedAt?: number) {
    if (!this.turnItems) {
      this.turnItems = true;
      // The raw copy of this prompt was held back; the structured one replaces it.
      this.heldPrompt = null;
    }
    const id = String(it.id ?? `i${this.seq++}`);
    if (this.provisional.size) this.coverOpenCalls(String(it.type));
    switch (it.type) {
      case 'UserMessage': {
        let text = '';
        let images = 0;
        for (const c of it.content ?? []) {
          if (c?.type === 'text') text += (text ? '\n' : '') + (c.text ?? '');
          else if (c?.type === 'image' || c?.type === 'localImage' || c?.type === 'local_image') images++;
        }
        // Its goal notes arrive as messages too (onResponseItem); one copy is enough.
        if (text.trimStart().startsWith('<codex_internal_context source="user_goal">')) break;
        this.prompt(id, stripWrappers(text).text, images, ts);
        break;
      }
      case 'AgentMessage': {
        const text = (it.content ?? []).map((c: Json) => c?.text ?? '').join('');
        if (!text.trim()) break;
        this.stats.assistantMessages++;
        this.act?.bump(ts, 'messages');
        this.chunk('assistant', text, ts);
        this.upsert({ kind: 'assistant', id, seq: 0, ts, text, phase: it.phase ?? undefined });
        break;
      }
      case 'Reasoning': {
        const text = [...(it.summary_text ?? []), ...(it.raw_content ?? [])].filter(Boolean).join('\n\n');
        if (text.trim()) this.upsert({ kind: 'thinking', id, seq: 0, ts, text });
        break;
      }
      case 'CommandExecution':
        this.toolItem(id, ts, startedAt, commandInfo(it));
        break;
      case 'FileChange': {
        const files = fileChanges(it.changes);
        const failed = it.status === 'failed' || it.status === 'declined';
        this.toolItem(id, ts, startedAt, {
          name: 'apply_patch',
          category: 'edit',
          title: files.length === 1 ? files[0].path : `${files.length} files`,
          status: failed ? (it.status === 'declined' ? 'declined' : 'error') : 'ok',
          files: failed ? files.map((f) => ({ ...f })) : files,
          output: it.stderr || undefined,
        }, !failed);
        break;
      }
      case 'McpToolCall': {
        const result = it.result?.content ? mcpText(it.result.content) : it.error ? JSON.stringify(it.error) : '';
        const c = clip(result, MAX_OUTPUT);
        this.toolItem(id, ts, startedAt, {
          name: `mcp__${it.server}__${it.tool}`,
          category: 'mcp',
          title: `${it.server} · ${it.tool}`,
          status: it.status === 'failed' ? 'error' : 'ok',
          input: it.arguments,
          output: c.text || undefined,
          truncated: c.truncated || undefined,
          durationMs: durationMs(it.duration),
        });
        break;
      }
      case 'WebSearch': {
        const out = (it.results ?? [])
          .map((r: Json) => `${r.title ?? r.url ?? ''}\n  ${r.url ?? ''}${r.snippet ? `\n  ${r.snippet}` : ''}`)
          .join('\n');
        this.toolItem(id, ts, startedAt, { name: 'web_search', category: 'web', title: it.query ?? it.action?.query ?? 'Web search', status: 'ok', output: out || undefined });
        break;
      }
      case 'ImageView':
        this.toolItem(id, ts, startedAt, { name: 'view_image', category: 'read', title: String(it.path ?? '').replace(/^file:\/\//, ''), subtitle: 'image', status: 'ok' });
        break;
      case 'ContextCompaction':
        this.upsert({ kind: 'system', id, seq: 0, ts, level: 'info', text: 'Context compacted' });
        break;
      case 'SubAgentActivity':
        this.upsert({ kind: 'system', id, seq: 0, ts, level: 'info', text: `Subagent ${it.agent_path ?? it.agent_thread_id ?? ''} ${it.kind ?? ''}`.trim() });
        break;
      case 'Plan':
      case 'TodoList': {
        const todos = planTodos(it.plan ?? it.items ?? it.todos);
        this.toolItem(id, ts, startedAt, { name: 'update_plan', category: 'todo', title: 'Updated the plan', status: 'ok', todos });
        break;
      }
      case 'Extension': {
        const kind = String(it.kind ?? 'extension');
        const title = kind === 'clock.sleep' && it.durationMs ? `Waited ${Math.round(it.durationMs / 1000)} s` : kind;
        this.toolItem(id, ts, startedAt, { name: kind, category: 'other', title, status: 'ok', durationMs: it.durationMs, input: it.query ? { query: it.query } : undefined });
        break;
      }
      default: {
        const { type, id: _id, ...rest } = it;
        this.toolItem(id, ts, startedAt, { name: String(type ?? 'item'), category: 'other', title: String(type ?? 'Item'), status: 'ok', input: rest });
      }
    }
  }

  private toolItem(id: string, ts: number | undefined, startedAt: number | undefined, tool: ToolInfo, countFiles = true) {
    this.stats.toolCalls++;
    this.act?.bump(ts, 'toolCalls');
    if (tool.category === 'command') {
      this.stats.commands++;
      this.act?.bump(ts, 'commands');
      if (tool.background) this.stats.backgroundCommands++;
      this.chunk('command', tool.title, ts);
    }
    if (tool.durationMs == null && startedAt && ts && ts >= startedAt) tool.durationMs = ts - startedAt;
    if (countFiles && tool.files) {
      addFileStats(this.files, this.stats, tool.files);
      this.act?.files(ts, tool.files);
      for (const f of tool.files) this.chunk('file', f.path, ts);
    }
    this.upsert({ kind: 'tool', id, seq: 0, ts: startedAt ?? ts, tool });
  }

  // ---- raw response items (older format) ---------------------------------

  private onResponseItem(p: Json, ts?: number) {
    // Codex's goal notes (set, paused, cleared) come only as messages, outside any turn's items.
    const first = p.type === 'message' && p.role === 'user' ? String(p.content?.[0]?.text ?? '') : '';
    if (first.startsWith('<codex_internal_context source="user_goal">')) return this.prompt(String(p.id ?? `g${this.seq++}`), first, 0, ts);
    if (this.turnItems && (p.type === 'message' || p.type === 'reasoning' || p.type === 'web_search_call')) return;
    switch (p.type) {
      case 'message': {
        const text = (p.content ?? [])
          .filter((c: Json) => c?.type === 'input_text' || c?.type === 'output_text' || c?.type === 'text')
          .map((c: Json) => c.text ?? '')
          .join('\n');
        const images = (p.content ?? []).filter((c: Json) => c?.type === 'input_image').length;
        if (p.role === 'user') {
          const t = text.trim();
          if (!t || INJECTED_PREFIXES.some((x) => t.startsWith(x))) return;
          const cleaned = stripWrappers(t).text;
          if (!cleaned && !images) return;
          this.heldPrompt = { id: p.id ?? `u${this.seq++}`, text: cleaned, images, ts, at: this.lineAt };
        } else if (p.role === 'assistant' && !this.turnItems) {
          if (!text.trim()) return;
          this.stats.assistantMessages++;
          this.act?.bump(ts, 'messages');
          this.chunk('assistant', text, ts);
          this.upsert({ kind: 'assistant', id: p.id ?? `a${this.seq++}`, seq: 0, ts, text, phase: p.phase });
        }
        break;
      }
      case 'reasoning': {
        const text = (p.summary ?? []).map((s: Json) => s?.text ?? '').filter(Boolean).join('\n\n');
        if (text.trim() && !this.turnItems) this.upsert({ kind: 'thinking', id: p.id ?? `r${this.seq++}`, seq: 0, ts, text });
        break;
      }
      case 'function_call':
      case 'custom_tool_call':
      case 'local_shell_call':
        this.legacyCall(p, ts);
        break;
      case 'function_call_output':
      case 'custom_tool_call_output':
      case 'local_shell_call_output':
        this.legacyOutput(p, ts);
        this.goalOutput(p, ts);
        break;
      case 'web_search_call':
        this.toolItem(p.id ?? `w${this.seq++}`, ts, undefined, {
          name: 'web_search',
          category: 'web',
          title: p.action?.query ?? 'Web search',
          status: 'ok',
        });
        break;
    }
  }

  /** The model marks a goal complete with its update_goal tool; the rollout has no event for it, only this output. */
  private goalOutput(p: Json, ts?: number) {
    if (!this.goal) return;
    const out = Array.isArray(p.output) ? p.output.map((o: Json) => o?.text ?? '').join('\n') : String(p.output ?? '');
    const m = /\{"goal":\{[^{}]*"status":"complete"[^{}]*\}/.exec(out);
    if (!m) return;
    this.upsert({ kind: 'system', id: `goal:${p.call_id ?? this.seq++}`, seq: 0, ts, level: 'info', text: `Goal met: ${this.goal.objective}` });
    this.goal = null;
  }

  private legacyCall(p: Json, ts?: number) {
    const callId = String(p.call_id ?? p.id ?? `c${this.seq++}`);
    const name = String(p.name ?? (p.type === 'local_shell_call' ? 'local_shell' : 'tool'));
    let args: Json = {};
    if (typeof p.arguments === 'string') {
      try {
        args = JSON.parse(p.arguments);
      } catch {
        args = { raw: p.arguments };
      }
    } else if (p.action) args = p.action;
    const input = typeof p.input === 'string' ? p.input : undefined;
    let tool: ToolInfo;
    if (name === 'exec_command' || name === 'shell' || name === 'local_shell' || name === 'container.exec') {
      const cmd = Array.isArray(args.command) ? unwrapShell(args.command) : String(args.cmd ?? args.command ?? '');
      tool = { name, category: 'command', title: cmd, status: 'running', cwd: args.workdir };
    } else if (name === 'write_stdin') {
      const chars = String(args.chars ?? '');
      tool = { name, category: 'command', title: chars ? `stdin → ${JSON.stringify(chars).slice(0, 80)}` : `Poll process ${args.session_id ?? ''}`, subtitle: `process ${args.session_id ?? ''}`, status: 'running', background: true };
    } else if (name === 'exec' && input != null) {
      const cmds = [...input.matchAll(/cmd:\s*"((?:[^"\\]|\\.)*)"/g)].map((x) => {
        try {
          return JSON.parse(`"${x[1]}"`) as string;
        } catch {
          return x[1];
        }
      });
      const patches = (input.match(/apply_patch/g) ?? []).length;
      const used = [...new Set([...input.matchAll(/tools\.([a-zA-Z_]+)\(/g)].map((x) => x[1]))];
      const poll = input.match(/write_stdin\(\{\s*session_id:\s*(\d+)/);
      const fallback = poll ? `Check on process ${poll[1]}` : used.length ? used.join(', ') : firstLine(input, 120);
      tool = {
        name: 'exec',
        category: cmds.length || poll ? 'command' : patches ? 'edit' : 'other',
        title: cmds[0] ?? (patches ? 'apply_patch' : fallback),
        subtitle: cmds.length > 1 ? `script · ${cmds.length} commands` : 'script',
        status: 'running',
        input: { code: input },
        files: patches ? patchesInScript(input) : undefined,
      };
    } else if (name === 'apply_patch') {
      const patch = input ?? String(args.input ?? args.patch ?? '');
      const files = parseApplyPatch(patch);
      tool = { name, category: 'edit', title: files.length === 1 ? files[0].path : `${files.length} files`, status: 'running', files };
    } else if (name === 'update_plan') {
      tool = { name, category: 'todo', title: 'Updated the plan', subtitle: args.explanation ? firstLine(args.explanation, 140) : undefined, status: 'ok', todos: planTodos(args.plan) };
    } else if (name === 'view_image') {
      tool = { name, category: 'read', title: String(args.path ?? ''), subtitle: 'image', status: 'running' };
    } else if (['spawn_agent', 'send_message', 'wait_agent', 'list_agents', 'followup_task', 'interrupt_agent', 'wait'].includes(name)) {
      tool = { name, category: 'task', title: agentTitle(name, args), status: 'running', input: args };
    } else if (name === 'request_user_input' || name === 'request_user_input_async') {
      tool = { name, category: 'question', title: firstLine(String(args.questions?.[0]?.question ?? 'Question for the user'), 160), status: 'running', questions: codexQuestions(args.questions) };
    } else {
      tool = { name, category: name.includes('__') ? 'mcp' : 'other', title: name, status: 'running', input: input != null ? { input } : args };
    }
    const item: ToolItem = { kind: 'tool', id: callId, seq: 0, ts, tool };
    this.calls.set(callId, item);
    if (this.turnItems) {
      // Shown only if no structured record arrives before its output (see coverOpenCalls).
      this.provisional.add(callId);
      return;
    }
    this.countCall(tool, ts);
    this.upsert(item);
  }

  private countCall(tool: ToolInfo, ts?: number) {
    this.stats.toolCalls++;
    this.act?.bump(ts, 'toolCalls');
    if (tool.category === 'command') {
      this.stats.commands++;
      this.act?.bump(ts, 'commands');
      if (tool.background) this.stats.backgroundCommands++;
      this.chunk('command', tool.title, ts);
    }
  }

  /** A structured record arrived while raw calls were open: those calls are already shown by it. */
  private coverOpenCalls(kind: string) {
    if (!['CommandExecution', 'FileChange', 'McpToolCall', 'ImageView', 'WebSearch'].includes(kind)) return;
    for (const id of this.provisional) {
      const t = this.calls.get(id)?.tool;
      if (!t) continue;
      const matches =
        t.name === 'exec' ||
        (kind === 'CommandExecution' && t.category === 'command') ||
        (kind === 'FileChange' && t.category === 'edit') ||
        (kind === 'McpToolCall' && t.category === 'mcp') ||
        (kind === 'ImageView' && t.name === 'view_image');
      if (matches) this.covered.add(id);
    }
  }

  private legacyOutput(p: Json, ts?: number) {
    const callId = String(p.call_id ?? '');
    const prev = this.calls.get(callId);
    if (!prev) return;
    this.calls.delete(callId);
    const provisional = this.provisional.delete(callId);
    if (provisional && this.covered.delete(callId)) return;
    let out = '';
    if (typeof p.output === 'string') out = p.output;
    else if (Array.isArray(p.output)) out = p.output.map((c: Json) => c?.text ?? '').join('');
    else if (p.output && typeof p.output === 'object') out = String(p.output.content ?? JSON.stringify(p.output));
    // Old shell tools wrapped results as {"output": "...", "metadata": {"exit_code": N}}.
    let exitCode: number | null | undefined;
    if (out.startsWith('{"output"')) {
      try {
        const j = JSON.parse(out);
        out = String(j.output ?? '');
        exitCode = j.metadata?.exit_code;
      } catch {}
    }
    const ec = out.match(/(?:Exit code:|Process exited with code) (\d+)/);
    if (ec) exitCode = Number(ec[1]);
    const running = /Process running with session ID (\d+)/.exec(out);
    const tool: ToolInfo = { ...prev.tool };
    const c = clip(out, MAX_OUTPUT);
    tool.output = c.text || undefined;
    if (c.truncated) {
      tool.truncated = true;
      tool.outputBytes = c.bytes;
    }
    if (tool.category === 'command') {
      tool.exitCode = running ? null : exitCode ?? tool.exitCode ?? null;
      if (running && !tool.background) {
        tool.background = true;
        tool.subtitle = `still running · process ${running[1]}`;
        this.stats.backgroundCommands++;
      }
      tool.status = exitCode && exitCode !== 0 ? 'error' : 'ok';
      if (/Script failed|^Error:/m.test(out.slice(0, 200)) && tool.name === 'exec') tool.status = 'error';
    } else if (tool.category === 'question') {
      // {"answers": {"<question id>": {"answers": ["…"]}}}; empty when skipped or timed out.
      try {
        const got = JSON.parse(out).answers ?? {};
        tool.answers = Object.fromEntries(Object.entries(got).map(([k, v]: [string, any]) => [k, (v?.answers ?? []).join(', ')]).filter(([, v]) => v));
        tool.output = Object.keys(tool.answers!).length ? undefined : 'Not answered (skipped or timed out)';
      } catch {}
      tool.status = 'ok';
    } else {
      tool.status = /^(Error|error:)/.test(out) ? 'error' : 'ok';
    }
    if (prev.ts && ts) tool.durationMs = ts - prev.ts;
    if (provisional) this.countCall(tool, ts);
    if (tool.files && tool.status === 'ok') {
      addFileStats(this.files, this.stats, tool.files);
      this.act?.files(ts, tool.files);
      for (const f of tool.files) this.chunk('file', f.path, ts);
    }
    this.upsert({ ...prev, tool });
  }

  private legacyExecEnd(p: Json) {
    if (this.turnItems) return;
    const i = this.index.get(String(p.call_id ?? ''));
    if (i == null) return;
    const prev = this.items[i] as ToolItem;
    const out = String(p.aggregated_output ?? p.formatted_output ?? p.stdout ?? '');
    const c = clip(out, MAX_OUTPUT);
    this.upsert({
      ...prev,
      tool: {
        ...prev.tool,
        output: c.text || prev.tool.output,
        exitCode: p.exit_code ?? prev.tool.exitCode,
        status: p.exit_code && p.exit_code !== 0 ? 'error' : 'ok',
        durationMs: durationMs(p.duration) ?? prev.tool.durationMs,
      },
    });
  }

  private legacyPatchEnd(p: Json, ts?: number) {
    const files = fileChanges(p.changes);
    if (!files.length) return;
    const id = String(p.call_id ?? `patch${this.seq++}`);
    const i = this.index.get(id);
    if (i != null) {
      const prev = this.items[i] as ToolItem;
      if (prev.tool.files?.length) return;
      addFileStats(this.files, this.stats, files);
      this.act?.files(ts, files);
      this.upsert({ ...prev, tool: { ...prev.tool, files, status: p.success === false ? 'error' : 'ok' } });
      return;
    }
    this.toolItem(id, ts, undefined, { name: 'apply_patch', category: 'edit', title: files.length === 1 ? files[0].path : `${files.length} files`, status: p.success === false ? 'error' : 'ok', files });
  }
}

// ---- helpers -----------------------------------------------------------

function unwrapShell(argv: string[]): string {
  if (argv.length >= 3 && /(^|\/)(ba|z|da)?sh$/.test(argv[0]) && (argv[1] === '-lc' || argv[1] === '-c')) return argv.slice(2).join(' ');
  return argv.join(' ');
}

/** `/bin/bash -lc "cmd"` (how the app server prints commands) -> `cmd`. */
export function unwrapShellString(cmd: string): string {
  const m = cmd.match(/^(?:\/usr)?\/bin\/(?:ba|z|da)?sh -l?c ([\s\S]*)$/);
  if (!m) return cmd;
  const arg = m[1];
  if (arg.length >= 2 && arg.startsWith("'") && arg.endsWith("'")) return arg.slice(1, -1).replace(/'\\''/g, "'");
  if (arg.length >= 2 && arg.startsWith('"') && arg.endsWith('"')) return arg.slice(1, -1).replace(/\\(["\\$`])/g, '$1');
  return arg;
}

function durationMs(d: unknown): number | undefined {
  if (typeof d === 'number') return d;
  if (d && typeof d === 'object' && 'secs' in d) {
    const x = d as { secs: number; nanos?: number };
    return Math.round(x.secs * 1000 + (x.nanos ?? 0) / 1e6);
  }
  return undefined;
}

export function commandInfo(it: Json): ToolInfo {
  const cmd = Array.isArray(it.command) ? unwrapShell(it.command) : unwrapShellString(String(it.command ?? ''));
  const source = String(it.source ?? '');
  const exitCode: number | null = it.exit_code ?? it.exitCode ?? null;
  const status = String(it.status ?? 'completed');
  const interaction = source === 'unified_exec_interaction' || source === 'unifiedExecInteraction';
  // A unified-exec command whose call returned before the process ended keeps running in the background.
  const background = interaction || ((source === 'unified_exec_startup' || source === 'unifiedExecStartup') && exitCode == null && status !== 'failed');
  const out = String(it.aggregated_output ?? it.aggregatedOutput ?? it.formatted_output ?? it.stdout ?? '');
  const c = clip(out, MAX_OUTPUT);
  return {
    name: 'exec_command',
    category: 'command',
    title: cmd,
    subtitle: interaction ? `process ${it.process_id ?? it.processId ?? ''} · interaction` : undefined,
    status: status === 'declined' ? 'declined' : status === 'failed' || (exitCode != null && exitCode !== 0) ? 'error' : status === 'inProgress' ? 'running' : 'ok',
    exitCode,
    output: c.text || undefined,
    truncated: c.truncated || undefined,
    outputBytes: c.truncated ? c.bytes : undefined,
    durationMs: durationMs(it.duration ?? it.durationMs),
    cwd: String(it.cwd ?? '').replace(/^file:\/\//, '') || undefined,
    background,
    taskId: it.process_id ?? it.processId ?? undefined,
  };
}

/** Changes from a FileChange item: a map (rollout) or a list (app server). */
export function fileChanges(changes: unknown): FileChange[] {
  const out: FileChange[] = [];
  const add = (path: string, c: Json) => {
    const kind = c.type ?? c.kind?.type;
    const liveDiff = typeof c.diff === 'string' ? c.diff : undefined;
    if (kind === 'add') {
      // The app server sends a new file's content as `diff`; the rollout sends `content`.
      const body = c.unified_diff ?? (liveDiff?.startsWith('@@') ? liveDiff : wholeFileDiff(String(liveDiff ?? c.content ?? ''), '+'));
      out.push(makeFileChange(path, 'create', body));
    } else if (kind === 'delete') {
      out.push(makeFileChange(path, 'delete', c.unified_diff ?? c.diff ?? wholeFileDiff(String(c.content ?? ''), '-')));
    } else {
      const move = c.move_path ?? c.kind?.move_path ?? undefined;
      out.push(makeFileChange(path, move ? 'move' : 'edit', String(c.unified_diff ?? c.diff ?? ''), move || undefined));
    }
  };
  if (Array.isArray(changes)) for (const c of changes as Json[]) add(String(c.path ?? ''), c);
  else if (changes && typeof changes === 'object') for (const [path, c] of Object.entries(changes as Json)) add(path, c as Json);
  return out;
}

function patchesInScript(code: string): FileChange[] {
  const files: FileChange[] = [];
  for (const m of code.matchAll(/"(\*\*\* Begin Patch(?:[^"\\]|\\.)*)"/g)) {
    try {
      files.push(...parseApplyPatch(JSON.parse(`"${m[1]}"`) as string));
    } catch {}
  }
  return files;
}

function planTodos(plan: unknown): TodoEntry[] {
  if (!Array.isArray(plan)) return [];
  return plan.map((s: Json) => ({ text: String(s.step ?? s.text ?? s.content ?? ''), status: String(s.status ?? 'pending').replace('inProgress', 'in_progress') }));
}

function mcpText(content: unknown): string {
  if (!Array.isArray(content)) return typeof content === 'string' ? content : JSON.stringify(content);
  return (content as Json[]).map((c) => (c?.type === 'text' ? c.text : `[${c?.type ?? 'content'}]`)).join('\n');
}

function agentTitle(name: string, a: Json): string {
  switch (name) {
    case 'spawn_agent':
      return `Spawn agent${a.task_name ? ` ${a.task_name}` : ''}${a.message ? `: ${firstLine(String(a.message), 100)}` : ''}`;
    case 'send_message':
    case 'followup_task':
      return `Message to ${a.target ?? a.agent ?? a.task_name ?? 'agent'}${a.message ? `: ${firstLine(String(a.message), 100)}` : ''}`;
    case 'wait_agent':
    case 'wait':
      return `Wait for ${Array.isArray(a.targets) ? a.targets.join(', ') : a.target ?? 'agents'}`;
    case 'interrupt_agent':
      return `Interrupt ${a.target ?? 'agent'}`;
    default:
      return 'List agents';
  }
}

/** Codex's goal as the app shows it. */
export function codexGoal(g: Json): GoalInfo {
  const status = g.status === 'paused' ? 'paused' : g.status === 'blocked' ? 'blocked' : g.status === 'usageLimited' || g.status === 'budgetLimited' ? 'limited' : 'active';
  return { objective: String(g.objective), status, tokensUsed: g.tokensUsed ?? undefined, tokenBudget: g.tokenBudget ?? undefined, seconds: g.timeUsedSeconds ?? undefined };
}

/** "User set the goal: "…" / User set goal status: "paused"." → one line, as Claude Code words it. */
function goalNote(body: string): string {
  const set = /User set the goal: "([\s\S]*?)"\s*$/m.exec(body);
  const status = /User set goal status: "([a-zA-Z]+)"/.exec(body)?.[1];
  if (set) return `Goal set: ${set[1]}`;
  if (/clear/i.test(body)) return 'Goal cleared';
  if (status === 'paused') return 'Goal paused';
  if (status === 'active') return 'Goal resumed';
  return '';
}
