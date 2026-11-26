// A run as a program outside Hydor reads it, with the app's key (the routes in keyroutes.ts), in one shape that the docs
// (docs/guide/90-api.md, "Apps, from outside") describe and a web app's own server reads: `status` as Hydor has always
// said it (queued, starting, running, waiting, done, failed, stopped: callers rely on it) and `state` in plainer
// words (waiting, working, needs-you, done, failed, stopped), its steps as they go, its result, its error in a
// sentence, what it cost, when it started and ended, and while it waits for a person, the question it asks.
// The page's own routes (/api/apps/runs/:runId…) keep their own shapes.
import type { AnswerField, AppDef, AppField, RunPerson, RunStatus } from '../../shared/apps.ts';
import { checkInputs } from '../../shared/apps.ts';
import { HttpError } from '../auth.ts';
import { answerAsk, askOf, stepsOf } from './flow.ts';
import { isFlowRun } from './runs.ts';
import type { RunRecord } from './store.ts';

/** What a run is doing, in the words a program reads. */
export type KeyStatus = 'waiting' | 'working' | 'needs-you' | 'done' | 'failed' | 'stopped';
/** How far one step has got, in the same words. */
export type KeyStepStatus = 'waiting' | 'working' | 'done' | 'failed' | 'skipped' | 'stopped';

/**
 * Hydor's own words for a run's status, in the words of `state`: not started yet
 * (queued, starting) is waiting, running is working, and Hydor's "waiting" (it stopped on a question for a person) is needs-you.
 */
export const KEY_STATUS: Record<RunStatus, KeyStatus> = {
  queued: 'waiting',
  starting: 'waiting',
  running: 'working',
  waiting: 'needs-you',
  done: 'done',
  failed: 'failed',
  stopped: 'stopped',
};

const STEP_STATUS: Record<string, KeyStepStatus> = { running: 'working', waiting: 'working', done: 'done', failed: 'failed', skipped: 'skipped', stopped: 'stopped' };

export interface KeyStep {
  /** Where in the flow: the step's id, and inside a Repeat's round "loop#2/read". */
  step: string;
  title: string;
  status: KeyStepStatus;
  error?: string;
  costUsd?: number;
  startedAt?: number;
  endedAt?: number;
}

/** A question a run waits on: a form (fields) or a yes or no. */
export interface KeyQuestion {
  /** The step that asks, by its path (what an answer names). */
  step: string;
  /** The question, as it is asked. */
  title: string;
  /** What kind of answer it takes: values for the fields of a form, or yes or no. */
  kind: 'form' | 'yesno';
  fields?: { id: string; label: string; type: string; required?: boolean; help?: string; placeholder?: string; options?: string[]; multi?: boolean; default?: string }[];
  since: number;
}

