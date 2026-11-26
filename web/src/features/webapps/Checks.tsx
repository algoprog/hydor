// A web app's Checks: what the check of its hydor.json and of its pages found the last time it ran, one line each: failed ones
// first (what stops a launch above what does not, with "Fix it", which asks the agent), then the rest in groups; whether
// signed-in pages were looked at, what no script can judge, when it ran and "Run the checks".
import { useEffect, useRef, useState } from 'react';
import { Check, Info, Minus, Play, X } from 'lucide-react';
import { stopsLaunch, type CheckLine, type WebApp, type WebAppChecks } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { api, enc, post } from '../../lib/api';
import { toastError } from '../../lib/store';
import { Badge, Button, cx, Throbber } from '../../components/ui';
import { type Loaded, useLoaded } from './api';
import { useAskAgent } from './ask';
import { readable } from './status';
import { checkCounts, fixedLines, fixMessage, linesOf } from './map';
import { Fold } from './Overview';
import { CheckerCommand } from './Technical';
import { ago } from './time';

/** How often a running check is asked about (it builds the app, tries it and looks at its pages: it takes a few minutes). */
const POLL_MS = 1500;

export interface ChecksState extends Loaded<WebAppChecks> {
  /** The check is running now (started here, and not ended yet). */
  running: boolean;
  /** Runs it; the lines are read again when it ends. */
  run: () => Promise<void>;
}

/** The last checks of an app, and running them again (kept in the page, so a run goes on while another tab is open). */
export function useChecks(id: string): ChecksState {
  const loaded = useLoaded<WebAppChecks>(`/api/webapps/${enc(id)}/checks`);
  const [running, setRunning] = useState(false);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const { reload } = loaded;
  const run = async () => {
    if (running) return;
    setRunning(true);
    try {
      await post(`/api/webapps/${enc(id)}/check`);
      let now: WebAppChecks;
      do {
        await new Promise<void>((r) => (timer.current = setTimeout(r, POLL_MS)));
        if (!alive.current) return;
        now = await api<WebAppChecks>(`/api/webapps/${enc(id)}/checks`);
      } while (now.running && alive.current);
    } catch (e) {
      if (alive.current) toastError(e);
    } finally {
      if (alive.current) {
        setRunning(false);
        await reload();
      }
    }
  };
  // A check an agent (or another page) started is going: said here too.
  return { ...loaded, running: running || !!loaded.data?.running, run };
}

const MARK: Record<CheckLine['state'], { icon: typeof Check; cls: string; label: string }> = {
  passed: { icon: Check, cls: 'bg-ok/15 text-ok', label: 'Passed' },
  failed: { icon: X, cls: 'bg-err/15 text-err', label: 'Failed' },
  note: { icon: Info, cls: 'bg-info/15 text-info', label: 'Note' },
  notRun: { icon: Minus, cls: 'bg-bg-3 text-fg-3', label: 'Could not run' },
};

/** The groups of the lines, in the order they are shown: what the app says of itself first, then what a browser met. */
const GROUPS: { id: string; title: () => string }[] = [
  { id: 'contract', title: () => tr('What its hydor.json says') },
  { id: 'safety', title: () => tr('Safety') },
  { id: 'pages', title: () => tr('Its pages') },
  { id: 'accessibility', title: () => tr('Reading them') },
];
const groupOf = (l: CheckLine) => (l.group && GROUPS.some((g) => g.id === l.group) ? l.group : 'contract');
const STATE_ORDER: Record<CheckLine['state'], number> = { failed: 0, note: 1, notRun: 2, passed: 3 };

/** "3 passed · 1 to note": what a folded group holds. */
function holds(lines: CheckLine[]): string {
  const of = (state: CheckLine['state']) => lines.filter((l) => l.state === state).length;
  const passed = of('passed');
  const noted = of('note');
  const missed = of('notRun');
  return [passed ? tr(`${passed} passed`) : '', noted ? tr(`${noted} to note`) : '', missed ? tr(`${missed} could not run`) : ''].filter(Boolean).join(' · ');
}

