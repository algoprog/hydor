// Chat with an OpenAI-compatible API (OpenRouter, Ollama's /v1, vLLM, LM Studio…), streaming: text and
// reasoning as they come, tool calls put together from their pieces, token usage at the end.
import type { AgentModel } from '../../shared/types.ts';

export type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Part[] | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface Reply {
  text: string;
  reasoning: string;
  calls: { id: string; name: string; arguments: string }[];
  usage?: { prompt: number; completion: number };
  finish?: string;
}

/** The server would not take tools for this model: describe them in the prompt instead. */
export class ToolsUnsupported extends Error {}
/** The conversation is longer than the model's context. */
export class ContextOverflow extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(new Error('aborted'))), { once: true });
  });

export async function chat(
  m: AgentModel,
  o: { messages: ChatMessage[]; tools?: ToolSchema[]; toolChoice?: 'auto' | 'none'; signal: AbortSignal; onText: (t: string) => void; onReasoning: (t: string) => void; maxTokens?: number },
): Promise<Reply> {
  const body: Record<string, unknown> = {
    model: m.model,
    messages: o.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(o.tools?.length ? { tools: o.tools, tool_choice: o.toolChoice ?? 'auto' } : {}),
    ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    let r: Response;
    try {
      r = await fetch(`${m.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(m.apiKey ? { authorization: `Bearer ${m.apiKey}` } : {}), ...m.headers },
        body: JSON.stringify(body),
        signal: o.signal,
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
      if (r.status >= 400 && r.status < 500 && o.tools?.length && /tool|function/i.test(err) && /support|enable|not allowed|unknown|invalid/i.test(err)) throw new ToolsUnsupported(err);
      if (/context.{0,30}(length|window|limit)|maximum context|too (long|many tokens)|prompt is too long|exceeds the (max|context)/i.test(err)) throw new ContextOverflow(err);
      if ((r.status === 429 || r.status >= 500) && attempt < 4) {
        const after = Number(r.headers.get('retry-after'));
        await sleep(after > 0 && after < 120 ? after * 1000 : 1500 * 2 ** attempt, o.signal);
        continue;
      }
      throw new Error(`${m.label} (${m.provider}) answered ${r.status}: ${err.replace(/\s+/g, ' ').slice(0, 400)}`);
    }
    return read(r, o);
  }
}

/** Reads the event stream: deltas of text, reasoning and tool calls (by index), then usage. */
async function read(r: Response, o: { onText: (t: string) => void; onReasoning: (t: string) => void }): Promise<Reply> {
  const out: Reply = { text: '', reasoning: '', calls: [] };
  const calls: { id: string; name: string; arguments: string }[] = [];
  const dec = new TextDecoder();
  let buf = '';
  for await (const chunk of r.body as any as AsyncIterable<Uint8Array>) {
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
      if (e.usage) out.usage = { prompt: Number(e.usage.prompt_tokens ?? 0), completion: Number(e.usage.completion_tokens ?? 0) };
      const c = e.choices?.[0];
      if (!c) continue;
      if (c.finish_reason) out.finish = c.finish_reason;
      const d = c.delta ?? {};
      const thought = d.reasoning_content ?? d.reasoning;
      if (typeof thought === 'string' && thought) {
        out.reasoning += thought;
        o.onReasoning(thought);
      }
      if (typeof d.content === 'string' && d.content) {
        out.text += d.content;
        o.onText(d.content);
      }
      for (const tc of d.tool_calls ?? []) {
        const k = Number(tc.index ?? calls.length);
        const call = (calls[k] ??= { id: '', name: '', arguments: '' });
        if (tc.id) call.id = tc.id;
        if (tc.function?.name) call.name += tc.function.name;
        if (tc.function?.arguments) call.arguments += typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments);
      }
    }
  }
  out.calls = calls.filter(Boolean).map((c, n) => ({ ...c, id: c.id || `call_${Date.now().toString(36)}_${n}` }));
  return out;
}
