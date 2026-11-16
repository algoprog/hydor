// Where each block goes in a day's column of the Schedules week: blocks that overlap sit side by side in lanes, and
// a crowd of more than a few at once (five tasks at 08:00) keeps the first lanes and gathers the rest under one
// "+N" block, which lists them when opened.

export interface Span {
  /** Its top and bottom, in pixels from the day's start. */
  top: number;
  bottom: number;
}

export interface Placed<T> {
  item: T;
  top: number;
  height: number;
  lane: number;
  /** How many lanes its group of overlapping blocks has (its width is a share of the column). */
  lanes: number;
}

export interface Crowd<T> {
  /** Those left out, in time order. */
  items: T[];
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/** Lays out one day's blocks: at most `max` lanes, the last one a crowd's "+N" when more overlap. */
export function layLanes<T>(blocks: (Span & { item: T })[], max = 3): { placed: Placed<T>[]; crowds: Crowd<T>[] } {
  const sorted = [...blocks].sort((a, b) => a.top - b.top || b.bottom - a.bottom);
  const placed: Placed<T>[] = [];
  const crowds: Crowd<T>[] = [];
  let i = 0;
  while (i < sorted.length) {
    // A group: blocks that overlap one another, one after the other.
    const group = [sorted[i]];
    let end = sorted[i].bottom;
    for (i++; i < sorted.length && sorted[i].top < end; i++) {
      group.push(sorted[i]);
      end = Math.max(end, sorted[i].bottom);
    }
    // Each takes the first lane free at its top.
    const ends: number[] = [];
    const lane = group.map((b) => {
      let l = ends.findIndex((e) => e <= b.top);
      if (l < 0) l = ends.length;
      ends[l] = b.bottom;
      return l;
    });
    const lanes = ends.length;
    if (lanes <= max) {
      group.forEach((b, k) => placed.push({ item: b.item, top: b.top, height: b.bottom - b.top, lane: lane[k], lanes }));
      continue;
    }
    // Too many at once: the first max-1 lanes as they are, the rest under one block in the last lane.
    const rest = group.filter((_, k) => lane[k] >= max - 1);
    group.forEach((b, k) => lane[k] < max - 1 && placed.push({ item: b.item, top: b.top, height: b.bottom - b.top, lane: lane[k], lanes: max }));
    const top = Math.min(...rest.map((b) => b.top));
    const bottom = Math.max(...rest.map((b) => b.bottom));
    crowds.push({ items: rest.sort((a, b) => a.top - b.top).map((b) => b.item), top, height: bottom - top, lane: max - 1, lanes: max });
  }
  return { placed, crowds };
}
