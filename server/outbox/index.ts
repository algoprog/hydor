// The Outbox: a connected account's tool set to Ask first is never called straight away. Its call is kept here
// instead, the agent hears at once that it waits for the person's OK (runs never sit waiting), and the call waits in
// the Inbox as a draft: the person changes it if they like, then Send (Hydor makes the call itself, call.ts) or Drop.
// A test run that sends nothing keeps every call that acts outside here too, as "would have sent", never made.
//
//   gateCall          the relay (remote accounts) and the bridge (local ones) ask it before each tools/call
//   /api/outbox       the list, Send (with the changed input), Drop and Send all for a session
//   the session       a line where the call was held, later what became of it; its agent hears the outcome
//                     with the person's next message
//
// Held calls are kept in the database (they wait over restarts) for 30 days.
import crypto from 'node:crypto';
import { actsOutside, heldLine, heldShape, type HeldCall, type HeldStatus, type OutboxNote } from '../../shared/outbox.ts';
export { askMarked } from '../../shared/outbox.ts';
import type { NotifyEvent } from '../../shared/types.ts';
import { HttpError } from '../auth.ts';
import { getRun, openRunIn, runOfApp } from '../automations/runs.ts';
import { connection, toolFacts, toolState, type Conn } from '../connections/apps.ts';
import { redact } from '../connections/vault.ts';
import type { DB } from '../db.ts';
import type { Deps, Feature } from '../features/types.ts';
import { addNote, getNote, updateNote } from '../notes.ts';
import { opensTurn } from '../opinion/turns.ts';
import { sessionExtra } from '../sessionExtra.ts';
import { callTool } from './call.ts';

/** How long held calls (and their outcomes) are kept. */
export const KEEP_MS = 30 * 24 * 3600_000;
/** Most of a tool's answer kept on its card. */
const MAX_RESULT = 20_000;

interface Row {
  id: string;
  status: HeldStatus;
  key: string | null;
  run_id: string | null;
  app: string;
  app_name: string;
  tool: string;
  description: string | null;
  input: string;
  schema: string | null;
  shape: string;
  result: string | null;
  note: string | null;
  told: number;
  at: number;
  decided_at: number | null;
}

export function outboxTables(db: DB) {
  db.exec(`create table if not exists outbox_calls (
    id text primary key, status text not null, key text, run_id text, app text not null, app_name text not null, tool text not null,
    description text, input text not null, schema text, shape text not null, result text, note text, told integer not null default 1,
    at integer not null, decided_at integer
  );
  create index if not exists outbox_calls_status on outbox_calls(status, at);
  create index if not exists outbox_calls_key on outbox_calls(key, at);
  create index if not exists outbox_calls_run on outbox_calls(run_id);`);
}

const json = <T>(s: string | null, d: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
};

const getRow = (db: DB, id: string) => db.prepare('select * from outbox_calls where id = ?').get(id) as Row | undefined;

/** A row as the pages see it, with its session's name and agent, and its task's name. */
function view(d: Deps, r: Row): HeldCall {
  const s = r.key ? d.sessions.summary(r.key) : null;
  let task: string | undefined;
  if (r.run_id) {
    const run = getRun(d.db, r.run_id);
    if (run?.task_id) task = (d.db.prepare('select name from tasks where id = ?').get(run.task_id) as { name: string } | undefined)?.name;
  }
  return {
    id: r.id,
    status: r.status,
    ...(r.key ? { key: r.key } : {}),
    ...(s ? { session: s.title, agent: s.agent } : {}),
    ...(r.run_id ? { run: r.run_id } : {}),
    ...(task ? { task } : {}),
    app: r.app,
    appName: r.app_name,
    tool: r.tool,
    ...(r.description ? { description: r.description } : {}),
    input: json(r.input, {}),
    ...(r.schema ? { schema: json(r.schema, undefined) } : {}),
    shape: r.shape as HeldCall['shape'],
    ...(r.result ? { result: r.result } : {}),
    at: r.at,
    ...(r.decided_at ? { decidedAt: r.decided_at } : {}),
  };
}

/** Held calls: those waiting for an OK (and those that failed when sent), or all of a session's or a run's. */
export function listHeld(d: Deps, o: { key?: string; run?: string; all?: boolean } = {}): HeldCall[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (o.key) (where.push('key = ?'), args.push(o.key));
  if (o.run) (where.push('run_id = ?'), args.push(o.run));
  if (!o.all) where.push(`status in ('held', 'sending', 'failed')`);
  const rows = d.db.prepare(`select * from outbox_calls ${where.length ? `where ${where.join(' and ')}` : ''} order by at desc limit 500`).all(...args) as Row[];
  return rows.map((r) => view(d, r));
}

