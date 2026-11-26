// The helper model: small jobs the app does with a model outside any session, such as writing memory
// notes after a turn, checking a step in Auto mode, a second opinion, or reading a web page for one
// question. Settings → Models picks it: one of Custom's models, or "auto", which asks Claude's Haiku
// through its CLI (else Codex), like the app's other one-off questions (server/oneshot.ts).
import fs from 'node:fs';
import { isSubscription, modelSource, type AgentModel } from '../shared/types.ts';
import { chat, ToolsUnsupported, type ChatMessage, type Part, type Reply, type ToolSchema } from './agent/llm.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { AGENT_FILE } from './models/config.ts';
import type { ModelManager } from './models/manager.ts';
import { oneShot, signedOutOf } from './oneshot.ts';
import { costOf } from './prices.ts';
import { accountLabel, backgroundDone, needSignIn } from './signin.ts';
import { ACCOUNT_AGENT_NAMES } from '../shared/account-agents.ts';
import { tiersOf } from './assistants/tiers.ts';

export interface HelperAsk {
  system: string;
  prompt: string;
  /** For models that see images (a screenshot); "auto" cannot take them. */
  images?: { data: string; mimeType: string }[];
  /** A model other than the chosen helper, by Custom's model id. */
  model?: string;
  /**
   * A rare question that needs a stronger model than the everyday helper (a wiki's reorganising pass): on Automatic,
   * Claude Sonnet instead of Haiku. A helper model the user picked is used as it is.
   */
  strong?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  /** What the call is for, in a few words ("shortening your profile"): the prompt to sign in again says it when no account could do it. */
  task?: string;
  /** Stops the call (on "auto", its program ends). */
  signal?: AbortSignal;
  /** Told what the call cost, in US dollars, when that is known ($0 on a model on this computer). */
  onCost?: (usd: number) => void;
}

const KEY = 'helper.model';

function customModels(): AgentModel[] {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
  } catch {
    return [];
  }
}

/** "auto", or the id of one of Custom's models. */
export const helperModelId = (db: DB): string => kvGet(db, KEY) || 'auto';

export function setHelperModel(db: DB, id: string) {
  if (id !== 'auto' && !customModels().some((m) => m.id === id)) throw new HttpError(400, 'No such model: add it in Settings → Models first');
  kvSet(db, KEY, id);
}

/**
 * What the helper can be: "auto" first, then Custom's models, each with how it is paid for and where it runs (source:
 * your plan through Claude Code or Codex, this computer, or the cloud) and what it comes through, as the pickers say.
 */
export function helperOptions(db: DB) {
  const said = new Map((manager?.options() ?? []).map((o) => [o.value, o]));
  return {
    model: helperModelId(db),
    options: [
      { value: 'auto', label: 'Automatic', detail: 'Claude Haiku through Claude Code, else Codex' },
      ...customModels().map((m) => {
        const o = said.get(m.id);
        return { value: m.id, label: m.label, detail: o?.description?.split(' · ')[0] ?? m.provider, vision: !!m.vision, source: o?.source ?? modelSource(m), via: o?.via ?? m.provider };
      }),
    ],
  };
}

/**
 * The helper model when it runs on this computer or your private network (one of Custom's local models), else null:
 * what a confidential session's titles, summaries and checks may use (server/confidential). "auto" is Claude's or
 * Codex's, online.
 */
export function localHelper(db: DB): string | null {
  const id = helperModelId(db);
  return id !== 'auto' && customModels().find((m) => m.id === id)?.local ? id : null;
}

/**
 * What a number of helper tokens would cost, for an estimate shown before a long job (a wiki's rebuild): the helper's
 * name, and its price from the app's model prices when it has one ($0 on this computer). Automatic has none: it uses
 * the Claude account's usage.
 */
