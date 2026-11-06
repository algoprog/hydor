// Reading a plugin's folder: its manifest, skills and MCP servers, as the Agent Plugins 1.0 specification
// says (agent-plugins.org/specification), or in Claude Code's layout. Problems are reported at the
// narrowest boundary the specification sets: a bad manifest rejects the plugin, a bad mcp.json only its
// servers, a bad server or skill only itself. The app's own extension ("com.naget.agent") adds what a
// plugin needs (other plugins, packages, programs, files, keys) and instructions for every agent.
import fs from 'node:fs';
import path from 'node:path';
import { AGENT_PLUGINS_MCP_SCHEMA, AGENT_PLUGINS_SCHEMA, HYDOR_EXT, noRequires, PLUGIN_AGENTS, validPluginName, type PluginAgent, type PluginRequires, type PluginServerInfo } from '../../shared/plugins.ts';
import { parseSkill, SKILL_NAME } from '../../shared/skillpack.ts';

type Json = Record<string, unknown>;

/** A stdio or remote MCP server, checked and ready to hand to agents. */
export type ServerSpec =
  | { name: string; type: 'stdio'; command: string; args: string[]; env: Record<string, string>; cwd?: string }
  | { name: string; type: 'streamable-http' | 'sse'; url: string; headers: Record<string, string> };

export interface ManifestSkill {
  /** Its folder's name, which is its name. */
  name: string;
  description: string;
  category?: string;
  triggers: string[];
  /** Its folder, inside the plugin. */
  dir: string;
}

export interface Manifest {
  name: string;
  format: 'agent-plugins' | 'claude';
  /** The folder, resolved (PLUGIN_ROOT). */
  root: string;
  version?: string;
  description?: string;
  author?: string;
  homepage?: string;
  repository?: string;
  license?: string;
  keywords: string[];
  title: string;
  category?: string;
  icon?: string;
  agents: PluginAgent[];
  requires: PluginRequires;
  skills: ManifestSkill[];
  /** Valid servers, and every entry as the pages show it (with why one is left out). */
  servers: ServerSpec[];
  serverInfo: PluginServerInfo[];
  /** Its instructions file for every agent (com.naget.agent/instructions.md), if any. */
  instructions?: string;
  claudeOnly: string[];
  problems: string[];
}

export class ManifestError extends Error {}

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const stringMap = (v: unknown): v is Record<string, string> => isObj(v) && Object.values(v).every((x) => typeof x === 'string');

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** A path inside the plugin, resolved through links; null when it leads outside (Agent Plugins §4.1). */
export function inside(root: string, rel: string): string | null {
  const real = fs.realpathSync(root);
  let p: string;
  try {
    p = fs.realpathSync(path.resolve(real, rel));
  } catch {
    p = path.resolve(real, rel);
  }
  return p === real || p.startsWith(real + path.sep) ? p : null;
}

const exists = (p: string, kind: 'file' | 'dir') => {
  try {
    const st = fs.statSync(p);
    return kind === 'file' ? st.isFile() : st.isDirectory();
  } catch {
    return false;
  }
};

// ---- the manifest ----------------------------------------------------------------------------------

const ALLOWED = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);

function authorOf(v: unknown, claude: boolean, fail: (m: string) => never): string | undefined {
  if (v === undefined) return undefined;
  if (claude && typeof v === 'string') return v;
  if (!isObj(v)) return fail('author must be an object with name, email and url');
  for (const [k, x] of Object.entries(v)) {
    if (!['name', 'email', 'url'].includes(k)) {
      if (claude) continue;
      return fail(`author has a field the format does not allow: ${k}`);
    }
    if (typeof x !== 'string') return fail(`author.${k} must be text`);
  }
  return str(v.name) ?? str(v.email) ?? str(v.url);
}

