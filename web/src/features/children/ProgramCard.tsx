// The subagents of the session's own program (Claude Code's, Codex's) in its lead's conversation, under the turn that
// started them: ONE compact group for the turn (SubagentGroup, the same as Hydor subagents have), made from the calls that
// started them and the lead's live tasks. Each row has its title, how it stands, a way in (its own session, or its task's
// panel before it has one) and Stop while it works (Claude Code's, from here); a menu on the group stops them all.
import { useMemo } from 'react';
import type { BackgroundTask, SessionSummary, TimelineItem } from '@shared/types';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { findModel, modelLabel, useCatalog } from '../../components/AgentPickers';
import { enc, post } from '../../lib/api';
import { openSession } from '../../lib/nav';
import { toastError, useLive, useSessions } from '../../lib/store';
import { programSubs, taskOfSub, type ProgramSub } from '../../lib/work';
import { useTaskPanel } from '../session/TaskLog';
import { programSubagentHint, ProgramIcon, ProgramKind } from '../session/WorkRow';
import { SubagentGroup, type GroupRow } from './SubagentGroup';

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

/** A subagent's kind and model as one text ("Explore · Sonnet 5.5"): its type (not Claude Code's default one, which says nothing), then its model by the name the model menu gives it. */
const kindText = (sub: ProgramSub, modelName: (m: string) => string): string =>
  [sub.type && !/^general[- ]purpose$/i.test(sub.type) ? sub.type : '', sub.model ? modelName(sub.model) : ''].filter(Boolean).join(' · ');

/** The group of the subagents the calls `items` (one turn's) started, one row each, in order. */
export function ProgramCards({ items, sessionKey }: { items: TimelineItem[]; sessionKey: string }) {
  const { s, here, alive, tasks } = useLeadTasks(sessionKey);
  const panel = useTaskPanel(sessionKey, here, tasks);
  const cat = useCatalog(s?.agent ?? 'claude', s?.acpAgent);
  const subs = useMemo(() => {
    const ids = new Set(items.filter((i) => i.kind === 'tool' && i.tool.subagent).map((i) => i.id));
    // Tasks no call of this turn started belong to other turns (or to none loaded yet): not rows here.
    return s ? programSubs(s.agent, items, tasks, alive).filter((x) => x.toolUseId && ids.has(x.toolUseId)) : [];
  }, [s?.agent, items, tasks, alive]);
  if (!s || !subs.length) return null;
  const program = agentName(s.agent, s.acpName);
  const texts = subs.map((sub) => kindText(sub, (m) => (findModel(cat, m) ? modelLabel(cat, m) : m)));
  // What every subagent is, once after the label; else each row says its own.
  const sharedText = texts[0] && texts.every((x) => x === texts[0]) ? texts[0] : undefined;
  const stops = subs.map((sub) => stoppable(s, here, sub, tasks));
  const stopTasks = stops.filter((t): t is BackgroundTask => !!t);
  const rows: GroupRow[] = subs.map((sub, i) => {
    const t = taskOfSub(sub, tasks);
    const stop = stops[i];
    return {
      id: sub.toolUseId!,
      title: sub.title,
      state: sub.state,
      startedAt: sub.startedAt,
      endedAt: sub.endedAt,
      meta: !sharedText && texts[i] ? <span translate="no" className="truncate">{texts[i]}</span> : undefined,
      onOpen: sub.key ? () => openSession(sub.key!) : t ? () => panel.open(t) : undefined,
      onStop: stop ? () => panel.stop(stop) : undefined,
    };
  });
  const one = subs.length === 1 ? subs[0]! : undefined;
  return (
    <>
      <SubagentGroup
        icon={<AgentIcon agent={s.agent} name={s.acpName} size={16} spinning={subs.some((x) => x.state === 'running')} />}
        label={`${subs.length} ${program} subagent${subs.length === 1 ? '' : 's'}`}
        kindHint={programSubagentHint(program)}
        shared={sharedText ? <span translate="no" className="truncate">{sharedText}</span> : undefined}
        singleIcon={one && <ProgramIcon agent={s.agent} acpName={s.acpName} state={one.state} />}
        single={
          one && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <ProgramKind lead={s} sub={one} />
            </span>
          )
        }
        rows={rows}
        onStopAll={
          stopTasks.length
            ? () => void Promise.all(stopTasks.map((t) => post(`/api/sessions/${enc(sessionKey)}/tasks/${enc(t.id)}/stop`).catch(toastError)))
            : undefined
        }
        stopAllCount={stopTasks.length}
      />
      {panel.node}
    </>
  );
}
