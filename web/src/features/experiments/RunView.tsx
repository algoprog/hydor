// A run's page (/experiments/<id>): a way back to its experiment, its name, Stop, Run again and a menu; its status
// and why, and how far it is while it runs; then three tabs. Overview: how a failed run ended, its key metrics as tiles
// (a tap opens that curve on the Charts tab), its hyperparameters, the numbers it printed once, and what it ran from
// (details, code, command, environment) and what happened. Charts: every metric that is a curve over steps. Log: the
// output, newest at the bottom, following while it goes, with a box to find lines. A run kept on another machine is
// read through that machine. A run in an evaluation's folder says whether the sealed files were as sealed; a run that
// scores one leads back to it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Copy, FolderOpen, Gauge, Lock, MoreHorizontal, Play, RotateCcw, Search, Square, Trash2 } from 'lucide-react';
import type { EvalScore, EvaluationListed } from '@shared/evaluations';
import type { ExperimentGroup, MetricSeries, RunRecord } from '@shared/experiments';
import { evalUrl, scoredBy } from './evalApi';
import { pathWords } from './evalWords';
import { api, ApiError } from '../../lib/api';
import { LOCALE } from '../../i18n/locale';
import { trIn } from '../../i18n/runtime';
import { saidByStatus } from './nightWords';
import { machinePath } from '../../lib/machine';
import { go, goFull, sessionPath, showInFiles } from '../../lib/nav';
import { canReveal, reveal, revealLabel } from '../../lib/reveal';
import { toast, toastError } from '../../lib/store';
import { useFeatureEvent } from '../../lib/featureEvents';
import { DiffView } from '../../components/DiffView';
import { Meter } from '../../components/charts';
import { Button, cx, Dialog, IconButton, inputCls, MenuItem, MenuSep, Popover, Tabs, Throbber, useConfirm } from '../../components/ui';
import { baseOf, copy, gpuWords, isActive, keyMetrics, leftWords, num, progressOf, rankMetrics, rankValues, statusTone, statusWords, took, type RunTab } from './api';
import { paramsOf, paramText, runKey } from './analysis';
import { Sparkline } from './Charts';
import { ChartsPanel } from './ChartsPanel';

interface View {
  run: RunRecord;
  series: MetricSeries;
  log: string;
  logSize: number;
}

const EVENT_WORDS: Record<string, string> = {
  queued: 'In line',
  waiting: 'Waiting',
  started: 'Started',
  nan: 'NaN',
  oom: 'Out of memory',
  stall: 'Stalled',
  crash: 'Crashed',
  diverge: 'Diverging',
  agent: 'Agent on call',
  stopped: 'Stopped',
  done: 'Done',
  failed: 'Failed',
  note: 'Note',
};

