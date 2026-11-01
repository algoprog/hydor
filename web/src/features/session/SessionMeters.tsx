import { useEffect, useState } from 'react';
import type { LiveState } from '@shared/types';
import { cx } from '../../components/ui';

/** Re-renders on an interval while `active`, so a countdown stays current. */
function useTicker(active: boolean, ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}

/** Compact "time left": 58s, 4m, 1h 2m. */
function left(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const exact = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** Output throughput (tok/s) of the last reply, and — for Claude — the prompt cache's time to expiry. In a wide message box only (its @container). */
export function SessionMeters({ live }: { live: LiveState | null }) {
  const cacheAt = live?.cacheAt;
  const ttl = live?.cacheTtlMs;
  const remaining = cacheAt && ttl ? cacheAt + ttl - Date.now() : null;
  useTicker(remaining != null && remaining > -5000);

  const parts: React.ReactNode[] = [];
  if (live?.tokPerSec) {
    parts.push(
      <span key="r" className="tnum" title="Output speed of the last reply (tokens generated per second)">
        {live.tokPerSec.toLocaleString()} tok/s
      </span>,
    );
  }
  if (remaining != null) {
    const warm = remaining > 0;
    const ttlLabel = (ttl ?? 0) >= 3_600_000 ? '1-hour' : '5-minute';
    parts.push(
      <span
        key="c"
        className={cx('tnum', warm ? '' : 'text-fg-3/60')}
        title={warm ? `Prompt cache (${ttlLabel} TTL) expires in ${exact(remaining)} if idle; a request before then reuses it and resets the timer.` : `Prompt cache expired — the next request rebuilds it (${ttlLabel} TTL).`}
      >
        {warm ? `cache ${left(remaining)}` : 'cache cold'}
      </span>,
    );
  }
  if (!parts.length) return null;
  return (
    <span className="mr-1.5 hidden items-center text-[11.5px] text-fg-3 @3xl:inline-flex">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="mx-1.5 text-fg-3/40">·</span>}
          {p}
        </span>
      ))}
    </span>
  );
}
