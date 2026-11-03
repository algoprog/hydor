// Tips after the welcome tour (shared/tips.ts): the rest of the app, one part at a time, the first time each part
// shows on screen. A part is an element marked data-tip="<id>". Once one has been on screen and uncovered for a
// moment, with no tip lately and nothing open over the page, a small card beside it says what it is, and a ring
// marks it; the page around stays as it is, to go on working. Got it, Learn more or using the part marks the tip
// seen on every device; Skip tips turns them all off, as skipping the tour does (Settings → General turns them on).
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb } from 'lucide-react';
import { isTipId, TIP_GUIDE, TIP_IDS, type TipId } from '@shared/tips';
import { goApp } from '../../lib/nav';
import { toast } from '../../lib/store';
import { Button, cx, useIsMobile } from '../../components/ui';
import { TOUR_VERSION, tourOpen } from '../tour/Tour';
import { TIP_TEXT } from './catalog';
import { loadTips, setTipsOn, tipSeen, useTips } from './state';

/** How long a part is on screen before its tip comes (ms). */
const DWELL = 1200;
/** The least time between one tip going and the next coming, so they never come in a row. */
const GAP = 20_000;
/** The first tip waits this long after the app opens. */
const SETTLE = 3000;
/** A tip waits this long after a key press, so it never comes up under your hands. */
const TYPING = 1500;
/** Seen this long, a tip counts as read even when its part went away before Got it. */
const READ = 4000;
const EDGE = 12;
/** Room between the ring and the card. */
const SPACE = 10;
/** Room between the part and its ring. */
const PAD = 4;

interface Shown {
  id: TipId;
  el: HTMLElement;
  at: number;
}

const visibleNow = (el: Element) =>
  typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : (() => {
        const st = getComputedStyle(el);
        return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
      })();

/** Something is open over the page: a menu, a dialog, the search box, the drawer sliding, a picture in full. */
function covered(): boolean {
  if (tourOpen() || document.querySelector('[role="dialog"]:not([data-tip-card]), [aria-modal="true"]')) return true;
  for (const el of document.querySelectorAll('.scrim')) if (visibleNow(el)) return true;
  return false;
}

/** A part's box while it is on screen and nothing covers it (what is at its middle is it), else null. */
function onScreen(el: HTMLElement): DOMRect | null {
  if (!el.isConnected || el.closest('[inert]')) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4 || r.bottom < EDGE || r.right < EDGE || r.top > innerHeight - EDGE || r.left > innerWidth - EDGE) return null;
  const hit = document.elementFromPoint(Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1));
  return hit && (el === hit || el.contains(hit) || hit.closest('[data-tip-card]')) ? r : null;
}

/** Where the card goes: right of a part in the sidebar, else below the part, above it, or beside it. */
function place(r: DOMRect, w: number, h: number, sidebar: boolean): { left: number; top: number } {
  const vw = innerWidth;
  const vh = innerHeight;
  const x = (v: number) => Math.min(Math.max(v, EDGE), vw - EDGE - w);
  const y = (v: number) => Math.min(Math.max(v, EDGE), vh - EDGE - h);
  const right = r.right + PAD + SPACE;
  if (sidebar && right + w <= vw - EDGE) return { left: right, top: y(r.top + r.height / 2 - h / 2) };
  const left = x(r.left + r.width / 2 - w / 2);
  const below = r.bottom + PAD + SPACE;
  if (below + h <= vh - EDGE) return { left, top: below };
  const above = r.top - PAD - SPACE - h;
  if (above >= EDGE) return { left, top: above };
  if (right + w <= vw - EDGE) return { left: right, top: y(r.top) };
  const before = r.left - PAD - SPACE - w;
  if (before >= EDGE) return { left: before, top: y(r.top) };
  return { left, top: vh - EDGE - h };
}

const same = (a: DOMRect, b: DOMRect) => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