const when = (t: number) => new Date(t).toLocaleString(LOCALE, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** A titled block of the page. */
function Block({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0', className)}>
      <div className="mb-2 flex min-h-5 items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold text-fg">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

const CARD = 'rounded-xl border border-line bg-panel px-3 py-2';

/** A label and its value, one row of a card. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-t border-line py-1.5 text-[12.5px] first:border-t-0 first:pt-0.5 last:pb-0.5">
      <div className="text-[12px] text-fg-3">{label}</div>
      <div className="min-w-0 break-words text-fg">{children}</div>
    </div>
  );
}

const linkCls = 'text-left text-accent hover:underline';

/** The files the command names that git does not track: what became of them, and their names. */
function NotInGit({ words, files }: { words: string; files: string[] }) {
  return (
    <p className="border-t border-line pt-1.5 text-[12px] break-words text-fg-3">
      <span>{words}</span>{' '}
      <span translate="no" className="font-mono text-[11.5px]">
        {files.join(', ')}
      </span>
    </p>
  );
}

/** Whether an evaluation's sealed files were as sealed when the run started, one line for each evaluation. */
function Sealed({ entries, onOpen }: { entries: NonNullable<RunRecord['sealed']>; onOpen: (evaluation: string) => void }) {
  return (
    <ul className="space-y-1.5 border-t border-line pt-2 pb-0.5">
      {entries.map((s) => (
        <li key={s.evaluation} className={cx('flex items-start gap-2 text-[12px] leading-snug', s.ok ? 'text-fg-3' : 'text-warn')}>
          {s.ok ? <Lock size={13} className="mt-px shrink-0" /> : <AlertTriangle size={13} className="mt-px shrink-0" />}
          <p className="min-w-0 break-words">
            <span>Evaluation</span>{' '}
            <button type="button" translate="no" onClick={() => onOpen(s.evaluation)} className="font-medium underline-offset-2 hover:underline">
              {s.name}
            </button>
            {s.ok ? (
              <span>: its scorer and data were as sealed</span>
            ) : (
              <>
                <span>: its scorer and data had changed when this run started: </span>
                <span translate="no" className="font-mono text-[11.5px] [overflow-wrap:anywhere]">
                  {(s.changed ?? []).map((p) => pathWords(p).name).join(', ')}
                </span>
              </>
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The last lines of a log, as the Log tab shows it (the terminal's colours). */
function Tail({ text }: { text: string }) {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [text]);
  return (
    <pre ref={ref} translate="no" className="max-h-[260px] overflow-auto rounded-lg bg-[var(--term-bg)] px-3 py-2 font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap text-[var(--term-fg)] [overflow-wrap:anywhere]">
      {text}
    </pre>
  );
}

/** The numbers a run gave once, as name and value pairs in a card, a Find box above when there are many. */
function PairsCard({ names, value, find, empty }: { names: string[]; value: (k: string) => string; find?: boolean; empty?: string }) {
  const [text, setText] = useState('');
  const words = text.trim().toLowerCase();
  const list = find && words ? names.filter((k) => k.toLowerCase().includes(words) || value(k).toLowerCase().includes(words)) : names;
  return (
    <div className={cx('@container', CARD)}>
      {find && <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Find one" aria-label="Find one" className={cx(inputCls, 'mb-2 h-8 text-[12.5px]')} />}
      {empty && !names.length ? (
        <p className="py-1 text-[12.5px] text-fg-3">{empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 text-[12.5px] @min-[640px]:grid-cols-2">
          {list.map((k) => (
            <div key={k} className="flex min-w-0 items-baseline gap-3">
              <span translate="no" title={k} className="max-w-[48%] min-w-0 shrink-0 truncate font-mono text-[12px] text-fg-3">
                {k}
              </span>
              <span translate="no" className="tnum min-w-0 flex-1 font-mono text-[12px] break-all text-fg">
                {value(k)}
              </span>
            </div>
          ))}
        </div>
      )}
      {find && words && !list.length && <p className="py-1 text-[12.5px] text-fg-3">None is like that.</p>}
    </div>
  );
}

/** The numbers the run printed once: the first 12, all with "All N" (and a Find box when there are many). */
function Values({ names, last }: { names: string[]; last: Record<string, number> }) {
  const [all, setAll] = useState(false);
  const shown = all ? names : names.slice(0, 12);
  return (
    <Block
      title="Values"
      right={
        names.length > 12 && (
          <button type="button" onClick={() => setAll((a) => !a)} className="text-[12px] text-accent hover:underline">
            {all ? 'Fewer' : `All ${names.length}`}
          </button>
        )
      }
    >
      <PairsCard names={shown} value={(k) => num(last[k])} find={all && names.length > 24} />
    </Block>
  );
}

/** The log, newest at the bottom; it follows while the run goes (the newest kept in view unless you scroll up), and a box shows only the lines that have a word. */
function Log({ id, base, initial, size, going }: { id: string; base?: string; initial: string; size: number; going: boolean }) {
  const [text, setText] = useState(initial);
  const [follow, setFollow] = useState(true);
  const [find, setFind] = useState('');
  const at = useRef(size);
  const box = useRef<HTMLPreElement>(null);
  const words = find.trim().toLowerCase();
  const finding = words.length > 0;
  useEffect(() => {
    setText(initial);
    at.current = size;
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Following pauses while finding (what is read then is added when the box is empty again).
  useEffect(() => {
    if (!going || !follow || finding) return;
    let alive = true;
    const t = window.setInterval(async () => {
      try {
        const r = await api<{ text: string; next: number }>(`/api/experiments/runs/${id}/log?from=${at.current}`, base !== undefined ? { base } : {});
        if (!alive || !r.text) return;
        at.current = r.next;
        // At most the last 400 KB is kept on the page.
        setText((x) => (x + r.text).slice(-400_000));
      } catch {}
    }, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [id, base, going, follow, finding]);
  const lines = useMemo(() => (finding ? text.split('\n').filter((l) => l.toLowerCase().includes(words)) : null), [text, words, finding]);
  const shown = lines ? lines.join('\n') : text;
  useEffect(() => {
    if (follow && !finding && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text, follow, finding]);
  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="relative w-56 max-w-full">
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-3" />
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find in the log" aria-label="Find in the log" className={cx(inputCls, 'h-8 pl-8 text-[12.5px]')} />
        </div>
        {lines && <span className="tnum text-[12px] text-fg-3">{lines.length === 1 ? '1 line matches' : `${lines.length} lines match`}</span>}
        <div className="flex-1" />
        {going && (
          <label className="flex min-h-8 items-center gap-1.5 text-[12px] text-fg-2">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} className="accent-[var(--accent)]" />
            Follow
          </label>
        )}
      </div>
      <pre
        ref={box}
        translate="no"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (!finding && el.scrollHeight - el.scrollTop - el.clientHeight > 40 && follow && going) setFollow(false);
        }}
        className="h-[calc(100dvh-250px)] min-h-[60vh] overflow-auto rounded-xl border border-line bg-[var(--term-bg)] px-3 py-2 font-mono text-[11.5px] leading-[1.55] whitespace-pre-wrap text-[var(--term-fg)] [overflow-wrap:anywhere]"
      >
        {shown || (finding ? '' : going ? 'Nothing yet.' : 'Empty.')}
      </pre>
    </section>
  );
}

/** The page's props (settled with ExperimentsPage). */
export interface RunViewProps {
  id: string;
  machine?: string | null;
  tab: RunTab;
  onTab: (t: RunTab) => void;
  /** Back to its experiment (or the overview). */
  onBack: () => void;
  /** What the way back says: its experiment's title or name ("Overview" for a run without one). */
  backLabel: string;
  onAgain: (r: RunRecord) => void;
  onOpenExperiment: (group: string) => void;
  /** Its experiment's title, description and category, when it has them. */
  info?: ExperimentGroup;
  wide: boolean;
  /** For a run that scores one, or ran in one's folder. */
  evaluations: EvaluationListed[];
  onOpenEvaluation: (id: string, score?: string) => void;
}

export function RunView({ id, machine, tab, onTab, onBack, backLabel, onAgain, onOpenExperiment, info, evaluations, onOpenEvaluation }: RunViewProps) {
  const base = baseOf(machine);
  const [v, setV] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [patch, setPatch] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [confirm, confirmNode] = useConfirm();
  const load = useCallback(
    (lines = 400) =>
      api<View>(`/api/experiments/runs/${id}?lines=${lines}`, base !== undefined ? { base } : {})
        .then((x) => {
          setV((prev) => (prev && lines === 0 ? { ...x, log: prev.log, logSize: prev.logSize } : x));
          setError(null);
        })
        .catch((e) => setError(e instanceof ApiError && e.status === 404 ? 'This run is no longer kept.' : (e as Error).message)),
    [id, base],
  );
  useEffect(() => {
    setV(null);
    setFocus(null);
    load();
  }, [load]);
  // A focused metric is for one visit to the Charts tab.
  useEffect(() => {
    if (tab !== 'charts') setFocus(null);
  }, [tab]);
  const going = !!v && isActive(v.run);
  // A run that ends while the page is open: its whole log is read once more (the one read at load stops where it was then), and the Log shows it.
  const wasGoing = useRef(false);
  const [logRev, setLogRev] = useState(0);
  useEffect(() => {
    const ended = wasGoing.current && !going;
    wasGoing.current = going;
    if (ended) void load(400).then(() => setLogRev((n) => n + 1));
  }, [going, load]);
  // Its record and metrics while it goes (the log follows by itself).
  useEffect(() => {
    if (!going) return;
    const t = window.setInterval(() => load(0), 5000);
    return () => window.clearInterval(t);
  }, [going, load]);
  useFeatureEvent('experiments', (e) => {
    const runs = (e.data as { runs?: string[] })?.runs;
    if (!machine && runs?.includes(id)) load(0);
  });

  // The evaluation this run scores, and which of its scores it is.
  const scored = !machine && v ? scoredBy(v.run) : undefined;
  const scoredName = scored ? (evaluations.find((e) => e.id === scored)?.name ?? v?.run.name?.replace(/ · seed -?\d+$/, '') ?? '') : '';
  const [score, setScore] = useState<string | undefined>();
  useEffect(() => {
    setScore(undefined);
    if (!scored) return;
    let live = true;
    const find = (r: { scores: EvalScore[] }) => {
      const s = r.scores.find((x) => x.runs.includes(id));
      if (live && s) setScore(s.id);
    };
    api<{ scores: EvalScore[] }>(evalUrl(scored))
      .then(find)
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [scored, id]);

  const stop = async () => {
    try {
      await api(`/api/experiments/runs/${id}/stop`, { method: 'POST', body: {}, ...(base !== undefined ? { base } : {}) });
      load(0);
    } catch (e) {
      toastError(e);
    }
  };
  const remove = async () => {
    setMenu(false);
    if (!(await confirm({ title: 'Delete this run’s record?', body: 'Its record, log, patch and metrics go. The files it made in its own folder stay.', confirm: 'Delete', danger: true }))) return;
    try {
      await api(`/api/experiments/runs/${id}`, { method: 'DELETE', ...(base !== undefined ? { base } : {}) });
      onBack();
    } catch (e) {
      toastError(e);
    }
  };
  /** Run again: New run filled in; a run kept on another machine goes there again. */
  const again = () => v && onAgain(machine ? { ...v.run, where: `m:${machine}`, machine: { id: machine, name: v.run.machine?.name ?? machine } } : v.run);
  const showPatch = async () => {
    try {
      const r = await api<{ patch: string | null }>(`/api/experiments/runs/${id}/patch`, base !== undefined ? { base } : {});
      setPatch(r.patch ?? '');
    } catch (e) {
      toastError(e);
    }
  };
  const copyText = async (text: string, said: string) => toast((await copy(text)) ? said : 'Could not copy');

  const r = v?.run;
  // A chart is for a metric with a curve (two points or more), the ones that matter most first; the others are values.
  const metrics = v
    ? rankMetrics(
        Object.keys(v.series).filter((k) => v.series[k].length >= 2),
        () => true,
      )
    : [];
  const last = r?.metrics?.last ?? {};
  const charted = new Set(metrics);
  const values = rankValues(Object.keys(last).filter((k) => !charted.has(k)));
  const progress = r ? progressOf(r) : null;
  const sessionLink = (key: string) => (machine ? goFull(machinePath(machine, sessionPath(key))) : go(sessionPath(key)));
  const local = !machine && !r?.remote;

  const head = (
    <div className="shrink-0">
      <button type="button" onClick={scored ? () => onOpenEvaluation(scored, score) : onBack} className="-ml-1 inline-flex max-w-full min-h-8 items-center gap-1 rounded-md px-1 text-[12.5px] text-fg-3 hover:text-fg">
        <ArrowLeft size={14} className="shrink-0" />
        <span translate="no" className="truncate">
          {scored ? scoredName : backLabel}
        </span>
      </button>
      <div className="flex items-start gap-2">
        <h1 translate="no" className="min-w-0 flex-1 py-0.5 text-[17px] leading-snug font-semibold break-words">
          {r ? r.name || r.id : <span className="inline-block h-5 w-56 max-w-full animate-pulse rounded bg-bg-2 align-middle" />}
        </h1>
        {r && going && (
          <Button size="sm" variant="secondary" icon={<Square size={13} />} onClick={stop} disabled={!!r.stopping}>
            {r.stopping ? 'Stopping' : 'Stop'}
          </Button>
        )}
        {/* A run that scored an evaluation is not run again by itself: the evaluation scores again. */}
        {r && !scored && (
          <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={again} className="max-sm:hidden">
            Run again
          </Button>
        )}
        {r && (
          <>
            <IconButton ref={menuRef} label="More" onClick={() => setMenu((m) => !m)}>
              <MoreHorizontal size={17} />
            </IconButton>
            <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={240}>
              {!scored && (
                <div className="sm:hidden">
                  <MenuItem
                    icon={<RotateCcw size={14} />}
                    onClick={() => {
                      setMenu(false);
                      again();
                    }}
                  >
                    Run again
                  </MenuItem>
                </div>
              )}
              <MenuItem
                icon={<Copy size={14} />}
                onClick={() => {
                  setMenu(false);
                  copyText(r.command, 'Copied the command');
                }}
              >
                Copy the command
              </MenuItem>
              {r.folder && local && (
                <MenuItem
                  icon={<FolderOpen size={14} />}
                  onClick={() => {
                    setMenu(false);
                    showInFiles(r.folder!);
                  }}
                >
                  Its folder in Files
                </MenuItem>
              )}
              {r.folder && local && canReveal() && (
                <MenuItem
                  icon={<FolderOpen size={14} />}
                  onClick={() => {
                    setMenu(false);
                    reveal(r.folder!);
                  }}
                >
                  {revealLabel()}
                </MenuItem>
              )}
              {!going && (
                <>
                  <MenuSep />
                  <MenuItem icon={<Trash2 size={14} />} danger onClick={remove}>
                    Delete the record
                  </MenuItem>
                </>
              )}
            </Popover>
          </>
        )}
      </div>
      {r && (
        <div className="mt-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px]">
            <span className={cx('h-2 w-2 shrink-0 rounded-full', statusTone(r.status))} />
            <span className="font-medium">{statusWords(r)}</span>
            {r.endedAt && r.startedAt && !going && <span className="text-[12.5px] text-fg-3">{`· after ${took(r.endedAt - r.startedAt)}`}</span>}
            {r.exitCode !== undefined && r.exitCode !== null && !going && <span className="text-[12.5px] text-fg-3">{`· exit code ${r.exitCode}`}</span>}
            {[
              // Where it ran: another machine or a cluster by its name, this computer in those words.
              machine || r.where?.startsWith('c:') || r.where?.startsWith('m:') ? { t: [machine ? r.machine?.name : null, r.host].filter(Boolean).join(' · '), own: true } : { t: 'This computer', own: false },
              r.gpuIds?.length ? { t: gpuWords(r.gpuIds), own: false } : r.gpus ? null : { t: 'no GPU', own: false },
              { t: r.startedAt ? `started ${when(r.startedAt)}` : `added ${when(r.createdAt)}`, own: false },
            ]
              .filter((x): x is { t: string; own: boolean } => !!x && !!x.t)
              .map((x, i) => (
                <span key={i} className="text-[12.5px] text-fg-3">
                  {'· '}
                  <span translate={x.own ? 'no' : undefined}>{x.t}</span>
                </span>
              ))}
          </div>
          {progress && (
            <div className="space-y-1">
              <Meter percent={progress.pct} height={5} color="var(--accent)" className="max-w-[320px]" />
              {/* Each part in an element of its own, so each is translated as one. */}
              <p className="tnum text-[12.5px] text-fg-3">
                <span>{`${r.metrics!.progress!.done.toLocaleString(LOCALE)} of ${r.metrics!.progress!.total.toLocaleString(LOCALE)}`}</span>
                <span> · {progress.pct}%</span>
                {progress.left !== undefined && (
                  <>
                    {' · '}
                    <span>{leftWords(progress.left)}</span>
                  </>
                )}
              </p>
            </div>
          )}
          {scored && (
            <button type="button" onClick={() => onOpenEvaluation(scored, score)} className="flex max-w-full items-center gap-1.5 text-left text-[13px] text-accent hover:underline">
              <Gauge size={14} className="shrink-0" />
              <span className="min-w-0 break-words">
                <span>{v?.run.env?.HYDOR_EVAL_KIND === 'final' ? 'The final test of' : 'A score of'}</span>{' '}
                <span translate="no" className="font-medium">
                  {scoredName}
                </span>
              </span>
            </button>
          )}
          {r.why && !saidByStatus(r.why) && (r.status === 'queued' || r.status === 'waiting' || r.status === 'failed' || r.status === 'lost' || r.status === 'stopped') && (
            <p className={cx('rounded-lg border px-3 py-2 text-[13px] leading-relaxed text-fg-2', r.status === 'failed' || r.status === 'lost' ? 'border-err/40 bg-err/5' : 'border-line bg-bg-1')}>{r.why}</p>
          )}
        </div>
      )}
      <Tabs<RunTab>
        dense
        className="mt-2 border-b border-line"
        value={tab}
        onChange={onTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'charts', label: 'Charts', count: metrics.length || undefined },
          { value: 'log', label: 'Log' },
        ]}
      />
    </div>
  );

  let body: React.ReactNode;
  if (error) body = <p className="py-6 text-[13.5px] text-fg-3">{error}</p>;
  else if (!v || !r)
    body = (
      <div className="flex flex-1 items-center justify-center py-16 text-fg-3">
        <Throbber />
      </div>
    );
  else if (tab === 'log') body = <Log key={logRev} id={id} base={base} initial={v.log} size={v.logSize} going={going} />;
  else if (tab === 'charts')
    body = (
      <ChartsPanel
        single
        focus={focus}
        runs={[{ key: runKey({ id, machine: machine ? { id: machine, name: r.machine?.name ?? machine } : undefined }), label: r.name || r.id, color: 'var(--viz-1)', series: v.series, better: r.better, last: r.metrics?.last, best: r.metrics?.best }]}
        empty={going ? 'No metrics over steps yet.' : 'This run has no metrics over steps.'}
      />
    );
  else {
    const tiles = keyMetrics(r, 6);
    const ended = r.status === 'failed' || r.status === 'lost' || (r.status === 'stopped' && r.exitCode !== undefined && r.exitCode !== null && r.exitCode !== 0);
    const tail = v.log.trimEnd().split('\n').slice(-15).join('\n');
    const params = paramsOf(r);
    const paramNames = Object.keys(params);
    const env = Object.entries(r.environment ?? {});
    const where = machine || r.where?.startsWith('c:') || r.where?.startsWith('m:') ? [machine ? r.machine?.name : null, r.host].filter(Boolean).join(' · ') : 'This computer';
    body = (
      <div className="space-y-5">
        {ended && (
          <Block title="How it ended" right={<button type="button" onClick={() => onTab('log')} className="text-[12px] text-accent hover:underline">Open the log</button>}>
            <div className={CARD}>{tail ? <Tail text={tail} /> : <p className="py-1 text-[12.5px] text-fg-3">Its log is empty.</p>}</div>
          </Block>
        )}
        {tiles.length > 0 && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
            {tiles.map((k) => {
              const curve = v.series[k] && v.series[k].length >= 2 ? v.series[k] : null;
              const best = r.metrics?.best?.[k];
              const inner = (
                <>
                  <div translate="no" title={k} className="truncate text-[12px] text-fg-3">
                    {k}
                  </div>
                  <div className="tnum text-[20px] leading-tight font-semibold text-fg">{num(last[k])}</div>
                  <div className="tnum min-h-[16px] text-[11.5px] text-fg-3">{best !== undefined && best !== last[k] ? `best ${num(best)}` : ''}</div>
                  {curve && <Sparkline points={curve} color="var(--viz-1)" height={28} className="mt-1" />}
                </>
              );
              const cls = 'min-w-0 rounded-xl border border-line bg-panel px-3 py-2 text-left';
              return curve ? (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setFocus(k);
                    onTab('charts');
                  }}
                  className={cx(cls, 'transition-colors hover:border-line-2 hover:bg-bg-1')}
                >
                  {inner}
                </button>
              ) : (
                <div key={k} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-5">
            <Block title="Hyperparameters">
              <PairsCard names={paramNames} value={(k) => paramText(params[k])} find={paramNames.length > 16} empty="No hyperparameters were given or read from its command." />
            </Block>
            {values.length > 0 && <Values names={values} last={last} />}
          </div>
          <div className="min-w-0 space-y-5">
            <Block title="Details">
              <div className={CARD}>
                {scored ? (
                  <Row label="Evaluation">
                    <button type="button" onClick={() => onOpenEvaluation(scored, score)} className={linkCls}>
                      <span translate="no">{scoredName}</span>
                    </button>
                  </Row>
                ) : (
                  <Row label="Experiment">
                    <button type="button" onClick={() => onOpenExperiment(r.group ?? '')} className={linkCls}>
                      <span translate="no">{r.group ? info?.title || r.group : 'Runs without an experiment'}</span>
                    </button>
                  </Row>
                )}
                <Row label="Status">{statusWords(r)}</Row>
                {r.when === 'night' && <Row label={trIn('night', 'Start')}>At night</Row>}
                <Row label={r.startedAt ? 'Started' : 'Added'}>
                  <span className="tnum">{when(r.startedAt ?? r.createdAt)}</span>
                </Row>
                {r.endedAt && !going && (
                  <Row label="Ended">
                    <span className="tnum">{when(r.endedAt)}</span>
                  </Row>
                )}
                {r.endedAt && r.startedAt && !going && <Row label="Took">{took(r.endedAt - r.startedAt)}</Row>}
                <Row label="Where">
                  {where === 'This computer' ? where : <span translate="no">{where}</span>}
                </Row>
                <Row label="GPUs">{r.gpuIds?.length ? gpuWords(r.gpuIds) : r.gpus ? (r.gpus === 1 ? '1 GPU' : `${r.gpus} GPUs`) : 'No GPU'}</Row>
                {r.seed !== undefined && (
                  <Row label="Seed">
                    <span className="tnum">{r.seed}</span>
                  </Row>
                )}
                {!!r.priority && (
                  <Row label="Priority">
                    <span className="tnum">{r.priority}</span>
                  </Row>
                )}
                {r.startedBy?.session && (
                  <Row label="Started by">
                    <button type="button" onClick={() => sessionLink(r.startedBy!.session!)} className={linkCls}>
                      A session
                    </button>
                  </Row>
                )}
                {r.from && (
                  <Row label="Again of">
                    <button type="button" onClick={() => go(`/experiments/${r.from}`)} className={cx(linkCls, 'font-mono text-[12px]')}>
                      <span translate="no">{r.from}</span>
                    </button>
                  </Row>
                )}
                {!!r.sealed?.length && <Sealed entries={r.sealed} onOpen={(e) => onOpenEvaluation(e)} />}
              </div>
            </Block>
            {!!(r.commit || r.kept?.length || r.notKept?.length) && (
              <Block title="Code">
                <div className={CARD}>
                  {r.commit && (
                    <>
                      <Row label="Commit">
                        <span className="flex items-center gap-1">
                          <span translate="no" className="font-mono text-[12px]">
                            {r.commit.slice(0, 10)}
                          </span>
                          <IconButton label="Copy the commit" size="sm" onClick={() => copyText(r.commit!, 'Copied the commit')}>
                            <Copy size={13} />
                          </IconButton>
                        </span>
                      </Row>
                      {r.branch && (
                        <Row label="Branch">
                          <span translate="no" className="font-mono text-[12px]">
                            {r.branch}
                          </span>
                        </Row>
                      )}
                      <Row label="Changes">
                        {r.dirty ? (
                          r.patchPath ? (
                            <button type="button" onClick={showPatch} className={linkCls}>
                              See the changes
                            </button>
                          ) : (
                            <span className="text-fg-3">Not committed</span>
                          )
                        ) : (
                          <span className="text-fg-3">Nothing changed since</span>
                        )}
                      </Row>
                      {r.untracked ? <p className="border-t border-line pt-1.5 text-[12px] text-fg-3">{r.untracked === 1 ? '1 file git does not track' : `${r.untracked} files git does not track`}</p> : null}
                    </>
                  )}
                  {!!r.kept?.length && <NotInGit words="Not in git, kept with the run:" files={r.kept} />}
                  {!!r.notKept?.length && <NotInGit words="Not in git and too large to keep:" files={r.notKept} />}
                </div>
              </Block>
            )}
            <Block
              title="Command"
              right={
                <IconButton label="Copy the command" size="sm" onClick={() => copyText(r.command, 'Copied the command')}>
                  <Copy size={13} />
                </IconButton>
              }
            >
              <div className={CARD}>
                <code translate="no" className="block rounded-lg bg-bg-1 px-2.5 py-2 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap">
                  {r.command}
                </code>
                {r.cwd && (
                  <div className="mt-2 space-y-1">
                    <div translate="no" className="font-mono text-[12px] break-all text-fg-2">
                      {r.cwd}
                    </div>
                    {r.folder && local && (
                      <button type="button" onClick={() => showInFiles(r.folder!)} className={cx(linkCls, 'inline-flex items-center gap-1 text-[12px]')}>
                        <FolderOpen size={12} /> Its folder in Files
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Block>
            {env.length > 0 && (
              <Block title="Environment">
                <div className={CARD}>
                  {env.map(([k, x]) => (
                    <Row key={k} label={k}>
                      <span translate="no" className="text-[12px]">
                        {x}
                      </span>
                    </Row>
                  ))}
                </div>
              </Block>
            )}
          </div>
        </div>
        {r.events && r.events.length > 0 && (
          <Block title="What happened">
            <ol className="space-y-1.5">
              {r.events.map((e, i) => (
                <li key={i} className="flex gap-3 text-[12.5px] max-sm:flex-wrap">
                  <span className="tnum w-[92px] shrink-0 text-fg-3">{when(e.at)}</span>
                  <span className={cx('w-[96px] shrink-0 font-medium', ['nan', 'oom', 'crash', 'failed', 'diverge'].includes(e.kind) ? 'text-err' : e.kind === 'stall' ? 'text-warn' : 'text-fg-2')}>{EVENT_WORDS[e.kind] ?? e.kind}</span>
                  <span className="min-w-0 flex-1 text-fg-2 max-sm:basis-full">
                    <span translate="no">{e.text}</span>
                    {e.session && (
                      <>
                        {' '}
                        <button type="button" onClick={() => sessionLink(e.session!)} className="inline-flex items-center gap-0.5 text-accent hover:underline">
                          <Play size={11} /> Open its session
                        </button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          </Block>
        )}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[1200px] flex-col px-5 pt-3 pb-8">
        {head}
        <div className="flex flex-1 flex-col pt-4">{body}</div>
      </div>
      <Dialog open={patch !== null} onClose={() => setPatch(null)} title="The changes it ran with" width={900}>
        {patch ? <DiffView diff={patch} /> : <p className="text-[13px] text-fg-3">The patch is no longer kept.</p>}
      </Dialog>
      {confirmNode}
    </div>
  );
}
