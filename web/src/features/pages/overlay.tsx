// A page full screen, over the app: Escape, the close button or a click beside it closes it.
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from '../../components/ui';

export function PageOverlay({ title, onClose, actions, children }: { title: string; onClose: () => void; actions?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return createPortal(
    <div className="scrim fixed inset-0 z-50 flex flex-col p-0 sm:p-6 [--scrim:0.6]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel sm:rounded-2xl">
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
