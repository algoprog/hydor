// A turn's time and cost, from its cost beside its header ("≈ $0.12"; its tokens when no price is known): where the time
// went (the model, its steps by kind, waiting for you, the rest), how soon its first reply or step came, its tokens by
// kind (read fresh, read from the provider's cache, written to it, written out) and, when the model's price is known,
// what each cost and what the cache saved. Its items give the steps' times; the server gives how long each card waited
// for you (GET /api/sessions/:key/breakdown, fetched when it opens) and the model's price (the same, once a model while
// the page is open). On a plan (Claude Code, Codex) the cost is what the tokens would cost at API prices.
import { useEffect, useRef, useState } from 'react';
import type { Agent, TimelineItem, TokenUsage } from '@shared/types';
import { cx, Popover } from '../../components/ui';
import { api, enc } from '../../lib/api';
import { useSessions } from '../../lib/store';
import { AT_API_PRICES, compact, duration, money, usd } from '../../lib/format';
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

/** Each model's price, asked for once while the page is open: it is the same in every session. */
const prices = new Map<string, Promise<Rate | null>>();
function priceOf(sessionKey: string, model: string): Promise<Rate | null> {
  let p = prices.get(model);
  if (!p) {
    p = api<Breakdown>(`/api/sessions/${enc(sessionKey)}/breakdown?models=${enc(model)}`).then(
      (r) => r.rates[model] ?? null,
      () => {
        // Asked again next time: the server may answer then.
        prices.delete(model);
        return null;
      },
    );
    prices.set(model, p);
  }
  return p;
}

/** What a turn's tokens cost by kind at a model's price. */
function costOf(tk: TokenUsage, rate: Rate) {
  const fresh = Math.max(0, tk.input - (tk.cacheWrite ?? 0));
  const written = tk.cacheWrite ?? 0;
  const cached = tk.cacheRead ?? 0;
  // Writing to Anthropic's cache costs a quarter more than reading fresh.
  return { fresh: (fresh * rate.input) / 1e6, written: (written * rate.input * 1.25) / 1e6, cached: (cached * rate.cacheRead) / 1e6, out: (tk.output * rate.output) / 1e6 };
}


function Line({ label, hint, value, sub }: { label: string; hint?: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-0.5" title={hint}>
      <span className="min-w-0 flex-1 text-fg-2">{label}</span>
      {sub && <span className="tnum text-fg-3">{sub}</span>}
      <span className="tnum w-20 shrink-0 text-right text-fg">{value}</span>
    </div>
  );
}

export function TurnCost({ sessionKey, agent, turn, work, start, className }: { sessionKey: string; agent?: Agent; turn: Turn; work: TimelineItem[]; start?: number; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Breakdown | null>(null);
  // The model's price, for the cost beside the header: undefined while it is asked for.
  const [price, setPrice] = useState<Rate | null | undefined>(turn.costUsd != null || !turn.model ? null : undefined);
  // Claude Code and Codex run on a plan (unless on API credit): the cost is what the tokens would cost at API prices.
  const credit = useSessions((x) => !!x.byKey[sessionKey]?.apiCredit);
  const plan = (agent === 'claude' || agent === 'codex') && !credit;
  useEffect(() => {
    if (turn.costUsd != null || !turn.model || !turn.tokens) return;
    let alive = true;
    priceOf(sessionKey, turn.model).then((r) => alive && setPrice(r));
    return () => {
      alive = false;
    };
  }, [sessionKey, turn.model, turn.costUsd != null, !!turn.tokens]);
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
  const rate = turn.model ? (data?.rates[turn.model] ?? price ?? null) : null;
  const fresh = Math.max(0, tk.input - (tk.cacheWrite ?? 0));
  const written = tk.cacheWrite ?? 0;
  const cached = tk.cacheRead ?? 0;
  const cost = rate ? costOf(tk, rate) : null;
  const saved = rate ? (cached * (rate.input - rate.cacheRead)) / 1e6 : 0;
  const read = fresh + written + cached;
  // What the turn cost, as the agent said (Custom with a priced model) or from the model's price; null: no price known.
  const spent = turn.costUsd ?? (cost ? cost.fresh + cost.written + cost.cached + cost.out : null);
  // Beside the header: the cost ("≈" when it is worked out from the price), else the tokens; nothing while the price is on its way.
  const shown = price === undefined && turn.costUsd == null ? null : spent != null ? (turn.costUsd != null && !plan ? usd(spent) : `≈ ${usd(spent)}`) : `${compact(total)} tokens`;
  if (shown == null) return null;
  return (
    <>
      <button
        ref={ref}
        onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}
        className={cx('rounded-md px-1.5 py-0.5 text-[12px] text-fg-3 transition-colors hover:bg-bg-2 hover:text-fg-2', open && 'bg-bg-2 text-fg-2', className)}
        title={spent != null && plan ? `Time and cost\n${AT_API_PRICES}` : 'Time and cost'}
      >
        {shown}
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
          {spent != null && (
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-fg">Cost</span>
                <span className="tnum text-fg">{usd(spent)}</span>
              </div>
              {plan && <div className="mt-0.5 text-fg-3">{AT_API_PRICES}</div>}
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
