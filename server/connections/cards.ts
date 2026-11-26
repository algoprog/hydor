// The card that asks for several credentials at once, each with how to get it (shared/keys.ts): what a request_secret
// call asks for (parsed here), the card kept with its request (never a value: what is asked and what became of each
// item), the person's answers item by item, and the words the agent gets: per item saved, skipped or left, and nothing
// else. Web apps put up the same card for the keys an app needs (server/webapps/app-keys.ts).
import { cleanDomains, fieldKey, SECRET_LIKE, SECRET_NAME, secretName, type SecretField } from '../../shared/connections.ts';
import {
  cardDone,
  filled,
  isLiveKey,
  isPaymentsKey,
  MAX_ITEMS,
  type CardField,
  type CardItem,
  type CardItemView,
  type ItemState,
  type KeyLooks,
  type KeysCardView,
  type KeyUse,
  type ReuseSource,
} from '../../shared/keys.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { addRequest, appKey, readAppKey, readSecret, redact, saveAppKey, saveSecret, secretView } from './vault.ts';

// ---- what a call asks for ---------------------------------------------------------------------------------

const words = (id: string) => {
  const s = id.replace(/[_-]+/g, ' ').trim().toLowerCase();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
};
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, n) : undefined);
export const FIELD_TYPES = ['password', 'text', 'email', 'url', 'number'] as const;

/** A pattern short enough and without a repeat of a repeat (which could take for ever), or nothing. */
const safePattern = (p: unknown) => (typeof p === 'string' && p && p.length <= 200 && !/[+*}]\)[+*{]/.test(p) ? p : undefined);

/**
 * A paste's expected shape as an agent or a hydor.json wrote it, or nothing. `starts` (or `prefix`) is how it
 * starts; `not` are pastes that are plainly something else. `whole`: as hydor.json writes it, where a pattern matches the
 * whole value; a `not` with a condition (`when`) is kept only there, where the condition is settled before it is shown.
 */
export function looksOf(raw: unknown, o: { whole?: boolean } = {}): KeyLooks | undefined {
  if (!raw || typeof raw !== 'object') return typeof raw === 'string' && raw.trim() ? { say: clip(raw, 200) } : undefined;
  const r = raw as Record<string, unknown>;
  const starts = r.starts ?? r.prefix;
  const prefix = (Array.isArray(starts) ? starts : [starts]).filter((p): p is string => typeof p === 'string' && !!p && p.length <= 40).slice(0, 8);
  const p = safePattern(r.pattern);
  const say = clip(r.say ?? r.sentence ?? r.hint, 200);
  const not = (Array.isArray(r.not) ? r.not : []).slice(0, 8).flatMap((x) => {
    const w = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    const wrong = typeof w.starts === 'string' && w.starts && w.starts.length <= 40 ? w.starts : undefined;
    const pattern = safePattern(w.pattern);
    const said = clip(w.say, 200);
    const when = clip(w.when, 200);
    if (!said || (!wrong && !pattern) || (when && !o.whole)) return [];
    return [{ ...(wrong ? { starts: wrong } : {}), ...(pattern ? { pattern } : {}), say: said, ...(when ? { when } : {}) }];
  });
  const out: KeyLooks = { ...(prefix.length ? { prefix } : {}), ...(p ? { pattern: p } : {}), ...(say ? { say } : {}), ...(not.length ? { not } : {}) };
  return Object.keys(out).length ? { ...out, ...(o.whole ? { whole: true } : {}) } : undefined;
}

/** Steps as a list of short lines. */
export function stepsOf(raw: unknown): string[] | undefined {
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : [];
  const out = list.map((s) => clip(typeof s === 'string' ? s.replace(/^\s*(?:\d+[.)]|[-•*])\s+/, '') : '', 300)).filter((s): s is string => !!s);
  return out.length ? out.slice(0, 8) : undefined;
}

