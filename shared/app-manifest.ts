// Apps with steps: the format of a flow (what an app does, step by step, and what each step hands the
// next), tidying one from anything (a form, an agent, the API), its checks in plain words, values put
// into text, and the rules that decide. The server runs flows (server/apps/flow.ts); the pages show and
// edit them. A recipe without a flow is the simplest app: one agent step that does the task in its
// prompt (flowOf shows it as one), which is what every template is.
//
// Order is the order of the steps, as an Unreal Blueprint's white wires: one after another, the paths of
// a Decide, the body of a Repeat, the branches of At the same time. Values travel by reference, as its
// coloured wires: {{inputs.city}} (or {{city}}, as in a one-step app's task), {{find.hotels}},
// {{find.hotels[0].price}}, {{find.hotels[-1]}} (the last), and in a Repeat {{item}} and {{index}}.
// Sections work as in a task: {{#x}}…{{/x}} keeps its text only when x has a value, {{^x}}…{{/x}} only
// when it has none. A step that did not run (a Decide's other path, a rule that did not hold) has empty
// values; checkFlow warns where that can happen.
//
// apps.ts imports this module back (cleanRecipe tidies a recipe's flow), so what comes from it is used
// inside functions only, never while the modules load.
import type { Agent } from './types.ts';
import type { AnswerField, AppField, AppRecipe } from './apps.ts';
import type { AppSummary } from './app-summary.ts';
import type { AppSecretState } from './app-secrets.ts';
import { ANSWER_TYPES, cleanAnswer, cleanFields, readDate, readNumber } from './apps.ts';

// ---- the format ---------------------------------------------------------------------------------------

export const STEP_KINDS = [
  { value: 'agent', label: 'Ask an agent', hint: 'A session works on it with its tools and hands in what it found' },
  { value: 'model', label: 'Ask a model', hint: 'One quick answer from a model, no tools: sort, extract, sum up' },
  { value: 'tool', label: 'Use a tool', hint: 'One tool with set inputs: search the web, read a page, call an address' },
  { value: 'decide', label: 'Decide', hint: 'One way or the other, by a rule or by a question in words' },
  { value: 'repeat', label: 'Repeat', hint: 'For each item of a list, or until something holds' },
  { value: 'parallel', label: 'At the same time', hint: 'Branches side by side, joined at the end' },
  { value: 'app', label: 'Call an app', hint: 'Another of your apps, as one step' },
  { value: 'data', label: 'Keep data', hint: 'Add, find, change or remove records the app keeps' },
  { value: 'ask', label: 'Ask a person', hint: 'Waits for your answer: yes or no, or a short form' },
  { value: 'code', label: 'Run code', hint: 'A program in JavaScript, TypeScript or Python, in a sandbox: it can ask models and agents too' },
  { value: 'value', label: 'Work out a value', hint: 'The first item, a count, a sum, values joined, a field of each…: at once, at no cost' },
] as const;
export type StepKind = (typeof STEP_KINDS)[number]['value'];

interface StepCommon {
  /** Its name in the flow, which other steps use its values by ({{find.hotels}}). */
  id: string;
  /** What it is called on screen; its id, in words, when not set. */
  title?: string;
  /** A rule: the step runs only when it holds; otherwise it is skipped and its values are empty. */
  if?: string;
  /**
   * When it fails: steps to run instead ({{error}} says why), "skip" to go on without its values, or "agent": an
   * agent does its work, with what it was given and why it failed, and hands in the values the flow wants of it
   * (a tool, model, code, data or app step). Unset: the run stops.
   */
  failed?: Step[] | 'skip' | 'agent';
}

/** A session (Claude Code, Codex, Custom…) works on it and hands in its outputs; the app's agent settings unless set here. */
export interface AgentStep extends StepCommon {
  do: 'agent';
  instructions: string;
  /** What it hands in; without any, its reply ({{id.reply}}). */
  outputs?: AnswerField[];
  agent?: Agent;
  acpAgent?: string;
  model?: string;
  effort?: string;
  mode?: string;
  assistant?: string;
  /** The app's own tools it may use; unset: the app's list. */
  tools?: string[] | null;
  /** Most it may spend, in US dollars. */
  capUsd?: number;
}

/** One answer from a model, with no session and no tools: its outputs as JSON, or its text ({{id.text}}). */
export interface ModelStep extends StepCommon {
  do: 'model';
  instructions: string;
  outputs?: AnswerField[];
  /** One of Custom's models; unset: the helper model (Settings → Models). */
  model?: string;
}

/** One of the app's own tools, called with set inputs: its answer is {{id.text}} (and {{id.data}} when that is JSON). */
export interface ToolStep extends StepCommon {
  do: 'tool';
  tool: string;
  /** Its inputs: values, or text with {{values}} in it. */
  with?: Record<string, unknown>;
}

/** One path or the other: by a rule, or by a question in words that the helper model answers ({{id.yes}}). */
export interface DecideStep extends StepCommon {
  do: 'decide';
  rule?: string;
  ask?: string;
  then: Step[];
  else?: Step[];
}

/** Its steps once for each item of a list, or again until something holds: {{id.items}} (one per round), {{id.count}}, {{id.last}}. */
export interface RepeatStep extends StepCommon {
  do: 'repeat';
  /** A list to go through ("{{find.hotels}}"). */
  over?: string;
  /** Or: until this rule holds, or this question in words is answered yes; at most `max` rounds. */
  until?: string;
  untilAsk?: string;
  max?: number;
  /** How many items at once (1 to 6). */
  atOnce?: number;
  /** What its steps call the item ("item" unless set). */
  as?: string;
  /** Whose values make each round's record (one of its steps); unset: its last step that has some. */
  collect?: string;
  steps: Step[];
}

/** Branches side by side; the flow goes on when all of them have ended. */
export interface ParallelStep extends StepCommon {
  do: 'parallel';
  branches: Step[][];
}

/** Another of your apps, by its address: its answer fields, and {{id.reply}}. */
export interface AppStep extends StepCommon {
  do: 'app';
  app: string;
  with?: Record<string, unknown>;
}

export type DataOp = 'add' | 'get' | 'find' | 'search' | 'update' | 'remove';

/**
 * Records the app keeps (its data): add one ({{id.record}}, {{id.id}}), get one by its id ({{id.record}},
 * {{id.found}}), find some by their fields ({{id.records}}, {{id.count}}, {{id.first}}), search them for a
 * question by words and by meaning ({{id.records}}, best first, {{id.count}}, {{id.first}}, {{id.meaning}}),
 * change ({{id.records}}) or remove them ({{id.count}}).
 */
export interface DataStep extends StepCommon {
  do: 'data';
  op: DataOp;
  collection: string;
  /** add: the record; update: what to change in each. */
  with?: Record<string, unknown>;
  /** get, update, remove: one record, by its id ("{{find.first.id}}"). */
  record?: string;
  /** find, update, remove: which records: { field: value }, or { field: { "<": 10 } } (=, !=, <, >, <=, >=, contains, in, empty). */
  where?: Record<string, unknown>;
  /** find: words to look for anywhere in a record. */
  search?: string;
  /** search: the question, answered by words and by meaning (when search by meaning is on). */
  query?: string;
  /** search: by words and meaning (auto), or only one of them. */
  mode?: 'auto' | 'words' | 'meaning';
  /** find: the field to sort by ("-price": highest first); unset: oldest first. */
  sort?: string;
  /** find: at most this many (100 unless set, 1,000 at most). */
  limit?: number;
}

/**
 * A person answers before the flow goes on: yes or no ({{id.yes}}), or a short form of its own (its fields'
 * values), on the run's page, in the inbox, and from a notice on their phone. The run waits meanwhile.
 */
export interface AskStep extends StepCommon {
  do: 'ask';
  /** What is asked, with {{values}}. */
  question: string;
  /** Its form; none: yes or no. */
  fields?: AppField[];
  /** How long it waits before it fails, in hours (1 to 720; a week unless set). */
  waitHours?: number;
}

/**
 * A program the flow runs, in JavaScript or TypeScript (Node) or Python, in a sandbox: no network, nothing of
 * this computer's files but its template's packages. It gets the values given as `input` and returns its values
 * (an object's fields, else {{id.result}}); what it prints is {{id.printed}}. It reaches the world outside only
 * through `ctx` (ctx.model, ctx.agent, ctx.tool, ctx.ask, ctx.data, ctx.app), each call a step of the run that
 * is kept: after a restart the program runs again, and the calls it made answer with what they gave then, so a
 * whole flow can be one program.
 */
export interface CodeStep extends StepCommon {
  do: 'code';
  language: 'javascript' | 'typescript' | 'python';
  /** The body of a function of `input` (async in JavaScript): it returns the step's values. */
  code: string;
  /** What `input` holds, by name: values, or text with {{values}}. */
  with?: Record<string, unknown>;
  /** Most seconds it may take (1 to 120; 20 unless set), not counting the time its ctx calls take. */
  seconds?: number;
  /** What it gives: the fields of the object it returns (unset: any). */
  outputs?: AnswerField[];
}

/** What Work out a value can work out. */
export const VALUE_OPS = [
  { value: 'first', label: 'The first item' },
  { value: 'last', label: 'The last item' },
  { value: 'count', label: 'How many' },
  { value: 'sum', label: 'The sum' },
  { value: 'average', label: 'The average' },
  { value: 'min', label: 'The smallest' },
  { value: 'max', label: 'The largest' },
  { value: 'pick', label: 'A field of each' },
  { value: 'join', label: 'Joined into text' },
  { value: 'unique', label: 'Without repeats' },
  { value: 'sort', label: 'Sorted' },
  { value: 'number', label: 'As a number' },
  { value: 'date', label: 'A date, days later' },
] as const;
export type ValueOp = (typeof VALUE_OPS)[number]['value'];

/**
 * A value worked out from another, at once and at no cost (a pure node): the first or last item of a list, how
 * many, a sum or an average (of a field of each, with arg), a field of each, the items joined into text, without
 * repeats, sorted (by a field, "-field" highest first), as a number, or a date some days later. Gives {{id.value}}.
 */
