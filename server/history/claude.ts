// Claude Code transcript (~/.claude/projects/<project>/<session>.jsonl) -> timeline items.
import type { BackgroundTask, FileChange, GoalInfo, Question, SessionStats, TimelineItem, TodoEntry, ToolInfo, ToolItem } from '../../shared/types.ts';
import {
  ActivityLog,
  addFileStats,
  basename,
  clip,
  emptyStats,
  firstLine,
  hunksToDiff,
  makeFileChange,
  MAX_OUTPUT,
  parseTs,
  snippetDiff,
  GEN_MS_CAP,
  stripWrappers,
  wholeFileDiff,
  type Chunk,
  type Hunk,
} from './common.ts';
import { splitHandoff } from '../handoff.ts';

export interface ParserOptions {
  /** Keep every item (timeline view). The indexer only needs stats and search text. */
  retain: boolean;
  collectChunks: boolean;
  /** Record per-hour activity for the stats page (indexer only). */
  collectActivity?: boolean;
  /** The file is a subagent transcript: its entries are all sidechain entries. */
  sidechain?: boolean;
}

export interface SummaryData {
  id?: string;
  cwd?: string;
  gitBranch?: string;
  aiTitle?: string;
  customTitle?: string;
  firstPrompt?: string;
  lastPrompt?: string;
  model?: string;
  createdAt?: number;
  updatedAt?: number;
  version?: string;
  source?: string;
}

// Line types that carry nothing for the timeline; skipped before JSON.parse.
const SKIP_PREFIXES = [
  '{"type":"api-request',
  '{"type":"file-history',
  '{"type":"atis-latch"',
  '{"type":"frame-link"',
  '{"type":"artifact-',
];

interface ClaudeState {
  stats: SessionStats;
  summary: SummaryData;
  files: Record<string, [number, number]>;
  lastMsgId?: string;
  pending: Record<string, ToolItem>;
  seq: number;
  turn: TurnAcc | null;
  genPrevTs?: number;
  bg?: Record<string, BackgroundTask>;
  bgEnded?: string[];
}

interface TurnAcc {
  id: string;
  start: number;
  last: number;
  tokensIn: number;
  tokensOut: number;
  cacheRead: number;
  model?: string;
  interrupted?: boolean;
}

type Json = Record<string, any>;

export class ClaudeParser {
  items: TimelineItem[] = [];
  private index = new Map<string, number>();
  private dirty = new Set<string>();
  stats: SessionStats = emptyStats();
  summary: SummaryData = {};
  chunks: Chunk[] = [];
  private files: Record<string, [number, number]> = {};
  private lastMsgId?: string;
  private pending = new Map<string, ToolItem>();
  private seq = 0;
  private turn: TurnAcc | null = null;
  /** Timestamp the current reply's generation started from (the prompt or the last tool result). */
  private genPrevTs?: number;
  /** Background tasks started and not reported finished yet (by a notification or a TaskStop). */
  bg = new Map<string, BackgroundTask>();
  /** Recently finished task ids: a quick task's notification can land before the result that started it. */
  private bgEnded: string[] = [];
  /** Activity of the lines parsed in this run (not part of the saved state). */
  act: ActivityLog | null;
  /** The goal set with /goal while it is not met or cleared (from the transcript's goal checks). */
  goal: GoalInfo | null = null;

  constructor(private opts: ParserOptions) {
    this.act = opts.collectActivity ? new ActivityLog() : null;
  }

  static fromState(s: ClaudeState, opts: ParserOptions): ClaudeParser {
    const p = new ClaudeParser(opts);
    p.stats = s.stats;
    p.summary = s.summary;
    p.files = s.files;
    p.lastMsgId = s.lastMsgId;
    p.pending = new Map(Object.entries(s.pending ?? {}));
    p.seq = s.seq ?? 0;
    p.turn = s.turn ?? null;
    p.genPrevTs = s.genPrevTs;
    p.bg = new Map(Object.entries(s.bg ?? {}));
    p.bgEnded = s.bgEnded ?? [];
    return p;
  }

  toState(): ClaudeState {
    // Pending tool calls rarely span a reindex, but keep them so results still match up.
    const pending: Record<string, ToolItem> = {};
    for (const [k, v] of this.pending) pending[k] = { ...v, tool: { ...v.tool, input: undefined, output: undefined } };
    return {
      stats: this.stats,
      summary: this.summary,
      files: this.files,
      lastMsgId: this.lastMsgId,
      pending,
      seq: this.seq,
      turn: this.turn,
      genPrevTs: this.genPrevTs,
      bg: Object.fromEntries(this.bg),
      bgEnded: this.bgEnded,
    };
  }

