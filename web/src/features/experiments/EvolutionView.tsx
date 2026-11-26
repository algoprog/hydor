// An evolution's page (/experiments?evolution=<id>): what it is for, its state in a line, three numbers (the
// start, the best so far, how many were tried), every try on a chart and what each one changed, newest first.
// &try=<id> opens one. Take the best makes a branch; it asks first.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FlaskConical, MoreHorizontal, Pause, Play, Square, Trash2 } from 'lucide-react';
import type { Candidate, Evolution } from '@shared/evolve';
import { LOCALE } from '../../i18n/locale';
import { trIn } from '../../i18n/runtime';
import { del, post } from '../../lib/api';
import { go } from '../../lib/nav';
import { toastError } from '../../lib/store';
import { Button, cx, Empty, IconButton, MenuItem, Popover, Throbber, useConfirm, useMediaQuery } from '../../components/ui';
import { evaluationPath } from './evalApi';
import { meanStd, toneClass } from './evalWords';
import { EvolutionChart } from './EvolutionChart';
import { TakenAs, TakenDialog, TryDialog } from './EvolutionDialogs';
import { Big, Sub, Tile } from './EvaluationView';
import { evolveUrl, useEvolution, type EvolutionDetail } from './evolveApi';
import {
  askedWords,
  builtOnWords,
  chartData,
  evolveTitle,
  failedWords,
  FINAL_UNSEEN,
  gainStanding,
  isEnded,
  modelWords,
  splitWhy,
  stateLine,
  TAKE_ABOUT,
  tryScore,
  workedMs,
  type StateLine,
} from './evolveWords';

export interface EvolutionViewProps {
  id: string;
  /** The try the address points at. */
  open?: string;
  onTry: (candidate: string | null) => void;
  /** On a phone: back to its evaluation. */
  onBack?: (evaluation: string | undefined) => void;
  onDeleted: (evaluation: string) => void;
}

export function EvolutionView(props: EvolutionViewProps) {
  // Everything about one evolution starts afresh for the next.
  return <Page key={props.id} {...props} />;
}

/** Tries shown at first, and with each Show more. */
const AT_ONCE = 100;