export interface ValueStep extends StepCommon {
  do: 'value';
  /** What it works on: a value of the form or of a step before it ("{{find.records}}"). */
  of: string;
  op: ValueOp;
  /** pick: the field; sum, average, min, max, sort: of this field of each; join: between the items (", " unless set); date: days to add. */
  arg?: string;
}

export type Step = AgentStep | ModelStep | ToolStep | DecideStep | RepeatStep | ParallelStep | AppStep | DataStep | AskStep | CodeStep | ValueStep;

/** A collection of records an app keeps between runs: its fields' kinds when given (values are checked and tidied to them), any JSON otherwise. */
export interface DataCollection {
  fields?: AnswerField[];
  description?: string;
}

export const DATA_LIMITS = { collections: 20, records: 20_000, record: 64 * 1024, find: 1000 };

/**
 * What a template needs on this computer: Node and Python packages, installed in an environment of the
 * template's own (never for the whole computer), and commands that must be here (looked for, not installed).
 */
export interface Requires {
  /** npm packages: name → version ("^1.0.0", "latest"). */
  node?: Record<string, string>;
  /** Python packages as pip takes them ("pandas>=2", "requests"). */
  python?: string[];
  /** The Python version of its environment ("3.12"); unset: what uv picks. */
  pythonVersion?: string;
  /** Commands it uses (ffmpeg, pdftotext). */
  commands?: string[];
  /** The models its steps ask for, so another computer finds them (or another of its own) when it installs the template. */
  models?: ModelNeed[];
}

/**
 * A model a template asks for, as it travels: the name its steps use for it, who runs it, and (for one of
 * Custom's) where it runs and the provider's own name for it, which say what it is on any computer.
 */
export interface ModelNeed {
  /** The name the template uses: Claude Code's or Codex's model, or the id of one of Custom's where it was made. */
  as: string;
  agent: 'claude' | 'codex' | 'custom';
  /** Custom's: openrouter, ollama, vllm or endpoint. */
  provider?: string;
  /** Custom's: the provider's name for it ("anthropic/claude-sonnet-4.5", "Qwen/Qwen3-32B"). */
  model?: string;
  label?: string;
}

export const MODEL_PROVIDERS = ['openrouter', 'ollama', 'vllm', 'endpoint'];

const NPM_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]{0,200}$/i;
// Versions and ranges only: nothing that fetches from a URL, git or a file, nor an option.
const NPM_VERSION = /^(?!-)[\w.^~<>=*|+ -]{1,60}$/;
const PY_REQ = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}(?:\[[A-Za-z0-9._, -]{1,100}\])?\s*(?:(?:===|==|>=|<=|~=|!=|>|<)\s*[A-Za-z0-9.*+!-]{1,40}\s*(?:,\s*(?:===|==|>=|<=|~=|!=|>|<)\s*[A-Za-z0-9.*+!-]{1,40}\s*)*)?$/;
const COMMAND = /^[A-Za-z0-9][\w.+-]{0,40}$/;

/** What a template requires, from anything: only package names and versions it can install safely, in words when not. */
export function cleanRequires(raw: unknown): { requires?: Requires; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['What it needs ("requires") is { "node": {…}, "python": […], "commands": […] }'] };
  const r = raw as Record<string, unknown>;
  const out: Requires = {};
  if (r.node !== undefined) {
    const node: Record<string, string> = {};
    const list: [string, unknown][] = Array.isArray(r.node) ? r.node.map((n) => [String(n), 'latest']) : r.node && typeof r.node === 'object' ? Object.entries(r.node) : [];
    for (const [name, v] of list.slice(0, 40)) {
      const version = typeof v === 'string' && v.trim() ? v.trim() : 'latest';
      if (!NPM_NAME.test(name)) errors.push(`What it needs: “${name.slice(0, 60)}” is not an npm package name`);
      else if (!NPM_VERSION.test(version)) errors.push(`What it needs: ${name} “${version.slice(0, 60)}”: give a version or range ("^1.2.0", "latest"), not a link, git or a file`);
      else node[name] = version;
    }
    if (Object.keys(node).length) out.node = node;
  }
  if (r.python !== undefined) {
    const py = (Array.isArray(r.python) ? r.python : []).map((x) => String(x).trim()).filter(Boolean);
    const ok = py.slice(0, 40).filter((x) => {
      if (PY_REQ.test(x)) return true;
      errors.push(`What it needs: “${x.slice(0, 60)}” is not a Python package as pip takes it ("pandas>=2"; no links or options)`);
      return false;
    });
    if (ok.length) out.python = [...new Set(ok)];
  }
  if (typeof r.pythonVersion === 'string' && r.pythonVersion.trim()) {
    if (/^\d+(?:\.\d+){0,2}$/.test(r.pythonVersion.trim())) out.pythonVersion = r.pythonVersion.trim();
    else errors.push('What it needs: the Python version is like "3.12"');
  }
  if (r.commands !== undefined) {
    const cmds = (Array.isArray(r.commands) ? r.commands : []).map((x) => String(x).trim()).filter(Boolean);
    const ok = cmds.slice(0, 20).filter((x) => {
      if (COMMAND.test(x)) return true;
      errors.push(`What it needs: “${x.slice(0, 40)}” is not a command's name`);
      return false;
    });
    if (ok.length) out.commands = [...new Set(ok)];
  }
  if (r.models !== undefined) {
    const models: ModelNeed[] = [];
    for (const x of (Array.isArray(r.models) ? r.models : []).slice(0, 20) as Record<string, unknown>[]) {
      const as = short(x?.as ?? x?.model, 160);
      const agent = x?.agent === 'claude' || x?.agent === 'codex' || x?.agent === 'custom' ? x.agent : null;
      if (!as || !agent) {
        errors.push('What it needs: each model has "as" (the name its steps use) and "agent" (claude, codex or custom)');
        continue;
      }
      const need: ModelNeed = { as, agent };
      if (agent === 'custom') {
        if (typeof x.provider === 'string' && !MODEL_PROVIDERS.includes(x.provider)) errors.push(`What it needs: the model ${as} runs on ${MODEL_PROVIDERS.join(', ')}, not “${x.provider.slice(0, 30)}”`);
        else if (typeof x.provider === 'string') need.provider = x.provider;
        if (short(x.model, 200)) need.model = short(x.model, 200);
      }
      if (short(x.label, 120)) need.label = short(x.label, 120);
      if (!models.some((m) => m.as === as && m.agent === agent)) models.push(need);
    }
    if (models.length) out.models = models;
  }
  return { requires: Object.keys(out).length ? out : undefined, errors };
}

/** The models a recipe asks for, by who runs them: its own, its agent steps', its model steps' (null: the helper model). */
export function modelsUsed(r: Pick<AppRecipe, 'agent' | 'acpAgent' | 'model' | 'flow'>): { agent: 'claude' | 'codex' | 'custom'; as: string }[] {
  const out: { agent: 'claude' | 'codex' | 'custom'; as: string }[] = [];
  const add = (agent: string | undefined, acp: string | undefined, as: string | undefined) => {
    if (!as) return;
    const who = agent === 'claude' || agent === 'codex' ? agent : agent === 'acp' && (!acp || acp === 'console') ? 'custom' : null;
    if (who && !out.some((x) => x.agent === who && x.as === as)) out.push({ agent: who, as });
  };
  const steps = r.flow ? allSteps(r.flow.steps) : [];
  if (!r.flow || steps.some((s) => s.do === 'agent' && !s.agent)) add(r.agent, r.acpAgent, r.model);
  for (const s of steps) {
    if (s.do === 'agent') add(s.agent ?? r.agent, s.acpAgent ?? (s.agent ? undefined : r.acpAgent), s.model ?? (s.agent && s.agent !== r.agent ? undefined : r.model));
    if (s.do === 'model') add('acp', 'console', s.model);
  }
  return out;
}
/** Names a record has of its own, which no field may take. */
export const RECORD_KEYS = ['id', 'createdAt', 'updatedAt'];

export interface Flow {
  steps: Step[];
  /** What the run gives back: an answer field's id → a value ("{{write.summary}}"). Unset: each answer field from the last step that gave a value of its name. */
  outputs?: Record<string, string>;
}

export const FLOW_LIMITS = { steps: 60, depth: 5, branches: 6, atOnce: 6, rounds: 50, items: 200, value: 20_000, flows: 20 };

/** A flow beside the main one: what a screen's button or form starts, with the inputs it takes; what it gives back is its outputs, by name. */
export interface NamedFlow extends Flow {
  title?: string;
  inputs?: AppField[];
}

/** One of an app's screens: a page of its own, which Pages keeps (with versions and its visual editor). */
export interface AppScreen {
  page: string;
  title?: string;
}

/** What a screen is told of its app: its flows (the main one is "run") with their inputs and what they give back, and what it keeps. */
export interface AppInfo {
  id: string;
  name: string;
  flows: { id: string; title: string; inputs: AppField[]; outputs: { id: string; label: string; type?: string }[] }[];
  data: { name: string; fields: AnswerField[] | null }[];
}

export function appInfo(id: string, r: Pick<AppRecipe, 'name' | 'fields' | 'answer' | 'flows' | 'data'>): AppInfo {
  return {
    id,
    name: r.name,
    flows: [
      { id: 'run', title: 'Run', inputs: r.fields, outputs: r.answer.map((f) => ({ id: f.id, label: f.label, type: f.type })) },
      ...Object.entries(r.flows ?? {}).map(([fid, f]) => ({ id: fid, title: f.title ?? labelOf(fid), inputs: f.inputs ?? [], outputs: Object.keys(f.outputs ?? {}).map((k) => ({ id: k, label: labelOf(k) })) })),
    ],
    data: Object.entries(r.data ?? {}).map(([name, c]) => ({ name, fields: c.fields ?? null })),
  };
}

/** Tools a step may call on its own, outside a session: they answer without a conversation to answer in. */
export const STEP_TOOLS = ['web_search', 'read_page', 'find_media', 'http_request', 'read_document', 'generate_image', 'knowledge_search', 'knowledge_read', 'recall', 'user_profile', 'notify_user'];
/** Of those, the ones only steps have (agents in sessions don't): what the user is like, from memory and their sessions' titles. */
export const STEP_ONLY_TOOLS = ['user_profile'];