  title(): string | undefined {
    return this.summary.customTitle || this.summary.aiTitle || undefined;
  }

  /** Call once the file has stopped growing: closes the last turn with its summary row. */
  finish() {
    this.endTurn();
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

  /** Where the line being read starts in the transcript (when the reader knows it). */
  private lineAt?: number;

  feed(line: string, offset?: number) {
    this.lineAt = offset;
    if (line.length < 2) return;
    // Queue entries are not shown, but a finished background task is announced here first.
    if (line.startsWith('{"type":"queue-operation"')) {
      if (line.includes('<task-notification>')) {
        try {
          this.tasksEnded(String(JSON.parse(line).content ?? ''));
        } catch {}
      }
      return;
    }
    for (const p of SKIP_PREFIXES) if (line.startsWith(p)) return;
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    this.handle(m);
  }

  /** Accepts a transcript entry, or a stream-json message (same message shapes, snake_case extras). */
  handle(m: Json) {
    const ts = parseTs(m.timestamp);
    if (ts) {
      if (!this.summary.createdAt || ts < this.summary.createdAt) this.summary.createdAt = ts;
      if (!this.summary.updatedAt || ts > this.summary.updatedAt) this.summary.updatedAt = ts;
    }
    if (m.sessionId && !this.summary.id) this.summary.id = m.sessionId;
    if (m.cwd && !this.summary.cwd) this.summary.cwd = m.cwd;
    if (m.gitBranch) this.summary.gitBranch = m.gitBranch;
    if (m.version) this.summary.version = m.version;
    if (m.entrypoint && !this.summary.source) this.summary.source = m.entrypoint;

    const own = !m.isSidechain || !!this.opts.sidechain;
    switch (m.type) {
      case 'user':
        if (own) this.onUser(m, ts);
        break;
      case 'assistant':
        if (own) this.onAssistant(m, ts);
        break;
      case 'system':
        this.onSystem(m, ts);
        break;
      case 'attachment':
        this.onAttachment(m, ts);
        break;
      case 'ai-title':
        if (m.aiTitle) this.summary.aiTitle = String(m.aiTitle);
        break;
      case 'custom-title':
        if (m.customTitle) this.summary.customTitle = String(m.customTitle);
        break;
      case 'summary':
        if (m.summary && !this.summary.aiTitle) this.summary.aiTitle = String(m.summary);
        break;
      case 'last-prompt':
        if (m.lastPrompt) this.summary.lastPrompt = firstLine(String(m.lastPrompt), 300);
        break;
      case 'cost-state':
        if (typeof m.totalCostUSD === 'number') this.stats.costUsd = m.totalCostUSD;
        break;
    }
  }

  // ---- turns -------------------------------------------------------------

  private startTurn(id: string, ts?: number) {
    this.endTurn();
    this.stats.turns++;
    this.act?.bump(ts, 'turns');
    this.turn = { id, start: ts ?? 0, last: ts ?? 0, tokensIn: 0, tokensOut: 0, cacheRead: 0 };
  }

  /** Closes the running turn with a summary row. Called at the next prompt or by the live layer. */
  endTurn(status?: string) {
    const t = this.turn;
    if (!t) return;
    this.turn = null;
    if (!t.last || t.last <= t.start) return;
    this.stats.workMs = (this.stats.workMs ?? 0) + (t.last - t.start);
    this.upsert({
      kind: 'turn',
      id: `turn:${t.id}`,
      seq: 0,
      ts: t.last,
      status: status ?? (t.interrupted ? 'interrupted' : 'completed'),
      durationMs: t.last - t.start,
      tokens: { input: t.tokensIn, output: t.tokensOut, cacheRead: t.cacheRead },
      model: t.model,
    });
  }

  private touchTurn(ts?: number) {
    if (this.turn && ts && ts > this.turn.last) this.turn.last = ts;
  }

  // ---- user entries --------------------------------------------------------

  private onUser(m: Json, ts?: number) {
    const msg = m.message ?? {};
    const content = msg.content;
    const result = m.toolUseResult ?? m.tool_use_result;

    if (Array.isArray(content) && content.some((b: Json) => b?.type === 'tool_result')) {
      for (const b of content) {
        if (b?.type === 'tool_result') this.onToolResult(b, result, ts);
      }
      this.touchTurn(ts);
      return;
    }

    let text = '';
    let images = 0;
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      for (const b of content) {
        if (b?.type === 'text') text += (text ? '\n' : '') + (b.text ?? '');
        else if (b?.type === 'image') images++;
      }
    }

    const id = m.uuid ?? `u${this.seq++}`;
    if (m.isMeta || m.isCompactSummary) {
      this.onMetaUser(id, text, ts, !!m.isCompactSummary);
      return;
    }

    if (/^\[Request interrupted by user/.test(text.trim())) {
      if (this.turn) this.turn.interrupted = true;
      this.upsert({ kind: 'system', id, seq: 0, ts, level: 'warn', text: 'Interrupted by user' });
      return;
    }

    const slash = text.match(/<command-name>([^<]*)<\/command-name>/);
    if (slash) {
      const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
      const cmd = `${slash[1].trim()}${args ? ' ' + args : ''}`;
      this.upsert({ kind: 'user', id, seq: 0, ts, text: cmd, meta: 'slash' });
      return;
    }
    const local = text.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
    if (local) {
      if (local[1].trim()) this.upsert({ kind: 'user', id, seq: 0, ts, text: local[1].trim(), meta: 'command-output' });
      return;
    }
    if (text.includes('<task-notification>')) {
      this.taskNotification(id, text, ts);
      return;
    }

    const cleaned = stripWrappers(text);
    if (!cleaned.text && !images) return;
    this.prompt(id, cleaned.text, images, ts);
  }

  private prompt(id: string, textIn: string, images: number, ts?: number, meta?: 'queued') {
    const peer = asPeerMessage(textIn);
    if (peer) {
      this.chunk('user', peer.body, ts);
      return this.upsert({ kind: 'user', id, seq: 0, ts, text: peer.body, peer: peer.from });
    }
    // A conversation carried over from another agent: the request is what follows its context.
    const ho = splitHandoff(textIn);
    const text = ho ? ho.request : textIn;
    // A message typed while the agent works joins the running turn.
    if (meta !== 'queued' || !this.turn) this.startTurn(id, ts);
    this.genPrevTs = ts; // the reply after this prompt is generated from here
    this.stats.userMessages++;
    this.act?.bump(ts, 'prompts');
    if (!this.summary.firstPrompt && text) this.summary.firstPrompt = firstLine(text, 300);
    this.summary.lastPrompt = firstLine(text, 300) || this.summary.lastPrompt;
    this.chunk('user', text, ts);
    this.upsert({ kind: 'user', id, seq: 0, ts, text, images: images || undefined, meta, handoff: ho?.handoff, imageAt: images ? this.lineAt : undefined });
  }

  private onMetaUser(id: string, text: string, ts: number | undefined, compactSummary: boolean) {
    if (!text.trim()) return;
    if (compactSummary) {
      this.upsert({ kind: 'system', id, seq: 0, ts, level: 'info', text: 'Conversation summary after compaction', detail: text });
      return;
    }
    if (text.includes('<task-notification>')) return this.taskNotification(id, text, ts);
    if (/^Caveat: The messages below/.test(text) || text.startsWith('<local-command-caveat>')) return;
    // The CLI's instruction to the model when a /goal is set: the goal bar and "Goal set" say it for the user.
    if (text.startsWith('A session-scoped Stop hook is now active')) return;
    // Where the CLI saved a message's pasted images, for the model: the images show with the message.
    if (/^(?:\s*\[Image: source: [^\]\n]*\])+\s*$/.test(text)) return;
    const peer = asPeerMessage(text);
    if (peer) {
      this.chunk('user', peer.body, ts);
      return this.upsert({ kind: 'user', id, seq: 0, ts, text: peer.body, peer: peer.from });
    }
    const notice = text.match(/\[Cross-session (?:idle|delivery) notice\][\s\S]*/);
    if (notice) return this.upsert({ kind: 'system', id, seq: 0, ts, level: 'info', text: firstLine(notice[0], 400), detail: notice[0].length > 400 ? notice[0] : undefined, peer: true });
    const cleaned = stripWrappers(text).text;
    if (!cleaned) return;
    this.upsert({ kind: 'user', id, seq: 0, ts, text: cleaned, meta: 'note' });
  }