/** The provider's page: an https address, or nothing (it becomes a link the person clicks). */
export function pageOf(raw: unknown): string | undefined {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.length > 500) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && u.hostname.includes('.') && !u.username && !u.password ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** A sign-in's fields as the agent wrote them (a list, or an object by name), each with the key it is saved as. */
export function signInFields(raw: unknown, name: string): SecretField[] {
  if (raw === undefined || raw === null) return [];
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : typeof raw === 'object'
      ? Object.entries(raw as Record<string, unknown>).map(([k, v]) => (v && typeof v === 'object' ? { name: k, ...(v as object) } : { name: k, label: v }))
      : [];
  if (!list.length) throw new Error('fields: a list like [{ "name": "username", "label": "Username" }, { "name": "password", "label": "Password" }]');
  if (list.length > 10) throw new Error('fields: at most 10');
  const out: CardField[] = [];
  for (const f of list) {
    const o = (typeof f === 'string' ? { name: f } : f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const own = secretName(String(o.name ?? o.key ?? o.id ?? ''));
    if (!own) throw new Error('fields: each needs a name, like "password"');
    const key = fieldKey(name, own);
    if (!SECRET_NAME.test(key)) throw new Error(`fields: ${String(o.name)} does not make a key’s name (it would be ${key})`);
    if (out.some((x) => x.key === key)) throw new Error(`fields: ${key} is there twice`);
    const secret = o.secret !== false;
    const t = String(o.type ?? '').toLowerCase();
    const type: SecretField['type'] = (FIELD_TYPES as readonly string[]).includes(t)
      ? (t as SecretField['type'])
      : secret && SECRET_LIKE.test(own)
        ? 'password'
        : /EMAIL/.test(own)
          ? 'email'
          : /URL/.test(own)
            ? 'url'
            : /PORT/.test(own)
              ? 'number'
              : 'text';
    const help = clip(o.help ?? o.description, 200);
    const looks = looksOf(o.looks);
    out.push({ key, label: clip(o.label ?? o.title, 60) ?? words(own), secret, type, ...(help ? { help } : {}), ...(o.optional === true ? { optional: true } : {}), ...(looks ? { looks } : {}) });
  }
  if (!out.some((f) => f.secret)) throw new Error('fields: none of them is secret. For details that are not secret, use ask_form.');
  return out;
}

/** The parts of a call that make it a card with tabs or steps, rather than the plain one. */
export const CARD_PARTS = ['title', 'from', 'how', 'url', 'looks', 'hint', 'optional'] as const;
export const asksForCard = (a: Record<string, unknown>) => a.items !== undefined || CARD_PARTS.some((k) => a[k] !== undefined && a[k] !== null && a[k] !== '' && a[k] !== false);

/** One item of a call. `from` is the call itself for a single one. */
function itemOf(raw: Record<string, unknown>, call: Record<string, unknown>, at: string): CardItem {
  const name = secretName(String(raw.name ?? ''));
  if (!SECRET_NAME.test(name)) throw new Error(`${at}name: capitals, digits and underscores, starting with a letter, like WEATHER_API_KEY`);
  const why = clip(raw.why, 600);
  if (!why) throw new Error(`${at}why: say what it is for, so the user knows what to enter`);
  if (raw.url !== undefined && raw.url !== '' && !pageOf(raw.url)) throw new Error(`${at}url: the provider’s page, an https address`);
  const title = clip(raw.title, 60) ?? words(name);
  const looks = looksOf(raw.looks);
  const fields: CardField[] = signInFields(raw.fields, name);
  if (!fields.length) fields.push({ key: name, label: title, secret: true, type: 'password', ...(looks ? { looks } : {}) });
  else if (looks && fields.filter((f) => f.secret).length === 1) {
    const f = fields.find((x) => x.secret)!;
    f.looks ??= looks;
  }
  const how = stepsOf(raw.how);
  const url = pageOf(raw.url);
  const from = clip(raw.from, 60);
  const hint = clip(raw.hint, 200);
  const optional = raw.optional === true;
  return {
    id: name,
    title,
    ...(from ? { from } : {}),
    why,
    ...(how ? { how } : {}),
    ...(url ? { url } : {}),
    ...(hint ? { hint } : {}),
    fields,
    ...(optional ? { optional: true, skippable: true } : {}),
    domains: cleanDomains(raw.domains ?? call.domains ?? []),
    ...((raw.commands ?? call.commands) === true ? { commands: true } : {}),
    ...((raw.replace ?? call.replace) === true ? { replace: true } : {}),
  };
}

/** What a request_secret call with `items` (or with steps for one) asks for. */
export function parseCard(a: Record<string, unknown>): { title?: string; why?: string; items: CardItem[] } {
  if (a.items === undefined) return { items: [itemOf(a, a, '')] };
  const list = Array.isArray(a.items) ? a.items : [];
  if (!list.length) throw new Error('items: a list like [{ "name": "OPENAI_API_KEY", "why": "…", "how": ["…"], "url": "https://…" }]');
  if (list.length > MAX_ITEMS) throw new Error(`items: at most ${MAX_ITEMS} on one card`);
  if (a.fields !== undefined) throw new Error('fields: with items, give each item its own fields');
  const items = list.map((x, i) => itemOf((x && typeof x === 'object' ? x : {}) as Record<string, unknown>, a, `items[${i}].`));
  const seen = new Set<string>();
  const keys = new Set<string>();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error(`items: ${it.id} is there twice`);
    seen.add(it.id);
    for (const f of it.fields) {
      if (keys.has(f.key)) throw new Error(`items: the key ${f.key} is asked for twice`);
      keys.add(f.key);
    }
  }
  const title = clip(a.title, 80);
  const why = clip(a.why, 600);
  return { ...(title ? { title } : {}), ...(why ? { why } : {}), items };
}

