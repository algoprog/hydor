// Runs an app's flow (shared/app-manifest.ts) step by step. Each step's record is kept in app_steps as it
// goes, so the run's page shows the steps and a restart carries on where it was: steps that ended keep
// their values and are not run again, an agent step still at work is followed again, a model or tool
// step that was cut off runs again.
//
// An agent step is a run of its own (source "step", this run its parent), so its session, the reminder to
// hand in its outputs and what it spent work as for a one-step app; a call to another app is a run of
// that app (source "app"). A model step asks one of Custom's models (or the helper model) for its outputs
// as JSON; a tool step calls one of the app's own tools that can answer without a conversation; a Keep
// data step adds, finds, changes or removes the app's records (data.ts); Decide, Repeat and At the same
// time run the steps inside them. A public page's run keeps to what a public run
// may do: agent steps in Custom with the page's model, model steps on that model, the web only when
// allowed, no calls to other apps.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AnswerField, AppField, AppRecipe, RunProgress, RunStepView } from '../../shared/apps.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { checkAnswer, cleanRecipe, isActive, PUBLIC_WEB_TOOLS } from '../../shared/apps.ts';
import type { AskStep, CodeStep, DataStep, Flow, RepeatStep, Scope, Step } from '../../shared/app-manifest.ts';
import { allSteps, asText, cleanFlow, evalRule, fillRefs, FLOW_LIMITS, lookup, refsIn, STEP_TOOLS, titleOf, usedFrom, valueOf } from '../../shared/app-manifest.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { extractText } from '../documents/extract.ts';
import { runTools } from '../features/registry.ts';
import { AGENT_FILE } from '../models/config.ts';
import type { RunCtx } from '../features/types.ts';
import { helper } from '../helper.ts';
import { checkDaily } from './api.ts';
import { runCode } from './code.ts';
import { addRecord, findRecords, removeRecords, searchRecords, updateRecords } from './data.ts';
import { fieldLine, finish, formOf, isFlowRun, noteChanged, progressOf, runDeps, runFolder, startRun, stopRun, waitFor, type FlowRunner, type StartInput } from './runs.ts';
import { getApp, getRun, getStep, listSteps, removeSteps, saveStep, updateRun, type RunRecord, type StepRecord } from './store.ts';

/** Public runs' throwaway folders (as for one-step public runs). */
const PUBLIC_DIR = path.join(os.tmpdir(), 'naget-public-runs');

interface Exec {
  run: RunRecord;
  flow: Flow;
  slug: string;
  folder: string;
  /** A public page's run: Custom with this model, the web only when `web`, spending at most `capUsd`. */
  pub?: { model: string; web: boolean; capUsd: number };
  stopping: boolean;
  abort: AbortController;
  /** Runs of its steps going now (agent steps, apps it called), and those of them that wait for the person. */
  children: Set<string>;
  waiting: Set<string>;
  /** Steps as they ended, with their values: the result by name, and the reply. */
  ended: { id: string; kind: Step['do']; values: Record<string, unknown> }[];
  /** A test run tried in the graph: the steps it pauses before, whether it pauses before the next one too, and where it waits now (each with what lets it go on). */
  pause?: { before: Set<string>; next: boolean; at: Map<string, () => void> };
}

const execs = new Map<string, Exec>();

class Stopped extends Error {
  constructor() {
    super('Stopped');
  }
}

const db = () => runDeps().db;


// ---- starting, and carrying on after a restart -------------------------------------------------------------

export interface FlowStart {
  slug: string;
  files?: StartInput['files'];
  public?: StartInput['public'];
  pause?: string[];
}

const safeName = (n: string) => path.basename(String(n || 'file')).replace(/[^\w.\- ()]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';

/** The form's values as the steps see them: a file question gives the file's path (a public run: its text). */
async function inputValues(r: RunRecord, o: FlowStart, folder: string): Promise<Record<string, unknown>> {
  const values: Record<string, unknown> = { ...r.inputs };
  for (const f of formOf(r.recipe, r.flow)) {
    if (f.type !== 'file' || !r.inputs[f.id]) continue;
    const sent = o.files?.[f.id];
    const file = path.join(folder, 'uploads', safeName(sent?.name ?? r.inputs[f.id]));
    if (sent) {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, Buffer.from(sent.data, 'base64'), { mode: 0o600 });
    }
    if (o.public) {
      const doc = await extractText(file).catch(() => null);
      values[f.id] = doc?.text ? doc.text.slice(0, 60_000) : '(This file could not be read as text.)';
    } else values[f.id] = file;
  }
  return values;
}

function execOf(r: RunRecord, o: FlowStart): Exec {
  const folder = o.public ? path.join(PUBLIC_DIR, r.id) : runFolder(r, o.slug);
  const flow = r.flow ? r.recipe.flows![r.flow] : r.recipe.flow!;
  return {
    run: r,
    flow,
    slug: o.slug,
    folder,
    pub: o.public,
    stopping: false,
    abort: new AbortController(),
    children: new Set(),
    waiting: new Set(),
    ended: [],
    ...(o.pause?.length ? { pause: { before: new Set(o.pause), next: false, at: new Map() } } : {}),
  };
}

/** Starts a run's flow in the background; it ends the run itself. */
export function startFlow(r: RunRecord, o: FlowStart) {
  const x = execOf(r, o);
  execs.set(r.id, x);
  void (async () => {
    fs.mkdirSync(x.folder, { recursive: true, mode: 0o700 });
    const inputs = await inputValues(r, o, x.folder);
    updateRun(db(), r.id, { status: 'running', startedAt: Date.now() });
    noteChanged(r.id);
    await go(x, inputs);
  })().catch((e) => end(x, null, 'failed', (e as Error).message || 'It could not start'));
}

/** A flow that was going when the server stopped carries on: what ended stands, the rest runs. */
export function resumeFlow(r: RunRecord) {
  if (execs.has(r.id)) return;
  const a = r.app.startsWith('tpl:') ? null : getApp(db(), r.app);
  const slug = a?.slug ?? (r.app.startsWith('tpl:') ? r.app.slice(4) : 'test');
  let pub: FlowStart['public'];
  if (r.source === 'public') {
    if (!a?.public.model) return void finish(r.id, 'failed', 'The server restarted, and the public page has no model now');
    pub = { model: a.public.model, web: a.public.web, capUsd: r.recipe.limits.capUsd ?? a.public.spendPerDay };
  }
  const x = execOf(r, { slug, public: pub });
  execs.set(r.id, x);
  void (async () => {
    fs.mkdirSync(x.folder, { recursive: true, mode: 0o700 });
    await go(x, await inputValues(r, { slug, public: pub }, x.folder));
  })().catch((e) => end(x, null, 'failed', (e as Error).message));
}

