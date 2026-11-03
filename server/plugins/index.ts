// Plugins for every agent: add one (built in, from a Git link, a .zip or a folder), with the plugins it
// needs first; set it up (its packages and files, in its own data folder); turn it on and off (the plugins
// that need it follow); update it; remove it. Make your own in the plugin editor (skills, tools,
// instructions, needs and files of its own) and pack it into a .zip to share. Every agent the app starts
// gets the active ones: their skills through the skill library, their MCP servers and instructions here.
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AGENT_PLUGINS_MCP_SCHEMA,
  AGENT_PLUGINS_SCHEMA,
  HYDOR_EXT,
  PLUGIN_FILE,
  PLUGIN_FILE_LIMITS,
  satisfies,
  validPluginName,
  type PluginDraft,
  type PluginJob,
  type PluginList,
  type PluginPreview,
  type PluginSource,
  type PluginView,
} from '../../shared/plugins.ts';
import { parseSkill, SKILL_NAME } from '../../shared/skillpack.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { zipOf } from '../apps/package.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { Zip } from '../documents/zip.ts';
import type { Deps, Feature } from '../features/types.ts';
import { isPluginFolder, readPlugin, requiresOf, serverOf, type Manifest } from './manifest.ts';
import { needsSetup, runSetup, setupOf } from './setup.ts';
import {
  activePlugins,
  agentKind,
  brokenView,
  builtins,
  busy,
  dataOf,
  forgetRead,
  installedDir,
  installedList,
  installedOne,
  isManifest,
  load,
  loadedPlugins,
  mineDir,
  ownFiles,
  pluginAdditions,
  pluginRoots,
  rootOf,
  saveInstalled,
  syncPluginSkills,
  tmpDir,
  viewOf,
  viewOfPlugin,
  type Installed,
  type Loaded,
} from './store.ts';

export { setPluginRoots } from './store.ts';

const warn = (e: unknown) => console.warn(`[plugins] ${(e as Error)?.message ?? e}`);

// ---- jobs ------------------------------------------------------------------------------------------

const jobs = new Map<string, PluginJob>();

interface Rep {
  step(label: string): void;
  log(text: string): void;
}

function newJob(d: Deps, plugin: string, action: PluginJob['action']): { job: PluginJob; rep: Rep; finish: (e?: unknown) => void } {
  const job: PluginJob = { id: crypto.randomBytes(6).toString('hex'), plugin, action, state: 'running', steps: [], log: '', startedAt: Date.now() };
  jobs.set(job.id, job);
  let timer: NodeJS.Timeout | null = null;
  const send = () => {
    timer = null;
    d.broadcast({ t: 'feature', id: 'plugins', data: { job } });
  };
  const soon = () => {
    timer ??= setTimeout(send, 400);
  };
  const rep: Rep = {
    step(label) {
      const cur = job.steps.at(-1);
      if (cur?.state === 'running') cur.state = 'done';
      job.steps.push({ label, state: 'running' });
      send();
    },
    log(text) {
      job.log = (job.log + text).slice(-30_000);
      soon();
    },
  };
  const finish = (e?: unknown) => {
    const cur = job.steps.at(-1);
    if (cur?.state === 'running') cur.state = e ? 'failed' : 'done';
    job.state = e ? 'failed' : 'done';
    if (e) {
      job.error = (e as Error)?.message ?? String(e);
      job.log = `${job.log}\n${job.error}\n`.slice(-30_000);
    }
    job.endedAt = Date.now();
    if (timer) clearTimeout(timer);
    send();
    d.broadcast({ t: 'feature', id: 'plugins', data: { changed: true } });
    setTimeout(() => jobs.delete(job.id), 15 * 60_000).unref?.();
  };
  return { job, rep, finish };
}

// ---- looking at a plugin before adding it ------------------------------------------------------------

interface Pending {
  token: string;
  /** The folder read (a copy in tmp/, or the folder itself). */
  root: string;
  /** The temporary folder its copy is in (tmp/<token>), removed once it is added or forgotten; none for a folder used in place. */
  dir?: string;
  source: PluginSource;
  at: number;
}
const pending = new Map<string, Pending>();

function sweepPending() {
  for (const [t, p] of pending)
    if (Date.now() - p.at > 30 * 60_000) {
      pending.delete(t);
      if (p.dir) fs.rmSync(p.dir, { recursive: true, force: true });
    }
}

function git(args: string[], cwd: string, timeout = 5 * 60_000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) =>
    execFile('git', args, { cwd, timeout, maxBuffer: 16 << 20, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' } }, (e, stdout, stderr) =>
      resolve({ code: e ? (typeof (e as { code?: unknown }).code === 'number' ? ((e as { code: number }).code) : 1) : 0, out: `${stdout ?? ''}${stderr ?? ''}` }),
    ),
  );
}