// ---- kept ----------------------------------------------------------------------------------------------

/** What a card is about besides its items: the web app it is for, and what that asks of the values. */
export interface CardScope {
  app?: { id: string; name: string; env: string };
  /** The app runs inside Hydor: payments take a test key only. */
  inside?: boolean;
  /** Keys given to an app by name: no hosts, no commands. */
  byName?: boolean;
}

interface Answer {
  state: ItemState;
  /** The details that are not secret, as typed, for the agent (never a secret field's). */
  typed?: [string, string][];
}

interface CardRow {
  id: string;
  key: string;
  name: string;
  why: string;
  state: KeysCardView['state'];
  created_at: number;
  done_at: number | null;
  items: string | null;
  answers: string | null;
  scope: string | null;
  title: string | null;
}

const parse = <T>(s: string | null, d: T): T => {
  try {
    return (JSON.parse(s ?? 'null') as T) ?? d;
  } catch {
    return d;
  }
};

interface Card {
  row: CardRow;
  items: CardItem[];
  answers: Record<string, Answer>;
  scope: CardScope;
}

function load(db: DB, id: string): Card | null {
  const row = db.prepare('select * from conn_requests where id = ?').get(id) as CardRow | undefined;
  if (!row?.items) return null;
  return { row, items: parse<CardItem[]>(row.items, []), answers: parse<Record<string, Answer>>(row.answers, {}), scope: parse<CardScope>(row.scope, {}) };
}

const stateOf = (c: Card, id: string): ItemState => c.answers[id]?.state ?? 'todo';

/**
 * Where a card's values are kept: a web app's card keeps them as that app's own, for one place; every other card in the
 * vault, under their names.
 */
const own = (scope: CardScope) => (scope.byName && scope.app ? scope.app : null);
const savedKey = (db: DB, scope: CardScope, name: string): { updatedAt: number; domains?: string[]; commands?: boolean } | null => {
  const a = own(scope);
  return a ? appKey(db, a.id, a.env, name) : secretView(db, name);
};
const savedValue = (db: DB, scope: CardScope, name: string): string => {
  const a = own(scope);
  return (a ? readAppKey(db, a.id, a.env, name) : readSecret(db, name)?.value) ?? '';
};

/** The saved value of a payments key is one an app inside Hydor may not have. */
const liveSaved = (db: DB, scope: CardScope, item: CardItem, f: CardField) => !!scope.inside && f.secret && isPaymentsKey(item, f) && isLiveKey(savedValue(db, scope, f.key));

