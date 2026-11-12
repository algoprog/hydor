// Hydor subagents (child sessions in the code): an agent hands a self-contained part of its job to a new session (Custom with any of
// its models, Claude Code, Codex or another ACP agent) that works on it in parallel. When the child's turn
// ends, its reply comes back to the parent as a message and the parent goes on. One level only, a few
// at a time, never in a freer mode than the parent, and within a share of the parent's spending cap.
// It is all tools on the app's own MCP server, so any agent can delegate to any other. Each child gets a tier for
// its part, never above its parent's own (Standard when none is asked for, in a team): the parent leads, the
// subagents do the well-defined parts for less (team.ts says what the parent is told).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_RUNNING_DEFAULT, MAX_RUNNING_LIMIT, SWARM_SIZE_DEFAULT, SWARM_SIZE_LIMIT, type ChildNote, type ChildSettings } from '../../shared/children.ts';
import { researchOf } from '../../shared/research.ts';
import type { Agent, AgentModel, SessionSummary } from '../../shared/types.ts';
import { acpAgents, CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { capReached, childShare, spending } from '../budget/index.ts';
import { confidentialKey, confidentialRun, privateHelper } from '../confidential/index.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { parseExtra, sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import type { Deps, Feature, RunCtx, RunTool, TurnInfo } from '../features/types.ts';
import { helper, helperJson } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { addNote } from '../notes.ts';
import { lastTurn, opensTurn, type Turn } from '../opinion/turns.ts';
import { childKeys, parentOf } from './family.ts';
import { childMode, modeFamily, modeLevel } from './modes.ts';
import { roleOf } from '../swarm/roles.ts';
import { agentMode, assistantExtra, inScope, mayAsk, type Assistant } from '../../shared/assistants.ts';
import { clampTier, isTier, lowerTier, nextTier, tierLabel, tierProgram, tierRank, TIERS, type Tier } from '../../shared/tiers.ts';
import { allAssistants, findAssistant } from '../assistants/store.ts';
import { modelName, teamOf, tierPick } from '../assistants/tiers.ts';
import { leadTier, stepUpSelf, teamNote } from './team.ts';
import { sendToInbox } from '../assistants/inbox.ts';

export { childKeys, parentOf } from './family.ts';

const SETTING = 'children.maxRunning';
const SWARM_SETTING = 'children.swarmSize';

/** How many children of one session may work at the same time (Settings → Child sessions). */
export function maxRunning(db: DB): number {
  const n = Number(kvGet(db, SETTING));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_RUNNING_LIMIT) : MAX_RUNNING_DEFAULT;
}

/** How many members of a swarm may work at the same time (Settings → Child sessions). */
export function swarmSize(db: DB): number {
  const n = Number(kvGet(db, SWARM_SETTING));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, SWARM_SIZE_LIMIT) : SWARM_SIZE_DEFAULT;
}

/** How many of a session's children may work at once: a swarm's size for a swarm's lead, a deep research's breadth for its lead. */
export const maxFor = (db: DB, ctx: { runId?: string; key: string }): number =>
  roleOf(db, ctx)?.role === 'lead' ? swarmSize(db) : (researchOf(sessionExtra(db, ctx.key))?.breadth ?? maxRunning(db));

/** A reply longer than this comes back as a summary, with the way to read it whole. */
export const LONG_REPLY = 4000;

const BUSY = new Set(['starting', 'working', 'waiting']);
const busy = (s?: SessionSummary | null) => !!s?.live && BUSY.has(s.live.status);

/** Children being created right now, per parent: a burst of calls counts them before they show as running. */
const starting = new Map<string, number>();
/** Turns already reported, so one is never sent twice. */
const reported = new Set<string>();

const ONE_LEVEL = 'This is a Hydor subagent: it cannot start Hydor subagents of its own (one level only). Do this part yourself, and say in your reply what else is needed.';

/** What a child is told, beside its brief. */
export const CHILD_INSTRUCTIONS = [
  'This is a Hydor subagent: another session started it to do one part of a bigger job, and the first message is its brief.',
  'Nobody watches it as it works, so decide small questions yourself (and say what you decided); stop to ask only when you cannot go on.',
  'Your reply at the end of each turn goes back to the session that started you, as a message: make it a complete, short report of what you did',
  'and found, the files you changed or made (with their paths), and anything left open. Put long material in a file and give its path.',
  'You cannot start Hydor subagents yourself.',
].join(' ');

// ---- which agent and model -----------------------------------------------------------------------

interface Target {
  agent: Agent;
  acpAgent?: string;
  model?: string;
  /** "Custom · Qwen3 Coder", "Claude Code", "Gemini CLI". */
  label: string;
}

/** Custom's models (Settings → Models), as its agent process reads them. */
function customModels(): AgentModel[] {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
  } catch {
    return [];
  }
}

/** One of Custom's models by its id, or by a name only it has. */
export function findModel(models: AgentModel[], q: string): AgentModel | undefined {
  const w = q.trim().toLowerCase();
  if (!w) return undefined;
  const exact = models.find((m) => m.id.toLowerCase() === w);
  if (exact) return exact;
  const one = (list: AgentModel[]) => (list.length === 1 ? list[0] : undefined);
  return one(models.filter((m) => m.model.toLowerCase() === w)) ?? one(models.filter((m) => m.label.toLowerCase() === w)) ?? one(models.filter((m) => m.id.toLowerCase().endsWith(`/${w}`)));
}

const modelList = (models: AgentModel[]) => models.map((m) => `${m.id} (${m.label})`).join(', ');

