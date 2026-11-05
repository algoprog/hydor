// A session of a shared project, as a read-only link shows it: the conversation as it happens, steps by name, file
// changes and pages the agent showed; never command output, tool input or thinking (the server decides what is
// sent). It follows along by itself, every few seconds while the agent works.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { PortalView } from '@shared/share';
import type { Agent, TimelineItem } from '@shared/types';
import { AgentIcon, agentName } from '../../components/AgentIcon';
import { IconButton, Throbber } from '../../components/ui';
import { GuestItem } from '../guest/GuestPage';
import { papi } from './api';

/** An item, and where it is in the whole conversation (what is not shown counts too). */
type Item = TimelineItem & { n: number };

interface SessionView {
  title: string;
  agent: Agent;
  acpName?: string;
  status: string;
  from: number;
  total: number;
  items: Item[];
}

const busy = (s?: string) => !!s && ['working', 'waiting', 'starting'].includes(s);

export function PortalSession({ v, sessionKey, onBack }: { v: PortalView; sessionKey: string; onBack: () => void }) {
  const [s, setS] = useState<SessionView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const items = useRef<Item[]>([]);
  const total = useRef(0);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let stop = false;
    let timer = 0;
    items.current = [];
    total.current = 0;
    const pull = async (first: boolean) => {
      // The last few items can still change (a step finishing): ask again from a little before the end.
      const from = first ? 0 : Math.max(0, total.current - 30);
      try {
        const r = await papi<SessionView>(`/sessions/${encodeURIComponent(sessionKey)}?from=${from}`);
        if (stop) return;
        items.current = [...items.current.filter((x) => x.n < r.from), ...r.items];
        total.current = r.total;
        setS({ ...r, items: items.current });
        setErr(null);
        timer = window.setTimeout(() => pull(false), busy(r.status) ? 4000 : 30_000);
        if (first || busy(r.status)) requestAnimationFrame(() => end.current?.scrollIntoView({ block: 'end' }));
      } catch (e) {
        if (stop) return;
        setErr((e as Error).message);
        if (!first) timer = window.setTimeout(() => pull(false), 30_000);
      }
    };
    void pull(true);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [sessionKey]);
  const listed = v.sessions.find((x) => x.key === sessionKey);
  const title = s?.title ?? listed?.title ?? '';
  useEffect(() => {
    if (title) document.title = `${title} · ${v.project.name}`;
  }, [title]);
  const working = busy(s?.status);
  const agent = s?.agent ?? listed?.agent;
  return (
    <div className="flex h-full min-h-0 flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-line px-2 pt-[calc(var(--safe-top)+8px)] pb-2 sm:px-3">
        <IconButton label="All sessions" onClick={onBack}>
          <ArrowLeft size={18} />
        </IconButton>
        <div className="ml-0.5 min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {agent && <AgentIcon agent={agent} name={s?.acpName ?? listed?.acpName} size={15} />}
            <h1 translate="no" className="truncate text-[15px] font-semibold tracking-tight">
              {title}
            </h1>
          </div>
          <div className="text-[11.5px] text-fg-3">
            {agent ? `${agentName(agent, s?.acpName ?? listed?.acpName)} · ` : ''}read-only
            {working && <span className="text-busy"> · working now</span>}
          </div>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[860px] space-y-3 px-4 py-5 pb-[max(20px,var(--safe-bottom))]">
          {err && !s ? (
            <div className="py-16 text-center text-[14px] text-fg-3">{err}</div>
          ) : !s ? (
            <div className="flex justify-center py-16 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : (
            s.items.map((it) => <GuestItem key={it.id} it={it} />)
          )}
          {working && (
            <div className="flex items-center gap-2 px-1 text-[12.5px] text-busy">
              <Throbber /> Working
            </div>
          )}
          <div ref={end} />
        </div>
      </main>
    </div>
  );
}
