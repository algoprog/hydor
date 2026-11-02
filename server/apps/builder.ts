// What agents build templates with (the App builder, and any session): app_get reads them, app_save makes or
// changes one (whole, a patch, or one step), checked first, its mistakes said in plain words; app_try runs its
// examples or a set of answers and waits for what they gave; app_screen gives it a screen or changes one. The
// same can be done through the app's API (app_api); these say more, in fewer calls.
import type { AppDef, AppRecipe } from '../../shared/apps.ts';
import { cleanRecipe, isActive } from '../../shared/apps.ts';
import type { Step } from '../../shared/app-manifest.ts';
import { allSteps, asText, innerLists } from '../../shared/app-manifest.ts';
import type { RunCtx, RunTool } from '../features/types.ts';
import { dropEdits, noteBuilder, seenBy, userEditAt } from './edits.ts';
import { tryExamples } from './examples.ts';
import { stepsOf } from './flow.ts';
import { appChanged, startRun, waitFor } from './runs.ts';
import { changeScreen, makeScreen, screensOf } from './screens.ts';
import { adviceOf } from './advice.ts';
import { getApp, getRun, lastExampleRuns, listApps, saveApp, type RunRecord } from './store.ts';

/** What saving checks a recipe with, and what follows a save (its packages): from index.ts. */
export interface BuilderHelp {
  problemsOf(raw: unknown): { recipe: AppRecipe; errors: string[]; warnings: string[] };
  prepare(a: AppDef): AppDef;
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
  return { id: a.id, name: a.name, address: a.slug, description: a.description || undefined, steps: steps || undefined, examples: a.examples?.length || undefined, screens: a.screens ? Object.keys(a.screens) : undefined, link: `/apps/${a.id}` };
};

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
    link: `/apps/runs/${r.id}`,
  };
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

const APP = { type: 'string', description: 'The template: its id or its address.' };

export function builderTools(ctx: RunCtx, help: BuilderHelp): RunTool[] {
  const { db } = ctx.deps;
  const find = (v: unknown): AppDef => {
    const a = typeof v === 'string' && v.trim() ? getApp(db, v.trim()) : null;
    if (!a) throw new Error(`There is no template “${String(v ?? '')}”: app_get lists them`);
    return a;
  };
  return [
    {
      name: 'app_get',
      description:
        "The user's templates (Templates in the app: a form, a task or steps, an answer, data, screens, examples). Without app: each one in a line. With app: the whole template as app_save takes it (its format: app_guide's templates and API topics), its screens, how its examples last went, and what its latest runs say of its steps (advice: steps that failed and had an agent do their work, which want fixing; agent steps that did the same each time, with the fixed steps that could do it for less).",
      inputSchema: { type: 'object', properties: { app: APP } },
      annotations: { readOnlyHint: true },
      async run(a) {
        if (!a.app) return JSON.stringify({ templates: listApps(db).map(lineOf) }, null, 1);
        const app = find(a.app);
        // An agent that builds it has seen it as it is now (the user's changes too).
        if (seenBy(db, app.id, ctx.key) !== undefined) noteBuilder(db, app.id, ctx.key);
        const last = lastExampleRuns(db, app.id);
        const advice = await adviceOf(ctx.deps, app);
        return JSON.stringify(
          {
            id: app.id,
            address: app.slug,
            link: `/apps/${app.id}`,
            recipe: cleanRecipe(app),
            screens: screensOf(db, app),
            examples: (app.examples ?? []).map((e) => ({ id: e.id, ...(last.get(e.id) ? { last: runOf(last.get(e.id)!, false) } : {}) })),
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
      name: 'app_save',
      description:
        'Makes one of the user\'s templates, or changes one (app: its id or address). Give the whole recipe, or a patch merged into the one saved (JSON merge patch: objects merge, a list replaces, null removes), or step: one step to change by its id (its fields merged in; remove: true removes it; a new id adds it, after: the step it follows). It is checked first: what must change comes back in words and nothing is saved; what may surprise comes back as warnings. Its screens stay as they are (app_screen changes them). Say why in a few words.',
      inputSchema: {
        type: 'object',
        properties: {
          app: { ...APP, description: 'The template to change; none: a new one.' },
          recipe: { type: 'object', description: 'The whole template: name, description, icon, color, fields (its form), prompt (a task for one agent) or flow (its steps), answer, data, memory, requires, flows, examples, tools, limits, agent, model, mode…' },
          patch: { type: 'object', description: 'Merged into the template as saved (or into recipe).' },
          step: { type: 'object', description: 'One step: { id, …its fields } changes it; { id, remove: true } removes it; a new id adds it (after: the step it follows; none: at the end).' },
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
        if (a.patch && typeof a.patch === 'object') raw = mergePatch(raw, a.patch) as Record<string, any>;
        if (a.step && typeof a.step === 'object') raw = withStep(raw, a.step as Record<string, unknown>);
        if (!prev && !a.recipe && !a.patch) return { text: 'Give the template to make (recipe), or the one to change (app)', isError: true };
        const { recipe, errors, warnings } = help.problemsOf(raw);
        if (errors.length) return { text: `Not saved. Fix these first:\n- ${errors.join('\n- ')}`, isError: true };
        const saved = help.prepare(saveApp(db, { id: prev?.id, recipe: { ...recipe, screens: prev?.screens } }));
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
        "Tries a template as a test run and waits for it (at most wait seconds): its examples (examples: true, or their ids), or one set of answers (inputs). recipe tries a version that is not saved. Gives each run's status, answer, steps with their values, checks, cost and time; runs not done when the wait ends can be read again with runs.",
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
        },
      },
      async run(a) {
        const wait = Math.min(600, Math.max(0, Number(a.wait ?? 180) || 0)) * 1000;
        if (Array.isArray(a.runs) && a.runs.length) {
          const rs = await waited(db, a.runs.map(String), wait);
          return JSON.stringify({ runs: rs.map((r) => runOf(r)) }, null, 1);
        }
        const app = a.app ? find(a.app) : null;
        let recipe: AppRecipe | null = app;
        if (a.recipe && typeof a.recipe === 'object') {
          const { recipe: r, errors } = help.problemsOf(a.recipe);
          if (errors.length) return { text: `It cannot run yet:\n- ${errors.join('\n- ')}`, isError: true };
          recipe = r;
        }
        if (!recipe) return { text: 'Name the template (app), or give the recipe to try', isError: true };
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
          const r = startRun({ app: app?.id ?? 'test', slug, recipe, source: 'test', inputs: (a.inputs && typeof a.inputs === 'object' ? a.inputs : {}) as Record<string, unknown>, ...(typeof a.flow === 'string' && a.flow && a.flow !== 'run' ? { flow: a.flow } : {}) });
          ids = [r.id];
        }
        const rs = await waited(db, ids, wait);
        const going = rs.filter((r) => isActive(r.status)).map((r) => r.id);
        return JSON.stringify({ runs: rs.map((r) => runOf(r)), ...(problems.length ? { couldNotStart: problems } : {}), ...(going.length ? { stillRunning: `Read them again later with runs: ${JSON.stringify(going)}` } : {}) }, null, 1);
      },
    },
    {
      name: 'app_screen',
      description:
        "Gives a template a screen (a page of its own that its page shows in place of its form), or changes one. Without html: one made from its parts (its form, its answer, a table for each list it keeps, its runs). With html: a page that uses the App parts (<n-form flow>, <n-result>, <n-runs>, <n-table data>, <n-count data>, <n-button flow>) and window.naget.app (app_guide's API topic, Templates: screens).",
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
  ];
}