/** What a plugin needs, from its extension's `requires` (anything unusable goes into `problems`). */
export function requiresOf(v: unknown, problems: string[]): PluginRequires {
  const r = noRequires();
  if (!isObj(v)) return r;
  const plugins = v.plugins;
  if (isObj(plugins)) for (const [n, range] of Object.entries(plugins)) validPluginName(n) ? r.plugins.push({ name: n, range: typeof range === 'string' ? range : '*' }) : problems.push(`requires.plugins: ${n} is not a plugin name`);
  else if (strings(plugins))
    for (const s of plugins) {
      const m = /^([a-z0-9][a-z0-9.-]*?)(?:@(.+))?$/.exec(s.trim());
      if (m && validPluginName(m[1])) r.plugins.push({ name: m[1], range: m[2] ?? '*' });
      else problems.push(`requires.plugins: ${s} is not a plugin name`);
    }
  if (stringMap(v.npm)) for (const [n, ver] of Object.entries(v.npm)) /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i.test(n) ? (r.npm[n] = ver || '*') : problems.push(`requires.npm: ${n} is not a package name`);
  const pkg = (p: string) => /^[A-Za-z0-9][\w.\-[\],]*\s*([<>=!~^].*)?$/.test(p.trim()) && !/\s-|^-/.test(p);
  if (strings(v.pip)) for (const p of v.pip) pkg(p) ? r.pip.push(p.trim()) : problems.push(`requires.pip: ${p} is not a package`);
  if (strings(v.pipNvidia)) for (const p of v.pipNvidia) pkg(p) ? (r.pipNvidia ??= []).push(p.trim()) : problems.push(`requires.pipNvidia: ${p} is not a package`);
  if (str(v.python)) r.python = str(v.python);
  if (Array.isArray(v.commands))
    for (const c of v.commands) {
      const o = typeof c === 'string' ? { name: c } : isObj(c) ? { name: String(c.name ?? ''), hint: str(c.hint), optional: c.optional === true || undefined } : null;
      if (o && /^[\w.+-]{1,64}$/.test(o.name)) r.commands.push(o);
      else problems.push('requires.commands: an entry is not a program name');
    }
  if (Array.isArray(v.files))
    for (const f of v.files) {
      if (!isObj(f) || !str(f.url) || !str(f.path)) {
        problems.push('requires.files: each needs a url and a path');
        continue;
      }
      const url = str(f.url)!;
      const rel = str(f.path)!.replace(/^\.\//, '');
      if (!/^https:\/\//.test(url)) problems.push(`requires.files: ${url} must be https`);
      else if (path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) problems.push(`requires.files: ${rel} must stay in the data folder`);
      else r.files.push({ url, path: rel, sha256: str(f.sha256)?.toLowerCase(), size: typeof f.size === 'number' ? f.size : undefined });
    }
  if (Array.isArray(v.keys))
    for (const k of v.keys) {
      const o = typeof k === 'string' ? { name: k } : isObj(k) ? { name: String(k.name ?? ''), description: str(k.description), optional: k.optional === true || undefined, url: str(k.url) } : null;
      if (o && /^[A-Z][A-Z0-9_]{1,63}$/.test(o.name)) r.keys.push(o);
      else problems.push('requires.keys: a key is named with capitals, digits and underscores');
    }
  return r;
}

// ---- MCP servers -----------------------------------------------------------------------------------

const RESERVED_ENV = /^(PLUGIN_ROOT|PLUGIN_DATA)$/i;

/** One server entry of mcp.json (§7.2.1): valid, or why not. */
export function serverOf(name: string, v: unknown, root: string, claude: boolean): { spec?: ServerSpec; info: PluginServerInfo } {
  const bad = (problem: string, type: PluginServerInfo['type'] = 'stdio') => ({ info: { name, type, problem } });
  if (!isObj(v)) return bad('not an object');
  const type = claude ? (v.type === 'http' ? 'streamable-http' : v.type === 'sse' ? 'sse' : v.url ? 'streamable-http' : 'stdio') : v.type;
  if (type === 'stdio') {
    const allowed = new Set(['type', 'command', 'args', 'env', 'cwd']);
    const extra = Object.keys(v).filter((k) => !allowed.has(k));
    if (extra.length && !claude) return bad(`fields the format does not allow: ${extra.join(', ')}`);
    let command = typeof v.command === 'string' ? v.command.trim() : '';
    if (!command) return bad('no command');
    if (claude) command = command.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '.').replace(/^\.\/\.\//, './');
    if (command.includes('${')) return bad('the command cannot hold placeholders');
    if (command.includes('/') || command.includes('\\')) {
      if (!command.startsWith('./')) return bad('a command with a path must start with ./ (inside the plugin)');
      if (!inside(root, command)) return bad('its command is outside the plugin');
    }
    if (v.args !== undefined && !strings(v.args)) return bad('args must be a list of text');
    if (v.env !== undefined && !stringMap(v.env)) return bad('env must map names to text');
    const env = { ...((v.env as Record<string, string>) ?? {}) };
    if (Object.keys(env).some((k) => RESERVED_ENV.test(k))) return bad('env cannot set PLUGIN_ROOT or PLUGIN_DATA');
    let cwd: string | undefined;
    if (v.cwd !== undefined) {
      if (typeof v.cwd !== 'string') return bad('cwd must be text');
      const c = claude ? v.cwd.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '${PLUGIN_ROOT}') : v.cwd;
      if (!(c.startsWith('./') || c === '${PLUGIN_ROOT}' || c.startsWith('${PLUGIN_ROOT}/') || c === '${PLUGIN_DATA}' || c.startsWith('${PLUGIN_DATA}/'))) return bad('cwd must start with ./, ${PLUGIN_ROOT} or ${PLUGIN_DATA}');
      if (c.startsWith('./') && !inside(root, c)) return bad('its cwd is outside the plugin');
      cwd = c;
    }
    const args = ((v.args as string[]) ?? []).map((a) => (claude ? a.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '${PLUGIN_ROOT}') : a));
    for (const k of Object.keys(env)) if (claude) env[k] = env[k].replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, '${PLUGIN_ROOT}');
    return { spec: { name, type: 'stdio', command, args, env, cwd }, info: { name, type: 'stdio', command, args } };
  }
  if (type === 'streamable-http' || type === 'sse') {
    const allowed = new Set(['type', 'url', 'headers']);
    const extra = Object.keys(v).filter((k) => !allowed.has(k));
    if (extra.length && !claude) return bad(`fields the format does not allow: ${extra.join(', ')}`, type);
    let u: URL;
    try {
      u = new URL(String(v.url ?? ''));
    } catch {
      return bad('no valid url', type);
    }
    const loopback = u.hostname === 'localhost' || /^127\./.test(u.hostname) || u.hostname === '[::1]';
    if (u.username || u.password || u.hash) return bad('the url cannot hold a user name, password or fragment', type);
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return bad('the url must be https (http only on this computer)', type);
    if (v.headers !== undefined && !stringMap(v.headers)) return bad('headers must map names to text', type);
    const headers = (v.headers as Record<string, string>) ?? {};
    const lower = Object.keys(headers).map((h) => h.toLowerCase());
    if (new Set(lower).size !== lower.length) return bad('a header is given twice', type);
    if (type === 'sse') return { info: { name, type, url: u.href, problem: 'uses the old HTTP+SSE transport, which agents here do not take' } };
    return { spec: { name, type, url: u.href, headers }, info: { name, type, url: u.href } };
  }
  return bad(`an unknown transport: ${String(type)}`);
}

