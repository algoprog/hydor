// Templates as one file, to keep or to share: a .json with the recipe (its form, what it does step by
// step, what it gives back, keeps, may use and needs), or a .naget-app (a zip) with the same app.json,
// the records it keeps under data/ and the templates it calls under apps/. Installing reads either (or a
// bare recipe), says before anything is made what the template will do here (its agents and modes,
// tools, the templates that come with it, the packages it installs and commands it needs, spending,
// data, memory) and what is left out because it does not travel: the folder it worked in, a mode that
// skips asking, its keys and its public page. The templates that come with it are installed first (or
// the one you have, when it is the same), and its steps call them at the addresses they got here. The
// zip is read with the documents' reader, which stops a zip bomb at its caps; the one written here is
// small and made in memory.
import fs from 'node:fs';
import zlib from 'node:zlib';
import type { AppDef, AppRecipe } from '../../shared/apps.ts';
import { cleanRecipe, slugify } from '../../shared/apps.ts';
import type { InstallPreview, ModelNeed } from '../../shared/app-manifest.ts';
import { allSteps, checkFlow, cleanData, cleanFlow, cleanRequires, DATA_LIMITS, modelsUsed } from '../../shared/app-manifest.ts';
import type { AgentModel } from '../../shared/types.ts';
import { AGENT_FILE } from '../models/config.ts';
import { findAssistant } from '../assistants/store.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { Zip } from '../documents/zip.ts';
import { addRecord, allRecords } from './data.ts';
import { ensureEnv, hasCommand } from './env.ts';
import { screensForFile } from './screens.ts';
import { getApp, saveApp } from './store.ts';
import { createPage } from '../pages/store.ts';

/** The newest package format this server reads. */
export const PACKAGE_FORMAT = 1;
/** Largest file a template can be installed from. */
export const MAX_PACKAGE = 20 << 20;
/** Most templates one file brings along. */
const MAX_BUNDLED = 10;

export interface AppPackage {
  naget: 'app';
  format: number;
  exported?: string;
  /** Its address where it was made: the steps of the templates it comes with call it by this. */
  slug?: string;
  /** The recipe, as it travels. */
  app: Record<string, unknown>;
  /** The records it keeps, by collection (each with its id). */
  records?: Record<string, Record<string, unknown>[]>;
  /** The templates its steps call (and those they call), each a package of its own. */
  apps?: AppPackage[];
}

/** Modes that do everything without asking: an installed template starts in Auto instead. */
const SKIP_ASKING = new Set(['bypassPermissions', 'full', 'danger-full-access', 'full-access']);

// ---- out ---------------------------------------------------------------------------------------------------

/** Custom's models on this computer, with where each runs and the provider's name for it. */
function customModels(): AgentModel[] {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
  } catch {
    return [];
  }
}

/** The models a recipe asks for, said so another computer can find them: Custom's with where they run and their provider's name. */
function modelNeeds(r: AppRecipe): ModelNeed[] {
  const own = customModels();
  const out = [...(r.requires?.models ?? [])];
  for (const u of modelsUsed(r)) {
    if (out.some((n) => n.agent === u.agent && n.as === u.as)) continue;
    const m = u.agent === 'custom' ? own.find((x) => x.id === u.as) : undefined;
    out.push(m ? { as: u.as, agent: 'custom', provider: m.provider, model: m.model, label: m.label } : { as: u.as, agent: u.agent });
  }
  return out;
}

/** What travels of a recipe: everything but its folder and what is this computer's own; its models said portably. */
function travelling(a: AppRecipe): Record<string, unknown> {
  const { id: _i, slug: _s, mcp: _m, public: _p, template: _t, createdAt: _c, updatedAt: _u, cwd: _w, ...recipe } = a as AppDef;
  const models = modelNeeds(a);
  return { ...recipe, ...(models.length ? { requires: { ...(recipe.requires ?? {}), models } } : {}) } as unknown as Record<string, unknown>;
}

