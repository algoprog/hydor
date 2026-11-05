// A sweep: how its runs went (done, failed, stopped early), its best run, and each setting against the metric, a dot
// per run, to see which settings matter. From here, its runs compared or made into a table by a setting.
import { useEffect, useMemo, useState } from 'react';
import type { RunRecord, SweepSpec } from '@shared/experiments';
import { betterOf } from '@shared/experiments';
import { api } from '../../lib/api';
import { go } from '../../lib/nav';
import { Button, cx, Dialog, inputCls, Throbber } from '../../components/ui';
import { isActive, metricsOf, num, runPath } from './api';
import { Scatter } from './Charts';

export function SweepView({ id, onClose, onTable, onCompare }: { id: string | null; onClose: () => void; onTable: (group: string) => void; onCompare: (runs: RunRecord[]) => void }) {
  const [data, setData] = useState<{ sweep: SweepSpec; runs: RunRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState('');
  const [which, setWhich] = useState<'best' | 'last'>('best');
  useEffect(() => {
    if (!id) return;
    setData(null);
    setError(null);
    api<{ sweep: SweepSpec; runs: RunRecord[] }>(`/api/experiments/sweeps/${id}`)
      .then((d) => {
        setData(d);
        setMetric(d.sweep.earlyStop?.metric ?? metricsOf(d.runs)[0] ?? '');
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);
  const metrics = useMemo(() => metricsOf(data?.runs ?? []), [data]);
  const way = data?.sweep.earlyStop?.metric === metric ? data.sweep.earlyStop.better : betterOf(metric, data?.runs[0]?.better);
  const value = (r: RunRecord) => (which === 'best' ? r.metrics?.best?.[metric] : r.metrics?.last?.[metric]);
  const scored = (data?.runs ?? []).filter((r) => typeof value(r) === 'number' && Number.isFinite(value(r)!));
  const best = [...scored].sort((a, b) => (way === 'min' ? value(a)! - value(b)! : value(b)! - value(a)!))[0];
  const count = (f: (r: RunRecord) => boolean) => (data?.runs ?? []).filter(f).length;
  const settings = Object.keys(data?.sweep.params ?? {});
  return (
    <Dialog open={!!id} onClose={onClose} title={data ? `Sweep ${data.sweep.group}` : 'Sweep'} width={900}>
      {error ? (
        <p className="text-[13px] text-err">{error}</p>
      ) : !data ? (
        <div className="flex justify-center py-8 text-fg-3">
          <Throbber />
        </div>
      ) : (
        <div className="space-y-4 text-[13px]">
          <p className="text-fg-2">
            {data.runs.length} runs: {count((r) => r.status === 'done')} done
            {count(isActive) ? `, ${count(isActive)} going` : ''}
            {count((r) => r.status === 'failed' || r.status === 'lost') ? `, ${count((r) => r.status === 'failed' || r.status === 'lost')} failed` : ''}
            {count((r) => !!r.why?.startsWith('Stopped early')) ? `, ${count((r) => !!r.why?.startsWith('Stopped early'))} stopped early` : ''}.{' '}
            {data.sweep.mode === 'random' ? 'A random sample of the combinations.' : 'Every combination.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className={cx(inputCls, 'h-8 w-auto max-w-[220px] text-[13px]')} translate="no">
              {metrics.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <select value={which} onChange={(e) => setWhich(e.target.value as 'best' | 'last')} className={cx(inputCls, 'h-8 w-auto text-[13px]')}>
              <option value="best">Each run’s best</option>
              <option value="last">Each run’s last</option>
            </select>
            <span className="text-fg-3">{way === 'min' ? 'lower is better' : 'higher is better'}</span>
          </div>
          {best && (
            <button type="button" onClick={() => go(runPath(best))} className="block w-full rounded-xl border border-line bg-panel px-3 py-2 text-left hover:border-line-2">
              <div className="text-[12px] text-fg-3">The best run</div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="tnum text-[15px] font-semibold">{num(value(best))}</span>
                <span translate="no" className="font-mono text-[12px] text-fg-2">
                  {settings.map((s) => `${s}=${best.params?.[s]}`).join('  ')}
                </span>
              </div>
            </button>
          )}
          {scored.length > 1 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {settings.map((s) => (
                <div key={s} className="rounded-xl border border-line bg-panel px-3 pt-2 pb-1">
                  <Scatter setting={s} metric={metric} best={best?.id} points={scored.map((r) => ({ id: r.id, x: (r.params?.[s] as number | string) ?? '—', y: value(r)! }))} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-fg-3">Each setting against {metric || 'the metric'} shows here once two runs have it.</p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button size="sm" variant="secondary" onClick={() => onTable(data.sweep.group)} disabled={!count((r) => r.status === 'done')}>
              Make a table
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onCompare([...scored].sort((a, b) => (way === 'min' ? value(a)! - value(b)! : value(b)! - value(a)!)).slice(0, 6))} disabled={scored.length < 2}>
              Compare the best 6
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
