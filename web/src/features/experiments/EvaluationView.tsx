// An evaluation's page (/experiments?evaluation=<id>): what it scores, whether its sealed files are as they
// were, its three numbers (the baseline, the latest score, the final test), the scores over time, its evolutions and
// the list of scores. Score now puts its runs in line; &score=<id> shows one of the scores. Evolve… in its menu starts
// an evolution.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronRight, FlaskConical, Lock, MoreHorizontal, Pencil, Play, Sprout, Trash2 } from 'lucide-react';
import { TEST_READABLE, type EvalRestored, type EvalScore, type Evaluation } from '@shared/evaluations';
import { ApiError, del, post, put } from '../../lib/api';
import { folderName } from '../../lib/folderNames';
import { go, sessionPath } from '../../lib/nav';
import { toast, toastError, useApp } from '../../lib/store';
import { Button, cx, Empty, IconButton, MenuBack, MenuItem, MenuSep, Popover, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { ScoreChart } from './EvalChart';
import { evalUrl, scoreUrl, useEvaluation, type EvaluationDetail } from './evalApi';
import {
  baselineTile,
  betterWords,
  canPutBack,
  chanceWords,
  changedSummary,
  chartScores,
  filesWords,
  finalRunsWords,
  finalTile,
  isOpen,
  latestScore,
  meanStd,
  openWords,
  SEAL_AGAIN,
  sealDate,
  seedsWords,
  standing,
  toneClass,
} from './evalWords';
import { ChangesDialog, FinalDialog, FolderDialog, type ChangesAsk } from './EvaluationDialogs';
import type { EditorSection } from './EvaluationEditor';
import { evolutionPath, useEvolutions, type ListedEvolution } from './evolveApi';
import { EvolveDialog } from './EvolveDialog';
import { evolveTitle, isGoing, rowWords } from './evolveWords';
import { agoWords, fullDate } from './Sidebar';

export interface EvaluationViewProps {
  id: string;
  /** The score the address points at. */
  marked?: string;
  /** On a phone: back to the Overview. */
  onBack?: () => void;
  onEdit: (evaluation: Evaluation, section?: EditorSection) => void;
  onOpenRun: (run: string) => void;
  /** Its score picked on the chart. */
  onMark: (score: string) => void;
  onDeleted: () => void;
  /** Changes when the editor saved it, so it is read again at once. */
  version?: number;
}

export function EvaluationView(props: EvaluationViewProps) {
  // Everything about one evaluation starts afresh for the next.
  return <Page key={props.id} {...props} />;
}

type Detail = EvaluationDetail;

function Page({ id, marked, onBack, onEdit, onOpenRun, onMark, onDeleted, version }: EvaluationViewProps) {
  const { data, error, reload } = useEvaluation(id);
  const home = useApp((s) => s.boot?.home) ?? '';
  const [confirm, confirmNode] = useConfirm();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const [choose, setChoose] = useState(false);
  const [final, setFinal] = useState(false);
  const [changes, setChanges] = useState<ChangesAsk | null>(null);
  const [busy, setBusy] = useState<'score' | 'seal' | 'restore' | null>(null);
  const [fullCommand, setFullCommand] = useState(false);
  const [evolve, setEvolve] = useState(false);
  const evolutions = useEvolutions(id);
  const wide = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    if (version) void reload();
  }, [version, reload]);

  if (error)
    return (
      <Empty icon={<FlaskConical size={20} />} title="No evaluation to show">
        <p>{error}</p>
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={() => go('/experiments')}>
            Back to the Overview
          </Button>
        </div>
      </Empty>
    );
  if (!data)
    return (
      <div className="flex justify-center py-16 text-fg-3">
        <Throbber />
      </div>
    );

  const ev = data.evaluation;
  const seeds = seedsWords(ev);
  const base = baselineTile(ev, data.scores);
  const nothingYet = base.state === 'none' && !data.scores.some((s) => s.seal === ev.seal.n);

  /** Puts runs in line; a refusal because files differ opens what changed. */
  const start = async (url: string, folder?: string) => {
    setChoose(false);
    setFinal(false);
    setBusy('score');
    try {
      await post(url, folder ? { folder } : {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data?.changed) setChanges({ folder });
      else toastError(e);
    } finally {
      setBusy(null);
      void reload();
    }
  };
  const scoreNow = () => (data.folders.length > 1 ? setChoose(true) : void start(evalUrl(id, '/scores')));
  const measure = () => void start(evalUrl(id, '/baseline'));

  const sealAgain = async (): Promise<boolean> => {
    if (!(await confirm({ title: 'Seal again?', body: SEAL_AGAIN, confirm: 'Seal again' }))) return false;
    setBusy('seal');
    try {
      await post(evalUrl(id, '/seal'));
      toast('Sealed');
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      setBusy(null);
      void reload();
    }
  };
  const putBack = async () => {
    setBusy('restore');
    try {
      const r = await post<EvalRestored>(evalUrl(id, '/restore'));
      if (r.left.length) setChanges({ restored: r });
      else toast(r.restored.length === 1 ? 'Put back 1 file.' : `Put back ${r.restored.length} files.`);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(null);
      void reload();
    }
  };
  const remove = async () => {
    const n = data.scores.length + data.finals.length;
    const body = n === 0 ? 'It has no scores yet. The files in its folder stay.' : n === 1 ? 'Its score and its runs go. The files in its folder stay.' : `Its ${n} scores and their runs go. The files in its folder stay.`;
    if (!(await confirm({ title: `Delete ${ev.name}?`, body, confirm: 'Delete', danger: true }))) return;
    try {
      await del(evalUrl(id));
      onDeleted();
    } catch (e) {
      toastError(e);
    }
  };
  const act = (fn: () => void) => () => {
    setMenu(false);
    fn();
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-5 pt-4 pb-8">
      <div className="flex flex-col gap-x-3 gap-y-2.5 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          {onBack && (
            <IconButton label="Back" onClick={onBack} className="-ml-2 shrink-0">
              <ArrowLeft size={17} />
            </IconButton>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] tracking-wide text-fg-3 uppercase">
              <span className="shrink-0">Evaluation</span>
              <span>·</span>
              <span translate="no" title={ev.cwd} className="truncate">
                {folderName(ev.cwd, home)}
              </span>
            </div>
            <h2 translate="no" className="text-[18px] leading-snug font-semibold break-words">
              {ev.name}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-fg-3">
              <span translate="no" className="font-mono text-fg-2">
                {ev.metric}
              </span>
              <span>·</span>
              <span>{betterWords(ev.better)}</span>
              {seeds && (
                <>
                  <span>·</span>
                  <span>{seeds}</span>
                </>
              )}
            </p>
            {/* One line, cut; a click or tap shows all of it. */}
            <button type="button" aria-expanded={fullCommand} aria-label="The command" onClick={() => setFullCommand((o) => !o)} className="mt-0.5 block max-w-full text-left">
              <span translate="no" className={cx('block font-mono text-[12px] text-fg-2', fullCommand ? 'break-all whitespace-pre-wrap' : 'truncate')}>
                {ev.command}
              </span>
            </button>
          </div>
        </div>
        <div className={cx('flex shrink-0 items-center gap-1.5', onBack && 'max-sm:pl-8')}>
          <Button size="sm" variant={nothingYet ? 'secondary' : 'primary'} icon={<Play size={14} />} onClick={scoreNow} disabled={busy === 'score'}>
            Score now
          </Button>
          <IconButton ref={menuRef} label="This evaluation" onClick={() => setMenu((o) => !o)}>
            <MoreHorizontal size={17} />
          </IconButton>
          <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={250} title="This evaluation" sheet>
            {ev.final && (
              <MenuItem icon={<FlaskConical size={14} />} onClick={act(() => setFinal(true))}>
                Run the final test…
              </MenuItem>
            )}
            <MenuItem icon={<Sprout size={14} />} onClick={act(() => setEvolve(true))}>
              Evolve…
            </MenuItem>
            <MenuItem icon={<Pencil size={14} />} onClick={act(() => onEdit(ev))}>
              Edit…
            </MenuItem>
            <MenuItem icon={<Lock size={14} />} onClick={act(() => void sealAgain())}>
              Seal again…
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Trash2 size={14} />} danger onClick={act(() => void remove())}>
              Delete…
            </MenuItem>
          </Popover>
        </div>
      </div>

      <SealLine ev={ev} busy={busy} onSee={() => setChanges({})} onPutBack={putBack} onSeal={() => void sealAgain()} />

      <Tiles data={data} onMeasure={measure} onFinal={() => setFinal(true)} onAddFinal={() => onEdit(ev, 'final')} onOpenRun={onOpenRun} busy={busy === 'score'} />

      <Chart data={data} onMark={onMark} />

      <Evolutions evolutions={evolutions} />

      <Scores data={data} marked={marked} wide={wide} onOpenRun={onOpenRun} reload={reload} confirm={confirm} />

      <EvolveDialog open={evolve} evaluation={ev} baseline={base.state} onMeasure={measure} onClose={() => setEvolve(false)} onStarted={(e) => (setEvolve(false), go(evolutionPath(e.id)))} />

      <FolderDialog folders={choose ? data.folders : null} onClose={() => setChoose(false)} onPick={(folder) => void start(evalUrl(id, '/scores'), folder)} />
      <FinalDialog open={final} runs={ev.finals} folders={data.folders} onClose={() => setFinal(false)} onRun={(folder) => void start(evalUrl(id, '/final'), folder)} />
      <ChangesDialog evaluation={ev} ask={changes} onClose={() => setChanges(null)} onSealAgain={sealAgain} onChanged={() => void reload()} />
      {confirmNode}
    </div>
  );
}

