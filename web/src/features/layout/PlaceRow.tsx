import type { ReactNode } from 'react';
import { cx } from '../../components/ui';

/**
 * One place in the list of a page's column (the Library's, the Apps page's): a row with its icon, its name and how
 * many it holds, the open one marked. The same look as the Library's places.
 */
export function PlaceRow({ on, icon, label, count, onClick, mine }: { on: boolean; icon: ReactNode; label: string; count?: number; onClick: () => void; mine?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? 'true' : undefined}
      className={cx('flex h-9 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] transition-colors', on ? 'bg-bg-2 font-medium text-fg' : 'text-fg-2 hover:bg-bg-1 hover:text-fg')}
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <span translate={mine ? 'no' : undefined} className="min-w-0 flex-1 truncate">
        {label}
      </span>
      {count !== undefined && count > 0 && <span className="tnum text-[12px] text-fg-3">{count}</span>}
    </button>
  );
}

/** A small label over a group of places (the Library's Projects, the Apps page's Kinds). */
export function PlacesLabel({ children }: { children: ReactNode }) {
  return <div className="px-2.5 pt-4 pb-1 text-[11.5px] font-medium tracking-wide text-fg-3 uppercase">{children}</div>;
}
