// What an OpenAI-compatible endpoint's models can do (see images, reason), as far as the endpoint says, and the
// person's own setting over it. Read from the entries of its /models (OpenRouter's, Mistral's and others' fields),
// and from LiteLLM's /model/info when /models carries none of them (LiteLLM's /models gives only ids).
import type { EndpointModelCaps } from '../../shared/types.ts';
import type { EndpointModelSetting } from './config.ts';

/** What an endpoint says of a model: a field left out is one it does not say (only an explicit no is false). */
export interface Said {
  vision?: boolean;
  reasoning?: boolean;
}

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const isImage = (l: unknown[]) => l.some((x) => String(x).toLowerCase() === 'image');

/** From one /models entry. */
export function said(m: any): Said {
  const out: Said = {};
  if (!m || typeof m !== 'object') return out;
  // Vision: a list of input modalities (OpenRouter: architecture.input_modalities; others: input_modalities, modalities as a list or { input }), else a flag.
  const mods = [m.architecture?.input_modalities, m.input_modalities, Array.isArray(m.modalities) ? m.modalities : m.modalities?.input].find(Array.isArray) as unknown[] | undefined;
  if (mods) out.vision = isImage(mods);
  else out.vision = bool(m.capabilities?.vision) ?? bool(m.supports_vision);
  // Reasoning: OpenRouter's supported_parameters, else a flag.
  if (Array.isArray(m.supported_parameters)) out.reasoning = m.supported_parameters.some((x: unknown) => x === 'reasoning' || x === 'reasoning_effort');
  else out.reasoning = bool(m.capabilities?.reasoning) ?? bool(m.supports_reasoning);
  if (out.vision === undefined) delete out.vision;
  if (out.reasoning === undefined) delete out.reasoning;
  return out;
}

/** The context length an entry gives (vLLM's max_model_len, others' context_length…). */
export const contextOf = (m: any): number => {
  const n = Number(m?.max_model_len ?? m?.context_length ?? m?.context_window ?? m?.max_context_length);
  return n > 0 ? n : 0;
};

/** What LiteLLM's /model/info says of each model name: a capability is true when every entry that states it says true. */
export function litellmInfo(d: any): Map<string, Said & { context?: number }> {
  const out = new Map<string, Said & { context?: number }>();
  const groups = new Map<string, any[]>();
  for (const e of Array.isArray(d?.data) ? d.data : []) if (typeof e?.model_name === 'string') groups.set(e.model_name, [...(groups.get(e.model_name) ?? []), e.model_info ?? {}]);
  for (const [name, infos] of groups) {
    const all = (k: string) => {
      const v = infos.map((i) => bool(i?.[k])).filter((x): x is boolean => x !== undefined);
      return v.length ? v.every(Boolean) : undefined;
    };
    const ctx = infos.map((i) => Number(i?.max_input_tokens)).filter((n) => n > 0);
    const s: Said & { context?: number } = {};
    const vision = all('supports_vision');
    const reasoning = all('supports_reasoning');
    if (vision !== undefined) s.vision = vision;
    if (reasoning !== undefined) s.reasoning = reasoning;
    if (ctx.length) s.context = Math.min(...ctx);
    out.set(name, s);
  }
  return out;
}

/** The person's setting, else what the endpoint says, else no. */
export function resolve(set: EndpointModelSetting | undefined, endpoint: Said | undefined): EndpointModelCaps {
  return {
    vision: set?.vision ?? endpoint?.vision ?? false,
    reasoning: set?.reasoning ?? endpoint?.reasoning ?? false,
    endpoint: { ...(endpoint?.vision !== undefined ? { vision: endpoint.vision } : {}), ...(endpoint?.reasoning !== undefined ? { reasoning: endpoint.reasoning } : {}) },
    set: { ...(set?.vision !== undefined ? { vision: set.vision } : {}), ...(set?.reasoning !== undefined ? { reasoning: set.reasoning } : {}) },
  };
}

/** The reasoning levels Custom offers a model that reasons, and sends as reasoning_effort. */
export const ENDPOINT_EFFORTS = ['low', 'medium', 'high'];

/** What an endpoint's /models and, when those entries say nothing of these, LiteLLM's /model/info say of its models. */
export async function read(
  baseUrl: string,
  apiKey: string | undefined,
  /** Asks /model/info too (false after it answered with an error). */
  info: boolean,
): Promise<{ ids: string[]; said: Map<string, Said>; context: Map<string, number>; noInfo: boolean }> {
  const root = baseUrl.replace(/\/+$/, '');
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : undefined;
  const r = await fetch(`${root}/models`, { headers, signal: AbortSignal.timeout(5000) });
  const d: any = await r.json();
  const list: any[] = Array.isArray(d?.data) ? d.data : [];
  const ids = list.map((m) => String(m.id));
  const out = { ids, said: new Map<string, Said>(), context: new Map<string, number>(), noInfo: false };
  let any = false;
  for (const m of list) {
    const n = contextOf(m);
    if (n) out.context.set(String(m.id), n);
    const s = said(m);
    if (s.vision !== undefined || s.reasoning !== undefined) any = true;
    out.said.set(String(m.id), s);
  }
  if (any || !info || !ids.length) return out;
  try {
    const i = await fetch(`${root}/model/info`, { headers, signal: AbortSignal.timeout(5000) });
    if (!i.ok) {
      out.noInfo = true;
      return out;
    }
    const body: any = await i.json().catch(() => null);
    if (!Array.isArray(body?.data)) {
      out.noInfo = true;
      return out;
    }
    const byName = litellmInfo(body);
    for (const id of ids) {
      const l = byName.get(id);
      if (!l) continue;
      const { context, ...s } = l;
      out.said.set(id, s);
      if (context && !out.context.has(id)) out.context.set(id, context);
    }
  } catch {
    // It did not answer in time, or not at all: asked again next time.
  }
  return out;
}
