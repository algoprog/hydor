/**
 * Word suggestions: the grey rest of the word after the caret (and the next word, dimmer), from a small model of the
 * app's own mixed with Qwen3.5-0.8B, both running on this computer (docs/plans/word-suggestions.md).
 */

/** Where a suggestion is asked for: a message to an agent, a document, or any other text box. */
export type SuggestSurface = 'chat' | 'doc' | 'text';

/** POST /api/suggest */
export interface SuggestRequest {
  surface: SuggestSurface;
  /** The text before the caret (the client sends at most its last 2,000 characters). */
  text: string;
  /** chat: the agent's last reply (its last 2,000 characters). */
  reply?: string;
  /** chat: the person's previous message in this session (its last 2,000 characters). */
  prev?: string;
  /** doc: the document's text before the caret's paragraph (its last 2,000 characters). */
  doc?: string;
  /** chat: the session's key (its earlier text feeds the session cache). */
  session?: string;
  /** This browser tab's id: a new request cancels the tab's one before. */
  client?: string;
}

/** A suggestion, or nothing to show (show false). */
export interface SuggestResponse {
  /** The rest of the word being typed ('' when the word is complete). */
  word: string;
  /** The word after it, with its leading space ('' when none). */
  next: string;
  /** How sure: the chance that `word` is right (0..1), and that `next` is, given `word`. */
  conf: number;
  confNext: number;
  /** Whether to show `word`, and `next` after it (the confidence against the threshold for the precision set). */
  show: boolean;
  showNext: boolean;
  /** mix: both models; llm: Qwen3.5 alone; slm: the small model alone. */
  plan?: 'mix' | 'llm' | 'slm';
  /** The language guessed (a FLORES code such as eng_Latn), when it was sure. */
  lang?: string;
  /** Time taken on the server (ms). */
  ms?: number;
}

export type SuggestLlmMode = 'auto' | 'on' | 'off';
export type SuggestSchedule = 'nightly' | 'weekly' | 'manual';

/** The settings, kept on the server (GET and PUT /api/suggest). */
export interface SuggestSettings {
  /** On or off. On from the start: it sets itself up the first time a message box is used (downloading about 1.3 GB then). */
  enabled: boolean;
  /** Qwen3.5-0.8B beside the small model: auto (when the computer has the memory), on, or off. */
  llm: SuggestLlmMode;
  /** The language model's size: 8-bit (better) or 4-bit (smaller, a little worse). */
  quant: 'q8' | 'q4';
  /** How sure a suggestion must be to show: the share of shown suggestions meant to be right (0.3 more of them … 0.5 surer ones). */
  precision: number;
  /** Show the next word too, dimmer. */
  nextWord: boolean;
  /** Where suggestions show. */
  where: { chat: boolean; docs: boolean; notes: boolean; other: boolean };
  /** Words of the typed text read before the caret. */
  typedWords: number;
  /** Words of the agent's last reply (in a message) or of the document before the paragraph (in Docs) read. */
  contextWords: number;
  /** Choose per language between Qwen3.5 alone and the mix (from the language of the text). */
  switchByLanguage: boolean;
  /** Learn from the session's earlier text as it is typed (messages). */
  sessionCache: boolean;
  /** Threads for suggestions (0: chosen from the computer's cores). */
  threads: number;
  /** Personalise the small model on what this person writes. */
  personalise: boolean;
  schedule: SuggestSchedule;
  /** What it learns from. */
  sources: { messages: boolean; replies: boolean; notes: boolean; docs: boolean };
  /** How much more the person's own typed words count than the rest (1..16). */
  userWeight: number;
  /** Threads for personalising (0: chosen from the computer's cores). */
  trainThreads: number;
}

