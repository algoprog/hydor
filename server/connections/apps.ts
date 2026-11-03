// Connected apps: which ones, their settings, their sign-ins (sealed in the vault), the tools that are
// on, and whether a session gets each one.
import type { CatalogApp, ConnectionStatus, ConnectionView, SessionConnection } from '../../shared/connections.ts';
import type { SessionExtra } from '../../shared/features.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import { catalogApp, fill } from './catalog.ts';
import { OAuthError, refreshTokens, type OAuthClient } from './oauth.ts';
import { invalidateMask, maskHint, seal, unseal } from './vault.ts';

export interface OAuthCred {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  issuer: string;
  resource: string;
  client: OAuthClient;
}

/** An app's sign-in: a remote server's key, a local server's secret fields, or OAuth tokens. */
export interface Cred {
  key?: string;
  secrets?: Record<string, string>;
  oauth?: OAuthCred;
}

interface Row {
  id: string;
  app: string;
  enabled: number;
  status: ConnectionStatus;
  error: string | null;
  fields: string;
  cred: string | null;
  hint: string | null;
  tools: string | null;
  tool_prefs: string;
  tested_at: number | null;
  created_at: number;
  updated_at: number;
}

/** A connected app with its catalog entry (the current one, or as it was when connected). */
export interface Conn {
  id: string;
  entry: CatalogApp;
  /** The catalog has a different server or sign-in for it now: connecting again moves to it. */
  catalogChanged?: boolean;
  enabled: boolean;
  status: ConnectionStatus;
  error?: string;
  fields: Record<string, string>;
  hasCred: boolean;
  hint?: string;
  tools?: { name: string; description?: string }[];
  prefs: Record<string, boolean>;
  testedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export function appTables(db: DB) {
  db.exec(`create table if not exists conn_apps (
    id text primary key, app text not null, enabled integer not null default 1, status text not null default 'untested', error text,
    fields text not null default '{}', cred text, hint text, tools text, tool_prefs text not null default '{}', tested_at integer,
    created_at integer not null, updated_at integer not null
  );
  create table if not exists conn_clients (k text primary key, client text not null, created_at integer not null);`);
}

const json = <T>(s: string | null | undefined, d: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : d;
  } catch {
    return d;
  }
};

/**
 * The entry a connection follows: the catalog's current one, unless its server or sign-in changed since
 * it was connected; a key or token never goes to a new address without the person connecting again.
 */
function entryOf(r: Row): { entry: CatalogApp; changed: boolean } {
  const stored = json<CatalogApp | null>(r.app, null);
  const current = catalogApp(r.id);
  if (!current) return { entry: stored as CatalogApp, changed: false };
  if (!stored) return { entry: current, changed: false };
  const same = JSON.stringify([current.server, current.auth, current.fields?.map((f) => [f.name, !!f.secret])]) === JSON.stringify([stored.server, stored.auth, stored.fields?.map((f) => [f.name, !!f.secret])]);
  return same ? { entry: current, changed: false } : { entry: stored, changed: true };
}

