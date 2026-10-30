// Activity stats: per-hour rows from the indexer, grouped into the viewer's local
// days, ISO weeks, months or years.
import { rateFor } from './prices.ts';
import type { Agent, ModelUsage, StatsBucket, StatsGranularity, StatsResponse, StatsTotals } from '../shared/types.ts';
import type { DB } from './db.ts';

interface Row {
  key: string;
  root: string;
  agent: Agent;
  hour: number;
  prompts: number;
  turns: number;
  messages: number;
  tool_calls: number;
  commands: number;
  file_edits: number;
  lines_added: number;
  lines_removed: number;
  tokens_in: number;
  tokens_cached: number;
  tokens_out: number;
  gen_ms: number;
}

const DEFAULT_COUNT: Record<StatsGranularity, number> = { day: 30, week: 26, month: 12, year: 10 };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function emptyTotals(): StatsTotals {
  return {
    sessions: 0,
    prompts: 0,
    turns: 0,
    messages: 0,
    toolCalls: 0,
    commands: 0,
    fileEdits: 0,
    linesAdded: 0,
    linesRemoved: 0,
    tokensIn: 0,
    tokensCached: 0,
    tokensOut: 0,
    genMs: 0,
  };
}

function add(t: StatsTotals, r: Row, cost = 0) {
  if (cost) t.cost = (t.cost ?? 0) + cost;
  t.prompts += r.prompts;
  t.turns += r.turns;
  t.messages += r.messages;
  t.toolCalls += r.tool_calls;
  t.commands += r.commands;
  t.fileEdits += r.file_edits;
  t.linesAdded += r.lines_added;
  t.linesRemoved += r.lines_removed;
  t.tokensIn += r.tokens_in;
  t.tokensCached += r.tokens_cached;
  t.tokensOut += r.tokens_out;
  t.genMs += r.gen_ms;
}

/** Local calendar date (y, m 1-12, d) of an instant in `tz`. */
function localDate(fmt: Intl.DateTimeFormat, ms: number): [number, number, number] {
  let y = 0;
  let m = 0;
  let d = 0;
  for (const p of fmt.formatToParts(ms)) {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') m = Number(p.value);
    else if (p.type === 'day') d = Number(p.value);
  }
  return [y, m, d];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar arithmetic on plain dates (UTC midnight stands in for a local date). */
function civil(y: number, m: number, d: number) {
  return Date.UTC(y, m - 1, d);
}

function keyFor(g: StatsGranularity, y: number, m: number, d: number): string {
  if (g === 'year') return String(y);
  if (g === 'month') return `${y}-${pad(m)}`;
  if (g === 'day') return `${y}-${pad(m)}-${pad(d)}`;
  // ISO week: the Monday of the week.
  const t = civil(y, m, d);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  const mon = new Date(t - dow * 86400_000);
  return `${mon.getUTCFullYear()}-${pad(mon.getUTCMonth() + 1)}-${pad(mon.getUTCDate())}`;
}

function labelFor(g: StatsGranularity, key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (g === 'year') return key;
  if (g === 'month') return `${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${d}`;
}

/** Bucket keys, oldest first, ending with the bucket that holds `now`. */
function bucketKeys(g: StatsGranularity, n: number, today: [number, number, number], firstYear: number): string[] {
  const [y, m, d] = today;
  const keys: string[] = [];
  if (g === 'year') {
    for (let yy = Math.min(firstYear, y); yy <= y; yy++) keys.push(String(yy));
    return keys.slice(-Math.max(n, 1));
  }
  if (g === 'month') {
    for (let i = n - 1; i >= 0; i--) {
      const dt = new Date(Date.UTC(y, m - 1 - i, 1));
      keys.push(`${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`);
    }
    return keys;
  }
  const step = g === 'week' ? 7 : 1;
  const anchor = civil(y, m, d);
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(anchor - i * step * 86400_000);
    keys.push(keyFor(g, dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()));
  }
  return [...new Set(keys)];
}

function keyStart(g: StatsGranularity, key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  if (g === 'year') return civil(y, 1, 1);
  if (g === 'month') return civil(y, m, 1);
  return civil(y, m, d);
}

