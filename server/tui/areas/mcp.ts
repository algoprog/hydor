// `hydor mcp`: Settings → Agents → MCP servers. The tool servers Claude Code and Codex use: list, status (does each
// start), add (to one or both), edit (replaces one: remove, then add) and remove. The API has no on and off for a
// server: removing one is how it stops. Values of env and headers are never returned by the server, so edit asks for them again.
import path from 'node:path';
import { ApiError } from '../client.ts';
import { Cancelled, choose, mark, str, strs, table, UsageError, type Area, type Ctx, type OptionSpec, type Values } from './kit.ts';

interface Server {
  agent: 'claude' | 'codex';
  name: string;
  scope: 'user' | 'local' | 'project';
  transport: 'stdio' | 'http' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  envKeys?: string[];
  headerKeys?: string[];
  bearerEnv?: string;
  enabled?: boolean;
}
interface Result {
  agent: 'claude' | 'codex';
  ok: boolean;
  output: string;
}
const programName = (a: string) => (a === 'claude' ? 'Claude Code' : 'Codex');
const MCP_HINT = 'hydor mcp lists them';
const server = { name: 'server', kind: 'mcp', pick: true } as const;
const idOf = (s: Server) => `${s.agent}:${s.scope}:${s.name}`;

const PICK: Record<'agent' | 'scope' | 'folder', OptionSpec> = {
  agent: { type: 'string', value: 'claude|codex', desc: 'Only this agent’s servers', values: ['claude', 'codex'] },
  scope: { type: 'string', value: 'user|local|project', desc: 'Claude Code’s scope: user, local (this folder) or project', values: ['user', 'local', 'project'] },
  folder: { type: 'string', value: '<folder>', desc: 'The folder for local and project servers (default: home)', kind: 'dir' },
};

const folderOf = (ctx: Ctx, v: Values): string | undefined => {
  const f = str(v, 'folder');
  return f === undefined ? undefined : ctx.conn.here && !f.startsWith('~') ? path.resolve(f) : f;
};
const agentOf = (v: Values): 'claude' | 'codex' | undefined => {
  const a = str(v, 'agent');
  if (a !== undefined && a !== 'claude' && a !== 'codex') throw new UsageError(`--agent takes claude or codex (it was “${a}”)`);
  return a as 'claude' | 'codex' | undefined;
};
const scopeOf = (v: Values): Server['scope'] | undefined => {
  const s = str(v, 'scope');
  if (s !== undefined && !['user', 'local', 'project'].includes(s)) throw new UsageError(`--scope takes user, local or project (it was “${s}”)`);
  return s as Server['scope'] | undefined;
};

async function listServers(ctx: Ctx, v: Values): Promise<Server[]> {
  const cwd = folderOf(ctx, v);
  const agent = agentOf(v);
  const scope = scopeOf(v);
  const r = await ctx.conn.api<{ servers: Server[] }>('GET', `/api/setup/mcp${cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''}`, undefined, { timeoutMs: 60_000 });
  return r.servers.filter((s) => (!agent || s.agent === agent) && (!scope || s.scope === scope));
}

const findServer = async (ctx: Ctx, v: Values, given: string | undefined): Promise<Server> =>
  choose(ctx, await listServers(ctx, v), given, {
    id: idOf,
    names: (s) => [s.name],
    what: 'MCP server',
    hint: MCP_HINT,
    label: (s) => s.name,
    detail: (s) => `${programName(s.agent)}${s.scope === 'user' ? '' : `, ${s.scope}`}: ${s.url ?? [s.command, ...(s.args ?? [])].join(' ')}`,
  });

/** A command line as words: spaces separate, quotes group (the page's own way). */
function splitCommand(text: string, home: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) out.push((m[1] ?? m[2] ?? m[3]).replace(/^~(?=\/|$)/, home));
  return out;
}

/** KEY=value pairs; a KEY alone is asked for with what is typed hidden. */
async function pairs(ctx: Ctx, list: string[], sep: '=' | ':', what: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const item of list) {
    const i = item.indexOf(sep);
    const key = (i < 0 ? item : item.slice(0, i)).trim();
    if (!key) throw new UsageError(`${what} “${item}” has no name`);
    let value = i < 0 ? undefined : item.slice(i + 1).trim();
    if (value === undefined) {
      if (!ctx.interactive) throw new UsageError(`${what} ${key} has no value: write ${key}${sep}<value> (on a terminal, ${key} alone asks for it hidden)`);
      const typed = await ctx.ask(`${what} ${key}: `, { hidden: true });
      if (typed === null) throw new Cancelled();
      value = typed;
    }
    out[key] = value;
  }
  return out;
}

