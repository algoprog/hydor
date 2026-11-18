import { useEffect, useState, type ReactNode } from 'react';
import { PanelLeftClose, WifiOff } from 'lucide-react';
import { MOD } from '../../lib/format';
import { useApp, useUI } from '../../lib/store';
import { Wordmark } from '../../components/Logo';
import { IconButton } from '../../components/ui';
import { RAIL_WIDTH } from './Rail';

/** The column's width, one for every page that has one (the sessions', the Library's, Settings'): kept in the settings, bounded by the window. */
export function useNavWidth() {
  const navigationWidth = useUI((s) => s.navigationWidth);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  // Keep the column bounded when the window changes size.
  useEffect(() => {
    const resize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  // The rail takes its width off the window's; the column and the page keep what is left.
  const max = Math.max(180, Math.min(560, windowWidth - RAIL_WIDTH - 320));
  const width = Math.max(180, Math.min(max, Number.isFinite(navigationWidth) ? navigationWidth : 280));
  const set = (w: number) => useUI.getState().set({ navigationWidth: Math.max(180, Math.min(max, w)) });
  return { width, max, set };
}

/**
 * The column beside the rail on a computer, the same on every page that has a list beside it: the logo, then the
 * page's own `actions` and Hide sidebar (Ctrl+B) in a row, and the page's list under it (`children`, which scrolls
 * itself). Its width is dragged, or moved with the arrow keys, and shared. Shown while the sidebar is open; the pages
 * that use it show nothing here on a phone. `label`: its name for screen readers; `tip`: the tip the logo points at.
 */
export function SideColumn({ label, actions, tour, tip, children }: { label: string; actions?: ReactNode; tour?: string; tip?: string; children: ReactNode }) {
  const sideOpen = useUI((s) => s.sideOpen);
  const connected = useApp((s) => s.connected);
  const { width, max, set } = useNavWidth();
  if (!sideOpen) return null;
  return (
    <div className="relative shrink-0" style={{ width }}>
      <aside aria-label={label} data-column data-tour={tour} className="flex h-full w-full flex-col border-r border-line bg-sidebar pt-[var(--safe-top)]">
        <div data-tour={tour ? `${tour}-top` : undefined} className="flex h-14 shrink-0 items-center gap-1 pr-2 pl-4">
          <span data-tip={tip} className="flex min-w-0 flex-1 items-center text-fg">
            <Wordmark height={16} tide />
          </span>
          {!connected && (
            <span title="Reconnecting…" className="px-1 text-warn">
              <WifiOff size={15} />
            </span>
          )}
          {actions}
          <IconButton label={`Hide sidebar (${MOD}B)`} onClick={() => useUI.getState().set({ sideOpen: false })}>
            <PanelLeftClose size={17} />
          </IconButton>
        </div>
        {children}
      </aside>
      <div
        role="separator" aria-label="Resize navigation" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={max} aria-valuenow={width} tabIndex={0}
        className="absolute top-0 right-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize touch-none hover:bg-accent/30 focus-visible:bg-accent/30 focus-visible:outline-none"
        onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); } }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) set(e.clientX - RAIL_WIDTH); }}
        onPointerUp={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); set(width + (e.key === 'ArrowLeft' ? -10 : 10)); } }}
      />
    </div>
  );
}