/** The agent and model a child runs with, from the tool's arguments; the same agent as the parent by default. */
export function pickAgent(d: Deps, ctx: Pick<RunCtx, 'agent' | 'acpAgent' | 'key'>, agentArg: unknown, modelArg: unknown): Target {
  const models = customModels();
  const model = String(modelArg ?? '').trim();
  let want = String(agentArg ?? '').trim().toLowerCase();
  if (!want) want = model && findModel(models, model) ? 'custom' : ctx.agent === 'acp' ? (ctx.acpAgent === CONSOLE_ID ? 'custom' : (ctx.acpAgent ?? 'custom')) : ctx.agent;
  if (want === 'custom' || want === CONSOLE_ID) {
    if (!models.length) throw new Error('Custom has no models yet: the user adds them in Settings → Models.');
    // A Custom parent's own model by default; from another agent, the model has to be named.
    const own = ctx.agent === 'acp' && ctx.acpAgent === CONSOLE_ID ? d.sessions.summary(ctx.key)?.live?.model : undefined;
    const m = model ? findModel(models, model) : own ? findModel(models, own) : undefined;
    if (!m) throw new Error(`${model ? `Custom has no model "${model}".` : 'Name the model for Custom.'} Its models: ${modelList(models)}.`);
    return { agent: 'acp', acpAgent: CONSOLE_ID, model: m.id, label: `Custom · ${m.label}` };
  }
  if (want === 'claude' || want === 'claude code' || want === 'claude-code') return { agent: 'claude', model: model || undefined, label: `Claude Code${model ? ` · ${model}` : ''}` };
  if (want === 'codex') return { agent: 'codex', model: model || undefined, label: `Codex${model ? ` · ${model}` : ''}` };
  const others = acpAgents(d.db).filter((a) => a.id !== CONSOLE_ID);
  const a = others.find((x) => x.id.toLowerCase() === want || x.name.toLowerCase() === want);
  if (!a) throw new Error(`There is no agent "${String(agentArg)}". Pick custom (with a model), claude, codex${others.length ? `, or one of ${others.map((x) => x.id).join(', ')}` : ''}.`);
  return { agent: 'acp', acpAgent: a.id, model: model || undefined, label: a.name };
}

/** The program a child will run (for its tier's model), as pickAgent would choose it from the same arguments. */
function programOf(ctx: Pick<RunCtx, 'agent' | 'acpAgent'>, agentArg: string, modelArg: string, models: AgentModel[]): { agent: Agent; acpAgent?: string } {
  let want = agentArg.trim().toLowerCase();
  if (!want) want = modelArg && findModel(models, modelArg) ? 'custom' : ctx.agent === 'acp' ? (ctx.acpAgent === CONSOLE_ID ? 'custom' : (ctx.acpAgent ?? 'custom')) : ctx.agent;
  if (want === 'custom' || want === CONSOLE_ID) return { agent: 'acp', acpAgent: CONSOLE_ID };
  if (want === 'claude' || want === 'claude code' || want === 'claude-code') return { agent: 'claude' };
  if (want === 'codex') return { agent: 'codex' };
  return { agent: 'acp', acpAgent: want };
}

/** The program one of the user's agents names, as start_child_session's agent argument; empty when it names none. */
const agentArgOf = (a: Assistant): string => (!a.agent ? '' : a.agent === 'acp' ? (a.acpAgent === CONSOLE_ID ? 'custom' : (a.acpAgent ?? '')) : a.agent);

/** The user's agents a session may hand work to: in its project, and allowed by the agent it works as. */
function namedFor(d: Deps, key: string): Assistant[] {
  const x = sessionExtra(d.db, key);
  const lead = findAssistant(d.db, x.assistant);
  return allAssistants(d.db).filter((a) => inScope(a, typeof x.space === 'string' ? x.space : null) && mayAsk(lead, a));
}

/** The folder a child works in: the parent's, or one it names (relative to the parent's). */
function folder(arg: unknown, cwd: string): string {
  const p = String(arg ?? '').trim();
  if (!p) return cwd;
  const dir = path.resolve(cwd, p.replace(/^~(?=[\\/]|$)/, os.homedir()));
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`There is no folder ${dir}.`);
  return dir;
}

/** The message that began the parent's current turn: the child's card goes under that turn. */
async function currentPrompt(d: Deps, key: string): Promise<string | undefined> {
  try {
    const items = (await d.sessions.timeline(key)).parser.items;
    for (let i = items.length - 1; i >= 0; i--) if (opensTurn(items[i])) return items[i].id;
  } catch {}
  return undefined;
}

const firstLine = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t;
};

// ---- the tools -----------------------------------------------------------------------------------

/** The highest tier a session's subagents may have: never above its own, nor above what the agent it works as allows. */
function ceilingOf(d: Deps, ctx: { key: string; agent: Agent; acpAgent?: string }, lead: Assistant | null): Tier {
  return lowerTier(leadTier(d, ctx), lead?.helperMax)!;
}

const orList = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/** What each tier is for, as a lead reads it when it picks one for a child. */
const TIER_FOR: Record<Tier, string> = {
  quick: 'quick (the cheapest: a small, very clear job whose result can be checked, such as a targeted edit in files you name, pulling out facts, sorting, formatting or a short summary)',
  standard: 'standard (a clear task of medium size: a change you have spelled out, tests, research on a set question, a draft to an outline)',
  best: 'best (a hard, open-ended part that stands on its own)',
  max: 'max (only the hardest part of a hard problem)',
};

/**
 * `local`: the parent is confidential, so its children run on Custom with a model on this computer (server/confidential).
 * `named`: the user's agents it may hand work to (by name, with their own instructions, tools and tier); `top`: the
 * highest tier its subagents may have (its own, or lower when the agent it works as says so); `team`: a child asked for
 * with no tier gets Standard.
 */