export function computeStats(db: DB, q: { granularity: StatsGranularity; tz?: string; agent?: string; count?: number }): StatsResponse {
  const g = q.granularity;
  let tz = q.tz || 'UTC';
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
  } catch {
    tz = 'UTC';
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' });
  }
  const agent = q.agent === 'claude' || q.agent === 'codex' ? q.agent : 'all';
  const n = Math.max(1, Math.min(q.count ?? DEFAULT_COUNT[g], 400));
  const now = Date.now();
  const today = localDate(fmt, now);

  const first = db.prepare('select min(hour) as h from activity').get() as { h: number | null };
  const firstYear = first.h != null ? localDate(fmt, first.h * 3_600_000)[0] : today[0];

  // Current window plus the same number of buckets before it, for the comparison.
  const all = bucketKeys(g, n * 2, today, g === 'year' ? firstYear - n : firstYear);
  const keys = g === 'year' ? bucketKeys(g, n, today, firstYear) : all.slice(-n);
  const prevKeys = new Set(g === 'year' ? [] : all.slice(0, all.length - keys.length));
  const startKey = g === 'year' ? keys[0] : all[0];
  // Two days of slack either side of the local-midnight boundary.
  const fromHour = Math.floor((keyStart(g, startKey) - 2 * 86400_000) / 3_600_000);

  const rows = db
    .prepare(`select * from activity where hour >= ?${agent === 'all' ? '' : ' and agent = ?'}`)
    .all(...(agent === 'all' ? [fromHour] : [fromHour, agent])) as Row[];

  const cwdOf = new Map<string, string>();
  for (const r of db.prepare('select key, cwd from sessions where cwd is not null').all() as { key: string; cwd: string }[]) cwdOf.set(r.key, r.cwd);
  // Each session's model prices its tokens (a session that changed models is priced at its latest one).
  const modelOf = new Map<string, string>();
  for (const r of db.prepare('select key, model from sessions where model is not null').all() as { key: string; model: string }[]) modelOf.set(r.key, r.model);
  const rates = new Map<string, ReturnType<typeof rateFor>>();
  const rate = (m: string) => {
    if (!rates.has(m)) rates.set(m, rateFor(db, m));
    return rates.get(m)!;
  };
  const byModel = new Map<string, ModelUsage>();

  const buckets = new Map<string, StatsBucket & { roots: Set<string> }>();
  for (const k of keys) buckets.set(k, { key: k, label: labelFor(g, k), start: keyStart(g, k), ...emptyTotals(), roots: new Set() });
  const totals = emptyTotals();
  const totalRoots = new Set<string>();
  const previous = emptyTotals();
  const prevRoots = new Set<string>();
  const byAgent: Record<Agent, StatsTotals & { roots?: Set<string> }> = { claude: emptyTotals(), codex: emptyTotals(), acp: emptyTotals() };
  const agentRoots: Record<Agent, Set<string>> = { claude: new Set(), codex: new Set(), acp: new Set() };
  const projects = new Map<string, StatsTotals & { cwd: string; roots: Set<string> }>();
  const hourKey = new Map<number, string>();

  for (const r of rows) {
    let k = hourKey.get(r.hour);
    if (k === undefined) {
      const [y, m, d] = localDate(fmt, r.hour * 3_600_000);
      k = keyFor(g, y, m, d);
      hourKey.set(r.hour, k);
    }
    const b = buckets.get(k);
    const model = modelOf.get(r.key) ?? '(unknown)';
    const rt = b || prevKeys.has(k) ? rate(model) : null;
    const cost = rt ? (r.tokens_in * rt.input + r.tokens_cached * (rt.cacheRead ?? rt.input) + r.tokens_out * rt.output) / 1e6 : 0;
    if (b) {
      add(b, r, cost);
      b.roots.add(r.root);
      add(totals, r, cost);
      totalRoots.add(r.root);
      add(byAgent[r.agent], r, cost);
      agentRoots[r.agent].add(r.root);
      const cwd = cwdOf.get(r.root) ?? cwdOf.get(r.key) ?? '(unknown)';
      let p = projects.get(cwd);
      if (!p) projects.set(cwd, (p = { cwd, ...emptyTotals(), roots: new Set() }));
      add(p, r, cost);
      p.roots.add(r.root);
      let mu = byModel.get(model);
      if (!mu) byModel.set(model, (mu = { model, tokensIn: 0, tokensCached: 0, tokensOut: 0, cost: rt ? 0 : null, price: rt }));
      mu.tokensIn += r.tokens_in;
      mu.tokensCached += r.tokens_cached;
      mu.tokensOut += r.tokens_out;
      if (mu.cost !== null) mu.cost += cost;
    } else if (prevKeys.has(k)) {
      add(previous, r, cost);
      prevRoots.add(r.root);
    }
  }

  totals.sessions = totalRoots.size;
  previous.sessions = prevRoots.size;
  for (const a of ['claude', 'codex'] as const) byAgent[a].sessions = agentRoots[a].size;
  return {
    granularity: g,
    tz,
    agent,
    buckets: [...buckets.values()].map(({ roots, ...b }) => ({ ...b, sessions: roots.size })),
    totals,
    previous,
    byAgent,
    projects: [...projects.values()]
      .map(({ roots, ...p }) => ({ ...p, sessions: roots.size }))
      .sort((a, b) => b.linesAdded + b.linesRemoved - (a.linesAdded + a.linesRemoved) || b.tokensOut - a.tokensOut)
      .slice(0, 12),
    byModel: [...byModel.values()].filter((m) => m.tokensIn + m.tokensCached + m.tokensOut > 0).sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokensOut - a.tokensOut),
  };
}
