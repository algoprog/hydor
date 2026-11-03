// Apps: reusable tasks with a form, run from a gallery, the API, MCP or a public page. People see them
// as Templates. One agent does an app's task, or the app follows steps (flow.ts), keeps data between
// runs (data.ts) and, when it remembers, a memory of its own; an app travels as one file (package.ts).
//
//   /api/apps…                 the gallery, apps and their runs (and follow-ups to them), keys, runs over
//                              CSV rows, the data apps keep, installing from a file (signed in)
//   POST /api/apps/:slug/run   a program runs an app with its API key (Authorization: Bearer napp_…),
//                              waiting up to `wait` seconds: {status, result, reply, session, steps}
//   /a-api/:slug…              the public page's form and the visitor's own runs (public.ts)
//   submit_result              on each app run's own MCP server: the answer fields, checked
//   app_data                   on an app run's own MCP server: the records the app keeps
//   use_app                    on every other session's: the user's apps an agent may run for them (use.ts)
import fs from 'node:fs';
import path from 'node:path';
import type { FastifyRequest } from 'fastify';
import type { AppDef, AppRecipe, AppTemplate } from '../../shared/apps.ts';
import { answerSchema, checkAnswer, checkInputs, cleanRecipe, isActive, madeForSessions, PUBLIC_WEB_TOOLS } from '../../shared/apps.ts';
import { checkFlow, cleanData, cleanExamples, cleanFlow, cleanFlows, cleanRequires, allSteps, DATA_LIMITS, STEP_TOOLS } from '../../shared/app-manifest.ts';
import { checkUi, cleanUi, pagesFor, type AppUi } from '../../shared/app-ui.ts';
import { builderTools } from './builder.ts';
import { initAppEdits, noteUserEdit, takeAppEdits } from './edits.ts';
import { isInternal } from '../internal.ts';
import { checkRun, tryExamples } from './examples.ts';
import type { AgentModel } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { runTools } from '../features/registry.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import type { AppRunEnd } from '../scheduler.ts';
import { AGENT_FILE } from '../models/config.ts';
import { noteUserMessage } from '../updates.ts';
import { apiAnswer, checkDaily, waitSeconds } from './api.ts';
import { batchCsv, MAX_ROWS, startBatch, startBatches, stopBatch } from './batch.ts';
import { addRecord, clearData, collectionsOf, dataOp, embedSoon, ensureDataTables, findRecords, removeRecords, searchRecords, updateRecords } from './data.ts';
import { ensureEnv, envLine, envOf, envVars } from './env.ts';
import { answerAsk, askOf, dataChanged, flowRunner, goOn, stepsOf } from './flow.ts';
import { installPackage, packageOf, previewOf, readPackage, zipPackage, type Catalog } from './package.ts';
import { changeScreen, makeScreen, removeScreen, removeScreens, screenHtml, screensOf } from './screens.ts';
import { draftFromSession } from './draft.ts';
import { Limiter } from './limits.ts';
import { publicRoutes } from './public.ts';
import { PUBLIC_RUN_ENV } from './publicRun.ts';
import { adviceOf } from './advice.ts';
import { defaultFolder, folderOf, folderSaved, initFolders, linkFolder, unlinkFolder, unwatch } from './folder.ts';
import { appSchema } from './schema.ts';
import { appChanged, onAppSaved, finish, followUpsOf, formOf, isFlowRun, markOf, noteAgentRun, noteChanged, onFinished, progressOf, reopen, runFolder, runInstructions, runOfCtx, saveResult, setDeps, startRun, startRuns, stopRun, useFlows, waitFor, WORK_DIR } from './runs.ts';
import {
  appOfKey,
  createKey,
  dayStart,
  deleteApp,
  deleteRun,
  deleteRuns,
  ensureTables,
  examplesByVersion,
  getApp,
  getBatch,
  getRun,
  getVersion,
  getView,
  KEY_PREFIX,
  lastExampleRuns,
  listApps,
  listBatches,
  listKeys,
  listRuns,
  listVersions,
  revokeKey,
  runView,
  saveApp,
  setView,
  setAppFlags,
  updateRun,
  usageSince,
  type RunRecord,
} from './store.ts';
import { templateById } from './templates.ts';
import { agentsMay, builtinsOf, isInstalled, setAgents, setInstalled } from './builtins.ts';
import { tellAsker, useAppTool, useNote } from './use.ts';

const keyLimiter = new Limiter();

/** An app by id or address, or a template run as it is ("tpl:<id>"). */
function recipeOf(db: Deps['db'], id: string): { app: AppDef | null; template: AppTemplate | null } {
  if (id.startsWith('tpl:')) {
    const template = templateById(id.slice(4));
    if (!template) throw new HttpError(404, 'No such app');
    return { app: null, template };
  }
  const app = getApp(db, id);
  if (!app) throw new HttpError(404, 'No such app');
  return { app, template: null };
}

/** A ready-made app by its id ("tpl:<id>", or the id alone). */
function builtinOf(id: string): AppTemplate {
  const t = templateById(id.startsWith('tpl:') ? id.slice(4) : id);
  if (!t) throw new HttpError(404, 'No such ready-made app');
  return t;
}

/** A ready-made app that was uninstalled does not run until it is installed again. */
function installedOr409(db: Deps['db'], t: AppTemplate | null) {
  if (t && !isInstalled(db, t.id)) throw new HttpError(409, `${t.name} is not installed: install it again on the Apps page`);
}

/**
 * The view a run's answer shows in: what a test tried; for other runs of the main flow, its app's (or ready-made
 * app's) view as it is now, so a better view shows earlier answers too. Runs of other flows, steps and
 * conversations show their plain answer.
 */
function viewOfRun(db: Deps['db'], r: RunRecord): AppUi | null {
  if (r.flow || r.source === 'step' || r.source === 'chat') return null;
  let ui: AppUi | undefined;
  if (r.source === 'test' || r.app === 'test') ui = r.recipe.ui;
  else if (r.app.startsWith('tpl:')) ui = templateById(r.app.slice(4))?.ui ?? r.recipe.ui;
  else {
    const a = getApp(db, r.app);
    ui = a ? a.ui : r.recipe.ui;
  }
  return ui && pagesFor(ui, 'run').length ? ui : null;
}

/** Custom's models, for the public page's runs. */
function customModels(): { id: string; label: string; provider: string }[] {
  try {
    return (JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? []).map((m: AgentModel) => ({ id: m.id, label: m.label, provider: m.provider }));
  } catch {
    return [];
  }
}

/**
 * What is wrong with a recipe as sent (errors: it cannot be saved or run) and what may surprise
 * (warnings): its task or steps, its flow's values and rules, what it keeps, the templates it calls.
 */
function problemsOf(db: Deps['db'], raw: any): { recipe: AppRecipe; errors: string[]; warnings: string[] } {
  const src = raw && typeof raw === 'object' ? raw : {};
  const recipe = cleanRecipe(src);
  const errors = [...cleanFlow(src.flow).errors, ...cleanFlows(src.flows).errors, ...cleanData(src.data).errors, ...cleanRequires(src.requires).errors, ...cleanExamples(src.examples).errors, ...cleanUi(src.ui).errors];
  if (!recipe.prompt.trim() && !recipe.flow) errors.push('Write the prompt: it is what the agent is asked to do');
  for (const f of recipe.fields) if (f.type === 'choice' && !f.options?.length) errors.push(`${f.label}: give the choices`);
  const checked = checkFlow(recipe);
  errors.push(...checked.errors);
  const warnings = [...checked.warnings];
  // Its view, against what its answer gives, its form asks, its flows and what it keeps.
  const viewed = checkUi(recipe);
  errors.push(...viewed.errors);
  warnings.push(...viewed.warnings);
  for (const f of [recipe.flow, ...Object.values(recipe.flows ?? {})]) for (const s of f ? allSteps(f.steps) : []) if (s.do === 'app' && !getApp(db, s.app)) warnings.push(`Step “${s.id}” calls the app “${s.app}”, which is not here`);
  return { recipe, errors: [...new Set(errors)], warnings };
}

