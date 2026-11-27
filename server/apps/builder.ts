// What agents build templates with (the App builder, and any session): app_get reads them (and the ready-made ones,
// to build like them), app_sketch shows the user what a new one would be before anything is made, app_save makes or
// changes one (whole, a patch, or one step), checked first, its mistakes said in plain words; app_try runs its
// examples or a set of answers and waits for what they gave (and looks at its view); app_screen gives it a screen or
// changes one; app_data reads the records it keeps and adds some; app_services lists the free data services the
// ready-made apps use. The same can be done through the app's API (app_api), which asks the user for each change;
// these say more, in fewer calls.
import type { AppDef, AppRecipe, AppTemplate } from '../../shared/apps.ts';
import { MEDIA_LIMITS, type AppAsset } from '../../shared/app-media.ts';
import { cleanRecipe, isActive } from '../../shared/apps.ts';
import type { Flow, Step, StepKind } from '../../shared/app-manifest.ts';
import { allSteps, asText, innerLists, STEP_KINDS, titleOf } from '../../shared/app-manifest.ts';
import { missingIn, pagesFor } from '../../shared/app-ui.ts';
import { estimateRun, estimateText } from '../../shared/app-estimate.ts';
import { APP_SERVICES, type AppService } from '../../shared/app-services.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import { dropEdits, noteBuilder, seenBy, userEditAt } from './edits.ts';
import { collectionsOf, dataOp } from './data.ts';
import { tryExamples } from './examples.ts';
import { dataChanged, stepsOf } from './flow.ts';
import { appChanged, startRun, waitFor } from './runs.ts';
import { changeScreen, makeScreen, screensOf } from './screens.ts';
import { adviceOf } from './advice.ts';
import { getApp, getRun, getVersion, lastExampleRuns, listApps, listRuns, listVersions, saveApp, type RunRecord } from './store.ts';
import { putAsset } from './media.ts';
import { lookAtRun } from './look.ts';
import { findApps } from './search.ts';
import { TEMPLATES } from './templates.ts';
import { sketchWeb } from '../webapps/sketch.ts';

/** What saving checks a recipe with, and what follows a save (its packages): from index.ts. */
export interface BuilderHelp {
  problemsOf(raw: unknown): { recipe: AppRecipe; errors: string[]; warnings: string[] };
  prepare(a: AppDef): AppDef;
  /** Whether this server can draw pictures of a view (its capture browser); tests say no. */
  canLook?: () => boolean;
}

