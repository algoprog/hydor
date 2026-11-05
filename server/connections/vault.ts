// The vault: keys the person saved (Apps → Connected apps → Keys, or a card an agent asked with) and the
// apps' sign-ins, encrypted at rest with AES-256-GCM under a key file in the data folder (mode 0600).
// Each sealed value names the key that sealed it, so the key can be replaced and everything sealed
// again. Values only leave for the server's own use (a request, an app's sign-in); pages get masked
// hints, agents get names. Whatever the app's tools return has known values masked.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { cleanDomains, SECRET_NAME, type SecretField, type SecretRequestView, type SecretView } from '../../shared/connections.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import type { DB } from '../db.ts';

// ---- sealing ------------------------------------------------------------------------------------

interface Key {
  id: string;
  key: Buffer;
}
let ring: Key[] | null = null;

const keyFile = () => path.join(config.dataDir, 'vault.key');
const keyId = (k: Buffer) => crypto.createHash('sha256').update(k).digest('hex').slice(0, 8);

/** The keys: the current one first, then one being brought in or retired by an unfinished rotation. */
function keys(): Key[] {
  if (ring) return ring;
  const file = keyFile();
  // A rotation stopped between its two renames: the new key becomes the current one.
  if (!fs.existsSync(file) && fs.existsSync(`${file}.next`)) fs.renameSync(`${file}.next`, file);
  const out: Key[] = [];
  for (const f of [file, `${file}.next`, `${file}.old`]) {
    try {
      const b = fs.readFileSync(f);
      if (b.length === 32 && !out.some((k) => k.key.equals(b))) out.push({ id: keyId(b), key: b });
    } catch {}
  }
  if (!fs.existsSync(file)) {
    const k = crypto.randomBytes(32);
    fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    // Never over a key that is there: what it sealed would be lost.
    fs.writeFileSync(file, k, { mode: 0o600, flag: 'wx' });
    out.unshift({ id: keyId(k), key: k });
  }
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
  return (ring = out);
}

