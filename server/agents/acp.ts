// Agents that speak the Agent Client Protocol (agentclientprotocol.com): Gemini CLI, Antigravity CLI, OpenCode, Grok Build,
// Qwen Code, Goose and others, each started as `<command> <args>` and driven over JSON-RPC on stdio.
//
// The app is the ACP client. It opens a session (session/new, or session/load to continue one when the
// agent can), sends prompts (session/prompt, which returns when the turn ends), answers permission
// requests from the approval cards, and reads and writes files for the agent when asked. Every update
// the agent sends goes into the session's transcript (server/history/acp.ts reads it back), since ACP
// agents keep none the app can read.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { acpAccountAgent } from '../../shared/account-agents.ts';
import { signedOutText } from '../signin.ts';
import { CONTEXT_PARTS, type AcpAgentDef, type ApprovalOption, type LiveState, type ModelOption } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT, config } from '../config.ts';
import { AGENT_FILE, MODELS_DIR } from '../models/config.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { GivenAdditions } from '../features/types.ts';
import { PAGE_SERVER } from '../mcp.ts';
import { acpBriefing, acpText } from '../history/acp.ts';
import type { Runner } from '../runner/client.ts';
import { LiveAdapter, type ApprovalAnswer, type ImageInput, type LiveConfig, type ModelCall } from './live.ts';
import { RpcPeer, RpcError } from './rpc.ts';
import { which, WIN } from '../platform.ts';

type Json = Record<string, any>;

export const ACP_DIR = path.join(config.dataDir, 'acp');