export function helperCost(db: DB, t: { tokensIn: number; tokensOut: number }): { model: string; label: string; priced: boolean; usd?: number } {
  const id = helperModelId(db);
  if (id === 'auto') return { model: 'auto', label: 'Automatic', priced: false };
  const m = customModels().find((x) => x.id === id);
  if (!m) return { model: id, label: id, priced: false };
  if (m.provider === 'ollama' || m.provider === 'vllm') return { model: id, label: m.label, priced: true, usd: 0 };
  // A model of your plan uses the plan's usage, as Automatic does: no price to show.
  if (isSubscription(m.provider)) return { model: id, label: m.label, priced: false };
  const tokens = { tokensIn: t.tokensIn, tokensCached: 0, tokensOut: t.tokensOut };
  const usd = costOf(db, m.id, tokens) ?? costOf(db, m.model, tokens);
  return typeof usd === 'number' && Number.isFinite(usd) ? { model: id, label: m.label, priced: true, usd: Math.round(usd * 100) / 100 } : { model: id, label: m.label, priced: false };
}

/**
 * How many helper calls a long job (a wiki's build or rebuild) may have in flight at once: 3 on Automatic (each is a
 * Claude Code or Codex program), 4 for a model over an API, 1 for a model on this computer or the local network.
 */
export function helperParallel(db: DB): number {
  const id = helperModelId(db);
  if (id === 'auto') return 3;
  const m = customModels().find((x) => x.id === id);
  if (!m || m.local || m.provider === 'ollama' || m.provider === 'vllm') return 1;
  // Each call to a model of your Claude plan is a Claude Code program, as on Automatic.
  if (m.provider === 'claude') return 3;
  return 4;
}

/** Whether the helper (or the given model) can look at images. */
export function helperSees(db: DB, model?: string): boolean {
  const id = model ?? helperModelId(db);
  return id !== 'auto' && !!customModels().find((m) => m.id === id)?.vision;
}

let manager: ModelManager | null = null;
/** The model manager, to start a vLLM model the helper uses (index.ts sets it). */
export const setHelperModels = (m: ModelManager) => (manager = m);

/** What a call of about 2,000 tokens in and 1,000 out would cost on a model: 0 on this computer, Infinity when no price is known. */
function guessCost(db: DB, m: AgentModel): number {
  if (m.provider === 'ollama' || m.provider === 'vllm' || m.local) return 0;
  const tokens = { tokensIn: 2000, tokensCached: 0, tokensOut: 1000 };
  const usd = costOf(db, m.id, tokens) ?? costOf(db, m.model, tokens);
  return typeof usd === 'number' && Number.isFinite(usd) ? usd : Infinity;
}

/**
 * Custom's models to try when neither Claude Code nor Codex could answer, at most two: first the models Custom's tiers
 * name for a call of this size (Quick then Standard; Best, Max then Standard for a strong one), then the others,
 * cheapest first. A call with pictures needs a model that sees them.
 */
function fallbackModels(db: DB, q: HelperAsk): AgentModel[] {
  // Your plans' models go through the same Claude Code and Codex that could not answer: they are no way round them.
  const all = customModels().filter((m) => !isSubscription(m.provider) && (!q.images?.length || m.vision));
  const tiers = tiersOf(db).console;
  const named: AgentModel[] = [];
  for (const pick of q.strong ? [tiers.best, tiers.max, tiers.standard] : [tiers.quick, tiers.standard]) {
    const m = all.find((x) => x.id === pick?.model);
    if (m && !named.includes(m)) named.push(m);
  }
  const rest = all
    .filter((m) => !named.includes(m))
    .map((m) => ({ m, cost: guessCost(db, m) }))
    .sort((a, b) => (a.cost === b.cost ? 0 : a.cost < b.cost ? -1 : 1))
    .map((x) => x.m);
  return [...named, ...rest].slice(0, 2);
}