/** The app's settings from the builder: a recipe, and whether other agents and the public get it. */
function saveInput(db: Deps['db'], b: any, prev?: AppDef) {
  const { recipe, errors, warnings } = problemsOf(db, b?.recipe ?? b);
  if (errors.length) throw new HttpError(400, errors.length === 1 ? errors[0] : `Fix these first: ${errors.join('; ')}`);
  const pub = b?.public && typeof b.public === 'object' ? b.public : undefined;
  if (pub?.on && !(pub.model ?? prev?.public.model)) throw new HttpError(400, 'Pick the model public runs use (one of Custom’s)');
  if (pub?.model && !customModels().some((m) => m.id === pub.model)) throw new HttpError(400, 'That model is not one of Custom’s: add it in Settings → Models');
  return { recipe, warnings, mcp: typeof b?.mcp === 'boolean' ? b.mcp : undefined, agents: typeof b?.agents === 'boolean' ? b.agents : undefined, public: pub, slug: typeof b?.slug === 'string' ? b.slug : undefined, template: typeof b?.template === 'string' ? b.template : undefined, why: typeof b?.why === 'string' ? b.why.slice(0, 300) : undefined };
}

/** A rough cost for a number of runs: from the app's own runs, else from the model's price. */
function estimate(db: Deps['db'], appId: string, recipe: AppRecipe, rows: number) {
  const costs = listRuns(db, { app: appId, status: ['done'], limit: 30 })
    .map((r) => r.costUsd)
    .filter((c): c is number => typeof c === 'number');
  let perRun: number | null = null;
  let basis: 'runs' | 'none' = 'none';
  if (costs.length) {
    const sorted = [...costs].sort((a, b) => a - b);
    perRun = sorted[Math.floor(sorted.length / 2)];
    basis = 'runs';
  }
  const cap = recipe.limits.capUsd;
  return { rows, perRun, basis, total: perRun === null ? null : perRun * rows, cap: cap ?? null, most: cap ? cap * rows : null, from: costs.length };
}

/** A run's end as the scheduled task that started it keeps it: how it went, and one line of what it gave back. */
function taskEnd(r: RunRecord): AppRunEnd {
  const first = r.recipe.answer.map((f) => r.result?.[f.id]).find((v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean'));
  const summary = r.status === 'done' ? (first !== undefined ? String(first) : (r.reply ?? '')) : (r.error ?? (r.status === 'stopped' ? 'Stopped' : 'It did not finish'));
  return { status: r.status === 'done' ? 'done' : r.status === 'stopped' ? 'stopped' : 'failed', summary, ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}), url: `/apps/runs/${encodeURIComponent(r.id)}` };
}

/** A tool's inputs as the steps editor shows them: each name, its kind, whether it is needed, and its first sentence. */
function inputsOf(schema: Record<string, unknown>): { name: string; type?: string; required?: true; description?: string }[] {
  const props = (schema.properties ?? {}) as Record<string, { type?: unknown; description?: unknown }>;
  const needed = Array.isArray(schema.required) ? schema.required : [];
  return Object.entries(props).map(([name, p]) => ({
    name,
    ...(typeof p?.type === 'string' ? { type: p.type } : {}),
    ...(needed.includes(name) ? { required: true as const } : {}),
    ...(typeof p?.description === 'string' && p.description ? { description: p.description.split(/(?<=\.)\s/)[0].slice(0, 160) } : {}),
  }));
}