export function Tips() {
  const on = useTips((s) => s.loaded && s.on);
  const tour = useTips((s) => s.tour);
  const mobile = useIsMobile();
  // After the tour: until it was taken (or skipped) once, it is still to come.
  const active = on && tour >= TOUR_VERSION;
  const [shown, setShown] = useState<Shown | null>(null);
  const [box, setBox] = useState<DOMRect | null>(null);
  // Covered for now (a menu opened over it): out of sight until it is clear again.
  const [hidden, setHidden] = useState(false);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(0);
  const titleId = useId();
  const shownRef = useRef<Shown | null>(null);
  shownRef.current = shown;
  // When the last tip went (the app opening counts as one).
  const last = useRef(Date.now() - GAP + SETTLE);
  // Since when each part has been on screen.
  const since = useRef(new Map<Element, number>());
  // Tips whose part went away before they were read: not again until the app opens again.
  const dropped = useRef(new Set<TipId>());
  const typed = useRef(0);
  const pressing = useRef(false);

  useEffect(() => loadTips(), []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => !e.repeat && (typed.current = Date.now());
    const down = (e: PointerEvent) => {
      pressing.current = true;
      // Using the part the tip is about: it has done its job.
      const s = shownRef.current;
      if (s && e.target instanceof Node && s.el.contains(e.target)) close(true);
    };
    const up = () => (pressing.current = false);
    window.addEventListener('keydown', key, true);
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    // A press that ends outside the window (or as it loses the focus) ends here too.
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
    };
  }, []);

  const close = (read: boolean) => {
    const s = shownRef.current;
    if (!s) return;
    if (read || Date.now() - s.at >= READ) tipSeen(s.id);
    else dropped.current.add(s.id);
    last.current = Date.now();
    shownRef.current = null;
    setShown(null);
    setBox(null);
    setHidden(false);
  };

  // Look for a part on screen whose tip has not been shown; the first of the list goes first.
  useEffect(() => {
    if (!active || shown) return;
    const look = () => {
      const now = Date.now();
      if (document.visibilityState !== 'visible' || pressing.current || covered()) {
        since.current.clear();
        return;
      }
      const seen = useTips.getState().seen;
      const still = new Set<Element>();
      let best: { id: TipId; el: HTMLElement; rank: number } | null = null;
      for (const el of document.querySelectorAll<HTMLElement>('[data-tip]')) {
        const id = el.dataset.tip;
        if (!isTipId(id) || seen.includes(id) || dropped.current.has(id) || !onScreen(el)) continue;
        still.add(el);
        const from = since.current.get(el) ?? now;
        since.current.set(el, from);
        const rank = TIP_IDS.indexOf(id);
        if (now - from >= DWELL && (!best || rank < best.rank)) best = { id, el, rank };
      }
      for (const el of [...since.current.keys()]) if (!still.has(el)) since.current.delete(el);
      if (best && now - last.current >= GAP && now - typed.current >= TYPING) setShown({ id: best.id, el: best.el, at: now });
    };
    const t = setInterval(look, 400);
    return () => clearInterval(t);
  }, [active, shown]);

  // Follow the part (the page scrolls, it moves); the tip goes when the part does, or tips are turned off.
  useEffect(() => {
    if (!shown) return;
    if (!active) return close(true);
    let raf = 0;
    let frame = 0;
    let gone = 0;
    const tick = () => {
      // Its box every frame, so the card keeps up; whether it is still in sight a few times a second.
      if (frame++ % 8 === 0) {
        const r = onScreen(shown.el);
        const over = covered();
        if (!r && !over) {
          gone ||= Date.now();
          // Gone from the page, or out of sight for more than a moment (not a mere redraw).
          if (!shown.el.isConnected || Date.now() - gone > 700) return close(false);
        } else gone = 0;
        setHidden(over || !r);
      }
      const r = shown.el.getBoundingClientRect();
      setBox((b) => (b && same(b, r) ? b : r));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shown, active]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!card) return;
    const measure = () => setCardH(card.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(card);
    return () => ro.disconnect();
  }, [card]);

  if (!shown || !box) return null;
  const text = TIP_TEXT[shown.id];
  const w = mobile ? Math.min(innerWidth - EDGE * 2, 380) : 304;
  const at = place(box, w, cardH || 160, !mobile && !!shown.el.closest('[data-tour="sidebar"]'));
  const skip = () => {
    setTipsOn(false);
    close(true);
    toast('No more tips. Settings → General turns them on again.');
  };
  const more = () => {
    const to = TIP_GUIDE[shown.id];
    close(true);
    goApp(to);
  };
  const keys = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close(true);
  };
  return createPortal(
    <>
      <div
        aria-hidden
        className={cx('tip-ring pointer-events-none fixed z-[45] rounded-[12px]', hidden && 'opacity-0')}
        style={{ left: box.left - PAD, top: box.top - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2 }}
      >
        <span key={shown.id} className="tour-ping" />
      </div>
      <div
        ref={setCard}
        key={shown.id}
        data-tip-card
        role="dialog"
        aria-labelledby={titleId}
        onKeyDown={keys}
        className={cx('tip-card fixed z-[45] overflow-hidden rounded-2xl border border-line-2 bg-elevated shadow-lg transition-opacity duration-200', hidden && 'pointer-events-none opacity-0', !cardH && 'invisible')}
        style={{ left: at.left, top: at.top, width: w }}
      >
        <div className="flex gap-2.5 px-4 pt-3.5 pb-3">
          <Lightbulb size={15} className="mt-[3px] shrink-0 text-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <div id={titleId} className="text-[14px] font-semibold tracking-tight text-fg">
              {text.title}
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{text.body}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 border-t border-line bg-bg-1 px-2.5 py-2">
          <Button size="sm" variant="ghost" onClick={skip} title="Stop showing tips, on every device">
            Skip tips
          </Button>
          <span className="flex-1" />
          <Button size="sm" variant="ghost" onClick={more} title="Open this part of the guide">
            Learn more
          </Button>
          <Button size="sm" variant="primary" onClick={() => close(true)}>
            Got it
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
