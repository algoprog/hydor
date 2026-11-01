// Text cut short with an ellipsis anywhere in the app (a session's title, a page's or section's name, a chosen
// model…) scrolls slowly while a mouse rests on it, so all of it can be read: to its end, a pause, back to the
// start, and again while the pointer stays. Nothing is wrapped or re-rendered: the cut-short element itself
// scrolls (overflow: hidden still scrolls when told to) with its ellipsis put away meanwhile. Touch has no
// hover, so phones keep their ellipses; nothing moves for those who ask for less motion.
import { reducedMotion } from './motion';

/** Pixels a second, reading speed; back to the start three times as fast. */
const SPEED = 40;
const BACK = 3;
/** Resting this long before it moves (a pointer passing over moves nothing), and at each end. */
const WAIT = 450;
const REST_END = 1400;
const REST_START = 900;
/** How far up from the element under the pointer the cut-short one may be. */
const DEPTH = 4;
/** Text that is typed or written in place scrolls by itself already. */
const NEVER = 'input, textarea, select, [contenteditable="true"], .cm-editor, .xterm';

let on: { el: HTMLElement; raf: number; timer: ReturnType<typeof setTimeout> } | null = null;

/** The element under the pointer, or one just above it, whose text is cut short now. */
function cutShort(target: EventTarget | null): HTMLElement | null {
  let el = target instanceof Element ? target : null;
  if (!el || el.closest(NEVER)) return null;
  for (let i = 0; el && i < DEPTH; el = el.parentElement, i++) {
    // The one scrolling has its ellipsis put away, so it is known by being the one.
    if (el === on?.el) return on.el;
    if (el instanceof HTMLElement && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis') return el;
  }
  return null;
}

function stop() {
  if (!on) return;
  clearTimeout(on.timer);
  cancelAnimationFrame(on.raf);
  on.el.scrollLeft = 0;
  on.el.style.textOverflow = '';
  on = null;
}

function scroll(el: HTMLElement) {
  if (!on || on.el !== el) return;
  el.style.textOverflow = 'clip';
  let pos = 0;
  let dir = 1;
  let last = performance.now();
  let restUntil = last;
  const step = (t: number) => {
    if (!on || on.el !== el) return;
    if (!el.isConnected) return stop();
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    if (t >= restUntil) {
      // Measured each frame: the text may change while it shows (a title arriving, a translation).
      const max = el.scrollWidth - el.clientWidth;
      pos += dir * SPEED * (dir > 0 ? 1 : BACK) * dt;
      if (pos >= max) {
        pos = max;
        dir = -1;
        restUntil = t + REST_END;
      } else if (pos <= 0) {
        pos = 0;
        dir = 1;
        restUntil = t + REST_START;
      }
      el.scrollLeft = pos;
    }
    on.raf = requestAnimationFrame(step);
  };
  on.raf = requestAnimationFrame(step);
}

/** Starts following the mouse (once, when the app starts). */
export function startHoverScroll() {
  document.addEventListener(
    'pointerover',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = cutShort(e.target);
      if (el === on?.el) return;
      stop();
      if (!el || reducedMotion()) return;
      on = { el, raf: 0, timer: setTimeout(() => scroll(el), WAIT) };
    },
    { passive: true },
  );
  // Leaving it (not for a part of it), or the window, puts it back; so does a click (it may open something in its place).
  document.addEventListener(
    'pointerout',
    (e) => {
      const into = e.relatedTarget instanceof Node ? e.relatedTarget : null;
      if (on && e.target instanceof Node && on.el.contains(e.target) && !(into && on.el.contains(into))) stop();
    },
    { passive: true },
  );
  document.addEventListener('pointerdown', stop, { passive: true });
  window.addEventListener('blur', stop);
}
