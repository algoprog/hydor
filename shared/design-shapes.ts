// The shapes of designs (shared/design.ts): the outlines a shape element draws and a picture's frame cuts it to, each as
// SVG path data in a 100 × 100 box that stretches with the element (preserveAspectRatio="none"), so a shape and a frame
// stay the size of their element however it is resized. Rectangles, rounded ones and circles are boxes of CSS instead
// (corners that stay round); everything else is drawn here, from stars and arrows to blobs and an arch.

export type ShapeId =
  | 'triangle'
  | 'rtriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'star4'
  | 'burst'
  | 'heart'
  | 'arrow'
  | 'arrow-left'
  | 'chevron'
  | 'plus'
  | 'cross'
  | 'bubble'
  | 'arch'
  | 'blob1'
  | 'blob2'
  | 'blob3'
  | 'flower'
  | 'wave'
  | 'ribbon'
  | 'badge'
  | 'parallelogram'
  | 'semicircle'
  | 'drop';

const r = (v: number) => Math.round(v * 100) / 100;
const poly = (pts: number[][]) => `M${pts.map((p) => `${r(p[0])},${r(p[1])}`).join('L')}Z`;

/** A closed curve through points, smooth (Catmull-Rom's, as cubic Béziers). */
function smooth(pts: number[][]): string {
  const k = pts.length;
  let d = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < k; i++) {
    const [a, b, c, e] = [pts[(i - 1 + k) % k], pts[i], pts[(i + 1) % k], pts[(i + 2) % k]];
    d += `C${r(b[0] + (c[0] - a[0]) / 6)},${r(b[1] + (c[1] - a[1]) / 6)} ${r(c[0] - (e[0] - b[0]) / 6)},${r(c[1] - (e[1] - b[1]) / 6)} ${r(c[0])},${r(c[1])}`;
  }
  return `${d}Z`;
}

/** Points round the middle of the box, at radii `f` (1 is the box's edge). */
const ring = (f: number[], turn = -Math.PI / 2) => f.map((k, i) => [50 + 50 * k * Math.cos(turn + (i * 2 * Math.PI) / f.length), 50 + 50 * k * Math.sin(turn + (i * 2 * Math.PI) / f.length)]);

/** A star of `n` points, its inner radius `inner` of the outer. */
const star = (n: number, inner: number) => poly(Array.from({ length: n * 2 }, (_, i) => [50 + 50 * (i % 2 ? inner : 1) * Math.cos(-Math.PI / 2 + (i * Math.PI) / n), 52 + 50 * (i % 2 ? inner : 1) * Math.sin(-Math.PI / 2 + (i * Math.PI) / n)]));

const PATHS: Record<ShapeId, () => string> = {
  triangle: () => poly([[50, 0], [100, 100], [0, 100]]),
  rtriangle: () => poly([[0, 0], [100, 100], [0, 100]]),
  diamond: () => poly([[50, 0], [100, 50], [50, 100], [0, 50]]),
  pentagon: () => poly([[50, 0], [100, 38], [81, 100], [19, 100], [0, 38]]),
  hexagon: () => poly([[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]]),
  octagon: () => poly([[29, 0], [71, 0], [100, 29], [100, 71], [71, 100], [29, 100], [0, 71], [0, 29]]),
  star: () => star(5, 0.4),
  star4: () => poly([[50, 0], [61, 39], [100, 50], [61, 61], [50, 100], [39, 61], [0, 50], [39, 39]]),
  burst: () => poly(Array.from({ length: 32 }, (_, i) => [50 + 50 * (i % 2 ? 0.8 : 1) * Math.cos((i * Math.PI) / 16), 50 + 50 * (i % 2 ? 0.8 : 1) * Math.sin((i * Math.PI) / 16)])),
  heart: () => 'M50,25C45,5 5,2 2,32C0,55 30,72 50,100C70,72 100,55 98,32C95,2 55,5 50,25Z',
  arrow: () => poly([[0, 28], [62, 28], [62, 0], [100, 50], [62, 100], [62, 72], [0, 72]]),
  'arrow-left': () => poly([[100, 28], [38, 28], [38, 0], [0, 50], [38, 100], [38, 72], [100, 72]]),
  chevron: () => poly([[0, 0], [70, 0], [100, 50], [70, 100], [0, 100], [30, 50]]),
  plus: () => poly([[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]]),
  cross: () => poly([[20, 0], [50, 30], [80, 0], [100, 20], [70, 50], [100, 80], [80, 100], [50, 70], [20, 100], [0, 80], [30, 50], [0, 20]]),
  bubble: () => 'M12,0H88Q100,0 100,12V68Q100,80 88,80H38L20,100L22,80H12Q0,80 0,68V12Q0,0 12,0Z',
  arch: () => 'M0,100L0,50C0,22.4 22.4,0 50,0C77.6,0 100,22.4 100,50L100,100Z',
  blob1: () => smooth(ring([0.97, 0.84, 0.95, 0.8, 0.93, 0.87, 0.97, 0.82])),
  blob2: () => smooth(ring([1, 0.78, 0.9, 0.98, 0.74, 0.92, 0.84])),
  blob3: () => smooth(ring([0.88, 1, 0.8, 0.96, 0.86, 0.72, 0.98, 0.9, 0.78])),
  flower: () => {
    const ri = 0.82;
    const step = Math.PI / 4;
    const rc = 2 - ri * Math.cos(step / 2);
    const at = (k: number, a: number) => `${r(50 + 50 * k * Math.cos(a))},${r(50 + 50 * k * Math.sin(a))}`;
    let d = `M${at(ri, -Math.PI / 2)}`;
    for (let i = 0; i < 8; i++) d += `Q${at(rc, -Math.PI / 2 + (i + 0.5) * step)} ${at(ri, -Math.PI / 2 + (i + 1) * step)}`;
    return `${d}Z`;
  },
  wave: () => 'M0,20C17,0 33,0 50,20C67,40 83,40 100,20V100H0Z',
  ribbon: () => poly([[0, 0], [100, 0], [90, 50], [100, 100], [0, 100], [10, 50]]),
  badge: () => star(12, 0.86),
  parallelogram: () => poly([[22, 0], [100, 0], [78, 100], [0, 100]]),
  semicircle: () => 'M0,100C0,44.8 22.4,0 50,0C77.6,0 100,44.8 100,100Z',
  drop: () => 'M50,0C50,0 92,44 92,66C92,85 73,100 50,100C27,100 8,85 8,66C8,44 50,0 50,0Z',
};

