// An agent's versions, its examples and its file. Shared by the server (server/assistants/versions.ts, examples.ts,
// agentFile.ts) and the agent's page (its Versions, its Examples, Install from a file).
//
// Versions: each save that changes what an agent is keeps a version, with who saved it and what changed, in sentences.
// Its examples are not part of a version: bringing an old version back keeps the examples it has now.
//
// Examples: a message to the agent and what its answer must do. A check is a plain sentence the helper model reads the
// answer against ("It names at least three papers"), or, as an app's check is, a rule on what it gave
// ("{{result.total}} > 0", "{{reply}} contains Lisbon").
//
// Its file (.hydor-agent): JSON with a format version, what it is and does, its team by name, its schedules as
// suggestions and its examples; never the keys, tokens, addresses or ids of the person who made it.
import { readRule } from './app-manifest.ts';
import { TOOL_KINDS, type Assistant, type OutputTarget } from './assistants.ts';
import type { TaskSchedule } from './automations.ts';
import { tierLabel } from './tiers.ts';

// ---- examples ------------------------------------------------------------------------------------------------

export interface AgentExample {
  id: string;
  /** Its name in the list (unset: the start of its message). */
  name?: string;
  /** The message it is tried with, as you would write it. */
  message: string;
  /** What its answer must do: plain sentences, or rules on {{reply}} and {{result.field}}. */
  checks?: string[];
}

export const AGENT_EXAMPLE_LIMITS = { examples: 10, checks: 8, message: 8000, check: 400 };

