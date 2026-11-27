// The MCP servers Hydor keeps for Custom (Settings → MCP servers), and the browser sign-ins of the HTTP servers
// Custom uses, its own and those of Claude Code's and Codex's settings:
//
//   store.ts     the file of Custom's servers (read by its agent process)
//   signin.ts    the sign-ins, sealed in the vault
//   here         adding, changing and removing a server, checking which connect, signing in and out, and
//                POST /agent/run/:token/mcp: a signed-in server's requests, with the token added (like the
//                connected apps' relay; the run's token is the permission, from this machine only)
import type { McpEntry, McpSpec, McpStatus, SetupResult } from '../../shared/types.ts';
import { McpClient, mcpServers, Unauthorized, type McpDef } from '../agent/mcp.ts';
import { HttpError } from '../auth.ts';
import { config } from '../config.ts';
import { confidentialKey } from '../confidential/index.ts';
import { beginSignIn } from '../connections/connect.ts';
import { originOf } from '../connections/index.ts';
import { discover } from '../connections/oauth.ts';
import { postHttp, type Rpc, Unauthorized as Refused } from '../connections/upstream.ts';
import { redact } from '../connections/vault.ts';
import type { DB } from '../db.ts';
import { agentBaseEnv } from '../env.ts';
import type { Deps, Feature } from '../features/types.ts';
import { runOf } from '../mcp.ts';
import { accessToken, removeSignIn, renewSignIns, saveSignIn, SignInEnded, signInFor, signIns, signInTables } from './signin.ts';
import { addCustom, customStore, names, stored } from './custom.ts';
import { readStore, writeStore } from './store.ts';

export { addCustom, customStore };

/** Every server Custom would load in this folder (its own and the programs'). */
const serversFor = (cwd: string): McpDef[] => mcpServers(cwd, [], { store: customStore() });

/** Tells the agent's file which addresses have a sign-in. */
function syncSignedIn(db: DB) {
  const s = readStore(customStore());
  const urls = signIns(db).map((x) => x.url);
  if (JSON.stringify(urls) !== JSON.stringify(s.signedIn)) writeStore(customStore(), { ...s, signedIn: urls });
}

const signedState = (db: DB, url: string | undefined) => {
  const s = url ? signInFor(db, url) : null;
  return s ? { signedIn: true, ...(s.ended ? { again: true } : {}) } : {};
};

/** Custom's own servers, and the programs' ones it is signed in to (so that you can sign out). */
export function listCustom(db: DB, cwd: string): McpEntry[] {
  const own = Object.entries(readStore(customStore()).servers).map(
    ([name, s]): McpEntry => ({
      agent: 'custom',
      name,
      scope: 'user',
      transport: s.type,
      command: s.command,
      args: s.args,
      url: s.url,
      envKeys: names(s.env),
      headerKeys: names(s.headers),
      ...signedState(db, s.url),
    }),
  );
  const theirs = serversFor(cwd)
    .filter((d) => d.from !== 'custom' && d.type === 'http' && signInFor(db, d.url!))
    .map((d): McpEntry => ({ agent: 'custom', name: d.name, from: d.from as McpEntry['from'], scope: 'user', transport: 'http', url: d.url, headerKeys: names(d.headers), ...signedState(db, d.url) }));
  return [...own, ...theirs];
}

/** Forgets a sign-in no server uses any more (in the home folder, or in `cwd`). */
function prune(db: DB, url: string | undefined, cwd = config.home) {
  if (!url || !signInFor(db, url) || [config.home, cwd].some((f) => serversFor(f).some((d) => d.url === url))) return;
  removeSignIn(db, url);
  syncSignedIn(db);
}

/** Removes a program's server with `remove`, and Custom's sign-in to it if nothing else uses that address. */
export async function removingTheirs<T>(db: DB, name: string, cwd: string, remove: () => Promise<T>): Promise<T> {
  const url = serversFor(cwd).find((d) => d.name === name)?.url;
  const done = await remove();
  prune(db, url, cwd);
  return done;
}

const originFor = (url: string | undefined) => {
  try {
    return new URL(url!).origin;
  } catch {
    return '';
  }
};

/**
 * Changes one of Custom's servers. A variable or header given with an empty value keeps the one saved, but only
 * while it goes where it went: to the same command, or to the same address's site.
 */
export function updateCustom(db: DB, name: string, s: McpSpec) {
  const store = readStore(customStore());
  const old = Object.hasOwn(store.servers, name) ? store.servers[name] : undefined;
  if (!old) throw new HttpError(404, `Custom has no server named ${name}`);
  const next = stored(s);
  const sameTarget =
    next.type === 'stdio'
      ? old.type === 'stdio' && old.command === next.command && JSON.stringify(old.args ?? []) === JSON.stringify(next.args ?? [])
      : old.type !== 'stdio' && originFor(old.url) === originFor(next.url);
  for (const field of ['env', 'headers'] as const) {
    const values = next[field];
    for (const [k, v] of Object.entries(values ?? {})) {
      if (v !== '' || !Object.hasOwn(old[field] ?? {}, k)) continue;
      if (!sameTarget) throw new HttpError(400, next.type === 'stdio' ? `Enter the value of ${k} again: the command changed` : `Enter the value of ${k} again: the address changed`);
      values![k] = old[field]![k];
    }
  }
  store.servers[name] = next;
  writeStore(customStore(), store);
  if (old.url !== next.url) prune(db, old.url);
}