function serversOf(file: string, root: string, claude: boolean, version: string, problems: string[]): { specs: ServerSpec[]; info: PluginServerInfo[] } {
  const specs: ServerSpec[] = [];
  const info: PluginServerInfo[] = [];
  if (!fs.existsSync(file)) return { specs, info };
  if (!exists(file, 'file') || !inside(root, path.relative(root, file))) {
    problems.push(`${path.basename(file)} is not a file in the plugin: its servers are left out`);
    return { specs, info };
  }
  let j: unknown;
  try {
    j = readJson(file);
  } catch (e) {
    problems.push(`${path.basename(file)} is not valid JSON (${(e as Error).message}): its servers are left out`);
    return { specs, info };
  }
  if (!isObj(j)) {
    problems.push(`${path.basename(file)} is not an object: its servers are left out`);
    return { specs, info };
  }
  if (!claude) {
    if (j.$schema !== AGENT_PLUGINS_MCP_SCHEMA) {
      problems.push(`mcp.json targets ${String(j.$schema ?? 'no version')}, not Agent Plugins ${version}: its servers are left out`);
      return { specs, info };
    }
    const extra = Object.keys(j).filter((k) => k !== '$schema' && k !== 'mcpServers');
    if (extra.length || !isObj(j.mcpServers)) {
      problems.push('mcp.json must hold only $schema and mcpServers: its servers are left out');
      return { specs, info };
    }
  }
  const map = isObj(j.mcpServers) ? j.mcpServers : claude ? j : {};
  for (const [name, v] of Object.entries(map)) {
    if (!/^[A-Za-z0-9][\w.-]{0,63}$/.test(name)) {
      info.push({ name, type: 'stdio', problem: 'its name has characters agents do not take' });
      continue;
    }
    const s = serverOf(name, v, root, claude);
    info.push(s.info);
    if (s.spec) specs.push(s.spec);
    else if (s.info.problem) problems.push(`Server ${name}: ${s.info.problem}`);
  }
  return { specs, info };
}

