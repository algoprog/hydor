// Dragging rows by touch without slowing every swipe on the page. dnd-kit's touch sensor puts a
// non-passive touchmove listener on the whole window (Safari only lets a row that was picked up stop the
// scrolling when one is there as the finger lands), so on iPhones each swipe anywhere waited for the
// page's code before it scrolled. Here the listener sits on the list being sorted, and nowhere else.
import { TouchSensor } from '@dnd-kit/core';

// How a row is picked up, the same in every list (sessions, the sidebar's tools). Made once: new settings on each
// render gave every row new drag handlers, so each update of the session list (four a second while an agent
// works) redrew all of its rows.
/** With the mouse: once it has moved a little, so a click stays a click. */
export const MOUSE_DRAG = { activationConstraint: { distance: 6 } };
/** By touch: hold a moment, so a swipe still scrolls the list. */
export const TOUCH_DRAG = { activationConstraint: { delay: 250, tolerance: 8 } };

/** The touch sensor, minus its window-wide listener: give the list `ref={touchDragArea}` instead. */
export class AreaTouchSensor extends TouchSensor {
  static setup() {
    return () => {};
  }
}

const hold = () => {};

/** A ref for the element whose rows are dragged by touch. */
export function touchDragArea(el: HTMLElement | null) {
  if (!el) return;
  el.addEventListener('touchmove', hold, { passive: false });
  return () => el.removeEventListener('touchmove', hold);
}
