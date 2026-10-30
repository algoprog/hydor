// Sessions of agents that speak the Agent Client Protocol (Gemini CLI, OpenCode, Goose…) → timeline
// items. ACP agents keep no transcript the app can read, so the app writes one per session under
// DATA_DIR/acp/<id>.jsonl (server/agents/acp.ts): a header, the user's prompts, the agent's
// `session/update` notifications as they came, and the end of each turn.
//
//   {"t":"meta","ts":…,"agent":"gemini","name":"Gemini CLI","cwd":"…","acpSession":"…"}
//   {"t":"prompt","ts":…,"id":"u…","text":"…","images":0}
//   {"t":"update","ts":…,"u":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
//   {"t":"end","ts":…,"stopReason":"end_turn"}
//   {"t":"title","title":"…"}
import type { FileChange, SessionStats, TimelineItem, TodoEntry, ToolCategory, ToolInfo, ToolItem } from '../../shared/types.ts';
import { ActivityLog, clip, emptyStats, firstLine, snippetDiff, wholeFileDiff, type Chunk } from './common.ts';
import type { ParserOptions, SummaryData } from './claude.ts';

type Json = Record<string, any>;

const MAX_OUTPUT = 64 * 1024;

export interface AcpSummary extends SummaryData {
  /** Which ACP agent (its id in the app's list) and its name. */
  acpAgent?: string;
  acpName?: string;
  /** The agent's own id for the session (for session/load). */
  acpSession?: string;
}

const KIND: Record<string, ToolCategory> = {
  read: 'read',
  edit: 'edit',
  delete: 'edit',
  move: 'edit',
  search: 'search',
  execute: 'command',
  fetch: 'web',
  think: 'other',
  switch_mode: 'plan',
  other: 'other',
};

const STATUS: Record<string, ToolInfo['status']> = { pending: 'running', in_progress: 'running', completed: 'ok', failed: 'error' };

/** The text of ACP content blocks (text, resources, links), joined. */
export function acpText(content: unknown): string {
  const list = Array.isArray(content) ? content : content ? [content] : [];
  const out: string[] = [];
  for (const c of list as Json[]) {
    if (!c) continue;
    if (c.type === 'text' && typeof c.text === 'string') out.push(c.text);
    else if (c.type === 'content') out.push(acpText(c.content));
    else if (c.type === 'resource' && typeof c.resource?.text === 'string') out.push(c.resource.text);
    else if (c.type === 'resource_link' && c.uri) out.push(String(c.name ?? c.uri));
    else if (c.type === 'terminal' && c.terminalId) out.push(`[terminal ${c.terminalId}]`);
  }
  return out.join('\n');
}

/** File changes in a tool call's content: ACP sends whole old and new texts per file. */
function acpDiffs(content: unknown): FileChange[] {
  const out: FileChange[] = [];
  for (const c of (Array.isArray(content) ? content : []) as Json[]) {
    if (c?.type !== 'diff' || typeof c.path !== 'string') continue;
    const oldText = typeof c.oldText === 'string' ? c.oldText : null;
    const newText = String(c.newText ?? '');
    const diff = oldText == null ? wholeFileDiff(newText, '+') : snippetDiff(oldText, newText);
    const lines = diff.split('\n');
    out.push({
      path: c.path,
      op: oldText == null ? 'create' : 'edit',
      added: lines.filter((l) => l.startsWith('+')).length,
      removed: lines.filter((l) => l.startsWith('-')).length,
      diff,
    });
  }
  return out;
}

export class AcpParser {
  items: TimelineItem[] = [];
  private index = new Map<string, number>();
  private dirty = new Set<string>();
  stats: SessionStats = emptyStats();
  summary: AcpSummary = {};
  chunks: Chunk[] = [];
  act: ActivityLog | null;
  private seq = 0;
  /** The item agent text and thoughts go on appending to, while nothing else came between. */
  private open: { kind: 'assistant' | 'thinking'; id: string } | null = null;
  private turn: { id: string; start: number; tools: number } | null = null;
  /** ACP has no goals. */
  goal: null = null;

  constructor(private opts: ParserOptions) {
    this.act = opts.collectActivity ? new ActivityLog() : null;
  }

