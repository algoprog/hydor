// Custom's models from your Claude and ChatGPT plans, through the sign-ins of Claude Code and Codex on this computer: a
// Custom session (or the helper model, or a tier) that picks one uses the plan's usage, with no API key and nothing to
// install. Each program's accounts are tried in turn, as one-off questions do (server/oneshot.ts): one at its usage
// limit or signed out hands the step to the next.
//
// Codex: OpenAI lets other apps use a ChatGPT plan, so its models are asked directly, step by step like any of Custom's
// models (its tools as tools), on the plan's Responses API with the token Codex's own app-server hands out and keeps
// fresh. Claude: Anthropic lets only its own programs use a plan's sign-in, so each step is asked through Claude Code
// itself (`claude -p`, with none of its own tools, settings or servers, and nothing saved). Claude Code takes a turn as
// one message: the conversation goes to it as one, the earlier steps in order, and Custom's tools are described in the
// instructions with their calls written as text (these models' tools are 'text', as for models that take none). Claude Code
// has no stop sequence to end a reply at its calls, so the app ends it there itself (CallGate) and stops the program.
//
// The server holds the sign-ins: Custom's agent process asks through its run's address (POST /agent/run/:token/model,
// index.ts), which runs planChat here; the helper model and the app's other model calls run it in this process.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import type { AgentModel, ModelOption, SubscriptionModels, SubscriptionProvider } from '../../shared/types.ts';
import { ContextOverflow, StreamCut, type ChatMessage, type ChatOptions, type Part, type Reply } from '../agent/llm.ts';
import { CallGate } from '../agent/parse.ts';
import { config } from '../config.ts';
import { agentBaseEnv } from '../env.ts';
import { spawnProgram } from '../platform.ts';
import { isSignedOut, markSignedIn, markSignedOut, signedOutText } from '../signin.ts';

type Env = Record<string, string>;
/** An account of a program: its id when it is an added one, and the environment that points the program at it. */
export interface PlanAccount {
  account?: string;
  env: Env;
}

export interface PlanDeps {
  /** A program's accounts in the order to try them: those with usage left first (switching at a limit may be off). */
  accounts: (provider: SubscriptionProvider) => PlanAccount[];
  /** Codex's sign-in for an account, from its app-server: a ChatGPT token (refreshed first when asked), or how it signs in instead. */
  codexToken: (account: string | undefined, refresh: boolean) => Promise<{ token: string | null; method: string | null }>;
  /** The models each program lists (the default account's). */
  claudeModels: () => Promise<ModelOption[]>;
  codexModels: () => Promise<ModelOption[]>;
}

let deps: PlanDeps | null = null;
/** How the gateway reaches the programs' accounts and models (index.ts). */
export const initPlans = (d: PlanDeps) => (deps = d);

export const PROGRAM: Record<SubscriptionProvider, string> = { claude: 'Claude Code', codex: 'Codex' };

// ---- the models ---------------------------------------------------------------------------------------

/** Claude Code's names that always mean the newest of each kind (the dated ones stay out of Custom's list). */
const CLAUDE_KINDS = ['opus', 'fable', 'sonnet', 'haiku'];
const CLAUDE_CONTEXT = 200_000;
const CODEX_CONTEXT = 256_000;

