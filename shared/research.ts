// Deep research: a session started in this mode plans the searches a question needs, sends researchers
// (its child sessions) after each part, digs into what they leave open, cross-checks the claims, and
// delivers a cited report as a page or a Word document. What the server and the pages share.

export interface ResearchSettings {
  /** Researchers searching at once, in each round (breadth). */
  breadth: number;
  /** Rounds of research, each going after what the last left open (depth); a checking round comes after. */
  depth: number;
  /** Most web searches in all: the lead's and its researchers' together (the query budget). */
  queries: number;
  /** What it delivers. */
  format: 'page' | 'document';
}

export const RESEARCH_DEFAULTS: ResearchSettings = { breadth: 4, depth: 2, queries: 60, format: 'page' };

export const RESEARCH_LIMITS = { breadth: [1, 8], depth: [1, 5], queries: [10, 500] } as const;

const within = (v: unknown, [lo, hi]: readonly [number, number], d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};

/** Settings as typed or kept, within their limits. */
export function cleanResearch(raw: unknown): ResearchSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    breadth: within(r.breadth, RESEARCH_LIMITS.breadth, RESEARCH_DEFAULTS.breadth),
    depth: within(r.depth, RESEARCH_LIMITS.depth, RESEARCH_DEFAULTS.depth),
    queries: within(r.queries, RESEARCH_LIMITS.queries, RESEARCH_DEFAULTS.queries),
    format: r.format === 'document' ? 'document' : 'page',
  };
}

/** A session's research settings, when it leads a deep research. */
export const researchOf = (extra: { research?: unknown } | null | undefined): ResearchSettings | null =>
  extra?.research && typeof extra.research === 'object' ? cleanResearch(extra.research) : null;

/** GET /api/research/:key: where a deep research stands. */
export interface ResearchState {
  key: string;
  settings: ResearchSettings;
  /** Web searches so far, by the lead and its researchers. */
  used: number;
  /** Rounds begun (each a batch of researchers started while none was at work). */
  rounds: number;
  researchers: string[];
}
