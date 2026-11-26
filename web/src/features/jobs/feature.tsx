// Jobs: long work that sessions run in the background, all in one place (the rail's Jobs tool, /jobs): what runs, how
// long it has left, what waits for what, and what finished. The rail's tool counts the jobs that run.
import { Hourglass } from 'lucide-react';
import { cx } from '../../components/ui';
import { Count } from '../../components/Count';
import type { WebFeature } from '../registry';
import { JobsPage } from './JobsPage';
import { useRunningCount } from './store';

/** How many jobs run, as a pill on the tool's icon (the rail's small tile, or the phone drawer's). */
function RunningBadge({ compact }: { compact?: boolean }) {
  const n = useRunningCount();
  if (!n) return null;
  return (
    <span className={cx('tnum pointer-events-none absolute left-[calc(50%+2px)] min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-semibold text-accent-fg', compact ? '-top-0.5' : 'top-1')}>
      <Count value={n} format={(x) => (x > 99 ? '99+' : String(Math.round(x)))} />
    </span>
  );
}

export const jobsFeature: WebFeature = {
  id: 'jobs',
  nav: [{ id: 'jobs', path: '/jobs', label: 'Jobs', icon: <Hourglass size={17} />, Extra: RunningBadge }],
  routes: [{ match: (path) => path === '/jobs', Page: JobsPage }],
};
