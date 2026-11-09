// Chat with an OpenAI-compatible API (OpenRouter, Ollama's /v1, vLLM, LM Studio…), streaming: text and
// reasoning as they come, tool calls put together from their pieces, token usage at the end. Options a
// server does not take (sampling, reasoning effort) are dropped and the request sent again; a stream
// that stalls or breaks before anything came is retried.
import type { AgentModel } from '../../shared/types.ts';
import { catalog } from '../models/openrouter.ts';

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Part[] | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  /** The model's reasoning for this reply, sent back within a turn where the server takes it. */
  reasoning?: string;
  reasoning_details?: unknown[];
  reasoning_content?: string;
  /** Added by Custom (a reminder, a note), not written by the user. */
  note?: boolean;
}

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Reply {
  id?: string;
  text: string;
  reasoning: string;
  /** OpenRouter's structured reasoning (signed or encrypted blocks some models need back). */
  details?: unknown[];
  calls: { id: string; name: string; arguments: string }[];
  /** Tokens the server counted (`cached`: of the prompt's, read from its cache), and what the call cost when it says (OpenRouter). */
  usage?: { prompt: number; completion: number; cached?: number; cost?: number };
  finish?: string;
}

/** The server would not take tools for this model: describe them in the prompt instead. */
export class ToolsUnsupported extends Error {}
/** The conversation is longer than the model's context; `limit` is the context when the server said. */
export class ContextOverflow extends Error {
  constructor(
    message: string,
    readonly limit?: number,
    /** The tokens the messages alone take, when the server said (the reply's room was the problem). */
    readonly prompt?: number,
  ) {
    super(message);
  }
}
/** The stream broke after part of the reply was shown: the step can be tried again. */
export class StreamCut extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))), { once: true });
  });

/** Models whose server refused the extra options once: they are not sent again. */
const plain = new Set<string>();
const STALL_MS = Number(process.env.HYDOR_STALL_MS) || 10 * 60_000;

