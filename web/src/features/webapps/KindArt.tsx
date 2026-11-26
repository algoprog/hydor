// The picture of a kind of web app: a small drawing of the first screen such an app usually has, in the theme's colours, so it
// reads in the dark theme and the light. Drawn here (there are no screenshots: an idea is not a template, and the app an agent
// builds looks as the person chooses).
import type { ReactNode } from 'react';

const W = 320;
const H = 200;

type Fill = 'bar' | 'soft' | 'accent' | 'tint' | 'panel';
const FILL: Record<Fill, string> = { bar: 'fill-fg-3 opacity-35', soft: 'fill-bg-3', accent: 'fill-accent', tint: 'fill-accent opacity-20', panel: 'fill-panel stroke-line-2' };

/** A rounded block; `f` says what it stands for. */
const B = (x: number, y: number, w: number, h: number, f: Fill = 'soft', r = 4) => <rect key={`${x},${y},${w},${h},${f}`} x={x} y={y} width={w} height={h} rx={Math.min(r, h / 2, w / 2)} className={FILL[f]} strokeWidth={f === 'panel' ? 1 : 0} />;
/** A line of writing. */
const T = (x: number, y: number, w: number, f: Fill = 'bar', h = 5) => B(x, y, w, h, f, h / 2);
/** A round mark: a person, a pin, a dot. */
const O = (cx: number, cy: number, r: number, f: Fill = 'soft') => <circle key={`o${cx},${cy},${r},${f}`} cx={cx} cy={cy} r={r} className={FILL[f]} />;
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The page inside the window: from y = 34 down. */
const ART: Record<string, () => ReactNode> = {
  landing: () => [
    T(92, 52, 136, 'bar', 11), T(116, 70, 88, 'bar', 11), T(86, 92, 148), T(104, 102, 112),
    B(70, 120, 128, 22, 'panel', 11), T(82, 128.5, 58), B(204, 120, 48, 22, 'accent', 11),
    ...range(3).flatMap((i) => [B(40 + i * 84, 160, 72, 40, 'soft', 8), O(54 + i * 84, 174, 6, 'tint'), T(48 + i * 84, 186, 48)]),
  ],
  'internal-tool': () => [
    B(18, 34, 62, 166, 'soft', 0), O(31, 48, 6, 'accent'), ...range(5).map((i) => T(28, 66 + i * 16, i === 0 ? 40 : 32 + (i % 2) * 8, i === 0 ? 'accent' : 'bar')),
    ...range(3).flatMap((i) => [B(92 + i * 72, 44, 64, 34, 'panel', 6), T(100 + i * 72, 52, 28), T(100 + i * 72, 63, 40, i === 0 ? 'accent' : 'bar', 8)]),
    B(92, 88, 208, 62, 'panel', 6), ...[26, 40, 22, 48, 34, 44, 30, 50].map((h, i) => B(104 + i * 24, 142 - h, 13, h, i === 3 || i === 7 ? 'accent' : 'tint', 3)),
    ...range(3).flatMap((i) => [B(92, 160 + i * 14, 208, 1, 'soft'), O(100, 168 + i * 14, 4), T(110, 166 + i * 14, 60), T(214, 166 + i * 14, 30)]),
  ],
  saas: () => [
    T(110, 44, 100, 'bar', 9), T(126, 60, 68),
    ...range(3).flatMap((i) => {
      const x = 30 + i * 90;
      const on = i === 1;
      return [B(x, on ? 74 : 80, 80, on ? 122 : 110, on ? 'tint' : 'panel', 8), T(x + 12, 92, 34), T(x + 12, 104, 48, on ? 'accent' : 'bar', 10), ...range(3).flatMap((j) => [O(x + 15, 128 + j * 12, 2.5, on ? 'accent' : 'bar'), T(x + 22, 126 + j * 12, 40, 'bar', 4)]), B(x + 12, 166, 56, 15, on ? 'accent' : 'soft', 7.5)];
    }),
  ],
  'agent-app': () => [
    B(36, 44, 248, 26, 'panel', 13), T(52, 54.5, 120), B(236, 48, 42, 18, 'accent', 9),
    ...range(3).flatMap((i) => [O(50, 88 + i * 18, 6, i < 2 ? 'accent' : 'tint'), T(64, 85.5 + i * 18, [104, 130, 82][i])]),
    B(36, 142, 248, 52, 'panel', 8), T(48, 152, 90, 'bar', 7), T(48, 166, 220), T(48, 176, 196), T(48, 186, 140),
  ],
  'content-site': () => [
    T(34, 46, 150, 'bar', 11), O(40, 70, 6, 'tint'), T(52, 67.5, 50),
    B(34, 84, 176, 48, 'soft', 6), ...[176, 168, 172, 120].map((w, i) => T(34, 142 + i * 12, w)),
    ...range(4).flatMap((i) => [T(230, 48 + i * 36, 58, i === 0 ? 'accent' : 'bar', 6), T(230, 60 + i * 36, 52, 'bar', 4), T(230, 68 + i * 36, 40, 'bar', 4)]),
  ],
  'ai-app': () => [
    B(148, 44, 138, 24, 'tint', 12), T(162, 53.5, 108),
    B(34, 76, 196, 66, 'panel', 10), T(48, 88, 168), T(48, 99, 150), T(48, 110, 160), B(48, 124, 44, 11, 'tint', 5.5), B(98, 124, 44, 11, 'tint', 5.5),
    B(176, 150, 110, 20, 'tint', 10), T(190, 157.5, 80),
    B(34, 176, 252, 20, 'panel', 10), T(48, 183.5, 90), O(274, 186, 7, 'accent'),
  ],
  portfolio: () => [
    O(160, 58, 17, 'tint'), O(160, 53, 6, 'accent'), B(150, 62, 20, 9, 'accent', 4.5), T(124, 84, 72, 'bar', 8), T(108, 98, 104),
    ...range(6).map((i) => B(40 + (i % 3) * 82, 114 + Math.floor(i / 3) * 44, 76, 38, i === 1 || i === 3 ? 'tint' : 'soft', 6)),
  ],
  directory: () => [
    B(30, 42, 150, 20, 'panel', 10), O(42, 52, 4, 'bar'), T(52, 49.5, 70),
    ...range(4).flatMap((i) => [B(30, 70 + i * 32, 150, 27, 'panel', 6), B(36, 75 + i * 32, 17, 17, 'soft', 4), T(60, 76 + i * 32, 74), T(60, 86 + i * 32, 48, 'bar', 4), O(166, 83 + i * 32, 4, 'tint')]),
    B(190, 42, 100, 155, 'soft', 8), <path key="r1" d="M190 96 C220 90 232 130 290 118" className="fill-none stroke-line-2" strokeWidth={5} />, <path key="r2" d="M236 42 C230 100 262 140 252 197" className="fill-none stroke-line-2" strokeWidth={4} />,
    ...[[214, 76], [264, 104], [228, 150]].flatMap(([x, y]) => [O(x, y, 7, 'accent'), O(x, y, 2.5, 'panel')]),
  ],
  store: () => [
    T(30, 44, 60, 'bar', 8), B(256, 40, 34, 15, 'tint', 7.5), O(264, 47.5, 4, 'accent'),
    ...range(6).flatMap((i) => {
      const x = 30 + (i % 3) * 90;
      const y = 64 + Math.floor(i / 3) * 70;
      return [B(x, y, 80, 42, 'soft', 8), O(x + 40, y + 21, 10, i % 2 ? 'tint' : 'bar'), T(x, y + 49, 52), T(x, y + 59, 26, 'accent', 6)];
    }),
  ],
  booking: () => [
    T(32, 44, 70, 'bar', 8),
    ...range(7).map((i) => T(34 + i * 24, 62, 12, 'bar', 4)),
    ...range(35).map((i) => B(32 + (i % 7) * 24, 72 + Math.floor(i / 7) * 24, 18, 18, i === 17 ? 'accent' : i % 6 === 1 ? 'tint' : 'soft', 5)),
    ...range(5).flatMap((i) => [B(220, 62 + i * 27, 70, 21, i === 2 ? 'accent' : 'panel', 10.5), T(238, 70 + i * 27, 34, i === 2 ? 'panel' : 'bar')]),
  ],
  courses: () => [
    B(30, 42, 168, 100, 'soft', 8), O(114, 92, 17, 'accent'), <path key="p" d="M109 83 L124 92 L109 101 Z" className="fill-accent-fg" />,
    T(30, 152, 120, 'bar', 8), B(30, 170, 168, 7, 'soft', 3.5), B(30, 170, 104, 7, 'accent', 3.5), T(30, 185, 60, 'bar', 4),
    ...range(5).flatMap((i) => [B(208, 42 + i * 32, 82, 27, i === 2 ? 'tint' : 'panel', 6), O(220, 55.5 + i * 32, 5, i < 2 ? 'accent' : 'soft'), T(230, 53 + i * 32, 48)]),
  ],
  marketplace: () => [
    ...range(4).map((i) => B(30 + i * 56, 42, 48, 17, i === 0 ? 'accent' : 'soft', 8.5)),
    ...range(4).flatMap((i) => {
      const x = 30 + (i % 2) * 135;
      const y = 68 + Math.floor(i / 2) * 68;
      return [B(x, y, 125, 60, 'panel', 8), B(x + 7, y + 7, 46, 46, 'soft', 6), T(x + 61, y + 12, 52), T(x + 61, y + 23, 30, 'accent', 6), O(x + 67, y + 43, 6, 'tint'), T(x + 77, y + 40.5, 32, 'bar', 4)];
    }),
  ],
  community: () => [
    ...range(3).flatMap((i) => {
      const y = 42 + i * 54;
      return [B(30, y, 188, 48, 'panel', 8), O(46, y + 16, 8, i === 1 ? 'tint' : 'soft'), T(62, y + 10, 100, 'bar', 6), T(62, y + 22, 140, 'bar', 4), B(62, y + 32, 26, 9, 'tint', 4.5), B(94, y + 32, 26, 9, 'soft', 4.5)];
    }),
    B(228, 42, 62, 156, 'soft', 8), ...range(6).flatMap((i) => [O(242, 58 + i * 23, 6, i < 2 ? 'accent' : 'bar'), T(253, 55.5 + i * 23, 28, 'bar', 4)]),
  ],
  realtime: () => [
    ...range(3).flatMap((c) => {
      const x = 28 + c * 90;
      return [B(x, 42, 82, 156, 'soft', 8), T(x + 8, 50, 36, 'bar', 6), ...range([3, 2, 2][c]).flatMap((i) => [B(x + 6, 62 + i * 40, 70, 34, c === 1 && i === 0 ? 'tint' : 'panel', 6), T(x + 13, 70 + i * 40, 48), T(x + 13, 80 + i * 40, 30, 'bar', 4), O(x + 66, 87 + i * 40, 5, c === 1 && i === 0 ? 'accent' : 'soft')])];
    }),
    <path key="c" d="M158 112 l0 17 l4.5 -4.5 l3.5 7.5 l4 -2 l-3.5 -7 l6.5 -0.5 z" className="fill-accent" />,
  ],
};

