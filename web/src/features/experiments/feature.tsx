// Experiments in the app: its page under System (/system/experiments, a run at /system/experiments/<id>), and its
// tools in a conversation: a run or a sweep an agent started shows as a card that follows how it goes, a results
// table as the table itself with Copy LaTeX; reading runs shows as steps of the agent's work.
import { useEffect, useState } from 'react';
import { FlaskConical, Table2, Waypoints } from 'lucide-react';
import type { ResultsTable, RunRecord } from '@shared/experiments';
import type { ToolInfo, ToolItem } from '@shared/types';
import { api } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast } from '../../lib/store';
import { Button, cx } from '../../components/ui';
import { StepRow } from '../automations/StepRow';
import type { WebFeature } from '../registry';
import { copy, metricsLine, runPath, statusTone, statusWords } from './api';
import { ExperimentsPage } from './ExperimentsPage';

const arg = (t: ToolInfo, k: string) => {
  const v = (t.input as Record<string, unknown> | undefined)?.[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};
const going = (t: ToolInfo) => t.status === 'running' || t.status === 'pending';
const outOf = <T,>(t: ToolInfo): T | null => {
  if (t.status === 'error' || !t.output?.trim().startsWith('{')) return null;
  try {
    return JSON.parse(t.output) as T;
  } catch {
    return null;
  }
};

function ToolCard({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="my-2 flex items-start gap-2.5 rounded-xl border border-line bg-panel px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-fg-3">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** A run an agent started: its status as it goes, and a way to it. */
function RunCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const out = outOf<{ id: string; name?: string }>(item.tool);
  const [run, setRun] = useState<RunRecord | null>(null);
  const load = () =>
    out &&
    api<{ run: RunRecord }>(`/api/experiments/runs/${out.id}?lines=0`)
      .then((r) => setRun(r.run))
      .catch(() => {});
  useEffect(() => {
    load();
  }, [out?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useFeatureEvent('experiments', (e) => {
    if (out && (e.data as { runs?: string[] })?.runs?.includes(out.id)) load();
  });
  if (!out) return <StepRow item={item} sessionKey={sessionKey} />;
  const m = run ? metricsLine(run) : '';
  return (
    <ToolCard icon={<FlaskConical size={15} />}>
      <div className="flex items-center gap-2">
        <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {run?.name ?? out.name ?? out.id}
        </span>
        <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(runPath({ id: out.id }))}>
          Open
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-fg-3">
        {run && <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', statusTone(run.status))} />}
        <span className="truncate" title={run?.why}>
          {run ? statusWords(run) : 'In line'}
          {run?.why && (run.status === 'waiting' || run.status === 'failed') ? `: ${run.why}` : ''}
        </span>
      </div>
      {m && (
        <div translate="no" className="tnum truncate text-[12px] text-fg-2">
          {m}
        </div>
      )}
    </ToolCard>
  );
}

/** A sweep an agent started: how many runs, and a way to its view. */
function SweepCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const out = outOf<{ sweep: string; group: string; runs: string[] }>(item.tool);
  if (!out) return <StepRow item={item} sessionKey={sessionKey} />;
  return (
    <ToolCard icon={<Waypoints size={15} />}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          A sweep of {out.runs.length} runs:{' '}
          <span translate="no" className="font-medium">
            {out.group}
          </span>
        </span>
        <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(`/system/experiments?sweep=${out.sweep}`)}>
          Open
        </Button>
      </div>
    </ToolCard>
  );
}

/** A results table an agent made: the table's first rows, Copy LaTeX, and a way to it. */
function TableCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = outOf<ResultsTable>(item.tool);
  if (!t?.rows) return <StepRow item={item} sessionKey={sessionKey} />;
  return (
    <ToolCard icon={<Table2 size={15} />}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          A results table: {t.rows.length} rows, {t.spec.columns.length} {t.spec.columns.length === 1 ? 'metric' : 'metrics'}
        </span>
        <Button size="sm" variant="ghost" className="-my-1" onClick={async () => toast((await copy(t.latex)) ? 'Copied the LaTeX' : 'Could not copy')}>
          Copy LaTeX
        </Button>
        <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(`/system/experiments?table=${t.id}`)}>
          Open
        </Button>
      </div>
      <pre translate="no" className="mt-1 max-h-40 overflow-auto font-mono text-[11px] leading-snug whitespace-pre text-fg-2">
        {t.markdown.split('\n\n')[0]}
      </pre>
    </ToolCard>
  );
}

export const experimentsFeature: WebFeature = {
  id: 'experiments',
  routes: [{ match: (p) => p === '/system/experiments' || p.startsWith('/system/experiments/'), Page: ExperimentsPage }],
  toolViews: {
    experiment_run: { place: 'answer', Row: RunCard, step: (t) => ({ verb: going(t) ? 'Starting' : 'Started', title: arg(t, 'name') ?? arg(t, 'command') ?? 'a run' }) },
    experiment_sweep: { place: 'answer', Row: SweepCard, step: (t) => ({ verb: going(t) ? 'Starting' : 'Started', title: `a sweep${arg(t, 'group') ? `: ${arg(t, 'group')}` : ''}` }) },
    experiment_table: { place: 'answer', Row: TableCard, step: () => ({ verb: 'Made', title: 'a results table' }) },
    experiment_list: { Row: StepRow, step: (t) => ({ category: 'read', verb: going(t) ? 'Looking at' : 'Looked at', title: arg(t, 'group') ? `the runs of ${arg(t, 'group')}` : 'the runs' }) },
    experiment_get: { Row: StepRow, step: (t) => ({ category: 'read', verb: going(t) ? 'Reading' : 'Read', title: `the run ${arg(t, 'id') ?? ''}`.trim() }) },
    experiment_stop: { Row: StepRow, step: (t) => ({ verb: going(t) ? 'Stopping' : 'Stopped', title: `the run ${arg(t, 'id') ?? ''}`.trim() }) },
    experiment_wait: { Row: StepRow, step: (t) => ({ verb: going(t) ? 'Waiting for' : 'Waited for', title: 'runs to end' }) },
  },
};
