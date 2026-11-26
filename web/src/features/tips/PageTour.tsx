// A page's short tour, for people new to what the page is about (Git, Experiments): a few steps in plain words, each
// lighting a part of the page (an element marked data-intro="<name>"), with the rest dimmed around it and a card beside
// it, as the welcome tour does. A step whose part is not on screen says its words in the middle. It comes by itself the
// first time the page opens, once the welcome tour is done and while tips are on, and any time from the page's Show me
// around button. Seen is kept with the tips (shared/tips.ts: a tour has its page's tip id), the same on every device.
// The steps and their pictures are with their pages (features/git/tour.tsx, features/experiments/tour.tsx).
import { useEffect, useId, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { Compass, X } from 'lucide-react';
import { create } from 'zustand';
import type { TipId } from '@shared/tips';
import { reducedMotion } from '../../lib/motion';
import { useUI } from '../../lib/store';
import { Button, cx, IconButton, useIsMobile } from '../../components/ui';
import { TOUR_VERSION, tourOpen } from '../tour/Tour';
import { tipSeen, useTips } from './state';

export interface IntroStep {
  /** The part lit: data-intro name(s), the first of them on screen. None: the card sits in the middle. */
  target?: string | string[];
  title: string;
  body: string;
  /** A small picture over the title. */
  Picture?: ComponentType;
}

export type PageTourId = Extract<TipId, 'git' | 'experiments'>;

/** The tour that is open, and the step it is at. */
const usePageTour = create<{ id: PageTourId | null; i: number }>(() => ({ id: null, i: 0 }));

export function startPageTour(id: PageTourId) {
  usePageTour.setState({ id, i: 0 });
}

/** Finished, skipped or closed: it does not come by itself again. */
function endPageTour() {
  const { id } = usePageTour.getState();
  if (!id) return;
  usePageTour.setState({ id: null, i: 0 });
  tipSeen(id);
}

/** The button in a page's header that starts its tour. */
export function TourButton({ id }: { id: PageTourId }) {
  return (
    <IconButton label="Show me around" data-intro={`${id}-tour`} onClick={() => startPageTour(id)}>
      <Compass size={16} />
    </IconButton>
  );
}

/** How long the page is loaded and clear before its tour comes by itself (ms). */
const SETTLE = 800;

const visible = (el: Element) =>
  typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : (() => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
      })();

/** The page can take a tour now: loaded (nothing marked data-intro-loading), and nothing open over it. */
function clear(): boolean {
  if (document.visibilityState !== 'visible' || tourOpen() || useUI.getState().drawerOpen) return false;
  if (document.querySelector('[data-intro-loading], [role="dialog"]:not([data-tip-card]), [aria-modal="true"]')) return false;
  return ![...document.querySelectorAll('.scrim')].some(visible);
}

/** How many of each tour's pages are mounted. */
const mounted: Partial<Record<PageTourId, number>> = {};

/** A page's tour, mounted in its page. `ready`: the page has what it shows (not while it loads). */
export function PageTour({ id, steps, ready = true }: { id: PageTourId; steps: IntroStep[]; ready?: boolean }) {
  const open = usePageTour((s) => s.id === id);
  const due = useTips((s) => s.loaded && s.on && s.tour >= TOUR_VERSION && !s.seen.includes(id));

  useEffect(() => {
    if (!due || !ready || open) return;
    let since = 0;
    const t = setInterval(() => {
      if (!clear()) since = 0;
      else if (!since) since = Date.now();
      else if (Date.now() - since >= SETTLE) startPageTour(id);
    }, 100);
    return () => clearInterval(t);
  }, [due, ready, open, id]);

  // Leaving the page closes its tour. Looked at a moment later: the page drawn another way (the window crossing the
  // phone's width) mounts it again at once.
  useEffect(() => {
    mounted[id] = (mounted[id] ?? 0) + 1;
    return () => {
      mounted[id] = (mounted[id] ?? 1) - 1;
      setTimeout(() => !mounted[id] && usePageTour.getState().id === id && endPageTour());
    };
  }, [id]);

  return open ? <Overlay id={id} steps={steps} /> : null;
}

// ---- the overlay ----------------------------------------------------------------------------

