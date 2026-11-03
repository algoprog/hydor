// Connecting an app: with nothing to enter, with a key or a few fields, or by signing in in the browser
// (OAuth, the code coming back to this app's own address); and the Test that lists its tools.
import crypto from 'node:crypto';
import os from 'node:os';
import type { CatalogApp } from '../../shared/connections.ts';
import { HttpError } from '../auth.ts';
import type { DB } from '../db.ts';
import {
  authHeaders,
  connection,
  credHint,
  forgetClient,
  localCommand,
  readCred,
  remoteUrl,
  saveClient,
  saveConnection,
  savedClient,
  setStatus,
  setTested,
  type Conn,
  type Cred,
} from './apps.ts';
import { fill } from './catalog.ts';
import { authorizeUrl, discover, exchangeCode, OAuthError, pkce, register, type AuthServer, type OAuthClient } from './oauth.ts';
import { httpTools, sseTools, stdioTools, Unauthorized, type ToolInfo } from './upstream.ts';
import { redact } from './vault.ts';

const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** The fields entered for an app, checked: the ones that are not secret, and the secret ones (kept from before when left blank). */
function readFields(entry: CatalogApp, given: Record<string, unknown> | undefined, old: { fields: Record<string, string>; secrets: Record<string, string> }) {
  const fields: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of entry.fields ?? []) {
    const raw = given?.[f.name];
    const v = raw === undefined || raw === null ? '' : f.secret ? String(raw).trim() : String(raw).replace(/\r/g, '').trim();
    if (v.length > 4000) throw new HttpError(400, `${f.label} is too long`);
    if (f.secret) {
      const keep = v || old.secrets[f.name] || '';
      if (keep) secrets[f.name] = keep;
      else if (!f.optional) throw new HttpError(400, `Enter ${f.label}`);
    } else {
      const val = v || (raw === undefined ? old.fields[f.name] : '') || f.default || '';
      if (val) fields[f.name] = val;
      else if (!f.optional) throw new HttpError(400, `Enter ${f.label}`);
    }
  }
  if (entry.server.transport !== 'stdio') {
    try {
      const u = new URL(fill(entry.server.url, fields));
      if (u.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(u.hostname)) throw new Error();
    } catch {
      throw new HttpError(400, 'That does not make a valid https address');
    }
  }
  return { fields, secrets };
}

const oldOf = (db: DB, id: string) => {
  const c = connection(db, id);
  let cred: Cred = {};
  try {
    cred = c?.hasCred ? readCred(db, id) : {};
  } catch {}
  return { c, cred, fields: c?.fields ?? {}, secrets: cred.secrets ?? {} };
};

/** Connects an app that needs no sign-in in the browser: nothing, a key, or fields. */
export function connectPlain(db: DB, entry: CatalogApp, body: { fields?: Record<string, unknown>; key?: unknown }): Conn {
  if (entry.auth.type === 'oauth') throw new HttpError(400, `${entry.name} signs in in the browser`);
  const old = oldOf(db, entry.id);
  const { fields, secrets } = readFields(entry, body.fields, old);
  const cred: Cred = {};
  if (Object.keys(secrets).length) cred.secrets = secrets;
  if (entry.auth.type === 'api_key' && entry.server.transport !== 'stdio') {
    const key = clip(body.key, 8000) || old.cred.key;
    if (!key) throw new HttpError(400, 'Enter the key');
    if (/[\r\n]/.test(key)) throw new HttpError(400, 'A key is one line');
    cred.key = key;
  }
  return saveConnection(db, entry, { fields, cred: Object.keys(cred).length ? cred : undefined, hint: credHint(cred) });
}

// ---- signing in in the browser ------------------------------------------------------------------------

interface Flow {
  id: string;
  appId: string;
  entry: CatalogApp;
  fields: Record<string, string>;
  verifier: string;
  redirectUri: string;
  client: OAuthClient;
  /** A client this server registered by itself (forgotten if the sign-in server no longer knows it). */
  registered: boolean;
  as: AuthServer;
  resource: string;
  createdAt: number;
}

const FLOW_TTL = 15 * 60_000;
/** Sign-ins under way, by their state (each used once). */
const flows = new Map<string, Flow>();
/** How each ended, by flow id, for the page that started it. */
const results = new Map<string, { app: string; name: string; ok: boolean; error?: string; at: number }>();

function sweep() {
  const now = Date.now();
  for (const [k, f] of flows) if (now - f.createdAt > FLOW_TTL) flows.delete(k);
  for (const [k, r] of results) if (now - r.at > FLOW_TTL) results.delete(k);
}

export const flowResult = (id: string) => results.get(id) ?? null;

