// What differs between model families: the sampling each maker recommends, a few lines for habits a
// family is known for, the edit format it was trained on, whether it handles several tool calls in one
// reply, and request options (reasoning effort) where the server takes them.
import type { AgentModel } from '../../shared/types.ts';

export interface Sampling {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  min_p?: number;
  repetition_penalty?: number;
}

export interface Family {
  id: string;
  sampling: Sampling;
  /** Lines added to the instructions. */
  notes: string[];
  /** Trained on Codex's apply_patch: it is offered. */
  patch: boolean;
  /** Makes several tool calls in one reply reliably. */
  parallel: boolean;
  /** Takes a reasoning effort on local servers (gpt-oss). */
  effort: boolean;
  /** Its thinking stays in the conversation (MiniMax M2 is trained to see it). */
  keepThinking: boolean;
}

const TOOL_DISCIPLINE = 'Make every tool call through the tool-calling interface. Never write a tool call as text, in a code block, or as JSON in your reply.';

/** The family of a model, from its name. */
export function familyOf(m: Pick<AgentModel, 'id' | 'model' | 'label'>): Family {
  const n = `${m.model} ${m.label} ${m.id}`.toLowerCase();
  const f = (id: string, o: Partial<Family> = {}): Family => ({ id, sampling: {}, notes: [], patch: false, parallel: true, effort: false, keepThinking: false, ...o });
  if (/gpt-oss/.test(n)) return f('gpt-oss', { sampling: { temperature: 1, top_p: 1 }, patch: true, effort: true, notes: ['Your tools are the ones listed here; there is no separate browser or python tool. To run Python, use bash.'] });
  if (/(^|[\s/:])(gpt-[3-9]|gpt-4o|o[1-9](-mini|-pro)?\b|codex|chatgpt)/.test(n)) return f('openai', { patch: true });
  if (/claude|anthropic/.test(n)) return f('claude');
  if (/gemini/.test(n)) return f('gemini');
  if (/gemma/.test(n)) return f('gemma', { sampling: { temperature: 1, top_k: 64, top_p: 0.95, min_p: 0 }, parallel: false, notes: ['Write each tool call exactly in the format given, then stop and wait for its result.'] });
  if (/qwq/.test(n)) return f('qwen', { sampling: { temperature: 0.6, top_p: 0.95, top_k: 40, min_p: 0 } });
  if (/qwen/.test(n)) {
    // Qwen3's thinking models, and the instruct and coder ones, are tuned differently.
    const instruct = /coder|instruct|2507|qwen2/.test(n) && !/thinking/.test(n);
    return f('qwen', { sampling: instruct ? { temperature: 0.7, top_p: 0.8, top_k: 20, repetition_penalty: 1.05 } : { temperature: 0.6, top_p: 0.95, top_k: 20, min_p: 0 }, notes: [TOOL_DISCIPLINE] });
  }
  if (/deepseek/.test(n)) return f('deepseek', { sampling: { temperature: /r1|reason|think/.test(n) ? 0.6 : 0.3, top_p: 0.95 }, notes: [TOOL_DISCIPLINE] });
  // Llama 3 makes one call at a time reliably, several not.
  if (/llama/.test(n)) return f('llama', { sampling: { temperature: 0.6, top_p: 0.9 }, parallel: !/llama-?3|llama3/.test(n), notes: ['Call only the tools listed, by their exact names. When no tool is needed, answer in plain text.'] });
  if (/magistral/.test(n)) return f('mistral', { sampling: { temperature: 0.7, top_p: 0.95 } });
  if (/mistral|mixtral|devstral|codestral|ministral|pixtral/.test(n)) return f('mistral', { sampling: { temperature: 0.15 }, notes: ['Keep replies between tool calls short.'] });
  if (/glm|zhipu|z-ai/.test(n)) return f('glm', { sampling: { temperature: 0.6, top_p: 0.95 }, notes: [TOOL_DISCIPLINE] });
  if (/kimi|moonshot/.test(n)) return f('kimi', { sampling: { temperature: /thinking/.test(n) ? 1 : 0.6 } });
  if (/minimax/.test(n)) return f('minimax', { sampling: { temperature: 1, top_p: 0.95, top_k: 40 }, keepThinking: true });
  if (/grok/.test(n)) return f('grok');
  if (/phi-?\d/.test(n)) return f('phi', { parallel: false });
  return f('other');
}

/** Ids for tool calls in the form every server takes (Mistral's insists on nine letters and digits). */
export function callId(seed?: string): string {
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  if (seed && /^[a-zA-Z0-9]{9}$/.test(seed)) return seed;
  let h = 2166136261;
  const src = seed ?? `${Date.now()}${Math.random()}`;
  let out = '';
  for (let i = 0; i < 9; i++) {
    for (const c of `${src}${i}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    out += abc[h % abc.length];
  }
  return out;
}

/** Sampling and reasoning options for a request, as far as the model's server takes them. */
export function requestOptions(m: AgentModel, fam: Family): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const s = fam.sampling;
  // vLLM already uses the model's own generation settings; others get the maker's recommendation.
  const keys: (keyof Sampling)[] = m.provider === 'openrouter' ? ['temperature', 'top_p', 'top_k', 'min_p', 'repetition_penalty'] : m.provider === 'endpoint' ? ['temperature', 'top_p', 'top_k', 'min_p'] : m.provider === 'ollama' ? ['temperature', 'top_p'] : [];
  for (const k of keys) if (s[k] !== undefined) out[k] = s[k];
  const effort = (process.env.NAGET_AGENT_EFFORT ?? 'medium').toLowerCase();
  if (m.provider === 'openrouter' && m.reasoning && effort !== 'default') out.reasoning = { effort };
  else if (fam.effort && (m.provider === 'vllm' || m.provider === 'ollama') && /^(low|medium|high)$/.test(effort)) out.reasoning_effort = effort;
  return out;
}
