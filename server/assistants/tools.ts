// From chat: list_agents, save_agent and delete_agent on each session's own MCP server, so any agent (Claude Code,
// Codex, Custom, ACP agents) can list, make, change and delete the user's own agents (the Agents page), with each
// one's schedules. Every change goes through the app's own API (server/guide/api.ts `call`), so an agent's saves are
// recorded as "An agent" in the agent's versions and open pages refresh; the user confirms on one card first.
// A scheduled run cannot make or change agents.
import { agentChanges, placeName, TOOL_VERBS } from '../../shared/agent-files.ts';
import { agentMode, ASSISTANT_ICONS, ASSISTANT_MODES, TOOL_KINDS, type Assistant } from '../../shared/assistants.ts';
import { OUTCOME_LABEL, scheduleText, type ScheduledTask, type TaskSchedule } from '../../shared/automations.ts';
import { isTier, tierLabel, TIERS } from '../../shared/tiers.ts';
import { acpAgents } from '../agents/acp.ts';
import { localText, nextRuns } from '../automations/schedule.ts';
import { inRun, toolSchedule, scheduleSchema } from '../automations/tools.ts';
import { config } from '../config.ts';
import type { Deps, RunCtx, RunTool, ToolOutput } from '../features/types.ts';
import { call, confirmChange, type Reply } from '../guide/api.ts';
import { allSpaces } from '../spaces/index.ts';
import { userTimezone } from '../userPrefs.ts';
import { exampleMark } from './examples.ts';
import { monthSpend } from './rules.ts';
import { allAssistants, cleanAssistant, findAssistant } from './store.ts';

type Json = Record<string, any>;

const PROGRAM_NOTE = 'claude, codex, or an ACP agent’s id (console is Custom); an empty string clears it';
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
/** A schedule's words in the middle of a sentence: “Weekdays at 08:00” → “weekdays at 08:00”, but “Mon, Wed at 08:00” stays. */
const lower = (s: string) => s.replace(/^(Daily|Weekdays|Weekends|Every|Once|When)\b/, (w) => w.toLowerCase());
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/** Why this session may not make or change agents, or null when it may. */
function refusal(d: Deps, ctx: RunCtx, what = 'make or change agents'): string | null {
  if (inRun(d, ctx)) return `A scheduled run cannot ${what}; say what should change in your summary.`;
  if (exampleMark(d.db, ctx.key)) return `A try of an agent’s examples cannot ${what}.`;
  return null;
}

/** One call to the app's own API; an error answer becomes an error here. */
async function api(ctx: RunCtx, method: string, url: string, body?: Json): Promise<Json> {
  const r: Reply = await call(ctx, method, url, body);
  if (r.status >= 400) throw new Error(String((r.json as Json | undefined)?.error ?? r.text ?? '').trim() || `The app answered ${r.status}`);
  return (r.json ?? {}) as Json;
}

const tasksOf = (d: Deps, agent: string): ScheduledTask[] => d.scheduler.list({ boards: false }).filter((t) => t.extra?.assistant === agent);

/** A project's or an agent's name by its id, for what changed in words. */
const namer = (d: Deps) => (kind: 'agent' | 'project', id: string) => (kind === 'agent' ? allAssistants(d.db).find((a) => a.id === id)?.name : allSpaces(d.db).find((s) => s.id === id)?.name) ?? id;

/** Names or ids → ids, each matched on its id first and then its name; one that matches nothing is an error that lists what there is. */
function resolve(what: 'project' | 'agent', given: unknown, all: { id: string; name: string }[]): string[] {
  const out: string[] = [];
  for (const g of strs(given)) {
    const byId = all.find((x) => x.id === g);
    const byName = all.filter((x) => x.name.toLowerCase() === g.toLowerCase());
    if (!byId && byName.length > 1) throw new Error(`More than one ${what} is called “${g}”: use its id (${byName.map((x) => x.id).join(', ')}).`);
    const hit = byId ?? byName[0];
    if (!hit) throw new Error(`There is no ${what} “${g}”.${all.length ? ` The ${what}s are: ${all.slice(0, 40).map((x) => `${x.name} (${x.id})`).join(', ')}.` : ` There are no ${what}s yet.`}`);
    if (!out.includes(hit.id)) out.push(hit.id);
  }
  return out;
}