/** Stops a flow: no new step starts, steps at work are interrupted, and the run ends as stopped. */
export function stopFlow(id: string) {
  const x = execs.get(id);
  if (!x) return void finish(id, 'stopped');
  x.stopping = true;
  x.abort.abort();
  for (const c of x.children) void stopRun(c);
  // A paused step goes on, to stop.
  for (const goOn of x.pause?.at.values() ?? []) goOn();
}

/** A test run paused in the graph goes on: to its end (or the next step it pauses before), or `step`: one step, pausing before the next. False: it is not paused. */
export function goOn(id: string, step: boolean): boolean {
  const x = execs.get(id);
  if (!x?.pause?.at.size) return false;
  x.pause.next = step;
  const waiting = [...x.pause.at.values()];
  x.pause.at.clear();
  for (const g of waiting) g();
  return true;
}

/** Waits before a step of a test run tried in the graph, until it is told to go on. */
async function pauseAt(x: Exec, at: string) {
  const p = x.pause!;
  p.next = false;
  x.waiting.add(`paused:${at}`);
  syncStatus(x);
  await new Promise<void>((resolve) => {
    p.at.set(at, resolve);
    noteChanged(x.run.id);
  });
  x.waiting.delete(`paused:${at}`);
  syncStatus(x);
  if (x.stopping) throw new Stopped();
}

async function go(x: Exec, inputs: Record<string, unknown>) {
  const scope: Scope = { inputs, steps: Object.fromEntries(allSteps(x.flow.steps).map((s) => [s.id, null])), vars: { today: new Date().toISOString().slice(0, 10) } };
  try {
    await runList(x, x.flow.steps, scope, '');
    await end(x, scope, 'done');
  } catch (e) {
    await end(x, scope, x.stopping || e instanceof Stopped ? 'stopped' : 'failed', (e as Error).message);
  }
}

// ---- the steps ----------------------------------------------------------------------------------------------

async function runList(x: Exec, steps: Step[], scope: Scope, prefix: string) {
  for (const s of steps) await runOne(x, s, scope, prefix);
}

const LEAF = new Set(['agent', 'model', 'tool', 'app', 'data', 'ask', 'code']);

function record(x: Exec, at: string, s: Step, p: Partial<StepRecord>) {
  const prev = getStep(db(), x.run.id, at);
  saveStep(db(), { run: x.run.id, path: at, id: s.id, kind: s.do, title: titleOf(s), status: 'running', ...prev, ...p });
  noteChanged(x.run.id);
}

async function runOne(x: Exec, s: Step, scope: Scope, prefix: string) {
  if (x.stopping) throw new Stopped();
  const at = `${prefix}${s.id}`;
  const before = getStep(db(), x.run.id, at);
  if (before?.status === 'skipped') return void (scope.steps[s.id] = {});
  if (LEAF.has(s.do) && before?.status === 'done') {
    scope.steps[s.id] = before.outputs ?? {};
    x.ended.push({ id: s.id, kind: s.do, values: before.outputs ?? {} });
    return;
  }
  if (before?.status === 'failed') return failed(x, s, scope, prefix, before.error ?? 'It failed');
  // It failed, and an agent was doing its work: that goes on.
  if (before?.rescued) return rescue(x, s, scope, prefix, before.error ?? 'It failed');
  if (x.pause && !before && (x.pause.before.has(s.id) || x.pause.next)) await pauseAt(x, at);
  if (s.if && !before) {
    let holds: boolean;
    try {
      holds = evalRule(s.if, scope);
    } catch (e) {
      record(x, at, s, { status: 'failed', error: (e as Error).message, startedAt: Date.now(), endedAt: Date.now() });
      return failed(x, s, scope, prefix, (e as Error).message);
    }
    if (!holds) {
      record(x, at, s, { status: 'skipped', startedAt: Date.now(), endedAt: Date.now(), error: 'Its rule did not hold' });
      scope.steps[s.id] = {};
      return;
    }
  }
  record(x, at, s, { status: 'running', startedAt: before?.startedAt ?? Date.now(), error: undefined });
  // What its model calls spend (agent steps' and other apps' runs keep their own).
  const cost = { usd: before?.costUsd ?? 0 };
  const spent = () => (cost.usd ? { costUsd: Math.round(cost.usd * 1e6) / 1e6 } : {});
  let values: Record<string, unknown>;
  try {
    values = await body(x, s, scope, prefix, at, before, cost);
  } catch (e) {
    if (e instanceof Stopped || x.stopping) {
      record(x, at, s, { status: 'stopped', endedAt: Date.now(), ...spent() });
      throw new Stopped();
    }
    const msg = ((e as Error).message || 'It failed').slice(0, 2000);
    record(x, at, s, { status: 'failed', error: msg, endedAt: Date.now(), ...spent() });
    return failed(x, s, scope, prefix, msg);
  }
  scope.steps[s.id] = values;
  x.ended.push({ id: s.id, kind: s.do, values });
  record(x, at, s, { status: 'done', outputs: values, endedAt: Date.now(), ...spent() });
}

/** A step failed: its own steps for that run (then the flow goes on), it is skipped, an agent does its work, or the run stops. */
async function failed(x: Exec, s: Step, scope: Scope, prefix: string, msg: string) {
  scope.steps[s.id] = {};
  if (s.failed === 'agent') return rescue(x, s, scope, prefix, msg);
  if (Array.isArray(s.failed)) return runList(x, s.failed, { inputs: scope.inputs, steps: scope.steps, vars: { ...scope.vars, error: msg } }, prefix);
  if (s.failed === 'skip') return;
  throw new Error(`${titleOf(s)}: ${msg}`);
}

type Cost = { usd: number };

async function body(x: Exec, s: Step, scope: Scope, prefix: string, at: string, before: StepRecord | null, cost: Cost): Promise<Record<string, unknown>> {
  switch (s.do) {
    case 'agent':
      return agentStep(x, s, scope, at, before);
    case 'model':
      return modelStep(x, s, scope, cost);
    case 'tool':
      return toolStep(x, s, scope);
    case 'app':
      return appStep(x, s, scope, at, before);
    case 'data':
      return dataStep(x, s, scope);
    case 'ask':
      return askStep(x, s, scope, at, before);
    case 'code':
      return codeStep(x, s, scope, at);
    case 'decide':
      return decideStep(x, s, scope, prefix, at, before, cost);
    case 'repeat':
      return repeatStep(x, s, scope, prefix, at, cost);
    case 'parallel':
      return parallelStep(x, s, scope, prefix);
  }
}

// ---- agents, and runs of other apps ---------------------------------------------------------------------

