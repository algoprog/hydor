// The System section: this computer's files, its Git repositories, terminals, the web apps running on it
// (Preview), how it is doing (Monitor), what the agents' plans have left (Usage, with Activity and the Arena) and the
// jobs it runs for you (Experiments), under one tool in the sidebar. Each page keeps its own address (/files, /git,
// /terminal, /preview, /system/monitor, /usage, /system/experiments); this is the header they share, with a tab each.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, ChevronDown, FlaskConical, FolderTree, Gauge, GitBranch, LayoutDashboard, MonitorSmartphone, SquareTerminal } from 'lucide-react';
import type { TipId } from '@shared/tips';
import { machineId } from '../../lib/machine';
import { go } from '../../lib/nav';
import { cx, Popover, SheetsOnPhone, useIsMobile } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';

export type SystemTab = 'overview' | 'files' | 'git' | 'terminal' | 'preview' | 'monitor' | 'usage' | 'experiments';

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
  usage: () => '/usage',
  experiments: () => '/system/experiments',
};

/** Which tab an address belongs to, or null when it is not one of System's. */
export function systemTabOf(loc: string): SystemTab | null {
  if (loc === '/system') return 'overview';
  if (loc === '/system/monitor') return 'monitor';
  if (loc === '/usage' || loc === '/stats' || loc === '/arena') return 'usage';
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
  { id: 'usage', label: 'Usage', icon: <Gauge size={14} />, tip: 'usage' },
  { id: 'experiments', label: 'Experiments', icon: <FlaskConical size={14} /> },
];

/**
 * On a phone, the title names the tab you are on and opens all of System's tools in a sheet, a grid of four
 * across (as the drawer's tools): eight tabs never fit across a phone, and those scrolled off its edge were lost.
 */
function PhoneSwitcher({ tab }: { tab: SystemTab }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const cur = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <>
      <button ref={anchor} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="-ml-1 flex h-10 max-w-full items-center gap-1.5 rounded-lg px-1 text-left active:bg-bg-2">
        <span className="shrink-0 text-fg-3">System</span>
        <span className="shrink-0 text-fg-3">/</span>
        <span className="truncate">{cur.label}</span>
        <ChevronDown size={16} className="shrink-0 text-fg-3" />
      </button>
      <SheetsOnPhone.Provider value>
        <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} title="System" width={300}>
          <nav aria-label="System" className="grid grid-cols-4 gap-1 pt-1 pb-1">
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-current={on ? 'page' : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (!on) go(PATHS[t.id]());
                  }}
                  className={cx('flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-[12px] transition-colors', on ? 'bg-bg-2 font-semibold text-fg' : 'text-fg-2 active:bg-bg-2')}
                >
                  <span className={cx('[&>svg]:h-5 [&>svg]:w-5', on ? 'text-fg' : 'text-fg-3')}>{t.icon}</span>
                  <span className="max-w-full truncate">{t.label}</span>
                </button>
              );
            })}
          </nav>
        </Popover>
      </SheetsOnPhone.Provider>
    </>
  );
}

/** System's tabs, under its title (on a phone, the title switches between them); a tab's own buttons (a page's actions) go on the right of the title row. */
export function SystemHeader({ tab, actions, sub }: { tab: SystemTab; actions?: ReactNode; sub?: ReactNode }) {
  const mobile = useIsMobile();
  const strip = useRef<HTMLDivElement>(null);
  // Where the tabs do not all fit (a narrow window), the open one is scrolled into sight.
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab, mobile]);
  if (mobile) return <PageHeader title={<PhoneSwitcher tab={tab} />} sub={sub} actions={actions} />;
  return (
    <PageHeader title="System" sub={sub} actions={actions}>
      <div ref={strip} role="tablist" aria-label="System" className="flex items-end gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
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
