// The user's own assistants and the settings beside them (how the agents talk to you, where task folders
// go), kept in the kv table. The built-ins come first and cannot be changed, only duplicated.
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { ASSISTANT_ICONS, ASSISTANT_MODES, TOOL_KINDS, upgradeKinds, type AgentOutput, type Assistant, type AssistantMode, type OutputTarget, type ToolKind } from '../../shared/assistants.ts';
import { agentChanges, cleanAgentExamples, type AgentVersionBy } from '../../shared/agent-files.ts';
import { cleanAnswer } from '../../shared/apps.ts';
import { isTier } from '../../shared/tiers.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { BUILTINS } from './builtins.ts';
import { forgetResults } from './results.ts';
import { forgetExampleRuns } from './exampleRuns.ts';
import { agentVersion, forgetVersions, keepVersion } from './versions.ts';

const MINE = 'assistants.mine';
const TONE = 'assistants.tone';
const ROOT = 'assistants.taskRoot';
const CLEAN_UP = 'assistants.cleanUp';

export const DEFAULT_TASK_ROOT = config.taskRoot;
export const MAX_INSTRUCTIONS = 20_000;
export const MAX_TONE = 600;

function mine(db: DB): Assistant[] {
  let list: Assistant[];
  try {
    const v = JSON.parse(kvGet(db, MINE) ?? '[]');
    list = Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
  if (!settled.has(db)) {
    settled.add(db);
    list = keepNewPages(db, list);
    list = splitKinds(db, list);
  }
  return list;
}

/** When the browser and the computer got switches of their own here (ms); agents' versions kept before then are upgraded when brought back. */
const KINDS_SPLIT = 'assistants.kindsSplitAt';

/** Once: agents saved with some switches off get the browser and the computer as upgradeKinds says (they had them before). */
function splitKinds(db: DB, list: Assistant[]): Assistant[] {
  if (kvGet(db, KINDS_SPLIT)) return list;
  let changed = false;
  const out = list.map((a) => {
    if (!a.tools) return a;
    const tools = upgradeKinds(a.tools);
    if (JSON.stringify(tools) === JSON.stringify(a.tools)) return a;
    changed = true;
    const { tools: _old, ...rest } = a;
    return tools ? { ...rest, tools } : rest;
  });
  if (changed) putMine(db, out);
  kvSet(db, KINDS_SPLIT, String(Date.now()));
  return out;
}

/** Its kinds as they are now, for a version kept before the browser and the computer had switches. */
function keptKinds(db: DB, at: number, tools: ToolKind[] | undefined): ToolKind[] | undefined {
  const split = Number(kvGet(db, KINDS_SPLIT) || 0);
  return tools && at < split ? upgradeKinds(tools) : tools;
}

const EACH_NEW = 'assistants.libraryEachNew';
const settled = new WeakSet<DB>();

/**
 * Once: agents saved before a page target could update one page kept making a new page each run, so they keep doing
 * so (each: 'new'); a page target saved since updates the same page unless it says otherwise.
 */
function keepNewPages(db: DB, list: Assistant[]): Assistant[] {
  if (kvGet(db, EACH_NEW) === '1') return list;
  let changed = false;
  const out = list.map((a) => {
    if (!a.output?.to?.some((t) => t.kind === 'library' && !t.each && !t.page)) return a;
    changed = true;
    return { ...a, output: { ...a.output, to: a.output.to.map((t) => (t.kind === 'library' && !t.each && !t.page ? { kind: 'library' as const, each: 'new' as const } : t)) } };
  });
  if (changed) putMine(db, out);
  kvSet(db, EACH_NEW, '1');
  return out;
}

const putMine = (db: DB, list: Assistant[]) => kvSet(db, MINE, JSON.stringify(list));

/** Every assistant: the built-ins, then the user's own. */
export const allAssistants = (db: DB): Assistant[] => [...BUILTINS, ...mine(db)];

export const findAssistant = (db: DB, id: unknown): Assistant | null => (typeof id === 'string' && id ? (allAssistants(db).find((a) => a.id === id) ?? null) : null);

const str = (v: unknown, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);
const names = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => str(x, 120)).filter(Boolean))].slice(0, max) : []);

