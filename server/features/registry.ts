// Calls into the app's capabilities. Kept apart from the list of them (index.ts) so sessions.ts and
// mcp.ts can call in without importing every capability's code.
import type { SessionExtra } from '../../shared/features.ts';
import type { Deps, Feature, RunCtx, RunTool, SpawnAdditions, SpawnInfo, TurnInfo } from './types.ts';

let list: Feature[] = [];
let deps: Deps | null = null;

const warn = (f: Feature, what: string, e: unknown) => console.error(`[${f.id}] ${what}: ${(e as Error)?.message ?? e}`);

/** Registers the capabilities and their routes (before the server listens). */
export function registerFeatures(features: Feature[], d: Deps) {
  list = features;
  deps = d;
  for (const f of list) f.routes?.(d);
}

/** Once the server is up. */
export function startFeatures() {
  for (const f of list) {
    try {
      f.start?.(deps!);
    } catch (e) {
      warn(f, 'start', e);
    }
  }
}

export function featureDeps(): Deps {
  if (!deps) throw new Error('The app is still starting');
  return deps;
}

/** The tools of one run's own MCP server; what they return passes each capability's `scrub`. */
export function runTools(ctx: RunCtx): RunTool[] {
  const all = list.flatMap((f) => {
    try {
      return f.tools?.(ctx) ?? [];
    } catch (e) {
      warn(f, 'tools', e);
      return [];
    }
  });
  // A capability may hold back others' tools from a run; one that fails to say holds them back.
  const tools = all.filter((t) =>
    list.every((f) => {
      try {
        return f.allowTool?.(t.name, ctx) ?? true;
      } catch (e) {
        warn(f, 'allowTool', e);
        return false;
      }
    }),
  );
  const scrubs = list.filter((f) => f.scrub);
  if (!scrubs.length) return tools;
  const clean = (t: string) => scrubs.reduce((s, f) => f.scrub!(s), t);
  return tools.map((t) => ({
    ...t,
    async run(a, c) {
      let r;
      try {
        r = await t.run(a, c);
      } catch (e) {
        throw new Error(clean(String((e as Error)?.message ?? e)));
      }
      return typeof r === 'string' ? clean(r) : { ...r, text: clean(r.text) };
    },
  }));
}

/** Everything the capabilities give a starting agent. */
export async function spawnAdditions(s: SpawnInfo): Promise<Required<SpawnAdditions>> {
  const out: Required<SpawnAdditions> = { instructions: [], mcpServers: {}, env: {}, args: [], skillRoots: [], disallowedTools: [], strictMcp: false, codexConfig: {} };
  if (!deps) return out;
  for (const f of list) {
    try {
      const a = await f.spawn?.(s, deps);
      if (!a) continue;
      out.instructions.push(...(a.instructions ?? []).filter((t) => t.trim()));
      Object.assign(out.mcpServers, a.mcpServers);
      Object.assign(out.env, a.env);
      out.args.push(...(a.args ?? []));
      out.skillRoots.push(...(a.skillRoots ?? []));
      out.disallowedTools.push(...(a.disallowedTools ?? []));
      out.strictMcp ||= !!a.strictMcp;
      Object.assign(out.codexConfig, a.codexConfig);
    } catch (e) {
      warn(f, 'spawn', e);
    }
  }
  return out;
}

/**
 * Custom's instructions from the capabilities, for its next turn: each one's `context`, or for one
 * without it, the instructions its `spawn` gives every agent.
 */
export async function featureContext(s: { key: string; cwd: string; extra: SessionExtra; runId: string }): Promise<string> {
  if (!deps) return '';
  const parts: string[] = [];
  for (const f of list) {
    try {
      const t = f.context ? await f.context(s, deps) : (await f.spawn?.({ agent: 'acp', acpAgent: 'console', key: s.key, cwd: s.cwd, runId: s.runId, resume: true, extra: s.extra }, deps))?.instructions?.join('\n\n');
      if (t?.trim()) parts.push(t.trim());
    } catch (e) {
      warn(f, 'context', e);
    }
  }
  return parts.join('\n\n');
}

/** A turn ended: each capability does its work in the background. */
export function turnEnded(t: TurnInfo) {
  if (!deps) return;
  for (const f of list) if (f.turnEnd) Promise.resolve().then(() => f.turnEnd!(t, deps!)).catch((e) => warn(f, 'turnEnd', e));
}

/** Throws (an HttpError) when a capability refuses the message, e.g. a spending cap was reached. */
export async function beforeSend(key: string) {
  if (!deps) return;
  for (const f of list) await f.beforeSend?.(key, deps);
}