const programOf = (a: Pick<Assistant, 'agent' | 'acpAgent'>) => (a.agent === 'acp' ? (a.acpAgent ?? '') : (a.agent ?? ''));
const programWords = (d: Deps, a: Pick<Assistant, 'agent' | 'acpAgent'>) => (!a.agent ? '' : a.agent === 'claude' ? 'Claude Code' : a.agent === 'codex' ? 'Codex' : (acpAgents(d.db).find((x) => x.id === a.acpAgent)?.name ?? a.acpAgent ?? 'another agent'));
const toolWords = (a: Pick<Assistant, 'tools'>) => (a.tools ? (a.tools.length ? a.tools.map((k) => TOOL_VERBS[k] ?? k).join(', ') : 'nothing of its own') : 'everything');
const whereWords = (d: Deps, a: Pick<Assistant, 'projects'>) => (a.projects?.length ? a.projects.map((p) => namer(d)('project', p)).join(', ') : 'everywhere');

// ---- what the call says, merged into an agent ----------------------------------------------------------------------

/** The agent as the call leaves it: `base` (what it is now, or what a new one copies) with the given fields merged in; not yet checked. */
function merged(d: Deps, base: Json, a: Json, isNew: boolean): Json {
  const m: Json = { ...base };
  const set = (k: string, v: unknown) => (v === undefined || v === null || v === '' ? delete m[k] : (m[k] = v));
  for (const k of ['name', 'description', 'instructions'] as const) if (a[k] !== undefined) set(k, String(a[k]).trim());
  if (a.icon !== undefined) {
    if (!(ASSISTANT_ICONS as readonly string[]).includes(String(a.icon))) throw new Error(`icon is one of: ${ASSISTANT_ICONS.join(', ')}.`);
    m.icon = a.icon;
  }
  if (a.tools !== undefined) {
    const kinds = strs(a.tools);
    const bad = kinds.filter((k) => !TOOL_KINDS.some((t) => t.id === k));
    if (bad.length) throw new Error(`tools: ${bad.join(', ')} is not a kind. The kinds are ${TOOL_KINDS.map((t) => t.id).join(', ')}; all of them is everything.`);
    m.tools = kinds;
  }
  if (a.tier !== undefined) {
    if (a.tier === 'auto' || a.tier === null || a.tier === '') delete m.tier;
    else if (isTier(a.tier)) m.tier = a.tier;
    else throw new Error('tier is quick, standard, best, max, or auto (Automatic).');
  }
  if (a.helperMax !== undefined) {
    if (a.helperMax === 'any' || a.helperMax === null || a.helperMax === '') delete m.helperMax;
    else if (isTier(a.helperMax)) m.helperMax = a.helperMax;
    else throw new Error('helperMax is quick, standard, best, max, or any.');
  }
  if (a.projects !== undefined) {
    const ids = resolve('project', a.projects, allSpaces(d.db));
    set('projects', ids.length ? ids : undefined);
  }
  if (a.budgetUsd !== undefined) {
    const n = a.budgetUsd === null || a.budgetUsd === '' ? 0 : Number(a.budgetUsd);
    if (!Number.isFinite(n)) throw new Error('budgetUsd is an amount in dollars a month; 0 or null removes the budget.');
    set('budgetUsd', n > 0 ? n : undefined);
  }
  if (a.canAsk !== undefined) {
    const mine = allAssistants(d.db).filter((x) => x.id !== m.id);
    const ids = resolve('agent', a.canAsk, mine);
    set('canAsk', ids.length ? ids : undefined);
  }
  if (a.askable !== undefined) set('askable', a.askable === false ? false : undefined);
  if (a.standing !== undefined) set('standing', a.standing === true ? true : undefined);
  if (a.program !== undefined) {
    const p = String(a.program ?? '').trim();
    const before = programOf(m as Assistant);
    if (!p) {
      delete m.agent;
      delete m.acpAgent;
    } else if (p === 'claude' || p === 'codex') {
      m.agent = p;
      delete m.acpAgent;
    } else {
      if (!acpAgents(d.db).some((x) => x.id === p)) throw new Error(`There is no program “${p}”: use claude, codex, or one of ${acpAgents(d.db).map((x) => x.id).join(', ')} (console is Custom).`);
      m.agent = 'acp';
      m.acpAgent = p;
    }
    // A model is named in its program's own words: another program starts without one, unless the call names it.
    if (programOf(m as Assistant) !== before && a.model === undefined) delete m.model;
  }
  if (a.model !== undefined) {
    if (String(a.model).trim() && !m.agent) throw new Error('model needs a program: give program too (claude, codex or an ACP agent’s id).');
    set('model', String(a.model).trim());
  }
  if (a.mode !== undefined) {
    if (a.mode === '' || a.mode === null) delete m.mode;
    else if (ASSISTANT_MODES.some((x) => x.id === a.mode)) m.mode = a.mode;
    else throw new Error(`mode is ${ASSISTANT_MODES.map((x) => x.id).join(', ')}.`);
  }
  if (a.folder !== undefined) {
    if (a.folder !== 'task' && a.folder !== 'project') throw new Error('folder is task (a new task folder) or project (the folder on the start page).');
    m.folder = a.folder;
  }
  if (a.skills !== undefined) set('skills', strs(a.skills).length ? strs(a.skills) : undefined);
  if (a.connections !== undefined) set('connections', strs(a.connections).length ? strs(a.connections) : undefined);
  if (a.output !== undefined) set('output', a.output && typeof a.output === 'object' && Object.keys(a.output).length ? a.output : undefined);
  if (isNew && !String(m.name ?? '').trim()) throw new Error('Give the new agent a name.');
  return m;
}

