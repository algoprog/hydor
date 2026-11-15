// The "A connected account" watcher: at each check Hydor calls one of a connected account's tools that only looks
// (a CRM's deals, a drive's files, a helpdesk's tickets), without a model, the way the Outbox sends a held call
// (server/outbox/call.ts: remote accounts over HTTP or SSE, local ones started for the call and stopped after it).
// It works out where the items are in the answer (the first list of records in its structured content, else in
// the JSON of its text) and which field tells them apart (id, key, uid, url…), unless the person picked them after
// Try it. Each new item starts a run of its own with the item as outside data, at most 10 a check (the rest summed up
// in a line), never the same item twice (what it has seen is kept, across restarts too); its first look only takes
// note. With "Before each event" (a calendar) it reads the upcoming events instead and starts a run a set time before
// each one, following an event that moves (the run is for its current time) and starting none for one cancelled.
// Errors (signed out, the tool gone or no longer one that only looks, an answer whose list or field is gone) fail the
// check, as other watchers' do, so no run starts on what it cannot read.
import crypto from 'node:crypto';
import type { AccountFind, AccountWatch, EventBefore, WatchAccount } from '../../shared/automations.ts';
import { leadText } from '../../shared/automations.ts';
import { onlyLooks, toolWords } from '../../shared/outbox.ts';
import { HttpError } from '../auth.ts';
import { connection, connections, toolFacts, toolState, type Conn, type StoredTool } from '../connections/apps.ts';
import { Unauthorized } from '../connections/upstream.ts';
import type { Deps } from '../features/types.ts';
import { MAIL_APP } from '../mail/accounts.ts';
import { callTool, type CallResult } from '../outbox/call.ts';
import { userTimezone } from '../userPrefs.ts';
import { HHMM, localText, wallAt, zonedTime } from './schedule.ts';

/** At most this many runs per check; the other new items are summed up in a line in the first run. */
export const MAX_RUNS = 10;
/** How many items' ids it remembers (the newest first). */
const KEEP_IDS = 5000;
/** How long a check's call may take. */
const CALL_MS = 90_000;