/** An email address as people type it ("anna@example.org", or "Anna Berg <anna@example.org>"), checked loosely. */
const MAIL = /^[^\s@<>()",;:]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const isMailAddress = (s: string) => {
  const bare = /<([^<>]+)>\s*$/.exec(s)?.[1] ?? s;
  return MAIL.test(bare.trim()) && !/[\r\n]/.test(s);
};

/** A page's id as a target names it; none for anything else. */
const pageId = (v: unknown) => {
  const s = str(v, 80);
  return /^[\w-]+$/.test(s) ? s : undefined;
};

/**
 * Where an agent's results go, checked: paths inside its folder, https addresses, a key's name, email addresses; at
 * most eight, one of each kind but files and webhooks.
 */
function targetsOf(v: unknown): OutputTarget[] {
  if (!Array.isArray(v)) return [];
  const out: OutputTarget[] = [];
  const once = (k: OutputTarget['kind']) => !out.some((t) => t.kind === k);
  for (const t of v.slice(0, 8)) {
    const x = (t ?? {}) as Record<string, unknown>;
    if (x.kind === 'notify' && once('notify')) out.push({ kind: 'notify' });
    else if (x.kind === 'library' && once('library')) {
      const page = pageId(x.page);
      out.push({ kind: 'library', ...(x.each === 'new' ? { each: 'new' as const } : page ? { page } : {}) });
    } else if (x.kind === 'sheet' && once('sheet')) {
      const page = pageId(x.page);
      const tab = str(x.tab, 31).replace(/[[\]:*?/\\]/g, '').trim();
      out.push({ kind: 'sheet', ...(page ? { page } : {}), ...(tab ? { tab } : {}) });
    } else if (x.kind === 'email' && once('email')) {
      const to = [...new Set((Array.isArray(x.to) ? x.to.map(String) : String(x.to ?? '').split(/[,;\n]/)).map((s) => s.trim()).filter(Boolean))];
      if (!to.length) throw new HttpError(400, 'Say who the email goes to: one address or more');
      if (to.length > 20) throw new HttpError(400, 'An email of results goes to at most 20 people');
      const bad = to.find((a) => !isMailAddress(a) || a.length > 200);
      if (bad) throw new HttpError(400, `“${bad.slice(0, 80)}” is not an email address`);
      const subject = str(x.subject, 200).replace(/[\r\n]+/g, ' ');
      const account = str(x.account, 200);
      out.push({ kind: 'email', to, ...(subject ? { subject } : {}), ...(account ? { account } : {}) });
    } else if (x.kind === 'file') {
      const p = str(x.path, 300).replace(/\\/g, '/');
      if (!p || path.isAbsolute(p) || p.split('/').includes('..')) throw new HttpError(400, 'A file it writes to is a path inside the folder it works in, like reports/{date}.md');
      out.push({ kind: 'file', path: p });
    } else if (x.kind === 'webhook') {
      const url = str(x.url, 2000);
      if (!/^https:\/\/[^\s/]+/.test(url)) throw new HttpError(400, 'A webhook it sends to is an https:// address');
      const secret = str(x.secret, 80).toUpperCase();
      if (secret && !/^[A-Z][A-Z0-9_]*$/.test(secret)) throw new HttpError(400, 'A key is named in capitals, like SLACK_WEBHOOK_TOKEN');
      out.push({ kind: 'webhook', url, ...(secret ? { secret } : {}) });
    }
  }
  return out;
}

/** What an agent hands back, checked as an app's answer fields are; none when it names neither fields nor places. */
function outputOf(v: unknown): AgentOutput | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  // Pictures and files are an app's: an agent's result is words, numbers, links, lists and tables.
  const fields = Array.isArray(o.fields) && o.fields.length ? cleanAnswer(o.fields).filter((f) => f.type !== 'media') : [];
  const to = targetsOf(o.to);
  return fields.length || to.length ? { ...(fields.length ? { fields } : {}), ...(to.length ? { to } : {}) } : undefined;
}