// ---- schedules --------------------------------------------------------------------------------------------------

type Op =
  | { kind: 'add'; body: Json; name: string; line: string }
  | { kind: 'change'; id: string; body: Json; name: string; line: string }
  | { kind: 'remove'; id: string; name: string; line: string };

const taskBody = (t: Partial<ScheduledTask>): Json => {
  const { id, name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, app, enabled } = t;
  return JSON.parse(JSON.stringify({ id, name, prompt, schedule, agent, acpAgent, cwd, model, effort, mode, target, extra, failLimit, app, enabled }));
};

const when = (s: TaskSchedule, tz: string) => lower(scheduleText(s, tz));
const firstRun = (s: TaskSchedule, tz: string) => (s.kind === 'watch' || s.kind === 'webhook' ? undefined : nextRuns(s, Date.now(), tz, 1)[0]);

/** The task that runs as an agent, as scheduleDraft makes it in the app (the web's agent page). */
function addBody(d: Deps, ctx: RunCtx, a: Assistant, s: Json, tz: string): Json {
  const agent = a.agent ?? ctx.agent;
  const acpAgent = a.agent ? a.acpAgent : ctx.acpAgent;
  const project = a.projects?.length === 1 ? allSpaces(d.db).find((x) => x.id === a.projects![0]) : undefined;
  const prompt = String(s.prompt ?? '').trim();
  if (!prompt) throw new Error('A schedule needs its prompt: complete instructions for each run.');
  if (!s.schedule) throw new Error('A schedule needs schedule: when it runs.');
  return {
    name: String(s.name ?? '').trim() || a.name,
    prompt,
    schedule: toolSchedule(s.schedule, tz),
    agent,
    acpAgent,
    cwd: String(s.cwd ?? '').trim() || project?.folder || config.defaultCwd,
    ...(a.agent && a.model ? { model: a.model } : {}),
    mode: agentMode(a.mode, agent, acpAgent) ?? (agent === 'claude' ? 'default' : agent === 'codex' ? 'auto' : undefined),
    extra: { assistant: a.id },
    enabled: s.paused !== true,
  };
}

