// Dragging rows by touch without slowing every swipe on the page. dnd-kit's touch sensor puts a
// non-passive touchmove listener on the whole window (Safari only lets a row that was picked up stop the
// scrolling when one is there as the finger lands), so on iPhones each swipe anywhere waited for the
// page's code before it scrolled. Here the listener sits on the list being sorted, and nowhere else.
import { TouchSensor } from '@dnd-kit/core';

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