function viewOf(db: DB, c: Card): KeysCardView {
  const items: CardItemView[] = c.items.map((it) => {
    const reuse = own(c.scope) ? (cardHooks.sources?.(c.scope, it) ?? []).map(({ values: _, ...s }) => s) : [];
    return {
      ...it,
      fields: it.fields.map((f) => {
        const s = f.secret ? savedKey(db, c.scope, f.key) : null;
        return { ...f, ...(s ? { savedAt: s.updatedAt, ...(s.commands ? { commandsOn: true } : {}) } : {}), ...(s && liveSaved(db, c.scope, it, f) ? { refused: 'live' as const } : {}) };
      }),
      // Keys that are there keep their hosts: the card shows those.
      domains: it.fields.map((f) => (f.secret ? savedKey(db, c.scope, f.key)?.domains : undefined)).find(Boolean) ?? it.domains,
      state: stateOf(c, it.id),
      ...(reuse.length ? { reuse } : {}),
    };
  });
  return {
    id: c.row.id,
    key: c.row.key,
    name: c.row.name,
    ...(c.row.title ? { title: c.row.title } : {}),
    ...(c.row.why ? { why: c.row.why } : {}),
    state: c.row.state,
    items,
    ...(c.scope.inside ? { inside: true } : {}),
    ...(c.scope.app ? { app: c.scope.app } : {}),
    ...(c.scope.byName ? { byName: true } : {}),
    createdAt: c.row.created_at,
    ...(c.row.done_at ? { doneAt: c.row.done_at } : {}),
  };
}

export function cardView(db: DB, id: string): KeysCardView | null {
  const c = load(db, id);
  return c ? viewOf(db, c) : null;
}

export const cardScope = (db: DB, id: string): CardScope | null => load(db, id)?.scope ?? null;

/**
 * A new card. `there`: items whose keys are in the vault and are enough as they are (a launch's card marks them as
 * there); one whose saved value may not be used here stays to do.
 */
export function createCard(db: DB, c: { key: string; name: string; title?: string; why?: string; items: CardItem[]; scope?: CardScope; there?: string[] }): KeysCardView {
  const scope = c.scope ?? {};
  const answers: Record<string, Answer> = {};
  for (const it of c.items)
    if (c.there?.includes(it.id) && !it.replace && it.fields.every((f) => f.optional || (!!savedKey(db, scope, f.key) && !liveSaved(db, scope, it, f)))) answers[it.id] = { state: 'used' };
  const r = addRequest(db, { key: c.key, name: c.name, why: c.why ?? '', domains: [], items: JSON.stringify(c.items), answers: JSON.stringify(answers), scope: JSON.stringify(scope), title: c.title });
  return cardView(db, r.id)!;
}

// ---- answered -------------------------------------------------------------------------------------------

export const LIVE_REFUSAL = 'That is a live key, which moves real money. An app inside Hydor takes a test key only (it starts sk_test_ or rk_test_).';

/** What the agent is to be told after an answer: nothing yet, that the card is done, or that one more came later. */
export type Told = 'done' | 'more' | null;

function settle(db: DB, c: Card, wasDone: boolean, newlyFilled: boolean): Told {
  db.prepare('update conn_requests set answers = ? where id = ?').run(JSON.stringify(c.answers), c.row.id);
  const done = cardDone(c.items.map((i) => ({ id: i.id, optional: i.optional, or: i.or, state: stateOf(c, i.id) })));
  if (c.row.state === 'pending') {
    if (!done) return null;
    db.prepare("update conn_requests set state = 'saved', done_at = ? where id = ?").run(Date.now(), c.row.id);
    c.row.state = 'saved';
    return 'done';
  }
  // Closed before, or done already: what is saved now is news of its own.
  if (!wasDone && done) {
    db.prepare("update conn_requests set state = 'saved', done_at = ? where id = ?").run(Date.now(), c.row.id);
    c.row.state = 'saved';
  }
  return newlyFilled ? 'more' : null;
}

const itemIn = (db: DB, id: string, itemId: string) => {
  const c = load(db, id);
  if (!c) throw new HttpError(404, 'That request is gone');
  const item = c.items.find((i) => i.id === itemId);
  if (!item) throw new HttpError(404, 'The card does not ask for that');
  return { c, item };
};

