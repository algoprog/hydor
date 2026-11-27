// The plugins an app needs (requires.plugins): how each stands on this computer, the check before a run, and the tool
// steps that call a plugin's MCP tool ("plugin:<plugin>/<tool>"). A run starts a plugin's servers the first time a
// step calls one of their tools, keeps them for the rest of the run, and stops them when it ends. The servers are
// started as agents start them (plugins/store.ts, through the launcher) and talked to with Custom's MCP client.
import type { AppRecipe } from '../../shared/apps.ts';
import { appPrograms, pluginStepTool } from '../../shared/app-manifest.ts';
import { satisfies, type PluginAgent, type PluginNeed } from '../../shared/plugins.ts';
import { McpClient, type McpDef, type McpTool } from '../agent/mcp.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { McpServerSpec, RunTool, ToolOutput } from '../features/types.ts';
import { activePlugins, builtins, busy, dataOf, installedOne, isManifest, load, pluginServers, rootOf } from '../plugins/store.ts';
import { setupOf } from '../plugins/setup.ts';

/** Longest one call of a plugin's tool may take in a step (making audio or video takes a while). */
const CALL_MS = 30 * 60_000;

const AGENT_NAMES: Record<PluginAgent, string> = { claude: 'Claude Code', codex: 'Codex', custom: 'Custom', acp: 'other ACP agents' };

const SETTINGS = 'Settings → Plugins';

/** How one plugin stands. `kinds`: the programs the run uses, which it must work with. */
function needOf(db: DB, name: string, kinds: PluginAgent[], seen: Set<string> = new Set()): PluginNeed {
  const builtin = builtins().find((b) => b.name === name);
  const installed = installedOne(db, name);
  if (!installed) {
    if (!builtin) return { name, title: name, state: 'unknown', problem: 'is not installed here', fix: `Add it in ${SETTINGS} (from a link, a file or a folder)` };
    return { name, title: builtin.title, state: 'missing', problem: 'is not installed', fix: `Add it in ${SETTINGS}`, action: { do: 'install', plugin: name, title: builtin.title }, agents: builtin.agents };
  }
  const m = load(rootOf(installed));
  if (!isManifest(m)) return { name, title: builtin?.title ?? name, state: 'broken', problem: `cannot be read (${m.error})`, fix: `Remove it and add it again in ${SETTINGS}` };
  const base = { name, title: m.title, agents: m.agents };
  const on = activePlugins(db).some((l) => l.i.name === name);
  // A plugin it needs first: adding or turning on this one would not help while that one cannot be.
  if (!on && !seen.has(name)) {
    seen.add(name);
    for (const r of m.requires.plugins) {
      const dep = needOf(db, r.name, [], seen);
      const have = installedOne(db, r.name);
      const hm = have ? load(rootOf(have)) : null;
      if (dep.state === 'on' && hm && isManifest(hm) && !satisfies(hm.version, r.range)) return { ...base, state: 'needs', problem: `needs the ${dep.title} plugin ${r.range}`, fix: `Update ${dep.title} in ${SETTINGS}` };
      // One that is only off is turned on with this one.
      if (dep.state !== 'on' && !(dep.state === 'off' && !installed.enabled)) return { ...base, state: 'needs', problem: `needs the ${dep.title} plugin, which ${dep.problem}`, fix: dep.fix, ...(dep.action ? { action: dep.action } : {}) };
    }
  }
  if (!installed.enabled) return { ...base, state: 'off', problem: 'is turned off', fix: `Turn it on in ${SETTINGS}`, action: { do: 'enable', plugin: name, title: m.title } };
  const setup = setupOf(m.requires, dataOf(name), busy.has(name));
  if (setup.state === 'installing') return { ...base, state: 'installing', problem: 'is still being set up', fix: 'Wait until that is done' };
  if (setup.state === 'outdated' || setup.state === 'failed')
    return { ...base, state: 'setup', problem: setup.state === 'failed' ? `could not be set up${setup.error ? ` (${setup.error.slice(0, 200)})` : ''}` : 'is not set up yet', fix: `Set it up in ${SETTINGS}`, action: { do: 'setup', plugin: name, title: m.title } };
  if (!on) return { ...base, state: 'needs', problem: 'cannot be used: a plugin it needs is not on', fix: `See it in ${SETTINGS}` };
  const lacking = kinds.filter((k) => !m.agents.includes(k));
  if (lacking.length) return { ...base, state: 'agent', problem: `does not work with ${lacking.map((k) => AGENT_NAMES[k]).join(' or ')}`, fix: `Pick another agent for the app (it works with ${m.agents.map((k) => AGENT_NAMES[k]).join(', ')})` };
  return { ...base, state: 'on', problem: '', fix: '' };
}

/** Each plugin the recipe needs and how it stands (`kinds`: the programs it must work with; none: not checked). */
export function pluginNeeds(db: DB, r: Pick<AppRecipe, 'requires'>, kinds: PluginAgent[] = []): PluginNeed[] {
  return (r.requires?.plugins ?? []).map((name) => needOf(db, name, kinds));
}

/** The ones not on, for a run of this recipe (or of one of its other flows). */
export function missingPlugins(db: DB, r: AppRecipe, flow?: string): PluginNeed[] {
  if (!r.requires?.plugins?.length) return [];
  return pluginNeeds(db, r, appPrograms(r, flow)).filter((p) => p.state !== 'on');
}

