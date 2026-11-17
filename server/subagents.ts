// Subagents of a session's own program ("program subagents": Claude Code's Agent tool, Codex's spawn_agent), as the
// server shows them: each is a hidden row of the index with its lead as `parent_key`, with its own transcript. What is
// known of one comes from beside that transcript (Claude Code's agent-<id>.meta.json, Codex's first line) and from
// its lead's running agent (a task of its own). They show as Hydor subagents do, but are read-only: they run inside
// their lead and are never messaged, resumed, forked, handed off or deleted here.
import fs from 'node:fs';
import path from 'node:path';
import type { Agent, BackgroundTask, ExternalState, LiveState, SessionSummary } from '../shared/types.ts';
import type { LiveAdapter } from './agents/live.ts';
import { HttpError } from './auth.ts';
import type { DB } from './db.ts';

/** The first part of a Claude Code subagent's key: its transcript's name is agent-<agent id>. */
export const CLAUDE_AGENT_PREFIX = 'claude:agent-';

/** What the helpers need of the session manager. */
export interface Leads {
  db: DB;
  lives: Map<string, { key: string; agent: Agent; cwd: string; adapter: LiveAdapter }>;
  external: { get(key: string): ExternalState | null };
}

/** A subagent's own key: Claude Code's agent id gives claude:agent-<id>, Codex's thread id codex:<id>. */
export const subagentKeyOf = (agent: Agent, id: string) => (agent === 'claude' ? `${CLAUDE_AGENT_PREFIX}${id}` : `codex:${id}`);

/** The id its lead's task has for it (the agent id, the thread id), whatever program it is of; null for a key that is neither. */
export function taskIdOfKey(key: string): string | null {
  if (key.startsWith(CLAUDE_AGENT_PREFIX)) return key.slice(CLAUDE_AGENT_PREFIX.length) || null;
  if (key.startsWith('codex:')) return key.slice(6) || null;
  return null;
}

/** Whether a task of a live agent is a subagent of its program's own, not a command or a monitor. */
export function isAgentTask(agent: Agent, t: BackgroundTask | undefined): t is BackgroundTask {
  if (!t) return false;
  return agent === 'claude' ? t.kind === 'local_agent' || t.kind === 'agent' : agent === 'codex' && t.kind === 'agent';
}