/** The options `add` and `edit` share. */
const SPEC_OPTIONS: Record<string, OptionSpec> = {
  transport: { type: 'string', value: 'stdio|http|sse', desc: 'How it is reached (default: http with --url, else stdio)', values: ['stdio', 'http', 'sse'] },
  command: { type: 'string', value: '<command>', desc: 'The command that starts it, with its arguments' },
  url: { type: 'string', value: '<address>', desc: 'Its http(s) address (a remote server)' },
  env: { type: 'strings', value: 'KEY=value', desc: 'An environment variable; KEY alone is asked for hidden' },
  header: { type: 'strings', value: 'Name:value', desc: 'A header for a remote server (Claude Code only)' },
  'bearer-env': { type: 'string', value: '<VAR>', desc: 'Codex only: the variable holding the bearer token' },
};

/** Adds a server as the API takes it; prints what each agent said. */
async function addServer(ctx: Ctx, body: Record<string, unknown>, quiet = false): Promise<Result[]> {
  const r = await ctx.conn.api<{ results: Result[] }>('POST', '/api/setup/mcp', body, { timeoutMs: 120_000 });
  if (!quiet && !ctx.o.json)
    for (const x of r.results)
      ctx.out(x.ok ? `${mark(ctx.look.p, 'done')} Added “${body.name}” to ${programName(x.agent)}.` : `${mark(ctx.look.p, 'error')} ${programName(x.agent)} would not add “${body.name}”: ${x.output}`);
  return r.results;
}

