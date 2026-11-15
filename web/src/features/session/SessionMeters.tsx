import { useEffect, useState } from 'react';
import { CONTEXT_PARTS, type ContextPart, type LiveState } from '@shared/types';
import { cx } from '../../components/ui';
import { LOCALE } from '../../i18n/locale';
import { tr } from '../../i18n/runtime';

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

/** Output throughput (tok/s) of the last reply, and — for Claude — the prompt cache's time to expiry: a quiet line at the foot of the message box's options menu. */
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
    <div className="mt-1 flex items-center border-t border-line px-2.5 pt-2 pb-1 text-[12px] text-fg-3">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {i > 0 && <span className="mx-1.5 text-fg-3/40">·</span>}
          {p}
        </span>
      ))}
    </div>
  );
}

const PART_LABEL: Record<ContextPart, string> = {
  instructions: 'Instructions',
  project: 'Project instructions',
  memory: 'Memory',
  features: 'App features',
  skills: 'Skills',
  tools: 'Tools',
  conversation: 'Conversation',
};

/** Tokens in a short form: 840, 1.2k, 23k. */
export const shortTokens = (n: number): string => (n < 1000 ? n.toLocaleString(LOCALE) : `${(n / 1000).toLocaleString(LOCALE, { maximumFractionDigits: n < 10_000 ? 1 : 0 })}k`);

/** Where a session's context goes, in the order of CONTEXT_PARTS, without the parts that hold nothing; none when the agent does not say. */
export function contextRows(live: LiveState | null): { part: ContextPart; label: string; tokens: number }[] {
  const p = live?.contextParts;
  if (!p) return [];
  return CONTEXT_PARTS.filter((k) => (p[k] ?? 0) > 0).map((k) => ({ part: k, label: PART_LABEL[k], tokens: p[k]! }));
}

/** The ring's tooltip lines for those parts. */
export const contextLines = (live: LiveState | null): string[] => contextRows(live).map((r) => `${tr(r.label)}: ${shortTokens(r.tokens)}`);

/** One quiet line per part of the context, with a thin bar for its share, under the options menu's Context row once it is clicked. */
export function ContextBreakdown({ live }: { live: LiveState | null }) {
  const rows = contextRows(live);
  const total = rows.reduce((n, r) => n + r.tokens, 0);
  if (!rows.length || !total) return null;
  return (
    <div className="mb-1 px-2.5 pb-1">
      {rows.map((r) => (
        <div key={r.part} className="flex h-5 items-center gap-2 text-[12px] text-fg-3 max-sm:h-6 max-sm:text-[13px]">
          <span className="w-[7.25rem] shrink-0 truncate">{r.label}</span>
          <span className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-bg-3" aria-hidden>
            <span className="block h-full rounded-full bg-fg-3/50" style={{ width: `${Math.max(2, Math.round((r.tokens / total) * 100))}%` }} />
          </span>
          <span className="tnum w-9 shrink-0 text-right text-fg-2">{shortTokens(r.tokens)}</span>
        </div>
      ))}
    </div>
  );
}