/**
 * Values every step can use beside the form's answers and the steps' values: the moment, in the user's time
 * zone, and the run (what started it). A flow fills them when it starts.
 */
export const BUILTIN_VALUES = [
  { ref: 'today', label: 'Today', hint: 'The date, as 2026-11-02' },
  { ref: 'now', label: 'Now', hint: 'The date and time, as 2026-11-02 14:30' },
  { ref: 'weekday', label: 'The day of the week', hint: 'Monday, Tuesday…' },
  { ref: 'timezone', label: 'The time zone', hint: 'Where those are, as Europe/Athens' },
  { ref: 'run.source', label: 'What started the run', hint: 'web (its form), test, api, mcp, public, batch, task, screen, chat, app, session (an agent ran it for you in a session)' },
  { ref: 'run.id', label: 'The run', hint: 'Its id, as its page has it' },
] as const;
/** The names those values go by. */
export const BUILTIN_ROOTS = new Set(['today', 'now', 'weekday', 'timezone', 'run']);

/** The moment's values in a time zone (an IANA name; UTC when it is not one). */
export function momentOf(timeZone = 'UTC', at = Date.now()): { today: string; now: string; weekday: string; timezone: string } {
  let tz = timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' })
      .formatToParts(at)
      .map((x) => [x.type, x.value]),
  );
  const today = `${p.year}-${p.month}-${p.day}`;
  return { today, now: `${today} ${p.hour}:${p.minute}`, weekday: p.weekday, timezone: tz };
}

/** Names values use for other things, which no step may take. */
const RESERVED = new Set(['inputs', 'item', 'index', 'today', 'now', 'weekday', 'timezone', 'error', 'steps', 'run']);

const ID = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const REF = '[A-Za-z_][\\w-]*(?:\\.[A-Za-z_][\\w-]*|\\[-?\\d+\\])*';