/** The card's width on wider screens. */
const WIDTH = 340;
/** Room between a part and the edge of its light. */
const PAD = 5;
/** Room between the light and the card. */
const GAP = 12;
/** Room between the card and the window's edge, and on a phone. */
const EDGE = 16;
const PHONE_EDGE = 12;
/** How much of a tall part is enough to see beside the card. */
const SHOW = 180;
/** How long a step waits for its part to show before its card goes to the middle (ms). */
const WAIT = 250;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Edges {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The part a step lights: the first of its names on screen. A mark inside a tab means the whole tab. */
function findPart(target: string | string[] | undefined): HTMLElement | null {
  for (const name of target ? [target].flat() : []) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-intro="${name}"]`)) {
      const part = el.closest<HTMLElement>('[role="tab"]') ?? el;
      const r = part.getBoundingClientRect();
      if (r.width >= 4 && r.height >= 4 && !part.closest('[inert]') && visible(part)) return part;
    }
  }
  return null;
}

/** What is seen of a part: its box, less what the window and the boxes it scrolls in cut off. */
function seenOf(el: HTMLElement): Edges | null {
  const r = el.getBoundingClientRect();
  const e: Edges = { left: Math.max(r.left, 0), top: Math.max(r.top, 0), right: Math.min(r.right, innerWidth), bottom: Math.min(r.bottom, innerHeight) };
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const st = getComputedStyle(p);
    if (st.overflowX === 'visible' && st.overflowY === 'visible') continue;
    const c = p.getBoundingClientRect();
    e.left = Math.max(e.left, c.left);
    e.top = Math.max(e.top, c.top);
    e.right = Math.min(e.right, c.right);
    e.bottom = Math.min(e.bottom, c.bottom);
  }
  return e.right - e.left >= 4 && e.bottom - e.top >= 4 ? e : null;
}

/** Brings a part into view. `under`: on a phone, where the card begins, so the part is scrolled up over it if it can be. */
function reveal(el: HTMLElement, under?: number) {
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (under === undefined) return;
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(p).overflowY) || p.scrollHeight <= p.clientHeight) continue;
    const r = el.getBoundingClientRect();
    const by = Math.min(r.bottom + PAD - under, r.top - PAD - p.getBoundingClientRect().top);
    if (by > 0) p.scrollTop += by;
    return;
  }
}

/** The light stops short of a card over part of it. */
const cut = (e: Edges): Edges | null => (e.bottom - e.top >= 8 ? e : null);

/**
 * Where the card goes and what is lit. On a wider screen the card is beside the part (below or above it, else at a
 * side; a tall part has it at a side first), or in the middle with no part. On a phone it spans the width at the bottom,
 * the part lit above it, or at the top when the part is at the bottom of the screen. The card never covers the light:
 * where there is no room beside a part (one that fills the window), the light stops short of the card.
 */
function layout(r: Edges | null, w: number, h: number, phone: boolean, safe: { top: number; bottom: number }): { left: number; top: number; hole: Edges | null } {
  const vw = innerWidth;
  const vh = innerHeight;
  const edge = phone ? PHONE_EDGE : EDGE;
  const first = safe.top + edge;
  const last = vh - safe.bottom - edge - h;
  const middle = { left: (vw - w) / 2, top: clamp((vh - h) / 2, first, Math.max(first, last)) };
  if (!r) return { ...middle, hole: null };
  // The light stays inside the window, its ring whole, for a part at its edge (the commit box, a phone's full-width list).
  const hole: Edges = { left: Math.max(r.left - PAD, 2), top: Math.max(r.top - PAD, 2), right: Math.min(r.right + PAD, vw - 2), bottom: Math.min(r.bottom + PAD, vh - 2) };
  let x = (vw - w) / 2;
  if (!phone) {
    x = clamp((r.left + r.right) / 2 - w / 2, EDGE, vw - EDGE - w);
    const y = clamp(r.top, EDGE, Math.max(EDGE, vh - EDGE - h));
    const below = hole.bottom + GAP;
    const above = hole.top - GAP - h;
    const right = hole.right + GAP;
    const before = hole.left - GAP - w;
    const sides = {
      below: below + h <= vh - EDGE ? { left: x, top: below } : null,
      above: above >= EDGE ? { left: x, top: above } : null,
      right: right + w <= vw - EDGE ? { left: right, top: y } : null,
      left: before >= EDGE ? { left: before, top: y } : null,
    };
    // A tall part, or one in a narrow column at the left (a card under it would lie over the rail), has it at a side first.
    const leftish = (r.left + r.right) / 2 - w / 2 < EDGE + 40;
    const order = r.bottom - r.top > vh * 0.45 || leftish ? (['right', 'left', 'below', 'above'] as const) : (['below', 'above', 'right', 'left'] as const);
    for (const side of order) {
      const at = sides[side];
      if (at) return { ...at, hole };
    }
  }
  const under = last - GAP;
  if (under - hole.top >= Math.min(SHOW, hole.bottom - hole.top)) return { left: x, top: last, hole: cut({ ...hole, bottom: Math.min(hole.bottom, under) }) };
  return { left: x, top: first, hole: cut({ ...hole, top: Math.max(hole.top, first + h + GAP) }) };
}

/** A box a step of the way to where it is going, there once close (as the welcome tour glides). */
function glide(cur: Box | null, goal: Box, k: number): Box {
  if (!cur) return goal;
  const b: Box = { x: cur.x + (goal.x - cur.x) * k, y: cur.y + (goal.y - cur.y) * k, w: cur.w + (goal.w - cur.w) * k, h: cur.h + (goal.h - cur.h) * k };
  return Math.abs(b.x - goal.x) + Math.abs(b.y - goal.y) + Math.abs(b.w - goal.w) + Math.abs(b.h - goal.h) < 0.5 ? goal : b;
}

/** The dimmed page with a rounded hole where the part is (the welcome tour's). */
function holePath(b: Box): string {
  const x = Math.round(b.x);
  const y = Math.round(b.y);
  const w = Math.round(b.w);
  const h = Math.round(b.h);
  if (w < 2 || h < 2) return 'none';
  const r = Math.min(14, w / 2, h / 2);
  return `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z")`;
}