/** The shapes, in the order the Add panel shows them, with their names. */
export const SHAPE_NAMES: Record<ShapeId, string> = {
  triangle: 'Triangle',
  rtriangle: 'Right triangle',
  diamond: 'Diamond',
  pentagon: 'Pentagon',
  hexagon: 'Hexagon',
  octagon: 'Octagon',
  star: 'Star',
  star4: 'Sparkle',
  burst: 'Burst',
  heart: 'Heart',
  arrow: 'Arrow',
  'arrow-left': 'Arrow left',
  chevron: 'Chevron',
  plus: 'Plus',
  cross: 'Cross',
  bubble: 'Speech bubble',
  arch: 'Arch',
  blob1: 'Blob',
  blob2: 'Blob 2',
  blob3: 'Blob 3',
  flower: 'Flower',
  wave: 'Wave',
  ribbon: 'Ribbon',
  badge: 'Seal',
  parallelogram: 'Parallelogram',
  semicircle: 'Half circle',
  drop: 'Drop',
};

export const SHAPE_IDS = Object.keys(PATHS) as ShapeId[];

const cache = new Map<ShapeId, string>();
/** A shape's outline in a 100 × 100 box; '' for a name it does not know. */
export function shapePath(id: string): string {
  if (!(id in PATHS)) return '';
  const k = id as ShapeId;
  if (!cache.has(k)) cache.set(k, PATHS[k]());
  return cache.get(k)!;
}

/** The frames a picture can be cut to: boxes of CSS (rectangle, rounded, circle) and the shapes above. */
export type FrameId = 'rect' | 'rounded' | 'circle' | 'arch' | 'blob1' | 'blob2' | 'star' | 'heart' | 'hexagon' | 'flower' | 'diamond' | 'triangle' | 'drop' | 'badge';
export const FRAME_IDS: FrameId[] = ['rect', 'rounded', 'circle', 'arch', 'blob1', 'blob2', 'flower', 'star', 'heart', 'hexagon', 'diamond', 'triangle', 'drop', 'badge'];
export const FRAME_NAMES: Record<FrameId, string> = {
  rect: 'Rectangle',
  rounded: 'Rounded corners',
  circle: 'Circle',
  arch: 'Arch',
  blob1: 'Blob',
  blob2: 'Blob 2',
  flower: 'Flower',
  star: 'Star',
  heart: 'Heart',
  hexagon: 'Hexagon',
  diamond: 'Diamond',
  triangle: 'Triangle',
  drop: 'Drop',
  badge: 'Seal',
};

/**
 * The CSS that cuts a picture's frame to a shape: a mask of the shape's outline stretched over the frame (both the
 * prefixed and the standard properties), or round corners. The empty string for a plain rectangle.
 */
export function frameCss(id: string): string {
  if (id === 'rect' || !id) return '';
  if (id === 'rounded') return 'border-radius:12%';
  if (id === 'circle') return 'border-radius:50%';
  const d = shapePath(id);
  if (!d) return '';
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><path d='${d}'/></svg>`;
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
  return `-webkit-mask:${url} center/100% 100% no-repeat;mask:${url} center/100% 100% no-repeat`;
}
