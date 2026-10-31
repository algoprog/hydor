// An Ollama server (ollama.com): its models, pulling more (from its library, or GGUF weights straight
// from Hugging Face as hf.co/<repo>:<quant>), and removing them. Chats go through its OpenAI-compatible /v1.
import type { ModelEntry } from '../../shared/types.ts';

/** Ollama's context when a model sets none (its default on a GPU with 24 GB or more; set OLLAMA_CONTEXT_LENGTH to change it). */
const SERVED_DEFAULT = Number(process.env.OLLAMA_CONTEXT_LENGTH) || 32768;

const base = (url: string) => url.replace(/\/+$/, '').replace(/\/v1$/, '');

async function call(url: string, p: string, init: RequestInit = {}, timeout = 8000): Promise<Response> {
  return fetch(`${base(url)}${p}`, { ...init, signal: init.signal ?? AbortSignal.timeout(timeout) });
}

export async function version(url: string): Promise<string | null> {
  try {
    const r = await call(url, '/api/version', {}, 2500);
    return r.ok ? String(((await r.json()) as any).version ?? '') : null;
  } catch {
    return null;
  }
}

interface Shown {
  contextLength?: number;
  tools: boolean;
  vision: boolean;
}
const shown = new Map<string, Shown>();

/** What a model can do (tools, images) and its context length, from /api/show (kept per model). */
async function show(url: string, name: string): Promise<Shown> {
  const hit = shown.get(name);
  if (hit) return hit;
  try {
    const r = await call(url, '/api/show', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name }) });
    const d: any = await r.json();
    const caps: string[] = d.capabilities ?? [];
    const trained = Number(Object.entries(d.model_info ?? {}).find(([k]) => k.endsWith('.context_length'))?.[1]) || undefined;
    // What Ollama serves is the model's num_ctx, else its own default (32K with a big GPU, less with
    // less); a longer prompt is cut from the start, so the agent plans for the served window.
    const numCtx = Number(/(?:^|\n)num_ctx\s+(\d+)/.exec(String(d.parameters ?? ''))?.[1]) || undefined;
    const served = numCtx ?? Math.min(trained ?? SERVED_DEFAULT, SERVED_DEFAULT);
    const s = { contextLength: trained ? Math.min(trained, served) : served, tools: caps.includes('tools'), vision: caps.includes('vision') };
    shown.set(name, s);
    return s;
  } catch {
    return { tools: false, vision: false };
  }
}

export async function models(url: string): Promise<(ModelEntry & { sizeBytes: number })[]> {
  const r = await call(url, '/api/tags');
  const d: any = await r.json();
  return Promise.all(
    (d.models ?? []).map(async (m: any) => {
      const s = await show(url, m.name);
      return {
        id: `ollama/${m.name}`,
        label: m.name.replace(/^hf\.co\//, ''),
        provider: 'ollama' as const,
        contextLength: s.contextLength,
        vision: s.vision,
        tools: s.tools ? ('native' as const) : ('text' as const),
        sizeBytes: Number(m.size ?? 0),
        detail: [m.details?.parameter_size, m.details?.quantization_level].filter(Boolean).join(' · ') || undefined,
      };
    }),
  );
}

/** Pulls a model, reporting bytes as they arrive (Ollama streams one JSON line per step). */
export async function pull(url: string, name: string, progress: (done: number, total: number, status: string) => void, signal: AbortSignal): Promise<void> {
  const r = await fetch(`${base(url)}/api/pull`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }), signal });
  if (!r.ok || !r.body) throw new Error(`Ollama answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  // Layers download one after another; the total is their sum as each one appears.
  const layers = new Map<string, { done: number; total: number }>();
  let buf = '';
  const dec = new TextDecoder();
  for await (const chunk of r.body as any as AsyncIterable<Uint8Array>) {
    buf += dec.decode(chunk, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const e = JSON.parse(line);
      if (e.error) throw new Error(e.error);
      if (e.digest && e.total) layers.set(e.digest, { done: Number(e.completed ?? 0), total: Number(e.total) });
      const all = [...layers.values()];
      progress(
        all.reduce((a, l) => a + l.done, 0),
        all.reduce((a, l) => a + l.total, 0),
        String(e.status ?? ''),
      );
    }
  }
  shown.delete(name);
}

export async function remove(url: string, name: string): Promise<void> {
  const r = await call(url, '/api/delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name }) });
  if (!r.ok) throw new Error(`Ollama answered ${r.status}: ${(await r.text().catch(() => '')).slice(0, 200)}`);
  shown.delete(name);
}

export const chatUrl = (url: string) => `${base(url)}/v1`;