function startTool(d: Deps, max: number, local = false, named: Assistant[] = [], top: Tier = 'best', team = false): RunTool {
  const models = customModels().filter((m) => !local || m.local);
  const agents = local ? [] : named;
  const offered = TIERS.map((t) => t.id).filter((t) => tierRank(t) <= tierRank(top));
  return {
    name: 'start_child_session',
    description: [
      'Hand a self-contained part of the job to a Hydor subagent: a new session of its own that works on it in parallel.',
      local
        ? 'This session is confidential, so a Hydor subagent runs here too: on custom, with one of the models on this computer, and confidential like this one.'
        : 'It can run another agent or model of this app: a cheaper or local model for bulk work, Claude Code or Codex for a hard part.',
      'It starts at once and returns its key; when its turn ends, its reply comes back to you as a message, and you go on from there.',
      'A Hydor subagent sees nothing of this conversation: put everything it needs in the brief (the goal, the facts and files it needs, what to hand back).',
      `Use it for parts that can be handed over whole, not for single steps you can take yourself. A Hydor subagent cannot start Hydor subagents; at most ${max} of yours run at once.`,
      local
        ? ''
        : `Give each Hydor subagent the lowest tier that can do its part well: ${orList(offered.map((t) => TIER_FOR[t]))}.${team ? ` With no tier a Hydor subagent gets ${tierLabel(clampTier('standard', top)).toLowerCase()}.` : ''} A Hydor subagent never thinks with a tier above ${tierLabel(top).toLowerCase()}.`,
      local
        ? ''
        : 'A Hydor subagent on a tier whose reply to its brief does not pass a quick check runs again one tier up by itself (never above the highest allowed); its later replies, to your messages, are not checked. step_up_child does that when you judge a result not good enough.',
      agents.length
        ? `You can also hand a part to one of the user's agents, by its name in as; it works with its own instructions, tools and tier: ${agents
            .slice(0, 40)
            .map((a) => `${a.name} (${a.description || 'no description'}${a.tier ? `; ${tierLabel(a.tier)}` : ''})`)
            .join('; ')}${agents.length > 40 ? `; and ${agents.length - 40} more` : ''}.`
        : '',
      'The user sees each one as a Hydor subagent (a card in this conversation, a row in the tray above the message box, under this session in the sidebar), told apart from your program’s own subagents, and can open it.',
    ]
      .filter(Boolean)
      .join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Everything the Hydor subagent needs: the goal, context, files, limits, and what its reply should contain.' },
        agent: { type: 'string', description: 'custom (the app’s own agent: name the model), claude, codex, or another agent’s id. Default: the same agent as yours.' },
        model: {
          type: 'string',
          description: models.length ? `For custom, one of: ${models.map((m) => m.id).join(', ')}. For claude or codex, a model name (default: the agent’s own).` : 'For claude or codex, a model name (default: the agent’s own).',
        },
        cwd: { type: 'string', description: 'The folder to work in (default: yours).' },
        worktree: { type: 'boolean', description: 'Work on a branch of its own in a new worktree of the folder’s git repository, so its changes do not mix with others’ (a campaign’s members always do).' },
        title: { type: 'string', description: 'A short name for it, shown to the user.' },
        ...(local
          ? {}
          : {
              tier: {
                type: 'string',
                enum: offered,
                description: `The tier for its part: quick for a small, very clear job; standard for a clear task of medium size${tierRank(top) >= tierRank('best') ? '; best for a hard part that stands on its own' : ''}. Used when no model is named; a named agent keeps its own.`,
              },
            }),
        ...(agents.length ? { as: { type: 'string', description: `One of the user's agents to hand this part to, by name: ${agents.map((a) => a.name).join(', ')}.` } } : {}),
      },
      required: ['brief'],
    },
    async run(a, ctx) {
      return startChild(d, ctx, a, { max, local, models });
    },
  };
}


/** What a child on a tier keeps, to run again one tier up when it fails a check (or its lead asks). */
interface StepUp {
  tier: Tier;
  /** The highest tier its lead may give a subagent: its own, or lower when the agent it works as says so. */
  max: Tier;
  brief: string;
  agent?: string;
  as?: string;
  cwd: string;
  worktree?: boolean;
  title: string;
}

type StartCtx = Pick<RunCtx, 'key' | 'agent' | 'acpAgent' | 'cwd'> & { runId?: string };

/**
 * Starts a child session for a parent (start_child_session, and a step up): the agent and model (a named agent's own, or
 * a tier's), the mode no freer than the parent's, a share of its cap, and a card in its turn. `tierOverride` runs it on
 * that tier whatever was asked (a step up), `baseBrief` is the brief before the note a step up adds, `stepFrom` the child
 * it takes over from.
 */
