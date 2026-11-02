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
import fs from 'node:fs';
import type { FastifyRequest } from 'fastify';
import type { AppDef, AppRecipe, AppTemplate } from '../../shared/apps.ts';
import { answerSchema, checkAnswer, cleanRecipe, isActive, PUBLIC_WEB_TOOLS } from '../../shared/apps.ts';
import { checkFlow, cleanData, cleanFlow, cleanFlows, cleanRequires, allSteps, DATA_LIMITS } from '../../shared/app-manifest.ts';
import type { AgentModel } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { runTools } from '../features/registry.ts';
import type { Deps, Feature, RunCtx, RunTool } from '../features/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import { noteUserMessage } from '../updates.ts';
import { apiAnswer, checkDaily, waitSeconds } from './api.ts';
import { batchCsv, MAX_ROWS, startBatch, startBatches, stopBatch } from './batch.ts';
import { addRecord, clearData, collectionsOf, embedSoon, ensureDataTables, findRecords, removeRecords, searchRecords, updateRecords } from './data.ts';
import { ensureEnv, envLine, envOf, envVars } from './env.ts';
import { dataChanged, flowRunner, stepsOf } from './flow.ts';
import { installPackage, packageOf, previewOf, readPackage, zipPackage, type Catalog } from './package.ts';
import { changeScreen, makeScreen, removeScreen, removeScreens, screenHtml, screensOf } from './screens.ts';
import { draftFromSession } from './draft.ts';
import { Limiter } from './limits.ts';
import { publicRoutes } from './public.ts';
import { PUBLIC_RUN_ENV } from './publicRun.ts';
import { finish, followUpsOf, isFlowRun, markOf, noteAgentRun, progressOf, reopen, runInstructions, runOfCtx, saveResult, setDeps, startRun, startRuns, stopRun, useFlows, waitFor, WORK_DIR } from './runs.ts';
import {
  appOfKey,
  createKey,
  dayStart,
  deleteApp,
  deleteRun,
  deleteRuns,
  ensureTables,
  getApp,
  getBatch,
  getRun,
  KEY_PREFIX,
  listApps,
  listBatches,
  listKeys,
  listRuns,
  revokeKey,
  runView,
  saveApp,
  usageSince,
  type RunRecord,
} from './store.ts';
import { templateById, TEMPLATES } from './templates.ts';

const keyLimiter = new Limiter();

/** An app by id or address, or a template run as it is ("tpl:<id>"). */
function recipeOf(db: Deps['db'], id: string): { app: AppDef | null; template: AppTemplate | null } {
  if (id.startsWith('tpl:')) {
    const template = templateById(id.slice(4));
    if (!template) throw new HttpError(404, 'No such template');
    return { app: null, template };
  }
  const app = getApp(db, id);
  if (!app) throw new HttpError(404, 'No such template');
  return { app, template: null };
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
  const errors = [...cleanFlow(src.flow).errors, ...cleanFlows(src.flows).errors, ...cleanData(src.data).errors, ...cleanRequires(src.requires).errors];
  if (!recipe.prompt.trim() && !recipe.flow) errors.push('Write the prompt: it is what the agent is asked to do');
  for (const f of recipe.fields) if (f.type === 'choice' && !f.options?.length) errors.push(`${f.label}: give the choices`);
  const checked = checkFlow(recipe);
  errors.push(...checked.errors);
  const warnings = [...checked.warnings];
  for (const f of [recipe.flow, ...Object.values(recipe.flows ?? {})]) for (const s of f ? allSteps(f.steps) : []) if (s.do === 'app' && !getApp(db, s.app)) warnings.push(`Step “${s.id}” calls the template “${s.app}”, which is not here`);
  return { recipe, errors: [...new Set(errors)], warnings };
}

