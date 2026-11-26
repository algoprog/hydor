import { useId } from 'react';
import { useTideOnFinish } from '../lib/tide';

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

/** The wordmark Ω's water (its own units, cap height 100): a surface along y = 0 with one wave every 36, and the
 * water below it, wide enough to flow by one wave and still fill the letter; and that surface alone, its crest. */
const TIDE_WAVE = 'M-72 0 q9 -5.5 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 V130 H-72 Z';
const TIDE_CREST = 'M-72 0 q9 -5.5 18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0 t18 0';

/**
 * The full logo, HYDΩR: `height` px tall (its capitals' height), the letters in the text's colour, the Ω in the sea's.
 * With `tide`, the pointer over it fills the Ω with the sea: the letter empties to a faint outline and bright water
 * rises in it, its crest a wave that keeps flowing and bobbing while the pointer stays, then drains away and the
 * letter is whole again (styles.css, "the logo's tide"). The letter itself never moves. The same plays once by itself
 * when a session finishes while the app is open (lib/tide.ts).
 */
export function Wordmark({ height = 16, className, tide }: { height?: number; className?: string; tide?: boolean }) {
  const id = useId();
  // The water rises once by itself when a session finishes.
  const up = useTideOnFinish(!!tide);
  return (
    <svg
      viewBox={`-4 -1 ${WORD_WIDTH + 8} 102`}
      width={Math.round((height * (WORD_WIDTH + 8)) / 102)}
      height={height}
      fill="none"
      strokeWidth={WORD_STROKE}
      className={['shrink-0', tide && 'wordmark-tide', up && 'tide-once', className].filter(Boolean).join(' ')}
      role="img"
      aria-label="Hydor"
    >
      <defs>
        <clipPath id={id}>
          <rect x="-10" y="0" width={WORD_WIDTH + 20} height="100" />
        </clipPath>
        {tide && (
          <>
            <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="-10" y="-10" width="116" height="120">
              <path d={WORD_OMEGA.d} stroke="#fff" strokeWidth={WORD_STROKE} />
            </mask>
            <linearGradient id={`${id}g`} gradientUnits="userSpaceOnUse" x1="0" y1="-4" x2="0" y2="96">
              <stop offset="0" style={{ stopColor: 'var(--water-1)' }} />
              <stop offset="0.55" style={{ stopColor: 'var(--water-2)' }} />
              <stop offset="1" style={{ stopColor: 'var(--water-3)' }} />
            </linearGradient>
          </>
        )}
      </defs>
      <g clipPath={`url(#${id})`}>
        {LETTERS.map((l) => (
          <path key={l.x} transform={`translate(${l.x} 0)`} d={l.d} stroke="currentColor" />
        ))}
        <g transform={`translate(${WORD_OMEGA.x} 0)`}>
          <path className="logo-omega" d={WORD_OMEGA.d} style={{ stroke: 'var(--water-ink)' }} />
          {tide && (
            <g mask={`url(#${id}m)`} aria-hidden>
              <g className="logo-tide">
                <g className="logo-bob">
                  <g className="logo-swell">
                    <path d={TIDE_WAVE} fill={`url(#${id}g)`} stroke="none" />
                    <path className="logo-crest" d={TIDE_CREST} strokeWidth={5} />
                  </g>
                </g>
              </g>
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

/**
 * The Ω at rest and at work (the throbber, Custom's icon). At rest it stands whole in the sea's colours. At work
 * (`running`) it dims to a bed and a stream of bright water runs through it, foot to foot: it spurts out of one foot,
 * stretches round the bowl and gathers into the other, a paler stream a moment behind it and a soft glow around it
 * (styles.css, "Loading"). The streams keep to the letter's shape (the mask); the glow does not. Inside an <svg> whose
 * viewBox is in 512 units.
 */
export function CurrentOmega({ id, running }: { id: string; running?: boolean }) {
  const sea = `url(#${id}w)`;
  const omega = { d: OMEGA, fill: 'none', strokeWidth: MARK_STROKE };
  const stream = { ...omega, pathLength: 100, stroke: sea, strokeLinecap: 'round' as const, className: 'current-run' };
  return (
    <>
      <defs>
        <WaterGradient id={`${id}w`} />
        {running && (
          <>
            <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
              <path {...omega} stroke="#fff" />
            </mask>
            <filter id={`${id}f`} x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="15" />
            </filter>
          </>
        )}
      </defs>
      {running && <path {...omega} stroke="currentColor" opacity={0.12} />}
      <path {...omega} className="current-bed" stroke={sea} style={{ opacity: running ? 0.2 : 1 }} />
      {running && (
        <g className="current">
          <g className="current-fade">
            <path {...stream} filter={`url(#${id}f)`} opacity={0.75} />
          </g>
          <g mask={`url(#${id}m)`}>
            <g className="current-fade current-late">
              <path {...stream} opacity={0.4} />
            </g>
            <g className="current-fade">
              <path {...stream} />
              <path {...stream} stroke="#fff" strokeWidth={7} opacity={0.5} />
            </g>
          </g>
        </g>
      )}
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
