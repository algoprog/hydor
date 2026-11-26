import { tr } from '../../i18n/runtime';
import { Throbber, cx } from '../../components/ui';
import type { WebStatus } from './status';

/** A dot (or a small spinner while it is busy) and the status in words. */
export function StatusLabel({ s, className }: { s: WebStatus; className?: string }) {
  return (
    <span className={cx('inline-flex min-w-0 items-center gap-1.5 text-[12.5px]', s.tone === 'err' ? 'text-err' : s.tone === 'ok' ? 'text-ok' : 'text-fg-2', className)}>
      {s.tone === 'busy' ? <Throbber size={11} /> : <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', s.tone === 'ok' ? 'bg-ok' : s.tone === 'err' ? 'bg-err' : 'bg-fg-3/60')} />}
      <span className="truncate">{tr(s.label)}</span>
    </span>
  );
}
