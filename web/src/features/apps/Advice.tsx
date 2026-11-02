// What a template's latest runs say about its steps, over them in its Edit. A step that failed and had an
// agent do its work: an agent can fix it (in the conversation beside, or in a new App builder session). An
// agent step that did the same each time: Firm it up shows the fixed steps that could do it, tries them on the
// examples (or with the answers of the runs it was seen in) and says what a run takes and costs either way,
// before they take its place on screen.
import { useEffect, useMemo, useState } from 'react';
import { Gauge, LifeBuoy } from 'lucide-react';
import type { Step } from '@shared/app-manifest';
import { allSteps, asText, STEP_KINDS, swapStep, titleOf } from '@shared/app-manifest';
import type { AppAdvice, AppDef, AppRecipe, AppRun, FirmUp, RescuedStep, RunStepView } from '@shared/apps';
import { inputsLine, isActive } from '@shared/apps';
import { api, enc, post } from '../../lib/api';
import { composeInsert } from '../../lib/featureEvents';
import { go } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Button, cx, Dialog, Throbber } from '../../components/ui';
import { tr } from '../../i18n/runtime';
import { money, useRunEvents, type RunDetail } from './api';

/** Small amounts as they are (a model step costs a fraction of a cent). */
const usd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(3)}` : money(n));
const KIND = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label])) as Record<string, string>;

function Note({ icon, children, detail, action }: { icon: React.ReactNode; children: React.ReactNode; detail?: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-bg-1 px-3 py-2.5">
      <span className="mt-0.5 shrink-0 text-fg-3">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{children}</div>
        {detail && <div className="mt-0.5 text-[12px] text-fg-3">{detail}</div>}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** `session`: the conversation the editor is beside, whose agent is asked; otherwise a new App builder session. */
export function Advice({ app, recipe, onChange, session }: { app: AppDef; recipe: AppRecipe; onChange: (p: Partial<AppRecipe>) => void; session?: string }) {
  const [advice, setAdvice] = useState<AppAdvice | null>(null);
  const [firming, setFirming] = useState<FirmUp | null>(null);
  useEffect(() => {
    api<AppAdvice>(`/api/apps/${enc(app.id)}/advice`).then(setAdvice, () => {});
  }, [app.id, app.updatedAt]);
  // Only what is about the steps on screen as they are.
  const steps = useMemo(() => new Map(allSteps([...(recipe.flow?.steps ?? []), ...Object.values(recipe.flows ?? {}).flatMap((f) => f.steps)]).map((s) => [s.id, s])), [recipe.flow, recipe.flows]);
  if (!advice) return null;
  const rescued = advice.rescued.filter((x) => steps.has(x.step));
  const firm = advice.firm.filter((f) => steps.get(f.step)?.do === 'agent');
  if (!rescued.length && !firm.length) return null;
  const fix = (x: RescuedStep) => {
    const text = tr(`Fix the step “${x.title}” (${x.step}) of my app “${app.name}” (${app.id}): it failed in ${x.runs} of its last ${x.of} runs, and an agent did its work instead. The last time (run ${x.run}) it said: ${x.error}`);
    if (session) composeInsert(text, session);
    else go(`/?assistant=app-builder&prompt=${enc(text)}`);
  };
  return (
    <div className="space-y-2">
      {rescued.map((x) => (
        <Note
          key={`r-${x.step}`}
          icon={<LifeBuoy size={15} className="text-warn" />}
          detail={<span translate="no">{x.error}</span>}
          action={
            <Button size="sm" variant="secondary" onClick={() => fix(x)}>
              Ask an agent to fix it
            </Button>
          }
        >
          {`“${x.title}” failed in ${x.runs} of its last ${x.of} runs, and an agent did its work`}
        </Note>
      ))}
      {firm.map((f) => (
        <Note
          key={`f-${f.step}`}
          icon={<Gauge size={15} className="text-accent" />}
          detail={
            <>
              {f.calls.length > 0 && (
                <>
                  <span className="font-mono" translate="no">
                    {f.calls.join(' → ')}
                  </span>
                  {' · '}
                </>
              )}
              <span>{`About ${f.agent.seconds} s and ${usd(f.agent.costUsd)} a run with its agent`}</span>
            </>
          }
          action={
            <Button size="sm" variant="secondary" onClick={() => setFirming(f)}>
              Firm it up
            </Button>
          }
        >
          {`“${f.title}” did the same in its last ${f.runs} runs: fixed steps could do it for less`}
        </Note>
      ))}
      {firming && (
        <FirmUpDialog
          app={app}
          recipe={recipe}
          firm={firming}
          onClose={() => setFirming(null)}
          onUse={() => {
            onChange(swapStep(recipe, firming.step, firming.steps));
            setFirming(null);
            toast(tr('The steps are in its place: save the app to keep them'));
          }}
        />
      )}
    </div>
  );
}

/** A step of the proposal, in a line: its kind, title and what it does. */
function StepLine({ s }: { s: Step }) {
  const what =
    s.do === 'tool'
      ? `${s.tool}(${Object.entries(s.with ?? {})
          .map(([k, v]) => `${k}: ${asText(v, 60)}`)
          .join(', ')})`
      : s.do === 'model'
        ? (s.instructions.split('\n').find((l) => l.trim()) ?? '')
        : '';
  return (
    <li className="py-1.5">
      <span className="flex items-baseline gap-2">
        <span className="truncate text-[13px] font-medium" translate="no">
          {titleOf(s)}
        </span>
        <span className="shrink-0 text-[11.5px] text-fg-3">{KIND[s.do]}</span>
      </span>
      <span className="block min-w-0">
        <span className="block truncate font-mono text-[11.5px] text-fg-3" translate="no">
          {what}
        </span>
        {s.failed === 'agent' && <span className="block text-[11.5px] text-fg-3">If it fails, an agent does its work</span>}
      </span>
    </li>
  );
}

interface Try {
  label: string;
  run: AppRun;
  steps?: RunStepView[];
}

/** What the steps of the proposal took in a run that ended: time and cost. */
function measure(t: Try, ids: Set<string>): { seconds: number; costUsd: number } | null {
  if (!t.steps) return null;
  const mine = t.steps.filter((s) => ids.has(s.id));
  return {
    seconds: mine.reduce((n, s) => n + (s.startedAt && s.endedAt ? (s.endedAt - s.startedAt) / 1000 : 0), 0),
    costUsd: mine.reduce((n, s) => n + (s.costUsd ?? 0), 0),
  };
}

function FirmUpDialog({ app, recipe, firm, onClose, onUse }: { app: AppDef; recipe: AppRecipe; firm: FirmUp; onClose: () => void; onUse: () => void }) {
  const changed = useMemo(() => ({ ...recipe, ...swapStep(recipe, firm.step, firm.steps) }), [recipe, firm]);
  const ids = useMemo(() => new Set(firm.steps.map((s) => s.id)), [firm]);
  const examples = recipe.examples ?? [];
  const [tries, setTries] = useState<Try[] | null>(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      if (examples.length) {
        const r = await post<{ runs: { example: string; run?: AppRun; error?: string }[] }>(`/api/apps/${enc(app.id)}/examples/run`, { recipe: changed, trial: true });
        const bad = r.runs.find((x) => x.error);
        if (bad) toastError(new Error(bad.error));
        setTries(r.runs.filter((x) => x.run).map((x) => ({ label: examples.find((e) => e.id === x.example)?.name || inputsLine(recipe.fields, x.run!.inputs) || x.example, run: x.run! })));
      } else {
        const runs = await Promise.all(firm.inputs.map((inputs) => post<{ run: AppRun }>(`/api/apps/${enc(app.id)}/runs`, { recipe: changed, inputs, source: 'test' })));
        setTries(runs.map((r, i) => ({ label: inputsLine(recipe.fields, firm.inputs[i]) || tr('A try'), run: r.run })));
      }
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  // Each try as it goes; once one ends, its steps say what the new ones took.
  useRunEvents((run) => setTries((t) => t && t.map((x) => (x.run.id === run.id ? { ...x, run } : x))));
  useEffect(() => {
    for (const t of tries ?? [])
      if (!isActive(t.run.status) && !t.steps)
        api<RunDetail>(`/api/apps/runs/${enc(t.run.id)}`).then(
          (d) => setTries((all) => all && all.map((x) => (x.run.id === t.run.id ? { ...x, run: d.run, steps: d.steps ?? [] } : x))),
          () => {},
        );
  }, [tries]);
  const ended = !!tries?.length && tries.every((t) => !isActive(t.run.status) && t.steps);
  const measured = (tries ?? []).map((t) => measure(t, ids)).filter((m): m is { seconds: number; costUsd: number } => !!m && m.seconds > 0);
  const avg = measured.length ? { seconds: measured.reduce((n, m) => n + m.seconds, 0) / measured.length, costUsd: measured.reduce((n, m) => n + m.costUsd, 0) / measured.length } : null;
  const good = (t: Try) => t.run.status === 'done' && (t.run.checks ?? []).every((c) => c.ok);
  return (
    <Dialog
      open
      onClose={onClose}
      width={600}
      title={tr(`Firm up “${firm.title}”`)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {ended ? (
            <Button variant="primary" onClick={onUse}>
              Use these steps
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void start()} disabled={busy || !!tries} icon={busy || tries ? <Throbber /> : undefined}>
              {examples.length ? 'Try them on its examples' : 'Try them'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4 text-[13px]">
        <p className="text-fg-2">
          <span>{`Its agent did the same in each of its last ${firm.runs} runs. These steps do it without an agent: a tool step for each call it made, with the values it made them with, then a model step with its instructions and what the tools gave.`}</span>
          {!examples.length && <span> The app has no examples, so they are tried with the answers of those runs.</span>}
        </p>
        <ol className="divide-y divide-line rounded-xl border border-line px-3">
          {firm.steps.map((s) => (
            <StepLine key={s.id} s={s} />
          ))}
        </ol>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-bg-2 px-3 py-2">
            <div className="text-[12px] text-fg-3">With its agent</div>
            <div className="font-medium">{`About ${Math.round(firm.agent.seconds)} s and ${usd(firm.agent.costUsd)} a run`}</div>
          </div>
          <div className={cx('rounded-xl px-3 py-2', avg ? 'bg-accent/10' : 'bg-bg-2')}>
            <div className="text-[12px] text-fg-3">With these steps</div>
            <div className="font-medium">{avg ? `About ${Math.max(1, Math.round(avg.seconds))} s and ${usd(avg.costUsd)} a run` : tries ? 'Trying them…' : 'Not tried yet'}</div>
          </div>
        </div>
        {tries && (
          <ul className="space-y-1">
            {tries.map((t) => {
              const failed = (t.run.checks ?? []).filter((c) => !c.ok).length;
              return (
                <li key={t.run.id} className="flex items-center gap-2.5">
                  <span className="flex h-2.5 w-2.5 shrink-0 items-center justify-center">{isActive(t.run.status) ? <Throbber size={11} /> : <span className={cx('h-2.5 w-2.5 rounded-full', good(t) ? 'bg-ok' : 'bg-err')} />}</span>
                  <span className="min-w-0 flex-1 truncate" translate="no">
                    {t.label}
                  </span>
                  <span className={cx('shrink-0 text-[12px]', isActive(t.run.status) ? 'text-fg-3' : good(t) ? 'text-ok' : 'text-err')}>
                    {isActive(t.run.status) ? 'Working' : t.run.status !== 'done' ? 'Did not finish' : failed ? `${failed} of ${t.run.checks!.length} checks failed` : t.run.checks?.length ? 'Passed' : 'Done'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {ended && tries!.some((t) => !good(t)) && <p className="text-[12.5px] text-err">Not every try went well: look at their runs in the app's runs before you use these steps.</p>}
      </div>
    </Dialog>
  );
}