/** A monthly budget in dollars, to the cent: none for nothing, zero or less. */
function budgetOf(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) throw new HttpError(400, 'A budget is an amount in dollars a month, up to $100,000');
  const c = Math.round(n * 100) / 100;
  return c > 0 ? c : undefined;
}

/** An agent's examples, checked: a mistake in one is said, as an app's are. */
function examplesOf(v: unknown) {
  const { examples, errors } = cleanAgentExamples(v);
  if (errors.length) throw new HttpError(400, errors.join('; '));
  return examples.length ? examples : undefined;
}

/** An assistant as given by the pages or an import, checked and trimmed (without its id). */
export function cleanAssistant(b: Partial<Record<keyof Assistant, unknown>>): Omit<Assistant, 'id'> {
  const name = str(b.name, 60);
  if (!name) throw new HttpError(400, 'Give the agent a name');
  const instructions = str(b.instructions, MAX_INSTRUCTIONS);
  const agent = b.agent === 'claude' || b.agent === 'codex' || b.agent === 'acp' ? b.agent : undefined;
  const acpAgent = agent === 'acp' ? str(b.acpAgent, 80) || undefined : undefined;
  if (agent === 'acp' && !acpAgent) throw new HttpError(400, 'Pick which agent it suggests');
  const tools = Array.isArray(b.tools) ? TOOL_KINDS.map((k) => k.id).filter((k): k is ToolKind => (b.tools as unknown[]).includes(k)) : undefined;
  const mode = ASSISTANT_MODES.some((m) => m.id === b.mode) ? (b.mode as AssistantMode) : undefined;
  const out: Omit<Assistant, 'id'> = {
    name,
    icon: (ASSISTANT_ICONS as readonly string[]).includes(String(b.icon)) ? String(b.icon) : 'bot',
    description: str(b.description, 160),
    instructions,
    agent,
    acpAgent,
    model: agent ? str(b.model, 200) || undefined : undefined,
    tools: tools && tools.length === TOOL_KINDS.length ? undefined : tools,
    connections: names(b.connections, 50),
    skills: names(b.skills, 30),
    mode,
    folder: b.folder === 'project' ? 'project' : 'task',
    projects: names(b.projects, 50),
    tier: isTier(b.tier) ? b.tier : undefined,
    helperMax: isTier(b.helperMax) ? b.helperMax : undefined,
    canAsk: names(b.canAsk, 30),
    askable: b.askable === false ? false : undefined,
    budgetUsd: budgetOf(b.budgetUsd),
    stepUp: b.stepUp === false ? false : undefined,
    standing: b.standing === true ? true : undefined,
    output: outputOf(b.output),
    examples: examplesOf(b.examples),
    source: str(b.source, 1000) || undefined,
  };
  // Empty lists and unset choices are left out of what is kept.
  for (const k of Object.keys(out) as (keyof typeof out)[]) if (out[k] === undefined || (Array.isArray(out[k]) && !(out[k] as unknown[]).length && k !== 'tools')) delete out[k];
  return out;
}

/** "Bookkeeper" → "bookkeeper-3f9a": readable, and unique without a lookup. */
const newId = (name: string) =>
  `${
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'assistant'
  }-${crypto.randomBytes(2).toString('hex')}`;

/** How a save came about, for the version it keeps: who saved it, and what they said they changed. */
export interface SaveHow {
  by?: AgentVersionBy;
  why?: string;
  /** A project's or an agent's name by its id, for what changed in words. */
  name?: (kind: 'agent' | 'project', id: string) => string;
}

/**
 * Adds an assistant (no id) or changes one of the user's own, and keeps a version of it when what it is changed (who
 * saved it: you unless `how` says). Its examples stay as they were when the save names none.
 */