/** The models each signed-in program lends Custom, and how each program stands (Settings → Models). */
export async function planModels(): Promise<{ models: AgentModel[]; state: SubscriptionModels[] }> {
  if (!deps) return { models: [], state: [] };
  const d = deps;
  const signedIn = (p: SubscriptionProvider) => d.accounts(p).some((a) => !isSignedOut(p, a.account));
  const [claude, codex] = await Promise.all([d.claudeModels().catch(() => [] as ModelOption[]), d.codexModels().catch(() => [] as ModelOption[])]);
  const fromClaude: AgentModel[] = CLAUDE_KINDS.flatMap((kind) => {
    const o = claude.find((x) => x.value === kind);
    if (!o) return [];
    return [{ id: `claude/${kind}`, label: `Claude ${o.label}`, provider: 'claude' as const, baseUrl: '', model: kind, contextLength: CLAUDE_CONTEXT, tools: 'text' as const, vision: true, reasoning: true, efforts: o.efforts }];
  });
  const fromCodex: AgentModel[] = codex.map((o) => ({
    id: `codex/${o.value}`,
    label: o.label,
    provider: 'codex' as const,
    baseUrl: '',
    model: o.value,
    contextLength: CODEX_CONTEXT,
    tools: 'native' as const,
    vision: true,
    reasoning: true,
    efforts: o.efforts,
  }));
  const state: SubscriptionModels[] = [
    { provider: 'claude', program: PROGRAM.claude, installed: claude.length > 0, signedIn: claude.length > 0 && signedIn('claude'), models: fromClaude.map((m) => ({ id: m.id, label: m.label })) },
    { provider: 'codex', program: PROGRAM.codex, installed: codex.length > 0, signedIn: codex.length > 0 && signedIn('codex'), models: fromCodex.map((m) => ({ id: m.id, label: m.label })) },
  ];
  // Only the models of a program that can answer now: one found signed out shows again when it is signed in.
  const models = [...(state[0].signedIn ? fromClaude : []), ...(state[1].signedIn ? fromCodex : [])];
  return { models, state };
}

// ---- asking -------------------------------------------------------------------------------------------

/** The account is at its plan's usage limit (the next one may answer). */
class PlanLimit extends Error {}
/** The program turned the account away for its sign-in. */
class PlanSignedOut extends Error {}

const textOf = (c: ChatMessage['content']): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p.type === 'text' ? p.text : '')).join('') : '');
const partsOf = (c: ChatMessage['content']): Part[] => (typeof c === 'string' ? (c ? [{ type: 'text', text: c }] : []) : (c ?? []));

/** The effort to ask for: HYDOR_EFFORT when the model takes it, else the program's own default. */
function effortFor(m: AgentModel): string | undefined {
  const e = (process.env.HYDOR_EFFORT ?? '').toLowerCase();
  return e && m.efforts?.includes(e) ? e : undefined;
}

/** A step of a plan's model: each account of its program in turn, while one at its limit or signed out hands it on. */
export async function planChat(m: AgentModel, o: ChatOptions): Promise<Reply> {
  if (!deps) throw new Error(`${m.label} is a model of your plan, and this part of the app cannot reach ${m.provider === 'claude' ? 'Claude Code' : 'Codex'}`);
  const p = m.provider as SubscriptionProvider;
  const pool = deps.accounts(p);
  let limited: Error | null = null;
  let out = 0;
  for (const a of pool.length ? pool : [{ env: {} }]) {
    if (isSignedOut(p, a.account)) {
      out++;
      continue;
    }
    // Text already shown cannot be taken back: an account that fails after it does not hand the step on.
    let shown = false;
    const seen: ChatOptions = { ...o, onText: (t) => ((shown = true), o.onText(t)), onReasoning: (t) => ((shown = true), o.onReasoning(t)) };
    try {
      const r = p === 'claude' ? await claudeStep(m, seen, a) : await codexStep(m, seen, a);
      markSignedIn(p, a.account);
      return r;
    } catch (e) {
      if (o.signal.aborted) throw e;
      if (e instanceof PlanSignedOut) {
        markSignedOut(p, a.account, e.message);
        out++;
        if (!shown) continue;
      }
      if (e instanceof PlanLimit && !shown) {
        limited ??= e;
        continue;
      }
      throw e;
    }
  }
  if (limited) throw new Error(`${m.label}: ${limited.message}${pool.length > 1 ? ` (every ${PROGRAM[p]} account is at its limit)` : ''}`);
  throw new Error(
    out > 1
      ? `${m.label} cannot answer: every ${PROGRAM[p]} account is signed out. Sign in again in Settings → Agents → Accounts.`
      : `${m.label} cannot answer: ${PROGRAM[p]} is signed out. Sign in again in Settings → Agents → Accounts.`,
  );
}

const STALL_MS = Number(process.env.HYDOR_STALL_MS) || 10 * 60_000;

// ---- Claude, through Claude Code ----------------------------------------------------------------------

