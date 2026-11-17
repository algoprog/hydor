// The panel beside the page (bookmarks, extensions, downloads, the agents' tabs): a column on a computer, so the page
// keeps what room is left; full screen on a phone.
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton, Sheet, useIsMobile } from '../../components/ui';

export function Panel({ title, onClose, actions, children, width = 360 }: { title: string; onClose: () => void; actions?: ReactNode; children: ReactNode; width?: number }) {
  const mobile = useIsMobile();
  const body = (
    <>
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-4">
        <div className="min-w-0 flex-1 truncate text-[14px] font-semibold">{title}</div>
        {actions}
        <IconButton label="Close" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </>
  );
  if (mobile)
    return (
      <Sheet open onClose={onClose} label={title} width={width}>
        {body}
      </Sheet>
    );
  return (
    <aside style={{ width }} className="flex h-full shrink-0 flex-col border-l border-line bg-bg" aria-label={title}>
      {body}
    </aside>
  );
}

/** A line of small text in a panel. */
export function Note({ children }: { children: ReactNode }) {
  return <div className="px-4 py-2 text-[12.5px] leading-relaxed text-fg-3">{children}</div>;
}
