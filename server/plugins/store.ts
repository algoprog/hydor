// The plugins on this computer: the built-in ones (plugins/ in the app's folder), the ones the user added
// (kept in plugins.installed), which are active for an agent, the skills they bring (written for agents
// with their placeholders filled in, and given to the skill library), and how their MCP servers start.
//
// Folders, in the data folder's plugins/: installed/<name> (added from a link or a file), mine/<name> (made
// in the app's plugin editor), data/<name> (PLUGIN_DATA: its packages and files, kept across updates) and
// view/<name> (what agents read: its skills, its servers' launch specs).
import fs from 'node:fs';
import path from 'node:path';
import { satisfies, type PluginAgent, type PluginSource, type PluginView } from '../../shared/plugins.ts';
import { APP_ROOT, config } from '../config.ts';
import { readSecret, secretView } from '../connections/vault.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { McpServerSpec } from '../features/types.ts';
import { libraryNames, setPluginSkills, syncView, type PluginSkill } from '../skillpack/library.ts';
import { ManifestError, readmeOf, readPlugin, type Manifest } from './manifest.ts';
import { hasCommand, needsSetup, setupEnv, setupLine, setupOf, venvDir } from './setup.ts';

export interface Installed {
  name: string;
  source: PluginSource;
  enabled: boolean;
  installedAt: number;
  updatedAt?: number;
}

let roots = { builtin: path.join(APP_ROOT, 'plugins'), base: path.join(config.dataDir, 'plugins'), launcher: path.join(APP_ROOT, 'dist/server/pluginlaunch.js') };
export const pluginRoots = () => roots;
/** Other folders (the tests' own). */
export function setPluginRoots(r: Partial<typeof roots>) {
  roots = { ...roots, ...r };
  cache.clear();
  signature = '';
}
export const installedDir = () => path.join(roots.base, 'installed');
export const mineDir = () => path.join(roots.base, 'mine');
export const tmpDir = () => path.join(roots.base, 'tmp');
export const dataOf = (name: string) => path.join(roots.base, 'data', name);
export const viewOf = (name: string) => path.join(roots.base, 'view', name);

// ---- what is installed ------------------------------------------------------------------------------

const KEY = 'plugins.installed';