  private taskNotification(id: string, text: string, ts?: number) {
    this.tasksEnded(text);
    const tag = (n: string) => text.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1]?.trim();
    const status = tag('status') ?? 'updated';
    const summary = tag('summary') ?? `Task ${tag('task-id') ?? ''}`;
    this.upsert({
      kind: 'system',
      id,
      seq: 0,
      ts,
      level: status === 'failed' ? 'error' : 'info',
      text: `Background task ${status}: ${summary}`,
      detail: tag('result'),
    });
  }

  // ---- assistant entries ---------------------------------------------------

  private onAssistant(m: Json, ts?: number) {
    const msg = m.message ?? {};
    const msgId: string | undefined = msg.id;
    if (msg.model && msg.model !== '<synthetic>') {
      this.summary.model = msg.model;
      if (this.turn) this.turn.model = msg.model;
    }
    // Every block of one API message repeats the same usage; count it once.
    if (msg.usage && msgId && msgId !== this.lastMsgId) {
      const u = msg.usage;
      const input = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      this.stats.tokensIn += input;
      this.stats.tokensOut += u.output_tokens ?? 0;
      this.stats.tokensCached += u.cache_read_input_tokens ?? 0;
      this.act?.bump(ts, 'tokensIn', input);
      this.act?.bump(ts, 'tokensOut', u.output_tokens ?? 0);
      this.act?.bump(ts, 'tokensCached', u.cache_read_input_tokens ?? 0);
      if (this.turn) {
        this.turn.tokensIn += input;
        this.turn.tokensOut += u.output_tokens ?? 0;
        this.turn.cacheRead += u.cache_read_input_tokens ?? 0;
      }
      // Time spent generating this reply (TTFT + decode), from the prompt or the last tool result.
      if ((u.output_tokens ?? 0) > 0 && this.genPrevTs != null && ts != null && ts > this.genPrevTs) {
        const g = Math.min(ts - this.genPrevTs, GEN_MS_CAP);
        this.stats.genMs = (this.stats.genMs ?? 0) + g;
        this.act?.bump(ts, 'genMs', g);
      }
      this.genPrevTs = ts;
    }
    if (msgId) this.lastMsgId = msgId;
    this.touchTurn(ts);

    const blocks: Json[] = Array.isArray(msg.content) ? msg.content : [];
    blocks.forEach((b, i) => {
      const blockIndex = m.apiBlockIndex ?? (blocks.length > 1 ? i : undefined);
      const key = msgId != null && blockIndex != null ? `${msgId}:${blockIndex}` : `${m.uuid ?? 'a' + this.seq++}:${i}`;
      if (b.type === 'text') {
        const text = String(b.text ?? '');
        if (!text.trim()) return;
        if (m.isApiErrorMessage || m.error) {
          this.upsert({ kind: 'system', id: key, seq: 0, ts, level: 'error', text: firstLine(text, 300), detail: text });
          return;
        }
        this.stats.assistantMessages++;
        this.act?.bump(ts, 'messages');
        this.chunk('assistant', text, ts);
        this.upsert({ kind: 'assistant', id: key, seq: 0, ts, text, entry: m.uuid });
      } else if (b.type === 'thinking' || b.type === 'redacted_thinking') {
        this.upsert({
          kind: 'thinking',
          id: key,
          seq: 0,
          ts,
          text: String(b.thinking ?? ''),
          durationMs: typeof m.thinkingDurationMs === 'number' ? m.thinkingDurationMs : undefined,
        });
      } else if (b.type === 'tool_use' || b.type === 'server_tool_use') {
        this.onToolUse(b, ts);
      } else if (b.type === 'web_search_tool_result' || b.type === 'web_fetch_tool_result') {
        this.onServerToolResult(b);
      }
    });
  }

  private onToolUse(b: Json, ts?: number) {
    const id: string = b.id ?? `t${this.seq++}`;
    const tool = describeClaudeTool(String(b.name ?? 'tool'), b.input ?? {});
    if (b.name === 'TaskStop' || b.name === 'KillShell') this.taskEnded(String(b.input?.task_id ?? b.input?.shell_id ?? ''));
    this.stats.toolCalls++;
    this.act?.bump(ts, 'toolCalls');
    if (tool.category === 'command' && (b.name === 'Bash' || b.name === 'Monitor' || b.name === 'PowerShell')) {
      this.stats.commands++;
      this.act?.bump(ts, 'commands');
      if (tool.background) this.stats.backgroundCommands++;
      this.chunk('command', tool.title, ts);
    }
    const item: ToolItem = { kind: 'tool', id, seq: 0, ts, tool };
    this.pending.set(id, item);
    this.upsert(item);
  }

  private onToolResult(b: Json, result: unknown, ts?: number) {
    const id: string = b.tool_use_id;
    const prev = this.pending.get(id) ?? (this.opts.retain ? (this.items[this.index.get(id) ?? -1] as ToolItem | undefined) : undefined);
    if (!prev || prev.kind !== 'tool') return;
    this.pending.delete(id);
    if (ts != null) this.genPrevTs = ts;
    const tool: ToolInfo = { ...prev.tool };
    const text = toolResultText(b.content);
    const isError = !!b.is_error;
    const r = (result && typeof result === 'object' ? result : {}) as Json;

    tool.status = isError ? 'error' : 'ok';
    if (prev.ts && ts) tool.durationMs = ts - prev.ts;

    switch (tool.name) {
      case 'Bash':
      case 'PowerShell': {
        const out = typeof r.stdout === 'string' ? r.stdout + (r.stderr ? (r.stdout ? '\n' : '') + r.stderr : '') : text;
        setOutput(tool, out);
        const ec = text.match(/^(?:Error: )?Exit code (\d+)/);
        tool.exitCode = ec ? Number(ec[1]) : isError ? 1 : 0;
        if (r.interrupted) tool.status = 'interrupted';
        if (r.backgroundTaskId) {
          tool.background = true;
          tool.taskId = r.backgroundTaskId;
          tool.exitCode = null;
          if (!prev.tool.background) this.stats.backgroundCommands++;
        }
        if (r.timedOutAfterMs) tool.subtitle = `${tool.subtitle ? tool.subtitle + ' · ' : ''}moved to background after ${Math.round(r.timedOutAfterMs / 1000)} s`;
        const bed = r.bashEditDiff;
        if (bed && Array.isArray(bed.files) && bed.files.length) {
          tool.files = bed.files.map((f: Json) => makeFileChange(f.filePath, 'edit', hunksToDiff((f.hunks ?? []) as Hunk[])));
        }
        break;
      }
      case 'Edit':
      case 'MultiEdit':
      case 'Write':
      case 'NotebookEdit': {
        setOutput(tool, isError ? text : '');
        if (!isError) {
          const fp = r.filePath ?? r.notebook_path ?? tool.title;
          if (Array.isArray(r.structuredPatch) && r.structuredPatch.length) {
            const op: FileChange['op'] = r.type === 'create' ? 'create' : tool.name === 'Write' ? 'write' : 'edit';
            tool.files = [makeFileChange(fp, op, hunksToDiff(r.structuredPatch as Hunk[]))];
          } else if (r.type === 'create' && typeof r.content === 'string') {
            tool.files = [makeFileChange(fp, 'create', wholeFileDiff(r.content, '+'))];
          }
          // Otherwise keep the preview built from the tool input.
        } else {
          tool.files = undefined;
        }
        break;
      }
      case 'Read': {
        const f = r.file;
        if (f && typeof f === 'object') {
          if (typeof f.content === 'string') setOutput(tool, f.content);
          if (f.numLines != null) {
            const start = f.startLine ?? 1;
            tool.subtitle = `lines ${start}–${start + f.numLines - 1}${f.totalLines ? ` of ${f.totalLines}` : ''}`;
          }
        } else if (r.type === 'image') {
          tool.subtitle = 'image';
        } else setOutput(tool, text);
        break;
      }
      case 'Grep':
      case 'Glob': {
        setOutput(tool, typeof r.content === 'string' && r.content ? r.content : Array.isArray(r.filenames) ? r.filenames.join('\n') : text);
        const n = r.numFiles ?? r.numMatches ?? r.numLines;
        if (n != null) tool.subtitle = `${tool.subtitle ? tool.subtitle + ' · ' : ''}${n} ${r.numFiles != null ? 'files' : 'matches'}`;
        break;
      }
      case 'WebFetch':
        setOutput(tool, typeof r.result === 'string' ? r.result : text);
        if (r.code) tool.subtitle = `${r.code} ${r.codeText ?? ''}`.trim();
        break;
      case 'WebSearch': {
        const lines: string[] = [];
        for (const res of Array.isArray(r.results) ? r.results : []) {
          if (typeof res === 'string') lines.push(res);
          else for (const c of res?.content ?? []) if (c?.url) lines.push(`${c.title ?? c.url}\n  ${c.url}`);
        }
        setOutput(tool, lines.length ? lines.join('\n') : text);
        break;
      }
      case 'Agent':
      case 'Task': {
        const content = Array.isArray(r.content) ? toolResultText(r.content) : text;
        setOutput(tool, content);
        if (r.agentId) tool.agentId = r.agentId;
        if (r.isAsync || r.status === 'async_launched') {
          tool.background = true;
          tool.subtitle = `${tool.subtitle ? tool.subtitle + ' · ' : ''}running in background`;
        }
        if (typeof r.totalDurationMs === 'number') tool.durationMs = r.totalDurationMs;
        break;
      }
      case 'AskUserQuestion':
        if (r.answers && typeof r.answers === 'object') tool.answers = r.answers as Record<string, string>;
        setOutput(tool, text);
        break;
      case 'TodoWrite':
        setOutput(tool, '');
        break;
      case 'SendMessage':
        break; // keep the message text set when the call was described

      default:
        setOutput(tool, text);
    }
    if (isError) {
      tool.error = firstLine(text, 300);
      const reason = blockedReason(text);
      if (reason) tool.blocked = reason;
    } else {
      // Left running in the background: a command, an agent or a monitor.
      const taskId = r.backgroundTaskId ?? (r.status === 'async_launched' ? r.agentId : undefined) ?? (tool.name === 'Monitor' ? r.taskId : undefined);
      if (taskId) this.taskStarted(String(taskId), prev.tool, ts, id);
    }
    if (tool.files) addFileStats(this.files, this.stats, tool.files);
    this.act?.files(ts, tool.files);
    if (tool.files) for (const f of tool.files) this.chunk('file', f.path, ts);
    this.upsert({ ...prev, tool });
  }

  private taskStarted(taskId: string, tool: ToolInfo, ts: number | undefined, toolUseId: string) {
    if (this.bgEnded.includes(taskId)) return;
    const agent = tool.name === 'Agent' || tool.name === 'Task';
    this.bg.set(taskId, {
      id: taskId,
      description: firstLine((agent ? tool.title : tool.subtitle || tool.title) || taskId, 120),
      kind: agent ? 'agent' : tool.name === 'Monitor' ? 'monitor' : 'command',
      status: 'running',
      startedAt: ts,
      toolUseId,
    });
    // Tasks that died unseen with their process must not pile up in the saved state.
    if (this.bg.size > 40) this.bg.delete(this.bg.keys().next().value!);
  }

  /** When a background task began, as the transcript tells: the call that started it, or failing that its launch. */
  taskStart(taskId: string, toolUseId?: string): number | undefined {
    const t = this.bg.get(taskId);
    const i = this.index.get(toolUseId ?? t?.toolUseId ?? '');
    return (i == null ? undefined : this.items[i].ts) ?? t?.startedAt;
  }

  private taskEnded(taskId: string) {
    if (!taskId) return;
    this.bg.delete(taskId);
    if (!this.bgEnded.includes(taskId)) this.bgEnded = [...this.bgEnded.slice(-49), taskId];
  }

  /** A notification with a status (completed, failed, killed, stopped) ends its task; so does an expired monitor. */
  private tasksEnded(text: string) {
    for (const m of text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)) {
      const id = m[1].match(/<task-id>([^<]*)<\/task-id>/)?.[1]?.trim();
      const status = m[1].match(/<status>([^<]*)<\/status>/)?.[1]?.trim();
      if (id && ((status && status !== 'running') || /<event>\s*\[Monitor expired/.test(m[1]))) this.taskEnded(id);
    }
  }

  private onServerToolResult(b: Json) {
    const id = b.tool_use_id;
    const i = this.index.get(id);
    if (i == null) return;
    const prev = this.items[i] as ToolItem;
    const lines = (Array.isArray(b.content) ? b.content : []).map((c: Json) => `${c.title ?? ''}\n  ${c.url ?? ''}`);
    this.upsert({ ...prev, tool: { ...prev.tool, status: 'ok', output: lines.join('\n') } });
  }

  // ---- system / attachments ----------------------------------------------

  private onSystem(m: Json, ts?: number) {
    const id = m.uuid ?? `s${this.seq++}`;
    switch (m.subtype) {
      case 'compact_boundary': {
        const meta = m.compactMetadata ?? m.compact_metadata ?? {};
        const pre = meta.preTokens ?? meta.pre_tokens;
        this.upsert({
          kind: 'system',
          id,
          seq: 0,
          ts,
          level: 'info',
          text: `Conversation compacted${meta.trigger ? ` (${meta.trigger})` : ''}${pre ? ` · ${Math.round(pre / 1000)}k tokens before` : ''}`,
        });
        break;
      }
      case 'api_error': {
        const e = m.error ?? {};
        const retry = m.retryAttempt ? ` · retry ${m.retryAttempt}/${m.maxRetries ?? '?'}` : '';
        this.upsert({
          kind: 'system',
          id,
          seq: 0,
          ts,
          level: 'error',
          text: `${e.formatted ?? e.message ?? 'API error'}${retry}`,
        });
        break;
      }
      case 'local_command':
        if (m.content) this.upsert({ kind: 'user', id, seq: 0, ts, text: String(m.content).replace(/<\/?local-command-stdout>/g, ''), meta: 'command-output' });
        if (/^(<local-command-stdout>)?Goal cleared/.test(String(m.content ?? ''))) this.goal = null;
        break;
      case 'informational':
      case 'warning':
        if (m.content) this.upsert({ kind: 'system', id, seq: 0, ts, level: m.level === 'error' ? 'error' : 'info', text: String(m.content) });
        break;
    }
  }

  private onAttachment(m: Json, ts?: number) {
    const a = m.attachment ?? {};
    if (a.type === 'goal_status') {
      // Set (a sentinel), then checked after each turn until met; a met goal clears itself.
      const objective = String(a.condition ?? '');
      if (a.met) {
        this.goal = null;
        this.upsert({ kind: 'system', id: m.uuid ?? `goal${this.seq++}`, seq: 0, ts, level: 'info', text: `Goal met: ${objective}`, detail: a.reason ? String(a.reason) : undefined });
      } else this.goal = { objective, status: 'active', turns: a.sentinel ? 0 : Number(a.iterations) || undefined, reason: a.sentinel || !a.reason ? undefined : String(a.reason) };
      return;
    }
    if (a.type === 'queued_command' && a.commandMode === 'task-notification') {
      this.tasksEnded(typeof a.prompt === 'string' ? a.prompt : JSON.stringify(a.prompt ?? ''));
      return;
    }
    if (a.type === 'queued_command' && (a.commandMode === 'prompt' || a.humanTurn)) {
      const text = Array.isArray(a.prompt)
        ? a.prompt.filter((b: Json) => b?.type === 'text').map((b: Json) => b.text).join('\n')
        : String(a.prompt ?? '');
      const images = Array.isArray(a.prompt) ? a.prompt.filter((b: Json) => b?.type === 'image').length : 0;
      const cleaned = stripWrappers(text).text;
      if (cleaned || images) this.prompt(m.uuid ?? a.source_uuid ?? `q${this.seq++}`, cleaned, images, ts, 'queued');
    }
  }
}

