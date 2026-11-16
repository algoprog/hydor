// "While you were away" (shared/away.ts): what happened since your last visit, for the start page, from what the app
// keeps already, in a few database reads and no model.
//
//   your visits       the app tells the server once it has been open, in front and in use for a minute, and every
//                     minute after while it stays so (POST /api/away/here, from any device); a visit ends when that
//                     stops for VISIT_GAP. "Since" is the end of the visit before the one under way, so reloading the
//                     page, or a glance shorter than a minute, never moves it. Kept on the server (kv), so a phone visit
//                     counts on the computer too. Mark all as seen moves it to then (POST /api/away/seen).
//   needs you         the Inbox as it is now (approvals, questions, forms, calls held in the Outbox…)
//   finished          sessions whose last turn ended Done or Failed since then and that you have not opened since:
//                     how each ended, the start of its last reply and the files it made are kept when its turn ends
//                     (recordEnding, from server/sessions.ts)
//   ran by itself     scheduled tasks' and your agents' runs (task_runs), and apps' runs started from outside a
//                     session (app_runs: the Apps page, the API, a public page, a chat app), each with how it went and
//                     its cost; their sessions are not counted again among the finished ones
//   next              scheduled tasks due later today (not webhooks and watchers, which run when something happens)
import type { FastifyInstance } from 'fastify';
import { awayCounts, awayOrder, type AwayBy, type AwayNext, type AwayOutcome, type AwayRow, type AwaySummary } from '../../shared/away.ts';
import type { Ending } from '../../shared/ending.ts';
import type { InboxItem } from '../../shared/inbox.ts';
import type { Agent } from '../../shared/types.ts';
import { findAssistant } from '../assistants/store.ts';
import { kvGet, kvSet, type DB } from '../db.ts';

const MIN = 60_000;
/** Without word from any device for this long, a visit has ended. */
export const VISIT_GAP = 20 * MIN;
/** Before the first visit the app heard of: the day before. */
export const FIRST_LOOK = 24 * 60 * MIN;
/** Rows read of each kind, at most (the page shows six; the counts are of these). */
const MOST = 60;
/** Files named for a session, at most. */
const FILES = 5;

/** Your visits, as the server keeps them. */
export interface Visits {
  /** When the visit under way (or the last one) began, and when the app last said it was in front. */
  start?: number;
  last?: number;
  /** When the visit before it ended. */
  before?: number;
  /** When you last marked all as seen. */
  cleared?: number;
}

const KEY = 'away.visits';

