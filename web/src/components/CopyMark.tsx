import { Check, Copy, type LucideIcon } from 'lucide-react';
import { cx } from './ui';

/**
 * A copy button's icon: when `done` (for a moment after copying) it turns into a check that draws itself, then turns
 * back (styles.css, .copy-swap). Both icons stay in place, so the change is a cross-fade, not a replacement.
 */
export function CopyMark({ done, size = 13, icon: Icon = Copy, className }: { done: boolean; size?: number; icon?: LucideIcon; className?: string }) {
  return (
    <span aria-hidden className={cx('copy-swap', done && 'done', className)}>
      <Icon size={size} className="copy-from" />
      <Check size={size} className="copy-to text-ok" />
    </span>
  );
}