/** A Git link as people paste it: owner/repo, https://…, a GitHub page of a folder (…/tree/<branch>/<folder>), or git@host:path. */
export function parseGitLink(raw: string, o: { ref?: string; subdir?: string } = {}): { url: string; ref?: string; subdir?: string } {
  let s = raw.trim();
  let ref = o.ref?.trim() || undefined;
  let subdir = o.subdir?.trim().replace(/^\/+|\/+$/g, '') || undefined;
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) s = `https://github.com/${s}`;
  const tree = /^(https:\/\/(?:github\.com|gitlab\.com)\/[\w.-]+\/[\w.-]+?)(?:\.git)?\/(?:-\/)?tree\/([^/]+)(?:\/(.+))?$/.exec(s);
  if (tree) {
    s = tree[1];
    ref ??= tree[2];
    subdir ??= tree[3]?.replace(/\/+$/, '');
  }
  if (!/^(https:\/\/[\w.-]+(?::\d+)?\/[\w./~+-]+|git@[\w.-]+:[\w./~+-]+|ssh:\/\/[\w@.-]+(?::\d+)?\/[\w./~+-]+)$/.test(s)) throw new HttpError(400, 'Give a Git address: owner/repo, https://… or git@host:path');
  if (ref && !/^[\w./-]{1,200}$/.test(ref)) throw new HttpError(400, 'That branch or tag name has characters Git does not take');
  if (subdir && (subdir.split('/').includes('..') || !/^[\w./ -]{1,300}$/.test(subdir))) throw new HttpError(400, 'The folder must be a path inside the repository');
  return { url: s, ref, subdir };
}

/** A copy of a repository's plugin, in tmp/<token>/repo (its .git left out). */
async function cloneTo(dir: string, link: { url: string; ref?: string; subdir?: string }): Promise<{ root: string; commit?: string }> {
  fs.mkdirSync(dir, { recursive: true });
  const repo = path.join(dir, 'repo');
  const r = await git(['clone', '--depth', '1', ...(link.ref ? ['--branch', link.ref] : []), '--', link.url, repo], dir);
  if (r.code !== 0) throw new HttpError(400, `Could not get it from ${link.url}: ${r.out.trim().split('\n').slice(-2).join(' ').slice(0, 300) || 'git failed'}`);
  const commit = (await git(['rev-parse', 'HEAD'], repo)).out.trim() || undefined;
  fs.rmSync(path.join(repo, '.git'), { recursive: true, force: true });
  const root = link.subdir ? path.join(repo, link.subdir) : repo;
  if (!path.resolve(root).startsWith(repo + path.sep) && root !== repo) throw new HttpError(400, 'The folder must be inside the repository');
  if (!fs.existsSync(root)) throw new HttpError(400, `The repository has no folder ${link.subdir}`);
  if (!isPluginFolder(root)) {
    // A repository of several plugins: say which are there.
    const kids = fs.existsSync(root) ? fs.readdirSync(root).filter((n) => isPluginFolder(path.join(root, n))) : [];
    throw new HttpError(400, kids.length ? `That repository holds several plugins: give the folder of one (${kids.slice(0, 8).join(', ')})` : 'There is no plugin.json there: it is not a plugin');
  }
  return { root, commit };
}

const MAX_ZIP = 160 << 20;

