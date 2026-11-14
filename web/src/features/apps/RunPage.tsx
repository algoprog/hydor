// One run's page: where it stands (live), its result as a card or table, the agent's reply, what was
// asked, the follow-ups that refined it and a box for the next one, and a link to the full session.
import { useRef, useState, type ReactNode } from 'react';
import { ChevronRight, MessageSquareText, RotateCcw, Square, Trash2 } from 'lucide-react';
import { inputsLine, isActive } from '@shared/apps';
import { del, enc, post } from '../../lib/api';
import { ago } from '../../lib/format';
import { go, openSession } from '../../lib/nav';
import { toast, toastError } from '../../lib/store';
import { Markdown } from '../../components/Markdown';
import { Button, cx, Empty, IconButton, Throbber, useConfirm } from '../../components/ui';
import { PageHeader } from '../layout/PageHeader';
import { useSessionShow } from '../session/show';
import { appPath, runPath, SOURCE_LABEL, useRunDetail, type RunDetail } from './api';
import { AppIcon } from './AppIcon';
import { RunsWith } from './AppPage';
import { AskBox, FollowUps } from './FollowUps';
import { AppForm, formErrors, initialValues, type FormValues } from './Form';
import { RunBody } from './Result';
import { RunSteps } from './Steps';
import { AppView, type ViewCan } from './View';

