// Zoom controls, and a full screen view that zooms and pans what it shows (a reply's table or code, a diagram): − , the
// percentage (back to 100 %) and +, Ctrl or ⌘ with + − 0, Ctrl and the wheel or a pinch (about the pointer), and a drag
// to move about once zoomed. Scrolling moves about too.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { stepZoom, VIEW_ZOOMS, type ZoomOp } from '@shared/zoom';
import { PageOverlay } from '../features/pages/overlay';
import { addZoomTarget } from '../lib/convZoom';
import { MOD } from '../lib/format';
import { cx } from './ui';

/** − 125% +, the percentage going back to 100 %. */
export function ZoomStepper({ zoom, steps, onZoom, small, className }: { zoom: number; steps: readonly number[]; onZoom: (op: ZoomOp) => void; small?: boolean; className?: string }) {
  const btn = cx('inline-flex shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-bg-3 hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent', small ? 'h-6 w-6' : 'h-7 w-7');
  return (
    <div role="group" aria-label="Zoom" className={cx('inline-flex shrink-0 items-center gap-0.5', className)}>
      <button type="button" className={btn} title={`Zoom out (${MOD}−)`} aria-label="Zoom out" disabled={zoom <= steps[0] + 0.005} onClick={() => onZoom('out')}>
        <Minus size={13} />
      </button>
      <button type="button" className={cx('tnum min-w-11 rounded-md px-1 text-center text-[12px] text-fg-2 transition-colors hover:bg-bg-3 hover:text-fg', small ? 'h-6' : 'h-7')} title={`Reset zoom (${MOD}0)`} aria-label="Reset zoom" onClick={() => onZoom('reset')}>
        <span translate="no">{Math.round(zoom * 100)}%</span>
      </button>
      <button type="button" className={btn} title={`Zoom in (${MOD}+)`} aria-label="Zoom in" disabled={zoom >= steps[steps.length - 1] - 0.005} onClick={() => onZoom('in')}>
        <Plus size={13} />
      </button>
    </div>
  );
}

/** Safari's pinch on a Mac or an iPhone, which comes as gestures rather than Ctrl and the wheel. */
type Gesture = Event & { scale: number; clientX: number; clientY: number };

const range = (z: number) => Math.min(VIEW_ZOOMS[VIEW_ZOOMS.length - 1], Math.max(VIEW_ZOOMS[0], z));

function Stage({ zoom, apply, fill, step, children }: { zoom: number; apply: (z: number) => void; fill?: boolean; step: { current: (op: ZoomOp) => void }; children: ReactNode }) {
  const view = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  /** The point to keep where it is while the next level is laid out: where in the content, and where on the screen. */
  const keep = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null);
  const now = useRef(zoom);
  now.current = zoom;
  const [dragging, setDragging] = useState(false);

  const to = (z: number, at?: { x: number; y: number }) => {
    const next = range(z);
    const sc = view.current;
    const el = body.current;
    if (next === now.current || !sc || !el) return;
    const v = sc.getBoundingClientRect();
    const p = at ?? { x: v.left + v.width / 2, y: v.top + v.height / 2 };
    const r = el.getBoundingClientRect();
    if (r.width && r.height) keep.current = { fx: (p.x - r.left) / r.width, fy: (p.y - r.top) / r.height, ...p };
    now.current = next;
    apply(next);
  };
  const act = useRef(to);
  act.current = to;

  useLayoutEffect(() => {
    const k = keep.current;
    const sc = view.current;
    const el = body.current;
    keep.current = null;
    if (!k || !sc || !el) return;
    const r = el.getBoundingClientRect();
    sc.scrollLeft += r.left + k.fx * r.width - k.x;
    sc.scrollTop += r.top + k.fy * r.height - k.y;
  }, [zoom]);

  // A step up or down, or back, keeping the middle of the view: the bar's buttons, the keys and the desktop's View menu.
  step.current = (op) => act.current(stepZoom(now.current, op, VIEW_ZOOMS));
  // While it is open they are this view's, not the conversation's behind it.
  useEffect(() => addZoomTarget({ layer: 1, run: (op) => (step.current(op), true) }), []);

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
      act.current(now.current * Math.exp(-Math.max(-25, Math.min(25, d)) / 100), { x: e.clientX, y: e.clientY });
    };
    let base = 1;
    const start = (e: Event) => {
      e.preventDefault();
      base = now.current;
    };
    const change = (e: Event) => {
      e.preventDefault();
      const g = e as Gesture;
      act.current(base * g.scale, { x: g.clientX, y: g.clientY });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('gesturestart', start);
    el.addEventListener('gesturechange', change);
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('gesturestart', start);
      el.removeEventListener('gesturechange', change);
    };
  }, []);

  // A mouse drag moves about once zoomed (a finger scrolls by itself). A click without moving stays a click.
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const sc = view.current;
    if (!sc || e.button !== 0 || e.pointerType !== 'mouse' || now.current === 1) return;
    if (sc.scrollWidth <= sc.clientWidth && sc.scrollHeight <= sc.clientHeight) return;
    // A press on a scroll bar drags it.
    if (e.target === sc && (e.nativeEvent.offsetX >= sc.clientWidth || e.nativeEvent.offsetY >= sc.clientHeight)) return;
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
    let moved = false;
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - from.x, m.clientY - from.y) < 4) return;
      if (!moved) setDragging((moved = true));
      sc.scrollLeft = from.left - (m.clientX - from.x);
      sc.scrollTop = from.top - (m.clientY - from.y);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return;
      setDragging(false);
      // The click that ends the drag opens nothing it happens to be over.
      const swallow = (c: MouseEvent) => (c.preventDefault(), c.stopPropagation());
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true), 0);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <div ref={view} tabIndex={-1} onPointerDown={down} className={cx('zoom-view', zoom !== 1 && 'zoom-view-grab', dragging && 'zoom-view-dragging')}>
      {/* `fill` (a diagram, fitted to the view at 100 %): as many views large as the zoom; else what it shows, enlarged. */}
      <div ref={body} className={fill ? 'zoom-fill' : 'zoom-flow'} style={fill ? { width: `${zoom * 100}%`, height: `${zoom * 100}%` } : { zoom }}>
        {children}
      </div>
    </div>
  );
}

/** What happens inside stays inside: it is in the conversation in React's tree, though not on the page. */
const stop = (e: SyntheticEvent) => e.stopPropagation();

/** Full screen (features/pages/overlay.tsx) with zoom and pan. `actions`: more buttons in its bar, before the zoom's. */
export function ZoomOverlay({ title, onClose, actions, fill, children }: { title: ReactNode; onClose: () => void; actions?: ReactNode; fill?: boolean; children: ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const step = useRef<(op: ZoomOp) => void>(() => {});
  return (
    <div className="contents" onWheel={stop} onTouchStart={stop} onTouchMove={stop} onTouchEnd={stop} onClick={stop}>
      <PageOverlay
        title={title}
        onClose={onClose}
        actions={
          <>
            <ZoomStepper zoom={zoom} steps={VIEW_ZOOMS} onZoom={(op) => step.current(op)} />
            {actions}
          </>
        }
      >
        <Stage zoom={zoom} apply={setZoom} fill={fill} step={step}>
          {children}
        </Stage>
      </PageOverlay>
    </div>
  );
}