/** "key_findings" → "Key findings". */
export const labelOf = (id: string) => {
  const s = String(id ?? '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : 'Step';
};

/** What a step is called on screen. */
export const titleOf = (s: Pick<StepCommon, 'id' | 'title'>) => s.title || labelOf(s.id);

/** Every step of a list, the steps inside others too, in the order they come. */
export function allSteps(steps: Step[]): Step[] {
  const out: Step[] = [];
  const walk = (list: Step[]) => {
    for (const s of list) {
      out.push(s);
      for (const inner of innerLists(s)) walk(inner);
    }
  };
  walk(steps);
  return out;
}

/** A template's flows with one step (by its id, wherever it is) given way to others, in its place (Firm it up). */
export function swapStep<R extends { flow?: Flow; flows?: Record<string, NamedFlow> }>(r: R, id: string, by: Step[]): Pick<R, 'flow' | 'flows'> {
  const next = JSON.parse(JSON.stringify({ flow: r.flow, flows: r.flows })) as Pick<R, 'flow' | 'flows'>;
  const lists: Step[][] = [];
  const collect = (steps: Step[] | undefined) => {
    if (!steps) return;
    lists.push(steps);
    for (const s of steps) for (const inner of innerLists(s)) collect(inner);
  };
  collect(next.flow?.steps);
  for (const f of Object.values((next.flows ?? {}) as Record<string, NamedFlow>)) collect(f.steps);
  for (const list of lists) {
    const i = list.findIndex((s) => s.id === id);
    if (i >= 0) {
      list.splice(i, 1, ...by);
      break;
    }
  }
  return next;
}

/** Steps collapsed into a block: the block (a template of its own: its form, answer and steps), the step that calls it in their place, and the template's flows with that step in. */
export interface Collapsed {
  block: { fields: AppField[]; answer: AnswerField[]; flow: Flow };
  call: AppStep;
  /** The template's flows, the call in the steps' place and the values the steps gave renamed to the call's. */
  flows: { flow?: Flow; flows?: Record<string, NamedFlow> };
  /** The block's questions that get a list or a table, which reach it as text. */
  asText: string[];
}

const LISTY = new Set(['records', 'items', 'record', 'first', 'last', 'data']);
const renameRefs = (json: string, from: string, to: string) => json.replace(new RegExp(`(\\{\\{\\s*[#^/]?\\s*)${from.replace(/\./g, '\\.')}(?=[.\\[}\\s])`, 'g'), `$1${to}`);

/**
 * Steps that follow one another, collapsed into a block that a Call an app step runs in their place (Collapse to
 * a block). What they use from outside (the form's answers, the values of steps before them, a Repeat's item)
 * becomes the block's form, given by the call; what the steps after them use becomes its answer, and those
 * values are the call's now.
 */
export function collapseSteps(r: { fields: AppField[]; answer: AnswerField[]; flow?: Flow; flows?: Record<string, NamedFlow> }, ids: string[], o: { title: string; app: string }): Collapsed | { error: string } {
  // A copy of its flows, to change.
  const c = JSON.parse(JSON.stringify({ flow: r.flow, flows: r.flows })) as Collapsed['flows'];
  const lists: Step[][] = [];
  const collect = (steps: Step[] | undefined) => {
    if (!steps) return;
    lists.push(steps);
    for (const s of steps) for (const inner of innerLists(s)) collect(inner);
  };
  collect(c.flow?.steps);
  for (const f of Object.values(c.flows ?? {})) collect(f.steps);
  const home = ids.length ? lists.find((l) => ids.every((id) => l.some((s) => s.id === id))) : undefined;
  if (!home) return { error: 'Pick steps that are in one list, not some inside a Decide or a Repeat and some outside it' };
  const at = home.map((s, i) => (ids.includes(s.id) ? i : -1)).filter((i) => i >= 0);
  if (at[at.length - 1] - at[0] + 1 !== at.length) return { error: 'Pick steps that follow one another' };
  const picked = home.slice(at[0], at[at.length - 1] + 1);
  const inside = new Map(allSteps(picked).map((s) => [s.id, s]));
  const everyStep = [...(c.flow ? allSteps(c.flow.steps) : []), ...Object.values(c.flows ?? {}).flatMap((f) => allSteps(f.steps))];
  const callId = freeId(o.title || 'block', new Set(everyStep.map((s) => s.id)));
  const rootOf = (ref: string) => ref.split(/[.[]/)[0];
  const segOf = (ref: string) => /^[^.[]+\.([A-Za-z_][\w-]*)/.exec(ref)?.[1];
  const form = new Map(r.fields.map((f) => [f.id, f]));

  // What the steps use from outside: each a question of the block's form, which the call gives.
  const fields: AppField[] = [];
  const given: Record<string, unknown> = {};
  const asText: string[] = [];
  const taken = new Set<string>();
  const named = new Map<string, string>();
  let body = JSON.stringify(picked);
  for (const ref of refsIn(picked)) {
    const root = rootOf(ref);
    if (inside.has(root) || BUILTIN_ROOTS.has(root)) continue;
    const own = root === 'inputs' ? segOf(ref) : form.has(root) ? root : undefined;
    if (own && form.has(own)) {
      // The template's own questions are its block's too, by the same names.
      if (!taken.has(own)) {
        taken.add(own);
        fields.push(form.get(own)!);
        given[own] = `{{${own}}}`;
      }
      continue;
    }
    const seg = segOf(ref);
    const value = seg ? `${root}.${seg}` : root;
    if (named.has(value)) continue;
    const id = freeId(value.replace('.', '_'), new Set([...taken, ...form.keys()]));
    taken.add(id);
    named.set(value, id);
    fields.push({ id, label: labelOf(id), type: 'long' });
    given[id] = `{{${value}}}`;
    const from = everyStep.find((s) => s.id === root);
    const kind = from && (from.do === 'model' || from.do === 'agent') ? from.outputs?.find((f) => f.id === seg)?.type : undefined;
    if ((seg && LISTY.has(seg)) || kind === 'list' || kind === 'table' || root === 'item') asText.push(id);
    body = renameRefs(body, value, id);
  }

  // What the steps after them use of theirs: the block's answer, the call's values in the template.
  const without = JSON.parse(JSON.stringify(c, (_k, v) => (v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string' && inside.has(v.id) ? undefined : v)));
  const answer: AnswerField[] = [];
  const outputs: Record<string, string> = {};
  const renames: [string, string][] = [];
  for (const ref of refsIn(without)) {
    const root = rootOf(ref);
    if (!inside.has(root)) continue;
    const seg = segOf(ref) ?? 'reply';
    const value = `${root}.${seg}`;
    if (renames.some(([v]) => v === value)) continue;
    const id = answer.some((f) => f.id === seg) ? freeId(`${root}_${seg}`, new Set(answer.map((f) => f.id))) : seg;
    const s = inside.get(root)!;
    const typed = s.do === 'model' || s.do === 'agent' ? s.outputs?.find((f) => f.id === seg) : undefined;
    answer.push(typed ? { ...typed, id, required: false } : { id, label: labelOf(id), type: seg === 'count' ? 'number' : 'markdown' });
    outputs[id] = `{{${value}}}`;
    renames.push([value, `${callId}.${id}`]);
  }
  // The template's answer fields that come by name from these steps (none after them giving one) come by name from the call.
  const main = c.flow ? allSteps(c.flow.steps) : [];
  const last = main.findIndex((s) => s.id === picked[picked.length - 1].id);
  if (last >= 0) {
    const later = main.slice(last + 1).filter((s) => !inside.has(s.id));
    for (const f of r.answer) {
      if (c.flow?.outputs?.[f.id] || answer.some((x) => x.id === f.id) || later.some((s) => givesOf(s)?.includes(f.id))) continue;
      const giver = [...inside.values()].reverse().find((s) => givesOf(s)?.includes(f.id));
      if (!giver) continue;
      answer.push({ ...f, required: false });
      outputs[f.id] = `{{${giver.id}.${f.id}}}`;
    }
  }

  const call: AppStep = { id: callId, title: o.title || labelOf(callId), do: 'app', app: o.app, ...(Object.keys(given).length ? { with: given } : {}) };
  home.splice(at[0], picked.length, call);
  let rest = JSON.stringify(c);
  for (const [from, to] of renames) rest = renameRefs(rest, from, to);
  return {
    block: { fields, answer, flow: { steps: JSON.parse(body) as Step[], ...(Object.keys(outputs).length ? { outputs } : {}) } },
    call,
    flows: JSON.parse(rest),
    asText,
  };
}

/** The lists of steps inside a step: a Decide's paths, a Repeat's steps, the branches, what runs when it fails. */
export function innerLists(s: Step): Step[][] {
  const out: Step[][] = [];
  if (s.do === 'decide') out.push(s.then, s.else ?? []);
  else if (s.do === 'repeat') out.push(s.steps);
  else if (s.do === 'parallel') out.push(...s.branches);
  if (Array.isArray(s.failed)) out.push(s.failed);
  return out;
}

/**
 * The upgrade from a recipe of before: its flow, or the one agent step a recipe without a flow is (its
 * task, its answer fields, the app's agent settings).
 */
export function flowOf(r: Pick<AppRecipe, 'prompt' | 'answer' | 'flow'>): Flow {
  if (r.flow?.steps.length) return r.flow;
  return { steps: [{ id: 'task', do: 'agent', title: 'Do the task', instructions: r.prompt, ...(r.answer.length ? { outputs: r.answer } : {}) }] };
}

// ---- kinds of value -----------------------------------------------------------------------------------

/** Short names for the kinds of an output, as a manifest writes them. */
const KIND_NAMES: Record<string, string> = {
  text: 'text', string: 'text', short: 'text',
  long: 'markdown', markdown: 'markdown', longtext: 'markdown',
  number: 'number', integer: 'number', int: 'number', float: 'number',
  yesno: 'yesno', boolean: 'yesno', bool: 'yesno',
  date: 'date',
  url: 'url', link: 'url',
  list: 'list',
  table: 'table',
};
const COLUMN_KINDS = new Set(['text', 'number', 'yesno', 'date', 'url']);
const KINDS_SAID = 'text, long, number, yesno, date, url, list, table(column: kind, …)';

/** "table(name: text, price: number)", "list(text)", "long" → an answer field's kind (and a table's columns). */
export function readKind(s: string): { type: string; columns?: { id: string; label: string; type: string }[] } | { error: string } {
  const m = /^\s*([A-Za-z]+)\s*(?:\((.*)\))?\s*$/s.exec(String(s ?? ''));
  const type = m ? KIND_NAMES[m[1].toLowerCase()] : undefined;
  if (!m || !type) return { error: `“${String(s).slice(0, 40)}” is not a kind of value (${KINDS_SAID})` };
  if (type !== 'table') return { type };
  const columns: { id: string; label: string; type: string }[] = [];
  for (const part of (m[2] ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
    const c = /^([A-Za-z_][\w]*)\s*(?::\s*([A-Za-z]+))?$/.exec(part);
    const ct = c ? KIND_NAMES[(c[2] ?? 'text').toLowerCase()] : undefined;
    if (!c || !ct || !COLUMN_KINDS.has(ct)) return { error: `table column “${part}”: write it as name: kind (text, number, yesno, date, url)` };
    columns.push({ id: c[1], label: labelOf(c[1]), type: ct });
  }
  if (!columns.length) return { error: 'a table needs its columns: table(name: text, price: number)' };
  return { type, columns };
}

/**
 * A step's outputs from a list of fields ({ id, label, type, … }) or a map of names to kinds
 * ({ "title": "text", "tags": "list" }), tidied as answer fields are.
 */
export function cleanOutputs(raw: unknown, errors: string[], where: string): AnswerField[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  let list: unknown[];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'object') list = Object.entries(raw as Record<string, unknown>).map(([id, v]) => (typeof v === 'string' ? { id, kind: v } : { id, ...(v && typeof v === 'object' ? v : {}) }));
  else {
    errors.push(`${where}: outputs should be a list of fields or a map of names to kinds`);
    return undefined;
  }
  const fields = list.flatMap((x: any) => {
    if (!x || typeof x !== 'object') return [];
    const said = typeof x.kind === 'string' ? x.kind : typeof x.type === 'string' && !ANSWER_TYPES.some((t) => t.value === x.type) ? x.type : null;
    if (said === null) return [{ ...x, label: x.label ?? (typeof x.id === 'string' ? labelOf(x.id) : undefined) }];
    const k = readKind(said);
    if ('error' in k) {
      errors.push(`${where}, output ${x.id ?? x.label ?? '?'}: ${k.error}`);
      return [];
    }
    return [{ ...x, type: k.type, columns: k.columns ?? x.columns, label: x.label ?? (typeof x.id === 'string' ? labelOf(x.id) : undefined) }];
  });
  const out = cleanAnswer(fields);
  return out.length ? out : undefined;
}

// ---- tidying a flow -------------------------------------------------------------------------------------

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim().slice(0, max) : '');
const short = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const int = (v: unknown, min: number, max: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : undefined;
};

interface Tidy {
  count: number;
  ids: Set<string>;
  errors: string[];
}

/** A step's inputs: values (JSON), or text with {{values}}. */
function cleanWith(raw: unknown, errors: string[], where: string): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(`${where}: "with" should be a map of the tool's inputs to values`);
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 40)) {
    if (!/^[A-Za-z_][\w-]{0,63}$/.test(k)) {
      errors.push(`${where}: “${k.slice(0, 40)}” is not a name an input can have`);
      continue;
    }
    if (v === undefined) continue;
    if (JSON.stringify(v).length > FLOW_LIMITS.value) {
      errors.push(`${where}, ${k}: too long (at most ${FLOW_LIMITS.value.toLocaleString('en-US')} characters)`);
      continue;
    }
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A free id from words ("Read a page" → read_a_page). */
function freeId(words: string, taken: Set<string>): string {
  const base =
    String(words ?? '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 36) || 'step';
  const id = /^[a-z]/.test(base) && !RESERVED.has(base) ? base : `s_${base}`;
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) if (!taken.has(`${id}_${n}`)) return `${id}_${n}`;
}

function cleanSteps(raw: unknown, t: Tidy, depth: number, where: string): Step[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    t.errors.push(`${where}: steps should be a list`);
    return [];
  }
  if (depth > FLOW_LIMITS.depth) {
    t.errors.push(`${where}: steps sit inside each other too deep (at most ${FLOW_LIMITS.depth} levels)`);
    return [];
  }
  const out: Step[] = [];
  for (const x of raw) {
    if (t.count >= FLOW_LIMITS.steps) {
      t.errors.push(`A flow has at most ${FLOW_LIMITS.steps} steps`);
      break;
    }
    const s = cleanStep(x, t, depth);
    if (s) out.push(s);
  }
  return out;
}

/** The kinds of step an agent can stand in for when one fails (failed: "agent"). */
export const RESCUED = new Set(['model', 'tool', 'code', 'data', 'app']);

function cleanStep(x: any, t: Tidy, depth: number): Step | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    t.errors.push('Each step should be an object with "do" (what kind of step it is) and "id"');
    return null;
  }
  const kind = short(x.do ?? x.kind, 20);
  const named = short(x.id, 40) || short(x.title, 40) || kind || 'a step';
  if (!STEP_KINDS.some((k) => k.value === kind)) {
    t.errors.push(`Step “${named}”: “${kind || 'nothing'}” is not a kind of step (${STEP_KINDS.map((k) => k.value).join(', ')})`);
    return null;
  }
  t.count++;
  const title = short(x.title, 80);
  let id: string;
  if (typeof x.id === 'string' && x.id.trim()) {
    id = x.id.trim();
    if (!ID.test(id)) {
      t.errors.push(`Step “${id.slice(0, 40)}”: an id is a letter, then letters, digits or _ (at most 40)`);
      id = freeId(id, t.ids);
    } else if (t.ids.has(id)) t.errors.push(`Two steps are called “${id}”: give each an id of its own`);
    else if (RESERVED.has(id)) t.errors.push(`“${id}” is a name values use: call the step something else`);
  } else id = freeId(title || kind, t.ids);
  t.ids.add(id);
  const where = `Step “${id}”`;
  const common: StepCommon = { id };
  if (title) common.title = title;
  const rule = text(x.if, 2000);
  if (rule) common.if = rule;
  if (x.failed === 'skip') common.failed = 'skip';
  else if (x.failed === 'agent') {
    if (RESCUED.has(kind)) common.failed = 'agent';
    else t.errors.push(`${where}: only a tool, model, code, data or app step can hand its work to an agent when it fails`);
  } else if (Array.isArray(x.failed)) {
    const f = cleanSteps(x.failed, t, depth + 1, `${where}, when it fails`);
    if (f.length) common.failed = f;
  } else if (x.failed !== undefined && x.failed !== null && x.failed !== 'stop') t.errors.push(`${where}: "failed" is a list of steps to run instead, "skip", or "agent"`);

  switch (kind) {
    case 'agent':
    case 'model': {
      const instructions = text(x.instructions ?? x.prompt, 30_000);
      if (!instructions) t.errors.push(`${where}: write what the ${kind === 'agent' ? 'agent' : 'model'} is asked to do (its instructions)`);
      const outputs = cleanOutputs(x.outputs, t.errors, where);
      if (kind === 'model') return { ...common, do: 'model', instructions, ...(outputs ? { outputs } : {}), ...(short(x.model, 160) ? { model: short(x.model, 160) } : {}) };
      const agent = x.agent === 'claude' || x.agent === 'codex' || x.agent === 'acp' ? (x.agent as Agent) : undefined;
      if (x.agent !== undefined && !agent) t.errors.push(`${where}: the agent is claude, codex or acp (Custom and other added agents)`);
      const step: AgentStep = { ...common, do: 'agent', instructions, ...(outputs ? { outputs } : {}) };
      if (agent) step.agent = agent;
      for (const k of ['acpAgent', 'model', 'effort', 'mode', 'assistant'] as const) if (short(x[k], 160)) step[k] = short(x[k], 160);
      if (Array.isArray(x.tools)) step.tools = [...new Set<string>(x.tools.map((v: unknown) => short(v, 80)).filter(Boolean))].slice(0, 80);
      else if (x.tools === null) step.tools = null;
      const cap = typeof x.capUsd === 'number' && x.capUsd > 0 ? Math.min(x.capUsd, 10_000) : undefined;
      if (cap) step.capUsd = cap;
      return step;
    }
    case 'tool': {
      const tool = short(x.tool, 80);
      if (!tool) t.errors.push(`${where}: name the tool it uses`);
      const w = cleanWith(x.with, t.errors, where);
      return { ...common, do: 'tool', tool, ...(w ? { with: w } : {}) };
    }
    case 'decide': {
      const rule2 = text(x.rule, 2000);
      const ask = text(x.ask, 4000);
      if (!rule2 && !ask) t.errors.push(`${where}: give it a rule ("{{price}} < 100") or a question in words (ask)`);
      const then = cleanSteps(x.then, t, depth + 1, `${where}, then`);
      const els = cleanSteps(x.else, t, depth + 1, `${where}, else`);
      if (!then.length && !els.length) t.errors.push(`${where}: put steps under then (when it holds), else, or both`);
      return { ...common, do: 'decide', ...(rule2 ? { rule: rule2 } : {}), ...(ask ? { ask } : {}), then, ...(els.length ? { else: els } : {}) };
    }
    case 'repeat': {
      const over = text(x.over, 400);
      const until = text(x.until, 2000);
      const untilAsk = text(x.untilAsk, 4000);
      if (!over && !until && !untilAsk) t.errors.push(`${where}: say what to go through (over: "{{find.items}}") or when to stop (until)`);
      const as = short(x.as, 40) || undefined;
      if (as && (!ID.test(as) || (RESERVED.has(as) && as !== 'item'))) t.errors.push(`${where}: “${as}” cannot name the item`);
      const steps = cleanSteps(x.steps, t, depth + 1, where);
      if (!steps.length) t.errors.push(`${where}: give it the steps to repeat`);
      const step: RepeatStep = { ...common, do: 'repeat', steps };
      if (over) step.over = over;
      if (until) step.until = until;
      if (untilAsk) step.untilAsk = untilAsk;
      const max = int(x.max, 1, FLOW_LIMITS.rounds);
      if (max) step.max = max;
      const atOnce = int(x.atOnce, 1, FLOW_LIMITS.atOnce);
      if (atOnce && atOnce > 1) step.atOnce = atOnce;
      if (as && as !== 'item') step.as = as;
      if (short(x.collect, 40)) step.collect = short(x.collect, 40);
      return step;
    }
    case 'parallel': {
      const raw = Array.isArray(x.branches) ? x.branches : [];
      if (raw.length > FLOW_LIMITS.branches) t.errors.push(`${where}: at most ${FLOW_LIMITS.branches} branches`);
      const branches = raw
        .slice(0, FLOW_LIMITS.branches)
        .map((b: unknown, i: number) => cleanSteps(Array.isArray(b) ? b : (b as { steps?: unknown })?.steps, t, depth + 1, `${where}, branch ${i + 1}`))
        .filter((b: Step[]) => b.length);
      if (!branches.length) t.errors.push(`${where}: give it branches, each a list of steps`);
      return { ...common, do: 'parallel', branches };
    }
    case 'data': {
      const ops: DataOp[] = ['add', 'get', 'find', 'search', 'update', 'remove'];
      let op = ops.find((o) => o === x.op);
      let collection = short(x.collection, 40);
      // The short way: { "do": "data", "add": "items" }.
      for (const o of ops)
        if (!op && typeof x[o] === 'string') {
          op = o;
          collection ||= short(x[o], 40);
        }
      if (!op) t.errors.push(`${where}: say what to do with the data (op: ${ops.join(', ')})`);
      if (!collection) t.errors.push(`${where}: name the collection`);
      const step: DataStep = { ...common, do: 'data', op: op ?? 'find', collection };
      const w = cleanWith(x.with, t.errors, where);
      if (w) step.with = w;
      if (x.where !== undefined) {
        const wh = x.where && typeof x.where === 'object' && !Array.isArray(x.where) ? cleanWith(x.where, t.errors, `${where}, where`) : (t.errors.push(`${where}: "where" is a map of fields to values`), undefined);
        step.where = wh ?? {};
      }
      if (short(x.record, 400)) step.record = short(x.record, 400);
      if (short(x.search, 400) && op !== 'search') step.search = short(x.search, 400);
      const query = text(x.query ?? (op === 'search' ? x.search : undefined), 2000);
      if (query) step.query = query;
      if (x.mode === 'words' || x.mode === 'meaning') step.mode = x.mode;
      if (op === 'search' && !query) t.errors.push(`${where}: give the question to search for (query)`);
      if (short(x.sort, 41)) step.sort = short(x.sort, 41);
      const limit = int(x.limit, 1, DATA_LIMITS.find);
      if (limit) step.limit = limit;
      if (op === 'add' && !step.with) t.errors.push(`${where}: give the record to add (with)`);
      if (op === 'update' && !step.with) t.errors.push(`${where}: give what to change (with)`);
      if ((op === 'get' || op === 'update' || op === 'remove') && !step.record && !(op !== 'get' && step.where)) t.errors.push(`${where}: say which record (record: its id${op === 'get' ? '' : ', or where'})`);
      return step;
    }
    case 'code': {
      const language =
        x.language === 'python' || x.language === 'py' ? 'python' : x.language === 'typescript' || x.language === 'ts' ? 'typescript' : x.language === undefined || x.language === 'javascript' || x.language === 'js' ? 'javascript' : null;
      if (!language) t.errors.push(`${where}: its language is javascript, typescript or python`);
      const code = typeof x.code === 'string' ? x.code.slice(0, 50_000) : '';
      if (!code.trim()) t.errors.push(`${where}: write its program (code)`);
      const w = cleanWith(x.with, t.errors, where);
      const secs = Number(x.seconds);
      const outputs = x.outputs === undefined ? undefined : cleanOutputs(x.outputs, t.errors, where);
      return {
        ...common,
        do: 'code',
        language: language ?? 'javascript',
        code,
        ...(w ? { with: w } : {}),
        ...(Number.isFinite(secs) && secs > 0 ? { seconds: Math.min(120, Math.max(1, Math.round(secs))) } : {}),
        ...(outputs?.length ? { outputs } : {}),
      };
    }
    case 'value': {
      const of = text(x.of, 2000);
      if (!of) t.errors.push(`${where}: say what it works on (of: a value, like {{find.records}})`);
      const op = VALUE_OPS.some((o) => o.value === x.op) ? (x.op as ValueOp) : null;
      if (!op) t.errors.push(`${where}: what it works out (op) is one of ${VALUE_OPS.map((o) => o.value).join(', ')}`);
      const arg = x.arg === undefined || x.arg === null ? '' : String(x.arg).slice(0, 200);
      if (op === 'pick' && !arg.trim()) t.errors.push(`${where}: say which field of each it picks (arg)`);
      if (op === 'date' && arg.trim() && !Number.isFinite(Number(arg))) t.errors.push(`${where}: the days to add (arg) are a number`);
      return { ...common, do: 'value', of, op: op ?? 'first', ...(arg ? { arg } : {}) };
    }
    case 'ask': {
      const question = text(x.question ?? x.ask, 4000);
      if (!question) t.errors.push(`${where}: write what it asks (question)`);
      const fields = x.fields === undefined || x.fields === null ? [] : cleanFields(x.fields).slice(0, 12);
      if (fields.some((f) => f.type === 'file')) t.errors.push(`${where}: an answer cannot be a file`);
      const hours = Number(x.waitHours);
      return { ...common, do: 'ask', question, ...(fields.length ? { fields } : {}), ...(Number.isFinite(hours) && hours > 0 ? { waitHours: Math.min(720, Math.max(1, Math.round(hours))) } : {}) };
    }
    default: {
      const app = short(x.app, 60);
      if (!app) t.errors.push(`${where}: name the app it calls (its address)`);
      const w = cleanWith(x.with, t.errors, where);
      return { ...common, do: 'app', app, ...(w ? { with: w } : {}) };
    }
  }
}

/**
 * A flow from anything, tidied (known kinds and fields, ids, bounds), and what was wrong with it in
 * plain words. A bare list of steps is a flow too. Nothing (or no steps): no flow.
 */
export function cleanFlow(raw: unknown): { flow?: Flow; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null || raw === false) return { errors };
  const r: any = Array.isArray(raw) ? { steps: raw } : raw;
  if (!r || typeof r !== 'object' || !Array.isArray(r.steps)) return { errors: ['A flow is a list of steps ({ "steps": [ … ] })'] };
  const t: Tidy = { count: 0, ids: new Set(), errors };
  const steps = cleanSteps(r.steps, t, 1, 'The flow');
  if (!steps.length) return { errors };
  let outputs: Record<string, string> | undefined;
  if (r.outputs && typeof r.outputs === 'object' && !Array.isArray(r.outputs)) {
    outputs = {};
    for (const [k, v] of Object.entries(r.outputs as Record<string, unknown>).slice(0, 30)) {
      if (typeof v !== 'string' || !v.trim()) errors.push(`What it gives back, ${k}: give a value, like "{{write.summary}}"`);
      else outputs[k] = v.trim().slice(0, 2000);
    }
    if (!Object.keys(outputs).length) outputs = undefined;
  } else if (r.outputs !== undefined && r.outputs !== null) errors.push('What it gives back ("outputs") is a map of answer fields to values');
  return { flow: { steps, ...(outputs ? { outputs } : {}) }, errors };
}

