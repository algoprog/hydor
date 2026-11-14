// The JSON Schema of a template's app.json (its folder, /api/apps/schema.json), for an editor's completion and
// checks as it is written; and the types of a code step's file. The app checks a template itself when it is
// saved, in words: this only helps write it.
import { STEP_KINDS, STEP_TOOLS } from '../../shared/app-manifest.ts';
import { ANSWER_TYPES, APP_COLORS, APP_ICONS, FIELD_TYPES } from '../../shared/apps.ts';
import { BUILTIN_ELEMENTS, UI_ACTIONS } from '../../shared/app-ui.ts';

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
      options: { type: 'array', items: { type: 'string' }, description: 'A choice’s options. In an Ask a person step, an option that is one {{step.value}} gives that list’s items (what an earlier step found), picked at the moment it asks' },
      multi: { type: 'boolean', description: 'A choice: more than one may be picked; its value has one per line' },
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
      outputs: { ...outputs, description: `${outputs.description}; code: the fields of the object it returns` },
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
      app: str('app: another app’s address'),
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
      language: { enum: ['javascript', 'typescript', 'python'] },
      code: textOrFile('code: the body of a function of input and ctx that returns the step’s values (in a file of steps/: the function, as written there); ctx.model, ctx.agent, ctx.tool, ctx.ask, ctx.data and ctx.app are steps of the run'),
      seconds: { type: 'number', description: 'code: most seconds it may take (1 to 120)' },
      of: str('value: what it works on ({{find.records}})'),
      op: { description: 'data: add, get, find, search, update or remove; value: first, last, count, sum, average, min, max, pick, join, unique, sort, number or date', type: 'string' },
      arg: str('value: pick: the field; sum, average, min, max: of this field of each; sort: by this field ("-price": highest first); join: between the items; date: days to add'),
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
    title: 'A Hydor app (app.json)',
    type: 'object',
    $defs: { step, field, answerField, flow },
    properties: {
      $schema: { type: 'string' },
      name: str('Its name (60 characters at most)'),
      description: str('What it does, in a sentence'),
      icon: { enum: [...APP_ICONS] },
      color: { enum: Object.keys(APP_COLORS) },
      category: str('Its group on the Apps page'),
      assistant: str('An assistant’s id, which its agents work as'),
      agent: { enum: ['claude', 'codex', 'acp'], description: 'Who does the work: Claude Code, Codex, or Custom (acp)' },
      acpAgent: str('acp: which one ("console" = Custom)'),
      model: str('Its agent’s model'),
      effort: str('Its agent’s effort'),
      mode: str('Its agent’s mode (runs go ahead without asking unless set)'),
      cwd: str('The folder every run works in (unset: a new one per run)'),
      prompt: textOrFile('The task for one agent, with {{field}} where each answer goes (an app without steps)'),
      fields: { type: 'array', items: { $ref: '#/$defs/field' }, description: 'Its form' },
      answer: { type: 'array', items: { $ref: '#/$defs/answerField' }, description: 'What a run gives back' },
      tools: { type: ['array', 'null'], items: { type: 'string' }, description: 'The app’s own tools its runs may use (null: all)' },
      limits: { type: 'object', properties: { runsPerDay: { type: 'number' }, capUsd: { type: 'number' } } },
      flow: { $ref: '#/$defs/flow', description: 'What it does, step by step' },
      flows: { type: 'object', additionalProperties: { $ref: '#/$defs/flow' }, description: 'Flows beside the main one, which its screens start' },
      data: { type: 'object', description: 'What it keeps between runs: lists, each { field: kind } or { fields: [...] }', additionalProperties: true },
      memory: { type: 'boolean', description: 'Its agents remember across its runs' },
      requires: { type: 'object', description: 'What it needs on this computer: node and python packages, commands, models', additionalProperties: true },
      secrets: {
        type: 'array',
        description: 'The keys it needs (API keys, tokens), by their names in the vault; never a value. Asked for when it is installed, or before it runs without them.',
        items: {
          type: 'object',
          properties: {
            name: str('Its name in the vault: capitals, digits and _ (OPENWEATHER_API_KEY)'),
            label: str('What it is, in a few words'),
            help: str('How to get it, in a line'),
            url: str('Where to get one (https://…)'),
            domains: { type: 'array', items: { type: 'string' }, description: 'The hosts it may be sent to (api.example.com)' },
            commands: { type: 'boolean', description: 'Commands on this computer use it (run_with_secrets)' },
            header: str('The header http_request sends it in (Authorization unless set)'),
            prefix: str('What goes before it in that header ("Bearer ")'),
            query: str('Or the query parameter it goes in'),
            optional: { type: 'boolean', description: 'It runs without it, doing less' },
            flows: { type: 'array', items: { type: 'string' }, description: 'Only these of its flows need it ("run" is the main one): asked for when one of them runs' },
          },
          required: ['name', 'label'],
        },
      },
      assets: { type: 'object', description: 'Its own files, by name (asset:<name> in its view): kept by the app, packed in its .hydor-app under assets/', additionalProperties: { type: 'object', properties: { sha: { type: 'string' }, mime: { type: 'string' }, bytes: { type: 'number' }, caption: { type: 'string' } } } },
      examples: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, inputs: { type: 'object' }, checks: { type: 'array', items: { type: 'string' } } } } },
      screens: { type: 'object', additionalProperties: { type: 'object', properties: { file: { type: 'string' }, title: { type: 'string' } } }, description: 'Its screens, each a page in screens/' },
      ui: uiSchema(),
    },
    required: ['name'],
  };
}

