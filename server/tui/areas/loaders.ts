// What Tab completion lists for each kind of argument (kit.ts ArgKind), from the running Hydor: one loader a kind,
// each asking the API itself (`c.get`, which is capped at 700 ms and gives null when the server is slow or down).
// A kind whose loader is `none` completes nothing yet: the area that uses it fills it in, in its own line here.
import type { SessionSummary } from '../../../shared/types.ts';
import { makePaint } from '../term.ts';
import type { ArgKind } from './kit.ts';

/** One candidate: its value and what it is. */
export type Candidate = [value: string, desc?: string];

/** What a loader may give: candidates, or one of the shell's own completions (folders, files). */
export type Loaded = Candidate[] | ':dirs' | ':files';

export interface LoadCtx {
  /** Reads the server's API (a GET): null when it fails or is slow. */
  get<T>(path: string): Promise<T | null>;
  /** The word under the cursor. */
  cur: string;
  /** The options on the line, by long name, with their values. */
  opts: Map<string, string | undefined>;
  /** The verb's words before the cursor. */
  args: string[];
}

export type Loader = (c: LoadCtx) => Promise<Loaded>;

const none: Loader = async () => [];

/** A value to type for a thing with an id and a name: its name when it is one word, else its id (the other is the description). */
export function named(id: string, name: string | undefined): Candidate {
  return name && /^[\w.-]+$/.test(name) ? [name, id] : [id, name];
}

/** Sessions as `hydor sessions` shows them: the short key, with the title and what it is doing. */
async function sessions(c: LoadCtx): Promise<Loaded> {
  const r = await c.get<{ sessions?: SessionSummary[] }>('/api/sessions?limit=40');
  const list = (r?.sessions ?? []).filter((s) => !s.extra?.parent);
  if (!list.length) return [];
  const { keyLength, shortKey, statusWord } = await import('../commands.ts');
  const n = keyLength(list);
  const plain = makePaint(false);
  const cut = (s: string) => (s.length > 60 ? `${s.slice(0, 59)}…` : s);
  return list.map((s) => [shortKey(s, n), [cut((s.title || s.firstPrompt || '(untitled)').replace(/\s+/g, ' ')), statusWord(s, plain)].filter(Boolean).join(' · ')]);
}

/** Skills: the library's, or with --agent claude|codex that agent's own. */
async function skills(c: LoadCtx): Promise<Loaded> {
  const agent = c.opts.get('agent');
  if (agent === 'claude' || agent === 'codex') {
    const r = await c.get<{ skills?: { agent: string; name: string; description: string }[] }>('/api/setup/skills');
    return (r?.skills ?? []).filter((s) => s.agent === agent).map((s) => [s.name, s.description]);
  }
  const r = await c.get<{ skills?: { name: string; description: string }[] }>('/api/skillpack');
  return (r?.skills ?? []).map((s) => [s.name, s.description]);
}

/** Plugins: Hydor's, or with --agent claude|codex that agent's own (name@marketplace). */
async function plugins(c: LoadCtx): Promise<Loaded> {
  const agent = c.opts.get('agent');
  if (agent === 'claude' || agent === 'codex') {
    const r = await c.get<{ installed?: { id: string; description?: string }[] }>(agent === 'claude' ? '/api/setup/plugins' : '/api/setup/codex-plugins');
    return (r?.installed ?? []).map((x) => [x.id, x.description]);
  }
  const r = await c.get<{ installed?: { name: string; title: string }[]; available?: { name: string; title: string }[] }>('/api/plugins');
  return [...(r?.installed ?? []), ...(r?.available ?? [])].map((x) => [x.name, x.title]);
}

/** Memory notes, by number, with the start of their text. */
async function notes(c: LoadCtx): Promise<Loaded> {
  const r = await c.get<{ entries?: { id: number; text: string; scope: string; kind: string }[] }>('/api/memory/entries');
  return (r?.entries ?? [])
    .filter((e) => !(e.kind === 'profile' && e.scope === 'global'))
    .slice(0, 40)
    .map((e) => [String(e.id), e.text.replace(/\s+/g, ' ').slice(0, 60)]);
}

/** What follows `hydor settings set <option> `: on and off for a switch, a choice's values (a model's, asked from the server). */
async function settingValues(c: LoadCtx): Promise<Loaded> {
  const t = await import('../settings-table.ts');
  let row;
  try {
    row = t.findRow(c.args[0] ?? '');
  } catch {
    return [];
  }
  if (row.kind === 'switch' || row.device?.key === 'suggestions') return [['on'], ['off']];
  if (row.kind !== 'choice' && row.kind !== 'list' && !row.device) return [];
  const api = (async (_method: string, p: string) => {
    const r = await c.get(p);
    if (r === null) throw new Error('not answered');
    return r;
  }) as never;
  return (await t.choicesOf({ api }, row)).map((x): Candidate => [x.value, x.label === x.value ? undefined : x.label]);
}