const still = () => reducedMotion() || document.documentElement.dataset.motion === 'off';

function Overlay({ id, steps }: { id: PageTourId; steps: IntroStep[] }) {
  const chosen = usePageTour((s) => s.i);
  const i = Math.min(chosen, steps.length - 1);
  const step = steps[i]!;
  const phone = useIsMobile();
  const titleId = useId();
  const bodyId = useId();
  const scrim = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const hole = useRef<Box | null>(null);
  // Where the card is, and whether it glides there (not to its first place: it has none to glide from).
  const [at, setAt] = useState<{ left: number; top: number; glides: boolean } | null>(null);
  const last = i === steps.length - 1;
  const next = () => (last ? endPageTour() : usePageTour.setState({ i: i + 1 }));
  const back = () => i > 0 && usePageTour.setState({ i: i - 1 });

  // Follow the step's part (it may appear late, move or scroll), the card beside it and the light gliding after it.
  useEffect(() => {
    let raf = 0;
    let before = performance.now();
    const since = before;
    // The part brought into view, and the window it was done for.
    let revealed: HTMLElement | null = null;
    let size = '';
    const tick = (now: number) => {
      const dt = Math.min(64, now - before);
      before = now;
      raf = requestAnimationFrame(tick);
      const c = card.current;
      if (!c || !scrim.current || !ring.current || !probe.current) return;
      const pad = getComputedStyle(probe.current);
      const safe = { top: parseFloat(pad.paddingTop) || 0, bottom: parseFloat(pad.paddingBottom) || 0 };
      const h = c.offsetHeight;
      const el = findPart(step.target);
      const win = `${innerWidth}x${innerHeight}`;
      if (el && (el !== revealed || win !== size)) {
        reveal(el, phone ? innerHeight - safe.bottom - PHONE_EDGE - h - GAP : undefined);
        revealed = el;
        size = win;
      }
      const r = el ? seenOf(el) : null;
      // A part still coming (a tab opening): wait a moment before going to the middle.
      if (!r && step.target && now - since < WAIT) return;
      const place = layout(r, c.offsetWidth, h, phone, safe);
      const calm = still();
      setAt((p) => (p && Math.abs(p.left - place.left) < 0.5 && Math.abs(p.top - place.top) < 0.5 ? p : { left: place.left, top: place.top, glides: !!p && !calm }));
      const e = place.hole;
      // With no part, the hole shuts in the middle.
      const goal: Box = e ? { x: e.left, y: e.top, w: e.right - e.left, h: e.bottom - e.top } : { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 };
      const b = (hole.current = calm ? goal : glide(hole.current ?? goal, goal, 1 - Math.exp(-dt / 85)));
      const path = holePath(b);
      if (scrim.current.style.clipPath !== path) scrim.current.style.clipPath = path;
      const s = ring.current.style;
      s.transform = `translate(${b.x}px, ${b.y}px)`;
      s.width = `${b.w}px`;
      s.height = `${b.h}px`;
      s.opacity = b.w > 8 && b.h > 8 ? '1' : '0';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, phone]);

  // The card takes the focus, and gives it back where it was once the tour is over.
  useEffect(() => {
    const from = document.activeElement;
    return () => {
      if (from instanceof HTMLElement && from.isConnected) from.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => card.current?.focus({ preventScroll: true }), [i]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') endPageTour();
      else if (e.key === 'ArrowRight') {
        // On the last step only Done closes it.
        if (!last) next();
      } else if (e.key === 'ArrowLeft') back();
      else if (e.key === 'Tab') {
        // The focus stays in the card.
        const all = [...(card.current?.querySelectorAll<HTMLElement>('button') ?? [])];
        const now = all.indexOf(document.activeElement as HTMLElement);
        const to = now < 0 ? (e.shiftKey ? all.length - 1 : 0) : (now + (e.shiftKey ? -1 : 1) + all.length) % all.length;
        all[to]?.focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });

  const Picture = step.Picture;
  const ease = 'cubic-bezier(0.22, 1, 0.36, 1)';
  return createPortal(
    // Over the whole page, so nothing under it takes a click. data-i18n: "run" means an experiment's run there.
    <div data-i18n={id === 'experiments' ? 'experiments' : undefined} className="fixed inset-0 z-[55]" onPointerDown={(e) => !card.current?.contains(e.target as Node) && e.preventDefault()}>
      <div ref={scrim} aria-hidden className="scrim tour-scrim pointer-events-none fixed inset-0" />
      <div ref={ring} aria-hidden className="tour-ring pointer-events-none fixed top-0 left-0 rounded-[14px] opacity-0" />
      {/* Measures the phone's safe areas. */}
      <div ref={probe} aria-hidden className="pointer-events-none invisible fixed top-0 left-0 pt-[var(--safe-top)] pb-[var(--safe-bottom)]" />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className={cx('tour-card fixed flex max-h-[calc(100dvh-32px)] flex-col overflow-hidden rounded-2xl border border-line-2 bg-elevated outline-none', !at && 'pointer-events-none opacity-0')}
        style={{
          left: at?.left ?? 0,
          top: at?.top ?? 0,
          width: phone ? `calc(100vw - ${PHONE_EDGE * 2}px)` : WIDTH,
          transition: at?.glides ? `left 420ms ${ease}, top 420ms ${ease}` : undefined,
        }}
      >
        <div className="min-h-0 overflow-y-auto px-4 pt-3 pb-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="tnum text-[12px] text-fg-3">{`${i + 1} of ${steps.length}`}</span>
            <IconButton label="Close" size="sm" className="-mr-1.5" onClick={endPageTour}>
              <X size={15} />
            </IconButton>
          </div>
          <div aria-live="polite">
            {Picture && (
              <div className="mt-1 mb-3 flex justify-center rounded-xl bg-bg-1 px-3 py-3">
                <Picture />
              </div>
            )}
            <h2 id={titleId} className="mt-0.5 text-[15px] font-semibold tracking-tight text-fg">
              {step.title}
            </h2>
            <p id={bodyId} className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">
              {step.body}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-line bg-bg-1 px-2.5 py-2">
          {!last && (
            <Button size="sm" variant="ghost" onClick={endPageTour}>
              Skip
            </Button>
          )}
          <span className="flex-1" />
          {i > 0 && (
            <Button size="sm" variant="ghost" onClick={back}>
              Back
            </Button>
          )}
          <Button size="sm" variant="primary" onClick={next}>
            {last ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
