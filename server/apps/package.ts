// Templates as one file, to keep or to share: a .json with the recipe (its form, what it does step by
// step, what it gives back, keeps, may use and needs), or a .hydor-app (a zip) with the same app.json,
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
import { appSummary } from '../../shared/app-summary.ts';
import { allSteps, checkFlow, cleanData, cleanFlow, cleanRequires, DATA_LIMITS, modelsUsed } from '../../shared/app-manifest.ts';
import { ASSET_NAME, MEDIA_LIMITS, type AppAsset } from '../../shared/app-media.ts';
import { cleanSecrets } from '../../shared/app-secrets.ts';
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
import { isInstalled, setInstalled } from './builtins.ts';
import { mediaBytes, putMediaBuffer } from './media.ts';
import { secretsOf } from './secrets.ts';
import { templateById } from './templates.ts';

/** The newest package format this server reads. */
export const PACKAGE_FORMAT = 1;
/** Largest file a template can be installed from (its own files, pictures and videos, travel in it). */
export const MAX_PACKAGE = 160 << 20;
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
  /** Its own files' bytes, by their names in its assets (assets/<name> in a .hydor-app; base64 in a .json). */
  files?: Record<string, Buffer>;
  /** A ready-made app's id: installing its file brings that one back (or makes a copy of your own when you have it). */
  builtin?: string;
}