/** One line of the checks: its name, its sentence, what to do, and where (folded). A failed line has Fix it. */
function CheckRow({ line, onFix, tags }: { line: CheckLine; onFix: (l: CheckLine) => void; tags?: boolean }) {
  const m = MARK[line.state] ?? MARK.note;
  const Icon = m.icon;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0" data-check={line.id} data-state={line.state}>
      <span role="img" aria-label={tr(m.label)} className={cx('mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full', m.cls)}>
        <Icon size={12} strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1 max-sm:basis-[calc(100%-2rem)]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span translate="no" className="text-[13.5px] leading-snug font-medium break-words">
            {line.title ?? line.id}
          </span>
          {line.fixed && <Badge tone="ok">Fixed</Badge>}
          {tags && line.state === 'failed' && (stopsLaunch(line) ? <Badge tone="err">Stops a launch</Badge> : <Badge tone="warn">Does not stop a launch</Badge>)}
        </div>
        <p translate="no" className={cx('mt-0.5 text-[13px] leading-snug break-words', line.state === 'passed' ? 'text-fg-3' : 'text-fg-2')}>
          {line.text}
        </p>
        {line.hint && line.state !== 'passed' && (
          <p translate="no" className="mt-1 text-[13px] leading-snug break-words text-fg-2">
            <span translate="yes" className="text-fg-3">
              What to do:{' '}
            </span>
            {line.hint}
          </p>
        )}
        {!!line.details?.length && line.state !== 'passed' && (
          <Fold label={tr(`Where (${line.details.length})`)}>
            <ul translate="no" className="space-y-0.5 text-[12.5px] leading-snug text-fg-3">
              {line.details.map((d, i) => (
                <li key={i} className="break-words">
                  {d}
                </li>
              ))}
            </ul>
          </Fold>
        )}
        <span translate="no" className="mt-1 block font-mono text-[11.5px] text-fg-3">
          {line.id}
        </span>
      </div>
      {line.state === 'failed' && (
        <Button size="sm" variant="secondary" className="max-sm:ml-8" onClick={() => onFix(line)}>
          Fix it
        </Button>
      )}
    </li>
  );
}

function Count({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 text-[13px] text-fg-2">
      <span className={cx('tnum text-[15px] font-semibold', tone)}>{n}</span>
      {tr(label)}
    </span>
  );
}

