// `judge.json`: the one file the judge trusts from a builder, and only for where things are (an address, an environment variable, a key in some JSON).
// Everything else the judge concludes by trying the app. ACCEPTANCE.md says the same to the builders, in words; this is the same thing as types and a reader.
import { sameName, slug } from './lib.ts';
import type { Send } from './http.ts';

export interface FieldDecl {
  /** The key the app uses for the field in the JSON it takes and gives. */
  key: string;
  /** For a field that is one of a few words: the words the app takes, as a list, or as the maker's word and the app's ({"grade 1 to 3": "grade_1_to_3"}). */
  choices?: string[] | Record<string, string>;
  /** For a field the maker did not name that the app asks for anyway (a required email, say): a value to send in every row instead of the judge's own. */
  example?: unknown;
}

/** How one row is read, changed or removed: a method (at the row's address), or a method and an address of its own. */
export type OpDecl = string | { method?: string; path?: string };

export interface ThingDecl {
  list?: { path: string; rows?: string };
  add?: { path: string; method?: string; send?: 'json' | 'form' };
  one?: { path: string; read?: OpDecl; change?: OpDecl; remove?: OpDecl };
  /** For a kind whose rows belong to a team: the key the team's id goes under when a row is added. */
  teamKey?: string;
  idKey?: string;
  fields?: Record<string, string | FieldDecl>;
}

export interface OutputDecl {
  path: string;
  /** For a list in the answer: the key of each part in one item of it. */
  item?: Record<string, string>;
}

export interface ActionDecl {
  path: string;
  method?: string;
  send?: Send;
  input?: Record<string, string | FieldDecl>;
  output?: Record<string, string | OutputDecl>;
}

export interface Step {
  method?: string;
  path: string;
  send?: 'json' | 'form';
  body?: Record<string, string>;
  /** For a step that makes something (a team): where its id is in the JSON answer. */
  id?: string;
  /** For a step that makes a link (an invitation): where the link, or its token, is in the JSON answer. */
  link?: string;
}