export function removeCustom(db: DB, name: string): SetupResult {
  const store = readStore(customStore());
  if (!Object.hasOwn(store.servers, name)) return { ok: false, output: `Custom has no server named ${name}` };
  const old = store.servers[name];
  delete store.servers[name];
  writeStore(customStore(), store);
  prune(db, old.url);
  return { ok: true, output: `Removed ${name}` };
}

// ---- checking which connect ---------------------------------------------------------------------------

const withoutAuth = (h: Record<string, string> | undefined) => Object.fromEntries(Object.entries(h ?? {}).filter(([k]) => k.toLowerCase() !== 'authorization'));

/** Whether a server that answered 401 says how to sign in (OAuth metadata). */
async function offersSignIn(d: McpDef): Promise<boolean> {
  const disc = await discover(d.url!, { headers: withoutAuth(d.headers), expectAuth: true });
  return !disc.open && !disc.as.guessed;
}

/** Starts one server the way a session of Custom would, and lists its tools. */
async function checkServer(db: DB, d: McpDef, cwd: string): Promise<McpStatus> {
  const base = { name: d.name, transport: d.type, ...(d.url ? { url: d.url } : {}), ...(d.from !== 'custom' ? { from: d.from as McpStatus['from'] } : {}) };
  const tools = async (headers = d.headers) => {
    const c = new McpClient({ ...d, headers, cwd, ...(d.type === 'stdio' ? { baseEnv: agentBaseEnv() } : {}) });
    try {
      await c.connect();
      return c.tools.length;
    } finally {
      c.close();
    }
  };
  const failed = (e: unknown): McpStatus => ({ ...base, state: 'failed', error: redact((e as Error).message).slice(0, 400) });
  const signIn = d.type === 'http' ? signInFor(db, d.url!) : null;
  try {
    const keyed = Object.keys(d.headers ?? {}).some((k) => k.toLowerCase() === 'authorization');
    // Without a sign-in, or with a key of its own to try first.
    if (!signIn || keyed) {
      try {
        return { ...base, state: 'connected', tools: await tools() };
      } catch (e) {
        if (!(e instanceof Unauthorized || e instanceof Refused)) throw e;
        if (!signIn) {
          if (d.type === 'http' && (await offersSignIn(d))) return { ...base, state: 'auth' };
          return failed(new Error('The server refused the request (401): check its headers'));
        }
      }
    }
    const url = d.url!;
    const bearer = (t: string) => ({ ...withoutAuth(d.headers), Authorization: `Bearer ${t}` });
    const token = await accessToken(db, url);
    try {
      return { ...base, state: 'connected', signedIn: true, tools: await tools(bearer(token)) };
    } catch (e) {
      if (!(e instanceof Unauthorized)) throw e;
      return { ...base, state: 'connected', signedIn: true, tools: await tools(bearer(await accessToken(db, url, { refused: token }))) };
    }
  } catch (e) {
    if (e instanceof SignInEnded) return { ...base, state: 'auth', signedIn: true, again: true };
    return failed(e);
  }
}

export async function customStatus(db: DB, cwd: string): Promise<McpStatus[]> {
  return Promise.all(serversFor(cwd).map((d) => checkServer(db, d, cwd)));
}

// ---- signing in and out -------------------------------------------------------------------------------

function httpServer(cwd: string, name: string): McpDef {
  const d = serversFor(cwd).find((x) => x.name === name);
  if (!d) throw new HttpError(404, `Custom has no server named ${name} in that folder`);
  if (d.type !== 'http') throw new HttpError(400, 'Only HTTP servers sign in in the browser');
  return d;
}

const LOCAL = new Set(['127.0.0.1', 'localhost', '[::1]']);

export async function startSignIn(db: DB, o: { name: string; cwd: string; clientId?: string; clientSecret?: string; origin: string; changed: () => void }) {
  const d = httpServer(o.cwd, o.name);
  const url = d.url!;
  const u = new URL(url);
  if (u.protocol !== 'https:' && !LOCAL.has(u.hostname)) throw new HttpError(400, 'Signing in needs an https address');
  const r = await beginSignIn(
    db,
    {
      key: `mcp:${url}`,
      name: d.name,
      url,
      headers: withoutAuth(d.headers),
      clientId: o.clientId,
      clientSecret: o.clientSecret,
      back: '/settings?s=mcp',
      save: (oauth) => {
        saveSignIn(db, url, d.name, oauth);
        syncSignedIn(db);
        o.changed();
      },
    },
    o.origin,
  );
  return r.open ? { open: true } : { url: r.url, flow: r.flow };
}

