// A child session's card in its parent's conversation, under the turn that started it: the work tray's row (features/session/WorkRow)
// in a card, so the two places look alike. Its title, what it is (a helper session, or the agent of yours it works as), its program
// and model, its tier, how it stands, what it cost, a way in, and Stop while it works; a line under it when it was stepped up.
import { researchOf } from '@shared/research';
import type { ChildNote } from '@shared/children';
import type { SessionNote } from '@shared/features';
import { tierLabel } from '@shared/tiers';
import { useSessions } from '../../lib/store';
import { openSession } from '../../lib/nav';
import { childState } from '../../lib/work';
import { ChildIcon, ChildStatus, stopEverything, WorkRow } from '../session/WorkRow';

export function ChildCard({ note, sessionKey }: { note: SessionNote; sessionKey: string }) {
  const d = note.data as ChildNote;
  const s = useSessions((x) => x.byKey[d.child]);
  // In a deep research, the children are its researchers.
  const researcher = useSessions((x) => !!researchOf(x.byKey[sessionKey]?.extra));
  const state = s ? childState(s) : 'done';
  const live = state === 'running' || state === 'needs';
  return (
    <WorkRow
      card
      icon={<ChildIcon s={s} agent={d.agent} acpName={d.acpName} />}
      title={s?.title ?? d.title}
      kind={
        <>
          {d.as ? <span translate="no">{d.as}</span> : <span>{researcher ? 'Researcher' : 'Helper session'}</span>}
          <span>·</span>
          <span className="truncate">{d.label}</span>
          {d.tier && (
            <span data-i18n="agents" className="shrink-0 rounded-full bg-accent-soft px-1.5 text-[11px] text-fg-2">
              {tierLabel(d.tier)}
            </span>
          )}
        </>
      }
      status={!s ? <span>Removed</span> : <ChildStatus s={s} state={state} />}
      cost={s?.stats.costUsd}
      detail={
        d.steppedFrom && (
          <span className="mt-0.5 block truncate text-[12px] text-fg-3">
            Stepped up from {tierLabel(d.steppedFrom.tier)}: <span translate="no">{d.steppedFrom.why}</span>
          </span>
        )
      }
      onOpen={() => openSession(d.child)}
      onStop={live ? () => void stopEverything(d.child) : undefined}
      stopLabel="Stop this helper session"
    />
  );
}
