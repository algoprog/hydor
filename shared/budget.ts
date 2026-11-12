// Spending caps: what the server and the pages share about a session's cap and what it has spent.

/** Where a session stands against its spending cap (GET /api/budget/:key, and `budget` feature events). */
export interface BudgetState {
  key: string;
  /** The session's own cap, in US dollars; none when unset. */
  capUsd?: number;
  /** What counts against the cap, at API prices: the session's own spending and its Hydor subagents'. */
  spentUsd: number;
  ownUsd: number;
  childrenUsd: number;
  /** Some of its tokens have no known price, so it may have spent more. */
  unpriced?: boolean;
  /** The cap is reached: new messages wait until it is raised or cleared. */
  reached: boolean;
  /** A Hydor subagent's parent, whose cap covers it too. */
  parent?: { key: string; title: string; capUsd: number; spentUsd: number; reached: boolean };
}

/** A note of kind "budget": a turn stopped at a spending cap. */
export interface BudgetNote {
  capUsd: number;
  spentUsd: number;
  /** It was the parent's cap (this is one of its Hydor subagents). */
  parent?: { key: string; title: string };
}

/** A cap as typed ("5", "$12.50"): null for no cap, or null overall when it is not an amount (a cent to $100,000). */
export function parseCap(v: unknown): { cap: number | null } | null {
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim())) return { cap: null };
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0.01 || n > 100_000) return null;
  return { cap: Math.round(n * 100) / 100 };
}

/** Dollars as people read them: "$0.42", "$12.50", "$1,204". */
export function usd(n: number): string {
  if (n >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (n > 0 && n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