export function signOut(db: DB, cwd: string, name: string) {
  removeSignIn(db, httpServer(cwd, name).url!);
  syncSignedIn(db);
}

// ---- a signed-in server's requests ----------------------------------------------------------------------

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOP = new Set(['authorization', 'host', 'cookie', 'connection', 'content-length', 'transfer-encoding', 'keep-alive', 'upgrade', 'te', 'trailer']);

function forwarded(h: unknown): Record<string, string> {
  try {
    const j = JSON.parse(Buffer.from(String(h ?? ''), 'base64').toString('utf8'));
    return Object.fromEntries(Object.entries(j).filter(([k, v]) => !HOP.has(k.toLowerCase()) && typeof v === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

function relayRoute(d: Deps) {
  const { db } = d;
  d.app.post('/agent/run/:token/mcp', { bodyLimit: 32 << 20 }, async (req, reply) => {
    const runId = LOOPBACK.has(req.ip) ? runOf((req.params as { token: string }).token) : null;
    const live = runId ? d.sessions.liveByRun(runId) : null;
    if (!live) return reply.code(403).send({ error: 'Not a running agent' });
    // A confidential session reaches nothing outside but its model.
    if (confidentialKey(db, live.key)) return reply.code(403).send({ error: 'A confidential session reaches no outside server' });
    const url = String(req.headers['x-hydor-mcp-url'] ?? '');
    // The token goes only to the address the person signed in to.
    const s = signInFor(db, url);
    if (!s) return reply.code(401).send({ error: 'refused the request: sign in to it, or check its headers, in Settings → MCP servers' });
    const msg = req.body as Rpc;
    const abort = new AbortController();
    reply.raw.on('close', () => !reply.raw.writableEnded && abort.abort());
    const sessionId = String(req.headers['mcp-session-id'] ?? '') || undefined;
    const send = (token: string) => postHttp(url, msg, { ...forwarded(req.headers['x-hydor-mcp-headers']), Authorization: `Bearer ${token}` }, { sessionId, signal: abort.signal, timeoutMs: 600_000 });
    let r;
    try {
      const token = await accessToken(db, url);
      try {
        r = await send(token);
      } catch (e) {
        if (!(e instanceof Refused)) throw e;
        r = await send(await accessToken(db, url, { refused: token }));
      }
    } catch (e) {
      if (e instanceof SignInEnded) {
        changed(d);
        return reply.code(401).send({ error: e.message });
      }
      return reply.code(502).send({ error: redact((e as Error).message).slice(0, 400) });
    }
    if (r.sessionId) reply.header('mcp-session-id', r.sessionId);
    if (msg?.id === undefined || msg.id === null) return reply.code(202).send();
    const answer = r.replies[0];
    if (!answer) return reply.code(r.status >= 400 && r.status !== 401 ? r.status : 502).send({ error: `${new URL(url).host} answered ${r.status}` });
    return reply.type('application/json').send(redact(JSON.stringify(answer)));
  });
}

// ---- the feature --------------------------------------------------------------------------------------

/** The pages hear that a server or a sign-in changed. */
const changed = (d: Deps) => d.broadcast({ t: 'feature', id: 'mcpservers', data: { changed: 'servers' } });

export const mcpServersFeature: Feature = {
  id: 'mcpservers',
  routes(d) {
    const { app, db } = d;
    signInTables(db);
    // A file of Custom's servers that cannot be read is said on the page; it does not stop the app.
    try {
      syncSignedIn(db);
    } catch (e) {
      console.warn(`[mcp] ${(e as Error).message}`);
    }
    const body = (v: unknown) => (v ?? {}) as { name?: unknown; cwd?: unknown; clientId?: unknown; clientSecret?: unknown };
    const folderOf = (v: unknown) => (typeof v === 'string' && v ? v : config.home);
    app.post('/api/setup/mcp/signin', async (req) => {
      const b = body(req.body);
      return startSignIn(db, {
        name: String(b.name ?? ''),
        cwd: folderOf(b.cwd),
        clientId: b.clientId ? String(b.clientId) : undefined,
        clientSecret: b.clientSecret ? String(b.clientSecret) : undefined,
        origin: originOf(d, req.headers),
        changed: () => changed(d),
      });
    });
    app.post('/api/setup/mcp/signout', async (req) => {
      const b = body(req.body);
      signOut(db, folderOf(b.cwd), String(b.name ?? ''));
      changed(d);
      return { ok: true };
    });
    relayRoute(d);
  },
  start(d) {
    // Sign-ins renew before they end, even while no session uses them.
    const tick = () =>
      void renewSignIns(d.db).then(
        (done) => done.length && changed(d),
        (e) => console.warn(`[mcp] renewing sign-ins: ${(e as Error).message}`),
      );
    setTimeout(tick, 25_000).unref();
    setInterval(tick, 5 * 60_000).unref();
  },
};
