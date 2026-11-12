// `hydor agents`: the Agents page. List (as `hydor agents` always printed), show, new, edit and remove, with the fields
// the page edits as options. The API calls them assistants. Built-in agents can be copied (`new --from`), not changed.
import type { Assistant } from '../../../shared/assistants.ts';
import { ASSISTANT_ICONS } from '../../../shared/assistants.ts';
import { enc } from '../client.ts';
import { tierName } from '../lines.ts';
import { choose, fields, markdown, num, pickOne, str, strs, UsageError, type Area, type Ctx, type OptionSpec, type Values } from './kit.ts';

const AGENT_HINT = 'hydor agents lists them';
const agent = { name: 'agent', kind: 'agent', pick: true } as const;
const TOOLS = ['read', 'edit', 'run', 'web', 'mcp'];
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
  tools: { type: 'strings', value: '<tools>', desc: 'What it may use: read, edit, run, web, mcp, all, none', values: [...TOOLS, 'all', 'none'] },
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
};

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
};

const programName = (a: Assistant) => (a.agent === 'acp' ? (a.acpAgent === 'console' ? 'Custom' : a.acpAgent) : a.agent);

export const agents: Area = {
  name: 'agents',
  summary: 'Your agents: who they are, what they may use, and how they work',
  help: 'An agent is a preset a session starts as (Researcher, Writer…): its instructions, the program and model it suggests, what it may use and how much it may spend. The built-in ones can be copied, not changed. Name one by its name or the start of its id; on a terminal, leave it out to pick from a list. Its output fields and where results go are set on the page (hydor open agents).',
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
        const { agentLines } = await import('../commands.ts');
        ctx.out(agentLines(await listAgents(ctx), ctx.look));
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
      help: 'Up to 200 of your own. Instructions: --instructions, --file (- is stdin), or, on a terminal with neither, in your editor. With --from, it starts as a copy of that agent and only what you name differs. Lists (--tools, --projects, --connections, --skills, --can-ask) take commas or the option again. --agent takes claude, codex, custom, or an agent of Settings → More agents; --model only counts with one.',
      examples: [
        'hydor agents new Bookkeeper --tools read,edit --tier standard',
        'hydor agents new Reviewer --file reviewer.md --mode plan',
        'hydor agents new "My researcher" --from researcher --can-ask coder',
      ],
      async run(ctx, words, v) {
        const from = str(v, 'from') ? pickOne(await listAgents(ctx), str(v, 'from')!, { id: (a) => a.id, names: (a) => [a.name], what: 'agent', hint: AGENT_HINT }) : undefined;
        const changes = await fieldsOf(ctx, v);
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
      help: 'Only what you name changes. With nothing named, on a terminal, its instructions open in your editor: saving them unchanged changes nothing. Built-in agents cannot be changed: copy one with hydor agents new --from. Give "" to clear a text or a list (--description "", --projects ""), auto to a tier to make it Automatic, 0 to a budget for no limit; --agent "" keeps the start page’s program.',
      examples: [
        'hydor agents edit bookkeeper --budget 20',
        'hydor agents edit bookkeeper --tools read,web --tier best',
        'hydor agents edit bookkeeper',
        'hydor agents edit bookkeeper --file new-instructions.md',
      ],
      async run(ctx, [given], v) {
        const found = await findAgent(ctx, given);
        if (found.builtin) throw new UsageError(`“${found.name}” is built in and cannot be changed: hydor agents new "My ${found.name}" --from ${found.id} makes a copy to change`);
        const changes = await fieldsOf(ctx, v);
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