/** Its view: pages of blocks, elements (templates its values fill), events (what a click does). */
function uiSchema(): Record<string, unknown> {
  const action = {
    type: 'object',
    properties: {
      do: { enum: UI_ACTIONS.map((a) => a.value), description: UI_ACTIONS.map((a) => `${a.value}: ${a.label}`).join('; ') },
      confirm: str('Asks this first; no stops the event'),
      page: str('page: the page to go to'),
      item: { description: 'page: what {{page.item}} is there ("{{item}}")' },
      name: str('set, toggle: the value’s name in the view’s state ("picked", "done.@key")'),
      value: { description: 'set: its value' },
      keep: { type: 'boolean', description: 'set, toggle: kept with the run (or the app)' },
      text: str('ask, say, copy: the text, with {{values}}'),
      flow: str('run: one of its flows ("run": the main one)'),
      inputs: values('run, again, start: the answers (again: only those that change)'),
      as: str('run: its run’s name in the view’s state'),
      app: str('start: an app’s id or address, or "tpl:<id>" for a ready-made one'),
      op: { enum: ['add', 'update', 'remove'], description: 'data: what to do' },
      collection: str('data: the list of records'),
      record: values('data add: the record; update: what changes'),
      id: str('data update, remove: the record’s id ("{{item.id}}")'),
      url: str('open: an address'),
    },
    required: ['do'],
  };
  const block = {
    type: 'object',
    properties: {
      title: str('A heading over it'),
      element: str(`One of its elements, or a built-in one: ${BUILTIN_ELEMENTS.map((e) => e.value).join(', ')}`),
      html: str('A template of its own, for this place only'),
      text: str('Text with {{values}}, in Markdown'),
      data: str('What fills it: "result.days", "inputs", "data.items", "state.picked", "page.item"'),
      each: { type: 'boolean', description: 'Drawn once for each item of the list data names' },
      where: values('Only the items that match ({ "topic": "{{state.topic}}" }; an empty value matches all)'),
      sort: str('The field to sort by ("-field": highest first)'),
      limit: { type: 'number' },
      layout: { enum: ['list', 'grid', 'row'] },
      width: { enum: ['full', 'half', 'third', 'two-thirds'] },
      empty: str('What shows when there is nothing'),
      if: str('Shown only when this value is there ("result.flags", "!state.picked")'),
      with: values('A built-in element’s settings (columns, label, value, flow…)'),
    },
  };
  return {
    type: 'object',
    description: 'Its view: how its answer looks (pages of blocks, its own elements) and what a click does (events)',
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: str('Its name, for events ({ "do": "page", "page": "<id>" })'),
            title: str('Its tab'),
            on: { enum: ['run', 'app'], description: 'run: a run’s page (the default); app: the app’s own page' },
            tab: { type: 'boolean', description: 'false: no tab, reached by an event' },
            if: str('Shown only when this value is there'),
            blocks: { type: 'array', items: block },
          },
          required: ['id', 'title', 'blocks'],
        },
      },
      elements: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: { html: textOrFile('HTML with {{values}}, {{#list}}…{{/list}}, data-event="name"'), css: textOrFile('Its style: rules for what is inside it, & for itself'), description: str('What it shows') },
          required: ['html'],
        },
      },
      events: { type: 'object', additionalProperties: { type: 'array', items: action } },
      style: textOrFile('CSS for the whole view'),
      widgets: {
        type: 'object',
        description: 'Elements drawn by a script of their own (a 3D scene, a chart library, a game): placed by blocks as elements are',
        additionalProperties: {
          type: 'object',
          properties: {
            code: textOrFile('An ES module: export default function (el, value, view) { … } draws it in el (value: what fills it; view: with, theme, lang, asset(name), media(src), event(name, item), set(name, value), state, resize()); it may return a function that cleans up'),
            css: textOrFile('Its style: rules for what it draws, & for itself'),
            description: str('What it shows'),
            height: str('Its height until it draws ("360px")'),
          },
          required: ['code'],
        },
      },
      libs: { type: 'object', additionalProperties: { type: 'string' }, description: 'npm packages its widgets import, at exact versions, loaded from jsDelivr: { "three": "0.170.0", "chart.js/auto": "4.4.6", "leaflet/dist/leaflet.css": "1.9.4" }' },
    },
    required: ['pages'],
  };
}

