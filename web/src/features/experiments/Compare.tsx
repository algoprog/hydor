// Compare: the runs you picked side by side. Each in its own colour; the numbers they gave (the best of each row in
// bold), their hyperparameters and where they ran (what differs between them marked, with a switch to show only
// that), and their metrics over steps on one chart each. Try to break it (BreakDialog.tsx) has an agent test the
// gain they show before it counts.
import { useMemo, useState } from 'react';
import { betterOf, type RunRecord } from '@shared/experiments';
import { Button, cx, Dialog, Switch } from '../../components/ui';
import { allParams, MAX_SHOWN, paramText, RUN_COLORS, runKey } from './analysis';
import { num, rankMetrics, useSeries } from './api';
import { BreakDialog } from './BreakDialog';
import { ChartsPanel, type PanelRun } from './ChartsPanel';

/** Metrics before "All N". */
const FIRST_METRICS = 15;

const ROWS: { label: string; of: (r: RunRecord) => string; mono?: boolean }[] = [
  { label: 'Experiment', of: (r) => r.group ?? '' },
  { label: 'Command', of: (r) => r.command, mono: true },
  { label: 'Folder', of: (r) => r.cwd, mono: true },
  { label: 'Where', of: (r) => r.machine?.name ?? r.host ?? '' },
  { label: 'Commit', of: (r) => (r.commit ? `${r.commit.slice(0, 10)}${r.dirty ? ' + changes' : ''}` : ''), mono: true },
  { label: 'Seed', of: (r) => (r.seed === undefined ? '' : String(r.seed)) },
  { label: 'GPUs', of: (r) => String(r.gpus ?? 0) },
];

const colorOf = (i: number) => RUN_COLORS[i % RUN_COLORS.length];
const labelOf = (r: RunRecord) => r.name ?? r.id;

/** A table's header cells: a run's colour and name. */
function RunHeads({ runs, first }: { runs: RunRecord[]; first: string }) {
  return (
    <tr className="bg-bg-1 text-left text-fg-3">
      <th className="sticky left-0 z-[1] bg-bg-1 px-3 py-1.5 font-medium whitespace-nowrap">{first}</th>
      {runs.map((r, i) => (
        <th key={runKey(r)} className="max-w-[220px] px-3 py-1.5 font-medium">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: colorOf(i) }} />
            <span translate="no" className="truncate" title={labelOf(r)}>
              {labelOf(r)}
            </span>
          </span>
        </th>
      ))}
    </tr>
  );
}