/** What Claude is told of the conversation it is given as one message. */
const TRANSCRIPT_HEAD =
  'The conversation so far follows, oldest first. <user> blocks are the user’s messages (and notes the app adds), <assistant> blocks are your own earlier replies with the tool calls you wrote in them, and <tool_response> blocks are what those calls returned. After the last block, write only your next reply as the assistant: your tool calls, then end the reply there (the app runs them, and their results come in the next message), or your answer once the work is done. Never write <tool_response>, <assistant> or <user> blocks yourself: only the app does.';

/** A picture as Claude takes it: from a data: address, else by its address. */
function claudeImage(url: string): object {
  const d = /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(url);
  return d ? { type: 'image', source: { type: 'base64', media_type: d[1], data: d[2] } } : { type: 'image', source: { type: 'url', url } };
}

/**
 * The conversation as one message's blocks: the first request as it is; after that a head, then each message in its
 * own block (pictures right after the words they came with), so each step's message starts with the last one's and
 * the provider's cache of it holds.
 */
export function claudeBlocks(rest: ChatMessage[]): object[] {
  const blocks: object[] = [];
  const add = (parts: Part[], wrap?: string) => {
    const text = parts.map((x) => (x.type === 'text' ? x.text : '')).join('');
    if (text.trim() || wrap) blocks.push({ type: 'text', text: wrap ? `<${wrap}>\n${text}\n</${wrap}>` : text });
    for (const x of parts) if (x.type === 'image_url') blocks.push(claudeImage(x.image_url.url));
  };
  if (rest.length === 1 && rest[0].role === 'user') {
    add(partsOf(rest[0].content));
    return blocks.length ? blocks : [{ type: 'text', text: '(no message)' }];
  }
  blocks.push({ type: 'text', text: TRANSCRIPT_HEAD });
  for (const msg of rest) {
    const parts = partsOf(msg.content);
    if (msg.role === 'assistant') add(parts, 'assistant');
    // What tools returned keeps its own tags; anything else from that side is the user's (or a note of the app's).
    else if (/^\s*<tool_response[\s>]/.test(textOf(msg.content)) && /<\/tool_response>\s*$/.test(textOf(msg.content))) add(parts);
    else add(parts, 'user');
  }
  return blocks;
}

/** Holds back the end of the text until it is over, so a closing tag the model wrote after the transcript's can be dropped. */
export class TagTrim {
  private start = '';
  private started = false;
  private tail = '';
  constructor(private emit: (t: string) => void) {}
  push(t: string) {
    if (!this.started) {
      this.start += t;
      // A reply that opens with the transcript's own tag: the tag goes.
      if (this.start.length < 12 && '<assistant>'.startsWith(this.start.trimStart())) return;
      this.started = true;
      t = this.start.replace(/^\s*<assistant>\s*/, '');
      this.start = '';
    }
    this.tail += t;
    if (this.tail.length > 16) {
      this.emit(this.tail.slice(0, -16));
      this.tail = this.tail.slice(-16);
    }
  }
  end() {
    if (!this.started) this.tail = this.start.replace(/^\s*<assistant>\s*/, '');
    this.emit(this.tail.replace(/\s*<\/assistant>\s*$/, ''));
    this.tail = '';
  }
}

const claudeLimit = (t: string) => /\b(?:hit|reached) your\b.{0,40}?\blimit\b|usage limit|limit reached|out of (?:extra )?usage|rate_limit_error|\b429\b/i.test(t);
const tooLong = (t: string) => /prompt is too long|context (?:window|length)|too many tokens|exceeds? the (?:max|context)|input length and `max_tokens` exceed/i.test(t);