export const mcp: Area = {
  name: 'mcp',
  summary: 'Tool servers (MCP) for the agents',
  help: 'An MCP server gives an agent tools (GitHub, a database, a browser…). These are the ones Claude Code and Codex have, which Hydor’s sessions with them use. Name one by its name; with the same name in several places, by agent:scope:name (or --agent, --scope). Keys it needs go in the vault (hydor keys). There is no on and off for a server: remove it to stop it, add it to have it back.',
  group: 'tools',
  verbs: [
    {
      name: 'list',
      args: [],
      options: PICK,
      summary: 'The servers each agent has',
      examples: ['hydor mcp', 'hydor mcp --agent codex', 'hydor mcp --folder ~/code/app', 'hydor mcp --json'],
      async run(ctx, _a, v) {
        if (ctx.o.json) return ctx.json({ servers: await listServers(ctx, v) });
        const list = await listServers(ctx, v);
        if (!list.length) return ctx.out('No MCP servers: hydor mcp add <name> <command…> adds one.');
        const { p } = ctx.look;
        ctx.out(
          table(
            ctx,
            list.map((s) => [
              s.enabled === false ? mark(p, 'off') : mark(p, 'on'),
              p.bold(s.name),
              programName(s.agent),
              p.dim(s.scope),
              p.dim(s.transport),
              s.url ?? [s.command, ...(s.args ?? [])].filter(Boolean).join(' '),
              p.dim([...(s.envKeys ?? []), ...(s.headerKeys ?? []), ...(s.bearerEnv ? [s.bearerEnv] : [])].join(', ')),
            ]),
            { head: ['', 'SERVER', 'AGENT', 'SCOPE', 'TYPE', 'COMMAND OR ADDRESS', 'KEYS'], grow: 5 },
          ),
        );
      },
    },
    {
      name: 'status',
      args: [],
      options: { agent: PICK.agent, folder: PICK.folder },
      summary: 'Start each server and say which work',
      help: 'No model is used. It takes up to about 45 seconds for Claude Code and about 2 minutes for Codex. Without --agent, both are checked, one after the other.',
      examples: ['hydor mcp status', 'hydor mcp status --agent claude'],
      async run(ctx, _a, v) {
        const agents = agentOf(v) ? [agentOf(v)!] : (['claude', 'codex'] as const);
        const cwd = folderOf(ctx, v);
        const all: Record<string, unknown> = {};
        const { p } = ctx.look;
        for (const agent of agents) {
          const r = await ctx.conn.api<{ servers: { name: string; state: string; error?: string; tools?: number }[] }>(
            'POST',
            '/api/setup/mcp/status',
            { agent, ...(cwd ? { cwd } : {}) },
            { timeoutMs: 200_000 },
          );
          all[agent] = r;
          if (ctx.o.json) continue;
          if (!r.servers.length) continue;
          ctx.out(
            table(
              ctx,
              r.servers.map((s) => [
                s.state === 'connected' ? mark(p, 'on') : s.state === 'pending' || s.state === 'auth' ? mark(p, 'attention') : s.state === 'off' ? mark(p, 'off') : mark(p, 'error'),
                p.bold(s.name),
                programName(agent),
                s.state + (s.tools !== undefined ? p.dim(` · ${s.tools} tools`) : ''),
                p.dim(s.error ?? ''),
              ]),
              { grow: 4 },
            ),
          );
        }
        if (ctx.o.json) ctx.json(agents.length === 1 ? all[agents[0]] : all);
        else if (!Object.values(all).some((r) => (r as { servers: unknown[] }).servers.length)) ctx.out('No MCP servers to check.');
      },
    },
    {
      name: 'add',
      aliases: ['new', 'create'],
      args: [
        { name: 'name', kind: 'text' },
        { name: 'command', kind: 'text', optional: true, rest: true },
      ],
      options: {
        agent: { type: 'strings', value: 'claude|codex', desc: 'Add it to this agent (again for both; default both)', values: ['claude', 'codex'] },
        ...SPEC_OPTIONS,
        scope: PICK.scope,
        folder: PICK.folder,
      },
      summary: 'Add a server to Claude Code, Codex or both',
      help: 'A command server: the words after the name are the command and its arguments (put -- before them when they start with a dash). A remote server: --url. Letters, digits, dots, dashes or underscores in the name; the agents show tools as name/tool. Env values and headers are saved in the agents’ own settings; put a real key in the vault when you can. Where an agent would not take it, the others still did: retry only for that one with --agent.',
      examples: [
        'hydor mcp add github --env GITHUB_TOKEN -- npx -y gh-mcp',
        'hydor mcp add docs --url https://example.com/mcp',
        'hydor mcp add db --agent claude --scope local --folder ~/app -- uvx sqlite',
      ],
      async run(ctx, [name, ...words], v) {
        const body = await specOf(ctx, v, { name, words });
        const results = await addServer(ctx, body);
        if (ctx.o.json) return ctx.json({ results });
        return results.every((x) => x.ok) ? 0 : 1;
      },
    },
    {
      name: 'edit',
      aliases: ['set'],
      args: [server],
      options: { ...PICK, ...SPEC_OPTIONS },
      summary: 'Change a server (removed, then added again)',
      help: 'The agents have no way to change a server, so this removes it and adds it again with what you name changed and the rest kept: the command and arguments, or the address. The values of its env and headers are never returned to Hydor, so a server with some needs them given again (--env KEY=value). It asks first.',
      examples: ['hydor mcp edit github --env GITHUB_TOKEN', 'hydor mcp edit docs --url https://example.com/v2/mcp', 'hydor mcp edit db --command "uvx mcp-server-sqlite --read-only" --agent claude'],
      async run(ctx, [given], v) {
        const s = await findServer(ctx, v, given);
        const named = ['transport', 'command', 'url', 'env', 'header', 'bearer-env'].some((k) => v[k] !== undefined);
        if (!named) throw new UsageError(`Say what to change: ${['--command', '--url', '--env', '--header', '--bearer-env'].join(', ')} (${ctx.usage})`);
        const needs = [...(s.envKeys ?? []), ...(s.headerKeys ?? [])];
        const gave = [...strs(v, 'env'), ...strs(v, 'header')].map((x) => x.split(/[=:]/)[0].trim());
        const lost = needs.filter((k) => !gave.includes(k));
        if (lost.length && !s.bearerEnv)
          throw new UsageError(
            `“${s.name}” has ${lost.join(', ')}, whose values are never returned to Hydor: give them again (${lost.map((k) => `--${s.envKeys?.includes(k) ? 'env' : 'header'} ${k}${s.envKeys?.includes(k) ? '=' : ':'}<value>`).join(' ')})`,
          );
        const spec = await specOf(ctx, v, { name: s.name, existing: s });
        if (!(await ctx.confirm(`Replace “${s.name}” of ${programName(s.agent)} (removed, then added again)?`))) return ctx.out('Not changed.');
        const cwd = folderOf(ctx, v);
        const gone = await ctx.conn.api<{ ok: boolean; output?: string }>(
          'POST',
          '/api/setup/mcp/remove',
          { agent: s.agent, name: s.name, scope: s.scope, ...(cwd ? { cwd } : {}) },
          { timeoutMs: 60_000 },
        );
        if (!gone.ok) throw new ApiError(500, `${programName(s.agent)} would not remove “${s.name}”: ${gone.output}`);
        const results = await addServer(ctx, { ...spec, agents: [s.agent], scope: s.scope, ...(cwd ? { cwd } : {}) }, true);
        if (ctx.o.json) return ctx.json({ results });
        const bad = results.find((x) => !x.ok);
        if (bad) {
          // Put the old one back, when it held nothing that cannot be given back.
          const back =
            s.envKeys?.length || s.headerKeys?.length
              ? undefined
              : await addServer(ctx, { ...(await specOf(ctx, {}, { name: s.name, existing: s })), agents: [s.agent], scope: s.scope, ...(cwd ? { cwd } : {}) }, true).catch(() => undefined);
          throw new ApiError(
            500,
            `${programName(s.agent)} would not take the change to “${s.name}”: ${bad.output}\n${back?.every((x) => x.ok) ? 'It is back as it was.' : 'It is removed: add it again with hydor mcp add.'}`,
          );
        }
        ctx.out(`Changed “${s.name}” for ${programName(s.agent)}.`);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [server],
      options: PICK,
      summary: 'Remove a server from its agent',
      examples: ['hydor mcp remove github', 'hydor mcp remove github --agent codex -y'],
      async run(ctx, [given], v) {
        const s = await findServer(ctx, v, given);
        if (!(await ctx.confirm(`Remove “${s.name}” from ${programName(s.agent)}?`))) return ctx.out('Not removed.');
        const cwd = folderOf(ctx, v);
        const r = await ctx.conn.api<{ ok: boolean; output?: string }>(
          'POST',
          '/api/setup/mcp/remove',
          { agent: s.agent, name: s.name, scope: s.scope, ...(cwd ? { cwd } : {}) },
          { timeoutMs: 60_000 },
        );
        if (ctx.o.json) return ctx.json(r);
        if (!r.ok) throw new ApiError(500, `${programName(s.agent)} would not remove “${s.name}”: ${r.output}`);
        ctx.out(`Removed “${s.name}” from ${programName(s.agent)}.`);
      },
    },
  ],
};

/** A server as POST /api/setup/mcp takes it, from the words and options (and the server it is changing). */
async function specOf(ctx: Ctx, v: Values, o: { name: string; words?: string[]; existing?: Server }): Promise<Record<string, unknown>> {
  const ex = o.existing;
  const url = str(v, 'url') ?? (ex?.transport !== 'stdio' ? ex?.url : undefined);
  const typed = str(v, 'transport');
  if (typed !== undefined && !['stdio', 'http', 'sse'].includes(typed)) throw new UsageError(`--transport takes stdio, http or sse (it was “${typed}”)`);
  const command = o.words?.length ? o.words : str(v, 'command') ? splitCommand(str(v, 'command')!, ctx.look.home) : undefined;
  const transport = (typed ?? (str(v, 'url') ? 'http' : command ? 'stdio' : (ex?.transport ?? (url ? 'http' : 'stdio')))) as 'stdio' | 'http' | 'sse';
  const agents = ex ? [ex.agent] : strs(v, 'agent').length ? strs(v, 'agent') : ['claude', 'codex'];
  for (const a of agents) if (a !== 'claude' && a !== 'codex') throw new UsageError(`--agent takes claude or codex (it was “${a}”)`);
  const body: Record<string, unknown> = { agents: transport === 'sse' ? agents.filter((a) => a === 'claude') : agents, name: o.name, transport };
  if (transport === 'sse' && !agents.includes('claude')) throw new UsageError('SSE is Claude Code’s only');
  if (transport === 'stdio') {
    const parts = command ?? (ex?.command ? [ex.command, ...(ex.args ?? [])] : []);
    if (!parts.length) throw new UsageError(`Say what starts it: hydor mcp add ${o.name} <command…> (or --url for a remote one)`);
    body.command = parts[0];
    body.args = parts.slice(1);
    const env = await pairs(ctx, strs(v, 'env'), '=', 'Environment variable');
    if (Object.keys(env).length) body.env = env;
    if (strs(v, 'header').length || str(v, 'bearer-env')) throw new UsageError('--header and --bearer-env are for a remote server (--url)');
  } else {
    if (!url || !/^https?:\/\/\S+$/.test(url)) throw new UsageError(`Give its http(s) address with --url (it was “${url ?? ''}”)`);
    body.url = url;
    const headers = await pairs(ctx, strs(v, 'header'), ':', 'Header');
    if (Object.keys(headers).length) body.headers = headers;
    const bearer = str(v, 'bearer-env') ?? ex?.bearerEnv;
    if (bearer) body.bearerEnv = bearer;
    if (strs(v, 'env').length) throw new UsageError('--env is for a command server: a remote one takes --header (Claude Code) or --bearer-env (Codex)');
  }
  const scope = scopeOf(v);
  if (scope) body.scope = scope;
  const cwd = folderOf(ctx, v);
  if (cwd) body.cwd = cwd;
  return body;
}
