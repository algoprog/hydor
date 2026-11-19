// A download as water filling a fine pipe: Settings, the corner note and an older machine's page show it.
import { cx } from './ui';

export function DownloadBar({ share, className }: { share: number; className?: string }) {
  const part = Math.max(0, Math.min(1, share));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(part * 100)}
      aria-label="Download"
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-bg-2', className)}
    >
      <div className="tour-pipe-water h-full rounded-full" style={{ width: `${Math.max(2, part * 100)}%` }} />
    </div>
  );
}