/** A name made of words joined by underscores or dashes, as a person would write it: negotiation_review, Negotiation review. */
export function readableName(name: string): string {
  const t = name.replace(/[_\-\s]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : '';
}

// ---- what is written beside a subagent's transcript -------------------------------------------------------------------

export interface SubagentMeta {
  title?: string;
  type?: string;
}

const caches = { claude: new Map<string, { stamp: string; meta: SubagentMeta | null }>(), codex: new Map<string, { stamp: string; meta: SubagentMeta | null }>() };

function cached(kind: 'claude' | 'codex', file: string, stamp: string, read: () => SubagentMeta | null): SubagentMeta | null {
  const cache = caches[kind];
  const hit = cache.get(file);
  if (hit && hit.stamp === stamp) return hit.meta;
  const meta = read();
  if (cache.size > 2000) cache.clear();
  cache.set(file, { stamp, meta });
  return meta;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

/** A Claude Code subagent's description and kind, from the agent-<id>.meta.json beside its transcript (read again when it changes). */
export function claudeSubagentMeta(transcript: string): SubagentMeta | null {
  const file = transcript.replace(/\.jsonl$/, '.meta.json');
  let st: fs.Stats;
  try {
    st = fs.statSync(file);
  } catch {
    return null;
  }
  return cached('claude', file, String(st.mtimeMs), () => {
    try {
      const m = JSON.parse(fs.readFileSync(file, 'utf8'));
      return { title: text(m.description), type: text(m.agentType) };
    } catch {
      return null;
    }
  });
}

/** The first line of a file, up to a limit (a Codex rollout's first line holds the agent's instructions: long). */
function firstLineOf(file: string, limit = 1 << 20): string | null {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(64 * 1024);
    let out = '';
    let pos = 0;
    while (pos < limit) {
      const n = fs.readSync(fd, buf, 0, buf.length, pos);
      if (n <= 0) break;
      pos += n;
      const chunk = buf.subarray(0, n).toString('utf8');
      const nl = chunk.indexOf('\n');
      if (nl >= 0) return out + chunk.slice(0, nl);
      out += chunk;
    }
    return out.length < limit ? out : null;
  } finally {
    fs.closeSync(fd);
  }
}

/** A Codex child thread's name and kind, from its rollout's first line (session_meta). It never changes, so it is read once per file. */
export function codexSubagentMeta(transcript: string): SubagentMeta | null {
  let st: fs.Stats;
  try {
    st = fs.statSync(transcript);
  } catch {
    return null;
  }
  return cached('codex', transcript, String(st.ino), () => {
    try {
      const line = firstLineOf(transcript);
      const p = line ? JSON.parse(line)?.payload : null;
      if (!p || typeof p !== 'object') return null;
      const spawn = p.source?.subagent?.thread_spawn ?? {};
      const agentPath = text(p.agent_path) ?? text(spawn.agent_path);
      const last = agentPath?.split('/').filter(Boolean).pop();
      return {
        title: last && last !== 'root' ? readableName(last) : undefined,
        type: text(p.agent_role) ?? text(spawn.agent_role) ?? text(p.agent_nickname) ?? text(spawn.agent_nickname),
      };
    } catch {
      return null;
    }
  });
}

/** What the files tell of a program subagent whose transcript is `file`. */
export function subagentMeta(key: string, file: string | null | undefined): SubagentMeta | null {
  if (!file) return null;
  return key.startsWith(CLAUDE_AGENT_PREFIX) ? claudeSubagentMeta(file) : codexSubagentMeta(file);
}

// ---- who leads a subagent, and whether it runs ------------------------------------------------------------------------

/** Where a Claude Code subagent's transcript is while its lead runs here: beside the lead's, in <session id>/subagents/. */
export function claudeSubagentPath(leadTranscript: string, leadSessionId: string, agentId: string): string {
  return path.join(path.dirname(leadTranscript), leadSessionId, 'subagents', `agent-${agentId}.jsonl`);
}

export interface PendingSubagent {
  lead: string;
  task: BackgroundTask;
  /** Its transcript, when the lead's own is known. */
  file: string | null;
}

/** A Claude Code subagent the index has no row for yet, as the live session that started it lists it. */
export function pendingClaudeSubagent(c: Pick<Leads, 'lives'>, key: string): PendingSubagent | null {
  if (!key.startsWith(CLAUDE_AGENT_PREFIX)) return null;
  const id = taskIdOfKey(key)!;
  for (const l of c.lives.values()) {
    if (l.agent !== 'claude') continue;
    const task = l.adapter.tasks.get(id);
    if (!isAgentTask('claude', task)) continue;
    const own = l.adapter.transcriptPath;
    const sid = l.adapter.sessionId ?? l.key.slice(7);
    return { lead: l.key, task, file: own ? claudeSubagentPath(own, sid, id) : null };
  }
  return null;
}

/** The session a program subagent runs in: its row's parent, or the live session that lists it (Claude Code, before it is indexed). Null for any other session. */
export function leadOf(c: Leads, key: string): string | null {
  if (!key.startsWith('claude:') && !key.startsWith('codex:')) return null;
  const r = c.db.prepare('select parent_key from sessions where key = ?').get(key) as { parent_key: string | null } | undefined;
  if (r) return r.parent_key;
  return pendingClaudeSubagent(c, key)?.lead ?? null;
}

const REFUSAL: Record<string, string> = {
  claude: 'This is a Claude Code subagent that runs inside its own session. Talk to it there.',
  codex: 'This is a Codex subagent that runs inside its own session. Talk to it there.',
};

/** Refuses what would run or change a program subagent (a message, resuming, forking, handing it off, deleting it): its lead runs it. */
export function refuseSubagent(c: Leads, key: string): void {
  if (leadOf(c, key)) throw new HttpError(400, REFUSAL[key.slice(0, key.indexOf(':'))] ?? REFUSAL.claude);
}

/** The tasks of a session open in another client that has them (VS Code, a terminal), as the index read them from its transcript. */
export function externalTasks(ext: ExternalState, bgTasks: string | null | undefined): BackgroundTask[] {
  if (!bgTasks) return [];
  try {
    return (JSON.parse(bgTasks) as BackgroundTask[]).filter((t) => !ext.startedAt || (t.startedAt ?? 0) >= ext.startedAt - 5000);
  } catch {
    return [];
  }
}

/**
 * The task that says a program subagent runs: its lead's live agent has it running (the task's id is the agent id, the
 * thread id), or its lead is open in VS Code or a terminal and its transcript lists it running. Null when it does not.
 */
export function runningTask(c: Leads, key: string, lead: string | null): BackgroundTask | null {
  const id = taskIdOfKey(key);
  if (!id || !lead) return null;
  const l = c.lives.get(lead);
  if (l) {
    const t = l.adapter.tasks.get(id);
    return t && t.status === 'running' && !l.adapter.exited ? t : null;
  }
  const ext = c.external.get(lead);
  if (!ext) return null;
  const row = c.db.prepare('select bg_tasks from sessions where key = ?').get(lead) as { bg_tasks: string | null } | undefined;
  return externalTasks(ext, row?.bg_tasks).find((t) => t.id === id && t.status === 'running') ?? null;
}

/** A running subagent as its page shows it: working, since its task began. */
export function workingState(since: number | undefined, fallback: number): LiveState {
  const at = since ?? fallback;
  return { status: 'working', startedAt: at, turnStartedAt: at, pendingApprovals: 0 };
}

/** The live state of a program subagent, when it runs. */
export function subagentLive(c: Leads, key: string, lead: string | null, fallback = 0): LiveState | null {
  const t = runningTask(c, key, lead);
  return t ? workingState(t.startedAt, fallback) : null;
}

const NO_STATS: SessionSummary['stats'] = {
  userMessages: 0,
  assistantMessages: 0,
  toolCalls: 0,
  commands: 0,
  backgroundCommands: 0,
  filesChanged: 0,
  linesAdded: 0,
  linesRemoved: 0,
  turns: 0,
  tokensIn: 0,
  tokensOut: 0,
  tokensCached: 0,
};

/** What is shown of a Claude Code subagent just started, before the index has its transcript: its task's description, its lead's folder. */
export function pendingSummary(c: Leads, key: string): SessionSummary | null {
  const p = pendingClaudeSubagent(c, key);
  if (!p) return null;
  const meta = subagentMeta(key, p.file);
  const lead = c.lives.get(p.lead)!;
  const at = p.task.startedAt ?? lead.adapter.state.startedAt;
  return {
    key,
    agent: 'claude',
    id: key.slice(7),
    title: meta?.title ?? p.task.description,
    cwd: lead.cwd,
    createdAt: at,
    updatedAt: at,
    sizeBytes: 0,
    stats: { ...NO_STATS },
    live: p.task.status === 'running' && !lead.adapter.exited ? workingState(p.task.startedAt, at) : null,
    subagentOf: p.lead,
    subagentType: meta?.type,
    archived: false,
    pinned: false,
    createdByApp: false,
  };
}

/** How many program subagents each session has in the index (one grouped query; the manager keeps the result). */
export function countSubagents(db: DB): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of db.prepare('select parent_key, count(*) as n from sessions where parent_key is not null group by parent_key').all() as { parent_key: string; n: number }[]) out.set(r.parent_key, r.n);
  return out;
}