function routes(d: Deps) {
  const { app, db, sessions } = d;
  ensureTables(db);
  ensureDataTables(db);
  initAppEdits(db);
  // Templates with a folder of files keep in step with it: a change there is a version, a save here writes it.
  initFolders({
    db,
    check: (raw) => problemsOf(db, raw),
    changed: (a) => appChanged(a, 'folder'),
    told: (id, error) => d.broadcast({ t: 'feature', id: 'apps', data: { folder: { id, error: error ?? null } } }),
  });
  onAppSaved((id, by) => {
    const a = by === 'folder' ? null : getApp(db, id);
    if (a) folderSaved(db, a);
  });
  // Records kept before search by meaning was on (or while it was off) get their vectors when it answers.
  embedSoon(db, 20_000);
  setDeps(d);
  useFlows(flowRunner);
  // Scheduled tasks run templates too (Settings → Tasks): started here, and told when the run ends.
  d.scheduler?.useApps({
    id: (idOrSlug) => getApp(db, idOrSlug)?.id,
    name: (id) => getApp(db, id)?.name,
    start: ({ app: id, inputs, test }) => {
      const a = getApp(db, id);
      if (!a) throw new HttpError(404, 'Its app is gone');
      if (!test) checkDaily(db, a);
      const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'task', inputs });
      return { id: r.id, ...(r.key ? { key: r.key } : {}) };
    },
    ended: (id) => {
      const r = getRun(db, id);
      return !r ? undefined : isActive(r.status) ? null : taskEnd(r);
    },
  });
  onFinished((r) => {
    if (r.source === 'task') d.scheduler?.appRunEnded(r.id, taskEnd(r));
    // A run an agent started in a session, ended after its call stopped waiting: the session hears of it.
    if (r.askedBy) void tellAsker(d, r).catch(() => {});
    // A run that tried an example: how its checks went.
    const checks = checkRun(db, r);
    if (checks) {
      updateRun(db, r.id, { checks });
      noteChanged(r.id);
    }
  });
  const link = (key: string) => `${d.publicBase()}/s/${encodeURIComponent(key)}`;
  const P = (req: FastifyRequest) => req.params as Record<string, string>;

  // ---- the gallery and apps ----

  /** A day's usage as its pages show it: its runs, not its conversations (which count toward its limit all the same). */
  const usageShown = (id: string, since: number) => {
    const u = usageSince(db, id, since);
    return { ...u, runs: u.runs - usageSince(db, id, since, 'chat').runs };
  };

  app.get('/api/apps', async () => {
    const today = dayStart();
    // When each last ran (its runs, not its steps' or its conversations).
    const last = new Map((db.prepare("select app_id as id, max(created_at) as at from app_runs where source not in ('step', 'chat') group by app_id").all() as { id: string; at: number }[]).map((r) => [r.id, r.at]));
    const apps = listApps(db).map((a) => ({ ...a, usage: usageShown(a.id, today), ...(last.get(a.id) ? { lastRunAt: last.get(a.id) } : {}) }));
    const recent = listRuns(db, { limit: 12 })
      .filter((r) => r.source !== 'batch' && r.source !== 'public')
      .slice(0, 6)
      .map(runView);
    // The ready-made apps, each installed or not, whether agents may run it, and when it last ran.
    const templates = builtinsOf(db).map((t) => ({ ...t, ...(last.get(`tpl:${t.id}`) ? { lastRunAt: last.get(`tpl:${t.id}`) } : {}) }));
    return { apps, templates, recent };
  });

  /** The tools of the app's own MCP server an app may allow (from every capability), for the builder. */
  app.get('/api/apps/tools', async () => {
    const ctx: RunCtx = { runId: 'apps-tools', key: 'acp:apps-tools-list', agent: 'acp', acpAgent: 'console', cwd: config.home, deps: d };
    const seen = new Set<string>();
    const tools = runTools(ctx)
      .filter((t) => t.name !== 'submit_result' && !seen.has(t.name) && seen.add(t.name))
      .map((t) => ({ name: t.name, description: t.description.split(/(?<=\.)\s/)[0].slice(0, 200), web: PUBLIC_WEB_TOOLS.includes(t.name), ...(STEP_TOOLS.includes(t.name) ? { step: true, inputs: inputsOf(t.inputSchema) } : {}) }));
    return { tools };
  });

  app.get('/api/apps/models', async () => ({ models: customModels() }));

  app.post('/api/apps/draft', async (req) => {
    const key = String((req.body as { key?: string })?.key ?? '');
    if (!/^(claude|codex|acp):[A-Za-z0-9._-]{4,80}$/.test(key)) throw new HttpError(400, 'Bad session key');
    return draftFromSession(d, key);
  });

  // Screens are pages of the template's own, made and removed by their routes: a new template starts without
  // any (a copy makes its own), and saving a recipe keeps the ones it has, so no page of another becomes one.
  app.post('/api/apps', async (req) => {
    const { warnings, ...b } = saveInput(db, req.body);
    return { app: prepare(saveApp(db, { ...b, recipe: { ...b.recipe, screens: undefined }, by: isInternal(req) ? 'agent' : 'you' })), warnings };
  });

  /** A recipe checked without saving it: what must change, and what may surprise. */
  app.post('/api/apps/check', async (req) => {
    const b = (req.body ?? {}) as { recipe?: unknown };
    const { errors, warnings } = problemsOf(db, b.recipe ?? b);
    return { errors, warnings };
  });

  // ---- a template from a file ----

  /** The models Claude Code and Codex offer here, for matching what a template from a file asks for. */
  const catalog: Catalog = async (agent) => {
    try {
      return ((await sessions.catalog?.(agent))?.models ?? []).map((m) => ({ value: m.value, label: m.label }));
    } catch {
      return [];
    }
  };
  app.post('/api/apps/install/check', { bodyLimit: 30 * 1024 * 1024 }, async (req) => ({ preview: (await previewOf(db, readPackage((req.body ?? {}) as Record<string, any>), catalog)).preview }));

  app.post('/api/apps/install', { bodyLimit: 30 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as Record<string, any>;
    return installPackage(db, readPackage(b), { models: b.models && typeof b.models === 'object' ? b.models : undefined, catalog, agents: typeof b.agents === 'boolean' ? b.agents : undefined });
  });

  app.get('/api/apps/:id', async (req) => {
    const { app: a, template } = recipeOf(db, P(req).id);
    if (template) return { template, installed: isInstalled(db, template.id), agents: agentsMay(db, template.id) };
    const today = dayStart();
    // Its own page in its view: what that page keeps.
    const own = pagesFor(a!.ui, 'app').length ? { view: getView(db, `app:${a!.id}`) } : {};
    return { app: a, keys: listKeys(db, a!.id), usage: usageShown(a!.id, today), publicUsage: usageSince(db, a!.id, today, 'public'), workDir: WORK_DIR, env: envOf(a!, a!.slug), ...own };
  });

  /** One value its own page's view keeps: null removes it. Gives all it keeps now. */
  app.put('/api/apps/:id/view', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    const b = (req.body ?? {}) as { name?: unknown; value?: unknown };
    return { view: setView(db, `app:${a.id}`, b.name, b.value ?? null) };
  });

  app.put('/api/apps/:id', async (req) => {
    const prev = getApp(db, P(req).id);
    if (!prev) throw new HttpError(404, 'No such app');
    const { warnings, ...b } = saveInput(db, req.body, prev);
    const saved = prepare(saveApp(db, { ...b, recipe: { ...b.recipe, screens: prev.screens }, id: prev.id, by: isInternal(req) ? 'agent' : 'you' }));
    // A change made in its editor (not an agent's, through the API): the agents that built it hear of it.
    if (!isInternal(req)) noteUserEdit(db, saved.id, saved.name, cleanRecipe(prev), cleanRecipe(saved));
    appChanged(saved, isInternal(req) ? 'agent' : 'user');
    return { app: saved, warnings };
  });

  /** What a template needs on this computer: how its packages stand, and the commands that are missing. */
  app.get('/api/apps/:id/env', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    return { env: envOf(a, a.slug), requires: a.requires ?? null };
  });

  /** Installs a template's packages again (after a failure, or to start afresh). */
  app.post('/api/apps/:id/env', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    void ensureEnv(a, a.slug, { force: true }).catch(() => {});
    return { env: envOf(a, a.slug) };
  });

  app.delete('/api/apps/:id', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    for (const r of listRuns(db, { app: a.id, status: ['queued', 'starting', 'running', 'waiting'], steps: true })) await stopRun(r.id);
    removeScreens(db, a);
    unwatch(a.id);
    deleteApp(db, a.id);
    deleteRuns(db, a.id);
    clearData(db, a.id);
    return { ok: true };
  });

  // ---- ready-made apps installed or not, and whether agents in sessions may run an app ----

  /** A ready-made app ("tpl:<id>") installed again: back among your apps, and agents may run it unless you said no. */
  app.post('/api/apps/:id/install', async (req) => {
    const t = builtinOf(P(req).id);
    setInstalled(db, t.id, true);
    return { template: t, installed: true, agents: agentsMay(db, t.id) };
  });

  /** A ready-made app uninstalled: it leaves your apps and agents' tools, and waits under Ready-made apps to be installed again. Its runs stay. */
  app.post('/api/apps/:id/uninstall', async (req) => {
    const t = builtinOf(P(req).id);
    setInstalled(db, t.id, false);
    return { template: t, installed: false, agents: agentsMay(db, t.id) };
  });

  /** Whether agents in your sessions may run it for you: an app of yours, or a ready-made one ("tpl:<id>"). `made`: whether it is made for that at all. */
  app.put('/api/apps/:id/agents', async (req) => {
    const on = (req.body as { on?: unknown } | undefined)?.on;
    if (typeof on !== 'boolean') throw new HttpError(400, 'on: true or false');
    const id = P(req).id;
    if (id.startsWith('tpl:')) {
      const t = builtinOf(id);
      setAgents(db, t.id, on);
      return { agents: on, made: madeForSessions(t) };
    }
    const a = getApp(db, id);
    if (!a) throw new HttpError(404, 'No such app');
    const saved = setAppFlags(db, a.id, { agents: on })!;
    return { agents: saved.agents, made: madeForSessions(saved) };
  });

  // ---- its screens ----

  app.get('/api/apps/:id/screens', async (req) => ({ screens: screensOf(db, own(req)) }));
  app.get('/api/apps/:id/screens/:name', async (req) => ({ screen: screenHtml(db, own(req), P(req).name) }));
  /** A new screen: the HTML given (window.naget.app and the App parts), or one made from the template's parts. */
  app.post('/api/apps/:id/screens', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return makeScreen(db, own(req), { name: b.name, title: b.title, html: b.html, by: b.html ? 'agent' : 'made' });
  });
  app.put('/api/apps/:id/screens/:name', { bodyLimit: 4 * 1024 * 1024 }, async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    return { screen: changeScreen(db, own(req), P(req).name, { html: b.html, title: b.title }) };
  });
  app.delete('/api/apps/:id/screens/:name', async (req) => ({ app: removeScreen(db, own(req), P(req).name) }));

  /** A template as one file: .naget-app (a zip, with the records it keeps when data=1) or .json. */
  app.get('/api/apps/:id/export', async (req, reply) => {
    const { app: a, template } = recipeOf(db, P(req).id);
    const q = req.query as Record<string, string>;
    const pkg = packageOf(db, a ?? template!, q.data === '1' || q.data === 'true');
    const name = (a?.slug ?? template!.id).replace(/[^\w-]/g, '');
    if (q.as === 'json') return reply.header('Content-Type', 'application/json; charset=utf-8').header('Content-Disposition', `attachment; filename="${name}.json"`).send(`${JSON.stringify(pkg, null, 2)}\n`);
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${name}.naget-app"`).send(zipPackage(pkg));
  });

  // ---- runs ----

  app.post('/api/apps/:id/runs', { bodyLimit: 40 * 1024 * 1024 }, async (req) => {
    const id = P(req).id;
    const b = (req.body ?? {}) as Record<string, any>;
    // A test of a recipe not saved yet runs on its own ("test").
    const { app: a, template } = id === 'test' && b.recipe ? { app: null, template: null } : recipeOf(db, id);
    let recipe: AppRecipe = a ?? template ?? cleanRecipe(b.recipe);
    // A test from the builder runs the recipe as it is on screen; a template takes the agent picked on its page.
    if (b.recipe && typeof b.recipe === 'object') recipe = cleanRecipe(b.recipe);
    else if (template && typeof b.agent === 'string') recipe = cleanRecipe({ ...template, agent: b.agent, acpAgent: b.acpAgent, model: b.model, mode: b.mode, effort: b.effort });
    if (b.recipe && typeof b.recipe === 'object') {
      const { errors } = problemsOf(db, b.recipe);
      if (errors.length) throw new HttpError(400, errors.length === 1 ? errors[0] : `Fix these first: ${errors.join('; ')}`);
    }
    if (!recipe.prompt.trim() && !recipe.flow) throw new HttpError(400, 'The prompt is empty');
    installedOr409(db, template);
    if (a) checkDaily(db, a);
    const r = startRun({
      app: a?.id ?? (template ? `tpl:${template.id}` : 'test'),
      slug: a?.slug ?? template?.id ?? 'test',
      recipe,
      source: b.source === 'test' ? 'test' : b.source === 'screen' ? 'screen' : 'web',
      inputs: b.inputs && typeof b.inputs === 'object' ? b.inputs : {},
      files: b.files && typeof b.files === 'object' ? b.files : undefined,
      // Another of its flows, by name (a screen's form or button).
      flow: typeof b.flow === 'string' && b.flow && b.flow !== 'run' ? b.flow : undefined,
      // A try in the graph: steps it pauses before, and steps frozen at what they gave in an earlier try of the same template.
      ...(b.source === 'test' ? triedIn(db, b, a?.id ?? (template ? `tpl:${template.id}` : 'test')) : {}),
    });
    return { run: runView(r) };
  });

  /** A test run paused in the graph goes on (step: one step, pausing before the next). */
  app.post('/api/apps/runs/:runId/go', async (req) => {
    const r = getRun(db, P(req).runId);
    if (!r) throw new HttpError(404, 'No such run');
    if (!goOn(r.id, (req.body as { step?: unknown } | undefined)?.step === true)) throw new HttpError(409, 'It is not paused');
    return { ok: true };
  });

  app.get('/api/apps/:id/runs', async (req) => {
    const q = req.query as Record<string, string>;
    const id = P(req).id;
    const a = id.startsWith('tpl:') ? null : getApp(db, id);
    return { runs: listRuns(db, { app: a?.id ?? id, limit: 50, before: Number(q.before) || undefined }).map(runView) };
  });

  /**
   * A new run of a run's app (as it is now; a test's recipe as it was tried) with the same answers but those
   * changed, as an event of its view asks: its files come along from the run's folder, as they were sent.
   */
  const againWith = (old: RunRecord, a: AppDef | null, changes: Record<string, unknown>): RunRecord => {
    if (old.flow) throw new HttpError(400, 'Only a run of its main flow runs again from its view');
    const template = old.app.startsWith('tpl:') ? templateById(old.app.slice(4)) : null;
    installedOr409(db, template);
    const test = old.source === 'test' || old.app === 'test';
    const o = old.recipe;
    const recipe: AppRecipe = test || (!a && !template) ? o : (a ?? cleanRecipe({ ...template!, agent: o.agent, acpAgent: o.acpAgent, model: o.model, mode: o.mode, effort: o.effort }));
    const slug = a?.slug ?? template?.id ?? 'test';
    const fields = formOf(recipe);
    const unknown = Object.keys(changes).filter((k) => !fields.some((f) => f.id === k));
    if (unknown.length) throw new HttpError(400, `Its form has no ${unknown.map((k) => `“${k}”`).join(', ')}`);
    const files: Record<string, { name: string; data: string }> = {};
    for (const f of fields) {
      if (f.type !== 'file' || f.id in changes || !old.inputs[f.id]) continue;
      const name = path.basename(String(old.inputs[f.id])).replace(/[^\w.\- ()]+/g, '_').replace(/^\.+/, '').slice(0, 120) || 'file';
      try {
        files[f.id] = { name: String(old.inputs[f.id]), data: fs.readFileSync(path.join(runFolder(old, slug), 'uploads', name)).toString('base64') };
      } catch {
        throw new HttpError(409, `Its file “${old.inputs[f.id]}” is gone: run it again from its form`);
      }
    }
    if (a && !test) checkDaily(db, a);
    return startRun({ app: old.app, slug, recipe, source: test ? 'test' : 'web', inputs: { ...old.inputs, ...changes }, ...(Object.keys(files).length ? { files } : {}) });
  };

  /** Why a run takes no follow-ups, or nothing when it does. */
  const noAsks = (r: RunRecord): string | undefined => {
    if (r.source === 'public') return 'Runs from the public page take no follow-ups.';
    if (isFlowRun(r)) return 'A run with steps takes no follow-ups: change the answers and run it again, or open a step’s session to go on there.';
    const s = r.key ? sessions.summary(r.key) : null;
    if (!s) return r.key ? 'Its session is gone.' : undefined;
    if (s.external && (!s.live || s.live.status === 'exited')) return `Its session is open in ${s.external.client}: continue it there.`;
    return undefined;
  };

  app.get('/api/apps/runs/:runId', async (req) => {
    const r = getRun(db, P(req).runId);
    if (!r) throw new HttpError(404, 'No such run');
    const { name, icon, color, fields, answer, agent, acpAgent, model } = r.recipe;
    const a = r.app.startsWith('tpl:') ? null : getApp(db, r.app);
    const s = r.key ? sessions.summary(r.key) : null;
    const ui = viewOfRun(db, r);
    return {
      run: runView(r),
      progress: isActive(r.status) ? await progressOf(r, false) : { steps: [] },
      recipe: { name, icon, color, fields, answer, agent, acpAgent, model, ...(ui ? { ui } : {}), ...(r.flow ? {} : { steps: !!r.recipe.flow }) },
      // What its view keeps for it (ticks, values its events kept).
      ...(ui ? { view: getView(db, `run:${r.id}`) } : {}),
      slug: a?.slug ?? null,
      ...(r.source === 'public' ? { asks: [] } : await followUpsOf(r)),
      ...(isFlowRun(r) ? { steps: stepsOf(r.id, { values: true }) } : {}),
      // An Ask a person step waiting for the answer, which the page asks for.
      ...(r.status === 'waiting' && isFlowRun(r) && askOf(r) ? { question: askOf(r) } : {}),
      // Follow-ups typed while the agent works wait their turn in the session's queue.
      queued: (s?.queue ?? []).map((m) => ({ id: m.id, text: m.text.slice(0, 4000), at: m.at })),
      noAsks: noAsks(r),
    };
  });

  /** Tries a template's examples (or those named): a test run each, with the recipe sent (the builder's, unsaved) or as saved. */
  app.post('/api/apps/:id/examples/run', async (req) => {
    const id = P(req).id;
    const a = id === 'test' ? null : getApp(db, id);
    if (!a && id !== 'test') throw new HttpError(404, 'No such app');
    const b = (req.body ?? {}) as { recipe?: unknown; only?: unknown; trial?: unknown };
    let recipe: AppRecipe | null = a;
    if (b.recipe && typeof b.recipe === 'object') {
      const { errors } = problemsOf(db, b.recipe);
      if (errors.length) throw new HttpError(400, errors.length === 1 ? errors[0] : `Fix these first: ${errors.join('; ')}`);
      recipe = cleanRecipe(b.recipe);
    }
    if (!recipe?.examples?.length) throw new HttpError(400, 'It has no examples yet');
    const only = Array.isArray(b.only) ? b.only.filter((x): x is string => typeof x === 'string') : undefined;
    // A trial (a change tried before it is used, as Firm it up does) is not the examples' last try.
    const runs = tryExamples({ app: a, recipe, only, slug: a?.slug ?? 'test', trial: b.trial === true });
    return { runs: runs.map((x) => ({ example: x.example.id, ...(x.run ? { run: runView(x.run) } : {}), ...(x.error ? { error: x.error } : {}) })) };
  });

  /** The JSON Schema of a template's app.json, for an editor to complete and check it with. */
  app.get('/api/apps/schema.json', async () => appSchema());

  /** Its folder of files, if it has one (and the mistake in it), and where one would go. */
  app.get('/api/apps/:id/folder', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    return { folder: folderOf(a), suggested: defaultFolder(a.slug) };
  });

  /** Makes its folder (written out, then kept in step with it): an empty folder, or one of its own. */
  app.post('/api/apps/:id/folder', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    const want = (req.body as { path?: unknown } | undefined)?.path;
    try {
      const saved = linkFolder(db, a, typeof want === 'string' && want.trim() ? want.trim() : defaultFolder(a.slug));
      return { app: saved, folder: folderOf(saved) };
    } catch (e) {
      throw new HttpError(400, (e as Error).message);
    }
  });

  /** Stops keeping it and its folder in step; the files stay. */
  app.delete('/api/apps/:id/folder', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    return { app: unlinkFolder(db, a) };
  });

  /** Its versions, newest first: each save that changed what it is, who saved it and what changed, and how its examples went with it. */
  app.get('/api/apps/:id/versions', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    const tried = examplesByVersion(db, a.id);
    return { versions: listVersions(db, a.id).map((v) => ({ ...v, ...(tried.get(v.n) ? { examples: tried.get(v.n) } : {}) })) };
  });

  /** One version, with its recipe (to look at, or to bring back by saving it). */
  app.get('/api/apps/:id/versions/:n', async (req) => {
    const a = getApp(db, P(req).id);
    const v = a ? getVersion(db, a.id, Number(P(req).n)) : null;
    if (!v) throw new HttpError(404, 'No such version');
    const { recipe, ...version } = v;
    return { version, recipe: { ...recipe, screens: a!.screens } };
  });

  /** What its latest runs say about its steps: those an agent had to do the work of, and agent steps that fixed steps could do (Firm it up). */
  app.get('/api/apps/:id/advice', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    return adviceOf(d, a);
  });

  /** A saved template's examples, each with its last run: how it went, its checks, what it cost and how long it took. */
  app.get('/api/apps/:id/examples', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    const last = lastExampleRuns(db, a.id);
    return { examples: (a.examples ?? []).map((e) => ({ ...e, ...(last.has(e.id) ? { last: runView(last.get(e.id)!) } : {}) })) };
  });

  /** The person's answer to the run's Ask a person step: yes or no, or its form's values; the run goes on. */
  app.post('/api/apps/runs/:runId/answer', async (req) => {
    const r = getRun(db, P(req).runId);
    if (!r) throw new HttpError(404, 'No such run');
    const q = r.status === 'waiting' && isFlowRun(r) ? askOf(r) : null;
    const b = (req.body ?? {}) as { step?: unknown; yes?: unknown; values?: unknown };
    if (!q || (typeof b.step === 'string' && b.step !== q.step)) throw new HttpError(409, 'It does not wait for an answer now');
    let values: Record<string, unknown>;
    if (q.fields) {
      const { values: v, errors } = checkInputs(q.fields, b.values && typeof b.values === 'object' ? (b.values as Record<string, unknown>) : {});
      if (errors.length) throw new HttpError(400, `Check the answer: ${errors.join('; ')}`);
      values = v;
    } else if (typeof b.yes === 'boolean') values = { yes: b.yes };
    else throw new HttpError(400, 'Answer yes or no (yes: true or false)');
    if (!answerAsk(r.id, q.step, values)) throw new HttpError(409, 'It is not ready for the answer yet: try again in a moment');
    return { ok: true };
  });

  /**
   * Run again from a step: the same answers, the template as it is now (or the recipe sent, a test from the
   * builder), and the steps before that one giving what they gave in this run, without running again.
   */
  app.post('/api/apps/runs/:runId/again', async (req) => {
    const old = getRun(db, P(req).runId);
    if (!old || old.source === 'step' || old.source === 'app' || old.source === 'public') throw new HttpError(404, 'No such run');
    const b = (req.body ?? {}) as { from?: unknown; recipe?: unknown; inputs?: unknown };
    const a = old.app.startsWith('tpl:') || old.app === 'test' ? null : getApp(db, old.app);
    if (old.app.startsWith('tpl:')) installedOr409(db, templateById(old.app.slice(4)));
    // From its view: a new run with the same answers but those given, the app as it is now, its files along.
    if (b.inputs && typeof b.inputs === 'object' && !Array.isArray(b.inputs)) return { run: runView(againWith(old, a, b.inputs as Record<string, unknown>)) };
    if (isActive(old.status)) throw new HttpError(409, 'It is still running');
    let recipe: AppRecipe = a ?? old.recipe;
    if (b.recipe && typeof b.recipe === 'object') {
      const { errors } = problemsOf(db, b.recipe);
      if (errors.length) throw new HttpError(400, errors.length === 1 ? errors[0] : `Fix these first: ${errors.join('; ')}`);
      recipe = cleanRecipe(b.recipe);
    }
    const flow = old.flow ? recipe.flows?.[old.flow] : recipe.flow;
    if (!flow) throw new HttpError(400, 'It has no steps to run again from');
    const from = typeof b.from === 'string' ? b.from : '';
    const k = from ? flow.steps.findIndex((s) => s.id === from) : 0;
    if (k < 0) throw new HttpError(400, `It has no step “${from}” now`);
    if (formOf(recipe, old.flow).some((f) => f.type === 'file' && old.inputs[f.id])) throw new HttpError(400, 'Its files do not come along: run it again from its form');
    const test = old.source === 'test' || !!b.recipe;
    if (a && !test) checkDaily(db, a);
    const r = startRun({
      app: old.app,
      slug: a?.slug ?? (old.app.startsWith('tpl:') ? old.app.slice(4) : 'test'),
      recipe,
      source: test ? 'test' : 'web',
      inputs: old.inputs,
      ...(old.flow ? { flow: old.flow } : {}),
      reuse: { run: old.id, steps: flow.steps.slice(0, k).map((s) => s.id) },
    });
    return { run: runView(r) };
  });

  /** A follow-up from the run's page: it goes to the run's session (after the turn running now, if one is). */
  app.post('/api/apps/runs/:runId/ask', async (req) => {
    const r = getRun(db, P(req).runId);
    if (!r) throw new HttpError(404, 'No such run');
    const why = noAsks(r);
    if (why) throw new HttpError(409, why);
    if (!r.key) throw new HttpError(409, 'It has not started yet: ask once it has.');
    const text = String((req.body as { text?: unknown })?.text ?? '').trim();
    if (!text) throw new HttpError(400, 'Write what to change');
    if (text.length > 20_000) throw new HttpError(413, 'That is too long for a follow-up (at most 20,000 characters)');
    noteUserMessage();
    await sessions.deliverOrQueue(r.key, text);
    // Sent: its turn has begun (a queued one opens the run when it goes out).
    if (sessions.summary(r.key)?.live?.status === 'working') reopen(r.id);
    return { run: runView(getRun(db, r.id)!) };
  });

  /** One value a run's view keeps (a tick, a value an event kept): null removes it. Gives all it keeps now. */
  app.put('/api/apps/runs/:runId/view', async (req) => {
    const r = getRun(db, P(req).runId);
    if (!r || r.source === 'public') throw new HttpError(404, 'No such run');
    const b = (req.body ?? {}) as { name?: unknown; value?: unknown };
    return { view: setView(db, `run:${r.id}`, b.name, b.value ?? null) };
  });

  app.post('/api/apps/runs/:runId/stop', async (req) => {
    await stopRun(P(req).runId);
    return { ok: true };
  });

  app.delete('/api/apps/runs/:runId', async (req) => {
    const r = getRun(db, P(req).runId);
    if (!r) return { ok: true };
    if (isActive(r.status)) throw new HttpError(409, 'Stop the run first');
    deleteRun(db, r.id);
    return { ok: true };
  });

  // ---- keys ----

  const own = (req: FastifyRequest) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such app');
    return a;
  };
  app.get('/api/apps/:id/keys', async (req) => ({ keys: listKeys(db, own(req).id) }));
  app.post('/api/apps/:id/keys', async (req) => createKey(db, own(req).id, String((req.body as { name?: string })?.name ?? '')));
  app.delete('/api/apps/:id/keys/:keyId', async (req) => {
    if (!revokeKey(db, own(req).id, P(req).keyId)) throw new HttpError(404, 'No such key');
    return { ok: true };
  });

  // ---- conversations on its screen ----

  /** A template's conversations with its agent (its screen's chat), newest first. */
  app.get('/api/apps/:id/chats', async (req) => {
    const a = own(req);
    return { chats: listRuns(db, { app: a.id, source: 'chat', limit: 20 }).map((r) => ({ id: r.id, at: r.createdAt, first: String(r.inputs.message ?? '').slice(0, 200), status: r.status })) };
  });

  /** Starts a conversation with the template's agent: a run of its own, whose later messages are its follow-ups. */
  app.post('/api/apps/:id/chats', async (req) => {
    const a = own(req);
    const text = String((req.body as { text?: unknown })?.text ?? '').trim();
    if (!text) throw new HttpError(400, 'Write a message');
    if (text.length > 20_000) throw new HttpError(413, 'That is too long (at most 20,000 characters)');
    checkDaily(db, a);
    noteUserMessage();
    return { run: runView(startRun({ app: a.id, slug: a.slug, recipe: chatRecipe(a), source: 'chat', inputs: { message: text } })) };
  });

  // ---- what an app keeps ----

  const kept = (req: FastifyRequest) => {
    const a = own(req);
    if (!a.data?.[P(req).collection] && P(req).collection) throw new HttpError(404, `The app keeps no collection “${P(req).collection}”`);
    return a;
  };
  app.get('/api/apps/:id/data', async (req) => {
    const a = own(req);
    return { collections: collectionsOf(db, a.id, a.data), limits: DATA_LIMITS };
  });
  app.get('/api/apps/:id/data/:collection', async (req) => {
    const a = kept(req);
    const q = req.query as Record<string, string>;
    let where: Record<string, unknown> | undefined;
    if (q.where) {
      try {
        where = JSON.parse(q.where);
      } catch {
        throw new HttpError(400, 'where should be JSON, like {"read": false}');
      }
    }
    // A question: by words and by meaning, best first.
    if (q.ask) return searchRecords(db, a.id, a.data, P(req).collection, q.ask, { mode: q.mode === 'words' || q.mode === 'meaning' ? q.mode : 'auto', limit: Number(q.limit) || 10 });
    return findRecords(db, a.id, a.data, P(req).collection, { where, search: q.q || undefined, sort: q.sort || undefined, limit: Number(q.limit) || 100 });
  });
  app.post('/api/apps/:id/data/:collection', async (req) => {
    const a = kept(req);
    const b = (req.body ?? {}) as { record?: Record<string, unknown> };
    const record = addRecord(db, a.id, a.data, P(req).collection, b.record && typeof b.record === 'object' ? b.record : {});
    dataChanged(a.id, P(req).collection);
    return { record };
  });
  app.patch('/api/apps/:id/data/:collection/:recordId', async (req) => {
    const a = kept(req);
    const b = (req.body ?? {}) as { set?: Record<string, unknown> };
    const [record] = updateRecords(db, a.id, a.data, P(req).collection, { id: P(req).recordId }, b.set && typeof b.set === 'object' ? b.set : {});
    if (!record) throw new HttpError(404, 'No such record');
    dataChanged(a.id, P(req).collection);
    return { record };
  });
  app.delete('/api/apps/:id/data/:collection/:recordId', async (req) => {
    const a = kept(req);
    const n = removeRecords(db, a.id, a.data, P(req).collection, { id: P(req).recordId });
    if (n) dataChanged(a.id, P(req).collection);
    return { ok: true, removed: n };
  });
  app.delete('/api/apps/:id/data/:collection', async (req) => {
    const a = kept(req);
    const n = clearData(db, a.id, P(req).collection);
    if (n) dataChanged(a.id, P(req).collection);
    return { ok: true, removed: n };
  });

  // ---- runs over CSV rows ----

  app.get('/api/apps/:id/estimate', async (req) => {
    const { app: a, template } = recipeOf(db, P(req).id);
    const rows = Math.max(1, Math.min(Number((req.query as Record<string, string>).rows) || 1, MAX_ROWS));
    return estimate(db, a?.id ?? `tpl:${template!.id}`, a ?? template!, rows);
  });

  app.post('/api/apps/:id/batches', { bodyLimit: 20 * 1024 * 1024 }, async (req) => {
    const a = own(req);
    const b = (req.body ?? {}) as { rows?: unknown; concurrency?: number; name?: string };
    if (!Array.isArray(b.rows)) throw new HttpError(400, 'Send the rows');
    const max = a.limits.runsPerDay;
    if (max && usageSince(db, a.id, dayStart()).runs + b.rows.length > max) throw new HttpError(429, `That is more runs than the app’s limit of ${max} a day allows (Limits in its settings)`);
    return { batch: startBatch(db, { app: a.id, slug: a.slug, recipe: a, rows: b.rows as Record<string, unknown>[], concurrency: b.concurrency, name: b.name }) };
  });

  app.get('/api/apps/:id/batches', async (req) => ({ batches: listBatches(db, own(req).id) }));

  app.get('/api/apps/batches/:batchId', async (req) => {
    const batch = getBatch(db, P(req).batchId);
    if (!batch) throw new HttpError(404, 'No such run of rows');
    return { batch, runs: listRuns(db, { batch: batch.id, limit: MAX_ROWS + 10 }).map(runView) };
  });

  app.get('/api/apps/batches/:batchId/csv', async (req, reply) => {
    const batch = getBatch(db, P(req).batchId);
    if (!batch) throw new HttpError(404, 'No such run of rows');
    const first = listRuns(db, { batch: batch.id, limit: 1 })[0];
    const a = getApp(db, batch.app);
    const recipe = first?.recipe ?? a;
    if (!recipe) throw new HttpError(404, 'The app is gone');
    const name = `${(a?.slug ?? 'app').replace(/[^\w-]/g, '')}-results.csv`;
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${name}"`).send(`﻿${batchCsv(db, batch.id, recipe, link)}`);
  });

  app.post('/api/apps/batches/:batchId/stop', async (req) => {
    await stopBatch(db, P(req).batchId);
    return { ok: true };
  });

  // ---- programs: an app's API key, or the sign-in ----

  /** The app a call may run: an app key opens its own app only (server/index.ts lets these through to here). */
  const callable = (req: FastifyRequest): { a: AppDef; key?: string } => {
    const a = getApp(db, P(req).slug);
    const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization ?? ''))?.[1];
    if (bearer?.startsWith(KEY_PREFIX)) {
      const k = appOfKey(db, bearer);
      if (!k || !a || k.app !== a.id) throw new HttpError(401, 'That key does not open this app');
      if (!keyLimiter.take(k.id, 30, 60_000)) throw new HttpError(429, 'Too many calls with this key: at most 30 a minute');
      return { a, key: k.id };
    }
    // Anything else here passed the sign-in (or a machine's access token) on the way in.
    if (!a) throw new HttpError(404, 'No such app');
    return { a };
  };

  app.post('/api/apps/:slug/run', { bodyLimit: 40 * 1024 * 1024 }, async (req) => {
    const { a } = callable(req);
    const b = (req.body ?? {}) as Record<string, any>;
    // The form's values under "inputs", or at the top level beside "wait".
    const { wait, files, inputs, flow, ...rest } = b;
    checkDaily(db, a);
    const r = startRun({ app: a.id, slug: a.slug, recipe: a, source: 'api', inputs: inputs && typeof inputs === 'object' ? inputs : rest, files: files && typeof files === 'object' ? files : undefined, flow: typeof flow === 'string' && flow && flow !== 'run' ? flow : undefined });
    const done = await waitFor(r.id, waitSeconds(wait, 0, 900) * 1000);
    const now = done ?? r;
    return apiAnswer(now, link, isFlowRun(now) ? stepsOf(now.id) : undefined);
  });

  app.get('/api/apps/:slug/run/:runId', async (req) => {
    const { a } = callable(req);
    const r = getRun(db, P(req).runId);
    if (!r || r.app !== a.id) throw new HttpError(404, 'No such run of this app');
    const done = await waitFor(r.id, waitSeconds((req.query as Record<string, string>).wait, 0, 900) * 1000);
    const now = done ?? r;
    return apiAnswer(now, link, isFlowRun(now) ? stepsOf(now.id) : undefined);
  });

  publicRoutes(d);
  // A session ended or gone takes its runs with it.
  sessions.on('sessions', (_up: unknown, removed: string[]) => {
    for (const key of removed ?? []) for (const r of listRuns(db, { status: ['starting', 'running', 'waiting'], limit: 500, steps: true })) if (r.key === key) finish(r.id, 'failed', 'The session was removed');
  });
}