/** Most a step may spend: its own cap, within what is left of the run's. */
function capFor(x: Exec, own?: number): number | undefined {
  const runCap = x.pub ? x.pub.capUsd : x.run.recipe.limits.capUsd;
  const left = runCap === undefined ? undefined : Math.max(0.01, runCap - spentSoFar(x));
  const cap = Math.min(own ?? Infinity, left ?? Infinity);
  return Number.isFinite(cap) ? Math.round(cap * 100) / 100 : undefined;
}

/** Instructions with their values; for an agent with files, long values go in files of the run's folder when the whole would be too long. */
function agentPrompt(x: Exec, instructions: string, scope: Scope, at: string): string {
  const whole = fillRefs(instructions, scope);
  if (whole.length <= 28_000) return whole;
  if (x.pub) return fillRefs(instructions, scope, { max: 4000 }).slice(0, 29_000);
  const dir = path.join(x.folder, 'values');
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  const vars = { ...scope.vars };
  const steps = { ...scope.steps };
  // Each long value is written out once, and the instructions say where.
  const out = (v: unknown) => {
    const t = asText(v, 2_000_000);
    if (t.length <= 2000) return v;
    const file = path.join(dir, `${at.replace(/[^\w]+/g, '-')}-${++n}.txt`);
    fs.writeFileSync(file, t);
    return `(${t.length.toLocaleString('en-US')} characters, in the file ${file}: read it there)`;
  };
  const inputs = Object.fromEntries(Object.entries(scope.inputs).map(([k, v]) => [k, out(v)]));
  for (const [id, vals] of Object.entries(steps)) if (vals) steps[id] = Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, out(v)]));
  for (const [k, v] of Object.entries(vars)) vars[k] = out(v);
  return fillRefs(instructions, { inputs, steps, vars }).slice(0, 29_500);
}

/** Follows a run of a step until it ends: the flow waits as it does, and stopping the flow stops it. */
async function follow(x: Exec, childId: string): Promise<RunRecord> {
  x.children.add(childId);
  let stopped = false;
  try {
    for (;;) {
      if (x.stopping && !stopped) {
        stopped = true;
        await stopRun(childId);
      }
      const c = await waitFor(childId, 2500);
      if (!c) throw new Error('Its run is gone');
      if (!isActive(c.status)) return c;
      const waits = c.status === 'waiting';
      if (waits !== x.waiting.has(childId)) {
        if (waits) x.waiting.add(childId);
        else x.waiting.delete(childId);
        syncStatus(x);
      }
    }
  } finally {
    x.children.delete(childId);
    if (x.waiting.delete(childId)) syncStatus(x);
  }
}

/** The run waits when one of its steps waits for the person (an approval, a question), and works otherwise. */
function syncStatus(x: Exec) {
  const r = getRun(db(), x.run.id);
  if (!r || !isActive(r.status)) return;
  const want = x.waiting.size ? 'waiting' : 'running';
  if (r.status !== want) {
    updateRun(db(), r.id, { status: want });
    noteChanged(r.id);
  }
}

/** A short program, run in a sandbox of its own with the values given (server/apps/code.ts). */
async function codeStep(x: Exec, s: CodeStep, scope: Scope, at: string): Promise<Record<string, unknown>> {
  const input = valueOf(s.with ?? {}, scope) as Record<string, unknown>;
  let n = 0;
  const out = await runCode({
    language: s.language,
    code: s.code,
    input,
    slug: x.slug,
    requires: x.run.recipe.requires,
    seconds: s.seconds ?? 20,
    signal: x.abort.signal,
    onCall: (kind, args) => ctxCall(x, scope, at, ++n, kind, args),
  });
  return out.values;
}

/** A call through ctx as a step: its kind, and what it is given, in a step's own words (its values by {{name}}). */
function ctxStep(kind: string, a: Record<string, unknown>, id: string): Step {
  const first = (t: unknown) => String(t ?? '').split('\n').find((l) => l.trim())?.trim().slice(0, 70) ?? '';
  const w = a.with && typeof a.with === 'object' && !Array.isArray(a.with) ? (a.with as Record<string, unknown>) : {};
  // Values given and not named in the words come after them.
  const told = (text: unknown) => {
    const named = new Set(refsIn(String(text ?? '')).map((r) => r.split(/[.[]/)[0]));
    const rest = Object.keys(w).filter((k) => !named.has(k));
    return `${String(text ?? '')}${rest.length ? `\n\n${rest.map((k) => `${k}:\n{{${k}}}`).join('\n\n')}` : ''}`;
  };
  const title = typeof a.title === 'string' && a.title.trim() ? a.title.trim().slice(0, 80) : undefined;
  let raw: Record<string, unknown>;
  if (kind === 'model' || kind === 'agent')
    raw = { do: kind, title: title ?? first(a.instructions), instructions: told(a.instructions), outputs: a.outputs, model: a.model, ...(kind === 'agent' ? { assistant: a.assistant, agent: a.agent, tools: a.tools, capUsd: a.capUsd } : {}) };
  else if (kind === 'tool') raw = { do: 'tool', title: title ?? String(a.tool ?? ''), tool: a.tool, with: w };
  else if (kind === 'ask') raw = { do: 'ask', title: title ?? first(a.question), question: told(a.question), fields: a.fields, waitHours: a.waitHours };
  else if (kind === 'app') raw = { do: 'app', title: title ?? String(a.app ?? ''), app: a.app, with: w };
  else if (kind === 'data')
    raw = { do: 'data', title: title ?? `${String(a.op ?? '')} ${String(a.collection ?? '')}`.trim(), op: a.op, collection: a.collection, with: a.with, record: a.record, where: a.where, search: a.search, query: a.query, mode: a.mode, sort: a.sort, limit: a.limit };
  else throw new Error(`ctx has no “${kind}”: model, agent, tool, ask, data or app`);
  const { flow, errors } = cleanFlow({ steps: [{ ...raw, id }] });
  if (errors.length || !flow?.steps[0]) throw new Error(errors.join('; ') || 'That call could not be made');
  return flow.steps[0];
}

/**
 * One call a code step's program made through ctx, run as a step of its own under it ("main/c3"), and kept: a
 * program that runs again (after a restart) gets what its calls gave then. A call that is not the one made there
 * before means the program took another way: what was kept from there on is not its now.
 */
async function ctxCall(x: Exec, scope: Scope, at: string, n: number, kind: string, a: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (x.stopping) throw new Stopped();
  const step = ctxStep(kind, a, `c${n}`);
  const before = getStep(db(), x.run.id, `${at}/c${n}`);
  if (before && (before.kind !== step.do || before.title !== titleOf(step))) forgetFrom(x.run.id, at, n);
  const own: Scope = { inputs: (a.with && typeof a.with === 'object' ? a.with : {}) as Record<string, unknown>, steps: {}, vars: scope.vars };
  await runOne(x, step, own, `${at}/`);
  return own.steps[step.id] ?? {};
}

/** What a code step's calls from the n-th on left behind, and the steps inside them. */
function forgetFrom(run: string, at: string, n: number) {
  const mine = new RegExp(`^${at.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/c(\\d+)(?:[/#]|$)`);
  removeSteps(db(), run, (path) => {
    const m = mine.exec(path);
    return !!m && Number(m[1]) >= n;
  });
}

// ---- Ask a person ------------------------------------------------------------------------------------------

/** Ask a person steps waiting now (by run and path): an answer ends the wait with its values. */
const asking = new Map<string, (values: Record<string, unknown>) => void>();

/**
 * Waits for the person: the run waits (Needs you), a notice opens its page, and the inbox lists it. The
 * question as it was asked stays on the step's record while it waits, so a restart asks the same.
 */
async function askStep(x: Exec, s: AskStep, scope: Scope, at: string, before: StepRecord | null): Promise<Record<string, unknown>> {
  if (x.pub) throw new Error('A run from a public page cannot ask a person');
  const again = before?.status === 'waiting' && typeof before.outputs?.question === 'string';
  const question = again ? String(before!.outputs!.question) : fillRefs(s.question, scope).slice(0, 4000);
  const since = before?.startedAt ?? Date.now();
  record(x, at, s, { status: 'waiting', outputs: { question } });
  const key = `${x.run.id}:${at}`;
  x.waiting.add(`ask:${at}`);
  syncStatus(x);
  if (!again)
    runDeps().sessions.emit('notify', { key: `app-ask:${key}`, kind: 'waiting', title: x.run.appName, body: question.slice(0, 200), agent: 'claude', at: Date.now(), url: `/apps/runs/${encodeURIComponent(x.run.id)}` } satisfies NotifyEvent);
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const left = (s.waitHours ?? 168) * 3_600_000 - (Date.now() - since);
      const timer = setTimeout(() => done(() => reject(new Error('Nobody answered in time'))), Math.max(1000, Math.min(left, 2 ** 31 - 1)));
      const onStop = () => done(() => reject(new Stopped()));
      const done = (f: () => void) => {
        clearTimeout(timer);
        x.abort.signal.removeEventListener('abort', onStop);
        asking.delete(key);
        f();
      };
      x.abort.signal.addEventListener('abort', onStop, { once: true });
      asking.set(key, (values) => done(() => resolve(values)));
    });
  } finally {
    x.waiting.delete(`ask:${at}`);
    syncStatus(x);
  }
}

