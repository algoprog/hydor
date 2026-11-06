// What the page editor's AI sends and gets back (server/write/page-ai.ts), as Notion AI does it on a page: the words or
// blocks picked (or the page itself) written on, rewritten, summed up, translated or explained by the helper model,
// whose answer comes back as Markdown that the editor shows in place as blocks to keep or throw away. And a database's
// AI column: a cell the helper model fills from the row's other cells.

/** What the AI is asked to do on a page. */
export type PageAiAction =
  | 'continue'
  | 'write'
  | 'summarize'
  | 'shorter'
  | 'longer'
  | 'improve'
  | 'fix'
  | 'simplify'
  | 'tone'
  | 'translate'
  | 'explain'
  | 'table'
  | 'list'
  | 'brainstorm'
  | 'actions'
  | 'ask';

export const PAGE_AI_ACTIONS: PageAiAction[] = ['continue', 'write', 'summarize', 'shorter', 'longer', 'improve', 'fix', 'simplify', 'tone', 'translate', 'explain', 'table', 'list', 'brainstorm', 'actions', 'ask'];

/** The tones "Change the tone" offers. */
export const PAGE_AI_TONES = ['professional', 'casual', 'straightforward', 'confident', 'friendly'] as const;
export type PageAiTone = (typeof PAGE_AI_TONES)[number];

/** The most words sent at once (characters): what is picked, and the page around it. */
export const PAGE_AI_MAX = 24_000;

export interface PageAiAsk {
  action: PageAiAction;
  /** The words or blocks picked, as Markdown (empty: the action is about the page, or writes something new). */
  text?: string;
  /** The page up to where the answer goes, as Markdown (for Continue writing, and for the sense). */
  before?: string;
  /** The whole page as Markdown, when the action is about the page (Summarize, Action items with nothing picked). */
  page?: string;
  /** The page's title. */
  title?: string;
  /** What to write about, list, tabulate or brainstorm (Write about…, Make a list of…). */
  topic?: string;
  tone?: PageAiTone;
  /** translate: the language, by its English name. */
  lang?: string;
  /** ask: the person's own request; with `answer`, what to change in it. */
  ask?: string;
  /** A follow-up: the answer given before, to change as `ask` says. */
  answer?: string;
  /** A page of the Library: a confidential session's is written on by a helper model on this computer only. */
  pageId?: string;
}

export interface PageAiAnswer {
  /** The answer as Markdown: the editor makes blocks of it. */
  markdown: string;
  /** The model that wrote it. */
  model?: string;
  /** What it cost in US dollars, when that is known and more than nothing. */
  cost?: number;
}

/** How a database's AI column fills its cells. */
export type DbAiHow = 'summarize' | 'extract' | 'classify' | 'translate' | 'custom';
export const DB_AI_HOWS: DbAiHow[] = ['summarize', 'extract', 'classify', 'translate', 'custom'];

export interface DbAiAsk {
  how: DbAiHow;
  /** extract: what to take out ("the company’s name"); custom: the instruction; translate: which column (optional). */
  prompt?: string;
  /** translate: the language. */
  lang?: string;
  /** classify: the options to pick from. */
  options?: string[];
  /** The column being filled. */
  column: string;
  /** The row's other cells, by column name, as words. */
  row: Record<string, string>;
  pageId?: string;
}

export interface DbAiAnswer {
  value: string;
  model?: string;
  cost?: number;
}
