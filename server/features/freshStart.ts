// Claude Code and Codex read their instructions and list their tools once, when they start. A capability whose
// part of those depends on a session's settings (its guidelines, Swarm mode, a deep research) keeps what each run
// was given, and before the next message ends an idle agent whose settings now say otherwise, so that message
// starts it afresh with them.
import type { Deps } from './types.ts';

/** What a capability gave each run as it started, in a few words, for the latest runs. */
export class GivenAtStart {
  private readonly byRun = new Map<string, string>();
  constructor(private readonly max = 500) {}

  note(runId: string, what: string) {
    this.byRun.delete(runId);
    this.byRun.set(runId, what);
    if (this.byRun.size > this.max) this.byRun.delete(this.byRun.keys().next().value!);
  }

  get(runId: string): string | undefined {
    return this.byRun.get(runId);
  }

  /**
   * Before a message to `key`: ends its agent when what its run was given differs from `now()`, if it is a Claude
   * Code or Codex agent this app started, idle, with no goal or background work a new process would lose.
   */
  async refresh(key: string, d: Pick<Deps, 'sessions'>, now: () => string): Promise<void> {
    if (!key.startsWith('claude:') && !key.startsWith('codex:')) return;
    const run = d.sessions.runOf(key);
    const was = run ? this.byRun.get(run) : undefined;
    if (!run || was === undefined) return;
    const st = d.sessions.adapterByRun(run)?.state;
    if (!st || st.status !== 'idle' || st.goal || st.backgroundTasks?.length) return;
    if (now() === was) return;
    await d.sessions.recycle(key);
  }
}