  title(): string | undefined {
    return this.summary.customTitle;
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

  /** The whole file is read again each time (transcripts are small), so there is nothing to keep. */
  toState() {
    return {};
  }

  finish() {}

  endTurn() {}

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

  private get(id: string): TimelineItem | undefined {
    const i = this.index.get(id);
    return i == null ? undefined : this.items[i];
  }

  private chunk(kind: Chunk['kind'], text: string | undefined, ts?: number) {
    if (!this.opts.collectChunks || !text) return;
    const t = text.trim();
    if (t) this.chunks.push({ kind, ts, text: t.length > 4000 ? t.slice(0, 4000) : t });
  }

  feed(line: string) {
    if (line.length < 2) return;
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    const ts = typeof m.ts === 'number' ? m.ts : undefined;
    if (ts) {
      if (!this.summary.createdAt || ts < this.summary.createdAt) this.summary.createdAt = ts;
      if (!this.summary.updatedAt || ts > this.summary.updatedAt) this.summary.updatedAt = ts;
    }
    switch (m.t) {
      case 'meta':
        this.summary.acpAgent = m.agent;
        this.summary.acpName = m.name;
        this.summary.cwd = m.cwd ?? this.summary.cwd;
        this.summary.source = 'acp';
        if (m.acpSession) this.summary.acpSession = m.acpSession;
        if (m.model) this.summary.model = m.model;
        break;
      case 'session':
        if (m.acpSession) this.summary.acpSession = m.acpSession;
        break;
      case 'title':
        if (m.title) this.summary.customTitle = String(m.title);
        break;
      case 'model':
        if (m.model) this.summary.model = String(m.model);
        break;
      case 'note':
        this.open = null;
        if (m.text) this.upsert({ kind: 'system', id: `note${this.seq++}`, seq: 0, ts, level: 'info', text: String(m.text) });
        break;
      case 'prompt': {
        const text = String(m.text ?? '');
        const id = String(m.id ?? `u${this.seq++}`);
        this.open = null;
        this.turn = { id, start: ts ?? Date.now(), tools: 0 };
        this.stats.userMessages++;
        this.act?.bump(ts, 'prompts');
        if (!this.summary.firstPrompt && text) this.summary.firstPrompt = firstLine(text, 300);
        if (text) this.summary.lastPrompt = firstLine(text, 300);
        this.chunk('user', text, ts);
        this.upsert({ kind: 'user', id, seq: 0, ts, text, images: m.images || undefined, turn: id });
        break;
      }
      case 'update':
        this.onUpdate(m.u ?? {}, ts);
        break;
      case 'end': {
        this.open = null;
        const t = this.turn;
        this.turn = null;
        this.stats.turns++;
        this.act?.bump(ts, 'turns');
        const status = m.stopReason === 'cancelled' ? 'interrupted' : m.stopReason === 'end_turn' || m.stopReason === 'max_turn_requests' ? 'completed' : m.error ? 'failed' : 'completed';
        if (m.error) this.upsert({ kind: 'system', id: `err:${t?.id ?? this.seq++}`, seq: 0, ts, level: 'error', text: firstLine(String(m.error), 300), detail: String(m.error) });
        else if (m.stopReason && !['end_turn', 'cancelled'].includes(m.stopReason))
          this.upsert({ kind: 'system', id: `stop:${t?.id ?? this.seq++}`, seq: 0, ts, level: 'warn', text: STOP_TEXT[m.stopReason] ?? `Stopped (${m.stopReason})` });
        this.upsert({ kind: 'turn', id: `turn:${t?.id ?? this.seq++}`, seq: 0, ts, status, durationMs: t && ts ? ts - t.start : undefined, turn: t?.id });
        break;
      }
    }
  }

  private onUpdate(u: Json, ts?: number) {
    const turn = this.turn?.id;
    switch (u.sessionUpdate) {
      case 'agent_message_chunk':
      case 'agent_thought_chunk': {
        const text = acpText(u.content);
        if (!text) return;
        const kind = u.sessionUpdate === 'agent_message_chunk' ? 'assistant' : 'thinking';
        if (this.open?.kind === kind) {
          const it = this.get(this.open.id) as (TimelineItem & { text: string }) | undefined;
          if (it) {
            this.upsert({ ...it, text: it.text + text } as TimelineItem);
            if (kind === 'assistant') this.chunk('assistant', text, ts);
            return;
          }
        }
        const id = `${kind === 'assistant' ? 'a' : 'th'}${this.seq++}`;
        this.open = { kind, id };
        if (kind === 'assistant') {
          this.stats.assistantMessages++;
          this.act?.bump(ts, 'messages');
          this.chunk('assistant', text, ts);
          this.upsert({ kind: 'assistant', id, seq: 0, ts, text, turn });
        } else this.upsert({ kind: 'thinking', id, seq: 0, ts, text, turn });
        return;
      }
      case 'user_message_chunk': {
        // Replayed history (session/load): the user's own words.
        const text = acpText(u.content);
        if (text) this.upsert({ kind: 'user', id: `ur${this.seq++}`, seq: 0, ts, text });
        this.open = null;
        return;
      }
      case 'tool_call': {
        this.open = null;
        const id = String(u.toolCallId ?? `t${this.seq++}`);
        const category = KIND[u.kind] ?? 'other';
        const files = acpDiffs(u.content);
        const out = clip(acpText(u.content), MAX_OUTPUT);
        const tool: ToolInfo = {
          name: String(u.kind ?? 'tool'),
          category,
          title: String(u.title ?? u.kind ?? 'Tool'),
          status: STATUS[u.status] ?? 'running',
          input: u.rawInput,
          output: out.text || undefined,
          truncated: out.truncated || undefined,
          files: files.length ? files : undefined,
          subtitle: Array.isArray(u.locations) && u.locations[0]?.path ? String(u.locations[0].path) : undefined,
        };
        this.stats.toolCalls++;
        this.act?.bump(ts, 'toolCalls');
        if (category === 'command') {
          this.stats.commands++;
          this.act?.bump(ts, 'commands');
          this.chunk('command', tool.title, ts);
        }
        this.countFiles(files, ts);
        this.upsert({ kind: 'tool', id, seq: 0, ts, tool, turn });
        return;
      }
      case 'tool_call_update': {
        const id = String(u.toolCallId ?? '');
        const prev = this.get(id) as ToolItem | undefined;
        if (!prev) return;
        const files = u.content ? acpDiffs(u.content) : [];
        const text = u.content ? acpText(u.content) : '';
        const out = text ? clip(text, MAX_OUTPUT) : null;
        const tool: ToolInfo = {
          ...prev.tool,
          title: u.title ? String(u.title) : prev.tool.title,
          status: u.status ? (STATUS[u.status] ?? prev.tool.status) : prev.tool.status,
          output: out ? out.text || undefined : prev.tool.output,
          truncated: out ? out.truncated || undefined : prev.tool.truncated,
          files: files.length ? files : prev.tool.files,
          input: u.rawInput ?? prev.tool.input,
          category: u.kind ? (KIND[u.kind] ?? prev.tool.category) : prev.tool.category,
        };
        if (files.length && !prev.tool.files) this.countFiles(files, prev.ts);
        this.upsert({ ...prev, tool });
        return;
      }
      case 'plan': {
        this.open = null;
        const todos: TodoEntry[] = (Array.isArray(u.entries) ? u.entries : []).map((e: Json) => ({ text: String(e.content ?? ''), status: String(e.status ?? 'pending') }));
        // One plan per turn, updated in place as the agent works through it.
        const id = `plan:${turn ?? this.seq++}`;
        this.upsert({ kind: 'tool', id, seq: 0, ts, tool: { name: 'plan', category: 'todo', title: 'Plan', status: 'ok', todos }, turn });
        return;
      }
      case 'current_mode_update':
        if (u.currentModeId) this.upsert({ kind: 'system', id: `mode${this.seq++}`, seq: 0, ts, level: 'info', text: `Mode: ${u.currentModeId}` });
        return;
    }
  }

  private countFiles(files: FileChange[], ts?: number) {
    if (!files.length) return;
    this.stats.filesChanged += files.length;
    for (const f of files) {
      this.stats.linesAdded += f.added;
      this.stats.linesRemoved += f.removed;
    }
    this.act?.files(ts, files);
  }
}

const STOP_TEXT: Record<string, string> = {
  max_tokens: 'Stopped: the reply reached its length limit',
  refusal: 'The agent declined to go on',
};
