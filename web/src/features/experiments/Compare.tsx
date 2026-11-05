// Compare: the runs you ticked, their metrics over steps on one chart per metric (a line per run), and their
// settings side by side, with what differs between them marked.
import { useEffect, useMemo, useState } from 'react';
import type { MetricSeries, RunRecord } from '@shared/experiments';
import { api } from '../../lib/api';
import { cx, Dialog, Throbber } from '../../components/ui';
import { baseOf, num, VIZ } from './api';
import { StepChart } from './Charts';

const ROWS: { label: string; of: (r: RunRecord) => string }[] = [
  { label: 'Experiment', of: (r) => r.group ?? '' },
  { label: 'Command', of: (r) => r.command },
  { label: 'Folder', of: (r) => r.cwd },
  { label: 'Where', of: (r) => r.machine?.name ?? r.host ?? '' },
  { label: 'Commit', of: (r) => (r.commit ? `${r.commit.slice(0, 10)}${r.dirty ? ' + changes' : ''}` : '') },
  { label: 'Seed', of: (r) => (r.seed === undefined ? '' : String(r.seed)) },
  { label: 'GPUs', of: (r) => String(r.gpus ?? 0) },
];

export function Compare({ runs, onClose }: { runs: RunRecord[]; onClose: () => void }) {
  const [series, setSeries] = useState<(MetricSeries | null)[] | null>(null);
  const open = runs.length > 0;
  useEffect(() => {
    if (!open) return;
    setSeries(null);
    let alive = true;
    Promise.all(
      runs.map((r) =>
        api<{ series: MetricSeries }>(`/api/experiments/runs/${r.id}?lines=0`, baseOf(r.machine?.id) !== undefined ? { base: baseOf(r.machine?.id) } : {})
          .then((x) => x.series)
          .catch(() => null),
      ),
    ).then((s) => alive && setSeries(s));
    return () => {
      alive = false;
    };
  }, [runs, open]);
  const metrics = useMemo(() => {
    const seen = new Set<string>();
    for (const s of series ?? []) for (const [k, pts] of Object.entries(s ?? {})) if (pts.length) seen.add(k);
    return [...seen];
  }, [series]);
  // The seed has a row of its own.
  const params = useMemo(() => [...new Set(runs.flatMap((r) => Object.keys(r.params ?? {})))].filter((p) => p !== 'seed'), [runs]);
  const label = (r: RunRecord) => r.name ?? r.id;
  const rows = [...ROWS.map((x) => ({ label: x.label, cells: runs.map(x.of), mono: x.label === 'Command' || x.label === 'Folder' || x.label === 'Commit' })), ...params.map((p) => ({ label: p, cells: runs.map((r) => (r.params?.[p] === undefined ? '' : String(r.params[p]))), mono: true, param: true }))];
  return (
    <Dialog open={open} onClose={onClose} title={`Compare ${runs.length} runs`} width={1100}>
      <div className="space-y-5">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {runs.map((r, i) => (
            <span key={`${r.machine?.id ?? ''}${r.id}`} className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
              <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ background: VIZ[i % VIZ.length] }} />
              <span translate="no" className="truncate">
                {label(r)}
              </span>
            </span>
          ))}
        </div>
        {!series ? (
          <div className="flex justify-center py-8 text-fg-3">
            <Throbber />
          </div>
        ) : metrics.length ? (
          <div className="grid gap-3 md:grid-cols-2">
            {metrics.map((m) => (
              <div key={m} className="min-w-0 rounded-xl border border-line bg-panel px-3 pt-2 pb-1">
                <div className="text-[12px] font-medium text-fg-2" translate="no">
                  {m}
                </div>
                <StepChart series={runs.map((r, i) => ({ label: label(r), color: VIZ[i % VIZ.length], points: series[i]?.[m] ?? [] })).filter((s) => s.points.length)} height={130} />
                <div className="mb-1 flex flex-wrap gap-x-3 text-[11.5px] text-fg-3">
                  {runs.map((r, i) =>
                    r.metrics?.last?.[m] !== undefined ? (
                      <span key={i} className="tnum">
                        <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: VIZ[i % VIZ.length] }} />
                        {num(r.metrics.last[m])}
                      </span>
                    ) : null,
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-fg-3">None of these runs has metrics over steps yet.</p>
        )}
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-bg-1 text-left text-fg-3">
                <th className="px-3 py-1.5 font-medium">Setting</th>
                {runs.map((r, i) => (
                  <th key={i} className="px-3 py-1.5 font-medium">
                    <span className="mr-1.5 inline-block h-0.5 w-3 rounded-full align-middle" style={{ background: VIZ[i % VIZ.length] }} />
                    <span translate="no">{label(r)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const differs = new Set(row.cells).size > 1;
                return (
                  <tr key={row.label} className="border-t border-line align-top">
                    <td className={cx('px-3 py-1.5 whitespace-nowrap', differs ? 'font-medium text-fg' : 'text-fg-3')} translate={'param' in row ? 'no' : undefined}>
                      {row.label}
                    </td>
                    {row.cells.map((c, i) => (
                      <td key={i} translate="no" className={cx('px-3 py-1.5', row.mono && 'font-mono text-[11.5px] break-all', differs ? 'bg-accent-soft text-fg' : 'text-fg-2')}>
                        {c || '–'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-fg-3">What differs between them is marked.</p>
      </div>
    </Dialog>
  );
}