export function visitsOf(db: DB): Visits {
  try {
    const v = JSON.parse(kvGet(db, KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** The app has been in front, and in use, for a minute: the visit under way goes on, or a new one begins. */
export function heard(v: Visits, now: number): Visits {
  if (v.last !== undefined && now - v.last <= VISIT_GAP && now >= v.last) return { ...v, last: now };
  return { ...v, ...(v.last !== undefined ? { before: v.last } : {}), start: now, last: now };
}

/**
 * Since when: while a visit is under way, the end of the one before it; between visits, the end of the last one; before
 * any, a day back (from the start of the first visit, while it goes on). Never before the last Mark all as seen.
 */
export function sinceOf(v: Visits, now: number): number {
  const during = v.last !== undefined && now - v.last <= VISIT_GAP;
  const base = during ? (v.before ?? (v.start ?? now) - FIRST_LOOK) : (v.last ?? now - FIRST_LOOK);
  return Math.max(base, v.cleared ?? 0);
}

// ---- how a session's turn ended, kept when it ends ----------------------------------------------------------------

export interface EndRecord {
  ended: Ending;
  /** When the turn ended. */
  at: number;
  /** The start of its last reply, or what went wrong. */
  line?: string;
  /** Files the session made (paths), and how many it changed that were there before. */
  made: string[];
  changed: number;
}

/** Keeps how a session's latest turn ended (server/sessions.ts calls it once the turn's last lines are in). */
export function recordEnding(db: DB, key: string, agent: Agent, e: EndRecord) {
  const files = e.made.length || e.changed ? JSON.stringify({ made: e.made.slice(0, FILES), n: e.made.length + e.changed }) : null;
  const line = e.line ? plainLine(e.line) : null;
  db.prepare(
    `insert into app_sessions (key, agent, ended, ended_at, end_line, end_files, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(key) do update set ended = excluded.ended, ended_at = excluded.ended_at, end_line = excluded.end_line, end_files = excluded.end_files`,
  ).run(key, agent, e.ended, e.at, line, files, e.at, e.at);
}

/** Text in a line: no code, no Markdown marks, at most `n` characters. */
export function plainLine(s: string, n = 160): string {
  const t = s
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\[silent\]\s*/i, '')
    .replace(/[*_`#>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

// ---- the summary ---------------------------------------------------------------------------------------------------

export interface AwaySources {
  db: DB;
  /** Everything waiting on you now (the Inbox). */
  inbox: () => InboxItem[];
  /** Another agent's name (Settings → More agents), by its id. */
  acpName?: (id: string) => string | undefined;
}

const enc = encodeURIComponent;
const parse = <T>(s: string | null | undefined): T | undefined => {
  if (!s) return undefined;
  try {
    return JSON.parse(s) as T;
  } catch {
    return undefined;
  }
};

/** A task run's status as the start page tells it. */
const runOutcome = (status: string): AwayOutcome | null =>
  status === 'done' || status === 'partial' ? 'done' : status === 'silent' ? 'quiet' : status === 'failed' || status === 'error' || status === 'blocked' ? 'failed' : null;

interface FinishedRow {
  key: string;
  agent: Agent | null;
  ended: Ending | null;
  at: number;
  end_line: string | null;
  end_files: string | null;
  app_title: string | null;
  app_first: string | null;
  acp_agent: string | null;
  title: string | null;
  first_prompt: string | null;
}

const has = (db: DB, table: string) => !!db.prepare(`select 1 from sqlite_master where type = 'table' and name = ?`).get(table);

/**
 * Sessions that ended Done or Failed in (since, until] and that you have not opened since: not archived, not a helper
 * of another session, and not a run's (a task's or an app's run tells of it instead).
 */
function finishedRows(db: DB, since: number, until: number): FinishedRow[] {
  const runs = has(db, 'task_runs') ? 'and not exists (select 1 from task_runs r where r.key = a.key and (r.ended_at is null or r.ended_at > @since))' : '';
  const apps = has(db, 'app_runs') ? 'and not exists (select 1 from app_runs x where x.key = a.key)' : '';
  return db
    .prepare(
      `select a.key, coalesce(s.agent, a.agent) as agent, a.ended, coalesce(a.ended_at, a.done_at) as at, a.end_line, a.end_files,
         a.title as app_title, a.first_prompt as app_first, a.acp_agent, s.title, s.first_prompt
       from app_sessions a left join sessions s on s.key = a.key
       where coalesce(a.ended_at, a.done_at) > @since and coalesce(a.ended_at, a.done_at) <= @until
         and coalesce(a.ended, 'done') in ('done', 'failed')
         and (a.seen_at is null or a.seen_at < coalesce(a.ended_at, a.done_at))
         and coalesce(a.archived, 0) = 0 and coalesce(s.hidden, 0) = 0 and s.parent_key is null
         ${runs} ${apps}
       order by at desc limit ${MOST}`,
    )
    .all({ since, until }) as FinishedRow[];
}

/** Everything since `since`, ready to show. `until`: the end of the day for what runs next (the page's own midnight). */
export function awaySummary(src: AwaySources, o: { now?: number; until?: number } = {}): AwaySummary {
  const { db } = src;
  const now = o.now ?? Date.now();
  const v = visitsOf(db);
  const since = sinceOf(v, now);
  const rows: AwayRow[] = [];
  // The tables of runs and apps are made by their own parts of the app; a fresh database may not have them yet.
  const tasks = has(db, 'task_runs') && has(db, 'tasks');
  const apps = has(db, 'app_runs');

  // Needs you: as the Inbox has it now, but not what waited already when you last marked all as seen.
  for (const it of src.inbox()) {
    if (v.cleared && it.at <= v.cleared) continue;
    rows.push({
      id: it.id,
      group: 'needs',
      outcome: 'waiting',
      title: it.title,
      ...(it.detail ? { line: plainLine(it.detail) } : {}),
      at: it.at,
      path: it.path,
      ...(it.agent ? { agent: it.agent } : {}),
      ...(it.session ? { session: it.session } : {}),
      item: it,
    });
  }

  // Finished sessions.
  for (const r of finishedRows(db, since, now)) {
    const files = parse<{ made?: string[]; n?: number }>(r.end_files);
    const title = r.app_title || r.title || r.first_prompt || r.app_first || 'New session';
    rows.push({
      id: `session:${r.key}`,
      group: 'finished',
      outcome: r.ended === 'failed' ? 'failed' : 'done',
      title: title.length > 200 ? `${title.slice(0, 199)}…` : title,
      ...(r.end_line ? { line: r.end_line } : {}),
      at: r.at,
      path: `/s/${enc(r.key)}`,
      ...(r.agent ? { agent: r.agent } : {}),
      ...(r.acp_agent ? { acpName: src.acpName?.(r.acp_agent) ?? r.acp_agent } : {}),
      ...(files?.made?.length ? { files: files.made } : {}),
      ...(files?.n ? { fileCount: files.n } : {}),
    });
  }

  // Ran by itself: scheduled tasks and your agents' schedules.
  if (tasks) {
    const runs = db
      .prepare(
        `select r.id, r.task_id, r.status, r.ended_at, r.summary, r.reply, r.error, r.cost_usd, r.key, r.app_run, t.name, t.extra, t.agent
         from task_runs r left join tasks t on t.id = r.task_id
         where r.ended_at > ? and r.ended_at <= ? and r.trigger != 'test' and coalesce(r.dry, 0) = 0 and r.task_id != ''
         order by r.ended_at desc limit ${MOST}`,
      )
      .all(since, now) as {
      id: string;
      task_id: string;
      status: string;
      ended_at: number;
      summary: string | null;
      reply: string | null;
      error: string | null;
      cost_usd: number | null;
      key: string | null;
      app_run: string | null;
      name: string | null;
      extra: string | null;
      agent: Agent | null;
    }[];
    const agents = new Map<string, string | null>();
    const agentName = (id: string) => {
      if (!agents.has(id)) agents.set(id, findAssistant(db, id)?.name ?? null);
      return agents.get(id) ?? undefined;
    };
    for (const r of runs) {
      const outcome = runOutcome(r.status);
      if (!outcome) continue;
      const who = parse<{ assistant?: string }>(r.extra)?.assistant;
      const byAgent = who ? agentName(who) : undefined;
      const by: AwayBy = byAgent ? 'agent' : 'task';
      const line = outcome === 'failed' ? (r.error ?? r.summary ?? r.reply) : (r.summary ?? r.reply);
      rows.push({
        id: `run:${r.id}`,
        group: 'ran',
        outcome,
        title: r.name ?? 'A scheduled task',
        ...(line ? { line: plainLine(line) } : {}),
        at: r.ended_at,
        path: r.key ? `/s/${enc(r.key)}` : r.app_run ? `/apps/runs/${enc(r.app_run)}` : '/settings?s=tasks',
        ...(r.agent ? { agent: r.agent } : {}),
        ...(r.cost_usd ? { costUsd: r.cost_usd } : {}),
        by,
        ...(byAgent ? { byName: byAgent } : {}),
      });
    }
  }

  // Ran by itself: apps run from outside a session (not a step of another run, a try of an example, or a task's,
  // which its task tells).
  if (apps) {
    const runs = db
      .prepare(
        `select id, app_id, app_name, status, ended_at, reply, error, cost_usd from app_runs
         where ended_at > ? and ended_at <= ? and parent is null and source in ('web', 'api', 'mcp', 'public', 'chat', 'screen')
         order by ended_at desc limit ${MOST}`,
      )
      .all(since, now) as { id: string; app_id: string; app_name: string; status: string; ended_at: number; reply: string | null; error: string | null; cost_usd: number | null }[];
    for (const r of runs) {
      const outcome: AwayOutcome | null = r.status === 'done' ? 'done' : r.status === 'failed' ? 'failed' : null;
      if (!outcome) continue;
      const line = outcome === 'failed' ? (r.error ?? r.reply) : r.reply;
      rows.push({
        id: `app:${r.id}`,
        group: 'ran',
        outcome,
        title: r.app_name,
        ...(line ? { line: plainLine(line) } : {}),
        at: r.ended_at,
        path: `/apps/runs/${enc(r.id)}`,
        ...(r.cost_usd ? { costUsd: r.cost_usd } : {}),
        by: 'app',
        byName: r.app_name,
      });
    }
  }

  // Next: what runs later today.
  const next: AwayNext[] = [];
  if (tasks) {
    const until = o.until && o.until > now ? Math.min(o.until, now + FIRST_LOOK) : endOfDay(now);
    const due = db
      .prepare(`select id, name, schedule, extra, next_at from tasks where enabled = 1 and resume = 0 and next_at > ? and next_at <= ? order by next_at limit 12`)
      .all(now, until) as { id: string; name: string; schedule: string; extra: string | null; next_at: number }[];
    for (const t of due) {
      const kind = parse<{ kind?: string }>(t.schedule)?.kind;
      if (kind === 'webhook' || kind === 'watch') continue;
      const who = parse<{ assistant?: string }>(t.extra)?.assistant;
      const agent = who ? findAssistant(db, who) : null;
      next.push({ id: t.id, name: t.name, at: t.next_at, path: agent ? `/agents/${enc(agent.id)}` : '/settings?s=tasks', by: agent ? 'agent' : 'task' });
      if (next.length >= 3) break;
    }
  }

  return { now, since, rows: awayOrder(rows), counts: awayCounts(rows), next };
}

/** The end of the server's own day (the page gives its own when it asks). */
function endOfDay(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

// ---- routes --------------------------------------------------------------------------------------------------------

export interface AwayDeps extends AwaySources {
  /** Marks a session as looked at (as opening it does), on every device. */
  markSeen: (key: string) => void;
}

export function registerAway(app: FastifyInstance, deps: AwayDeps) {
  // What happened since your last visit. `until`: the end of your day, for what runs next today.
  app.get('/api/away', async (req) => {
    const q = req.query as Record<string, string | undefined>;
    const until = Number(q.until);
    return awaySummary(deps, { until: Number.isFinite(until) && until > 0 ? until : undefined });
  });
  // The app has been open, in front and in use for a minute (and each minute after): your visit goes on.
  app.post('/api/away/here', async () => {
    const now = Date.now();
    const v = heard(visitsOf(deps.db), now);
    kvSet(deps.db, KEY, JSON.stringify(v));
    return { since: sinceOf(v, now) };
  });
  // Mark all as seen: what the start page showed (up to `at`, its `now`) goes, and the sessions in it count as opened.
  app.post('/api/away/seen', async (req) => {
    const now = Date.now();
    const at = Number((req.body as { at?: unknown } | null)?.at);
    const upto = Number.isFinite(at) && at > 0 ? Math.min(at, now) : now;
    const v = visitsOf(deps.db);
    const since = sinceOf(v, now);
    for (const r of finishedRows(deps.db, since, upto)) deps.markSeen(r.key);
    kvSet(deps.db, KEY, JSON.stringify({ ...v, cleared: Math.max(v.cleared ?? 0, upto) }));
    return { ok: true };
  });
}