// ---- the seal --------------------------------------------------------------------------------------------------------

function SealLine({ ev, busy, onSee, onPutBack, onSeal }: { ev: Evaluation; busy: string | null; onSee: () => void; onPutBack: () => void; onSeal: () => void }) {
  if (busy === 'seal')
    return (
      <p className="flex items-center gap-2 text-[13px] text-fg-3">
        <Throbber size={14} />
        <span>Sealing…</span>
      </p>
    );
  if (ev.state.ok)
    return (
      <p className="flex items-start gap-2 text-[13px] text-fg-2">
        <Lock size={14} className="mt-0.5 shrink-0 text-fg-3" />
        <span>{`Sealed ${sealDate(ev.seal.at)}: ${filesWords(ev.seal.files)}, all as they were`}</span>
      </p>
    );
  const c = changedSummary(ev.state);
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3">
      <div className="flex items-start gap-2 text-[13px] leading-relaxed text-fg">
        <AlertTriangle size={15} className="mt-[3px] shrink-0 text-warn" />
        <p className="min-w-0">
          <span className="font-medium">{c.count === 1 ? '1 file changed since it was sealed:' : `${c.count} files changed since it was sealed:`}</span>{' '}
          {c.names.map((name, i) => (
            <span key={i}>
              {i > 0 && ', '}
              <span translate="no" className="font-mono text-[12.5px] [overflow-wrap:anywhere]">
                {name}
              </span>
              {c.held[i] && (
                <>
                  {' '}
                  <span className="text-fg-3">(held-out)</span>
                </>
              )}
            </span>
          ))}
          {c.more > 0 && <span>{` and ${c.more} more`}</span>}. <span>Scores wait until they are back.</span>
        </p>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 sm:pl-[23px]">
        <Button size="sm" variant="secondary" onClick={onSee}>
          See what changed
        </Button>
        {canPutBack(ev.state) && (
          <Button size="sm" variant="secondary" onClick={onPutBack} disabled={busy === 'restore'}>
            Put them back
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onSeal}>
          Seal again…
        </Button>
      </div>
    </div>
  );
}