export const SUGGEST_DEFAULTS: SuggestSettings = {
  enabled: true,
  llm: 'auto',
  quant: 'q8',
  precision: 0.3,
  nextWord: true,
  where: { chat: true, docs: true, notes: true, other: true },
  typedWords: 100,
  contextWords: 100,
  switchByLanguage: true,
  sessionCache: true,
  threads: 0,
  personalise: true,
  schedule: 'nightly',
  sources: { messages: true, replies: true, notes: true, docs: true },
  userWeight: 4,
  trainThreads: 0,
};

/** The limits of the numeric settings (inclusive). */
export const SUGGEST_LIMITS = {
  precision: [0.3, 0.6],
  typedWords: [20, 200],
  contextWords: [0, 200],
  threads: [0, 32],
  userWeight: [1, 16],
  trainThreads: [0, 64],
} as const;

/**
 * What suggestions did, as counts only (never any text). `shown`: suggestions shown (one grey word at the caret; the
 * next word becoming the grey word is a new one). `taken`: inserted with Tab or → (→ takes the word and the next: two).
 * `typedThrough`: the person typed the whole grey word themselves. Right is taken + typedThrough; `wrong`: something
 * else was typed while it showed (a different letter, Backspace). `saved`: for each Tab or →, the characters inserted
 * minus the key pressed. `typedChars`: what was typed in boxes where suggestions are on (never what Tab inserted).
 */
export interface SuggestCounts {
  shown: number;
  taken: number;
  typedThrough: number;
  wrong: number;
  saved: number;
  typedChars: number;
}

export const SUGGEST_COUNT_KEYS = ['shown', 'taken', 'typedThrough', 'wrong', 'saved', 'typedChars'] as const satisfies readonly (keyof SuggestCounts)[];

/** The most one POST /api/suggest/usage may add to each count. */
export const SUGGEST_USAGE_CAP = 5000;

/** How many local days of counts are kept (today and the 30 before). */
export const SUGGEST_USAGE_DAYS = 31;

/** The counts since `since` (ms), today (the local day) and the last 7 days (today and the 6 before). */
export interface SuggestUsage {
  since: number;
  total: SuggestCounts;
  today: SuggestCounts;
  week: SuggestCounts;
}

/** What word suggestions are doing (GET /api/suggest). */
export interface SuggestStatus {
  /**
   * off: turned off; waiting: on but never used here, so nothing is downloaded yet (it sets itself up the first time a box
   * where it shows gets the focus); setting-up: installing Python libraries and downloading models; starting: loading
   * them; ready; failed.
   */
  state: 'off' | 'waiting' | 'setting-up' | 'starting' | 'ready' | 'failed';
  /** Progress while setting up, or why it failed. */
  detail?: string;
  /**
   * Qwen3.5-0.8B: running, not running (and why: turned off, too little memory, failed), or starting. Too little
   * memory: totalMb when the computer itself has too little (needMb: what a computer needs), freeMb when too little is free now (needMb: what it needs free).
   */
  llm: { state: 'off' | 'starting' | 'ready' | 'memory' | 'failed'; detail?: string; freeMb?: number; totalMb?: number; needMb?: number };
  /** The small model in use: the one that came with the app, or the one personalised on this computer. */
  model: { kind: 'base' | 'personal'; trainedAt?: number; tokens?: number; languages?: Record<string, number> };
  /** Personalising: idle, waiting for its time (next), running (progress), or the last one failed. */
  training: {
    state: 'idle' | 'waiting' | 'running' | 'failed';
    progress?: { done: number; total: number };
    startedAt?: number;
    lastAt?: number;
    next?: number;
    detail?: string;
  };
  /** Requests answered since the worker started, and their time (ms). */
  stats?: { requests: number; p50Ms?: number; p90Ms?: number };
  /** How many keystrokes suggestions saved and how many were right (counts kept on the server; Reset starts them again). */
  usage: SuggestUsage;
}

/** GET and PUT /api/suggest */
export interface SuggestState {
  settings: SuggestSettings;
  status: SuggestStatus;
}
