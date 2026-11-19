// Activity stats: per-hour rows from the indexer, grouped into the viewer's local
// days, ISO weeks, months or years; for every agent or one (each ACP agent by name: Custom, Gemini CLI…),
// and every model or one. The totals and breakdowns cover the whole window, or one period of it: the page asks
// for the one that holds now (today, this week…), compared with the period before up to the same point.
import { ACP_PRESETS, acpAgents, CONSOLE_ID } from './agents/acp.ts';
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

/** Local calendar date and hour (y, m 1-12, d, h 0-23) of an instant in `tz`. */
function localDate(fmt: Intl.DateTimeFormat, ms: number): [number, number, number, number] {
  let y = 0;
  let m = 0;
  let d = 0;
  let h = 0;
  for (const p of fmt.formatToParts(ms)) {
    if (p.type === 'year') y = Number(p.value);
    else if (p.type === 'month') m = Number(p.value);
    else if (p.type === 'day') d = Number(p.value);
    else if (p.type === 'hour') h = Number(p.value) % 24;
  }
  return [y, m, d, h];
}

const dateFormat = (timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' });

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

/** A period's key as the buckets name it ("2026", "2026-11", "2026-11-18"; any day of a week names its Monday), or null. */
export function periodKey(g: StatsGranularity, s: string): string | null {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?$/.exec(s.trim());
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
  if (g === 'year') return m ? null : String(y);
  if (m < 1 || m > 12) return null;
  if (g === 'month') return d ? null : `${y}-${pad(m)}`;
  const t = new Date(civil(y, m, d));
  if (!d || t.getUTCMonth() + 1 !== m || t.getUTCDate() !== d) return null;
  return keyFor(g, y, m, d);
}

/** The key of the period just before. */
function prevKeyOf(g: StatsGranularity, key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (g === 'year') return String(y - 1);
  if (g === 'month') return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
  const t = new Date(civil(y, m, d) - (g === 'week' ? 7 : 1) * 86400_000);
  return keyFor(g, t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Local hours from the start of a period to an hour in it: how far into it the hour is. */
function hoursInto(g: StatsGranularity, key: string, y: number, m: number, d: number, h: number): number {
  return Math.round((civil(y, m, d) - keyStart(g, key)) / 86400_000) * 24 + h;
}

/** An agent's name in the stats: Claude Code, Codex, or an ACP agent's ("acp:console" is Custom). */
function agentName(db: DB, id: string): string {
  if (id === 'claude') return 'Claude Code';
  if (id === 'codex') return 'Codex';
  const acp = id.startsWith('acp:') ? id.slice(4) : '';
  if (!acp) return 'Other agents';
  if (acp === CONSOLE_ID) return 'Custom';
  return [...acpAgents(db), ...ACP_PRESETS].find((a) => a.id === acp)?.name ?? acp;
}

/**
 * `period`: "current" (the period that holds now) or a period's key (periodKey) makes the totals, the breakdowns and
 * `previous` cover that period alone rather than the whole window; `previous` is then the period before it, up to the
 * same point while the period is still running (Monday to Wednesday 15:00 of last week, on a Wednesday at 15:00).
 * `now` is for tests.
 */
export function computeStats(db: DB, q: { granularity: StatsGranularity; tz?: string; agent?: string; model?: string; count?: number; period?: string; now?: number }): StatsResponse {
  const g = q.granularity;
  let tz = q.tz || 'UTC';
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = dateFormat(tz);
  } catch {
    tz = 'UTC';
    fmt = dateFormat(tz);
  }
  // All agents, one kind (claude, codex, acp), or one ACP agent (acp:console is Custom).
  const agent = q.agent === 'claude' || q.agent === 'codex' || q.agent === 'acp' || /^acp:[\w.-]{1,64}$/.test(q.agent ?? '') ? q.agent! : 'all';
  const kind = agent.startsWith('acp') ? 'acp' : agent;
  const onlyModel = q.model?.trim() || undefined;
  const n = Math.max(1, Math.min(q.count ?? DEFAULT_COUNT[g], 400));
  const now = q.now ?? Date.now();
  const [ty, tm, td, th] = localDate(fmt, now);
  const today: [number, number, number] = [ty, tm, td];
  // The one period asked for, and the one before it (to the same point while it runs).
  const nowKey = keyFor(g, ty, tm, td);
  const pKey = q.period === 'current' ? nowKey : q.period ? periodKey(g, q.period) : null;
  const pPrev = pKey ? prevKeyOf(g, pKey) : null;
  const running = pKey === nowKey;
  const nowInto = hoursInto(g, nowKey, ty, tm, td, th);

  const first = db.prepare('select min(hour) as h from activity').get() as { h: number | null };
  const firstYear = first.h != null ? localDate(fmt, first.h * 3_600_000)[0] : today[0];
  // When each agent's history starts (Claude Code deletes its conversations after 30 days).
  const firstByAgent: Partial<Record<Agent, number>> = {};
  for (const r of db.prepare('select agent, min(hour) as h from activity group by agent').all() as { agent: Agent; h: number }[]) firstByAgent[r.agent] = r.h * 3_600_000;

  // Current window plus the same number of buckets before it, for the comparison.
  const all = bucketKeys(g, n * 2, today, g === 'year' ? firstYear - n : firstYear);
  let keys = g === 'year' ? bucketKeys(g, n, today, firstYear) : all.slice(-n);
  // Months start where the history does, rather than with a run of empty ones.
  if (g === 'month' && first.h != null && !q.count) {
    const [fy, fm] = localDate(fmt, first.h * 3_600_000);
    const firstKey = keyFor(g, fy, fm, 1);
    if (firstKey > keys[0]) keys = keys.filter((k) => k >= firstKey);
  }
  const prevKeys = new Set(g === 'year' ? [] : all.slice(0, all.length - keys.length));
  const startKey = g === 'year' ? keys[0] : all[0];
  // From the window's start, or the start of the period before the one asked for when that is earlier.
  const from = Math.min(keyStart(g, startKey), pPrev ? keyStart(g, pPrev) : Infinity);
  // Two days of slack either side of the local-midnight boundary.
  const fromHour = Math.floor((from - 2 * 86400_000) / 3_600_000);

  // Folders and models of the sessions, and of those whose transcript is gone (deleted, or cleaned up as inactive).
  const cwdOf = new Map<string, string>();
  const modelOf = new Map<string, string>();
  for (const table of ['retired', 'sessions']) {
    for (const r of db.prepare(`select key, cwd, model from ${table}`).all() as { key: string; cwd: string | null; model: string | null }[]) {
      if (r.cwd) cwdOf.set(r.key, r.cwd);
      // Each session's model prices its tokens (a session that changed models is priced at its latest one).
      if (r.model) modelOf.set(r.key, r.model);
    }
  }
  // Which ACP agent each ACP session ran (Custom, Gemini CLI…).
  const acpOf = new Map<string, string>();
  for (const r of db.prepare("select key, acp_agent from retired where acp_agent is not null union all select key, acp_agent from app_sessions where key like 'acp:%' and acp_agent is not null").all() as { key: string; acp_agent: string }[])
    acpOf.set(r.key, r.acp_agent);
  const agentOfRow = (r: Row) => (r.agent === 'acp' ? `acp:${acpOf.get(r.key) ?? acpOf.get(r.root) ?? '?'}` : r.agent);

  const rows = (
    db.prepare(`select * from activity where hour >= ?${kind === 'all' ? '' : ' and agent = ?'}`).all(...(kind === 'all' ? [fromHour] : [fromHour, kind])) as Row[]
  ).filter((r) => (!agent.startsWith('acp:') || agentOfRow(r) === agent) && (!onlyModel || (modelOf.get(r.key) ?? '(unknown)') === onlyModel));
  const rates = new Map<string, ReturnType<typeof rateFor>>();
  const rate = (m: string) => {
    if (!rates.has(m)) rates.set(m, rateFor(db, m));
    return rates.get(m)!;
  };
  const byModel = new Map<string, ModelUsage & { roots: Set<string> }>();
  const byAgentId = new Map<string, StatsTotals & { roots: Set<string> }>();

  const buckets = new Map<string, StatsBucket & { roots: Set<string> }>();
  for (const k of keys) buckets.set(k, { key: k, label: labelFor(g, k), start: keyStart(g, k), ...emptyTotals(), roots: new Set() });
  const totals = emptyTotals();
  const totalRoots = new Set<string>();
  const previous = emptyTotals();
  const prevRoots = new Set<string>();
  const byAgent: Record<Agent, StatsTotals & { roots?: Set<string> }> = { claude: emptyTotals(), codex: emptyTotals(), acp: emptyTotals() };
  const agentRoots: Record<Agent, Set<string>> = { claude: new Set(), codex: new Set(), acp: new Set() };
  const projects = new Map<string, StatsTotals & { cwd: string; roots: Set<string> }>();
  // The whole window's totals, when the rest covers one period.
  const win = emptyTotals();
  const winRoots = new Set<string>();
  // Each agent with activity in the window, with its output there: what the page's agent filter offers.
  const winAgents = new Map<string, number>();
  // Each hour's period, and how far into it the hour is.
  const hourKey = new Map<number, { k: string; into: number }>();

  for (const r of rows) {
    let hk = hourKey.get(r.hour);
    if (hk === undefined) {
      const [y, m, d, h] = localDate(fmt, r.hour * 3_600_000);
      const key = keyFor(g, y, m, d);
      hk = { k: key, into: hoursInto(g, key, y, m, d, h) };
      hourKey.set(r.hour, hk);
    }
    const k = hk.k;
    const b = buckets.get(k);
    // What the totals and breakdowns count, and what they are compared with: the window and the same number of
    // periods before it, or the period asked for and the one before it.
    const counted = pKey ? k === pKey : !!b;
    const before = pKey ? k === pPrev && (!running || hk.into <= nowInto) : prevKeys.has(k);
    if (!b && !counted && !before) continue;
    const model = modelOf.get(r.key) ?? '(unknown)';
    const rt = rate(model);
    const cost = rt ? (r.tokens_in * rt.input + r.tokens_cached * (rt.cacheRead ?? rt.input) + r.tokens_out * rt.output) / 1e6 : 0;
    if (b) {
      add(b, r, cost);
      b.roots.add(r.root);
      const wa = agentOfRow(r);
      winAgents.set(wa, (winAgents.get(wa) ?? 0) + r.tokens_out);
      if (pKey) {
        add(win, r, cost);
        winRoots.add(r.root);
      }
    }
    if (counted) {
      add(totals, r, cost);
      totalRoots.add(r.root);
      add(byAgent[r.agent], r, cost);
      agentRoots[r.agent].add(r.root);
      const aid = agentOfRow(r);
      let ag = byAgentId.get(aid);
      if (!ag) byAgentId.set(aid, (ag = { ...emptyTotals(), roots: new Set() }));
      add(ag, r, cost);
      ag.roots.add(r.root);
      const cwd = cwdOf.get(r.root) ?? cwdOf.get(r.key) ?? '(unknown)';
      let p = projects.get(cwd);
      if (!p) projects.set(cwd, (p = { cwd, ...emptyTotals(), roots: new Set() }));
      add(p, r, cost);
      p.roots.add(r.root);
      let mu = byModel.get(model);
      if (!mu) byModel.set(model, (mu = { model, sessions: 0, prompts: 0, tokensIn: 0, tokensCached: 0, tokensOut: 0, cost: rt ? 0 : null, price: rt, roots: new Set() }));
      mu.roots.add(r.root);
      mu.prompts! += r.prompts;
      mu.tokensIn += r.tokens_in;
      mu.tokensCached += r.tokens_cached;
      mu.tokensOut += r.tokens_out;
      if (mu.cost !== null) mu.cost += cost;
    } else if (before) {
      add(previous, r, cost);
      prevRoots.add(r.root);
    }
  }

  totals.sessions = totalRoots.size;
  previous.sessions = prevRoots.size;
  for (const a of ['claude', 'codex', 'acp'] as const) byAgent[a].sessions = agentRoots[a].size;
  // Claude Code, Codex, then the rest by their output.
  const agentOrder = (a: { id: string; tokensOut: number }, b: { id: string; tokensOut: number }) =>
    (a.id === 'claude' ? -2 : a.id === 'codex' ? -1 : 0) - (b.id === 'claude' ? -2 : b.id === 'codex' ? -1 : 0) || b.tokensOut - a.tokensOut;
  return {
    granularity: g,
    tz,
    agent,
    model: onlyModel,
    firstAt: first.h != null ? first.h * 3_600_000 : undefined,
    firstByAgent,
    period: pKey ? { key: pKey, label: labelFor(g, pKey), start: keyStart(g, pKey), current: running } : undefined,
    window: pKey ? { ...win, sessions: winRoots.size } : undefined,
    buckets: [...buckets.values()].map(({ roots, ...b }) => ({ ...b, sessions: roots.size })),
    totals,
    previous,
    byAgent,
    agents: [...byAgentId.entries()].map(([id, { roots, ...t }]) => ({ ...t, id, name: agentName(db, id), sessions: roots.size })).sort(agentOrder),
    windowAgents: [...winAgents.entries()]
      .map(([id, tokensOut]) => ({ id, tokensOut }))
      .sort(agentOrder)
      .map(({ id }) => ({ id, name: agentName(db, id) })),
    projects: [...projects.values()]
      .map(({ roots, ...p }) => ({ ...p, sessions: roots.size }))
      .sort((a, b) => b.linesAdded + b.linesRemoved - (a.linesAdded + a.linesRemoved) || b.tokensOut - a.tokensOut)
      .slice(0, 12),
    byModel: [...byModel.values()]
      .map(({ roots, ...m }) => ({ ...m, sessions: roots.size }))
      .filter((m) => m.tokensIn + m.tokensCached + m.tokensOut > 0 || (m.prompts ?? 0) > 0)
      .sort((a, b) => (b.cost ?? -1) - (a.cost ?? -1) || b.tokensOut - a.tokensOut),
  };
}
