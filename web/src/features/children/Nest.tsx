// Child sessions in the sidebar: under their parent, folded by default, with a line on how many there
// are and what they are doing. Open while one of them is on screen.
import { useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { leadsSwarm } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { cx } from '../../components/ui';
import { activityOf, isWorking } from '../../lib/activity';
import { openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';

/** Which listed sessions sit under which: each child under its parent, when the parent is listed too. */
export function nestChildren(byKey: Record<string, SessionSummary>, listed: (s: SessionSummary) => boolean): { under: Set<string>; byParent: Map<string, SessionSummary[]> } {
  const under = new Set<string>();
  const byParent = new Map<string, SessionSummary[]>();
  for (const s of Object.values(byKey)) {
    const p = s.extra?.parent;
    if (typeof p !== 'string' || !listed(s) || !byKey[p] || !listed(byKey[p])) continue;
    under.add(s.key);
    byParent.set(p, [...(byParent.get(p) ?? []), s]);
  }
  for (const list of byParent.values()) list.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.key.localeCompare(b.key));
  return { under, byParent };
}

/** Parents whose children are unfolded, kept while the list redraws. */
const unfolded = new Set<string>();

export function ChildNest({ parent, kids, activeKey, row }: { parent: string; kids: SessionSummary[]; activeKey: string | null; row: (s: SessionSummary, active: boolean) => ReactNode }) {
  const [, redraw] = useState(0);
  const swarm = useSessions((x) => leadsSwarm(x.byKey[parent]?.extra));
  const holdsActive = kids.some((k) => k.key === activeKey);
  const open = unfolded.has(parent) || holdsActive;
  const working = kids.filter((k) => isWorking(activityOf(k))).length;
  const waiting = kids.filter((k) => activityOf(k)?.status === 'waiting').length;
  const toggle = (e: MouseEvent) => {
    // On a phone a tap on a button in the list closes the drawer (it opened a session); this one stays.
    e.stopPropagation();
    if (open) unfolded.delete(parent);
    else unfolded.add(parent);
    redraw((n) => n + 1);
  };
  return (
    <div className="mb-0.5 ml-[17px] border-l border-line pl-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        disabled={holdsActive}
        className="flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2 disabled:hover:bg-transparent max-md:h-8"
      >
        <ChevronRight size={12} className={cx('shrink-0 transition-transform duration-200', open && 'rotate-90')} />
        <span className="shrink-0">
          {kids.length} {swarm ? 'swarm member' : 'child session'}
          {kids.length === 1 ? '' : 's'}
        </span>
        {waiting > 0 && <span className="truncate text-warn">· {waiting} need{waiting === 1 ? 's' : ''} you</span>}
        {working > 0 && <span className="truncate text-busy">· {working} working</span>}
      </button>
      {open &&
        kids.map((c) => (
          <div
            key={c.key}
            role="button"
            tabIndex={0}
            onClick={() => openSession(c.key)}
            onKeyDown={(e) => e.key === 'Enter' && openSession(c.key)}
            className="cursor-default rounded-[10px] outline-none select-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {row(c, c.key === activeKey)}
          </div>
        ))}
    </div>
  );
}