const COLLECTION = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const FLOW_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;

/** The flows beside the main one, from anything: each tidied as a flow is, with the inputs it takes. */
export function cleanFlows(raw: unknown): { flows?: Record<string, NamedFlow>; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['Its other flows ("flows") are a map of names to flows'] };
  const out: Record<string, NamedFlow> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > FLOW_LIMITS.flows) errors.push(`An app has at most ${FLOW_LIMITS.flows} flows besides its main one`);
  for (const [name, v] of entries.slice(0, FLOW_LIMITS.flows)) {
    if (!FLOW_NAME.test(name) || name === 'run') {
      errors.push(`Flows: “${name.slice(0, 40)}” cannot name a flow (a letter, then letters, digits, - or _; "run" is the main one)`);
      continue;
    }
    const f = cleanFlow(v);
    errors.push(...f.errors.map((e) => `Flow “${name}”: ${e}`));
    if (!f.flow) {
      if (!f.errors.length) errors.push(`Flow “${name}” has no steps`);
      continue;
    }
    const o = v as Record<string, unknown>;
    const inputs = cleanFields(o.inputs);
    const title = short(o.title, 80);
    out[name] = { ...f.flow, ...(title ? { title } : {}), ...(inputs.length ? { inputs } : {}) };
  }
  return { flows: Object.keys(out).length ? out : undefined, errors };
}