export interface JudgeJson {
  version: 1;
  build?: string;
  start: {
    command: string;
    port: string;
    data: string;
    env?: Record<string, string>;
    judgeEnv?: Record<string, string>;
    ready?: string;
    secrets?: string[];
    browserFolders?: string[];
  };
  accounts?: {
    signUp: Step;
    signIn: Step;
    session?: 'cookie' | { token: string; header: string; prefix?: string };
    /** How the first person (the owner) gives another person a role: `{email}` and `{role}` in the body. */
    grant?: Step;
    /** The maker's word for a role, and the app's, where they differ ({ "treasurer": "finance" }). */
    roles?: Record<string, string>;
  };
  /** How the app is told that a person has paid: the payment service's call, reduced to "this person paid for this month". The judge sets the shared secret in the environment variable `secretEnv` and sends it in the header or the body key given. */
  payments?: { path: string; method?: string; send?: 'json' | 'form'; body: Record<string, string>; secretEnv: string; secretHeader?: string; secretField?: string };
  /** A tool of teams: how a person makes a team, invites someone into it by a link with a role, and takes someone out. `{name}`, `{team}`, `{email}`, `{role}` in the bodies. */
  teams?: { create: Step; invite: Step; remove: Step; accept?: { method?: string; path?: string }; roles?: Record<string, string> };
  /** The addresses of public pages, with `{slug}`, `{q}`, `{category}` and `{date}` where they go. */
  site?: { article?: string; search?: string; category?: string; slots?: string };
  /** Where free slots are read as JSON (`{date}` in the path), the key of the list in the answer and of the time in each item. */
  slots?: { path: string; rows?: string; time?: string };
  home?: string;
  money?: 'units' | 'cents';
  things?: Record<string, ThingDecl>;
  actions?: Record<string, ActionDecl>;
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Reads `judge.json`. Gives it, or the sentences that say what is wrong with it (the judge's first line says them). */
export function readJudgeJson(text: string | null): { json: JudgeJson } | { problems: string[] } {
  if (text === null) return { problems: ['there is no judge.json in the app\'s folder'] };
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { problems: [`judge.json is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const problems: string[] = [];
  if (!isObject(raw)) return { problems: ['judge.json is not an object'] };
  if (raw.version !== 1) problems.push('"version" must be 1');
  const start = raw.start;
  if (!isObject(start)) problems.push('"start" is missing: how to start the app in production');
  else {
    for (const key of ['command', 'port', 'data'] as const) if (!isText(start[key])) problems.push(`"start.${key}" is missing`);
    for (const key of ['env', 'judgeEnv'] as const) if (start[key] !== undefined && !(isObject(start[key]) && Object.values(start[key]).every((v) => typeof v === 'string'))) problems.push(`"start.${key}" must be names with text values`);
    for (const key of ['secrets', 'browserFolders'] as const) if (start[key] !== undefined && !(Array.isArray(start[key]) && start[key].every((v: unknown) => typeof v === 'string'))) problems.push(`"start.${key}" must be a list of text`);
  }
  if (raw.build !== undefined && typeof raw.build !== 'string') problems.push('"build" must be a command as text');
  if (raw.accounts !== undefined) {
    const a = raw.accounts;
    for (const key of ['signUp', 'signIn'] as const) if (!isObject(a?.[key]) || !isText(a[key].path)) problems.push(`"accounts.${key}" needs a "path"`);
    const s = a?.session;
    if (s !== undefined && s !== 'cookie' && !(isObject(s) && isText(s.token) && isText(s.header))) problems.push('"accounts.session" is "cookie" or { "token": <path in the answer>, "header": <name> }');
  }
  if (raw.home !== undefined && !isText(raw.home)) problems.push('"home" must be an address');
  if (raw.money !== undefined && raw.money !== 'units' && raw.money !== 'cents') problems.push('"money" is "units" or "cents"');
  for (const [name, t] of Object.entries<any>(raw.things ?? {})) {
    if (!isObject(t)) problems.push(`things.${name} must be an object`);
    else if (t.list !== undefined && !isText(t.list?.path)) problems.push(`things.${name}.list needs a "path"`);
    else if (t.add !== undefined && !isText(t.add?.path)) problems.push(`things.${name}.add needs a "path"`);
    else if (t.one !== undefined && !isText(t.one?.path)) problems.push(`things.${name}.one needs a "path"`);
  }
  for (const [name, a] of Object.entries<any>(raw.actions ?? {})) if (!isObject(a) || !isText(a.path)) problems.push(`actions.${name} needs a "path"`);
  return problems.length > 0 ? { problems } : { json: raw as JudgeJson };
}

/** The method and the address of one way of reaching a row, as judge.json says it. */
export function opOf(one: ThingDecl['one'], op: 'read' | 'change' | 'remove'): { method: string; path: string } | undefined {
  const d = one?.[op];
  if (!one || d === undefined) return undefined;
  if (typeof d === 'string') return { method: d, path: one.path };
  return { method: d.method ?? (op === 'read' ? 'GET' : op === 'change' ? 'PATCH' : 'DELETE'), path: d.path ?? one.path };
}

export const fieldDecl = (d: string | FieldDecl | undefined): FieldDecl | undefined => (d === undefined ? undefined : typeof d === 'string' ? { key: d } : d);

/** The shortest spelling that is looked for inside a longer name ("what they would want to fire" holds "wanttofire"): shorter spellings ("number", "name") are too common to be found inside names. */
const INSIDE = 7;
const EXACT = 1000;

/** How well a name the builder gave says the thing the maker calls `id` (or a spelling in `names`): EXACT when it is the same name (capitals, spaces, a plural do not matter), else the length of the longest spelling found
 *  inside it, else 0. Every spelling the plan lists, the maker's own words included, is accepted exactly. */
export function nameFit(given: string, id: string, names: string[]): number {
  if ([id, ...names].some((n) => sameName(n, given))) return EXACT;
  const s = slug(given);
  return Math.max(0, ...[id, ...names].map((n) => (slug(n).length >= INSIDE && s.includes(slug(n)) ? slug(n).length : 0)));
}

export const accepts = (given: string, id: string, names: string[]): boolean => nameFit(given, id, names) > 0;

/** The declaration whose name is the maker's word (or one of the spellings the plan allows, or one that holds a long spelling): the same name first, else the one that holds the longest spelling, and none when two hold equally long ones. */
export function declared<T>(table: Record<string, T> | undefined, id: string, names: string[]): { name: string; value: T } | undefined {
  const fits = Object.entries(table ?? {}).map(([name, value]) => ({ name, value, fit: nameFit(name, id, names) })).filter((x) => x.fit > 0);
  if (fits.length === 0) return undefined;
  const best = Math.max(...fits.map((x) => x.fit));
  const top = fits.filter((x) => x.fit === best);
  return best === EXACT || top.length === 1 ? { name: top[0]!.name, value: top[0]!.value } : undefined;
}

/** `{id}` in an address is the row's id; `:id` and `<id>` are read the same way. */
export const withId = (path: string, id: string): string => path.replace(/\{id\}|:id\b|<id>/g, encodeURIComponent(id));

export const fill = (text: string, values: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (whole, name: string) => values[name] ?? whole);