async function claudeStep(m: AgentModel, o: ChatOptions, a: PlanAccount): Promise<Reply> {
  const [sys, ...rest] = o.messages;
  // The instructions go in a file of their own (a command line holds 32 KB on Windows), readable by this user alone.
  const file = path.join(os.tmpdir(), `hydor-plan-${crypto.randomBytes(6).toString('hex')}.txt`);
  fs.writeFileSync(file, sys?.role === 'system' ? textOf(sys.content) : '', { mode: 0o600 });
  const effort = effortFor(m);
  // --tools takes a list, so another flag follows it.
  const args = ['-p', '--model', m.model, ...(effort ? ['--effort', effort] : []), '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands', '--input-format', 'stream-json', '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--system-prompt-file', file];
  const env: Env = { ...agentBaseEnv(), ...a.env, DISABLE_AUTOUPDATER: '1', ...(o.maxTokens ? { CLAUDE_CODE_MAX_OUTPUT_TOKENS: String(Math.max(1024, Math.min(o.maxTokens, 64_000))) } : {}) };
  const child = spawnProgram(config.claudeBin, args, { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'pipe'] });
  const stop = () => child.kill('SIGTERM');
  o.signal.addEventListener('abort', stop, { once: true });
  let stalled = false;
  let timer = setTimeout(() => ((stalled = true), stop()), STALL_MS);
  const trim = new TagTrim(o.onText);
  // The reply ends where its calls end: what the model writes after them (results it imagines, more calls) is never shown
  // or kept, and the program stops there.
  const gate = new CallGate((t) => trim.push(t));
  let cut = false;
  const cutHere = () => {
    if (cut) return;
    cut = true;
    stop();
    // A program that does not stop when asked is made to.
    setTimeout(() => child.exitCode === null && child.signalCode === null && child.kill('SIGKILL'), 5000).unref();
  };
  let text = '';
  let reasoning = '';
  let finish: string | undefined;
  let result: Record<string, any> | null = null;
  /** What the model was given and has written so far, from the stream (a reply cut short has no result to say it). */
  const streamed = { in: 0, created: 0, cached: 0, out: 0 };
  let errText = '';
  let stderr = '';
  child.stderr.on('data', (b: Buffer) => (stderr = (stderr + b.toString()).slice(-4000)));
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content: claudeBlocks(rest) }, parent_tool_use_id: null, session_id: '' }) + '\n');
  try {
    const lines = createInterface({ input: child.stdout });
    const closed = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
    child.on('error', () => {});
    for await (const line of lines) {
      clearTimeout(timer);
      timer = setTimeout(() => ((stalled = true), stop()), STALL_MS);
      let e: Record<string, any>;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      // Once the reply is over at its calls, the rest the program prints goes unread.
      if (cut) continue;
      if (e.type === 'stream_event') {
        const ev = e.event ?? {};
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && typeof ev.delta.text === 'string') {
          text += ev.delta.text;
          if (gate.push(ev.delta.text)) cutHere();
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'thinking_delta' && typeof ev.delta.thinking === 'string') {
          reasoning += ev.delta.thinking;
          o.onReasoning(ev.delta.thinking);
        } else if (ev.type === 'message_start' && ev.message?.usage) {
          const u = ev.message.usage;
          streamed.in = Number(u.input_tokens ?? 0);
          streamed.created = Number(u.cache_creation_input_tokens ?? 0);
          streamed.cached = Number(u.cache_read_input_tokens ?? 0);
        } else if (ev.type === 'message_delta') {
          if (ev.delta?.stop_reason) finish = ev.delta.stop_reason === 'max_tokens' ? 'length' : 'stop';
          if (typeof ev.usage?.output_tokens === 'number') streamed.out = ev.usage.output_tokens;
        }
      } else if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
        // An error Claude Code reports in the reply's place ("API Error: …").
        const said = e.message.content.map((b: any) => (b?.type === 'text' ? b.text : '')).join('');
        if (e.error || e.isApiErrorMessage || /^API Error/i.test(said)) errText = said || String(e.error ?? '');
      } else if (e.type === 'result') result = e;
    }
    await closed;
  } finally {
    clearTimeout(timer);
    o.signal.removeEventListener('abort', stop);
    fs.rmSync(file, { force: true });
  }
  if (o.signal.aborted) throw new Error('aborted');
  if (stalled) throw new StreamCut(`${m.label} sent nothing for a long time`);
  // Stopped where its calls end: the reply is what came before, and what it used is what the stream said (the words
  // it wrote after the cut, which no result counts, roughly).
  if (cut) {
    const kept = gate.end();
    trim.end();
    const prompt = streamed.in + streamed.created + streamed.cached;
    const completion = Math.max(streamed.out, Math.ceil(text.length / 4));
    return { text: kept.replace(/^\s*<assistant>\s*/, '').replace(/\s*<\/assistant>\s*$/, ''), reasoning, calls: [], finish: 'stop', usage: { prompt, completion, ...(streamed.cached ? { cached: streamed.cached } : {}) } };
  }
  const said = typeof result?.result === 'string' ? result.result : '';
  if (!result || result.is_error || (result.subtype && result.subtype !== 'success')) {
    const why = (errText || said || stderr.trim().split('\n').pop() || 'Claude Code gave no answer').slice(0, 600);
    if (result?.api_error_status === 401 || signedOutText('claude', why)) throw new PlanSignedOut(why);
    if (claudeLimit(why)) throw new PlanLimit(why);
    if (tooLong(why)) throw new ContextOverflow(why, Number(/(\d{5,7})\s*(?:token )?(?:maximum|limit|context)/i.exec(why)?.[1]) || undefined);
    if (text && !said) throw new StreamCut(`${m.label} stopped mid-reply: ${why}`);
    throw new Error(`${m.label} (through Claude Code): ${why}`);
  }
  // No pieces streamed (an older Claude Code): the whole reply at once, ended at its calls all the same.
  if (!text && said) gate.push(said);
  const kept = gate.end();
  trim.end();
  const u = result.usage ?? {};
  const cachedIn = Number(u.cache_read_input_tokens ?? 0);
  const prompt = Number(u.input_tokens ?? 0) + Number(u.cache_creation_input_tokens ?? 0) + cachedIn;
  const reply = kept.replace(/^\s*<assistant>\s*/, '').replace(/\s*<\/assistant>\s*$/, '');
  return { text: reply, reasoning, calls: [], finish: gate.stopped ? 'stop' : finish, usage: { prompt, completion: Number(u.output_tokens ?? 0), ...(cachedIn ? { cached: cachedIn } : {}) } };
}

