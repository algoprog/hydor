// The models the app suggests before you search for any: those to run on this computer, shown by what it can run
// (GET /api/models/picks says which, and how each would run), and those through OpenRouter, each for one kind of
// work. The welcome tour and Settings → Models show them; anything else is a search away.
import type { ModelFit } from './types.ts';

/** A model to run on this computer, as people read about it before they pick one. */
export interface LocalPick {
  /** Its Hugging Face repository: what downloads, for vLLM. */
  repo: string;
  name: string;
  maker: string;
  /** What it is good for, in a few plain words. */
  blurb: string;
  /** It reads pictures too. */
  vision?: boolean;
  /** Billions of parameters (its size), all of them. */
  params: number;
  /** Billions of parameters each word reads, when fewer (a mixture of experts): it runs faster than its size says. */
  active?: number;
  /** Its weights are for Apple silicon (MLX): it is suggested on Macs alone. */
  mac?: boolean;
  /** The same model for a computer without vLLM (no NVIDIA graphics, no Mac): a GGUF build Ollama pulls. */
  gguf?: string;
}

/** Smallest first: each is suggested where it runs well (server/models/picks.ts). */
export const LOCAL_PICKS: LocalPick[] = [
  {
    repo: 'LiquidAI/LFM3-VL-2B',
    name: 'LFM3-VL 2B',
    maker: 'Liquid AI',
    blurb: 'Small and quick, and it reads pictures. Runs on almost any computer.',
    vision: true,
    params: 1.9,
    gguf: 'hf.co/LiquidAI/LFM3-VL-2B-GGUF:Q4_K_M',
  },
  {
    repo: 'google/gemma-4-12B-it',
    name: 'Gemma 4 12B',
    maker: 'Google',
    blurb: 'A capable all-rounder that reads pictures, for a computer with a good graphics card.',
    vision: true,
    params: 12,
    gguf: 'hf.co/google/gemma-4-12B-it-qat-q4_0-gguf',
  },
  {
    repo: 'RecursiveSI/flint-int4',
    name: 'Flint',
    maker: 'Recursive',
    blurb: 'Made for coding agents, and quick for its size, on a Mac with Apple silicon and 32 GB or more.',
    params: 39.8,
    active: 2.5,
    mac: true,
  },
  {
    repo: 'zai-org/GLM-5.3-Flash',
    name: 'GLM-5.3 Flash',
    maker: 'Z.ai',
    blurb: 'Among the strongest open models, for a server with several large graphics cards.',
    vision: true,
    params: 321,
  },
];

/** A suggested model as it is for this computer. */
export interface LocalPickView extends LocalPick {
  /** What to install: its weights for vLLM (repo), or, where vLLM cannot run, a build for Ollama (ollama). */
  install?: { repo: string } | { ollama: string };
  /** How it would run here (needs, speed). */
  fit: ModelFit;
  /** It runs on this computer: the tour suggests it. */
  runs: boolean;
  /** The one to start with here: the strongest that runs well. */
  best?: boolean;
  /** The download, in bytes. */
  sizeBytes: number;
  /** On this computer already: its id in the models' list. */
  have?: string;
  /** Downloading: its download's key. */
  coming?: string;
  /** What this computer lacks to run it, in a few words, when it does not run here. */
  needs?: string;
  /** What runs it here is set up (vLLM installed and new enough for it, or Ollama running): else Settings → Models
   * sets that up, and a download meanwhile waits for it. */
  ready: boolean;
}

/** What each OpenRouter model is suggested for: Custom's model (text), or the model for pictures, music, voices or videos. */
export type OpenRouterRole = 'text' | 'image' | 'music' | 'speech' | 'video';

export interface OpenRouterPick {
  id: string;
  role: OpenRouterRole;
  /** Why this one, in a few words. */
  note: string;
}

/** The OpenRouter models shown first, before any search. */
export const OPENROUTER_PICKS: OpenRouterPick[] = [
  { id: 'openai/gpt-6-luna', role: 'text', note: 'Fast and cheap' },
  { id: 'x-ai/grok-4.7', role: 'text', note: 'Good, with fewer refusals' },
  { id: 'openai/gpt-6.1-sol', role: 'text', note: 'Better' },
  { id: 'anthropic/claude-opus-5.5', role: 'text', note: 'Best overall' },
  { id: 'bytedance-seed/seedream-5-0-pro', role: 'image', note: 'Makes and edits pictures' },
  { id: 'bytedance-seed/seedream-5-0-flash', role: 'image', note: 'Pictures, quicker and cheaper' },
  { id: 'google/lyria-3-pro-preview', role: 'music', note: 'Songs and music' },
  { id: 'bytedance-seed/seed-audio-1-0', role: 'speech', note: 'Voices and sounds' },
  { id: 'bytedance/seedance-2.5', role: 'video', note: 'Short videos' },
];

/** A picture model suggested for one kind of picture, and why. */
export interface ImagePick {
  id: string;
  note: string;
}

/**
 * The models suggested for Quick pictures (icons, backgrounds, textures, simple pictures), cheapest kinds first: with
 * no Quick model picked in Settings → Images, video and audio, the first of these OpenRouter still lists is used.
 */
export const QUICK_PICKS: ImagePick[] = [
  { id: 'bytedance-seed/seedream-5-0-flash', note: 'Quick and cheap, and it changes pictures too' },
  { id: 'google/gemini-3.1-flash-lite-image', note: 'Quick, and good with words in a picture' },
  { id: 'recraft/recraft-v4.1-flash', note: 'Flat, clean pictures for very little' },
  { id: 'black-forest-labs/flux-3-image-klein', note: 'Quick, photo-like pictures' },
  { id: 'openai/gpt-image-1-mini', note: 'See-through backgrounds' },
];

/** For a see-through background when the tier's own model cannot make one: the first of these OpenRouter still lists. */
export const SEE_THROUGH_PICKS: Record<'quick' | 'best', string[]> = {
  quick: ['openai/gpt-image-1-mini', 'sourceful/riverflow-v2.5-fast'],
  best: ['openai/gpt-image-2.6-flare', 'sourceful/riverflow-v2.5-fast'],
};

/** Drawings (SVG) at Best: Recraft's vector models, the first OpenRouter still lists. */
export const VECTOR_PICKS = ['recraft/recraft-v4.1-vector', 'recraft/recraft-v4.1-pro-vector', 'recraft/recraft-v4-vector'];
