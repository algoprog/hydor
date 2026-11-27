// Custom's agent process asks a model of your Claude or ChatGPT plan through the app, at its run's address: the app holds
// Claude Code's and Codex's sign-ins (server/models/subscription.ts) and streams the reply back, one JSON object a line
// (pieces of text and reasoning as they come, then the reply or what went wrong; pings keep a long silence open).
//
// The app restarts now and then (an update), and the agent outlives it: a step whose connection the restart cut, or that
// finds the app not answering yet, is asked again once the app is back, rather than ending the turn with "terminated".
import type { AgentModel } from '../../shared/types.ts';
import { ContextOverflow, StreamCut, type ChatOptions, type Reply } from './llm.ts';

/** How long the app may take to come back before the step fails after all. */
const BACK_WITHIN_MS = Number(process.env.HYDOR_APP_BACK_MS) || 5 * 60_000;

/** The connection to the app broke or was refused: it is restarting. */
export function appGone(e: unknown): boolean {
  const err = e as { message?: string; code?: string; cause?: { code?: string; message?: string } } | undefined;
  const said = `${err?.message ?? ''} ${err?.code ?? ''} ${err?.cause?.code ?? ''} ${err?.cause?.message ?? ''}`;
  return /^(terminated|fetch failed)\b|ECONNREFUSED|ECONNRESET|EPIPE|socket hang up|other side closed|UND_ERR_SOCKET/i.test(said.trim());
}

/** An answer the app gives while it is still starting: its plans' models not listed yet, or a proxy before it. */
class NotBackYet extends Error {}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
  });

export function planClient(runtime: string) {
  const once = async (m: AgentModel, o: ChatOptions, restarted: boolean): Promise<Reply> => {
    const r = await fetch(`${runtime}/model`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: m.id, messages: o.messages, tools: o.tools, toolChoice: o.toolChoice, maxTokens: o.maxTokens, cacheKey: o.cacheKey, effort: o.effort }),
      signal: o.signal,
    });
    if (!r.ok || !r.body) {
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      const msg = d.error ?? `The app answered ${r.status} when asked for ${m.label}`;
      // Just after a restart the app may not list its plans' models yet, for a moment.
      if (restarted && (r.status === 404 || r.status === 502 || r.status === 503 || r.status === 504)) throw new NotBackYet(msg);
      throw new Error(msg);
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
    // The app closed the reply before its end: it is going down, most likely.
    throw Object.assign(new Error('terminated'), { code: 'ECONNRESET' });
  };

  return async (m: AgentModel, o: ChatOptions): Promise<Reply> => {
    const started = Date.now();
    let restarted = false;
    for (let attempt = 0; ; attempt++) {
      let shown = false;
      const seen: ChatOptions = { ...o, onText: (t) => ((shown = true), o.onText(t)), onReasoning: (t) => ((shown = true), o.onReasoning(t)) };
      try {
        return await once(m, seen, restarted);
      } catch (e) {
        if (o.signal.aborted) throw e;
        if (!appGone(e) && !(e instanceof NotBackYet)) throw e;
        // What was shown cannot be taken back: the agent asks the step again from the start, and says so.
        if (shown) throw new StreamCut(`The connection to the app broke mid-reply (it restarted): ${(e as Error).message}`);
        if (Date.now() - started > BACK_WITHIN_MS) throw e instanceof NotBackYet ? new Error(e.message) : e;
        restarted = true;
        await sleep(Math.min(10_000, 500 * 2 ** attempt), o.signal);
      }
    }
  };
}
