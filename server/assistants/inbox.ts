// Standing agents: an agent that keeps one conversation of its own. Messages for it (from you on its page, from other
// agents that hand it work) wait in its inbox and go into its conversation one at a time, each when the one before has
// its answer; the answer goes back to whoever sent it (another session hears it as a message, you get a notification).
// Its scheduled runs post into the same conversation through the scheduler, queued behind a turn under way. Its conversation is made the first time it is needed, in its project's folder
// when it works in one project, else in a folder of its own under the task folders, and it remembers what came before.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { agentMode, assistantExtra, type Assistant, type InboxItem } from '../../shared/assistants.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import type { Deps, TurnInfo } from '../features/types.ts';
import { lastTurn } from '../opinion/turns.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { spaceById } from '../spaces/index.ts';
import { monthSpend } from './rules.ts';
import { findAssistant, taskRoot } from './store.ts';

const MAX_TEXT = 40_000;

function tables(db: DB) {
  db.exec(`create table if not exists agent_inbox (
    id text primary key,
    agent text not null,
    sender text not null,
    text text not null,
    status text not null,
    reply text,
    reply_to text,
    created_at integer not null,
    sent_at integer,
    answered_at integer
  );
  create index if not exists agent_inbox_agent on agent_inbox (agent, created_at);`);
}

interface Row {
  id: string;
  agent: string;
  sender: string;
  text: string;
  status: InboxItem['status'];
  reply: string | null;
  reply_to: string | null;
  created_at: number;
  sent_at: number | null;
  answered_at: number | null;
}

const toItem = (r: Row): InboxItem => ({
  id: r.id,
  from: JSON.parse(r.sender),
  text: r.text,
  status: r.status,
  ...(r.reply ? { reply: r.reply } : {}),
  createdAt: r.created_at,
  ...(r.sent_at ? { sentAt: r.sent_at } : {}),
  ...(r.answered_at ? { answeredAt: r.answered_at } : {}),
});

/** An agent's inbox, newest first. */
export function inboxOf(db: DB, id: string, limit = 50): InboxItem[] {
  tables(db);
  return (db.prepare('select * from agent_inbox where agent = ? order by created_at desc limit ?').all(id, limit) as Row[]).map(toItem);
}

const standingKv = (id: string) => `assistants.standing.${id}`;

/** A standing agent's own session, when it has one. */
export const standingKey = (db: DB, id: string): string | null => kvGet(db, standingKv(id)) || null;

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'agent';

/** A standing agent's own session: the one it has, or a new one (in its project's folder, else a folder of its own). */
export async function ensureStanding(d: Deps, a: Assistant): Promise<string> {
  const have = standingKey(d.db, a.id);
  if (have && d.sessions.summary(have)) return have;
  const only = a.projects?.length === 1 ? spaceById(d.db, a.projects[0]) : null;
  const cwd = only?.folder ?? path.join(taskRoot(d.db), 'Agents', slug(a.name));
  fs.mkdirSync(cwd, { recursive: true });
  const agent = a.agent ?? 'claude';
  const acpAgent = agent === 'acp' ? a.acpAgent : undefined;
  const key = await d.sessions.create({
    agent,
    acpAgent,
    cwd,
    title: a.name,
    remember: false,
    mode: agentMode(a.mode, agent, acpAgent) ?? (agent === 'claude' ? 'default' : agent === 'codex' ? 'auto' : undefined),
    ...(a.agent && a.model && !a.tier ? { model: a.model } : {}),
    extra: { ...assistantExtra(a), ...(only ? { space: only.id } : {}), standing: a.id },
  });
  kvSet(d.db, standingKv(a.id), key);
  return key;
}

/** Puts a message in a standing agent's inbox; it goes into its conversation in its turn. */
export function sendToInbox(d: Deps, a: Assistant, m: { text: string; from: InboxItem['from']; replyTo?: string }): InboxItem {
  tables(d.db);
  const text = m.text.trim().slice(0, MAX_TEXT);
  if (!text) throw new Error('The message is empty');
  const id = crypto.randomBytes(6).toString('hex');
  d.db
    .prepare('insert into agent_inbox (id, agent, sender, text, status, reply_to, created_at) values (?, ?, ?, ?, ?, ?, ?)')
    .run(id, a.id, JSON.stringify(m.from), text, 'queued', m.replyTo ?? null, Date.now());
  d.broadcast({ t: 'feature', id: 'assistants', data: { inbox: a.id } });
  void pump(d, a.id).catch(() => {});
  return toItem(d.db.prepare('select * from agent_inbox where id = ?').get(id) as Row);
}

const tag = (id: string) => `inbox ${id.slice(0, 6)}`;
const BUSY = new Set(['starting', 'working', 'waiting']);

function settle(d: Deps, id: string, status: 'answered' | 'failed', reply: string) {
  d.db.prepare('update agent_inbox set status = ?, reply = ?, answered_at = ? where id = ?').run(status, reply.slice(0, MAX_TEXT), Date.now(), id);
}

const pumping = new Set<string>();