function Page({ id, open, onTry, onBack, onDeleted }: EvolutionViewProps) {
  const { data, error, reload } = useEvolution(id);
  const [confirm, confirmNode] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState(false);
  const [taken, setTaken] = useState<{ branch: string; commit: string } | null>(null);
  const [shown, setShown] = useState(AT_ONCE);
  const wide = useMediaQuery('(min-width: 768px)');

  const candidates = data?.candidates;
  const numbers = useMemo(() => new Map(candidates?.map((c) => [c.id, c.n]) ?? []), [candidates]);
  const chart = useMemo(() => chartData(candidates ?? [], data?.evolution.start?.mean, data?.evaluation?.better ?? 'higher'), [candidates, data?.evolution.start?.mean, data?.evaluation?.better]);
  const pick = useRef(onTry);
  pick.current = onTry;
  const openTry = useCallback((c: string) => pick.current(c), []);

  if (error)
    return (
      <Empty icon={<FlaskConical size={20} />} title="Nothing to show">
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

  const e = data.evolution;
  const best = e.best ? data.candidates.find((c) => c.id === e.best) : undefined;
  const opened = open ? (data.candidates.find((c) => c.id === open) ?? null) : null;

  const act = async (path: 'pause' | 'resume' | 'stop') => {
    setBusy(true);
    try {
      await post(evolveUrl(e.id, `/${path}`));
    } catch (err) {
      toastError(err);
    }
    await reload();
    setBusy(false);
  };
  const stop = async () => {
    if (await confirm({ title: 'Stop for good?', body: 'It cannot be resumed afterwards. What it tried stays, and so does the best. Pause instead to go on later.', confirm: 'Stop' })) void act('stop');
  };
  const take = async (c?: Candidate) => {
    if (!(await confirm({ title: c ? `Take try #${c.n}?` : 'Take the best?', body: TAKE_ABOUT, confirm: c ? 'Take this one' : 'Take the best' }))) return;
    setTaking(true);
    try {
      const r = await post<{ branch: string; commit: string }>(evolveUrl(e.id, '/take'), c ? { candidate: c.id } : {});
      onTry(null);
      setTaken(r);
    } catch (err) {
      toastError(err);
    }
    setTaking(false);
    void reload();
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this evolution?', body: 'Its tries, their scores and its working copies go. A branch you took stays.', confirm: 'Delete', danger: true }))) return;
    try {
      await del(evolveUrl(e.id));
      onDeleted(e.evaluation);
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-4 px-5 pt-4 pb-8">
      <Header
        data={data}
        busy={busy}
        taking={taking}
        onBack={onBack && (() => onBack(e.evaluation))}
        onPause={() => void act('pause')}
        onResume={() => void act('resume')}
        onStop={() => void stop()}
        onTake={() => void take()}
        onDelete={() => void remove()}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StartTile evolution={e} />
        <BestTile evolution={e} best={best} onSee={openTry} />
        <Tile label="Tried">
          <Big>
            <span>{`${e.tried.toLocaleString(LOCALE)} of ${e.candidates.toLocaleString(LOCALE)}`}</span>
          </Big>
          {e.failed > 0 && <Sub>{failedWords(e.failed)}</Sub>}
          {e.calls > 0 && <Sub>{askedWords(e.calls)}</Sub>}
        </Tile>
      </div>

      {isEnded(e) && best && data.finalTest && <p className="text-[12.5px] text-fg-3">{FINAL_UNSEEN}</p>}

      {chart.points.length + chart.failed.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold text-fg">
            <span>Every try</span>
            {data.evaluation && (
              <span translate="no" className="font-mono text-[12px] font-normal text-fg-3">
                {data.evaluation.metric}
              </span>
            )}
          </h3>
          <EvolutionChart data={chart} onPick={openTry} />
        </section>
      )}

      {data.candidates.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-[13px] font-semibold text-fg">What it tried</h3>
          <Tries candidates={data.candidates.slice(0, shown)} numbers={numbers} best={e.best} seeds={e.start?.values.length ?? 1} start={e.start?.mean} wide={wide} onOpen={openTry} />
          {data.candidates.length > shown && (
            <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + AT_ONCE * 2)}>
              {`Show more (${data.candidates.length - shown} older)`}
            </Button>
          )}
        </section>
      )}

      <TryDialog evolution={e} candidate={opened} parent={opened?.parent ? numbers.get(opened.parent) : undefined} onClose={() => onTry(null)} onTake={(c) => void take(c)} taking={taking} />
      <TakenDialog evolution={e} taken={taken} onClose={() => setTaken(null)} />
      {confirmNode}
    </div>
  );
}

// ---- the header ------------------------------------------------------------------------------------------------------