/** An app's own files, from the copies kept here. */
function filesOf(db: DB, assets: Record<string, AppAsset> | undefined): Record<string, Buffer> | undefined {
  const out: Record<string, Buffer> = {};
  for (const [name, a] of Object.entries(assets ?? {})) {
    const b = mediaBytes(db, a.sha);
    if (b) out[name] = b;
  }
  return Object.keys(out).length ? out : undefined;
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
  // What is kept beside its recipe here (its address, who may run it, where it came from) stays here.
  const { id: _i, slug: _s, mcp: _m, agents: _a, fromFile: _f, public: _p, template: _t, createdAt: _c, updatedAt: _u, cwd: _w, ...recipe } = a as AppDef;
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
  // A ready-made app says which it is, to come back as itself where it was uninstalled.
  if (!a.slug && a.id && templateById(a.id)) pkg.builtin = a.id;
  const files = filesOf(db, a.assets);
  if (files) pkg.files = files;
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
      const theirs = filesOf(db, other.assets);
      bundled.push({ naget: 'app', format: PACKAGE_FORMAT, slug: other.slug, app, ...(theirs ? { files: theirs } : {}) });
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

/** A package as one JSON text: its files' bytes as base64. */
export function packageJson(pkg: AppPackage): string {
  const b64 = (f?: Record<string, Buffer>) => (f ? Object.fromEntries(Object.entries(f).map(([n, d]) => [n, d.toString('base64')])) : undefined);
  const plain = (p: AppPackage): Record<string, unknown> => ({ ...p, files: b64(p.files), ...(p.apps ? { apps: p.apps.map(plain) } : {}) });
  return `${JSON.stringify(plain(pkg), null, 2)}\n`;
}

/**
 * A template as a .hydor-app: app.json, its records under data/, its own files under assets/, the templates it
 * calls under apps/ (their files under apps/<address>/), and a line on what the file is.
 */
export function zipPackage(pkg: AppPackage): Buffer {
  const { records, apps, files: own, ...rest } = pkg;
  const files: { name: string; data: Buffer }[] = [{ name: 'app.json', data: Buffer.from(`${JSON.stringify(rest, null, 2)}\n`) }];
  for (const [name, list] of Object.entries(records ?? {})) files.push({ name: `data/${name}.json`, data: Buffer.from(`${JSON.stringify(list, null, 1)}\n`) });
  for (const [name, data] of Object.entries(own ?? {})) files.push({ name: `assets/${name}`, data });
  (apps ?? []).forEach((p, i) => {
    const slug = (p.slug ?? `app-${i + 1}`).replace(/[^\w-]/g, '');
    const { files: theirs, ...json } = p;
    files.push({ name: `apps/${slug}.json`, data: Buffer.from(`${JSON.stringify(json, null, 2)}\n`) });
    for (const [name, data] of Object.entries(theirs ?? {})) files.push({ name: `apps/${slug}/${name}`, data });
  });
  files.push({ name: 'README.txt', data: Buffer.from(`An app for Hydor: “${String(rest.app.name ?? 'App')}”.\nInstall it in Hydor: Apps → New app → Install from a file.\n`) });
  return zipOf(files);
}

// ---- in ----------------------------------------------------------------------------------------------------

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A package from what was sent: a .hydor-app (zip) or .json file (base64), the package itself, or a bare recipe. */
export function readPackage(input: { file?: { name?: unknown; data?: unknown }; package?: unknown }): AppPackage {
  let pkg: any;
  if (input.package && typeof input.package === 'object') pkg = input.package;
  else if (typeof input.file?.data === 'string') {
    const buf = Buffer.from(input.file.data, 'base64');
    if (buf.length > MAX_PACKAGE) throw new HttpError(413, `An app file is at most ${MAX_PACKAGE >> 20} MB`);
    if (buf[0] === 0x50 && buf[1] === 0x4b) {
      let zip: Zip;
      try {
        zip = new Zip(buf, MAX_PACKAGE * 2);
      } catch {
        throw new HttpError(400, 'This file could not be read as a zip');
      }
      // app.json at the top, or in the one folder the zip holds.
      const main = zip
        .names()
        .filter((n) => /(^|\/)app\.json$/i.test(n) && n.split('/').length <= 2)
        .sort((a, b) => a.length - b.length)[0];
      if (!main) throw new HttpError(400, 'This zip holds no app.json: it is not a Hydor app');
      const base = escape(main.slice(0, main.length - 'app.json'.length));
      const json = (n: string) => {
        try {
          return JSON.parse(zip.text(n) ?? '');
        } catch {
          throw new HttpError(400, `Its ${n} is not valid JSON`);
        }
      };
      pkg = json(main);
      if (!pkg || typeof pkg !== 'object') throw new HttpError(400, 'Its app.json is not an app');
      const records: Record<string, unknown[]> = {};
      const apps: { slug: string; pkg: any }[] = [];
      const own: Record<string, Buffer> = {};
      const theirs: Record<string, Record<string, Buffer>> = {};
      const bytes = (n: string) => {
        const b = zip.read(n, MEDIA_LIMITS.asset + 1);
        if (!b) throw new HttpError(400, `Its ${n} could not be read`);
        if (zip.cut.has(n) || b.length > MEDIA_LIMITS.asset) throw new HttpError(400, `Its ${n} is over ${MEDIA_LIMITS.asset >> 20} MB, more than one of an app's files may be`);
        return b;
      };
      for (const n of zip.names()) {
        const d = new RegExp(`^${base}data/([A-Za-z][A-Za-z0-9_]{0,39})\\.json$`).exec(n);
        const a = new RegExp(`^${base}apps/([\\w-]{1,80})\\.json$`).exec(n);
        const f = new RegExp(`^${base}assets/([^/]{1,100})$`).exec(n);
        const g = new RegExp(`^${base}apps/([\\w-]{1,80})/([^/]{1,100})$`).exec(n);
        if (d) {
          const list = json(n);
          if (Array.isArray(list)) records[d[1]] = list;
        } else if (a) apps.push({ slug: a[1], pkg: json(n) });
        else if (f && ASSET_NAME.test(f[1])) own[f[1]] = bytes(n);
        else if (g && ASSET_NAME.test(g[2])) (theirs[g[1]] ??= {})[g[2]] = bytes(n);
      }
      if (Object.keys(records).length) pkg.records = { ...(pkg.records ?? {}), ...records };
      if (Object.keys(own).length) pkg.files = own;
      if (apps.length) pkg.apps = [...(Array.isArray(pkg.apps) ? pkg.apps : []), ...apps.map((x) => (theirs[x.slug] && x.pkg && typeof x.pkg === 'object' ? { ...x.pkg, files: theirs[x.slug] } : x.pkg))];
    } else {
      try {
        pkg = JSON.parse(buf.toString('utf8').replace(/^﻿/, ''));
      } catch {
        throw new HttpError(400, 'This file is neither an app (.json) nor a packaged app (.hydor-app or .zip)');
      }
    }
  } else throw new HttpError(400, 'Send the app: a .json or .hydor-app file');
  return asPackage(pkg);
}

/** A package as sent, or a bare recipe (what an app's own address answers, or one written by hand) made into one. */
function asPackage(pkg: any, depth = 0): AppPackage {
  if (pkg && typeof pkg === 'object' && !pkg.naget && pkg.app && typeof pkg.app === 'object') pkg = { naget: 'app', format: 1, slug: pkg.app.slug, app: pkg.app, records: pkg.records, apps: pkg.apps };
  else if (pkg && typeof pkg === 'object' && !pkg.app && ('prompt' in pkg || 'flow' in pkg || 'fields' in pkg)) pkg = { naget: 'app', format: 1, slug: pkg.slug, app: pkg };
  if (!pkg || typeof pkg !== 'object' || !pkg.app || typeof pkg.app !== 'object' || Array.isArray(pkg.app)) throw new HttpError(400, 'This is not a Hydor app');
  if (Number(pkg.format) > PACKAGE_FORMAT) throw new HttpError(400, 'This app was made by a newer Hydor: update to install it');
  const apps = depth === 0 && Array.isArray(pkg.apps) ? pkg.apps.slice(0, MAX_BUNDLED).map((p: unknown) => asPackage(p, 1)) : undefined;
  // Its own files: bytes from a zip, or base64 in a .json.
  const files: Record<string, Buffer> = {};
  if (pkg.files && typeof pkg.files === 'object' && !Array.isArray(pkg.files))
    for (const [name, v] of Object.entries(pkg.files as Record<string, unknown>).slice(0, MEDIA_LIMITS.count)) {
      if (!ASSET_NAME.test(name) || name.includes('..')) continue;
      if (Buffer.isBuffer(v)) files[name] = v;
      else if (typeof v === 'string') files[name] = Buffer.from(v, 'base64');
    }
  const builtin = depth === 0 && typeof pkg.builtin === 'string' && templateById(pkg.builtin) ? pkg.builtin : undefined;
  return {
    naget: 'app',
    format: Number(pkg.format) || 1,
    ...(typeof pkg.slug === 'string' ? { slug: pkg.slug } : {}),
    app: pkg.app,
    ...(pkg.records ? { records: pkg.records } : {}),
    ...(apps?.length ? { apps } : {}),
    ...(Object.keys(files).length ? { files } : {}),
    ...(builtin ? { builtin } : {}),
  };
}

const AGENT_NAME: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', acp: 'Custom' };

/** The same template as one you have: the same recipe, but for what never travels. */
function sameAs(db: DB, slug: string | undefined, recipe: AppRecipe): AppDef | null {
  const have = slug ? getApp(db, slug) : null;
  if (!have) return null;
  return JSON.stringify(travelling({ ...have, mode: have.mode })) === JSON.stringify(travelling(recipe)) ? have : null;
}

/** One recipe as it would come in: tidied, its mode and assistant made safe here, and what changed or cannot work, in words. */
function intake(db: DB, raw: Record<string, any>, named: string, files?: Record<string, Buffer>) {
  const problems = [...cleanFlow(raw.flow).errors, ...cleanData(raw.data).errors, ...cleanRequires(raw.requires).errors, ...cleanSecrets(raw.secrets).errors].map((p) => named + p);
  const notes: string[] = [];
  const recipe = cleanRecipe({ ...raw, cwd: undefined });
  // Its own files come in its package: one it names that is not there shows nothing.
  for (const name of Object.keys(recipe.assets ?? {}))
    if (!files?.[name]) {
      notes.push(`${named}Its file “${name}” is not in the package: it is left out, and what shows it shows nothing`);
      delete recipe.assets![name];
    }
  if (recipe.assets && !Object.keys(recipe.assets).length) delete recipe.assets;
  const total = Object.entries(files ?? {}).reduce((n, [name, b]) => n + (recipe.assets?.[name] ? b.length : 0), 0);
  if (total > MEDIA_LIMITS.assets) problems.push(`${named}Its files are ${Math.round(total / 1048576)} MB together, over the ${MEDIA_LIMITS.assets >> 20} MB an app may have`);
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
  // What runs its code says so before it comes in (each in a sandbox: no network, none of this computer's files).
  const code = recipe.flow ? allSteps(recipe.flow.steps).filter((s) => s.do === 'code') : [];
  if (code.length) notes.push(`${named}${code.length === 1 ? 'One of its steps runs' : `${code.length} of its steps run`} a program of its own (${[...new Set(code.map((s) => (s.do === 'code' && s.language === 'python' ? 'Python' : 'JavaScript')))].join(', ')}), in a sandbox with no network and none of this computer's files`);
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
      // An OpenRouter model is added to Settings → Models by itself when the app first runs (its key asked for with the app's keys).
      const fetched = !exact && !same && n.provider === 'openrouter' && !!n.model;
      out.push({
        as: n.as,
        agent: 'custom',
        label,
        status: exact ? 'here' : same ? 'matched' : fetched ? 'provider' : 'missing',
        use: exact ? n.as : same ? same.id : fetched ? `openrouter/${n.model}` : '',
        options,
      });
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
  const main = intake(db, raw, '', pkg.files);
  const recipe = main.recipe;
  const problems = [...main.problems];
  const notes = [...main.notes];
  const warnings: string[] = [];
  // The templates that come with it: installed first, or the one you have when it is the same.
  const bundled = (pkg.apps ?? []).map((p) => {
    const b = intake(db, p.app as Record<string, any>, `${String(p.app.name ?? p.slug ?? 'An app it calls')}: `, p.files);
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
  for (const c of calls) if (!comes.has(c) && !getApp(db, c)) warnings.push(`It calls the app “${c}”, which is neither here nor in the file: that step fails until you install it`);
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
  if (taken) notes.push(`You have an app called “${taken}” already: this one installs beside it, at an address of its own`);
  const models = await modelsHere([recipe, ...bundled.filter((b) => !b.reuse).map((b) => b.recipe)], catalog);
  for (const m of models) if (m.status === 'missing') warnings.push(m.options.length ? `It asks for ${m.label}, which is not set up here: pick another to stand in, or its agent's default is used` : m.agent === 'custom' ? `It asks for ${m.label}, and Custom has no models here: add one in Settings → Models first` : `It asks for ${m.label}, and ${AGENT_NAME[m.agent]} is not set up here`);
  const screens = Object.keys(raw.screens && typeof raw.screens === 'object' ? (raw.screens as Record<string, unknown>) : {});
  const summary = appSummary(recipe);
  // The keys it (and what comes with it) needs, each once, and whether the vault has them.
  const secrets = [recipe, ...bundled.filter((b) => !b.reuse).map((b) => b.recipe)].flatMap((r) => secretsOf(db, r)).filter((x, i, all) => all.findIndex((y) => y.name === x.name) === i);
  // Its own files, and what its view runs of its own.
  const files = Object.entries(recipe.assets ?? {}).map(([name, a]) => ({ name, mime: a.mime, bytes: pkg.files?.[name]?.length ?? a.bytes }));
  const view = recipe.ui ? { widgets: Object.keys(recipe.ui.widgets ?? {}), libs: Object.entries(recipe.ui.libs ?? {}).map(([k, v]) => `${k} ${v}`) } : { widgets: [], libs: [] };
  if (view.widgets.length) notes.push(`Its view runs ${view.widgets.length === 1 ? 'a script' : `${view.widgets.length} scripts`} of its own to draw (${view.widgets.join(', ')}), in the same sandbox as every page: it cannot reach this computer or your other apps${view.libs.length ? `, and loads ${view.libs.join(', ')} from the web (jsDelivr)` : ''}`);
  // A ready-made app's file: it comes back as itself where it was uninstalled; where it is installed, as a copy of your own.
  const builtin = pkg.builtin ? templateById(pkg.builtin) : undefined;
  if (builtin) notes.push(isInstalled(db, builtin.id) ? `This is the ready-made app ${builtin.name}, which you have: it installs as a copy of your own, to change as you like` : `This is the ready-made app ${builtin.name}, which you uninstalled: installing brings it back`);
  const preview: InstallPreview = {
    name: recipe.name,
    description: recipe.description,
    icon: recipe.icon,
    color: recipe.color,
    ...(recipe.category ? { category: recipe.category } : {}),
    summary: { ...summary, ownPage: summary.ownPage || screens.includes('main') },
    steps: recipe.flow ? allSteps(recipe.flow.steps).length : 0,
    agents: who,
    tools: recipe.tools,
    apps: calls,
    data,
    memory: !!recipe.memory,
    limits: recipe.limits,
    needs,
    models,
    screens,
    bundled: bundled.map((b) => ({ name: b.recipe.name, from: b.pkg.slug ?? '', installs: b.reuse ? 'reuse' : 'new' })),
    secrets,
    files,
    view,
    ...(builtin ? { builtin: { id: builtin.id, installed: isInstalled(db, builtin.id) } } : {}),
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
export async function installPackage(
  db: DB,
  pkg: AppPackage,
  o: { models?: Record<string, unknown>; catalog?: Catalog; agents?: boolean } = {},
): Promise<{ app?: AppDef; builtin?: string; notes: string[]; records: number; skipped: number; bundled: { name: string; slug: string; reused: boolean }[] }> {
  const { recipe, bundled, preview } = await previewOf(db, pkg, o.catalog);
  if (preview.problems.length) throw new HttpError(400, `This app cannot be installed: ${preview.problems.join('; ')}`);
  // A ready-made app you uninstalled comes back as itself.
  const builtin = pkg.builtin ? templateById(pkg.builtin) : undefined;
  if (builtin && !isInstalled(db, builtin.id)) {
    setInstalled(db, builtin.id, true);
    return { builtin: builtin.id, notes: preview.notes, records: 0, skipped: 0, bundled: [] };
  }
  // Its own files, and those of the apps that come with it: a copy kept here, by their names.
  const keep = (r: AppRecipe, files?: Record<string, Buffer>) => {
    for (const [name, a] of Object.entries(r.assets ?? {})) {
      const b = files?.[name];
      if (!b) continue;
      const m = putMediaBuffer(db, b, name, a.mime);
      r.assets![name] = { sha: m.sha, mime: m.mime, bytes: m.bytes, ...(a.caption ? { caption: a.caption } : {}) };
    }
  };
  keep(recipe, pkg.files);
  for (const b of bundled) if (!b.reuse) keep(b.recipe, b.pkg.files);
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
    const app = b.reuse ?? saveApp(db, { recipe: b.recipe, by: 'install', fromFile: true });
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
    saveApp(db, { id: m.app.id, recipe: m.recipe, by: 'install' });
  }
  retarget(recipe, moved);
  // Installed from a file (uninstalling deletes it); agents in sessions may run it unless the card said no.
  const first = saveApp(db, { recipe, by: 'install', fromFile: true, ...(o.agents === false ? { agents: false } : {}) });
  recipe.screens = screensFrom(db, first.id, (pkg.app as Record<string, unknown>).screens);
  const app = recipe.screens ? saveApp(db, { id: first.id, recipe, by: 'install' }) : first;
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