// ---- examples --------------------------------------------------------------------------------------------

/**
 * Saved inputs to try the app with, and checks on what a run gives: rules on its values ({{answer.field}},
 * {{step.value}}, {{reply}}), each of which holds when the run is good. To try a change, and to notice when
 * the app gets worse.
 */
export interface AppExample {
  id: string;
  /** Its name in the list (unset: its answers, in a line). */
  name?: string;
  /** The flow it tries (unset: the main one). */
  flow?: string;
  inputs: Record<string, unknown>;
  checks?: string[];
}

/** How a check went on a run. */
export interface CheckResult {
  rule: string;
  ok: boolean;
  /** Why it could not be read, or what it saw. */
  why?: string;
}

export const EXAMPLE_LIMITS = { examples: 20, checks: 10, inputs: 20_000 };

/** An app's examples, from anything: each with an id of its own, its checks readable rules. */
export function cleanExamples(raw: unknown): { examples?: AppExample[]; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (!Array.isArray(raw)) return { errors: ['Examples ("examples") are a list of { name?, inputs, checks? }'] };
  if (raw.length > EXAMPLE_LIMITS.examples) errors.push(`An app has at most ${EXAMPLE_LIMITS.examples} examples`);
  const taken = new Set<string>();
  const out: AppExample[] = [];
  for (const x of raw.slice(0, EXAMPLE_LIMITS.examples) as any[]) {
    if (!x || typeof x !== 'object') continue;
    const name = short(x.name, 80);
    const id = typeof x.id === 'string' && /^[A-Za-z][\w-]{0,39}$/.test(x.id) && !taken.has(x.id) ? x.id : freeId(name || 'example', taken);
    taken.add(id);
    const inputs = x.inputs && typeof x.inputs === 'object' && !Array.isArray(x.inputs) ? (x.inputs as Record<string, unknown>) : {};
    if (JSON.stringify(inputs).length > EXAMPLE_LIMITS.inputs) errors.push(`Example “${name || id}”: its answers are too long`);
    const checks = (Array.isArray(x.checks) ? x.checks : []).map((c: unknown) => text(c, 400)).filter(Boolean).slice(0, EXAMPLE_LIMITS.checks);
    for (const c of checks) {
      const r = readRule(c);
      if ('error' in r) errors.push(`Example “${name || id}”, its check “${c}”: ${r.error}`);
    }
    const flow = short(x.flow, 40);
    out.push({ id, ...(name ? { name } : {}), ...(flow && flow !== 'run' ? { flow } : {}), inputs, ...(checks.length ? { checks } : {}) });
  }
  return { examples: out.length ? out : undefined, errors };
}

/** An app's screens, from anything: names to the pages they are. */
export function cleanScreens(raw: unknown): Record<string, AppScreen> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, AppScreen> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>).slice(0, 12)) {
    const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
    if (!FLOW_NAME.test(name) || typeof o.page !== 'string' || !/^[\w-]{1,40}$/.test(o.page)) continue;
    out[name] = { page: o.page, ...(short(o.title, 80) ? { title: short(o.title, 80) } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * What an app keeps, from anything: a map of collections, each { fields, description }, or a map of its
 * fields' names to kinds ({ "items": { "url": "url", "title": "text" } }), or {} for any records.
 */
export function cleanData(raw: unknown): { data?: Record<string, DataCollection>; errors: string[] } {
  const errors: string[] = [];
  if (raw === undefined || raw === null) return { errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['What it keeps ("data") is a map of collections, like { "items": { "title": "text" } }'] };
  const out: Record<string, DataCollection> = {};
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > DATA_LIMITS.collections) errors.push(`An app keeps at most ${DATA_LIMITS.collections} collections`);
  for (const [name, v] of entries.slice(0, DATA_LIMITS.collections)) {
    if (!COLLECTION.test(name)) {
      errors.push(`What it keeps: “${name.slice(0, 40)}” is not a name a collection can have (a letter, then letters, digits or _)`);
      continue;
    }
    const where = `What it keeps, ${name}`;
    const c: DataCollection = {};
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const structured = 'fields' in o || 'description' in o;
      const fields = cleanOutputs(structured ? o.fields : Object.keys(o).length ? o : undefined, errors, where);
      if (fields) {
        const own = fields.filter((f) => RECORD_KEYS.includes(f.id));
        if (own.length) errors.push(`${where}: ${own.map((f) => f.id).join(', ')} is a record's own (each has an id, createdAt and updatedAt)`);
        const kept = fields.filter((f) => !RECORD_KEYS.includes(f.id)).map((f) => ({ ...f, required: undefined }));
        if (kept.length) c.fields = kept;
      }
      const d = structured ? text(o.description, 400) : '';
      if (d) c.description = d;
    } else if (v !== true && v !== undefined && v !== null) errors.push(`${where}: give its fields ({ "title": "text" }) or {} for any records`);
    out[name] = c;
  }
  return { data: Object.keys(out).length ? out : undefined, errors };
}

// ---- values in text -------------------------------------------------------------------------------------

/** What a step sees: the run's inputs, the steps' values so far (null: it has not run), and names of the moment (item, index, error, today). */
export interface Scope {
  inputs: Record<string, unknown>;
  steps: Record<string, Record<string, unknown> | null>;
  vars: Record<string, unknown>;
}

/** "find.hotels[0].price" → ["find", "hotels", 0, "price"]; null when it is not a value's name. */
export function readPath(p: string): (string | number)[] | null {
  const out: (string | number)[] = [];
  for (const part of String(p ?? '').trim().split('.')) {
    const m = /^([A-Za-z_][\w-]*)((?:\[-?\d+\])*)$/.exec(part);
    if (!m) return null;
    out.push(m[1]);
    for (const n of m[2].matchAll(/\[(-?\d+)\]/g)) out.push(Number(n[1]));
  }
  return out.length ? out : null;
}

/** A value by its name, and whether the name means anything here. */
export function lookup(path: string, s: Scope): { found: boolean; value: unknown } {
  const parts = readPath(path);
  if (!parts) return { found: false, value: undefined };
  const [root, ...rest] = parts as [string, ...(string | number)[]];
  let v: unknown;
  if (root === 'inputs') v = s.inputs;
  else if (Object.prototype.hasOwnProperty.call(s.vars, root)) v = s.vars[root];
  else if (Object.prototype.hasOwnProperty.call(s.steps, root)) v = s.steps[root] ?? {};
  else if (BUILTIN_ROOTS.has(root)) v = root === 'run' ? {} : momentOf()[root as 'today'];
  else if (Object.prototype.hasOwnProperty.call(s.inputs, root)) v = s.inputs[root];
  else return { found: false, value: undefined };
  for (const k of rest) {
    if (v === null || v === undefined) break;
    if (typeof k === 'number') v = Array.isArray(v) ? v.at(k) : undefined;
    else v = typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>)[k] : undefined;
  }
  return { found: true, value: v };
}

/** Whether a value counts as there: not empty, not No, not false, not 0. */
export function given(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0) return false;
  if (typeof v === 'string') return !!v.trim() && v.trim().toLowerCase() !== 'no';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

export const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Array.isArray(v) && !Object.keys(v).length);

const cellOf = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'object') return Array.isArray(v) ? v.map(cellOf).join('; ') : JSON.stringify(v);
  return String(v);
};

/** Rows as a Markdown table, its columns every key the rows have. */
function mdTable(rows: unknown[]): string {
  const recs = rows.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, unknown>) : { value: r }));
  const cols: string[] = [];
  for (const r of recs) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const esc = (v: unknown) => cellOf(v).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  return [`| ${cols.join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`, ...recs.map((r) => `| ${cols.map((c) => esc(r[c])).join(' | ')} |`)].join('\n');
}