async function startChild(
  d: Deps,
  ctx: StartCtx,
  a: Record<string, unknown>,
  o: { max: number; local: boolean; models: AgentModel[]; tierOverride?: Tier; baseBrief?: string; stepFrom?: ChildNote['steppedFrom'] },
): Promise<string> {
  const { max, local, models } = o;
  const brief = String(a.brief ?? '').trim();
  if (!brief) throw new Error('The brief is empty. Write a self-contained brief: the Hydor subagent sees nothing of this conversation.');
  if (parentOf(d.db, ctx.key)) throw new Error(ONE_LEVEL);
  const own = sessionExtra(d.db, ctx.key);
  const leadAgent = findAssistant(d.db, own.assistant);
  // One of the user's agents, by name: in this session's project, and allowed by the agent this session works as.
  let named: Assistant | null = null;
  const asArg = String(a.as ?? '').trim();
  if (asArg) {
    if (local) throw new Error('This session is confidential: its Hydor subagents cannot work as other agents.');
    const w = asArg.toLowerCase();
    const all = allAssistants(d.db);
    named = all.find((x) => x.id.toLowerCase() === w) ?? all.find((x) => x.name.toLowerCase() === w) ?? null;
    const offer = namedFor(d, ctx.key);
    if (!named) throw new Error(`The user has no agent "${asArg}".${offer.length ? ` Those you can hand work to: ${offer.map((x) => x.name).join(', ')}.` : ''}`);
    if (!inScope(named, typeof own.space === 'string' ? own.space : null)) throw new Error(`${named.name} works only in its own projects, not here.`);
    if (!mayAsk(leadAgent, named))
      throw new Error(
        named.askable === false
          ? `${named.name} does not take work from other agents.`
          : named.id === leadAgent?.id
            ? `You are ${named.name}: do this part yourself, or start a plain Hydor subagent for it.`
            : `${leadAgent!.name} may not hand work to ${named.name}: the user can allow it in ${leadAgent!.name}'s settings (Team).`,
      );
  }
  // An agent that keeps a conversation of its own takes the brief in its inbox; its answer comes back as a message.
  if (named?.standing) {
    const leadName = leadAgent?.name ?? d.sessions.summary(ctx.key)?.title ?? 'another session';
    const item = sendToInbox(d, named, { text: brief, from: { kind: 'agent', key: ctx.key, name: leadName }, replyTo: ctx.key });
    return `Put in ${named.name}'s inbox (message ${item.id.slice(0, 6)}): it keeps one conversation of its own and takes messages in turn. Its answer comes to you as a message; go on with other work, or end your turn to wait for it.`;
  }
  const agentArg = String(a.agent ?? '').trim() || (named ? agentArgOf(named) : '');
  let modelArg = String(a.model ?? '').trim();
  // A named agent on its own program keeps its own model, unless it thinks with a tier.
  if (!modelArg && named && !String(a.agent ?? '').trim() && named.model && !named.tier && !o.tierOverride) modelArg = named.model;
  // A swarm's members take on hard problems: they run with the lead's own model and effort unless it names others.
  const role = roleOf(d.db, ctx);
  // The tier: a named agent's own; else the one asked for, never above the lead's own tier nor what its agent allows. With none
  // asked for: Standard in a team (the lead leads, subagents do the clear parts for less), else the highest its agent allows.
  const ceiling = ceilingOf(d, ctx, leadAgent);
  const unasked = teamOf(d.db).on && role?.role !== 'lead' && !local ? clampTier('standard', ceiling) : leadAgent?.helperMax;
  const asked = isTier(a.tier) ? clampTier(a.tier, ceiling) : unasked;
  let tier: Tier | undefined = o.tierOverride ?? (named ? named.tier : modelArg ? undefined : asked);
  let tierEffort: string | undefined;
  if (tier && !modelArg) {
    const prog = programOf(ctx, agentArg, modelArg, models);
    const pick = tierPick(d.db, tier, prog.agent, prog.acpAgent);
    // Custom's tier names one of its models; one that is gone is passed over.
    if (pick?.model && (prog.acpAgent !== CONSOLE_ID || findModel(models, pick.model))) modelArg = pick.model;
    tierEffort = pick?.effort;
    // A tier that says nothing for the child's program (Custom before its tiers are set, another ACP agent) is no tier:
    // the child runs as it would have, with no tier to its name and none to step up to.
    if (!pick?.model && !pick?.effort && !o.tierOverride) tier = undefined;
  }
  const target = pickAgent(d, ctx, agentArg, modelArg);
  const lead = role?.role === 'lead' ? d.sessions.summary(ctx.key) : null;
  // A campaign's members each change their part on a branch of their own.
  const worktree = !!a.worktree || (role?.role === 'lead' && role.mode === 'campaign');
  const same = !!lead && target.agent === ctx.agent && target.agent !== 'acp' && !modelArg && !tier;
  if (same && lead?.prefs?.model) {
    target.model = lead.prefs.model;
    target.label = `${target.label} · ${lead.prefs.model}`;
  }
  const effort = tierEffort ?? (same ? lead?.prefs?.effort : undefined);
  if (named) target.label = `${named.name} · ${target.label}`;
  if (tier) target.label = `${target.label} · ${tierLabel(tier)}`;
  const running = childKeys(d.db, ctx.key).filter((k) => busy(d.sessions.summary(k))).length + (starting.get(ctx.key) ?? 0);
  if (running >= max) throw new Error(`${running} of your Hydor subagents are working already, the most at once. Wait for one to finish (its reply comes to you as a message), then start the next; or do this part yourself.`);
  const capUsd = childShare(d.db, ctx.key, max);
  const cwd = folder(a.cwd, ctx.cwd);
  const parent = d.sessions.summary(ctx.key);
  const parentMode = childMode({ family: modeFamily(ctx.agent, ctx.acpAgent), mode: parent?.live?.mode ?? parent?.prefs?.mode }, modeFamily(target.agent, target.acpAgent));
  // A named agent's own mode when it is stricter than the parent's: never freer.
  const namedMode = named ? agentMode(named.mode, target.agent, target.acpAgent) : undefined;
  const fam = modeFamily(target.agent, target.acpAgent);
  const mode = namedMode && (!parentMode || modeLevel(fam, namedMode) < modeLevel(fam, parentMode)) ? namedMode : parentMode;
  const title = firstLine(String(a.title ?? '') || brief, 70);
  // A child on a tier below the highest its lead allows can run again one tier up: by itself when it fails a check (as far as Best), or when its lead asks.
  const stepRec: StepUp | undefined =
    tier && !local && tierRank(tier) < tierRank(ceiling)
      ? { tier, max: ceiling, brief: (o.baseBrief ?? brief).slice(0, 20_000), ...(agentArg ? { agent: agentArg } : {}), ...(named ? { as: named.id } : {}), cwd, ...(worktree ? { worktree } : {}), title }
      : undefined;
  starting.set(ctx.key, (starting.get(ctx.key) ?? 0) + 1);
  let key: string;
  try {
    key = await d.sessions.create({
      agent: target.agent,
      acpAgent: target.acpAgent,
      cwd,
      prompt: brief,
      model: target.model,
      effort,
      mode,
      worktree,
      title,
      remember: false,
      account: target.agent === ctx.agent && target.agent !== 'acp' ? d.sessions.accountOf(ctx.key) : undefined,
      extra: { parent: ctx.key, ...(capUsd != null ? { capUsd } : {}), ...(named ? assistantExtra(named) : {}), ...(stepRec ? { stepUp: stepRec } : {}) },
    });
  } finally {
    const n = (starting.get(ctx.key) ?? 1) - 1;
    if (n > 0) starting.set(ctx.key, n);
    else starting.delete(ctx.key);
  }
  const s = d.sessions.summary(key);
  const note: ChildNote = {
    child: key,
    agent: target.agent,
    acpAgent: target.acpAgent,
    acpName: s?.acpName,
    model: target.model,
    label: target.label,
    title,
    brief: firstLine(brief, 300),
    cwd: s?.cwd ?? cwd,
    worktree: !!s?.worktree || undefined,
    capUsd,
    ...(named ? { as: named.name, asId: named.id } : {}),
    ...(tier ? { tier } : {}),
    ...(o.stepFrom ? { steppedFrom: o.stepFrom } : {}),
    startedAt: Date.now(),
  };
  addNote(d.db, { key: ctx.key, kind: 'child', anchor: await currentPrompt(d, ctx.key), data: note });
  return [
    `Started Hydor subagent ${key}: "${title}" (${target.label}${mode ? `, mode ${mode}` : ''}${s?.worktree ? `, on branch ${s.worktree.branch}` : ''}${capUsd != null ? `, spending cap $${capUsd.toFixed(2)}` : ''}).`,
    'It works on its own now. Its reply comes to you as a message when its turn ends: go on with other work, or end your turn to wait for it.',
    'child_sessions shows how your Hydor subagents are doing; message_child sends one more to do.',
  ].join('\n');
}

