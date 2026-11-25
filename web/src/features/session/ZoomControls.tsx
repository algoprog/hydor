// The conversation's zoom in a session (lib/convZoom.ts): its keys, Ctrl and the wheel and Safari's pinch over the
// session, the pill in its header while it is not 100 %, and the Zoom row of its ⋯ menu.
import { useEffect } from 'react';
import { ZoomIn } from 'lucide-react';
import { CONV_ZOOMS, nearestZoom, validZoom, wheelStepper, type ZoomOp } from '@shared/zoom';
import { ZoomStepper } from '../../components/ZoomPan';
import { cx } from '../../components/ui';
import { addZoomTarget, setConvZoom, useConvZoom, useZoomNews, zoomConversation } from '../../lib/convZoom';
import { useUI } from '../../lib/store';

/** Terminals and code editors keep their own keys and wheel. */
const OWN = '.xterm, .cm-editor';

/** Whether a window is over the page (a picture large, a dialog, a drawer): hidden ones (a phone's closed drawer) are not. */
const covered = () => [...document.querySelectorAll('.scrim')].some((s) => getComputedStyle(s).visibility !== 'hidden');

/** While `column` (the session's page) shows the conversation: the zoom keys, Ctrl and the wheel, and pinches go to it. */
export function useConvZoomInput(column: HTMLElement | null, active: boolean) {
  useEffect(() => {
    if (!active) return;
    return addZoomTarget({
      layer: 0,
      run: (op: ZoomOp, at) => {
        // A window over the page (a picture large, a dialog) has them: the browser's own zoom shows it larger.
        if (at?.closest(OWN) || covered()) return false;
        // Nothing to reset here: the browser's own zoom, or the desktop window's, goes back to normal.
        if (op === 'reset' && validZoom(useUI.getState().convZoom) === 1) return false;
        zoomConversation(op, true);
        return true;
      },
    });
  }, [active]);
  useEffect(() => {
    if (!active || !column) return;
    const step = wheelStepper();
    // Also what took the wheel already, such as a browser you are driving in the session.
    const own = (e: Event) => e.defaultPrevented || !!(e.target as Element | null)?.closest?.(OWN);
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey || own(e)) return;
      e.preventDefault();
      const d = step(e.deltaY, e.deltaMode, e.timeStamp);
      if (d) zoomConversation(d > 0 ? 'in' : 'out', true);
    };
    // Safari (a Mac's trackpad, an iPhone's two fingers) sends a pinch as gestures.
    let base = 1;
    let from = 1;
    const start = (e: Event) => {
      if (own(e)) return;
      e.preventDefault();
      base = from = validZoom(useUI.getState().convZoom);
    };
    const change = (e: Event) => {
      if (own(e)) return;
      e.preventDefault();
      const next = nearestZoom(base * (e as Event & { scale: number }).scale);
      // A step once the fingers have moved on to it, not at the first twitch.
      if (next !== from) setConvZoom((from = next), true);
    };
    column.addEventListener('wheel', wheel, { passive: false });
    column.addEventListener('gesturestart', start);
    column.addEventListener('gesturechange', change);
    return () => {
      column.removeEventListener('wheel', wheel);
      column.removeEventListener('gesturestart', start);
      column.removeEventListener('gesturechange', change);
    };
  }, [column, active]);
}

/** In the header, only while the conversation is not at 100 %: − 125% +, the percentage going back to 100 %. */
export function ZoomPill() {
  const zoom = useConvZoom();
  const at = useZoomNews((s) => s.at);
  if (zoom === 1) return null;
  return (
    // Drawn anew for each change by a key or the wheel, so its light starts again.
    <div key={at} data-tip="zoom" className={cx('flex shrink-0 rounded-full border border-line bg-bg-1 px-0.5', Date.now() - at < 600 && 'zoom-news')}>
      <ZoomStepper small zoom={zoom} steps={CONV_ZOOMS} onZoom={(op) => zoomConversation(op)} />
    </div>
  );
}

/** The ⋯ menu's Zoom row, always there; the menu stays open, so you can press + or − again. */
export function ZoomRow() {
  const zoom = useConvZoom();
  return (
    <div className="flex h-8.5 w-full items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-fg">
      <span className="flex w-4 shrink-0 items-center justify-center text-fg-3">
        <ZoomIn size={15} />
      </span>
      <span className="min-w-0 flex-1 truncate">Zoom</span>
      <ZoomStepper small zoom={zoom} steps={CONV_ZOOMS} onZoom={(op) => zoomConversation(op)} />
    </div>
  );
}