/** What a reply cost, in US dollars: 0 on a model of this computer or a plan, else what the server said or the model's price; undefined when no price is known. */
function replyCost(db: DB, m: AgentModel, usage: NonNullable<Reply['usage']>): number | undefined {
  const cached = usage.cached ?? 0;
  const tokens = { tokensIn: Math.max(0, usage.prompt - cached), tokensCached: cached, tokensOut: usage.completion };
  const usd = m.provider === 'ollama' || m.provider === 'vllm' || isSubscription(m.provider) ? 0 : (usage.cost ?? costOf(db, m.id, tokens) ?? costOf(db, m.model, tokens));
  return typeof usd === 'number' && Number.isFinite(usd) ? usd : undefined;
}

/** One of Custom's models answers: its text, and what it cost told to `onCost`. */
async function askModel(db: DB, q: HelperAsk, model: AgentModel, timeout: number): Promise<string> {
  let m = model;
  if (m.start && manager) m = await manager.ensure(m.id);
  const content: string | Part[] = q.images?.length && m.vision ? [{ type: 'text', text: q.prompt }, ...q.images.map((i): Part => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))] : q.prompt;
  const messages: ChatMessage[] = [
    { role: 'system', content: q.system },
    { role: 'user', content },
  ];
  const signal = q.signal ? AbortSignal.any([AbortSignal.timeout(timeout), q.signal]) : AbortSignal.timeout(timeout);
  const r = await chat(m, { messages, signal, onText: () => {}, onReasoning: () => {}, maxTokens: q.maxTokens });
  if (q.onCost && r.usage) {
    const usd = replyCost(db, m, r.usage);
    if (usd !== undefined) q.onCost(usd);
  }
  return r.text;
}

/** A model of Custom's by its id, or null (no such model). */
export const customModel = (id: string): AgentModel | null => customModels().find((m) => m.id === id) ?? null;

/** A conversation with one of Custom's models: tool calls, a streamed answer and what it cost (what the helper's one-question call cannot do). */
export interface HelperChat {
  /** Custom's model id. */
  model: string;
  messages: ChatMessage[];
  /** Tools the model may ask for: it only asks, the caller runs them (a model whose tools are not native is refused). */
  tools?: ToolSchema[];
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called with each piece of the answer as it is written. */
  onText?: (piece: string) => void;
}

export interface HelperChatDone {
  text: string;
  calls: { id: string; name: string; arguments: string }[];
  /** The server's reason for stopping ("stop", "length", "tool_calls", "content_filter"…), when it said. */
  finish?: string;
  usage: { inputTokens: number; outputTokens: number; usd?: number };
  /** The model's name for the log. */
  name: string;
}

/**
 * A turn with one of Custom's models, outside any session, with the same start, accounting and prices as the helper's
 * one-question call (`askModel`): the web apps' AI route's way to the owner's models. Nothing of the app is reachable
 * from it: no tools of the app's own, no memory, no files; only the tools the caller passes, which it runs itself.
 */
export async function helperChat(db: DB, q: HelperChat): Promise<HelperChatDone> {
  const model = customModel(q.model);
  if (!model) throw new HttpError(400, 'The model is gone: pick another in Settings → Models');
  if (q.tools?.length && model.tools !== 'native') throw new ToolsUnsupported(`${model.label} does not take tool calls`);
  let m = model;
  if (m.start && manager) m = await manager.ensure(m.id);
  const timeout = q.timeoutMs ?? 120_000;
  const signal = q.signal ? AbortSignal.any([AbortSignal.timeout(timeout), q.signal]) : AbortSignal.timeout(timeout);
  const r = await chat(m, { messages: q.messages, tools: q.tools, signal, onText: q.onText ?? (() => {}), onReasoning: () => {}, maxTokens: q.maxTokens });
  const usd = r.usage ? replyCost(db, m, r.usage) : undefined;
  return {
    text: r.text,
    calls: r.calls,
    finish: r.finish,
    usage: { inputTokens: r.usage?.prompt ?? 0, outputTokens: r.usage?.completion ?? 0, ...(usd !== undefined ? { usd } : {}) },
    name: m.label,
  };
}