// ---- the three tiles -------------------------------------------------------------------------------------------------

export function Tile({ label, menu, children }: { label: string; menu?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line bg-panel p-3.5">
      <div className="flex h-6 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg-3">{label}</h3>
        {menu}
      </div>
      {children}
    </div>
  );
}

export const Big = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => <p className={cx('tnum leading-tight font-semibold break-words', muted ? 'text-[17px] text-fg-2' : 'text-[22px] text-fg')}>{children}</p>;
export const Sub = ({ children }: { children: React.ReactNode }) => <p className="text-[12px] leading-snug text-fg-3">{children}</p>;

/** "3 seeds · main @ abc1234": what a score was measured over and where. */
function Measured({ s }: { s: EvalScore }) {
  const n = s.seeds.length;
  return (
    <Sub>
      {n > 0 && <span>{n === 1 ? '1 seed' : `${n} seeds`}</span>}
      {n > 0 && (s.branch || s.commit) && <span> · </span>}
      <Where s={s} />
    </Sub>
  );
}

/** "main @ abc1234" in the mono face; the folder's name where there is no git. */
function Where({ s }: { s: EvalScore }) {
  const home = useApp((st) => st.boot?.home) ?? '';
  const commit = s.commit?.slice(0, 7);
  // A long branch wraps; the commit stays whole.
  return (
    <span translate="no" title={s.folder} className="font-mono text-[11.5px] [overflow-wrap:anywhere]">
      {s.branch || (!commit && folderName(s.folder, home))}
      {commit && <span className="whitespace-nowrap">{s.branch ? ` @ ${commit}` : commit}</span>}
    </span>
  );
}