/** The state in one line; while it works, the time it has worked goes on counting. */
function State({ data }: { data: EvolutionDetail }) {
  const e = data.evolution;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (e.status !== 'running') return;
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [e.status]);
  const line: StateLine = stateLine(e, workedMs(e, data.readAt, Math.max(now, data.readAt)));
  const why = splitWhy(line.why);
  const dot = { going: 'bg-accent', paused: 'bg-warn', done: 'bg-ok', stopped: 'bg-fg-3', failed: 'bg-err' }[line.tone];
  return (
    <div className="mt-1 text-[12.5px] text-fg-2">
      <p className="flex items-start gap-2">
        <span aria-hidden className={cx('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
        <span className="min-w-0 break-words">
          {line.parts.map((part, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              <span className={cx(line.tone === 'failed' && 'font-medium text-err')}>{part}</span>
            </span>
          ))}
          {why.first && (
            <>
              {line.tone === 'failed' ? ' ' : ': '}
              <span>{why.first}</span>
            </>
          )}
        </span>
      </p>
      {why.rest && (
        <pre translate="no" className="mt-1.5 max-h-40 overflow-auto rounded-lg border border-line bg-panel px-3 py-2 font-mono text-[11.5px] leading-snug whitespace-pre-wrap text-fg-2">
          {why.rest}
        </pre>
      )}
    </div>
  );
}

function Header({ data, busy, taking, onBack, onPause, onResume, onStop, onTake, onDelete }: { data: EvolutionDetail; busy: boolean; taking: boolean; onBack?: () => void; onPause: () => void; onResume: () => void; onStop: () => void; onTake: () => void; onDelete: () => void }) {
  const e = data.evolution;
  const [menu, setMenu] = useState(false);
  const [whole, setWhole] = useState(false);
  const menuRef = useRef<HTMLButtonElement>(null);
  const title = evolveTitle(e);
  return (
    <div className="flex flex-col gap-x-3 gap-y-2.5 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        {onBack && (
          <IconButton label="Back" onClick={onBack} className="-ml-2 shrink-0">
            <ArrowLeft size={17} />
          </IconButton>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] tracking-wide text-fg-3 uppercase">
            <span className="shrink-0">Evolve</span>
            {data.evaluation && (
              <>
                <span>·</span>
                <button type="button" onClick={() => go(evaluationPath(data.evaluation!.id))} translate="no" className="min-w-0 truncate text-left uppercase hover:text-accent hover:underline">
                  {data.evaluation.name}
                </button>
              </>
            )}
          </div>
          {/* A long aim is cut to two lines; a click or tap shows all of it. */}
          <h2 className="text-[18px] leading-snug font-semibold">
            <button type="button" aria-expanded={whole} onClick={() => setWhole((v) => !v)} className="block w-full text-left">
              <span translate="no" className={cx('break-words', whole ? 'block whitespace-pre-wrap' : 'line-clamp-2')}>
                {title}
              </span>
            </button>
          </h2>
          {e.aim && (
            <p translate="no" className="truncate font-mono text-[12px] text-fg-3" title={e.files.join(', ')}>
              {e.files.join(', ')}
            </p>
          )}
          <State data={data} />
        </div>
      </div>
      {/* On a phone the buttons take the whole width, so they stay on one line. */}
      <div className="flex min-w-0 shrink-0 flex-col gap-1.5 sm:items-end">
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          {e.status === 'running' && (
            <Button size="sm" variant="secondary" icon={<Pause size={14} />} onClick={onPause} disabled={busy}>
              Pause
            </Button>
          )}
          {e.status === 'paused' && (
            <Button size="sm" variant="secondary" icon={<Play size={14} />} onClick={onResume} disabled={busy}>
              Resume
            </Button>
          )}
          {!isEnded(e) && (
            <Button size="sm" variant="secondary" icon={<Square size={13} />} onClick={onStop} disabled={busy}>
              Stop
            </Button>
          )}
          {e.best && (
            <Button size="sm" variant={e.taken?.candidate === e.best ? 'secondary' : 'primary'} onClick={onTake} disabled={taking}>
              Take the best
            </Button>
          )}
          <IconButton ref={menuRef} label="This evolution" onClick={() => setMenu((o) => !o)}>
            <MoreHorizontal size={17} />
          </IconButton>
          <Popover anchor={menuRef} open={menu} onClose={() => setMenu(false)} align="end" width={200} title="This evolution" sheet>
            <MenuItem
              icon={<Trash2 size={14} />}
              danger
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
            >
              Delete…
            </MenuItem>
          </Popover>
        </div>
        {e.taken && <TakenAs evolution={e} taken={e.taken} className="max-w-[280px] sm:text-right" />}
      </div>
    </div>
  );
}

// ---- the tiles -------------------------------------------------------------------------------------------------------