export function Compare({ runs, onClose }: { runs: RunRecord[]; onClose: () => void }) {
  const open = runs.length > 0;
  const [allMetrics, setAllMetrics] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [breaking, setBreaking] = useState(false);
  const charted = useMemo(() => runs.slice(0, MAX_SHOWN), [runs]);
  const series = useSeries(charted);

  // Every metric any of them has: the curves' last values and the numbers printed once, the ones that matter most first.
  const metrics = useMemo(() => {
    const names = new Set<string>();
    const rep = new Set<string>();
    for (const r of runs) {
      for (const k of Object.keys(r.metrics?.last ?? {})) names.add(k);
      for (const k of r.metrics?.repeated ?? []) rep.add(k);
    }
    return rankMetrics([...names], (k) => rep.has(k));
  }, [runs]);
  // The hyperparameters have their own rows, but the seed is one of the fixed ones.
  const params = useMemo(() => allParams(runs).filter((p) => p !== 'seed'), [runs]);
  const rows = useMemo(
    () => [
      ...ROWS.map((x) => ({ label: x.label, own: false, mono: !!x.mono, cells: runs.map(x.of) })),
      ...params.map((p) => ({ label: p, own: true, mono: true, cells: runs.map((r) => (r.params?.[p] === undefined ? '' : paramText(r.params[p]))) })),
    ],
    [runs, params],
  );
  const shownRows = onlyDiff ? rows.filter((x) => new Set(x.cells).size > 1) : rows;

  const panelRuns: PanelRun[] = charted.map((r, i) => ({ key: runKey(r), label: labelOf(r), color: colorOf(i), series: series[runKey(r)], better: r.better, last: r.metrics?.last, best: r.metrics?.best }));

  return (
    <>
      <Dialog
        part="experiments"
        open={open}
        onClose={() => {
          onClose();
          setAllMetrics(false);
        }}
        title={`Compare ${runs.length} runs`}
        width={1100}
        footer={<Button onClick={() => setBreaking(true)}>Try to break it</Button>}
      >
        <div className="space-y-6">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {runs.map((r, i) => (
              <span key={runKey(r)} className="flex min-w-0 items-center gap-1.5 text-[12.5px]">
                <span className="h-0.5 w-4 shrink-0 rounded-full" style={{ background: colorOf(i) }} />
                <span translate="no" className="max-w-[260px] truncate" title={labelOf(r)}>
                  {labelOf(r)}
                </span>
              </span>
            ))}
          </div>

          {metrics.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="flex-1 text-[13px] font-semibold text-fg">Metrics</h3>
                {metrics.length > FIRST_METRICS && (
                  <button type="button" onClick={() => setAllMetrics((a) => !a)} className="text-[12px] text-accent hover:underline">
                    {allMetrics ? 'Fewer' : `All ${metrics.length}`}
                  </button>
                )}
              </div>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <RunHeads runs={runs} first="Metric" />
                  </thead>
                  <tbody>
                    {(allMetrics ? metrics : metrics.slice(0, FIRST_METRICS)).map((k) => {
                      const vals = runs.map((r) => r.metrics?.last?.[k]);
                      const have = vals.filter((x): x is number => x !== undefined && Number.isFinite(x));
                      // The best of the row (its ties too) when two runs or more have a value.
                      const sign = have.length > 1 ? (betterOf(k, runs.find((r) => r.better?.[k])?.better) === 'min' ? 1 : -1) : 0;
                      const best = sign ? Math.min(...have.map((x) => sign * x)) : null;
                      return (
                        <tr key={k} className="border-t border-line align-top">
                          <td translate="no" className="sticky left-0 z-[1] bg-panel px-3 py-1.5 whitespace-nowrap text-fg-3">
                            {k}
                          </td>
                          {vals.map((x, i) => (
                            <td key={i} className={cx('tnum px-3 py-1.5 whitespace-nowrap', best !== null && x !== undefined && Number.isFinite(x) && sign * x === best ? 'font-semibold text-fg' : 'text-fg-2')}>
                              {num(x)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <h3 className="flex-1 text-[13px] font-semibold text-fg">Hyperparameters</h3>
              <span className="text-[12px] text-fg-3">Only what differs</span>
              <Switch on={onlyDiff} onChange={setOnlyDiff} label="Only what differs" />
            </div>
            {shownRows.length ? (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <RunHeads runs={runs} first="Name" />
                  </thead>
                  <tbody>
                    {shownRows.map((row) => {
                      const differs = new Set(row.cells).size > 1;
                      return (
                        <tr key={row.label} className="border-t border-line align-top">
                          <td className={cx('sticky left-0 z-[1] bg-panel px-3 py-1.5 whitespace-nowrap', differs ? 'font-medium text-fg' : 'text-fg-3')} translate={row.own ? 'no' : undefined}>
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
            ) : (
              <p className="text-[13px] text-fg-3">Nothing differs between them.</p>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-fg">Charts</h3>
            <ChartsPanel runs={panelRuns} empty="None of these runs has metrics over steps yet." />
          </section>
        </div>
      </Dialog>
      {/* Beside the window, not inside it: a click in it is no click on this one. */}
      {open && breaking && <BreakDialog runs={runs} onClose={() => setBreaking(false)} />}
    </>
  );
}
