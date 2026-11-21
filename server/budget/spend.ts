// What a session has spent, at API prices: the agent's own figure when its transcript has one (Claude
// Code's cost, Custom's per call), else its tokens at the model's price (server/prices.ts). A model on
// this machine costs nothing. A session's cap covers the Hydor subagents it started too. While a turn
// runs, the model calls its agent reports come in ahead of the indexer: see setLiveSpend.
import type { BudgetState } from '../../shared/budget.ts';
import type { Agent, SessionStats } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { CALL_BUCKET_MS, claudeCost } from '../history/claude.ts';
import { costOf } from '../prices.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { childKeys, parentOf } from '../children/family.ts';

interface Row {
  key?: string;
  agent: Agent;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  tokens_cached: number;
  cost_usd: number | null;
  parent_key: string | null;
  /** Claude Code, a transcript with a saved total: when it was saved (ms). */
  cost_at?: number | null;
  /** Claude Code, a subagent's transcript: its model calls by 10-second bucket, [[bucket, in, cached, out], …]. */
  calls?: string | null;
}

/** One transcript's cost in dollars; null when its tokens have no known price. */
export function rowCost(db: DB, r: Row): number | null {
  if (r.cost_usd != null) return r.cost_usd;
  if (!r.tokens_in && !r.tokens_out && !r.tokens_cached) return 0;
  const model = r.model ?? '';
  const t = { tokensIn: r.tokens_in, tokensCached: r.tokens_cached, tokensOut: r.tokens_out };
  if (r.agent === 'acp') {
    // Custom's model ids say where they run: ollama/…, vllm/… (here, free), endpoint/<id>/<model>, openrouter/<model>.
    if (/^(ollama|vllm)\//.test(model)) return 0;
    if (model.startsWith('openrouter/')) return costOf(db, model, t);
    return costOf(db, model, t) ?? costOf(db, model.replace(/^(endpoint\/[^/]+|openrouter)\//, ''), t);
  }
  return costOf(db, model, t);
}

/** What one model call cost, as the agent reported it: its own figure, else its tokens at the model's price. */
export function callCost(db: DB, agent: Agent, model: string | undefined, c: { usd?: number; tokens?: { in: number; cached: number; out: number } }): number | null {
  if (c.usd !== undefined) return c.usd;
  const t = c.tokens ?? { in: 0, cached: 0, out: 0 };
  return rowCost(db, { agent, model: model ?? null, tokens_in: t.in, tokens_out: t.out, tokens_cached: t.cached, cost_usd: null, parent_key: null });
}

/** A session's own spending as best known: the indexer's figure, or more when its running turn has spent more than that already. */
let liveSpend: (key: string, indexed: number) => number = (_key, indexed) => indexed;
export const setLiveSpend = (fn: typeof liveSpend) => (liveSpend = fn);

/**
 * What a Claude Code subagent spent after its lead's highest saved total was written, in dollars (null: nothing known to
 * add). That total covers the subagents' calls up to the moment it was saved and none after, so the calls after it are
 * priced here. A call is placed by its 10-second bucket, and only buckets wholly after the moment count: a call in the
 * bucket the moment falls in is left out rather than counted twice. A row with no moment, no calls or a model with no
 * price adds nothing.
 */
function afterSavedTotal(db: DB, lead: Row, sub: Row): number {
  if (lead.cost_at == null || !sub.calls) return 0;
  let calls: unknown;
  try {
    calls = JSON.parse(sub.calls);
  } catch {
    return 0;
  }
  if (!Array.isArray(calls)) return 0;
  const first = Math.floor(lead.cost_at / CALL_BUCKET_MS);
  const t = { tokensIn: 0, tokensCached: 0, tokensOut: 0 };
  for (const c of calls) {
    if (!Array.isArray(c) || !(c[0] > first)) continue;
    t.tokensIn += Number(c[1]) || 0;
    t.tokensCached += Number(c[2]) || 0;
    t.tokensOut += Number(c[3]) || 0;
  }
  if (!t.tokensIn && !t.tokensCached && !t.tokensOut) return 0;
  return costOf(db, sub.model ?? '', t) ?? 0;
}

/** A session's own spending: its transcript, and its agent's own subagents' (Claude's, Codex's sub-agent threads). */
export function ownSpend(db: DB, key: string): { usd: number; unpriced: boolean } {
  const rows = db.prepare('select key, agent, model, tokens_in, tokens_out, tokens_cached, cost_usd, parent_key, cost_at, calls from sessions where key = ? or parent_key = ?').all(key, key) as Row[];
  // Claude Code's own figure covers its subagents, up to when it was saved: their calls after that are added.
  const lead = rows.find((r) => !r.parent_key && r.cost_usd != null && r.agent === 'claude');
  let usd = 0;
  let unpriced = false;
  for (const r of rows) {
    if (lead && r.parent_key) {
      usd += afterSavedTotal(db, lead, r);
      continue;
    }
    const c = rowCost(db, r);
    if (c == null) unpriced = true;
    else usd += c;
  }
  return { usd, unpriced };
}

/** What a session's summary says it spent (the agent's own figure and the tokens counted since it, else the tokens at the model's price); null when not priced. */
export function statsCost(db: DB, stats: SessionStats, model: string | null | undefined): number | null {
  return stats.costUsd ? claudeCost(db, stats, model ?? undefined) : costOf(db, model, stats);
}

/**
 * What a session has spent, for what has its summary at hand (a scheduled run, an app's run): what spending() says once its
 * transcript is indexed (the figure the caps count, with its subagents' calls and the calls after the agent's saved total),
 * else its summary's stats. Null when nothing is priced.
 */
export function spentSoFar(db: DB, key: string | undefined, s: { stats: SessionStats; model?: string | null } | null): number | null {
  if (key && db.prepare('select 1 from sessions where key = ?').get(key)) {
    const sp = spending(db, key);
    if (sp.spentUsd > 0 || !sp.unpriced) return sp.spentUsd;
  }
  return s ? statsCost(db, s.stats, s.model) : null;
}

/** The session's spending cap in dollars, if it has one. */
export function capOf(db: DB, key: string): number | undefined {
  const c = sessionExtra(db, key).capUsd;
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : undefined;
}

/** What counts against a session's cap: its own spending and its Hydor subagents'. */
export function spending(db: DB, key: string): { spentUsd: number; ownUsd: number; childrenUsd: number; unpriced: boolean } {
  const own = ownSpend(db, key);
  const ownUsd = liveSpend(key, own.usd);
  let kids = 0;
  let unpriced = own.unpriced;
  for (const k of childKeys(db, key)) {
    const c = ownSpend(db, k);
    kids += liveSpend(k, c.usd);
    unpriced ||= c.unpriced;
  }
  return { spentUsd: ownUsd + kids, ownUsd, childrenUsd: kids, unpriced };
}

/** A cap that is reached: the session's own, or (for a Hydor subagent) its parent's, which covers it too. */
export function capReached(db: DB, key: string): { key: string; capUsd: number; spentUsd: number } | null {
  for (const k of [key, parentOf(db, key)]) {
    if (!k) continue;
    const cap = capOf(db, k);
    if (cap == null) continue;
    const spent = spending(db, k).spentUsd;
    if (spent >= cap) return { key: k, capUsd: cap, spentUsd: spent };
  }
  return null;
}

/** Where a session stands against its cap (and its parent's), for the pages. */
export function budgetState(db: DB, key: string, titleOf: (key: string) => string): BudgetState {
  const sp = spending(db, key);
  const cap = capOf(db, key);
  const out: BudgetState = { key, capUsd: cap, spentUsd: sp.spentUsd, ownUsd: sp.ownUsd, childrenUsd: sp.childrenUsd, unpriced: sp.unpriced || undefined, reached: cap != null && sp.spentUsd >= cap };
  const p = parentOf(db, key);
  const pcap = p ? capOf(db, p) : undefined;
  if (p && pcap != null) {
    const spent = spending(db, p).spentUsd;
    out.parent = { key: p, title: titleOf(p), capUsd: pcap, spentUsd: spent, reached: spent >= pcap };
  }
  return out;
}

/**
 * The cap a new Hydor subagent of `parent` gets: an equal share of what is left of the parent's cap,
 * kept for the parent and as many children as may run at once. None when the parent has no cap; an
 * error when nothing is left.
 */
export function childShare(db: DB, parent: string, slots: number): number | undefined {
  const cap = capOf(db, parent);
  if (cap == null) return undefined;
  const spent = spending(db, parent).spentUsd;
  const left = cap - spent;
  if (left < 0.01) throw new Error(`This session's spending cap is reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}): there is nothing left for a Hydor subagent. Finish with what you have, or ask the user to raise the cap.`);
  return Math.max(0.01, Math.floor((left / (slots + 1)) * 100) / 100);
}