/** A step of a run that asks the person now: where it is, what it asks, and its form (none: yes or no). */
export function askOf(r: RunRecord): { step: string; question: string; fields?: AppField[]; since: number } | null {
  const st = listSteps(db(), r.id).find((x) => x.kind === 'ask' && x.status === 'waiting');
  if (!st) return null;
  const flow = r.flow ? r.recipe.flows?.[r.flow] : r.recipe.flow;
  const s = flow ? allSteps(flow.steps).find((x) => x.id === st.id) : undefined;
  return { step: st.path, question: String(st.outputs?.question ?? ''), ...(s?.do === 'ask' && s.fields?.length ? { fields: s.fields } : {}), since: st.startedAt ?? r.createdAt };
}

/** The person's answer to a run's waiting step: false when nothing waits for it there (now). */
export function answerAsk(runId: string, path: string, values: Record<string, unknown>): boolean {
  const f = asking.get(`${runId}:${path}`);
  if (!f) return false;
  f(values);
  return true;
}

async function agentStep(x: Exec, s: Extract<Step, { do: 'agent' }>, scope: Scope, at: string, before: StepRecord | null): Promise<Record<string, unknown>> {
  let childId = before?.childRun && getRun(db(), before.childRun) ? before.childRun : undefined;
  if (!childId) {
    const recipe = x.run.recipe;
    const other = !!s.agent && s.agent !== recipe.agent;
    const child = cleanRecipe({
      name: `${recipe.name} · ${titleOf(s)}`,
      icon: recipe.icon,
      color: recipe.color,
      description: '',
      assistant: s.assistant ?? recipe.assistant,
      agent: s.agent ?? recipe.agent,
      acpAgent: s.acpAgent ?? (other ? undefined : recipe.acpAgent),
      model: s.model ?? (other ? undefined : recipe.model),
      effort: s.effort ?? (other ? undefined : recipe.effort),
      mode: s.mode ?? recipe.mode,
      cwd: x.pub ? undefined : x.folder,
      prompt: agentPrompt(x, s.instructions, scope, at),
      fields: [],
      answer: s.outputs ?? [],
      tools: s.tools !== undefined ? s.tools : recipe.tools,
      limits: { capUsd: capFor(x, s.capUsd) },
    });
    const pub = x.pub ? { ...x.pub, capUsd: capFor(x, s.capUsd) ?? x.pub.capUsd } : undefined;
    childId = startRun({ app: x.run.app, slug: x.slug, recipe: child, source: 'step', inputs: {}, parent: x.run.id, step: at, public: pub }).id;
    record(x, at, s, { childRun: childId });
  }
  const done = await follow(x, childId);
  if (done.status !== 'done') throw new Error(done.error || (done.status === 'stopped' ? 'Its agent was stopped' : 'Its agent did not finish'));
  if (s.outputs?.length && !done.result) throw new Error(`Its agent did not hand in ${s.outputs.map((f) => f.id).join(', ')}`);
  return { ...(done.result ?? {}), reply: done.reply ?? '' };
}

// ---- an agent in a failed step's place -------------------------------------------------------------------

const OWED_TYPE: Record<string, AnswerField['type']> = { count: 'number', found: 'yesno', yes: 'yesno', meaning: 'yesno' };
/** Values that are lists or records: handed in as JSON, and read back. */
const STRUCTURED = new Set(['records', 'record', 'first', 'items', 'last', 'data', 'result']);

/** What a failed step owes the rest of the flow, as fields its agent hands in: a model step's outputs, else the values others use of it. */
export function owedBy(r: AppRecipe, s: Step): AnswerField[] {
  if (s.do === 'model' && s.outputs?.length) return s.outputs;
  const used = usedFrom(r, s.id).filter((n) => n !== 'reply');
  const names = used.length ? used : s.do === 'model' || s.do === 'tool' ? ['text'] : s.do === 'code' ? ['result'] : [];
  return names.map((id) => ({ id, label: id, type: OWED_TYPE[id] ?? 'markdown', ...(STRUCTURED.has(id) ? { description: 'A list or a record: as JSON' } : {}) }));
}

