// Browser sign-ins to the HTTP MCP servers Custom uses (its own, and those it reads from Claude Code's and Codex's
// settings), done with the flow connected apps use (server/connections/connect.ts, oauth.ts). Tokens are kept sealed
// in the vault, one per server address, renewed before they end and when the server refuses them; only a renewal
// that is refused asks the person to sign in again. Agents never see them: the app adds them to requests itself.
import { renewOAuth, type OAuthCred } from '../connections/apps.ts';
import { revoke } from '../connections/oauth.ts';
import { invalidateMask, seal, unseal } from '../connections/vault.ts';
import type { DB } from '../db.ts';

export function signInTables(db: DB) {
  db.exec('create table if not exists conn_mcp (url text primary key, name text not null, cred text not null, ended integer not null default 0, updated_at integer not null)');
}

export interface SignIn {
  url: string;
  name: string;
  /** It could not be renewed: the person signs in again. */
  ended: boolean;
}

/** The sign-in cannot be renewed any more. */
export class SignInEnded extends Error {
  constructor() {
    super('Sign in again: Settings → MCP servers');
  }
}

interface Row {
  url: string;
  name: string;
  cred: string;
  ended: number;
}

const row = (db: DB, url: string) => db.prepare('select * from conn_mcp where url = ?').get(url) as Row | undefined;
const cred = (r: Row): OAuthCred => JSON.parse(unseal(r.cred, `mcp:${r.url}`)) as OAuthCred;

export const signIns = (db: DB): SignIn[] => (db.prepare('select url, name, ended from conn_mcp order by url').all() as Row[]).map((r) => ({ url: r.url, name: r.name, ended: !!r.ended }));

export function signInFor(db: DB, url: string): SignIn | null {
  const r = row(db, url);
  return r ? { url: r.url, name: r.name, ended: !!r.ended } : null;
}

export function saveSignIn(db: DB, url: string, name: string, c: OAuthCred) {
  db.prepare(
    `insert into conn_mcp (url, name, cred, ended, updated_at) values (?, ?, ?, 0, ?)
     on conflict(url) do update set name = excluded.name, cred = excluded.cred, ended = 0, updated_at = excluded.updated_at`,
  ).run(url, name, seal(JSON.stringify(c), `mcp:${url}`), Date.now());
  invalidateMask();
}

const setEnded = (db: DB, url: string) => void db.prepare('update conn_mcp set ended = 1, updated_at = ? where url = ?').run(Date.now(), url);

/** Forgets the sign-in, telling the sign-in server the tokens are no longer wanted when it says how. */
export function removeSignIn(db: DB, url: string) {
  const r = row(db, url);
  if (!r) return;
  try {
    const c = cred(r);
    if (c.revocation_endpoint) void revoke(c.revocation_endpoint, c.client, c.refresh_token ?? c.access_token);
  } catch {}
  db.prepare('delete from conn_mcp where url = ?').run(url);
  invalidateMask();
}

/**
 * The access token for the server at `url`, renewed first when it ends within a minute (or `ahead`). After a 401,
 * `refused` is the token the server would not take: it is renewed (unless that already happened meanwhile). A
 * sign-in that cannot be renewed ends.
 */
export async function accessToken(db: DB, url: string, o: { refused?: string; ahead?: boolean } = {}): Promise<string> {
  const r = row(db, url);
  if (!r) throw new Error('Not signed in');
  if (r.ended) throw new SignInEnded();
  const c = cred(r);
  if (o.refused && c.access_token !== o.refused) return c.access_token;
  // Refused, and nothing to renew it with.
  if (o.refused && !c.refresh_token) {
    setEnded(db, url);
    throw new SignInEnded();
  }
  try {
    const next = await renewOAuth(`mcp:${url}`, c, {
      force: !!o.refused || !!o.ahead,
      // Not over a sign-in removed while the renewal was on its way.
      save: (n) => void (row(db, url) && saveSignIn(db, url, r.name, n)),
      ended: () => setEnded(db, url),
      lapsed: () => new SignInEnded(),
    });
    return next.access_token;
  } catch (e) {
    if (row(db, url)?.ended) throw new SignInEnded();
    throw e;
  }
}

/** Sign-ins that end within `ms`: renewed now, so a quiet server stays signed in. */
export async function renewSignIns(db: DB, ms = 10 * 60_000): Promise<string[]> {
  const done: string[] = [];
  for (const r of db.prepare('select * from conn_mcp where ended = 0').all() as Row[]) {
    try {
      const c = cred(r);
      if (!c.refresh_token || !c.expires_at || c.expires_at - Date.now() >= ms) continue;
      await accessToken(db, r.url, { ahead: true });
      done.push(r.url);
    } catch (e) {
      console.warn(`[mcp] could not renew ${r.name}'s sign-in: ${(e as Error).message}`);
    }
  }
  return done;
}
