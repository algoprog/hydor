// Calls into the app's capabilities. Kept apart from the list of them (index.ts) so sessions.ts and
// mcp.ts can call in without importing every capability's code.
import type { SessionExtra } from '../../shared/features.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import type { ServerEvent } from '../../shared/types.ts';
import type { Deps, Feature, GivenAdditions, RunCtx, RunTool, SpawnInfo, ToolGuide, TurnInfo } from './types.ts';

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
  const arounds = list.filter((f) => f.aroundTool);
  if (!scrubs.length && !arounds.length) return tools;
  const clean = (t: string) => scrubs.reduce((s, f) => f.scrub!(s), t);
  return tools.map((t) => ({
    ...t,
    async run(a, c) {
      // A capability may answer in the tool's place (a budget spent), or add a line to its answer.
      const notes: string[] = [];
      for (const f of arounds) {
        let x;
        try {
          x = f.aroundTool!(t.name, c);
        } catch (e) {
          warn(f, 'aroundTool', e);
        }
        if (x?.refuse) return { text: x.refuse, isError: true };
        if (x?.note) notes.push(x.note);
      }
      let r;
      try {
        r = await t.run(a, c);
      } catch (e) {
        throw new Error(clean(String((e as Error)?.message ?? e)));
      }
      const add = (s: string) => clean(notes.length ? `${s}\n\n${notes.join('\n')}` : s);
      return typeof r === 'string' ? add(r) : { ...r, text: add(r.text) };
    },
  }));
}

/** Everything the capabilities give a starting agent (their tools' guides in its instructions: Custom reads them apart, featureContext). */
export async function spawnAdditions(s: SpawnInfo): Promise<GivenAdditions> {
  const out: GivenAdditions = { instructions: [], notes: [], mcpServers: {}, env: {}, args: [], skillRoots: [], disallowedTools: [], strictMcp: false, codexConfig: {} };
  if (!deps) return out;
  // A confidential session gets no MCP server but the app's own (server/confidential): connected apps and plugins' servers reach outside.
  const closed = s.extra?.confidential === true;
  for (const f of list) {
    try {
      const a = await f.spawn?.(s, deps);
      if (!a) continue;
      out.instructions.push(...[...(a.instructions ?? []), ...(a.guides ?? []).map((g) => g.text)].filter((t) => t.trim()));
      out.notes.push(...(a.notes ?? []).filter((t) => t.trim()));
      if (!closed) Object.assign(out.mcpServers, a.mcpServers);
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

/** What the capabilities give Custom for a turn: each one's instructions (by its id), and its tools' guides, which Custom adds while one of their tools is offered. */
export interface CustomContext {
  parts: { id: string; text: string }[];
  guides: ToolGuide[];
}

/**
 * Custom's instructions from the capabilities, for its next turn: each one's `context`, or for one
 * without it, the instructions and guides its `spawn` gives every agent. `epoch` counts the times Custom
 * condensed the conversation (memory gives the same block within one); `lean`, a model of a small context.
 */
export async function featureContext(s: { key: string; cwd: string; extra: SessionExtra; runId: string; epoch?: number; lean?: boolean }): Promise<CustomContext> {
  const out: CustomContext = { parts: [], guides: [] };
  if (!deps) return out;
  for (const f of list) {
    try {
      if (f.context) {
        const t = await f.context(s, deps);
        if (t?.trim()) out.parts.push({ id: f.id, text: t.trim() });
        continue;
      }
      const a = await f.spawn?.({ agent: 'acp', acpAgent: 'console', key: s.key, cwd: s.cwd, runId: s.runId, resume: true, extra: s.extra, lean: s.lean }, deps);
      const t = (a?.instructions ?? []).filter((x) => x.trim()).join('\n\n');
      if (t.trim()) out.parts.push({ id: f.id, text: t.trim() });
      for (const g of a?.guides ?? []) if (g.text.trim() && g.tools.length) out.guides.push({ tools: g.tools, text: g.text.trim() });
    } catch (e) {
      warn(f, 'context', e);
    }
  }
  return out;
}

/** A turn ended: each capability does its work in the background. */
export function turnEnded(t: TurnInfo) {
  if (!deps) return;
  for (const f of list) if (f.turnEnd) Promise.resolve().then(() => f.turnEnd!(t, deps!)).catch((e) => warn(f, 'turnEnd', e));
}

/** An event went to the pages: the capabilities that listen hear it too. */
export function eventSent(e: ServerEvent) {
  if (!deps) return;
  for (const f of list)
    if (f.event)
      try {
        f.event(e, deps);
      } catch (err) {
        warn(f, 'event', err);
      }
}

/** What waits on the user, from each capability (the inbox). */
export function inboxItems(): InboxItem[] {
  if (!deps) return [];
  return list.flatMap((f) => {
    try {
      return f.inbox?.(deps!) ?? [];
    } catch (e) {
      warn(f, 'inbox', e);
      return [];
    }
  });
}

/** Throws (an HttpError) when a capability refuses the message, e.g. a spending cap was reached. */
export async function beforeSend(key: string) {
  if (!deps) return;
  for (const f of list) await f.beforeSend?.(key, deps);
}

/** What the capabilities have for the agent with this message, as one block ('' for nothing). */
export async function messageNotes(key: string, text = ''): Promise<string> {
  if (!deps) return '';
  const parts: string[] = [];
  for (const f of list) {
    try {
      const t = f.beforeMessage?.(key, deps);
      if (t?.trim()) parts.push(t.trim());
    } catch (e) {
      warn(f, 'beforeMessage', e);
    }
    if (!f.aboutMessage || !text.trim()) continue;
    try {
      const t = await f.aboutMessage(text, key, deps);
      if (t?.trim()) parts.push(t.trim());
    } catch (e) {
      warn(f, 'aboutMessage', e);
    }
  }
  return parts.join('\n\n');
}
