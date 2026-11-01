// Connections: apps and services (Notion, Linear, GitHub, a folder on this computer…) signed in once for
// every agent, from a catalog anyone can add to (catalog/connections/), and a vault for keys.
//
//   Settings → Connections   the marketplace, the connected apps (test, on or off, disconnect), the keys
//   every agent              gets each connected app as an MCP server (relay.ts: no key in its settings),
//                            and request_secret, http_request and list_connections (tools.ts)
//   /connections/callback    where a browser sign-in comes back to, at the app's own address (a phone too)
import path from 'node:path';
import { cleanDomains, CONNECTION_CATEGORIES, SECRET_NAME, secretName, type CatalogApp } from '../../shared/connections.ts';
import { CONSOLE_ID } from '../agents/acp.ts';
import { HttpError } from '../auth.ts';
import { APP_ROOT, config } from '../config.ts';
import type { Deps, Feature, McpServerSpec, SpawnInfo } from '../features/types.ts';
import { runToken } from '../mcp.ts';
import { sessionExtra, setSessionExtra } from '../sessionExtra.ts';
import {
  activeFor,
  appTables,
  connection,
  connections as connected,
  connectionView,
  isRemote,
  patchConnection,
  readCred,
  removeConnection,
  renewSoon,
  sessionChoices,
  sessionList,
  type Conn,
} from './apps.ts';
import { catalog, catalogApp } from './catalog.ts';
import { connectPlain, finishOAuth, flowResult, startOAuth, testConnection } from './connect.ts';
import { revoke } from './oauth.ts';
import { launchSocket, relayRoutes, startLaunchSocket, sweepLinks } from './relay.ts';
import { onRequestChange, sessionTools } from './tools.ts';
import { deleteSecret, getRequest, latestRequest, listSecrets, redact, saveSecret, secretView, settleRequests, useMaskDb, vaultTables } from './vault.ts';

const BRIDGE = path.join(APP_ROOT, 'dist/server/connbridge.js');
const base = () => `http://127.0.0.1:${config.port}/connections`;

/** The MCP server an agent gets for one app. */
export function serverFor(s: Pick<SpawnInfo, 'agent' | 'acpAgent' | 'runId'>, c: Conn): McpServerSpec {
  const token = runToken(s.runId);
  if (isRemote(c.entry)) {
    const url = `${base()}/mcp/${token}/${c.id}`;
    // ACP agents other than Custom may not reach an address themselves: a command carries it for them.
    return s.agent === 'acp' && s.acpAgent !== CONSOLE_ID ? { type: 'stdio', command: process.execPath, args: [BRIDGE, 'relay', url] } : { type: 'http', url };
  }
  // A local app starts through the bridge, so its keys never sit in the agent's settings and the forms it
  // asks for reach the session: its command and keys come over the app's own socket (only this user can
  // open it), over HTTP if that is off.
  const sock = launchSocket();
  return { type: 'stdio', command: process.execPath, args: [BRIDGE, 'launch', ...(sock ? [`unix:${sock}`, `/launch/${token}/${c.id}`] : [`${base()}/launch/${token}/${c.id}`])] };
}

/** What a starting agent is told about its apps and keys. */
function instructions(apps: Conn[]): string {
  const lines: string[] = [];
  if (apps.length)
    lines.push(
      `Connected apps (the user's own accounts, set up in Settings → Connections), each an MCP server of that name: ${apps.map((c) => `${c.id} (${c.entry.name})`).join(', ')}. Use them when a task involves those apps.`,
    );
  lines.push(
    'Keys: never ask the user to type a password, token or API key into the chat. When a task needs one that is not saved, call request_secret (name, why, domains): the user enters it in a card, and a message tells you when it is saved. Call APIs with a saved key through http_request (auth: NAME); list_connections shows what is connected and saved. You never see the values.',
  );
  return lines.join('\n');
}

/** The address the person reaches this app at, from the page that asked (sign-ins come back there). */
function originOf(d: Deps, h: Record<string, unknown>): string {
  const o = String(h.origin ?? '');
  try {
    const u = new URL(o);
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin;
  } catch {}
  return d.publicBase();
}

const entryOr404 = (id: string): CatalogApp => {
  const a = catalogApp(id) ?? null;
  if (!a) throw new HttpError(404, 'There is no such app in the catalog');
  return a;
};

const connOr404 = (d: Deps, id: string): Conn => {
  const c = connection(d.db, id);
  if (!c) throw new HttpError(404, 'That app is not connected');
  return c;
};

