// The models an app needs from a provider: a model its steps ask Custom for by name ("openrouter/google/gemini-2.5-
// flash", say), or one its recipe says it needs (requires.models, with where it runs and the provider's own name for
// it). The pages and its runs ask how each stands here (server/apps/models.ts): there, ready to add by itself (an
// OpenRouter model, once OpenRouter's key is set), waiting for a key (the app asks for it where it asks for its other
// keys), or to be set up by hand (a model for Ollama, vLLM or an endpoint).
import type { AppRecipe } from './apps.ts';
import { allSteps, type Flow, type NamedFlow, type Requires } from './app-manifest.ts';

export type ModelProviderName = 'openrouter' | 'ollama' | 'vllm' | 'endpoint';

/** A model from a provider an app needs: the name its steps use, where it runs, the provider's name for it, what to call it. */
export interface ProviderModel {
  as: string;
  provider: ModelProviderName;
  model: string;
  label: string;
}

/**
 * How it stands here. ready: Custom has it. add: it is added to your models by itself when the app first runs (an
 * OpenRouter model, with OpenRouter's key set). key: OpenRouter's key is needed first. setup: set it up in Settings →
 * Models (pull it into Ollama, download it for vLLM, add the endpoint).
 */
export type ProviderModelState = ProviderModel & { state: 'ready' | 'add' | 'key' | 'setup' };

/** OpenRouter's key, as an app's pages ask for it beside its other keys (it is kept with Settings → Models, not in the vault). */
export const OPENROUTER_KEY = {
  name: 'OPENROUTER_API_KEY',
  label: 'OpenRouter API key',
  url: 'https://openrouter.ai/keys',
  domains: ['openrouter.ai'],
} as const;

const PROVIDERS: ModelProviderName[] = ['openrouter', 'ollama', 'vllm', 'endpoint'];

/** A Custom model's id as a provider's model, when the id says where it runs ("openrouter/x/y", "ollama/qwen3:8b"). */
export function providerOfId(id: string): { provider: ModelProviderName; model: string } | null {
  const m = /^(openrouter|ollama|vllm)\/(.+)$/.exec(id.trim());
  return m ? { provider: m[1] as ModelProviderName, model: m[2] } : null;
}

/** A provider's model by a friendlier name: "google/gemini-2.5-flash" → "gemini-2.5-flash". */
const shortName = (model: string) => model.split('/').pop() || model;

/**
 * The models from a provider a recipe needs, each once: those its recipe names (requires.models, Custom's), and those
 * its steps ask Custom for by an id that says where it runs. A step's model that names no provider is one of Custom's
 * own here, which the install's model picker matches, not this.
 */
export function providerModels(r: Partial<Pick<AppRecipe, 'requires' | 'flow' | 'flows' | 'agent' | 'acpAgent' | 'model'>>): ProviderModel[] {
  const out: ProviderModel[] = [];
  const add = (as: string, provider: ModelProviderName, model: string, label?: string) => {
    if (!as || !model || out.some((x) => x.as === as)) return;
    out.push({ as, provider, model, label: label?.trim() || shortName(model) });
  };
  for (const n of (r.requires as Requires | undefined)?.models ?? [])
    if (n.agent === 'custom') {
      const fromId = providerOfId(n.as);
      const provider = (PROVIDERS as string[]).includes(n.provider ?? '') ? (n.provider as ModelProviderName) : fromId?.provider;
      if (provider) add(n.as, provider, n.model ?? fromId?.model ?? n.as, n.label);
    }
  const custom = (agent?: string, acp?: string) => agent === 'acp' && (!acp || acp === 'console');
  const flows: (Flow | NamedFlow | undefined)[] = [r.flow, ...Object.values(r.flows ?? {})];
  if (custom(r.agent, r.acpAgent) && r.model) {
    const p = providerOfId(r.model);
    if (p) add(r.model, p.provider, p.model);
  }
  for (const f of flows)
    for (const s of f ? allSteps(f.steps) : []) {
      const id = s.do === 'model' ? s.model : s.do === 'agent' && custom(s.agent ?? r.agent, s.acpAgent ?? r.acpAgent) ? (s.model ?? r.model) : undefined;
      const p = id ? providerOfId(id) : null;
      if (id && p) add(id, p.provider, p.model);
    }
  return out;
}
