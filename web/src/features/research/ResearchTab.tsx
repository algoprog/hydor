// A project's Research tab: one morning brief, top to bottom. Waiting for you (what needs the person, answered or opened
// where it belongs), Since you last looked (what the agents did: findings, runs, searches, goals, a new best), Where it
// stands (each evaluation's scores over time against its baseline), Running and waiting, and This week. One call reads it
// all (GET /api/projects/:id/research); it refreshes when runs change and every 30 seconds, and tells the app once it has
// been shown that the person looked (POST …/research/seen), so what was new stays marked for this visit and the next starts
// from now. words.ts says what each part reads; the evaluation's own dialogs and handlers do what its buttons do.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import type { EvalFolder, Evaluation } from '@shared/evaluations';
import type { ResearchBrief, ResearchEvaluation, ResearchWait } from '@shared/project-research';
import type { Space } from '@shared/spaces';
import { Meter } from '../../components/charts';
import { Badge, Button, cx, Empty, Throbber, useConfirm } from '../../components/ui';
import { api, ApiError, enc, post } from '../../lib/api';
import { useFeatureEvent } from '../../lib/featureEvents';
import { go, openSession } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { evalUrl, evaluationPath } from '../experiments/evalApi';
import { experimentPath, runPath } from '../experiments/api';
import { betterWords, SEAL_AGAIN, SETUP_REQUEST, toneClass } from '../experiments/evalWords';
import { ChangesDialog, FinalDialog } from '../experiments/EvaluationDialogs';
import { EvaluationEditor } from '../experiments/EvaluationEditor';
import { evolutionPath, evolveUrl } from '../experiments/evolveApi';
import { VerdictPill } from '../memory/Finding';
import { startInSpace } from '../spaces/parts';
import { ChartLegend, ResearchChart } from './ResearchChart';
import {
  chartModel,
  chartSummary,
  facts,
  fold,
  groupByDay,
  moreWords,
  newsHeading,
  newsLine,
  nothingNew,
  NEWS_SHOWN,
  type NewsLine,
  type Opens,
  type Part,
  sinceWords,
  showMoreWords,
  standLine,
  waitCard,
  WAITING_SHOWN,
  weekWords,
  workCount,
  workLines,
  type WorkLine,
} from './words';

/** The seconds between looks while the tab is shown. */
const EVERY = 30_000;

// ---- what it reads ---------------------------------------------------------------------------------------------------------

/**
 * The brief, read again when runs change and every 30 seconds. What it shows as new is fixed on the first look of the visit
 * (the later reads ask for news from the same moment), and once it is shown the app is told the person looked.
 */
function useBrief(id: string): { brief: ResearchBrief | null; error: string | null; reload: () => void; visit: { since: number; seen: number | null } | null } {
  const [brief, setBrief] = useState<ResearchBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visit = useRef<{ since: number; seen: number | null } | null>(null);
  const [shown, setShown] = useState<{ since: number; seen: number | null } | null>(null);
  const turn = useRef(0);
  const latest = useRef<number>(0);
  const load = useCallback(async () => {
    const mine = ++turn.current;
    try {
      const b = await api<ResearchBrief>(`/api/projects/${enc(id)}/research${visit.current ? `?since=${visit.current.since}` : ''}`);
      if (mine !== turn.current) return;
      latest.current = b.at;
      if (!visit.current) {
        visit.current = { since: b.since, seen: b.seen };
        setShown(visit.current);
        post(`/api/projects/${enc(id)}/research/seen`, { at: b.at }).catch(() => {});
      }
      setBrief(b);
      setError(null);
    } catch (e) {
      if (mine !== turn.current) return;
      // A read that fails after the page has one keeps what it shows.
      setError(e instanceof ApiError && e.status === 404 ? 'This project has no research to show.' : (e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    visit.current = null;
    setShown(null);
    setBrief(null);
    void load();
    const t = window.setInterval(() => void load(), EVERY);
    return () => {
      window.clearInterval(t);
      turn.current++;
      // The brief the person saw last is what they looked at: the next visit starts there.
      if (visit.current && latest.current) post(`/api/projects/${enc(id)}/research/seen`, { at: latest.current }).catch(() => {});
    };
  }, [id, load]);
  const timer = useRef<number | null>(null);
  const soon = useCallback(() => {
    if (timer.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void load();
    }, 800);
  }, [load]);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  useFeatureEvent('experiments', soon);
  useFeatureEvent('memory', soon);
  return { brief, error: brief ? null : error, reload: soon, visit: shown };
}

// ---- small pieces ------------------------------------------------------------------------------------------------------------

/**
 * A sentence's parts: the words, each in an element of its own so the page's translator takes each as it is written (side
 * by side they would be read as one sentence), the names people and agents gave untranslated.
 */
function Parts({ parts }: { parts: Part[] }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} translate="no">
            {p.name}
          </span>
        ),
      )}
    </>
  );
}