function statusOf(s: SessionSummary | null): string {
  if (!s) return 'removed';
  const st = s.live?.status;
  if (st === 'working' || st === 'starting') return 'working';
  if (st === 'waiting') return 'waiting for the user (an approval or a question)';
  if (st === 'error' || s.live?.error) return `stopped with an error${s.live?.error ? `: ${firstLine(s.live.error, 160)}` : ''}`;
  return st === 'idle' ? 'finished its turn' : 'not running';
}

const ago = (ts?: number) => {
  if (!ts) return 'never';
  const m = Math.round((Date.now() - ts) / 60_000);
  return m < 1 ? 'just now' : m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

const LIST: RunTool = {
  name: 'child_sessions',
  description:
    'Your Hydor subagents: what each is doing, its agent and model, when it last did something, what it has spent, and the start of its latest reply. With key, the whole latest reply of that Hydor subagent.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'One Hydor subagent’s key: its whole latest reply.' } } },
  annotations: { readOnlyHint: true },
  async run(a, ctx) {
    const d = ctx.deps;
    const keys = childKeys(d.db, ctx.key);
    const want = String(a.key ?? '').trim();
    if (want) {
      if (!keys.includes(want)) throw new Error('That is not one of your Hydor subagents.');
      const t = lastTurn((await d.sessions.timeline(want)).parser.items);
      return t?.reply ? `Latest reply of ${want}:\n\n${t.reply}` : 'It has not replied yet.';
    }
    if (!keys.length) return 'You have no Hydor subagents yet. start_child_session starts one.';
    const lines: string[] = [];
    for (const k of keys) {
      const s = d.sessions.summary(k);
      const reply = s ? lastTurn((await d.sessions.timeline(k)).parser.items)?.reply : '';
      const spent = spending(d.db, k).ownUsd;
      const cap = typeof s?.extra?.capUsd === 'number' ? ` of $${s.extra.capUsd.toFixed(2)}` : '';
      lines.push(
        `- ${k} · "${s?.title ?? '?'}" · ${s?.acpName ?? s?.agent ?? '?'}${s?.model ? ` · ${s.model}` : ''} · ${statusOf(s)} · last active ${ago(s?.updatedAt)} · spent $${spent.toFixed(2)}${cap}` +
          (reply ? `\n  latest reply: ${firstLine(reply, 240)}` : ''),
      );
    }
    return lines.join('\n');
  },
};

const MESSAGE: RunTool = {
  name: 'message_child',
  description:
    'Send one of your Hydor subagents a message: more to do, a correction, an answer to its question. If it is working, the message waits for its turn to end. Its reply comes back to you as a message, like its first one.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The Hydor subagent’s key.' }, text: { type: 'string' } }, required: ['key', 'text'] },
  async run(a, ctx) {
    const d = ctx.deps;
    const key = String(a.key ?? '').trim();
    const text = String(a.text ?? '').trim();
    if (!text) throw new Error('The text is empty.');
    if (!childKeys(d.db, ctx.key).includes(key)) throw new Error('That is not one of your Hydor subagents: child_sessions lists them.');
    const queued = busy(d.sessions.summary(key));
    await d.sessions.deliverOrQueue(key, `Message from the session that started you:\n\n${text}`);
    return queued ? 'Queued: it goes to the Hydor subagent when its current turn ends. Its reply comes to you as a message.' : 'Sent. Its reply comes to you as a message when its turn ends.';
  },
};

// ---- results flow back ---------------------------------------------------------------------------

/** What the parent is told when a child's turn ends; `summary` stands in for a long reply. */
export function resultMessage(o: { key: string; title: string; label: string; link: string; turn: Turn; error?: string; stopped?: string; summary?: string }): string {
  const who = `Hydor subagent "${o.title}" (${o.key}, ${o.label})`;
  const reply = o.turn.reply.trim();
  const head =
    o.turn.status === 'interrupted'
      ? `[The ${who} was stopped before it finished${o.stopped ? `: ${o.stopped}` : ''}.${reply ? ' What it wrote is below.' : ''}]`
      : o.error
        ? `[The ${who} stopped with an error: ${firstLine(o.error, 300)}]`
        : `[Reply from the ${who}]`;
  if (!reply) return `${head}\n(It wrote no reply. child_sessions shows how it stands; the user can open it at ${o.link}.)`;
  if (o.summary) return `${head}\nIts reply is long (${reply.length.toLocaleString('en-US')} characters), so here is a summary. child_sessions with key "${o.key}" gives the whole of it; the user can open it at ${o.link}.\n\n${o.summary.trim()}`;
  return `${head}\n\n${reply}`;
}