function conn(r: Row): Conn {
  const { entry, changed } = entryOf(r);
  return {
    id: r.id,
    entry,
    ...(changed ? { catalogChanged: true } : {}),
    enabled: !!r.enabled,
    status: r.status,
    ...(r.error ? { error: r.error } : {}),
    fields: json(r.fields, {}),
    hasCred: !!r.cred,
    ...(r.hint ? { hint: r.hint } : {}),
    ...(r.tools ? { tools: json(r.tools, []) } : {}),
    prefs: json(r.tool_prefs, {}),
    ...(r.tested_at ? { testedAt: r.tested_at } : {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const connections = (db: DB): Conn[] => (db.prepare('select * from conn_apps order by created_at').all() as Row[]).map(conn).filter((c) => !!c.entry);

export function connection(db: DB, id: string): Conn | null {
  const r = db.prepare('select * from conn_apps where id = ?').get(id) as Row | undefined;
  const c = r ? conn(r) : null;
  return c?.entry ? c : null;
}

export const isRemote = (a: CatalogApp) => a.server.transport !== 'stdio';

/** Whether an agent gets the tool: the person's choice, else the catalog's default (all when it names none). */
export const toolOn = (c: Conn, name: string) => (Object.hasOwn(c.prefs, name) ? !!c.prefs[name] : c.entry.defaultTools ? c.entry.defaultTools.includes(name) : true);

/**
 * Which tools a bridge lets through, without needing to know them all: `only` those (when the catalog
 * names defaults) and never the ones in `skip`. Null when every tool is on.
 */
export function toolFilter(c: Conn): { only: string[] | null; skip: string[] } | null {
  const skip = Object.entries(c.prefs).filter(([, v]) => !v).map(([k]) => k);
  if (!c.entry.defaultTools && !skip.length) return null;
  const only = c.entry.defaultTools ? [...new Set([...c.entry.defaultTools, ...Object.entries(c.prefs).filter(([, v]) => v).map(([k]) => k)])].filter((n) => !skip.includes(n)) : null;
  return { only, skip };
}

export function view(c: Conn, cred?: Cred): ConnectionView {
  const secretFields = (c.entry.fields ?? []).filter((f) => f.secret && cred?.secrets?.[f.name]).map((f) => f.name);
  return {
    id: c.id,
    name: c.entry.name,
    app: c.entry,
    enabled: c.enabled,
    status: c.status,
    ...(c.error ? { error: c.error } : {}),
    ...(c.hint ? { hint: c.hint } : {}),
    fields: c.fields,
    secretFields,
    ...(c.tools ? { tools: c.tools.map((t) => ({ ...t, on: toolOn(c, t.name) })) } : {}),
    ...(c.catalogChanged ? { catalogChanged: true } : {}),
    ...(c.testedAt ? { testedAt: c.testedAt } : {}),
    ...(cred?.oauth?.expires_at ? { expiresAt: cred.oauth.expires_at } : {}),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function readCred(db: DB, id: string): Cred {
  const r = db.prepare('select cred from conn_apps where id = ?').get(id) as { cred: string | null } | undefined;
  if (!r?.cred) return {};
  return JSON.parse(unseal(r.cred, `app:${id}`)) as Cred;
}

export const connectionView = (db: DB, c: Conn) => view(c, c.hasCred ? safeCred(db, c.id) : undefined);

const safeCred = (db: DB, id: string): Cred | undefined => {
  try {
    return readCred(db, id);
  } catch {
    return undefined;
  }
};

/** Connects an app, or changes how it is connected (new fields, a new key, a new sign-in). */
export function saveConnection(db: DB, entry: CatalogApp, o: { fields?: Record<string, string>; cred?: Cred; hint?: string | null; status?: ConnectionStatus }): Conn {
  const now = Date.now();
  const old = connection(db, entry.id);
  db.prepare(
    `insert into conn_apps (id, app, enabled, status, fields, cred, hint, created_at, updated_at) values (?, ?, 1, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set app = excluded.app, status = excluded.status, error = null, fields = excluded.fields, cred = excluded.cred,
       hint = excluded.hint, updated_at = excluded.updated_at`,
  ).run(
    entry.id,
    JSON.stringify(entry),
    o.status ?? 'untested',
    JSON.stringify(o.fields ?? old?.fields ?? {}),
    o.cred ? seal(JSON.stringify(o.cred), `app:${entry.id}`) : null,
    o.hint === undefined ? old?.hint ?? null : o.hint,
    old?.createdAt ?? now,
    now,
  );
  invalidateMask();
  return connection(db, entry.id)!;
}

export function setCred(db: DB, id: string, cred: Cred) {
  db.prepare('update conn_apps set cred = ?, updated_at = ? where id = ?').run(seal(JSON.stringify(cred), `app:${id}`), Date.now(), id);
  invalidateMask();
}

export function setStatus(db: DB, id: string, status: ConnectionStatus, error?: string) {
  db.prepare('update conn_apps set status = ?, error = ? where id = ?').run(status, error ? error.slice(0, 400) : null, id);
}

export function setTested(db: DB, id: string, tools: { name: string; description?: string }[]) {
  const list = tools.slice(0, 500).map((t) => ({ name: String(t.name).slice(0, 120), ...(t.description ? { description: String(t.description).replace(/\s+/g, ' ').trim().slice(0, 300) } : {}) }));
  db.prepare("update conn_apps set status = 'ok', error = null, tools = ?, tested_at = ? where id = ?").run(JSON.stringify(list), Date.now(), id);
}

export function patchConnection(db: DB, id: string, p: { enabled?: boolean; tools?: Record<string, boolean> }) {
  const c = connection(db, id);
  if (!c) throw new HttpError(404, 'That service is not connected');
  if (p.enabled !== undefined) db.prepare('update conn_apps set enabled = ? where id = ?').run(p.enabled ? 1 : 0, id);
  if (p.tools) {
    const prefs = { ...c.prefs };
    for (const [k, v] of Object.entries(p.tools)) if (typeof v === 'boolean') prefs[String(k).slice(0, 120)] = v;
    db.prepare('update conn_apps set tool_prefs = ? where id = ?').run(JSON.stringify(prefs), id);
  }
  db.prepare('update conn_apps set updated_at = ? where id = ?').run(Date.now(), id);
}

export function removeConnection(db: DB, id: string) {
  db.prepare('delete from conn_apps where id = ?').run(id);
  invalidateMask();
}

// ---- sessions -------------------------------------------------------------------------------------

/** The session's own on/off choices (app id → on). */
export const sessionChoices = (extra: SessionExtra): Record<string, boolean> => {
  const v = extra.connections;
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, boolean>) : {};
};

export const onFor = (c: Conn, extra: SessionExtra) => {
  const choices = sessionChoices(extra);
  return Object.hasOwn(choices, c.id) ? !!choices[c.id] : c.enabled;
};

/** The apps a session's agent gets: on for it, and signed in. */
export const activeFor = (db: DB, extra: SessionExtra) => connections(db).filter((c) => onFor(c, extra) && c.status !== 'signin' && (c.entry.auth.type === 'none' || c.hasCred || c.entry.server.transport === 'stdio'));

export const sessionList = (db: DB, extra: SessionExtra): SessionConnection[] =>
  connections(db).map((c) => ({ id: c.id, name: c.entry.name, on: onFor(c, extra), global: c.enabled, remote: isRemote(c.entry) }));

// ---- what talking to an app takes -------------------------------------------------------------------

/** A remote app's address, its fields filled in. */
export function remoteUrl(c: Conn): string {
  if (c.entry.server.transport === 'stdio') throw new Error('Not a remote service');
  return fill(c.entry.server.url, c.fields);
}

/** A local app's command, arguments and environment (its secret fields from the vault). */
export function localCommand(db: DB, c: Conn): { command: string; args: string[]; env: Record<string, string>; secrets: string[] } {
  const s = c.entry.server;
  if (s.transport !== 'stdio') throw new Error('Not a local service');
  const secrets = readCred(db, c.id).secrets ?? {};
  const values: Record<string, string> = {};
  for (const f of c.entry.fields ?? []) values[f.name] = (f.secret ? secrets[f.name] : c.fields[f.name]) ?? f.default ?? '';
  // An argument that is only an empty optional field is left out.
  const args = (s.args ?? []).flatMap((a) => {
    const v = fill(a, values);
    return !v.trim() && a.includes('{{') ? [] : splitList(a, v);
  });
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(s.env ?? {})) {
    const x = fill(v, values);
    if (x) env[k] = x;
  }
  return { command: s.command, args, env, secrets: Object.values(secrets).filter(Boolean) };
}

/** A field that stands alone as an argument and holds several lines (folders) becomes one argument each. */
function splitList(template: string, value: string): string[] {
  if (/^\{\{[A-Z0-9_]+\}\}$/.test(template.trim()) && value.includes('\n'))
    return value
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean);
  return [value];
}

const refreshing = new Map<string, Promise<OAuthCred>>();

/** The headers that sign requests to a remote app: its key, or an OAuth token (renewed first when it is about to end). */
export async function authHeaders(db: DB, c: Conn, force = false): Promise<Record<string, string>> {
  const a = c.entry.auth;
  if (a.type === 'none') return {};
  const cred = readCred(db, c.id);
  if (a.type === 'api_key') {
    if (!cred.key) throw new HttpError(409, `${c.entry.name} has no key yet`);
    const header = a.header ?? 'Authorization';
    const prefix = a.prefix ?? (header.toLowerCase() === 'authorization' ? 'Bearer ' : '');
    return { [header]: `${prefix}${cred.key}` };
  }
  if (!cred.oauth) throw new HttpError(409, `${c.entry.name} needs signing in`);
  const o = await freshOAuth(db, c, cred.oauth, force);
  return { Authorization: `Bearer ${o.access_token}` };
}

/** The OAuth tokens, renewed when they end within a minute (or `force`); one renewal at a time per app. */
export async function freshOAuth(db: DB, c: Conn, o: OAuthCred, force = false): Promise<OAuthCred> {
  if (!force && (!o.expires_at || o.expires_at - Date.now() > 60_000)) return o;
  if (!o.refresh_token) {
    if (o.expires_at && o.expires_at <= Date.now()) {
      setStatus(db, c.id, 'signin', 'The sign-in ended: connect again');
      throw new HttpError(409, `${c.entry.name}'s sign-in ended: connect it again in Apps → Connected apps`);
    }
    return o;
  }
  let p = refreshing.get(c.id);
  if (!p) {
    p = (async () => {
      try {
        const t = await refreshTokens({ tokenEndpoint: o.token_endpoint, client: o.client, refreshToken: o.refresh_token!, resource: o.resource });
        const next: OAuthCred = { ...o, ...t };
        if (!t.expires_at) delete next.expires_at;
        setCred(db, c.id, { ...readCred(db, c.id), oauth: next });
        if (c.status === 'signin') setStatus(db, c.id, 'untested');
        return next;
      } catch (e) {
        // A refused refresh token will not work again; a network failure might.
        if (e instanceof OAuthError && /invalid_grant|invalid_client|unauthorized_client/.test(e.message)) setStatus(db, c.id, 'signin', 'The sign-in ended: connect again');
        throw e;
      } finally {
        refreshing.delete(c.id);
      }
    })();
    refreshing.set(c.id, p);
  }
  return p;
}

/** Apps whose sign-in ends within `ms`: renewed now, so a quiet app stays signed in. */
export async function renewSoon(db: DB, ms = 10 * 60_000): Promise<string[]> {
  const done: string[] = [];
  for (const c of connections(db)) {
    if (c.entry.auth.type !== 'oauth' || !c.hasCred || c.status === 'signin') continue;
    try {
      const o = readCred(db, c.id).oauth;
      if (o?.refresh_token && o.expires_at && o.expires_at - Date.now() < ms) {
        await freshOAuth(db, c, o, true);
        done.push(c.id);
      }
    } catch (e) {
      console.warn(`[connections] could not renew ${c.id}'s sign-in: ${(e as Error).message}`);
    }
  }
  return done;
}

// ---- clients registered with sign-in servers ----------------------------------------------------------

export function savedClient(db: DB, issuer: string, redirectUri: string): OAuthClient | null {
  const k = `${issuer} ${redirectUri}`;
  const r = db.prepare('select client from conn_clients where k = ?').get(k) as { client: string } | undefined;
  if (!r) return null;
  try {
    return JSON.parse(unseal(r.client, `client:${k}`)) as OAuthClient;
  } catch {
    return null;
  }
}

export function saveClient(db: DB, issuer: string, redirectUri: string, client: OAuthClient) {
  const k = `${issuer} ${redirectUri}`;
  db.prepare('insert into conn_clients (k, client, created_at) values (?, ?, ?) on conflict(k) do update set client = excluded.client, created_at = excluded.created_at').run(
    k,
    seal(JSON.stringify(client), `client:${k}`),
    Date.now(),
  );
  invalidateMask();
}

export const forgetClient = (db: DB, issuer: string, redirectUri: string) => db.prepare('delete from conn_clients where k = ?').run(`${issuer} ${redirectUri}`);

/** A masked hint of what was entered (the key, or the first secret field). */
export const credHint = (cred: Cred) => {
  const v = cred.key ?? Object.values(cred.secrets ?? {})[0];
  return v ? maskHint(v) : null;
};
