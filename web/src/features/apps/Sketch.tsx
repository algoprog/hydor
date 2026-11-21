// A new app's sketch, as the App builder shows it before anything is made (app_sketch): a card in the conversation
// with its face, What it asks (the form as its page asks it), What it does (its steps in order, in words), What you
// get (a made-up answer in its view, or as the plain card), what a run takes and costs, the keys it needs, what the
// agent assumed and its questions as choices to click. Build it sends "Build it" with the choices picked, as your
// message; Change it puts the cursor in the message box. Everything it shows comes from the tool call (its draft,
// and what the check gave back), so it shows again when the conversation is opened later; once you answered, its
// buttons go.
import { useMemo, useState, type ReactNode } from 'react';
import { KeyRound, PencilLine, Sparkles } from 'lucide-react';
import type { AnswerField, AppField, AppRun } from '@shared/apps';
import type { StepKind } from '@shared/app-manifest';
import { STEP_KINDS } from '@shared/app-manifest';
import type { Range } from '@shared/app-estimate';
import { cleanUi } from '@shared/app-ui';
import type { ToolItem } from '@shared/types';
import { tr } from '../../i18n/runtime';
import { composeInsert } from '../../lib/featureEvents';
import { useTimeline } from '../../lib/store';
import { Button, cx, Throbber } from '../../components/ui';
import { AppIcon } from './AppIcon';
import { FormPreview } from './Builder';
import { sampleResult } from './Design';
import { EstimateText } from './Estimate';
import { ResultView } from './Result';
import { ICON, KIND_COLOR } from './stepKinds';
import { AppView } from './View';

interface SketchStep {
  title: string;
  kind: StepKind;
  how?: string;
  inner?: SketchStep[];
}

/** What app_sketch gave back (server/apps/builder.ts). */
interface Sketched {
  sketch: { name: string; description: string; icon: string; color: string; fields: AppField[]; answer: AnswerField[]; steps: SketchStep[]; view: boolean };
  estimate?: { seconds: Range; usd: Range; waits?: boolean };
  needs?: { name: string; what?: string }[];
  assumed?: string[];
  questions?: { ask: string; choices: string[] }[];
}

const KIND_LABEL = Object.fromEntries(STEP_KINDS.map((k) => [k.value, k.label])) as Record<StepKind, string>;

function Part({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cx('min-w-0 px-4 py-3.5 sm:px-5', className)}>
      <h4 className="mb-2.5 text-[12px] font-semibold tracking-wide text-fg-3 uppercase">{title}</h4>
      {children}
    </section>
  );
}