/** JSON merge patch (RFC 7386): objects merge, null removes a key, anything else replaces. */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out: Record<string, unknown> = target && typeof target === 'object' && !Array.isArray(target) ? { ...(target as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

/** The recipe with one step changed (its fields merged in), removed, or added after another (or at the end of the main flow). */
export function withStep(raw: Record<string, any>, change: Record<string, unknown>): Record<string, any> {
  const id = String(change.id ?? '');
  if (!id) throw new Error('Name the step to change (step.id)');
  const { remove, after, ...fields } = change as { remove?: boolean; after?: string } & Record<string, unknown>;
  const next = JSON.parse(JSON.stringify(raw)) as Record<string, any>;
  const lists: Step[][] = [];
  const collect = (steps: Step[] | undefined) => {
    if (!Array.isArray(steps)) return;
    lists.push(steps);
    for (const s of steps) for (const inner of innerLists(s)) collect(inner);
  };
  collect(next.flow?.steps);
  for (const f of Object.values((next.flows ?? {}) as Record<string, { steps?: Step[] }>)) collect(f.steps);
  for (const list of lists) {
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) continue;
    if (remove) list.splice(i, 1);
    else list[i] = { ...list[i], ...fields } as Step;
    return next;
  }
  if (remove) throw new Error(`There is no step “${id}”`);
  // A new step: after the one named, else at the end of the main flow.
  if (after) {
    for (const list of lists) {
      const i = list.findIndex((s) => s.id === after);
      if (i >= 0) {
        list.splice(i + 1, 0, { id, ...fields } as Step);
        return next;
      }
    }
    throw new Error(`There is no step “${after}” to put it after`);
  }
  next.flow = { ...(next.flow ?? {}), steps: [...(next.flow?.steps ?? []), { id, ...fields }] };
  return next;
}

/** A template in a few lines, for a list. */
const lineOf = (a: AppDef) => {
  const steps = a.flow ? allSteps(a.flow.steps).length : 0;
  return { id: a.id, name: a.name, address: a.slug, description: a.description || undefined, steps: steps || undefined, examples: a.examples?.length || undefined, screens: a.screens ? Object.keys(a.screens) : undefined, ...(a.ui ? { view: a.ui.pages.map((p) => p.title) } : {}), ...(a.block ? { block: true } : {}), ...(a.sessions === false ? { sessions: false } : {}), ...(a.agents === false ? { agents: false } : {}), link: `/apps/${a.id}` };
};

/** The kinds of step an app uses, in the order they first come (a one-task app: one agent). */
const kindsOf = (r: AppRecipe): StepKind[] => {
  const steps = [...(r.flow ? allSteps(r.flow.steps) : []), ...Object.values(r.flows ?? {}).flatMap((f) => allSteps(f.steps))];
  return steps.length ? [...new Set(steps.map((s) => s.do))] : r.prompt.trim() ? ['agent'] : [];
};

/** A ready-made app in a line: how to read it whole, what it does, and how it is made. */
const readyLine = (t: AppTemplate) => {
  const kinds = kindsOf(t);
  const how = [
    t.flow ? `steps: ${kinds.join(', ')}` : 'one agent task',
    t.ui ? `a view (${t.ui.pages.map((p) => p.title).join(', ')})` : 'no view',
    t.data && Object.keys(t.data).length ? `keeps ${Object.keys(t.data).join(', ')}` : '',
    t.memory ? 'remembers across runs' : '',
    t.home && t.home.editions !== false ? 'runs by itself on its own page' : '',
    t.sessions === false ? 'used on its own page' : '',
    t.block ? 'a block' : '',
    t.secrets?.length ? `needs ${t.secrets.map((k) => k.name).join(', ')}` : '',
  ].filter(Boolean);
  return `- tpl:${t.id} — ${t.name}${t.category ? ` (${t.category})` : ''}: ${t.description} [${how.join('; ')}]`;
};

/** How many lines of a code step a ready-made app shows unless asked for all. */
const CODE_LINES = 40;

/** A ready-made app as app_save takes it, each code step's program cut to its first lines unless `whole`. It names no program: a copy takes the first signed in. */
function readyRecipe(t: AppTemplate, whole: boolean): { recipe: Omit<AppRecipe, 'agent' | 'acpAgent'>; cut: number } {
  const { agent: _agent, acpAgent: _acp, ...recipe } = JSON.parse(JSON.stringify(cleanRecipe(t))) as AppRecipe;
  let cut = 0;
  if (whole) return { recipe, cut };
  for (const f of [recipe.flow, ...Object.values(recipe.flows ?? {})])
    for (const s of f ? allSteps(f.steps) : [])
      if (s.do === 'code') {
        const lines = s.code.split('\n');
        if (lines.length <= CODE_LINES) continue;
        cut++;
        const mark = s.language === 'python' ? '#' : '//';
        s.code = `${lines.slice(0, CODE_LINES).join('\n')}\n${mark} … ${lines.length - CODE_LINES} more lines (app_get with code: true gives them all)`;
      }
  return { recipe, cut };
}

/** A service in a few lines: what it gives, whether it needs a key, how often it may be called, and requests to start from. */
const serviceText = (s: AppService) =>
  [
    `- ${s.name} (${s.hosts.join(', ')}): ${s.about} ${s.keyless ? 'No key needed.' : 'Needs a key (give the app a secret for it).'}${s.perSecond ? ` About ${s.perSecond} requests a second at most.` : ''}${s.cacheSeconds ? ` Its answers stay good for ${s.cacheSeconds >= 3600 ? `${Math.round(s.cacheSeconds / 3600)} h` : `${Math.round(s.cacheSeconds / 60)} min`}.` : ''}`,
    ...(s.examples ?? []).map((x) => `  ${x.what}: ${x.url}`),
  ].join('\n');

/** Words a service is found by. */
const serviceWords = (s: AppService) => [s.id, s.name, s.about, ...s.hosts, ...(s.examples ?? []).map((x) => x.what)].join(' ').toLowerCase();

/** A step of a sketch, in words, as the card shows it: what it is called, its kind, how it runs (for each…), the steps inside it. */
interface SketchStep {
  title: string;
  kind: StepKind;
  how?: string;
  inner?: SketchStep[];
}

/** How a step runs, in a few words, when that is more than once (as an app's page says it). */
const howOf = (s: Step): string | undefined =>
  s.do === 'parallel' ? `${s.branches.length} side by side` : s.do === 'repeat' ? `${s.over !== undefined ? 'for each' : 'until it holds'}${(s.atOnce ?? 1) > 1 ? `, ${s.atOnce} at once` : ''}` : s.do === 'decide' ? 'one way or the other' : undefined;

/** A flow's steps in words, those inside a Decide, a Repeat or side by side one level in. */
function wordsOf(steps: Step[], deep = true): SketchStep[] {
  return steps.map((s) => {
    const inner = deep ? innerLists(s).filter((l) => l !== s.failed).flat() : [];
    const how = howOf(s);
    return { title: titleOf(s), kind: s.do, ...(how ? { how } : {}), ...(inner.length ? { inner: wordsOf(inner, false) } : {}) };
  });
}

const KINDS = new Set<string>(STEP_KINDS.map((k) => k.value));

/** A step's values, each kept short: long text and big values as the start of their text. */
const short = (values: Record<string, unknown>) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, typeof v === 'string' || JSON.stringify(v ?? null).length > 600 ? asText(v, 600) : v]));

/** A run as an agent reads it: how it went, what it gave, each step with its values (shortened), its checks and cost. */
function runOf(r: RunRecord, steps = true) {
  const took = r.startedAt && r.endedAt ? Math.round((r.endedAt - r.startedAt) / 100) / 10 : undefined;
  return {
    run: r.id,
    ...(r.example ? { example: r.example } : {}),
    status: r.status,
    ...(r.result ? { result: r.result } : {}),
    ...(r.reply && !r.result ? { reply: asText(r.reply, 2000) } : {}),
    ...(r.error ? { error: r.error } : {}),
    ...(r.checks ? { checks: r.checks } : {}),
    ...(steps
      ? {
          steps: stepsOf(r.id, { values: true })
            .filter((s) => s.kind !== 'round')
            .map((s) => ({ step: s.path, status: s.status, ...(s.error ? { error: s.error } : {}), ...(s.values ? { values: short(s.values) } : {}) })),
        }
      : {}),
    ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
    ...(took !== undefined ? { seconds: took } : {}),
    ...viewOf(r),
    link: `/apps/runs/${r.id}`,
  };
}