// ---- helpers -----------------------------------------------------------

/**
 * A tool_result error where the agent's own guard refused the command — not a failure of the command
 * itself. The user can approve a refused command and re-send it. Returns the short reason, or ''.
 */
function blockedReason(text: string): string {
  const m = text.match(/denied by the Claude Code auto mode classifier\.\s*Reason:\s*\[([^\]]+)\]/i);
  if (m) return m[1].trim();
  if (/denied by the Claude Code auto mode classifier/i.test(text)) return 'Auto mode';
  if (/denied by a built-in Claude Code safety check/i.test(text)) return 'Safety check';
  return '';
}

/** Pulls the sender and body out of a message that is entirely a delivered cross-session block (not a human quoting one). */
function asPeerMessage(text: string): { from: { name?: string; mode?: string; address?: string }; body: string } | null {
  const t = text
    .trim()
    .replace(/^Another Claude session sent a message[^\n]*\n/, '')
    .trim();
  if (!t.startsWith('<cross-session-message')) return null;
  // The block sits at the start; a delivered message appends harness guidance after it, which we drop.
  const m = t.match(/^<cross-session-message\b([^>]*)>([\s\S]*?)<\/cross-session-message>/);
  if (!m) return null;
  const attr = (n: string) => m[1].match(new RegExp(`${n}="([^"]*)"`))?.[1];
  return { from: { name: attr('from-name'), mode: attr('from-mode'), address: attr('from') }, body: m[2].trim() };
}