function overflow(err: string): ContextOverflow | null {
  if (!/context.{0,30}(length|window|limit)|maximum context|too (long|many tokens)|prompt is too long|exceeds the (max|context)|context_length_exceeded|reduce the length/i.test(err)) return null;
  const limit = Number(/(?:maximum context length|context (?:length|window)|context limit)(?: of| is)?\s*(?:is\s*)?(\d{3,7})/i.exec(err)?.[1] ?? /(\d{3,7}) tokens? (?:context|limit)/i.exec(err)?.[1]) || undefined;
  const prompt = Number(/(\d{2,7}) (?:tokens )?in the messages/i.exec(err)?.[1] ?? /\((\d{2,7}) of text input/i.exec(err)?.[1]) || undefined;
  return new ContextOverflow(err, limit, prompt);
}

export async function chat(
  m: AgentModel,
  o: {
    messages: ChatMessage[];
    tools?: ToolSchema[];
    toolChoice?: 'auto' | 'none';
    signal: AbortSignal;
    onText: (t: string) => void;
    onReasoning: (t: string) => void;
    maxTokens?: number;
    /** Sampling and reasoning options, dropped if the server refuses them. */
    extra?: Record<string, unknown>;
  },
): Promise<Reply> {
  // Claude through OpenRouter keeps a cache of the conversation only when asked (OpenAI, DeepSeek and Gemini do on their
  // own): asked with each request, the next one reads it back, sooner and at a tenth of the price. A server that refuses
  // it gets requests without it, as for any option (plain).
  const cached = m.provider === 'openrouter' && /^~?anthropic\//.test(m.model) ? { cache_control: { type: 'ephemeral' } } : {};
  const extra = plain.has(m.id) ? {} : { ...cached, ...(o.extra ?? {}) };
  const body: Record<string, unknown> = {
    model: m.model,
    messages: o.messages,
    stream: true,
    stream_options: { include_usage: true },
    // OpenRouter adds what the call cost to its usage.
    ...(m.provider === 'openrouter' ? { usage: { include: true } } : {}),
    ...(o.tools?.length ? { tools: o.tools, tool_choice: o.toolChoice ?? 'auto' } : {}),
    ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
    ...extra,
  };
  for (let attempt = 0; ; attempt++) {
    const stall = new AbortController();
    const signal = AbortSignal.any([o.signal, stall.signal]);
    let r: Response;
    try {
      r = await fetch(`${m.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(m.apiKey ? { authorization: `Bearer ${m.apiKey}` } : {}), ...m.headers },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      if (o.signal.aborted || attempt >= 3) throw e;
      await sleep(1000 * 3 ** attempt, o.signal);
      continue;
    }
    if (!r.ok) {
      const err = (await r.text().catch(() => '')).slice(0, 1500);
      if (r.status === 400 && /stream_options/i.test(err) && body.stream_options) {
        delete body.stream_options;
        continue;
      }
      // An option this server does not know: send without the extras (and remember that for this model).
      const named = Object.keys(extra).filter((k) => err.includes(k));
      if (r.status >= 400 && r.status < 500 && Object.keys(extra).some((k) => k in body) && (named.length || /unrecognized|unknown|unsupported|not supported|extra (fields|inputs)|additional properties|invalid param/i.test(err))) {
        for (const k of Object.keys(extra)) delete body[k];
        plain.add(m.id);
        continue;
      }
      if (r.status === 400 && /max_completion_tokens/.test(err) && body.max_tokens) {
        body.max_completion_tokens = body.max_tokens;
        delete body.max_tokens;
        continue;
      }
      if (r.status >= 400 && r.status < 500 && o.tools?.length && /tool|function/i.test(err) && /support|enable|not allowed|unknown|invalid/i.test(err)) throw new ToolsUnsupported(err);
      const over = overflow(err);
      if (over) throw over;
      if ((r.status === 429 || r.status >= 500) && attempt < 4) {
        const after = Number(r.headers.get('retry-after'));
        await sleep(after > 0 && after < 120 ? after * 1000 : 1500 * 2 ** attempt, o.signal);
        continue;
      }
      throw new Error(`${m.label} (${m.provider}) answered ${r.status}: ${err.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
    const seen = { any: false };
    try {
      const reply = await read(r, o, stall, seen);
      if (m.provider === 'openrouter' && reply.usage?.cost === undefined) await routerUsage(m, reply, o.signal);
      return reply;
    } catch (e) {
      if (o.signal.aborted) throw e;
      const msg = (e as Error).message ?? String(e);
      const over = overflow(msg);
      if (over) throw over;
      // Nothing shown yet: try again quietly; else the step is tried again by the caller.
      if (!seen.any && attempt < 3) {
        await sleep(1500 * 2 ** attempt, o.signal);
        continue;
      }
      throw new StreamCut(`The connection to ${m.label} broke mid-reply: ${msg.slice(0, 200)}`);
    }
  }
}

/** Prefer the charge OpenRouter reports; its own catalog is the fallback, never a user-entered rate. */
async function routerUsage(m: AgentModel, reply: Reply, signal: AbortSignal) {
  if (reply.id) {
    try {
      const r = await fetch(`${m.baseUrl}/generation?id=${encodeURIComponent(reply.id)}`, {
        headers: { ...(m.apiKey ? { authorization: `Bearer ${m.apiKey}` } : {}), ...m.headers },
        signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      });
      if (r.ok) {
        const { data: d } = await r.json() as any;
        if (typeof d?.total_cost === 'number' && Number.isFinite(d.total_cost) && d.total_cost >= 0) {
          reply.usage = { prompt: reply.usage?.prompt ?? d.native_tokens_prompt ?? d.tokens_prompt ?? 0, completion: reply.usage?.completion ?? d.native_tokens_completion ?? d.tokens_completion ?? 0, cached: reply.usage?.cached ?? d.native_tokens_cached ?? undefined, cost: d.total_cost };
          return;
        }
      }
    } catch { /* The catalog can still price tokens when generation metadata is not ready. */ }
  }
  if (!reply.usage) return;
  try {
    const price = (await catalog()).find((x) => x.id === m.id)?.price;
    if (!price) return;
    const u = reply.usage;
    const cached = Math.min(u.cached ?? 0, u.prompt);
    u.cost = ((u.prompt - cached) * price.input + cached * (price.cacheRead ?? price.input) + u.completion * price.output) / 1e6;
  } catch { /* Keep unknown costs unknown rather than inventing a zero charge. */ }
}

/** Reads the event stream: deltas of text, reasoning and tool calls (by index), then usage. */
async function read(r: Response, o: { onText: (t: string) => void; onReasoning: (t: string) => void }, stall: AbortController, seen: { any: boolean }): Promise<Reply> {
  const out: Reply = { text: '', reasoning: '', calls: [] };
  const calls: { id: string; name: string; arguments: string }[] = [];
  const details: Record<string, any>[] = [];
  const dec = new TextDecoder();
  let buf = '';
  let timer = setTimeout(() => stall.abort(new Error('no data for a long time')), STALL_MS);
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
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let e: any;
        try {
          e = JSON.parse(data);
        } catch {
          continue;
        }
        if (e.error) throw new Error(String(e.error.message ?? JSON.stringify(e.error)));
        if (typeof e.id === 'string') out.id = e.id;
        if (e.usage)
          out.usage = {
            prompt: Number(e.usage.prompt_tokens ?? out.usage?.prompt ?? 0),
            completion: Number(e.usage.completion_tokens ?? out.usage?.completion ?? 0),
            cached: Number(e.usage.prompt_tokens_details?.cached_tokens ?? out.usage?.cached ?? 0) || undefined,
            cost: typeof e.usage.cost === 'number' && Number.isFinite(e.usage.cost) && e.usage.cost >= 0 ? e.usage.cost : out.usage?.cost,
          };
        const c = e.choices?.[0];
        if (!c) continue;
        if (c.finish_reason) out.finish = c.finish_reason;
        const d = c.delta ?? {};
        const thought = d.reasoning_content ?? d.reasoning;
        if (typeof thought === 'string' && thought) {
          out.reasoning += thought;
          seen.any = true;
          o.onReasoning(thought);
        }
        // Structured reasoning arrives in pieces: those with the same index are one block.
        for (const p of Array.isArray(d.reasoning_details) ? d.reasoning_details : []) {
          const at = typeof p?.index === 'number' ? details.findIndex((x) => x.index === p.index) : -1;
          if (at < 0) details.push({ ...p });
          else for (const k of ['text', 'summary', 'data']) if (typeof p[k] === 'string') details[at][k] = (details[at][k] ?? '') + p[k];
          if (at >= 0) for (const [k, v] of Object.entries(p)) if (!['text', 'summary', 'data'].includes(k) && v != null) details[at][k] = v;
        }
        if (typeof d.content === 'string' && d.content) {
          out.text += d.content;
          seen.any = true;
          o.onText(d.content);
        }
        for (const tc of d.tool_calls ?? []) {
          const k = Number(tc.index ?? calls.length);
          const call = (calls[k] ??= { id: '', name: '', arguments: '' });
          seen.any = true;
          if (tc.id) call.id = tc.id;
          if (tc.function?.name) call.name += tc.function.name;
          if (tc.function?.arguments) call.arguments += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
  if (stall.signal.aborted) throw stall.signal.reason ?? new Error('stalled');
  if (details.length) out.details = details;
  out.calls = calls.filter(Boolean).map((c, n) => ({ ...c, id: c.id || `call${Date.now().toString(36)}${n}` }));
  return out;
}
