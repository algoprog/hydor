import { useId } from 'react';

/** The mark's shapes, in 512 units: Naget's n, and the gold nugget it holds. */
export const ARCH = 'M150 392V258C150 190 196 146 256 146S362 190 362 258V392';
export const NUGGET = { cx: 256, cy: 338, r: 54 };
/** The n and its nugget without the tile, cropped close (the throbber, Custom's icon). */
export const MARK_BOX = '108 104 296 296';

/** Gold, lit from the top left. */
export function GoldGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id} cx=".36" cy=".32" r=".78">
      <stop offset="0" stopColor="#ffeeb0" />
      <stop offset=".32" stopColor="#e2b94a" />
      <stop offset=".75" stopColor="#b8891f" />
      <stop offset="1" stopColor="#8a6614" />
    </radialGradient>
  );
}

/** The light tile and Naget's charcoal-to-olive ink, as on the favicon. */
export function TileGradients({ id }: { id: string }) {
  return (
    <>
      <linearGradient id={`${id}tile`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#d9d9d9" />
      </linearGradient>
      <linearGradient id={`${id}ink`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2a2a28" />
        <stop offset=".55" stopColor="#3e3a30" />
        <stop offset="1" stopColor="#6b6428" />
      </linearGradient>
      <GoldGradient id={`${id}gold`} />
    </>
  );
}

/** The app mark, as on the favicon: Naget's n holding a gold nugget, on a light tile. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className="shrink-0" aria-hidden>
      <defs>
        <TileGradients id={id} />
      </defs>
      <rect x="4" y="4" width="504" height="504" rx="114" fill={`url(#${id}tile)`} stroke="rgba(0,0,0,0.10)" strokeWidth="8" />
      <path d={ARCH} fill="none" stroke={`url(#${id}ink)`} strokeWidth="66" />
      <circle className="logo-nugget" {...NUGGET} fill={`url(#${id}gold)`} />
    </svg>
  );
}