// ---- skills ----------------------------------------------------------------------------------------

/** The skills in a plugin's skills/ (§7.1): each folder right under it with a SKILL.md; bad ones are skipped and reported. */
function skillsOf(root: string, dirs: string[], problems: string[]): ManifestSkill[] {
  const out: ManifestSkill[] = [];
  const seen = new Set<string>();
  for (const rel of dirs) {
    const dir = path.join(root, rel);
    if (!fs.existsSync(dir)) continue;
    if (!exists(dir, 'dir') || !inside(root, rel)) {
      problems.push(`${rel} is not a folder in the plugin: its skills are left out`);
      continue;
    }
    for (const n of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, n, 'SKILL.md');
      if (n.startsWith('.') || !exists(file, 'file')) continue;
      if (!inside(root, path.relative(root, file))) {
        problems.push(`Skill ${n}: its SKILL.md is outside the plugin`);
        continue;
      }
      if (!SKILL_NAME.test(n)) {
        problems.push(`Skill ${n}: a skill's folder is named with lowercase letters, digits and dashes`);
        continue;
      }
      let fm;
      try {
        fm = parseSkill(fs.readFileSync(file, 'utf8').slice(0, 256 * 1024));
      } catch {
        problems.push(`Skill ${n}: its SKILL.md cannot be read`);
        continue;
      }
      if (fm.name && fm.name !== n) {
        problems.push(`Skill ${n}: its name in SKILL.md (${fm.name}) is not its folder's`);
        continue;
      }
      if (!fm.description) {
        problems.push(`Skill ${n}: it has no description`);
        continue;
      }
      if (seen.has(n)) continue;
      seen.add(n);
      out.push({ name: n, description: fm.description, category: fm.category, triggers: fm.triggers, dir: path.join(dir, n) });
    }
  }
  return out;
}

// ---- the folder ------------------------------------------------------------------------------------

/** Whether a folder holds a plugin this app can read. */
export function isPluginFolder(dir: string): boolean {
  return exists(path.join(dir, 'plugin.json'), 'file') || exists(path.join(dir, '.claude-plugin', 'plugin.json'), 'file');
}

/**
 * Reads a plugin folder. Throws ManifestError when the plugin must be rejected (§5.2: no manifest, a bad
 * required field, a field of the wrong type); anything less goes into `problems`.
 */
