import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Agent, AgentCatalog, AgentUsage, BackgroundTask, ExternalState, LiveOverlay, LiveState, NotifyEvent, PullRequestInfo, QueuedMessage, SessionPrefs, SessionSummary, TimelineItem, WorktreeInfo } from '../shared/types.ts';
import { ClaudeLive, CLAUDE_MODES, claudeSpec } from './agents/claude.ts';
import { CodexLive, codexEnv, CODEX_MODES, codexSpec } from './agents/codex.ts';
import { ClaudeControl, claudeUsage, CodexControl, mergeCodexSnapshot } from './agents/control.ts';
import type { ApprovalAnswer, ImageInput, LiveAdapter, LiveConfig, ModelCall } from './agents/live.ts';
import { HttpError } from './auth.ts';
import { config, paths } from './config.ts';
import type { DB } from './db.ts';
import { kvGet, kvSet } from './db.ts';
import { agentBaseEnv } from './env.ts';
import { ExternalWatcher } from './external.ts';
import { keptOfTranscript, type Indexer } from './indexer/index.ts';
import { forget as forgetKept } from './indexer/kept.ts';
import { Runner, type RunMeta } from './runner/client.ts';
import { buildHandoff, splitHandoff } from './handoff.ts';
import { ClaudeParser } from './history/claude.ts';
import { Timeline } from './timeline.ts';
import { removeSessionScratch } from './tasklog.ts';
import { checkpoint, createWorktree, removeWorktree, restoreCheckpoint, worktreeState } from './worktrees.ts';
import { pageServerUrl, runToken } from './mcp.ts';
import { beforeSend, featureDeps, messageNotes, spawnAdditions, turnEnded } from './features/registry.ts';
import { dropNotes } from './notes.ts';
import { parseExtra, sessionExtra, setSessionExtra } from './sessionExtra.ts';
import type { SessionExtra } from '../shared/features.ts';
import { approvalKind, quickAnswer, type InboxItem } from '../shared/inbox.ts';
import { accountById, accountEnv, accountOfPath, accountPool, autoSwitchOn, claudeTranscriptOf, historyMoves, moveAcross } from './accounts.ts';
import { AcpLive, acpAgent, acpAgents, acpSessionOf, acpTranscriptPath, ACP_DIR, CONSOLE_ID, findCommand } from './agents/acp.ts';
import { ensureClaude, ensureCommand } from './clients.ts';
import { customTurnBefore, prepareCustomFork, restoreCustomFiles } from './custom/fork.ts';
import { customGoal } from './custom/goal.ts';
import { titleFor } from './titles.ts';
import { isConfidential } from '../shared/confidential.ts';
import { carriedExtra, checkHandoff, checkModelSwitch, confidentialStart, confidentialTitle, localModel } from './confidential/index.ts';

/** The agent a session key names ("claude:…", "codex:…", "acp:…"). */
export const agentOfKey = (key: string): Agent => (key.startsWith('codex:') ? 'codex' : key.startsWith('acp:') ? 'acp' : 'claude');

function parseJson<T>(v: string | null | undefined): T | undefined {
  if (!v) return undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
}

/** Deletes attachment copies (only ones in the uploads folder), and folders they leave empty. */
function removeUploads(files: string[]) {
  for (const f of files) {
    const p = path.resolve(f);
    if (!p.startsWith(paths.uploads + path.sep)) continue;
    fs.rmSync(p, { force: true });
    const dir = path.dirname(p);
    if (dir !== paths.uploads) {
      try {
        fs.rmdirSync(dir);
      } catch {}
    }
  }
}

interface Row {
  key: string;
  agent: Agent;
  id: string;
  path: string;
  size: number;
  cwd: string | null;
  git_branch: string | null;
  title: string | null;
  first_prompt: string | null;
  last_prompt: string | null;
  model: string | null;
  source: string | null;
  created_at: number | null;
  updated_at: number | null;
  user_msgs: number;
  assistant_msgs: number;
  tool_calls: number;
  commands: number;
  bg_commands: number;
  files_changed: number;
  lines_added: number;
  lines_removed: number;
  turns: number;
  tokens_in: number;
  tokens_out: number;
  tokens_cached: number;
  cost_usd: number | null;
  gen_ms: number;
  work_ms: number;
  bg_tasks: string | null;
  parent_key: string | null;
  // app_sessions
  app_title: string | null;
  app_cwd: string | null;
  app_agent: Agent | null;
  app_first_prompt: string | null;
  archived: number | null;
  pinned: number | null;
  created_by_app: number | null;
  pref_model: string | null;
  pref_effort: string | null;
  pref_mode: string | null;
  sort_order: number | null;
  handoff_from: string | null;
  handoff_to: string | null;
  done_at: number | null;
  seen_at: number | null;
  fork_from: string | null;
  snooze_until: number | null;
  worktree: string | null;
  pr: string | null;
  account: string | null;
  acp_agent: string | null;
  extra: string | null;
  app_created: number | null;
  app_updated: number | null;
}

const SELECT = `
  select s.key, s.agent, s.id, s.path, s.size, s.cwd, s.git_branch, s.title, s.first_prompt, s.last_prompt, s.model, s.source,
    s.created_at, s.updated_at, s.user_msgs, s.assistant_msgs, s.tool_calls, s.commands, s.bg_commands, s.files_changed,
    s.lines_added, s.lines_removed, s.turns, s.tokens_in, s.tokens_out, s.tokens_cached, s.cost_usd, s.gen_ms, s.work_ms, s.bg_tasks, s.parent_key,
    a.title as app_title, a.cwd as app_cwd, a.agent as app_agent, a.first_prompt as app_first_prompt, a.archived, a.pinned,
    a.created_by_app, a.model as pref_model, a.effort as pref_effort, a.mode as pref_mode, a.created_at as app_created,
    a.updated_at as app_updated, a.sort_order, a.handoff_from, a.handoff_to, a.done_at, a.seen_at, a.fork_from, a.snooze_until, a.worktree, a.pr, a.account, a.acp_agent, a.extra
  from sessions s left join app_sessions a on a.key = s.key`;

const SELECT_APP_ONLY = `
  select a.key, a.agent, substr(a.key, instr(a.key, ':') + 1) as id, null as path, 0 as size, a.cwd, null as git_branch,
    null as title, a.first_prompt, null as last_prompt, a.model, 'web' as source, a.created_at, a.updated_at,
    0 as user_msgs, 0 as assistant_msgs, 0 as tool_calls, 0 as commands, 0 as bg_commands, 0 as files_changed,
    0 as lines_added, 0 as lines_removed, 0 as turns, 0 as tokens_in, 0 as tokens_out, 0 as tokens_cached, null as cost_usd,
    0 as gen_ms, 0 as work_ms, null as bg_tasks, null as parent_key, a.title as app_title, a.cwd as app_cwd, a.agent as app_agent, a.first_prompt as app_first_prompt, a.archived, a.pinned,
    a.created_by_app, a.model as pref_model, a.effort as pref_effort, a.mode as pref_mode, a.created_at as app_created,
    a.updated_at as app_updated, a.sort_order, a.handoff_from, a.handoff_to, a.done_at, a.seen_at, a.fork_from, a.snooze_until, a.worktree, a.pr, a.account, a.acp_agent, a.extra
  from app_sessions a where not exists (select 1 from sessions s where s.key = a.key)`;

/** A non-image attachment: saved under uploads/ and listed by path in the message. */
export interface FileInput {
  name: string;
  /** Base64 contents. */
  data: string;
}

type Phase = 'working' | 'waiting' | 'idle' | 'error' | 'off';

/** Where a session stands for notifications: running here, running elsewhere, or not running. */
function phaseOf(s: SessionSummary): Phase {
  const l = s.live;
  if (l && l.status !== 'exited') return l.status === 'error' ? 'error' : l.status === 'waiting' ? 'waiting' : l.status === 'working' ? 'working' : 'idle';
  if (s.external) return s.external.status;
  return 'off';
}

export interface CreateOpts {
  agent: Agent;
  cwd: string;
  prompt?: string;
  images?: ImageInput[];
  files?: FileInput[];
  /** Files and folders already on this computer (picked in Files): named in the message, pictures shown to the model too. */
  paths?: string[];
  model?: string;
  effort?: string;
  mode?: string;
  title?: string;
  /** Remember the model, effort and mode for the next new session (not for scheduled runs). */
  remember?: boolean;
  /** Work in a new worktree of the folder's repository, on a branch of its own. */
  worktree?: boolean;
  /** Run as an added account of the agent (Settings → Accounts); the CLI's own when missing. */
  account?: string;
  /** For agent 'acp': which agent of Settings → More agents. */
  acpAgent?: string;
  /** Settings beyond the agent's own (memory, assistant, spending cap…). */
  extra?: SessionExtra;
}

interface Live {
  key: string;
  agent: Agent;
  cwd: string;
  adapter: LiveAdapter;
  runner: Runner;
  /** An added account the agent runs as (Settings → Accounts); none for the CLI's own. */
  account?: string;
  /** For an ACP agent: which one (Custom's id is "console"). */
  acpAgent?: string;
}

/** Lists saved attachments at the end of a message; the agent opens them by path. */
function withFiles(text: string, files: string[]): string {
  if (!files.length) return text;
  return `${text ? `${text}\n\n` : ''}Attached files:\n${files.map((f) => `- ${f}`).join('\n')}`;
}

/**
 * What the capabilities have for the agent with this message (the user changed a page), ahead of it in a
 * <system-reminder>, which the conversation does not show. A command ("/goal …") goes as it is.
 */
async function withNotes(key: string, text: string, said = text): Promise<string> {
  if (text.trimStart().startsWith('/')) return text;
  const notes = await messageNotes(key, said);
  return notes ? `<system-reminder>\n${notes}\n</system-reminder>\n\n${text}` : text;
}

/** What models take as pictures, by a file's extension. */
const PICTURES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

/**
 * Files and folders on this computer a message names (picked in Files, not uploaded): each by its path, a
 * folder with a slash at its end, and pictures up to 5 MB shown to the model as well. Those gone are left out.
 */
export function onThisComputer(list: unknown): { paths: string[]; images: ImageInput[] } {
  const out = { paths: [] as string[], images: [] as ImageInput[] };
  for (const p of (Array.isArray(list) ? list : []).slice(0, 20)) {
    if (typeof p !== 'string' || !p.trim()) continue;
    const abs = path.resolve(p.trim().replace(/^~(?=\/|$)/, os.homedir()));
    let st: fs.Stats;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (out.paths.includes(abs) || out.paths.includes(`${abs}/`)) continue;
    out.paths.push(st.isDirectory() ? `${abs}/` : abs);
    const type = PICTURES[path.extname(abs).slice(1).toLowerCase()];
    if (type && st.isFile() && st.size <= 5 * 1024 * 1024 && out.images.length < 8) {
      try {
        out.images.push({ mediaType: type, data: fs.readFileSync(abs).toString('base64'), name: path.basename(abs) });
      } catch {}
    }
  }
  return out;
}

function alive(pid: number): boolean {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat[stat.lastIndexOf(')') + 2] !== 'Z';
  } catch {
    return false;
  }
}