/** "Something else": an empty page with a place to write what you have in mind. */
const OTHER = () => [
  <rect key="d" x={36} y={46} width={248} height={138} rx={10} className="fill-none stroke-line-2" strokeWidth={1.5} strokeDasharray="6 6" />,
  O(160, 102, 22, 'tint'),
  B(150, 100.5, 20, 3, 'accent', 1.5), B(158.5, 92, 3, 20, 'accent', 1.5),
  T(110, 140, 100), T(128, 152, 64),
];

/** The drawing of a kind (`other`, or a kind with none of its own: "something else"). Decorative: the name beside it says what it is. */
export function KindArt({ id, className }: { id: string; className?: string }) {
  const draw = ART[id] ?? OTHER;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMin slice" aria-hidden className={className ?? 'block h-full w-full'} data-kind-art={ART[id] ? id : 'other'}>
      <rect width={W} height={H} className="fill-bg-2" />
      <rect x={18} y={12} width={284} height={196} rx={10} className="fill-bg stroke-line" strokeWidth={1} />
      <path d={`M18 34 H302`} className="stroke-line" strokeWidth={1} />
      {[30, 40, 50].map((x) => (
        <circle key={x} cx={x} cy={23} r={3} className="fill-bg-3" />
      ))}
      <rect x={118} y={18} width={84} height={10} rx={5} className="fill-bg-2" />
      {draw()}
    </svg>
  );
}
