// Custom's agent process asks a model of your Claude or ChatGPT plan through the app, at its run's address: the app holds
// Claude Code's and Codex's sign-ins (server/models/subscription.ts) and streams the reply back, one JSON object a line
// (pieces of text and reasoning as they come, then the reply or what went wrong; pings keep a long silence open).
import type { AgentModel } from '../../shared/types.ts';
import { ContextOverflow, StreamCut, type ChatOptions, type Reply } from './llm.ts';

export function planClient(runtime: string) {
  return async (m: AgentModel, o: ChatOptions): Promise<Reply> => {
    const r = await fetch(`${runtime}/model`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: m.id, messages: o.messages, tools: o.tools, toolChoice: o.toolChoice, maxTokens: o.maxTokens, cacheKey: o.cacheKey }),
      signal: o.signal,
    });
    if (!r.ok || !r.body) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(d.error ?? `The app answered ${r.status} when asked for ${m.label}`);
    }
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of r.body as any as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let e: { t?: string; v?: string; reply?: Reply; kind?: string; message?: string; limit?: number; prompt?: number };
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.t === 'text' && e.v) o.onText(e.v);
        else if (e.t === 'reasoning' && e.v) o.onReasoning(e.v);
        else if (e.t === 'reply' && e.reply) return e.reply;
        else if (e.t === 'error') {
          const msg = e.message ?? `${m.label} did not answer`;
          if (e.kind === 'overflow') throw new ContextOverflow(msg, e.limit, e.prompt);
          if (e.kind === 'cut') throw new StreamCut(msg);
          throw new Error(msg);
        }
      }
    }
    if (o.signal.aborted) throw new Error('aborted');
    throw new StreamCut(`The app’s connection to ${m.label} ended before its reply`);
  };
}
