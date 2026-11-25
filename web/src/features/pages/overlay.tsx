// A page full screen, over the app: Escape, the close button or a click beside it closes it.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton, useLayer } from '../../components/ui';

export function PageOverlay({ title, onClose, actions, children }: { title: ReactNode; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  // Escape closes it, and not a dialog it opened over; one opened over it is closed first.
  const ref = useRef<HTMLDivElement>(null);
  const onTop = useLayer(ref);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onTop() && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose, onTop]);
  return createPortal(
    <div ref={ref} className="scrim holds fixed inset-0 z-50 flex flex-col p-0 sm:p-6 [--scrim:0.6]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="anim-modal flex min-h-0 flex-1 flex-col overflow-hidden bg-panel sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 pt-[max(8px,var(--safe-top))]">
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{title}</span>
          {actions}
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