// ---- the answer fields, on each app run's own MCP server ----

function submitTool(ctx: RunCtx): RunTool | null {
  const hit = runOfCtx(ctx);
  if (!hit || !hit.run.recipe.answer.length) return null;
  const answer = hit.run.recipe.answer;
  return {
    name: 'submit_result',
    description: `Hand in the result of this run of the app "${hit.run.appName}": one object with the answer fields. The person sees it as a card or table. Call it when the work is done; if it answers with problems, fix them and call again.`,
    inputSchema: answerSchema(answer),
    async run(args, c) {
      const now = runOfCtx(c);
      if (!now) return { text: 'This session was not started from an app, so there is nothing to hand in.', isError: true };
      let raw: unknown = args;
      // Some agents wrap the fields in one more object.
      const ids = new Set(answer.map((f) => f.id));
      const keys = Object.keys(args ?? {});
      if (keys.length === 1 && !ids.has(keys[0]) && args[keys[0]] && typeof args[keys[0]] === 'object') raw = args[keys[0]];
      const checked = checkAnswer(now.run.recipe.answer, raw);
      if (!checked.ok) return { text: `The result does not fit the answer fields yet:\n${checked.errors.map((e) => `- ${e}`).join('\n')}\nFix these and call submit_result again with all the fields.`, isError: true };
      saveResult(now.run.id, checked.value);
      return 'Saved: the person sees this result now. Finish with a short reply (a sentence or two); no need to repeat the result.';
    },
  };
}

