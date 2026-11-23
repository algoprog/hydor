// The tools of the app's navigation (Browser, Projects, Agents, Apps, Search, Usage, System, Settings, Help): what
// each shows and where it goes, with the Usage bar and the Inbox count. The rail (Rail.tsx) shows them in two groups
// down the left edge; a phone's drawer (Sidebar.tsx) in one grid.
import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { CircleHelp, Gauge, MonitorCog, Search, Settings } from 'lucide-react';
import type { SidebarTool } from '@shared/sidebar';
import type { AgentUsage } from '@shared/types';
import { activityOf } from '../../lib/activity';
import { useMachines } from '../../lib/machines';
import { pct } from '../../lib/format';
import { machineId } from '../../lib/machine';
import { useApp, useSessions, useUsage } from '../../lib/store';
import { cx } from '../../components/ui';
import { severityColor } from '../../components/charts';
import { features } from '../registry';
import { useOutbox } from '../outbox/store';
import { systemTabOf } from '../system/SystemHeader';

/** A subscription on a free plan (Codex "free", a Claude free account); any other plan counts as paid. */
const freePlan = (u: AgentUsage) => /free/i.test(u.account?.plan ?? '');

/** What one subscription has left: none at a limit, else what its fullest window leaves. */
function leftOf(u: AgentUsage): number {
  if (u.limited) return 0;
  const used = Math.max(0, ...u.windows.map((w) => w.usedPercent ?? 0));
  return Math.max(0, 100 - Math.min(100, used));
}

/**
 * What is left across the subscriptions, as a tiny meter under "Usage": the paid ones, or the free ones when there
 * are no paid ones, each counted once (an added account can be the agent's own sign-in too). No subscriptions, no bar.
 */
export function UsageHint({ compact }: { compact?: boolean } = {}) {
  const { claude, codex, grok, antigravity, accounts } = useUsage();
  const seen = new Set<string>();
  const subs = [claude, codex, grok, antigravity, ...Object.values(accounts)].filter((u): u is AgentUsage => {
    if (!u?.ok || !u.windows.some((w) => w.usedPercent != null)) return false;
    const key = u.account?.email ? `${u.agent}:${u.account.email.toLowerCase()}` : null;
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  });
  const paid = subs.filter((u) => !freePlan(u));
  const counted = paid.length ? paid : subs;
  if (!counted.length) return null;
  const left = counted.reduce((n, u) => n + leftOf(u), 0) / counted.length;
  const title = [
    `${Math.round(left)}% left across ${counted.length} ${paid.length ? 'paid' : 'free'} subscription${counted.length === 1 ? '' : 's'}`,
    ...counted.map((u) => `${u.agent === 'claude' ? 'Claude' : u.agent === 'grok' ? 'Grok' : u.agent === 'antigravity' ? 'Antigravity' : 'Codex'}${u.account?.email ? ` (${u.account.email})` : ''}: ${pct(leftOf(u))} left`),
  ].join('\n');
  return (
    <span className={cx('absolute left-1/2 h-[3px] -translate-x-1/2 overflow-hidden rounded-full bg-fg/10', compact ? 'bottom-[3px] w-5' : 'bottom-[7px] w-8')} title={title}>
      <span className="block h-full rounded-full" style={{ width: `${left}%`, background: left <= 0 ? 'var(--err)' : severityColor(100 - left) }} />
    </span>
  );
}

/** How many things wait on you: sessions asking for an approval or an answer, here and on the other machines, and the calls the Outbox holds for your OK. */
export function useInboxCount(): number {
  const here = useSessions((s) => Object.values(s.byKey).filter((x) => !x.subagentOf && activityOf(x)?.status === 'waiting').length);
  const there = useMachines((s) => s.list.filter((m) => m.id !== machineId && m.status.state === 'online').reduce((n, m) => n + m.status.waiting, 0));
  const held = useOutbox((s) => s.held);
  useEffect(() => void useOutbox.getState().load(), []);
  return here + there + held;
}

/** One of the tools: what it shows, and where it goes. */
export interface Tool {
  id: SidebarTool;
  label: string;
  icon: ReactNode;
  /** Its page is the one open. */
  match: boolean;
  go: () => void;
  extra?: ReactNode;
  tour?: string;
  /** The key that does the same, for its tooltip. */
  keys?: string;
}

/**
 * Every tool, in no order (the caller sorts them by the user's): `nav` goes to a page, `searching` opens the search box.
 * `compact`: the rail's small icon tiles (their marks sit closer to the icon) rather than the phone drawer's grid.
 */
export function useTools(nav: (path: string) => void, searching: () => void, compact = false): Tool[] {
  const [loc] = useLocation();
  const updates = useApp((s) => (s.boot?.update?.behind ?? 0) > 0);
  return [
    ...features().flatMap((f) => (f.nav ?? []).map((n): Tool => ({ id: n.id, label: n.label, icon: n.icon, match: n.match ? n.match(loc) : loc === n.path, go: () => nav(n.path) }))),
    // What the agents' plans have used and have left, with a thin bar for it at a glance.
    { id: 'usage', label: 'Usage', icon: <Gauge size={17} />, match: loc === '/usage' || loc === '/stats' || loc === '/arena', go: () => nav('/usage'), extra: <UsageHint compact={compact} /> },
    // This computer: its files, Git, terminals, previews and monitor, each a tab of System.
    { id: 'system', label: 'System', icon: <MonitorCog size={17} />, match: systemTabOf(loc) !== null, go: () => nav('/system'), tour: 'nav-system' },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings size={17} />,
      match: loc === '/settings',
      go: () => nav('/settings'),
      tour: 'nav-settings',
      extra: updates ? <span className={cx('absolute h-1.5 w-1.5 rounded-full bg-accent', compact ? 'top-[7px] left-[calc(50%+5px)]' : 'top-2.5 left-[calc(50%+7px)]')} title="A newer version is out (Settings → General)" /> : undefined,
    },
    { id: 'search', label: 'Search', icon: <Search size={17} />, match: false, go: searching, keys: 'K' },
    { id: 'help', label: 'Help', icon: <CircleHelp size={17} />, match: loc === '/guide' || loc.startsWith('/guide/'), go: () => nav('/guide') },
  ];
}
