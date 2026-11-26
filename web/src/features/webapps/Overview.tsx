// A web app's Overview: whether it is built and running (with the plain reason when it is not), Start or Stop and Build again, where it
// is in the stages, how Hydor runs it, and, folded under Details, where its folder is and what it last said.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Copy, FolderOpen, Hammer, Play, Sparkles, Square, Trash2 } from 'lucide-react';
import type { WebAppBrief, WebAppChecks, WebAppDetail } from '@shared/webapps';
import { tr } from '../../i18n/runtime';
import { LOCALE } from '../../i18n/locale';
import { ApiError, enc, post } from '../../lib/api';
import { canReveal, reveal, revealLabel } from '../../lib/reveal';
import { toast, toastError, useUI } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { Button, cx, IconButton } from '../../components/ui';
import { useLoaded } from './api';
import { useAskAgent } from './ask';
import { AddWork } from './AddWork';
import { AppServices } from './AppServices';
import { BuildWhere } from './BuildWhere';
import { briefLead, checkDone, currentStage, decisionsFor, nextStep, stageRows, type NextStep, type StageRow } from './map';
import { MailUse } from './MailUse';
import { ModelUse } from './ModelUse';
import { StepsSection } from './Steps';
import { ago } from './time';
import { readable, statusOf } from './status';
import { StatusLabel } from './StatusLabel';
import { TechnicalSections } from './Technical';

/** One stage of the map: its marker on the rail, its name, and what goes under it. */
function StageItem({ row, last, children }: { row: StageRow; last: boolean; children?: ReactNode }) {
  const here = row.state === 'here';
  return (
    <li aria-current={here ? 'step' : undefined} className={cx('relative pl-8', !last && 'pb-4')}>
      {/* The rail to the next stage. */}
      {!last && <span aria-hidden className={cx('absolute top-6 bottom-0 left-[9px] w-px', row.state === 'done' ? 'bg-accent/60' : 'bg-line-2')} />}
      <span
        aria-hidden
        className={cx('absolute top-0.5 left-0 grid h-[19px] w-[19px] place-items-center rounded-full border', row.state === 'done' ? 'border-accent bg-accent text-accent-fg' : here ? 'border-accent bg-bg ring-4 ring-accent/20' : 'border-line-2 bg-bg')}
      >
        {row.state === 'done' ? <Check size={11} strokeWidth={3} /> : here ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
      </span>
      <div className="flex min-h-6 items-center gap-2">
        <span className={cx('text-[14px]', here ? 'font-semibold text-fg' : row.state === 'done' ? 'text-fg-2' : 'text-fg-3')}>{row.name}</span>
      </div>
      {children}
    </li>
  );
}

/** What the next step is, with the button that asks the agent for it. */
function NextStepLine({ next, ask }: { next: NextStep; ask: (message: string) => void }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl bg-bg-2 px-3.5 py-3">
      <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-fg max-sm:basis-full">{tr(next.sentence)}</p>
      {next.button && next.message && (
        <Button size="sm" variant="primary" icon={<Sparkles size={13} />} onClick={() => ask(next.message!)}>
          {next.button}
        </Button>
      )}
    </div>
  );
}

