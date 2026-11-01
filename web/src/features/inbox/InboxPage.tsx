// The inbox: everything waiting on you, on this machine and the others (Settings → Machines), newest
// first. Approvals, questions and forms are answered right here; the rest open where they wait.
import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Globe, Inbox, KeyRound, Library, MonitorSmartphone, Server } from 'lucide-react';
import type { InboxItem } from '@shared/inbox';
import { AgentIcon } from '../../components/AgentIcon';
import { Button, Empty, Throbber } from '../../components/ui';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { machineBase } from '../../lib/machine';
import { useMachines } from '../../lib/machines';
import { goFull } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { activityOf } from '../../lib/activity';
import { PageHeader } from '../layout/PageHeader';
import { ApprovalCard } from '../session/Approval';

/** One machine's list: '' is this server's own, "/m/<id>" another (null: it could not say, an older version). */
interface Source {
  base: string;
  name?: string;
  items: InboxItem[] | null;
  /** What its status says waits there, for a machine that cannot list it. */
  waiting?: number;
}

const ICONS: Partial<Record<InboxItem['kind'], React.ReactNode>> = {
  browser: <Globe size={16} />,
  key: <KeyRound size={16} />,
  skill: <Library size={16} />,
  elsewhere: <MonitorSmartphone size={16} />,
};

async function listOf(base: string): Promise<InboxItem[] | null> {
  try {
    return (await api<{ items: InboxItem[] }>('/api/inbox', { base })).items;
  } catch {
    return null;
  }
}

/** Something waiting that is answered where it waits: what, in which session, since when, and the way there. */
function Row({ it, base }: { it: InboxItem; base: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-panel px-3.5 py-3">
      <span className="mt-0.5 shrink-0 text-fg-3">{ICONS[it.kind] ?? <Inbox size={16} />}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-medium">{it.title}</div>
        {it.detail && <div className="mt-0.5 line-clamp-2 text-[12.5px] text-fg-2">{it.detail}</div>}
        <Where it={it} />
      </div>
      <Button size="sm" variant="secondary" icon={<ArrowUpRight size={14} />} onClick={() => goFull(base + it.path)}>
        Open
      </Button>
    </div>
  );
}

/** The session an item waits in, and since when. */
function Where({ it }: { it: InboxItem }) {
  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
      {it.agent && <AgentIcon agent={it.agent} size={12} />}
      {it.session && <span className="min-w-0 truncate">{it.session}</span>}
      <span className="shrink-0">
        {it.session ? '· ' : ''}
        {timeAgo(it.at)}
      </span>
    </div>
  );
}

function Item({ it, base, reload }: { it: InboxItem; base: string; reload: () => void }) {
  if (!it.approval || !it.key || !it.agent) return <Row it={it} base={base} />;
  return (
    <div>
      <button type="button" onClick={() => goFull(base + it.path)} className="flex w-full min-w-0 items-center gap-1.5 px-1 text-left text-[12px] text-fg-3 hover:text-fg">
        <AgentIcon agent={it.agent} size={12} />
        <span className="min-w-0 truncate">{it.session ?? 'A session'}</span>
        <ArrowUpRight size={12} className="shrink-0" />
      </button>
      <ApprovalCard a={it.approval} sessionKey={it.key} agent={it.agent} base={base} onDone={reload} />
    </div>
  );
}

export function InboxPage() {
  const machines = useMachines((s) => s.list);
  const [sources, setSources] = useState<Source[] | null>(null);
  // Sessions starting or stopping to wait: the list is asked again.
  const waitingSig = useSessions((s) =>
    Object.values(s.byKey)
      .filter((x) => activityOf(x)?.status === 'waiting')
      .map((x) => `${x.key}:${x.live?.pendingApprovals ?? 0}`)
      .join(','),
  );
  const machineSig = machines.map((m) => `${m.id}:${m.status.state}:${m.status.waiting}`).join(',');

  const load = useCallback(async () => {
    const others = useMachines.getState().list.filter((m) => m.status.state === 'online');
    const [own, ...rest] = await Promise.all([listOf(''), ...others.map((m) => listOf(`/m/${m.id}`))]);
    setSources([{ base: '', items: own ?? [] }, ...others.map((m, i) => ({ base: `/m/${m.id}`, name: m.name, items: rest[i], waiting: m.status.waiting }))]);
  }, []);

  useEffect(() => {
    useMachines.getState().load().catch(() => {});
  }, []);
  useEffect(() => {
    void load();
  }, [load, waitingSig, machineSig]);
  // Things that wait without a session changing (a browser's ask, a key asked for) are picked up every few seconds.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const many = (sources ?? []).filter((s) => s.items?.length || s.waiting).length > 1 || machines.length > 0;
  const total = (sources ?? []).reduce((n, s) => n + (s.items?.length ?? s.waiting ?? 0), 0);
  const ownName = useMachines((s) => s.self?.host);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="Inbox" sub={total ? `${total} waiting on you` : 'Everything waiting on you, across sessions, tasks and machines'} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[760px] space-y-6 px-3 py-5 sm:px-6">
          {!sources ? (
            <div className="flex justify-center py-10 text-fg-3">
              <Throbber size={28} />
            </div>
          ) : !total ? (
            <Empty icon={<Inbox size={22} />} title="Nothing is waiting on you">
              When an agent asks for your approval, a question or a form, needs you in its browser or asks for a key, it shows up here, from every session, scheduled task and machine.
            </Empty>
          ) : (
            sources.map((s) =>
              !s.items?.length && !(s.items === null && s.waiting) ? null : (
                <section key={s.base} className="space-y-3">
                  {many && (
                    <h2 className="flex items-center gap-1.5 px-1 text-[12px] font-medium tracking-wide text-fg-3 uppercase">
                      <Server size={12} />
                      {s.base ? s.name : (ownName ?? 'This machine')}
                      {s.base === machineBase && machineBase && <span className="normal-case">· shown now</span>}
                    </h2>
                  )}
                  {s.items === null ? (
                    <div className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-3">
                      <span className="min-w-0 flex-1 text-[13.5px]">
                        {s.waiting} session{s.waiting === 1 ? '' : 's'} wait{s.waiting === 1 ? 's' : ''} on you there
                      </span>
                      <Button size="sm" variant="secondary" icon={<ArrowUpRight size={14} />} onClick={() => goFull(`${s.base}/`)}>
                        Open
                      </Button>
                    </div>
                  ) : (
                    s.items.map((it) => <Item key={it.id} it={it} base={s.base} reload={() => void load()} />)
                  )}
                </section>
              ),
            )
          )}
        </div>
      </div>
    </div>
  );
}