function StartTile({ evolution: e }: { evolution: Evolution }) {
  const seeds = e.start?.values.length ?? 0;
  const commit = e.startCommit.slice(0, 7);
  return (
    <Tile label={trIn('evolve', 'Start')}>
      {e.start ? (
        <Big>
          <span translate="no">{meanStd(e.start)}</span>
        </Big>
      ) : (
        <Big muted>{isEnded(e) ? 'Not scored' : 'Scoring…'}</Big>
      )}
      <Sub>
        {seeds > 0 && <span>{seeds === 1 ? '1 seed' : `${seeds} seeds`}</span>}
        {seeds > 0 && <span> · </span>}
        <span translate="no" className="font-mono text-[11.5px] [overflow-wrap:anywhere]">
          {e.branch ? `${e.branch} @ ${commit}` : commit}
        </span>
      </Sub>
    </Tile>
  );
}

function BestTile({ evolution: e, best, onSee }: { evolution: Evolution; best?: Candidate; onSee: (id: string) => void }) {
  const standing = best && gainStanding(best.gain, e.start?.mean);
  return (
    <Tile label="Best so far">
      {best?.full ? (
        <>
          <Big>
            <span translate="no">{meanStd(best.full)}</span>
          </Big>
          {standing && <p className={cx('text-[13px] leading-snug font-medium', toneClass(standing.tone))}>{standing.long}</p>}
          {best.summary && (
            <p translate="no" title={best.summary} className="line-clamp-2 text-[12px] leading-snug break-words text-fg-2">
              {best.summary}
            </p>
          )}
          <button type="button" onClick={() => onSee(best.id)} className="self-start text-left text-[12.5px] text-accent hover:underline">
            See the change
          </button>
        </>
      ) : (
        <>
          <Big muted>None yet</Big>
          {e.tried > 0 && <Sub>{isEnded(e) ? 'No try beat the start.' : 'No try has beaten the start.'}</Sub>}
        </>
      )}
    </Tile>
  );
}

// ---- what it tried ---------------------------------------------------------------------------------------------------

interface RowProps {
  c: Candidate;
  /** The number of the try it was made from; none: the start. */
  parent?: number;
  isBest: boolean;
  seeds: number;
  start?: number;
  onOpen: (id: string) => void;
}

function Mark({ c, isBest }: { c: Candidate; isBest: boolean }) {
  if (!isBest && !c.bestWhenScored) return null;
  return <span className={cx('mr-1.5 inline-block rounded-full px-1.5 py-px text-[11px] font-medium whitespace-nowrap', isBest ? 'bg-ok/15 text-ok' : 'bg-bg-2 text-fg-2')}>{isBest ? 'Best' : 'New best'}</span>;
}

/** What a try changed: the model's line, or what is happening before there is one. */
function Summary({ c, isBest }: { c: Candidate; isBest: boolean }) {
  return (
    <>
      <Mark c={c} isBest={isBest} />
      {c.summary ? (
        <span translate="no" className="break-words">
          {c.summary}
        </span>
      ) : (
        <span className="text-fg-3">{c.status === 'proposing' ? 'A change is being written' : 'No change was made'}</span>
      )}
    </>
  );
}

/** Why it failed, cut to two lines; a tap shows all of its first paragraph. */
function Why({ why }: { why: string }) {
  const [all, setAll] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={all}
      onClick={(e) => {
        e.stopPropagation();
        setAll((v) => !v);
      }}
      className="block w-full text-left"
    >
      <span className={cx('break-words', all ? 'block' : 'line-clamp-2')}>
        <span className="font-medium text-err">Failed:</span> <span>{splitWhy(why).first}</span>
      </span>
    </button>
  );
}

function Score({ c, seeds }: { c: Candidate; seeds: number }) {
  const s = tryScore(c, seeds);
  if (s.failed) return c.why ? <Why why={c.why} /> : <span className="font-medium text-err">Failed</span>;
  return (
    <>
      {s.value && (
        <span translate="no" className="tnum block font-medium whitespace-nowrap text-fg">
          {s.value}
        </span>
      )}
      {s.note && <span className="block text-[11.5px] text-fg-3">{s.note}</span>}
      {!s.value && !s.note && <span className="text-fg-3">–</span>}
    </>
  );
}

