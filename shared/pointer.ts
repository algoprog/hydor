// The agent's pointer, made plain to see: what the browser's live view draws while an agent points, clicks, types or
// scrolls in its browser (server/browser tells it), and the marks on the pictures of browser and computer steps in the
// conversation, saying where each step acted. Places are fractions of the page's (or the screen's) width and height, as
// the picture shows it, so they hold at any size.

/** What the agent does where it points. */
export type PointerAct = 'move' | 'click' | 'double' | 'triple' | 'right' | 'middle' | 'down' | 'up' | 'drag' | 'scroll' | 'type' | 'select' | 'key';

export type Way = 'up' | 'down' | 'left' | 'right';

/** A box on the page or screen (a field typed into), in fractions. */
export interface PointerBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * One thing the agent's pointer does in its browser, for the live view ({ type: 'pointer' }): it glides from where it
 * was to (x, y) over `glide` ms (the server waits that long before it acts, while someone watches), then a click spreads
 * a ring (two for a double click), typing outlines the field (`box`), a scroll shows its way, keys show their names.
 */
export interface AgentPointer {
  x: number;
  y: number;
  act: PointerAct;
  glide?: number;
  box?: PointerBox;
  dir?: Way;
  /** key: the keys pressed, as the agent named them ("Enter", "Control+A"). */
  keys?: string;
}

/** Where a step acted, on its picture: kept beside it (steps/<n>.json, as { marks }) for its row to draw. */
export interface StepMark {
  x: number;
  y: number;
  act: PointerAct;
  /** drag: where it started. */
  from?: { x: number; y: number };
  box?: PointerBox;
  dir?: Way;
}

const unit = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000 : null);
const ACTS: PointerAct[] = ['move', 'click', 'double', 'triple', 'right', 'middle', 'down', 'up', 'drag', 'scroll', 'type', 'select', 'key'];
const WAYS: Way[] = ['up', 'down', 'left', 'right'];

/** Marks as read from a file or the network: only places on the picture and known acts, at most 20. */
export function cleanMarks(raw: unknown): StepMark[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { marks?: unknown }).marks) ? (raw as { marks: unknown[] }).marks : Array.isArray(raw) ? raw : [];
  const out: StepMark[] = [];
  for (const m of list.slice(0, 20)) {
    if (!m || typeof m !== 'object') continue;
    const r = m as Record<string, unknown>;
    const x = unit(r.x);
    const y = unit(r.y);
    if (x === null || y === null || !ACTS.includes(r.act as PointerAct)) continue;
    const mark: StepMark = { x, y, act: r.act as PointerAct };
    const f = r.from as Record<string, unknown> | undefined;
    if (f && unit(f.x) !== null && unit(f.y) !== null) mark.from = { x: unit(f.x)!, y: unit(f.y)! };
    const b = r.box as Record<string, unknown> | undefined;
    if (b && [b.x, b.y, b.w, b.h].every((v) => unit(v) !== null)) mark.box = { x: unit(b.x)!, y: unit(b.y)!, w: unit(b.w)!, h: unit(b.h)! };
    if (WAYS.includes(r.dir as Way)) mark.dir = r.dir as Way;
    out.push(mark);
  }
  return out;
}
