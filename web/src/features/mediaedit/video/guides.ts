// What lines up in the viewer while an overlay or words are moved or sized, in pixels of the output (what the edit makes).
// Moving: the box's edges and middle snap to the frame's edges and middle, to the title-safe area and to the other
// parts showing (their edges and middles), and to a gap as wide as the ones beside it (the smart-guide maths every
// editor shares, shared/snap.ts); the distance to the nearest part on each side is marked. Sizing: an overlay or words
// are sized about their middle in proportion, so an edge lines up where it would if the box were that wide, or it is as
// wide (or as high) as another part. What comes back is drawn over the viewer in the guides' pink (GuideMarks in
// Viewer.tsx): thin lines, and small pills with a distance or a size. Shift keeps a move on one line; Alt (⌘ on a Mac)
// snaps to nothing (the distances still show). Plain functions of boxes, so each is tested on its own (guides-test.ts).
import { SNAP, type SnapBox, type SnapGap, type SnapGuide } from '@shared/snap';

/** What a drag shows over the viewer: lines, the gaps between parts, and small pills (x, y in output pixels). */
export interface Marks {
  guides: SnapGuide[];
  gaps: SnapGap[];
  pills: { x: number; y: number; text: string }[];
}
export const NO_MARKS: Marks = { guides: [], gaps: [], pills: [] };

/** How far in the title-safe area is, a share of the output's width and height: where the viewer draws its inner dashed line. */
export const SAFE_INSET = 0.05;

/** The safe area as a box of the output. */
export const safeBox = (out: { w: number; h: number }): SnapBox => ({ x: out.w * SAFE_INSET, y: out.h * SAFE_INSET, w: out.w * (1 - 2 * SAFE_INSET), h: out.h * (1 - 2 * SAFE_INSET) });

/** How near (in pixels of the output) a line pulls: six pixels of the screen at the viewer's scale `k`. */
export const pullOf = (k: number) => 6 / Math.max(0.05, k);

const same = (a: SnapGap, b: SnapGap) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;

/**
 * A box moved by (dx, dy) pixels from where it was: where it lands, and what to draw. `others` are the other parts
 * showing (not the box itself). Shift keeps the move on the line it mostly goes along; `noSnap` leaves it where the
 * pointer put it (the distances still show).
 */
export function moveBox(box: SnapBox, dx: number, dy: number, others: SnapBox[], out: { w: number; h: number }, o: { tol: number; shift?: boolean; noSnap?: boolean }): { dx: number; dy: number; marks: Marks } {
  let ex = dx;
  let ey = dy;
  // Straight: the smaller way is not moved at all, and nothing snaps along it.
  const lockX = !!o.shift && Math.abs(dy) > Math.abs(dx);
  const lockY = !!o.shift && !lockX;
  if (lockX) ex = 0;
  if (lockY) ey = 0;
  const moved = { x: box.x + ex, y: box.y + ey, w: box.w, h: box.h };
  let guides: SnapGuide[] = [];
  let gaps: SnapGap[] = [];
  if (!o.noSnap) {
    const s1 = SNAP.snapMove(moved, [safeBox(out), ...others], o.tol, out);
    const s2 = SNAP.snapEqual(moved, others, o.tol, lockX ? 0 : s1.dx, lockY ? 0 : s1.dy, s1.x || lockX, s1.y || lockY);
    if (!lockX) ex += s2.dx;
    if (!lockY) ey += s2.dy;
    // A guide across (axis 'x': a vertical line) belongs to the way snapped along x.
    guides = s1.guides.filter((g) => !(lockX && g.axis === 'x') && !(lockY && g.axis === 'y'));
    gaps = s2.gaps;
  }
  // How far the nearest part is on each side, where an equal gap does not already say so.
  const at = { x: box.x + ex, y: box.y + ey, w: box.w, h: box.h };
  for (const g of SNAP.neighbourGaps(at, others)) if (!gaps.some((q) => same(q, g))) gaps.push(g);
  return { dx: ex, dy: ey, marks: { guides, gaps, pills: [] } };
}

/**
 * A box sized about its middle, in proportion: the width asked for (`want`, pixels of the output) and what it becomes
 * when one of its edges lines up with a line of the frame, the safe area or another part (within `tol`), or it is as
 * wide or as high as another part. The pill says its size, under it (`k` keeps the pill clear of it at any zoom).
 */
export function sizeBox(box: SnapBox, want: number, others: SnapBox[], out: { w: number; h: number }, o: { tol: number; noSnap?: boolean; k: number; min?: number }): { w: number; marks: Marks } {
  const min = o.min ?? 8;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const asp = box.h / Math.max(0.0001, box.w);
  let w = Math.max(min, want);
  if (!o.noSnap) {
    const safe = safeBox(out);
    const all = [safe, ...others];
    const xs = [0, out.w / 2, out.w, ...all.flatMap((b) => [b.x, b.x + b.w / 2, b.x + b.w])];
    const ys = [0, out.h / 2, out.h, ...all.flatMap((b) => [b.y, b.y + b.h / 2, b.y + b.h])];
    // The width at which each thing it could line up with is met, and how far (in pixels of the edge) that is from the one wanted.
    const cands: { w: number; err: number }[] = [];
    const add = (cw: number, edge: number) => cw >= min && cands.push({ w: cw, err: (Math.abs(cw - want) * edge) / 2 });
    for (const v of xs) add(2 * Math.abs(v - cx), 1);
    for (const v of ys) add((2 * Math.abs(v - cy)) / asp, asp);
    for (const b of others) {
      add(b.w, 1);
      add(b.h / asp, asp);
    }
    let best: { w: number; err: number } | null = null;
    for (const c of cands) if (c.err <= o.tol && (!best || c.err < best.err - 0.01)) best = c;
    if (best) w = best.w;
  }
  const h = w * asp;
  const f = { x: cx - w / 2, y: cy - h / 2, w, h };
  // What the box lies on as it is: its edges (and middle) on lines of the others'.
  const guides = o.noSnap ? [] : SNAP.snapMove(f, [safeBox(out), ...others], 0.5, out).guides;
  return { w, marks: { guides, gaps: [], pills: [{ x: cx, y: f.y + h + 16 / Math.max(0.05, o.k), text: `${Math.round(w)} × ${Math.round(h)}` }] } };
}

/** The pill of a gap: where it goes and what it says (its length in output pixels). */
export const gapPill = (g: SnapGap) => ({ x: g.x + g.w / 2, y: g.y + g.h / 2, text: String(Math.round(g.value)) });