function setOutput(tool: ToolInfo, text: string) {
  const c = clip(text, MAX_OUTPUT);
  tool.output = c.text || undefined;
  if (c.truncated) {
    tool.truncated = true;
    tool.outputBytes = c.bytes;
  }
}

export function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const c of content as Json[]) {
    if (c?.type === 'text') parts.push(String(c.text ?? ''));
    else if (c?.type === 'image') parts.push('[image]');
    else if (c?.type === 'tool_reference') parts.push(`[tool: ${c.tool_name ?? ''}]`);
  }
  return parts.join('\n');
}

function todosFrom(list: unknown): TodoEntry[] {
  if (!Array.isArray(list)) return [];
  return list.map((t: Json) => ({ text: String(t.content ?? t.activeForm ?? t.text ?? ''), status: String(t.status ?? 'pending') }));
}

export function questionsFrom(list: unknown): Question[] {
  if (!Array.isArray(list)) return [];
  return list.map((q: Json, i: number) => ({
    id: String(q.question ?? i),
    header: q.header,
    question: String(q.question ?? ''),
    multiSelect: !!q.multiSelect,
    options: Array.isArray(q.options) ? q.options.map((o: Json) => ({ label: String(o.label ?? ''), description: o.description })) : [],
    allowOther: true,
  }));
}

