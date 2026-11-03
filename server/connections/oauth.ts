// Signing in to a remote MCP server the way the MCP specification describes, done by Hydor itself so
// it works from any device: find the server's sign-in server (protected-resource metadata, RFC 9728;
// authorization-server metadata, RFC 8414 or OpenID), register as a client (RFC 7591) unless a client
// id is given, send the person there with PKCE (S256) and the resource named (RFC 8707), take the code
// back at this app's own address, and renew the tokens before they run out.
import crypto from 'node:crypto';

export interface AuthServer {
  /** The issuer as the resource named it (what this server keys its clients by). */
  issuer: string;
  /** The issuer the metadata itself gives, when it differs only in form (Strava's is its bare origin). */
  metadataIssuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
  scopes_supported?: string[];
  code_challenge_methods_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
}

export interface Discovery {
  /** The server answered without a sign-in. */
  open?: boolean;
  /** The resource to ask tokens for (the MCP server's own address). */
  resource: string;
  as: AuthServer;
  /** Scopes the server asks for (its WWW-Authenticate challenge, or its metadata). */
  scopes?: string[];
}

export interface OAuthClient {
  client_id: string;
  client_secret?: string;
  /** How the token endpoint wants the client to prove itself: none, client_secret_basic or client_secret_post. */
  auth_method?: string;
}

export interface Tokens {
  access_token: string;
  token_type?: string;
  refresh_token?: string;
  /** When the access token ends (ms since 1970); none when the server did not say. */
  expires_at?: number;
  scope?: string;
}

export class OAuthError extends Error {}

const TIMEOUT = 20_000;
const UA = { 'user-agent': 'Hydor (+https://github.com/algoprog/hydor)' };