/** A value as text for instructions: lists as lines, rows as a table, a record as "name: value" lines. */
export function asText(v: unknown, max: number = FLOW_LIMITS.value): string {
  let s: string;
  if (v === null || v === undefined) s = '';
  else if (typeof v === 'string') s = v;
  else if (typeof v === 'number') s = String(v);
  else if (typeof v === 'boolean') s = v ? 'Yes' : 'No';
  else if (Array.isArray(v)) s = v.every((x) => x === null || typeof x !== 'object') ? v.map((x) => `- ${cellOf(x)}`).join('\n') : mdTable(v);
  else
    s = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${typeof x === 'string' && x.includes('\n') ? `\n${x}` : cellOf(x)}`)
      .join('\n');
  return s.length > max ? `${s.slice(0, max)}\n… (${(s.length - max).toLocaleString('en-US')} more characters left out)` : s;
}

/** Text with the values its {{names}} stand for; sections kept or dropped; names that mean nothing here stay as written. */
export function fillRefs(tpl: string, s: Scope, o: { max?: number } = {}): string {
  let out = String(tpl ?? '');
  const section = new RegExp(`\\{\\{([#^])\\s*(${REF})\\s*\\}\\}((?:(?!\\{\\{[#^]\\s*\\2\\s*\\}\\})[\\s\\S])*?)\\{\\{\\/\\s*\\2\\s*\\}\\}`, 'g');
  for (let i = 0; i < 20; i++) {
    const next = out.replace(section, (all, kind: string, p: string, body: string) => {
      const r = lookup(p, s);
      if (!r.found) return all;
      return (kind === '#') === given(r.value) ? body : '';
    });
    if (next === out) break;
    out = next;
  }
  out = out.replace(new RegExp(`\\{\\{\\s*(${REF})\\s*\\}\\}`, 'g'), (all, p: string) => {
    const r = lookup(p, s);
    return r.found ? asText(r.value, o.max) : all;
  });
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** A step's input as it goes to the tool: one {{name}} alone keeps its value as it is (a list stays a list); other text is filled. */
export function valueOf(v: unknown, s: Scope): unknown {
  if (typeof v === 'string') {
    const one = new RegExp(`^\\s*\\{\\{\\s*(${REF})\\s*\\}\\}\\s*$`).exec(v);
    if (one) {
      const r = lookup(one[1], s);
      return r.found ? (r.value ?? '') : v;
    }
    return fillRefs(v, s);
  }
  if (Array.isArray(v)) return v.map((x) => valueOf(x, s));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, valueOf(x, s)]));
  return v;
}

/** The values the rest of a template uses from a step, by name ({{read.text}} and {{read.data[0]}}: text, data). */
export function usedFrom(r: { flow?: Flow; flows?: Record<string, NamedFlow> }, id: string): string[] {
  const out = new Set<string>();
  for (const p of refsIn([r.flow ?? null, ...Object.values(r.flows ?? {})])) {
    const m = /^([A-Za-z_]\w*)\.([A-Za-z_]\w*)/.exec(p);
    if (m && m[1] === id) out.add(m[2]);
  }
  return [...out];
}

/** The names a text uses ({{x.y}}, and the x of {{#x}}), each once. */
export function refsIn(tpl: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') for (const m of v.matchAll(new RegExp(`\\{\\{\\s*[#^]?\\s*(${REF})\\s*\\}\\}`, 'g'))) out.add(m[1]);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(tpl);
  return [...out];
}

// ---- rules ------------------------------------------------------------------------------------------------

type Operand = { ref: string } | { lit: string };
type Op = 'truthy' | 'empty' | 'notEmpty' | '=' | '!=' | '<' | '>' | '<=' | '>=' | 'contains' | 'notContains';
interface Clause {
  left: Operand;
  op: Op;
  right?: Operand;
}

const OPS: [RegExp, Op][] = [
  [/^is not empty$/i, 'notEmpty'],
  [/^is empty$/i, 'empty'],
  [/^does not contain$/i, 'notContains'],
  [/^contains$/i, 'contains'],
  [/^(?:!=|≠|is not)$/i, '!='],
  [/^(?:==?|is)$/i, '='],
  [/^<=$/, '<='],
  [/^>=$/, '>='],
  [/^<$/, '<'],
  [/^>$/, '>'],
];
const OP_RE = /\s+(is not empty|is empty|does not contain|contains|is not|is)(?=\s|$)\s*|\s*(!=|≠|<=|>=|==|=|<|>)\s*/i;

/**
 * A rule as clauses: a value compared with a value (=, !=, <, >, <=, >=, contains, does not contain), or
 * tested alone (is empty, is not empty, or just the value: whether it is there), joined by and / or (and
 * binds first). Values are {{names}}, numbers, "quoted text" or plain words.
 */
export function readRule(rule: string): { or: Clause[][] } | { error: string } {
  const kept: string[] = [];
  const masked = String(rule ?? '').replace(/\{\{[^{}]*\}\}|"[^"]*"|'[^']*'/g, (m) => `\u0000${kept.push(m) - 1}\u0000`);
  const unmask = (t: string) => t.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => kept[Number(n)]);
  const operand = (raw: string): Operand | null => {
    const t = unmask(raw.trim());
    if (!t) return null;
    const ref = new RegExp(`^\\{\\{\\s*(${REF})\\s*\\}\\}$`).exec(t);
    if (ref) return { ref: ref[1] };
    if (/^\{\{/.test(t)) return null;
    const q = /^"([^"]*)"$|^'([^']*)'$/.exec(t);
    return { lit: q ? (q[1] ?? q[2]) : t };
  };
  const bad = { error: `The rule “${String(rule).slice(0, 80)}” could not be read: write it like {{price}} < 100, {{kind}} = bug or {{notes}} is not empty` };
  if (!masked.trim()) return bad;
  const or: Clause[][] = [];
  for (const group of masked.split(/\s+or\s+/i)) {
    const and: Clause[] = [];
    for (const c of group.split(/\s+and\s+/i)) {
      const m = OP_RE.exec(c);
      if (!m) {
        const left = operand(c);
        if (!left) return bad;
        and.push({ left, op: 'truthy' });
        continue;
      }
      const opText = (m[1] ?? m[2]).trim();
      const op = OPS.find(([re]) => re.test(opText))?.[1];
      const left = operand(c.slice(0, m.index));
      const rightRaw = c.slice(m.index + m[0].length);
      if (!op || !left) return bad;
      if (op === 'empty' || op === 'notEmpty') {
        if (rightRaw.trim()) return bad;
        and.push({ left, op });
        continue;
      }
      const right = operand(rightRaw);
      if (!right) return bad;
      and.push({ left, op, right });
    }
    or.push(and);
  }
  return { or };
}

const asBool = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' ? true : s === 'no' || s === 'false' ? false : null;
};
const asNum = (v: unknown): number | null => (typeof v === 'boolean' ? null : readNumber(v as string | number));
const norm = (v: unknown) => (typeof v === 'string' ? v : cellOf(v)).trim().toLowerCase();

/** Whether two values are the same: numbers as numbers, yes and no as such, text without case. */
export function same(a: unknown, b: unknown): boolean {
  const x = asNum(a);
  const y = asNum(b);
  if (x !== null && y !== null) return x === y;
  const p = asBool(a);
  const q = asBool(b);
  if (p !== null && q !== null) return p === q;
  return norm(a) === norm(b);
}

/** How two values compare (numbers, or dates); null when they cannot be. */
export function order(a: unknown, b: unknown): number | null {
  const x = asNum(a);
  const y = asNum(b);
  if (x !== null && y !== null) return x - y;
  const d = typeof a === 'string' ? readDate(a) : null;
  const e = typeof b === 'string' ? readDate(b) : null;
  if (d && e && /^\d{4}-\d{2}-\d{2}$/.test(d) && /^\d{4}-\d{2}-\d{2}$/.test(e)) return d < e ? -1 : d > e ? 1 : 0;
  return null;
}

/** Whether a rule holds with these values; throws, in words, when it cannot be read. */
export function evalRule(rule: string, s: Scope): boolean {
  const r = readRule(rule);
  if ('error' in r) throw new Error(r.error);
  const val = (o: Operand | undefined) => (!o ? undefined : 'ref' in o ? lookup(o.ref, s).value : o.lit);
  return r.or.some((and) =>
    and.every((c) => {
      const a = val(c.left);
      const b = val(c.right);
      switch (c.op) {
        case 'truthy':
          return given(a);
        case 'empty':
          return isEmpty(a);
        case 'notEmpty':
          return !isEmpty(a);
        case '=':
          return same(a, b);
        case '!=':
          return !same(a, b);
        case 'contains':
        case 'notContains': {
          const has = Array.isArray(a) ? a.some((x) => same(x, b)) : norm(asText(a)).includes(norm(b));
          return c.op === 'contains' ? has : !has;
        }
        default: {
          const o = order(a, b);
          if (o === null) return false;
          return c.op === '<' ? o < 0 : c.op === '>' ? o > 0 : c.op === '<=' ? o <= 0 : o >= 0;
        }
      }
    }),
  );
}

// ---- installing ----------------------------------------------------------------------------------------------

/** How what a template needs stands on this computer: nothing to install, installing, ready, failed, or its needs changed since. */
export interface EnvView {
  state: 'none' | 'installing' | 'ready' | 'failed' | 'outdated';
  /** Commands it needs that are not on this computer. */
  missing: string[];
  /** The end of the last install's output. */
  log?: string;
  error?: string;
  at?: number;
}

/** What a template from a file will do here, shown before it is installed. */
export interface InstallPreview {
  name: string;
  description: string;
  icon: string;
  color: string;
  category?: string;
  /** What it asks, gives and does, in plain terms (shared/app-summary.ts), for the card's first part. */
  summary: AppSummary;
  /** How many steps it has (0: one agent does the task). */
  steps: number;
  /** Who does the work: each agent (and model) once. */
  agents: string[];
  /** The app's own tools its runs may use; null: all of them. */
  tools: string[] | null;
  /** Other templates its steps call. */
  apps: string[];
  /** The collections it keeps, with how many records come with it. */
  data: { name: string; records: number }[];
  memory: boolean;
  limits: { runsPerDay?: number; capUsd?: number };
  /** What it installs for itself (Node and Python packages), and commands it needs that are, or are not, on this computer. */
  needs: { node: string[]; python: string[]; commands: string[]; missing: string[] };
  /**
   * The models it asks for: here as they are, the same one under another name here, or not here (then
   * `options` lists what could stand in; `use` is the one picked unless you pick another; "" for the agent's default).
   */
  models: { as: string; agent: 'claude' | 'codex' | 'custom'; label: string; status: 'here' | 'matched' | 'provider' | 'missing'; use?: string; options: { value: string; label: string }[] }[];
  /** Its screens, by name. */
  screens: string[];
  /** Templates that come with it (those it calls): each installed first, or the one you have used again. */
  bundled: { name: string; from: string; installs: 'new' | 'reuse' }[];
  /** The keys it (and what comes with it) needs, and whether the vault has each already. */
  secrets: AppSecretState[];
  /** Its own files (pictures, videos, data its view shows), with their types and sizes. */
  files: { name: string; mime: string; bytes: number }[];
  /** What its view runs of its own: its widgets' names, and the libraries they load ("three 0.170.0"). */
  view: { widgets: string[]; libs: string[] };
  /** A ready-made app's file: which, and whether it is installed here (then this makes a copy of your own). */
  builtin?: { id: string; installed: boolean };
  /** What changes on the way in (its folder, a mode that skips asking). */
  notes: string[];
  warnings: string[];
  /** Why it cannot be installed. */
  problems: string[];
}

// ---- checks ------------------------------------------------------------------------------------------------

/** The values a step gives, by name, where they are known before it runs (null: any). */
export function givesOf(s: Step): string[] | null {
  switch (s.do) {
    case 'agent':
      return [...(s.outputs ?? []).map((f) => f.id), 'reply'];
    case 'model':
      return s.outputs?.length ? s.outputs.map((f) => f.id) : ['text'];
    case 'tool':
      return ['text', 'data'];
    case 'decide':
      return ['yes', 'why'];
    case 'repeat':
      return ['items', 'count', 'last'];
    case 'data':
      return { add: ['record', 'id'], get: ['record', 'found'], find: ['records', 'count', 'first'], search: ['records', 'count', 'first', 'meaning'], update: ['records', 'count'], remove: ['count'] }[s.op];
    case 'ask':
      return s.fields?.length ? s.fields.map((f) => f.id) : ['yes'];
    case 'code':
      return s.outputs?.length ? [...s.outputs.map((f) => f.id), 'printed'] : null;
    case 'value':
      return ['value'];
    default:
      return null;
  }
}