export function installedList(db: DB): Installed[] {
  try {
    const v = JSON.parse(kvGet(db, KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string' && x.source) : [];
  } catch {
    return [];
  }
}

export function saveInstalled(db: DB, list: Installed[]) {
  kvSet(db, KEY, JSON.stringify([...list].sort((a, b) => a.name.localeCompare(b.name))));
}

export const installedOne = (db: DB, name: string) => installedList(db).find((i) => i.name === name);

export function rootOf(i: Pick<Installed, 'name' | 'source'>): string {
  if (i.source.kind === 'builtin') return path.join(roots.builtin, i.name);
  if (i.source.kind === 'folder') return i.source.path;
  return path.join(installedDir(), i.name);
}

// ---- reading them -----------------------------------------------------------------------------------

const cache = new Map<string, { at: number; m: Manifest | { error: string } }>();

/** A plugin's folder read (kept for a few seconds: sessions start often, folders change rarely). */
export function load(root: string): Manifest | { error: string } {
  const c = cache.get(root);
  if (c && Date.now() - c.at < 3000) return c.m;
  let m: Manifest | { error: string };
  try {
    m = readPlugin(root);
  } catch (e) {
    m = { error: e instanceof ManifestError ? e.message : `It cannot be read: ${(e as Error).message}` };
  }
  cache.set(root, { at: Date.now(), m });
  return m;
}
export const forgetRead = () => cache.clear();

export const isManifest = (m: Manifest | { error: string }): m is Manifest => !('error' in m);

/** The plugins that come with the app. */
export function builtins(): Manifest[] {
  let names: string[];
  try {
    names = fs.readdirSync(roots.builtin);
  } catch {
    return [];
  }
  const out: Manifest[] = [];
  for (const n of names.sort()) {
    if (n.startsWith('.')) continue;
    const m = load(path.join(roots.builtin, n));
    if (isManifest(m) && m.name === n) out.push(m);
  }
  return out;
}

export interface Loaded {
  i: Installed;
  m: Manifest;
}

/** The installed plugins read, and the ones that cannot be. */
export function loadedPlugins(db: DB): { ok: Loaded[]; broken: { i: Installed; error: string }[] } {
  const ok: Loaded[] = [];
  const broken: { i: Installed; error: string }[] = [];
  for (const i of installedList(db)) {
    const m = load(rootOf(i));
    if (!isManifest(m)) broken.push({ i, error: m.error });
    else if (m.name !== i.name) broken.push({ i, error: `Its folder now holds a plugin named ${m.name}` });
    else ok.push({ i, m });
  }
  return { ok, broken };
}

/** Plugins being set up now (their servers wait until they are ready). */
export const busy = new Set<string>();

/**
 * The plugins agents get: enabled, set up (or with nothing to set up), and with every plugin they need
 * installed in a version they work with and active too.
 */
export function activePlugins(db: DB): Loaded[] {
  const { ok } = loadedPlugins(db);
  const byName = new Map(ok.map((l) => [l.i.name, l]));
  const memo = new Map<string, boolean>();
  const active = (name: string, stack: Set<string>): boolean => {
    if (memo.has(name)) return memo.get(name)!;
    if (stack.has(name)) return false;
    stack.add(name);
    const l = byName.get(name);
    const st = l ? setupOf(l.m.requires, dataOf(name), busy.has(name)).state : 'failed';
    const yes =
      !!l &&
      l.i.enabled &&
      (st === 'none' || st === 'ready') &&
      l.m.requires.plugins.every((r) => {
        const d = byName.get(r.name);
        return !!d && satisfies(d.m.version, r.range) && active(r.name, stack);
      });
    stack.delete(name);
    memo.set(name, yes);
    return yes;
  };
  return ok.filter((l) => active(l.i.name, new Set())).sort((a, b) => a.i.name.localeCompare(b.i.name));
}

// ---- their skills, for agents -----------------------------------------------------------------------

let synced: PluginSkill[] = [];
/** A plugin's skill another skill of its name hides: "<plugin>/<skill>" → what hides it. */
let shadowed = new Map<string, string>();
let signature = '';

setPluginSkills(() => synced);

const fill = (t: string, root: string, data: string) =>
  t.split('${PLUGIN_ROOT}').join(root).split('${CLAUDE_PLUGIN_ROOT}').join(root).split('${PLUGIN_DATA}').join(data).split('${CLAUDE_PLUGIN_DATA}').join(data);

/** A skill's folder as agents read it: its SKILL.md with the placeholders filled in, its other files linked. */
function writeSkill(src: string, dest: string, root: string, data: string) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src)) {
    const from = path.join(src, e);
    if (e === 'SKILL.md') fs.writeFileSync(path.join(dest, e), fill(fs.readFileSync(from, 'utf8'), root, data));
    else
      try {
        fs.symlinkSync(from, path.join(dest, e));
      } catch {}
  }
}

/**
 * Brings the skills of the active plugins up to date for agents: each written into view/<plugin>/skills,
 * and the skill library's view along (a name the library's own skills or an earlier plugin take is left
 * out). Cheap when nothing changed.
 */