/** Agents known to speak ACP, as they are usually installed; any of them can be changed, others added. */
export const ACP_PRESETS: AcpAgentDef[] = [
  // Gemini CLI serves a Gemini API key or a Gemini Code Assist Standard or Enterprise licence (Google AI Pro and Ultra moved to
  // Antigravity CLI). It takes --acp; --experimental-acp still works in 0.70, deprecated.
  { id: 'gemini', name: 'Gemini CLI', command: 'gemini', args: ['--acp'], hint: 'npm install -g @google/gemini-cli' },
  // Antigravity CLI (Google's `agy`) runs a Google AI Pro or Ultra plan, or Antigravity's free one. You install it with Google's
  // installer (the app does not); it signs in from Settings → Agents → Accounts (server/agents/antigravity.ts), and Google's
  // terms for its plans allow it only in sessions a person starts and drives, which server/sessions.ts keeps to.
  { id: 'antigravity', name: 'Antigravity CLI', command: 'agy', args: ['acp'], hint: 'curl -fsSL https://antigravity.google/cli/install.sh | bash' },
  { id: 'opencode', name: 'OpenCode', command: 'opencode', args: ['acp'], hint: 'npm install -g opencode-ai' },
  // Grok Build (xAI) signs in with a Grok subscription (Settings → Agents → Accounts) or an xAI API key (XAI_API_KEY).
  // --no-leader: each session runs its own agent rather than joining a shared Grok leader, so it keeps its account's GROK_HOME.
  { id: 'grok', name: 'Grok Build', command: 'grok', args: ['agent', '--no-leader', 'stdio'], hint: 'npm install -g @xai-official/grok' },
  { id: 'qwen', name: 'Qwen Code', command: 'qwen', args: ['--experimental-acp'], hint: 'npm install -g @qwen-code/qwen-code' },
  { id: 'goose', name: 'Goose', command: 'goose', args: ['acp'], hint: 'block.github.io/goose' },
  { id: 'kimi', name: 'Kimi CLI', command: 'kimi', args: ['--acp'], hint: 'github.com/MoonshotAI/kimi-cli' },
  { id: 'auggie', name: 'Auggie', command: 'auggie', args: ['--acp'], hint: 'npm install -g @augmentcode/auggie' },
  // Hermes Agent (Nous Research) speaks ACP itself; its installer is a shell script, so the app only shows the command.
  { id: 'hermes', name: 'Hermes Agent', command: 'hermes', args: ['acp'], hint: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash' },
  // Pi has no ACP of its own: pi-acp (installed by the app with pi itself) runs it.
  { id: 'pi', name: 'Pi', command: 'pi-acp', args: [], hint: 'npm install -g @earendil-works/pi-coding-agent pi-acp' },
  // OpenClaw's ACP bridge talks to its Gateway, which has to be set up (openclaw onboard) and running.
  { id: 'openclaw', name: 'OpenClaw', command: 'openclaw', args: ['acp'], hint: 'curl -fsSL https://openclaw.ai/install.sh | bash' },
];

/** Where an agent's own sign-in is, when its ACP command is not it (Pi's adapter is pi-acp; Hermes signs in with its model setup). */
const SIGN_IN: Record<string, string> = { pi: 'pi (then /login)', hermes: 'hermes model' };

/**
 * Sign-ins an agent may be asked to use when it says it needs one, as it offers them: those that need nobody at a
 * browser (Grok Build's saved sign-in, then its xAI API key when XAI_API_KEY is set for it). Others are never chosen.
 */
const HEADLESS_AUTH = ['cached_token', 'xai.api_key'];

// ---- models and their efforts ---------------------------------------------------------------------

/** The session's thought-level option (ACP config options, category `thought_level`): its id, the values it takes, the one set. */
export function thoughtOption(configOptions: unknown): { id: string; options: string[]; current?: string } | null {
  if (!Array.isArray(configOptions)) return null;
  // Antigravity CLI's is `thinking_level`.
  const o = configOptions.find((c: Json) => c?.category === 'thought_level' || c?.id === 'reasoning_effort' || c?.id === 'thinking_level');
  if (!o || !Array.isArray(o.options)) return null;
  // Options may come in groups ({ group, options }).
  const flat: Json[] = o.options.flatMap((x: Json) => (Array.isArray(x?.options) ? x.options : [x]));
  const options = flat.map((x) => String(x?.value ?? x?.id ?? '')).filter(Boolean);
  return options.length ? { id: String(o.id), options, current: o.currentValue != null ? String(o.currentValue) : undefined } : null;
}

/**
 * A session option of the newer ACP kind (config options) that stands for a picker the protocol also has of its own: the
 * model (category or id `model`) or the mode (`mode`), for an agent that offers it this way rather than as `models` or
 * `modes` (Antigravity CLI): its id, its values and the one set.
 */
export function selectOption(configOptions: unknown, kind: 'model' | 'mode'): { id: string; values: { value: string; name: string; description?: string }[]; current?: string } | null {
  if (!Array.isArray(configOptions)) return null;
  const o = configOptions.find((c: Json) => c?.category === kind || c?.id === kind);
  if (!o || !Array.isArray(o.options)) return null;
  const flat: Json[] = o.options.flatMap((x: Json) => (Array.isArray(x?.options) ? x.options : [x]));
  const values = flat
    .map((x) => ({ value: String(x?.value ?? x?.id ?? ''), name: String(x?.name ?? x?.label ?? x?.value ?? x?.id ?? ''), description: x?.description ? String(x.description) : undefined }))
    .filter((v) => v.value);
  return values.length ? { id: String(o.id), values, current: o.currentValue != null ? String(o.currentValue) : undefined } : null;
}

/**
 * The models an ACP agent offers (a session's `models`, or Grok Build's `_meta.modelState`), each with the reasoning efforts
 * it takes: the model's own list (Grok Build sends one per model in `_meta.reasoningEfforts`), else the session's
 * thought-level option, which applies to every model.
 */
export function acpModelOptions(state: Json | null | undefined, thought?: { options: string[]; current?: string } | null): ModelOption[] {
  const list: Json[] = Array.isArray(state?.availableModels) ? state!.availableModels : [];
  return list
    .filter((m) => m?.modelId != null)
    .map((m) => {
      const own: Json[] = Array.isArray(m._meta?.reasoningEfforts) ? m._meta.reasoningEfforts : [];
      const efforts = own.length ? own.map((e) => String(e?.value ?? e?.id ?? '')).filter(Boolean) : (thought?.options ?? []);
      const marked = own.find((e) => e?.default);
      const def = String((own.length ? (marked?.value ?? marked?.id ?? m._meta?.reasoningEffort) : thought?.current) ?? '');
      return {
        value: String(m.modelId),
        label: String(m.name ?? m.modelId),
        description: m.description ?? undefined,
        efforts,
        defaultEffort: def && efforts.includes(def) ? def : undefined,
        isDefault: state?.currentModelId != null && String(state.currentModelId) === String(m.modelId) ? true : undefined,
      };
    });
}

// ---- the list of agents ---------------------------------------------------------------------------

/** Custom, the app's own agent (server/agent; its id stays 'console'): any model from Settings → Models. */
export const CONSOLE_ID = 'console';
const consoleDef = (): AcpAgentDef => ({
  id: CONSOLE_ID,
  name: 'Custom',
  command: process.execPath,
  args: [path.join(APP_ROOT, 'dist/server/agent.js')],
  env: { HYDOR_MODELS: AGENT_FILE, HYDOR_STATE: path.join(MODELS_DIR, 'sessions') },
  hint: 'Built in: models from OpenRouter, Ollama and vLLM, in Settings → Models',
  builtin: true,
});

export function acpAgents(db: DB): AcpAgentDef[] {
  let mine: AcpAgentDef[] = [];
  try {
    mine = JSON.parse(kvGet(db, 'acp_agents') ?? '[]');
  } catch {}
  return [consoleDef(), ...mine.filter((a) => a.id !== CONSOLE_ID)];
}

const ownAgents = (db: DB) => acpAgents(db).filter((a) => !a.builtin);

export function acpAgent(db: DB, id: string | undefined): AcpAgentDef {
  const a = acpAgents(db).find((x) => x.id === id);
  if (!a) throw new HttpError(404, 'That agent is not in Settings → More agents');
  return a;
}

/** Adds or replaces an agent (by id; a new id from the name when none is given). */
export function saveAcpAgent(db: DB, d: Partial<AcpAgentDef>): AcpAgentDef {
  const name = String(d.name ?? '').trim().slice(0, 40);
  const command = String(d.command ?? '').trim();
  if (!name || !command) throw new HttpError(400, 'Give the agent a name and the command that starts it');
  const args = Array.isArray(d.args) ? d.args.map(String).filter((a) => a.length) : [];
  const env = d.env && typeof d.env === 'object' ? Object.fromEntries(Object.entries(d.env).filter(([k]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k)).map(([k, v]) => [k, String(v)])) : undefined;
  const id = d.id && /^[a-z0-9-]{1,40}$/.test(d.id) ? d.id : `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'agent'}-${crypto.randomBytes(2).toString('hex')}`;
  if (id === CONSOLE_ID) throw new HttpError(400, 'Custom is built in');
  const def: AcpAgentDef = { id, name, command, args, env };
  kvSet(db, 'acp_agents', JSON.stringify([...ownAgents(db).filter((a) => a.id !== id), def]));
  return def;
}

export function removeAcpAgent(db: DB, id: string) {
  if (id === CONSOLE_ID) throw new HttpError(400, 'Custom is built in');
  kvSet(db, 'acp_agents', JSON.stringify(ownAgents(db).filter((a) => a.id !== id)));
}

/** The command's full path when it is installed (on PATH or given as a path). */
export function findCommand(cmd: string, env: Record<string, string> = process.env as Record<string, string>): string | null {
  if (!WIN && cmd.includes('/')) return fs.existsSync(cmd) ? cmd : null;
  // On Windows with its ending: gemini is gemini.cmd (the runner starts it through Node.js).
  return which(cmd, env);
}

export const acpTranscriptPath = (id: string) => path.join(ACP_DIR, `${id}.jsonl`);

/** The agent's own id for a session, from its transcript (to continue it). */
export function acpSessionOf(file: string): string | undefined {
  try {
    let found: string | undefined;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"acpSession"')) continue;
      try {
        found = JSON.parse(line).acpSession ?? found;
      } catch {}
    }
    return found;
  } catch {
    return undefined;
  }
}