/** A part of the page: its small heading (with how many it holds), what leads further at the right, and what it holds. */
function Section({ title, count, right, children }: { title: string; count?: number; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <h3 className="mb-1.5 flex items-baseline justify-between gap-2 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">
        <span className="min-w-0 truncate">
          {title}
          {count !== undefined && <span>{` · ${count}`}</span>}
        </span>
        {right && <span className="shrink-0 font-normal tracking-normal normal-case">{right}</span>}
      </h3>
      {children}
    </section>
  );
}

const box = 'min-w-0 rounded-xl border border-line bg-panel';
const link = 'text-[12.5px] font-normal text-accent hover:underline';

// ---- waiting for you ---------------------------------------------------------------------------------------------------------

interface Handlers {
  project: string;
  /** The card is at work (its id), so its buttons wait. */
  busy: string | null;
  run: (id: string, fn: () => Promise<unknown>) => void;
  reload: () => void;
  seeChanges: (evaluation: string) => void;
  finalTest: (evaluation: string) => void;
}

function Actions({ w, h }: { w: ResearchWait; h: Handlers }) {
  const off = h.busy === w.id;
  const btn = (label: string, onClick: () => void, primary = false, extra?: string) => (
    <Button key={label} size="sm" variant={primary ? 'primary' : 'secondary'} disabled={off} onClick={onClick} className={extra}>
      {label}
    </Button>
  );
  switch (w.kind) {
    case 'held':
      return (
        <>
          {btn(
            w.runs.length === 1 ? 'Let it run' : 'Let them run',
            () =>
              h.run(w.id, async () => {
                for (const id of w.runs) await post(`/api/experiments/runs/${enc(id)}/let-run`);
              }),
            true,
          )}
          {btn('Change the limit…', () => go('/experiments?places=1'))}
        </>
      );
    case 'held-search':
      return (
        <>
          {btn('Let it run', () => h.run(w.id, () => post(evolveUrl(w.evolution.id, '/let-run'))), true)}
          {btn('Open it', () => go(evolutionPath(w.evolution.id)))}
        </>
      );
    case 'ask': {
      const q = w.question;
      return (
        <>
          {q?.choices.map((c, i) =>
            btn(
              c.description ? `${c.label} · ${c.description}` : c.label,
              () => h.run(w.id, () => post(`/api/sessions/${enc(w.session.key)}/approvals/${enc(w.approval)}`, { decision: 'answer', answers: { [q.id]: c.label } })),
              i === 0,
              'h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal',
            ),
          )}
          {btn('Answer in the session', () => openSession(w.session.key), !q)}
        </>
      );
    }
    case 'goal':
      return btn(w.status === 'paused' ? 'Open the session' : 'Answer in the session', () => openSession(w.session.key), true);
    case 'sealed':
      return btn('See what changed', () => h.seeChanges(w.evaluation.id), true);
    case 'baseline':
      return (
        <>
          {btn(
            'Measure the baseline',
            () =>
              h.run(w.id, async () => {
                try {
                  await post(evalUrl(w.evaluation.id, '/baseline'));
                } catch (e) {
                  // Sealed files that differ stop it: what changed is shown, as the evaluation's page does.
                  if (e instanceof ApiError && e.status === 409 && e.data?.changed) h.seeChanges(w.evaluation.id);
                  else throw e;
                }
              }),
            true,
          )}
          {btn('Open it', () => go(evaluationPath(w.evaluation.id)))}
        </>
      );
    case 'final':
      return (
        <>
          {btn('Run the final test…', () => h.finalTest(w.evaluation.id), true)}
          {btn('Not yet', () => h.run(w.id, () => post(`/api/projects/${enc(h.project)}/research/later`, { evaluation: w.evaluation.id })))}
        </>
      );
    case 'paused':
      return (
        <>
          {btn('Resume', () => h.run(w.id, () => post(evolveUrl(w.evolution.id, '/resume'))), true)}
          {btn('Open it', () => go(evolutionPath(w.evolution.id)))}
        </>
      );
  }
}

