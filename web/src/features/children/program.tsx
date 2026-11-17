// Program subagents: the subagents Claude Code and Codex run themselves. Their own page is read-only, with a line in
// place of the message box that points back to the session that started them, and the sidebar lists them under it.
import { useEffect } from 'react';
import { create } from 'zustand';
import { CornerDownRight, Square } from 'lucide-react';
import type { SessionSummary } from '@shared/types';
import { agentName } from '../../components/AgentIcon';
import { Button } from '../../components/ui';
import { isBusy, activityOf } from '../../lib/activity';
import { api, enc } from '../../lib/api';
import { openSession } from '../../lib/nav';
import { useLive, useSessions } from '../../lib/store';
import { useStopTask } from '../session/TaskLog';

/** Where a program subagent's page shows, in place of the message box: whose it is, and a way back to it. */
export function ProgramDock({ s }: { s: SessionSummary }) {
  const lead = s.subagentOf;
  const p = useSessions((x) => (lead ? x.byKey[lead] : undefined));
  if (!lead) return null;
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-line bg-bg-1 px-3 py-1.5 text-[12.5px] sm:mx-auto sm:w-[calc(100%-48px)] sm:max-w-[800px]">
      <CornerDownRight size={14} className="shrink-0 text-fg-3" />
      <span className="min-w-0 flex-1 truncate text-fg-2">
        {/* One text, so it translates as one sentence ("{0} subagent of"). */}
        {`${agentName(p?.agent ?? s.agent, p?.acpName ?? s.acpName)} subagent of`}{' '}
        <span className="text-fg" translate="no">
          {p?.title ?? 'another session'}
        </span>
        <span className="max-sm:hidden">: its replies go back there</span>
      </span>
      <button type="button" onClick={() => openSession(lead)} className="shrink-0 font-medium text-accent hover:underline">
        Open parent
      </button>
    </div>
  );
}

/**
 * Stop, in a program subagent's own header while it works, as a Hydor subagent's page has: Claude Code stops it as a
 * task of its lead (asking first), while the lead runs here. Nothing for Codex's, which its program cannot stop alone.
 */
export function ProgramStop({ s }: { s: SessionSummary }) {
  const lead = s.subagentOf ?? '';
  const leadAgent = useSessions((x) => x.byKey[lead]?.agent);
  const liveNow = useLive((x) => x.byKey[lead]?.live);
  const listed = useSessions((x) => x.byKey[lead]?.live);
  const leadLive = liveNow ?? listed;
  const stopper = useStopTask(lead);
  const id = s.key.startsWith('claude:agent-') ? s.key.slice('claude:agent-'.length) : '';
  const here = !!leadLive && leadLive.status !== 'exited' && leadLive.status !== 'error';
  if (!lead || !id || leadAgent !== 'claude' || !here || !isBusy(activityOf(s))) return stopper.node;
  const task = leadLive.backgroundTasks?.find((t) => t.id === id) ?? { id, description: s.title, kind: 'local_agent', status: 'running', startedAt: s.live?.turnStartedAt };
  return (
    <>
      <Button size="sm" variant="secondary" icon={<Square size={11} fill="currentColor" strokeWidth={0} />} onClick={() => void stopper.stop(task)} title="Stop this subagent">
        <span className="hidden sm:inline">Stop</span>
      </Button>
      {stopper.node}
    </>
  );
}

/** Each lead's program subagents as last fetched, kept across redraws so the rows under it do not flash. */
export const useProgramSubagents = create<{ byLead: Record<string, SessionSummary[]> }>(() => ({ byLead: {} }));

const asked = new Map<string, number>();

/** Fetches a lead's program subagents, oldest first; the last answer asked for wins. */
export async function loadProgramSubagents(lead: string): Promise<void> {
  const n = (asked.get(lead) ?? 0) + 1;
  asked.set(lead, n);
  try {
    const r = await api<{ sessions: SessionSummary[] }>(`/api/sessions/${enc(lead)}/subagents`);
    if (asked.get(lead) !== n) return;
    const sessions = [...r.sessions].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.key.localeCompare(b.key));
    useProgramSubagents.setState((x) => ({ byLead: { ...x.byLead, [lead]: sessions } }));
  } catch {
    // The rows already shown stay; the next change of the lead asks again.
  }
}

/**
 * Keeps a lead's program subagents fetched while `on`: when first wanted, and again when how many it ran or how many of
 * them run changes (one started, or one ended), not at each change of the lead's own work.
 */
export function useProgramSubagentsOf(lead: string, on: boolean, count: number, running: number): SessionSummary[] | undefined {
  useEffect(() => {
    if (on && count > 0) void loadProgramSubagents(lead);
  }, [lead, on, count, running]);
  return useProgramSubagents((x) => x.byLead[lead]);
}