/** Sends the oldest waiting message into the agent's conversation, when it is free and has none out already. */
export async function pump(d: Deps, agentId: string): Promise<void> {
  if (pumping.has(agentId)) return;
  pumping.add(agentId);
  try {
    tables(d.db);
    for (;;) {
      const out = d.db.prepare("select id from agent_inbox where agent = ? and status = 'sent' limit 1").get(agentId);
      if (out) return;
      const next = d.db.prepare("select * from agent_inbox where agent = ? and status = 'queued' order by created_at limit 1").get(agentId) as Row | undefined;
      if (!next) return;
      const a = findAssistant(d.db, agentId);
      if (!a?.standing) {
        settle(d, next.id, 'failed', a ? `${a.name} no longer keeps a conversation of its own.` : 'The agent was deleted.');
        continue;
      }
      if (a.budgetUsd && monthSpend(d.db, a.id).usd >= a.budgetUsd) {
        settle(d, next.id, 'failed', `${a.name} has spent its $${a.budgetUsd} budget for this month.`);
        continue;
      }
      const key = await ensureStanding(d, a);
      const s = d.sessions.summary(key);
      // A turn under way: the next goes in when it ends (a session still starting takes it as it is ready).
      if (s?.live && (s.live.status === 'working' || s.live.status === 'waiting')) return;
      const from = JSON.parse(next.sender) as InboxItem['from'];
      const head =
        from.kind === 'user'
          ? `From the user · ${tag(next.id)}`
          : from.kind === 'agent'
            ? `From ${from.name} (another agent) · ${tag(next.id)} · your reply goes back to it`
            : `From the schedule "${from.name}" · ${tag(next.id)}`;
      d.db.prepare("update agent_inbox set status = 'sent', sent_at = ? where id = ?").run(Date.now(), next.id);
      try {
        await d.sessions.deliverOrQueue(key, `${head}\n\n${next.text}`);
      } catch (e) {
        settle(d, next.id, 'failed', (e as Error).message || 'It could not be sent.');
        continue;
      }
      d.broadcast({ t: 'feature', id: 'assistants', data: { inbox: agentId } });
      return;
    }
  } finally {
    pumping.delete(agentId);
  }
}

/** A standing agent's turn ended: the message it answered gets its answer, which goes back to who sent it; the next goes in. */
export async function inboxTurnEnded(d: Deps, t: Pick<TurnInfo, 'key'>): Promise<void> {
  const agentId = sessionExtra(d.db, t.key).standing;
  if (typeof agentId !== 'string') return;
  tables(d.db);
  const out = d.db.prepare("select * from agent_inbox where agent = ? and status = 'sent' limit 1").get(agentId) as Row | undefined;
  if (out) {
    const turn = lastTurn((await d.sessions.timeline(t.key)).parser.items);
    if (turn?.prompt && (turn.prompt.text ?? '').includes(tag(out.id)) && turn.status) {
      const reply = turn.reply.trim() || (turn.error ? `It stopped with an error: ${turn.error}` : 'It wrote no reply.');
      settle(d, out.id, turn.status === 'failed' && !turn.reply ? 'failed' : 'answered', reply);
      const a = findAssistant(d.db, agentId);
      const from = JSON.parse(out.sender) as InboxItem['from'];
      if (out.reply_to && d.sessions.summary(out.reply_to)) {
        const msg = `[Reply from ${a?.name ?? 'the agent'}, to the message you put in its inbox]\n\n${reply.length > 12_000 ? `${reply.slice(0, 12_000)}…\n(Cut short: the whole of it is in its conversation, ${t.key}.)` : reply}`;
        try {
          await d.sessions.deliverOrQueue(out.reply_to, msg);
        } catch {
          try {
            d.sessions.enqueue(out.reply_to, msg);
          } catch {}
        }
      } else if (from.kind === 'user') {
        const line = reply.split('\n').find((l) => l.trim()) ?? '';
        d.sessions.emit('notify', {
          key: t.key,
          kind: 'done',
          title: a?.name ?? 'Agent',
          body: line.slice(0, 200),
          agent: d.sessions.summary(t.key)?.agent ?? 'claude',
          at: Date.now(),
        } satisfies NotifyEvent);
      }
      d.broadcast({ t: 'feature', id: 'assistants', data: { inbox: agentId } });
    }
  }
  await pump(d, agentId);
}

/** Each standing agent's messages waiting and out, by id. */
export function inboxCounts(db: DB): Record<string, { queued: number; sent: number }> {
  tables(db);
  const out: Record<string, { queued: number; sent: number }> = {};
  for (const r of db.prepare("select agent, status, count(*) as n from agent_inbox where status in ('queued', 'sent') group by agent, status").all() as {
    agent: string;
    status: 'queued' | 'sent';
    n: number;
  }[]) {
    out[r.agent] ??= { queued: 0, sent: 0 };
    out[r.agent][r.status] = r.n;
  }
  return out;
}

/** Messages out for long with no answer seen (a restart, a turn missed) are settled; waiting ones go in. */
export async function sweepInboxes(d: Deps): Promise<void> {
  tables(d.db);
  const stale = d.db.prepare("select * from agent_inbox where status = 'sent' and sent_at < ?").all(Date.now() - 30 * 60_000) as Row[];
  for (const r of stale) {
    const key = standingKey(d.db, r.agent);
    const s = key ? d.sessions.summary(key) : null;
    if (s?.live && BUSY.has(s.live.status)) continue;
    if (key) await inboxTurnEnded(d, { key });
    const still = d.db.prepare('select status from agent_inbox where id = ?').get(r.id) as { status: string } | undefined;
    if (still?.status === 'sent') settle(d, r.id, 'failed', 'No answer came: open its conversation to see where it stands.');
  }
  const waiting = d.db.prepare("select distinct agent from agent_inbox where status = 'queued'").all() as { agent: string }[];
  for (const w of waiting) await pump(d, w.agent);
}