export const heldCount = (db: DB) => (db.prepare(`select count(*) as n from outbox_calls where status in ('held', 'sending', 'failed')`).get() as { n: number }).n;

/** The pages hear that the Outbox changed (the Inbox's count, its list, a run's history). */
const changed = (d: Deps) => d.broadcast({ t: 'feature', id: 'outbox', data: { held: heldCount(d.db) } });

// ---- the gate --------------------------------------------------------------------------------------------

/**
 * Whether the session's work now is a test that sends nothing: its scheduled run (a test run marked dry), the run it
 * was started for, or the app run it belongs to, while that run goes on; or a try of an agent's example.
 */
export function isDry(db: DB, key: string): boolean {
  try {
    // A try of an agent's example (Try the examples) sends nothing, ever.
    if (sessionExtra(db, key).agentExample) return true;
    const open = openRunIn(db, key);
    if (open) return !!open.dry;
    const extra = sessionExtra(db, key);
    const a = extra.automations as { run?: string; dry?: boolean } | undefined;
    if (a?.dry && a.run) return getRun(db, a.run)?.status === 'running';
    const app = extra.app as { run?: string } | undefined;
    if (app?.run) {
      const r = runOfApp(db, app.run);
      return !!r?.dry && r.status === 'running';
    }
  } catch {}
  return false;
}

/** What the agent gets back for a held call, at once, in place of the tool's answer. */
export function heldText(appName: string, tool: string, dry: boolean): string {
  if (dry)
    return `Not sent: this is a test that sends nothing, so this call to ${appName}'s ${tool} was not made. It is kept as one it would have sent, and the user sees it in the run's history. Carry on as if it had gone through; do not call it again or try another way to send it.`;
  return `Held for the user's OK: this call to ${appName}'s ${tool} was not made. The tool is set to Ask first, so the call waits in the user's Outbox (in their Inbox), where they can change it, then send or drop it; Hydor makes it when they send it. Do not call it again or try another way to do the same. Carry on with the rest of the task, or end your turn, and say in your reply that it waits for their OK.`;
}

/** An MCP tools/call result for a held call. */
export const heldResult = (text: string) => ({ content: [{ type: 'text', text }], isError: false });

/**
 * Before a call to a connected account's tool: null lets it through (On, or Off, which the caller refuses as before);
 * otherwise the call is held (Ask first, or anything that acts outside during a test that sends nothing) and this is
 * the answer the agent gets in its place.
 */
export function gateCall(d: Deps, o: { key: string; conn: Conn; tool: string; args: unknown }): { text: string } | null {
  const state = toolState(o.conn, o.tool);
  if (state === 'off') return null;
  const dry = isDry(d.db, o.key);
  if (!(state === 'ask' || (dry && actsOutside(toolFacts(o.conn, o.tool))))) return null;
  hold(d, { key: o.key, conn: o.conn, tool: o.tool, args: o.args, dry });
  return { text: heldText(o.conn.entry.name, o.tool, dry) };
}

