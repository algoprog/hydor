// The System section: this computer's files, its Git repositories, terminals, the web apps running on it
// (Preview), how it is doing (Monitor) and the jobs it runs for you (Experiments), under one tool in the sidebar. Each
// page keeps its own address (/files, /git, /terminal, /preview, /system/monitor, /system/experiments); this is the
// header they share, with a tab each.
import type { ReactNode } from 'react';
import { Activity, FlaskConical, FolderTree, GitBranch, LayoutDashboard, MonitorSmartphone, SquareTerminal } from 'lucide-react';
import type { TipId } from '@shared/tips';
import { machineId } from '../../lib/machine';
import { go } from '../../lib/nav';
import { cx } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';

export type SystemTab = 'overview' | 'files' | 'git' | 'terminal' | 'preview' | 'monitor' | 'experiments';

/** The page each tab opens; Files opens where you left it. */
let filesAt = '/files';
export const rememberFilesPlace = (p: string) => {
  filesAt = p;
};
const PATHS: Record<SystemTab, () => string> = {
  overview: () => '/system',
  files: () => filesAt,
  git: () => '/git',
  terminal: () => '/terminal',
  preview: () => '/preview',
  monitor: () => '/system/monitor',
  experiments: () => '/system/experiments',
};

/** Which tab an address belongs to, or null when it is not one of System's. */
export function systemTabOf(loc: string): SystemTab | null {
  if (loc === '/system') return 'overview';
  if (loc === '/system/monitor') return 'monitor';
  if (loc === '/system/experiments' || loc.startsWith('/system/experiments/')) return 'experiments';
  if (loc === '/files' || loc === '/file' || loc === '/search') return 'files';
  if (loc === '/git') return 'git';
  if (loc === '/terminal') return 'terminal';
  if (loc === '/preview') return 'preview';
  return null;
}

const TABS: { id: SystemTab; label: string; icon: ReactNode; tip?: TipId }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard size={14} /> },
  { id: 'files', label: 'Files', icon: <FolderTree size={14} />, tip: 'files' },
  { id: 'git', label: 'Git', icon: <GitBranch size={14} />, tip: 'git' },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={14} />, tip: 'terminal' },
  // Dev-server previews open on this server's own preview port: its own machine only.
  ...(machineId ? [] : [{ id: 'preview' as const, label: 'Preview', icon: <MonitorSmartphone size={14} />, tip: 'preview' as const }]),
  { id: 'monitor', label: 'Monitor', icon: <Activity size={14} /> },
  { id: 'experiments', label: 'Experiments', icon: <FlaskConical size={14} /> },
];

/** System's tabs, under its title; a tab's own buttons (a page's actions) go on the right of the title row. */
export function SystemHeader({ tab, actions, sub }: { tab: SystemTab; actions?: ReactNode; sub?: ReactNode }) {
  return (
    <PageHeader title="System" sub={sub} actions={actions}>
      <div role="tablist" aria-label="System" className="flex items-end gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              data-tip={t.tip}
              onClick={() => !on && go(PATHS[t.id]())}
              className={cx('relative flex h-9 shrink-0 items-center gap-1.5 px-2.5 text-[13.5px] font-medium transition-colors', on ? 'text-fg' : 'text-fg-3 hover:text-fg-2')}
            >
              <span className={on ? 'text-fg' : 'text-fg-3'}>{t.icon}</span>
              {t.label}
              {on && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
            </button>
          );
        })}
      </div>
    </PageHeader>
  );
}
