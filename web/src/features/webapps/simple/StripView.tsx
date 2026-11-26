// The progress strip of an app being made: five plain steps, where it is now, and one sentence on what is happening. On the
// app's page and above the conversation's message box (StripDock). What the conversation has cost is said quietly, only
// when Hydor knows it.
import { Check } from 'lucide-react';
import { tr } from '../../../i18n/runtime';
import { cx, Throbber } from '../../../components/ui';
import { PHASES, type StripState } from './plain';

/** "$0.42 so far": only for a figure Hydor knows. */
export const costWords = (usd: number | undefined): string => (usd && usd >= 0.005 ? tr(`$${usd.toFixed(2)} so far`) : '');

/** `bare`: the bars and the step it is at, without the other names (the app's page, which keeps to what is acted on). */
export function StripView({ strip, cost, compact, bare }: { strip: StripState; cost?: number; compact?: boolean; bare?: boolean }) {
  const spent = costWords(cost);
  return (
    <div className="@container" data-strip data-at={strip.at}>
      <ol className="flex items-start gap-1" aria-label={tr('Steps of making it')}>
        {PHASES.map((name, i) => {
          const done = strip.done || i < strip.at;
          const here = !strip.done && i === strip.at;
          return (
            <li key={name} aria-current={here ? 'step' : undefined} className="min-w-0 flex-1">
              <div className={cx('h-1.5 rounded-full', done ? 'bg-accent' : here ? cx('bg-accent/45', strip.busy && 'animate-pulse') : 'bg-bg-3')} />
              {/* The five names where there is room for them; else only the sentence below says where it is. */}
              {!bare && <div className={cx('mt-1.5 hidden items-center gap-1 text-[12px] leading-tight @min-[30rem]:flex', here ? 'font-semibold text-fg' : done ? 'text-fg-2' : 'text-fg-3', compact && '@min-[30rem]:hidden @min-[40rem]:flex')}>
                {done && <Check size={11} strokeWidth={3} className="shrink-0 text-accent" aria-hidden />}
                <span className="min-w-0 truncate">{tr(name)}</span>
              </div>}
            </li>
          );
        })}
      </ol>
      <p className="mt-1.5 flex min-w-0 items-center gap-2 text-[13px] leading-snug" role="status">
        {strip.busy && <Throbber size={13} />}
        <span className={cx('shrink-0 font-medium text-fg-2', !bare && '@min-[30rem]:hidden', !bare && compact && '@min-[30rem]:inline @min-[40rem]:hidden')}>{tr(PHASES[strip.at])}:</span>
        <span translate="no" className="min-w-0 flex-1 text-fg-2">
          {strip.sentence}
        </span>
        {spent && (
          <span translate="no" className="tnum shrink-0 text-[12px] text-fg-3" data-cost>
            {spent}
          </span>
        )}
      </p>
    </div>
  );
}