interface Seen {
  step: Step;
  /** Why it may not have run by the time a later step looks (a Decide's path, its own rule, a step failing). */
  maybe: string | null;
}

/**
 * What is wrong with a flow (errors: it cannot be saved) and what may surprise (warnings), in plain
 * words: values it uses that come later, sit inside a Repeat, run at the same time, or name nothing;
 * rules that cannot be read; tools a step cannot call on its own; answer fields nothing gives.
 */
export function checkFlow(r: { fields: AppField[]; answer: AnswerField[]; flow?: Flow; data?: Record<string, DataCollection>; flows?: Record<string, NamedFlow> }, o: { named?: boolean } = {}): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Each flow beside the main one: its own form (its inputs), and outputs of its own names.
  if (!o.named)
    for (const [name, f] of Object.entries(r.flows ?? {})) {
      const c = checkFlow({ fields: f.inputs ?? [], answer: [], flow: f, data: r.data }, { named: true });
      errors.push(...c.errors.map((e) => `Flow “${name}”: ${e}`));
      warnings.push(...c.warnings.map((w) => `Flow “${name}”: ${w}`));
    }
  const flow = r.flow;
  if (!flow) return { errors, warnings };
  const all = allSteps(flow.steps);
  const byId = new Map(all.map((s) => [s.id, s]));
  const fieldIds = new Set(r.fields.map((f) => f.id));
  /** Steps inside a Repeat, by the Repeat that holds them. */
  const inLoop = new Map<string, string>();
  for (const s of all) if (s.do === 'repeat') for (const inner of allSteps(s.steps)) if (!inLoop.has(inner.id)) inLoop.set(inner.id, s.id);
  const note = (list: string[], msg: string) => {
    if (!list.includes(msg) && list.length < 40) list.push(msg);
  };

  const checkRefs = (where: string, value: unknown, seen: Map<string, Seen>, names: Set<string>, siblings: Set<string>) => {
    for (const p of refsIn(value)) {
      const parts = readPath(p);
      if (!parts) continue;
      const root = String(parts[0]);
      const field = parts.length > 1 && typeof parts[1] === 'string' ? parts[1] : null;
      if (root === 'inputs') {
        if (field && !fieldIds.has(field)) note(errors, `${where} uses {{${p}}}: there is no question “${field}” in the form`);
        continue;
      }
      if (root === 'run') {
        if (field && field !== 'id' && field !== 'source') note(errors, `${where} uses {{${p}}}: a run gives id and source`);
        continue;
      }
      if (BUILTIN_ROOTS.has(root) || names.has(root)) continue;
      const at = seen.get(root);
      if (at) {
        const gives = givesOf(at.step);
        if (field && gives && !gives.includes(field)) note(errors, `${where} uses {{${p}}}: “${root}” gives ${gives.join(', ')}`);
        if (at.maybe) note(warnings, `${where} uses {{${p}}}, which is empty when ${at.maybe}`);
        continue;
      }
      if (byId.has(root)) {
        const loop = inLoop.get(root);
        if (loop && !names.has(`loop:${loop}`)) note(errors, `${where} uses {{${p}}}: “${root}” runs once for each round of “${loop}”, so use {{${loop}.items}} or {{${loop}.last}}`);
        else if (siblings.has(root)) note(errors, `${where} uses {{${p}}}: “${root}” runs at the same time, in another branch, so it has no value yet`);
        else note(errors, `${where} uses {{${p}}}, but “${root}” comes later in the flow`);
        continue;
      }
      if (fieldIds.has(root)) continue;
      note(warnings, `${where} uses {{${p}}}, which names no question or step, so it stays as written`);
    }
  };

  const checkRule = (where: string, rule: string | undefined) => {
    if (!rule) return;
    const x = readRule(rule);
    if ('error' in x) note(errors, `${where}: ${x.error}`);
  };

  /** Walks a list of steps in order; `seen` holds the steps before, as they look from here. */
  const walk = (steps: Step[], seen: Map<string, Seen>, names: Set<string>, maybe: string | null, siblings: Set<string>) => {
    for (const s of steps) {
      const where = `Step “${s.id}”`;
      checkRule(`${where}, its rule`, s.if);
      checkRefs(where, [s.if], seen, names, siblings);
      switch (s.do) {
        case 'agent':
        case 'model':
          checkRefs(where, s.instructions, seen, names, siblings);
          break;
        case 'tool':
          if (s.tool && !STEP_TOOLS.includes(s.tool)) note(errors, `${where}: ${s.tool} cannot run as a step on its own; use it in an Ask an agent step (on their own: ${STEP_TOOLS.join(', ')})`);
          checkRefs(where, s.with, seen, names, siblings);
          break;
        case 'app':
          checkRefs(where, s.with, seen, names, siblings);
          break;
        case 'ask':
          checkRefs(where, s.question, seen, names, siblings);
          break;
        case 'code':
          checkRefs(where, s.with, seen, names, siblings);
          break;
        case 'data': {
          const c = r.data?.[s.collection];
          if (!c) note(errors, `${where}: the app keeps no collection “${s.collection}”${r.data ? ` (it keeps ${Object.keys(r.data).join(', ')})` : ': add it under What it keeps (data)'}`);
          else if (c.fields) {
            const known = new Set([...c.fields.map((f) => f.id), ...RECORD_KEYS]);
            for (const k of [...Object.keys(s.with ?? {}), ...Object.keys(s.where ?? {})]) if (!known.has(k)) note(errors, `${where}: “${s.collection}” has no field “${k}” (it has ${c.fields.map((f) => f.id).join(', ')})`);
          }
          checkRefs(where, [s.with, s.where, s.record, s.search, s.query], seen, names, siblings);
          break;
        }
        case 'decide': {
          checkRule(where, s.rule);
          checkRefs(where, [s.rule, s.ask], seen, names, siblings);
          const why = `the decision “${s.id}” goes the other way`;
          // Within one path its steps run together; only the steps after the decision may find them empty.
          const a = new Map(seen);
          walk(s.then, a, names, maybe, siblings);
          const b = new Map(seen);
          walk(s.else ?? [], b, names, maybe, siblings);
          for (const inner of [...allSteps(s.then), ...allSteps(s.else ?? [])]) if (!inLoop.has(inner.id) || inLoop.get(inner.id) !== inLoop.get(s.id)) seen.set(inner.id, { step: inner, maybe: maybe ?? why });
          break;
        }
        case 'repeat': {
          checkRule(`${where}, until`, s.until);
          checkRefs(where, [s.over], seen, names, siblings);
          if (s.over && !new RegExp(`^\\s*\\{\\{\\s*${REF}\\s*\\}\\}\\s*$`).test(s.over)) note(errors, `${where}: what it goes through is one value, like "{{find.items}}"`);
          const inner = new Set(names);
          inner.add(s.as ?? 'item');
          inner.add('index');
          inner.add(`loop:${s.id}`);
          const round = new Map(seen);
          // Again until something holds: a round sees what its later steps gave in the round before (none in the first).
          if (s.over === undefined && (s.until || s.untilAsk)) for (const x of allSteps(s.steps)) round.set(x.id, { step: x, maybe: maybe ?? `it is the first round of “${s.id}”` });
          walk(s.steps, round, inner, maybe, siblings);
          // Whether to stop is asked at the end of each round, with that round's values.
          checkRefs(`${where}, until`, [s.until, s.untilAsk], round, inner, siblings);
          if (s.collect && !allSteps(s.steps).some((x) => x.id === s.collect)) note(errors, `${where}: “${s.collect}”, whose values make each round's record, is not one of its steps`);
          break;
        }
        case 'parallel': {
          const ids = s.branches.map((b) => new Set(allSteps(b).map((x) => x.id)));
          s.branches.forEach((b, i) => {
            const others = new Set(siblings);
            ids.forEach((set, j) => j !== i && set.forEach((x) => others.add(x)));
            walk(b, new Map(seen), names, maybe, others);
          });
          for (const b of s.branches) for (const inner of allSteps(b)) if (!inLoop.has(inner.id) || inLoop.get(inner.id) !== inLoop.get(s.id)) seen.set(inner.id, { step: inner, maybe: maybe });
          break;
        }
      }
      // An agent that stands in for a failed step gives its values all the same.
      const own = maybe ?? (s.if ? `the rule of “${s.id}” does not hold` : s.failed && s.failed !== 'agent' ? `“${s.id}” fails` : null);
      if (Array.isArray(s.failed)) {
        const withError = new Set(names);
        withError.add('error');
        walk(s.failed, new Map(seen), withError, maybe, siblings);
        for (const inner of allSteps(s.failed)) seen.set(inner.id, { step: inner, maybe: maybe ?? `“${s.id}” does not fail` });
      }
      seen.set(s.id, { step: s, maybe: own });
    }
  };
  const seen = new Map<string, Seen>();
  walk(flow.steps, seen, new Set(), null, new Set());

  const answerIds = new Set(r.answer.map((f) => f.id));
  if (flow.outputs) {
    for (const [k, v] of Object.entries(flow.outputs)) {
      if (!o.named && !answerIds.has(k)) note(errors, `What it gives back: “${k}” is not one of the answer fields${answerIds.size ? ` (${[...answerIds].join(', ')})` : ' (it has none)'}`);
      checkRefs(`What it gives back, ${k},`, v, seen, new Set(), new Set());
    }
  }
  const produced = new Set(all.flatMap((s) => givesOf(s) ?? []));
  for (const f of r.answer) {
    if (!f.required || flow.outputs?.[f.id]) continue;
    if (!produced.has(f.id) && !all.some((s) => s.do === 'app')) note(warnings, `No step gives “${f.id}”, which the app gives back: name it in a step's outputs, or map it under outputs`);
  }
  return { errors, warnings };
}