/** Its steps in order, each with its kind's icon, those inside a Repeat, a Decide or side by side one level in. */
function Steps({ steps, inner }: { steps: SketchStep[]; inner?: boolean }) {
  return (
    <ol className={cx('space-y-2', inner && 'mt-2 border-l border-line pl-3')}>
      {steps.map((s, i) => {
        const Icon = ICON[s.kind] ?? Sparkles;
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-panel" title={KIND_LABEL[s.kind]}>
              <Icon size={13} style={{ color: KIND_COLOR[s.kind] }} />
            </span>
            <span className="min-w-0 flex-1 pt-0.5 text-[13px] leading-snug">
              <span translate="no">{s.title}</span>
              <span className="ml-1.5 text-[11.5px] text-fg-3">{[KIND_LABEL[s.kind], s.how].filter(Boolean).join(' · ')}</span>
              {s.inner?.length ? <Steps steps={s.inner} inner /> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A made-up answer in its shape: in its view when the agent designed one, else as the plain card. */
function YouGet({ s, ui }: { s: Sketched['sketch']; ui: ReturnType<typeof cleanUi>['ui'] }) {
  const answer = useMemo(() => s.answer.filter((a) => a.label?.trim()), [s.answer]);
  const run = useMemo<AppRun>(
    () => ({ id: 'sample', app: 'test', appName: s.name, source: 'test', status: 'done', inputs: Object.fromEntries(s.fields.map((f) => [f.id, f.default || f.placeholder?.replace(/^e\.g\.\s*/i, '') || f.label])), result: sampleResult(answer), createdAt: 0 }),
    [answer, s.fields, s.name],
  );
  if (ui) return <AppView ui={ui} name={s.name} appId="test" run={run} answer={answer} can={[]} />;
  if (!answer.length) return <p className="text-[13px] leading-relaxed text-fg-3">No answer fields: the agent’s reply is the answer.</p>;
  return <ResultView answer={answer} result={run.result ?? {}} name={s.name} />;
}

function SketchCard({ out, input, sessionKey, answered }: { out: Sketched; input: Record<string, unknown>; sessionKey: string; answered: boolean }) {
  const s = out.sketch;
  const ui = useMemo(() => (input.ui ? cleanUi(input.ui).ui : undefined), [input.ui]);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [sent, setSent] = useState(false);
  const questions = out.questions ?? [];
  const done = answered || sent;
  const build = () => {
    const lines = questions.flatMap((q, i) => (picked[i] ? [`- ${q.ask} ${picked[i]}`] : []));
    if (composeInsert([tr('Build it.'), ...lines].join('\n'), sessionKey, undefined, { send: true }) === 'sent') setSent(true);
  };
  return (
    <div className="@container my-3 overflow-hidden rounded-2xl border border-line bg-panel" data-app-sketch>
      <header className="flex items-start gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <AppIcon icon={s.icon} color={s.color} size={38} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-semibold" translate="no">
              {s.name}
            </span>
            <span className="rounded-md bg-bg-2 px-1.5 py-px text-[11px] font-medium text-fg-3">A sketch: nothing is made yet</span>
          </div>
          {s.description && (
            <p className="mt-0.5 text-[13px] leading-snug text-fg-2" translate="no">
              {s.description}
            </p>
          )}
        </div>
      </header>
      {/* On a wide card the form and the steps side by side; narrower (a phone), one column. */}
      <div className="grid divide-y divide-line @2xl:grid-cols-2 @2xl:divide-x @2xl:divide-y-0">
        <Part title={tr('What it asks')}>
          <div translate="no">
            <FormPreview fields={s.fields} bare />
          </div>
        </Part>
        <Part title={tr('What it does')}>
          <Steps steps={s.steps} />
          {out.estimate && <EstimateText e={{ ...out.estimate, from: 'steps' }} className="mt-3" />}
        </Part>
      </div>
      <Part title={tr('What you get')} className="border-t border-line">
        <div className="max-h-[460px] overflow-y-auto rounded-xl" translate="no">
          <YouGet s={s} ui={ui} />
        </div>
        <p className="mt-2 text-[12px] text-fg-3">{s.view ? 'A made-up answer, in the view it will have.' : 'A made-up answer, as the plain card shows it.'}</p>
      </Part>
      {(out.needs?.length || out.assumed?.length || questions.length) ? (
        <div className="divide-y divide-line border-t border-line">
          {out.needs?.length ? (
            <Part title={tr('Keys it needs')}>
              <ul className="space-y-1.5 text-[13px]">
                {out.needs.map((k) => (
                  <li key={k.name} className="flex items-start gap-2">
                    <KeyRound size={13} className="mt-0.5 shrink-0 text-fg-3" />
                    <span className="min-w-0">
                      <code className="font-mono text-[12.5px]">{k.name}</code>
                      {k.what && (
                        <span className="text-fg-2" translate="no">
                          {' '}
                          · {k.what}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[12px] text-fg-3">You give them before its first run; they are never part of the app.</p>
            </Part>
          ) : null}
          {out.assumed?.length ? (
            <Part title={tr('What it assumed')}>
              <ul className="list-disc space-y-1 pl-4 text-[13px] leading-snug text-fg-2 marker:text-fg-3" translate="no">
                {out.assumed.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </Part>
          ) : null}
          {questions.length > 0 && (
            <Part title={questions.length > 1 ? tr('Its questions') : tr('Its question')}>
              <div className="space-y-3">
                {questions.map((q, i) => (
                  <div key={i}>
                    <div className="mb-1.5 text-[13px] font-medium" translate="no">
                      {q.ask}
                    </div>
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={q.ask}>
                      {q.choices.map((c) => {
                        const on = picked[i] === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            disabled={done}
                            onClick={() => setPicked((p) => ({ ...p, [i]: on ? '' : c }))}
                            className={cx(
                              'min-h-8 rounded-full px-3 text-[13px] ring-1 transition-colors ring-inset disabled:cursor-default disabled:opacity-60',
                              on ? 'bg-accent-soft text-accent ring-accent/40' : 'bg-bg-1 text-fg-2 ring-line-2 hover:text-fg enabled:hover:ring-accent/40',
                            )}
                            translate="no"
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Part>
          )}
        </div>
      ) : null}
      {!done && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
          <span className="mr-auto text-[12px] text-fg-3">{questions.length ? 'Pick what fits; what you leave is as it assumed.' : 'Nothing is made until you say so.'}</span>
          <Button variant="ghost" icon={<PencilLine size={14} />} onClick={() => composeInsert('', sessionKey, undefined, { focus: true })}>
            Change it…
          </Button>
          <Button variant="primary" onClick={build}>
            Build it
          </Button>
        </footer>
      )}
    </div>
  );
}

/** app_sketch in the conversation: the sketch's card, or why it could not show. */
export function SketchRow({ item, sessionKey }: { item: ToolItem; sessionKey: string }) {
  const t = item.tool;
  // Answered: a message of yours came after it.
  const answered = useTimeline((x) => {
    const items = x.byKey[sessionKey]?.items;
    if (!items) return false;
    const i = items.findIndex((it) => it.id === item.id);
    return i >= 0 && items.slice(i + 1).some((it) => it.kind === 'user');
  });
  const out = useMemo(() => {
    try {
      const o = JSON.parse(t.output ?? '') as Sketched;
      return o?.sketch && Array.isArray(o.sketch.steps) ? o : null;
    } catch {
      return null;
    }
  }, [t.output]);
  if (t.status === 'running' || t.status === 'pending')
    return (
      <div className="my-1.5 flex items-center gap-2 text-[13px] text-fg-2">
        <span className="flex w-4 justify-center text-fg-3">
          <Throbber className="h-3.5" />
        </span>
        Sketching the app…
      </div>
    );
  if (!out)
    return (
      <div className="my-2 rounded-xl bg-bg-2 px-3 py-2 text-[12.5px] whitespace-pre-wrap text-fg-2" translate="no">
        {(t.output ?? '').slice(0, 1200)}
      </div>
    );
  return <SketchCard out={out} input={(t.input ?? {}) as Record<string, unknown>} sessionKey={sessionKey} answered={answered} />;
}