// ---- the data an app keeps, on its runs' own MCP server ----

/** The app a run belongs to, as it is now: a run of a step goes by its parent's. */
function appOfRun(db: Deps['db'], r: RunRecord): { data?: AppRecipe['data']; memory?: boolean; requires?: AppRecipe['requires']; slug?: string } {
  const top = r.parent && r.source === 'step' ? (getRun(db, r.parent) ?? r) : r;
  const now = top.app.startsWith('tpl:') ? null : getApp(db, top.app);
  return { data: now?.data ?? top.recipe.data, memory: now?.memory ?? top.recipe.memory, requires: now?.requires ?? top.recipe.requires, slug: now?.slug };
}

function dataTool(ctx: RunCtx): RunTool | null {
  const hit = runOfCtx(ctx);
  if (!hit || hit.mark.public || hit.run.source === 'public') return null;
  const { db } = ctx.deps;
  const data = appOfRun(db, hit.run).data;
  const names = Object.keys(data ?? {});
  if (!names.length) return null;
  const said = names.map((n) => `${n}${data![n].fields?.length ? ` (${data![n].fields!.map((f) => `${f.id}: ${f.type}`).join(', ')})` : ' (any fields)'}${data![n].description ? ` — ${data![n].description}` : ''}`).join('; ');
  return {
    name: 'app_data',
    description: `The records the app "${hit.run.appName}" keeps between its runs. op "find" lists records by their fields (where, search for words, sort, limit), "search" finds those that answer a question best, by words and by meaning (query), "get" one by its id, "add" one (record), "update" one by id or those that match where (set: the fields to change; null clears one), "remove" one by id or those that match where. Collections: ${said}.`,
    inputSchema: {
      type: 'object',
      properties: {
        op: { type: 'string', enum: ['find', 'search', 'get', 'add', 'update', 'remove'] },
        query: { type: 'string', description: 'search: the question, in words.' },
        collection: { type: 'string', enum: names },
        id: { type: 'string', description: 'One record, by its id (get, update, remove).' },
        record: { type: 'object', description: 'add: the new record’s fields.' },
        set: { type: 'object', description: 'update: the fields to change.' },
        where: { type: 'object', description: 'find, update, remove: fields to match, each a value or {"<": 10} (=, !=, <, >, <=, >=, contains, in, empty); {} for every record.' },
        search: { type: 'string', description: 'find: words to look for anywhere in a record.' },
        sort: { type: 'string', description: 'find: the field to sort by, "-field" for highest or latest first.' },
        limit: { type: 'number', description: 'find: at most this many (100 unless set).' },
      },
      required: ['op', 'collection'],
    },
    async run(a, c) {
      const now = runOfCtx(c);
      if (!now) return { text: 'This session was not started from an app, so it keeps no data.', isError: true };
      const appId = now.run.parent ? (getRun(db, now.run.parent)?.app ?? now.run.app) : now.run.app;
      return dataOp(db, appId, appOfRun(db, now.run).data, a, ['find', 'search', 'get', 'add', 'update', 'remove'], (coll) => dataChanged(appId, coll));
    },
  };
}