/** The person saves one item (or lets the saved values stand, or takes the ones of another place). Nothing is saved unless all of it can be. */
export function answerItem(db: DB, id: string, itemId: string, b: { values?: Record<string, unknown>; use?: boolean; reuse?: string; domains?: unknown; commands?: unknown }): { view: KeysCardView; told: Told; changed: boolean } {
  const { c, item } = itemIn(db, id, itemId);
  let values = !b.use && b.values && typeof b.values === 'object' ? b.values : {};
  if (b.reuse) {
    // Only one the card offers; copied here on the server, never through the page.
    const source = (own(c.scope) ? (cardHooks.sources?.(c.scope, item) ?? []) : []).find((s) => s.id === b.reuse);
    if (!source) throw new HttpError(409, 'That saved key is not there any more');
    values = source.values();
  }
  const got = (k: string) => (Object.hasOwn(values, k) ? String(values[k] ?? '').trim() : '');
  const typed: [string, string][] = [];
  let fresh = false;
  for (const f of item.fields) {
    const v = got(f.key);
    const old = f.secret ? savedKey(db, c.scope, f.key) : null;
    if (!v && !f.optional && !old) throw new HttpError(400, `Fill in ${f.label}`);
    if (!f.secret) {
      if (v.length > 1000) throw new HttpError(400, `${f.label} is too long`);
      if (v) typed.push([f.label, v.replace(/\s+/g, ' ')]);
      continue;
    }
    if (v.length > 16_000) throw new HttpError(400, 'That is too long for a key');
    if (v && /[\r\n]/.test(v) && !/^-----BEGIN /.test(v)) throw new HttpError(400, 'A key is one line');
    if (v) fresh = true;
    if (c.scope.inside && isPaymentsKey(item, f) && isLiveKey(v || (old ? savedValue(db, c.scope, f.key) : ''))) throw new HttpError(400, LIVE_REFUSAL);
  }
  const secrets = item.fields.filter((f) => f.secret);
  if (secrets.length && !secrets.some((f) => got(f.key) || savedKey(db, c.scope, f.key))) throw new HttpError(400, `Fill in ${secrets[0].label}`);
  const app = own(c.scope);
  const domains = cleanDomains(b.domains ?? item.domains);
  const commands = !item.commands ? undefined : typeof b.commands === 'boolean' ? b.commands : undefined;
  const wasDone = c.row.state === 'saved';
  const was = stateOf(c, itemId);
  db.transaction(() => {
    for (const f of secrets) {
      if (app) {
        if (got(f.key)) saveAppKey(db, app.id, app.env, f.key, got(f.key));
        continue;
      }
      const old = secretView(db, f.key);
      if (!got(f.key) && !old) continue;
      const note = old?.note || `${item.title}: ${item.why}`.slice(0, 300);
      saveSecret(db, { name: f.key, value: got(f.key) || undefined, domains, commands, note });
    }
  })();
  c.answers[itemId] = { state: !b.reuse && (fresh || typed.length) ? 'saved' : 'used', ...(typed.length ? { typed } : {}) };
  const told = settle(db, c, wasDone, !filled(was) || fresh);
  if (app && fresh) cardHooks.saved?.(c.scope, secrets.filter((f) => got(f.key)).map((f) => f.key));
  return { view: viewOf(db, c), told, changed: fresh };
}

/** "Skip for now": only where the card offers it. */
export function skipItem(db: DB, id: string, itemId: string): { view: KeysCardView; told: Told } {
  const { c, item } = itemIn(db, id, itemId);
  if (!item.skippable) throw new HttpError(400, `${item.title} is needed: save it, or close the card`);
  if (!filled(stateOf(c, itemId))) c.answers[itemId] = { state: 'skipped' };
  const told = settle(db, c, c.row.state === 'saved', false);
  return { view: viewOf(db, c), told };
}

/** The person closes the card: the agent hears what is still missing. */
export function closeCard(db: DB, id: string): { view: KeysCardView; told: boolean } {
  const c = load(db, id);
  if (!c) throw new HttpError(404, 'That request is gone');
  const told = c.row.state === 'pending';
  if (told) {
    db.prepare("update conn_requests set state = 'dismissed', done_at = ? where id = ?").run(Date.now(), id);
    c.row.state = 'dismissed';
  }
  return { view: viewOf(db, c), told };
}