/** What the step was to do, with the values it was given, for the agent that does it instead. */
function stepTask(s: Step, scope: Scope): string {
  const vals = (v: unknown) => asText(valueOf(v ?? {}, scope), 12_000);
  switch (s.do) {
    case 'tool':
      return `It calls the tool ${s.tool} with:\n${vals(s.with)}`;
    case 'model':
      return `It asks a model, with no tools:\n<instructions>\n${fillRefs(s.instructions, scope).slice(0, 20_000)}\n</instructions>`;
    case 'code':
      return `It runs this ${s.language === 'python' ? 'Python' : 'JavaScript'} program (the body of a function of input, which returns its values), with input:\n${vals(s.with)}\n\n\`\`\`\n${s.code.slice(0, 20_000)}\n\`\`\``;
    case 'data':
      return `It ${{ add: 'adds a record to', get: 'gets a record of', find: 'finds records of', search: 'searches', update: 'changes records of', remove: 'removes records of' }[s.op]} the template's list “${s.collection}”, with: ${vals({ with: s.with, record: s.record, where: s.where, search: s.search, query: s.query, sort: s.sort, limit: s.limit })}\nUse the tools you have for the template's lists.`;
    case 'app':
      return `It runs the template “${s.app}” with:\n${vals(s.with)}`;
    default:
      return '';
  }
}

/** A step that failed hands its work to an agent (failed: "agent"): what it was to do and with what, why it failed, and the values the rest of the flow wants of it; the run goes on with what the agent hands in. */
async function rescue(x: Exec, s: Step, scope: Scope, prefix: string, msg: string) {
  const at = `${prefix}${s.id}`;
  const before = getStep(db(), x.run.id, at);
  const owed = owedBy(x.run.recipe, s);
  let childId = before?.rescued && before.childRun && getRun(db(), before.childRun) ? before.childRun : undefined;
  if (!childId) {
    const recipe = x.run.recipe;
    const prompt = [
      `A step of the template “${recipe.name}” failed. Do its work in its place, so that the run can go on.`,
      '',
      `The step: “${titleOf(s)}”. ${stepTask(s, scope)}`,
      '',
      `It failed: ${msg}`,
      '',
      owed.length ? `Do what it was to do, then hand in what it would have given: ${owed.map((f) => f.id).join(', ')}${owed.some((f) => STRUCTURED.has(f.id)) ? ' (lists and records as JSON)' : ''}.` : 'Do what it was to do.',
      'Do only this step’s work: the rest of the run carries on after you.',
    ].join('\n');
    const child = cleanRecipe({
      name: `${recipe.name} · ${titleOf(s)}`,
      icon: recipe.icon,
      color: recipe.color,
      description: '',
      assistant: recipe.assistant,
      agent: recipe.agent,
      acpAgent: recipe.acpAgent,
      model: recipe.model,
      effort: recipe.effort,
      mode: recipe.mode,
      cwd: x.pub ? undefined : x.folder,
      prompt,
      fields: [],
      answer: owed,
      tools: recipe.tools,
      limits: { capUsd: capFor(x) },
    });
    const pub = x.pub ? { ...x.pub, capUsd: capFor(x) ?? x.pub.capUsd } : undefined;
    childId = startRun({ app: x.run.app, slug: x.slug, recipe: child, source: 'step', inputs: {}, parent: x.run.id, step: at, public: pub }).id;
    record(x, at, s, { status: 'running', rescued: true, childRun: childId, error: msg, endedAt: undefined });
  }
  const done = await follow(x, childId);
  if (x.stopping) {
    record(x, at, s, { status: 'stopped', endedAt: Date.now() });
    throw new Stopped();
  }
  if (done.status !== 'done' || (owed.length && !done.result)) {
    const why = done.status !== 'done' ? done.error || 'it did not finish' : `it did not hand in ${owed.map((f) => f.id).join(', ')}`;
    const all = `${msg} (and the agent in its place: ${why})`;
    record(x, at, s, { status: 'failed', error: all.slice(0, 2000), endedAt: Date.now() });
    throw new Error(`${titleOf(s)}: ${all}`);
  }
  const values: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(done.result ?? {})) {
    if (STRUCTURED.has(k) && typeof v === 'string' && /^\s*[[{]/.test(v)) {
      try {
        values[k] = JSON.parse(v);
        continue;
      } catch {}
    }
    values[k] = v;
  }
  if (usedFrom(x.run.recipe, s.id).includes('reply')) values.reply = done.reply ?? '';
  scope.steps[s.id] = values;
  x.ended.push({ id: s.id, kind: s.do, values });
  record(x, at, s, { status: 'done', outputs: values, endedAt: Date.now() });
}

/** How deep a run is in apps calling apps. */
function depthOf(r: RunRecord): number {
  let n = 0;
  for (let p = r.parent; p && n < 10; n++) p = getRun(db(), p)?.parent;
  return n;
}

async function appStep(x: Exec, s: Extract<Step, { do: 'app' }>, scope: Scope, at: string, before: StepRecord | null): Promise<Record<string, unknown>> {
  if (x.pub) throw new Error('A run from a public page cannot call other apps');
  let childId = before?.childRun && getRun(db(), before.childRun) ? before.childRun : undefined;
  if (!childId) {
    const target = getApp(db(), s.app);
    if (!target) throw new Error(`There is no template “${s.app}”`);
    if (depthOf(x.run) >= 3) throw new Error('Apps call each other too deep here (three levels at most)');
    checkDaily(db(), target);
    const given = valueOf(s.with ?? {}, scope) as Record<string, unknown>;
    // The other app's form takes text, numbers and yes or no: lists and tables go in as text.
    const inputs = Object.fromEntries(Object.entries(given).map(([k, v]) => [k, v !== null && typeof v === 'object' ? asText(v) : v]));
    childId = startRun({ app: target.id, slug: target.slug, recipe: target, source: 'app', inputs, parent: x.run.id, step: at }).id;
    record(x, at, s, { childRun: childId });
  }
  const done = await follow(x, childId);
  if (done.status !== 'done') throw new Error(done.error || (done.status === 'stopped' ? 'Its run was stopped' : 'Its run did not finish'));
  return { ...(done.result ?? {}), reply: done.reply ?? '' };
}

// ---- models ------------------------------------------------------------------------------------------------

const STEP_SYSTEM = 'You do one step of an app that runs on its own (Naget Agent): what you answer goes to its next step, not to a person, and nobody can answer questions back.';

/** One answer from the step's model (the public page's, or the helper model); what it cost goes on the step. */
async function ask(x: Exec, system: string, prompt: string, model: string | undefined, cost: Cost): Promise<string> {
  if (x.stopping) throw new Stopped();
  if (model && !x.pub && !customModelIds().includes(model)) throw new Error(`It asks for the model “${model}”, which is not set up here: add it in Settings → Models, or pick another for this step`);
  return helper(db(), { system, prompt, model: x.pub ? x.pub.model : model, timeoutMs: 180_000, signal: x.abort.signal, onCost: (usd) => (cost.usd += usd) });
}

/** The ids of Custom's models on this computer. */
function customModelIds(): string[] {
  try {
    return (JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? []).map((m: { id: string }) => m.id);
  } catch {
    return [];
  }
}

const firstObject = (t: string): unknown => {
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i < 0 || j <= i) return null;
  try {
    return JSON.parse(t.slice(i, j + 1));
  } catch {
    return null;
  }
};

