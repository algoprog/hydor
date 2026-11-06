// How a run stands, as a badge: the Apps page's runs and recent apps, an app's runs, a run's page.
import type { AppRun } from '@shared/apps';
import { Badge } from '../../components/ui';

const STATUS: Record<AppRun['status'], { label: string; tone: 'neutral' | 'ok' | 'err' | 'warn' | 'info' }> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  starting: { label: 'Starting', tone: 'info' },
  running: { label: 'Working', tone: 'info' },
  waiting: { label: 'Needs you', tone: 'warn' },
  done: { label: 'Done', tone: 'ok' },
  failed: { label: 'Failed', tone: 'err' },
  stopped: { label: 'Stopped', tone: 'neutral' },
};

export const statusBadge = (r: AppRun) => <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>;