/** What each item of `schedules` does, checked and worded for the card; nothing is saved. */
function planSchedules(d: Deps, ctx: RunCtx, a: Assistant, items: unknown, isNew: boolean, tz: string): Op[] {
  if (items === undefined || items === null) return [];
  if (!Array.isArray(items)) throw new Error('schedules is a list of changes: { prompt, schedule, … } to add, { id, … } to change, { id, remove: true } to remove.');
  if (items.length > 10) throw new Error('At most 10 schedule changes in one call.');
  const own = isNew ? [] : tasksOf(d, a.id);
  const ops: Op[] = [];
  let adds = 0;
  for (const raw of items as Json[]) {
    const s = (raw ?? {}) as Json;
    const id = String(s.id ?? '').trim();
    if (!id) {
      const body = addBody(d, ctx, a, s, tz);
      const clean = d.scheduler.normalize(body);
      adds++;
      const first = body.enabled ? firstRun(clean.schedule, tz) : undefined;
      ops.push({ kind: 'add', body, name: clean.name, line: `Adds “${clean.name}”: ${when(clean.schedule, tz)}${body.enabled ? (first ? `, first run ${localText(first, tz)} (${tz})` : clean.schedule.kind === 'watch' ? ', first check right away' : '') : ', paused'}` });
      continue;
    }
    const t = own.find((x) => x.id === id);
    if (!t) throw new Error(isNew ? 'A new agent has no schedules yet: add them without an id.' : `“${id}” is not one of ${a.name}’s schedules: list_agents with its id gives them.`);
    if (s.remove === true) {
      ops.push({ kind: 'remove', id, name: t.name, line: `Deletes “${t.name}” (${when(t.schedule, tz)})` });
      continue;
    }
    const after: Partial<ScheduledTask> = { ...t };
    if (s.name !== undefined && String(s.name).trim()) after.name = String(s.name).trim();
    if (s.prompt !== undefined && String(s.prompt).trim()) after.prompt = String(s.prompt).trim();
    if (s.schedule !== undefined) after.schedule = toolSchedule(s.schedule, tz);
    if (s.paused !== undefined) after.enabled = s.paused !== true;
    const clean = d.scheduler.normalize(after);
    const parts: string[] = [];
    if (after.name !== t.name) parts.push(`it is now called “${clean.name}”`);
    const was = when(t.schedule, tz);
    const now = when(clean.schedule, tz);
    const first = after.enabled ? firstRun(clean.schedule, tz) : undefined;
    if (JSON.stringify(t.schedule) !== JSON.stringify(after.schedule)) parts.push(`it runs ${now} (it was ${was})${first ? `, next run ${localText(first, tz)} (${tz})` : ''}`);
    if (after.prompt !== t.prompt) parts.push('its prompt changes');
    if (after.enabled !== t.enabled) parts.push(after.enabled ? 'it is turned on' : 'it is paused');
    if (!parts.length) continue;
    ops.push({ kind: 'change', id, body: taskBody({ ...after, ...clean, id, enabled: after.enabled }), name: t.name, line: `Changes “${t.name}”: ${parts.join('; ')}` });
  }
  if (adds && d.scheduler.list({ boards: false }).length + adds > 100) throw new Error('There would be more than 100 scheduled tasks: the user should remove some first.');
  return ops;
}

// ---- the card ---------------------------------------------------------------------------------------------------

function newAgentLines(d: Deps, a: Omit<Assistant, 'id'>): string[] {
  const lines = [`**${a.name.replace(/\*/g, '')}**${a.description ? `: ${a.description}` : ''}`, ''];
  lines.push(`- Works: ${whereWords(d, a)}`);
  lines.push(`- Thinks with: ${tierLabel(a.tier)}`);
  lines.push(`- May use: ${toolWords(a)}`);
  if (a.budgetUsd) lines.push(`- Budget: ${money(a.budgetUsd)} a month`);
  if (a.agent) lines.push(`- Program: ${programWords(d, a)}${a.model ? `, model ${a.model}` : ''}`);
  if (a.standing) lines.push('- Keeps a conversation of its own, with an inbox');
  if (a.mode) lines.push(`- Permissions: ${ASSISTANT_MODES.find((x) => x.id === a.mode)?.label ?? a.mode}${a.mode === 'full' ? ', never asks' : ''}`);
  if (a.canAsk?.length) lines.push(`- Hands work to: ${a.canAsk.map((x) => namer(d)('agent', x)).join(', ')}`);
  if (a.connections?.length) lines.push(`- Connected apps on in its sessions: ${a.connections.join(', ')}`);
  if (a.output?.to?.length) lines.push(`- Its results go to: ${a.output.to.map(placeName).join(', ')}`);
  if (a.instructions) lines.push('', ...cut(a.instructions, 600).split('\n').map((l) => `> ${l}`));
  return lines;
}