function Asked({ d }: { d: RunDetail }) {
  const [open, setOpen] = useState(false);
  const fields = d.recipe.fields.filter((f) => (d.run.inputs[f.id] ?? '').trim());
  if (!fields.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-panel px-4 pt-3 pb-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left">
        <ChevronRight size={15} className={cx('shrink-0 text-fg-3 transition-transform', open && 'rotate-90')} />
        <h3 className="flex-1 text-[13.5px] font-semibold">What was asked</h3>
      </button>
      {open && (
        <dl className="mt-2 space-y-2">
          {fields.map((f) => (
            <div key={f.id}>
              <dt className="text-[12px] text-fg-3">{f.label}</dt>
              <dd className="text-[13.5px] break-words whitespace-pre-wrap">{f.type === 'file' ? d.run.inputs[f.id].split('/').pop() : d.run.inputs[f.id]}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** An Ask a person step waiting: its question, and yes or no or its form, answered here (the run goes on). */
export function AnswerCard({ runId, q }: { runId: string; q: NonNullable<RunDetail['question']> }) {
  const [values, setValues] = useState<FormValues>(() => initialValues(q.fields ?? []));
  const [busy, setBusy] = useState(false);
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await post(`/api/apps/runs/${enc(runId)}/answer`, { step: q.step, ...body });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-warn/40 bg-warn/5 px-4 py-3">
      <div className="text-[12px] font-medium text-warn">Needs your answer</div>
      {/* Its values come in as Markdown (a table of rows, a list of lines), so it is read as such; a header's
          first letter in capitals, as a table of a step's rows is headed by its fields' ids ("product"). */}
      <div translate="no">
        <Markdown text={q.question} breaks className="mt-1 text-[14px] leading-relaxed [&_th_.md-cell]:first-letter:uppercase" />
      </div>
      {q.fields ? (
        <div className="mt-3 space-y-3">
          <AppForm fields={q.fields} values={values} files={{}} onChange={(k, v) => setValues((x) => ({ ...x, [k]: v }))} onFile={() => {}} />
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => {
              const errs = formErrors(q.fields!, values, {});
              if (Object.keys(errs).length) return toast(Object.values(errs)[0], 'error');
              void send({ values });
            }}
          >
            Send the answer
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="primary" disabled={busy} onClick={() => void send({ yes: true })}>
            Yes
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => void send({ yes: false })}>
            No
          </Button>
        </div>
      )}
    </section>
  );
}

/** What a run's view may ask of its app, on its owner's pages: everything that fits the run (a ready-made app's records too: an earlier Paper radar's Save). */
export function viewCan(d: RunDetail): ViewCan[] {
  const r = d.run;
  // What it keeps: an app of yours, or a ready-made one (the records of its own, as an Annotation workbench's items).
  const own = r.app !== 'test';
  return [
    'keep',
    'run',
    ...(r.source !== 'test' ? (['again', 'start'] as const) : []),
    ...(own ? (['data'] as const) : []),
    // A one-task run's agent takes follow-ups (a run with steps does not).
    ...(!d.recipe.steps && r.key && !d.noAsks ? (['ask'] as const) : []),
  ];
}

/** A run as its person sees it, on its page and in its session: the result, what was asked, the follow-ups. */
export function RunView({ d, statusExtra, onAsked }: { d: RunDetail; statusExtra?: ReactNode; onAsked?: () => void }) {
  const r = d.run;
  // A step asking you: the card below asks it, and the line above names it.
  const asking = d.question ? d.steps?.find((s) => s.path === d.question!.step)?.title : undefined;
  const progress = d.question && d.progress ? { ...d.progress, waiting: asking ? `“${asking}” needs your answer` : 'Needs your answer' } : d.progress;
  return (
    <>
      <RunBody
        assets={d.recipe.assets}
        run={r}
        progress={progress}
        answer={d.recipe.answer}
        name={d.recipe.name}
        statusExtra={statusExtra}
        reply={d.asks.length ? (d.first ?? '') : undefined}
        followUp={d.asks.at(-1) && { updated: d.asks.at(-1)!.updated && d.recipe.answer.length > 0 }}
        view={
          d.recipe.ui ? (
            <AppView ui={d.recipe.ui} name={d.recipe.name} appId={r.app} run={r} answer={d.recipe.answer} view={d.view} can={viewCan(d)} translate={r.app.startsWith('tpl:')} onAsked={onAsked} assets={d.recipe.assets} />
          ) : undefined
        }
      />
      {d.question && <AnswerCard runId={r.id} q={d.question} />}
      {d.steps && (
        <RunSteps
          steps={d.steps}
          onAgain={
            !isActive(r.status) && r.source !== 'public' && r.source !== 'step' && r.source !== 'app'
              ? (step) =>
                  post<{ run: { id: string } }>(`/api/apps/runs/${enc(r.id)}/again`, { from: step }).then(
                    (x) => go(runPath(x.run.id)),
                    toastError,
                  )
              : undefined
          }
        />
      )}
      <Asked d={d} />
      <FollowUps d={d} />
      {!isActive(r.status) && (d.slug || r.app.startsWith('tpl:')) && (
        <div className="flex justify-center pt-2">
          <Button variant="ghost" icon={<RotateCcw size={14} />} onClick={() => go(`${appPath(r.app)}?again=${enc(r.id)}`)}>
            Run again with these answers
          </Button>
        </div>
      )}
    </>
  );
}

export function RunPage({ id }: { id: string }) {
  const { d, err, load } = useRunDetail(id);
  const [ask, confirmNode] = useConfirm();
  const scroller = useRef<HTMLDivElement>(null);
  const active = d ? isActive(d.run.status) : false;
  if (err && !d) return <Empty title="This run could not be opened">{err}</Empty>;
  const r = d?.run;
  const back = d ? (d.slug ? appPath(r!.app) : r!.app.startsWith('tpl:') ? appPath(r!.app) : '/apps') : '/apps';
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        back={{ label: 'Back to the app', onClick: () => go(back) }}
        title={
          <span className="flex min-w-0 items-center gap-2.5">
            {d && <AppIcon icon={d.recipe.icon} color={d.recipe.color} size={26} />}
            <span className="truncate">{d?.recipe.name ?? 'Run'}</span>
          </span>
        }
        sub={
          r ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {inputsLine(d!.recipe.fields, r.inputs, 70) && (
                <>
                  <span className="truncate text-fg-2" translate="no">
                    {inputsLine(d!.recipe.fields, r.inputs, 70)}
                  </span>
                  <span className="shrink-0">·</span>
                </>
              )}
              <span className="shrink-0">{`${SOURCE_LABEL[r.source]}${r.row ? ` ${r.row}` : ''} · started ${ago(r.createdAt)}`}</span>
            </span>
          ) : undefined
        }
        actions={
          r && (
            <>
              {r.key && (
                <Button
                  size="sm"
                  icon={<MessageSquareText size={14} />}
                  onClick={() => {
                    // Its session opens on the conversation: the result is what this page shows.
                    useSessionShow.getState().show(r.key!, 'conversation');
                    openSession(r.key!);
                  }}
                >
                  <span className="max-sm:hidden">Open the session</span>
                  <span className="sm:hidden">Session</span>
                </Button>
              )}
              {!active && (d!.slug || r.app.startsWith('tpl:')) && r.source !== 'public' && (
                <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => go(`${appPath(r.app)}?again=${enc(r.id)}`)}>
                  <span className="max-sm:hidden">Run again</span>
                </Button>
              )}
              {active ? (
                <Button size="sm" variant="ghost" icon={<Square size={12} />} onClick={() => post(`/api/apps/runs/${enc(id)}/stop`).then(load, toastError)}>
                  Stop
                </Button>
              ) : (
                <IconButton
                  label="Remove from the list"
                  onClick={async () => {
                    if (!(await ask({ title: 'Remove this run?', body: 'It leaves the app’s list of runs. The session stays.', confirm: 'Remove', danger: true }))) return;
                    del(`/api/apps/runs/${enc(id)}`).then(() => go(back), toastError);
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              )}
            </>
          )
        }
      />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {!d ? (
          <div className="flex justify-center py-20 text-fg-3">
            <Throbber size={28} />
          </div>
        ) : (
          <div className="mx-auto max-w-[860px] space-y-3 px-4 py-5 sm:px-6">
            <RunView d={d} onAsked={() => void load()} statusExtra={d.steps ? undefined : <span className="max-sm:hidden"><RunsWith agent={d.recipe.agent} acpAgent={d.recipe.acpAgent} model={d.recipe.model} /></span>} />
            {d.noAsks && d.run.key && <p className="pt-1 text-center text-[12.5px] text-fg-3">{d.noAsks}</p>}
          </div>
        )}
      </div>
      {d?.run.key && !d.noAsks && (
        <AskBox
          d={d}
          onSent={() => {
            // The follow-up shows at the end, where the agent's answer comes.
            load().then(() => requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })));
          }}
        />
      )}
      {confirmNode}
    </div>
  );
}