/**
 * Why nothing could do the work, as the error says it: Your Claude Code account “Work” is signed out, … (each a whole
 * sentence, so the app's dictionaries translate it).
 */
function signedOutSentence(accounts: { agent: 'claude' | 'codex'; account?: string }[]): string {
  const name = (a: { agent: 'claude' | 'codex'; account?: string }) => {
    const label = accountLabel(a.agent, a.account);
    return { program: ACCOUNT_AGENT_NAMES[a.agent], label: a.account || label.includes('@') ? label : undefined };
  };
  if (accounts.length > 1) {
    const list = accounts.map((a) => name(a)).map((n) => (n.label ? `${n.program} “${n.label}”` : `${n.program} (main)`));
    return `${accounts.length} accounts are signed out (${list.join(', ')}), and no other account or Custom model could do this: sign in again (Settings → Agents → Accounts).`;
  }
  const n = name(accounts[0]);
  return n.label
    ? `Your ${n.program} account “${n.label}” is signed out, and no other account or Custom model could do this: sign in again (Settings → Agents → Accounts).`
    : `Your main ${n.program} account is signed out, and no other account or Custom model could do this: sign in again (Settings → Agents → Accounts).`;
}

/** The helper's answer as text. */
export async function helper(db: DB, q: HelperAsk): Promise<string> {
  const id = q.model ?? helperModelId(db);
  const timeout = q.timeoutMs ?? 90_000;
  if (id === 'auto') {
    if (q.images?.length) throw new HttpError(400, 'The helper model cannot see images: pick one that does in Settings → Models');
    try {
      return await oneShot({ system: q.system, prompt: q.prompt, timeoutMs: timeout, signal: q.signal, ...(q.strong ? { model: 'sonnet' as const } : {}) });
    } catch (e) {
      // Neither CLI answered: one of Custom's models needs neither.
      if (!(e instanceof HttpError && e.status === 502) || q.signal?.aborted) throw e;
      const said: string[] = [];
      for (const m of fallbackModels(db, q)) {
        try {
          const text = await askModel(db, q, m, timeout);
          backgroundDone();
          return text;
        } catch (err) {
          if (q.signal?.aborted) throw err;
          said.push(`${m.label}: ${((err as Error).message || 'no answer').replace(/\s+/g, ' ').replace(/\.$/, '').slice(0, 120)}`);
        }
      }
      // Signed out is why, and nothing else could do the work: the user is asked to sign in again, to the first program
      // that would have answered (Claude Code before Codex), as one sign-in is enough, and a Codex never signed in to is
      // not asked about while Claude Code is.
      const all = signedOutOf(e).filter((a, i, list) => list.findIndex((b) => b.agent === a.agent && b.account === a.account) === i);
      const out = all.some((a) => a.agent === 'claude') ? all.filter((a) => a.agent === 'claude') : all;
      if (out.length) {
        for (const a of out) needSignIn({ agent: a.agent, account: a.account, task: q.task });
        throw new HttpError(502, signedOutSentence(out));
      }
      const why = said.length ? `${e.message} Custom: ${said.join('; ')}.` : e.message;
      throw new HttpError(502, `${why} Settings → Models → Helper model can use another model.`);
    }
  }
  const m = customModels().find((x) => x.id === id);
  if (!m) throw new HttpError(400, 'The helper model is gone: pick another in Settings → Models');
  return askModel(db, q, m, timeout);
}

/** The helper's answer as JSON (the first object in it); `what` names it in the error. */
export async function helperJson<T>(db: DB, q: HelperAsk, what: string): Promise<T> {
  const raw = await helper(db, q);
  try {
    return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as T;
  } catch {
    throw new HttpError(502, `The helper model did not answer with ${what}`);
  }
}
