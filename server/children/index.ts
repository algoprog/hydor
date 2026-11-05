// Child sessions: an agent hands a self-contained part of its job to a new session (Custom with any of
// its models, Claude Code, Codex or another ACP agent) that works on it in parallel. When the child's turn
// ends, its reply comes back to the parent as a message and the parent goes on. One level only, a few
// at a time, never in a freer mode than the parent, and within a share of the parent's spending cap.
// It is all tools on the app's own MCP server, so any agent can delegate to any other.
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
import { helper } from '../helper.ts';
import { AGENT_FILE } from '../models/config.ts';
import { addNote } from '../notes.ts';
import { lastTurn, opensTurn, type Turn } from '../opinion/turns.ts';
import { childKeys, parentOf } from './family.ts';
import { childMode, modeFamily } from './modes.ts';
import { roleOf } from '../swarm/roles.ts';

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

const ONE_LEVEL = 'This is a child session: it cannot start child sessions of its own (one level only). Do this part yourself, and say in your reply what else is needed.';

/** What a child is told, beside its brief. */
export const CHILD_INSTRUCTIONS = [
  'This is a child session: another session started it to do one part of a bigger job, and the first message is its brief.',
  'Nobody watches it as it works, so decide small questions yourself (and say what you decided); stop to ask only when you cannot go on.',
  'Your reply at the end of each turn goes back to the session that started you, as a message: make it a complete, short report of what you did',
  'and found, the files you changed or made (with their paths), and anything left open. Put long material in a file and give its path.',
  'You cannot start child sessions yourself.',
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

/** `local`: the parent is confidential, so its children run on Custom with a model on this computer (server/confidential). */
function startTool(d: Deps, max: number, local = false): RunTool {
  const models = customModels().filter((m) => !local || m.local);
  return {
    name: 'start_child_session',
    description: [
      'Hand a self-contained part of the job to a new session that works on it in parallel: a child session.',
      local
        ? 'This session is confidential, so a child runs here too: on custom, with one of the models on this computer, and confidential like this one.'
        : 'It can run another agent or model of this app: a cheaper or local model for bulk work, Claude Code or Codex for a hard part.',
      'It starts at once and returns its key; when its turn ends, its reply comes back to you as a message, and you go on from there.',
      'The child sees nothing of this conversation: put everything it needs in the brief (the goal, the facts and files it needs, what to hand back).',
      `Use it for independent pieces that take a while, not for small steps. A child cannot start children; at most ${max} of yours run at once.`,
      'The user sees each child in the conversation and can open it.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        brief: { type: 'string', description: 'Everything the child needs: the goal, context, files, limits, and what its reply should contain.' },
        agent: { type: 'string', description: 'custom (the app’s own agent: name the model), claude, codex, or another agent’s id. Default: the same agent as yours.' },
        model: {
          type: 'string',
          description: models.length ? `For custom, one of: ${models.map((m) => m.id).join(', ')}. For claude or codex, a model name (default: the agent’s own).` : 'For claude or codex, a model name (default: the agent’s own).',
        },
        cwd: { type: 'string', description: 'The folder to work in (default: yours).' },
        worktree: { type: 'boolean', description: 'Work on a branch of its own in a new worktree of the folder’s git repository, so its changes do not mix with others’.' },
        title: { type: 'string', description: 'A short name for it, shown to the user.' },
      },
      required: ['brief'],
    },
    async run(a, ctx) {
      const brief = String(a.brief ?? '').trim();
      if (!brief) throw new Error('The brief is empty. Write a self-contained brief: the child sees nothing of this conversation.');
      if (parentOf(d.db, ctx.key)) throw new Error(ONE_LEVEL);
      const target = pickAgent(d, ctx, a.agent, a.model);
      // A swarm's members take on hard problems: they run with the lead's own model and effort unless it names others.
      const lead = roleOf(d.db, ctx)?.role === 'lead' ? d.sessions.summary(ctx.key) : null;
      const same = !!lead && target.agent === ctx.agent && target.agent !== 'acp' && !String(a.model ?? '').trim();
      if (same && lead?.prefs?.model) {
        target.model = lead.prefs.model;
        target.label = `${target.label} · ${lead.prefs.model}`;
      }
      const effort = same ? lead?.prefs?.effort : undefined;
      const running = childKeys(d.db, ctx.key).filter((k) => busy(d.sessions.summary(k))).length + (starting.get(ctx.key) ?? 0);
      if (running >= max) throw new Error(`${running} of your child sessions are working already, the most at once. Wait for one to finish (its reply comes to you as a message), then start the next; or do this part yourself.`);
      const capUsd = childShare(d.db, ctx.key, max);
      const cwd = folder(a.cwd, ctx.cwd);
      const parent = d.sessions.summary(ctx.key);
      const mode = childMode({ family: modeFamily(ctx.agent, ctx.acpAgent), mode: parent?.live?.mode ?? parent?.prefs?.mode }, modeFamily(target.agent, target.acpAgent));
      const title = firstLine(String(a.title ?? '') || brief, 70);
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
          worktree: !!a.worktree,
          title,
          remember: false,
          account: target.agent === ctx.agent && target.agent !== 'acp' ? d.sessions.accountOf(ctx.key) : undefined,
          extra: { parent: ctx.key, ...(capUsd != null ? { capUsd } : {}) },
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
        startedAt: Date.now(),
      };
      addNote(d.db, { key: ctx.key, kind: 'child', anchor: await currentPrompt(d, ctx.key), data: note });
      return [
        `Started child session ${key}: "${title}" (${target.label}${mode ? `, mode ${mode}` : ''}${s?.worktree ? `, on branch ${s.worktree.branch}` : ''}${capUsd != null ? `, spending cap $${capUsd.toFixed(2)}` : ''}).`,
        'It works on its own now. Its reply comes to you as a message when its turn ends: go on with other work, or end your turn to wait for it.',
        'child_sessions shows how your children are doing; message_child sends one more to do.',
      ].join('\n');
    },
  };
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
    'Your child sessions: what each is doing, its agent and model, when it last did something, what it has spent, and the start of its latest reply. With key, the whole latest reply of that child.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'One child’s key: its whole latest reply.' } } },
  annotations: { readOnlyHint: true },
  async run(a, ctx) {
    const d = ctx.deps;
    const keys = childKeys(d.db, ctx.key);
    const want = String(a.key ?? '').trim();
    if (want) {
      if (!keys.includes(want)) throw new Error('That is not one of your child sessions.');
      const t = lastTurn((await d.sessions.timeline(want)).parser.items);
      return t?.reply ? `Latest reply of ${want}:\n\n${t.reply}` : 'It has not replied yet.';
    }
    if (!keys.length) return 'You have no child sessions yet. start_child_session starts one.';
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
    'Send one of your child sessions a message: more to do, a correction, an answer to its question. If it is working, the message waits for its turn to end. Its reply comes back to you as a message, like its first one.',
  inputSchema: { type: 'object', properties: { key: { type: 'string', description: 'The child’s key.' }, text: { type: 'string' } }, required: ['key', 'text'] },
  async run(a, ctx) {
    const d = ctx.deps;
    const key = String(a.key ?? '').trim();
    const text = String(a.text ?? '').trim();
    if (!text) throw new Error('The text is empty.');
    if (!childKeys(d.db, ctx.key).includes(key)) throw new Error('That is not one of your child sessions: child_sessions lists them.');
    const queued = busy(d.sessions.summary(key));
    await d.sessions.deliverOrQueue(key, `Message from the session that started you:\n\n${text}`);
    return queued ? 'Queued: it goes to the child when its current turn ends. Its reply comes to you as a message.' : 'Sent. Its reply comes to you as a message when its turn ends.';
  },
};

// ---- results flow back ---------------------------------------------------------------------------

/** What the parent is told when a child's turn ends; `summary` stands in for a long reply. */
export function resultMessage(o: { key: string; title: string; label: string; link: string; turn: Turn; error?: string; stopped?: string; summary?: string }): string {
  const who = `child session "${o.title}" (${o.key}, ${o.label})`;
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
  await tell(d, parent, msg);
}

// ---- the capability ------------------------------------------------------------------------------

export const children: Feature = {
  id: 'children',

  tools(ctx) {
    // A child gets none: one level only.
    if (parentOf(ctx.deps.db, ctx.key) || roleOf(ctx.deps.db, ctx)?.role === 'member') return [];
    return [startTool(ctx.deps, maxFor(ctx.deps.db, ctx), confidentialRun(ctx)), LIST, MESSAGE];
  },

  spawn(s) {
    return s.extra?.parent ? { instructions: [CHILD_INSTRUCTIONS] } : undefined;
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
