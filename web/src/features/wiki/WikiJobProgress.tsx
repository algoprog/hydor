// What a project's wiki is doing at a person's request, as a panel or as the body of a card: a build from the project's history, a
// rebuild, an update. A title, a bar, the steps (done, the one being read with "4 of 10", later ones; a build reads what matters most
// first and lists the rest on one line), what it reads now, about how long is left, and Stop (with a question, as what is written
// stays). A stopped job says where it stopped, with Continue; a failed one says why, with Try again; a finished one says what it made.
// The 'card' variant is for the card of a session that waits for its project's memory: compact, no frame of its own and no buttons
// (the card has its own Start now and Stop building). Under 480 px wide the buttons are full width and 44 px tall.
// The 'bar' variant is one line for a project's Memory tab: what it is doing, about how long is left, a thin bar, its action
// (Stop, Continue, Try again, or × once it ended) and Details, which shows the steps.
import { Check, ChevronDown, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button, cx, IconButton, Throbber, useConfirm } from '../../components/ui';
import { enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { tr } from '../../i18n/runtime';
import { useWikiJob, type WikiJob, type WikiStep } from './wikiJob';

const KEEP = 'wiki.job.dismissed.';
const dismissedKey = (job: WikiJob) => `${job.kind}:${job.startedAt}:${job.state}`;
const wasDismissed = (project: string, job: WikiJob) => {
  try {
    return localStorage.getItem(KEEP + project) === dismissedKey(job);
  } catch {
    return false;
  }
};

/** A step as a line: "The sessions that matter most · 4 of 10". */
function stepLabel(s: WikiStep, build: boolean): string {
  const base =
    s.id === 'files'
      ? tr('An overview of the project, from its files')
      : s.id === 'notes'
        ? tr('Notes from memory')
        : s.id === 'sessions'
          ? s.essential && build
            ? tr('The sessions that matter most')
            : tr('Conversations')
          : s.id === 'commits'
            ? s.count != null
              ? tr(`Commits (${s.count})`)
              : tr('Commits')
            : s.id === 'documents'
              ? tr('Documents')
              : s.id === 'organise'
                ? tr('Organising the areas')
                : s.id === 'hubs'
                  ? tr('Writing the hubs')
                  : tr('Earlier sources');
  return s.total > 1 ? tr(`${base} · ${s.done} of ${s.total}`) : base;
}

/** The later steps of a build on one line: "28 more sessions, 412 commits, 9 documents". */
function laterLine(steps: WikiStep[]): string {
  const parts: string[] = [];
  for (const s of steps) {
    const left = s.total - s.done;
    if (left <= 0) continue;
    if (s.id === 'sessions') parts.push(left === 1 ? tr('1 more session') : tr(`${left} more sessions`));
    else if (s.id === 'commits') parts.push(s.count != null ? (s.count === 1 ? tr('1 commit') : tr(`${s.count} commits`)) : tr('more commits'));
    else if (s.id === 'documents') parts.push(left === 1 ? tr('1 document') : tr(`${left} documents`));
    else if (s.id === 'notes') parts.push(tr('notes'));
    else if (s.id === 'files') parts.push(tr('project files'));
    else parts.push(left === 1 ? tr('1 more source') : tr(`${left} more sources`));
  }
  return parts.join(', ');
}

const timeLeft = (m: number): string => (m >= 90 ? tr(`about ${Math.round(m / 60)} h left`) : tr(`about ${Math.max(1, m)} min left`));

function Dot({ state }: { state: 'done' | 'now' | 'later' }) {
  return (
    <span
      aria-hidden
      className={`mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] ${state === 'done' ? 'border-ok text-ok' : state === 'now' ? 'border-accent' : 'border-line-2'}`}
    >
      {state === 'done' ? <Check size={10} strokeWidth={3} /> : state === 'now' ? <span className="h-[7px] w-[7px] rounded-full bg-accent" /> : null}
    </span>
  );
}

/** The title follows the state: a finished job says what it did ("Built memory from history"), a running, stopped or failed one what it is. */
const titleOf = (job: WikiJob) =>
  job.state === 'done'
    ? job.kind === 'build'
      ? tr('Built memory from history')
      : job.kind === 'rebuild'
        ? tr('Rebuilt the wiki')
        : tr('Updated the wiki')
    : job.kind === 'build'
      ? tr('Building memory from history')
      : job.kind === 'rebuild'
        ? tr('Rebuilding the wiki')
        : tr('Updating the wiki');
const phoneBtn = 'max-[479px]:min-h-11 max-[479px]:w-full';

/** `shared`: the job and its refresh, when the page already follows the job (it then is not asked for twice). */
export function WikiJobProgress({ project, variant = 'panel', onStopped, shared }: { project: string; variant?: 'panel' | 'card' | 'bar'; onStopped?: () => void; shared?: [WikiJob | null, () => void] }) {
  const own = useWikiJob(project, !shared);
  const [job, refresh] = shared ?? own;
  const [details, setDetails] = useState(false);
  const [ask, confirmNode] = useConfirm();
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const card = variant === 'card';
  const bar = variant === 'bar';
  useEffect(() => setGone(false), [project, job?.startedAt]);
  if (!job || job.state === 'idle' || job.kind === 'reorganise' || gone) return null;
  if (!card && job.state !== 'running' && wasDismissed(project, job)) return null;
  const running = job.state === 'running';
  const p = job.progress;
  const build = p?.essentials != null;
  const act = async (url: string, body?: object, after?: () => void) => {
    setBusy(true);
    try {
      await post(url, body ?? {});
      after?.();
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const base = `/api/projects/${enc(project)}/wiki`;
  const stop = async () => {
    if (await ask({ title: tr('Stop?'), body: tr('What is written stays; you can continue later.'), confirm: tr('Stop') })) await act(`${base}/stop`, {}, onStopped);
  };
  const resumable = job.kind === 'build' || job.kind === 'rebuild';
  const tryAgain = () => (resumable ? act(`${base}/continue`) : act(`${base}/update`, job.parts ? { parts: job.parts } : {}));
  const dismiss = () => {
    try {
      localStorage.setItem(KEEP + project, dismissedKey(job));
    } catch {
      /* not kept: it shows again next time */
    }
    setGone(true);
  };
  const pct = job.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const left = running && p ? (p.minutesLeftEssentials ?? p.minutesLeft) : 0;
  // The steps: a build lists what matters first and the rest on one line; a rebuild and an update list every step.
  const steps = (p?.steps ?? []).filter((s) => s.id !== 'organise' && s.id !== 'hubs');
  const shown = build ? steps.filter((s) => s.essential) : steps;
  const later = build ? steps.filter((s) => !s.essential && s.total > s.done) : [];
  const after = (p?.steps ?? []).filter((s) => s.id === 'organise' || s.id === 'hubs');
  const allRead = steps.every((s) => s.done >= s.total);
  const firstOpen = shown.findIndex((s) => s.done < s.total);
  const status = (text: ReactNode, tone = 'text-fg-3') => (
    <p role="status" className={`text-[12.5px] leading-snug break-words ${tone}`}>
      {text}
    </p>
  );
  const stepsNode = (
    <>
      <ul className="space-y-1.5 text-[13px]">
        {shown.map((s, i) => {
          const state = s.done >= s.total ? 'done' : i === firstOpen ? 'now' : 'later';
          return (
            <li key={`${s.id}${s.essential}`} className={`flex items-start gap-2 leading-snug ${state === 'later' ? 'text-fg-3' : ''}`}>
              <Dot state={state} />
              <span className="min-w-0 break-words">{stepLabel(s, build)}</span>
            </li>
          );
        })}
        {later.length > 0 && (
          <li className="flex items-start gap-2 leading-snug text-fg-3">
            <Dot state="later" />
            <span className="min-w-0 break-words">{tr(`Later, in the background: ${laterLine(later)}`)}</span>
          </li>
        )}
        {allRead &&
          after.map((s) => (
            <li key={s.id} className={`flex items-start gap-2 leading-snug ${s.done >= s.total ? '' : 'text-fg-3'}`}>
              <Dot state={s.done >= s.total ? 'done' : s.id === 'organise' || after[0].done >= after[0].total ? 'now' : 'later'} />
              <span className="min-w-0 break-words">{stepLabel(s, build)}</span>
            </li>
          ))}
      </ul>
      {!!p?.current.length && (
        <p className="text-[12.5px] leading-snug break-words text-fg-3">
          <span>{tr('Reading now')}</span>: <span translate="no">{p.current.join(' · ')}</span>
        </p>
      )}
    </>
  );
  if (bar) {
    const quiet = 'h-7 !px-2 text-[12.5px]';
    const line = running ? (left ? timeLeft(left) : '') : job.state === 'stopped' ? (resumable ? tr(`Stopped at ${job.done} of ${job.total}`) : tr('Stopped')) : job.state === 'failed' ? (job.error ?? '') : (job.did ?? []).slice(0, 1).join(' · ');
    const open = details && (running || job.state === 'failed');
    return (
      <section aria-label={titleOf(job)} className="relative overflow-hidden rounded-xl border border-line bg-panel">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
          {running ? <Throbber size={14} /> : job.state === 'failed' ? <TriangleAlert size={14} className="shrink-0 text-err" /> : job.state === 'done' ? <Check size={14} className="shrink-0 text-ok" /> : <RefreshCw size={14} className="shrink-0 text-fg-3" />}
          <span className="min-w-0 flex-1 truncate" title={job.state === 'failed' ? job.error : undefined}>
            <span className="font-medium">{titleOf(job)}</span>
            {line && (
              <span translate={running || job.state === 'stopped' ? undefined : 'no'} className={job.state === 'failed' ? 'text-err' : 'text-fg-3'}>
                {' · '}
                {line}
              </span>
            )}
          </span>
          {(running || job.state === 'failed') && (
            <Button size="sm" variant="ghost" className={cx(quiet, 'gap-0.5')} aria-expanded={open} onClick={() => setDetails((d) => !d)}>
              Details
              <ChevronDown size={12} className={open ? 'rotate-180' : ''} />
            </Button>
          )}
          {running && (
            <Button size="sm" variant="ghost" className={quiet} disabled={busy} onClick={() => void stop()}>
              Stop
            </Button>
          )}
          {job.state === 'stopped' && resumable && (
            <Button size="sm" variant="ghost" className={cx(quiet, 'text-accent')} disabled={busy} onClick={() => void act(`${base}/continue`)}>
              Continue
            </Button>
          )}
          {job.state === 'failed' && (
            <Button size="sm" variant="ghost" className={quiet} disabled={busy} onClick={() => void tryAgain()}>
              Try again
            </Button>
          )}
          {!running && (
            <IconButton label={tr('Dismiss')} size="sm" onClick={dismiss}>
              <X size={14} />
            </IconButton>
          )}
        </div>
        {running && (
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={titleOf(job)} className="h-[3px] bg-bg-2">
            <span className="block h-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
        )}
        {open && (
          <div className="space-y-2.5 border-t border-line px-3 py-2.5">
            {running ? stepsNode : <p role="alert" translate="no" className="text-[12.5px] leading-snug break-words text-err">{job.error ?? ''}</p>}
          </div>
        )}
        {confirmNode}
      </section>
    );
  }
  return (
    <section aria-label={titleOf(job)} className={card ? 'space-y-2.5' : 'space-y-2.5 rounded-xl border border-line bg-panel p-3'}>
      <div className="flex items-center gap-2">
        {running && <Throbber size={13} />}
        <h3 className="min-w-0 flex-1 text-[13.5px] font-semibold">{titleOf(job)}</h3>
        {running && !!left && <span className="shrink-0 text-[12px] text-fg-3">{timeLeft(left)}</span>}
        {!running && !card && (
          <IconButton label={tr('Dismiss')} size="sm" onClick={dismiss}>
            <X size={14} />
          </IconButton>
        )}
      </div>
      {running && (
        <>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={titleOf(job)} className="h-1.5 overflow-hidden rounded-full bg-bg-2">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(pct, 2)}%` }} />
          </div>
          {stepsNode}
          {card && <p className="text-[12.5px] leading-snug text-fg-3">{tr('You can close the app: it keeps going.')}</p>}
          {!card && (
            <div className="flex flex-wrap gap-2 max-[479px]:flex-col">
              <Button size="sm" variant="secondary" className={phoneBtn} disabled={busy} onClick={() => void stop()}>
                Stop
              </Button>
            </div>
          )}
        </>
      )}
      {job.state === 'stopped' && (
        <>
          {status(resumable ? tr(`Stopped at ${job.done} of ${job.total}`) : tr('Stopped'))}
          {!card && resumable && (
            <div className="flex flex-wrap gap-2 max-[479px]:flex-col">
              <Button size="sm" variant="primary" className={phoneBtn} disabled={busy} onClick={() => void act(`${base}/continue`)}>
                Continue
              </Button>
            </div>
          )}
        </>
      )}
      {job.state === 'failed' && (
        <>
          <p role="alert" translate="no" className="text-[12.5px] leading-snug break-words text-err">
            {job.error ?? ''}
          </p>
          {!card && (
            <div className="flex flex-wrap gap-2 max-[479px]:flex-col">
              <Button size="sm" variant="secondary" className={phoneBtn} disabled={busy} onClick={() => void tryAgain()}>
                Try again
              </Button>
            </div>
          )}
        </>
      )}
      {job.state === 'done' && status(<span translate="no">{(job.did ?? []).slice(0, 1).join(' · ')}</span>)}
      {confirmNode}
    </section>
  );
}
