// A download, or an update's progress, as water filling a fine pipe: Settings, the corner note and an older machine's page show it.
import { cx } from './ui';

export function DownloadBar({ share, className, label = 'Download' }: { share: number; className?: string; label?: string }) {
  const part = Math.max(0, Math.min(1, share));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(part * 100)}
      aria-label={label}
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-bg-2', className)}
    >
      <div className="tour-pipe-water h-full rounded-full" style={{ width: `${Math.max(2, part * 100)}%` }} />
    </div>
  );
}
