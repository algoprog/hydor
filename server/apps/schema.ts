// The JSON Schema of a template's app.json (its folder, /api/apps/schema.json), for an editor's completion and
// checks as it is written; and the types of a code step's file. The app checks a template itself when it is
// saved, in words: this only helps write it.
import { STEP_KINDS, STEP_TOOLS } from '../../shared/app-manifest.ts';
import { ANSWER_TYPES, APP_COLORS, APP_ICONS, FIELD_TYPES } from '../../shared/apps.ts';

const str = (description: string, more: Record<string, unknown> = {}) => ({ type: 'string', description, ...more });
/** Text, or a file of the folder that holds it. */
const textOrFile = (description: string) => ({ description, anyOf: [{ type: 'string' }, { type: 'object', properties: { file: { type: 'string', description: 'A file of this folder, from its top' } }, required: ['file'], additionalProperties: false }] });
const values = (description: string) => ({ type: 'object', description, additionalProperties: true });

export function appSchema(): Record<string, unknown> {
  const field = {
    type: 'object',
    properties: {
      id: str('Its name in the task and the steps ({{id}}), snake_case'),
      label: str('The question, as the person reads it'),
      type: { enum: FIELD_TYPES.map((f) => f.value), description: 'What kind of answer' },
      required: { type: 'boolean' },
      help: str('A line under the question'),
      placeholder: str('An example answer, shown in the empty box'),
      options: { type: 'array', items: { type: 'string' }, description: 'A choice’s options' },
      default: str('The answer it starts with'),
    },
    required: ['label'],
  };
  const answerField = {
    type: 'object',
    properties: {
      id: str('Its name in the result'),
      label: str('Its heading'),
      type: { enum: ANSWER_TYPES.map((t) => t.value) },
      description: str('What goes there'),
      required: { type: 'boolean' },
      columns: { type: 'array', items: { type: 'object' }, description: 'A table’s columns: { id, label, type }' },
    },
    required: ['label'],
  };
  const outputs = { description: 'What the step hands in: { name: kind } (text, long, number, yesno, date, url, list, table(column: kind, …)), or a list like answer fields', anyOf: [{ type: 'object', additionalProperties: { type: 'string' } }, { type: 'array', items: answerField }] };
  const step = {
    type: 'object',
    description: 'One step. Its values are {{id.value}} to the steps after it.',
    properties: {
      id: str('Its name, which other steps use its values by: a letter, then letters, digits or _'),
      title: str('What it is called on screen'),
      do: { enum: STEP_KINDS.map((k) => k.value), description: STEP_KINDS.map((k) => `${k.value}: ${k.hint}`).join('; ') },
      if: str('A rule: it runs only when this holds ({{price}} < 100 and {{kind}} = bug)'),
      failed: { description: 'When it fails: steps to run instead, "skip" to go on without it, or "agent" for an agent to do its work', anyOf: [{ type: 'array', items: { $ref: '#/$defs/step' } }, { enum: ['skip', 'agent'] }] },
      instructions: textOrFile('agent, model: what it is asked to do, with {{values}}'),
      outputs,
      agent: { enum: ['claude', 'codex', 'acp'] },
      model: str('agent: its model; model: one of Custom’s (unset: the helper model)'),
      tools: { type: ['array', 'null'], items: { type: 'string' } },
      capUsd: { type: 'number', description: 'agent: most it may spend, in US dollars' },
      tool: { enum: STEP_TOOLS, description: 'tool: which of the app’s own tools' },
      with: values('tool, app, code: its inputs, each a value or text with {{values}}; data: the record, or what to change'),
      rule: str('decide: a rule'),
      ask: str('decide: or a question in words, answered yes or no'),
      then: { type: 'array', items: { $ref: '#/$defs/step' } },
      else: { type: 'array', items: { $ref: '#/$defs/step' } },
      over: str('repeat: the list it goes through ({{find.records}})'),
      until: str('repeat: or again until this rule holds'),
      untilAsk: str('repeat: or until this question is answered yes'),
      max: { type: 'number' },
      atOnce: { type: 'number', description: 'repeat: how many items at once (1 to 6)' },
      as: str('repeat: what its steps call the item ("item" unless set)'),
      collect: str('repeat: the step whose values make each round’s record'),
      steps: { type: 'array', items: { $ref: '#/$defs/step' } },
      branches: { type: 'array', items: { type: 'array', items: { $ref: '#/$defs/step' } } },
      app: str('app: another template’s address'),
      op: { enum: ['add', 'get', 'find', 'search', 'update', 'remove'] },
      collection: str('data: the list (one its data names)'),
      record: str('data: one record’s id'),
      where: values('data: which records: { field: value }, or { field: { "<": 10 } }'),
      search: str('data, find: words to look for'),
      query: str('data, search: a question, answered by words and by meaning'),
      sort: str('data, find: the field to sort by ("-price": highest first)'),
      limit: { type: 'number' },
      question: str('ask: what the person is asked, with {{values}}'),
      fields: { type: 'array', items: field, description: 'ask: its form (none: yes or no)' },
      waitHours: { type: 'number' },
      language: { enum: ['javascript', 'python'] },
      code: textOrFile('code: the body of a function of input that returns the step’s values (in a file of steps/: the function, as written there)'),
      seconds: { type: 'number', description: 'code: most seconds it may take (1 to 120)' },
    },
    required: ['do'],
  };
  const flow = {
    type: 'object',
    properties: { steps: { type: 'array', items: { $ref: '#/$defs/step' } }, outputs: { type: 'object', additionalProperties: { type: 'string' }, description: 'Where each answer field comes from ({{step.value}})' } },
    required: ['steps'],
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'A Naget Agent template (app.json)',
    type: 'object',
    $defs: { step, field, answerField, flow },
    properties: {
      $schema: { type: 'string' },
      name: str('Its name (60 characters at most)'),
      description: str('What it does, in a sentence'),
      icon: { enum: [...APP_ICONS] },
      color: { enum: Object.keys(APP_COLORS) },
      category: str('Its group on the Templates page'),
      assistant: str('An assistant’s id, which its agents work as'),
      agent: { enum: ['claude', 'codex', 'acp'], description: 'Who does the work: Claude Code, Codex, or Custom (acp)' },
      acpAgent: str('acp: which one ("console" = Custom)'),
      model: str('Its agent’s model'),
      effort: str('Its agent’s effort'),
      mode: str('Its agent’s mode (runs go ahead without asking unless set)'),
      cwd: str('The folder every run works in (unset: a new one per run)'),
      prompt: textOrFile('The task for one agent, with {{field}} where each answer goes (a template without steps)'),
      fields: { type: 'array', items: { $ref: '#/$defs/field' }, description: 'Its form' },
      answer: { type: 'array', items: { $ref: '#/$defs/answerField' }, description: 'What a run gives back' },
      tools: { type: ['array', 'null'], items: { type: 'string' }, description: 'The app’s own tools its runs may use (null: all)' },
      limits: { type: 'object', properties: { runsPerDay: { type: 'number' }, capUsd: { type: 'number' } } },
      flow: { $ref: '#/$defs/flow', description: 'What it does, step by step' },
      flows: { type: 'object', additionalProperties: { $ref: '#/$defs/flow' }, description: 'Flows beside the main one, which its screens start' },
      data: { type: 'object', description: 'What it keeps between runs: lists, each { field: kind } or { fields: [...] }', additionalProperties: true },
      memory: { type: 'boolean', description: 'Its agents remember across its runs' },
      requires: { type: 'object', description: 'What it needs on this computer: node and python packages, commands, models', additionalProperties: true },
      examples: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, inputs: { type: 'object' }, checks: { type: 'array', items: { type: 'string' } } } } },
      screens: { type: 'object', additionalProperties: { type: 'object', properties: { file: { type: 'string' }, title: { type: 'string' } } }, description: 'Its screens, each a page in screens/' },
    },
    required: ['name'],
  };
}

/** The types of a code step, for an editor to check its file with. */
export const STEP_TYPES = `// A code step of a Naget Agent template. It runs in a sandbox: no network, none of this computer's files but
// the template's own packages (requires.node / requires.python in app.json), and a time limit.
/** The values the step is given (its "with" in app.json), by name. */
export type StepInput = Record<string, any>;
/** What the step gives: an object's fields are its values ({{step.field}}); anything else is {{step.result}}. What it prints is {{step.printed}}. */
export type StepValues = Record<string, unknown> | unknown;
export default function step(input: StepInput): StepValues | Promise<StepValues>;
`;