/** SIGTERM, then SIGKILL if the process is still there after a few seconds. */
async function endProcess(pid: number) {
  const wait = async (ms: number) => {
    for (const end = Date.now() + ms; Date.now() < end; ) {
      if (!alive(pid)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return !alive(pid);
  };
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  if (await wait(5000)) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
  await wait(2000);
}

export class SessionManager extends EventEmitter {
  lives = new Map<string, Live>();
  private timelines = new Map<string, Timeline>();
  private liveTimers = new Map<string, NodeJS.Timeout>();
  private pendingSummaries = new Set<string>();
  private summaryTimer: NodeJS.Timeout | null = null;
  /** Sessions running in VS Code or a terminal (not started here). */
  external: ExternalWatcher;

  constructor(
    private db: DB,
    private indexer: Indexer,
    private claude: ClaudeControl,
    private codex: CodexControl,
  ) {
    super();
    indexer.on('updated', ({ keys, removed }: { keys: string[]; removed: string[] }) => {
      for (const k of keys) this.pendingSummaries.add(k);
      this.flushSummaries();
      if (removed.length) this.emit('sessions', [], removed);
    });
    setInterval(() => this.reapIdle(), 5 * 60_000).unref();
    setInterval(() => this.wakeSnoozed(), 30_000).unref();
    db.exec('create table if not exists checkpoints (key text not null, at integer not null, commit_id text not null); create index if not exists checkpoints_key on checkpoints (key, at);');
    setInterval(() => this.sweepTimelines(), 60_000).unref();
    this.external = new ExternalWatcher(
      (key) => this.lives.has(key),
      (key) => this.transcriptFor(key),
    );
    this.external.on('change', (keys: string[]) => {
      for (const k of keys) {
        const tl = this.timelines.get(k);
        if (tl && !this.lives.has(k)) {
          // Running elsewhere: keep the last turn open; once it stops, close it.
          if (this.external.get(k)) tl.reopen();
          else tl.readMore().then(() => tl.finish()).catch(() => {});
        }
        this.queueSummary(k);
      }
    });
    this.external.start();
  }

  // ---- startup ---------------------------------------------------------------

  /** Reconnects to agents started before this server process. */
  async restore() {
    for (const runner of Runner.discover()) {
      if (!runner.isAlive()) {
        runner.cleanup();
        continue;
      }
      const meta = runner.meta;
      const opts = meta.opts as Record<string, any>;
      const adapter: LiveAdapter =
        meta.agent === 'acp'
          ? new AcpLive(runner, { ...(opts as any), acpSession: acpSessionOf(String(opts.transcript)) })
          : meta.agent === 'claude'
            ? new ClaudeLive(runner, { cwd: meta.cwd, sessionId: String(opts.sessionId), resume: true, model: opts.model, effort: opts.effort, mode: opts.mode })
            : new CodexLive(runner, { cwd: meta.cwd, threadId: opts.threadId, model: opts.model, effort: opts.effort, mode: opts.mode });
      const key = meta.key ?? (meta.agent === 'claude' ? `claude:${opts.sessionId}` : undefined);
      try {
        await runner.connect();
      } catch (e) {
        console.warn(`[restore] ${meta.runId}: ${(e as Error).message}`);
        continue;
      }
      const k = key ?? (adapter.sessionId ? `codex:${adapter.sessionId}` : undefined);
      if (!k || runner.exit) {
        runner.cleanup();
        continue;
      }
      this.attach({ key: k, agent: meta.agent, cwd: meta.cwd, adapter, runner, account: opts.account || undefined });
      if (adapter instanceof AcpLive) adapter.restored();
      console.log(`[restore] reattached ${k} (${adapter.state.status})`);
    }
  }

  // ---- listing ---------------------------------------------------------------

  private rowToSummary(r: Row): SessionSummary {
    const live = this.lives.get(r.key);
    const agent = (r.agent ?? r.app_agent) as Agent;
    const title = r.app_title || r.title || r.first_prompt || r.app_first_prompt || 'New session';
    const prefs: SessionPrefs | undefined =
      r.pref_model || r.pref_effort || r.pref_mode ? { model: r.pref_model ?? undefined, effort: r.pref_effort ?? undefined, mode: r.pref_mode ?? undefined } : undefined;
    return {
      key: r.key,
      agent,
      id: r.id,
      title: title.length > 200 ? title.slice(0, 199) + '…' : title,
      firstPrompt: r.first_prompt ?? r.app_first_prompt ?? undefined,
      lastPrompt: r.last_prompt ?? undefined,
      cwd: r.cwd ?? r.app_cwd ?? undefined,
      gitBranch: r.git_branch ?? undefined,
      model: live?.adapter.state.model ?? r.model ?? undefined,
      source: r.source ?? undefined,
      createdAt: r.created_at ?? r.app_created ?? undefined,
      updatedAt: Math.max(r.updated_at ?? 0, r.app_updated ?? 0, live ? live.adapter.lastActivity : 0) || undefined,
      sizeBytes: r.size,
      stats: {
        userMessages: r.user_msgs,
        assistantMessages: r.assistant_msgs,
        toolCalls: r.tool_calls,
        commands: r.commands,
        backgroundCommands: r.bg_commands,
        filesChanged: r.files_changed,
        linesAdded: r.lines_added,
        linesRemoved: r.lines_removed,
        turns: r.turns,
        tokensIn: r.tokens_in,
        tokensOut: r.tokens_out,
        tokensCached: r.tokens_cached,
        costUsd: r.cost_usd ?? undefined,
        genMs: r.gen_ms || undefined,
        workMs: r.work_ms || undefined,
      },
      live: live ? { ...live.adapter.state } : null,
      external: live ? null : this.externalState(r),
      archived: !!r.archived,
      pinned: !!r.pinned,
      order: r.sort_order ?? undefined,
      handoffFrom: r.handoff_from ?? undefined,
      handoffTo: r.handoff_to ?? undefined,
      forkFrom: r.fork_from ?? undefined,
      doneAt: r.done_at ?? undefined,
      seenAt: r.seen_at ?? undefined,
      snoozedUntil: r.snooze_until && r.snooze_until > Date.now() ? r.snooze_until : undefined,
      worktree: parseJson<WorktreeInfo>(r.worktree),
      pr: parseJson<PullRequestInfo>(r.pr),
      account: r.account ?? accountOfPath(this.db, r.path) ?? undefined,
      acpAgent: r.acp_agent ?? undefined,
      extra: r.extra ? parseExtra(r.extra) : undefined,
      acpName: r.acp_agent ? (acpAgents(this.db).find((a) => a.id === r.acp_agent)?.name ?? r.acp_agent) : undefined,
      // A live Codex session knows its goal first-hand; otherwise the transcript tells.
      goal: (live && r.key.startsWith('codex:') ? live.adapter.state.goal : this.timelines.get(r.key)?.goal()) ?? undefined,
      resumeAt: this.resumeLookup?.(r.key),
      ...this.queueOf(r.key),
      createdByApp: !!r.created_by_app,
      prefs,
    };
  }

  /** A session open elsewhere, with the background tasks its current process started (earlier runs' died with them). */
  private externalState(r: Row): ExternalState | null {
    const ext = this.external.get(r.key);
    if (!ext || !r.bg_tasks) return ext;
    let tasks: BackgroundTask[] = [];
    try {
      tasks = (JSON.parse(r.bg_tasks) as BackgroundTask[]).filter((t) => !ext.startedAt || (t.startedAt ?? 0) >= ext.startedAt - 5000);
    } catch {}
    return tasks.length ? { ...ext, backgroundTasks: tasks } : ext;
  }

  list(o: { agent?: string; archived?: boolean; limit?: number; offset?: number; cwd?: string }): { sessions: SessionSummary[]; total: number } {
    const where: string[] = ['s.hidden = 0'];
    const args: unknown[] = [];
    if (o.agent === 'claude' || o.agent === 'codex' || o.agent === 'acp') {
      where.push('s.agent = ?');
      args.push(o.agent);
    }
    where.push(o.archived ? 'coalesce(a.archived, 0) = 1' : 'coalesce(a.archived, 0) = 0');
    if (o.cwd) {
      where.push('s.cwd = ?');
      args.push(o.cwd);
    }
    const limit = Math.min(Math.max(o.limit ?? 200, 1), 1000);
    const offset = Math.max(o.offset ?? 0, 0);
    const rows = this.db
      .prepare(`${SELECT} where ${where.join(' and ')} order by coalesce(s.updated_at, 0) desc limit ? offset ?`)
      .all(...args, limit, offset) as Row[];
    const total = (this.db.prepare(`select count(*) as n from sessions s left join app_sessions a on a.key = s.key where ${where.join(' and ')}`).get(...args) as { n: number }).n;
    let sessions = rows.map((r) => this.rowToSummary(r));
    if (offset === 0 && !o.archived) {
      // Sessions started here that the indexer has not seen yet.
      const fresh = (this.db.prepare(SELECT_APP_ONLY).all() as Row[])
        .filter((r) => !o.agent || r.app_agent === o.agent)
        .filter((r) => !r.archived)
        .map((r) => this.rowToSummary(r));
      sessions = [...fresh, ...sessions];
    }
    // Live sessions float to the top with their current activity time.
    sessions.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return { sessions, total: total + (sessions.length - rows.length) };
  }

  private row(key: string): Row | undefined {
    return (this.db.prepare(`${SELECT} where s.key = ?`).get(key) as Row | undefined) ?? (this.db.prepare(`${SELECT_APP_ONLY} and a.key = ?`).get(key) as Row | undefined);
  }

  /** Commands agents ran in the sessions loaded now (open, live or lately viewed), for terminal suggestions. */
  loadedCommands(): { cmd: string; cwd: string; ts: number }[] {
    const out: { cmd: string; cwd: string; ts: number }[] = [];
    for (const [key, tl] of this.timelines) {
      const cwd = this.summary(key)?.cwd ?? '';
      for (const it of tl.parser.items) if (it.kind === 'tool' && it.tool.category === 'command') out.push({ cmd: it.tool.title, cwd: it.tool.cwd ?? cwd, ts: it.ts ?? 0 });
    }
    return out;
  }

  summary(key: string): SessionSummary | null {
    const r = this.row(key);
    return r ? this.rowToSummary(r) : null;
  }

  queueSummary(key: string) {
    this.pendingSummaries.add(key);
    this.flushSummaries();
  }

  private flushSummaries() {
    if (this.summaryTimer) return;
    this.summaryTimer = setTimeout(() => {
      this.summaryTimer = null;
      const out: SessionSummary[] = [];
      for (const k of this.pendingSummaries) {
        const r = this.row(k);
        // Subagent transcripts and Codex child threads are indexed, but list under their parent, not on their own.
        if (r && (!r.parent_key || this.lives.has(k))) out.push(this.rowToSummary(r));
      }
      this.pendingSummaries.clear();
      if (out.length) this.emit('sessions', out, []);
      this.watchStatus(out);
    }, 250);
  }

  // ---- finished / needs you -------------------------------------------------------

  private statuses = new Map<string, { status: Phase; turnStart: number }>();
  /** Turns of sessions run here that ended since their status was last looked at, by when each began. */
  private endedTurns = new Map<string, number>();

  /**
   * Turns that end (after running a while), sessions that start waiting for an answer or approval, and
   * failures become `notify` events. Every session counts, also ones running in VS Code or a terminal.
   */
  private watchStatus(list: SessionSummary[]) {
    const now = Date.now();
    for (const s of list) {
      const st = phaseOf(s);
      const prev = this.statuses.get(s.key);
      const busy = (p?: Phase) => p === 'working' || p === 'waiting';
      this.statuses.set(s.key, { status: st, turnStart: busy(st) ? (busy(prev?.status) ? prev!.turnStart : now) : 0 });
      const ended = this.endedTurns.get(s.key);
      this.endedTurns.delete(s.key);
      if (!prev || prev.status === st) {
        // A turn that began and ended between two looks (a quick one, or the first): the capabilities hear of it too.
        if (ended !== undefined && (st === 'idle' || st === 'error')) {
          const t = { key: s.key, agent: s.agent, cwd: s.cwd, status: st, startedAt: ended, endedAt: now, external: false };
          setTimeout(() => turnEnded(t), 1500);
        }
        continue; // the first sighting is only a baseline
      }
      const base = { key: s.key, title: s.title, agent: s.agent, at: now };
      if (st === 'waiting') {
        // A snoozed session that needs you comes back now.
        if (s.snoozedUntil) this.setFlags(s.key, { snoozedUntil: null });
        const ext = s.external;
        // An approval that is a plain yes or no: the notification's buttons can answer it.
        const first = ext ? undefined : [...(this.lives.get(s.key)?.adapter.approvals.values() ?? [])][0];
        const quick = first ? (quickAnswer(first) ?? undefined) : undefined;
        const n: NotifyEvent = {
          ...base,
          kind: 'waiting',
          body: ext ? `Waiting for you in ${ext.client}` : quick ? `${quick.title}${quick.detail ? `: ${quick.detail}` : ''}` : (s.live?.pendingApprovals ?? 0) > 0 ? 'Needs your approval' : 'Has a question for you',
          approval: quick,
        };
        // In VS Code or a terminal you are likely right there: speak up only if it is still waiting a minute later.
        if (!ext) this.notify(n);
        else {
          const since = this.statuses.get(s.key)!.turnStart;
          setTimeout(() => {
            const now2 = this.statuses.get(s.key);
            if (now2?.status === 'waiting' && now2.turnStart === since) this.notify({ ...n, at: Date.now() });
          }, 60_000);
        }
      } else if (st === 'error') {
        this.notify({ ...base, kind: 'failed', body: s.live?.error ? s.live.error.slice(0, 200) : 'Stopped with an error' } satisfies NotifyEvent);
      }
      // A turn that ended because the plan's usage ran out: another account with usage left takes the session
      // over now, or it continues by itself after the reset, as you asked.
      // Only the turn's own limit error proves interruption: an account can reach 100% as work finishes.
      const hit = this.limitHits.delete(s.key);
      if ((st === 'idle' || st === 'error') && busy(prev.status) && s.agent !== 'acp' && this.onLimited && !this.resumeLookup?.(s.key)) {
        const lim = this.controlFor(s.agent, s.account).lastUsage?.limited;
        const resetsAt = lim?.resetsAt && lim.resetsAt > now ? lim.resetsAt : undefined;
        if (hit) {
          if (autoSwitchOn(this.db) && !s.external) this.switchAtLimit(s.key, resetsAt).catch((e) => this.emit('toast', { level: 'error', text: `${s.title}: could not switch accounts: ${(e as Error).message}` }));
          else if (kvGet(this.db, 'auto_resume') === '1') this.resumeAfterLimit(s.key, resetsAt).catch(() => {});
        }
      }
      // The capabilities hear of every ended turn (memory notes, spending, automations), once its last lines are in.
      if ((st === 'idle' || st === 'error') && busy(prev.status)) {
        const t = { key: s.key, agent: s.agent, cwd: s.cwd, status: st, startedAt: prev.turnStart, endedAt: now, external: !!s.external };
        setTimeout(() => turnEnded(t), 1500);
      }
      if (st === 'idle' && busy(prev.status) && now - prev.turnStart >= 10_000) {
        this.db
          .prepare('insert into app_sessions (key, agent, done_at, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(key) do update set done_at = excluded.done_at')
          .run(s.key, s.agent, now, now, now);
        this.queueSummary(s.key);
        // The last lines of the transcript land a moment after the turn ends. A Custom goal still going says when it is met.
        if (!(s.acpAgent === CONSOLE_ID && s.goal?.status === 'active')) setTimeout(() => this.notify({ ...base, kind: 'done', body: this.lastReply(s.key) ?? 'Finished' } satisfies NotifyEvent), 1500);
      }
    }
  }

  /** Set by the scheduler: a scheduled run's notice may read differently, or not go out (nothing to report). */
  noticeGate?: (n: NotifyEvent) => NotifyEvent | null;

  private notify(n: NotifyEvent) {
    const out = this.noticeGate ? this.noticeGate(n) : n;
    if (out) this.emit('notify', out);
  }

  /** The start of the latest reply, when its timeline is in memory (never loads a transcript for it). */
  private lastReply(key: string): string | undefined {
    const items = this.timelines.get(key)?.parser.items ?? [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.kind === 'assistant' && it.text.trim()) {
        const plain = it.text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]/g, '').replace(/\s+/g, ' ').trim();
        return plain.length > 160 ? plain.slice(0, 159) + '…' : plain || undefined;
      }
      if (it.kind === 'user') return undefined;
    }
    return undefined;
  }

  /** The session was looked at: it is no longer unread. */
  markSeen(key: string) {
    const now = Date.now();
    const agent = agentOfKey(key);
    this.db.prepare('insert into app_sessions (key, agent, seen_at, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(key) do update set seen_at = excluded.seen_at').run(key, agent, now, now, now);
    this.queueSummary(key);
  }

  recentDirs(limit = 30): string[] {
    const rows = this.db
      .prepare(`select cwd, max(updated_at) as t from sessions where cwd is not null and hidden = 0 group by cwd order by t desc limit ?`)
      .all(limit) as { cwd: string }[];
    return rows.map((r) => r.cwd).filter((d) => {
      try {
        return fs.statSync(d).isDirectory();
      } catch {
        return false;
      }
    });
  }

  // ---- timelines ---------------------------------------------------------------

  /** The transcript file a session's timeline reads (read-only uses, e.g. images). */
  transcriptOf(key: string): string | null {
    return this.transcriptFor(key);
  }

  private transcriptFor(key: string): string | null {
    const live = this.lives.get(key);
    if (live?.adapter.transcriptPath) return live.adapter.transcriptPath;
    const row = this.db.prepare('select path from sessions where key = ?').get(key) as { path: string } | undefined;
    if (row?.path) return row.path;
    if (key.startsWith('claude:')) {
      const app = live ? undefined : (this.db.prepare('select cwd, account from app_sessions where key = ?').get(key) as { cwd: string; account: string | null } | undefined);
      return claudeTranscriptOf(this.db, key.slice(7), live?.cwd ?? app?.cwd, live ? live.account : app?.account);
    }
    // ACP sessions: the app writes their transcripts itself.
    if (key.startsWith('acp:')) return acpTranscriptPath(key.slice(4));
    return null;
  }

  async timeline(key: string): Promise<Timeline> {
    let tl = this.timelines.get(key);
    if (tl) {
      tl.lastUsed = Date.now();
      if (!tl.loaded) await tl.readMore();
      return tl;
    }
    const agent = agentOfKey(key);
    tl = new Timeline(key, agent, this.transcriptFor(key));
    this.timelines.set(key, tl);
    const t = tl;
    let lastGoal = 'null';
    t.on('items', (items: TimelineItem[]) => {
      this.emit('items', key, items, t.total, false);
      const goal = JSON.stringify(t.goal() ?? null);
      if (goal !== lastGoal) {
        lastGoal = goal;
        this.queueSummary(key);
      }
      const live = this.lives.get(key);
      if (live) {
        live.adapter.prune((id) => t.has(id), (since) => t.userTexts(since));
        if (this.dateTasks(live)) {
          const snap = this.liveSnapshot(key);
          this.emit('live', key, snap.live, snap.overlay);
        }
      }
    });
    t.on('reset', () => this.emit('items', key, [], 0, true));
    await t.load(this.lives.has(key) || !!this.external.get(key));
    return t;
  }

  private sweepTimelines() {
    const now = Date.now();
    for (const [k, tl] of this.timelines) {
      if (tl.subscribers <= 0 && !this.lives.has(k) && now - tl.lastUsed > 10 * 60_000) {
        tl.dispose();
        this.timelines.delete(k);
      }
    }
  }

  subscribe(key: string, delta: 1 | -1) {
    const tl = this.timelines.get(key);
    if (tl) {
      tl.subscribers += delta;
      tl.lastUsed = Date.now();
    }
  }

  liveSnapshot(key: string): { live: LiveState | null; overlay: LiveOverlay } {
    const l = this.lives.get(key);
    if (l) this.dateTasks(l);
    return l ? { live: { ...l.adapter.state }, overlay: l.adapter.overlay() } : { live: null, overlay: { items: [], patches: {}, approvals: [] } };
  }

  /**
   * Background tasks begun before this server last started have no start time from the agent's output, read again
   * on reconnecting, so they would show no time running: the session's transcript tells when each began. True when
   * one got its time.
   */
  private dateTasks(l: Live): boolean {
    const parser = this.timelines.get(l.key)?.parser;
    if (!(parser instanceof ClaudeParser)) return false;
    let dated = false;
    for (const t of l.adapter.state.backgroundTasks ?? []) {
      if (t.startedAt) continue;
      t.startedAt = parser.taskStart(t.id, t.toolUseId);
      if (t.startedAt) dated = true;
    }
    return dated;
  }

  // ---- lifecycle ---------------------------------------------------------------

  private attach(l: Live) {
    this.lives.set(l.key, l);
    const { adapter, key } = l;
    const emitLive = () => {
      if (this.liveTimers.has(key)) return;
      this.liveTimers.set(
        key,
        setTimeout(() => {
          this.liveTimers.delete(key);
          const snap = this.liveSnapshot(key);
          this.emit('live', key, snap.live, snap.overlay);
        }, 80),
      );
    };
    // The list shows the status and whether background tasks still run.
    let lastStatus = adapter.state.status;
    let lastTasks = 0;
    let turnBegan = 0;
    let lastGoal = JSON.stringify(adapter.state.goal ?? null);
    adapter.on('change', () => {
      emitLive();
      const tasks = adapter.state.backgroundTasks?.length ?? 0;
      const goal = JSON.stringify(adapter.state.goal ?? null);
      if (goal !== lastGoal) {
        lastGoal = goal;
        this.queueSummary(key);
      }
      if (adapter.state.status !== lastStatus || tasks !== lastTasks) {
        const was = lastStatus;
        lastStatus = adapter.state.status;
        lastTasks = tasks;
        this.queueSummary(key);
        // Noted for watchStatus, which looks only now and then and could miss a quick turn.
        const busy = (x: string) => x === 'working' || x === 'waiting';
        if (busy(lastStatus) && !busy(was)) turnBegan = Date.now();
        if ((lastStatus === 'idle' || lastStatus === 'error') && busy(was)) this.endedTurns.set(key, turnBegan || Date.now());
        // A turn ended: the next queued message goes out.
        if (adapter.state.status === 'idle' && (was === 'working' || was === 'waiting')) setTimeout(() => this.dispatchQueued(key), 300);
      }
    });
    // Each model call, for the spending caps.
    adapter.on('call', (c: ModelCall) => this.emit('call', key, c));
    adapter.on('activity', () => {
      const tl = this.timelines.get(key);
      if (tl) {
        tl.reopen();
        tl.poke();
      }
    });
    adapter.on('identity', () => {
      const p = adapter.agent === 'claude' && adapter.sessionId ? claudeTranscriptOf(this.db, adapter.sessionId, l.cwd, l.account) : adapter.transcriptPath;
      if (p) {
        adapter.transcriptPath = p;
        this.timelines.get(key)?.setPath(p);
      }
    });
    // A turn you stopped yourself is not one the limit interrupted, even when the limit's error came first.
    adapter.on('limithit', () => {
      if (!this.userStopped.has(key)) this.limitHits.add(key);
    });
    // A tool call's input as the model writes it: Pages draws a page while it is being written.
    adapter.on('toolstream', (e: unknown) => this.emit('toolstream', key, e));
    adapter.on('ratelimit', (info: any) => {
      // Limits belong to the account the session runs as.
      const account = this.lives.get(key)?.account;
      const tell = (u: AgentUsage) => this.emit('usage', account ? { accounts: { [account]: u } } : { [adapter.agent]: u });
      if (adapter.agent === 'claude') {
        const u = this.controlFor('claude', account).applyRateLimit(info);
        if (u) tell(u);
        // Not read since the app started: read it, so this and later limits count.
        else this.usageOf('claude', account).catch(() => {});
      } else {
        const ctl = this.controlFor('codex', account);
        const u = mergeCodexSnapshot(ctl.lastUsage, info);
        if (u) {
          ctl.lastUsage = u;
          tell(u);
        } else this.usageOf('codex', account).catch(() => {});
      }
    });
    adapter.on('result', async (_result: unknown, replay?: boolean) => {
      if (!replay && this.userStopped.has(key)) adapter.limitStopped = false;
      if (!adapter.limitStopped) {
        this.limitHits.delete(key);
        if (!replay) this.emit('resumeCancelled', key);
      }
      const tl = this.timelines.get(key);
      if (tl) {
        await tl.readMore().catch(() => {});
        // Give the CLI a moment to write the last lines, then close the turn.
        setTimeout(() => {
          tl.readMore()
            .then(() => {
              if (adapter.state.status === 'idle') tl.endTurn();
            })
            .catch(() => {});
        }, 700);
      }
      this.indexer.poke([adapter.transcriptPath ?? this.transcriptFor(key)]);
      this.touchApp(key);
    });
    adapter.on('title', () => this.indexer.poke([adapter.transcriptPath]));
    adapter.on('exit', () => {
      this.indexer.poke([adapter.transcriptPath ?? this.transcriptFor(key)]);
      setTimeout(() => {
        if (this.lives.get(key)?.adapter === adapter) this.lives.delete(key);
        l.runner.cleanup();
        const tl = this.timelines.get(key);
        tl?.readMore()
          .then(() => tl.finish())
          .catch(() => {});
        this.queueSummary(key);
        const snap = this.liveSnapshot(key);
        this.emit('live', key, snap.live, snap.overlay);
      }, 400);
    });
    // Make sure a timeline exists so transcript changes reach subscribers.
    this.timeline(key).catch(() => {});
    if (adapter.transcriptPath) this.timelines.get(key)?.setPath(adapter.transcriptPath);
    this.queueSummary(key);
  }

  private touchApp(key: string) {
    this.db.prepare('update app_sessions set updated_at = ? where key = ?').run(Date.now(), key);
  }

  private savePrefs(agent: Agent, p: { model?: string; effort?: string; mode?: string; account?: string }) {
    const prev = JSON.parse(kvGet(this.db, `prefs:${agent}`) ?? '{}');
    kvSet(this.db, `prefs:${agent}`, JSON.stringify({ ...prev, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) }));
  }

  defaults(agent: Agent): SessionPrefs {
    return JSON.parse(kvGet(this.db, `prefs:${agent}`) ?? '{}');
  }

  private async spawn(
    agent: Agent,
    cwd: string,
    opts: { sessionId?: string; threadId?: string; resume?: boolean; forkFrom?: string; forkAt?: string; model?: string; effort?: string; mode?: string; account?: string; acpAgent?: string; extra?: SessionExtra; prompt?: string },
  ): Promise<Live> {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) throw new HttpError(400, `Folder not found: ${cwd}`);
    if (agent === 'acp') return this.spawnAcp(cwd, opts);
    // An added account: the agent's CLI uses that account's folder (sign-in, history).
    const acct = accountEnv(this.db, agent, opts.account);
    const account = opts.account || undefined;
    // Claude Code keeps a copy of each file it edits, per message, so "Edit from here" can put them back.
    const env = agent === 'claude' ? { ...agentBaseEnv(), ...acct, CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING: '1' } : { ...agentBaseEnv(), ...acct };
    const runId = crypto.randomBytes(6).toString('hex');
    if (agent === 'claude') {
      const sessionId = opts.sessionId ?? crypto.randomUUID();
      // What the app's capabilities add: instructions (memory, the assistant), MCP servers, environment.
      const add = await spawnAdditions({ agent, key: `claude:${sessionId}`, cwd, runId, resume: !!opts.resume || !!opts.forkFrom, extra: opts.extra ?? sessionExtra(this.db, `claude:${sessionId}`), prompt: opts.prompt });
      Object.assign(env, add.env);
      const o = { cwd, sessionId, resume: !!opts.resume, forkFrom: opts.forkFrom, forkAt: opts.forkAt, model: opts.model, effort: opts.effort, mode: opts.mode, pageServer: pageServerUrl(runId), add };
      const meta: RunMeta = { runId, agent, key: `claude:${sessionId}`, createdAt: Date.now(), cwd, opts: { ...o, account } };
      const runner = await Runner.start(meta, claudeSpec(o, env));
      const adapter = new ClaudeLive(runner, o);
      await runner.connect();
      const l: Live = { key: meta.key!, agent, cwd, adapter, runner, account };
      this.attach(l);
      try {
        await adapter.initialize();
      } catch (e) {
        const tail = runner.stderrTail().trim().split('\n').slice(-3).join(' ');
        adapter.stop();
        throw new HttpError(500, `Claude Code did not start: ${(e as Error).message}${tail ? ` (${tail.slice(0, 300)})` : ''}`);
      }
      adapter.emit('identity');
      return l;
    }
    const known = opts.threadId ? `codex:${opts.threadId}` : undefined;
    const add = await spawnAdditions({ agent, key: known, cwd, runId, resume: !!opts.threadId, extra: opts.extra ?? (known ? sessionExtra(this.db, known) : {}), prompt: opts.prompt });
    Object.assign(env, add.env);
    const o = { cwd, threadId: opts.threadId, forkFrom: opts.forkFrom, forkLastTurn: opts.forkFrom ? opts.forkAt : undefined, model: opts.model, effort: opts.effort, mode: opts.mode, pageServer: pageServerUrl(runId), add };
    const meta: RunMeta = { runId, agent, createdAt: Date.now(), cwd, opts: { ...o, account } };
    const runner = await Runner.start(meta, codexSpec(o, env));
    const adapter = new CodexLive(runner, o);
    await runner.connect();
    try {
      await adapter.boot();
    } catch (e) {
      const tail = runner.stderrTail().trim().split('\n').slice(-3).join(' ');
      runner.stop(500);
      throw new HttpError(500, `Codex did not start: ${(e as Error).message}${tail ? ` (${tail.slice(0, 300)})` : ''}`);
    }
    meta.key = `codex:${adapter.sessionId}`;
    meta.opts = { ...o, account, threadId: adapter.sessionId, forkFrom: undefined, forkLastTurn: undefined };
    runner.meta = meta;
    runner.saveMeta();
    const l: Live = { key: meta.key, agent, cwd, adapter, runner, account };
    this.attach(l);
    return l;
  }

  /** An ACP agent (Gemini CLI, OpenCode…): its own command, driven over the Agent Client Protocol. */
  private async spawnAcp(cwd: string, opts: { sessionId?: string; resume?: boolean; model?: string; mode?: string; acpAgent?: string; extra?: SessionExtra; prompt?: string }): Promise<Live> {
    const def = acpAgent(this.db, opts.acpAgent);
    const env = { ...agentBaseEnv(), ...(def.env ?? {}) };
    // Missing: installed now when the app knows its package (Gemini CLI, OpenCode…).
    const cmd = findCommand(def.command, env) ?? (await ensureCommand(def.command).catch(() => null));
    if (!cmd) throw new HttpError(400, `${def.name} is not installed here (no ${def.command} on the PATH)${def.hint ? `. Install it: ${def.hint}` : ''}`);
    const id = opts.sessionId ?? crypto.randomUUID();
    const transcript = acpTranscriptPath(id);
    fs.mkdirSync(ACP_DIR, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(transcript)) fs.writeFileSync(transcript, JSON.stringify({ t: 'meta', ts: Date.now(), agent: def.id, name: def.name, cwd }) + '\n', { mode: 0o600 });
    const runId = crypto.randomBytes(6).toString('hex');
    // Console asks the app to get its model ready (start a vLLM server) at this run's own address.
    if (def.id === CONSOLE_ID) env.HYDOR_RUNTIME = `http://127.0.0.1:${config.port}/agent/run/${runToken(runId)}`;
    const add = await spawnAdditions({ agent: 'acp', acpAgent: def.id, key: `acp:${id}`, cwd, runId, resume: !!opts.resume, extra: opts.extra ?? sessionExtra(this.db, `acp:${id}`), prompt: opts.prompt });
    Object.assign(env, add.env);
    const o = { cwd, id, def, acpSession: opts.resume ? acpSessionOf(transcript) : undefined, transcript, mode: opts.mode, model: opts.model, pageServer: pageServerUrl(runId), add };
    const meta: RunMeta = { runId, agent: 'acp', key: `acp:${id}`, createdAt: Date.now(), cwd, opts: o };
    const runner = await Runner.start(meta, { cmd, args: def.args, cwd, env });
    const adapter = new AcpLive(runner, o);
    await runner.connect();
    const l: Live = { key: meta.key!, agent: 'acp', cwd, adapter, runner, acpAgent: def.id };
    this.attach(l);
    try {
      await adapter.boot(!!opts.resume);
      this.acpOffers.set(def.id, { models: adapter.models, modes: adapter.modes.map((m) => ({ value: m.id, label: m.name, description: m.description ?? '' })) });
    } catch (e) {
      const tail = runner.stderrTail().trim().split('\n').slice(-3).join(' ');
      adapter.stop();
      if (e instanceof HttpError) throw e;
      throw new HttpError(500, `${def.name} did not start: ${(e as Error).message}${tail ? ` (${tail.slice(0, 300)})` : ''}`);
    }
    return l;
  }

  async create(o: CreateOpts): Promise<string> {
    // A confidential session (or a child of one): Custom with a local model, memory off (server/confidential).
    o = confidentialStart(this.db, o);
    if (o.agent === 'claude') await ensureClaude();
    // A session started with a request and no title gets one from the helper model, asked now, beside the agent's start;
    // a confidential one only from a helper model on this computer, else from its first words.
    const request = (splitHandoff(o.prompt ?? '')?.request ?? o.prompt ?? '').trim();
    const titling = !o.title?.trim() && request ? (isConfidential(o.extra) ? confidentialTitle(this.db, request) : titleFor(this.db, request)) : null;
    let cwd = path.resolve(o.cwd || config.defaultCwd);
    let wt: WorktreeInfo | undefined;
    if (o.worktree) {
      const made = await createWorktree(cwd, o.prompt || o.title || 'task');
      wt = made.info;
      cwd = made.cwd;
    }
    const mode = o.mode || (o.agent === 'claude' ? 'default' : o.agent === 'codex' ? 'auto' : undefined);
    let account = o.account || undefined;
    // The account picked is at its usage limit: with Switch accounts at a limit on, one with usage left starts it.
    if (o.agent !== 'acp' && autoSwitchOn(this.db)) {
      const lim = this.controlFor(o.agent, account).lastUsage?.limited;
      if (lim?.resetsAt && lim.resetsAt > Date.now()) {
        const free = await this.freeAccount(o.agent, account);
        if (free) account = free.id;
      }
    }
    const l = await this.spawn(o.agent, cwd, { model: o.model || undefined, effort: o.effort || undefined, mode, account, acpAgent: o.acpAgent, extra: o.extra, prompt: (splitHandoff(o.prompt ?? '')?.request ?? o.prompt)?.slice(0, 2000) });
    const now = Date.now();
    this.db
      .prepare(
        `insert into app_sessions (key, agent, cwd, first_prompt, title, created_by_app, model, effort, mode, created_at, updated_at)
         values (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
         on conflict(key) do update set cwd = excluded.cwd, model = excluded.model, effort = excluded.effort, mode = excluded.mode, updated_at = excluded.updated_at`,
      )
      .run(l.key, o.agent, cwd, (splitHandoff(o.prompt ?? '')?.request ?? o.prompt)?.slice(0, 300) || null, o.title?.trim() || null, o.model ?? null, o.effort ?? null, mode ?? null, now, now);
    if (wt) this.db.prepare('update app_sessions set worktree = ? where key = ?').run(JSON.stringify(wt), l.key);
    if (account) this.db.prepare('update app_sessions set account = ? where key = ?').run(account, l.key);
    if (o.acpAgent) this.db.prepare('update app_sessions set acp_agent = ? where key = ?').run(o.acpAgent, l.key);
    if (o.extra && Object.keys(o.extra).length) setSessionExtra(this.db, l.key, o.extra);
    if (o.remember !== false && o.agent !== 'acp') this.savePrefs(o.agent, { model: o.model, effort: o.effort, mode, account: o.account ?? '' });
    if (o.title?.trim()) await l.adapter.rename(o.title.trim());
    if (titling) void titling.then((t) => (t ? this.autoTitle(l.key, t) : undefined));
    const here = onThisComputer(o.paths);
    const prompt = withFiles(o.prompt?.trim() ?? '', [...this.saveFiles(o.files ?? []), ...here.paths]);
    const images = [...(o.images ?? []), ...here.images];
    if (prompt || images.length) {
      await beforeSend(l.key);
      await this.snapshot(l.key);
      // What the capabilities have to say of the request (an app that does it); not of a conversation handed over.
      const said = splitHandoff(o.prompt ?? '') ? '' : (o.prompt?.trim() ?? '');
      await l.adapter.sendMessage(said ? await withNotes(l.key, prompt, said) : prompt, this.saveImages(images));
    }
    this.queueSummary(l.key);
    return l.key;
  }

  // ---- worktrees and rewinding ---------------------------------------------------------------

  worktreeOf(key: string): WorktreeInfo | undefined {
    const r = this.db.prepare('select worktree from app_sessions where key = ?').get(key) as { worktree: string | null } | undefined;
    return parseJson<WorktreeInfo>(r?.worktree);
  }

  /** In a worktree session, a snapshot of the files before each message, for "Edit from here". */
  private async snapshot(key: string) {
    const w = this.worktreeOf(key);
    if (!w) return;
    const commit = await checkpoint(w).catch(() => null);
    if (commit) this.db.prepare('insert into checkpoints (key, at, commit_id) values (?, ?, ?)').run(key, Date.now(), commit);
  }

  async worktreeState(key: string) {
    const w = this.worktreeOf(key);
    if (!w) throw new HttpError(404, 'This session has no worktree');
    return { ...w, ...(await worktreeState(w)) };
  }

  /** Removes a session's worktree folder (and its branch when asked); the session keeps its history. */
  async dropWorktree(key: string, o: { force?: boolean; deleteBranch?: boolean }) {
    const w = this.worktreeOf(key);
    if (!w) throw new HttpError(404, 'This session has no worktree');
    if (this.lives.has(key)) await this.stop(key);
    const r = await removeWorktree(w, o);
    // Other sessions in the same worktree (forks, edits) lose it too.
    for (const row of this.db.prepare('select key, worktree from app_sessions where worktree is not null').all() as { key: string; worktree: string }[]) {
      if (parseJson<WorktreeInfo>(row.worktree)?.path === w.path) {
        this.db.prepare('update app_sessions set worktree = null where key = ?').run(row.key);
        this.db.prepare('delete from checkpoints where key = ?').run(row.key);
        this.queueSummary(row.key);
      }
    }
    return r;
  }

  /**
   * "Edit from here": the conversation goes back to just before one of your messages and continues
   * with new text, in a fork that replaces the session in the list. With `restoreFiles`, the files go
   * back to how they were then: a worktree's snapshot, or Claude Code's own checkpoints.
   */
  async rewind(key: string, o: { itemId: string; text: string; restoreFiles?: boolean }): Promise<string> {
    const custom = this.isCustom(key);
    if (key.startsWith('acp:') && !custom) throw new HttpError(400, 'Not available for this agent');
    const s = this.summary(key);
    if (!s) throw new HttpError(404, 'Unknown session');
    if (!o.text.trim()) throw new HttpError(400, 'Write the new message');
    if (this.lives.get(key)?.adapter.state.status === 'working') throw new HttpError(409, 'Stop the agent first');
    const tl = await this.timeline(key);
    const items = tl.parser.items;
    const idx = items.findIndex((i) => i.id === o.itemId && i.kind === 'user');
    if (idx < 0) throw new HttpError(404, 'That message is not in this session');
    const msg = items[idx] as Extract<TimelineItem, { kind: 'user' }>;
    if (o.restoreFiles) await this.restoreFilesBefore(key, s.agent, msg);
    let at: string | undefined;
    if (s.agent === 'claude') at = this.claudeParent(key, msg.id);
    else if (custom) at = customTurnBefore(key, msg.id);
    else {
      const before = items.slice(0, idx).filter((i): i is Extract<TimelineItem, { kind: 'user' }> => i.kind === 'user' && !!i.turn && i.turn !== msg.turn && !i.turn.startsWith('p:'));
      at = before[before.length - 1]?.turn;
    }
    const cwd = this.sessionCwd(key);
    if (!cwd) throw new HttpError(404, 'Unknown folder');
    const prefs = s.prefs ?? {};
    const next = at
      ? await this.fork(key, { prompt: o.text, at })
      : await this.create({
          agent: s.agent,
          cwd,
          prompt: o.text,
          model: prefs.model ?? s.model,
          effort: prefs.effort ?? undefined,
          mode: prefs.mode ?? undefined,
          title: s.title,
          remember: false,
          account: this.accountOf(key),
          acpAgent: s.acpAgent,
          // An edit of a confidential session stays confidential.
          extra: carriedExtra(this.db, key),
        });
    this.db.prepare('update app_sessions set title = ?, worktree = ? where key = ?').run(s.title, s.worktree ? JSON.stringify(s.worktree) : null, next);
    this.setFlags(key, { archived: true });
    this.queueSummary(next);
    return next;
  }

  private async restoreFilesBefore(key: string, agent: Agent, msg: Extract<TimelineItem, { kind: 'user' }>) {
    const w = this.worktreeOf(key);
    if (w) {
      const c = this.db.prepare('select commit_id from checkpoints where key = ? and at <= ? order by at desc limit 1').get(key, (msg.ts ?? Date.now()) + 3000) as { commit_id: string } | undefined;
      if (!c) throw new HttpError(404, 'No snapshot of the files from before that message (they are taken for messages sent from this app)');
      await restoreCheckpoint(w, c.commit_id);
      return;
    }
    // Custom kept what its own edits changed, per turn.
    if (this.isCustom(key)) return restoreCustomFiles(key, msg.id);
    if (agent !== 'claude') throw new HttpError(400, 'Putting the files back needs a worktree for Codex sessions');
    if (!this.lives.has(key)) await this.start(key);
    const adapter = this.live(key).adapter as ClaudeLive;
    const r = await adapter.rewindFiles(msg.id);
    if (r?.error || r?.canRewind === false) throw new HttpError(409, `Claude Code could not put the files back: ${r.error ?? 'no checkpoint for that message (they are kept from now on)'}`);
  }

  /** The transcript entry a Claude message follows: where a fork that leaves the message out ends. */
  private claudeParent(key: string, uuid: string): string | undefined {
    const file = this.transcriptFor(key);
    if (!file) return undefined;
    const needle = `"uuid":"${uuid}"`;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes(needle)) continue;
      try {
        const e = JSON.parse(line);
        if (e.uuid === uuid) return e.parentUuid ?? undefined;
      } catch {}
    }
    return undefined;
  }

  /**
   * Continues a Claude Code or Codex session's conversation on another agent (the other of the two, or
   * Custom): a new session in the same folder whose first message carries the conversation so far, then
   * `prompt`. The two sessions link to each other.
   */
  async handoff(fromKey: string, o: Omit<CreateOpts, 'cwd' | 'title'>): Promise<string> {
    checkHandoff(this.db, fromKey);
    if (fromKey.startsWith('acp:') || (o.agent === 'acp' && o.acpAgent !== CONSOLE_ID)) throw new HttpError(400, 'Hand-offs go from Claude Code or Codex to the other one or to Custom');
    const from = this.summary(fromKey);
    const cwd = this.sessionCwd(fromKey);
    if (!from || !cwd) throw new HttpError(404, 'Unknown session');
    if (o.agent === from.agent) throw new HttpError(400, 'That is the same agent; pick its model instead');
    const tl = await this.timeline(fromKey);
    const model = this.lives.get(fromKey)?.adapter.state.model ?? from.prefs?.model ?? from.model;
    const context = buildHandoff(from, tl.parser.items, this.transcriptFor(fromKey), model ?? undefined);
    const prompt = context + (o.prompt?.trim() || 'Continue where the conversation left off.');
    const key = await this.create({ ...o, cwd, prompt, title: from.title });
    this.db.prepare('update app_sessions set handoff_from = ? where key = ?').run(fromKey, key);
    this.db
      .prepare(`insert into app_sessions (key, agent, cwd, handoff_to, created_at, updated_at) values (?, ?, ?, ?, ?, ?) on conflict(key) do update set handoff_to = excluded.handoff_to`)
      .run(fromKey, from.agent, cwd, key, Date.now(), Date.now());
    this.queueSummary(fromKey);
    this.queueSummary(key);
    return key;
  }

  /**
   * A new session that starts with this one's conversation (up to the Claude entry `at`, if given) and
   * then `prompt`; this one stays as it is. Claude copies the transcript itself when the first message
   * arrives; Codex copies the thread right away.
   */
  async fork(key: string, o: { prompt: string; images?: ImageInput[]; files?: FileInput[]; at?: string }): Promise<string> {
    if (key.startsWith('acp:') && !this.isCustom(key)) throw new HttpError(400, 'Not available for this agent');
    const from = this.summary(key);
    const cwd = this.sessionCwd(key);
    if (!from || !cwd) throw new HttpError(404, 'Unknown session');
    if (!o.prompt.trim() && !o.images?.length && !o.files?.length) throw new HttpError(400, 'Say what the fork should do');
    if (this.external.get(key) && !this.lives.has(key)) throw new HttpError(409, 'This session is open in another app; fork it there, or close it there first');
    const prefs = from.prefs ?? {};
    const cfg = { model: prefs.model ?? undefined, effort: prefs.effort ?? undefined, mode: prefs.mode ?? undefined, account: this.accountOf(key) };
    // A fork of a confidential session stays confidential, on a model on this computer.
    const extra = carriedExtra(this.db, key);
    if (extra) cfg.model = localModel(featureDeps(), cfg.model ?? from.model).id;
    let l: Live;
    if (from.agent === 'claude') {
      if (o.at && !/^[0-9a-f-]{36}$/i.test(o.at)) throw new HttpError(400, 'Bad message id');
      l = await this.spawn('claude', cwd, { sessionId: crypto.randomUUID(), forkFrom: from.id, forkAt: o.at, ...cfg, extra });
    } else if (from.agent === 'acp') {
      // Custom: a copy of its transcript and state up to the end of the turn `at` (a prompt's id), then loaded.
      const id = await prepareCustomFork(key, o.at);
      l = await this.spawn('acp', cwd, { sessionId: id, resume: true, acpAgent: CONSOLE_ID, model: cfg.model, mode: cfg.mode, extra });
    } else {
      // The new session's own app-server copies the thread, so it is the one writing to the copy.
      // `at` is the last turn to keep (none: the whole thread).
      l = await this.spawn('codex', cwd, { forkFrom: from.id, forkAt: o.at, ...cfg, extra });
    }
    const now = Date.now();
    this.db
      .prepare(
        `insert into app_sessions (key, agent, cwd, title, created_by_app, model, effort, mode, fork_from, created_at, updated_at) values (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
         on conflict(key) do update set title = excluded.title, fork_from = excluded.fork_from`,
      )
      .run(l.key, from.agent, cwd, `${from.title} · fork`, cfg.model ?? null, cfg.effort ?? null, cfg.mode ?? null, key, now, now);
    if (cfg.account) this.db.prepare('update app_sessions set account = ? where key = ?').run(cfg.account, l.key);
    if (from.agent === 'acp') this.db.prepare('update app_sessions set acp_agent = ? where key = ?').run(CONSOLE_ID, l.key);
    if (extra) setSessionExtra(this.db, l.key, extra);
    await l.adapter.sendMessage(withFiles(o.prompt.trim(), this.saveFiles(o.files ?? [])), this.saveImages(o.images ?? []));
    this.queueSummary(l.key);
    return l.key;
  }

  /** The added account a session runs as: as the app started it, or by where its transcript is. */
  accountOf(key: string): string | undefined {
    const live = this.lives.get(key);
    if (live) return live.account;
    const r = this.db.prepare('select account from app_sessions where key = ?').get(key) as { account: string | null } | undefined;
    return r?.account ?? accountOfPath(this.db, this.transcriptFor(key)) ?? undefined;
  }

  /**
   * When the plan limit a session's account is at lifts, as its usage last said: a time; null when the
   * account is not at a limit; undefined when that is not known (not read yet, or no plan limits).
   */
  limitLiftsAt(key: string): number | null | undefined {
    const agent = agentOfKey(key);
    if (agent === 'acp') return undefined;
    const lifts = (account?: string) => {
      const u = this.controlFor(agent, account).lastUsage;
      if (!u?.ok) return undefined;
      return u.limited ? (u.limited.resetsAt ?? undefined) : null;
    };
    const own = lifts(this.accountOf(key));
    if (!autoSwitchOn(this.db)) return own;
    // Switching accounts at a limit: the first of them to have usage again.
    const all = accountPool(this.db, agent).map(lifts);
    if (all.includes(null)) return null;
    const times = all.filter((t): t is number => t !== undefined);
    return times.length ? Math.min(...times) : own;
  }

  /** An account's usage as it last said, read again when that is older than `fresh` ms. */
  private async usageOf(agent: 'claude' | 'codex', account: string | undefined, fresh = 120_000): Promise<AgentUsage | undefined> {
    const ctl = this.controlFor(agent, account);
    const last = ctl.lastUsage;
    if (last && Date.now() - last.fetchedAt <= fresh) return last;
    // One read at a time per account.
    const id = `${agent}:${account ?? ''}`;
    let read = this.usageReads.get(id);
    if (!read) {
      read = (ctl instanceof ClaudeControl ? ctl.usage(this.liveClaudeUsage(account)) : ctl.usage())
        .then((u) => {
          this.emit('usage', account ? { accounts: { [account]: u } } : { [agent]: u });
          return u;
        })
        .catch(() => undefined)
        .finally(() => this.usageReads.delete(id));
      this.usageReads.set(id, read);
    }
    return (await read) ?? last ?? undefined;
  }

  private usageReads = new Map<string, Promise<AgentUsage | undefined>>();

  private static usedUp = (u: AgentUsage | undefined) => !u?.ok || !!u.limited || u.windows.some((w) => (w.usedPercent ?? 0) >= 100);

  /** Another signed-in account of the agent with usage left, the least used first; null when there is none. */
  private async freeAccount(agent: 'claude' | 'codex', except: string | undefined): Promise<{ id: string | undefined } | null> {
    let best: { id: string | undefined; used: number } | null = null;
    for (const id of accountPool(this.db, agent)) {
      if (id === except) continue;
      const u = await this.usageOf(agent, id);
      if (SessionManager.usedUp(u)) continue;
      const used = Math.max(0, ...u!.windows.map((w) => w.usedPercent ?? 0));
      if (!best || used < best.used) best = { id, used };
    }
    return best;
  }

  /** An account as people know it: an added one's name, the CLI's own by its email. */
  private accountName(agent: 'claude' | 'codex', account: string | undefined): string {
    if (account) return accountById(this.db, account)?.name ?? 'another account';
    const email = this.controlFor(agent).lastUsage?.account?.email;
    return email ? `${email}` : `your main ${agent === 'claude' ? 'Claude' : 'Codex'} account`;
  }

  /** At a usage limit, with Switch accounts on: another account with usage left takes the session over and it continues; with none, it waits for the first reset (when Resume after usage limits is on). */
  private async switchAtLimit(key: string, resetsAt: number | undefined) {
    if (this.switching.has(key)) return;
    this.switching.add(key);
    try {
      const agent = agentOfKey(key) as 'claude' | 'codex';
      const from = this.accountOf(key);
      const to = await this.freeAccount(agent, from);
      if (!to) {
        if (kvGet(this.db, 'auto_resume') === '1') await this.resumeAfterLimit(key, resetsAt);
        return;
      }
      if (await this.carryOver(key, from, to.id)) return;
      await this.deliverOrQueue(key, `${this.accountName(agent, from)} reached its usage limit, so this session now runs on ${this.accountName(agent, to.id)}. Continue where you left off.`);
    } finally {
      this.switching.delete(key);
    }
  }

  /** Sessions moving to another account right now. */
  private switching = new Set<string>();
  /** Sessions whose running turn stopped on the plan's usage limit, as the agent said. */
  private limitHits = new Set<string>();
  /** Sessions you stopped yourself, until your next message: they never continue by themselves after a limit. */
  private userStopped = new Set<string>();

  /** Continues the session a minute after its limit lifts; when its usage did not say when, it is read first. */
  private async resumeAfterLimit(key: string, resetsAt: number | undefined) {
    const agent = agentOfKey(key);
    if (agent === 'acp') return;
    if (!resetsAt) {
      const u = await this.usageOf(agent, this.accountOf(key), 0);
      const r = u?.limited?.resetsAt ?? Math.max(0, ...(u?.windows ?? []).filter((w) => (w.usedPercent ?? 0) >= 100).map((w) => w.resetsAt ?? 0));
      if (r > Date.now()) resetsAt = r;
    }
    const lifts = this.limitLiftsAt(key);
    const at = typeof lifts === 'number' ? lifts : resetsAt;
    // A turn the CLI started by itself meanwhile (a background task's notice) does not mean it went on: only a
    // turn that got through, or your own message or stop, does.
    if (this.lives.get(key)?.adapter.limitStopped === false || this.userStopped.has(key)) return;
    if (at && !this.resumeLookup?.(key)) this.onLimited?.(key, at + 60_000);
  }

  /**
   * Before a message goes to a session whose account its usage says is at the limit, with Switch accounts on:
   * another account with usage left takes it first, so the message is not turned away.
   */
  private async switchBeforeSend(key: string) {
    const agent = agentOfKey(key);
    if (agent === 'acp' || !autoSwitchOn(this.db) || this.switching.has(key) || this.external.get(key)) return;
    const st = this.lives.get(key)?.adapter.state.status;
    if (st === 'working' || st === 'waiting' || st === 'starting') return;
    if (!this.controlFor(agent, this.accountOf(key)).lastUsage?.limited) return;
    this.switching.add(key);
    try {
      await this.beforeResume(key);
    } finally {
      this.switching.delete(key);
    }
  }

  /**
   * Before a session continues after a usage limit, with Switch accounts on: when its own account is still at
   * the limit and another is not, it moves there. True when a goal it carried over already continues it.
   */
  async beforeResume(key: string): Promise<boolean> {
    const agent = agentOfKey(key);
    if (agent === 'acp' || !autoSwitchOn(this.db)) return false;
    const from = this.accountOf(key);
    if (!SessionManager.usedUp(await this.usageOf(agent, from, 60_000))) return false;
    const to = await this.freeAccount(agent, from);
    return to ? this.carryOver(key, from, to.id) : false;
  }

  /** Moves the session to the account, says so, and brings a Codex goal along. True when that goal continues it by itself. */
  private async carryOver(key: string, from: string | undefined, to: string | undefined): Promise<boolean> {
    const agent = agentOfKey(key) as 'claude' | 'codex';
    const s = this.summary(key);
    // Codex keeps a thread's goal in its account's own folder: it is set again on the new one.
    const goal = agent === 'codex' ? s?.goal : undefined;
    await this.moveToAccount(key, to);
    this.emit('toast', { level: 'info', text: `${s?.title ?? 'A session'}: ${this.accountName(agent, from)} is at its usage limit, so it continues on ${this.accountName(agent, to)}` });
    if (!goal) return false;
    await this.goal(key, 'set', goal.objective);
    if (goal.status === 'active' || goal.status === 'limited') return true;
    await this.goal(key, 'pause');
    return false;
  }

  /** Waits for a session's agent process to end (it is stopped first). */
  private async stopAndWait(key: string) {
    const l = this.lives.get(key);
    if (!l) return;
    const exited = new Promise<void>((resolve) => {
      if (l.adapter.exited) return resolve();
      l.adapter.once('exit', () => resolve());
      setTimeout(resolve, 10_000);
    });
    l.adapter.stop();
    await exited;
    // Its exit handler closes the timeline a moment later; the session starts again after that.
    await new Promise((r) => setTimeout(r, 600));
    if (this.lives.get(key) === l) this.lives.delete(key);
  }

  /**
   * Moves a Claude Code or Codex session's history into another of the agent's accounts (undefined: the CLI's
   * own), which it runs as from then on. Its agent process stops first; it is started again when used.
   */
  async moveToAccount(key: string, to: string | undefined) {
    const agent = agentOfKey(key);
    if (agent === 'acp') throw new HttpError(400, 'Not available for this agent');
    const from = this.accountOf(key);
    if ((from ?? '') === (to ?? '')) return;
    accountEnv(this.db, agent, to);
    if (this.external.get(key)) throw new HttpError(409, 'This session is running in another program');
    const st = this.lives.get(key)?.adapter.state.status;
    if (st === 'working' || st === 'waiting' || st === 'starting') throw new HttpError(409, 'Wait for the turn to end, or stop it');
    await this.stopAndWait(key);
    const file = this.transcriptFor(key);
    const moves = file && fs.existsSync(file) ? historyMoves(this.db, agent, key.slice(key.indexOf(':') + 1), file, from, to) : [];
    // Codex finds a thread only in its account's folder; a Claude session with no transcript has nothing to move.
    if (agent === 'codex' && !moves.length) throw new HttpError(409, 'Its history was not found');
    const taken = moves.find(([, dst]) => fs.existsSync(dst));
    if (taken) throw new HttpError(409, `The other account already has ${taken[1]}`);
    // The app's own links to the old place go first, or the indexer could bring the history back there.
    for (const [src] of moves) {
      const kept = keptOfTranscript(src);
      if (kept) fs.rmSync(kept, { recursive: true, force: true });
    }
    const done: [string, string][] = [];
    try {
      for (const [src, dst] of moves) {
        moveAcross(src, dst);
        done.push([src, dst]);
      }
    } catch (e) {
      for (const [src, dst] of done.reverse()) moveAcross(dst, src);
      throw e;
    }
    const rows = this.db.prepare('select key, path from sessions where path = ? or substr(path, 1, ?) = ?');
    const setPath = this.db.prepare('update sessions set path = ? where key = ?');
    // The index follows the history to its new place.
    for (const [src, dst] of moves) for (const r of rows.all(src, src.length + 1, src + path.sep) as { key: string; path: string }[]) setPath.run(dst + r.path.slice(src.length), r.key);
    this.db.prepare('update app_sessions set account = ? where key = ?').run(to ?? null, key);
    const moved = moves[0]?.[1];
    if (moved) {
      this.timelines.get(key)?.setPath(moved);
      this.indexer.poke([moved]);
    }
    this.queueSummary(key);
  }

  private extraControls = new Map<string, ClaudeControl | CodexControl>();

  /** Sign-in, usage and models for an agent's account: the CLI's own, or an added one. */
  controlFor(agent: 'claude', account?: string | null): ClaudeControl;
  controlFor(agent: 'codex', account?: string | null): CodexControl;
  controlFor(agent: Agent, account?: string | null): ClaudeControl | CodexControl;
  controlFor(agent: Agent, account?: string | null): ClaudeControl | CodexControl {
    if (!account) return agent === 'claude' ? this.claude : this.codex;
    let c = this.extraControls.get(account);
    if (!c) {
      const env = accountEnv(this.db, agent, account);
      c = agent === 'claude' ? new ClaudeControl(env) : new CodexControl(env);
      // Sign-in progress reaches the browser as the default accounts' does.
      c.on('flow', (f) => this.emit('flow', f));
      this.extraControls.set(account, c);
    }
    return c;
  }

  /** Claude Code or Codex was updated: the account processes start again with the new version, and read its models afresh. */
  programsUpdated(ids: string[]) {
    const all = [this.claude, this.codex, ...this.extraControls.values()];
    for (const c of all) if ((c instanceof ClaudeControl && ids.includes('claude')) || (c instanceof CodexControl && ids.includes('codex'))) c.restart();
  }

  /** An added account was removed: its control process goes too. */
  dropControl(account: string) {
    const c = this.extraControls.get(account);
    if (c instanceof CodexControl) c.shutdown();
    this.extraControls.delete(account);
  }

  private sessionCwd(key: string): string | null {
    const r = this.db.prepare('select s.cwd as cwd, a.cwd as app_cwd from sessions s left join app_sessions a on a.key = s.key where s.key = ?').get(key) as
      | { cwd: string | null; app_cwd: string | null }
      | undefined;
    if (r) return r.cwd ?? r.app_cwd;
    const a = this.db.prepare('select cwd from app_sessions where key = ?').get(key) as { cwd: string } | undefined;
    return a?.cwd ?? null;
  }

  async start(key: string, cfg: LiveConfig = {}): Promise<void> {
    if (this.lives.has(key)) return;
    checkModelSwitch(this.db, key, cfg.model);
    const ext = this.external.get(key);
    if (ext) {
      // Two processes appending to one transcript corrupt it.
      throw new HttpError(409, `This session is running in ${ext.client} (pid ${ext.pid}). Continue it there, or close it there to resume it here.`);
    }
    const [agent, id] = [key.slice(0, key.indexOf(':')) as Agent, key.slice(key.indexOf(':') + 1)];
    const cwd = this.sessionCwd(key);
    if (!cwd) throw new HttpError(404, 'Unknown session');
    const prefs = this.summary(key)?.prefs ?? {};
    const model = (cfg.model ?? prefs.model) || undefined;
    const effort = (cfg.effort ?? prefs.effort) || undefined;
    const mode = (cfg.mode ?? prefs.mode) || (agent === 'claude' ? 'default' : 'auto');
    const hasTranscript = !!this.transcriptFor(key) && fs.existsSync(this.transcriptFor(key)!);
    // The account it ran as: its history is in that account's folder, where the agent looks for it.
    const account = agent === 'acp' ? undefined : this.accountOf(key);
    if (agent === 'acp') {
      const r = this.db.prepare('select acp_agent from app_sessions where key = ?').get(key) as { acp_agent: string | null } | undefined;
      await this.spawn('acp', cwd, { sessionId: id, resume: true, model, mode: cfg.mode ?? prefs.mode ?? undefined, acpAgent: r?.acp_agent ?? undefined });
    } else await this.spawn(agent, cwd, agent === 'claude' ? { sessionId: id, resume: hasTranscript, model, effort, mode, account } : { threadId: id, model, effort, mode, account });
    this.db
      .prepare(
        `insert into app_sessions (key, agent, cwd, model, effort, mode, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(key) do update set model = coalesce(excluded.model, model), effort = coalesce(excluded.effort, effort), mode = coalesce(excluded.mode, mode), updated_at = excluded.updated_at`,
      )
      .run(key, agent, cwd, model ?? null, effort ?? null, mode, Date.now(), Date.now());
    if (account) this.db.prepare('update app_sessions set account = ? where key = ?').run(account, key);
  }

  /** An added account was removed: its sessions leave the list (their history stays in its folder unless that was deleted too). */
  forgetAccount(account: string) {
    const keys = (this.db.prepare('select key from app_sessions where account = ?').all(account) as { key: string }[]).map((r) => r.key);
    this.db.prepare('delete from app_sessions where account = ?').run(account);
    if (keys.length) this.emit('sessions', [], keys);
  }

  /** A session of Custom, the app's own agent (ACP agent "console"). */
  private isCustom(key: string): boolean {
    if (!key.startsWith('acp:')) return false;
    const r = this.db.prepare('select acp_agent from app_sessions where key = ?').get(key) as { acp_agent: string | null } | undefined;
    return (this.lives.get(key)?.acpAgent ?? r?.acp_agent) === CONSOLE_ID;
  }

  private live(key: string): Live {
    const l = this.lives.get(key);
    if (!l) throw new HttpError(409, 'The session is not running');
    return l;
  }

  async stop(key: string) {
    this.holdQueue(key);
    const l = this.lives.get(key);
    if (!l) return;
    l.adapter.state.status = 'stopping';
    l.adapter.emit('change');
    l.adapter.stop();
  }

  /** Summarizes the conversation so far to free up context: Claude's /compact, Codex's thread compaction. */
  async compact(key: string) {
    if (key.startsWith('acp:')) throw new HttpError(400, 'Not available for this agent');
    if (!this.lives.has(key)) await this.start(key);
    const l = this.live(key);
    if (l.adapter.state.status === 'working' || l.adapter.state.status === 'waiting') throw new HttpError(409, 'Wait for the turn to end, or stop it, then compact');
    if (l.adapter instanceof CodexLive) await l.adapter.compact();
    else await l.adapter.sendMessage('/compact', []);
  }

  /** Sets, pauses, resumes or clears a session's goal: Codex through its thread goal, Claude Code with /goal, Custom by the app's own loop. */
  async goal(key: string, action: 'set' | 'pause' | 'resume' | 'clear', objective?: string) {
    if (key.startsWith('acp:') && !this.isCustom(key)) throw new HttpError(400, 'Not available for this agent');
    const text = (objective ?? '').trim();
    if (key.startsWith('acp:')) return customGoal(key, action, text);
    if (action === 'set' && !text) throw new HttpError(400, 'Say what the goal is');
    if (key.startsWith('codex:')) {
      if (!this.lives.has(key)) await this.start(key);
      const l = this.live(key);
      if (l.adapter instanceof CodexLive) await l.adapter.goal(action, text);
      return;
    }
    if (action === 'pause' || action === 'resume') throw new HttpError(400, 'Claude Code goals can be set or cleared, not paused');
    await this.deliverOrQueue(key, action === 'set' ? `/goal ${text}` : '/goal clear');
  }

  async interrupt(key: string) {
    this.limitHits.delete(key);
    this.userStopped.add(key);
    const a = this.lives.get(key)?.adapter;
    if (a) a.limitStopped = false;
    this.emit('resumeCancelled', key);
    this.holdQueue(key);
    await this.live(key).adapter.interrupt();
  }

  // ---- queued messages --------------------------------------------------------------

  private queues = new Map<string, { id: string; text: string; images: { path: string; mediaType: string }[]; files: string[]; at: number }[]>();
  /** Queues that wait for Resume: you stopped the agent, or the server restarted. */
  private held = new Set<string>();
  private queuesLoaded = false;

  private loadQueues() {
    if (this.queuesLoaded) return;
    this.queuesLoaded = true;
    for (const r of this.db.prepare('select id, key, text, images, files, created_at from queued order by coalesce(pos, created_at), created_at').all() as { id: string; key: string; text: string; images: string | null; files: string | null; created_at: number }[]) {
      const q = this.queues.get(r.key) ?? [];
      q.push({ id: r.id, text: r.text, images: JSON.parse(r.images ?? '[]'), files: JSON.parse(r.files ?? '[]'), at: r.created_at });
      this.queues.set(r.key, q);
      this.held.add(r.key); // nothing goes out by itself after a restart
    }
  }

  private queueOf(key: string): { queue?: QueuedMessage[]; queueHeld?: boolean } {
    this.loadQueues();
    const q = this.queues.get(key);
    if (!q?.length) return {};
    return {
      queue: q.map((m) => ({
        id: m.id,
        text: m.text,
        at: m.at,
        images: m.images.length || undefined,
        files: m.files.length || undefined,
        att: m.images.length + m.files.length ? [...m.images.map((_, n) => ({ ref: `img:${n}`, name: `Image ${n + 1}`, image: true })), ...m.files.map((f, n) => ({ ref: `file:${n}`, name: path.basename(f), image: false }))] : undefined,
      })),
      queueHeld: this.held.has(key) || undefined,
    };
  }

  /** A queued message's attachment, to show it while it waits. */
  queuedAttachment(key: string, id: string, ref: string): { path: string; mediaType?: string; name: string } {
    this.loadQueues();
    const m = this.queues.get(key)?.find((x) => x.id === id);
    const [kind, n] = ref.split(':');
    const img = kind === 'img' ? m?.images[Number(n)] : undefined;
    const file = kind === 'file' ? m?.files[Number(n)] : undefined;
    const p = img?.path ?? file;
    if (!p || !path.resolve(p).startsWith(paths.uploads + path.sep)) throw new HttpError(404, 'That attachment is gone');
    return { path: p, mediaType: img?.mediaType, name: path.basename(p) };
  }

  /** Puts a session's queued messages in this order (messages missing from `ids` keep their place after them). */
  reorderQueued(key: string, ids: string[]) {
    this.loadQueues();
    const q = this.queues.get(key);
    if (!q?.length) return;
    const rank = new Map(ids.map((id, i) => [id, i]));
    const next = [...q].sort((a, b) => (rank.get(a.id) ?? ids.length + q.indexOf(a)) - (rank.get(b.id) ?? ids.length + q.indexOf(b)));
    this.queues.set(key, next);
    const set = this.db.prepare('update queued set pos = ? where id = ?');
    this.db.transaction(() => next.forEach((m, i) => set.run(i, m.id)))();
    this.queueSummary(key);
  }

  /** Adds a message to send when the running turn ends (or now, if the session is idle and not held). */
  enqueue(key: string, text: string, images: ImageInput[] = [], files: FileInput[] = []) {
    if (!text.trim() && !images.length && !files.length) throw new HttpError(400, 'Empty message');
    this.loadQueues();
    const saved = this.saveImages(images).map((i) => ({ path: i.path!, mediaType: i.mediaType }));
    const m = { id: crypto.randomUUID(), text, images: saved, files: this.saveFiles(files), at: Date.now() };
    this.db.prepare('insert into queued (id, key, text, images, files, created_at) values (?, ?, ?, ?, ?, ?)').run(m.id, key, m.text, JSON.stringify(m.images), JSON.stringify(m.files), m.at);
    this.queues.set(key, [...(this.queues.get(key) ?? []), m]);
    this.queueSummary(key);
    const st = this.lives.get(key)?.adapter.state.status;
    if (st === 'idle' && !this.held.has(key)) this.dispatchQueued(key);
  }

  private take(key: string, id?: string) {
    const q = this.queues.get(key) ?? [];
    const i = id ? q.findIndex((m) => m.id === id) : 0;
    if (i < 0 || !q[i]) return null;
    const [m] = q.splice(i, 1);
    if (q.length) this.queues.set(key, q);
    else {
      this.queues.delete(key);
      this.held.delete(key);
    }
    this.db.prepare('delete from queued where id = ?').run(m.id);
    this.queueSummary(key);
    return m;
  }

  private async deliver(key: string, m: NonNullable<ReturnType<SessionManager['take']>>) {
    const images: ImageInput[] = m.images.flatMap((i) => {
      try {
        return [{ mediaType: i.mediaType, data: fs.readFileSync(i.path).toString('base64'), path: i.path }];
      } catch {
        return [];
      }
    });
    if (!this.lives.has(key)) await this.start(key);
    await this.snapshot(key);
    await this.live(key).adapter.sendMessage(await withNotes(key, withFiles(m.text, m.files), m.text), images);
    this.touchApp(key);
  }

  private dispatchQueued(key: string) {
    if (this.held.has(key) || this.lives.get(key)?.adapter.state.status !== 'idle') return;
    // A capability may refuse it (a spending cap reached): the queue then waits for you.
    beforeSend(key).then(
      () => {
        const m = this.take(key);
        if (m) this.deliver(key, m).catch((e) => this.emit('toast', { level: 'error', text: `A queued message was not sent: ${(e as Error).message}` }));
      },
      (e) => {
        this.holdQueue(key);
        this.emit('toast', { level: 'error', text: `The queue is on hold: ${(e as Error).message}` });
      },
    );
  }

  /** Sends one queued message right away: into the running turn if there is one. */
  async sendQueuedNow(key: string, id: string) {
    const m = this.take(key, id);
    if (!m) throw new HttpError(404, 'That message already went out');
    await this.deliver(key, m);
  }

  /**
   * Changes a queued message: its text and, when `keep` is given, which attachments stay (by ref)
   * plus new ones. Attachments taken off are deleted.
   */
  editQueued(key: string, id: string, o: { text: string; keep?: string[]; images?: ImageInput[]; files?: FileInput[] }) {
    this.loadQueues();
    const m = this.queues.get(key)?.find((x) => x.id === id);
    if (!m) throw new HttpError(404, 'That message already went out');
    let images = m.images;
    let files = m.files;
    let dropped: string[] = [];
    if (o.keep) {
      const keep = new Set(o.keep);
      dropped = [...m.images.filter((_, n) => !keep.has(`img:${n}`)).map((i) => i.path), ...m.files.filter((_, n) => !keep.has(`file:${n}`))];
      images = [...m.images.filter((_, n) => keep.has(`img:${n}`)), ...this.saveImages(o.images ?? []).map((i) => ({ path: i.path!, mediaType: i.mediaType }))];
      files = [...m.files.filter((_, n) => keep.has(`file:${n}`)), ...this.saveFiles(o.files ?? [])];
      if (images.length > 8) {
        dropped.push(...images.slice(8).map((i) => i.path));
        images = images.slice(0, 8);
      }
    }
    if (!o.text.trim() && !images.length && !files.length) throw new HttpError(400, 'A message needs some text or an attachment');
    Object.assign(m, { text: o.text, images, files });
    this.db.prepare('update queued set text = ?, images = ?, files = ? where id = ?').run(o.text, JSON.stringify(images), JSON.stringify(files), id);
    removeUploads(dropped);
    this.queueSummary(key);
  }

  /** Takes a message off the queue without sending it; its attachments go too. */
  dropQueued(key: string, id: string) {
    const m = this.take(key, id);
    if (m) removeUploads([...m.images.map((i) => i.path), ...m.files]);
  }

  private holdQueue(key: string) {
    if (this.queues.get(key)?.length) {
      this.held.add(key);
      this.queueSummary(key);
    }
  }

  resumeQueue(key: string) {
    this.held.delete(key);
    this.queueSummary(key);
    this.dispatchQueued(key);
  }

  private saveImages(images: ImageInput[]): ImageInput[] {
    return images.slice(0, 8).map((img) => {
      const ext = (img.mediaType.split('/')[1] ?? 'png').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'png';
      const file = path.join(paths.uploads, `${crypto.randomUUID()}.${ext}`);
      fs.writeFileSync(file, Buffer.from(img.data, 'base64'), { mode: 0o600 });
      return { ...img, path: file };
    });
  }

  /** Each message's files go in their own folder, so they keep their names. */
  private saveFiles(files: FileInput[]): string[] {
    if (!files.length) return [];
    const dir = path.join(paths.uploads, crypto.randomUUID().slice(0, 8));
    fs.mkdirSync(dir, { mode: 0o700 });
    const used = new Set<string>();
    return files.slice(0, 20).map((f, i) => {
      let name = String(f.name ?? '').replace(/[/\\\0]/g, '_').replace(/^\.+/, '_').slice(0, 120) || `file-${i + 1}`;
      if (used.has(name)) name = `${i + 1}-${name}`;
      used.add(name);
      const file = path.join(dir, name);
      fs.writeFileSync(file, Buffer.from(String(f.data ?? ''), 'base64'), { mode: 0o600, flag: 'wx' });
      return file;
    });
  }

  /** Set by the scheduler: when a session will be continued after a usage limit. */
  resumeLookup?: (key: string) => number | undefined;
  /** Set by the scheduler: continue this session at `at` (a usage limit stopped it). */
  onLimited?: (key: string, at: number) => void;

  /** Sends now when the agent is free, or queues the message for after the running turn. */
  async deliverOrQueue(key: string, text: string) {
    const st = this.lives.get(key)?.adapter.state.status;
    if (st === 'working' || st === 'waiting' || st === 'starting') this.enqueue(key, text);
    else await this.send(key, text);
  }

  /** Saves attachments on their own (an answer to a question carries their paths), returning where they went. */
  saveUploads(images: ImageInput[], files: FileInput[]): { path: string; name: string; image: boolean }[] {
    const imgs = this.saveImages(images).map((i, n) => ({ path: i.path!, name: images[n]?.name || `image-${n + 1}.${path.extname(i.path!).slice(1)}`, image: true }));
    const docs = this.saveFiles(files).map((p) => ({ path: p, name: path.basename(p), image: false }));
    return [...imgs, ...docs];
  }

  async send(key: string, text: string, images: ImageInput[] = [], files: FileInput[] = []) {
    if (!text.trim() && !images.length && !files.length) throw new HttpError(400, 'Empty message');
    await beforeSend(key);
    await this.switchBeforeSend(key).catch(() => {});
    if (!this.lives.has(key)) await this.start(key);
    const l = this.live(key);
    // ACP agents take one message at a time: one sent mid-turn waits in the queue.
    if (l.agent === 'acp' && ['working', 'waiting', 'starting'].includes(l.adapter.state.status)) return this.enqueue(key, text, images, files);
    await this.snapshot(key);
    this.limitHits.delete(key);
    this.userStopped.delete(key);
    l.adapter.limitStopped = false;
    this.emit('resumeCancelled', key);
    await l.adapter.sendMessage(await withNotes(key, withFiles(text, this.saveFiles(files)), text), this.saveImages(images));
    this.touchApp(key);
  }

  /**
   * Continues here a Claude Code session that is open in VS Code or a terminal: ends that
   * process first (two writers corrupt the transcript), then resumes it, optionally with a
   * message. Not for Codex, whose one app-server process serves every thread in its window.
   */
  async takeover(key: string, text = '', images: ImageInput[] = [], files: FileInput[] = []) {
    this.external.poll();
    const ext = this.external.get(key);
    if (ext) {
      if (!key.startsWith('claude:')) throw new HttpError(409, `Codex in ${ext.client} serves all its threads from one process, so it can't be closed for one session. Continue it there.`);
      await endProcess(ext.pid);
      this.external.poll();
      if (this.external.get(key)) throw new HttpError(409, `The session is still running in ${ext.client}.`);
    }
    if (text.trim() || images.length || files.length) await this.send(key, text, images, files);
    else await this.start(key);
  }

  async answer(key: string, approvalId: string, a: ApprovalAnswer) {
    const ad = this.live(key).adapter;
    if (ad.answerAside(approvalId, a)) return;
    await ad.answer(approvalId, a);
  }

  async configure(key: string, cfg: LiveConfig) {
    // A confidential session switches only to another model on this computer.
    checkModelSwitch(this.db, key, cfg.model);
    const l = this.lives.get(key);
    if (l) await l.adapter.configure(cfg);
    const agent = agentOfKey(key);
    this.db
      .prepare(
        `insert into app_sessions (key, agent, model, effort, mode, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)
         on conflict(key) do update set model = case when ? then excluded.model else model end,
           effort = case when ? then excluded.effort else effort end, mode = case when ? then excluded.mode else mode end`,
      )
      .run(key, agent, cfg.model ?? null, cfg.effort ?? null, cfg.mode ?? null, Date.now(), Date.now(), cfg.model !== undefined ? 1 : 0, cfg.effort !== undefined ? 1 : 0, cfg.mode !== undefined ? 1 : 0);
    this.savePrefs(agent, { model: cfg.model ?? undefined, effort: cfg.effort ?? undefined, mode: cfg.mode ?? undefined });
    this.queueSummary(key);
  }

  async stopTask(key: string, taskId: string) {
    await this.live(key).adapter.stopTask(taskId);
  }

  /** The title the helper model gave a new session: kept unless it has one by now (renamed meanwhile), and told to its agent. */
  private async autoTitle(key: string, title: string) {
    if (!this.db.prepare('update app_sessions set title = ? where key = ? and title is null').run(title.slice(0, 200), key).changes) return;
    await this.lives
      .get(key)
      ?.adapter.rename(title)
      .catch(() => {});
    this.queueSummary(key);
  }

  async rename(key: string, title: string) {
    const t = title.trim().slice(0, 200);
    const agent = agentOfKey(key);
    this.db
      .prepare(`insert into app_sessions (key, agent, title, created_at, updated_at) values (?, ?, ?, ?, ?) on conflict(key) do update set title = excluded.title`)
      .run(key, agent, t || null, Date.now(), Date.now());
    const l = this.lives.get(key);
    if (l && t) await l.adapter.rename(t);
    else if (agent === 'codex' && t) await this.codex.setThreadName(key.slice(6), t).catch(() => {});
    this.queueSummary(key);
  }

  /** Saves a sidebar group's order as dragged: each key gets its position (1..n). */
  setOrder(keys: string[]) {
    const ensure = this.db.prepare(`insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?) on conflict(key) do nothing`);
    const set = this.db.prepare('update app_sessions set sort_order = ? where key = ?');
    this.db.transaction(() => {
      keys.forEach((key, i) => {
        ensure.run(key, agentOfKey(key), Date.now(), Date.now());
        set.run(i + 1, key);
      });
    })();
    for (const k of keys) this.queueSummary(k);
  }

  setFlags(key: string, flags: { archived?: boolean; pinned?: boolean; snoozedUntil?: number | null }) {
    const agent = agentOfKey(key);
    this.db.prepare(`insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?) on conflict(key) do nothing`).run(key, agent, Date.now(), Date.now());
    if (flags.archived !== undefined) this.db.prepare('update app_sessions set archived = ? where key = ?').run(flags.archived ? 1 : 0, key);
    if (flags.pinned !== undefined) this.db.prepare('update app_sessions set pinned = ? where key = ?').run(flags.pinned ? 1 : 0, key);
    if (flags.snoozedUntil !== undefined) this.db.prepare('update app_sessions set snooze_until = ? where key = ?').run(flags.snoozedUntil && flags.snoozedUntil > Date.now() ? Math.round(flags.snoozedUntil) : null, key);
    this.queueSummary(key);
  }

  /** What waits on the user in the sessions: each approval, question and form, and sessions waiting elsewhere (VS Code, a terminal). */
  inbox(): InboxItem[] {
    const out: InboxItem[] = [];
    for (const l of this.lives.values()) {
      const s = this.summary(l.key);
      for (const a of l.adapter.approvals.values())
        out.push({ id: `approval:${l.key}:${a.id}`, kind: approvalKind(a), title: a.title, key: l.key, session: s?.title, agent: l.agent, at: a.createdAt, path: `/s/${encodeURIComponent(l.key)}`, approval: a });
    }
    for (const [key, ext] of this.external.states)
      if (ext.status === 'waiting') {
        const s = this.summary(key);
        out.push({ id: `elsewhere:${key}`, kind: 'elsewhere', title: `Waiting for you in ${ext.client}`, detail: ext.detail, key, session: s?.title, agent: s?.agent, at: ext.since ?? Date.now(), path: `/s/${encodeURIComponent(key)}` });
      }
    return out;
  }

  /** The agent process's adapter, by its run id: for cards the app shows itself (a connected app's form). */
  adapterByRun(runId: string): LiveAdapter | null {
    for (const l of this.lives.values()) if (l.runner.meta.runId === runId) return l.adapter;
    return null;
  }

  /** The run id of a session's agent process, while one runs. */
  runOf(key: string): string | undefined {
    return this.lives.get(key)?.runner.meta.runId;
  }

  /**
   * Ends a session's agent process while it is idle, so the next message starts it afresh with what its
   * instructions say now (changed Agent Guidelines). Unlike stop, its queue stays as it is.
   */
  async recycle(key: string): Promise<void> {
    const l = this.lives.get(key);
    if (!l || l.adapter.state.status !== 'idle') return;
    const exited = new Promise<void>((resolve) => {
      if (l.adapter.exited) return resolve();
      l.adapter.once('exit', () => resolve());
      setTimeout(resolve, 10_000).unref?.();
    });
    l.adapter.stop();
    await exited;
    if (this.lives.get(key) === l) this.lives.delete(key);
  }

  /** The live session an agent process belongs to, by the run id it was started with. */
  liveByRun(runId: string): { key: string; agent: Agent; cwd: string; acpAgent?: string } | null {
    for (const l of this.lives.values()) if (l.runner.meta.runId === runId) return { key: l.key, agent: l.agent, cwd: l.cwd, acpAgent: l.acpAgent };
    return null;
  }

  /** Links a pull request to the session, or unlinks it (it stays on its host). */
  setPr(key: string, pr: PullRequestInfo | null) {
    const agent = agentOfKey(key);
    this.db.prepare(`insert into app_sessions (key, agent, created_at, updated_at) values (?, ?, ?, ?) on conflict(key) do nothing`).run(key, agent, Date.now(), Date.now());
    this.db.prepare('update app_sessions set pr = ? where key = ?').run(pr ? JSON.stringify(pr) : null, key);
    this.queueSummary(key);
  }

  /** Sessions whose pull request is still open, for the status checks. */
  openPrs(): { key: string; pr: PullRequestInfo }[] {
    const rows = this.db.prepare('select key, pr from app_sessions where pr is not null').all() as { key: string; pr: string }[];
    return rows.map((r) => ({ key: r.key, pr: parseJson<PullRequestInfo>(r.pr)! })).filter((r) => r.pr && (r.pr.state === 'open' || r.pr.state === 'draft'));
  }

  /** Brings snoozed sessions back when their time comes. */
  private wakeSnoozed() {
    const due = this.db.prepare('select key from app_sessions where snooze_until is not null and snooze_until <= ?').all(Date.now()) as { key: string }[];
    for (const { key } of due) {
      this.db.prepare('update app_sessions set snooze_until = null where key = ?').run(key);
      this.queueSummary(key);
      const s = this.summary(key);
      if (s) this.emit('toast', { level: 'info', text: `Back from snooze · ${s.title}` });
    }
  }

  /**
   * Finished work out of the way: the agent process stops (when it is not in the middle of a turn) and
   * the session counts as read. Its history and any worktree stay.
   */
  async settle(key: string) {
    const st = this.lives.get(key)?.adapter.state.status;
    if (st === 'working' || st === 'waiting' || st === 'starting') throw new HttpError(409, 'It is still working; stop it first');
    if (this.lives.has(key)) await this.stop(key);
    this.markSeen(key);
  }

  /**
   * Stops the session and deletes its transcript (and Codex thread state). With `keepActivity` (the clean-up of
   * inactive sessions), its numbers stay in Activity, as for a transcript deleted elsewhere.
   */
  async remove(key: string, o: { keepActivity?: boolean } = {}) {
    dropNotes(this.db, key);
    const l = this.lives.get(key);
    if (l) {
      const exited = new Promise<void>((resolve) => {
        if (l.adapter.exited) return resolve();
        l.adapter.once('exit', () => resolve());
        setTimeout(resolve, 10_000);
      });
      l.adapter.stop();
      await exited;
      this.lives.delete(key);
    }
    const file = this.transcriptFor(key);
    // The app's own link to it goes first, or the indexer would bring the transcript back.
    const kept = file ? keptOfTranscript(file) : null;
    if (kept) forgetKept(kept);
    if (key.startsWith('acp:')) {
      if (file) fs.rmSync(file, { force: true });
    } else if (key.startsWith('codex:')) {
      const id = key.slice(6);
      await this.codex.deleteThread(id).catch(() => {
        if (file) fs.rmSync(file, { force: true });
      });
      if (file) fs.rmSync(file, { force: true });
    } else if (file) {
      fs.rmSync(file, { force: true });
      fs.rmSync(file.replace(/\.jsonl$/, ''), { recursive: true, force: true });
      removeSessionScratch(path.basename(path.dirname(file)), path.basename(file, '.jsonl'));
      // Leave no empty project folder behind (Claude Code also leaves an empty memory/ in it).
      const dir = path.dirname(file);
      try {
        fs.rmdirSync(path.join(dir, 'memory'));
      } catch {}
      try {
        fs.rmdirSync(dir);
      } catch {}
    }
    // Messages still waiting to go out, and their attachments, go with it.
    this.loadQueues();
    for (const m of [...(this.queues.get(key) ?? [])]) this.dropQueued(key, m.id);
    this.db.prepare('delete from queued where key = ?').run(key);
    this.db.prepare('delete from chunk_text where key = ?').run(key);
    if (o.keepActivity)
      this.db
        .prepare('insert or replace into retired (key, cwd, model, acp_agent) select s.key, s.cwd, s.model, a.acp_agent from sessions s left join app_sessions a on a.key = s.key where s.key = ?')
        .run(key);
    else {
      this.db.prepare('delete from activity where key = ? or root = ?').run(key, key);
      this.db.prepare('delete from retired where key = ?').run(key);
    }
    this.db.prepare('delete from sessions where key = ?').run(key);
    this.db.prepare('delete from app_sessions where key = ?').run(key);
    // Sessions it continued from, or into, no longer point at it.
    for (const k of (this.db.prepare('select key from app_sessions where handoff_to = ? or handoff_from = ?').all(key, key) as { key: string }[]).map((r) => r.key)) {
      this.db.prepare('update app_sessions set handoff_to = nullif(handoff_to, ?), handoff_from = nullif(handoff_from, ?) where key = ?').run(key, key, k);
      this.queueSummary(k);
    }
    const tl = this.timelines.get(key);
    tl?.dispose();
    this.timelines.delete(key);
    this.emit('sessions', [], [key]);
  }

  private reapIdle() {
    if (!config.idleStopMs) return;
    const now = Date.now();
    for (const l of this.lives.values()) {
      const s = l.adapter.state;
      if (s.status === 'idle' && !s.pendingApprovals && !(s.backgroundTasks?.length) && now - l.adapter.lastActivity > config.idleStopMs) {
        console.log(`[idle] stopping ${l.key}`);
        l.adapter.stop();
      }
    }
  }

  /** Usage from a running Claude session of the account, when there is one (avoids a probe process). */
  liveClaudeUsage(account?: string): (() => Promise<any>) | undefined {
    for (const l of this.lives.values()) {
      if (l.adapter instanceof ClaudeLive && (l.account ?? undefined) === (account || undefined) && l.adapter.state.status !== 'starting' && !l.adapter.exited) {
        const a = l.adapter;
        return () => a.usage();
      }
    }
    return undefined;
  }

  /** What each ACP agent offered when it last opened a session: its modes and models. */
  private acpOffers = new Map<string, Pick<AgentCatalog, 'models' | 'modes'>>();

  /** Console's models and modes (set by the server, which keeps the models). */
  consoleOffers?: () => AgentCatalog;

  async catalog(agent: Agent, acpId?: string): Promise<AgentCatalog> {
    if (agent === 'acp' && acpId === CONSOLE_ID && this.consoleOffers) return this.consoleOffers();
    if (agent === 'acp') {
      const o = this.acpOffers.get(acpId ?? '');
      return { models: o?.models ?? [], modes: o?.modes ?? [], defaultMode: '' };
    }
    if (agent === 'claude') {
      const models = await this.claude.models().catch(() => []);
      // No models: Claude Code did not start (asking for its commands would only start it again), and the menu says why.
      const why = models.length ? null : this.claude.modelsError;
      if (why) return { models, modes: CLAUDE_MODES, defaultMode: this.defaults('claude').mode ?? 'default', commands: [], modelsError: why };
      const commands = await this.claude.commands().catch(() => []);
      return { models, modes: CLAUDE_MODES, defaultMode: this.defaults('claude').mode ?? 'default', commands };
    }
    const models = await this.codex.models().catch(() => []);
    const sandbox = await this.codexSandbox();
    return {
      models,
      modes: CODEX_MODES.map(({ value, label, description }) => ({ value, label, description })),
      defaultMode: this.defaults('codex').mode ?? (sandbox ? 'auto' : 'full'),
      modeNote: sandbox
        ? undefined
        : 'Codex’s sandbox can’t start here (containers block the namespaces it needs), so in the other modes each command first fails and asks to run without it. The container keeps the agent in.',
    };
  }

  private sandboxOk?: Promise<boolean>;

  /** Whether Codex can run commands in its own sandbox on this machine; inside Docker it cannot. */
  private codexSandbox(): Promise<boolean> {
    this.sandboxOk ??= new Promise((resolve) => {
      if (process.platform !== 'linux') return resolve(true);
      execFile(config.codexBin, ['sandbox', '--', 'true'], { timeout: 15_000, cwd: os.tmpdir(), env: codexEnv(agentBaseEnv()) }, (err) => resolve(!err));
    });
    return this.sandboxOk;
  }
}

export { claudeUsage };