/** The ACP session that last had the app's instructions, from the transcript. */
function briefedSession(file: string): string | undefined {
  try {
    let found: string | undefined;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) if (line.startsWith('{"t":"briefed"')) found = /"of":"([^"]*)"/.exec(line)?.[1] ?? found;
    return found;
  } catch {
    return undefined;
  }
}

/** The running totals an ACP session last reported, from the transcript. */
function lastUsage(file: string, of: string): { of: string; in: number; out: number; cached: number; usd?: number } | undefined {
  let session = '';
  let found: { of: string; in: number; out: number; cached: number; usd?: number } | undefined;
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (line.includes('"acpSession"') && /^\{"t":"(session|meta)"/.test(line)) session = /"acpSession":"([^"]*)"/.exec(line)?.[1] ?? session;
      if (session !== of || !line.includes('"usage_update"')) continue;
      try {
        const u = JSON.parse(line).u ?? {};
        const n = u._meta?.hydor ?? u._meta?.naget ?? {};
        found = { of, in: n.tokensIn ?? found?.in ?? 0, out: n.tokensOut ?? found?.out ?? 0, cached: n.tokensCached ?? found?.cached ?? 0, usd: typeof u.cost?.amount === 'number' ? u.cost.amount : found?.usd };
      } catch {}
    }
  } catch {}
  return found;
}

// ---- a running session ----------------------------------------------------------------------------

export interface AcpOpts {
  cwd: string;
  /** The app's id for the session (its transcript is <id>.jsonl). */
  id: string;
  def: AcpAgentDef;
  /** Continue this ACP session (session/load), when the agent can. */
  acpSession?: string;
  transcript: string;
  mode?: string;
  model?: string;
  /** The reasoning effort to set, when the agent takes one (Grok Build). */
  effort?: string;
  /** This app's MCP address for the session (show_html), for agents that take HTTP MCP servers. */
  pageServer?: string;
  /** What the app's capabilities add: instructions, MCP servers (server/features). */
  add?: GivenAdditions;
}

/**
 * Whether a Grok Build turn stopped on the plan's usage limit (not a short throttle). Its error kinds `usage_limit_reached` and
 * `usage_pool_exhausted` and its sentences ("You hit your weekly limit.", "You've hit the credit limit for your plan.", "run out of
 * credits", HTTP 402) say so; `rate_limited`, `global_rate_limit` and `concurrency_limit` are throttles that pass by themselves.
 */
