// What a session has spent, at API prices: the agent's own figure when its transcript has one (Claude
// Code's cost, Custom's per call), else its tokens at the model's price (server/prices.ts). A model on
// this machine costs nothing. A session's cap covers the child sessions it started too.
import type { BudgetState } from '../../shared/budget.ts';
import type { Agent } from '../../shared/types.ts';
import type { DB } from '../db.ts';
import { costOf } from '../prices.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { childKeys, parentOf } from '../children/family.ts';

interface Row {
  agent: Agent;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  tokens_cached: number;
  cost_usd: number | null;
  parent_key: string | null;
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
    return costOf(db, model, t) ?? costOf(db, model.replace(/^(endpoint\/[^/]+|openrouter)\//, ''), t);
  }
  return costOf(db, model, t);
}

/** A session's own spending: its transcript, and its agent's own helpers' (Claude's subagents, Codex's sub-agent threads). */
export function ownSpend(db: DB, key: string): { usd: number; unpriced: boolean } {
  const rows = db.prepare('select agent, model, tokens_in, tokens_out, tokens_cached, cost_usd, parent_key from sessions where key = ? or parent_key = ?').all(key, key) as Row[];
  // Claude Code's own figure covers its subagents.
  const whole = rows.some((r) => !r.parent_key && r.cost_usd != null && r.agent === 'claude');
  let usd = 0;
  let unpriced = false;
  for (const r of rows) {
    if (whole && r.parent_key) continue;
    const c = rowCost(db, r);
    if (c == null) unpriced = true;
    else usd += c;
  }
  return { usd, unpriced };
}

/** The session's spending cap in dollars, if it has one. */
export function capOf(db: DB, key: string): number | undefined {
  const c = sessionExtra(db, key).capUsd;
  return typeof c === 'number' && Number.isFinite(c) && c > 0 ? c : undefined;
}

/** What counts against a session's cap: its own spending and its children's. */
export function spending(db: DB, key: string): { spentUsd: number; ownUsd: number; childrenUsd: number; unpriced: boolean } {
  const own = ownSpend(db, key);
  let kids = 0;
  let unpriced = own.unpriced;
  for (const k of childKeys(db, key)) {
    const c = ownSpend(db, k);
    kids += c.usd;
    unpriced ||= c.unpriced;
  }
  return { spentUsd: own.usd + kids, ownUsd: own.usd, childrenUsd: kids, unpriced };
}

/** A cap that is reached: the session's own, or (for a child session) its parent's, which covers it too. */
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
 * The cap a new child session of `parent` gets: an equal share of what is left of the parent's cap,
 * kept for the parent and as many children as may run at once. None when the parent has no cap; an
 * error when nothing is left.
 */
export function childShare(db: DB, parent: string, slots: number): number | undefined {
  const cap = capOf(db, parent);
  if (cap == null) return undefined;
  const spent = spending(db, parent).spentUsd;
  const left = cap - spent;
  if (left < 0.01) throw new Error(`This session's spending cap is reached ($${spent.toFixed(2)} of $${cap.toFixed(2)}): there is nothing left for a child session. Finish with what you have, or ask the user to raise the cap.`);
  return Math.max(0.01, Math.floor((left / (slots + 1)) * 100) / 100);
}
