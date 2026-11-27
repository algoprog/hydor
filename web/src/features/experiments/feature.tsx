// Experiments in the app: its page, a section of its own on the rail (/experiments, a run at /experiments/<id>; under
// System, /system/experiments, until November 2026, whose addresses still land there), and its
// tools in a conversation: a run or a sweep an agent started shows as a card that follows how it goes, a results
// table as the table itself with Copy LaTeX, a score, a proposed evaluation and an evolution to start as cards of
// their own; reading runs, evaluations and evolutions shows as steps of the agent's work.
import { useEffect, useState } from 'react';
import { FlaskConical, Gauge, Lock, Sprout, Table2, Waypoints } from 'lucide-react';
import type { EvalScore, EvalSpec, EvaluationListed } from '@shared/evaluations';
import type { EvolveSpec } from '@shared/evolve';
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
import { saidByStatus } from './nightWords';
import { evaluationPath, scoreUrl } from './evalApi';
import { betterWords, isOpen, meanStd, standing, toneClass } from './evalWords';
import { evolutionPath } from './evolveApi';
import { readWords } from './evolveWords';
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
          {run?.why && !saidByStatus(run.why) && (run.status === 'waiting' || run.status === 'failed') ? <>{': '}{run.why.replace(/^Waits for you: /, '')}</> : ''}
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
          {`A sweep of ${out.runs.length} runs:`}{' '}
          <span translate="no" className="font-medium">
            {out.group}
          </span>
        </span>
        <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(`/experiments?sweep=${out.sweep}`)}>
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
          {`A results table: ${t.rows.length} rows, ${t.spec.columns.length} metric${t.spec.columns.length === 1 ? '' : 's'}`}
        </span>
        <Button size="sm" variant="ghost" className="-my-1" onClick={async () => toast((await copy(t.latex)) ? 'Copied the LaTeX' : 'Could not copy')}>
          Copy LaTeX
        </Button>
        <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(`/experiments?table=${t.id}`)}>
          Open
        </Button>
      </div>
      <pre translate="no" className="mt-1 max-h-40 overflow-auto font-mono text-[11px] leading-snug whitespace-pre text-fg-2">
        {t.markdown.split('\n\n')[0]}
      </pre>
    </ToolCard>
  );
}

/** A score an agent asked for: the evaluation's name, the number and how it stands to the baseline, as it comes in. */
function ScoreCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const out = outOf<EvalScore & { evaluation: { id: string; name: string; metric: string } }>(item.tool);
  const given = out?.evaluation?.id ? out : null;
  const [now, setNow] = useState<EvalScore | null>(null);
  // One still going when the tool answered is read again as it goes.
  const follow = !!given && isOpen(given);
  const load = () =>
    given &&
    api<{ score: EvalScore }>(scoreUrl(given.id))
      .then((r) => setNow(r.score))
      .catch(() => {});
  useEffect(() => {
    if (follow) load();
  }, [given?.id, follow]); // eslint-disable-line react-hooks/exhaustive-deps
  useFeatureEvent('experiments', (e) => {
    if (follow && (e.data as { evals?: string[] })?.evals?.includes(given.evaluation.id)) load();
  });
  if (!given) return <StepRow item={item} sessionKey={sessionKey} />;
  const s = now ?? given;
  const against = standing(s.against);
  return (
    <ToolCard icon={<Gauge size={15} />}>
      <div className="flex items-center gap-2">
        <span translate="no" className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
          {given.evaluation.name}
        </span>
        <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(evaluationPath(given.evaluation.id, given.id))}>
          Open
        </Button>
      </div>
      {s.status === 'done' ? (
        <div className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
          <span translate="no" className="font-mono text-[12px] text-fg-3">
            {given.evaluation.metric}
          </span>
          <span translate="no" className="tnum font-semibold text-fg">
            {meanStd(s)}
          </span>
          {against && <span className={toneClass(against.tone)}>{against.long}</span>}
        </div>
      ) : isOpen(s) ? (
        <div className="flex items-center gap-1.5 text-[12px] text-fg-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>{s.status === 'waiting' ? 'Waiting' : 'Running'}</span>
        </div>
      ) : (
        <div className="text-[12.5px] break-words text-fg-2">
          <span className={cx('font-medium', s.status === 'failed' && 'text-err')}>{s.status === 'failed' ? 'Failed:' : 'Stopped'}</span> {s.status === 'failed' && <span>{s.why}</span>}
        </div>
      )}
    </ToolCard>
  );
}

