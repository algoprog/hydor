import { EventEmitter } from 'node:events';
import type {
  Agent,
  ApprovalRequest,
  BackgroundTask,
  LiveOverlay,
  LiveState,
  TimelineItem,
  ToolInfo,
} from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import type { Runner } from '../runner/client.ts';

export interface ImageInput {
  mediaType: string;
  /** base64 */
  data: string;
  /** Saved copy on disk (Codex takes local paths). */
  path?: string;
  /** The file's own name, when it had one. */
  name?: string;
}

export interface ApprovalAnswer {
  decision: string;
  message?: string;
  answers?: Record<string, string>;
  /** A form's values, by field (as the form's controls give them). */
  form?: Record<string, string>;
}

/**
 * One model call's use, as an agent reports it while it works (spending caps are checked after each).
 * A call reported again under the same id replaces what was said of it.
 */
export interface ModelCall {
  id: string;
  model?: string;
  /** Fresh input, input read from the cache, output. */
  tokens?: { in: number; cached: number; out: number };
  /** Its cost in dollars, when the agent knows it (Custom). */
  usd?: number;
}

export interface LiveConfig {
  model?: string | null;
  effort?: string | null;
  mode?: string | null;
}

/**
 * One running agent process. Events:
 *   'change'     live state or overlay changed (throttled by the session manager)
 *   'activity'   the agent wrote something; re-read the transcript
 *   'identity'   the session id / transcript path became known
 *   'ratelimit'  fresh plan-usage numbers
 *   'limithit'   the turn stopped because the plan's usage ran out
 *   'call'       a model call finished: what it used (ModelCall)
 *   'exit'
 */
export abstract class LiveAdapter extends EventEmitter {
  abstract readonly agent: Agent;
  state: LiveState;
  overlayItems = new Map<string, TimelineItem>();
  patches = new Map<string, Partial<ToolInfo>>();
  approvals = new Map<string, ApprovalRequest>();
  tasks = new Map<string, BackgroundTask>();
  /** Session id once known (Claude: given or from init; Codex: the thread id). */
  sessionId?: string;
  transcriptPath?: string;
  exited = false;
  lastActivity = Date.now();
  /** Cards the app asks for itself (a connected app's form), beside the agent's own approvals: answered here. */
  private asides = new Map<string, { done: (a: ApprovalAnswer | null) => void; check?: (a: ApprovalAnswer) => string | null }>();

  constructor(public readonly runner: Runner) {
    super();
    this.state = { status: 'starting', startedAt: Date.now(), pendingApprovals: 0 };
    runner.on('exit', (info) => {
      this.exited = true;
      this.state = {
        ...this.state,
        status: 'exited',
        pendingApprovals: 0,
        error: info.code && info.code !== 0 ? `exited with code ${info.code}` : info.error ?? undefined,
      };
      this.overlayItems.clear();
      this.approvals.clear();
      this.patches.clear();
      this.onExited();
      this.emit('exit', info);
      this.changed();
    });
  }

  protected onExited() {}

  protected changed() {
    // The app's own cards end when the agent's code clears the approvals (the turn ended, it stopped).
    for (const [id, x] of this.asides) if (!this.approvals.has(id)) x.done(null);
    if (this.asides.size && this.state.status === 'working') this.state.status = 'waiting';
    this.state.pendingApprovals = this.approvals.size;
    this.state.backgroundTasks = [...this.tasks.values()].filter((t) => t.status === 'running');
    this.emit('change');
  }

  protected touch() {
    this.lastActivity = Date.now();
  }

  overlay(): LiveOverlay {
    return {
      items: [...this.overlayItems.values()],
      patches: Object.fromEntries(this.patches),
      approvals: [...this.approvals.values()],
    };
  }

  /** Drops overlay entries the transcript now has. */
  prune(has: (id: string) => boolean, userTexts: (sinceTs: number) => string[]) {
    let changed = false;
    for (const [id, item] of this.overlayItems) {
      let gone = has(id);
      if (!gone && item.kind === 'user') {
        // The CLI may store the prompt under its own id; match on the text instead.
        gone = userTexts((item.ts ?? 0) - 5000).some((t) => t.trim() === item.text.trim());
      }
      if (gone) {
        this.overlayItems.delete(id);
        changed = true;
      }
    }
    for (const [id, p] of this.patches) {
      if (p.status && p.status !== 'running' && has(id)) {
        this.patches.delete(id);
        changed = true;
      }
    }
    if (changed) this.changed();
  }

  /**
   * Shows a card of the app's own in the session (a connected app asks for a form) and waits for the
   * user: their answer, or null when the turn ended, the agent stopped or `signal` aborted first. An
   * answer `check` finds wrong is refused with what to fix, and the card stays.
   */
  ask(req: ApprovalRequest, o: { signal?: AbortSignal; check?: (a: ApprovalAnswer) => string | null } = {}): Promise<ApprovalAnswer | null> {
    const { signal } = o;
    return new Promise((resolve) => {
      if (this.exited || signal?.aborted) return resolve(null);
      const done = (a: ApprovalAnswer | null) => {
        if (!this.asides.delete(req.id)) return;
        signal?.removeEventListener('abort', abort);
        if (this.approvals.delete(req.id) && this.state.status === 'waiting' && !this.approvals.size) this.state.status = 'working';
        resolve(a);
        this.changed();
      };
      const abort = () => done(null);
      signal?.addEventListener('abort', abort, { once: true });
      this.asides.set(req.id, { done, check: o.check });
      this.approvals.set(req.id, req);
      this.state.status = 'waiting';
      this.changed();
    });
  }

  /** Answers one of the app's own cards; false when the card is the agent's. */
  answerAside(id: string, a: ApprovalAnswer): boolean {
    const x = this.asides.get(id);
    if (!x) return false;
    const wrong = x.check?.(a);
    if (wrong) throw new HttpError(400, wrong);
    x.done(a);
    return true;
  }

  abstract sendMessage(text: string, images: ImageInput[]): Promise<void>;
  abstract interrupt(): Promise<void>;
  abstract answer(approvalId: string, answer: ApprovalAnswer): Promise<void>;
  abstract configure(cfg: LiveConfig): Promise<void>;
  abstract stopTask(taskId: string): Promise<void>;
  abstract rename(title: string): Promise<void>;

  stop() {
    this.runner.stop();
  }
}

export function approvalTitleFor(tool: string, input: Record<string, any>): string {
  switch (tool) {
    case 'Bash':
      return 'Run a command';
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return `Edit ${String(input.file_path ?? input.notebook_path ?? 'a file').split('/').pop()}`;
    case 'WebFetch':
      return `Fetch ${input.url ?? 'a page'}`;
    case 'WebSearch':
      return `Search the web`;
    case 'ExitPlanMode':
      return 'Approve the plan';
    case 'AskUserQuestion':
      return 'Claude has a question';
    default:
      if (tool.startsWith('mcp__')) {
        const [, server, ...rest] = tool.split('__');
        return `Use ${server} · ${rest.join('__')}`;
      }
      return `Use ${tool}`;
  }
}