/**
 * A long reply in a few lines, by the helper model; its start when that fails. A confidential child's (`key`) only by
 * a model on this computer, else its start.
 */
async function summarize(d: Deps, reply: string, key?: string): Promise<string> {
  const model = key && confidentialKey(d.db, key) ? privateHelper(d, key) : undefined;
  if (model !== null)
    try {
      const s = await helper(d.db, {
        system: 'You summarize a report one AI agent wrote for another. Keep every finding, number, decision, file path and open question; drop the narration. Plain text, at most 200 words, beginning with the first finding: no title or preamble.',
        prompt: reply.slice(0, 60_000),
        maxTokens: 600,
        timeoutMs: 60_000,
        ...(model ? { model } : {}),
      });
      if (s.trim()) return s.trim();
    } catch {}
  return `${reply.slice(0, 1500).trimEnd()}…`;
}

/** Sends the parent a message: now when it is free, else after its turn; refused (its cap), it waits in its queue. */
async function tell(d: Deps, parent: string, text: string) {
  try {
    await d.sessions.deliverOrQueue(parent, text);
  } catch {
    try {
      d.sessions.enqueue(parent, text);
    } catch {}
  }
}

/** Whether a stop-all marked the session (`stoppedAll`, `stoppedWithParent`) at or after `since`, a turn's start. */
const markedSince = (d: Deps, key: string, field: 'stoppedAll' | 'stoppedWithParent', since: number) => {
  const at = sessionExtra(d.db, key)[field];
  return typeof at === 'number' && at > 0 && at >= since;
};

/**
 * A child's report to its parent. When the parent was stopped (Stop all) at or after the turn began, the report waits in
 * its held queue, so it does not wake the parent that was just stopped; the user sees it there and resumes it.
 */
async function tellParent(d: Deps, parent: string, startedAt: number, text: string) {
  if (markedSince(d, parent, 'stoppedAll', startedAt)) {
    try {
      d.sessions.enqueue(parent, text, [], [], true);
    } catch {}
    return;
  }
  await tell(d, parent, text);
}

/** The turn of a child last reported to its parent (the id of the message that began it). */
const reportedTurn = (d: Deps, key: string) => parseExtra((d.db.prepare('select extra from app_sessions where key = ?').get(key) as { extra: string | null } | undefined)?.extra).reported;

/**
 * Turns of children that ended while the app was down (or were missed) and were never reported: after a
 * start, each recent child that is not working and whose latest finished turn is not yet reported is.
 */
export async function catchUp(d: Deps) {
  const rows = d.db.prepare(`select key, extra from app_sessions where instr(extra, '"parent":') > 0`).all() as { key: string; extra: string }[];
  for (const r of rows) {
    const x = parseExtra(r.extra);
    const s = d.sessions.summary(r.key);
    if (typeof x.parent !== 'string' || !s || busy(s) || !d.sessions.summary(x.parent) || (s.updatedAt ?? 0) < Date.now() - 24 * 3600_000) continue;
    try {
      const turn = lastTurn((await d.sessions.timeline(r.key)).parser.items);
      if (turn?.prompt && turn.status && x.reported !== turn.prompt.id) await reportTurn(d, { key: r.key, startedAt: turn.prompt.ts ?? 0, external: false });
    } catch {}
  }
}

/** A child's turn ended: its reply goes to the parent. */
export async function reportTurn(d: Deps, t: Pick<TurnInfo, 'key' | 'startedAt' | 'external'>) {
  if (t.external) return;
  const parent = parentOf(d.db, t.key);
  if (!parent || !d.sessions.summary(parent)) return;
  // A confidential child's words go to a confidential parent only (server/confidential).
  if (confidentialKey(d.db, t.key) && !confidentialKey(d.db, parent)) return;
  const tl = await d.sessions.timeline(t.key);
  let turn = lastTurn(tl.parser.items);
  // The transcript's last lines may land a moment late.
  for (let i = 0; i < 3 && (!turn || (turn.prompt?.ts ?? 0) < t.startedAt - 15_000 || (!turn.status && !turn.reply)); i++) {
    await new Promise((r) => setTimeout(r, 1500));
    await tl.readMore().catch(() => {});
    turn = lastTurn(tl.parser.items);
  }
  if (!turn?.prompt) return;
  const id = `${t.key}|${turn.prompt.id}`;
  if (reported.has(id) || reportedTurn(d, t.key) === turn.prompt.id) return;
  reported.add(id);
  if (reported.size > 2000) reported.delete(reported.values().next().value!);
  // Kept with the child, so a restart neither repeats it nor loses it (catchUp).
  setSessionExtra(d.db, t.key, { reported: turn.prompt.id });
  // A swarm member its lead or the user stopped: nobody needs the turn that was cut short.
  if (turn.status === 'interrupted' && sessionExtra(d.db, t.key).swarmStopped) return;
  // A child stopped with its parent (Stop all): the stop was the parent's own doing, so it is not told of it.
  if (turn.status === 'interrupted' && markedSince(d, t.key, 'stoppedWithParent', t.startedAt)) return;
  // A child on a tier whose turn did not pass a check runs again one tier up (never above its lead's highest).
  const up = await stepUpCheck(d, t.key, turn, t.startedAt);
  if (up) {
    try {
      await tellParent(d, parent, t.startedAt, await stepUpChild(d, parent, t.key, up.next, up.why));
      return;
    } catch {
      // It could not start again (the most at once, an agent gone): its reply goes as it is.
    }
  }
  const s = d.sessions.summary(t.key);
  const cap = capReached(d.db, t.key);
  // Custom's models by their names, the others' as the agent gives them.
  const model = s?.acpAgent === CONSOLE_ID && s.model ? (customModels().find((m) => m.id === s.model)?.label ?? s.model) : s?.model;
  const msg = resultMessage({
    key: t.key,
    title: s?.title ?? 'child',
    label: [s?.acpName ?? (s?.agent === 'claude' ? 'Claude Code' : s?.agent === 'codex' ? 'Codex' : 'agent'), model].filter(Boolean).join(' · '),
    link: `${d.publicBase()}/s/${encodeURIComponent(t.key)}`,
    turn,
    // An error the agent got past (it still replied) is not how the turn ended.
    error: turn.status === 'failed' || (turn.error && !turn.reply) ? (turn.error ?? s?.live?.error ?? 'it failed') : undefined,
    stopped: cap ? 'its spending cap was reached' : undefined,
    summary: turn.reply.length > LONG_REPLY ? await summarize(d, turn.reply, t.key) : undefined,
  });
  await tellParent(d, parent, t.startedAt, msg);
}