/** How its view took this run's answer: the names its templates use that the answer and the form do not give. */
function viewOf(r: RunRecord) {
  const ui = r.recipe.ui;
  if (!ui || r.flow || r.status !== 'done' || !pagesFor(ui, 'run').length) return {};
  const missing = missingIn(ui, { result: r.result, inputs: r.inputs });
  return { view: missing.length ? { missing, said: 'Its view uses these names, which this run’s answer and answers did not give: they show empty. Change the view, or what the run gives.' } : { ok: 'Every name its view uses had a value.' } };
}

/** Waits for runs to end, at most `ms`, then reads them. */
async function waited(db: RunCtx['deps']['db'], ids: string[], ms: number): Promise<RunRecord[]> {
  const until = Date.now() + ms;
  for (const id of ids) {
    const left = until - Date.now();
    if (left > 0) await waitFor(id, left);
  }
  return ids.map((id) => getRun(db, id)).filter((r): r is RunRecord => !!r);
}

const APP = { type: 'string', description: 'The app: its id or its address.' };

export function builderTools(ctx: RunCtx, help: BuilderHelp): RunTool[] {
  const { db } = ctx.deps;
  const find = (v: unknown): AppDef => {
    const a = typeof v === 'string' && v.trim() ? getApp(db, v.trim()) : null;
    if (!a) throw new Error(`There is no app “${String(v ?? '')}”: app_get lists them`);
    return a;
  };
  return [
    {
      name: 'app_get',
      description:
        "The user's apps (Apps in Hydor: a form, a task or steps, an answer, a view, data, screens, examples). Without app: each one in a line. With app: the whole app as app_save takes it (its format: app_guide's apps and API topics), its screens, how its examples last went, its latest versions (each save that changed it: who saved it and what changed; version: one of them whole, to bring it back with app_save), and what its latest runs say of its steps (advice: steps that failed and had an agent do their work, which want fixing; agent steps that did the same each time, with the fixed steps that could do it for less). The ready-made apps are worked examples to build like: ready: true lists them, each in a line; like: what you will build, in a few words, gives the three closest; app: \"tpl:<id>\" gives one whole, as app_save takes it (each code step's program cut to its first 40 lines unless code: true).",
      inputSchema: {
        type: 'object',
        properties: {
          app: { ...APP, description: 'The app: its id or its address; a ready-made one as tpl:<id>.' },
          version: { type: 'number', description: 'One of its versions, whole (its recipe as it was then).' },
          ready: { type: 'boolean', description: 'The ready-made apps, each in a line: what it does, the kinds of step it uses, whether it has a view, keeps data or runs by itself.' },
          like: { type: 'string', description: 'What the app you will build does, in a few words: the three ready-made apps closest to it.' },
          code: { type: 'boolean', description: 'With a ready-made app: its code steps whole.' },
        },
      },
      annotations: { readOnlyHint: true },
      async run(a) {
        if (typeof a.like === 'string' && a.like.trim()) {
          const list = TEMPLATES.map((t) => ({ ref: `tpl:${t.id}`, app: `tpl:${t.id}`, slug: t.id, recipe: t as AppRecipe, own: false }));
          const { found, matched } = await findApps(db, list, a.like, 3);
          const byId = new Map(TEMPLATES.map((t) => [`tpl:${t.id}`, t]));
          const lines = found.map((f) => byId.get(f.u.ref)).filter((t): t is AppTemplate => !!t).map(readyLine);
          return [matched ? `The ready-made apps closest to “${a.like.trim()}”, best first: read the one or two nearest whole (app: "tpl:<id>") and build the way they do.` : `No ready-made app is close to “${a.like.trim()}”; these are some of them (ready: true lists all).`, ...lines].join('\n');
        }
        if (a.ready) return [`The ready-made apps (${TEMPLATES.length}): read one whole with app: "tpl:<id>", or the closest to what you build with like.`, ...TEMPLATES.map(readyLine)].join('\n');
        if (typeof a.app === 'string' && a.app.trim().startsWith('tpl:')) {
          const id = a.app.trim().slice(4);
          const t = TEMPLATES.find((x) => x.id === id);
          if (!t) return { text: `There is no ready-made app “${id}”: app_get with ready: true lists them`, isError: true };
          const { recipe, cut } = readyRecipe(t, !!a.code);
          return JSON.stringify({ id: `tpl:${t.id}`, said: `A ready-made app, to build like: its recipe is as app_save takes it. Make the user's own app with app_save (a new one), never by changing this one. It names no program (agent): leave it so, and the new app runs with the first signed in here.${cut ? ` ${cut} code step${cut > 1 ? 's are' : ' is'} cut to the first ${CODE_LINES} lines: code: true gives them whole.` : ''}`, recipe }, null, 1);
        }
        if (!a.app) return JSON.stringify({ apps: listApps(db).map(lineOf) }, null, 1);
        const app = find(a.app);
        if (a.version !== undefined) {
          const v = getVersion(db, app.id, Number(a.version));
          if (!v) return { text: `“${app.name}” has no version ${String(a.version)}: app_get lists its latest`, isError: true };
          const { recipe, ...version } = v;
          return JSON.stringify({ id: app.id, version, recipe }, null, 1);
        }
        // An agent that builds it has seen it as it is now (the user's changes too).
        if (seenBy(db, app.id, ctx.key) !== undefined) noteBuilder(db, app.id, ctx.key);
        const last = lastExampleRuns(db, app.id);
        const advice = await adviceOf(ctx.deps, app);
        // What a run takes and costs: the middle of its last finished runs, else a guess from its steps.
        const finished = listRuns(db, { app: app.id, status: ['done'], limit: 30 }).map((r) => ({ ...(r.startedAt && r.endedAt ? { seconds: (r.endedAt - r.startedAt) / 1000 } : {}), ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}) }));
        const guess = estimateRun(app, finished);
        return JSON.stringify(
          {
            id: app.id,
            address: app.slug,
            link: `/apps/${app.id}`,
            recipe: cleanRecipe(app),
            screens: screensOf(db, app),
            examples: (app.examples ?? []).map((e) => ({ id: e.id, ...(last.get(e.id) ? { last: runOf(last.get(e.id)!, false) } : {}) })),
            versions: listVersions(db, app.id, 8).map((v) => ({ ...v, at: new Date(v.at).toISOString() })),
            ...(guess ? { estimate: estimateText(guess) } : {}),
            ...(advice.rescued.length || advice.firm.length
              ? {
                  advice: [
                    ...advice.rescued.map((x) => ({ step: x.step, said: `It failed in ${x.runs} of its last ${x.of} runs and an agent did its work; the last time (run ${x.run}): ${x.error}. Change it so that it works by itself.` })),
                    ...advice.firm.map((f) => ({
                      step: f.step,
                      said: `This agent step did the same in its last ${f.runs} runs (${f.calls.length ? `${f.calls.join(', then ')}, then its answer` : 'its answer, with no tools'}), taking about ${f.agent.seconds} s and $${f.agent.costUsd} a run. These steps could do it in its place: try them on its examples (app_try with the recipe) before you save them.`,
                      steps: f.steps,
                    })),
                  ],
                }
              : {}),
          },
          null,
          1,
        );
      },
    },
    {
      name: 'app_sketch',
      description: [
        'Shows the user a sketch of a new app before anything is made, as a card in the conversation: its name, icon and description, what it asks (the form), what it does (the steps in order, in words), what they get (a made-up answer in its view, or the plain card), a rough time and cost a run, the keys it needs, what you assumed, and your questions as choices to click, with Build it and Change it. Nothing is saved.',
        'Give the draft as app_save takes a recipe (name, description, icon, color, fields, answer, ui if you designed its look, tier, and flow) or, before the steps are worked out, steps: a short list in words ([{ title, kind }]). It is checked as app_save checks it: what must change comes back in words, and no card shows.',
        'Then end your turn and wait: build it (app_save) when the user says Build it (their message has the choices they picked), or change the sketch as they ask.',
        'For a WEB app (something people sign in to, come back to, keep things in, or find on the web: pages, accounts, a database of its own; see the web-app-builder skill) give kind: "web" and the web fields below instead of a form and steps: who, does, keeps, runs, assumed, questions (type: the idea it is closest to, if one).',
      ].join(' '),
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['agent', 'web'], description: 'agent (default): a small tool an agent runs. web: a web app, shown with the web fields.' },
          type: { type: 'string', description: 'Web: the idea it is closest to (landing, internal-tool, saas, agent-app, content-site, ai-app, portfolio, directory, store, booking, courses, marketplace, community, realtime), if one.' },
          who: { type: 'string', description: 'Web: who uses it, in a line ("Mechanics and the front desk of a bike shop").' },
          does: { type: 'array', items: { type: 'string' }, description: 'Web: the few things they do there, each a short line (at most six).' },
          keeps: {
            type: 'array',
            description: 'Web: the kinds of thing it keeps, each { title ("Customers"), line (what is kept of each, in words), who (who may see it: "Only you", "Everyone who signs in") }.',
            items: { type: 'object', properties: { title: { type: 'string' }, line: { type: 'string' }, who: { type: 'string' } }, required: ['title', 'who'] },
          },
          runs: { type: 'string', description: 'Web: where it will run (default: inside this Hydor, signed in as you).' },
          name: { type: 'string' },
          description: { type: 'string', description: 'What it does, in a sentence.' },
          icon: { type: 'string' },
          color: { type: 'string' },
          fields: { type: 'array', items: { type: 'object' }, description: 'Its form, as in a recipe.' },
          answer: { type: 'array', items: { type: 'object' }, description: 'Its answer fields, as in a recipe.' },
          ui: { type: 'object', description: 'Its view, if you designed it (the card shows a made-up answer in it).' },
          tier: { type: 'string', enum: ['quick', 'standard', 'best', 'max'], description: 'The tier its agent thinks with.' },
          prompt: { type: 'string', description: 'The task, for an app that is one agent.' },
          flow: { type: 'object', description: 'Its steps, whole, as in a recipe.' },
          steps: {
            type: 'array',
            description: 'Or its steps in words, in order: each { title: what it does ("Find the forecast"), kind: agent|model|tool|decide|repeat|parallel|app|data|ask|code|value, tier?: for an agent step }.',
            items: { type: 'object', properties: { title: { type: 'string' }, kind: { type: 'string' }, tier: { type: 'string' } }, required: ['title', 'kind'] },
          },
          needs: { type: 'array', description: 'Keys it needs, by name: { name: "OPENWEATHER_KEY", what: "An OpenWeather API key" }.', items: { type: 'object', properties: { name: { type: 'string' }, what: { type: 'string' } }, required: ['name'] } },
          assumed: { type: 'array', items: { type: 'string' }, description: 'What you assumed, each in a short line ("Forecasts for the next 7 days").' },
          questions: {
            type: 'array',
            description: 'At most three questions whose answers change the design, each with its likely answers to click (the first is what you assumed). A choice that brings in an outside service with a key of its own (mail sent out, payments, texts, sign-in with another account) says so in its words ("…and sent to your email: needs a key from a mail service"); assume the one that needs none, where the app works without it.',
            items: { type: 'object', properties: { ask: { type: 'string' }, choices: { type: 'array', items: { type: 'string' } } }, required: ['ask', 'choices'] },
          },
        },
        required: ['name', 'description', 'assumed'],
      },
      annotations: { readOnlyHint: true },
      async run(a, ctx) {
        if (a.kind === 'web') return sketchWeb(a);
        const errors: string[] = [];
        const flow = a.flow && typeof a.flow === 'object' ? (a.flow as Flow) : undefined;
        // Steps in words, while there is no flow yet.
        const worded: SketchStep[] = [];
        if (!flow && Array.isArray(a.steps))
          a.steps.slice(0, 30).forEach((x: unknown, i: number) => {
            const st = (x && typeof x === 'object' ? x : {}) as { title?: unknown; kind?: unknown };
            const title = typeof st.title === 'string' ? st.title.trim().slice(0, 120) : '';
            const kind = typeof st.kind === 'string' ? st.kind.trim() : '';
            if (!title) errors.push(`Step ${i + 1}: say what it does (title)`);
            if (!KINDS.has(kind)) errors.push(`Step ${i + 1}: “${kind || 'nothing'}” is not a kind of step (${[...KINDS].join(', ')})`);
            else if (title) worded.push({ title, kind: kind as StepKind });
          });
        const prompt = typeof a.prompt === 'string' ? a.prompt : '';
        if (!flow && !worded.length && !prompt.trim()) errors.push('Say what it does: its steps (flow, or steps in words), or its task (prompt)');
        // Checked as app_save checks it; a task stands in while its steps are only words.
        const raw = { name: a.name, description: a.description, icon: a.icon, color: a.color, fields: a.fields, answer: a.answer, ui: a.ui, tier: a.tier, flow, prompt: flow ? prompt : prompt.trim() || 'The steps of the sketch.' };
        const { recipe, errors: wrong, warnings } = help.problemsOf(raw);
        errors.push(...wrong);
        if (typeof a.name !== 'string' || !a.name.trim()) errors.push('Give it a name');
        const assumed = (Array.isArray(a.assumed) ? a.assumed : []).filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()).map((x: string) => x.trim().slice(0, 200));
        if (assumed.length > 10) errors.push('Say what you assumed in at most ten lines');
        const questions = (Array.isArray(a.questions) ? a.questions : []).map((q: unknown) => {
          const o = (q && typeof q === 'object' ? q : {}) as { ask?: unknown; choices?: unknown };
          return { ask: typeof o.ask === 'string' ? o.ask.trim().slice(0, 200) : '', choices: (Array.isArray(o.choices) ? o.choices : []).filter((c): c is string => typeof c === 'string' && !!c.trim()).map((c) => c.trim().slice(0, 100)) };
        });
        if (questions.length > 3) errors.push('Ask at most three questions: only those whose answers change the design');
        questions.forEach((q: { ask: string; choices: string[] }, i: number) => {
          if (!q.ask) errors.push(`Question ${i + 1}: write the question (ask)`);
          if (q.choices.length < 2 || q.choices.length > 6) errors.push(`Question ${i + 1}: give two to six choices to click`);
        });
        const needs = (Array.isArray(a.needs) ? a.needs : [])
          .map((k: unknown) => (typeof k === 'string' ? { name: k } : k && typeof k === 'object' ? (k as { name?: unknown; what?: unknown }) : {}))
          .map((k: { name?: unknown; what?: unknown }) => ({ name: typeof k.name === 'string' ? k.name.trim() : '', ...(typeof k.what === 'string' && k.what.trim() ? { what: k.what.trim().slice(0, 160) } : {}) }));
        for (const k of needs) if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(k.name)) errors.push(`A key it needs: “${k.name}” is not a name for the vault (capitals, digits and _, like OPENWEATHER_KEY)`);
        if (errors.length) return { text: `Not shown. Fix these first:\n- ${[...new Set(errors)].join('\n- ')}`, isError: true };
        const steps = recipe.flow ? wordsOf(recipe.flow.steps) : worded.length ? worded : [{ title: 'Do the task', kind: 'agent' as StepKind }];
        // A rough guess from the steps, those in words each counted as a step of its kind.
        const tiers = Array.isArray(a.steps) ? a.steps : [];
        const guess = estimateRun({ prompt: recipe.prompt, tier: recipe.tier, flow: recipe.flow ?? (worded.length ? { steps: worded.map((w, i) => ({ id: `s${i}`, do: w.kind, ...(w.kind === 'agent' && ['quick', 'standard', 'best', 'max'].includes(tiers[i]?.tier) ? { tier: tiers[i].tier } : {}) }) as unknown as Step) } : undefined) });
        return JSON.stringify(
          {
            said: 'The user sees this sketch as a card, with Build it and Change it; nothing is saved. End your turn and wait for their answer: build it with app_save when they say Build it (with the choices they picked), else change the sketch as they ask.',
            sketch: {
              name: recipe.name,
              description: recipe.description,
              icon: recipe.icon,
              color: recipe.color,
              fields: recipe.fields,
              answer: recipe.answer,
              steps,
              view: !!recipe.ui,
              ...(recipe.tier ? { tier: recipe.tier } : {}),
            },
            ...(guess ? { estimate: { seconds: guess.seconds, usd: guess.usd, ...(guess.waits ? { waits: true } : {}), text: estimateText(guess) } } : {}),
            ...(needs.length ? { needs } : {}),
            assumed,
            ...(questions.length ? { questions } : {}),
            ...(warnings.length ? { warnings } : {}),
          },
          null,
          1,
        );
      },
    },
    {
      name: 'app_save',
      description:
        'Makes one of the user\'s apps, or changes one (app: its id or address). Give the whole recipe, or a patch merged into the one saved (JSON merge patch: objects merge, a list replaces, null removes), or step: one step to change by its id (its fields merged in; remove: true removes it; a new id adds it, after: the step it follows). It is checked first: what must change comes back in words and nothing is saved; what may surprise comes back as warnings. Its view is part of it (ui: patch one element with { ui: { elements: { "day-card": { … } } } }); its screens stay as they are (app_screen changes them). Files that come with it (pictures, videos, sounds, data its view shows as asset:<name>) go in assets: a name → a file\'s path on this computer or an https:// address (null removes one); they travel in its .hydor-app. Keys it needs (API keys, tokens) go in recipe.secrets by name, never a value: the user gives them when installing it or before its first run. Say why in a few words.',
      inputSchema: {
        type: 'object',
        properties: {
          app: { ...APP, description: 'The app to change; none: a new one.' },
          recipe: { type: 'object', description: 'The whole app: name, description, icon, color, fields (its form; a question that asks about the person, as their units, currency, country, diet or research fields, says from: "me.units" and starts from what they keep in About you; remember: true starts one from their last answer; type "project" is a select of their projects, its value the project\'s id: the run then works in that project, its folder and its knowledge, and {{project_name}} and {{project_folder}} name it; only the person chooses it freely: runs started with an app key, a public page or a webhook get the question\'s default, a project the person picked, or none, so set a default only when they ask for one), language ("person": its model and agent steps write in the person\'s language; set it on every new app), prompt (a task for one agent) or flow (its steps), answer, ui (its view: how its answer looks and what a click there does; app_guide\'s API topic, Apps: views), data, memory, requires (what it needs here: { plugins: names of Hydor plugins, which must be on before it runs and whose MCP tools a tool step calls as "plugin:<plugin>/<tool>" and its agents have; node, python, commands, models }), flows, examples, tools, limits, agent (leave it out: a new app runs with the first signed in of Claude Code, Codex and Custom, a saved one keeps its own; name one only when the person asks, and a run on one not signed in is refused), model, tier ("quick", "standard", "best" or "max": the tier its agent thinks with, Settings → Models → Tiers, instead of a model by name; it follows the table and works whichever program runs it; pick the lowest that does the job well: quick for short clear jobs, standard for most, best for research and hard reasoning, max rarely; a model by name wins; an agent step has its own), mode…' },
          patch: { type: 'object', description: 'Merged into the app as saved (or into recipe).' },
          step: { type: 'object', description: 'One step: { id, …its fields } changes it; { id, remove: true } removes it; a new id adds it (after: the step it follows; none: at the end).' },
          assets: { type: 'object', additionalProperties: { type: ['string', 'null'] }, description: 'Its own files by name ("cover.jpg"): a path on this computer, an https:// address or a data: address, kept with the app; null removes one.' },
          why: { type: 'string', description: 'What changed, in a few words ("Added a step that checks prices").' },
          force: { type: 'boolean', description: 'Write over changes the user made since you last saved or read it.' },
        },
      },
      async run(a) {
        const prev = a.app ? find(a.app) : null;
        // The user changed it since this agent last saw it: it reads their version first, rather than write over it.
        const seen = prev ? seenBy(db, prev.id, ctx.key) : undefined;
        const edited = prev ? userEditAt(db, prev.id) : undefined;
        if (prev && seen !== undefined && edited !== undefined && edited > seen && !a.force) return { text: `The user changed “${prev.name}” in its editor since you last saved or read it: read it with app_get and build on their version (force: true writes over their changes).`, isError: true };
        let raw: Record<string, any> = (a.recipe && typeof a.recipe === 'object' ? a.recipe : prev ? cleanRecipe(prev) : {}) as Record<string, any>;
        // Where its steps sit in the graph is the user's: a whole recipe without it keeps theirs.
        if (prev?.graph && raw.graph === undefined) raw = { ...raw, graph: prev.graph };
        if (a.patch && typeof a.patch === 'object') raw = mergePatch(raw, a.patch) as Record<string, any>;
        if (a.step && typeof a.step === 'object') raw = withStep(raw, a.step as Record<string, unknown>);
        // A change that names no program keeps the app's own.
        if (prev && raw.agent === undefined) raw = { ...raw, agent: prev.agent, acpAgent: prev.acpAgent };
        if (!prev && !a.recipe && !a.patch) return { text: 'Give the app to make (recipe), or the one to change (app)', isError: true };
        // Its own files: kept first, then named in its assets.
        if (a.assets && typeof a.assets === 'object' && !Array.isArray(a.assets)) {
          const assets: Record<string, AppAsset> = { ...((raw.assets as Record<string, AppAsset> | undefined) ?? prev?.assets ?? {}) };
          const problems: string[] = [];
          for (const [name, from] of Object.entries(a.assets as Record<string, unknown>).slice(0, MEDIA_LIMITS.count)) {
            if (from === null) delete assets[name];
            else if (typeof from === 'string' && from.trim())
              try {
                assets[name] = await putAsset(db, name, /^(https?:|data:)/i.test(from.trim()) ? { url: from.trim() } : { path: from.trim(), cwd: ctx.cwd });
              } catch (e) {
                problems.push(`${name}: ${(e as Error).message}`);
              }
          }
          if (problems.length) return { text: `Not saved. These files could not be kept:\n- ${problems.join('\n- ')}`, isError: true };
          if (Object.keys(assets).length > MEDIA_LIMITS.count) return { text: `Not saved: an app has at most ${MEDIA_LIMITS.count} files.`, isError: true };
          if (Object.values(assets).reduce((n, x) => n + x.bytes, 0) > MEDIA_LIMITS.assets) return { text: `Not saved: an app's files are at most ${MEDIA_LIMITS.assets >> 20} MB together.`, isError: true };
          raw = { ...raw, assets: Object.keys(assets).length ? assets : undefined };
        }
        const { recipe, errors, warnings } = help.problemsOf(raw);
        if (errors.length) return { text: `Not saved. Fix these first:\n- ${errors.join('\n- ')}`, isError: true };
        const saved = help.prepare(saveApp(db, { id: prev?.id, recipe: { ...recipe, screens: prev?.screens }, by: 'agent', why: typeof a.why === 'string' ? a.why : undefined }));
        noteBuilder(db, saved.id, ctx.key);
        appChanged(saved, 'agent');
        if (a.force) dropEdits(db, saved.id, ctx.key);
        const steps = saved.flow ? allSteps(saved.flow.steps).length : 0;
        return [
          `${prev ? 'Saved' : 'Made'} “${saved.name}” (id ${saved.id}, address ${saved.slug}${steps ? `, ${steps} steps` : ''}${saved.examples?.length ? `, ${saved.examples.length} examples` : ''}): /apps/${saved.id}.`,
          warnings.length ? `To look at:\n- ${warnings.join('\n- ')}` : '',
          saved.examples?.length ? 'Try its examples with app_try.' : 'Give it examples (answers with checks) and try them with app_try.',
        ]
          .filter(Boolean)
          .join('\n');
      },
    },
    {
      name: 'app_try',
      description:
        "Tries an app as a test run and waits for it (at most wait seconds): its examples (examples: true, or their ids), or one set of answers (inputs). recipe tries a version that is not saved. Gives each run's status, answer, steps with their values, checks, cost and time, and, for an app with a view, the names its view uses that the run did not give; runs not done when the wait ends can be read again with runs. look: true also gives pictures of the first finished run's answer in its view as a person sees it (on a computer in the dark and in the light, and on a phone): look after you design or change a view, and fix what looks wrong. The user sees a try's answer in its view on its page (link).",
      inputSchema: {
        type: 'object',
        properties: {
          app: APP,
          examples: { description: 'true: all its examples; or a list of their ids.' },
          inputs: { type: 'object', description: 'Answers to its form, for one run.' },
          flow: { type: 'string', description: 'Another of its flows than the main one, for inputs.' },
          recipe: { type: 'object', description: 'Try this version (not saved) instead.' },
          runs: { type: 'array', items: { type: 'string' }, description: 'Read these earlier tries again (no new runs).' },
          wait: { type: 'number', description: 'Seconds to wait (default 180, at most 600).' },
          look: { type: 'boolean', description: 'Also pictures of the first finished run’s answer in its view: a computer in the dark and in the light, and a phone in the dark.' },
        },
      },
      async run(a) {
        const wait = Math.min(600, Math.max(0, Number(a.wait ?? 180) || 0)) * 1000;
        // The answer, and with look the pictures of the first run that finished with one (or why there are none).
        const answer = async (text: string, rs: RunRecord[]) => {
          if (!a.look) return text;
          const shown = rs.find((r) => r.status === 'done' && r.result && !r.flow) ?? rs.find((r) => !isActive(r.status));
          if (!shown) return `${text}\nNo pictures: no try has finished yet (read them again with runs and look: true).`;
          const l = await lookAtRun(shown, help.canLook);
          return l.images.length ? { text: `${text}\n${l.text}`, images: l.images } : `${text}\n${l.text}`;
        };
        if (Array.isArray(a.runs) && a.runs.length) {
          const rs = await waited(db, a.runs.map(String), wait);
          return answer(JSON.stringify({ runs: rs.map((r) => runOf(r)) }, null, 1), rs);
        }
        const app = a.app ? find(a.app) : null;
        let recipe: AppRecipe | null = app;
        if (a.recipe && typeof a.recipe === 'object') {
          const sent = a.recipe as Record<string, unknown>;
          const { recipe: r, errors } = help.problemsOf(app && sent.agent === undefined ? { ...sent, agent: app.agent, acpAgent: app.acpAgent } : sent);
          if (errors.length) return { text: `It cannot run yet:\n- ${errors.join('\n- ')}`, isError: true };
          recipe = r;
        }
        if (!recipe) return { text: 'Name the app (app), or give the recipe to try', isError: true };
        const slug = app?.slug ?? 'test';
        let ids: string[];
        const problems: string[] = [];
        if (a.examples !== undefined && a.examples !== false) {
          if (!recipe.examples?.length) return { text: 'It has no examples yet: add them with app_save (examples: [{ name, inputs, checks }])', isError: true };
          const only = Array.isArray(a.examples) ? a.examples.map(String) : undefined;
          const started = tryExamples({ app, recipe, only, slug });
          for (const s of started) if (s.error) problems.push(`${s.example.id}: ${s.error}`);
          ids = started.filter((s) => s.run).map((s) => s.run!.id);
        } else {
          let r: RunRecord;
          try {
            r = startRun({ app: app?.id ?? 'test', slug, recipe, source: 'test', inputs: (a.inputs && typeof a.inputs === 'object' ? a.inputs : {}) as Record<string, unknown>, ...(typeof a.flow === 'string' && a.flow && a.flow !== 'run' ? { flow: a.flow } : {}) });
          } catch (e) {
            // A plugin or a key it needs, or an answer that does not fit: said as the app's page says it.
            return { text: `It could not start: ${(e as Error).message}`, isError: true };
          }
          ids = [r.id];
        }
        const rs = await waited(db, ids, wait);
        const going = rs.filter((r) => isActive(r.status)).map((r) => r.id);
        return answer(JSON.stringify({ runs: rs.map((r) => runOf(r)), ...(problems.length ? { couldNotStart: problems } : {}), ...(going.length ? { stillRunning: `Read them again later with runs: ${JSON.stringify(going)}` } : {}) }, null, 1), rs);
      },
    },
    {
      name: 'app_screen',
      description:
        "Gives an app a screen (a page of its own that its page shows in place of its form), or changes one. Without html: one made from its parts (its form, its answer, a table for each list it keeps and a conversation with its agent, its runs). With html: a page that uses the App parts (<n-form flow>, <n-result>, <n-runs>, <n-table data>, <n-count data>, <n-button flow>, <n-chat>: a conversation with its agent, who can change its records and run its flows) and window.hydor.app (app_guide's API topic, Apps: screens).",
      inputSchema: {
        type: 'object',
        properties: {
          app: APP,
          name: { type: 'string', description: 'The screen; "main" (the default) opens on its page.' },
          html: { type: 'string', description: 'The whole page; none: one made from its parts (a new screen only).' },
          title: { type: 'string' },
        },
        required: ['app'],
      },
      async run(a) {
        const app = find(a.app);
        const name = typeof a.name === 'string' && a.name.trim() ? a.name.trim() : 'main';
        if (app.screens?.[name]) {
          if (typeof a.html !== 'string' || !a.html.trim()) return { text: `It has a screen “${name}” already: give its html to change it`, isError: true };
          const s = changeScreen(db, app, name, { html: a.html, title: a.title });
          appChanged(app, 'agent');
          return `Changed the screen “${name}” of “${app.name}” (version ${s.version}): /apps/${app.id}`;
        }
        const made = makeScreen(db, app, { name, title: a.title, html: a.html, by: 'agent' });
        const s = made.screen;
        appChanged(made.app, 'agent');
        return `Gave “${app.name}” the screen “${name}”${a.html ? '' : ', made from its parts'}: /apps/${app.id} (its page: /pages/${s.page})`;
      },
    },
    {
      name: 'app_data',
      description:
        'The records one of the user\'s apps keeps (the lists its data names): op "lists" names them, with their fields and how many records each has; "find" lists records by their fields (where, search for words, sort, limit); "search" finds those that answer a question best, by words and by meaning (query); "get" one by its id; "add" one (record), to start an app off with records or try it with some. Changing or removing the user\'s records is done on its screen, or with app_api, which asks the user.',
      inputSchema: {
        type: 'object',
        properties: {
          app: APP,
          op: { type: 'string', enum: ['lists', 'find', 'search', 'get', 'add'] },
          collection: { type: 'string', description: 'The list (all but lists).' },
          query: { type: 'string', description: 'search: the question, in words.' },
          id: { type: 'string', description: 'get: the record’s id.' },
          record: { type: 'object', description: 'add: the new record’s fields.' },
          where: { type: 'object', description: 'find: fields to match, each a value or {"<": 10} (=, !=, <, >, <=, >=, contains, in, empty).' },
          search: { type: 'string', description: 'find: words to look for anywhere in a record.' },
          sort: { type: 'string', description: 'find: the field to sort by, "-field" for highest or latest first.' },
          limit: { type: 'number', description: 'find: at most this many (100 unless set); search: 10 unless set.' },
        },
        required: ['app', 'op'],
      },
      async run(a) {
        const app = find(a.app);
        if (a.op === 'lists') return JSON.stringify({ lists: collectionsOf(db, app.id, app.data) });
        const names = Object.keys(app.data ?? {});
        if (!names.includes(String(a.collection ?? ''))) return { text: `“${app.name}” keeps no list “${String(a.collection ?? '')}”: ${names.length ? `its lists are ${names.join(', ')}` : 'it keeps none yet (give it data with app_save)'}`, isError: true };
        return dataOp(db, app.id, app.data, a, ['find', 'search', 'get', 'add'], (coll) => dataChanged(app.id, coll));
      },
    },
    {
      name: 'app_services',
      description:
        'The free data services the ready-made apps use (forecasts, places, encyclopedia pages, exchange rates…), each with what it gives, a request to start from, whether it needs a key and how often it may be called. Look here before an app calls an address you know only from memory; for a service not listed, read its documentation (read_page) before you use it. query: words to find some (none: all).',
      inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'What the data is about, in a few words ("weather", "currency").' } } },
      annotations: { readOnlyHint: true },
      async run(a) {
        const words = typeof a.query === 'string' ? a.query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2) : [];
        const hits = words.length ? APP_SERVICES.filter((x) => words.some((w) => serviceWords(x).includes(w))) : APP_SERVICES;
        const shown = hits.length ? hits : APP_SERVICES;
        const head = words.length && !hits.length ? `None of the services matched “${String(a.query).trim()}”: these are all of them. For another, read its documentation with read_page before you use it.` : `${shown.length} free service${shown.length > 1 ? 's' : ''} the ready-made apps use (an app's tool step calls one with http_request; send what it asks, and keep within its limits):`;
        return [head, ...shown.map(serviceText)].join('\n');
      },
    },
  ];
}

