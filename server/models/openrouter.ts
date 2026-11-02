// OpenRouter's catalog (openrouter.ai): every model it routes, with its maker, context length, price,
// whether it takes tools and images or reasons, and when it was listed. Kept for an hour; the pickers
// show the models you pinned.
import type { OpenRouterModel, OpenRouterSort } from '../../shared/types.ts';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export type OrModel = OpenRouterModel;

let cache: { at: number; list: OrModel[] } | null = null;

/** A description as plain text: links become their words, and it stops after a few sentences. */
function plain(s: unknown): string | undefined {
  const t = String(s ?? '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t ? (t.length > 360 ? `${t.slice(0, 357).replace(/\s+\S*$/, '')}…` : t) : undefined;
}

export async function catalog(): Promise<OrModel[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.list;
  const r = await fetch(`${OPENROUTER_URL}/models`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status}`);
  const d: any = await r.json();
  const list: OrModel[] = (d.data ?? []).map((m: any) => {
    const name = String(m.name ?? m.id);
    const params: string[] = m.supported_parameters ?? [];
    const input = Number(m.pricing?.prompt);
    const output = Number(m.pricing?.completion);
    return {
      id: `openrouter/${m.id}`,
      label: name.replace(/^[^:]+:\s*/, ''),
      provider: 'openrouter',
      contextLength: Number(m.context_length) || undefined,
      vision: (m.architecture?.input_modalities ?? []).includes('image'),
      tools: params.includes('tools') ? 'native' : 'text',
      detail: m.id,
      // A negative price means it varies (a router picking the model).
      price: Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0 ? { input: input * 1e6, output: output * 1e6, ...(m.pricing?.input_cache_read != null && Number(m.pricing.input_cache_read) >= 0 ? { cacheRead: Number(m.pricing.input_cache_read) * 1e6 } : {}) } : undefined,
      created: Number(m.created) ? Number(m.created) * 1000 : undefined,
      description: plain(m.description),
      maxOutput: Number(m.top_provider?.max_completion_tokens) || undefined,
      reasoning: params.includes('reasoning') || params.includes('include_reasoning'),
      org: name.includes(':') ? name.slice(0, name.indexOf(':')).trim() : undefined,
    };
  });
  cache = { at: Date.now(), list };
  return list;
}

export interface OrQuery {
  q: string;
  sort?: OpenRouterSort;
  tools?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  free?: boolean;
}

const free = (m: OrModel) => !!m.price && m.price.input === 0 && m.price.output === 0;

/**
 * Models matching every word of the query (in the name, id or maker) and every filter. Best match puts
 * names that start with the words first, then those that take tools, then the newest; with no words,
 * the newest come first.
 */
export async function search(o: OrQuery, limit = 50): Promise<OrModel[]> {
  const words = o.q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = await catalog();
  const hits = all.filter(
    (m) =>
      words.every((w) => `${m.id} ${m.label} ${m.org ?? ''}`.toLowerCase().includes(w)) &&
      (!o.tools || m.tools === 'native') &&
      (!o.vision || m.vision) &&
      (!o.reasoning || m.reasoning) &&
      (!o.free || free(m)),
  );
  const score = (m: OrModel) => {
    const label = m.label.toLowerCase();
    let s = m.tools === 'native' ? 1 : 0;
    for (const w of words) s += label.startsWith(w) ? 3 : label.split(/[\s\-/.:]+/).some((x) => x.startsWith(w)) ? 2 : 1;
    return s;
  };
  const newer = (a: OrModel, b: OrModel) => (b.created ?? 0) - (a.created ?? 0);
  const cost = (m: OrModel) => (m.price ? m.price.input + m.price.output : Infinity);
  const sort = o.sort ?? (words.length ? 'match' : 'new');
  const order: Record<OpenRouterSort, (a: OrModel, b: OrModel) => number> = {
    match: (a, b) => score(b) - score(a) || newer(a, b),
    new: newer,
    price: (a, b) => cost(a) - cost(b) || newer(a, b),
    context: (a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0) || newer(a, b),
  };
  return hits.sort(order[sort]).slice(0, limit);
}