/** Keeps a call instead of making it: in the Outbox (or as "would have sent"), with a line in its session and a notice. */
export function hold(d: Deps, o: { key: string; conn: Conn; tool: string; args: unknown; dry?: boolean }): HeldCall {
  const facts = toolFacts(o.conn, o.tool);
  const input = o.args && typeof o.args === 'object' && !Array.isArray(o.args) ? (o.args as Record<string, unknown>) : {};
  const schema = facts.inputSchema && typeof facts.inputSchema === 'object' ? { properties: facts.inputSchema.properties, required: facts.inputSchema.required } : undefined;
  const shape = heldShape(o.tool, input, schema as HeldCall['schema']);
  const run = (() => {
    try {
      const open = openRunIn(d.db, o.key);
      if (open) return open.id;
      const a = sessionExtra(d.db, o.key).automations as { run?: string } | undefined;
      return a?.run ?? null;
    } catch {
      return null;
    }
  })();
  const id = crypto.randomBytes(8).toString('hex');
  const now = Date.now();
  d.db
    .prepare(
      `insert into outbox_calls (id, status, key, run_id, app, app_name, tool, description, input, schema, shape, told, at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(id, o.dry ? 'dry' : 'held', o.key, run, o.conn.id, o.conn.entry.name, o.tool, facts.description ?? null, JSON.stringify(input), schema ? JSON.stringify(schema) : null, shape, now);
  const call = view(d, getRow(d.db, id)!);
  void lineFor(d, call).catch((e) => console.warn(`[outbox] no line in ${o.key}: ${(e as Error).message}`));
  if (!o.dry) {
    const s = d.sessions.summary(o.key);
    d.sessions.emit('notify', {
      key: o.key,
      kind: 'waiting',
      title: s?.title ?? o.conn.entry.name,
      body: `Waits for your OK in the Outbox: ${heldLine(call)}`,
      agent: s?.agent ?? 'claude',
      at: now,
      url: '/inbox',
    } satisfies NotifyEvent);
  }
  changed(d);
  return call;
}

// ---- the line in the session -----------------------------------------------------------------------------

const noteData = (c: HeldCall): OutboxNote => ({
  call: c.id,
  status: c.status,
  app: c.app,
  appName: c.appName,
  tool: c.tool,
  line: heldLine(c),
  ...(c.result ? { result: c.result.replace(/\s+/g, ' ').slice(0, 300) } : {}),
});

/** A line in the session, under the turn that made the call. */
async function lineFor(d: Deps, c: HeldCall) {
  if (!c.key) return;
  let anchor: string | undefined;
  try {
    const items = (await d.sessions.timeline(c.key)).parser.items;
    for (let j = items.length - 1; j >= 0 && !anchor; j--) if (opensTurn(items[j])) anchor = items[j].id;
  } catch {}
  // Sent or dropped meanwhile: the line says so from the start.
  const now = getRow(d.db, c.id);
  const n = addNote(d.db, { key: c.key, kind: 'outbox', anchor, data: noteData(now ? view(d, now) : c) });
  d.db.prepare('update outbox_calls set note = ? where id = ?').run(n.id, c.id);
}

function updateLine(d: Deps, r: Row) {
  if (!r.note || !getNote(d.db, r.note)) return;
  updateNote(d.db, r.note, noteData(view(d, r)));
}

// ---- send, drop -----------------------------------------------------------------------------------------

const settle = (d: Deps, id: string, status: HeldStatus, result: string | null, tell: boolean) => {
  d.db.prepare('update outbox_calls set status = ?, result = ?, decided_at = ?, told = ? where id = ?').run(status, result, Date.now(), tell ? 0 : 1, id);
  const r = getRow(d.db, id)!;
  updateLine(d, r);
  changed(d);
  return r;
};

/** Makes a held call, with `input` in place of the agent's when given: what the account answered is kept on it. */
export async function sendHeld(d: Deps, id: string, input?: unknown): Promise<HeldCall> {
  const r = getRow(d.db, id);
  if (!r) throw new HttpError(404, 'That call is no longer in the Outbox');
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) throw new HttpError(400, 'input: the call’s fields, as an object');
  if (input !== undefined && JSON.stringify(input).length > 1_000_000) throw new HttpError(400, 'input: too long');
  // Only once: a second Send while it goes (two devices) finds it taken.
  const took = d.db.prepare(`update outbox_calls set status = 'sending', input = coalesce(?, input) where id = ? and status in ('held', 'failed')`).run(input === undefined ? null : JSON.stringify(input), id);
  if (!took.changes) throw new HttpError(409, r.status === 'sending' ? 'It is being sent already' : r.status === 'dry' ? 'A test that sends nothing keeps its calls to look at, not to send' : `It was ${r.status} already`);
  changed(d);
  const args = json<Record<string, unknown>>(getRow(d.db, id)!.input, {});
  const c = connection(d.db, r.app);
  let status: HeldStatus;
  let result: string;
  if (!c) {
    status = 'failed';
    result = `${r.app_name} is no longer connected (Apps → Connected apps).`;
  } else {
    try {
      const cwd = r.key ? d.sessions.summary(r.key)?.cwd : undefined;
      const out = await callTool(d, c, r.tool, args, { key: r.key ?? undefined, cwd });
      status = out.isError ? 'failed' : 'sent';
      result = out.text.slice(0, MAX_RESULT);
    } catch (e) {
      status = 'failed';
      result = `Could not reach ${r.app_name}: ${redact((e as Error).message)}`;
    }
  }
  return view(d, settle(d, id, status, result, true));
}

/** Drops a held call: it is never made. */
export function dropHeld(d: Deps, id: string): HeldCall {
  const r = getRow(d.db, id);
  if (!r) throw new HttpError(404, 'That call is no longer in the Outbox');
  const took = d.db.prepare(`update outbox_calls set status = 'dropped' where id = ? and status in ('held', 'failed')`).run(id);
  if (!took.changes) throw new HttpError(409, r.status === 'sending' ? 'It is being sent already' : `It was ${r.status} already`);
  return view(d, settle(d, id, 'dropped', r.result, true));
}

/** Sends every call a session (or a run) holds, one after the other, as they are. */
export async function sendAll(d: Deps, o: { key?: string; run?: string }): Promise<HeldCall[]> {
  if (!o.key && !o.run) throw new HttpError(400, 'Name the session (key) or the run whose calls to send');
  const ids = listHeld(d, o)
    .filter((c) => c.status === 'held')
    .reverse()
    .map((c) => c.id);
  const out: HeldCall[] = [];
  for (const id of ids) out.push(await sendHeld(d, id).catch(() => view(d, getRow(d.db, id)!)));
  return out;
}

/** What the session's agent has not heard yet of its held calls (sent with their answers, or dropped): with the next message. */
export function outcomesFor(db: DB, key: string): string | null {
  const rows = db.prepare(`select * from outbox_calls where key = ? and told = 0 and status in ('sent', 'failed', 'dropped') order by decided_at`).all(key) as Row[];
  if (!rows.length) return null;
  db.prepare(`update outbox_calls set told = 1 where key = ? and told = 0`).run(key);
  const lines = rows.map((r) => {
    const what = `${r.app_name}'s ${r.tool}`;
    const ans = (r.result ?? '').replace(/\s+/g, ' ').trim().slice(0, 1500);
    if (r.status === 'sent') return `- The user sent your held call to ${what}${ans ? `. It answered: ${ans}` : '.'}`;
    if (r.status === 'failed') return `- The user sent your held call to ${what}, and it failed${ans ? `: ${ans}` : '.'} It waits in their Outbox again.`;
    return `- The user dropped your held call to ${what}: it was not made.`;
  });
  return `From the user's Outbox (calls you made that waited for their OK):\n${lines.join('\n')}`;
}