/** Outputs as JSON from a model: asked once more, with what was wrong, when its first answer does not fit. */
async function askOutputs(x: Exec, prompt: string, outputs: AnswerField[], model: string | undefined, cost: Cost): Promise<Record<string, unknown>> {
  const system = [STEP_SYSTEM, 'Answer with one JSON object and nothing else (no Markdown fence), with these fields:', ...outputs.map(fieldLine), 'Where something cannot be known from what you are given, say so in that field rather than leaving it out.'].join('\n');
  let text = await ask(x, system, prompt, model, cost);
  let c = checkAnswer(outputs, firstObject(text));
  if (c.ok) return c.value;
  text = await ask(x, system, `${prompt}\n\n---\nYour last answer did not fit:\n${c.errors.map((e) => `- ${e}`).join('\n')}\nAnswer again with the whole JSON object.`, model, cost);
  c = checkAnswer(outputs, firstObject(text));
  if (c.ok) return c.value;
  throw new Error(`The model's answer did not fit its outputs: ${c.errors.join('; ')}`);
}

async function modelStep(x: Exec, s: Extract<Step, { do: 'model' }>, scope: Scope, cost: Cost): Promise<Record<string, unknown>> {
  const prompt = fillRefs(s.instructions, scope).slice(0, 100_000);
  if (!s.outputs?.length) {
    const text = await ask(x, `${STEP_SYSTEM} Do what is asked and answer with the result itself: no preamble.`, prompt, s.model, cost);
    return { text: text.trim() };
  }
  return askOutputs(x, prompt, s.outputs, s.model, cost);
}

/** A question in words, answered yes or no by the helper model (or the public page's model). */
async function judge(x: Exec, question: string, cost: Cost): Promise<{ yes: boolean; why: string }> {
  const out = await askOutputs(
    x,
    question,
    [
      { id: 'yes', label: 'Yes', type: 'yesno', required: true, description: 'true for yes, false for no' },
      { id: 'why', label: 'Why', type: 'text', required: true, description: 'One short sentence' },
    ],
    undefined,
    cost,
  );
  return { yes: out.yes === true, why: String(out.why ?? '').slice(0, 300) };
}

// ---- tools ------------------------------------------------------------------------------------------------

async function toolStep(x: Exec, s: Extract<Step, { do: 'tool' }>, scope: Scope): Promise<Record<string, unknown>> {
  if (!STEP_TOOLS.includes(s.tool)) throw new Error(`${s.tool} cannot run as a step on its own: use it in an Ask an agent step`);
  if (x.pub && !(x.pub.web && PUBLIC_WEB_TOOLS.includes(s.tool))) throw new Error(`A run from a public page cannot use ${s.tool}`);
  const allowed = x.run.recipe.tools;
  if (allowed && !allowed.includes(s.tool)) throw new Error(`The template does not let its runs use ${s.tool} (Tools, in its settings)`);
  const ctx: RunCtx = { runId: `flow-${x.run.id}`, key: `acp:flow-${x.run.id}`, agent: 'acp', acpAgent: CONSOLE_ID, cwd: x.folder, deps: runDeps(), signal: x.abort.signal, notice: { url: `/apps/runs/${encodeURIComponent(x.run.id)}`, title: x.run.appName } };
  const tool = runTools(ctx).find((t) => t.name === s.tool);
  if (!tool) throw new Error(`The tool ${s.tool} is not here: is its part of the app turned on?`);
  const out = await tool.run(valueOf(s.with ?? {}, scope) as Record<string, unknown>, ctx);
  const text = typeof out === 'string' ? out : out.text;
  if (typeof out === 'object' && out.isError) throw new Error(text.slice(0, 800) || 'The tool failed');
  const values: Record<string, unknown> = { text: text.slice(0, 200_000) };
  if (/^\s*[[{]/.test(text)) {
    try {
      values.data = JSON.parse(text);
    } catch {}
  }
  return values;
}

// ---- what the app keeps -----------------------------------------------------------------------------------------

/** The app's data: its collections as its own recipe says (a run of a step goes by its parent's). */
function dataOf(r: RunRecord) {
  return r.recipe.data ?? (r.parent ? getRun(db(), r.parent)?.recipe.data : undefined) ?? (r.app.startsWith('tpl:') ? undefined : getApp(db(), r.app)?.data);
}

async function dataStep(x: Exec, s: DataStep, scope: Scope): Promise<Record<string, unknown>> {
  // What a public page's visitors run never reaches the owner's data.
  if (x.pub) throw new Error('A run from a public page cannot use the data the template keeps');
  const data = dataOf(x.run);
  const app = x.run.app;
  const id = s.record ? asText(valueOf(s.record, scope)).trim() : undefined;
  const where = s.where ? (valueOf(s.where, scope) as Record<string, unknown>) : undefined;
  const set = s.with ? (valueOf(s.with, scope) as Record<string, unknown>) : {};
  const q = { id: id || undefined, where, search: s.search ? fillRefs(s.search, scope) : undefined, sort: s.sort, limit: s.limit };
  if (s.record && !id) throw new Error('Which record: its id is empty');
  switch (s.op) {
    case 'add': {
      const record = addRecord(db(), app, data, s.collection, set);
      dataChanged(app, s.collection);
      return { record, id: record.id };
    }
    case 'get': {
      const record = findRecords(db(), app, data, s.collection, q).records[0] ?? null;
      return { record, found: !!record };
    }
    case 'find': {
      const { records, count } = findRecords(db(), app, data, s.collection, q);
      return { records, count, first: records[0] ?? null };
    }
    case 'search': {
      const { records, count, meaning } = await searchRecords(db(), app, data, s.collection, fillRefs(s.query ?? '', scope), { mode: s.mode, limit: s.limit });
      return { records, count, first: records[0] ?? null, meaning };
    }
    case 'update': {
      const records = updateRecords(db(), app, data, s.collection, q, set);
      if (records.length) dataChanged(app, s.collection);
      return { records, count: records.length };
    }
    case 'remove': {
      const count = removeRecords(db(), app, data, s.collection, q);
      if (count) dataChanged(app, s.collection);
      return { count };
    }
  }
}

/** Pages showing the app's data hear that a collection changed. */
export function dataChanged(app: string, collection: string) {
  runDeps().broadcast({ t: 'feature', id: 'apps', data: { data: { app, collection } } });
}

// ---- Decide, Repeat, At the same time ------------------------------------------------------------------------

async function decideStep(x: Exec, s: Extract<Step, { do: 'decide' }>, scope: Scope, prefix: string, at: string, before: StepRecord | null, cost: Cost): Promise<Record<string, unknown>> {
  // The way it went before a restart stands (a question in words might be answered otherwise now).
  let yes = typeof before?.outputs?.yes === 'boolean' ? (before.outputs.yes as boolean) : undefined;
  let why = typeof before?.outputs?.why === 'string' ? (before.outputs.why as string) : undefined;
  if (yes === undefined) {
    if (s.rule) yes = evalRule(s.rule, scope);
    else ({ yes, why } = await judge(x, fillRefs(s.ask ?? '', scope), cost));
    record(x, at, s, { outputs: { yes, ...(why ? { why } : {}) } });
  }
  await runList(x, yes ? s.then : (s.else ?? []), scope, prefix);
  return { yes, ...(why ? { why } : {}) };
}

/** A round's record: the values of the step that collects, or of its last step that has any. */
function collected(s: RepeatStep, inner: Scope): Record<string, unknown> {
  if (s.collect) return inner.steps[s.collect] ?? {};
  for (const t of [...s.steps].reverse()) {
    const v = inner.steps[t.id];
    if (v && Object.keys(v).length) return v;
  }
  return {};
}

function listOf(v: unknown, what: string): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim())
    return v
      .split('\n')
      .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
      .filter(Boolean);
  if (v === null || v === undefined || v === '') return [];
  throw new Error(`${what} is not a list`);
}