// ---- stepping up ---------------------------------------------------------------------------------

/** What an agent's program says when its plan's usage ran out, should the session manager not have seen it (a turn read back after a restart). */
const LIMIT = /\b(hit|reached) (your|its|the)\b.{0,24}\blimit\b|\busage limit\b/i;

const JUDGE = [
  'You check the work a subagent did for the agent that gave it the job. Answer with one JSON object and nothing else:',
  '{"pass": true or false, "why": "one short sentence"}. Fail it only when its reply plainly does not do the job: it says it could',
  'not or gave up, does another job, leaves out a part the brief asked for, or is plainly wrong. Pass anything that does the job, even briefly.',
].join(' ');

/** Why a subagent's reply fails its brief, by the helper model; empty when it does the job, or when the helper model cannot say. */
async function judge(d: Deps, brief: string, reply: string): Promise<string> {
  try {
    const r = await helperJson<{ pass?: unknown; why?: unknown }>(
      d.db,
      { system: JUDGE, prompt: `The job (its brief):\n${brief.slice(0, 6000)}\n\nThe subagent's reply:\n${reply.slice(0, 12_000)}`, maxTokens: 200, timeoutMs: 45_000 },
      'a check',
    );
    return r.pass === false ? firstLine(String(r.why ?? 'its reply does not do the job'), 200) : '';
  } catch {
    return '';
  }
}

/**
 * Whether a child's turn calls for running it again one tier up: it was started on a tier below the highest allowed (and
 * below Best), its lead's agent steps up, and its turn stopped with an error, wrote nothing, or does not do its brief (the
 * helper model's check). Never for a turn someone stopped or its plan's usage limit did, nor once its spending cap is
 * reached.
 */
async function stepUpCheck(d: Deps, key: string, turn: Turn, startedAt = 0): Promise<{ next: Tier; why: string } | null> {
  const x = sessionExtra(d.db, key).stepUp as StepUp | undefined;
  if (!x || !isTier(x.tier)) return null;
  // A turn its plan's usage limit stopped is no failure of the tier: another account takes it over, or it waits for the reset.
  if (d.sessions.stoppedAtLimit?.(key, startedAt) || LIMIT.test(turn.error ?? '')) return null;
  const next = nextTier(x.tier);
  // By itself a subagent goes no higher than Best: Max is for its lead to ask for.
  if (!next || tierRank(next) > tierRank(lowerTier(x.max, 'best')!)) return null;
  if (turn.status === 'interrupted' || capReached(d.db, key)) return null;
  const parent = parentOf(d.db, key);
  if (parent && findAssistant(d.db, sessionExtra(d.db, parent).assistant)?.stepUp === false) return null;
  // Only the turn that answers the brief is checked against it: a later turn answers a message (its lead's or the
  // user's: open the page, one more fix), and judging that by the whole brief would run all the work again.
  const judged = sessionExtra(d.db, key).stepJudged;
  if (judged && judged !== turn.prompt?.id) return null;
  if (!judged && turn.prompt?.id) setSessionExtra(d.db, key, { stepJudged: turn.prompt.id });
  if (turn.status === 'failed' || (turn.error && !turn.reply)) return { next, why: `it stopped with an error (${firstLine(turn.error ?? 'failed', 140)})` };
  if (!turn.reply.trim()) return { next, why: 'it wrote no reply' };
  const why = await judge(d, x.brief, turn.reply);
  return why ? { next, why } : null;
}

/** Runs a child's brief again on `tier`, as a new child of the same parent, told why the try before fell short; what the parent hears. */
async function stepUpChild(d: Deps, parent: string, key: string, tier: Tier, why: string): Promise<string> {
  const x = sessionExtra(d.db, key).stepUp as StepUp;
  const p = d.sessions.summary(parent);
  if (!p) throw new Error('Its parent session is gone');
  const brief = `${x.brief}\n\n(A try on ${tierLabel(x.tier)} fell short: ${why}. Do the whole job, and check your result before you reply.)`;
  const started = await startChild(
    d,
    { key: parent, agent: p.agent, acpAgent: p.acpAgent, cwd: p.cwd ?? x.cwd },
    { brief, agent: x.agent, as: x.as, cwd: x.cwd, worktree: x.worktree, title: x.title },
    { max: maxFor(d.db, { key: parent }), local: false, models: customModels(), tierOverride: tier, baseBrief: x.brief, stepFrom: { key, tier: x.tier, why } },
  );
  return `[The Hydor subagent "${x.title}" (${key}) on ${tierLabel(x.tier)} fell short: ${why}. It runs again on ${tierLabel(tier)}.]\n${started}`;
}

