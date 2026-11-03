import { useId } from 'react';

/*
 * Hydor's marks. The name is the ancient Greek ὕδωρ, "water", and the logo writes it HYDΩR: capitals of one even,
 * thin stroke with wide spacing, as Greek inscriptions are cut, the Greek Ω in the sea's blue. The icon is that Ω on
 * a deep blue tile.
 */

/** The wordmark's letters (cap height 100, stroke 10): H, Y, D and R, each at its x, then its Ω. */
const LETTERS: { x: number; d: string }[] = [
  { x: 0, d: 'M5 0V100M61 0V100M5 50H61' },
  { x: 104, d: 'M-1 -6L35 52L71 -6M35 52V100' },
  { x: 212, d: 'M5 0V100M5 5H30A39 45 0 0 1 30 95H5' },
  { x: 458, d: 'M5 100V5H34A25 20 0 0 1 34 50H5M30 50L66 106' },
];
const WORD_OMEGA = { x: 324, d: 'M4 95H24C24 80.6 3 65.3 3 47.3C3 23 23.2 5 48 5C72.8 5 93 23 93 47.3C93 65.3 72 80.6 72 95H92' };
const WORD_WIDTH = 522;
const WORD_STROKE = 10;

/** The Ω, in 512 units (the icon's, the throbber's and Custom's), drawn with a stroke of MARK_STROKE. */
export const OMEGA = 'M119.6 394H181.6C181.6 349.8 116.5 302.9 116.5 247.7C116.5 173.2 179.3 118 256 118C332.7 118 395.5 173.2 395.5 247.7C395.5 302.9 330.4 349.8 330.4 394H392.4';
export const MARK_STROKE = 34;
/** The Ω without a tile, cropped close (the throbber, Custom's icon). */
export const MARK_BOX = '92 92 328 328';

/** A wave's surface along y = 0 (one wavelength is 180), and the water below it: the water in the Ω. */
const WAVE = 'M-360 0 q45 -18 90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 t90 0 V600 H-360 Z';

/** The sea, turquoise to Aegean blue, over the Ω (512 units): the theme's (--water-1 to 3), or always the bright one. */
export function WaterGradient({ id, bright }: { id: string; bright?: boolean }) {
  const c = bright ? ['#5eead4', '#38bdf8', '#60a5fa'] : ['var(--water-1)', 'var(--water-2)', 'var(--water-3)'];
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="120" y1="110" x2="400" y2="400">
      {c.map((color, i) => (
        <stop key={color} offset={i / 2} style={{ stopColor: color }} />
      ))}
    </linearGradient>
  );
}

/** The full logo, HYDΩR: `height` px tall (its capitals' height), the letters in the text's colour, the Ω in the sea's. */
export function Wordmark({ height = 16, className }: { height?: number; className?: string }) {
  const id = useId();
  return (
    <svg
      viewBox={`-4 -1 ${WORD_WIDTH + 8} 102`}
      width={Math.round((height * (WORD_WIDTH + 8)) / 102)}
      height={height}
      fill="none"
      strokeWidth={WORD_STROKE}
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
      role="img"
      aria-label="Hydor"
    >
      <defs>
        <clipPath id={id}>
          <rect x="-10" y="0" width={WORD_WIDTH + 20} height="100" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        {LETTERS.map((l) => (
          <path key={l.x} transform={`translate(${l.x} 0)`} d={l.d} stroke="currentColor" />
        ))}
        <path className="logo-omega" transform={`translate(${WORD_OMEGA.x} 0)`} d={WORD_OMEGA.d} style={{ stroke: 'var(--water-ink)' }} />
      </g>
    </svg>
  );
}

/**
 * The Ω with water in it. The empty Ω shows faintly in the text's colour; the water is the sea gradient below a
 * wave, and `water` (a class) says how it moves: none (full and still), `throbber-water`, `hero-water`. Inside an
 * <svg> whose viewBox is in 512 units.
 */
export function WaterOmega({ id, water, bright }: { id: string; water?: string; bright?: boolean }) {
  return (
    <>
      <defs>
        <WaterGradient id={`${id}w`} bright={bright} />
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <g className={water ? `water-level ${water}` : 'water-level'}>
            <path className="water-flow" d={WAVE} fill="#fff" />
          </g>
        </mask>
      </defs>
      <path d={OMEGA} fill="none" stroke="currentColor" strokeWidth={MARK_STROKE} opacity={0.26} />
      <path d={OMEGA} fill="none" stroke={`url(#${id}w)`} strokeWidth={MARK_STROKE} mask={`url(#${id}m)`} />
    </>
  );
}

/** The deep blue tile of the app's icon. */
export function TileGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#14304f" />
      <stop offset="1" stopColor="#0b1a2c" />
    </linearGradient>
  );
}

/** The app's icon, as on the favicon: the Ω in bright water on a deep blue tile. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className="shrink-0" aria-hidden>
      <defs>
        <TileGradient id={`${id}t`} />
        <WaterGradient id={`${id}w`} bright />
      </defs>
      <rect x="4" y="4" width="504" height="504" rx="114" fill={`url(#${id}t)`} stroke="rgba(255,255,255,0.10)" strokeWidth="8" />
      <path d={OMEGA} fill="none" stroke={`url(#${id}w)`} strokeWidth={MARK_STROKE} />
    </svg>
  );
}