// ---- Codex's models, on the ChatGPT plan's Responses API ----------------------------------------------

const CODEX_URL = process.env.HYDOR_CODEX_RESPONSES_URL || 'https://chatgpt.com/backend-api/codex/responses';

/** An account's ChatGPT token, with when it ends and the ChatGPT account it is for. */
const tokens = new Map<string, { token: string; exp: number; chatgpt: string }>();

function claimsOf(jwt: string): Record<string, any> {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/** The account's token, refreshed by Codex when it ends within two minutes (or when asked after a refusal). */
async function codexAuth(account: string | undefined, refresh: boolean) {
  const key = account ?? '';
  const had = tokens.get(key);
  if (!refresh && had && had.exp - Date.now() > 120_000) return had;
  let got = await deps!.codexToken(account, refresh);
  if (got.token && !refresh) {
    const exp = Number(claimsOf(got.token).exp) * 1000;
    if (exp && exp - Date.now() < 120_000) got = await deps!.codexToken(account, true);
  }
  if (!got.token) throw new PlanSignedOut(got.method && got.method !== 'chatgpt' ? 'Codex is signed in with an API key here, not with ChatGPT' : 'Codex is not signed in');
  if (got.method && got.method !== 'chatgpt') throw new PlanSignedOut('Codex is signed in with an API key here, not with ChatGPT');
  const c = claimsOf(got.token);
  const t = { token: got.token, exp: Number(c.exp) * 1000 || Date.now() + 5 * 60_000, chatgpt: String(c['https://api.openai.com/auth']?.chatgpt_account_id ?? '') };
  tokens.set(key, t);
  return t;
}

/** The conversation as Responses API items: messages, the model's calls and what they returned, its reasoning kept between steps. */
export function codexInput(rest: ChatMessage[]): object[] {
  const items: object[] = [];
  for (const msg of rest) {
    if (msg.role === 'assistant') {
      for (const d of msg.reasoning_details ?? []) {
        const r = d as Record<string, any>;
        if (r?.type === 'reasoning' && typeof r.encrypted_content === 'string') items.push({ type: 'reasoning', summary: Array.isArray(r.summary) ? r.summary : [], encrypted_content: r.encrypted_content });
      }
      const text = textOf(msg.content);
      if (text) items.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
      for (const c of msg.tool_calls ?? []) items.push({ type: 'function_call', call_id: c.id, name: c.function.name, arguments: c.function.arguments || '{}' });
    } else if (msg.role === 'tool') items.push({ type: 'function_call_output', call_id: msg.tool_call_id, output: textOf(msg.content) });
    else {
      const content = partsOf(msg.content).map((x) => (x.type === 'text' ? { type: 'input_text', text: x.text } : { type: 'input_image', image_url: x.image_url.url }));
      if (content.length) items.push({ type: 'message', role: msg.role === 'system' ? 'developer' : 'user', content });
    }
  }
  return items;
}

const codexLimit = (status: number, t: string) => /usage_limit_reached|usage limit|limit_reached|reached (?:your|the) .{0,30}limit|plan.{0,30}limit|insufficient_quota/i.test(t) || (status === 429 && /limit/i.test(t) && !/rate limit/i.test(t));

async function codexStep(m: AgentModel, o: ChatOptions, a: PlanAccount): Promise<Reply> {
  const [sys, ...rest] = o.messages;
  const effort = effortFor(m);
  const body: Record<string, unknown> = {
    model: m.model,
    instructions: sys?.role === 'system' ? textOf(sys.content) : '',
    input: codexInput(sys?.role === 'system' ? rest : o.messages),
    ...(o.tools?.length
      ? {
          tools: o.tools.map((t) => ({ type: 'function', name: t.function.name, description: t.function.description, parameters: t.function.parameters, strict: false })),
          tool_choice: o.toolChoice ?? 'auto',
          parallel_tool_calls: true,
        }
      : {}),
    reasoning: { ...(effort ? { effort } : {}), summary: 'auto' },
    // The plan's API keeps nothing: the model's reasoning comes back sealed and goes with the next step.
    store: false,
    stream: true,
    include: ['reasoning.encrypted_content'],
    ...(o.cacheKey ? { prompt_cache_key: o.cacheKey } : {}),
  };
  let auth = await codexAuth(a.account, false);
  for (let attempt = 0; ; attempt++) {
    const stall = new AbortController();
    const signal = AbortSignal.any([o.signal, stall.signal]);
    let r: Response;
    try {
      r = await fetch(CODEX_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'text/event-stream',
          authorization: `Bearer ${auth.token}`,
          ...(auth.chatgpt ? { 'chatgpt-account-id': auth.chatgpt } : {}),
          originator: 'hydor',
          'OpenAI-Beta': 'responses=experimental',
          session_id: o.cacheKey ?? crypto.randomUUID(),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (o.signal.aborted || attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 3 ** attempt));
      continue;
    }
    if (!r.ok) {
      const err = (await r.text().catch(() => '')).slice(0, 1500);
      const said = (() => {
        try {
          const j = JSON.parse(err);
          return String(j?.error?.message ?? j?.detail?.message ?? j?.detail ?? j?.message ?? err);
        } catch {
          return err;
        }
      })().replace(/\s+/g, ' ').slice(0, 400);
      // A token that ended early: Codex refreshes it, once.
      if (r.status === 401 && attempt === 0) {
        auth = await codexAuth(a.account, true);
        continue;
      }
      if (r.status === 401 || r.status === 403) throw new PlanSignedOut(said || `${r.status}`);
      if (codexLimit(r.status, err)) throw new PlanLimit(said || 'the plan’s usage limit is reached');
      if (/context_length_exceeded|context window|too long|maximum context/i.test(err)) throw new ContextOverflow(said);
      if ((r.status === 429 || r.status >= 500) && attempt < 4) {
        const after = Number(r.headers.get('retry-after'));
        await new Promise((res) => setTimeout(res, after > 0 && after < 120 ? after * 1000 : 1500 * 2 ** attempt));
        continue;
      }
      throw new Error(`${m.label} (through Codex) answered ${r.status}: ${said}`);
    }
    const seen = { any: false };
    try {
      return await codexRead(r, o, stall, seen);
    } catch (e) {
      if (o.signal.aborted) throw e;
      if (e instanceof PlanLimit || e instanceof PlanSignedOut || e instanceof ContextOverflow) throw e;
      if (!seen.any && attempt < 3) {
        await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt));
        continue;
      }
      throw new StreamCut(`The connection to ${m.label} broke mid-reply: ${(e as Error).message.slice(0, 200)}`);
    }
  }
}