async function repeatStep(x: Exec, s: RepeatStep, scope: Scope, prefix: string, at: string, cost: Cost): Promise<Record<string, unknown>> {
  const inside = allSteps(s.steps).map((t) => t.id);
  const round = (n: number, carry: Scope['steps'], vars: Record<string, unknown>): Scope => {
    const steps = { ...carry };
    if (n === 1 || s.over) for (const id of inside) steps[id] = null;
    return { inputs: scope.inputs, steps, vars: { ...scope.vars, ...vars, index: n } };
  };
  const roundAt = (n: number) => `${at}#${n}`;
  const items: Record<string, unknown>[] = [];
  if (s.over) {
    const all = listOf(lookup(s.over.replace(/^\s*\{\{\s*|\s*\}\}\s*$/g, ''), scope).value, s.over);
    const list = all.slice(0, FLOW_LIMITS.items);
    const atOnce = Math.min(s.atOnce ?? 1, Math.max(1, list.length));
    let next = 0;
    let broke: Error | null = null;
    const worker = async () => {
      while (!broke && !x.stopping && next < list.length) {
        const i = next++;
        const inner = round(i + 1, scope.steps, { [s.as ?? 'item']: list[i] });
        const rec = { run: x.run.id, path: roundAt(i + 1), id: s.id, kind: 'round', title: `Item ${i + 1}` };
        if (getStep(db(), x.run.id, rec.path)?.status !== 'done') saveStep(db(), { ...rec, status: 'running', startedAt: Date.now() });
        try {
          await runList(x, s.steps, inner, `${roundAt(i + 1)}/`);
          items[i] = collected(s, inner);
          saveStep(db(), { ...getStep(db(), x.run.id, rec.path)!, status: 'done', outputs: items[i], endedAt: Date.now() });
        } catch (e) {
          broke ??= e as Error;
          saveStep(db(), { ...getStep(db(), x.run.id, rec.path)!, status: x.stopping ? 'stopped' : 'failed', error: (e as Error).message.slice(0, 2000), endedAt: Date.now() });
        }
      }
    };
    await Promise.all(Array.from({ length: atOnce }, worker));
    if (x.stopping) throw new Stopped();
    if (broke) throw broke;
    for (let i = 0; i < list.length; i++) items[i] ??= {};
    const values: Record<string, unknown> = { items, count: items.length, last: items.at(-1) ?? null };
    if (all.length > list.length) values.note = `Only the first ${list.length} of ${all.length} items were gone through`;
    return values;
  }
  const max = s.max ?? 5;
  let carry = scope.steps;
  for (let n = 1; n <= max; n++) {
    const inner = round(n, carry, {});
    const p = roundAt(n);
    const prev = getStep(db(), x.run.id, p);
    if (!prev) saveStep(db(), { run: x.run.id, path: p, id: s.id, kind: 'round', title: `Round ${n}`, status: 'running', startedAt: Date.now() });
    await runList(x, s.steps, inner, `${p}/`);
    items.push(collected(s, inner));
    carry = inner.steps;
    // Whether to stop: decided once per round, and kept, so a restart goes the same way.
    let stop = typeof prev?.outputs?.stop === 'boolean' ? (prev.outputs.stop as boolean) : undefined;
    if (stop === undefined) stop = s.until ? evalRule(s.until, inner) : s.untilAsk ? (await judge(x, fillRefs(s.untilAsk, inner), cost)).yes : false;
    saveStep(db(), { ...getStep(db(), x.run.id, p)!, status: 'done', outputs: { ...items[items.length - 1], stop }, endedAt: Date.now() });
    if (stop) break;
  }
  // The last round's values stay in view after the loop, under its steps' names.
  for (const id of inside) scope.steps[id] = carry[id] ?? null;
  return { items, count: items.length, last: items.at(-1) ?? null };
}

async function parallelStep(x: Exec, s: Extract<Step, { do: 'parallel' }>, scope: Scope, prefix: string): Promise<Record<string, unknown>> {
  const results = await Promise.allSettled(s.branches.map((b) => runList(x, b, scope, prefix)));
  if (x.stopping) throw new Stopped();
  const bad = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (bad) throw bad.reason;
  return {};
}

// ---- the end ----------------------------------------------------------------------------------------------

/** What the run spent: its model steps, and the runs of its agent steps and of the apps it called. */
function spentSoFar(x: Pick<Exec, 'run'>): number {
  let usd = 0;
  for (const st of listSteps(db(), x.run.id)) {
    if (st.childRun) usd += getRun(db(), st.childRun)?.costUsd ?? 0;
    // A step an agent stood in for spent its own too, before it failed.
    if (!st.childRun || st.rescued) usd += st.costUsd ?? 0;
  }
  return usd;
}