function routes(d: Deps) {
  const { app, db } = d;
  vaultTables(db);
  appTables(db);
  useMaskDb(db);
  const changed = (what: 'apps' | 'secrets', id?: string) => d.broadcast({ t: 'feature', id: 'connections', data: { changed: what, ...(id ? { app: id } : {}) } });
  onRequestChange((key) => {
    d.toSubscribers(key, { t: 'feature', id: 'connections', key, data: { changed: 'request' } });
    changed('secrets');
  });
  const views = () => connected(db).map((c) => connectionView(db, c));
  /** Tests in the background; the pages hear when it is done. */
  const testLater = (id: string) => {
    const c = connection(db, id);
    if (c) void testConnection(db, c).then(() => changed('apps', id), () => changed('apps', id));
  };

  app.get('/api/connections/catalog', async () => ({ apps: catalog(), categories: CONNECTION_CATEGORIES }));
  app.get('/api/connections', async () => ({ connections: views(), secrets: listSecrets(db) }));

  // ---- connecting ----
  app.post('/api/connections/:id', async (req) => {
    const entry = entryOr404((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { fields?: Record<string, unknown>; key?: unknown; test?: boolean };
    const c = connectPlain(db, entry, b);
    changed('apps', c.id);
    // A remote app answers quickly; a local one may download first, so it is tested when asked.
    if (isRemote(entry) || b.test) testLater(c.id);
    return { connection: connectionView(db, c) };
  });
  app.post('/api/connections/:id/oauth', async (req) => {
    const entry = entryOr404((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { fields?: Record<string, unknown>; clientId?: string; clientSecret?: string };
    const r = await startOAuth(db, entry, { origin: originOf(d, req.headers), fields: b.fields, clientId: b.clientId, clientSecret: b.clientSecret });
    if (r.connected) {
      changed('apps', entry.id);
      testLater(entry.id);
      return { connection: connectionView(db, r.connected) };
    }
    return { url: r.url, flow: r.flow };
  });
  app.get('/api/connections/flows/:flow', async (req) => ({ result: flowResult((req.params as { flow: string }).flow) }));
  app.post('/api/connections/:id/test', async (req) => {
    const c = connOr404(d, (req.params as { id: string }).id);
    try {
      const r = await testConnection(db, c);
      return { ok: true, tools: r.tools.length, connection: connectionView(db, connOr404(d, c.id)) };
    } catch (e) {
      return { ok: false, error: (e as Error).message, connection: connectionView(db, connOr404(d, c.id)) };
    } finally {
      changed('apps', c.id);
    }
  });
  app.patch('/api/connections/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const b = (req.body ?? {}) as { enabled?: boolean; tools?: Record<string, boolean> };
    patchConnection(db, id, { enabled: typeof b.enabled === 'boolean' ? b.enabled : undefined, tools: b.tools && typeof b.tools === 'object' ? b.tools : undefined });
    changed('apps', id);
    return { connection: connectionView(db, connOr404(d, id)) };
  });
  app.delete('/api/connections/:id', async (req) => {
    const c = connOr404(d, (req.params as { id: string }).id);
    // Tells the sign-in server the tokens are no longer wanted, when it says how.
    try {
      const o = c.hasCred ? readCred(db, c.id).oauth : undefined;
      if (o?.revocation_endpoint) void revoke(o.revocation_endpoint, o.client, o.refresh_token ?? o.access_token);
    } catch {}
    removeConnection(db, c.id);
    changed('apps', c.id);
    return { ok: true };
  });

  // The browser comes back here from signing in (no sign-in cookie on the way: the state is the proof).
  app.get('/connections/callback', async (req, reply) => {
    const r = await finishOAuth(db, req.query as Record<string, string>);
    reply.header('cache-control', 'no-store');
    if (r.flow) {
      changed('apps', r.app);
      if (r.ok && r.app) testLater(r.app);
      return reply.redirect(`/settings?s=connections&flow=${encodeURIComponent(r.flow)}`);
    }
    return reply
      .code(400)
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Naget Agent</title><body style="font:15px/1.5 system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#222"><p>${(r.error ?? 'Signing in did not finish.').replace(/[<>&]/g, '')}</p><p><a href="/settings?s=connections">Back to Connections</a></p></body>`,
      );
  });

  // ---- the session's own choices ----
  app.get('/api/connections/session/:key', async (req) => ({ apps: sessionList(db, sessionExtra(db, (req.params as { key: string }).key)) }));
  app.put('/api/connections/session/:key', async (req) => {
    const key = (req.params as { key: string }).key;
    const b = (req.body ?? {}) as { id?: string; on?: boolean | null };
    const c = connOr404(d, String(b.id ?? ''));
    const choices = { ...sessionChoices(sessionExtra(db, key)) };
    if (typeof b.on === 'boolean' && b.on !== c.enabled) choices[c.id] = b.on;
    else delete choices[c.id];
    const extra = setSessionExtra(db, key, { connections: Object.keys(choices).length ? choices : null });
    d.sessions.queueSummary(key);
    return { apps: sessionList(db, extra) };
  });

  // ---- keys ----
  app.post('/api/connections/secrets', async (req) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = secretName(String(b.name ?? ''));
    if (secretView(db, name)) throw new HttpError(409, `There is a key named ${name} already: rotate it instead`);
    const s = saveSecret(db, { name, value: String(b.value ?? ''), domains: b.domains, note: String(b.note ?? ''), header: (b.header as string) ?? null, prefix: (b.prefix as string) ?? null, query: (b.query as string) ?? null });
    changed('secrets');
    return { secret: s };
  });
  app.patch('/api/connections/secrets/:name', async (req) => {
    const name = (req.params as { name: string }).name;
    if (!secretView(db, name)) throw new HttpError(404, 'There is no key by that name');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const s = saveSecret(db, {
      name,
      value: typeof b.value === 'string' && b.value ? b.value : undefined,
      domains: b.domains,
      note: b.note === undefined ? undefined : String(b.note),
      header: b.header === undefined ? undefined : (b.header as string | null),
      prefix: b.prefix === undefined ? undefined : (b.prefix as string | null),
      query: b.query === undefined ? undefined : (b.query as string | null),
    });
    changed('secrets');
    return { secret: s };
  });
  app.delete('/api/connections/secrets/:name', async (req) => {
    deleteSecret(db, (req.params as { name: string }).name);
    changed('secrets');
    return { ok: true };
  });

  // ---- an agent asked for a key ----
  app.get('/api/connections/requests', async (req) => {
    const q = req.query as { key?: string; name?: string };
    const name = secretName(String(q.name ?? ''));
    return { request: q.key && SECRET_NAME.test(name) ? latestRequest(db, String(q.key), name) : null, secret: SECRET_NAME.test(name) ? secretView(db, name) : null };
  });
  app.post('/api/connections/requests/:id', async (req) => {
    const r = getRequest(db, (req.params as { id: string }).id);
    if (!r) throw new HttpError(404, 'That request is gone');
    const b = (req.body ?? {}) as { value?: string; domains?: unknown };
    const domains = cleanDomains(b.domains ?? r.domains);
    const s = saveSecret(db, { name: r.name, value: String(b.value ?? ''), domains, note: secretView(db, r.name)?.note || r.why.slice(0, 300) });
    settleRequests(db, r.key, r.name, 'saved');
    changed('secrets');
    d.toSubscribers(r.key, { t: 'feature', id: 'connections', key: r.key, data: { changed: 'request' } });
    // The agent hears that it is there (never what it is).
    await d.sessions
      .deliverOrQueue(r.key, `${r.name} is saved in the vault now${s.domains.length ? `, for ${s.domains.join(', ')}` : ''}. Use it with http_request (auth: "${r.name}"); you never see its value.`)
      .catch((e) => console.warn(`[connections] could not tell ${r.key} that ${r.name} was saved: ${(e as Error).message}`));
    return { request: getRequest(db, r.id) };
  });
  app.post('/api/connections/requests/:id/dismiss', async (req) => {
    const r = getRequest(db, (req.params as { id: string }).id);
    if (!r) throw new HttpError(404, 'That request is gone');
    settleRequests(db, r.key, r.name, 'dismissed');
    d.toSubscribers(r.key, { t: 'feature', id: 'connections', key: r.key, data: { changed: 'request' } });
    await d.sessions.deliverOrQueue(r.key, `I'd rather not give ${r.name} now. Carry on without it, or tell me what else would work.`).catch(() => {});
    return { request: getRequest(db, r.id) };
  });

  relayRoutes(d);
  startLaunchSocket(d);
}

export const connections: Feature = {
  id: 'connections',
  routes,
  tools: sessionTools,
  spawn(s, d) {
    const apps = activeFor(d.db, s.extra);
    const mcpServers: Record<string, McpServerSpec> = {};
    for (const c of apps) {
      try {
        mcpServers[c.id] = serverFor(s, c);
      } catch (e) {
        console.warn(`[connections] ${c.id} left out: ${(e as Error).message}`);
      }
    }
    return { mcpServers, instructions: [instructions(apps.filter((c) => mcpServers[c.id]))] };
  },
  scrub: redact,
  start(d) {
    // Sign-ins renew before they end, even for apps no session is using; quiet SSE links close.
    const tick = () => {
      void renewSoon(d.db).then(
        (ids) => ids.length && d.broadcast({ t: 'feature', id: 'connections', data: { changed: 'apps' } }),
        (e) => console.warn(`[connections] renewing sign-ins: ${(e as Error).message}`),
      );
      sweepLinks(d);
    };
    setTimeout(tick, 20_000).unref();
    setInterval(tick, 5 * 60_000).unref();
  },
};