/** Reads the Responses API's events: text, reasoning summaries, calls and the sealed reasoning as they finish, then usage. */
async function codexRead(r: Response, o: ChatOptions, stall: AbortController, seen: { any: boolean }): Promise<Reply> {
  const out: Reply = { text: '', reasoning: '', calls: [] };
  const details: Record<string, unknown>[] = [];
  let summary = -1;
  const dec = new TextDecoder();
  let buf = '';
  let timer = setTimeout(() => stall.abort(new Error('no data for a long time')), STALL_MS);
  const fail = (e: Record<string, any>) => {
    const err = e.response?.error ?? e.error ?? e;
    const said = String(err?.message ?? err?.code ?? 'the request failed');
    const code = String(err?.code ?? err?.type ?? '');
    if (/context_length_exceeded/.test(code) || /context window|too long/i.test(said)) throw new ContextOverflow(said);
    if (codexLimit(0, `${code} ${said}`)) throw new PlanLimit(said);
    if (/unauthori[sz]ed|invalid_api_key|token/i.test(code)) throw new PlanSignedOut(said);
    throw new Error(said);
  };
  try {
    for await (const chunk of r.body as any as AsyncIterable<Uint8Array>) {
      clearTimeout(timer);
      timer = setTimeout(() => stall.abort(new Error('no data for a long time')), STALL_MS);
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        let e: Record<string, any>;
        try {
          e = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        switch (e.type) {
          case 'response.output_text.delta':
            if (typeof e.delta === 'string' && e.delta) {
              out.text += e.delta;
              seen.any = true;
              o.onText(e.delta);
            }
            break;
          case 'response.reasoning_summary_text.delta':
            if (typeof e.delta === 'string' && e.delta) {
              // Each part of the summary is a paragraph of its own.
              const part = Number(e.summary_index ?? 0);
              const sep = summary >= 0 && part !== summary ? '\n\n' : '';
              summary = part;
              out.reasoning += sep + e.delta;
              seen.any = true;
              o.onReasoning(sep + e.delta);
            }
            break;
          case 'response.output_item.done': {
            const item = e.item ?? {};
            if (item.type === 'function_call') {
              seen.any = true;
              out.calls.push({ id: String(item.call_id ?? item.id ?? crypto.randomUUID()), name: String(item.name ?? ''), arguments: typeof item.arguments === 'string' ? item.arguments : JSON.stringify(item.arguments ?? {}) });
            } else if (item.type === 'reasoning' && typeof item.encrypted_content === 'string') details.push({ type: 'reasoning', summary: item.summary ?? [], encrypted_content: item.encrypted_content });
            break;
          }
          case 'response.completed':
          case 'response.incomplete': {
            const res = e.response ?? {};
            const u = res.usage;
            if (u) out.usage = { prompt: Number(u.input_tokens ?? 0), completion: Number(u.output_tokens ?? 0), ...(u.input_tokens_details?.cached_tokens ? { cached: Number(u.input_tokens_details.cached_tokens) } : {}) };
            out.finish = e.type === 'response.incomplete' && /max_output_tokens/.test(String(res.incomplete_details?.reason ?? '')) ? 'length' : out.calls.length ? 'tool_calls' : 'stop';
            if (typeof res.id === 'string') out.id = res.id;
            break;
          }
          case 'response.failed':
          case 'error':
            fail(e);
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  if (stall.signal.aborted) throw stall.signal.reason ?? new Error('stalled');
  if (details.length) out.details = details;
  return out;
}