const STEP_UP: RunTool = {
  name: 'step_up_child',
  description:
    'Run a Hydor subagent’s brief again one tier up when its result was not good enough: a new Hydor subagent on the next tier (never above your own, nor the highest your agent allows) gets the same brief and why the first one fell short. Only for a Hydor subagent started on a tier that has finished its turn.',
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string', description: 'The Hydor subagent’s key.' }, why: { type: 'string', description: 'What was wrong with its result, for the new Hydor subagent.' } },
    required: ['key', 'why'],
  },
  async run(a, ctx) {
    const d = ctx.deps;
    const key = String(a.key ?? '');
    if (!childKeys(d.db, ctx.key).includes(key)) throw new Error('That is not one of your Hydor subagents.');
    const x = sessionExtra(d.db, key).stepUp as StepUp | undefined;
    if (!x) throw new Error('It was started without a tier, or on the highest a subagent of yours may have: do the part yourself, or start a Hydor subagent with another model.');
    if (busy(d.sessions.summary(key))) throw new Error('It is still working: wait for its reply, or message_child it.');
    const next = nextTier(x.tier);
    if (!next || tierRank(next) > tierRank(x.max)) throw new Error(`It is on ${tierLabel(x.tier)}, the highest a subagent of yours may have.`);
    return stepUpChild(d, ctx.key, key, next, String(a.why ?? '').trim() || 'its result was not good enough');
  },
};

/** The session's own step up: it carries on with Max's model when its problem proves harder than it looked. */
const STEP_UP_SELF: RunTool = {
  name: 'step_up_session',
  description:
    'Carry on with the strongest model (the Max tier) when the problem proves harder than it looked: a fix that has failed twice, a cause you cannot find, constraints that pull against each other, a proof. You keep the whole conversation and go on from where you are. Say why in a line: the user sees it. Not for work that is merely long: hand that to subagents.',
  inputSchema: { type: 'object', properties: { why: { type: 'string', description: 'What makes the problem hard, in a line.' } }, required: ['why'] },
  async run(a, ctx) {
    const d = ctx.deps;
    if (parentOf(d.db, ctx.key)) throw new Error('A Hydor subagent cannot step itself up: say in your reply that this part needs a stronger model.');
    const own = sessionExtra(d.db, ctx.key);
    const can = stepUpSelf(d, { agent: ctx.agent, acpAgent: ctx.acpAgent, key: ctx.key, assistant: own.assistant, auto: own.auto });
    if ('no' in can) throw new Error(can.no);
    const why = firstLine(String(a.why ?? ''), 200) || 'the problem is harder than it looked';
    await d.sessions.moveToTier(ctx.key, 'max', can.max, { event: 'stepUp', why });
    const name = modelName(d.db, ctx.agent, ctx.acpAgent, can.max.model) || 'the Max tier';
    // Codex takes a new model with its next turn: it ends this one, and is woken at once to carry on.
    if (ctx.agent === 'codex') {
      await tell(d, ctx.key, `[You now think with ${name}. Carry on with the task from where you stopped.]`);
      return `From your next turn you think with ${name}. End this turn now with one line on where you are: you are woken at once to carry on.`;
    }
    return `You now think with ${name}. Carry on from where you are.`;
  },
};

// ---- the capability ------------------------------------------------------------------------------

export const children: Feature = {
  id: 'children',

  tools(ctx) {
    const d = ctx.deps;
    // A child gets none: one level only.
    if (parentOf(d.db, ctx.key) || roleOf(d.db, ctx)?.role === 'member') return [];
    const x = sessionExtra(d.db, ctx.key);
    const lead = findAssistant(d.db, x.assistant);
    const local = confidentialRun(ctx);
    // A swarm's lead picked its model for a hard problem already, and its members think with it.
    const swarm = roleOf(d.db, ctx)?.role === 'lead';
    const start = startTool(d, maxFor(d.db, ctx), local, namedFor(d, ctx.key), ceilingOf(d, ctx, lead), teamOf(d.db).on && !swarm);
    // Its own step up to Max: for a session on Automatic, where Max is another model than Best and its agent names no tier of its own.
    const self = !local && !swarm && tierProgram(ctx.agent, ctx.acpAgent) && !('no' in stepUpSelf(d, { agent: ctx.agent, acpAgent: ctx.acpAgent, key: ctx.key, assistant: x.assistant, auto: x.auto }));
    return [start, LIST, MESSAGE, STEP_UP, ...(self ? [STEP_UP_SELF] : [])];
  },

  spawn(s, d) {
    if (s.extra?.parent) return { instructions: [CHILD_INSTRUCTIONS] };
    // The main agent of a session leads subagents on cheaper tiers (Settings → Models → Tiers).
    const team = teamNote(d, s);
    return team ? { instructions: [team] } : undefined;
  },

  turnEnd(t, d) {
    return reportTurn(d, t);
  },

  start(d) {
    // Once the agents are reattached and their transcripts read.
    setTimeout(() => void catchUp(d).catch(() => {}), 20_000).unref();
  },

  routes(d) {
    const settings = (): ChildSettings => ({ maxRunning: maxRunning(d.db), swarmSize: swarmSize(d.db) });
    d.app.get('/api/children/settings', async (): Promise<ChildSettings> => settings());
    d.app.put('/api/children/settings', async (req): Promise<ChildSettings> => {
      const b = (req.body ?? {}) as { maxRunning?: unknown; swarmSize?: unknown };
      const set = (v: unknown, key: string, limit: number) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1 || n > limit) throw new HttpError(400, `Pick a number from 1 to ${limit}`);
        kvSet(d.db, key, String(n));
      };
      if (b.maxRunning !== undefined) set(b.maxRunning, SETTING, MAX_RUNNING_LIMIT);
      if (b.swarmSize !== undefined) set(b.swarmSize, SWARM_SETTING, SWARM_SIZE_LIMIT);
      return settings();
    });
  },
};