export const LOADERS: Record<ArgKind, Loader> = {
  session: sessions,
  project: async (c) => ((await c.get<{ spaces?: { id: string; name: string }[] }>('/api/projects'))?.spaces ?? []).map((s) => named(s.id, s.name)),
  agent: async (c) => ((await c.get<{ assistants?: { id: string; name: string }[] }>('/api/assistants'))?.assistants ?? []).map((a) => [a.id, a.name]),
  task: async (c) => ((await c.get<{ tasks?: { id: string; name: string }[] }>('/api/tasks'))?.tasks ?? []).map((t) => [t.id, t.name]),
  app: async (c) => ((await c.get<{ apps?: { slug: string; name: string }[] }>('/api/apps'))?.apps ?? []).map((a) => [a.slug, a.name]),
  run: none,
  // The first word of `hydor open`: the app's pages by name, and the words that take another, then sessions.
  page: async (c) => {
    const { pageWords } = await import('./open.ts');
    const found = await sessions(c);
    return [...pageWords(), ...(typeof found === 'string' ? [] : found)];
  },
  skill: skills,
  plugin: plugins,
  mcp: async (c) => ((await c.get<{ servers?: { agent: string; scope: string; name: string }[] }>('/api/setup/mcp'))?.servers ?? []).map((s) => [s.name, `${s.agent === 'claude' ? 'Claude Code' : 'Codex'}${s.scope === 'user' ? '' : `, ${s.scope}`}`]),
  key: async (c) => ((await c.get<{ secrets?: { name: string; domains: string[]; note: string }[] }>('/api/connections'))?.secrets ?? []).map((s) => [s.name, s.domains.join(', ') || s.note]),
  note: notes,
  experiment: async (c) =>
    ((await c.get<{ runs?: { id: string; name?: string; command: string; status: string }[] }>('/api/experiments/runs?limit=40'))?.runs ?? []).map((r) => [
      r.id,
      `${r.name || r.command.replace(/\s+/g, ' ').slice(0, 40)} · ${r.status}`,
    ]),
  machine: none,
  connection: none,
  account: none,
  setting: async () => (await import('../settings-table.ts')).ROWS.map((r): Candidate => [r.id, r.label]),
  value: settingValues,
  'settings-section': async () => (await import('../settings-table.ts')).SECTION_LIST.map((s): Candidate => [s.id, s.label]),
  topic: async (c) => ((await c.get<{ topics?: { id: string; title: string }[] }>('/api/guide'))?.topics ?? []).filter((t) => t.id !== 'api').map((t) => [t.id, t.title]),
  // The sections of the topic named before it.
  section: async (c) => {
    const topic = (await c.get<{ topics?: { id: string; title: string; sections: { id: string; title: string }[] }[] }>('/api/guide'))?.topics?.find((t) => t.id === c.args[0]);
    return (topic?.sections ?? []).map((s) => [s.id, s.title]);
  },
  // The endpoints of the API, from its guide topic: a method first, then the paths of that method (GET without one).
  route: async (c) => {
    const { apiRoutes, METHODS } = await import('./api.ts');
    const routes = await apiRoutes();
    const method = c.args[0]?.toUpperCase();
    if (c.args.length === 1 && !METHODS.includes(method)) return [];
    if (c.args.length > 1) return [];
    const wanted = c.args.length === 1 ? method : 'GET';
    const seen = new Set<string>();
    const paths = routes.filter((r) => r.method === wanted && !seen.has(r.path) && seen.add(r.path)).map((r): Candidate => [r.path, r.desc]);
    return c.args.length === 0 && !c.cur.startsWith('/') ? [...METHODS.map((m): Candidate => [m, 'Call with this method']), ...paths] : paths;
  },
  // The second word of `hydor open`: what follows settings, guide or project.
  place: async (c) => {
    const first = c.args[0]?.toLowerCase();
    if (first === 'settings') return (await import('./open.ts')).settingsSections().map((s) => [s.id, s.label]);
    if (first === 'guide') return c.args.length === 1 ? LOADERS.topic(c) : LOADERS.section({ ...c, args: [c.args[1]] });
    if (first === 'project') return LOADERS.project(c);
    return [];
  },
  file: async () => ':files',
  dir: async () => ':dirs',
  text: none,
};