/** Maps a Claude Code tool call to the generic tool shape shown in the timeline. */
export function describeClaudeTool(name: string, input: Json): ToolInfo {
  const base = { name, status: 'running' as const, input };
  const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v));
  switch (name) {
    case 'Bash':
    case 'PowerShell':
      return { ...base, category: 'command', title: s(input.command), subtitle: input.description, label: s(input.description) || undefined, background: !!input.run_in_background, input: undefined };
    case 'Monitor':
      return { ...base, category: 'command', title: s(input.command), subtitle: input.description ?? 'monitor', label: s(input.description) || undefined, background: true, input: undefined };
    case 'BashOutput':
    case 'TaskOutput':
      return { ...base, category: 'command', title: `Read output of ${s(input.bash_id ?? input.task_id ?? input.shell_id)}`, subtitle: 'background task' };
    case 'KillShell':
    case 'TaskStop':
      return { ...base, category: 'command', title: `Stop task ${s(input.shell_id ?? input.task_id)}` };
    case 'Read': {
      const range = input.offset || input.limit ? `from line ${input.offset ?? 1}${input.limit ? `, ${input.limit} lines` : ''}` : undefined;
      return { ...base, category: 'read', title: s(input.file_path), subtitle: range };
    }
    case 'Edit':
      return {
        ...base,
        category: 'edit',
        title: s(input.file_path),
        files: [makeFileChange(s(input.file_path), 'edit', snippetDiff(s(input.old_string), s(input.new_string)))],
        input: { replace_all: input.replace_all },
      };
    case 'MultiEdit': {
      const edits: Json[] = Array.isArray(input.edits) ? input.edits : [];
      const diff = edits.map((e) => snippetDiff(s(e.old_string), s(e.new_string))).join('\n');
      return { ...base, category: 'edit', title: s(input.file_path), subtitle: `${edits.length} edits`, files: [makeFileChange(s(input.file_path), 'edit', diff)], input: undefined };
    }
    case 'Write':
      return {
        ...base,
        category: 'edit',
        title: s(input.file_path),
        files: [makeFileChange(s(input.file_path), 'write', wholeFileDiff(s(input.content), '+'))],
        input: undefined,
      };
    case 'NotebookEdit':
      return { ...base, category: 'edit', title: s(input.notebook_path), subtitle: input.edit_mode ?? 'edit cell' };
    case 'Grep':
      return {
        ...base,
        category: 'search',
        title: s(input.pattern),
        subtitle: [input.path && basename(s(input.path)), input.glob, input.type, input.output_mode].filter(Boolean).join(' · ') || undefined,
      };
    case 'Glob':
      return { ...base, category: 'search', title: s(input.pattern), subtitle: input.path ? basename(s(input.path)) : undefined };
    case 'WebSearch':
      return { ...base, category: 'web', title: s(input.query) };
    case 'WebFetch':
      return { ...base, category: 'web', title: s(input.url), subtitle: input.prompt ? firstLine(s(input.prompt), 120) : undefined };
    case 'SendMessage': {
      const to = s(input.to);
      const name = /^[\w.-]{1,40}$/.test(to) ? to : 'another session';
      return { ...base, category: 'message', title: firstLine(s(input.message), 200) || s(input.summary) || 'Message', subtitle: `to ${name}`, output: s(input.message) || undefined, input: undefined };
    }
    case 'Agent':
    case 'Task':
      return {
        ...base,
        category: 'task',
        title: s(input.description) || 'Subagent',
        subtitle: input.subagent_type,
        background: !!input.run_in_background,
      };
    case 'TodoWrite':
      return { ...base, category: 'todo', title: 'Updated the plan', todos: todosFrom(input.todos), input: undefined };
    case 'AskUserQuestion': {
      const qs = questionsFrom(input.questions);
      return { ...base, category: 'question', title: qs[0]?.question ?? 'Question', questions: qs, input: undefined };
    }
    case 'ExitPlanMode':
      return { ...base, category: 'plan', title: 'Proposed a plan', input: { plan: input.plan } };
    case 'EnterPlanMode':
      return { ...base, category: 'plan', title: 'Entered plan mode' };
    case 'Skill':
      return { ...base, category: 'other', title: `Skill ${s(input.skill)}`, subtitle: input.args ? firstLine(s(input.args), 120) : undefined };
    case 'ToolSearch':
      return { ...base, category: 'other', title: `Tool search: ${s(input.query)}` };
    default:
      if (name.startsWith('mcp__')) {
        const [, server, ...rest] = name.split('__');
        return { ...base, category: 'mcp', title: `${server} · ${rest.join('__')}` };
      }
      return { ...base, category: 'other', title: name };
  }
}