/** What a try in the graph asks of its run: steps to pause before, and steps frozen at what they gave in an earlier try of the same template. */
function triedIn(db: Deps['db'], b: Record<string, any>, app: string): { pause?: string[]; reuse?: { run: string; steps: string[] } } {
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 60) : []);
  const pause = ids(b.pause);
  const frozen = b.freeze && typeof b.freeze === 'object' && typeof b.freeze.from === 'string' ? ids(b.freeze.steps) : [];
  const from = frozen.length ? getRun(db, b.freeze.from) : null;
  return { ...(pause.length ? { pause } : {}), ...(from && from.app === app ? { reuse: { run: from.id, steps: frozen } } : {}) };
}

/** What a conversation with a template's agent runs: its agent and settings, the first message as its task, nothing to hand in. */
function chatRecipe(a: AppDef): AppRecipe {
  return cleanRecipe({
    name: a.name,
    icon: a.icon,
    color: a.color,
    description: '',
    agent: a.agent,
    acpAgent: a.acpAgent,
    model: a.model,
    effort: a.effort,
    mode: a.mode,
    assistant: a.assistant,
    tools: a.tools,
    limits: a.limits,
    requires: a.requires,
    ...(a.memory ? { memory: true } : {}),
    ...(a.data ? { data: a.data } : {}),
    fields: [{ id: 'message', label: 'Message', type: 'long', required: true }],
    prompt: '{{message}}',
    answer: [],
  });
}

