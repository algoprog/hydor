// What the tokens would cost at API prices, for the Usage page's estimates. Rates come from LiteLLM's
// public price table (fetched at most once a day, kept in the data folder) and from prices you set
// yourself, which win. Subscriptions are flat-rate: this is what the same work would cost per token.
import fs from 'node:fs';
import path from 'node:path';
import type { ModelPrice } from '../shared/types.ts';
import { config } from './config.ts';
import type { DB } from './db.ts';
import { kvGet, kvSet } from './db.ts';

const SOURCE = process.env.PRICES_URL ?? 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const CACHE = path.join(config.dataDir, 'model-prices.json');
const DAY = 86400_000;

interface Rate {
  input: number;
  output: number;
  cacheRead: number;
}

let table: Map<string, Rate> | null = null;
let fetching: Promise<void> | null = null;

function parseTable(raw: Record<string, any>): Map<string, Rate> {
  const out = new Map<string, Rate>();
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object' || typeof v.input_cost_per_token !== 'number' || typeof v.output_cost_per_token !== 'number') continue;
    out.set(k.toLowerCase(), {
      input: v.input_cost_per_token * 1e6,
      output: v.output_cost_per_token * 1e6,
      cacheRead: (typeof v.cache_read_input_token_cost === 'number' ? v.cache_read_input_token_cost : v.input_cost_per_token) * 1e6,
    });
  }
  return out;
}

/** Loads the cached table, and refreshes it in the background when it is a day old. */
function ensureTable(): Map<string, Rate> {
  if (!table) {
    try {
      table = parseTable(JSON.parse(fs.readFileSync(CACHE, 'utf8')));
    } catch {
      table = new Map();
    }
  }
  const age = (() => {
    try {
      return Date.now() - fs.statSync(CACHE).mtimeMs;
    } catch {
      return Infinity;
    }
  })();
  if (SOURCE && age > DAY && !fetching) {
    fetching = fetch(SOURCE, { signal: AbortSignal.timeout(20_000) })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        const parsed = parseTable(JSON.parse(text));
        if (parsed.size) {
          fs.writeFileSync(CACHE, text);
          table = parsed;
        }
      })
      .catch(() => {
        // Offline or blocked: try again in an hour, keep what we have.
        try {
          fs.utimesSync(CACHE, new Date(), new Date(Date.now() - DAY + 3600_000));
        } catch {}
      })
      .finally(() => (fetching = null));
  }
  return table;
}

/** Prices you set, per million tokens, by model. */
export function priceOverrides(db: DB): Record<string, ModelPrice> {
  try {
    return JSON.parse(kvGet(db, 'model_prices') ?? '{}');
  } catch {
    return {};
  }
}

export function setPriceOverrides(db: DB, prices: Record<string, ModelPrice>) {
  const clean: Record<string, ModelPrice> = {};
  for (const [m, p] of Object.entries(prices ?? {})) {
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
    const input = n(p?.input);
    const output = n(p?.output);
    if (!m.trim() || input === undefined || output === undefined) continue;
    clean[m.trim()] = { input, output, cacheRead: n(p?.cacheRead) };
  }
  kvSet(db, 'model_prices', JSON.stringify(clean));
}

// Family names alone ("opus") could be any generation, and synthetic replies are free.
const UNPRICED = new Set(['', 'default', 'opus', 'sonnet', 'haiku', 'fable', '<synthetic>', 'synthetic']);

/** The rate for a model as transcripts name it: yours first, then the table under the names it may use. */
export function rateFor(db: DB, model: string | null | undefined): (ModelPrice & { source: 'custom' | 'table' }) | null {
  const m = String(model ?? '').trim();
  const own = priceOverrides(db)[m];
  if (own) return { ...own, source: 'custom' };
  const key = m.toLowerCase().replace(/\[.*\]$/, '');
  if (UNPRICED.has(key)) return null;
  const t = ensureTable();
  const bare = key.replace(/-\d{8}$/, '');
  for (const k of [key, bare, `anthropic/${key}`, `anthropic/${bare}`, `openai/${key}`, `openai/${bare}`, bare.replace(/(\d)-(\d)(?!\d)/g, '$1.$2')]) {
    const r = t.get(k);
    if (r) return { input: r.input, output: r.output, cacheRead: r.cacheRead, source: 'table' };
  }
  return null;
}

/** Dollars for these tokens; null when the model has no known price. */
export function costOf(db: DB, model: string | null | undefined, t: { tokensIn: number; tokensCached: number; tokensOut: number }): number | null {
  const r = rateFor(db, model);
  if (!r) return null;
  return (t.tokensIn * r.input + t.tokensCached * (r.cacheRead ?? r.input) + t.tokensOut * r.output) / 1e6;
}