/** A template as it travels: its recipe, its records when asked for, and the templates its steps call. */
export function packageOf(db: DB, a: AppRecipe & { id?: string; slug?: string }, withData: boolean): AppPackage {
  const recipe = travelling(a);
  // Its screens travel as their HTML: they are pages of its own here.
  const screens = screensForFile(db, a);
  if (screens) recipe.screens = screens;
  else delete recipe.screens;
  const pkg: AppPackage = { naget: 'app', format: PACKAGE_FORMAT, exported: new Date().toISOString(), ...(a.slug ? { slug: a.slug } : {}), app: recipe };
  if (withData && a.id && a.data) pkg.records = Object.fromEntries(Object.keys(a.data).map((name) => [name, allRecords(db, a.id!, name).map(({ createdAt: _a, updatedAt: _b, ...r }) => r)]));
  // The templates it calls, and those they call, once each.
  const bundled: AppPackage[] = [];
  const seen = new Set<string>(a.slug ? [a.slug] : []);
  const walk = (r: AppRecipe) => {
    for (const s of r.flow ? allSteps(r.flow.steps) : []) {
      if (s.do !== 'app' || seen.has(s.app) || bundled.length >= MAX_BUNDLED) continue;
      seen.add(s.app);
      const other = getApp(db, s.app);
      if (!other) continue;
      const app = travelling(other);
      const shown = screensForFile(db, other);
      if (shown) app.screens = shown;
      else delete app.screens;
      bundled.push({ naget: 'app', format: PACKAGE_FORMAT, slug: other.slug, app });
      walk(other);
    }
  };
  walk(a);
  if (bundled.length) pkg.apps = bundled;
  return pkg;
}