let deps: Deps | null = null;
/** The app's parts the watcher calls accounts with (the automations feature gives them at start). */
export const useAccountDeps = (d: Deps) => {
  deps = d;
};
const need = (): Deps => {
  if (!deps) throw new Error('Connected accounts cannot be watched on this server');
  return deps;
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const scalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

// ---- arguments: {{now}}, {{now+2d}}, {{today}} ------------------------------------------------------------------

const UNIT: Record<string, number> = { m: 60_000, h: 3600_000, d: 86_400_000, w: 7 * 86_400_000 };
const PLACE = /\{\{\s*(now|today|tomorrow|yesterday)\s*(?:([+-])\s*(\d{1,4})\s*([mhdw]))?\s*\}\}/gi;

/** A local day as YYYY-MM-DD. */
const dayOf = (tz: string, at: number) => {
  const w = wallAt(tz, at);
  return `${w.y}-${String(w.mo).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`;
};

/** The arguments with {{now}} (an ISO time), {{now+2d}}, {{now-1h}}, {{today}}, {{tomorrow}} filled in for this check. */
export function fillArgs(args: Record<string, unknown>, now: number, tz: string): Record<string, unknown> {
  const fill = (v: unknown): unknown => {
    if (typeof v === 'string')
      return v.replace(PLACE, (_m, what: string, sign?: string, n?: string, unit?: string) => {
        const shift = sign ? (sign === '-' ? -1 : 1) * Number(n) * UNIT[unit!.toLowerCase()] : 0;
        const w = what.toLowerCase();
        if (w === 'now') return new Date(now + shift).toISOString().replace(/\.\d{3}Z$/, 'Z');
        const day = w === 'tomorrow' ? 1 : w === 'yesterday' ? -1 : 0;
        return dayOf(tz, now + day * 86_400_000 + shift);
      });
    if (Array.isArray(v)) return v.map(fill);
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(args) as Record<string, unknown>;
}

// ---- the answer as data ---------------------------------------------------------------------------------------

/** JSON in a text: the whole of it, or the part from its first bracket to its last (after a line of words, in a code block). */
function jsonIn(text: string): unknown {
  const t = text.trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {}
  const i = t.search(/[[{]/);
  if (i < 0) return undefined;
  const j = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (j <= i) return undefined;
  try {
    return JSON.parse(t.slice(i, j + 1));
  } catch {
    return undefined;
  }
}

/** The JSON in a tool's text parts: one part's, or a list of them when each part is one item. */
export function textData(parts: string[]): unknown {
  const found = parts.map(jsonIn).filter((x) => x !== undefined);
  if (!found.length) return undefined;
  if (found.length === 1) return found[0];
  return found.every(isObj) ? found : found[0];
}

/** What a watcher reads in a tool's answer: its structured content when that holds a list, else the JSON in its text. */
export function answerData(r: Pick<CallResult, 'structured' | 'parts' | 'text'>): unknown {
  const s = r.structured;
  const t = textData(r.parts?.length ? r.parts : [r.text]);
  if (s !== undefined && s !== null && typeof s === 'object' && findLists(s).some((l) => l.count > 0)) return s;
  if (t !== undefined && t !== null && typeof t === 'object' && findLists(t).length) return t;
  return s ?? t;
}

// ---- lists and fields -----------------------------------------------------------------------------------------

/** The value at a path like "data.items" or "start.dateTime" ("" is the value itself). */
export function at(data: unknown, p: string): unknown {
  if (!p) return data;
  let v: unknown = data;
  for (const k of p.split('.')) {
    if (v == null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

export interface FoundList {
  /** Where it is ("" for the answer itself). */
  path: string;
  count: number;
  /** Its items are records (objects), not plain values. */
  records: boolean;
}

/** Each list in an answer, in the order they come: arrays of records, or of plain values (names, ids). */
export function findLists(data: unknown): FoundList[] {
  const out: FoundList[] = [];
  const walk = (v: unknown, p: string, depth: number) => {
    if (Array.isArray(v)) {
      const objs = v.filter(isObj).length;
      const plain = v.filter((x) => typeof x === 'string' || typeof x === 'number').length;
      if (!v.length) out.push({ path: p, count: 0, records: true });
      else if (objs >= Math.ceil(v.length * 0.8)) out.push({ path: p, count: v.length, records: true });
      else if (plain === v.length) out.push({ path: p, count: v.length, records: false });
      return;
    }
    if (!isObj(v) || depth > 6) return;
    for (const [k, x] of Object.entries(v)) if (!k.includes('.')) walk(x, p ? `${p}.${k}` : k, depth + 1);
  };
  walk(data, '', 0);
  return out;
}

/** The list to use: the first list of records with items in it, else the first of plain values, else the first (empty) one. */
export function bestList(lists: FoundList[]): string | null {
  return (lists.find((l) => l.records && l.count > 0) ?? lists.find((l) => !l.records && l.count > 0) ?? lists[0])?.path ?? null;
}

/** The items at a path: null when there is no list there. */
export function listAt(data: unknown, p: string): unknown[] | null {
  const v = at(data, p);
  return Array.isArray(v) ? v : null;
}

/** A time a field holds: an ISO date or time, seconds or milliseconds since 1970, or a calendar's {dateTime} or {date}. */
export function timeOf(v: unknown, tz: string): number | null {
  if (isObj(v)) {
    for (const k of ['dateTime', 'date_time', 'datetime', 'date', 'time', 'value']) if (v[k] !== undefined) return timeOf(v[k], tz);
    return null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 9.5e11 && v < 1e13) return v;
    if (v > 9.5e8 && v < 1e10) return v * 1000;
    return null;
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  // A whole day (an all-day event): its start in your time zone.
  if (day) return zonedTime(tz, Number(day[1]), Number(day[2]), Number(day[3]), 0, 0);
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s)) return /^\d{10,13}$/.test(s) ? timeOf(Number(s), tz) : null;
  // A time without a zone is one in your time zone.
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s)!;
    return zonedTime(tz, Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  }
  const t = Date.parse(s.replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

/** The fields of a list's items that are plain values (and calendar times), two levels down at most, in the order they come. */
export function itemFields(items: unknown[], tz = 'UTC'): AccountFind['fields'] {
  const recs = items.filter(isObj).slice(0, 200);
  if (!recs.length) return items.length ? [{ path: '*', sample: String(items[0]), unique: new Set(items.map(String)).size === items.length, time: false }] : [];
  const order: string[] = [];
  const add = (p: string) => !order.includes(p) && order.push(p);
  const walk = (o: Record<string, unknown>, p: string, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      if (k.includes('.')) continue;
      const q = p ? `${p}.${k}` : k;
      if (scalar(v) || v === null) add(q);
      else if (isObj(v)) {
        if (timeOf(v, tz) !== null) add(q);
        if (depth < 1) walk(v, q, depth + 1);
      }
    }
  };
  for (const r of recs) walk(r, '', 0);
  return order.slice(0, 80).map((p) => {
    const vals = recs.map((r) => at(r, p));
    const present = vals.filter((v) => v !== undefined && v !== null && v !== '');
    const keys = present.map((v) => (isObj(v) ? JSON.stringify(v) : String(v)));
    const first = present[0];
    // A calendar's time ({ dateTime, timeZone }) shows as its time.
    const inner = isObj(first) ? ['dateTime', 'date_time', 'datetime', 'date', 'time', 'value'].map((k) => first[k]).find((x) => scalar(x)) : undefined;
    return {
      path: p,
      sample: clip(first === undefined ? '' : isObj(first) ? (inner !== undefined ? String(inner) : JSON.stringify(first)) : String(first), 80),
      unique: present.length === recs.length && new Set(keys).size === keys.length && present.every((v) => typeof v === 'string' || typeof v === 'number'),
      time: present.length > 0 && present.every((v) => timeOf(v, tz) !== null),
    };
  });
}

const ID_NAMES = ['id', 'uid', 'uuid', '_id', 'key', 'guid', 'gid', 'iid', 'sid', 'object_id', 'objectid', 'record_id', 'recordid'];
const URL_NAMES = ['url', 'uri', 'link', 'href', 'permalink', 'web_url', 'weburl', 'html_url', 'htmlurl', 'webviewlink', 'self', 'path', 'path_display', 'path_lower'];
const OTHER_NAMES = ['number', 'slug', 'name', 'title'];

/** The field that tells items apart: an id first (id, uid, key…), then one ending in id, then an address (url, link…); "*" for plain values or when none does. Null for an empty list. */
export function bestId(items: unknown[], fields = itemFields(items)): string | null {
  if (!items.length) return null;
  if (!items.some(isObj)) return '*';
  const ok = fields.filter((f) => f.unique && !f.time);
  const leaf = (p: string) => p.split('.').pop()!.toLowerCase();
  const pick = (test: (p: string) => boolean) => ok.filter((f) => test(f.path)).sort((a, b) => a.path.split('.').length - b.path.split('.').length)[0]?.path;
  for (const n of ID_NAMES) {
    const p = pick((x) => leaf(x) === n);
    if (p) return p;
  }
  // ticketId, deal_id, objectID (not "paid" or "valid").
  const ends = pick((x) => /(?:_id|[a-z0-9]Id|[a-z0-9]ID)$/.test(x.split('.').pop()!));
  if (ends) return ends;
  for (const n of [...URL_NAMES, ...OTHER_NAMES]) {
    const p = pick((x) => leaf(x) === n);
    if (p) return p;
  }
  return '*';
}

/** An item's id: its field's value, or (for "*") the item itself, or a fingerprint of it. Null when the field is missing. */
export function idOf(item: unknown, p: string): string | null {
  if (p === '*') return scalar(item) ? String(item) : `#${crypto.createHash('sha1').update(JSON.stringify(item)).digest('hex').slice(0, 16)}`;
  const v = at(item, p);
  if (v === undefined || v === null || v === '') return null;
  return scalar(v) ? String(v) : JSON.stringify(v);
}

const TITLE_NAMES = ['title', 'name', 'summary', 'subject', 'topic', 'display_name', 'displayName', 'full_name', 'fullName', 'email', 'description', 'text', 'message', 'filename', 'file_name', 'path_display'];

/** An item's title: the first of its title, name, summary, subject… (in it, or in its properties or fields). */
export function titleOf(item: unknown): string {
  if (scalar(item)) return String(item);
  if (!isObj(item)) return '';
  for (const where of [item, item.properties, item.fields, item.attributes, item.values, item.data]) {
    if (!isObj(where)) continue;
    for (const n of TITLE_NAMES) {
      const v = where[n];
      if (typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').trim();
    }
    const first = where.firstname ?? where.first_name ?? where.firstName;
    const last = where.lastname ?? where.last_name ?? where.lastName;
    if (typeof first === 'string' || typeof last === 'string') return [first, last].filter((x) => typeof x === 'string').join(' ');
    // A service's own word for it: dealname, fileName, ticket_subject…
    for (const [k, v] of Object.entries(where)) if (/(name|title|subject|summary)$/i.test(k) && typeof v === 'string' && v.trim()) return v.replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** An item in a line: its title and id. */
export function itemLine(item: unknown, idPath: string | null): string {
  const t = titleOf(item);
  const id = idPath && idPath !== '*' ? idOf(item, idPath) : null;
  return `- ${clip(t || clip(JSON.stringify(item), 140), 140)}${id && id !== t ? ` (${idPath}: ${clip(id, 80)})` : ''}`;
}

/** The field with an event's start: one holding a time named start, begin, from…, else the first holding a time. */
export function bestStart(fields: AccountFind['fields']): string | null {
  const times = fields.filter((f) => f.time);
  const named = (re: RegExp) => times.find((f) => re.test(f.path));
  return (named(/^start(s|_?time|_?at|_?date|_?date_?time)?$/i) ?? named(/start|begin/i) ?? named(/^(from|when|date|time|scheduled)/i) ?? times.find((f) => !/end|until|updat|creat|modif/i.test(f.path)))?.path ?? null;
}

/** A created or added time field (the order new items came in), when every item has one. */
function createdField(fields: AccountFind['fields']): string | null {
  const times = fields.filter((f) => f.time);
  return (times.find((f) => /creat|added|insert|received|submitted|opened|posted/i.test(f.path)) ?? times.find((f) => /^(date|time|timestamp)$/i.test(f.path)))?.path ?? null;
}

// ---- what the watcher may call --------------------------------------------------------------------------------

/** Why a tool may not be watched, or null: it must be known, only look, and be On. */
export function toolProblem(c: Conn, tool: string): Error | null {
  if (c.tools && !c.tools.some((t) => t.name === tool)) return new Error(`${c.entry.name} has no tool ${tool} (as of its last test in Apps → Connected apps)`);
  if (!c.tools) return new Error(`${c.entry.name}'s tools are not known yet: test it in Apps → Connected apps first`);
  if (!onlyLooks(toolFacts(c, tool))) return new Error(`${tool} sends, changes or deletes things, so a watcher may not call it: pick one of ${c.entry.name}'s tools that only looks (lists or searches)`);
  const st = toolState(c, tool);
  if (st === 'ask') return new Error(`${tool} is set to Ask first in Apps → Connected apps, and a watcher only calls tools that are On`);
  if (st !== 'on') return new Error(`${tool} is set to Off in Apps → Connected apps, and a watcher only calls tools that are On`);
  return null;
}

/** The account, ready to be called; throws saying why not. */
function ready(w: AccountWatch): Conn {
  const c = connection(need().db, w.app);
  if (!c) throw new Error(`${w.name ?? w.app} is no longer connected (Apps → Connected apps)`);
  if (c.status === 'signin') throw new Error(`${c.entry.name} is signed out: connect it again in Apps → Connected apps`);
  const why = toolProblem(c, w.tool);
  if (why) throw why;
  return c;
}

/** Calls the tool once: what it answered, or an error saying what went wrong. */
async function callOnce(w: AccountWatch, now: number, tz: string, cwd: string): Promise<{ c: Conn; r: CallResult }> {
  const c = ready(w);
  let r: CallResult;
  try {
    r = await callTool(need(), c, w.tool, fillArgs(w.args ?? {}, now, tz), { cwd, timeoutMs: CALL_MS });
  } catch (e) {
    if (e instanceof Unauthorized) throw new Error(`${c.entry.name} refused the sign-in: connect it again in Apps → Connected apps`);
    throw new Error(`Could not reach ${c.entry.name}: ${(e as Error).message}`);
  }
  if (r.isError) throw new Error(`${c.entry.name} answered with an error: ${clip(r.text.replace(/\s+/g, ' '), 300)}`);
  return { c, r };
}

/** A check that failed, with what Try it should still show (the answer as it came). */
export type AccountError = Error & { find?: AccountFind };
const withFind = (e: Error, find: AccountFind): AccountError => Object.assign(e, { find });
/** What Try it should still show of a check that failed. */
export const findOf = (e: unknown): AccountFind | undefined => (e instanceof Error ? (e as AccountError).find : undefined);

// ---- one check ------------------------------------------------------------------------------------------------

/** What the watcher keeps between looks: where the items are, the field that tells them apart, and what it has seen. */
export interface ItemsState {
  list: string;
  id: string | null;
  seen: string[];
}

/** For "Before each event": each event's start, and the start a run was made for (or its moment had passed at the first look). */
export interface EventsState {
  list: string;
  id: string | null;
  start: string | null;
  ev: Record<string, { s: number; r?: number }>;
}

export interface AccountCheck {
  changed: boolean;
  runs: { report: string; state: unknown }[];
  note: string;
  sample: string;
  state: ItemsState | EventsState;
  /** When to look again at the latest (the next event's moment). */
  nextAt?: number;
  find: AccountFind;
}

/** One look. `prev` is what the last look kept (undefined: the first look, which only takes note). `now` stands in for the clock in the tests. */
export async function checkAccount(w: AccountWatch, prev: unknown, o: { cwd: string; now?: number }): Promise<AccountCheck> {
  const now = o.now ?? Date.now();
  const tz = userTimezone(need().db);
  const { c, r } = await callOnce(w, now, tz, o.cwd);
  const p = isObj(prev) ? (prev as Partial<ItemsState & EventsState>) : undefined;
  return readAnswer(w, c.entry.name, r, p, { now, tz });
}

/** What a check makes of an answer (apart from the call, for the tests). */
export function readAnswer(w: AccountWatch, name: string, r: Pick<CallResult, 'structured' | 'parts' | 'text'>, p: Partial<ItemsState & EventsState> | undefined, o: { now: number; tz: string }): AccountCheck {
  const data = answerData(r);
  const lists = data !== undefined && data !== null && typeof data === 'object' ? findLists(data) : [];
  const raw = clip(r.structured !== undefined ? JSON.stringify(r.structured, null, 2) : r.text, 6000);
  const base: AccountFind = { lists: lists.map((l) => ({ path: l.path, count: l.count })), list: null, fields: [], id: null, items: [], raw };
  const listPath = w.list ?? p?.list ?? bestList(lists);
  if (listPath === null || listPath === undefined) throw withFind(new Error(`${name}'s answer has no list of items in it`), base);
  const items = data === undefined ? null : listAt(data, listPath);
  if (!items && listPath) throw withFind(new Error(`${name}'s answer changed: there is no list at “${listPath}” in it now`), base);
  if (!items) throw withFind(new Error(`${name}'s answer is not a list of items`), base);
  const fields = itemFields(items, o.tz);
  const idPath = w.id ?? p?.id ?? bestId(items, fields);
  const find: AccountFind = { ...base, list: listPath, fields, id: idPath, items: items.slice(0, 8).map((x) => itemLine(x, idPath)) };
  const ids: string[] = [];
  if (idPath) {
    for (const it of items) {
      const id = idOf(it, idPath);
      if (id === null) throw withFind(new Error(`${name}'s answer changed: an item has no “${idPath}” now`), find);
      ids.push(id);
    }
  }
  if (w.before) return readEvents(w, w.before, name, items, ids, fields, find, p, o);
  return readItems(w, name, items, ids, fields, find, p);
}

function readItems(w: AccountWatch, name: string, items: unknown[], ids: string[], fields: AccountFind['fields'], find: AccountFind, p: Partial<ItemsState> | undefined): AccountCheck {
  const list = find.list!;
  const id = find.id;
  const sample = items.length ? `${plural(items.length, 'item')} in ${name}'s answer${list ? ` (at ${list})` : ''}:\n${find.items.join('\n')}${items.length > 8 ? '\n…' : ''}` : `No items in ${name}'s answer now.`;
  const all = [...new Set(ids)];
  if (!p || !Array.isArray(p.seen)) {
    return { changed: false, runs: [], note: `${plural(items.length, 'item')} (first look: each new one from now on starts a run)`, sample, state: { list, id, seen: all.slice(0, KEEP_IDS) }, find };
  }
  const seen = new Set(p.seen);
  const fresh: { item: unknown; id: string }[] = [];
  const taken = new Set<string>();
  items.forEach((item, i) => {
    const x = ids[i];
    if (!seen.has(x) && !taken.has(x)) (taken.add(x), fresh.push({ item, id: x }));
  });
  const keep = (extra: string[]) => [...new Set([...extra, ...p.seen!])].slice(0, KEEP_IDS);
  const state: ItemsState = { list, id, seen: [...new Set([...all, ...p.seen])].slice(0, KEEP_IDS) };
  if (!fresh.length) return { changed: false, runs: [], note: `${plural(items.length, 'item')}, nothing new`, sample, state, find };
  // Oldest first when the items say when each came (the newest 10 get runs), else in the order the answer lists them (its first 10).
  const by = createdField(fields);
  let take: typeof fresh;
  let rest: typeof fresh;
  if (by && fresh.every((f) => timeOf(at(f.item, by), 'UTC') !== null)) {
    fresh.sort((a, b) => timeOf(at(a.item, by), 'UTC')! - timeOf(at(b.item, by), 'UTC')!);
    take = fresh.slice(-MAX_RUNS);
    rest = fresh.slice(0, fresh.length - take.length);
  } else {
    take = fresh.slice(0, MAX_RUNS);
    rest = fresh.slice(MAX_RUNS);
  }
  const restLine = rest.length
    ? `${plural(rest.length, 'other new item')} came in too and start${rest.length === 1 ? 's' : ''} no run of ${rest.length === 1 ? 'its' : 'their'} own: ${rest
        .slice(0, 20)
        .map((f) => itemLine(f.item, id).slice(2))
        .join('; ')}${rest.length > 20 ? '; …' : ''}.`
    : '';
  const done = rest.map((f) => f.id);
  const runs = take.map((f, i) => {
    done.push(f.id);
    const report = [
      `A new item from ${name} (its tool ${w.tool}${list ? `, in “${list}”` : ''}${id && id !== '*' ? `; its ${id}: ${idOf(f.item, id)}` : ''}).`,
      itemLine(f.item, null).slice(2),
      '',
      'The item as the account gave it:',
      clip(JSON.stringify(f.item, null, 2), 8000),
      ...(i === 0 && restLine ? ['', `(${restLine})`] : []),
    ].join('\n');
    return { report, state: { list, id, seen: keep(done) } as ItemsState };
  });
  return { changed: true, runs, note: `${plural(items.length, 'item')}, ${fresh.length} new`, sample, state, find };
}

/** When the run for an event starts: that long before it, or the evening before at a time (in your time zone). */
export function fireAt(b: EventBefore, start: number, tz: string): number {
  if (b.evening && HHMM.test(b.evening)) {
    const w = wallAt(tz, start - 86_400_000);
    const [h, m] = b.evening.split(':').map(Number);
    // The evening before; for a time after the event's own on the day before (a late-night event), that day's evening still.
    return Math.min(zonedTime(tz, w.y, w.mo, w.d, h, m), start - 60_000);
  }
  return start - Math.max(1, b.minutes ?? 30) * 60_000;
}

/** A run made for an event's start `ran` still holds for its start now: the same day (the evening before), or moved by no more than the lead. */
function sameSlot(b: EventBefore, ran: number, start: number, tz: string): boolean {
  if (b.evening) return dayOf(tz, ran) === dayOf(tz, start);
  return Math.abs(ran - start) <= Math.max(1, b.minutes ?? 30) * 60_000;
}

/** Whether an event has other people in it: an attendee, invitee or guest besides you. */
export function hasOthers(item: unknown): boolean {
  if (!isObj(item)) return false;
  for (const k of ['attendees', 'participants', 'invitees', 'guests', 'people', 'members', 'event_memberships', 'eventMemberships']) {
    const v = item[k];
    if (!Array.isArray(v)) continue;
    const marked = v.some((a) => isObj(a) && (a.self === true || a.isSelf === true || a.is_self === true));
    const others = v.filter((a) => !(isObj(a) && (a.self === true || a.isSelf === true || a.is_self === true || a.resource === true)));
    if (marked ? others.length > 0 : others.length > 1) return true;
  }
  return false;
}

const cancelled = (item: unknown) => isObj(item) && typeof item.status === 'string' && /cancel/i.test(item.status);

function readEvents(
  w: AccountWatch,
  b: EventBefore,
  name: string,
  items: unknown[],
  ids: string[],
  fields: AccountFind['fields'],
  find: AccountFind,
  p: Partial<EventsState> | undefined,
  o: { now: number; tz: string },
): AccountCheck {
  const { now, tz } = o;
  const start = b.start ?? p?.start ?? bestStart(fields);
  find.start = start;
  if (items.length && !start) throw withFind(new Error(`Could not tell which field holds each event's start in ${name}'s answer: pick it after Try it`), find);
  const list = find.list!;
  const id = find.id;
  const first = !p || !isObj(p.ev);
  const prevEv = (first ? {} : p!.ev!) as EventsState['ev'];
  const title = b.title?.toLowerCase();
  const events: { item: unknown; id: string; s: number }[] = [];
  let unreadable = 0;
  items.forEach((item, i) => {
    const s = start ? timeOf(at(item, start), tz) : null;
    if (s === null) return void unreadable++;
    if (cancelled(item)) return;
    if (title && !titleOf(item).toLowerCase().includes(title)) return;
    if (b.others && !hasOthers(item)) return;
    events.push({ item, id: ids[i], s });
  });
  if (items.length && unreadable === items.length) throw withFind(new Error(`${name}'s answer changed: no event has a start time at “${start}” now`), find);
  events.sort((x, y) => x.s - y.s);
  // Events it knows: those listed now (a cancelled or deleted one is not), and those it ran for that have not started yet (so one
  // missing from an answer for a while is not run again when it comes back).
  const ev: EventsState['ev'] = {};
  for (const [k, v] of Object.entries(prevEv)) if (v.r !== undefined && v.s > now - 6 * 3600_000) ev[k] = v;
  const due: typeof events = [];
  for (const e of events) {
    const old = prevEv[e.id];
    let r = old?.r;
    const moment = fireAt(b, e.s, tz);
    // The first look takes note: an event whose moment has passed already gets no run.
    if (first && moment <= now) r = e.s;
    ev[e.id] = { s: e.s, ...(r !== undefined ? { r } : {}) };
    if (now >= moment && now < e.s && !(r !== undefined && sameSlot(b, r, e.s, tz))) due.push(e);
  }
  const upcoming = events.filter((e) => e.s > now);
  const lead = b.evening ? `the evening before, at ${b.evening}` : `${leadText(b.minutes ?? 30)} before`;
  const line = (e: (typeof events)[number]) => `- ${localText(e.s, tz)}: ${clip(titleOf(e.item) || '(no title)', 100)}`;
  find.items = upcoming.slice(0, 8).map(line);
  const sample = upcoming.length ? `${plural(upcoming.length, 'upcoming event')} it would start a run for (${lead}):\n${find.items.join('\n')}${upcoming.length > 8 ? '\n…' : ''}` : 'No upcoming events here that it would start a run for.';
  const pending = events.filter((e) => e.s > now && !due.includes(e) && !(ev[e.id].r !== undefined && sameSlot(b, ev[e.id].r!, e.s, tz)));
  const nextMoment = pending.map((e) => fireAt(b, e.s, tz)).filter((t) => t > now).sort((x, y) => x - y)[0];
  const state: EventsState = { list, id, start, ev: { ...ev } };
  for (const e of due) state.ev[e.id] = { s: e.s, r: e.s };
  const nextNote = nextMoment ? `; the next run ${localText(nextMoment, tz)}` : '';
  if (first) return { changed: false, runs: [], note: `${plural(upcoming.length, 'upcoming event')} (first look: a run comes ${lead} each one from now on${nextNote})`, sample, state, nextAt: nextMoment, find };
  if (!due.length) return { changed: false, runs: [], note: `${plural(upcoming.length, 'upcoming event')}, none due now${nextNote}`, sample, state, nextAt: nextMoment, find };
  const take = due.slice(0, MAX_RUNS);
  const rest = due.slice(MAX_RUNS);
  const restLine = rest.length ? `${plural(rest.length, 'other event')} also start${rest.length === 1 ? 's' : ''} soon and get${rest.length === 1 ? 's' : ''} no run of ${rest.length === 1 ? 'its' : 'their'} own: ${rest.map((e) => line(e).slice(2)).join('; ')}.` : '';
  const marked: EventsState['ev'] = { ...ev };
  for (const e of rest) marked[e.id] = { s: e.s, r: e.s };
  const runs = take.map((e, i) => {
    marked[e.id] = { s: e.s, r: e.s };
    const mins = Math.max(0, Math.round((e.s - now) / 60_000));
    const where = isObj(e.item) ? [e.item.location, e.item.where, e.item.place, e.item.hangoutLink, e.item.join_url, e.item.meeting_url].find((x) => typeof x === 'string' && x.trim()) : undefined;
    const who = isObj(e.item) ? people(e.item) : [];
    const report = [
      `An event in ${name} starts ${mins < 90 ? `in ${plural(mins, 'minute')}` : `at ${localText(e.s, tz)}`}, at ${localText(e.s, tz)} (${tz}): “${titleOf(e.item) || '(no title)'}”${id && id !== '*' ? ` (its ${id}: ${e.id})` : ''}.`,
      ...(where ? [`Where: ${clip(String(where), 300)}`] : []),
      ...(who.length ? [`With: ${clip(who.join(', '), 600)}`] : []),
      '',
      'The event as the calendar gave it:',
      clip(JSON.stringify(e.item, null, 2), 8000),
      ...(i === 0 && restLine ? ['', `(${restLine})`] : []),
    ].join('\n');
    return { report, state: { list, id, start, ev: { ...marked } } as EventsState };
  });
  return { changed: true, runs, note: `${plural(upcoming.length, 'upcoming event')}, ${plural(due.length, 'run')} now${nextNote}`, sample, state, nextAt: nextMoment, find };
}

/** The people in an event: their names or addresses. */
function people(item: Record<string, unknown>): string[] {
  for (const k of ['attendees', 'participants', 'invitees', 'guests']) {
    const v = item[k];
    if (!Array.isArray(v)) continue;
    return v
      .map((a) => (typeof a === 'string' ? a : isObj(a) ? String(a.displayName ?? a.name ?? a.email ?? a.emailAddress ?? '') : ''))
      .filter(Boolean)
      .slice(0, 30);
  }
  return [];
}

// ---- checking a watcher from a form or an agent ---------------------------------------------------------------

const LEADS = [15, 30, 60];

/** A connected account's watcher, checked against the account: the tool must be one of its tools that only look and are On. */
export function validAccountWatch(w: Record<string, any>): AccountWatch {
  const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
  const d = deps;
  const all = d ? connections(d.db).filter((c) => c.id !== MAIL_APP) : [];
  const ref = str(w.app ?? w.account, 120);
  if (!all.length) throw new HttpError(400, 'Connect an account first: Apps → Connected apps');
  if (!ref) throw new HttpError(400, `Pick the connected account to watch: ${all.map((c) => c.id).join(', ')}`);
  const c = all.find((x) => x.id === ref) ?? all.find((x) => x.entry.name.toLowerCase() === ref.toLowerCase());
  if (!c) throw new HttpError(400, `${ref} is not a connected account. The accounts: ${all.map((x) => x.id).join(', ')}`);
  const tool = str(w.tool, 120);
  if (!tool) throw new HttpError(400, `Pick the tool of ${c.entry.name} to call at each check`);
  const why = toolProblem(c, tool);
  if (why) throw new HttpError(400, why.message);
  const args = w.args === undefined || w.args === null ? {} : w.args;
  if (!isObj(args)) throw new HttpError(400, 'args: the tool’s arguments, as an object');
  if (JSON.stringify(args).length > 20_000) throw new HttpError(400, 'args: too long');
  const list = w.list === undefined || w.list === null ? undefined : str(w.list, 300);
  const id = str(w.id, 300) || undefined;
  let before: EventBefore | undefined;
  if (w.before && typeof w.before === 'object') {
    const x = w.before as Record<string, any>;
    const evening = str(x.evening, 5);
    if (evening && !HHMM.test(evening)) throw new HttpError(400, 'The evening before: a time like 18:00');
    const minutes = Math.round(Number(x.minutes));
    if (!evening && !(minutes >= 1 && minutes <= 7 * 24 * 60)) throw new HttpError(400, `Say how long before each event: ${LEADS.join(', ')} minutes, or the evening before at a time`);
    before = {
      ...(evening ? { evening: evening.padStart(5, '0') } : { minutes }),
      ...(str(x.start, 300) ? { start: str(x.start, 300) } : {}),
      ...(str(x.title, 200) ? { title: str(x.title, 200) } : {}),
      ...(x.others === true ? { others: true } : {}),
    };
  }
  return {
    kind: 'account',
    app: c.id,
    name: c.entry.name,
    tool,
    ...(Object.keys(args).length ? { args } : {}),
    ...(list !== undefined ? { list } : {}),
    ...(id ? { id } : {}),
    ...(before ? { before } : {}),
  };
}

// ---- starting points ------------------------------------------------------------------------------------------

/**
 * Starting points for accounts whose catalog entries say they hold such things (checked in the tests against each
 * entry's description): the tool is one of the account's own (one that lists or searches the thing), never a name
 * made up here, and its arguments come from that tool's own form (a kind of object to pick, how many, newest first).
 */
export const PRESETS: { id: string; label: string; apps: string[]; says: RegExp; nouns: string[]; before?: boolean }[] = [
  { id: 'files', label: 'New files', apps: ['box', 'dropbox', 'google-drive', 'google-workspace'], says: /\b(files|drive)\b/i, nouns: ['file', 'files', 'document', 'documents'] },
  { id: 'contacts', label: 'New contacts', apps: ['hubspot', 'close', 'intercom', 'attio'], says: /\b(contacts|people)\b/i, nouns: ['contact', 'contacts', 'people', 'person', 'persons'] },
  { id: 'deals', label: 'New deals', apps: ['hubspot', 'attio', 'close'], says: /\b(deals|opportunities)\b/i, nouns: ['deal', 'deals', 'opportunity', 'opportunities'] },
  { id: 'leads', label: 'New leads', apps: ['close'], says: /\bleads\b/i, nouns: ['lead', 'leads'] },
  { id: 'tickets', label: 'New tickets', apps: ['hubspot', 'intercom'], says: /\btickets\b/i, nouns: ['ticket', 'tickets'] },
  { id: 'conversations', label: 'New conversations', apps: ['intercom'], says: /\bconversations\b/i, nouns: ['conversation', 'conversations'] },
  { id: 'issues', label: 'New issues', apps: ['linear', 'atlassian', 'github', 'gitlab', 'sentry'], says: /\bissues\b/i, nouns: ['issue', 'issues'] },
  { id: 'pulls', label: 'New pull requests', apps: ['github', 'gitlab'], says: /\b(pull|merge) requests\b/i, nouns: ['pull', 'pulls', 'pr', 'prs', 'merge'] },
  { id: 'tasks', label: 'New tasks', apps: ['asana', 'todoist', 'clickup'], says: /\btasks\b/i, nouns: ['task', 'tasks'] },
  { id: 'items', label: 'New items', apps: ['monday'], says: /\bitems\b/i, nouns: ['item', 'items'] },
  { id: 'records', label: 'New records', apps: ['airtable'], says: /\brecords\b/i, nouns: ['record', 'records', 'row', 'rows'] },
  { id: 'pages', label: 'New pages', apps: ['notion', 'atlassian'], says: /\bpages\b/i, nouns: ['page', 'pages'] },
  { id: 'payments', label: 'New payments', apps: ['stripe', 'paypal', 'square'], says: /\bpayments\b/i, nouns: ['payment', 'payments', 'charge', 'charges'] },
  { id: 'orders', label: 'New orders', apps: ['square', 'paypal'], says: /\borders\b/i, nouns: ['order', 'orders'] },
  { id: 'invoices', label: 'New invoices', apps: ['stripe', 'paypal'], says: /\binvoices\b/i, nouns: ['invoice', 'invoices'] },
  { id: 'bookings', label: 'New bookings', apps: ['calendly', 'square', 'wix'], says: /\bbookings\b/i, nouns: ['booking', 'bookings', 'invitee', 'invitees', 'scheduled'] },
  { id: 'transcripts', label: 'New meeting notes', apps: ['fireflies', 'granola'], says: /\b(transcripts|meeting notes)\b/i, nouns: ['transcript', 'transcripts', 'meeting', 'meetings', 'note', 'notes'] },
  { id: 'messages', label: 'New messages', apps: ['slack'], says: /\b(channels|messages)\b/i, nouns: ['message', 'messages', 'history', 'conversations'] },
  { id: 'events', label: 'New events', apps: ['google-calendar', 'google-workspace'], says: /\b(events|calendar)\b/i, nouns: ['event', 'events'] },
  { id: 'before', label: 'Before each event', apps: ['google-calendar', 'google-workspace', 'calendly'], says: /\b(events|calendar|bookings)\b/i, nouns: ['event', 'events', 'booking', 'bookings', 'scheduled'], before: true },
];

const VERB_RANK: Record<string, number> = { list: 4, search: 3, find: 3, query: 2, get: 1, fetch: 1, read: 1, retrieve: 1 };
/** Words of tools about the shape of things rather than the things (event types, fields, properties). */
const META = new Set(['type', 'types', 'schema', 'schemas', 'field', 'fields', 'property', 'properties', 'template', 'templates', 'setting', 'settings', 'label', 'labels', 'tag', 'tags', 'pipeline', 'pipelines', 'stage', 'stages', 'association', 'associations', 'owner', 'owners', 'webhook', 'webhooks', 'count', 'permission', 'permissions', 'comment', 'comments', 'attachment', 'attachments', 'calendar', 'calendars', 'folder', 'folders', 'content', 'revision', 'revisions']);

type Props = Record<string, { type?: unknown; enum?: unknown[]; maximum?: number; items?: { enum?: unknown[] } }>;

/** A value of a tool's enum argument that names one of the nouns ("deals" for objectType): its name and value. */
function nounArg(props: Props, nouns: string[]): { name: string; value: unknown } | null {
  for (const [name, s] of Object.entries(props)) {
    const vals = Array.isArray(s?.enum) ? s.enum : Array.isArray(s?.items?.enum) ? s.items!.enum! : null;
    const hit = vals?.find((v) => typeof v === 'string' && toolWords(v).some((x) => nouns.includes(x)) && !toolWords(v).some((x) => META.has(x)));
    if (hit !== undefined) return { name, value: Array.isArray(s.enum) ? hit : [hit] };
  }
  return null;
}

/** How well a tool fits a starting point (0: not at all): it must list or search, and name the thing or offer it in an argument. */
function fit(t: StoredTool, nouns: string[]): number {
  const w = toolWords(t.name);
  const verb = w.find((x) => VERB_RANK[x]);
  if (!verb || w.some((x) => META.has(x) && !nouns.includes(x))) return 0;
  const named = w.some((x) => nouns.includes(x));
  const props = (t.inputSchema?.properties ?? {}) as Props;
  if (!named && !nounArg(props, nouns)) return 0;
  const required = (t.inputSchema?.required ?? []).length;
  return VERB_RANK[verb] * 10 + (named ? 5 : 2) - Math.min(required, 4);
}

/** Arguments a starting point fills in from a tool's own form: the kind of thing, how many (50), newest first, and for events the time from now. */
export function presetArgs(t: StoredTool, nouns: string[], events: boolean): Record<string, unknown> {
  const props = (t.inputSchema?.properties ?? {}) as Props;
  const out: Record<string, unknown> = {};
  const noun = nounArg(props, nouns);
  if (noun && !toolWords(t.name).some((x) => nouns.includes(x))) out[noun.name] = noun.value;
  for (const [name, s] of Object.entries(props)) {
    const n = name.toLowerCase().replace(/[^a-z]/g, '');
    const type = s?.type;
    const numeric = type === 'integer' || type === 'number';
    if (numeric && ['limit', 'maxresults', 'pagesize', 'perpage', 'count', 'first', 'top', 'size', 'maxitems', 'max'].includes(n)) out[name] = Math.min(50, typeof s.maximum === 'number' ? s.maximum : 50);
    if (Array.isArray(s?.enum) && ['sort', 'sortby', 'order', 'orderby', 'sortorder', 'direction'].includes(n)) {
      const vals = s.enum.filter((v): v is string => typeof v === 'string');
      const best = vals.find((v) => /creat|newest|recent/i.test(v) && /desc/i.test(v)) ?? vals.find((v) => /newest|recent|latest/i.test(v)) ?? (['order', 'sortorder', 'direction'].includes(n) ? vals.find((v) => /^desc/i.test(v)) : undefined);
      if (best) out[name] = best;
    }
    if (events && (type === 'string' || type === undefined)) {
      if (/^(timemin|mintime|starttimemin|startmin|minstarttime|startafter|startfrom|from|after|since|start|starttime|startdate|begin)$/.test(n)) out[name] = '{{now}}';
      else if (/^(timemax|maxtime|starttimemax|startmax|maxstarttime|startbefore|to|before|until|end|endtime|enddate)$/.test(n)) out[name] = '{{now+2d}}';
    }
    if (events && type === 'boolean' && n === 'singleevents') out[name] = true;
  }
  return out;
}

/** The starting points that fit an account: each with one of its own tools and that tool's arguments. */
export function presetsFor(c: Pick<Conn, 'id' | 'tools'>, usable: StoredTool[]): WatchAccount['presets'] {
  const out: WatchAccount['presets'] = [];
  for (const p of PRESETS) {
    if (!p.apps.includes(c.id)) continue;
    const best = usable
      .map((t) => ({ t, f: fit(t, p.nouns) }))
      .filter((x) => x.f > 0)
      .sort((a, b) => b.f - a.f)[0];
    if (!best) continue;
    out.push({ id: p.id, label: p.label, tool: best.t.name, args: presetArgs(best.t, p.nouns, p.id === 'events' || !!p.before), ...(p.before ? { before: true } : {}) });
  }
  return out;
}

/** The connected accounts a watcher may call (all but Email, which has its own watcher), with their tools that only look. */
export function watchAccounts(): WatchAccount[] {
  const d = need();
  return connections(d.db)
    .filter((c) => c.id !== MAIL_APP)
    .map((c): WatchAccount => {
      const tools = c.tools ?? [];
      const looks = tools.filter((t) => onlyLooks(t));
      const usable = looks.filter((t) => toolState(c, t.name) === 'on');
      const calendar = c.entry.category === 'calendar' || (c.entry.keywords ?? []).includes('calendar');
      return {
        id: c.id,
        name: c.entry.name,
        category: c.entry.category,
        calendar,
        ...(c.status === 'signin' ? { problem: 'Signed out: connect it again in Apps → Connected apps' } : !c.tools ? { problem: 'Its tools are not known yet: test it in Apps → Connected apps' } : {}),
        tools: usable.map((t) => ({ name: t.name, ...(t.description ? { description: t.description } : {}), ...(t.inputSchema ? { schema: { properties: t.inputSchema.properties as Record<string, any> | undefined, required: t.inputSchema.required } } : {}) })),
        skipped: { outside: tools.length - looks.length, notOn: looks.length - usable.length },
        presets: presetsFor(c, usable).filter((p) => !p.before || calendar),
      };
    });
}
