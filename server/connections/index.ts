// Connections: apps and services (Notion, Linear, GitHub, a folder on this computer…) signed in once for
// every agent, from a catalog anyone can add to (catalog/connections/), and a vault for keys.
//
//   Apps → Connected apps    the marketplace, the connected services (test, on or off, disconnect), the keys
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
import { listNames } from './run.ts';
import { howToUse, onRequestChange, sessionTools } from './tools.ts';
import { deleteSecret, getRequest, latestRequest, pendingRequests, listSecrets, redact, saveSecret, secretView, setRequestDomains, settleRequests, useMaskDb, vaultTables } from './vault.ts';

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
      `Connected accounts (the user's own, in other services, set up in Apps → Connected apps), each an MCP server of that name: ${apps.map((c) => `${c.id} (${c.entry.name})`).join(', ')}. Use them when a task involves those services.`,
    );
  lines.push(
    'Keys and sign-ins: never ask the user to type a password, token, API key or other secret into the chat, and never print one you come across. When a task needs one, use what is set up already (list_connections shows the vault and the connected accounts; a program on this computer may be signed in already). If it is not there, call request_secret (name, why, domains; fields for a sign-in in several parts; commands: true for use in commands): the user fills in a card, the values go to the vault, and a message tells you when they are saved. You never see them: use them by name, in http_request (auth: NAME, or {{NAME}} in the address, headers or body), in browser_act (a type step with "secret": NAME, to sign in on a site) and in run_with_secrets ($NAME in a command).',
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
  if (!a) throw new HttpError(404, 'There is no such service in the catalog');
  return a;
};

const connOr404 = (d: Deps, id: string): Conn => {
  const c = connection(d.db, id);
  if (!c) throw new HttpError(404, 'That service is not connected');
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
      return reply.redirect(`/apps/connected?flow=${encodeURIComponent(r.flow)}`);
    }
    return reply
      .code(400)
      .header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'")
      .type('text/html; charset=utf-8')
      .send(
        `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hydor</title><body style="font:15px/1.5 system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 20px;color:#222"><p>${(r.error ?? 'Signing in did not finish.').replace(/[<>&]/g, '')}</p><p><a href="/apps/connected">Back to Connected apps</a></p></body>`,
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
    const s = saveSecret(db, {
      name,
      value: String(b.value ?? ''),
      domains: b.domains,
      commands: b.commands === true,
      note: String(b.note ?? ''),
      header: (b.header as string) ?? null,
      prefix: (b.prefix as string) ?? null,
      query: (b.query as string) ?? null,
    });
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
      commands: typeof b.commands === 'boolean' ? b.commands : undefined,
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
    const b = (req.body ?? {}) as { value?: string; values?: Record<string, unknown>; domains?: unknown; commands?: unknown };
    const domains = cleanDomains(b.domains ?? r.domains);
    const commands = typeof b.commands === 'boolean' ? b.commands : undefined;
    const saved: string[] = [];
    let details: [string, string][] = [];
    if (r.fields?.length) {
      // A sign-in: every field is checked before anything is saved, then its keys are saved together.
      const values = b.values && typeof b.values === 'object' ? b.values : {};
      const got = (k: string) => String(values[k] ?? '').trim();
      for (const f of r.fields) {
        const v = got(f.key);
        if (!v && !f.optional && !(f.secret && r.have?.[f.key])) throw new HttpError(400, `Fill in ${f.label}`);
        if (!f.secret && v.length > 1000) throw new HttpError(400, `${f.label} is too long`);
      }
      const secrets = r.fields.filter((f) => f.secret);
      if (!secrets.some((f) => got(f.key) || r.have?.[f.key])) throw new HttpError(400, `Fill in ${(secrets[0] ?? r.fields[0]).label}`);
      details = r.fields.filter((f) => !f.secret && got(f.key)).map((f) => [f.label, got(f.key).replace(/\s+/g, ' ')]);
      const told = details.length ? ` (${details.map(([l, v]) => `${l}: ${v}`).join(', ')})` : '';
      db.transaction(() => {
        for (const f of secrets) {
          const old = secretView(db, f.key);
          if (!got(f.key) && !old) continue;
          saveSecret(db, { name: f.key, value: got(f.key) || undefined, domains, commands, note: old?.note || `${f.label}: ${r.why}${told}`.slice(0, 300) });
          saved.push(f.key);
        }
      })();
    } else {
      const value = String(b.value ?? '').trim();
      saveSecret(db, { name: r.name, value: value || undefined, domains, commands, note: secretView(db, r.name)?.note || r.why.slice(0, 300) });
      saved.push(r.name);
    }
    settleRequests(db, r.key, r.name, 'saved');
    setRequestDomains(db, r.id, domains);
    changed('secrets');
    d.toSubscribers(r.key, { t: 'feature', id: 'connections', key: r.key, data: { changed: 'request' } });
    // The agent hears that they are there and how to use them (never what they are), and gets the details
    // that are not secret as typed.
    const inCommands = saved.some((n) => secretView(db, n)?.commands);
    const at = [domains.length ? `for ${domains.join(', ')}` : '', inCommands ? 'for commands on this computer' : ''].filter(Boolean).join(' and ');
    const text = [
      `${listNames(saved)} ${saved.length > 1 ? 'are' : 'is'} saved in the vault now${at ? `, ${at}` : ''}.`,
      details.length ? `The details that are not secret: ${details.map(([l, v]) => `${l}: ${v}`).join('; ')}.` : '',
      howToUse(saved, domains.length > 0, inCommands),
    ]
      .filter(Boolean)
      .join(' ');
    await d.sessions.deliverOrQueue(r.key, text).catch((e) => console.warn(`[connections] could not tell ${r.key} that ${r.name} was saved: ${(e as Error).message}`));
    return { request: getRequest(db, r.id) };
  });
  app.post('/api/connections/requests/:id/dismiss', async (req) => {
    const r = getRequest(db, (req.params as { id: string }).id);
    if (!r) throw new HttpError(404, 'That request is gone');
    settleRequests(db, r.key, r.name, 'dismissed');
    d.toSubscribers(r.key, { t: 'feature', id: 'connections', key: r.key, data: { changed: 'request' } });
    const what = r.fields?.length ? listNames(r.fields.filter((f) => f.secret).map((f) => f.key)) : r.name;
    await d.sessions.deliverOrQueue(r.key, `I'd rather not give ${what} now. Carry on without it, or tell me what else would work.`).catch(() => {});
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
    // A confidential session reaches no connected app (server/confidential).
    if (s.extra.confidential) return undefined;
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
  // Keys agents asked for that the user has not entered yet (in a session still kept).
  inbox: (d) =>
    pendingRequests(d.db).flatMap((r) => {
      const s = d.sessions.summary(r.key);
      const title = r.fields?.length ? `Asks for a sign-in: ${r.name}` : `Asks for a key: ${r.name}`;
      return s ? [{ id: `key:${r.id}`, kind: 'key' as const, title, detail: r.why, key: r.key, session: s.title, agent: s.agent, at: r.createdAt, path: `/s/${encodeURIComponent(r.key)}` }] : [];
    }),
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
