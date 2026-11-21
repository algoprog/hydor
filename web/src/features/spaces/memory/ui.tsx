// The small pieces of a project's Memory tab: a kind's icon in its tinted square, a chip, a pill, a quiet line with a Throbber.
import type { ReactNode } from 'react';
import { BookOpen, ClipboardList, FileInput, FileText, IdCard, Layers, ListTree, StickyNote, type LucideIcon } from 'lucide-react';
import { cx, Throbber } from '../../../components/ui';
import type { RowKind } from './data';

const KIND: Record<RowKind, { icon: LucideIcon; tone: string }> = {
  note: { icon: StickyNote, tone: 'bg-info/12 text-info' },
  topic: { icon: ListTree, tone: 'bg-codex/12 text-codex' },
  profile: { icon: IdCard, tone: 'bg-accent-soft text-accent' },
  article: { icon: BookOpen, tone: 'bg-ok/12 text-ok' },
  hub: { icon: Layers, tone: 'bg-ok/12 text-ok' },
  source: { icon: FileInput, tone: 'bg-ok/12 text-ok' },
  plan: { icon: ClipboardList, tone: 'bg-ok/12 text-ok' },
  document: { icon: FileText, tone: 'bg-warn/12 text-warn' },
};

/** A kind's icon in a small tinted square. */
export function KindIcon({ kind, size = 28 }: { kind: RowKind; size?: number }) {
  const { icon: Icon, tone } = KIND[kind];
  return (
    <span aria-hidden className={cx('flex shrink-0 items-center justify-center rounded-lg', tone)} style={{ width: size, height: size }}>
      <Icon size={Math.round(size * 0.55)} />
    </span>
  );
}

/** A chip that narrows the list: the open one is filled. `small` is the second row's. */
export function Chip({ on, onClick, children, count, small, className }: { on: boolean; onClick: () => void; children: ReactNode; count?: number; small?: boolean; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors',
        small ? 'h-6 px-2.5 text-[12px]' : 'h-7 px-3 text-[12.5px]',
        on ? (small ? 'bg-accent-soft text-accent' : 'bg-fg text-bg') : 'bg-bg-2 text-fg-2 hover:bg-bg-3 hover:text-fg',
        className,
      )}
    >
      {children}
      {!!count && <span className={cx('tnum font-normal', on && !small ? 'opacity-70' : 'text-fg-3')}>{count}</span>}
    </button>
  );
}

/** A small label in a reader's header. */
export function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ok' | 'warn' }) {
  return <span className={cx('inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium', tone === 'ok' ? 'bg-ok/12 text-ok' : tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-bg-2 text-fg-2')}>{children}</span>;
}

/** A line that says something is still coming. */
export function Loading({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2 px-3 py-2.5 text-[12.5px] text-fg-3">
      <Throbber size={14} />
      {children}
    </div>
  );
}