export function readPlugin(dirArg: string): Manifest {
  let root: string;
  try {
    root = fs.realpathSync(dirArg);
  } catch {
    throw new ManifestError(`No folder at ${dirArg}`);
  }
  const problems: string[] = [];
  const agentPlugins = path.join(root, 'plugin.json');
  const claudeManifest = path.join(root, '.claude-plugin', 'plugin.json');
  const claude = !exists(agentPlugins, 'file') && exists(claudeManifest, 'file');
  const file = claude ? claudeManifest : agentPlugins;
  if (!exists(file, 'file')) throw new ManifestError('No plugin.json in the folder');
  if (!inside(root, path.relative(root, file))) throw new ManifestError('Its plugin.json is outside the folder');
  let j: unknown;
  try {
    j = readJson(file);
  } catch (e) {
    throw new ManifestError(`Its plugin.json is not valid JSON: ${(e as Error).message}`);
  }
  if (!isObj(j)) throw new ManifestError('Its plugin.json is not an object');
  const fail = (m: string): never => {
    throw new ManifestError(`Its plugin.json: ${m}`);
  };
  if (!claude) {
    if (j.$schema !== AGENT_PLUGINS_SCHEMA) fail(`$schema must be ${AGENT_PLUGINS_SCHEMA} (Agent Plugins 1.0)`);
    for (const k of Object.keys(j)) if (!ALLOWED.has(k)) problems.push(`plugin.json has a field the format does not allow, ignored: ${k}`);
  }
  if (!validPluginName(j.name)) fail('name must be 1 to 64 lowercase letters, digits, dashes and dots, starting and ending with a letter or digit');
  const name = j.name as string;
  for (const k of ['version', 'description', 'homepage', 'repository', 'license'] as const) {
    if (j[k] === undefined) continue;
    // Claude Code lets repository be an object ({ type, url }).
    if (claude && k === 'repository' && isObj(j[k])) continue;
    if (typeof j[k] !== 'string') fail(`${k} must be text`);
  }
  if (j.keywords !== undefined && !strings(j.keywords)) fail('keywords must be a list of text');
  const author = authorOf(j.author, claude, fail);
  let ext: Json = {};
  if (j.extensions !== undefined) {
    if (!isObj(j.extensions)) problems.push('extensions is not an object: ignored');
    else if (j.extensions[HYDOR_EXT] !== undefined) {
      if (isObj(j.extensions[HYDOR_EXT])) ext = j.extensions[HYDOR_EXT] as Json;
      else problems.push(`extensions.${HYDOR_EXT} is not an object: ignored`);
    }
  }
  const version = str(j.version);
  const requires = requiresOf(ext.requires, problems);
  const agents = strings(ext.agents) ? (ext.agents.filter((a) => (PLUGIN_AGENTS as string[]).includes(a)) as PluginAgent[]) : PLUGIN_AGENTS;
  // Skills: at skills/; Claude Code's manifest may name more folders.
  const skillDirs = ['skills'];
  if (claude) {
    const extra = typeof j.skills === 'string' ? [j.skills] : strings(j.skills) ? j.skills : [];
    for (const s of extra) if (s.startsWith('./')) skillDirs.push(s);
  }
  const skills = skillsOf(root, [...new Set(skillDirs.map((d) => d.replace(/^\.\//, '').replace(/\/$/, '')))], problems);
  // Servers: mcp.json; Claude Code's are in .mcp.json, or in its manifest (inline, or a file it names).
  let servers: { specs: ServerSpec[]; info: PluginServerInfo[] } = { specs: [], info: [] };
  if (!claude) servers = serversOf(path.join(root, 'mcp.json'), root, false, '1.0.0', problems);
  else if (isObj(j.mcpServers)) {
    const tmp = { specs: [] as ServerSpec[], info: [] as PluginServerInfo[] };
    for (const [n, v] of Object.entries(j.mcpServers)) {
      const s = serverOf(n, v, root, true);
      tmp.info.push(s.info);
      if (s.spec) tmp.specs.push(s.spec);
    }
    servers = tmp;
  } else servers = serversOf(path.join(root, typeof j.mcpServers === 'string' && j.mcpServers.startsWith('./') ? j.mcpServers : '.mcp.json'), root, true, '1.0.0', problems);
  // Instructions for every agent, in the extension's folder.
  const instr = path.join(root, HYDOR_EXT, 'instructions.md');
  let instructions: string | undefined;
  if (exists(instr, 'file') && inside(root, path.relative(root, instr))) {
    instructions = fs.readFileSync(instr, 'utf8').slice(0, 8000).trim() || undefined;
  }
  const claudeOnly = claude ? ['commands', 'agents', 'hooks'].filter((d) => fs.existsSync(path.join(root, d)) || (d === 'hooks' && fs.existsSync(path.join(root, 'hooks', 'hooks.json')))) : [];
  return {
    name,
    format: claude ? 'claude' : 'agent-plugins',
    root,
    version,
    description: str(j.description),
    author,
    homepage: str(j.homepage),
    repository: typeof j.repository === 'string' ? j.repository : isObj(j.repository) ? str(j.repository.url) : undefined,
    license: str(j.license),
    keywords: strings(j.keywords) ? j.keywords : [],
    title: str(ext.title)?.slice(0, 60) ?? name,
    category: str(ext.category),
    icon: str(ext.icon),
    agents,
    requires,
    skills,
    servers: servers.specs,
    serverInfo: servers.info,
    instructions,
    claudeOnly,
    problems,
  };
}

/** The README beside the manifest, for the details (at most 40,000 characters). */
export function readmeOf(root: string): string | undefined {
  for (const n of ['README.md', 'readme.md', 'README']) {
    try {
      return fs.readFileSync(path.join(root, n), 'utf8').slice(0, 40_000);
    } catch {}
  }
  return undefined;
}