function dosTime(d: Date): { time: number; date: number } {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

/** A small zip, made in memory: each file deflated, names in UTF-8. */
export function zipOf(files: { name: string; data: Buffer }[]): Buffer {
  const { time, date } = dosTime(new Date());
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const packed = zlib.deflateRawSync(f.data);
    const crc = zlib.crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(f.data.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

/** A template as a .naget-app: app.json, its records under data/, the templates it calls under apps/, and a line on what the file is. */
export function zipPackage(pkg: AppPackage): Buffer {
  const { records, apps, ...rest } = pkg;
  const files = [{ name: 'app.json', data: Buffer.from(`${JSON.stringify(rest, null, 2)}\n`) }];
  for (const [name, list] of Object.entries(records ?? {})) files.push({ name: `data/${name}.json`, data: Buffer.from(`${JSON.stringify(list, null, 1)}\n`) });
  (apps ?? []).forEach((p, i) => files.push({ name: `apps/${(p.slug ?? `app-${i + 1}`).replace(/[^\w-]/g, '')}.json`, data: Buffer.from(`${JSON.stringify(p, null, 2)}\n`) }));
  files.push({ name: 'README.txt', data: Buffer.from(`A template for Naget Agent: “${String(rest.app.name ?? 'Template')}”.\nInstall it in Naget Agent: Templates → New template → Install from a file.\n`) });
  return zipOf(files);
}

// ---- in ----------------------------------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A package from what was sent: a .naget-app (zip) or .json file (base64), the package itself, or a bare recipe. */
export function readPackage(input: { file?: { name?: unknown; data?: unknown }; package?: unknown }): AppPackage {
  let pkg: any;
  if (input.package && typeof input.package === 'object') pkg = input.package;
  else if (typeof input.file?.data === 'string') {
    const buf = Buffer.from(input.file.data, 'base64');
    if (buf.length > MAX_PACKAGE) throw new HttpError(413, `A template file is at most ${MAX_PACKAGE >> 20} MB`);
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      let zip: Zip;
      try {
        zip = new Zip(buf, 100 << 20);
      } catch {
        throw new HttpError(400, 'This file could not be read as a zip');
      }
      // app.json at the top, or in the one folder the zip holds.
      const main = zip
        .names()
        .filter((n) => /(^|\/)app\.json$/i.test(n) && n.split('/').length <= 2)
        .sort((a, b) => a.length - b.length)[0];
      if (!main) throw new HttpError(400, 'This zip holds no app.json: it is not a Naget Agent template');
      const base = escape(main.slice(0, main.length - 'app.json'.length));
      const json = (n: string) => {
        try {
          return JSON.parse(zip.text(n) ?? '');
        } catch {
          throw new HttpError(400, `Its ${n} is not valid JSON`);
        }
      };
      pkg = json(main);
      if (!pkg || typeof pkg !== 'object') throw new HttpError(400, 'Its app.json is not a template');
      const records: Record<string, unknown[]> = {};
      const apps: unknown[] = [];
      for (const n of zip.names()) {
        const d = new RegExp(`^${base}data/([A-Za-z][A-Za-z0-9_]{0,39})\\.json$`).exec(n);
        if (d) {
          const list = json(n);
          if (Array.isArray(list)) records[d[1]] = list;
        } else if (new RegExp(`^${base}apps/[\\w-]{1,80}\\.json$`).test(n)) apps.push(json(n));
      }
      if (Object.keys(records).length) pkg.records = { ...(pkg.records ?? {}), ...records };
      if (apps.length) pkg.apps = [...(Array.isArray(pkg.apps) ? pkg.apps : []), ...apps];
    } else {
      try {
        pkg = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
      } catch {
        throw new HttpError(400, 'This file is neither a template (.json) nor a packaged template (.naget-app or .zip)');
      }
    }
  } else throw new HttpError(400, 'Send the template: a .json or .naget-app file');
  return asPackage(pkg);
}

/** A package as sent, or a bare recipe (what an app's own address answers, or one written by hand) made into one. */
function asPackage(pkg: any, depth = 0): AppPackage {
  if (pkg && typeof pkg === 'object' && !pkg.naget && pkg.app && typeof pkg.app === 'object') pkg = { naget: 'app', format: 1, slug: pkg.app.slug, app: pkg.app, records: pkg.records, apps: pkg.apps };
  else if (pkg && typeof pkg === 'object' && !pkg.app && ('prompt' in pkg || 'flow' in pkg || 'fields' in pkg)) pkg = { naget: 'app', format: 1, slug: pkg.slug, app: pkg };
  if (!pkg || typeof pkg !== 'object' || !pkg.app || typeof pkg.app !== 'object' || Array.isArray(pkg.app)) throw new HttpError(400, 'This is not a Naget Agent template');
  if (Number(pkg.format) > PACKAGE_FORMAT) throw new HttpError(400, 'This template was made by a newer Naget Agent: update to install it');
  const apps = depth === 0 && Array.isArray(pkg.apps) ? pkg.apps.slice(0, MAX_BUNDLED).map((p: unknown) => asPackage(p, 1)) : undefined;
  return { naget: 'app', format: Number(pkg.format) || 1, ...(typeof pkg.slug === 'string' ? { slug: pkg.slug } : {}), app: pkg.app, ...(pkg.records ? { records: pkg.records } : {}), ...(apps?.length ? { apps } : {}) };
}

const AGENT_NAME: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', acp: 'Custom' };

/** The same template as one you have: the same recipe, but for what never travels. */
function sameAs(db: DB, slug: string | undefined, recipe: AppRecipe): AppDef | null {
  const have = slug ? getApp(db, slug) : null;
  if (!have) return null;
  return JSON.stringify(travelling({ ...have, mode: have.mode })) === JSON.stringify(travelling(recipe)) ? have : null;
}

/** One recipe as it would come in: tidied, its mode and assistant made safe here, and what changed or cannot work, in words. */
function intake(db: DB, raw: Record<string, any>, named: string) {
  const problems = [...cleanFlow(raw.flow).errors, ...cleanData(raw.data).errors, ...cleanRequires(raw.requires).errors].map((p) => named + p);
  const notes: string[] = [];
  const recipe = cleanRecipe({ ...raw, cwd: undefined });
  if (typeof raw.cwd === 'string' && raw.cwd.trim()) notes.push(`${named}It worked in the folder ${raw.cwd.trim()} where it was made: here each run gets a folder of its own`);
  if (recipe.mode && SKIP_ASKING.has(recipe.mode)) {
    notes.push(`${named}It asked to run with every step allowed (${recipe.mode}): here it starts in Auto, which goes ahead with routine steps and asks about the rest; change it in its settings if you trust it`);
    recipe.mode = undefined;
  }
  for (const s of recipe.flow ? allSteps(recipe.flow.steps) : [])
    if (s.do === 'agent' && s.mode && SKIP_ASKING.has(s.mode)) {
      notes.push(`${named}Its step “${s.id}” asked for every step allowed (${s.mode}): here it starts in Auto`);
      s.mode = undefined;
    }
  if (recipe.assistant && !findAssistant(db, recipe.assistant)) {
    notes.push(`${named}It starts as the assistant “${recipe.assistant}”, which is not here: its runs start without one`);
    recipe.assistant = undefined;
  }
  if (!recipe.prompt.trim() && !recipe.flow) problems.push(`${named}It has neither a task nor steps`);
  return { recipe, problems, notes };
}

/** The models an agent offers here (Claude Code's, Codex's), as its catalog lists them; empty when it cannot say. */
export type Catalog = (agent: 'claude' | 'codex') => Promise<{ value: string; label: string }[]>;

const PROVIDER: Record<string, string> = { openrouter: 'OpenRouter', ollama: 'Ollama', vllm: 'vLLM', endpoint: 'an endpoint' };

/** Each model the templates ask for, found here as it is, under another name, or not at all (with what could stand in). */
async function modelsHere(recipes: AppRecipe[], catalog?: Catalog): Promise<InstallPreview['models']> {
  const own = customModels();
  const needs: ModelNeed[] = [];
  for (const r of recipes) for (const n of modelNeeds(r)) if (!needs.some((x) => x.agent === n.agent && x.as === n.as)) needs.push(n);
  const lists = new Map<string, { value: string; label: string }[]>();
  const listOf = async (agent: 'claude' | 'codex') => {
    if (!lists.has(agent)) lists.set(agent, catalog ? await Promise.race([catalog(agent).catch(() => []), new Promise<{ value: string; label: string }[]>((r) => setTimeout(() => r([]), 4000))]) : []);
    return lists.get(agent)!;
  };
  const out: InstallPreview['models'] = [];
  for (const n of needs) {
    if (n.agent === 'custom') {
      const label = n.label ?? `${n.model ?? n.as}${n.provider ? ` (${PROVIDER[n.provider] ?? n.provider})` : ''}`;
      const options = own.map((m) => ({ value: m.id, label: m.label }));
      const exact = own.find((m) => m.id === n.as && (!n.provider || m.provider === n.provider) && (!n.model || m.model === n.model));
      const same = !exact && n.model ? own.find((m) => m.model === n.model && (!n.provider || m.provider === n.provider)) : undefined;
      out.push({ as: n.as, agent: 'custom', label, status: exact ? 'here' : same ? 'matched' : 'missing', use: exact ? n.as : same ? same.id : '', options });
    } else {
      const options = await listOf(n.agent);
      const here = options.some((o) => o.value === n.as);
      out.push({ as: n.as, agent: n.agent, label: `${AGENT_NAME[n.agent]} · ${n.label ?? n.as}`, status: here ? 'here' : 'missing', use: here ? n.as : '', options });
    }
  }
  return out;
}

/** Points a recipe's models at the ones picked here ("" or none: the agent's default; its helper model for a model step). */
function remapModels(r: AppRecipe, picked: Map<string, string>) {
  const who = (agent?: string, acp?: string) => (agent === 'claude' || agent === 'codex' ? agent : agent === 'acp' && (!acp || acp === 'console') ? 'custom' : null);
  const swap = (agent: string | undefined, acp: string | undefined, as: string | undefined) => {
    const w = who(agent, acp);
    if (!w || !as || !picked.has(`${w}:${as}`)) return as;
    return picked.get(`${w}:${as}`) || undefined;
  };
  r.model = swap(r.agent, r.acpAgent, r.model);
  for (const s of r.flow ? allSteps(r.flow.steps) : []) {
    if (s.do === 'agent' && s.model) s.model = swap(s.agent ?? r.agent, s.acpAgent ?? (s.agent ? undefined : r.acpAgent), s.model);
    else if (s.do === 'model' && s.model) s.model = swap('acp', 'console', s.model);
  }
  // What it needs says where it came from; here, its steps name this computer's models.
  if (r.requires?.models) {
    delete r.requires.models;
    if (!Object.keys(r.requires).length) delete r.requires;
  }
}

/** What a template will do here and what changes on the way in, before anything is made. */
export async function previewOf(db: DB, pkg: AppPackage, catalog?: Catalog): Promise<{ recipe: AppRecipe; bundled: { pkg: AppPackage; recipe: AppRecipe; reuse: AppDef | null }[]; preview: InstallPreview }> {
  const raw = pkg.app as Record<string, any>;
  const main = intake(db, raw, '');
  const recipe = main.recipe;
  const problems = [...main.problems];
  const notes = [...main.notes];
  const warnings: string[] = [];
  // The templates that come with it: installed first, or the one you have when it is the same.
  const bundled = (pkg.apps ?? []).map((p) => {
    const b = intake(db, p.app as Record<string, any>, `${String(p.app.name ?? p.slug ?? 'A template it calls')}: `);
    problems.push(...b.problems);
    notes.push(...b.notes);
    return { pkg: p, recipe: b.recipe, reuse: sameAs(db, p.slug, b.recipe) };
  });
  const all = [recipe, ...bundled.map((b) => b.recipe)];
  // Who does the work: each agent (and model) once.
  const who: string[] = [];
  for (const r of all) {
    const steps = r.flow ? allSteps(r.flow.steps) : [];
    const agents = r.flow ? steps.flatMap((s) => (s.do === 'agent' ? [{ agent: s.agent ?? r.agent, acpAgent: s.acpAgent ?? r.acpAgent, model: s.model ?? r.model }] : [])) : [{ agent: r.agent, acpAgent: r.acpAgent, model: r.model }];
    for (const s of agents) {
      const a = `${s.agent === 'acp' && s.acpAgent && s.acpAgent !== 'console' ? s.acpAgent : (AGENT_NAME[s.agent] ?? 'An agent')}${s.model ? ` (${s.model})` : ''}`;
      if (!who.includes(a)) who.push(a);
    }
    // Ask a model steps, and questions in words: one of Custom's models, or the helper model.
    for (const s of steps) {
      const m = s.do === 'model' ? (s.model ?? 'Helper model') : (s.do === 'decide' && s.ask) || (s.do === 'repeat' && s.untilAsk) ? 'Helper model' : null;
      if (m && !who.includes(m)) who.push(m);
    }
  }
  // The templates its steps call: with it, here already, or missing.
  const comes = new Set(bundled.map((b) => b.pkg.slug).filter(Boolean));
  const calls = [...new Set(all.flatMap((r) => (r.flow ? allSteps(r.flow.steps) : []).flatMap((s) => (s.do === 'app' ? [s.app] : []))))];
  for (const c of calls) if (!comes.has(c) && !getApp(db, c)) warnings.push(`It calls the template “${c}”, which is neither here nor in the file: that step fails until you install it`);
  for (const r of [recipe, ...bundled.filter((b) => !b.reuse).map((b) => b.recipe)]) {
    const c = checkFlow(r);
    problems.push(...c.errors);
    warnings.push(...c.warnings);
  }
  // What it needs on this computer.
  const needs = { node: [] as string[], python: [] as string[], commands: [] as string[], missing: [] as string[] };
  for (const r of all) {
    for (const [n, v] of Object.entries(r.requires?.node ?? {})) if (!needs.node.includes(`${n} ${v}`)) needs.node.push(`${n} ${v}`);
    for (const p of r.requires?.python ?? []) if (!needs.python.includes(p)) needs.python.push(p);
    for (const c of r.requires?.commands ?? []) if (!needs.commands.includes(c)) needs.commands.push(c);
  }
  needs.missing = needs.commands.filter((c) => !hasCommand(c));
  for (const c of needs.missing) warnings.push(`It uses the command ${c}, which is not on this computer: install it, or the steps that use it fail`);
  const data = Object.keys(recipe.data ?? {}).map((name) => ({ name, records: Array.isArray(pkg.records?.[name]) ? Math.min(pkg.records![name].length, DATA_LIMITS.records) : 0 }));
  for (const name of Object.keys(pkg.records ?? {})) if (!recipe.data?.[name]) warnings.push(`Its file holds records for “${name}”, a collection it does not keep: they are left out`);
  const taken = getApp(db, slugify(recipe.name)) ? recipe.name : undefined;
  if (taken) notes.push(`You have a template called “${taken}” already: this one installs beside it, at an address of its own`);
  const models = await modelsHere([recipe, ...bundled.filter((b) => !b.reuse).map((b) => b.recipe)], catalog);
  for (const m of models) if (m.status === 'missing') warnings.push(m.options.length ? `It asks for ${m.label}, which is not set up here: pick another to stand in, or its agent's default is used` : m.agent === 'custom' ? `It asks for ${m.label}, and Custom has no models here: add one in Settings → Models first` : `It asks for ${m.label}, and ${AGENT_NAME[m.agent]} is not set up here`);
  const preview: InstallPreview = {
    name: recipe.name,
    description: recipe.description,
    icon: recipe.icon,
    color: recipe.color,
    steps: recipe.flow ? allSteps(recipe.flow.steps).length : 0,
    agents: who,
    tools: recipe.tools,
    apps: calls,
    data,
    memory: !!recipe.memory,
    limits: recipe.limits,
    needs,
    models,
    screens: Object.keys(raw.screens && typeof raw.screens === 'object' ? (raw.screens as Record<string, unknown>) : {}),
    bundled: bundled.map((b) => ({ name: b.recipe.name, from: b.pkg.slug ?? '', installs: b.reuse ? 'reuse' : 'new' })),
    notes,
    warnings: [...new Set(warnings)],
    problems: [...new Set(problems)],
  };
  return { recipe, bundled, preview };
}

/** A file's screens (name → title and HTML), made into pages of the template installed. */
function screensFrom(db: DB, app: string, raw: unknown): AppRecipe['screens'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: NonNullable<AppRecipe['screens']> = {};
  for (const [name, v] of Object.entries(raw as Record<string, { title?: unknown; html?: unknown }>).slice(0, 12)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(name) || typeof v?.html !== 'string' || !v.html.trim()) continue;
    try {
      const p = createPage(db, { title: typeof v.title === 'string' && v.title.trim() ? v.title : name, html: v.html, by: 'made', app });
      out[name] = { page: p.id, ...(typeof v.title === 'string' && v.title.trim() && name !== 'main' ? { title: v.title.trim().slice(0, 80) } : {}) };
    } catch {}
  }
  return Object.keys(out).length ? out : undefined;
}

/** Points a recipe's steps that call templates at the addresses those got here. */
function retarget(r: AppRecipe, moved: Map<string, string>) {
  for (const s of r.flow ? allSteps(r.flow.steps) : []) if (s.do === 'app' && moved.has(s.app)) s.app = moved.get(s.app)!;
}

/**
 * Installs a template as previewOf showed: the templates that come with it first (or the ones you have),
 * then it, its records added, its public page closed and no keys; the packages it needs start installing.
 */
export async function installPackage(db: DB, pkg: AppPackage, o: { models?: Record<string, unknown>; catalog?: Catalog } = {}): Promise<{ app: AppDef; notes: string[]; records: number; skipped: number; bundled: { name: string; slug: string; reused: boolean }[] }> {
  const { recipe, bundled, preview } = await previewOf(db, pkg, o.catalog);
  if (preview.problems.length) throw new HttpError(400, `This template cannot be installed: ${preview.problems.join('; ')}`);
  // Each model as picked on the card, else as the preview found it.
  const picked = new Map<string, string>();
  for (const m of preview.models) {
    const k = `${m.agent}:${m.as}`;
    const want = o.models?.[k];
    picked.set(k, typeof want === 'string' && (want === '' || m.options.some((x) => x.value === want) || want === m.as) ? want : (m.use ?? ''));
  }
  remapModels(recipe, picked);
  for (const b of bundled) if (!b.reuse) remapModels(b.recipe, picked);
  const moved = new Map<string, string>();
  const made: { app: AppDef; recipe: AppRecipe }[] = [];
  const out: { name: string; slug: string; reused: boolean }[] = [];
  for (const b of bundled) {
    const app = b.reuse ?? saveApp(db, { recipe: b.recipe });
    if (!b.reuse) {
      b.recipe.screens = screensFrom(db, app.id, b.pkg.app.screens);
      made.push({ app, recipe: b.recipe });
    }
    if (b.pkg.slug) moved.set(b.pkg.slug, app.slug);
    out.push({ name: app.name, slug: app.slug, reused: !!b.reuse });
  }
  // Their calls to each other, and its own, go to the addresses they got here.
  for (const m of made) {
    retarget(m.recipe, moved);
    saveApp(db, { id: m.app.id, recipe: m.recipe });
  }
  retarget(recipe, moved);
  const first = saveApp(db, { recipe });
  recipe.screens = screensFrom(db, first.id, (pkg.app as Record<string, unknown>).screens);
  const app = recipe.screens ? saveApp(db, { id: first.id, recipe }) : first;
  let records = 0;
  let skipped = 0;
  for (const [name, list] of Object.entries(pkg.records ?? {})) {
    if (!recipe.data?.[name] || !Array.isArray(list)) continue;
    for (const rec of list.slice(0, DATA_LIMITS.records)) {
      try {
        addRecord(db, app.id, recipe.data, name, rec && typeof rec === 'object' ? (rec as Record<string, unknown>) : {});
        records++;
      } catch {
        skipped++;
      }
    }
  }
  // Their packages install in the background; runs wait for them.
  for (const a of [...made.map((m) => getApp(db, m.app.id)!), getApp(db, app.id)!]) void ensureEnv(a, a.slug).catch(() => {});
  return { app: getApp(db, app.id)!, notes: preview.notes, records, skipped, bundled: out };
}
