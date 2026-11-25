// The conversation's zoom on this device, and what zooms: a session's page (features/session/SessionView.tsx), and over
// it the full screen view of a table, code or a diagram (components/ZoomPan.tsx). While one of them is on the page, Ctrl
// or ⌘ with + − 0 goes to the topmost instead of zooming the browser's whole page, and window.__hydorZoom does the same
// for the desktop app's View menu (desktop/main.cjs). The steps and keys are in shared/zoom.ts.
import { createContext } from 'react';
import { create } from 'zustand';
import { stepZoom, validZoom, zoomKey, type ZoomOp } from '@shared/zoom';
import { useUI } from './store';

/** When a key, the wheel or the menu last changed the conversation's zoom: the header's pill lights up for it. */
export const useZoomNews = create<{ at: number }>(() => ({ at: 0 }));

export const useConvZoom = () => useUI((s) => validZoom(s.convZoom));

/** The zoom of the conversation a component is drawn in (1 outside one), for sizes it takes from the window's. */
export const ConvZoomCtx = createContext(1);

/** Sets the conversation's zoom; `news`: by a key or the wheel, which the header's pill shows. */
export function setConvZoom(next: number, news = false) {
  const z = validZoom(next);
  if (z === validZoom(useUI.getState().convZoom)) return;
  if (news) useZoomNews.setState({ at: Date.now() });
  useUI.getState().set({ convZoom: z });
}

export const zoomConversation = (op: ZoomOp, news = false) => setConvZoom(stepZoom(validZoom(useUI.getState().convZoom), op), news);

// ---- who takes the keys -------------------------------------------------------------------------------------------

export interface ZoomTarget {
  /** The higher takes the keys: a full screen view (1) over the conversation (0). */
  layer: number;
  /** Zooms, with the keys' (or the menu's) focus at `at`; false: not this time, the browser or the window zooms instead. */
  run(op: ZoomOp, at: Element | null): boolean;
}

const targets: ZoomTarget[] = [];

function run(op: ZoomOp, at: Element | null): boolean {
  const top = targets.reduce<ZoomTarget | null>((best, t) => (!best || t.layer >= best.layer ? t : best), null);
  return !!top?.run(op, at);
}

// After everyone else: an editor or a reader beside the conversation that zooms itself (it took the key) keeps it. A
// listener added while the key is on its way down runs last on its way up.
function late(e: KeyboardEvent) {
  const op = zoomKey(e);
  if (op && !e.defaultPrevented && run(op, e.target as Element | null)) e.preventDefault();
}
function early(e: KeyboardEvent) {
  if (!zoomKey(e)) return;
  window.removeEventListener('keydown', late);
  window.addEventListener('keydown', late, { once: true });
}

type Hooked = Window & { __hydorZoom?: (op: ZoomOp) => boolean };

/** Makes `t` take the zoom keys while it is on the page; the function it returns takes it off again. */
export function addZoomTarget(t: ZoomTarget): () => void {
  if (!targets.length) {
    window.addEventListener('keydown', early, true);
    (window as Hooked).__hydorZoom = (op) => run(op, document.activeElement);
  }
  targets.push(t);
  return () => {
    const i = targets.indexOf(t);
    if (i >= 0) targets.splice(i, 1);
    if (targets.length) return;
    window.removeEventListener('keydown', early, true);
    window.removeEventListener('keydown', late);
    delete (window as Hooked).__hydorZoom;
  };
}

// ---- measuring inside a zoomed conversation ------------------------------------------------------------------------

/**
 * How much the conversation's zoom enlarges `el` (1 outside it). Under CSS zoom an element's own sizes and offsets
 * (offsetTop, clientWidth, the `left` you give it) are before the zoom; what the screen measures (a pointer's place,
 * getBoundingClientRect, a scroller's scrollTop outside the zoomed part) is after it.
 */
export function zoomOf(el: Element | null | undefined): number {
  return Number(el?.closest<HTMLElement>('[data-conv-zoom]')?.dataset.convZoom) || 1;
}

/** Where a pointer is on `el`, in the element's own pixels. */
export function localPoint(e: { clientX: number; clientY: number }, el: Element | null | undefined): { x: number; y: number } {
  const r = el?.getBoundingClientRect();
  const k = zoomOf(el);
  return { x: (e.clientX - (r?.left ?? 0)) / k, y: (e.clientY - (r?.top ?? 0)) / k };
}
