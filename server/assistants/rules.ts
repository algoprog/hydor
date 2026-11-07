// What an agent's own settings do when a session starts as it (SessionManager.create calls agentStart for every
// session): the model of the tier it thinks with when none was picked, and its monthly budget, which becomes the
// session's spending cap (what is left of it) or a refusal once it is spent. Also what the Agents page shows of
// each agent: its schedules (the scheduled tasks that run as it), its sessions at work or waiting, and what it
// spent this month.
import type { AgentActivity } from '../../shared/assistants.ts';
import type { SessionExtra } from '../../shared/features.ts';
import type { Agent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { ownSpend } from '../budget/spend.ts';
import { childKeys } from '../children/family.ts';
import type { DB } from '../db.ts';
import type { Scheduler } from '../scheduler.ts';
import { parseExtra, sessionExtra } from '../sessionExtra.ts';
import { allAssistants, findAssistant } from './store.ts';
import { tierPick } from './tiers.ts';

/** When this month began, in this computer's time. */
export const monthStart = (now = Date.now()): number => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

/** The sessions started as an agent since `since`, by key, oldest first. */
export function agentSessions(db: DB, id: string, since: number): string[] {
  const rows = db.prepare('select key, extra from app_sessions where created_at >= ? and instr(extra, ?) > 0 order by created_at, key').all(since, `"assistant":${JSON.stringify(id)}`) as {
    key: string;
    extra: string | null;
  }[];
  return rows.filter((r) => parseExtra(r.extra).assistant === id).map((r) => r.key);
}

/**
 * What an agent's sessions spent this month, in dollars: each one's own spending, and that of the helpers it
 * started that work as no agent of their own (a named agent's work counts towards that agent).
 */
export function monthSpend(db: DB, id: string, now = Date.now()): { usd: number; sessions: number } {
  const keys = agentSessions(db, id, monthStart(now));
  let usd = 0;
  for (const k of keys) {
    usd += ownSpend(db, k).usd;
    for (const c of childKeys(db, k)) if (!sessionExtra(db, c).assistant) usd += ownSpend(db, c).usd;
  }
  return { usd: Math.round(usd * 10_000) / 10_000, sessions: keys.length };
}

interface StartLike {
  agent: Agent;
  acpAgent?: string;
  model?: string;
  effort?: string;
  extra?: SessionExtra;
}

/**
 * A session about to start, with its agent's settings applied: its budget's remainder as the session's spending
 * cap (the lower of the two when it has one already), refused once the month's budget is spent; and the model
 * and effort of the tier it thinks with, when none was picked for it.
 */
export function agentStart<T extends StartLike>(db: DB, o: T): T {
  const a = findAssistant(db, o.extra?.assistant);
  if (!a) return o;
  let out = o;
  if (a.budgetUsd) {
    const left = Math.floor((a.budgetUsd - monthSpend(db, a.id).usd) * 100) / 100;
    if (left <= 0) throw new HttpError(400, `${a.name} has spent its $${a.budgetUsd} budget for this month: raise it in its settings, or wait for next month`);
    const cap = typeof o.extra?.capUsd === 'number' && o.extra.capUsd > 0 ? Math.min(o.extra.capUsd, left) : left;
    out = { ...out, extra: { ...out.extra, capUsd: cap } };
  }
  if (a.tier && !o.model) {
    const pick = tierPick(db, a.tier, o.agent, o.acpAgent);
    if (pick?.model) out = { ...out, model: pick.model };
    if (pick?.effort && !o.effort) out = { ...out, effort: pick.effort };
  }
  return out;
}

/** What the Agents page shows of every agent, by id: its schedules, what is at work or waiting, what it spent this month. */
export function activity(db: DB, scheduler: Scheduler, live: { key: string; status?: string }[]): Record<string, AgentActivity> {
  const out: Record<string, AgentActivity> = {};
  for (const a of allAssistants(db)) {
    const m = monthSpend(db, a.id);
    const last = db.prepare('select max(created_at) as at from app_sessions where instr(extra, ?) > 0').get(`"assistant":${JSON.stringify(a.id)}`) as { at: number | null } | undefined;
    out[a.id] = { schedules: [], working: 0, waiting: 0, monthUsd: m.usd, monthSessions: m.sessions, ...(last?.at ? { lastAt: last.at } : {}) };
  }
  for (const t of scheduler.list()) {
    const id = t.extra?.assistant;
    if (typeof id !== 'string' || !out[id]) continue;
    out[id].schedules.push({ id: t.id, name: t.name, schedule: t.schedule, enabled: t.enabled, ...(t.nextAt ? { nextAt: t.nextAt } : {}), ...(t.lastStatus ? { lastStatus: t.lastStatus } : {}) });
  }
  for (const s of live) {
    const id = sessionExtra(db, s.key).assistant;
    if (typeof id !== 'string' || !out[id]) continue;
    if (s.status === 'working' || s.status === 'starting') out[id].working++;
    else if (s.status === 'waiting') out[id].waiting++;
  }
  return out;
}
