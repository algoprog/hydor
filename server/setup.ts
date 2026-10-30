// Agent setup: MCP servers, skills, plugins and the instruction files (CLAUDE.md / AGENTS.md)
// that Claude Code and Codex read. Changes go through each agent's own CLI where it has one,
// so the config files stay in the shape the agents expect. Env and header values are never
// sent to the browser: listings carry only their names.
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Agent, InstructionFile, MarketplaceEntry, McpEntry, McpScope, McpSpec, McpStatus, PluginEntry, SetupResult, SkillEntry } from '../shared/types.ts';
import { codexEnv } from './agents/codex.ts';
import type { CodexControl } from './agents/control.ts';
import { HttpError } from './auth.ts';
import { config } from './config.ts';
import { agentBaseEnv } from './env.ts';
import { LineSplitter } from './runner/frames.ts';

type Json = Record<string, any>;

const HOME = os.homedir();
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR ?? path.join(HOME, '.claude');
const claudeJson = () => (process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(HOME, '.claude.json'));
const codexDir = () => config.codexHome;
/** Codex reads user skills from ~/.agents/skills (the shared agents folder); ~/.codex/skills holds its built-in ones. */
const codexUserSkills = () => path.join(HOME, '.agents', 'skills');

const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const PLUGIN_ID = /^[A-Za-z0-9][\w.@/+-]{0,199}$/;

function readJson(file: string): Json | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Runs an agent CLI without a shell; stdin is closed, so anything that would prompt fails fast. */
function run(agent: Agent, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}): Promise<{ code: number; out: string; err: string }> {
  const bin = agent === 'claude' ? config.claudeBin : config.codexBin;
  const env = agent === 'claude' ? agentBaseEnv() : codexEnv(agentBaseEnv());
  return new Promise((resolve) => {
    const p = execFile(bin, args, { cwd: opts.cwd ?? HOME, env, timeout: opts.timeoutMs ?? 60_000, maxBuffer: 64 << 20 }, (e, stdout, stderr) => {
      const code = e ? (typeof (e as any).code === 'number' ? (e as any).code : 1) : 0;
      resolve({ code, out: String(stdout ?? ''), err: String(stderr ?? '') });
    });
    p.stdin?.end();
  });
}

const result = (r: { code: number; out: string; err: string }): SetupResult => ({ ok: r.code === 0, output: (r.out + (r.err ? (r.out ? '\n' : '') + r.err : '')).trim() });

function folder(cwd: unknown): string {
  const d = typeof cwd === 'string' && cwd ? path.resolve(cwd) : HOME;
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new HttpError(400, 'Not a folder');
  return d;
}

// ---- MCP servers -----------------------------------------------------------------------

function claudeServer(name: string, v: Json, scope: McpScope): McpEntry {
  const type = String(v.type ?? (v.url ? 'http' : 'stdio'));
  return {
    agent: 'claude',
    name,
    scope,
    transport: type === 'sse' ? 'sse' : type === 'stdio' ? 'stdio' : 'http',
    command: v.command,
    args: Array.isArray(v.args) ? v.args.map(String) : undefined,
    url: v.url,
    envKeys: v.env && typeof v.env === 'object' ? Object.keys(v.env) : undefined,
    headerKeys: v.headers && typeof v.headers === 'object' ? Object.keys(v.headers) : undefined,
  };
}