/** Starts signing in: returns the address to send the person to. `origin` is where they reach this app. */
export async function startOAuth(db: DB, entry: CatalogApp, o: { origin: string; fields?: Record<string, unknown>; clientId?: string; clientSecret?: string }): Promise<{ url?: string; flow?: string; connected?: Conn }> {
  if (entry.auth.type !== 'oauth' || entry.server.transport === 'stdio') throw new HttpError(400, `${entry.name} does not sign in in the browser`);
  sweep();
  const old = oldOf(db, entry.id);
  const { fields } = readFields(entry, o.fields, old);
  const url = fill(entry.server.url, fields);
  let disc;
  try {
    disc = await discover(url, { expectAuth: true });
  } catch (e) {
    throw new HttpError(502, (e as Error).message);
  }
  // It answers without a sign-in after all.
  if (disc.open) return { connected: saveConnection(db, entry, { fields, hint: null }) };
  const redirectUri = `${o.origin}/connections/callback`;
  const given = clip(o.clientId, 300) || entry.auth.clientId;
  let client: OAuthClient | null = given ? { client_id: given, ...(o.clientSecret ? { client_secret: clip(o.clientSecret, 500), auth_method: 'client_secret_basic' } : { auth_method: 'none' }) } : null;
  let registered = false;
  // A sign-in for this app that never came back: the server may have forgotten the client, so register again.
  const unfinished = [...flows.entries()].filter(([, f]) => f.appId === entry.id && f.registered && f.as.issuer === disc.as.issuer && f.redirectUri === redirectUri);
  if (!client && unfinished.length) {
    forgetClient(db, disc.as.issuer, redirectUri);
    for (const [k] of unfinished) flows.delete(k);
  }
  if (!client) {
    client = savedClient(db, disc.as.issuer, redirectUri);
    registered = true;
    if (!client) {
      try {
        client = await register(disc.as, redirectUri, entry.auth.scopes ?? disc.scopes);
      } catch (e) {
        throw new HttpError(e instanceof OAuthError && /client ID/.test(e.message) ? 409 : 502, (e as Error).message);
      }
      saveClient(db, disc.as.issuer, redirectUri, client);
    }
  }
  const { verifier, challenge } = pkce();
  const state = crypto.randomBytes(32).toString('base64url');
  const flow: Flow = { id: crypto.randomBytes(12).toString('base64url'), appId: entry.id, entry, fields, verifier, redirectUri, client, registered, as: disc.as, resource: disc.resource, createdAt: Date.now() };
  flows.set(state, flow);
  const auth = entry.auth;
  return { url: authorizeUrl({ as: disc.as, client, redirectUri, state, challenge, scopes: auth.scopes ?? disc.scopes, resource: disc.resource, extra: auth.params }), flow: flow.id };
}

/** The sign-in server sent the person back: checks the state (once only), takes the tokens, keeps them sealed. */
export async function finishOAuth(db: DB, q: Record<string, string | undefined>): Promise<{ flow?: string; app?: string; ok: boolean; error?: string }> {
  const state = String(q.state ?? '');
  const f = state ? flows.get(state) : undefined;
  if (f) flows.delete(state);
  if (!f || Date.now() - f.createdAt > FLOW_TTL) return { ok: false, error: 'This sign-in has expired or was already used. Start again from Apps → Connected apps.' };
  const done = (ok: boolean, error?: string) => {
    results.set(f.id, { app: f.appId, name: f.entry.name, ok, ...(error ? { error } : {}), at: Date.now() });
    return { flow: f.id, app: f.appId, ok, ...(error ? { error } : {}) };
  };
  // A different sign-in server answering than the one asked (RFC 9207) is refused.
  if (q.iss && f.as.issuer && ![f.as.issuer, f.as.metadataIssuer].some((i) => i && i.replace(/\/+$/, '') === q.iss!.replace(/\/+$/, '')))
    return done(false, 'The answer came from a different sign-in server than the one asked');
  if (q.error) return done(false, q.error === 'access_denied' ? 'You did not allow access' : `${f.entry.name} said: ${clip(q.error_description || q.error, 200)}`);
  if (!q.code) return done(false, 'No sign-in code came back');
  try {
    const t = await exchangeCode({ tokenEndpoint: f.as.token_endpoint, client: f.client, code: q.code, verifier: f.verifier, redirectUri: f.redirectUri, resource: f.resource });
    const cred: Cred = {
      oauth: { ...t, token_endpoint: f.as.token_endpoint, ...(f.as.revocation_endpoint ? { revocation_endpoint: f.as.revocation_endpoint } : {}), issuer: f.as.issuer, resource: f.resource, client: f.client },
    };
    saveConnection(db, f.entry, { fields: f.fields, cred, hint: null });
    return done(true);
  } catch (e) {
    // The sign-in server forgot the client it registered: register again next time.
    if (f.registered && /invalid_client/.test((e as Error).message)) forgetClient(db, f.as.issuer, f.redirectUri);
    return done(false, `Signing in did not finish: ${(e as Error).message}`);
  }
}

// ---- testing -------------------------------------------------------------------------------------------

/** Connects to the app the way agents will and lists its tools; the outcome is kept as the app's status. */
export async function testConnection(db: DB, c: Conn): Promise<{ tools: ToolInfo[]; server?: string }> {
  try {
    let r: { tools: ToolInfo[]; server?: string };
    if (c.entry.server.transport === 'stdio') {
      const lc = localCommand(db, c);
      r = await stdioTools({ command: lc.command, args: lc.args, env: lc.env, cwd: os.homedir(), mask: redact });
    } else {
      const url = remoteUrl(c);
      const list = c.entry.server.transport === 'sse' ? sseTools : httpTools;
      try {
        r = await list(url, await authHeaders(db, c));
      } catch (e) {
        if (!(e instanceof Unauthorized) || c.entry.auth.type !== 'oauth') throw e;
        r = await list(url, await authHeaders(db, c, true));
      }
    }
    setTested(db, c.id, r.tools);
    return r;
  } catch (e) {
    const unauthorized = e instanceof Unauthorized;
    const m = unauthorized ? (c.entry.auth.type === 'api_key' ? 'The key was refused' : 'The sign-in was refused: connect again') : redact((e as Error).message);
    setStatus(db, c.id, unauthorized && c.entry.auth.type === 'oauth' ? 'signin' : 'error', m);
    throw new HttpError(502, m);
  }
}
