// The conversation's zoom: how large a session's messages are on one device (Ctrl or ⌘ with + − 0, Ctrl and the wheel,
// a pinch, the pill in the session's header and its menu), apart from the app's Text size. 1 is 100 %. The full screen
// view of a table, a block of code or a diagram zooms by steps of its own (VIEW_ZOOMS).

/** The levels the keys, the wheel and the buttons step through. An agent may set any level between the first and the last. */
export const CONV_ZOOMS = [0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2] as const;
/** The levels of a table, code or a diagram full screen: further both ways. */
export const VIEW_ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4] as const;

export type ZoomOp = 'in' | 'out' | 'reset';

/** A level kept within the steps' ends, to the percent; anything else that is not a number is 100 %. */
export function validZoom(v: unknown, steps: readonly number[] = CONV_ZOOMS): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 1;
  return Math.round(Math.min(steps[steps.length - 1], Math.max(steps[0], v)) * 100) / 100;
}

/** The next step up or down from `now` (which need not be a step), or 100 % again. */
export function stepZoom(now: number, op: ZoomOp, steps: readonly number[] = CONV_ZOOMS): number {
  if (op === 'reset') return 1;
  if (op === 'in') return steps.find((z) => z > now + 0.005) ?? steps[steps.length - 1];
  return [...steps].reverse().find((z) => z < now - 0.005) ?? steps[0];
}

/** The step nearest to `want` (a pinch's size): the one with the closest ratio. */
export function nearestZoom(want: number, steps: readonly number[] = CONV_ZOOMS): number {
  return steps.reduce((best: number, z) => (Math.abs(Math.log(z / want)) < Math.abs(Math.log(best / want)) ? z : best), steps[0]);
}

/** What a key press asks of the zoom: Ctrl or ⌘ with + or = (zoom in), − (out) or 0 (100 %), the number pad's too; else null. */
export function zoomKey(e: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): ZoomOp | null {
  // Alt too is AltGr on Windows, which types characters.
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
  if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') return 'in';
  if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') return 'out';
  // Digit0 by its place too: on a French keyboard it types "à" without Shift.
  if (e.key === '0' || e.code === 'Digit0') return 'reset';
  return null;
}

/**
 * Ctrl and the wheel as zoom steps (a trackpad's pinch comes as such too): each notch of a mouse wheel is a step, and
 * the many small moves of a trackpad add up to one. Answers 1 (zoom in), -1 (out) or 0 (not yet) for each event.
 */
export function wheelStepper(threshold = 12) {
  let sum = 0;
  let last = -Infinity;
  return (deltaY: number, deltaMode: number, now: number): 1 | -1 | 0 => {
    const d = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
    if (!d) return 0;
    if (now - last > 250 || Math.sign(d) !== Math.sign(sum)) sum = 0;
    last = now;
    // A mouse wheel's notch.
    if (Math.abs(d) >= 50) {
      sum = 0;
      return d < 0 ? 1 : -1;
    }
    sum += d;
    if (Math.abs(sum) < threshold) return 0;
    const step = sum < 0 ? 1 : -1;
    sum = 0;
    return step;
  };
}