const needLine = (p: PluginNeed) => `the ${p.title} plugin${p.title === p.name ? '' : ` (${p.name})`}, which ${p.problem}. ${p.fix}`;

/** Why a run cannot start, naming each plugin and what to do. */
export const pluginsError = (lacking: PluginNeed[]) => `This app needs ${lacking.map(needLine).join('. It also needs ')}, then run it again.`;

/** Throws when a plugin the recipe needs is not installed or not on for the program the run uses. */
export function needPlugins(db: DB, r: AppRecipe, flow?: string) {
  const lacking = missingPlugins(db, r, flow);
  if (lacking.length) throw new HttpError(409, pluginsError(lacking), { plugins: lacking });
}

// ---- tool steps -----------------------------------------------------------------------------------------

interface Server {
  name: string;
  client: McpClient;
}

/** The servers each run has started, by plugin. */
const running = new Map<string, Map<string, Promise<Server[]>>>();

function defOf(name: string, spec: McpServerSpec): McpDef {
  // As an agent starts them: with the login shell's environment, not this server's own.
  return spec.type === 'http' ? { name, type: 'http', url: spec.url, headers: spec.headers } : { name, type: 'stdio', command: spec.command, args: spec.args ?? [], env: spec.env, baseEnv: agentBaseEnv() };
}

async function start(db: DB, plugin: string): Promise<Server[]> {
  const specs = pluginServers(db, plugin);
  if (!specs.length) throw new Error(`The plugin ${plugin} has no MCP server, so it has no tools for a step (its skills are for Ask an agent steps)`);
  const failed: string[] = [];
  const servers = await Promise.all(
    specs.map(async ({ name, spec }): Promise<Server | null> => {
      const client = new McpClient(defOf(name, spec));
      try {
        await client.connect();
        return { name, client };
      } catch (e) {
        client.close();
        failed.push((e as Error).message);
        return null;
      }
    }),
  );
  const ok = servers.filter((s): s is Server => !!s);
  if (!ok.length) throw new Error(`The plugin ${plugin}’s server did not start: ${failed.join('; ').slice(0, 500)}`);
  return ok;
}

/** The run's servers of a plugin, started now when it has none, or when one of them has ended. */
async function serversOf(db: DB, run: string, plugin: string): Promise<Server[]> {
  let mine = running.get(run);
  if (!mine) running.set(run, (mine = new Map()));
  const had = mine.get(plugin);
  if (had) {
    const list = await had.catch(() => null);
    if (list && list.every((s) => !s.client.stopped)) return list;
    for (const s of list ?? []) s.client.close();
    // Another step may have started them again meanwhile.
    if (mine.get(plugin) !== had) return serversOf(db, run, plugin);
  }
  const made = start(db, plugin);
  mine.set(plugin, made);
  try {
    return await made;
  } catch (e) {
    if (mine.get(plugin) === made) mine.delete(plugin);
    throw e;
  }
}

async function find(db: DB, run: string, plugin: string, tool: string): Promise<{ server: Server; tool: McpTool }> {
  const servers = await serversOf(db, run, plugin);
  for (const server of servers) {
    const t = server.client.tools.find((x) => x.name === tool);
    if (t) return { server, tool: t };
  }
  throw new Error(`The plugin ${plugin} has no tool “${tool}” (it has ${servers.flatMap((s) => s.client.tools.map((t) => t.name)).join(', ') || 'none'})`);
}

/**
 * A step's plugin tool ("plugin:<plugin>/<tool>") as a tool of the app's own, its server started for the run. Its
 * plugin must be on. `data()`: the structured content of its last answer, when it gave some.
 */
export async function pluginTool(db: DB, run: string, name: string, signal: AbortSignal): Promise<{ tool: RunTool; data: () => unknown }> {
  const ref = pluginStepTool(name);
  if (!ref) throw new Error(`A plugin's tool is "plugin:<plugin>/<tool>", not ${name}`);
  const need = needOf(db, ref.plugin, []);
  if (need.state !== 'on') throw new Error(`The step needs ${needLine(need)}.`);
  const first = await find(db, run, ref.plugin, ref.tool);
  let data: unknown;
  return {
    data: () => data,
    tool: {
      name,
      description: first.tool.description,
      inputSchema: first.tool.inputSchema,
      // A tool its server marks as only reading may be tried again after a failure that passes.
      annotations: first.tool.readOnly ? { readOnlyHint: true } : {},
      async run(args): Promise<ToolOutput> {
        // Found again at each try: a server that ended is started again.
        const { server } = await find(db, run, ref.plugin, ref.tool);
        const r = await server.client.call(ref.tool, args, signal, CALL_MS);
        data = r.structured;
        return { text: r.text, ...(r.isError ? { isError: true } : {}) };
      },
    },
  };
}

/** The run ended: its plugins' servers stop. */
export function closePluginServers(run: string) {
  const mine = running.get(run);
  if (!mine) return;
  running.delete(run);
  for (const p of mine.values()) void p.then((list) => list.forEach((s) => s.client.close()), () => {});
}

/** The app server is stopping. */
export function closeAllPluginServers() {
  for (const run of [...running.keys()]) closePluginServers(run);
}
