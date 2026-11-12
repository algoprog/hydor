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

export const LOADERS: Record<ArgKind, Loader> = {
  session: sessions,
  project: async (c) => ((await c.get<{ spaces?: { id: string; name: string }[] }>('/api/projects'))?.spaces ?? []).map((s) => named(s.id, s.name)),
  agent: async (c) => ((await c.get<{ assistants?: { id: string; name: string }[] }>('/api/assistants'))?.assistants ?? []).map((a) => [a.id, a.name]),
  task: async (c) => ((await c.get<{ tasks?: { id: string; name: string }[] }>('/api/tasks'))?.tasks ?? []).map((t) => [t.id, t.name]),
  app: async (c) => ((await c.get<{ apps?: { slug: string; name: string }[] }>('/api/apps'))?.apps ?? []).map((a) => [a.slug, a.name]),
  run: none,
  page: none,
  skill: skills,
  plugin: plugins,
  mcp: async (c) => ((await c.get<{ servers?: { agent: string; scope: string; name: string }[] }>('/api/setup/mcp'))?.servers ?? []).map((s) => [s.name, `${s.agent === 'claude' ? 'Claude Code' : 'Codex'}${s.scope === 'user' ? '' : `, ${s.scope}`}`]),
  key: async (c) => ((await c.get<{ secrets?: { name: string; domains: string[]; note: string }[] }>('/api/connections'))?.secrets ?? []).map((s) => [s.name, s.domains.join(', ') || s.note]),
  note: notes,
  experiment: none,
  machine: none,
  connection: none,
  account: none,
  setting: none,
  section: none,
  topic: none,
  route: none,
  place: none,
  file: async () => ':files',
  dir: async () => ':dirs',
  text: none,
};