export function syncPluginSkills(db: DB, o: { force?: boolean } = {}) {
  const active = activePlugins(db);
  const lib = libraryNames();
  const out: PluginSkill[] = [];
  const taken = new Map<string, string>();
  const sh = new Map<string, string>();
  const sig: string[] = [];
  for (const { i, m } of active) {
    for (const s of m.skills) {
      if (lib.has(s.name)) {
        sh.set(`${i.name}/${s.name}`, `the library’s own ${s.name}`);
        continue;
      }
      if (taken.has(s.name)) {
        sh.set(`${i.name}/${s.name}`, `${s.name} from the ${taken.get(s.name)} plugin`);
        continue;
      }
      taken.set(s.name, i.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(path.join(s.dir, 'SKILL.md')).mtimeMs;
      } catch {}
      sig.push(`${i.name}/${s.name}@${mtime}:${s.dir}`);
      const folder = path.join(viewOf(i.name), 'skills', s.name);
      out.push({ dir: s.name, name: s.name, description: s.description, triggers: s.triggers, category: s.category, folder, file: path.join(folder, 'SKILL.md'), plugin: i.name, pluginTitle: m.title, mtime });
    }
  }
  const now = sig.join('|');
  if (o.force || now !== signature) {
    const want = new Set(out.map((s) => `${s.plugin}/${s.dir}`));
    // Folders of skills no longer given: gone.
    try {
      for (const p of fs.readdirSync(path.join(roots.base, 'view'))) {
        const dir = path.join(roots.base, 'view', p, 'skills');
        let names: string[] = [];
        try {
          names = fs.readdirSync(dir);
        } catch {}
        for (const n of names) if (!want.has(`${p}/${n}`)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
      }
    } catch {}
    for (const s of out) {
      const l = active.find((a) => a.i.name === s.plugin)!;
      const src = l.m.skills.find((x) => x.name === s.dir)!.dir;
      try {
        writeSkill(src, s.folder, l.m.root, dataOf(s.plugin));
      } catch (e) {
        console.warn(`[plugins] could not write the skill ${s.plugin}/${s.dir}: ${(e as Error).message}`);
      }
    }
    signature = now;
    synced = out;
    shadowed = sh;
    try {
      syncView();
    } catch (e) {
      console.warn(`[plugins] the skill library's view: ${(e as Error).message}`);
    }
  } else {
    synced = out;
    shadowed = sh;
  }
}

// ---- their servers and instructions, for agents ------------------------------------------------------

/** Which kind of agent a session runs, as plugins name them. */
export function agentKind(s: { agent: string; acpAgent?: string }, consoleId: string): PluginAgent {
  return s.agent === 'claude' ? 'claude' : s.agent === 'codex' ? 'codex' : s.acpAgent === consoleId ? 'custom' : 'acp';
}

function writeIfChanged(file: string, text: string) {
  try {
    if (fs.readFileSync(file, 'utf8') === text) return;
  } catch {}
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

/**
 * What the active plugins give an agent of this kind: their MCP servers (stdio ones through the launcher,
 * which starts them in the plugin's folder with PLUGIN_ROOT, PLUGIN_DATA, its own packages and the keys it
 * names), and their instructions with a line on where each one's packages and files are.
 */
export function pluginAdditions(db: DB, kind: PluginAgent): { mcpServers: Record<string, McpServerSpec>; instructions: string[] } {
  const mcpServers: Record<string, McpServerSpec> = {};
  const lines: string[] = [];
  const used = new Set(['hydor', 'naget-agent']);
  for (const { i, m } of activePlugins(db)) {
    if (!m.agents.includes(kind)) continue;
    const data = dataOf(i.name);
    for (const s of m.servers) {
      let n = s.name;
      if (used.has(n)) n = `${i.name}-${s.name}`.replace(/[^\w.-]/g, '-').slice(0, 64);
      if (used.has(n)) continue;
      used.add(n);
      if (s.type === 'stdio') {
        const env: Record<string, string> = { ...setupEnv(m.requires, m.root, data) };
        for (const [k, v] of Object.entries(s.env)) env[k] = fill(v, m.root, data);
        for (const k of m.requires.keys) {
          try {
            const v = readSecret(db, k.name);
            if (v) env[k.name] = v.value;
          } catch {}
        }
        // Reserved, whatever the server's own env said (§9.1).
        env.PLUGIN_ROOT = m.root;
        env.PLUGIN_DATA = data;
        let command = s.command;
        if (command.startsWith('./')) command = path.resolve(m.root, command);
        else if (command === 'node') command = process.execPath;
        else if ((command === 'python' || command === 'python3') && m.requires.pip.length) command = path.join(venvDir(data), 'bin', 'python');
        const cwd = s.cwd ? path.resolve(m.root, fill(s.cwd, m.root, data)) : m.root;
        const file = path.join(viewOf(i.name), 'servers', `${s.name}.json`);
        try {
          writeIfChanged(file, JSON.stringify({ command, args: s.args.map((a) => fill(a, m.root, data)), cwd, env }));
        } catch (e) {
          console.warn(`[plugins] ${i.name}/${s.name}: ${(e as Error).message}`);
          continue;
        }
        mcpServers[n] = { type: 'stdio', command: process.execPath, args: [roots.launcher, file], env: {} };
      } else mcpServers[n] = { type: 'http', url: s.url, ...(Object.keys(s.headers).length ? { headers: s.headers } : {}) };
    }
    const parts: string[] = [];
    if (m.instructions) parts.push(fill(m.instructions, m.root, data));
    const setup = setupLine(m.title, m.requires, data);
    if (setup) parts.push(setup);
    if (ownFiles(m.root).length) parts.push(`Its own files are in ${path.join(m.root, 'files')}.`);
    if (parts.length) lines.push(`## ${m.title} (plugin ${i.name})\n${parts.join('\n')}`);
  }
  return {
    mcpServers,
    instructions: lines.length ? [`Plugins the user turned on, and what they say:\n\n${lines.join('\n\n')}`] : [],
  };
}

// ---- views for the pages -----------------------------------------------------------------------------

/** Whether the vault holds a key of this name. */
function hasKey(db: DB, name: string): boolean {
  try {
    return !!secretView(db, name);
  } catch {
    return false;
  }
}

/** A plugin's own files (its files/ folder), with their sizes; at most 500. */
export function ownFiles(root: string): { name: string; bytes: number }[] {
  const base = path.join(root, 'files');
  const out: { name: string; bytes: number }[] = [];
  const walk = (dir: string, rel: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= 500 || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, `${rel}${e.name}/`);
      else if (e.isFile())
        try {
          out.push({ name: `${rel}${e.name}`, bytes: fs.statSync(p).size });
        } catch {}
    }
  };
  walk(base, '');
  return out;
}