function Against({ c, start }: { c: Candidate; start?: number }) {
  const s = gainStanding(c.gain, start);
  return s ? <span className={toneClass(s.tone)}>{s.long}</span> : <span className="text-fg-3">–</span>;
}

const TD = 'border-b border-line px-3 py-2 align-top group-last:border-b-0';

const TableRow = memo(function TableRow({ c, parent, isBest, seeds, start, onOpen }: RowProps) {
  return (
    <tr className="group cursor-pointer hover:bg-bg-1" onClick={() => onOpen(c.id)}>
      <td className={cx(TD, 'tnum whitespace-nowrap')}>
        {/* The row's own button, for the keyboard and screen readers. */}
        <button type="button" aria-label={`Open try #${c.n}`} onClick={(e) => (e.stopPropagation(), onOpen(c.id))} className="text-accent hover:underline">
          {`#${c.n}`}
        </button>
      </td>
      <td className={cx(TD, 'w-full min-w-[180px] text-fg-2')}>
        <Summary c={c} isBest={isBest} />
      </td>
      <td className={cx(TD, c.status === 'failed' ? 'min-w-[220px]' : 'whitespace-nowrap')}>
        <Score c={c} seeds={seeds} />
      </td>
      <td className={cx(TD, 'whitespace-nowrap')}>
        <Against c={c} start={start} />
      </td>
      <td className={cx(TD, 'whitespace-nowrap text-fg-2')}>{builtOnWords(parent)}</td>
      <td className={cx(TD, 'whitespace-nowrap text-fg-2')}>{modelWords(c.model)}</td>
    </tr>
  );
});

const Card = memo(function Card({ c, parent, isBest, seeds, start, onOpen }: RowProps) {
  const s = gainStanding(c.gain, start);
  return (
    <li className="cursor-pointer rounded-xl border border-line bg-panel px-3 py-2.5 text-[12.5px]" onClick={() => onOpen(c.id)}>
      <div className="flex items-start gap-2">
        <button type="button" aria-label={`Open try #${c.n}`} onClick={(e) => (e.stopPropagation(), onOpen(c.id))} className="tnum shrink-0 text-accent">
          {`#${c.n}`}
        </button>
        <div className="min-w-0 flex-1 text-[13px] text-fg-2">
          <Summary c={c} isBest={isBest} />
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <div className={cx(c.status === 'failed' ? 'w-full' : '[&>span]:inline [&>span+span]:ml-1.5')}>
          <Score c={c} seeds={seeds} />
        </div>
        {s && <span className={toneClass(s.tone)}>{s.long}</span>}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-1.5 text-[12px] text-fg-3">
        <span>
          <span>Built on</span> <span>{parent === undefined ? trIn('evolve', 'the start') : `#${parent}`}</span>
        </span>
        <span>·</span>
        <span>{modelWords(c.model)}</span>
      </div>
    </li>
  );
});

const TH = 'border-b border-line px-3 py-2 text-left text-[11.5px] font-medium whitespace-nowrap text-fg-3';

/** The tries: a table on a wide screen, cards on a narrow one. Only the rows that changed are drawn again. */
function Tries({ candidates, numbers, best, seeds, start, wide, onOpen }: { candidates: Candidate[]; numbers: Map<string, number>; best?: string; seeds: number; start?: number; wide: boolean; onOpen: (id: string) => void }) {
  const props = (c: Candidate): RowProps => ({ c, parent: c.parent ? numbers.get(c.parent) : undefined, isBest: c.id === best, seeds, start, onOpen });
  if (wide)
    return (
      <div className="overflow-x-auto rounded-xl border border-line bg-panel">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className={TH}>#</th>
              <th className={TH}>What it changed</th>
              <th className={TH}>Score</th>
              <th className={TH}>Against the start</th>
              <th className={TH}>Built on</th>
              <th className={TH}>Model</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => (
              <TableRow key={c.id} {...props(c)} />
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <ul className="space-y-2">
      {candidates.map((c) => (
        <Card key={c.id} {...props(c)} />
      ))}
    </ul>
  );
}