/** Encrypts `plain`, bound to `aad` (what it belongs to, so a value moved to another row will not open). */
export function seal(plain: string, aad: string): string {
  const k = keys()[0];
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k.key, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', k.id, iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function unseal(sealed: string, aad: string): string {
  const [v, kid, iv, tag, ct] = String(sealed ?? '').split('.');
  const k = keys().find((x) => x.id === kid);
  if (v !== 'v1' || !k || !iv || !tag || ct === undefined) throw new Error('The vault cannot open this value (its key is missing)');
  const d = crypto.createDecipheriv('aes-256-gcm', k.key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/** Every sealed column, with what its values are bound to. */
const SEALED: { table: string; id: string; col: string; aad: (id: string) => string }[] = [
  { table: 'conn_secrets', id: 'name', col: 'value', aad: (n) => `secret:${n}` },
  { table: 'conn_apps', id: 'id', col: 'cred', aad: (n) => `app:${n}` },
  { table: 'conn_clients', id: 'k', col: 'client', aad: (n) => `client:${n}` },
];

/** A sealed column of another store's (the saved signatures'), sealed again with the rest when the key is replaced. */
export function addSealed(s: (typeof SEALED)[number]) {
  if (!SEALED.some((x) => x.table === s.table && x.col === s.col)) SEALED.push(s);
}

/** A new vault key: everything is sealed again with it, then the old key file goes. */
export function rotateVaultKey(db: DB): { sealed: number; keyId: string } {
  const file = keyFile();
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(`${file}.next`, fresh, { mode: 0o600 });
  ring = null;
  const next: Key = { id: keyId(fresh), key: fresh };
  let n = 0;
  db.transaction(() => {
    for (const s of SEALED) {
      // A store another database has (a test's) is not in this one.
      if (!db.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(s.table)) continue;
      const rows = db.prepare(`select ${s.id} as id, ${s.col} as v from ${s.table} where ${s.col} is not null`).all() as { id: string; v: string }[];
      for (const r of rows) {
        const plain = unseal(r.v, s.aad(r.id));
        const iv = crypto.randomBytes(12);
        const c = crypto.createCipheriv('aes-256-gcm', next.key, iv);
        c.setAAD(Buffer.from(s.aad(r.id)));
        const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
        const v = ['v1', next.id, iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
        db.prepare(`update ${s.table} set ${s.col} = ? where ${s.id} = ?`).run(v, r.id);
        n++;
      }
    }
  })();
  fs.renameSync(file, `${file}.old`);
  fs.renameSync(`${file}.next`, file);
  fs.rmSync(`${file}.old`, { force: true });
  ring = null;
  invalidateMask();
  return { sealed: n, keyId: next.id };
}

// ---- tables -------------------------------------------------------------------------------------

export function vaultTables(db: DB) {
  db.exec(`create table if not exists conn_secrets (
    name text primary key, value text not null, hint text not null, domains text not null default '[]', note text not null default '',
    header text, prefix text, query text, created_at integer not null, updated_at integer not null, used_at integer,
    commands integer not null default 0
  );
  create table if not exists conn_requests (
    id text primary key, key text not null, name text not null, why text not null, domains text not null default '[]',
    state text not null, created_at integer not null, done_at integer, fields text, commands integer not null default 0
  );
  create index if not exists conn_requests_key on conn_requests (key, name, created_at);`);
  // Vaults from before sign-ins and commands.
  const has = (t: string, col: string) => (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).some((c) => c.name === col);
  if (!has('conn_secrets', 'commands')) db.exec('alter table conn_secrets add column commands integer not null default 0');
  if (!has('conn_requests', 'fields')) db.exec('alter table conn_requests add column fields text');
  if (!has('conn_requests', 'commands')) db.exec('alter table conn_requests add column commands integer not null default 0');
}

/** What a page may see of a value: its first characters when long enough to say what kind it is, and its last four. */
export function maskHint(v: string): string {
  const s = String(v ?? '');
  if (s.length >= 24) return `${s.slice(0, 3)}…${s.slice(-4)}`;
  if (s.length >= 12) return `…${s.slice(-4)}`;
  return '••••';
}

// ---- keys the person saved ------------------------------------------------------------------------

interface SecretRow {
  name: string;
  value: string;
  hint: string;
  domains: string;
  note: string;
  header: string | null;
  prefix: string | null;
  query: string | null;
  created_at: number;
  updated_at: number;
  used_at: number | null;
  commands: number;
}

const parseList = (s: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

const view = (r: SecretRow): SecretView => ({
  name: r.name,
  hint: r.hint,
  domains: parseList(r.domains),
  ...(r.commands ? { commands: true } : {}),
  note: r.note,
  ...(r.header ? { header: r.header } : {}),
  ...(r.prefix ? { prefix: r.prefix } : {}),
  ...(r.query ? { query: r.query } : {}),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...(r.used_at ? { usedAt: r.used_at } : {}),
});

export function listSecrets(db: DB): SecretView[] {
  return (db.prepare('select * from conn_secrets order by name').all() as SecretRow[]).map(view);
}

export function secretView(db: DB, name: string): SecretView | null {
  const r = db.prepare('select * from conn_secrets where name = ?').get(name) as SecretRow | undefined;
  return r ? view(r) : null;
}

/** A key and its value, for the server's own use only (http_request). */
export function readSecret(db: DB, name: string): { view: SecretView; value: string } | null {
  const r = db.prepare('select * from conn_secrets where name = ?').get(name) as SecretRow | undefined;
  return r ? { view: view(r), value: unseal(r.value, `secret:${r.name}`) } : null;
}

export interface SecretInput {
  name: string;
  /** A new value (to add, or to rotate); left out to keep the current one. */
  value?: string;
  domains?: unknown;
  /** Whether commands on this computer may have it; left out to keep what it was (off for a new key). */
  commands?: boolean;
  note?: string;
  header?: string | null;
  prefix?: string | null;
  query?: string | null;
}

const HEADER = /^[A-Za-z0-9-]{1,64}$/;

/** Adds a key, or changes one (a value given rotates it). */
export function saveSecret(db: DB, s: SecretInput): SecretView {
  const name = String(s.name ?? '');
  if (!SECRET_NAME.test(name)) throw new HttpError(400, 'Name it with capitals, digits and underscores, like GITHUB_TOKEN');
  const old = db.prepare('select * from conn_secrets where name = ?').get(name) as SecretRow | undefined;
  const value = s.value === undefined ? undefined : String(s.value).trim();
  if (!old && !value) throw new HttpError(400, 'Enter the value');
  if (value !== undefined && !value) throw new HttpError(400, 'The value is empty');
  if (value && value.length > 16_000) throw new HttpError(400, 'That is too long for a key');
  if (value && /[\r\n]/.test(value) && !/^-----BEGIN /.test(value)) throw new HttpError(400, 'A key is one line');
  const header = s.header === undefined ? old?.header ?? null : s.header ? String(s.header).trim() : null;
  if (header && !HEADER.test(header)) throw new HttpError(400, 'A header name has letters, digits and dashes');
  const query = s.query === undefined ? old?.query ?? null : s.query ? String(s.query).trim() : null;
  if (query && !/^[A-Za-z0-9_.-]{1,64}$/.test(query)) throw new HttpError(400, 'A query parameter name has letters, digits, dots, dashes and underscores');
  const prefix = s.prefix === undefined ? old?.prefix ?? null : s.prefix ? String(s.prefix).replace(/[\r\n]/g, '').slice(0, 40) : null;
  const domains = s.domains === undefined ? parseList(old?.domains) : cleanDomains(s.domains);
  const commands = s.commands === undefined ? !!old?.commands : !!s.commands;
  const note = s.note === undefined ? old?.note ?? '' : String(s.note).replace(/\s+/g, ' ').trim().slice(0, 300);
  const now = Date.now();
  db.prepare(
    `insert into conn_secrets (name, value, hint, domains, note, header, prefix, query, created_at, updated_at, commands) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(name) do update set value = excluded.value, hint = excluded.hint, domains = excluded.domains, note = excluded.note,
       header = excluded.header, prefix = excluded.prefix, query = excluded.query, updated_at = excluded.updated_at, commands = excluded.commands`,
  ).run(
    name,
    value ? seal(value, `secret:${name}`) : old!.value,
    value ? maskHint(value) : old!.hint,
    JSON.stringify(domains),
    note,
    header,
    prefix,
    query,
    old?.created_at ?? now,
    value || !old ? now : old.updated_at,
    commands ? 1 : 0,
  );
  invalidateMask();
  return secretView(db, name)!;
}

export function deleteSecret(db: DB, name: string) {
  db.prepare('delete from conn_secrets where name = ?').run(name);
  invalidateMask();
}

export const touchSecret = (db: DB, name: string) => db.prepare('update conn_secrets set used_at = ? where name = ?').run(Date.now(), name);

// ---- an agent asking for a key ------------------------------------------------------------------------

interface RequestRow {
  id: string;
  key: string;
  name: string;
  why: string;
  domains: string;
  state: SecretRequestView['state'];
  created_at: number;
  done_at: number | null;
  fields: string | null;
  commands: number;
}

const parseFields = (s: string | null): SecretField[] => {
  try {
    const v = JSON.parse(s ?? 'null');
    return Array.isArray(v) ? v.filter((f) => f && typeof f.key === 'string' && SECRET_NAME.test(f.key)) : [];
  } catch {
    return [];
  }
};

function requestView(db: DB, r: RequestRow): SecretRequestView {
  const s = secretView(db, r.name);
  const fields = parseFields(r.fields);
  const have: Record<string, string> = {};
  let commandsOn = !!s?.commands;
  for (const f of fields.filter((x) => x.secret)) {
    const k = secretView(db, f.key);
    if (k) have[f.key] = k.hint;
    if (k?.commands) commandsOn = true;
  }
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    why: r.why,
    domains: parseList(r.domains),
    ...(fields.length ? { fields, have } : {}),
    ...(r.commands ? { commands: true } : {}),
    ...(commandsOn ? { commandsOn: true } : {}),
    state: r.state,
    createdAt: r.created_at,
    ...(r.done_at ? { doneAt: r.done_at } : {}),
    exists: !!s,
    ...(s ? { hint: s.hint } : {}),
  };
}

export function addRequest(db: DB, r: { key: string; name: string; why: string; domains: string[]; fields?: SecretField[]; commands?: boolean }): SecretRequestView {
  const id = `sr_${crypto.randomBytes(9).toString('base64url')}`;
  db.prepare('insert into conn_requests (id, key, name, why, domains, state, created_at, fields, commands) values (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    id,
    r.key,
    r.name,
    r.why,
    JSON.stringify(r.domains),
    'pending',
    Date.now(),
    r.fields?.length ? JSON.stringify(r.fields) : null,
    r.commands ? 1 : 0,
  );
  return requestView(db, db.prepare('select * from conn_requests where id = ?').get(id) as RequestRow);
}

export function getRequest(db: DB, id: string): SecretRequestView | null {
  const r = db.prepare('select * from conn_requests where id = ?').get(id) as RequestRow | undefined;
  return r ? requestView(db, r) : null;
}

/** The latest request for `name` in a session (a card finds its own this way). */
export function latestRequest(db: DB, key: string, name: string): SecretRequestView | null {
  const r = db.prepare('select * from conn_requests where key = ? and name = ? order by created_at desc limit 1').get(key, name) as RequestRow | undefined;
  return r ? requestView(db, r) : null;
}

/** Every request still waiting for the user, newest first (the inbox). */
export function pendingRequests(db: DB): SecretRequestView[] {
  return (db.prepare("select * from conn_requests where state = 'pending' order by created_at desc limit 100").all() as RequestRow[]).map((r) => requestView(db, r));
}

/** The hosts the person kept on the card, for the card to show once it is saved. */
export const setRequestDomains = (db: DB, id: string, domains: string[]) => db.prepare('update conn_requests set domains = ? where id = ?').run(JSON.stringify(domains), id);

/** Marks every open request for `name` in the session as answered. */
export function settleRequests(db: DB, key: string, name: string, state: 'saved' | 'dismissed') {
  db.prepare("update conn_requests set state = ?, done_at = ? where key = ? and name = ? and (state = 'pending' or ? = 'saved')").run(state, Date.now(), key, name, state);
}

// ---- masking ------------------------------------------------------------------------------------------

let mask: { find: string; put: string }[] | null = null;
let maskDb: DB | null = null;

export function invalidateMask() {
  mask = null;
}

/** Strings in a sealed app sign-in worth masking: tokens and keys, not dates or names. */
function credStrings(v: unknown, out: string[], depth = 0) {
  if (depth > 4 || v == null) return;
  if (typeof v === 'string') {
    if (v.length >= 8) out.push(v);
  } else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (!/^(token_type|scope|issuer|token_endpoint|revocation_endpoint|resource|auth_method|client_id|expires_at)$/.test(k)) credStrings(x, out, depth + 1);
}

function maskList(): { find: string; put: string }[] {
  if (mask) return mask;
  const db = maskDb;
  const out: { find: string; put: string }[] = [];
  if (!db) return (mask = out);
  const add = (value: string, put: string) => {
    if (value.length < 6) return;
    // As it is, and as it shows in an address (both encodings), in JSON and in base64.
    const forms = new Set([value, encodeURIComponent(value), new URLSearchParams({ v: value }).toString().slice(2), JSON.stringify(value).slice(1, -1)]);
    if (value.length >= 8) forms.add(Buffer.from(value).toString('base64').replace(/=+$/, ''));
    for (const f of forms) out.push({ find: f, put });
  };
  for (const r of db.prepare('select name, value from conn_secrets').all() as { name: string; value: string }[]) {
    try {
      add(unseal(r.value, `secret:${r.name}`), `[secret ${r.name}]`);
    } catch {}
  }
  let apps: { id: string; cred: string }[] = [];
  try {
    apps = db.prepare('select id, cred from conn_apps where cred is not null').all() as { id: string; cred: string }[];
  } catch {}
  for (const a of apps) {
    try {
      const found: string[] = [];
      credStrings(JSON.parse(unseal(a.cred, `app:${a.id}`)), found);
      for (const v of found) add(v, `[${a.id} sign-in]`);
    } catch {}
  }
  // Longest first, so a value inside another is not half masked.
  out.sort((x, y) => y.find.length - x.find.length);
  return (mask = out);
}

/** Where the masking reads the values from. */
export function useMaskDb(db: DB) {
  maskDb = db;
  mask = null;
}

/** `text` with every known secret value replaced by its name. */
export function redact(text: string): string {
  if (!text) return text;
  let t = text;
  for (const m of maskList()) if (t.includes(m.find)) t = t.split(m.find).join(m.put);
  return t;
}

/**
 * `text` with the values a call just used masked by name, shorter ones too (from 4 characters, where
 * redact starts at 6), as they are and as an address, JSON or base64 would carry them.
 */
export function maskUsed(text: string, used: { name: string; value: string }[]): string {
  if (!text) return text;
  const list: { find: string; put: string }[] = [];
  for (const u of used) {
    if (u.value.length < 4) continue;
    const forms = new Set([u.value, encodeURIComponent(u.value), new URLSearchParams({ v: u.value }).toString().slice(2), JSON.stringify(u.value).slice(1, -1)]);
    if (u.value.length >= 8) forms.add(Buffer.from(u.value).toString('base64').replace(/=+$/, ''));
    for (const f of forms) list.push({ find: f, put: `[secret ${u.name}]` });
  }
  list.sort((x, y) => y.find.length - x.find.length);
  let t = text;
  for (const m of list) if (t.includes(m.find)) t = t.split(m.find).join(m.put);
  return t;
}
