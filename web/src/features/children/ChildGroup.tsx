// The Hydor subagents (child sessions) one turn started, in their parent's conversation under that turn: ONE compact group
// (SubagentGroup, the same as the program's own subagents have), made from the turn's child notes. Each row has its title,
// how it stands, what it cost, a way in and Stop while it works; the group says once what its rows share (the agent of yours
// they work as, their program and model, their tier), or each row says its own; a menu on the group stops them all.
import { Network } from 'lucide-react';
import { researchOf } from '@shared/research';
import { childLabel, type ChildNote } from '@shared/children';
import type { SessionNote } from '@shared/features';
import { tierLabel } from '@shared/tiers';
import { AgentIcon } from '../../components/AgentIcon';
import { useSessions } from '../../lib/store';
import { openSession } from '../../lib/nav';
import { childState, isLiveState } from '../../lib/work';
import { ChildIcon, HYDOR_SUBAGENT_HINT, stopEverything } from '../session/WorkRow';
import { SubagentGroup, type GroupRow } from './SubagentGroup';

/** What a subagent is, in a row or after the group's label: the agent of yours it works as, its program and model, then its tier. */
function Kind({ d }: { d: ChildNote }) {
  const text = [d.as, childLabel(d)].filter(Boolean).join(' · ');
  return (
    <>
      <span translate="no" className="truncate">{text}</span>
      {d.tier && (
        <span data-i18n="agents" className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[11px] text-fg-2">
          {tierLabel(d.tier)}
        </span>
      )}
    </>
  );
}

export function ChildGroup({ note, more, sessionKey }: { note: SessionNote; more?: SessionNote[]; sessionKey: string }) {
  const byKey = useSessions((x) => x.byKey);
  const notes = [note, ...(more ?? [])];
  const ds = notes.map((n) => n.data as ChildNote);
  // In a deep research, the children are its researchers.
  const researcher = !!researchOf(byKey[sessionKey]?.extra);
  const items = ds.map((d) => {
    const s = byKey[d.child];
    return { d, s, state: s ? childState(s) : ('done' as const) };
  });
  const rows: GroupRow[] = items.map(({ d, s, state }) => ({
    id: d.child,
    title: s?.title ?? d.title,
    state,
    startedAt: s?.live?.turnStartedAt ?? d.startedAt,
    endedAt: s?.updatedAt,
    meta: <Kind d={d} />,
    cost: s?.stats?.costUsd,
    hint: d.steppedFrom ? `Stepped up from ${tierLabel(d.steppedFrom.tier)}: ${d.steppedFrom.why}` : undefined,
    // A removed session has nothing to stop.
    status: s ? undefined : <span className="text-fg-3">Removed</span>,
    onOpen: () => openSession(d.child),
    onStop: s && isLiveState(state) ? () => void stopEverything(d.child) : undefined,
  }));
  const first = ds[0]!;
  const same = <K,>(f: (d: ChildNote) => K) => ds.every((d) => f(d) === f(first));
  const sharedKind = same((d) => d.as) && same((d) => childLabel(d)) && same((d) => d.tier);
  const sameAgent = same((d) => d.agent) && same((d) => d.acpName);
  const anyRunning = items.some((x) => x.state === 'running');
  const stops = rows.filter((r) => r.onStop);
  const n = rows.length;
  const one = n === 1 ? items[0]! : undefined;
  return (
    <SubagentGroup
      icon={sameAgent ? <AgentIcon agent={first.agent} name={first.acpName} size={16} spinning={anyRunning} /> : <Network size={16} className="text-fg-2" />}
      label={researcher ? `${n} researcher${n === 1 ? '' : 's'}` : `${n} Hydor subagent${n === 1 ? '' : 's'}`}
      kindHint={HYDOR_SUBAGENT_HINT}
      shared={sharedKind ? <Kind d={first} /> : undefined}
      singleIcon={one && <ChildIcon s={one.s} agent={one.d.agent} acpName={one.d.acpName} />}
      single={
        one && (
          <>
            {one.d.as ? <span translate="no">{one.d.as}</span> : <span title={HYDOR_SUBAGENT_HINT}>{researcher ? 'Researcher' : 'Hydor subagent'}</span>}
            <span>·</span>
            <span translate="no" className="truncate">{childLabel(one.d)}</span>
            {one.d.tier && (
              <span data-i18n="agents" className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[11px] text-fg-2">
                {tierLabel(one.d.tier)}
              </span>
            )}
          </>
        )
      }
      rows={sharedKind ? rows.map((r) => ({ ...r, meta: undefined })) : rows}
      onStopAll={stops.length ? () => stops.forEach((r) => r.onStop!()) : undefined}
      stopAllCount={stops.length}
    />
  );
}

// Several children of one turn show as one group, with the later notes as `more`.
ChildGroup.many = true;