const lookCls = 'self-start text-left text-[12.5px] text-accent hover:underline';

function Tiles({ data, onMeasure, onFinal, onAddFinal, onOpenRun, busy }: { data: Detail; onMeasure: () => void; onFinal: () => void; onAddFinal: () => void; onOpenRun: (run: string) => void; busy: boolean }) {
  const ev = data.evaluation;
  const base = baselineTile(ev, data.scores);
  const last = latestScore(ev, data.scores);
  const going = data.scores.find((s) => s.kind === 'score' && s.seal === ev.seal.n && isOpen(s));
  const final = finalTile(ev, data.finals);
  const against = standing(last?.against);
  const chance = chanceWords(last?.against);
  const failedBase = base.state === 'none' ? data.scores.find((s) => s.kind === 'baseline' && s.seal === ev.seal.n) : undefined;
  const ref = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState(false);
  const running = (s: EvalScore) => openWords(s, data.done[s.id] ?? 0);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile
        label="Baseline"
        menu={
          base.state === 'measured' && (
            <>
              <IconButton ref={ref} label="The baseline" size="sm" onClick={() => setMenu((o) => !o)} className="-my-1 -mr-1.5">
                <MoreHorizontal size={15} />
              </IconButton>
              <Popover anchor={ref} open={menu} onClose={() => setMenu(false)} align="end" width={200}>
                <MenuItem
                  icon={<Play size={14} />}
                  disabled={!!base.again || busy}
                  onClick={() => {
                    setMenu(false);
                    onMeasure();
                  }}
                >
                  Measure again
                </MenuItem>
              </Popover>
            </>
          )
        }
      >
        {base.state === 'measured' ? (
          <>
            <Big>
              <span translate="no">{meanStd(base.score!)}</span>
            </Big>
            <Measured s={base.score!} />
            {base.again && <Sub>Measuring again…</Sub>}
          </>
        ) : base.state === 'measuring' ? (
          <>
            <Big muted>Measuring…</Big>
            <Sub>{running(base.score!)}</Sub>
          </>
        ) : (
          <>
            <Big muted>Not measured yet</Big>
            {failedBase?.status === 'failed' && <Sub>The last try failed: the scores below say why.</Sub>}
            <div className="mt-1.5">
              <Button size="sm" variant="primary" onClick={onMeasure} disabled={busy}>
                Measure the baseline
              </Button>
            </div>
          </>
        )}
      </Tile>

      <Tile label="Latest score">
        {last ? (
          <>
            <Big>
              <span translate="no">{meanStd(last)}</span>
            </Big>
            <Sub>
              <Where s={last} />
            </Sub>
            {against && <p className={cx('text-[13px] leading-snug font-medium', toneClass(against.tone))}>{against.long}</p>}
            {chance && <Sub>{chance}</Sub>}
          </>
        ) : (
          <Big muted>No score yet</Big>
        )}
        {going && <Sub>{last ? 'Another is being scored…' : 'Scoring…'}</Sub>}
      </Tile>

      <Tile label="Final test">
        {final.state === 'unset' ? (
          <>
            <Big muted>None set</Big>
            <button type="button" onClick={onAddFinal} className={lookCls}>
              Add one
            </button>
          </>
        ) : final.state === 'unrun' ? (
          <>
            <Big muted>Not run yet</Big>
            <div className="mt-1.5">
              <Button size="sm" variant="secondary" onClick={onFinal} disabled={busy}>
                Run the final test…
              </Button>
            </div>
          </>
        ) : final.state === 'running' ? (
          <>
            <Big muted>Running…</Big>
            <Sub>{finalRunsWords(ev.finals)}</Sub>
          </>
        ) : (
          <>
            {final.state === 'done' ? (
              <Big>
                <span translate="no">{meanStd(final.score!)}</span>
              </Big>
            ) : (
              <>
                <Big muted>{final.score!.status === 'stopped' ? 'Stopped' : 'Failed'}</Big>
                {final.score!.why && <Sub>{final.score!.why}</Sub>}
              </>
            )}
            <Sub>{finalRunsWords(ev.finals)}</Sub>
            {final.score!.runs[0] && (
              <button type="button" onClick={() => onOpenRun(final.score!.failedRun ?? final.score!.runs[0])} className={lookCls}>
                Look at the run
              </button>
            )}
          </>
        )}
        {ev.testReadable && <Sub>{TEST_READABLE}</Sub>}
      </Tile>
    </div>
  );
}

