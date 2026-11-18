// Subagents in the sidebar: Hydor's (child sessions) and the ones Claude Code and Codex run themselves, under their
// parent, folded by default, with a line on how many there are and what they are doing. Only those at work or waiting
// for you show (and the one on screen): a finished one is on its card in the session and in its work tray. Open while
// one of them is on screen.
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { swarmMode } from '@shared/swarm';
import type { SessionSummary } from '@shared/types';
import { cx } from '../../components/ui';
import { activityOf, isWorking } from '../../lib/activity';
import { openSession } from '../../lib/nav';
import { useSessions } from '../../lib/store';
import { useProgramSubagentsOf } from './program';

/**
 * Which listed sessions sit under which: each child under its parent, when the parent is listed too. A listed session
 * that ran program subagents has a nest as well, with no children of its own to put in it. A program subagent is never
 * listed itself: it shows in its lead's nest.
 */
/**
 * Subagents under their parent, in the order the sidebar shows them: those at work or waiting for you first, then the
 * ones active most lately (the newest first).
 */
export function liveThenRecent(a: SessionSummary, b: SessionSummary): number {
  return Number(live(b)) - Number(live(a)) || (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0) || a.key.localeCompare(b.key);
}

/** A subagent at work or waiting for you: the ones the sidebar shows. */
function live(s: SessionSummary | undefined): boolean {
  const act = activityOf(s);
  return isWorking(act) || act?.status === 'waiting';
}

export function nestChildren(byKey: Record<string, SessionSummary>, listed: (s: SessionSummary) => boolean): { under: Set<string>; byParent: Map<string, SessionSummary[]> } {
  const under = new Set<string>();
  const byParent = new Map<string, SessionSummary[]>();
  for (const s of Object.values(byKey)) {
    if (s.subagentOf) continue;
    if (s.programSubagents && listed(s) && !byParent.has(s.key)) byParent.set(s.key, []);
    const p = s.extra?.parent;
    if (typeof p !== 'string' || !listed(s) || !byKey[p] || !listed(byKey[p])) continue;
    under.add(s.key);
    byParent.set(p, [...(byParent.get(p) ?? []), s]);
  }
  for (const list of byParent.values()) list.sort(liveThenRecent);
  return { under, byParent };
}

/** Parents whose children are unfolded, kept while the list redraws. */
const unfolded = new Set<string>();

export function ChildNest({ parent, kids, activeKey, row }: { parent: string; kids: SessionSummary[]; activeKey: string | null; row: (s: SessionSummary, active: boolean) => ReactNode }) {
  const [, redraw] = useState(0);
  const team = useSessions((x) => swarmMode(x.byKey[parent]?.extra));
  // The program's own subagents it ran, and how many are running now (a change in either fetches them again).
  const programs = useSessions((x) => x.byKey[parent]?.programSubagents ?? 0);
  const programsRunning = useSessions((x) => activityOf(x.byKey[parent])?.agents ?? 0);
  // One of them is on screen: its summary says whose it is.
  const active = useSessions((x) => (activeKey ? x.byKey[activeKey] : undefined));
  const activeProgram = active?.subagentOf === parent ? active : undefined;
  const holdsActive = !!activeProgram || kids.some((k) => k.key === activeKey);
  const open = unfolded.has(parent) || holdsActive;
  const fetched = useProgramSubagentsOf(parent, open, programs, programsRunning);
  const byKey = useSessions((x) => x.byKey);
  // Hydor's and the program's together, those at work or waiting first, then the latest; a program subagent as the store has it when that is as new.
  const rows = useMemo(() => {
    const list = [...kids];
    for (const f of fetched ?? []) {
      const known = byKey[f.key];
      list.push(known && (known.updatedAt ?? 0) >= (f.updatedAt ?? 0) ? known : f);
    }
    if (activeProgram && !list.some((k) => k.key === activeProgram.key)) list.push(activeProgram);
    return list.filter((k) => live(k) || k.key === activeKey).sort(liveThenRecent);
  }, [kids, fetched, byKey, activeProgram, activeKey]);
  const working = kids.filter((k) => isWorking(activityOf(k))).length + programsRunning;
  const waiting = kids.filter((k) => activityOf(k)?.status === 'waiting').length;
  // The one on screen, when it has finished: it stays while you look at it.
  const total = working + waiting + (holdsActive && !live(active) ? 1 : 0);
  if (!total) return null;
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
          {total} {team === 'campaign' ? 'campaign member' : team ? 'swarm member' : 'subagent'}
          {total === 1 ? '' : 's'}
        </span>
        {/* Every one shown is at work or waits for you: only those that wait are said. */}
        {waiting > 0 && <span className="truncate text-warn">· {waiting} need{waiting === 1 ? 's' : ''} you</span>}
      </button>
      {open &&
        rows.map((c) => (
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