const scheduleLines = (ops: Op[]) => (ops.length ? ['', '**Schedules**', ...ops.map((o) => `- ${o.line}`)] : []);

// ---- list_agents ----------------------------------------------------------------------------------------------

function listAgents(): RunTool {
  return {
    name: 'list_agents',
    description:
      'The user’s own agents (the Agents page): id, name, what it does, where it works, the tier it thinks with, its monthly budget and spending, and its schedules (task id, when each runs, next run). Built-in agents are named at the end: they cannot be changed, but save_agent with from copies one. With id, one agent in full: its settings and each schedule with its prompt. Use it first to find ids for save_agent and delete_agent.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'An agent’s id, for all of its settings and its schedules in full.' } } },
    annotations: { readOnlyHint: true },
    async run(a, ctx) {
      const d = ctx.deps;
      const tz = userTimezone(d.db);
      const id = String(a.id ?? '').trim();
      const next = (t: ScheduledTask) => (t.enabled ? (t.nextAt ? `next ${localText(t.nextAt, tz)}` : 'no run to come') : `paused${t.pausedReason ? ` (${t.pausedReason})` : ''}`);
      if (id) {
        const x = findAssistant(d.db, id);
        if (!x) throw new Error(`There is no agent with the id “${id}”: list_agents gives them.`);
        const { examples, ...settings } = x;
        const out = [`${x.name} (${x.id})${x.builtin ? ', built in: it cannot be changed, but save_agent with from copies it' : ''}`, `Works: ${whereWords(d, x)}.`];
        const spend = monthSpend(d.db, x.id);
        if (x.budgetUsd) out.push(`Budget: ${money(x.budgetUsd)} a month, ${money(spend.usd)} spent this month.`);
        out.push('', `Settings (${plural(examples?.length ?? 0, 'example', 'examples')} left out):`, JSON.stringify(settings, null, 1));
        const tasks = tasksOf(d, x.id);
        out.push('', tasks.length ? 'Schedules:' : 'No schedules.');
        for (const t of tasks) {
          const last = t.recent?.[0] ? `${OUTCOME_LABEL[t.recent[0].status as keyof typeof OUTCOME_LABEL]?.toLowerCase() ?? t.recent[0].status}, ${localText(t.recent[0].at, tz)}` : 'not run yet';
          out.push(`- ${t.id} · ${t.name} · ${scheduleText(t.schedule, tz)} · ${next(t)} · ${t.enabled ? 'on' : 'off'} · last: ${last}${t.lastStatus && t.lastStatus !== 'ok' ? ` (${t.lastStatus})` : ''}`, `  prompt: ${cut(t.prompt, 1500)}`);
        }
        out.push('', `Times are in ${tz}.`);
        return out.join('\n');
      }
      const all = allAssistants(d.db);
      const mine = all.filter((x) => !x.builtin);
      const lines: string[] = [];
      for (const x of mine) {
        const spend = monthSpend(d.db, x.id);
        const head = [`- ${x.id} · ${x.name}${x.description ? ` — ${x.description}` : ''}`, `works ${x.projects?.length ? `in ${whereWords(d, x)}` : 'everywhere'}`, `tier: ${tierLabel(x.tier)}`];
        if (x.budgetUsd) head.push(`budget ${money(x.budgetUsd)} a month, ${money(spend.usd)} spent this month`);
        lines.push(head.join(' · '));
        for (const t of tasksOf(d, x.id)) lines.push(`  - schedule ${t.id} · ${t.name} · ${scheduleText(t.schedule, tz)} · ${next(t)}`);
      }
      const built = all.filter((x) => x.builtin).map((x) => `${x.id} · ${x.name}`);
      return [
        mine.length ? lines.join('\n') : 'The user has no agents of their own yet.',
        '',
        `Built-in agents (they cannot be changed, but save_agent with from copies one): ${built.join(', ')}.`,
        '',
        `Times are in ${tz}.`,
      ].join('\n');
    },
  };
}

// ---- save_agent -----------------------------------------------------------------------------------------------

