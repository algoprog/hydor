// The models an app needs from a provider (shared/app-models.ts), as they stand here: Custom has it, it can be added
// by itself (an OpenRouter model, once OpenRouter's key is set: added to Settings → Models when the app first runs),
// OpenRouter's key is needed first (asked for beside the app's other keys, and kept with Settings → Models), or it is
// set up by hand (a model for Ollama, vLLM or an endpoint, which a run is refused without, saying where).
import type { AppRecipe } from '../../shared/apps.ts';
import { OPENROUTER_KEY, providerModels, type ProviderModelState } from '../../shared/app-models.ts';
import type { AgentModel } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import type { ModelManager } from '../models/manager.ts';

type Recipe = Partial<Pick<AppRecipe, 'name' | 'requires' | 'flow' | 'flows' | 'agent' | 'acpAgent' | 'model'>>;

/** What the apps need of Settings → Models: Custom's models, whether OpenRouter has its key, and setting it or adding a model. */
export type ModelsHere = Pick<ModelManager, 'agentModels' | 'hasOpenRouterKey' | 'configure'>;
let here: ModelsHere | null = null;
export const setModelsHere = (m: ModelsHere | null) => {
  here = m;
};

const WHERE: Record<string, string> = { ollama: 'pull it into Ollama', vllm: 'download it for vLLM', endpoint: 'add the endpoint that serves it' };

/** Each model from a provider the recipe needs, with how it stands here. */
export function modelStates(r: Recipe): ProviderModelState[] {
  const needs = providerModels(r);
  if (!needs.length) return [];
  const have: AgentModel[] = here?.agentModels() ?? [];
  const key = here?.hasOpenRouterKey() ?? false;
  return needs.map((n) => {
    if (have.some((m) => m.id === n.as || (m.provider === n.provider && m.model === n.model))) return { ...n, state: 'ready' };
    if (n.provider === 'openrouter') return { ...n, state: key ? 'add' : 'key' };
    return { ...n, state: 'setup' };
  });
}

/** Refuses a run whose models must be set up by hand first, saying which and how (OpenRouter's key is asked for as a key). */
export function needModels(r: Recipe) {
  const miss = modelStates(r).filter((m) => m.state === 'setup');
  if (!miss.length) return;
  const what = miss.map((m) => `${m.label} (${WHERE[m.provider] ?? 'set it up'})`).join(', ');
  throw new HttpError(409, `${r.name ?? 'This app'} needs ${miss.length > 1 ? 'these models' : 'a model'} first, in Settings → Models: ${what}.`, { models: miss });
}

/** Adds the OpenRouter models a run needs that Custom does not have yet (OpenRouter's key is set). */
export async function addModels(r: Recipe): Promise<string[]> {
  const add = modelStates(r).filter((m) => m.state === 'add');
  for (const m of add) await here!.configure({ pin: m.model });
  return add.map((m) => m.label);
}

/** OpenRouter's key as one of the keys an app needs, when its models run there (null when they don't). */
export function providerKey(r: Recipe): { name: string; label: string; help: string; url: string; domains: string[]; have: boolean; provider: 'openrouter' } | null {
  const via = providerModels(r).filter((n) => n.provider === 'openrouter');
  if (!via.length) return null;
  const names = via.map((n) => n.label).join(', ');
  return {
    name: OPENROUTER_KEY.name,
    label: OPENROUTER_KEY.label,
    help: `It runs ${names} through OpenRouter. The key is kept in Settings → Models, for your other apps and Custom too.`,
    url: OPENROUTER_KEY.url,
    domains: [...OPENROUTER_KEY.domains],
    have: here?.hasOpenRouterKey() ?? false,
    provider: 'openrouter',
  };
}

/** Keeps OpenRouter's key given for an app where Custom's models find it (Settings → Models). */
export function saveProviderKey(value: string) {
  if (!here) throw new HttpError(503, 'Settings → Models is not ready yet');
  // The key is saved at once; the model list is read again in the background.
  void here.configure({ openrouterKey: value }).catch(() => {});
}