/** A .zip's plugin, unpacked in tmp/<token>/plugin: its plugin.json at the top, or in the one folder it holds. */
function unzipTo(dir: string, data: Buffer): string {
  if (data.length > MAX_ZIP) throw new HttpError(413, `A plugin file is at most ${MAX_ZIP >> 20} MB`);
  let zip: Zip;
  try {
    zip = new Zip(data, 600 << 20);
  } catch {
    throw new HttpError(400, 'This file could not be read as a .zip');
  }
  const names = zip.names();
  const main = names
    .filter((n) => /(^|\/)(\.claude-plugin\/)?plugin\.json$/.test(n) && n.replace(/(^|\/)\.claude-plugin\//, '$1').split('/').length <= 2)
    .sort((a, b) => a.length - b.length)[0];
  if (!main) throw new HttpError(400, 'This .zip holds no plugin.json: it is not a plugin');
  const base = main.replace(/(\.claude-plugin\/)?plugin\.json$/, '');
  const root = path.join(dir, 'plugin');
  fs.mkdirSync(root, { recursive: true });
  let count = 0;
  for (const n of names) {
    if (!n.startsWith(base) || n.endsWith('/')) continue;
    const rel = n.slice(base.length);
    if (!rel || rel.split('/').some((p) => p === '..' || p === '') || path.isAbsolute(rel)) continue;
    if (++count > 5000) throw new HttpError(400, 'This .zip holds too many files for a plugin');
    const b = zip.read(n, 200 << 20);
    if (!b) continue;
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, b);
  }
  // Scripts lose their executable bit in a zip made elsewhere: give it back to what a server would start.
  for (const sub of ['bin', 'scripts'])
    try {
      for (const f of fs.readdirSync(path.join(root, sub))) fs.chmodSync(path.join(root, sub, f), 0o755);
    } catch {}
  return root;
}

/** The built-in plugins a plugin needs that are not installed (in the order to add them), and needs no one has. */
function planFor(db: DB, m: Manifest): { add: Manifest[]; unavailable: string[] } {
  const installed = new Map(loadedPlugins(db).ok.map((l) => [l.i.name, l.m]));
  const bi = new Map(builtins().map((b) => [b.name, b]));
  const add: Manifest[] = [];
  const unavailable: string[] = [];
  const seen = new Set([m.name]);
  const visit = (x: Manifest) => {
    for (const r of x.requires.plugins) {
      if (seen.has(r.name)) continue;
      seen.add(r.name);
      const have = installed.get(r.name);
      if (have) {
        if (!satisfies(have.version, r.range)) unavailable.push(`${r.name} ${r.range} (you have ${have.version ?? 'a version without a number'})`);
        continue;
      }
      const b = bi.get(r.name);
      if (b && satisfies(b.version, r.range)) {
        visit(b);
        add.push(b);
      } else unavailable.push(r.range === '*' ? r.name : `${r.name} ${r.range}`);
    }
  };
  visit(m);
  return { add, unavailable };
}

function previewOf(db: DB, p: Pending): PluginPreview {
  const m = readPlugin(p.root);
  const all = loadedPlugins(db).ok;
  const { add, unavailable } = planFor(db, m);
  const have = installedOne(db, m.name);
  return { token: p.token, view: viewOfPlugin(db, m, undefined, all, { readme: true }), brings: add.map((b) => b.name), unavailable, replaces: have ? m.name : undefined };
}

// ---- adding, setting up, updating, removing ----------------------------------------------------------

const changed = (d: Deps) => d.broadcast({ t: 'feature', id: 'plugins', data: { changed: true } });

function refresh(d: Deps) {
  forgetRead();
  try {
    syncPluginSkills(d.db, { force: true });
  } catch (e) {
    warn(e);
  }
}

/** Sets a plugin up when it needs it and its needs changed (or `force`). */
async function setUp(d: Deps, name: string, rep: Rep, force = false) {
  const i = installedOne(d.db, name);
  if (!i) return;
  const m = load(rootOf(i));
  if (!isManifest(m) || !needsSetup(m.requires)) return;
  const st = setupOf(m.requires, dataOf(name), false).state;
  if (!force && st === 'ready') return;
  busy.add(name);
  try {
    await runSetup(name, m.requires, dataOf(name), {
      step: (label) => rep.step(`${m.title}: ${label}`),
      log: (t) => rep.log(t),
    });
  } finally {
    busy.delete(name);
  }
}

function record(db: DB, i: Installed) {
  saveInstalled(db, [...installedList(db).filter((x) => x.name !== i.name), i]);
}

/** Places a plugin's files where an installed one lives (installed/<name>, replacing an older copy). */
function place(src: string, name: string): string {
  const dest = path.join(installedDir(), name);
  fs.mkdirSync(installedDir(), { recursive: true });
  const old = `${dest}.old-${process.pid}`;
  if (fs.existsSync(dest)) fs.renameSync(dest, old);
  try {
    fs.cpSync(src, dest, { recursive: true, dereference: false, verbatimSymlinks: true });
  } catch (e) {
    fs.rmSync(dest, { recursive: true, force: true });
    if (fs.existsSync(old)) fs.renameSync(old, dest);
    throw e;
  }
  fs.rmSync(old, { recursive: true, force: true });
  return dest;
}

/**
 * Adds a plugin (a built-in one by name, or one looked at with `token`) with the built-in plugins it needs
 * first, sets each up, and turns them on. Runs as a job the pages follow.
 */
function install(d: Deps, input: { name?: unknown; token?: unknown }): PluginJob {
  sweepPending();
  const db = d.db;
  let m: Manifest;
  let p: Pending | undefined;
  if (typeof input.token === 'string') {
    p = pending.get(input.token);
    if (!p) throw new HttpError(404, 'That look at the plugin has expired: look at it again');
    m = readPlugin(p.root);
    if (builtins().some((b) => b.name === m.name) && p.source.kind !== 'builtin') throw new HttpError(409, `A built-in plugin is named ${m.name}: rename yours (its plugin.json) to add it`);
    const have = installedOne(db, m.name);
    if (have && have.source.kind === 'builtin') throw new HttpError(409, `${m.name} is a built-in plugin here`);
  } else if (typeof input.name === 'string') {
    const b = builtins().find((x) => x.name === input.name);
    if (!b) throw new HttpError(404, `No built-in plugin named ${input.name}`);
    m = b;
  } else throw new HttpError(400, 'Say which plugin to add');
  const { add, unavailable } = planFor(db, m);
  if (unavailable.length) throw new HttpError(400, `${m.title} needs ${unavailable.length === 1 ? 'a plugin' : 'plugins'} not found here: ${unavailable.join(', ')}. Add ${unavailable.length === 1 ? 'it' : 'them'} first.`);
  const { job, rep, finish } = newJob(d, m.name, 'install');
  const run = async () => {
    for (const b of add) {
      rep.step(`Adding ${b.title}`);
      record(db, { name: b.name, source: { kind: 'builtin' }, enabled: true, installedAt: Date.now() });
      await setUp(d, b.name, rep);
    }
    rep.step(`Adding ${m.title}`);
    const prev = installedOne(db, m.name);
    let source: PluginSource = { kind: 'builtin' };
    if (p) {
      source = p.source;
      if (p.source.kind === 'git' || p.source.kind === 'file') place(p.root, m.name);
      pending.delete(p.token);
      if (p.dir) fs.rmSync(p.dir, { recursive: true, force: true });
    }
    record(db, { name: m.name, source, enabled: true, installedAt: prev?.installedAt ?? Date.now(), updatedAt: prev ? Date.now() : undefined });
    forgetRead();
    await setUp(d, m.name, rep);
    refresh(d);
  };
  run().then(
    () => finish(),
    (e) => {
      refresh(d);
      finish(e);
    },
  );
  return job;
}

function setupJob(d: Deps, name: string): PluginJob {
  const i = installedOne(d.db, name);
  if (!i) throw new HttpError(404, `${name} is not installed`);
  if (busy.has(name)) throw new HttpError(409, `${name} is being set up already`);
  const { job, rep, finish } = newJob(d, name, 'setup');
  setUp(d, name, rep, true)
    .then(() => refresh(d))
    .then(
      () => finish(),
      (e) => {
        refresh(d);
        finish(e);
      },
    );
  return job;
}

function updateJob(d: Deps, name: string): PluginJob {
  const i = installedOne(d.db, name);
  if (!i) throw new HttpError(404, `${name} is not installed`);
  if (i.source.kind === 'file') throw new HttpError(400, 'It came from a file: add the newer file to update it');
  const { job, rep, finish } = newJob(d, name, 'update');
  const run = async () => {
    if (i.source.kind === 'git') {
      rep.step(`Getting the latest from ${i.source.url}`);
      const dir = path.join(tmpDir(), crypto.randomBytes(6).toString('hex'));
      try {
        const got = await cloneTo(dir, i.source);
        const m = readPlugin(got.root);
        if (m.name !== name) throw new Error(`The repository now holds a plugin named ${m.name}`);
        const { unavailable } = planFor(d.db, m);
        if (unavailable.length) throw new Error(`The new version needs plugins not found here: ${unavailable.join(', ')}`);
        place(got.root, name);
        record(d.db, { ...i, source: { ...i.source, commit: got.commit }, updatedAt: Date.now() });
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    forgetRead();
    await setUp(d, name, rep);
    refresh(d);
  };
  run().then(
    () => finish(),
    (e) => {
      refresh(d);
      finish(e);
    },
  );
  return job;
}

/** Turns a plugin on, with the plugins it needs; returns every one turned on. */
function enable(d: Deps, name: string): string[] {
  const list = installedList(d.db);
  const byName = new Map(list.map((i) => [i.name, i]));
  if (!byName.has(name)) throw new HttpError(404, `${name} is not installed`);
  const on: string[] = [];
  const visit = (n: string, seen: Set<string>) => {
    if (seen.has(n)) return;
    seen.add(n);
    const i = byName.get(n);
    if (!i) throw new HttpError(400, `It needs the plugin ${n}, which is not installed: add it first`);
    const m = load(rootOf(i));
    if (isManifest(m)) for (const r of m.requires.plugins) visit(r.name, seen);
    if (!i.enabled) {
      i.enabled = true;
      on.push(n);
    }
  };
  visit(name, new Set());
  saveInstalled(d.db, list);
  refresh(d);
  changed(d);
  return on;
}

/** The installed plugins that need `name`, directly or through others. */
function dependentsOf(db: DB, name: string): string[] {
  const all = loadedPlugins(db).ok;
  const out = new Set<string>();
  const visit = (n: string) => {
    for (const l of all) if (!out.has(l.i.name) && l.m.requires.plugins.some((r) => r.name === n)) (out.add(l.i.name), visit(l.i.name));
  };
  visit(name);
  out.delete(name);
  return [...out];
}

/** Turns a plugin off, and the ones that need it; returns every one turned off. */
function disable(d: Deps, name: string): string[] {
  const list = installedList(d.db);
  if (!list.some((i) => i.name === name)) throw new HttpError(404, `${name} is not installed`);
  const names = new Set([name, ...dependentsOf(d.db, name)]);
  const off: string[] = [];
  for (const i of list)
    if (names.has(i.name) && i.enabled) {
      i.enabled = false;
      off.push(i.name);
    }
  saveInstalled(d.db, list);
  refresh(d);
  changed(d);
  return off;
}

/** Removes a plugin and the ones that need it; its data folder too unless `keepData`. A folder of your own is left where it is, except the ones made here. */
function remove(d: Deps, name: string, o: { keepData?: boolean }): string[] {
  const list = installedList(d.db);
  if (!list.some((i) => i.name === name)) throw new HttpError(404, `${name} is not installed`);
  const names = new Set([name, ...dependentsOf(d.db, name)]);
  for (const i of list.filter((x) => names.has(x.name))) {
    if (i.source.kind === 'git' || i.source.kind === 'file') fs.rmSync(path.join(installedDir(), i.name), { recursive: true, force: true });
    if (i.source.kind === 'folder' && i.source.mine && path.resolve(i.source.path).startsWith(mineDir() + path.sep)) fs.rmSync(i.source.path, { recursive: true, force: true });
    fs.rmSync(viewOf(i.name), { recursive: true, force: true });
    if (!o.keepData) fs.rmSync(dataOf(i.name), { recursive: true, force: true });
  }
  saveInstalled(
    d.db,
    list.filter((x) => !names.has(x.name)),
  );
  refresh(d);
  changed(d);
  return [...names];
}

// ---- the editor: plugins of your own ------------------------------------------------------------------

const asText = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').slice(0, max) : '');

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** A plugin's folder, for its editor: only those made here or used from a folder, in the Agent Plugins format. */
function editable(db: DB, name: string): { i: Installed; m: Manifest } {
  const i = installedOne(db, name);
  if (!i) throw new HttpError(404, `${name} is not installed`);
  if (i.source.kind !== 'folder') throw new HttpError(400, 'Only the plugins you made, or use from a folder, can be changed here. Make a copy of this one to change it.');
  const m = load(rootOf(i));
  if (!isManifest(m)) throw new HttpError(400, m.error);
  if (m.format !== 'agent-plugins') throw new HttpError(400, 'It is in Claude Code’s layout: change its files in its folder');
  return { i, m };
}

function draftOf(m: Manifest): PluginDraft {
  let raw: Record<string, any> = {};
  try {
    raw = JSON.parse(fs.readFileSync(path.join(m.root, 'mcp.json'), 'utf8'))?.mcpServers ?? {};
  } catch {}
  const servers: PluginDraft['servers'] = Object.entries(raw).flatMap(([name, v]): PluginDraft['servers'] =>
    v?.type === 'stdio'
      ? [{ name, type: 'stdio', command: String(v.command ?? ''), args: Array.isArray(v.args) ? v.args.map(String) : [], env: v.env && typeof v.env === 'object' ? v.env : {} }]
      : v?.type === 'streamable-http'
        ? [{ name, type: 'streamable-http', url: String(v.url ?? ''), headers: v.headers && typeof v.headers === 'object' ? v.headers : {} }]
        : [],
  );
  let instructions = '';
  try {
    instructions = fs.readFileSync(path.join(m.root, HYDOR_EXT, 'instructions.md'), 'utf8');
  } catch {}
  return {
    name: m.name,
    title: m.title,
    version: m.version ?? '0.1.0',
    description: m.description ?? '',
    category: m.category,
    icon: m.icon,
    keywords: m.keywords,
    instructions,
    skills: m.skills.map((s) => ({ name: s.name, text: fs.readFileSync(path.join(s.dir, 'SKILL.md'), 'utf8') })),
    servers,
    requires: m.requires,
    files: ownFiles(m.root),
  };
}

/** Saves a plugin from its editor: plugin.json, mcp.json, its skills and its instructions. Checks everything first. */
function saveDraft(db: DB, name: string, body: Record<string, any>): { m: Manifest; setupChanged: boolean } {
  const { m } = editable(db, name);
  const root = m.root;
  const problems: string[] = [];
  const title = asText(body.title, 60).trim() || name;
  const version = asText(body.version, 40).trim() || '0.1.0';
  if (!/^\d+\.\d+\.\d+([-+][\w.-]+)?$/.test(version)) problems.push('The version is three numbers, like 1.0.0');
  const description = asText(body.description, 1000).trim();
  const keywords = Array.isArray(body.keywords) ? body.keywords.map((k: unknown) => asText(k, 40).trim()).filter(Boolean).slice(0, 20) : [];
  const requires = requiresOf(body.requires ?? {}, problems);
  if (requires.plugins.some((r) => r.name === name)) problems.push('A plugin cannot need itself');
  // Skills: each a whole SKILL.md named as its folder.
  const skills: { name: string; text: string }[] = [];
  for (const s of Array.isArray(body.skills) ? body.skills : []) {
    const n = asText(s?.name, 64).trim();
    const text = asText(s?.text, 20_000);
    if (!SKILL_NAME.test(n)) {
      problems.push(`A skill's name is lowercase letters, digits and dashes: ${n || '(none)'}`);
      continue;
    }
    const fm = parseSkill(text);
    if (fm.name !== n) problems.push(`The skill ${n}: its SKILL.md must say name: ${n}`);
    else if (!fm.description) problems.push(`The skill ${n} needs a description that says when to use it`);
    else if (fm.body.trim().length < 20) problems.push(`The skill ${n} needs its instructions`);
    if (skills.some((x) => x.name === n)) problems.push(`Two skills are named ${n}`);
    skills.push({ name: n, text: text.endsWith('\n') ? text : `${text}\n` });
  }
  // Servers, as mcp.json holds them, each checked as agents will take it.
  const mcp: Record<string, unknown> = {};
  for (const s of Array.isArray(body.servers) ? body.servers : []) {
    const n = asText(s?.name, 64).trim();
    if (!/^[A-Za-z0-9][\w.-]{0,63}$/.test(n)) {
      problems.push(`A tool server's name is letters, digits, dots, dashes and underscores: ${n || '(none)'}`);
      continue;
    }
    if (mcp[n]) problems.push(`Two tool servers are named ${n}`);
    const entry =
      s?.type === 'streamable-http'
        ? { type: 'streamable-http', url: asText(s.url, 2000).trim(), ...(s.headers && Object.keys(s.headers).length ? { headers: s.headers } : {}) }
        : { type: 'stdio', command: asText(s?.command, 500).trim(), ...(Array.isArray(s?.args) && s.args.length ? { args: s.args.map((a: unknown) => asText(a, 2000)) } : {}), ...(s?.env && Object.keys(s.env).length ? { env: s.env } : {}) };
    const c = serverOf(n, entry, root, false);
    if (c.info.problem) problems.push(`The tool server ${n}: ${c.info.problem}`);
    mcp[n] = entry;
  }
  if (problems.length) throw new HttpError(400, problems.join('. '));
  // plugin.json: what it had beside these (author, links, other extensions) is kept.
  let old: Record<string, any> = {};
  try {
    old = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  } catch {}
  const ext = { ...(old.extensions?.[HYDOR_EXT] ?? {}), title, ...(body.category ? { category: asText(body.category, 40) } : {}), ...(body.icon ? { icon: asText(body.icon, 40) } : {}) };
  if (!body.category) delete ext.category;
  if (!body.icon) delete ext.icon;
  const req: Record<string, unknown> = {};
  if (requires.plugins.length) req.plugins = Object.fromEntries(requires.plugins.map((r) => [r.name, r.range]));
  if (Object.keys(requires.npm).length) req.npm = requires.npm;
  if (requires.pip.length) req.pip = requires.pip;
  if (requires.python) req.python = requires.python;
  if (requires.commands.length) req.commands = requires.commands.map((c) => (c.hint || c.optional ? c : c.name));
  if (requires.files.length) req.files = requires.files;
  if (requires.keys.length) req.keys = requires.keys.map((k) => (k.description || k.optional || k.url ? k : k.name));
  if (Object.keys(req).length) ext.requires = req;
  else delete ext.requires;
  const manifest: Record<string, unknown> = {
    $schema: AGENT_PLUGINS_SCHEMA,
    name,
    version,
    ...(description ? { description } : {}),
    ...(old.author ? { author: old.author } : {}),
    ...(old.homepage ? { homepage: old.homepage } : {}),
    ...(old.repository ? { repository: old.repository } : {}),
    ...(old.license ? { license: old.license } : {}),
    ...(keywords.length ? { keywords } : {}),
    extensions: { ...(old.extensions ?? {}), [HYDOR_EXT]: ext },
  };
  const before = m.requires;
  writeAtomic(path.join(root, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (Object.keys(mcp).length) writeAtomic(path.join(root, 'mcp.json'), `${JSON.stringify({ $schema: AGENT_PLUGINS_MCP_SCHEMA, mcpServers: mcp }, null, 2)}\n`);
  else fs.rmSync(path.join(root, 'mcp.json'), { force: true });
  const keep = new Set(skills.map((s) => s.name));
  for (const s of m.skills) if (!keep.has(s.name) && path.dirname(s.dir) === path.join(root, 'skills')) fs.rmSync(s.dir, { recursive: true, force: true });
  for (const s of skills) writeAtomic(path.join(root, 'skills', s.name, 'SKILL.md'), s.text);
  const instructions = asText(body.instructions, 8000).trim();
  if (instructions) writeAtomic(path.join(root, HYDOR_EXT, 'instructions.md'), `${instructions}\n`);
  else fs.rmSync(path.join(root, HYDOR_EXT, 'instructions.md'), { force: true });
  if (!fs.existsSync(path.join(root, 'README.md'))) writeAtomic(path.join(root, 'README.md'), `# ${title}\n\n${description || 'A plugin for Hydor.'}\n`);
  forgetRead();
  const now = readPlugin(root);
  const key = (r: typeof before) => JSON.stringify({ npm: r.npm, pip: r.pip, python: r.python ?? '', files: r.files });
  return { m: now, setupChanged: key(before) !== key(now.requires) && needsSetup(now.requires) };
}

/** A new plugin of your own, in plugins/mine/<name>, added and turned on. */
function createMine(d: Deps, body: Record<string, any>): string {
  const name = asText(body.name, 64).trim();
  if (!validPluginName(name)) throw new HttpError(400, 'Name it with lowercase letters, digits and dashes, like trip-tools');
  if (installedOne(d.db, name) || builtins().some((b) => b.name === name)) throw new HttpError(409, `A plugin named ${name} is here already`);
  const root = path.join(mineDir(), name);
  if (fs.existsSync(root)) throw new HttpError(409, `The folder ${root} is there already`);
  const title = asText(body.title, 60).trim() || name;
  const description = asText(body.description, 1000).trim();
  fs.mkdirSync(root, { recursive: true });
  writeAtomic(
    path.join(root, 'plugin.json'),
    `${JSON.stringify({ $schema: AGENT_PLUGINS_SCHEMA, name, version: '0.1.0', ...(description ? { description } : {}), extensions: { [HYDOR_EXT]: { title } } }, null, 2)}\n`,
  );
  writeAtomic(path.join(root, 'README.md'), `# ${title}\n\n${description || 'A plugin for Hydor.'}\n`);
  record(d.db, { name, source: { kind: 'folder', path: root, mine: true }, enabled: true, installedAt: Date.now() });
  refresh(d);
  changed(d);
  return name;
}

/** A plugin as a .zip to share: its folder under <name>/, without what setup or Git leave behind. */
function exportZip(root: string, name: string): Buffer {
  const files: { name: string; data: Buffer }[] = [];
  let total = 0;
  const SKIP = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.DS_Store']);
  const walk = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (SKIP.has(e.name) || e.name.endsWith('.tmp')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
      else if (e.isFile()) {
        const data = fs.readFileSync(p);
        total += data.length;
        if (total > 300 << 20) throw new HttpError(413, 'The plugin is over 300 MB: too big to pack');
        files.push({ name: `${name}/${rel}${e.name}`, data });
      }
    }
  };
  walk(root, '');
  return zipOf(files);
}

// ---- the list -----------------------------------------------------------------------------------------

function list(db: DB): PluginList {
  const { ok, broken } = loadedPlugins(db);
  const installed: PluginView[] = [...ok.map((l) => viewOfPlugin(db, l.m, l.i, ok)), ...broken.map((b) => brokenView(b.i, b.error))].sort((a, b) => a.title.localeCompare(b.title));
  const have = new Set(installed.map((p) => p.name));
  const available = builtins()
    .filter((b) => !have.has(b.name))
    .map((b) => viewOfPlugin(db, b, undefined, ok))
    .sort((a, b) => a.title.localeCompare(b.title));
  return { installed, available, jobs: [...jobs.values()].filter((j) => j.state === 'running' || Date.now() - (j.endedAt ?? 0) < 60_000), folders: { installed: installedDir(), data: path.join(pluginRoots().base, 'data'), mine: mineDir() } };
}

function detail(db: DB, name: string): PluginView {
  const all = loadedPlugins(db);
  const l = all.ok.find((x) => x.i.name === name);
  if (l) return viewOfPlugin(db, l.m, l.i, all.ok, { readme: true });
  const b = all.broken.find((x) => x.i.name === name);
  if (b) return brokenView(b.i, b.error);
  const bi = builtins().find((x) => x.name === name);
  if (bi) return viewOfPlugin(db, bi, undefined, all.ok, { readme: true });
  throw new HttpError(404, `No plugin named ${name}`);
}

// ---- the feature --------------------------------------------------------------------------------------

export const plugins: Feature = {
  id: 'plugins',
  routes(d) {
    const { app, db } = d;
    const param = (req: { params: unknown }, k: string) => String((req.params as Record<string, string>)[k] ?? '');
    const body = (req: { body: unknown }) => (req.body ?? {}) as Record<string, any>;
    app.get('/api/plugins', async () => list(db));
    app.get('/api/plugins/jobs/:id', async (req) => {
      const j = jobs.get(param(req, 'id'));
      if (!j) throw new HttpError(404, 'No such job (it may have finished a while ago)');
      return { job: j };
    });
    app.get('/api/plugins/:name', async (req) => detail(db, param(req, 'name')));
    // Looking at a plugin before adding it: from a Git link, a .zip (base64) or a folder on this computer.
    app.post('/api/plugins/inspect', { bodyLimit: Math.ceil(MAX_ZIP * 1.37) + (1 << 20) }, async (req) => {
      sweepPending();
      const b = body(req);
      const token = crypto.randomBytes(9).toString('hex');
      const dir = path.join(tmpDir(), token);
      try {
        let p: Pending;
        if (typeof b.url === 'string' && b.url.trim()) {
          const link = parseGitLink(b.url, { ref: typeof b.ref === 'string' ? b.ref : undefined, subdir: typeof b.subdir === 'string' ? b.subdir : undefined });
          const got = await cloneTo(dir, link);
          p = { token, root: got.root, dir, source: { kind: 'git', ...link, commit: got.commit }, at: Date.now() };
        } else if (b.file && typeof b.file.data === 'string') {
          const root = unzipTo(dir, Buffer.from(b.file.data, 'base64'));
          p = { token, root, dir, source: { kind: 'file', file: asText(b.file.name, 200) || 'plugin.zip' }, at: Date.now() };
        } else if (typeof b.path === 'string' && b.path.trim()) {
          const abs = path.resolve(b.path.trim().replace(/^~(?=$|\/)/, os.homedir()));
          if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new HttpError(400, `No folder at ${abs}`);
          if (!isPluginFolder(abs)) throw new HttpError(400, 'That folder has no plugin.json: it is not a plugin');
          p = { token, root: abs, source: { kind: 'folder', path: abs }, at: Date.now() };
        } else throw new HttpError(400, 'Give a Git link, a .zip file or a folder');
        let preview: PluginPreview;
        try {
          preview = previewOf(db, p);
        } catch (e) {
          throw new HttpError(400, (e as Error).message);
        }
        pending.set(token, p);
        return preview;
      } catch (e) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw e;
      }
    });
    app.post('/api/plugins/install', async (req) => ({ job: install(d, body(req)) }));
    app.post('/api/plugins/new', async (req) => ({ plugin: detail(db, createMine(d, body(req))) }));
    app.post('/api/plugins/:name/enable', async (req) => ({ on: enable(d, param(req, 'name')) }));
    app.post('/api/plugins/:name/disable', async (req) => ({ off: disable(d, param(req, 'name')) }));
    app.post('/api/plugins/:name/setup', async (req) => ({ job: setupJob(d, param(req, 'name')) }));
    app.post('/api/plugins/:name/update', async (req) => ({ job: updateJob(d, param(req, 'name')) }));
    app.post('/api/plugins/:name/remove', async (req) => ({ removed: remove(d, param(req, 'name'), { keepData: body(req).keepData === true }) }));
    // The editor.
    app.get('/api/plugins/:name/draft', async (req) => draftOf(editable(db, param(req, 'name')).m));
    app.put('/api/plugins/:name/draft', async (req) => {
      const name = param(req, 'name');
      const r = saveDraft(db, name, body(req));
      refresh(d);
      changed(d);
      const job = r.setupChanged && installedOne(db, name)?.enabled ? setupJob(d, name) : undefined;
      return { plugin: detail(db, name), draft: draftOf(r.m), ...(job ? { job } : {}) };
    });
    app.post('/api/plugins/:name/files', { bodyLimit: Math.ceil(PLUGIN_FILE_LIMITS.file * 1.37) + (1 << 20) }, async (req) => {
      const { m } = editable(db, param(req, 'name'));
      const b = body(req);
      const name = asText(b.name, 300).trim().replace(/^\/+/, '');
      if (!PLUGIN_FILE.test(name)) throw new HttpError(400, 'Name the file with letters, digits, dots, dashes and underscores');
      if (typeof b.data !== 'string') throw new HttpError(400, 'No file came');
      const data = Buffer.from(b.data, 'base64');
      if (data.length > PLUGIN_FILE_LIMITS.file) throw new HttpError(413, `A plugin's file is at most ${PLUGIN_FILE_LIMITS.file >> 20} MB`);
      const others = ownFiles(m.root).filter((f) => f.name !== name);
      if (others.reduce((n, f) => n + f.bytes, 0) + data.length > PLUGIN_FILE_LIMITS.total) throw new HttpError(413, `A plugin's files are at most ${PLUGIN_FILE_LIMITS.total >> 20} MB together`);
      const dest = path.join(m.root, 'files', name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
      changed(d);
      return { files: ownFiles(m.root) };
    });
    app.delete('/api/plugins/:name/files', async (req) => {
      const { m } = editable(db, param(req, 'name'));
      const name = String((req.query as { name?: string }).name ?? '');
      if (!PLUGIN_FILE.test(name)) throw new HttpError(400, 'No such file');
      fs.rmSync(path.join(m.root, 'files', name), { force: true });
      changed(d);
      return { files: ownFiles(m.root) };
    });
    app.get('/api/plugins/:name/export', async (req, reply) => {
      const name = param(req, 'name');
      const i = installedOne(db, name);
      const root = i ? rootOf(i) : builtins().find((b) => b.name === name)?.root;
      if (!root) throw new HttpError(404, `No plugin named ${name}`);
      const m = load(root);
      const version = isManifest(m) && m.version ? `-${m.version}` : '';
      reply.header('content-type', 'application/zip').header('content-disposition', `attachment; filename="${name}${version}.zip"`);
      return reply.send(exportZip(root, name));
    });
  },
  spawn(s, d) {
    try {
      syncPluginSkills(d.db);
    } catch (e) {
      warn(e);
    }
    const a = pluginAdditions(d.db, agentKind(s, CONSOLE_ID));
    return Object.keys(a.mcpServers).length || a.instructions.length ? a : undefined;
  },
  start(d) {
    try {
      fs.rmSync(tmpDir(), { recursive: true, force: true });
    } catch {}
    refresh(d);
    // Built-in plugins whose needs changed with the app: set up again, in the background.
    for (const i of installedList(d.db)) {
      if (i.source.kind !== 'builtin' || !i.enabled) continue;
      const m = load(rootOf(i));
      if (isManifest(m) && setupOf(m.requires, dataOf(i.name), false).state === 'outdated') {
        try {
          setupJob(d, i.name);
        } catch (e) {
          warn(e);
        }
      }
    }
    setInterval(sweepPending, 10 * 60_000).unref?.();
  },
};

/** For tests and the guide: the plugins agents get now. */
export const activeNames = (db: DB) => activePlugins(db).map((l: Loaded) => l.i.name);