export async function listMcp(cwdArg?: string): Promise<McpEntry[]> {
  const cwd = folder(cwdArg);
  const j = readJson(claudeJson()) ?? {};
  const out: McpEntry[] = Object.entries((j.mcpServers ?? {}) as Json).map(([n, v]) => claudeServer(n, v, 'user'));
  out.push(...Object.entries((j.projects?.[cwd]?.mcpServers ?? {}) as Json).map(([n, v]) => claudeServer(n, v, 'local')));
  out.push(...Object.entries((readJson(path.join(cwd, '.mcp.json'))?.mcpServers ?? {}) as Json).map(([n, v]) => claudeServer(n, v, 'project')));

  const r = await run('codex', ['mcp', 'list', '--json'], { timeoutMs: 30_000 });
  let list: Json[] = [];
  try {
    list = JSON.parse(r.out);
  } catch {}
  for (const s of list) {
    const t: Json = s.transport ?? {};
    const http = t.type === 'streamable_http' || t.type === 'http' || !!t.url;
    out.push({
      agent: 'codex',
      name: String(s.name),
      scope: 'user',
      transport: http ? 'http' : 'stdio',
      command: t.command ?? undefined,
      args: Array.isArray(t.args) ? t.args.map(String) : undefined,
      url: t.url ?? undefined,
      envKeys: t.env && typeof t.env === 'object' ? Object.keys(t.env) : Array.isArray(t.env_vars) && t.env_vars.length ? t.env_vars.map(String) : undefined,
      headerKeys: t.http_headers && typeof t.http_headers === 'object' ? Object.keys(t.http_headers) : undefined,
      bearerEnv: t.bearer_token_env_var ?? undefined,
      enabled: s.enabled !== false,
    });
  }
  return out;
}

function checkSpec(s: McpSpec) {
  if (!NAME.test(s.name ?? '')) throw new HttpError(400, 'Use letters, digits, dots, dashes or underscores for the name');
  if (s.transport === 'stdio' ? !s.command?.trim() : !/^https?:\/\//.test(s.url ?? '')) throw new HttpError(400, s.transport === 'stdio' ? 'Enter the command to run' : 'Enter an http(s) URL');
  for (const k of [...Object.keys(s.env ?? {}), ...(s.bearerEnv ? [s.bearerEnv] : [])]) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) throw new HttpError(400, `Bad variable name: ${k}`);
  for (const k of Object.keys(s.headers ?? {})) if (!/^[A-Za-z0-9-]+$/.test(k)) throw new HttpError(400, `Bad header name: ${k}`);
}

/** Adds the server to each chosen agent. */
export async function addMcp(s: McpSpec): Promise<(SetupResult & { agent: Agent })[]> {
  checkSpec(s);
  const cwd = folder(s.cwd);
  const out: (SetupResult & { agent: Agent })[] = [];
  for (const agent of new Set(s.agents)) {
    if (agent === 'claude') {
      const cfg =
        s.transport === 'stdio'
          ? { type: 'stdio', command: s.command!.trim(), args: s.args ?? [], ...(s.env && Object.keys(s.env).length ? { env: s.env } : {}) }
          : { type: s.transport, url: s.url, ...(s.headers && Object.keys(s.headers).length ? { headers: s.headers } : {}) };
      out.push({ agent, ...result(await run('claude', ['mcp', 'add-json', '-s', s.scope ?? 'user', s.name, JSON.stringify(cfg)], { cwd })) });
    } else if (agent === 'codex') {
      const args = ['mcp', 'add', s.name];
      if (s.transport === 'stdio') {
        for (const [k, v] of Object.entries(s.env ?? {})) args.push('--env', `${k}=${v}`);
        args.push('--', s.command!.trim(), ...(s.args ?? []));
      } else {
        args.push('--url', s.url!);
        if (s.bearerEnv) args.push('--bearer-token-env-var', s.bearerEnv);
      }
      out.push({ agent, ...result(await run('codex', args)) });
    }
  }
  return out;
}

export async function removeMcp(agent: Agent, name: string, scope?: McpScope, cwdArg?: string): Promise<SetupResult> {
  if (!NAME.test(name)) throw new HttpError(400, 'Bad server name');
  if (agent === 'codex') return result(await run('codex', ['mcp', 'remove', name]));
  return result(await run('claude', ['mcp', 'remove', '-s', scope ?? 'user', name], { cwd: folder(cwdArg) }));
}