/** A conversation's agent runs the template's flows, and waits for what they give. */
function flowTool(ctx: RunCtx): RunTool | null {
  const hit = runOfCtx(ctx);
  if (!hit || hit.run.source !== 'chat') return null;
  const { db } = ctx.deps;
  const a = getApp(db, hit.run.app);
  if (!a) return null;
  const flows = [
    ...(a.flow || a.prompt.trim() ? [{ id: 'run', title: 'its main flow', inputs: a.fields }] : []),
    ...Object.entries(a.flows ?? {}).map(([id, f]) => ({ id, title: f.title ?? id, inputs: f.inputs ?? [] })),
  ];
  if (!flows.length) return null;
  return {
    name: 'app_run',
    description: `Runs one of the flows of the app "${a.name}" and waits for what it gives (at most wait seconds, 120 unless set): ${flows.map((f) => `${f.id} (${f.title}; inputs: ${f.inputs.map((i) => `${i.id}${i.required ? '' : '?'}: ${i.type}`).join(', ') || 'none'})`).join('; ')}.`,
    inputSchema: {
      type: 'object',
      properties: {
        flow: { type: 'string', description: 'Which flow ("run": the main one).' },
        inputs: { type: 'object', description: 'Its inputs, by name.' },
        wait: { type: 'number', description: 'Most seconds to wait for it (1 to 600).' },
      },
    },
    async run(args) {
      const now = getApp(db, a.id);
      if (!now) return { text: 'The app is gone.', isError: true };
      const flow = typeof args.flow === 'string' && args.flow && args.flow !== 'run' ? args.flow : undefined;
      try {
        checkDaily(db, now);
        const r = startRun({ app: now.id, slug: now.slug, recipe: now, source: 'screen', inputs: (args.inputs && typeof args.inputs === 'object' ? args.inputs : {}) as Record<string, string>, ...(flow ? { flow } : {}) });
        const done = (await waitFor(r.id, Math.max(1, Math.min(Number(args.wait) || 120, 600)) * 1000)) ?? r;
        return JSON.stringify({ run: done.id, status: done.status, ...(done.result ? { result: done.result } : {}), ...(done.reply ? { reply: done.reply.slice(0, 4000) } : {}), ...(done.error ? { error: done.error } : {}), link: `/apps/runs/${done.id}` });
      } catch (e) {
        return { text: (e as Error).message, isError: true };
      }
    },
  };
}