function Chart({ data, onMark }: { data: Detail; onMark: (id: string) => void }) {
  const ev = data.evaluation;
  const shown = useMemo(() => chartScores(ev, data.scores), [ev, data.scores]);
  if (shown.length < 2) return null;
  const base = baselineTile(ev, data.scores);
  return (
    <section>
      <h3 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-fg">
        <span>Scores over time</span>
        <span translate="no" className="font-mono text-[12px] font-normal text-fg-3">
          {ev.metric}
        </span>
      </h3>
      <ScoreChart scores={shown} baseline={base.state === 'measured' ? base.score!.mean : undefined} onPick={onMark} />
    </section>
  );
}

// ---- its evolutions --------------------------------------------------------------------------------------------------

/** One row for each evolution this evaluation scored: what it is for, its state, when. */
function Evolutions({ evolutions }: { evolutions: ListedEvolution[] }) {
  if (!evolutions.length) return null;
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-fg">Evolve</h3>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
        {evolutions.map((e) => {
          const words = rowWords(e);
          const when = e.endedAt ?? e.createdAt;
          return (
            <li key={e.id}>
              <button type="button" onClick={() => go(evolutionPath(e.id))} className="flex w-full flex-col gap-x-3 gap-y-0.5 px-3 py-2.5 text-left transition-colors hover:bg-bg-1 sm:flex-row sm:items-center">
                <span translate="no" className="min-w-0 flex-1 text-[13px] font-medium text-fg max-sm:line-clamp-2 sm:truncate">
                  {evolveTitle(e)}
                </span>
                <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-2">
                  {isGoing(e) && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                  <span className="tnum min-w-0">
                    <span>{words.text}</span>
                    {words.standing && (
                      <>
                        <span> · </span>
                        <span className={toneClass(words.standing.tone)}>{words.standing.long}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className="tnum shrink-0 text-[12px] text-fg-3 sm:w-[76px] sm:text-right" title={fullDate(when)}>
                  {agoWords(when)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---- the scores ------------------------------------------------------------------------------------------------------

type Confirm = ReturnType<typeof useConfirm>[0];

interface RowProps {
  s: EvalScore;
  data: Detail;
  /** Of an older seal: never compared, and nothing is taken from it. */
  old?: boolean;
  onOpenRun: (run: string) => void;
  reload: () => Promise<void>;
  confirm: Confirm;
}

function AskedBy({ by }: { by: EvalScore['by'] }) {
  const words = by.who === 'you' ? 'You' : by.who === 'agent' ? 'An agent' : by.who === 'goal' ? 'A goal' : 'An app';
  return by.session ? (
    <button type="button" onClick={() => go(sessionPath(by.session!))} className="text-left text-accent hover:underline">
      {words}
    </button>
  ) : (
    <span>{words}</span>
  );
}

/** The score itself: its number, how far it is, or why there is none. */
function Result({ s, data, old, onOpenRun, reload, confirm }: RowProps) {
  if (s.status === 'done')
    return (
      <span translate="no" className="tnum font-medium whitespace-nowrap text-fg">
        {meanStd(s)}
      </span>
    );
  if (isOpen(s)) return <span className="tnum whitespace-nowrap text-fg-2">{openWords(s, data.done[s.id] ?? 0)}</span>;
  const use = async (name: string) => {
    // Sealing again takes the files as they are, changed ones too: said as Seal again says it.
    const body = (
      <>
        <span>It seals again.</span> <span>{SEAL_AGAIN}</span>
      </>
    );
    if (!(await confirm({ title: `Use “${name}” as the number?`, body, confirm: 'Use it' }))) return;
    try {
      await put(evalUrl(data.evaluation.id), { metric: name });
    } catch (e) {
      toastError(e);
    }
    void reload();
  };
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-fg-2">
        <span className={cx('font-medium', s.status === 'failed' && 'text-err')}>{s.status === 'failed' ? 'Failed:' : 'Stopped'}</span> {s.status === 'failed' && <span>{s.why}</span>}
      </p>
      {s.failedRun && (
        <button type="button" onClick={() => onOpenRun(s.failedRun!)} className="text-left text-accent hover:underline">
          Look at the run
        </button>
      )}
      {!old && !!s.printed?.length && s.seal === data.evaluation.seal.n && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-fg-3">It printed:</span>
          {s.printed.slice(0, 12).map((name) => (
            <button key={name} type="button" translate="no" onClick={() => void use(name)} className="rounded-full border border-line-2 px-2 py-0.5 font-mono text-[11.5px] text-fg hover:bg-bg-2">
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Against({ s, data }: { s: EvalScore; data: Detail }) {
  const ev = data.evaluation;
  if (s.id === ev.baseline) return <span className="font-medium text-fg-2">The baseline</span>;
  const a = standing(s.against);
  if (a) return <span className={toneClass(a.tone)}>{a.long}</span>;
  if (s.kind === 'baseline') return <span className="text-fg-3">{isOpen(s) ? 'Measuring the baseline' : 'A measure of the baseline'}</span>;
  return <span className="text-fg-3">–</span>;
}

function When({ s }: { s: EvalScore }) {
  return (
    <span className="tnum whitespace-nowrap text-fg-2" title={fullDate(s.createdAt)}>
      {agoWords(s.createdAt)}
    </span>
  );
}

function Place({ s }: { s: EvalScore }) {
  return (
    <span className="min-w-0 text-fg-2">
      <Where s={s} />
      {s.dirty && <span className="block text-[11.5px] text-fg-3">with changes not committed</span>}
    </span>
  );
}

/** A score's menu: its runs, use it as the baseline, stop it, delete it. */
function ScoreMenu({ s, data, old, onOpenRun, reload, confirm }: RowProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [runs, setRuns] = useState(false);
  const close = () => {
    setOpen(false);
    setRuns(false);
  };
  const act = (fn: () => Promise<unknown>) => async () => {
    close();
    try {
      await fn();
    } catch (e) {
      toastError(e);
    }
    void reload();
  };
  const canBase = !old && s.status === 'done' && s.id !== data.evaluation.baseline && s.seal === data.evaluation.seal.n;
  const openRuns = () => {
    if (s.runs.length === 1) {
      close();
      onOpenRun(s.runs[0]);
    } else setRuns(true);
  };
  return (
    <>
      <IconButton ref={ref} label="This score" size="sm" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={15} />
      </IconButton>
      <Popover anchor={ref} open={open} onClose={close} align="end" width={220}>
        {runs ? (
          <>
            <MenuBack onClick={() => setRuns(false)}>Its runs</MenuBack>
            {s.runs.map((run, i) => (
              <MenuItem
                key={run}
                onClick={() => {
                  close();
                  onOpenRun(run);
                }}
              >
                {s.seeds[i] === undefined ? `Run ${i + 1}` : `Seed ${s.seeds[i]}`}
              </MenuItem>
            ))}
          </>
        ) : (
          <>
            <MenuItem disabled={!s.runs.length} onClick={openRuns}>
              Open its runs
            </MenuItem>
            {canBase && (
              <MenuItem
                onClick={act(async () => {
                  await post(evalUrl(data.evaluation.id, '/baseline'), { score: s.id });
                  toast('This score is the baseline now');
                })}
              >
                Use as the baseline
              </MenuItem>
            )}
            {isOpen(s) ? (
              <MenuItem onClick={act(() => post(scoreUrl(s.id, '/stop')))}>Stop</MenuItem>
            ) : (
              <>
                <MenuSep />
                <MenuItem
                  danger
                  onClick={act(async () => {
                    if (await confirm({ title: 'Delete this score?', body: 'It and the records of its runs go.', confirm: 'Delete', danger: true })) await del(scoreUrl(s.id));
                  })}
                >
                  Delete
                </MenuItem>
              </>
            )}
          </>
        )}
      </Popover>
    </>
  );
}

const TH = 'border-b border-line px-3 py-2 text-left text-[11.5px] font-medium whitespace-nowrap text-fg-3';
const TD = 'border-b border-line px-3 py-2.5 align-top group-last:border-b-0';

/** The scores of one seal: a table on a wide screen, cards on a narrow one. */
function ScoreList({ scores, marked, wide, ...rest }: { scores: EvalScore[]; marked?: string; wide: boolean } & Omit<RowProps, 's'>) {
  const tone = (s: EvalScore) => (s.id === marked ? 'bg-accent-soft' : '');
  if (wide)
    return (
      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={TH}>When</th>
              <th className={TH}>Where</th>
              <th className={TH}>Asked by</th>
              <th className={TH}>Score</th>
              {!rest.old && <th className={TH}>Against the baseline</th>}
              <th className={cx(TH, 'w-10')}>
                <span className="sr-only">More</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.id} data-score={s.id} aria-current={s.id === marked ? 'true' : undefined} className={cx('group', tone(s))}>
                <td className={TD}>
                  <When s={s} />
                </td>
                <td className={TD}>
                  <Place s={s} />
                </td>
                <td className={cx(TD, 'whitespace-nowrap text-fg-2')}>
                  <AskedBy by={s.by} />
                </td>
                <td className={cx(TD, 'max-w-[340px]')}>
                  <Result s={s} {...rest} />
                </td>
                {!rest.old && (
                  <td className={TD}>
                    <Against s={s} data={rest.data} />
                  </td>
                )}
                <td className={cx(TD, 'py-1.5 text-right')}>
                  <ScoreMenu s={s} {...rest} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <ul className="space-y-2">
      {scores.map((s) => (
        <li key={s.id} data-score={s.id} aria-current={s.id === marked ? 'true' : undefined} className={cx('rounded-xl border bg-panel px-3 py-2.5 text-[12.5px]', s.id === marked ? 'border-accent' : 'border-line')}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="text-[13px]">
                <Result s={s} {...rest} />
              </div>
              {!rest.old && (s.status === 'done' || s.kind === 'baseline') && (
                <div>
                  <Against s={s} data={rest.data} />
                </div>
              )}
            </div>
            <div className="-mt-1 -mr-1.5 shrink-0">
              <ScoreMenu s={s} {...rest} />
            </div>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 text-[12px] text-fg-3">
            <When s={s} />
            <span>·</span>
            <AskedBy by={s.by} />
            <span>·</span>
            <Place s={s} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Scores({ data, marked, wide, onOpenRun, reload, confirm }: { data: Detail; marked?: string; wide: boolean; onOpenRun: (run: string) => void; reload: () => Promise<void>; confirm: Confirm }) {
  const ev = data.evaluation;
  const now = data.scores.filter((s) => s.seal === ev.seal.n);
  const before = data.scores.filter((s) => s.seal !== ev.seal.n);
  const markedBefore = before.some((s) => s.id === marked);
  const [open, setOpen] = useState(false);
  const showBefore = open || markedBefore;
  const box = useRef<HTMLElement>(null);
  // The score the address points at comes into view, once it is there.
  const there = !!marked && data.scores.some((s) => s.id === marked);
  useLayoutEffect(() => {
    if (!there) return;
    box.current?.querySelector(`[data-score="${CSS.escape(marked!)}"]`)?.scrollIntoView({ block: 'center' });
  }, [marked, there]);
  const common = { data, wide, onOpenRun, reload, confirm, marked };
  if (!data.scores.length) return null;
  return (
    <section ref={box} className="space-y-2">
      <h3 className="text-[13px] font-semibold text-fg">Scores</h3>
      {now.length ? <ScoreList scores={now} {...common} /> : <p className="text-[13px] text-fg-3">None since it was sealed again.</p>}
      {before.length > 0 && (
        <div className="pt-1">
          <button type="button" aria-expanded={showBefore} onClick={() => setOpen(!showBefore)} className="flex min-h-8 items-center gap-1 text-[12.5px] text-fg-3 hover:text-fg-2">
            {showBefore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>Before it was sealed again</span>
            <span className="tnum">{before.length}</span>
          </button>
          {showBefore && (
            <div className="mt-1 opacity-60">
              <ScoreList scores={before} {...common} old />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