function WaitingCard({ w, h, now }: { w: ResearchWait; h: Handlers; now: number }) {
  const c = waitCard(w, now);
  const session = w.kind === 'ask' || w.kind === 'goal' ? w.session.key : null;
  return (
    <div className={cx(box, 'flex flex-col border-warn/45 p-3')}>
      <div className="text-[13.5px] leading-snug font-semibold break-words">
        <Parts parts={c.title} />
      </div>
      {c.detail && (
        <div className="mt-1 text-[12.5px] leading-snug text-fg-3 break-words">
          <Parts parts={c.detail} />
        </div>
      )}
      {c.where && (
        <div className="mt-1 text-[12.5px] leading-snug text-fg-3">
          {c.where.text}{' '}
          <button type="button" translate="no" onClick={() => session && openSession(session)} className="max-w-full text-left break-words text-fg-2 underline underline-offset-2 hover:text-fg">
            {c.where.name}
          </button>
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-2.5">
        <Actions w={w} h={h} />
      </div>
    </div>
  );
}

// ---- since you last looked ---------------------------------------------------------------------------------------------------

function NewsRow({ line, onOpen }: { line: NewsLine; onOpen: (o: Opens) => void }) {
  return (
    <button type="button" onClick={() => onOpen(line.opens)} className="flex w-full min-w-0 flex-col gap-x-3 gap-y-0.5 px-3 py-2 text-left transition-colors hover:bg-bg-1 sm:flex-row sm:items-baseline sm:justify-between">
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug break-words">
        {line.pill && ('verdict' in line.pill ? <VerdictPill verdict={line.pill.verdict} className="mr-1.5 align-[1px]" /> : <Badge tone="err" className="mr-1.5 !rounded-full px-2 align-[1px]">Failed</Badge>)}
        <Parts parts={line.parts} />
      </span>
      {line.action ? <span className={cx(link, 'shrink-0')}>{line.action}</span> : <span className="tnum shrink-0 text-[12px] text-fg-3">{line.meta}</span>}
    </button>
  );
}

function News({ brief, visit, onOpen }: { brief: ResearchBrief; visit: { since: number; seen: number | null }; onOpen: (o: Opens) => void }) {
  const [all, setAll] = useState(false);
  const first = visit.seen === null;
  const lines = useMemo(() => brief.news.filter((n) => n.at >= visit.since).map(newsLine), [brief.news, visit.since]);
  const { shown, more } = fold(lines, NEWS_SHOWN, all);
  const groups = groupByDay(shown, brief.at);
  return (
    <Section title={newsHeading(first)} right={visit.seen !== null ? <span className="text-fg-3">{sinceWords(visit.seen, brief.at)}</span> : undefined}>
      {lines.length === 0 ? (
        <div className={cx(box, 'px-3 py-2.5 text-[13px] text-fg-3')}>{nothingNew(visit.seen, brief.at)}</div>
      ) : (
        <div className={cx(box, 'divide-y divide-line overflow-hidden')}>
          {groups.map((g) => (
            <div key={g.day ?? 'all'} className="divide-y divide-line">
              {g.day && <div className="bg-bg-1 px-3 py-1 text-[12px] text-fg-3">{g.day}</div>}
              {g.items.map((l) => (
                <NewsRow key={l.id} line={l} onOpen={onOpen} />
              ))}
            </div>
          ))}
          {more > 0 && (
            <button type="button" onClick={() => setAll(true)} className={cx(link, 'block w-full px-3 py-2 text-left')}>
              {showMoreWords(more)}
            </button>
          )}
        </div>
      )}
    </Section>
  );
}

// ---- where it stands ---------------------------------------------------------------------------------------------------------

function Stands({ brief, onFindings, onNew, onAsk }: { brief: ResearchBrief; onFindings: () => void; onNew: () => void; onAsk: () => void }) {
  const list = brief.evaluations;
  const [pick, setPick] = useState<string | null>(null);
  const e: ResearchEvaluation | undefined = list.find((x) => x.id === pick) ?? list[0];
  const model = useMemo(() => (e ? chartModel(e, brief.at) : null), [e, brief.at]);
  if (!e)
    return (
      <Section title="Where it stands">
        <div className={cx(box, 'flex flex-col items-center px-4 py-5 text-center')}>
          <div className="text-[14px] font-semibold">This project has no way of keeping score yet</div>
          <div className="mt-1 max-w-[440px] text-[13px] leading-relaxed text-fg-3">With an evaluation, every result here is compared with the same baseline, and this page draws how the score moved.</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" variant="primary" onClick={onNew}>
              New evaluation…
            </Button>
            <Button size="sm" variant="secondary" onClick={onAsk}>
              Ask an agent to set one up
            </Button>
          </div>
        </div>
      </Section>
    );
  const st = standLine(e);
  const f = facts(e, brief.findings);
  return (
    <Section title="Where it stands">
      <div className={cx(box, 'p-3')}>
        {list.length > 1 && (
          <div role="radiogroup" aria-label="Evaluation" className="mb-2 flex flex-wrap gap-1.5">
            {list.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === e.id}
                translate="no"
                onClick={() => setPick(x.id)}
                className={cx('max-w-full truncate rounded-full border px-2.5 py-0.5 text-[12.5px]', x.id === e.id ? 'border-accent/50 bg-accent-soft font-semibold text-fg' : 'border-line text-fg-3 hover:text-fg')}
              >
                {x.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="min-w-0 flex-1 basis-[180px]">
            <button type="button" translate="no" onClick={() => go(evaluationPath(e.id))} className="text-left text-[14px] font-semibold break-words hover:underline">
              {e.name}
            </button>{' '}
            {st.standing ? (
              <span className={cx('ml-1 inline-block rounded-full border border-line px-2 py-px align-[1px] text-[11.5px]', toneClass(st.standing.tone))}>{st.standing.long}</span>
            ) : (
              <span className="ml-1 text-[12.5px] text-fg-3">{e.scores.length ? 'Not compared with a baseline yet' : 'No score yet'}</span>
            )}
          </div>
          <div className="text-[12px] text-fg-3">{[betterWords(e.better), st.final].filter(Boolean).join(' · ')}</div>
        </div>
        {model && (e.scores.length > 0 || e.failed.length > 0) ? (
          <>
            <ResearchChart model={model} label={chartSummary(e)} onPick={(score) => go(evaluationPath(e.id, score))} />
            <ChartLegend model={model} />
          </>
        ) : (
          <p className="mt-2 text-[13px] text-fg-3">{e.baseline ? 'The baseline is measured. The first score will show here.' : 'Nothing has been scored yet.'}</p>
        )}
        <div className="mt-2.5 grid grid-cols-2 items-start gap-x-3.5 gap-y-2 border-t border-line pt-2.5 sm:grid-cols-4">
          {f.map((x) => {
            const inner = (
              <>
                <span className="block text-[12px] text-fg-3">{x.label}</span>
                <span className="block text-[14px] leading-snug font-semibold break-words">{x.value}</span>
                {x.sub && (
                  <span translate={x.name ? 'no' : undefined} className="block text-[12px] leading-snug break-words text-fg-3">
                    {x.sub}
                  </span>
                )}
              </>
            );
            return x.opens ? (
              <button key={x.label} type="button" onClick={onFindings} className="min-w-0 text-left hover:underline">
                {inner}
              </button>
            ) : (
              <div key={x.label} className="min-w-0">
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

// ---- running and waiting, and this week --------------------------------------------------------------------------------------

function Work({ brief, onOpen }: { brief: ResearchBrief; onOpen: (l: WorkLine) => void }) {
  const lines = workLines(brief.work, brief.at);
  const n = workCount(brief.work);
  return (
    <Section
      title="Running and waiting"
      count={n || undefined}
      right={
        <button type="button" onClick={() => go('/experiments')} className={link}>
          Experiments
        </button>
      }
    >
      {lines.length === 0 ? (
        <div className={cx(box, 'px-3 py-2.5 text-[13px] text-fg-3')}>Nothing runs or waits.</div>
      ) : (
        <div className={cx(box, 'divide-y divide-line overflow-hidden')}>
          {lines.map((l) => (
            <button key={l.id} type="button" onClick={() => onOpen(l)} className="flex w-full min-w-0 flex-col gap-x-3 gap-y-0.5 px-3 py-2 text-left transition-colors hover:bg-bg-1 sm:flex-row sm:items-baseline sm:justify-between">
              <span className="min-w-0 flex-1 text-[13.5px] leading-snug break-words">
                <Parts parts={l.parts} />
                {l.small && <span className="ml-1.5 text-[12px] text-fg-3">{l.small}</span>}
              </span>
              {l.state && <span className="tnum shrink-0 text-[12px] text-fg-2">{l.state}</span>}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function Week({ brief }: { brief: ResearchBrief }) {
  const w = weekWords(brief.week);
  return (
    <Section title="This week">
      <div className={cx(box, 'px-3 py-2.5')}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span className="tnum text-[13.5px] font-medium">{w.hours}</span>
          <span className="text-[12px] text-fg-3">{w.models}</span>
        </div>
        {w.limit && (
          <>
            <Meter percent={w.limit.percent} height={4} color={w.limit.percent >= 100 ? 'var(--warn)' : 'var(--accent)'} className="mt-1.5" />
            <p className="mt-1 text-[12px] text-fg-3">{w.limit.note}</p>
          </>
        )}
      </div>
    </Section>
  );
}

// ---- the tab -----------------------------------------------------------------------------------------------------------------

/**
 * `onFinding`: shows a finding (or all of them) in the project's Memory tab, which is the page's to open.
 */
export function ResearchTab({ s, onFinding }: { s: Space; onFinding: (note?: number) => void }) {
  const { brief, error, reload, visit } = useBrief(s.id);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, confirmNode] = useConfirm();
  const [changes, setChanges] = useState<Evaluation | null>(null);
  const [final, setFinal] = useState<{ evaluation: Evaluation; folders: EvalFolder[] } | null>(null);
  const [editor, setEditor] = useState(false);

  const read = (id: string) => api<{ evaluation: Evaluation; folders: EvalFolder[] }>(evalUrl(id));
  const handlers: Handlers = {
    project: s.id,
    busy,
    reload,
    run: (id, fn) => {
      setBusy(id);
      fn()
        .catch(toastError)
        .finally(() => {
          setBusy(null);
          reload();
        });
    },
    seeChanges: (id) => void read(id).then((r) => setChanges(r.evaluation), toastError),
    finalTest: (id) => void read(id).then((r) => setFinal(r), toastError),
  };
  const sealAgain = async (): Promise<boolean> => {
    if (!changes || !(await confirm({ title: 'Seal again?', body: SEAL_AGAIN, confirm: 'Seal again' }))) return false;
    try {
      await post(evalUrl(changes.id, '/seal'));
      toast('Sealed');
      return true;
    } catch (e) {
      toastError(e);
      return false;
    } finally {
      reload();
    }
  };
  /** The final test, as the evaluation's own dialog asks for it: a refusal because files differ shows what changed. */
  const runFinal = async (folder?: string) => {
    const ev = final?.evaluation;
    setFinal(null);
    if (!ev) return;
    try {
      await post(evalUrl(ev.id, '/final'), folder ? { folder } : {});
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.data?.changed) setChanges(ev);
      else toastError(e);
    } finally {
      reload();
    }
  };
  const open = (o: Opens) => {
    if (o.kind === 'finding') onFinding(o.number);
    else if (o.kind === 'experiment') go(experimentPath(o.group));
    else if (o.kind === 'evolution') go(evolutionPath(o.id));
    else if (o.kind === 'session') openSession(o.key);
    else if (o.kind === 'evaluation') go(evaluationPath(o.id));
    else go('/experiments');
  };
  const openWork = (l: WorkLine) => {
    const o = l.opens;
    if (!o) return;
    if (o.kind === 'run') go(runPath({ id: o.id }));
    else if (o.kind === 'evolution') go(evolutionPath(o.id));
    else if (o.kind === 'session') openSession(o.key);
    else go('/experiments');
  };

  if (error)
    return (
      <Empty icon={<FlaskConical size={20} />} title="Research could not be read">
        <p>{error}</p>
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </div>
      </Empty>
    );
  if (!brief || !visit)
    return (
      <div className="flex justify-center py-16 text-fg-3">
        <Throbber />
      </div>
    );

  const { shown, more } = fold(brief.waiting, WAITING_SHOWN, all);
  return (
    <div data-i18n="research" className="space-y-4">
      <Section title="Waiting for you" count={brief.waiting.length || undefined}>
        {brief.waiting.length === 0 ? (
          <div className={cx(box, 'px-3 py-2.5 text-[13px] text-fg-3')}>Nothing is waiting for you.</div>
        ) : (
          <>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr))]">
              {shown.map((w) => (
                <WaitingCard key={w.id} w={w} h={handlers} now={brief.at} />
              ))}
            </div>
            {more > 0 && (
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => setAll(true)}>
                  {moreWords(more)}
                </Button>
              </div>
            )}
          </>
        )}
      </Section>
      <News brief={brief} visit={visit} onOpen={open} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Stands brief={brief} onFindings={() => onFinding()} onNew={() => setEditor(true)} onAsk={() => startInSpace(s, SETUP_REQUEST)} />
        <div className="min-w-0 space-y-4">
          <Work brief={brief} onOpen={openWork} />
          <Week brief={brief} />
        </div>
      </div>
      {changes && <ChangesDialog evaluation={changes} ask={{}} onClose={() => setChanges(null)} onSealAgain={sealAgain} onChanged={reload} />}
      <FinalDialog open={!!final} runs={final?.evaluation.finals ?? 0} folders={final?.folders ?? []} onClose={() => setFinal(null)} onRun={(folder) => void runFinal(folder)} />
      <EvaluationEditor open={editor} folder={s.folder} onClose={() => setEditor(false)} onSaved={(ev) => (setEditor(false), reload(), go(evaluationPath(ev.id)))} />
      {confirmNode}
    </div>
  );
}