const TIER_IDS = TIERS.map((t) => t.id);

function saveAgent(tz: string): RunTool {
  return {
    name: 'save_agent',
    description: [
      'Make a new agent of the user’s own (no id), or change one of theirs (with its id): the Agents page, with what it is, how it works, what it may use and its schedules.',
      'The user confirms on a card, and their answer comes back as this tool’s result, so do not ask them to confirm in text first.',
      'Run list_agents first to find ids. Only the fields you give change; an agent’s examples and its other settings stay. A built-in agent cannot be changed: make a copy with from, naming the built-in (or one of theirs), and the copy starts with its settings, named “<name> (copy)” unless you name it.',
      'schedules adds, changes and removes the agent’s own schedules, scheduled tasks that run as it: { prompt, schedule, name?, cwd?, paused? } adds one; { id, name?, prompt?, schedule?, paused? } changes one; { id, remove: true } removes one.',
      'Each schedule’s prompt is all a run gets, so write it as complete instructions that make sense on their own, without this conversation.',
      'A run can end its own schedule (report_outcome with end true), so when a schedule is meant to stop when something happens, say so in its prompt.',
      'A schedule no longer needed should be removed (schedules: [{ id, remove: true }]) rather than paused. A schedule that runs once goes by itself after a run that went well.',
      `Times are wall-clock times in the user’s time zone (${tz}).`,
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The agent to change (list_agents). Leave out to make a new one.' },
        from: { type: 'string', description: 'A new agent: the id of an agent to copy (a built-in or one of the user’s). It starts as a copy of that agent’s settings, not its examples.' },
        name: { type: 'string', description: 'Its name, 1 to 4 words. Needed for a new agent unless from names one.' },
        icon: { type: 'string', enum: [...ASSISTANT_ICONS] },
        description: { type: 'string', description: 'One line on what it does, shown in the picker.' },
        instructions: { type: 'string', description: 'Who it is and how it works, in the second person: what it does, how, and what it hands back.' },
        tools: { type: 'array', items: { type: 'string', enum: TOOL_KINDS.map((t) => t.id) }, description: 'What it may use, by kind: read, edit, run, web, browser, computer, mcp. Left out keeps them; a new agent gets everything.' },
        tier: { type: 'string', enum: [...TIER_IDS, 'auto'], description: 'The tier it thinks with: quick for small, clear jobs, standard for clear tasks of medium size, best for work that needs planning and judgement, max for the hardest problems; auto is Automatic.' },
        helperMax: { type: 'string', enum: [...TIER_IDS, 'any'], description: 'The highest tier the helpers it starts may have; any removes the limit.' },
        projects: { type: 'array', items: { type: 'string' }, description: 'The projects it works in, by id or name; [] means everywhere.' },
        budgetUsd: { type: ['number', 'null'], description: 'What its sessions may spend in a month, in dollars; 0 or null removes the budget.' },
        canAsk: { type: 'array', items: { type: 'string' }, description: 'The agents it may hand work to, by id or name.' },
        askable: { type: 'boolean', description: 'False: other agents may not hand it work.' },
        standing: { type: 'boolean', description: 'True: it keeps one conversation of its own, with an inbox that you, other agents and its schedules write into.' },
        program: { type: 'string', description: `The program it suggests: ${PROGRAM_NOTE}.` },
        model: { type: 'string', description: 'The model it suggests, in its program’s own names; needs a program.' },
        mode: { type: 'string', enum: [...ASSISTANT_MODES.map((m) => m.id), ''], description: 'When it asks first: ask, edits (accept edits), full (never asks) or plan; empty keeps the one picked on the start page.' },
        folder: { type: 'string', enum: ['task', 'project'], description: 'Where its sessions start when no folder is picked: a new task folder, or the folder on the start page.' },
        skills: { type: 'array', items: { type: 'string' }, description: 'Skills it favors, by name.' },
        connections: { type: 'array', items: { type: 'string' }, description: 'Connected apps on in its sessions, by id (list_connections).' },
        output: { type: 'object', description: 'What it hands back: { fields?: [{ id, label, type, … }] — the answer fields, to?: [{ kind: library|sheet|email|notify|file|webhook, … }] — where each result goes }. The app checks it.' },
        why: { type: 'string', description: 'One sentence on what changed and why, kept with its version.' },
        schedules: {
          type: 'array',
          description: 'Changes to the agent’s own schedules: add (prompt and schedule, no id), change (id, and what changes) or remove (id and remove: true).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'A schedule’s task id (list_agents with the agent’s id); leave out to add one.' },
              name: { type: 'string', description: 'Default: the agent’s name.' },
              prompt: { type: 'string', description: 'What each run is told: complete instructions that make sense on their own.' },
              schedule: scheduleSchema(tz),
              cwd: { type: 'string', description: 'The folder runs work in; default: its project’s folder when it works in one project, else the default folder.' },
              paused: { type: 'boolean', description: 'True: it does not run until turned on.' },
              remove: { type: 'boolean', description: 'With id: delete this schedule.' },
            },
          },
        },
      },
    },
    async run(a, ctx): Promise<string | ToolOutput> {
      const d = ctx.deps;
      const no = refusal(d, ctx);
      if (no) throw new Error(no);
      const id = String(a.id ?? '').trim();
      const from = String(a.from ?? '').trim();
      const isNew = !id;
      let prev: Assistant | null = null;
      let base: Json = {};
      if (id) {
        if (from) throw new Error('from copies an agent into a new one: leave out id.');
        prev = findAssistant(d.db, id);
        if (!prev) throw new Error(`There is no agent with the id “${id}”: list_agents gives them.`);
        if (prev.builtin) throw new Error(`“${prev.name}” is built in and cannot be changed. Make a copy with save_agent from: "${prev.id}", and change that.`);
        base = { ...prev };
      } else if (from) {
        const src = findAssistant(d.db, from) ?? allAssistants(d.db).find((x) => x.name.toLowerCase() === from.toLowerCase());
        if (!src) throw new Error(`There is no agent “${from}” to copy: list_agents gives the ids.`);
        const { id: _id, builtin: _b, source: _s, examples: _e, ...settings } = src;
        base = { ...settings, name: String(a.name ?? '').trim() ? undefined : `${src.name} (copy)` };
      }
      const m = merged(d, base, a, isNew);
      if (isNew && !String(m.name ?? '').trim()) throw new Error('Give the new agent a name.');
      // Mistakes come back now, before any card shows.
      const clean = cleanAssistant(m);
      const target: Assistant = { id: prev?.id ?? 'new', ...clean };
      const name = namer(d);
      const agentLines = prev ? agentChanges(prev, target, name) : [];
      const same = !!prev && JSON.stringify(cleanAssistant(prev)) === JSON.stringify(clean);
      const ops = planSchedules(d, ctx, target, a.schedules, isNew, tz);
      if (!isNew && same && !ops.length) throw new Error('That changes nothing.');
      // An agent that never asks (its sessions, and its scheduled runs) is asked for every time, Full access too, as a
      // session's own permissions are (app_api).
      const freer = clean.mode === 'full' && prev?.mode !== 'full';
      const detail = [
        ...(isNew ? newAgentLines(d, clean) : same ? [] : agentLines.map((l) => `- ${l}`)),
        ...scheduleLines(ops),
        ...(freer ? ['', 'Its sessions and scheduled runs will never ask before they act.'] : []),
      ].join('\n');
      const declined = await confirmChange(ctx, {
        title: isNew ? `Make the agent “${clean.name}”` : `Change “${prev!.name}”`,
        detail,
        level: freer ? 'ask' : ops.length ? 'always' : 'confirm',
        label: isNew ? 'Create agent' : 'Save',
      });
      if (declined) return { text: declined, isError: true };

      // The agent first (its schedules need its id), then each schedule.
      const body: Json = { ...m, ...(a.why ? { why: String(a.why).slice(0, 600) } : {}) };
      let saved = prev;
      if (isNew || !same) saved = ((await api(ctx, isNew ? 'POST' : 'PUT', isNew ? '/api/assistants' : `/api/assistants/${encodeURIComponent(prev!.id)}`, body)).assistant ?? null) as Assistant | null;
      if (!saved) throw new Error('The app did not say what it saved.');
      const out: string[] = [isNew ? `Made the agent “${saved.name}” (id ${saved.id}); its page is /agents/${saved.id}.` : same ? `“${saved.name}” stays as it is (id ${saved.id}); its page is /agents/${saved.id}.` : `Saved “${saved.name}” (id ${saved.id}); its page is /agents/${saved.id}.`];
      let failed = false;
      for (const op of ops) {
        try {
          if (op.kind === 'remove') {
            await api(ctx, 'DELETE', `/api/tasks/${encodeURIComponent(op.id)}`);
            out.push(`- Removed the schedule “${op.name}” (task ${op.id}).`);
            continue;
          }
          const task = (await api(ctx, 'POST', '/api/tasks', op.kind === 'add' ? { ...op.body, extra: { assistant: saved.id } } : op.body)).task as ScheduledTask;
          const nextRun = !task.enabled ? 'paused' : task.nextAt ? `next run ${localText(task.nextAt, tz)} (${tz})` : task.schedule.kind === 'watch' ? 'it checks right away, then on its own' : 'no run to come';
          out.push(`- ${op.kind === 'add' ? 'Added' : 'Changed'} the schedule “${task.name}” (task ${task.id}): ${scheduleText(task.schedule, tz)}, ${nextRun}.`);
        } catch (e) {
          failed = true;
          out.push(`- FAILED: ${op.line}: ${(e as Error).message}`);
        }
      }
      if (failed) out.push(isNew || !same ? 'The agent itself was saved; the schedules marked FAILED were not. Fix them and call save_agent again with only those.' : 'The schedules marked FAILED were not changed.');
      return { text: out.join('\n'), ...(failed ? { isError: true } : {}) };
    },
  };
}