/** The answer fields, each from the last step that gave a value of its name. */
function byName(answer: AnswerField[], ended: Exec['ended']): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of answer)
    for (let i = ended.length - 1; i >= 0; i--) {
      const v = ended[i].values[f.id];
      if (v !== undefined && v !== null && v !== '') {
        out[f.id] = v;
        break;
      }
    }
  return out;
}

/** The run's reply: what its last agent (or called app) said, else its last model step's text. */
function replyOf(ended: Exec['ended']): string | undefined {
  const pick = (kinds: string[], key: string) => [...ended].reverse().find((e) => kinds.includes(e.kind) && typeof e.values[key] === 'string' && (e.values[key] as string).trim())?.values[key] as string | undefined;
  return (pick(['agent', 'app'], 'reply') ?? pick(['model'], 'text'))?.slice(0, 60_000);
}

async function end(x: Exec, scope: Scope | null, status: 'done' | 'failed' | 'stopped', error?: string) {
  execs.delete(x.run.id);
  const recipe: AppRecipe = x.run.recipe;
  let result: Record<string, unknown> | null = null;
  if (status === 'done' && x.run.flow && scope) {
    // A flow beside the main one gives back its outputs, by their own names (or nothing).
    if (x.flow.outputs) result = Object.fromEntries(Object.entries(x.flow.outputs).map(([k, v]) => [k, valueOf(v, scope)]));
  } else if (status === 'done' && recipe.answer.length && scope) {
    // Its outputs say where answer fields come from; the rest come by name, from the last step that gave one.
    const raw = { ...byName(recipe.answer, x.ended), ...Object.fromEntries(Object.entries(x.flow.outputs ?? {}).map(([k, v]) => [k, valueOf(v, scope)])) };
    const c = checkAnswer(recipe.answer, raw);
    if (c.ok) result = c.value;
    else {
      status = 'failed';
      error = `The steps ended without what the template gives back: ${c.errors.join('; ')}`;
    }
  }
  const costUsd = Math.round(spentSoFar(x) * 10000) / 10000;
  finish(x.run.id, status, error, { result, reply: replyOf(x.ended), costUsd });
  // Its agent steps' costs settle a little later (finish reads them again then): so does the run's.
  setTimeout(() => {
    const later = Math.round(spentSoFar(x) * 10000) / 10000;
    if (later !== getRun(db(), x.run.id)?.costUsd) {
      updateRun(db(), x.run.id, { costUsd: later });
      noteChanged(x.run.id);
    }
  }, 35_000).unref();
  if (x.pub) fs.rm(x.folder, { recursive: true, force: true }, () => {});
}

// ---- for the pages -------------------------------------------------------------------------------------------

/** A run's steps as its page shows them: what ran, how it went, what it gave (shortened), and the run behind an agent step. */
export function stepsOf(runId: string, o: { values?: boolean } = {}): RunStepView[] {
  return listSteps(db(), runId).map((st) => {
    const child = st.childRun ? getRun(db(), st.childRun) : null;
    const cost = st.reused ? undefined : st.rescued ? (child?.costUsd ?? 0) + (st.costUsd ?? 0) : st.childRun ? child?.costUsd : st.costUsd;
    const view: RunStepView = { path: st.path, id: st.id, kind: st.kind, title: st.title, status: child && st.status === 'running' && child.status === 'waiting' ? 'waiting' : st.status };
    if (st.error) view.error = st.error;
    if (cost !== undefined) view.costUsd = Math.round(cost * 10000) / 10000;
    if (st.childRun) view.run = st.childRun;
    if (child?.key) view.session = child.key;
    if (st.reused) view.reused = true;
    if (st.rescued) view.rescued = true;
    else {
      if (st.startedAt) view.startedAt = st.startedAt;
      if (st.endedAt) view.endedAt = st.endedAt;
    }
    if (o.values && st.outputs) {
      const s = JSON.stringify(st.outputs);
      view.values = s.length > 6000 ? Object.fromEntries(Object.entries(st.outputs).map(([k, v]) => [k, asText(v, 1500)])) : st.outputs;
    }
    return view;
  });
}

export const flowRunning = (id: string) => execs.has(id);

/** What a step at a path is called, by its id (the path's last part). */
function titleAt(r: RunRecord, at: string): string {
  const id = at.split(/[/#]/).pop() ?? at;
  const f = r.flow ? r.recipe.flows?.[r.flow] : r.recipe.flow;
  const s = f ? allSteps(f.steps).find((x) => x.id === id) : undefined;
  return s ? titleOf(s) : id;
}

/** How a run with steps is getting on: its steps so far, what its agent at work said last, and what it waits for. */
async function flowProgress(r: RunRecord, publicView: boolean): Promise<RunProgress> {
  const all = stepsOf(r.id).filter((st) => st.kind !== 'round' && st.status !== 'skipped');
  const steps = all.slice(-12).map((st) => ({ title: publicView ? 'A step' : st.title, status: (st.status === 'running' || st.status === 'waiting' ? 'running' : st.status === 'failed' ? 'error' : 'ok') as RunProgress['steps'][number]['status'] }));
  const working = [...all].reverse().find((st) => (st.status === 'running' || st.status === 'waiting') && st.run);
  const child = working?.run ? getRun(db(), working.run) : null;
  const inner = child && isActive(child.status) ? await progressOf(child, publicView) : null;
  // A step asking the person waits for the answer here, on the run's page; an agent's question waits in its session.
  const asking = all.find((st) => st.kind === 'ask' && st.status === 'waiting');
  const paused = [...(execs.get(r.id)?.pause?.at.keys() ?? [])];
  const waiting =
    r.status !== 'waiting'
      ? undefined
      : publicView
        ? 'Waiting'
        : paused.length
          ? `Paused before ${paused.map((p) => `“${titleAt(r, p)}”`).join(' and ')}`
          : asking
          ? `“${asking.title}” needs your answer`
          : `“${working?.title ?? 'A step'}” ${inner?.waiting ? inner.waiting.replace(/^It /, 'needs you: it ').replace(/ in the session$/, ' in its session') : 'waits for you in its session'}`;
  return { steps, said: publicView ? undefined : inner?.said, waiting, ...(publicView ? {} : { own: true as const }), ...(paused.length && !publicView ? { paused } : {}) };
}

/** What runs flows, for runs.ts. */
export const flowRunner: FlowRunner = { start: startFlow, resume: resumeFlow, stop: stopFlow, progress: flowProgress };