/** Calls kept more than 30 days go (their lines in sessions stay). */
export function sweepOld(db: DB, now = Date.now()): number {
  return db.prepare('delete from outbox_calls where at < ?').run(now - KEEP_MS).changes;
}

// ---- the capability ---------------------------------------------------------------------------------------

const q = (req: { query: unknown }) => (req.query ?? {}) as Record<string, string | undefined>;
const b = (req: { body: unknown }) => (req.body ?? {}) as Record<string, unknown>;
const idOf = (req: { params: unknown }) => String((req.params as { id: string }).id);

export const outbox: Feature = {
  id: 'outbox',
  routes(d) {
    outboxTables(d.db);
    d.app.get('/api/outbox', async (req) => {
      const o = q(req);
      return { calls: listHeld(d, { key: o.key || undefined, run: o.run || undefined, all: o.all === '1' || o.all === 'true' }), held: heldCount(d.db) };
    });
    d.app.post('/api/outbox/send-all', async (req) => {
      const o = b(req);
      return { calls: await sendAll(d, { key: typeof o.key === 'string' && o.key ? o.key : undefined, run: typeof o.run === 'string' && o.run ? o.run : undefined }) };
    });
    d.app.post('/api/outbox/:id/send', async (req) => ({ call: await sendHeld(d, idOf(req), b(req).input) }));
    d.app.post('/api/outbox/:id/drop', async (req) => ({ call: dropHeld(d, idOf(req)) }));
  },
  // Held calls wait in the Inbox, each as a draft to send or drop there.
  inbox: (d) =>
    listHeld(d).map((c) => ({
      id: `outbox:${c.id}`,
      kind: 'outbox' as const,
      title: `${c.appName} · ${c.tool}`,
      detail: heldLine(c),
      key: c.key,
      session: c.session,
      agent: c.agent,
      at: c.at,
      path: c.key ? `/s/${encodeURIComponent(c.key)}` : '/inbox',
      outbox: c,
    })),
  beforeMessage: (key, d) => outcomesFor(d.db, key),
  start(d) {
    // Calls that were on their way when the app stopped: they may or may not have gone, so they wait again, saying so.
    const cut = d.db
      .prepare(`update outbox_calls set status = 'failed', result = ?, decided_at = ? where status = 'sending'`)
      .run('The app stopped while this was being sent: it may have gone or not. Check before you send it again.', Date.now()).changes;
    if (cut) changed(d);
    const sweep = () => {
      try {
        if (sweepOld(d.db)) changed(d);
      } catch (e) {
        console.warn(`[outbox] clearing old calls: ${(e as Error).message}`);
      }
    };
    setTimeout(sweep, 60_000).unref();
    setInterval(sweep, 6 * 3600_000).unref();
  },
};
