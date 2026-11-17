// The work tray: everything this session started (its Hydor subagents, its program's own subagents, and its background
// tasks: commands, monitors) in one place at the bottom of the session, directly above the message box. Folded to one line by default
// (what runs, who needs you, Stop all); opened, a row for each in the one look (WorkRow). A task opens in a panel, a subagent (Hydor's or its program's) as a session.
import { useId, useMemo, useState } from 'react';
import { ChevronRight, ListTree } from 'lucide-react';
import type { BackgroundTask, SessionSummary } from '@shared/types';
import { modelLabel, useCatalog } from '../../components/AgentPickers';
import { cx } from '../../components/ui';
import { openSession } from '../../lib/nav';
import { useLive, useSessions, useTimeline } from '../../lib/store';
import { childrenOf, needsLine, programSubs, workItems, workSummary, type WorkItem } from '../../lib/work';
import { stoppable } from '../children/ProgramCard';
import { ChildIcon, ChildStatus, childKindLine, HYDOR_SUBAGENT_HINT, ProgramSubRow, stopEverything, TaskItem, WorkRow } from './WorkRow';
import { agentName } from '../../components/AgentIcon';
import { useTaskPanel } from './TaskLog';

function ChildItem({ item }: { item: Extract<WorkItem, { type: 'child' }> }) {
  const s = item.s;
  const live = item.state === 'running' || item.state === 'needs';
  // Its model by the name the model menu gives it ("Sonnet 5.5"), not its id.
  const cat = useCatalog(s.agent, s.acpAgent);
  return (
    <WorkRow
      icon={<ChildIcon s={s} agent={s.agent} />}
      title={s.title}
      kind={<span title={HYDOR_SUBAGENT_HINT}>{childKindLine(s, s.model ? modelLabel(cat, s.model) : undefined)}</span>}
      status={<ChildStatus s={s} state={item.state} />}
      cost={s.stats?.costUsd}
      onOpen={() => openSession(s.key)}
      onStop={live ? () => void stopEverything(s.key) : undefined}
      stopLabel="Stop this subagent"
    />
  );
}

/** A subagent of the session's own program: it opens as a session of its own once it has one, and Claude Code's stops from here. */
function SubItem({ item, lead, here, tasks, onStop }: { item: Extract<WorkItem, { type: 'sub' }>; lead: SessionSummary; here: boolean; tasks: BackgroundTask[]; onStop: (t: BackgroundTask) => void }) {
  const sub = item.sub;
  const stop = stoppable(lead, here, sub, tasks);
  return <ProgramSubRow lead={lead} sub={sub} onOpen={sub.key ? () => openSession(sub.key!) : undefined} onStop={stop ? () => onStop(stop) : undefined} />;
}

export function WorkTray({ s }: { s: SessionSummary }) {
  const byKey = useSessions((x) => x.byKey);
  const lv = useLive((x) => x.byKey[s.key]);
  const live = lv?.live ?? s.live ?? null;
  // Tasks of a session open elsewhere are listed, not stoppable from here.
  const here = !!live && live.status !== 'exited';
  const running = live?.backgroundTasks;
  const ended = live?.endedTasks;
  const outside = s.external?.backgroundTasks;
  const tasks = useMemo(() => (here ? [...(running ?? []), ...(ended ?? [])] : (outside ?? [])), [here, running, ended, outside]);
  const kids = useMemo(() => childrenOf(byKey, s.key), [byKey, s.key]);
  // The program's own subagents: the calls that started them in the conversation, with the tasks it lists. Alive: it runs
  // here or in another client; otherwise one still running when last seen died with it.
  const timeline = useTimeline((x) => x.byKey[s.key]?.items);
  const alive = (here && live?.status !== 'error') || !!s.external;
  const subs = useMemo(() => programSubs(s.agent, timeline ?? [], tasks, alive), [s.agent, timeline, tasks, alive]);
  const items = useMemo(() => workItems(kids, tasks, subs), [kids, tasks, subs]);
  const panel = useTaskPanel(s.key, here, tasks);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const program = agentName(s.agent, s.acpName);
  if (!items.length) return null;
  const sum = workSummary(items);
  const going = sum.children + sum.tasks > 0;
  // Hydor subagents stop wherever the session is; its own tasks and subagents only while it runs here.
  const canStopAll = sum.children > 0 || (here && sum.tasks > 0);
  return (
    <div className="mb-2 overflow-hidden rounded-2xl border border-line bg-panel">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className="flex h-10 min-w-0 flex-1 items-center gap-2 px-3 text-left text-[12.5px] transition-colors hover:bg-bg-2"
        >
          <ChevronRight size={13} className={cx('shrink-0 text-fg-3 transition-transform duration-200', open && 'rotate-90')} />
          <ListTree size={15} className={cx('shrink-0', going ? 'text-busy' : 'text-fg-3')} />
          <span className={cx('min-w-0 truncate', going ? 'text-fg' : 'text-fg-3')}>{sum.text}</span>
          {sum.needs > 0 && <span className="shrink-0 font-medium text-warn">· {needsLine(sum.needs)}</span>}
        </button>
        {going && canStopAll && (
          <button
            type="button"
            onClick={() => void stopEverything(s.key)}
            className="mr-1.5 shrink-0 rounded-md px-2 py-1 text-[12.5px] font-medium text-fg-2 transition-colors hover:bg-err/10 hover:text-err"
          >
            Stop all
          </button>
        )}
      </div>
      {open && (
        <div id={listId} className="max-h-[290px] divide-y divide-line overflow-y-auto border-t border-line">
          {items.map((i) =>
            i.type === 'child' ? (
              <ChildItem key={`c:${i.id}`} item={i} />
            ) : i.type === 'sub' ? (
              <SubItem key={`s:${i.id}`} item={i} lead={s} here={here} tasks={tasks} onStop={(t) => panel.stop(t)} />
            ) : (
              <TaskItem key={`t:${i.id}`} t={i.t} program={program} onOpen={() => panel.open(i.t)} onStop={here && i.state === 'running' ? () => panel.stop(i.t) : undefined} />
            ),
          )}
        </div>
      )}
      {panel.node}
    </div>
  );
}