/** The types of a code step, for an editor to check its file with. */
export const STEP_TYPES = `// A code step of a Hydor app. It runs in a sandbox: no network, none of this computer's files but
// the app's own packages (requires.node / requires.python in app.json), and a time limit (not counting
// the time its ctx calls take). It reaches the world outside only through ctx: each call is a step of the run,
// kept, so when the run starts again after a restart, the program runs again and a call it made before gives
// what it gave then. Make the same calls in the same order for the same input, so they can.
/** The values the step is given (its "with" in app.json), by name. */
export type StepInput = Record<string, any>;
/** What the step gives: an object's fields are its values ({{step.field}}); anything else is {{step.result}}. What it prints is {{step.printed}}. */
export type StepValues = Record<string, unknown> | unknown;
/** Answer kinds: text, long, number, yesno, date, url, list, table(column: kind, …). */
export type Outputs = Record<string, string>;
interface Said {
  /** Values its words use by {{name}} (those not named come after the words). */
  with?: Record<string, unknown>;
  /** What the step is called on the run's page. */
  title?: string;
}
export interface Ctx {
  /** One answer from a model, with no tools: its outputs' fields, or { text }. model: one of Custom's (unset: the helper model). */
  model(instructions: string, o?: Said & { outputs?: Outputs; model?: string }): Promise<Record<string, any>>;
  /** An agent's session does it, with its tools: its outputs' fields, and { reply }. */
  agent(instructions: string, o?: Said & { outputs?: Outputs; assistant?: string; agent?: 'claude' | 'codex' | 'acp'; model?: string; tools?: string[]; capUsd?: number }): Promise<Record<string, any>>;
  /** One of the app's own tools (web_search, read_page, http_request, read_document, generate_image, knowledge_search, knowledge_read, recall, notify_user): { text, data? }. */
  tool(tool: string, inputs?: Record<string, unknown>, o?: { title?: string }): Promise<{ text: string; data?: unknown }>;
  /** Waits for the person: { yes }, or its fields' answers. */
  ask(question: string, o?: Said & { fields?: { id: string; label: string; type?: string; required?: boolean; options?: string[]; multi?: boolean }[]; waitHours?: number }): Promise<Record<string, any>>;
  /** Another of the user's apps, by its address: its answer fields, and { reply }. */
  app(app: string, inputs?: Record<string, unknown>, o?: { title?: string }): Promise<Record<string, any>>;
  /** The records the app keeps (the lists its data names). */
  data: {
    add(collection: string, record: Record<string, unknown>): Promise<{ record: Record<string, any>; id: string }>;
    get(collection: string, id: string): Promise<{ record: Record<string, any> | null; found: boolean }>;
    find(collection: string, o?: { where?: Record<string, unknown>; search?: string; sort?: string; limit?: number }): Promise<{ records: Record<string, any>[]; count: number; first: Record<string, any> | null }>;
    search(collection: string, query: string, o?: { mode?: 'auto' | 'words' | 'meaning'; limit?: number }): Promise<{ records: Record<string, any>[]; count: number; first: Record<string, any> | null; meaning: boolean }>;
    update(collection: string, o: { id?: string; where?: Record<string, unknown>; set: Record<string, unknown> }): Promise<{ records: Record<string, any>[]; count: number }>;
    remove(collection: string, o: { id?: string; where?: Record<string, unknown> }): Promise<{ count: number }>;
  };
}
export default function step(input: StepInput, ctx: Ctx): StepValues | Promise<StepValues>;
`;
