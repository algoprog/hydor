// A subagent of the session's own program (a Claude Code subagent, a Codex subagent) in its lead's conversation, under the
// turn that started it: the same card as a Hydor subagent's (ChildCard), made from the call that started it and the lead's
// live tasks. Its title, what it is, how it stands, a way in (its own session, or its task's panel before it has one),
// and Stop while it works (Claude Code's, from here).
import { useMemo } from 'react';
import type { BackgroundTask, SessionSummary, TimelineItem } from '@shared/types';
import { openSession } from '../../lib/nav';
import { useLive, useSessions } from '../../lib/store';
import { programSubs, taskOfSub, type ProgramSub } from '../../lib/work';
import { useTaskPanel } from '../session/TaskLog';
import { ProgramSubRow } from '../session/WorkRow';

/** What the lead runs and lists: whether its program runs (here or in another client), and the tasks it lists. */
export function useLeadTasks(sessionKey: string) {
  const s = useSessions((x) => x.byKey[sessionKey]);
  const lv = useLive((x) => x.byKey[sessionKey]);
  const live = lv?.live ?? s?.live ?? null;
  // Tasks of a session open elsewhere are listed, not stoppable from here.
  const here = !!live && live.status !== 'exited';
  const alive = (here && live.status !== 'error') || !!s?.external;
  const running = live?.backgroundTasks;
  const ended = live?.endedTasks;
  const outside = s?.external?.backgroundTasks;
  const tasks = useMemo(() => (here ? [...(running ?? []), ...(ended ?? [])] : (outside ?? [])), [here, running, ended, outside]);
  return { s, here, alive, tasks };
}

/** What stops a subagent: its task, or one made of what is known of it (Claude Code's task has its id). */
export const stoppable = (s: Pick<SessionSummary, 'agent'> | undefined, here: boolean, sub: ProgramSub, tasks: BackgroundTask[]): BackgroundTask | undefined => {
  if (!here || s?.agent !== 'claude' || sub.state !== 'running') return undefined;
  const t = taskOfSub(sub, tasks);
  return t ?? (sub.id ? { id: sub.id, description: sub.title, kind: 'local_agent', status: 'running', startedAt: sub.startedAt } : undefined);
};

/** The cards of the subagents the calls `items` (one turn's) started: one each, in order. */
export function ProgramCards({ items, sessionKey }: { items: TimelineItem[]; sessionKey: string }) {
  const { s, here, alive, tasks } = useLeadTasks(sessionKey);
  const panel = useTaskPanel(sessionKey, here, tasks);
  const subs = useMemo(() => {
    const ids = new Set(items.filter((i) => i.kind === 'tool' && i.tool.subagent).map((i) => i.id));
    // Tasks no call of this turn started belong to other turns (or to none loaded yet): not cards here.
    return s ? programSubs(s.agent, items, tasks, alive).filter((x) => x.toolUseId && ids.has(x.toolUseId)) : [];
  }, [s?.agent, items, tasks, alive]);
  if (!s || !subs.length) return null;
  return (
    <>
      {subs.map((sub) => {
        const t = taskOfSub(sub, tasks);
        const stop = stoppable(s, here, sub, tasks);
        return (
          <ProgramSubRow
            key={sub.toolUseId}
            card
            lead={s}
            sub={sub}
            onOpen={sub.key ? () => openSession(sub.key!) : t ? () => panel.open(t) : undefined}
            onStop={stop ? () => panel.stop(stop) : undefined}
          />
        );
      })}
      {panel.node}
    </>
  );
}