/** Where the app stands: the stages, and under the one it is at what was decided there and the one next step. */
function StageMap({ app, checks }: { app: WebAppDetail; checks?: WebAppChecks | null }) {
  const ask = useAskAgent(app);
  // The Check stage is done only when the checks ran and nothing failed.
  const rows = stageRows(app.stage, checkDone(checks));
  const stage = currentStage(app.stage);
  const next = nextStep(app.stage, app.decisions, checks);
  const decided = decisionsFor(app.decisions, stage);
  // The brief is read for the two stages that are about it.
  const brief = useLoaded<WebAppBrief>(stage === 'brief' || stage === 'design' ? `/api/webapps/${enc(app.id)}/brief` : null).data;
  const lead = brief?.exists ? briefLead(brief.text) : '';
  const under = (
    <div className="mt-2 space-y-3">
      {decided.length > 0 && (
        <div>
          <div className="text-[12.5px] text-fg-3">Decided so far</div>
          <ul className="mt-1 space-y-1">
            {decided.map((d, i) => (
              <li key={`${d.at}-${i}`} translate="no" className="flex gap-2 text-[13.5px] leading-snug text-fg-2">
                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />
                <span className="min-w-0 break-words">{d.what}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {lead && (
        <div>
          <div className="text-[12.5px] text-fg-3">From the brief</div>
          <p translate="no" className="mt-1 text-[13.5px] leading-snug text-fg-2">
            {lead.replace(/[*_`]/g, '')}
          </p>
          <Fold label="The brief">
            <div translate="no" className="rounded-xl bg-bg-2 px-3.5 py-3">
              <Markdown text={brief!.text} className="text-[13.5px]" />
            </div>
          </Fold>
        </div>
      )}
      <NextStepLine next={next} ask={ask} />
    </div>
  );
  return (
    <section className="rounded-2xl border border-line bg-panel px-5 py-5">
      <ol aria-label="Stages">
        {rows.map((r, i) => (
          <StageItem key={r.id} row={r} last={i === rows.length - 1}>
            {r.state === 'here' ? under : null}
          </StageItem>
        ))}
      </ol>
      {/* An app that names no stage has none to put it under. */}
      {!stage && <div className="-mt-1">{under}</div>}
    </section>
  );
}

/** Lines of output in a box, the end of them in view (a build as it goes, a log as it was left). */
export function Lines({ lines, empty, className }: { lines: string[]; empty: string; className?: string }) {
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length]);
  return (
    <pre ref={box} translate="no" className={cx('max-h-72 overflow-auto rounded-xl bg-bg-2 px-3 py-2.5 font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words text-fg-2', className)}>
      {lines.length ? lines.join('\n') : <span translate="yes" className="text-fg-3">{empty}</span>}
    </pre>
  );
}

/** A fold: its label, and what it holds once asked for. */
export function Fold({ label, children, open: start = false }: { label: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(start);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 rounded-lg py-1 pr-2 text-[13px] font-medium text-fg-2 hover:text-fg">
        <ChevronRight size={14} className={cx('text-fg-3 transition-transform', open && 'rotate-90')} />
        {label}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

export function Overview({ app, reload, onForget, checks }: { app: WebAppDetail; reload: () => Promise<void>; onForget: () => void; checks?: WebAppChecks | null }) {
  const technical = useUI((s) => s.technicalDetails);
  const st = statusOf(app);
  const [working, setWorking] = useState<'start' | 'stop' | 'build' | 'check' | null>(null);
  const [startError, setStartError] = useState('');
  const building = app.build.state === 'building';
  const running = app.run.state === 'running' || app.run.state === 'starting';
  const can = readable(app) && !building;
  const ask = useAskAgent(app);
  const act = async (what: 'start' | 'stop' | 'build') => {
    setWorking(what);
    if (what === 'start') setStartError('');
    try {
      await post(`/api/webapps/${enc(app.id)}/${what}`);
    } catch (e) {
      // Starting says why it could not, in the server's words; the rest are toasts.
      if (what === 'start' && e instanceof ApiError) setStartError(e.message);
      else toastError(e);
    } finally {
      setWorking(null);
      void reload();
    }
  };
  const check = async () => {
    setWorking('check');
    await reload();
    setWorking(null);
  };
  const failedToStart = !!startError && !running;
  const sub = [running && app.run.lastUse ? tr(`Last used ${ago(app.run.lastUse)}`) : '', app.build.state === 'built' && app.build.endedAt ? tr(`Built ${ago(app.build.endedAt)}`) : ''].filter(Boolean).join(' · ');
  const buildLog = app.build.log;
  return (
    <div className="mx-auto max-w-[920px] space-y-6 px-4 py-5 sm:px-6 sm:py-6">
      <section className={cx('rounded-2xl border bg-panel px-5 py-4 sm:py-5', st.tone === 'err' ? 'border-err/35' : 'border-line')}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1 max-sm:basis-full">
            <StatusLabel s={failedToStart ? { tone: 'err', label: 'Could not start' } : st} className="text-[15px] font-semibold" />
            {sub && !failedToStart && <div className="mt-1 text-[13px] text-fg-3">{sub}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {st.broken === 'file' ? (
              // Its hydor.json is still to be written, or to be put right: the agent does that.
              <>
                <Button size="sm" variant="primary" icon={<Sparkles size={13} />} onClick={() => ask(st.label === 'Being made' ? 'Carry on building this app, and write its hydor.json so Hydor can run it.' : `Its hydor.json cannot be used: ${st.reason ?? ''} Put it right and check it.`)}>
                  Ask the agent
                </Button>
                <Button size="sm" variant="secondary" disabled={working === 'check'} onClick={() => void check()}>
                  Check again
                </Button>
              </>
            ) : st.broken ? (
              // Nothing to run: its files are wrong or gone. Look again once they are put right, or let it go (its folder stays).
              <>
                <Button size="sm" variant="secondary" disabled={working === 'check'} onClick={() => void check()}>
                  Check again
                </Button>
                <Button size="sm" variant="secondary" icon={<Trash2 size={13} />} onClick={onForget}>
                  Forget this app
                </Button>
              </>
            ) : running ? (
              <Button size="sm" variant="secondary" icon={<Square size={13} />} disabled={working === 'stop'} onClick={() => void act('stop')}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant={app.build.exists || app.mode?.runsAs === 'dev' ? 'primary' : 'secondary'} icon={<Play size={13} />} disabled={!can || (!app.build.exists && app.mode?.runsAs !== 'dev') || working === 'start'} onClick={() => void act('start')}>
                Start
              </Button>
            )}
            {!st.broken && app.shape.build && (
              <Button size="sm" variant={app.build.exists || app.mode?.runsAs === 'dev' ? 'secondary' : 'primary'} icon={<Hammer size={13} />} disabled={!can || working === 'build'} onClick={() => void act('build')}>
                {app.build.exists || app.build.state === 'failed' ? 'Build again' : 'Build'}
              </Button>
            )}
          </div>
        </div>
        {(failedToStart || st.reason) && (
          <p translate="no" className="mt-3 text-[13.5px] leading-relaxed text-fg-2">
            {failedToStart ? startError.replace(/\s*Last lines of its log:?\s*$/i, '') : st.reason}
          </p>
        )}
        {!app.build.exists && st.tone === 'idle' && app.mode?.runsAs !== 'dev' && <p className="mt-3 text-[13.5px] leading-relaxed text-fg-2">It has to be built once before it can run.</p>}
        {!st.broken && !building && app.shape.build && <BuildWhere box={app.build.box} refused={app.build.refused} className="mt-2" />}
        {app.run.state === 'crashed' && !failedToStart && app.run.restarts > 0 && <p className="mt-2 text-[13px] text-fg-3">{tr(`It was started again ${app.run.restarts} ${app.run.restarts === 1 ? 'time' : 'times'}.`)}</p>}
        {(building || app.build.state === 'failed') && (
          <div className="mt-3">
            <Fold label="What the build said" open={building}>
              <Lines lines={buildLog.slice(-60)} empty="Nothing yet." />
            </Fold>
          </div>
        )}
      </section>

      <StageMap app={app} checks={checks} />

      {app.shape.ok && <ContractCard app={app} />}

      {st.broken !== 'folder' && <AppServices app={app} />}

      {st.broken !== 'folder' && !app.flows && <AgentsWork app={app} reload={reload} />}

      {app.ai && <ModelUse app={app} reload={reload} />}

      {app.mail && <MailUse app={app} reload={reload} />}

      {st.broken !== 'folder' && <StepsSection app={app} reload={reload} />}

      {st.broken !== 'folder' && technical && <TechnicalSections app={app} />}

      {/* The folder and what the app last said are not what a person needs first: one fold, open when it has just failed (that is what it last said that matters). */}
      <section>
        <Fold key={failedToStart || app.run.state === 'crashed' ? 'open' : 'closed'} label="Details" open={failedToStart || app.run.state === 'crashed'}>
          <div className="space-y-4 pt-1">
            <div>
              <div className="text-[12.5px] text-fg-3">Folder</div>
              <div className="mt-1 flex items-center gap-1.5">
                <code translate="no" className="min-w-0 flex-1 rounded-md bg-bg-2 px-2 py-1.5 text-[12.5px] break-all max-sm:text-[11.5px]">
                  {app.folder}
                </code>
                <IconButton label="Copy the path" size="sm" onClick={() => void navigator.clipboard?.writeText(app.folder).then(() => toast(tr('Copied'), 'ok'), () => {})}>
                  <Copy size={14} />
                </IconButton>
                {canReveal() && (
                  <IconButton label={revealLabel()} size="sm" onClick={() => reveal(app.folder)}>
                    <FolderOpen size={14} />
                  </IconButton>
                )}
              </div>
            </div>
            {app.meaning && (
              <div>
                <div className="text-[12.5px] text-fg-3">{tr('Search by meaning')}</div>
                <Meaning meaning={app.meaning} />
              </div>
            )}
            <div>
              <div className="text-[12.5px] text-fg-3">What it last said</div>
              <Lines className="mt-1" lines={app.log.slice(-80)} empty="Nothing yet." />
            </div>
          </div>
        </Fold>
      </section>
    </div>
  );
}

/** An app that has no agents' work yet: what it is, and the way to add it. */
function AgentsWork({ app, reload }: { app: WebAppDetail; reload: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl border border-line bg-panel px-5 py-4" data-agents-work>
      <div className="min-w-0 flex-1 max-sm:basis-full">
        <h2 className="text-[15px] font-semibold tracking-tight">{tr('Agents’ work')}</h2>
        <p className="mt-0.5 text-[13px] leading-snug text-fg-3">{tr('Hydor’s agents can do work for this app, started and followed from its pages.')}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
        {tr("Add agents' work")}
      </Button>
      <AddWork app={app} open={adding} onClose={() => setAdding(false)} onDone={() => void reload()} />
    </section>
  );
}

/** One thing Hydor knows of an app from its hydor.json. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
      <dt className="text-[13px] text-fg-3">{label}</dt>
      <dd className="text-[13.5px] leading-snug text-fg">{children}</dd>
    </div>
  );
}

/** What an app's hydor.json says, in plain words. */
function ContractCard({ app }: { app: WebAppDetail }) {
  const s = app.shape;
  const calls = [s.services.ai && tr('Your models, once you allow it'), s.services.embed && tr('Search by meaning'), s.services.mail && tr('Mail, once you allow it')].filter(Boolean) as string[];
  return (
    <section className="rounded-2xl border border-line bg-panel px-5 py-4" data-contract>
      <h2 className="text-[15px] font-semibold tracking-tight">How Hydor runs it</h2>
      <p className="mt-0.5 mb-3 text-[13px] leading-snug text-fg-3">
        Hydor does what its <code translate="no">hydor.json</code> says. The Checks tab tries each thing it says.
      </p>
      <dl className="divide-y divide-line">
        <Fact label="Who signs people in">{s.signIn === 'hydor' ? tr('Hydor: inside Hydor it is you, with no second account') : tr('The app itself, with accounts of its own')}</Fact>
        <Fact label="While it is changed">{s.dev ? tr('Its development command, as the files change') : s.build ? tr('Its production command: build it again to see a change') : tr('Its production command: stop and start it to see a change')}</Fact>
        <Fact label="Database">
          {s.database ? (
            <>
              <code translate="no">{s.database.file}</code>
              <span className="text-fg-3">{` · ${s.database.sqlite ? tr('SQLite, backed up while it runs') : tr('backed up with it stopped')}`}</span>
            </>
          ) : (
            tr('None named: it is stopped while its data folder is backed up')
          )}
        </Fact>
        <Fact label="Uses from Hydor">{calls.length ? calls.join(' · ') : tr('Nothing')}</Fact>
        <Fact label="Keys">{s.keys ? tr(`${s.keys} listed, on the Keys tab`) : tr('None')}</Fact>
      </dl>
    </section>
  );
}

/** What the app's search has had Hydor make into vectors today (it costs no model use, only this computer's time). */
export function Meaning({ meaning }: { meaning: { texts: number; limit: number } }) {
  return (
    <p className="mt-3 text-[13px] text-fg-3" data-flows="meaning">
      {tr(`Its search by meaning today: ${meaning.texts.toLocaleString(LOCALE)} of ${meaning.limit.toLocaleString(LOCALE)} texts made into vectors on this computer`)}
    </p>
  );
}
