// `hydor agents`: the Agents page. List (as `hydor agents` always printed), show, new, edit and remove, with the fields
// the page edits as options (and where results go, --results-to), results: an agent's history of what it handed
// back, and export and install: an agent as a .hydor-agent file, and one installed from such a file (what it brings and
// needs said first). The API calls them assistants. Built-in agents can be copied (`new --from`), not changed.
import fs from 'node:fs';
import path from 'node:path';
import { agentFileName, type AgentFile, type AgentInstallPreview } from '../../../shared/agent-files.ts';
import type { AgentResults, Assistant, OutputTarget } from '../../../shared/assistants.ts';
import { ASSISTANT_ICONS, RESULTS_KEEP } from '../../../shared/assistants.ts';
import { enc } from '../client.ts';
import { tierName } from '../lines.ts';
import { tildify } from '../term.ts';
import { choose, fields, flag, markdown, num, pickOne, str, strs, table, UsageError, type Area, type Ctx, type OptionSpec, type Values } from './kit.ts';

const AGENT_HINT = 'hydor agents lists them';
const agent = { name: 'agent', kind: 'agent', pick: true } as const;
const TOOLS = ['read', 'edit', 'run', 'web', 'browser', 'computer', 'mcp'];
const TIERS = ['quick', 'standard', 'best', 'max'];
const MODES = ['ask', 'edits', 'full', 'plan'];

interface AgentsReply {
  assistants: Assistant[];
  taskRoot?: string;
  defaultTaskRoot?: string;
  cleanUp?: boolean;
}

const listAgents = async (ctx: Ctx): Promise<Assistant[]> => (await ctx.conn.api<AgentsReply>('GET', '/api/assistants')).assistants;

/** The agent named (its id, its name, or the start of either), or picked on a terminal. */
const findAgent = async (ctx: Ctx, given: string | undefined): Promise<Assistant> =>
  choose(ctx, await listAgents(ctx), given, { id: (a) => a.id, names: (a) => [a.name], what: 'agent', hint: AGENT_HINT, label: (a) => a.name, detail: (a) => a.description });

/** The fields `new` and `edit` both take. */
const FIELD_OPTIONS: Record<string, OptionSpec> = {
  description: { type: 'string', value: '<text>', desc: 'One line about it, up to 160 characters ("" clears it)' },
  instructions: { type: 'string', value: '<text>', desc: 'Who it is and how it works, in a few words' },
  file: { type: 'string', value: '<path>', desc: 'Its instructions from a file (- is stdin)', kind: 'file' },
  icon: { type: 'string', value: '<icon>', desc: 'Its icon', values: [...ASSISTANT_ICONS] },
  agent: { type: 'string', value: '<program>', desc: 'The program: claude, codex, custom, or a More agents one' },
  model: { type: 'string', value: '<model>', desc: 'The model it suggests, in that program’s names' },
  tier: { type: 'string', value: '<tier>', desc: 'The tier it thinks with (auto: Automatic)', values: [...TIERS, 'auto'] },
  'helper-max': { type: 'string', value: '<tier>', desc: 'The highest tier of the subagents it starts (auto: any)', values: [...TIERS, 'auto'] },
  tools: { type: 'strings', value: '<tools>', desc: 'What it may use: kinds (Tab lists them), all, none', values: [...TOOLS, 'all', 'none'] },
  mode: { type: 'string', value: '<mode>', desc: 'Its permission mode ("" keeps the start page’s)', values: MODES },
  folder: { type: 'string', value: 'task|project', desc: 'Where its sessions start: a new task folder, or here', values: ['task', 'project'] },
  projects: { type: 'strings', value: '<project>', desc: 'The projects it works in (again for more; "" for everywhere)', kind: 'project' },
  connections: { type: 'strings', value: '<connection>', desc: 'Connections on in its sessions, by id', kind: 'connection' },
  skills: { type: 'strings', value: '<skill>', desc: 'Skills it favors (again for more; "" for none)', kind: 'skill' },
  'can-ask': { type: 'strings', value: '<agent>', desc: 'Agents it may hand work to (again for more; "" for none)', kind: 'agent' },
  askable: { type: 'string', value: 'on|off', desc: 'off: other agents may not hand it work', values: ['on', 'off'] },
  'step-up': { type: 'string', value: 'on|off', desc: 'off: a failed helper is not run again a tier up', values: ['on', 'off'] },
  standing: { type: 'string', value: 'on|off', desc: 'on: it keeps one conversation of its own, with an inbox', values: ['on', 'off'] },
  budget: { type: 'string', value: '<dollars>', desc: 'What its sessions may spend in a month (0: no limit)' },
  'results-to': {
    type: 'strings',
    value: '<place>',
    desc: 'Where each result goes (again for more; none for none)',
  },
};