async function getJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { headers: { accept: 'application/json', ...UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

/** The parameters of a WWW-Authenticate Bearer challenge: resource_metadata, scope, error… */
export function challenge(h: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  for (const m of h.matchAll(/([a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g)) out[m[1].toLowerCase()] = (m[2] ?? m[3] ?? '').replace(/\\(.)/g, '$1');
  return out;
}

/** Well-known addresses for `base`, with its path after the well-known part (RFC 8414) and at the root. */
function wellKnown(base: string, name: string): string[] {
  const u = new URL(base);
  const p = u.pathname.replace(/\/+$/, '');
  const out = [`${u.origin}/.well-known/${name}${p}`];
  if (p) out.push(`${u.origin}/.well-known/${name}`);
  return out;
}

const trimSlash = (s: string) => String(s).replace(/\/+$/, '');

/** Whether an issuer answering for `asked` may be trusted: the same, or (a lax but common form) on the same origin. */
export function sameIssuer(asked: string, got: string): boolean {
  if (trimSlash(asked) === trimSlash(got)) return true;
  try {
    return new URL(asked).origin === new URL(got).origin;
  } catch {
    return false;
  }
}

async function authServer(issuer: string, legacy: boolean): Promise<AuthServer> {
  const u = new URL(issuer);
  const p = u.pathname.replace(/\/+$/, '');
  const tries = [`${u.origin}/.well-known/oauth-authorization-server${p}`, `${u.origin}/.well-known/openid-configuration${p}`];
  if (p) tries.push(`${u.origin}${p}/.well-known/openid-configuration`);
  let other = '';
  for (const t of tries) {
    const m = await getJson(t);
    if (!m?.authorization_endpoint || !m?.token_endpoint) continue;
    // Metadata that speaks for another sign-in server is not used (RFC 8414 §3.3).
    if (m.issuer && !sameIssuer(issuer, String(m.issuer))) {
      other = String(m.issuer);
      continue;
    }
    return { ...m, issuer, ...(m.issuer && String(m.issuer) !== issuer ? { metadataIssuer: String(m.issuer) } : {}) };
  }
  if (other) throw new OAuthError(`The sign-in details at ${u.host} name another server (${other}): not signing in there`);
  // The 2025-03-26 specification's fallback: the server's own origin, with the default paths.
  if (legacy) return { issuer: u.origin, authorization_endpoint: `${u.origin}/authorize`, token_endpoint: `${u.origin}/token`, registration_endpoint: `${u.origin}/register` };
  throw new OAuthError(`Could not find how to sign in at ${u.host}`);
}

/**
 * Finds where and how to sign in to the MCP server at `url`. Some servers answer initialize to anyone and
 * want a token only for their tools (Google's): with `expectAuth`, their metadata is looked for anyway.
 */
export async function discover(url: string, o: { headers?: Record<string, string>; expectAuth?: boolean } = {}): Promise<Discovery> {
  const headers = o.headers ?? {};
  let r: Response;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...UA, ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'hydor', version: '1' } } }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch (e) {
    throw new OAuthError(`Could not reach ${new URL(url).host}: ${(e as Error).message}`);
  }
  r.body?.cancel().catch(() => {});
  const ch = challenge(r.headers.get('www-authenticate'));
  const open = r.status !== 401 && r.status !== 403 && r.ok;
  const none = { open: true, resource: url, as: { issuer: '', authorization_endpoint: '', token_endpoint: '' } };
  if (open && !o.expectAuth) return none;
  const scopes = ch.scope ? ch.scope.split(/\s+/).filter(Boolean) : undefined;
  let prm: any = null;
  for (const t of [...(ch.resource_metadata ? [ch.resource_metadata] : []), ...wellKnown(url, 'oauth-protected-resource')]) {
    prm = await getJson(t);
    if (prm?.authorization_servers?.length) break;
    prm = null;
  }
  if (open && !prm) return none;
  // The resource must be this server (its address or a prefix of it, RFC 9728 §3.3): a server naming
  // another service's resource could have its token sent to it.
  if (prm?.resource && !resourceOf(url, String(prm.resource))) throw new OAuthError(`${new URL(url).host} gave sign-in details for another service (${prm.resource}): not signing in`);
  const issuer = prm ? String(prm.authorization_servers[0]) : new URL(url).origin;
  const as = await authServer(issuer, !prm);
  const methods = as.code_challenge_methods_supported;
  if (methods && !methods.includes('S256')) throw new OAuthError(`${new URL(issuer).host} does not offer PKCE (S256), which signing in here needs`);
  return { resource: String(prm?.resource ?? url), as, scopes: scopes ?? (Array.isArray(prm?.scopes_supported) ? prm.scopes_supported.map(String) : undefined) };
}

/** Whether `resource` names the MCP server at `url`: the same origin, and a path that is the server's or a prefix of it. */
export function resourceOf(url: string, resource: string): boolean {
  try {
    const u = new URL(url);
    const r = new URL(resource);
    return u.origin === r.origin && `${trimSlash(u.pathname)}/`.startsWith(`${trimSlash(r.pathname)}/`);
  } catch {
    return false;
  }
}

/** Registers Hydor as a client of the sign-in server, for `redirectUri`. */
export async function register(as: AuthServer, redirectUri: string, scopes?: string[]): Promise<OAuthClient> {
  if (!as.registration_endpoint) throw new OAuthError(`${new URL(as.issuer || as.token_endpoint).host} does not let apps register by themselves: enter a client ID from its developer settings`);
  const r = await fetch(as.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...UA },
    body: JSON.stringify({
      client_name: 'Hydor',
      client_uri: 'https://github.com/algoprog/hydor',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(scopes?.length ? { scope: scopes.join(' ') } : {}),
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch((e) => {
    throw new OAuthError(`Could not register with the sign-in server: ${(e as Error).message}`);
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.client_id) throw new OAuthError(`The sign-in server refused to register Hydor${j.error ? `: ${j.error_description ?? j.error}` : ` (${r.status})`}`);
  return { client_id: String(j.client_id), ...(j.client_secret ? { client_secret: String(j.client_secret) } : {}), auth_method: String(j.token_endpoint_auth_method ?? (j.client_secret ? 'client_secret_basic' : 'none')) };
}

/** A PKCE pair: the verifier stays here, the challenge goes in the sign-in address. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') };
}

export function authorizeUrl(o: { as: AuthServer; client: OAuthClient; redirectUri: string; state: string; challenge: string; scopes?: string[]; resource: string; extra?: Record<string, string> }): string {
  const u = new URL(o.as.authorization_endpoint);
  // The sign-in server's own extras first (Google: access_type=offline), so they cannot replace ours.
  for (const [k, v] of Object.entries(o.extra ?? {})) u.searchParams.set(k, v);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', o.client.client_id);
  u.searchParams.set('redirect_uri', o.redirectUri);
  u.searchParams.set('state', o.state);
  u.searchParams.set('code_challenge', o.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  if (o.scopes?.length) u.searchParams.set('scope', o.scopes.join(' '));
  u.searchParams.set('resource', o.resource);
  return u.toString();
}

/** A call to the token endpoint, with the client's proof of who it is. */
async function tokenCall(tokenEndpoint: string, client: OAuthClient, params: Record<string, string>): Promise<Tokens> {
  const body = new URLSearchParams(params);
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...UA };
  if (client.client_secret && client.auth_method !== 'client_secret_post') {
    headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(client.client_id)}:${encodeURIComponent(client.client_secret)}`).toString('base64')}`;
  } else {
    body.set('client_id', client.client_id);
    if (client.client_secret) body.set('client_secret', client.client_secret);
  }
  let r: Response;
  try {
    // No redirect is followed with the client's secret or a code in hand.
    r = await fetch(tokenEndpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT), redirect: 'manual' });
  } catch (e) {
    throw new OAuthError(`Could not reach the sign-in server: ${(e as Error).message}`);
  }
  const text = await r.text();
  let j: any = {};
  try {
    j = JSON.parse(text);
  } catch {
    j = Object.fromEntries(new URLSearchParams(text));
  }
  if (!r.ok || !j.access_token) {
    const e = new OAuthError(j.error ? `${j.error}${j.error_description ? `: ${j.error_description}` : ''}` : `The sign-in server answered ${r.status}`);
    (e as OAuthError & { code?: string }).code = j.error;
    throw e;
  }
  const exp = Number(j.expires_in);
  return {
    access_token: String(j.access_token),
    ...(j.token_type ? { token_type: String(j.token_type) } : {}),
    ...(j.refresh_token ? { refresh_token: String(j.refresh_token) } : {}),
    ...(exp > 0 ? { expires_at: Date.now() + exp * 1000 } : {}),
    ...(j.scope ? { scope: String(j.scope) } : {}),
  };
}

export const exchangeCode = (o: { tokenEndpoint: string; client: OAuthClient; code: string; verifier: string; redirectUri: string; resource: string }) =>
  tokenCall(o.tokenEndpoint, o.client, { grant_type: 'authorization_code', code: o.code, code_verifier: o.verifier, redirect_uri: o.redirectUri, resource: o.resource });

/** New tokens for a refresh token; the server may hand back a new refresh token too (else the old one stays). */
export async function refreshTokens(o: { tokenEndpoint: string; client: OAuthClient; refreshToken: string; resource?: string }): Promise<Tokens> {
  const t = await tokenCall(o.tokenEndpoint, o.client, { grant_type: 'refresh_token', refresh_token: o.refreshToken, ...(o.resource ? { resource: o.resource } : {}) });
  return { ...t, refresh_token: t.refresh_token ?? o.refreshToken };
}

/** Tells the sign-in server a token is no longer wanted (best effort, RFC 7009). */
export async function revoke(endpoint: string, client: OAuthClient, token: string): Promise<void> {
  const body = new URLSearchParams({ token, client_id: client.client_id });
  if (client.client_secret) body.set('client_secret', client.client_secret);
  await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...UA }, body, signal: AbortSignal.timeout(10_000) }).catch(() => {});
}
