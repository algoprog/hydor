// Many tools (the app's own server has dozens, and the user's MCP servers add more) crowd a model's
// context and its choices, small models most. Past a threshold the model gets its built-in tools and a
// few of the app's in full, a one-line catalog of the rest, and find_tools, which gives a tool's whole
// description and makes it callable. Tools found stay offered for the rest of the session.
import type { Tool } from './tools.ts';

/** The app's tools offered in full even when the rest wait in the catalog (submit_result: an app run's answer). */
const PINNED = new Set(['web_search', 'read_page', 'show_html', 'remember', 'recall', 'submit_result']);

export interface Offer {
  /** Tools whose schemas the model gets. */
  visible: Tool[];
  /** The others, findable with find_tools. */
  deferred: Tool[];
  /** The catalog's lines for the instructions ('' when nothing waits). */
  catalog: string;
}

const summary = (t: Tool) => {
  const d = t.description.replace(/\s*\(MCP server [^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
  const first = /^(.{12,}?[.!?])(\s|$)/.exec(d)?.[1] ?? d;
  return first.length > 100 ? `${first.slice(0, 97)}…` : first;
};

/** What to show: everything when it fits, else the built-ins, pinned and found tools, and a catalog of the rest. */
export function offer(all: Tool[], o: { window: number; active: string[]; small: boolean; builtin: Set<string> }): Offer {
  const extra = all.filter((t) => !o.builtin.has(t.name));
  const size = extra.reduce((n, t) => n + t.name.length + t.description.length + JSON.stringify(t.parameters ?? {}).length, 0);
  const crowded = extra.length > (o.small ? 8 : 20) || size > o.window * 4 * (o.small ? 0.06 : 0.1);
  if (!crowded) return { visible: all.filter((t) => t.name !== 'find_tools'), deferred: [], catalog: '' };
  const keep = (t: Tool) => o.builtin.has(t.name) || PINNED.has(t.name) || o.active.includes(t.name);
  const visible = all.filter(keep);
  const deferred = all.filter((t) => !keep(t));
  if (!deferred.length) return { visible: visible.filter((t) => t.name !== 'find_tools'), deferred, catalog: '' };
  const catalog = deferred.map((t) => `- ${t.name}: ${summary(t)}`).join('\n');
  return { visible, deferred, catalog };
}

/** Tools matching the words of a query, best first; a word naming a family of tools (browser_…) brings all of it. */
export function search(tools: Tool[], query: string, names: string[] = []): Tool[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 || /\d/.test(w));
  const family = tools.filter((t) => words.some((w) => w.length > 3 && t.name.toLowerCase().replace(/^mcp__\w+?__/, '').startsWith(`${w}_`)));
  const wanted = tools.filter((t) => names.includes(t.name));
  const scored = tools
    .filter((t) => !wanted.includes(t))
    .map((t) => {
      const name = t.name.toLowerCase();
      const desc = t.description.toLowerCase();
      const s = words.reduce((n, w) => n + (name.includes(w) ? 3 : 0) + (desc.includes(w) ? 1 : 0), 0);
      return { t, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const rest = family.length >= 2 ? family.slice(0, 16) : [];
  return [...new Set([...wanted, ...scored.map((x) => x.t).slice(0, 6), ...rest])].slice(0, Math.max(6, wanted.length, rest.length));
}

export const FIND_TOOLS: Tool = {
  name: 'find_tools',
  kind: 'search',
  readOnly: true,
  description: 'Find more tools by what they do (the catalog in your instructions lists them by name). Gives each match’s full description and parameters, and makes it callable from the next step on.',
  parameters: {
    type: 'object',
    properties: { query: { type: 'string', description: 'What you want to do, in a few words' }, names: { type: 'array', items: { type: 'string' }, description: 'Exact tool names from the catalog' } },
  },
  title: (a) => `Find tools: ${a.query ?? (a.names ?? []).join(', ')}`,
  async run(a, ctx) {
    const pool = ctx.catalog?.deferred ?? [];
    if (!pool.length) return { ok: true, output: 'Every tool is already offered to you in full: call it by its name.' };
    const found = search(pool, String(a.query ?? ''), Array.isArray(a.names) ? a.names.map(String) : []);
    if (!found.length) return { ok: false, output: `No tool matches "${a.query ?? ''}". The catalog:\n${pool.map((t) => `- ${t.name}: ${summary(t)}`).join('\n')}` };
    ctx.catalog?.activate(found.map((t) => t.name));
    return {
      ok: true,
      output: `${found.length} tool${found.length > 1 ? 's' : ''}, callable from now on:\n\n${found
        .map((t) => `${t.name}: ${t.description}\nParameters: ${JSON.stringify(t.parameters ?? {})}`)
        .join('\n\n')}`,
    };
  },
};
