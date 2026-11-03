// The helper model: small jobs the app does with a model outside any session, such as writing memory
// notes after a turn, checking a step in Auto mode, a second opinion, or reading a web page for one
// question. Settings → Models picks it: one of Custom's models, or "auto", which asks Claude's Haiku
// through its CLI (else Codex), like the app's other one-off questions (server/oneshot.ts).
import fs from 'node:fs';
import type { AgentModel } from '../shared/types.ts';
import { chat, type ChatMessage, type Part } from './agent/llm.ts';
import { HttpError } from './auth.ts';
import { kvGet, kvSet, type DB } from './db.ts';
import { AGENT_FILE } from './models/config.ts';
import type { ModelManager } from './models/manager.ts';
import { oneShot } from './oneshot.ts';
import { costOf } from './prices.ts';

export interface HelperAsk {
  system: string;
  prompt: string;
  /** For models that see images (a screenshot); "auto" cannot take them. */
  images?: { data: string; mimeType: string }[];
  /** A model other than the chosen helper, by Custom's model id. */
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
  /** Stops the call (on "auto", its program ends). */
  signal?: AbortSignal;
  /** Told what the call cost, in US dollars, when that is known ($0 on a model on this computer). */
  onCost?: (usd: number) => void;
}

const KEY = 'helper.model';

function customModels(): AgentModel[] {
  try {
    return JSON.parse(fs.readFileSync(AGENT_FILE, 'utf8')).models ?? [];
  } catch {
    return [];
  }
}

/** "auto", or the id of one of Custom's models. */
export const helperModelId = (db: DB): string => kvGet(db, KEY) || 'auto';

export function setHelperModel(db: DB, id: string) {
  if (id !== 'auto' && !customModels().some((m) => m.id === id)) throw new HttpError(400, 'No such model: add it in Settings → Models first');
  kvSet(db, KEY, id);
}

/** What the helper can be: "auto" first, then Custom's models. */
export function helperOptions(db: DB) {
  return {
    model: helperModelId(db),
    options: [
      { value: 'auto', label: 'Automatic', detail: 'Claude Haiku through Claude Code, else Codex' },
      ...customModels().map((m) => ({ value: m.id, label: m.label, detail: m.provider, vision: !!m.vision })),
    ],
  };
}

/** Whether the helper (or the given model) can look at images. */
export function helperSees(db: DB, model?: string): boolean {
  const id = model ?? helperModelId(db);
  return id !== 'auto' && !!customModels().find((m) => m.id === id)?.vision;
}

let manager: ModelManager | null = null;
/** The model manager, to start a vLLM model the helper uses (index.ts sets it). */
export const setHelperModels = (m: ModelManager) => (manager = m);

/** The helper's answer as text. */
export async function helper(db: DB, q: HelperAsk): Promise<string> {
  const id = q.model ?? helperModelId(db);
  const timeout = q.timeoutMs ?? 90_000;
  if (id === 'auto') {
    if (q.images?.length) throw new HttpError(400, 'The helper model cannot see images: pick one that does in Settings → Models');
    try {
      return await oneShot({ system: q.system, prompt: q.prompt, timeoutMs: timeout, signal: q.signal });
    } catch (e) {
      // Neither CLI answered: another helper model needs neither.
      if (e instanceof HttpError && e.status === 502 && !q.signal?.aborted) throw new HttpError(502, `${e.message} Settings → Models → Helper model can use another model.`);
      throw e;
    }
  }
  let m = customModels().find((x) => x.id === id);
  if (!m) throw new HttpError(400, 'The helper model is gone: pick another in Settings → Models');
  if (m.start && manager) m = await manager.ensure(m.id);
  const content: string | Part[] = q.images?.length && m.vision ? [{ type: 'text', text: q.prompt }, ...q.images.map((i): Part => ({ type: 'image_url', image_url: { url: `data:${i.mimeType};base64,${i.data}` } }))] : q.prompt;
  const messages: ChatMessage[] = [
    { role: 'system', content: q.system },
    { role: 'user', content },
  ];
  const signal = q.signal ? AbortSignal.any([AbortSignal.timeout(timeout), q.signal]) : AbortSignal.timeout(timeout);
  const r = await chat(m, { messages, signal, onText: () => {}, onReasoning: () => {}, maxTokens: q.maxTokens });
  if (q.onCost && r.usage) {
    const cached = r.usage.cached ?? 0;
    const tokens = { tokensIn: Math.max(0, r.usage.prompt - cached), tokensCached: cached, tokensOut: r.usage.completion };
    const usd = m.provider === 'ollama' || m.provider === 'vllm' ? 0 : (r.usage.cost ?? costOf(db, m.id, tokens) ?? costOf(db, m.model, tokens));
    if (typeof usd === 'number' && Number.isFinite(usd)) q.onCost(usd);
  }
  return r.text;
}

/** The helper's answer as JSON (the first object in it); `what` names it in the error. */
export async function helperJson<T>(db: DB, q: HelperAsk, what: string): Promise<T> {
  const raw = await helper(db, q);
  try {
    return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) as T;
  } catch {
    throw new HttpError(502, `The helper model did not answer with ${what}`);
  }
}
