// Small pieces the automations share: a run's outcome badge, what started it, the latest outcomes as
// dots, and times in the user's time zone.
import type { ReactNode } from 'react';
import { CalendarClock, Eye, FlaskConical, Play, RotateCcw, Webhook, type LucideIcon } from 'lucide-react';
import { OUTCOME_LABEL, TRIGGER_LABEL, type RunStatus, type RunTrigger } from '@shared/automations';
import { Badge, cx, inputCls } from '../../components/ui';

const TONE: Record<RunStatus, 'ok' | 'err' | 'warn' | 'info' | 'neutral'> = {
  running: 'info',
  done: 'ok',
  partial: 'warn',
  blocked: 'warn',
  failed: 'err',
  error: 'err',
  silent: 'neutral',
};

const DOT: Record<RunStatus, string> = {
  running: 'bg-info animate-pulse',
  done: 'bg-ok',
  partial: 'bg-warn',
  blocked: 'bg-warn',
  failed: 'bg-err',
  error: 'bg-err',
  silent: 'bg-fg/25',
};

export function OutcomeBadge({ status, className }: { status: RunStatus; className?: string }) {
  return (
    <Badge tone={TONE[status]} className={className}>
      {OUTCOME_LABEL[status]}
    </Badge>
  );
}

const TRIGGER_ICON: Record<RunTrigger, LucideIcon> = { schedule: CalendarClock, webhook: Webhook, watch: Eye, manual: Play, rerun: RotateCcw, test: FlaskConical };

export function TriggerIcon({ trigger, size = 13, className }: { trigger: RunTrigger; size?: number; className?: string }) {
  const Icon = TRIGGER_ICON[trigger] ?? Play;
  return (
    <span title={TRIGGER_LABEL[trigger]} className={cx('inline-flex shrink-0 text-fg-3', className)}>
      <Icon size={size} />
    </span>
  );
}

/** The latest outcomes, oldest first, as dots. */
export function RunDots({ recent }: { recent?: { status: RunStatus; at: number }[] }) {
  if (!recent?.length) return null;
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label="Latest runs">
      {recent
        .slice(0, 6)
        .reverse()
        .map((r, i) => (
          <span key={i} title={`${OUTCOME_LABEL[r.status]} · ${new Date(r.at).toLocaleString()}`} className={cx('h-[7px] w-[7px] rounded-full', DOT[r.status])} />
        ))}
    </span>
  );
}

/** "Fri 6 Nov, 09:00", in a time zone (the browser's own when not given). */
export function localTime(at: number, tz?: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(at);
  } catch {
    return new Date(at).toLocaleString();
  }
}

/** The text box style without its full width, for boxes of a set width. */
export const boxCls = inputCls.replace(/\bw-full\b ?/, '');

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A label and its value, in the forms. */
export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block space-y-1', className)}>
      <span className="block text-[12px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] leading-snug text-fg-3">{hint}</span>}
    </label>
  );
}
