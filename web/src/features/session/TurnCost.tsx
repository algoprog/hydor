// A turn's time and cost, from the tokens beside its header: where the time went (the model, its steps by kind, waiting
// for you, the rest), how soon its first reply or step came, its tokens by kind (read fresh, read from the provider's
// cache, written to it, written out) and, when the model's price is known, what each cost and what the cache saved.
// Its items give the steps' times; the server gives how long each card waited for you and the model's price
// (GET /api/sessions/:key/breakdown), fetched when it opens.
import { useEffect, useRef, useState } from 'react';
import type { TimelineItem } from '@shared/types';
import { cx, Popover } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { compact, duration, money } from '../../lib/format';
import { LOCALE } from '../../i18n/locale';
import { PARTS, timeSplit, type Turn, type Wait } from './turnTime';

interface Rate {
  input: number;
  output: number;
  cacheRead: number;
}
interface Breakdown {
  waits: Wait[];
  rates: Record<string, Rate | null>;
}

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '');

function Line({ label, hint, value, sub }: { label: string; hint?: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-0.5" title={hint}>
      <span className="min-w-0 flex-1 text-fg-2">{label}</span>
      {sub && <span className="tnum text-fg-3">{sub}</span>}
      <span className="tnum w-20 shrink-0 text-right text-fg">{value}</span>
    </div>
  );
}

export function TurnCost({ sessionKey, turn, work, start, className }: { sessionKey: string; turn: Turn; work: TimelineItem[]; start?: number; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Breakdown | null>(null);
  useEffect(() => {
    if (!open || data) return;
    api<Breakdown>(`/api/sessions/${enc(sessionKey)}/breakdown?models=${enc(turn.model ?? '')}`)
      .then(setData)
      .catch(() => setData({ waits: [], rates: {} }));
  }, [open]);
  const tk = turn.tokens;
  if (!tk) return null;
  const total = tk.input + (tk.cacheRead ?? 0) + tk.output;
  const begin = start ?? (turn.ts && turn.durationMs ? turn.ts - turn.durationMs : 0);
  const split = timeSplit(turn, work, begin, data?.waits ?? []);
  const rate = turn.model ? data?.rates[turn.model] : null;
  const fresh = Math.max(0, tk.input - (tk.cacheWrite ?? 0));
  const written = tk.cacheWrite ?? 0;
  const cached = tk.cacheRead ?? 0;
  // Writing to Anthropic's cache costs a quarter more than reading fresh.
  const cost = rate ? { fresh: (fresh * rate.input) / 1e6, written: (written * rate.input * 1.25) / 1e6, cached: (cached * rate.cacheRead) / 1e6, out: (tk.output * rate.output) / 1e6 } : null;
  const saved = rate ? (cached * (rate.input - rate.cacheRead)) / 1e6 : 0;
  const read = fresh + written + cached;
  return (
    <>
      <button
        ref={ref}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className={cx('rounded-md px-1.5 py-0.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2', open && 'bg-bg-2 text-fg-2', className)}
        title="Time and cost"
      >
        {compact(total)} tokens
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="end" width={340} title="Time and cost">
        <div className="space-y-3 px-3 py-2.5 text-[12.5px]">
          {(turn.durationMs ?? 0) >= 1000 && (
            <div>
              <div className="flex items-baseline justify-between pb-1.5">
                <span className="font-medium text-fg">Duration</span>
                <span className="tnum text-fg-2">{duration(turn.durationMs)}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-bg-3">
                {PARTS.map((p) => split[p.id] > 0 && <span key={p.id} className={cx('h-full', p.color)} style={{ width: `${(split[p.id] / (turn.durationMs || 1)) * 100}%` }} title={p.label} />)}
              </div>
              <div className="mt-2 space-y-0.5">
                {PARTS.filter((p) => split[p.id] >= 500).map((p) => (
                  <div key={p.id} className="flex items-center gap-2" title={'hint' in p ? p.hint : undefined}>
                    <span className={cx('h-2 w-2 shrink-0 rounded-sm', p.color)} />
                    <span className="min-w-0 flex-1 text-fg-2">{p.label}</span>
                    <span className="tnum text-fg-3">{pct(split[p.id], turn.durationMs ?? 0)}</span>
                    <span className="tnum w-16 text-right text-fg">{duration(split[p.id])}</span>
                  </div>
                ))}
              </div>
              {turn.firstMs != null && turn.firstMs >= 0 && <div className="mt-1.5 text-fg-3">{`First reply or step after ${duration(Math.max(turn.firstMs, 1))}`}</div>}
            </div>
          )}
          <div>
            <div className="flex items-baseline justify-between pb-1">
              <span className="font-medium text-fg">Tokens</span>
              <span className="tnum text-fg-2">{total.toLocaleString(LOCALE)}</span>
            </div>
            <Line label="Read fresh" hint="Text the model read that was not in its provider's cache" value={fresh.toLocaleString(LOCALE)} sub={cost ? money(cost.fresh) : undefined} />
            {written > 0 && (
              <Line
                label="Written to the cache"
                hint="Read fresh and kept by the provider, so the next request reads it for less"
                value={written.toLocaleString(LOCALE)}
                sub={cost ? money(cost.written) : undefined}
              />
            )}
            <Line
              label="Read from the cache"
              hint="Text the provider had kept from an earlier request, read for a fraction of the price"
              value={cached.toLocaleString(LOCALE)}
              sub={read ? pct(cached, read) : undefined}
            />
            <Line label="Written out" hint="The model's replies, thoughts and steps" value={tk.output.toLocaleString(LOCALE)} sub={cost ? money(cost.out) : undefined} />
          </div>
          {(cost || turn.costUsd != null) && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-fg">Cost</span>
                <span className="tnum text-fg">{money(turn.costUsd ?? (cost ? cost.fresh + cost.written + cost.cached + cost.out : 0))}</span>
              </div>
              {saved >= 0.005 && <div className="mt-0.5 text-fg-3">{`The cache saved about ${money(saved)}.`}</div>}
            </div>
          )}
          {data && !rate && turn.model && <div className="text-fg-3">{`No price is known for ${turn.model}: its cost is not counted.`}</div>}
          {turn.model && (
            <div className="truncate text-[11.5px] text-fg-3" translate="no">
              {turn.model}
            </div>
          )}
        </div>
      </Popover>
    </>
  );
}