// ---- delete_agent ---------------------------------------------------------------------------------------------

function deleteAgent(tz: string): RunTool {
  return {
    name: 'delete_agent',
    description:
      'Delete one of the user’s own agents (ids from list_agents), with its schedules and its history of results. Built-in agents cannot be deleted. The user confirms on a card, and their answer comes back as this tool’s result, so do not ask them to confirm in text first. To keep the agent and stop only a schedule, use save_agent with schedules: [{ id, remove: true }].',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The agent’s id (list_agents).' }, why: { type: 'string', description: 'One sentence on why, for the card.' } },
      required: ['id'],
    },
    async run(a, ctx): Promise<string | ToolOutput> {
      const d = ctx.deps;
      const no = refusal(d, ctx, 'delete agents');
      if (no) throw new Error(no);
      const x = findAssistant(d.db, String(a.id ?? '').trim());
      if (!x) throw new Error(`There is no agent with the id “${String(a.id ?? '').trim()}”: list_agents gives them.`);
      if (x.builtin) throw new Error(`“${x.name}” is built in and cannot be deleted.`);
      const tasks = tasksOf(d, x.id);
      const detail = [
        String(a.why ?? '').trim() ? cut(String(a.why).trim(), 300) : '',
        'Sessions started as it keep going without its instructions.',
        tasks.length ? `Its ${plural(tasks.length, 'schedule', 'schedules')} are deleted with it:\n${tasks.map((t) => `- “${t.name}”: ${when(t.schedule, tz)}`).join('\n')}` : '',
        'Its history of results goes; the pages and spreadsheets it filled stay.',
      ]
        .filter(Boolean)
        .join('\n\n');
      const declined = await confirmChange(ctx, { title: `Delete “${x.name}”`, detail, level: 'always', danger: true, label: 'Delete' });
      if (declined) return { text: declined, isError: true };
      const r = await api(ctx, 'DELETE', `/api/assistants/${encodeURIComponent(x.id)}`);
      const n = typeof r.schedules === 'number' ? r.schedules : tasks.length;
      return n ? `Deleted ${x.name} and its ${plural(n, 'schedule', 'schedules')}.` : `Deleted ${x.name}; it had no schedules.`;
    },
  };
}

/** The tools for the user’s own agents: any session may list, make, change and delete them, with the user confirming on a card. */
export function agentTools(ctx: RunCtx): RunTool[] {
  const tz = userTimezone(ctx.deps.db);
  return [listAgents(), saveAgent(tz), deleteAgent(tz)];
}