/** The app's settings from the builder: a recipe, and whether other agents and the public get it. */
function saveInput(db: Deps['db'], b: any, prev?: AppDef) {
  const { recipe, errors, warnings } = problemsOf(db, b?.recipe ?? b);
  if (errors.length) throw new HttpError(400, errors.length === 1 ? errors[0] : `Fix these first: ${errors.join('; ')}`);
  const pub = b?.public && typeof b.public === 'object' ? b.public : undefined;
  if (pub?.on && !(pub.model ?? prev?.public.model)) throw new HttpError(400, 'Pick the model public runs use (one of Custom’s)');
  if (pub?.model && !customModels().some((m) => m.id === pub.model)) throw new HttpError(400, 'That model is not one of Custom’s: add it in Settings → Models');
  return { recipe, warnings, mcp: typeof b?.mcp === 'boolean' ? b.mcp : undefined, public: pub, slug: typeof b?.slug === 'string' ? b.slug : undefined, template: typeof b?.template === 'string' ? b.template : undefined };
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

function routes(d: Deps) {
  const { app, db, sessions } = d;
  ensureTables(db);
  ensureDataTables(db);
  // Records kept before search by meaning was on (or while it was off) get their vectors when it answers.
  embedSoon(db, 20_000);
  setDeps(d);
  useFlows(flowRunner);
  const link = (key: string) => `${d.publicBase()}/s/${encodeURIComponent(key)}`;
  const P = (req: FastifyRequest) => req.params as Record<string, string>;

  // ---- the gallery and apps ----

  app.get('/api/apps', async () => {
    const today = dayStart();
    const apps = listApps(db).map((a) => ({ ...a, usage: usageSince(db, a.id, today) }));
    const recent = listRuns(db, { limit: 12 })
      .filter((r) => r.source !== 'batch' && r.source !== 'public')
      .slice(0, 6)
      .map(runView);
    return { apps, templates: TEMPLATES, recent };
  });

  /** The tools of the app's own MCP server an app may allow (from every capability), for the builder. */
  app.get('/api/apps/tools', async () => {
    const ctx: RunCtx = { runId: 'apps-tools', key: 'acp:apps-tools-list', agent: 'acp', acpAgent: 'console', cwd: config.home, deps: d };
    const seen = new Set<string>();
    const tools = runTools(ctx)
      .filter((t) => t.name !== 'submit_result' && !seen.has(t.name) && seen.add(t.name))
      .map((t) => ({ name: t.name, description: t.description.split(/(?<=\.)\s/)[0].slice(0, 200), web: PUBLIC_WEB_TOOLS.includes(t.name) }));
    return { tools };
  });

  app.get('/api/apps/models', async () => ({ models: customModels() }));

  app.post('/api/apps/draft', async (req) => {
    const key = String((req.body as { key?: string })?.key ?? '');
    if (!/^(claude|codex|acp):[A-Za-z0-9._-]{4,80}$/.test(key)) throw new HttpError(400, 'Bad session key');
    return draftFromSession(d, key);
  });

  /** Packages a saved template needs start installing at once, so its first run need not wait. */
  const prepare = (a: AppDef) => {
    void ensureEnv(a, a.slug).catch(() => {});
    return a;
  };

  // Screens are pages of the template's own, made and removed by their routes: a new template starts without
  // any (a copy makes its own), and saving a recipe keeps the ones it has, so no page of another becomes one.
  app.post('/api/apps', async (req) => {
    const { warnings, ...b } = saveInput(db, req.body);
    return { app: prepare(saveApp(db, { ...b, recipe: { ...b.recipe, screens: undefined } })), warnings };
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
    return installPackage(db, readPackage(b), { models: b.models && typeof b.models === 'object' ? b.models : undefined, catalog });
  });

  app.get('/api/apps/:id', async (req) => {
    const { app: a, template } = recipeOf(db, P(req).id);
    if (template) return { template };
    const today = dayStart();
    return { app: a, keys: listKeys(db, a!.id), usage: usageSince(db, a!.id, today), publicUsage: usageSince(db, a!.id, today, 'public'), workDir: WORK_DIR, env: envOf(a!, a!.slug) };
  });

  app.put('/api/apps/:id', async (req) => {
    const prev = getApp(db, P(req).id);
    if (!prev) throw new HttpError(404, 'No such template');
    const { warnings, ...b } = saveInput(db, req.body, prev);
    return { app: prepare(saveApp(db, { ...b, recipe: { ...b.recipe, screens: prev.screens }, id: prev.id })), warnings };
  });

  /** What a template needs on this computer: how its packages stand, and the commands that are missing. */
  app.get('/api/apps/:id/env', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such template');
    return { env: envOf(a, a.slug), requires: a.requires ?? null };
  });

  /** Installs a template's packages again (after a failure, or to start afresh). */
  app.post('/api/apps/:id/env', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such template');
    void ensureEnv(a, a.slug, { force: true }).catch(() => {});
    return { env: envOf(a, a.slug) };
  });

  app.delete('/api/apps/:id', async (req) => {
    const a = getApp(db, P(req).id);
    if (!a) throw new HttpError(404, 'No such template');
    for (const r of listRuns(db, { app: a.id, status: ['queued', 'starting', 'running', 'waiting'], steps: true })) await stopRun(r.id);
    removeScreens(db, a);
    deleteApp(db, a.id);
    deleteRuns(db, a.id);
    clearData(db, a.id);
    return { ok: true };
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
    });
    return { run: runView(r) };
  });

  app.get('/api/apps/:id/runs', async (req) => {
    const q = req.query as Record<string, string>;
    const id = P(req).id;
    const a = id.startsWith('tpl:') ? null : getApp(db, id);
    return { runs: listRuns(db, { app: a?.id ?? id, limit: 50, before: Number(q.before) || undefined }).map(runView) };
  });

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
    return {
      run: runView(r),
      progress: isActive(r.status) ? await progressOf(r, false) : { steps: [] },
      recipe: { name, icon, color, fields, answer, agent, acpAgent, model },
      slug: a?.slug ?? null,
      ...(r.source === 'public' ? { asks: [] } : await followUpsOf(r)),
      ...(isFlowRun(r) ? { steps: stepsOf(r.id, { values: true }) } : {}),
      // Follow-ups typed while the agent works wait their turn in the session's queue.
      queued: (s?.queue ?? []).map((m) => ({ id: m.id, text: m.text.slice(0, 4000), at: m.at })),
      noAsks: noAsks(r),
    };
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
    if (!a) throw new HttpError(404, 'No such template');
    return a;
  };
  app.get('/api/apps/:id/keys', async (req) => ({ keys: listKeys(db, own(req).id) }));
  app.post('/api/apps/:id/keys', async (req) => createKey(db, own(req).id, String((req.body as { name?: string })?.name ?? '')));
  app.delete('/api/apps/:id/keys/:keyId', async (req) => {
    if (!revokeKey(db, own(req).id, P(req).keyId)) throw new HttpError(404, 'No such key');
    return { ok: true };
  });

  // ---- what an app keeps ----

  const kept = (req: FastifyRequest) => {
    const a = own(req);
    if (!a.data?.[P(req).collection] && P(req).collection) throw new HttpError(404, `The template keeps no collection “${P(req).collection}”`);
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
    if (max && usageSince(db, a.id, dayStart()).runs + b.rows.length > max) throw new HttpError(429, `That is more runs than the template’s limit of ${max} a day allows (Limits in its settings)`);
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
    if (!recipe) throw new HttpError(404, 'The template is gone');
    const name = `${(a?.slug ?? 'template').replace(/[^\w-]/g, '')}-results.csv`;
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
      if (!k || !a || k.app !== a.id) throw new HttpError(401, 'That key does not open this template');
      if (!keyLimiter.take(k.id, 30, 60_000)) throw new HttpError(429, 'Too many calls with this key: at most 30 a minute');
      return { a, key: k.id };
    }
    // Anything else here passed the sign-in (or a machine's access token) on the way in.
    if (!a) throw new HttpError(404, 'No such template');
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
    if (!r || r.app !== a.id) throw new HttpError(404, 'No such run of this template');
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
    description: `Hand in the result of this run of the template "${hit.run.appName}": one object with the answer fields. The person sees it as a card or table. Call it when the work is done; if it answers with problems, fix them and call again.`,
    inputSchema: answerSchema(answer),
    async run(args, c) {
      const now = runOfCtx(c);
      if (!now) return { text: 'This session was not started from a template, so there is nothing to hand in.', isError: true };
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
    description: `The records the template "${hit.run.appName}" keeps between its runs. op "find" lists records by their fields (where, search for words, sort, limit), "search" finds those that answer a question best, by words and by meaning (query), "get" one by its id, "add" one (record), "update" one by id or those that match where (set: the fields to change; null clears one), "remove" one by id or those that match where. Collections: ${said}.`,
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
      if (!now) return { text: 'This session was not started from a template, so it keeps no data.', isError: true };
      const appId = now.run.parent ? (getRun(db, now.run.parent)?.app ?? now.run.app) : now.run.app;
      const kept = appOfRun(db, now.run).data;
      const coll = String(a.collection ?? '');
      const q = { id: typeof a.id === 'string' && a.id ? a.id : undefined, where: a.where && typeof a.where === 'object' ? a.where : undefined, search: typeof a.search === 'string' ? a.search : undefined, sort: typeof a.sort === 'string' ? a.sort : undefined, limit: Number(a.limit) || undefined };
      try {
        let out: unknown;
        if (a.op === 'search') out = await searchRecords(db, appId, kept, coll, String(a.query ?? ''), { limit: Number(a.limit) || 10 });
        else if (a.op === 'find' || a.op === 'get') {
          const found = findRecords(db, appId, kept, coll, q);
          out = a.op === 'get' ? (found.records[0] ?? null) : found;
        } else if (a.op === 'add') {
          out = { record: addRecord(db, appId, kept, coll, a.record && typeof a.record === 'object' ? a.record : {}) };
          dataChanged(appId, coll);
        } else if (a.op === 'update') {
          const records = updateRecords(db, appId, kept, coll, q, a.set && typeof a.set === 'object' ? a.set : {});
          if (records.length) dataChanged(appId, coll);
          out = { changed: records.length, records };
        } else if (a.op === 'remove') {
          const removed = removeRecords(db, appId, kept, coll, q);
          if (removed) dataChanged(appId, coll);
          out = { removed };
        } else return { text: 'op is find, search, get, add, update or remove', isError: true };
        const text = JSON.stringify(out);
        return text.length > 60_000 ? `${text.slice(0, 60_000)}… (cut: ask for fewer with limit, or search)` : text;
      } catch (e) {
        return { text: (e as Error).message, isError: true };
      }
    },
  };
}

export const apps: Feature = {
  id: 'apps',
  routes,
  tools(ctx) {
    return [submitTool(ctx), dataTool(ctx)].filter((t): t is RunTool => !!t);
  },
  /** An app's run gets the tools its app allows; a public run only the answer and, if allowed, the web. */
  allowTool(name, ctx) {
    const hit = runOfCtx(ctx);
    if (!hit) return true;
    if (name === 'submit_result' || name === 'app_data') return true;
    if (hit.mark.public || hit.run.source === 'public') return !!hit.mark.web && PUBLIC_WEB_TOOLS.includes(name);
    const allowed = hit.run.recipe.tools;
    return allowed === null || allowed.includes(name);
  },
  spawn(s, d) {
    const mark = markOf(s.extra);
    if (!mark) return;
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
  start(d) {
    startRuns(d);
    startBatches(d.db, (id) => getApp(d.db, id)?.slug);
  },
};

