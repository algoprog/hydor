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
  app: async (c) => {
    const r = await c.get<{ apps?: { slug: string; name: string }[]; templates?: { id: string; name: string; installed?: boolean }[] }>('/api/apps');
    return [...(r?.apps ?? []).map((a): Candidate => [a.slug, a.name]), ...(r?.templates ?? []).filter((t) => t.installed !== false).map((t): Candidate => [`tpl:${t.id}`, t.name])];
  },
  run: async (c) => ((await c.get<{ recent?: { id: string; appName: string; status: string }[] }>('/api/apps'))?.recent ?? []).map((r): Candidate => [r.id, `${r.appName} · ${r.status}`]),
  page: async (c) => {
    const [pages, media] = await Promise.all([c.get<{ pages?: { id: string; title: string; kind?: string; app?: string }[] }>('/api/pages'), c.get<{ items?: { id: string; title: string; kind: string }[] }>('/api/media')]);
    return [...(pages?.pages ?? []).filter((p) => !p.app).map((p): Candidate => [p.id, `${p.title} · ${p.kind ?? 'page'}`]), ...(media?.items ?? []).map((m): Candidate => [m.id, `${m.title} · ${m.kind}`])];
  },
  skill: none,
  plugin: none,
  mcp: none,
  key: none,
  note: none,
  experiment: none,
  machine: async (c) => ((await c.get<{ machines?: { id: string; name: string }[] }>('/api/machines'))?.machines ?? []).map((m) => named(m.id, m.name)),
  connection: async (c) => ((await c.get<{ connections?: { id: string; name: string }[] }>('/api/connections'))?.connections ?? []).map((x): Candidate => [x.id, x.name]),
  service: async (c) => ((await c.get<{ apps?: { id: string; name: string }[] }>('/api/connections/catalog'))?.apps ?? []).map((x): Candidate => [x.id, x.name]),
  account: async (c) => {
    const r = await c.get<{ claude?: { email?: string }; codex?: { email?: string }; extra?: { id: string; agent: string; name: string }[] }>('/api/accounts');
    if (!r) return [];
    return [['claude', r.claude?.email ?? 'Claude Code'], ['codex', r.codex?.email ?? 'Codex'], ...(r.extra ?? []).map((a): Candidate => [a.id, `${a.name} · ${a.agent}`])] as Candidate[];
  },
  setting: async () => (await import('../settings-table.ts')).ROWS.map((r): Candidate => [r.id, r.label]),
  value: settingValues,
  section: async () => (await import('../settings-table.ts')).SECTION_LIST.map((s): Candidate => [s.id, s.label]),
  topic: none,
  route: none,
  place: none,
  file: async () => ':files',
  dir: async () => ':dirs',
  text: none,
};
