import { useId } from 'react';

/** The app mark, as on the favicon: a prompt and a spark on a light tile, in Naget's charcoal-to-olive ink. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className="shrink-0" aria-hidden>
      <defs>
        <linearGradient id={`${id}tile`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d9d9" />
        </linearGradient>
        <linearGradient id={`${id}ink`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a2a28" />
          <stop offset=".55" stopColor="#3e3a30" />
          <stop offset="1" stopColor="#6b6428" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="504" height="504" rx="114" fill={`url(#${id}tile)`} stroke="rgba(0,0,0,0.10)" strokeWidth="8" />
      <path d="M140 162L250 256L140 350" fill="none" stroke={`url(#${id}ink)`} strokeWidth="56" strokeLinecap="round" strokeLinejoin="round" />
      <path className="logo-spark" d="M356 216Q371 285 440 300Q371 315 356 384Q341 315 272 300Q341 285 356 216Z" fill="#6b6428" />
    </svg>
  );
}
