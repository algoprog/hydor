// Models the app's own agent (Console) can run: OpenRouter's catalog, an Ollama server, models from
// Hugging Face that vLLM serves here, and any OpenAI-compatible endpoint. Keys stay on the server, in
// a file only this user can read; the agent process reads the models it may use from agent.json.
import fs from 'node:fs';
import path from 'node:path';
import type { AgentModel } from '../../shared/types.ts';
import { config } from '../config.ts';

export const MODELS_DIR = path.join(config.dataDir, 'models');
export const HF_DIR = path.join(MODELS_DIR, 'hf');
export const LOG_DIR = path.join(MODELS_DIR, 'logs');
/** What the agent process reads: the models it can use and how to reach each. */
export const AGENT_FILE = path.join(MODELS_DIR, 'agent.json');
const CONFIG_FILE = path.join(MODELS_DIR, 'config.json');

export interface Endpoint {
  id: string;
  name: string;
  /** An OpenAI-compatible API, e.g. http://localhost:1234/v1 */
  baseUrl: string;
  apiKey?: string;
}

export interface ModelsConfig {
  openrouter: { apiKey?: string; pinned: string[] };
  ollama: { url: string };
  /** The vllm command; found by itself (PATH, conda environments) when not set. */
  vllm: { command?: string };
  endpoints: Endpoint[];
  hfToken?: string;
}

const DEFAULTS: ModelsConfig = { openrouter: { pinned: [] }, ollama: { url: 'http://127.0.0.1:11434' }, vllm: {}, endpoints: [] };

export function loadConfig(): ModelsConfig {
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Partial<ModelsConfig>;
    return {
      openrouter: { pinned: [], ...c.openrouter },
      ollama: { ...DEFAULTS.ollama, ...c.ollama },
      vllm: { ...c.vllm },
      endpoints: Array.isArray(c.endpoints) ? c.endpoints : [],
      hfToken: c.hfToken,
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

/** Written whole, readable by this user only (it holds API keys). */
function writePrivate(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export const saveConfig = (c: ModelsConfig) => writePrivate(CONFIG_FILE, c);
export const writeAgentModels = (models: AgentModel[]) => writePrivate(AGENT_FILE, { models, at: Date.now() });

/** "sk-or-…a1b2": enough to tell keys apart, never the key. */
export const keyHint = (k?: string) => (k ? `${k.slice(0, 5)}…${k.slice(-4)}` : undefined);