export function Checks({ app, checks }: { app: WebApp; checks: ChecksState }) {
  const ask = useAskAgent(app);
  const { data, error, running, run } = checks;
  const building = app.build.state === 'building';
  if (!data)
    return (
      <div className="mx-auto max-w-[920px] px-4 py-5 sm:px-6 sm:py-6">
        {error ? (
          <p translate="no" className="rounded-2xl border border-dashed border-line-2 px-5 py-8 text-center text-[13.5px] text-fg-3">
            {error}
          </p>
        ) : (
          <div className="flex justify-center py-16 text-fg-3">
            <Throbber size={24} />
          </div>
        )}
      </div>
    );
  // What stops a launch first, then the rest that failed.
  const bad = linesOf(data.lines, 'failed').sort((x, y) => Number(stopsLaunch(y)) - Number(stopsLaunch(x)));
  const fixed = fixedLines(data.lines);
  const counts = checkCounts(data.lines);
  const stopping = bad.some(stopsLaunch);
  const isBad = stopping || (data.ok === false && counts.failed === 0);
  const good = data.ran && !data.problem && data.ok === true && !counts.failed;
  const groups = GROUPS.map((g) => ({
    ...g,
    lines: data.lines.filter((l) => groupOf(l) === g.id && l.state !== 'failed' && !l.fixed).sort((x, y) => STATE_ORDER[x.state] - STATE_ORDER[y.state]),
  })).filter((g) => g.lines.length);
  return (
    <div className="mx-auto max-w-[920px] space-y-4 px-4 py-5 sm:px-6 sm:py-6" data-tab="checks">
      <section className={cx('rounded-2xl border bg-panel p-4 sm:p-5', isBad ? 'border-err/35' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-1 items-start gap-3 max-sm:basis-full">
            {data.ran && !data.problem && (
              <span aria-hidden className={cx('mt-px grid h-6 w-6 shrink-0 place-items-center rounded-full', good ? 'bg-ok/15 text-ok' : isBad ? 'bg-err/15 text-err' : counts.failed ? 'bg-warn/15 text-warn' : 'bg-bg-3 text-fg-3')}>
                {good ? <Check size={14} strokeWidth={2.5} /> : isBad ? <X size={14} strokeWidth={2.5} /> : <Info size={14} />}
              </span>
            )}
            <div className="min-w-0">
              {data.ran ? (
                <>
                  {data.summary && (
                    <p translate="no" className="text-[15px] leading-snug font-semibold break-words">
                      {data.summary}
                    </p>
                  )}
                  {data.at && <p className={cx('text-[13px] text-fg-3', data.summary && 'mt-1')}>{tr(`Checked ${ago(data.at)}`)}</p>}
                  {!data.problem && data.lines.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <Count n={counts.passed} label="passed" tone="text-ok" />
                      {counts.failed > 0 && <Count n={counts.failed} label="failed" tone="text-err" />}
                      {counts.notRun > 0 && <Count n={counts.notRun} label="could not run" tone="text-fg-3" />}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[14px] text-fg-2">The checks have not been run yet.</p>
              )}
            </div>
          </div>
          <Button size="sm" variant={data.ran ? 'secondary' : 'primary'} icon={running ? <Throbber size={12} /> : <Play size={13} />} disabled={running || building || !readable(app)} onClick={() => void run()}>
            {running ? 'Running…' : data.ran ? 'Run again' : 'Run the checks'}
          </Button>
        </div>
        {running && (
          <p className="mt-3 text-[13px] text-fg-3">
            {tr('It builds the app, tries it and looks at its pages: a few minutes.')}
            {data.running && <span translate="no">{` ${data.running.step}`}</span>}
          </p>
        )}
        {!running && (
          <p className="mt-3 text-[13px] leading-snug text-fg-3">
            {tr('On a throwaway copy with made-up keys, Hydor tries each thing the app’s hydor.json says, then looks at its pages in a browser. A launch runs this first: a failed line about hydor.json stops it, and of the pages only what could hurt someone.')}
          </p>
        )}
        {data.problem && (
          <p translate="no" className="mt-3 text-[13.5px] leading-relaxed text-fg-2">
            {data.problem}
          </p>
        )}
        {building && <p className="mt-3 text-[13px] text-fg-3">It is being built: run the checks when that has ended.</p>}
      </section>

      {data.signedIn && (
        <p className="flex items-start gap-2.5 rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3 text-[13.5px] leading-snug sm:px-5" data-signed-in="not-seen">
          <Info size={15} className="mt-0.5 shrink-0 text-warn" />
          <span translate="no">{data.signedIn}</span>
        </p>
      )}

      {bad.length > 0 && (
        <section className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">Failed</h3>
          <ul className="divide-y divide-line">
            {bad.map((l) => (
              <CheckRow key={l.id} line={l} tags onFix={(x) => ask(fixMessage(x))} />
            ))}
          </ul>
        </section>
      )}

      {fixed.length > 0 && (
        <section className="rounded-2xl border border-ok/30 bg-panel p-4 sm:p-5">
          <h3 className="mb-3 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">Fixed since the last run</h3>
          <ul className="divide-y divide-line">
            {fixed.map((l) => (
              <CheckRow key={l.id} line={l} onFix={() => {}} />
            ))}
          </ul>
        </section>
      )}

      {groups.map((g) => {
        // A group with something to note or not looked at opens by itself when nothing failed.
        const open = !bad.length && g.lines.some((l) => l.state !== 'passed');
        return (
          <section key={g.id} className="rounded-2xl border border-line bg-panel px-4 py-3 sm:px-5" data-check-group={g.id}>
            <Fold key={open ? 'open' : 'closed'} label={`${g.title()} (${holds(g.lines)})`} open={open}>
              <ul className="divide-y divide-line pt-1.5 pb-1">
                {g.lines.map((l) => (
                  <CheckRow key={l.id} line={l} onFix={() => {}} />
                ))}
              </ul>
            </Fold>
          </section>
        );
      })}

      <CheckerCommand app={app} />

      {!!data.notCovered?.length && (
        <section className="rounded-2xl border border-dashed border-line-2 px-4 py-3 sm:px-5" data-page-checks="not-covered">
          <Fold label={tr('What no script can judge: look at these yourself')}>
            <ul translate="no" className="list-disc space-y-1 pt-1.5 pb-1 pl-5 text-[13px] leading-snug text-fg-3">
              {data.notCovered.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Fold>
        </section>
      )}
    </div>
  );
}
