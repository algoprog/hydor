// An agent's history: every result it handed back (hand_back), with where each went, kept in its own table for its
// page's table of runs and the API. Results up to a year old are kept, at most RESULTS_KEEP.count an agent, whichever
// comes first; each is cut to a size a list can show (a big table is whole in the places it went). Also the
// pages an agent's first run made for its results (a page updated each run, a spreadsheet a row goes into), so later
// runs find them again.
import { RESULTS_KEEP, type AgentResult, type OutputKind, type ResultPlaces } from '../../shared/assistants.ts';
import { kvGet, kvSet, type DB } from '../db.ts';
import { pageInfo } from '../pages/store.ts';

const DAY = 86_400_000;
/** The most of a result kept here, in characters of JSON. */
const MAX_VALUE = 20_000;
/** What stands for a field too long to keep here. */
export const CUT = 'Too long to keep here: see where it went.';

const ready = new WeakSet<DB>();
const moved = new WeakMap<DB, Set<string>>();

function table(db: DB) {
  if (ready.has(db)) return;
  db.exec(`
    create table if not exists agent_results (
      id integer primary key autoincrement,
      agent text not null,
      at integer not null,
      session_key text not null,
      line text not null,
      value text not null,
      sent text not null
    );
    create index if not exists agent_results_agent on agent_results (agent, id);
  `);
  ready.add(db);
}

/** Where results were kept before this table: the last twenty, in the kv table. Moved in once, oldest first. */
const oldKey = (id: string) => `assistants.results.${id}`;
function moveOld(db: DB, id: string) {
  table(db);
  let seen = moved.get(db);
  if (!seen) moved.set(db, (seen = new Set()));
  if (seen.has(id)) return;
  seen.add(id);
  const raw = kvGet(db, oldKey(id));
  if (!raw) return;
  let list: AgentResult[] = [];
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) list = v;
  } catch {
    /* nothing to move */
  }
  const add = db.prepare('insert into agent_results (agent, at, session_key, line, value, sent) values (?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const r of [...list].reverse()) add.run(id, Number(r.at) || 0, String(r.key ?? ''), String(r.line ?? ''), JSON.stringify(r.value ?? {}), JSON.stringify(r.sent ?? []));
    db.prepare('delete from kv where k = ?').run(oldKey(id));
  })();
}

/** A result's fields as kept: the longest put aside (CUT in their place) until it is short enough to list. */
export function keptValue(v: Record<string, unknown>, max = MAX_VALUE): Record<string, unknown> {
  if (JSON.stringify(v).length <= max) return v;
  const out = { ...v };
  const bySize = Object.keys(out).sort((a, b) => JSON.stringify(out[b] ?? null).length - JSON.stringify(out[a] ?? null).length);
  for (const k of bySize) {
    out[k] = CUT;
    if (JSON.stringify(out).length <= max) break;
  }
  return out;
}

/** Keeps a result in an agent's history, and lets the oldest go by the rule (a year, RESULTS_KEEP.count). */
export function keepResult(db: DB, id: string, r: AgentResult, now = Date.now()) {
  moveOld(db, id);
  db.prepare('insert into agent_results (agent, at, session_key, line, value, sent) values (?, ?, ?, ?, ?, ?)').run(
    id,
    r.at,
    r.key,
    r.line.slice(0, 300),
    JSON.stringify(keptValue(r.value)),
    JSON.stringify(r.sent),
  );
  pruneResults(db, id, now);
}

/** Lets an agent's results go once they are over a year old or past the most it keeps. */
export function pruneResults(db: DB, id: string, now = Date.now()) {
  table(db);
  db.prepare('delete from agent_results where agent = ? and at < ?').run(id, now - RESULTS_KEEP.days * DAY);
  db.prepare('delete from agent_results where agent = ? and id not in (select id from agent_results where agent = ? order by id desc limit ?)').run(id, id, RESULTS_KEEP.count);
}

interface Row {
  id: number;
  at: number;
  session_key: string;
  line: string;
  value: string;
  sent: string;
}

const parse = <T>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

const toResult = (r: Row): AgentResult => ({ id: r.id, at: r.at, key: r.session_key, line: r.line, value: parse(r.value, {}), sent: parse(r.sent, []) });

/** A page of an agent's history, newest first: those before the result `before` (by its id), `limit` of them. */
export function resultsPage(db: DB, id: string, o: { before?: number; limit?: number } = {}): { results: AgentResult[]; total: number; more: boolean } {
  moveOld(db, id);
  const limit = Math.max(1, Math.min(200, Math.floor(o.limit ?? 50)));
  const before = o.before && Number.isFinite(o.before) ? o.before : Number.MAX_SAFE_INTEGER;
  const rows = db.prepare('select id, at, session_key, line, value, sent from agent_results where agent = ? and id < ? order by id desc limit ?').all(id, before, limit + 1) as Row[];
  const total = (db.prepare('select count(*) as n from agent_results where agent = ?').get(id) as { n: number }).n;
  return { results: rows.slice(0, limit).map(toResult), total, more: rows.length > limit };
}

/** The results an agent handed back lately, newest first. */
export const resultsOf = (db: DB, id: string, limit = 50): AgentResult[] => resultsPage(db, id, { limit }).results;

// ---- the pages its first run made -----------------------------------------------------------------------------

type Made = Partial<Record<'library' | 'sheet', string>>;
const madeKey = (id: string) => `assistants.made.${id}`;

/** The pages an agent's first run made for its results, by the kind of place: their ids. */
export function madeOf(db: DB, id: string): Made {
  return parse<Made>(kvGet(db, madeKey(id)) ?? '{}', {});
}

export function setMade(db: DB, id: string, kind: 'library' | 'sheet', page: string) {
  kvSet(db, madeKey(id), JSON.stringify({ ...madeOf(db, id), [kind]: page }));
}

/** The same, with their titles, for the pages that are still there. */
export function madePlaces(db: DB, id: string): ResultPlaces {
  const out: ResultPlaces = {};
  for (const [k, page] of Object.entries(madeOf(db, id)) as ['library' | 'sheet', string][]) {
    const p = page ? pageInfo(db, page) : null;
    if (p) out[k] = { id: p.id, title: p.title };
  }
  return out;
}

/** An agent deleted: its history and what its runs made go from here (the pages stay). */
export function forgetResults(db: DB, id: string) {
  table(db);
  db.prepare('delete from agent_results where agent = ?').run(id);
  db.prepare('delete from kv where k in (?, ?)').run(oldKey(id), madeKey(id));
}

/** How each kind of place is said in a sentence (for the agent and the API's words). */
export const PLACE: Record<OutputKind, string> = {
  file: 'a file',
  library: 'a page',
  sheet: 'a row in a spreadsheet',
  email: 'an email',
  webhook: 'a webhook',
  notify: 'a notification',
};