/** An evaluation an agent proposed: what it would be, and what came of it. The yes or no is on the agent's own card. */
function ProposalCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const p = t.input as Partial<EvalSpec> | undefined;
  const out = outOf<{ created?: boolean; id: string; protect?: string[] }>(t);
  if (!p?.command || !p.metric) return <StepRow item={item} sessionKey={sessionKey} />;
  const files = (out?.protect ?? (Array.isArray(p.protect) ? p.protect : [])).filter((x) => typeof x === 'string');
  const said = t.output?.trim() ?? '';
  const no = said.startsWith('The user said no');
  const line = (label: string, text: string) => (
    <div className="flex min-w-0 gap-2 text-[12px]">
      <span className="w-[68px] shrink-0 text-fg-3">{label}</span>
      <span translate="no" className="min-w-0 flex-1 font-mono text-[11.5px] leading-[18px] break-all text-fg-2">
        {text}
      </span>
    </div>
  );
  return (
    <ToolCard icon={<Gauge size={15} />}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          <span>An evaluation:</span>{' '}
          <span translate="no" className="font-medium">
            {p.name}
          </span>
        </span>
        {out?.created && (
          <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(evaluationPath(out.id))}>
            Open
          </Button>
        )}
      </div>
      <div className="mt-1 space-y-0.5">
        {line('Command', p.command)}
        <div className="flex min-w-0 gap-2 text-[12px]">
          <span className="w-[68px] shrink-0 text-fg-3">Number</span>
          <span className="min-w-0 flex-1 text-fg-2">
            <span translate="no" className="font-mono text-[11.5px]">
              {p.metric}
            </span>
            {p.better && (
              <>
                {', '}
                <span>{betterWords(p.better)}</span>
              </>
            )}
          </span>
        </div>
        {files.length > 0 && line('Sealed files', files.join(', '))}
        {p.final?.command ? (
          line('Final test', p.final.command)
        ) : (
          <div className="flex gap-2 text-[12px]">
            <span className="w-[68px] shrink-0 text-fg-3">Final test</span>
            <span className="text-fg-2">None</span>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px]">
        {out?.created ? (
          <>
            <Lock size={13} className="mt-[3px] shrink-0 text-ok" />
            <span className="font-medium text-ok">Sealed</span>
          </>
        ) : going(t) || t.status === 'waiting' ? (
          <span className="text-fg-3">Waiting for your answer</span>
        ) : no ? (
          <span className="font-medium text-fg-2">You said no</span>
        ) : (
          <span className="break-words text-fg-2">
            <span className="font-medium">Not made:</span> <span translate="no">{said.slice(0, 300)}</span>
          </span>
        )}
      </div>
    </ToolCard>
  );
}

