// An experiment's Hyperparameters tab: which way its runs went on one metric and which hyperparameters go with it: the
// best run, every run as a line across the hyperparameters (parallel coordinates), how strongly each hyperparameter
// goes with the metric, and each one against the metric, a dot per run. When the runs are a sweep, a line says how it went.
import { useEffect, useMemo, useState } from 'react';
import type { RunRecord, SweepSpec } from '@shared/experiments';
import { betterOf } from '@shared/experiments';
import { api, enc } from '../../lib/api';
import { Button, cx, inputCls, Segmented } from '../../components/ui';
import { isActive, metricsOf, num, rankMetrics } from './api';
import { bestRun, differingParams, importanceOf, keyMetricOf, paramsOf, runKey, valueOf, type Importance } from './analysis';
import { ParallelCoords, Scatter } from './Charts';

const card = 'rounded-xl border border-line bg-panel';
/** Words for a correlation: ρ −0.82, with a true minus sign. */
const signed = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}`;

/** One row of "Which hyperparameters matter": the name, a bar, the number and what it says. */
function ImportanceRow({ im }: { im: Importance }) {
  const num_ = im.kind === 'num';
  const rho = im.rho ?? 0;
  // Numbers: a bar from the middle (left when negative); others: from the left.
  const bar = num_ ? { left: `${rho < 0 ? 50 - Math.abs(rho) * 50 : 50}%`, width: `${Math.abs(rho) * 50}%` } : { left: '0%', width: `${im.score * 100}%` };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1">
      <span translate="no" title={im.param} className="w-36 shrink-0 truncate font-mono text-[12px]">
        {im.param}
      </span>
      <span className="relative h-2 min-w-[80px] max-w-[260px] flex-1 rounded-full bg-bg-2">
        <span className="absolute top-0 h-full rounded-full" style={{ ...bar, background: 'var(--viz-1)' }} />
        {num_ && <span className="absolute top-[-2px] left-1/2 h-3 w-px bg-line-2" />}
      </span>
      <span className="tnum w-[72px] shrink-0 text-[12px] text-fg-2">{num_ ? `ρ ${signed(rho)}` : `η ${im.score.toFixed(2)}`}</span>
      <span className="min-w-[110px] text-[12px] text-fg-3">
        {num_ ? (
          im.higherIsBetter ? (
            'higher is better'
          ) : (
            'lower is better'
          )
        ) : (
          <>
            best:{' '}
            <span translate="no" className="text-fg-2">
              {im.bestValue}
            </span>
          </>
        )}
      </span>
    </div>
  );
}

export function Params({ runs, onOpenRun, onTable, canTable, onCompare }: {
  runs: RunRecord[];
  onOpenRun: (r: RunRecord) => void;
  onTable: () => void;
  canTable: boolean;
  onCompare: (rs: RunRecord[]) => void;
}) {
  const metrics = useMemo(() => {
    const rep = new Set<string>();
    for (const r of runs) for (const k of r.metrics?.repeated ?? []) rep.add(k);
    return rankMetrics(metricsOf(runs), (k) => rep.has(k));
  }, [runs]);
  const [picked, setPicked] = useState('');
  const [which, setWhich] = useState<'last' | 'best'>('last');
  const metric = metrics.includes(picked) ? picked : (keyMetricOf(runs) ?? metrics[0] ?? '');
  const way = betterOf(metric, runs.find((r) => r.better?.[metric])?.better);

  const scored = useMemo(() => runs.filter((r) => valueOf(r, metric, which) !== undefined), [runs, metric, which]);
  const ranked = useMemo(() => [...scored].sort((a, b) => (way === 'min' ? valueOf(a, metric, which)! - valueOf(b, metric, which)! : valueOf(b, metric, which)! - valueOf(a, metric, which)!)), [scored, metric, which, way]);
  const best = useMemo(() => bestRun(runs, metric, which), [runs, metric, which]);
  // The hyperparameters that vary among the runs that have the metric (one all of them share says nothing about it).
  const differing = useMemo(() => differingParams(scored.length >= 2 ? scored : runs), [scored, runs]);
  const importance = useMemo(() => (metric ? importanceOf(runs, differing, metric, which) : []), [runs, differing, metric, which]);
  // The hyperparameters that matter most first, then the rest.
  const order = useMemo(() => {
    const first = importance.map((i) => i.param);
    return [...first, ...differing.filter((p) => !first.includes(p))];
  }, [importance, differing]);

  // The sweep these runs belong to (this computer's), for the line above the cards.
  const sweepId = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of runs) if (r.sweep && !r.machine) n.set(r.sweep, (n.get(r.sweep) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  }, [runs]);
  const [sweep, setSweep] = useState<SweepSpec | null>(null);
  useEffect(() => {
    setSweep(null);
    if (!sweepId) return;
    let alive = true;
    api<{ sweep: SweepSpec }>(`/api/experiments/sweeps/${enc(sweepId)}`)
      .then((d) => alive && setSweep(d.sweep))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sweepId]);
  const sweepLine = useMemo(() => {
    if (!sweep) return '';
    const rs = runs.filter((r) => r.sweep === sweep.id);
    const n = (f: (r: RunRecord) => boolean) => rs.filter(f).length;
    const early = n((r) => !!r.why?.startsWith('Stopped early'));
    return [
      `A sweep of ${rs.length} runs`,
      sweep.mode === 'random' ? 'a random sample' : 'every combination',
      n((r) => r.status === 'done') ? `${n((r) => r.status === 'done')} done` : '',
      n(isActive) ? `${n(isActive)} going` : '',
      early ? `${early} stopped early` : '',
      sweep.earlyStop ? `stopped early on ${sweep.earlyStop.metric}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }, [sweep, runs]);

  const axes = order.slice(0, 8);
  const byKey = useMemo(() => new Map(runs.map((r) => [runKey(r), r])), [runs]);
  const bestValue = best ? valueOf(best, metric, which) : undefined;
  const bestParams = best ? paramsOf(best) : {};
  const enough = scored.length >= 2;

  return (
    <div className="space-y-4 px-5 py-4 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <select value={metric} onChange={(e) => setPicked(e.target.value)} translate="no" aria-label="Metric" className={cx(inputCls.replace('w-full', ''), 'h-8 max-w-[240px] text-[13px]')}>
          {metrics.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <Segmented
          size="sm"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'last', label: 'Last' },
            { value: 'best', label: 'Best' },
          ]}
        />
        <span className="text-[12px] text-fg-3">{way === 'min' ? 'lower is better' : 'higher is better'}</span>
      </div>

      {sweepLine && <p className="text-[12.5px] text-fg-2">{sweepLine}</p>}

      {best && bestValue !== undefined && (
        <button type="button" onClick={() => onOpenRun(best)} className={cx(card, 'block w-full px-4 py-3 text-left transition-colors hover:border-line-2')}>
          <div className="text-[12px] text-fg-3">{`Best ${metric}`}</div>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="tnum text-[17px] font-semibold">{num(bestValue)}</span>
            <span translate="no" className="min-w-0 truncate text-[13px] text-fg-2">
              {best.name ?? best.id}
            </span>
          </div>
          {differing.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {differing.slice(0, 12).map((p) => (
                <span key={p} translate="no" className="rounded-md bg-bg-2 px-1.5 py-0.5 font-mono text-[11.5px] text-fg-2">
                  {`${p}=${String(bestParams[p] ?? '–')}`}
                </span>
              ))}
              {differing.length > 12 && <span className="py-0.5 text-[11.5px] text-fg-3">{`+${differing.length - 12} more`}</span>}
            </div>
          )}
        </button>
      )}

      {enough && axes.length > 0 && (
        <div className={cx(card, 'px-4 pt-3 pb-3')}>
          <h3 className="text-[13px] font-semibold">Parallel coordinates</h3>
          <p className="mb-2 text-[12px] text-fg-3">{`Each line is a run: the stronger it is, the better it did on ${metric}.`}</p>
          <ParallelCoords
            axes={axes.map((p) => ({ key: p, label: p }))}
            rows={scored.map((r) => ({ key: runKey(r), label: r.name ?? r.id, values: Object.fromEntries(axes.map((p) => [p, paramsOf(r)[p]])), metric: valueOf(r, metric, which)! }))}
            metric={metric}
            better={way}
            best={best ? runKey(best) : undefined}
            onOpen={(k) => {
              const r = byKey.get(k);
              if (r) onOpenRun(r);
            }}
          />
        </div>
      )}

      {importance.length > 0 && (
        <div className={cx(card, 'px-4 pt-3 pb-3')}>
          <h3 className="mb-1 text-[13px] font-semibold">Which hyperparameters matter</h3>
          {importance.map((im) => (
            <ImportanceRow key={im.param} im={im} />
          ))}
          <p className="mt-2 text-[12px] text-fg-3">{`Over ${Math.max(...importance.map((i) => i.n))} runs that have ${metric}. A correlation, not proof of a cause.`}</p>
        </div>
      )}

      {enough && !differing.length && <p className="text-fg-3">{`The runs that have ${metric} all have the same hyperparameters.`}</p>}
      {differing.length > 0 &&
        (enough ? (
          <div>
            <h3 className="mb-2 text-[13px] font-semibold">{`Each hyperparameter against ${metric}`}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {order.map((p) => (
                <div key={p} className={cx(card, 'px-3 pt-2 pb-1')}>
                  <Scatter
                    setting={p}
                    metric={metric}
                    best={best ? runKey(best) : undefined}
                    points={scored.filter((r) => paramsOf(r)[p] !== undefined).map((r) => ({ id: runKey(r), x: typeof paramsOf(r)[p] === 'number' ? (paramsOf(r)[p] as number) : String(paramsOf(r)[p]), y: valueOf(r, metric, which)! }))}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-fg-3">{`Each hyperparameter against ${metric || 'the metric'} shows here once two runs have it.`}</p>
        ))}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="secondary" disabled={!canTable} onClick={onTable}>
          Make a table
        </Button>
        <Button size="sm" variant="secondary" disabled={!enough} onClick={() => onCompare(ranked.slice(0, 6))}>
          Compare the best 6
        </Button>
      </div>
    </div>
  );
}