/** Packages a saved template needs start installing at once, so its first run need not wait. */
function prepare(a: AppDef): AppDef {
  void ensureEnv(a, a.slug).catch(() => {});
  return a;
}

/** What every session that is not a template's run is told of templates and their tools. */
const BUILDER_NOTE =
  "Apps (the Apps page in Naget Agent) are the user's own: a form, then one agent's task or steps (agents, quick model answers, tools, decisions, repeats, code, a person's answer), an answer, a view of it (pages of elements its answer fills, and events for what a click does), data it keeps, screens, and examples with checks. To make or change one, use app_get, app_save (its view is its ui) and app_try (try its examples before you hand it over, and say what a run costs), app_screen for a screen, and app_data for the records it keeps; app_guide's apps topic says what each part does, and its API topic gives the format (Apps: views). Agents run the user's apps for them in sessions (use_app) unless one's recipe says sessions: false (an app used on its own page).";

export const apps: Feature = {
  id: 'apps',
  routes,
  /** Templates' runs that wait for the person's answer (an Ask a person step), answered on the run's page. */
  inbox: (d) =>
    listRuns(d.db, { status: ['waiting'], limit: 100, steps: true }).flatMap((r) => {
      const q = isFlowRun(r) ? askOf(r) : null;
      return q ? [{ id: `app-ask:${r.id}:${q.step}`, kind: q.fields ? ('form' as const) : ('question' as const), title: q.question.slice(0, 200), detail: r.appName, at: q.since, path: `/apps/runs/${encodeURIComponent(r.id)}` }] : [];
    }),
  tools(ctx) {
    // A template's run gets what it hands in with and what it keeps; any other session what templates are built with.
    if (runOfCtx(ctx)) return [submitTool(ctx), dataTool(ctx), flowTool(ctx)].filter((t): t is RunTool => !!t);
    // Any other session: what apps are built with, and the user's apps to run for them.
    return [...builderTools(ctx, { problemsOf: (raw) => problemsOf(ctx.deps.db, raw), prepare }), useAppTool(ctx)].filter((t): t is RunTool => !!t);
  },
  /** An app's run gets the tools its app allows; a public run only the answer and, if allowed, the web. */
  allowTool(name, ctx) {
    const hit = runOfCtx(ctx);
    if (!hit) return true;
    if (name === 'submit_result' || name === 'app_data') return true;
    if (name === 'app_run') return hit.run.source === 'chat';
    if (hit.mark.public || hit.run.source === 'public') return !!hit.mark.web && PUBLIC_WEB_TOOLS.includes(name);
    const allowed = hit.run.recipe.tools;
    return allowed === null || allowed.includes(name);
  },
  spawn(s, d) {
    const mark = markOf(s.extra);
    if (!mark) return { instructions: [BUILDER_NOTE, useNote(d.db)].filter((x): x is string => !!x) };
    noteAgentRun(s.runId, mark);
    const hit = runOfCtx({ runId: s.runId, key: s.key ?? '' });
    if (!hit) return;
    // A public run is Custom with no shell, no files and none of the user's servers; what it needs to know comes with its message.
    if (mark.public) return { env: { [PUBLIC_RUN_ENV]: mark.web ? 'web' : '1' } };
    const own = appOfRun(d.db, hit.run);
    // Its template's packages, within reach: their commands first on PATH.
    const env = own.slug ? envVars(own, own.slug) : undefined;
    const line = own.slug ? envLine(own, own.slug) : null;
    return { instructions: [[runInstructions({ ...hit.run, ...own }), line].filter(Boolean).join('\n')], ...(env ? { env } : {}) };
  },
  // Templates the user changed in their editor, for the agents that built them, with the next message.
  beforeMessage: (key, d) => takeAppEdits(d.db, key),
  start(d) {
    startRuns(d);
    startBatches(d.db, (id) => getApp(d.db, id)?.slug);
  },
};

