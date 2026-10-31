// OpenRouter's catalog (openrouter.ai): every model it routes, with its context length, price and
// whether it takes tools and images. Kept for an hour; the pickers show the models you pinned.
import type { ModelEntry } from '../../shared/types.ts';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

export interface OrModel extends ModelEntry {
  /** Dollars per million tokens, in and out. */
  price?: { input: number; output: number };
}

let cache: { at: number; list: OrModel[] } | null = null;

export async function catalog(): Promise<OrModel[]> {
  if (cache && Date.now() - cache.at < 3600_000) return cache.list;
  const r = await fetch(`${OPENROUTER_URL}/models`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`OpenRouter answered ${r.status}`);
  const d: any = await r.json();
  const list: OrModel[] = (d.data ?? []).map((m: any) => ({
    id: `openrouter/${m.id}`,
    label: String(m.name ?? m.id).replace(/^[^:]+:\s*/, ''),
    provider: 'openrouter',
    contextLength: Number(m.context_length) || undefined,
    vision: (m.architecture?.input_modalities ?? []).includes('image'),
    tools: (m.supported_parameters ?? []).includes('tools') ? 'native' : 'text',
    detail: m.id,
    price: m.pricing ? { input: Number(m.pricing.prompt) * 1e6, output: Number(m.pricing.completion) * 1e6 } : undefined,
  }));
  cache = { at: Date.now(), list };
  return list;
}

/** Models matching every word of the query, ones that take tools first. */
export async function search(q: string, limit = 40): Promise<OrModel[]> {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = await catalog();
  return all
    .filter((m) => words.every((w) => `${m.id} ${m.label}`.toLowerCase().includes(w)))
    .sort((a, b) => (a.tools === b.tools ? 0 : a.tools === 'native' ? -1 : 1))
    .slice(0, limit);
}
