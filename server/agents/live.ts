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
