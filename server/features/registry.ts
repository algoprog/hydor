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
        const err = new Error(clean(String((e as Error)?.message ?? e)));
        // What kind of failure it was (a timeout, a dropped connection) goes with it: an app's flow tries such a call again.
        const o = e as { name?: unknown; code?: unknown; cause?: { code?: unknown } } | null;
        if (o?.name === 'TimeoutError') err.name = 'TimeoutError';
        const code = o?.code ?? o?.cause?.code;
        if (typeof code === 'string') Object.assign(err, { code });
        throw err;
      }
      const add = (s: string) => clean(notes.length ? `${s}\n\n${notes.join('\n')}` : s);
      return typeof r === 'string' ? add(r) : { ...r, text: add(r.text) };
    },
  }));
}

const isTable = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * One capability's Codex settings added to the others', table by table, so two that both set `features` (memory's
 * memories, the subagents' multi_agent) keep both. Tables are copied, never shared with the capability that gave them.
 */
export function mergeTables(into: Record<string, unknown>, from: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(from)) into[k] = isTable(v) ? mergeTables(isTable(into[k]) ? (into[k] as Record<string, unknown>) : {}, v) : v;
  return into;
}

/**
 * Everything the capabilities give a starting agent (their tools' guides in its instructions: Custom reads them apart,
 * featureContext). A guide whose tools are all switched off for it (its agent may not use the browser, say) is left out.
 */
export async function spawnAdditions(s: SpawnInfo): Promise<GivenAdditions> {
  const out: GivenAdditions = { instructions: [], notes: [], mcpServers: {}, env: {}, args: [], skillRoots: [], disallowedTools: [], allowedTools: [], strictMcp: false, codexConfig: {}, builtinTools: null };
  if (!deps) return out;
  // A confidential session gets no MCP server but the app's own (server/confidential): connected apps and plugins' servers reach outside.
  // Nor does a browser-only one (Do this here, server/browser/handoff.ts): it has the browser and nothing else.
  const closed = s.extra?.confidential === true || s.extra?.browserOnly === true;
  // The instructions in the capabilities' order, each guide with the tools it is about.
  const texts: { text: string; tools?: string[] }[] = [];
  for (const f of list) {
    try {
      const a = await f.spawn?.(s, deps);
      if (!a) continue;
      texts.push(...(a.instructions ?? []).map((text) => ({ text })), ...(a.guides ?? []).map((g) => ({ text: g.text, tools: g.tools })));
      out.notes.push(...(a.notes ?? []).filter((t) => t.trim()));
      if (!closed) Object.assign(out.mcpServers, a.mcpServers);
      Object.assign(out.env, a.env);
      out.args.push(...(a.args ?? []));
      out.skillRoots.push(...(a.skillRoots ?? []));
      out.disallowedTools.push(...(a.disallowedTools ?? []));
      out.allowedTools.push(...(a.allowedTools ?? []));
      out.strictMcp ||= !!a.strictMcp;
      if (a.builtinTools) out.builtinTools = out.builtinTools ? out.builtinTools.filter((t) => a.builtinTools!.includes(t)) : [...a.builtinTools];
      mergeTables(out.codexConfig, a.codexConfig);
    } catch (e) {
      warn(f, 'spawn', e);
    }
  }
  // The tools switched off, by their short names (the app's own are "mcp__hydor__browser_open" there).
  const off = new Set(out.disallowedTools.map((t) => /^mcp__.+?__(.+)$/.exec(t)?.[1] ?? t));
  out.instructions.push(...texts.filter((x) => x.text.trim() && !(x.tools?.length && x.tools.every((t) => off.has(t)))).map((x) => x.text));
  return out;
}

/**
 * What the capabilities give Custom for a turn: each one's instructions (by its id), its tools' guides, which Custom
 * adds while one of their tools is offered, and what goes with the turn's message (`turn`, when it sent one).
 */
export interface CustomContext {
  parts: { id: string; text: string }[];
  guides: ToolGuide[];
  turn: { id: string; text: string }[];
}

/**
 * Custom's instructions from the capabilities, for its next turn: each one's `context`, or for one
 * without it, the instructions and guides its `spawn` gives every agent. `epoch` counts the times Custom
 * condensed the conversation (memory gives the same block within one); `lean`, a model of a small context, and
 * `window` its size in tokens. With `query`, the message that starts the turn, what each `turnNotes` has for it too.
 */
export async function featureContext(s: { key: string; cwd: string; extra: SessionExtra; runId: string; epoch?: number; lean?: boolean; window?: number; query?: string }): Promise<CustomContext> {
  const out: CustomContext = { parts: [], guides: [], turn: [] };
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
  // After every instruction is made: what goes with the message leaves out what they give (memory's block).
  if (s.query?.trim())
    for (const f of list) {
      if (!f.turnNotes) continue;
      try {
        const t = await f.turnNotes({ key: s.key, cwd: s.cwd, extra: s.extra, window: s.window, lean: s.lean, query: s.query }, deps);
        if (t?.trim()) out.turn.push({ id: f.id, text: t.trim() });
      } catch (e) {
        warn(f, 'turnNotes', e);
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