const PLAN_KINDS = /usage_limit_reached|usage_pool_exhausted/i;
const PLAN_SENTENCE = /\bhit (?:your|the) (?:(?:weekly|daily|monthly|hourly|session|free|usage|credit|spending|plan)\s+)*(?:limit|cap)\b|\brun out of credits\b|\bstatus (?:code )?:?\s*402\b/i;
/** A turn's whole answer that is only that sentence (a short text, at most a few plain words before it). */
const PLAN_ANSWER = /^[\w' ]{0,20}?(?:\bhit (?:your|the) (?:(?:weekly|daily|monthly|hourly|session|free|usage|credit|spending|plan)\s+)*(?:limit|cap)\b|\brun out of credits\b)/i;

export function planLimitHit(turn: { error?: string; code?: number; data?: unknown; text?: string; tools?: number }): boolean {
  if (turn.error != null) {
    let data = '';
    try {
      data = turn.data == null ? '' : JSON.stringify(turn.data).slice(0, 2000);
    } catch {}
    const said = `${turn.error} ${data}`;
    return turn.code === 402 || PLAN_KINDS.test(said) || PLAN_SENTENCE.test(said);
  }
  // No error: the agent's own words, when they are all it said in the turn.
  const text = (turn.text ?? '').trim();
  return !turn.tools && text.length > 0 && text.length <= 160 && PLAN_ANSWER.test(text);
}

/** "143h57m55s", "2h 39m", "1d2h", "45s": a duration in ms, or null. */
export function durationMs(t: string): number | null {
  let ms = 0;
  let any = false;
  for (const [, n, u] of t.matchAll(/(\d+)\s*([dhms])/gi)) {
    any = true;
    ms += Number(n) * { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 }[u.toLowerCase() as 'd' | 'h' | 'm' | 's'];
  }
  return any ? ms : null;
}

/**
 * Whether an Antigravity CLI turn stopped on the plan's quota, which limit, and when it lifts. Its error (in an API error too:
 * "RESOURCE_EXHAUSTED (code 429): Individual quota reached. Please upgrade your subscription to increase your limits. Resets
 * in 2h39m52s.") or, with none, the agent's whole short answer says so; a weekly quota error, or "Your AI credits balance is
 * too low to continue." Short rate limits agy waits out by itself (up to four minutes) and never shows; a refusal that only
 * says RESOURCE_EXHAUSTED or 429 may be one of those, or Google turning the client away, and is not taken for the plan's.
 */
const AGY_LIMIT = /individual quota reached|quota (?:reached|exhausted)|\b(?:weekly|five[- ]hour|5[- ]hour) (?:quota|limit)\b[^.]{0,40}\b(?:reached|hit|exceeded|exhausted)|ai credits balance is too low/i;
export function antigravityLimit(turn: { error?: string; data?: unknown; text?: string; tools?: number }, now = Date.now()): { label: string; resetsAt: number | null } | null {
  let said = '';
  if (turn.error != null) {
    let data = '';
    try {
      data = turn.data == null ? '' : JSON.stringify(turn.data).slice(0, 2000);
    } catch {}
    said = `${turn.error} ${data}`;
  } else {
    const text = (turn.text ?? '').trim();
    if (!turn.tools && text.length <= 400) said = text;
  }
  if (!said || !AGY_LIMIT.test(said)) return null;
  const left = /\bresets? in\s+((?:\d+\s*[dhms]\s*)+)/i.exec(said);
  const ms = left ? durationMs(left[1]) : null;
  const label = /credits balance/i.test(said) ? 'AI credits' : /\bweek/i.test(said) ? 'Weekly limit' : /five[- ]hour|5[- ]hour/i.test(said) ? 'Five-hour limit' : 'Usage limit';
  return { label, resetsAt: ms != null ? now + ms : null };
}

/** Why a turn ended when a restart of the app cut its agent's model call (its lead does not run it again a tier up for that). */
export const CUT_BY_RESTART = 'The app restarted while this turn was waiting for its model, so the turn stopped there: send a message to carry on';

export class AcpLive extends LiveAdapter {
  readonly agent = 'acp' as const;
  rpc: RpcPeer;
  private acpSession?: string;
  private caps: Json = {};
  private loading = false;
  private prompting = false;
  private promptDone?: Promise<void>;
  private permissions = new Map<string, { rpcId: string | number; options: Json[] }>();
  /** The ACP session has had the app's instructions (they go with its first message), by its id. */
  private briefed?: string;
  /** The running totals the agent last reported (for its ACP session), to tell what each model call used. */
  private usage?: { of: string; in: number; out: number; cached: number; usd?: number };
  private calls = 0;
  /** What the turn running now has said and done, to tell a plan limit that stopped it (Grok Build). */
  private turn = { text: '', tools: 0 };
  /** Lines the agent printed in this run so far; each transcript entry notes how many were handled. */
  private ln = 0;
  /** After a restart: how far the replayed output was handled, the agent's requests answered, and the open turn's prompt call. */
  private caught: { handled: number; answered: Set<string>; prompt?: string } | null = null;
  /** What the agent offers, for the pickers. */
  modes: { id: string; name: string; description?: string }[] = [];
  models: ModelOption[] = [];
  /** The agent's thought-level option (Grok Build's `reasoning_effort`), when it has one: the values it takes and the one set. */
  private thought: { id: string; options: string[]; current?: string } | null = null;
  /** The config options that stand for the model and the mode, for an agent that offers them that way (Antigravity CLI). */
  private modelOption?: string;
  private modeOption?: string;

  constructor(
    runner: Runner,
    private o: AcpOpts,
  ) {
    super(runner);
    this.sessionId = o.id;
    this.transcriptPath = o.transcript;
    this.acpSession = o.acpSession;
    this.state.model = o.model;
    this.state.mode = o.mode;
    this.rpc = new RpcPeer((m) => runner.writeLine(m), `ac-${crypto.randomBytes(3).toString('hex')}`);
    runner.on('line', (line: string, replay: boolean) => this.onLine(line, replay));
  }

  private record(e: Json) {
    fs.appendFileSync(this.o.transcript, JSON.stringify({ ...e, ts: Date.now(), ln: this.ln }) + '\n');
    this.touch();
    this.emit('activity');
  }

  /** A line of the app's own in the session (shown to the person, never sent to the agent). */
  note(text: string) {
    this.record({ t: 'note', text });
  }

  /** Starts the protocol and opens the session: a new one, or the old one again when the agent can load it. */
  async boot(resume: boolean): Promise<void> {
    this.record({ t: 'run', run: this.runner.meta.runId });
    const init = await this.rpc.call(
      'initialize',
      { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: false }, clientInfo: { name: 'hydor', title: 'Hydor', version: config.version } },
      60_000,
    );
    this.caps = init?.agentCapabilities ?? {};
    const offered = new Set<string>(Array.isArray(init?.authMethods) ? init.authMethods.map((m: Json) => String(m?.id ?? '')) : []);
    // The app's own server and the capabilities' servers: by address for agents that take HTTP, else commands.
    const http = !!this.caps.mcpCapabilities?.http;
    const pairs = (o?: Record<string, string>) => Object.entries(o ?? {}).map(([name, value]) => ({ name, value }));
    // An agent that takes servers only as commands (stdio is the one every ACP agent must take) gets the HTTP ones through a bridge.
    // The address goes in the bridge's environment, never on its command line, which anyone on the computer can list:
    // the app's own carries the run's token.
    const bridged = (name: string, url: string, headers?: Record<string, string>) => ({
      name,
      command: process.execPath,
      args: [path.join(APP_ROOT, 'dist/server/mcpbridge.js')],
      env: pairs({ HYDOR_MCP_URL: url, ...(headers && Object.keys(headers).length ? { HYDOR_MCP_HEADERS: JSON.stringify(headers) } : {}) }),
    });
    const mcpServers: unknown[] = Object.entries(this.o.add?.mcpServers ?? {}).flatMap(([name, d]): unknown[] =>
      d.type === 'http' ? (http ? [{ type: 'http', name, url: d.url, headers: pairs(d.headers) }] : [bridged(name, d.url, d.headers)]) : [{ name, command: d.command, args: d.args ?? [], env: pairs(d.env) }],
    );
    if (this.o.pageServer) mcpServers.push(http ? { type: 'http', name: PAGE_SERVER, url: this.o.pageServer, headers: [] } : bridged(PAGE_SERVER, this.o.pageServer));
    const unsigned = (e: unknown) => /auth/i.test((e as Error).message) || (e as { code?: number }).code === -32000;
    const auth = (e: unknown) => {
      if (!unsigned(e)) throw e;
      // Grok Build and Antigravity CLI sign in here, in Settings → Agents → Accounts; other agents in their own CLI (in a
      // terminal), once.
      const acct = acpAccountAgent(this.o.def);
      if (acct) throw new HttpError(401, `${this.o.def.name} is not signed in: sign in with your ${acct === 'grok' ? 'Grok' : 'Google'} account in Settings → Agents → Accounts, then try again.`);
      throw new HttpError(401, `${this.o.def.name} is not signed in. Run ${SIGN_IN[this.o.def.id] ?? this.o.def.command} once in a terminal and sign in there, then try again.`);
    };
    // An agent that wants a sign-in named first (Grok Build) is asked to use one it offers that needs nobody at a browser, once.
    let asked = false;
    const signedIn = async (go: () => Promise<Json>): Promise<Json> => {
      try {
        return await go();
      } catch (e) {
        const methodId = !asked && unsigned(e) ? HEADLESS_AUTH.find((m) => offered.has(m)) : undefined;
        if (!methodId) throw e;
        asked = true;
        await this.rpc.call('authenticate', { methodId, _meta: { headless: true } }, 60_000);
        return go();
      }
    };
    // An agent that refuses MCP servers in the session's request (OpenClaw's bridge does) is asked again without them.
    let noted = false;
    const open = (method: string, params: Json) =>
      this.rpc.call(method, { ...params, mcpServers }, 120_000).catch((e: Error) => {
        if (!mcpServers.length || !/mcp/i.test(e.message)) throw e;
        if (!noted) this.record({ t: 'note', text: `${this.o.def.name} does not take MCP servers from the app: its own tools only.` });
        noted = true;
        return this.rpc.call(method, { ...params, mcpServers: [] }, 120_000);
      });
    let loaded = false;
    if (resume && this.acpSession && this.caps.loadSession) {
      // The agent replays the conversation as updates: the transcript has it already.
      this.loading = true;
      try {
        const r = await signedIn(() => open('session/load', { sessionId: this.acpSession, cwd: this.o.cwd })).catch(auth);
        this.offers(r);
        loaded = true;
      } catch (e) {
        // Not signed in is said as it is; an agent that no longer has the session (its folder gone) starts a new one.
        if (e instanceof HttpError) throw e;
        this.record({ t: 'note', text: `${this.o.def.name} could not reopen this session (${(e as Error).message.slice(0, 200)}): it starts afresh here, without the conversation above.` });
      } finally {
        this.loading = false;
      }
    }
    if (!loaded) {
      if (resume && this.acpSession && !this.caps.loadSession) this.record({ t: 'note', text: `${this.o.def.name} cannot reopen earlier sessions: it starts afresh here, without the conversation above.` });
      const r = await signedIn(() => open('session/new', { cwd: this.o.cwd })).catch(auth);
      this.acpSession = String(r?.sessionId ?? '');
      if (!this.acpSession) throw new Error('The agent did not open a session');
      this.record({ t: 'session', acpSession: this.acpSession });
      this.offers(r);
    }
    if (this.o.mode && this.modes.some((m) => m.id === this.o.mode)) await this.setMode(this.o.mode).catch(() => {});
    if (this.o.model && this.models.some((m) => m.value === this.o.model)) await this.setModel(this.o.model).catch(() => {});
    // The effort too, when the agent takes it for the model now set (it is skipped when the model does not take it).
    if (this.o.effort && this.takesEffort(this.o.effort)) await this.setEffort(this.o.effort).catch(() => {});
    this.state.status = 'idle';
    this.changed();
  }

  /** Reconnected after the server restarted: the session is open; a turn still going shows as working until it ends. */
  restored() {
    this.catchUp();
    // Requests asked again during the replay keep it waiting for you.
    this.state.status = this.approvals.size ? 'waiting' : this.prompting ? 'working' : 'idle';
    this.changed();
  }

  /**
   * After a restart the runner replays all the agent printed in this run. The transcript says how far
   * that was handled (and which of the agent's requests were answered) and whether a turn is open.
   */
  private catchUp() {
    if (this.caught) return this.caught;
    const run = `{"t":"run","run":${JSON.stringify(this.runner.meta.runId)}`;
    let prompted = 0;
    let ended = 0;
    let promptCall: string | undefined;
    let inRun = false;
    let handled = 0;
    let answered = new Set<string>();
    let all = new Set<string>();
    try {
      fs.readFileSync(this.o.transcript, 'utf8')
        .split('\n')
        .forEach((l, i) => {
          if (l.startsWith('{"t":"prompt"')) {
            prompted = i + 1;
            // A message sent during a turn has no call of its own: the turn's prompt is the last that has one.
            promptCall = /"rpc":"([^"]*)"/.exec(l)?.[1] ?? promptCall;
          }
          else if (l.startsWith('{"t":"end"')) ended = i + 1;
          else if (l.startsWith('{"t":"run"')) {
            inRun = l.startsWith(run);
            if (inRun) answered = new Set();
          } else if (l.startsWith('{"t":"rpc"')) {
            const id = /"id":"([^"]*)"/.exec(l)?.[1];
            if (id != null) (inRun ? answered : all).add(id);
          }
          if (inRun) handled = Math.max(handled, Number(/"ln":(\d+)\}$/.exec(l)?.[1] ?? 0));
        });
    } catch {}
    this.prompting = prompted > ended;
    // A transcript from before runs were noted: take all of it as handled.
    const prompt = this.prompting ? promptCall : undefined;
    this.caught = handled || answered.size ? { handled, answered, prompt } : { handled: Infinity, answered: all, prompt };
    return this.caught;
  }

  /** Modes and models the agent offers for the session (as `modes` and `models`, or as config options), and its plan. */
  private offers(r: Json | null | undefined) {
    if (Array.isArray(r?.modes?.availableModes)) {
      this.modes = r!.modes.availableModes.map((m: Json) => ({ id: String(m.id), name: String(m.name ?? m.id), description: m.description ?? undefined }));
      if (r!.modes.currentModeId) this.state.mode = String(r!.modes.currentModeId);
    }
    this.thought = thoughtOption(r?.configOptions);
    if (Array.isArray(r?.models?.availableModels)) {
      this.models = acpModelOptions(r!.models, this.thought);
      if (r!.models.currentModelId) this.state.model = String(r!.models.currentModelId);
    }
    this.pickersFrom(r?.configOptions, !Array.isArray(r?.models?.availableModels), !Array.isArray(r?.modes?.availableModes));
    if (this.thought?.current) this.state.effort = this.thought.current;
    // Antigravity CLI names the account's plan (its tier) when a session opens.
    const tier = r?._meta?.antigravity?.tier;
    if (tier != null && tier !== '') this.emit('tier', tier);
  }

  /** The model and mode pickers from config options, for an agent that offers them only that way (Antigravity CLI). */
  private pickersFrom(configOptions: unknown, models: boolean, modes: boolean) {
    const m = models || this.modelOption ? selectOption(configOptions, 'model') : null;
    if (m) {
      this.modelOption = m.id;
      this.models = m.values.map((v) => ({ value: v.value, label: v.name, description: v.description, efforts: this.thought?.options ?? [], isDefault: v.value === m.current ? true : undefined }));
      if (m.current) this.state.model = m.current;
    }
    const o = modes || this.modeOption ? selectOption(configOptions, 'mode') : null;
    if (o) {
      this.modeOption = o.id;
      this.modes = o.values.map((v) => ({ id: v.value, name: v.name, description: v.description }));
      if (o.current) this.state.mode = o.current;
    }
  }

  /** The agent's own change to its options (after a model switch, say): the thought level, and the efforts the current model takes. */
  private optionsChanged(configOptions: unknown) {
    if (this.modelOption || this.modeOption) {
      this.pickersFrom(configOptions, false, false);
      this.changed();
    }
    const thought = thoughtOption(configOptions);
    if (!thought) return;
    const was = this.thought?.options ?? [];
    this.thought = thought;
    if (thought.current) this.state.effort = thought.current;
    // A model that takes the session's thought levels (it has no list of its own) takes the new ones; Grok Build's own lists stay.
    this.models = this.models.map((m) => (m.value === this.state.model && (!m.efforts.length || m.efforts.join() === was.join()) ? { ...m, efforts: thought.options } : m));
    this.changed();
  }

  /** Whether the current model takes this effort. */
  private takesEffort(effort: string) {
    if (!this.thought) return false;
    const m = this.models.find((x) => x.value === this.state.model);
    return m ? m.efforts.includes(effort) : this.thought.options.includes(effort);
  }

  private async setEffort(effort: string) {
    if (!this.thought) throw new Error('This agent has no effort to set');
    await this.rpc.call('session/set_config_option', { sessionId: this.acpSession, configId: this.thought.id, value: effort }, 15_000);
    this.state.effort = effort;
  }

  private onLine(line: string, replay: boolean) {
    this.ln++;
    let m: Json;
    try {
      m = JSON.parse(line);
    } catch {
      return;
    }
    // Replayed lines the app handled before the restart are skipped, except the agent's requests it had
    // not answered yet: those are asked again. Lines printed while the server was down are new.
    if (replay) {
      const c = this.catchUp();
      if (this.ln <= c.handled) {
        if (m.id != null && m.method && !c.answered.has(String(m.id))) this.onRequest(m);
        return;
      }
    }
    this.touch();
    if (this.rpc.settle(m)) return;
    if (m.id != null && m.method) return void this.onRequest(m);
    if (m.method === 'session/update') {
      const u = m.params?.update;
      if (!u || this.loading) return;
      if (u.sessionUpdate === 'usage_update') this.callFrom(u);
      if (this.prompting) {
        if (u.sessionUpdate === 'agent_message_chunk' && typeof u.content?.text === 'string') this.turn.text = (this.turn.text + u.content.text).slice(-2000);
        else if (u.sessionUpdate === 'tool_call' || u.sessionUpdate === 'tool_call_update') this.turn.tools++;
      }
      this.record({ t: 'update', u });
      if (u.sessionUpdate === 'current_mode_update' && u.currentModeId) {
        this.state.mode = String(u.currentModeId);
        this.changed();
      }
      if (u.sessionUpdate === 'config_option_update') this.optionsChanged(u.configOptions);
      return;
    }
    // The answer to a prompt sent before the server restarted (its call is gone): the turn ended, as the agent says, or
    // with what went wrong. Its model call cut by the restart (Custom's on a plan's model asks through the app) says so.
    if (m.id != null && this.prompting && this.answersOpenPrompt(String(m.id), m)) {
      if (!m.error) return void this.turnEnded({ stopReason: m.result.stopReason ?? 'end_turn' });
      const said = String(m.error.message ?? 'The turn failed');
      this.turnEnded({ error: /^(terminated|fetch failed)$|ECONNRESET|ECONNREFUSED|socket hang up|other side closed/i.test(said) ? CUT_BY_RESTART : said }, { code: m.error.code, data: m.error.data });
    }
  }

  /** Whether an answer no call of this server waits for is the one to the open turn's prompt, sent before a restart. */
  private answersOpenPrompt(id: string, m: Json): boolean {
    const ended = !!m.result && typeof m.result === 'object' && 'stopReason' in m.result;
    const want = this.caught?.prompt;
    if (want) return id === want && (ended || !!m.error);
    // A transcript from before prompts noted their call: a turn's end from any call, or an error to an earlier server's call.
    return ended || (!!m.error && !this.rpc.owns(id));
  }

  /**
   * A model call's use, from how the agent's running totals grew (Custom sends them after each call, with
   * the cost when it knows the price; another agent may send the cost alone). The totals before the first
   * report in this run come from the transcript, so a reopened session's history is not counted again.
   */
  private callFrom(u: Json) {
    const of = this.acpSession ?? '';
    const n = u._meta?.hydor ?? u._meta?.naget ?? {};
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
    // How full the model's context is (ACP's used and size), and where it goes by part when Custom says so.
    if (num(u.used) && num(u.size)) {
      this.state.contextTokens = u.used;
      this.state.contextWindow = u.size;
      const parts = n.context && typeof n.context === 'object' ? Object.entries(n.context as Record<string, unknown>).filter(([k, v]) => (CONTEXT_PARTS as readonly string[]).includes(k) && num(v)) : [];
      this.state.contextParts = parts.length ? (Object.fromEntries(parts) as LiveState['contextParts']) : undefined;
      this.changed();
    }
    const usd = num(u.cost?.amount) !== undefined && (u.cost.currency ?? 'USD') === 'USD' ? u.cost.amount : undefined;
    const was = this.usage?.of === of ? this.usage : lastUsage(this.o.transcript, of);
    const now = { of, in: num(n.tokensIn) ?? was?.in ?? 0, out: num(n.tokensOut) ?? was?.out ?? 0, cached: num(n.tokensCached) ?? was?.cached ?? 0, usd: usd ?? was?.usd };
    this.usage = now;
    const tokens = { in: Math.max(0, now.in - (was?.in ?? 0)), cached: Math.max(0, now.cached - (was?.cached ?? 0)), out: Math.max(0, now.out - (was?.out ?? 0)) };
    const dUsd = usd !== undefined ? Math.max(0, usd - (was?.usd ?? 0)) : undefined;
    if (!tokens.in && !tokens.out && !tokens.cached && !dUsd) return;
    const call: ModelCall = { id: `acp-${this.runner.meta.runId}-${++this.calls}`, model: typeof n.model === 'string' ? n.model : this.state.model, tokens, usd: dUsd };
    this.emit('call', call);
  }

  /** Answers a request from the agent, and notes that it was answered (for a restart). */
  private reply(id: string | number, result: unknown, error?: string, code = -32002) {
    if (error) this.rpc.respondError(id, code, error);
    else this.rpc.respond(id, result);
    this.record({ t: 'rpc', id: String(id) });
  }

  private onRequest(m: Json) {
    const p: Json = m.params ?? {};
    switch (m.method) {
      case 'session/request_permission': {
        const tc: Json = p.toolCall ?? {};
        const id = String(m.id);
        const options: Json[] = Array.isArray(p.options) ? p.options : [];
        this.permissions.set(id, { rpcId: m.id, options });
        // A question from one of Pi's extensions (a select or confirm dialog) says it all in its title; its raw input is only the dialog's plumbing.
        const dialog = ['select', 'confirm', 'input', 'editor'].includes(String(tc.rawInput?.method));
        const detail = tc.rawInput?.command
          ? Array.isArray(tc.rawInput.command)
            ? tc.rawInput.command.join(' ')
            : String(tc.rawInput.command)
          : acpText(tc.content) || (dialog ? String(tc.rawInput.message ?? '') : tc.rawInput ? JSON.stringify(tc.rawInput, null, 2) : '');
        this.approvals.set(id, {
          id,
          itemId: tc.toolCallId,
          ...(typeof tc.rawInput?.description === 'string' && tc.rawInput.description.trim() ? { say: tc.rawInput.description.trim().slice(0, 300) } : {}),
          kind: tc.kind === 'execute' ? 'command' : tc.kind === 'edit' || tc.kind === 'delete' || tc.kind === 'move' ? 'file' : 'other',
          title: String(tc.title ?? 'The agent asks to go ahead'),
          detail: detail.slice(0, 4000),
          options: options.map(
            (o): ApprovalOption => ({ id: String(o.optionId), label: String(o.name ?? o.optionId), style: String(o.kind).startsWith('reject') || /^(no|deny|decline|cancel|reject)\b/i.test(String(o.name ?? '')) ? 'danger' : o.kind === 'allow_once' ? 'primary' : 'default' }),
          ),
          createdAt: Date.now(),
        });
        this.state.status = 'waiting';
        this.changed();
        return;
      }
      case 'fs/read_text_file': {
        try {
          let text = fs.readFileSync(String(p.path), 'utf8');
          if (p.line || p.limit) {
            const lines = text.split('\n');
            const from = Math.max(0, (Number(p.line) || 1) - 1);
            text = lines.slice(from, p.limit ? from + Number(p.limit) : undefined).join('\n');
          }
          this.reply(m.id, { content: text });
        } catch (e) {
          this.reply(m.id, null, (e as Error).message);
        }
        return;
      }
      case 'fs/write_text_file': {
        try {
          fs.mkdirSync(path.dirname(String(p.path)), { recursive: true });
          fs.writeFileSync(String(p.path), String(p.content ?? ''));
          this.reply(m.id, null);
        } catch (e) {
          this.reply(m.id, null, (e as Error).message);
        }
        return;
      }
      default:
        this.reply(m.id, null, `${m.method} is not supported by this client`, -32601);
    }
  }

  /**
   * The app's instructions, once per ACP session, for an agent other than Custom (which reads them before
   * each turn): before the first message of a new session, or of one opened before they were sent.
   */
  private briefing(): Json[] {
    const instructions = this.o.def.id === CONSOLE_ID ? [] : (this.o.add?.instructions ?? []).filter((t) => t.trim());
    if (!instructions.length || !this.acpSession) return [];
    this.briefed ??= briefedSession(this.o.transcript) ?? '';
    if (this.briefed === this.acpSession) return [];
    this.briefed = this.acpSession;
    this.record({ t: 'briefed', of: this.acpSession });
    return [{ type: 'text', text: acpBriefing(instructions) }];
  }

  async sendMessage(text: string, images: ImageInput[]): Promise<void> {
    if (!this.acpSession) throw new HttpError(409, 'The agent is still starting');
    if (this.prompting && this.o.def.id !== CONSOLE_ID) throw new HttpError(409, 'The agent takes one message at a time: send it when this turn ends');
    const id = `u${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
    const prompt: Json[] = this.briefing();
    if (text) prompt.push({ type: 'text', text });
    if (this.caps.promptCapabilities?.image) for (const img of images) prompt.push({ type: 'image', mimeType: img.mediaType, data: img.data });
    if (this.prompting) {
      // Custom consumes these between model steps, after all tool results are in place. Other ACP
      // agents have no such extension. The turn may have finished while this request was in flight.
      const r = await this.rpc.call('_hydor/message', { sessionId: this.acpSession, prompt, promptId: id });
      if (!r.accepted) {
        await this.promptDone;
        return this.sendMessage(text, images);
      }
      this.record({ t: 'prompt', id, text, images: images.length || undefined });
      return;
    }
    // With the id of the call that carries it, so its answer is known for the turn's end after a restart.
    this.record({ t: 'prompt', id, text, images: images.length || undefined, rpc: this.rpc.nextId() });
    this.prompting = true;
    this.limitStopped = false;
    this.turn = { text: '', tools: 0 };
    this.state.status = 'working';
    this.state.turnStartedAt = Date.now();
    this.state.error = undefined;
    this.changed();
    // The call returns when the turn ends, however long that takes.
    this.promptDone = this.rpc
      // Custom keeps the prompt's id with the turn: forks and "Edit from here" cut its conversation by it.
      .call('session/prompt', { sessionId: this.acpSession, prompt, ...(this.o.def.id === CONSOLE_ID ? { _meta: { promptId: id } } : {}) }, 7 * 24 * 3600_000)
      .then((r) => this.turnEnded({ stopReason: r?.stopReason ?? 'end_turn' }))
      .catch((e) => this.turnEnded({ error: (e as Error).message }, e instanceof RpcError ? { code: e.code, data: e.data } : undefined));
  }

  private turnEnded(r: { stopReason?: string; error?: string }, why?: { code?: number; data?: unknown }) {
    if (!this.prompting) return;
    this.prompting = false;
    // Requests the agent left open end with the turn.
    for (const p of this.permissions.values()) this.reply(p.rpcId, { outcome: { outcome: 'cancelled' } });
    this.record({ t: 'end', ...r });
    this.approvals.clear();
    this.permissions.clear();
    // An agent that stopped keeps its exited state (and why).
    if (!this.exited) {
      this.state.status = 'idle';
      if (r.error) this.state.error = r.error;
    }
    this.changed();
    // A Grok Build or Antigravity CLI turn the plan's usage limit stopped: said before its result, as the other agents do
    // (Antigravity's says when it lifts).
    const acct = acpAccountAgent(this.o.def);
    const turn = { error: r.error, ...why, text: this.turn.text, tools: this.turn.tools };
    const hit = acct === 'grok' ? (planLimitHit(turn) ? {} : null) : acct === 'antigravity' ? antigravityLimit(turn) : null;
    if (hit) {
      this.limitStopped = true;
      this.emit('limithit', hit);
    } else if (acct === 'antigravity' && r.error && signedOutText('antigravity', `${r.error} ${why?.code === -32000 ? 'authentication required' : ''}`)) {
      // Its sign-in ended mid-session ("Authentication expired. Please log back in."): the account shows signed out.
      this.signedOut = true;
      this.emit('signedout');
    }
    this.emit('result');
  }

  /**
   * Cancels the turn. Custom (Hydor's own agent, server/agent) kills the turn's foreground command when it is cancelled
   * (killTree on abort) and keeps the ones it started in the background; other ACP agents do as their program does.
   */
  async interrupt(): Promise<void> {
    if (!this.acpSession) return;
    this.rpc.notify('session/cancel', { sessionId: this.acpSession });
    // Open permission requests end as cancelled, as the protocol asks.
    for (const [id, p] of this.permissions) {
      this.reply(p.rpcId, { outcome: { outcome: 'cancelled' } });
      this.approvals.delete(id);
    }
    this.permissions.clear();
    this.changed();
  }

  async answer(approvalId: string, a: ApprovalAnswer): Promise<void> {
    const p = this.permissions.get(approvalId);
    if (!p) throw new HttpError(404, 'This request was already answered');
    const pick = p.options.find((o) => String(o.optionId) === a.decision);
    this.reply(p.rpcId, pick ? { outcome: { outcome: 'selected', optionId: pick.optionId } } : { outcome: { outcome: 'cancelled' } });
    this.permissions.delete(approvalId);
    this.approvals.delete(approvalId);
    if (this.state.status === 'waiting' && !this.approvals.size) this.state.status = 'working';
    this.changed();
  }

  private async setMode(modeId: string) {
    if (this.modeOption) await this.setOption(this.modeOption, modeId);
    else await this.rpc.call('session/set_mode', { sessionId: this.acpSession, modeId }, 15_000);
    this.state.mode = modeId;
  }

  private async setModel(modelId: string) {
    if (this.modelOption) await this.setOption(this.modelOption, modelId);
    else await this.rpc.call('session/set_model', { sessionId: this.acpSession, modelId }, 15_000);
    this.state.model = modelId;
    this.record({ t: 'model', model: modelId });
  }

  /** Sets a config option; the agent answers with them all, which may change the others (a model's own thought levels). */
  private async setOption(configId: string, value: string) {
    const r = await this.rpc.call('session/set_config_option', { sessionId: this.acpSession, configId, value }, 15_000);
    if (Array.isArray(r?.configOptions)) this.optionsChanged(r.configOptions);
  }

  async configure(cfg: LiveConfig): Promise<void> {
    if (cfg.mode) await this.setMode(cfg.mode).catch((e) => Promise.reject(new HttpError(400, (e as Error).message)));
    if (cfg.model) await this.setModel(cfg.model).catch((e) => Promise.reject(new HttpError(400, (e as Error).message)));
    // A new model that does not take the effort set keeps the agent's own choice (its update says which).
    if (cfg.effort) await this.setEffort(cfg.effort).catch((e) => Promise.reject(new HttpError(400, (e as Error).message)));
    // Default (null) goes back to the model's own effort, for an agent whose thought level offers "default" (Custom).
    else if (cfg.effort === null && this.thought?.options.includes('default')) await this.setEffort('default').catch((e) => Promise.reject(new HttpError(400, (e as Error).message)));
    this.changed();
  }

  async stopTask(): Promise<void> {}

  async rename(title: string): Promise<void> {
    this.record({ t: 'title', title });
  }

  protected onExited() {
    this.rpc.failAll('The agent stopped');
    // A turn whose call was lost to a restart ends here too.
    this.turnEnded({ error: 'The agent stopped' });
  }
}
