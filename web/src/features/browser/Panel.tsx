// What the right column shows besides Ask and an agent's conversation (history, downloads, bookmarks, extensions, site
// permissions, settings): it fills the column (the page's right column holds it, so the page keeps what room is left);
// a sheet over the page on a phone.
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
    <section className="flex h-full min-w-0 flex-1 flex-col bg-bg-1" aria-label={title}>
      {body}
    </section>
  );
}

/** A line of small text in a panel. */
export function Note({ children }: { children: ReactNode }) {
  return <div className="px-4 py-2 text-[12.5px] leading-relaxed text-fg-3">{children}</div>;
}