/** An evolution an agent asked to start: what it would change, how many tries, and what came of the question. The yes or no is on the agent's own card. */
function EvolveCard({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  const p = t.input as Partial<EvolveSpec> | undefined;
  const out = outOf<{ evolution?: { id: string; evaluation: string; files: string[]; candidates: number } }>(t)?.evolution;
  const files = (out?.files ?? (Array.isArray(p?.files) ? p.files : [])).filter((x) => typeof x === 'string');
  const evaluation = out?.evaluation ?? (typeof p?.evaluation === 'string' ? p.evaluation : '');
  const [name, setName] = useState('');
  useEffect(() => {
    if (!evaluation) return;
    let live = true;
    api<{ evaluations: EvaluationListed[] }>('/api/experiments/evaluations')
      .then((r) => live && setName(r.evaluations.find((x) => x.id === evaluation)?.name ?? ''))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [evaluation]);
  if (!files.length) return <StepRow item={item} sessionKey={sessionKey} />;
  const said = t.output?.trim() ?? '';
  const no = said.startsWith('The user said no');
  const tries = out?.candidates ?? (typeof p?.candidates === 'number' ? p.candidates : 100);
  const line = (label: string, children: React.ReactNode) => (
    <div className="flex min-w-0 gap-2 text-[12px]">
      <span className="w-[68px] shrink-0 text-fg-3">{label}</span>
      <span className="min-w-0 flex-1 text-fg-2">{children}</span>
    </div>
  );
  return (
    <ToolCard icon={<Sprout size={15} />}>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px]">
          <span>Evolve</span>
          {name && (
            <>
              {' · '}
              <span translate="no" className="font-medium">
                {name}
              </span>
            </>
          )}
        </span>
        {out && (
          <Button size="sm" variant="ghost" className="-my-1 -mr-1.5" onClick={() => go(evolutionPath(out.id))}>
            Open
          </Button>
        )}
      </div>
      <div className="mt-1 space-y-0.5">
        {line(
          'Changes',
          <span translate="no" className="font-mono text-[11.5px] leading-[18px] break-all">
            {files.join(', ')}
          </span>,
        )}
        {line('Tries', <span>{`Up to ${tries}`}</span>)}
      </div>
      <div className="mt-1.5 text-[12.5px]">
        {out ? (
          <span className="font-medium text-ok">Started</span>
        ) : going(t) || t.status === 'waiting' ? (
          <span className="text-fg-3">Waiting for your answer</span>
        ) : no ? (
          <span className="font-medium text-fg-2">You said no</span>
        ) : (
          <span className="break-words text-fg-2">
            <span className="font-medium">Not started:</span> <span translate="no">{said.slice(0, 300)}</span>
          </span>
        )}
      </div>
    </ToolCard>
  );
}

export const experimentsFeature: WebFeature = {
  id: 'experiments',
  nav: [{ id: 'experiments', path: '/experiments', label: 'Experiments', icon: <FlaskConical size={17} />, match: (p) => p === '/experiments' || p.startsWith('/experiments/') }],
  routes: [{ match: (p) => p === '/experiments' || p.startsWith('/experiments/'), Page: ExperimentsPage }],
  toolViews: {
    experiment_run: { place: 'answer', Row: RunCard, step: (t) => ({ verb: going(t) ? 'Starting' : 'Started', title: arg(t, 'name') ?? arg(t, 'command') ?? 'a run' }) },
    experiment_sweep: { place: 'answer', Row: SweepCard, step: (t) => ({ verb: going(t) ? 'Starting' : 'Started', title: `a sweep${arg(t, 'group') ? `: ${arg(t, 'group')}` : ''}` }) },
    experiment_table: { place: 'answer', Row: TableCard, step: () => ({ verb: 'Made', title: 'a results table' }) },
    experiment_list: { Row: StepRow, step: (t) => ({ category: 'read', verb: going(t) ? 'Looking at' : 'Looked at', title: arg(t, 'group') ? `the runs of ${arg(t, 'group')}` : 'the runs' }) },
    experiment_get: { Row: StepRow, step: (t) => ({ category: 'read', verb: going(t) ? 'Reading' : 'Read', title: `the run ${arg(t, 'id') ?? ''}`.trim() }) },
    experiment_stop: { Row: StepRow, step: (t) => ({ verb: going(t) ? 'Stopping' : 'Stopped', title: `the run ${arg(t, 'id') ?? ''}`.trim() }) },
    experiment_describe: { Row: StepRow, step: (t) => ({ verb: going(t) ? 'Describing' : 'Described', title: arg(t, 'group') ? `the experiment ${arg(t, 'group')}` : 'an experiment' }) },
    experiment_note: { Row: StepRow, step: (t) => ({ verb: going(t) ? 'Noting' : 'Noted', title: `something about the run ${arg(t, 'id') ?? ''}`.trim() }) },
    experiment_wait: { Row: StepRow, step: (t) => ({ verb: going(t) ? 'Waiting for' : 'Waited for', title: 'runs to end' }) },
    experiment_budget: { Row: StepRow, step: (t) => (arg(t, 'why') ? { verb: going(t) ? 'Asking for' : 'Asked for', title: 'GPU hours for its runs' } : { category: 'read', verb: going(t) ? 'Reading' : 'Read', title: 'its budget of GPU hours' }) },
    evaluation_score: { place: 'answer', Row: ScoreCard, step: (t) => ({ verb: going(t) ? 'Scoring with' : 'Scored with', title: 'an evaluation' }) },
    evaluation_propose: { place: 'answer', Row: ProposalCard, step: (t) => ({ verb: going(t) ? 'Proposing' : 'Proposed', title: arg(t, 'name') ? `the evaluation ${arg(t, 'name')}` : 'an evaluation' }) },
    evaluation_get: { Row: StepRow, step: (t) => ({ category: 'read', verb: going(t) ? 'Reading' : 'Read', title: arg(t, 'score') ? 'a score' : 'the evaluations' }) },
    evolve_start: { place: 'answer', Row: EvolveCard, step: (t) => ({ verb: going(t) ? 'Starting' : 'Started', title: 'an evolution' }) },
    evolve_get: {
      Row: StepRow,
      step: (t) => {
        const said = readWords(outOf(t));
        // Not a "read" step: those are counted together as files read, and this one's line is what it found.
        return { verb: going(t) ? 'Reading' : 'Read', title: said ? `Evolve: ${said}` : arg(t, 'id') ? 'an evolution' : 'the evolutions' };
      },
    },
  },
};