// ---- the words the agent gets ----------------------------------------------------------------------------

const keysIn = (it: CardItem) => it.fields.filter((f) => f.secret).map((f) => f.key);
const named = (it: CardItem) => {
  const keys = keysIn(it);
  return keys.length === 1 && keys[0] === it.title ? it.title : `${it.title} (${keys.join(', ')})`;
};

/** Per item saved, skipped or left, and what is usable now by name. */
export function cardReport(db: DB, id: string, how: (names: string[], hosts: boolean, commands: boolean) => string): { saved: CardItem[]; skipped: CardItem[]; left: CardItem[]; lines: string; use: string } {
  const c = load(db, id)!;
  const saved = c.items.filter((i) => filled(stateOf(c, i.id)));
  const skipped = c.items.filter((i) => stateOf(c, i.id) === 'skipped');
  // One another does instead of is not left over once that other is saved.
  const left = c.items.filter((i) => stateOf(c, i.id) === 'todo' && !i.or?.some((id) => saved.some((x) => x.id === id)));
  const list = (l: CardItem[]) => (l.length ? l.map(named).join('; ') : 'none');
  const typed = saved.flatMap((i) => c.answers[i.id]?.typed ?? []);
  const lines = [`Saved: ${list(saved)}.`, `Skipped: ${list(skipped)}.`, `Left: ${list(left)}.`, typed.length ? `The details that are not secret: ${typed.map(([l, v]) => `${l}: ${v}`).join('; ')}.` : ''].filter(Boolean).join(' ');
  const names = saved.flatMap(keysIn);
  const views = names.map((n) => secretView(db, n));
  const use = !names.length
    ? ''
    : c.scope.byName
      ? `They are the app’s own, for ${c.scope.app?.env === 'hydor' ? 'inside Hydor (Preview and the launched version)' : `the environment ${c.scope.app?.env}`}: it is given them when it runs. You cannot use them by name, and never see their values.`
      : how(names, views.some((v) => v?.domains.length), views.some((v) => v?.commands));
  return { saved, skipped, left, lines, use };
}

/** The message a session gets about its card. */
export function cardMessage(db: DB, id: string, why: 'done' | 'more' | 'closed', how: (names: string[], hosts: boolean, commands: boolean) => string): string {
  const c = load(db, id)!;
  const r = cardReport(db, id, how);
  const about = c.scope.app ? ` for ${c.scope.app.name} (${c.scope.app.env})` : '';
  const head =
    why === 'done'
      ? `The keys card${about} is answered.`
      : why === 'more'
        ? `More was saved on the keys card${about}.`
        : `I closed the keys card${about}.`;
  const end =
    why === 'closed' && r.left.length
      ? `Still missing: ${r.left.map(named).join('; ')}. Carry on with what does not need ${r.left.length > 1 ? 'them' : 'it'}, or tell me what else would work.`
      : '';
  return redact([head, r.lines, end, r.use].filter(Boolean).join(' '));
}

/** The open cards' titles, for the inbox. */
export function cardTitles(db: DB, id: string): string[] {
  const c = load(db, id);
  return c ? c.items.filter((i) => stateOf(c, i.id) === 'todo').map((i) => i.title) : [];
}

// ---- what other capabilities add --------------------------------------------------------------------------

/**
 * What server/webapps adds to its own cards: the values of the same names elsewhere that may be offered (`values` stays on
 * the server), and what follows a new value (Preview starts again).
 */
export const cardHooks: {
  sources?: (scope: CardScope, item: CardItem) => (ReuseSource & { values: () => Record<string, string> })[];
  saved?: (scope: CardScope, names: string[]) => void;
} = {};

/** Who names a key of the vault, for the person removing it: each capability that keeps names adds its own. */
export const keyUses = new Map<string, (name: string) => KeyUse[]>();

export const usesOf = (name: string): KeyUse[] => [...keyUses.values()].flatMap((f) => {
  try {
    return f(name);
  } catch {
    return [];
  }
});