/**
 * Where results go, from --results-to: the places named, in their order, each kept as it was where it named the same
 * (an email's subject and account, a webhook's key); undefined when not given. A spreadsheet by its id or title.
 */
async function placesOf(ctx: Ctx, v: Values, was: OutputTarget[] = []): Promise<OutputTarget[] | undefined> {
  if (v['results-to'] === undefined) return undefined;
  const out: OutputTarget[] = [];
  let sheets: { id: string; title: string; kind?: string }[] | null = null;
  for (const raw of strs(v, 'results-to')) {
    const given = raw.trim();
    if (!given || given === 'none') continue;
    const at = given.indexOf(':');
    const kind = (at < 0 ? given : given.slice(0, at)).toLowerCase();
    const rest = at < 0 ? '' : given.slice(at + 1).trim();
    const old = was.find((t) => t.kind === kind);
    if (kind === 'library') {
      if (rest && rest !== 'new' && rest !== 'same') throw new UsageError('--results-to library takes :new for a new page each run (left out: the same page, updated)');
      out.push(rest === 'new' ? { kind: 'library', each: 'new' } : { kind: 'library', ...(old?.kind === 'library' && old.page ? { page: old.page } : {}) });
    } else if (kind === 'sheet') {
      const [name, tab] = rest.split('#').map((x) => x.trim());
      let page: string | undefined;
      if (name) {
        sheets ??= (await ctx.conn.api<{ pages: { id: string; title: string; kind?: string }[] }>('GET', '/api/pages')).pages.filter((p) => p.kind === 'sheet');
        page = pickOne(sheets, name, { id: (p) => p.id, names: (p) => [p.title], what: 'spreadsheet', hint: 'hydor files lists them' }).id;
      }
      out.push({ kind: 'sheet', ...(page ? { page } : {}), ...(tab ? { tab } : {}) });
    } else if (kind === 'email') {
      const to = rest
        .split(/[,;]/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (!to.length) throw new UsageError('--results-to email takes the addresses: email:anna@example.org,sam@example.com');
      out.push({ kind: 'email', to, ...(old?.kind === 'email' && old.subject ? { subject: old.subject } : {}), ...(old?.kind === 'email' && old.account ? { account: old.account } : {}) });
    } else if (kind === 'notify' || kind === 'notification') out.push({ kind: 'notify' });
    else if (kind === 'file') {
      if (!rest) throw new UsageError('--results-to file takes a path in the folder it works in: file:reports/{date}.md');
      out.push({ kind: 'file', path: rest });
    } else if (kind === 'webhook') {
      if (!rest) throw new UsageError('--results-to webhook takes an https address: webhook:https://hooks.example.com/x');
      out.push({ kind: 'webhook', url: rest, ...(old?.kind === 'webhook' && old.url === rest && old.secret ? { secret: old.secret } : {}) });
    } else throw new UsageError(`--results-to takes library, library:new, sheet, sheet:<spreadsheet>, email:<addresses>, notify, file:<path> or webhook:<url> (it was “${given}”)`);
  }
  return out;
}

/** The output with its places changed: none when it is left with neither fields nor places. */
const withPlaces = (o: Assistant['output'], to: OutputTarget[]) => (o?.fields?.length || to.length ? { ...(o?.fields?.length ? { fields: o.fields } : {}), ...(to.length ? { to } : {}) } : null);

/** A place in a few words, for show. */
function placeText(t: OutputTarget): string {
  if (t.kind === 'library') return t.each === 'new' ? 'a new page each run' : t.page ? `the page ${t.page}, updated` : 'a page, updated each run';
  if (t.kind === 'sheet') return `a row in ${t.page ? `the spreadsheet ${t.page}` : 'a spreadsheet of its own'}${t.tab ? ` (tab ${t.tab})` : ''}`;
  if (t.kind === 'email') return `an email to ${t.to.join(', ')}${t.account ? ` from ${t.account}` : ''}`;
  if (t.kind === 'file') return `the file ${t.path}`;
  if (t.kind === 'webhook') return `a webhook at ${t.url}`;
  return 'a notification';
}

const onOff = (v: Values, k: string): boolean | undefined => {
  const s = str(v, k);
  if (s === undefined) return undefined;
  if (s !== 'on' && s !== 'off') throw new UsageError(`--${k} takes on or off`);
  return s === 'on';
};

/** A list option: commas or repeats make the list; "" alone is an empty one. */
const listOf = (v: Values, k: string): string[] | undefined =>
  v[k] === undefined
    ? undefined
    : strs(v, k)
        .flatMap((s) => s.split(','))
        .map((s) => s.trim())
        .filter(Boolean);

/** What the options say about an agent, as the API's fields: a field left out is not in it; null clears one. */
async function fieldsOf(ctx: Ctx, v: Values): Promise<Record<string, unknown>> {
  const b: Record<string, unknown> = {};
  for (const k of ['description', 'icon', 'model', 'mode']) if (str(v, k) !== undefined) b[k] = str(v, k) || null;
  if (str(v, 'instructions') !== undefined) b.instructions = str(v, 'instructions');
  const prog = str(v, 'agent');
  if (prog !== undefined) {
    if (!prog) ((b.agent = null), (b.acpAgent = null));
    else if (prog === 'claude' || prog === 'codex') ((b.agent = prog), (b.acpAgent = null));
    else ((b.agent = 'acp'), (b.acpAgent = prog === 'custom' ? 'console' : prog));
  }
  for (const k of ['tier', 'helper-max']) {
    const t = str(v, k);
    if (t === undefined) continue;
    if (t !== 'auto' && !TIERS.includes(t)) throw new UsageError(`--${k} takes ${TIERS.join(', ')} or auto`);
    b[k === 'tier' ? 'tier' : 'helperMax'] = t === 'auto' ? null : t;
  }
  const tools = listOf(v, 'tools');
  if (tools) {
    const bad = tools.find((t) => ![...TOOLS, 'all', 'none'].includes(t));
    if (bad) throw new UsageError(`--tools takes ${TOOLS.join(', ')}, all or none (it was “${bad}”)`);
    b.tools = tools.includes('all') ? null : tools.includes('none') ? [] : tools;
  }
  if (str(v, 'mode') && !MODES.includes(str(v, 'mode')!)) throw new UsageError(`--mode takes ${MODES.join(', ')} (it was “${str(v, 'mode')}”)`);
  const folder = str(v, 'folder');
  if (folder !== undefined) {
    if (folder !== 'task' && folder !== 'project') throw new UsageError('--folder takes task or project');
    b.folder = folder;
  }
  const connections = listOf(v, 'connections');
  if (connections) b.connections = connections.length ? connections : null;
  const skills = listOf(v, 'skills');
  if (skills) b.skills = skills.length ? skills : null;
  const projects = listOf(v, 'projects');
  if (projects) {
    if (!projects.length) b.projects = null;
    else {
      const list = (await ctx.conn.api<{ spaces: { id: string; name: string }[] }>('GET', '/api/projects')).spaces;
      b.projects = projects.map((m) => pickOne(list, m, { id: (s) => s.id, names: (s) => [s.name], what: 'project', hint: 'hydor projects lists them' }).id);
    }
  }
  const canAsk = listOf(v, 'can-ask');
  if (canAsk) {
    if (!canAsk.length) b.canAsk = null;
    else {
      const list = await listAgents(ctx);
      b.canAsk = canAsk.map((m) => pickOne(list, m, { id: (a) => a.id, names: (a) => [a.name], what: 'agent', hint: AGENT_HINT }).id);
    }
  }
  const askable = onOff(v, 'askable');
  if (askable !== undefined) b.askable = askable ? null : false;
  const stepUp = onOff(v, 'step-up');
  if (stepUp !== undefined) b.stepUp = stepUp ? null : false;
  const standing = onOff(v, 'standing');
  if (standing !== undefined) b.standing = standing ? true : null;
  const budget = num(v, 'budget');
  if (budget !== undefined) b.budgetUsd = budget || null;
  return b;
}

/** An agent's fields with the changes put in: a null removes the field (the API keeps only what is sent). */
function merged(base: Partial<Assistant>, changes: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  delete out.id;
  delete out.builtin;
  for (const [k, val] of Object.entries(changes))
    if (val === null) delete out[k];
    else out[k] = val;
  return out;
}

/** What a field is called when it is said it changed. */
const FIELD_WORDS: Record<string, string> = {
  budgetUsd: 'budget',
  helperMax: 'subagents’ tier',
  canAsk: 'who it hands work to',
  askable: 'handed work by others',
  stepUp: 'step up',
  standing: 'own conversation',
  agent: 'program',
  output: 'where results go',
};

const programName = (a: Assistant) => (a.agent === 'acp' ? (a.acpAgent === 'console' ? 'Custom' : a.acpAgent) : a.agent);

export const agents: Area = {
  name: 'agents',
  summary: 'Your agents',
  help: 'An agent is a preset a session starts as (Researcher, Writer…): its instructions, the program and model it suggests, what it may use and how much it may spend. The built-in ones can be copied, not changed. Name one by its name or the start of its id; on a terminal, leave it out to pick from a list. Where its results go is --results-to on new and edit; their fields are set on the page (hydor open agents); hydor agents results shows what it handed back. hydor agents export saves one as a file, and hydor agents install installs one from a file.',
  group: 'models',
  verbs: [
    {
      name: 'list',
      args: [],
      summary: 'Your agents, built-in ones first, with ids',
      help: 'The id or the name is what --as takes when a session starts.',
      examples: ['hydor agents', 'hydor agents --json'],
      async run(ctx) {
        if (ctx.o.json) return ctx.json(await ctx.conn.api('GET', '/api/assistants'));
        const { p } = ctx.look;
        // The name is the main column; the description goes whole on a narrow terminal before the name is cut.
        ctx.out(table(ctx, (await listAgents(ctx)).map((a) => [p.bold(a.name), p.dim(a.id), p.dim(a.description ?? ''), a.tier ? p.dim(tierName(a.tier)) : '']), { grow: 0, fixed: [1], free: [2], drop: [2] }));
      },
    },
    {
      name: 'show',
      args: [agent],
      summary: 'One agent: its fields and instructions',
      examples: ['hydor agents show researcher', 'hydor agents show bookkeeper --json'],
      async run(ctx, [given]) {
        const found = await findAgent(ctx, given);
        if (ctx.o.json) return ctx.json(found);
        const { p } = ctx.look;
        const all = found.canAsk?.length ? await listAgents(ctx) : [];
        const names = found.projects?.length
          ? new Map((await ctx.conn.api<{ spaces: { id: string; name: string }[] }>('GET', '/api/projects')).spaces.map((s) => [s.id, s.name]))
          : new Map<string, string>();
        ctx.out([
          p.bold(found.name) + (found.builtin ? p.dim(' (built in)') : ''),
          ...fields(ctx, [
            ['Id', found.id],
            ['About', found.description],
            ['Icon', found.icon],
            ['Program', programName(found)],
            ['Model', found.model],
            ['Tier', found.tier ? tierName(found.tier) : 'Automatic'],
            ['Helpers up to', found.helperMax ? tierName(found.helperMax) : undefined],
            ['May use', found.tools ? (found.tools.length ? found.tools.join(', ') : 'only the app’s own tools') : 'everything'],
            ['Mode', found.mode],
            ['Starts in', found.folder === 'project' ? 'the folder on the start page' : 'a new task folder'],
            ['Works in', found.projects?.map((id) => names.get(id) ?? id).join(', ')],
            ['Connections', found.connections?.join(', ')],
            ['Skills', found.skills?.join(', ')],
            ['May hand work to', found.canAsk?.map((id) => all.find((a) => a.id === id)?.name ?? id).join(', ')],
            ['Handed work by others', found.askable === false ? 'no' : undefined],
            ['Monthly budget', found.budgetUsd ? `$${found.budgetUsd}` : undefined],
            ['Own conversation', found.standing ? 'yes, with an inbox' : undefined],
            ['Hands back', found.output?.fields?.length ? found.output.fields.map((f) => f.label).join(', ') : found.output?.to?.length ? 'its reply' : undefined],
            ['Results go to', found.output?.to?.map(placeText).join('\n')],
            ['Imported from', found.source],
          ]),
        ]);
        if (found.instructions) ctx.out(['', p.bold('Instructions'), ...markdown(ctx, found.instructions)]);
      },
    },
    {
      name: 'new',
      aliases: ['add', 'create'],
      args: [{ name: 'name', kind: 'text', rest: true }],
      options: { ...FIELD_OPTIONS, from: { type: 'string', value: '<agent>', desc: 'Start from a copy of this agent (a built-in one too)', kind: 'agent' } },
      summary: 'Make an agent',
      help: 'Up to 200 of your own. Instructions: --instructions, --file (- is stdin), or, on a terminal with neither, in your editor. With --from, it starts as a copy of that agent and only what you name differs. Lists (--tools, --projects, --connections, --skills, --can-ask) take commas or the option again. --results-to takes library (the same page, updated each run), library:new (a new page each run), sheet (a row each run in a spreadsheet of its own), sheet:<spreadsheet>#<tab> (one of yours, by id or title), email:<addresses>, notify, file:<path> or webhook:<url>, once for each place. --agent takes claude, codex, custom, or an agent of Settings → More agents; --model only counts with one.',
      examples: [
        'hydor agents new Bookkeeper --tools read,edit --tier standard',
        'hydor agents new Reviewer --file reviewer.md --mode plan',
        'hydor agents new "My researcher" --from researcher --can-ask coder',
      ],
      async run(ctx, words, v) {
        const from = str(v, 'from') ? pickOne(await listAgents(ctx), str(v, 'from')!, { id: (a) => a.id, names: (a) => [a.name], what: 'agent', hint: AGENT_HINT }) : undefined;
        const changes = await fieldsOf(ctx, v);
        const to = await placesOf(ctx, v, from?.output?.to);
        if (to) changes.output = withPlaces(from?.output, to);
        if (str(v, 'file')) changes.instructions = await ctx.readText({ file: str(v, 'file') });
        else if (!Object.keys(changes).length && ctx.interactive && !from) changes.instructions = (await ctx.readText({ current: '' })) ?? '';
        const body: Record<string, unknown> = { ...merged(from ?? {}, changes), name: words.join(' ') };
        delete body.source;
        const r = await ctx.conn.api<{ assistant: Assistant }>('POST', '/api/assistants', body);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Made “${r.assistant.name}” (${r.assistant.id}).`);
      },
    },
    {
      name: 'edit',
      aliases: ['set'],
      args: [agent],
      options: { ...FIELD_OPTIONS, name: { type: 'string', value: '<name>', desc: 'Another name (up to 60 characters)' } },
      summary: 'Change an agent’s fields',
      help: 'Only what you name changes. With nothing named, on a terminal, its instructions open in your editor: saving them unchanged changes nothing. Built-in agents cannot be changed: copy one with hydor agents new --from. Give "" to clear a text or a list (--description "", --projects ""), auto to a tier to make it Automatic, 0 to a budget for no limit; --agent "" keeps the start page’s program. --results-to replaces where results go (none: nowhere but the conversation); see hydor agents new --help for its places.',
      examples: [
        'hydor agents edit bookkeeper --budget 20',
        'hydor agents edit bookkeeper --tools read,web --tier best',
        'hydor agents edit bookkeeper',
        'hydor agents edit bookkeeper --file new-instructions.md',
        'hydor agents edit bookkeeper --results-to sheet --results-to notify',
        'hydor agents edit bookkeeper --results-to email:sam@example.com',
        'hydor agents edit bookkeeper --results-to "sheet:Household budget#2026"',
      ],
      async run(ctx, [given], v) {
        const found = await findAgent(ctx, given);
        if (found.builtin) throw new UsageError(`“${found.name}” is built in and cannot be changed: hydor agents new "My ${found.name}" --from ${found.id} makes a copy to change`);
        const changes = await fieldsOf(ctx, v);
        const to = await placesOf(ctx, v, found.output?.to);
        if (to) changes.output = withPlaces(found.output, to);
        if (str(v, 'name') !== undefined) {
          if (!str(v, 'name')!.trim()) throw new UsageError('--name cannot be empty');
          changes.name = str(v, 'name')!.trim();
        }
        if (str(v, 'file')) changes.instructions = await ctx.readText({ file: str(v, 'file') });
        if (!Object.keys(changes).length) {
          const text = await ctx.readText({ current: found.instructions ?? '' });
          if (text === null) return ctx.out('Nothing changed.');
          changes.instructions = text;
        }
        const r = await ctx.conn.api<{ assistant: Assistant }>('PUT', `/api/assistants/${enc(found.id)}`, merged(found, changes));
        if (ctx.o.json) return ctx.json(r);
        ctx.out(
          `Changed “${r.assistant.name}”: ${[
            ...new Set(
              Object.keys(changes)
                .filter((k) => k !== 'acpAgent')
                .map((k) => FIELD_WORDS[k] ?? k),
            ),
          ].join(', ')}.`,
        );
      },
    },
    {
      name: 'results',
      aliases: ['history'],
      args: [agent],
      summary: 'What an agent handed back, and where it went',
      help: `Each result its hand_back gave, newest first (20 unless --limit says how many, up to 200): when, its fields, and where it went (✓ got there, ✗ did not). It keeps results for a year, up to ${RESULTS_KEEP.count}.`,
      examples: ['hydor agents results bookkeeper', 'hydor agents results bookkeeper --limit 100', 'hydor agents results bookkeeper --json'],
      async run(ctx, [given]) {
        const found = await findAgent(ctx, given);
        const limit = Math.min(200, ctx.o.limit ?? 20);
        const r = await ctx.conn.api<AgentResults>('GET', `/api/assistants/${enc(found.id)}/results?limit=${limit}`);
        if (ctx.o.json) return ctx.json(r);
        const { p } = ctx.look;
        if (!r.results.length) return ctx.out(`${found.name} has handed nothing back yet.`);
        const fields = found.output?.fields?.length ? found.output.fields : [{ id: 'result', label: 'Result', type: 'markdown' as const }];
        const cell = (x: unknown): string =>
          x === null || x === undefined ? '' : Array.isArray(x) ? x.map((i) => (i && typeof i === 'object' ? Object.values(i).map(cell).join(' · ') : cell(i))).join('; ') : typeof x === 'boolean' ? (x ? 'yes' : 'no') : typeof x === 'object' ? JSON.stringify(x) : String(x).split('\n').find((l) => l.trim()) ?? '';
        // In this computer's time.
        const when = (at: number) => {
          const d = new Date(at);
          const p2 = (x: number) => String(x).padStart(2, '0');
          return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
        };
        ctx.out(
          table(
            ctx,
            r.results.map((x) => [p.dim(when(x.at)), ...fields.map((f) => cell(x.value?.[f.id])), x.sent.map((s) => `${s.ok ? '✓' : '✗'} ${s.kind}`).join(', ')]),
            { head: ['When', ...fields.map((f) => f.label), 'Went to'], grow: 1, fixed: [0] },
          ),
        );
        if (r.more) ctx.out(p.dim(`${r.results.length} of ${r.total}: --limit for more.`));
        const made = [r.made.sheet, r.made.library].filter(Boolean).map((x) => `“${x!.title}”`);
        if (made.length) ctx.out(p.dim(`Its runs go into ${made.join(' and ')} in the project.`));
      },
    },
    {
      name: 'export',
      aliases: ['download'],
      args: [agent],
      options: { output: { type: 'string', short: 'o', value: '<file>', desc: 'Where to write it (- prints it; default: its name, here)', kind: 'file' } },
      summary: 'Save an agent as a file, to keep or to give',
      help: 'The file (.hydor-agent, JSON) holds its instructions, tools, tier, skills, team (by name), what it hands back, its schedules by the clock as suggestions, and its examples. Nothing of yours goes in it: its projects, connected accounts, saved pages, who its results are emailed to and its webhook’s address and key are left out, and the file says so. Built-in agents export too.',
      examples: ['hydor agents export bookkeeper', 'hydor agents export bookkeeper -o ~/Desktop/bookkeeper.hydor-agent', 'hydor agents export bookkeeper -o -'],
      async run(ctx, [given], v) {
        const found = await findAgent(ctx, given);
        const file = await ctx.conn.api<AgentFile>('GET', `/api/assistants/${enc(found.id)}/export`);
        const text = `${JSON.stringify(file, null, 2)}\n`;
        if (str(v, 'output') === '-') return ctx.out(text.replace(/\n$/, ''));
        const out = path.resolve(str(v, 'output') ?? agentFileName(found));
        if (!str(v, 'output') && fs.existsSync(out)) throw new UsageError(`${path.basename(out)} exists already: name the file with -o <file>`);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, text);
        if (ctx.o.json) return ctx.json({ id: found.id, file: out, leftOut: file.leftOut ?? [] });
        ctx.out(`Saved “${found.name}” as ${tildify(out, ctx.look.home)}.`);
        if (file.leftOut?.length) ctx.out([ctx.look.p.dim('Left out, to set again where it is installed:'), ...file.leftOut.map((l) => ctx.look.p.dim(`  - ${l}`))]);
      },
    },
    {
      name: 'install',
      aliases: ['import-file'],
      args: [{ name: 'file', kind: 'file' }],
      options: {
        replace: { type: 'boolean', desc: 'Replace yours of the same name, as a new version of it' },
        schedules: { type: 'boolean', desc: 'Add the schedules it suggests, paused' },
      },
      summary: 'Install an agent from a .hydor-agent file',
      help: 'It says first what the file brings and what it needs from you (connected apps, who results are emailed to…), then asks (--yes does not). An agent of yours with the same name is left as it is: the new one installs beside it as “Name (2)”, unless --replace. A mode that never asks starts as Accept edits. Claude Code’s agent files (.md) come in on the Agents page’s Import.',
      examples: ['hydor agents install bookkeeper.hydor-agent', 'hydor agents install bookkeeper.hydor-agent --replace --schedules -y'],
      async run(ctx, [file], v) {
        let text: string;
        try {
          text = fs.readFileSync(path.resolve(file), 'utf8');
        } catch {
          throw new UsageError(`Cannot read ${file}`);
        }
        const p = await ctx.conn.api<AgentInstallPreview>('POST', '/api/assistants/install/check', { file: text });
        const replace = flag(v, 'replace') && !!p.clash;
        const { p: paint } = ctx.look;
        if (!ctx.o.json) {
          ctx.out([
            paint.bold(replace ? `${p.clash!.name} (replacing yours)` : p.beside) + (p.agent.description ? paint.dim(` · ${p.agent.description}`) : ''),
            ...p.brings.map((l) => `  ${l}`),
            ...(p.needs.length ? ['', paint.bold('It needs from you'), ...p.needs.map((l) => `  - ${l}`)] : []),
            ...(p.notes.length ? ['', ...p.notes.map((l) => paint.dim(l))] : []),
            ...(p.clash && !replace ? ['', paint.dim(`You have an agent named “${p.clash.name}”: this installs beside it as “${p.beside}” (--replace replaces yours).`)] : []),
            ...(p.schedules.length && !flag(v, 'schedules') ? [paint.dim('Its suggested schedules are not added: --schedules adds them, paused.')] : []),
          ]);
        }
        if (!(await ctx.confirm(replace ? `Replace “${p.clash!.name}”?` : `Install “${p.beside}”?`))) return ctx.out('Not installed.');
        const r = await ctx.conn.api<{ assistant: Assistant; schedules: number }>('POST', '/api/assistants/install', { file: text, replace, schedules: flag(v, 'schedules') });
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`${replace ? 'Replaced' : 'Installed'} “${r.assistant.name}” (${r.assistant.id})${r.schedules ? `, with ${r.schedules === 1 ? '1 schedule' : `${r.schedules} schedules`}, paused` : ''}.`);
      },
    },
    {
      name: 'remove',
      aliases: ['delete', 'rm'],
      args: [agent],
      summary: 'Delete an agent of your own',
      help: 'Sessions started with it carry on without its instructions; its scheduled tasks stay, as plain tasks. Built-in agents cannot be deleted.',
      examples: ['hydor agents remove bookkeeper', 'hydor agents remove bookkeeper -y'],
      async run(ctx, [given]) {
        const found = await findAgent(ctx, given);
        if (found.builtin) throw new UsageError(`“${found.name}” is built in and cannot be removed`);
        if (!(await ctx.confirm(`Remove “${found.name}”?`))) return ctx.out('Not removed.');
        const r = await ctx.conn.api('DELETE', `/api/assistants/${enc(found.id)}`);
        if (ctx.o.json) return ctx.json(r);
        ctx.out(`Removed “${found.name}”.`);
      },
    },
  ],
};