export function viewOfPlugin(db: DB, m: Manifest, i: Installed | undefined, all: Loaded[], o: { readme?: boolean } = {}): PluginView {
  const data = dataOf(m.name);
  const byName = new Map(all.map((l) => [l.i.name, l]));
  const setup = i ? setupOf(m.requires, data, busy.has(m.name)) : { state: needsSetup(m.requires) ? ('outdated' as const) : ('none' as const) };
  return {
    name: m.name,
    title: m.title,
    version: m.version,
    description: m.description,
    author: m.author,
    homepage: m.homepage,
    repository: m.repository,
    license: m.license,
    keywords: m.keywords,
    category: m.category,
    icon: m.icon,
    format: m.format,
    source: i?.source ?? { kind: 'builtin' },
    installed: !!i,
    enabled: !!i?.enabled,
    setup: { state: setup.state, error: setup.error, at: setup.at },
    skills: m.skills.map((s) => ({ name: s.name, description: s.description, category: s.category, shadowedBy: shadowed.get(`${m.name}/${s.name}`) })),
    servers: m.serverInfo,
    instructions: !!m.instructions,
    files: ownFiles(m.root),
    editable: i?.source.kind === 'folder',
    claudeOnly: m.claudeOnly,
    requires: m.requires,
    missing: {
      commands: m.requires.commands.filter((c) => !c.optional && !hasCommand(c.name)).map((c) => c.name),
      keys: m.requires.keys.filter((k) => !k.optional && !hasKey(db, k.name)).map((k) => k.name),
      plugins: m.requires.plugins.filter((r) => !byName.has(r.name) || !satisfies(byName.get(r.name)!.m.version, r.range)).map((r) => r.name),
    },
    dependents: all.filter((l) => l.m.requires.plugins.some((r) => r.name === m.name)).map((l) => l.i.name),
    agents: m.agents,
    problems: m.problems,
    root: m.root,
    data,
    installedAt: i?.installedAt,
    ...(o.readme ? { readme: readmeOf(m.root) } : {}),
  };
}

/** A plugin that is installed but cannot be read: enough to show what is wrong, and to remove it. */
export function brokenView(i: Installed, error: string): PluginView {
  return {
    name: i.name,
    title: i.name,
    keywords: [],
    format: 'agent-plugins',
    source: i.source,
    installed: true,
    enabled: i.enabled,
    setup: { state: 'none' },
    skills: [],
    servers: [],
    instructions: false,
    files: [],
    editable: false,
    claudeOnly: [],
    requires: { plugins: [], npm: {}, pip: [], commands: [], files: [], keys: [] },
    missing: { commands: [], keys: [], plugins: [] },
    dependents: [],
    agents: [],
    problems: [error],
    root: rootOf(i),
    data: dataOf(i.name),
    installedAt: i.installedAt,
  };
}