export function saveAssistant(db: DB, b: Partial<Record<keyof Assistant, unknown>>, how: SaveHow = {}): Assistant {
  const id = typeof b.id === 'string' ? b.id : '';
  if (id && BUILTINS.some((a) => a.id === id)) throw new HttpError(400, 'Built-in agents stay as they are: duplicate one to make it your own');
  const list = mine(db);
  const at = id ? list.findIndex((a) => a.id === id) : -1;
  if (id && at < 0) throw new HttpError(404, 'There is no such agent');
  const prev = at >= 0 ? list[at] : null;
  const a: Assistant = { id: id || newId(str(b.name, 60)), ...cleanAssistant(b.examples === undefined && prev?.examples ? { ...b, examples: prev.examples } : b) };
  // It cannot ask itself.
  if (a.canAsk?.includes(a.id)) {
    a.canAsk = a.canAsk.filter((x) => x !== a.id);
    if (!a.canAsk.length) delete a.canAsk;
  }
  if (at >= 0) list[at] = a;
  else {
    if (list.length >= 200) throw new HttpError(400, 'That is a lot of agents: delete some first');
    list.push(a);
  }
  putMine(db, list);
  const all = [...BUILTINS, ...list];
  keepVersion(db, prev, a, how.by ?? 'you', how.why, how.name ?? ((kind, x) => (kind === 'agent' ? (all.find((y) => y.id === x)?.name ?? x) : x)));
  return a;
}

/**
 * Bring it back: an earlier version of an agent becomes the current one, as a new version that says so. Its examples
 * stay as they are now; agents and projects gone since (`projects`: the ids there are now) are left out.
 */
export function bringBack(db: DB, id: string, n: number, how: SaveHow & { projects: Set<string> }): Assistant {
  const a = findAssistant(db, id);
  if (!a || a.builtin) throw new HttpError(404, 'There is no such agent');
  const v = agentVersion(db, id, n);
  if (!v) throw new HttpError(404, 'There is no such version: only the latest 50 are kept');
  const agents = new Set(allAssistants(db).map((x) => x.id));
  const back = { ...v.agent, tools: keptKinds(db, v.at, v.agent.tools), canAsk: v.agent.canAsk?.filter((x) => agents.has(x)), projects: v.agent.projects?.filter((x) => how.projects.has(x)) };
  const said = agentChanges(a, back, how.name).join(' ');
  return saveAssistant(db, { ...back, id, examples: a.examples ?? [] }, { ...how, why: `Brought back version ${n}.${said ? ` ${said}` : ''}` });
}

export function removeAssistant(db: DB, id: string) {
  if (BUILTINS.some((a) => a.id === id)) throw new HttpError(400, 'Built-in agents cannot be deleted');
  forgetResults(db, id);
  forgetVersions(db, id);
  forgetExampleRuns(db, id);
  // Agents that could ask it no longer can.
  putMine(
    db,
    mine(db)
      .filter((a) => a.id !== id)
      .map((a) => {
        if (!a.canAsk?.includes(id)) return a;
        const { canAsk, ...rest } = a;
        const left = canAsk.filter((x) => x !== id);
        return left.length ? { ...rest, canAsk: left } : rest;
      }),
  );
}

// ---- settings -----------------------------------------------------------------------------------------

/** How the agents talk to you ("plain English, short answers"): added to every agent's instructions. */
export const toneOf = (db: DB): string => kvGet(db, TONE) ?? '';

/** Where new task folders go. */
export const taskRoot = (db: DB): string => kvGet(db, ROOT) || DEFAULT_TASK_ROOT;

/** Whether every agent hears to clean up after a task (on unless turned off). */
export const cleanUpOn = (db: DB): boolean => kvGet(db, CLEAN_UP) !== '0';

const expand = (p: string) => (p === '~' || p.startsWith('~/') ? path.join(os.homedir(), p.slice(1)) : p);

export function setSettings(db: DB, b: { tone?: unknown; taskRoot?: unknown; cleanUp?: unknown }) {
  if (b.tone !== undefined) kvSet(db, TONE, str(b.tone, MAX_TONE));
  if (typeof b.cleanUp === 'boolean') kvSet(db, CLEAN_UP, b.cleanUp ? '1' : '0');
  if (b.taskRoot !== undefined) {
    const p = expand(str(b.taskRoot, 1000));
    if (p && !path.isAbsolute(p)) throw new HttpError(400, 'Give the full path of a folder, like ~/Hydor');
    kvSet(db, ROOT, p ? path.resolve(p) : '');
  }
}