/** A check written as a rule on what it gave ({{reply}}, {{result.field}}), not a sentence. */
export const isRuleCheck = (c: string) => /\{\{/.test(c);

const text = (v: unknown, max: number) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

/** "Weekly report for May" → "weekly-report-for-may", not taken yet. */
function freeId(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
      .replace(/^[^a-z]+/, '') || 'example';
  for (let n = 1; ; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** An agent's examples, from anything: each with an id of its own, a message, and its checks (rules that read). */
export function cleanAgentExamples(raw: unknown): { examples: AgentExample[]; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { examples: [], errors };
  if (!Array.isArray(raw)) return { examples: [], errors: ['Examples are a list of { name?, message, checks? }'] };
  if (raw.length > AGENT_EXAMPLE_LIMITS.examples) errors.push(`An agent has at most ${AGENT_EXAMPLE_LIMITS.examples} examples`);
  const taken = new Set<string>();
  const out: AgentExample[] = [];
  for (const x of raw.slice(0, AGENT_EXAMPLE_LIMITS.examples) as Record<string, unknown>[]) {
    if (!x || typeof x !== 'object') continue;
    const name = text(x.name, 80);
    const message = String(x.message ?? '').trim();
    if (!message) {
      errors.push(`Example “${name || out.length + 1}” has no message to try it with`);
      continue;
    }
    if (message.length > AGENT_EXAMPLE_LIMITS.message) errors.push(`Example “${name || out.length + 1}”: its message is longer than ${AGENT_EXAMPLE_LIMITS.message} characters`);
    const id = typeof x.id === 'string' && /^[a-z][\w-]{0,39}$/i.test(x.id) && !taken.has(x.id) ? x.id : freeId(name || message.slice(0, 30), taken);
    taken.add(id);
    const checks = (Array.isArray(x.checks) ? x.checks : [])
      .map((c) => text(c, AGENT_EXAMPLE_LIMITS.check))
      .filter(Boolean)
      .slice(0, AGENT_EXAMPLE_LIMITS.checks);
    for (const c of checks) {
      if (!isRuleCheck(c)) continue;
      const r = readRule(c);
      if ('error' in r) errors.push(`Example “${name || id}”, its check “${c}”: ${r.error}`);
    }
    out.push({ id, ...(name ? { name } : {}), message: message.slice(0, AGENT_EXAMPLE_LIMITS.message), ...(checks.length ? { checks } : {}) });
  }
  return { examples: out, errors };
}

/** An example's name for the list: its own, or the start of its message. */
export const exampleName = (e: Pick<AgentExample, 'name' | 'message'>) => e.name || (e.message.length > 60 ? `${e.message.slice(0, 57).trimEnd()}…` : e.message);

/** How one check went on a try. */
export interface AgentCheck {
  check: string;
  ok: boolean;
  /** Why it holds or not, in a line (the helper model's, or what a rule saw). */
  why?: string;
}

/** One try of an example: a throwaway session started as the agent, and how its checks went. */
export interface AgentExampleRun {
  id: string;
  example: string;
  /** The agent's version it ran with. */
  version: number;
  /** The session it ran in. */
  key?: string;
  /** running; waiting (for you, in its session); judging (its checks being read); passed; failed (a check did not hold); error (it did not finish). */
  status: 'running' | 'waiting' | 'judging' | 'passed' | 'failed' | 'error';
  reply?: string;
  /** What it handed back, for an agent with fields. */
  result?: Record<string, unknown>;
  checks?: AgentCheck[];
  error?: string;
  /** What its session spent, in dollars. */
  costUsd?: number;
  startedAt: number;
  endedAt?: number;
}

/** What trying an agent's examples comes to, said before it runs. */
export interface ExampleEstimate {
  /** How many examples it tries. */
  count: number;
  /** The tier it thinks with (none: Automatic). */
  tier?: string;
  /** About what each try costs, in dollars, and from what: its last tries, or its sessions this month. */
  perRun?: number;
  from?: 'tries' | 'sessions';
  /** About what all of them cost. */
  total?: number;
  /** What is left of its monthly budget, when it has one. */
  budgetLeft?: number;
}

/** GET /api/assistants/:id/examples: the latest try of each example, what a try costs, and whether it changed since. */
export interface AgentExamplesState {
  runs: AgentExampleRun[];
  estimate: ExampleEstimate;
  /** The version its examples were last tried with, when that is not the one it has now. */
  changedSince?: number;
  version: number;
}

// ---- versions ----------------------------------------------------------------------------------------------

/** Who saved a version: you (on its page, in All settings, the command line), an agent (through the app's API), the draft that made it, a file installed, a Claude Code file imported, or what it was before versions were kept. */
export type AgentVersionBy = 'you' | 'agent' | 'draft' | 'install' | 'import' | 'before';

export const VERSION_BY: Record<AgentVersionBy, string> = {
  you: 'You',
  agent: 'An agent',
  draft: 'Drafted',
  install: 'Installed',
  import: 'Imported',
  before: 'Before versions were kept',
};

/** How many versions each agent keeps: the newest. */
export const VERSIONS_KEEP = 50;

export interface AgentVersion {
  n: number;
  at: number;
  by: AgentVersionBy;
  /** What changed, in sentences (or what the agent said it did). */
  line: string;
  /** How its examples went with it: those tried with it, the latest try of each. */
  examples?: { tried: number; passed: number };
}

/** What an agent is, for its versions: everything but its id, where it came from and its examples. */
export function agentCore(a: Partial<Assistant>): Partial<Assistant> {
  const { id: _id, builtin: _b, source: _s, examples: _e, ...core } = a;
  return core;
}

const same = (x: unknown, y: unknown) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const added = (a: string[] = [], b: string[] = []) => b.filter((x) => !a.includes(x));
const quoted = (s: string) => `“${s.length > 80 ? `${s.slice(0, 77)}…` : s}”`;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

const MODES: Record<string, string> = { ask: 'Ask', edits: 'Accept edits', full: 'Full access', plan: 'Plan' };

/** A program in words. */
export const programName = (a: Pick<Assistant, 'agent' | 'acpAgent'>): string =>
  !a.agent ? 'the one picked on the start page' : a.agent === 'claude' ? 'Claude Code' : a.agent === 'codex' ? 'Codex' : a.acpAgent === 'console' ? 'Custom' : (a.acpAgent ?? 'another agent');

/** What each kind of tool lets it do, as words after "It may". */
export const TOOL_VERBS: Record<string, string> = {
  read: 'read files',
  edit: 'create and change files',
  run: 'run commands',
  web: 'use the web',
  browser: 'use a browser',
  computer: 'use the computer',
  mcp: 'use other tools',
};

/** A place results go, in a few words. */
export function placeName(t: OutputTarget): string {
  if (t.kind === 'library') return t.each === 'new' ? 'a new page each run' : 'a page, updated';
  if (t.kind === 'sheet') return 'a row in a spreadsheet';
  if (t.kind === 'email') return t.to?.length ? `an email to ${t.to.join(', ')}` : 'an email';
  if (t.kind === 'file') return `the file ${t.path}`;
  if (t.kind === 'webhook') return 'a webhook';
  return 'a notification';
}

/**
 * What changed from one version of an agent to the next, in sentences: "It thinks with Best now (it was Quick)." The
 * instructions say only that they changed (the page shows them side by side). `name` turns an agent's or a project's id
 * into its name.
 */
export function agentChanges(before: Partial<Assistant>, after: Partial<Assistant>, name: (kind: 'agent' | 'project', id: string) => string = (_k, id) => id): string[] {
  const out: string[] = [];
  const b = agentCore(before);
  const a = agentCore(after);
  if (!same(b.name, a.name)) out.push(`Its name went from ${quoted(b.name ?? '')} to ${quoted(a.name ?? '')}.`);
  if (!same(b.description, a.description)) out.push(a.description ? `Its line is now ${quoted(a.description)}.` : 'Its line was cleared.');
  if (!same(b.icon, a.icon)) out.push('Its icon changed.');
  if (!same(b.instructions, a.instructions)) out.push(a.instructions ? (b.instructions ? 'Its instructions changed.' : 'It has instructions now.') : 'Its instructions were cleared.');
  if (!same(b.agent, a.agent) || !same(b.acpAgent, a.acpAgent)) out.push(`It suggests ${programName(a)} now (it was ${programName(b)}).`);
  if (!same(b.model, a.model)) out.push(a.model ? `It suggests the model ${a.model} now${b.model ? ` (it was ${b.model})` : ''}.` : 'It suggests no model now.');
  if (!same(b.tier, a.tier)) out.push(`It thinks with ${tierLabel(a.tier)} now (it was ${tierLabel(b.tier)}).`);
  if (!same(b.helperMax, a.helperMax)) out.push(a.helperMax ? `The helpers it starts go up to ${tierLabel(a.helperMax)} now.` : 'The helpers it starts may have any tier now.');
  if (!same(b.tools, a.tools)) {
    const all = TOOL_KINDS.map((k) => k.id);
    const was = b.tools ?? all;
    const now = a.tools ?? all;
    const word = (id: string) => TOOL_VERBS[id] ?? id;
    const on = added(was, now).map(word);
    const off = added(now, was).map(word);
    if (on.length) out.push(`It may ${list(on)} now.`);
    if (off.length) out.push(`It may no longer ${list(off)}.`);
  }
  if (!same(b.mode, a.mode)) out.push(a.mode ? `Its permission mode is ${MODES[a.mode] ?? a.mode} now${b.mode ? ` (it was ${MODES[b.mode] ?? b.mode})` : ''}.` : 'It keeps the permission mode picked on the start page now.');
  if (!same(b.folder ?? 'task', a.folder ?? 'task')) out.push(a.folder === 'project' ? 'Its sessions start in the folder on the start page now.' : 'Its sessions start in a new task folder now.');
  if (!same(b.projects, a.projects)) out.push(a.projects?.length ? `It works in ${list(a.projects.map((p) => name('project', p)))} now.` : 'It works everywhere now.');
  const conOn = added(b.connections, a.connections);
  const conOff = added(a.connections, b.connections);
  if (conOn.length) out.push(`${list(conOn)} ${conOn.length === 1 ? 'is' : 'are'} on in its sessions now.`);
  if (conOff.length) out.push(`${list(conOff)} ${conOff.length === 1 ? 'is' : 'are'} no longer on in its sessions.`);
  const skOn = added(b.skills, a.skills);
  const skOff = added(a.skills, b.skills);
  if (skOn.length) out.push(`It favors ${list(skOn)} now.`);
  if (skOff.length) out.push(`It no longer favors ${list(skOff)}.`);
  const askOn = added(b.canAsk, a.canAsk).map((x) => name('agent', x));
  const askOff = added(a.canAsk, b.canAsk).map((x) => name('agent', x));
  if (askOn.length) out.push(`It may hand work to ${list(askOn)} now.`);
  if (askOff.length) out.push(`It no longer hands work to ${list(askOff)}.`);
  if (!same(b.askable, a.askable)) out.push(a.askable === false ? 'Other agents may no longer hand it work.' : 'Other agents may hand it work again.');
  if (!same(b.budgetUsd, a.budgetUsd)) out.push(a.budgetUsd ? `Its monthly budget is ${money(a.budgetUsd)} now${b.budgetUsd ? ` (it was ${money(b.budgetUsd)})` : ''}.` : 'It has no monthly budget now.');
  if (!same(b.stepUp, a.stepUp)) out.push(a.stepUp === false ? 'A helper that fails a check is no longer run again a tier up.' : 'A helper that fails a check is run again a tier up now.');
  if (!same(b.standing, a.standing)) out.push(a.standing ? 'It keeps one conversation of its own now, with an inbox.' : 'It no longer keeps a conversation of its own.');
  if (!same(b.output?.fields, a.output?.fields)) out.push(a.output?.fields?.length ? `It hands back ${list(a.output.fields.map((f) => f.label))} now.` : 'It hands back its reply now.');
  if (!same(b.output?.to, a.output?.to)) out.push(a.output?.to?.length ? `Its results go to ${list(a.output.to.map(placeName))} now.` : 'Its results go nowhere but the conversation now.');
  return out;
}

// ---- its file ----------------------------------------------------------------------------------------------

/** What the file is: the word in its "hydor" field, and the format version this Hydor writes and reads. */
export const AGENT_FILE_KIND = 'agent';
/** 2 (0.72.0): the browser and the computer are kinds of tools of their own (format 1 had them with the web and every agent). */
export const AGENT_FILE_FORMAT = 2;
export const AGENT_FILE_EXT = '.hydor-agent';
/** The largest agent file read. */
export const AGENT_FILE_MAX = 512 * 1024;

/** A schedule an agent's file suggests: what it runs on and the message each run starts with. */
export interface SuggestedSchedule {
  name: string;
  schedule: TaskSchedule;
  task: string;
}

/** An agent as a file (.hydor-agent). */
export interface AgentFile {
  hydor: typeof AGENT_FILE_KIND;
  /** The file's format version (AGENT_FILE_FORMAT when it was written). */
  format: number;
  /** The Hydor version that wrote it. */
  app?: string;
  exportedAt?: string;
  /** What it is and does: its settings, without anything of the person's own. */
  agent: Partial<Assistant>;
  /** The agents it hands work to, by name: matched by name where it is installed. */
  team?: string[];
  /** Its schedules, as suggestions: added paused where it is installed, if you choose to. */
  schedules?: SuggestedSchedule[];
  examples?: AgentExample[];
  /** What was left out and has to be set again where it is installed, in plain words. */
  leftOut?: string[];
}

/** The file's name: the agent's, made safe for any computer. */
export const agentFileName = (a: Pick<Assistant, 'name'>) =>
  `${
    a.name
      .replace(/[\\/:*?"<>|\n\r]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'agent'
  }${AGENT_FILE_EXT}`;

/** Schedules that travel in a file: by the clock only (a watcher, a webhook or a date are the person's own). */
export const portableSchedule = (s: TaskSchedule): boolean => s.kind === 'daily' || s.kind === 'every' || s.kind === 'cron';

/** What installing a file would do: shown on its card before anything is saved. */
export interface AgentInstallPreview {
  /** The agent as it would be saved. */
  agent: Partial<Assistant>;
  /** What it brings, in plain words. */
  brings: string[];
  /** What it needs from you before it works as it did, in plain words. */
  needs: string[];
  /** Notes on what changed on the way in (a newer file, something not understood). */
  notes: string[];
  /** Its team: the agents it hands work to, found here or not. */
  team: { name: string; found?: string }[];
  schedules: SuggestedSchedule[];
  examples: AgentExample[];
  /** One of yours with the same name, which it would replace if you choose to. */
  clash?: { id: string; name: string };
  /** The name it gets beside yours when it does not replace it. */
  beside: string;
  /** The file comes from a newer Hydor. */
  newer?: boolean;
}