/** The shell command for a terminal that runs an agent's OAuth login for one server, then stays open. */
export function loginCommand(agent: Agent, name: string): string {
  if (!NAME.test(name)) throw new HttpError(400, 'Bad server name');
  const bin = (agent === 'claude' ? config.claudeBin : config.codexBin).replace(/'/g, `'\\''`);
  return `'${bin}' mcp login ${name}; exec "\${SHELL:-bash}"`;
}

/**
 * Every server's state as a new session in `cwd` sees it. Claude: a throwaway headless CLI (the way
 * sessions run, so a shared .mcp.json counts without the interactive approval), polled until no server
 * is still connecting; no model turn. Codex: its app-server, after reloading the config.
 */
export async function mcpStatus(agent: Agent, control: CodexControl, cwdArg?: string): Promise<McpStatus[]> {
  if (agent === 'codex') {
    await control.call('config/mcpServer/reload', {}, 30_000).catch(() => {});
    const r = await control.call<{ data: Json[] }>('mcpServerStatus/list', {}, 90_000);
    return (r.data ?? []).map((s) => {
      const tools = Object.keys(s.tools ?? {}).length;
      return { name: String(s.name), state: s.authStatus === 'notLoggedIn' ? 'auth' : s.serverInfo || tools ? 'connected' : 'failed', tools };
    });
  }
  const cwd = folder(cwdArg);
  return new Promise((resolve) => {
    const proc = spawn(config.claudeBin, ['--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--permission-prompt-tool', 'stdio'], {
      cwd,
      env: agentBaseEnv(),
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let last: McpStatus[] = [];
    let polls = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        proc.stdin.end();
      } catch {}
      setTimeout(() => proc.kill('SIGTERM'), 1500);
      resolve(last);
    };
    const timer = setTimeout(finish, 45_000);
    const ask = () => proc.stdin.write(JSON.stringify({ type: 'control_request', request_id: `mcp${++polls}`, request: { subtype: 'mcp_status' } }) + '\n');
    const STATE: Record<string, McpStatus['state']> = { connected: 'connected', failed: 'failed', 'needs-auth': 'auth', pending: 'pending', disabled: 'off' };
    const lines = new LineSplitter();
    proc.stdout.on('data', (buf: Buffer) =>
      lines.push(buf, (line) => {
        let m: Json;
        try {
          m = JSON.parse(line);
        } catch {
          return;
        }
        const r = m.type === 'control_response' ? (m.response ?? {}) : null;
        if (!r) return;
        if (r.request_id === 'init') return ask();
        if (!String(r.request_id).startsWith('mcp')) return;
        last = ((r.response?.mcpServers ?? []) as Json[]).map((s) => ({
          name: String(s.name),
          state: STATE[s.status] ?? 'failed',
          error: s.error ? String(s.error) : undefined,
          tools: Array.isArray(s.tools) ? s.tools.length : undefined,
        }));
        if (last.some((s) => s.state === 'pending') && polls < 30) setTimeout(ask, 1000);
        else finish();
      }),
    );
    proc.stdin.on('error', () => {});
    proc.on('error', finish);
    proc.on('exit', finish);
    proc.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'init', request: { subtype: 'initialize' } }) + '\n');
  });
}

// ---- skills ------------------------------------------------------------------------------

/** name/description from a SKILL.md's front matter (plain, quoted or block values). */
function frontMatter(text: string): Record<string, string> {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^[|>][-+]?$/.test(v)) {
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i].trim());
      v = block.join(' ');
    }
    out[kv[1]] = v.replace(/^(["'])([\s\S]*)\1$/, '$2');
  }
  return out;
}

function scanSkills(root: string, scope: SkillEntry['scope'], overrides: Json): SkillEntry[] {
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out: SkillEntry[] = [];
  for (const n of names) {
    if (n.startsWith('.')) continue;
    const file = path.join(root, n, 'SKILL.md');
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const fm = frontMatter(text);
    const name = fm.name || n;
    out.push({ agent: 'claude', name, description: fm.description ?? '', path: file, scope, enabled: overrides[name] !== 'off', deletable: true });
  }
  return out;
}

export async function listSkills(control: CodexControl, cwdArg?: string): Promise<{ skills: SkillEntry[]; errors: string[] }> {
  const cwd = folder(cwdArg);
  const errors: string[] = [];
  const overrides = (readJson(path.join(claudeDir(), 'settings.json'))?.skillOverrides ?? {}) as Json;
  const skills = [...scanSkills(path.join(claudeDir(), 'skills'), 'user', overrides)];
  if (cwd !== HOME) skills.push(...scanSkills(path.join(cwd, '.claude', 'skills'), 'project', overrides));
  try {
    const r = await control.call<{ data: { skills: Json[]; errors: Json[] }[] }>('skills/list', { cwds: [cwd], forceReload: true }, 30_000);
    for (const e of r.data ?? []) {
      for (const s of e.skills ?? []) {
        const p = String(s.path ?? '');
        const file = p.endsWith('SKILL.md') ? p : path.join(p, 'SKILL.md');
        const scope = (s.scope as SkillEntry['scope']) ?? 'user';
        skills.push({
          agent: 'codex',
          name: String(s.name),
          description: String(s.interface?.shortDescription ?? s.shortDescription ?? s.description ?? ''),
          path: file,
          scope: s.pluginId ? 'plugin' : scope,
          enabled: s.enabled !== false,
          plugin: s.pluginId ?? undefined,
          deletable: !s.pluginId && (scope === 'user' || scope === 'repo'),
        });
      }
      for (const err of e.errors ?? []) errors.push(String(err.message ?? err.path ?? JSON.stringify(err)));
    }
  } catch (e) {
    errors.push(`Codex skills: ${(e as Error).message}`);
  }
  return { skills, errors };
}

/** Writes a JSON file through a temp file, so a crash never leaves it half written. */
function writeJsonAtomic(file: string, data: Json) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

export async function setSkillEnabled(control: CodexControl, agent: Agent, name: string, file: string, enabled: boolean): Promise<void> {
  // Both agents record a toggle for any name or path they are given, so only accept real skills.
  if (agent === 'codex' ? path.basename(file) !== 'SKILL.md' || !fs.existsSync(file) : !NAME.test(name)) throw new HttpError(400, 'No such skill');
  if (agent === 'codex') {
    await control.call('skills/config/write', { path: file, enabled }, 30_000);
    return;
  }
  // Claude: skillOverrides in the user settings; "off" hides a skill, no entry means on.
  const settings = path.join(claudeDir(), 'settings.json');
  const j = readJson(settings) ?? {};
  const o: Json = { ...(j.skillOverrides ?? {}) };
  if (enabled) delete o[name];
  else o[name] = 'off';
  if (Object.keys(o).length) j.skillOverrides = o;
  else delete j.skillOverrides;
  writeJsonAtomic(settings, j);
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

export function createSkill(agent: Agent, name: string, description: string, scope: 'user' | 'project', cwdArg?: string): string {
  const s = slug(name);
  if (!s) throw new HttpError(400, 'Give the skill a name');
  const root = agent === 'codex' ? codexUserSkills() : scope === 'project' ? path.join(folder(cwdArg), '.claude', 'skills') : path.join(claudeDir(), 'skills');
  const dir = path.join(root, s);
  if (fs.existsSync(dir)) throw new HttpError(409, `A skill named ${s} already exists`);
  fs.mkdirSync(dir, { recursive: true });
  const desc = description.replace(/\s+/g, ' ').trim() || `Use when …`;
  const file = path.join(dir, 'SKILL.md');
  fs.writeFileSync(file, `---\nname: ${s}\ndescription: ${JSON.stringify(desc)}\n---\n\n# ${name.trim()}\n\nWhen to use this skill, then the steps to follow.\n`);
  return file;
}

/** Deletes a user or project skill folder; never a system or plugin one. */
export function deleteSkill(agent: Agent, file: string, cwdArg?: string) {
  const dir = path.dirname(path.resolve(file));
  const roots = agent === 'codex' ? [codexUserSkills(), path.join(codexDir(), 'skills')] : [path.join(claudeDir(), 'skills'), path.join(folder(cwdArg), '.claude', 'skills')];
  if (path.basename(file) !== 'SKILL.md' || !roots.some((r) => path.dirname(dir) === r) || path.basename(dir).startsWith('.')) {
    throw new HttpError(400, 'Only user and project skills can be deleted here');
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- plugins (Claude Code marketplaces) ------------------------------------------------------

let catalog: { at: number; list: PluginEntry[] } | null = null;

function pluginOf(p: Json, installed: boolean): PluginEntry {
  const id = String(p.pluginId ?? p.id ?? p.name);
  return {
    id,
    name: String(p.name ?? id.split('@')[0]),
    description: p.description ?? undefined,
    marketplace: p.marketplaceName ?? p.marketplace ?? (id.includes('@') ? id.split('@')[1] : undefined),
    installCount: typeof p.installCount === 'number' ? p.installCount : undefined,
    version: p.version ?? undefined,
    scope: p.scope ?? undefined,
    enabled: p.enabled ?? (installed ? true : undefined),
    installed,
  };
}

export async function listPlugins(q = '', limit = 60): Promise<{ installed: PluginEntry[]; available: PluginEntry[]; marketplaces: MarketplaceEntry[]; total: number }> {
  if (!catalog || Date.now() - catalog.at > 10 * 60_000) {
    const r = await run('claude', ['plugin', 'list', '--json', '--available'], { timeoutMs: 180_000 });
    let d: Json = {};
    try {
      d = JSON.parse(r.out);
    } catch {}
    const installed = ((d.installed ?? []) as Json[]).map((p) => pluginOf(p, true));
    const have = new Set(installed.map((p) => p.id));
    catalog = { at: Date.now(), list: [...installed, ...((d.available ?? []) as Json[]).map((p) => pluginOf(p, false)).filter((p) => !have.has(p.id))] };
  }
  const m = await run('claude', ['plugin', 'marketplace', 'list', '--json'], { timeoutMs: 30_000 });
  let marketplaces: MarketplaceEntry[] = [];
  try {
    marketplaces = (JSON.parse(m.out) as Json[]).map((x) => ({ name: String(x.name), source: x.source ?? undefined, repo: x.repo ?? undefined, url: x.url ?? undefined }));
  } catch {}
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const avail = catalog.list
    .filter((p) => !p.installed)
    .filter((p) => !words.length || words.every((w) => `${p.name} ${p.description ?? ''} ${p.marketplace ?? ''}`.toLowerCase().includes(w)))
    .sort((a, b) => (b.installCount ?? 0) - (a.installCount ?? 0));
  return { installed: catalog.list.filter((p) => p.installed), available: avail.slice(0, Math.max(1, Math.min(limit, 200))), marketplaces, total: avail.length };
}

export async function pluginAction(action: 'install' | 'uninstall' | 'enable' | 'disable', id: string, scope?: string): Promise<SetupResult> {
  if (!PLUGIN_ID.test(id)) throw new HttpError(400, 'Bad plugin id');
  if (action !== 'install') {
    // `claude plugin enable|disable` accept any id and write it into settings.json, so check first.
    let installed: Json[] = [];
    try {
      installed = JSON.parse((await run('claude', ['plugin', 'list', '--json'], { timeoutMs: 30_000 })).out);
    } catch {}
    if (!installed.some((p) => String(p.pluginId ?? p.id ?? p.name) === id)) throw new HttpError(400, `${id} is not installed`);
  }
  const args = ['plugin', action, id, '--json'];
  if (scope === 'user' || scope === 'project' || scope === 'local' || action === 'install') args.push('-s', scope === 'project' || scope === 'local' ? scope : 'user');
  if (action === 'uninstall') args.push('-y'); // skips the prune prompt, which would fail without a terminal
  const r = await run('claude', args, { timeoutMs: action === 'install' ? 300_000 : 60_000 });
  catalog = null; // installed/enabled changed
  return result(r);
}

export async function marketplaceAction(action: 'add' | 'remove', target: string): Promise<SetupResult> {
  if (!/^[\w.@:/~+-]{1,300}$/.test(target)) throw new HttpError(400, 'Use a GitHub owner/repo, a git URL or a path');
  const r = await run('claude', ['plugin', 'marketplace', action, target], { timeoutMs: 180_000 });
  catalog = null;
  return result(r);
}

// ---- instruction files --------------------------------------------------------------------

function gitRoot(dir: string): string | null {
  for (let d = dir; ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return null;
  }
}

/** The files the agent loads for a session started in `cwd`, outer to inner (later ones refine earlier ones). */
export function instructionFiles(agent: Agent, cwdArg?: string): InstructionFile[] {
  const cwd = folder(cwdArg);
  const out: InstructionFile[] = [];
  const add = (p: string, scope: InstructionFile['scope'], primary = false) => {
    let st: fs.Stats | null = null;
    try {
      st = fs.statSync(p);
    } catch {}
    if (st?.isFile() || primary) out.push({ path: p, scope, exists: !!st?.isFile(), size: st?.isFile() ? st.size : undefined, primary: primary || undefined });
  };
  // Folders above cwd, outermost first: Claude reads them up to /, Codex from the repository root down.
  const above: string[] = [];
  const stop = agent === 'codex' ? gitRoot(cwd) : null;
  for (let d = path.dirname(cwd); d !== cwd; ) {
    if (agent === 'codex' && (!stop || d.length < stop.length)) break;
    above.unshift(d);
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  if (agent === 'claude') {
    add(path.join(claudeDir(), 'CLAUDE.md'), 'user', true);
    for (const d of above) {
      add(path.join(d, 'CLAUDE.md'), 'parent');
      add(path.join(d, 'CLAUDE.local.md'), 'parent');
    }
    add(path.join(cwd, 'CLAUDE.md'), 'project', true);
    add(path.join(cwd, '.claude', 'CLAUDE.md'), 'project');
    add(path.join(cwd, 'CLAUDE.local.md'), 'local');
    try {
      for (const f of fs.readdirSync(path.join(cwd, '.claude', 'rules')).sort()) if (f.endsWith('.md')) add(path.join(cwd, '.claude', 'rules', f), 'rules');
    } catch {}
  } else {
    add(path.join(codexDir(), 'AGENTS.override.md'), 'user');
    add(path.join(codexDir(), 'AGENTS.md'), 'user', true);
    for (const d of above) {
      add(path.join(d, 'AGENTS.override.md'), 'parent');
      add(path.join(d, 'AGENTS.md'), 'parent');
    }
    add(path.join(cwd, 'AGENTS.override.md'), 'project');
    add(path.join(cwd, 'AGENTS.md'), 'project', true);
  }
  return out;
}

/** Creates one of the agent's instruction files for this folder (only paths it would read). */
export function createInstructionFile(agent: Agent, file: string, cwdArg?: string): string {
  const want = path.resolve(file);
  const known = instructionFiles(agent, cwdArg).find((f) => f.path === want);
  if (!known) throw new HttpError(400, `${agent === 'claude' ? 'Claude Code' : 'Codex'} does not read that file here`);
  if (!known.exists) {
    fs.mkdirSync(path.dirname(want), { recursive: true });
    const title = known.scope === 'user' ? 'Instructions for every session' : `Instructions for ${path.basename(path.dirname(want))}`;
    fs.writeFileSync(want, `# ${title}\n\n`, { flag: 'wx' });
  }
  return want;
}