export interface KeyRun {
  /** The run's id (also under `run`). */
  id: string;
  run: string;
  /** The flow it runs: "run" for the app's main one, else its name. */
  flow: string;
  /** Hydor's own word, as it was always documented: queued, starting, running, waiting, done, failed or stopped. */
  status: RunStatus;
  /** The same moment in plainer words, the one new programs read: waiting, working, needs-you, done, failed or stopped. */
  state: KeyStatus;
  /** Who it acts for, as the signed token the web app sent proved it; null: it acts for nobody (a job of the web app, started with no token); absent: not started by a web app. */
  person?: RunPerson | null;
  inputs?: Record<string, string>;
  steps?: KeyStep[];
  result: Record<string, unknown> | null;
  reply: string | null;
  error?: string;
  costUsd?: number;
  question?: KeyQuestion;
  session: { key: string; url: string } | null;
  /** The reference the caller started it with (`ref`), when it sent one. */
  ref?: string;
  misses?: RunRecord['misses'];
  partial?: Record<string, unknown>;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

/** A step as a program reads it. */
export function keyStep(x: ReturnType<typeof stepsOf>[number]): KeyStep {
  return {
    step: x.path,
    title: x.title,
    status: STEP_STATUS[x.status] ?? 'working',
    ...(x.error ? { error: x.error } : {}),
    ...(x.costUsd !== undefined ? { costUsd: x.costUsd } : {}),
    ...(x.startedAt ? { startedAt: x.startedAt } : {}),
    ...(x.endedAt ? { endedAt: x.endedAt } : {}),
  };
}

const field = (f: AppField): NonNullable<KeyQuestion['fields']>[number] => ({
  id: f.id,
  label: f.label,
  type: f.type,
  ...(f.required ? { required: true } : {}),
  ...(f.help ? { help: f.help } : {}),
  ...(f.placeholder ? { placeholder: f.placeholder } : {}),
  ...(f.options ? { options: f.options } : {}),
  ...(f.multi ? { multi: true } : {}),
  ...(f.default !== undefined && f.default !== '' ? { default: f.default } : {}),
});

/** The question a run is stopped on, when a program may answer it (a flow's Ask a person step). */
export function questionOf(r: RunRecord): KeyQuestion | undefined {
  if (r.status !== 'waiting' || !isFlowRun(r)) return undefined;
  const q = askOf(r);
  if (!q) return undefined;
  return { step: q.step, title: q.question, kind: q.fields ? 'form' : 'yesno', ...(q.fields ? { fields: q.fields.map(field) } : {}), since: q.since };
}

/** The error of a run that failed, in a sentence (a run that fails without a reason still says so). */
const errorOf = (r: RunRecord): string | undefined => r.error || (r.status === 'failed' ? 'The run failed, and Hydor did not say why.' : undefined);

/**
 * A run as a program reads it. `brief` leaves out what can be long (the inputs, steps, result and the answer so far), for a list.
 * `link` makes the address of the session doing the work.
 */
export function keyRun(r: RunRecord, link: (key: string) => string, o: { brief?: boolean } = {}): KeyRun {
  const flow = isFlowRun(r);
  // The steps of a run with a flow, and the calls an agent made to the web app's functions (a step each: a run with no flow has those alone).
  const all = o.brief ? [] : stepsOf(r.id).filter((x) => x.kind !== 'round');
  const steps = !o.brief && (flow || all.length) ? all.map(keyStep) : undefined;
  const question = o.brief ? undefined : questionOf(r);
  const error = errorOf(r);
  return {
    id: r.id,
    run: r.id,
    flow: r.flow ?? 'run',
    status: r.status,
    state: KEY_STATUS[r.status],
    ...(r.person !== undefined ? { person: r.person } : {}),
    ...(r.ref ? { ref: r.ref } : {}),
    ...(o.brief ? {} : { inputs: r.inputs }),
    ...(steps ? { steps } : {}),
    result: o.brief ? null : (r.result ?? null),
    reply: r.reply ?? null,
    ...(error ? { error } : {}),
    ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
    ...(question ? { question } : {}),
    session: r.key ? { key: r.key, url: link(r.key) } : null,
    ...(r.misses?.length ? { misses: r.misses } : {}),
    ...(!o.brief && r.partial ? { partial: r.partial } : {}),
    createdAt: r.createdAt,
    ...(r.startedAt ? { startedAt: r.startedAt } : {}),
    ...(r.endedAt ? { endedAt: r.endedAt } : {}),
  };
}

/**
 * The answer to the question a run waits on (yes or no, or the values of its form, checked as they are on the run's own page), given to the
 * flow. Throws what to say to the caller: 409 when nothing waits for an answer now, 400 when the answer does not fit.
 */
export function answerRun(r: RunRecord, b: { step?: unknown; yes?: unknown; values?: unknown }): void {
  const q = r.status === 'waiting' && isFlowRun(r) ? askOf(r) : null;
  if (!q || (typeof b.step === 'string' && b.step !== q.step)) throw new HttpError(409, 'It does not wait for an answer now');
  let values: Record<string, unknown>;
  if (q.fields) {
    const { values: v, errors } = checkInputs(q.fields, b.values && typeof b.values === 'object' ? (b.values as Record<string, unknown>) : {});
    if (errors.length) throw new HttpError(400, `Check the answer: ${errors.join('; ')}`);
    values = v;
  } else if (typeof b.yes === 'boolean') values = { yes: b.yes };
  else throw new HttpError(400, 'Answer yes or no (yes: true or false)');
  if (!answerAsk(r.id, q.step, values)) throw new HttpError(409, 'It is not ready for the answer yet: try again in a moment');
}

// ---- what the app's flows are ----------------------------------------------------------------------------------

/** One answer field as a program reads it. */
const answerField = (f: AnswerField) => ({
  id: f.id,
  label: f.label,
  type: f.type,
  ...(f.required ? { required: true } : {}),
  ...(f.description ? { description: f.description } : {}),
  ...(f.columns?.length ? { columns: f.columns.map((c) => ({ id: c.id, label: c.label, type: c.type })) } : {}),
});

export interface KeyFlow {
  /** What `flow` is when a run is started: "run" for the app's main flow, else its name. */
  id: string;
  name: string;
  /** The questions of its form, in order: what `inputs` takes. */
  form: NonNullable<KeyQuestion['fields']>;
  /** The fields its answer (`result`) has. */
  answer: ReturnType<typeof answerField>[];
}

/**
 * The app's flows as a program that starts them reads them (`GET /api/apps/:slug/flows`): the main one ("run") and each other by name, each
 * with its form (the questions, their kinds, choices and which are required) and its answer's fields, so a web app's pages need not repeat
 * them by hand. A flow beside the main one gives the answer fields its `outputs` name (all of the app's, when it names none).
 */
export function flowsOf(a: AppDef): { app: { slug: string; name: string; description: string }; flows: KeyFlow[] } {
  const named = Object.entries(a.flows ?? {}).map(([id, f]): KeyFlow => {
    const ids = Object.keys(f.outputs ?? {});
    const fields = ids.length ? ids.map((x) => a.answer.find((y) => y.id === x) ?? ({ id: x, label: x, type: 'text' } as AnswerField)) : a.answer;
    return { id, name: f.title?.trim() || id, form: (f.inputs ?? []).map(field), answer: fields.map(answerField) };
  });
  return {
    app: { slug: a.slug, name: a.name, description: a.description },
    flows: [{ id: 'run', name: a.name, form: a.fields.map(field), answer: a.answer.map(answerField) }, ...named],
  };
}
